/**
 * Global in-memory session data store.
 * Key: MCP session id
 * Value: per-session key/value map used by script tools.
 */
const sessionDataStore = new Map<string, Map<string, unknown>>();

export interface SessionApi {
	get: (key: string) => unknown;
	set: (key: string, value: unknown) => void;
}

export function createSessionApi(sessionId: string): SessionApi {
	let data = sessionDataStore.get(sessionId);
	if (!data) {
		data = new Map<string, unknown>();
		sessionDataStore.set(sessionId, data);
	}

	return {
		get: (key: string) => data.get(key),
		set: (key: string, value: unknown) => {
			data.set(key, value);
		},
	};
}

export function clearSessionData(sessionId: string): void {
	sessionDataStore.delete(sessionId);
}
