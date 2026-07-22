import { requestUrl } from "obsidian";
import { ToolDefinition, ToolExecutor } from "../tools/types";

export interface McpServerConfig {
    id: string;
    name: string;
    endpointUrl: string; // HTTP SSE or JSON-RPC endpoint
    enabled: boolean;
}

export interface McpTool {
    name: string;
    description: string;
    inputSchema: any;
    serverId: string;
}

export class McpService {
    private static servers: McpServerConfig[] = [];

    public static setServers(servers: McpServerConfig[]) {
        this.servers = servers;
    }

    /**
     * Discovers all available tools from enabled MCP servers.
     */
    public static async discoverMcpTools(): Promise<{ definitions: ToolDefinition[]; executors: Record<string, ToolExecutor> }> {
        const definitions: ToolDefinition[] = [];
        const executors: Record<string, ToolExecutor> = {};

        for (const server of this.servers) {
            if (!server.enabled || !server.endpointUrl) continue;

            try {
                // Call MCP listTools endpoint
                const response = await requestUrl({
                    url: server.endpointUrl.endsWith("/") ? `${server.endpointUrl}tools/list` : `${server.endpointUrl}/tools/list`,
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: "1" })
                });

                if (response.status === 200) {
                    const json = response.json;
                    const tools = json.result?.tools || [];

                    for (const tool of tools) {
                        const mcpToolName = `mcp_${server.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${tool.name}`;
                        
                        definitions.push({
                            type: "function",
                            function: {
                                name: mcpToolName,
                                description: `[MCP: ${server.name}] ${tool.description || ""}`,
                                parameters: tool.inputSchema || { type: "object", properties: {} }
                            }
                        });

                        executors[mcpToolName] = async (app, args) => {
                            return await this.callMcpTool(server, tool.name, args);
                        };
                    }
                }
            } catch (e: any) {
                console.log(`[McpService] Failed to discover tools from MCP server '${server.name}':`, e?.message || e);
            }
        }

        return { definitions, executors };
    }

    /**
     * Executes a tool on a specific MCP server.
     */
    private static async callMcpTool(server: McpServerConfig, originalToolName: string, args: any): Promise<string> {
        try {
            const response = await requestUrl({
                url: server.endpointUrl.endsWith("/") ? `${server.endpointUrl}tools/call` : `${server.endpointUrl}/tools/call`,
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    method: "tools/call",
                    params: { name: originalToolName, arguments: args },
                    id: "2"
                })
            });

            if (response.status === 200) {
                const json = response.json;
                if (json.error) {
                    return `Ошибка MCP инструмента '${originalToolName}': ${json.error.message || JSON.stringify(json.error)}`;
                }
                const contentBlocks = json.result?.content || [];
                const textOutputs = contentBlocks.map((c: any) => c.text || JSON.stringify(c)).join("\n");
                return `[Ответ MCP сервера '${server.name}']:\n${textOutputs || "Инструмент выполнен успешно."}`;
            }

            return `Ошибка MCP сервера '${server.name}' (HTTP ${response.status})`;
        } catch (e: any) {
            return `Ошибка вызова MCP инструмента '${originalToolName}' на сервере '${server.name}': ${e?.message || e}`;
        }
    }
}
