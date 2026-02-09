/**
 * MCP server setup using Streamable HTTP transport.
 * Proxies tool calls to the Obsidian plugin via Bridge API.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	ListToolsRequestSchema,
	CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { PluginClient } from "../plugin/plugin-client.js";
import type { TokenStore } from "../store/token-store.js";
import type { MCPToolDefinition, MCPContent, PollingState, Tool } from "../types.js";
import { SERVER_VERSION } from "../config.js";

interface RequestContext {
	githubUserId?: number;
	sessionId?: string;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

const SERVER_INFO = {
	name: "obsiscripta-remote-mcp",
	version: SERVER_VERSION,
} as const;

/**
 * Creates and configures an MCP server that proxies tools from the Obsidian plugin.
 * Supports per-user plugin configurations.
 */
export class RemoteMcpServer {
	readonly mcpServer: McpServer;
	private pluginClients = new Map<number, PluginClient>();

	constructor(private store: TokenStore) {
		this.mcpServer = new McpServer(SERVER_INFO, {
			capabilities: {
				tools: {},
			},
		});

		this.setupRequestHandlers();
	}

	/**
	 * Get or create a PluginClient for a specific user
	 */
	private getPluginClientForUser(githubUserId: number): PluginClient | null {
		// Check cache first
		const cached = this.pluginClients.get(githubUserId);
		if (cached) {
			return cached;
		}

		// Get user's plugin token
		const pluginToken = this.store.getPluginTokenByUserId(githubUserId);

		// If no user-specific config, return null
		if (!pluginToken) {
			console.error(`[RemoteMcpServer] No plugin token for user ${githubUserId}`);
			return null;
		}

		// Create new client for this user
		const client = new PluginClient({
			host: pluginToken.pluginHost,
			port: pluginToken.pluginPort,
			token: pluginToken.token,
			requireAuth: pluginToken.requireAuth,
		});

		this.pluginClients.set(githubUserId, client);
		console.error(`[RemoteMcpServer] Created plugin client for user ${githubUserId}`);

		return client;
	}

	/**
	 * Run a function within a request context
	 */
	runInContext<T>(
		context: RequestContext,
		fn: () => T | Promise<T>
	): T | Promise<T> {
		return requestContext.run(context, fn);
	}

	/**
	 * Get plugin client for the current request context
	 */
	private getCurrentPluginClient(): PluginClient | null {
		const context = requestContext.getStore();

		// If no context or user ID, return null
		if (!context?.githubUserId) {
			console.error(`[RemoteMcpServer] No user context available`);
			return null;
		}

		return this.getPluginClientForUser(context.githubUserId);
	}

	private setupRequestHandlers(): void {
		// Handle tools/list requests
		this.mcpServer.server.setRequestHandler(
			ListToolsRequestSchema,
			async () => {
				const pluginClient = this.getCurrentPluginClient();

				if (!pluginClient) {
					return {
						tools: [],
					};
				}

				try {
					const response = await pluginClient.listTools();
					return {
						tools: response.tools.map((tool: Tool) => ({
							name: tool.name,
							description: tool.description,
							inputSchema: {
								...tool.inputSchema,
								type: "object" as const,
							},
						})),
					};
				} catch (error) {
					console.error(`[RemoteMcpServer] Failed to list tools:`, error);
					return {
						tools: [],
					};
				}
			}
		);

		// Handle tools/call requests
		this.mcpServer.server.setRequestHandler(
			CallToolRequestSchema,
			async (request) => {
				const { name, arguments: args = {} } = request.params;

				try {
					// Get the appropriate plugin client for this request
					const pluginClient = this.getCurrentPluginClient();

					if (!pluginClient) {
						return {
							content: [
								{
									type: "text",
									text: `Error: No plugin configuration found for user`,
								},
							],
							isError: true,
						};
					}

					const response = await pluginClient.callTool(
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

}
