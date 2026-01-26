export interface MCPPluginSettings {
	port: number;
	autoStart: boolean;
	scriptsPath: string;
	disabledTools: string[];
}

export const DEFAULT_SETTINGS: MCPPluginSettings = {
	port: 3000,
	autoStart: true,
	scriptsPath: "mcp-tools",
	disabledTools: [],
};
