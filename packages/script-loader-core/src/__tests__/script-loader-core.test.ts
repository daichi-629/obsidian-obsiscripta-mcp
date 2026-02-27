import { describe, it, expect, beforeEach, vi } from "vitest";
import { ScriptLoaderCore } from "../script-loader-core";
import { ScriptRegistry } from "../script-registry";
import { DefaultScriptCompiler } from "../script-compiler";
import { FunctionRuntime, type ExecutionContextConfig } from "../function-runtime";
import {
	MockScriptHost,
	MockLogger,
	delay,
} from "./test-helpers";
import type { ScriptLoaderCallbacks } from "../types";

/**
 * ScriptLoaderCore Tests
 *
 * Test Philosophy: Define DESIRED end-to-end behavior for the script loading system.
 * These tests focus on user-visible outcomes and system contracts, not implementation.
 */

describe("ScriptLoaderCore - Desired Behavior", () => {
	let scriptHost: MockScriptHost;
	let logger: MockLogger;
	let registry: ScriptRegistry;
	let compiler: DefaultScriptCompiler;
	let runtime: FunctionRuntime;
	let callbacks: ScriptLoaderCallbacks;
	let loader: ScriptLoaderCore;

	beforeEach(() => {
		scriptHost = new MockScriptHost();
		logger = new MockLogger();
		compiler = new DefaultScriptCompiler();

		const contextConfig: ExecutionContextConfig = {
			variableNames: ["testContext"],
			provideContext: () => ({ testContext: { value: "test" } }),
		};
		runtime = new FunctionRuntime(contextConfig);
		registry = new ScriptRegistry(runtime);

		callbacks = {
			onScriptLoaded: vi.fn(),
			onScriptUnloaded: vi.fn(),
			onScriptError: vi.fn(),
		};
	});

	const createLoader = (debounce: number = 50) => {
		return new ScriptLoaderCore(
			scriptHost,
			logger,
			registry,
			compiler,
			runtime,
			{},
			callbacks,
			debounce
		);
	};

	describe("Initial Load Contract", () => {
		it("should load all existing scripts on start", async () => {
			// DESIRED: System discovers and loads all scripts at startup
			scriptHost.setFile(
				"tool1.ts",
				'export default { name: "tool1" };',
				1000
			);
			scriptHost.setFile(
				"tool2.js",
				'module.exports = { name: "tool2" };',
				2000
			);

			loader = createLoader();
			await loader.start();

			expect(callbacks.onScriptLoaded).toHaveBeenCalledTimes(2);
			expect(registry.count()).toBe(2);
		});

		it("should call onScriptLoaded callback for each loaded script", async () => {
			// DESIRED: System notifies about successful loads
			scriptHost.setFile("tool.ts", "export default {};", 1000);

			loader = createLoader();
			await loader.start();

			expect(callbacks.onScriptLoaded).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "tool",
					identifier: "tool.ts",
				}),
				expect.any(Object)
			);
		});

		it("should handle empty scripts directory gracefully", async () => {
			// DESIRED: Starting with no scripts doesn't cause errors
			loader = createLoader();
			await loader.start();

			expect(registry.count()).toBe(0);
			expect(logger.hasError()).toBe(false);
		});

		it("should skip non-script files", async () => {
			// DESIRED: Only .js and .ts files are loaded
			scriptHost.setFile("readme.md", "# Documentation", 1000);
			scriptHost.setFile("types.d.ts", "export type T = {};", 2000);
			scriptHost.setFile("tool.ts", "export default {};", 3000);

			loader = createLoader();
			await loader.start();

			expect(registry.count()).toBe(1);
			expect(registry.get("tool.ts")).toBeDefined();
		});

		it("should derive unique tool names from file paths", async () => {
			// DESIRED: Nested paths create namespaced tool names
			scriptHost.setFile("auth/login.ts", "export default {};", 1000);
			scriptHost.setFile("db/query.ts", "export default {};", 2000);

			loader = createLoader();
			await loader.start();

			const scripts = registry.getAll();
			expect(scripts.map((s) => s.name).sort()).toEqual([
				"auth/login",
				"db/query",
			]);
		});
	});

	describe("Hot Reload Contract", () => {
		it("should reload script when file is modified", async () => {
			// DESIRED: File changes trigger automatic reload
			scriptHost.setFile("tool.ts", "export default { v: 1 };", 1000);

			loader = createLoader();
			await loader.start();

			expect(callbacks.onScriptLoaded).toHaveBeenCalledTimes(1);

			// Modify file
			scriptHost.updateFile("tool.ts", "export default { v: 2 };", 2000);
			scriptHost.triggerModify("tool.ts");

			// Wait for debounced reload
			await delay(100);

			// Should have called onScriptUnloaded and onScriptLoaded again
			expect(callbacks.onScriptLoaded).toHaveBeenCalledTimes(2);
		});

		it("should load new scripts when created", async () => {
			// DESIRED: New files are automatically detected
			loader = createLoader();
			await loader.start();

			expect(registry.count()).toBe(0);

			scriptHost.setFile("new-tool.ts", "export default {};", 1000);
			scriptHost.triggerCreate("new-tool.ts");

			await delay(100);

			expect(registry.count()).toBe(1);
			expect(callbacks.onScriptLoaded).toHaveBeenCalled();
		});

		it("should unload scripts when deleted", async () => {
			// DESIRED: Deleted files are removed from registry
			scriptHost.setFile("tool.ts", "export default {};", 1000);

			loader = createLoader();
			await loader.start();

			expect(registry.count()).toBe(1);

			scriptHost.deleteFile("tool.ts");
			scriptHost.triggerDelete("tool.ts");

			await delay(100);

			expect(registry.count()).toBe(0);
			expect(callbacks.onScriptUnloaded).toHaveBeenCalled();
		});

		it("should handle rapid file changes with debouncing", async () => {
			// DESIRED: Multiple rapid changes don't cause excessive reloads
			scriptHost.setFile("tool.ts", "export default { v: 1 };", 1000);

			loader = createLoader();
			await loader.start();

			const initialCalls = (callbacks.onScriptLoaded as ReturnType<typeof vi.fn>).mock
				.calls.length;

			// Trigger multiple rapid changes
			scriptHost.triggerModify("tool.ts");
			scriptHost.triggerModify("tool.ts");
			scriptHost.triggerModify("tool.ts");

			// Wait for debounce
			await delay(100);

			// Should have reloaded once (debounced)
			const finalCalls = (callbacks.onScriptLoaded as ReturnType<typeof vi.fn>).mock.calls
				.length;
			// Verify that reload actually happened (at least once)
			expect(finalCalls).toBeGreaterThan(initialCalls);
			// Verify that debouncing worked (not 3 separate reloads)
			expect(finalCalls).toBeLessThan(initialCalls + 3);
			// Ideally should be exactly one reload
			expect(finalCalls).toBe(initialCalls + 1);
		});
	});

	describe("Error Handling Contract", () => {
		it("should call onScriptError for compilation failures", async () => {
			// DESIRED: Compilation errors are reported, not swallowed
			scriptHost.setFile(
				"broken.ts",
				"const x: = invalid syntax;",
				1000
			);

			loader = createLoader();
			await loader.start();

			expect(callbacks.onScriptError).toHaveBeenCalledWith(
				"broken.ts",
				expect.any(Error)
			);
			expect(registry.count()).toBe(0);
		});

		it("should call onScriptError for runtime errors", async () => {
			// DESIRED: Execution errors are caught and reported
			scriptHost.setFile("throws.ts", "throw new Error('boom');", 1000);

			loader = createLoader();
			await loader.start();

			expect(callbacks.onScriptError).toHaveBeenCalled();
			expect(registry.count()).toBe(0);
		});

		it("should continue loading other scripts after one fails", async () => {
			// DESIRED: One bad script doesn't block others
			scriptHost.setFile("good.ts", "export default {};", 1000);
			scriptHost.setFile("bad.ts", "invalid syntax", 2000);
			scriptHost.setFile("good2.ts", "export default {};", 3000);

			loader = createLoader();
			await loader.start();

			expect(callbacks.onScriptError).toHaveBeenCalledTimes(1);
			expect(registry.count()).toBe(2);
			expect(registry.get("good.ts")).toBeDefined();
			expect(registry.get("good2.ts")).toBeDefined();
		});

		it("should unregister script if reload fails", async () => {
			// DESIRED: Previously working script removed if new version breaks
			scriptHost.setFile("tool.ts", "export default {};", 1000);

			loader = createLoader();
			await loader.start();

			expect(registry.count()).toBe(1);

			// Update to invalid code
			scriptHost.updateFile("tool.ts", "invalid syntax", 2000);
			scriptHost.triggerModify("tool.ts");

			await delay(100);

			expect(callbacks.onScriptError).toHaveBeenCalled();
			expect(registry.count()).toBe(0);
		});
	});

	describe("Lifecycle Management Contract", () => {
		it("should stop watching when stopped", async () => {
			// DESIRED: stop() cleans up watchers
			loader = createLoader();
			await loader.start();

			await loader.stop();

			// Trigger should have no effect after stop
			scriptHost.setFile("tool.ts", "export default {};", 1000);
			scriptHost.triggerCreate("tool.ts");

			await delay(100);

			expect(callbacks.onScriptLoaded).not.toHaveBeenCalled();
		});

		it("should unregister all scripts when stopped", async () => {
			// DESIRED: stop() fully cleans up state
			scriptHost.setFile("tool1.ts", "export default {};", 1000);
			scriptHost.setFile("tool2.ts", "export default {};", 2000);

			loader = createLoader();
			await loader.start();

			expect(registry.count()).toBe(2);

			await loader.stop();

			expect(registry.count()).toBe(0);
			expect(callbacks.onScriptUnloaded).toHaveBeenCalledTimes(2);
		});

		it("should allow restart after stop", async () => {
			// DESIRED: Loader is reusable
			scriptHost.setFile("tool.ts", "export default {};", 1000);

			loader = createLoader();
			await loader.start();
			await loader.stop();
			await loader.start();

			expect(registry.count()).toBe(1);
		});
	});

	describe("Manual Reload Contract", () => {
		it("should reload all scripts on manual reload", async () => {
			// DESIRED: User can trigger reload manually
			scriptHost.setFile("tool.ts", "export default { v: 1 };", 1000);

			loader = createLoader();
			await loader.start();

			scriptHost.updateFile("tool.ts", "export default { v: 2 };", 2000);

			// Manual reload (not via watcher)
			await loader.reloadScripts();

			const metadata = registry.get("tool.ts");
			expect(metadata?.mtime).toBe(2000);
		});
	});

	describe("Integration Scenarios", () => {
		it("should handle complete workflow: create, modify, delete", async () => {
			// DESIRED: Full lifecycle works smoothly
			loader = createLoader();
			await loader.start();

			// Create
			scriptHost.setFile("tool.ts", "export default { v: 1 };", 1000);
			scriptHost.triggerCreate("tool.ts");
			await delay(100);

			expect(registry.count()).toBe(1);
			const loadedCalls = (callbacks.onScriptLoaded as ReturnType<typeof vi.fn>).mock
				.calls.length;

			// Modify
			scriptHost.updateFile("tool.ts", "export default { v: 2 };", 2000);
			scriptHost.triggerModify("tool.ts");
			await delay(100);

			expect(registry.count()).toBe(1);
			expect((callbacks.onScriptLoaded as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
				loadedCalls + 1
			);

			// Delete
			scriptHost.deleteFile("tool.ts");
			scriptHost.triggerDelete("tool.ts");
			await delay(100);

			expect(registry.count()).toBe(0);
			expect(callbacks.onScriptUnloaded).toHaveBeenCalled();
		});

		it("should handle multiple scripts in subdirectories", async () => {
			// DESIRED: Nested directory structure works
			scriptHost.setFile("auth/login.ts", "export default {};", 1000);
			scriptHost.setFile("auth/logout.ts", "export default {};", 2000);
			scriptHost.setFile("db/query.ts", "export default {};", 3000);
			scriptHost.setFile("db/migrate.ts", "export default {};", 4000);

			loader = createLoader();
			await loader.start();

			expect(registry.count()).toBe(4);

			const names = registry.getAll().map((s) => s.name).sort();
			expect(names).toEqual([
				"auth/login",
				"auth/logout",
				"db/migrate",
				"db/query",
			]);
		});

		it("should propagate context to executed scripts", async () => {
			// DESIRED: Scripts can access injected context
			const contextValue = { test: "value" };
			const contextConfig: ExecutionContextConfig = {
				variableNames: ["ctx"],
				provideContext: () => ({ ctx: contextValue }),
			};
			const customRuntime = new FunctionRuntime(contextConfig);
			const customRegistry = new ScriptRegistry(customRuntime);

			scriptHost.setFile(
				"tool.ts",
				"module.exports = { context: ctx };",
				1000
			);

			loader = new ScriptLoaderCore(
				scriptHost,
				logger,
				customRegistry,
				compiler,
				customRuntime,
				{},
				callbacks
			);

			await loader.start();

			expect(callbacks.onScriptLoaded).toHaveBeenCalledWith(
				expect.any(Object),
				expect.objectContaining({ context: contextValue })
			);
		});
	});
});
