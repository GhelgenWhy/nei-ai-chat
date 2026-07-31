# NEI AI Chat — Release Checklist (v1.0.0)

## 🎨 UI / UX
- [x] **UI-01**: Freshness indicator (Knowledge Cutoff date) moved to Model Settings Modal.
- [x] **UI-02**: Textarea jitter on input fixed using direct `target.style.height` calculation with `requestAnimationFrame` debouncing.
- [x] **UI-03**: Redesigned header bar into logical control groups (`[Model Picker] | [History / New Chat] | [Mode / Tab / Settings]`).
- [x] **UI-04**: Pinned sticky Model Capabilities + Token Bar added directly under header bar.
- [x] **UI-05**: Flag/emoji indicators removed from language selector options, using native language names.
- [x] **UI-06**: Smooth textarea resizing with no frame drops on 50k+ input strings.
- [x] **UI-07**: Added ARIA labels and tooltips to all interactive elements.

## ⚙️ Functionality
- [x] **FUNC-01**: Support for text file attachments (`.txt, .md, .json, .js, .ts, .py, .css, .html, .csv, .yaml, .yml`) with configurable 500 KB limit.
- [x] **FUNC-02**: Audio recording button 🎤 and MediaRecorder integration for audio-capable models.
- [x] **FUNC-03**: Video attachment handling for video-capable models.
- [x] **FUNC-04**: PDF document text extraction and context injection.
- [x] **FUNC-05**: Pre-send Capability Mismatch Warning Modal when attaching unsupported modalities.

## ⚡ Optimization & Code Quality
- [x] **OPT-01**: Bundle verified < 500 KB gzip (320 KB gzipped).
- [x] **OPT-02**: React.memo applied to `ChatMessage`, `ReasoningPanel`, `WelcomeScreen`, `ModelCapabilityBar`.
- [x] **OPT-04**: `tsc --noEmit` returns 0 compilation errors under `strict: true`.

## 🧪 Testing & Verification
- [x] **TEST-01**: `npx vitest run` passes 100% of unit tests (21 tests across 4 test suites).
- [x] **TEST-03**: Settings migration (v0 -> v1) implemented in `loadSettings`.
- [x] **TEST-04**: `npm run i18n:check` script verifies 528 translation keys.

## 🚀 Release Prep
- [x] **REL-01**: Release checklist verified.
- [x] **REL-02**: `CHANGELOG.md` updated for v1.0.0.
- [x] **REL-03**: `README.md` updated with release instructions.
