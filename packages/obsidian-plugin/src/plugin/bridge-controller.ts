import { Notice } from "obsidian";
import MCPPlugin from "../main";
import { BridgeServer } from "../mcp/server";
import { ToolRegistry } from "../mcp/tools/registry";

// Owns the bridge server lifecycle and user-facing notices.
export class BridgeController {
	private plugin: MCPPlugin;
	private toolRegistry: ToolRegistry;
	private server: BridgeServer | null = null;

	constructor(plugin: MCPPlugin, toolRegistry: ToolRegistry) {
		this.plugin = plugin;
		this.toolRegistry = toolRegistry;
	}

	isRunning(): boolean {
		return this.server?.isRunning() ?? false;
	}

	async startIfEnabled(): Promise<void> {
		if (!this.plugin.settings.autoStart) {
			return;
		}
		await this.start();
	}

	private async startWithNotice(message: string): Promise<void> {
		this.server = new BridgeServer(
			this.plugin,
			this.toolRegistry,
			this.plugin.settings.port,
		);
		try {
			await this.server.start();
			new Notice(message);
		} catch (error) {
			console.error("[Bridge] Failed to start server:", error);
			new Notice(
				`Failed to start bridge server: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async start(): Promise<void> {
		await this.startWithNotice(
			`Bridge server started on port ${this.plugin.settings.port}`,
		);
	}

	async stop(): Promise<void> {
		if (this.server) {
			await this.server.stop();
			this.server = null;
		}
	}

	async restart(): Promise<void> {
		await this.stop();
		await this.startWithNotice(
			`Bridge server restarted on port ${this.plugin.settings.port}`,
		);
	}
}
