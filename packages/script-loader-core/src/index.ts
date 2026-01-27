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
export { ScriptCompiler } from "./script-compiler";

/**
 * Script executor with context injection
 */
export { ScriptExecutor } from "./script-executor";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Configuration for script execution context
 */
export type { ExecutionContextConfig, RequireOptions } from "./script-executor";

/**
 * Abstract interfaces for platform adaptation
 */
export type {
	ScriptHost,
	PathUtils,
	Logger,
	FileInfo,
	Disposable,
	WatchHandlers,
} from "./types";

/**
 * Script metadata and lifecycle types
 */
export type {
	ScriptMetadata,
	ScriptLoaderCallbacks,
	ScriptLoaderType,
	ScriptExecutionContext,
} from "./types";
