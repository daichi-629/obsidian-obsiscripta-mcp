import { createHash } from "crypto";
import { HealthResponse, ToolListResponse, ToolCallResponse } from "./bridge-types";
import { ToolRegistry } from "./tools/registry";
import type { MCPToolContext, MCPToolDefinition } from "./tools/types";

declare const __BRIDGE_VERSION__: string;

const BRIDGE_VERSION = __BRIDGE_VERSION__;
const PROTOCOL_VERSION = "1";

/**
 * Deep-sort object keys to stabilize JSON output across runtimes.
 * Note: array element order is assumed to be stable and is preserved.
 * If array order changes (e.g., enum lists), the hash should change.
 */
export function deepSort(obj: unknown): unknown {
	if (Array.isArray(obj)) {
		return obj.map((item) => deepSort(item));
	}
	if (obj !== null && typeof obj === "object") {
		return Object.keys(obj)
			.sort()
			.reduce<Record<string, unknown>>((acc, key) => {
				const source = obj as Record<string, unknown>;
				acc[key] = deepSort(source[key]);
				return acc;
			}, {});
	}
	return obj;
}

export function computeToolsHash(tools: MCPToolDefinition[]): string {
	const normalized = tools
		.slice()
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((tool) => deepSort({
			name: tool.name,
			description: tool.description,
			inputSchema: tool.inputSchema
		}));

	const hashInput = JSON.stringify(normalized);
	return createHash("sha256").update(hashInput).digest("hex");
}

export function handleHealth(): HealthResponse {
	return {
		status: "ok",
		version: BRIDGE_VERSION,
		protocolVersion: PROTOCOL_VERSION
	};
}

export function handleTools(registry: ToolRegistry): ToolListResponse {
	const tools = registry
		.list()
		.slice()
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((tool) => ({
			name: tool.name,
			description: tool.description,
			inputSchema: tool.inputSchema as unknown as Record<string, unknown>
		}));

	return {
		tools,
		hash: computeToolsHash(registry.list())
	};
}

export async function handleToolCall(
	toolName: string,
	argumentsPayload: unknown,
	registry: ToolRegistry,
	context: MCPToolContext
): Promise<ToolCallResponse> {
	const tool = registry.get(toolName);
	if (!tool) {
		return {
			success: false,
			content: [{
				type: "text",
				text: `Error: Tool "${toolName}" not found`
			}],
			isError: true
		};
	}

	if (!context) {
		return {
			success: false,
			content: [{
				type: "text",
				text: "Error: Tool context is not available for execution"
			}],
			isError: true
		};
	}

	try {
		const result = await tool.handler(argumentsPayload as Record<string, unknown>, context);
		if (result.isError) {
			return { success: false, content: result.content, isError: true };
		}
		return { success: true, content: result.content };
	} catch (error) {
		return {
			success: false,
			content: [{
				type: "text",
				text: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`
			}],
			isError: true
		};
	}
}
