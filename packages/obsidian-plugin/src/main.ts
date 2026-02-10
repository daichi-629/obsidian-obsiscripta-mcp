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

		// Initialize settings store with Obsidian persistence layer
		this.settingsStore = new SettingsStore({
			load: async () => (await this.loadData()) as Partial<MCPPluginSettings>,
			save: async (settings) => await this.saveData(settings),
		});
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

		// Subscribe to settings changes to update services
		this.settingsStore.on("change", (oldSettings, newSettings) => {
			void (async () => {
			// Check if API keys changed (order-insensitive comparison)
			const apiKeysChanged =
				oldSettings.mcpApiKeys.length !== newSettings.mcpApiKeys.length ||
				!oldSettings.mcpApiKeys.every((key) => newSettings.mcpApiKeys.includes(key));

			// Update BridgeController if bridge-related settings changed
			const bridgeSettingsChanged =
				oldSettings.port !== newSettings.port ||
				oldSettings.bindHost !== newSettings.bindHost ||
				oldSettings.autoStart !== newSettings.autoStart ||
				apiKeysChanged;

			if (bridgeSettingsChanged) {
				this.bridgeController.updateSettings({
					port: newSettings.port,
					bindHost: newSettings.bindHost,
					autoStart: newSettings.autoStart,
					mcpApiKeys: [...newSettings.mcpApiKeys],
				});
			}

			// Update ToolingManager if scriptsPath changed
			if (oldSettings.scriptsPath !== newSettings.scriptsPath) {
				try {
					await this.toolingManager.updateScriptsPath(newSettings.scriptsPath);
					console.debug(`[Bridge] Scripts path updated to: ${newSettings.scriptsPath}`);
				} catch (error) {
					console.error("[Bridge] Failed to update scripts path:", error);
					new Notice("Failed to update scripts folder");
				}
			}

			// Update ToolingManager if disabledTools changed
			const oldDisabled = new Set(oldSettings.disabledTools);
			const newDisabled = new Set(newSettings.disabledTools);

			// Tools newly disabled
			for (const tool of newDisabled) {
				if (!oldDisabled.has(tool)) {
					this.toolingManager.setToolEnabled(tool, false);
				}
			}

			// Tools newly enabled
			for (const tool of oldDisabled) {
				if (!newDisabled.has(tool)) {
					this.toolingManager.setToolEnabled(tool, true);
				}
			}
			})();
		});

		// Add settings tab with dependency injection
		this.addSettingTab(
			new MCPSettingTab(
				this.app,
				this,
				this.settingsStore,
				this.bridgeController,
				this.toolingManager,
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
				void this.bridgeController.restart();
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
