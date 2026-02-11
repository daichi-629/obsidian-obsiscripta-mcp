# @obsiscripta/script-loader-core

Platform-independent core for dynamic script loading with hot reload support.

## Overview

This package provides the core logic for loading, compiling, and executing scripts without any platform-specific dependencies. It's designed to work in any JavaScript environment (Node.js, browser, Obsidian, etc.) by accepting abstract interfaces for file system operations and path handling.

## Features

- **Platform Independent**: No dependencies on Obsidian or any specific runtime
- **Hot Reload**: Track and reload scripts when they change
- **TypeScript Support**: Compile TypeScript on-the-fly using Sucrase
- **Script Registry**: Centralized tracking of loaded scripts
- **Dependency Injection**: All platform-specific functionality injected via interfaces

## Core Interfaces

The core depends on three key interfaces plus optional module resolution:

### `ScriptHost`

`ScriptHost` is the boundary between the core loader and your file source (filesystem, vault, virtual store, etc).

```ts
interface FileInfo {
  contents: string;
  mtime: number;
  loaderType: "js" | "ts";
}

interface ScriptHost {
  readFile(path: string): Promise<FileInfo>;
  listFiles(root: string): Promise<string[]>;
  watch(root: string, handlers: WatchHandlers): Disposable;
  exists(path: string): Promise<boolean>;
  ensureDirectory(path: string): Promise<void>;
}
```

- `readFile(path: string): Promise<FileInfo>`
  - Reads a script path and returns source + metadata.
  - `loaderType` must always be returned by `ScriptHost`.
  - Example: Markdown script hosts can return extracted JS code with `loaderType: "js"`.
- `listFiles(root: string): Promise<string[]>`
  - Returns **only script paths** to be loaded by core.
  - Extension filtering / script判定の責務は `ScriptHost` 側にあります。
- `watch(root: string, handlers): Disposable`
  - Starts directory watch and calls callbacks for create/modify/delete/rename.
  - Returns a disposable watcher handle.
- `exists(path: string): Promise<boolean>`
  - Checks file/folder existence.
- `ensureDirectory(path: string): Promise<void>`
  - Ensures script root exists.

### `PathUtils`

```ts
interface PathUtils {
  normalize(path: string): string;
  isAbsolute(path: string): boolean;
  join(...paths: string[]): string;
  dirname(path: string): string;
  relative(from: string, to: string): string;
}
```

### `Logger`

```ts
interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
```

### `ScriptLoaderCallbacks`

```ts
interface ScriptLoaderCallbacks {
  onScriptLoaded?: (metadata: ScriptMetadata, exports: unknown) => void;
  onScriptUnloaded?: (metadata: ScriptMetadata) => void;
  onScriptError?: (path: string, error: Error) => void;
  isScriptPath?: (path: string) => boolean;
}
```

- `onScriptLoaded`: called after compile + runtime load succeeds.
- `onScriptUnloaded`: called when script is removed or replaced.
- `onScriptError`: called on read/compile/runtime failure.
- `isScriptPath`: optional secondary filter before loading.

### `ModuleResolver` (optional)

Resolves and loads script modules for `require()` in runtime:

```ts
interface ModuleResolver {
  resolve(specifier: string, fromPath: string): Promise<string | null>;
  load(resolvedPath: string): Promise<{ code: string; mtime?: number }>;
  clearCache?(): void;
}
```

## Usage

Use `FunctionRuntime` for execution; `ScriptExecutor` is deprecated.

```typescript
import {
  ScriptLoaderCore,
  ScriptRegistry,
  ScriptCompiler,
  FunctionRuntime,
  type ExecutionContextConfig,
  type ScriptHost,
  type PathUtils,
  type Logger,
} from "@obsiscripta/script-loader-core";

const scriptHost: ScriptHost = {
  async readFile(path) {
    return {
      contents: "module.exports = {};",
      mtime: Date.now(),
      loaderType: "js", // needed for non-.js/.ts paths
    };
  },
  async listFiles(root) {
    return [`${root}/tool.md`]; // host returns script files only
  },
  watch(root, handlers) {
    return { dispose() {} };
  },
  async exists(path) {
    return true;
  },
  async ensureDirectory(path) {}
};

const pathUtils: PathUtils = {
  normalize(path) {
    return path;
  },
  isAbsolute(path) {
    return path.startsWith("/");
  },
  join(...paths) {
    return paths.join("/");
  },
  dirname(path) {
    return path.split("/").slice(0, -1).join("/");
  },
  relative(from, to) {
    return to;
  }
};

const logger: Logger = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

const registry = new ScriptRegistry();
const compiler = new ScriptCompiler();
const contextConfig: ExecutionContextConfig = {
  variableNames: ["context"],
  provideContext: () => ({ context: {} }),
};
const runtime = new FunctionRuntime(contextConfig, { pathUtils });

const loader = new ScriptLoaderCore(
  scriptHost,
  pathUtils,
  logger,
  registry,
  compiler,
  runtime,
  {},
  "scripts",
  {
    onScriptLoaded: (metadata) => {
      logger.info(`loaded: ${metadata.name}`);
    },
  }
);

await loader.start();
```

## Architecture

This package is part of a layered architecture:

1. **script-loader-core** (this package) - Platform-independent core logic
2. **obsidian-script-loader** - Obsidian-specific adapters and convenience wrappers
3. **Plugin code** - Consumer of the composed loader

## License

0-BSD
