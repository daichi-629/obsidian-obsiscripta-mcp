import { Vault } from "obsidian";
import {
	ScriptLoaderCore,
	ScriptRegistry,
	DefaultScriptCompiler,
	FunctionRuntime,
	ScriptRuntime,
	ExecutionContextConfig,
	ScriptLoaderCallbacks,
	FunctionRuntimeOptions,
} from "@obsiscripta/script-loader-core";
import { ScriptExecutionContext } from "./types";
import { ObsidianVaultAdapter, EventRegistrar } from "./adapters/obsidian-vault-adapter";
import { ObsidianLogger } from "./adapters/obsidian-logger";
import { ObsidianModuleResolver } from "./adapters/obsidian-module-resolver";
import path from "path";

/**
 * Obsidian-specific wrapper for ScriptLoaderCore.
 * Provides a convenient API that hides the adapter composition details.
 */
export class ScriptLoader {
	private core: ScriptLoaderCore;
	private scriptHost: ObsidianVaultAdapter;
	private scriptsPath: string;

	constructor(
		vault: Vault,
		scriptContext: ScriptExecutionContext,
		eventRegistrar: EventRegistrar,
		scriptRegistry: ScriptRegistry,
		runtime: ScriptRuntime,
		scriptsPath: string,
		callbacks?: ScriptLoaderCallbacks
	) {
		this.scriptsPath = scriptsPath;
		// Create adapters
		this.scriptHost = new ObsidianVaultAdapter(vault, eventRegistrar, scriptsPath);
		const logger = new ObsidianLogger("[ScriptLoader]");

		// Create compiler
		const compiler = new DefaultScriptCompiler();

		// Create core loader with all dependencies
		this.core = new ScriptLoaderCore(
			this.scriptHost,
			logger,
			scriptRegistry,
			compiler,
			runtime,
			scriptContext,
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
	async stop(): Promise<void> {
		await this.core.stop();
	}

	/**
	 * Update the scripts path
	 */
	async updateScriptsPath(scriptsPath: string): Promise<void> {
		this.scriptsPath = scriptsPath;
		this.scriptHost.setScriptsPath(scriptsPath);
		await this.core.reloadScripts();
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
		return this.scriptsPath;
	}

	/**
	 * Normalize a scripts path setting
	 */
	static normalizeScriptsPath(settingPath?: string): string {
		const fallback = "mcp-tools";
		const trimmed = settingPath?.trim();
		if (!trimmed) {
			return fallback;
		}

		const normalized = trimmed.replace(/\\/g, "/");
		if (normalized.startsWith("/") || normalized.includes("..")) {
			return fallback;
		}

		const cleaned = normalized.replace(/^\.?\//, "");
		return cleaned.replace(/\\/g, "/").replace(/\/+/g, "/");
	}

	/**
	 * Create a ScriptRuntime with Obsidian-specific configuration
	 */
	static createRuntime(
		contextConfig: ExecutionContextConfig,
		vault: Vault,
		options?: FunctionRuntimeOptions
	): ScriptRuntime {
		const moduleResolver = options?.moduleResolver ?? new ObsidianModuleResolver(vault);
		const moduleCompiler = options?.moduleCompiler ?? new DefaultScriptCompiler();
		const dirnameResolver = options?.dirnameResolver ?? ((identifier: string) => {
			const dirname = path.posix.dirname(identifier);
			if (dirname === "." || dirname === "/") {
				return "";
			}
			return dirname;
		});
		const runtimeOptions: FunctionRuntimeOptions = {
			...options,
			moduleResolver,
			moduleCompiler,
			dirnameResolver,
		};

		return new FunctionRuntime(contextConfig, runtimeOptions);
	}

	/**
	 * Backward-compatible alias for createRuntime
	 */
	static createExecutor(
		contextConfig: ExecutionContextConfig,
		vault: Vault
	): ScriptRuntime {
		return ScriptLoader.createRuntime(contextConfig, vault);
	}
}
