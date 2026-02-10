/**
 * Streamable HTTP transport handler for Hono.
 * Uses WebStandardStreamableHTTPServerTransport which works natively with
 * Hono's Web Standard Request/Response.
 */

import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { RemoteMcpServer } from "./mcp-server.js";
import { getAccessToken } from "../auth/middleware.js";

/**
 * Active transport sessions keyed by session ID
 */
const transports = new Map<
	string,
	WebStandardStreamableHTTPServerTransport
>();

/**
 * Session ID to GitHub user ID mapping
 */
const sessionUsers = new Map<string, number>();

/**
 * Create Hono routes for the MCP Streamable HTTP endpoint.
 * Uses app.all to handle POST, GET, DELETE on /mcp as required by the spec.
 */
export function createMcpTransportRoutes(
	remoteMcpServer: RemoteMcpServer
): Hono {
	const app = new Hono();

	app.all("/mcp", async (c) => {
		const sessionId = c.req.header("mcp-session-id");

		// Get user info from auth middleware
		const accessToken = getAccessToken(c);
		const githubUserId = accessToken?.githubUser?.id;

		// For POST without session ID → new session (initialization)
		if (c.req.method === "POST" && !sessionId) {
			const transport = new WebStandardStreamableHTTPServerTransport({
				sessionIdGenerator: () => crypto.randomUUID(),
				onsessioninitialized: (newSessionId) => {
					transports.set(newSessionId, transport);
					if (githubUserId) {
						sessionUsers.set(newSessionId, githubUserId);
						console.error(
							`[Transport] Session initialized: ${newSessionId} (user: ${githubUserId})`
						);
					} else {
						console.error(
							`[Transport] Session initialized: ${newSessionId} (no user)`
						);
					}
				},
				onsessionclosed: (closedSessionId) => {
					transports.delete(closedSessionId);
					sessionUsers.delete(closedSessionId);
					console.error(
						`[Transport] Session closed: ${closedSessionId}`
					);
				},
			});

			// Connect MCP server to this transport
			await remoteMcpServer.mcpServer.connect(transport);

			// Handle request within user context
			if (githubUserId) {
				return remoteMcpServer.runInContext(
					{ githubUserId },
					() => transport.handleRequest(c.req.raw)
				);
			}

			return transport.handleRequest(c.req.raw);
		}

		// For requests with session ID → reuse existing transport
		if (sessionId && transports.has(sessionId)) {
			const transport = transports.get(sessionId)!;
			const userId = sessionUsers.get(sessionId);

			// Handle request within user context if available
			if (userId) {
				return remoteMcpServer.runInContext(
					{ githubUserId: userId, sessionId },
					() => transport.handleRequest(c.req.raw)
				);
			}

			return transport.handleRequest(c.req.raw);
		}

		// Invalid or missing session
		return c.json(
			{
				jsonrpc: "2.0",
				error: {
					code: -32000,
					message: "Bad Request: No valid session found",
				},
				id: null,
			},
			400
		);
	});

	return app;
}

/**
 * Close all active transport sessions. Call on server shutdown.
 */
export async function closeAllTransports(): Promise<void> {
	for (const [sessionId, transport] of transports) {
		try {
			await transport.close();
		} catch (error) {
			console.error(
				`[Transport] Error closing session ${sessionId}:`,
				error
			);
		}
	}
	transports.clear();
}
