# NEI AI Chat — Полный аудит проекта и дорожная карта

Дата: 2026-09-06 · Версия на момент аудита: **1.1.0** · 8.5K LOC TS/TSX + 95 тестов
Предыдущие документы: [AUDIT.md](./AUDIT.md) (внешний аудит), [FIXPLAN.md](./FIXPLAN.md) (исправления, все закрыты).

---

## 1. Резюме

NEI AI Chat — агентный ИИ-ассистент для Obsidian: чат с LLM через OpenRouter/OpenAI-совместимые эндпоинты, инструменты над хранилищем (23 тула), RAG по заметкам, память, скиллы, мультимодальные вложения, мобильная адаптация с рантайм-измерением UI-обвязки Obsidian. Текущее состояние: ядро (транспорт, харнес, мобильная вёрстка) вычищено и протестировано; главные долги — работа со вложениями (PDF/аудио/видео фактически не доходят до модели), скиллы (инструкции не попадают в промпт), единая система провайдеров и ошибок.

---

## 2. Архитектура

| Модуль | Файлы | Роль |
|---|---|---|
| Точка входа | `main.ts` | Настройки (43 поля), реестр тулов, MCP-discovery, вью, reopen-логика |
| Вью | `src/views/ChatView.ts` | ItemView → React (`createRoot`), отдаёт живые `getSettings`, `viewComponent` |
| UI | `src/components/ChatPanel.tsx` (≈1900) + 9 компонентов | Панель чата, оверлеи, конфиг, телеметрия chrome-inset |
| Транспорт | `src/services/llm.ts` | `fetch` + AbortSignal, SSE-парсер (`StreamAccumulator`), `LlmHttpError`, fallback на `requestUrl` |
| Харнес | `src/services/agent/agentLoop.ts` | Intent-роутинг → quick/agent, итерации, тулы, подтверждения, prompt-cache (LRU) |
| Контекст | `src/services/agent/contextManager.ts` | pruneHistory (6 ходов / 24k), compactText, stripImages |
| Инструменты | `src/services/tools/*` | 23 тула (см. §4) |
| RAG | `src/services/rag.ts`, `rag/vectorIndex.ts` | TF-IDF с кэшем токенов по mtime, гибридный режим |
| Память/скиллы | `src/services/memory/*`, `skills/*` | memory.json, AGENTS.md, SKILL.md, AutoLearner |
| Модели | `src/services/openrouter.ts`, `modelRegistry.ts` | Каталог, способности, прайсинг, knowledge cutoff |
| Чаты | `src/services/chat/chatStore.ts` | JSON-файлы сессий + index в `.nei/chats` |
| i18n | `src/i18n/translations.ts` | baseEn/baseRu (253 ключа), остальные языки — клоны en |
| Инфра | esbuild, vitest (95), `check-i18n`, CI | Сборка + автосинк в локальный vault |
| Сателлит | `D:\projects\nei-layout-inspector` | Плагин-отладчик вёрстки (v1.1.0, драг окон) |

---

## 3. Инвентарь возможностей

### 3.1 Чат и сессии
- Сессии: создание, переключение (drawer), удаление, очистка всей истории, **branch от любого сообщения** (копия истории в новую сессию).
- Сообщения: copy / edit+resend / retry; assistant — copy / branch / save-as-note (через `create_note`).
- Стриминг (SSE) + **рабочий Stop**: AbortSignal через весь стек, частичный ответ сохраняется с пометкой «остановлено».
- Счётчики токенов per-message; дашборд сессии (токены/стоимость — прайсинг берётся из `/models`, ранее всегда $0).
- Дебаунс записи сессий (1.5 c) с флашем при закрытии; base64-картинки в историю не пишутся повторно (`stripImages`).

### 3.2 Режимы и роутинг
- `auto / quick / agent`. В `auto` IntentRouter считает score из 13 настраиваемых весов + сигмоида-уверенность (веса **реально читаются** из настроек — проверено, intentRouter.ts:377–390).
- Панель «Intent Router Weights» + temporal-веса в конфиге.
- Smart tool filtering: на 1-й итерации сужает список тулов по интенту (web-only или vault-префиксы + whitelist `query_dataview/render_templater/execute_obsidian_command`), дальше — все тула.
- Ограничение: выбранное `executionMode` сохраняется в глобальные настройки (нет per-session override).

### 3.3 Агентский харнес
- До `maxAgentIterations` (default 6) итераций; нативные tool_calls + фолбэк-парсер JSON/XML (валидация по реестру, сбалансированные скобки).
- Подтверждения: очередь (параллельные вызовы не зависают), гейт на `execute_obsidian_command`.
- Пустой ответ → фолбэк-запрос без тулов; дубль-вызовы тула с теми же аргументами получают предупреждение.
- models без `supportsTools` автоматически уходят в quick.
- LRU prompt-cache (20 записей, TTL 60 c, ключи по контент-хешам).
- Кооперативная отмена: `throwIfAborted` на границах итераций/тулов; partial-save при Stop.

