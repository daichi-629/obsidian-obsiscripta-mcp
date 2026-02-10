import { Notice, Platform, Plugin } from "obsidian";
import {
	MCPPluginSettings,
	SettingsStore,
	MCPSettingTab,
} from "./settings";
import { ToolingManager } from "./plugin/tooling-manager";
import { BridgeController } from "./plugin/bridge-controller";

export default class MCPPlugin extends Plugin {
	settings: MCPPluginSettings;
	private settingsStore: SettingsStore;
	private toolingManager: ToolingManager;
	private bridgeController: BridgeController;

	async onload() {
		if (!Platform.isDesktopApp) {
			new Notice("This plugin is desktop-only.");
			return;
		}

		// Initialize settings store and load settings
		this.settingsStore = new SettingsStore(this);
		await this.settingsStore.load();
		this.settings = this.settingsStore.getSettings() as MCPPluginSettings;

		// Calculate example source path for ExampleManager
		const exampleSourcePath = this.getExampleSourcePath();

		this.toolingManager = new ToolingManager(
			this.app.vault,
			this.app,
			this,
			this.settings,
			this,
			exampleSourcePath,
			this.settings.disabledTools,
		);
		await this.toolingManager.start();

		this.bridgeController = new BridgeController(
			this.app,
			this.app.vault,
			{
				autoStart: this.settings.autoStart,
				port: this.settings.port,
				bindHost: this.settings.bindHost,
				enableBridgeV1: this.settings.enableBridgeV1,
				mcpApiKeys: [...this.settings.mcpApiKeys],
			},
			this.toolingManager.registry,
		);
		await this.bridgeController.startIfEnabled();

		// Inject services into settings store
		this.settingsStore.setServices(
			this.toolingManager,
			this.bridgeController,
		);

		// Add settings tab with dependency injection
		this.addSettingTab(
			new MCPSettingTab(
				this.app,
				this,
				this.settingsStore,
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
				void this.settingsStore.restartServer();
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
		if (this.toolingManager) {
			await this.toolingManager.stop();
		}
		if (this.bridgeController) {
			await this.bridgeController.stop();
			console.debug("[Bridge] Server stopped on plugin unload");
		}
	}

	/**
	 * Calculate the path to the example script source file.
	 * Returns the full path or empty string if unavailable.
	 */
	private getExampleSourcePath(): string {
		const configDir = this.app.vault.configDir;
		if (!configDir) {
			return "";
		}
		const pluginId = this.manifest?.id;
		if (!pluginId) {
			return "";
		}
		return `${configDir}/plugins/${pluginId}/examples/example-tool.js`;
	}
}
