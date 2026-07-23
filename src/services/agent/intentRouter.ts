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
        // If attachments (images/files) exist, default to Agent Mode for thorough analysis
        if (hasAttachments) {
            return { mode: 'agent', reason: 'Прикреплены файлы/изображения для анализа' };
        }

        const queryLower = userQuery.trim().toLowerCase();

        // 1. Explicit Agent Intent Keywords
        const agentKeywords = [
            "сканируй", "скан", "проанализируй репозиторий", "проанализируй сайт", "веб-сайт", "найди в ваулте",
            "проверь все заметки", "сравни заметки", "найди и обнови", "сгруппируй все таски",
            "search", "scan vault", "analyze repo", "check all files"
        ];

        for (const kw of agentKeywords) {
            if (queryLower.includes(kw)) {
                return { mode: 'agent', reason: `Обнаружен запрос на многошаговый анализ (${kw})` };
            }
        }

        // 2. Explicit Quick Intent Patterns (Direct Note Creation, Q&A, Formatting, Translations)
        const isDirectNoteCreation = (queryLower.startsWith("создай заметку") || queryLower.startsWith("напиши заметку")) 
            && !queryLower.includes("сканируй") && !queryLower.includes("найди в");

        const isShortQuestion = userQuery.length < 120 && (
            queryLower.startsWith("что такое") || 
            queryLower.startsWith("как сделать") || 
            queryLower.startsWith("объясни") || 
            queryLower.startsWith("переведи") ||
            queryLower.startsWith("напиши код") ||
            queryLower.startsWith("перефразируй")
        );

        if (isDirectNoteCreation || isShortQuestion) {
            return { mode: 'quick', reason: 'Простая 1-шаговая задача (быстрый отклик без вызова инструментов)' };
        }

        // Default: If user prompt is complex (> 200 chars) or asks for investigation -> Agent Mode
        if (userQuery.length > 200) {
            return { mode: 'agent', reason: 'Развернутый запрос требует агентных рассуждений' };
        }

        return { mode: 'quick', reason: 'Стандартный вопрос для прямого ответа' };
    }
}
