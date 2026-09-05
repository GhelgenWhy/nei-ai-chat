import React, { FC, useRef, useEffect } from "react";
import { App, Component, MarkdownRenderer, Notice, WorkspaceLeaf } from "obsidian";
import { ChatMessage, getModelTemporalInfo, isAbortError } from "../services/llm";
import { AgentLoop, AgentStep } from "../services/agent/agentLoop";
import { ContextManager } from "../services/agent/contextManager";
import { ChatStore, ChatSession } from "../services/chat/chatStore";
import { OpenRouterService, OpenRouterModelInfo, OpenRouterKeyInfo, getDefaultModelCapabilities, buildPricingMap } from "../services/openrouter";
import { ExecutionMode } from "../services/agent/intentRouter";
import { t, SupportedLanguage } from "../i18n/translations";
import { NeiAiChatSettings } from "../../main";
import { ToolRegistry } from "../services/tools/toolRegistry";
import { ErrorBoundary } from "./ErrorBoundary";
import { Tooltip } from "./Tooltip";
import { WelcomeScreen } from "./WelcomeScreen";
import { ReasoningPanel } from "./ReasoningPanel";
import { ModelCapabilityBar } from "./ModelCapabilityBar";
import { CapabilityWarningModal } from "./CapabilityWarningModal";
import { calculateCost, ModelPricing } from "../utils/cost";
import { attachChromeInsetWatcher } from "../utils/obsidianChrome";
import { AutoLearner, LearningProposal } from "../services/memory/autoLearner";

export interface AttachedFile {
    id: string;
    name: string;
    type: 'image' | 'text' | 'audio' | 'video' | 'pdf';
    content: string;
    sizeBytes: number;
}

interface ChatPanelProps {
    app: App;
    viewLeaf?: WorkspaceLeaf;
    viewComponent?: Component;
    settings: NeiAiChatSettings;
    getSettings?: () => NeiAiChatSettings;
    saveSettings: (settings: NeiAiChatSettings) => Promise<void>;
    toolRegistry: ToolRegistry;
    onReload?: () => void;
}

export const ObsidianMarkdown: FC<{ markdown: string; app: App; component?: Component }> = ({ markdown, app, component }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const localComponentRef = useRef<Component | null>(null);
    const lastRenderedRef = useRef<string | null>(null);
    const renderTokenRef = useRef(0);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        // Skip re-render when content did not change (streaming chunks collapse here)
        if (lastRenderedRef.current === markdown) return;
        const token = ++renderTokenRef.current;

        // Debounce: full MarkdownRenderer.render per chunk is too expensive on mobile
        const timer = window.setTimeout(() => {
            if (token !== renderTokenRef.current) return; // a newer render is pending
            lastRenderedRef.current = markdown;
            el.empty();
            if (component) {
                // View-scoped component: cleaned up when the view closes (B9)
                void MarkdownRenderer.render(app, markdown, el, "", component);
            } else {
                const local = new Component();
                localComponentRef.current = local;
                local.load();
                void MarkdownRenderer.render(app, markdown, el, "", local);
            }
        }, 80);

        return () => {
            window.clearTimeout(timer);
        };
    }, [markdown, app, component]);

    useEffect(() => {
        return () => {
            if (localComponentRef.current) {
                localComponentRef.current.unload();
                localComponentRef.current = null;
            }
        };
    }, []);

    return <div ref={containerRef} className="markdown-preview-view markdown-rendered" style={{ background: 'transparent', padding: 0 }} />;
};

