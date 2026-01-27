import { normalizePath, TFile, TFolder, Vault } from "obsidian";
import {
	EventRegistrar,
	ScriptExecutionContext,
	ScriptLoaderCallbacks,
	ScriptLoaderType,
	ScriptMetadata,
} from "./types";
import { ScriptRegistry } from "./script-registry";
import { ScriptCompiler } from "./script-compiler";
import { ScriptExecutor } from "./script-executor";

const DEFAULT_SCRIPT_FOLDER_NAME = "mcp-tools";

export class ScriptLoader {
	private vault: Vault;
	private scriptContext: ScriptExecutionContext;
	private eventRegistrar: EventRegistrar;
	private scriptRegistry: ScriptRegistry;
	private compiler: ScriptCompiler;
	private executor: ScriptExecutor;
	private callbacks: ScriptLoaderCallbacks;
	private reloadTimer: number | null = null;
	private scriptsPath: string;

	constructor(
		vault: Vault,
		scriptContext: ScriptExecutionContext,
		eventRegistrar: EventRegistrar,
		scriptRegistry: ScriptRegistry,
		executor: ScriptExecutor,
		scriptsPath: string,
		callbacks?: ScriptLoaderCallbacks
	) {
		this.vault = vault;
		this.scriptContext = scriptContext;
		this.eventRegistrar = eventRegistrar;
		this.scriptRegistry = scriptRegistry;
		this.compiler = new ScriptCompiler();
		this.executor = executor;
		this.callbacks = callbacks ?? {};
		this.scriptsPath = ScriptLoader.normalizeScriptsPath(scriptsPath);
	}

	async start(): Promise<void> {
		await this.ensureScriptsFolder();
		await this.reloadAllScripts();
		this.startWatching();
	}

	stop(): void {
		if (this.reloadTimer !== null) {
			clearTimeout(this.reloadTimer);
			this.reloadTimer = null;
		}

		this.unregisterAllScripts();
	}

	async updateScriptsPath(scriptsPath: string): Promise<void> {
		const nextPath = ScriptLoader.normalizeScriptsPath(scriptsPath);
		if (nextPath === this.scriptsPath) {
			return;
		}
		this.unregisterAllScripts();
		this.scriptsPath = nextPath;
		await this.ensureScriptsFolder();
		await this.reloadAllScripts();
	}

	async reloadScripts(): Promise<void> {
		await this.reloadAllScripts();
	}

	getScriptsPath(): string {
		return this.scriptsPath;
	}

	private unregisterAllScripts(): void {
		const allPaths = this.scriptRegistry.getPaths();
		for (const path of allPaths) {
			this.unregisterScript(path);
		}
		this.compiler.clear();
	}

