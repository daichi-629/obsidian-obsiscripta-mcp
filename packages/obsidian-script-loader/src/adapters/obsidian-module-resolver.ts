import { normalizePath, TFile, Vault } from "obsidian";
import path from "path";
import { ModuleResolution, ModuleResolver, ScriptLoaderType } from "@obsiscripta/script-loader-core";

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

	constructor(vault: Vault) {
		this.vault = vault;
	}

	async resolve(specifier: string, fromIdentifier: string): Promise<ModuleResolution | null> {
		if (!this.isRelativeSpecifier(specifier)) {
			return null;
		}

		const fromDir = this.getDirname(fromIdentifier);
		const requested = this.normalizeIdentifier(path.posix.join(fromDir, specifier));
		if (!this.isIdentifierPath(requested)) {
			return null;
		}

		for (const candidate of this.getCandidates(requested)) {
			if (!this.isIdentifierPath(candidate)) {
				continue;
			}
			const fullPath = normalizePath(candidate);
			const entry = this.vault.getAbstractFileByPath(fullPath);
			if (!(entry instanceof TFile)) {
				continue;
			}
			const loader = this.getLoader(candidate);
			if (!loader) {
				continue;
			}
			const source = await this.vault.read(entry);
			return {
				id: candidate,
				code: source,
				mtime: entry.stat?.mtime,
				loader,
			}
		}

		return null;
	}

	clearCache(): void {
		// No-op: compilation is handled by FunctionRuntime
	}

	private isRelativeSpecifier(specifier: string): boolean {
		return specifier.startsWith("./") || specifier.startsWith("../");
	}

	private isIdentifierPath(identifier: string): boolean {
		if (!identifier || path.posix.isAbsolute(identifier)) {
			return false;
		}
		return !identifier.startsWith("../") && identifier !== "..";
	}

	private getCandidates(resolvedBase: string): string[] {
		const hasKnownExtension = MODULE_EXTENSIONS.some(ext => resolvedBase.endsWith(`.${ext}`));
		if (hasKnownExtension) {
			return [resolvedBase];
		}

		const direct = MODULE_EXTENSIONS.map(ext => `${resolvedBase}.${ext}`);
		const indexed = MODULE_EXTENSIONS.map(ext => path.posix.join(resolvedBase, `index.${ext}`));
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

	private normalizeIdentifier(identifier: string): string {
		const normalized = path.posix.normalize(identifier).replace(/\\/g, "/");
		return normalized.replace(/^\.?\//, "");
	}

	private getDirname(identifier: string): string {
		const dirname = path.posix.dirname(identifier);
		if (dirname === "." || dirname === "/") {
			return "";
		}
		return dirname;
	}

}
