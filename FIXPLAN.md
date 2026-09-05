# NEI AI Chat — Комплексный план исправлений

Сопутствующий файл к [AUDIT.md](./AUDIT.md). Все пункты аудита перепроверены по коду.
Аудит помечен `B*`/`R*`, новые находки — `N*`. Приоритет: P0 (блокирует пользователей) → P3 (полировка).

---

## 0. Статус выполнения (2026-09-05)

**Ревизия B26 (после проверки на реальном Obsidian):** пункт B26 аудита оказался ошибочным — статус-бар Obsidian **плавает поверх** листьев воркспейса и на ПК, и на мобильных (подтверждено форумом Obsidian), а `.mobile-toolbar` над клавиатурой перекрывает низ панели. Статический паддинг заменён на рантайм-измерение (`src/utils/obsidianChrome.ts`): реальный rects `.status-bar` / `.mobile-toolbar` против низа панели → CSS-переменная `--nei-chrome-inset` → паддинг инпута `calc(max(env(safe-area-inset-bottom, 8px), 8px) + var(--nei-chrome-inset))`. Пересчёт на mount/resize/visualViewport/focusin-focusout с отложенными замерами (тулбар появляется с анимацией) и guarded-фолбэком для webview без ресайза. Паттерн оформлен как навык `obsidian-plugin-ui` (`~/.agents/skills/`, вместе с копией хелпера).

Реализовано в рамках этого плана (сборка, 75 тестов и i18n-проверка зелёные):

- **Фаза 0** ✅ — CSS-дубли удалены, единые clamp-правила + брейкпоинты 380/560px (N2, B8, B27, B28), тач-таргеты ≤280px (B19), фикс статус-бара (B26), удалён lucide-react (B17), defaults.ts (B24), рабочий check-i18n (B16) — сразу нашёл и закрыл 5 пропущенных ключей в baseRu.
- **Фаза 1** ✅ — нативный `fetch` с AbortSignal + fallback на requestUrl (B1/B2/R5), настоящий SSE-парсинг с буферизацией строк, `StreamAccumulator` (контент, reasoning, tool_calls-дельты, usage), `LlmHttpError` без повторных запросов при 4xx, кооперативная отмена в лупе (B2), частичный ответ сохраняется при Stop, починена мёртвая interrupt-ветка (N5), `signal` в fetchEmbedding, warn при fallback (B22).
- **Фаза 2** ✅ — `getSettings` — живые настройки в лупе (N1), `AgentLoopResult.steps` сохраняются (N3), LRU promptCache на контент-хешах (B6), парсер тулов: `<tool_call>`/`tool`-ключ + валидация по реестру + сбалансированные скобки (B12/B13), очередь подтверждений (N6) + резолв при Stop, автонота удалена (N7), гейт supportsTools (N8), whitelist-исключения в фильтре тулов (N17).
- **Фаза 3** ✅ — context.ts удалён (N4), один RAG-поиск на сообщение в обоих режимах, DF-проход без токенизации, токенизация только кандидатов, кэш токенов по mtime (B3 этап 1).
- **Фаза 4** ✅ — visualViewport-листенер в useEffect с эвристикой клавиатуры (B4), автоскролл «у нижнего края» (N14), ObsidianMarkdown: дебаунс 80мс + skip-identical + race-guard + компонент вью (B9/N13), drawer/welcome → absolute в панели с закрытием по фону/Esc (B5/N12), debounce переоткрытия на уровне плагина (B11).
- **Фаза 5** ✅ (частично) — прайсинг из OpenRouter API (N9), даунскейл картинок + stripImages из истории (B10-lite), AudioRecorder: secondsRef + mounted-guard (N10/B21), msg.id и стабильные ключи (N11), дебаунс saveSession с флашем на unmount (B15), R3 по горячему пути: пузыри/действия/токен-статы/чипы → CSS-классы.
- **Фаза 6** ✅ — 34 новых теста: StreamAccumulator (фрейминг, tool_calls-дельты), parseHttpErrorMessage, парсер тулов (регресс B12), pruneHistory/stripImages, RAG (кандидаты, лимит, пустые запросы), hashString. Починен vitest alias — 4 тест-файла не загружались с самого начала.

