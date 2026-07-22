# NEI AI Assistant — Super-Agentic AI Plugin for Obsidian 🤖🧠

**NEI AI Assistant** is an autonomous, super-agentic AI executive assistant plugin for Obsidian. It transforms your vault into an interactive intelligence hub with deep vault control, function calling, OpenRouter models integration, Model Context Protocol (MCP) support, custom skills, web browsing, and local terminal execution.

---

## ✨ Features

- **🤖 Autonomous Agentic Execution Loop**: Multi-step reasoning and tool execution loop (`(Prompt) -> (Tool Call) -> (Execute) -> (Feed Result) -> (Repeat)`).
- **📂 Deep Vault Operations**:
  - `get_folder_notes`: Batch read and analyze all notes in any folder (`tasks`, `Projects`, etc.).
  - `create_note` / `edit_note` / `rename_note` / `delete_note`: Complete file lifecycle management.
  - `search_notes` / `search_by_tag` / `get_all_tags`: Full-text, tag-based, and wikilink graph analysis.
- **🌐 Web Browsing & Search**: Search DuckDuckGo and fetch/convert web pages to clean Markdown on demand.
- **⚡ Local Terminal Execution**: Run CLI/PowerShell commands on your PC directly from Obsidian (with desktop Node.js bridge).
- **🧠 Memory & Skills System**:
  - Long-term memory stored in `.nei/memory.json`.
  - Custom rules in `.nei/AGENTS.md`.
  - User-defined skills in `.nei/skills/<skill_name>/SKILL.md` (AI can learn and write new skills for itself!).
- **🔌 Model Context Protocol (MCP)**: Connect external MCP servers (GitHub, Postgres, Slack, HTTP SSE/Stdio) dynamically.
- **💬 Chat Sessions & History**: Full conversation history saved in `.nei/chats/` with thread switching, new chats, and deletion.
- **🎯 OpenRouter Models Integration**:
  - Dynamically add and remove any model ID from OpenRouter.
  - Live capability verification (Tool calling support, context window size, pricing) via OpenRouter API.

---

## 🛠️ Installation

### Manual Installation
1. Download the latest release (`main.js`, `manifest.json`, `styles.css`).
2. Create a folder in your vault: `<your-vault>/.obsidian/plugins/nei-ai-chat/`.
3. Move `main.js`, `manifest.json`, and `styles.css` into that folder.
4. Reload Obsidian, go to **Settings -> Community Plugins**, and enable **NEI AI Chat**.

---

## ⚙️ Configuration

1. Click the **⚙️ Settings** icon in the NEI AI Chat sidebar panel.
2. Enter your **OpenRouter API Key** (`sk-or-v1-...`).
3. Add or select your desired model (e.g. `anthropic/claude-3.5-sonnet`, `google/gemini-2.5-pro`, `openai/gpt-4o`).
4. Click **🔄 Check API** to verify model capabilities live.

---

## 🔒 Privacy & Security

- All chat histories, memory, skills, and settings are saved locally inside your vault under the `.nei/` folder.
- API keys are stored securely in local plugin data (`data.json`) and never transmitted anywhere except directly to OpenRouter API over HTTPS.

---

## 📄 License

[MIT License](LICENSE) — free for personal and commercial use.
