import MCPPlugin from "../main";
import { MCPToolDefinition } from "../mcp/tools/types";
import { ToolRegistry, ToolSource } from "../mcp/tools/registry";
import { getBuiltinNoteTools } from "../mcp/tools/builtin/notes";
import { ScriptLoader } from "../mcp/tools/scripting/script-loader";
import { ExampleManager } from "../mcp/tools/scripting/example-manager";

// Coordinates built-in and script tool lifecycle + registry state.
export class ToolingManager {
	private plugin: MCPPlugin;
	readonly registry: ToolRegistry;
	private scriptLoader: ScriptLoader | null = null;
	private exampleManager: ExampleManager | null = null;

	constructor(plugin: MCPPlugin, disabledTools: string[]) {
		this.plugin = plugin;
		this.registry = new ToolRegistry(disabledTools);
	}

	async start(): Promise<void> {
		for (const tool of getBuiltinNoteTools()) {
			this.registry.register(tool, ToolSource.Builtin);
		}

		const vault = this.plugin.app.vault;
		const toolContext = {
			vault: this.plugin.app.vault,
			app: this.plugin.app,
			plugin: this.plugin
		};
		const scriptsPath = this.plugin.settings?.scriptsPath ?? "";

		this.scriptLoader = new ScriptLoader(
			vault,
			toolContext,
			this.plugin,
			scriptsPath,
			this.registry
		);
		this.exampleManager = new ExampleManager(
			this.plugin,
			this.scriptLoader.getScriptsPathValue(),
		);
		try {
			await this.scriptLoader.start();
		} catch (error) {
			console.error("[Bridge] Failed to start script loader:", error);
		}
	}

	stop(): void {
		if (this.scriptLoader) {
			this.scriptLoader.stop();
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

		if (normalizedPath !== this.scriptLoader.getScriptsPathValue()) {
			await this.scriptLoader.updateScriptsPath(normalizedPath);
		}
		const resolvedPath = this.scriptLoader.getScriptsPathValue();
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
