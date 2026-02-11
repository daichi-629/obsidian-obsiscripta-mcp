/**
 * MCP Standard Protocol Types (Streamable HTTP Transport)
 * Based on MCP specification 2025-03-26
 *
 * Imports types from @modelcontextprotocol/sdk/spec.types for consistency with
 * the standard. These are pure TypeScript types generated from the spec and
 * do NOT include zod runtime dependencies.
 *
 * References:
 * - MCP Spec: https://modelcontextprotocol.io/specification/2025-03-26
 * - SDK: https://github.com/modelcontextprotocol/typescript-sdk
 */

// Import MCP spec types (pure TypeScript, no runtime dependencies)
import type {
	Tool,
	CallToolResult,
	CallToolRequest,
	ListToolsRequest,
	ListToolsResult,
	TextContent,
	ImageContent,
	AudioContent,
	EmbeddedResource,
	JSONRPCRequest as SpecJSONRPCRequest,
	JSONRPCResponse as SpecJSONRPCResponse,
	JSONRPCResultResponse,
	JSONRPCErrorResponse,
	JSONRPCNotification,
	RequestId,
	Error as SpecError,
} from "@modelcontextprotocol/sdk/spec.types.js";

// Import error code constants as values
import {
	PARSE_ERROR,
	INVALID_REQUEST,
	METHOD_NOT_FOUND,
	INVALID_PARAMS,
	INTERNAL_ERROR,
} from "@modelcontextprotocol/sdk/spec.types.js";

// Re-export SDK spec types with our naming conventions for consistency
export type MCPTool = Tool;
export type MCPTextContent = TextContent;
export type MCPImageContent = ImageContent;
export type MCPAudioContent = AudioContent;
export type MCPResourceContent = EmbeddedResource;

// Content union type (based on spec ContentBlock types)
export type MCPContent =
	| MCPTextContent
	| MCPImageContent
	| MCPAudioContent
	| MCPResourceContent;

// Re-export JSON-RPC types from spec
export type JSONRPCRequest = SpecJSONRPCRequest;
export type JSONRPCResponse = SpecJSONRPCResponse;
export type JSONRPCError = SpecError;
export { JSONRPCNotification, RequestId, JSONRPCResultResponse, JSONRPCErrorResponse };

// Re-export error code constants from spec
export const JSONRPCErrorCode = {
	ParseError: PARSE_ERROR,
	InvalidRequest: INVALID_REQUEST,
	MethodNotFound: METHOD_NOT_FOUND,
	InvalidParams: INVALID_PARAMS,
	InternalError: INTERNAL_ERROR,
} as const;

// Re-export MCP request/response types from spec
export type ToolsListRequest = ListToolsRequest;
export type ToolsListResponse = JSONRPCResultResponse & {
	result: ListToolsResult;
};
export type ToolsCallRequest = CallToolRequest;
export type ToolsCallResponse = JSONRPCResultResponse & {
	result: CallToolResult;
};

// MCP Session Management
export interface MCPSessionInfo {
	sessionId: string;
	createdAt: number;
	lastAccessedAt: number;
	readNotePaths: Set<string>;
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
