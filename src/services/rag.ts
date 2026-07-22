import { App, TFile } from "obsidian";

export interface SearchResult {
    file: TFile;
    content: string;
    score: number;
}

/**
 * Clean and tokenize text for TF-IDF.
 */
function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, " ")
        .split(/\s+/)
        .filter(word => word.length > 2); // Filter short words
}

/**
 * Basic TF-IDF search implementation for zero-dependency local RAG.
 */
export async function searchVaultLexical(app: App, query: string, limit = 5): Promise<SearchResult[]> {
    const files = app.vault.getMarkdownFiles();
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const docTermFreqs: Map<string, Map<string, number>> = new Map();
    const docLengths: Map<string, number> = new Map();
    const docCache: Map<string, string> = new Map();
    const fileMap: Map<string, TFile> = new Map();

    const df: Map<string, number> = new Map();

    // Index all documents
    for (const file of files) {
        // Skip hidden folder .nei
        if (file.path.startsWith(".nei/")) continue;
        
        try {
            const content = await app.vault.cachedRead(file);
            const tokens = tokenize(content);
            if (tokens.length === 0) continue;

            const termFreq: Map<string, number> = new Map();
            const uniqueTerms = new Set(tokens);
            
            for (const token of tokens) {
                termFreq.set(token, (termFreq.get(token) || 0) + 1);
            }
            
            for (const term of uniqueTerms) {
                df.set(term, (df.get(term) || 0) + 1);
            }

            docTermFreqs.set(file.path, termFreq);
            docLengths.set(file.path, tokens.length);
            docCache.set(file.path, content);
            fileMap.set(file.path, file);
        } catch (e) {
            console.error(`RAG Index error on file ${file.path}:`, e);
        }
    }

    const numDocs = docTermFreqs.size;
    if (numDocs === 0) return [];

    const results: SearchResult[] = [];

    // Calculate score for each document
    for (const [path, termFreq] of docTermFreqs.entries()) {
        let score = 0;
        const fileLen = docLengths.get(path) || 1;

        for (const token of queryTokens) {
            const tf = termFreq.get(token) || 0;
            if (tf > 0) {
                const docFreq = df.get(token) || 1;
                const idf = Math.log(numDocs / docFreq);
                // BM25-lite normalization
                const tfNorm = (tf * 2.5) / (tf + 1.5 * (0.25 + 0.75 * (fileLen / 200)));
                score += tfNorm * idf;
            }
        }

        if (score > 0) {
            const file = fileMap.get(path);
            const content = docCache.get(path) || "";
            if (file) {
                results.push({ file, content, score });
            }
        }
    }

    // Sort by score descending and return top matches
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Cosine similarity helper
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface CachedEmbedding {
    filePath: string;
    mtime: number;
    embedding: number[];
}

/**
 * Vector Search local RAG using Cached Embeddings inside the Vault.
 */
export async function searchVaultVector(
    app: App,
    queryEmbedding: number[],
    embeddingCache: CachedEmbedding[],
    limit = 5
): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    for (const cached of embeddingCache) {
        const file = app.vault.getAbstractFileByPath(cached.filePath);
        if (file instanceof TFile) {
            const similarity = cosineSimilarity(queryEmbedding, cached.embedding);
            try {
                const content = await app.vault.cachedRead(file);
                results.push({
                    file,
                    content,
                    score: similarity
                });
            } catch (e) {}
        }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Request an embedding from Ollama local API or OpenRouter.
 */
export async function fetchEmbedding(
    provider: 'ollama' | 'openrouter' | 'custom',
    endpointUrl: string,
    apiKey: string,
    model: string,
    text: string
): Promise<number[]> {
    if (provider === 'ollama') {
        const response = await fetch(`${endpointUrl.replace(/\/v1\/?$/, "")}/api/embeddings`, {
            method: "POST",
            body: JSON.stringify({ model, prompt: text })
        });
        if (!response.ok) throw new Error(`Ollama embedding error: ${response.statusText}`);
        const data = await response.json();
        return data.embedding;
    } else {
        // OpenAI / OpenRouter embedding format
        const response = await fetch(`${endpointUrl}/embeddings`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({ model, input: text })
        });
        if (!response.ok) throw new Error(`API embedding error: ${response.statusText}`);
        const data = await response.json();
        return data.data[0].embedding;
    }
}
