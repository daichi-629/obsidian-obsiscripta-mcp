import { describe, it, expect, vi } from "vitest";
import { ToolRegistry } from "../../mcp/tools/registry";
import { createBuiltinToolExecuteTool, createBuiltinToolSearchTool } from "../../mcp/tools/builtin/tool-discovery";
import { defaultToolSearch } from "../../mcp/tools/search/tool-search";

describe("tool discovery built-in tools", () => {
	it("defaultToolSearch should match by tool name", () => {
		const matches = defaultToolSearch("read", [
			{ name: "read_note", description: "Read", inputSchema: { type: "object", properties: {} } },
			{ name: "edit_note", description: "Edit", inputSchema: { type: "object", properties: {} } },
		]);
		expect(matches).toHaveLength(1);
		expect(matches[0]?.name).toBe("read_note");
	});

	it("search_tools should return only included tools", async () => {
		const registry = new ToolRegistry();
		registry.register({
			name: "included_tool",
			description: "Included",
			inputSchema: { type: "object", properties: {} },
			handler: async () => ({ content: [{ type: "text", text: "ok" }] }),
		});
		registry.register({
			name: "excluded_tool",
			description: "Excluded",
			inputSchema: { type: "object", properties: {} },
			handler: async () => ({ content: [{ type: "text", text: "ok" }] }),
		});

		const searchTool = createBuiltinToolSearchTool(
			registry,
			(name) => name !== "excluded_tool",
		);

		const result = await searchTool.handler({ query: "tool" }, {} as any);
		const text = result.content[0]?.text ?? "[]";
		const parsed = JSON.parse(text) as Array<{ name: string }>;
		expect(parsed.map((tool) => tool.name)).toEqual(["included_tool"]);
	});

	it("execute_tool should execute requested tool", async () => {
		const registry = new ToolRegistry();
		const handler = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "executed" }],
		});

		registry.register({
			name: "echo",
			description: "Echo",
			inputSchema: { type: "object", properties: {} },
			handler,
		});

		const executeTool = createBuiltinToolExecuteTool(registry);
		const context = {} as any;
		const result = await executeTool.handler(
			{ toolName: "echo", input: { value: "hello" } },
			context,
		);

		expect(handler).toHaveBeenCalledWith({ value: "hello" }, context);
		expect(result.isError).not.toBe(true);
	});
});
