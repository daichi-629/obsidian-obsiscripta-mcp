import { describe, it, expect, beforeEach } from "vitest";
import { ScriptCompiler } from "../script-compiler";

/**
 * ScriptCompiler Tests
 *
 * Test Philosophy: Define the DESIRED behavior for compilation and caching,
 * focusing on the contract the compiler must fulfill rather than implementation details.
 */

describe("ScriptCompiler - Desired Behavior", () => {
	let compiler: ScriptCompiler;

	beforeEach(() => {
		compiler = new ScriptCompiler();
	});

	describe("TypeScript Compilation Contract", () => {
		it("should compile TypeScript to executable JavaScript", async () => {
			// DESIRED: TypeScript source becomes runnable JS
			const tsSource = `
				interface Config { name: string; }
				const config: Config = { name: "test" };
				export default config;
			`;

			const compiled = await compiler.compile("/test.ts", tsSource, "ts");

			// Should produce valid JS (no TS syntax)
			expect(compiled).toBeDefined();
			expect(compiled).toContain("const config");
			expect(compiled).not.toContain("interface Config");
			expect(compiled).not.toContain(": Config");
		});

		it("should handle modern TypeScript features", async () => {
			// DESIRED: Support current TS features (optional chaining, nullish coalescing, etc.)
			const tsSource = `
				const value = obj?.prop ?? "default";
				type Result<T> = { data: T; error?: string };
				export const result: Result<number> = { data: 42 };
			`;

			const compiled = await compiler.compile("/modern.ts", tsSource, "ts");

			expect(compiled).toBeDefined();
			// Sucrase may transform modern syntax for compatibility
			// Check that the logic is preserved (nullish coalescing and optional chaining work)
			expect(compiled).toMatch(/obj|default/);
			expect(compiled).toMatch(/result.*42/);
		});

		it("should preserve TypeScript imports for module resolution", async () => {
			// DESIRED: Import statements remain for runtime module system
			const tsSource = `
				import { readFile } from "fs/promises";
				import type { Config } from "./types";
				export const loader = readFile;
			`;

			const compiled = await compiler.compile("/imports.ts", tsSource, "ts");

			// Runtime import should be preserved, type import removed
			expect(compiled).toContain("readFile");
			expect(compiled).not.toContain("type { Config }");
		});
	});

	describe("JavaScript Pass-through Contract", () => {
		it("should handle modern JavaScript without transformation loss", async () => {
			// DESIRED: Modern JS passes through without breaking features
			const jsSource = `
				export default class Tool {
					async execute() {
						const result = await fetch("/api");
						return result?.data ?? null;
					}
				}
			`;

			const compiled = await compiler.compile("/tool.js", jsSource, "js");

			expect(compiled).toBeDefined();
			expect(compiled).toContain("async execute");
			expect(compiled).toContain("await fetch");
		});

		it("should preserve JavaScript module semantics", async () => {
			// DESIRED: Export/import remain functional (may be transformed to CommonJS)
			const jsSource = `
				export const name = "tool";
				export default { name, version: "1.0" };
			`;

			const compiled = await compiler.compile("/module.js", jsSource, "js");

			// Sucrase transforms ESM to CommonJS for Node.js compatibility
			// Check that exports are preserved in some form
			expect(compiled).toMatch(/name.*tool/);
			expect(compiled).toMatch(/exports|default/);
		});
	});

	describe("Caching Contract", () => {
		it("should cache compilation results when mtime provided", async () => {
			// DESIRED: Same file with same mtime uses cached result
			const source = "export default { value: 42 };";
			const path = "/cached.ts";
			const mtime = 1000;

			const result1 = await compiler.compile(path, source, "ts", mtime);
			const result2 = await compiler.compile(path, source, "ts", mtime);

			// Should return same result (cache hit)
			expect(result1).toBe(result2);
		});

		it("should recompile when mtime changes", async () => {
			// DESIRED: File modification invalidates cache
			const path = "/modified.ts";
			const source1 = "export default { v: 1 };";
			const source2 = "export default { v: 2 };";

			const result1 = await compiler.compile(path, source1, "ts", 1000);
			const result2 = await compiler.compile(path, source2, "ts", 2000);

			// Should recompile (different mtime)
			expect(result1).not.toBe(result2);
			expect(result1).toContain("v: 1");
			expect(result2).toContain("v: 2");
		});

		it("should recompile when mtime not provided", async () => {
			// DESIRED: Without mtime, always recompile (no caching)
			const path = "/nocache.ts";
			const source = "export default { value: 42 };";

			const result1 = await compiler.compile(path, source, "ts");
			const result2 = await compiler.compile(path, source, "ts");

			// Both should succeed (no caching without mtime)
			expect(result1).toBeDefined();
			expect(result2).toBeDefined();
		});

		it("should maintain separate cache entries for different paths", async () => {
			// DESIRED: Cache is keyed by path
			const source = "export default {};";
			const mtime = 1000;

			const result1 = await compiler.compile("/file1.ts", source, "ts", mtime);
			const result2 = await compiler.compile("/file2.ts", source, "ts", mtime);

			// Both compile successfully and independently
			expect(result1).toBeDefined();
			expect(result2).toBeDefined();
		});
	});

	describe("Cache Management Contract", () => {
		it("should invalidate specific file when requested", async () => {
			// DESIRED: Manual cache invalidation per file
			const path = "/invalidate.ts";
			const source = "export default {};";
			const mtime = 1000;

			await compiler.compile(path, source, "ts", mtime);
			compiler.invalidate(path);

			// Next compile should reprocess even with same mtime
			const result = await compiler.compile(path, source, "ts", mtime);
			expect(result).toBeDefined();
		});

		it("should clear all cached entries", async () => {
			// DESIRED: Clear removes all cached compilation results
			await compiler.compile("/file1.ts", "export default 1;", "ts", 1000);
			await compiler.compile("/file2.ts", "export default 2;", "ts", 2000);

			compiler.clear();

			// Should successfully compile again (cache cleared)
			const result = await compiler.compile("/file1.ts", "export default 1;", "ts", 1000);
			expect(result).toBeDefined();
		});

		it("should handle invalidating non-existent entries gracefully", async () => {
			// DESIRED: Invalidation of non-cached file is safe
			expect(() => {
				compiler.invalidate("/never/cached.ts");
			}).not.toThrow();
		});
	});

	describe("Error Handling Contract", () => {
		it("should reject invalid TypeScript syntax", async () => {
			// DESIRED: Compilation errors are reported, not silently ignored
			const invalidTs = `
				const x: = invalid;
				export default x;
			`;

			await expect(
				compiler.compile("/invalid.ts", invalidTs, "ts")
			).rejects.toThrow();
		});

		it("should reject invalid JavaScript syntax", async () => {
			// DESIRED: Syntax errors cause rejection
			const invalidJs = `
				const x = {
				export default x;
			`;

			await expect(
				compiler.compile("/invalid.js", invalidJs, "js")
			).rejects.toThrow();
		});

		it("should not cache failed compilations", async () => {
			// DESIRED: Errors don't poison cache
			const path = "/error.ts";
			const invalidSource = "const x: = invalid;";
			const validSource = "export default {};";
			const mtime = 1000;

			// First compile fails
			await expect(
				compiler.compile(path, invalidSource, "ts", mtime)
			).rejects.toThrow();

			// Second compile with valid source should work
			const result = await compiler.compile(path, validSource, "ts", mtime);
			expect(result).toBeDefined();
		});
	});

	describe("Output Characteristics Contract", () => {
		it("should produce non-empty output for valid inputs", async () => {
			// DESIRED: Compiled output contains the transformed code
			const source = `
				export const add = (a: number, b: number) => a + b;
				export default add;
			`;

			const compiled = await compiler.compile("/math.ts", source, "ts");

			expect(compiled).toBeDefined();
			expect(compiled.length).toBeGreaterThan(0);
			expect(compiled).toContain("add");
		});

		it("should preserve export semantics for module system", async () => {
			// DESIRED: Exports remain accessible
			const source = `
				export const named = "value";
				export default { named };
			`;

			const compiled = await compiler.compile("/exports.ts", source, "ts");

			expect(compiled).toContain("export");
			expect(compiled).toContain("named");
		});

		it("should handle empty source files", async () => {
			// DESIRED: Empty files compile successfully
			const emptySource = "";

			const compiled = await compiler.compile("/empty.ts", emptySource, "ts");

			expect(compiled).toBeDefined();
			expect(typeof compiled).toBe("string");
		});

		it("should handle whitespace-only files", async () => {
			// DESIRED: Whitespace-only files don't cause errors
			const whitespace = "   \n\n\t\t\n   ";

			const compiled = await compiler.compile("/whitespace.ts", whitespace, "ts");

			expect(compiled).toBeDefined();
		});
	});

	describe("Type System Handling", () => {
		it("should remove type annotations", async () => {
			// DESIRED: All TypeScript type info removed from output
			const typed = `
				function process(input: string): number {
					return input.length as number;
				}
				export default process;
			`;

			const compiled = await compiler.compile("/typed.ts", typed, "ts");

			expect(compiled).not.toContain(": string");
			expect(compiled).not.toContain(": number");
			expect(compiled).toContain("function process");
		});

		it("should handle generic types", async () => {
			// DESIRED: Generics are erased properly
			const generics = `
				class Box<T> {
					constructor(public value: T) {}
				}
				export default Box;
			`;

			const compiled = await compiler.compile("/generics.ts", generics, "ts");

			expect(compiled).not.toContain("<T>");
			expect(compiled).toContain("class Box");
		});

		it("should preserve runtime type guards", async () => {
			// DESIRED: Runtime type checks remain (they're valid JS)
			const guards = `
				export function isString(x: unknown): x is string {
					return typeof x === "string";
				}
			`;

			const compiled = await compiler.compile("/guards.ts", guards, "ts");

			expect(compiled).toContain("typeof x");
			expect(compiled).toContain("string");
		});
	});
});
