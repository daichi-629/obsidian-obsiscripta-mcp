/**
 * HTTP client for communicating with the Obsidian plugin's Bridge API
 * Implements health check, tool listing, and tool invocation with retry logic
 */

import type {
	PluginClientConfig,
	HealthResponse,
	ToolListResponse,
	ToolCallResponse,
	ErrorResponse,
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
	private readonly baseUrl: string;
	private readonly timeout: number;

	constructor(config?: Partial<PluginClientConfig>) {
		const mergedConfig = {
			host: config?.host ?? DEFAULT_CONFIG.host,
			port: config?.port ?? DEFAULT_CONFIG.port,
			timeout: config?.timeout ?? DEFAULT_CONFIG.timeout,
		};
		this.baseUrl = `http://${mergedConfig.host}:${mergedConfig.port}/bridge/v1`;
		this.timeout = mergedConfig.timeout;
	}

	/**
	 * Check the health status of the plugin's Bridge API
	 * @returns Health response with status, version, and protocol version
	 */
	async health(): Promise<HealthResponse> {
		return this.request<HealthResponse>("GET", "/health");
	}

	/**
	 * Get the list of available tools from the plugin
	 * @returns Tool list response with tools array and hash
	 */
	async listTools(): Promise<ToolListResponse> {
		return this.request<ToolListResponse>("GET", "/tools");
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
		return this.request<ToolCallResponse>(
			"POST",
			`/tools/${encodeURIComponent(toolName)}/call`,
			{ arguments: args }
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

	/**
	 * Make an HTTP request to the plugin's Bridge API
	 * @param method - HTTP method (GET or POST)
	 * @param path - API endpoint path
	 * @param body - Request body for POST requests
	 * @returns Parsed JSON response
	 * @throws PluginClientError for HTTP errors
	 */
	private async request<T>(
		method: "GET" | "POST",
		path: string,
		body?: unknown
	): Promise<T> {
		const url = `${this.baseUrl}${path}`;
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

			const data = await response.json();

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

			// Handle fetch errors (network, timeout, etc.)
			if (error instanceof Error) {
				if (error.name === "AbortError") {
					throw new PluginClientError(
						`Request timeout after ${this.timeout}ms`,
						0,
						"TIMEOUT"
					);
				}

				// Network errors (ECONNREFUSED, ENOTFOUND, etc.)
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
