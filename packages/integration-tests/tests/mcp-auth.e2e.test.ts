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
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
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
        'mcp-session-id': sessionId!,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/list', params: {} }),
    });
    expect(validAuthResponse.status).toBe(200);

    const v1ToolsResponse = await fetch(`${baseUrl}/bridge/v1/tools`);
    expect(v1ToolsResponse.status).toBe(200);
    const v1Tools = (await v1ToolsResponse.json()) as { tools?: Array<{ name: string }> };
    expect(v1Tools.tools?.some((tool) => tool.name === 'echo')).toBe(true);
  });


  it('returns an error when edit_note is called before read_note in the same session', async () => {
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(
      {
        name: 'read_note',
        description: 'Read note',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
        },
        async handler() {
          return {
            content: [{ type: 'text', text: 'ok' }],
          };
        },
      },
      ToolSource.Builtin,
    );
    toolRegistry.register(
      {
        name: 'edit_note',
        description: 'Edit note',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            patch: { type: 'string' },
          },
          required: ['path', 'patch'],
        },
        async handler() {
          return {
            content: [{ type: 'text', text: 'edited' }],
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

    const initResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-obsiscripta-api-key': apiKey,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      }),
    });
    const sessionId = initResponse.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();

    const editBeforeRead = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-obsiscripta-api-key': apiKey,
        'mcp-session-id': sessionId!,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'edit_note',
          arguments: {
            path: 'Notes/Daily',
            patch: '@@ -0,0 +1 @@\n+Hello\n',
          },
        },
      }),
    });
    expect(editBeforeRead.status).toBe(200);
    const editBeforeReadBody = (await editBeforeRead.json()) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    };
    expect(editBeforeReadBody.result?.isError).toBe(true);
    expect(editBeforeReadBody.result?.content?.[0]?.text).toContain('read_note must be called before edit_note');

    const readResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-obsiscripta-api-key': apiKey,
        'mcp-session-id': sessionId!,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'read_note',
          arguments: {
            path: 'Notes/Daily',
          },
        },
      }),
    });
    expect(readResponse.status).toBe(200);

    const editAfterRead = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-obsiscripta-api-key': apiKey,
        'mcp-session-id': sessionId!,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'edit_note',
          arguments: {
            path: 'Notes/Daily',
            patch: '@@ -0,0 +1 @@\n+Hello\n',
          },
        },
      }),
    });
    expect(editAfterRead.status).toBe(200);
    const editAfterReadBody = (await editAfterRead.json()) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    };
    expect(editAfterReadBody.result?.isError).toBe(false);
    expect(editAfterReadBody.result?.content?.[0]?.text).toBe('edited');
  });

});
