import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve, ServerType } from "@hono/node-server";
import type { Socket } from "net";
import { ToolExecutor } from "./tools/executor";
import { registerBridgeV1Routes } from "./bridge-v1";
import {
	handleMCPRequest,
	parseJSONRPCMessage,
	createParseErrorResponse,
	createInvalidRequestResponse,
} from "./mcp-api";
import type { JSONRPCRequest, JSONRPCResponse } from "./mcp-types";
import { SessionManagement } from "./session-management";

declare const __BRIDGE_VERSION__: string;

export class BridgeServer {
	private static readonly MAX_BODY_BYTES = 1024 * 1024;
	private static readonly SUPPORTED_PROTOCOL_VERSIONS = new Set<string>([
		"2025-03-26",
		"2025-11-25",
	]);
	private static readonly DEFAULT_PROTOCOL_VERSION = "2025-03-26";
	private httpServer: ServerType | null = null;
	private sockets = new Set<Socket>();
	private readonly executor: ToolExecutor;
	private readonly mcpApiKeys: ReadonlySet<string>;
	private readonly enableBridgeV1: boolean;
	private port: number;
	private host: string;
	private app: Hono;
	private readonly sessionManager = new SessionManagement();

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

	private isAllowedOrigin(originHeader: string | undefined): boolean {
		if (!originHeader) {
			return true;
		}

		if (originHeader === "null") {
			return false;
		}

		let origin: URL;
		try {
			origin = new URL(originHeader);
		} catch {
			return false;
		}

		if (origin.protocol !== "http:" && origin.protocol !== "https:") {
			return false;
		}

		const port =
			origin.port ||
			(origin.protocol === "https:" ? "443" : "80");
		if (port !== String(this.port)) {
			return false;
		}

		const allowedHosts = new Set<string>([
			"localhost",
			"127.0.0.1",
			"::1",
		]);

		if (this.host && this.host !== "0.0.0.0" && this.host !== "::") {
			allowedHosts.add(this.host);
		}

		return allowedHosts.has(origin.hostname);
	}

	private isSupportedProtocolVersion(versionHeader: string | undefined): boolean {
		if (!versionHeader) {
			return true;
		}

		return BridgeServer.SUPPORTED_PROTOCOL_VERSIONS.has(versionHeader);
	}

	private resolveProtocolVersion(request: JSONRPCRequest): string {
		const params = request.params as Record<string, unknown> | undefined;
		const requested = params?.protocolVersion;
		if (
			typeof requested === "string" &&
			BridgeServer.SUPPORTED_PROTOCOL_VERSIONS.has(requested)
		) {
			return requested;
		}

		return BridgeServer.DEFAULT_PROTOCOL_VERSION;
	}

	private createInitializeResponse(request: JSONRPCRequest): JSONRPCResponse {
		return {
			jsonrpc: "2.0",
			id: request.id,
			result: {
				protocolVersion: this.resolveProtocolVersion(request),
				capabilities: {
					tools: { listChanged: true },
				},
				serverInfo: {
					name: "obsiscripta-bridge-plugin",
					version: __BRIDGE_VERSION__,
				},
			},
		};
	}

