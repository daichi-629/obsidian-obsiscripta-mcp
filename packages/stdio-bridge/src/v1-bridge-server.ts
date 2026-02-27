/**
 * MCP stdio server that bridges to the Obsidian plugin Bridge v1 API.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	ListToolsRequestSchema,
	CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type {
	MCPToolDefinition,
	PollingState,
	ToolCallResponse,
	Tool,
	MCPContent,
} from "./types.js";
import { RetryExhaustedError, V1PluginClient } from "./plugin-client.js";

declare const __BRIDGE_VERSION__: string;

const DEFAULT_POLLING_INTERVAL = 5000;
const MAX_STARTUP_RETRIES = 30;

const SERVER_INFO = {
	name: "obsidian-mcp-bridge",
	version: __BRIDGE_VERSION__,
} as const;

export class V1BridgeServer {
	private mcpServer: McpServer;
	private transport: StdioServerTransport | null = null;
	private pollingInterval: number;
	private pollingTimer: ReturnType<typeof setInterval> | null = null;
	private pollingState: PollingState = {
		lastHash: "",
		tools: new Map(),
	};
	private isRunning = false;

	constructor(
		private pluginClient: V1PluginClient,
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

		this.mcpServer.server.setRequestHandler(
			CallToolRequestSchema,
			async (request) => {
				const { name, arguments: args = {} } = request.params;

				if (!this.pollingState.tools.has(name)) {
					return {
						content: [{ type: "text", text: `Error: Tool '${name}' not found` }],
						isError: true,
					};
				}

				const response = await this.executeToolCall(
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
			}
		);
	}

	async start(): Promise<void> {
		if (this.isRunning) {
			console.warn("[V1BridgeServer] Server already running");
			return;
		}

		console.error("[V1BridgeServer] Waiting for Obsidian plugin...");
		try {
			await this.pluginClient.waitForPlugin(MAX_STARTUP_RETRIES);
			console.error("[V1BridgeServer] Plugin is available");
		} catch (error) {
			if (error instanceof RetryExhaustedError) {
				console.error(
					"[V1BridgeServer] Failed to connect to plugin after maximum retries"
				);
			}
			throw error;
		}

		await this.syncTools();

		this.transport = new StdioServerTransport();
		await this.mcpServer.connect(this.transport);
		this.isRunning = true;

		this.startPolling();

		console.error("[V1BridgeServer] Server started successfully");
	}

	async stop(): Promise<void> {
		this.stopPolling();

		if (this.mcpServer) {
			await this.mcpServer.close();
		}

		this.transport = null;
		this.isRunning = false;
		console.error("[V1BridgeServer] Server stopped");
	}

	async syncTools(): Promise<void> {
		try {
			const response = await this.pluginClient.listTools();

			if (response.hash === this.pollingState.lastHash) {
				return;
			}

			console.error(
				`[V1BridgeServer] Tool list changed (hash: ${response.hash})`
			);

			this.pollingState.tools.clear();

			for (const tool of response.tools) {
				await this.registerProxiedTool(this.convertToMCPToolDefinition(tool));
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
				"[V1BridgeServer] Failed to sync tools:",
				this.pollingState.lastError.message
			);
		}
	}

	async registerProxiedTool(tool: MCPToolDefinition): Promise<void> {
		this.pollingState.tools.set(tool.name, tool);
		console.error(`[V1BridgeServer] Registered tool: ${tool.name}`);
	}

	async executeToolCall(
		toolName: string,
		args: Record<string, unknown>
	): Promise<ToolCallResponse> {
		try {
			return await this.pluginClient.callTool(toolName, args);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			return {
				success: false,
				content: [{ type: "text", text: `Error: ${errorMessage}` }],
				isError: true,
			};
		}
	}

	isServerRunning(): boolean {
		return this.isRunning;
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

	private startPolling(): void {
		if (this.pollingTimer) {
			return;
		}

		this.pollingTimer = setInterval(async () => {
			await this.syncTools();
		}, this.pollingInterval);

		console.error(
			`[V1BridgeServer] Started polling (interval: ${this.pollingInterval}ms)`
		);
	}

	private stopPolling(): void {
		if (this.pollingTimer) {
			clearInterval(this.pollingTimer);
			this.pollingTimer = null;
			console.error("[V1BridgeServer] Stopped polling");
		}
	}
}

export { V1BridgeServer as StdioBridgeServer };
export { V1BridgeServer as BridgeServer };
