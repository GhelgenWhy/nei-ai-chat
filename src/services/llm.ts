import { ToolDefinition, ToolCall } from "./tools/types";
import { requestUrl } from "obsidian";

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    /** Stable identity for React keys / branching; absent in legacy sessions. */
    id?: string;
    name?: string;
    tool_call_id?: string;
    tool_calls?: ToolCall[];
    images?: string[];
    promptTokens?: number;
    completionTokens?: number;
    cost?: number;
}

export interface LlmConfig {
    provider: 'openrouter' | 'ollama' | 'custom';
    endpointUrl: string;
    apiKey: string;
    model: string;
}

export interface LlmResponse {
    content: string;
    tool_calls?: ToolCall[];
    reasoning?: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export {
    ModelTemporalInfo,
    MODEL_TEMPORAL_REGISTRY,
    getModelTemporalInfo,
    getKnowledgeCutoff,
    isQueryLikelyStale
} from "./modelRegistry";

/** HTTP-level failure with a user-friendly message — never retried via fallback. */
export class LlmHttpError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = "LlmHttpError";
    }
}

export function createAbortError(): Error {
    const e = new Error("NEI: request aborted by user");
    e.name = "AbortError";
    return e;
}

export function isAbortError(e: unknown): boolean {
    if (!(e instanceof Error)) return false;
    return e.name === "AbortError" || /abort/i.test(e.message);
}

function buildChatUrl(endpointUrl: string): string {
    return endpointUrl.endsWith('/')
        ? `${endpointUrl}chat/completions`
        : `${endpointUrl}/chat/completions`;
}

function buildHeaders(config: LlmConfig): Record<string, string> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json"
    };

    if (config.apiKey && config.provider !== 'ollama') {
        headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    if (config.provider === 'openrouter') {
        headers["HTTP-Referer"] = "https://github.com/GhelgenWhy/NEI";
        headers["X-Title"] = "NEI AI Assistant Obsidian Plugin";
    }

    return headers;
}

/**
 * Normalizes messages for OpenAI-compatible APIs: merges images into
 * multimodal content parts and nulls empty content on tool-call turns.
 */
function prepareMessagesForApi(messages: ChatMessage[]): Array<Record<string, unknown>> {
    return messages.map(m => {
        let messageContent: string | Array<Record<string, unknown>> | null = m.content || "";
        if (m.images && m.images.length > 0) {
            const parts: Array<Record<string, unknown>> = [{ type: "text", text: m.content || "" }];
            for (const img of m.images) {
                parts.push({
                    type: "image_url",
                    image_url: { url: img }
                });
            }
            messageContent = parts;
        }

        if (m.tool_calls && m.tool_calls.length > 0 && !m.content) {
            messageContent = null;
        }

        return {
            role: m.role,
            content: messageContent,
            ...(m.name ? { name: m.name } : {}),
            ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
            ...(m.tool_calls ? { tool_calls: m.tool_calls } : {})
        };
    });
}

/**
 * Maps non-2xx responses to actionable user-facing messages (RU, provider-aware).
 */
export function parseHttpErrorMessage(status: number, errorText: string): string {
    const fallback = `Ошибка ИИ (${status}): ${errorText}`;
    try {
        const parsedErr = JSON.parse(errorText) as { error?: { message?: string; metadata?: { provider_name?: string } } };
        if (parsedErr.error) {
            const errObj = parsedErr.error;
            const providerName = errObj.metadata?.provider_name || "";
            if (status === 502 || status === 503 || status === 500) {
                return `⚠️ Сбой провайдера OpenRouter ${providerName ? `(${providerName})` : ''} [Код ${status}]: Сервер выбранной модели временно перегружен или недоступен. Вы можете повторить запрос через пару секунд или временно выбрать другую модель в настройках ⚙️.`;
            }
            if (status === 429) {
                return `⏳ Превышен лимит запросов (429 Rate Limit): Провайдер временно ограничил частоту вызовов. Подождите несколько секунд и попробуйте снова.`;
            }
            if (status === 401) {
                return `🔑 Ошибка авторизации (401): Неверный или отсутствующий API-ключ OpenRouter. Проверьте ваш ключ в настройках ⚙️.`;
            }
            if (errObj.message) {
                return `⚠️ Сообщение провайдера OpenRouter [Код ${status}]: ${errObj.message}`;
            }
        }
    } catch {
        /* not JSON — keep fallback */
    }
    return fallback;
}

