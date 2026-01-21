# Obsidian MCP Server

Expose Obsidian vault operations to AI assistants via Model Context Protocol (MCP).

Important notes:
- Desktop only (no mobile support).
- Script extensions run with full API access and no sandbox.
- The server binds to localhost only and has no authentication.

## Features

- Streamable HTTP MCP server for local AI clients.
- Built-in note tools (read now, more CRUD tools planned).
- Script extension system for custom tools (JavaScript/TypeScript).
- Hot-reload for scripts in `.obsidian/mcp-tools/`.

## Quick start (development)

```bash
npm install
npm run dev
```

Reload Obsidian and enable the plugin in **Settings → Community plugins**.

## Production build

```bash
npm run build
```

## Manual install

Copy these files to your vault plugin folder:

```
<Vault>/.obsidian/plugins/obsidian-mcp/
  main.js
  manifest.json
  styles.css
```

## Script tools

Scripts are discovered in:

```
.obsidian/mcp-tools/
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

## Settings and commands

Use **Settings → Community plugins** to enable the plugin.
Settings include script folder helper actions and server control.

## Linting

```bash
eslint main.ts
```

## References

- MCP SDK: https://github.com/modelcontextprotocol/sdk
- Obsidian API docs: https://docs.obsidian.md
