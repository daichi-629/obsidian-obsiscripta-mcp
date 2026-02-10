#!/usr/bin/env node

/**
 * Manual test script for MCP Standard HTTP endpoint
 *
 * Usage:
 *   1. Start the Obsidian plugin with the bridge server running
 *   2. Run: node test-mcp-endpoint.js
 */

const http = require('http');

const HOST = '127.0.0.1';
const PORT = 3000;

function makeRequest(data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);

    const options = {
      hostname: HOST,
      port: PORT,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: parsed });
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function testToolsList() {
  console.log('\n=== Testing tools/list ===');
  const request = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {},
  };

  try {
    const response = await makeRequest(request);
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));

    if (response.data.result && response.data.result.tools) {
      console.log(`✓ Found ${response.data.result.tools.length} tools`);
      return response.data.result.tools;
    } else if (response.data.error) {
      console.error('✗ Error:', response.data.error);
      return null;
    }
  } catch (error) {
    console.error('✗ Request failed:', error.message);
    return null;
  }
}

async function testToolsCall(toolName, args) {
  console.log(`\n=== Testing tools/call: ${toolName} ===`);
  const request = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args,
    },
  };

  try {
    const response = await makeRequest(request);
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));

    if (response.data.result) {
      if (response.data.result.isError) {
        console.log('✗ Tool execution error');
      } else {
        console.log('✓ Tool executed successfully');
      }
    } else if (response.data.error) {
      console.error('✗ JSON-RPC error:', response.data.error);
    }
  } catch (error) {
    console.error('✗ Request failed:', error.message);
  }
}

async function testInvalidMethod() {
  console.log('\n=== Testing invalid method ===');
  const request = {
    jsonrpc: '2.0',
    id: 3,
    method: 'invalid/method',
    params: {},
  };

  try {
    const response = await makeRequest(request);
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));

    if (response.data.error && response.data.error.code === -32601) {
      console.log('✓ Correctly returned MethodNotFound error');
    } else {
      console.log('✗ Expected MethodNotFound error');
    }
  } catch (error) {
    console.error('✗ Request failed:', error.message);
  }
}

async function testInvalidRequest() {
  console.log('\n=== Testing invalid request (missing id) ===');
  const request = {
    jsonrpc: '2.0',
    method: 'tools/list',
    params: {},
  };

  try {
    const response = await makeRequest(request);
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));

    if (response.data.error && response.data.error.code === -32600) {
      console.log('✓ Correctly returned InvalidRequest error');
    } else {
      console.log('✗ Expected InvalidRequest error');
    }
  } catch (error) {
    console.error('✗ Request failed:', error.message);
  }
}

async function main() {
  console.log('MCP Standard HTTP Endpoint Test');
  console.log(`Testing: http://${HOST}:${PORT}/mcp`);
  console.log('='.repeat(50));

  // Test tools/list
  const tools = await testToolsList();

  // Test tools/call with a real tool (if available)
  if (tools && tools.length > 0) {
    const firstTool = tools[0];
    console.log(`\nAttempting to call first tool: ${firstTool.name}`);

    // Try to construct simple arguments based on schema
    const args = {};
    if (firstTool.inputSchema && firstTool.inputSchema.properties) {
      for (const [key, prop] of Object.entries(firstTool.inputSchema.properties)) {
        if (prop.type === 'string') {
          args[key] = 'test-value';
        } else if (prop.type === 'number') {
          args[key] = 123;
        } else if (prop.type === 'boolean') {
          args[key] = true;
        }
      }
    }

    await testToolsCall(firstTool.name, args);
  }

  // Test unknown tool
  await testToolsCall('unknown_tool', {});

  // Test invalid method
  await testInvalidMethod();

  // Test invalid request
  await testInvalidRequest();

  console.log('\n' + '='.repeat(50));
  console.log('Test completed');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
