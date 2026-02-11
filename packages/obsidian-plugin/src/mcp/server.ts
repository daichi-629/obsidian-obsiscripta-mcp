import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve, ServerType } from "@hono/node-server";
import type { Socket } from "net";
import { randomUUID } from "crypto";
import { ToolExecutor } from "./tools/executor";
import { ToolCallRequest } from "./bridge-types";
import {
	handleMCPRequest,
	parseJSONRPCMessage,
	createParseErrorResponse,
	createInvalidRequestResponse,
} from "./mcp-api";
import { deleteSessionStore } from "./tools/session-store";

export class BridgeServer {
	private static readonly MAX_BODY_BYTES = 1024 * 1024;
	private httpServer: ServerType | null = null;
	private sockets = new Set<Socket>();
	private readonly executor: ToolExecutor;
	private readonly mcpApiKeys: ReadonlySet<string>;
	private readonly enableBridgeV1: boolean;
	private readonly mcpSessions = new Map<string, { createdAt: number; lastAccessedAt: number }>();
	private port: number;
	private host: string;
	private app: Hono;

	constructor(
		executor: ToolExecutor,
		port: number = 3000,
		host: string = "127.0.0.1",
		enableBridgeV1: boolean = true,
		mcpApiKeys: readonly string[] = [],
	) {
		this.executor = executor;
		this.port = port;
		this.host = host;
		this.enableBridgeV1 = enableBridgeV1;
		this.mcpApiKeys = new Set(mcpApiKeys);
		this.app = this.createApp();
	}

	private getMcpApiKeyFromHeader(authorizationHeader: string | undefined, apiKeyHeader: string | undefined): string | null {
		if (apiKeyHeader && apiKeyHeader.trim().length > 0) {
			return apiKeyHeader.trim();
		}

		if (!authorizationHeader) {
			return null;
		}

		const [scheme, token] = authorizationHeader.split(" ");
		if (!scheme || !token) {
			return null;
		}

		if (scheme.toLowerCase() !== "bearer") {
			return null;
		}

		return token.trim();
	}

	private isInitializeRequest(body: unknown): boolean {
		if (typeof body !== "object" || body === null) {
			return false;
		}

		const payload = body as { method?: unknown };
		return payload.method === "initialize";
	}

	private createSessionId(): string {
		return randomUUID();
	}

	private getSessionFromHeader(sessionIdHeader: string | undefined): string | null {
		if (!sessionIdHeader || sessionIdHeader.trim().length === 0) {
			return null;
		}

		const sessionId = sessionIdHeader.trim();
		for (let i = 0; i < sessionId.length; i += 1) {
			const code = sessionId.charCodeAt(i);
			if (code < 0x21 || code > 0x7e) {
				return null;
			}
		}

		return sessionId;
	}

