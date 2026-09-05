import { App } from "obsidian";
import { ChatMessage, LlmConfig, sendChatRequest, sendChatRequestStream, getModelTemporalInfo, LlmResponse, createAbortError } from "../llm";
import { MemoryStore } from "../memory/memoryStore";
import { SkillsLoader } from "../skills/skillsLoader";
import { ToolRegistry } from "../tools/toolRegistry";
import { SupportedLanguage, t } from "../../i18n/translations";
import { NeiAiChatSettings } from "../../../main";
import { searchVaultLexical } from "../rag";
import { searchVaultHybrid } from "../rag/vectorIndex";
import { OpenRouterModelInfo, getDefaultModelCapabilities } from "../openrouter";

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
    useVaultContext?: boolean; // VCTX-01
    activeModelDetails?: OpenRouterModelInfo | null;
    onStepUpdate?: (steps: AgentStep[]) => void;
    onConfirmationRequired?: (toolName: string, argsStr: string) => Promise<boolean>;
    onStreamChunk?: (chunk: string) => void;
    maxIterations?: number;
    toolRegistry: ToolRegistry;
    language?: SupportedLanguage;
    settings: NeiAiChatSettings;
    abortSignal?: AbortSignal;
}

export interface AgentLoopResult {
    responseText: string;
    promptTokens: number;
    completionTokens: number;
    executionModeUsed: "quick" | "agent";
    steps: AgentStep[];
}

/** Small bounded LRU (insertion-order based) to keep hot data without leaks. */
class LruCache<K, V> {
    private map = new Map<K, V>();
    constructor(private max: number) {}

    get(key: K): V | undefined {
        const value = this.map.get(key);
        if (value !== undefined) {
            this.map.delete(key);
            this.map.set(key, value);
        }
        return value;
    }

    set(key: K, value: V): void {
        if (this.map.has(key)) this.map.delete(key);
        else if (this.map.size >= this.max) {
            const oldest = this.map.keys().next().value;
            if (oldest !== undefined) this.map.delete(oldest);
        }
        this.map.set(key, value);
    }
}

