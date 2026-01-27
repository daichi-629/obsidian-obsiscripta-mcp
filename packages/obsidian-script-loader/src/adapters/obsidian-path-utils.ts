import { normalizePath } from "obsidian";
import path from "path";
import { PathUtils } from "@obsiscripta/script-loader-core";

/**
 * Obsidian implementation of PathUtils interface.
 * Uses Obsidian's normalizePath function and Node.js path module.
 */
export class ObsidianPathUtils implements PathUtils {
	normalize(p: string): string {
		return normalizePath(p);
	}

	isAbsolute(p: string): boolean {
		return path.isAbsolute(p);
	}

	join(...paths: string[]): string {
		return normalizePath(path.join(...paths));
	}

	dirname(p: string): string {
		return normalizePath(path.dirname(p));
	}

	relative(from: string, to: string): string {
		return normalizePath(path.relative(from, to));
	}
}
