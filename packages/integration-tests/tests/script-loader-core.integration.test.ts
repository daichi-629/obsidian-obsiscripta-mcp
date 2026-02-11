import { afterEach, describe, expect, it } from 'vitest';
import { BridgeServer } from '../../obsidian-plugin/src/mcp/server.js';
import { ToolExecutor } from '../../obsidian-plugin/src/mcp/tools/executor.js';
import { ToolRegistry, ToolSource } from '../../obsidian-plugin/src/mcp/tools/registry.js';
import { validateAndConvertScriptExports } from '../../obsidian-plugin/src/mcp/tools/scripting/script-validator.js';
import { StdioBridgeServer } from '../../stdio-bridge/src/bridge-server.js';
import {
  FunctionRuntime,
  ScriptCompiler,
  ScriptLoaderCore,
  ScriptRegistry,
  type ExecutionContextConfig,
} from '../../script-loader-core/src/index.js';
import {
  MockLogger,
  MockPathUtils,
  MockScriptHost,
  delay,
} from '../../script-loader-core/src/__tests__/test-helpers.js';

async function getFreePort(): Promise<number> {
  const { createServer } = await import('node:net');
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to resolve free port'));
        return;
      }
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanup.length > 0) {
    const fn = cleanup.pop();
    if (fn) {
      await fn();
    }
  }
});

describe('script-loader-core + ToolExecutor + BridgeServer + stdio-bridge full integration', () => {
  it('propagates initial load and hot-reload updates through stdio-bridge tool execution', async () => {
    const apiKey = 'test-api-key';
    const scriptHost = new MockScriptHost();
    const pathUtils = new MockPathUtils();
    const logger = new MockLogger();
    const compiler = new ScriptCompiler();

    const contextConfig: ExecutionContextConfig = {
      variableNames: ['ctx'],
      provideContext: () => ({ ctx: {} }),
    };
    const runtime = new FunctionRuntime(contextConfig, { pathUtils });
    const scriptRegistry = new ScriptRegistry(runtime);

    const toolRegistry = new ToolRegistry();
    const executor = new ToolExecutor(toolRegistry, { vault: {}, app: {} } as never);

    const scriptPath = 'mcp-tools/dynamic/echo.ts';
    scriptHost.setFile(
      scriptPath,
      `export default {
        description: 'Dynamic echo',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text']
        },
        async handler(args) {
          return { content: [{ type: 'text', text: 'dynamic:' + String(args.text ?? '') }] };
        }
      };`,
      1000,
    );

    const loader = new ScriptLoaderCore(
      scriptHost,
      pathUtils,
      logger,
      scriptRegistry,
      compiler,
      runtime,
      {},
      'mcp-tools',
      {
        onScriptLoaded: (metadata, exports) => {
          const tool = validateAndConvertScriptExports(exports, metadata.path, metadata.name);
          toolRegistry.register(tool, ToolSource.Script);
        },
        onScriptUnloaded: (metadata) => {
          toolRegistry.unregister(metadata.name);
        },
      },
      20,
    );

    await loader.start();
    cleanup.push(() => loader.stop());

    const port = await getFreePort();
    const bridgeServer = new BridgeServer(executor, port, '127.0.0.1', [apiKey]);
    await bridgeServer.start();
    cleanup.push(() => bridgeServer.stop());

    const stdioBridge = new StdioBridgeServer({
      host: '127.0.0.1',
      port,
      timeout: 1000,
      apiKey,
    });

    const firstList = await stdioBridge.listTools();
    expect(Array.isArray((firstList as { tools?: unknown }).tools)).toBe(true);

    const firstCall = await stdioBridge.callTool('dynamic/echo', { text: 'hello' }) as { content?: Array<{ text?: string }> };
    expect(firstCall.content?.[0]?.text).toBe('dynamic:hello');

    scriptHost.updateFile(
      scriptPath,
      `export default {
        description: 'Dynamic echo',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text']
        },
        async handler(args) {
          return { content: [{ type: 'text', text: 'dynamic-v2:' + String(args.text ?? '') }] };
        }
      };`,
      2000,
    );
    scriptHost.triggerModify(scriptPath);
    await delay(80);

    await stdioBridge.listTools();
    const updatedResult = await stdioBridge.callTool('dynamic/echo', { text: 'hello' }) as { content?: Array<{ text?: string }> };
    expect(updatedResult.content?.[0]?.text).toBe('dynamic-v2:hello');
  });
});
