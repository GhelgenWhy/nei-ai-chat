import { describe, test, expect } from "vitest";
import { TFile } from "obsidian";
import { MemoryStore } from "../src/services/memory/memoryStore";

describe("MemoryStore Tests", () => {
    test("loadMemory & addFact storing facts", async () => {
        let fileContent = "";
        const mockFile = Object.create(TFile.prototype);

        const mockApp: any = {
            vault: {
                getAbstractFileByPath: () => fileContent ? mockFile : null,
                read: async () => fileContent,
                modify: async (_file: any, content: string) => { fileContent = content; },
                create: async (_path: string, content: string) => { fileContent = content; return mockFile; },
                createFolder: async () => {}
            }
        };

        const settings: any = {
            memoryFile: ".nei/memory.json"
        };

        const initialMemory = await MemoryStore.loadMemory(mockApp, settings);
        expect(initialMemory.learnedFacts).toEqual([]);

        await MemoryStore.addFact(mockApp, settings, "User prefers dark mode");
        const updatedMemory = await MemoryStore.loadMemory(mockApp, settings);
        expect(updatedMemory.learnedFacts).toContain("User prefers dark mode");
    });
});
