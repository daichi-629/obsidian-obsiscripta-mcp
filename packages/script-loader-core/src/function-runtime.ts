import { ModuleResolver, PathUtils, ScriptExecutionContext } from "./types";
import { ScriptRuntime, ScriptHandle } from "./runtime";

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
 * Options for creating the Function-based runtime
 */
export interface FunctionRuntimeOptions {
	/** Path utilities for path operations */
	pathUtils?: PathUtils;
	/** Optional module resolver for shared modules */
	moduleResolver?: ModuleResolver;
}

/**
 * Function-based script runtime that uses the Function constructor for execution.
 * This is the default runtime that maintains backward compatibility with the original ScriptExecutor.
 *
 * Security Note: This runtime uses the Function constructor to execute user-provided scripts.
 * This is intentional and necessary for the dynamic script loading functionality.
 * Scripts should only be loaded from trusted sources.
 */
export class FunctionRuntime implements ScriptRuntime {
	private contextConfig: ExecutionContextConfig;
	private options?: FunctionRuntimeOptions;
	private handles: Map<string, ScriptHandle> = new Map();
	private moduleCache: Map<string, unknown> = new Map();
	private moduleResolutionCache: Map<string, string> = new Map();
	private moduleLoaders: Map<string, Promise<void>> = new Map();

	constructor(contextConfig: ExecutionContextConfig, options?: FunctionRuntimeOptions) {
		this.contextConfig = contextConfig;
		this.options = options;
	}

	/**
	 * No initialization needed for Function-based runtime
	 */
	async initialize(): Promise<void> {
		// No-op for Function runtime
	}

	/**
	 * Load a script using the Function constructor
	 */
	async load(code: string, scriptPath: string, context: ScriptExecutionContext): Promise<ScriptHandle> {
		const module = { exports: {} as Record<string, unknown> };
		if (this.options?.moduleResolver) {
			await this.preloadRequires(code, scriptPath, context);
		}
		const localRequire = this.getLocalRequire(scriptPath);
		const dirname = this.getDirname(scriptPath);

		// Get context variables from configuration
		const contextVars = this.contextConfig.provideContext(scriptPath, context);

		// Build function parameters
		const baseParams = ["module", "exports"];
		if (localRequire) {
			baseParams.push("require");
		}
		baseParams.push("__filename", "__dirname");
		const allParams = [...baseParams, ...this.contextConfig.variableNames];

		// Build function arguments
		const baseArgs: unknown[] = [module, module.exports];
		if (localRequire) {
			baseArgs.push(localRequire);
		}
		baseArgs.push(scriptPath, dirname);
		const contextArgs = this.contextConfig.variableNames.map(name => contextVars[name]);
		const allArgs = [...baseArgs, ...contextArgs];

		// Execute the script code in a function scope
		const runner = new Function(...allParams, code);
		runner(...allArgs);

		const rawExports = module.exports as { default?: unknown } | undefined;
		// Return default export if available, otherwise return the entire exports object
		const exports = rawExports?.default ?? rawExports;

		// Create and store handle
		const handle: ScriptHandle = {
			id: scriptPath,
			exports,
		};
		this.handles.set(scriptPath, handle);

		return handle;
	}

	/**
	 * Invoke a function from a loaded script's exports
	 */
	async invokeById(scriptId: string, exportPath: string, args: unknown[]): Promise<unknown> {
		const handle = this.handles.get(scriptId);
		if (!handle) {
			throw new Error(`Script not found: ${scriptId}`);
		}

		const targetFn = this.resolveExport(handle.exports, exportPath);
		if (typeof targetFn !== "function") {
			throw new Error(`Export '${exportPath}' in script '${scriptId}' is not a function`);
		}

		return targetFn(...args);
	}

	/**
	 * Get an exported value from a loaded script
	 */
	async getExportById(scriptId: string, exportPath: string): Promise<unknown> {
		const handle = this.handles.get(scriptId);
		if (!handle) {
			throw new Error(`Script not found: ${scriptId}`);
		}

		return this.resolveExport(handle.exports, exportPath);
	}

	/**
	 * Unload a specific script and release its resources
	 */
	async unload(scriptId: string): Promise<void> {
		this.handles.delete(scriptId);
	}

	/**
	 * Clean up all loaded scripts
	 */
	async dispose(): Promise<void> {
		this.handles.clear();
		this.moduleCache.clear();
		this.moduleResolutionCache.clear();
		this.moduleLoaders.clear();
	}

