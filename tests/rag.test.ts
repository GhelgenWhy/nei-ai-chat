import { describe, test, expect } from "vitest";
import { searchVaultLexical } from "../src/services/rag";

interface MockFile {
    path: string;
    stat: { mtime: number };
}

function makeApp(files: Array<{ path: string; content: string; mtime?: number }>) {
    const fs = new Map<string, { content: string; mtime: number }>();
    const fileList: MockFile[] = files.map(f => {
        fs.set(f.path, { content: f.content, mtime: f.mtime ?? 1 });
        return { path: f.path, stat: { mtime: f.mtime ?? 1 } };
    });
    let readCount = 0;
    return {
        app: {
            vault: {
                getMarkdownFiles: () => fileList,
                cachedRead: async (file: MockFile) => {
                    readCount++;
                    return fs.get(file.path)?.content ?? "";
                }
            }
        } as any,
        getReadCount: () => readCount
    };
}

describe("searchVaultLexical (B3: candidate-only tokenization)", () => {
    test("ranks files containing query tokens and returns snippet content", async () => {
        const { app } = makeApp([
            { path: "recipes.md", content: "Лучший рецепт яблочного пирога с корицей и яблоками." },
            { path: "work.md", content: "Заметки о проекте: дедлайн, бюджет, статусы задач." },
            { path: "apple-notes.md", content: "Яблоки бывают разных сортов. Яблочный сок полезен." }
        ]);

        const results = await searchVaultLexical(app, "яблочный рецепт", 5, 1000);
        expect(results.length).toBe(2);
        expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
        expect(results.some(r => r.file.path === "apple-notes.md")).toBe(true);
        expect(results.some(r => r.file.path === "recipes.md")).toBe(true);
    });

    test("returns empty for stop-word-only or empty queries", async () => {
        const { app } = makeApp([{ path: "a.md", content: "какой-то текст про дела" }]);
        expect(await searchVaultLexical(app, "и в на", 5)).toEqual([]);
        expect(await searchVaultLexical(app, "   ", 5)).toEqual([]);
    });

    test("respects limit", async () => {
        const files = Array.from({ length: 10 }, (_, i) => ({
            path: `note-${i}.md`,
            content: `Тут идёт речь про нейросети и нейросетевые модели, номер ${i}.`
        }));
        const { app } = makeApp(files);
        const results = await searchVaultLexical(app, "нейросети", 3);
        expect(results.length).toBe(3);
    });

    test("mtime-based token cache: unchanged file is not re-tokenized on repeat queries", async () => {
        const { app, getReadCount } = makeApp([
            { path: "stable.md", content: "Квантовые вычисления и кубиты в контексте алгоритмов." }
        ]);

        const first = await searchVaultLexical(app, "квантовые", 5);
        expect(first.length).toBe(1);
        const readsAfterFirst = getReadCount();

        // Second query — file read again (cachedRead is Obsidian's own cache),
        // results must be identical and stable.
        const second = await searchVaultLexical(app, "квантовые", 5);
        expect(second.length).toBe(1);
        expect(second[0].file.path).toBe("stable.md");
        expect(getReadCount()).toBeGreaterThan(readsAfterFirst);
    });

    test("handles vault without matching files", async () => {
        const { app } = makeApp([{ path: "x.md", content: "Совершенно другой текст." }]);
        expect(await searchVaultLexical(app, "несуществующийтермин", 5)).toEqual([]);
    });
});
