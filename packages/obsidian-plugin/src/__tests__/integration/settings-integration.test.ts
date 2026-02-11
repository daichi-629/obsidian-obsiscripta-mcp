import { describe, it, expect, beforeEach, vi } from "vitest";
import { SettingsStore } from "../../settings/settings-store";
import { BridgeController } from "../../plugin/bridge-controller";
import { ToolingManager } from "../../plugin/tooling-manager";
import type { SettingsPersistence } from "../../settings/settings-store";

/**
 * Integration tests for settings flow:
 * SettingsStore → BridgeController & ToolingManager
 *
 * These tests verify that settings changes properly propagate
 * through the event system to dependent components.
 */
describe("Settings Integration", () => {
	let settingsStore: SettingsStore;
	let bridgeController: BridgeController;
	let toolingManager: ToolingManager;
	let mockPersistence: SettingsPersistence;

	beforeEach(async () => {
		// Mock persistence
		mockPersistence = {
			load: vi.fn().mockResolvedValue({}),
			save: vi.fn().mockResolvedValue(undefined),
		};

		// Create settings store
		settingsStore = new SettingsStore(mockPersistence);
		await settingsStore.load();

		const settings = settingsStore.getSettings();

		// Create bridge controller
		const mockApp = {};
		const mockVault = {};
		const mockToolRegistry = {
			list: vi.fn().mockReturnValue([]),
			register: vi.fn(),
			unregister: vi.fn(),
		};

		bridgeController = new BridgeController(
			mockApp as any,
			mockVault as any,
			{
				autoStart: settings.autoStart,
				port: settings.port,
				bindHost: settings.bindHost,
				mcpApiKeys: [...settings.mcpApiKeys],
			},
			mockToolRegistry as any
		);

		// Mock running server
		const mockBridgeServer = {
			start: vi.fn().mockResolvedValue(undefined),
			stop: vi.fn().mockResolvedValue(undefined),
			isRunning: vi.fn().mockReturnValue(true),
		};

		// @ts-ignore
		bridgeController.server = mockBridgeServer;
		// @ts-ignore
		bridgeController.runningSettings = {
			autoStart: settings.autoStart,
			port: settings.port,
			bindHost: settings.bindHost,
			mcpApiKeys: [...settings.mcpApiKeys],
		};

		// Create tooling manager
		const mockPlugin = {};
		const mockScriptLoader = {
			start: vi.fn().mockResolvedValue(undefined),
			stop: vi.fn().mockResolvedValue(undefined),
			updateScriptsPath: vi.fn().mockResolvedValue(undefined),
			getScriptsPath: vi.fn().mockReturnValue("mcp-tools"),
		};

		toolingManager = new ToolingManager(
			mockVault as any,
			mockApp as any,
			mockPlugin as any,
			settings,
			mockPlugin as any,
			"",
			settings.disabledTools,
			settings.searchExcludedTools
		);

		// @ts-ignore
		toolingManager.scriptLoader = mockScriptLoader;

		// Subscribe both components to settings
		bridgeController.subscribeToSettings(settingsStore);
		toolingManager.subscribeToSettings(settingsStore);
	});

	describe("BridgeController integration", () => {
		it("should detect restart needed when port changes", async () => {
			expect(bridgeController.needsRestart()).toBe(false);

			await settingsStore.updateSetting("port", 4000);

			expect(bridgeController.needsRestart()).toBe(true);
		});

		it("should detect restart needed when bindHost changes", async () => {
			await settingsStore.updateSetting("bindHost", "0.0.0.0");

			expect(bridgeController.needsRestart()).toBe(true);
		});


		it("should detect restart needed when API keys change", async () => {
			await settingsStore.issueMcpApiKey();

			expect(bridgeController.needsRestart()).toBe(true);
		});

		it("should handle multiple bridge setting changes", async () => {
			await settingsStore.updateSetting("port", 5000);
			await settingsStore.updateSetting("bindHost", "localhost");
			
			expect(bridgeController.needsRestart()).toBe(true);
		});
	});

	describe("ToolingManager integration", () => {
		beforeEach(() => {
			// Register test tool for enable/disable tests
			toolingManager.registry.register(
				{
					name: "testTool",
					description: "Test tool",
					inputSchema: {
						type: "object",
						properties: {},
					},
					handler: async () => ({ content: [{ type: "text", text: "test" }] }),
				},
				1 as any // ToolSource.Builtin
			);
		});

		it("should update scripts path when setting changes", async () => {
			// @ts-ignore
			const updateSpy = vi.spyOn(toolingManager.scriptLoader, "updateScriptsPath");

			await settingsStore.updateSetting("scriptsPath", "custom-scripts");

			// Wait for async handler
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(updateSpy).toHaveBeenCalledWith("custom-scripts");
		});

		it("should disable tool when added to disabledTools", async () => {
			const setEnabledSpy = vi.spyOn(toolingManager, "setToolEnabled");

			await settingsStore.setToolEnabled("testTool", false);

			// Wait for async handler
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(setEnabledSpy).toHaveBeenCalledWith("testTool", false);
			expect(toolingManager.isToolEnabled("testTool")).toBe(false);
		});

		it("should enable tool when removed from disabledTools", async () => {
			// First disable
			await settingsStore.setToolEnabled("testTool", false);
			await new Promise((resolve) => setTimeout(resolve, 10));

			const setEnabledSpy = vi.spyOn(toolingManager, "setToolEnabled");

			// Then enable
			await settingsStore.setToolEnabled("testTool", true);
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(setEnabledSpy).toHaveBeenCalledWith("testTool", true);
			expect(toolingManager.isToolEnabled("testTool")).toBe(true);
		});

		it("should handle multiple tool state changes", async () => {
			// Register tools
			["tool1", "tool2", "tool3"].forEach((name) => {
				toolingManager.registry.register(
					{
						name,
						description: "Test tool",
						inputSchema: { type: "object", properties: {} },
						handler: async () => ({ content: [{ type: "text", text: "test" }] }),
					},
					1 as any
				);
			});

			const setEnabledSpy = vi.spyOn(toolingManager, "setToolEnabled");

			await settingsStore.setToolEnabled("tool1", false);
			await settingsStore.setToolEnabled("tool2", false);
			await settingsStore.setToolEnabled("tool3", false);

			// Wait for async handlers
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(setEnabledSpy).toHaveBeenCalledTimes(3);
			expect(toolingManager.isToolEnabled("tool1")).toBe(false);
			expect(toolingManager.isToolEnabled("tool2")).toBe(false);
			expect(toolingManager.isToolEnabled("tool3")).toBe(false);
		});
	});

	describe("Cross-component integration", () => {
		beforeEach(() => {
			// Register someTool for cross-component tests
			toolingManager.registry.register(
				{
					name: "someTool",
					description: "Test tool",
					inputSchema: { type: "object", properties: {} },
					handler: async () => ({ content: [{ type: "text", text: "test" }] }),
				},
				1 as any
			);
		});
		it("should not interfere between components", async () => {
			// BridgeController should respond to bridge settings
			await settingsStore.updateSetting("port", 6000);
			expect(bridgeController.needsRestart()).toBe(true);

			// ToolingManager should respond to tooling settings
			// @ts-ignore
			const updateSpy = vi.spyOn(toolingManager.scriptLoader, "updateScriptsPath");
			await settingsStore.updateSetting("scriptsPath", "other-path");
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(updateSpy).toHaveBeenCalledWith("other-path");

			// Both should work independently
			expect(bridgeController.needsRestart()).toBe(true);
		});

		it("should handle settings changes affecting both components", async () => {
			// Change multiple settings
			await settingsStore.updateSetting("port", 7000);
			await settingsStore.updateSetting("scriptsPath", "new-scripts");
			await settingsStore.setToolEnabled("someTool", false);

			// Wait for async handlers
			await new Promise((resolve) => setTimeout(resolve, 10));

			// @ts-ignore
			const updateSpy = toolingManager.scriptLoader.updateScriptsPath;

			// BridgeController should detect restart
			expect(bridgeController.needsRestart()).toBe(true);

			// ToolingManager should have updated path
			expect(updateSpy).toHaveBeenCalledWith("new-scripts");

			// Tool should be disabled
			expect(toolingManager.isToolEnabled("someTool")).toBe(false);
		});

		it("should persist settings changes", async () => {
			await settingsStore.updateSetting("port", 8080);
			await settingsStore.updateSetting("scriptsPath", "final-path");

			// Wait for auto-save
			await new Promise((resolve) => setTimeout(resolve, 20));

			// Should have saved settings
			expect(mockPersistence.save).toHaveBeenCalled();
			const savedSettings = (mockPersistence.save as any).mock.calls[
				(mockPersistence.save as any).mock.calls.length - 1
			][0];
			expect(savedSettings.port).toBe(8080);
			expect(savedSettings.scriptsPath).toBe("final-path");
		});
	});

	describe("Unsubscribe behavior", () => {
		it("should stop receiving updates after unsubscribe", async () => {
			bridgeController.unsubscribe();
			toolingManager.unsubscribe();

			const setEnabledSpy = vi.spyOn(toolingManager, "setToolEnabled");

			await settingsStore.updateSetting("port", 9000);
			await settingsStore.setToolEnabled("tool", false);

			// Wait for async handlers
			await new Promise((resolve) => setTimeout(resolve, 10));

			// BridgeController should not detect restart (unsubscribed)
			// Note: needsRestart checks internal state, not subscription
			// ToolingManager should not react
			expect(setEnabledSpy).not.toHaveBeenCalled();
		});

		it("should allow resubscription", async () => {
			bridgeController.unsubscribe();

			// Resubscribe
			bridgeController.subscribeToSettings(settingsStore);

			await settingsStore.updateSetting("port", 10000);

			expect(bridgeController.needsRestart()).toBe(true);
		});
	});

	describe("Error handling", () => {
		it("should handle save errors gracefully", async () => {
			mockPersistence.save = vi.fn().mockRejectedValue(new Error("Save failed"));

			// Should not throw even if save fails
			await expect(settingsStore.updateSetting("port", 3001)).resolves.not.toThrow();

			// Components should still be notified
			expect(bridgeController.needsRestart()).toBe(true);
		});

		it("should continue after script loader error", async () => {
			// @ts-ignore
			toolingManager.scriptLoader.updateScriptsPath = vi
				.fn()
				.mockRejectedValue(new Error("Update failed"));

			// Should not throw
			await expect(
				settingsStore.updateSetting("scriptsPath", "bad-path")
			).resolves.not.toThrow();

			// Wait for async handler
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Other settings should still work
			await settingsStore.updateSetting("port", 4001);
			expect(bridgeController.needsRestart()).toBe(true);
		});
	});
});
