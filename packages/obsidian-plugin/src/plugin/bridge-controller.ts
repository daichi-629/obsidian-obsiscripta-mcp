import { App, Notice, Vault } from "obsidian";
import { BridgeServer } from "../mcp/server";
import { ToolRegistry } from "../mcp/tools/registry";
import { ToolExecutor } from "../mcp/tools/executor";
import { AppContext } from "./context";
import { createSessionContext } from "../mcp/tools/session-store";
import { SettingsStore } from "../settings/settings-store";
import { EventRef } from "../settings/setting-store-base";

// Settings interface for bridge configuration
interface BridgeSettings {
	autoStart: boolean;
	port: number;
	bindHost: string;
	enableBridgeV1: boolean;
	mcpApiKeys: string[];
}

// Owns the bridge server lifecycle and user-facing notices.
export class BridgeController {
	private app: App;
	private vault: Vault;
	private settings: BridgeSettings;
	private toolRegistry: ToolRegistry;
	private server: BridgeServer | null = null;
	private runningSettings: BridgeSettings | null = null;
	private changeEventRef: EventRef | null = null;

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

	needsRestart(): boolean {
		if (!this.isRunning() || !this.runningSettings) {
			return false;
		}
		return (
			this.runningSettings.port !== this.settings.port ||
			this.runningSettings.bindHost !== this.settings.bindHost ||
			this.runningSettings.enableBridgeV1 !==
				this.settings.enableBridgeV1 ||
			this.runningSettings.mcpApiKeys.join("\n") !==
				this.settings.mcpApiKeys.join("\n")
		);
	}

	getRunningSettings(): Readonly<BridgeSettings> | null {
		return this.runningSettings ? { ...this.runningSettings } : null;
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
			session: createSessionContext("bridge-v1-default"),
		};
		const executor = new ToolExecutor(this.toolRegistry, toolContext);
		this.server = new BridgeServer(
			executor,
			this.settings.port,
			this.settings.bindHost,
			this.settings.enableBridgeV1,
			this.settings.mcpApiKeys,
		);
		try {
			await this.server.start();
			this.runningSettings = { ...this.settings };
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
			this.runningSettings = null;
		}
	}

	async restart(): Promise<void> {
		await this.stop();
		await this.startWithNotice(
			`Bridge server restarted on port ${this.settings.port}`,
		);
	}

	/**
	 * Subscribe to settings changes to automatically update bridge configuration.
	 * This keeps the bridge controller in sync with the settings store.
	 */
	subscribeToSettings(settingsStore: SettingsStore): void {
		this.changeEventRef = settingsStore.on("change", (oldSettings, newSettings) => {
			// Check if API keys changed (order-insensitive comparison)
			const apiKeysChanged =
				oldSettings.mcpApiKeys.length !== newSettings.mcpApiKeys.length ||
				!oldSettings.mcpApiKeys.every((key) => newSettings.mcpApiKeys.includes(key));

			// Update BridgeController if bridge-related settings changed
			const bridgeSettingsChanged =
				oldSettings.port !== newSettings.port ||
				oldSettings.bindHost !== newSettings.bindHost ||
				oldSettings.autoStart !== newSettings.autoStart ||
				oldSettings.enableBridgeV1 !== newSettings.enableBridgeV1 ||
				apiKeysChanged;

			if (bridgeSettingsChanged) {
				this.updateSettings({
					port: newSettings.port,
					bindHost: newSettings.bindHost,
					autoStart: newSettings.autoStart,
					enableBridgeV1: newSettings.enableBridgeV1,
					mcpApiKeys: [...newSettings.mcpApiKeys],
				});
			}
		});
	}

	/**
	 * Unsubscribe from settings changes.
	 * Should be called when the controller is being destroyed.
	 */
	unsubscribe(): void {
		if (this.changeEventRef) {
			this.changeEventRef.unsubscribe();
			this.changeEventRef = null;
		}
	}
}
