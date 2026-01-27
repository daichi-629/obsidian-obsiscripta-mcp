import { App, Notice, Vault } from "obsidian";
import { BridgeServer } from "../mcp/server";
import { ToolRegistry } from "../mcp/tools/registry";
import { ToolExecutor } from "../mcp/tools/executor";
import { AppContext } from "./context";

// Settings interface for bridge configuration
interface BridgeSettings {
	autoStart: boolean;
	port: number;
}

// Owns the bridge server lifecycle and user-facing notices.
export class BridgeController {
	private app: App;
	private vault: Vault;
	private settings: BridgeSettings;
	private toolRegistry: ToolRegistry;
	private server: BridgeServer | null = null;

	constructor(
		app: App,
		vault: Vault,
		settings: BridgeSettings,
		toolRegistry: ToolRegistry
	) {
		this.app = app;
		this.vault = vault;
		this.settings = settings;
		this.toolRegistry = toolRegistry;
	}

	isRunning(): boolean {
		return this.server?.isRunning() ?? false;
	}

	updateSettings(next: Partial<BridgeSettings>): void {
		this.settings = { ...this.settings, ...next };
	}

	async startIfEnabled(): Promise<void> {
		if (!this.settings.autoStart) {
			return;
		}
		await this.start();
	}

	private async startWithNotice(message: string): Promise<void> {
		const toolContext: AppContext = {
			vault: this.vault,
			app: this.app,
		};
		const executor = new ToolExecutor(this.toolRegistry, toolContext);
		this.server = new BridgeServer(
			executor,
			this.settings.port,
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
			`Bridge server started on port ${this.settings.port}`,
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
			`Bridge server restarted on port ${this.settings.port}`,
		);
	}
}
