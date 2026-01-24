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
