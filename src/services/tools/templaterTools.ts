import type { App } from "obsidian";
import { ToolDefinition } from "./types";

export const templaterToolDefinitions: ToolDefinition[] = [
    {
        type: "function",
        function: {
            name: "render_templater",
            description: "Evaluates and renders Templater template tags (<% tp... %>) in a text snippet.",
            parameters: {
                type: "object",
                properties: {
                    template: {
                        type: "string",
                        description: "Text snippet containing Templater code, e.g. '<% tp.date.now(\"YYYY-MM-DD\") %>'"
                    }
                },
                required: ["template"]
            }
        }
    }
];

export async function executeTemplaterRender(app: App, template: string): Promise<string> {
    try {
        const templaterPlugin = (app as any).plugins?.plugins?.["templater-obsidian"];
        if (!templaterPlugin || !templaterPlugin.templater) {
            // Fallback lightweight regex evaluation for simple date tags
            let rendered = template;
            const now = new Date();
            const todayStr = now.toISOString().slice(0, 10);
            const timeStr = now.toTimeString().slice(0, 8);

            rendered = rendered.replace(/<%\s*tp\.date\.now\([^)]*\)\s*%>/gi, todayStr);
            rendered = rendered.replace(/<%\s*tp\.file\.title\s*%>/gi, "Untitled");
            rendered = rendered.replace(/<%\s*tp\.file\.creation_date\([^)]*\)\s*%>/gi, todayStr);
            rendered = rendered.replace(/<%\s*tp\.file\.last_modified_date\([^)]*\)\s*%>/gi, `${todayStr} ${timeStr}`);

            return rendered;
        }

        const templater = templaterPlugin.templater;
        const result = await templater.parse_template({ target_file: null, run_mode: 0 }, template);
        return result;
    } catch (e: any) {
        return `Error rendering Templater code: ${e?.message || String(e)}`;
    }
}
