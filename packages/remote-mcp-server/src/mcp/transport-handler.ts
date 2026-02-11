/**
 * Streamable HTTP MCP proxy handler for Hono.
 *
 * This endpoint only handles:
 * - OAuth access token validation (via middleware)
 * - Per-user plugin host/port lookup
 * - Plugin API key header injection
 * - Transparent body + MCP-Session-Id forwarding
 */

import { Hono } from "hono";
import { getAccessToken } from "../auth/middleware.js";
import type { TokenStore } from "../store/token-store.js";

/**
 * Create Hono routes for the MCP Streamable HTTP endpoint.
 */
export function createMcpTransportRoutes(store: TokenStore): Hono {
	const app = new Hono();

	app.all("/mcp", async (c) => {
		const accessToken = getAccessToken(c);
		const githubUserId = accessToken?.githubUser?.id;

		if (!githubUserId) {
			return c.json({ error: "unauthorized" }, 401);
		}

		const pluginToken = store.getPluginTokenByUserId(githubUserId);
		if (!pluginToken) {
			return c.json(
				{
					error: "plugin_not_configured",
					message: "No plugin connection is configured for this user",
				},
				404
			);
		}

		const protocol = pluginToken.pluginPort === 443 ? "https" : "http";
		const pluginUrl = `${protocol}://${pluginToken.pluginHost}:${pluginToken.pluginPort}/mcp`;

		const headers = new Headers();
		const contentType = c.req.header("content-type");
		const accept = c.req.header("accept");
		const mcpSessionId = c.req.header("mcp-session-id");

		if (contentType) {
			headers.set("content-type", contentType);
		}
		if (accept) {
			headers.set("accept", accept);
		}
		if (mcpSessionId) {
			headers.set("mcp-session-id", mcpSessionId);
		}

		if (pluginToken.requireAuth) {
			headers.set("x-obsiscripta-api-key", pluginToken.token);
		}

		const response = await fetch(pluginUrl, {
			method: c.req.method,
			headers,
			body: c.req.method === "GET" || c.req.method === "HEAD" ? undefined : c.req.raw.body,
			duplex: "half",
		});

		return new Response(response.body, {
			status: response.status,
			headers: response.headers,
		});
	});

	return app;
}

/**
 * No active in-memory transport sessions are maintained in proxy mode.
 */
export async function closeAllTransports(): Promise<void> {
	return;
}
