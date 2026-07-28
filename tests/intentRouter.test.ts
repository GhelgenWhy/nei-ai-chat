import { describe, test, expect } from "vitest";
import { IntentRouter } from "../src/services/agent/intentRouter";
import { ChatMessage } from "../src/services/llm";

describe("IntentRouter v3 Scoring Model & Temporal Intelligence", () => {
    const mockHistory: ChatMessage[] = [];
    const defaultSettings = {
        model: "google/gemini-2.5-flash", // knowledge cutoff 2024-12-01
        intentRoutingThreshold: 2.5,
        intentVaultKeywordWeight: 2.0,
        intentCreationWeight: 3.0,
        intentDeletionWeight: 4.0,
        intentAnalysisWeight: 2.5,
        intentQuestionWeight: -1.5,
        intentLengthWeight: 0.005,
        intentHistoryWeight: 0.3,
        intentAttachmentWeight: 5.0,
        intentStaleQueryWeight: 3.0,
        intentFreshnessWeight: 2.0,
    };

    test("attachments -> routes to agent mode", () => {
        const result = IntentRouter.classifyIntent("simple prompt", true, "en", mockHistory, defaultSettings);
        expect(result.mode).toBe("agent");
        expect(result.confidence).toBeGreaterThan(0.5);
    });

    test("create note -> routes to agent mode", () => {
        const result = IntentRouter.classifyIntent("создай заметку project.md", false, "ru", mockHistory, defaultSettings);
        expect(result.mode).toBe("agent");
        expect(result.confidence).toBeGreaterThan(0.5);
    });

    test("delete note -> routes to agent mode with high confidence", () => {
        const result = IntentRouter.classifyIntent("удали файл secret.md", false, "ru", mockHistory, defaultSettings);
        expect(result.mode).toBe("agent");
        expect(result.confidence).toBeGreaterThan(0.7);
    });

    test("pure question -> routes to quick mode", () => {
        const result = IntentRouter.classifyIntent("что такое typescript?", false, "ru", mockHistory, defaultSettings);
        expect(result.mode).toBe("quick");
        expect(result.confidence).toBeLessThan(0.5);
    });

    test("code snippet question without note creation -> routes to quick mode", () => {
        const result = IntentRouter.classifyIntent("напиши код на python для быстрого сортирования", false, "ru", mockHistory, defaultSettings);
        expect(result.mode).toBe("quick");
    });

    test("estimateComplexity -> calculates score based on action verbs and clauses", () => {
        const complexity = IntentRouter.estimateComplexity("создай и найди заметку, потом проанализируй и сравни");
        expect(complexity).toBeGreaterThan(1.0);
    });

    test("history bias -> boosts score when recent agent turns exist", () => {
        const historyWithAgent: ChatMessage[] = [
            { role: 'assistant', content: 'Agent step', tool_calls: [{ id: '1', type: 'function', function: { name: 'read_note', arguments: '{}' } }] },
            { role: 'tool', content: 'note data', tool_call_id: '1' },
            { role: 'assistant', content: 'Agent finished step', tool_calls: [{ id: '2', type: 'function', function: { name: 'edit_note', arguments: '{}' } }] },
        ];
        const result = IntentRouter.classifyIntent("продолжай", false, "ru", historyWithAgent, defaultSettings);
        expect(result.debug?.features.recentToolCalls).toBeGreaterThan(0);
    });

    test("Stale crypto price query -> Agent mode with web_search need", () => {
        const decision = IntentRouter.classifyIntent(
            "Какой курс BTC на сегодня?",
            false,
            "ru",
            mockHistory,
            defaultSettings
        );
        expect(decision.mode).toBe("agent");
        expect(decision.confidence).toBeGreaterThan(0.7);
        expect(decision.toolNeeds?.needsWebSearch).toBe(true);
        expect(decision.debug?.features.isStaleQuery).toBe(true);
    });

    test("Historical fact query (within cutoff) -> Quick mode", () => {
        const decision = IntentRouter.classifyIntent(
            "Кто создал Bitcoin?",
            false,
            "ru",
            mockHistory,
            defaultSettings
        );
        expect(decision.mode).toBe("quick");
        expect(decision.toolNeeds?.needsWebSearch).toBe(false);
    });

    test("Vault analysis query -> Agent mode with vault tools requirement", () => {
        const decision = IntentRouter.classifyIntent(
            "Проанализируй мои заметки про трейдинг",
            false,
            "ru",
            mockHistory,
            defaultSettings
        );
        expect(decision.mode).toBe("agent");
        expect(decision.toolNeeds?.needsVaultSearch).toBe(true);
        expect(decision.toolNeeds?.needsWebSearch).toBe(false);
    });

    test("Mixed query (vault + fresh) -> Agent mode with all tools", () => {
        const decision = IntentRouter.classifyIntent(
            "Сравни мой план из заметки с текущим курсом ETH на сегодня",
            false,
            "ru",
            mockHistory,
            defaultSettings
        );
        expect(decision.mode).toBe("agent");
        expect(decision.toolNeeds?.needsVaultSearch).toBe(true);
        expect(decision.toolNeeds?.needsWebSearch).toBe(true);
    });
});

