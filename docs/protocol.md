# Bridge Protocol

This document specifies the HTTP protocols exposed by the ObsiScripta Bridge
plugin and consumed by the stdio bridge.

## Available Protocols

The bridge server exposes two protocol endpoints:

1. **v1 API** (Legacy): Custom HTTP API at `/bridge/v1/*`
2. **MCP Standard** (Recommended): JSON-RPC 2.0 over HTTP at `/mcp`

Both protocols are available simultaneously for backward compatibility.

## v1 API (Legacy)

### Overview

- Transport: HTTP (JSON over localhost)
- Base URL: `http://127.0.0.1:{port}/bridge/v1`
- Protocol version: `1` (string)
- Encoding: UTF-8 JSON (`Content-Type: application/json`)

The plugin runs a local HTTP server on `127.0.0.1` (port is configurable in the
Obsidian plugin settings). The stdio bridge and other local clients talk to this
HTTP API.

## Conventions

- All endpoints return JSON.
- Tool errors are returned as `200` responses with `success: false` and
  `isError: true`. HTTP errors are reserved for transport, validation, and
  routing failures.
- `MCPContent` is passed through as-is without transformation.

### MCPContent

MCP content is relayed in MCP format:

```json
{
  "type": "text",
  "text": "Hello"
}
```

```json
{
  "type": "image",
  "data": "<base64 data>",
  "mimeType": "image/png"
}
```

Fields are not strictly validated by the bridge beyond the `type` field in
shared types.

## Endpoints

### GET /health

Health check for the bridge server.

Response (200):

```json
{
  "status": "ok",
  "version": "x.y.z",
  "protocolVersion": "1"
}
```

Notes:
- `version` is the bridge/plugin build version.
- `protocolVersion` is the protocol major version as a string.

### GET /tools

List available tools and a hash that changes when the tool set changes.

Response (200):

```json
{
  "tools": [
    {
      "name": "read_note",
      "description": "Read a note by path",
      "inputSchema": {
        "type": "object",
        "properties": {
          "path": { "type": "string" }
        },
        "required": ["path"]
      }
    }
  ],
  "hash": "sha256-hex"
}
```

Hash calculation:
- Tools are sorted by `name`.
- `name`, `description`, and `inputSchema` are deep-sorted by object keys.
- JSON is stringified and hashed with SHA-256 (hex output).
- Array order is preserved; changes to array order will change the hash.

### POST /tools/{name}/call

Call a tool by name. `{name}` must be URL-encoded.

Request body:

```json
{
  "arguments": {
    "path": "Notes/Example.md"
  }
}
```

Validation:
- Body must be valid JSON.
- Body must be an object with an `arguments` field.
- `arguments` must be a non-null object (not an array).
- Max body size: 1 MiB.

Response (200, success):

```json
{
  "success": true,
  "content": [
    { "type": "text", "text": "..." }
  ]
}
```

Response (200, tool execution error):

```json
{
  "success": false,
  "content": [
    { "type": "text", "text": "Error: ..." }
  ],
  "isError": true
}
```

## Error Responses (HTTP)

HTTP error responses use this shape:

```json
{
  "error": "Error code",
  "message": "Human-readable message",
  "details": "Optional details"
}
```

Common status codes:
- 400 `Invalid request body`
- 404 `Not found` or `Tool not found`
- 405 `Method not allowed`
- 413 `Request body too large`
- 500 `Internal server error`

## CORS

The server enables CORS for local development:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

## Security

- The server binds to `127.0.0.1` only.
- No authentication is enforced; use locally and only with trusted clients.

## Examples

Health:

```bash
curl -s http://127.0.0.1:3000/bridge/v1/health
```

Tools:

```bash
curl -s http://127.0.0.1:3000/bridge/v1/tools
```

Tool call:

```bash
curl -s -X POST http://127.0.0.1:3000/bridge/v1/tools/read_note/call \
  -H 'Content-Type: application/json' \
  -d '{"arguments":{"path":"Notes/Example.md"}}'
```

## MCP Standard HTTP (Recommended)

### Overview

- Transport: JSON-RPC 2.0 over HTTP (Streamable HTTP transport)
- Endpoint: `http://127.0.0.1:{port}/mcp`
- Protocol version: MCP 2025-03-26
- Encoding: UTF-8 JSON (`Content-Type: application/json`)

This endpoint implements the MCP (Model Context Protocol) standard as specified
in the [MCP specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports).

### JSON-RPC 2.0 Format

All requests and responses follow the JSON-RPC 2.0 specification.

**Request structure:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

**Response structure (success):**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [...]
  }
}
```

**Response structure (error):**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32601,
    "message": "Method not found"
  }
}
```

### Supported Methods

#### tools/list

List all available tools.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "read_note",
        "description": "Read a note by path",
        "inputSchema": {
          "type": "object",
          "properties": {
            "path": { "type": "string" }
          },
          "required": ["path"]
        }
      }
    ]
  }
}
```

#### tools/call

Execute a tool by name.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "read_note",
    "arguments": {
      "path": "Notes/Example.md"
    }
  }
}
```

**Response (success):**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Note content here..."
      }
    ],
    "isError": false
  }
}
```

**Response (tool execution error):**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Error: File not found"
      }
    ],
    "isError": true
  }
}
```

### Error Codes

Standard JSON-RPC 2.0 error codes:

- `-32700`: Parse error (invalid JSON)
- `-32600`: Invalid request (malformed JSON-RPC)
- `-32601`: Method not found
- `-32602`: Invalid params
- `-32603`: Internal error

### Examples

List tools:

```bash
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'
```

Call a tool:

```bash
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "read_note",
      "arguments": {
        "path": "Notes/Example.md"
      }
    }
  }'
```

### Session Management

Session management with `Mcp-Session-Id` header is planned for Phase 3 of the
migration. Currently, the endpoint operates in a stateless mode.

### Current Limitations (Phase 1)

- No SSE streaming support (returns single JSON response)
- No session management (`Mcp-Session-Id` header not yet supported)
- No pagination support for tools/list
- No server-initiated requests or notifications

These features will be added in subsequent migration phases.
