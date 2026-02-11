import { describe, it, expect } from "vitest";
import { handleMCPToolsCall } from "../../mcp/mcp-api";
import { ToolRegistry } from "../../mcp/tools/registry";
import type { MCPToolDefinition } from "../../mcp/tools/types";


function getFirstText(content: unknown[]): string | undefined {
	const first = content[0];
	if (!first || typeof first !== "object" || !("type" in first) || first.type !== "text") {
		return undefined;
	}

	if (!("text" in first) || typeof first.text !== "string") {
		return undefined;
	}

	return first.text;
}

function createTool(handler: MCPToolDefinition["handler"]): MCPToolDefinition {
	return {
		name: "session_tool",
		description: "Session test tool",
		inputSchema: {
			type: "object",
			properties: {},
		},
		handler,
	};
}

describe("MCP session context", () => {
	it("injects context.session for calls with a session id", async () => {
		const registry = new ToolRegistry();
		registry.register(
			createTool(async (_args, context) => {
				expect(context.session).toBeDefined();
				context.session?.set("counter", 1);

				return {
					content: [{ type: "text", text: String(context.session?.get("counter")) }],
				};
			})
		);

		const response = await handleMCPToolsCall(
			{
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: { name: "session_tool", arguments: {} },
			},
			registry,
			{ app: {} as never, vault: {} as never },
			"session-a"
		);

		expect(getFirstText(response.result.content)).toBe("1");
	});

	it("persists data by session id across calls", async () => {
		const registry = new ToolRegistry();
		registry.register(
			createTool(async (_args, context) => {
				const previous = Number(context.session?.get("counter") ?? 0);
				context.session?.set("counter", previous + 1);

				return {
					content: [{ type: "text", text: String(context.session?.get("counter")) }],
				};
			})
		);

		const baseRequest = {
			jsonrpc: "2.0" as const,
			method: "tools/call" as const,
			params: { name: "session_tool", arguments: {} },
		};

		const first = await handleMCPToolsCall(
			{ ...baseRequest, id: 1 },
			registry,
			{ app: {} as never, vault: {} as never },
			"session-b"
		);
		const second = await handleMCPToolsCall(
			{ ...baseRequest, id: 2 },
			registry,
			{ app: {} as never, vault: {} as never },
			"session-b"
		);
		const otherSession = await handleMCPToolsCall(
			{ ...baseRequest, id: 3 },
			registry,
			{ app: {} as never, vault: {} as never },
			"session-c"
		);

		expect(getFirstText(first.result.content)).toBe("1");
		expect(getFirstText(second.result.content)).toBe("2");
		expect(getFirstText(otherSession.result.content)).toBe("1");
	});
});
