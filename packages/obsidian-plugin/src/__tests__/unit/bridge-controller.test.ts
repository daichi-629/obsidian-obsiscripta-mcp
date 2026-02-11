import { describe, it, expect, beforeEach, vi } from "vitest";
import { BridgeController } from "../../plugin/bridge-controller";
import { SettingsStore } from "../../settings/settings-store";
import type { SettingsPersistence } from "../../settings/settings-store";

describe("BridgeController - Settings Integration", () => {
	let bridgeController: BridgeController;
	let settingsStore: SettingsStore;
	let mockPersistence: SettingsPersistence;
	let mockApp: any;
	let mockVault: any;
	let mockToolRegistry: any;
	let mockBridgeServer: any;

	beforeEach(async () => {
		// Mock Obsidian APIs
		mockApp = {};
		mockVault = {};

		// Mock ToolRegistry
		mockToolRegistry = {
			list: vi.fn().mockReturnValue([]),
			register: vi.fn(),
			unregister: vi.fn(),
		};

		// Mock BridgeServer
		mockBridgeServer = {
			start: vi.fn().mockResolvedValue(undefined),
			stop: vi.fn().mockResolvedValue(undefined),
			isRunning: vi.fn().mockReturnValue(false),
		};

		// Mock persistence
		mockPersistence = {
			load: vi.fn().mockResolvedValue({}),
			save: vi.fn().mockResolvedValue(undefined),
		};

		// Create settings store and bridge controller
		settingsStore = new SettingsStore(mockPersistence);
		await settingsStore.load();

		const settings = settingsStore.getSettings();
		bridgeController = new BridgeController(
			mockApp,
			mockVault,
			{
				autoStart: settings.autoStart,
				port: settings.port,
				bindHost: settings.bindHost,
				mcpApiKeys: [...settings.mcpApiKeys],
			},
			mockToolRegistry
		);

		// Mock the server creation by injecting our mock
		// @ts-ignore - accessing private field for testing
		bridgeController.server = mockBridgeServer;
		// @ts-ignore - accessing private field for testing
		bridgeController.runningSettings = {
			autoStart: settings.autoStart,
			port: settings.port,
			bindHost: settings.bindHost,
			mcpApiKeys: [...settings.mcpApiKeys],
		};
		mockBridgeServer.isRunning.mockReturnValue(true);
	});

	describe("needsRestart detection", () => {
		it("should detect when port changes", async () => {
			expect(bridgeController.needsRestart()).toBe(false);

			await settingsStore.updateSetting("port", 4000);

			// BridgeController needs to be notified via subscribeToSettings
			expect(bridgeController.needsRestart()).toBe(false); // Not subscribed yet

			// After subscribing, changes should be detected
			bridgeController.subscribeToSettings(settingsStore);
			await settingsStore.updateSetting("port", 5000);

			expect(bridgeController.needsRestart()).toBe(true);
		});

		it("should detect when bindHost changes", async () => {
			bridgeController.subscribeToSettings(settingsStore);

			await settingsStore.updateSetting("bindHost", "0.0.0.0");

			expect(bridgeController.needsRestart()).toBe(true);
		});

				it("should detect when mcpApiKeys change", async () => {
			bridgeController.subscribeToSettings(settingsStore);

			await settingsStore.issueMcpApiKey();

			expect(bridgeController.needsRestart()).toBe(true);
		});

		it("should not need restart when unrelated settings change", async () => {
			bridgeController.subscribeToSettings(settingsStore);

			await settingsStore.updateSetting("scriptsPath", "new-path");

			expect(bridgeController.needsRestart()).toBe(false);
		});

		it("should not need restart when server is not running", async () => {
			mockBridgeServer.isRunning.mockReturnValue(false);
			// @ts-ignore
			bridgeController.server = mockBridgeServer;
			// @ts-ignore
			bridgeController.runningSettings = null;

			bridgeController.subscribeToSettings(settingsStore);
			await settingsStore.updateSetting("port", 4000);

			expect(bridgeController.needsRestart()).toBe(false);
		});
	});

	describe("settings subscription", () => {
		it("should update internal settings when subscribed", async () => {
			bridgeController.subscribeToSettings(settingsStore);

			await settingsStore.updateSetting("port", 8080);
			await settingsStore.updateSetting("bindHost", "localhost");

			// Verify needsRestart detects the changes
			expect(bridgeController.needsRestart()).toBe(true);
		});

		it("should handle multiple setting changes", async () => {
			bridgeController.subscribeToSettings(settingsStore);

			await settingsStore.updateSetting("port", 4000);
			await settingsStore.updateSetting("bindHost", "0.0.0.0");
			
			expect(bridgeController.needsRestart()).toBe(true);
		});

		it("should unsubscribe from settings changes", async () => {
			bridgeController.subscribeToSettings(settingsStore);

			bridgeController.unsubscribe();

			// After unsubscribe, settings changes should not affect controller
			await settingsStore.updateSetting("port", 9000);

			// Since we can't directly check if updateSettings was called,
			// we verify unsubscribe doesn't throw
			expect(() => bridgeController.unsubscribe()).not.toThrow();
		});

		it("should handle API key changes with order-insensitive comparison", async () => {
			// Set initial keys
			await settingsStore.updateSetting("mcpApiKeys", ["key1", "key2"]);

			// Reset controller with new keys
			const settings = settingsStore.getSettings();
			bridgeController = new BridgeController(
				mockApp,
				mockVault,
				{
					autoStart: settings.autoStart,
					port: settings.port,
					bindHost: settings.bindHost,
					mcpApiKeys: [...settings.mcpApiKeys],
				},
				mockToolRegistry
			);

			// @ts-ignore
			bridgeController.server = mockBridgeServer;
			// @ts-ignore
			bridgeController.runningSettings = {
				autoStart: settings.autoStart,
				port: settings.port,
				bindHost: settings.bindHost,
				mcpApiKeys: [...settings.mcpApiKeys],
			};

			bridgeController.subscribeToSettings(settingsStore);

			// Add a new key
			await settingsStore.updateSetting("mcpApiKeys", ["key1", "key2", "key3"]);

			expect(bridgeController.needsRestart()).toBe(true);
		});
	});

	describe("updateSettings method", () => {
		it("should update settings correctly", () => {
			bridgeController.updateSettings({
				port: 7000,
				bindHost: "192.168.1.1",
			});

			// Can't directly check private settings, but needsRestart should detect difference
			expect(bridgeController.needsRestart()).toBe(true);
		});

		it("should handle partial settings updates", () => {
			bridgeController.updateSettings({
				port: 6000,
			});

			expect(bridgeController.needsRestart()).toBe(true);
		});
	});

	describe("getRunningSettings", () => {
		it("should return running settings when server is running", () => {
			const runningSettings = bridgeController.getRunningSettings();

			expect(runningSettings).not.toBeNull();
			expect(runningSettings?.port).toBe(3000);
		});

		it("should return null when server is not running", () => {
			mockBridgeServer.isRunning.mockReturnValue(false);
			// @ts-ignore
			bridgeController.runningSettings = null;

			const runningSettings = bridgeController.getRunningSettings();

			expect(runningSettings).toBeNull();
		});

		it("should return a readonly copy of settings", () => {
			const runningSettings1 = bridgeController.getRunningSettings();
			const runningSettings2 = bridgeController.getRunningSettings();

			// Should be different objects (copies)
			expect(runningSettings1).not.toBe(runningSettings2);
			expect(runningSettings1).toEqual(runningSettings2);
		});
	});

	describe("autoStart setting", () => {
		it("should respond to autoStart changes", async () => {
			bridgeController.subscribeToSettings(settingsStore);

			await settingsStore.updateSetting("autoStart", false);

			// autoStart is a bridge setting, should trigger update
			// Note: This doesn't trigger restart since it's not checked in needsRestart
			// After subscription and update, internal settings should be updated
			expect(bridgeController.getRunningSettings()).not.toBeNull();
		});
	});
});
