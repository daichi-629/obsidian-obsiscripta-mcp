import { App, PluginSettingTab, Plugin, Setting } from "obsidian";
import { MCPPluginSettings } from "./types";
import { SettingsStore } from "./settings-store";
import { ToolSource } from "../mcp/tools/registry";
import { ExampleManager } from "../mcp/tools/scripting/example-manager";
import { MCPToolDefinition } from "../mcp/tools/types";

/**
 * Interface for plugin services needed by the settings tab.
 * This decouples the settings UI from the main plugin class.
 */
export interface SettingTabServices {
	updateScriptsPath(scriptsPath: string): Promise<void>;
	reloadScripts(): Promise<void>;
	getRegisteredTools(): MCPToolDefinition[];
	isToolEnabled(name: string): boolean;
	getToolSource(name: string): ToolSource;
	setToolEnabled(name: string, enabled: boolean): Promise<void>;
	restartServer(): Promise<void>;
}

export class MCPSettingTab extends PluginSettingTab {
	private settingsStore: SettingsStore;
	private services: SettingTabServices;
	private exampleManager: ExampleManager | null;

	constructor(
		app: App,
		plugin: Plugin,
		settingsStore: SettingsStore,
		services: SettingTabServices,
		exampleManager: ExampleManager | null,
	) {
		super(app, plugin);
		this.settingsStore = settingsStore;
		this.services = services;
		this.exampleManager = exampleManager;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl).setName("Server").setHeading();

		// Warning notice
		const warningEl = containerEl.createEl("div", {
			cls: "mod-warning mcp-settings-warning",
		});
		warningEl.createEl("p", {
			text: "Warning: desktop only. This plugin does not work on mobile.",
			cls: "mcp-settings-warning-title",
		});
		warningEl.createEl("p", {
			text: "Warning: the server binds to localhost only (127.0.0.1). No authentication is required.",
			cls: "mcp-settings-warning-body",
		});

		const settings = this.settingsStore.getSettings();

		new Setting(containerEl)
			.setName("Port")
			.setDesc("The port number for the server (requires restart)")
			.addText((text) =>
				text
					.setPlaceholder("3000")
					.setValue(String(settings.port))
					.onChange(async (value) => {
						const port = parseInt(value, 10);
						if (!isNaN(port) && port > 0 && port < 65536) {
							await this.settingsStore.updateSetting("port", port);
						}
					}),
			);

		new Setting(containerEl)
			.setName("Restart server")
			.setDesc("Restart the server to apply port changes")
			.addButton((button) =>
				button.setButtonText("Restart").onClick(async () => {
					await this.services.restartServer();
				}),
			);

		new Setting(containerEl).setName("Script tools").setHeading();

		let scriptsPathTimer: number | null = null;
		new Setting(containerEl)
			.setName("Script folder")
			.setDesc(
				"Relative to the vault root. Scripts reload automatically after changes.",
			)
			.addText((text) =>
				text
					.setPlaceholder("Script tools (mcp-tools)")
					.setValue(settings.scriptsPath)
					.onChange((value) => {
						if (scriptsPathTimer !== null) {
							clearTimeout(scriptsPathTimer);
						}
						scriptsPathTimer = window.setTimeout(() => {
							void this.services.updateScriptsPath(value);
							scriptsPathTimer = null;
						}, 400);
					}),
			);

		new Setting(containerEl)
			.setName("Reload scripts")
			.setDesc("Reload all scripts from the configured folder")
			.addButton((button) =>
				button.setButtonText("Reload").onClick(async () => {
					await this.services.reloadScripts();
				}),
			);

		new Setting(containerEl)
			.setName("Example script")
			.setDesc("Copy the bundled example tool into the script folder")
			.addButton((button) =>
				button
					.setButtonText("Copy")
					.setDisabled(!this.exampleManager)
					.onClick(async () => {
						if (!this.exampleManager) {
							return;
						}
						await this.exampleManager.copyExampleToScripts();
					}),
			);

		new Setting(containerEl).setName("Tools").setHeading();

		const tools = this.services.getRegisteredTools().sort((a, b) =>
			a.name.localeCompare(b.name),
		);

		if (tools.length === 0) {
			containerEl.createEl("p", {
				text: "No tools registered.",
				cls: "setting-item-description",
			});
			return;
		}

		const builtinTools = tools.filter(
			(tool) => this.services.getToolSource(tool.name) === ToolSource.Builtin,
		);
		const scriptTools = tools.filter(
			(tool) => this.services.getToolSource(tool.name) === ToolSource.Script,
		);
		const unknownTools = tools.filter(
			(tool) => this.services.getToolSource(tool.name) === ToolSource.Unknown,
		);

		const renderToolToggle = (toolName: string, description: string) => {
			new Setting(containerEl)
				.setName(toolName)
				.setDesc(description)
				.addToggle((toggle) => {
					toggle.setValue(this.services.isToolEnabled(toolName));
					toggle.onChange(async (value) => {
						await this.services.setToolEnabled(toolName, value);
					});
				});
		};

		new Setting(containerEl).setName("Built-in tools").setHeading();
		if (builtinTools.length === 0) {
			containerEl.createEl("p", {
				text: "No built-in tools registered.",
				cls: "setting-item-description",
			});
		} else {
			for (const tool of builtinTools) {
				renderToolToggle(tool.name, tool.description);
			}
		}

		new Setting(containerEl).setName("Script tools").setHeading();
		if (scriptTools.length === 0) {
			containerEl.createEl("p", {
				text: "No script tools registered.",
				cls: "setting-item-description",
			});
		} else {
			for (const tool of scriptTools) {
				renderToolToggle(tool.name, tool.description);
			}
		}

		if (unknownTools.length > 0) {
			new Setting(containerEl).setName("Other tools").setHeading();
			for (const tool of unknownTools) {
				renderToolToggle(tool.name, tool.description);
			}
		}
	}
}
