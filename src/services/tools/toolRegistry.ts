import { App } from "obsidian";
import { ToolDefinition, ToolExecutor, ToolExecutionResult } from "./types";
import { vaultToolDefinitions, vaultExecutors } from "./vaultTools";
import { systemToolDefinitions, systemExecutors } from "./systemTools";
import { memoryToolDefinitions, memoryExecutors } from "./memoryTools";
import { dataviewToolDefinitions, executeDataviewQuery } from "./dataviewTools";
import { templaterToolDefinitions, executeTemplaterRender } from "./templaterTools";
import { canvasToolDefinitions, executeCreateCanvas, executeReadCanvas } from "./canvasTools";
import { NeiAiChatPlugin } from "../../../main";

export class ToolRegistry {
    private definitions: Map<string, ToolDefinition> = new Map();
    private executors: Map<string, ToolExecutor> = new Map();
    private plugin: NeiAiChatPlugin;

    constructor(plugin: NeiAiChatPlugin) {
        this.plugin = plugin;
        this.registerAll(vaultToolDefinitions, vaultExecutors);
        this.registerAll(systemToolDefinitions, systemExecutors);
        this.registerAll(memoryToolDefinitions, memoryExecutors);

        // Ecosystem tools registration
        this.registerAll(dataviewToolDefinitions, {
            query_dataview: (app, args) => executeDataviewQuery(app, String(args.query || ""), typeof args.limit === "number" ? args.limit : 50)
        });
        this.registerAll(templaterToolDefinitions, {
            render_templater: (app, args) => executeTemplaterRender(app, String(args.template || ""), args.context as Record<string, unknown> | undefined)
        });
        this.registerAll(canvasToolDefinitions, {
            create_canvas: (app, args) => executeCreateCanvas(
                app,
                String(args.path || ""),
                (Array.isArray(args.nodes) ? args.nodes : []) as Array<{ id: string; x: number; y: number; width: number; height: number; type?: string; text?: string; color?: string }>,
                (Array.isArray(args.edges) ? args.edges : []) as Array<{ id: string; fromNode: string; fromSide?: string; toNode: string; toSide?: string }>
            ),
            read_canvas: (app, args) => executeReadCanvas(app, String(args.path || ""))
        });
    }

    private registerAll(defs: ToolDefinition[], execs: Record<string, ToolExecutor>) {
        for (const def of defs) {
            const name = def.function.name;
            this.definitions.set(name, def);
            if (execs[name]) {
                this.executors.set(name, execs[name]);
            }
        }
    }

    public registerDefinition(def: ToolDefinition): void {
        this.definitions.set(def.function.name, def);
    }

    public registerExecutor(name: string, executor: ToolExecutor): void {
        this.executors.set(name, executor);
    }

    public getToolDefinitions(): ToolDefinition[] {
        return Array.from(this.definitions.values());
    }

    public async executeTool(
        app: App,
        toolCallId: string,
        name: string,
        argsJson: string
    ): Promise<ToolExecutionResult> {
        const executor = this.executors.get(name);
        if (!executor) {
            return {
                toolCallId,
                name,
                result: `Ошибка: Неизвестный инструмент '${name}'.`,
                isError: true
            };
        }

        let parsedArgs: Record<string, unknown> = {};
        try {
            parsedArgs = JSON.parse(argsJson || "{}") as Record<string, unknown>;
        } catch (e: unknown) {
            const err = e as { message?: string };
            return {
                toolCallId,
                name,
                result: `Ошибка парсинга аргументов инструмента '${name}': ${err?.message || String(e)}`,
                isError: true
            };
        }

        try {
            const execResult = await executor(app, parsedArgs, this.plugin);

            if (typeof execResult === "object" && execResult !== null && "result" in execResult) {
                return execResult;
            }

            return {
                toolCallId,
                name,
                result: String(execResult)
            };
        } catch (e: unknown) {
            const err = e as { message?: string };
            return {
                toolCallId,
                name,
                result: `Исключение при выполнении '${name}': ${err?.message || String(e)}`,
                isError: true
            };
        }
    }
}

