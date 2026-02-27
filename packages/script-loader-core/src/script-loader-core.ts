import {
	Disposable,
	Logger,
	ScriptExecutionContext,
	ScriptHost,
	ScriptLoaderCallbacks,
	ScriptLoaderType,
	ScriptMetadata,
	ScriptCompiler,
} from "./types";
import { ScriptRegistry } from "./script-registry";
import { ScriptRuntime } from "./runtime";

const DEFAULT_RELOAD_DEBOUNCE_MS = 300;

/**
 * Core script loader that orchestrates loading, compiling, and watching scripts.
 * This class is platform-independent and depends only on abstract interfaces.
 */
export class ScriptLoaderCore {
	private scriptHost: ScriptHost;
	private logger: Logger;
	private scriptRegistry: ScriptRegistry;
	private compiler: ScriptCompiler;
	private runtime: ScriptRuntime;
	private scriptContext: ScriptExecutionContext;
	private callbacks: ScriptLoaderCallbacks;
	private reloadTimer: number | null = null;
	private watchDisposable: Disposable | null = null;
	private reloadDebounceMs: number;

	constructor(
		scriptHost: ScriptHost,
		logger: Logger,
		scriptRegistry: ScriptRegistry,
		compiler: ScriptCompiler,
		runtime: ScriptRuntime,
		scriptContext: ScriptExecutionContext,
		callbacks?: ScriptLoaderCallbacks,
		reloadDebounceMs: number = DEFAULT_RELOAD_DEBOUNCE_MS
	) {
		this.scriptHost = scriptHost;
		this.logger = logger;
		this.scriptRegistry = scriptRegistry;
		this.compiler = compiler;
		this.runtime = runtime;
		this.scriptContext = scriptContext;
		this.callbacks = callbacks ?? {};
		this.reloadDebounceMs = reloadDebounceMs;
	}

	/**
	 * Start the script loader: load all scripts, start watching
	 */
	async start(): Promise<void> {
		// Initialize runtime if it has an initialize method
		if (this.runtime.initialize) {
			await this.runtime.initialize();
		}

		await this.reloadAllScripts();
		this.startWatching();
	}

	/**
	 * Stop the script loader: stop watching, unregister all scripts
	 */
	async stop(): Promise<void> {
		if (this.reloadTimer !== null) {
			clearTimeout(this.reloadTimer);
			this.reloadTimer = null;
		}

		if (this.watchDisposable) {
			this.watchDisposable.dispose();
			this.watchDisposable = null;
		}

		await this.unregisterAllScripts();

		// Dispose runtime if it has a dispose method
		if (this.runtime.dispose) {
			await this.runtime.dispose();
		}
	}

	/**
	 * Manually reload all scripts
	 */
	async reloadScripts(): Promise<void> {
		await this.reloadAllScripts();
	}

	/**
	 * Unregister all scripts
	 */
	private async unregisterAllScripts(): Promise<void> {
		const allIdentifiers = this.scriptRegistry.getIdentifiers();
		await Promise.all(allIdentifiers.map(identifier => this.unregisterScript(identifier)));
		this.compiler.clear();
	}

	/**
	 * Derive a tool name from a script identifier.
	 * This ensures uniqueness by design since identifiers are unique.
	 */
	private deriveToolName(identifier: string, loader?: ScriptLoaderType): string {
		let normalized = identifier.replace(/\\/g, "/").replace(/^\.?\//, "");
		// Remove known file extension when available
		if (loader === "js") {
			normalized = normalized.replace(/\.js$/, "");
		} else if (loader === "ts") {
			normalized = normalized.replace(/\.ts$/, "");
		}
		return normalized;
	}

	/**
	 * Start watching for file changes
	 */
	private startWatching(): void {
		this.watchDisposable = this.scriptHost.watch({
			onCreate: (_identifier) => {
				this.scheduleReload();
			},
			onModify: (_identifier) => {
				this.scheduleReload();
			},
			onDelete: (_identifier) => {
				this.scheduleReload();
			},
			onRename: (_newIdentifier, _oldIdentifier) => {
				this.scheduleReload();
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
		const scriptFiles = await this.scriptHost.listFiles();
		const scriptSet = new Set(scriptFiles.map((entry) => entry.identifier));

		// Load new/modified scripts
		for (const entry of scriptFiles) {
			await this.loadScript(entry.identifier, entry.loader);
		}

		// Remove scripts that no longer exist
		const removedScripts: string[] = [];
		for (const identifier of this.scriptRegistry.getIdentifiers()) {
			if (!scriptSet.has(identifier)) {
				removedScripts.push(identifier);
			}
		}

		// Unregister removed scripts in parallel
		await Promise.all(removedScripts.map(async identifier => {
			const metadata = this.scriptRegistry.get(identifier);
			await this.unregisterScript(identifier);
			this.logger.debug(`[ScriptLoaderCore] Removed script: ${metadata?.name}`);
		}));
	}

	/**
	 * Load a single script
	 */
	private async loadScript(identifier: string, loader: ScriptLoaderType): Promise<void> {
		try {
			const fileInfo = await this.scriptHost.readFile(identifier);
			const compiled = await this.compiler.compile(identifier, fileInfo.contents, loader, fileInfo.mtime);

			// Load script using runtime
			const handle = await this.runtime.load(compiled, identifier, this.scriptContext);

			// Derive name from script identifier to ensure uniqueness
			const name = this.scriptHost.deriveToolName?.(identifier, loader)
				?? this.deriveToolName(identifier, loader);

			const metadata: ScriptMetadata = {
				identifier,
				name,
				mtime: fileInfo.mtime,
				compiledCode: compiled,
				handle,
			};

			this.registerScript(metadata, handle.exports);
		} catch (error) {
			this.logger.error(`[ScriptLoaderCore] Failed to load script ${identifier}:`, error);
			await this.unregisterScript(identifier);
			this.callbacks.onScriptError?.(identifier, error as Error);
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
	private async unregisterScript(identifier: string): Promise<void> {
		const metadata = this.scriptRegistry.get(identifier);
		if (!metadata) {
			return;
		}

		// Unload from runtime if handle exists
		if (metadata.handle && this.runtime.unload) {
			await this.runtime.unload(metadata.handle.id);
		}

		this.scriptRegistry.unregister(identifier);
		this.compiler.invalidate(identifier);
		this.callbacks.onScriptUnloaded?.(metadata);
	}

}
