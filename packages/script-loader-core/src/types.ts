/**
 * File information returned by ScriptHost.readFile
 */
export interface FileInfo {
	/** File contents as string */
	contents: string;
	/** Last modification time (Unix timestamp in milliseconds) */
	mtime: number;
	/** Explicit loader type for this source (owned by ScriptHost implementation) */
	loaderType: ScriptLoaderType;
}

/**
 * Disposable resource that can be cleaned up
 */
export interface Disposable {
	dispose(): void;
}

/**
 * Handlers for file system watch events
 */
export interface WatchHandlers {
	onCreate?: (path: string) => void;
	onModify?: (path: string) => void;
	onDelete?: (path: string) => void;
	onRename?: (newPath: string, oldPath: string) => void;
}

/**
 * Abstract interface for file system operations.
 * Platform-specific implementations provide access to files.
 */
export interface ScriptHost {
	/**
	 * Read a script and return source, loader type, and modification time
	 */
	readFile(path: string): Promise<FileInfo>;

	/**
	 * List all script files recursively in a directory.
	 *
	 * The returned paths are treated as loadable scripts by the core.
	 * Script selection rules are owned by the ScriptHost implementation.
	 */
	listFiles(root: string): Promise<string[]>;

	/**
	 * Watch a directory for file changes
	 * @returns Disposable to stop watching
	 */
	watch(root: string, handlers: WatchHandlers): Disposable;

	/**
	 * Check if a path exists
	 */
	exists(path: string): Promise<boolean>;

	/**
	 * Ensure a directory exists (create if needed)
	 */
	ensureDirectory(path: string): Promise<void>;
}

/**
 * Abstract interface for path operations.
 * Platform-specific implementations handle path normalization.
 */
export interface PathUtils {
	/**
	 * Normalize a path (handle separators, relative segments)
	 */
	normalize(path: string): string;

	/**
	 * Check if a path is absolute
	 */
	isAbsolute(path: string): boolean;

	/**
	 * Join path segments
	 */
	join(...paths: string[]): string;

	/**
	 * Get the directory name of a path
	 */
	dirname(path: string): string;

	/**
	 * Get the relative path from 'from' to 'to'
	 */
	relative(from: string, to: string): string;
}

/**
 * Abstract interface for module resolution and loading.
 * Implementations define platform-specific rules and access.
 */
export interface ModuleResolver {
	resolve(specifier: string, fromPath: string): Promise<string | null>;
	load(resolvedPath: string): Promise<{ code: string; mtime?: number }>;
	clearCache?(): void;
}

/**
 * Abstract interface for logging.
 * Platform-specific implementations handle log output.
 */
export interface Logger {
	debug(message: string, ...args: unknown[]): void;
	info(message: string, ...args: unknown[]): void;
	warn(message: string, ...args: unknown[]): void;
	error(message: string, ...args: unknown[]): void;
}

/**
 * Metadata for a loaded script
 */
export interface ScriptMetadata {
	/** Path to the script file */
	path: string;
	/** Tool name derived from the script path relative to the watched folder */
	name: string;
	/** Last modification time of the script file */
	mtime: number;
	/** Compiled code */
	compiledCode: string;
	/** Handle to the loaded script for invocation (optional for backward compatibility) */
	handle?: import("./runtime").ScriptHandle;
}

/**
 * Callbacks for script lifecycle events
 */
export interface ScriptLoaderCallbacks {
	/** Called when a script is successfully loaded and compiled */
	onScriptLoaded?: (metadata: ScriptMetadata, exports: unknown) => void;
	/** Called when a script is unloaded (deleted or replaced) */
	onScriptUnloaded?: (metadata: ScriptMetadata) => void;
	/** Called when a script fails to load or compile */
	onScriptError?: (path: string, error: Error) => void;
	/** Optional filter to decide whether a script should register */
	isScriptPath?: (path: string) => boolean;
}

/**
 * Script file type
 */
export type ScriptLoaderType = "js" | "ts";

/**
 * Generic execution context for scripts.
 * The actual shape is determined by the platform adapter.
 */
export type ScriptExecutionContext = Record<string, unknown>;
