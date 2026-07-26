import { App } from "obsidian";

export interface FunctionParameterSchema {
    type: string;
    description?: string;
    enum?: string[];
    items?: FunctionParameterSchema;
    properties?: Record<string, FunctionParameterSchema>;
    required?: string[];
}

export interface ToolFunctionDefinition {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: Record<string, FunctionParameterSchema>;
        required?: string[];
    };
}

export interface ToolDefinition {
    type: "function";
    function: ToolFunctionDefinition;
}

export interface ToolCall {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string; // JSON string
    };
}

export interface ToolExecutionResult {
    toolCallId: string;
    name: string;
    result: string;
    isError?: boolean;
    requiresApproval?: boolean;
    diffPreview?: {
        filePath: string;
        oldContent: string;
        newContent: string;
    };
}

export type ToolExecutor = (app: App, args: Record<string, unknown>) => Promise<string | ToolExecutionResult>;
