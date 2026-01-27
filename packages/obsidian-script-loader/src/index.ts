// ============================================================================
// Core Classes
// ============================================================================

/**
 * Main orchestrator for script loading and watching
 */
export { ScriptLoader } from "./script-loader";

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
// Types
// ============================================================================

/**
 * Configuration for script execution context
 */
export type { ExecutionContextConfig } from "./script-executor";

/**
 * Context for script execution
 */
export type { ScriptExecutionContext } from "./types";

/**
 * Event registration interface for lifecycle management
 */
export type { EventRegistrar } from "./types";

/**
 * Metadata for a loaded script
 */
export type { ScriptMetadata } from "./types";

/**
 * Callbacks for script lifecycle events
 */
export type { ScriptLoaderCallbacks } from "./types";

/**
 * Script file type (js or ts)
 */
export type { ScriptLoaderType } from "./types";
