/**
 * HTTP client for communicating with the Obsidian plugin
 * Phase 3: Implement actual client
 */

import type { BridgeConfig, ToolRequest, ToolResponse } from './types.js';

export class PluginClient {
	private config: BridgeConfig;

	constructor(config: BridgeConfig) {
		this.config = config;
	}

	async callTool(request: ToolRequest): Promise<ToolResponse> {
		// Phase 3: Implement HTTP call to plugin
		throw new Error('Not implemented');
	}

	async listTools(): Promise<unknown[]> {
		// Phase 3: Implement tool listing
		throw new Error('Not implemented');
	}
}
