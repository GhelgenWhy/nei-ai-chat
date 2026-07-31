import { App } from "obsidian";
import { ChatMessage, LlmConfig, sendChatRequest, sendChatRequestStream, getModelTemporalInfo } from "../llm";
import { MemoryStore } from "../memory/memoryStore";
import { SkillsLoader } from "../skills/skillsLoader";
import { resolveContext } from "../context";
import { ToolRegistry } from "../tools/toolRegistry";
import { SupportedLanguage, t } from "../../i18n/translations";
import { NeiAiChatSettings } from "../../../main";
import { searchVaultLexical } from "../rag";
import { searchVaultHybrid } from "../rag/vectorIndex";

import { IntentRouter, ExecutionMode } from "./intentRouter";
import { ContextManager } from "./contextManager";

export interface AgentStep {
    id: string;
    type: "reasoning" | "tool_call" | "tool_result" | "thought";
    title: string;
    detail?: string;
    status: "running" | "completed" | "failed";
    meta?: Record<string, unknown>;
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
    onStreamChunk?: (chunk: string) => void;
    maxIterations?: number;
    toolRegistry: ToolRegistry;
    language?: SupportedLanguage;
    settings: NeiAiChatSettings;
}

export interface AgentLoopResult {
    responseText: string;
    promptTokens: number;
    completionTokens: number;
    executionModeUsed: "quick" | "agent";
}

export class AgentLoop {
    private static promptCache: Map<string, { prompt: string; timestamp: number }> = new Map();

    private static getSystemPrompt(
        language: SupportedLanguage,
        userQuery: string,
        vaultContext: { ragContext?: string },
        agentsRules: string,
        memory: { learnedFacts: string[] },
        skills: Array<{ name: string; description: string }>,
        prefetchedContext: string,
        settings: NeiAiChatSettings,
        modelId: string
    ): string {
        const cacheKey = `${language}|${vaultContext.ragContext?.length || 0}|${agentsRules.length}|${memory.learnedFacts.length}|${skills.length}|${prefetchedContext.length}|${settings.memoryFile}|${modelId}`;
        const cached = this.promptCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 30000) {
            return cached.prompt;
        }

        const isRu = language === "ru" || (language === "auto" && /[а-яА-ЯёЁ]{3,}/.test(userQuery));
        let systemPrompt = isRu ? t("systemPromptRu", language) : t("systemPromptEn", language);

        if (settings.enableTemporalAwareness) {
            const temporalInfo = getModelTemporalInfo(modelId);
            const cutoffDate = temporalInfo.knowledgeCutoff;
            const today = new Date().toISOString().split('T')[0];

            let freshnessDirective = `\n--- TEMPORAL AWARENESS ---\n`;
            freshnessDirective += `Current Date: ${today}\n`;
            freshnessDirective += `Your Knowledge Cutoff: ${cutoffDate}\n`;
            freshnessDirective += `Days Since Cutoff: ${Math.floor((Date.now() - new Date(cutoffDate).getTime()) / (1000 * 60 * 60 * 24))}\n`;

            if (temporalInfo.supportsWebSearch) {
                freshnessDirective += `⚠️ CRITICAL: For questions about events, prices, data, or facts after ${cutoffDate}, `;
                freshnessDirective += `you MUST use available tools (web_search, read_web_page) to get current information.\n`;
                freshnessDirective += `Do NOT rely on training data for time-sensitive queries.\n`;
            } else {
                freshnessDirective += `⚠️ WARNING: This model cannot access live data. For time-sensitive queries, `;
                freshnessDirective += `explicitly state your knowledge cutoff and recommend user to verify externally.\n`;
            }
            freshnessDirective += `------------------------\n`;

            systemPrompt += freshnessDirective;
        }

        if (vaultContext.ragContext) {
            systemPrompt += `\n--- VAULT CONTEXT (RAG) ---\n${vaultContext.ragContext}\n`;
        }

        if (agentsRules.trim()) {
            systemPrompt += `\n--- USER RULES (${settings.memoryFile}) ---\n${agentsRules}\n`;
        }

        if (memory.learnedFacts.length > 0) {
            systemPrompt += `\n--- LONG-TERM MEMORY (${settings.memoryFile}) ---\n${memory.learnedFacts.map(f => `- ${f}`).join("\n")}\n`;
        }

        if (skills.length > 0) {
            systemPrompt += `\n--- AGENT SKILLS (${settings.skillsFolder}/) ---\n${skills.map(s => `[Skill: ${s.name}]\n${s.description}`).join("\n")}\n`;
        }

