import { App, TFile, normalizePath } from "obsidian";

export interface NeiMemory {
    userPreferences: Record<string, unknown>;
    projectContexts: Record<string, string>;
    learnedFacts: string[];
    lastUpdated: string;
}

const DEFAULT_MEMORY: NeiMemory = {
    userPreferences: {},
    projectContexts: {},
    learnedFacts: [],
    lastUpdated: new Date().toISOString()
};

export class MemoryStore {
    private static MEMORY_PATH = ".nei/memory.json";
    private static AGENTS_RULES_PATH = ".nei/AGENTS.md";

    public static async loadMemory(app: App): Promise<NeiMemory> {
        try {
            const file = app.vault.getAbstractFileByPath(this.MEMORY_PATH);
            if (file instanceof TFile) {
                const content = await app.vault.read(file);
                const parsed = JSON.parse(content) as Partial<NeiMemory>;
                return Object.assign({}, DEFAULT_MEMORY, parsed);
            }
        } catch (e: unknown) {
            console.error("[NEI Memory] Ошибка чтения memory.json:", e);
        }
        return DEFAULT_MEMORY;
    }

    public static async saveMemory(app: App, memory: NeiMemory): Promise<void> {
        try {
            memory.lastUpdated = new Date().toISOString();
            const content = JSON.stringify(memory, null, 2);
            await this.ensureFolder(app, ".nei");
            
            const file = app.vault.getAbstractFileByPath(this.MEMORY_PATH);
            if (file instanceof TFile) {
                await app.vault.modify(file, content);
            } else {
                await app.vault.create(this.MEMORY_PATH, content);
            }
        } catch (e: unknown) {
            console.error("[NEI Memory] Ошибка сохранения memory.json:", e);
        }
    }

    public static async addFact(app: App, fact: string): Promise<void> {
        const memory = await this.loadMemory(app);
        if (!memory.learnedFacts.includes(fact)) {
            memory.learnedFacts.push(fact);
            await this.saveMemory(app, memory);
        }
    }

    public static async loadAgentsRules(app: App): Promise<string> {
        try {
            const file = app.vault.getAbstractFileByPath(this.AGENTS_RULES_PATH);
            if (file instanceof TFile) {
                return await app.vault.read(file);
            }
        } catch (e: unknown) {
            /* ignore rules read error */
        }
        return "";
    }

    private static async ensureFolder(app: App, folderPath: string): Promise<void> {
        const norm = normalizePath(folderPath);
        const folder = app.vault.getAbstractFileByPath(norm);
        if (!folder) {
            await app.vault.createFolder(norm);
        }
    }
}
