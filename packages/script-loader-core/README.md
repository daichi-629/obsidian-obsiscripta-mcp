# @obsiscripta/script-loader-core

Platform-independent core for dynamic script loading with hot reload support.

## Overview

This package provides the core logic for loading, compiling, and executing scripts without any platform-specific dependencies. It's designed to work in any JavaScript environment (Node.js, browser, Obsidian, etc.) by accepting abstract interfaces for file system operations.

## Features

- **Platform Independent**: No dependencies on Obsidian or any specific runtime
- **Hot Reload**: Track and reload scripts when they change
- **TypeScript Support**: Compile TypeScript on-the-fly using Sucrase
- **Script Registry**: Centralized tracking of loaded scripts
- **Dependency Injection**: All platform-specific functionality injected via interfaces

## Core Interfaces

The core depends on three key interfaces plus optional module resolution:

### ScriptHost
Abstracts script storage and change tracking:
- `readFile(identifier)`: Read script contents and modification time
- `listFiles()`: List all script identifiers, returning `{ identifier, loader }`
- `watch(handlers)`: Watch for script changes
- `deriveToolName?(identifier, loader)`: Optional identifier → tool name mapping

### Logger
Abstracts logging:
- `debug/info/warn/error`: Log at different levels

### ModuleResolver (optional)
Resolves and loads script modules for `require()`:
- `resolve(specifier, fromIdentifier)`: Return `{ id, code, loader?, mtime?, compiled? }`

## Usage

```typescript
import {
  ScriptLoaderCore,
  ScriptRegistry,
  DefaultScriptCompiler,
  FunctionRuntime,
  type ExecutionContextConfig
} from "@obsiscripta/script-loader-core";

// Implement the required interfaces for your platform
const scriptHost: ScriptHost = {
  async readFile(identifier) { /* ... */ },
  async listFiles() {
    return [{ identifier: "scripts/example.ts", loader: "ts" }];
  },
  watch(handlers) { /* ... */ }
};

const logger: Logger = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error
};

// Create the core loader
const compiler = new DefaultScriptCompiler();
const contextConfig: ExecutionContextConfig = {
  /* ... */
};
const runtime = new FunctionRuntime(contextConfig);
const registry = new ScriptRegistry(runtime);

const loader = new ScriptLoaderCore(
  scriptHost,
  logger,
  registry,
  compiler,
  runtime,
  {
    moduleResolver: {
      async resolve(specifier, fromIdentifier) {
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
