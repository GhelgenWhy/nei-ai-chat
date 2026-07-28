import type { App } from "obsidian";
import { ToolDefinition } from "./types";

function safeNormalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\//, "");
}

export const canvasToolDefinitions: ToolDefinition[] = [
    {
        type: "function",
        function: {
            name: "create_canvas",
            description: "Creates a new Obsidian Canvas (.canvas) file with text nodes and connecting edges.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "File path for canvas file ending in .canvas, e.g. 'folder/my-board.canvas'"
                    },
                    nodes: {
                        type: "array",
                        description: "Array of canvas node objects with id, x, y, width, height, type ('text'), and text content",
                        items: {
                            type: "object",
                            properties: {
                                id: { type: "string" },
                                x: { type: "number" },
                                y: { type: "number" },
                                width: { type: "number" },
                                height: { type: "number" },
                                type: { type: "string" },
                                text: { type: "string" }
                            },
                            required: ["id", "x", "y", "width", "height", "text"]
                        }
                    },
                    edges: {
                        type: "array",
                        description: "Array of canvas edge objects with id, fromNode, toNode",
                        items: {
                            type: "object",
                            properties: {
                                id: { type: "string" },
                                fromNode: { type: "string" },
                                toNode: { type: "string" }
                            },
                            required: ["id", "fromNode", "toNode"]
                        }
                    }
                },
                required: ["path", "nodes"]
            }
        }
    }
];

export async function executeCreateCanvas(
    app: App,
    path: string,
    nodes: Array<{ id: string; x: number; y: number; width: number; height: number; type?: string; text: string }>,
    edges: Array<{ id: string; fromNode: string; toNode: string }> = []
): Promise<string> {
    try {
        let canvasPath = safeNormalizePath(path);
        if (!canvasPath.endsWith(".canvas")) {
            canvasPath += ".canvas";
        }

        const { ensureFolderExists } = await import("./vaultTools");
        await ensureFolderExists(app, canvasPath);

        const canvasData = {
            nodes: nodes.map(n => ({
                id: n.id,
                x: n.x,
                y: n.y,
                width: n.width,
                height: n.height,
                type: n.type || "text",
                text: n.text
            })),
            edges: edges.map(e => ({
                id: e.id,
                fromNode: e.fromNode,
                toNode: e.toNode
            }))
        };

        const content = JSON.stringify(canvasData, null, 2);

        const existing = app.vault.getAbstractFileByPath(canvasPath);
        if (existing) {
            return `Canvas file already exists at ${canvasPath}. Choose a different path.`;
        }

        await app.vault.create(canvasPath, content);
        return `Successfully created Obsidian Canvas at: ${canvasPath} (${nodes.length} nodes, ${edges.length} edges)`;
    } catch (e: unknown) {
        const err = e as { message?: string };
        return `Error creating Canvas file: ${err?.message || String(e)}`;
    }
}
