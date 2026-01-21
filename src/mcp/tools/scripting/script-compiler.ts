import { transform } from "sucrase";

type ScriptLoaderType = "js" | "ts";

interface CompiledScriptCacheEntry {
	mtime: number;
	code: string;
}

export class ScriptCompiler {
	private cache: Map<string, CompiledScriptCacheEntry> = new Map();

	async compile(path: string, source: string, loader: ScriptLoaderType, mtime?: number): Promise<string> {
		const cached = this.cache.get(path);
		if (cached && mtime !== undefined && cached.mtime === mtime) {
			return cached.code;
		}

		const transforms = loader === "ts"
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

	invalidate(path: string): void {
		this.cache.delete(path);
	}

	clear(): void {
		this.cache.clear();
	}
}
