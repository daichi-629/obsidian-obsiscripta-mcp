/**
 * Test helpers and mock implementations for script-loader-core tests.
 * These provide standard implementations of the abstract interfaces.
 */

import type {
	ScriptHost,
	Logger,
	FileInfo,
	Disposable,
	WatchHandlers,
	ScriptFileEntry,
	ScriptLoaderType,
} from "../types";

/**
 * Mock file system for testing
 */
export class MockScriptHost implements ScriptHost {
	private files = new Map<string, { contents: string; mtime: number }>();
	private watchers: WatchHandlers[] = [];

	setFile(identifier: string, contents: string, mtime: number = Date.now()): void {
		this.files.set(identifier, { contents, mtime });
	}

	deleteFile(identifier: string): void {
		this.files.delete(identifier);
	}

	updateFile(identifier: string, contents: string, mtime: number = Date.now()): void {
		this.setFile(identifier, contents, mtime);
	}

	triggerCreate(identifier: string): void {
		this.watchers.forEach((handlers) => {
			handlers.onCreate?.(identifier);
		});
	}

	triggerModify(identifier: string): void {
		this.watchers.forEach((handlers) => {
			handlers.onModify?.(identifier);
		});
	}

	triggerDelete(identifier: string): void {
		this.watchers.forEach((handlers) => {
			handlers.onDelete?.(identifier);
		});
	}

	async readFile(identifier: string): Promise<FileInfo> {
		const file = this.files.get(identifier);
		if (!file) {
			throw new Error(`File not found: ${identifier}`);
		}
		return file;
	}

	async listFiles(): Promise<ScriptFileEntry[]> {
		const files: ScriptFileEntry[] = [];
		for (const [identifier] of this.files) {
			const loader = this.getLoaderForPath(identifier);
			if (loader) {
				files.push({ identifier, loader });
			}
		}
		return files;
	}

	watch(handlers: WatchHandlers): Disposable {
		this.watchers.push(handlers);
		return {
			dispose: () => {
				const index = this.watchers.indexOf(handlers);
				if (index >= 0) {
					this.watchers.splice(index, 1);
				}
			},
		};
	}

	private getLoaderForPath(filePath: string): ScriptLoaderType | null {
		const lowerPath = filePath.toLowerCase();
		if (lowerPath.endsWith(".js")) {
			return "js";
		}
		if (lowerPath.endsWith(".ts") && !lowerPath.endsWith(".d.ts")) {
			return "ts";
		}
		return null;
	}
}

/**
 * Mock logger that captures log messages for assertions
 */
export class MockLogger implements Logger {
	logs: Array<{ level: string; message: string; args: unknown[] }> = [];

	debug(message: string, ...args: unknown[]): void {
		this.logs.push({ level: "debug", message, args });
	}

	info(message: string, ...args: unknown[]): void {
		this.logs.push({ level: "info", message, args });
	}

	warn(message: string, ...args: unknown[]): void {
		this.logs.push({ level: "warn", message, args });
	}

	error(message: string, ...args: unknown[]): void {
		this.logs.push({ level: "error", message, args });
	}

	clear(): void {
		this.logs = [];
	}

	hasError(): boolean {
		return this.logs.some((log) => log.level === "error");
	}

	getErrors(): Array<{ message: string; args: unknown[] }> {
		return this.logs
			.filter((log) => log.level === "error")
			.map(({ message, args }) => ({ message, args }));
	}
}

/**
 * Helper to create a delay for testing async behavior
 */
export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper to wait for a condition to become true
 */
export async function waitFor(
	condition: () => boolean,
	timeoutMs: number = 1000,
	checkIntervalMs: number = 10
): Promise<void> {
	const startTime = Date.now();
	while (!condition()) {
		if (Date.now() - startTime > timeoutMs) {
			throw new Error("Timeout waiting for condition");
		}
		await delay(checkIntervalMs);
	}
}