function parseChatResponseJson(data: unknown): LlmResponse {
    const d = data as {
        choices?: Array<{
            message?: {
                content?: string;
                tool_calls?: ToolCall[];
                reasoning?: string;
                reasoning_content?: string;
            }
        }>;
        usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
        };
    };

    if (!d.choices || d.choices.length === 0) {
        throw new Error("ИИ вернул пустой выбор ответа (empty choices).");
    }

    const choiceMessage = d.choices[0]?.message || {};
    const usage = d.usage ? {
        promptTokens: Number(d.usage.prompt_tokens || 0),
        completionTokens: Number(d.usage.completion_tokens || 0),
        totalTokens: Number(d.usage.total_tokens || 0)
    } : undefined;

    return {
        content: choiceMessage.content || "",
        tool_calls: choiceMessage.tool_calls || undefined,
        reasoning: choiceMessage.reasoning || choiceMessage.reasoning_content || undefined,
        usage
    };
}

function buildRequestBody(
    config: LlmConfig,
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    stream = false
): string {
    const body: Record<string, unknown> = {
        model: config.model,
        messages: prepareMessagesForApi(messages)
    };
    if (stream) body.stream = true;
    if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = "auto";
    }
    return JSON.stringify(body);
}

/**
 * Sends a chat request to OpenRouter or OpenAI-compatible LLM endpoint with Tool Calling support.
 * Uses native fetch (supports AbortSignal); falls back to obsidian.requestUrl
 * when fetch is unavailable or fails at network level (restricted webviews).
 */
export async function sendChatRequest(
    config: LlmConfig,
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    signal?: AbortSignal
): Promise<LlmResponse> {
    const url = buildChatUrl(config.endpointUrl);
    const headers = buildHeaders(config);
    const bodyStr = buildRequestBody(config, messages, tools);

    if (typeof fetch === "function") {
        try {
            const res = await fetch(url, { method: "POST", headers, body: bodyStr, signal });
            const text = await res.text();
            if (!res.ok) {
                throw new LlmHttpError(res.status, parseHttpErrorMessage(res.status, text));
            }
            return parseChatResponseJson(JSON.parse(text));
        } catch (e: unknown) {
            if (isAbortError(e)) throw e;
            if (e instanceof LlmHttpError) throw e;
            console.warn("[NEI] Native fetch failed, falling back to requestUrl:", e);
        }
    }

    const res = await requestUrl({ url, method: "POST", headers, body: bodyStr }) as unknown as {
        status: number;
        text: string;
        json: Record<string, unknown>;
    };

    if (res.status < 200 || res.status >= 300) {
        throw new LlmHttpError(res.status, parseHttpErrorMessage(res.status, res.text || ""));
    }

    return parseChatResponseJson(res.json);
}

interface ToolCallAccumulator {
    id: string;
    name: string;
    arguments: string;
}

/**
 * Incremental SSE accumulator: feed decoded stream text, get an LlmResponse.
 * Handles `data:` framing, [DONE], delta.content / reasoning and
 * OpenAI-style streamed tool_calls (merged by index).
 */
export class StreamAccumulator {
    content = "";
    reasoning = "";
    usage?: LlmResponse["usage"];
    private lineBuffer = "";
    private toolCalls = new Map<number, ToolCallAccumulator>();

    /**
     * Processes one decoded chunk of SSE text. Handles arbitrary chunk splits:
     * incomplete lines are buffered until their newline arrives (flush at EOF).
     */
    pushChunk(text: string): void {
        this.lineBuffer += text;
        const lines = this.lineBuffer.split("\n");
        this.lineBuffer = lines.pop() ?? "";
        for (const line of lines) {
            this.processLine(line);
        }
    }

    /** Processes the buffered tail when the stream has ended. */
    flush(): void {
        if (this.lineBuffer) {
            this.processLine(this.lineBuffer);
            this.lineBuffer = "";
        }
    }

