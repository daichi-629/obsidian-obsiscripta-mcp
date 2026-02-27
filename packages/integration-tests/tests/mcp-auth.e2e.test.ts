import { afterEach, describe, expect, it } from 'vitest';
import { BridgeServer } from '../../obsidian-plugin/src/mcp/server.js';
import { ToolExecutor } from '../../obsidian-plugin/src/mcp/tools/executor.js';
import { ToolRegistry, ToolSource } from '../../obsidian-plugin/src/mcp/tools/registry.js';

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

describe('BridgeServer MCP authentication E2E', () => {
  it('requires API key for /mcp and keeps /bridge/v1 unauthenticated', async () => {
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(
      {
        name: 'echo',
        description: 'Echo',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
          },
          required: ['text'],
        },
        async handler(args) {
          return {
            content: [{ type: 'text', text: String(args.text ?? '') }],
          };
        },
      },
      ToolSource.Builtin,
    );

    const executor = new ToolExecutor(toolRegistry, { vault: {}, app: {} } as never);

    const port = await getFreePort();
    const apiKey = 'obsi_test_key';
    const server = new BridgeServer(executor, port, '127.0.0.1', true, [apiKey]);
    await server.start();
    cleanup.push(() => server.stop());

    const baseUrl = `http://127.0.0.1:${port}`;

    const noAuthResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    expect(noAuthResponse.status).toBe(401);

    const wrongAuthResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-obsiscripta-api-key': 'wrong',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });
    expect(wrongAuthResponse.status).toBe(401);

    const initResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-obsiscripta-api-key': apiKey,
        'mcp-protocol-version': '2025-11-25',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      }),
    });
    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();

    const validAuthResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-obsiscripta-api-key': apiKey,
        'mcp-protocol-version': '2025-11-25',
        'mcp-session-id': sessionId ?? '',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/list', params: {} }),
    });
    expect(validAuthResponse.status).toBe(200);

    const v1ToolsResponse = await fetch(`${baseUrl}/bridge/v1/tools`);
    expect(v1ToolsResponse.status).toBe(200);
    const v1Tools = (await v1ToolsResponse.json()) as { tools?: Array<{ name: string }> };
    expect(v1Tools.tools?.some((tool) => tool.name === 'echo')).toBe(true);
  });
});
