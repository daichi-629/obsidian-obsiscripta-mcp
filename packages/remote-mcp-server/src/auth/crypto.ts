/**
 * Cryptographic utilities for OAuth 2.1
 */

import { randomBytes, createHash } from "node:crypto";

/**
 * Generate a cryptographically random string (URL-safe base64)
 */
export function generateToken(bytes: number = 32): string {
	return randomBytes(bytes).toString("base64url");
}

/**
 * Generate a unique client ID
 */
export function generateClientId(): string {
	return `client_${generateToken(16)}`;
}

/**
 * Generate a client secret
 */
export function generateClientSecret(): string {
	return `secret_${generateToken(32)}`;
}

/**
 * Verify PKCE S256 code challenge
 * code_challenge = BASE64URL(SHA256(code_verifier))
 */
export function verifyCodeChallenge(
	codeVerifier: string,
	codeChallenge: string
): boolean {
	const hash = createHash("sha256").update(codeVerifier).digest("base64url");
	return hash === codeChallenge;
}
