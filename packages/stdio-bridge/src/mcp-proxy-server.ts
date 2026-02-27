/**
 * MCP stdio transparent proxy that forwards JSON-RPC payloads without inspection.
 */

import type { McpProxyClient } from "./plugin-client.js";

export class McpProxyServer {
	private transparentMode = false;
	private stdioBuffer = Buffer.alloc(0);
	private stdioDataHandler: ((chunk: Buffer) => void) | null = null;
	private proxyQueue: Promise<void> = Promise.resolve();
	private isRunning = false;

	constructor(private proxyClient: McpProxyClient) {}

	async start(): Promise<void> {
		if (this.isRunning) {
			console.warn("[McpProxyServer] Server already running");
			return;
		}

		this.transparentMode = true;
		this.isRunning = true;

		this.stdioDataHandler = (chunk: Buffer) => {
			this.stdioBuffer = Buffer.concat([this.stdioBuffer, chunk]);
			this.processStdioBuffer();
		};

		process.stdin.on("data", this.stdioDataHandler);
		process.stdin.on("error", (error) => {
			console.error("[McpProxyServer] stdin error:", error);
		});
		process.stdout.on("error", (error) => {
			console.error("[McpProxyServer] stdout error:", error);
		});
		process.stdin.resume();

		console.error("[McpProxyServer] Transparent MCP proxy mode enabled");
	}

	async stop(): Promise<void> {
		if (this.stdioDataHandler) {
			process.stdin.off("data", this.stdioDataHandler);
			this.stdioDataHandler = null;
		}
		this.transparentMode = false;
		this.stdioBuffer = Buffer.alloc(0);
		this.isRunning = false;
		console.error("[McpProxyServer] Transparent MCP proxy mode stopped");
	}

	isServerRunning(): boolean {
		return this.isRunning;
	}

	private processStdioBuffer(): void {
		while (true) {
			const headerEnd = this.stdioBuffer.indexOf("\r\n\r\n");
			if (headerEnd === -1) {
				return;
			}

			const headerText = this.stdioBuffer.slice(0, headerEnd).toString("ascii");
			const contentLengthMatch = headerText.match(/content-length:\s*(\d+)/i);
			if (!contentLengthMatch) {
				console.error("[McpProxyServer] Missing Content-Length header");
				this.stdioBuffer = this.stdioBuffer.slice(headerEnd + 4);
				continue;
			}

			const contentLengthValue = contentLengthMatch[1];
			if (!contentLengthValue) {
				console.error("[McpProxyServer] Invalid Content-Length header");
				this.stdioBuffer = this.stdioBuffer.slice(headerEnd + 4);
				continue;
			}

			const contentLength = Number.parseInt(contentLengthValue, 10);
			const messageStart = headerEnd + 4;
			const messageEnd = messageStart + contentLength;
			if (this.stdioBuffer.length < messageEnd) {
				return;
			}

			const payload = this.stdioBuffer
				.slice(messageStart, messageEnd)
				.toString("utf8");
			this.stdioBuffer = this.stdioBuffer.slice(messageEnd);

			this.proxyQueue = this.proxyQueue
				.then(() => this.forwardMcpPayload(payload))
				.catch((error) => {
					console.error("[McpProxyServer] Proxy error:", error);
				});
		}
	}

	private async forwardMcpPayload(payload: string): Promise<void> {
		try {
			const responseText = await this.proxyClient.proxyMcpRequest(payload);
			if (responseText) {
				this.writeStdioResponse(responseText);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.writeStdioError(message);
		}
	}

	private writeStdioResponse(responseText: string): void {
		const body = Buffer.from(responseText, "utf8");
		const header = `Content-Length: ${body.length}\r\n\r\n`;
		process.stdout.write(header);
		process.stdout.write(body);
	}

	private writeStdioError(message: string): void {
		const payload = JSON.stringify({
			jsonrpc: "2.0",
			id: null,
			error: { code: -32000, message: `Bridge proxy error: ${message}` },
		});
		this.writeStdioResponse(payload);
	}
}
