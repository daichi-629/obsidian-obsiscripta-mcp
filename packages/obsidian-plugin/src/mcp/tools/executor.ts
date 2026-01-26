import { ToolRegistry } from "./registry";
import type { MCPToolContext } from "./types";
import { handleHealth, handleTools, handleToolCall } from "../bridge-api";
import type { HealthResponse, ToolListResponse, ToolCallResponse } from "../bridge-types";

/**
 * Encapsulates tool execution logic with registry and context.
 * This separates tool execution concerns from HTTP server concerns.
 */
export class ToolExecutor {
	private readonly registry: ToolRegistry;
	private readonly context: MCPToolContext;

	constructor(registry: ToolRegistry, context: MCPToolContext) {
		this.registry = registry;
		this.context = context;
	}

	/**
	 * Execute health check
	 */
	getHealth(): HealthResponse {
		return handleHealth();
	}

	/**
	 * Get list of enabled tools
	 */
	getTools(): ToolListResponse {
		return handleTools(this.registry);
	}

	/**
	 * Execute a tool call
	 */
	async executeToolCall(
		toolName: string,
		argumentsPayload: unknown,
	): Promise<ToolCallResponse> {
		return handleToolCall(
			toolName,
			argumentsPayload,
			this.registry,
			this.context,
		);
	}

	/**
	 * Check if a tool exists and is enabled
	 */
	isToolAvailable(toolName: string): boolean {
		return this.registry.has(toolName) && this.registry.isEnabled(toolName);
	}
}
