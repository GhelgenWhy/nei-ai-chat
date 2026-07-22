import { App, TFile, TFolder, normalizePath } from "obsidian";
import { ChatMessage, LlmConfig, sendChatRequest } from "../llm";
import { defaultToolRegistry } from "../tools/toolRegistry";
import { MemoryStore } from "../memory/memoryStore";
import { SkillsLoader } from "../skills/skillsLoader";
import { resolveContext } from "../context";

export interface AgentStep {
    id: string;
    type: "reasoning" | "tool_call" | "tool_result" | "thought";
    title: string;
    detail?: string;
    status: "running" | "completed" | "failed";
}

export interface AgentLoopOptions {
    app: App;
    config: LlmConfig;
    userQuery: string;
    chatHistory: ChatMessage[];
    onStepUpdate?: (steps: AgentStep[]) => void;
    maxIterations?: number;
}

export class AgentLoop {
    public static async run(options: AgentLoopOptions): Promise<string> {
        const { app, config, userQuery, chatHistory, onStepUpdate, maxIterations = 6 } = options;
        const steps: AgentStep[] = [];

        const notifySteps = () => {
            if (onStepUpdate) onStepUpdate([...steps]);
        };

        // 1. Resolve Context & Memory
        const vaultContext = await resolveContext(app, userQuery, true);
        const memory = await MemoryStore.loadMemory(app);
        const agentsRules = await MemoryStore.loadAgentsRules(app);
        const skills = await SkillsLoader.loadSkills(app);

        // 2. PROACTIVE PRE-FETCHING (Vault Folders + GitHub URLs)
        let prefetchedContext = "";

        // A) GitHub URL Detection
        const githubMatch = userQuery.match(/https?:\/\/github\.com\/([^\/]+)\/([^\s\/\)]+)/i);
        if (githubMatch) {
            const owner = githubMatch[1];
            const repo = githubMatch[2].replace(/\.git$/, "");
            try {
                const ghResult = await defaultToolRegistry.executeTool(
                    app,
                    "gh-prefetch",
                    "analyze_github_repo",
                    JSON.stringify({ repoUrl: `https://github.com/${owner}/${repo}` })
                );

                if (ghResult.result && !ghResult.isError) {
                    prefetchedContext += `\n--- АВТОМАТИЧЕСКИ ИМПОРТИРОВАННЫЕ ДАННЫЕ GITHUB РЕПОЗИТОРИЯ ${owner}/${repo} ---\n${ghResult.result}\n`;
                    steps.push({
                        id: "gh-prefetch-step",
                        type: "tool_result",
                        title: `Импортирован GitHub: ${owner}/${repo}`,
                        detail: "README и описание загружены",
                        status: "completed"
                    });
                    notifySteps();
                }
            } catch (e) {}
        }

        // B) Vault Folder Detection
        const allFiles = app.vault.getMarkdownFiles();
        const folderMap: Record<string, TFile[]> = {};
        for (const file of allFiles) {
            const parts = file.path.split("/");
            if (parts.length > 1) {
                const folderName = parts[0];
                if (!folderMap[folderName]) folderMap[folderName] = [];
                folderMap[folderName].push(file);
            }
        }

        const queryLower = userQuery.toLowerCase();
        const matchedFolderNames: string[] = [];
        for (const folderName of Object.keys(folderMap)) {
            if (queryLower.includes(folderName.toLowerCase()) || queryLower.includes(folderName.toLowerCase().replace(/s$/, ""))) {
                matchedFolderNames.push(folderName);
            }
        }

        if (matchedFolderNames.length > 0) {
            const prefetchedBlocks: string[] = [];
            for (const folderName of matchedFolderNames) {
                const filesInFolder = folderMap[folderName] || [];
                prefetchedBlocks.push(`=== ПАПКА '${folderName}' (Заметок: ${filesInFolder.length}) ===`);
                for (const file of filesInFolder) {
                    try {
                        const content = await app.vault.read(file);
                        const cleanContent = content.length > 1500 ? content.substring(0, 1500) + "... [обрезано]" : content;
                        prefetchedBlocks.push(`--- ЗАМЕТКА: ${file.path} ---\n${cleanContent}`);
                    } catch (e) {}
                }
            }
            prefetchedContext += `\n--- АВТОМАТИЧЕСКИ ИНДЕКСИРОВАННЫЕ ЗАМЕТКИ ВАУЛТА ---\n${prefetchedBlocks.join("\n\n")}\n`;
            steps.push({
                id: "folder-prefetch-step",
                type: "tool_result",
                title: `Инъецированы заметки папок: ${matchedFolderNames.join(", ")}`,
                detail: `Файлов: ${matchedFolderNames.reduce((acc, f) => acc + (folderMap[f]?.length || 0), 0)}`,
                status: "completed"
            });
            notifySteps();
        }

