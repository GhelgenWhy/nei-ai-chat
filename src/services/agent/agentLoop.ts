import { App, TFile } from "obsidian";
import { ChatMessage, LlmConfig, sendChatRequest } from "../llm";
import { defaultToolRegistry } from "../tools/toolRegistry";
import { MemoryStore } from "../memory/memoryStore";
import { SkillsLoader } from "../skills/skillsLoader";
import { resolveContext } from "../context";

import { IntentRouter, ExecutionMode } from "./intentRouter";
import { ContextManager } from "./contextManager";

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
    images?: string[];
    executionMode?: ExecutionMode;
    onStepUpdate?: (steps: AgentStep[]) => void;
    onConfirmationRequired?: (toolName: string, argsStr: string) => Promise<boolean>;
    maxIterations?: number;
}

export interface AgentLoopResult {
    responseText: string;
    promptTokens: number;
    completionTokens: number;
    executionModeUsed: "quick" | "agent";
}

export class AgentLoop {
    public static async run(options: AgentLoopOptions): Promise<AgentLoopResult> {
        const { 
            app, 
            config, 
            userQuery, 
            chatHistory, 
            images,
            executionMode = "auto", 
            onStepUpdate, 
            onConfirmationRequired,
            maxIterations = 6 
        } = options;
        void onConfirmationRequired;
        const steps: AgentStep[] = [];

        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;

        const notifySteps = () => {
            if (onStepUpdate) onStepUpdate([...steps]);
        };

        // Determine actual execution mode using IntentRouter if set to 'auto'
        let actualMode: "quick" | "agent" = "agent";
        if (executionMode === "quick") {
            actualMode = "quick";
        } else if (executionMode === "agent") {
            actualMode = "agent";
        } else {
            const decision = IntentRouter.classifyIntent(userQuery, Boolean(images && images.length > 0));
            actualMode = decision.mode;
            steps.push({
                id: "intent-routing-step",
                type: "thought",
                title: `Маршрутизация режима: ${actualMode === "quick" ? "Быстрый ответ (Quick)" : "Агентный анализ (Agent)"}`,
                detail: decision.reason,
                status: "completed"
            });
            notifySteps();
        }

        // 1. Resolve Context & Memory
        const vaultContext = await resolveContext(app, userQuery, true);
        const memory = await MemoryStore.loadMemory(app);
        const agentsRules = await MemoryStore.loadAgentsRules(app);
        const skills = await SkillsLoader.loadSkills(app);

        // 2. CONDITIONAL PRE-FETCHING & TOKEN OPTIMIZATION
        let prefetchedContext = "";
        const queryLower = userQuery.toLowerCase();

        // A) Vault Folder Detection (Optimized for tokens: snippet 400 chars max per note)
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

        const matchedFolderNames: string[] = [];
        for (const folderName of Object.keys(folderMap)) {
            if (queryLower.includes(folderName.toLowerCase()) || queryLower.includes(folderName.toLowerCase().replace(/s$/, ""))) {
                matchedFolderNames.push(folderName);
            }
        }

        if (matchedFolderNames.length > 0) {
            const prefetchedBlocks: string[] = [];
            for (const folderName of matchedFolderNames) {
                const filesInFolder = (folderMap[folderName] || []).slice(0, 12); // Limit to top 12 notes max
                prefetchedBlocks.push(`=== ПАПКА '${folderName}' (Заметок: ${filesInFolder.length}) ===`);
                for (const file of filesInFolder) {
                    try {
                        const content = await app.vault.read(file);
                        // Clean frontmatter and truncate to save tokens
                        const cleanText = content.replace(/^---[\s\S]*?---\n?/, "").trim();
                        const snippet = cleanText.length > 400 ? cleanText.substring(0, 400) + "... [обрезано]" : cleanText;
                        prefetchedBlocks.push(`--- ЗАМЕТКА: [[${file.basename}]] (${file.path}) ---\n${snippet}`);
                    } catch {
                        /* ignore file read error */
                    }
                }
            }
            prefetchedContext += `\n--- АВТОМАТИЧЕСКИ ИНДЕКСИРОВАННЫЕ ЗАМЕТКИ ВАУЛТА ---\n${prefetchedBlocks.join("\n\n")}\n`;
            steps.push({
                id: "folder-prefetch-step",
                type: "tool_result",
                title: `Инъецированы заметки папок: ${matchedFolderNames.join(", ")}`,
                detail: `Папок: ${matchedFolderNames.length}`,
                status: "completed"
            });
            notifySteps();
        }

        // 3. Build User Message (with optional images)
        const userMsg: ChatMessage = { role: "user", content: userQuery };
        if (images && images.length > 0) {
            userMsg.images = images;
        }

        // 4. Build System Prompt & Prune History (ContextManager)
        let systemPrompt = `Ты — сверхагентный ИИ-помощник NEI в Obsidian.
Твоя цель: помогать пользователю работать с хранилищем заметок Vault и отвечать на его вопросы.

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА ИСПОЛЬЗОВАНИЯ ИНСТРУМЕНТОВ:
1. Если пользователь просит "создай заметку", "создай папку", "создай файл" или "сохрани": ТЫ ОБЯЗАН ВЫЗВАТЬ ИНСТРУМЕНТ \`create_note(path, content)\`. Не ограничивайся обычным текстовым ответом в чат!
2. Для чтения заметок используй \`read_note\` или \`get_folder_notes\`.
3. При необходимости создать структуру папок (например \`Projects/Subfolder/Note.md\`), инструмент \`create_note\` сам создаст все нужные папки автоматически.

ФОРМАТИРОВАНИЕ ОТВЕТА:
- Чистый GitHub Flavored Markdown с таблицами, списками, цитатами и понятной структурой.
`;

        if (vaultContext.ragContext) {
            systemPrompt += `\n--- СПРАВОЧНЫЙ КОНТЕКСТ ВАУЛТА (RAG) ---\n${vaultContext.ragContext}\n`;
        }

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

        const prunedHistory = ContextManager.pruneHistory(chatHistory, 6);

        const messages: ChatMessage[] = [
            { role: "system", content: systemPrompt },
            ...prunedHistory.filter(m => m.role !== "system"),
            userMsg
        ];

        // 5. QUICK MODE (Single Direct Turn)
        if (actualMode === "quick") {
            try {
                const response = await sendChatRequest(config, messages);
                if (response.usage) {
                    totalPromptTokens += response.usage.promptTokens;
                    totalCompletionTokens += response.usage.completionTokens;
                }
                let responseText = response.content || "";

                if (this.shouldAutoCreateNote(userQuery, responseText)) {
                    await this.attemptAutoCreateNote(app, userQuery, responseText, steps, notifySteps);
                }

                return {
                    responseText,
                    promptTokens: totalPromptTokens,
                    completionTokens: totalCompletionTokens,
                    executionModeUsed: "quick"
                };
            } catch (e: unknown) {
                const err = e as { message?: string };
                throw new Error(`Ошибка вызова Quick LLM: ${err?.message || String(e)}`);
            }
        }

        // 6. AGENT MODE (Multi-step Tool Execution Loop)
        const tools = defaultToolRegistry.getToolDefinitions();
        let iteration = 0;
        let finalResponseText = "";
        let toolCalledCount = 0;
        const executedCallsMap: Record<string, number> = {};

        while (iteration < maxIterations) {
            iteration++;

            const isLastIteration = (iteration === maxIterations);
            const activeTools = isLastIteration ? undefined : tools;

            const response = await sendChatRequest(config, messages, activeTools);
            if (response.usage) {
                totalPromptTokens += response.usage.promptTokens;
                totalCompletionTokens += response.usage.completionTokens;
            }

            if (response.reasoning) {
                steps.push({
                    id: `reasoning-${iteration}`,
                    type: "reasoning",
                    title: `Рассуждения (Шаг ${iteration})`,
                    detail: response.reasoning,
                    status: "completed"
                });
                notifySteps();
            }

            // A) Standard OpenAI / OpenRouter Native Tool Calls
            if (response.tool_calls && response.tool_calls.length > 0 && !isLastIteration) {
                toolCalledCount += response.tool_calls.length;

                messages.push({
                    role: "assistant",
                    content: response.content || "Выполнение вызова инструментов...",
                    tool_calls: response.tool_calls
                });

                for (const toolCall of response.tool_calls) {
                    const toolName = toolCall.function.name;
                    const toolArgsStr = toolCall.function.arguments;
                    const callKey = `${toolName}:${toolArgsStr}`;
                    executedCallsMap[callKey] = (executedCallsMap[callKey] || 0) + 1;

                    const stepId = `tool-${toolCall.id}`;
                    steps.push({
                        id: stepId,
                        type: "tool_call",
                        title: `Инструмент: ${toolName}`,
                        detail: `Аргументы: ${toolArgsStr}`,
                        status: "running"
                    });
                    notifySteps();

                    let trimmedResult = "";
                    let isError = false;

                    if (!trimmedResult) {
                        if (executedCallsMap[callKey] > 2) {
                            trimmedResult = `[ВНИМАНИЕ СИСТЕМЫ NEI]: Этот инструмент (${toolName}) с такими аргументами уже вызывался ${executedCallsMap[callKey] - 1} раза. Повторный вызов отменен. Сформируйте окончательный ответ пользователю на основе уже имеющихся сведений.`;
                            isError = true;
                        } else {
                            const execResult = await defaultToolRegistry.executeTool(
                                app,
                                toolCall.id,
                                toolName,
                                toolArgsStr
                            );
                            const rawRes = typeof execResult.result === "string" ? execResult.result : JSON.stringify(execResult.result);
                            trimmedResult = ContextManager.compactText(rawRes, 12000);
                            isError = execResult.isError || false;
                        }
                    }

                    const currentStep = steps.find(s => s.id === stepId);
                    if (currentStep) {
                        currentStep.status = isError ? "failed" : "completed";
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
                const parsedTool = this.extractJsonToolCall(response.content);
                if (parsedTool) {
                    toolCalledCount++;
                    const callId = "text_call_" + Date.now();
                    const callKey = `${parsedTool.name}:${JSON.stringify(parsedTool.args)}`;
                    executedCallsMap[callKey] = (executedCallsMap[callKey] || 0) + 1;

                    steps.push({
                        id: callId,
                        type: "tool_call",
                        title: `Инструмент (Fallback JSON): ${parsedTool.name}`,
                        detail: JSON.stringify(parsedTool.args),
                        status: "running"
                    });
                    notifySteps();

                    const execResult = await defaultToolRegistry.executeTool(
                        app,
                        callId,
                        parsedTool.name,
                        JSON.stringify(parsedTool.args)
                    );

                    const currentStep = steps.find(s => s.id === callId);
                    if (currentStep) {
                        currentStep.status = execResult.isError ? "failed" : "completed";
                        currentStep.detail = String(execResult.result).substring(0, 300);
                    }
                    notifySteps();

                    messages.push({
                        role: "assistant",
                        content: response.content
                    });
                    messages.push({
                        role: "tool",
                        name: parsedTool.name,
                        tool_call_id: callId,
                        content: String(execResult.result)
                    });
                } else {
                    finalResponseText = response.content;
                    break;
                }
            } 
            // C) Final Text Response
            else {
                finalResponseText = response.content || "";
                break;
            }
        }

        if (toolCalledCount > 0 && this.shouldAutoCreateNote(userQuery, finalResponseText)) {
            await this.attemptAutoCreateNote(app, userQuery, finalResponseText, steps, notifySteps);
        }

        return {
            responseText: finalResponseText || "Агент завершил работу без текстового вывода.",
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
            executionModeUsed: "agent"
        };
    }

    private static containsJsonToolCall(text: string): boolean {
        return /```(?:json)?\s*\{[\s\S]*?"(?:tool|name|function|action)"\s*:/i.test(text) ||
               /<tool_call>/i.test(text);
    }

    private static extractJsonToolCall(text: string): { name: string; args: Record<string, unknown> } | null {
        try {
            const xmlMatch = text.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i);
            const rawJson = xmlMatch ? xmlMatch[1] : text;

            const jsonMatch = rawJson.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i) || rawJson.match(/(\{[\s\S]*?\})/i);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
                const toolName = typeof parsed.tool === "string" ? parsed.tool :
                                 typeof parsed.name === "string" ? parsed.name :
                                 typeof parsed.function === "string" ? parsed.function :
                                 typeof parsed.action === "string" ? parsed.action : undefined;
                if (toolName) {
                    const args = (parsed.arguments || parsed.args || parsed.action_input || {}) as Record<string, unknown>;
                    return {
                        name: toolName,
                        args
                    };
                }
            }
        } catch {
            /* ignore JSON parse error */
        }
        return null;
    }

    private static shouldAutoCreateNote(query: string, responseText: string): boolean {
        const queryLower = query.toLowerCase();
        const isCreateRequest = queryLower.includes("создай") || 
                                queryLower.includes("создать") || 
                                queryLower.includes("напиши заметку") ||
                                queryLower.includes("сохрани") ||
                                queryLower.includes("create note") ||
                                queryLower.includes("save note");
        return isCreateRequest && responseText.length > 30;
    }

    private static async attemptAutoCreateNote(app: App, query: string, responseText: string, steps: AgentStep[], notifySteps: () => void): Promise<void> {
        let notePath = "";

        const folderMatch = query.match(/(?:папке|папку|folder|directory)\s+["']?([a-zA-Z0-9_\-/А-Яа-яЁё ]+?)["']?(?:\s|$)/i);
        const fileMatch = query.match(/(?:заметку|файл|note|file)\s+["']?([a-zA-Z0-9_\-/А-Яа-яЁё ]+?\.md)["']?/i);

        if (fileMatch && fileMatch[1]) {
            notePath = fileMatch[1].trim();
        } else {
            const folder = folderMatch && folderMatch[1] ? folderMatch[1].trim() : "Notes";
            const dateStr = new Date().toISOString().slice(0, 10);
            const titleMatch = query.match(/(?:создай|создать|create|write)\s+(?:заметку|файл|название|note)?\s*["']?([^"'\n,]{3,30})["']?/i);
            let slug = titleMatch && titleMatch[1] ? titleMatch[1].trim().replace(/[^\w\sА-Яа-яЁё-]/g, "") : "New_Note";
            if (slug.length < 3) slug = "New_Note";
            notePath = `${folder}/${slug}_${dateStr}.md`;
        }

        try {
            const execResult = await defaultToolRegistry.executeTool(
                app,
                "auto-create-fallback",
                "create_note",
                JSON.stringify({ path: notePath, content: responseText })
            );

            steps.push({
                id: "auto-create-step",
                type: "tool_result",
                title: `Автоматически создана заметка: ${notePath}`,
                detail: String(execResult.result),
                status: execResult.isError ? "failed" : "completed"
            });
            notifySteps();
        } catch {
            /* ignore auto create error */
        }
    }
}
