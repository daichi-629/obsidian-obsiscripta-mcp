import { TFile, Vault } from "obsidian";
import { ModuleResolver, PathUtils, ScriptCompiler, ScriptLoaderType } from "@obsiscripta/script-loader-core";

const MODULE_EXTENSIONS: ScriptLoaderType[] = ["ts", "js"];

/**
 * Vault-backed module resolver for FunctionRuntime.
 *
 * Resolution rules:
 * - Only relative specifiers ("./" or "../") are supported
 * - Paths are resolved from the requiring file's directory
 * - Resolution is restricted to paths inside the vault (no absolute paths, no escape above root)
 * - Extensionless specifiers try ".ts", ".js", then "index.ts"/"index.js"
 */
export class ObsidianModuleResolver implements ModuleResolver {
	private vault: Vault;
	private pathUtils: PathUtils;
	private compiler: ScriptCompiler;

	constructor(vault: Vault, pathUtils: PathUtils) {
		this.vault = vault;
		this.pathUtils = pathUtils;
		this.compiler = new ScriptCompiler();
	}

	async resolve(specifier: string, fromPath: string): Promise<string | null> {
		if (!this.isRelativeSpecifier(specifier)) {
			return null;
		}

		const fromDir = this.pathUtils.dirname(fromPath);
		const requested = this.pathUtils.normalize(this.pathUtils.join(fromDir, specifier));
		if (!this.isVaultRelativePath(requested)) {
			return null;
		}

		for (const candidate of this.getCandidates(requested)) {
			if (!this.isVaultRelativePath(candidate)) {
				continue;
			}
			const entry = this.vault.getAbstractFileByPath(candidate);
			if (entry instanceof TFile) {
				return candidate;
			}
		}

		return null;
	}

	async load(resolvedPath: string): Promise<{ code: string; mtime?: number }> {
		const file = this.vault.getAbstractFileByPath(resolvedPath);
		if (!(file instanceof TFile)) {
			throw new Error(`Module file not found: ${resolvedPath}`);
		}

		const loader = this.getLoader(resolvedPath);
		if (!loader) {
			throw new Error(`Unsupported module type: ${resolvedPath}`);
		}

		const source = await this.vault.read(file);
		const code = await this.compiler.compile(resolvedPath, source, loader, file.stat?.mtime);

		return {
			code,
			mtime: file.stat?.mtime,
		};
	}

	clearCache(): void {
		this.compiler.clear();
	}

	private isRelativeSpecifier(specifier: string): boolean {
		return specifier.startsWith("./") || specifier.startsWith("../");
	}

	private isVaultRelativePath(path: string): boolean {
		if (!path || this.pathUtils.isAbsolute(path)) {
			return false;
		}
		return !path.startsWith("../") && path !== "..";
	}

	private getCandidates(resolvedBase: string): string[] {
		const hasKnownExtension = MODULE_EXTENSIONS.some(ext => resolvedBase.endsWith(`.${ext}`));
		if (hasKnownExtension) {
			return [resolvedBase];
		}

		const direct = MODULE_EXTENSIONS.map(ext => `${resolvedBase}.${ext}`);
		const indexed = MODULE_EXTENSIONS.map(ext => this.pathUtils.join(resolvedBase, `index.${ext}`));
		return [...direct, ...indexed];
	}

	private getLoader(path: string): ScriptLoaderType | null {
		if (path.endsWith(".ts") && !path.endsWith(".d.ts")) {
			return "ts";
		}
		if (path.endsWith(".js")) {
			return "js";
		}
		return null;
	}
}
