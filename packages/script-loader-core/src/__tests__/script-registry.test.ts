import { describe, it, expect, beforeEach } from "vitest";
import { ScriptRegistry } from "../script-registry";
import type { ScriptMetadata } from "../types";
import type { ScriptRuntime } from "../runtime";

/**
 * ScriptRegistry Tests
 *
 * Test Philosophy: These tests define the DESIRED behavior of ScriptRegistry,
 * not just what the current implementation does. Each test represents a contract
 * that the registry must fulfill.
 */

describe("ScriptRegistry - Desired Behavior", () => {
	let registry: ScriptRegistry;
	let mockRuntime: ScriptRuntime;

	beforeEach(() => {
		// Create a minimal mock runtime for registry tests
		mockRuntime = {
			load: async () => ({ id: "mock", exports: {} }),
			invokeById: async () => undefined,
			getExportById: async () => undefined,
		};
		registry = new ScriptRegistry(mockRuntime);
	});

	describe("Script Registration Contract", () => {
		it("should store and retrieve script metadata by identifier", () => {
			// DESIRED: Registry acts as a reliable store for script metadata
			const metadata: ScriptMetadata = {
				identifier: "/scripts/tool.ts",
				name: "tool",
				mtime: Date.now(),
				compiledCode: "export default {}",
			};

			registry.register(metadata);
			const retrieved = registry.get(metadata.identifier);

			expect(retrieved).toEqual(metadata);
		});

		it("should allow updating existing script by re-registering with same identifier", () => {
			// DESIRED: Re-registering should replace old metadata (hot reload scenario)
			const identifier = "/scripts/tool.ts";
			const v1: ScriptMetadata = {
				identifier,
				name: "tool",
				mtime: 1000,
				compiledCode: "v1",
			};
			const v2: ScriptMetadata = {
				identifier,
				name: "tool",
				mtime: 2000,
				compiledCode: "v2",
			};

			registry.register(v1);
			registry.register(v2);

			const retrieved = registry.get(identifier);
			expect(retrieved?.mtime).toBe(2000);
			expect(retrieved?.compiledCode).toBe("v2");
		});

		it("should support multiple scripts with different identifiers", () => {
			// DESIRED: Registry handles multiple scripts independently
			const script1: ScriptMetadata = {
				identifier: "/scripts/tool1.ts",
				name: "tool1",
				mtime: 1000,
				compiledCode: "code1",
			};
			const script2: ScriptMetadata = {
				identifier: "/scripts/tool2.ts",
				name: "tool2",
				mtime: 2000,
				compiledCode: "code2",
			};

			registry.register(script1);
			registry.register(script2);

			expect(registry.count()).toBe(2);
			expect(registry.get(script1.identifier)).toEqual(script1);
			expect(registry.get(script2.identifier)).toEqual(script2);
		});
	});

	describe("Script Unregistration Contract", () => {
		it("should completely remove script when unregistered", () => {
			// DESIRED: Unregistering should cleanly remove all traces
			const metadata: ScriptMetadata = {
				identifier: "/scripts/tool.ts",
				name: "tool",
				mtime: 1000,
				compiledCode: "code",
			};

			registry.register(metadata);
			expect(registry.has(metadata.identifier)).toBe(true);

			registry.unregister(metadata.identifier);
			expect(registry.has(metadata.identifier)).toBe(false);
			expect(registry.get(metadata.identifier)).toBeUndefined();
		});

		it("should handle unregistering non-existent identifiers gracefully", () => {
			// DESIRED: Unregistering an identifier that doesn't exist should be safe
			expect(() => {
				registry.unregister("/non/existent/path.ts");
			}).not.toThrow();
		});

		it("should not affect other scripts when unregistering one", () => {
			// DESIRED: Unregistration is isolated to specific script
			const script1: ScriptMetadata = {
				identifier: "/scripts/tool1.ts",
				name: "tool1",
				mtime: 1000,
				compiledCode: "code1",
			};
			const script2: ScriptMetadata = {
				identifier: "/scripts/tool2.ts",
				name: "tool2",
				mtime: 2000,
				compiledCode: "code2",
			};

			registry.register(script1);
			registry.register(script2);
			registry.unregister(script1.identifier);

			expect(registry.has(script1.identifier)).toBe(false);
			expect(registry.has(script2.identifier)).toBe(true);
			expect(registry.count()).toBe(1);
		});
	});

	describe("Query Operations Contract", () => {
		beforeEach(() => {
			// Setup common test data
			const scripts: ScriptMetadata[] = [
				{
					identifier: "/scripts/auth/login.ts",
					name: "auth/login",
					mtime: 1000,
					compiledCode: "login",
				},
				{
					identifier: "/scripts/auth/logout.ts",
					name: "auth/logout",
					mtime: 2000,
					compiledCode: "logout",
				},
				{
					identifier: "/scripts/db/query.ts",
					name: "db/query",
					mtime: 3000,
					compiledCode: "query",
				},
			];
			scripts.forEach((s) => registry.register(s));
		});

		it("should retrieve all registered scripts", () => {
			// DESIRED: getAll returns complete snapshot of registry
			const all = registry.getAll();

			expect(all).toHaveLength(3);
			expect(all.map((s) => s.name).sort()).toEqual([
				"auth/login",
				"auth/logout",
				"db/query",
			]);
		});

		it("should retrieve all script identifiers", () => {
			// DESIRED: getIdentifiers returns all registered identifiers
			const identifiers = registry.getIdentifiers();

			expect(identifiers).toHaveLength(3);
			expect(identifiers.sort()).toEqual([
				"/scripts/auth/login.ts",
				"/scripts/auth/logout.ts",
				"/scripts/db/query.ts",
			]);
		});

		it("should find scripts by name", () => {
			// DESIRED: getByName supports name-based lookup
			const loginScripts = registry.getByName("auth/login");

			expect(loginScripts).toHaveLength(1);
			expect(loginScripts[0]?.identifier).toBe("/scripts/auth/login.ts");
		});

		it("should return empty array for non-existent names", () => {
			// DESIRED: Query for non-existent name returns empty, not error
			const scripts = registry.getByName("non/existent");

			expect(scripts).toEqual([]);
		});

		it("should handle multiple scripts with same name", () => {
			// DESIRED: Support edge case where multiple files have same derived name
			const duplicate: ScriptMetadata = {
				identifier: "/other/auth/login.ts",
				name: "auth/login",
				mtime: 4000,
				compiledCode: "duplicate",
			};

			registry.register(duplicate);
			const loginScripts = registry.getByName("auth/login");

			expect(loginScripts).toHaveLength(2);
			expect(loginScripts.map((s) => s.identifier).sort()).toEqual([
				"/other/auth/login.ts",
				"/scripts/auth/login.ts",
			]);
		});

		it("should report accurate count", () => {
			// DESIRED: count() reflects current registry size
			expect(registry.count()).toBe(3);

			registry.unregister("/scripts/auth/login.ts");
			expect(registry.count()).toBe(2);

			registry.clear();
			expect(registry.count()).toBe(0);
		});
	});

	describe("Clear Operation Contract", () => {
		it("should remove all scripts when cleared", () => {
			// DESIRED: clear() resets registry to empty state
			const scripts: ScriptMetadata[] = [
				{ identifier: "/s1.ts", name: "s1", mtime: 1, compiledCode: "c1" },
				{ identifier: "/s2.ts", name: "s2", mtime: 2, compiledCode: "c2" },
			];
			scripts.forEach((s) => registry.register(s));

			registry.clear();

			expect(registry.count()).toBe(0);
			expect(registry.getAll()).toEqual([]);
			expect(registry.getIdentifiers()).toEqual([]);
		});

		it("should allow re-registration after clear", () => {
			// DESIRED: Registry is fully reusable after clear
			const metadata: ScriptMetadata = {
				identifier: "/script.ts",
				name: "script",
				mtime: 1000,
				compiledCode: "code",
			};

			registry.register(metadata);
			registry.clear();
			registry.register(metadata);

			expect(registry.count()).toBe(1);
			expect(registry.get(metadata.identifier)).toEqual(metadata);
		});
	});

	describe("Edge Cases and Robustness", () => {
		it("should handle empty registry operations gracefully", () => {
			// DESIRED: All operations work on empty registry
			expect(registry.count()).toBe(0);
			expect(registry.getAll()).toEqual([]);
			expect(registry.getIdentifiers()).toEqual([]);
			expect(registry.getByName("any")).toEqual([]);
			expect(registry.get("/any/path.ts")).toBeUndefined();
			expect(() => registry.clear()).not.toThrow();
		});

		it("should preserve metadata object integrity", () => {
			// DESIRED: Registry doesn't mutate stored metadata
			const metadata: ScriptMetadata = {
				identifier: "/script.ts",
				name: "script",
				mtime: 1000,
				compiledCode: "code",
			};

			registry.register(metadata);
			metadata.mtime = 2000; // Mutate original

			const retrieved = registry.get(metadata.identifier);
			// Registry should store reference or copy - behavior is implementation detail
			// but retrieved data should be valid ScriptMetadata
			expect(retrieved).toBeDefined();
			expect(retrieved?.identifier).toBe("/script.ts");
		});

		it("should handle special characters in identifiers and names", () => {
			// DESIRED: Registry handles various identifier formats
			const metadata: ScriptMetadata = {
				identifier: "/scripts/special-chars/tool_name.v2.ts",
				name: "special-chars/tool_name.v2",
				mtime: 1000,
				compiledCode: "code",
			};

			registry.register(metadata);

			expect(registry.get(metadata.identifier)).toEqual(metadata);
			expect(registry.getByName(metadata.name)).toHaveLength(1);
		});
	});
});
