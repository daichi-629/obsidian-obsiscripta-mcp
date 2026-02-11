/**
 * HTTP client for communicating with the Obsidian plugin MCP endpoint.
 * This client intentionally behaves as a thin proxy:
 * - always sends MCP JSON-RPC bodies as-is
 * - always forwards plugin API key header
 * - only manages MCP session lifecycle (initialize + MCP-Session-Id)
 */

import { createHash } from "node:crypto";
import type {
	CallToolResult,
	JSONRPCErrorResponse,
	JSONRPCResponse,
	ListToolsResult,
} from "@modelcontextprotocol/sdk/spec.types.js";
import type {
	PluginClientConfig,
	HealthResponse,
	Tool,
	ToolListResponse,
	ToolCallResponse,
	ErrorResponse,
	MCPContent,
} from "./types.js";

/**
 * Error thrown when the plugin returns an HTTP error response
 */
export class PluginClientError extends Error {
	constructor(
		message: string,
		public readonly statusCode: number,
		public readonly errorCode?: string,
		public readonly details?: unknown
	) {
		super(message);
		this.name = "PluginClientError";
	}
}

/**
 * Error thrown when retry attempts are exhausted
 */
export class RetryExhaustedError extends Error {
	constructor(
		message: string,
		public readonly attempts: number,
		public readonly lastError: Error
	) {
		super(message);
		this.name = "RetryExhaustedError";
	}
}

const DEFAULT_CONFIG = {
	host: "127.0.0.1",
	port: 3000,
	timeout: 5000,
	apiKey: "",
} as const;

const RETRY_CONFIG = {
	maxRetries: 30,
	initialDelayMs: 1000,
	maxDelayMs: 30000,
} as const;

export class PluginClient {
	private readonly mcpBaseUrl: string;
	private readonly timeout: number;
	private readonly apiKey: string;
	private requestId = 1;
	private mcpSessionId: string | null = null;

	constructor(config?: Partial<PluginClientConfig>) {
		const host = config?.host ?? DEFAULT_CONFIG.host;
		const port = config?.port ?? DEFAULT_CONFIG.port;
		this.timeout = config?.timeout ?? DEFAULT_CONFIG.timeout;
		this.apiKey = config?.apiKey ?? DEFAULT_CONFIG.apiKey;
		this.mcpBaseUrl = `http://${host}:${port}/mcp`;

		if ((config?.transportMode ?? "auto") !== "mcp") {
			console.error(
				"[PluginClient] Running in MCP proxy mode only (Bridge v1 fallback is disabled)."
			);
		}
	}

	async health(): Promise<HealthResponse> {
		await this.mcpRequest<ListToolsResult>("tools/list", {});
		return {
			status: "ok",
			version: "unknown",
			protocolVersion: "mcp-standard-http",
		};
	}

	async listTools(): Promise<ToolListResponse> {
		const result = await this.mcpRequest<ListToolsResult>("tools/list", {});
		const tools = this.convertMcpTools(result.tools);
		return {
			tools,
			hash: this.hashTools(tools),
		};
	}

	async callTool(
		toolName: string,
		args: Record<string, unknown> = {}
	): Promise<ToolCallResponse> {
		const result = await this.mcpRequest<CallToolResult>("tools/call", {
			name: toolName,
			arguments: args,
		});

		const content = this.normalizeMcpContent(result.content);
		if (result.isError) {
			return {
				success: false,
				content,
				isError: true,
			};
		}

		return {
			success: true,
			content,
		};
	}

	async isAvailable(): Promise<boolean> {
		try {
			const response = await this.health();
			return response.status === "ok";
		} catch {
			return false;
		}
	}

	async waitForPlugin(
		maxRetries: number = RETRY_CONFIG.maxRetries,
		initialDelayMs: number = RETRY_CONFIG.initialDelayMs
	): Promise<HealthResponse> {
		return this.withRetry(() => this.health(), maxRetries, initialDelayMs);
	}

	private async mcpRequest<T>(method: string, params: unknown): Promise<T> {
		let retryAfterSessionReset = false;

		while (true) {
			try {
				if (!this.mcpSessionId) {
					this.mcpSessionId = await this.initializeMcpSession();
				}

				const { response } = await this.sendMcpRequest(method, params, this.mcpSessionId);
				if ("error" in response) {
					const error = (response as JSONRPCErrorResponse).error;
					throw new PluginClientError(
						`MCP error ${error.code}: ${error.message}`,
						502,
						"MCP_ERROR",
						{ mcpError: error, data: error.data }
					);
				}

				if (!("result" in response)) {
					throw new PluginClientError(
						"MCP response missing result",
						502,
						"INVALID_MCP_RESPONSE"
					);
				}

				return response.result as T;
			} catch (error) {
				if (
					error instanceof PluginClientError &&
					error.statusCode === 404 &&
					!retryAfterSessionReset
				) {
					this.mcpSessionId = null;
					retryAfterSessionReset = true;
					continue;
				}
				throw error;
			}
		}
	}

