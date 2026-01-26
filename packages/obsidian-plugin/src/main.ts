import { Notice, Platform, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, MCPPluginSettings, MCPSettingTab } from "./settings";
import { MCPToolDefinition } from "./mcp/tools/types";
import { ScriptLoader } from "./mcp/tools/scripting/script-loader";
import { ToolingManager } from "./plugin/tooling-manager";
import { BridgeController } from "./plugin/bridge-controller";
import { ToolSource } from "./mcp/tools/registry";

export default class MCPPlugin extends Plugin {
	settings: MCPPluginSettings;
	private toolingManager: ToolingManager;
	private bridgeController: BridgeController;

	async onload() {
		if (!Platform.isDesktopApp) {
			new Notice("This plugin is desktop-only.");
			return;
		}

		await this.loadSettings();

		this.toolingManager = new ToolingManager(
			this,
			this.settings.disabledTools,
		);
		await this.toolingManager.start();

		this.bridgeController = new BridgeController(
			this,
			this.toolingManager.registry,
		);
		await this.bridgeController.startIfEnabled();

		// Add settings tab
		this.addSettingTab(
			new MCPSettingTab(
				this.app,
				this,
				this.toolingManager.getExampleManager(),
			),
		);

		// Add ribbon icon for server status
		this.addRibbonIcon("server", "Server status", () => {
			if (this.bridgeController.isRunning()) {
				new Notice(`Server running on port ${this.settings.port}`);
			} else {
				new Notice("Server is not running");
			}
		});

		// Add command to restart server
		this.addCommand({
			id: "restart-server",
			name: "Restart server",
			callback: () => {
				void this.restartServer();
			},
		});

		console.debug(
			`[Bridge] Plugin loaded. Tools registered: ${this.toolingManager.registry.size}`,
		);
	}

	onunload(): void {
		void this.handleUnload();
	}

	private async handleUnload(): Promise<void> {
		this.toolingManager?.stop();
		if (this.bridgeController) {
			await this.bridgeController.stop();
			console.debug("[Bridge] Server stopped on plugin unload");
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<MCPPluginSettings>,
		);
		this.settings.disabledTools = Array.isArray(this.settings.disabledTools)
			? Array.from(new Set(this.settings.disabledTools))
			: [];
		const normalizedPath = ScriptLoader.normalizeScriptsPath(
			this.settings.scriptsPath,
		);
		if (normalizedPath !== this.settings.scriptsPath) {
			this.settings.scriptsPath = normalizedPath;
			await this.saveSettings();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async updateScriptsPath(scriptsPath: string): Promise<void> {
		try {
			this.settings.scriptsPath =
				await this.toolingManager.updateScriptsPath(scriptsPath);
			await this.saveSettings();
		} catch (error) {
			console.error("[Bridge] Failed to update scripts path:", error);
			new Notice(
				"Failed to update scripts folder. Using the default path.",
			);
		}
	}

	async reloadScripts(): Promise<void> {
		try {
			await this.toolingManager.reloadScripts();
			new Notice("Scripts reloaded");
		} catch (error) {
			console.error("[Bridge] Failed to reload scripts:", error);
			new Notice("Failed to reload scripts");
		}
	}

	getRegisteredTools(): MCPToolDefinition[] {
		return this.toolingManager.getRegisteredTools();
	}

	isToolEnabled(name: string): boolean {
		return this.toolingManager.isToolEnabled(name);
	}

	getToolSource(name: string): ToolSource {
		return this.toolingManager.getToolSource(name);
	}

	async setToolEnabled(name: string, enabled: boolean): Promise<void> {
		this.toolingManager.setToolEnabled(name, enabled);
		if (enabled) {
			this.settings.disabledTools = this.settings.disabledTools.filter(
				(toolName) => toolName !== name,
			);
		} else if (!this.settings.disabledTools.includes(name)) {
			this.settings.disabledTools = [...this.settings.disabledTools, name];
		}
		await this.saveSettings();
	}

	/**
	 * Restart the bridge server (useful after settings change)
	 */
	async restartServer(): Promise<void> {
		await this.bridgeController.restart();
	}
}
