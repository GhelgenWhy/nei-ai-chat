import { App, TFile, TFolder, normalizePath } from "obsidian";
import { ToolDefinition, ToolExecutor, ToolExecutionResult } from "./types";
import { getNoteSavePath } from "../../utils/pathUtils";
import { NeiAiChatPlugin } from "../../../main";

export const vaultToolDefinitions: ToolDefinition[] = [
    {
        type: "function",
        function: {
            name: "read_note",
            description: "Прочитать содержимое заметки Markdown по её относительному пути или имени.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "Путь к файлу или имя заметки (например, 'folder/note.md' или 'note.md')"
                    }
                },
                required: ["path"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_notes_batch",
            description: "Пакетное чтение сразу нескольких заметок Ваулта за один вызов.",
            parameters: {
                type: "object",
                properties: {
                    paths: {
                        type: "string",
                        description: "Массив путей к заметкам"
                    }
                },
                required: ["paths"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_folder_notes",
            description: "Пакетно прочитать и проанализировать ВСЕ заметки в указанной папке. Отличный инструмент для обзора структур папок.",
            parameters: {
                type: "object",
                properties: {
                    folderPath: {
                        type: "string",
                        description: "Относительный путь к папке в ваулте (например, 'Folder/SubFolder' или пустая строка для корня)"
                    },
                    includeContent: {
                        type: "string",
                        description: "Включать ли полное содержимое каждой заметки (по умолчанию true)"
                    }
                },
                required: ["folderPath"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "create_note",
            description: "Создать новую заметку Markdown в ваулте с содержимым.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "Путь к создаваемой заметке (например, 'Folder/NewNote.md')"
                    },
                    content: {
                        type: "string",
                        description: "Текст заметки в формате Markdown"
                    }
                },
                required: ["path", "content"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "edit_note",
            description: "Редактировать существующую заметку (заменить всё содержимое или конкретную фрагментную строку).",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "Путь к заметке для редактирования"
                    },
                    newContent: {
                        type: "string",
                        description: "Новый текст для вставки"
                    },
                    targetText: {
                        type: "string",
                        description: "Необязательно. Если указано, будет заменен только этот точный фрагмент текста в заметке."
                    }
                },
                required: ["path", "newContent"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "rename_note",
            description: "Переименовать или переместить заметку в новую папку.",
            parameters: {
                type: "object",
                properties: {
                    oldPath: {
                        type: "string",
                        description: "Текущий путь к заметке"
                    },
                    newPath: {
                        type: "string",
                        description: "Новый путь/имя для заметки"
                    }
                },
                required: ["oldPath", "newPath"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "delete_note",
            description: "Поместить заметку в корзину (trash).",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "Путь к заметке"
                    }
                },
                required: ["path"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "list_notes",
            description: "Получить список файлов и подпапок в конкретной папке ваулта.",
            parameters: {
                type: "object",
                properties: {
                    folderPath: {
                        type: "string",
                        description: "Путь к папке (пустое значение для корня Ваулта)"
                    },
                    recursive: {
                        type: "string",
                        description: "Рекурсивный обход подпапок"
                    }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "search_notes",
            description: "Поиск по ключевым словам/тексту во всех заметках Ваулта.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "Поисковый запрос"
                    },
                    maxResults: {
                        type: "string",
                        description: "Максимальное количество результатов (по умолчанию 10)"
                    }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "search_by_tag",
            description: "Найти все заметки, содержащие конкретный тег.",
            parameters: {
                type: "object",
                properties: {
                    tag: {
                        type: "string",
                        description: "Тег для поиска (например, '#project' или 'study')"
                    }
                },
                required: ["tag"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_all_tags",
            description: "Получить список всех тегов ваулта с подсчетом заметок.",
            parameters: {
                type: "object",
                properties: {}
            }
        }
    },
    {
        type: "function",
        function: {
            name: "diff_note",
            description: "Предложить безопасное изменение заметки с интерактивным просмотром Diff перед применением.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "Путь к заметке"
                    },
                    newContent: {
                        type: "string",
                        description: "Предлагаемое новое содержимое заметки"
                    }
                },
                required: ["path", "newContent"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "execute_obsidian_command",
            description: "Выполнить любую внутреннюю команду Obsidian по её ID (например, 'theme:toggle-dark' или 'canvas:new-file').",
            parameters: {
                type: "object",
                properties: {
                    commandId: {
                        type: "string",
                        description: "ID команды Obsidian"
                    }
                },
                required: ["commandId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "analyze_vault_graph",
            description: "Analyze the vault link graph structure. Supports multiple analysis modes.",
            parameters: {
                type: "object",
                properties: {
                    mode: {
                        type: "string",
                        enum: ["overview", "isolated", "hubs", "note_context", "recommend_links"],
                        description: "Analysis mode: overview (stats), isolated (orphan notes), hubs (most-linked), note_context (links for a specific note), recommend_links (suggest connections)"
                    },
                    notePath: {
                        type: "string",
                        description: "For note_context mode: path to the note to analyze"
                    },
                    minLinks: {
                        type: "number",
                        description: "For hubs mode: minimum incoming links threshold (default 3)"
                    }
                },
                required: ["mode"]
            }
        }
    }
];

export function generateDateVariants(input: string): string[] {
    const variants: Set<string> = new Set([input.trim()]);

    const monthRuNames = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
    const monthEnNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    const monthEnShort = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

    let day: number | null = null;
    let month: number | null = null;
    let year: number | null = null;

    const lower = input.toLowerCase().trim();

    // 1. Check numeric pattern: 31.07.2026, 31-07-2026, 31/07/2026, 2026-07-31
    const numMatch = lower.match(/^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})$/);
    if (numMatch) {
        const p1 = parseInt(numMatch[1], 10);
        const p2 = parseInt(numMatch[2], 10);
        const p3 = parseInt(numMatch[3], 10);

        if (p1 > 1000) {
            year = p1;
            month = p2;
            day = p3;
        } else if (p3 > 1000) {
            year = p3;
            if (p1 <= 12 && p2 > 12) {
                month = p1;
                day = p2;
            } else {
                day = p1;
                month = p2;
            }
        }
    }

    // 2. Check text month pattern: "31 июля 2026", "July 31, 2026", "31 Jul 2026"
    if (!day || !month || !year) {
        for (let i = 0; i < 12; i++) {
            const ruName = monthRuNames[i];
            const enName = monthEnNames[i];
            const enShort = monthEnShort[i];

            if (lower.includes(ruName) || lower.includes(enName) || lower.includes(enShort)) {
                month = i + 1;
                const dMatch = lower.match(/\b(\d{1,2})\b/);
                const yMatch = lower.match(/\b(\d{4})\b/);
                if (dMatch) day = parseInt(dMatch[1], 10);
                if (yMatch) year = parseInt(yMatch[1], 10);
                break;
            }
        }
    }

    if (day && month && year) {
        const dd = String(day).padStart(2, '0');
        const mm = String(month).padStart(2, '0');
        const yyyy = String(year);

        variants.add(`${dd}.${mm}.${yyyy}`);
        variants.add(`${yyyy}-${mm}-${dd}`);
        variants.add(`${dd}-${mm}-${yyyy}`);
        variants.add(`${dd}/${mm}/${yyyy}`);
        variants.add(`${mm}/${dd}/${yyyy}`);

        const ruMonth = monthRuNames[month - 1];
        const enMonth = monthEnNames[month - 1];
        const enShort = monthEnShort[month - 1];

        variants.add(`${day} ${ruMonth} ${yyyy}`);
        variants.add(`${day} ${ruMonth} ${yyyy} г.`);
        variants.add(`${enMonth} ${day}, ${yyyy}`);
        variants.add(`${day} ${enShort} ${yyyy}`);
        variants.add(`${enShort} ${day}, ${yyyy}`);
    }

    return Array.from(variants);
}

function findFile(app: App, rawPath: string): TFile | null {
    const cleanPath = normalizePath(rawPath.trim());
    if (!cleanPath.endsWith(".md")) {
        const fileWithMd = app.vault.getAbstractFileByPath(cleanPath + ".md");
        if (fileWithMd instanceof TFile) return fileWithMd;
    }
    const exact = app.vault.getAbstractFileByPath(cleanPath);
    if (exact instanceof TFile) return exact;

    const files = app.vault.getMarkdownFiles();
    const cleanLower = cleanPath.toLowerCase();

    // Direct match
    let matched: TFile | null = files.find(f =>
        f.basename.toLowerCase() === cleanLower ||
        f.path.toLowerCase() === cleanLower ||
        f.path.toLowerCase().endsWith("/" + cleanLower)
    ) || null;
    if (matched) return matched;

    // Multi-strategy date variants match (FUNC-02)
    const dateVariants = generateDateVariants(cleanPath).map(v => v.toLowerCase());
    if (dateVariants.length > 1) {
        matched = files.find(f => {
            const baseLower = f.basename.toLowerCase();
            return dateVariants.some(variant => baseLower.includes(variant));
        }) || null;
    }

    return matched;
}

function findFolder(app: App, rawPath: string): TFolder | null {
    const cleanPath = normalizePath(rawPath.trim());
    if (!cleanPath || cleanPath === "/" || cleanPath === ".") {
        return app.vault.getRoot();
    }
    const folder = app.vault.getAbstractFileByPath(cleanPath);
    if (folder instanceof TFolder) return folder;

    const allFolders = app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder);
    const matched = allFolders.find(f => 
        f.name.toLowerCase() === cleanPath.toLowerCase() ||
        f.path.toLowerCase() === cleanPath.toLowerCase() ||
        f.path.toLowerCase().endsWith("/" + cleanPath.toLowerCase())
    );

    return matched || null;
}

export async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
    const cleanPath = normalizePath(folderPath.trim());
    if (!cleanPath || cleanPath === "." || cleanPath === "/") return;
    
    const parts = cleanPath.split("/").filter(Boolean);
    let currentPath = "";
    for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const folder = app.vault.getAbstractFileByPath(currentPath);
        if (!folder) {
            try {
                await app.vault.createFolder(currentPath);
            } catch {
                /* Folder might have been created concurrently */
            }
        }
    }
}

export const vaultExecutors: Record<string, ToolExecutor> = {
    read_note: async (app: App, rawArgs: Record<string, unknown>) => {
        const args = rawArgs as { path: string };
        const file = findFile(app, args.path);
        if (!file) {
            return `Ошибка: Заметка '${args.path}' не найдена в Ваулте.`;
        }
        try {
            const content = await app.vault.read(file);
            return `--- Заметка: ${file.path} ---\n${content}`;
        } catch (e: unknown) {
            const err = e as { message?: string };
            return `Ошибка чтения заметки '${args.path}': ${err?.message || String(e)}`;
        }
    },

    read_notes_batch: async (app: App, rawArgs: Record<string, unknown>) => {
        const args = rawArgs as { paths: string[] };
        if (!args.paths || args.paths.length === 0) {
            return "Ошибка: Не переданы пути для чтения.";
        }
        const results: string[] = [];
        for (const p of args.paths) {
            const file = findFile(app, p);
            if (file) {
                try {
                    const content = await app.vault.read(file);
                    results.push(`=== ФАЙЛ: ${file.path} ===\n${content}`);
                } catch (e: unknown) {
                    const err = e as { message?: string };
                    results.push(`=== ФАЙЛ: ${p} === (Ошибка чтения: ${err?.message || String(e)})`);
                }
            } else {
                results.push(`=== ФАЙЛ: ${p} === (Файл не найден)`);
            }
        }
        return results.join("\n\n");
    },

    get_folder_notes: async (app: App, rawArgs: Record<string, unknown>) => {
        const args = rawArgs as { folderPath: string; includeContent?: boolean };
        const folder = findFolder(app, args.folderPath);
        if (!folder) {
            return `Ошибка: Папка '${args.folderPath}' не найдена в Ваулте.`;
        }

        const includeContent = args.includeContent !== false;
        const markdownFiles: TFile[] = [];

        const collectFiles = (f: TFolder) => {
            for (const child of f.children) {
                if (child instanceof TFile && child.extension === "md") {
                    markdownFiles.push(child);
                } else if (child instanceof TFolder) {
                    collectFiles(child);
                }
            }
        };
        collectFiles(folder);

        if (markdownFiles.length === 0) {
            return `В папке '${folder.path}' не найдено ни одной Markdown-заметки.`;
        }

        const output: string[] = [`Найдено заметок в папке '${folder.path}': ${markdownFiles.length}\n`];

        for (const file of markdownFiles) {
            if (includeContent) {
                try {
                    const content = await app.vault.read(file);
                    output.push(`--- ЗАМЕТКА: ${file.path} ---\n${content}\n`);
                } catch {
                    output.push(`--- ЗАМЕТКА: ${file.path} (Ошибка чтения) ---\n`);
                }
            } else {
                output.push(`- 📄 ${file.path}`);
            }
        }

        return output.join("\n");
    },

    create_note: async (app: App, rawArgs: Record<string, unknown>, plugin: NeiAiChatPlugin) => {
        const args = rawArgs as { path: string; content: string };
        let path = getNoteSavePath(plugin.settings, args.path);

        // SECURITY: Path traversal protection
        const normalized = normalizePath(path);
        if (normalized.includes("..") || normalized.startsWith("/") || normalized.startsWith("\\")) {
            return "Ошибка: Недопустимый путь (path traversal защита)";
        }
        let finalPath = normalized;
        if (!finalPath.endsWith(".md")) finalPath += ".md";

        const existing = app.vault.getAbstractFileByPath(finalPath);
        if (existing) {
            return `Ошибка: Файл '${finalPath}' уже существует. Используйте edit_note.`;
        }

        const folderParts = finalPath.split("/");
        if (folderParts.length > 1) {
            folderParts.pop();
            const folderPath = folderParts.join("/");
            await ensureFolderExists(app, folderPath);
        }

        try {
            const created = await app.vault.create(finalPath, args.content);
            return `Успех: Создана новая заметка '${created.path}'.`;
        } catch (e: unknown) {
            const err = e as { message?: string };
            return `Ошибка создания заметки: ${err?.message || String(e)}`;
        }
    },

    edit_note: async (app: App, rawArgs: Record<string, unknown>) => {
        const args = rawArgs as { path: string; newContent: string; targetText?: string };
        const file = findFile(app, args.path);
        if (!file) {
            return `Ошибка: Файл '${args.path}' не найден.`;
        }

        try {
            const currentContent = await app.vault.read(file);
            let finalContent = args.newContent;

            if (args.targetText && currentContent.includes(args.targetText)) {
                finalContent = currentContent.replace(args.targetText, args.newContent);
            }

            await app.vault.modify(file, finalContent);
            return `Успешно обновлена заметка '${file.path}'.`;
        } catch (e: unknown) {
            const err = e as { message?: string };
            return `Ошибка редактирования заметки '${args.path}': ${err?.message || String(e)}`;
        }
    },

    rename_note: async (app: App, rawArgs: Record<string, unknown>) => {
        const args = rawArgs as { oldPath: string; newPath: string };
        const file = findFile(app, args.oldPath);
        if (!file) return `Ошибка: Файл '${args.oldPath}' не найден.`;

        let targetPath = normalizePath(args.newPath);
        if (!targetPath.endsWith(".md")) targetPath += ".md";

        try {
            await app.fileManager.renameFile(file, targetPath);
            return `Успешно переименован файл '${file.path}' -> '${targetPath}'.`;
        } catch (e: unknown) {
            const err = e as { message?: string };
            return `Ошибка переименования: ${err?.message || String(e)}`;
        }
    },

    delete_note: async (app: App, rawArgs: Record<string, unknown>) => {
        const args = rawArgs as { path: string };
        const file = findFile(app, args.path);
        if (!file) return `Ошибка: Файл '${args.path}' не найден.`;

        try {
            await app.fileManager.trashFile(file);
            return `Успешно помещен в корзину файл '${file.path}'.`;
        } catch (e: unknown) {
            const err = e as { message?: string };
            return `Ошибка удаления: ${err?.message || String(e)}`;
        }
    },

    list_notes: async (app: App, rawArgs: Record<string, unknown>) => {
        const args = rawArgs as { folderPath?: string; recursive?: boolean };
        const folder = findFolder(app, args.folderPath || "");
        if (!folder) {
            return `Ошибка: Папка '${args.folderPath}' не найдена.`;
        }

        const items: string[] = [];
        const collect = (f: TFolder, prefix = "") => {
            for (const child of f.children) {
                const isDir = child instanceof TFolder;
                items.push(`${prefix}- ${isDir ? "📁 Папка" : "📄 Файл"}: ${child.path}`);
                if (isDir && args.recursive) {
                    collect(child, prefix + "  ");
                }
            }
        };

        collect(folder);
        return `Содержимое папки '${folder.path}':\n` + items.join("\n");
    },

    search_notes: async (app: App, rawArgs: Record<string, unknown>) => {
        const args = rawArgs as { query: string; maxResults?: number };
        const limit = args.maxResults || 10;
        const queryLower = args.query.toLowerCase();
        const dateVariants = generateDateVariants(args.query).map(v => v.toLowerCase());
        const files = app.vault.getMarkdownFiles();
        const results: { path: string; snippet: string }[] = [];

        for (const file of files) {
            if (results.length >= limit) break;

            const filePathLower = file.path.toLowerCase();
            const nameMatches = filePathLower.includes(queryLower) || dateVariants.some(v => filePathLower.includes(v));
            const content = await app.vault.cachedRead(file);
            const contentLower = content.toLowerCase();
            const contentMatches = contentLower.includes(queryLower) || dateVariants.some(v => contentLower.includes(v));

            if (nameMatches || contentMatches) {
                let snippet = "";
                if (contentMatches) {
                    const matchTerm = dateVariants.find(v => contentLower.includes(v)) || queryLower;
                    const idx = contentLower.indexOf(matchTerm);
                    const start = Math.max(0, idx - 60);
                    const end = Math.min(content.length, idx + 100);
                    snippet = content.substring(start, end).replace(/\n/g, " ");
                } else {
                    snippet = content.substring(0, 120).replace(/\n/g, " ");
                }
                results.push({ path: file.path, snippet: `...${snippet}...` });
            }
        }

        if (results.length === 0) {
            return `По запросу '${args.query}' не найдено ни одной заметки.`;
        }

        return `Результаты поиска по '${args.query}':\n` +
            results.map(r => `- **${r.path}**: ${r.snippet}`).join("\n");
    },

    search_by_tag: async (app: App, rawArgs: Record<string, unknown>) => {
        const args = rawArgs as { tag: string };
        const cleanTag = args.tag.startsWith("#") ? args.tag.toLowerCase() : "#" + args.tag.toLowerCase();
        const files = app.vault.getMarkdownFiles();
        const matched: string[] = [];

        for (const file of files) {
            const cache = app.metadataCache.getFileCache(file);
            const tagsInFile = (cache?.tags || []).map(t => t.tag.toLowerCase());
            const frontmatterTags = (cache?.frontmatter?.tags || []) as string[] | string;
            const normalizedFmTags = Array.isArray(frontmatterTags) 
                ? frontmatterTags.map(t => t.startsWith("#") ? t.toLowerCase() : "#" + t.toLowerCase())
                : (typeof frontmatterTags === "string" ? [frontmatterTags.startsWith("#") ? frontmatterTags.toLowerCase() : "#" + frontmatterTags.toLowerCase()] : []);

            if (tagsInFile.includes(cleanTag) || normalizedFmTags.includes(cleanTag)) {
                matched.push(file.path);
            }
        }

        if (matched.length === 0) {
            return `Заметок с тегом '${cleanTag}' не найдено.`;
        }

        return `Заметки с тегом '${cleanTag}':\n` + matched.map(p => `- 📄 ${p}`).join("\n");
    },

    get_all_tags: async (app: App) => {
        const files = app.vault.getMarkdownFiles();
        const tagMap: Record<string, number> = {};

        for (const file of files) {
            const cache = app.metadataCache.getFileCache(file);
            const tagsInFile = (cache?.tags || []).map(t => t.tag);
            for (const t of tagsInFile) {
                tagMap[t] = (tagMap[t] || 0) + 1;
            }
        }

        const entries = Object.entries(tagMap).sort((a, b) => b[1] - a[1]);
        if (entries.length === 0) return "В Ваулте пока нет тегов.";

        return "Список тегов в Ваулте:\n" + entries.map(([tag, count]) => `- ${tag} (${count} заметок)`).join("\n");
    },

    diff_note: async (app: App, rawArgs: Record<string, unknown>): Promise<ToolExecutionResult> => {
        const args = rawArgs as { path: string; newContent: string };
        const file = findFile(app, args.path);
        let oldContent = "";
        if (file) {
            try {
                oldContent = await app.vault.read(file);
            } catch {
                /* ignore read error */
            }
        }

        return {
            toolCallId: "diff-" + Date.now(),
            name: "diff_note",
            result: `Запрошено подтверждение изменений для заметки '${args.path}'.`,
            requiresApproval: true,
            diffPreview: {
                filePath: file ? file.path : args.path,
                oldContent,
                newContent: args.newContent
            }
        };
    },

    execute_obsidian_command: async (app: App, rawArgs: Record<string, unknown>, plugin?: NeiAiChatPlugin) => {
        const args = rawArgs as { commandId: string };
        const commandId = args.commandId;

        // SECURITY: Whitelist check
        if (plugin?.settings?.confirmObsidianCommands) {
            const allowedCommands = plugin.settings.allowedObsidianCommands || [
                'editor:toggle-line-wrap',
                'theme:toggle-dark',
                'canvas:new-file',
                'workspace:new-tab',
                'app:reload'
            ];
            if (!allowedCommands.includes(commandId)) {
                return `Ошибка: Команда '${commandId}' не в whitelist. Добавьте ее в настройках или обратитесь к администратору.`;
            }
        }

        try {
            const appCommands = app as unknown as { commands?: { executeCommandById: (id: string) => boolean } };
            const result = appCommands.commands?.executeCommandById(commandId);
            if (result !== false) {
                return `Успешно выполнена команда Obsidian '${commandId}'.`;
            } else {
                return `Команда '${args.commandId}' не вернула положительный результат (возможно не активна в данном контексте).`;
            }
        } catch (e: unknown) {
            const err = e as { message?: string };
            return `Ошибка выполнения команды '${args.commandId}': ${err?.message || String(e)}`;
        }
    },

    analyze_vault_graph: async (app: App, rawArgs: Record<string, unknown>) => {
        const args = rawArgs as { mode: string; notePath?: string; minLinks?: number };
        const mode = args.mode || "overview";
        const files = app.vault.getMarkdownFiles();
        
        const resolvedLinks = app.metadataCache.resolvedLinks;
        
        // Count incoming links for all files
        const incomingLinksCount: Record<string, number> = {};
        const incomingLinksMap: Record<string, string[]> = {};
        for (const file of files) {
            incomingLinksCount[file.path] = 0;
            incomingLinksMap[file.path] = [];
        }

        for (const sourcePath in resolvedLinks) {
            const targets = resolvedLinks[sourcePath];
            for (const targetPath in targets) {
                if (incomingLinksCount[targetPath] !== undefined) {
                    incomingLinksCount[targetPath]++;
                    incomingLinksMap[targetPath].push(sourcePath);
                }
            }
        }

        if (mode === "overview") {
            let totalLinks = 0;
            let orphanCount = 0;

            for (const file of files) {
                const outgoing = Object.keys(resolvedLinks[file.path] || {});
                totalLinks += outgoing.length;
                
                if (outgoing.length === 0 && incomingLinksCount[file.path] === 0) {
                    orphanCount++;
                }
            }

            const avgLinks = files.length > 0 ? (totalLinks / files.length).toFixed(2) : "0";
            
            return `### Vault Graph Overview\n- **Total Notes**: ${files.length}\n- **Total Links**: ${totalLinks}\n- **Average Links/Note**: ${avgLinks}\n- **Isolated Notes (Orphans)**: ${orphanCount}`;
        }

        if (mode === "isolated") {
            const orphans: string[] = [];
            for (const file of files) {
                const outgoing = Object.keys(resolvedLinks[file.path] || {});
                if (outgoing.length === 0 && incomingLinksCount[file.path] === 0) {
                    orphans.push(file.path);
                }
            }
            
            const limit = 30;
            const shown = orphans.slice(0, limit);
            let report = `### Isolated Notes (${orphans.length} total)\nNotes with 0 incoming and 0 outgoing links.\n\n`;
            
            if (shown.length > 0) {
                report += shown.map(p => `- ${p}`).join("\n");
                if (orphans.length > limit) report += `\n...and ${orphans.length - limit} more.`;
            } else {
                report += "No isolated notes found!";
            }
            return report;
        }

        if (mode === "hubs") {
            const min = args.minLinks || 3;
            const hubs = files
                .map(f => ({ path: f.path, count: incomingLinksCount[f.path] }))
                .filter(item => item.count >= min)
                .sort((a, b) => b.count - a.count);
                
            const limit = 25;
            const shown = hubs.slice(0, limit);
            
            let report = `### Hub Notes (min. ${min} incoming links)\nFound ${hubs.length} hubs.\n\n`;
            if (shown.length > 0) {
                report += shown.map(h => `- **${h.path}**: ${h.count} links`).join("\n");
                if (hubs.length > limit) report += `\n...and ${hubs.length - limit} more.`;
            } else {
                report += "No hubs found matching the criteria.";
            }
            return report;
        }

        if (mode === "note_context") {
            if (!args.notePath) return "Error: notePath parameter is required for note_context mode.";
            
            // Allow loose matching
            const file = files.find(f => f.path.toLowerCase() === args.notePath?.toLowerCase() || f.path.toLowerCase().endsWith(`/${args.notePath?.toLowerCase()}`));
            if (!file) return `Error: Note '${args.notePath}' not found.`;
            
            const outgoing = Object.keys(resolvedLinks[file.path] || {});
            const incoming = incomingLinksMap[file.path] || [];
            
            let report = `### Link Context for: ${file.path}\n\n`;
            
            report += `**Outgoing Links (${outgoing.length}):**\n`;
            report += outgoing.slice(0, 15).map(p => `- ${p}`).join("\n") || "None";
            if (outgoing.length > 15) report += `\n...and ${outgoing.length - 15} more.`;
            
            report += `\n\n**Incoming Links (${incoming.length}):**\n`;
            report += incoming.slice(0, 15).map(p => `- ${p}`).join("\n") || "None";
            if (incoming.length > 15) report += `\n...and ${incoming.length - 15} more.`;
            
            return report;
        }

        if (mode === "recommend_links") {
            // Find notes that share tags but aren't linked
            const fileTags: Record<string, string[]> = {};
            for (const file of files) {
                const cache = app.metadataCache.getFileCache(file);
                const tagsInFile = (cache?.tags || []).map(t => t.tag.toLowerCase());
                const fmTags = cache?.frontmatter?.tags || [];
                const normFmTags = Array.isArray(fmTags) ? fmTags : [fmTags];
                const allTags = new Set([...tagsInFile, ...normFmTags.map(t => String(t).startsWith('#') ? String(t).toLowerCase() : `#${String(t).toLowerCase()}`)]);
                fileTags[file.path] = Array.from(allTags);
            }
            
            const recommendations: { f1: string, f2: string, commonTags: string[] }[] = [];
            
            // Very naive approach: limit search to avoid freezing
            const sampleSize = Math.min(files.length, 200);
            for (let i = 0; i < sampleSize; i++) {
                const f1 = files[i].path;
                const tags1 = fileTags[f1];
                if (!tags1 || tags1.length === 0) continue;
                
                for (let j = i + 1; j < sampleSize; j++) {
                    const f2 = files[j].path;
                    const tags2 = fileTags[f2];
                    if (!tags2 || tags2.length === 0) continue;
                    
                    const common = tags1.filter(t => tags2.includes(t));
                    if (common.length > 0) {
                        const isLinked = resolvedLinks[f1]?.[f2] || resolvedLinks[f2]?.[f1];
                        if (!isLinked) {
                            recommendations.push({ f1, f2, commonTags: common });
                        }
                    }
                }
            }
            
            // Sort by number of common tags
            recommendations.sort((a, b) => b.commonTags.length - a.commonTags.length);
            
            const limit = 15;
            const shown = recommendations.slice(0, limit);
            
            let report = `### Link Recommendations\nBased on shared tags between unlinked notes (from a sample of recent notes).\n\n`;
            if (shown.length > 0) {
                report += shown.map(r => `- **${r.f1}** & **${r.f2}** (Shared: ${r.commonTags.join(", ")})`).join("\n");
            } else {
                report += "No obvious tag-based recommendations found.";
            }
            
            return report;
        }

        return `Error: Unknown mode '${mode}'`;
    }
};
