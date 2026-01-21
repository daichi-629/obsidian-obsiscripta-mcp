import { createRequire } from "module";
import path from "path";
import { MCPToolContext, MCPToolDefinition } from "../types";
import { getPlugin } from "../../utils/plugin-access";

type RequireFn = (id: string) => unknown;

export class ScriptExecutor {
	execute(code: string, scriptPath: string, context: MCPToolContext): MCPToolDefinition {
		const module = { exports: {} as Record<string, unknown> };
		const localRequire = this.createLocalRequire(scriptPath, context);
		const dirname = this.getDirname(scriptPath);
		const dataviewPlugin = getPlugin(context.app, "dataview") as { api?: unknown } | undefined;
		const dv = dataviewPlugin?.api;
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		const runner = new Function(
			"module",
			"exports",
			"require",
			"__filename",
			"__dirname",
			"app",
			"vault",
			"plugin",
			"dv",
			code
		);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call
		runner(
			module,
			module.exports,
			localRequire,
			scriptPath,
			dirname,
			context.app,
			context.vault,
			context.plugin,
			dv
		);

		const rawExports = module.exports as { default?: unknown } | undefined;
		const tool = (rawExports?.default ?? rawExports) as Partial<MCPToolDefinition> | undefined;
		if (!tool || typeof tool !== "object") {
			throw new Error("Script must export a tool definition object as default");
		}

		this.validateToolDefinition(tool);

		return tool as MCPToolDefinition;
	}

	private createLocalRequire(scriptPath: string, context: MCPToolContext): RequireFn | undefined {
		const globalRequire = this.getGlobalRequire();
		if (!globalRequire) {
			return undefined;
		}
		const adapter = context.vault.adapter as { getBasePath?: () => string };
		const basePath = adapter.getBasePath?.();
		if (!basePath) {
			return globalRequire;
		}
		const absoluteScriptPath = path.isAbsolute(scriptPath)
			? scriptPath
			: path.join(basePath, scriptPath);
		try {
			return createRequire(absoluteScriptPath) as unknown as RequireFn;
		} catch {
			return globalRequire;
		}
	}

	private getGlobalRequire(): RequireFn | undefined {
		const globalRequire = (globalThis as { require?: unknown }).require;
		if (typeof globalRequire === "function") {
			return globalRequire as RequireFn;
		}
		return undefined;
	}

	private getDirname(scriptPath: string): string {
		const normalized = scriptPath.replace(/\\/g, "/");
		const lastSlash = normalized.lastIndexOf("/");
		if (lastSlash === -1) {
			return "";
		}
		return normalized.slice(0, lastSlash);
	}

	private validateToolDefinition(tool: Partial<MCPToolDefinition>): void {
		if (!tool.name || typeof tool.name !== "string") {
			throw new Error("Tool definition must include a string 'name'");
		}

		if (!tool.description || typeof tool.description !== "string") {
			throw new Error(`Tool "${tool.name}" must include a string 'description'`);
		}

		if (!tool.inputSchema || tool.inputSchema.type !== "object") {
			throw new Error(`Tool "${tool.name}" must include an 'inputSchema' with type "object"`);
		}

		if (!tool.inputSchema.properties || typeof tool.inputSchema.properties !== "object") {
			throw new Error(`Tool "${tool.name}" inputSchema must define 'properties'`);
		}

		if (!tool.handler || typeof tool.handler !== "function") {
			throw new Error(`Tool "${tool.name}" must include a 'handler' function`);
		}
	}
}
