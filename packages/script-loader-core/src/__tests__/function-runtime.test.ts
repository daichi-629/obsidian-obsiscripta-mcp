import { describe, it, expect } from "vitest";
import { FunctionRuntime, type ExecutionContextConfig } from "../function-runtime";

/**
 * FunctionRuntime Tests
 *
 * Test Philosophy: Define DESIRED behavior for the async Function-based runtime.
 * Focus on runtime contracts (load, invoke, export access), not internals.
 */

describe("FunctionRuntime - Desired Behavior", () => {
	const createRuntime = (
		config?: ExecutionContextConfig,
		options?: ConstructorParameters<typeof FunctionRuntime>[1]
	) =>
		new FunctionRuntime(
			config ?? {
				variableNames: [],
				provideContext: () => ({}),
			},
			options
		);

	describe("Load Contract", () => {
		it("should load code and return a handle with exports", async () => {
			const runtime = createRuntime();

			const handle = await runtime.load(
				"module.exports = { tool: 'test', version: 1 };",
				"/script.js",
				{}
			);

			expect(handle.id).toBe("/script.js");
			expect(handle.exports).toEqual({ tool: "test", version: 1 });
		});

		it("should return default export when available", async () => {
			const runtime = createRuntime();

			const handle = await runtime.load(
				"module.exports = { default: { name: 'default' }, named: 'value' };",
				"/script.js",
				{}
			);

			expect(handle.exports).toEqual({ name: "default" });
		});

		it("should inject configured context variables into the script", async () => {
			const runtime = createRuntime({
				variableNames: ["app", "utils"],
				provideContext: () => ({
					app: { name: "TestApp" },
					utils: { helper: () => "help" },
				}),
			});

			const handle = await runtime.load(
				"module.exports = { appName: app.name, helpResult: utils.helper() };",
				"/script.js",
				{}
			);

			expect(handle.exports).toEqual({
				appName: "TestApp",
				helpResult: "help",
			});
		});

		it("should provide __filename and __dirname", async () => {
			const runtime = createRuntime(undefined, {
				dirnameResolver: (identifier) => {
					const normalized = identifier.replace(/\\/g, "/");
					const lastSlash = normalized.lastIndexOf("/");
					if (lastSlash === -1) {
						return "";
					}
					return normalized.slice(0, lastSlash);
				},
			});

			const handle = await runtime.load(
				"module.exports = { filename: __filename, dirname: __dirname };",
				"/path/to/script.js",
				{}
			);

			expect(handle.exports).toEqual({
				filename: "/path/to/script.js",
				dirname: "/path/to",
			});
		});

		it("should reflect require availability in the execution environment", async () => {
			const runtime = createRuntime();

			const handle = await runtime.load(
				"module.exports = { hasRequire: typeof require === 'function' };",
				"/script.js",
				{}
			);

			expect(handle.exports).toHaveProperty("hasRequire");
			expect(typeof (handle.exports as { hasRequire: unknown }).hasRequire).toBe("boolean");
		});
	});

	describe("Invocation Contract", () => {
		it("should invoke an exported function by dot path", async () => {
			const runtime = createRuntime();
			await runtime.load(
				"module.exports = { handlers: { add: (a, b) => a + b } };",
				"/script.js",
				{}
			);

			const result = await runtime.invokeById("/script.js", "handlers.add", [2, 3]);

			expect(result).toBe(5);
		});

		it("should throw when invoking a non-function export", async () => {
			const runtime = createRuntime();
			await runtime.load(
				"module.exports = { value: 42 };",
				"/script.js",
				{}
			);

			await expect(runtime.invokeById("/script.js", "value", [])).rejects.toThrow(
				"not a function"
			);
		});

		it("should throw when invoking an unknown script id", async () => {
			const runtime = createRuntime();

			await expect(runtime.invokeById("/missing.js", "default", [])).rejects.toThrow(
				"Script not found"
			);
		});
	});

	describe("Export Access Contract", () => {
		it("should return exports by dot path", async () => {
			const runtime = createRuntime();
			await runtime.load(
				"module.exports = { config: { retries: 3 } };",
				"/script.js",
				{}
			);

			const result = await runtime.getExportById("/script.js", "config.retries");

			expect(result).toBe(3);
		});

		it("should return the full exports for default or empty path", async () => {
			const runtime = createRuntime();
			await runtime.load("module.exports = { value: 1 };", "/script.js", {});

			const defaultResult = await runtime.getExportById("/script.js", "default");
			const emptyResult = await runtime.getExportById("/script.js", "");

			expect(defaultResult).toEqual({ value: 1 });
			expect(emptyResult).toEqual({ value: 1 });
		});

		it("should throw when export path traverses non-objects", async () => {
			const runtime = createRuntime();
			await runtime.load("module.exports = { nested: 123 };", "/script.js", {});

			await expect(runtime.getExportById("/script.js", "nested.value")).rejects.toThrow(
				"not an object"
			);
		});
	});

	describe("Lifecycle Contract", () => {
		it("should unload a script and release its handle", async () => {
			const runtime = createRuntime();
			await runtime.load("module.exports = { value: 1 };", "/script.js", {});

			await runtime.unload("/script.js");

			await expect(runtime.getExportById("/script.js", "value")).rejects.toThrow(
				"Script not found"
			);
		});

		it("should dispose all loaded scripts", async () => {
			const runtime = createRuntime();
			await runtime.load("module.exports = { value: 1 };", "/a.js", {});
			await runtime.load("module.exports = { value: 2 };", "/b.js", {});

			await runtime.dispose();

			await expect(runtime.getExportById("/a.js", "value")).rejects.toThrow(
				"Script not found"
			);
			await expect(runtime.getExportById("/b.js", "value")).rejects.toThrow(
				"Script not found"
			);
		});
	});
});
