export type SupportedLanguage = 'auto' | 'ru' | 'en' | 'es' | 'de' | 'fr' | 'zh' | 'ja' | 'pt' | 'ko';

export interface Translations {
    welcomeGreeting: string;
    welcomeSubText: string;
    featureNotes: string;
    featureRouting: string;
    featureVision: string;
    featureTokens: string;
    inputPlaceholder: string;
    attachTooltip: string;
    quickMode: string;
    agentMode: string;
    ragToggle: string;
    settingsTitle: string;
    providerLabel: string;
    endpointLabel: string;
    apiKeyLabel: string;
    modelLabel: string;
    customModelsLabel: string;
    languageLabel: string;
    defaultNoteFolderLabel: string;
    defaultNoteFolderPlaceholder: string;
    saveSettings: string;
    checkApi: string;
    checkingApi: string;
    apiCheckSuccess: string;
    apiCheckFailed: string;
    newChat: string;
    newChatSession: string;
    clearChats: string;
    confirmClearChats: string;
    saveNote: string;
    copyText: string;
    copied: string;
    agentRunning: string;
    confirmAction: string;
    allow: string;
    deny: string;
    autoDetect: string;
    historyTitle: string;
    clearAll: string;
    noSavedChats: string;
    moveSidebar: string;
    moveTab: string;
    moveSidebarTitle: string;
    moveTabTitle: string;
    modelCategories: string;
    primaryModel: string;
    visionModel: string;
    quickModel: string;
    parameters: string;
    requestingCapabilities: string;
    nativeToolCalling: string;
    textToolCalling: string;
    visionSupported: string;
    textOnlyInput: string;
    contextWindow: string;
    tokens: string;
    pressCheckApi: string;
    yourSavedModels: string;
    addModelPlaceholder: string;
    addBtn: string;
    deleteFromList: string;
    keyUsage: string;
    modeAutoTitle: string;
    modeAuto: string;
    modeQuick: string;
    modeAgent: string;
    settingsTooltip: string;
    newChatTooltip: string;
    historyTooltip: string;
    deleteChatTooltip: string;
    noteCreatedSuccess: string;
    noteCreateError: string;
    copyError: string;
    modelAddedNotice: string;
    cannotDeleteLastModel: string;
    historyClearedNotice: string;
    modeSwitchError: string;
    agentError: string;
    cancel: string;
    saveSend: string;
    editText: string;
    retry: string;
    inputTokens: string;
    outputTokens: string;
    confirmTitle: string;
    confirmDetail: string;
    contextLength: string;
    toolCallingSupport: string;
    visionSupport: string;
    infoUnavailable: string;
    modelsList: string;
    deleteModelTooltip: string;
    cancelBtn: string;
    saveResendBtn: string;
    agentReasoningLog: string;
    actionConfirmation: string;
    agentWantsExecute: string;
    allowBtn: string;

    // Agent & Router Keys
    folderPrefetchTitle: string;
    folderPrefetchDetail: string;
    autoIndexedVaultNotes: string;
    autoCreatedNote: string;
    quickLlmError: string;
    agentNoOutput: string;
    systemPromptRu: string;
    systemPromptEn: string;

    intentAttachmentsReason: string;
    intentVaultActionReason: string;
    intentQuickReason: string;
    intentLongQueryReason: string;
    intentDefaultQuickReason: string;
    intentDeletionReason: string;
    intentCreationReason: string;
    intentAnalysisReason: string;
    intentSearchReason: string;
    intentModifyReason: string;
    intentHistoryReason: string;
    intentStaleReason: string;
    intentConfidenceHigh: string;
    intentConfidenceLow: string;
    freshnessSuggestion: string;
    ragPrefetchTitle: string;
    ragPrefetchDetail: string;

