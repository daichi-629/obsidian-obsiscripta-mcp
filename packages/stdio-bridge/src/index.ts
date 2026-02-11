/**
 * stdio-bridge main entry point
 */

import { resolve as resolvePath } from "node:path";
import { StdioBridgeServer } from "./bridge-server.js";
import type { BridgeProxyConfig } from "./types.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;

function resolveBridgeConfig(): BridgeProxyConfig {
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

	return { host, port, timeout: 5000, apiKey };
}

async function runCli() {
	const config = resolveBridgeConfig();
	if (!config.apiKey) {
		console.error(
			"[stdio-bridge] OBSIDIAN_MCP_API_KEY is empty. MCP endpoint authentication will fail until a key is configured."
		);
	}

	const server = new StdioBridgeServer(config);

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
export { StdioBridgeServer, BridgeServer } from "./bridge-server.js";
export type { BridgeProxyConfig } from "./types.js";
