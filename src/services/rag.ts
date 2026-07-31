import { App, TFile, requestUrl } from "obsidian";

export interface SearchResult {
    file: TFile;
    content: string;
    score: number;
}

// Common stop words that add noise to search results
const STOP_WORDS = new Set([
    // Russian
    "и", "в", "на", "не", "что", "это", "как", "он", "она", "они", "мы", "вы",
    "все", "так", "его", "но", "да", "ты", "по", "от", "за", "для", "из", "же",
    "то", "бы", "ее", "при", "или", "уже", "до", "нет", "если", "них", "был",
    "без", "ещё", "быть", "мой", "чем", "эти", "где", "мне", "них", "тут",
    // English
    "the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her",
    "was", "one", "our", "out", "has", "have", "been", "from", "this", "that",
    "with", "they", "will", "each", "make", "like", "just", "than", "them", "very",
    "when", "what", "your", "about", "would", "there", "their", "which", "could",
    "other", "into", "more", "some", "time", "also", "its", "only", "over"
]);

/**
 * Clean and tokenize text for TF-IDF, filtering stop words.
 */
function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, " ")
        .split(/\s+/)
        .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Improved TF-IDF search with IDF weighting and length normalization.
 */
export async function searchVaultLexical(app: App, query: string, limit = 5, snippetLength = 1000): Promise<SearchResult[]> {
    const files = app.vault.getMarkdownFiles();
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    // First pass: compute document frequency (DF) for each query token
    const docFreq: Record<string, number> = {};
    const fileContents: Map<TFile, string> = new Map();

    const readResults = await Promise.all(
        files.map(async (file) => {
            try {
                const content = await app.vault.cachedRead(file);
                return { file, content };
            } catch {
                return { file, content: "" };
            }
        })
    );

    for (const { file, content } of readResults) {
        if (!content) continue;
        fileContents.set(file, content);

        const contentLower = content.toLowerCase();
        for (const qToken of queryTokens) {
            if (contentLower.includes(qToken)) {
                docFreq[qToken] = (docFreq[qToken] || 0) + 1;
            }
        }
    }

    const totalDocs = fileContents.size || 1;
    const results: SearchResult[] = [];

    // Second pass: score each file with TF-IDF
    for (const [file, content] of fileContents) {
        const fileTokens = tokenize(content);
        if (fileTokens.length === 0) continue;

        let score = 0;
        for (const qToken of queryTokens) {
            const tf = fileTokens.filter(t => t.includes(qToken)).length;
            if (tf === 0) continue;

            // IDF: rare tokens get higher weight
            const df = docFreq[qToken] || 1;
            const idf = Math.log(totalDocs / df) + 1;

            score += tf * idf;
        }

        if (score > 0) {
            // Length normalization: prevent long documents from always winning
            const normalizedScore = score / Math.sqrt(fileTokens.length);
            results.push({
                file,
                content: content.slice(0, snippetLength),
                score: normalizedScore
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
        }) as unknown as { status: number; json: { embedding: number[] } };
        if (response.status < 200 || response.status >= 300) {
            throw new Error(`Ollama embedding error status ${response.status}`);
        }
        return response.json.embedding;
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
        }) as unknown as { status: number; json: { data: Array<{ embedding: number[] }> } };
        if (response.status < 200 || response.status >= 300) {
            throw new Error(`API embedding error status ${response.status}`);
        }
        return response.json.data[0].embedding;
    }
}
