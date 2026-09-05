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

    async onOpen(): Promise<void> {
        const container = this.contentEl;
        container.empty();
        container.addClass("nei-chat-view-container");
        const rootEl = container.createDiv({ cls: "nei-chat-view-root" });
        this.root = createRoot(rootEl);
        
        this.root.render(
            React.createElement(ChatPanel, {
                app: this.app,
                viewLeaf: this.leaf,
                viewComponent: this,
                settings: this.plugin.settings,
                // Live accessor: settings changed via saveSettings take effect
                // on the next request without remounting the panel (N1)
                getSettings: () => this.plugin.settings,
                saveSettings: async (newSettings: NeiAiChatSettings) => {
                    this.plugin.settings = newSettings;
                    await this.plugin.saveSettings();
                },
                toolRegistry: this.plugin.toolRegistry
            })
        );
    }

    async onClose(): Promise<void> {
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }

        // If closing a main tab and no other NEI chat view remains open, return chat to right sidebar.
        // Debounced on the plugin to avoid duplicate views from rapid open/close cycles (B11).
        const isMainTab = this.leaf.getRoot() === this.app.workspace.rootSplit;
        if (isMainTab) {
            this.plugin.scheduleSidebarReopen();
        }
    }
}
