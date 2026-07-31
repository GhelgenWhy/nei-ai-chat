import { requestUrl } from "obsidian";

export interface ModelCapabilities {
    text: boolean;
    vision: boolean;
    audio: boolean;
    video: boolean;
    pdf: boolean;
}

export interface OpenRouterModelInfo {
    id: string;
    name: string;
    description?: string;
    contextLength?: number;
    supportsTools: boolean;
    supportsVision: boolean;
    supportsAudio: boolean;
    supportsVideo: boolean;
    supportsPdf: boolean;
    capabilities: ModelCapabilities;
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

interface RawKeyInfoResponse {
    data?: {
        label?: string;
        usage?: number;
        limit?: number | null;
        is_free_tier?: boolean;
    };
}

interface RawModelItem {
    id: string;
    name?: string;
    description?: string;
    context_length?: number;
    supported_parameters?: string[];
    architecture?: {
        modality?: string;
        input_modalities?: string[];
        output_modalities?: string[];
    };
    pricing?: {
        prompt: string;
        completion: string;
    };
}

interface RawModelsResponse {
    data?: RawModelItem[];
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

            if (response.status === 200 && response.json) {
                const json = response.json as RawKeyInfoResponse;
                if (json.data) {
                    const data = json.data;
                    return {
                        label: data.label,
                        usage: Number(data.usage || 0),
                        limit: data.limit ? Number(data.limit) : null,
                        isFreeTier: Boolean(data.is_free_tier)
                    };
                }
            }
        } catch (e: unknown) {
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

            const json = response.json as RawModelsResponse;
            const modelsData = json.data || [];
            const result: OpenRouterModelInfo[] = [];

            for (const item of modelsData) {
                const supportedParams: string[] = item.supported_parameters || [];
                const supportsTools = supportedParams.includes("tools") || supportedParams.includes("function_calling");
                
                const modalityStr = (item.architecture?.modality || "").toLowerCase();
                const inputs = (item.architecture?.input_modalities || []).map(m => m.toLowerCase());
                const modelIdLower = item.id.toLowerCase();

                let supportsVision = modalityStr.includes("multimodal") || modalityStr.includes("image") || inputs.includes("image");
                let supportsAudio = modalityStr.includes("audio") || inputs.includes("audio");
                let supportsVideo = modalityStr.includes("video") || inputs.includes("video");
                let supportsPdf = true; // All models support text/pdf text injection; vision pdf supported if vision is true

                // Model ID specific heuristics fallback
                if (modelIdLower.includes("gemini")) {
                    supportsVision = true;
                    if (modelIdLower.includes("flash") || modelIdLower.includes("pro")) {
                        supportsAudio = true;
                        supportsVideo = true;
                    }
                } else if (modelIdLower.includes("gpt-4o")) {
                    supportsVision = true;
                    if (!modelIdLower.includes("mini")) {
                        supportsAudio = true;
                    }
                } else if (modelIdLower.includes("claude-3")) {
                    supportsVision = true;
                }

                const capabilities: ModelCapabilities = {
                    text: true,
                    vision: supportsVision,
                    audio: supportsAudio,
                    video: supportsVideo,
                    pdf: supportsPdf
                };

                const info: OpenRouterModelInfo = {
                    id: item.id,
                    name: item.name || item.id,
                    description: item.description,
                    contextLength: item.context_length,
                    supportsTools,
                    supportsVision,
                    supportsAudio,
                    supportsVideo,
                    supportsPdf,
                    capabilities,
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
        } catch (e: unknown) {
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
        const found = models.find(m => m.id === modelId);
        return found || getDefaultModelCapabilities(modelId);
    }
}

export function getDefaultModelCapabilities(modelId: string): OpenRouterModelInfo {
    const lower = (modelId || "").toLowerCase();
    const supportsVision = lower.includes("gemini") || lower.includes("gpt-4o") || lower.includes("claude-3") || lower.includes("vision");
    const supportsAudio = lower.includes("gemini-2.5") || lower.includes("gemini-1.5") || (lower.includes("gpt-4o") && !lower.includes("mini")) || lower.includes("whisper") || lower.includes("audio");
    const supportsVideo = lower.includes("gemini");
    const supportsPdf = true;
    const supportsTools = true;

    return {
        id: modelId,
        name: modelId,
        supportsTools,
        supportsVision,
        supportsAudio,
        supportsVideo,
        supportsPdf,
        capabilities: {
            text: true,
            vision: supportsVision,
            audio: supportsAudio,
            video: supportsVideo,
            pdf: supportsPdf
        }
    };
}

