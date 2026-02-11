import { describe, it, expect, beforeEach, vi } from "vitest";
import { ScriptLoaderCore } from "../script-loader-core";
import { ScriptRegistry } from "../script-registry";
import { ScriptCompiler } from "../script-compiler";
import { FunctionRuntime, type ExecutionContextConfig } from "../function-runtime";
import {
	MockScriptHost,
	MockPathUtils,
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
	let pathUtils: MockPathUtils;
	let logger: MockLogger;
	let registry: ScriptRegistry;
	let compiler: ScriptCompiler;
	let runtime: FunctionRuntime;
	let callbacks: ScriptLoaderCallbacks;
	let loader: ScriptLoaderCore;

	beforeEach(() => {
		scriptHost = new MockScriptHost();
		pathUtils = new MockPathUtils();
		logger = new MockLogger();
		compiler = new ScriptCompiler();

		const contextConfig: ExecutionContextConfig = {
			variableNames: ["testContext"],
			provideContext: () => ({ testContext: { value: "test" } }),
		};
		runtime = new FunctionRuntime(contextConfig, { pathUtils });
		registry = new ScriptRegistry(runtime);

		callbacks = {
			onScriptLoaded: vi.fn(),
			onScriptUnloaded: vi.fn(),
			onScriptError: vi.fn(),
		};
	});

	const createLoader = (scriptsPath: string = "mcp-tools", debounce: number = 50) => {
		return new ScriptLoaderCore(
			scriptHost,
			pathUtils,
			logger,
			registry,
			compiler,
			runtime,
			{},
			scriptsPath,
			callbacks,
			debounce
		);
	};

	describe("Initial Load Contract", () => {
		it("should load all existing scripts on start", async () => {
			// DESIRED: System discovers and loads all scripts at startup
			scriptHost.setFile(
				"mcp-tools/tool1.ts",
				'export default { name: "tool1" };',
				1000
			);
			scriptHost.setFile(
				"mcp-tools/tool2.js",
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
			scriptHost.setFile("mcp-tools/tool.ts", "export default {};", 1000);

			loader = createLoader();
			await loader.start();

			expect(callbacks.onScriptLoaded).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "tool",
					path: "mcp-tools/tool.ts",
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

		it("should allow hosts to define script-file rules via isScriptPath", async () => {
			// DESIRED: Core trusts ScriptHost + optional callback filtering
			scriptHost.setFile("mcp-tools/readme.md", "# Documentation", 1000);
			scriptHost.setFile("mcp-tools/types.d.ts", "export type T = {};", 2000);
			scriptHost.setFile("mcp-tools/tool.ts", "export default {};", 3000);

			callbacks.isScriptPath = vi.fn((path) => path.endsWith(".ts"));

			loader = createLoader();
			await loader.start();

			expect(registry.count()).toBe(1);
			expect(registry.get("mcp-tools/tool.ts")).toBeDefined();
		});

		it("should honor isScriptPath when provided", async () => {
			// DESIRED: Non-tool scripts are excluded from registration
			scriptHost.setFile("mcp-tools/tool.ts", "export default {};", 1000);
			scriptHost.setFile("mcp-tools/_shared/utils.ts", "export default {};", 2000);

			callbacks.isScriptPath = vi.fn((path) => !path.includes("/_shared/"));

			loader = createLoader();
			await loader.start();

			expect(callbacks.isScriptPath).toHaveBeenCalledWith("mcp-tools/tool.ts");
			expect(callbacks.isScriptPath).toHaveBeenCalledWith("mcp-tools/_shared/utils.ts");
			expect(registry.count()).toBe(1);
			expect(registry.get("mcp-tools/tool.ts")).toBeDefined();
			expect(registry.get("mcp-tools/_shared/utils.ts")).toBeUndefined();
		});

		it("should load scripts with host-provided loaderType for non-standard extensions", async () => {
			// DESIRED: ScriptHost can surface virtual script sources (e.g. markdown code blocks)
			scriptHost.setFile("mcp-tools/tool.md", "module.exports = { from: 'md' };", 1000);
			const originalReadFile = scriptHost.readFile.bind(scriptHost);
			vi.spyOn(scriptHost, "readFile").mockImplementation(async (path) => {
				const info = await originalReadFile(path);
				return { ...info, loaderType: "js" };
			});

			loader = createLoader();
			await loader.start();

			expect(registry.count()).toBe(1);
			expect(registry.get("mcp-tools/tool.md")).toBeDefined();
		});

		it("should derive unique tool names from file paths", async () => {
			// DESIRED: Nested paths create namespaced tool names
			scriptHost.setFile("mcp-tools/auth/login.ts", "export default {};", 1000);
			scriptHost.setFile("mcp-tools/db/query.ts", "export default {};", 2000);

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
			scriptHost.setFile("mcp-tools/tool.ts", "export default { v: 1 };", 1000);

			loader = createLoader();
			await loader.start();

			expect(callbacks.onScriptLoaded).toHaveBeenCalledTimes(1);

			// Modify file
			scriptHost.updateFile("mcp-tools/tool.ts", "export default { v: 2 };", 2000);
			scriptHost.triggerModify("mcp-tools/tool.ts");

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

			scriptHost.setFile("mcp-tools/new-tool.ts", "export default {};", 1000);
			scriptHost.triggerCreate("mcp-tools/new-tool.ts");

			await delay(100);

			expect(registry.count()).toBe(1);
			expect(callbacks.onScriptLoaded).toHaveBeenCalled();
		});

		it("should unload scripts when deleted", async () => {
			// DESIRED: Deleted files are removed from registry
			scriptHost.setFile("mcp-tools/tool.ts", "export default {};", 1000);

			loader = createLoader();
			await loader.start();

			expect(registry.count()).toBe(1);

			scriptHost.deleteFile("mcp-tools/tool.ts");
			scriptHost.triggerDelete("mcp-tools/tool.ts");

			await delay(100);

			expect(registry.count()).toBe(0);
			expect(callbacks.onScriptUnloaded).toHaveBeenCalled();
		});

		it("should handle rapid file changes with debouncing", async () => {
			// DESIRED: Multiple rapid changes don't cause excessive reloads
			scriptHost.setFile("mcp-tools/tool.ts", "export default { v: 1 };", 1000);

			loader = createLoader();
			await loader.start();

			const initialCalls = (callbacks.onScriptLoaded as ReturnType<typeof vi.fn>).mock
				.calls.length;

			// Trigger multiple rapid changes
			scriptHost.triggerModify("mcp-tools/tool.ts");
			scriptHost.triggerModify("mcp-tools/tool.ts");
			scriptHost.triggerModify("mcp-tools/tool.ts");

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
				"mcp-tools/broken.ts",
				"const x: = invalid syntax;",
				1000
			);

			loader = createLoader();
			await loader.start();

			expect(callbacks.onScriptError).toHaveBeenCalledWith(
				"mcp-tools/broken.ts",
				expect.any(Error)
			);
			expect(registry.count()).toBe(0);
		});

		it("should call onScriptError for runtime errors", async () => {
			// DESIRED: Execution errors are caught and reported
			scriptHost.setFile("mcp-tools/throws.ts", "throw new Error('boom');", 1000);

			loader = createLoader();
			await loader.start();

			expect(callbacks.onScriptError).toHaveBeenCalled();
			expect(registry.count()).toBe(0);
		});

		it("should continue loading other scripts after one fails", async () => {
			// DESIRED: One bad script doesn't block others
			scriptHost.setFile("mcp-tools/good.ts", "export default {};", 1000);
			scriptHost.setFile("mcp-tools/bad.ts", "invalid syntax", 2000);
			scriptHost.setFile("mcp-tools/good2.ts", "export default {};", 3000);

			loader = createLoader();
			await loader.start();

			expect(callbacks.onScriptError).toHaveBeenCalledTimes(1);
			expect(registry.count()).toBe(2);
			expect(registry.get("mcp-tools/good.ts")).toBeDefined();
			expect(registry.get("mcp-tools/good2.ts")).toBeDefined();
		});

		it("should unregister script if reload fails", async () => {
			// DESIRED: Previously working script removed if new version breaks
			scriptHost.setFile("mcp-tools/tool.ts", "export default {};", 1000);

			loader = createLoader();
			await loader.start();

			expect(registry.count()).toBe(1);

			// Update to invalid code
			scriptHost.updateFile("mcp-tools/tool.ts", "invalid syntax", 2000);
			scriptHost.triggerModify("mcp-tools/tool.ts");

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
			scriptHost.setFile("mcp-tools/tool.ts", "export default {};", 1000);
			scriptHost.triggerCreate("mcp-tools/tool.ts");

			await delay(100);

			expect(callbacks.onScriptLoaded).not.toHaveBeenCalled();
		});

		it("should unregister all scripts when stopped", async () => {
			// DESIRED: stop() fully cleans up state
			scriptHost.setFile("mcp-tools/tool1.ts", "export default {};", 1000);
			scriptHost.setFile("mcp-tools/tool2.ts", "export default {};", 2000);

			loader = createLoader();
			await loader.start();

			expect(registry.count()).toBe(2);

			await loader.stop();

			expect(registry.count()).toBe(0);
			expect(callbacks.onScriptUnloaded).toHaveBeenCalledTimes(2);
		});

		it("should allow restart after stop", async () => {
			// DESIRED: Loader is reusable
			scriptHost.setFile("mcp-tools/tool.ts", "export default {};", 1000);

			loader = createLoader();
			await loader.start();
			await loader.stop();
			await loader.start();

			expect(registry.count()).toBe(1);
		});
	});

	describe("Path Configuration Contract", () => {
		it("should use configured scripts path", async () => {
			// DESIRED: Scripts path is configurable
			scriptHost.setFile("custom-path/tool.ts", "export default {};", 1000);

			loader = createLoader("custom-path");
			await loader.start();

			expect(registry.count()).toBe(1);
			expect(registry.get("custom-path/tool.ts")).toBeDefined();
		});

		it("should update scripts path and reload", async () => {
			// DESIRED: Path can be changed at runtime
			scriptHost.setFile("path1/tool1.ts", "export default {};", 1000);
			scriptHost.setFile("path2/tool2.ts", "export default {};", 2000);

			loader = createLoader("path1");
			await loader.start();

			expect(registry.count()).toBe(1);
			expect(loader.getScriptsPath()).toBe("path1");

			await loader.updateScriptsPath("path2");

			expect(registry.count()).toBe(1);
			expect(loader.getScriptsPath()).toBe("path2");
			expect(registry.get("path2/tool2.ts")).toBeDefined();
		});

		it("should not reload if path unchanged", async () => {
			// DESIRED: Unnecessary reloads are avoided
			scriptHost.setFile("mcp-tools/tool.ts", "export default {};", 1000);

			loader = createLoader();
			await loader.start();

			const loadCalls = (callbacks.onScriptLoaded as ReturnType<typeof vi.fn>).mock.calls
				.length;

			await loader.updateScriptsPath("mcp-tools");

			expect((callbacks.onScriptLoaded as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
				loadCalls
			);
		});

		it("should normalize and validate scripts path", async () => {
			// DESIRED: Unsafe paths are rejected/normalized
			loader = createLoader("../etc/passwd");

			// Should fallback to safe default
			expect(loader.getScriptsPath()).not.toContain("..");
		});

		it("should handle relative paths", async () => {
			// DESIRED: Relative paths work correctly
			scriptHost.setFile("tools/auth/login.ts", "export default {};", 1000);

			loader = createLoader("./tools/auth");
			await loader.start();

			expect(registry.count()).toBe(1);
		});
	});

	describe("Manual Reload Contract", () => {
		it("should reload all scripts on manual reload", async () => {
			// DESIRED: User can trigger reload manually
			scriptHost.setFile("mcp-tools/tool.ts", "export default { v: 1 };", 1000);

			loader = createLoader();
			await loader.start();

			scriptHost.updateFile("mcp-tools/tool.ts", "export default { v: 2 };", 2000);

			// Manual reload (not via watcher)
			await loader.reloadScripts();

			const metadata = registry.get("mcp-tools/tool.ts");
			expect(metadata?.mtime).toBe(2000);
		});
	});

	describe("Integration Scenarios", () => {
		it("should handle complete workflow: create, modify, delete", async () => {
			// DESIRED: Full lifecycle works smoothly
			loader = createLoader();
			await loader.start();

			// Create
			scriptHost.setFile("mcp-tools/tool.ts", "export default { v: 1 };", 1000);
			scriptHost.triggerCreate("mcp-tools/tool.ts");
			await delay(100);

			expect(registry.count()).toBe(1);
			const loadedCalls = (callbacks.onScriptLoaded as ReturnType<typeof vi.fn>).mock
				.calls.length;

			// Modify
			scriptHost.updateFile("mcp-tools/tool.ts", "export default { v: 2 };", 2000);
			scriptHost.triggerModify("mcp-tools/tool.ts");
			await delay(100);

			expect(registry.count()).toBe(1);
			expect((callbacks.onScriptLoaded as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
				loadedCalls + 1
			);

			// Delete
			scriptHost.deleteFile("mcp-tools/tool.ts");
			scriptHost.triggerDelete("mcp-tools/tool.ts");
			await delay(100);

			expect(registry.count()).toBe(0);
			expect(callbacks.onScriptUnloaded).toHaveBeenCalled();
		});

		it("should handle multiple scripts in subdirectories", async () => {
			// DESIRED: Nested directory structure works
			scriptHost.setFile("mcp-tools/auth/login.ts", "export default {};", 1000);
			scriptHost.setFile("mcp-tools/auth/logout.ts", "export default {};", 2000);
			scriptHost.setFile("mcp-tools/db/query.ts", "export default {};", 3000);
			scriptHost.setFile("mcp-tools/db/migrate.ts", "export default {};", 4000);

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
			const customRuntime = new FunctionRuntime(contextConfig, { pathUtils });
			const customRegistry = new ScriptRegistry(customRuntime);

			scriptHost.setFile(
				"mcp-tools/tool.ts",
				"module.exports = { context: ctx };",
				1000
			);

			loader = new ScriptLoaderCore(
				scriptHost,
				pathUtils,
				logger,
				customRegistry,
				compiler,
				customRuntime,
				{},
				"mcp-tools",
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
