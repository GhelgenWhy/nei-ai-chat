import { App, requestUrl } from "obsidian";
import { ToolDefinition, ToolExecutor } from "./types";

export const systemToolDefinitions: ToolDefinition[] = [
    {
        type: "function",
        function: {
            name: "web_search",
            description: "Выполняет поиск в Интернете через DuckDuckGo (HTML) и возвращает краткие сниппеты с прямыми ссылками.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "Поисковый запрос на русском или английском языке (например, 'Obsidian API plugin docs' или 'Python 3.12 release notes')"
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
            description: "Скачивает текстовое содержимое произвольной веб-страницы или GitHub README по URL.",
            parameters: {
                type: "object",
                properties: {
                    url: {
                        type: "string",
                        description: "Полная ссылка на веб-страницу (например, 'https://github.com/GhelgenWhy/nei-ai-chat')"
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
            description: "Специализированный инструмент для мгновенного сбора полной информации о репозитории GitHub (звёзды, описание, открытые issues, полная выжимка README.md).",
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
    }
];

export const systemExecutors: Record<string, ToolExecutor> = {
    web_search: async (_app: App, rawArgs: Record<string, unknown>) => {
        const args = rawArgs as { query: string };
        try {
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`;
            const response = await requestUrl({
                url: searchUrl,
                method: "GET",
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            }) as unknown as { status: number; text: string };

            const html = response.text;
            const matches: string[] = [];
            const resultRegex = /<a class="result__url" href="([^"]+)".*?>[\s\S]*?<a class="result__snippet".*?>([\s\S]*?)<\/a>/g;
            
            let m: RegExpExecArray | null;
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
        } catch (e: unknown) {
            const err = e as { message?: string };
            return `Ошибка веб-поиска: ${err?.message || String(e)}`;
        }
    },

    read_web_page: async (_app: App, rawArgs: Record<string, unknown>) => {
        const args = rawArgs as { url: string };
        const urlStr = args.url.trim();

        // 1. GitHub Repository Auto-Optimization
        const githubRepoMatch = urlStr.match(/github\.com\/([^/]+)\/([^/]+)/i);
        if (githubRepoMatch) {
            const owner = githubRepoMatch[1];
            const repo = githubRepoMatch[2].replace(/\.git$/, "");
            try {
                // Try fetching raw README directly
                const rawReadmeUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`;
                const response = await (requestUrl({ url: rawReadmeUrl, method: "GET" }) as Promise<unknown> as Promise<{ status: number; text: string }>).catch(() => 
                    requestUrl({ url: `https://raw.githubusercontent.com/${owner}/${repo}/master/README.md`, method: "GET" }) as unknown as Promise<{ status: number; text: string }>
                );

                if (response.status === 200 && response.text) {
                    const text = response.text.length > 3000 ? response.text.substring(0, 3000) + "\n...[README обрезан для экономии токенов]" : response.text;
                    return `--- GitHub Репозиторий ${owner}/${repo} (README.md) ---\n${text}`;
                }
            } catch {
                /* ignore raw readme error */
            }
        }

        // 2. Generic Web Page Fetch
        try {
            const response = await requestUrl({
                url: urlStr,
                method: "GET",
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            }) as unknown as { status: number; text: string };

            let text = response.text;
            text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
            text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
            text = text.replace(/<[^>]+>/g, " ");
            text = text.replace(/\s+/g, " ").trim();

            const truncated = text.length > 2500 ? text.substring(0, 2500) + "... [содержимое сжато]" : text;
            return `--- Веб-страница: ${urlStr} ---\n${truncated}`;
        } catch (e: unknown) {
            const err = e as { message?: string };
            return `Ошибка чтения веб-страницы '${urlStr}': ${err?.message || String(e)}`;
        }
    },

    analyze_github_repo: async (_app: App, rawArgs: Record<string, unknown>) => {
        const args = rawArgs as { repoUrl: string };
        const githubRepoMatch = args.repoUrl.match(/github\.com\/([^/]+)\/([^\s/)]+)/i);
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
                }) as unknown as { status: number; json: Record<string, unknown> };
                if (metaRes.status === 200 && metaRes.json) {
                    const j = metaRes.json as {
                        full_name?: string;
                        description?: string;
                        language?: string;
                        stargazers_count?: number;
                        forks_count?: number;
                        open_issues_count?: number;
                    };
                    repoMetaInfo = `Название: ${j.full_name || `${owner}/${repo}`}
Описание: ${j.description || 'Отсутствует'}
Основной язык: ${j.language || 'Не указан'}
Звёзды: ${j.stargazers_count || 0} | Форки: ${j.forks_count || 0}
Открытые issues: ${j.open_issues_count || 0}\n`;
                }
            } catch {
                /* ignore meta error */
            }

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
                        }) as unknown as { status: number; text: string };
                        if (res.status === 200 && res.text) {
                            readmeText = res.text;
                            break;
                        }
                    } catch {
                        /* ignore branch fetch error */
                    }
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
        } catch (e: unknown) {
            const err = e as { message?: string };
            return `Ошибка получения информации о GitHub репозитории: ${err?.message || String(e)}`;
        }
    }
};
