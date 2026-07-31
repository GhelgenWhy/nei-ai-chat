# CODING AGENT PROMPT — NEI AI Chat Obsidian Plugin

## Project Context
**NEI AI Chat** is an advanced Obsidian Community Plugin providing agentic AI capabilities integrated into the vault. Currently transitioning from private to public release. The codebase is TypeScript + React, bundled with esbuild, using Obsidian API.

**Tech Stack:**
- TypeScript (strict: true), React 18, esbuild
- Obsidian API (vault, workspace, metadataCache, requestUrl)
- OpenRouter / Ollama / Custom providers
- i18n: 9 languages (EN, RU, ES, DE, FR, ZH, JA, PT, KO)
- Testing: Vitest (unit), Playwright (E2E) - needs setup
- Key files: `main.ts` (plugin entry), `src/components/ChatPanel.tsx` (main UI), `src/services/` (business logic)

---

## SYSTEM PROMPT FOR CODING AGENT

You are an expert **TypeScript/React/Obsidian Plugin Engineer** specializing in:
- High-performance UI (textarea auto-resize, virtual scrolling, sticky layouts)
- Obsidian plugin architecture (vault API, settings, views, commands)
- LLM integration (OpenRouter, streaming, tool calling, multimodal)
- Agentic systems (intent routing, RAG, memory, MCP)
- Bundle optimization (esbuild, tree-shaking, code splitting)
- Accessibility (ARIA, keyboard nav, focus management)
- Internationalization (i18n with translation keys)

**Your directives:**
1. **Zero Hardcoding** — All paths/folders configurable via settings, fallback to Obsidian conventions
2. **Model Efficiency** — Minimize tokens, precise tool calls, smart context pruning
3. **Obsidian API Excellence** — `ensureFolderExists`, `normalizePath`, proper error boundaries, `Notice` for user feedback
4. **Premium UX** — Fixed header/input, isolated message scroll, no layout shift, responsive design
5. **Clean Architecture** — Separation: `components/` (UI), `services/` (logic), `views/` (Obsidian integration), `utils/` (helpers)
6. **Type Safety** — Strict TS, no `any`, proper generics, discriminated unions
7. **Testing** — Unit (Vitest) + E2E (Playwright) for critical paths

---

## TASKS TO IMPLEMENT

### 🎨 UI/UX — Interface (Priority: Critical/High)

#### UI-01: Simplify Header to Two Bars (REDESIGN)
**Current (ChatPanel.tsx:617-708):** Cluttered header with: History drawer button (📂), New Chat (➕ New), Move Tab, Freshness indicator, Cost Dashboard (💰 tokens), Mode Select, Settings (⚙️)

**Target — Two clean bars only:**

**Bar 1 — Functional Controls (top):**
```
[📂 Chat Title ▼]  [➕ New Chat]  [⚡ Auto / 🚀 Quick / 🧠 Agent]  [↗️ Tab / ↙️ Sidebar]  [⚙️ Settings]
```
- Chat selector shows **actual session title** (not "folder (N)") — use `currentSession.title`
- New Chat button: **only emoji** `➕` (no "+" text)
- Mode selector: compact dropdown with icons
- Move to tab/sidebar: single toggle button with icon
- Settings: gear icon only

**Bar 2 — Model Info & Context (sticky, under Bar 1):**
```
[Model: google/gemini-2.5-flash]  •  🟢 Text  •  🟡 Vision  •  🔴 Audio  •  🔴 Video  •  📄 PDF  •  Context: 12.4k / 128k tokens
```
- `position: sticky; top: 44px; z-index: 10;` (below Bar 1)
- Icons **only for supported modalities** (from `activeModelDetails.supportsVision`, `supportsTools`, custom capabilities)
- Token counter: `used / max` from context window (`activeModelDetails.contextLength`)
- Compact: height ~28px, font-size 11px, monospace for tokens