    private processLine(line: string): void {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) return;
        if (!trimmed.startsWith("data:")) return;
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === "[DONE]") return;
        try {
            const parsed = JSON.parse(dataStr) as {
                choices?: Array<{
                    delta?: {
                        content?: string;
                        reasoning?: string;
                        reasoning_content?: string;
                        tool_calls?: Array<{
                            index?: number;
                            id?: string;
                            function?: { name?: string; arguments?: string };
                        }>;
                    };
                }>;
                usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
            };

            if (parsed.usage) {
                this.usage = {
                    promptTokens: Number(parsed.usage.prompt_tokens || 0),
                    completionTokens: Number(parsed.usage.completion_tokens || 0),
                    totalTokens: Number(parsed.usage.total_tokens || 0)
                };
            }

            const delta = parsed.choices?.[0]?.delta;
            if (!delta) return;

            if (delta.content) {
                this.content += delta.content;
            }
            if (delta.reasoning || delta.reasoning_content) {
                this.reasoning += delta.reasoning || delta.reasoning_content || "";
            }
            if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                    const idx = typeof tc.index === "number" ? tc.index : this.toolCalls.size;
                    const cur = this.toolCalls.get(idx) || { id: "", name: "", arguments: "" };
                    if (tc.id) cur.id = tc.id;
                    if (tc.function?.name) cur.name += tc.function.name;
                    if (tc.function?.arguments) cur.arguments += tc.function.arguments;
                    this.toolCalls.set(idx, cur);
                }
            }
        } catch {
            /* ignore malformed chunk JSON */
        }
    }

    /** Returns null when the stream carried no content at all. */
    toResponse(): LlmResponse | null {
        if (!this.content && !this.reasoning && this.toolCalls.size === 0) return null;
        let tool_calls: ToolCall[] | undefined;
        if (this.toolCalls.size > 0) {
            tool_calls = [...this.toolCalls.values()]
                .filter(tc => tc.name)
                .map((tc, i) => ({
                    id: tc.id || `stream_call_${i}`,
                    type: "function" as const,
                    function: { name: tc.name, arguments: tc.arguments || "{}" }
                }));
        }
        return {
            content: this.content,
            reasoning: this.reasoning || undefined,
            tool_calls,
            usage: this.usage
        };
    }
}

/**
 * Sends a streaming chat request to OpenRouter or OpenAI-compatible endpoint.
 * Requires native fetch (obsidian.requestUrl buffers the whole response and
 * cannot stream); falls back to a non-streaming request when unavailable.
 * Emits incremental text chunks via onChunk callback.
 */
export async function sendChatRequestStream(
    config: LlmConfig,
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal
): Promise<LlmResponse> {
    const nonStreamingFallback = async (reason: string): Promise<LlmResponse> => {
        console.warn(`[NEI] Streaming unavailable (${reason}), using non-streaming request`);
        const fallbackRes = await sendChatRequest(config, messages, tools, signal);
        if (fallbackRes.content && onChunk) {
            onChunk(fallbackRes.content);
        }
        return fallbackRes;
    };

    if (typeof fetch !== "function") {
        return nonStreamingFallback("fetch API not available");
    }

    const url = buildChatUrl(config.endpointUrl);
    const headers = buildHeaders(config);
    const bodyStr = buildRequestBody(config, messages, tools, true);

    let res: Response;
    try {
        res = await fetch(url, { method: "POST", headers, body: bodyStr, signal });
    } catch (e: unknown) {
        if (isAbortError(e)) throw e;
        return nonStreamingFallback(`network error: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new LlmHttpError(res.status, parseHttpErrorMessage(res.status, errorText));
    }

    if (!res.body || typeof res.body.getReader !== "function") {
        return nonStreamingFallback("response body is not a stream");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const accumulator = new StreamAccumulator();

    try {
        while (true) {
            if (signal?.aborted) {
                void reader.cancel();
                throw createAbortError();
            }
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });

            const before = accumulator.content.length;
            accumulator.pushChunk(text);
            if (onChunk && accumulator.content.length > before) {
                onChunk(accumulator.content.slice(before));
            }
        }
        accumulator.flush();
    } catch (e: unknown) {
        if (isAbortError(e)) throw e;
        return nonStreamingFallback(`stream read error: ${e instanceof Error ? e.message : String(e)}`);
    }

    const result = accumulator.toResponse();
    if (result) return result;

    return nonStreamingFallback("empty stream");
}
