/**
 * Type definitions for stdio-bridge
 * Phase 3: Implement actual types
 */

export interface BridgeConfig {
	pluginHost: string;
	pluginPort: number;
}

export interface ToolRequest {
	name: string;
	arguments?: Record<string, unknown>;
}

export interface ToolResponse {
	content: unknown[];
	isError?: boolean;
}
