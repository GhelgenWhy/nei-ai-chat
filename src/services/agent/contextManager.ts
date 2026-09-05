import { ChatMessage } from "../llm";

export class ContextManager {
    /**
     * Limits chat history using both turn count AND character budget
     * to prevent token explosion from large tool outputs.
     */
    public static pruneHistory(messages: ChatMessage[], maxTurns: number = 6, maxChars: number = 24000): ChatMessage[] {
        const systemMsgs = messages.filter(m => m.role === 'system');
        const nonSystemMsgs = messages.filter(m => m.role !== 'system');

        // 1. Sliding window by turn count
        let trimmed = nonSystemMsgs.slice(-maxTurns);

        // 2. Character budget enforcement — trim oldest messages if total exceeds budget
        let totalChars = trimmed.reduce((sum, m) => sum + (m.content?.length || 0), 0);
        while (totalChars > maxChars && trimmed.length > 2) {
            const removed = trimmed.shift();
            if (removed) {
                totalChars -= (removed.content?.length || 0);
            }
        }

        // 3. Compact tool responses that are still too long within the window
        trimmed = trimmed.map(m => {
            if (m.role === 'tool' && m.content && m.content.length > 4000) {
                return { ...m, content: this.compactText(m.content, 4000) };
            }
            return m;
        });

        return [...systemMsgs, ...trimmed];
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

    /**
     * Strips base64 images from history (B10): re-sending old screenshots on
     * every turn burns thousands of vision tokens. Keeps images on the last
     * `keepLastUserImages` user messages (0 strips everything).
     */
    public static stripImages(messages: ChatMessage[], keepLastUserImages: number = 0): ChatMessage[] {
        let remaining = keepLastUserImages;
        const out: ChatMessage[] = [];
        for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            if (m.role === "user" && m.images && m.images.length > 0 && remaining > 0) {
                remaining--;
                out.unshift(m);
            } else if (m.images && m.images.length > 0) {
                out.unshift({ ...m, images: undefined });
            } else {
                out.unshift(m);
            }
        }
        return out;
    }
}

