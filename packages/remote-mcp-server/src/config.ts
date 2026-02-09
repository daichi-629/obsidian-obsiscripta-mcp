/**
 * Server configuration loaded from environment variables
 */

declare const __SERVER_VERSION__: string;

export const SERVER_VERSION =
	typeof __SERVER_VERSION__ !== "undefined" ? __SERVER_VERSION__ : "0.0.0-dev";

export interface ServerConfig {
	/** Server port */
	port: number;
	/** Server bind host */
	host: string;
	/** External base URL for OAuth callbacks and metadata */
	externalUrl: string;

	/** GitHub OAuth App client ID */
	githubClientId: string;
	/** GitHub OAuth App client secret */
	githubClientSecret: string;

	/** Admin API secret for managing plugin tokens */
	adminSecret: string;

	/** Session secret for signing tokens */
	sessionSecret: string;
}

export function loadConfig(): ServerConfig {
	const externalUrl =
		env("EXTERNAL_URL") ??
		`http://${env("HOST") ?? "127.0.0.1"}:${env("PORT") ?? "3001"}`;

	return {
		port: intEnv("PORT", 3001),
		host: env("HOST") ?? "127.0.0.1",
		externalUrl,

		githubClientId: requireEnv("GITHUB_CLIENT_ID"),
		githubClientSecret: requireEnv("GITHUB_CLIENT_SECRET"),

		adminSecret: requireEnv("ADMIN_SECRET"),
		sessionSecret:
			env("SESSION_SECRET") ?? crypto.randomUUID().replace(/-/g, ""),
	};
}

function env(key: string): string | undefined {
	return process.env[key];
}

function requireEnv(key: string): string {
	const value = process.env[key];
	if (!value) {
		throw new Error(`Required environment variable ${key} is not set`);
	}
	return value;
}

function intEnv(key: string, defaultValue: number): number {
	const value = process.env[key];
	if (!value) return defaultValue;
	const parsed = parseInt(value, 10);
	if (isNaN(parsed)) {
		throw new Error(`Environment variable ${key} must be a number`);
	}
	return parsed;
}
