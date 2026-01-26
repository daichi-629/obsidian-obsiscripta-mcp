# Bridge API tool execution lacks MCPToolContext source

## Summary
`handleToolCall()` in `src/mcp/bridge-api.ts` needs an `MCPToolContext` to execute tool handlers, but the current `ToolRegistry` API does not expose or store the context.

## Impact
- Bridge API tool calls cannot reliably execute tools that depend on `context` (e.g., `read_note`), leading to runtime failures or forced error responses.

## Suggested fixes
- Add a context setter/getter to `ToolRegistry` (e.g., `setContext()` / `getContext()`), set it from `main.ts`, and use it in `handleToolCall()`.
- Or update `handleToolCall()` signature to accept `context` and pass it from the routing layer.
