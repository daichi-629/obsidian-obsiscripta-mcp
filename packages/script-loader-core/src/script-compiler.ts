import { transform } from "sucrase";
import { ScriptLoaderType } from "./types";

interface CompiledScriptCacheEntry {
	mtime: number;
	code: string;
}

/**
 * Compiles TypeScript/JavaScript scripts with caching.
 * Uses Sucrase for fast compilation without type checking.
 */
export class ScriptCompiler {
	private cache: Map<string, CompiledScriptCacheEntry> = new Map();

	/**
	 * Compile a script source to JavaScript
	 * @param path - Script file path (used as cache key)
	 * @param source - Script source code
	 * @param loader - Script type (js or ts)
	 * @param mtime - Optional modification time for cache validation
	 * @returns Compiled JavaScript code
	 */
	async compile(path: string, source: string, loader: ScriptLoaderType, mtime?: number): Promise<string> {
		const cached = this.cache.get(path);
		if (cached && mtime !== undefined && cached.mtime === mtime) {
			return cached.code;
		}

		const transforms: Array<"typescript" | "imports"> = loader === "ts"
			? ["typescript", "imports"]
			: ["imports"];
		const result = transform(source, {
			filePath: path,
			transforms
		});

		if (mtime !== undefined) {
			this.cache.set(path, { mtime, code: result.code });
		}

		return result.code;
	}

	/**
	 * Invalidate cache entry for a specific path
	 */
	invalidate(path: string): void {
		this.cache.delete(path);
	}

	/**
	 * Clear all cached compiled scripts
	 */
	clear(): void {
		this.cache.clear();
	}
}
