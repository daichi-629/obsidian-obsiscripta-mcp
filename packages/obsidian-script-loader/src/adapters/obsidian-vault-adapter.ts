import { EventRef, normalizePath, TFile, TFolder, Vault } from "obsidian";
import {
	Disposable,
	FileInfo,
	ScriptFileEntry,
	ScriptHost,
	ScriptLoaderType,
	WatchHandlers,
} from "@obsiscripta/script-loader-core";

/**
 * Event registration interface for Obsidian plugin lifecycle management
 */
export interface EventRegistrar {
	registerEvent(eventRef: EventRef): void;
}

/**
 * Obsidian implementation of ScriptHost interface.
 * Adapts Obsidian's Vault API to the core ScriptHost interface.
 */
export class ObsidianVaultAdapter implements ScriptHost {
	private vault: Vault;
	private eventRegistrar: EventRegistrar;
	private scriptsPath: string;

	constructor(vault: Vault, eventRegistrar: EventRegistrar, scriptsPath: string) {
		this.vault = vault;
		this.eventRegistrar = eventRegistrar;
		this.scriptsPath = this.normalizeRoot(scriptsPath);
	}

	setScriptsPath(scriptsPath: string): void {
		this.scriptsPath = this.normalizeRoot(scriptsPath);
	}

	async readFile(identifier: string): Promise<FileInfo> {
		const file = this.vault.getAbstractFileByPath(identifier);
		if (!file || !(file instanceof TFile)) {
			throw new Error(`File not found or is not a file: ${identifier}`);
		}

		const contents = await this.vault.read(file);
		return {
			contents,
			mtime: file.stat?.mtime ?? 0,
		};
	}

	async listFiles(): Promise<ScriptFileEntry[]> {
		const results: ScriptFileEntry[] = [];

		if (!this.scriptsPath) {
			return results;
		}

		const rootFolder = this.vault.getAbstractFileByPath(this.scriptsPath);
		if (!rootFolder || !(rootFolder instanceof TFolder)) {
			return results;
		}

		const stack: TFolder[] = [rootFolder];
		while (stack.length > 0) {
			const folder = stack.pop();
			if (!folder) {
				continue;
			}
			for (const child of folder.children) {
				if (child instanceof TFolder) {
					stack.push(child);
				} else if (child instanceof TFile) {
					const loader = this.getLoaderForPath(child.path);
					if (loader) {
						const identifier = this.toIdentifier(child.path);
						if (identifier) {
							results.push({ identifier, loader });
						}
					}
				}
			}
		}

		return results;
	}

	watch(handlers: WatchHandlers): Disposable {
		const eventRefs: EventRef[] = [];

		if (handlers.onCreate) {
			const ref = this.vault.on("create", (file) => {
				const identifier = this.toIdentifier(file.path);
				if (identifier) {
					handlers.onCreate?.(identifier);
				}
			});
			eventRefs.push(ref);
			this.eventRegistrar.registerEvent(ref);
		}

		if (handlers.onModify) {
			const ref = this.vault.on("modify", (file) => {
				const identifier = this.toIdentifier(file.path);
				if (identifier) {
					handlers.onModify?.(identifier);
				}
			});
			eventRefs.push(ref);
			this.eventRegistrar.registerEvent(ref);
		}

		if (handlers.onDelete) {
			const ref = this.vault.on("delete", (file) => {
				const identifier = this.toIdentifier(file.path);
				if (identifier) {
					handlers.onDelete?.(identifier);
				}
			});
			eventRefs.push(ref);
			this.eventRegistrar.registerEvent(ref);
		}

		if (handlers.onRename) {
			const ref = this.vault.on("rename", (file, oldPath) => {
				const newIdentifier = this.toIdentifier(file.path);
				const oldIdentifier = this.toIdentifier(oldPath);
				if (newIdentifier || oldIdentifier) {
					handlers.onRename?.(
						newIdentifier ?? oldIdentifier ?? "",
						oldIdentifier ?? newIdentifier ?? ""
					);
				}
			});
			eventRefs.push(ref);
			this.eventRegistrar.registerEvent(ref);
		}

		return {
			dispose: () => {
				for (const ref of eventRefs) {
					this.vault.offref(ref);
				}
			},
		};
	}

	private getLoaderForPath(filePath: string): ScriptLoaderType | null {
		const lowerPath = filePath.toLowerCase();
		if (lowerPath.endsWith(".js")) {
			return "js";
		}
		if (lowerPath.endsWith(".ts") && !lowerPath.endsWith(".d.ts")) {
			return "ts";
		}
		return null;
	}

	private normalizeRoot(root: string): string {
		const normalized = normalizePath(root);
		return normalized.replace(/\/+$/, "");
	}

	private toIdentifier(filePath: string): string | null {
		const normalized = normalizePath(filePath);
		if (!this.scriptsPath) {
			return normalized.replace(/^\.?\//, "");
		}
		if (normalized === this.scriptsPath) {
			return null;
		}
		if (!normalized.startsWith(`${this.scriptsPath}/`)) {
			return null;
		}
		return normalized;
	}

	deriveToolName(identifier: string, loader?: ScriptLoaderType): string {
		let relative = identifier;
		const normalizedRoot = this.scriptsPath;
		const normalizedIdentifier = normalizePath(identifier);
		if (normalizedRoot && normalizedIdentifier.startsWith(`${normalizedRoot}/`)) {
			relative = normalizedIdentifier.slice(normalizedRoot.length + 1);
		} else {
			relative = normalizedIdentifier.replace(/^\.?\//, "");
		}
		if (loader === "js") {
			relative = relative.replace(/\.js$/, "");
		} else if (loader === "ts") {
			relative = relative.replace(/\.ts$/, "");
		}
		return relative;
	}
}
