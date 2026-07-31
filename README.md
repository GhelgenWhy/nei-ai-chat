# NEI AI Chat

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-purple.svg)](https://obsidian.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![OpenRouter](https://img.shields.io/badge/OpenRouter-Compatible-blue.svg)](https://openrouter.ai)
[![i18n](https://img.shields.io/badge/i18n-9%20Languages-brightgreen.svg)](#-internationalization-i18n)

**NEI AI Assistant** is an autonomous, super-agentic AI executive assistant plugin for Obsidian. It transforms your vault into an interactive intelligence hub with deep vault control, function calling, OpenRouter models integration, Model Context Protocol (MCP) support, custom skills, and web browsing.

---

## ✨ Key Features / Ключевые Возможности

### 🌐 Internationalization (i18n) / Многоязычность
- **9 Supported Languages**: English, Russian (Русский), Spanish (Español), German (Deutsch), French (Français), Chinese (中文), Japanese (日本語), Portuguese (Português), Korean (한국어).
- **Auto-Detection**: Automatically adapts to your Obsidian interface language or can be set manually in settings.

### 🤖 Autonomous Agentic Loop
- Multi-step reasoning and tool execution loop (`(Prompt) ➔ (Tool Call) ➔ (Execute) ➔ (Feed Result) ➔ (Repeat)`).
- Automatic routing between **Quick Mode** (single-pass responses) and **Agent Mode** (deep multi-step tasks).

### 📂 Deep Vault Operations
- **Folder Analysis**: `get_folder_notes` to inspect and summarize entire folders (`tasks`, `Projects`, etc.).
- **File Lifecycle**: `create_note`, `edit_note`, `rename_note`, `delete_note`.
- **Search & Graph**: `search_notes`, `search_by_tag`, `get_all_tags` with full-text and tag graph analysis.

### 🔌 Model Context Protocol (MCP) & Custom Skills
- **MCP Integration**: Connect external MCP servers (GitHub, Postgres, Slack, HTTP SSE/Stdio) dynamically.
- **Persistent Memory**: Long-term memory saved in `.nei/memory.json`.
- **Custom Skills**: User-defined skills in `.nei/skills/<skill_name>/SKILL.md` (the AI can learn and create new skills for itself).

### 🌐 Web Browsing & Search
- DuckDuckGo live search integration.
- Direct web page scraping and raw GitHub README optimization.

### 📐 Premium UI & Multimodal Intelligence
- **Pinned Model Capabilities Bar**: Sticky top bar showing model modalities (`Text`, `Vision`, `Audio`, `Video`, `PDF`) and live token consumption (`Tokens: 1.2k/128k`).
- **Multimodal File Support**: Attach text files (`.txt, .md, .json, .js, .ts, .py, .css, .html, .csv, .yaml, .yml`), PDFs, images, and audio/video files with pre-send model compatibility validation.
- **Audio Voice Input**: Built-in 🎤 voice recording tool utilizing native `MediaRecorder` API for audio-capable models.
- **Jitter-Free Textarea**: Smooth auto-resizing input box with zero frame drops on large texts (50k+ characters).
- **Thread & Session Management**: Save, view, and clear chat sessions stored in `.nei/chats/`.

---

## 🛠️ Installation / Установка

### Manual Installation (Текущая установка)
1. Download the latest release files (`main.js`, `manifest.json`, `styles.css`).
2. Navigate to your Obsidian vault directory: `<your-vault>/.obsidian/plugins/`.
3. Create a folder named `nei-ai-chat`.
4. Copy `main.js`, `manifest.json`, and `styles.css` into `<your-vault>/.obsidian/plugins/nei-ai-chat/`.
5. Reload Obsidian (**Settings ➔ Community Plugins ➔ Installed Plugins**), and enable **NEI AI Chat**.

### Obsidian Community Plugins (Soon / Скоро)
1. Open Obsidian **Settings ➔ Community Plugins ➔ Turn on Community Plugins**.
2. Click **Browse** and search for `NEI AI Chat`.
3. Click **Install**, then **Enable**.

---

## ⚙️ Configuration / Настройка

1. Click the **⚙️ Settings** icon in the top header of the NEI AI Chat panel.
2. Select your preferred **Interface Language** (or leave on *Auto-detect*).
3. Enter your **OpenRouter API Key** (`sk-or-v1-...`).
4. Select your desired primary model (e.g. `google/gemini-2.5-flash`, `anthropic/claude-3.5-sonnet`, `openai/gpt-4o`, `deepseek/deepseek-chat`).
5. Click **🔄 Check API & Models** to verify model capabilities live.

---

## 🔒 Safety & Privacy / Безопасность и Приватность

- **Local Vault Storage**: All chat histories, memory, skills, and settings are saved locally inside your vault under the `.nei/` folder.
- **Secure Credentials**: API keys are stored strictly in local plugin data (`data.json`) and never transmitted anywhere except directly to OpenRouter API over encrypted HTTPS.
- **No Unsafe Execution**: Arbitrary system CLI command execution is disabled.

---

## 💡 Support, Feedback & Feature Requests / Поддержка и Предложения

We welcome feedback, suggestions, and feature requests!
- 🐛 **Issue Tracker**: [GitHub Issues](https://github.com/GhelgenWhy/nei-ai-chat/issues)
- 💬 **Discussions & Ideas**: Feel free to submit feature ideas or pull requests directly to the repository.

---

## 📄 License

Distributed under the [MIT License](LICENSE). Free for personal and commercial use.
