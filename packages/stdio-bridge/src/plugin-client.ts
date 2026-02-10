/**
 * HTTP client for communicating with the Obsidian plugin's Bridge API
 * Implements health check, tool listing, and tool invocation with retry logic
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
	TransportMode,
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

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
	host: "127.0.0.1",
	port: 3000,
	timeout: 5000, // 5 seconds
	transportMode: "auto" as const,
} as const;

/**
 * Retry configuration
 */
const RETRY_CONFIG = {
	maxRetries: 30,
	initialDelayMs: 1000, // 1 second
	maxDelayMs: 30000, // 30 seconds cap
} as const;

/**
 * HTTP client for communicating with the Obsidian plugin's Bridge API
 */
export class PluginClient {
	private readonly v1BaseUrl: string;
	private readonly mcpBaseUrl: string;
	private readonly timeout: number;
	private readonly transportMode: TransportMode;
	private preferredTransport: "mcp" | "v1";
	private fallbackCount = 0;
	private requestId = 1;

	constructor(config?: Partial<PluginClientConfig>) {
		const mergedConfig = {
			host: config?.host ?? DEFAULT_CONFIG.host,
			port: config?.port ?? DEFAULT_CONFIG.port,
			timeout: config?.timeout ?? DEFAULT_CONFIG.timeout,
			transportMode: config?.transportMode ?? DEFAULT_CONFIG.transportMode,
		};
		this.v1BaseUrl = `http://${mergedConfig.host}:${mergedConfig.port}/bridge/v1`;
		this.mcpBaseUrl = `http://${mergedConfig.host}:${mergedConfig.port}/mcp`;
		this.timeout = mergedConfig.timeout;
		this.transportMode = mergedConfig.transportMode;
		this.preferredTransport = mergedConfig.transportMode === "v1" ? "v1" : "mcp";

		console.error(
			`[PluginClient] Transport mode: ${this.transportMode} (preferred: ${this.preferredTransport})`
		);
	}

	/**
	 * Check the health status of the plugin's Bridge API
	 * @returns Health response with status, version, and protocol version
	 */
	async health(): Promise<HealthResponse> {
		return this.executeWithTransportFallback(
			"health",
			() => this.mcpHealth(),
			() => this.v1Health()
		);
	}

	/**
	 * Get the list of available tools from the plugin
	 * @returns Tool list response with tools array and hash
	 */
	async listTools(): Promise<ToolListResponse> {
		return this.executeWithTransportFallback(
			"listTools",
			() => this.mcpListTools(),
			() => this.v1ListTools()
		);
	}

	/**
	 * Call a tool by name with the given arguments
	 * @param toolName - The name of the tool to call
	 * @param args - The arguments to pass to the tool
	 * @returns Tool call response with content and success status
	 * @throws PluginClientError if the tool is not found or arguments are invalid
	 */
	async callTool(
		toolName: string,
		args: Record<string, unknown> = {}
	): Promise<ToolCallResponse> {
		return this.executeWithTransportFallback(
			"callTool",
			() => this.mcpCallTool(toolName, args),
			() => this.v1CallTool(toolName, args)
		);
	}

	/**
	 * Check if the plugin is available (health check succeeds)
	 * @returns true if the plugin responds to health check
	 */
	async isAvailable(): Promise<boolean> {
		try {
			const response = await this.health();
			return response.status === "ok";
		} catch {
			return false;
		}
	}

	/**
	 * Wait for the plugin to become available with exponential backoff retry
	 * @param maxRetries - Maximum number of retry attempts (default: 30)
	 * @param initialDelayMs - Initial delay between retries in milliseconds (default: 1000)
	 * @returns Health response when available
	 * @throws RetryExhaustedError if all retries are exhausted
	 */
	async waitForPlugin(
		maxRetries: number = RETRY_CONFIG.maxRetries,
		initialDelayMs: number = RETRY_CONFIG.initialDelayMs
	): Promise<HealthResponse> {
		return this.withRetry(() => this.health(), maxRetries, initialDelayMs);
	}

	private async executeWithTransportFallback<T>(
		operation: string,
		mcpOperation: () => Promise<T>,
		v1Operation: () => Promise<T>
	): Promise<T> {
		if (!this.shouldUseMcpFirst()) {
			return v1Operation();
		}

		try {
			return await mcpOperation();
		} catch (error) {
			if (!this.canFallbackToV1() || !this.shouldFallbackToV1(operation, error)) {
				throw error;
			}
			this.logFallback(operation, error);
			return v1Operation();
		}
	}

	private shouldFallbackToV1(operation: string, error: unknown): boolean {
		if (operation !== "callTool") {
			return true;
		}

		if (!(error instanceof PluginClientError)) {
			return false;
		}

		const mcpError = error.details as { mcpError?: { code?: number } } | undefined;
		if (mcpError?.mcpError?.code === -32601) {
			return true;
		}

		return error.statusCode === 404 || error.statusCode === 405 || error.statusCode === 501;
	}