	static normalizeScriptsPath(settingPath?: string): string {
		const fallback = normalizePath(DEFAULT_SCRIPT_FOLDER_NAME);
		const trimmed = settingPath?.trim();
		if (!trimmed) {
			return fallback;
		}

		const normalized = trimmed.replace(/\\/g, "/");
		if (normalized.startsWith("/") || normalized.includes("..")) {
			return fallback;
		}

		const cleaned = normalized.replace(/^\.?\//, "");
		return normalizePath(cleaned);
	}

	/**
	 * Derives a tool name from the script path relative to the scripts folder.
	 * This ensures uniqueness by design since file paths are unique.
	 * Example: "mcp-tools/utils/helper.ts" -> "utils/helper"
	 */
	private deriveToolName(scriptPath: string): string {
		// Get the path relative to scriptsPath
		const normalizedScriptPath = scriptPath.replace(/\\/g, "/");
		const normalizedScriptsPath = this.scriptsPath.replace(/\\/g, "/");

		let relativePath = normalizedScriptPath;
		if (normalizedScriptPath.startsWith(normalizedScriptsPath + "/")) {
			relativePath = normalizedScriptPath.slice(normalizedScriptsPath.length + 1);
		}

		// Remove file extension (.js, .ts)
		relativePath = relativePath.replace(/\.(js|ts)$/, "");

		return relativePath;
	}

	private async ensureScriptsFolder(): Promise<void> {
		if (!this.scriptsPath) {
			throw new Error("Scripts path is not set");
		}
		const existing = this.vault.getAbstractFileByPath(this.scriptsPath);
		if (existing) {
			if (existing instanceof TFolder) {
				return;
			}
			throw new Error(`Scripts path exists and is not a folder: ${this.scriptsPath}`);
		}
		await this.vault.createFolder(this.scriptsPath);
		console.debug(`[ScriptLoader] Created script folder: ${this.scriptsPath}`);
	}

	private startWatching(): void {
		this.eventRegistrar.registerEvent(this.vault.on("create", (file) => {
			if (this.isScriptFile(file?.path)) {
				this.scheduleReload();
			}
		}));

		this.eventRegistrar.registerEvent(this.vault.on("modify", (file) => {
			if (this.isScriptFile(file?.path)) {
				this.scheduleReload();
			}
		}));

		this.eventRegistrar.registerEvent(this.vault.on("delete", (file) => {
			if (this.isScriptFile(file?.path)) {
				this.scheduleReload();
			}
		}));

		this.eventRegistrar.registerEvent(this.vault.on("rename", (file, oldPath) => {
			if (this.isScriptFile(file?.path) || this.isScriptPath(oldPath)) {
				this.scheduleReload();
			}
		}));
	}

	private scheduleReload(): void {
		if (this.reloadTimer !== null) {
			clearTimeout(this.reloadTimer);
		}
		this.reloadTimer = window.setTimeout(() => {
			this.reloadAllScripts().catch((error) => {
				console.error("[ScriptLoader] Failed to reload scripts:", error);
			});
		}, 300);
	}

	private async reloadAllScripts(): Promise<void> {
		const scriptPaths = await this.listScriptFiles(this.scriptsPath);
		const scriptSet = new Set(scriptPaths);

		for (const scriptPath of scriptPaths) {
			await this.loadScript(scriptPath);
		}

		for (const path of this.scriptRegistry.getPaths()) {
			if (!scriptSet.has(path)) {
				const metadata = this.scriptRegistry.get(path);
				this.unregisterScript(path);
				console.debug(`[ScriptLoader] Removed script: ${metadata?.name}`);
			}
		}
	}

	private async loadScript(scriptPath: string): Promise<void> {
		const loader = this.getLoaderForPath(scriptPath);
		if (!loader) {
			return;
		}

		const file = this.vault.getAbstractFileByPath(scriptPath);
		if (!file || !(file instanceof TFile)) {
			return;
		}

		try {
			const source = await this.vault.read(file);
			const compiled = await this.compiler.compile(scriptPath, source, loader, file.stat?.mtime);
			const exports = this.executor.execute(compiled, scriptPath, this.scriptContext);

			// Derive name from script path to ensure uniqueness
			const name = this.deriveToolName(scriptPath);

			const metadata: ScriptMetadata = {
				path: scriptPath,
				name,
				mtime: file.stat?.mtime ?? 0,
				compiledCode: compiled,
			};

			this.registerScript(metadata, exports);
		} catch (error) {
			console.error(`[ScriptLoader] Failed to load script ${scriptPath}:`, error);
			this.unregisterScript(scriptPath);
			this.callbacks.onScriptError?.(scriptPath, error as Error);
		}
	}

	private registerScript(metadata: ScriptMetadata, exports: unknown): void {
		this.scriptRegistry.register(metadata);
		this.callbacks.onScriptLoaded?.(metadata, exports);
	}

	private unregisterScript(scriptPath: string): void {
		const metadata = this.scriptRegistry.get(scriptPath);
		if (!metadata) {
			return;
		}
		this.scriptRegistry.unregister(scriptPath);
		this.compiler.invalidate(scriptPath);
		this.callbacks.onScriptUnloaded?.(metadata);
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

	private async listScriptFiles(dir: string): Promise<string[]> {
		const results: string[] = [];

		if (!dir) {
			return results;
		}

		const root = this.vault.getAbstractFileByPath(dir);
		if (!root || !(root instanceof TFolder)) {
			return results;
		}

		const stack: TFolder[] = [root];
		while (stack.length > 0) {
			const folder = stack.pop();
			if (!folder) {
				continue;
			}
			for (const child of folder.children) {
				if (child instanceof TFolder) {
					stack.push(child);
				} else if (child instanceof TFile && this.isScriptPath(child.path)) {
					results.push(child.path);
				}
			}
		}

		return results;
	}

	private isScriptFile(filePath?: string): boolean {
		if (!filePath) {
			return false;
		}
		return this.isInScriptsFolder(filePath) && this.isScriptPath(filePath);
	}

	private isInScriptsFolder(filePath: string): boolean {
		const normalized = filePath.replace(/\\/g, "/");
		const prefix = this.scriptsPath.replace(/\\/g, "/");
		return normalized === prefix || normalized.startsWith(`${prefix}/`);
	}

	private isScriptPath(filePath?: string): boolean {
		if (!filePath) {
			return false;
		}
		const lowerPath = filePath.toLowerCase();
		return lowerPath.endsWith(".js") || (lowerPath.endsWith(".ts") && !lowerPath.endsWith(".d.ts"));
	}
}
