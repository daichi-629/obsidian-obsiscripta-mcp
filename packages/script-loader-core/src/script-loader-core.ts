import {
	Disposable,
	Logger,
	PathUtils,
	ScriptExecutionContext,
	ScriptHost,
	ScriptLoaderCallbacks,
	ScriptLoaderType,
	ScriptMetadata,
} from "./types";
import { ScriptRegistry } from "./script-registry";
import { ScriptCompiler } from "./script-compiler";
import { ScriptExecutor } from "./script-executor";

const DEFAULT_RELOAD_DEBOUNCE_MS = 300;

/**
 * Core script loader that orchestrates loading, compiling, and watching scripts.
 * This class is platform-independent and depends only on abstract interfaces.
 */
export class ScriptLoaderCore {
	private scriptHost: ScriptHost;
	private pathUtils: PathUtils;
	private logger: Logger;
	private scriptRegistry: ScriptRegistry;
	private compiler: ScriptCompiler;
	private executor: ScriptExecutor;
	private scriptContext: ScriptExecutionContext;
	private callbacks: ScriptLoaderCallbacks;
	private reloadTimer: number | null = null;
	private scriptsPath: string;
	private watchDisposable: Disposable | null = null;
	private reloadDebounceMs: number;

	constructor(
		scriptHost: ScriptHost,
		pathUtils: PathUtils,
		logger: Logger,
		scriptRegistry: ScriptRegistry,
		compiler: ScriptCompiler,
		executor: ScriptExecutor,
		scriptContext: ScriptExecutionContext,
		scriptsPath: string,
		callbacks?: ScriptLoaderCallbacks,
		reloadDebounceMs: number = DEFAULT_RELOAD_DEBOUNCE_MS
	) {
		this.scriptHost = scriptHost;
		this.pathUtils = pathUtils;
		this.logger = logger;
		this.scriptRegistry = scriptRegistry;
		this.compiler = compiler;
		this.executor = executor;
		this.scriptContext = scriptContext;
		this.callbacks = callbacks ?? {};
		this.scriptsPath = this.normalizeScriptsPath(scriptsPath);
		this.reloadDebounceMs = reloadDebounceMs;
	}

	/**
	 * Start the script loader: ensure scripts folder, load all scripts, start watching
	 */
	async start(): Promise<void> {
		await this.ensureScriptsFolder();
		await this.reloadAllScripts();
		this.startWatching();
	}

	/**
	 * Stop the script loader: stop watching, unregister all scripts
	 */
	stop(): void {
		if (this.reloadTimer !== null) {
			clearTimeout(this.reloadTimer);
			this.reloadTimer = null;
		}

		if (this.watchDisposable) {
			this.watchDisposable.dispose();
			this.watchDisposable = null;
		}

		this.unregisterAllScripts();
	}

	/**
	 * Update the scripts path and reload
	 */
	async updateScriptsPath(scriptsPath: string): Promise<void> {
		const nextPath = this.normalizeScriptsPath(scriptsPath);
		if (nextPath === this.scriptsPath) {
			return;
		}
		this.unregisterAllScripts();
		this.scriptsPath = nextPath;
		await this.ensureScriptsFolder();
		await this.reloadAllScripts();
	}

	/**
	 * Manually reload all scripts
	 */
	async reloadScripts(): Promise<void> {
		await this.reloadAllScripts();
	}

	/**
	 * Get the current scripts path
	 */
	getScriptsPath(): string {
		return this.scriptsPath;
	}

