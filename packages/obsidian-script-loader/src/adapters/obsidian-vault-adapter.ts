import { EventRef, normalizePath, TFile, TFolder, Vault } from "obsidian";
import { Disposable, FileInfo, ScriptHost, WatchHandlers } from "@obsiscripta/script-loader-core";

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

	constructor(vault: Vault, eventRegistrar: EventRegistrar) {
		this.vault = vault;
		this.eventRegistrar = eventRegistrar;
	}

	async readFile(path: string): Promise<FileInfo> {
		const file = this.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) {
			throw new Error(`File not found or is not a file: ${path}`);
		}

		const contents = await this.vault.read(file);
		return {
			contents,
			mtime: file.stat?.mtime ?? 0,
		};
	}

	async listFiles(root: string): Promise<string[]> {
		const results: string[] = [];

		if (!root) {
			return results;
		}

		const rootFolder = this.vault.getAbstractFileByPath(root);
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
				} else if (child instanceof TFile && this.isScriptFile(child.path)) {
					results.push(child.path);
				}
			}
		}

		return results;
	}

	watch(root: string, handlers: WatchHandlers): Disposable {
		const eventRefs: EventRef[] = [];

		if (handlers.onCreate) {
			const ref = this.vault.on("create", (file) => {
				if (this.isInFolder(file.path, root)) {
					handlers.onCreate?.(file.path);
				}
			});
			eventRefs.push(ref);
			this.eventRegistrar.registerEvent(ref);
		}

		if (handlers.onModify) {
			const ref = this.vault.on("modify", (file) => {
				if (this.isInFolder(file.path, root)) {
					handlers.onModify?.(file.path);
				}
			});
			eventRefs.push(ref);
			this.eventRegistrar.registerEvent(ref);
		}

		if (handlers.onDelete) {
			const ref = this.vault.on("delete", (file) => {
				if (this.isInFolder(file.path, root)) {
					handlers.onDelete?.(file.path);
				}
			});
			eventRefs.push(ref);
			this.eventRegistrar.registerEvent(ref);
		}

		if (handlers.onRename) {
			const ref = this.vault.on("rename", (file, oldPath) => {
				if (this.isInFolder(file.path, root) || this.isInFolder(oldPath, root)) {
					handlers.onRename?.(file.path, oldPath);
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

	async exists(path: string): Promise<boolean> {
		const file = this.vault.getAbstractFileByPath(path);
		return file !== null;
	}

	async ensureDirectory(path: string): Promise<void> {
		const normalizedPath = normalizePath(path);
		const existing = this.vault.getAbstractFileByPath(normalizedPath);
		if (existing) {
			if (existing instanceof TFolder) {
				return;
			}
			throw new Error(`Path exists and is not a folder: ${normalizedPath}`);
		}
		try {
			await this.vault.createFolder(normalizedPath);
		} catch (error) {
			// Obsidian can throw "Folder already exists." for existing paths (e.g. trailing slash or race).
			// If the error message indicates the folder already exists, treat it as success
			// even if the cache hasn't updated yet
			if (error instanceof Error && error.message === "Folder already exists.") {
				return;
			}
			// For other errors, wait briefly for cache to update, then retry
			await new Promise(resolve => setTimeout(resolve, 100));
			const retry = this.vault.getAbstractFileByPath(normalizedPath);
			if (retry instanceof TFolder) {
				return;
			}
			throw error;
		}
	}

	private isScriptFile(filePath: string): boolean {
		const lowerPath = filePath.toLowerCase();
		return lowerPath.endsWith(".js") || (lowerPath.endsWith(".ts") && !lowerPath.endsWith(".d.ts"));
	}

	private isInFolder(filePath: string, folderPath: string): boolean {
		const normalized = normalizePath(filePath);
		const normalizedFolder = normalizePath(folderPath);
		return normalized === normalizedFolder || normalized.startsWith(`${normalizedFolder}/`);
	}
}
