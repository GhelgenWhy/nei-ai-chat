import * as React from "react";
import { App, Component, MarkdownRenderer, Notice } from "obsidian";
import { ChatMessage } from "../services/llm";
import { AgentLoop, AgentStep } from "../services/agent/agentLoop";
import { ChatStore, ChatSession } from "../services/chat/chatStore";
import { OpenRouterService, OpenRouterModelInfo } from "../services/openrouter";

interface ChatPanelProps {
    app: App;
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

export const ChatPanel: React.FC<ChatPanelProps> = ({ app, settings, saveSettings }) => {
    // Active Session State
    const [currentSession, setCurrentSession] = React.useState<ChatSession>(() => ChatStore.createNewSession());
    const [sessionsList, setSessionsList] = React.useState<{ id: string; title: string; updatedAt: string }[]>([]);
    
    // UI State
    const [input, setInput] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [activeSteps, setActiveSteps] = React.useState<AgentStep[]>([]);
    const [showSessionsDrawer, setShowSessionsDrawer] = React.useState(false);
    const [showConfig, setShowConfig] = React.useState(false);

    // Edit message inline state
    const [editingMsgIdx, setEditingMsgIdx] = React.useState<number | null>(null);
    const [editingText, setEditingText] = React.useState("");

    // Local Config State
    const [endpointUrl, setEndpointUrl] = React.useState(settings.endpointUrl || "https://openrouter.ai/api/v1");
    const [apiKey, setApiKey] = React.useState(settings.apiKey || "");
    const [model, setModel] = React.useState(settings.model || "google/gemini-2.5-flash");
    const [customModels, setCustomModels] = React.useState<string[]>(settings.customModels || [
        "google/gemini-2.5-flash",
        "anthropic/claude-3.5-sonnet",
        "google/gemini-2.5-pro",
        "openai/gpt-4o",
        "deepseek/deepseek-chat"
    ]);
    const [newModelInput, setNewModelInput] = React.useState("");
    const [activeModelDetails, setActiveModelDetails] = React.useState<OpenRouterModelInfo | null>(null);
    const [verifyingModel, setVerifyingModel] = React.useState(false);

    React.useEffect(() => {
        refreshSessionsList();
        verifyActiveModel(model, apiKey);
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

    const handleSelectModel = (selectedModel: string) => {
        setModel(selectedModel);
        verifyActiveModel(selectedModel, apiKey);
    };

    const handleAddModel = () => {
        if (!newModelInput.trim()) return;
        const trimmed = newModelInput.trim();
        if (!customModels.includes(trimmed)) {
            const updated = [...customModels, trimmed];
            setCustomModels(updated);
            setModel(trimmed);
            verifyActiveModel(trimmed, apiKey);
            new Notice(`Добавлена модель: ${trimmed}`);
        }
        setNewModelInput("");
    };

    const handleDeleteModel = (e: React.MouseEvent, targetModel: string) => {
        e.stopPropagation();
        if (customModels.length <= 1) {
            new Notice("Нельзя удалить последнюю модель из списка!");
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

    const handleSaveConfig = async () => {
        const newSettings = {
            ...settings,
            provider: "openrouter",
            endpointUrl,
            apiKey,
            model,
            customModels
        };
        await saveSettings(newSettings);
        setShowConfig(false);
        new Notice("Настройки моделей NEI Agent сохранены!");
    };

    const handleCopyText = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            new Notice("Скопировано в буфер обмена!");
        } catch (e) {
            new Notice("Не удалось скопировать текст.");
        }
    };

    const handleSaveResponseAsNote = async (content: string) => {
        const notePath = `Tasks/Сводка_${Date.now()}.md`;
        try {
            await app.vault.create(notePath, content);
            new Notice(`Успех: Создана заметка '${notePath}'!`);
        } catch (e: any) {
            new Notice(`Ошибка создания заметки: ${e?.message || e}`);
        }
    };

    // Execute agent loop for a query and history slice
    const executeQuery = async (queryText: string, historySlice: ChatMessage[]) => {
        setLoading(true);
        setActiveSteps([]);
        setEditingMsgIdx(null);

        const userMsg: ChatMessage = { role: "user", content: queryText };
        const updatedMessages = [...historySlice, userMsg];
        
        const updatedSession: ChatSession = {
            ...currentSession,
            title: currentSession.messages.length === 0 
                ? (queryText.length > 25 ? queryText.substring(0, 25) + "..." : queryText)
                : currentSession.title,
            messages: updatedMessages
        };

        setCurrentSession(updatedSession);

        try {
            const llmConfig = {
                provider: "openrouter" as const,
                endpointUrl: endpointUrl || "https://openrouter.ai/api/v1",
                apiKey,
                model: model || "google/gemini-2.5-flash"
            };

            const responseText = await AgentLoop.run({
                app,
                config: llmConfig,
                userQuery: queryText,
                chatHistory: historySlice,
                onStepUpdate: (steps) => {
                    setActiveSteps(steps);
                }
            });

            const finalMessages: ChatMessage[] = [...updatedMessages, { role: "assistant", content: responseText }];
            const finalSession: ChatSession = {
                ...updatedSession,
                messages: finalMessages
            };

            setCurrentSession(finalSession);
            await ChatStore.saveSession(app, finalSession);
            await refreshSessionsList();
        } catch (e: any) {
            console.error("[NEI Agent Error]", e);
            const errMessages: ChatMessage[] = [...updatedMessages, { role: "assistant", content: `❌ Ошибка выполнения агента: ${e?.message || e}` }];
            const errSession: ChatSession = {
                ...updatedSession,
                messages: errMessages
            };
            setCurrentSession(errSession);
            await ChatStore.saveSession(app, errSession);
        } finally {
            setLoading(false);
            setActiveSteps([]);
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '10px', boxSizing: 'border-box', position: 'relative' }}>
            {/* Header / Session Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--background-modifier-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button 
                        onClick={() => setShowSessionsDrawer(!showSessionsDrawer)}
                        title="История диалогов"
                        style={{ background: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <span>💬</span>
                        <span style={{ maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: '500' }}>
                            {currentSession.title}
                        </span>
                    </button>
                    <button 
                        onClick={handleNewChat}
                        title="Новый чат"
                        style={{ background: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', fontSize: '12px', fontWeight: 'bold' }}
                    >
                        + Новый
                    </button>
                </div>
                <button 
                    onClick={() => setShowConfig(!showConfig)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--text-muted)' }}
                    title="Настройки моделей"
                >
                    ⚙️ Настройки
                </button>
            </div>

            {/* Sessions History Drawer */}
            {showSessionsDrawer && (
                <div style={{ position: 'absolute', top: '45px', left: '10px', right: '10px', zIndex: 10, background: 'var(--background-primary)', border: '1px solid var(--background-modifier-border)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: '250px', overflowY: 'auto', padding: '8px' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '6px', color: 'var(--text-muted)', paddingBottom: '4px', borderBottom: '1px solid var(--background-modifier-border)' }}>
                        История диалогов
                    </div>
                    {sessionsList.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '6px' }}>Нет сохраненных чатов</div>
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
                                    {s.title}
                                </span>
                                <button 
                                    onClick={(e) => handleDeleteSession(e, s.id)}
                                    title="Удалить чат"
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

                    {/* Active Model Capabilities Card */}
                    <div style={{ background: 'var(--background-primary)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--background-modifier-border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <strong style={{ fontSize: '12px' }}>Активная модель: {model}</strong>
                            <button 
                                onClick={() => verifyActiveModel(model, apiKey)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--interactive-accent)' }}
                            >
                                🔄 Проверить API
                            </button>
                        </div>

                        {verifyingModel ? (
                            <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Запрос возможностей через OpenRouter API...</div>
                        ) : activeModelDetails ? (
                            <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div style={{ color: activeModelDetails.supportsTools ? 'var(--text-success)' : 'var(--text-warning)', fontWeight: 'bold' }}>
                                    {activeModelDetails.supportsTools ? '🟢 Нативный Tool Calling поддерживается' : '🟡 Текстовый режим вызова инструментов (JSON Fallback)'}
                                </div>
                                {activeModelDetails.contextLength && (
                                    <div>Контекстное окно: <strong>{activeModelDetails.contextLength.toLocaleString()} токенов</strong></div>
                                )}
                            </div>
                        ) : (
                            <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Нажмите "Проверить API" для получения параметров с OpenRouter</div>
                        )}
                    </div>

                    {/* User Custom Models List */}
                    <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Ваши сохраненные модели:</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflowY: 'auto', marginBottom: '6px' }}>
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
                                        title="Удалить из списка"
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
                                placeholder="Например: anthropic/claude-3.5-sonnet"
                                style={{ flex: 1, padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-primary)', color: 'var(--text-normal)' }}
                            />
                            <button
                                onClick={handleAddModel}
                                style={{ padding: '4px 8px', fontSize: '11px', background: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                + Добавить
                            </button>
                        </div>
                    </div>

                    <button 
                        onClick={handleSaveConfig}
                        style={{ marginTop: '4px', padding: '6px 12px', background: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        Сохранить Настройки
                    </button>
                </div>
            )}

            {/* Chat Messages Container */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '10px' }}>
                {currentSession.messages.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '30px', fontSize: '13px' }}>
                        👋 **NEI Super-Agent** готов к работе!<br/><br/>
                        • Прямой доступ к заметочникам и папкам (`tasks`, `Projects`)<br/>
                        • Редактирование, переотправка и копирование сообщений<br/>
                        • Проверка возможностей выбранной модели через OpenRouter API
                    </div>
                )}

                {currentSession.messages.map((msg, idx) => (
                    <div 
                        key={idx} 
                        style={{
                            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            maxWidth: '88%',
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
                                            Отмена
                                        </button>
                                        <button
                                            onClick={() => handleSaveEdit(idx)}
                                            disabled={loading}
                                            style={{ padding: '2px 8px', fontSize: '11px', background: 'var(--background-primary)', color: 'var(--text-normal)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                                        >
                                            💾 Отправить
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* Standard User Message Display */
                                <div>
                                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px', justifyContent: 'flex-end', fontSize: '11px', opacity: 0.85 }}>
                                        <button
                                            onClick={() => handleCopyText(msg.content || "")}
                                            title="Скопировать текст"
                                            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
                                        >
                                            📋 Копировать
                                        </button>
                                        <button
                                            onClick={() => handleStartEdit(idx, msg.content || "")}
                                            title="Редактировать запрос"
                                            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
                                        >
                                            ✏️ Изменить
                                        </button>
                                        <button
                                            onClick={() => handleRetryUserMessage(idx)}
                                            title="Повторить отправку"
                                            disabled={loading}
                                            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
                                        >
                                            🔄 Повторить
                                        </button>
                                    </div>
                                </div>
                            )
                        ) : (
                            /* Assistant Message Display */
                            <div>
                                <ObsidianMarkdown markdown={msg.content || ""} app={app} />
                                <div style={{ display: 'flex', gap: '10px', marginTop: '8px', alignItems: 'center', fontSize: '11px' }}>
                                    <button 
                                        onClick={() => handleCopyText(msg.content || "")}
                                        style={{ background: 'var(--background-primary)', border: '1px solid var(--background-modifier-border)', borderRadius: '4px', cursor: 'pointer', padding: '3px 8px', color: 'var(--text-muted)' }}
                                    >
                                        📋 Скопировать
                                    </button>
                                    {msg.content && msg.content.length > 50 && (
                                        <button 
                                            onClick={() => handleSaveResponseAsNote(msg.content || "")}
                                            style={{ background: 'var(--background-primary)', border: '1px solid var(--background-modifier-border)', borderRadius: '4px', cursor: 'pointer', padding: '3px 8px', color: 'var(--text-muted)' }}
                                        >
                                            📄 Сохранить как заметку
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {/* Active Agent Steps Execution Badges */}
                {loading && (
                    <div style={{ background: 'var(--background-secondary)', padding: '10px', borderRadius: '8px', fontSize: '12px', borderLeft: '3px solid var(--interactive-accent)' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>⚡</span>
                            <span>Агент выполняет задачу...</span>
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

            {/* Input Form */}
            <div style={{ display: 'flex', gap: '8px' }}>
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                        }
                    }}
                    placeholder="Задайте задачу агенту... (Enter для отправки)"
                    disabled={loading}
                    rows={2}
                    style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--background-modifier-border)', background: 'var(--background-primary)', color: 'var(--text-normal)', resize: 'none', fontSize: '13px' }}
                />
                <button
                    onClick={handleSendMessage}
                    disabled={loading || !input.trim()}
                    style={{ padding: '0 16px', background: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
                >
                    {loading ? '...' : 'Отправить'}
                </button>
            </div>
        </div>
    );
};
