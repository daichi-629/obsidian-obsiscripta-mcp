import { App, EventRef, Vault } from "obsidian";

/**
 * Context for script execution.
 * Contains the Obsidian environment that scripts can access.
 */
export interface ScriptExecutionContext {
	/** Obsidian Vault API for file system operations */
	vault: Vault;
	/** Obsidian App instance for global app state */
	app: App;
	/** Plugin instance exposed to user scripts */
	plugin: unknown;
}

/**
 * Event registration interface for decoupled lifecycle management.
 * Allows components to register cleanup handlers without depending on the full Plugin.
 */
export interface EventRegistrar {
	/**
	 * Register an event to be automatically cleaned up on plugin unload.
	 */
	registerEvent(eventRef: EventRef): void;
}

/**
 * Metadata for a loaded script
 */
export interface ScriptMetadata {
	/** Path to the script file */
	path: string;
	/** Name of the definition exported by this script */
	name: string;
	/** Last modification time of the script file */
	mtime: number;
	/** Compiled code */
	compiledCode: string;
}

/**
 * Callbacks for script lifecycle events
 */
export interface ScriptLoaderCallbacks {
	/** Called when a script is successfully loaded and compiled
	 * @param metadata - Script metadata
	 * @param exports - Whatever the script exported (default export or module.exports)
	 */
	onScriptLoaded?: (metadata: ScriptMetadata, exports: unknown) => void;
	/** Called when a script is unloaded (deleted or replaced) */
	onScriptUnloaded?: (metadata: ScriptMetadata) => void;
	/** Called when a script fails to load or compile */
	onScriptError?: (path: string, error: Error) => void;
}

/**
 * Script loader type
 */
export type ScriptLoaderType = "js" | "ts";
