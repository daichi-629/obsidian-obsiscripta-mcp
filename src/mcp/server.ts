import { createServer, Server as HttpServer, IncomingMessage, ServerResponse } from "http";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { ToolRegistry } from "./tools/registry";
import { MCPToolContext, MCPToolDefinition } from "./tools/types";
import type MCPPlugin from "../main";

const SERVER_NAME = "obsidian-mcp";
const SERVER_VERSION = "1.0.0";

interface SessionData {
	transport: StreamableHTTPServerTransport;
	mcpServer: McpServer;
}

export class MCPServer {
	private httpServer: HttpServer | null = null;
	private sessions: Map<string, SessionData> = new Map();
	private toolRegistry: ToolRegistry;
	private context: MCPToolContext;
	private port: number;

	constructor(plugin: MCPPlugin, toolRegistry: ToolRegistry, port: number = 3000) {
		this.toolRegistry = toolRegistry;
		this.port = port;
		this.context = {
			vault: plugin.app.vault,
			app: plugin.app,
			plugin: plugin
		};
	}

	/**
	 * Create a new McpServer instance for a session
	 */
	private createMcpServer(): McpServer {
		const server = new McpServer(
			{ name: SERVER_NAME, version: SERVER_VERSION },
			{ capabilities: { tools: {} } }
		);

		// Register all tools from the registry
		for (const tool of this.toolRegistry.list()) {
			this.registerToolOnServer(server, tool);
		}

		return server;
	}

