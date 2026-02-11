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

describe('PluginClient MCP HTTP E2E', () => {
  it('sends MCP API key header on MCP requests', async () => {
    const receivedApiKeys: Array<string | undefined> = [];

    const fake = await startFakeServer((req, res) => {
      if (req.method !== 'POST' || req.url !== '/mcp') {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'not found', message: 'not found' }));
        return;
      }

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
    });
    cleanup.push(fake.close);

    const client = new PluginClient({
      port: fake.port,
      timeout: 200,
      apiKey: 'obsi_test_key',
    });
    await client.listTools();

    expect(receivedApiKeys).toEqual(['obsi_test_key', 'obsi_test_key']);
  });

  it('sends MCP session header on requests after initialize', async () => {
    const receivedSessionHeaders: Array<string | undefined> = [];

    const fake = await startFakeServer((req, res) => {
      if (req.method !== 'POST' || req.url !== '/mcp') {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'not found', message: 'not found' }));
        return;
      }

      receivedSessionHeaders.push(req.headers['mcp-session-id'] as string | undefined);
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
            result: { tools: [] },
          }),
        );
      });
    });
    cleanup.push(fake.close);

    const client = new PluginClient({
      port: fake.port,
      timeout: 200,
      apiKey: 'obsi_test_key',
    });
    await client.listTools();

    expect(receivedSessionHeaders).toEqual([undefined, 'session-1']);
  });

  it('reinitializes MCP session after a 404 response', async () => {
    let listCallCount = 0;
    const sessionIds: string[] = [];

    const fake = await startFakeServer((req, res) => {
      if (req.method !== 'POST' || req.url !== '/mcp') {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'not found', message: 'not found' }));
        return;
      }

      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const parsed = JSON.parse(body) as { method?: string; id?: number };
        res.setHeader('content-type', 'application/json');

        if (parsed.method === 'initialize') {
          const nextSessionId = `session-${sessionIds.length + 1}`;
          sessionIds.push(nextSessionId);
          res.setHeader('mcp-session-id', nextSessionId);
          res.end(JSON.stringify({ jsonrpc: '2.0', id: parsed.id ?? 1, result: {} }));
          return;
        }

        listCallCount += 1;
        if (listCallCount === 1) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'session expired', message: 'session expired' }));
          return;
        }

        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: parsed.id ?? 1,
            result: { tools: [] },
          }),
        );
      });
    });
    cleanup.push(fake.close);

    const client = new PluginClient({
      port: fake.port,
      timeout: 200,
      apiKey: 'obsi_test_key',
    });

    await client.listTools();

    expect(sessionIds).toEqual(['session-1', 'session-2']);
    expect(listCallCount).toBe(2);
  });
});
