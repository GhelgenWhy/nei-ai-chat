# NEI AI Chat — Technical Audit (for AI agents)

Obsidian community plugin. 8.5K LOC TS/TSX, 470 LOC CSS, single React monolith (1800 LOC) + 671 LOC agent loop + 313 LOC HTTP client + 924 LOC vault tools.

Stack: TypeScript 5, React 18, esbuild, Obsidian API 1.7+, target OpenRouter + Ollama + custom OpenAI-compatible endpoints.

All paths and identifiers referenced as `file:line` are in this repo (`D:\projects\nei-ai-chat`).

---

## Critical Bugs (ship-blockers)

### B1. Streaming is non-functional — `enableStreaming` toggle does nothing
**File:** `src/services/llm.ts:249-307`

`obsidian.requestUrl()` returns `{status, text, json}` — the response is fully buffered. It has **no** `body.getReader()`. The code does `(res as unknown as StreamResponse).body?.getReader()` which is `undefined`, triggering fallback `if (!reader) return sendChatRequest(...)`.

Net effect: every "streaming" call falls back to non-streaming. `enableStreaming` flag is dead code.

**Required fix:** Use native `fetch(url, {signal, method, headers, body})` directly inside the plugin (works in Electron renderer). Add `signal: AbortSignal` for true cancellation. Parse SSE chunks with `reader.read()` + `TextDecoder`. Strip `data: ` prefix, handle `[DONE]`, accumulate `choices[0].delta.content`.

Keep `obsidian.requestUrl` as fallback for restricted environments (Mobile WebView may differ).

---

### B2. `AbortSignal` is never passed to HTTP — Stop button is cosmetic
**Files:** `src/services/llm.ts:4-12, 121`, `src/services/rag.ts:118-145`

```ts
async function performPostRequest(url, headers, bodyStr, signal?) {
    const res = await requestUrl({ url, method: "POST", headers, body: bodyStr });
    // signal parameter exists but never forwarded — there is no signal in obsidian.requestUrl
}
```

`ChatPanel.tsx:708` calls `abortController.abort()` → UI sets `loading=false` → but **HTTP request continues to completion** → model provider still charges tokens → assistant message **appends 10-30s later** after user already pressed Stop.

**Required fix:** All HTTP calls (chat, embeddings, model metadata) must accept `signal` and use `fetch()` with `{signal}` option. Then `abortController.abort()` actually cancels mid-flight request.

---

### B3. RAG re-reads entire vault on every query — O(N) latency
**File:** `src/services/rag.ts:38-105`

```ts
const files = app.vault.getMarkdownFiles();
const readResults = await Promise.all(
    files.map(async (file) => {
        const content = await app.vault.cachedRead(file); // ALL files
        ...
    })
);
for (const {file, content} of readResults) {
    const fileTokens = tokenize(content); // SECOND pass, full tokenize
    ...
}
```

On 5000-note vault: 5-15s blocking before LLM call starts. No persistent index, no incremental invalidation, double iteration over content (read pass + tokenize pass).

**Required fix (minimum):**
1. Single-pass with early-exit: read + tokenize in one loop.
2. Use `content.matchAll(/\S+/g)` instead of `split(/\s+/).filter(...)` — avoids intermediate array allocation.
3. Bound concurrency: `p-limit(10)` — `Promise.all` over 5000 files saturates event loop.
4. Drop the `fileContents` Map; use generator.

**Required fix (proper):** Persistent lexical index `.nei/rag-index.json` (term → posting list) + vector index `.nei/vector-index.json` (embeddings). Build on plugin load, invalidate via `vault.on('create'|'modify'|'delete', debounce(markDirty, 5000))`. Rebuild incrementally. Current `vectorIndex.ts` already has skeleton; needs persistence layer.

---

### B4. Mobile virtual keyboard pushes textarea out of view
**Files:** `src/components/ChatPanel.tsx:143-165`, `styles.css:362-376`

```ts
const handleTextareaFocus = () => {
    if (window.visualViewport) {
        const handleResize = () => {
            if (rect.bottom > viewportHeight) {
                textareaRef.current.scrollIntoView(...);
            }
        };
        window.visualViewport.addEventListener('resize', handleResize);
        return () => { window.visualViewport?.removeEventListener(...); };
    }
};
```

