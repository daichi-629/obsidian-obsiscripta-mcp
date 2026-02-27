import { randomUUID } from "crypto";
import type { SessionDataStore } from "../plugin/context";
import type { MCPSessionInfo } from "./mcp-types";

type SessionDataMap = Map<string, unknown>;

class SessionDataStoreImpl implements SessionDataStore {
	private sessionId: string;
	private data: SessionDataMap;
	private touch: (sessionId: string) => void;

	constructor(
		sessionId: string,
		data: SessionDataMap,
		touch: (sessionId: string) => void
	) {
		this.sessionId = sessionId;
		this.data = data;
		this.touch = touch;
	}

	get<T = unknown>(key: string): T | undefined {
		this.touch(this.sessionId);
		return this.data.get(key) as T | undefined;
	}

	add<T = unknown>(key: string, value: T): void {
		this.touch(this.sessionId);
		const current = this.data.get(key);
		if (Array.isArray(current)) {
			current.push(value);
			return;
		}
		if (current === undefined) {
			this.data.set(key, [value]);
			return;
		}
		this.data.set(key, [current, value]);
	}

	set<T = unknown>(key: string, value: T): void {
		this.touch(this.sessionId);
		this.data.set(key, value);
	}

	delete(key: string): boolean {
		this.touch(this.sessionId);
		return this.data.delete(key);
	}
}

export class SessionManagement {
	private sessions = new Map<string, MCPSessionInfo>();
	private dataStores = new Map<string, SessionDataMap>();

	createSession(): MCPSessionInfo {
		const sessionId = randomUUID();
		const now = Date.now();
		const info: MCPSessionInfo = {
			sessionId,
			createdAt: now,
			lastAccessedAt: now,
		};
		this.sessions.set(sessionId, info);
		this.dataStores.set(sessionId, new Map());
		return info;
	}

	getSession(sessionId: string): MCPSessionInfo | null {
		const info = this.sessions.get(sessionId);
		if (!info) {
			return null;
		}
		info.lastAccessedAt = Date.now();
		return info;
	}

	deleteSession(sessionId: string): boolean {
		this.dataStores.delete(sessionId);
		return this.sessions.delete(sessionId);
	}

	getSessionStore(sessionId: string): SessionDataStore | null {
		const info = this.getSession(sessionId);
		if (!info) {
			return null;
		}
		let store = this.dataStores.get(sessionId);
		if (!store) {
			store = new Map();
			this.dataStores.set(sessionId, store);
		}
		return new SessionDataStoreImpl(sessionId, store, (id) => {
			const touched = this.sessions.get(id);
			if (touched) {
				touched.lastAccessedAt = Date.now();
			}
		});
	}
}
