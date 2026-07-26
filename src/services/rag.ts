import { App, TFile, requestUrl } from "obsidian";

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
        .replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, " ")
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

    const results: SearchResult[] = [];

    for (const file of files) {
        let content = "";
        try {
            content = await app.vault.cachedRead(file);
        } catch (e: unknown) {
            /* ignore read errors */
        }

        if (!content) continue;

        const fileTokens = tokenize(content);
        let score = 0;

        for (const qToken of queryTokens) {
            const occurrences = fileTokens.filter(t => t.includes(qToken)).length;
            score += occurrences;
        }

        if (score > 0) {
            results.push({
                file,
                content: content.slice(0, 1000), // Trim content preview
                score
            });
        }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
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
        const response = await requestUrl({
            url: `${endpointUrl.replace(/\/v1\/?$/, "")}/api/embeddings`,
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ model, prompt: text })
        });
        if (response.status < 200 || response.status >= 300) {
            throw new Error(`Ollama embedding error status ${response.status}`);
        }
        const data = response.json as { embedding: number[] };
        return data.embedding;
    } else {
        // OpenAI / OpenRouter embedding format
        const response = await requestUrl({
            url: `${endpointUrl}/embeddings`,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({ model, input: text })
        });
        if (response.status < 200 || response.status >= 300) {
            throw new Error(`API embedding error status ${response.status}`);
        }
        const data = response.json as { data: Array<{ embedding: number[] }> };
        return data.data[0].embedding;
    }
}
