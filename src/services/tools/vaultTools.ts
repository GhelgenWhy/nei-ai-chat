import { App, TFile, TFolder, normalizePath } from "obsidian";
import { ToolDefinition, ToolExecutor, ToolExecutionResult } from "./types";

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
                        description: "Путь к файлу или имя заметки (например, 'tasks/task1.md' или 'task1')"
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
            description: "Пакетно прочитать и проанализировать ВСЕ заметки в указанной папке (например, 'tasks' или 'Projects'). Отличный инструмент для выжимок и обзора проектов.",
            parameters: {
                type: "object",
                properties: {
                    folderPath: {
                        type: "string",
                        description: "Относительный путь к папке в ваулте (например, 'tasks' или 'Notes/Study')"
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
            description: "Проанализировать граф связей Ваулта: найти изолированные заметки (без входящих/исходящих ссылок), наименее и наиболее связанные заметки.",
            parameters: {
                type: "object",
                properties: {
                    folderPath: {
                        type: "string",
                        description: "Необязательно. Ограничить анализ конкретной папкой."
                    }
                }
            }
        }
    }
];

function findFile(app: App, rawPath: string): TFile | null {
    let cleanPath = normalizePath(rawPath.trim());
    if (!cleanPath.endsWith(".md")) {
        const fileWithMd = app.vault.getFileByPath(cleanPath + ".md");
        if (fileWithMd) return fileWithMd;
    }
    const exact = app.vault.getFileByPath(cleanPath);
    if (exact) return exact;

    const files = app.vault.getMarkdownFiles();
    const cleanLower = cleanPath.toLowerCase();

    const matched = files.find(f => 
        f.basename.toLowerCase() === cleanLower || 
        f.path.toLowerCase() === cleanLower ||
        f.path.toLowerCase().endsWith("/" + cleanLower)
    );

    return matched || null;
}

function findFolder(app: App, rawPath: string): TFolder | null {
    let cleanPath = normalizePath(rawPath.trim());
    if (!cleanPath || cleanPath === "/" || cleanPath === ".") {
        return app.vault.getRoot();
    }
    const folder = app.vault.getFolderByPath(cleanPath);
    if (folder) return folder;

    const allFolders = app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder);
    const matched = allFolders.find(f => 
        f.name.toLowerCase() === cleanPath.toLowerCase() ||
        f.path.toLowerCase() === cleanPath.toLowerCase() ||
        f.path.toLowerCase().endsWith("/" + cleanPath.toLowerCase())
    );

    return matched || null;
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
                } catch (e: unknown) {
                    output.push(`--- ЗАМЕТКА: ${file.path} (Ошибка чтения) ---\n`);
                }
            } else {
                output.push(`- 📄 ${file.path}`);
            }
        }

        return output.join("\n");
    },

    create_note: async (app: App, rawArgs: Record<string, unknown>) => {
        const args = rawArgs as { path: string; content: string };
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
            } catch (e: unknown) {
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

    execute_obsidian_command: async (app: App, rawArgs: Record<string, unknown>) => {
        const args = rawArgs as { commandId: string };
        try {
            const appCommands = app as unknown as { commands?: { executeCommandById: (id: string) => boolean } };
            const result = appCommands.commands?.executeCommandById(args.commandId);
            if (result !== false) {
                return `Успешно выполнена команда Obsidian '${args.commandId}'.`;
            } else {
                return `Команда '${args.commandId}' не вернула положительный результат (возможно не активна в данном контексте).`;
            }
        } catch (e: unknown) {
            const err = e as { message?: string };
            return `Ошибка выполнения команды '${args.commandId}': ${err?.message || String(e)}`;
        }
    },

    analyze_vault_graph: async (app: App, rawArgs: Record<string, unknown>) => {
        const args = rawArgs as { folderPath?: string };
        const files = app.vault.getMarkdownFiles();
        let orphanCount = 0;
        const totalFiles = files.length;
        const orphanFiles: string[] = [];

        const resolvedLinks = app.metadataCache.resolvedLinks;

        for (const file of files) {
            if (args.folderPath && !file.path.startsWith(args.folderPath)) continue;

            const outgoing = Object.keys(resolvedLinks[file.path] || {});
            let incomingCount = 0;

            for (const otherFile of files) {
                if (otherFile.path === file.path) continue;
                const links = resolvedLinks[otherFile.path] || {};
                if (links[file.path]) {
                    incomingCount++;
                }
            }

            if (outgoing.length === 0 && incomingCount === 0) {
                orphanCount++;
                orphanFiles.push(file.path);
            }
        }

        let report = `=== АНАЛИЗ ГРАФА СВЯЗЕЙ ВАУЛТА ===\n`;
        report += `Всего проанализировано заметок: ${totalFiles}\n`;
        report += `Изолированных заметок (Orphans, без входящих и исходящих ссылок): ${orphanCount}\n\n`;

        if (orphanFiles.length > 0) {
            report += `Список изолированных заметок (первые 15):\n`;
            report += orphanFiles.slice(0, 15).map(p => `- 📄 ${p}`).join("\n");
            if (orphanFiles.length > 15) {
                report += `\n...и ещё ${orphanFiles.length - 15} заметок.`;
            }
        } else {
            report += `Все заметки в Ваулте связаны ссылками! Отличная структура базы знаний.`;
        }

        return report;
    }
};
