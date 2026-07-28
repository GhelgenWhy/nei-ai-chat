export interface ModelTemporalInfo {
    modelId: string;
    knowledgeCutoff: string;        // ISO date: "2024-12-01"
    trainingDate?: string;
    supportsWebSearch: boolean;     // whether model/provider can call web tools
    defaultFreshnessPolicy: 'strict' | 'lenient' | 'auto';
}

export const MODEL_TEMPORAL_REGISTRY: Record<string, ModelTemporalInfo> = {
    "google/gemini-2.5-flash": { modelId: "google/gemini-2.5-flash", knowledgeCutoff: "2024-12-01", supportsWebSearch: true, defaultFreshnessPolicy: "auto" },
    "anthropic/claude-3.5-sonnet": { modelId: "anthropic/claude-3.5-sonnet", knowledgeCutoff: "2024-04-01", supportsWebSearch: true, defaultFreshnessPolicy: "auto" },
    "google/gemini-2.5-pro": { modelId: "google/gemini-2.5-pro", knowledgeCutoff: "2024-11-01", supportsWebSearch: true, defaultFreshnessPolicy: "auto" },
    "openai/gpt-4o": { modelId: "openai/gpt-4o", knowledgeCutoff: "2023-10-01", supportsWebSearch: true, defaultFreshnessPolicy: "auto" },
    "deepseek/deepseek-chat": { modelId: "deepseek/deepseek-chat", knowledgeCutoff: "2024-07-01", supportsWebSearch: true, defaultFreshnessPolicy: "auto" },
    "default": { modelId: "default", knowledgeCutoff: "2024-01-01", supportsWebSearch: false, defaultFreshnessPolicy: "strict" }
};

export function getModelTemporalInfo(modelId: string): ModelTemporalInfo {
    if (!modelId) return MODEL_TEMPORAL_REGISTRY["default"];
    if (MODEL_TEMPORAL_REGISTRY[modelId]) return MODEL_TEMPORAL_REGISTRY[modelId];
    const lower = modelId.toLowerCase();
    if (lower.includes("gemini")) {
        return { modelId, knowledgeCutoff: "2024-12-01", supportsWebSearch: true, defaultFreshnessPolicy: "auto" };
    }
    if (lower.includes("claude")) {
        return { modelId, knowledgeCutoff: "2024-04-01", supportsWebSearch: true, defaultFreshnessPolicy: "auto" };
    }
    if (lower.includes("gpt-4") || lower.includes("gpt-3")) {
        return { modelId, knowledgeCutoff: "2023-10-01", supportsWebSearch: true, defaultFreshnessPolicy: "auto" };
    }
    return MODEL_TEMPORAL_REGISTRY["default"];
}

export function getKnowledgeCutoff(modelId: string): Date {
    return new Date(getModelTemporalInfo(modelId).knowledgeCutoff);
}

export function isQueryLikelyStale(query: string, modelId: string): boolean {
    const freshnessMarkers = [
        "сейчас", "сегодня", "на текущий момент", "актуальн", "последн", "новый", "текущ",
        "now", "today", "current", "latest", "recent", "as of", "up to date", "this week", "this month"
    ];
    const lower = query.toLowerCase();
    const hasFreshnessMarker = freshnessMarkers.some(m => lower.includes(m));

    if (!hasFreshnessMarker) return false;

    const cutoff = getKnowledgeCutoff(modelId);
    const daysSinceCutoff = (Date.now() - cutoff.getTime()) / (1000 * 60 * 60 * 24);

    return daysSinceCutoff > 30;
}