### 3.4 Инструменты агента (23)
`create_note, edit_note, rename_note, delete_note, read_note, read_notes_batch, diff_note, search_notes, list_notes, get_folder_notes, search_by_tag, get_all_tags, analyze_vault_graph, analyze_github_repo, web_search, read_web_page, execute_obsidian_command, save_to_memory, create_agent_skill, query_dataview, render_templater, create_canvas, read_canvas` + MCP-тулы (динамически, discovery в `onload` без таймаута — риск B23 из аудита, не чинилось).

### 3.5 RAG и контекст хранилища
- Лексический TF-IDF: DF-проход по кэшу Obsidian, токенизация только кандидатов, кэш токенов по mtime (cap 500).
- Семантический/гибридный режим (`enableSemanticRag`) через embedding API + RRF.
- Один поиск на сообщение; агентский режим берёт `maxPrefetchedNotes`, quick — `ragResultLimit`; сниппеты обрезаются `prefetchSnippetLength`.
- Тумблер «Контекст из хранилища» (`vaultContextEnabled`) гейтит **только поиск** (см. §6).

### 3.6 Память, скиллы, дообучение
- `memory.json` → `learnedFacts` (все факты вставляются в системный промпт **без лимита**); `AGENTS.md` — пользовательские правила.
- Скиллы: `.nei/skills/*/SKILL.md` (frontmatter name/description). **В системный промпт попадают только name+description — `instructions` не используются нигде** (agentLoop: `skills.map(s => [Skill: name] description)`). Скиллы фактически декоративны.
- AutoLearner: после ответа (≥4 сообщений, `enableAutoLearning`, default off) quickModel вытягивает факты/идеи скиллов → баннер «принять/отклонить» → запись в память/скиллы.

### 3.7 Модели и провайдеры
- OpenRouter: каталог моделей (5-мин кэш), способности (tools/vision/audio/video), прайсинг, key usage.
- Слоты: primary / vision / quick; кастомный список моделей; temporal-реестр knowledge cutoff + freshness-подсказки.
- Транспорт: OpenAI-совместимый `/chat/completions`; `provider: ollama/custom` отличается только отсутствием Authorization. Anthropic-нативный, листинг локальных моделей, профили провайдеров — отсутствуют.

### 3.8 Вложения (проверено по коду, см. §5)
- Лимит `maxAttachmentSizeBytes` (500 KB) на файл; несколько файлов за раз — ✓.
- Картинки → даунскейл до 1280px JPEG → `image_url`. Текст/`pdf` → inline `<file>` в текст запроса. Аудио/видео → data URL в стейте, **в запрос не попадают**. PDF → плейсхолдер.

### 3.9 UI/UX и мобильная адаптация
- Хедер (сессии/новый чат/режим/контекст/перенос вкладки/настройки), capability bar, reasoning panel (лог шагов), конфиг-панель (карточки: ключ, модели, пути, temporal, веса, импорт/экспорт), sessions drawer, welcome tour, tooltips, error boundary с reset.
- Мобильная система chrome-inset: рантайм-измерение `.status-bar` / `.mobile-navbar` / `.mobile-toolbar` + глубокий геометрический скан + Capacitor Keyboard bridge (didShow-авторитетный, трим 35px, кламп 55%) + детект «Obsidian сам освободил место» (room-below > 60px) + система-gap память. Все окна инспектора перетаскиваются.
- Container queries (не media), absolute-оверлеи в панели, автоскролл «у нижнего края», клавиатурная логика в эффектах с очисткой.

### 3.10 Прочее
- i18n: en/ru полные, es/de/fr/zh/ja/pt/ko — фолбэк на en (клоны), `check-i18n` валидирует паритет.
- Экспорт/импорт настроек JSON (экспортирует apiKey в открытом виде — пометить в roadmap по безопасности).
- Тесты: 95 (транспорт/SSE, парсер тулов, contextManager, RAG, chrome-inset, intentRouter, chatStore, i18n).

---

## 4. Проверка: вложения любых типов и нескольких сразу

| Тип | Что происходит | Вердикт |
|---|---|---|
| Несколько файлов | `input multiple` + цикл по `FileList`, у каждого свой FileReader | ✅ работает |
| `.txt/.md/.json/.js/.ts/.py/.css/.html/.csv/.yaml/.yml` | `readAsText` → inline `<file name="…">` в запрос | ✅ работает |
| Изображения | Даунскейл ≤1280px JPEG (~q0.85) → `image_url` | ✅ работает |
| PDF | `readAsArrayBuffer` → **плейсхолдер** `[PDF file: … binary content not extracted]` | ❌ содержимое НЕ доходит до модели |
| Аудио/видео | data URL в стейте → **в запрос не включаются** (фильтры берут только image/text/pdf) | ❌ молча теряются (в fallback-режиме инлайнятся как текст) |
| Неизвестные расширения | `readAsText` — бинарник уйдёт мусором в промпт | ⚠️ нужна защита |

