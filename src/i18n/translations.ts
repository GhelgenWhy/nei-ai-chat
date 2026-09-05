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
    stoppedByUser: string;
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
    enableTemporalAwarenessDesc: string;
    enableAdaptivePrefetchLabel: string;
    enableAdaptivePrefetchDesc: string;
    enableFreshnessSuggestionsLabel: string;
    enableFreshnessSuggestionsDesc: string;
    enableSmartToolFilteringLabel: string;
    enableSmartToolFilteringDesc: string;
    intentStaleQueryWeightLabel: string;
    intentStaleQueryWeightDesc: string;
    intentFreshnessWeightLabel: string;
    intentFreshnessWeightDesc: string;

    intentRoutingThresholdLabel: string;
    intentRoutingThresholdDesc: string;
    intentVaultKeywordWeightLabel: string;
    intentVaultKeywordWeightDesc: string;
    intentCreationWeightLabel: string;
    intentCreationWeightDesc: string;
    intentDeletionWeightLabel: string;
    intentDeletionWeightDesc: string;
    intentAnalysisWeightLabel: string;
    intentAnalysisWeightDesc: string;
    intentSearchWeightLabel: string;
    intentSearchWeightDesc: string;
    intentModifyWeightLabel: string;
    intentModifyWeightDesc: string;
    intentQuestionWeightLabel: string;
    intentQuestionWeightDesc: string;
    intentCodeWeightLabel: string;
    intentCodeWeightDesc: string;
    intentLengthWeightLabel: string;
    intentLengthWeightDesc: string;
    intentHistoryWeightLabel: string;
    intentHistoryWeightDesc: string;
    intentAttachmentWeightLabel: string;
    intentAttachmentWeightDesc: string;

    chatsFolderDesc: string;
    memoryFileDesc: string;
    skillsFolderDesc: string;
    maxAgentIterationsDesc: string;
    maxPrefetchedNotesDesc: string;
    prefetchSnippetLengthDesc: string;
    ragResultLimitDesc: string;
    ragSnippetLengthDesc: string;
    confirmObsidianCommandsDesc: string;

    enableSemanticRagLabel: string;
    enableSemanticRagDesc: string;
    embeddingProviderLabel: string;
    embeddingModelLabel: string;
    embeddingEndpointLabel: string;
    embeddingEndpointDesc: string;

    // Session Cost Dashboard
    sessionCostTooltip: string;
    sessionTokensInTooltip: string;
    sessionTokensOutTooltip: string;
    sessionRequestsTooltip: string;
    resetSessionMetrics: string;

    // Model Picker
    modelSearchPlaceholder: string;
    modelFilterAll: string;
    modelFilterTools: string;
    modelFilterVision: string;
    modelFilterReasoning: string;
    modelSortName: string;
    modelSortContext: string;
    modelCutoffLabel: string;
    modelLiveLabel: string;

    // Auto-Learning
    enableAutoLearningLabel: string;
    enableAutoLearningDesc: string;
    learningProposalTitle: string;
    learningProposalFacts: string;
    learningProposalSkills: string;
    learningApplied: string;
    learningDismissed: string;
    accept: string;
    dismiss: string;

    // Graph Analysis
    graphOverviewTitle: string;
    graphIsolatedTitle: string;
    graphHubsTitle: string;
    graphNoteContextTitle: string;
    graphRecommendTitle: string;

    // Reasoning Panel
    reasoningStepsCount: string;
    reasoningRunning: string;
    reasoningCompleted: string;

    // Hybrid RAG
    hybridRagPrefetchTitle: string;
    hybridRagPrefetchDetail: string;

    // Canvas read
    canvasReadSuccess: string;
    canvasReadError: string;

    exportSettings: string;
    importSettings: string;
    settingsExported: string;
    settingsImported: string;

    welcomeStep1Title: string;
    welcomeStep1Desc: string;
    welcomeStep2Title: string;
    welcomeStep2Desc: string;
    welcomeStep3Title: string;
    welcomeStep3Desc: string;
    welcomeStep4Title: string;
    welcomeStep4Desc: string;
    startTour: string;
    skip: string;
    next: string;
    back: string;

    // VCTX & VPREF & RESP & MODEL keys
    vaultContextToggleLabel: string;
    vaultContextToggleTooltip: string;
    enableVaultContextDefaultLabel: string;
    enableVaultContextDefaultDesc: string;
    maxPrefetchCountLabel: string;
    maxPrefetchCountDesc: string;
    requestTimeoutSecLabel: string;
    requestTimeoutSecDesc: string;
    agentNoEmptyAnswer: string;
    agentNetworkError: string;
    modelCapWeightLabel: string;
    modelCapWeightDesc: string;
    pressureWeightLabel: string;
    pressureWeightDesc: string;
    learnedBiasEnabledLabel: string;
    learnedBiasEnabledDesc: string;

    stopBtn: string;
    stopGeneration: string;
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
    stoppedByUser: "⏹️ Generation stopped by user.",
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
    chatsFolderDesc: "Folder relative to Vault root where conversation histories are saved.",
    memoryFileLabel: "Memory file path:",
    memoryFileDesc: "JSON file path relative to Vault root for long-term facts & user preferences.",
    skillsFolderLabel: "Agent skills folder path:",
    skillsFolderDesc: "Folder path relative to Vault root containing agent SKILL.md definition files.",
    maxAgentIterationsLabel: "Max agent iterations:",
    maxAgentIterationsDesc: "Maximum multi-turn tool execution steps per request before returning final answer.",
    maxPrefetchedNotesLabel: "Max prefetched notes:",
    maxPrefetchedNotesDesc: "Maximum vault notes automatically loaded and injected into context.",
    prefetchSnippetLengthLabel: "Prefetch snippet length:",
    prefetchSnippetLengthDesc: "Maximum character length for each prefetched vault note snippet.",
    ragResultLimitLabel: "RAG result limit:",
    ragResultLimitDesc: "Maximum number of notes retrieved via RAG search.",
    ragSnippetLengthLabel: "RAG snippet length:",
    ragSnippetLengthDesc: "Maximum snippet length per note retrieved via RAG search.",
    confirmObsidianCommandsLabel: "Require confirmation for Obsidian commands:",
    confirmObsidianCommandsDesc: "Prompt user before executing potentially destructive Obsidian commands.",

    enableTemporalAwarenessLabel: "Enable temporal awareness:",
    enableTemporalAwarenessDesc: "Inject knowledge cutoff dates and freshness warnings into model system prompt.",
    enableAdaptivePrefetchLabel: "Adaptive prefetch:",
    enableAdaptivePrefetchDesc: "Only search and prefetch vault notes when vault intent is detected.",
    enableFreshnessSuggestionsLabel: "Suggest web search in Quick mode:",
    enableFreshnessSuggestionsDesc: "Display proactive banner when a time-sensitive query is asked in Quick mode.",
    enableSmartToolFilteringLabel: "Smart tool filtering:",
    enableSmartToolFilteringDesc: "Pass only relevant tool categories (web, vault) to reduce prompt tokens.",

    intentStaleQueryWeightLabel: "Stale query routing weight:",
    intentStaleQueryWeightDesc: "Weight added towards Agent mode when a query is detected as time-sensitive.",
    intentFreshnessWeightLabel: "Freshness marker routing weight:",
    intentFreshnessWeightDesc: "Weight added towards Agent mode when freshness keywords ('today', 'latest') are present.",

    intentRoutingThresholdLabel: "Routing threshold:",
    intentRoutingThresholdDesc: "Score threshold above which Quick mode switches automatically to Agent mode.",
    intentVaultKeywordWeightLabel: "Vault keyword weight:",
    intentVaultKeywordWeightDesc: "Weight applied when vault terms ('note', 'folder') are detected.",
    intentCreationWeightLabel: "Creation pattern weight:",
    intentCreationWeightDesc: "Weight applied for creation patterns ('create note', 'save').",
    intentDeletionWeightLabel: "Deletion pattern weight:",
    intentDeletionWeightDesc: "Weight applied for deletion patterns ('delete file', 'remove').",
    intentAnalysisWeightLabel: "Analysis pattern weight:",
    intentAnalysisWeightDesc: "Weight applied for analysis patterns ('analyze', 'compare notes').",
    intentSearchWeightLabel: "Search pattern weight:",
    intentSearchWeightDesc: "Weight applied for search patterns ('find in vault', 'search').",
    intentModifyWeightLabel: "Modification pattern weight:",
    intentModifyWeightDesc: "Weight applied for edit/rename patterns.",
    intentQuestionWeightLabel: "Question pattern weight:",
    intentQuestionWeightDesc: "Weight (usually negative) favoring Quick mode for general Q&A.",
    intentCodeWeightLabel: "Code pattern weight:",
    intentCodeWeightDesc: "Weight (usually negative) favoring Quick mode for simple coding questions.",
    intentLengthWeightLabel: "Query length weight:",
    intentLengthWeightDesc: "Weight multiplier applied per character of user query length.",
    intentHistoryWeightLabel: "History turn weight:",
    intentHistoryWeightDesc: "Weight applied when recent turns in chat history used agent tools.",
    intentAttachmentWeightLabel: "Attachment weight:",
    intentAttachmentWeightDesc: "Weight added to score when images or files are attached.",

    enableSemanticRagLabel: "Enable hybrid semantic RAG:",
    enableSemanticRagDesc: "Combine lexical (TF-IDF) and vector embedding search for notes.",
    embeddingProviderLabel: "Embedding provider:",
    embeddingModelLabel: "Embedding model:",
    embeddingEndpointLabel: "Embedding endpoint URL:",
    embeddingEndpointDesc: "API endpoint for computing text embeddings (e.g., Ollama local server or OpenRouter).",

    sessionCostTooltip: "Estimated session cost (based on model pricing)",
    sessionTokensInTooltip: "Total input (prompt) tokens this session",
    sessionTokensOutTooltip: "Total output (completion) tokens this session",
    sessionRequestsTooltip: "Total API requests made this session",
    resetSessionMetrics: "Reset session metrics",

    modelSearchPlaceholder: "Search models...",
    modelFilterAll: "All",
    modelFilterTools: "Tools",
    modelFilterVision: "Vision",
    modelFilterReasoning: "Reasoning (32k+)",
    modelSortName: "Name",
    modelSortContext: "Context",
    modelCutoffLabel: "Cutoff:",
    modelLiveLabel: "Live",

    enableAutoLearningLabel: "Enable auto-learning:",
    enableAutoLearningDesc: "Automatically extract facts and patterns from conversations to enrich long-term memory.",
    learningProposalTitle: "🧠 Insights extracted from this conversation",
    learningProposalFacts: "Discovered facts:",
    learningProposalSkills: "Skill ideas:",
    learningApplied: "Learning applied to memory!",
    learningDismissed: "Learning proposal dismissed.",
    accept: "Accept",
    dismiss: "Dismiss",

    graphOverviewTitle: "Vault Graph Overview",
    graphIsolatedTitle: "Isolated Notes (Orphans)",
    graphHubsTitle: "Hub Notes (Most Connected)",
    graphNoteContextTitle: "Note Link Context",
    graphRecommendTitle: "Recommended Connections",

    reasoningStepsCount: "{completed}/{total} steps",
    reasoningRunning: "running",
    reasoningCompleted: "completed",

    hybridRagPrefetchTitle: "Hybrid RAG: {count} notes indexed",
    hybridRagPrefetchDetail: "Lexical + semantic search combined via RRF",

    canvasReadSuccess: "Canvas loaded: {nodes} nodes, {edges} edges",
    canvasReadError: "Error reading canvas: {error}",

    exportSettings: "Export Settings",
    importSettings: "Import Settings",
    settingsExported: "Settings exported to JSON file!",
    settingsImported: "Settings imported successfully!",

    welcomeStep1Title: "Welcome to NEI AI Chat",
    welcomeStep1Desc: "Your intelligent agentic co-pilot for Obsidian vault analysis, note creation, and knowledge retrieval.",
    welcomeStep2Title: "Zero Hardcoding & Smart Routing",
    welcomeStep2Desc: "Automatically detects whether to answer directly (Quick Mode) or use vault tools and web search (Agent Mode).",
    welcomeStep3Title: "Temporal Awareness & Hybrid RAG",
    welcomeStep3Desc: "Stays aware of model knowledge cutoffs, performs live web searches, and indexes vault notes via hybrid search.",
    welcomeStep4Title: "Custom Skills & MCP Tools",
    welcomeStep4Desc: "Extend AI capabilities with custom markdown skills and Model Context Protocol (MCP) external tools.",
    startTour: "Start Guided Tour",
    skip: "Skip",
    next: "Next",
    back: "Back",

    vaultContextToggleLabel: "Vault Context",
    vaultContextToggleTooltip: "Toggle vault context injection for this request",
    enableVaultContextDefaultLabel: "Enable Vault Context by default:",
    enableVaultContextDefaultDesc: "Default initial state of vault context switch when panel opens.",
    maxPrefetchCountLabel: "Max prefetch count ceiling:",
    maxPrefetchCountDesc: "Hard cap on maximum prefetched notes regardless of token budget.",
    requestTimeoutSecLabel: "API request timeout (sec):",
    requestTimeoutSecDesc: "Maximum waiting time for AI response before aborting.",
    agentNoEmptyAnswer: "The model returned an empty response. Please rephrase your prompt.",
    agentNetworkError: "Network error or timeout while connecting to AI.",
    modelCapWeightLabel: "Model capability weight:",
    modelCapWeightDesc: "Weight boosting Agent mode score for models with tool/vision support.",
    pressureWeightLabel: "Context pressure penalty weight:",
    pressureWeightDesc: "Penalty favoring Quick mode when context window is >70% full.",
    learnedBiasEnabledLabel: "Enable learned user preference bias:",
    learnedBiasEnabledDesc: "Learn and apply user mode overrides for similar query types.",

    stopBtn: "Stop",
    stopGeneration: "Stop generation",
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

    stopBtn: "Стоп",
    stopGeneration: "Остановить генерация",

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
    stoppedByUser: "⏹️ Генерация остановлена пользователем.",
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

    vaultContextToggleLabel: "Контекст из хранилища",
    vaultContextToggleTooltip: "Переключатель контекста заметок хранилища для текущего запроса",
    enableVaultContextDefaultLabel: "Включить контекст хранилища по умолчанию:",
    enableVaultContextDefaultDesc: "Начальное состояние переключателя контекста при открытии плагина.",
    maxPrefetchCountLabel: "Максимальное число загружаемых заметок:",
    maxPrefetchCountDesc: "Жёсткий лимит количества заметок префетча, независимо от контекстного бюджета.",
    requestTimeoutSecLabel: "Таймаут API запроса (сек):",
    requestTimeoutSecDesc: "Максимальное время ожидания ответа от ИИ сервиса перед таймаутом.",
    agentNoEmptyAnswer: "Модель вернула пустой ответ. Попробуйте перефразировать запрос.",
    agentNetworkError: "Сетевая ошибка или таймаут при обращении к ИИ.",
    modelCapWeightLabel: "Вес возможностей модели:",
    modelCapWeightDesc: "Вес, повышающий балл Агентного режима для моделей с поддержкой инструментов и зрения.",
    pressureWeightLabel: "Штраф за заполнение контекста:",
    pressureWeightDesc: "Штраф, склоняющий к Быстрому режиму, если контекстное окно близко к заполнению (>70%).",
    learnedBiasEnabledLabel: "Включить обученное предпочтение пользователя:",
    learnedBiasEnabledDesc: "Запоминать ручные переключения режима для аналогичных типов запросов.",

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
    chatsFolderDesc: "Папка относительно корня Vault, в которой сохраняется история диалогов.",
    memoryFileLabel: "Файл долгосрочной памяти:",
    memoryFileDesc: "Путь к JSON файлу долгосрочной памяти с фактами и предпочтениями.",
    skillsFolderLabel: "Папка скиллов агента:",
    skillsFolderDesc: "Папка с файлами SKILL.md, определяющими навыки ИИ-агента.",
    maxAgentIterationsLabel: "Макс. итераций агента:",
    maxAgentIterationsDesc: "Максимальное количество шагов вызова инструментов за один запрос.",
    maxPrefetchedNotesLabel: "Макс. префетч заметок:",
    maxPrefetchedNotesDesc: "Максимальное число заметок, автоматически загружаемых в контекст.",
    prefetchSnippetLengthLabel: "Длина сниппета префетча:",
    prefetchSnippetLengthDesc: "Максимальная длина текста каждой загружаемой заметки.",
    ragResultLimitLabel: "Лимит RAG заметок:",
    ragResultLimitDesc: "Максимальное количество заметок, получаемых через RAG поиск.",
    ragSnippetLengthLabel: "Длина сниппета RAG:",
    ragSnippetLengthDesc: "Максимальная длина сниппета для RAG заметок.",
    confirmObsidianCommandsLabel: "Запрашивать подтверждение команд Obsidian:",
    confirmObsidianCommandsDesc: "Спрашивать подтверждение перед выполнением команд Obsidian.",

    enableTemporalAwarenessLabel: "Включить временную осведомленность:",
    enableTemporalAwarenessDesc: "Передавать модели даты cutoff и предупреждения о свежести данных.",
    enableAdaptivePrefetchLabel: "Адаптивный префетч:",
    enableAdaptivePrefetchDesc: "Загружать заметки только когда обнаружен запрос к хранилищу.",
    enableFreshnessSuggestionsLabel: "Предлагать веб-поиск в Быстром режиме:",
    enableFreshnessSuggestionsDesc: "Показывать баннер с предложением включить веб-поиск для актуальных данных.",
    enableSmartToolFilteringLabel: "Умная фильтрация инструментов:",
    enableSmartToolFilteringDesc: "Передавать только нужные категории инструментов для экономии токенов.",

    intentStaleQueryWeightLabel: "Вес устаревшего запроса:",
    intentStaleQueryWeightDesc: "Дополнительный вес к Agent режиму, если запрос требует свежих данных.",
    intentFreshnessWeightLabel: "Вес маркеров свежести:",
    intentFreshnessWeightDesc: "Вес при наличии слов 'сегодня', 'сейчас', 'курс'.",

    intentRoutingThresholdLabel: "Порог роутинга:",
    intentRoutingThresholdDesc: "Порог баллов, при превышении которого включается Agent режим.",
    intentVaultKeywordWeightLabel: "Вес ключевых слов Vault:",
    intentVaultKeywordWeightDesc: "Вес при обнаружении слов 'заметка', 'папка', 'хранилище'.",
    intentCreationWeightLabel: "Вес шаблонов создания:",
    intentCreationWeightDesc: "Вес при просьбах создать заметку или сохранить.",
    intentDeletionWeightLabel: "Вес шаблонов удаления:",
    intentDeletionWeightDesc: "Вес при запросах на удаление файлов.",
    intentAnalysisWeightLabel: "Вес шаблонов анализа:",
    intentAnalysisWeightDesc: "Вес при просьбах проанализировать или сравнить заметки.",
    intentSearchWeightLabel: "Вес шаблонов поиска:",
    intentSearchWeightDesc: "Вес при поиске по заметкам.",
    intentModifyWeightLabel: "Вес шаблонов изменения:",
    intentModifyWeightDesc: "Вес при переименовании или правке файлов.",
    intentQuestionWeightLabel: "Вес простых вопросов:",
    intentQuestionWeightDesc: "Отрицательный вес, склоняющий к Быстрому режиму для обычных вопросов.",
    intentCodeWeightLabel: "Вес вопросов по коду:",
    intentCodeWeightDesc: "Отрицательный вес для простых запросов кода.",
    intentLengthWeightLabel: "Вес длины запроса:",
    intentLengthWeightDesc: "Множитель веса за каждый символ длины сообщения.",
    intentHistoryWeightLabel: "Вес истории диалога:",
    intentHistoryWeightDesc: "Вес при наличии агентных шагов в недавней истории.",
    intentAttachmentWeightLabel: "Вес прикрепленных файлов:",
    intentAttachmentWeightDesc: "Прибавляемый вес при наличии изображений или документов.",

    enableSemanticRagLabel: "Включить гибридный семантический RAG:",
    enableSemanticRagDesc: "Комбинировать лексический (TF-IDF) и векторный эмбеддинг поиск по заметкам.",
    embeddingProviderLabel: "Провайдер эмбеддингов:",
    embeddingModelLabel: "Модель эмбеддингов:",
    embeddingEndpointLabel: "URL эндпоинта эмбеддингов:",
    embeddingEndpointDesc: "API-адрес для вычисления текстовых эмбеддингов (локальный Ollama или OpenRouter).",

    sessionCostTooltip: "Расчётная стоимость сессии (по ценам модели)",
    sessionTokensInTooltip: "Всего входящих (prompt) токенов за сессию",
    sessionTokensOutTooltip: "Всего исходящих (completion) токенов за сессию",
    sessionRequestsTooltip: "Всего API-запросов за сессию",
    resetSessionMetrics: "Сбросить метрики сессии",

    modelSearchPlaceholder: "Поиск моделей...",
    modelFilterAll: "Все",
    modelFilterTools: "Инструменты",
    modelFilterVision: "Зрение",
    modelFilterReasoning: "Рассуждения (32k+)",
    modelSortName: "Имя",
    modelSortContext: "Контекст",
    modelCutoffLabel: "Данные до:",
    modelLiveLabel: "Актуально",

    enableAutoLearningLabel: "Включить авто-обучение:",
    enableAutoLearningDesc: "Автоматически извлекать факты и паттерны из диалогов для обогащения долгосрочной памяти.",
    learningProposalTitle: "🧠 Извлечено из этого диалога",
    learningProposalFacts: "Обнаруженные факты:",
    learningProposalSkills: "Идеи скиллов:",
    learningApplied: "Знания сохранены в память!",
    learningDismissed: "Предложение обучения отклонено.",
    accept: "Применить",
    dismiss: "Отклонить",

    graphOverviewTitle: "Обзор графа ваулта",
    graphIsolatedTitle: "Изолированные заметки (сироты)",
    graphHubsTitle: "Хабы (самые связанные)",
    graphNoteContextTitle: "Контекст связей заметки",
    graphRecommendTitle: "Рекомендуемые связи",

    reasoningStepsCount: "{completed}/{total} шагов",
    reasoningRunning: "выполняется",
    reasoningCompleted: "завершено",

    hybridRagPrefetchTitle: "Гибридный RAG: {count} заметок проиндексировано",
    hybridRagPrefetchDetail: "Лексический + семантический поиск через RRF",

    canvasReadSuccess: "Canvas загружен: {nodes} узлов, {edges} связей",
    canvasReadError: "Ошибка чтения canvas: {error}",

    exportSettings: "Экспорт настроек",
    importSettings: "Импорт настроек",
    settingsExported: "Настройки успешно экспортированы в JSON файл!",
    settingsImported: "Настройки успешно импортированы!",

    welcomeStep1Title: "Добро пожаловать в NEI AI Chat",
    welcomeStep1Desc: "Ваш интеллектуальный ИИ-копилот для анализа Vault, создания заметок и извлечения знаний.",
    welcomeStep2Title: "Умный роутинг без хардкода",
    welcomeStep2Desc: "Автоматически определяет, ответить напрямую (Быстрый) или применить инструменты ваулта и веб-поиск (Агент).",
    welcomeStep3Title: "Временная осведомленность и гибридный RAG",
    welcomeStep3Desc: "Учитывает даты cutoff моделей, ищет свежие данные в интернете и индексирует заметки.",
    welcomeStep4Title: "Персональные скиллы и MCP инструменты",
    welcomeStep4Desc: "Расширяйте возможности агента собственными markdown скиллами и внешними MCP серверами.",
    startTour: "Начать тур",
    skip: "Пропустить",
    next: "Далее",
    back: "Назад",

    systemPromptRu: "Ты — агентный ИИ-помощник NEI в Obsidian.\nТвоя цель: помогать пользователю работать с хранилищем заметок Vault и отвечать на его вопросы.\n\nПРАВИЛА ИСПОЛЬЗОВАНИЯ ИНСТРУМЕНТОВ:\n1. Если пользователь просит \"создай заметку\", \"создай папку\" или \"сохрани\" — ОБЯЗАТЕЛЬНО вызови инструмент `create_note(path, content)`.\n2. Для чтения заметок используй `read_note` или `get_folder_notes`.\n3. Инструмент `create_note` автоматически создаёт все вложенные папки.\n\nОТВЕТ: GitHub Flavored Markdown.",
    systemPromptEn: "You are NEI — an agentic AI assistant integrated into Obsidian.\nYour goal: help the user work with their Vault (notes, folders) and answer questions.\n\nTOOL USAGE RULES:\n1. If the user asks to \"create a note\", \"create a folder\", or \"save\" — you MUST call the `create_note(path, content)` tool.\n2. To read notes, use `read_note` or `get_folder_notes`.\n3. The `create_note` tool automatically creates nested folders.\n\nRESPONSE FORMAT: GitHub Flavored Markdown."
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