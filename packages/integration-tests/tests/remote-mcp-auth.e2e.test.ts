import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { TokenStore } from '../../remote-mcp-server/src/store/token-store.js';
import { RemoteMcpServer } from '../../remote-mcp-server/src/mcp/mcp-server.js';
import { createMcpTransportRoutes } from '../../remote-mcp-server/src/mcp/transport-handler.js';
import { requireAuth, requireAdminAuth } from '../../remote-mcp-server/src/auth/middleware.js';
import { createAdminRoutes } from '../../remote-mcp-server/src/admin/admin-routes.js';
import type { AccessToken, GitHubUser, PluginToken } from '../../remote-mcp-server/src/types.js';
import type { Server } from 'node:http';

/**
 * Get a free port for testing
 */
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

/**
 * Create a test remote MCP server
 */
async function createTestServer(): Promise<{
  server: Server;
  port: number;
  store: TokenStore;
  baseUrl: string;
}> {
  const port = await getFreePort();
  const store = new TokenStore();
  const remoteMcpServer = new RemoteMcpServer(store);

  const app = new Hono();

  // CORS
  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id'],
      exposeHeaders: ['Mcp-Session-Id', 'Www-Authenticate'],
    })
  );

  // Health endpoint (unauthenticated)
  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      version: 'test',
    });
  });

  // MCP transport routes (OAuth protected)
  const resourceMetadataUrl = `http://127.0.0.1:${port}/.well-known/oauth-protected-resource`;
  app.use('/mcp', requireAuth(store, resourceMetadataUrl));

  const mcpRoutes = createMcpTransportRoutes(remoteMcpServer);
  app.route('/', mcpRoutes);

  // Admin routes (admin secret auth) - mount after MCP routes to avoid middleware conflicts
  const adminSecret = 'test-admin-secret';
  const adminRoutes = createAdminRoutes(adminSecret, store);
  app.route('/', adminRoutes);

  // Start server
  const server = await new Promise<Server>((resolve) => {
    const s = serve(
      {
        fetch: app.fetch,
        hostname: '127.0.0.1',
        port,
      },
      () => {
        resolve(s);
      }
    );
  });

  return {
    server,
    port,
    store,
    baseUrl: `http://127.0.0.1:${port}`,
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

describe('Remote MCP Server Authentication E2E', () => {
  it('requires OAuth Bearer token for /mcp endpoint', async () => {
    const { server, baseUrl, store } = await createTestServer();
    cleanup.push(() =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      })
    );

    // Test 1: No authentication header → 401
    const noAuthResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {},
      }),
    });
    expect(noAuthResponse.status).toBe(401);
    const wwwAuth = noAuthResponse.headers.get('www-authenticate');
    expect(wwwAuth).toBeTruthy();
    expect(wwwAuth).toContain('Bearer');

    // Test 2: Invalid Bearer token → 401
    const invalidTokenResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer invalid-token',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: {},
      }),
    });
    expect(invalidTokenResponse.status).toBe(401);
    expect(invalidTokenResponse.headers.get('www-authenticate')).toContain('invalid_token');

    // Test 3: Valid Bearer token → 200
    const testUser: GitHubUser = {
      id: 12345,
      login: 'testuser',
      name: 'Test User',
      avatar_url: 'https://example.com/avatar.jpg',
    };

    const accessToken: AccessToken = {
      token: 'test-access-token',
      clientId: 'test-client',
      scope: 'mcp',
      githubUser: testUser,
      expiresAt: Date.now() + 3600000, // 1 hour from now
    };
    store.saveAccessToken(accessToken);

    // Note: Without a plugin token, we won't get tools, but auth should pass
    const validTokenResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
        authorization: `Bearer ${accessToken.token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      }),
    });
    if (validTokenResponse.status !== 200) {
      const body = await validTokenResponse.text();
      console.error('Unexpected response status:', validTokenResponse.status);
      console.error('Response body:', body);
      console.error('Headers:', Object.fromEntries(validTokenResponse.headers.entries()));
    }
    expect(validTokenResponse.status).toBe(200);
  });

  it('manages MCP sessions with mcp-session-id header', async () => {
    const { server, baseUrl, store } = await createTestServer();
    cleanup.push(() =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      })
    );

    // Create access token
    const testUser: GitHubUser = {
      id: 12345,
      login: 'testuser',
      name: 'Test User',
      avatar_url: 'https://example.com/avatar.jpg',
    };

    const accessToken: AccessToken = {
      token: 'test-access-token',
      clientId: 'test-client',
      scope: 'mcp',
      githubUser: testUser,
      expiresAt: Date.now() + 3600000,
    };
    store.saveAccessToken(accessToken);

    // Test 1: Initialize session (POST without mcp-session-id)
    const initResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
        authorization: `Bearer ${accessToken.token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      }),
    });
    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();

    // Test 2: Use existing session (POST with mcp-session-id)
    const listToolsResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
        authorization: `Bearer ${accessToken.token}`,
        'mcp-session-id': sessionId!,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
    });
    expect(listToolsResponse.status).toBe(200);

    // Test 3: Invalid session ID → 400
    const invalidSessionResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
        authorization: `Bearer ${accessToken.token}`,
        'mcp-session-id': 'invalid-session-id',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
        params: {},
      }),
    });
    expect(invalidSessionResponse.status).toBe(400);
  });

  it('supports per-user plugin configuration', async () => {
    const { server, baseUrl, store } = await createTestServer();
    cleanup.push(() =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      })
    );

    // Create two users with different plugin configurations
    const user1: GitHubUser = {
      id: 111,
      login: 'user1',
      name: 'User One',
      avatar_url: 'https://example.com/user1.jpg',
    };
    const user2: GitHubUser = {
      id: 222,
      login: 'user2',
      name: 'User Two',
      avatar_url: 'https://example.com/user2.jpg',
    };

    const accessToken1: AccessToken = {
      token: 'user1-token',
      clientId: 'client1',
      scope: 'mcp',
      githubUser: user1,
      expiresAt: Date.now() + 3600000,
    };
    const accessToken2: AccessToken = {
      token: 'user2-token',
      clientId: 'client2',
      scope: 'mcp',
      githubUser: user2,
      expiresAt: Date.now() + 3600000,
    };

    store.saveAccessToken(accessToken1);
    store.saveAccessToken(accessToken2);

    // Register plugin tokens for each user
    const pluginToken1: PluginToken = {
      id: 'plugin1',
      name: 'User 1 Plugin',
      token: 'plugin1-token',
      pluginHost: 'localhost',
      pluginPort: 8001,
      githubUserId: user1.id,
      requireAuth: false,
      createdAt: Date.now(),
    };
    const pluginToken2: PluginToken = {
      id: 'plugin2',
      name: 'User 2 Plugin',
      token: 'plugin2-token',
      pluginHost: 'localhost',
      pluginPort: 8002,
      githubUserId: user2.id,
      requireAuth: true,
      createdAt: Date.now(),
    };

    store.savePluginToken(pluginToken1);
    store.savePluginToken(pluginToken2);

    // Verify each user gets their own plugin configuration
    const userPlugin1 = store.getPluginTokenByUserId(user1.id);
    expect(userPlugin1).toBeDefined();
    expect(userPlugin1?.pluginPort).toBe(8001);
    expect(userPlugin1?.requireAuth).toBe(false);

    const userPlugin2 = store.getPluginTokenByUserId(user2.id);
    expect(userPlugin2).toBeDefined();
    expect(userPlugin2?.pluginPort).toBe(8002);
    expect(userPlugin2?.requireAuth).toBe(true);

    // Test that MCP requests use the correct user context
    // (Note: Without a real plugin server, we can't test the full flow,
    // but we can verify authentication passes)
    const user1Response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
        authorization: `Bearer ${accessToken1.token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      }),
    });
    expect(user1Response.status).toBe(200);

    const user2Response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
        authorization: `Bearer ${accessToken2.token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      }),
    });
    expect(user2Response.status).toBe(200);
  });

  it('requires admin secret for admin API', async () => {
    const { server, baseUrl, store } = await createTestServer();
    const adminSecret = 'test-admin-secret';
    cleanup.push(() =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      })
    );

    // Test 1: No authentication header → 401
    const noAuthResponse = await fetch(`${baseUrl}/admin/plugin-tokens`, {
      method: 'GET',
    });
    expect(noAuthResponse.status).toBe(401);

    // Test 2: Wrong admin secret → 403
    const wrongSecretResponse = await fetch(`${baseUrl}/admin/plugin-tokens`, {
      method: 'GET',
      headers: {
        authorization: 'Bearer wrong-secret',
      },
    });
    expect(wrongSecretResponse.status).toBe(403);

    // Test 3: Valid admin secret → 200
    const validSecretResponse = await fetch(`${baseUrl}/admin/plugin-tokens`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${adminSecret}`,
      },
    });
    expect(validSecretResponse.status).toBe(200);
    const response = await validSecretResponse.json();
    expect(response).toHaveProperty('tokens');
    expect(Array.isArray(response.tokens)).toBe(true);
  });

  it('validates token expiration', async () => {
    const { server, baseUrl, store } = await createTestServer();
    cleanup.push(() =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      })
    );

    const testUser: GitHubUser = {
      id: 12345,
      login: 'testuser',
      name: 'Test User',
      avatar_url: 'https://example.com/avatar.jpg',
    };

    // Create an expired access token
    const expiredToken: AccessToken = {
      token: 'expired-token',
      clientId: 'test-client',
      scope: 'mcp',
      githubUser: testUser,
      expiresAt: Date.now() - 1000, // Expired 1 second ago
    };
    store.saveAccessToken(expiredToken);

    // Attempt to use expired token → 401
    const expiredTokenResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${expiredToken.token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {},
      }),
    });
    expect(expiredTokenResponse.status).toBe(401);

    // Create a valid token
    const validToken: AccessToken = {
      token: 'valid-token',
      clientId: 'test-client',
      scope: 'mcp',
      githubUser: testUser,
      expiresAt: Date.now() + 3600000,
    };
    store.saveAccessToken(validToken);

    // Use valid token → 200
    const validTokenResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
        authorization: `Bearer ${validToken.token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      }),
    });
    expect(validTokenResponse.status).toBe(200);
  });

  it('allows health endpoint without authentication', async () => {
    const { server, baseUrl } = await createTestServer();
    cleanup.push(() =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      })
    );

    // Health endpoint should be accessible without authentication
    const healthResponse = await fetch(`${baseUrl}/health`);
    expect(healthResponse.status).toBe(200);
    const health = await healthResponse.json();
    expect(health.status).toBe('ok');
  });
});
