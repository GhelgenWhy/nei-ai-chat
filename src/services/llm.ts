import { ToolDefinition, ToolCall } from "./tools/types";

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
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

/**
 * Sends a chat request to OpenRouter or OpenAI-compatible LLM endpoint with Tool Calling support.
 */
export async function sendChatRequest(
    config: LlmConfig,
    messages: ChatMessage[],
    tools?: ToolDefinition[]
): Promise<LlmResponse> {
    const url = config.endpointUrl.endsWith('/')
        ? `${config.endpointUrl}chat/completions`
        : `${config.endpointUrl}/chat/completions`;
        
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

    // Clean messages & support image arrays
    const cleanMessages = messages.map(m => {
        let messageContent: any = m.content || "";
        if (m.images && m.images.length > 0) {
            const parts: any[] = [{ type: "text", text: m.content || "" }];
            for (const img of m.images) {
                parts.push({
                    type: "image_url",
                    image_url: { url: img }
                });
            }
            messageContent = parts;
        }

        return {
            role: m.role,
            content: messageContent,
            ...(m.name ? { name: m.name } : {}),
            ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
            ...(m.tool_calls ? { tool_calls: m.tool_calls } : {})
        };
    });

    const body: Record<string, any> = {
        model: config.model,
        messages: cleanMessages
    };

    if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = "auto";
    }

    console.log(`[NEI Agent LLM] Вызов API: ${config.provider} (${config.model}), сообщений: ${messages.length}, инструментов: ${tools?.length || 0}`);

    const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        let userFriendlyMsg = `Ошибка ИИ (${response.status}): ${errorText || response.statusText}`;

        try {
            const parsedErr = JSON.parse(errorText);
            if (parsedErr.error) {
                const errObj = parsedErr.error;
                const providerName = errObj.metadata?.provider_name || "";
                if (response.status === 502 || response.status === 503 || response.status === 500) {
                    userFriendlyMsg = `⚠️ Сбой провайдера OpenRouter ${providerName ? `(${providerName})` : ''} [Код ${response.status}]: Сервер выбранной модели временно перегружен или недоступен. Вы можете повторить запрос через пару секунд или временно выбрать другую модель в настройках ⚙️.`;
                } else if (response.status === 429) {
                    userFriendlyMsg = `⏳ Превышен лимит запросов (429 Rate Limit): Провайдер временно ограничил частоту вызовов. Подождите несколько секунд и попробуйте снова.`;
                } else if (response.status === 401) {
                    userFriendlyMsg = `🔑 Ошибка авторизации (401): Неверный или отсутствующий API-ключ OpenRouter. Проверьте ваш ключ в настройках ⚙️.`;
                } else if (errObj.message) {
                    userFriendlyMsg = `⚠️ Сообщение провайдера OpenRouter [Код ${response.status}]: ${errObj.message}`;
                }
            }
        } catch (e) {}

        throw new Error(userFriendlyMsg);
    }

    const data = await response.json();
    if (!data.choices || data.choices.length === 0) {
        throw new Error("ИИ вернул пустой выбор ответа (empty choices).");
    }

    const choiceMessage = data.choices[0].message || {};
    const content = choiceMessage.content || "";
    const tool_calls = choiceMessage.tool_calls || undefined;
    const reasoning = choiceMessage.reasoning || choiceMessage.reasoning_content || undefined;

    const usage = data.usage ? {
        promptTokens: Number(data.usage.prompt_tokens || 0),
        completionTokens: Number(data.usage.completion_tokens || 0),
        totalTokens: Number(data.usage.total_tokens || 0)
    } : undefined;

    return {
        content,
        tool_calls,
        reasoning,
        usage
    };
}
