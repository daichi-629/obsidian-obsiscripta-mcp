/**
 * MCP stdio server that bridges to the Obsidian plugin
 * Phase 3: Implement actual server
 */

import type { PluginClientConfig } from './types.js';
import { PluginClient } from './plugin-client.js';

export class BridgeServer {
	private client: PluginClient;

	constructor(config?: Partial<PluginClientConfig>) {
		this.client = new PluginClient(config);
	}

	async start(): Promise<void> {
		// Phase 3: Implement MCP server startup
		throw new Error('Not implemented');
	}
}
