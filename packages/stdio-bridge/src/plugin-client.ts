/**
 * HTTP clients for communicating with the Obsidian plugin.
 */

import type {
	BridgeClientConfig,
	HealthResponse,
	ToolCallResponse,
	ToolListResponse,
	ErrorResponse,
} from "./types.js";
import { V1BridgeClient } from "./v1-client.js";

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

const DEFAULT_CONFIG: BridgeClientConfig = {
	host: "127.0.0.1",
	port: 3000,
	timeout: 5000,
	apiKey: "",
};

const RETRY_CONFIG = {
	maxRetries: 30,
	initialDelayMs: 1000,
	maxDelayMs: 30000,
} as const;

function resolveConfig(
	config?: Partial<BridgeClientConfig>
): BridgeClientConfig {
	return {
		host: config?.host ?? DEFAULT_CONFIG.host,
		port: config?.port ?? DEFAULT_CONFIG.port,
		timeout: config?.timeout ?? DEFAULT_CONFIG.timeout,
		apiKey: config?.apiKey ?? DEFAULT_CONFIG.apiKey,
	};
}

export class V1PluginClient {
	private readonly timeout: number;
	private readonly v1Client: V1BridgeClient;

	constructor(config?: Partial<BridgeClientConfig>) {
		const mergedConfig = resolveConfig(config);
		this.timeout = mergedConfig.timeout;
		this.v1Client = new V1BridgeClient(
			`http://${mergedConfig.host}:${mergedConfig.port}/bridge/v1`,
			this.fetchJson.bind(this)
		);
	}

	async health(): Promise<HealthResponse> {
		return this.v1Client.health();
	}

	async listTools(): Promise<ToolListResponse> {
		return this.v1Client.listTools();
	}

	async callTool(
		toolName: string,
		args: Record<string, unknown> = {}
	): Promise<ToolCallResponse> {
		return this.v1Client.callTool(toolName, args);
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

	private async fetchJson<T>(
		url: string,
		method: "GET" | "POST",
		body?: unknown,
		_apiKey?: string
	): Promise<T> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
				Accept: "application/json",
			};

			const response = await fetch(url, {
				method,
				headers,
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

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

export class McpProxyClient {
	private readonly mcpBaseUrl: string;
	private readonly timeout: number;
	private readonly apiKey: string;
	private sessionId: string | null = null;

	constructor(config?: Partial<BridgeClientConfig>) {
		const mergedConfig = resolveConfig(config);
		this.mcpBaseUrl = `http://${mergedConfig.host}:${mergedConfig.port}/mcp`;
		this.timeout = mergedConfig.timeout;
		this.apiKey = mergedConfig.apiKey;
	}

	async proxyMcpRequest(payload: string): Promise<string | null> {
		const responseText = await this.fetchText(
			this.mcpBaseUrl,
			"POST",
			payload,
			this.apiKey
		);
		return responseText.length > 0 ? responseText : null;
	}

	async probeMcp(): Promise<boolean> {
		const payload = JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				protocolVersion: "2025-11-25",
				capabilities: {},
				clientInfo: { name: "obsidian-mcp-bridge", version: "unknown" },
			},
		});

		try {
			await this.fetchText(this.mcpBaseUrl, "POST", payload, this.apiKey);
			return true;
		} catch {
			return false;
		}
	}

	private async fetchText(
		url: string,
		method: "GET" | "POST",
		body?: string,
		apiKey: string = ""
	): Promise<string> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
				Accept: "application/json",
			};
			if (apiKey) {
				headers["X-ObsiScripta-Api-Key"] = apiKey;
			}
			if (this.sessionId) {
				headers["Mcp-Session-Id"] = this.sessionId;
			}

			const response = await fetch(url, {
				method,
				headers,
				body: body ?? undefined,
				signal: controller.signal,
			});

			const sessionIdHeader = response.headers.get("mcp-session-id");
			if (sessionIdHeader) {
				this.sessionId = sessionIdHeader;
			}

			const text = await response.text();

			if (!response.ok) {
				throw new PluginClientError(
					text || `HTTP ${response.status}`,
					response.status,
					"HTTP_ERROR",
					{ responseText: text }
				);
			}

			return text;
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
}
