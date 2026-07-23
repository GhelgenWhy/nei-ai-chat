import { requestUrl } from "obsidian";

export interface OpenRouterModelInfo {
    id: string;
    name: string;
    description?: string;
    contextLength?: number;
    supportsTools: boolean;
    supportsVision: boolean;
    pricing?: {
        prompt: string;
        completion: string;
    };
}

export interface OpenRouterKeyInfo {
    label?: string;
    usage: number;
    limit: number | null;
    isFreeTier: boolean;
}

export class OpenRouterService {
    private static cachedModels: Map<string, OpenRouterModelInfo> = new Map();
    private static lastFetchTime = 0;

    /**
     * Fetches details about the user's OpenRouter API key (usage, limits).
     */
    public static async getKeyInfo(apiKey: string): Promise<OpenRouterKeyInfo | null> {
        if (!apiKey) return null;
        try {
            const response = await requestUrl({
                url: "https://openrouter.ai/api/v1/auth/key",
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${apiKey}`
                }
            });

            if (response.status === 200 && response.json?.data) {
                const data = response.json.data;
                return {
                    label: data.label,
                    usage: Number(data.usage || 0),
                    limit: data.limit ? Number(data.limit) : null,
                    isFreeTier: Boolean(data.is_free_tier)
                };
            }
        } catch (e) {
            console.error("[OpenRouterService] Error fetching key info:", e);
        }
        return null;
    }

    /**
     * Fetches all available models and their capabilities from OpenRouter API.
     */
    public static async fetchModels(apiKey?: string): Promise<OpenRouterModelInfo[]> {
        const now = Date.now();
        // Cache for 5 minutes
        if (this.cachedModels.size > 0 && (now - this.lastFetchTime < 300000)) {
            return Array.from(this.cachedModels.values());
        }

        try {
            const headers: Record<string, string> = {
                "HTTP-Referer": "https://github.com/GhelgenWhy/NEI",
                "X-Title": "NEI Obsidian Plugin"
            };
            if (apiKey) {
                headers["Authorization"] = `Bearer ${apiKey}`;
            }

            const response = await requestUrl({
                url: "https://openrouter.ai/api/v1/models",
                method: "GET",
                headers
            });

            if (response.status !== 200) {
                throw new Error(`OpenRouter API status: ${response.status}`);
            }

            const json = response.json;
            const modelsData = json.data || [];
            const result: OpenRouterModelInfo[] = [];

            for (const item of modelsData) {
                const supportedParams: string[] = item.supported_parameters || [];
                const supportsTools = supportedParams.includes("tools") || supportedParams.includes("function_calling");
                
                let supportsVision = false;
                if (item.architecture && item.architecture.modality) {
                    supportsVision = item.architecture.modality.includes("multimodal") || item.architecture.modality.includes("image");
                }

                const info: OpenRouterModelInfo = {
                    id: item.id,
                    name: item.name || item.id,
                    description: item.description,
                    contextLength: item.context_length,
                    supportsTools,
                    supportsVision,
                    pricing: item.pricing ? {
                        prompt: item.pricing.prompt,
                        completion: item.pricing.completion
                    } : undefined
                };

                this.cachedModels.set(item.id, info);
                result.push(info);
            }

            this.lastFetchTime = now;
            return result;
        } catch (e: any) {
            console.error("[OpenRouterService] Error fetching models:", e);
            return Array.from(this.cachedModels.values());
        }
    }

    /**
     * Get capability details for a specific model ID.
     */
    public static async getModelDetails(modelId: string, apiKey?: string): Promise<OpenRouterModelInfo | null> {
        if (this.cachedModels.has(modelId)) {
            return this.cachedModels.get(modelId) || null;
        }
        const models = await this.fetchModels(apiKey);
        return models.find(m => m.id === modelId) || null;
    }
}

