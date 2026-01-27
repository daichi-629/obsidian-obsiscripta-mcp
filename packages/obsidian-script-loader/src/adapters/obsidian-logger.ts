import { Logger } from "@obsiscripta/script-loader-core";

/**
 * Obsidian implementation of Logger interface.
 * Uses console with a prefix for easy filtering.
 */
export class ObsidianLogger implements Logger {
	private prefix: string;

	constructor(prefix: string = "[ScriptLoader]") {
		this.prefix = prefix;
	}

	debug(message: string, ...args: unknown[]): void {
		console.debug(this.prefix, message, ...args);
	}

	info(message: string, ...args: unknown[]): void {
		console.info(this.prefix, message, ...args);
	}

	warn(message: string, ...args: unknown[]): void {
		console.warn(this.prefix, message, ...args);
	}

	error(message: string, ...args: unknown[]): void {
		console.error(this.prefix, message, ...args);
	}
}
