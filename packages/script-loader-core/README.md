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

### ScriptHost
Abstracts file system operations:
- `readFile(path)`: Read file contents and modification time
- `listFiles(root)`: List all script files in a directory
- `watch(root, handlers)`: Watch for file changes

### PathUtils
Abstracts path operations:
- `normalize(path)`: Normalize path separators
- `isAbsolute(path)`: Check if path is absolute
- `join(...paths)`: Join path segments

### Logger
Abstracts logging:
- `debug/info/warn/error`: Log at different levels

### ModuleResolver (optional)
Resolves and loads script modules for `require()`:
- `resolve(fromId, request)`: Map a module request to an id and code
- `load(resolution)`: Return the module source code

## Usage

Use `FunctionRuntime` for execution; `ScriptExecutor` is deprecated.

```typescript
import {
  ScriptLoaderCore,
  ScriptRegistry,
  ScriptCompiler,
  FunctionRuntime,
  type ExecutionContextConfig
} from "@obsiscripta/script-loader-core";

// Implement the required interfaces for your platform
const scriptHost: ScriptHost = {
  async readFile(path) { /* ... */ },
  async listFiles(root) { /* ... */ },
  watch(root, handlers) { /* ... */ }
};

const pathUtils: PathUtils = {
  normalize(path) { /* ... */ },
  isAbsolute(path) { /* ... */ },
  join(...paths) { /* ... */ }
};

const logger: Logger = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error
};

// Create the core loader
const registry = new ScriptRegistry();
const compiler = new ScriptCompiler();
const contextConfig: ExecutionContextConfig = {
  /* ... */
};
const runtime = new FunctionRuntime(contextConfig, { pathUtils });

const loader = new ScriptLoaderCore(
  scriptHost,
  pathUtils,
  logger,
  registry,
  compiler,
  runtime,
  "scripts",
  {
    isScriptPath: (path) => path.endsWith(".js"),
    moduleResolver: {
      async resolve(fromId, request) {
        /* ... */
      },
      async load(resolution) {
        /* ... */
      }
    }
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
