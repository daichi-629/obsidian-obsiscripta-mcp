import { describe, it, expect, beforeEach, vi } from "vitest";
import { ToolingManager } from "../../plugin/tooling-manager";
import { SettingsStore } from "../../settings/settings-store";
import type { SettingsPersistence } from "../../settings/settings-store";

describe("ToolingManager - Settings Integration", () => {
	let toolingManager: ToolingManager;
	let settingsStore: SettingsStore;
	let mockPersistence: SettingsPersistence;
	let mockVault: any;
	let mockApp: any;
	let mockPlugin: any;
	let mockScriptLoader: any;

	beforeEach(async () => {
		// Mock Obsidian APIs
		mockVault = {};
		mockApp = {};
		mockPlugin = {};

		// Mock ScriptLoader
		mockScriptLoader = {
			start: vi.fn().mockResolvedValue(undefined),
			stop: vi.fn().mockResolvedValue(undefined),
			updateScriptsPath: vi.fn().mockResolvedValue(undefined),
			reloadScripts: vi.fn().mockResolvedValue(undefined),
			getScriptsPath: vi.fn().mockReturnValue("mcp-tools"),
		};

		// Mock persistence
		mockPersistence = {
			load: vi.fn().mockResolvedValue({}),
			save: vi.fn().mockResolvedValue(undefined),
		};

		// Create settings store
		settingsStore = new SettingsStore(mockPersistence);
		await settingsStore.load();

		const settings = settingsStore.getSettings();

		// Create tooling manager
		toolingManager = new ToolingManager(
			mockVault,
			mockApp,
			mockPlugin,
			settings,
			mockPlugin, // eventRegistrar
			"",
			settings.disabledTools
		);

		// Inject mock script loader
		// @ts-ignore - accessing private field for testing
		toolingManager.scriptLoader = mockScriptLoader;
	});

	describe("scriptsPath change detection", () => {
		it("should call updateScriptsPath when scriptsPath changes", async () => {
			toolingManager.subscribeToSettings(settingsStore);

			await settingsStore.updateSetting("scriptsPath", "new-tools-path");

			// Wait for async handler
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(mockScriptLoader.updateScriptsPath).toHaveBeenCalledWith("new-tools-path");
		});

		it("should not call updateScriptsPath when scriptsPath is unchanged", async () => {
			toolingManager.subscribeToSettings(settingsStore);

			// Set to same value
			await settingsStore.updateSetting("scriptsPath", "mcp-tools");

			// Wait for async handler
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Should not be called for unchanged value
			expect(mockScriptLoader.updateScriptsPath).not.toHaveBeenCalled();
		});

		it("should handle scriptsPath update errors gracefully", async () => {
			mockScriptLoader.updateScriptsPath.mockRejectedValueOnce(
				new Error("Failed to update path")
			);

			toolingManager.subscribeToSettings(settingsStore);

			await settingsStore.updateSetting("scriptsPath", "invalid-path");

			// Wait for async handler
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Should not throw, error should be logged
			expect(mockScriptLoader.updateScriptsPath).toHaveBeenCalled();
		});
	});

	describe("disabledTools change detection", () => {
		it("should disable tool when added to disabledTools", async () => {
			const setEnabledSpy = vi.spyOn(toolingManager, "setToolEnabled");

			toolingManager.subscribeToSettings(settingsStore);

			await settingsStore.setToolEnabled("myTool", false);

			// Wait for async handler
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(setEnabledSpy).toHaveBeenCalledWith("myTool", false);
		});

		it("should enable tool when removed from disabledTools", async () => {
			// Start with disabled tool
			await settingsStore.updateSetting("disabledTools", ["myTool"]);

			const setEnabledSpy = vi.spyOn(toolingManager, "setToolEnabled");

			toolingManager.subscribeToSettings(settingsStore);

			await settingsStore.setToolEnabled("myTool", true);

			// Wait for async handler
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(setEnabledSpy).toHaveBeenCalledWith("myTool", true);
		});

		it("should handle multiple tool state changes", async () => {
			await settingsStore.updateSetting("disabledTools", ["tool1", "tool2"]);

			const setEnabledSpy = vi.spyOn(toolingManager, "setToolEnabled");

			toolingManager.subscribeToSettings(settingsStore);

			// Disable tool3, enable tool1
			await settingsStore.updateSetting("disabledTools", ["tool2", "tool3"]);

			// Wait for async handler
			await new Promise((resolve) => setTimeout(resolve, 10));

			// tool1 enabled, tool3 disabled
			expect(setEnabledSpy).toHaveBeenCalledWith("tool1", true);
			expect(setEnabledSpy).toHaveBeenCalledWith("tool3", false);
		});

		it("should not call setToolEnabled for unchanged tools", async () => {
			await settingsStore.updateSetting("disabledTools", ["tool1"]);

			const setEnabledSpy = vi.spyOn(toolingManager, "setToolEnabled");

			toolingManager.subscribeToSettings(settingsStore);

			// No change to disabledTools
			await settingsStore.updateSetting("scriptsPath", "new-path");

			// Wait for async handler
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(setEnabledSpy).not.toHaveBeenCalled();
		});
	});

	describe("settings subscription", () => {
		it("should handle both scriptsPath and disabledTools changes together", async () => {
			const setEnabledSpy = vi.spyOn(toolingManager, "setToolEnabled");

			toolingManager.subscribeToSettings(settingsStore);

			// Update both settings
			await settingsStore.updateSetting("scriptsPath", "updated-path");
			await settingsStore.setToolEnabled("tool1", false);

			// Wait for async handlers
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(mockScriptLoader.updateScriptsPath).toHaveBeenCalledWith("updated-path");
			expect(setEnabledSpy).toHaveBeenCalledWith("tool1", false);
		});

		it("should unsubscribe from settings changes", async () => {
			const setEnabledSpy = vi.spyOn(toolingManager, "setToolEnabled");

			toolingManager.subscribeToSettings(settingsStore);
			toolingManager.unsubscribe();

			await settingsStore.setToolEnabled("tool1", false);

			// Wait for async handler
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Should not be called after unsubscribe
			expect(setEnabledSpy).not.toHaveBeenCalled();
		});

		it("should not react to unrelated settings changes", async () => {
			const setEnabledSpy = vi.spyOn(toolingManager, "setToolEnabled");

			toolingManager.subscribeToSettings(settingsStore);

			// Update unrelated settings
			await settingsStore.updateSetting("port", 4000);
			await settingsStore.updateSetting("bindHost", "0.0.0.0");

			// Wait for async handler
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(mockScriptLoader.updateScriptsPath).not.toHaveBeenCalled();
			expect(setEnabledSpy).not.toHaveBeenCalled();
		});
	});

	describe("tool registry integration", () => {
		beforeEach(() => {
			// Register a test tool
			toolingManager.registry.register(
				{
					name: "myTool",
					description: "Test tool",
					inputSchema: {
						type: "object",
						properties: {},
					},
				},
				1 as any // ToolSource.Builtin
			);
		});

		it("should reflect tool enabled state in registry", () => {
			// Initially enabled (not in disabledTools)
			expect(toolingManager.isToolEnabled("myTool")).toBe(true);

			toolingManager.setToolEnabled("myTool", false);

			expect(toolingManager.isToolEnabled("myTool")).toBe(false);
		});

		it("should handle enabling already enabled tool", () => {
			expect(toolingManager.isToolEnabled("myTool")).toBe(true);

			// Enable already enabled tool
			toolingManager.setToolEnabled("myTool", true);

			expect(toolingManager.isToolEnabled("myTool")).toBe(true);
		});

		it("should handle disabling already disabled tool", () => {
			toolingManager.setToolEnabled("myTool", false);
			expect(toolingManager.isToolEnabled("myTool")).toBe(false);

			// Disable already disabled tool
			toolingManager.setToolEnabled("myTool", false);

			expect(toolingManager.isToolEnabled("myTool")).toBe(false);
		});
	});

	describe("updateScriptsPath method", () => {
		it("should update scripts path and return resolved path", async () => {
			mockScriptLoader.getScriptsPath.mockReturnValue("resolved-path");

			const result = await toolingManager.updateScriptsPath("new-path");

			expect(mockScriptLoader.updateScriptsPath).toHaveBeenCalledWith("new-path");
			expect(result).toBe("resolved-path");
		});

		it("should not update if path is unchanged", async () => {
			mockScriptLoader.getScriptsPath.mockReturnValue("mcp-tools");

			await toolingManager.updateScriptsPath("mcp-tools");

			expect(mockScriptLoader.updateScriptsPath).not.toHaveBeenCalled();
		});

		it("should return early if scriptLoader is not available", async () => {
			// @ts-ignore
			toolingManager.scriptLoader = null;

			const result = await toolingManager.updateScriptsPath("new-path");

			expect(result).toBe("new-path");
		});
	});
});
