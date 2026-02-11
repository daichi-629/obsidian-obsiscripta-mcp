import type { MCPToolDefinition } from "./types";

export interface MCPToolSchemaSummary {
	name: string;
	description: string;
	inputSchema: MCPToolDefinition["inputSchema"];
}

export type ToolMatcher = (query: string, tool: MCPToolSchemaSummary) => boolean;

export function defaultToolMatcher(query: string, tool: MCPToolSchemaSummary): boolean {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) {
		return true;
	}

	const searchableText = `${tool.name} ${tool.description}`.toLowerCase();
	return searchableText.includes(normalizedQuery);
}

export function getToolSchemaSummary(tool: MCPToolDefinition): MCPToolSchemaSummary {
	return {
		name: tool.name,
		description: tool.description,
		inputSchema: tool.inputSchema,
	};
}

export function searchToolSchemas(
	query: string,
	tools: MCPToolDefinition[],
	matcher: ToolMatcher = defaultToolMatcher,
): MCPToolSchemaSummary[] {
	return tools
		.map(getToolSchemaSummary)
		.filter((tool) => matcher(query, tool))
		.sort((a, b) => a.name.localeCompare(b.name));
}
