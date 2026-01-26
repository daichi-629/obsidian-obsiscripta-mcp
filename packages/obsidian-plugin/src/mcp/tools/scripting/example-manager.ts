import { Notice, TFolder, Vault, DataAdapter } from "obsidian";

const EXAMPLE_SCRIPT_NAME = "example-tool.js";

export class ExampleManager {
	private vault: Vault;
	private adapter: DataAdapter;
	private exampleSourcePath: string;
	private scriptsPath: string;

	constructor(
		vault: Vault,
		adapter: DataAdapter,
		exampleSourcePath: string,
		scriptsPath: string
	) {
		this.vault = vault;
		this.adapter = adapter;
		this.exampleSourcePath = exampleSourcePath;
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

		const scriptsEntry = this.vault.getAbstractFileByPath(this.scriptsPath);
		if (!scriptsEntry) {
			await this.vault.createFolder(this.scriptsPath);
		} else if (!(scriptsEntry instanceof TFolder)) {
			new Notice(`Scripts path is not a folder: ${this.scriptsPath}`);
			return;
		}

		const examplePath = `${this.scriptsPath}/${EXAMPLE_SCRIPT_NAME}`;
		const existing = this.vault.getAbstractFileByPath(examplePath);
		if (existing) {
			new Notice(`Example script already exists at ${examplePath}`);
			return;
		}

		if (!this.exampleSourcePath) {
			new Notice("Example script source path unavailable");
			return;
		}

		const sourceExists = await this.adapter.exists(this.exampleSourcePath);
		if (!sourceExists) {
			new Notice(`Example script not found at ${this.exampleSourcePath}`);
			return;
		}

		try {
			const content = await this.adapter.read(this.exampleSourcePath);
			await this.vault.create(examplePath, content);
			new Notice(`Copied example script to ${examplePath}`);
		} catch (error) {
			console.error("[Bridge] Failed to copy example script:", error);
			new Notice("Failed to copy example script");
		}
	}
}
