import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { BridgeServer } from '../../obsidian-plugin/src/mcp/server.js';
import { ToolExecutor } from '../../obsidian-plugin/src/mcp/tools/executor.js';
import { ToolRegistry, ToolSource } from '../../obsidian-plugin/src/mcp/tools/registry.js';
import { validateAndConvertScriptExports } from '../../obsidian-plugin/src/mcp/tools/scripting/script-validator.js';
import { createMcpTransportRoutes, closeAllTransports } from '../../remote-mcp-server/src/mcp/transport-handler.js';
import { RemoteMcpServer } from '../../remote-mcp-server/src/mcp/mcp-server.js';
import { requireAuth } from '../../remote-mcp-server/src/auth/middleware.js';
import { TokenStore } from '../../remote-mcp-server/src/store/token-store.js';
import type { AccessToken, GitHubUser } from '../../remote-mcp-server/src/types.js';
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

async function startRemoteMcpServer(tokenStore: TokenStore): Promise<{ server: Server; baseUrl: string }> {
  const port = await getFreePort();
  const remoteMcpServer = new RemoteMcpServer(tokenStore);
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id'],
      exposeHeaders: ['Mcp-Session-Id', 'Www-Authenticate'],
    }),
  );

  const metadataUrl = `http://127.0.0.1:${port}/.well-known/oauth-protected-resource`;
  app.use('/mcp', requireAuth(tokenStore, metadataUrl));
  app.route('/', createMcpTransportRoutes(remoteMcpServer));

  const server = await new Promise<Server>((resolve) => {
    const s = serve(
      {
        fetch: app.fetch,
        hostname: '127.0.0.1',
        port,
      },
      () => resolve(s),
    );
  });

  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

interface JsonRpcResponse {
  result?: unknown;
  error?: { code: number; message: string };
}

async function mcpPost(baseUrl: string, accessToken: string, body: Record<string, unknown>, sessionId?: string) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${accessToken}`,
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', ...body }),
  });

  const rawBody = await response.text();

  let parsed: JsonRpcResponse;
  if (rawBody.trim().startsWith('event:')) {
    const dataLines = rawBody
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())
      .filter((line) => line.length > 0);

    const payload = dataLines[dataLines.length - 1];
    parsed = payload ? (JSON.parse(payload) as JsonRpcResponse) : {};
  } else {
    parsed = (JSON.parse(rawBody) as JsonRpcResponse);
  }

  return {
    status: response.status,
    sessionId: response.headers.get('mcp-session-id'),
    body: parsed,
  };
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

describe('script-loader-core + plugin + remote-mcp end-to-end integration', () => {
  it.skip('propagates load and hot-reload updates through remote MCP tool execution', async () => {
    const pluginApiKey = 'plugin-mcp-api-key';
    const accessTokenValue = 'remote-access-token';
    const githubUser: GitHubUser = {
      id: 4242,
      login: 'integration-user',
      name: 'Integration User',
      avatar_url: 'https://example.com/avatar.png',
    };

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
        description: 'Remote dynamic echo',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text']
        },
        async handler(args) {
          return { content: [{ type: 'text', text: 'remote-dynamic:' + String(args.text ?? '') }] };
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

    const pluginPort = await getFreePort();
    const bridgeServer = new BridgeServer(executor, pluginPort, '127.0.0.1', [pluginApiKey]);
    await bridgeServer.start();
    cleanup.push(() => bridgeServer.stop());

    const tokenStore = new TokenStore();
    const accessToken: AccessToken = {
      token: accessTokenValue,
      clientId: 'integration-client',
      scope: 'mcp',
      githubUser,
      expiresAt: Date.now() + 3600_000,
    };
    tokenStore.saveAccessToken(accessToken);

    tokenStore.savePluginToken({
      id: 'plugin-token-1',
      name: 'Integration Plugin Token',
      token: pluginApiKey,
      pluginHost: '127.0.0.1',
      pluginPort,
      githubUserId: githubUser.id,
      requireAuth: false,
      createdAt: Date.now(),
    });

    const remote = await startRemoteMcpServer(tokenStore);
    cleanup.push(async () => {
      await closeAllTransports();
      await new Promise<void>((resolve) => remote.server.close(() => resolve()));
    });

    const init = await mcpPost(remote.baseUrl, accessTokenValue, {
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'integration-test-client', version: '1.0.0' },
      },
    });
    expect(init.status).toBe(200);
    expect(init.body.error).toBeUndefined();
    expect(init.sessionId).toBeTruthy();

    const sessionId = init.sessionId!;

    let toolsBefore: Array<{ name: string }> = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const listBefore = await mcpPost(
        remote.baseUrl,
        accessTokenValue,
        {
          id: 2,
          method: 'tools/list',
          params: {},
        },
        sessionId,
      );
      expect(listBefore.status).toBe(200);
      toolsBefore = (listBefore.body.result as { tools?: Array<{ name: string }> }).tools ?? [];
      if (toolsBefore.some((tool) => tool.name === 'dynamic/echo')) {
        break;
      }
      await delay(100);
    }
    expect(toolsBefore.some((tool) => tool.name === 'dynamic/echo')).toBe(true);

    const callBefore = await mcpPost(
      remote.baseUrl,
      accessTokenValue,
      {
        id: 3,
        method: 'tools/call',
        params: {
          name: 'dynamic/echo',
          arguments: { text: 'hello' },
        },
      },
      sessionId,
    );
    expect(callBefore.status).toBe(200);
    const callBeforeContent = (callBefore.body.result as { content?: Array<{ text?: string }> }).content;
    expect(callBeforeContent?.[0]?.text).toBe('remote-dynamic:hello');

    scriptHost.updateFile(
      scriptPath,
      `export default {
        description: 'Remote dynamic echo',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text']
        },
        async handler(args) {
          return { content: [{ type: 'text', text: 'remote-dynamic-v2:' + String(args.text ?? '') }] };
        }
      };`,
      2000,
    );
    scriptHost.triggerModify(scriptPath);
    await delay(80);

    const callAfter = await mcpPost(
      remote.baseUrl,
      accessTokenValue,
      {
        id: 4,
        method: 'tools/call',
        params: {
          name: 'dynamic/echo',
          arguments: { text: 'hello' },
        },
      },
      sessionId,
    );
    expect(callAfter.status).toBe(200);
    const callAfterContent = (callAfter.body.result as { content?: Array<{ text?: string }> }).content;
    expect(callAfterContent?.[0]?.text).toBe('remote-dynamic-v2:hello');
  });
});
