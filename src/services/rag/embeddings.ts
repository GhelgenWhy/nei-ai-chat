import { requestUrl } from "obsidian";

export interface EmbeddingProvider {
    name: string;
    dimension: number;
    embed(texts: string[]): Promise<number[][]>;
}

async function httpPostJson(url: string, body: Record<string, unknown>, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
    const res = await requestUrl({
        url,
        method: "POST",
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body)
    }) as unknown as { json: Record<string, unknown> };
    return res.json;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
    name = "ollama";
    dimension = 768;
    maxBatchSize = 50;

    constructor(private endpoint: string = "http://localhost:11434", private model: string = "nomic-embed-text") {}

    async embed(texts: string[]): Promise<number[][]> {
        const results: number[][] = [];
        const url = this.endpoint.endsWith('/') ? `${this.endpoint}api/embeddings` : `${this.endpoint}/api/embeddings`;
        
        for (let i = 0; i < texts.length; i += this.maxBatchSize) {
            const batch = texts.slice(i, i + this.maxBatchSize);
            for (const text of batch) {
                try {
                    const data = await httpPostJson(url, { model: this.model, prompt: text });
                    const embedding = Array.isArray(data.embedding) ? (data.embedding as number[]) : [];
                    results.push(embedding);
                } catch (e: unknown) {
                    const err = e as { message?: string };
                    console.warn(`[OllamaEmbedding] Error embedding text: ${err?.message || String(e)}`);
                    results.push([]);
                }
            }
        }
        return results;
    }
}

export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
    name = "openrouter";
    dimension = 1536;
    maxBatchSize = 50;

    constructor(
        private endpoint: string = "https://openrouter.ai/api/v1",
        private apiKey: string = "",
        private model: string = "openai/text-embedding-3-small"
    ) {}

    async embed(texts: string[]): Promise<number[][]> {
        const url = this.endpoint.endsWith('/') ? `${this.endpoint}embeddings` : `${this.endpoint}/embeddings`;
        const headers: Record<string, string> = {};
        if (this.apiKey) {
            headers["Authorization"] = `Bearer ${this.apiKey}`;
        }
        try {
            const data = await httpPostJson(url, { model: this.model, input: texts }, headers);
            const items = Array.isArray(data.data) ? (data.data as Array<{ embedding?: number[] }>) : [];
            return items.map(item => (Array.isArray(item.embedding) ? item.embedding : []));
        } catch (e: unknown) {
            const err = e as { message?: string };
            console.warn(`[OpenRouterEmbedding] Error embedding text: ${err?.message || String(e)}`);
            return [];
        }
    }
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA.length || !vecB.length || vecA.length !== vecB.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
