import { App, requestUrl } from "obsidian";
import { ToolDefinition, ToolExecutor } from "./types";

export const systemToolDefinitions: ToolDefinition[] = [
    {
        type: "function",
        function: {
            name: "web_search",
            description: "Поиск актуальной информации в глобальной сети Интернет через DuckDuckGo.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "Поисковый запрос"
                    }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_web_page",
            description: "Скачивание содержимого любой веб-страницы по URL и конвертация в чистый текст.",
            parameters: {
                type: "object",
                properties: {
                    url: {
                        type: "string",
                        description: "Ссылка на веб-страницу (HTTP/HTTPS)"
                    }
                },
                required: ["url"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "execute_terminal_command",
            description: "Выполнить консольную терминальную команду в операционной системе (PowerShell / Command Prompt / Bash).",
            parameters: {
                type: "object",
                properties: {
                    command: {
                        type: "string",
                        description: "Терминальная команда для выполнения (например, 'dir', 'git status', 'python script.py')"
                    }
                },
                required: ["command"]
            }
        }
    }
];

export const systemExecutors: Record<string, ToolExecutor> = {
    web_search: async (app: App, args: { query: string }) => {
        try {
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`;
            const response = await requestUrl({
                url: searchUrl,
                method: "GET",
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            });

            const html = response.text;
            const matches: string[] = [];
            const resultRegex = /<a class="result__url" href="([^"]+)".*?>[\s\S]*?<a class="result__snippet".*?>([\s\S]*?)<\/a>/g;
            
            let m;
            let count = 0;
            while ((m = resultRegex.exec(html)) !== null && count < 6) {
                const rawUrl = m[1].trim();
                const snippet = m[2].replace(/<[^>]+>/g, "").trim();
                matches.push(`- **URL**: ${rawUrl}\n  **Snippet**: ${snippet}`);
                count++;
            }

            if (matches.length === 0) {
                return `Поисковый ответ получен, но не удалось отпарсить ссылки для '${args.query}'. Попробуйте прямой забор страницы через read_web_page.`;
            }

            return `Результаты поиска по '${args.query}':\n\n` + matches.join("\n\n");
        } catch (e: any) {
            return `Ошибка веб-поиска: ${e?.message || e}`;
        }
    },

    read_web_page: async (app: App, args: { url: string }) => {
        try {
            const response = await requestUrl({
                url: args.url,
                method: "GET",
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            });

            let text = response.text;
            text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
            text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
            text = text.replace(/<[^>]+>/g, " ");
            text = text.replace(/\s+/g, " ").trim();

            const truncated = text.length > 5000 ? text.substring(0, 5000) + "... [содержимое обрезано]" : text;
            return `--- Веб-страница: ${args.url} ---\n${truncated}`;
        } catch (e: any) {
            return `Ошибка чтения веб-страницы '${args.url}': ${e?.message || e}`;
        }
    },

    execute_terminal_command: async (app: App, args: { command: string }) => {
        return new Promise((resolve) => {
            try {
                // Check Node environment inside Obsidian Desktop (Electron)
                const childProcess = require("child_process");
                const basePath = (app.vault.adapter as any).getBasePath ? (app.vault.adapter as any).getBasePath() : process.cwd();

                console.log(`[NEI Terminal] Выполнение команды '${args.command}' в директории '${basePath}'`);

                childProcess.exec(args.command, { cwd: basePath, timeout: 30000 }, (error: any, stdout: string, stderr: string) => {
                    if (error) {
                        resolve(`Ошибка выполнения терминальной команды (${error.code || "ERR"}):\n${stderr || error.message}`);
                    } else {
                        const output = stdout.trim() || stderr.trim() || "Команда выполнена успешно (без вывода).";
                        resolve(`--- Вывод команды: ${args.command} ---\n${output}`);
                    }
                });
            } catch (e: any) {
                resolve(`Терминальное выполнение не поддерживается в данной среде (например, мобильный Obsidian): ${e?.message || e}`);
            }
        });
    }
};
