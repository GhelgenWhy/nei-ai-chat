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
            description: "Creates a new Obsidian Canvas (.canvas) file with nodes (text, file, link, group) and connecting edges.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "File path for canvas file ending in .canvas, e.g. 'folder/my-board.canvas'"
                    },
                    nodes: {
                        type: "array",
                        description: "Array of canvas node objects",
                        items: {
                            type: "object",
                            properties: {
                                id: { type: "string" },
                                x: { type: "number" },
                                y: { type: "number" },
                                width: { type: "number" },
                                height: { type: "number" },
                                type: { type: "string", enum: ["text", "file", "link", "group"] },
                                text: { type: "string" },
                                color: { type: "string" }
                            },
                            required: ["id", "x", "y", "width", "height"]
                        }
                    },
                    edges: {
                        type: "array",
                        description: "Array of canvas edge objects",
                        items: {
                            type: "object",
                            properties: {
                                id: { type: "string" },
                                fromNode: { type: "string" },
                                fromSide: { type: "string", enum: ["top", "right", "bottom", "left"] },
                                toNode: { type: "string" },
                                toSide: { type: "string", enum: ["top", "right", "bottom", "left"] }
                            },
                            required: ["id", "fromNode", "toNode"]
                        }
                    }
                },
                required: ["path", "nodes"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_canvas",
            description: "Read and parse an existing Canvas (.canvas) file, returning its nodes and edges.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "File path to the .canvas file"
                    }
                },
                required: ["path"]
            }
        }
    }
];

export async function executeCreateCanvas(
    app: App,
    path: string,
    nodes: Array<{ id: string; x: number; y: number; width: number; height: number; type?: string; text?: string; color?: string }>,
    edges: Array<{ id: string; fromNode: string; fromSide?: string; toNode: string; toSide?: string }> = []
): Promise<string> {
    try {
        let canvasPath = safeNormalizePath(path);
        if (!canvasPath.endsWith(".canvas")) {
            canvasPath += ".canvas";
        }

        const { ensureFolderExists } = await import("./vaultTools");
        const folderPath = canvasPath.substring(0, canvasPath.lastIndexOf('/'));
        if (folderPath) {
            await ensureFolderExists(app, folderPath);
        }

        const canvasData = {
            nodes: nodes.map(n => ({
                id: n.id,
                x: n.x,
                y: n.y,
                width: n.width,
                height: n.height,
                type: n.type || "text",
                text: n.text,
                color: n.color
            })),
            edges: edges.map(e => ({
                id: e.id,
                fromNode: e.fromNode,
                fromSide: e.fromSide || "right",
                toNode: e.toNode,
                toSide: e.toSide || "left"
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

export async function executeReadCanvas(app: App, path: string): Promise<string> {
    try {
        let canvasPath = safeNormalizePath(path);
        if (!canvasPath.endsWith(".canvas")) {
            canvasPath += ".canvas";
        }

        const file = app.vault.getAbstractFileByPath(canvasPath);
        if (!file) {
            return `Error: Canvas file '${canvasPath}' not found.`;
        }

        // We assume it's a TFile if it was returned and isn't a folder (which shouldn't end in .canvas generally)
        // Check if we can read it:
        if (!("stat" in file)) {
            return `Error: Path '${canvasPath}' is not a valid file.`;
        }

        const content = await app.vault.read(file as import("obsidian").TFile);
        let data;
        try {
            data = JSON.parse(content);
        } catch {
            return `Error: Canvas file '${canvasPath}' contains invalid JSON.`;
        }

        const nodesCount = Array.isArray(data.nodes) ? data.nodes.length : 0;
        const edgesCount = Array.isArray(data.edges) ? data.edges.length : 0;

        return `Canvas File: ${canvasPath}\nNodes: ${nodesCount}\nEdges: ${edgesCount}\n\n${JSON.stringify(data, null, 2)}`;
    } catch (e: unknown) {
        const err = e as { message?: string };
        return `Error reading Canvas file: ${err?.message || String(e)}`;
    }
}
