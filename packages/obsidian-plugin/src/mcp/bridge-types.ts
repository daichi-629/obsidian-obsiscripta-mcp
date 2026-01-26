export type MCPContent = {
	type: "text" | "image";
	text?: string;
	data?: string;
	[key: string]: unknown;
};

export interface HealthResponse {
	status: "ok";
	version: string;
	protocolVersion: string;
}

export interface Tool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

export interface ToolListResponse {
	tools: Tool[];
	hash: string;
}

export interface ToolCallRequest {
	arguments: Record<string, unknown>;
}

export interface ToolCallSuccessResponse {
	success: true;
	content: MCPContent[];
}

export interface ToolCallErrorResponse {
	success: false;
	content: MCPContent[];
	isError: true;
}

export type ToolCallResponse = ToolCallSuccessResponse | ToolCallErrorResponse;

export interface ErrorResponse {
	error: string;
	message: string;
	details?: unknown;
}
