/**
 * Type definitions for stdio-bridge
 * Re-exports Bridge Protocol types from @obsiscripta/shared
 * and defines stdio-bridge specific types
 */

// =============================================================================
// Re-export Bridge Protocol Types from shared package
// =============================================================================

export type {
	MCPContent,
	HealthResponse,
	Tool,
	ToolListResponse,
	ToolCallRequest,
	ToolCallSuccessResponse,
	ToolCallErrorResponse,
	ToolCallResponse,
	ErrorResponse,
} from "@obsiscripta/shared";

// Import MCPContent for use in this file
import type { MCPContent } from "@obsiscripta/shared";

// =============================================================================
// stdio-bridge Specific Types
// =============================================================================

/**
 * Configuration for the plugin HTTP client
 */
export interface PluginClientConfig {
	host: string;
	port: number;
	timeout: number;
	transportMode: TransportMode;
}

/**
 * Transport mode for plugin communication
 * - auto: MCP Standard HTTP first, fallback to Bridge v1
 * - mcp: MCP Standard HTTP only
 * - v1: Bridge v1 only
 */
export type TransportMode = "auto" | "mcp" | "v1";

/**
 * JSON Schema for tool input validation (simplified for stdio-bridge)
 */
export interface JSONSchema {
	type: "object";
	properties: Record<string, {
		type: "string" | "number" | "boolean" | "array" | "object";
		description?: string;
		enum?: string[];
		items?: JSONSchema | { type: string };
		default?: unknown;
	}>;
	required?: string[];
}

/**
 * MCP Tool definition used internally by stdio-bridge
 */
export interface MCPToolDefinition {
	name: string;
	description: string;
	inputSchema: JSONSchema | Record<string, unknown>;
}

/**
 * State for tool polling and synchronization
 */
export interface PollingState {
	lastHash: string;
	tools: Map<string, MCPToolDefinition>;
	lastError?: Error;
}
