import { describe, it, expect } from "vitest";
import { handleMCPToolsCall } from "../../mcp/mcp-api";
import { createSessionApi } from "../../mcp/session-store";

const sessionTool = {
	name: "session_tool",
	description: "session tool",
	inputSchema: {
		type: "object" as const,
		properties: {},
	},
	handler: async (args: Record<string, unknown>, context: { session: ReturnType<typeof createSessionApi> }) => {
		const action = args.action;
		const key = typeof args.key === "string" ? args.key : "";
		if (action === "set") {
			context.session.set(key, args.value);
			return {
				content: [{ type: "text" as const, text: "ok" }],
			};
		}

		return {
			content: [{ type: "text" as const, text: String(context.session.get(key)) }],
		};
	},
};

const registry = {
	has: (name: string) => name === sessionTool.name,
	get: (name: string) => (name === sessionTool.name ? sessionTool : null),
} as const;

describe("tool session api", () => {
	it("persists values per MCP session", async () => {
		const setResponse = await handleMCPToolsCall(
			{
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: sessionTool.name,
					arguments: { action: "set", key: "foo", value: "bar" },
				},
			},
			registry as never,
			{ session: createSessionApi("session-a") } as never,
		);

		expect(setResponse.result?.isError).toBe(false);

		const getResponse = await handleMCPToolsCall(
			{
				jsonrpc: "2.0",
				id: 2,
				method: "tools/call",
				params: {
					name: sessionTool.name,
					arguments: { action: "get", key: "foo" },
				},
			},
			registry as never,
			{ session: createSessionApi("session-a") } as never,
		);

		expect((getResponse.result?.content[0] as { text?: string } | undefined)?.text).toBe("bar");
	});

	it("isolates values between different MCP sessions", async () => {
		await handleMCPToolsCall(
			{
				jsonrpc: "2.0",
				id: 3,
				method: "tools/call",
				params: {
					name: sessionTool.name,
					arguments: { action: "set", key: "shared", value: "alpha" },
				},
			},
			registry as never,
			{ session: createSessionApi("session-1") } as never,
		);

		const otherSessionRead = await handleMCPToolsCall(
			{
				jsonrpc: "2.0",
				id: 4,
				method: "tools/call",
				params: {
					name: sessionTool.name,
					arguments: { action: "get", key: "shared" },
				},
			},
			registry as never,
			{ session: createSessionApi("session-2") } as never,
		);

		expect((otherSessionRead.result?.content[0] as { text?: string } | undefined)?.text).toBe("undefined");
	});
});
