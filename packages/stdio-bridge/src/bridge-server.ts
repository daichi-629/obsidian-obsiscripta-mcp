/**
 * MCP stdio server that bridges to the Obsidian plugin
 * Implements StdioBridgeServer class for MCP communication via stdio
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
import { PluginClient, RetryExhaustedError } from "./plugin-client.js";

/**
 * Default polling interval in milliseconds
 */
const DEFAULT_POLLING_INTERVAL = 5000;

/**
 * Maximum retry attempts for initial plugin connection
 */
const MAX_STARTUP_RETRIES = 30;

/**
 * Server info for MCP protocol
 */
const SERVER_INFO = {
	name: "obsidian-mcp-bridge",
	version: "1.0.0",
} as const;

/**
 * MCP stdio server that bridges to the Obsidian plugin.
 * Receives stdio communication from Claude Desktop and proxies
 * tool calls to the Obsidian plugin via Bridge API.
 */
export class StdioBridgeServer {
	private mcpServer: McpServer;
	private transport: StdioServerTransport | null = null;
	private pollingInterval: number;
	private pollingTimer: ReturnType<typeof setInterval> | null = null;
	private pollingState: PollingState = {
		lastHash: "",
		tools: new Map(),
	};
	private isRunning = false;

	/**
	 * Creates a new StdioBridgeServer instance
	 * @param pluginClient - HTTP client for communicating with the Obsidian plugin
	 * @param pollingInterval - Interval in milliseconds for polling tool updates (default: 5000)
	 */
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

		// Set up request handlers
		this.setupRequestHandlers();
	}

	/**
	 * Sets up MCP request handlers for tools/list and tools/call
	 */
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

				// Check if tool exists
				if (!this.pollingState.tools.has(name)) {
					return {
						content: [{ type: "text", text: `Error: Tool '${name}' not found` }],
						isError: true,
					};
				}

				// Execute tool call
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
						// Default to text
						return { type: "text" as const, text: JSON.stringify(c) };
					}),
					isError: "isError" in response ? response.isError : false,
				};
			}
		);
	}

	/**
	 * Starts the MCP server with stdio transport.
	 * Waits for plugin to be available (with retry), then starts polling for tools.
	 */
	async start(): Promise<void> {
		if (this.isRunning) {
			console.warn("[StdioBridgeServer] Server already running");
			return;
		}

		// Wait for plugin to be available with retry
		console.error("[StdioBridgeServer] Waiting for Obsidian plugin...");
		try {
			await this.pluginClient.waitForPlugin(MAX_STARTUP_RETRIES);
			console.error("[StdioBridgeServer] Plugin is available");
		} catch (error) {
			if (error instanceof RetryExhaustedError) {
				console.error(
					"[StdioBridgeServer] Failed to connect to plugin after maximum retries"
				);
			}
			throw error;
		}

		// Initial tool sync
		await this.syncTools();

		// Create and connect stdio transport
		this.transport = new StdioServerTransport();
		await this.mcpServer.connect(this.transport);
		this.isRunning = true;

		// Start polling for tool changes
		this.startPolling();

		console.error("[StdioBridgeServer] Server started successfully");
	}

	/**
	 * Stops the MCP server and cleans up resources
	 */
	async stop(): Promise<void> {
		this.stopPolling();

		if (this.mcpServer) {
			await this.mcpServer.close();
		}

		this.transport = null;
		this.isRunning = false;
		console.error("[StdioBridgeServer] Server stopped");
	}

	/**
	 * Synchronizes tools from the plugin.
	 * Fetches the tool list and re-registers all tools if the hash has changed.
	 */
	async syncTools(): Promise<void> {
		try {
			const response = await this.pluginClient.listTools();

			// Check if hash has changed
			if (response.hash === this.pollingState.lastHash) {
				return; // No changes
			}

			console.error(
				`[StdioBridgeServer] Tool list changed (hash: ${response.hash})`
			);

			// Clear existing tools and register new ones
			this.pollingState.tools.clear();

			// Register all tools
			for (const tool of response.tools) {
				await this.registerProxiedTool(this.convertToMCPToolDefinition(tool));
			}

			// Update state
			this.pollingState.lastHash = response.hash;
			this.pollingState.lastError = undefined;

			// Notify MCP client about tool list change
			if (this.isRunning) {
				this.mcpServer.sendToolListChanged();
			}
		} catch (error) {
			this.pollingState.lastError =
				error instanceof Error ? error : new Error(String(error));
			console.error(
				"[StdioBridgeServer] Failed to sync tools:",
				this.pollingState.lastError.message
			);
		}
	}

	/**
	 * Registers a tool from the plugin as a proxied MCP tool.
	 * The tool handler will forward calls to the plugin's Bridge API.
	 * @param tool - MCP tool definition from the plugin
	 */
	async registerProxiedTool(tool: MCPToolDefinition): Promise<void> {
		// Store tool definition
		this.pollingState.tools.set(tool.name, tool);
		console.error(`[StdioBridgeServer] Registered tool: ${tool.name}`);
	}

	/**
	 * Executes a tool call by forwarding it to the plugin's Bridge API.
	 * @param toolName - Name of the tool to call
	 * @param args - Arguments to pass to the tool
	 * @returns Tool call response from the plugin
	 */
	async executeToolCall(
		toolName: string,
		args: Record<string, unknown>
	): Promise<ToolCallResponse> {
		try {
			return await this.pluginClient.callTool(toolName, args);
		} catch (error) {
			// Return error as MCP content
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			return {
				success: false,
				content: [{ type: "text", text: `Error: ${errorMessage}` }],
				isError: true,
			};
		}
	}

	/**
	 * Checks if the server is running
	 */
	isServerRunning(): boolean {
		return this.isRunning;
	}

	/**
	 * Gets the current polling state
	 */
	getPollingState(): Readonly<PollingState> {
		return this.pollingState;
	}

	/**
	 * Converts a Bridge API Tool to MCPToolDefinition
	 */
	private convertToMCPToolDefinition(tool: Tool): MCPToolDefinition {
		return {
			name: tool.name,
			description: tool.description,
			inputSchema: tool.inputSchema,
		};
	}

	/**
	 * Starts the polling timer for tool synchronization
	 */
	private startPolling(): void {
		if (this.pollingTimer) {
			return; // Already polling
		}

		this.pollingTimer = setInterval(async () => {
			await this.syncTools();
		}, this.pollingInterval);

		console.error(
			`[StdioBridgeServer] Started polling (interval: ${this.pollingInterval}ms)`
		);
	}

	/**
	 * Stops the polling timer
	 */
	private stopPolling(): void {
		if (this.pollingTimer) {
			clearInterval(this.pollingTimer);
			this.pollingTimer = null;
			console.error("[StdioBridgeServer] Stopped polling");
		}
	}
}

// Re-export BridgeServer alias for backward compatibility
export { StdioBridgeServer as BridgeServer };
