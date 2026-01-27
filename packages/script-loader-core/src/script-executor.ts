import { createRequire } from "module";
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
export interface RequireOptions {
	/** Base path for resolving absolute script paths */
	basePath?: string;
	/** Path utilities for path operations */
	pathUtils: PathUtils;
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
	private requireOptions?: RequireOptions;

	constructor(contextConfig: ExecutionContextConfig, requireOptions?: RequireOptions) {
		this.contextConfig = contextConfig;
		this.requireOptions = requireOptions;
	}

	/**
	 * Execute compiled code and return the exported object.
	 * Returns whatever the script exports (module.exports or default export).
	 */
	execute(code: string, scriptPath: string, context: ScriptExecutionContext): unknown {
		const module = { exports: {} as Record<string, unknown> };
		const localRequire = this.createLocalRequire(scriptPath);
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
	executeFunction(
		fn: (...args: unknown[]) => unknown,
		scriptPath: string,
		context: ScriptExecutionContext,
		...args: unknown[]
	): unknown {
		const contextVars = this.contextConfig.provideContext(scriptPath, context);
		// Bind context variables to the function
		return fn.apply(contextVars, args);
	}

	/**
	 * Create a local require function scoped to the script's directory
	 */
	private createLocalRequire(scriptPath: string): RequireFn | undefined {
		const globalRequire = this.getGlobalRequire();
		if (!globalRequire) {
			return undefined;
		}

		if (!this.requireOptions) {
			return globalRequire;
		}

		const { basePath, pathUtils } = this.requireOptions;
		if (!basePath) {
			return globalRequire;
		}

		const absoluteScriptPath = pathUtils.isAbsolute(scriptPath)
			? scriptPath
			: pathUtils.join(basePath, scriptPath);

		try {
			return createRequire(absoluteScriptPath) as unknown as RequireFn;
		} catch {
			return globalRequire;
		}
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
		if (this.requireOptions?.pathUtils) {
			return this.requireOptions.pathUtils.dirname(scriptPath);
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
