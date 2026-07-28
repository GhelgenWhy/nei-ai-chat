import type { App } from "obsidian";
import { ToolDefinition } from "./types";

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
                    }
                },
                required: ["query"]
            }
        }
    }
];

export async function executeDataviewQuery(app: App, query: string): Promise<string> {
    try {
        const dataviewPlugin = (app as any).plugins?.plugins?.dataview;
        if (!dataviewPlugin || !dataviewPlugin.api) {
            return "Dataview plugin is not installed or enabled in this vault.";
        }

        const api = dataviewPlugin.api;
        const result = await api.query(query);

        if (!result.successful) {
            return `Dataview query error: ${result.error}`;
        }

        const value = result.value;
        if (value.type === "list") {
            return `Dataview List Results (${value.values.length}):\n` + value.values.map((v: any) => `- ${typeof v === 'object' ? (v.path || JSON.stringify(v)) : String(v)}`).join("\n");
        }
        if (value.type === "table") {
            const headers = value.headers.join(" | ");
            const rows = value.values.map((row: any[]) => row.map(cell => typeof cell === 'object' ? (cell?.path || JSON.stringify(cell)) : String(cell)).join(" | ")).join("\n");
            return `Dataview Table Results:\n| ${headers} |\n| ${value.headers.map(() => "---").join(" | ")} |\n${rows}`;
        }

        return `Dataview Query Success:\n${JSON.stringify(value, null, 2)}`;
    } catch (e: any) {
        return `Error executing Dataview query: ${e?.message || String(e)}`;
    }
}
