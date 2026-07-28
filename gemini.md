# Instructions for AI Assistant (Gemini / Antigravity) — NEI AI Chat Obsidian Plugin

## Core Objective
This plugin (`NEI AI Chat`) is an **open-source Obsidian community plugin** intended for use by a broad audience of users with completely different vault structures, workflows, operating systems, languages, and settings.

**Strict Principle**: NO user-specific hardcoding, NO rigid assumptions about vault folders, and NO magic paths tied to a single user's environment.

---

## 1. Zero Hardcoding Guidelines
1. **Vault Folders & Files**:
   - Never hardcode folder names (such as `tasks`, `Tasks`, `Notes`, `Projects`, `Inbox`) in source code, default settings, UI handlers, or AI prompts.
   - When creating notes from UI (e.g., "Save response as note"), respect Obsidian's user configuration or allow configurable folder paths in plugin settings with fallbacks to the vault root `/`.
   - If a folder path does not exist when creating a file, ALWAYS check and recursively create parent folders before calling `app.vault.create()`.

2. **System Prompts & Tool Descriptions**:
   - Tool descriptions in `vaultTools.ts` or agent prompts must use neutral, generic examples (e.g., `'folder/note.md'`, `'FolderName'`), never implying that specific folders like `tasks` exist by default.

3. **Error Handling & Fallbacks**:
   - Gracefully handle non-existent folders or files without crashing or failing silently.
   - Inform the user via Obsidian `Notice` if an action fails and explain how to resolve it (or auto-create missing folders safely).

---

## 2. Obsidian API Best Practices
- **File & Folder Operations**: Always use standard Obsidian API calls (`app.vault.getAbstractFileByPath`, `app.vault.createFolder`, `app.vault.create`, `normalizePath`).
- **Parent Directory Guarantee**: Before creating any file at `path/to/file.md`, extract `path/to` and verify that the target directory exists. If not, create it using `app.vault.createFolder()`.
- **Settings**: Keep all user preferences customizable via `NeiAiChatSettings` with sensible, universal defaults.

---

## 3. Code Standards & Architecture
- **i18n (Internationalization)**: Support UI strings in multi-language translations (`translations.ts`).
- **Modularity**: Maintain clean separation between UI components (`src/components`), Services (`src/services`), Tools (`src/services/tools`), and Views (`src/views`).
- **Testing & Verification**: Ensure `npm run build` (esbuild) runs cleanly without TypeScript errors after any modification.