	private async mcpHealth(): Promise<HealthResponse> {
		await this.mcpToolsList();
		return {
			status: "ok",
			version: "unknown",
			protocolVersion: "mcp-standard-http",
		};
	}

	private async v1Health(): Promise<HealthResponse> {
		return this.v1Request<HealthResponse>("GET", "/health");
	}

	private async mcpListTools(): Promise<ToolListResponse> {
		const result = await this.mcpToolsList();
		const tools = this.convertMcpTools(result.tools);
		return {
			tools,
			hash: this.hashTools(tools),
		};
	}

	private async v1ListTools(): Promise<ToolListResponse> {
		return this.v1Request<ToolListResponse>("GET", "/tools");
	}

	private async mcpCallTool(
		toolName: string,
		args: Record<string, unknown>
	): Promise<ToolCallResponse> {
		const result = await this.mcpToolsCall(toolName, args);
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

	private async v1CallTool(
		toolName: string,
		args: Record<string, unknown>
	): Promise<ToolCallResponse> {
		return this.v1Request<ToolCallResponse>(
			"POST",
			`/tools/${encodeURIComponent(toolName)}/call`,
			{ arguments: args }
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

	/**
	 * Execute a function with exponential backoff retry logic
	 * @param fn - The async function to execute
	 * @param maxRetries - Maximum number of retry attempts
	 * @param initialDelayMs - Initial delay between retries in milliseconds
	 * @returns The result of the function
	 * @throws RetryExhaustedError if all retries are exhausted
	 */
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

				// Don't retry on client errors (4xx) except timeout/network issues
				if (
					error instanceof PluginClientError &&
					error.statusCode >= 400 &&
					error.statusCode < 500
				) {
					throw error;
				}

				if (attempt < maxRetries) {
					await this.sleep(delayMs);
					// Exponential backoff with cap
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

	private shouldUseMcpFirst(): boolean {
		if (this.transportMode === "v1") {
			return false;
		}
		if (this.transportMode === "mcp") {
			return true;
		}
		return this.preferredTransport === "mcp";
	}

	private canFallbackToV1(): boolean {
		return this.transportMode === "auto";
	}

	private logFallback(operation: string, error: unknown): void {
		this.fallbackCount += 1;
		this.preferredTransport = "v1";
		const reason = error instanceof Error ? error.message : String(error);
		console.error(
			`[PluginClient] MCP fallback triggered (${operation}) -> Bridge v1; reason="${reason}"; fallbackCount=${this.fallbackCount}`
		);
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

	private async mcpToolsList(): Promise<ListToolsResult> {
		const response = await this.mcpRequest<ListToolsResult>("tools/list", {});
		if (!Array.isArray(response.tools)) {
			throw new PluginClientError(
				"Invalid MCP tools/list response",
				502,
				"INVALID_MCP_RESPONSE"
			);
		}
		return response;
	}

	private async mcpToolsCall(
		toolName: string,
		args: Record<string, unknown>
	): Promise<CallToolResult> {
		const response = await this.mcpRequest<CallToolResult>("tools/call", {
			name: toolName,
			arguments: args,
		});
		if (!response || typeof response !== "object") {
			throw new PluginClientError(
				"Invalid MCP tools/call response",
				502,
				"INVALID_MCP_RESPONSE"
			);
		}
		return response;
	}

	private async mcpRequest<T>(method: string, params: unknown): Promise<T> {
		const body = {
			jsonrpc: "2.0" as const,
			id: this.requestId++,
			method,
			params,
		};
		const response = await this.fetchJson<JSONRPCResponse>(
			this.mcpBaseUrl,
			"POST",
			body
		);
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
	}

	private async v1Request<T>(
		method: "GET" | "POST",
		path: string,
		body?: unknown
	): Promise<T> {
		return this.fetchJson<T>(`${this.v1BaseUrl}${path}`, method, body);
	}

	private async fetchJson<T>(
		url: string,
		method: "GET" | "POST",
		body?: unknown
	): Promise<T> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			const response = await fetch(url, {
				method,
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
				},
				body: body ? JSON.stringify(body) : undefined,
				signal: controller.signal,
			});

			const text = await response.text();
			const data = text ? (JSON.parse(text) as unknown) : {};

			if (!response.ok) {
				const errorResponse = data as ErrorResponse;
				throw new PluginClientError(
					errorResponse.message || `HTTP ${response.status}`,
					response.status,
					errorResponse.error,
					errorResponse.details
				);
			}

			return data as T;
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

	/**
	 * Sleep for a given number of milliseconds
	 * @param ms - Milliseconds to sleep
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
