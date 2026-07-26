import { Plugin, WorkspaceLeaf } from "obsidian";
import { NeiChatView, VIEW_TYPE_NEI_CHAT } from "./src/views/ChatView";

export interface NeiAiChatSettings {
    provider: 'openrouter' | 'ollama' | 'custom';
    endpointUrl: string;
    apiKey: string;
    model: string;
    visionModel: string;
    quickModel: string;
    executionMode: 'auto' | 'quick' | 'agent';
    customModels: string[];
    useRag: boolean;
    language: 'auto' | 'ru' | 'en' | 'es' | 'de' | 'fr' | 'zh' | 'ja' | 'pt' | 'ko';
}

const DEFAULT_SETTINGS: NeiAiChatSettings = {
    provider: "openrouter",
    endpointUrl: "https://openrouter.ai/api/v1",
    apiKey: "",
    model: "google/gemini-2.5-flash",
    visionModel: "google/gemini-2.5-flash",
    quickModel: "google/gemini-2.5-flash",
    executionMode: "auto",
    customModels: [
        "google/gemini-2.5-flash",
        "anthropic/claude-3.5-sonnet",
        "google/gemini-2.5-pro",
        "openai/gpt-4o",
        "deepseek/deepseek-chat"
    ],
    useRag: true,
    language: "auto"
};

export default class NeiAiChatPlugin extends Plugin {
    settings: NeiAiChatSettings = DEFAULT_SETTINGS;

    async onload() {
        await this.loadSettings();

        // Register custom view
        this.registerView(
            VIEW_TYPE_NEI_CHAT,
            (leaf) => new NeiChatView(leaf, this)
        );

        // Add Ribbon Icon for Chat
        this.addRibbonIcon("bot", "NEI AI Chat", () => {
            void this.activateView();
        });
    }

    onunload(): void {
        // Resources are cleaned up by Obsidian automatically
    }

    async activateView() {
        const { workspace } = this.app;
        
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_NEI_CHAT);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            // Open in right sidebar
            leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({ type: VIEW_TYPE_NEI_CHAT, active: true });
            }
        }

        if (leaf) {
            void workspace.revealLeaf(leaf);
        }
    }

    async loadSettings() {
        const loadedData = (await this.loadData()) as Partial<NeiAiChatSettings> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData || {});
        if (!this.settings.customModels || this.settings.customModels.length === 0) {
            this.settings.customModels = DEFAULT_SETTINGS.customModels;
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
