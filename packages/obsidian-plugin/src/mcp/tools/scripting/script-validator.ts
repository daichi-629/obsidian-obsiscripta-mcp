import { MCPToolDefinition } from "../types";

export function isToolDefinitionLike(exports: unknown): exports is Partial<MCPToolDefinition> {
	if (!exports || typeof exports !== "object") {
		return false;
	}

	const obj = exports as Partial<MCPToolDefinition>;
	return Boolean(obj.description || obj.inputSchema || obj.handler);
}

/**
 * Validates that an exported object has the shape of an MCPToolDefinition.
 * The tool name is provided by the loader (derived from script path) rather than
 * being exported by the script itself.
 */
export function validateAndConvertScriptExports(
	exports: unknown,
	scriptPath: string,
	toolName: string
): MCPToolDefinition {
	if (!exports || typeof exports !== "object") {
		throw new Error(`Script ${scriptPath} must export an object`);
	}

	const obj = exports as Partial<MCPToolDefinition>;

	if (!obj.description || typeof obj.description !== "string") {
		throw new Error(`Script ${scriptPath} must export a 'description' string`);
	}

	if (!obj.inputSchema || obj.inputSchema.type !== "object") {
		throw new Error(`Script ${scriptPath} must export an 'inputSchema' with type "object"`);
	}

	if (!obj.inputSchema.properties || typeof obj.inputSchema.properties !== "object") {
		throw new Error(`Script ${scriptPath} inputSchema must define 'properties'`);
	}

	if (!obj.handler || typeof obj.handler !== "function") {
		throw new Error(`Script ${scriptPath} must export a 'handler' function`);
	}

	// Use the loader-provided name instead of trusting the script's exported name
	return {
		...obj,
		name: toolName,
	} as MCPToolDefinition;
}
