import { describe, test, expect } from "vitest";
import { ContextManager } from "../src/services/agent/contextManager";
import { hashString } from "../src/services/agent/agentLoop";
import { ChatMessage } from "../src/services/llm";

function msg(role: ChatMessage["role"], content: string, images?: string[]): ChatMessage {
    return images ? { role, content, images } : { role, content };
}

describe("ContextManager.pruneHistory", () => {
    test("keeps system messages and applies turn window", () => {
        const history: ChatMessage[] = [
            msg("system", "sys"),
            msg("user", "u1"),
            msg("assistant", "a1"),
            msg("user", "u2"),
            msg("assistant", "a2")
        ];
        const pruned = ContextManager.pruneHistory(history, 2);
        const nonSystem = pruned.filter(m => m.role !== "system");
        expect(nonSystem.map(m => m.content)).toEqual(["u1", "a1", "u2", "a2"].slice(-2));
        expect(pruned[0].content).toBe("sys");
    });

    test("enforces character budget by dropping oldest messages", () => {
        const history: ChatMessage[] = [
            msg("user", "x".repeat(20000)),
            msg("assistant", "y".repeat(20000)),
            msg("user", "short")
        ];
        const pruned = ContextManager.pruneHistory(history, 10, 24000);
        expect(pruned.some(m => m.content === "short")).toBe(true);
        expect(pruned.some(m => m.content.startsWith("xxxx"))).toBe(false);
    });

    test("compacts oversized tool messages inside the window", () => {
        const history: ChatMessage[] = [msg("tool", "t".repeat(10000))];
        const pruned = ContextManager.pruneHistory(history, 10);
        expect(pruned[0].content.length).toBeLessThan(5000);
        expect(pruned[0].content).toContain("Сжато системой NEI");
    });
});

describe("ContextManager.stripImages (B10: no image re-upload per turn)", () => {
    test("strips images from all messages by default", () => {
        const history: ChatMessage[] = [
            msg("user", "with pic", ["data:image/png;base64,AAA"]),
            msg("assistant", "ok"),
            msg("user", "plain")
        ];
        const stripped = ContextManager.stripImages(history, 0);
        expect(stripped.every(m => !m.images)).toBe(true);
        expect(stripped.map(m => m.content)).toEqual(["with pic", "ok", "plain"]);
    });

    test("keeps images on the last N user messages", () => {
        const history: ChatMessage[] = [
            msg("user", "old pic", ["data:image/png;base64,OLD"]),
            msg("user", "new pic", ["data:image/png;base64,NEW"])
        ];
        const stripped = ContextManager.stripImages(history, 1);
        expect(stripped[0].images).toBeUndefined();
        expect(stripped[1].images).toEqual(["data:image/png;base64,NEW"]);
    });

    test("does not mutate the input array", () => {
        const history: ChatMessage[] = [msg("user", "pic", ["AAA"])];
        ContextManager.stripImages(history, 0);
        expect(history[0].images).toEqual(["AAA"]);
    });
});

describe("hashString (B6 cache key ingredient)", () => {
    test("is deterministic and content-sensitive", () => {
        expect(hashString("abc")).toBe(hashString("abc"));
        expect(hashString("abc")).not.toBe(hashString("abd"));
    });

    test("different content with equal length produces different hashes", () => {
        // Regression for the old length-based cache key
        expect(hashString("aaaa")).not.toBe(hashString("bbbb"));
    });
});
