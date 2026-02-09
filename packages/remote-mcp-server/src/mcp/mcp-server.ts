/**
 * MCP server setup using Streamable HTTP transport.
 * Proxies tool calls to the Obsidian plugin via Bridge API.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	ListToolsRequestSchema,
	CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { PluginClient } from "../plugin/plugin-client.js";
import type { MCPToolDefinition, MCPContent, PollingState, Tool } from "../types.js";
import { SERVER_VERSION } from "../config.js";

const SERVER_INFO = {
	name: "obsiscripta-remote-mcp",
	version: SERVER_VERSION,
} as const;

const DEFAULT_POLLING_INTERVAL = 5000;

/**
 * Creates and configures an MCP server that proxies tools from the Obsidian plugin.
 */
export class RemoteMcpServer {
	readonly mcpServer: McpServer;
	private pollingInterval: number;
	private pollingTimer: ReturnType<typeof setInterval> | null = null;
	private pollingState: PollingState = {
		lastHash: "",
		tools: new Map(),
	};
	private isRunning = false;

	constructor(
		private pluginClient: PluginClient,
		pollingInterval: number = DEFAULT_POLLING_INTERVAL
	) {
		this.pollingInterval = pollingInterval;
		this.mcpServer = new McpServer(SERVER_INFO, {
			capabilities: {
				tools: { listChanged: true },
			},
		});

		this.setupRequestHandlers();
	}

	private setupRequestHandlers(): void {
		// Handle tools/list requests
		this.mcpServer.server.setRequestHandler(
			ListToolsRequestSchema,
			async () => {
				const tools = Array.from(this.pollingState.tools.values()).map(
					(tool: MCPToolDefinition) => ({
						name: tool.name,
						description: tool.description,
						inputSchema: {
							...tool.inputSchema,
							type: "object" as const,
						},
					})
				);
				return { tools };
			}
		);

		// Handle tools/call requests
		this.mcpServer.server.setRequestHandler(
			CallToolRequestSchema,
			async (request) => {
				const { name, arguments: args = {} } = request.params;

				if (!this.pollingState.tools.has(name)) {
					return {
						content: [
							{ type: "text", text: `Error: Tool '${name}' not found` },
						],
						isError: true,
					};
				}

				try {
					const response = await this.pluginClient.callTool(
						name,
						args as Record<string, unknown>
					);

					return {
						content: response.content.map((c: MCPContent) => {
							if (c.type === "text") {
								return { type: "text" as const, text: c.text ?? "" };
							}
							if (c.type === "image") {
								return {
									type: "image" as const,
									data: c.data ?? "",
									mimeType:
										(c as MCPContent & { mimeType?: string }).mimeType ??
										"image/png",
								};
							}
							return { type: "text" as const, text: JSON.stringify(c) };
						}),
						isError: "isError" in response ? response.isError : false,
					};
				} catch (error) {
					const errorMessage =
						error instanceof Error ? error.message : String(error);
					return {
						content: [{ type: "text", text: `Error: ${errorMessage}` }],
						isError: true,
					};
				}
			}
		);
	}

	/**
	 * Start polling for tool changes from the plugin
	 */
	startPolling(): void {
		if (this.pollingTimer) return;

		this.isRunning = true;
		this.syncTools().catch(() => {});

		this.pollingTimer = setInterval(async () => {
			await this.syncTools();
		}, this.pollingInterval);

		console.error(
			`[RemoteMcpServer] Started polling (interval: ${this.pollingInterval}ms)`
		);
	}

	/**
	 * Stop polling for tool changes
	 */
	stopPolling(): void {
		if (this.pollingTimer) {
			clearInterval(this.pollingTimer);
			this.pollingTimer = null;
		}
		this.isRunning = false;
		console.error("[RemoteMcpServer] Stopped polling");
	}

	/**
	 * Synchronize tools from the plugin
	 */
	async syncTools(): Promise<void> {
		try {
			const response = await this.pluginClient.listTools();

			if (response.hash === this.pollingState.lastHash) {
				return;
			}

			console.error(
				`[RemoteMcpServer] Tool list changed (hash: ${response.hash})`
			);

			this.pollingState.tools.clear();

			for (const tool of response.tools) {
				const def = this.convertToMCPToolDefinition(tool);
				this.pollingState.tools.set(def.name, def);
			}

			this.pollingState.lastHash = response.hash;
			this.pollingState.lastError = undefined;

			if (this.isRunning) {
				this.mcpServer.sendToolListChanged();
			}
		} catch (error) {
			this.pollingState.lastError =
				error instanceof Error ? error : new Error(String(error));
			console.error(
				"[RemoteMcpServer] Failed to sync tools:",
				this.pollingState.lastError.message
			);
		}
	}

	getPollingState(): Readonly<PollingState> {
		return this.pollingState;
	}

	private convertToMCPToolDefinition(tool: Tool): MCPToolDefinition {
		return {
			name: tool.name,
			description: tool.description,
			inputSchema: tool.inputSchema,
		};
	}
}
