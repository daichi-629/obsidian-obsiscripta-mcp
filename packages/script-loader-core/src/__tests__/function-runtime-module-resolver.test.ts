import { describe, it, expect, vi } from "vitest";
import { FunctionRuntime, type ExecutionContextConfig } from "../function-runtime";
import { DefaultScriptCompiler } from "../script-compiler";
import type { ModuleResolver } from "../types";

/**
 * FunctionRuntime ModuleResolver Tests
 *
 * Test Philosophy: Define DESIRED behavior for module loading via resolver hooks.
 */

describe("FunctionRuntime - ModuleResolver", () => {
	it("should load modules via the resolver-backed require", async () => {
		const resolver: ModuleResolver = {
			resolve: vi.fn(async (specifier: string, fromPath: string) => {
				if (specifier === "./shared" && fromPath === "main.ts") {
					return {
						id: "_shared/shared.ts",
						code: "module.exports = { add: (a, b) => a + b };",
					};
				}
				return null;
			}),
		};

		const contextConfig: ExecutionContextConfig = {
			variableNames: [],
			provideContext: () => ({}),
		};
		const runtime = new FunctionRuntime(contextConfig, {
			moduleResolver: resolver,
		});

		const handle = await runtime.load(
			"const { add } = require('./shared'); module.exports = { sum: add(2, 3) };",
			"main.ts",
			{}
		);

		expect(handle.exports).toEqual({ sum: 5 });
		expect(resolver.resolve).toHaveBeenCalledWith("./shared", "main.ts");
	});

	it("should throw when resolver cannot resolve a specifier", async () => {
		const resolver: ModuleResolver = {
			resolve: vi.fn(async () => null),
		};

		const contextConfig: ExecutionContextConfig = {
			variableNames: [],
			provideContext: () => ({}),
		};
		const runtime = new FunctionRuntime(contextConfig, {
			moduleResolver: resolver,
		});

		await expect(
			runtime.load("require('./missing');", "main.ts", {})
		).rejects.toThrow();
	});

	it("should allow shared modules to depend on other shared modules", async () => {
		const resolver: ModuleResolver = {
			resolve: vi.fn(async (specifier: string, fromPath: string) => {
				if (fromPath === "main.ts" && specifier === "./math") {
					return {
						id: "_shared/math.ts",
						code: "const { inc } = require('./base'); module.exports = { addOne: inc };",
					};
				}
				if (fromPath === "_shared/math.ts" && specifier === "./base") {
					return {
						id: "_shared/base.ts",
						code: "module.exports = { inc: (v) => v + 1 };",
					};
				}
				return null;
			}),
		};

		const contextConfig: ExecutionContextConfig = {
			variableNames: [],
			provideContext: () => ({}),
		};
		const runtime = new FunctionRuntime(contextConfig, {
			moduleResolver: resolver,
		});

		const handle = await runtime.load(
			"const { addOne } = require('./math'); module.exports = { result: addOne(2) };",
			"main.ts",
			{}
		);

		expect(handle.exports).toEqual({ result: 3 });
		expect(resolver.resolve).toHaveBeenCalledWith("./math", "main.ts");
		expect(resolver.resolve).toHaveBeenCalledWith("./base", "_shared/math.ts");
	});

	it("should handle circular shared module requires", async () => {
		const resolver: ModuleResolver = {
			resolve: vi.fn(async (specifier: string, fromPath: string) => {
				if (fromPath === "main.ts" && specifier === "./a") {
					return {
						id: "_shared/a.ts",
						code: "const b = require('./b'); module.exports = { name: 'A', bName: b.name };",
					};
				}
				if (fromPath === "_shared/a.ts" && specifier === "./b") {
					return {
						id: "_shared/b.ts",
						code: "const a = require('./a'); module.exports = { name: 'B', aName: a.name };",
					};
				}
				if (fromPath === "_shared/b.ts" && specifier === "./a") {
					return {
						id: "_shared/a.ts",
						code: "const b = require('./b'); module.exports = { name: 'A', bName: b.name };",
					};
				}
				return null;
			}),
		};

		const contextConfig: ExecutionContextConfig = {
			variableNames: [],
			provideContext: () => ({}),
		};
		const runtime = new FunctionRuntime(contextConfig, {
			moduleResolver: resolver,
		});

		const handle = await runtime.load(
			"const a = require('./a'); module.exports = { aName: a.name, bName: a.bName };",
			"main.ts",
			{}
		);

		expect(handle.exports).toEqual({ aName: "A", bName: "B" });
		expect(resolver.resolve).toHaveBeenCalledWith("./a", "main.ts");
		expect(resolver.resolve).toHaveBeenCalledWith("./b", "_shared/a.ts");
		expect(resolver.resolve).toHaveBeenCalledWith("./a", "_shared/b.ts");
	});

	it("should allow shared modules to require scripts", async () => {
		const resolver: ModuleResolver = {
			resolve: vi.fn(async (specifier: string, fromPath: string) => {
				if (fromPath === "main.ts" && specifier === "./shared") {
					return {
						id: "_shared/shared.ts",
						code: "const tool = require('../tool'); module.exports = { toolName: tool.name };",
					};
				}
				if (fromPath === "_shared/shared.ts" && specifier === "../tool") {
					return {
						id: "tool.ts",
						code: "module.exports = { name: 'tool-script' };",
					};
				}
				return null;
			}),
		};

		const contextConfig: ExecutionContextConfig = {
			variableNames: [],
			provideContext: () => ({}),
		};
		const runtime = new FunctionRuntime(contextConfig, {
			moduleResolver: resolver,
		});

		const handle = await runtime.load(
			"const shared = require('./shared'); module.exports = { name: shared.toolName };",
			"main.ts",
			{}
		);

		expect(handle.exports).toEqual({ name: "tool-script" });
		expect(resolver.resolve).toHaveBeenCalledWith("./shared", "main.ts");
		expect(resolver.resolve).toHaveBeenCalledWith("../tool", "_shared/shared.ts");
	});

	it("should allow scripts to require other scripts", async () => {
		const resolver: ModuleResolver = {
			resolve: vi.fn(async (specifier: string, fromPath: string) => {
				if (fromPath === "main.ts" && specifier === "./dep") {
					return {
						id: "dep.ts",
						code: "module.exports = { value: 7 };",
					};
				}
				return null;
			}),
		};

		const contextConfig: ExecutionContextConfig = {
			variableNames: [],
			provideContext: () => ({}),
		};
		const runtime = new FunctionRuntime(contextConfig, {
			moduleResolver: resolver,
		});

		const handle = await runtime.load(
			"const dep = require('./dep'); module.exports = { value: dep.value };",
			"main.ts",
			{}
		);

		expect(handle.exports).toEqual({ value: 7 });
		expect(resolver.resolve).toHaveBeenCalledWith("./dep", "main.ts");
	});

	it("should compile module resolver sources when loader is provided", async () => {
		const resolver: ModuleResolver = {
			resolve: vi.fn(async (specifier: string, fromPath: string) => {
				if (specifier === "./shared" && fromPath === "main.ts") {
					return {
						id: "_shared/shared.ts",
						code: "const value: number = 3; module.exports = { value };",
						loader: "ts",
					};
				}
				return null;
			}),
		};

		const contextConfig: ExecutionContextConfig = {
			variableNames: [],
			provideContext: () => ({}),
		};
		const runtime = new FunctionRuntime(contextConfig, {
			moduleResolver: resolver,
			moduleCompiler: new DefaultScriptCompiler(),
		});

		const handle = await runtime.load(
			"const shared = require('./shared'); module.exports = { result: shared.value };",
			"main.ts",
			{}
		);

		expect(handle.exports).toEqual({ result: 3 });
		expect(resolver.resolve).toHaveBeenCalledWith("./shared", "main.ts");
	});
});
