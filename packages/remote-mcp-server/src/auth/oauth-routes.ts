/**
 * OAuth 2.1 Authorization Server routes
 *
 * Implements:
 * - RFC 8414: Authorization Server Metadata
 * - RFC 9728: Protected Resource Metadata
 * - RFC 7591: Dynamic Client Registration
 * - OAuth 2.1 Authorization Code Flow with PKCE
 *
 * Flow:
 * 1. MCP client discovers auth server via /.well-known/oauth-protected-resource
 * 2. Client registers via /oauth/register (RFC 7591)
 * 3. Client redirects user to /oauth/authorize (PKCE required)
 * 4. Server redirects to GitHub for user login
 * 5. GitHub callback at /oauth/github/callback
 * 6. User redirected back to client with authorization code
 * 7. Client exchanges code for token at /oauth/token
 */

import { Hono } from "hono";
import type { ServerConfig } from "../config.js";
import { TokenStore } from "../store/token-store.js";
import {
	buildGitHubAuthorizeUrl,
	exchangeGitHubCode,
	fetchGitHubUser,
	type GitHubOAuthConfig,
} from "./github.js";
import {
	generateToken,
	generateClientId,
	generateClientSecret,
	verifyCodeChallenge,
} from "./crypto.js";
import type { OAuthClient } from "../types.js";

/** Authorization code TTL: 10 minutes */
const AUTH_CODE_TTL = 10 * 60 * 1000;

/** Access token TTL: 1 hour */
const ACCESS_TOKEN_TTL = 60 * 60 * 1000;

/**
 * In-flight authorization requests, keyed by state parameter.
 * Stores the original OAuth authorize request parameters so we can
 * resume after GitHub login completes.
 */
interface PendingAuth {
	clientId: string;
	redirectUri: string;
	scope: string;
	codeChallenge: string;
	codeChallengeMethod: "S256";
	state: string;
	createdAt: number;
}

