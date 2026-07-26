import * as React from "react";
import { App, Component, MarkdownRenderer, Notice, WorkspaceLeaf } from "obsidian";
import { ChatMessage } from "../services/llm";
import { AgentLoop, AgentStep } from "../services/agent/agentLoop";
import { ChatStore, ChatSession } from "../services/chat/chatStore";
import { OpenRouterService, OpenRouterModelInfo, OpenRouterKeyInfo } from "../services/openrouter";
import { ExecutionMode } from "../services/agent/intentRouter";
import { t, SupportedLanguage } from "../i18n/translations";

interface ChatPanelProps {
    app: App;
    viewLeaf?: WorkspaceLeaf;
    settings: any;
    saveSettings: (settings: any) => Promise<void>;
}

export const ObsidianMarkdown: React.FC<{ markdown: string; app: App }> = ({ markdown, app }) => {
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (containerRef.current) {
            containerRef.current.empty();
            const component = new Component();
            component.load();
            MarkdownRenderer.renderMarkdown(
                markdown,
                containerRef.current,
                "",
                component
            );
        }
    }, [markdown]);

    return <div ref={containerRef} className="markdown-preview-view markdown-rendered" style={{ background: 'transparent', padding: 0 }} />;
};

export const ChatPanel: React.FC<ChatPanelProps> = ({ app, viewLeaf, settings, saveSettings }) => {

    const isMainTab = viewLeaf ? (viewLeaf.getRoot() === app.workspace.rootSplit) : false;

    const handleToggleTabMode = async () => {
        try {
            const workspace = app.workspace;
            if (isMainTab) {
                // Move from main tab to right sidebar
                const rightLeaf = workspace.getRightLeaf(false);
                if (rightLeaf) {
                    await rightLeaf.setViewState({ type: "nei-chat-view", active: true });
                    workspace.revealLeaf(rightLeaf);
                }
                if (viewLeaf) {
                    viewLeaf.detach();
                }
            } else {
                // Move from sidebar to main editor tab
                const tabLeaf = workspace.getLeaf("tab");
                await tabLeaf.setViewState({ type: "nei-chat-view", active: true });
                workspace.revealLeaf(tabLeaf);
                if (viewLeaf) {
                    viewLeaf.detach();
                }
            }
        } catch (e: any) {
            new Notice(`${t("modeSwitchError", language)} ${e?.message || e}`);
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
    const [pendingConfirmation, setPendingConfirmation] = React.useState<{ toolName: string; argsStr: string; resolve: (approved: boolean) => void } | null>(null);

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

    React.useEffect(() => {
        refreshSessionsList();
        verifyActiveModel(model, apiKey);
        if (apiKey) {
            OpenRouterService.getKeyInfo(apiKey).then(setKeyInfo);
        }
    }, []);

    const refreshSessionsList = async () => {
        const list = await ChatStore.listSessions(app);
        setSessionsList(list);
    };

    const verifyActiveModel = async (targetModel: string, key: string) => {
        setVerifyingModel(true);
        try {
            const details = await OpenRouterService.getModelDetails(targetModel, key);
            setActiveModelDetails(details);
        } catch (e) {
            setActiveModelDetails(null);
        } finally {
            setVerifyingModel(false);
        }
    };

    const formatSessionTitle = (tTitle: string) => {
        if (!tTitle || tTitle === "Новый диалог" || tTitle === "Новый чат" || tTitle === "New Chat") {
            return t("newChatSession", language);
        }
        return tTitle;
    };

    const handleSelectModel = (selectedModel: string) => {
        setModel(selectedModel);
        verifyActiveModel(selectedModel, apiKey);
        saveSettings({ ...settings, model: selectedModel, visionModel, quickModel, executionMode });
    };

    const handleAddModel = () => {
        if (!newModelInput.trim()) return;
        const trimmed = newModelInput.trim();
        if (!customModels.includes(trimmed)) {
            const updated = [...customModels, trimmed];
            setCustomModels(updated);
            setModel(trimmed);
            verifyActiveModel(trimmed, apiKey);
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
            verifyActiveModel(nextModel, apiKey);
        }
    };

    const handleNewChat = () => {
        const newSess = ChatStore.createNewSession();
        setCurrentSession(newSess);
        setActiveSteps([]);
        setShowSessionsDrawer(false);
        setEditingMsgIdx(null);
    };

    const handleSelectSession = async (sessionId: string) => {
        const loaded = await ChatStore.loadSession(app, sessionId);
        if (loaded) {
            setCurrentSession(loaded);
            setActiveSteps([]);
            setEditingMsgIdx(null);
        }
        setShowSessionsDrawer(false);
    };

    const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        await ChatStore.deleteSession(app, sessionId);
        await refreshSessionsList();
        if (currentSession.id === sessionId) {
            handleNewChat();
        }
    };

    const handleClearAllSessions = async () => {
        if (confirm(t("confirmClearChats", language))) {
            await ChatStore.clearAllSessions(app);
            await refreshSessionsList();
            handleNewChat();
            new Notice(t("historyClearedNotice", language));
        }
    };

    const [language, setLanguage] = React.useState<SupportedLanguage>(settings.language || "auto");

    const handleSaveConfig = async () => {
        const newSettings = {
            ...settings,
            provider: "openrouter",
            endpointUrl,
            apiKey,
            model,
            visionModel,
            quickModel,
            executionMode,
            customModels,
            language
        };
        await saveSettings(newSettings);
        setShowConfig(false);
        new Notice(t("saveSettings", language) + "!");
    };

    const handleCopyText = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            new Notice(t("copied", language));
        } catch (e) {
            new Notice(t("copyError", language));
        }
    };

    const handleSaveResponseAsNote = async (content: string) => {
        const notePath = `Tasks/Summary_${Date.now()}.md`;
        try {
            await app.vault.create(notePath, content);
            new Notice(`${t("noteCreatedSuccess", language)} '${notePath}'!`);
        } catch (e: any) {
            new Notice(`${t("noteCreateError", language)} ${e?.message || e}`);
        }
    };

    // Execute agent loop for a query and history slice
    const executeQuery = async (queryText: string, historySlice: ChatMessage[], imagesPayload?: string[]) => {
        setLoading(true);
        setActiveSteps([]);
        setEditingMsgIdx(null);

        const currentImages = imagesPayload || attachedImages;
        const userMsg: ChatMessage = { 
            role: "user", 
            content: queryText,
            ...(currentImages.length > 0 ? { images: currentImages } : {})
        };
        const updatedMessages = [...historySlice, userMsg];
        
        const updatedSession: ChatSession = {
            ...currentSession,
            title: currentSession.messages.length === 0 
                ? (queryText.length > 25 ? queryText.substring(0, 25) + "..." : queryText)
                : currentSession.title,
            messages: updatedMessages
        };

        setCurrentSession(updatedSession);
        setAttachedImages([]); // Reset input image attachments

        try {
            // Select active model based on attachments / category
            let targetModel = model || "google/gemini-2.5-flash";
            if (currentImages.length > 0 && visionModel) {
                targetModel = visionModel;
            } else if (executionMode === "quick" && quickModel) {
                targetModel = quickModel;
            }

            const llmConfig = {
                provider: "openrouter" as const,
                endpointUrl: endpointUrl || "https://openrouter.ai/api/v1",
                apiKey,
                model: targetModel
            };

            const result = await AgentLoop.run({
                app,
                config: llmConfig,
                userQuery: queryText,
                chatHistory: historySlice,
                images: currentImages,
                executionMode,
                onStepUpdate: (steps) => {
                    setActiveSteps(steps);
                },
                onConfirmationRequired: (toolName, argsStr) => {
                    return new Promise<boolean>((resolve) => {
                        setPendingConfirmation({ toolName, argsStr, resolve });
                    });
                }
            });

            const assistantMsg: ChatMessage = { 
                role: "assistant", 
                content: result.responseText,
                promptTokens: result.promptTokens,
                completionTokens: result.completionTokens
            };

            const finalMessages: ChatMessage[] = [...updatedMessages, assistantMsg];
            const finalSession: ChatSession = {
                ...updatedSession,
                messages: finalMessages
            };

            setCurrentSession(finalSession);
            await ChatStore.saveSession(app, finalSession);
            await refreshSessionsList();

            // Refresh key info balance after request
            if (apiKey) {
                OpenRouterService.getKeyInfo(apiKey).then(setKeyInfo);
            }
        } catch (e: any) {
            console.error("[NEI Agent Error]", e);
            const errMessages: ChatMessage[] = [...updatedMessages, { role: "assistant", content: `${t("agentError", language)} ${e?.message || e}` }];
            const errSession: ChatSession = {
                ...updatedSession,
                messages: errMessages
            };
            setCurrentSession(errSession);
            await ChatStore.saveSession(app, errSession);
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
        executeQuery(queryText, currentSession.messages);
    };

    // Retry a user request at index
    const handleRetryUserMessage = (msgIdx: number) => {
        if (loading) return;
        const targetMsg = currentSession.messages[msgIdx];
        if (targetMsg && targetMsg.role === "user" && targetMsg.content) {
            const historyBefore = currentSession.messages.slice(0, msgIdx);
            executeQuery(targetMsg.content, historyBefore);
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
        executeQuery(editingText.trim(), historyBefore);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.type.startsWith("image/")) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (event.target?.result) {
                        setAttachedImages(prev => [...prev, String(event.target?.result)]);
                    }
                };
                reader.readAsDataURL(file);
            } else {
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (event.target?.result) {
                        setInput(prev => prev + `\n\n=== FILE: ${file.name} ===\n` + String(event.target?.result));
                    }
                };
                reader.readAsText(file);
            }
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '10px', boxSizing: 'border-box', position: 'relative' }}>
            {/* Header / Session & Mode Controls Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--background-modifier-border)', flexWrap: 'wrap', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button 
                        onClick={() => setShowSessionsDrawer(!showSessionsDrawer)}
                        title={t("historyTooltip", language)}
                        style={{ background: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <span>💬</span>
                        <span style={{ maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: '500' }}>
                            {formatSessionTitle(currentSession.title)}
                        </span>
                    </button>
                    <button 
                        onClick={handleNewChat}
                        title={t("newChatTooltip", language)}
                        style={{ background: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', fontSize: '11px', fontWeight: 'bold' }}
                    >
                        {t("newChat", language)}
                    </button>
                    <button 
                        onClick={handleToggleTabMode}
                        title={isMainTab ? t("moveSidebarTitle", language) : t("moveTabTitle", language)}
                        style={{ background: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)', borderRadius: '4px', cursor: 'pointer', padding: '4px 6px', fontSize: '11px' }}
                    >
                        {isMainTab ? t("moveSidebar", language) : t("moveTab", language)}
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <select
                        value={executionMode}
                        onChange={(e) => {
                            const val = e.target.value as ExecutionMode;
                            setExecutionMode(val);
                            saveSettings({ ...settings, executionMode: val });
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
                <div style={{ position: 'absolute', top: '45px', left: '10px', right: '10px', zIndex: 10, background: 'var(--background-primary)', border: '1px solid var(--background-modifier-border)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: '280px', overflowY: 'auto', padding: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid var(--background-modifier-border)' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '12px', color: 'var(--text-muted)' }}>{t("historyTitle", language)}</span>
                        {sessionsList.length > 0 && (
                            <button 
                                onClick={handleClearAllSessions}
                                title={t("clearChats", language)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-error, #ff5555)', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
                            >
                                {t("clearAll", language)}
                            </button>
                        )}
                    </div>
                    {sessionsList.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '6px' }}>{t("noSavedChats", language)}</div>
                    ) : (
                        sessionsList.map(s => (
                            <div 
                                key={s.id}
                                onClick={() => handleSelectSession(s.id)}
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
                                    onClick={(e) => handleDeleteSession(e, s.id)}
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
                <div style={{ background: 'var(--background-secondary)', padding: '12px', borderRadius: '8px', marginBottom: '12px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                                    saveSettings({ ...settings, visionModel: e.target.value });
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
                                    saveSettings({ ...settings, quickModel: e.target.value });
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
                                    saveSettings({ ...settings, language: langVal });
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
                    </div>

                    {/* Active Model Capabilities Card */}
                    <div style={{ background: 'var(--background-primary)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--background-modifier-border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <strong style={{ fontSize: '11px' }}>{t("parameters", language)}: {model}</strong>
                            <button 
                                onClick={() => verifyActiveModel(model, apiKey)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--interactive-accent)' }}
                            >
                                {t("checkApi", language)}
                            </button>
                        </div>

                        {verifyingModel ? (
                            <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{t("requestingCapabilities", language)}</div>
                        ) : activeModelDetails ? (
                            <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div style={{ color: activeModelDetails.supportsTools ? 'var(--text-success)' : 'var(--text-warning)', fontWeight: 'bold' }}>
                                    {activeModelDetails.supportsTools ? t("nativeToolCalling", language) : t("textToolCalling", language)}
                                </div>
                                <div style={{ color: activeModelDetails.supportsVision ? 'var(--text-success)' : 'var(--text-muted)' }}>
                                    {activeModelDetails.supportsVision ? t("visionSupported", language) : t("textOnlyInput", language)}
                                </div>
                                {activeModelDetails.contextLength && (
                                    <div>{t("contextWindow", language)} <strong>{activeModelDetails.contextLength.toLocaleString()} {t("tokens", language)}</strong></div>
                                )}
                            </div>
                        ) : (
                            <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{t("pressCheckApi", language)}</div>
                        )}
                    </div>

                    {/* User Custom Models List */}
                    <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>{t("yourSavedModels", language)}</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '100px', overflowY: 'auto', marginBottom: '6px' }}>
                            {customModels.map(m => (
                                <div 
                                    key={m}
                                    onClick={() => handleSelectModel(m)}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        background: m === model ? 'var(--interactive-accent)' : 'var(--background-primary)',
                                        color: m === model ? 'var(--text-on-accent)' : 'var(--text-normal)',
                                        cursor: 'pointer',
                                        fontSize: '11px'
                                    }}
                                >
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {m === model ? `✓ ${m}` : m}
                                    </span>
                                    <button
                                        onClick={(e) => handleDeleteModel(e, m)}
                                        title={t("deleteFromList", language)}
                                        style={{ background: 'transparent', border: 'none', color: m === model ? 'var(--text-on-accent)' : 'var(--text-muted)', cursor: 'pointer' }}
                                    >
                                        🗑️
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

                    <button 
                        onClick={handleSaveConfig}
                        style={{ marginTop: '4px', padding: '6px 12px', background: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        {t("saveSettings", language)}
                    </button>
                </div>
            )}

            {/* Chat Messages Container */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '10px' }}>
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
                                        rows={3}
                                        style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-primary)', color: 'var(--text-normal)', fontSize: '12px', resize: 'vertical' }}
                                    />
                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                        <button
                                            onClick={() => setEditingMsgIdx(null)}
                                            style={{ padding: '2px 8px', fontSize: '11px', background: 'transparent', border: '1px solid var(--text-on-accent)', color: 'var(--text-on-accent)', borderRadius: '4px', cursor: 'pointer' }}
                                        >
                                            {t("cancel", language)}
                                        </button>
                                        <button
                                            onClick={() => handleSaveEdit(idx)}
                                            disabled={loading}
                                            style={{ padding: '2px 8px', fontSize: '11px', background: 'var(--background-primary)', color: 'var(--text-normal)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                                        >
                                            {t("saveSend", language)}
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
                                            onClick={() => handleCopyText(msg.content || "")}
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
                                        onClick={() => handleCopyText(msg.content || "")}
                                        style={{ background: 'var(--background-primary)', border: '1px solid var(--background-modifier-border)', borderRadius: '4px', cursor: 'pointer', padding: '3px 8px', color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap', maxWidth: '100%' }}
                                    >
                                        {t("copyText", language)}
                                    </button>
                                    {msg.content && msg.content.length > 50 && (
                                        <button 
                                            onClick={() => handleSaveResponseAsNote(msg.content || "")}
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

                {/* Safe Mode Confirmation Prompt */}
                {pendingConfirmation && (
                    <div style={{ background: 'var(--background-secondary-alt)', border: '2px solid var(--interactive-accent)', borderRadius: '8px', padding: '10px', fontSize: '12px' }}>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-warning, #ffaa00)', marginBottom: '4px' }}>
                            {t("confirmTitle", language)}
                        </div>
                        <div>{t("confirmDetail", language)}</div>
                        <div style={{ fontFamily: 'monospace', background: 'var(--background-primary)', padding: '4px 6px', borderRadius: '4px', margin: '6px 0', wordBreak: 'break-all' }}>
                            {pendingConfirmation.toolName}({pendingConfirmation.argsStr})
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                            <button
                                onClick={() => pendingConfirmation.resolve(false)}
                                style={{ padding: '4px 10px', fontSize: '11px', background: 'var(--background-primary)', border: '1px solid var(--background-modifier-border)', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                {t("deny", language)}
                            </button>
                            <button
                                onClick={() => pendingConfirmation.resolve(true)}
                                style={{ padding: '4px 10px', fontSize: '11px', background: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                {t("allow", language)}
                            </button>
                        </div>
                    </div>
                )}

                {/* Active Agent Steps Execution Badges */}
                {loading && (
                    <div style={{ background: 'var(--background-secondary)', padding: '10px', borderRadius: '8px', fontSize: '12px', borderLeft: '3px solid var(--interactive-accent)' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>⚡</span>
                            <span>{t("agentRunning", language)}</span>
                        </div>
                        {activeSteps.map(step => (
                            <div key={step.id} style={{ marginTop: '4px', color: step.status === 'failed' ? 'var(--text-error)' : 'var(--text-muted)' }}>
                                <span>{step.status === 'running' ? '⏳' : step.status === 'completed' ? '✅' : '❌'} </span>
                                <strong>{step.title}</strong>
                                {step.detail && <div style={{ fontSize: '11px', opacity: 0.8, marginLeft: '16px', whiteSpace: 'pre-wrap' }}>{step.detail.substring(0, 300)}</div>}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Input Form with Attachment Preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {attachedImages.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {attachedImages.map((img, i) => (
                            <div key={i} style={{ position: 'relative', width: '44px', height: '44px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--background-modifier-border)' }}>
                                <img src={img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                <button
                                    onClick={() => setAttachedImages(prev => prev.filter((_, idx) => idx !== i))}
                                    style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '9px', padding: '1px 3px' }}
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                )}

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
                            e.target.style.height = 'auto';
                            e.target.style.height = `${Math.min(e.target.scrollHeight, 280)}px`;
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