**Осталось из плана (отдельные PR):**
- R1: полный сплит ChatPanel на 6 файлов + useAgent/useSettings-хуки (частично компенсирован точечными фиксами гонок настроек и сохранений).
- R3: перенос оставшихся inline-стилей (конфиг-панель — рендерится редко, приоритет низкий).
- B10 полный вариант: хранение аттачментов в `.nei/attachments` + ссылки в JSON.
- R2: персистентный RAG-индекс за флагом `enablePersistentRagIndex`.
- B20: проверить визуально (overflow-wrap наследуется — скорее всего не проблема).
- N15: перестать коммитить main.js (решение владельца — релизный процесс).

---

## 1. Вердикт по аудиту

### Подтверждено полностью
| ID | Проблема | Проверка |
|----|----------|----------|
| B1 | Стриминг не работает: `requestUrl` буферизует ответ, `body.getReader()` = `undefined`, всегда срабатывает fallback → `enableStreaming` мёртв | `llm.ts:261` |
| B2 | `AbortSignal` нигде не используется: `performPostRequest` (llm.ts:4-12) принимает `signal` и игнорирует | подтверждено |
| B3 | `searchVaultLexical` читает и дважды токенизирует весь vault на каждый запрос | `rag.ts:38-105` |
| B4 | Утечка visualViewport-листенера: cleanup возвращается из `useCallback`/`onFocus`, а не из `useEffect` | `ChatPanel.tsx:143-165` |
| B5 | `position: fixed` оверлеи (drawer, welcome) рендерятся вне панели | `ChatPanel.tsx:958`, `WelcomeScreen.tsx:39` |
| B6 | `promptCache`: ключ по длинам строк, без TTL-инвалидации по контенту, Map без ограничений | `agentLoop.ts:52-140` |
| B7/R3 | ~80% JSX — inline-стили, memo-компоненты бесполезны | подтверждено |
| B8 | Хедер ломается на 380–560px (один брейкпоинт) | см. также N2 — корневая причина глубже |
| B9 | `ObsidianMarkdown`: полный ререндер на каждый чанк, render не awaited | `ChatPanel.tsx:38-67` (но «утечка листенеров» — не подтверждена, см. N13) |
| B10 | base64-картинки в сессиях и в каждом запросе истории | `pruneHistory` не чистит `images` |
| B11 | Гонка setTimeout в `ChatView.onClose` — возможны дубли вью | узкое окно, подтверждено |
| B12/B13 | JSON-парсер тулов срабатывает на примерах кода, ленивый regex ломается на вложенности | `agentLoop.ts:567-621` |
| B16 | `check-i18n.mjs` фиктивен: считает `key:`, всегда exit 0 | подтверждено |
| B17 | `lucide-react` не используется ни разу в src/ | grep: 0 вхождений |
| B18/B19 | safe-area не на всех нижних карточках; cqi даёт тач-таргеты < 44px на узких контейнерах | подтверждено |
| B23 | MCP- discovery без таймаута блокирует `onload` | grep: нет timeout/race в mcpClient |
| B24 | Дубли дефолтов `.nei/chats` в main.ts и chatStore.ts | подтверждено |
| B26/B27/B28 | Фантомные 30px статус-бара; дубль `:focus-visible`; hover перебивает `.nei-btn-active` | подтверждено |

### Ошибочно / преувеличено в аудите
- **B14 неверен как сформулирован.** `classifyIntent` читает **все 13 весов** из settings (intentRouter.ts:377-390) — веса работают. Но рядом лежит реальная и более тяжёлая проблема — **N1** (stale settings).
- **B21 частично неверен.** В `AudioRecorder` cleanup на unmount **есть** (AudioRecorder.tsx:32-36, 95-100). Реальная проблема — гонка: если компонент размонтируется во время `await getUserMedia()`, стрим резолвится уже после cleanup → микрофон остаётся включённым. `mcpClient`/`autoLearner` не держат ресурсов — претензия снята.
- **B25 неверен.** Кнопка «🔄 Reset UI» в ErrorBoundary **есть** (ErrorBoundary.tsx:38-43).
- **B20 вероятно не проблема:** `word-break` и `overflow-wrap` наследуются — правило на `.nei-chat-bubble` уже действует на `<a>` и `<code>`. Проверить визуально, не писать фикс вслепую.
- **B15 преувеличен:** `saveSession` вызывается 1 раз за ход (ChatPanel.tsx:622), а не «6+ записей». Дебаунс — nice-to-have, не bugfix.
- **B22 преувеличен:** silent catch падает в fallback `sendChatRequest`, который бросает нормальную ошибку пользователю. Notice — косметика.
- **B9 про «накопление листенеров»:** cleanup выгружает Component при каждом ререндере, накопления нет. Реальная опасность — race непоследовательных async-рендеров (N13).