	/**
	 * Create and configure Hono app
	 */
	private createApp(): Hono {
		const app = new Hono();

		if (this.enableBridgeV1) {
			// CORS middleware for v1 API
			app.use(
				"/bridge/v1/*",
				cors({
					origin: "*",
					allowMethods: ["GET", "POST", "OPTIONS"],
					allowHeaders: ["Content-Type"],
				}),
			);

			// Body size limit middleware for v1 API
			app.use("/bridge/v1/*", async (c, next) => {
				const contentLength = c.req.header("content-length");
				if (
					contentLength &&
					parseInt(contentLength) > BridgeServer.MAX_BODY_BYTES
				) {
					return c.json(
						{
							error: "Request body too large",
							message: "Request body too large",
						},
						413,
					);
				}
				return await next();
			});

			// Health endpoint
			app.get("/bridge/v1/health", (c) => {
				return c.json(this.executor.getHealth());
			});

			// Tools list endpoint
			app.get("/bridge/v1/tools", (c) => {
				return c.json(this.executor.getTools());
			});

			// Tool call endpoint
			app.post("/bridge/v1/tools/:toolName/call", async (c) => {
				const toolName = c.req.param("toolName");

				if (!this.executor.isToolAvailable(toolName)) {
					return c.json(
						{
							error: "Tool not found",
							message: "Tool not found",
						},
						404,
					);
				}

				let payload: ToolCallRequest;
				try {
					payload = await c.req.json<ToolCallRequest>();
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					return c.json(
						{
							error: "Invalid request body",
							message: "Invalid request body",
							details: message,
						},
						400,
					);
				}

				const hasArguments =
					payload &&
					typeof payload === "object" &&
					"arguments" in payload;
				const argsValue = hasArguments ? payload.arguments : null;
				if (
					!hasArguments ||
					!argsValue ||
					typeof argsValue !== "object" ||
					Array.isArray(argsValue)
				) {
					return c.json(
						{
							error: "Invalid request body",
							message: "Invalid request body",
						},
						400,
					);
				}

				try {
					const response = await this.executor.executeToolCall(
						toolName,
						argsValue,
					);
					return c.json(response);
				} catch (error) {
					return c.json(
						{
							error: "Internal server error",
							message: "Internal server error",
							details:
								error instanceof Error ? error.message : String(error),
						},
						500,
					);
				}
			});
		}

		// CORS middleware for MCP standard HTTP
		app.use(
			"/mcp",
			cors({
				origin: "*",
				allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
				allowHeaders: ["Content-Type", "MCP-Session-Id", "Authorization", "X-ObsiScripta-Api-Key"],
			}),
		);

		app.use("/mcp", async (c, next) => {
			if (c.req.method === "OPTIONS") {
				return await next();
			}

			if (this.mcpApiKeys.size === 0) {
				return c.json(
					{
						error: "Authentication not configured",
						message:
							"MCP authentication is required. Generate at least one API key in plugin settings.",
					},
					503,
				);
			}

			const providedKey = this.getMcpApiKeyFromHeader(
				c.req.header("authorization"),
				c.req.header("x-obsiscripta-api-key"),
			);

			if (!providedKey || !this.mcpApiKeys.has(providedKey)) {
				return c.json(
					{
						error: "Unauthorized",
						message:
							"Invalid or missing MCP API key. Pass OBSIDIAN_MCP_API_KEY from stdio bridge.",
					},
					401,
				);
			}

			return await next();
		});

		// Body size limit middleware for MCP endpoint
		app.use("/mcp", async (c, next) => {
			const contentLength = c.req.header("content-length");
			if (
				contentLength &&
				parseInt(contentLength) > BridgeServer.MAX_BODY_BYTES
			) {
				return c.json(
					{
						error: "Request body too large",
						message: "Request body too large",
					},
					413,
				);
			}
			return await next();
		});

		app.delete("/mcp", async (c) => {
			const sessionId = this.getSessionFromHeader(c.req.header("mcp-session-id"));
			if (!sessionId) {
				return c.json(
					{
						error: "Missing MCP session",
						message: "MCP-Session-Id header is required",
					},
					400,
				);
			}

			if (!this.mcpSessions.has(sessionId)) {
				return c.json(
					{
						error: "Session not found",
						message: "Session not found",
					},
					404,
				);
			}

			this.mcpSessions.delete(sessionId);
			deleteSessionStore(sessionId);
			return c.body(null, 204);
		});

		// MCP Standard HTTP endpoint (JSON-RPC over HTTP)
		app.post("/mcp", async (c) => {
			// Parse request body
			let body: unknown;
			try {
				body = await c.req.json();
			} catch {
				const errorResponse = createParseErrorResponse();
				return c.json(errorResponse, 400);
			}

			const providedSessionId = this.getSessionFromHeader(
				c.req.header("mcp-session-id")
			);

			if (c.req.header("mcp-session-id") && !providedSessionId) {
				return c.json(
					{
						error: "Invalid MCP session",
						message: "MCP-Session-Id must contain only visible ASCII characters",
					},
					400,
				);
			}

			if (providedSessionId && !this.mcpSessions.has(providedSessionId)) {
				return c.json(
					{
						error: "Session not found",
						message: "Session not found",
					},
					404,
				);
			}

			const isInitialize = this.isInitializeRequest(body);
			if (!isInitialize && !providedSessionId) {
				return c.json(
					{
						error: "Missing MCP session",
						message: "MCP-Session-Id header is required after initialize",
					},
					400,
				);
			}

			if (isInitialize && providedSessionId) {
				return c.json(
					{
						error: "Invalid initialize request",
						message: "Initialize requests must not include MCP-Session-Id",
					},
					400,
				);
			}

			// Parse JSON-RPC message
			const parsed = parseJSONRPCMessage(body);
			if (parsed instanceof Error) {
				const errorResponse = createInvalidRequestResponse(
					parsed.message
				);
				return c.json(errorResponse, 400);
			}

			const request = parsed;

			// Handle the request
			try {
				const contextSessionId = providedSessionId ?? randomUUID();
				const response = await handleMCPRequest(
					request,
					this.executor.getRegistry(),
					this.executor.getContext(contextSessionId)
				);

				if (isInitialize) {
					const sessionId = this.createSessionId();
					const now = Date.now();
					this.mcpSessions.set(sessionId, {
						createdAt: now,
						lastAccessedAt: now,
					});
					deleteSessionStore(contextSessionId);
					c.header("MCP-Session-Id", sessionId);
				} else if (providedSessionId) {
					const session = this.mcpSessions.get(providedSessionId);
					if (session) {
						session.lastAccessedAt = Date.now();
					}
				}

				// For Phase 1, we return application/json (no SSE streaming)
				// Phase 2+ will add SSE support when needed
				return c.json(response, 200);
			} catch (error) {
				console.error("[Bridge] Error handling MCP request:", error);
				return c.json(
					{
						jsonrpc: "2.0",
						id: request.id,
						error: {
							code: -32603,
							message: "Internal error",
							data:
								error instanceof Error
									? error.message
									: String(error),
						},
					},
					500
				);
			}
		});

		// 404 handler
		app.notFound((c) => {
			return c.json(
				{
					error: "Not found",
					message: "Not found",
				},
				404,
			);
		});

		// Global error handler
		app.onError((err, c) => {
			console.error("[Bridge] Error handling request:", err);
			return c.json(
				{
					error:
						err instanceof Error ? err.message : "Internal server error",
					message:
						err instanceof Error ? err.message : "Internal server error",
				},
				500,
			);
		});

		return app;
	}

