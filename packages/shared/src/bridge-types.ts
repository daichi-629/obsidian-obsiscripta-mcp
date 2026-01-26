/**
 * Bridge Protocol Type Definitions
 * Shared between obsidian-plugin and stdio-bridge
 */

// =============================================================================
// MCPContent Type
// =============================================================================

/**
 * MCP Content type - represents content in MCP format
 *
 * IMPORTANT: The `content` field relays the MCP format as-is (proxy behavior).
 * - No transformation or extension is performed
 * - This type is used to pass through MCP responses without modification
 *
 * Type: { type: "text" | "image" | ..., text?: string, data?: string, ... }
 */
export type MCPContent = {
	type: "text" | "image";
	text?: string;
	data?: string;
	[key: string]: unknown;
};

// =============================================================================
// Bridge Protocol Types
// =============================================================================

/**
 * Health check response from the plugin
 */
export interface HealthResponse {
	status: "ok";
	version: string;
	protocolVersion: string;
}

/**
 * Tool definition exposed by the plugin
 */
export interface Tool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

/**
 * Response from GET /bridge/v1/tools
 */
export interface ToolListResponse {
	tools: Tool[];
	hash: string;
}

/**
 * Request body for POST /bridge/v1/tools/{name}/call
 */
export interface ToolCallRequest {
	arguments: Record<string, unknown>;
}

/**
 * Successful tool call response
 */
export interface ToolCallSuccessResponse {
	success: true;
	content: MCPContent[];
}

/**
 * Failed tool call response (tool execution error)
 */
export interface ToolCallErrorResponse {
	success: false;
	content: MCPContent[];
	isError: true;
}

/**
 * Tool call response - either success or error
 */
export type ToolCallResponse = ToolCallSuccessResponse | ToolCallErrorResponse;

/**
 * Error response for HTTP errors (404, 400, 500, etc.)
 */
export interface ErrorResponse {
	error: string;
	message: string;
	details?: unknown;
}
