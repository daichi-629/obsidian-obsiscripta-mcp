import { ScriptMetadata } from "./types";
import { ScriptRuntime } from "./runtime";

/**
 * Central registry for loaded scripts.
 * Manages script metadata, handles, and provides execution interface.
 */
export class ScriptRegistry {
	private scripts: Map<string, ScriptMetadata> = new Map();
	private runtime: ScriptRuntime;

	/**
	 * Create a new script registry with the specified runtime.
	 * @param runtime - The runtime to use for script execution
	 */
	constructor(runtime: ScriptRuntime) {
		this.runtime = runtime;
	}

	/**
	 * Register a script with its metadata (including handle)
	 */
	register(metadata: ScriptMetadata): void {
		this.scripts.set(metadata.identifier, metadata);
	}

	/**
	 * Unregister a script by its identifier
	 */
	unregister(identifier: string): void {
		this.scripts.delete(identifier);
	}

	/**
	 * Get script metadata by identifier
	 */
	get(identifier: string): ScriptMetadata | undefined {
		return this.scripts.get(identifier);
	}

	/**
	 * Get all scripts that define a specific name
	 */
	getByName(name: string): ScriptMetadata[] {
		const results: ScriptMetadata[] = [];
		for (const metadata of this.scripts.values()) {
			if (metadata.name === name) {
				results.push(metadata);
			}
		}
		return results;
	}

	/**
	 * Get all registered scripts
	 */
	getAll(): ScriptMetadata[] {
		return Array.from(this.scripts.values());
	}

	/**
	 * Get all script identifiers
	 */
	getIdentifiers(): string[] {
		return Array.from(this.scripts.keys());
	}

	/**
	 * Check if a script is registered
	 */
	has(identifier: string): boolean {
		return this.scripts.has(identifier);
	}

	/**
	 * Clear all registered scripts
	 */
	clear(): void {
		this.scripts.clear();
	}

	/**
	 * Get the count of registered scripts
	 */
	count(): number {
		return this.scripts.size;
	}

	/**
	 * Invoke a function exported by a script.
	 * @param identifier - Script identifier
	 * @param exportPath - Dot-separated path to the export (e.g., "default", "handlers.process")
	 * @param args - Arguments to pass to the function
	 * @returns The return value of the function
	 * @throws Error if the script is not found or export is not a function
	 */
	async invoke(identifier: string, exportPath: string, args: unknown[]): Promise<unknown> {
		const metadata = this.scripts.get(identifier);
		if (!metadata) {
			throw new Error(`Script not found: ${identifier}`);
		}
		if (!metadata.handle) {
			throw new Error(`Script not loaded with runtime support: ${identifier}.`);
		}

		return this.runtime.invokeById(metadata.handle.id, exportPath, args);
	}

	/**
	 * Get an exported value from a script.
	 * @param identifier - Script identifier
	 * @param exportPath - Dot-separated path to the export (e.g., "default", "config.apiKey")
	 * @returns The exported value
	 * @throws Error if the script is not found or export doesn't exist
	 */
	async getExport(identifier: string, exportPath: string): Promise<unknown> {
		const metadata = this.scripts.get(identifier);
		if (!metadata) {
			throw new Error(`Script not found: ${identifier}`);
		}
		if (!metadata.handle) {
			throw new Error(`Script not loaded with runtime support: ${identifier}.`);
		}

		return this.runtime.getExportById(metadata.handle.id, exportPath);
	}
}
