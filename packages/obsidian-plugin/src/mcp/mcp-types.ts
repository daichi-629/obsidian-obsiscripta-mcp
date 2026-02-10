/**
 * MCP Standard Protocol Types (Streamable HTTP Transport)
 * Based on MCP specification 2025-03-26
 *
 * We define our own types based on the MCP spec rather than importing from
 * @modelcontextprotocol/sdk to avoid zod runtime dependencies (which would
 * increase bundle size) and maintain flexibility in our implementation.
 *
 * Type definitions are semantically aligned with @modelcontextprotocol/sdk
 * but adapted for our use case:
 * - Tool.inputSchema uses flexible Record<string, unknown> instead of strict schema
 * - Content types omit optional fields not needed for Phase 1
 *
 * References:
 * - MCP Spec: https://modelcontextprotocol.io/specification/2025-03-26
 * - SDK Types: https://github.com/modelcontextprotocol/typescript-sdk
 *
 * Note: @modelcontextprotocol/sdk is installed as a dependency for future use
 * (e.g., SSE streaming in Phase 2+), but not imported here to avoid runtime overhead.
 */

// MCP Tool Definition (based on SDK but more flexible)
export interface MCPTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

// MCP Content Types (based on SDK types)
export interface MCPTextContent {
	type: "text";
	text: string;
	annotations?: {
		audience?: Array<"user" | "assistant">;
		priority?: number;
	};
}

export interface MCPImageContent {
	type: "image";
	data: string;
	mimeType: string;
	annotations?: {
		audience?: Array<"user" | "assistant">;
		priority?: number;
	};
}

export interface MCPAudioContent {
	type: "audio";
	data: string;
	mimeType: string;
	annotations?: {
		audience?: Array<"user" | "assistant">;
		priority?: number;
	};
}

export interface MCPResourceContent {
	type: "resource";
	resource: {
		uri: string;
		mimeType?: string;
		text?: string;
	};
}

// Content union type
export type MCPContent =
	| MCPTextContent
	| MCPImageContent
	| MCPAudioContent
	| MCPResourceContent;

// JSON-RPC 2.0 base types (not in SDK, so we define them)
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

// JSON-RPC Error Codes (standard codes from JSON-RPC 2.0 spec)
export const JSONRPCErrorCode = {
	ParseError: -32700,
	InvalidRequest: -32600,
	MethodNotFound: -32601,
	InvalidParams: -32602,
	InternalError: -32603,
} as const;

// MCP Tools Protocol Messages (adapted from SDK types)

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
