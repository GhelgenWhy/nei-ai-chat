import * as React from "react";
import { App, Component, MarkdownRenderer, Notice, WorkspaceLeaf } from "obsidian";
import { ChatMessage, getModelTemporalInfo } from "../services/llm";
import { AgentLoop, AgentStep } from "../services/agent/agentLoop";
import { ChatStore, ChatSession } from "../services/chat/chatStore";
import { OpenRouterService, OpenRouterModelInfo, OpenRouterKeyInfo, getDefaultModelCapabilities } from "../services/openrouter";
import { ExecutionMode } from "../services/agent/intentRouter";
import { t, SupportedLanguage } from "../i18n/translations";
import { NeiAiChatSettings } from "../../main";
import { ToolRegistry } from "../services/tools/toolRegistry";
import { ErrorBoundary } from "./ErrorBoundary";
import { Tooltip } from "./Tooltip";
import { WelcomeScreen } from "./WelcomeScreen";
import { ReasoningPanel } from "./ReasoningPanel";
import { ModelCapabilityBar } from "./ModelCapabilityBar";
import { AudioRecorder } from "./AudioRecorder";
import { CapabilityWarningModal } from "./CapabilityWarningModal";
import { formatTokenCount, formatCost, calculateCost, ModelPricing } from "../utils/cost";
import { AutoLearner, LearningProposal } from "../services/memory/autoLearner";
import { MemoryStore } from "../services/memory/memoryStore";

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
    const [attachedFiles, setAttachedFiles] = React.useState<AttachedFile[]>([]);
    const [isRecordingAudio, setIsRecordingAudio] = React.useState(false);
    const [warningModal, setWarningModal] = React.useState<{
        unsupportedTypes: string[];
        onProceedTextOnly: () => void;
        onRemoveAttachments: () => void;
    } | null>(null);

    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    const adjustTextareaHeight = React.useCallback(() => {
        if (!textareaRef.current) return;
        requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            el.style.height = 'auto';
            const newHeight = Math.min(el.scrollHeight, 280);
            el.style.height = `${newHeight}px`;
        });
    }, []);

    const [executionMode, setExecutionMode] = React.useState<ExecutionMode>(settings.executionMode || "auto");
    const [loading, setLoading] = React.useState(false);
    const [activeSteps, setActiveSteps] = React.useState<AgentStep[]>([]);
    const [showSessionsDrawer, setShowSessionsDrawer] = React.useState(false);
    const [showConfig, setShowConfig] = React.useState(false);
    const [pendingConfirmation, setPendingConfirmation] = React.useState<{ toolName: string; argsStr: string; resolve: (approved: boolean) => void } | null>(null);
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
    const clearTimerRef = React.useRef<number | null>(null);

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
            const newSettings = { ...settings, ...imported };
            await saveSettings(newSettings);
            new Notice(t("settingsImported", language));
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
            if (settings.enableAutoLearning && finalMessages.length >= 4) {
                void AutoLearner.extractAndPropose(
                    { provider: "openrouter", endpointUrl, apiKey, model: quickModel },
                    finalMessages
                ).then(proposal => {
                    if (proposal) {
                        setLearningProposal({
                            proposal,
                            onAccept: async () => {
                                const applied = await AutoLearner.applyProposal(app, settings, proposal);
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
        if ((!input.trim() && attachedFiles.length === 0) || loading) return;

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

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const maxSize = settings.maxAttachmentSizeBytes || 512000;

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
                reader.onload = (evt) => {
                    const content = (evt.target?.result as string) || '';
                    setAttachedFiles(prev => [...prev, { id, name, type: 'text', content, sizeBytes }]);
                };
                reader.readAsText(file);
            } else if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    const content = (evt.target?.result as string) || '';
                    setAttachedFiles(prev => [...prev, { id, name, type: 'image', content, sizeBytes }]);
                    setAttachedImages(prev => [...prev, content]);
                };
                reader.readAsDataURL(file);
            } else if (file.type.startsWith('audio/')) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    const content = (evt.target?.result as string) || '';
                    setAttachedFiles(prev => [...prev, { id, name, type: 'audio', content, sizeBytes }]);
                };
                reader.readAsDataURL(file);
            } else if (file.type.startsWith('video/')) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    const content = (evt.target?.result as string) || '';
                    setAttachedFiles(prev => [...prev, { id, name, type: 'video', content, sizeBytes }]);
                };
                reader.readAsDataURL(file);
            } else if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    const content = (evt.target?.result as string) || '';
                    setAttachedFiles(prev => [...prev, { id, name, type: 'pdf', content, sizeBytes }]);
                };
                reader.readAsText(file);
            } else {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    const content = (evt.target?.result as string) || '';
                    setAttachedFiles(prev => [...prev, { id, name, type: 'text', content, sizeBytes }]);
                };
                reader.readAsText(file);
            }
        }
    };

    return (
        <div className="nei-chat-panel-container">
            {/* Header / Session & Mode Controls Bar (UI-03) */}
            <div className="nei-chat-header">
                <div className="nei-header-group">
                    <select
                        value={model}
                        onChange={(e) => handleSelectModel(e.target.value)}
                        title={t("primaryModel", language)}
                        aria-label={t("primaryModel", language)}
                        className="nei-model-select"
                    >
                        {customModels.map(m => (
                            <option key={m} value={m}>
                                {m.split('/').pop()}
                            </option>
                        ))}
                    </select>

                    <button 
                        onClick={() => setShowSessionsDrawer(!showSessionsDrawer)}
                        title={t("historyTooltip", language)}
                        aria-label={t("historyTooltip", language)}
                        className="nei-header-btn"
                    >
                        📂 ({currentSession.messages.length})
                    </button>

                    <button 
                        onClick={() => handleNewChat()}
                        title={t("newChatTooltip", language)}
                        aria-label={t("newChatTooltip", language)}
                        className="nei-header-btn nei-btn-accent"
                    >
                        + {t("newChat", language)}
                    </button>
                </div>

                <div className="nei-header-group">
                    {/* Session Cost Metrics */}
                    {sessionMetrics.requestCount > 0 && (
                        <div className="nei-session-metrics" style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '2px 6px', borderRadius: '4px',
                            background: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)',
                            fontSize: '9px', fontFamily: 'monospace', fontWeight: 500, color: 'var(--text-muted)'
                        }}>
                            <span title={t("sessionCostTooltip", language)}>💰 {formatCost(sessionMetrics.totalCost)}</span>
                            <span style={{ opacity: 0.4 }}>|</span>
                            <span title={t("sessionTokensInTooltip", language)}>📥 {formatTokenCount(sessionMetrics.totalPromptTokens)}</span>
                            <span style={{ opacity: 0.4 }}>|</span>
                            <span title={t("sessionTokensOutTooltip", language)}>📤 {formatTokenCount(sessionMetrics.totalCompletionTokens)}</span>
                            <button
                                onClick={() => setSessionMetrics({ totalPromptTokens: 0, totalCompletionTokens: 0, totalCost: 0, requestCount: 0 })}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.5, fontSize: '9px', padding: '0 2px', color: 'var(--text-muted)' }}
                                title={t("resetSessionMetrics", language)}
                                aria-label={t("resetSessionMetrics", language)}
                            >↺</button>
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
                        aria-label={t("modeAutoTitle", language)}
                        className="nei-select-mode"
                    >
                        <option value="auto">{t("modeAuto", language)}</option>
                        <option value="quick">{t("modeQuick", language)}</option>
                        <option value="agent">{t("modeAgent", language)}</option>
                    </select>

                    <button 
                        onClick={() => void handleToggleTabMode()}
                        title={isMainTab ? t("moveSidebarTitle", language) : t("moveTabTitle", language)}
                        aria-label={isMainTab ? t("moveSidebarTitle", language) : t("moveTabTitle", language)}
                        className="nei-header-btn"
                    >
                        {isMainTab ? "🗔" : "🗖"}
                    </button>

                    <button 
                        onClick={() => setShowConfig(!showConfig)}
                        title={t("settingsTooltip", language)}
                        aria-label={t("settingsTooltip", language)}
                        className="nei-header-btn"
                    >
                        ⚙️
                    </button>
                </div>
            </div>

            {/* Pinned Sticky Model Capability & Token Bar (UI-04) */}
            <ModelCapabilityBar 
                modelName={model}
                modelDetails={activeModelDetails || getDefaultModelCapabilities(model)}
                totalTokens={sessionMetrics.totalPromptTokens + sessionMetrics.totalCompletionTokens}
                contextWindow={activeModelDetails?.contextLength}
            />

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
                <div style={{ flexShrink: 0, display: 'flex', gap: '6px', padding: '6px', background: 'var(--background-secondary)', borderRadius: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    {attachedFiles.map((file) => (
                        <div key={file.id} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--background-primary)', border: '1px solid var(--background-modifier-border)', borderRadius: '4px', padding: '3px 8px', fontSize: '11px' }}>
                            {file.type === 'image' && <img src={file.content} style={{ width: '20px', height: '20px', objectFit: 'cover', borderRadius: '2px' }} />}
                            {file.type === 'text' && <span>📄</span>}
                            {file.type === 'pdf' && <span>📕</span>}
                            {file.type === 'audio' && <span>🎤</span>}
                            {file.type === 'video' && <span>🎥</span>}
                            <span style={{ fontWeight: 500, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {file.name}
                            </span>
                            <span style={{ fontSize: '9px', opacity: 0.6 }}>({(file.sizeBytes / 1024).toFixed(0)}KB)</span>
                            <button 
                                onClick={() => {
                                    setAttachedFiles(prev => prev.filter(f => f.id !== file.id));
                                    if (file.type === 'image') {
                                        setAttachedImages(prev => prev.filter(img => img !== file.content));
                                    }
                                }}
                                style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', borderRadius: '50%', width: '14px', height: '14px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Audio Recording Active View */}
            {isRecordingAudio && (
                <div style={{ marginBottom: '6px' }}>
                    <AudioRecorder
                        onAudioCaptured={(audioDataUrl, durationSec) => {
                            const id = Math.random().toString(36).substring(2, 9);
                            const name = `audio_${durationSec}s.webm`;
                            setAttachedFiles(prev => [...prev, { id, name, type: 'audio', content: audioDataUrl, sizeBytes: Math.round(audioDataUrl.length * 0.75) }]);
                            setIsRecordingAudio(false);
                        }}
                        onCancel={() => setIsRecordingAudio(false)}
                    />
                </div>
            )}

            {/* Bottom Query Input Box */}
            <div className="nei-chat-input-container">
                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
                    <label 
                        title={t("attachTooltip", language)}
                        aria-label={t("attachTooltip", language)}
                        style={{ padding: '8px 10px', background: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', marginBottom: '2px' }}
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

                    {(activeModelDetails?.capabilities?.audio || getDefaultModelCapabilities(model).supportsAudio) && (
                        <button
                            onClick={() => setIsRecordingAudio(!isRecordingAudio)}
                            title="Record Audio Input"
                            aria-label="Record Audio Input"
                            style={{
                                padding: '8px 10px',
                                background: isRecordingAudio ? 'var(--text-error, #ff5555)' : 'var(--background-secondary)',
                                color: isRecordingAudio ? '#fff' : 'var(--text-normal)',
                                border: '1px solid var(--background-modifier-border)',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                marginBottom: '2px'
                            }}
                        >
                            🎤
                        </button>
                    )}

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
                        placeholder={t("inputPlaceholder", language)}
                        disabled={loading}
                        rows={3}
                        className="nei-chat-textarea"
                        style={{
                            flex: 1,
                            minHeight: '60px',
                            maxHeight: '280px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--background-modifier-border)',
                            background: 'var(--background-primary)',
                            color: 'var(--text-normal)',
                            resize: 'none',
                            fontSize: '13px',
                            lineHeight: '1.4',
                            fontFamily: 'inherit'
                        }}
                    />
                    <button
                        onClick={handleSendMessage}
                        disabled={loading || (!input.trim() && attachedFiles.length === 0)}
                        title="Send Message"
                        aria-label="Send Message"
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
