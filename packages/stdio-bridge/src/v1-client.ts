import type {
	HealthResponse,
	ToolCallResponse,
	ToolListResponse,
} from "./types.js";

type FetchJson = <T>(
	url: string,
	method: "GET" | "POST",
	body?: unknown,
	apiKey?: string
) => Promise<T>;

export class V1BridgeClient {
	private readonly baseUrl: string;
	private readonly fetchJson: FetchJson;

	constructor(baseUrl: string, fetchJson: FetchJson) {
		this.baseUrl = baseUrl;
		this.fetchJson = fetchJson;
	}

	health(): Promise<HealthResponse> {
		return this.request<HealthResponse>("GET", "/health");
	}

	listTools(): Promise<ToolListResponse> {
		return this.request<ToolListResponse>("GET", "/tools");
	}

	callTool(
		toolName: string,
		args: Record<string, unknown>
	): Promise<ToolCallResponse> {
		return this.request<ToolCallResponse>(
			"POST",
			`/tools/${encodeURIComponent(toolName)}/call`,
			{ arguments: args }
		);
	}

	private request<T>(
		method: "GET" | "POST",
		path: string,
		body?: unknown
	): Promise<T> {
		return this.fetchJson<T>(`${this.baseUrl}${path}`, method, body, "");
	}
}