export function createOAuthRoutes(
	config: ServerConfig,
	store: TokenStore
): Hono {
	const app = new Hono();

	// Pending auth requests (state → params)
	const pendingAuths = new Map<string, PendingAuth>();

	const githubConfig: GitHubOAuthConfig = {
		clientId: config.githubClientId,
		clientSecret: config.githubClientSecret,
		redirectUri: `${config.externalUrl}/oauth/github/callback`,
	};

	// =========================================================================
	// RFC 9728: Protected Resource Metadata
	// =========================================================================

	app.get("/.well-known/oauth-protected-resource", (c) => {
		return c.json({
			resource: config.externalUrl,
			authorization_servers: [`${config.externalUrl}`],
			bearer_methods_supported: ["header"],
			scopes_supported: ["mcp:tools"],
		});
	});

	// =========================================================================
	// RFC 8414: Authorization Server Metadata
	// =========================================================================

	app.get("/.well-known/oauth-authorization-server", (c) => {
		return c.json({
			issuer: config.externalUrl,
			authorization_endpoint: `${config.externalUrl}/oauth/authorize`,
			token_endpoint: `${config.externalUrl}/oauth/token`,
			registration_endpoint: `${config.externalUrl}/oauth/register`,
			scopes_supported: ["mcp:tools"],
			response_types_supported: ["code"],
			grant_types_supported: ["authorization_code", "refresh_token"],
			token_endpoint_auth_methods_supported: [
				"none",
				"client_secret_post",
			],
			code_challenge_methods_supported: ["S256"],
			revocation_endpoint: `${config.externalUrl}/oauth/revoke`,
		});
	});

	// =========================================================================
	// RFC 7591: Dynamic Client Registration
	// =========================================================================

	app.post("/oauth/register", async (c) => {
		let body: Record<string, unknown>;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: "invalid_request" }, 400);
		}

		const redirectUris = body.redirect_uris;
		if (
			!Array.isArray(redirectUris) ||
			redirectUris.length === 0 ||
			!redirectUris.every((u) => typeof u === "string")
		) {
			return c.json(
				{
					error: "invalid_client_metadata",
					error_description: "redirect_uris is required",
				},
				400
			);
		}

		const clientId = generateClientId();
		const authMethod =
			typeof body.token_endpoint_auth_method === "string"
				? body.token_endpoint_auth_method
				: "none";

		const client: OAuthClient = {
			client_id: clientId,
			redirect_uris: redirectUris as string[],
			client_name:
				typeof body.client_name === "string"
					? body.client_name
					: undefined,
			token_endpoint_auth_method:
				authMethod === "client_secret_post"
					? "client_secret_post"
					: "none",
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			scope:
				typeof body.scope === "string" ? body.scope : "mcp:tools",
			created_at: Date.now(),
		};

		// Generate secret for confidential clients
		if (client.token_endpoint_auth_method === "client_secret_post") {
			client.client_secret = generateClientSecret();
		}

		store.saveClient(client);

		console.error(`[OAuth] Registered client: ${clientId}`);

		return c.json(
			{
				client_id: client.client_id,
				client_secret: client.client_secret,
				redirect_uris: client.redirect_uris,
				client_name: client.client_name,
				token_endpoint_auth_method:
					client.token_endpoint_auth_method,
				grant_types: client.grant_types,
				response_types: client.response_types,
				scope: client.scope,
			},
			201
		);
	});

	// =========================================================================
	// Authorization Endpoint
	// =========================================================================

	app.get("/oauth/authorize", (c) => {
		const clientId = c.req.query("client_id");
		const redirectUri = c.req.query("redirect_uri");
		const responseType = c.req.query("response_type");
		const scope = c.req.query("scope") ?? "mcp:tools";
		const state = c.req.query("state");
		const codeChallenge = c.req.query("code_challenge");
		const codeChallengeMethod = c.req.query("code_challenge_method");

		// Validate required parameters
		if (!clientId || !redirectUri || !codeChallenge) {
			return c.json(
				{
					error: "invalid_request",
					error_description:
						"client_id, redirect_uri, and code_challenge are required",
				},
				400
			);
		}

		if (responseType !== "code") {
			return c.json(
				{
					error: "unsupported_response_type",
					error_description: "Only response_type=code is supported",
				},
				400
			);
		}

		// PKCE S256 is required
		if (codeChallengeMethod !== "S256") {
			return c.json(
				{
					error: "invalid_request",
					error_description:
						"code_challenge_method must be S256",
				},
				400
			);
		}

		// Validate client
		const client = store.getClient(clientId);
		if (!client) {
			return c.json(
				{
					error: "invalid_client",
					error_description: "Unknown client_id",
				},
				400
			);
		}

		if (!client.redirect_uris.includes(redirectUri)) {
			return c.json(
				{
					error: "invalid_request",
					error_description: "redirect_uri not registered",
				},
				400
			);
		}

		// Store pending auth and redirect to GitHub
		const githubState = generateToken(16);
		pendingAuths.set(githubState, {
			clientId,
			redirectUri,
			scope,
			codeChallenge,
			codeChallengeMethod: "S256",
			state: state ?? "",
			createdAt: Date.now(),
		});

		// Clean up old pending auths (> 10 min)
		const now = Date.now();
		for (const [key, pending] of pendingAuths) {
			if (now - pending.createdAt > AUTH_CODE_TTL) {
				pendingAuths.delete(key);
			}
		}

		const githubUrl = buildGitHubAuthorizeUrl(githubConfig, githubState);
		return c.redirect(githubUrl);
	});

	// =========================================================================
	// GitHub OAuth Callback
	// =========================================================================

	app.get("/oauth/github/callback", async (c) => {
		const code = c.req.query("code");
		const state = c.req.query("state");

		if (!code || !state) {
			return c.text("Missing code or state parameter", 400);
		}

		const pending = pendingAuths.get(state);
		if (!pending) {
			return c.text("Invalid or expired state parameter", 400);
		}
		pendingAuths.delete(state);

		try {
			// Exchange GitHub code for token
			const githubAccessToken = await exchangeGitHubCode(
				githubConfig,
				code
			);

			// Fetch user profile
			const githubUser = await fetchGitHubUser(githubAccessToken);

			console.error(
				`[OAuth] GitHub user authenticated: ${githubUser.login}`
			);

			// Generate authorization code
			const authCode = generateToken(32);
			store.saveAuthCode({
				code: authCode,
				clientId: pending.clientId,
				redirectUri: pending.redirectUri,
				scope: pending.scope,
				codeChallenge: pending.codeChallenge,
				codeChallengeMethod: pending.codeChallengeMethod,
				githubAccessToken,
				githubUser,
				expiresAt: Date.now() + AUTH_CODE_TTL,
			});

			// Redirect back to MCP client with authorization code
			const redirectUrl = new URL(pending.redirectUri);
			redirectUrl.searchParams.set("code", authCode);
			if (pending.state) {
				redirectUrl.searchParams.set("state", pending.state);
			}

			return c.redirect(redirectUrl.toString());
		} catch (error) {
			console.error("[OAuth] GitHub callback error:", error);
			// Redirect with error
			const redirectUrl = new URL(pending.redirectUri);
			redirectUrl.searchParams.set("error", "server_error");
			redirectUrl.searchParams.set(
				"error_description",
				"Failed to authenticate with GitHub"
			);
			if (pending.state) {
				redirectUrl.searchParams.set("state", pending.state);
			}
			return c.redirect(redirectUrl.toString());
		}
	});

	// =========================================================================
	// Token Endpoint
	// =========================================================================

	app.post("/oauth/token", async (c) => {
		let body: Record<string, string>;
		try {
			// Support both JSON and form-urlencoded
			const contentType = c.req.header("content-type") ?? "";
			if (contentType.includes("application/json")) {
				body = await c.req.json();
			} else {
				const formData = await c.req.parseBody();
				body = {} as Record<string, string>;
				for (const [key, value] of Object.entries(formData)) {
					if (typeof value === "string") {
						body[key] = value;
					}
				}
			}
		} catch {
			return c.json({ error: "invalid_request" }, 400);
		}

		const grantType = body.grant_type;

		if (grantType === "authorization_code") {
			return handleAuthorizationCodeGrant(c, body, store);
		} else if (grantType === "refresh_token") {
			return handleRefreshTokenGrant(c, body, store);
		} else {
			return c.json(
				{
					error: "unsupported_grant_type",
					error_description: `Unsupported grant_type: ${grantType}`,
				},
				400
			);
		}
	});

	// =========================================================================
	// Token Revocation (RFC 7009)
	// =========================================================================

	app.post("/oauth/revoke", async (c) => {
		let body: Record<string, string>;
		try {
			const contentType = c.req.header("content-type") ?? "";
			if (contentType.includes("application/json")) {
				body = await c.req.json();
			} else {
				const formData = await c.req.parseBody();
				body = {} as Record<string, string>;
				for (const [key, value] of Object.entries(formData)) {
					if (typeof value === "string") {
						body[key] = value;
					}
				}
			}
		} catch {
			return c.json({ error: "invalid_request" }, 400);
		}

		const token = body.token;
		if (token) {
			store.revokeAccessToken(token);
		}

		// Always return 200 per RFC 7009
		return c.json({});
	});

	return app;
}

