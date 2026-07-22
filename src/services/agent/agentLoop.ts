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
        const { app, config, userQuery, chatHistory, onStepUpdate, maxIterations = 10 } = options;
        const steps: AgentStep[] = [];

        const notifySteps = () => {
            if (onStepUpdate) onStepUpdate([...steps]);
        };

        // 1. Resolve Vault Context & RAG
        const vaultContext = await resolveContext(app, userQuery, true);
        const memory = await MemoryStore.loadMemory(app);
        const agentsRules = await MemoryStore.loadAgentsRules(app);
        const skills = await SkillsLoader.loadSkills(app);

        // 2. ULTRA-SMART VAULT FOLDER & FILES PRE-FETCHING
        // Find all folders in the Vault dynamically
        let prefetchedFolderContext = "";
        const allFiles = app.vault.getMarkdownFiles();
        const folderMap: Record<string, TFile[]> = {};

        for (const file of allFiles) {
            const parts = file.path.split("/");
            if (parts.length > 1) {
                const folderName = parts[0]; // e.g. "Tasks", "Projects"
                if (!folderMap[folderName]) folderMap[folderName] = [];
                folderMap[folderName].push(file);
            }
        }

        const queryLower = userQuery.toLowerCase();
        const matchedFolderNames: string[] = [];

        for (const folderName of Object.keys(folderMap)) {
            if (queryLower.includes(folderName.toLowerCase()) || 
                queryLower.includes(folderName.toLowerCase().replace(/s$/, ""))) {
                matchedFolderNames.push(folderName);
            }
        }

        // If no direct folder match, check if query contains words like "tasks", "проекты", "заметки"
        if (matchedFolderNames.length === 0 && (queryLower.includes("таск") || queryLower.includes("задач") || queryLower.includes("task"))) {
            const tasksFolder = Object.keys(folderMap).find(f => f.toLowerCase().includes("task") || f.toLowerCase().includes("задач"));
            if (tasksFolder) matchedFolderNames.push(tasksFolder);
        }

        if (matchedFolderNames.length > 0) {
            const prefetchedBlocks: string[] = [];
            for (const folderName of matchedFolderNames) {
                const filesInFolder = folderMap[folderName] || [];
                prefetchedBlocks.push(`=== ПАПКА '${folderName}' (Всего заметок: ${filesInFolder.length}) ===`);
                
                for (const file of filesInFolder) {
                    try {
                        const content = await app.vault.read(file);
                        prefetchedBlocks.push(`--- ЗАМЕТКА: ${file.path} ---\n${content}`);
                    } catch (e: any) {
                        prefetchedBlocks.push(`--- ЗАМЕТКА: ${file.path} (Ошибка чтения) ---`);
                    }
                }
            }

            prefetchedFolderContext = `\n--- АВТОМАТИЧЕСКИ ИНДЕКСИРОВАННЫЕ ЗАМЕТКИ ИЗ ВАУЛТА ---\n${prefetchedBlocks.join("\n\n")}\n`;
            steps.push({
                id: "prefetch-step",
                type: "tool_result",
                title: `Инъецированы заметки из папок: ${matchedFolderNames.join(", ")}`,
                detail: `Загружено файлов: ${matchedFolderNames.reduce((acc, f) => acc + (folderMap[f]?.length || 0), 0)}`,
                status: "completed"
            });
            notifySteps();
        }

        // 3. Build Master Agent System Prompt
        let systemPrompt = `Ты — сверхагентный ИИ-помощник NEI в Obsidian с ПОЛНЫМ ДОСТУПЫМ к заметочнику, веб-поиску и ОС.

КРИТИЧЕСКИ ВАЖНЫЕ ИНСТРУКЦИИ:
1. У ТЕБЯ ЕСТЬ ПОЛНЫЙ ДОСТУП КО ВСЕМ ЗАМЕТКАМ ВАУЛТА! Содержимое папок автоматически инъецируется в твой контекст ниже.
2. НИКОГДА НЕ ПИШИ 'У меня нет доступа к файлам/папке'! Если пользователь просит сгруппировать заметки или сделать сводку — ИСПОЛЬЗУЙ ПЕРЕДАННОЕ СОДЕРЖИМОЕ ЗАМЕТОК НИЖЕ И НАПИШИ ПОЛНЫЙ ИТОГОВЫЙ ТЕКСТ.
3. Если пользователь просит СОЗДАТЬ ЗАМЕТКУ — создай полный текст заметки в Markdown и вызови инструмент \`create_note(path, content)\` или напиши JSON:
   \`\`\`json
   { "tool": "create_note", "arguments": { "path": "Tasks/Сводка задач.md", "content": "..." } }
   \`\`\`
4. Твои доступные инструменты:
   - create_note / edit_note / delete_note / rename_note
   - read_note / read_notes_batch / get_folder_notes
   - web_search / read_web_page
   - execute_terminal_command / execute_obsidian_command
   - save_to_memory / create_agent_skill

ФОРМАТИРОВАНИЕ ОТВЕТА:
- Оформляй ответ в чистом GitHub Flavored Markdown с таблицами, списками, фронтматтером и ссылками [[ИмяЗаметки]].
`;

        if (agentsRules.trim()) {
            systemPrompt += `\n--- ПОЛЬЗОВАТЕЛЬСКИЕ ПРАВИЛА (.nei/AGENTS.md) ---\n${agentsRules}\n`;
        }

        if (memory.learnedFacts.length > 0) {
            systemPrompt += `\n--- ДОЛГОСРОЧНАЯ ПАМЯТЬ АГЕНТА (.nei/memory.json) ---\n${memory.learnedFacts.map(f => `- ${f}`).join("\n")}\n`;
        }

        if (skills.length > 0) {
            systemPrompt += `\n--- ДОСТУПНЫЕ ПОЛЬЗОВАТЕЛЬСКИЕ СКИЛЛЫ (.nei/skills/) ---\n${skills.map(s => `[Скилл: ${s.name}]\nОписание: ${s.description}\nИнструкции:\n${s.instructions}`).join("\n\n")}\n`;
        }

        if (prefetchedFolderContext) {
            systemPrompt += prefetchedFolderContext;
        }

        if (vaultContext.activeNoteTitle) {
            systemPrompt += `\n--- ТЕКУЩАЯ АКТИВНАЯ ЗАМЕТКА ---\nЗаголовок: ${vaultContext.activeNoteTitle}\nСодержимое:\n${vaultContext.activeNoteContent.substring(0, 1500)}\n`;
        }

        const messages: ChatMessage[] = [
            { role: "system", content: systemPrompt },
            ...chatHistory.filter(m => m.role !== "system"),
            { role: "user", content: userQuery }
        ];

        const tools = defaultToolRegistry.getToolDefinitions();
        let iteration = 0;
        let finalResponseText = "";

        while (iteration < maxIterations) {
            iteration++;
            console.log(`[AgentLoop] Итерация ${iteration}/${maxIterations}`);

            const response = await sendChatRequest(config, messages, tools);

            // Handle Reasoning output if present
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
            if (response.tool_calls && response.tool_calls.length > 0) {
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

                    const currentStep = steps.find(s => s.id === stepId);
                    if (currentStep) {
                        currentStep.status = execResult.isError ? "failed" : "completed";
                        currentStep.detail = typeof execResult.result === "string" ? execResult.result.substring(0, 500) : JSON.stringify(execResult.result).substring(0, 500);
                    }
                    notifySteps();

                    messages.push({
                        role: "tool",
                        name: toolName,
                        tool_call_id: toolCall.id,
                        content: typeof execResult.result === "string" ? execResult.result : JSON.stringify(execResult.result)
                    });
                }
            } 
            // B) Fallback: Text-based JSON Tool Call Parser
            else if (response.content && this.containsJsonToolCall(response.content)) {
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
                        title: `Инструмент (Текстовый вызов): ${parsedTool.name}`,
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

                    const currentStep = steps.find(s => s.id === `tool-${callId}`);
                    if (currentStep) {
                        currentStep.status = execResult.isError ? "failed" : "completed";
                        currentStep.detail = typeof execResult.result === "string" ? execResult.result.substring(0, 500) : JSON.stringify(execResult.result).substring(0, 500);
                    }
                    notifySteps();

                    messages.push({
                        role: "user",
                        content: `[Результат работы инструмента ${parsedTool.name}]:\n${typeof execResult.result === "string" ? execResult.result : JSON.stringify(execResult.result)}`
                    });
                    continue;
                } else {
                    finalResponseText = response.content;
                    break;
                }
            } else {
                // No tool call -> Final Response
                finalResponseText = response.content || "Агент завершил задачу.";

                // Automatic Note Creation Fallback:
                // If user asked to create a note and model output contains markdown note body
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

        if (!finalResponseText && iteration >= maxIterations) {
            finalResponseText = "Достигнут лимит итераций выполнения инструментов агента.";
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
        } catch (e) {
            console.log("[AutoCreateNote Error]", e);
        }
    }
}
