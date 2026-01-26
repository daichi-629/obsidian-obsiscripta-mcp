import { Notice, TFolder } from "obsidian";
import type MCPPlugin from "../../../main";

const EXAMPLE_SCRIPT_NAME = "example-tool.js";

export class ExampleManager {
	private plugin: MCPPlugin;
	private scriptsPath: string;

	constructor(plugin: MCPPlugin, scriptsPath: string) {
		this.plugin = plugin;
		this.scriptsPath = scriptsPath;
	}

	setScriptsPath(scriptsPath: string): void {
		this.scriptsPath = scriptsPath;
	}

	async copyExampleToScripts(): Promise<void> {
		if (!this.scriptsPath) {
			new Notice("Scripts path is not set");
			return;
		}

		const vault = this.plugin.app.vault;
		const scriptsEntry = vault.getAbstractFileByPath(this.scriptsPath);
		if (!scriptsEntry) {
			await vault.createFolder(this.scriptsPath);
		} else if (!(scriptsEntry instanceof TFolder)) {
			new Notice(`Scripts path is not a folder: ${this.scriptsPath}`);
			return;
		}

		const examplePath = `${this.scriptsPath}/${EXAMPLE_SCRIPT_NAME}`;
		const existing = vault.getAbstractFileByPath(examplePath);
		if (existing) {
			new Notice(`Example script already exists at ${examplePath}`);
			return;
		}

		const sourcePath = this.getExampleSourcePath();
		if (!sourcePath) {
			new Notice("Example script source path unavailable");
			return;
		}

		const adapter = this.plugin.app.vault.adapter;
		const sourceExists = await adapter.exists(sourcePath);
		if (!sourceExists) {
			new Notice(`Example script not found at ${sourcePath}`);
			return;
		}

		try {
			const content = await adapter.read(sourcePath);
			await vault.create(examplePath, content);
			new Notice(`Copied example script to ${examplePath}`);
		} catch (error) {
			console.error("[Bridge] Failed to copy example script:", error);
			new Notice("Failed to copy example script");
		}
	}

	private getExampleSourcePath(): string | null {
		const configDir = this.plugin.app.vault.configDir;
		if (!configDir) {
			return null;
		}
		const pluginId = this.plugin.manifest?.id;
		if (!pluginId) {
			return null;
		}
		return `${configDir}/plugins/${pluginId}/examples/${EXAMPLE_SCRIPT_NAME}`;
	}
}