Дополнительно: UI-чипы не показывают, что файл реально прикреплён/проигнорирован; `accept` фильтра не ограничивает произвольные типы.

## 5. Вердикт: «отключение контекста отрезает инструменты»?

**Подозрение не подтверждается в текущем коде.** `useVaultContext` гейтит **только RAG-поиск** (agentLoop: `if (useVaultContext) { …search… }`); реестр тулов передаётся модели всегда (`allTools = toolRegistry.getToolDefinitions()` вне условия), блок «TOOL USAGE RULES» в системном промпте строится безусловно, память/скиллы грузятся независимо. Т.е. при выключенном тумблере модель по-прежнему может создавать/редактировать заметки — просто без автоматически подобранного контекста.

**Но** претензия по сути справедлива: тумблер называется «Контекст из хранилища», а на деле выключает только подсказки — семантика неочевидна. → Роадмап R5.

---

## 6. Дорожная карта (добавить / вырезать / пересмотреть)

### Вырезать
- [x] **R0. Голосовая запись** (🎤 MediaRecorder + AudioRecorder) — **сделано в 1.1.0**. Аудио-файлы через 📎 пока остаются (но см. §4 — в запрос они всё равно не идут).
- [ ] **R0.1 `ModelPicker.tsx`** — мёртвый компонент, не импортируется никем. 10 мин.
- [ ] **R0.2 Аудио/видео вложения** — до появления реальной поддержки скрыть из `accept` и чипов, чтобы не терялись молча.

### Добавить
- **R1. Прикрепление заметок через `@` / `/` с автокомплитом** (P1, ~6–8 ч)
  Триггер `@` (или `[[`) в textarea → fuzzy-поиск по `app.vault.getMarkdownFiles()` (переиспользовать кэш RAG) → попап подсказок (клавиши/тап) → вставка `[[путь]]` + авто-attach содержимого заметки как text-вложение. Отметка в чипе «note». later: `@skill:` для скиллов.
- **R2. Вложения v2** (P1, ~8 ч): PDF-экстракция (pdf.js или unpdf, текст+постранично, лимит), явные статусы чипов (inlined / как image / **ignored**), отказ для бинарных, процент сжатия для картинок.
- **R3. Ошибки провайдеров и плагина** (P1, ~4 ч): тип `LlmError { kind: auth | rate-limit | provider-down | bad-request | network | aborted | parse }`, i18n-шаблоны, retry с backoff для 429/5xx, отдельная карточка ошибки с кодом и подсказкой.
- **R4. Провайдеры и локальные модели** (P2, ~2–3 дня): интерфейс `ProviderAdapter { listModels, chat, stream, abort }`; адаптеры: OpenRouter (есть) → Ollama native (`/api/chat`, `/api/tags`, листинг локальных моделей) → LM Studio / vLLM / any OpenAI-compatible профиль → Anthropic native (`/messages`, свой формат tools). Профили провайдеров (несколько одновременно), переключение без правки endpoint вручную.
- **R5. Режимы и контекст** (P2, ~4 ч): тумблер «Контекст из хранилища» разделить на два независимых: «RAG-подсказки» и «Разрешить инструменты хранилища» (второй — гейт на передачу tools, default on); режим per-session (не писать в глобальные настройки); в reasoning panel всегда показывать «почему этот режим».
- **R6. Скиллы / дообучение / память** (P2, ~1–2 дня): подгрузка `instructions` скилла в промпт (или tool `use_skill`); лимит и релеванс-фильтр `learnedFacts` (сейчас безлимитно); редактор памяти в конфиге; включаемость скиллов чекбоксами; AutoLearner: показывать diff перед записью.
- **R7. Оптимизация токенов** (P2, ~1 день): точная оценка токенов (chars/4 → лёгкий токенизатор), OpenRouter prompt caching (`cache_control` для системного промпта), `max_tokens` стиринг, бюджеты на tool-result per-tool, дедуп RAG-сниппетов между ходами, счётчик «сэкономлено» в дашборде.
- **R8. Безопасность** (P3): не экспортировать apiKey в plaintext при выгрузке настроек (или предупреждение), маскировать ключ в логах.
- **R9. MCP**: таймаут/не блокировать `onload` (B23 из внешнего аудита — всё ещё открыт).

### Пересмотреть (уже сделано в 1.0.1→1.1.0, держать под контролем)
- Транспорт (fetch/abort/SSE), settings-flow, chrome-inset, RAG single-pass, prompt-cache, парсер тулов, очередь подтверждений — см. [FIXPLAN.md](./FIXPLAN.md).

---

## 7. Рекомендуемый порядок работ

1. R0.1–R0.2 (вырезать мёртвое/обманчивое) → 2. R3 (ошибки) → 3. R1 (@-упоминания) → 4. R2 (вложения v2) → 5. R5 (режимы/контекст) → 6. R6 (скиллы/память) → 7. R4 (провайдеры) → 8. R7 (токены) → 9. R8–R9.
