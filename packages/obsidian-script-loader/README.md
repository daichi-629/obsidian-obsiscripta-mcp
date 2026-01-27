# @obsiscripta/obsidian-script-loader

A reusable TypeScript/JavaScript script loading library for Obsidian plugins, featuring hot reload, compilation, and flexible execution context injection.

## Features

- **Hot Reload**: Automatically detects and reloads scripts when files change
- **TypeScript Support**: Compiles TypeScript scripts on-the-fly using Sucrase
- **Flexible Context Injection**: Configure what variables are available in scripts
- **Script Registry**: Track and query loaded scripts
- **Event Callbacks**: React to script lifecycle events (load, unload, error)
- **Obsidian Integration**: Built-in helpers for common Obsidian plugin integrations

## Installation

```bash
npm install @obsiscripta/obsidian-script-loader
```

Or with pnpm:

```bash
pnpm add @obsiscripta/obsidian-script-loader
```

## Basic Usage

```typescript
import { Plugin } from "obsidian";
import {
  ScriptLoader,
  ScriptRegistry,
  ExecutionContextConfig,
} from "@obsiscripta/obsidian-script-loader";

export default class MyPlugin extends Plugin {
  private scriptLoader: ScriptLoader;
  private scriptRegistry: ScriptRegistry;

  async onload() {
    // Configure what variables to inject into scripts
    const contextConfig: ExecutionContextConfig = {
      variableNames: ["app", "vault", "plugin"],
      provideContext: (_scriptPath, context) => ({
        app: context.app,
        vault: context.vault,
        plugin: context.plugin,
      }),
    };

    const runtime = ScriptLoader.createRuntime(contextConfig, this.app.vault);
    this.scriptRegistry = new ScriptRegistry(runtime);

    this.scriptLoader = new ScriptLoader(
      this.app.vault,
      {
        app: this.app,
        vault: this.app.vault,
        plugin: this,
      },
      this, // EventRegistrar
      this.scriptRegistry,
      runtime,
      "my-scripts", // folder name
      {
        onScriptLoaded: (metadata, exports) => {
          console.log("Script loaded:", metadata.name);
          // Validate and use the exports
          if (isValidMyPluginTool(exports)) {
            registerTool(exports);
          }
        },
        onScriptUnloaded: (metadata) => {
          console.log("Script unloaded:", metadata.name);
        },
        onScriptError: (path, error) => {
          console.error("Script error:", path, error);
        },
      }
    );

    await this.scriptLoader.start();
  }

  onunload() {
    void this.scriptLoader.stop();
  }
}
```

## Core Concepts

### Script Exports

Scripts can export **any** JavaScript object. The library doesn't enforce a specific structure - you decide what shape your scripts should export and validate them in your plugin.

The `onScriptLoaded` callback receives:
- `metadata`: Information about the script (path, name, mtime, compiledCode)
- `exports`: Whatever the script exported (default export or module.exports)

You can then validate and use these exports however you need.

### Example Script

Scripts can export any object. The library doesn't enforce any specific structure - that's up to you:

```typescript
// my-scripts/hello.ts
export default {
  name: "hello",
  description: "Says hello",
  handler: async (name: string) => {
    return `Hello, ${name}!`;
  },
};
```

Or with a specific structure for your use case:

```typescript
// my-scripts/mcp-tool.ts
export default {
  name: "my-tool",
  description: "My custom tool",
  inputSchema: {
    type: "object",
    properties: {
      input: { type: "string", description: "Input text" },
    },
    required: ["input"],
  },
  async handler(args, context) {
    // Your tool logic here
    return {
      content: [{ type: "text", text: "Result" }],
    };
  },
};
```

## Context Injection

Configure what variables are injected into your scripts using `ExecutionContextConfig`:

```typescript
import { ExecutionContextConfig } from "@obsiscripta/obsidian-script-loader";

const contextConfig: ExecutionContextConfig = {
  // Define which variable names to inject
  variableNames: ["app", "vault", "plugin"],

  // Provide the actual values for those variables
  provideContext: (scriptPath, context) => ({
    app: context.app,
    vault: context.vault,
    plugin: context.plugin,
  }),
};

const runtime = ScriptLoader.createRuntime(contextConfig, this.app.vault);
```

### Injecting Additional APIs

You can inject any APIs or objects your scripts need:

```typescript
const contextConfig: ExecutionContextConfig = {
  variableNames: ["app", "vault", "plugin", "myAPI", "otherPluginAPI"],
  provideContext: (scriptPath, context) => {
    // Access other plugins or create custom APIs
    const otherPlugin = (context.app as any).plugins?.plugins?.["other-plugin"];

    return {
      app: context.app,
      vault: context.vault,
      plugin: context.plugin,
      myAPI: createMyCustomAPI(),
      otherPluginAPI: otherPlugin?.api,
    };
  },
};
```

## API Reference

### ScriptLoader

Main orchestrator for script loading and watching.

```typescript
class ScriptLoader {
  constructor(
    vault: Vault,
    scriptContext: ScriptExecutionContext,
    eventRegistrar: EventRegistrar,
    scriptRegistry: ScriptRegistry,
    runtime: ScriptRuntime,
    scriptsPath: string,
    callbacks?: ScriptLoaderCallbacks
  );

  start(): Promise<void>;
  stop(): Promise<void>;
  updateScriptsPath(scriptsPath: string): Promise<void>;
  reloadScripts(): Promise<void>;
  getScriptsPath(): string;
  static normalizeScriptsPath(settingPath?: string): string;
}
```

### ScriptRegistry

Central registry for tracking loaded scripts.

```typescript
class ScriptRegistry {
  constructor(runtime: ScriptRuntime);
  register(metadata: ScriptMetadata): void;
  unregister(path: string): void;
  get(path: string): ScriptMetadata | undefined;
  getByName(name: string): ScriptMetadata[];
  getAll(): ScriptMetadata[];
  getPaths(): string[];
  has(path: string): boolean;
  clear(): void;
  count(): number;
}
```

### FunctionRuntime

Executes compiled scripts with context injection and returns whatever the script exports.

```typescript
class FunctionRuntime {
  constructor(contextConfig: ExecutionContextConfig, options?: FunctionRuntimeOptions);
  load(code: string, scriptPath: string, context: ScriptExecutionContext): Promise<ScriptHandle>;
  invokeById(scriptId: string, exportPath: string, args: unknown[]): Promise<unknown>;
  getExportById(scriptId: string, exportPath: string): Promise<unknown>;
  unload(scriptId: string): Promise<void>;
  dispose(): Promise<void>;
}
```

### ScriptCompiler

Compiles TypeScript/JavaScript with caching.

```typescript
class ScriptCompiler {
  compile(path: string, source: string, loader: ScriptLoaderType, mtime?: number): Promise<string>;
  invalidate(path: string): void;
  clear(): void;
}
```

## License

0-BSD
