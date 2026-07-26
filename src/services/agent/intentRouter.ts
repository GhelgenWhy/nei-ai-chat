export type ExecutionMode = 'auto' | 'quick' | 'agent';

export interface IntentDecision {
    mode: 'quick' | 'agent';
    reason: string;
}

export class IntentRouter {
    /**
     * Determines whether a user prompt should execute in Quick Mode (1 turn, no tools)
     * or Agent Mode (multi-turn tool execution loop).
     */
    public static classifyIntent(userQuery: string, hasAttachments: boolean = false): IntentDecision {
        // 1. If attachments (images/files) exist, default to Agent Mode
        if (hasAttachments) {
            return { mode: 'agent', reason: 'Прикреплены файлы/изображения для анализа' };
        }

        const queryLower = userQuery.trim().toLowerCase();

        // 2. Explicit Vault / File / Note / Action Keywords MUST USE AGENT MODE
        const vaultActionKeywords = [
            "создай", "напиши заметку", "создать заметку", "создай заметку", "создай папку", "создай файл", 
            "сохрани", "сохранить", "запиши в", "создай в", "сделай заметку", "сгенерируй заметку",
            "проанализируй", "найди", "поищи", "сканируй", "скан", "проверь", "сравни", "удали", 
            "переименуй", "обнови", "сгруппируй", "таски", "папке", "заметке", "ваулт", "vault",
            "create note", "make note", "write note", "save note", "create folder", "create file",
            "search", "find", "analyze", "scan", "check notes"
        ];

        for (const kw of vaultActionKeywords) {
            if (queryLower.includes(kw)) {
                return { mode: 'agent', reason: `Обнаружен запрос работы с заметками/ваултом (${kw})` };
            }
        }

        // 3. Short Conversational Q&A / Translation / Formatting Questions -> Quick Mode
        const isPureQuestion = userQuery.length < 150 && (
            queryLower.startsWith("что такое") || 
            queryLower.startsWith("как сделать") || 
            queryLower.startsWith("объясни") || 
            queryLower.startsWith("переведи") ||
            queryLower.startsWith("напиши код") ||
            queryLower.startsWith("перефразируй") ||
            queryLower.startsWith("что значит") ||
            queryLower.startsWith("какая разница")
        );

        if (isPureQuestion) {
            return { mode: 'quick', reason: 'Прямой вопрос/ответ (без взаимодействия с хранилищем)' };
        }

        // 4. Default: If user prompt is > 150 chars or specifies complex task -> Agent Mode
        if (userQuery.length > 150) {
            return { mode: 'agent', reason: 'Развернутый запрос требует агентного режима' };
        }

        return { mode: 'quick', reason: 'Простая беседа без обращения к ваулту' };
    }
}
