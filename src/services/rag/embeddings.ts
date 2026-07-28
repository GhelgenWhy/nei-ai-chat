export interface EmbeddingProvider {
    name: string;
    embed(texts: string[]): Promise<number[][]>;
}

async function httpPostJson(url: string, body: Record<string, unknown>, headers: Record<string, string> = {}): Promise<any> {
    if (typeof fetch === 'function') {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(body)
        });
        return await res.json();
    }
    try {
        const obsidian = await import("obsidian");
        const res = await obsidian.requestUrl({
            url,
            method: "POST",
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(body)
        });
        return res.json;
    } catch {
        throw new Error("HTTP request failed");
    }
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
    name = "ollama";

    constructor(private endpoint: string = "http://localhost:11434", private model: string = "nomic-embed-text") {}

    async embed(texts: string[]): Promise<number[][]> {
        const results: number[][] = [];
        const url = this.endpoint.endsWith('/') ? `${this.endpoint}api/embeddings` : `${this.endpoint}/api/embeddings`;
        for (const text of texts) {
            try {
                const data = await httpPostJson(url, { model: this.model, prompt: text });
                results.push(data.embedding || []);
            } catch {
                results.push([]);
            }
        }
        return results;
    }
}

export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
    name = "openrouter";

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
            return (data.data || []).map((item: any) => item.embedding);
        } catch {
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
