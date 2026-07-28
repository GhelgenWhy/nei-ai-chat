import * as React from "react";
import { App, Component, MarkdownRenderer, Notice, WorkspaceLeaf } from "obsidian";
import { ChatMessage, getModelTemporalInfo } from "../services/llm";
import { AgentLoop, AgentStep } from "../services/agent/agentLoop";
import { ChatStore, ChatSession } from "../services/chat/chatStore";
import { OpenRouterService, OpenRouterModelInfo, OpenRouterKeyInfo } from "../services/openrouter";
import { ExecutionMode, IntentRouter } from "../services/agent/intentRouter";
import { t, SupportedLanguage } from "../i18n/translations";
import { NeiAiChatSettings } from "../../main";
import { ToolRegistry } from "../services/tools/toolRegistry";
import { ensureFolderExists } from "../services/tools/vaultTools";
import { ErrorBoundary } from "./ErrorBoundary";
import { Tooltip } from "./Tooltip";
import { WelcomeScreen } from "./WelcomeScreen";

interface ChatPanelProps {
    app: App;
    viewLeaf?: WorkspaceLeaf;
    settings: NeiAiChatSettings;
    saveSettings: (settings: NeiAiChatSettings) => Promise<void>;
    toolRegistry: ToolRegistry;
}

export const ObsidianMarkdown: React.FC<{ markdown: string; app: App }> = ({ markdown, app }) => {
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (containerRef.current) {
            containerRef.current.empty();
            const component = new Component();
            component.load();
            void MarkdownRenderer.render(
                app,
                markdown,
                containerRef.current,
                "",
                component
            );
        }
    }, [markdown, app]);

    return <div ref={containerRef} className="markdown-preview-view markdown-rendered" style={{ background: 'transparent', padding: 0 }} />;
};