### Пропущено аудитом (новые находки)
- **N1 (P0). Stale settings prop.** `ChatView` рендерит `ChatPanel` один раз в `onOpen`; `props.settings` — замороженный снимок на момент монтирования. `saveSettings` обновляет `plugin.settings` и диск, но props никогда не обновляются → **AgentLoop.run получает устаревшие настройки**. Все тумблеры конфига (smart tool filtering, adaptive prefetch, semantic RAG, веса intent, maxAgentIterations и т.д.) сохраняются на диск, но **не действуют** до переоткрытия вью. `main.ts:40-44` (props), `ChatPanel.tsx:603` (передача в run).
- **N2 (P0). Дубли CSS перекрывают адаптив.** `.nei-select-mode`, `.nei-header-btn`, `.nei-header-group`, `.nei-model-select` объявлены дважды; поздние блоки (styles.css:280-359) с фиксированными `font-size: 11px; padding: 3px 6px; flex-wrap: nowrap; max-width: 140px` молча перебивают ранние clamp/wrap-правила (styles.css:65-209). Это корень B8 и «неработающих» мобильных фиксов.
- **N3 (P1). Шаги агента не сохраняются.** `steps: activeSteps` (ChatPanel.tsx:618) — значение из замыкания на момент старта = всегда `[]`. Лог рассуждений теряется при сохранении сессии.
- **N4 (P1). Двойной RAG-поиск + мёртвый контекст.** `AgentLoop.run` вызывает `resolveContext` (читает активную заметку, плагины, RPG API и делает свой `searchVaultLexical`), но используется только `ragContext`; затем prefetch делает **второй** полный поиск. `buildSystemPrompt` (context.ts) мёртвый код — активная заметка в промпт не попадает вовсе. Дополняет B3: даже после оптимизации rag.ts поиск выполняется 2×.
- **N5 (P1). Мёртвая ветка interrupt.** В `handleSendMessage` (ChatPanel.tsx:703-710) ранний `if (... || loading) return` делает abort-ветку недостижимой. Даже починив B2, Stop из Enter-пути не заработает.
- **N6 (P1). Гонка подтверждений.** Один слот `pendingConfirmation` (ChatPanel.tsx:173) + параллельные tool calls (`Promise.all`, agentLoop.ts:407): два `execute_obsidian_command` в одной итерации → второй затирает первый → его promise висит вечно → агент зависает.
- **N7 (P1). Автосоздание заметки без согласия.** `shouldAutoCreateNote`/`attemptAutoCreateNote` (agentLoop.ts:623-670) пишут файл в vault по слову «создай/сохрани», в т.ч. в quick-режиме и при уже созданной моделью заметке (дубли). Хардкод ru/en ключевых слов.
- **N8 (P1). Tools не гейтятся по `supportsTools`.** `getDefaultModelCapabilities` ставит `supportsTools: true` всем (openrouter.ts:219); луп передаёт tools моделям без поддержки → 400 от провайдера.
- **N9 (P2). Дашборд стоимости всегда $0.** `pricingMap` — вечно пустой объект (ChatPanel.tsx:191), а прайсинг уже приходит из `/models` и лежит в `OpenRouterService.cachedModels`.
- **N10 (P3). AudioRecorder передаёт `seconds` из устаревшего замыкания** → имя файла всегда `audio_0s.webm` (записывать `secondsRef.current`).
- **N11 (P3). `key={idx}`** для сообщений (ChatPanel.tsx:1442) — нужен стабильный `msg.id`.
- **N12 (P3). Drawer не закрывается кликом по фону** и по Esc.
- **N13.** Уточнение B9: главный риск — race параллельных не-awaited рендеров при быстром стриме (после B1 станет горячим); «утечки» нет.
- **N14 (P3). Нет автоскролла контейнера сообщений** при отправке/стриме (в панели нет ни одного скролла к низу).
- **N15 (P3). `main.js` (бандл) коммитится в репозиторий** — шум в диффах; собирать в CI и не хранить в git (или хотя бы осознанно оставить).
- **N16 (P3). `onunload` не детачит листья вью** — рекомендация Obsidian для мобильных.
- **N17 (P3). Фильтр тулов на 1-й итерации по префиксам** исключает `query_dataview`, `execute_obsidian_command`, `render_templater` — при включённом smart filtering модель не может их вызвать первым ходом.

