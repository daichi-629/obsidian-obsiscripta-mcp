import { Plugin } from "obsidian";
import { MCPPluginSettings, DEFAULT_SETTINGS } from "./types";
import { ScriptLoader } from "../mcp/tools/scripting/script-loader";

/**
 * SettingsStore handles settings persistence and normalization.
 * It wraps loadData/saveData and provides change notifications.
 */
export class SettingsStore {
	private settings: MCPPluginSettings;
	private plugin: Plugin;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
		this.settings = { ...DEFAULT_SETTINGS };
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
	 * Update the scriptsPath setting with normalization.
	 */
	async updateScriptsPath(scriptsPath: string): Promise<string> {
		const normalizedPath = ScriptLoader.normalizeScriptsPath(scriptsPath);
		this.settings.scriptsPath = normalizedPath;
		await this.save();
		return normalizedPath;
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
}
