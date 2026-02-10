/**
 * MCP Standard Protocol Types (Streamable HTTP Transport)
 * Based on MCP specification 2025-03-26
 */

// JSON-RPC 2.0 base types
export interface JSONRPCRequest {
	jsonrpc: "2.0";
	id: string | number;
	method: string;
	params?: unknown;
}

export interface JSONRPCResponse {
	jsonrpc: "2.0";
	id: string | number;
	result?: unknown;
	error?: JSONRPCError;
}

export interface JSONRPCNotification {
	jsonrpc: "2.0";
	method: string;
	params?: unknown;
}

export interface JSONRPCError {
	code: number;
	message: string;
	data?: unknown;
}

// JSON-RPC Error Codes
export const JSONRPCErrorCode = {
	ParseError: -32700,
	InvalidRequest: -32600,
	MethodNotFound: -32601,
	InvalidParams: -32602,
	InternalError: -32603,
} as const;

// MCP Tools Protocol Messages

export interface ToolsListRequest extends JSONRPCRequest {
	method: "tools/list";
	params?: {
		cursor?: string;
	};
}

export interface ToolsListResponse extends JSONRPCResponse {
	result: {
		tools: MCPTool[];
		nextCursor?: string;
	};
}

export interface ToolsCallRequest extends JSONRPCRequest {
	method: "tools/call";
	params: {
		name: string;
		arguments?: Record<string, unknown>;
	};
}

export interface ToolsCallResponse extends JSONRPCResponse {
	result: {
		content: MCPContent[];
		isError?: boolean;
	};
}

// MCP Tool Definition
export interface MCPTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

// MCP Content Types
export type MCPContent =
	| MCPTextContent
	| MCPImageContent
	| MCPAudioContent
	| MCPResourceContent;

export interface MCPTextContent {
	type: "text";
	text: string;
}

export interface MCPImageContent {
	type: "image";
	data: string;
	mimeType: string;
}

export interface MCPAudioContent {
	type: "audio";
	data: string;
	mimeType: string;
}

export interface MCPResourceContent {
	type: "resource";
	resource: {
		uri: string;
		mimeType?: string;
		text?: string;
	};
}

// MCP Session Management
export interface MCPSessionInfo {
	sessionId: string;
	createdAt: number;
	lastAccessedAt: number;
}

// Type guards
export function isJSONRPCRequest(value: unknown): value is JSONRPCRequest {
	return (
		typeof value === "object" &&
		value !== null &&
		"jsonrpc" in value &&
		value.jsonrpc === "2.0" &&
		"method" in value &&
		typeof value.method === "string" &&
		"id" in value
	);
}

export function isJSONRPCNotification(
	value: unknown
): value is JSONRPCNotification {
	return (
		typeof value === "object" &&
		value !== null &&
		"jsonrpc" in value &&
		value.jsonrpc === "2.0" &&
		"method" in value &&
		typeof value.method === "string" &&
		!("id" in value)
	);
}

export function isJSONRPCResponse(value: unknown): value is JSONRPCResponse {
	return (
		typeof value === "object" &&
		value !== null &&
		"jsonrpc" in value &&
		value.jsonrpc === "2.0" &&
		"id" in value &&
		("result" in value || "error" in value)
	);
}

export function isToolsListRequest(
	request: JSONRPCRequest
): request is ToolsListRequest {
	return request.method === "tools/list";
}

export function isToolsCallRequest(
	request: JSONRPCRequest
): request is ToolsCallRequest {
	return (
		request.method === "tools/call" &&
		typeof request.params === "object" &&
		request.params !== null &&
		"name" in request.params
	);
}
