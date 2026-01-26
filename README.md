# ObsiScripta Bridge

Extensible, script-focused bridge API server for Obsidian vault operations.

Important notes:
- Desktop only (no mobile support).
- Script extensions run with full API access and no sandbox.
- The server binds to localhost only and has no authentication.

## Features

- Bridge Protocol v1 HTTP API for local AI clients.
- Built-in note tools (read now, more CRUD tools planned).
- Script extension system for custom tools (JavaScript/TypeScript).
- Hot-reload for scripts in the vault-root `mcp-tools/` folder (configurable in settings).

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

## Claude Desktop (stdio bridge) configuration

1. Open **Settings → Community plugins → ObsiScripta Bridge**.
2. Check the endpoint shown under **Connection info**.
   - Example: `http://127.0.0.1:3000/bridge/v1`
3. Download the stdio bridge binary for your OS from the GitHub release assets:
   - https://github.com/daichi-629/obsidian-obsiscripta-mcp/releases
4. Add a server entry in your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "/path/to/obsidian-mcp",
      "env": {
        "OBSIDIAN_MCP_HOST": "127.0.0.1",
        "OBSIDIAN_MCP_PORT": "3000"
      }
    }
  }
}
```

If you change the port, run **Restart server** and update `OBSIDIAN_MCP_PORT` to match.

## Script tools

Scripts are discovered in (vault-root, configurable):

```
mcp-tools/
```

Example:

```js
export default {
  name: "example_tool",
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

## Linting

```bash
eslint main.ts
```

## References

- Obsidian API docs: https://docs.obsidian.md
