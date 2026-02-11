import type { ToolRegistry } from "../registry";
import type { MCPToolDefinition, MCPToolResult } from "../types";
import { searchToolSchemas } from "../search";

function formatJsonResult(data: unknown): MCPToolResult {
	return {
		content: [{
			type: "text",
			text: JSON.stringify(data, null, 2),
		}],
	};
}

function createSearchToolsTool(registry: ToolRegistry): MCPToolDefinition {
	return {
		name: "search_tools",
		description: "Search tools that are enabled and included in the search index.",
		inputSchema: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: "Search query matched against tool name and description.",
				},
			},
			required: ["query"],
		},
		handler: async (args): Promise<MCPToolResult> => {
			const query = typeof args.query === "string" ? args.query : "";
			const searchableTools = registry.listSearchable();
			const matches = searchToolSchemas(query, searchableTools);
			return formatJsonResult(matches);
		},
	};
}

function createExecuteToolTool(registry: ToolRegistry): MCPToolDefinition {
	return {
		name: "execute_tool",
		description: "Execute another enabled tool by name using the provided input.",
		inputSchema: {
			type: "object",
			properties: {
				toolName: {
					type: "string",
					description: "Name of the tool to execute.",
				},
				input: {
					type: "object",
					description: "Input object to pass as tool arguments.",
				},
			},
			required: ["toolName", "input"],
		},
		handler: async (args, context): Promise<MCPToolResult> => {
			const toolName = typeof args.toolName === "string" ? args.toolName : "";
			const input = typeof args.input === "object" && args.input !== null
				? args.input as Record<string, unknown>
				: {};

			if (!registry.has(toolName)) {
				return {
					content: [{ type: "text", text: `Error: Tool "${toolName}" not found` }],
					isError: true,
				};
			}
			if (!registry.isEnabled(toolName)) {
				return {
					content: [{ type: "text", text: `Error: Tool "${toolName}" is disabled` }],
					isError: true,
				};
			}

			const tool = registry.get(toolName);
			if (!tool) {
				return {
					content: [{ type: "text", text: `Error: Tool "${toolName}" not found` }],
					isError: true,
				};
			}

			try {
				return await tool.handler(input, context);
			} catch (error) {
				return {
					content: [{
						type: "text",
						text: `Error executing tool "${toolName}": ${error instanceof Error ? error.message : String(error)}`,
					}],
					isError: true,
				};
			}
		},
	};
}

export function getBuiltinToolManagementTools(registry: ToolRegistry): MCPToolDefinition[] {
	return [
		createSearchToolsTool(registry),
		createExecuteToolTool(registry),
	];
}
