import { createRequire } from "module";
import path from "path";
import { ScriptExecutionContext } from "./types";

type RequireFn = (id: string) => unknown;

/**
 * Configuration for script execution context
 */
export interface ExecutionContextConfig {
	/** Names of context variables to inject */
	variableNames: string[];
	/** Function to provide context variable values */
	provideContext: (scriptPath: string, context: ScriptExecutionContext) => Record<string, unknown>;
}

export class ScriptExecutor {
	private contextConfig: ExecutionContextConfig;

	constructor(contextConfig: ExecutionContextConfig) {
		this.contextConfig = contextConfig;
	}

	/**
	 * Execute compiled code and return the exported object.
	 * Returns whatever the script exports (module.exports or default export).
	 */
	execute(code: string, scriptPath: string, context: ScriptExecutionContext): unknown {
		const module = { exports: {} as Record<string, unknown> };
		const localRequire = this.createLocalRequire(scriptPath, context);
		const dirname = this.getDirname(scriptPath);

		// Get context variables from configuration
		const contextVars = this.contextConfig.provideContext(scriptPath, context);

		// Build function parameters
		const baseParams = ["module", "exports", "require", "__filename", "__dirname"];
		const allParams = [...baseParams, ...this.contextConfig.variableNames];

		// Build function arguments
		const baseArgs = [module, module.exports, localRequire, scriptPath, dirname];
		const contextArgs = this.contextConfig.variableNames.map(name => contextVars[name]);
		const allArgs = [...baseArgs, ...contextArgs];

		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		const runner = new Function(...allParams, code);
		runner(...allArgs);

		const rawExports = module.exports as { default?: unknown } | undefined;
		// Return default export if available, otherwise return the entire exports object
		return rawExports?.default ?? rawExports;
	}

	/**
	 * Execute a function in the script context.
	 * Useful for executing arbitrary functions with the configured context.
	 */
	executeFunction(
		fn: (...args: unknown[]) => unknown,
		scriptPath: string,
		context: ScriptExecutionContext,
		...args: unknown[]
	): unknown {
		const contextVars = this.contextConfig.provideContext(scriptPath, context);
		// Bind context variables to the function
		// This is a simplified implementation - you may want to enhance this
		return fn.apply(contextVars, args);
	}

	private createLocalRequire(scriptPath: string, context: ScriptExecutionContext): RequireFn | undefined {
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
}