	/**
	 * Create and configure Hono app
	 */
	private createApp(): Hono {
		const app = new Hono();

		if (this.enableBridgeV1) {
			registerBridgeV1Routes(app, this.executor, BridgeServer.MAX_BODY_BYTES);
		}

		// Origin verification for MCP standard HTTP
		app.use("/mcp", async (c, next) => {
			const originHeader = c.req.header("origin");
			if (!this.isAllowedOrigin(originHeader)) {
				return c.json(
					{
						error: "Origin not allowed",
						message:
							"Origin is not allowed for MCP requests. Use localhost or loopback origin.",
					},
					403,
				);
			}
			return await next();
		});

		// CORS middleware for MCP standard HTTP
		app.use(
			"/mcp",
			cors({
				origin: (origin) => {
					if (!this.isAllowedOrigin(origin)) {
						return null;
					}
					return origin ?? undefined;
				},
				allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
				allowHeaders: ["Content-Type", "Mcp-Session-Id", "Mcp-Protocol-Version", "Authorization", "X-ObsiScripta-Api-Key"],
			}),
		);

		// Protocol version validation for MCP standard HTTP (POST only)
		app.use("/mcp", async (c, next) => {
			if (c.req.method !== "POST") {
				return await next();
			}

			const versionHeader = c.req.header("mcp-protocol-version");
			if (!this.isSupportedProtocolVersion(versionHeader)) {
				return c.json(
					{
						error: "Unsupported protocol version",
						message:
							"Invalid or unsupported MCP-Protocol-Version header. Supported: 2025-03-26, 2025-11-25.",
					},
					400,
				);
			}

			return await next();
		});

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

		// MCP Standard HTTP endpoint (JSON-RPC over HTTP)
		app.get("/mcp", (c) => {
			return c.json(
				{
					error: "Method not allowed",
					message: "GET is not supported for MCP endpoint",
				},
				405,
			);
		});

		app.post("/mcp", async (c) => {
			const sessionIdHeader = c.req.header("mcp-session-id");

			// Parse request body
			let body: unknown;
			try {
				body = await c.req.json();
			} catch {
				const errorResponse = createParseErrorResponse();
				return c.json(errorResponse, 400);
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
			const isInitialize = request.method === "initialize";

			let activeSessionId: string | null = sessionIdHeader ?? null;
			if (isInitialize) {
				if (sessionIdHeader) {
					const existing = this.sessionManager.getSession(sessionIdHeader);
					if (!existing) {
						return c.json(
							{
								error: "Session not found",
								message:
									"Session is invalid or has expired. Re-initialize without MCP-Session-Id.",
							},
							404,
						);
					}
				} else {
					const created = this.sessionManager.createSession();
					activeSessionId = created.sessionId;
				}
			} else {
				if (!sessionIdHeader) {
					return c.json(
						{
							error: "Session required",
							message:
								"MCP-Session-Id header is required after initialization.",
						},
						400,
					);
				}
				const existing = this.sessionManager.getSession(sessionIdHeader);
				if (!existing) {
					return c.json(
						{
							error: "Session not found",
							message:
								"Session is invalid or has expired. Re-initialize without MCP-Session-Id.",
						},
						404,
					);
				}
			}

			if (
				isInitialize &&
				typeof (request.params as Record<string, unknown> | undefined)
					?.protocolVersion === "string" &&
				!this.isSupportedProtocolVersion(
					(request.params as Record<string, unknown>).protocolVersion as string
				)
			) {
				const errorResponse = createInvalidRequestResponse(
					"Unsupported protocolVersion in initialize request",
				);
				return c.json(errorResponse, 400);
			}

			// Handle the request
			try {
				const response =
					request.method === "initialize"
						? this.createInitializeResponse(request)
						: await handleMCPRequest(
								request,
								this.executor.getRegistry(),
								{
									...this.executor.getContext(),
									session: activeSessionId
										? this.sessionManager.getSessionStore(activeSessionId)
										: undefined,
								}
						  );

				// For Phase 1, we return application/json (no SSE streaming)
				// Phase 2+ will add SSE support when needed
				if (isInitialize && activeSessionId) {
					c.header("Mcp-Session-Id", activeSessionId);
				}
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

		// MCP session termination (optional per spec)
		app.delete("/mcp", (c) => {
			const sessionIdHeader = c.req.header("mcp-session-id");
			if (!sessionIdHeader) {
				return c.json(
					{
						error: "Session required",
						message: "MCP-Session-Id header is required for DELETE.",
					},
					400,
				);
			}

			if (!this.sessionManager.deleteSession(sessionIdHeader)) {
				return c.json(
					{
						error: "Session not found",
						message:
							"Session is invalid or has expired. Re-initialize without MCP-Session-Id.",
					},
					404,
				);
			}

			return c.body(null, 204);
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
