import { Notice } from "obsidian";
import { SettingTabServices } from "../settings/setting-tab";
import { ToolingManager } from "./tooling-manager";
import { BridgeController } from "./bridge-controller";
import { SettingsStore } from "../settings/settings-store";
import { MCPToolDefinition } from "../mcp/tools/types";
import { ToolSource } from "../mcp/tools/registry";

/**
 * Facade service layer that coordinates between ToolingManager, BridgeController,
 * and SettingsStore. Provides a unified API for the settings UI while maintaining
 * state synchronization between the tool registry and persistent settings.
 */
export class PluginServices implements SettingTabServices {
	constructor(
		private toolingManager: ToolingManager,
		private bridgeController: BridgeController,
		private settingsStore: SettingsStore,
	) {}

	async updateScriptsPath(scriptsPath: string): Promise<void> {
		try {
			const normalizedPath =
				await this.toolingManager.updateScriptsPath(scriptsPath);
			await this.settingsStore.updateScriptsPath(normalizedPath);
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
			await this.settingsStore.enableTool(name);
		} else {
			await this.settingsStore.disableTool(name);
		}
	}

	async restartServer(): Promise<void> {
		await this.bridgeController.restart();
	}

	isServerRunning(): boolean {
		return this.bridgeController.isRunning();
	}

	async startServer(): Promise<void> {
		await this.bridgeController.start();
	}

	async stopServer(): Promise<void> {
		await this.bridgeController.stop();
	}
}
