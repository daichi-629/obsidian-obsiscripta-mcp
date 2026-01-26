/**
 * MCP stdio server that bridges to the Obsidian plugin
 * Phase 3: Implement actual server
 */
import type { BridgeConfig } from './types.js';
export declare class BridgeServer {
    private client;
    constructor(config: BridgeConfig);
    start(): Promise<void>;
}
//# sourceMappingURL=bridge-server.d.ts.map