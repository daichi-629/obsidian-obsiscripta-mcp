import { ToolRegistry } from "../registry";
import { MCPToolContext, MCPToolDefinition } from "../types";
import type MCPPlugin from "../../../main";
import { ScriptCompiler } from "./script-compiler";
import { ScriptExecutor } from "./script-executor";

const SCRIPT_FOLDER_NAME = "mcp-tools";
export class ScriptLoader {
	private plugin: MCPPlugin;
	private toolRegistry: ToolRegistry;
	private compiler: ScriptCompiler;
	private executor: ScriptExecutor;
	private scriptTools: Map<string, string> = new Map();
	private reloadTimer: number | null = null;
	private scriptsPath: string;

	constructor(plugin: MCPPlugin, toolRegistry: ToolRegistry) {
		this.plugin = plugin;
		this.toolRegistry = toolRegistry;
		this.compiler = new ScriptCompiler();
		this.executor = new ScriptExecutor();
		this.scriptsPath = this.computeScriptsPath();
	}

	async start(): Promise<void> {
		await this.ensureScriptsFolder();
		await this.reloadAllScripts();
		this.startWatching();
	}

	stop(): void {
		if (this.reloadTimer !== null) {
			clearTimeout(this.reloadTimer);
			this.reloadTimer = null;
		}

		for (const toolName of this.scriptTools.values()) {
			this.toolRegistry.unregister(toolName);
		}
		this.scriptTools.clear();
		this.compiler.clear();
	}

	private computeScriptsPath(): string {
		const configDir = this.plugin.app.vault.configDir;
		const safeConfigDir = typeof configDir === "string" && configDir.length > 0
			? configDir
			: ".obsidian";
		return `${safeConfigDir}/${SCRIPT_FOLDER_NAME}`;
	}

	private async ensureScriptsFolder(): Promise<void> {
		const adapter = this.plugin.app.vault.adapter;
		if (!this.scriptsPath) {
			throw new Error("Scripts path is not set");
		}
		const exists = await adapter.exists(this.scriptsPath);
		if (!exists) {
			await adapter.mkdir(this.scriptsPath);
			console.log(`[MCP] Created script folder: ${this.scriptsPath}`);
		}
	}


	private startWatching(): void {
		const watchEvents: Array<"create" | "modify" | "delete"> = ["create", "modify", "delete"];
		for (const eventName of watchEvents) {
			this.plugin.registerEvent(this.plugin.app.vault.on(eventName, (file) => {
				if (this.isScriptFile(file?.path)) {
					this.scheduleReload();
				}
			}));
		}

		this.plugin.registerEvent(this.plugin.app.vault.on("rename", (file, oldPath) => {
			if (this.isScriptFile(file?.path) || this.isScriptPath(oldPath)) {
				this.scheduleReload();
			}
		}));
	}

	private scheduleReload(): void {
		if (this.reloadTimer !== null) {
			clearTimeout(this.reloadTimer);
		}
		this.reloadTimer = window.setTimeout(() => {
			this.reloadAllScripts().catch((error) => {
				console.error("[MCP] Failed to reload scripts:", error);
			});
		}, 300);
	}

	private async reloadAllScripts(): Promise<void> {
		const scriptPaths = await this.listScriptFiles(this.scriptsPath);
		const scriptSet = new Set(scriptPaths);

		for (const scriptPath of scriptPaths) {
			await this.loadScript(scriptPath);
		}

		for (const [scriptPath, toolName] of this.scriptTools.entries()) {
			if (!scriptSet.has(scriptPath)) {
				this.toolRegistry.unregister(toolName);
				this.scriptTools.delete(scriptPath);
				this.compiler.invalidate(scriptPath);
				console.log(`[MCP] Removed script tool: ${toolName}`);
			}
		}
	}

	private async loadScript(scriptPath: string): Promise<void> {
		const adapter = this.plugin.app.vault.adapter;
		const loader = this.getLoaderForPath(scriptPath);
		if (!loader) {
			return;
		}

		try {
			const [source, stat] = await Promise.all([
				adapter.read(scriptPath),
				adapter.stat(scriptPath)
			]);
			const compiled = await this.compiler.compile(scriptPath, source, loader, stat?.mtime);
			const tool = this.executor.execute(compiled, scriptPath, this.createToolContext());
			this.registerScriptTool(scriptPath, tool);
		} catch (error) {
			console.error(`[MCP] Failed to load script ${scriptPath}:`, error);
		}
	}

	private registerScriptTool(scriptPath: string, tool: MCPToolDefinition): void {
		const existingToolName = this.scriptTools.get(scriptPath);
		if (existingToolName && existingToolName !== tool.name) {
			this.toolRegistry.unregister(existingToolName);
		}

		this.toolRegistry.register(tool);
		this.scriptTools.set(scriptPath, tool.name);
	}

	private getLoaderForPath(filePath: string): "js" | "ts" | null {
		const lowerPath = filePath.toLowerCase();
		if (lowerPath.endsWith(".js")) {
			return "js";
		}
		if (lowerPath.endsWith(".ts") && !lowerPath.endsWith(".d.ts")) {
			return "ts";
		}
		return null;
	}

	private async listScriptFiles(dir: string): Promise<string[]> {
		const adapter = this.plugin.app.vault.adapter;
		const results: string[] = [];

		if (!dir) {
			return results;
		}

		const exists = await adapter.exists(dir);
		if (!exists) {
			return results;
		}

		const { files, folders } = await adapter.list(dir);
		for (const file of files) {
			if (this.isScriptPath(file)) {
				results.push(file);
			}
		}

		for (const folder of folders) {
			const nested = await this.listScriptFiles(folder);
			results.push(...nested);
		}

		return results;
	}

	private createToolContext(): MCPToolContext {
		return {
			vault: this.plugin.app.vault,
			app: this.plugin.app,
			plugin: this.plugin
		};
	}

	private isScriptFile(filePath?: string): boolean {
		if (!filePath) {
			return false;
		}
		return this.isInScriptsFolder(filePath) && this.isScriptPath(filePath);
	}

	private isInScriptsFolder(filePath: string): boolean {
		const normalized = filePath.replace(/\\/g, "/");
		const prefix = this.scriptsPath.replace(/\\/g, "/");
		return normalized === prefix || normalized.startsWith(`${prefix}/`);
	}

	private isScriptPath(filePath?: string): boolean {
		if (!filePath) {
			return false;
		}
		const lowerPath = filePath.toLowerCase();
		return lowerPath.endsWith(".js") || (lowerPath.endsWith(".ts") && !lowerPath.endsWith(".d.ts"));
	}

	getScriptsPathValue(): string {
		return this.scriptsPath;
	}
}
