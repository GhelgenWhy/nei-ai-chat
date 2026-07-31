import { ItemView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { ChatPanel } from "../components/ChatPanel";
import { NeiAiChatPlugin, NeiAiChatSettings } from "../../main";

export const VIEW_TYPE_NEI_CHAT = "nei-chat-view";

export class NeiChatView extends ItemView {
    root: Root | null = null;
    plugin: NeiAiChatPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: NeiAiChatPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_NEI_CHAT;
    }

    getDisplayText(): string {
        return "NEI AI Chat";
    }

    getIcon(): string {
        return "bot";
    }

    async onOpen() {
        const container = this.contentEl;
        container.empty();
        container.addClass("nei-chat-view-container");
        const rootEl = container.createDiv({ cls: "nei-chat-view-root" });
        this.root = createRoot(rootEl);
        
        this.root.render(
            React.createElement(ChatPanel, {
                app: this.app,
                viewLeaf: this.leaf,
                settings: this.plugin.settings,
                saveSettings: async (newSettings: NeiAiChatSettings) => {
                    this.plugin.settings = newSettings;
                    await this.plugin.saveSettings();
                },
                toolRegistry: this.plugin.toolRegistry
            })
        );
    }

    async onClose() {
        if (this.root) {
            this.root.unmount();
        }

        // If closing a main tab and no other NEI chat view remains open, automatically return chat to right sidebar
        const isMainTab = this.leaf.getRoot() === this.app.workspace.rootSplit;
        if (isMainTab) {
            window.setTimeout(() => {
                const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_NEI_CHAT);
                if (existing.length === 0) {
                    void this.plugin.activateView();
                }
            }, 100);
        }
    }
}
