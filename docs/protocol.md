# Bridge Protocol v1

This document specifies the HTTP protocol exposed by the ObsiScripta Bridge
plugin and consumed by the stdio bridge.

## Overview

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
