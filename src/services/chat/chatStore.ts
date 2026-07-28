import { App, normalizePath } from "obsidian";
import { ChatMessage } from "../llm";
import { AgentStep } from "../agent/agentLoop";
import { NeiAiChatSettings } from "../../../main";

export interface ChatSession {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: ChatMessage[];
    steps?: AgentStep[];
}

export class ChatStore {
    private static getChatsFolder(settings: NeiAiChatSettings): string {
        return settings.chatsFolder || ".nei/chats";
    }
    
    private static getIndexFile(settings: NeiAiChatSettings): string {
        const folder = this.getChatsFolder(settings);
        return `${folder}/index.json`;
    }

    public static async listSessions(app: App, settings: NeiAiChatSettings): Promise<{ id: string; title: string; updatedAt: string }[]> {
        try {
            const indexFile = this.getIndexFile(settings);
            if (await app.vault.adapter.exists(indexFile)) {
                const content = await app.vault.adapter.read(indexFile);
                const parsed = JSON.parse(content) as { id: string; title: string; updatedAt: string }[];
                return Array.isArray(parsed) ? parsed : [];
            }
        } catch (e: unknown) {
            console.error("[NEI ChatStore] Error reading chat index:", e);
        }
        return [];
    }

    public static async loadSession(app: App, settings: NeiAiChatSettings, sessionId: string): Promise<ChatSession | null> {
        const folder = this.getChatsFolder(settings);
        const path = `${folder}/${sessionId}.json`;
        try {
            if (await app.vault.adapter.exists(path)) {
                const content = await app.vault.adapter.read(path);
                return JSON.parse(content) as ChatSession;
            }
        } catch (e: unknown) {
            console.error(`[NEI ChatStore] Error loading session ${sessionId}:`, e);
        }
        return null;
    }

    public static async saveSession(app: App, settings: NeiAiChatSettings, session: ChatSession): Promise<void> {
        try {
            const folder = this.getChatsFolder(settings);
            await this.ensureFolder(app, folder);
            session.updatedAt = new Date().toISOString();

            // 1. Save session file via vault adapter
            const sessionPath = `${folder}/${session.id}.json`;
            const content = JSON.stringify(session, null, 2);
            await app.vault.adapter.write(sessionPath, content);

            // 2. Update index
            const sessions = await this.listSessions(app, settings);
            const existingIdx = sessions.findIndex(s => s.id === session.id);
            const summary = {
                id: session.id,
                title: session.title || "New Chat",
                updatedAt: session.updatedAt
            };

            if (existingIdx >= 0) {
                sessions[existingIdx] = summary;
            } else {
                sessions.unshift(summary);
            }

            const indexFile = this.getIndexFile(settings);
            const indexContent = JSON.stringify(sessions, null, 2);
            await app.vault.adapter.write(indexFile, indexContent);
        } catch (e: unknown) {
            console.error("[NEI ChatStore] Error saving session:", e);
        }
    }

    public static async deleteSession(app: App, settings: NeiAiChatSettings, sessionId: string): Promise<void> {
        try {
            const folder = this.getChatsFolder(settings);
            const path = `${folder}/${sessionId}.json`;
            if (await app.vault.adapter.exists(path)) {
                await app.vault.adapter.remove(path);
            }

            const sessions = await this.listSessions(app, settings);
            const filtered = sessions.filter(s => s.id !== sessionId);

            const indexFile = this.getIndexFile(settings);
            await app.vault.adapter.write(indexFile, JSON.stringify(filtered, null, 2));
        } catch (e: unknown) {
            console.error(`[NEI ChatStore] Error deleting session ${sessionId}:`, e);
        }
    }

    public static async clearAllSessions(app: App, settings: NeiAiChatSettings): Promise<void> {
        try {
            const sessions = await this.listSessions(app, settings);
            const folder = this.getChatsFolder(settings);
            for (const s of sessions) {
                const path = `${folder}/${s.id}.json`;
                if (await app.vault.adapter.exists(path)) {
                    await app.vault.adapter.remove(path);
                }
            }
            const indexFile = this.getIndexFile(settings);
            await app.vault.adapter.write(indexFile, JSON.stringify([], null, 2));
        } catch (e: unknown) {
            console.error("[NEI ChatStore] Error clearing all sessions:", e);
        }
    }

    public static createNewSession(): ChatSession {
        const id = "chat_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
        return {
            id,
            title: "New Chat",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: []
        };
    }

    private static async ensureFolder(app: App, folderPath: string): Promise<void> {
        const norm = normalizePath(folderPath);
        if (!(await app.vault.adapter.exists(norm))) {
            await app.vault.adapter.mkdir(norm);
        }
    }
}
