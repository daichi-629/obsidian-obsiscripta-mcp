import { App, Vault } from "obsidian";
import type MCPPlugin from "../../main";

/**
 * Context provided to MCP tool handlers
 */
export interface MCPToolContext {
	vault: Vault;
	app: App;
	plugin: MCPPlugin;
}

/**
 * JSON Schema for tool input validation
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
 * Result returned by tool handlers
 * Compatible with MCP SDK CallToolResult
 */
export interface MCPToolResult {
	[key: string]: unknown;
	content: Array<{
		type: "text";
		text: string;
	}>;
	isError?: boolean;
}

/**
 * Definition for an MCP tool
 */
export interface MCPToolDefinition {
	name: string;
	description: string;
	inputSchema: JSONSchema;
	handler: (args: Record<string, unknown>, context: MCPToolContext) => Promise<MCPToolResult>;
}
