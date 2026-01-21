import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, MCPPluginSettings, MCPSettingTab } from "./settings";
import { MCPServer } from "./mcp/server";
import { ToolRegistry } from "./mcp/tools/registry";
import { getBuiltinNoteTools } from "./mcp/tools/builtin/notes";

export default class MCPPlugin extends Plugin {
	settings: MCPPluginSettings;
	private mcpServer: MCPServer | null = null;
	private toolRegistry: ToolRegistry;

	async onload() {
		await this.loadSettings();

		// Initialize tool registry
		this.toolRegistry = new ToolRegistry();

		// Register built-in tools
		for (const tool of getBuiltinNoteTools()) {
			this.toolRegistry.register(tool);
		}

		// Initialize and start MCP server
		this.mcpServer = new MCPServer(this, this.toolRegistry, this.settings.port);

		try {
			await this.mcpServer.start();
			new Notice(`MCP Server started on port ${this.settings.port}`);
		} catch (error) {
			console.error("[MCP] Failed to start server:", error);
			new Notice(`Failed to start MCP server: ${error instanceof Error ? error.message : String(error)}`);
		}

		// Add settings tab
		this.addSettingTab(new MCPSettingTab(this.app, this));

		// Add ribbon icon for server status
		this.addRibbonIcon("server", "MCP Server", () => {
			if (this.mcpServer?.isRunning()) {
				new Notice(`MCP Server running on port ${this.settings.port}\nActive sessions: ${this.mcpServer.getSessionCount()}`);
			} else {
				new Notice("MCP Server is not running");
			}
		});

		// Add command to restart server
		this.addCommand({
			id: "restart-server",
			name: "Restart MCP server",
			callback: async () => {
				await this.restartServer();
			}
		});

		console.log(`[MCP] Plugin loaded. Tools registered: ${this.toolRegistry.size}`);
	}

	async onunload() {
		if (this.mcpServer) {
			await this.mcpServer.stop();
			console.log("[MCP] Server stopped on plugin unload");
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<MCPPluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
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
			new Notice(`MCP Server restarted on port ${this.settings.port}`);
		} catch (error) {
			console.error("[MCP] Failed to restart server:", error);
			new Notice(`Failed to restart MCP server: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}
