import { App } from "obsidian";

/** Safely retrieves a plugin by its ID. Returns undefined if unavailable. */
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export function getPlugin(app: App, id: string): unknown | undefined {
	const pluginManager = (app as unknown as { plugins?: { getPlugin?: (id: string) => unknown } }).plugins;
	if (!pluginManager) {
		return undefined;
	}
	const getter = pluginManager.getPlugin;
	if (typeof getter !== "function") {
		return undefined;
	}
	return getter.call(pluginManager, id);
}
