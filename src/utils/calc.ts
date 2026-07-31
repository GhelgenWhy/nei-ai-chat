export interface TokenBudgetOptions {
    contextLength?: number;
    systemPromptTokens?: number;
    historyTokens?: number;
    estimatedResponseTokens?: number;
    toolOverheadTokens?: number;
    vaultRatio?: number;
}

export function calculateTokenBudget(options: TokenBudgetOptions): {
    availableTokens: number;
    maxVaultTokens: number;
    reservedTokens: number;
} {
    const contextLength = options.contextLength && options.contextLength > 0 ? options.contextLength : 4096;
    const systemPrompt = options.systemPromptTokens || 0;
    const history = options.historyTokens || 0;
    const estimatedResponse = options.estimatedResponseTokens ?? 1024;
    const toolOverhead = options.toolOverheadTokens ?? 300;
    const ratio = options.vaultRatio ?? 0.3;

    const reservedTokens = systemPrompt + history + estimatedResponse + toolOverhead;
    const availableTokens = Math.max(0, contextLength - reservedTokens);
    const maxVaultTokens = Math.floor(availableTokens * ratio);

    return {
        availableTokens,
        maxVaultTokens,
        reservedTokens
    };
}

export function estimateTokenCount(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}
