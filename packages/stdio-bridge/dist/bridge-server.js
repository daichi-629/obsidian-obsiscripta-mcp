/**
 * MCP stdio server that bridges to the Obsidian plugin
 * Phase 3: Implement actual server
 */
import { PluginClient } from './plugin-client.js';
export class BridgeServer {
    client;
    constructor(config) {
        this.client = new PluginClient(config);
    }
    async start() {
        // Phase 3: Implement MCP server startup
        throw new Error('Not implemented');
    }
}
//# sourceMappingURL=bridge-server.js.map