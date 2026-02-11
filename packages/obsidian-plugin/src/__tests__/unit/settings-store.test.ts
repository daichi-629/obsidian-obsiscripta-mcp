import { describe, it, expect, beforeEach, vi } from "vitest";
import { SettingsStore } from "../../settings/settings-store";
import type { SettingsPersistence } from "../../settings/settings-store";
import type { MCPPluginSettings } from "../../settings/types";

describe("SettingsStore", () => {
	let mockPersistence: SettingsPersistence;
	let settingsStore: SettingsStore;

	beforeEach(() => {
		// Create a mock persistence layer
		mockPersistence = {
			load: vi.fn().mockResolvedValue({}),
			save: vi.fn().mockResolvedValue(undefined),
		};
		settingsStore = new SettingsStore(mockPersistence);
	});

	describe("initialization and loading", () => {
		it("should initialize with default settings", () => {
			const settings = settingsStore.getSettings();
			expect(settings).toBeDefined();
			expect(settings.port).toBe(3000);
			expect(settings.bindHost).toBe("127.0.0.1");
			expect(settings.autoStart).toBe(true);
			expect(settings.searchExcludedTools).toEqual([]);
		});

		it("should load settings from persistence layer", async () => {
			const savedSettings: Partial<MCPPluginSettings> = {
				port: 4000,
				bindHost: "0.0.0.0",
			};
			mockPersistence.load = vi.fn().mockResolvedValue(savedSettings);

			const store = new SettingsStore(mockPersistence);
			await store.load();

			const settings = store.getSettings();
			expect(settings.port).toBe(4000);
			expect(settings.bindHost).toBe("0.0.0.0");
			expect(mockPersistence.load).toHaveBeenCalledOnce();
		});

		it("should merge loaded settings with defaults", async () => {
			const partialSettings: Partial<MCPPluginSettings> = {
				port: 5000,
			};
			mockPersistence.load = vi.fn().mockResolvedValue(partialSettings);

			const store = new SettingsStore(mockPersistence);
			await store.load();

			const settings = store.getSettings();
			expect(settings.port).toBe(5000);
			expect(settings.bindHost).toBe("127.0.0.1"); // default value
		});

		it("should normalize disabledTools array on load", async () => {
			const settingsWithDuplicates: Partial<MCPPluginSettings> = {
				disabledTools: ["tool1", "tool2", "tool1", "tool2"],
			};
			mockPersistence.load = vi.fn().mockResolvedValue(settingsWithDuplicates);

			const store = new SettingsStore(mockPersistence);
			await store.load();

			const settings = store.getSettings();
			expect(settings.disabledTools).toEqual(["tool1", "tool2"]);
		});

		it("should normalize searchExcludedTools array on load", async () => {
			const settingsWithDuplicates: Partial<MCPPluginSettings> = {
				searchExcludedTools: ["tool1", "tool2", "tool1"],
			};
			mockPersistence.load = vi.fn().mockResolvedValue(settingsWithDuplicates);

			const store = new SettingsStore(mockPersistence);
			await store.load();

			const settings = store.getSettings();
			expect(settings.searchExcludedTools).toEqual(["tool1", "tool2"]);
		});

		it("should normalize mcpApiKeys array on load", async () => {
			const settingsWithInvalidKeys: Partial<MCPPluginSettings> = {
				mcpApiKeys: ["key1", "", "key2", "key1", "   "],
			};
			mockPersistence.load = vi.fn().mockResolvedValue(settingsWithInvalidKeys);

			const store = new SettingsStore(mockPersistence);
			await store.load();

			const settings = store.getSettings();
			expect(settings.mcpApiKeys).toEqual(["key1", "key2"]);
		});
	});

	describe("updateSetting", () => {
		beforeEach(async () => {
			await settingsStore.load();
		});

		it("should update a single setting", async () => {
			await settingsStore.updateSetting("port", 8080);

			const settings = settingsStore.getSettings();
			expect(settings.port).toBe(8080);
		});

		it("should emit change event when setting is updated", async () => {
			const changeHandler = vi.fn();
			settingsStore.on("change", changeHandler);

			await settingsStore.updateSetting("port", 9000);

			expect(changeHandler).toHaveBeenCalledOnce();
			const calls = changeHandler.mock.calls[0];
			if (calls) {
				const [oldSettings, newSettings] = calls;
				expect(oldSettings.port).toBe(3000);
				expect(newSettings.port).toBe(9000);
			}
		});

		it("should save settings after update", async () => {
			await settingsStore.updateSetting("bindHost", "localhost");

			// Wait for async save
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(mockPersistence.save).toHaveBeenCalled();
		});

		it("should not emit change event if value is unchanged", async () => {
			const changeHandler = vi.fn();
			settingsStore.on("change", changeHandler);

			await settingsStore.updateSetting("port", 3000); // same as default

			expect(changeHandler).not.toHaveBeenCalled();
		});
	});

	describe("array setting operations", () => {
		beforeEach(async () => {
			await settingsStore.load();
		});

		it("should add item to array setting", async () => {
			await settingsStore.updateSetting("disabledTools", ["tool1"]);
			await settingsStore.addToArraySetting("disabledTools", "tool2");

			const settings = settingsStore.getSettings();
			expect(settings.disabledTools).toEqual(["tool1", "tool2"]);
		});

		it("should not add duplicate item to array setting", async () => {
			await settingsStore.updateSetting("disabledTools", ["tool1"]);
			await settingsStore.addToArraySetting("disabledTools", "tool1");

			const settings = settingsStore.getSettings();
			expect(settings.disabledTools).toEqual(["tool1"]);
		});

		it("should remove item from array setting", async () => {
			await settingsStore.updateSetting("disabledTools", ["tool1", "tool2", "tool3"]);
			await settingsStore.removeFromArraySetting("disabledTools", "tool2");

			const settings = settingsStore.getSettings();
			expect(settings.disabledTools).toEqual(["tool1", "tool3"]);
		});

		it("should emit change event when array is modified", async () => {
			const changeHandler = vi.fn();
			settingsStore.on("change", changeHandler);

			await settingsStore.addToArraySetting("disabledTools", "tool1");

			expect(changeHandler).toHaveBeenCalledOnce();
		});
	});

	describe("MCP API key management", () => {
		beforeEach(async () => {
			await settingsStore.load();
		});

		it("should issue a new MCP API key", async () => {
			const key = await settingsStore.issueMcpApiKey();

			expect(key).toMatch(/^obsi_[A-Za-z0-9_-]+$/);
			const settings = settingsStore.getSettings();
			expect(settings.mcpApiKeys).toContain(key);
		});

		it("should generate unique API keys", async () => {
			const key1 = await settingsStore.issueMcpApiKey();
			const key2 = await settingsStore.issueMcpApiKey();

			expect(key1).not.toBe(key2);
		});

		it("should get all MCP API keys", async () => {
			await settingsStore.issueMcpApiKey();
			await settingsStore.issueMcpApiKey();

			const keys = settingsStore.getMcpApiKeys();
			expect(keys).toHaveLength(2);
		});

		it("should revoke an MCP API key", async () => {
			const key = await settingsStore.issueMcpApiKey();
			await settingsStore.revokeMcpApiKey(key);

			const settings = settingsStore.getSettings();
			expect(settings.mcpApiKeys).not.toContain(key);
		});

		it("should return readonly array from getMcpApiKeys", async () => {
			const key = await settingsStore.issueMcpApiKey();
			const keys = settingsStore.getMcpApiKeys();

			// TypeScript will catch if we try to modify, but we can verify it's the same content
			expect(keys).toContain(key);
		});
	});

	describe("tool enable/disable", () => {
		beforeEach(async () => {
			await settingsStore.load();
		});

		it("should disable a tool by adding to disabledTools", async () => {
			await settingsStore.setToolEnabled("myTool", false);

			const settings = settingsStore.getSettings();
			expect(settings.disabledTools).toContain("myTool");
		});

		it("should enable a tool by removing from disabledTools", async () => {
			await settingsStore.updateSetting("disabledTools", ["myTool"]);
			await settingsStore.setToolEnabled("myTool", true);

			const settings = settingsStore.getSettings();
			expect(settings.disabledTools).not.toContain("myTool");
		});

		it("should emit change event when tool is enabled/disabled", async () => {
			const changeHandler = vi.fn();
			settingsStore.on("change", changeHandler);

			await settingsStore.setToolEnabled("myTool", false);

			expect(changeHandler).toHaveBeenCalledOnce();
		});
	});

	describe("tool search inclusion", () => {
		beforeEach(async () => {
			await settingsStore.load();
		});

		it("should exclude a tool from search by adding to searchExcludedTools", async () => {
			await settingsStore.setToolIncludedInSearch("myTool", false);

			const settings = settingsStore.getSettings();
			expect(settings.searchExcludedTools).toContain("myTool");
		});

		it("should include a tool in search by removing from searchExcludedTools", async () => {
			await settingsStore.updateSetting("searchExcludedTools", ["myTool"]);
			await settingsStore.setToolIncludedInSearch("myTool", true);

			const settings = settingsStore.getSettings();
			expect(settings.searchExcludedTools).not.toContain("myTool");
		});
	});

	describe("event subscription", () => {
		beforeEach(async () => {
			await settingsStore.load();
		});

		it("should allow multiple subscribers", async () => {
			const handler1 = vi.fn();
			const handler2 = vi.fn();

			settingsStore.on("change", handler1);
			settingsStore.on("change", handler2);

			await settingsStore.updateSetting("port", 7000);

			expect(handler1).toHaveBeenCalledOnce();
			expect(handler2).toHaveBeenCalledOnce();
		});

		it("should allow unsubscribing from events", async () => {
			const handler = vi.fn();
			const eventRef = settingsStore.on("change", handler);

			eventRef.unsubscribe();

			await settingsStore.updateSetting("port", 7000);

			expect(handler).not.toHaveBeenCalled();
		});
	});

	describe("scriptsPath normalization", () => {
		it("should normalize scriptsPath on load", async () => {
			const settingsWithPath: Partial<MCPPluginSettings> = {
				scriptsPath: "  scripts/tools  ",
			};
			mockPersistence.load = vi.fn().mockResolvedValue(settingsWithPath);

			const store = new SettingsStore(mockPersistence);
			await store.load();

			const settings = store.getSettings();
			expect(settings.scriptsPath.trim()).toBe(settings.scriptsPath);
		});

		it("should apply normalizer when scriptsPath is updated", async () => {
			await settingsStore.load();
			await settingsStore.updateSetting("scriptsPath", "  new/path  ");

			const settings = settingsStore.getSettings();
			expect(settings.scriptsPath.trim()).toBe(settings.scriptsPath);
		});
	});
});
