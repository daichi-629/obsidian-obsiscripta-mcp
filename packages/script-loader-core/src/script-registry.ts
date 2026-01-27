import { ScriptMetadata } from "./types";

/**
 * Central registry for loaded scripts.
 * Manages script metadata and lifecycle independently of tool registration.
 */
export class ScriptRegistry {
	private scripts: Map<string, ScriptMetadata> = new Map();

	/**
	 * Register a script with its metadata
	 */
	register(metadata: ScriptMetadata): void {
		this.scripts.set(metadata.path, metadata);
	}

	/**
	 * Unregister a script by its path
	 */
	unregister(path: string): void {
		this.scripts.delete(path);
	}

	/**
	 * Get script metadata by path
	 */
	get(path: string): ScriptMetadata | undefined {
		return this.scripts.get(path);
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
	 * Get all script paths
	 */
	getPaths(): string[] {
		return Array.from(this.scripts.keys());
	}

	/**
	 * Check if a script is registered
	 */
	has(path: string): boolean {
		return this.scripts.has(path);
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
}
