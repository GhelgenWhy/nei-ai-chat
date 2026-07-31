import { App, TFile } from "obsidian";
import { EmbeddingProvider, cosineSimilarity, OllamaEmbeddingProvider, OpenRouterEmbeddingProvider } from "./embeddings";
import { NeiAiChatSettings } from "../../../main";
import { searchVaultLexical } from "../rag";

export interface VectorChunkResult {
    file: TFile;
    content: string;
    score: number;
}

export class VectorIndex {
    private chunks: Array<{ file: TFile; content: string; embedding: number[] }> = [];

    private static chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += chunkSize - overlap) {
            chunks.push(text.slice(i, i + chunkSize));
            if (i + chunkSize >= text.length) break;
        }
        return chunks.length > 0 ? chunks : [text.substring(0, chunkSize)];
    }

    public async indexVault(app: App, provider: EmbeddingProvider, limit: number = 200): Promise<void> {
        const files = app.vault.getMarkdownFiles();
        this.chunks = [];

        const fileTexts: Array<{ file: TFile; text: string }> = [];
        let fileCount = 0;
        for (const file of files) {
            if (fileCount >= limit) break;
            try {
                const content = await app.vault.read(file);
                if (content.trim()) {
                    const textChunks = VectorIndex.chunkText(content);
                    for (const chunk of textChunks) {
                        fileTexts.push({ file, text: chunk });
                    }
                    fileCount++;
                }
            } catch {
                /* ignore unreadable file */
            }
        }

        if (fileTexts.length === 0) return;

        try {
            const embeddings = await provider.embed(fileTexts.map(ft => ft.text));
            for (let i = 0; i < fileTexts.length; i++) {
                if (embeddings[i] && embeddings[i].length > 0) {
                    this.chunks.push({
                        file: fileTexts[i].file,
                        content: fileTexts[i].text,
                        embedding: embeddings[i]
                    });
                }
            }
        } catch {
            /* ignore embedding errors */
        }
    }

    public async search(provider: EmbeddingProvider, query: string, topK: number = 5): Promise<VectorChunkResult[]> {
        if (this.chunks.length === 0 || !query.trim()) return [];

        try {
            const queryEmbeddings = await provider.embed([query]);
            const qVec = queryEmbeddings[0];
            if (!qVec || !qVec.length) return [];

            const scored = this.chunks.map(chunk => ({
                file: chunk.file,
                content: chunk.content,
                score: cosineSimilarity(qVec, chunk.embedding)
            }));

            scored.sort((a, b) => b.score - a.score);
            return scored.slice(0, topK);
        } catch {
            return [];
        }
    }
}

/**
 * Combines Lexical (TF-IDF) search and Semantic vector search using Reciprocal Rank Fusion (RRF).
 */
export async function searchVaultHybrid(
    app: App,
    query: string,
    settings: NeiAiChatSettings,
    limit: number = 5
): Promise<Array<{ file: TFile; content: string; score: number }>> {
    const lexicalResults = await searchVaultLexical(app, query, limit, settings.ragSnippetLength);

    if (!settings.enableSemanticRag) {
        return lexicalResults;
    }

    let provider: EmbeddingProvider;
    if (settings.embeddingProvider === 'ollama') {
        provider = new OllamaEmbeddingProvider(settings.embeddingEndpoint, settings.embeddingModel);
    } else {
        provider = new OpenRouterEmbeddingProvider(settings.endpointUrl, settings.apiKey, settings.embeddingModel);
    }

    const vectorIndex = new VectorIndex();
    await vectorIndex.indexVault(app, provider, 20);
    const vectorResults = await vectorIndex.search(provider, query, limit);

    // Reciprocal Rank Fusion (RRF) with k = 60
    const scoreMap = new Map<string, { file: TFile; content: string; rrfScore: number }>();

    const k = 60;

    lexicalResults.forEach((res, rank) => {
        const path = res.file.path;
        const rrf = 1 / (k + (rank + 1));
        const existing = scoreMap.get(path);
        if (existing) {
            existing.rrfScore += rrf;
        } else {
            scoreMap.set(path, { file: res.file, content: res.content, rrfScore: rrf });
        }
    });

    vectorResults.forEach((res, rank) => {
        const path = res.file.path;
        const rrf = 1 / (k + (rank + 1));
        const existing = scoreMap.get(path);
        if (existing) {
            existing.rrfScore += rrf;
        } else {
            scoreMap.set(path, { file: res.file, content: res.content, rrfScore: rrf });
        }
    });

    const combined = Array.from(scoreMap.values()).map(item => ({
        file: item.file,
        content: item.content,
        score: item.rrfScore
    }));

    combined.sort((a, b) => b.score - a.score);
    return combined.slice(0, limit);
}
