# ObsiScripta Bridge

Extensible, script-focused bridge API server for Obsidian vault operations.

Important notes:
- Desktop only (no mobile support).
- Script extensions run with full API access and no sandbox.
- Bridge v1 has no authentication; MCP Standard endpoint uses API key authentication.

## Features

- **MCP Standard HTTP API** (JSON-RPC 2.0) for interoperability with MCP clients
- Bridge Protocol v1 HTTP API for local AI clients (legacy, maintained for compatibility)
- Built-in note tools (read now, more CRUD tools planned)
- Script extension system for custom tools (JavaScript/TypeScript)
- Hot-reload for scripts in the vault-root `mcp-tools/` folder (configurable in settings)

## Quick start (development)

```bash
pnpm install
pnpm run dev
```

Reload Obsidian and enable the plugin in **Settings → Community plugins**.

## Production build

```bash
pnpm run build
```

## Manual install

Copy these files to your vault plugin folder:

```
<Vault>/.obsidian/plugins/obsidian-mcp/
  main.js
  manifest.json
  styles.css
```

## Install with BRAT

1. Install and enable **BRAT** in **Settings → Community plugins**.
2. Open **Settings → BRAT** and select **Add Beta plugin**.
3. Enter the repository URL (example: `https://github.com/daichi-629/obsidian-obsiscripta-mcp`) and add it.
4. Go back to **Settings → Community plugins** and enable **ObsiScripta Bridge**.

## Protocol Endpoints

The bridge server exposes two protocol endpoints simultaneously:

1. **MCP Standard HTTP** (Recommended): `http://127.0.0.1:3000/mcp`
   - JSON-RPC 2.0 over HTTP
   - Implements MCP specification 2025-03-26
   - Requires API key (`X-ObsiScripta-Api-Key` or `Authorization: Bearer ...`)
   - For use with MCP-compatible clients

2. **Bridge Protocol v1** (Legacy): `http://127.0.0.1:3000/bridge/v1`
   - Custom HTTP API
   - Maintained for backward compatibility
   - No authentication (v1 compatibility)
   - Used by the stdio bridge as a fallback transport

See [docs/protocol.md](docs/protocol.md) for detailed protocol specifications.

## Claude Desktop (stdio bridge) configuration

1. Open **Settings → Community plugins → ObsiScripta Bridge**.
2. Check the endpoint shown under **Connection info**.
   - Example: `http://127.0.0.1:3000`
3. In plugin settings, create an MCP API key (you can issue multiple keys).
4. Download the stdio bridge binary for your OS from the GitHub release assets:
   - https://github.com/daichi-629/obsidian-obsiscripta-mcp/releases
5. Add a server entry in your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "/path/to/obsidian-mcp",
      "env": {
        "OBSIDIAN_MCP_HOST": "127.0.0.1",
        "OBSIDIAN_MCP_PORT": "3000",
        "OBSIDIAN_MCP_API_KEY": "obsi_..."
      }
    }
  }
}
```

If you change the port, run **Restart server** and update `OBSIDIAN_MCP_PORT` to match.

**stdio bridge transport mode**

The stdio bridge now prefers the MCP Standard endpoint and automatically falls back to
Bridge v1 if needed.

Optional environment variable:

- `OBSIDIAN_MCP_TRANSPORT=auto|mcp|v1`
  - `auto` (default): MCP Standard first, then Bridge v1 fallback
  - `mcp`: MCP Standard only (no fallback)
  - `v1`: Bridge v1 only
- `OBSIDIAN_MCP_API_KEY=<issued key from plugin settings>`
  - Required for MCP Standard endpoint authentication
  - Ignored when `OBSIDIAN_MCP_TRANSPORT=v1`

## Script tools

Scripts are discovered in (vault-root, configurable):

```
mcp-tools/
```

Example:

```js
export default {
  // The tool name is automatically derived from the file path.
  // For "mcp-tools/example_tool.js", the tool name will be "example_tool".
  // For "mcp-tools/utils/helper.js", the tool name will be "utils/helper".
  description: "Example custom tool",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" }
    },
    required: ["query"]
  },
  handler: async (args, context) => {
    const files = context.vault.getMarkdownFiles();
    return {
      content: [{ type: "text", text: `Found ${files.length} files` }]
    };
  }
};
```

Relative imports in scripts resolve from the script file location.

If the Dataview plugin is installed, scripts also receive `dv` (Dataview API). When Dataview is not installed, `dv` is undefined.
If the Templater plugin is installed, scripts also receive `tp` (Templater API). When Templater is not installed, `tp` is undefined.
If the Omnisearch plugin is installed, scripts can access the global `omnisearch` API.
See `examples/dataview-example.js`, `examples/templater-example.js`, and `examples/omnisearch-example.js` for minimal examples.


## Settings and commands

Use **Settings → Community plugins** to enable the plugin.
Settings include script folder helper actions and server control.

## Testing

```bash
pnpm run test
```

Integration tests are collected in `packages/integration-tests` so cross-package behavior (plugin + stdio bridge + script loader) is easy to find and run in one place.

```bash
pnpm run test:integration
```

## Linting

```bash
eslint main.ts
```

## References

- Obsidian API docs: https://docs.obsidian.md