	/**
	 * Register a tool definition on an McpServer instance
	 */
	private registerToolOnServer(server: McpServer, tool: MCPToolDefinition): void {
		// Convert our schema format to zod schema for MCP SDK
		const zodSchema = this.convertToZodSchema(tool.inputSchema);

		server.registerTool(
			tool.name,
			{
				description: tool.description,
				inputSchema: zodSchema
			},
			async (args) => {
				try {
					const result = await tool.handler(args as Record<string, unknown>, this.context);
					return result;
				} catch (error) {
					return {
						content: [{
							type: "text" as const,
							text: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`
						}],
						isError: true
					};
				}
			}
		);
	}

	/**
	 * Convert our JSON Schema format to Zod schema
	 */
	private convertToZodSchema(schema: MCPToolDefinition["inputSchema"]): Record<string, z.ZodType> {
		const zodShape: Record<string, z.ZodType> = {};

		for (const [key, propSchema] of Object.entries(schema.properties)) {
			let zodType: z.ZodType;

			switch (propSchema.type) {
				case "string":
					zodType = z.string();
					if (propSchema.description) {
						zodType = zodType.describe(propSchema.description);
					}
					break;
				case "number":
					zodType = z.number();
					if (propSchema.description) {
						zodType = zodType.describe(propSchema.description);
					}
					break;
				case "boolean":
					zodType = z.boolean();
					if (propSchema.description) {
						zodType = zodType.describe(propSchema.description);
					}
					break;
				case "array":
					zodType = z.array(z.unknown());
					if (propSchema.description) {
						zodType = zodType.describe(propSchema.description);
					}
					break;
				case "object":
					zodType = z.record(z.string(), z.unknown());
					if (propSchema.description) {
						zodType = zodType.describe(propSchema.description);
					}
					break;
				default:
					zodType = z.unknown();
			}

			// Make optional if not in required array
			if (!schema.required?.includes(key)) {
				zodType = zodType.optional();
			}

			zodShape[key] = zodType;
		}

		return zodShape;
	}

	/**
	 * Handle incoming HTTP requests
	 */
	private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const url = new URL(req.url || "/", `http://${req.headers.host}`);

		// Only handle /mcp endpoint
		if (url.pathname !== "/mcp") {
			res.writeHead(404, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "Not found" }));
			return;
		}

		// Add CORS headers for local development
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id, Last-Event-ID");

		if (req.method === "OPTIONS") {
			res.writeHead(204);
			res.end();
			return;
		}

		const sessionId = req.headers["mcp-session-id"] as string | undefined;

		try {
			switch (req.method) {
				case "POST":
					await this.handlePost(req, res, sessionId);
					break;
				case "GET":
					await this.handleGet(req, res, sessionId);
					break;
				case "DELETE":
					await this.handleDelete(req, res, sessionId);
					break;
				default:
					res.writeHead(405, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Method not allowed" }));
			}
		} catch (error) {
			console.error("[MCP] Error handling request:", error);
			if (!res.headersSent) {
				res.writeHead(500, { "Content-Type": "application/json" });
				res.end(JSON.stringify({
					error: error instanceof Error ? error.message : "Internal server error"
				}));
			}
		}
	}

	/**
	 * Handle POST requests (initialize and JSON-RPC messages)
	 */
	private async handlePost(req: IncomingMessage, res: ServerResponse, sessionId: string | undefined): Promise<void> {
		// If no session ID, this should be an initialize request
		if (!sessionId) {
			await this.handleInitialize(req, res);
			return;
		}

		// Route to existing session
		const session = this.sessions.get(sessionId);
		if (!session) {
			res.writeHead(404, { "Content-Type": "application/json" });
			res.end(JSON.stringify({
				jsonrpc: "2.0",
				error: { code: -32000, message: "Session not found" },
				id: null
			}));
			return;
		}

		await session.transport.handleRequest(req, res);
	}

	/**
	 * Handle initialize request (create new session)
	 */
	private async handleInitialize(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: () => randomUUID(),
			// Note: eventStore omitted for now (no resumability support)
			onsessioninitialized: (sessionId) => {
				// Store the session when initialized
				const mcpServer = this.createMcpServer();
				this.sessions.set(sessionId, { transport, mcpServer });
				console.debug(`[MCP] Session initialized: ${sessionId}`);

				// Connect the server to the transport
				mcpServer.connect(transport).catch((error) => {
					console.error("[MCP] Error connecting server to transport:", error);
				});
			}
		});

		// Set up cleanup on close
		transport.onclose = () => {
			const sessionId = transport.sessionId;
			if (sessionId && this.sessions.has(sessionId)) {
				this.sessions.delete(sessionId);
				console.debug(`[MCP] Session closed: ${sessionId}`);
			}
		};

		// Handle the initialize request
		await transport.handleRequest(req, res);
	}

	/**
	 * Handle GET requests (SSE stream)
	 */
	private async handleGet(req: IncomingMessage, res: ServerResponse, sessionId: string | undefined): Promise<void> {
		if (!sessionId) {
			res.writeHead(400, { "Content-Type": "application/json" });
			res.end(JSON.stringify({
				jsonrpc: "2.0",
				error: { code: -32000, message: "Session ID required for SSE stream" },
				id: null
			}));
			return;
		}

		const session = this.sessions.get(sessionId);
		if (!session) {
			res.writeHead(404, { "Content-Type": "application/json" });
			res.end(JSON.stringify({
				jsonrpc: "2.0",
				error: { code: -32000, message: "Session not found" },
				id: null
			}));
			return;
		}

		await session.transport.handleRequest(req, res);
	}

	/**
	 * Handle DELETE requests (session termination)
	 */
	private async handleDelete(req: IncomingMessage, res: ServerResponse, sessionId: string | undefined): Promise<void> {
		if (!sessionId) {
			res.writeHead(400, { "Content-Type": "application/json" });
			res.end(JSON.stringify({
				jsonrpc: "2.0",
				error: { code: -32000, message: "Session ID required" },
				id: null
			}));
			return;
		}

		const session = this.sessions.get(sessionId);
		if (!session) {
			res.writeHead(404, { "Content-Type": "application/json" });
			res.end(JSON.stringify({
				jsonrpc: "2.0",
				error: { code: -32000, message: "Session not found" },
				id: null
			}));
			return;
		}

		await session.transport.handleRequest(req, res);
	}

	/**
	 * Start the HTTP server
	 */
	async start(): Promise<void> {
		if (this.httpServer) {
			console.warn("[MCP] Server already running");
			return;
		}

		return new Promise((resolve, reject) => {
			const isErrnoLike = (value: unknown): value is { code?: string } => {
				return typeof value === "object" && value !== null && "code" in value;
			};

			this.httpServer = createServer((req, res) => {
				this.handleRequest(req, res).catch((error) => {
					console.error("[MCP] Unhandled error:", error);
				});
			});

			this.httpServer.on("error", (error: unknown) => {
				const err = error instanceof Error ? error : new Error(String(error));
				if (isErrnoLike(error) && error.code === "EADDRINUSE") {
					reject(new Error(`Port ${this.port} is already in use. Please configure a different port in settings.`));
					return;
				}
				reject(err);
			});

			this.httpServer.listen(this.port, "127.0.0.1", () => {
				console.debug(`[MCP] Server started on http://127.0.0.1:${this.port}/mcp`);
				resolve();
			});
		});
	}

	/**
	 * Stop the HTTP server and clean up all sessions
	 */
	async stop(): Promise<void> {
		// Close all active sessions
		for (const [sessionId, session] of this.sessions) {
			try {
				await session.transport.close();
				console.debug(`[MCP] Closed session: ${sessionId}`);
			} catch (error) {
				console.error(`[MCP] Error closing session ${sessionId}:`, error);
			}
		}
		this.sessions.clear();

		// Close HTTP server
		if (this.httpServer) {
			return new Promise((resolve) => {
				this.httpServer!.close(() => {
					console.debug("[MCP] Server stopped");
					this.httpServer = null;
					resolve();
				});
			});
		}
	}

	/**
	 * Check if the server is running
	 */
	isRunning(): boolean {
		return this.httpServer !== null;
	}

	/**
	 * Get the number of active sessions
	 */
	getSessionCount(): number {
		return this.sessions.size;
	}
}
