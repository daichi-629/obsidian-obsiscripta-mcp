import { MCPToolDefinition } from "../types";

export interface MCPToolSchemaSummary {
	name: string;
	description: string;
	inputSchema: MCPToolDefinition["inputSchema"];
}

export type ToolSearchFunction = (
	query: string,
	tools: MCPToolSchemaSummary[],
) => MCPToolSchemaSummary[];

function normalizeSearchText(value: string): string {
	return value.toLocaleLowerCase().trim();
}

/**
 * Default built-in search implementation for filtering tool schemas by query.
 * Isolated so the strategy can be tested and replaced later.
 */
export const defaultToolSearch: ToolSearchFunction = (query, tools) => {
	const normalizedQuery = normalizeSearchText(query);
	if (!normalizedQuery) {
		return tools;
	}

	return tools.filter((tool) => {
		const searchTarget = normalizeSearchText(
			`${tool.name} ${tool.description} ${JSON.stringify(tool.inputSchema)}`,
		);
		return searchTarget.includes(normalizedQuery);
	});
};
