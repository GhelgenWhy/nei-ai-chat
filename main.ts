import { Plugin, WorkspaceLeaf } from "obsidian";
import { NeiChatView, VIEW_TYPE_NEI_CHAT } from "./src/views/ChatView";

export interface NeiAiChatSettings {
    provider: 'openrouter' | 'ollama' | 'custom';
    endpointUrl: string;
    apiKey: string;
    model: string;
    customModels: string[];
    useRag: boolean;
}

const DEFAULT_SETTINGS: NeiAiChatSettings = {
    provider: "openrouter",
    endpointUrl: "https://openrouter.ai/api/v1",
    apiKey: "",
    model: "google/gemini-2.5-flash",
    customModels: [
        "google/gemini-2.5-flash",
        "anthropic/claude-3.5-sonnet",
        "google/gemini-2.5-pro",
        "openai/gpt-4o",
        "deepseek/deepseek-chat"
    ],
    useRag: true
};

export default class NeiAiChatPlugin extends Plugin {
    settings: NeiAiChatSettings = DEFAULT_SETTINGS;

    async onload() {
        console.log("Загрузка NEI AI Chat (Assistant) плагина...");
        await this.loadSettings();

        // Register custom view
        this.registerView(
            VIEW_TYPE_NEI_CHAT,
            (leaf) => new NeiChatView(leaf, this)
        );

        // Add Ribbon Icon for Chat
        this.addRibbonIcon("bot", "NEI ИИ Чат", () => {
            this.activateView();
        });
    }

    async onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_NEI_CHAT);
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
            workspace.revealLeaf(leaf);
        }
    }

    async loadSettings() {
        const loadedData = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
        if (!this.settings.customModels || this.settings.customModels.length === 0) {
            this.settings.customModels = DEFAULT_SETTINGS.customModels;
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
