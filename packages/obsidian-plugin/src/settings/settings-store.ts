import { Notice, Plugin } from "obsidian";
import { MCPPluginSettings, DEFAULT_SETTINGS } from "./types";
import { ScriptLoader } from "@obsiscripta/obsidian-script-loader";
import { SettingTabServices } from "./setting-tab";
import { ToolingManager } from "../plugin/tooling-manager";
import { BridgeController } from "../plugin/bridge-controller";
import { MCPToolDefinition } from "../mcp/tools/types";
import { ToolSource } from "../mcp/tools/registry";

/**
 * SettingsStore handles settings persistence and normalization.
 * It wraps loadData/saveData and provides change notifications.
 * It also acts as a facade for the settings UI, delegating to ToolingManager
 * and BridgeController as needed.
 */
export class SettingsStore implements SettingTabServices {
	private settings: MCPPluginSettings;
	private plugin: Plugin;
	private toolingManager?: ToolingManager;
	private bridgeController?: BridgeController;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
		this.settings = { ...DEFAULT_SETTINGS };
	}

	/**
	 * Set service dependencies after initialization.
	 * Call this after ToolingManager and BridgeController are created.
	 */
	setServices(
		toolingManager: ToolingManager,
		bridgeController: BridgeController,
	): void {
		this.toolingManager = toolingManager;
		this.bridgeController = bridgeController;
	}

	/**
	 * Load settings from disk and normalize them.
	 */
	async load(): Promise<void> {
		const data = (await this.plugin.loadData()) as Partial<MCPPluginSettings>;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

		// Normalize disabledTools array
		this.settings.disabledTools = Array.isArray(this.settings.disabledTools)
			? Array.from(new Set(this.settings.disabledTools))
			: [];

		// Normalize scriptsPath
		const normalizedPath = ScriptLoader.normalizeScriptsPath(
			this.settings.scriptsPath,
		);
		if (normalizedPath !== this.settings.scriptsPath) {
			this.settings.scriptsPath = normalizedPath;
			await this.save();
		}
	}

	/**
	 * Save current settings to disk.
	 */
	async save(): Promise<void> {
		await this.plugin.saveData(this.settings);
	}

	/**
	 * Get current settings (read-only access).
	 */
	getSettings(): Readonly<MCPPluginSettings> {
		return this.settings;
	}

	/**
	 * Update a specific setting and save.
	 */
	async updateSetting<K extends keyof MCPPluginSettings>(
		key: K,
		value: MCPPluginSettings[K],
	): Promise<void> {
		this.settings[key] = value;
		await this.save();
	}

	/**
	 * Add a tool to the disabled list.
	 */
	async disableTool(toolName: string): Promise<void> {
		if (!this.settings.disabledTools.includes(toolName)) {
			this.settings.disabledTools = [...this.settings.disabledTools, toolName];
			await this.save();
		}
	}

	/**
	 * Remove a tool from the disabled list.
	 */
	async enableTool(toolName: string): Promise<void> {
		this.settings.disabledTools = this.settings.disabledTools.filter(
			(name) => name !== toolName,
		);
		await this.save();
	}

	// ========================================================================
	// SettingTabServices implementation - Facade methods
	// ========================================================================

	async updateScriptsPath(scriptsPath: string): Promise<void> {
		if (!this.toolingManager) {
			throw new Error("ToolingManager not initialized");
		}
		try {
			const normalizedPath =
				await this.toolingManager.updateScriptsPath(scriptsPath);
			// Update settings after successful manager update
			this.settings.scriptsPath = normalizedPath;
			await this.save();
		} catch (error) {
			console.error("[Bridge] Failed to update scripts path:", error);
			new Notice(
				"Failed to update scripts folder. Using the default path.",
			);
		}
	}

	async reloadScripts(): Promise<void> {
		if (!this.toolingManager) {
			throw new Error("ToolingManager not initialized");
		}
		try {
			await this.toolingManager.reloadScripts();
			new Notice("Scripts reloaded");
		} catch (error) {
			console.error("[Bridge] Failed to reload scripts:", error);
			new Notice("Failed to reload scripts");
		}
	}

	getRegisteredTools(): MCPToolDefinition[] {
		if (!this.toolingManager) {
			return [];
		}
		return this.toolingManager.getRegisteredTools();
	}

	isToolEnabled(name: string): boolean {
		if (!this.toolingManager) {
			return false;
		}
		return this.toolingManager.isToolEnabled(name);
	}

	getToolSource(name: string): ToolSource {
		if (!this.toolingManager) {
			return ToolSource.Unknown;
		}
		return this.toolingManager.getToolSource(name);
	}

	async setToolEnabled(name: string, enabled: boolean): Promise<void> {
		if (!this.toolingManager) {
			throw new Error("ToolingManager not initialized");
		}
		this.toolingManager.setToolEnabled(name, enabled);
		if (enabled) {
			await this.enableTool(name);
		} else {
			await this.disableTool(name);
		}
	}

	async restartServer(): Promise<void> {
		if (!this.bridgeController) {
			throw new Error("BridgeController not initialized");
		}
		await this.bridgeController.restart();
	}

	isServerRunning(): boolean {
		return this.bridgeController?.isRunning() ?? false;
	}

	async startServer(): Promise<void> {
		if (!this.bridgeController) {
			throw new Error("BridgeController not initialized");
		}
		await this.bridgeController.start();
	}

	async stopServer(): Promise<void> {
		if (!this.bridgeController) {
			throw new Error("BridgeController not initialized");
		}
		await this.bridgeController.stop();
	}
}
