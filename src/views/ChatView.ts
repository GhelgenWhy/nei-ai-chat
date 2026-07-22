import { ItemView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { ChatPanel } from "../components/ChatPanel";
import NeiAiChatPlugin from "../../main";

export const VIEW_TYPE_NEI_CHAT = "nei-chat-view";

export class NeiChatView extends ItemView {
    root: ReactDOM.Root | null = null;
    plugin: NeiAiChatPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: NeiAiChatPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_NEI_CHAT;
    }

    getDisplayText(): string {
        return "NEI ИИ Чат";
    }

    getIcon(): string {
        return "bot";
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        const rootEl = container.createEl("div", { cls: "nei-chat-view-root" });
        rootEl.style.height = "100%";
        this.root = ReactDOM.createRoot(rootEl);
        
        this.root.render(
            React.createElement(ChatPanel, {
                app: this.app,
                settings: this.plugin.settings,
                saveSettings: async (newSettings: any) => {
                    this.plugin.settings = newSettings;
                    await this.plugin.saveSettings();
                }
            })
        );
    }

    async onClose() {
        if (this.root) {
            this.root.unmount();
        }
    }
}