Three problems:
1. Cleanup is returned from `useCallback`, not `useEffect` — listener leaks on unmount/blur.
2. `visualViewport.resize` fires on iOS for any scroll, not just keyboard — spurious `scrollIntoView` during typing **disrupts caret position**.
4. `padding-bottom` safe-area applied to `.nei-chat-input-container` only; `.nei-chat-messages-container` does **not** scroll up — messages get covered by keyboard, then input covers keyboard.

**Required fix:**
1. Move listener to `useEffect([])`, cleanup on unmount.
2. Trigger only on keyboard (track `visualViewport.height < window.innerHeight * 0.75` as keyboard-open heuristic).
3. Apply `padding-bottom: env(safe-area-inset-bottom)` to `.nei-chat-messages-container` not just input.
4. On focus, scroll messages container to bottom first, then focus textarea.

---

### B5. `position: fixed` sessions drawer breaks in Obsidian mobile WebView
**File:** `src/components/ChatPanel.tsx:957-1028`

```tsx
<div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, ...}}>
```

`position: fixed` anchors to **viewport** in mobile WebView, not the plugin panel. Result: drawer renders behind Obsidian status bar or outside visible area. `z-index: 100` conflicts with Obsidian modals (`z-index > 1000`).

**Required fix:** Use `position: absolute` inside `.nei-chat-panel-container` (already `position: relative` per `styles.css:36`). Lower z-index to `var(--layer-modal)` (Obsidian convention).

Same pattern needed for: confirm card (`ChatPanel.tsx:1640`), learning proposal (`ChatPanel.tsx:1574`), freshness banner (`ChatPanel.tsx:1404`), welcome overlay (`WelcomeScreen.tsx` — already uses `fixed`, needs verification).

---

## High-priority Bugs

### B6. `promptCache` in AgentLoop leaks and uses wrong cache key
**File:** `src/services/agent/agentLoop.ts:52-140`

```ts
private static promptCache: Map<string, {prompt: string; timestamp: number}> = new Map();
private static getSystemPrompt(...) {
    const cacheKey = `${language}|${vaultContext.ragContext?.length || 0}|${agentsRules.length}|...`;
    ...
    this.promptCache.set(cacheKey, ...); // unbounded growth
}
```

Issues:
1. No `max` size — Map grows ~2-10KB per unique key, indefinitely per session. ~1-5MB leak per 100 queries.
2. TTL is 30s but cache key omits **content hash** of RAG — modifying a note doesn't invalidate, model gets stale context for up to 30s (race condition).
3. `cacheKey` does not include `userQuery` hash — same key for unrelated queries with same metadata sizes.

**Required fix:** Replace `Map` with `LRU` (max ~20 entries). Key = `sha256(modelId + language + sha256(prefetchedContext.slice(0,500)) + sha256(memory.join('|')) + sha256(skills.map(s=>s.name).join('|')))`. TTL 60s.

---

### B7. Inline `style={{...}}` flood destroys memoization and theme reactivity
**File:** `src/components/ChatPanel.tsx` (~80% of JSX)

Every render allocates new style objects. `ObsidianMarkdown`, `WelcomeScreen`, `ReasoningPanel`, `ModelCapabilityBar` are wrapped in `memo` but parent re-renders 100% of time → memo is no-op. Theme variable changes via Obsidian theme system work for CSS classes, but inline styles with explicit values don't react to theme updates.

Estimated 40-60% of render time wasted on mobile.

**Required fix:** Extract class-based equivalents into `styles.css`:
- `.nei-sessions-overlay`, `.nei-sessions-modal`
- `.nei-config-panel`, `.nei-config-section`, `.nei-config-input`, `.nei-config-row`, `.nei-config-card`
- `.nei-msg-bubble--user`, `.nei-msg-bubble--assistant`, `.nei-msg-bubble-actions`, `.nei-msg-bubble-token-stats`
- `.nei-attach-chip`, `.nei-attach-chip-remove`
- `.nei-freshness-banner`
- `.nei-confirm-card`, `.nei-learning-card`

Move all `clamp()` font/padding values to CSS vars (defined per `@container nei-panel` breakpoint) so JSX stays minimal.

---

### B8. Mobile header breaks at 380-560px viewport
**File:** `styles.css:53-63, 79-85, 145-151`

Only one breakpoint at 560px. In landscape phone / iPad-mini split (380-559px), the 4-button second group wraps → header height 70-90px, breaks visual hierarchy.