    // Settings UI keys
    chatsFolderLabel: string;
    memoryFileLabel: string;
    skillsFolderLabel: string;
    maxAgentIterationsLabel: string;
    maxPrefetchedNotesLabel: string;
    prefetchSnippetLengthLabel: string;
    ragResultLimitLabel: string;
    ragSnippetLengthLabel: string;
    confirmObsidianCommandsLabel: string;
    enableTemporalAwarenessLabel: string;
    enableAdaptivePrefetchLabel: string;
    enableFreshnessSuggestionsLabel: string;
    enableSmartToolFilteringLabel: string;
    intentStaleQueryWeightLabel: string;
    intentFreshnessWeightLabel: string;
}

const baseEn: Translations = {
    welcomeGreeting: "👋 NEI Assistant greets you. Awaiting instructions",
    welcomeSubText: "Your intelligent super-agent ready to assist with your knowledge base:",
    featureNotes: "Direct access to notes, folders, and vault linkages",
    featureRouting: "Quick and Agent modes with automatic tool routing",
    featureVision: "Analysis of images, documents, and web pages",
    featureTokens: "Full support for RAG, memory, and external MCP servers",
    inputPlaceholder: "Ask a question or describe a task... (Enter to send, Shift+Enter for newline)",
    attachTooltip: "Attach image or text file (.txt, .md, .js, .ts, .json)",
    quickMode: "⚡ Quick",
    agentMode: "🤖 Agent",
    ragToggle: "🧠 RAG Knowledge Vault",
    settingsTitle: "⚙️ NEI AI Chat Settings",
    providerLabel: "AI Provider:",
    endpointLabel: "Endpoint URL:",
    apiKeyLabel: "API Key:",
    modelLabel: "Model:",
    customModelsLabel: "Custom Models List (one per line):",
    languageLabel: "Interface Language:",
    defaultNoteFolderLabel: "Default folder for saved chat notes:",
    defaultNoteFolderPlaceholder: "e.g., AI-Notes (leave blank for Vault root)",
    saveSettings: "Save Settings",
    checkApi: "🔄 Check API & Models",
    checkingApi: "⏳ Checking connection...",
    apiCheckSuccess: "✅ API connected successfully!",
    apiCheckFailed: "❌ API Connection Failed",
    newChat: "➕ New",
    newChatSession: "New Chat",
    clearChats: "🗑️ Clear All Chats",
    confirmClearChats: "Are you sure you want to delete all chat history?",
    saveNote: "📄 Save as Note",
    copyText: "📋 Copy",
    copied: "✅ Copied to clipboard!",
    agentRunning: "⚡ Agent executing task...",
    confirmAction: "Action Confirmation Required:",
    allow: "✅ Allow",
    deny: "❌ Deny",
    autoDetect: "Auto-detect (Obsidian)",
    historyTitle: "Chat History",
    clearAll: "🗑️ Clear All",
    noSavedChats: "No saved chats",
    moveSidebar: "↙️ To Sidebar",
    moveTab: "↗️ To Tab",
    moveSidebarTitle: "Move chat to right sidebar",
    moveTabTitle: "Move chat to main editor tab",
    modelCategories: "Model Categories (Multimodality):",
    primaryModel: "1. Text & Tools (Primary):",
    visionModel: "2. Files & Vision:",
    quickModel: "3. Quick Mode Router:",
    parameters: "Parameters",
    requestingCapabilities: "Fetching capabilities via OpenRouter API...",
    nativeToolCalling: "🟢 Native Tool Calling supported",
    textToolCalling: "🟡 Text fallback tool calling mode",
    visionSupported: "🖼️ Image/vision analysis supported",
    textOnlyInput: "📝 Text input only",
    contextWindow: "Context window:",
    tokens: "tokens",
    pressCheckApi: 'Click "Check API" to retrieve parameters from OpenRouter',
    yourSavedModels: "Your saved models:",
    addModelPlaceholder: "e.g., anthropic/claude-3.5-sonnet",
    addBtn: "+ Add",
    deleteFromList: "Delete from list",
    keyUsage: "Used on API key:",
    modeAutoTitle: "AI Mode: Auto (smart routing), Quick (direct chat), Agent (multi-step reasoning)",
    modeAuto: "⚡ Auto (Smart)",
    modeQuick: "🚀 Quick (Direct)",
    modeAgent: "🧠 Agent (Multi-step)",
    settingsTooltip: "Model & API Settings",
    newChatTooltip: "New Chat",
    historyTooltip: "Chat History",
    deleteChatTooltip: "Delete Chat",
    noteCreatedSuccess: "Success: Created note",
    noteCreateError: "Error creating note:",
    copyError: "Failed to copy text.",
    modelAddedNotice: "Added model:",
    cannotDeleteLastModel: "Cannot delete the last model!",
    historyClearedNotice: "Chat history cleared!",
    modeSwitchError: "Mode switch error:",
    agentError: "❌ Agent execution error:",
    cancel: "Cancel",
    saveSend: "💾 Send",
    editText: "✏️ Edit",
    retry: "🔄 Retry",
    inputTokens: "📥 In:",
    outputTokens: "📤 Out:",
    confirmTitle: "⚠️ Action Confirmation Required",
    confirmDetail: "Agent requests tool execution:",
    contextLength: "Context Window:",
    toolCallingSupport: "Tool Calling Support:",
    visionSupport: "Vision Support:",
    infoUnavailable: "Click 'Check API' to retrieve details",
    modelsList: "Custom Models List",
    deleteModelTooltip: "Delete model from list",
    cancelBtn: "Cancel",
    saveResendBtn: "Save & Resend",
    agentReasoningLog: "Agent Reasoning Log",
    actionConfirmation: "Action Confirmation Required",
    agentWantsExecute: "Agent requests tool execution",
    allowBtn: "Allow",

    folderPrefetchTitle: "Injected folder notes: {folders}",
    folderPrefetchDetail: "Folders: {count}",
    autoIndexedVaultNotes: "--- AUTOMATISCH INDEXED VAULT NOTES ---",
    autoCreatedNote: "Automatically created note: {path}",
    quickLlmError: "Quick LLM call error: {error}",
    agentNoOutput: "Agent completed without text output.",
    systemPromptRu: "Ты — агентный ИИ-помощник NEI в Obsidian.\nТвоя цель: помогать пользователю работать с хранилищем заметок Vault и отвечать на его вопросы.\n\nПРАВИЛА ИСПОЛЬЗОВАНИЯ ИНСТРУМЕНТОВ:\n1. Если пользователь просит \"создай заметку\", \"создай папку\" или \"сохрани\" — ОБЯЗАТЕЛЬНО вызови инструмент `create_note(path, content)`.\n2. Для чтения заметок используй `read_note` или `get_folder_notes`.\n3. Инструмент `create_note` автоматически создаёт все вложенные папки.\n\nОТВЕТ: GitHub Flavored Markdown.",
    systemPromptEn: "You are NEI — an agentic AI assistant integrated into Obsidian.\nYour goal: help the user work with their Vault (notes, folders) and answer questions.\n\nTOOL USAGE RULES:\n1. If the user asks to \"create a note\", \"create a folder\", or \"save\" — you MUST call the `create_note(path, content)` tool.\n2. To read notes, use `read_note` or `get_folder_notes`.\n3. The `create_note` tool automatically creates nested folders.\n\nRESPONSE FORMAT: GitHub Flavored Markdown.",

    intentAttachmentsReason: "Attached files/images for analysis",
    intentVaultActionReason: "Detected vault/notes action request ({keyword})",
    intentQuickReason: "Direct Q&A (no vault interaction)",
    intentLongQueryReason: "Extended query requires agent mode",
    intentDefaultQuickReason: "Simple chat without vault reference",
    intentDeletionReason: "Deletion request detected",
    intentCreationReason: "Note/folder creation pattern detected",
    intentAnalysisReason: "Vault analysis/comparison pattern detected",
    intentSearchReason: "Search/lookup pattern detected",
    intentModifyReason: "Vault modification pattern detected",
    intentHistoryReason: "Continued agent workflow from chat history",
    intentStaleReason: "Time-sensitive query (web search required)",
    intentConfidenceHigh: "High confidence decision",
    intentConfidenceLow: "Low confidence decision",
    freshnessSuggestion: "This query may require up-to-date information (model knowledge cutoff: {cutoff}). Enable web search?",
    ragPrefetchTitle: "Indexed notes via RAG: {count}",
    ragPrefetchDetail: "Relevant notes found: {count}",

    chatsFolderLabel: "Chats folder path:",
    memoryFileLabel: "Memory file path:",
    skillsFolderLabel: "Agent skills folder path:",
    maxAgentIterationsLabel: "Max agent iterations:",
    maxPrefetchedNotesLabel: "Max prefetched notes:",
    prefetchSnippetLengthLabel: "Prefetch snippet length:",
    ragResultLimitLabel: "RAG result limit:",
    ragSnippetLengthLabel: "RAG snippet length:",
    confirmObsidianCommandsLabel: "Require confirmation for Obsidian commands:",
    enableTemporalAwarenessLabel: "Enable temporal awareness (cutoff dates, freshness directives):",
    enableAdaptivePrefetchLabel: "Adaptive prefetch (RAG vault notes only when vault is needed):",
    enableFreshnessSuggestionsLabel: "Suggest web search for time-sensitive queries in Quick mode:",
    enableSmartToolFilteringLabel: "Smart tool filtering (pass only relevant category tools):",
    intentStaleQueryWeightLabel: "Stale query routing weight:",
    intentFreshnessWeightLabel: "Freshness marker routing weight:"
};

