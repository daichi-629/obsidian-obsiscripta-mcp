import { describe, expect, it } from "vitest";
import { createSessionContext, createSessionAwareContext, deleteSessionStore } from "../../mcp/session-store";

describe("session-store", () => {
	it("stores values per session id", () => {
		const first = createSessionContext("session-1");
		const second = createSessionContext("session-2");

		first.set("key", "value-1");
		second.set("key", "value-2");

		expect(first.get("key")).toBe("value-1");
		expect(second.get("key")).toBe("value-2");
	});

	it("attaches session api to context", () => {
		const context = createSessionAwareContext(
			{ app: {} as never, vault: {} as never, session: createSessionContext("base") },
			"session-aware"
		);

		context.session.set("token", 123);
		expect(context.session.get("token")).toBe(123);
	});

	it("clears data when session is deleted", () => {
		const session = createSessionContext("session-delete");
		session.set("key", "value");
		expect(session.get("key")).toBe("value");

		deleteSessionStore("session-delete");
		expect(session.get("key")).toBeUndefined();
	});
});
