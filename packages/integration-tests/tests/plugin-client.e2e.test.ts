import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { PluginClient } from '../../stdio-bridge/src/plugin-client.js';

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
    const receivedApiKeys: Array<string | undefined> = [];

    const fake = await startFakeServer((req, res) => {
      if (req.method === 'POST' && req.url === '/mcp') {
        receivedApiKeys.push(req.headers['x-obsiscripta-api-key'] as string | undefined);
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          const parsed = JSON.parse(body) as { method?: string; id?: number };
          res.setHeader('content-type', 'application/json');

          if (parsed.method === 'initialize') {
            res.setHeader('mcp-session-id', 'session-1');
            res.end(JSON.stringify({ jsonrpc: '2.0', id: parsed.id ?? 1, result: {} }));
            return;
          }

          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: parsed.id ?? 1,
              result: {
                tools: [],
              },
            }),
          );
        });
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found', message: 'not found' }));
    });
    cleanup.push(fake.close);

    const client = new PluginClient({
      port: fake.port,
      timeout: 200,
      transportMode: 'mcp',
      apiKey: 'obsi_test_key',
    });
    await client.listTools();

    expect(receivedApiKeys).toEqual(['obsi_test_key', 'obsi_test_key']);
  });

  it('falls back from MCP to v1 listTools in auto transport mode', async () => {
    const fake = await startFakeServer((req, res) => {
      if (req.method === 'POST' && req.url === '/mcp') {
        res.statusCode = 502;
        res.end(JSON.stringify({ error: 'mcp down', message: 'mcp down' }));
        return;
      }

      if (req.method === 'GET' && req.url === '/bridge/v1/tools') {
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            tools: [
              {
                name: 'echo',
                description: 'Echo tool',
                inputSchema: { type: 'object', properties: {} },
              },
            ],
            hash: 'abc123',
          }),
        );
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found', message: 'not found' }));
    });
    cleanup.push(fake.close);

    const client = new PluginClient({ port: fake.port, timeout: 200, transportMode: 'auto' });
    const tools = await client.listTools();

    expect(tools.tools).toHaveLength(1);
    expect(tools.tools[0]?.name).toBe('echo');
  });

  it('does not fallback to v1 when transportMode is mcp', async () => {
    let v1ToolsRequests = 0;

    const fake = await startFakeServer((req, res) => {
      if (req.method === 'POST' && req.url === '/mcp') {
        res.statusCode = 502;
        res.end(JSON.stringify({ error: 'mcp down', message: 'mcp down' }));
        return;
      }

      if (req.method === 'GET' && req.url === '/bridge/v1/tools') {
        v1ToolsRequests += 1;
        res.statusCode = 200;
        res.end(JSON.stringify({ tools: [], hash: 'should-not-be-used' }));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found', message: 'not found' }));
    });
    cleanup.push(fake.close);

    const client = new PluginClient({ port: fake.port, timeout: 200, transportMode: 'mcp' });

    await expect(client.listTools()).rejects.toMatchObject({
      name: 'PluginClientError',
    });
    expect(v1ToolsRequests).toBe(0);
  });

  it('falls back to v1 without sending MCP API key to v1 endpoint', async () => {
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

    const client = new PluginClient({
      port: fake.port,
      timeout: 200,
      transportMode: 'auto',
      apiKey: 'obsi_test_key',
    });

    await client.listTools();
    expect(v1ApiKeyHeader).toBeUndefined();
  });
});