---

## 2. План работ

Зависимости, определяющие порядок:
- **B1 нельзя делать без B9/N13** — настоящий стрим без дебаунса рендера породит шторм `MarkdownRenderer.render` на каждый чанк.
- **R1 (разбиение ChatPanel) делать до R3 (inline→CSS)** — иначе переносить стили дважды.
- **N1 делать до всего, что завязано на настройки в лупе** (B6, B12, N6-N8), иначе фиксы будут тестировать устаревший конфиг.
- B3 фиксировать в два шага: сначала дешёвое ускорение + устранение двойного поиска (N4), персистентный индекс (R2) — отдельно за флагом.

### Фаза 0 — Гигиена (без риска, ~1.5 ч)
1. **B17:** удалить `lucide-react` из package.json (`npm uninstall lucide-react`). — 5 мин
2. **N2 + B27 + B28:** удалить дублирующиеся CSS-блоки (styles.css:280-359 повторные определения, дубль `:focus-visible`), сохранить responsive-версии; добавить `.nei-header-btn.nei-btn-active:hover`. — 1 ч
3. **B24:** `src/utils/defaults.ts` с `DEFAULT_PATHS`, импорт в main.ts и chatStore.ts. — 15 мин
4. **N15:** перестать коммитить `main.js` (собрать локально перед релизом; .gitignore — по решению владельца, т.к. Obsidian требует бандл в релизе, но не в git). — 5 мин
5. **B16:** переписать `check-i18n.mjs`: распарсить языковые блоки, сравнить множества ключей, exit 1 при расхождении. — 30 мин

### Фаза 1 — Транспорт: fetch, abort, стрим (B1 + B2 + N5 + N13, ~4-5 ч)
> Фазу делать единым коммитом вместе с «Фаза 4, п.2 (дебаунс рендера)», либо временно оставить стрим выключенным.

1. **llm.ts — нативный `fetch`:**
   - `sendChatRequest`: `fetch(url, { method, headers, body, signal })`, fallback на `requestUrl` при `typeof fetch === 'undefined'` / сетевой ошибке, характерной для WebView.
   - `sendChatRequestStream`: `fetch` + `response.body.getReader()` + `TextDecoder`, SSE-парсинг `data:` / `[DONE]`, накопление `delta.content` **и** `delta.tool_calls` (сейчас не парсятся вовсе).
   - Ошибки HTTP не глотать: 4xx/5xx → тот же user-friendly разбор, что в `sendChatRequest` (llm.ts:123-147), вынести в общий хелпер.
   - **B22:** `console.warn` при fallback со стрима на обычный запрос.
2. **agentLoop.ts — кооперативная отмена:**
   - проверять `abortSignal?.aborted` в начале каждой итерации, перед и после выполнения тулов и перед `attemptAutoCreateNote`;
   - при отмене бросать `AbortError` — ChatPanel ловит его отдельно и **сохраняет накопленный `streamingContent`** как assistant-сообщение с пометкой «остановлено пользователем», не как ошибку.
3. **rag.ts:** `fetchEmbedding` принимает `signal`.
4. **ChatPanel.tsx (N5):** удалить мёртвую ветку; кнопка Stop → `abortController.abort()`; `handleSendMessage` при `loading` — только return.
5. **Тесты:** мок-fetch: abort на середине стрима не возвращает полный ответ; SSE с `tool_calls`-дельтами парсится; fallback срабатывает при отсутствии `body`.

### Фаза 2 — Поток настроек и корректность лупа (N1 + N3 + N6-N8 + B6 + B12/B13, ~5-6 ч)
1. **N1 — единый источник настроек:**
   - `ChatView` передаёт `getSettings: () => plugin.settings` (или сам `plugin`);
   - `executeQuery` читает `getSettings()` в момент вызова;
   - промежуточно (до R1): в ChatPanel завести `settingsRef`, обновляемый в каждом save-хендлере, и передавать `settingsRef.current` в `AgentLoop.run`.
   - Критерий: изменение `maxAgentIterations`/`enableSmartToolFiltering` в UI влияет на следующий запрос без переоткрытия вью.
