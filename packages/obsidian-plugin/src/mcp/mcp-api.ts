/**
 * MCP Standard Protocol API Handlers (JSON-RPC over Streamable HTTP)
 * Based on MCP specification 2025-03-26
 */

import type { ToolRegistry } from "./tools/registry";
import type { AppContext } from "../plugin/context";
import type {
	JSONRPCRequest,
	JSONRPCResponse,
	JSONRPCNotification,
	JSONRPCError,
	ToolsListRequest,
	ToolsListResponse,
	ToolsCallRequest,
	ToolsCallResponse,
	MCPTool,
} from "./mcp-types";
import { JSONRPCErrorCode } from "./mcp-types";

const MCP_PROTOCOL_VERSION = "2025-03-26";
const MCP_SERVER_INFO = {
	name: "obsiscripta-bridge-plugin",
	version: "0.2.0",
};

function handleMCPInitialize(request: JSONRPCRequest): JSONRPCResponse {
	return {
		jsonrpc: "2.0",
		id: request.id,
		result: {
			protocolVersion: MCP_PROTOCOL_VERSION,
			capabilities: {
				tools: {
					listChanged: false,
				},
			},
			serverInfo: MCP_SERVER_INFO,
		},
	};
}

/**
 * Handle tools/list JSON-RPC request
 */
export function handleMCPToolsList(
	request: ToolsListRequest,
	registry: ToolRegistry
): ToolsListResponse {
	const tools = registry
		.listEnabled()
		.slice()
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((tool) => ({
			name: tool.name,
			description: tool.description,
			inputSchema: tool.inputSchema,
		})) as MCPTool[];

	// For Phase 1, we don't implement pagination
	// nextCursor is omitted when there are no more results
	return {
		jsonrpc: "2.0",
		id: request.id,
		result: {
			tools,
			// nextCursor: undefined - omit for now
		},
	};
}

/**
 * Handle tools/call JSON-RPC request
 */
export async function handleMCPToolsCall(
	request: ToolsCallRequest,
	registry: ToolRegistry,
	context: AppContext
): Promise<ToolsCallResponse> {
	const { name, arguments: args } = request.params;

	// Validate tool exists
	if (!registry.has(name)) {
		return createErrorResponse(
			request.id,
			JSONRPCErrorCode.InvalidParams,
			`Unknown tool: ${name}`
		) as ToolsCallResponse;
	}

	const tool = registry.get(name);
	if (!tool) {
		return createErrorResponse(
			request.id,
			JSONRPCErrorCode.InvalidParams,
			`Unknown tool: ${name}`
		) as ToolsCallResponse;
	}

	// Validate context is available
	if (!context) {
		return createErrorResponse(
			request.id,
			JSONRPCErrorCode.InternalError,
			"Tool context is not available for execution"
		) as ToolsCallResponse;
	}

	// Execute tool
	try {
		const result = await tool.handler(
			(args || {}) as Record<string, unknown>,
			context
		);

		// Tool execution error (reported in result with isError flag)
		if (result.isError) {
			return {
				jsonrpc: "2.0",
				id: request.id,
				result: {
					content: result.content,
					isError: true,
				},
			};
		}

		// Tool execution success
		return {
			jsonrpc: "2.0",
			id: request.id,
			result: {
				content: result.content,
				isError: false,
			},
		};
	} catch (error) {
		// Unexpected error during tool execution
		return {
			jsonrpc: "2.0",
			id: request.id,
			result: {
				content: [
					{
						type: "text",
						text: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
					},
				],
				isError: true,
			},
		};
	}
}

/**
 * Create a JSON-RPC error response
 */
function createErrorResponse(
	id: string | number,
	code: number,
	message: string,
	data?: unknown
): JSONRPCResponse {
	const error: JSONRPCError = {
		code,
		message,
	};

	if (data !== undefined) {
		error.data = data;
	}

	return {
		jsonrpc: "2.0",
		id,
		error,
	};
}

/**
 * Handle any JSON-RPC request and route to appropriate handler
 */
export async function handleMCPRequest(
	request: JSONRPCRequest,
	registry: ToolRegistry,
	context: AppContext
): Promise<JSONRPCResponse> {
	switch (request.method) {
		case "initialize":
			return handleMCPInitialize(request);

		case "tools/list":
			return handleMCPToolsList(request as ToolsListRequest, registry);

		case "tools/call":
			return handleMCPToolsCall(
				request as ToolsCallRequest,
				registry,
				context
			);

		default:
			return createErrorResponse(
				request.id,
				JSONRPCErrorCode.MethodNotFound,
				`Method not found: ${request.method}`
			);
	}
}

/**
 * Parse and validate JSON-RPC message from request body
 */
export function parseJSONRPCMessage(body: unknown): JSONRPCRequest | JSONRPCNotification | JSONRPCResponse | Error {
	// Validate basic structure
	if (typeof body !== "object" || body === null) {
		return new Error("Request body must be a JSON object");
	}

	const msg = body as Record<string, unknown>;

	// Validate JSON-RPC version
	if (msg.jsonrpc !== "2.0") {
		return new Error("Invalid JSON-RPC version (must be '2.0')");
	}

	if (typeof msg.method === "string") {
		if (!("id" in msg)) {
			return {
				jsonrpc: "2.0",
				method: msg.method,
				params: msg.params,
			} as JSONRPCNotification;
		}

		if (
			typeof msg.id !== "string" &&
			typeof msg.id !== "number" &&
			msg.id !== null
		) {
			return new Error("Invalid 'id' field (must be string, number, or null)");
		}

		return {
			jsonrpc: "2.0",
			id: msg.id as string | number,
			method: msg.method,
			params: msg.params,
		} as JSONRPCRequest;
	}

	if ("id" in msg && ("result" in msg || "error" in msg)) {
		if (
			typeof msg.id !== "string" &&
			typeof msg.id !== "number" &&
			msg.id !== null
		) {
			return new Error("Invalid 'id' field (must be string, number, or null)");
		}

		return {
			jsonrpc: "2.0",
			id: msg.id as string | number,
			...("result" in msg ? { result: msg.result } : {}),
			...("error" in msg ? { error: msg.error } : {}),
		} as JSONRPCResponse;
	}

	return new Error("Invalid JSON-RPC payload");
}

/**
 * Create a JSON-RPC parse error response
 */
export function createParseErrorResponse(): JSONRPCResponse {
	return {
		jsonrpc: "2.0",
		id: null as unknown as string | number,
		error: {
			code: JSONRPCErrorCode.ParseError,
			message: "Parse error",
		},
	};
}

/**
 * Create a JSON-RPC invalid request error response
 */
export function createInvalidRequestResponse(
	message: string
): JSONRPCResponse {
	return {
		jsonrpc: "2.0",
		id: null as unknown as string | number,
		error: {
			code: JSONRPCErrorCode.InvalidRequest,
			message,
		},
	};
}