const baseRu: Translations = {
    ...baseEn,
    welcomeGreeting: "👋 Помощник NEI вас приветствует. Ожидаю указаний",
    welcomeSubText: "Интеллектуальный суперагент готовит персональные решения для вашей базы знаний:",
    featureNotes: "Прямой доступ к заметкам, папкам и связям Vault",
    featureRouting: "Режимы Quick и Agent с автоматическим подбором инструментов",
    featureVision: "Анализ изображений, документов и веб-страниц",
    featureTokens: "Полная поддержка RAG, памяти и внешних MCP серверов",
    inputPlaceholder: "Задайте вопрос или опишите задачу... (Enter — отправить, Shift+Enter — перенос)",
    attachTooltip: "Прикрепить изображение или файл (.txt, .md, .js, .ts, .json)",
    quickMode: "⚡ Быстрый",
    agentMode: "🤖 Агент",
    ragToggle: "🧠 RAG База знаний",
    settingsTitle: "⚙️ Настройки NEI AI Chat",
    providerLabel: "Провайдер ИИ:",
    endpointLabel: "URL эндпоинта:",
    apiKeyLabel: "API Ключ:",
    modelLabel: "Модель:",
    customModelsLabel: "Список моделей (по одной на строку):",
    languageLabel: "Язык интерфейса:",
    defaultNoteFolderLabel: "Папка для сохранения заметок из чата:",
    defaultNoteFolderPlaceholder: "Например: AI-Notes (оставьте пустым для корня Ваулта)",
    saveSettings: "Сохранить Настройки",
    checkApi: "🔄 Проверить API и Модели",
    checkingApi: "⏳ Проверка связи...",
    apiCheckSuccess: "✅ API подключен успешно!",
    apiCheckFailed: "❌ Ошибка подключения к API",
    newChat: "➕ Новый",
    newChatSession: "Новый диалог",
    clearChats: "🗑️ Очистить все диалоги",
    confirmClearChats: "Вы действительно хотите удалить всю историю чатов?",
    saveNote: "📄 Сохранить как заметку",
    copyText: "📋 Копировать",
    copied: "✅ Скопировано в буфер обмена!",
    agentRunning: "⚡ Агент выполняет задачу...",
    confirmAction: "Запрос подтверждения:",
    allow: "✅ Разрешить",
    deny: "❌ Отклонить",
    autoDetect: "Авто-определение (Obsidian)",
    historyTitle: "История диалогов",
    clearAll: "🗑️ Очистить все",
    noSavedChats: "Нет сохраненных чатов",
    moveSidebar: "↙️ В панель",
    moveTab: "↗️ Вкладка",
    moveSidebarTitle: "Переместить чат в боковую панель",
    moveTabTitle: "Переместить чат на главную вкладку",
    modelCategories: "Категории моделей (Мультимодальность):",
    primaryModel: "1. Текст и инструменты (Primary):",
    visionModel: "2. Файлы и фото (Vision):",
    quickModel: "3. Быстрый режим (Quick Mode Router):",
    parameters: "Параметры",
    requestingCapabilities: "Запрос возможностей через OpenRouter API...",
    nativeToolCalling: "🟢 Нативный Tool Calling поддерживается",
    textToolCalling: "🟡 Текстовый режим вызова инструментов",
    visionSupported: "🖼️ Анализ фото/изображений доступен",
    textOnlyInput: "📝 Только текстовый ввод",
    contextWindow: "Контекстное окно:",
    tokens: "токенов",
    pressCheckApi: 'Нажмите "Проверить API" для получения параметров с OpenRouter',
    yourSavedModels: "Ваши сохраненные модели:",
    addModelPlaceholder: "Например: anthropic/claude-3.5-sonnet",
    addBtn: "+ Добавить",
    deleteFromList: "Удалить из списка",
    keyUsage: "Использовано на ключе:",
    modeAutoTitle: "Режим ИИ: Авто (умный роутинг), Быстрый (без инструментов), Агент (многошаговый)",
    modeAuto: "⚡ Авто (Умный)",
    modeQuick: "🚀 Быстрый (Прямой)",
    modeAgent: "🧠 Агент (Многошаговый)",
    settingsTooltip: "Настройки моделей и API",
    newChatTooltip: "Новый чат",
    historyTooltip: "История диалогов",
    deleteChatTooltip: "Удалить чат",
    noteCreatedSuccess: "Успех: Создана заметка",
    noteCreateError: "Ошибка создания заметки:",
    copyError: "Не удалось скопировать текст.",
    modelAddedNotice: "Добавлена модель:",
    cannotDeleteLastModel: "Нельзя удалить последнюю модель из списка!",
    historyClearedNotice: "Вся история чатов очищена!",
    modeSwitchError: "Ошибка переключения режима:",
    agentError: "❌ Ошибка выполнения агента:",
    cancel: "Отмена",
    saveSend: "💾 Отправить",
    editText: "✏️ Изменить",
    retry: "🔄 Повторить",
    inputTokens: "📥 Вход:",
    outputTokens: "📤 Выход:",
    confirmTitle: "⚠️ Подтверждение действия",
    confirmDetail: "Агент запрашивает выполнение инструмента:",
    contextLength: "Контекстное окно:",
    toolCallingSupport: "Поддержка инструментов (Tools):",
    visionSupport: "Поддержка изображений (Vision):",
    infoUnavailable: "Нажмите 'Проверить API' для получения данных",
    modelsList: "Список сохраненных моделей",
    deleteModelTooltip: "Удалить модель из списка",
    cancelBtn: "Отмена",
    saveResendBtn: "Сохранить и отправить",
    agentReasoningLog: "Ход рассуждений агента",
    actionConfirmation: "Требуется подтверждение действия",
    agentWantsExecute: "Агент хочет выполнить инструмент",
    allowBtn: "Разрешить",

    folderPrefetchTitle: "Инъецированы заметки папок: {folders}",
    folderPrefetchDetail: "Папок: {count}",
    autoIndexedVaultNotes: "--- АВТОМАТИЧЕСКИ ИНДЕКСИРОВАННЫЕ ЗАМЕТКИ ВАУЛТА ---",
    autoCreatedNote: "Автоматически создана заметка: {path}",
    quickLlmError: "Ошибка вызова Quick LLM: {error}",
    agentNoOutput: "Агент завершил работу без текстового вывода.",

    intentAttachmentsReason: "Прикреплены файлы/изображения для анализа",
    intentVaultActionReason: "Обнаружен запрос работы с заметками/ваултом ({keyword})",
    intentQuickReason: "Прямой вопрос/ответ (без взаимодействия с хранилищем)",
    intentLongQueryReason: "Развернутый запрос требует агентного режима",
    intentDefaultQuickReason: "Простая беседа без обращения к ваулту",
    intentDeletionReason: "Обнаружен запрос на удаление заметок/файлов",
    intentCreationReason: "Обнаружен шаблон создания заметки/папки",
    intentAnalysisReason: "Обнаружен шаблон анализа/сравнения хранилища",
    intentSearchReason: "Обнаружен шаблон поиска по заметкам",
    intentModifyReason: "Обнаружен шаблон изменения или переименования",
    intentHistoryReason: "Продолжение агентного контекста из истории чата",
    intentStaleReason: "Временно-чувствительный запрос (требуется веб-поиск)",
    intentConfidenceHigh: "Высокая уверенность роутера",
    intentConfidenceLow: "Низкая уверенность роутера",
    freshnessSuggestion: "Этот запрос может требовать актуальных данных (модель знает до {cutoff}). Включить веб-поиск?",
    ragPrefetchTitle: "Индексировано заметок через RAG: {count}",
    ragPrefetchDetail: "Найдено релевантных: {count}",

    chatsFolderLabel: "Папка хранения чатов:",
    memoryFileLabel: "Файл долгосрочной памяти:",
    skillsFolderLabel: "Папка скиллов агента:",
    maxAgentIterationsLabel: "Макс. итераций агента:",
    maxPrefetchedNotesLabel: "Макс. префетч заметок:",
    prefetchSnippetLengthLabel: "Длина сниппета префетча:",
    ragResultLimitLabel: "Лимит RAG заметок:",
    ragSnippetLengthLabel: "Длина сниппета RAG:",
    confirmObsidianCommandsLabel: "Запрашивать подтверждение команд Obsidian:"
};

