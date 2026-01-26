import {
	createServer,
	Server as HttpServer,
	IncomingMessage,
	ServerResponse,
} from "http";
import { handleHealth, handleToolCall, handleTools } from "./bridge-api";
import { ToolRegistry } from "./tools/registry";
import type { MCPToolContext } from "./tools/types";
import { ToolCallRequest } from "./bridge-types";
import type MCPPlugin from "../main";

export class BridgeServer {
	private static readonly MAX_BODY_BYTES = 1024 * 1024;
	private httpServer: HttpServer | null = null;
	private toolRegistry: ToolRegistry;
	private readonly context: MCPToolContext;
	private port: number;

	constructor(
		plugin: MCPPlugin,
		toolRegistry: ToolRegistry,
		port: number = 3000,
	) {
		this.toolRegistry = toolRegistry;
		this.port = port;
		this.context = {
			vault: plugin.app.vault,
			app: plugin.app,
			plugin: plugin,
		};
	}

	/**
	 * Handle incoming HTTP requests
	 */
	private async handleRequest(
		req: IncomingMessage,
		res: ServerResponse,
	): Promise<void> {
		const url = new URL(req.url || "/", `http://${req.headers.host}`);

		if (!url.pathname.startsWith("/bridge/v1/")) {
			res.writeHead(404, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "Not found" }));
			return;
		}

		// Add CORS headers for local development
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type");

		if (req.method === "OPTIONS") {
			res.writeHead(204);
			res.end();
			return;
		}

		try {
			await this.handleBridgeRequest(req, res, url);
		} catch (error) {
			console.error("[Bridge] Error handling request:", error);
			if (!res.headersSent) {
				res.writeHead(500, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						error:
							error instanceof Error
								? error.message
								: "Internal server error",
					}),
				);
			}
		}
	}

	private async handleBridgeRequest(
		req: IncomingMessage,
		res: ServerResponse,
		url: URL,
	): Promise<void> {
		const sendJson = (status: number, payload: unknown) => {
			res.writeHead(status, { "Content-Type": "application/json" });
			res.end(JSON.stringify(payload));
		};

		try {
			if (url.pathname === "/bridge/v1/health") {
				if (req.method !== "GET") {
					sendJson(405, { error: "Method not allowed" });
					return;
				}
				sendJson(200, handleHealth());
				return;
			}

			if (url.pathname === "/bridge/v1/tools") {
				if (req.method !== "GET") {
					sendJson(405, { error: "Method not allowed" });
					return;
				}
				sendJson(200, handleTools(this.toolRegistry));
				return;
			}

			const toolCallMatch = url.pathname.match(
				/^\/bridge\/v1\/tools\/([^/]+)\/call$/,
			);
			if (toolCallMatch && toolCallMatch[1]) {
				if (req.method !== "POST") {
					sendJson(405, { error: "Method not allowed" });
					return;
				}

				const toolName = decodeURIComponent(toolCallMatch[1]);
				if (!this.toolRegistry.get(toolName)) {
					sendJson(404, { error: "Tool not found" });
					return;
				}

				let payload: ToolCallRequest;
				try {
					const rawBody = await this.readRequestBody(req);
					payload = JSON.parse(rawBody) as ToolCallRequest;
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					if (message === "Request body too large") {
						sendJson(413, { error: "Request body too large" });
					} else {
						sendJson(400, {
							error: "Invalid request body",
							details: message,
						});
					}
					return;
				}

				const hasArguments =
					payload &&
					typeof payload === "object" &&
					"arguments" in payload;
				const argsValue = hasArguments
					? (payload as ToolCallRequest).arguments
					: null;
				if (
					!hasArguments ||
					!argsValue ||
					typeof argsValue !== "object" ||
					Array.isArray(argsValue)
				) {
					sendJson(400, { error: "Invalid request body" });
					return;
				}

				try {
					const response = await handleToolCall(
						toolName,
						argsValue,
						this.toolRegistry,
						this.context,
					);
					sendJson(200, response);
				} catch (error) {
					sendJson(500, {
						error: "Internal server error",
						details:
							error instanceof Error
								? error.message
								: String(error),
					});
				}
				return;
			}

			sendJson(404, { error: "Not found" });
		} catch (error) {
			if (!res.headersSent) {
				sendJson(500, {
					error: "Internal server error",
					details:
						error instanceof Error ? error.message : String(error),
				});
			}
		}
	}

	private async readRequestBody(req: IncomingMessage): Promise<string> {
		return new Promise((resolve, reject) => {
			let data = "";
			let size = 0;
			req.setEncoding("utf8");
			req.on("data", (chunk) => {
				size += chunk.length;
				if (size > BridgeServer.MAX_BODY_BYTES) {
					req.destroy();
					reject(new Error("Request body too large"));
					return;
				}
				data += chunk;
			});
			req.on("end", () => resolve(data));
			req.on("error", (error) => reject(error));
		});
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

			this.httpServer = createServer((req, res) => {
				this.handleRequest(req, res).catch((error) => {
					console.error("[Bridge] Unhandled error:", error);
				});
			});

			this.httpServer.once("error", (error: unknown) => {
				const err =
					error instanceof Error ? error : new Error(String(error));
				const server = this.httpServer;
				this.httpServer = null;
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

			this.httpServer.listen(this.port, "127.0.0.1", () => {
				console.debug(
					`[Bridge] Server started on http://127.0.0.1:${this.port}/bridge/v1`,
				);
				if (settled) {
					return;
				}
				settled = true;
				resolve();
			});
		});
	}

	/**
	 * Stop the HTTP server
	 */
	async stop(): Promise<void> {
		if (this.httpServer) {
			return new Promise((resolve) => {
				this.httpServer!.close(() => {
					console.debug("[Bridge] Server stopped");
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
}
