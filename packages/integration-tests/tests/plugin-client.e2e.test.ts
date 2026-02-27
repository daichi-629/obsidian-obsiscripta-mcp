import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { McpProxyClient, V1PluginClient } from '../../stdio-bridge/src/plugin-client.js';

async function startFakeServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to acquire test server port');
  }
  return {
    port: address.port,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanup.length > 0) {
    const close = cleanup.pop();
    if (close) {
      await close();
    }
  }
});

describe('PluginClient Fake HTTP fallback E2E', () => {
  it('sends MCP API key header on MCP requests', async () => {
    let receivedApiKey: string | undefined;

    const fake = await startFakeServer((req, res) => {
      if (req.method === 'POST' && req.url === '/mcp') {
        receivedApiKey = req.headers['x-obsiscripta-api-key'] as string | undefined;
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: {
              tools: [],
            },
          }),
        );
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found', message: 'not found' }));
    });
    cleanup.push(fake.close);

    const client = new McpProxyClient({
      port: fake.port,
      timeout: 200,
      apiKey: 'obsi_test_key',
    });
    await client.proxyMcpRequest(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    );

    expect(receivedApiKey).toBe('obsi_test_key');
  });

  it('returns false when MCP probe fails', async () => {
    const fake = await startFakeServer((req, res) => {
      if (req.method === 'POST' && req.url === '/mcp') {
        res.statusCode = 502;
        res.end(JSON.stringify({ error: 'mcp down', message: 'mcp down' }));
        return;
      }

      if (req.method === 'GET' && req.url === '/bridge/v1/tools') {
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found', message: 'not found' }));
    });
    cleanup.push(fake.close);

    const client = new McpProxyClient({ port: fake.port, timeout: 200 });
    const probeOk = await client.probeMcp();
    expect(probeOk).toBe(false);
  });

  it('does not send MCP API key to v1 endpoint', async () => {
    let v1ApiKeyHeader: string | undefined;

    const fake = await startFakeServer((req, res) => {
      if (req.method === 'POST' && req.url === '/mcp') {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: 'Unauthorized', message: 'Unauthorized' }));
        return;
      }

      if (req.method === 'GET' && req.url === '/bridge/v1/tools') {
        v1ApiKeyHeader = req.headers['x-obsiscripta-api-key'] as string | undefined;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ tools: [], hash: 'v1' }));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found', message: 'not found' }));
    });
    cleanup.push(fake.close);

    const client = new V1PluginClient({
      port: fake.port,
      timeout: 200,
      apiKey: 'obsi_test_key',
    });

    await client.listTools();
    expect(v1ApiKeyHeader).toBeUndefined();
  });
});
