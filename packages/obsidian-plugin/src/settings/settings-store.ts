import { MCPPluginSettings, DEFAULT_SETTINGS } from "./types";
import { ScriptLoader } from "@obsiscripta/obsidian-script-loader";
import { SettingStoreBase } from "./setting-store-base";

/**
 * Persistence layer interface for settings.
 * Implementations provide framework-specific storage (e.g., Obsidian Plugin.loadData/saveData).
 */
export interface SettingsPersistence {
	load(): Promise<Partial<MCPPluginSettings>>;
	save(settings: MCPPluginSettings): Promise<void>;
}

/**
 * SettingsStore handles settings normalization and domain logic.
 * It is framework-agnostic and uses dependency injection for persistence.
 * Components can subscribe to setting changes via the event system.
 */
export class SettingsStore extends SettingStoreBase<MCPPluginSettings> {
	private persistence: SettingsPersistence;

	constructor(persistence: SettingsPersistence) {
		super(DEFAULT_SETTINGS);
		this.persistence = persistence;

		// Auto-save on setting changes with error handling
		this.on("change", () => {
			void (async () => {
				try {
					await this.persistence.save(this.settings);
				} catch (error) {
					console.error("[SettingsStore] Failed to save settings:", error);
					// Note: We don't throw here to avoid breaking the event chain
				}
			})();
		});

		// Register normalizers
		this.registerNormalizer("scriptsPath", {
			normalize: (value) => ScriptLoader.normalizeScriptsPath(value as string) as MCPPluginSettings[keyof MCPPluginSettings],
		});
	}

	/**
	 * Load settings from persistence layer and normalize them.
	 * Overrides base class to add normalization logic.
	 */
	override async load(data?: Partial<MCPPluginSettings>): Promise<void> {
		// Load from persistence layer if data not provided
		const loadedData = data ?? await this.persistence.load();

		// Call parent load to merge with defaults
		await super.load(loadedData);

		// Normalize disabledTools array
		this.settings.disabledTools = Array.isArray(this.settings.disabledTools)
			? Array.from(new Set(this.settings.disabledTools))
			: [];

		// Normalize auth key list
		this.settings.mcpApiKeys = Array.isArray(this.settings.mcpApiKeys)
			? Array.from(new Set(this.settings.mcpApiKeys.filter((key) => typeof key === "string" && key.trim().length > 0)))
			: [];

		// Normalize toolsExcludedFromSearch array
		this.settings.toolsExcludedFromSearch = Array.isArray(this.settings.toolsExcludedFromSearch)
			? Array.from(new Set(this.settings.toolsExcludedFromSearch))
			: [];

		// Normalize scriptsPath
		const normalizedPath = ScriptLoader.normalizeScriptsPath(
			this.settings.scriptsPath,
		);
		if (normalizedPath !== this.settings.scriptsPath) {
			const oldSettings = { ...this.settings };
			this.settings.scriptsPath = normalizedPath;
			// Manually notify change since we're bypassing updateSetting
			this.notifyChange(oldSettings, this.settings);
		}
	}

	private generateMcpApiKey(): string {
		const bytes = new Uint8Array(24);
		crypto.getRandomValues(bytes);
		let binary = "";
		for (const b of bytes) {
			binary += String.fromCharCode(b);
		}
		const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
		return `obsi_${encoded}`;
	}

	getMcpApiKeys(): readonly string[] {
		return this.settings.mcpApiKeys;
	}

	async issueMcpApiKey(): Promise<string> {
		const key = this.generateMcpApiKey();
		await this.addToArraySetting("mcpApiKeys", key);
		return key;
	}

	async revokeMcpApiKey(key: string): Promise<void> {
		await this.removeFromArraySetting("mcpApiKeys", key);
	}

	/**
	 * Enable or disable a tool by updating disabledTools setting.
	 * ToolingManager is automatically notified via change event.
	 */
	async setToolEnabled(name: string, enabled: boolean): Promise<void> {
		if (enabled) {
			await this.removeFromArraySetting("disabledTools", name);
		} else {
			await this.addToArraySetting("disabledTools", name);
		}
	}

	/**
	 * Include or exclude a tool from tool search results.
	 */
	async setToolIncludedInSearch(name: string, included: boolean): Promise<void> {
		if (included) {
			await this.removeFromArraySetting("toolsExcludedFromSearch", name);
		} else {
			await this.addToArraySetting("toolsExcludedFromSearch", name);
		}
	}
}
