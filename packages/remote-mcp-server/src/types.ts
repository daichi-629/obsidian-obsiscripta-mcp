/**
 * Type definitions for remote-mcp-server
 * Re-exports shared bridge types and defines server-specific types
 */

export type {
	MCPContent,
	HealthResponse,
	Tool,
	ToolListResponse,
	ToolCallRequest,
	ToolCallSuccessResponse,
	ToolCallErrorResponse,
	ToolCallResponse,
	ErrorResponse,
} from "@obsiscripta/shared";

// =============================================================================
// OAuth Types
// =============================================================================

/**
 * OAuth 2.1 client registered via Dynamic Client Registration (RFC 7591)
 */
export interface OAuthClient {
	client_id: string;
	client_secret?: string;
	redirect_uris: string[];
	client_name?: string;
	token_endpoint_auth_method: "none" | "client_secret_post";
	grant_types: string[];
	response_types: string[];
	scope?: string;
	created_at: number;
}

/**
 * Authorization code stored during OAuth flow
 */
export interface AuthorizationCode {
	code: string;
	clientId: string;
	redirectUri: string;
	scope: string;
	codeChallenge: string;
	codeChallengeMethod: "S256";
	githubAccessToken: string;
	githubUser: GitHubUser;
	expiresAt: number;
}

/**
 * Access token issued to MCP clients
 */
export interface AccessToken {
	token: string;
	clientId: string;
	scope: string;
	githubUser: GitHubUser;
	expiresAt: number;
}

/**
 * Refresh token for obtaining new access tokens
 */
export interface RefreshToken {
	token: string;
	clientId: string;
	scope: string;
	githubUser: GitHubUser;
	accessToken: string;
}

/**
 * GitHub user profile
 */
export interface GitHubUser {
	id: number;
	login: string;
	name: string | null;
	avatar_url: string;
}

// =============================================================================
// Plugin Token Types
// =============================================================================

/**
 * Token for authenticating MCP server → Obsidian plugin communication
 */
export interface PluginToken {
	id: string;
	name: string;
	token: string;
	pluginHost: string;
	pluginPort: number;
	/** GitHub user ID this plugin token is associated with */
	githubUserId: number;
	/** Whether authentication is required for plugin communication */
	requireAuth: boolean;
	createdAt: number;
	lastUsedAt?: number;
}

// =============================================================================
// MCP Types
// =============================================================================

/**
 * MCP Tool definition used internally
 */
export interface MCPToolDefinition {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

/**
 * Tool polling state
 */
export interface PollingState {
	lastHash: string;
	tools: Map<string, MCPToolDefinition>;
	lastError?: Error;
}
