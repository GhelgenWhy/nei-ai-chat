import { ToolDefinition, ToolCall } from "./tools/types";

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    name?: string;
    tool_call_id?: string;
    tool_calls?: ToolCall[];
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

    // Clean messages to prevent null content issues on OpenRouter
    const cleanMessages = messages.map(m => ({
        role: m.role,
        content: m.content || "",
        ...(m.name ? { name: m.name } : {}),
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {})
    }));

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
        throw new Error(`Ошибка ИИ (${response.status}): ${errorText || response.statusText}`);
    }

    const data = await response.json();
    if (!data.choices || data.choices.length === 0) {
        throw new Error("ИИ вернул пустой выбор ответа (empty choices).");
    }

    const choiceMessage = data.choices[0].message || {};
    const content = choiceMessage.content || "";
    const tool_calls = choiceMessage.tool_calls || undefined;
    const reasoning = choiceMessage.reasoning || choiceMessage.reasoning_content || undefined;

    return {
        content,
        tool_calls,
        reasoning
    };
}
