import { App } from "obsidian";

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
