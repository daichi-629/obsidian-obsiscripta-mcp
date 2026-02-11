/**
 * MCP stdio <-> MCP HTTP proxy server.
 * Forwards JSON-RPC messages as-is and only manages HTTP auth/session headers.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { JSONRPCMessage, JSONRPCRequest, JSONRPCResponse } from "@modelcontextprotocol/sdk/types.js";
import type { BridgeProxyConfig } from "./types.js";

function isJsonRpcRequest(message: JSONRPCMessage): message is JSONRPCRequest {
	return typeof message === "object" && message !== null && "method" in message;
}

function isJsonRpcResponse(message: unknown): message is JSONRPCResponse {
	return (
		typeof message === "object" &&
		message !== null &&
		("result" in message || "error" in message) &&
		"jsonrpc" in message
	);
}

export class StdioBridgeServer {
	private readonly mcpBaseUrl: string;
	private readonly timeout: number;
	private readonly apiKey: string;
	private transport: StdioServerTransport | null = null;
	private isRunning = false;
	private mcpSessionId: string | null = null;
	private processingQueue = Promise.resolve();
	private requestId = 1;

	constructor(config: BridgeProxyConfig) {
		this.mcpBaseUrl = `http://${config.host}:${config.port}/mcp`;
		this.timeout = config.timeout;
		this.apiKey = config.apiKey;
	}

	async start(): Promise<void> {
		if (this.isRunning) {
			console.warn("[StdioBridgeServer] Server already running");
			return;
		}

		this.transport = new StdioServerTransport();
		this.transport.onmessage = (message) => {
			this.processingQueue = this.processingQueue
				.then(async () => this.handleIncomingMessage(message))
				.catch((error) => {
					console.error("[StdioBridgeServer] Failed to handle message:", error);
				});
		};
		this.transport.onerror = (error) => {
			console.error("[StdioBridgeServer] Transport error:", error);
		};
		this.transport.onclose = () => {
			this.isRunning = false;
		};

		await this.transport.start();
		this.isRunning = true;
		console.error("[StdioBridgeServer] JSON-RPC proxy started");
	}

	async stop(): Promise<void> {
		if (this.transport) {
			await this.transport.close();
		}
		this.transport = null;
		this.isRunning = false;
		console.error("[StdioBridgeServer] Server stopped");
	}

	isServerRunning(): boolean {
		return this.isRunning;
	}

	async forwardRequest(request: JSONRPCRequest): Promise<JSONRPCResponse | undefined> {
		if (request.method !== "initialize") {
			await this.ensureSession();
		}
		return this.forwardJsonRpcMessage(request);
	}

	private async ensureSession(): Promise<void> {
		if (this.mcpSessionId) {
			return;
		}

		const initializeRequest: JSONRPCRequest = {
			jsonrpc: "2.0",
			id: this.requestId++,
			method: "initialize",
			params: {
				protocolVersion: "2025-03-26",
				capabilities: {},
				clientInfo: {
					name: "obsidian-mcp-bridge",
					version: "0.2.0",
				},
			},
		};

		const response = await this.forwardJsonRpcMessage(initializeRequest);
		if (!response) {
			throw new Error("No response to MCP initialize");
		}
		if ("error" in response) {
			throw new Error(`MCP initialize error ${response.error.code}: ${response.error.message}`);
		}
		if (!this.mcpSessionId) {
			throw new Error("MCP initialize response missing MCP-Session-Id header");
		}
	}

	private async handleIncomingMessage(message: JSONRPCMessage): Promise<void> {
		const response = await this.forwardJsonRpcMessage(message);
		if (response && this.transport) {
			await this.transport.send(response);
		}
	}

	private async forwardJsonRpcMessage(
		message: JSONRPCMessage
	): Promise<JSONRPCResponse | undefined> {
		let retriedAfterReset = false;

		while (true) {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), this.timeout);

			try {
				const headers: Record<string, string> = {
					"Content-Type": "application/json",
					Accept: "application/json",
				};
				if (this.apiKey) {
					headers["X-ObsiScripta-Api-Key"] = this.apiKey;
				}
				if (this.mcpSessionId) {
					headers["MCP-Session-Id"] = this.mcpSessionId;
				}

				const response = await fetch(this.mcpBaseUrl, {
					method: "POST",
					headers,
					body: JSON.stringify(message),
					signal: controller.signal,
				});

				if (response.status === 404 && this.mcpSessionId && !retriedAfterReset) {
					this.mcpSessionId = null;
					if (isJsonRpcRequest(message) && message.method !== "initialize") {
						await this.ensureSession();
					}
					retriedAfterReset = true;
					continue;
				}

				if (!response.ok) {
					const errorText = await response.text();
					throw new Error(
						`Upstream HTTP ${response.status}${errorText ? `: ${errorText}` : ""}`
					);
				}

				const sessionId = response.headers.get("MCP-Session-Id") ?? response.headers.get("mcp-session-id");
				if (sessionId) {
					this.mcpSessionId = sessionId;
				}

				const text = await response.text();
				if (!text) {
					return undefined;
				}

				const parsed = JSON.parse(text) as unknown;
				if (isJsonRpcResponse(parsed)) {
					return parsed;
				}

				throw new Error("Upstream returned non JSON-RPC response payload");
			} catch (error) {
				if (isJsonRpcRequest(message) && "id" in message) {
					return {
						jsonrpc: "2.0",
						id: message.id,
						error: {
							code: -32000,
							message: error instanceof Error ? error.message : String(error),
						},
					};
				}
				return undefined;
			} finally {
				clearTimeout(timeoutId);
			}
		}
	}
}

export { StdioBridgeServer as BridgeServer };
