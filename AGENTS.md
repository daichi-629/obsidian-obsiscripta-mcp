# ObsiScripta Bridge monorepo

## Repo layout

- `packages/obsidian-plugin/`: Obsidian plugin (entry `src/main.ts`, output `main.js` in the package root).
- `packages/stdio-bridge/`: stdio MCP bridge (entry `src/index.ts`, output in `dist/`, CLI bin `obsidian-mcp`).
- `packages/shared/`: shared types and utilities (`tsc` build to `dist/`).
- `examples/`: script tool examples used by the plugin.
- `docs/release.md`: release workflow for plugin + bridge assets.

## Architecture

- The Obsidian plugin exposes a local HTTP server.
- The stdio bridge runs an MCP stdio server and forwards requests to the plugin HTTP server.
- Shared types and protocol interfaces live in `packages/shared/` and are consumed by both sides.

## Tooling

- This is a pnpm workspace (`pnpm-workspace.yaml`); use `pnpm`, not npm.
- Root scripts run across packages: `pnpm run dev`, `pnpm run build`, `pnpm run lint`.
- Scoped package commands:
  - `pnpm --filter obsiscripta-bridge-plugin run dev|build|lint`
  - `pnpm --filter obsidian-mcp-bridge run dev|build`
  - `pnpm --filter @obsiscripta/shared run build`
- Bridge binary build: `pnpm --filter obsidian-mcp-bridge run build:binary`.

## Versioning

- Use the root scripts to keep versions in sync:
  - `pnpm run version:bump <x.y.z>`
  - `pnpm run version:patch|version:minor|version:major`

## Release

- Follow `docs/release.md` for the GitHub Actions release workflow and expected assets.
