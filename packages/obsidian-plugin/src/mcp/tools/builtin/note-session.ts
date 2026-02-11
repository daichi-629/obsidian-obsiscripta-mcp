const NOTE_READ_SESSION_KEY_PREFIX = "notes:read:";

export function getReadSessionKey(normalizedPath: string): string {
	return `${NOTE_READ_SESSION_KEY_PREFIX}${normalizedPath}`;
}
