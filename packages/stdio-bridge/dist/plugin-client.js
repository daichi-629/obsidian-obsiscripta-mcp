/**
 * HTTP client for communicating with the Obsidian plugin
 * Phase 3: Implement actual client
 */
export class PluginClient {
    config;
    constructor(config) {
        this.config = config;
    }
    async callTool(request) {
        // Phase 3: Implement HTTP call to plugin
        throw new Error('Not implemented');
    }
    async listTools() {
        // Phase 3: Implement tool listing
        throw new Error('Not implemented');
    }
}
//# sourceMappingURL=plugin-client.js.map