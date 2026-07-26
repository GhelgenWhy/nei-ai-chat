import { App } from "obsidian";
import { ToolDefinition, ToolExecutor, ToolExecutionResult } from "./types";
import { vaultToolDefinitions, vaultExecutors } from "./vaultTools";
import { systemToolDefinitions, systemExecutors } from "./systemTools";
import { memoryToolDefinitions, memoryExecutors } from "./memoryTools";

export class ToolRegistry {
    private definitions: Map<string, ToolDefinition> = new Map();
    private executors: Map<string, ToolExecutor> = new Map();

    constructor() {
        this.registerAll(vaultToolDefinitions, vaultExecutors);
        this.registerAll(systemToolDefinitions, systemExecutors);
        this.registerAll(memoryToolDefinitions, memoryExecutors);
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
            const execResult = await executor(app, parsedArgs);

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

export const defaultToolRegistry = new ToolRegistry();
