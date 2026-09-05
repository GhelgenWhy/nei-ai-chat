import { describe, test, expect } from "vitest";
import {
    StreamAccumulator,
    parseHttpErrorMessage,
    isAbortError,
    createAbortError,
    LlmHttpError
} from "../src/services/llm";

function sse(...payloads: (string | object)[]): string {
    return payloads.map(p => `data: ${typeof p === "string" ? p : JSON.stringify(p)}`).join("\n") + "\n";
}

describe("StreamAccumulator (B1: real SSE parsing)", () => {
    test("accumulates content chunks across split lines", () => {
        const acc = new StreamAccumulator();
        acc.pushChunk(sse({ choices: [{ delta: { content: "Hel" } }] }));
        acc.pushChunk(sse({ choices: [{ delta: { content: "lo" } }] }));
        const res = acc.toResponse();
        expect(res?.content).toBe("Hello");
    });

    test("handles chunks that contain multiple data lines and [DONE]", () => {
        const acc = new StreamAccumulator();
        acc.pushChunk(
            sse({ choices: [{ delta: { content: "A" } }] }, { choices: [{ delta: { content: "B" } }] }, "[DONE]")
        );
        expect(acc.toResponse()?.content).toBe("AB");
    });

    test("buffer split across chunk boundary does not lose or duplicate text", () => {
        const acc = new StreamAccumulator();
        // A single line arriving in two pieces with an embedded JSON payload
        const full = 'data: {"choices":[{"delta":{"content":"XY"}}]}\n';
        acc.pushChunk(full.slice(0, 20));
        acc.pushChunk(full.slice(20));
        expect(acc.toResponse()?.content).toBe("XY");
    });

    test("merges streamed tool_calls by index (fragmented arguments)", () => {
        const acc = new StreamAccumulator();
        acc.pushChunk(sse({
            choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "create_note", arguments: '{"pa' } }] } }]
        }));
        acc.pushChunk(sse({
            choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'th": "a.md"}' } }] } }]
        }));
        const res = acc.toResponse();
        expect(res?.tool_calls).toHaveLength(1);
        expect(res?.tool_calls?.[0].id).toBe("call_1");
        expect(res?.tool_calls?.[0].function.name).toBe("create_note");
        expect(res?.tool_calls?.[0].function.arguments).toBe('{"path": "a.md"}');
    });

    test("captures reasoning and final usage", () => {
        const acc = new StreamAccumulator();
        acc.pushChunk(sse({ choices: [{ delta: { reasoning: "think" } }] }));
        acc.pushChunk(sse({ choices: [{ delta: { content: "ok" } }] }));
        acc.pushChunk(sse({ choices: [{ delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }));
        const res = acc.toResponse();
        expect(res?.reasoning).toBe("think");
        expect(res?.content).toBe("ok");
        expect(res?.usage?.promptTokens).toBe(10);
    });

    test("empty stream yields null (caller falls back to non-streaming)", () => {
        const acc = new StreamAccumulator();
        acc.pushChunk(sse({ choices: [{ delta: {} }] }));
        expect(acc.toResponse()).toBeNull();
    });
});

describe("parseHttpErrorMessage", () => {
    test("maps 401 to auth hint", () => {
        const msg = parseHttpErrorMessage(401, JSON.stringify({ error: { message: "bad key" } }));
        expect(msg).toContain("401");
        expect(msg).toContain("API-ключ");
    });

    test("maps 429 to rate limit hint", () => {
        const msg = parseHttpErrorMessage(429, JSON.stringify({ error: {} }));
        expect(msg).toContain("429");
    });

    test("maps 502 to provider outage hint with provider name", () => {
        const msg = parseHttpErrorMessage(502, JSON.stringify({ error: { metadata: { provider_name: "DeepSeek" } } }));
        expect(msg).toContain("DeepSeek");
    });

    test("keeps provider message for other statuses", () => {
        const msg = parseHttpErrorMessage(400, JSON.stringify({ error: { message: "tools not supported" } }));
        expect(msg).toContain("tools not supported");
    });

    test("non-JSON body falls back to raw text", () => {
        expect(parseHttpErrorMessage(500, "gateway timeout")).toContain("gateway timeout");
    });
});

describe("abort helpers", () => {
    test("isAbortError detects DOMException-style and NEI-style aborts", () => {
        const domExc = new DOMException("The operation was aborted.", "AbortError");
        expect(isAbortError(domExc)).toBe(true);
        expect(isAbortError(createAbortError())).toBe(true);
        expect(isAbortError(new Error("network down"))).toBe(false);
        expect(isAbortError("string error")).toBe(false);
    });

    test("LlmHttpError carries status", () => {
        const e = new LlmHttpError(429, "rate limited");
        expect(e.status).toBe(429);
        expect(e.name).toBe("LlmHttpError");
    });
});
