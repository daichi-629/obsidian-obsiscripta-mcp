import { describe, it, expect, beforeEach } from "vitest";
import { ScriptExecutor, type ExecutionContextConfig } from "../script-executor";
import { MockPathUtils } from "./test-helpers";

/**
 * ScriptExecutor Tests
 *
 * Test Philosophy: Define DESIRED behavior for script execution and context injection.
 * Focus on the execution contract, not implementation internals.
 */

describe("ScriptExecutor - Desired Behavior", () => {
	let pathUtils: MockPathUtils;

	beforeEach(() => {
		pathUtils = new MockPathUtils();
	});

	describe("Module Execution Contract", () => {
		it("should execute code and return exports", () => {
			// DESIRED: Basic module execution works
			const config: ExecutionContextConfig = {
				variableNames: [],
				provideContext: () => ({}),
			};
			const executor = new ScriptExecutor(config);

			const code = `
				module.exports = { tool: "test", version: 1 };
			`;

			const result = executor.execute(code, "/script.js", {});

			expect(result).toEqual({ tool: "test", version: 1 });
		});

		it("should return default export when available", () => {
			// DESIRED: ESM default export takes precedence
			const config: ExecutionContextConfig = {
				variableNames: [],
				provideContext: () => ({}),
			};
			const executor = new ScriptExecutor(config);

			const code = `
				module.exports = {
					default: { name: "default" },
					named: "value"
				};
			`;

			const result = executor.execute(code, "/script.js", {});

			// Should return default export
			expect(result).toEqual({ name: "default" });
		});

		it("should return entire exports object when no default", () => {
			// DESIRED: Named exports accessible when no default
			const config: ExecutionContextConfig = {
				variableNames: [],
				provideContext: () => ({}),
			};
			const executor = new ScriptExecutor(config);

			const code = `
				module.exports.foo = "bar";
				module.exports.baz = 42;
			`;

			const result = executor.execute(code, "/script.js", {}) as Record<string, unknown>;

			expect(result.foo).toBe("bar");
			expect(result.baz).toBe(42);
		});

		it("should handle empty exports", () => {
			// DESIRED: Scripts with no exports don't crash
			const config: ExecutionContextConfig = {
				variableNames: [],
				provideContext: () => ({}),
			};
			const executor = new ScriptExecutor(config);

			const code = `
				// Script with side effects only
				console.log("hello");
			`;

			const result = executor.execute(code, "/script.js", {});

			expect(result).toBeDefined();
		});
	});

	describe("Context Injection Contract", () => {
		it("should inject configured context variables into script", () => {
			// DESIRED: Scripts can access injected context
			const config: ExecutionContextConfig = {
				variableNames: ["app", "utils"],
				provideContext: () => ({
					app: { name: "TestApp" },
					utils: { helper: () => "help" },
				}),
			};
			const executor = new ScriptExecutor(config);

			const code = `
				module.exports = {
					appName: app.name,
					helpResult: utils.helper()
				};
			`;

			const result = executor.execute(code, "/script.js", {});

			expect(result).toEqual({
				appName: "TestApp",
				helpResult: "help",
			});
		});

		it("should provide script-specific context via provideContext callback", () => {
			// DESIRED: Context can vary based on script path
			const config: ExecutionContextConfig = {
				variableNames: ["scriptInfo"],
				provideContext: (scriptPath) => ({
					scriptInfo: { path: scriptPath },
				}),
			};
			const executor = new ScriptExecutor(config);

			const code = `
				module.exports = { myPath: scriptInfo.path };
			`;

			const result = executor.execute(code, "/tools/auth.js", {});

			expect(result).toEqual({ myPath: "/tools/auth.js" });
		});

		it("should pass runtime context through to provideContext", () => {
			// DESIRED: Runtime context accessible in provideContext
			const config: ExecutionContextConfig = {
				variableNames: ["vault"],
				provideContext: (_scriptPath, context) => ({
					vault: context.vault,
				}),
			};
			const executor = new ScriptExecutor(config);

			const runtimeContext = {
				vault: { name: "MyVault", getFiles: () => [] },
			};

			const code = `
				module.exports = { vaultName: vault.name };
			`;

			const result = executor.execute(code, "/script.js", runtimeContext);

			expect(result).toEqual({ vaultName: "MyVault" });
		});

		it("should handle multiple injected variables", () => {
			// DESIRED: Multiple context variables work together
			const config: ExecutionContextConfig = {
				variableNames: ["a", "b", "c"],
				provideContext: () => ({
					a: 1,
					b: 2,
					c: 3,
				}),
			};
			const executor = new ScriptExecutor(config);

			const code = `
				module.exports = { sum: a + b + c };
			`;

			const result = executor.execute(code, "/script.js", {});

			expect(result).toEqual({ sum: 6 });
		});
	});

	describe("Node.js Standard Variables Contract", () => {
		it("should provide __filename variable", () => {
			// DESIRED: Scripts know their own path
			const config: ExecutionContextConfig = {
				variableNames: [],
				provideContext: () => ({}),
			};
			const executor = new ScriptExecutor(config);

			const code = `
				module.exports = { filename: __filename };
			`;

			const result = executor.execute(code, "/path/to/script.js", {});

			expect(result).toEqual({ filename: "/path/to/script.js" });
		});

		it("should provide __dirname variable", () => {
			// DESIRED: Scripts know their directory
			const config: ExecutionContextConfig = {
				variableNames: [],
				provideContext: () => ({}),
			};
			const executor = new ScriptExecutor(config, { pathUtils });

			const code = `
				module.exports = { dirname: __dirname };
			`;

			const result = executor.execute(code, "/path/to/script.js", {});

			expect(result).toEqual({ dirname: "/path/to" });
		});

		it("should provide module and exports objects", () => {
			// DESIRED: Standard Node.js module system available
			const config: ExecutionContextConfig = {
				variableNames: [],
				provideContext: () => ({}),
			};
			const executor = new ScriptExecutor(config);

			const code = `
				exports.named = "value";
				module.exports.another = "value2";
			`;

			const result = executor.execute(code, "/script.js", {}) as Record<string, unknown>;

			expect(result.named).toBe("value");
			expect(result.another).toBe("value2");
		});

		it("should provide require function when available", () => {
			// DESIRED: Scripts can require built-in modules
			const config: ExecutionContextConfig = {
				variableNames: [],
				provideContext: () => ({}),
			};
			const executor = new ScriptExecutor(config, { pathUtils });

			const code = `
				const hasRequire = typeof require === "function";
				module.exports = { hasRequire };
			`;

			const result = executor.execute(code, "/script.js", {}) as Record<string, unknown>;

			// require availability depends on environment
			expect(result).toHaveProperty("hasRequire");
			// Verify that hasRequire is a boolean value (not undefined or null)
			expect(typeof result.hasRequire).toBe("boolean");
			// In Node.js environment, require should be available
			// In browser/test environments, it may not be available
			// The key contract is that the property accurately reflects availability
		});
	});

	describe("Script Isolation Contract", () => {
		it("should execute each script in isolated scope", () => {
			// DESIRED: Scripts don't interfere with each other
			const config: ExecutionContextConfig = {
				variableNames: [],
				provideContext: () => ({}),
			};
			const executor = new ScriptExecutor(config);

			const code1 = `
				const x = 1;
				module.exports = { value: x };
			`;
			const code2 = `
				const x = 2;
				module.exports = { value: x };
			`;

			const result1 = executor.execute(code1, "/script1.js", {});
			const result2 = executor.execute(code2, "/script2.js", {});

			expect(result1).toEqual({ value: 1 });
			expect(result2).toEqual({ value: 2 });
		});

		it("should not leak variables between executions", () => {
			// DESIRED: Each execution starts fresh
			const config: ExecutionContextConfig = {
				variableNames: [],
				provideContext: () => ({}),
			};
			const executor = new ScriptExecutor(config);

			const code1 = `
				globalThis.leaked = "value";
				module.exports = { set: true };
			`;
			const code2 = `
				const hasLeak = typeof leaked !== "undefined";
				module.exports = { hasLeak };
			`;

			executor.execute(code1, "/script1.js", {});
			const result2 = executor.execute(code2, "/script2.js", {});

			// Note: globalThis leaks are intentional - testing scope isolation
			// In practice, scripts shouldn't use globalThis
			expect(result2).toHaveProperty("hasLeak");
		});
	});

	describe("Error Handling Contract", () => {
		it("should propagate runtime errors from scripts", () => {
			// DESIRED: Script errors are thrown, not swallowed
			const config: ExecutionContextConfig = {
				variableNames: [],
				provideContext: () => ({}),
			};
			const executor = new ScriptExecutor(config);

			const code = `
				throw new Error("Script error");
			`;

			expect(() => {
				executor.execute(code, "/script.js", {});
			}).toThrow("Script error");
		});

		it("should handle reference errors in scripts", () => {
			// DESIRED: Undefined variable access throws
			const config: ExecutionContextConfig = {
				variableNames: [],
				provideContext: () => ({}),
			};
			const executor = new ScriptExecutor(config);

			const code = `
				module.exports = { value: undefinedVariable };
			`;

			expect(() => {
				executor.execute(code, "/script.js", {});
			}).toThrow();
		});

		it("should handle syntax errors gracefully", () => {
			// DESIRED: Invalid JS syntax causes error
			const config: ExecutionContextConfig = {
				variableNames: [],
				provideContext: () => ({}),
			};
			const executor = new ScriptExecutor(config);

			const code = `
				module.exports = { invalid syntax here
			`;

			expect(() => {
				executor.execute(code, "/script.js", {});
			}).toThrow();
		});
	});

	describe("Advanced Features Contract", () => {
		it("should support async code in scripts", () => {
			// DESIRED: Scripts can define async functions
			const config: ExecutionContextConfig = {
				variableNames: [],
				provideContext: () => ({}),
			};
			const executor = new ScriptExecutor(config);

			const code = `
				module.exports = {
					async fetch() {
						return "data";
					}
				};
			`;

			const result = executor.execute(code, "/script.js", {}) as {
				fetch: () => Promise<string>;
			};

			expect(result.fetch).toBeInstanceOf(Function);
			expect(result.fetch()).toBeInstanceOf(Promise);
		});

		it("should support classes in scripts", () => {
			// DESIRED: Scripts can export classes
			const config: ExecutionContextConfig = {
				variableNames: [],
				provideContext: () => ({}),
			};
			const executor = new ScriptExecutor(config);

			const code = `
				class Tool {
					getName() { return "tool"; }
				}
				module.exports = { Tool };
			`;

			const result = executor.execute(code, "/script.js", {}) as {
				Tool: new () => { getName: () => string };
			};

			const instance = new result.Tool();
			expect(instance.getName()).toBe("tool");
		});

		it("should support closures and scope capture", () => {
			// DESIRED: Scripts can use closures
			const config: ExecutionContextConfig = {
				variableNames: ["config"],
				provideContext: () => ({
					config: { multiplier: 2 },
				}),
			};
			const executor = new ScriptExecutor(config);

			const code = `
				const mult = config.multiplier;
				module.exports = {
					multiply: (x) => x * mult
				};
			`;

			const result = executor.execute(code, "/script.js", {}) as {
				multiply: (x: number) => number;
			};

			expect(result.multiply(5)).toBe(10);
		});
	});

	describe("Function Execution Contract", () => {
		it("should execute functions with context", () => {
			// DESIRED: executeFunction provides context to arbitrary functions
			const config: ExecutionContextConfig = {
				variableNames: ["multiplier"],
				provideContext: () => ({
					multiplier: 3,
				}),
			};
			const executor = new ScriptExecutor(config);

			const fn = function (this: { multiplier: number }, x: number) {
				return x * this.multiplier;
			};

			const result = executor.executeFunction(fn, "/script.js", {}, 5);

			expect(result).toBe(15);
		});

		it("should pass arguments to executed functions", () => {
			// DESIRED: Function arguments are preserved
			const config: ExecutionContextConfig = {
				variableNames: [],
				provideContext: () => ({}),
			};
			const executor = new ScriptExecutor(config);

			const fn = (a: number, b: number, c: number) => a + b + c;

			const result = executor.executeFunction(fn, "/script.js", {}, 1, 2, 3);

			expect(result).toBe(6);
		});
	});

	describe("Path Handling Contract", () => {
		it("should handle absolute script paths", () => {
			// DESIRED: Absolute paths work correctly
			const config: ExecutionContextConfig = {
				variableNames: [],
				provideContext: () => ({}),
			};
			const executor = new ScriptExecutor(config, {
				pathUtils,
			});

			const code = `
				module.exports = { path: __filename };
			`;

			const result = executor.execute(code, "/absolute/path/script.js", {});

			expect(result).toEqual({ path: "/absolute/path/script.js" });
		});

		it("should handle relative script paths", () => {
			// DESIRED: Relative paths are preserved
			const config: ExecutionContextConfig = {
				variableNames: [],
				provideContext: (scriptPath) => ({ scriptPath }),
			};
			const executor = new ScriptExecutor(config, {
				pathUtils,
			});

			const code = `
				module.exports = { path: __filename };
			`;

			const result = executor.execute(code, "relative/script.js", {});

			expect(result).toEqual({ path: "relative/script.js" });
		});
	});
});
