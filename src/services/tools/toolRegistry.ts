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

        let parsedArgs: any = {};
        try {
            parsedArgs = JSON.parse(argsJson || "{}");
        } catch (e: any) {
            return {
                toolCallId,
                name,
                result: `Ошибка парсинга аргументов инструмента '${name}': ${e?.message || e}`,
                isError: true
            };
        }

        try {
            console.log(`[NEI Agent Engine] Вызов инструмента '${name}' с аргументами:`, parsedArgs);
            const execResult = await executor(app, parsedArgs);

            if (typeof execResult === "object" && execResult !== null && "result" in execResult) {
                return execResult as ToolExecutionResult;
            }

            return {
                toolCallId,
                name,
                result: String(execResult)
            };
        } catch (e: any) {
            return {
                toolCallId,
                name,
                result: `Исключение при выполнении '${name}': ${e?.message || e}`,
                isError: true
            };
        }
    }
}

export const defaultToolRegistry = new ToolRegistry();
