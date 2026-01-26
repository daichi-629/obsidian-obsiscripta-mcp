/**
 * HTTP client for communicating with the Obsidian plugin
 * Phase 3: Implement actual client
 */
import type { BridgeConfig, ToolRequest, ToolResponse } from './types.js';
export declare class PluginClient {
    private config;
    constructor(config: BridgeConfig);
    callTool(request: ToolRequest): Promise<ToolResponse>;
    listTools(): Promise<unknown[]>;
}
//# sourceMappingURL=plugin-client.d.ts.map