	/**
	 * Normalize the scripts path
	 */
	private normalizeScriptsPath(settingPath?: string): string {
		const fallback = this.pathUtils.normalize("mcp-tools");
		const trimmed = settingPath?.trim();
		if (!trimmed) {
			return fallback;
		}

		const normalized = trimmed.replace(/\\/g, "/");
		if (normalized.startsWith("/") || normalized.includes("..")) {
			return fallback;
		}

		const cleaned = normalized.replace(/^\.?\//, "");
		return this.pathUtils.normalize(cleaned);
	}

	/**
	 * Unregister all scripts
	 */
	private unregisterAllScripts(): void {
		const allPaths = this.scriptRegistry.getPaths();
		for (const path of allPaths) {
			this.unregisterScript(path);
		}
		this.compiler.clear();
	}

	/**
	 * Derive a tool name from the script path relative to the scripts folder.
	 * This ensures uniqueness by design since file paths are unique.
	 */
	private deriveToolName(scriptPath: string): string {
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

	/**
	 * Ensure the scripts folder exists
	 */
	private async ensureScriptsFolder(): Promise<void> {
		if (!this.scriptsPath) {
			throw new Error("Scripts path is not set");
		}

		try {
			await this.scriptHost.ensureDirectory(this.scriptsPath);
			this.logger.debug(`[ScriptLoaderCore] Scripts folder ready: ${this.scriptsPath}`);
		} catch (error) {
			this.logger.error(`[ScriptLoaderCore] Failed to ensure scripts folder: ${this.scriptsPath}`, error);
			throw error;
		}
	}

	/**
	 * Start watching for file changes
	 */
	private startWatching(): void {
		this.watchDisposable = this.scriptHost.watch(this.scriptsPath, {
			onCreate: (path) => {
				if (this.isScriptPath(path)) {
					this.scheduleReload();
				}
			},
			onModify: (path) => {
				if (this.isScriptPath(path)) {
					this.scheduleReload();
				}
			},
			onDelete: (path) => {
				if (this.isScriptPath(path)) {
					this.scheduleReload();
				}
			},
			onRename: (newPath, oldPath) => {
				if (this.isScriptPath(newPath) || this.isScriptPath(oldPath)) {
					this.scheduleReload();
				}
			},
		});
	}

	/**
	 * Schedule a reload with debouncing
	 */
	private scheduleReload(): void {
		if (this.reloadTimer !== null) {
			clearTimeout(this.reloadTimer);
		}
		this.reloadTimer = setTimeout(() => {
			this.reloadAllScripts().catch((error) => {
				this.logger.error("[ScriptLoaderCore] Failed to reload scripts:", error);
			});
		}, this.reloadDebounceMs) as unknown as number;
	}

	/**
	 * Reload all scripts
	 */
	private async reloadAllScripts(): Promise<void> {
		const scriptPaths = await this.scriptHost.listFiles(this.scriptsPath);
		const scriptSet = new Set(scriptPaths);

		// Load new/modified scripts
		for (const scriptPath of scriptPaths) {
			await this.loadScript(scriptPath);
		}

		// Remove scripts that no longer exist
		for (const path of this.scriptRegistry.getPaths()) {
			if (!scriptSet.has(path)) {
				const metadata = this.scriptRegistry.get(path);
				this.unregisterScript(path);
				this.logger.debug(`[ScriptLoaderCore] Removed script: ${metadata?.name}`);
			}
		}
	}

	/**
	 * Load a single script
	 */
	private async loadScript(scriptPath: string): Promise<void> {
		const loader = this.getLoaderForPath(scriptPath);
		if (!loader) {
			return;
		}

		try {
			const fileInfo = await this.scriptHost.readFile(scriptPath);
			const compiled = await this.compiler.compile(scriptPath, fileInfo.contents, loader, fileInfo.mtime);
			const exports = this.executor.execute(compiled, scriptPath, this.scriptContext);

			// Derive name from script path to ensure uniqueness
			const name = this.deriveToolName(scriptPath);

			const metadata: ScriptMetadata = {
				path: scriptPath,
				name,
				mtime: fileInfo.mtime,
				compiledCode: compiled,
			};

			this.registerScript(metadata, exports);
		} catch (error) {
			this.logger.error(`[ScriptLoaderCore] Failed to load script ${scriptPath}:`, error);
			this.unregisterScript(scriptPath);
			this.callbacks.onScriptError?.(scriptPath, error as Error);
		}
	}

	/**
	 * Register a script
	 */
	private registerScript(metadata: ScriptMetadata, exports: unknown): void {
		this.scriptRegistry.register(metadata);
		this.callbacks.onScriptLoaded?.(metadata, exports);
	}

	/**
	 * Unregister a script
	 */
	private unregisterScript(scriptPath: string): void {
		const metadata = this.scriptRegistry.get(scriptPath);
		if (!metadata) {
			return;
		}
		this.scriptRegistry.unregister(scriptPath);
		this.compiler.invalidate(scriptPath);
		this.callbacks.onScriptUnloaded?.(metadata);
	}

	/**
	 * Get the loader type for a file path
	 */
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

	/**
	 * Check if a path is a script file
	 */
	private isScriptPath(filePath?: string): boolean {
		if (!filePath) {
			return false;
		}
		const lowerPath = filePath.toLowerCase();
		return lowerPath.endsWith(".js") || (lowerPath.endsWith(".ts") && !lowerPath.endsWith(".d.ts"));
	}
}