**Removed entirely:**
- ❌ Cost Dashboard (API spending, prompt/completion tokens, request count)
- ❌ Freshness indicator (🔒/🌐 + cutoff) — moved to Model Settings modal
- ❌ Model picker from header — only in Settings modal

**Files:** `ChatPanel.tsx` (header section), `styles.css` (new bar styles)

#### UI-02: Fix Textarea "Jitter" on Input (CRITICAL)
**Problem:** `textarea` height calculation uses `setCssStyles` which doesn't exist on HTMLElement; height jumps per character
**Current:** ChatPanel.tsx:1423-1428
```tsx
target.setCssStyles({ height: `${Math.min(target.scrollHeight, 280)}px` });
```
**Fix:** Use `target.style.height = ...` with `requestAnimationFrame` debounce. Reset height to `auto` then set to `scrollHeight`. No layout shift on Enter/Backspace.
**Acceptance:** Instant collapse after send; smooth resize on backspace/delete; no visual glitches.

#### UI-03: Remove Emoji from Language Selector
**Current:** Lines 846-855 — flags/emoji (🌐) in `<option>` values
**Target:** Native names only: `English`, `Русский`, `Deutsch`, `Español`, `Français`, `中文`, `日本語`, `한국어`, `Português`
**Files:** `ChatPanel.tsx` language `<select>`, `translations.ts` (update `autoDetect`, language labels)

#### UI-04: Textarea Performance >10k chars (CRITICAL)
**Current:** Direct `scrollHeight` on every keystroke causes freezes
**Fix:** Debounce with `requestAnimationFrame`; cache `textContent` + `scrollHeight`; consider `textContent` measurement instead of `value` for large text
**Acceptance:** No frame drops on paste/typing 50k+ chars

#### UI-05: Update Tooltips for All Interactive Elements
**Current:** Mix of `title` prop and custom `Tooltip` component
**Target:** Every button/input has:
- `title` with action + hotkey (e.g., "New Chat (Ctrl+N)")
- `aria-describedby` for complex tooltips
- Tooltip language = current UI language
- Use existing `Tooltip` component consistently
**Files:** `ChatPanel.tsx`, `Tooltip.tsx`, `translations.ts` (add tooltip keys)

---

### ⚙️ Functionality — Core Fixes & Intelligence

#### FUNC-01: Fix Settings Import (CRITICAL)
**Current:** `handleExportSettings` works (ChatPanel.tsx:402-418), but `handleImportSettings` (420-433) doesn't apply settings — just merges into local state without calling `saveSettings` properly or updating all React state variables.

**Root Cause:** Import merges into `settings` object but doesn't update the 30+ individual `useState` hooks (language, model, folders, weights, etc.)

**Fix:**
1. Add `settingsVersion` to `NeiAiChatSettings` in `main.ts`
2. Export includes version
3. Import: parse → validate schema → migrate if needed → call `saveSettings(newSettings)` → **force full React re-render** (key prop on ChatPanel or reset all useState)
4. Show success notice with applied changes summary

**Files:** `main.ts` (settingsVersion), `ChatPanel.tsx` (handleImportSettings, add key prop to ChatPanelInner)

#### FUNC-02: Smart Daily Note Detection (INTELLIGENCE UPGRADE)
**Problem:** Agent searches for "31 июля 2026" but note is "31.07.2026" — fails. User should NOT configure date formats.

**Solution — Multi-strategy Search in Vault Tools:**
1. **In `search_notes` / `get_folder_notes` / `list_notes`:** When query looks like a date (regex: `\d{1,2}[./-]\d{1,2}[./-]\d{2,4}` or month name), generate **all common variants**:
   - `31.07.2026`, `31/07/2026`, `31-07-2026`, `2026-07-31`, `31 июля 2026`, `31 июля 2026 г.`, `July 31, 2026`, `31 Jul 2026`
2. **Fuzzy matching:** Levenshtein distance on filenames (threshold ≤ 2)
3. **Metadata fallback:** Check `ctime`/`mtime` of notes in daily folder (configurable via `dailyNotesFolder` setting, default: auto-detect from Obsidian core plugin)
4. **No hardcoded formats** — agent tries all reasonable variants automatically

