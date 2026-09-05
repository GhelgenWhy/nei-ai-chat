import { App, TFile, normalizePath } from "obsidian";
import { NeiAiChatSettings } from "../../../main";
import { DEFAULT_MEMORY_FILE, DEFAULT_AGENT_RULES_FILE } from "../../utils/defaults";

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
    private static getMemoryPath(settings?: NeiAiChatSettings): string {
        return settings?.memoryFile || DEFAULT_MEMORY_FILE;
    }

    private static getAgentsRulesPath(settings?: NeiAiChatSettings): string {
        const memoryPath = this.getMemoryPath(settings);
        const parts = memoryPath.split("/");
        if (parts.length > 1) {
            parts.pop();
            return `${parts.join("/")}/AGENTS.md`;
        }
        return DEFAULT_AGENT_RULES_FILE;
    }

    public static async loadMemory(app: App, settings?: NeiAiChatSettings): Promise<NeiMemory> {
        try {
            const memoryPath = this.getMemoryPath(settings);
            const file = app.vault.getAbstractFileByPath(memoryPath);
            if (file instanceof TFile) {
                const content = await app.vault.read(file);
                const parsed = JSON.parse(content) as Partial<NeiMemory>;
                return Object.assign({}, DEFAULT_MEMORY, parsed);
            }
        } catch (e: unknown) {
            console.error("[NEI Memory] Error reading memory.json:", e);
        }
        return DEFAULT_MEMORY;
    }

    public static async saveMemory(app: App, settings: NeiAiChatSettings | undefined, memory: NeiMemory): Promise<void> {
        try {
            memory.lastUpdated = new Date().toISOString();
            const content = JSON.stringify(memory, null, 2);
            const memoryPath = this.getMemoryPath(settings);
            const parts = memoryPath.split("/");
            if (parts.length > 1) {
                parts.pop();
                await this.ensureFolder(app, parts.join("/"));
            }
            
            const file = app.vault.getAbstractFileByPath(memoryPath);
            if (file instanceof TFile) {
                await app.vault.modify(file, content);
            } else {
                await app.vault.create(memoryPath, content);
            }
        } catch (e: unknown) {
            console.error("[NEI Memory] Error saving memory.json:", e);
        }
    }

    public static async addFact(app: App, settings: NeiAiChatSettings | undefined, fact: string): Promise<void> {
        const memory = await this.loadMemory(app, settings);
        if (!memory.learnedFacts.includes(fact)) {
            memory.learnedFacts.push(fact);
            await this.saveMemory(app, settings, memory);
        }
    }

    public static async loadAgentsRules(app: App, settings?: NeiAiChatSettings): Promise<string> {
        try {
            const rulesPath = this.getAgentsRulesPath(settings);
            const file = app.vault.getAbstractFileByPath(rulesPath);
            if (file instanceof TFile) {
                return await app.vault.read(file);
            }
        } catch {
            /* ignore rules read error */
        }
        return "";
    }

    private static async ensureFolder(app: App, path: string): Promise<void> {
        const normalized = normalizePath(path);
        const folder = app.vault.getAbstractFileByPath(normalized);
        if (!folder) {
            await app.vault.createFolder(normalized);
        }
    }

    static async createAgentSkill(
        app: App,
        settings: NeiAiChatSettings,
        name: string,
        description: string,
        instructions: string
    ): Promise<string> {
        const skillsFolder = settings.skillsFolder || '.nei/skills';
        const { ensureFolderExists } = await import('../tools/vaultTools');
        await ensureFolderExists(app, skillsFolder);
        
        const fileName = `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
        const filePath = `${skillsFolder}/${fileName}`;
        
        const content = `---\nname: ${name}\ndescription: ${description}\n---\n\n${instructions}`;
        
        try {
            const existing = app.vault.getAbstractFileByPath(filePath);
            if (existing) {
                return `Skill '${name}' already exists at ${filePath}`;
            }
            await app.vault.create(filePath, content);
            return `Skill '${name}' created at ${filePath}`;
        } catch (e: unknown) {
            const err = e as { message?: string };
            return `Error creating skill: ${err?.message || String(e)}`;
        }
    }
}
