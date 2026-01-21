import { App, PluginSettingTab, Setting } from "obsidian";
import MCPPlugin from "./main";

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

	constructor(app: App, plugin: MCPPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "MCP Server Settings" });

		// Warning notice
		const warningEl = containerEl.createEl("div", { cls: "mod-warning" });
		warningEl.style.padding = "10px";
		warningEl.style.marginBottom = "15px";
		warningEl.style.backgroundColor = "var(--background-modifier-error)";
		warningEl.style.borderRadius = "5px";
		warningEl.createEl("p", {
			text: "⚠️ Desktop only - This plugin does not work on mobile.",
			attr: { style: "margin: 0 0 5px 0; font-weight: bold;" }
		});
		warningEl.createEl("p", {
			text: "⚠️ The MCP server binds to localhost only (127.0.0.1). No authentication is required.",
			attr: { style: "margin: 0;" }
		});

		new Setting(containerEl)
			.setName("Port")
			.setDesc("The port number for the MCP server (requires restart)")
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
			.setDesc("Restart the MCP server to apply port changes")
			.addButton(button => button
				.setButtonText("Restart")
				.onClick(async () => {
					await this.plugin.restartServer();
				}));

		// Server info section
		containerEl.createEl("h3", { text: "Connection Info" });

		const infoEl = containerEl.createEl("div");
		infoEl.style.padding = "10px";
		infoEl.style.backgroundColor = "var(--background-secondary)";
		infoEl.style.borderRadius = "5px";
		infoEl.style.fontFamily = "monospace";

		infoEl.createEl("p", {
			text: `Endpoint: http://127.0.0.1:${this.plugin.settings.port}/mcp`,
			attr: { style: "margin: 0 0 10px 0;" }
		});

		infoEl.createEl("p", {
			text: "Claude Desktop config:",
			attr: { style: "margin: 0 0 5px 0; font-weight: bold;" }
		});

		const codeEl = infoEl.createEl("pre");
		codeEl.style.margin = "0";
		codeEl.style.padding = "10px";
		codeEl.style.backgroundColor = "var(--background-primary)";
		codeEl.style.borderRadius = "3px";
		codeEl.style.overflow = "auto";

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
