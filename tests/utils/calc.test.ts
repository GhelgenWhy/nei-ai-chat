import { describe, it, expect } from "vitest";
import { calculateTokenBudget, estimateTokenCount } from "../../src/utils/calc";

describe("calc utils", () => {
    it("estimates token count correctly (length / 4)", () => {
        expect(estimateTokenCount("1234")).toBe(1);
        expect(estimateTokenCount("12345678")).toBe(2);
        expect(estimateTokenCount("")).toBe(0);
    });

    it("calculates token budget with default fallback contextLength", () => {
        const budget = calculateTokenBudget({
            systemPromptTokens: 500,
            historyTokens: 200
        });

        // 4096 - (500 + 200 + 1024 + 300) = 4096 - 2024 = 2072
        expect(budget.reservedTokens).toBe(2024);
        expect(budget.availableTokens).toBe(2072);
        expect(budget.maxVaultTokens).toBe(Math.floor(2072 * 0.3)); // 621
    });

    it("respects custom model contextLength and custom parameters", () => {
        const budget = calculateTokenBudget({
            contextLength: 128000,
            systemPromptTokens: 1000,
            historyTokens: 2000,
            estimatedResponseTokens: 2000,
            toolOverheadTokens: 500,
            vaultRatio: 0.3
        });

        // 128000 - (1000 + 2000 + 2000 + 500) = 128000 - 5500 = 122500
        expect(budget.reservedTokens).toBe(5500);
        expect(budget.availableTokens).toBe(122500);
        expect(budget.maxVaultTokens).toBe(Math.floor(122500 * 0.3)); // 36750
    });

    it("handles zero available tokens gracefully", () => {
        const budget = calculateTokenBudget({
            contextLength: 1000,
            systemPromptTokens: 800,
            historyTokens: 500
        });

        expect(budget.availableTokens).toBe(0);
        expect(budget.maxVaultTokens).toBe(0);
    });
});