        // 3. Build System Prompt
        let systemPrompt = `Ты — сверхагентный ИИ-помощник NEI в Obsidian.
Твоя цель: давать исчерпывающие, глубокие и структурированные ответы.

ИНСТРУКЦИИ И ЭКОНОМИЯ ТОКЕНОВ:
- Вся необходимая информация из папок ваулта или GitHub репозиториев уже предзагружена в контекст ниже.
- Старайся сформулировать финальный ответ максимально быстро (за 1-2 шага).
- Если нужно вызвать дополнительный инструмент — вызывай его. Если данные уже есть — ДАВАЙ ФИНАЛЬНЫЙ АНАЛИТИЧЕСКИЙ ОТВЕТ СРАЗУ.

ФОРМАТИРОВАНИЕ ОТВЕТА:
- Чистый GitHub Flavored Markdown с таблицами, списками, цитатами и рекомендациями по улучшению проекта.
`;

        if (agentsRules.trim()) {
            systemPrompt += `\n--- ПРАВИЛА ПОЛЬЗОВАТЕЛЯ (.nei/AGENTS.md) ---\n${agentsRules}\n`;
        }

        if (memory.learnedFacts.length > 0) {
            systemPrompt += `\n--- ДОЛГОСРОЧНАЯ ПАМЯТЬ (.nei/memory.json) ---\n${memory.learnedFacts.map(f => `- ${f}`).join("\n")}\n`;
        }

        if (skills.length > 0) {
            systemPrompt += `\n--- СКИЛЛЫ (.nei/skills/) ---\n${skills.map(s => `[Скилл: ${s.name}]\n${s.description}`).join("\n")}\n`;
        }

        if (prefetchedContext) {
            systemPrompt += prefetchedContext;
        }

        const messages: ChatMessage[] = [
            { role: "system", content: systemPrompt },
            ...chatHistory.filter(m => m.role !== "system").slice(-4), // keep only last 4 messages to save tokens
            { role: "user", content: userQuery }
        ];

        const tools = defaultToolRegistry.getToolDefinitions();
        let iteration = 0;
        let finalResponseText = "";
        let hasExecutedTools = false;