2. **N3:** `AgentLoopResult` дополняется `steps: AgentStep[]`; ChatPanel сохраняет `result.steps`, а не state-замыкание.
3. **B6:** `promptCache` → LRU (max 20), ключ = `${modelId}|${language}|hash(prefetchedContext)|hash(agentsRules)|hash(memory.learnedFacts)|skills.names`, TTL 60s. Хеш — простой djb2/FNV (без crypto-зависимостей).
4. **B12+B13:** парсер тулов — только `<tool_call>…</tool_call>` либо явный ключ `"tool"`; имя валидируется по `toolRegistry.getToolDefinitions()`; парсить **все** блоки, брать первый с валидной сигнатурой. Ленивый regex заменить на парсер сбалансированных скобок.
5. **N6:** очередь подтверждений — `pendingConfirmations: Array<{toolName, argsStr, resolve}>`; модалка показывает первую и резолвит по очереди.
6. **N7:** удалить `shouldAutoCreateNote`/`attemptAutoCreateNote` (тул `create_note` уже покрывает сценарий и проходит через подтверждение). Если жалко — флаг `enableAutoNoteFallback`, default `false`.
7. **N8:** в `AgentLoop.run` при `actualMode === 'agent'` и `activeModelDetails?.supportsTools === false` (или fallback-детект) → работать в quick-режиме + Notice «модель не поддерживает tool calling».
8. **N17:** при фильтрации тулов на 1-й итерации добавить исключения: `query_dataview`, `render_templater`, `execute_obsidian_command` (и любые не read/create/delete-префиксные) — либо фильтровать по явному whitelist-набору, а не по префиксам.

### Фаза 3 — RAG и контекст (B3 этап 1 + N4, ~3-4 ч; R2 отдельно)
1. **N4:** убрать `resolveContext` из `AgentLoop.run` (вместе с мёртвым чтением заметки/плагинов/RPG). `ragContext` = результат prefetch-поиска. `context.ts` + `buildSystemPrompt` удалить или оставить только используемое. Результат: один поиск на сообщение вместо двух.
2. **B3 этап 1 (без персистентности):**
   - один проход: читать → токенизировать сразу (убрать второй проход и `fileContents` Map);
   - `content.matchAll(/\S+/g)` вместо split+filter;
   - ограничить параллелизм чтения (пул ~8) вместо `Promise.all` по всем файлам;
   - **кэш токенизации по `file.stat.mtime`** (Map path → {mtime, tokens, docLength}) — это убирает 90% стоимости повторных запросов; инвалидация по `vault.on('modify'|'delete'|'create')`.
3. **R2 (отдельная задача, за settings-флагом `enablePersistentRagIndex`, default off):** `.nei/rag-index.json` + инкрементальная достройка; семантический индекс — после стабильности лексического.

### Фаза 4 — Мобильный UX и рендер (B4 + B9 + B5 + N14, ~4 ч)
1. **B4:** листенер `visualViewport` перенести в `useEffect([])` с cleanup; триггер только при открытой клавиатуре (`visualViewport.height < innerHeight * 0.75`); при фокусе — сначала скролл контейнера сообщений вниз, затем textarea; `padding-bottom: env(safe-area-inset-bottom)` на `.nei-chat-messages-container` (media pointer:coarse).
2. **B9 + N13:** `ObsidianMarkdown` — принимать `component` от вью (прокинуть `view.component` через props из ChatView); дебаунс 80 мс; skip при неизменном markdown (ref на последнее значение); await render + guard на устаревание (token/актуальный markdownRef), чтобы поздний рендер не перезаписал свежий.
3. **N14:** автоскролл контейнера сообщений: effect на `[messages.length, streamingContent]`, скролл в низ только если пользователь у нижнего края (порог ~40px).
4. **B5:** drawer, welcome, confirm-карточка, learning-баннер, freshness-баннер → `position: absolute` внутри `.nei-chat-panel-container` (он уже `position: relative`); z-index по Obsidian-конвенции; **N12** — закрытие по клику на фон и Esc.
5. **B18:** safe-area на нижних карточках; **B26:** убрать `--status-bar-height` с десктопа; **B19:** `@container (max-width: 280px)` с min-height 36px для хедер-кнопок.
6. **B8:** трёхступенчатый хедер (≤379px column / 380-559px wrap / ≥560px single row) — после N2 дубли уже не будут мешать.
7. **B11:** в `ChatView.onClose` — синхронная проверка + `registerInterval`/флаг, либо вообще пересмотреть авто-переоткрытие вью (продуктовое решение).

