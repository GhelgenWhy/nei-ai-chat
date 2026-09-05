# Changelog

All notable changes to **NEI AI Chat** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-09-06

### Fixed — Mobile layout (the big one)
- **Runtime chrome-inset system** (`src/utils/obsidianChrome.ts`): the input area now measures Obsidian's own UI that floats over plugin views — desktop floating status bar, mobile navbar pill, mobile toolbar, Android system navigation area — instead of guessing static paddings. Fixed on real devices with data from the companion `nei-layout-inspector` plugin.
- **Keyboard handling reworked**: Capacitor Keyboard bridge (authoritative on MIUI-style non-resizing webviews), `keyboardDidShow` preferred over inflated `keyboardWillShow`, sanity clamp (55% of viewport), -35px calibration trim, partial-cooperative cancellation.
- **Overlap rules**: chrome must be a bottom-half strip (full-screen backdrops no longer collapse the panel), bottom-quarter reach (floating pills hovering above the bottom edge are counted), system-gap memory when the navbar auto-hides, keyboard vs chrome take-max (never summed).
- **vitest alias fixed**: 4 test suites could not even load before.

### Fixed — Harness & transport
- **Real streaming + working Stop button**: native `fetch` with AbortSignal replaces `requestUrl` (which silently buffered everything); SSE parser with line buffering, reasoning and streamed tool_calls; partial answers are saved on Stop.
- **Settings actually apply without reopening the panel** (stale props snapshot bug).
- **Agent steps are saved to sessions** (were always empty).
- **Tool-call fallback parser hardened**: explicit signature + registry validation — JSON examples in answers no longer execute tools.
- **Confirmation queue** for parallel tool calls (no more agent hangs), auto-note-writing removed.
- **Models without tool calling** fall back to quick mode instead of provider 400s.
- **One RAG search per message** (was two full-vault scans), tokenization cache by mtime, candidate-only tokenization.
- **LRU system-prompt cache** with content-hash keys (was length-keyed with cross-talk).

### Changed
- RAG/session/mobile subsystems documented in `PROJECT-AUDIT.md` with a full roadmap.

### Removed
- **Voice recording (🎤 MediaRecorder)**: the recording button and `AudioRecorder` component are cut (planned deprecation). Audio *files* can still be attached via 📎.
- **Capability bar** no longer overflows on narrow panels; attach chips and message actions moved to CSS classes.
- Session writes debounced (1.5 s) with flush on close; message stable ids; pricing from the OpenRouter API (cost dashboard is real now); image attachments downscaled to 1280px.

## [1.0.0] - 2026-07-31

### Added
- **Pinned Model Capabilities Bar**: Sticky bar showing active model modalities (Text, Vision, Audio, Video, PDF) and real-time context token usage (`Tokens: 1.2k/128k`).
- **Multimodal File Attachments**: Added support for text files (`.txt, .md, .json, .js, .ts, .py, .css, .html, .csv, .yaml, .yml`) and PDFs with a configurable 500 KB attachment size limit.
- **Audio Recording Button**: Built-in 🎤 audio recording control using standard `MediaRecorder` API for models with audio support.
- **Model Capability Validation Modal**: Pre-send mismatch warning prompting users before sending unsupported media formats to text-only models.
- **Automated i18n & Settings Migration Tests**: Integrated `scripts/check-i18n.mjs` validator and unit tests covering settings migration (v0 -> v1).

### Changed
- **Redesigned Header Bar**: Reorganized top controls into clean logical groups (`[Model Picker] | [History & New Chat] | [Execution Mode / Tab Mode / Settings]`).
- **Knowledge Cutoff Indicator**: Relocated model freshness / knowledge cutoff date from header to the Model Configuration Modal.
- **Language Selector**: Removed emojis and flag symbols from language selector options in favor of clean native names (`English`, `Русский`, `Deutsch`, etc.).

### Fixed
- **Textarea Input Jitter**: Replaced invalid `setCssStyles` call with direct `target.style.height` calculation and `requestAnimationFrame` debouncing to eliminate visual height jumps and input freezes on large strings.
- **Strict TypeScript & React Memoization**: Resolved all compiler warnings and wrapped heavy components (`ReasoningPanel`, `WelcomeScreen`, `ModelCapabilityBar`) in `React.memo` for smooth re-rendering.