export const translations: Record<string, Translations> = {
    ru: baseRu,
    en: baseEn,
    es: { ...baseEn },
    de: { ...baseEn },
    fr: { ...baseEn },
    zh: { ...baseEn },
    ja: { ...baseEn },
    pt: { ...baseEn },
    ko: { ...baseEn }
};

export function detectLanguage(): SupportedLanguage {
    try {
        const obsLang = (window.localStorage.getItem("language") || navigator.language || "en").toLowerCase();
        if (obsLang.startsWith("ru")) return "ru";
        if (obsLang.startsWith("es")) return "es";
        if (obsLang.startsWith("de")) return "de";
        if (obsLang.startsWith("fr")) return "fr";
        if (obsLang.startsWith("zh")) return "zh";
        if (obsLang.startsWith("ja")) return "ja";
        if (obsLang.startsWith("pt")) return "pt";
        if (obsLang.startsWith("ko")) return "ko";
    } catch (e) {}
    return "en";
}

export function t(key: keyof Translations, lang?: SupportedLanguage, params?: Record<string, string | number>): string {
    const selectedLang = (!lang || lang === 'auto') ? detectLanguage() : lang;
    const dict = translations[selectedLang] || translations.en;
    let str = dict[key] || translations.en[key] || key;
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
    }
    return str;
}