// =============================================================================
// Grant Type Handlers
// =============================================================================

function handleAuthorizationCodeGrant(
	c: { json: (data: unknown, status?: number) => Response },
	body: Record<string, string>,
	store: TokenStore
): Response {
	const { code, redirect_uri, client_id, code_verifier } = body;

	if (!code || !redirect_uri || !client_id || !code_verifier) {
		return c.json(
			{
				error: "invalid_request",
				error_description:
					"code, redirect_uri, client_id, and code_verifier are required",
			},
			400
		);
	}

	// Consume authorization code (single-use)
	const authCode = store.consumeAuthCode(code);
	if (!authCode) {
		return c.json(
			{
				error: "invalid_grant",
				error_description: "Invalid or expired authorization code",
			},
			400
		);
	}

	// Validate client and redirect_uri match
	if (authCode.clientId !== client_id) {
		return c.json(
			{
				error: "invalid_grant",
				error_description: "client_id mismatch",
			},
			400
		);
	}

	if (authCode.redirectUri !== redirect_uri) {
		return c.json(
			{
				error: "invalid_grant",
				error_description: "redirect_uri mismatch",
			},
			400
		);
	}

	// Verify PKCE code challenge
	if (!verifyCodeChallenge(code_verifier, authCode.codeChallenge)) {
		return c.json(
			{
				error: "invalid_grant",
				error_description: "PKCE code_verifier validation failed",
			},
			400
		);
	}

	// Validate client secret if confidential client
	const client = store.getClient(client_id);
	if (client?.token_endpoint_auth_method === "client_secret_post") {
		if (body.client_secret !== client.client_secret) {
			return c.json(
				{
					error: "invalid_client",
					error_description: "Invalid client_secret",
				},
				401
			);
		}
	}

	// Issue tokens
	const accessToken = generateToken(32);
	const refreshToken = generateToken(32);

	store.saveAccessToken({
		token: accessToken,
		clientId: client_id,
		scope: authCode.scope,
		githubUser: authCode.githubUser,
		expiresAt: Date.now() + ACCESS_TOKEN_TTL,
	});

	store.saveRefreshToken({
		token: refreshToken,
		clientId: client_id,
		scope: authCode.scope,
		githubUser: authCode.githubUser,
		accessToken,
	});

	console.error(
		`[OAuth] Token issued for user: ${authCode.githubUser.login}`
	);

	return c.json({
		access_token: accessToken,
		token_type: "Bearer",
		expires_in: ACCESS_TOKEN_TTL / 1000,
		refresh_token: refreshToken,
		scope: authCode.scope,
	});
}