**Files:** `src/services/tools/vaultTools.ts` (search_notes, get_folder_notes, list_notes), `main.ts` (optional dailyNotesFolder setting)

#### FUNC-03: Upgrade Agent Intelligence & Model Effectiveness
**Goal:** Make models significantly smarter at task execution through better prompting, context management, and tool orchestration.

**Specific Improvements:**

1. **System Prompt Overhaul (agentLoop.ts:getSystemPrompt):**
   - Add explicit **reasoning framework**: "Think step by step. Before each tool call, state: WHY this tool, WHAT you expect, HOW it advances the goal."
   - Add **failure recovery patterns**: "If tool fails, try alternative approach. If search returns nothing, broaden query. If note not found, try date variants."
   - Add **token budget awareness**: "Context window: {N} tokens. Prioritize recent + relevant. Summarize old history."

2. **Context Pruning (contextManager.ts):**
   - Current: `pruneHistory(chatHistory, 6)` — too aggressive
   - New: **Semantic pruning** — keep last 3 turns + any turn with tool calls + turns referenced by current query (via embeddings similarity)
   - Implement `ContextManager.pruneHistorySmart(history, query, maxTokens, modelContextLength)`

3. **Tool Call Validation & Retry:**
   - Before tool execution: validate args schema (already have JSON schema in ToolDefinition)
   - On tool error: auto-retry with corrected args (max 2 retries) using LLM to fix
   - Track tool success rates per session, adapt tool selection

4. **Parallel Tool Execution:**
   - When multiple independent tools needed (e.g., search_notes + web_search), batch them in single turn
   - Modify `agentLoop.ts` to collect all tool_calls from response, execute in `Promise.all`, feed results together

5. **Model-Specific Prompt Tuning:**
   - In `modelRegistry.ts`, add `promptStyle` per model: `structured` (Claude), `concise` (Gemini), `verbose` (GPT-4)
   - Adjust system prompt formatting accordingly

**Files:** `src/services/agent/agentLoop.ts`, `src/services/agent/contextManager.ts`, `src/services/modelRegistry.ts`, `src/services/tools/toolRegistry.ts`

#### FUNC-04: Smarter Mode Selection Algorithm (Auto/Quick/Agent)
**Current:** `intentRouter.ts` uses weighted scoring with hardcoded patterns. Issues: doesn't consider model capabilities, context length, or task complexity well.

**New Algorithm — Multi-factor Decision:**
```
Score = Σ(weights × features) + ModelCapabilityBonus + ContextPressure + UserPreference
```

**Factors:**
1. **Attachments** (weight: 5.0) → Agent
2. **Vault keywords** (2.0) → Agent
3. **Creation/Deletion patterns** (3.0/4.0) → Agent
4. **Analysis/Search patterns** (2.5/1.5) → Agent
5. **Question patterns** (-1.5) → Quick
6. **Code patterns** (-1.0) → Quick
7. **Query length** (0.005/char) → Agent if long
8. **History bias** (0.3 × recent agent turns) → Agent
9. **Stale query** (3.0) → Agent (if model supports web)
10. **Model capabilities:** If model lacks tools/vision → bias toward Quick
11. **Context pressure:** If history near context limit → Quick (avoid overflow)
12. **User preference:** Learn from manual overrides (store in memory)

**Implementation:**
- Move weights to settings (already there)
- Add `modelCapabilityBonus` in `computeScore()`: +2 if model has tools+vision, -1 if text-only
- Add `contextPressure` factor: `historyTokens / modelContextLength > 0.7` → -2
- Track manual mode switches in `MemoryStore` → adjust threshold per user
- Expose `IntentRouter.explainDecision(query, features)` for debug UI

**Files:** `src/services/agent/intentRouter.ts`, `src/services/memory/memoryStore.ts`

---

### ⚡ Optimization & Code Quality

