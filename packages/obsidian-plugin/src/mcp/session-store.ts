export interface SessionApi {
	get: (key: string) => unknown;
	set: (key: string, value: unknown) => void;
	delete: (key: string) => void;
	clear: () => void;
}

const DEFAULT_SESSION_ID = "__bridge_v1__";

// Global in-memory session storage keyed by MCP session id.
const sessionStore = new Map<string, Map<string, unknown>>();

function resolveSessionId(sessionId: string | undefined): string {
	return sessionId ?? DEFAULT_SESSION_ID;
}

function getSessionData(sessionId: string): Map<string, unknown> {
	let data = sessionStore.get(sessionId);
	if (!data) {
		data = new Map<string, unknown>();
		sessionStore.set(sessionId, data);
	}
	return data;
}

export function createSessionApi(sessionId: string | undefined): SessionApi {
	const resolvedSessionId = resolveSessionId(sessionId);

	return {
		get: (key: string) => getSessionData(resolvedSessionId).get(key),
		set: (key: string, value: unknown) => {
			getSessionData(resolvedSessionId).set(key, value);
		},
		delete: (key: string) => {
			getSessionData(resolvedSessionId).delete(key);
		},
		clear: () => {
			getSessionData(resolvedSessionId).clear();
		},
	};
}

export function clearSessionStore(sessionId: string): void {
	sessionStore.delete(sessionId);
}
