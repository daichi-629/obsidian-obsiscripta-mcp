import { ModuleResolver, ModuleResolution, ScriptExecutionContext, ScriptCompiler } from "./types";
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
	/** Optional module resolver for shared modules */
	moduleResolver?: ModuleResolver;
	/** Optional compiler for module resolver sources */
	moduleCompiler?: ScriptCompiler;
	/** Optional dirname resolver for identifiers */
	dirnameResolver?: (identifier: string) => string;
}

/**
 * Function-based script runtime that uses the Function constructor for execution.
 * This is the default runtime for executing scripts.
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
	private moduleResolutionCache: Map<string, ModuleResolution> = new Map();
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
	async load(code: string, identifier: string, context: ScriptExecutionContext): Promise<ScriptHandle> {
		const module = { exports: {} as Record<string, unknown> };
		if (this.options?.moduleResolver) {
			await this.preloadRequires(code, identifier, context);
		}
		const localRequire = this.getLocalRequire(identifier);
		const dirname = this.getDirname(identifier);

		// Get context variables from configuration
		const contextVars = this.contextConfig.provideContext(identifier, context);

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
		baseArgs.push(identifier, dirname);
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
			id: identifier,
			exports,
		};
		this.handles.set(identifier, handle);

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
	private getLocalRequire(identifier: string): RequireFn | undefined {
		if (!this.options?.moduleResolver) {
			return undefined;
		}
		return (specifier: string) => this.requireFromCache(specifier, identifier);
	}

	private requireFromCache(specifier: string, fromIdentifier: string): unknown {
		const resolvedId = this.getResolvedId(specifier, fromIdentifier);
		const cached = this.moduleCache.get(resolvedId);
		if (cached === undefined) {
			throw new Error(`Module '${specifier}' from '${fromIdentifier}' was not preloaded`);
		}
		return cached;
	}

	private getResolvedId(specifier: string, fromIdentifier: string): string {
		const cacheKey = this.getResolutionKey(fromIdentifier, specifier);
		const resolved = this.moduleResolutionCache.get(cacheKey);
		if (!resolved) {
			throw new Error(`Cannot resolve module '${specifier}' from '${fromIdentifier}'`);
		}
		return resolved.id;
	}

	private getResolutionKey(fromIdentifier: string, specifier: string): string {
		return `${fromIdentifier}::${specifier}`;
	}

	private async preloadRequires(
		code: string,
		fromIdentifier: string,
		context: ScriptExecutionContext
	): Promise<void> {
		const resolver = this.options?.moduleResolver;
		if (!resolver) {
			return;
		}

		const specifiers = this.extractRequireSpecifiers(code);
		for (const specifier of specifiers) {
			const cacheKey = this.getResolutionKey(fromIdentifier, specifier);
			if (!this.moduleResolutionCache.has(cacheKey)) {
				const resolution = await resolver.resolve(specifier, fromIdentifier);
				if (!resolution) {
					throw new Error(`Cannot resolve module '${specifier}' from '${fromIdentifier}'`);
				}
				this.moduleResolutionCache.set(cacheKey, resolution);
				await this.loadModule(resolution, context);
			}
		}
	}

	private async loadModule(resolution: ModuleResolution, context: ScriptExecutionContext): Promise<void> {
		if (this.moduleCache.has(resolution.id)) {
			return;
		}
		const existing = this.moduleLoaders.get(resolution.id);
		if (existing) {
			await existing;
			return;
		}

		const loader = this.executeModule(resolution, context);
		this.moduleLoaders.set(resolution.id, loader);
		try {
			await loader;
		} finally {
			this.moduleLoaders.delete(resolution.id);
		}
	}

	private async executeModule(resolution: ModuleResolution, context: ScriptExecutionContext): Promise<void> {
		let moduleCode = resolution.code;
		if (this.options?.moduleCompiler && resolution.loader && !resolution.compiled) {
			moduleCode = await this.options.moduleCompiler.compile(
				resolution.id,
				resolution.code,
				resolution.loader,
				resolution.mtime
			);
		}
		const module = { exports: {} as Record<string, unknown> };
		this.moduleCache.set(resolution.id, module.exports);

		await this.preloadRequires(moduleCode, resolution.id, context);

		const dirname = this.getDirname(resolution.id);
		const localRequire = (specifier: string) => this.requireFromCache(specifier, resolution.id);

		const contextVars = this.contextConfig.provideContext(resolution.id, context);
		const baseParams = ["module", "exports", "require", "__filename", "__dirname"];
		const allParams = [...baseParams, ...this.contextConfig.variableNames];
		const baseArgs: unknown[] = [module, module.exports, localRequire, resolution.id, dirname];
		const contextArgs = this.contextConfig.variableNames.map(name => contextVars[name]);
		const allArgs = [...baseArgs, ...contextArgs];

		const runner = new Function(...allParams, moduleCode);
		runner(...allArgs);

		this.moduleCache.set(resolution.id, module.exports);
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
	private getDirname(identifier: string): string {
		if (this.options?.dirnameResolver) {
			return this.options.dirnameResolver(identifier);
		}
		return "";
	}
}
