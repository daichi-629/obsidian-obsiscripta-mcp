import { afterEach, describe, expect, it } from 'vitest';
import { BridgeServer } from '../../obsidian-plugin/src/mcp/server.js';
import { ToolExecutor } from '../../obsidian-plugin/src/mcp/tools/executor.js';
import { ToolRegistry, ToolSource } from '../../obsidian-plugin/src/mcp/tools/registry.js';
import { validateAndConvertScriptExports } from '../../obsidian-plugin/src/mcp/tools/scripting/script-validator.js';
import { PluginClient } from '../../stdio-bridge/src/plugin-client.js';
import { StdioBridgeServer } from '../../stdio-bridge/src/bridge-server.js';
import {
  FunctionRuntime,
  DefaultScriptCompiler,
  ScriptLoaderCore,
  ScriptRegistry,
  type ExecutionContextConfig,
} from '../../script-loader-core/src/index.js';
import {
  MockLogger,
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
    const logger = new MockLogger();
    const compiler = new DefaultScriptCompiler();

    const contextConfig: ExecutionContextConfig = {
      variableNames: ['ctx'],
      provideContext: () => ({ ctx: {} }),
    };
    const runtime = new FunctionRuntime(contextConfig);
    const scriptRegistry = new ScriptRegistry(runtime);

    const toolRegistry = new ToolRegistry();
    const executor = new ToolExecutor(toolRegistry, { vault: {}, app: {} } as never);

    const scriptPath = 'dynamic/echo.ts';
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
      logger,
      scriptRegistry,
      compiler,
      runtime,
      {},
      {
        onScriptLoaded: (metadata, exports) => {
          const tool = validateAndConvertScriptExports(exports, metadata.identifier, metadata.name);
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
    const bridgeServer = new BridgeServer(executor, port, '127.0.0.1', true, [apiKey]);
    await bridgeServer.start();
    cleanup.push(() => bridgeServer.stop());

    const pluginClient = new PluginClient({
      port,
      transportMode: 'mcp',
      timeout: 1000,
      apiKey,
    });
    const stdioBridge = new StdioBridgeServer(pluginClient, 50);

    await stdioBridge.syncTools();
    expect(stdioBridge.getPollingState().tools.has('dynamic/echo')).toBe(true);

    const callResult = await stdioBridge.executeToolCall('dynamic/echo', { text: 'hello' });
    expect(callResult.success).toBe(true);
    expect(callResult.content[0]?.text).toBe('dynamic:hello');

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

    await stdioBridge.syncTools();
    const updatedResult = await stdioBridge.executeToolCall('dynamic/echo', { text: 'hello' });
    expect(updatedResult.success).toBe(true);
    expect(updatedResult.content[0]?.text).toBe('dynamic-v2:hello');
  });
});
