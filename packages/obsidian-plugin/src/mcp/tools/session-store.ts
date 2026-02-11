import type { AppContext, SessionContextApi } from "../../plugin/context";

const sessionStore = new Map<string, Map<string, unknown>>();

function getSessionMap(sessionId: string): Map<string, unknown> {
	let sessionMap = sessionStore.get(sessionId);
	if (!sessionMap) {
		sessionMap = new Map<string, unknown>();
		sessionStore.set(sessionId, sessionMap);
	}
	return sessionMap;
}

export function createSessionContext(sessionId: string): SessionContextApi {
	return {
		get: (key: string): unknown => getSessionMap(sessionId).get(key),
		set: (key: string, value: unknown): void => {
			getSessionMap(sessionId).set(key, value);
		},
		delete: (key: string): boolean => getSessionMap(sessionId).delete(key),
		has: (key: string): boolean => getSessionMap(sessionId).has(key),
		clear: (): void => {
			getSessionMap(sessionId).clear();
		},
	};
}

export function createSessionAwareContext(baseContext: AppContext, sessionId: string): AppContext {
	return {
		...baseContext,
		session: createSessionContext(sessionId),
	};
}

export function deleteSessionStore(sessionId: string): void {
	sessionStore.delete(sessionId);
}
