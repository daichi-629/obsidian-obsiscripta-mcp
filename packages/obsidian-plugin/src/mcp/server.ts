import {
	createServer,
	Server as HttpServer,
	IncomingMessage,
	ServerResponse,
} from "http";
import type { Socket } from "net";
import { ToolExecutor } from "./tools/executor";
import { ToolCallRequest } from "./bridge-types";

export class BridgeServer {
	private static readonly MAX_BODY_BYTES = 1024 * 1024;
	private httpServer: HttpServer | null = null;
	private sockets = new Set<Socket>();
	private readonly executor: ToolExecutor;
	private port: number;

	constructor(
		executor: ToolExecutor,
		port: number = 3000,
	) {
		this.executor = executor;
		this.port = port;
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
			res.end(JSON.stringify({ error: "Not found", message: "Not found" }));
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
						message:
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
		const sendError = (
			status: number,
			error: string,
			message: string = error,
			details?: unknown,
		) => {
			sendJson(status, {
				error,
				message,
				...(details === undefined ? {} : { details }),
			});
		};

		try {
			if (url.pathname === "/bridge/v1/health") {
				if (req.method !== "GET") {
					sendError(405, "Method not allowed");
					return;
				}
				sendJson(200, this.executor.getHealth());
				return;
			}

			if (url.pathname === "/bridge/v1/tools") {
				if (req.method !== "GET") {
					sendError(405, "Method not allowed");
					return;
				}
				sendJson(200, this.executor.getTools());
				return;
			}

			const toolCallMatch = url.pathname.match(
				/^\/bridge\/v1\/tools\/([^/]+)\/call$/,
			);
			if (toolCallMatch && toolCallMatch[1]) {
				if (req.method !== "POST") {
					sendError(405, "Method not allowed");
					return;
				}

				const toolName = decodeURIComponent(toolCallMatch[1]);
				if (!this.executor.isToolAvailable(toolName)) {
					sendError(404, "Tool not found");
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
						sendError(413, "Request body too large");
					} else {
						sendError(400, "Invalid request body", "Invalid request body", message);
					}
					return;
				}

				const hasArguments =
					payload &&
					typeof payload === "object" &&
					"arguments" in payload;
				const argsValue = hasArguments
					? payload.arguments
					: null;
				if (
					!hasArguments ||
					!argsValue ||
					typeof argsValue !== "object" ||
					Array.isArray(argsValue)
				) {
					sendError(400, "Invalid request body");
					return;
				}

				try {
					const response = await this.executor.executeToolCall(
						toolName,
						argsValue,
					);
					sendJson(200, response);
				} catch (error) {
					sendError(
						500,
						"Internal server error",
						"Internal server error",
						error instanceof Error ? error.message : String(error),
					);
				}
				return;
			}

			sendError(404, "Not found");
		} catch (error) {
			if (!res.headersSent) {
				sendError(
					500,
					"Internal server error",
					"Internal server error",
					error instanceof Error ? error.message : String(error),
				);
			}
		}
	}

	private async readRequestBody(req: IncomingMessage): Promise<string> {
		return new Promise((resolve, reject) => {
			let data = "";
			let size = 0;
			req.setEncoding("utf8");
			req.on("data", (chunk: string) => {
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
			this.httpServer.on("connection", (socket) => {
				this.sockets.add(socket);
				socket.on("close", () => {
					this.sockets.delete(socket);
				});
			});

			this.httpServer.once("error", (error: unknown) => {
				const err =
					error instanceof Error ? error : new Error(String(error));
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
				const server = this.httpServer;
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
