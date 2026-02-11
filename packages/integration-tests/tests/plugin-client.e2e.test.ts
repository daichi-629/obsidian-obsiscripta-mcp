import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { StdioBridgeServer } from '../../stdio-bridge/src/bridge-server.js';

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

describe('StdioBridgeServer MCP HTTP proxy', () => {
  it('adds API key and MCP session header while forwarding requests', async () => {
    const apiKeyHeaders: Array<string | undefined> = [];
    const sessionHeaders: Array<string | undefined> = [];

    const fake = await startFakeServer((req, res) => {
      if (req.method !== 'POST' || req.url !== '/mcp') {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'not found', message: 'not found' }));
        return;
      }

      apiKeyHeaders.push(req.headers['x-obsiscripta-api-key'] as string | undefined);
      sessionHeaders.push(req.headers['mcp-session-id'] as string | undefined);

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

        res.end(JSON.stringify({ jsonrpc: '2.0', id: parsed.id ?? 1, result: { tools: [] } }));
      });
    });
    cleanup.push(fake.close);

    const bridge = new StdioBridgeServer({
      host: '127.0.0.1',
      port: fake.port,
      timeout: 200,
      apiKey: 'obsi_test_key',
    });

    await bridge.listTools();

    expect(apiKeyHeaders).toEqual(['obsi_test_key', 'obsi_test_key']);
    expect(sessionHeaders).toEqual([undefined, 'session-1']);
  });

  it('re-initializes session once after upstream 404', async () => {
    const sessionIds: string[] = [];
    let listCalls = 0;

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
          const nextSession = `session-${sessionIds.length + 1}`;
          sessionIds.push(nextSession);
          res.setHeader('mcp-session-id', nextSession);
          res.end(JSON.stringify({ jsonrpc: '2.0', id: parsed.id ?? 1, result: {} }));
          return;
        }

        listCalls += 1;
        if (listCalls === 1) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'session expired', message: 'session expired' }));
          return;
        }

        res.end(JSON.stringify({ jsonrpc: '2.0', id: parsed.id ?? 1, result: { tools: [] } }));
      });
    });
    cleanup.push(fake.close);

    const bridge = new StdioBridgeServer({
      host: '127.0.0.1',
      port: fake.port,
      timeout: 200,
      apiKey: 'obsi_test_key',
    });

    await bridge.listTools();

    expect(sessionIds).toEqual(['session-1', 'session-2']);
    expect(listCalls).toBe(2);
  });
});