/** djb2 string hash — cheap content fingerprint for cache keys. */
export function hashString(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

export class AgentLoop {
    private static promptCache: LruCache<string, { prompt: string; timestamp: number }> = new LruCache(20);

    private static throwIfAborted(signal?: AbortSignal): void {
        if (signal?.aborted) {
            throw createAbortError();
        }
    }

    private static isResponseValid(response: LlmResponse | null | undefined): boolean {
        if (!response) return false;
        const hasContent = Boolean(response.content && response.content.trim().length > 0);
        const hasTools = Boolean(response.tool_calls && response.tool_calls.length > 0);
        const hasReasoning = Boolean(response.reasoning && response.reasoning.trim().length > 0);
        return hasContent || hasTools || hasReasoning;
    }

    private static getSystemPrompt(
        language: SupportedLanguage,
        userQuery: string,
        ragContext: string,
        agentsRules: string,
        memory: { learnedFacts: string[] },
        skills: Array<{ name: string; description: string }>,
        settings: NeiAiChatSettings,
        modelId: string
    ): string {
        // Content-hash key: same lengths but different vault content must not collide.
        const cacheKey = [
            language,
            modelId,
            settings.memoryFile,
            hashString(ragContext),
            hashString(agentsRules),
            hashString(memory.learnedFacts.join("|")),
            hashString(skills.map(s => `${s.name}:${s.description}`).join("|"))
        ].join("|");

        const cached = this.promptCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 60000) {
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

        // TOOL USAGE ENFORCEMENT
        systemPrompt += `\n--- TOOL USAGE RULES ---\n`;
        systemPrompt += `You are an AGENT with access to tools. You MUST use tools when:\n`;
        systemPrompt += `1. User asks for current information (prices, news, weather, etc.) - use web_search\n`;
        systemPrompt += `2. User asks about their vault/notes - use search_notes, read_note, get_folder_notes\n`;
        systemPrompt += `3. User wants to create/edit/delete notes - use create_note, edit_note, delete_note\n`;
        systemPrompt += `4. User explicitly asks you to use a tool - you MUST use it\n`;
        systemPrompt += `5. You need information you don't have - search for it using available tools\n`;
        systemPrompt += `NEVER say "I cannot access" or "I don't have access" when tools are available.\n`;
        systemPrompt += `ALWAYS check if a tool can help before answering from memory.\n`;
        systemPrompt += `If user explicitly requests a tool (e.g., "search for X"), you MUST call that tool.\n`;
        systemPrompt += `------------------------\n`;

        if (ragContext) {
            systemPrompt += `\n--- VAULT CONTEXT (RAG) ---\n${ragContext}\n`;
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
            useVaultContext = true,
            activeModelDetails,
            onStepUpdate,
            onConfirmationRequired,
            onStreamChunk,
            maxIterations,
            toolRegistry,
            language = "auto",
            settings,
            abortSignal
        } = options;
        const steps: AgentStep[] = [];

        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;

        const notifySteps = () => {
            if (onStepUpdate) onStepUpdate([...steps]);
        };

        try {
            this.throwIfAborted(abortSignal);

            const features = IntentRouter.extractFeatures(
                userQuery,
                Boolean(images && images.length > 0),
                chatHistory,
                config.model,
                activeModelDetails || undefined
            );
            const toolNeeds = IntentRouter.classifyToolNeeds(userQuery, features, config.model);

            // Determine actual execution mode using IntentRouter if set to 'auto'
            let actualMode: "quick" | "agent" = "agent";
            if (executionMode === "quick") {
                actualMode = "quick";
            } else if (executionMode === "agent") {
                actualMode = "agent";
            } else {
                const decision = IntentRouter.classifyIntent(
                    userQuery,
                    Boolean(images && images.length > 0),
                    language,
                    chatHistory,
                    settings,
                    activeModelDetails || undefined
                );
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

            // Models without tool calling cannot run agent mode (prevents provider 400s)
            if (actualMode === "agent" && activeModelDetails && activeModelDetails.supportsTools === false) {
                actualMode = "quick";
                steps.push({
                    id: "tools-unsupported-step",
                    type: "thought",
                    title: "Quick mode (model lacks tool calling)",
                    detail: `Model "${config.model}" does not support tool calling; agent mode is unavailable.`,
                    status: "completed"
                });
                notifySteps();
            }

            // 1. Memory & Skills (independent of the vault-context toggle)
            const memory = await MemoryStore.loadMemory(app, settings);
            const agentsRules = await MemoryStore.loadAgentsRules(app, settings);
            const skills = await SkillsLoader.loadSkills(app, settings);

            // 2. Vault context via a single RAG search (used to be resolved twice per message)
            let ragContext = "";
            if (useVaultContext) {
                this.throwIfAborted(abortSignal);
                const maxCount = actualMode === "agent"
                    ? (settings.maxPrefetchedNotes || 5)
                    : (settings.ragResultLimit || 5);
                const searchResults = settings.enableSemanticRag
                    ? await searchVaultHybrid(app, userQuery, settings, maxCount)
                    : await searchVaultLexical(app, userQuery, maxCount, settings.prefetchSnippetLength);

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
                        const snippet = cleanContent.length > settings.prefetchSnippetLength
                            ? cleanContent.substring(0, settings.prefetchSnippetLength) + "... [обрезано]"
                            : cleanContent;

                        prefetchedBlocks.push(`--- NOTE: [[${abstractFile.basename}]] (${abstractFile.path}) ---\n${snippet}`);
                    }

                    if (prefetchedBlocks.length > 0) {
                        ragContext = `${t("autoIndexedVaultNotes", language)}\n${prefetchedBlocks.join("\n\n")}\n`;

                        if (actualMode === "agent") {
                            const matchedFoldersArr = Array.from(matchedFoldersSet);
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
                }
            }

            // 3. Build User Message (with optional images)
            const userMsg: ChatMessage = { role: "user", content: userQuery };
            if (images && images.length > 0) {
                userMsg.images = images;
            }

            // 4. Build System Prompt & Prune History (ContextManager)
            const systemPrompt = this.getSystemPrompt(language, userQuery, ragContext, agentsRules, memory, skills, settings, config.model);

            const prunedHistory = ContextManager.pruneHistory(chatHistory, 6);

            const messages: ChatMessage[] = [
                { role: "system", content: systemPrompt },
                ...prunedHistory.filter(m => m.role !== "system"),
                userMsg
            ];

            // 5. QUICK MODE (Single Direct Turn with optional Streaming)
            if (actualMode === "quick") {
                this.throwIfAborted(abortSignal);
                let response: LlmResponse;
                try {
                    response = (settings.enableStreaming && onStreamChunk)
                        ? await sendChatRequestStream(config, messages, undefined, onStreamChunk, abortSignal)
                        : await sendChatRequest(config, messages, undefined, abortSignal);
                } catch (e: unknown) {
                    if (e instanceof Error && e.name === "AbortError") throw e;
                    const err = e as { message?: string };
                    throw new Error(t("quickLlmError", language, { error: err?.message || String(e) }));
                }

                if (response.usage) {
                    totalPromptTokens += response.usage.promptTokens;
                    totalCompletionTokens += response.usage.completionTokens;
                }

                // ADD EMPTY RESPONSE FALLBACK:
                if (!this.isResponseValid(response)) {
                    console.warn('[AgentLoop] Quick mode empty response, attempting fallback...');
                    const fallbackResponse = await sendChatRequest(config, messages, undefined, abortSignal);
                    if (this.isResponseValid(fallbackResponse)) {
                        Object.assign(response, fallbackResponse);
                    }
                }

                return {
                    responseText: response.content || "",
                    promptTokens: totalPromptTokens,
                    completionTokens: totalCompletionTokens,
                    executionModeUsed: "quick",
                    steps: [...steps]
                };
            }

            // 6. AGENT MODE (Multi-step Tool Execution Loop)
            const allTools = toolRegistry.getToolDefinitions();
            const validToolNames = new Set(allTools.map(t => t.function.name));
            let filteredTools = allTools;

            let iteration = 0;
            let finalResponseText = "";
            const effectiveMaxIterations = maxIterations ?? settings.maxAgentIterations;

            while (iteration < effectiveMaxIterations) {
                this.throwIfAborted(abortSignal);
                iteration++;

                // Only filter tools for the FIRST turn based on intent classification
                // After that, always provide all tools so the model can use them as needed
                if (settings.enableSmartToolFiltering) {
                    if (iteration === 1) {
                        if (toolNeeds.needsWebSearch && !toolNeeds.needsVaultSearch && !toolNeeds.needsVaultWrite) {
                            filteredTools = allTools.filter(t =>
                                ["web_search", "read_web_page", "analyze_github_repo"].includes(t.function.name)
                            );
                        } else if (!toolNeeds.needsWebSearch && (toolNeeds.needsVaultSearch || toolNeeds.needsVaultWrite)) {
                            // Prefix-based allow-list plus tools whose names don't match any vault verb prefix
                            const extraAllowed = new Set(["query_dataview", "render_templater", "execute_obsidian_command"]);
                            filteredTools = allTools.filter(t =>
                                extraAllowed.has(t.function.name) ||
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
                    } else {
                        // On subsequent iterations, provide ALL tools so the model can use any tool it needs
                        filteredTools = allTools;
                    }
                }

                const isLastIteration = (iteration === effectiveMaxIterations);
                // Always pass tools; model decides when to stop calling them
                const activeTools = filteredTools;

                // Stream only when: last iteration AND no tools available (model should respond with text)
                const canStreamFinal = isLastIteration && settings.enableStreaming && onStreamChunk;
                const response = canStreamFinal
                    ? await sendChatRequestStream(config, messages, undefined, onStreamChunk, abortSignal)
                    : await sendChatRequest(config, messages, activeTools, abortSignal);
                if (response.usage) {
                    totalPromptTokens += response.usage.promptTokens;
                    totalCompletionTokens += response.usage.completionTokens;
                }

                // ADD EMPTY RESPONSE FALLBACK HERE:
                if (!this.isResponseValid(response)) {
                    console.warn('[AgentLoop] Empty response, attempting fallback without tools...');
                    const fallbackResponse = await sendChatRequest(config, [
                        { role: "system", content: systemPrompt },
                        userMsg
                    ], undefined, abortSignal); // No tools
                    if (this.isResponseValid(fallbackResponse)) {
                        Object.assign(response, fallbackResponse);
                    }
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

                // A) Standard OpenAI / OpenRouter Native Tool Calls
                // Execute tools on ANY iteration where model calls them
                if (response.tool_calls && response.tool_calls.length > 0) {
                    // Do not run side-effectful tools after the user pressed Stop
                    this.throwIfAborted(abortSignal);

                    messages.push({
                        role: "assistant",
                        content: response.content || "",
                        tool_calls: response.tool_calls
                    });

                    const executedCallsMap: Record<string, number> = {};
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
                            if (executedCallsMap[callKey] > 1) {
                                trimmedResult = `[NEI SYSTEM WARNING]: Tool (${toolName}) with these exact arguments was already executed in this session and returned results. Do NOT repeat identical tool calls. Formulate your final response based on the results already retrieved or use a different tool.`;
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
                // B) Fallback: Text-based JSON Tool Call Parser (hardened: signature + registry check)
                else if (response.content && this.containsJsonToolCall(response.content, validToolNames)) {
                    const parsedTool = this.extractJsonToolCall(response.content, validToolNames);
                    if (parsedTool) {
                        this.throwIfAborted(abortSignal);

                        const callId = "text_call_" + Date.now();
                        const callArgsStr = JSON.stringify(parsedTool.args);

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
                    // No tool calls = model is done
                    finalResponseText = response.content || "";
                    break;
                }
            }

            // Safety: prevent returning raw tool call JSON/XML as final answer
            if (finalResponseText && this.containsJsonToolCall(finalResponseText, validToolNames)) {
                console.warn('[AgentLoop] Model returned tool call as final text, stripping');
                // Remove JSON tool calls in markdown code blocks
                finalResponseText = finalResponseText.replace(/```[\s\S]*?```/g, '').trim()
                // Remove incomplete XML tool call tags (streaming artifacts)
                finalResponseText = finalResponseText.replace(/<\/?tool_call>/gi, '').trim()
                    || t("agentNoOutput", language);
            }

            return {
                responseText: finalResponseText || t("agentNoOutput", language),
                promptTokens: totalPromptTokens,
                completionTokens: totalCompletionTokens,
                executionModeUsed: "agent",
                steps: [...steps]
            };
        } catch (e: unknown) {
            console.error("[NEI Agent Loop Error]", e);
            throw e;
        }
    }

    /**
     * Extracts balanced-brace JSON object candidates from text
     * (string-aware; prefers fenced code blocks when present).
     */
    private static extractJsonCandidates(text: string): string[] {
        const scan = (src: string): string[] => {
            const out: string[] = [];
            let depth = 0;
            let start = -1;
            let inStr: string | null = null;
            for (let i = 0; i < src.length; i++) {
                const ch = src[i];
                const prev = i > 0 ? src[i - 1] : "";
                if (inStr) {
                    if (ch === inStr && prev !== "\\") inStr = null;
                    continue;
                }
                if (ch === '"' && depth > 0) {
                    inStr = ch;
                    continue;
                }
                if (ch === "{") {
                    if (depth === 0) start = i;
                    depth++;
                } else if (ch === "}") {
                    depth--;
                    if (depth === 0 && start >= 0) {
                        out.push(src.slice(start, i + 1));
                        start = -1;
                    }
                    if (depth < 0) depth = 0;
                }
            }
            return out;
        };

        const candidates: string[] = [];

        // 1. XML tool calls
        const xmlMatches = text.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi);
        for (const m of xmlMatches) {
            candidates.push(...scan(m[1]));
        }

        // 2. Fenced code blocks
        const fences = text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
        let fenceCount = 0;
        for (const m of fences) {
            fenceCount++;
            candidates.push(...scan(m[1]));
        }

        // 3. Whole text (only when no fences — avoids matching prose examples)
        if (fenceCount === 0) {
            candidates.push(...scan(text));
        }

        return candidates;
    }

    private static parseToolCandidate(
        raw: string,
        validToolNames: Set<string>
    ): { name: string; args: Record<string, unknown> } | null {
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(raw) as Record<string, unknown>;
        } catch {
            return null;
        }
        if (!parsed || typeof parsed !== "object") return null;

        // Explicit signature only: `tool` key, or `name` combined with an args key.
        // Generic `name`/`function`/`action` alone would match arbitrary JSON examples.
        const toolName = typeof parsed.tool === "string" ? parsed.tool
            : typeof parsed.name === "string" && ("arguments" in parsed || "args" in parsed || "action_input" in parsed) ? parsed.name
            : undefined;
        if (!toolName || typeof toolName !== "string") return null;

        // Must reference a real registered tool when the registry is known
        if (validToolNames.size > 0 && !validToolNames.has(toolName)) return null;

        const args = (parsed.arguments || parsed.args || parsed.action_input || {}) as Record<string, unknown>;
        return { name: toolName, args };
    }

    // Public for regression tests (pure functions, no side effects)
    public static containsJsonToolCall(text: string, validToolNames: Set<string>): boolean {
        // Check for complete XML tool calls
        if (/<tool_call>[\s\S]*?<\/tool_call>/i.test(text)) {
            return true;
        }
        // Check for incomplete XML tool calls (streaming artifacts) - warn but don't process
        if (/<tool_call>/i.test(text) && !/<\/tool_call>/i.test(text)) {
            console.warn('[AgentLoop] Incomplete tool_call tag detected (streaming artifact), ignoring');
            return false;
        }
        for (const candidate of this.extractJsonCandidates(text)) {
            if (this.parseToolCandidate(candidate, validToolNames)) return true;
        }
        return false;
    }

    // Public for regression tests (pure functions, no side effects)
    public static extractJsonToolCall(
        text: string,
        validToolNames: Set<string>
    ): { name: string; args: Record<string, unknown> } | null {
        for (const candidate of this.extractJsonCandidates(text)) {
            const parsed = this.parseToolCandidate(candidate, validToolNames);
            if (parsed) return parsed;
        }
        return null;
    }
}
