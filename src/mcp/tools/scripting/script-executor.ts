import { MCPToolContext, MCPToolDefinition } from "../types";

export class ScriptExecutor {
	execute(code: string, scriptPath: string, context: MCPToolContext): MCPToolDefinition {
		const module = { exports: {} as Record<string, unknown> };
		const localRequire = this.getGlobalRequire();
		const dirname = this.getDirname(scriptPath);
		const runner = new Function(
			"module",
			"exports",
			"require",
			"__filename",
			"__dirname",
			"app",
			"vault",
			"plugin",
			code
		);
		runner(
			module,
			module.exports,
			localRequire,
			scriptPath,
			dirname,
			context.app,
			context.vault,
			context.plugin
		);

		const rawExports = module.exports as { default?: unknown } | undefined;
		const tool = (rawExports?.default ?? rawExports) as Partial<MCPToolDefinition> | undefined;
		if (!tool || typeof tool !== "object") {
			throw new Error("Script must export a tool definition object as default");
		}

		this.validateToolDefinition(tool);

		return tool as MCPToolDefinition;
	}

	private getGlobalRequire(): NodeRequire | undefined {
		if (typeof require !== "undefined") {
			return require;
		}
		const globalRequire = (globalThis as { require?: NodeRequire }).require;
		return globalRequire;
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
