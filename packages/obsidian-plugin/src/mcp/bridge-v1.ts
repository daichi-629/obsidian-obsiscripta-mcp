import { Hono } from "hono";
import { cors } from "hono/cors";
import { ToolCallRequest } from "./bridge-types";
import { ToolExecutor } from "./tools/executor";

export const registerBridgeV1Routes = (
	app: Hono,
	executor: ToolExecutor,
	maxBodyBytes: number
): void => {
	// CORS middleware for v1 API
	app.use(
		"/bridge/v1/*",
		cors({
			origin: "*",
			allowMethods: ["GET", "POST", "OPTIONS"],
			allowHeaders: ["Content-Type"],
		}),
	);

	// Body size limit middleware for v1 API
	app.use("/bridge/v1/*", async (c, next) => {
		const contentLength = c.req.header("content-length");
		if (contentLength && parseInt(contentLength) > maxBodyBytes) {
			return c.json(
				{
					error: "Request body too large",
					message: "Request body too large",
				},
				413,
			);
		}
		return await next();
	});

	// Health endpoint
	app.get("/bridge/v1/health", (c) => {
		return c.json(executor.getHealth());
	});

	// Tools list endpoint
	app.get("/bridge/v1/tools", (c) => {
		return c.json(executor.getTools());
	});

	// Tool call endpoint
	app.post("/bridge/v1/tools/:toolName/call", async (c) => {
		const toolName = c.req.param("toolName");

		if (!executor.isToolAvailable(toolName)) {
			return c.json(
				{
					error: "Tool not found",
					message: "Tool not found",
				},
				404,
			);
		}

		let payload: ToolCallRequest;
		try {
			payload = await c.req.json<ToolCallRequest>();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return c.json(
				{
					error: "Invalid request body",
					message: "Invalid request body",
					details: message,
				},
				400,
			);
		}

		const hasArguments =
			payload && typeof payload === "object" && "arguments" in payload;
		const argsValue = hasArguments ? payload.arguments : null;
		if (
			!hasArguments ||
			!argsValue ||
			typeof argsValue !== "object" ||
			Array.isArray(argsValue)
		) {
			return c.json(
				{
					error: "Invalid request body",
					message: "Invalid request body",
				},
				400,
			);
		}

		try {
			const response = await executor.executeToolCall(toolName, argsValue);
			return c.json(response);
		} catch (error) {
			return c.json(
				{
					error: "Internal server error",
					message: "Internal server error",
					details: error instanceof Error ? error.message : String(error),
				},
				500,
			);
		}
	});
};
