import type { MCPSessionInfo } from "./mcp-types";

interface SessionStoreConfig {
	ttlMs?: number;
	maxSessions?: number;
}

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 100;

export class MCPSessionStore {
	private readonly sessions = new Map<string, MCPSessionInfo>();
	private readonly ttlMs: number;
	private readonly maxSessions: number;

	constructor(config: SessionStoreConfig = {}) {
		this.ttlMs = config.ttlMs ?? DEFAULT_SESSION_TTL_MS;
		this.maxSessions = config.maxSessions ?? DEFAULT_MAX_SESSIONS;
	}

	create(): MCPSessionInfo {
		this.gc();
		this.evictIfNeeded();

		const now = Date.now();
		const session: MCPSessionInfo = {
			sessionId: this.generateSessionId(),
			createdAt: now,
			lastAccessedAt: now,
		};
		this.sessions.set(session.sessionId, session);
		return session;
	}

	get(sessionId: string): MCPSessionInfo | null {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return null;
		}

		if (this.isExpired(session, Date.now())) {
			this.sessions.delete(sessionId);
			return null;
		}

		return session;
	}

	touch(sessionId: string): MCPSessionInfo | null {
		const session = this.get(sessionId);
		if (!session) {
			return null;
		}
		session.lastAccessedAt = Date.now();
		return session;
	}

	delete(sessionId: string): boolean {
		return this.sessions.delete(sessionId);
	}

	gc(now: number = Date.now()): void {
		for (const [sessionId, session] of this.sessions) {
			if (this.isExpired(session, now)) {
				this.sessions.delete(sessionId);
			}
		}
	}

	private isExpired(session: MCPSessionInfo, now: number): boolean {
		return now - session.lastAccessedAt > this.ttlMs;
	}

	private generateSessionId(): string {
		const runtimeCrypto = globalThis.crypto;
		if (runtimeCrypto && typeof runtimeCrypto.randomUUID === "function") {
			return runtimeCrypto.randomUUID();
		}

		return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
	}

	private evictIfNeeded(): void {
		if (this.sessions.size < this.maxSessions) {
			return;
		}

		const oldest = [...this.sessions.values()].sort(
			(a, b) => a.lastAccessedAt - b.lastAccessedAt
		)[0];
		if (oldest) {
			this.sessions.delete(oldest.sessionId);
		}
	}
}
