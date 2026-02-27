import { afterEach, describe, expect, it } from 'vitest';
import { BridgeServer } from '../../obsidian-plugin/src/mcp/server.js';
import { ToolExecutor } from '../../obsidian-plugin/src/mcp/tools/executor.js';
import { ToolRegistry } from '../../obsidian-plugin/src/mcp/tools/registry.js';

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

describe('obsidian-plugin MCP session management', () => {
  it('enforces MCP-Session-Id lifecycle for POST and DELETE', async () => {
    const apiKey = 'test-api-key';
    const port = await getFreePort();
    const registry = new ToolRegistry();
    const executor = new ToolExecutor(registry, { vault: {}, app: {} } as never);
    const bridgeServer = new BridgeServer(executor, port, '127.0.0.1', true, [apiKey]);
    await bridgeServer.start();
    cleanup.push(() => bridgeServer.stop());

    const baseUrl = `http://127.0.0.1:${port}/mcp`;

    const initResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-11-25',
        'x-obsiscripta-api-key': apiKey,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
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

    const missingSession = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-11-25',
        'x-obsiscripta-api-key': apiKey,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
    });
    expect(missingSession.status).toBe(400);

    const validSession = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-11-25',
        'x-obsiscripta-api-key': apiKey,
        'mcp-session-id': sessionId ?? '',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
        params: {},
      }),
    });
    expect(validSession.status).toBe(200);

    const invalidSession = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-11-25',
        'x-obsiscripta-api-key': apiKey,
        'mcp-session-id': 'invalid-session',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/list',
        params: {},
      }),
    });
    expect(invalidSession.status).toBe(404);

    const deleteResponse = await fetch(baseUrl, {
      method: 'DELETE',
      headers: {
        'mcp-session-id': sessionId ?? '',
        'x-obsiscripta-api-key': apiKey,
      },
    });
    expect(deleteResponse.status).toBe(204);

    const afterDelete = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-11-25',
        'x-obsiscripta-api-key': apiKey,
        'mcp-session-id': sessionId ?? '',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/list',
        params: {},
      }),
    });
    expect(afterDelete.status).toBe(404);
  });
});
