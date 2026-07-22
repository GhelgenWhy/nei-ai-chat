import { App, TFile, TFolder, normalizePath } from "obsidian";
import { ToolDefinition, ToolExecutor } from "./types";

export const vaultToolDefinitions: ToolDefinition[] = [
    {
        type: "function",
        function: {
            name: "read_note",
            description: "Прочитать содержимое одной заметки из Obsidian по пути или названию файла.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "Путь к файлу или имя заметки (например, 'Tasks/Task1.md' или 'Task1')"
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
            description: "Пакетное чтение нескольких заметок за один вызов.",
            parameters: {
                type: "object",
                properties: {
                    paths: {
                        type: "array",
                        items: { type: "string" },
                        description: "Массив путей или названий файлов для чтения"
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
            description: "Получить список и содержимое всех заметок в указанной папке (например, 'tasks' или 'Projects'). Регистронезависимо.",
            parameters: {
                type: "object",
                properties: {
                    folderPath: {
                        type: "string",
                        description: "Название или путь к папке (например, 'tasks' или 'Tasks')"
                    },
                    includeContent: {
                        type: "boolean",
                        description: "Включать ли полный текст каждой заметки (по умолчанию true)"
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
            description: "Создать новую заметку в Ваулте Obsidian.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "Путь к файлу (например, 'Tasks/Summary.md')"
                    },
                    content: {
                        type: "string",
                        description: "Содержимое заметки в формате Markdown"
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
            description: "Редактировать существующую заметку в Ваулте Obsidian.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "Путь к редактируемой заметке"
                    },
                    newContent: {
                        type: "string",
                        description: "Новое содержимое заметки"
                    },
                    targetText: {
                        type: "string",
                        description: "Опционально: фрагмент текста для заменяемого блока"
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
            description: "Переименовать или переместить заметку в Ваулте.",
            parameters: {
                type: "object",
                properties: {
                    oldPath: {
                        type: "string",
                        description: "Текущий путь к заметке"
                    },
                    newPath: {
                        type: "string",
                        description: "Новый путь к заметке"
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
            description: "Удалить заметку из Ваулта Obsidian.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "Путь к удаляемой заметке"
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
            description: "Получить список файлов и папок в директории Ваулта (регистронезависимо).",
            parameters: {
                type: "object",
                properties: {
                    folderPath: {
                        type: "string",
                        description: "Путь к папке (оставьте пустым для корня ваулта '')"
                    },
                    recursive: {
                        type: "boolean",
                        description: "Искать ли вложенные папки рекурсивно"
                    }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "search_notes",
            description: "Поиск заметок по текстам, ключевым словам или именам.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "Поисковый запрос"
                    },
                    maxResults: {
                        type: "number",
                        description: "Максимальное число заметок"
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
            description: "Найти все заметки, содержащие определенный тег (например, '#task' или 'task').",
            parameters: {
                type: "object",
                properties: {
                    tag: {
                        type: "string",
                        description: "Название тега с символом # или без"
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
            description: "Получить список всех тегов, используемых в Ваулте Obsidian.",
            parameters: {
                type: "object",
                properties: {}
            }
        }
    },
    {
        type: "function",
        function: {
            name: "execute_obsidian_command",
            description: "Выполнить внутреннюю команду Obsidian по ID (например, 'app:open-vault-settings' или команды других плагинов).",
            parameters: {
                type: "object",
                properties: {
                    commandId: {
                        type: "string",
                        description: "Идентификатор команды Obsidian"
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
            description: "Анализ связей графа заметок ([[wikilinks]]) и поиск изолированных заметок.",
            parameters: {
                type: "object",
                properties: {
                    folderPath: {
                        type: "string",
                        description: "Область анализа"
                    }
                }
            }
        }
    }
];

function findFile(app: App, pathStr: string): TFile | null {
    if (!pathStr) return null;
    let cleanPath = normalizePath(pathStr);
    if (!cleanPath.endsWith(".md")) {
        cleanPath += ".md";
    }
    
    const file = app.vault.getAbstractFileByPath(cleanPath);
    if (file instanceof TFile) return file;

    // Fallback 1: Exact case-insensitive match
    const allFiles = app.vault.getMarkdownFiles();
    const matchedExactCase = allFiles.find(f => f.path.toLowerCase() === cleanPath.toLowerCase());
    if (matchedExactCase) return matchedExactCase;

    // Fallback 2: Search by basename
    const baseName = pathStr.replace(/\.md$/, "").split("/").pop()?.toLowerCase();
    if (baseName) {
        const matched = allFiles.find(f => f.basename.toLowerCase() === baseName);
        if (matched) return matched;
    }
    
    return null;
}

function findFolder(app: App, folderPathStr: string): TFolder | null {
    if (!folderPathStr || folderPathStr.trim() === "" || folderPathStr === "/") {
        return app.vault.getRoot();
    }
    const cleanPath = normalizePath(folderPathStr).toLowerCase();
    
    const root = app.vault.getRoot();
    if (root.path.toLowerCase() === cleanPath) return root;

    // Direct check
    const direct = app.vault.getAbstractFileByPath(normalizePath(folderPathStr));
    if (direct instanceof TFolder) return direct;

    // Case-insensitive search across all vault folders
    const allFolders: TFolder[] = [];
    const collectFolders = (folder: TFolder) => {
        allFolders.push(folder);
        for (const child of folder.children) {
            if (child instanceof TFolder) collectFolders(child);
        }
    };
    collectFolders(root);

    const matched = allFolders.find(f => 
        f.path.toLowerCase() === cleanPath || 
        f.name.toLowerCase() === cleanPath ||
        f.path.toLowerCase().endsWith("/" + cleanPath)
    );

    return matched || null;
}

export const vaultExecutors: Record<string, ToolExecutor> = {
    read_note: async (app: App, args: { path: string }) => {
        const file = findFile(app, args.path);
        if (!file) {
            return `Ошибка: Заметка '${args.path}' не найдена в Ваулте.`;
        }
        try {
            const content = await app.vault.read(file);
            return `--- Заметка: ${file.path} ---\n${content}`;
        } catch (e: any) {
            return `Ошибка чтения заметки '${args.path}': ${e?.message || e}`;
        }
    },

    read_notes_batch: async (app: App, args: { paths: string[] }) => {
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
                } catch (e: any) {
                    results.push(`=== ФАЙЛ: ${p} === (Ошибка чтения: ${e?.message})`);
                }
            } else {
                results.push(`=== ФАЙЛ: ${p} === (Файл не найден)`);
            }
        }
        return results.join("\n\n");
    },

    get_folder_notes: async (app: App, args: { folderPath: string; includeContent?: boolean }) => {
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
                } catch (e: any) {
                    output.push(`--- ЗАМЕТКА: ${file.path} (Ошибка чтения) ---\n`);
                }
            } else {
                output.push(`- 📄 ${file.path}`);
            }
        }

        return output.join("\n");
    },

    create_note: async (app: App, args: { path: string; content: string }) => {
        let path = normalizePath(args.path);
        if (!path.endsWith(".md")) path += ".md";

        const existing = app.vault.getAbstractFileByPath(path);
        if (existing) {
            return `Ошибка: Файл '${path}' уже существует. Используйте edit_note.`;
        }

        const folderParts = path.split("/");
        if (folderParts.length > 1) {
            folderParts.pop();
            const folderPath = folderParts.join("/");
            const folder = app.vault.getAbstractFileByPath(folderPath);
            if (!folder) {
                await app.vault.createFolder(folderPath);
            }
        }

        try {
            const created = await app.vault.create(path, args.content);
            return `Успех: Создана новая заметка '${created.path}'.`;
        } catch (e: any) {
            return `Ошибка создания заметки: ${e?.message || e}`;
        }
    },

    edit_note: async (app: App, args: { path: string; newContent: string; targetText?: string }) => {
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
        } catch (e: any) {
            return `Ошибка редактирования заметки '${args.path}': ${e?.message || e}`;
        }
    },

    rename_note: async (app: App, args: { oldPath: string; newPath: string }) => {
        const file = findFile(app, args.oldPath);
        if (!file) return `Ошибка: Файл '${args.oldPath}' не найден.`;

        let targetPath = normalizePath(args.newPath);
        if (!targetPath.endsWith(".md")) targetPath += ".md";

        try {
            await app.fileManager.renameFile(file, targetPath);
            return `Успешно переименован файл '${file.path}' -> '${targetPath}'.`;
        } catch (e: any) {
            return `Ошибка переименования: ${e?.message || e}`;
        }
    },

    delete_note: async (app: App, args: { path: string }) => {
        const file = findFile(app, args.path);
        if (!file) return `Ошибка: Файл '${args.path}' не найден.`;

        try {
            await app.vault.delete(file);
            return `Успешно удален файл '${file.path}'.`;
        } catch (e: any) {
            return `Ошибка удаления: ${e?.message || e}`;
        }
    },

    list_notes: async (app: App, args: { folderPath?: string; recursive?: boolean }) => {
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

    search_notes: async (app: App, args: { query: string; maxResults?: number }) => {
        const limit = args.maxResults || 10;
        const queryLower = args.query.toLowerCase();
        const files = app.vault.getMarkdownFiles();
        const results: { path: string; snippet: string }[] = [];

        for (const file of files) {
            if (results.length >= limit) break;

            const nameMatches = file.path.toLowerCase().includes(queryLower);
            const content = await app.vault.cachedRead(file);
            const contentMatches = content.toLowerCase().includes(queryLower);

            if (nameMatches || contentMatches) {
                let snippet = "";
                if (contentMatches) {
                    const idx = content.toLowerCase().indexOf(queryLower);
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

    search_by_tag: async (app: App, args: { tag: string }) => {
        const cleanTag = args.tag.startsWith("#") ? args.tag.toLowerCase() : "#" + args.tag.toLowerCase();
        const files = app.vault.getMarkdownFiles();
        const matched: string[] = [];

        for (const file of files) {
            const cache = app.metadataCache.getFileCache(file);
            const tagsInFile = (cache?.tags || []).map(t => t.tag.toLowerCase());
            const frontmatterTags = (cache?.frontmatter?.tags || []);
            const normalizedFmTags = Array.isArray(frontmatterTags) 
                ? frontmatterTags.map((t: string) => t.startsWith("#") ? t.toLowerCase() : "#" + t.toLowerCase())
                : [];

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

    execute_obsidian_command: async (app: App, args: { commandId: string }) => {
        try {
            const result = (app as any).commands?.executeCommandById(args.commandId);
            if (result !== false) {
                return `Успешно выполнена команда Obsidian '${args.commandId}'.`;
            } else {
                return `Команда '${args.commandId}' не вернула положительный результат (возможно не активна в данном контексте).`;
            }
        } catch (e: any) {
            return `Ошибка выполнения команды '${args.commandId}': ${e?.message || e}`;
        }
    },

    analyze_vault_graph: async (app: App, args: { folderPath?: string }) => {
        const files = app.vault.getMarkdownFiles();
        let orphanCount = 0;
        const totalFiles = files.length;
        const orphanFiles: string[] = [];

        const resolvedLinks = app.metadataCache.resolvedLinks;

        for (const file of files) {
            const outgoing = Object.keys(resolvedLinks[file.path] || {});
            let incomingCount = 0;
            for (const otherPath in resolvedLinks) {
                if (resolvedLinks[otherPath][file.path]) {
                    incomingCount++;
                }
            }

            if (outgoing.length === 0 && incomingCount === 0) {
                orphanCount++;
                if (orphanFiles.length < 15) {
                    orphanFiles.push(file.path);
                }
            }
        }

        return `Анализ графа Ваулта:
- Всего заметок: ${totalFiles}
- Изолированных заметок (без входящих и исходящих связей): ${orphanCount}
${orphanFiles.length > 0 ? `- Примеры изолированных заметок:\n  ${orphanFiles.join("\n  ")}` : ""}`;
    }
};
