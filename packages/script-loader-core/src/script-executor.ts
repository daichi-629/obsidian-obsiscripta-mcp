import { PathUtils, ScriptExecutionContext } from "./types";

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

/**
 * Options for creating a local require function
 */
export interface ScriptExecutorOptions {
	/** Path utilities for path operations */
	pathUtils?: PathUtils;
}

/**
 * Executes compiled scripts with context injection.
 * This is the core execution engine that runs user scripts in a controlled environment.
 *
 * Security Note: This class uses new Function() to execute user-provided scripts.
 * This is intentional and necessary for the dynamic script loading functionality.
 * Scripts should only be loaded from trusted sources.
 */
export class ScriptExecutor {
	private contextConfig: ExecutionContextConfig;
	private options?: ScriptExecutorOptions;

	constructor(contextConfig: ExecutionContextConfig, options?: ScriptExecutorOptions) {
		this.contextConfig = contextConfig;
		this.options = options;
	}

	/**
	 * Execute compiled code and return the exported object.
	 * Returns whatever the script exports (module.exports or default export).
	 */
	execute(code: string, scriptPath: string, context: ScriptExecutionContext): unknown {
		const module = { exports: {} as Record<string, unknown> };
		const localRequire = this.getGlobalRequire();
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

		// Execute the script code in a function scope
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
	executeFunction<This extends Record<string, unknown>, Args extends unknown[], Result>(
		fn: (this: This, ...args: Args) => Result,
		scriptPath: string,
		context: ScriptExecutionContext,
		...args: Args
	): Result {
		const contextVars = this.contextConfig.provideContext(scriptPath, context);
		// Bind context variables to the function
		return fn.apply(contextVars as This, args);
	}

	/**
	 * Get the global require function if available
	 */
	private getGlobalRequire(): RequireFn | undefined {
		const globalRequire = (globalThis as { require?: unknown }).require;
		if (typeof globalRequire === "function") {
			return globalRequire as RequireFn;
		}
		return undefined;
	}

	/**
	 * Get the directory name from a script path
	 */
	private getDirname(scriptPath: string): string {
		if (this.options?.pathUtils) {
			return this.options.pathUtils.dirname(scriptPath);
		}
		// Fallback implementation
		const normalized = scriptPath.replace(/\\/g, "/");
		const lastSlash = normalized.lastIndexOf("/");
		if (lastSlash === -1) {
			return "";
		}
		return normalized.slice(0, lastSlash);
	}
}
