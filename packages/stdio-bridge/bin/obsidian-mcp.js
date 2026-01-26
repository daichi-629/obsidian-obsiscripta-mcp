#!/usr/bin/env node

/**
 * CLI entry point for obsidian-mcp-bridge
 * Phase 3: Implement actual CLI
 */

import { BridgeServer } from '../dist/index.js';

const config = {
	pluginHost: '127.0.0.1',
	pluginPort: 3000
};

const server = new BridgeServer(config);
server.start().catch(err => {
	console.error('Failed to start bridge server:', err);
	process.exit(1);
});
