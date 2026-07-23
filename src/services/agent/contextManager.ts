import { ChatMessage } from "../llm";

export class ContextManager {
    /**
     * Limits chat history to a maximum number of turns (sliding window) to prevent token explosion.
     */
    public static pruneHistory(messages: ChatMessage[], maxTurns: number = 6): ChatMessage[] {
        const systemMsgs = messages.filter(m => m.role === 'system');
        const nonSystemMsgs = messages.filter(m => m.role !== 'system');

        // Keep system messages + last N turns of conversation
        const trimmedNonSystem = nonSystemMsgs.slice(-maxTurns);

        return [...systemMsgs, ...trimmedNonSystem];
    }

    /**
     * Compacts tool outputs and long file snippets to save tokens.
     */
    public static compactText(text: string, maxLength: number = 8000): string {
        if (!text || text.length <= maxLength) return text;
        const half = Math.floor(maxLength / 2);
        const head = text.substring(0, half);
        const tail = text.substring(text.length - half);
        return `${head}\n\n... [Сжато системой NEI: пропущено ${text.length - maxLength} символов для экономии токенов] ...\n\n${tail}`;
    }
}