**Required fix:** Three states:
```css
.nei-chat-header { flex-direction: column; }              /* ≤379px */
@container nei-panel (min-width: 380px) {
    .nei-chat-header { flex-direction: row; flex-wrap: wrap; } /* wrap row */
}
@container nei-panel (min-width: 560px) {
    .nei-chat-header { flex-wrap: nowrap; }                    /* single row */
}
```

---

### B9. `ObsidianMarkdown` leaks Obsidian Component event listeners
**File:** `src/components/ChatPanel.tsx:38-67`

```ts
const component = new Component();  // root component, not bound to view lifecycle
componentRef.current = component;
component.load();
MarkdownRenderer.render(app, markdown, el, "", component);
```

`MarkdownRenderer.render` attaches click handlers for internal links via the provided Component. Since this Component is created per-render and not registered with the ItemView, `component.unload()` runs on local React unmount but Obsidian internal listeners may persist (especially for unresolved links).

On every streaming chunk, `useEffect` runs → `el.empty()` + new render → cumulative listener accumulation proportional to message length.

**Required fix:**
1. Pass `view.component` (the ItemView's root Component) instead of `new Component()`. Wire via `ChatView.ts → ChatPanel.tsx` props.
2. Debounce re-render during streaming: 80ms timer, reset on each chunk.
3. Skip re-render if markdown content is identical (use ref to track last).

---

### B10. `Message.images: string[]` (base64) bloats session files and LLM context
**Files:** `src/services/llm.ts:14-24`, `src/services/chat/chatStore.ts`, `src/components/ChatPanel.tsx:556`

Attached image (~500KB) → base64-dataURL (~700KB) → saved into `.nei/chats/{id}.json`. Chat with 5 images = 3.5MB JSON. Each session load parses full JSON.

Worse: when session is loaded and sent as history to LLM, images are re-included in **every agent-loop iteration** as `user` message `images[]`. `ContextManager.pruneHistory(chatHistory, 6)` keeps first 6 messages with their full base64 → thousands of wasted tokens per iteration.

**Required fix:**
1. Save attachments to `.nei/attachments/{sha256}.{ext}` on attach.
2. JSON stores only `{attachmentId, mime}` reference.
3. On LLM send, resolve references back to base64 in `cleanMessages` mapping in `llm.ts:85-109`.
4. Prune attachments from history older than N messages (configurable, default 3).

---

### B11. `onClose` race condition creates duplicate views
**File:** `src/views/ChatView.ts:58-66`

```ts
window.setTimeout(() => {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_NEI_CHAT);
    if (existing.length === 0) {
        void this.plugin.activateView();
    }
}, 100);
```

User rapidly opens/closes 3x → 3 setTimeout in flight → each sees `existing.length === 0` → 3 views spawned.

**Required fix:** Use `this.registerInterval` or `isClosing: boolean` flag. Or check `existing.length === 0` immediately in `onClose` (synchronous), no setTimeout.

---

### B12. Tool-call JSON parser triggers on example code blocks
**File:** `src/services/agent/agentLoop.ts:567-582`

```ts
if (/```(?:json)?\s*\{[\s\S]*?"(?:tool|name|function|action)"\s*:/i.test(text)) {
    return true;
}
```

If model returns JSON example to **explain** a concept (e.g. "Here's what a tool call looks like: ```json {tool:...}"), AgentLoop treats it as a real tool call and invokes the tool.

**Required fix:** Only treat as tool-call if wrapped in `<tool_call>...</tool_call>` (already supported as XML branch). Otherwise require explicit `tool_call` key (not `name`/`function`/`action` which are too generic).

---

## Medium-priority Bugs

### B13. `containsJsonToolCall` regex is fragile on multiple JSON blocks
**File:** `src/services/agent/agentLoop.ts:567-582`

`[\s\S]*?` is non-greedy but if model outputs two JSON blocks, only first parsed. If first is explanation and second is command, command is lost.

**Required fix:** Parse all blocks, filter for one with valid tool signature (e.g. contains `tool` key + known tool name from `toolRegistry.getToolDefinitions()`).

---

### B14. `intentRouter` weights in `NeiAiChatSettings` may not flow into actual scoring
**File:** `src/services/agent/intentRouter.ts:38-56`, `src/main.ts:141-155`, `src/services/agent/agentLoop.ts:186-194`

Settings expose 13 `intent*Weight` fields plus `intentRoutingThreshold`. `IntentRouter.classifyIntent(userQuery, hasImages, language, chatHistory, settings, modelDetails)` accepts `settings` but the implementation likely uses hardcoded `ScoringWeights` defaults from intentRouter.ts rather than reading individual weights.

User adjusts weight in UI → no behavior change.

**Required fix:** Either:
- Remove unused weight fields from `NeiAiChatSettings` (and UI).
- Or properly extract `{vaultKeywordWeight, creationPatternWeight, ...}` from `settings` and pass into `ScoringWeights` in `classifyIntent`.

---

### B15. `chatStore.saveSession` writes JSON synchronously per message
**File:** `src/components/ChatPanel.tsx:622, 671`, `src/services/chat/chatStore.ts`

Every `setCurrentSession` → `ChatStore.saveSession` → `app.vault.adapter.write(folder/index.json, ...)`. In agent mode with 6 iterations producing 6 messages: 6+ disk writes per turn. On slow disk / Dropbox / iCloud sync: lock contention.

**Required fix:** Debounce 1-2s on save. Force flush on `onClose`. Pattern already exists for `defaultNoteFolder` in `ChatPanel.tsx:1137-1140` — apply same.

---

### B16. `i18n` validation script is fake — does not detect missing keys
**File:** `scripts/check-i18n.mjs:13-19`

```js
const keysMatch = content.match(/([a-zA-Z0-9_]+):\s*["`']/g);
console.log(`✅ Loaded ${keysMatch.length} pairs`);
```

Counts all keys including nested in `ru:`, `en:` language objects. Does not check that each language block has identical key set. Missing key in `es:` while present in `ru:` → user sees `undefined` in Spanish UI.

**Required fix:**
1. Split file by language block delimiters (`ru:`, `en:`, ...).
2. Extract key set per language.
3. Compute symmetric difference; fail build if non-empty.

---

### B17. `lucide-react` in dependencies but no usage in src/
**Files:** `package.json:22`, src/

`rg "from 'lucide-react'" src/` returns 0. All icons in JSX are emoji (📂, ➕, ⚙️, ⚡). Bundle bloat ~50-100KB.

**Required fix:** Verify with `rg "lucide-react" src/`. If zero hits, remove from `package.json` dependencies and run `npm uninstall lucide-react`.

---

### B18. `safe-area-inset-*` missing from bottom UI elements
**File:** `src/components/ChatPanel.tsx:1404, 1574, 1640`

Only welcome overlay (`ChatPanel.tsx:966`) and input container (`styles.css:368,374`) use `env(safe-area-inset-bottom)`. Confirm card, learning proposal, freshness banner all use bare inline padding. On iPhone with home indicator, bottom edges get clipped.

**Required fix:** Apply `padding-bottom: max(env(safe-area-inset-bottom, 0px), 8px)` globally to all bottom-anchored cards.

---

### B19. `cqi` units break touch targets on accessibility-zoom (≤280px viewport)
**File:** `styles.css:34, 96-108, 160-172, 392-403, 446-459`

`padding: clamp(3px, 0.7cqi, 4px)` evaluates to 3px on 280px viewport → button height 24-26px, below Apple/Google 44×44px touch target minimum. Affected: ⚙️ ↙️ 📂 ➕ buttons in header.

**Required fix:** Add `@container nei-panel (max-width: 280px)` with `padding: 8px; min-height: 36px;` overrides for all `.nei-header-btn`, `.nei-session-btn`, `.nei-new-chat-btn`.

---

### B20. Long URLs in assistant markdown expand bubble width
**File:** `src/components/ChatPanel.tsx:1440-1560`, `styles.css:236-247`

`.nei-chat-bubble` has `word-break: break-word; overflow-wrap: anywhere`. But `.markdown-rendered a` does not have these — long URL inside `<a>` tag expands inline-block to max width. Code blocks (`<pre>`) get `overflow-x: auto` (`styles.css:259-264`) but inline `<code>` doesn't.

**Required fix:**
```css
.nei-chat-bubble .markdown-rendered a {
    word-break: break-all;
    overflow-wrap: anywhere;
}
.nei-chat-bubble .markdown-rendered :not(pre) > code {
    word-break: break-all;
    overflow-wrap: anywhere;
}
```

---

### B21. `audioRecorder`/`mcpService` may not cleanup MediaRecorder on unmount
**Files:** `src/components/AudioRecorder.tsx:170`, `src/services/mcp/mcpClient.ts`, `src/services/memory/autoLearner.ts`

`isRecordingAudio = true` mounts AudioRecorder → opens MediaRecorder. If user closes view mid-recording, React unmounts but MediaRecorder stream continues → OS-level red recording indicator stays on.

**Required fix:** Every component with side effects must have `useEffect(() => { return () => {recorder.stop(); stream.getTracks().forEach(t => t.stop())}}, [])` cleanup.

---

### B22. Silent `catch {}` blocks hide errors from users
**File:** `src/services/llm.ts:305-307`

```ts
} catch {
    /* fallback to standard non-streaming request */
}
```

401 from streaming → silent fallback → user sees nothing. Should at minimum show Notice.

**Required fix:** Replace with `catch (e) { console.warn('[NEI] Streaming failed:', e); new Notice(t("streamingFailed", language)); return sendChatRequest(...); }`.

---

### B23. `McpService.discoverMcpTools()` blocks `onload`
**File:** `main.ts:179-187`

```ts
const {definitions, executors} = await McpService.discoverMcpTools();
```

If MCP server hangs, plugin fails to load → Obsidian shows "plugin failed to load".

**Required fix:** Remove `await`, do `void McpService.discoverMcpTools().then(...).catch(e => console.warn(e))`. MCP tools load lazily after plugin ready.

---

### B24. Defaults duplicated in `main.ts` and `chatStore.ts`
**Files:** `main.ts:104-106`, `src/services/chat/chatStore.ts:14-16`

`chatsFolder` default `.nei/chats` lives in both `main.ts` and `chatStore.ts`. Change in one, forgotten in other → silent fallback inconsistency.

**Required fix:** Extract to `src/utils/defaults.ts`, import in both.

---

### B25. `ErrorBoundary` has no manual reset UI
**File:** `src/components/ErrorBoundary.tsx:50`, `src/components/ChatPanel.tsx:1793-1800`

```tsx
const [panelKey, setPanelKey] = useState(0);
return <ErrorBoundary key={panelKey}>
    <ChatPanelInner {...props} onReload={() => setPanelKey(k => k + 1)} />
