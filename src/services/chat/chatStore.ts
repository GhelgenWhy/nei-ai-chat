import { App, normalizePath } from "obsidian";
import { ChatMessage } from "../llm";
import { AgentStep } from "../agent/agentLoop";

export interface ChatSession {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: ChatMessage[];
    steps?: AgentStep[];
}

export class ChatStore {
    private static CHATS_FOLDER = ".nei/chats";
    private static INDEX_FILE = ".nei/chats/index.json";

    public static async listSessions(app: App): Promise<{ id: string; title: string; updatedAt: string }[]> {
        try {
            if (await app.vault.adapter.exists(this.INDEX_FILE)) {
                const content = await app.vault.adapter.read(this.INDEX_FILE);
                return JSON.parse(content);
            }
        } catch (e) {
            console.error("[NEI ChatStore] Error reading chat index:", e);
        }
        return [];
    }

    public static async loadSession(app: App, sessionId: string): Promise<ChatSession | null> {
        const path = `${this.CHATS_FOLDER}/${sessionId}.json`;
        try {
            if (await app.vault.adapter.exists(path)) {
                const content = await app.vault.adapter.read(path);
                return JSON.parse(content);
            }
        } catch (e) {
            console.error(`[NEI ChatStore] Error loading session ${sessionId}:`, e);
        }
        return null;
    }

    public static async saveSession(app: App, session: ChatSession): Promise<void> {
        try {
            await this.ensureFolder(app, this.CHATS_FOLDER);
            session.updatedAt = new Date().toISOString();

            // 1. Save session file via vault adapter
            const sessionPath = `${this.CHATS_FOLDER}/${session.id}.json`;
            const content = JSON.stringify(session, null, 2);
            await app.vault.adapter.write(sessionPath, content);

            // 2. Update index
            const sessions = await this.listSessions(app);
            const existingIdx = sessions.findIndex(s => s.id === session.id);
            const summary = {
                id: session.id,
                title: session.title || "Новый чат",
                updatedAt: session.updatedAt
            };

            if (existingIdx >= 0) {
                sessions[existingIdx] = summary;
            } else {
                sessions.unshift(summary);
            }

            const indexContent = JSON.stringify(sessions, null, 2);
            await app.vault.adapter.write(this.INDEX_FILE, indexContent);
        } catch (e) {
            console.error("[NEI ChatStore] Error saving session:", e);
        }
    }

    public static async deleteSession(app: App, sessionId: string): Promise<void> {
        try {
            const path = `${this.CHATS_FOLDER}/${sessionId}.json`;
            if (await app.vault.adapter.exists(path)) {
                await app.vault.adapter.remove(path);
            }

            const sessions = await this.listSessions(app);
            const filtered = sessions.filter(s => s.id !== sessionId);

            await app.vault.adapter.write(this.INDEX_FILE, JSON.stringify(filtered, null, 2));
        } catch (e) {
            console.error(`[NEI ChatStore] Error deleting session ${sessionId}:`, e);
        }
    }

    public static async clearAllSessions(app: App): Promise<void> {
        try {
            const sessions = await this.listSessions(app);
            for (const s of sessions) {
                const path = `${this.CHATS_FOLDER}/${s.id}.json`;
                if (await app.vault.adapter.exists(path)) {
                    await app.vault.adapter.remove(path);
                }
            }
            await app.vault.adapter.write(this.INDEX_FILE, JSON.stringify([], null, 2));
        } catch (e) {
            console.error("[NEI ChatStore] Error clearing all sessions:", e);
        }
    }

    public static createNewSession(): ChatSession {
        const id = "chat_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
        return {
            id,
            title: "Новый диалог",
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