        if (prefetchedContext) {
            systemPrompt += prefetchedContext;
        }

        this.promptCache.set(cacheKey, { prompt: systemPrompt, timestamp: Date.now() });
        return systemPrompt;
    }

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
            onStreamChunk,
            maxIterations,
            toolRegistry,
            language = "auto",
            settings
        } = options;
        const steps: AgentStep[] = [];

        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;

        const notifySteps = () => {
            if (onStepUpdate) onStepUpdate([...steps]);
        };

        const features = IntentRouter.extractFeatures(userQuery, Boolean(images && images.length > 0), chatHistory, config.model);
        const toolNeeds = IntentRouter.classifyToolNeeds(userQuery, features, config.model);

        // Determine actual execution mode using IntentRouter if set to 'auto'
        let actualMode: "quick" | "agent" = "agent";
        if (executionMode === "quick") {
            actualMode = "quick";
        } else if (executionMode === "agent") {
            actualMode = "agent";
        } else {
            const decision = IntentRouter.classifyIntent(userQuery, Boolean(images && images.length > 0), language, chatHistory, settings);
            actualMode = decision.mode;
            steps.push({
                id: "intent-routing-step",
                type: "thought",
                title: `Mode: ${actualMode === "quick" ? "Quick" : "Agent"}`,
                detail: decision.reason,
                status: "completed",
                meta: { confidence: decision.confidence, features }
            });
            notifySteps();
        }

        // 1. Resolve Context & Memory
        const vaultContext = await resolveContext(app, userQuery, true);
        const memory = await MemoryStore.loadMemory(app, settings);
        const agentsRules = await MemoryStore.loadAgentsRules(app, settings);
        const skills = await SkillsLoader.loadSkills(app, settings);

        // 2. Semantic Folder & Vault Prefetching via RAG (Adaptive / Hybrid)
        let prefetchedContext = "";
        const shouldPrefetchVault = settings.enableAdaptivePrefetch
            ? (toolNeeds.needsVaultSearch && actualMode === "agent")
            : (actualMode === "agent");

        if (shouldPrefetchVault) {
            const searchResults = settings.enableSemanticRag
                ? await searchVaultHybrid(app, userQuery, settings, settings.maxPrefetchedNotes)
                : await searchVaultLexical(app, userQuery, settings.maxPrefetchedNotes, settings.prefetchSnippetLength);

            if (searchResults.length > 0) {
                const prefetchedBlocks: string[] = [];
                const matchedFoldersSet = new Set<string>();

                for (const res of searchResults) {
                    const abstractFile = res.file;
                    const folderName = abstractFile.parent?.name || "Vault";
                    if (folderName) {
                        matchedFoldersSet.add(folderName);
                    }
                    const cleanContent = res.content.replace(/^---[\s\S]*?---\n?/, "").trim();
                    const snippet = cleanContent.length > settings.prefetchSnippetLength ? cleanContent.substring(0, settings.prefetchSnippetLength) + "... [обрезано]" : cleanContent;
                    prefetchedBlocks.push(`--- NOTE: [[${abstractFile.basename}]] (${abstractFile.path}) ---\n${snippet}`);
                }

                const matchedFoldersArr = Array.from(matchedFoldersSet);
                prefetchedContext += `\n${t("autoIndexedVaultNotes", language)}\n${prefetchedBlocks.join("\n\n")}\n`;
                steps.push({
                    id: "folder-prefetch-step",
                    type: "tool_result",
                    title: t("folderPrefetchTitle", language, { folders: matchedFoldersArr.join(", ") || "Vault" }),
                    detail: t("folderPrefetchDetail", language, { count: matchedFoldersArr.length.toString() }),
                    status: "completed"
                });
                notifySteps();
            }
        }

        // 3. Build User Message (with optional images)
        const userMsg: ChatMessage = { role: "user", content: userQuery };
        if (images && images.length > 0) {
            userMsg.images = images;
        }

        // 4. Build System Prompt & Prune History (ContextManager)
        const systemPrompt = this.getSystemPrompt(language, userQuery, vaultContext, agentsRules, memory, skills, prefetchedContext, settings, config.model);

        const prunedHistory = ContextManager.pruneHistory(chatHistory, 6);

        const messages: ChatMessage[] = [
            { role: "system", content: systemPrompt },
            ...prunedHistory.filter(m => m.role !== "system"),
            userMsg
        ];

        // 5. QUICK MODE (Single Direct Turn with optional Streaming)
        if (actualMode === "quick") {
            try {
                const response = (settings.enableStreaming && onStreamChunk)
                    ? await sendChatRequestStream(config, messages, undefined, onStreamChunk)
                    : await sendChatRequest(config, messages);

                if (response.usage) {
                    totalPromptTokens += response.usage.promptTokens;
                    totalCompletionTokens += response.usage.completionTokens;
                }
                const responseText = response.content || "";

                if (this.shouldAutoCreateNote(userQuery, responseText)) {
                    await this.attemptAutoCreateNote(app, userQuery, responseText, steps, notifySteps, toolRegistry, language);
                }

                return {
                    responseText,
                    promptTokens: totalPromptTokens,
                    completionTokens: totalCompletionTokens,
                    executionModeUsed: "quick"
                };
            } catch (e: unknown) {
                const err = e as { message?: string };
                throw new Error(t("quickLlmError", language, { error: err?.message || String(e) }));
            }
        }

        // 6. AGENT MODE (Multi-step Tool Execution Loop)
        const allTools = toolRegistry.getToolDefinitions();
        let filteredTools = allTools;

        if (settings.enableSmartToolFiltering) {
            if (toolNeeds.needsWebSearch && !toolNeeds.needsVaultSearch && !toolNeeds.needsVaultWrite) {
                filteredTools = allTools.filter(t =>
                    ["web_search", "read_web_page", "analyze_github_repo"].includes(t.function.name)
                );
            } else if (!toolNeeds.needsWebSearch && (toolNeeds.needsVaultSearch || toolNeeds.needsVaultWrite)) {
                filteredTools = allTools.filter(t =>
                    t.function.name.startsWith("read_") ||
                    t.function.name.startsWith("get_") ||
                    t.function.name.startsWith("search_") ||
                    t.function.name.startsWith("create_") ||
                    t.function.name.startsWith("edit_") ||
                    t.function.name.startsWith("rename_") ||
                    t.function.name.startsWith("delete_") ||
                    t.function.name.startsWith("list_") ||
                    t.function.name.startsWith("diff_")
                );
            }
        }

        let iteration = 0;
        let finalResponseText = "";
        let toolCalledCount = 0;
        const executedCallsMap: Record<string, number> = {};
        const effectiveMaxIterations = maxIterations ?? settings.maxAgentIterations;

        while (iteration < effectiveMaxIterations) {
            iteration++;

            const isLastIteration = (iteration === effectiveMaxIterations);
            const activeTools = isLastIteration ? undefined : filteredTools;

            // Stream the final response in agent mode (last iteration or no tools)
            const useStreaming = isLastIteration && settings.enableStreaming && onStreamChunk;
            const response = useStreaming
                ? await sendChatRequestStream(config, messages, undefined, onStreamChunk)
                : await sendChatRequest(config, messages, activeTools);
            if (response.usage) {
                totalPromptTokens += response.usage.promptTokens;
                totalCompletionTokens += response.usage.completionTokens;
            }

            if (response.reasoning) {
                steps.push({
                    id: `reasoning-${iteration}`,
                    type: "reasoning",
                    title: `${t("agentReasoningLog", language)} (${iteration})`,
                    detail: response.reasoning,
                    status: "completed"
                });
                notifySteps();
            }

            // A) Standard OpenAI / OpenRouter Native Tool Calls (Parallel Execution - FUNC-03)
            if (response.tool_calls && response.tool_calls.length > 0 && !isLastIteration) {
                toolCalledCount += response.tool_calls.length;

                messages.push({
                    role: "assistant",
                    content: response.content || "Executing tool calls...",
                    tool_calls: response.tool_calls
                });

                const toolPromises = response.tool_calls.map(async (toolCall) => {
                    const toolName = toolCall.function.name;
                    const toolArgsStr = toolCall.function.arguments;
                    const callKey = `${toolName}:${toolArgsStr}`;
                    executedCallsMap[callKey] = (executedCallsMap[callKey] || 0) + 1;

                    const stepId = `tool-${toolCall.id}`;
                    steps.push({
                        id: stepId,
                        type: "tool_call",
                        title: `Tool: ${toolName}`,
                        detail: `Args: ${toolArgsStr}`,
                        status: "running"
                    });
                    notifySteps();

                    let trimmedResult = "";
                    let isError = false;

                    // Safety check for dangerous Obsidian commands
                    if (toolName === "execute_obsidian_command" && settings.confirmObsidianCommands && onConfirmationRequired) {
                        const confirmed = await onConfirmationRequired(toolName, toolArgsStr);
                        if (!confirmed) {
                            trimmedResult = "Obsidian command execution denied by user.";
                            isError = true;
                        }
                    }

                    if (!trimmedResult) {
                        if (executedCallsMap[callKey] > 2) {
                            trimmedResult = `[NEI SYSTEM WARNING]: Tool (${toolName}) with these args was called ${executedCallsMap[callKey] - 1} times. Loop prevented.`;
                            isError = true;
                        } else {
                            const execResult = await toolRegistry.executeTool(
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

                    return {
                        role: "tool" as const,
                        name: toolName,
                        tool_call_id: toolCall.id,
                        content: trimmedResult
                    };
                });

                const toolResponses = await Promise.all(toolPromises);
                messages.push(...toolResponses);
            } 
            // B) Fallback: Text-based JSON Tool Call Parser
            else if (response.content && this.containsJsonToolCall(response.content) && !isLastIteration) {
                const parsedTool = this.extractJsonToolCall(response.content);
                if (parsedTool) {
                    toolCalledCount++;
                    const callId = "text_call_" + Date.now();
                    const callArgsStr = JSON.stringify(parsedTool.args);
                    const callKey = `${parsedTool.name}:${callArgsStr}`;
                    executedCallsMap[callKey] = (executedCallsMap[callKey] || 0) + 1;

                    steps.push({
                        id: callId,
                        type: "tool_call",
                        title: `Tool (Fallback JSON): ${parsedTool.name}`,
                        detail: callArgsStr,
                        status: "running"
                    });
                    notifySteps();

                    let execResultText = "";
                    let isError = false;

                    if (parsedTool.name === "execute_obsidian_command" && settings.confirmObsidianCommands && onConfirmationRequired) {
                        const confirmed = await onConfirmationRequired(parsedTool.name, callArgsStr);
                        if (!confirmed) {
                            execResultText = "Obsidian command execution denied by user.";
                            isError = true;
                        }
                    }

                    if (!execResultText) {
                        const execResult = await toolRegistry.executeTool(
                            app,
                            callId,
                            parsedTool.name,
                            callArgsStr
                        );
                        execResultText = String(execResult.result);
                        isError = execResult.isError || false;
                    }

                    const currentStep = steps.find(s => s.id === callId);
                    if (currentStep) {
                        currentStep.status = isError ? "failed" : "completed";
                        currentStep.detail = execResultText.substring(0, 300);
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
                        content: execResultText
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
            await this.attemptAutoCreateNote(app, userQuery, finalResponseText, steps, notifySteps, toolRegistry, language);
        }

        return {
            responseText: finalResponseText || t("agentNoOutput", language),
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

    private static async attemptAutoCreateNote(app: App, query: string, responseText: string, steps: AgentStep[], notifySteps: () => void, toolRegistry: ToolRegistry, language: SupportedLanguage): Promise<void> {
        let notePath = "";

        const folderMatch = query.match(/(?:папке|папку|folder|directory)\s+["']?([a-zA-Z0-9_\-/А-Яа-яЁё ]+?)["']?(?:\s|$)/i);
        const fileMatch = query.match(/(?:заметку|файл|note|file)\s+["']?([a-zA-Z0-9_\-/А-Яа-яЁё ]+?\.md)["']?/i);

        if (fileMatch && fileMatch[1]) {
            notePath = fileMatch[1].trim();
        } else {
            const folder = folderMatch && folderMatch[1] ? folderMatch[1].trim() : "";
            const dateStr = new Date().toISOString().slice(0, 10);
            const titleMatch = query.match(/(?:создай|создать|create|write)\s+(?:заметку|файл|название|note)?\s*["']?([^"'\n,]{3,30})["']?/i);
            let slug = titleMatch && titleMatch[1] ? titleMatch[1].trim().replace(/[^\w\sА-Яа-яЁё-]/g, "") : "New_Note";
            if (slug.length < 3) slug = "New_Note";
            notePath = folder ? `${folder}/${slug}_${dateStr}.md` : `${slug}_${dateStr}.md`;
        }

        try {
            const execResult = await toolRegistry.executeTool(
                app,
                "auto-create-fallback",
                "create_note",
                JSON.stringify({ path: notePath, content: responseText })
            );

            steps.push({
                id: "auto-create-step",
                type: "tool_result",
                title: t("autoCreatedNote", language, { path: notePath }),
                detail: String(execResult.result),
                status: execResult.isError ? "failed" : "completed"
            });
            notifySteps();
        } catch {
            /* ignore auto create error */
        }
    }
}