	/**
	 * Resolve a dot-separated export path from the exports object
	 * @example resolveExport(exports, "default") => exports
	 * @example resolveExport(exports, "handlers.process") => exports.handlers.process
	 */
	private resolveExport(exports: unknown, exportPath: string): unknown {
		if (exportPath === "default" || exportPath === "") {
			return exports;
		}

		const parts = exportPath.split(".");
		let current: unknown = exports;

		for (const part of parts) {
			if (current == null || typeof current !== "object") {
				throw new Error(`Cannot resolve export path '${exportPath}': '${part}' is not an object`);
			}
			current = (current as Record<string, unknown>)[part];
		}

		return current;
	}

	/**
	 * Create a resolver-backed require function when a ModuleResolver is provided.
	 */
	private getLocalRequire(scriptPath: string): RequireFn | undefined {
		if (!this.options?.moduleResolver) {
			return undefined;
		}
		return (specifier: string) => this.requireFromCache(specifier, scriptPath);
	}

	private requireFromCache(specifier: string, fromPath: string): unknown {
		const resolvedPath = this.getResolvedPath(specifier, fromPath);
		const cached = this.moduleCache.get(resolvedPath);
		if (cached === undefined) {
			throw new Error(`Module '${specifier}' from '${fromPath}' was not preloaded`);
		}
		return cached;
	}

	private getResolvedPath(specifier: string, fromPath: string): string {
		const cacheKey = this.getResolutionKey(fromPath, specifier);
		const resolved = this.moduleResolutionCache.get(cacheKey);
		if (!resolved) {
			throw new Error(`Cannot resolve module '${specifier}' from '${fromPath}'`);
		}
		return resolved;
	}

	private getResolutionKey(fromPath: string, specifier: string): string {
		return `${fromPath}::${specifier}`;
	}

	private async preloadRequires(
		code: string,
		fromPath: string,
		context: ScriptExecutionContext
	): Promise<void> {
		const resolver = this.options?.moduleResolver;
		if (!resolver) {
			return;
		}

		const specifiers = this.extractRequireSpecifiers(code);
		for (const specifier of specifiers) {
			const cacheKey = this.getResolutionKey(fromPath, specifier);
			if (!this.moduleResolutionCache.has(cacheKey)) {
				const resolvedPath = await resolver.resolve(specifier, fromPath);
				if (!resolvedPath) {
					throw new Error(`Cannot resolve module '${specifier}' from '${fromPath}'`);
				}
				this.moduleResolutionCache.set(cacheKey, resolvedPath);
				await this.loadModule(resolvedPath, context);
			}
		}
	}

	private async loadModule(resolvedPath: string, context: ScriptExecutionContext): Promise<void> {
		if (this.moduleCache.has(resolvedPath)) {
			return;
		}
		const existing = this.moduleLoaders.get(resolvedPath);
		if (existing) {
			await existing;
			return;
		}

		const loader = this.executeModule(resolvedPath, context);
		this.moduleLoaders.set(resolvedPath, loader);
		try {
			await loader;
		} finally {
			this.moduleLoaders.delete(resolvedPath);
		}
	}

	private async executeModule(resolvedPath: string, context: ScriptExecutionContext): Promise<void> {
		const resolver = this.options?.moduleResolver;
		if (!resolver) {
			throw new Error("Module resolver is not configured");
		}

		const moduleInfo = await resolver.load(resolvedPath);
		const module = { exports: {} as Record<string, unknown> };
		this.moduleCache.set(resolvedPath, module.exports);

		await this.preloadRequires(moduleInfo.code, resolvedPath, context);

		const dirname = this.getDirname(resolvedPath);
		const localRequire = (specifier: string) => this.requireFromCache(specifier, resolvedPath);

		const contextVars = this.contextConfig.provideContext(resolvedPath, context);
		const baseParams = ["module", "exports", "require", "__filename", "__dirname"];
		const allParams = [...baseParams, ...this.contextConfig.variableNames];
		const baseArgs: unknown[] = [module, module.exports, localRequire, resolvedPath, dirname];
		const contextArgs = this.contextConfig.variableNames.map(name => contextVars[name]);
		const allArgs = [...baseArgs, ...contextArgs];

		const runner = new Function(...allParams, moduleInfo.code);
		runner(...allArgs);

		this.moduleCache.set(resolvedPath, module.exports);
	}

	private extractRequireSpecifiers(code: string): string[] {
		const matches = code.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g);
		const specifiers: string[] = [];
		for (const match of matches) {
			if (match[1]) {
				specifiers.push(match[1]);
			}
		}
		return specifiers;
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
