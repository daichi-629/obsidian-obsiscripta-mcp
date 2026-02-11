import { describe, it, expect, vi } from "vitest";
import { ToolRegistry } from "../../mcp/tools/registry";
import { getBuiltinToolManagementTools } from "../../mcp/tools/builtin/tool-management";

describe("tool management built-in tools", () => {
	it("search_tools returns matching schemas for searchable tools", async () => {
		const registry = new ToolRegistry([], ["hidden_tool"]);
		registry.register({
			name: "read_note",
			description: "Read a note",
			inputSchema: { type: "object", properties: {} },
			handler: vi.fn(),
		});
		registry.register({
			name: "hidden_tool",
			description: "Should not appear",
			inputSchema: { type: "object", properties: {} },
			handler: vi.fn(),
		});

		const searchTool = getBuiltinToolManagementTools(registry).find((tool) => tool.name === "search_tools");
		expect(searchTool).toBeDefined();

		const result = await searchTool!.handler({ query: "read" }, {} as any);
		const payload = JSON.parse(result.content[0]!.text) as Array<{ name: string }>;

		expect(payload).toHaveLength(1);
		expect(payload[0]?.name).toBe("read_note");
	});

	it("execute_tool calls the target tool and returns its result", async () => {
		const registry = new ToolRegistry();
		registry.register({
			name: "echo",
			description: "Echo",
			inputSchema: { type: "object", properties: {} },
			handler: async (args) => ({
				content: [{ type: "text", text: typeof args.message === "string" ? args.message : "" }],
			}),
		});

		const executeTool = getBuiltinToolManagementTools(registry).find((tool) => tool.name === "execute_tool");
		expect(executeTool).toBeDefined();

		const result = await executeTool!.handler(
			{ toolName: "echo", input: { message: "hello" } },
			{} as any,
		);

		expect(result.isError).toBeUndefined();
		expect(result.content[0]?.text).toBe("hello");
	});
});