	private async initializeMcpSession(): Promise<string> {
		const requestId = this.requestId++;
		const { response, headers } = await this.fetchMcpJsonRpc(
			{
				jsonrpc: "2.0" as const,
				id: requestId,
				method: "initialize",
				params: {
					protocolVersion: "2025-03-26",
					capabilities: {},
					clientInfo: {
						name: "obsidian-mcp-bridge",
						version: "0.2.0",
					},
				},
			},
			requestId,
			null
		);

		if ("error" in response) {
			const error = (response as JSONRPCErrorResponse).error;
			throw new PluginClientError(
				`MCP initialize error ${error.code}: ${error.message}`,
				502,
				"MCP_ERROR",
				{ mcpError: error, data: error.data }
			);
		}

		const sessionId = headers.get("MCP-Session-Id") ?? headers.get("mcp-session-id");
		if (!sessionId) {
			throw new PluginClientError(
				"MCP initialize response missing MCP-Session-Id",
				502,
				"INVALID_MCP_RESPONSE"
			);
		}

		return sessionId;
	}

	private async sendMcpRequest(
		method: string,
		params: unknown,
		sessionId: string | null
	): Promise<{ response: JSONRPCResponse; headers: Headers }> {
		const requestId = this.requestId++;
		return this.fetchMcpJsonRpc(
			{
				jsonrpc: "2.0" as const,
				id: requestId,
				method,
				params,
			},
			requestId,
			sessionId
		);
	}

	private convertMcpTools(tools: ListToolsResult["tools"]): Tool[] {
		return tools.map((tool) => ({
			name: tool.name,
			description: tool.description ?? "",
			inputSchema: tool.inputSchema ?? {},
		}));
	}

	private hashTools(tools: Tool[]): string {
		return createHash("sha256").update(JSON.stringify(tools)).digest("hex");
	}

	private normalizeMcpContent(content: unknown): MCPContent[] {
		if (!Array.isArray(content)) {
			return [];
		}

		return content
			.filter((item): item is MCPContent =>
				typeof item === "object" && item !== null && "type" in item
			)
			.map((item) => item);
	}

	private parseSSEData(raw: string, expectedId: number): JSONRPCResponse {
		const events = raw.split("\n\n");
		for (const event of events) {
			const dataLines = event
				.split("\n")
				.filter((line) => line.startsWith("data:"))
				.map((line) => line.slice(5).trimStart());
			if (dataLines.length === 0) {
				continue;
			}

			const data = dataLines.join("\n").trim();
			if (!data) {
				continue;
			}

			let message: unknown;
			try {
				message = JSON.parse(data) as unknown;
			} catch {
				continue;
			}

			if (typeof message !== "object" || message === null || !("id" in message)) {
				continue;
			}

			const candidate = message as { id?: unknown };
			if (candidate.id === expectedId) {
				return message as JSONRPCResponse;
			}
		}

		throw new PluginClientError(
			`SSE stream did not include JSON-RPC response for request id ${expectedId}`,
			502,
			"INVALID_MCP_RESPONSE"
		);
	}

	private async fetchMcpJsonRpc(
		body: unknown,
		expectedId: number,
		sessionId: string | null
	): Promise<{ response: JSONRPCResponse; headers: Headers }> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
			};
			if (this.apiKey) {
				headers["X-ObsiScripta-Api-Key"] = this.apiKey;
			}
			if (sessionId) {
				headers["MCP-Session-Id"] = sessionId;
			}

			const response = await fetch(this.mcpBaseUrl, {
				method: "POST",
				headers,
				body: JSON.stringify(body),
				signal: controller.signal,
			});

			const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
			const text = await response.text();
			let data: unknown = {};
			if (text) {
				if (contentType.includes("text/event-stream")) {
					data = this.parseSSEData(text, expectedId);
				} else {
					data = JSON.parse(text) as unknown;
				}
			}

			if (!response.ok) {
				const errorResponse = data as ErrorResponse;
				throw new PluginClientError(
					errorResponse.message || `HTTP ${response.status}`,
					response.status,
					errorResponse.error,
					errorResponse.details
				);
			}

			return { response: data as JSONRPCResponse, headers: response.headers };
		} catch (error) {
			if (error instanceof PluginClientError) {
				throw error;
			}

			if (error instanceof Error) {
				if (error.name === "AbortError") {
					throw new PluginClientError(
						`Request timeout after ${this.timeout}ms`,
						0,
						"TIMEOUT"
					);
				}

				if (error instanceof SyntaxError) {
					throw new PluginClientError(
						`Invalid JSON response: ${error.message}`,
						502,
						"INVALID_JSON"
					);
				}

				throw new PluginClientError(
					`Network error: ${error.message}`,
					0,
					"NETWORK_ERROR"
				);
			}

			throw new PluginClientError(
				`Unknown error: ${String(error)}`,
				0,
				"UNKNOWN_ERROR"
			);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	private async withRetry<T>(
		fn: () => Promise<T>,
		maxRetries: number = RETRY_CONFIG.maxRetries,
		initialDelayMs: number = RETRY_CONFIG.initialDelayMs
	): Promise<T> {
		let lastError: Error = new Error("No attempts made");
		let delayMs = initialDelayMs;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				return await fn();
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				if (
					error instanceof PluginClientError &&
					error.statusCode >= 400 &&
					error.statusCode < 500
				) {
					throw error;
				}

				if (attempt < maxRetries) {
					await this.sleep(delayMs);
					delayMs = Math.min(delayMs * 2, RETRY_CONFIG.maxDelayMs);
				}
			}
		}

		throw new RetryExhaustedError(
			`Failed after ${maxRetries} attempts: ${lastError.message}`,
			maxRetries,
			lastError
		);
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
