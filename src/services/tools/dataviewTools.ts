import type { App } from "obsidian";
import { ToolDefinition } from "./types";

interface DataviewQueryResult {
    successful: boolean;
    error?: string;
    value?: {
        type: string;
        headers?: string[];
        values?: unknown[];
    };
}

interface DataviewPlugin {
    api?: {
        query: (q: string) => Promise<DataviewQueryResult>;
    };
}

export const dataviewToolDefinitions: ToolDefinition[] = [
    {
        type: "function",
        function: {
            name: "query_dataview",
            description: "Executes a Dataview Query (DQL) against the Obsidian vault and returns matching note metadata.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "DQL query string, e.g. 'LIST FROM \"folder\"' or 'TABLE file.mtime FROM #tag'"
                    },
                    limit: {
                        type: "number",
                        description: "Maximum results to return (default 50)"
                    }
                },
                required: ["query"]
            }
        }
    }
];

export async function executeDataviewQuery(app: App, query: string, limit: number = 50): Promise<string> {
    try {
        const appWithPlugins = app as unknown as { plugins?: { plugins?: Record<string, DataviewPlugin> } };
        const dataviewPlugin = appWithPlugins.plugins?.plugins?.dataview;
        if (!dataviewPlugin || !dataviewPlugin.api) {
            return "Dataview plugin is not installed or enabled in this vault.";
        }

        const api = dataviewPlugin.api;
        const result = await api.query(query);

        if (!result.successful || !result.value) {
            return `Dataview query error: ${result.error || "Unknown query failure"}`;
        }

        const value = result.value;
        let valuesArr = Array.isArray(value.values) ? value.values : [];
        
        const totalResults = valuesArr.length;
        if (valuesArr.length > limit) {
            valuesArr = valuesArr.slice(0, limit);
        }

        const summary = `Showing ${valuesArr.length} of ${totalResults} results.`;

        if (value.type === "list") {
            const lines = valuesArr.map((v: unknown) => {
                if (typeof v === "object" && v !== null && "path" in (v as Record<string, unknown>)) {
                    return `- ${String((v as Record<string, unknown>).path)}`;
                }
                return `- ${typeof v === "object" ? JSON.stringify(v) : String(v)}`;
            });
            return `Dataview List Results:\n${summary}\n\n${lines.join("\n")}`;
        }

        if (value.type === "table") {
            const headersArr = Array.isArray(value.headers) ? value.headers : [];
            const headers = headersArr.join(" | ");
            const rows = valuesArr.map((row: unknown) => {
                if (Array.isArray(row)) {
                    return row.map(cell => {
                        if (typeof cell === "object" && cell !== null && "path" in (cell as Record<string, unknown>)) {
                            return String((cell as Record<string, unknown>).path);
                        }
                        return typeof cell === "object" ? JSON.stringify(cell) : String(cell);
                    }).join(" | ");
                }
                return String(row);
            }).join("\n");

            return `Dataview Table Results:\n${summary}\n\n| ${headers} |\n| ${headersArr.map(() => "---").join(" | ")} |\n${rows}`;
        }

        return `Dataview Query Success:\n${summary}\n${JSON.stringify(value, null, 2)}`;
    } catch (e: unknown) {
        const err = e as { message?: string };
        return `Error executing Dataview query: ${err?.message || String(e)}`;
    }
}
