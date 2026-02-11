import { describe, it, expect } from "vitest";
import { BridgeServer } from "../../mcp/server";

function createBridgeServer(): BridgeServer {
	const mockExecutor = {
		getRegistry: () => ({
			listEnabled: () => [],
			has: () => false,
			get: () => null,
		}),
		getContext: () => ({}),
		getHealth: () => ({ status: "ok" }),
		getTools: () => [],
		isToolAvailable: () => false,
		executeToolCall: async () => ({ content: [] }),
	};

	return new BridgeServer(mockExecutor as never, 3000, "127.0.0.1", ["test-api-key"]);
}

describe("BridgeServer MCP session management", () => {
	it("assigns MCP-Session-Id on initialize", async () => {
		const server = createBridgeServer();
		// @ts-expect-error private field access for integration-style test
		const app = server.app;

		const response = await app.request("/mcp", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-ObsiScripta-Api-Key": "test-api-key",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {},
			}),
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("MCP-Session-Id")).toBeTruthy();
	});

	it("rejects non-initialize requests without MCP-Session-Id", async () => {
		const server = createBridgeServer();
		// @ts-expect-error private field access for integration-style test
		const app = server.app;

		const response = await app.request("/mcp", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-ObsiScripta-Api-Key": "test-api-key",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 2,
				method: "tools/list",
				params: {},
			}),
		});

		expect(response.status).toBe(400);
	});

	it("accepts requests with an active MCP session and returns 404 after DELETE", async () => {
		const server = createBridgeServer();
		// @ts-expect-error private field access for integration-style test
		const app = server.app;

		const initializeResponse = await app.request("/mcp", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-ObsiScripta-Api-Key": "test-api-key",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 3,
				method: "initialize",
				params: {},
			}),
		});
		const sessionId = initializeResponse.headers.get("MCP-Session-Id");
		expect(sessionId).toBeTruthy();

		const listResponse = await app.request("/mcp", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-ObsiScripta-Api-Key": "test-api-key",
				"MCP-Session-Id": sessionId as string,
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 4,
				method: "tools/list",
				params: {},
			}),
		});
		expect(listResponse.status).toBe(200);

		const deleteResponse = await app.request("/mcp", {
			method: "DELETE",
			headers: {
				"X-ObsiScripta-Api-Key": "test-api-key",
				"MCP-Session-Id": sessionId as string,
			},
		});
		expect(deleteResponse.status).toBe(204);

		const afterDeleteResponse = await app.request("/mcp", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-ObsiScripta-Api-Key": "test-api-key",
				"MCP-Session-Id": sessionId as string,
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 5,
				method: "tools/list",
				params: {},
			}),
		});
		expect(afterDeleteResponse.status).toBe(404);
	});
});
