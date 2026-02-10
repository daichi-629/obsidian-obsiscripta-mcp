import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { PluginClient } from '../src/plugin-client.js';

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
});