function handleRefreshTokenGrant(
	c: { json: (data: unknown, status?: number) => Response },
	body: Record<string, string>,
	store: TokenStore
): Response {
	const { refresh_token, client_id } = body;

	if (!refresh_token || !client_id) {
		return c.json(
			{
				error: "invalid_request",
				error_description: "refresh_token and client_id are required",
			},
			400
		);
	}

	// Consume refresh token (rotation: single-use)
	const rt = store.consumeRefreshToken(refresh_token);
	if (!rt) {
		return c.json(
			{
				error: "invalid_grant",
				error_description: "Invalid refresh token",
			},
			400
		);
	}

	if (rt.clientId !== client_id) {
		return c.json(
			{
				error: "invalid_grant",
				error_description: "client_id mismatch",
			},
			400
		);
	}

	// Revoke old access token
	store.revokeAccessToken(rt.accessToken);

	// Issue new tokens (rotation)
	const newAccessToken = generateToken(32);
	const newRefreshToken = generateToken(32);

	store.saveAccessToken({
		token: newAccessToken,
		clientId: client_id,
		scope: rt.scope,
		githubUser: rt.githubUser,
		expiresAt: Date.now() + ACCESS_TOKEN_TTL,
	});

	store.saveRefreshToken({
		token: newRefreshToken,
		clientId: client_id,
		scope: rt.scope,
		githubUser: rt.githubUser,
		accessToken: newAccessToken,
	});

	return c.json({
		access_token: newAccessToken,
		token_type: "Bearer",
		expires_in: ACCESS_TOKEN_TTL / 1000,
		refresh_token: newRefreshToken,
		scope: rt.scope,
	});
}
