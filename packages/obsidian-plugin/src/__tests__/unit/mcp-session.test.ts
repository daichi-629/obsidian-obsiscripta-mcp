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

	return new BridgeServer(mockExecutor as never, 3000, "127.0.0.1", true, ["test-api-key"]);
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
				Accept: "application/json",
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
				Accept: "application/json",
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
				Accept: "application/json",
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
				Accept: "application/json",
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
				Accept: "application/json",
			},
		});
		expect(deleteResponse.status).toBe(204);

		const afterDeleteResponse = await app.request("/mcp", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-ObsiScripta-Api-Key": "test-api-key",
				"MCP-Session-Id": sessionId as string,
				Accept: "application/json",
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

	it("returns 202 Accepted for JSON-RPC notifications", async () => {
		const server = createBridgeServer();
		// @ts-expect-error private field access for integration-style test
		const app = server.app;

		const initResponse = await app.request("/mcp", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-ObsiScripta-Api-Key": "test-api-key",
				Accept: "application/json",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 100,
				method: "initialize",
				params: {},
			}),
		});
		const sessionId = initResponse.headers.get("MCP-Session-Id");
		expect(sessionId).toBeTruthy();

		const response = await app.request("/mcp", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-ObsiScripta-Api-Key": "test-api-key",
				"MCP-Session-Id": sessionId as string,
				Accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				method: "notifications/initialized",
				params: {},
			}),
		});

		expect(response.status).toBe(202);
		expect(await response.text()).toBe("");
	});

	it("returns SSE stream when POST accepts text/event-stream", async () => {
		const server = createBridgeServer();
		// @ts-expect-error private field access for integration-style test
		const app = server.app;

		const response = await app.request("/mcp", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-ObsiScripta-Api-Key": "test-api-key",
				Accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 200,
				method: "initialize",
				params: {},
			}),
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/event-stream");
		const text = await response.text();
		expect(text).toContain("id:");
		expect(text).toContain("data:");
	});

});