#### OPT-01: Bundle Audit (esbuild)
**Target:**
- `npm run build && npx esbuild --analyze` → gzip < 500 KB (no vendors)
- Remove `moment.js`, full `lodash` — use tree-shaken imports or native alternatives
- Check for duplicate code, unused exports
**Files:** `esbuild.config.mjs`, `package.json`, all source files

#### OPT-02: Memoization (React.memo, useMemo, useCallback)
**Target:** No re-renders of chat list when settings/sidebar change
- `React.memo` for `ChatMessage`, `ReasoningPanel`, `WelcomeScreen`
- `useMemo` for derived state (filtered sessions, formatted tokens)
- `useCallback` for event handlers passed to children
- Verify with React DevTools Profiler

#### OPT-03: Lazy-Load Heavy Features
**Target:** Dynamic `import()` for:
- PDF.js (`pdfjs-dist`) → separate chunk
- ffmpeg.wasm → separate chunk
- Whisper.cpp (if added) → separate chunk
- OpenRouter model fetch (already cached, but ensure not in initial bundle)
**Files:** `ChatPanel.tsx` (lazy imports), `esbuild.config.mjs` (code splitting config)

#### OPT-04: Strict TypeScript
**Current:** `strict: true` in tsconfig but likely `any` in code
**Target:** `tsc --noEmit` → 0 errors; `eslint` → 0 warnings
- Replace `any` with proper types
- Fix implicit `any` in callbacks
- Strict null checks
**Files:** All `.ts`/`.tsx` files

---

### 🧪 Testing & QA

#### TEST-01: Automated Tests (Vitest + Playwright)
**Target:** `npm run test:ci` → 100% pass; Coverage ≥ 80% for core modules
- Unit: `intentRouter`, `cost utils`, `embeddings`, `rag`, `modelRegistry`, `chatStore`, `vaultTools` (date variants)
- E2E: Chat flow, settings save/load/import, model switching, file attachment, daily note search
**Files:** `tests/*.test.ts`, `vitest.config.ts`, `playwright.config.ts`, `package.json` scripts

#### TEST-02: Mobile Manual Testing (iOS Safari / Android Chrome)
**Checklist:**
- Text send, photo/file attach, voice input, scroll, virtual keyboard, orientation change, PWA offline
- 0 critical bugs, ≤ 2 minor
**Deliverable:** Test report markdown

#### TEST-03: Settings Export/Import (JSON) — Already covered in FUNC-01

#### TEST-04: i18n Validation
**Target:** `npm run i18n:check` script → no missing keys
- Visual test: switch EN/RU/DE/ES/ZH/JA/KO → no raw keys in UI
- RTL not required
**Files:** `package.json` (script), `translations.ts` (complete all languages), check script

---

### 🚀 Release Prep

#### REL-01: Release Checklist
**Target:** All items in `release-checklist.md` ✅

#### REL-02: CHANGELOG.md (Keep a Changelog)
**Target:** Version `1.0.0` with sections: Added, Changed, Fixed, Removed, Security

#### REL-03: README.md Update
**Target:** Badges, screenshots (light/dark/mobile), LiveSync instructions, FAQ

#### REL-04: Versioning & GitHub Release
**Target:** `npm version minor` → git tag `v1.0.0` → push → GitHub Release with `main.js`, `styles.css`, `manifest.json`

#### REL-05: Submit to Obsidian Community Plugins
**Target:** PR to `obsidian-releases` → CI green → `obsidian-bot` approval → merge → listed in catalog

---

## KEY FILES TO MODIFY (Reference)

