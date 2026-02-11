import { App, Notice, PluginSettingTab, Plugin, Setting } from "obsidian";
import { SettingsStore } from "./settings-store";
import { ToolSource } from "../mcp/tools/registry";
import { ExampleManager } from "../mcp/tools/scripting/example-manager";
import { BridgeController } from "../plugin/bridge-controller";
import { ToolingManager } from "../plugin/tooling-manager";
import { EventRef } from "./setting-store-base";

const TIMER_DELAY = 2000;

export class MCPSettingTab extends PluginSettingTab {
	private settingsStore: SettingsStore;
	private bridgeController: BridgeController;
	private toolingManager: ToolingManager;
	private exampleManager: ExampleManager | null;
	private displayTimer: number | null = null;
	private changeEventRef: EventRef | null = null;

	constructor(
		app: App,
		plugin: Plugin,
		settingsStore: SettingsStore,
		bridgeController: BridgeController,
		toolingManager: ToolingManager,
		exampleManager: ExampleManager | null,
	) {
		super(app, plugin);
		this.settingsStore = settingsStore;
		this.bridgeController = bridgeController;
		this.toolingManager = toolingManager;
		this.exampleManager = exampleManager;

		// Subscribe to settings changes for automatic UI updates
		this.changeEventRef = this.settingsStore.on("change", () => {
			this.scheduleDisplay();
		});
	}

	/**
	 * Clean up event listeners when the tab is hidden/closed.
	 */
	hide(): void {
		if (this.changeEventRef) {
			this.changeEventRef.unsubscribe();
			this.changeEventRef = null;
		}
	}

	/**
	 * Schedules a delayed UI redraw to avoid excessive re-rendering during rapid input
	 */
	private scheduleDisplay(): void {
		if (this.displayTimer !== null) {
			clearTimeout(this.displayTimer);
		}
		this.displayTimer = window.setTimeout(() => {
			this.display();
			this.displayTimer = null;
		}, TIMER_DELAY);
	}

	private maskApiKey(apiKey: string): string {
		if (apiKey.length <= 8) {
			return "*".repeat(apiKey.length);
		}
		return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl).setName("Server").setHeading();

		const settings = this.settingsStore.getSettings();

		// Warning notice
		const warningEl = containerEl.createEl("div", {
			cls: "mod-warning mcp-settings-warning",
		});
		warningEl.createEl("p", {
			text: "Warning: desktop only. This plugin does not work on mobile.",
			cls: "mcp-settings-warning-title",
		});
		const bindWarningText = settings.bindHost === "0.0.0.0"
			? "Warning: the server binds to all network interfaces (0.0.0.0). It is accessible from other devices on your network."
			: "Warning: the server binds to localhost only (127.0.0.1).";
		warningEl.createEl("p", {
			text: bindWarningText,
			cls: "mcp-settings-warning-body",
		});

		// Server status indicator
		const statusSetting = new Setting(containerEl)
			.setName("Server status")
			.setDesc("");

		const updateServerStatus = () => {
			const isRunning = this.bridgeController.isRunning();
			const needsRestart = this.bridgeController.needsRestart();
			const runningSettings = this.bridgeController.getRunningSettings();
			const runningPort = runningSettings?.port ?? null;
			const runningBindHost = runningSettings?.bindHost ?? null;

			let statusText = isRunning
				? `🟢 Running on ${runningBindHost ?? settings.bindHost}:${runningPort ?? settings.port}`
				: "🔴 Stopped";

			if (needsRestart) {
				statusText += " ⚠️ Settings changed - restart required";
			}

			statusSetting.setDesc(statusText);
		};
		updateServerStatus();

		new Setting(containerEl)
			.setName("Auto-start server")
			.setDesc("Automatically start the server when Obsidian launches")
			.addToggle((toggle) =>
				toggle
					.setValue(settings.autoStart)
					.onChange(async (value) => {
						await this.settingsStore.updateSetting("autoStart", value);
					}),
			);

