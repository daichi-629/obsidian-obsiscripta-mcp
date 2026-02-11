import { ToolRegistry } from "./registry";
import type { AppContext } from "../../plugin/context";
import { createSessionAwareContext } from "./session-store";

/**
 * Encapsulates tool execution logic with registry and context.
 * This separates tool execution concerns from HTTP server concerns.
 */
export class ToolExecutor {
	private readonly registry: ToolRegistry;
	private readonly context: AppContext;

	constructor(registry: ToolRegistry, context: AppContext) {
		this.registry = registry;
		this.context = context;
	}

	/**
	 * Get the tool registry (for MCP standard HTTP handlers)
	 */
	getRegistry(): ToolRegistry {
		return this.registry;
	}

	/**
	 * Get the app context (for MCP standard HTTP handlers)
	 */
	getContext(sessionId: string = "mcp-default"): AppContext {
		return createSessionAwareContext(this.context, sessionId);
	}
}
