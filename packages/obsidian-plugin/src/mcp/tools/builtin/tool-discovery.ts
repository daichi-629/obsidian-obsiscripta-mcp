import { ToolRegistry } from "../registry";
import { MCPToolDefinition, MCPToolResult } from "../types";
import {
	defaultToolSearch,
	MCPToolSchemaSummary,
	ToolSearchFunction,
} from "../search/tool-search";

export function createBuiltinToolSearchTool(
	registry: ToolRegistry,
	isToolIncludedInSearch: (toolName: string) => boolean,
	searchFunction: ToolSearchFunction = defaultToolSearch,
): MCPToolDefinition {
	return {
		name: "search_tools",
		description:
			"Search tool schemas among tools that are enabled and included in the search index.",
		inputSchema: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: "Search query for filtering tools by name, description, and schema",
				},
			},
			required: ["query"],
		},
		handler: async (args): Promise<MCPToolResult> => {
			const query = typeof args.query === "string" ? args.query : "";
			const searchableTools = registry
				.listEnabled()
				.filter((tool) => isToolIncludedInSearch(tool.name))
				.map<MCPToolSchemaSummary>((tool) => ({
					name: tool.name,
					description: tool.description,
					inputSchema: tool.inputSchema,
				}));

			const matches = searchFunction(query, searchableTools)
				.slice()
				.sort((a, b) => a.name.localeCompare(b.name));

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(matches),
					},
				],
			};
		},
	};
}

export function createBuiltinToolExecuteTool(
	registry: ToolRegistry,
): MCPToolDefinition {
	return {
		name: "execute_tool",
		description: "Execute another enabled tool by name with the provided input arguments.",
		inputSchema: {
			type: "object",
			properties: {
				toolName: {
					type: "string",
					description: "The name of the tool to execute",
				},
				input: {
					type: "object",
					description: "Input arguments object passed to the target tool",
				},
			},
			required: ["toolName", "input"],
		},
		handler: async (args, context): Promise<MCPToolResult> => {
			const toolName = args.toolName;
			const input = args.input;
			if (typeof toolName !== "string" || !toolName.trim()) {
				return {
					content: [{ type: "text", text: 'Error: "toolName" must be a non-empty string' }],
					isError: true,
				};
			}
			if (!input || typeof input !== "object" || Array.isArray(input)) {
				return {
					content: [{ type: "text", text: 'Error: "input" must be an object' }],
					isError: true,
				};
			}
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
				return await tool.handler(input as Record<string, unknown>, context);
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
