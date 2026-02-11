import { ToolRegistry } from "./registry";
import type { AppContext } from "../../plugin/context";
import { handleHealth, handleTools, handleToolCall } from "../bridge-api";
import type { HealthResponse, ToolListResponse, ToolCallResponse } from "../bridge-types";
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
		sessionId: string = "bridge-v1-default",
	): Promise<ToolCallResponse> {
		return handleToolCall(
			toolName,
			argumentsPayload,
			this.registry,
			this.getContext(sessionId),
		);
	}

	/**
	 * Check if a tool exists and is enabled
	 */
	isToolAvailable(toolName: string): boolean {
		return this.registry.has(toolName) && this.registry.isEnabled(toolName);
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
	getContext(sessionId: string = "bridge-v1-default"): AppContext {
		return createSessionAwareContext(this.context, sessionId);
	}
}