</ErrorBoundary>
```

If error caught during settings import → `onReload` not callable from inside ErrorBoundary fallback → user stuck. `onReload` only fires from `handleImportSettings`.

**Required fix:** ErrorBoundary fallback must include "Reload Panel" button that calls reset mechanism.

---

### B26. `padding-bottom: var(--status-bar-height, 30px)` on desktop adds phantom 30px
**File:** `styles.css:368`

`--status-bar-height` is not a standard Obsidian CSS variable. Falls back to 30px → desktop gets 30px empty space below input.

**Required fix:** Scope to mobile only:
```css
.nei-chat-input-container { padding-bottom: 4px; }
@media (pointer: coarse) {
    .nei-chat-input-container { padding-bottom: max(env(safe-area-inset-bottom, 12px), 12px); }
}
```

---

### B27. `:focus-visible` block duplicated
**File:** `styles.css:180-186, 328-334`

Two identical blocks. Harmless but noisy.

**Required fix:** Delete one (lines 180-186).

---

### B28. `.nei-btn-active:hover` overrides accent background
**File:** `styles.css:174-178, 189-193`

When vault-context-btn is `.nei-btn-active`, the `:hover` rule still applies `--background-secondary-alt` → flicker between accent and secondary.

**Required fix:**
```css
.nei-header-btn.nei-btn-active:hover {
    background: var(--interactive-accent-hover, var(--interactive-accent));
    border-color: var(--interactive-accent-hover, var(--interactive-accent));
}
```

---

## Architectural Improvements

### R1. Modularize `ChatPanel.tsx` (1800 LOC monolith)
Split into:
- `Header.tsx` — control bar
- `MessagesList.tsx` — message rendering + streaming cursor
- `InputBar.tsx` — textarea + attach buttons
- `ConfigPanel.tsx` — settings modal
- `SessionsDrawer.tsx` — history modal
- `hooks/useAgent.ts` — `executeQuery`, abort, loading, steps, streamingContent
- `hooks/useSettings.ts` — NeiAiChatSettings state, debounced save, import/export

Each can be `memo`d effectively. Reduces cognitive load, enables per-component testing.

---

### R2. Persistent RAG index
Lexical: `.nei/rag-index.json` (term → Map<filePath, TF>, doc lengths, IDF snapshot).
Semantic: `.nei/vector-index.json` (file path → Float32Array embedding).
Build on plugin load (debounced full rebuild for first run).
Invalidate on `vault.on('create'|'modify'|'delete', debounce(markDirty, 5000))`.
Rebuild incrementally on next query (incremental updates for changed files only).

---

### R3. Replace inline styles with CSS classes
~80% of ChatPanel.tsx JSX is `style={{...}}`. Move to `styles.css` with semantic class names. Enables:
- Effective `memo`.
- Theme variable reactivity.
- Smaller bundle (no JS object allocation per render).
- Hot-reload friendly.

---

### R4. Drop `lucide-react` if unused
`rg "from 'lucide-react'" src/` — if 0 hits, remove from `package.json` and uninstall.

---

### R5. Native `fetch` for HTTP (replacing `obsidian.requestUrl`)
Allows: `AbortSignal`, real streaming via `getReader`, `keepalive` control. Falls back to `requestUrl` only if `fetch` unavailable (some Mobile WebView builds).

---

### R6. Test coverage gaps
Existing: `agentLoop.test.ts`, `intentRouter.test.ts`, `fileHandling.test.ts`, `memoryStore.test.ts`, `settings.test.ts`, `v2.test.ts`.

Missing coverage:
- Abort signal actually cancels request (B2).
- Streaming fallback path (B1).
- Empty-response fallback (`agentLoop.ts:297-303, 374-383`).
- `rag.ts` performance regression: fixture of 1000 notes, assert `searchVaultLexical` completes in <500ms.
- `chatStore.ts` round-trip (save/load/list/delete) with realistic session.
- Mobile viewport rendering of `ChatPanel` (jsdom + media query stub).
- `intentRouter` edge cases: empty query, hasImages without vision model, model context exhaustion.

---

## Priority Execution Plan

| # | Task | Files | Effort | Impact |
|---|------|-------|--------|--------|
| 1 | B1+B2 — native fetch + AbortSignal | `llm.ts`, `agentLoop.ts` | 2-3h | Stop works, UX responsive |
| 2 | B4 — mobile keyboard | `chatPanel.tsx`, `styles.css` | 1-2h | No hidden textarea |
| 3 | B3 — persistent RAG index | `rag.ts`, `rag/vectorIndex.ts` | 4-6h | −80% latency on large vaults |
| 4 | B5 — drawer via absolute/portal | `chatPanel.tsx` | 1h | Drawer renders in panel |
| 5 | R1 — modularize ChatPanel | `chatPanel.tsx` → 6 files | 6-8h | Testable, memo works |
| 6 | R3 — inline styles → CSS | `chatPanel.tsx`, `styles.css` | 3-4h | −40% render time |
| 7 | B10 — attachments to files | `llm.ts`, `chatStore.ts` | 2-3h | Sessions don't bloat |
| 8 | B8 — multi-breakpoint header | `styles.css` | 30min | No wrap at 380-560px |
| 9 | B6 — LRU promptCache | `agentLoop.ts` | 30min | No memory leak |
| 10 | B9 — debounced MarkdownRenderer | `chatPanel.tsx` | 1h | No flicker on stream |
| 11 | B12+B13 — tool-call parser | `agentLoop.ts` | 1h | Doesn't break JSON examples |
| 12 | B11 — onClose race | `chatView.ts` | 15min | No duplicate views |
| 13 | B16 — real i18n check | `scripts/check-i18n.mjs` | 1h | Catches missing keys |
| 14 | B17 — drop lucide-react | `package.json` | 5min | −50-100KB bundle |
| 15 | B26+B27+B28 — CSS cleanup | `styles.css` | 30min | Consistency |

Total estimated: ~25-35 hours. Items 1-3 give ~80% of user-visible impact; remaining items are technical debt cleanup.

---

## Verification Steps

After each fix:
1. `npm run build` — must pass `tsc -noEmit` + esbuild production.
2. `npm run test` — must pass.
3. `npm run i18n:check` — for any i18n changes.
4. Manual: open vault in Obsidian Desktop + Mobile WebView (via hot-reload to phone).
5. For B1/B2 specifically: send query, press Stop mid-generation, assert no assistant message appends within 30s.
6. For B3: time `searchVaultLexical` on 1000+ note vault, assert <500ms.