		new Setting(containerEl)
			.setName("Bind address")
			.setDesc("The network address to bind to (requires restart)")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("127.0.0.1", "127.0.0.1 (localhost only)")
					.addOption("0.0.0.0", "0.0.0.0 (all interfaces)")
					.setValue(settings.bindHost)
					.onChange(async (value) => {
						await this.settingsStore.updateSetting("bindHost", value);
					}),
			);


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
			.setName("Server control")
			.setDesc("Start, stop, or restart the server")
			.addButton((button) =>
				button
					.setButtonText("Start")
					.onClick(async () => {
						await this.bridgeController.start();
						updateServerStatus();
					}),
			)
			.addButton((button) =>
				button
					.setButtonText("Stop")
					.onClick(async () => {
						await this.bridgeController.stop();
						updateServerStatus();
					}),
			)
			.addButton((button) =>
				button.setButtonText("Restart").onClick(async () => {
					await this.bridgeController.restart();
					updateServerStatus();
				}),
			);

		new Setting(containerEl).setName("Mcp authentication").setHeading();

		containerEl.createEl("p", {
			text: "Mcp standard (/mcp) requires an API key.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("Issue an API key")
			.setDesc("Generate a new key for stdio bridge. Save the key securely; it is not recoverable if lost.")
			.addButton((button) =>
				button.setButtonText("Generate").onClick(async () => {
					const issuedKey = await this.settingsStore.issueMcpApiKey();
					navigator.clipboard
						.writeText(issuedKey)
						.then(() => {
							new Notice("A new mcp API key was issued and copied to clipboard");
						})
						.catch(() => {
							new Notice(`A new mcp API key was issued: ${issuedKey}`);
						});
					this.display();
				}),
			);

		const mcpApiKeys = this.settingsStore.getMcpApiKeys();
		if (mcpApiKeys.length === 0) {
			containerEl.createEl("p", {
				text: "No mcp API keys have been issued yet. /mcp requests are rejected until a key is created.",
				cls: "setting-item-description",
			});
		} else {
			for (const apiKey of mcpApiKeys) {
				new Setting(containerEl)
					.setName(this.maskApiKey(apiKey))
					.setDesc("Use this value as the API key environment variable in the stdio bridge")
					.addButton((button) =>
						button.setButtonText("Revoke").setWarning().onClick(async () => {
							await this.settingsStore.revokeMcpApiKey(apiKey);
							this.display();
						}),
					);
			}
		}

		new Setting(containerEl).setName("Script tools").setHeading();

		new Setting(containerEl)
			.setName("Script folder")
			.setDesc(
				"Relative to the vault root. Scripts reload automatically after changes.",
			)
			.addText((text) =>
				text
					.setPlaceholder("Script tools (mcp-tools)")
					.setValue(settings.scriptsPath)
					.onChange(async (value) => {
						await this.settingsStore.updateSetting("scriptsPath", value);
						this.scheduleDisplay();
					}),
			);

		new Setting(containerEl)
			.setName("Reload scripts")
			.setDesc("Reload all scripts from the configured folder")
			.addButton((button) =>
				button.setButtonText("Reload").onClick(async () => {
					try {
						await this.toolingManager.reloadScripts();
						new Notice("Scripts reloaded");
					} catch (error) {
						console.error("[Bridge] Failed to reload scripts:", error);
						new Notice("Failed to reload scripts");
					}
					this.display();
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

		const tools = this.toolingManager.getRegisteredTools().sort((a, b) =>
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
			(tool) => this.toolingManager.getToolSource(tool.name) === ToolSource.Builtin,
		);
		const scriptTools = tools.filter(
			(tool) => this.toolingManager.getToolSource(tool.name) === ToolSource.Script,
		);
		const unknownTools = tools.filter(
			(tool) => this.toolingManager.getToolSource(tool.name) === ToolSource.Unknown,
		);

		const renderToolToggle = (toolName: string, description: string) => {
			new Setting(containerEl)
				.setName(toolName)
				.setDesc(description)
				.addToggle((toggle) => {
					toggle.setValue(this.toolingManager.isToolEnabled(toolName));
					toggle.onChange(async (value) => {
						await this.settingsStore.setToolEnabled(toolName, value);
					});
				});

			new Setting(containerEl)
				.setName(`${toolName} (Search index)`)
				.setDesc("Include this tool in built-in tool search results")
				.addToggle((toggle) => {
					toggle.setValue(this.toolingManager.isToolIncludedInSearch(toolName));
					toggle.onChange(async (value) => {
						await this.settingsStore.setToolIncludedInSearch(toolName, value);
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