        while (iteration < maxIterations) {
            iteration++;
            console.log(`[AgentLoop] Итерация ${iteration}/${maxIterations}`);

            // Force final answer on the last iteration if tools were executed
            const isLastIteration = (iteration === maxIterations);
            const activeTools = isLastIteration ? undefined : tools;

            if (isLastIteration && hasExecutedTools) {
                messages.push({
                    role: "user",
                    content: "Собери всю имеющуюся информацию и выдай подробный итоговый аналитический ответ для пользователя без использования дополнительных инструментов."
                });
            }

            const response = await sendChatRequest(config, messages, activeTools);

            if (response.reasoning) {
                steps.push({
                    id: `reasoning-${iteration}`,
                    type: "reasoning",
                    title: "Рассуждение ИИ",
                    detail: response.reasoning,
                    status: "completed"
                });
                notifySteps();
            }

            // A) Native Tool Calls
            if (response.tool_calls && response.tool_calls.length > 0 && !isLastIteration) {
                hasExecutedTools = true;
                messages.push({
                    role: "assistant",
                    content: response.content || null,
                    tool_calls: response.tool_calls
                });

                for (const toolCall of response.tool_calls) {
                    const toolName = toolCall.function.name;
                    const toolArgsStr = toolCall.function.arguments;

                    const stepId = `tool-${toolCall.id}`;
                    steps.push({
                        id: stepId,
                        type: "tool_call",
                        title: `Инструмент: ${toolName}`,
                        detail: `Аргументы: ${toolArgsStr}`,
                        status: "running"
                    });
                    notifySteps();

                    const execResult = await defaultToolRegistry.executeTool(
                        app,
                        toolCall.id,
                        toolName,
                        toolArgsStr
                    );

                    // Trim result for token savings
                    const rawRes = typeof execResult.result === "string" ? execResult.result : JSON.stringify(execResult.result);
                    const trimmedResult = rawRes.length > 2000 ? rawRes.substring(0, 2000) + "... [содержимое сжато]" : rawRes;

                    const currentStep = steps.find(s => s.id === stepId);
                    if (currentStep) {
                        currentStep.status = execResult.isError ? "failed" : "completed";
                        currentStep.detail = trimmedResult.substring(0, 300);
                    }
                    notifySteps();

                    messages.push({
                        role: "tool",
                        name: toolName,
                        tool_call_id: toolCall.id,
                        content: trimmedResult
                    });
                }
            } 
            // B) Fallback: Text-based JSON Tool Call Parser
            else if (response.content && this.containsJsonToolCall(response.content) && !isLastIteration) {
                hasExecutedTools = true;
                const parsedTool = this.extractJsonToolCall(response.content);
                if (parsedTool) {
                    const callId = "text_call_" + Date.now();
                    messages.push({
                        role: "assistant",
                        content: response.content
                    });

                    steps.push({
                        id: `tool-${callId}`,
                        type: "tool_call",
                        title: `Инструмент: ${parsedTool.name}`,
                        detail: `Аргументы: ${JSON.stringify(parsedTool.args)}`,
                        status: "running"
                    });
                    notifySteps();

                    const execResult = await defaultToolRegistry.executeTool(
                        app,
                        callId,
                        parsedTool.name,
                        JSON.stringify(parsedTool.args)
                    );

                    const rawRes = typeof execResult.result === "string" ? execResult.result : JSON.stringify(execResult.result);
                    const trimmedResult = rawRes.length > 2000 ? rawRes.substring(0, 2000) + "... [содержимое сжато]" : rawRes;

                    const currentStep = steps.find(s => s.id === `tool-${callId}`);
                    if (currentStep) {
                        currentStep.status = execResult.isError ? "failed" : "completed";
                        currentStep.detail = trimmedResult.substring(0, 300);
                    }
                    notifySteps();

                    messages.push({
                        role: "user",
                        content: `[Результат инструмента ${parsedTool.name}]:\n${trimmedResult}`
                    });
                    continue;
                } else {
                    finalResponseText = response.content;
                    break;
                }
            } else {
                // Final answer reached
                finalResponseText = response.content || "Агент завершил анализ.";

                if (this.shouldAutoCreateNote(userQuery, finalResponseText)) {
                    await this.attemptAutoCreateNote(app, userQuery, finalResponseText, steps, notifySteps);
                }

                messages.push({
                    role: "assistant",
                    content: finalResponseText
                });
                break;
            }
        }

        if (!finalResponseText) {
            finalResponseText = "Агент завершил обработку данных.";
        }

        return finalResponseText;
    }

    private static containsJsonToolCall(text: string): boolean {
        return /\{\s*["']tool["']\s*:\s*["'][^"']+["']/i.test(text);
    }

    private static extractJsonToolCall(text: string): { name: string; args: any } | null {
        try {
            const jsonMatch = text.match(/```(?:json)?\s*(\{\s*["']tool["'][\s\S]*?\})\s*```/i) || text.match(/(\{\s*["']tool["'][\s\S]*?\})/i);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[1]);
                if (parsed.tool) {
                    return {
                        name: parsed.tool,
                        args: parsed.arguments || parsed.args || {}
                    };
                }
            }
        } catch (e) {}
        return null;
    }

    private static shouldAutoCreateNote(query: string, responseText: string): boolean {
        const queryLower = query.toLowerCase();
        const isCreateRequest = queryLower.includes("создай заметку") || queryLower.includes("создать заметку") || queryLower.includes("сгруппируй все таски в заметку");
        return isCreateRequest && (responseText.includes("# ") || responseText.includes("---"));
    }

    private static async attemptAutoCreateNote(app: App, query: string, responseText: string, steps: AgentStep[], notifySteps: () => void): Promise<void> {
        let notePath = "Tasks/Сводка задач.md";
        if (query.toLowerCase().includes("проекты") || query.toLowerCase().includes("projects")) {
            notePath = "Projects/Сводка проектов.md";
        }

        try {
            const execResult = await defaultToolRegistry.executeTool(
                app,
                "auto-create-1",
                "create_note",
                JSON.stringify({ path: notePath, content: responseText })
            );

            steps.push({
                id: "auto-create-step",
                type: "tool_result",
                title: `Авто-создана заметка: ${notePath}`,
                detail: String(execResult.result),
                status: execResult.isError ? "failed" : "completed"
            });
            notifySteps();
        } catch (e) {}
    }
}
