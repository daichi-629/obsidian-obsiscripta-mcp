import { ScriptExecutionContext } from "./types";

/**
 * Handle to a loaded script that can be invoked or queried for exports.
 * This is an opaque reference stored in the registry.
 */
export interface ScriptHandle {
	/** Unique identifier for the script (typically the script path) */
	id: string;
	/** The raw exports object from the script */
	exports: unknown;
}

/**
 * Abstract interface for script runtime execution.
 * Implementations can use Function constructor, SES compartments, or other execution strategies.
 */
export interface ScriptRuntime {
	/**
	 * Optional initialization hook for runtime setup (e.g., SES lockdown).
	 * Called once before any scripts are loaded.
	 */
	initialize?(): Promise<void>;

	/**
	 * Load and compile a script, returning a handle that can be used for invocation.
	 * @param code - Compiled JavaScript code
	 * @param scriptPath - Absolute path to the script file
	 * @param context - Execution context for the script
	 * @returns A handle to the loaded script
	 */
	load(code: string, scriptPath: string, context: ScriptExecutionContext): Promise<ScriptHandle>;

	/**
	 * Invoke a function exported by a script.
	 * @param scriptId - Script identifier (from ScriptHandle.id)
	 * @param exportPath - Dot-separated path to the export (e.g., "default", "handlers.process")
	 * @param args - Arguments to pass to the function
	 * @returns The return value of the function
	 * @throws Error if the export is not a function or doesn't exist
	 */
	invokeById(scriptId: string, exportPath: string, args: unknown[]): Promise<unknown>;

	/**
	 * Get an exported value from a script.
	 * @param scriptId - Script identifier (from ScriptHandle.id)
	 * @param exportPath - Dot-separated path to the export (e.g., "default", "config.apiKey")
	 * @returns The exported value
	 * @throws Error if the export doesn't exist
	 */
	getExportById(scriptId: string, exportPath: string): Promise<unknown>;

	/**
	 * Unload a specific script and release its resources.
	 * @param scriptId - Script identifier to unload
	 */
	unload?(scriptId: string): Promise<void>;

	/**
	 * Optional cleanup hook for disposing all runtime resources.
	 */
	dispose?(): Promise<void>;
}
