import { MCPToolDefinition } from "./types";

/**
 * Registry for managing MCP tools
 */
export enum ToolSource {
	Builtin = "builtin",
	Script = "script",
	Unknown = "unknown",
}

export class ToolRegistry {
	private tools: Map<string, MCPToolDefinition> = new Map();
	private disabledTools: Set<string>;
	private toolSources: Map<string, ToolSource> = new Map();

	constructor(disabledTools?: Iterable<string>) {
		this.disabledTools = new Set(disabledTools);
	}

	/**
	 * Register a new tool
	 */
	register(tool: MCPToolDefinition, source: ToolSource = ToolSource.Unknown): void {
		if (this.tools.has(tool.name)) {
			console.warn(`[Bridge] Tool "${tool.name}" already registered, overwriting`);
		}
		this.tools.set(tool.name, tool);
		this.toolSources.set(tool.name, source);
		console.debug(`[Bridge] Registered tool: ${tool.name}`);
	}

	/**
	 * Unregister a tool by name
	 */
	unregister(name: string): boolean {
		const deleted = this.tools.delete(name);
		if (deleted) {
			this.toolSources.delete(name);
			console.debug(`[Bridge] Unregistered tool: ${name}`);
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
	 * Check if a tool is enabled
	 */
	isEnabled(name: string): boolean {
		return this.tools.has(name) && !this.disabledTools.has(name);
	}

	/**
	 * Enable or disable a tool
	 */
	setEnabled(name: string, enabled: boolean): void {
		if (enabled) {
			this.disabledTools.delete(name);
		} else {
			this.disabledTools.add(name);
		}
	}

	/**
	 * Replace the disabled tools set
	 */
	setDisabledTools(names: Iterable<string>): void {
		this.disabledTools = new Set(names);
	}

	/**
	 * Get the source of a tool
	 */
	getSource(name: string): ToolSource {
		return this.toolSources.get(name) ?? ToolSource.Unknown;
	}

	/**
	 * Get all registered tools
	 */
	list(): MCPToolDefinition[] {
		return Array.from(this.tools.values());
	}

	/**
	 * Get all enabled tools
	 */
	listEnabled(): MCPToolDefinition[] {
		return this.list().filter((tool) => this.isEnabled(tool.name));
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
		this.toolSources.clear();
		console.debug("[Bridge] Cleared all tools");
	}
}
