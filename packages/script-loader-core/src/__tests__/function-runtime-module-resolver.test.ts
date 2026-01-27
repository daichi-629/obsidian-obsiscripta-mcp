import { describe, it, expect, vi } from "vitest";
import { FunctionRuntime, type ExecutionContextConfig } from "../function-runtime";
import type { ModuleResolver } from "../types";
import { MockPathUtils } from "./test-helpers";

/**
 * FunctionRuntime ModuleResolver Tests
 *
 * Test Philosophy: Define DESIRED behavior for module loading via resolver hooks.
 */

describe("FunctionRuntime - ModuleResolver", () => {
	it("should load modules via the resolver-backed require", async () => {
		const resolver: ModuleResolver = {
			resolve: vi.fn(async (specifier: string, fromPath: string) => {
				if (specifier === "./shared" && fromPath === "mcp-tools/main.ts") {
					return "mcp-tools/_shared/shared.ts";
				}
				return null;
			}),
			load: vi.fn(async (resolvedPath: string) => {
				if (resolvedPath === "mcp-tools/_shared/shared.ts") {
					return {
						code: "module.exports = { add: (a, b) => a + b };",
					};
				}
				throw new Error(`Unexpected path: ${resolvedPath}`);
			}),
		};

		const contextConfig: ExecutionContextConfig = {
			variableNames: [],
			provideContext: () => ({}),
		};
		const runtime = new FunctionRuntime(contextConfig, {
			pathUtils: new MockPathUtils(),
			moduleResolver: resolver,
		});

		const handle = await runtime.load(
			"const { add } = require('./shared'); module.exports = { sum: add(2, 3) };",
			"mcp-tools/main.ts",
			{}
		);

		expect(handle.exports).toEqual({ sum: 5 });
		expect(resolver.resolve).toHaveBeenCalledWith("./shared", "mcp-tools/main.ts");
		expect(resolver.load).toHaveBeenCalledWith("mcp-tools/_shared/shared.ts");
	});

	it("should throw when resolver cannot resolve a specifier", async () => {
		const resolver: ModuleResolver = {
			resolve: vi.fn(async () => null),
			load: vi.fn(),
		};

		const contextConfig: ExecutionContextConfig = {
			variableNames: [],
			provideContext: () => ({}),
		};
		const runtime = new FunctionRuntime(contextConfig, {
			pathUtils: new MockPathUtils(),
			moduleResolver: resolver,
		});

		await expect(
			runtime.load("require('./missing');", "mcp-tools/main.ts", {})
		).rejects.toThrow();
	});

	it("should allow shared modules to depend on other shared modules", async () => {
		const resolver: ModuleResolver = {
			resolve: vi.fn(async (specifier: string, fromPath: string) => {
				if (fromPath === "mcp-tools/main.ts" && specifier === "./math") {
					return "mcp-tools/_shared/math.ts";
				}
				if (fromPath === "mcp-tools/_shared/math.ts" && specifier === "./base") {
					return "mcp-tools/_shared/base.ts";
				}
				return null;
			}),
			load: vi.fn(async (resolvedPath: string) => {
				if (resolvedPath === "mcp-tools/_shared/base.ts") {
					return { code: "module.exports = { inc: (v) => v + 1 };" };
				}
				if (resolvedPath === "mcp-tools/_shared/math.ts") {
					return {
						code: "const { inc } = require('./base'); module.exports = { addOne: inc };",
					};
				}
				throw new Error(`Unexpected path: ${resolvedPath}`);
			}),
		};

		const contextConfig: ExecutionContextConfig = {
			variableNames: [],
			provideContext: () => ({}),
		};
		const runtime = new FunctionRuntime(contextConfig, {
			pathUtils: new MockPathUtils(),
			moduleResolver: resolver,
		});

		const handle = await runtime.load(
			"const { addOne } = require('./math'); module.exports = { result: addOne(2) };",
			"mcp-tools/main.ts",
			{}
		);

		expect(handle.exports).toEqual({ result: 3 });
		expect(resolver.resolve).toHaveBeenCalledWith("./math", "mcp-tools/main.ts");
		expect(resolver.resolve).toHaveBeenCalledWith("./base", "mcp-tools/_shared/math.ts");
	});

	it("should handle circular shared module requires", async () => {
		const resolver: ModuleResolver = {
			resolve: vi.fn(async (specifier: string, fromPath: string) => {
				if (fromPath === "mcp-tools/main.ts" && specifier === "./a") {
					return "mcp-tools/_shared/a.ts";
				}
				if (fromPath === "mcp-tools/_shared/a.ts" && specifier === "./b") {
					return "mcp-tools/_shared/b.ts";
				}
				if (fromPath === "mcp-tools/_shared/b.ts" && specifier === "./a") {
					return "mcp-tools/_shared/a.ts";
				}
				return null;
			}),
			load: vi.fn(async (resolvedPath: string) => {
				if (resolvedPath === "mcp-tools/_shared/a.ts") {
					return {
						code: "const b = require('./b'); module.exports = { name: 'A', bName: b.name };",
					};
				}
				if (resolvedPath === "mcp-tools/_shared/b.ts") {
					return {
						code: "const a = require('./a'); module.exports = { name: 'B', aName: a.name };",
					};
				}
				throw new Error(`Unexpected path: ${resolvedPath}`);
			}),
		};

		const contextConfig: ExecutionContextConfig = {
			variableNames: [],
			provideContext: () => ({}),
		};
		const runtime = new FunctionRuntime(contextConfig, {
			pathUtils: new MockPathUtils(),
			moduleResolver: resolver,
		});

		const handle = await runtime.load(
			"const a = require('./a'); module.exports = { aName: a.name, bName: a.bName };",
			"mcp-tools/main.ts",
			{}
		);

		expect(handle.exports).toEqual({ aName: "A", bName: "B" });
		expect(resolver.resolve).toHaveBeenCalledWith("./a", "mcp-tools/main.ts");
		expect(resolver.resolve).toHaveBeenCalledWith("./b", "mcp-tools/_shared/a.ts");
		expect(resolver.resolve).toHaveBeenCalledWith("./a", "mcp-tools/_shared/b.ts");
	});

	it("should allow shared modules to require scripts", async () => {
		const resolver: ModuleResolver = {
			resolve: vi.fn(async (specifier: string, fromPath: string) => {
				if (fromPath === "mcp-tools/main.ts" && specifier === "./shared") {
					return "mcp-tools/_shared/shared.ts";
				}
				if (fromPath === "mcp-tools/_shared/shared.ts" && specifier === "../tool") {
					return "mcp-tools/tool.ts";
				}
				return null;
			}),
			load: vi.fn(async (resolvedPath: string) => {
				if (resolvedPath === "mcp-tools/_shared/shared.ts") {
					return {
						code: "const tool = require('../tool'); module.exports = { toolName: tool.name };",
					};
				}
				if (resolvedPath === "mcp-tools/tool.ts") {
					return {
						code: "module.exports = { name: 'tool-script' };",
					};
				}
				throw new Error(`Unexpected path: ${resolvedPath}`);
			}),
		};

		const contextConfig: ExecutionContextConfig = {
			variableNames: [],
			provideContext: () => ({}),
		};
		const runtime = new FunctionRuntime(contextConfig, {
			pathUtils: new MockPathUtils(),
			moduleResolver: resolver,
		});

		const handle = await runtime.load(
			"const shared = require('./shared'); module.exports = { name: shared.toolName };",
			"mcp-tools/main.ts",
			{}
		);

		expect(handle.exports).toEqual({ name: "tool-script" });
		expect(resolver.resolve).toHaveBeenCalledWith("./shared", "mcp-tools/main.ts");
		expect(resolver.resolve).toHaveBeenCalledWith("../tool", "mcp-tools/_shared/shared.ts");
	});

	it("should allow scripts to require other scripts", async () => {
		const resolver: ModuleResolver = {
			resolve: vi.fn(async (specifier: string, fromPath: string) => {
				if (fromPath === "mcp-tools/main.ts" && specifier === "./dep") {
					return "mcp-tools/dep.ts";
				}
				return null;
			}),
			load: vi.fn(async (resolvedPath: string) => {
				if (resolvedPath === "mcp-tools/dep.ts") {
					return {
						code: "module.exports = { value: 7 };",
					};
				}
				throw new Error(`Unexpected path: ${resolvedPath}`);
			}),
		};

		const contextConfig: ExecutionContextConfig = {
			variableNames: [],
			provideContext: () => ({}),
		};
		const runtime = new FunctionRuntime(contextConfig, {
			pathUtils: new MockPathUtils(),
			moduleResolver: resolver,
		});

		const handle = await runtime.load(
			"const dep = require('./dep'); module.exports = { value: dep.value };",
			"mcp-tools/main.ts",
			{}
		);

		expect(handle.exports).toEqual({ value: 7 });
		expect(resolver.resolve).toHaveBeenCalledWith("./dep", "mcp-tools/main.ts");
	});
});
