import { App, PluginSettingTab, Setting } from "obsidian";
import MCPPlugin from "./main";
import { ExampleManager } from "./mcp/tools/scripting/example-manager";

export interface MCPPluginSettings {
	port: number;
	autoStart: boolean;
}

export const DEFAULT_SETTINGS: MCPPluginSettings = {
	port: 3000,
	autoStart: true
};

export class MCPSettingTab extends PluginSettingTab {
	plugin: MCPPlugin;
	private exampleManager: ExampleManager | null;

	constructor(app: App, plugin: MCPPlugin, exampleManager: ExampleManager | null) {
		super(app, plugin);
		this.plugin = plugin;
		this.exampleManager = exampleManager;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Server")
			.setHeading();

		// Warning notice
		const warningEl = containerEl.createEl("div", { cls: "mod-warning mcp-settings-warning" });
		warningEl.createEl("p", {
			text: "Warning: desktop only. This plugin does not work on mobile.",
			cls: "mcp-settings-warning-title"
		});
		warningEl.createEl("p", {
			text: "Warning: the server binds to localhost only (127.0.0.1). No authentication is required.",
			cls: "mcp-settings-warning-body"
		});

		new Setting(containerEl)
			.setName("Port")
			.setDesc("The port number for the server (requires restart)")
			.addText(text => text
				.setPlaceholder("3000")
				.setValue(String(this.plugin.settings.port))
				.onChange(async (value) => {
					const port = parseInt(value, 10);
					if (!isNaN(port) && port > 0 && port < 65536) {
						this.plugin.settings.port = port;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName("Restart server")
			.setDesc("Restart the server to apply port changes")
			.addButton(button => button
				.setButtonText("Restart")
				.onClick(async () => {
					await this.plugin.restartServer();
				}));

		new Setting(containerEl)
			.setName("Example script")
			.setDesc("Copy the bundled example tool into the config folder (mcp-tools/)")
			.addButton(button => button
				.setButtonText("Copy")
				.setDisabled(!this.exampleManager)
				.onClick(async () => {
					if (!this.exampleManager) {
						return;
					}
					await this.exampleManager.copyExampleToScripts();
				}));

		// Server info section
		new Setting(containerEl)
			.setName("Connection info")
			.setHeading();

		const infoEl = containerEl.createEl("div", { cls: "mcp-settings-info" });

		infoEl.createEl("p", {
			text: `Endpoint: http://127.0.0.1:${this.plugin.settings.port}/mcp`,
			cls: "mcp-settings-info-line"
		});

		infoEl.createEl("p", {
			text: "Claude desktop config:",
			cls: "mcp-settings-info-label"
		});

		const codeEl = infoEl.createEl("pre", { cls: "mcp-settings-code" });

		const configJson = {
			mcpServers: {
				obsidian: {
					url: `http://localhost:${this.plugin.settings.port}/mcp`
				}
			}
		};
		codeEl.textContent = JSON.stringify(configJson, null, 2);
	}
}
