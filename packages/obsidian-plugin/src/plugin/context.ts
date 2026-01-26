import { App, EventRef, Vault } from "obsidian";
import type MCPPlugin from "../main";

/**
 * Minimal application context interface.
 * Exposes only the essential Obsidian primitives needed by tool handlers.
 * This is the primary context interface used throughout the plugin.
 */
export interface AppContext {
	/** Obsidian Vault API for file system operations */
	vault: Vault;
	/** Obsidian App instance for global app state */
	app: App;
	/** Plugin instance for plugin-specific features */
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
