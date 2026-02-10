/**
 * MCP Standard Protocol Types (Streamable HTTP Transport)
 * Based on MCP specification 2025-03-26
 *
 * Imports types from @modelcontextprotocol/sdk for consistency with the standard.
 * This includes zod as a dependency, but ensures our types stay aligned with
 * the official MCP protocol.
 *
 * References:
 * - MCP Spec: https://modelcontextprotocol.io/specification/2025-03-26
 * - SDK: https://github.com/modelcontextprotocol/typescript-sdk
 */

// Import MCP SDK types (runtime dependency via zod is acceptable)
import type {
	Tool,
	CallToolResult,
	TextContent,
	ImageContent,
	AudioContent,
	EmbeddedResource,
} from "@modelcontextprotocol/sdk/types.js";

// Re-export SDK types with our naming conventions for consistency
export type MCPTool = Tool;
export type MCPTextContent = TextContent;
export type MCPImageContent = ImageContent;
export type MCPAudioContent = AudioContent;
export type MCPResourceContent = EmbeddedResource;

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

// MCP Tools Protocol Messages (using SDK types where applicable)

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
	result: CallToolResult;
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
