import { describe, test, expect } from "vitest";
import { AgentLoop } from "../src/services/agent/agentLoop";

const TOOLS = new Set(["create_note", "read_note", "search_notes", "web_search"]);

describe("AgentLoop fallback tool-call parser (B12/B13)", () => {
    test("parses <tool_call> XML wrapper", () => {
        const text = 'Let me do that.\n<tool_call>\n{"tool": "read_note", "arguments": {"path": "a.md"}}\n</tool_call>';
        const parsed = AgentLoop.extractJsonToolCall(text, TOOLS);
        expect(parsed?.name).toBe("read_note");
        expect(parsed?.args).toEqual({ path: "a.md" });
        expect(AgentLoop.containsJsonToolCall(text, TOOLS)).toBe(true);
    });

    test("parses fenced JSON with explicit tool key", () => {
        const text = 'Here you go:\n```json\n{"tool": "search_notes", "arguments": {"query": "recipes"}}\n```';
        const parsed = AgentLoop.extractJsonToolCall(text, TOOLS);
        expect(parsed?.name).toBe("search_notes");
    });

    test("does NOT trigger on arbitrary JSON examples (B12 regression)", () => {
        const examples = [
            'An example object: ```json\n{"name": "John", "age": 30}\n```',
            'A function shape looks like {"function": "utils.readFile"} in this codebase.',
            'Config sample: {"action": "start", "mode": "fast"} in the docs.',
            'Here is {"name": "Пётр"} as a JSON sample without fences.'
        ];
        for (const text of examples) {
            expect(AgentLoop.containsJsonToolCall(text, TOOLS)).toBe(false);
        }
    });

    test("rejects unknown tool names not present in the registry", () => {
        const text = '{"tool": "delete_everything", "arguments": {}}';
        expect(AgentLoop.extractJsonToolCall(text, TOOLS)).toBeNull();
        expect(AgentLoop.containsJsonToolCall(text, TOOLS)).toBe(false);
    });

    test("accepts registry tool by name when args key present (name+arguments)", () => {
        const text = '{"name": "read_note", "arguments": {"path": "b.md"}}';
        expect(AgentLoop.extractJsonToolCall(text, TOOLS)?.name).toBe("read_note");
    });

    test("handles nested braces inside string arguments without truncation", () => {
        const nested = '{"tool": "create_note", "arguments": {"path": "a.md", "content": "body { color: red; }"}}';
        const parsed = AgentLoop.extractJsonToolCall(nested, TOOLS);
        expect(parsed?.args).toEqual({ path: "a.md", content: "body { color: red; }" });
    });

    test("incomplete <tool_call> tags (streaming artifacts) are ignored", () => {
        expect(AgentLoop.containsJsonToolCall('<tool_call>{"tool": "read_note"', TOOLS)).toBe(false);
    });

    test("parses multiple XML blocks and picks the valid one (B13)", () => {
        const text = '<tool_call>{"tool": "not_a_tool"}</tool_call>\n<tool_call>{"tool": "web_search", "arguments": {"q": "x"}}</tool_call>';
        expect(AgentLoop.extractJsonToolCall(text, TOOLS)?.name).toBe("web_search");
    });
});
