import { App, TFile, TFolder, normalizePath } from "obsidian";
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

export type SafetyMode = "safe" | "turbo";

export interface AgentLoopOptions {
    app: App;
    config: LlmConfig;
    userQuery: string;
    chatHistory: ChatMessage[];
    images?: string[];
    executionMode?: ExecutionMode;
    safetyMode?: SafetyMode;
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
            safetyMode = "safe",
            onStepUpdate, 
            onConfirmationRequired,
            maxIterations = 6 
        } = options;
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
                    } catch (e) {}
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
Твоя цель: давать исчерпывающие, глубокие и структурированные ответы.

ИНСТРУКЦИИ И ЭКОНОМИЯ ТОКЕНОВ:
- Если данные предзагружены ниже, используй их и давай итоговый ответ.
- При вызове инструментов сжимай ответы и будь лаконичен.

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

        const prunedHistory = ContextManager.pruneHistory(chatHistory, 6);

        const messages: ChatMessage[] = [
            { role: "system", content: systemPrompt },
            ...prunedHistory.filter(m => m.role !== "system"),
            userMsg
        ];

        // 5. QUICK MODE (Single Direct Turn)
        if (actualMode === "quick") {
            steps.push({
                id: "quick-exec-step",
                type: "thought",
                title: "Прямой отклик (Quick Mode)",
                status: "completed"
            });
            notifySteps();

            const response = await sendChatRequest(config, messages, undefined);
            if (response.usage) {
                totalPromptTokens += response.usage.promptTokens;
                totalCompletionTokens += response.usage.completionTokens;
            }

            const responseText = response.content || "ИИ не вернул текст ответа.";
            return {
                responseText,
                promptTokens: totalPromptTokens,
                completionTokens: totalCompletionTokens,
                executionModeUsed: "quick"
            };
        }

        // 6. AGENT MODE (Multi-Iteration Loop with Tools)
        const tools = defaultToolRegistry.getToolDefinitions();
        let iteration = 0;
        let finalResponseText = "";
        const executedCallsMap: Record<string, number> = {};

        while (iteration < maxIterations) {
            iteration++;
            console.log(`[AgentLoop] Итерация ${iteration}/${maxIterations}`);

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
                    title: "Рассуждение ИИ",
                    detail: response.reasoning,
                    status: "completed"
                });
                notifySteps();
            }

            // A) Native Tool Calls
            if (response.tool_calls && response.tool_calls.length > 0 && !isLastIteration) {
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

                    // Safety Mode Check for Destructive Operations
                    const isDestructive = toolName === "delete_note" || (toolName === "create_note" && toolArgsStr.includes("overwrite"));
                    if (safetyMode === "safe" && isDestructive && onConfirmationRequired) {
                        const approved = await onConfirmationRequired(toolName, toolArgsStr);
                        if (!approved) {
                            trimmedResult = `[ОТМЕНЕНО ПОЛЬЗОВАТЕЛЕМ]: Выполнение действия ${toolName} отменено пользователем в режиме Safe Mode.`;
                            isError = true;
                        }
                    }

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
                    const callId = "text_call_" + Date.now();
                    const callKey = `${parsedTool.name}:${JSON.stringify(parsedTool.args)}`;
                    executedCallsMap[callKey] = (executedCallsMap[callKey] || 0) + 1;

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

                    let trimmedResult = "";
                    let isError = false;

                    if (executedCallsMap[callKey] > 2) {
                        trimmedResult = `[ВНИМАНИЕ СИСТЕМЫ NEI]: Инструмент ${parsedTool.name} уже вызывался с аналогичными параметрами. Сформируйте развернутый финальный ответ.`;
                        isError = true;
                    } else {
                        const execResult = await defaultToolRegistry.executeTool(
                            app,
                            callId,
                            parsedTool.name,
                            JSON.stringify(parsedTool.args)
                        );
                        const rawRes = typeof execResult.result === "string" ? execResult.result : JSON.stringify(execResult.result);
                        trimmedResult = ContextManager.compactText(rawRes, 12000);
                        isError = execResult.isError || false;
                    }
                    const currentStep = steps.find(s => s.id === `tool-${callId}`);
                    if (currentStep) {
                        currentStep.status = isError ? "failed" : "completed";
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
                const rawContent = (response.content || "").trim();

                if (!rawContent && iteration < maxIterations) {
                    // Prompt model to produce the actual response text instead of finishing with empty content
                    messages.push({
                        role: "user",
                        content: "Предоставь подробный, структурированный итоговый ответ с выводами и рекомендациями на основе полученных данных."
                    });
                    continue;
                }

                finalResponseText = rawContent;
                if (!finalResponseText && prefetchedContext) {
                    finalResponseText = `### Анализ данных:\n${prefetchedContext}`;
                } else if (!finalResponseText) {
                    finalResponseText = "Агент завершил обработку вашей задачи.";
                }

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
            finalResponseText = "Агент завершил анализ запроса.";
        }

        return {
            responseText: finalResponseText,
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
            executionModeUsed: "agent"
        };
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
