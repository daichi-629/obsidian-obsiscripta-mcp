/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { ExecutionContextConfig, ScriptExecutionContext } from "@obsiscripta/obsidian-script-loader";
import { getPlugin } from "../../utils/plugin-access";

const DATAVIEW_PLUGIN_ID = "dataview";
const TEMPLATER_PLUGIN_ID = "templater-obsidian";

/**
 * Creates the Obsidian context configuration for script execution.
 * Provides: app, vault, plugin, dv (Dataview), tp (Templater)
 */
export function createObsidianContextConfig(): ExecutionContextConfig {
	return {
		variableNames: ["app", "vault", "plugin", "dv", "tp"],
		provideContext: (_scriptPath: string, context: ScriptExecutionContext) => {
			const dataviewPlugin = getPlugin(context.app, DATAVIEW_PLUGIN_ID) as { api?: unknown } | undefined;
			const dv = dataviewPlugin?.api;

			const templaterPlugin = getPlugin(context.app, TEMPLATER_PLUGIN_ID) as { templater?: unknown; api?: unknown } | undefined;
			const tp = templaterPlugin?.templater ?? templaterPlugin?.api;

			return {
				app: context.app,
				vault: context.vault,
				plugin: context.plugin,
				dv,
				tp,
			};
		},
	};
}
