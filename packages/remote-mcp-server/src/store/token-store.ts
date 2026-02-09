/**
 * In-memory store for OAuth tokens, clients, and auth codes.
 * For production, replace with a persistent store (Redis, DB, etc.)
 */

import type {
	OAuthClient,
	AuthorizationCode,
	AccessToken,
	RefreshToken,
	PluginToken,
} from "../types.js";

export class TokenStore {
	// OAuth client registrations (Dynamic Client Registration)
	private clients = new Map<string, OAuthClient>();

	// Authorization codes (short-lived)
	private authCodes = new Map<string, AuthorizationCode>();

	// Access tokens
	private accessTokens = new Map<string, AccessToken>();

	// Refresh tokens
	private refreshTokens = new Map<string, RefreshToken>();

	// Plugin tokens (MCP server → Plugin auth)
	private pluginTokens = new Map<string, PluginToken>();

	// =========================================================================
	// OAuth Clients
	// =========================================================================

	saveClient(client: OAuthClient): void {
		this.clients.set(client.client_id, client);
	}

	getClient(clientId: string): OAuthClient | undefined {
		return this.clients.get(clientId);
	}

	deleteClient(clientId: string): boolean {
		return this.clients.delete(clientId);
	}

	// =========================================================================
	// Authorization Codes
	// =========================================================================

	saveAuthCode(code: AuthorizationCode): void {
		this.authCodes.set(code.code, code);
	}

	consumeAuthCode(code: string): AuthorizationCode | undefined {
		const authCode = this.authCodes.get(code);
		if (authCode) {
			this.authCodes.delete(code);
			if (authCode.expiresAt < Date.now()) {
				return undefined; // expired
			}
		}
		return authCode;
	}

	// =========================================================================
	// Access Tokens
	// =========================================================================

	saveAccessToken(token: AccessToken): void {
		this.accessTokens.set(token.token, token);
	}

	getAccessToken(token: string): AccessToken | undefined {
		const t = this.accessTokens.get(token);
		if (t && t.expiresAt < Date.now()) {
			this.accessTokens.delete(token);
			return undefined; // expired
		}
		return t;
	}

	revokeAccessToken(token: string): boolean {
		return this.accessTokens.delete(token);
	}

	// =========================================================================
	// Refresh Tokens
	// =========================================================================

	saveRefreshToken(token: RefreshToken): void {
		this.refreshTokens.set(token.token, token);
	}

	consumeRefreshToken(token: string): RefreshToken | undefined {
		const rt = this.refreshTokens.get(token);
		if (rt) {
			this.refreshTokens.delete(token);
		}
		return rt;
	}

	// =========================================================================
	// Plugin Tokens
	// =========================================================================

	savePluginToken(token: PluginToken): void {
		this.pluginTokens.set(token.id, token);
	}

	getPluginToken(id: string): PluginToken | undefined {
		return this.pluginTokens.get(id);
	}

	getPluginTokenByValue(tokenValue: string): PluginToken | undefined {
		for (const token of this.pluginTokens.values()) {
			if (token.token === tokenValue) {
				return token;
			}
		}
		return undefined;
	}

	listPluginTokens(): PluginToken[] {
		return Array.from(this.pluginTokens.values());
	}

	deletePluginToken(id: string): boolean {
		return this.pluginTokens.delete(id);
	}

	getActivePluginToken(): PluginToken | undefined {
		// Return the first available plugin token
		for (const token of this.pluginTokens.values()) {
			return token;
		}
		return undefined;
	}

	/**
	 * Get plugin token for a specific GitHub user
	 */
	getPluginTokenByUserId(githubUserId: number): PluginToken | undefined {
		for (const token of this.pluginTokens.values()) {
			if (token.githubUserId === githubUserId) {
				return token;
			}
		}
		return undefined;
	}

	/**
	 * List plugin tokens for a specific GitHub user
	 */
	listPluginTokensByUserId(githubUserId: number): PluginToken[] {
		return Array.from(this.pluginTokens.values()).filter(
			(token) => token.githubUserId === githubUserId
		);
	}

	// =========================================================================
	// Cleanup
	// =========================================================================

	/**
	 * Remove expired tokens. Call periodically.
	 */
	cleanup(): void {
		const now = Date.now();

		for (const [key, code] of this.authCodes) {
			if (code.expiresAt < now) {
				this.authCodes.delete(key);
			}
		}

		for (const [key, token] of this.accessTokens) {
			if (token.expiresAt < now) {
				this.accessTokens.delete(key);
			}
		}
	}
}