| Area | Files |
|------|-------|
| Main UI (Header, Bars, Textarea) | `src/components/ChatPanel.tsx`, `styles.css` |
| Settings & Config | `main.ts`, `src/components/ChatPanel.tsx` (config modal) |
| Translations | `src/i18n/translations.ts` |
| LLM/API | `src/services/llm.ts`, `src/services/openrouter.ts`, `src/services/modelRegistry.ts` |
| Agent Logic (Loop, Context, Intent) | `src/services/agent/agentLoop.ts`, `src/services/agent/contextManager.ts`, `src/services/agent/intentRouter.ts` |
| Tools (Vault search, date handling) | `src/services/tools/vaultTools.ts`, `src/services/tools/toolRegistry.ts` |
| RAG/Memory | `src/services/rag/*.ts`, `src/services/memory/*.ts` |
| Tests | `tests/`, `vitest.config.ts`, `playwright.config.ts` |
| Build | `esbuild.config.mjs`, `package.json`, `tsconfig.json` |

---

## ACCEPTANCE CRITERIA SUMMARY

| ID | Must Pass |
|----|-----------|
| UI-01 | Two bars only; chat title visible; no cost dashboard; no model picker in header; new chat = ➕ only |
| UI-02 | Textarea zero-jitter, instant collapse, smooth backspace |
| UI-04 | No frame drops on 50k+ char paste/typing |
| FUNC-01 | Settings import works on clean profile; all 30+ settings applied; version migration |
| FUNC-02 | Agent finds "31.07.2026" when asked "31 июля 2026" without config |
| FUNC-03 | Measurable improvement: fewer tool errors, better context use, parallel execution |
| FUNC-04 | Auto mode picks correctly in 90%+ test cases; explains decision |
| OPT-01 | Bundle gzip < 500KB, no moment/lodash full |
| OPT-04 | `tsc --noEmit` = 0 errors |
| TEST-01 | `npm run test:ci` = 100% pass, coverage ≥ 80% |
| REL-05 | PR opened to obsidian-releases |

---

## WORKFLOW INSTRUCTIONS

1. **Start with Critical UI** (UI-01, UI-02) — visual foundation & UX blockers
2. **Then Core Functionality** (FUNC-01, FUNC-02) — import fix + intelligence upgrade
3. **Then Agent Intelligence** (FUNC-03, FUNC-04) — system prompt, context, mode selection
4. **Then Polish UI** (UI-03, UI-04, UI-05) — language, perf, tooltips
5. **Then Optimization** (OPT-01 through OPT-04) — code quality
6. **Then Testing** (TEST-01 through TEST-04) — verification
7. **Finally Release** (REL-01 through REL-05) — delivery

**Each task:**
- Write implementation
- Run `npm run build` — must compile clean
- Run `npm run test` — must pass
- Verify manually in Obsidian (dev vault)
- Commit with conventional message: `feat(ui): simplify header to two bars (UI-01)`

**Do NOT:**
- Hardcode paths (`/Users/...`, `C:\...`, `.nei/` without settings)
- Use `any` type
- Add dependencies without tree-shaking verification
- Break existing functionality (chat, agent, RAG, tools)
- Leave console.log/debugger in production code
- Add user-facing config for things the agent should handle automatically (e.g., date formats)

---

## ENVIRONMENT SETUP FOR AGENT

```bash
cd /d/Projects/NEI-ai-chat
npm install
npm run dev          # Watch mode with vault sync
npm run build        # Production build
npm run test         # Vitest
```

**Obsidian Dev Vault:** Set `OBSIDIAN_VAULT_PATH` env var or use default in `esbuild.config.mjs:16`

---

## KEY ARCHITECTURAL DECISIONS

1. **No Date Format Setting** — Agent handles all variants internally (FUNC-02)
2. **Two-Bar Header** — Fixed layout, no scrolling bars (UI-01)
3. **Settings Import = Full Reset** — Use React `key` prop on ChatPanel to force remount (FUNC-01)
4. **Parallel Tool Execution** — Batch independent calls in agent loop (FUNC-03)
5. **Semantic Context Pruning** — Embeddings-based history retention (FUNC-03)
6. **Learnable Mode Selection** — Track manual overrides in memory (FUNC-04)

---

**Deliverable:** Working implementation for all tasks above, verified by build + tests + manual QA, ready for `v1.0.0` release.