import { Notice, Platform, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, MCPPluginSettings, MCPSettingTab } from "./settings";
import { BridgeServer } from "./mcp/server";
import { ToolRegistry } from "./mcp/tools/registry";
import { getBuiltinNoteTools } from "./mcp/tools/builtin/notes";
import { ScriptLoader } from "./mcp/tools/scripting/script-loader";
import { ExampleManager } from "./mcp/tools/scripting/example-manager";

export default class MCPPlugin extends Plugin {
	settings: MCPPluginSettings;
	private mcpServer: BridgeServer | null = null;
	private toolRegistry: ToolRegistry;
	private scriptLoader: ScriptLoader | null = null;
	private exampleManager: ExampleManager | null = null;

	async onload() {
		if (!Platform.isDesktopApp) {
			new Notice("This plugin is desktop-only.");
			return;
		}

		await this.loadSettings();

		// Initialize tool registry
		this.toolRegistry = new ToolRegistry();

		// Register built-in tools
		for (const tool of getBuiltinNoteTools()) {
			this.toolRegistry.register(tool);
		}

		// Load custom script tools
		this.scriptLoader = new ScriptLoader(this, this.toolRegistry);
		this.exampleManager = new ExampleManager(
			this,
			this.scriptLoader.getScriptsPathValue(),
		);
		try {
			await this.scriptLoader.start();
		} catch (error) {
			console.error("[Bridge] Failed to start script loader:", error);
		}

		// Initialize and start bridge server (if enabled)
		if (this.settings.autoStart) {
			this.mcpServer = new BridgeServer(
				this,
				this.toolRegistry,
				this.settings.port,
			);
			try {
				await this.mcpServer.start();
				new Notice(
					`Bridge server started on port ${this.settings.port}`,
				);
			} catch (error) {
				console.error("[Bridge] Failed to start server:", error);
				new Notice(
					`Failed to start bridge server: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		// Add settings tab
		this.addSettingTab(
			new MCPSettingTab(this.app, this, this.exampleManager),
		);

		// Add ribbon icon for server status
		this.addRibbonIcon("server", "Server status", () => {
			if (this.mcpServer?.isRunning()) {
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
				void this.restartServer();
			},
		});

		console.debug(
			`[Bridge] Plugin loaded. Tools registered: ${this.toolRegistry.size}`,
		);
	}

	onunload(): void {
		void this.handleUnload();
	}

	private async handleUnload(): Promise<void> {
		if (this.scriptLoader) {
			this.scriptLoader.stop();
			this.scriptLoader = null;
		}
		this.exampleManager = null;

		if (this.mcpServer) {
			await this.mcpServer.stop();
			console.debug("[Bridge] Server stopped on plugin unload");
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<MCPPluginSettings>,
		);
		const normalizedPath = ScriptLoader.normalizeScriptsPath(
			this.settings.scriptsPath,
		);
		if (normalizedPath !== this.settings.scriptsPath) {
			this.settings.scriptsPath = normalizedPath;
			await this.saveSettings();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async updateScriptsPath(scriptsPath: string): Promise<void> {
		const normalizedPath = ScriptLoader.normalizeScriptsPath(scriptsPath);
		if (!this.scriptLoader) {
			this.settings.scriptsPath = normalizedPath;
			await this.saveSettings();
			return;
		}

		try {
			if (normalizedPath !== this.scriptLoader.getScriptsPathValue()) {
				await this.scriptLoader.updateScriptsPath(normalizedPath);
			}
			this.settings.scriptsPath = this.scriptLoader.getScriptsPathValue();
			await this.saveSettings();
			this.exampleManager?.setScriptsPath(this.settings.scriptsPath);
		} catch (error) {
			console.error("[Bridge] Failed to update scripts path:", error);
			new Notice(
				"Failed to update scripts folder. Using the default path.",
			);
		}
	}

	async reloadScripts(): Promise<void> {
		if (!this.scriptLoader) {
			new Notice("Script loader is not available");
			return;
		}
		try {
			await this.scriptLoader.reloadScripts();
			new Notice("Scripts reloaded");
		} catch (error) {
			console.error("[Bridge] Failed to reload scripts:", error);
			new Notice("Failed to reload scripts");
		}
	}

	/**
	 * Restart the bridge server (useful after settings change)
	 */
	async restartServer(): Promise<void> {
		if (this.mcpServer) {
			await this.mcpServer.stop();
		}

		this.mcpServer = new BridgeServer(
			this,
			this.toolRegistry,
			this.settings.port,
		);

		try {
			await this.mcpServer.start();
			new Notice(`Bridge server restarted on port ${this.settings.port}`);
		} catch (error) {
			console.error("[Bridge] Failed to restart server:", error);
			new Notice(
				`Failed to restart bridge server: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}
