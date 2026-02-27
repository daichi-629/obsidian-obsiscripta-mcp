import { App, Notice, Vault } from "obsidian";
import type MCPPlugin from "../main";
import { MCPPluginSettings } from "../settings";
import { MCPToolDefinition } from "../mcp/tools/types";
import { ToolRegistry, ToolSource } from "../mcp/tools/registry";
import { getBuiltinNoteTools } from "../mcp/tools/builtin/read";
import { getBuiltinNoteOutlineTools } from "../mcp/tools/builtin/note-outline";
import { getBuiltinEditTools } from "../mcp/tools/builtin/edit";
import { getBuiltinFrontmatterTools } from "../mcp/tools/builtin/frontmatter-tool";
import {
	ScriptLoader,
	ScriptRegistry,
} from "@obsiscripta/obsidian-script-loader";
import { createObsidianContextConfig } from "../mcp/tools/scripting/context-config";
import { isToolDefinitionLike, validateAndConvertScriptExports } from "../mcp/tools/scripting/script-validator";
import { ExampleManager } from "../mcp/tools/scripting/example-manager";
import { EventRegistrar, ScriptExecutionContext } from "./context";
import { SettingsStore } from "../settings/settings-store";
import { EventRef } from "../settings/setting-store-base";

// Coordinates built-in and script tool lifecycle + registry state.
export class ToolingManager {
	private vault: Vault;
	private app: App;
	private settings: MCPPluginSettings;
	private eventRegistrar: EventRegistrar;
	private scriptContext: ScriptExecutionContext;
	private exampleSourcePath: string;
	readonly registry: ToolRegistry;
	private scriptRegistry: ScriptRegistry | null = null;
	private scriptLoader: ScriptLoader | null = null;
	private exampleManager: ExampleManager | null = null;
	private changeEventRef: EventRef | null = null;

	constructor(
		vault: Vault,
		app: App,
		plugin: MCPPlugin,
		settings: MCPPluginSettings,
		eventRegistrar: EventRegistrar,
		exampleSourcePath: string,
		disabledTools: string[]
	) {
		this.vault = vault;
		this.app = app;
		this.settings = settings;
		this.eventRegistrar = eventRegistrar;
		this.scriptContext = { vault, app, plugin };
		this.exampleSourcePath = exampleSourcePath;
		this.registry = new ToolRegistry(disabledTools);
	}

	async start(): Promise<void> {
		for (const tool of getBuiltinNoteTools()) {
			this.registry.register(tool, ToolSource.Builtin);
		}
		for (const tool of getBuiltinNoteOutlineTools()) {
			this.registry.register(tool, ToolSource.Builtin);
		}
		for (const tool of getBuiltinEditTools()) {
			this.registry.register(tool, ToolSource.Builtin);
		}
		for (const tool of getBuiltinFrontmatterTools()) {
			this.registry.register(tool, ToolSource.Builtin);
		}

		const scriptsPath = this.settings.scriptsPath ?? "";

		// Create runtime with Obsidian context configuration
		const runtime = ScriptLoader.createRuntime(createObsidianContextConfig(), this.vault);
		this.scriptRegistry = new ScriptRegistry(runtime);

		// Create script loader with callbacks to bridge to tool registry
		this.scriptLoader = new ScriptLoader(
			this.vault,
			this.scriptContext,
			this.eventRegistrar,
			this.scriptRegistry,
			runtime,
			scriptsPath,
			{
				onScriptLoaded: (metadata, exports) => {
					if (!isToolDefinitionLike(exports)) {
						console.debug(`[Bridge] Ignoring non-tool script file: ${metadata.identifier}`);
						return;
					}

					try {
						// Validate and convert script exports to MCP tool definition
						const tool = validateAndConvertScriptExports(exports, metadata.identifier, metadata.name);
						this.registry.register(tool, ToolSource.Script);
					} catch (error) {
						console.error(`[Bridge] Invalid script exports in ${metadata.identifier}:`, error);
					}
				},
				onScriptUnloaded: (metadata) => {
					// Unregister tool when script is unloaded
					this.registry.unregister(metadata.name);
				},
				onScriptError: (identifier, error) => {
					console.error(`[Bridge] Script error in ${identifier}:`, error);
				},
			}
		);

		this.exampleManager = new ExampleManager(
			this.vault,
			this.app.vault.adapter,
			this.exampleSourcePath,
			this.scriptLoader.getScriptsPath(),
		);
		try {
			await this.scriptLoader.start();
		} catch (error) {
			console.error("[Bridge] Failed to start script loader:", error);
		}
	}

	async stop(): Promise<void> {
		if (this.scriptLoader) {
			await this.scriptLoader.stop();
		}
		this.scriptLoader = null;
		this.exampleManager = null;
	}

	getExampleManager(): ExampleManager | null {
		return this.exampleManager;
	}

	getRegisteredTools(): MCPToolDefinition[] {
		return this.registry.list();
	}

	isToolEnabled(name: string): boolean {
		return this.registry.isEnabled(name);
	}

	getToolSource(name: string): ToolSource {
		return this.registry.getSource(name);
	}

	setToolEnabled(name: string, enabled: boolean): void {
		this.registry.setEnabled(name, enabled);
	}

	async updateScriptsPath(scriptsPath: string): Promise<string> {
		const normalizedPath = ScriptLoader.normalizeScriptsPath(scriptsPath);
		if (!this.scriptLoader) {
			return normalizedPath;
		}

		if (normalizedPath !== this.scriptLoader.getScriptsPath()) {
			await this.scriptLoader.updateScriptsPath(normalizedPath);
		}
		const resolvedPath = this.scriptLoader.getScriptsPath();
		this.exampleManager?.setScriptsPath(resolvedPath);
		return resolvedPath;
	}

	async reloadScripts(): Promise<void> {
		if (!this.scriptLoader) {
			throw new Error("Script loader is not available");
		}
		await this.scriptLoader.reloadScripts();
	}

	/**
	 * Subscribe to settings changes to automatically update tool configuration.
	 * This keeps the tooling manager in sync with the settings store.
	 */
	subscribeToSettings(settingsStore: SettingsStore): void {
		this.changeEventRef = settingsStore.on("change", (oldSettings, newSettings) => {
			void (async () => {
				// Update scriptsPath if changed
				if (oldSettings.scriptsPath !== newSettings.scriptsPath) {
					try {
						await this.updateScriptsPath(newSettings.scriptsPath);
						console.debug(`[Bridge] Scripts path updated to: ${newSettings.scriptsPath}`);
					} catch (error) {
						console.error("[Bridge] Failed to update scripts path:", error);
						new Notice("Failed to update scripts folder");
					}
				}

				// Update tool enabled/disabled state if disabledTools changed
				const oldDisabled = new Set(oldSettings.disabledTools);
				const newDisabled = new Set(newSettings.disabledTools);

				// Tools newly disabled
				for (const tool of newDisabled) {
					if (!oldDisabled.has(tool)) {
						this.setToolEnabled(tool, false);
					}
				}

				// Tools newly enabled
				for (const tool of oldDisabled) {
					if (!newDisabled.has(tool)) {
						this.setToolEnabled(tool, true);
					}
				}
			})();
		});
	}

	/**
	 * Unsubscribe from settings changes.
	 * Should be called when the manager is being destroyed.
	 */
	unsubscribe(): void {
		if (this.changeEventRef) {
			this.changeEventRef.unsubscribe();
			this.changeEventRef = null;
		}
	}
}
