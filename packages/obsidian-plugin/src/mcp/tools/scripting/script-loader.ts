import { normalizePath } from "obsidian";
import { ToolRegistry } from "../registry";
import { MCPToolContext, MCPToolDefinition } from "../types";
import type MCPPlugin from "../../../main";
import { ScriptCompiler } from "./script-compiler";
import { ScriptExecutor } from "./script-executor";

const DEFAULT_SCRIPT_FOLDER_NAME = "mcp-tools";
export class ScriptLoader {
	private plugin: MCPPlugin;
	private toolRegistry: ToolRegistry;
	private compiler: ScriptCompiler;
	private executor: ScriptExecutor;
	private scriptTools: Map<string, string> = new Map();
	private toolNameCounts: Map<string, number> = new Map();
	private reloadTimer: number | null = null;
	private scriptsPath: string;

	constructor(plugin: MCPPlugin, toolRegistry: ToolRegistry) {
		this.plugin = plugin;
		this.toolRegistry = toolRegistry;
		this.compiler = new ScriptCompiler();
		this.executor = new ScriptExecutor();
		this.scriptsPath = ScriptLoader.normalizeScriptsPath(this.plugin.settings?.scriptsPath);
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

		for (const toolName of this.toolNameCounts.keys()) {
			this.toolRegistry.unregister(toolName);
		}
		this.scriptTools.clear();
		this.toolNameCounts.clear();
		this.compiler.clear();
	}

	async updateScriptsPath(scriptsPath: string): Promise<void> {
		const nextPath = ScriptLoader.normalizeScriptsPath(scriptsPath);
		if (nextPath === this.scriptsPath) {
			return;
		}
		this.unregisterAllScripts();
		this.scriptsPath = nextPath;
		await this.ensureScriptsFolder();
		await this.reloadAllScripts();
	}

	async reloadScripts(): Promise<void> {
		await this.reloadAllScripts();
	}

	private unregisterAllScripts(): void {
		for (const toolName of this.toolNameCounts.keys()) {
			this.toolRegistry.unregister(toolName);
		}
		this.scriptTools.clear();
		this.toolNameCounts.clear();
		this.compiler.clear();
	}

	static normalizeScriptsPath(settingPath?: string): string {
		const fallback = normalizePath(DEFAULT_SCRIPT_FOLDER_NAME);
		const trimmed = settingPath?.trim();
		if (!trimmed) {
			return fallback;
		}

		const normalized = trimmed.replace(/\\/g, "/");
		if (normalized.startsWith("/") || normalized.includes("..")) {
			return fallback;
		}

		const cleaned = normalized.replace(/^\.?\//, "");
		return normalizePath(cleaned);
	}

	private async ensureScriptsFolder(): Promise<void> {
		const adapter = this.plugin.app.vault.adapter;
		if (!this.scriptsPath) {
			throw new Error("Scripts path is not set");
		}
		const exists = await adapter.exists(this.scriptsPath);
		if (!exists) {
			await adapter.mkdir(this.scriptsPath);
			console.debug(`[Bridge] Created script folder: ${this.scriptsPath}`);
		}
	}


	private startWatching(): void {
		this.plugin.registerEvent(this.plugin.app.vault.on("create", (file) => {
			if (this.isScriptFile(file?.path)) {
				this.scheduleReload();
			}
		}));

		this.plugin.registerEvent(this.plugin.app.vault.on("modify", (file) => {
			if (this.isScriptFile(file?.path)) {
				this.scheduleReload();
			}
		}));

		this.plugin.registerEvent(this.plugin.app.vault.on("delete", (file) => {
			if (this.isScriptFile(file?.path)) {
				this.scheduleReload();
			}
		}));

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
				console.error("[Bridge] Failed to reload scripts:", error);
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
				this.unregisterScriptTool(scriptPath);
				console.debug(`[Bridge] Removed script tool: ${toolName}`);
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
			console.error(`[Bridge] Failed to load script ${scriptPath}:`, error);
			this.unregisterScriptTool(scriptPath);
		}
	}

	private registerScriptTool(scriptPath: string, tool: MCPToolDefinition): void {
		const existingToolName = this.scriptTools.get(scriptPath);
		if (existingToolName && existingToolName !== tool.name) {
			this.decrementToolRef(existingToolName);
		}

		if (this.toolRegistry.has(tool.name) && !this.toolNameCounts.has(tool.name)) {
			console.warn(
				`[Bridge] Script tool "${tool.name}" conflicts with a built-in tool and will not be registered`,
			);
			this.scriptTools.delete(scriptPath);
			return;
		}

		this.toolRegistry.register(tool);
		this.scriptTools.set(scriptPath, tool.name);
		if (!existingToolName || existingToolName !== tool.name) {
			this.incrementToolRef(tool.name);
		}
	}

	private unregisterScriptTool(scriptPath: string): void {
		const toolName = this.scriptTools.get(scriptPath);
		if (!toolName) {
			return;
		}
		this.scriptTools.delete(scriptPath);
		this.compiler.invalidate(scriptPath);
		this.decrementToolRef(toolName);
	}

	private incrementToolRef(toolName: string): void {
		const count = this.toolNameCounts.get(toolName) ?? 0;
		this.toolNameCounts.set(toolName, count + 1);
	}

	private decrementToolRef(toolName: string): void {
		const count = this.toolNameCounts.get(toolName);
		if (count === undefined) {
			return;
		}
		if (count <= 1) {
			this.toolNameCounts.delete(toolName);
			this.toolRegistry.unregister(toolName);
		} else {
			this.toolNameCounts.set(toolName, count - 1);
		}
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
