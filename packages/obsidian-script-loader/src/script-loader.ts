import { Vault } from "obsidian";
import {
	ScriptLoaderCore,
	ScriptRegistry,
	ScriptCompiler,
	ScriptExecutor,
	ExecutionContextConfig,
	ScriptLoaderCallbacks,
	RequireOptions,
} from "@obsiscripta/script-loader-core";
import { ScriptExecutionContext } from "./types";
import { ObsidianVaultAdapter, EventRegistrar } from "./adapters/obsidian-vault-adapter";
import { ObsidianPathUtils } from "./adapters/obsidian-path-utils";
import { ObsidianLogger } from "./adapters/obsidian-logger";

/**
 * Obsidian-specific wrapper for ScriptLoaderCore.
 * Provides a convenient API that hides the adapter composition details.
 */
export class ScriptLoader {
	private core: ScriptLoaderCore;
	private pathUtils: ObsidianPathUtils;

	constructor(
		vault: Vault,
		scriptContext: ScriptExecutionContext,
		eventRegistrar: EventRegistrar,
		scriptRegistry: ScriptRegistry,
		executor: ScriptExecutor,
		scriptsPath: string,
		callbacks?: ScriptLoaderCallbacks
	) {
		// Create adapters
		const scriptHost = new ObsidianVaultAdapter(vault, eventRegistrar);
		this.pathUtils = new ObsidianPathUtils();
		const logger = new ObsidianLogger("[ScriptLoader]");

		// Create compiler
		const compiler = new ScriptCompiler();

		// Create core loader with all dependencies
		this.core = new ScriptLoaderCore(
			scriptHost,
			this.pathUtils,
			logger,
			scriptRegistry,
			compiler,
			executor,
			scriptContext,
			scriptsPath,
			callbacks
		);
	}

	/**
	 * Start the script loader
	 */
	async start(): Promise<void> {
		await this.core.start();
	}

	/**
	 * Stop the script loader
	 */
	stop(): void {
		this.core.stop();
	}

	/**
	 * Update the scripts path
	 */
	async updateScriptsPath(scriptsPath: string): Promise<void> {
		await this.core.updateScriptsPath(scriptsPath);
	}

	/**
	 * Reload all scripts
	 */
	async reloadScripts(): Promise<void> {
		await this.core.reloadScripts();
	}

	/**
	 * Get the current scripts path
	 */
	getScriptsPath(): string {
		return this.core.getScriptsPath();
	}

	/**
	 * Normalize a scripts path setting
	 */
	static normalizeScriptsPath(settingPath?: string): string {
		const pathUtils = new ObsidianPathUtils();
		const fallback = pathUtils.normalize("mcp-tools");
		const trimmed = settingPath?.trim();
		if (!trimmed) {
			return fallback;
		}

		const normalized = trimmed.replace(/\\/g, "/");
		if (normalized.startsWith("/") || normalized.includes("..")) {
			return fallback;
		}

		const cleaned = normalized.replace(/^\.?\//, "");
		return pathUtils.normalize(cleaned);
	}

	/**
	 * Create a ScriptExecutor with Obsidian-specific configuration
	 */
	static createExecutor(
		contextConfig: ExecutionContextConfig,
		vault: Vault
	): ScriptExecutor {
		const pathUtils = new ObsidianPathUtils();

		// Get base path from vault adapter if available
		const adapter = vault.adapter as { getBasePath?: () => string };
		const basePath = adapter.getBasePath?.();

		const requireOptions: RequireOptions | undefined = basePath
			? { basePath, pathUtils }
			: undefined;

		return new ScriptExecutor(contextConfig, requireOptions);
	}
}