const ChatPanelInner: React.FC<ChatPanelProps> = ({ app, viewLeaf, viewComponent, settings, getSettings, saveSettings, toolRegistry, onReload }) => {

    const isMainTab = viewLeaf ? (viewLeaf.getRoot() === app.workspace.rootSplit) : false;

    // N1: props.settings is a mount-time snapshot; plugin.settings is the live source of truth.
    const getFreshSettings = React.useCallback((): NeiAiChatSettings => (getSettings ? getSettings() : settings), [getSettings, settings]);

    const handleToggleTabMode = async () => {
        try {
            const workspace = app.workspace;
            if (isMainTab) {
                // Move from main tab to right sidebar
                const rightLeaf = workspace.getRightLeaf(false);
                if (rightLeaf) {
                    await rightLeaf.setViewState({ type: "nei-chat-view", active: true });
                    void workspace.revealLeaf(rightLeaf);
                }
                if (viewLeaf) {
                    viewLeaf.detach();
                }
            } else {
                // Move from sidebar to main editor tab
                const tabLeaf = workspace.getLeaf("tab");
                await tabLeaf.setViewState({ type: "nei-chat-view", active: true });
                void workspace.revealLeaf(tabLeaf);
                if (viewLeaf) {
                    viewLeaf.detach();
                }
            }
        } catch (e: unknown) {
            const err = e as { message?: string };
            new Notice(`${t("modeSwitchError", language)} ${err?.message || String(e)}`);
        }
    };
    // Active Session State
    const [currentSession, setCurrentSession] = React.useState<ChatSession>(() => ChatStore.createNewSession());
    const [sessionsList, setSessionsList] = React.useState<{ id: string; title: string; updatedAt: string }[]>([]);
    
    // UI & Mode State
    const [input, setInput] = React.useState("");
    const [attachedImages, setAttachedImages] = React.useState<string[]>([]);
    const [attachedFiles, setAttachedFiles] = React.useState<AttachedFile[]>([]);
    const [warningModal, setWarningModal] = React.useState<{
        unsupportedTypes: string[];
        onProceedTextOnly: () => void;
        onRemoveAttachments: () => void;
    } | null>(null);

    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const fileReadersRef = React.useRef<FileReader[]>([]);

    // N14: auto-scroll the messages container while the user is at the bottom
    const messagesContainerRef = React.useRef<HTMLDivElement | null>(null);
    const isNearBottomRef = React.useRef(true);

    const handleMessagesScroll = React.useCallback(() => {
        const container = messagesContainerRef.current;
        if (!container) return;
        isNearBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    }, []);

    // B4: mobile keyboard — the visualViewport listener lives in an effect with
    // cleanup and only reacts when the keyboard is actually open (height shrunk).
    React.useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return;
        const handleViewportResize = () => {
            const keyboardOpen = vv.height < window.innerHeight * 0.75;
            if (!keyboardOpen) return;
            const container = messagesContainerRef.current;
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        };
        vv.addEventListener('resize', handleViewportResize);
        return () => vv.removeEventListener('resize', handleViewportResize);
    }, []);

    // Obsidian chrome (desktop .status-bar, mobile .mobile-toolbar + keyboard)
    // floats over the panel bottom — measure it and expose --nei-chrome-inset
    // so the input area can pad itself clear of it on every platform.
    const panelContainerRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        const panel = panelContainerRef.current;
        if (!panel) return;
        return attachChromeInsetWatcher(panel);
    }, []);

    // B4: on focus keep the input visible without hijacking the caret position
    const handleTextareaFocus = React.useCallback(() => {
        window.setTimeout(() => {
            const container = messagesContainerRef.current;
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }, 50);
    }, []);

    // Cleanup FileReaders on unmount
    React.useEffect(() => {
        return () => {
            fileReadersRef.current.forEach(reader => {
                reader.onload = null;
                reader.onerror = null;
                reader.abort();
            });
            fileReadersRef.current = [];
        };
    }, []);

    const adjustTextareaHeight = React.useCallback(() => {
        if (!textareaRef.current) return;
        window.requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            el.style.height = 'auto';
            const maxHeight = Math.min(el.scrollHeight, window.innerHeight * 0.4, 280);
            el.style.height = `${maxHeight}px`;
        });
    }, []);

    const [executionMode, setExecutionMode] = React.useState<ExecutionMode>(settings.executionMode || "auto");
    const [loading, setLoading] = React.useState(false);
    const [abortController, setAbortController] = React.useState<AbortController | null>(null);
    const [activeSteps, setActiveSteps] = React.useState<AgentStep[]>([]);
    const [showSessionsDrawer, setShowSessionsDrawer] = React.useState(false);
    const [showConfig, setShowConfig] = React.useState(false);
    // N6: queue — parallel confirmable tool calls must not overwrite each other
    const confirmationIdRef = React.useRef(0);
    const [pendingConfirmations, setPendingConfirmations] = React.useState<Array<{
        id: number;
        toolName: string;
        argsStr: string;
        resolve: (approved: boolean) => void;
    }>>([]);
    const [showFreshnessSuggestion, setShowFreshnessSuggestion] = React.useState<{
        message: string;
        onEnableWeb: () => void;
        onDismiss: () => void;
    } | null>(null);

    // Edit message inline state
    const [editingMsgIdx, setEditingMsgIdx] = React.useState<number | null>(null);
    const [editingText, setEditingText] = React.useState("");

    // Session Cost Dashboard state
    const [sessionMetrics, setSessionMetrics] = React.useState({
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalCost: 0,
        requestCount: 0
    });
    // N9: real OpenRouter pricing instead of a permanently empty map
    const [pricingMap, setPricingMap] = React.useState<Record<string, ModelPricing>>({});

    // Reasoning Panel state
    const [showReasoning, setShowReasoning] = React.useState(true);

    // Auto-Learning state
    const [learningProposal, setLearningProposal] = React.useState<{
        proposal: LearningProposal;
        onAccept: () => Promise<void>;
        onDismiss: () => void;
    } | null>(null);

    // Local Config & OpenRouter Stats State
    const [endpointUrl, setEndpointUrl] = React.useState(settings.endpointUrl || "https://openrouter.ai/api/v1");
    const [apiKey, setApiKey] = React.useState(settings.apiKey || "");

    // N9: real OpenRouter pricing instead of a permanently empty map
    React.useEffect(() => {
        let cancelled = false;
        void OpenRouterService.fetchModels(apiKey || undefined).then(models => {
            if (!cancelled) setPricingMap(buildPricingMap(models));
        });
        return () => { cancelled = true; };
    }, [apiKey]);
    const [model, setModel] = React.useState(settings.model || "google/gemini-2.5-flash");
    const [visionModel, setVisionModel] = React.useState(settings.visionModel || "google/gemini-2.5-flash");
    const [quickModel, setQuickModel] = React.useState(settings.quickModel || "google/gemini-2.5-flash");
    const [customModels, setCustomModels] = React.useState<string[]>(settings.customModels || [
        "google/gemini-2.5-flash",
        "anthropic/claude-3.5-sonnet",
        "google/gemini-2.5-pro",
        "openai/gpt-4o",
        "deepseek/deepseek-chat"
    ]);
    const [newModelInput, setNewModelInput] = React.useState("");
    const [activeModelDetails, setActiveModelDetails] = React.useState<OpenRouterModelInfo | null>(null);
    const [keyInfo, setKeyInfo] = React.useState<OpenRouterKeyInfo | null>(null);
    const [verifyingModel, setVerifyingModel] = React.useState(false);

    const [modelFreshness, setModelFreshness] = React.useState<{
        cutoff: string;
        daysSince: number;
        supportsWeb: boolean;
        isStale: boolean;
    } | null>(null);

    React.useEffect(() => {
        const info = getModelTemporalInfo(model);
        const cutoff = new Date(info.knowledgeCutoff);
        const daysSince = Math.floor((Date.now() - cutoff.getTime()) / (1000 * 60 * 60 * 24));
        setModelFreshness({
            cutoff: info.knowledgeCutoff,
            daysSince,
            supportsWeb: info.supportsWebSearch,
            isStale: daysSince > 30
        });
    }, [model]);

    React.useEffect(() => {
        void refreshSessionsList();
        void verifyActiveModel(model, apiKey);
        if (apiKey) {
            void OpenRouterService.getKeyInfo(apiKey).then(setKeyInfo);
        }
    }, []);

    const refreshSessionsList = async () => {
        const list = await ChatStore.listSessions(app, getFreshSettings());
        setSessionsList(list);
    };

    // B15: coalesce session writes (one per turn → debounce) with flush on unmount
    const saveTimerRef = React.useRef<number | null>(null);
    const pendingSaveRef = React.useRef<ChatSession | null>(null);

    const saveSessionDebounced = React.useCallback((session: ChatSession) => {
        pendingSaveRef.current = session;
        if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => {
            saveTimerRef.current = null;
            const pending = pendingSaveRef.current;
            pendingSaveRef.current = null;
            if (pending) {
                void ChatStore.saveSession(app, getFreshSettings(), pending).then(() => refreshSessionsList());
            }
        }, 1500);
    }, [app, getFreshSettings]);

    React.useEffect(() => {
        return () => {
            if (saveTimerRef.current !== null) {
                window.clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
            const pending = pendingSaveRef.current;
            pendingSaveRef.current = null;
            if (pending) {
                void ChatStore.saveSession(app, getFreshSettings(), pending);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const verifyActiveModel = async (targetModel: string, key: string) => {
        setVerifyingModel(true);
        try {
            const details = await OpenRouterService.getModelDetails(targetModel, key);
            setActiveModelDetails(details);
        } catch {
            setActiveModelDetails(null);
        } finally {
            setVerifyingModel(false);
        }
    };

    const formatSessionTitle = (tTitle: string) => {
        if (!tTitle || tTitle === "Новый диалог" || tTitle === "New Chat") {
            return t("newChatSession", language);
        }
        return tTitle;
    };

    const handleSelectModel = (selectedModel: string) => {
        setModel(selectedModel);
        void verifyActiveModel(selectedModel, apiKey);
        void saveSettings({ ...settings, model: selectedModel, visionModel, quickModel, executionMode });
    };

    const handleAddModel = () => {
        if (!newModelInput.trim()) return;
        const trimmed = newModelInput.trim();
        if (!customModels.includes(trimmed)) {
            const updated = [...customModels, trimmed];
            setCustomModels(updated);
            setModel(trimmed);
            void verifyActiveModel(trimmed, apiKey);
            new Notice(`${t("modelAddedNotice", language)} ${trimmed}`);
        }
        setNewModelInput("");
    };

    const handleDeleteModel = (e: React.MouseEvent, targetModel: string) => {
        e.stopPropagation();
        if (customModels.length <= 1) {
            new Notice(t("cannotDeleteLastModel", language));
            return;
        }
        const updated = customModels.filter(m => m !== targetModel);
        setCustomModels(updated);
        if (model === targetModel) {
            const nextModel = updated[0];
            setModel(nextModel);
            void verifyActiveModel(nextModel, apiKey);
        }
    };

    const handleNewChat = () => {
        const newSess = ChatStore.createNewSession();
        setCurrentSession(newSess);
        setActiveSteps([]);
        setShowSessionsDrawer(false);
        setEditingMsgIdx(null);
        setShowFreshnessSuggestion(null);
    };

    const handleSelectSession = async (sessionId: string) => {
        const loaded = await ChatStore.loadSession(app, settings, sessionId);
        if (loaded) {
            setCurrentSession(loaded);
            setActiveSteps(loaded.steps || []);
            setShowSessionsDrawer(false);
            setEditingMsgIdx(null);
            setShowFreshnessSuggestion(null);
        }
    };

    const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        await ChatStore.deleteSession(app, settings, sessionId);
        await refreshSessionsList();
        if (currentSession.id === sessionId) {
            handleNewChat();
        }
    };

    const [confirmingClear, setConfirmingClear] = React.useState(false);
    const clearTimerRef = React.useRef<number | null>(null);

    // B5/N12: close the sessions drawer on Escape while it is open
    React.useEffect(() => {
        if (!showSessionsDrawer) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setShowSessionsDrawer(false);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [showSessionsDrawer]);

    React.useEffect(() => {
        return () => {
            if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current);
            if (settingsSaveTimerRef.current !== null) window.clearTimeout(settingsSaveTimerRef.current);
        };
    }, []);

    const handleClearAllSessions = async () => {
        if (!confirmingClear) {
            setConfirmingClear(true);
            clearTimerRef.current = window.setTimeout(() => setConfirmingClear(false), 4000);
            return;
        }
        setConfirmingClear(false);
        if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current);
        await ChatStore.clearAllSessions(app, settings);
        await refreshSessionsList();
        handleNewChat();
        new Notice(t("historyClearedNotice", language));
    };

    const handleBranchFromMessage = async (msgIndex: number) => {
        if (!currentSession) return;
        const historyBefore = currentSession.messages.slice(0, msgIndex + 1);
        const newSession = ChatStore.createNewSession();
        newSession.title = `Branch: ${currentSession.title || "Chat"}`;
        newSession.messages = [...historyBefore];
        setCurrentSession(newSession);
        await ChatStore.saveSession(app, settings, newSession);
        await refreshSessionsList();
        new Notice("🌿 Conversation branched!");
    };

    const [language, setLanguage] = React.useState<SupportedLanguage>(settings.language || "auto");
    const [defaultNoteFolder, setDefaultNoteFolder] = React.useState<string>(settings.defaultNoteFolder || "");
    const [chatsFolder, setChatsFolder] = React.useState<string>(settings.chatsFolder || ".nei/chats");
    const [memoryFile, setMemoryFile] = React.useState<string>(settings.memoryFile || ".nei/memory.json");
    const [skillsFolder, setSkillsFolder] = React.useState<string>(settings.skillsFolder || ".nei/skills");
    const [maxAgentIterations, setMaxAgentIterations] = React.useState<number>(settings.maxAgentIterations || 10);
    const [maxPrefetchedNotes, setMaxPrefetchedNotes] = React.useState<number>(settings.maxPrefetchedNotes || 5);
    const [prefetchSnippetLength, setPrefetchSnippetLength] = React.useState<number>(settings.prefetchSnippetLength || 400);
    const [ragResultLimit, setRagResultLimit] = React.useState<number>(settings.ragResultLimit || 5);
    const [ragSnippetLength] = React.useState<number>(settings.ragSnippetLength || 1000);
    const [confirmObsidianCommands, setConfirmObsidianCommands] = React.useState<boolean>(settings.confirmObsidianCommands ?? true);

    const [enableTemporalAwareness, setEnableTemporalAwareness] = React.useState<boolean>(settings.enableTemporalAwareness ?? true);
    const [enableAdaptivePrefetch, setEnableAdaptivePrefetch] = React.useState<boolean>(settings.enableAdaptivePrefetch ?? true);
    const [enableFreshnessSuggestions, setEnableFreshnessSuggestions] = React.useState<boolean>(settings.enableFreshnessSuggestions ?? true);
    const [enableSmartToolFiltering, setEnableSmartToolFiltering] = React.useState<boolean>(settings.enableSmartToolFiltering ?? true);

    const [enableVaultContextDefault, setEnableVaultContextDefault] = React.useState<boolean>(settings.enableVaultContextDefault ?? true);
    const [vaultContextEnabled, setVaultContextEnabled] = React.useState<boolean>(settings.enableVaultContextDefault ?? true);

    const [intentRoutingThreshold, setIntentRoutingThreshold] = React.useState<number>(settings.intentRoutingThreshold ?? 2.5);
    const [intentVaultKeywordWeight] = React.useState<number>(settings.intentVaultKeywordWeight ?? 2.0);
    const [intentCreationWeight, setIntentCreationWeight] = React.useState<number>(settings.intentCreationWeight ?? 3.0);
    const [intentDeletionWeight, setIntentDeletionWeight] = React.useState<number>(settings.intentDeletionWeight ?? 4.0);
    const [intentAnalysisWeight] = React.useState<number>(settings.intentAnalysisWeight ?? 2.5);
    const [intentQuestionWeight, setIntentQuestionWeight] = React.useState<number>(settings.intentQuestionWeight ?? -1.5);
    const [intentLengthWeight] = React.useState<number>(settings.intentLengthWeight ?? 0.005);
    const [intentHistoryWeight] = React.useState<number>(settings.intentHistoryWeight ?? 0.3);
    const [intentStaleQueryWeight, setIntentStaleQueryWeight] = React.useState<number>(settings.intentStaleQueryWeight ?? 3.0);
    const [intentFreshnessWeight, setIntentFreshnessWeight] = React.useState<number>(settings.intentFreshnessWeight ?? 2.0);

    const settingsSaveTimerRef = React.useRef<number | null>(null);

    const handleSaveConfig = async () => {
        const newSettings: NeiAiChatSettings = {
            ...settings,
            provider: "openrouter",
            endpointUrl,
            apiKey,
            model,
            visionModel,
            quickModel,
            executionMode,
            customModels,
            language,
            defaultNoteFolder,
            chatsFolder,
            memoryFile,
            skillsFolder,
            maxAgentIterations,
            maxPrefetchedNotes,
            prefetchSnippetLength,
            ragResultLimit,
            ragSnippetLength,
            confirmObsidianCommands,
            enableTemporalAwareness,
            enableAdaptivePrefetch,
            enableFreshnessSuggestions,
            enableSmartToolFiltering,
            enableVaultContextDefault,
            intentRoutingThreshold,
            intentVaultKeywordWeight,
            intentCreationWeight,
            intentDeletionWeight,
            intentAnalysisWeight,
            intentQuestionWeight,
            intentLengthWeight,
            intentHistoryWeight,
            intentStaleQueryWeight,
            intentFreshnessWeight
        };
        await saveSettings(newSettings);
        setShowConfig(false);
        new Notice(t("saveSettings", language) + "!");
    };

    const handleCopyText = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            new Notice(t("copied", language));
        } catch {
            new Notice(t("copyError", language));
        }
    };

    const handleSaveResponseAsNote = async (content: string) => {
        const now = new Date();
        const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
        const fileName = `AI_Note_${timestamp}.md`;

        try {
            const execResult = await toolRegistry.executeTool(
                app,
                "save-response-note",
                "create_note",
                JSON.stringify({ path: fileName, content: content })
            );

            if (execResult.isError) {
                new Notice(`${t("noteCreateError", language)} ${execResult.result}`);
            } else {
                const pathMatch = execResult.result.match(/'([^']+)'/);
                const savedPath = pathMatch ? pathMatch[1] : fileName;
                new Notice(`${t("noteCreatedSuccess", language)} '${savedPath}'`);
            }
        } catch (e: unknown) {
            const err = e as { message?: string };
            new Notice(`${t("noteCreateError", language)} ${err?.message || String(e)}`);
        }
    };

    const [streamingContent, setStreamingContent] = React.useState("");
    // Mirror of streamingContent for stale-closure-safe access (abort handling)
    const streamingContentRef = React.useRef("");

    // N14: keep the message list pinned to the bottom while the user is near it
    React.useEffect(() => {
        const container = messagesContainerRef.current;
        if (container && isNearBottomRef.current) {
            container.scrollTop = container.scrollHeight;
        }
    }, [currentSession.messages.length, streamingContent, activeSteps.length]);
    const [showWelcome, setShowWelcome] = React.useState<boolean>(() => app.loadLocalStorage("nei_welcome_seen") !== true);
    const [enableSemanticRag, setEnableSemanticRag] = React.useState<boolean>(settings.enableSemanticRag ?? false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleExportSettings = () => {
        try {
            const dataStr = JSON.stringify(settings, null, 2);
            const doc = typeof activeDocument !== "undefined" ? activeDocument : document;
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = doc.createElement("a");
            a.href = url;
            a.download = `nei-settings-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            new Notice(t("settingsExported", language));
        } catch (e: unknown) {
            const err = e as { message?: string };
            new Notice(`Export error: ${err?.message || String(e)}`);
        }
    };

    const handleImportSettings = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const imported = JSON.parse(text) as Partial<NeiAiChatSettings>;

            if (!imported.settingsVersion || imported.settingsVersion < 1) {
                imported.settingsVersion = 1;
                if (!imported.maxAttachmentSizeBytes) {
                    imported.maxAttachmentSizeBytes = 512000;
                }
            }

            const newSettings = { ...settings, ...imported };
            await saveSettings(newSettings);

            if (newSettings.endpointUrl) setEndpointUrl(newSettings.endpointUrl);
            if (newSettings.apiKey !== undefined) setApiKey(newSettings.apiKey);
            if (newSettings.model) setModel(newSettings.model);
            if (newSettings.visionModel) setVisionModel(newSettings.visionModel);
            if (newSettings.quickModel) setQuickModel(newSettings.quickModel);
            if (newSettings.executionMode) setExecutionMode(newSettings.executionMode);
            if (newSettings.language) setLanguage(newSettings.language);
            if (newSettings.defaultNoteFolder !== undefined) setDefaultNoteFolder(newSettings.defaultNoteFolder);
            if (newSettings.customModels) setCustomModels(newSettings.customModels);

            new Notice(t("settingsImported", language));
            
            if (onReload) onReload();
        } catch (err: unknown) {
            const errObj = err as { message?: string };
            new Notice(`Import error: ${errObj?.message || String(err)}`);
        }
    };

    // Execute agent loop for a query and history slice
    const executeQuery = async (queryText: string, historySlice: ChatMessage[], imagesPayload?: string[]) => {
        setLoading(true);
        setActiveSteps([]);
        setEditingMsgIdx(null);
        setStreamingContent("");
        streamingContentRef.current = "";

        // Create abort controller for interruption
        const abortController = new AbortController();
        setAbortController(abortController);

        // N1: read live settings at call time (props.settings is a mount snapshot)
        const freshSettings = getFreshSettings();

        const currentImages = imagesPayload || attachedImages;
        const newMsgId = () => "m_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const userMsg: ChatMessage = {
            role: "user",
            content: queryText,
            id: newMsgId(),
            ...(currentImages.length > 0 ? { images: currentImages } : {})
        };

        const updatedMessages = [...historySlice, userMsg];
        const updatedSession: ChatSession = {
            ...currentSession,
            title: currentSession.messages.length === 0 ? (queryText.substring(0, 30) + (queryText.length > 30 ? "..." : "")) : currentSession.title,
            messages: updatedMessages
        };

        setCurrentSession(updatedSession);
        setAttachedImages([]);

        try {
            const isVisionRequired = currentImages.length > 0;
            const activeModelToUse = isVisionRequired
                ? visionModel
                : (executionMode === "quick" ? quickModel : model);

            const result = await AgentLoop.run({
                app,
                config: {
                    provider: "openrouter",
                    endpointUrl,
                    apiKey,
                    model: activeModelToUse
                },
                userQuery: queryText,
                chatHistory: ContextManager.stripImages(historySlice, 0),
                images: currentImages,
                executionMode,
                useVaultContext: vaultContextEnabled,
                activeModelDetails,
                onStepUpdate: (steps) => {
                    setActiveSteps(steps);
                },
                onConfirmationRequired: async (toolName, argsStr) => {
                    return new Promise((resolve) => {
                        // Stop pressed while a confirmation is pending must not hang the loop:
                        // abort resolves it as "denied", then the loop exits via throwIfAborted
                        if (abortController.signal.aborted) {
                            resolve(false);
                            return;
                        }
                        const onAbort = () => resolve(false);
                        abortController.signal.addEventListener('abort', onAbort, { once: true });
                        const id = ++confirmationIdRef.current;
                        setPendingConfirmations(prev => [...prev, {
                            id,
                            toolName,
                            argsStr,
                            resolve: (approved: boolean) => {
                                abortController.signal.removeEventListener('abort', onAbort);
                                resolve(approved);
                            }
                        }]);
                    });
                },
                onStreamChunk: (chunk) => {
                    streamingContentRef.current += chunk;
                    setStreamingContent(prev => prev + chunk);
                },
                abortSignal: abortController.signal,
                toolRegistry,
                language,
                settings: freshSettings
            });
            setStreamingContent("");

            const assistantMsg: ChatMessage = {
                role: "assistant",
                content: result.responseText,
                id: newMsgId(),
                promptTokens: result.promptTokens,
                completionTokens: result.completionTokens
            };
            const finalMessages = [...updatedMessages, assistantMsg];

            // N3: steps come from the loop result, not from a stale state closure
            const finalSession: ChatSession = {
                ...updatedSession,
                messages: finalMessages,
                steps: result.steps
            };

            setCurrentSession(finalSession);
            saveSessionDebounced(finalSession);

            // Update session cost metrics
            const promptTok = result.promptTokens || 0;
            const completionTok = result.completionTokens || 0;
            const cost = calculateCost(promptTok, completionTok, activeModelToUse, pricingMap);
            setSessionMetrics(prev => ({
                totalPromptTokens: prev.totalPromptTokens + promptTok,
                totalCompletionTokens: prev.totalCompletionTokens + completionTok,
                totalCost: prev.totalCost + cost,
                requestCount: prev.requestCount + 1
            }));

            // Auto-Learning: extract facts/skills from conversation
            if (freshSettings.enableAutoLearning && finalMessages.length >= 4) {
                void AutoLearner.extractAndPropose(
                    { provider: "openrouter", endpointUrl, apiKey, model: quickModel },
                    finalMessages
                ).then(proposal => {
                    if (proposal) {
                        setLearningProposal({
                            proposal,
                            onAccept: async () => {
                                const applied = await AutoLearner.applyProposal(app, freshSettings, proposal);
                                new Notice(`${t("learningApplied", language)} (${applied})`);
                                setLearningProposal(null);
                            },
                            onDismiss: () => {
                                setLearningProposal(null);
                            }
                        });
                    }
                });
            }

            // Refresh key info balance after request
            if (apiKey) {
                void OpenRouterService.getKeyInfo(apiKey).then(setKeyInfo);
            }
        } catch (e: unknown) {
            console.error("[NEI Agent Error]", e);

            // User pressed Stop: keep partial streamed output instead of an error card
            if (isAbortError(e) || abortController.signal.aborted) {
                const partial = streamingContentRef.current.trim();
                const partialMessages: ChatMessage[] = partial
                    ? [...updatedMessages, { role: "assistant", content: `${partial}\n\n_${t("stoppedByUser", language)}_`, id: newMsgId() }]
                    : [...updatedMessages];
                const partialSession: ChatSession = {
                    ...updatedSession,
                    messages: partialMessages
                };
                setCurrentSession(partialSession);
                saveSessionDebounced(partialSession);
            } else {
                const err = e as { message?: string };
                const errMessages: ChatMessage[] = [...updatedMessages, { role: "assistant", content: `${t("agentError", language)} ${err?.message || String(e)}`, id: newMsgId() }];
                const errSession: ChatSession = {
                    ...updatedSession,
                    messages: errMessages
                };
                setCurrentSession(errSession);
                saveSessionDebounced(errSession);
            }
        } finally {
            setLoading(false);
            setActiveSteps([]);
            setPendingConfirmations([]);
            setAbortController(null);
        }
    };

    const sendWithPreparedContent = (textOnlyFallback: boolean) => {
        let fullQuery = input.trim();

        // Inject text & pdf files into context: <file name="...">content</file>
        const textAttachments = attachedFiles.filter(f => f.type === 'text' || f.type === 'pdf' || (textOnlyFallback && (f.type === 'audio' || f.type === 'video')));
        if (textAttachments.length > 0) {
            const fileContext = textAttachments.map(f => `<file name="${f.name}">\n${f.content}\n</file>`).join('\n\n');
            fullQuery = fullQuery ? `${fullQuery}\n\n${fileContext}` : fileContext;
        }

        const imagesToPass = textOnlyFallback 
            ? [] 
            : attachedFiles.filter(f => f.type === 'image').map(f => f.content);

        setInput("");
        setAttachedFiles([]);
        setAttachedImages([]);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        void executeQuery(fullQuery, currentSession.messages, imagesToPass);
    };

    const handleSendMessage = () => {
        if (loading) return;
        if (!input.trim() && attachedFiles.length === 0) return;

        // Model capability validation before send (FUNC-05)
        const modelCaps = activeModelDetails?.capabilities || getDefaultModelCapabilities(model).capabilities;
        const unsupported: string[] = [];

        attachedFiles.forEach(f => {
            if (f.type === 'image' && !modelCaps.vision) unsupported.push('vision');
            if (f.type === 'audio' && !modelCaps.audio) unsupported.push('audio');
            if (f.type === 'video' && !modelCaps.video) unsupported.push('video');
        });

        if (unsupported.length > 0) {
            const uniqueTypes = Array.from(new Set(unsupported));
            setWarningModal({
                unsupportedTypes: uniqueTypes,
                onProceedTextOnly: () => {
                    setWarningModal(null);
                    sendWithPreparedContent(true);
                },
                onRemoveAttachments: () => {
                    setAttachedFiles(prev => prev.filter(f => !uniqueTypes.includes(f.type === 'image' ? 'vision' : f.type)));
                    setWarningModal(null);
                    sendWithPreparedContent(false);
                }
            });
            return;
        }

        sendWithPreparedContent(false);
    };

    // Retry a user request at index
    const handleRetryUserMessage = (msgIdx: number) => {
        if (loading) return;
        const targetMsg = currentSession.messages[msgIdx];
        if (targetMsg && targetMsg.role === "user" && targetMsg.content) {
            const historyBefore = currentSession.messages.slice(0, msgIdx);
            void executeQuery(targetMsg.content, historyBefore);
        }
    };

    // Start inline editing of user message
    const handleStartEdit = (idx: number, content: string) => {
        setEditingMsgIdx(idx);
        setEditingText(content);
    };

    // Save and resend edited user message
    const handleSaveEdit = (idx: number) => {
        if (!editingText.trim() || loading) return;
        const historyBefore = currentSession.messages.slice(0, idx);
        void executeQuery(editingText.trim(), historyBefore);
    };

    const isTextFile = (filename: string, mimeType: string) => {
        const textExts = ['.txt', '.md', '.json', '.js', '.ts', '.py', '.css', '.html', '.csv', '.yaml', '.yml'];
        const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
        return textExts.includes(ext) || mimeType.startsWith('text/');
    };

    // B10-lite: downscale attached images (max 1280px, JPEG) so session files
    // and vision payloads stay small. Falls back to the original data URL.
    const downscaleImage = React.useCallback((file: File, maxDim = 1280, quality = 0.85): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            fileReadersRef.current.push(reader);
            reader.onload = () => {
                const dataUrl = reader.result as string;
                const img = new Image();
                img.onload = () => {
                    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
                    if (scale >= 1) {
                        resolve(dataUrl);
                        return;
                    }
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = Math.round(img.width * scale);
                        canvas.height = Math.round(img.height * scale);
                        const ctx = canvas.getContext('2d');
                        if (!ctx) {
                            resolve(dataUrl);
                            return;
                        }
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        resolve(canvas.toDataURL('image/jpeg', quality));
                    } catch {
                        resolve(dataUrl);
                    }
                };
                img.onerror = () => resolve(dataUrl);
                img.src = dataUrl;
            };
            reader.onerror = () => reject(new Error("Failed to read image file"));
            reader.readAsDataURL(file);
        });
    }, []);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const maxSize = getFreshSettings().maxAttachmentSizeBytes || 512000;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.size > maxSize) {
                new Notice(`File "${file.name}" exceeds maximum size of ${(maxSize / 1024).toFixed(0)} KB.`);
                continue;
            }

            const id = Math.random().toString(36).substring(2, 9);
            const name = file.name;
            const sizeBytes = file.size;

            if (isTextFile(file.name, file.type)) {
                const reader = new FileReader();
                fileReadersRef.current.push(reader);
                reader.onload = (evt) => {
                    const content = (evt.target?.result as string) || '';
                    setAttachedFiles(prev => [...prev, { id, name, type: 'text', content, sizeBytes }]);
                    fileReadersRef.current = fileReadersRef.current.filter(r => r !== reader);
                };
                reader.onerror = () => {
                    fileReadersRef.current = fileReadersRef.current.filter(r => r !== reader);
                };
                reader.readAsText(file);
            } else if (file.type.startsWith('image/')) {
                void downscaleImage(file)
                    .then(content => {
                        setAttachedFiles(prev => [...prev, { id, name, type: 'image', content, sizeBytes: Math.round(content.length * 0.75) }]);
                        setAttachedImages(prev => [...prev, content]);
                    })
                    .catch(() => {
                        new Notice(`Failed to read image "${name}".`);
                    });
            } else if (file.type.startsWith('audio/')) {
                const reader = new FileReader();
                fileReadersRef.current.push(reader);
                reader.onload = (evt) => {
                    const content = (evt.target?.result as string) || '';
                    setAttachedFiles(prev => [...prev, { id, name, type: 'audio', content, sizeBytes }]);
                    fileReadersRef.current = fileReadersRef.current.filter(r => r !== reader);
                };
                reader.onerror = () => {
                    fileReadersRef.current = fileReadersRef.current.filter(r => r !== reader);
                };
                reader.readAsDataURL(file);
            } else if (file.type.startsWith('video/')) {
                const reader = new FileReader();
                fileReadersRef.current.push(reader);
                reader.onload = (evt) => {
                    const content = (evt.target?.result as string) || '';
                    setAttachedFiles(prev => [...prev, { id, name, type: 'video', content, sizeBytes }]);
                    fileReadersRef.current = fileReadersRef.current.filter(r => r !== reader);
                };
                reader.onerror = () => {
                    fileReadersRef.current = fileReadersRef.current.filter(r => r !== reader);
                };
                reader.readAsDataURL(file);
            } else if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
                const reader = new FileReader();
                fileReadersRef.current.push(reader);
                reader.onload = (evt) => {
                    const arrayBuffer = evt.target?.result as ArrayBuffer;
                    const content = `[PDF file: ${name}, ${sizeBytes} bytes - binary content not extracted]`;
                    setAttachedFiles(prev => [...prev, { id, name, type: 'pdf', content, sizeBytes }]);
                    fileReadersRef.current = fileReadersRef.current.filter(r => r !== reader);
                };
                reader.onerror = () => {
                    fileReadersRef.current = fileReadersRef.current.filter(r => r !== reader);
                };
                reader.readAsArrayBuffer(file);
            } else {
                const reader = new FileReader();
                fileReadersRef.current.push(reader);
                reader.onload = (evt) => {
                    const content = (evt.target?.result as string) || '';
                    setAttachedFiles(prev => [...prev, { id, name, type: 'text', content, sizeBytes }]);
                    fileReadersRef.current = fileReadersRef.current.filter(r => r !== reader);
                };
                reader.onerror = () => {
                    fileReadersRef.current = fileReadersRef.current.filter(r => r !== reader);
                };
                reader.readAsText(file);
            }
        }
    };

    const resolveConfirmation = (id: number, approved: boolean) => {
        setPendingConfirmations(prev => {
            const target = prev.find(c => c.id === id);
            if (target) target.resolve(approved);
            return prev.filter(c => c.id !== id);
        });
    };

    const currentConfirmation = pendingConfirmations[0] || null;

    return (
        <div className="nei-chat-panel-container" ref={panelContainerRef}>
            {/* Bar 1 — Functional Controls (UI-01) */}
            <div className="nei-chat-header" style={{ height: 'auto', minHeight: 'auto', boxSizing: 'border-box' }}>
                <div className="nei-header-group" style={{ flex: 1, minWidth: 0, flexWrap: 'wrap', gap: 'clamp(4px, 1cqi, 6px)' }}>
                    <button 
                        onClick={() => setShowSessionsDrawer(!showSessionsDrawer)}
                        title={t("historyTooltip", language)}
                        aria-label={t("historyTooltip", language)}
                        className="nei-session-btn"
                    >
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>📂 {formatSessionTitle(currentSession.title)}</span>
                        <span style={{ flexShrink: 0 }}>▼</span>
                    </button>

                    <button 
                        onClick={() => handleNewChat()}
                        title={t("newChatTooltip", language)}
                        aria-label={t("newChatTooltip", language)}
                        className="nei-new-chat-btn"
                    >
                        ➕
                    </button>
                </div>

                <div className="nei-header-group" style={{ flexWrap: 'wrap', gap: 'clamp(4px, 1cqi, 6px)', alignItems: 'center' }}>
                    <select
                        value={executionMode}
                        onChange={(e) => {
                            const val = e.target.value as ExecutionMode;
                            setExecutionMode(val);
                            void saveSettings({ ...settings, executionMode: val });
                        }}
                        title={t("modeAutoTitle", language)}
                        aria-label={t("modeAutoTitle", language)}
                        className="nei-select-mode"
                        style={{ flexShrink: 1, minWidth: 'clamp(80px, 15cqi, 120px)' }}
                    >
                        <option value="auto">⚡ Auto</option>
                        <option value="quick">🚀 Quick</option>
                        <option value="agent">🧠 Agent</option>
                    </select>

                    <button
                        onClick={() => setVaultContextEnabled(prev => !prev)}
                        title={t("vaultContextToggleTooltip", language)}
                        aria-label={t("vaultContextToggleTooltip", language)}
                        className={`nei-header-btn ${vaultContextEnabled ? "nei-btn-active" : ""}`}
                        style={{
                            fontSize: 'clamp(10px, 1.8cqi, 11px)',
                            padding: 'clamp(2px, 0.5cqi, 3px) clamp(5px, 1cqi, 8px)',
                            borderRadius: '4px',
                            fontWeight: '500',
                            flexShrink: 0,
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {vaultContextEnabled ? "🧠" : "⚪"} {t("vaultContextToggleLabel", language)}
                    </button>

                    <button 
                        onClick={() => void handleToggleTabMode()}
                        title={isMainTab ? t("moveSidebarTitle", language) : t("moveTabTitle", language)}
                        aria-label={isMainTab ? t("moveSidebarTitle", language) : t("moveTabTitle", language)}
                        className="nei-header-btn"
                        style={{ flexShrink: 0 }}
                    >
                        {isMainTab ? "↙️" : "↗️"}
                    </button>

                    <button 
                        onClick={() => setShowConfig(!showConfig)}
                        title={t("settingsTooltip", language)}
                        aria-label={t("settingsTooltip", language)}
                        className="nei-header-btn"
                        style={{ flexShrink: 0 }}
                    >
                        ⚙️
                    </button>
                </div>
            </div>

            {/* Bar 2 — Model Info & Context (UI-01 / UI-04 Sticky) */}
            <ModelCapabilityBar 
                modelName={model}
                modelDetails={activeModelDetails || getDefaultModelCapabilities(model)}
                totalTokens={sessionMetrics.totalPromptTokens + sessionMetrics.totalCompletionTokens}
                contextWindow={activeModelDetails?.contextLength}
            />

            {/* Sessions History Drawer (B5: scoped to the panel, not the window) */}
            {showSessionsDrawer && (
                <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 'var(--layer-modal, 100)',
                    background: 'rgba(0, 0, 0, 0.3)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'flex-start',
                    padding: '8px',
                    overflow: 'hidden'
                }}
                    onClick={() => setShowSessionsDrawer(false)}
                >
                    <div style={{
                        background: 'var(--background-primary)',
                        border: '1px solid var(--background-modifier-border)',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                        maxHeight: '100%',
                        width: '100%',
                        maxWidth: 'calc(100% - 0px)',
                        overflowY: 'auto',
                        padding: '8px',
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid var(--background-modifier-border)' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '12px', color: 'var(--text-muted)' }}>{t("historyTitle", language)}</span>
                            {sessionsList.length > 0 && (
                                <button 
                                    onClick={() => { void handleClearAllSessions(); }}
                                    title={t("clearChats", language)}
                                    style={{ background: 'transparent', border: 'none', color: 'var(--text-error, #ff5555)', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
                                >
                                    {confirmingClear ? `⚠️ ${t("confirmClearChats", language)}` : t("clearAll", language)}
                                </button>
                            )}
                        </div>
                        {sessionsList.length === 0 ? (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '6px' }}>{t("noSavedChats", language)}</div>
                        ) : (
                            sessionsList.map(s => (
                                <div 
                                    key={s.id}
                                    onClick={() => { void handleSelectSession(s.id); }}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '6px 8px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        background: s.id === currentSession.id ? 'var(--background-secondary-alt)' : 'transparent',
                                        marginBottom: '2px'
                                    }}
                                >
                                    <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                                        {formatSessionTitle(s.title)}
                                    </span>
                                    <button 
                                        onClick={(e) => { void handleDeleteSession(e, s.id); }}
                                        title={t("deleteChatTooltip", language)}
                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '12px', opacity: 0.6 }}
                                    >
                                        🗑️
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Config & Model Manager Modal */}
            {showConfig && (
                <div style={{ flexShrink: 0, maxHeight: 'min(55vh, calc(100vh - 120px))', overflowY: 'auto', background: 'var(--background-secondary)', padding: '12px', borderRadius: '8px', marginBottom: '12px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>OpenRouter API Key:</label>
                        <input 
                            type="password" 
                            value={apiKey} 
                            onChange={(e) => setApiKey(e.target.value)} 
                            placeholder="sk-or-v1-..."
                            style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-primary)', color: 'var(--text-normal)' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>API Endpoint URL:</label>
                        <input 
                            type="text" 
                            value={endpointUrl} 
                            onChange={(e) => setEndpointUrl(e.target.value)} 
                            placeholder="https://openrouter.ai/api/v1"
                            style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-primary)', color: 'var(--text-normal)' }}
                        />
                    </div>

                    {keyInfo && (
                        <div style={{ background: 'var(--background-primary)', padding: '6px 10px', borderRadius: '6px', fontSize: '11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>💰 {t("keyUsage", language)} <strong>${keyInfo.usage.toFixed(4)}</strong></span>
                            <span>{keyInfo.isFreeTier ? '🟢 Free Tier' : '💳 Paid Tier'}</span>
                        </div>
                    )}

                    {/* Model Category Slots */}
                    <div style={{ background: 'var(--background-primary)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--background-modifier-border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '11px' }}>{t("modelCategories", language)}</div>
                        
                        <div>
                            <label style={{ fontSize: '11px', display: 'block', color: 'var(--text-muted)' }}>{t("primaryModel", language)}</label>
                            <select 
                                value={model} 
                                onChange={(e) => handleSelectModel(e.target.value)}
                                style={{ width: '100%', padding: '4px', borderRadius: '4px', fontSize: '11px', background: 'var(--background-secondary)', color: 'var(--text-normal)', border: '1px solid var(--background-modifier-border)' }}
                            >
                                {customModels.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: '11px', display: 'block', color: 'var(--text-muted)' }}>{t("visionModel", language)}</label>
                            <select 
                                value={visionModel} 
                                onChange={(e) => {
                                    setVisionModel(e.target.value);
                                    void saveSettings({ ...settings, visionModel: e.target.value });
                                }}
                                style={{ width: '100%', padding: '4px', borderRadius: '4px', fontSize: '11px', background: 'var(--background-secondary)', color: 'var(--text-normal)', border: '1px solid var(--background-modifier-border)' }}
                            >
                                {customModels.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: '11px', display: 'block', color: 'var(--text-muted)' }}>{t("quickModel", language)}</label>
                            <select 
                                value={quickModel} 
                                onChange={(e) => {
                                    setQuickModel(e.target.value);
                                    void saveSettings({ ...settings, quickModel: e.target.value });
                                }}
                                style={{ width: '100%', padding: '4px', borderRadius: '4px', fontSize: '11px', background: 'var(--background-secondary)', color: 'var(--text-normal)', border: '1px solid var(--background-modifier-border)' }}
                            >
                                {customModels.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: '11px', display: 'block', color: 'var(--text-muted)', fontWeight: 'bold', marginTop: '4px' }}>🌐 {t("languageLabel", language)}</label>
                            <select 
                                value={language} 
                                onChange={(e) => {
                                    const langVal = e.target.value as SupportedLanguage;
                                    setLanguage(langVal);
                                    void saveSettings({ ...settings, language: langVal });
                                }}
                                style={{ width: '100%', padding: '4px', borderRadius: '4px', fontSize: '11px', background: 'var(--background-secondary)', color: 'var(--text-normal)', border: '1px solid var(--background-modifier-border)' }}
                            >
                                <option value="auto">{t("autoDetect", language)}</option>
                                <option value="ru">Русский</option>
                                <option value="en">English</option>
                                <option value="es">Español</option>
                                <option value="de">Deutsch</option>
                                <option value="fr">Français</option>
                                <option value="zh">中文</option>
                                <option value="ja">日本語</option>
                                <option value="pt">Português</option>
                                <option value="ko">한국어</option>
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: '11px', display: 'block', color: 'var(--text-muted)', fontWeight: 'bold', marginTop: '4px' }}>📁 {t("defaultNoteFolderLabel", language)}</label>
                            <input 
                                type="text"
                                value={defaultNoteFolder}
                                onChange={(e) => {
                                    const folderVal = e.target.value;
                                    setDefaultNoteFolder(folderVal);
                                    if (settingsSaveTimerRef.current !== null) window.clearTimeout(settingsSaveTimerRef.current);
                                    settingsSaveTimerRef.current = window.setTimeout(() => {
                                        void saveSettings({ ...settings, defaultNoteFolder: folderVal });
                                    }, 300);
                                }}
                                placeholder={t("defaultNoteFolderPlaceholder", language)}
                                style={{ width: '100%', padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-secondary)', color: 'var(--text-normal)' }}
                            />
                        </div>
                    </div>

                    {/* Active Model Capabilities Card (UI-01) */}
                    <div style={{ background: 'var(--background-primary)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--background-modifier-border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <strong style={{ fontSize: '11px' }}>{t("parameters", language)}: {model}</strong>
                            <button 
                                onClick={() => { void verifyActiveModel(model, apiKey); }}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--interactive-accent)' }}
                            >
                                {verifyingModel ? t("checkingApi", language) : t("checkApi", language)}
                            </button>
                        </div>

                        {activeModelDetails ? (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div>• {t("contextLength", language)} <strong>{activeModelDetails.contextLength ? activeModelDetails.contextLength.toLocaleString() : 'N/A'} {t("tokens", language)}</strong></div>
                                <div>• {t("toolCallingSupport", language)} {activeModelDetails.supportsTools ? '✅' : '❌'}</div>
                                <div>• {t("visionSupport", language)} {activeModelDetails.supportsVision ? '✅' : '❌'}</div>
                                {modelFreshness && (
                                    <div>• {t("modelCutoffLabel", language)} <strong>{modelFreshness.cutoff}</strong> ({modelFreshness.daysSince}d ago) {modelFreshness.supportsWeb ? '🌐' : '🔒'}</div>
                                )}
                            </div>
                        ) : (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                {verifyingModel ? t("checkingApi", language) : t("infoUnavailable", language)}
                            </div>
                        )}
                    </div>

                    {/* Custom Models List Manager */}
                    <div style={{ background: 'var(--background-primary)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--background-modifier-border)' }}>
                        <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '11px' }}>{t("modelsList", language)}:</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                            {customModels.map(m => (
                                <div key={m} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 6px', background: 'var(--background-secondary)', borderRadius: '4px', fontSize: '11px' }}>
                                    <span style={{ fontFamily: 'monospace', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{m}</span>
                                    <button 
                                        onClick={(e) => handleDeleteModel(e, m)}
                                        title={t("deleteModelTooltip", language)}
                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-error, #ff5555)', fontSize: '11px' }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '4px' }}>
                            <input 
                                type="text"
                                value={newModelInput}
                                onChange={(e) => setNewModelInput(e.target.value)}
                                placeholder={t("addModelPlaceholder", language)}
                                style={{ flex: 1, padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-primary)', color: 'var(--text-normal)' }}
                            />
                            <button
                                onClick={handleAddModel}
                                style={{ padding: '4px 8px', fontSize: '11px', background: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                {t("addBtn", language)}
                            </button>
                        </div>
                    </div>

                    {/* Advanced Storage & Execution Limits Card */}
                    <div style={{ background: 'var(--background-primary)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--background-modifier-border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '11px' }}>📂 Storage Paths & Limits</div>

                        <div>
                            <label style={{ fontSize: '11px', display: 'block', color: 'var(--text-muted)' }}>{t("chatsFolderLabel", language)}</label>
                            <input type="text" value={chatsFolder} onChange={(e) => setChatsFolder(e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-secondary)', color: 'var(--text-normal)' }} />
                        </div>

                        <div>
                            <label style={{ fontSize: '11px', display: 'block', color: 'var(--text-muted)' }}>{t("memoryFileLabel", language)}</label>
                            <input type="text" value={memoryFile} onChange={(e) => setMemoryFile(e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-secondary)', color: 'var(--text-normal)' }} />
                        </div>

                        <div>
                            <label style={{ fontSize: '11px', display: 'block', color: 'var(--text-muted)' }}>{t("skillsFolderLabel", language)}</label>
                            <input type="text" value={skillsFolder} onChange={(e) => setSkillsFolder(e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-secondary)', color: 'var(--text-normal)' }} />
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '11px', display: 'block', color: 'var(--text-muted)' }}>{t("maxAgentIterationsLabel", language)}</label>
                                <input type="number" value={maxAgentIterations} onChange={(e) => setMaxAgentIterations(Number(e.target.value))} style={{ width: '100%', padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-secondary)', color: 'var(--text-normal)' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '11px', display: 'block', color: 'var(--text-muted)' }}>{t("maxPrefetchedNotesLabel", language)}</label>
                                <input type="number" value={maxPrefetchedNotes} onChange={(e) => setMaxPrefetchedNotes(Number(e.target.value))} style={{ width: '100%', padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-secondary)', color: 'var(--text-normal)' }} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '11px', display: 'block', color: 'var(--text-muted)' }}>{t("prefetchSnippetLengthLabel", language)}</label>
                                <input type="number" value={prefetchSnippetLength} onChange={(e) => setPrefetchSnippetLength(Number(e.target.value))} style={{ width: '100%', padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-secondary)', color: 'var(--text-normal)' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '11px', display: 'block', color: 'var(--text-muted)' }}>{t("ragResultLimitLabel", language)}</label>
                                <input type="number" value={ragResultLimit} onChange={(e) => setRagResultLimit(Number(e.target.value))} style={{ width: '100%', padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-secondary)', color: 'var(--text-normal)' }} />
                            </div>
                        </div>

                        <div>
                            <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-normal)', cursor: 'pointer', marginTop: '2px' }}>
                                <input type="checkbox" checked={enableVaultContextDefault} onChange={(e) => setEnableVaultContextDefault(e.target.checked)} />
                                <span>{t("enableVaultContextDefaultLabel", language)}</span>
                            </label>
                        </div>

                        <div>
                            <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-normal)', cursor: 'pointer', marginTop: '2px' }}>
                                <input type="checkbox" checked={confirmObsidianCommands} onChange={(e) => setConfirmObsidianCommands(e.target.checked)} />
                                <span>{t("confirmObsidianCommandsLabel", language)}</span>
                            </label>
                        </div>
                    </div>

                    {/* Temporal Intelligence Card */}
                    <div style={{ background: 'var(--background-primary)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--background-modifier-border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '11px' }}>🧠 Temporal Intelligence & Smart Routing</div>

                        <Tooltip titleKey="enableTemporalAwarenessLabel" descriptionKey="enableTemporalAwarenessDesc" language={language}>
                            <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-normal)', cursor: 'pointer' }}>
                                <input type="checkbox" checked={enableTemporalAwareness} onChange={(e) => setEnableTemporalAwareness(e.target.checked)} />
                                <span>{t("enableTemporalAwarenessLabel", language)}</span>
                            </label>
                        </Tooltip>

                        <Tooltip titleKey="enableAdaptivePrefetchLabel" descriptionKey="enableAdaptivePrefetchDesc" language={language}>
                            <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-normal)', cursor: 'pointer' }}>
                                <input type="checkbox" checked={enableAdaptivePrefetch} onChange={(e) => setEnableAdaptivePrefetch(e.target.checked)} />
                                <span>{t("enableAdaptivePrefetchLabel", language)}</span>
                            </label>
                        </Tooltip>

                        <Tooltip titleKey="enableFreshnessSuggestionsLabel" descriptionKey="enableFreshnessSuggestionsDesc" language={language}>
                            <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-normal)', cursor: 'pointer' }}>
                                <input type="checkbox" checked={enableFreshnessSuggestions} onChange={(e) => setEnableFreshnessSuggestions(e.target.checked)} />
                                <span>{t("enableFreshnessSuggestionsLabel", language)}</span>
                            </label>
                        </Tooltip>

                        <Tooltip titleKey="enableSmartToolFilteringLabel" descriptionKey="enableSmartToolFilteringDesc" language={language}>
                            <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-normal)', cursor: 'pointer' }}>
                                <input type="checkbox" checked={enableSmartToolFiltering} onChange={(e) => setEnableSmartToolFiltering(e.target.checked)} />
                                <span>{t("enableSmartToolFilteringLabel", language)}</span>
                            </label>
                        </Tooltip>

                        <Tooltip titleKey="enableSemanticRagLabel" descriptionKey="enableSemanticRagDesc" language={language}>
                            <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-normal)', cursor: 'pointer' }}>
                                <input type="checkbox" checked={enableSemanticRag} onChange={(e) => setEnableSemanticRag(e.target.checked)} />
                                <span>{t("enableSemanticRagLabel", language)}</span>
                            </label>
                        </Tooltip>

                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                            <div style={{ flex: 1 }}>
                                <Tooltip titleKey="intentStaleQueryWeightLabel" descriptionKey="intentStaleQueryWeightDesc" language={language}>
                                    <label style={{ fontSize: '11px', display: 'block', color: 'var(--text-muted)' }}>{t("intentStaleQueryWeightLabel", language)} ({intentStaleQueryWeight})</label>
                                </Tooltip>
                                <input type="number" step="0.1" value={intentStaleQueryWeight} onChange={(e) => setIntentStaleQueryWeight(Number(e.target.value))} style={{ width: '100%', padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-secondary)', color: 'var(--text-normal)' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <Tooltip titleKey="intentFreshnessWeightLabel" descriptionKey="intentFreshnessWeightDesc" language={language}>
                                    <label style={{ fontSize: '11px', display: 'block', color: 'var(--text-muted)' }}>{t("intentFreshnessWeightLabel", language)} ({intentFreshnessWeight})</label>
                                </Tooltip>
                                <input type="number" step="0.1" value={intentFreshnessWeight} onChange={(e) => setIntentFreshnessWeight(Number(e.target.value))} style={{ width: '100%', padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-secondary)', color: 'var(--text-normal)' }} />
                            </div>
                        </div>
                    </div>

                    {/* Intent Router Weights Card */}
                    <div style={{ background: 'var(--background-primary)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--background-modifier-border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '11px' }}>🎯 Intent Router Scoring Weights</div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <div style={{ flex: 1 }}>
                                <Tooltip titleKey="intentRoutingThresholdLabel" descriptionKey="intentRoutingThresholdDesc" language={language}>
                                    <label style={{ fontSize: '11px', display: 'block', color: 'var(--text-muted)' }}>Threshold ({intentRoutingThreshold})</label>
                                </Tooltip>
                                <input type="number" step="0.1" value={intentRoutingThreshold} onChange={(e) => setIntentRoutingThreshold(Number(e.target.value))} style={{ width: '100%', padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-secondary)', color: 'var(--text-normal)' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <Tooltip titleKey="intentCreationWeightLabel" descriptionKey="intentCreationWeightDesc" language={language}>
                                    <label style={{ fontSize: '11px', display: 'block', color: 'var(--text-muted)' }}>Creation Wt ({intentCreationWeight})</label>
                                </Tooltip>
                                <input type="number" step="0.1" value={intentCreationWeight} onChange={(e) => setIntentCreationWeight(Number(e.target.value))} style={{ width: '100%', padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-secondary)', color: 'var(--text-normal)' }} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <div style={{ flex: 1 }}>
                                <Tooltip titleKey="intentDeletionWeightLabel" descriptionKey="intentDeletionWeightDesc" language={language}>
                                    <label style={{ fontSize: '11px', display: 'block', color: 'var(--text-muted)' }}>Deletion Wt ({intentDeletionWeight})</label>
                                </Tooltip>
                                <input type="number" step="0.1" value={intentDeletionWeight} onChange={(e) => setIntentDeletionWeight(Number(e.target.value))} style={{ width: '100%', padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-secondary)', color: 'var(--text-normal)' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <Tooltip titleKey="intentQuestionWeightLabel" descriptionKey="intentQuestionWeightDesc" language={language}>
                                    <label style={{ fontSize: '11px', display: 'block', color: 'var(--text-muted)' }}>Question Wt ({intentQuestionWeight})</label>
                                </Tooltip>
                                <input type="number" step="0.1" value={intentQuestionWeight} onChange={(e) => setIntentQuestionWeight(Number(e.target.value))} style={{ width: '100%', padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-secondary)', color: 'var(--text-normal)' }} />
                            </div>
                        </div>
                    </div>

                    {/* Export & Import Settings Card */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <button 
                            onClick={handleExportSettings}
                            style={{ flex: 1, padding: '6px', fontSize: '11px', background: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-normal)' }}
                        >
                            📤 {t("exportSettings", language)}
                        </button>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            style={{ flex: 1, padding: '6px', fontSize: '11px', background: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-normal)' }}
                        >
                            📥 {t("importSettings", language)}
                        </button>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            accept=".json" 
                            style={{ display: 'none' }} 
                            onChange={handleImportSettings} 
                        />
                    </div>

                    <button 
                        onClick={() => { void handleSaveConfig(); }}
                        style={{ marginTop: '4px', padding: '6px 12px', background: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        {t("saveSettings", language)}
                    </button>
                </div>
            )}

            {/* Welcome Screen Guided Tour Overlay */}
            {showWelcome && (
                <WelcomeScreen 
                    language={language}
                    onClose={() => {
                        try {
                            app.saveLocalStorage("nei_welcome_seen", true);
                        } catch {
                            /* ignore storage error */
                        }
                        setShowWelcome(false);
                    }}
                />
            )}

            {/* Proactive Freshness Suggestion Banner */}
            {showFreshnessSuggestion && (
                <div className="nei-suggestion-banner" style={{
                    background: 'var(--background-secondary-alt)', border: '1px solid var(--interactive-accent)',
                    borderRadius: '6px', padding: '8px 12px', margin: '0 10px 8px 10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px'
                }}>
                    <span style={{ fontSize: '11px' }}>⚡ {showFreshnessSuggestion.message}</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={showFreshnessSuggestion.onEnableWeb} style={{ fontSize: '11px', padding: '3px 8px', background: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                            🌐 {t("agentMode", language)}
                        </button>
                        <button onClick={showFreshnessSuggestion.onDismiss} style={{ fontSize: '11px', padding: '3px 8px', background: 'transparent', border: '1px solid var(--background-modifier-border)', color: 'var(--text-muted)', borderRadius: '4px', cursor: 'pointer' }}>
                            ✕
                        </button>
                    </div>
                </div>
            )}

            {/* Chat Messages Container */}
            <div
                className="nei-chat-messages-container"
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
            >
                {currentSession.messages.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '24px', padding: '0 12px', fontSize: '13px' }}>
                        <div style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-normal)' }}>
                            {t("welcomeGreeting", language)}
                        </div>
                        <div style={{ fontSize: '12px', marginBottom: '16px', opacity: 0.85 }}>
                            {t("welcomeSubText", language)}
                        </div>
                        <div style={{ textAlign: 'left', display: 'inline-block', fontSize: '12px', lineHeight: '1.8', background: 'var(--background-secondary)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--background-modifier-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            • {t("featureNotes", language)}<br/>
                            • {t("featureRouting", language)}<br/>
                            • {t("featureVision", language)}<br/>
                            • {t("featureTokens", language)}
                        </div>
                    </div>
                )}

                {currentSession.messages.map((msg, idx) => (
                    <div
                        key={msg.id || idx}
                        className={`nei-chat-bubble nei-msg-bubble ${msg.role === 'user' ? 'nei-msg-bubble--user' : 'nei-msg-bubble--assistant'}`}
                    >
                        {msg.role === 'user' ? (
                            editingMsgIdx === idx ? (
                                /* Inline Edit Form for User Message */
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '220px' }}>
                                    <textarea 
                                        value={editingText} 
                                        onChange={(e) => setEditingText(e.target.value)}
                                        style={{ width: '100%', minHeight: '60px', padding: '6px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-primary)', color: 'var(--text-normal)', fontSize: '12px' }}
                                    />
                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                        <button 
                                            onClick={() => setEditingMsgIdx(null)}
                                            style={{ padding: '3px 8px', fontSize: '11px', background: 'transparent', border: '1px solid var(--background-modifier-border)', color: 'inherit', borderRadius: '4px', cursor: 'pointer' }}
                                        >
                                            {t("cancelBtn", language)}
                                        </button>
                                        <button 
                                            onClick={() => handleSaveEdit(idx)}
                                            style={{ padding: '3px 8px', fontSize: '11px', background: 'var(--background-primary)', color: 'var(--interactive-accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                                        >
                                            {t("saveResendBtn", language)}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* Standard User Message Display */
                                <div>
                                    {msg.images && msg.images.length > 0 && (
                                        <div style={{ display: 'flex', gap: '4px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                            {msg.images.map((img, i) => (
                                                <img key={i} src={img} style={{ width: '60px', height: '60px', borderRadius: '4px', objectFit: 'cover' }} />
                                            ))}
                                        </div>
                                    )}
                                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                                    <div className="nei-msg-actions">
                                        <button
                                            onClick={() => { void handleCopyText(msg.content || ""); }}
                                            title={t("copyText", language)}
                                            className="nei-msg-action-btn"
                                        >
                                            {t("copyText", language)}
                                        </button>
                                        <button
                                            onClick={() => handleStartEdit(idx, msg.content || "")}
                                            title={t("editText", language)}
                                            className="nei-msg-action-btn"
                                        >
                                            {t("editText", language)}
                                        </button>
                                        <button
                                            onClick={() => handleRetryUserMessage(idx)}
                                            title={t("retry", language)}
                                            disabled={loading}
                                            className="nei-msg-action-btn"
                                        >
                                            {t("retry", language)}
                                        </button>
                                    </div>
                                </div>
                            )
                        ) : (
                            /* Assistant Message Display */
                            <div style={{ minWidth: 0 }}>
                                <ObsidianMarkdown markdown={msg.content || ""} app={app} component={viewComponent} />

                                {/* Per-message Input/Output Token Counters */}
                                {(msg.promptTokens !== undefined || msg.completionTokens !== undefined) && (
                                    <div className="nei-msg-token-stats">
                                        <span className="nei-msg-token-chip">
                                            {t("inputTokens", language)} {msg.promptTokens || 0} {t("tokens", language)}
                                        </span>
                                        <span className="nei-msg-token-chip">
                                            {t("outputTokens", language)} {msg.completionTokens || 0} {t("tokens", language)}
                                        </span>
                                    </div>
                                )}

                                <div className="nei-msg-actions nei-msg-actions--assistant">
                                    <button
                                        onClick={() => { void handleCopyText(msg.content || ""); }}
                                        className="nei-msg-action-btn nei-msg-action-btn--outlined"
                                    >
                                        {t("copyText", language)}
                                    </button>
                                    <button
                                        onClick={() => { void handleBranchFromMessage(idx); }}
                                        className="nei-msg-action-btn nei-msg-action-btn--outlined"
                                        title="Fork conversation from this message"
                                    >
                                        🌿 Branch
                                    </button>
                                    {msg.content && msg.content.length > 50 && (
                                        <button
                                            onClick={() => { void handleSaveResponseAsNote(msg.content || ""); }}
                                            className="nei-msg-action-btn nei-msg-action-btn--outlined"
                                        >
                                            {t("saveNote", language)}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {/* Active Execution Steps — Reasoning Panel */}
                {activeSteps.length > 0 && (
                    <ReasoningPanel
                        steps={activeSteps}
                        language={language}
                        isExpanded={showReasoning}
                        onToggle={() => setShowReasoning(!showReasoning)}
                    />
                )}

                {/* Auto-Learning Proposal Banner */}
                {learningProposal && (
                    <div className="nei-learning-proposal" style={{
                        background: 'var(--background-secondary-alt)', border: '1px solid var(--interactive-accent)',
                        borderRadius: '8px', padding: '10px 12px', fontSize: '11px'
                    }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '6px', color: 'var(--interactive-accent)' }}>
                            {t("learningProposalTitle", language)}
                        </div>
                        {learningProposal.proposal.facts.length > 0 && (
                            <div style={{ marginBottom: '4px' }}>
                                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '2px' }}>
                                    {t("learningProposalFacts", language)}
                                </div>
                                {learningProposal.proposal.facts.map((f, i) => (
                                    <div key={i} style={{ padding: '1px 0', color: 'var(--text-normal)' }}>💡 {f}</div>
                                ))}
                            </div>
                        )}
                        {learningProposal.proposal.skillIdeas.length > 0 && (
                            <div style={{ marginBottom: '4px' }}>
                                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '2px' }}>
                                    {t("learningProposalSkills", language)}
                                </div>
                                {learningProposal.proposal.skillIdeas.map((s, i) => (
                                    <div key={i} style={{ padding: '1px 0', color: 'var(--text-normal)' }}>🛠 {s.name}: {s.description}</div>
                                ))}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
                            <button
                                onClick={learningProposal.onDismiss}
                                style={{ padding: '3px 10px', fontSize: '10px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-primary)', cursor: 'pointer', color: 'var(--text-muted)' }}
                            >{t("dismiss", language)}</button>
                            <button
                                onClick={() => void learningProposal.onAccept()}
                                style={{ padding: '3px 10px', fontSize: '10px', borderRadius: '4px', border: 'none', background: 'var(--interactive-accent)', color: 'var(--text-on-accent)', cursor: 'pointer', fontWeight: 600 }}
                            >{t("accept", language)}</button>
                        </div>
                    </div>
                )}

                {/* Real-time Streaming Response & Spinner */}
                {loading && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignSelf: 'flex-start', maxWidth: '92%', padding: '10px 14px', borderRadius: '12px', background: 'var(--background-secondary)', fontSize: '13px' }}>
                        {streamingContent ? (
                            <div>
                                <ObsidianMarkdown markdown={streamingContent} app={app} component={viewComponent} />
                                <span className="nei-streaming-cursor" style={{ color: 'var(--interactive-accent)', fontWeight: 'bold' }}> ▊</span>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                                <span className="nei-spinner">⟳</span>
                                <span>{t("agentRunning", language)}</span>
                            </div>
                        )}
                        <button 
                            onClick={() => abortController?.abort()}
                            title={t("stopGeneration", language)}
                            style={{ alignSelf: 'flex-end', marginTop: '4px', padding: '2px 8px', fontSize: '11px', background: 'var(--background-modifier-error-hover, #ff444433)', border: '1px solid var(--text-error, #ff5555)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-error, #ff5555)' }}
                        >
                            {t("stopBtn", language)}
                        </button>
                    </div>
                )}

                {/* Pending Tool Action Approval Modal (N6: queue, shown one at a time) */}
                {currentConfirmation && (
                    <div style={{ background: 'var(--background-secondary)', border: '2px solid var(--interactive-accent)', borderRadius: '8px', padding: '12px', marginTop: '6px', fontSize: '12px' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '6px', color: 'var(--text-normal)' }}>
                            ⚠️ {t("actionConfirmation", language)}
                            {pendingConfirmations.length > 1 && ` (${pendingConfirmations.length})`}
                        </div>
                        <div style={{ marginBottom: '4px' }}>
                            {t("agentWantsExecute", language)}: <code>{currentConfirmation.toolName}</code>
                        </div>
                        <div style={{ background: 'var(--background-primary)', padding: '6px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '11px', marginBottom: '10px', whiteSpace: 'pre-wrap', maxHeight: '100px', overflowY: 'auto' }}>
                            {currentConfirmation.argsStr}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => resolveConfirmation(currentConfirmation.id, false)}
                                style={{ padding: '4px 12px', background: 'transparent', border: '1px solid var(--background-modifier-border)', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                {t("cancelBtn", language)}
                            </button>
                            <button
                                onClick={() => resolveConfirmation(currentConfirmation.id, true)}
                                style={{ padding: '4px 12px', background: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                {t("allowBtn", language)}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Capability Warning Modal (FUNC-05) */}
            {warningModal && (
                <CapabilityWarningModal
                    unsupportedTypes={warningModal.unsupportedTypes}
                    modelName={model}
                    onProceedTextOnly={warningModal.onProceedTextOnly}
                    onRemoveAttachments={warningModal.onRemoveAttachments}
                    onCancel={() => setWarningModal(null)}
                />
            )}

            {/* Attached Files & Images Previews Bar */}
            {attachedFiles.length > 0 && (
                <div className="nei-attach-bar">
                    {attachedFiles.map((file) => (
                        <div key={file.id} className="nei-attach-chip">
                            {file.type === 'image' && <img src={file.content} style={{ width: '20px', height: '20px', objectFit: 'cover', borderRadius: '2px' }} />}
                            {file.type === 'text' && <span>📄</span>}
                            {file.type === 'pdf' && <span>📕</span>}
                            {file.type === 'audio' && <span>🎤</span>}
                            {file.type === 'video' && <span>🎥</span>}
                            <span className="nei-attach-chip-name">
                                {file.name}
                            </span>
                            <span className="nei-attach-chip-size">({(file.sizeBytes / 1024).toFixed(0)}KB)</span>
                            <button
                                onClick={() => {
                                    setAttachedFiles(prev => prev.filter(f => f.id !== file.id));
                                    if (file.type === 'image') {
                                        setAttachedImages(prev => prev.filter(img => img !== file.content));
                                    }
                                }}
                                className="nei-attach-chip-remove"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Bottom Query Input Box */}
            <div className="nei-chat-input-container">
                <div className="nei-chat-input-row">
                    <label 
                        title={t("attachTooltip", language)}
                        aria-label={t("attachTooltip", language)}
                        className="nei-chat-attach-btn"
                    >
                        📎
                        <input 
                            type="file" 
                            accept="image/*,.txt,.md,.json,.js,.ts,.py,.css,.html,.csv,.yaml,.yml,.pdf,audio/*,video/*"
                            multiple
                            onChange={handleFileSelect}
                            style={{ display: 'none' }} 
                        />
                    </label>

                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => {
                            setInput(e.target.value);
                            adjustTextareaHeight();
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                            }
                        }}
                        onFocus={handleTextareaFocus}
                        placeholder={t("inputPlaceholder", language)}
                        disabled={loading}
                        rows={3}
                        className="nei-chat-textarea"
                    />
                    <button
                        onClick={handleSendMessage}
                        disabled={loading || (!input.trim() && attachedFiles.length === 0)}
                        title="Send Message"
                        aria-label="Send Message"
                        className="nei-chat-send-btn"
                    >
                        {loading ? '...' : '➤'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const ChatPanel: React.FC<ChatPanelProps> = (props) => {
    const [panelKey, setPanelKey] = React.useState(0);
    return (
        <ErrorBoundary key={panelKey}>
            <ChatPanelInner {...props} onReload={() => setPanelKey(k => k + 1)} />
        </ErrorBoundary>
    );
};
