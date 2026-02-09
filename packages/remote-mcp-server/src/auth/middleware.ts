/**
 * Authentication middleware for protecting MCP endpoints.
 * Validates Bearer tokens from the Authorization header.
 */

import type { Context, Next, MiddlewareHandler } from "hono";
import type { TokenStore } from "../store/token-store.js";
import type { AccessToken } from "../types.js";

/**
 * MCP resource server middleware.
 * Validates OAuth 2.1 Bearer tokens and injects user info into context.
 * Returns 401 with WWW-Authenticate header per RFC 9728 Section 5.1.
 */
export function requireAuth(
	store: TokenStore,
	resourceMetadataUrl: string
): MiddlewareHandler {
	return async (c: Context, next: Next): Promise<Response | void> => {
		const authHeader = c.req.header("authorization");

		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			c.header(
				"WWW-Authenticate",
				`Bearer resource_metadata="${resourceMetadataUrl}"`
			);
			return c.json({ error: "unauthorized" }, 401);
		}

		const tokenValue = authHeader.slice("Bearer ".length);
		const accessToken = store.getAccessToken(tokenValue);

		if (!accessToken) {
			c.header(
				"WWW-Authenticate",
				`Bearer error="invalid_token", resource_metadata="${resourceMetadataUrl}"`
			);
			return c.json({ error: "invalid_token" }, 401);
		}

		// Store token info for downstream handlers
		c.set("accessToken", accessToken);
		c.set("githubUser", accessToken.githubUser);

		await next();
	};
}

/**
 * Admin API authentication middleware.
 * Validates the admin secret from the Authorization header.
 */
export function requireAdminAuth(adminSecret: string): MiddlewareHandler {
	return async (c: Context, next: Next): Promise<Response | void> => {
		const authHeader = c.req.header("authorization");

		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return c.json({ error: "unauthorized" }, 401);
		}

		const token = authHeader.slice("Bearer ".length);
		if (token !== adminSecret) {
			return c.json({ error: "forbidden" }, 403);
		}

		await next();
	};
}

/**
 * Helper to get the authenticated access token from context
 */
export function getAccessToken(c: Context): AccessToken | undefined {
	return c.get("accessToken") as AccessToken | undefined;
}
