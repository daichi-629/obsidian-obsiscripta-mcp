import { App, EventRef, Vault } from "obsidian";
import type MCPPlugin from "../main";

/**
 * Minimal application context interface.
 * Exposes only the essential Obsidian primitives needed by tool handlers.
 * This is the primary context interface used throughout the plugin.
 *
 * Note: This intentionally excludes the plugin instance to minimize coupling.
 * Most tool handlers should only need access to the vault and app.
 */
export interface AppContext {
	/** Obsidian Vault API for file system operations */
	vault: Vault;
	/** Obsidian App instance for global app state */
	app: App;
}

/**
 * Extended context for script execution.
 * Includes the plugin instance which is exposed to user scripts as a runtime API.
 * Scripts can access the plugin through closure, even though tool handlers
 * only receive the minimal AppContext.
 */
export interface ScriptExecutionContext extends AppContext {
	/** Plugin instance exposed to user scripts */
	plugin: MCPPlugin;
}

/**
 * Event registration interface for decoupled lifecycle management.
 * Allows components to register cleanup handlers without depending on the full Plugin.
 * Matches Obsidian's Plugin.registerEvent signature.
 */
export interface EventRegistrar {
	/**
	 * Register an event to be automatically cleaned up on plugin unload.
	 */
	registerEvent(eventRef: EventRef): void;
}
