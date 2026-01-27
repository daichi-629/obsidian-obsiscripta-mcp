import { App, Vault } from "obsidian";

/**
 * Obsidian-specific execution context for scripts.
 * Contains the Obsidian environment that scripts can access.
 * Extends Record to be compatible with the core ScriptExecutionContext type.
 */
export interface ScriptExecutionContext extends Record<string, unknown> {
	/** Obsidian Vault API for file system operations */
	vault: Vault;
	/** Obsidian App instance for global app state */
	app: App;
	/** Plugin instance exposed to user scripts */
	plugin: unknown;
}

// Re-export core types for backward compatibility
export type {
	ScriptMetadata,
	ScriptLoaderCallbacks,
	ScriptLoaderType,
	Logger,
	PathUtils,
	ScriptHost,
} from "@obsiscripta/script-loader-core";
