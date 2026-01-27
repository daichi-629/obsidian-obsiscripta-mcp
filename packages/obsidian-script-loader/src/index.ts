// ============================================================================
// Obsidian-specific wrapper and adapters
// ============================================================================

/**
 * Main Obsidian script loader (wraps core with adapters)
 */
export { ScriptLoader } from "./script-loader";

/**
 * Event registration interface for Obsidian plugins
 */
export type { EventRegistrar } from "./adapters/obsidian-vault-adapter";

/**
 * Obsidian adapters for core interfaces
 */
export { ObsidianVaultAdapter } from "./adapters/obsidian-vault-adapter";
export { ObsidianPathUtils } from "./adapters/obsidian-path-utils";
export { ObsidianLogger } from "./adapters/obsidian-logger";

// ============================================================================
// Re-export core classes for convenience
// ============================================================================

export { ScriptRegistry, ScriptCompiler, ScriptExecutor } from "@obsiscripta/script-loader-core";

// ============================================================================
// Types
// ============================================================================

/**
 * Obsidian-specific execution context
 */
export type { ScriptExecutionContext } from "./types";

/**
 * Re-export core types
 */
export type {
	ExecutionContextConfig,
	RequireOptions,
	ScriptMetadata,
	ScriptLoaderCallbacks,
	ScriptLoaderType,
	Logger,
	PathUtils,
	ScriptHost,
} from "@obsiscripta/script-loader-core";
