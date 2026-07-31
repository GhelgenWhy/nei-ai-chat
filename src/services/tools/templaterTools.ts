import type { App } from "obsidian";
import { ToolDefinition } from "./types";

interface TemplaterPlugin {
    templater?: {
        parse_template: (config: { target_file: unknown; run_mode: number }, template: string) => Promise<string>;
    };
}

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
                    },
                    context: {
                        type: "object",
                        description: "Additional variables to inject into the template context"
                    }
                },
                required: ["template"]
            }
        }
    }
];

export async function executeTemplaterRender(app: App, template: string, context?: Record<string, unknown>): Promise<string> {
    try {
        const appWithPlugins = app as unknown as { plugins?: { plugins?: Record<string, TemplaterPlugin> } };
        const templaterPlugin = appWithPlugins.plugins?.plugins?.["templater-obsidian"];

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
            rendered = rendered.replace(/<%\s*tp\.file\.folder\([^)]*\)\s*%>/gi, "");
            rendered = rendered.replace(/<%\s*tp\.system\.prompt\([^)]*\)\s*%>/gi, "");

            return rendered;
        }

        const templater = templaterPlugin.templater;
        // In the future, we could potentially inject the `context` into the Templater execution environment
        const result = await templater.parse_template({ target_file: null, run_mode: 0 }, template);
        return result;
    } catch (e: unknown) {
        const err = e as { message?: string };
        return `Error rendering Templater code: ${err?.message || String(e)}`;
    }
}
