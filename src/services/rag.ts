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
const WORD_RE = /[^.,/#!$%^&*;:{}=\-_`~()?"'\s]+/g;

function tokenize(text: string): string[] {
    const matches = text.toLowerCase().match(WORD_RE);
    if (!matches) return [];
    return matches.filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

// Token cache for files that matched a query at least once. Keyed by path,
// invalidated by mtime — modify/delete/create need no explicit listeners.
// Bounded to avoid unbounded memory growth on very large vaults.
const tokenCache = new Map<string, { mtime: number; tokens: string[] }>();
const TOKEN_CACHE_MAX = 500;

function getTokensCached(file: TFile, content: string): string[] {
    const mtime = file.stat?.mtime ?? 0;
    const cached = tokenCache.get(file.path);
    if (cached && cached.mtime === mtime) return cached.tokens;
    const tokens = tokenize(content);
    if (tokenCache.size >= TOKEN_CACHE_MAX) {
        const oldest = tokenCache.keys().next().value;
        if (oldest !== undefined) tokenCache.delete(oldest);
    }
    tokenCache.set(file.path, { mtime, tokens });
    return tokens;
}

/** Runs an async worker over items with bounded parallelism. */
async function forEachWithConcurrency<T>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<void>
): Promise<void> {
    let index = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (index < items.length) {
            const item = items[index++];
            await fn(item);
        }
    });
    await Promise.all(workers);
}

/**
 * Improved TF-IDF search with IDF weighting and length normalization.
 * Pass 1 (no tokenization): document frequency via substring match on cached content.
 * Pass 2: tokenize ONLY matching files (mtime-cached) — the dominant cost of the
 * previous implementation was re-tokenizing every file in the vault per query.
 */
export async function searchVaultLexical(app: App, query: string, limit = 5, snippetLength = 1000): Promise<SearchResult[]> {
    const files = app.vault.getMarkdownFiles();
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const docFreq: Record<string, number> = {};
    const candidates: Array<{ file: TFile; contentLower: string; content: string }> = [];

    await forEachWithConcurrency(files, 8, async (file) => {
        let content = "";
        try {
            content = await app.vault.cachedRead(file);
        } catch {
            return;
        }
        if (!content) return;
        const contentLower = content.toLowerCase();
        let matched = false;
        for (const qToken of queryTokens) {
            if (contentLower.includes(qToken)) {
                docFreq[qToken] = (docFreq[qToken] || 0) + 1;
                matched = true;
            }
        }
        if (matched) {
            candidates.push({ file, contentLower, content });
        }
    });

    const totalDocs = files.length || 1;
    const results: SearchResult[] = [];

    for (const { file, contentLower, content } of candidates) {
        const fileTokens = getTokensCached(file, contentLower);
        if (fileTokens.length === 0) continue;

        let score = 0;
        for (const qToken of queryTokens) {
            const tf = fileTokens.reduce((n, t) => (t.includes(qToken) ? n + 1 : n), 0);
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
    text: string,
    signal?: AbortSignal
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
