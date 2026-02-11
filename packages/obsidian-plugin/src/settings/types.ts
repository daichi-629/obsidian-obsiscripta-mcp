export interface MCPPluginSettings {
	port: number;
	bindHost: string;
	autoStart: boolean;
	enableBridgeV1: boolean;
	scriptsPath: string;
	disabledTools: string[];
	searchExcludedTools: string[];
	mcpApiKeys: string[];
}

export const DEFAULT_SETTINGS: MCPPluginSettings = {
	port: 3000,
	bindHost: "127.0.0.1",
	autoStart: true,
	enableBridgeV1: true,
	scriptsPath: "mcp-tools",
	disabledTools: [],
	searchExcludedTools: [],
	mcpApiKeys: [],
};
