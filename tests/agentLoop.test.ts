import { describe, test, expect, vi } from "vitest";

vi.mock("../src/services/context", () => ({
    resolveContext: vi.fn().mockResolvedValue({ ragContext: "mock rag context" })
}));

vi.mock("../src/services/rag", () => ({
    searchVaultLexical: vi.fn().mockResolvedValue([])
}));

vi.mock("../src/services/rag/vectorIndex", () => ({
    searchVaultHybrid: vi.fn().mockResolvedValue([])
}));

vi.mock("../src/services/llm", () => ({
    sendChatRequest: vi.fn().mockImplementation(async (_config, _messages) => {
        return { content: "Mock LLM Response", usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    }),
    sendChatRequestStream: vi.fn().mockImplementation(async (_config, _messages, _tools, onChunk) => {
        if (onChunk) onChunk("Mock LLM Response");
        return { content: "Mock LLM Response" };
    }),
    getModelTemporalInfo: vi.fn().mockReturnValue({
        modelId: "test-model",
        knowledgeCutoff: "2024-12-01",
        supportsWebSearch: true,
        defaultFreshnessPolicy: "auto"
    })
}));

import { AgentLoop } from "../src/services/agent/agentLoop";
import { resolveContext } from "../src/services/context";
import { sendChatRequest } from "../src/services/llm";

describe("AgentLoop Unit Tests", () => {
    const mockApp: any = {
        vault: {
            getAbstractFileByPath: () => null,
            read: async () => ""
        }
    };
    const mockToolRegistry: any = {
        getToolDefinitions: () => [],
        executeTool: async () => ({ result: "ok" })
    };
    const defaultSettings: any = {
        model: "google/gemini-2.5-flash",
        enableStreaming: false,
        enableAdaptivePrefetch: true,
        enableSemanticRag: false,
        maxPrefetchCount: 10,
        requestTimeoutSec: 20,
        chatsFolder: ".nei/chats",
        memoryFile: ".nei/memory.json",
        skillsFolder: ".nei/skills"
    };

    test("useVaultContext === false -> skips resolveContext and vault prefetching", async () => {
        vi.clearAllMocks();
        const result = await AgentLoop.run({
            app: mockApp,
            config: { provider: "openrouter", endpointUrl: "http://test", apiKey: "key", model: "test-model" },
            userQuery: "what is typescript?",
            chatHistory: [],
            executionMode: "quick",
            useVaultContext: false,
            toolRegistry: mockToolRegistry,
            settings: defaultSettings
        });

        expect(resolveContext).not.toHaveBeenCalled();
        expect(result.responseText).toBe("Mock LLM Response");
    });

    test("empty response -> triggers fallback request", async () => {
        vi.clearAllMocks();
        let callCount = 0;
        vi.mocked(sendChatRequest).mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                return { content: "" }; // Empty first response
            }
            return { content: "Fallback Response", usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 } };
        });

        const result = await AgentLoop.run({
            app: mockApp,
            config: { provider: "openrouter", endpointUrl: "http://test", apiKey: "key", model: "test-model" },
            userQuery: "what is typescript?",
            chatHistory: [],
            executionMode: "quick",
            useVaultContext: false,
            toolRegistry: mockToolRegistry,
            settings: defaultSettings
        });

        expect(callCount).toBe(2);
        expect(result.responseText).toBe("Fallback Response");
    });
});
