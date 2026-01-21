import { MCPToolDefinition } from "./types";

/**
 * Registry for managing MCP tools
 */
export class ToolRegistry {
	private tools: Map<string, MCPToolDefinition> = new Map();

	/**
	 * Register a new tool
	 */
	register(tool: MCPToolDefinition): void {
		if (this.tools.has(tool.name)) {
			console.warn(`[MCP] Tool "${tool.name}" already registered, overwriting`);
		}
		this.tools.set(tool.name, tool);
		console.log(`[MCP] Registered tool: ${tool.name}`);
	}

	/**
	 * Unregister a tool by name
	 */
	unregister(name: string): boolean {
		const deleted = this.tools.delete(name);
		if (deleted) {
			console.log(`[MCP] Unregistered tool: ${name}`);
		}
		return deleted;
	}

	/**
	 * Get a tool by name
	 */
	get(name: string): MCPToolDefinition | undefined {
		return this.tools.get(name);
	}

	/**
	 * Check if a tool is registered
	 */
	has(name: string): boolean {
		return this.tools.has(name);
	}

	/**
	 * Get all registered tools
	 */
	list(): MCPToolDefinition[] {
		return Array.from(this.tools.values());
	}

	/**
	 * Get the number of registered tools
	 */
	get size(): number {
		return this.tools.size;
	}

	/**
	 * Clear all registered tools
	 */
	clear(): void {
		this.tools.clear();
		console.log("[MCP] Cleared all tools");
	}
}
