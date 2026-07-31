# Changelog

All notable changes to **NEI AI Chat** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
