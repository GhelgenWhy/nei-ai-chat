import { App, requestUrl } from "obsidian";
import { ToolDefinition, ToolExecutor } from "./types";

export const systemToolDefinitions: ToolDefinition[] = [
    {
        type: "function",
        function: {
            name: "web_search",
            description: "Быстрый поиск информации в глобальной сети Интернет через DuckDuckGo.",
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
            description: "Скачивание и забор текста с веб-страницы по URL (авто-оптимизирован для GitHub репозиториев и чистого текста).",
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
            name: "analyze_github_repo",
            description: "Прямой оптимизированный забор информации о репозитории GitHub (README, файлы, описание).",
            parameters: {
                type: "object",
                properties: {
                    repoUrl: {
                        type: "string",
                        description: "Ссылка на репозиторий GitHub (например, 'https://github.com/GhelgenWhy/nei-ai-chat')"
                    }
                },
                required: ["repoUrl"]
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
                        description: "Терминальная команда для выполнения"
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
            while ((m = resultRegex.exec(html)) !== null && count < 5) {
                const rawUrl = m[1].trim();
                const snippet = m[2].replace(/<[^>]+>/g, "").trim();
                matches.push(`- **URL**: ${rawUrl}\n  **Snippet**: ${snippet}`);
                count++;
            }

            if (matches.length === 0) {
                return `Результаты поиска по '${args.query}' не содержит прямых ссылок. Использована веб-сводка.`;
            }

            return `Результаты поиска по '${args.query}':\n\n` + matches.join("\n\n");
        } catch (e: any) {
            return `Ошибка веб-поиска: ${e?.message || e}`;
        }
    },

    read_web_page: async (app: App, args: { url: string }) => {
        const urlStr = args.url.trim();

        // 1. GitHub Repository Auto-Optimization
        const githubRepoMatch = urlStr.match(/github\.com\/([^\/]+)\/([^\/]+)/i);
        if (githubRepoMatch) {
            const owner = githubRepoMatch[1];
            const repo = githubRepoMatch[2].replace(/\.git$/, "");
            try {
                // Try fetching raw README directly
                const rawReadmeUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`;
                const response = await requestUrl({ url: rawReadmeUrl, method: "GET" }).catch(() => 
                    requestUrl({ url: `https://raw.githubusercontent.com/${owner}/${repo}/master/README.md`, method: "GET" })
                );

                if (response.status === 200 && response.text) {
                    const text = response.text.length > 3000 ? response.text.substring(0, 3000) + "\n...[README обрезан для экономии токенов]" : response.text;
                    return `--- GitHub Репозиторий ${owner}/${repo} (README.md) ---\n${text}`;
                }
            } catch (e) {}
        }

        // 2. Generic Web Page Fetch
        try {
            const response = await requestUrl({
                url: urlStr,
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

            const truncated = text.length > 2500 ? text.substring(0, 2500) + "... [содержимое сжато]" : text;
            return `--- Веб-страница: ${urlStr} ---\n${truncated}`;
        } catch (e: any) {
            return `Ошибка чтения веб-страницы '${urlStr}': ${e?.message || e}`;
        }
    },

    analyze_github_repo: async (app: App, args: { repoUrl: string }) => {
        const githubRepoMatch = args.repoUrl.match(/github\.com\/([^\/]+)\/([^\s\/\)]+)/i);
        if (!githubRepoMatch) {
            return `Ошибка: Неверный формат ссылки на GitHub. Укажите 'https://github.com/owner/repo'`;
        }

        const owner = githubRepoMatch[1];
        const repo = githubRepoMatch[2].replace(/\.git$/, "").replace(/#.*$/, "");

        try {
            let repoMetaInfo = "";
            try {
                const metaRes = await requestUrl({
                    url: `https://api.github.com/repos/${owner}/${repo}`,
                    method: "GET",
                    headers: { "User-Agent": "NEI-Obsidian-Plugin" }
                });
                if (metaRes.status === 200 && metaRes.json) {
                    const j = metaRes.json;
                    repoMetaInfo = `Название: ${j.full_name || `${owner}/${repo}`}
Описание: ${j.description || 'Отсутствует'}
Основной язык: ${j.language || 'Не указан'}
Звёзды: ${j.stargazers_count || 0} | Форки: ${j.forks_count || 0}
Открытые issues: ${j.open_issues_count || 0}\n`;
                }
            } catch (e) {}

            let readmeText = "";
            const branches = ["main", "master"];
            const filenames = ["README.md", "readme.md", "Readme.md"];

            for (const branch of branches) {
                if (readmeText) break;
                for (const fname of filenames) {
                    try {
                        const res = await requestUrl({
                            url: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${fname}`,
                            method: "GET"
                        });
                        if (res.status === 200 && res.text) {
                            readmeText = res.text;
                            break;
                        }
                    } catch (e) {}
                }
            }

            const cleanReadme = readmeText 
                ? (readmeText.length > 12000 ? readmeText.substring(0, 12000) + "\n\n*(README обрезан по длине 12,000 символов)*" : readmeText)
                : "README.md не найден или пуст.";

            return `=== ИНФОРМАЦИЯ О GITHUB РЕПОЗИТОРИИ ${owner}/${repo} ===
URL: https://github.com/${owner}/${repo}
${repoMetaInfo}
--- ТЕКСТ README.md ---
${cleanReadme}`;
        } catch (e: any) {
            return `Ошибка получения информации о GitHub репозитории: ${e?.message || e}`;
        }
    },

    execute_terminal_command: async (app: App, args: { command: string }) => {
        return new Promise((resolve) => {
            try {
                const childProcess = require("child_process");
                const basePath = (app.vault.adapter as any).getBasePath ? (app.vault.adapter as any).getBasePath() : process.cwd();

                childProcess.exec(args.command, { cwd: basePath, timeout: 30000 }, (error: any, stdout: string, stderr: string) => {
                    if (error) {
                        resolve(`Ошибка выполнения команды (${error.code || "ERR"}):\n${stderr || error.message}`);
                    } else {
                        const output = stdout.trim() || stderr.trim() || "Команда выполнена (без вывода).";
                        const truncated = output.length > 2000 ? output.substring(0, 2000) + "... [вывод сжат]" : output;
                        resolve(`--- Вывод команды: ${args.command} ---\n${truncated}`);
                    }
                });
            } catch (e: any) {
                resolve(`Терминальное выполнение не поддерживается: ${e?.message || e}`);
            }
        });
    }
};