### Фаза 5 — Рефакторинг UI (R1 → R3, B7, B10, остальное, ~10-12 ч)
1. **R1:** выделить `hooks/useAgent.ts` (executeQuery/abort/loading/steps/streaming), `hooks/useSettings.ts` (draft-объект настроек вместо ~30 useState, дебаунс-сейв, импорт/экспорт), компоненты `Header`, `MessagesList`, `InputBar`, `ConfigPanel`, `SessionsDrawer`. Заодно уходят гонки `saveSettings` (сейчас каждое поле сохраняется отдельным вызовом с устаревшей базой).
2. **R3/B7:** перенос inline-стилей в `styles.css` (классы из списка аудита); clamp-значения — в CSS-переменные по брейкпоинтам контейнера.
3. **B10 (lite-вариант первым шагом):**
   - даунскейл картинок на атаче (canvas → JPEG/WebP, max 1280px, ~0.8 quality) — решает 80% веса без новой инфраструктуры;
   - `pruneHistory`/сбор сообщений: вырезать `images` из истории старше последнего хода;
   - **не** писать base64 в session JSON (при сохранении заменять на плейсхолдер-ссылку, восстанавливать превью из `.nei/attachments` при загрузке — полный вариант из аудита, второй шаг).
4. **B15:** дебаунс `saveSession` (1-2s) + flush при `onClose` и `visibilitychange`.
5. **N9:** `pricingMap` наполнять из `OpenRouterService.fetchModels()` (поле `pricing` уже в кэше).
6. **N10:** `secondsRef` в AudioRecorder + mounted-guard после `await getUserMedia()` (закрывает корректную часть B21).
7. **N11:** `id` у `ChatMessage`, `key={msg.id}`.
8. **N16:** `onunload` → детач листьев с `VIEW_TYPE_NEI_CHAT`.

### Фаза 6 — Тесты и верификация (R6, ~3-4 ч)
Добавить тесты: abort реально отменяет (fetch-мок, стрим обрывается); SSE-парсер (включая tool_calls-дельты, [DONE], мусорные строки); fallback-путь стрима; пустой ответ + fallback лупа (agentLoop.ts:297-303, 374-383); парсер тулов против JSON-примеров (B12 регресс); pruneHistory чистит images; LRU promptCache; chatStore round-trip; rag на фикстуре 1000 заметок < 500ms (с горячим кэшем токенов); i18n-скрипт ломается на недостающем ключе.

Ручная проверка после каждой фазы:
1. `npm run build` (tsc + esbuild) и `npm run test` зелёные.
2. Desktop: отправка, Stop на середине — запрос реально обрывается, частичный ответ сохранён, списание токенов соответствует.
3. Стриминг: текст появляется инкрементально, курсор не мигает, нет дёрганий.
4. Mobile (hot-reload на телефон): клавиатура не закрывает input; drawer в пределах панели; тач-таргеты; safe-area.
5. Большой vault: первый агентский запрос, затем повторный — второй существенно быстрее (кэш токенов).
6. Конфиг: поменять тумблер в UI → поведение меняется в том же сеансе (N1).
7. Модель без tools → агент не падает 400-й (N8).

---

## 3. Сводная таблица

| Фаза | Содержание | Оценка | Эффект |
|------|-----------|--------|--------|
| 0 | Гигиена: CSS-дубли, lucide, дефолты, i18n-скрипт | ~1.5 ч | разблокирует честную адаптивность |
| 1 | fetch + AbortSignal + стрим + interrupt | ~4-5 ч | Stop работает, стрим живой |
| 2 | Settings-flow, шаги, парсер тулов, подтверждения, supportsTools | ~5-6 ч | корректность агента, настройки работают |
| 3 | RAG: один поиск, кэш токенов | ~3-4 ч | −80-90% задержки на больших vault |
| 4 | Мобильный UX, оверлеи, дебаунс-рендер, автоскролл | ~4 ч | мобильный UX + отсутствие шторма рендера |
| 5 | Рефакторинг R1→R3, аттачменты, прайсинг, мелочи | ~10-12 ч | поддерживаемость, вес сессий, memo |
| 6 | Тесты | ~3-4 ч | защита регрессий |

Итого ~31-36 ч. Максимальный пользовательский эффект дают фазы 1-3; фазу 5 можно резать на отдельные PR (каждый компонент независимо).
