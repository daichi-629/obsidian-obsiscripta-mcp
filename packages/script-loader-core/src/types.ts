/**
 * File information returned by ScriptHost.readFile
 */
export interface FileInfo {
	/** File contents as string */
	contents: string;
	/** Last modification time (Unix timestamp in milliseconds) */
	mtime: number;
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
	onCreate?: (identifier: string) => void;
	onModify?: (identifier: string) => void;
	onDelete?: (identifier: string) => void;
	onRename?: (newIdentifier: string, oldIdentifier: string) => void;
}

/**
 * Abstract interface for file system operations.
 * Platform-specific implementations provide access to files.
 */
export interface ScriptHost {
	/**
	 * Read a script by identifier and return its contents and modification time
	 */
	readFile(identifier: string): Promise<FileInfo>;

	/**
	 * List all available script identifiers
	 */
	listFiles(): Promise<ScriptFileEntry[]>;

	/**
	 * Watch for script changes
	 * @returns Disposable to stop watching
	 */
	watch(handlers: WatchHandlers): Disposable;

	/**
	 * Optional tool name derivation for identifiers.
	 */
	deriveToolName?(identifier: string, loader?: ScriptLoaderType): string;
}

/**
 * Script file entry returned by ScriptHost.listFiles
 */
export interface ScriptFileEntry {
	/** Script identifier */
	identifier: string;
	/** Loader type used for compilation */
	loader: ScriptLoaderType;
}

/**
 * Abstract interface for module resolution and loading.
 * Implementations define platform-specific rules and access.
 */
export interface ModuleResolver {
	resolve(specifier: string, fromIdentifier: string): Promise<ModuleResolution | null>;
	clearCache?(): void;
}

export interface ModuleResolution {
	id: string;
	code: string;
	mtime?: number;
	/** Optional loader type to enable runtime compilation */
	loader?: ScriptLoaderType;
	/** When true, code is already compiled and should not be recompiled */
	compiled?: boolean;
}

/**
 * Abstract interface for script compilation with caching.
 */
export interface ScriptCompiler {
	compile(path: string, source: string, loader: ScriptLoaderType, mtime?: number): Promise<string>;
	invalidate(path: string): void;
	clear(): void;
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
	/** Script identifier */
	identifier: string;
	/** Tool name derived from the script identifier */
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
	onScriptError?: (identifier: string, error: Error) => void;
}

/**
 * Script file type
 */
export type ScriptLoaderType = string;

/**
 * Generic execution context for scripts.
 * The actual shape is determined by the platform adapter.
 */
export type ScriptExecutionContext = Record<string, unknown>;
