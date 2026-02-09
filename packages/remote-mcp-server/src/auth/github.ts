/**
 * GitHub OAuth integration.
 * Handles the upstream GitHub OAuth flow for user authentication.
 */

import type { GitHubUser } from "../types.js";

export interface GitHubOAuthConfig {
	clientId: string;
	clientSecret: string;
	/** The callback URL on our auth server */
	redirectUri: string;
}

interface GitHubTokenResponse {
	access_token: string;
	token_type: string;
	scope: string;
	error?: string;
	error_description?: string;
}

/**
 * Build the GitHub authorization URL for user login
 */
export function buildGitHubAuthorizeUrl(
	config: GitHubOAuthConfig,
	state: string
): string {
	const params = new URLSearchParams({
		client_id: config.clientId,
		redirect_uri: config.redirectUri,
		scope: "read:user user:email",
		state,
	});
	return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange a GitHub authorization code for an access token
 */
export async function exchangeGitHubCode(
	config: GitHubOAuthConfig,
	code: string
): Promise<string> {
	const response = await fetch("https://github.com/login/oauth/access_token", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({
			client_id: config.clientId,
			client_secret: config.clientSecret,
			code,
			redirect_uri: config.redirectUri,
		}),
	});

	const data = (await response.json()) as GitHubTokenResponse;
	if (data.error) {
		throw new Error(
			`GitHub OAuth error: ${data.error} - ${data.error_description}`
		);
	}

	return data.access_token;
}

/**
 * Fetch the authenticated GitHub user profile
 */
export async function fetchGitHubUser(
	accessToken: string
): Promise<GitHubUser> {
	const response = await fetch("https://api.github.com/user", {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`GitHub API error: ${response.status}`);
	}

	const data = (await response.json()) as {
		id: number;
		login: string;
		name: string | null;
		avatar_url: string;
	};

	return {
		id: data.id,
		login: data.login,
		name: data.name,
		avatar_url: data.avatar_url,
	};
}
