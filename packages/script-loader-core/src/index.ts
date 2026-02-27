// ============================================================================
// Core Classes
// ============================================================================

/**
 * Main orchestrator for script loading and watching
 */
export { ScriptLoaderCore } from "./script-loader-core";

/**
 * Registry for tracking loaded scripts
 */
export { ScriptRegistry } from "./script-registry";

/**
 * TypeScript/JavaScript compiler with caching
 */
export { DefaultScriptCompiler } from "./script-compiler";


/**
 * Function-based script runtime
 */
export { FunctionRuntime } from "./function-runtime";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Runtime abstraction for script execution
 */
export type { ScriptRuntime, ScriptHandle } from "./runtime";

/**
 * Configuration for script execution context
 */
export type { ExecutionContextConfig } from "./function-runtime";


/**
 * Options for FunctionRuntime
 */
export type { FunctionRuntimeOptions } from "./function-runtime";

/**
 * Abstract interfaces for platform adaptation
 */
export type {
	ScriptHost,
	Logger,
	FileInfo,
	Disposable,
	WatchHandlers,
	ModuleResolver,
	ScriptFileEntry,
	ScriptCompiler,
} from "./types";

/**
 * Script metadata and lifecycle types
 */
export type {
	ScriptMetadata,
	ScriptLoaderCallbacks,
	ScriptLoaderType,
	ScriptExecutionContext,
	ModuleResolution,
} from "./types";
