/**
 * Remote MCP Server entry point.
 *
 * Architecture:
 * Claude Desktop → (Streamable HTTP MCP) → This Server → HTTP(S) → Obsidian Plugin
 *
 * This server:
 * 1. Exposes MCP tools via Streamable HTTP transport
 * 2. Authenticates Claude Desktop via OAuth 2.1 (GitHub login)
 * 3. Proxies tool calls to the Obsidian plugin's Bridge API
 * 4. Provides an admin API for managing plugin connection tokens
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { loadConfig, SERVER_VERSION } from "./config.js";
import { TokenStore } from "./store/token-store.js";
import {
	createMcpTransportRoutes,
	closeAllTransports,
} from "./mcp/transport-handler.js";
import { createOAuthRoutes } from "./auth/oauth-routes.js";
import { requireAuth } from "./auth/middleware.js";
import { createAdminRoutes } from "./admin/admin-routes.js";

async function main(): Promise<void> {
	console.error(`[Server] ObsiScripta Remote MCP Server v${SERVER_VERSION}`);

	// Load configuration
	const config = loadConfig();

	// Initialize token store
	const store = new TokenStore();

	// Periodic cleanup of expired tokens
	const cleanupTimer = setInterval(() => store.cleanup(), 60_000);

	// Build Hono application
	const app = new Hono();

	// CORS for browser-based OAuth flows
	app.use(
		"*",
		cors({
			origin: "*",
			allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
			allowHeaders: [
				"Content-Type",
				"Authorization",
				"Mcp-Session-Id",
			],
			exposeHeaders: ["Mcp-Session-Id"],
		})
	);

	// --- OAuth routes (unauthenticated) ---
	const oauthRoutes = createOAuthRoutes(config, store);
	app.route("/", oauthRoutes);

	// --- Admin routes (admin secret auth) ---
	const adminRoutes = createAdminRoutes(config.adminSecret, store);
	app.route("/", adminRoutes);

	// --- Health endpoint (unauthenticated) ---
	app.get("/health", (c) => {
		return c.json({
			status: "ok",
			version: SERVER_VERSION,
		});
	});

	// --- MCP transport routes (OAuth protected) ---
	const resourceMetadataUrl = `${config.externalUrl}/.well-known/oauth-protected-resource`;
	app.use("/mcp", requireAuth(store, resourceMetadataUrl));

	const mcpRoutes = createMcpTransportRoutes(store);
	app.route("/", mcpRoutes);

	// Start HTTP server
	const server = serve(
		{
			fetch: app.fetch,
			hostname: config.host,
			port: config.port,
		},
		(info) => {
			console.error(
				`[Server] Listening on http://${info.address}:${info.port}`
			);
			console.error(
				`[Server] MCP endpoint: ${config.externalUrl}/mcp`
			);
			console.error(
				`[Server] OAuth metadata: ${config.externalUrl}/.well-known/oauth-authorization-server`
			);
		}
	);

	// Graceful shutdown
	const shutdown = async () => {
		console.error("\n[Server] Shutting down...");
		clearInterval(cleanupTimer);
		await closeAllTransports();
		server.close();
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

main().catch((error) => {
	console.error("[Server] Fatal error:", error);
	process.exit(1);
});
