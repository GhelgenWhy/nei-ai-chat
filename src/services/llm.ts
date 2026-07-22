import { ToolDefinition, ToolCall } from "./tools/types";

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | null;
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
    content: string | null;
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

    const body: Record<string, any> = {
        model: config.model,
        messages: messages
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
        throw new Error("ИИ вернул пустой ответ.");
    }

    const choiceMessage = data.choices[0].message;
    return {
        content: choiceMessage.content || null,
        tool_calls: choiceMessage.tool_calls || undefined,
        reasoning: choiceMessage.reasoning || choiceMessage.reasoning_content || undefined
    };
}
