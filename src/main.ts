import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, MCPPluginSettings, MCPSettingTab } from "./settings";
import { MCPServer } from "./mcp/server";
import { ToolRegistry } from "./mcp/tools/registry";
import { getBuiltinNoteTools } from "./mcp/tools/builtin/notes";
import { ScriptLoader } from "./mcp/tools/scripting/script-loader";
import { ExampleManager } from "./mcp/tools/scripting/example-manager";

export default class MCPPlugin extends Plugin {
	settings: MCPPluginSettings;
	private mcpServer: MCPServer | null = null;
	private toolRegistry: ToolRegistry;
	private scriptLoader: ScriptLoader | null = null;
	private exampleManager: ExampleManager | null = null;

	async onload() {
		await this.loadSettings();

		// Initialize tool registry
		this.toolRegistry = new ToolRegistry();

		// Register built-in tools
		for (const tool of getBuiltinNoteTools()) {
			this.toolRegistry.register(tool);
		}

		// Load custom script tools
		this.scriptLoader = new ScriptLoader(this, this.toolRegistry);
		this.exampleManager = new ExampleManager(this, this.scriptLoader.getScriptsPathValue());
		try {
			await this.scriptLoader.start();
		} catch (error) {
			console.error("[MCP] Failed to start script loader:", error);
		}

		// Initialize and start MCP server
		this.mcpServer = new MCPServer(this, this.toolRegistry, this.settings.port);

		try {
			await this.mcpServer.start();
			new Notice(`MCP server started on port ${this.settings.port}`);
		} catch (error) {
			console.error("[MCP] Failed to start server:", error);
			new Notice(`Failed to start MCP server: ${error instanceof Error ? error.message : String(error)}`);
		}

		// Add settings tab
		this.addSettingTab(new MCPSettingTab(this.app, this, this.exampleManager));

		// Add ribbon icon for server status
		this.addRibbonIcon("server", "Server status", () => {
			if (this.mcpServer?.isRunning()) {
				new Notice(`Server running on port ${this.settings.port}\nActive sessions: ${this.mcpServer.getSessionCount()}`);
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
			}
		});

		console.debug(`[MCP] Plugin loaded. Tools registered: ${this.toolRegistry.size}`);
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
			console.debug("[MCP] Server stopped on plugin unload");
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<MCPPluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async updateScriptsPath(scriptsPath: string): Promise<void> {
		const trimmed = scriptsPath.trim();
		this.settings.scriptsPath = trimmed ? trimmed : DEFAULT_SETTINGS.scriptsPath;
		await this.saveSettings();

		if (this.scriptLoader) {
			try {
				await this.scriptLoader.updateScriptsPath(this.settings.scriptsPath);
				this.exampleManager?.setScriptsPath(this.scriptLoader.getScriptsPathValue());
			} catch (error) {
				console.error("[MCP] Failed to update scripts path:", error);
				new Notice("Failed to update scripts folder. Using the default path.");
			}
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
			console.error("[MCP] Failed to reload scripts:", error);
			new Notice("Failed to reload scripts");
		}
	}

	/**
	 * Restart the MCP server (useful after settings change)
	 */
	async restartServer(): Promise<void> {
		if (this.mcpServer) {
			await this.mcpServer.stop();
		}

		this.mcpServer = new MCPServer(this, this.toolRegistry, this.settings.port);

		try {
			await this.mcpServer.start();
			new Notice(`MCP server restarted on port ${this.settings.port}`);
		} catch (error) {
			console.error("[MCP] Failed to restart server:", error);
			new Notice(`Failed to restart MCP server: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}
