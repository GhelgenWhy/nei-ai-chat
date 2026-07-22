import { App, TFile, TFolder, normalizePath } from "obsidian";
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
            const indexFile = app.vault.getAbstractFileByPath(this.INDEX_FILE);
            if (indexFile instanceof TFile) {
                const content = await app.vault.read(indexFile);
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
            const file = app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                const content = await app.vault.read(file);
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

            // 1. Save session file
            const sessionPath = `${this.CHATS_FOLDER}/${session.id}.json`;
            const content = JSON.stringify(session, null, 2);
            const file = app.vault.getAbstractFileByPath(sessionPath);
            if (file instanceof TFile) {
                await app.vault.modify(file, content);
            } else {
                await app.vault.create(sessionPath, content);
            }

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

            const indexFile = app.vault.getAbstractFileByPath(this.INDEX_FILE);
            const indexContent = JSON.stringify(sessions, null, 2);
            if (indexFile instanceof TFile) {
                await app.vault.modify(indexFile, indexContent);
            } else {
                await app.vault.create(this.INDEX_FILE, indexContent);
            }
        } catch (e) {
            console.error("[NEI ChatStore] Error saving session:", e);
        }
    }

    public static async deleteSession(app: App, sessionId: string): Promise<void> {
        try {
            const path = `${this.CHATS_FOLDER}/${sessionId}.json`;
            const file = app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                await app.vault.delete(file);
            }

            const sessions = await this.listSessions(app);
            const filtered = sessions.filter(s => s.id !== sessionId);

            const indexFile = app.vault.getAbstractFileByPath(this.INDEX_FILE);
            if (indexFile instanceof TFile) {
                await app.vault.modify(indexFile, JSON.stringify(filtered, null, 2));
            }
        } catch (e) {
            console.error(`[NEI ChatStore] Error deleting session ${sessionId}:`, e);
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
        const folder = app.vault.getAbstractFileByPath(norm);
        if (!folder) {
            // Create parent folders recursively if needed
            const parts = norm.split("/");
            let current = "";
            for (const part of parts) {
                current = current ? `${current}/${part}` : part;
                const existing = app.vault.getAbstractFileByPath(current);
                if (!existing) {
                    await app.vault.createFolder(current);
                }
            }
        }
    }
}
