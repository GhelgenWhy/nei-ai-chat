export interface ModelPricing {
    prompt: number;      // cost per 1M input tokens
    completion: number;   // cost per 1M output tokens
}

export function calculateCost(
    promptTokens: number,
    completionTokens: number,
    modelId: string,
    pricingMap: Record<string, ModelPricing>
): number {
    const p = pricingMap[modelId];
    if (!p) return 0;
    return (promptTokens / 1_000_000) * p.prompt + (completionTokens / 1_000_000) * p.completion;
}

export function formatTokenCount(tokens: number): string {
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
    return String(tokens);
}

export function formatCost(cost: number): string {
    if (cost < 0.001) return `$${cost.toFixed(6)}`;
    if (cost < 0.01) return `$${cost.toFixed(5)}`;
    return `$${cost.toFixed(4)}`;
}
