import { describe, it, expect } from "vitest";
import { searchToolSchemas } from "../../mcp/tools/search";
import type { MCPToolDefinition } from "../../mcp/tools/types";

describe("searchToolSchemas", () => {
	const tools: MCPToolDefinition[] = [
		{
			name: "read_note",
			description: "Read note content",
			inputSchema: { type: "object", properties: {} },
			handler: async () => ({ content: [{ type: "text", text: "ok" }] }),
		},
		{
			name: "edit_note",
			description: "Edit note content",
			inputSchema: { type: "object", properties: {} },
			handler: async () => ({ content: [{ type: "text", text: "ok" }] }),
		},
	];

	it("matches by query in name or description", () => {
		const result = searchToolSchemas("read", tools);
		expect(result).toHaveLength(1);
		expect(result[0]?.name).toBe("read_note");
	});

	it("supports replacing matcher implementation", () => {
		const result = searchToolSchemas("ignored", tools, (_query, tool) => tool.name.endsWith("note"));
		expect(result).toHaveLength(2);
	});
});
