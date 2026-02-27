/**
 * stdio-bridge main entry point
 */

import { resolve as resolvePath } from "node:path";
import { McpProxyServer, V1BridgeServer } from "./bridge-server.js";
import {
	McpProxyClient,
	PluginClientError,
	RetryExhaustedError,
	V1PluginClient,
} from "./plugin-client.js";
import type { BridgeClientConfig, TransportMode } from "./types.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const DEFAULT_TRANSPORT_MODE: TransportMode = "auto";

function resolveTransportMode(): TransportMode {
	const mode = process.env.OBSIDIAN_MCP_TRANSPORT?.trim().toLowerCase();
	if (!mode) {
		return DEFAULT_TRANSPORT_MODE;
	}

	if (mode === "auto" || mode === "mcp" || mode === "v1") {
		return mode;
	}

	console.error(
		`[stdio-bridge] Invalid OBSIDIAN_MCP_TRANSPORT "${mode}", using ${DEFAULT_TRANSPORT_MODE}`
	);
	return DEFAULT_TRANSPORT_MODE;
}

function resolveBridgeConfig() {
	const host = process.env.OBSIDIAN_MCP_HOST?.trim() || DEFAULT_HOST;
	const portValue = process.env.OBSIDIAN_MCP_PORT?.trim() ?? String(DEFAULT_PORT);
	const apiKey = process.env.OBSIDIAN_MCP_API_KEY?.trim() ?? "";
	const parsedPort = Number.parseInt(portValue, 10);
	const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT;

	if (port !== parsedPort) {
		console.error(
			`[stdio-bridge] Invalid OBSIDIAN_MCP_PORT "${portValue}", using ${DEFAULT_PORT}`
		);
	}

	return { host, port, apiKey };
}

async function runCli() {
	const { host, port, apiKey } = resolveBridgeConfig();
	const transportMode = resolveTransportMode();
	if (transportMode === "mcp" && !apiKey) {
		console.error(
			"[stdio-bridge] OBSIDIAN_MCP_API_KEY is empty. MCP endpoint authentication will fail until a key is configured."
		);
	}
	const clientConfig: BridgeClientConfig = {
		host,
		port,
		timeout: 5000,
		apiKey,
	};

	let server: { start: () => Promise<void> };

	if (transportMode === "mcp") {
		server = new McpProxyServer(new McpProxyClient(clientConfig));
	} else if (transportMode === "v1") {
		server = new V1BridgeServer(new V1PluginClient(clientConfig));
	} else {
		const proxyClient = new McpProxyClient(clientConfig);
		const mcpAvailable = await proxyClient.probeMcp();
		server = mcpAvailable
			? new McpProxyServer(proxyClient)
			: new V1BridgeServer(new V1PluginClient(clientConfig));
	}

	try {
		await server.start();
	} catch (error) {
		console.error("[stdio-bridge] Failed to start server:", error);
		process.exitCode = 1;
	}
}

declare const __filename: string;

const isMain =
	typeof __filename === "string" && process.argv[1]
		? resolvePath(__filename) === resolvePath(process.argv[1])
		: false;

if (isMain) {
	void runCli();
}

export default runCli;
export { V1BridgeServer, McpProxyServer, StdioBridgeServer, BridgeServer } from "./bridge-server.js";
export {
	V1PluginClient,
	McpProxyClient,
	PluginClientError,
	RetryExhaustedError,
} from "./plugin-client.js";
export type {
	BridgeClientConfig,
	PluginClientConfig,
	MCPToolDefinition,
	PollingState,
	TransportMode,
} from "./types.js";