const ChatPanelInner: React.FC<ChatPanelProps> = ({ app, viewLeaf, settings, saveSettings, toolRegistry }) => {

    const isMainTab = viewLeaf ? (viewLeaf.getRoot() === app.workspace.rootSplit) : false;

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
    const [executionMode, setExecutionMode] = React.useState<ExecutionMode>(settings.executionMode || "auto");
    const [loading, setLoading] = React.useState(false);
    const [activeSteps, setActiveSteps] = React.useState<AgentStep[]>([]);
    const [showSessionsDrawer, setShowSessionsDrawer] = React.useState(false);
    const [showConfig, setShowConfig] = React.useState(false);
    const [showIntentDebug, setShowIntentDebug] = React.useState(false);
    const [pendingConfirmation, setPendingConfirmation] = React.useState<{ toolName: string; argsStr: string; resolve: (approved: boolean) => void } | null>(null);
    const [showFreshnessSuggestion, setShowFreshnessSuggestion] = React.useState<{
        message: string;
        onEnableWeb: () => void;
        onDismiss: () => void;
    } | null>(null);

    // Edit message inline state
    const [editingMsgIdx, setEditingMsgIdx] = React.useState<number | null>(null);
    const [editingText, setEditingText] = React.useState("");

    // Local Config & OpenRouter Stats State
    const [endpointUrl, setEndpointUrl] = React.useState(settings.endpointUrl || "https://openrouter.ai/api/v1");
    const [apiKey, setApiKey] = React.useState(settings.apiKey || "");
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
        const list = await ChatStore.listSessions(app, settings);
        setSessionsList(list);
    };

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
    const clearTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => {
        return () => {
            if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
            if (settingsSaveTimerRef.current) clearTimeout(settingsSaveTimerRef.current);
        };
    }, []);

    const handleClearAllSessions = async () => {
        if (!confirmingClear) {
            setConfirmingClear(true);
            clearTimerRef.current = setTimeout(() => setConfirmingClear(false), 4000);
            return;
        }
        setConfirmingClear(false);
        if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
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
    const [ragSnippetLength, setRagSnippetLength] = React.useState<number>(settings.ragSnippetLength || 1000);
    const [confirmObsidianCommands, setConfirmObsidianCommands] = React.useState<boolean>(settings.confirmObsidianCommands ?? true);

    const [enableTemporalAwareness, setEnableTemporalAwareness] = React.useState<boolean>(settings.enableTemporalAwareness ?? true);
    const [enableAdaptivePrefetch, setEnableAdaptivePrefetch] = React.useState<boolean>(settings.enableAdaptivePrefetch ?? true);
    const [enableFreshnessSuggestions, setEnableFreshnessSuggestions] = React.useState<boolean>(settings.enableFreshnessSuggestions ?? true);
    const [enableSmartToolFiltering, setEnableSmartToolFiltering] = React.useState<boolean>(settings.enableSmartToolFiltering ?? true);

    const [intentRoutingThreshold, setIntentRoutingThreshold] = React.useState<number>(settings.intentRoutingThreshold ?? 2.5);
    const [intentVaultKeywordWeight, setIntentVaultKeywordWeight] = React.useState<number>(settings.intentVaultKeywordWeight ?? 2.0);
    const [intentCreationWeight, setIntentCreationWeight] = React.useState<number>(settings.intentCreationWeight ?? 3.0);
    const [intentDeletionWeight, setIntentDeletionWeight] = React.useState<number>(settings.intentDeletionWeight ?? 4.0);
    const [intentAnalysisWeight, setIntentAnalysisWeight] = React.useState<number>(settings.intentAnalysisWeight ?? 2.5);
    const [intentQuestionWeight, setIntentQuestionWeight] = React.useState<number>(settings.intentQuestionWeight ?? -1.5);
    const [intentLengthWeight, setIntentLengthWeight] = React.useState<number>(settings.intentLengthWeight ?? 0.005);
    const [intentHistoryWeight, setIntentHistoryWeight] = React.useState<number>(settings.intentHistoryWeight ?? 0.3);
    const [intentStaleQueryWeight, setIntentStaleQueryWeight] = React.useState<number>(settings.intentStaleQueryWeight ?? 3.0);
    const [intentFreshnessWeight, setIntentFreshnessWeight] = React.useState<number>(settings.intentFreshnessWeight ?? 2.0);

    const settingsSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
                // Extract actual path from result like "Успех: Создана новая заметка 'folder/file.md'."
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
    const [showWelcome, setShowWelcome] = React.useState<boolean>(() => !localStorage.getItem("nei_welcome_seen"));
    const [enableSemanticRag, setEnableSemanticRag] = React.useState<boolean>(settings.enableSemanticRag ?? false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleExportSettings = () => {
        try {
            const dataStr = JSON.stringify(settings, null, 2);
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `nei-settings-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            new Notice(t("settingsExported", language));
        } catch (e: any) {
            new Notice(`Export error: ${e?.message || String(e)}`);
        }
    };

    const handleImportSettings = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const imported = JSON.parse(text) as Partial<NeiAiChatSettings>;
            const newSettings = { ...settings, ...imported };
            await saveSettings(newSettings);
            new Notice(t("settingsImported", language));
        } catch (err: any) {
            new Notice(`Import error: ${err?.message || String(err)}`);
        }
    };

    // Execute agent loop for a query and history slice
    const executeQuery = async (queryText: string, historySlice: ChatMessage[], imagesPayload?: string[]) => {
        setLoading(true);
        setActiveSteps([]);
        setEditingMsgIdx(null);
        setStreamingContent("");

        const currentImages = imagesPayload || attachedImages;
        const userMsg: ChatMessage = { 
            role: "user", 
            content: queryText,
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
                chatHistory: historySlice,
                images: currentImages,
                executionMode,
                onStepUpdate: (steps) => {
                    setActiveSteps(steps);
                },
                onConfirmationRequired: async (toolName, argsStr) => {
                    return new Promise((resolve) => {
                        setPendingConfirmation({ toolName, argsStr, resolve });
                    });
                },
                onStreamChunk: (chunk) => {
                    setStreamingContent(prev => prev + chunk);
                },
                toolRegistry,
                language,
                settings
            });
            setStreamingContent("");

            const assistantMsg: ChatMessage = { 
                role: "assistant", 
                content: result.responseText,
                promptTokens: result.promptTokens,
                completionTokens: result.completionTokens
            };
            const finalMessages = [...updatedMessages, assistantMsg];

            const finalSession: ChatSession = {
                ...updatedSession,
                messages: finalMessages,
                steps: activeSteps
            };

            setCurrentSession(finalSession);
            await ChatStore.saveSession(app, settings, finalSession);
            await refreshSessionsList();

            // Refresh key info balance after request
            if (apiKey) {
                void OpenRouterService.getKeyInfo(apiKey).then(setKeyInfo);
            }
        } catch (e: unknown) {
            console.error("[NEI Agent Error]", e);
            const err = e as { message?: string };
            const errMessages: ChatMessage[] = [...updatedMessages, { role: "assistant", content: `${t("agentError", language)} ${err?.message || String(e)}` }];
            const errSession: ChatSession = {
                ...updatedSession,
                messages: errMessages
            };
            setCurrentSession(errSession);
            await ChatStore.saveSession(app, settings, errSession);
        } finally {
            setLoading(false);
            setActiveSteps([]);
            setPendingConfirmation(null);
        }
    };

    const handleSendMessage = () => {
        if (!input.trim() || loading) return;
        const queryText = input.trim();
        setInput("");
        void executeQuery(queryText, currentSession.messages);
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

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const reader = new FileReader();
            reader.onload = (event) => {
                const res = event.target?.result as string;
                if (res) {
                    setAttachedImages(prev => [...prev, res]);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="nei-chat-panel-container">
            {/* Header / Session & Mode Controls Bar */}
            <div className="nei-chat-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button 
                        onClick={() => setShowSessionsDrawer(!showSessionsDrawer)}
                        title={t("historyTooltip", language)}
                        style={{ background: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', fontSize: '11px', fontWeight: '500' }}
                    >
                        📂 {formatSessionTitle(currentSession.title)} 
                        <span style={{ fontSize: '10px', opacity: 0.7, marginLeft: '4px' }}>
                            ({currentSession.messages.length})
                        </span>
                    </button>
                    <button 
                        onClick={() => { handleNewChat(); }}
                        title={t("newChatTooltip", language)}
                        style={{ background: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', fontSize: '11px', fontWeight: 'bold' }}
                    >
                        {t("newChat", language)}
                    </button>
                    <button 
                        onClick={() => { void handleToggleTabMode(); }}
                        title={isMainTab ? t("moveSidebarTitle", language) : t("moveTabTitle", language)}
                        style={{ background: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)', borderRadius: '4px', cursor: 'pointer', padding: '4px 6px', fontSize: '11px' }}
                    >
                        {isMainTab ? t("moveSidebar", language) : t("moveTab", language)}
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {modelFreshness && enableTemporalAwareness && (
                        <div 
                            className="nei-freshness-indicator" 
                            title={`Cutoff: ${modelFreshness.cutoff} (${modelFreshness.daysSince}d ago)`}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '3px',
                                padding: '2px 6px', borderRadius: '4px',
                                background: modelFreshness.isStale ? 'var(--background-modifier-error-hover, #ff444433)' : 'var(--background-modifier-success, #44ff4433)',
                                fontSize: '10px', fontWeight: 600, color: 'var(--text-normal)'
                            }}
                        >
                            {modelFreshness.supportsWeb ? '🌐' : '🔒'}
                            <span>{modelFreshness.cutoff}</span>
                        </div>
                    )}
                    <select
                        value={executionMode}
                        onChange={(e) => {
                            const val = e.target.value as ExecutionMode;
                            setExecutionMode(val);
                            void saveSettings({ ...settings, executionMode: val });
                        }}
                        title={t("modeAutoTitle", language)}
                        className="nei-select-mode"
                    >
                        <option value="auto">{t("modeAuto", language)}</option>
                        <option value="quick">{t("modeQuick", language)}</option>
                        <option value="agent">{t("modeAgent", language)}</option>
                    </select>

                    <button 
                        onClick={() => setShowConfig(!showConfig)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)' }}
                        title={t("settingsTooltip", language)}
                    >
                        ⚙️
                    </button>
                </div>
            </div>

            {/* Sessions History Drawer */}
            {showSessionsDrawer && (
                <div style={{ position: 'absolute', top: '45px', left: '10px', right: '10px', zIndex: 100, background: 'var(--background-primary)', border: '1px solid var(--background-modifier-border)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', maxHeight: '280px', overflowY: 'auto', padding: '8px' }}>
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
            )}

            {/* Config & Model Manager Modal */}
            {showConfig && (
                <div style={{ flexShrink: 0, maxHeight: '55vh', overflowY: 'auto', background: 'var(--background-secondary)', padding: '12px', borderRadius: '8px', marginBottom: '12px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                                <option value="auto">🌐 {t("autoDetect", language)}</option>
                                <option value="ru">🌐 RU — Русский</option>
                                <option value="en">🌐 EN — English</option>
                                <option value="es">🌐 ES — Español</option>
                                <option value="de">🌐 DE — Deutsch</option>
                                <option value="fr">🌐 FR — Français</option>
                                <option value="zh">🌐 ZH — 中文</option>
                                <option value="ja">🌐 JA — 日本語</option>
                                <option value="pt">🌐 PT — Português</option>
                                <option value="ko">🌐 KO — 한국어</option>
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
                                    if (settingsSaveTimerRef.current) clearTimeout(settingsSaveTimerRef.current);
                                    settingsSaveTimerRef.current = setTimeout(() => {
                                        void saveSettings({ ...settings, defaultNoteFolder: folderVal });
                                    }, 300);
                                }}
                                placeholder={t("defaultNoteFolderPlaceholder", language)}
                                style={{ width: '100%', padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-secondary)', color: 'var(--text-normal)' }}
                            />
                        </div>
                    </div>

                    {/* Active Model Capabilities Card */}
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
                            <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-normal)', cursor: 'pointer', marginTop: '4px' }}>
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
                            localStorage.setItem("nei_welcome_seen", "true");
                        } catch {}
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
            <div className="nei-chat-messages-container">
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
                        key={idx} 
                        className="nei-chat-bubble"
                        style={{
                            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            maxWidth: '92%',
                            padding: '10px 14px',
                            borderRadius: '12px',
                            background: msg.role === 'user' ? 'var(--interactive-accent)' : 'var(--background-secondary)',
                            color: msg.role === 'user' ? 'var(--text-on-accent)' : 'var(--text-normal)',
                            fontSize: '13px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            position: 'relative'
                        }}
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
                                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', justifyContent: 'flex-end', fontSize: '11px', flexWrap: 'wrap', maxWidth: '100%', opacity: 0.9 }}>
                                        <button
                                            onClick={() => { void handleCopyText(msg.content || ""); }}
                                            title={t("copyText", language)}
                                            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px', fontSize: '11px', whiteSpace: 'nowrap' }}
                                        >
                                            {t("copyText", language)}
                                        </button>
                                        <button
                                            onClick={() => handleStartEdit(idx, msg.content || "")}
                                            title={t("editText", language)}
                                            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px', fontSize: '11px', whiteSpace: 'nowrap' }}
                                        >
                                            {t("editText", language)}
                                        </button>
                                        <button
                                            onClick={() => handleRetryUserMessage(idx)}
                                            title={t("retry", language)}
                                            disabled={loading}
                                            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px', fontSize: '11px', whiteSpace: 'nowrap' }}
                                        >
                                            {t("retry", language)}
                                        </button>
                                    </div>
                                </div>
                            )
                        ) : (
                            /* Assistant Message Display */
                            <div style={{ minWidth: 0 }}>
                                <ObsidianMarkdown markdown={msg.content || ""} app={app} />
                                
                                {/* Per-message Input/Output Token Counters */}
                                {(msg.promptTokens !== undefined || msg.completionTokens !== undefined) && (
                                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', fontSize: '10px', color: 'var(--text-muted)', borderTop: '1px solid var(--background-modifier-border)', paddingTop: '4px', flexWrap: 'wrap', maxWidth: '100%' }}>
                                        <span style={{ background: 'var(--background-primary)', padding: '2px 6px', borderRadius: '4px' }}>
                                            {t("inputTokens", language)} {msg.promptTokens || 0} {t("tokens", language)}
                                        </span>
                                        <span style={{ background: 'var(--background-primary)', padding: '2px 6px', borderRadius: '4px' }}>
                                            {t("outputTokens", language)} {msg.completionTokens || 0} {t("tokens", language)}
                                        </span>
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '6px', marginTop: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '11px', maxWidth: '100%' }}>
                                    <button 
                                        onClick={() => { void handleCopyText(msg.content || ""); }}
                                        style={{ background: 'var(--background-primary)', border: '1px solid var(--background-modifier-border)', borderRadius: '4px', cursor: 'pointer', padding: '3px 8px', color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap', maxWidth: '100%' }}
                                    >
                                        {t("copyText", language)}
                                    </button>
                                    <button 
                                        onClick={() => { void handleBranchFromMessage(idx); }}
                                        style={{ background: 'var(--background-primary)', border: '1px solid var(--background-modifier-border)', borderRadius: '4px', cursor: 'pointer', padding: '3px 8px', color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap', maxWidth: '100%' }}
                                        title="Fork conversation from this message"
                                    >
                                        🌿 Branch
                                    </button>
                                    {msg.content && msg.content.length > 50 && (
                                        <button 
                                            onClick={() => { void handleSaveResponseAsNote(msg.content || ""); }}
                                            style={{ background: 'var(--background-primary)', border: '1px solid var(--background-modifier-border)', borderRadius: '4px', cursor: 'pointer', padding: '3px 8px', color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap', maxWidth: '100%' }}
                                        >
                                            {t("saveNote", language)}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {/* Active Execution Steps Log Component */}
                {activeSteps.length > 0 && (
                    <div style={{ background: 'var(--background-secondary-alt)', border: '1px solid var(--background-modifier-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '2px' }}>
                            ⚡ {t("agentReasoningLog", language)}
                        </div>
                        {activeSteps.map((step) => (
                            <details key={step.id} style={{ marginBottom: '4px' }}>
                                <summary style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', opacity: step.status === 'running' ? 1 : 0.85 }}>
                                    <span>{step.status === 'running' ? '⏳' : step.status === 'completed' ? '✅' : '❌'}</span>
                                    <strong style={{ color: 'var(--text-normal)' }}>{step.title}</strong>
                                </summary>
                                {step.detail && (
                                    <div style={{ color: 'var(--text-muted)', fontSize: '10px', marginTop: '2px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: '120px', overflowY: 'auto', padding: '4px 6px', background: 'var(--background-primary)', borderRadius: '4px' }}>
                                        {step.detail}
                                    </div>
                                )}
                                {step.meta && (
                                    <div style={{ marginTop: '2px', fontSize: '9px', opacity: 0.75, fontFamily: 'monospace' }}>
                                        <code>{JSON.stringify(step.meta)}</code>
                                    </div>
                                )}
                            </details>
                        ))}
                    </div>
                )}

                {/* Real-time Streaming Response & Spinner */}
                {loading && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignSelf: 'flex-start', maxWidth: '92%', padding: '10px 14px', borderRadius: '12px', background: 'var(--background-secondary)', fontSize: '13px' }}>
                        {streamingContent ? (
                            <div>
                                <ObsidianMarkdown markdown={streamingContent} app={app} />
                                <span className="nei-streaming-cursor" style={{ color: 'var(--interactive-accent)', fontWeight: 'bold' }}> ▊</span>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                                <span className="nei-spinner">⟳</span>
                                <span>{t("agentRunning", language)}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Pending Tool Action Approval Modal */}
                {pendingConfirmation && (
                    <div style={{ background: 'var(--background-secondary)', border: '2px solid var(--interactive-accent)', borderRadius: '8px', padding: '12px', marginTop: '6px', fontSize: '12px' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '6px', color: 'var(--text-normal)' }}>
                            ⚠️ {t("actionConfirmation", language)}
                        </div>
                        <div style={{ marginBottom: '4px' }}>
                            {t("agentWantsExecute", language)}: <code>{pendingConfirmation.toolName}</code>
                        </div>
                        <div style={{ background: 'var(--background-primary)', padding: '6px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '11px', marginBottom: '10px', whiteSpace: 'pre-wrap', maxHeight: '100px', overflowY: 'auto' }}>
                            {pendingConfirmation.argsStr}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => {
                                    pendingConfirmation.resolve(false);
                                    setPendingConfirmation(null);
                                }}
                                style={{ padding: '4px 12px', background: 'transparent', border: '1px solid var(--background-modifier-border)', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                {t("cancelBtn", language)}
                            </button>
                            <button
                                onClick={() => {
                                    pendingConfirmation.resolve(true);
                                    setPendingConfirmation(null);
                                }}
                                style={{ padding: '4px 12px', background: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                {t("allowBtn", language)}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Attached Image Previews Bar */}
            {attachedImages.length > 0 && (
                <div style={{ flexShrink: 0, display: 'flex', gap: '6px', padding: '6px', background: 'var(--background-secondary)', borderRadius: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    {attachedImages.map((img, idx) => (
                        <div key={idx} style={{ position: 'relative' }}>
                            <img src={img} style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px' }} />
                            <button 
                                onClick={() => setAttachedImages(prev => prev.filter((_, i) => i !== idx))}
                                style={{ position: 'absolute', top: '-4px', right: '-4px', background: 'var(--text-error, #ff5555)', color: '#fff', border: 'none', borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Bottom Query Input Box */}
            <div className="nei-chat-input-container">
                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
                    <label 
                        title={t("attachTooltip", language)}
                        style={{ padding: '8px 10px', background: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', marginBottom: '2px' }}
                    >
                        📎
                        <input 
                            type="file" 
                            accept="image/*,.txt,.md,.json,.js,.ts"
                            multiple
                            onChange={handleFileSelect}
                            style={{ display: 'none' }} 
                        />
                    </label>

                    <textarea
                        value={input}
                        onChange={(e) => {
                            setInput(e.target.value);
                            const target = e.target as HTMLElement;
                            target.setCssStyles({
                                height: `${Math.min(target.scrollHeight, 280)}px`
                            });
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                            }
                        }}
                        placeholder={t("inputPlaceholder", language)}
                        disabled={loading}
                        rows={3}
                        style={{
                            flex: 1,
                            minHeight: '60px',
                            maxHeight: '280px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--background-modifier-border)',
                            background: 'var(--background-primary)',
                            color: 'var(--text-normal)',
                            resize: 'vertical',
                            fontSize: '13px',
                            lineHeight: '1.4',
                            fontFamily: 'inherit'
                        }}
                    />
                    <button
                        onClick={handleSendMessage}
                        disabled={loading || (!input.trim() && attachedImages.length === 0)}
                        style={{ padding: '0 14px', height: '60px', background: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', marginBottom: '2px' }}
                    >
                        {loading ? '...' : '➤'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const ChatPanel: React.FC<ChatPanelProps> = (props) => (
    <ErrorBoundary>
        <ChatPanelInner {...props} />
    </ErrorBoundary>
);
