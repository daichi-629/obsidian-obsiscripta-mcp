export interface MCPPluginSettings {
	port: number;
	bindHost: string;
	autoStart: boolean;
	scriptsPath: string;
	disabledTools: string[];
	/** Bearer token for authenticating remote MCP server requests. Empty = no auth required. */
	apiToken: string;
}

export const DEFAULT_SETTINGS: MCPPluginSettings = {
	port: 3000,
	bindHost: "127.0.0.1",
	autoStart: true,
	scriptsPath: "mcp-tools",
	disabledTools: [],
	apiToken: "",
};
