/**
 * Test helpers and mock implementations for script-loader-core tests.
 * These provide standard implementations of the abstract interfaces.
 */

import type {
	ScriptHost,
	PathUtils,
	Logger,
	FileInfo,
	Disposable,
	WatchHandlers,
} from "../types";

/**
 * Mock file system for testing
 */
export class MockScriptHost implements ScriptHost {
	private files = new Map<string, { contents: string; mtime: number }>();
	private watchers: Array<{ root: string; handlers: WatchHandlers }> = [];

	setFile(path: string, contents: string, mtime: number = Date.now()): void {
		this.files.set(path, { contents, mtime });
	}

	deleteFile(path: string): void {
		this.files.delete(path);
	}

	updateFile(path: string, contents: string, mtime: number = Date.now()): void {
		this.setFile(path, contents, mtime);
	}

	triggerCreate(path: string): void {
		this.watchers.forEach((w) => {
			if (path.startsWith(w.root)) {
				w.handlers.onCreate?.(path);
			}
		});
	}

	triggerModify(path: string): void {
		this.watchers.forEach((w) => {
			if (path.startsWith(w.root)) {
				w.handlers.onModify?.(path);
			}
		});
	}

	triggerDelete(path: string): void {
		this.watchers.forEach((w) => {
			if (path.startsWith(w.root)) {
				w.handlers.onDelete?.(path);
			}
		});
	}

	async readFile(path: string): Promise<FileInfo> {
		const file = this.files.get(path);
		if (!file) {
			throw new Error(`File not found: ${path}`);
		}
		return file;
	}

	async listFiles(root: string): Promise<string[]> {
		const files: string[] = [];
		for (const [path] of this.files) {
			if (path.startsWith(root) && (path.endsWith(".js") || path.endsWith(".ts") || path.endsWith(".md"))) {
				files.push(path);
			}
		}
		return files;
	}

	watch(root: string, handlers: WatchHandlers): Disposable {
		const watcher = { root, handlers };
		this.watchers.push(watcher);
		return {
			dispose: () => {
				const index = this.watchers.indexOf(watcher);
				if (index >= 0) {
					this.watchers.splice(index, 1);
				}
			},
		};
	}

	async exists(path: string): Promise<boolean> {
		return this.files.has(path);
	}

	async ensureDirectory(_: string): Promise<void> {
		// Mock implementation - always succeeds
	}
}

/**
 * Mock path utilities for testing
 */
export class MockPathUtils implements PathUtils {
	normalize(path: string): string {
		return path.replace(/\\/g, "/").replace(/\/+/g, "/");
	}

	isAbsolute(path: string): boolean {
		return path.startsWith("/");
	}

	join(...paths: string[]): string {
		return paths.join("/").replace(/\/+/g, "/");
	}

	dirname(path: string): string {
		const normalized = this.normalize(path);
		const lastSlash = normalized.lastIndexOf("/");
		if (lastSlash === -1) return "";
		return normalized.slice(0, lastSlash);
	}

	relative(from: string, to: string): string {
		// Simplified implementation for testing
		const fromParts = from.split("/").filter(Boolean);
		const toParts = to.split("/").filter(Boolean);

		let i = 0;
		while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
			i++;
		}

		const upCount = fromParts.length - i;
		const remainingPath = toParts.slice(i);

		return [...Array<string>(upCount).fill(".."), ...remainingPath].join("/") || ".";
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
