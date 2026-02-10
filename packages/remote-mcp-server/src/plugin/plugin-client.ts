/**
 * HTTP client for communicating with the Obsidian plugin's Bridge API.
 * Extended from the stdio-bridge version with token-based authentication.
 */

import type {
	HealthResponse,
	ToolListResponse,
	ToolCallResponse,
	ErrorResponse,
} from "../types.js";

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

export interface PluginClientConfig {
	host: string;
	port: number;
	token: string;
	/** Whether authentication is required for plugin communication */
	requireAuth: boolean;
	timeout?: number;
	useTls?: boolean;
}

const DEFAULT_TIMEOUT = 30_000; // 30 seconds for remote use

export class PluginClient {
	private readonly baseUrl: string;
	private readonly timeout: number;
	private readonly token: string;
	private readonly requireAuth: boolean;

	constructor(config: PluginClientConfig) {
		const protocol = config.useTls ? "https" : "http";
		this.baseUrl = `${protocol}://${config.host}:${config.port}/bridge/v1`;
		this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
		this.token = config.token;
		this.requireAuth = config.requireAuth;
	}

	async health(): Promise<HealthResponse> {
		return this.request<HealthResponse>("GET", "/health");
	}

	async listTools(): Promise<ToolListResponse> {
		return this.request<ToolListResponse>("GET", "/tools");
	}

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

	async isAvailable(): Promise<boolean> {
		try {
			const response = await this.health();
			return response.status === "ok";
		} catch {
			return false;
		}
	}

	private async request<T>(
		method: "GET" | "POST",
		path: string,
		body?: unknown
	): Promise<T> {
		const url = `${this.baseUrl}${path}`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
				Accept: "application/json",
			};

			// Add auth token if authentication is required
			if (this.requireAuth && this.token) {
				headers["Authorization"] = `Bearer ${this.token}`;
			}

			const response = await fetch(url, {
				method,
				headers,
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
