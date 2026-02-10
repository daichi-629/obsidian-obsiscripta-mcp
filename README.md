# ObsiScripta Bridge

ObsiScripta Bridge is a monorepo for an **Obsidian plugin + stdio MCP bridge** that enables MCP-based operations on your vault.
It is designed to be script-extensible, so you can add your own custom tools with JavaScript/TypeScript.

> [!IMPORTANT]
>
> - **Desktop Obsidian only** (no mobile support).
> - Script extensions run with full Obsidian API access and no sandbox.
> - Bridge Protocol v1 has no authentication (kept for compatibility).
> - MCP Standard endpoint requires API key authentication.

## What you can do

- Use the **MCP Standard HTTP API** (JSON-RPC 2.0)
- Keep using the legacy **Bridge Protocol v1 HTTP API** for compatibility
- Run built-in note tools (read + edit operations)
- Add custom tools in JavaScript / TypeScript
- Hot-reload tools from `mcp-tools/`

## Monorepo layout

- `packages/obsidian-plugin/`
  Obsidian plugin implementation (hosts the local HTTP server)
- `packages/stdio-bridge/`
  MCP stdio bridge (`obsidian-mcp` CLI), forwarding requests to the plugin HTTP server
- `packages/shared/`
  Shared types and protocol interfaces
- `examples/`
  Script tool examples
- `docs/`
  Protocol and release documentation

## Architecture overview

1. The Obsidian plugin starts a local HTTP server.
2. The stdio bridge connects to MCP clients (for example, Claude Desktop).
3. The stdio bridge forwards requests to the plugin via HTTP.
4. Tool execution is handled by built-in tools and/or script tools.

The stdio bridge supports three transport modes:

- `auto` (default): prefer MCP Standard, then fall back to Bridge v1
- `mcp`: MCP Standard only
- `v1`: Bridge Protocol v1 only

## Setup

### Prerequisites

- Node.js (LTS recommended)
- `pnpm` (this repository uses pnpm workspace)
- Obsidian Desktop

### Development

```bash
pnpm install
pnpm run dev
```

Then reload Obsidian and enable the plugin in **Settings → Community plugins**.

### Build

```bash
pnpm run build
```

## Common commands

### Root (across packages)

```bash
pnpm run dev
pnpm run build
pnpm run lint
pnpm run test
pnpm run test:integration
```

### Per package

```bash
pnpm --filter obsiscripta-bridge-plugin run dev
pnpm --filter obsiscripta-bridge-plugin run build
pnpm --filter obsiscripta-bridge-plugin run lint

pnpm --filter obsidian-mcp-bridge run dev
pnpm --filter obsidian-mcp-bridge run build
pnpm --filter obsidian-mcp-bridge run build:binary

pnpm --filter @obsiscripta/shared run build
```

## Installation

### Manual install

Copy the following files into your vault plugin directory:

```text
<Vault>/.obsidian/plugins/obsidian-mcp/
  main.js
  manifest.json
  styles.css
```

### Install via BRAT

1. Install and enable **BRAT**.
2. Open **Settings → BRAT → Add Beta plugin**.
3. Enter this repository URL (example: `https://github.com/daichi-629/obsidian-obsiscripta-mcp`).
4. Go back to **Settings → Community plugins** and enable **ObsiScripta Bridge**.

## Endpoints

The plugin exposes both protocols at the same time:

1. **MCP Standard HTTP** (recommended)
   `http://127.0.0.1:3000/mcp`
    - JSON-RPC 2.0
    - MCP specification 2025-03-26
    - API key required (`X-ObsiScripta-Api-Key` or `Authorization: Bearer ...`)

2. **Bridge Protocol v1** (legacy compatibility)
   `http://127.0.0.1:3000/bridge/v1`
    - Custom legacy HTTP API
    - No authentication (for v1 compatibility)

See [docs/protocol.md](docs/protocol.md) for details.

## Claude Desktop configuration (stdio bridge)

1. Open **Settings → Community plugins → ObsiScripta Bridge** in Obsidian.
2. Confirm host/port in **Connection info** (example: `127.0.0.1:3000`).
3. Create an MCP API key in plugin settings.
4. Download the `obsidian-mcp` binary for your OS from GitHub Releases.
5. Add the server entry to your Claude Desktop MCP config:

```json
{
	"mcpServers": {
		"obsidian": {
			"command": "/path/to/obsidian-mcp",
			"env": {
				"OBSIDIAN_MCP_HOST": "127.0.0.1",
				"OBSIDIAN_MCP_PORT": "3000",
				"OBSIDIAN_MCP_API_KEY": "obsi_...",
				"OBSIDIAN_MCP_TRANSPORT": "auto"
			}
		}
	}
}
```

If you change the port, run **Restart server** in the plugin and update `OBSIDIAN_MCP_PORT` accordingly.

## Script tools

By default, script tools are loaded from `mcp-tools/` at your vault root (configurable in settings):

```text
mcp-tools/
```

Minimal example:

```js
export default {
	// Tool name is derived from file path.
	// mcp-tools/example_tool.js -> example_tool
	// mcp-tools/utils/helper.js -> utils/helper
	description: "Example custom tool",
	inputSchema: {
		type: "object",
		properties: {
			query: { type: "string" },
		},
		required: ["query"],
	},
	handler: async (args, context) => {
		const files = context.vault.getMarkdownFiles();
		return {
			content: [{ type: "text", text: `Found ${files.length} files` }],
		};
	},
};
```

Notes:

- Relative imports resolve from the script file location.
- If Dataview is installed, `dv` (Dataview API) is available.
- If Templater is installed, `tp` (Templater API) is available.
- If Omnisearch is installed, the global `omnisearch` API is available.

Examples:

- `examples/dataview-example.js`
- `examples/templater-example.js`
- `examples/omnisearch-example.js`

## Testing

```bash
pnpm run test
pnpm run test:integration
```

Integration tests are organized under `packages/integration-tests`.

## Versioning

Use root scripts to keep versions synchronized in this monorepo:

```bash
pnpm run version:patch
pnpm run version:minor
pnpm run version:major
pnpm run version:bump <x.y.z>
```

## Release

For the GitHub Actions release workflow and expected assets, see [docs/release.md](docs/release.md).

## References

- Obsidian API docs: https://docs.obsidian.md
- Releases: https://github.com/daichi-629/obsidian-obsiscripta-mcp/releases