	/**
	 * Start the HTTP server
	 */
	async start(): Promise<void> {
		if (this.httpServer) {
			console.warn("[Bridge] Server already running");
			return;
		}

		return new Promise((resolve, reject) => {
			const isErrnoLike = (
				value: unknown,
			): value is { code?: string } => {
				return (
					typeof value === "object" &&
					value !== null &&
					"code" in value
				);
			};
			let settled = false;

			try {
				const server = serve(
					{
						fetch: this.app.fetch,
						port: this.port,
						hostname: this.host,
					},
					(info) => {
						console.debug(
							`[Bridge] Server started on http://${info.address}:${info.port}`,
						);
						if (this.enableBridgeV1) {
							console.debug(
								`[Bridge] - v1 API: http://${info.address}:${info.port}/bridge/v1`,
							);
						}
						console.debug(
							`[Bridge] - MCP Standard: http://${info.address}:${info.port}/mcp`,
						);
						if (!settled) {
							settled = true;
							resolve();
						}
					},
				);

				this.httpServer = server;

				// Track connections for graceful shutdown
				server.on("connection", (socket) => {
					this.sockets.add(socket);
					socket.on("close", () => {
						this.sockets.delete(socket);
					});
				});

				// Handle errors
				server.once("error", (error: unknown) => {
					const err =
						error instanceof Error
							? error
							: new Error(String(error));
					const server = this.httpServer;
					this.httpServer = null;
					this.sockets.clear();
					if (server) {
						server.close(() => {
							console.debug(
								"[Bridge] Server closed after start error",
							);
						});
					}
					if (settled) {
						return;
					}
					settled = true;
					if (isErrnoLike(error) && error.code === "EADDRINUSE") {
						reject(
							new Error(
								`Port ${this.port} is already in use. Please configure a different port in settings.`,
							),
						);
						return;
					}
					reject(err);
				});
			} catch (error) {
				if (!settled) {
					settled = true;
					reject(
						error instanceof Error
							? error
							: new Error(String(error)),
					);
				}
			}
		});
	}

	/**
	 * Stop the HTTP server
	 */
	async stop(): Promise<void> {
		if (this.httpServer) {
			return new Promise((resolve) => {
				const server = this.httpServer;
				if (!server) {
					resolve();
					return;
				}
				this.httpServer = null;
				for (const socket of this.sockets) {
					socket.destroy();
				}
				this.sockets.clear();
				server.close(() => {
					console.debug("[Bridge] Server stopped");
					resolve();
				});
			});
		}
		return Promise.resolve();
	}

	/**
	 * Check if the server is running
	 */
	isRunning(): boolean {
		return this.httpServer !== null;
	}
}
