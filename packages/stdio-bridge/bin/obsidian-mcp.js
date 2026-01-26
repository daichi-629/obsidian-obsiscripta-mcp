#!/usr/bin/env node

/**
 * CLI entry point for obsidian-mcp-bridge
 */

import("../dist/index.js")
	.then(module => {
		if (typeof module.default !== "function") {
			throw new Error("CLI entry point is not exported as default.");
		}
		return module.default();
	})
	.catch(error => {
		console.error("[obsidian-mcp] Failed to start:", error);
		process.exit(1);
	});
