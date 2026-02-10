import { App, Vault } from "obsidian";
import type MCPPlugin from "../main";
import { MCPPluginSettings } from "../settings";
import { MCPToolDefinition } from "../mcp/tools/types";
import { ToolRegistry, ToolSource } from "../mcp/tools/registry";
import { getBuiltinNoteTools } from "../mcp/tools/builtin/notes";
import { getBuiltinEditTools } from "../mcp/tools/builtin/edit";
import {
	ScriptLoader,
	ScriptRegistry,
} from "@obsiscripta/obsidian-script-loader";
import { createObsidianContextConfig } from "../mcp/tools/scripting/context-config";
import { isToolDefinitionLike, validateAndConvertScriptExports } from "../mcp/tools/scripting/script-validator";
import { ExampleManager } from "../mcp/tools/scripting/example-manager";
import { EventRegistrar, ScriptExecutionContext } from "./context";

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
		for (const tool of getBuiltinEditTools()) {
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
						console.debug(`[Bridge] Ignoring non-tool script file: ${metadata.path}`);
						return;
					}

					try {
						// Validate and convert script exports to MCP tool definition
						const tool = validateAndConvertScriptExports(exports, metadata.path, metadata.name);
						this.registry.register(tool, ToolSource.Script);
					} catch (error) {
						console.error(`[Bridge] Invalid script exports in ${metadata.path}:`, error);
					}
				},
				onScriptUnloaded: (metadata) => {
					// Unregister tool when script is unloaded
					this.registry.unregister(metadata.name);
				},
				onScriptError: (path, error) => {
					console.error(`[Bridge] Script error in ${path}:`, error);
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
}
