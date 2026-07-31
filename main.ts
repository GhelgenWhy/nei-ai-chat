import { Plugin, WorkspaceLeaf } from "obsidian";
import { NeiChatView, VIEW_TYPE_NEI_CHAT } from "./src/views/ChatView";
import { ToolRegistry } from "./src/services/tools/toolRegistry";
import { McpService } from "./src/services/mcp/mcpClient";

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
    defaultNoteFolder: string;
    
    // Configurable paths (Zero Hardcoding)
    chatsFolder: string;
    memoryFile: string;
    skillsFolder: string;
    
    // Agent Configuration
    maxAgentIterations: number;
    maxPrefetchedNotes: number;
    prefetchSnippetLength: number;
    
    // RAG Configuration
    ragResultLimit: number;
    ragSnippetLength: number;
    
    // Streaming & RAG v2
    enableStreaming: boolean;
    enableSemanticRag: boolean;
    embeddingProvider: 'openrouter' | 'ollama';
    embeddingModel: string;
    embeddingEndpoint: string;

    // Safety
    confirmObsidianCommands: boolean;
    allowedObsidianCommands: string[];

    // Temporal Intelligence & Routing
    enableTemporalAwareness: boolean;
    enableAdaptivePrefetch: boolean;
    enableFreshnessSuggestions: boolean;
    enableSmartToolFiltering: boolean;
    defaultFreshnessPolicy: 'strict' | 'lenient' | 'auto';

    // Intent Routing Configuration
    intentRoutingThreshold: number;
    intentVaultKeywordWeight: number;
    intentCreationWeight: number;
    intentDeletionWeight: number;
    intentAnalysisWeight: number;
    intentSearchWeight: number;
    intentModifyWeight: number;
    intentQuestionWeight: number;
    intentCodeWeight: number;
    intentLengthWeight: number;
    intentHistoryWeight: number;
    intentAttachmentWeight: number;
    intentStaleQueryWeight: number;
    intentFreshnessWeight: number;

    // Auto-Learning
    enableAutoLearning: boolean;
    lastAutoLearnTimestamp: number;

    // Attachments & Versioning
    maxAttachmentSizeBytes: number;
    settingsVersion: number;

    // Vault Context Toggle default
    enableVaultContextDefault?: boolean;
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
    language: "auto",
    defaultNoteFolder: "",
    
    // Default paths - relative to vault root, user can customize
    chatsFolder: ".nei/chats",
    memoryFile: ".nei/memory.json",
    skillsFolder: ".nei/skills",
    
    // Agent defaults
    maxAgentIterations: 6,
    maxPrefetchedNotes: 12,
    prefetchSnippetLength: 400,
    
    // RAG defaults
    ragResultLimit: 5,
    ragSnippetLength: 1000,

    // Streaming & RAG v2 defaults
    enableStreaming: true,
    enableSemanticRag: false,
    embeddingProvider: "openrouter",
    embeddingModel: "openai/text-embedding-3-small",
    embeddingEndpoint: "https://openrouter.ai/api/v1",
    
    // Safety default
    confirmObsidianCommands: true,
    allowedObsidianCommands: [
        'editor:toggle-line-wrap',
        'theme:toggle-dark',
        'canvas:new-file',
        'workspace:new-tab',
        'app:reload'
    ],

    // Temporal Intelligence defaults
    enableTemporalAwareness: true,
    enableAdaptivePrefetch: true,
    enableFreshnessSuggestions: true,
    enableSmartToolFiltering: true,
    defaultFreshnessPolicy: "auto",

    // Intent Routing defaults
    intentRoutingThreshold: 2.5,
    intentVaultKeywordWeight: 2.0,
    intentCreationWeight: 3.0,
    intentDeletionWeight: 4.0,
    intentAnalysisWeight: 2.5,
    intentSearchWeight: 1.5,
    intentModifyWeight: 1.5,
    intentQuestionWeight: -1.5,
    intentCodeWeight: -1.0,
    intentLengthWeight: 0.005,
    intentHistoryWeight: 0.3,
    intentAttachmentWeight: 5.0,
    intentStaleQueryWeight: 3.0,
    intentFreshnessWeight: 2.0,

    // Auto-Learning defaults (opt-in)
    enableAutoLearning: false,
    lastAutoLearnTimestamp: 0,

    // Attachments & Versioning defaults
    maxAttachmentSizeBytes: 512000, // 500 KB
    settingsVersion: 1,

    // Vault Context Toggle default
    enableVaultContextDefault: true
};

export default class NeiAiChatPlugin extends Plugin {
    settings: NeiAiChatSettings = DEFAULT_SETTINGS;
    public toolRegistry!: ToolRegistry;

    async onload() {
        await this.loadSettings();

        this.toolRegistry = new ToolRegistry(this);

        // Register MCP tools
        try {
            const { definitions, executors } = await McpService.discoverMcpTools();
            definitions.forEach(def => this.toolRegistry.registerDefinition(def));
            Object.entries(executors).forEach(([name, executor]) =>
                this.toolRegistry.registerExecutor(name, executor)
            );
        } catch (e) {
            console.warn('[NEI] MCP tools discovery failed:', e);
        }

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
        const loadedData = (await this.loadData()) as Partial<NeiAiChatSettings> & { settingsVersion?: number } | null;
        if (loadedData?.apiKey && typeof (this.app.vault as unknown as { decrypt?: (s: string) => Promise<string> }).decrypt === 'function') {
            try {
                loadedData.apiKey = await (this.app.vault as unknown as { decrypt: (s: string) => Promise<string> }).decrypt(loadedData.apiKey);
            } catch {
                // corrupted or unencrypted fallback
            }
        }
        
        // Version migration v0 -> v1
        if (loadedData && (!loadedData.settingsVersion || loadedData.settingsVersion < 1)) {
            loadedData.settingsVersion = 1;
            if (!loadedData.maxAttachmentSizeBytes) {
                loadedData.maxAttachmentSizeBytes = DEFAULT_SETTINGS.maxAttachmentSizeBytes;
            }
        }

        this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData || {});
        if (!this.settings.customModels || this.settings.customModels.length === 0) {
            this.settings.customModels = DEFAULT_SETTINGS.customModels;
        }
    }

    async saveSettings() {
        const dataToSave = { ...this.settings };
        if (dataToSave.apiKey && typeof (this.app.vault as unknown as { encrypt?: (s: string) => Promise<string> }).encrypt === 'function') {
            try {
                dataToSave.apiKey = await (this.app.vault as unknown as { encrypt: (s: string) => Promise<string> }).encrypt(dataToSave.apiKey);
            } catch {
                // fallback
            }
        }
        await this.saveData(dataToSave);
    }
}

export { NeiAiChatPlugin };
