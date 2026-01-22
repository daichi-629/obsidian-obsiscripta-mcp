# Obsidian MCP Plugin Implementation Plan

## Overview

Obsidian MCP pluginは、Model Context Protocol (MCP)を介してObsidianのVault操作をAIアシスタント（Claude Desktopなど）に公開するプラグインです。ユーザーがJavaScript/TypeScriptスクリプトでカスタムツールを拡張できる柔軟な設計を採用します。

## Core Requirements

- **プロトコル**: Streamable HTTP transport（推奨。リモートMCPサーバー向け）
- **対象環境**: Desktop only（モバイル互換は考慮しない）
- **拡張性**: JavaScript/TypeScript スクリプトによるツール拡張（最優先機能）
- **保存場所**: Vaultルート配下の専用フォルダ（`mcp-tools/` など）
- **組み込みツール**: ノートCRUD操作（create, read, update, delete, list）

## Architecture

### Technology Stack

- **MCP SDK**: `@modelcontextprotocol/sdk` v1.x
- **Transport**: Streamable HTTP (Node.js `http` module)
- **Script Execution**: `Function` constructor (trusted execution, full API access)
- **TypeScript Support**: sucrase for on-the-fly compilation

### Streamable HTTP Transport Details

Streamable HTTPはGET/POST/DELETEの3つのHTTPメソッドを使用し、セッション管理が必須:

**エンドポイント設計**:
- `POST /mcp` - JSON-RPCリクエスト（initialize含む）
- `GET /mcp` - SSEストリーム確立
- `DELETE /mcp` - セッション終了

**セッションライフサイクル**:
1. クライアントが`POST /mcp`で`initialize`を送信（`mcp-session-id`なし）
2. サーバーが`StreamableHTTPServerTransport`を生成
3. `onsessioninitialized`コールバックでsessionIdを取得・保存
4. `server.connect(transport)`を呼び出し
5. `transport.handleRequest(req, res)`でレスポンス処理
6. 以降のリクエストは`mcp-session-id`ヘッダーで既存transportにルーティング

**McpServer生成方針**: セッション単位で生成（セッション間の完全な分離を保証）

**Resumability**: 現状は未実装（`eventStore`は省略）。将来的に`InMemoryEventStore`で`Last-Event-ID`再送を検討

**クリーンアップ**: `transport.onclose`でセッションマップから削除、シャットダウン時に全transportをclose

### File Structure

```
src/
  main.ts                          # Plugin entry point
  settings.ts                      # Settings interface

  mcp/
    server.ts                      # MCP server implementation

    tools/
      registry.ts                  # Tool registration system
      types.ts                     # TypeScript interfaces

      builtin/
        notes.ts                   # Built-in note CRUD tools

      scripting/
        script-loader.ts           # Discover and load scripts
        script-executor.ts         # Execute scripts (trusted, full API access)
        script-compiler.ts         # Compile TypeScript to JavaScript

  utils/
    logger.ts                      # Logging utility
    plugin-access.ts               # Safe access to other plugins
```

## Key Technical Decisions

### 1. HTTP Server in Electron

**Decision**: Use Node.js `http` module directly

**Rationale**:
- Available in Obsidian's Electron environment
- Already marked as external in esbuild config
- Proven approach (obsidian-html-server plugin uses this)
- Minimal dependencies

**Security**:
- Bind to `127.0.0.1` only (localhost-only)
- No authentication (local access assumed safe; scripts are user responsibility)

**注意事項（README/設定画面に明記）**:
- Desktop only（モバイル非対応）
- スクリプト拡張はユーザー責任（サンドボックスなし、full API access）
- API全開放（localhost bindのみで認証なし）

### 2. Script Execution Environment

**Decision**: `Function` constructor with full Obsidian API access (trusted execution)

**Rationale**:
- User-authored scripts are trusted
- Provides full access to APIs available in Obsidian dev console
- Simpler than `vm` in Obsidian's Electron runtime

**Exposed API**:
```typescript
interface MCPToolContext {
  vault: Vault;      // Obsidian Vault API
  app: App;          // Obsidian App instance
  plugin: MCPPlugin; // Plugin instance
}
```
Scripts also receive `dv` when the Dataview plugin is installed (Dataview API, otherwise undefined).

### 3. TypeScript Compilation

**Decision**: sucrase for on-the-fly compilation

**Rationale**:
- Lightweight and fast for single-file transforms
- Minimal configuration needed
- Cache compiled results

### 4. Script Storage

**Decision**: Vaultルート配下のスクリプトフォルダ（例: `mcp-tools/`）

**Rationale**:
- Vault-specific configuration
- Included in vault backups/sync
- Easy for users to access and edit

### 5. Script API Design

Users can create custom tools using this API:

```javascript
// mcp-tools/example-tool.js
export default {
  name: "example_tool",
  description: "An example custom tool",
  inputSchema: {
    type: "object",
    properties: {
      param: { type: "string" }
    },
    required: ["param"]
  },
  handler: async (args, context) => {
    // context.vault: Obsidian Vault API
    // context.app: Obsidian App instance
    const files = context.vault.getMarkdownFiles();
    return { result: `Found ${files.length} files` };
  }
};
```

**Module resolution**:
- Relative `import`/`require` in scripts resolves from the script file location.

## Testing Strategy

### Phase 1 Testing

1. Install plugin in test vault
2. Verify server starts on plugin load
3. Configure Claude Desktop:
   ```json
   {
     "mcpServers": {
       "obsidian": {
         "url": "http://localhost:3000/mcp"
       }
     }
   }
   ```
4. Verify `read_note` tool appears
5. Test tool execution from Claude

### Phase 2 Testing

1. Create `mcp-tools/` folder at the vault root (or set a custom folder)
2. Add example JavaScript script
3. Verify tool auto-loads
4. Test tool from Claude Desktop
5. Create TypeScript script
6. Verify compilation works
7. Test hot-reload (edit script, verify changes apply)

### Phase 3 Testing

1. Test each CRUD operation:
   - Create note in various folders
   - Read existing notes
   - Update note content
   - Delete notes (verify trash)
   - List notes with filters
2. Test error cases:
   - Non-existent file
   - Invalid path
   - Permission issues
3. Verify proper error messages

### Phase 4 Testing

1. Test all settings UI controls
2. Test server start/stop from UI
3. Test ribbon icon
4. Test commands
5. Verify settings persistence
6. Test on different platforms (Windows, Mac, Linux)

## Potential Challenges

### Challenge 1: MCP SDK Streamable HTTP Transport

**Issue**: Streamable HTTP transport setup may need research.

**Mitigation**:
- Review MCP SDK docs for Streamable HTTP examples
- Check MCP Discord/GitHub for community examples
- Start with minimal Streamable HTTP server, add MCP layer incrementally

### Challenge 2: Node.js API Access

**Issue**: Obsidian's Electron environment may restrict Node.js APIs.

**Mitigation**:
- Test early on actual Obsidian instance (not just dev server)
- Current esbuild config marks Node modules as external (good sign)
- Have fallback plan ready if modules unavailable

### Challenge 3: Script Stability (user responsibility)

**Issue**: User scripts could crash plugin or access sensitive data.

**Mitigation**:
- Catch errors to avoid crashing the plugin
- Document that scripts are user responsibility

### Challenge 4: Port Conflicts

**Issue**: Port 3000 might already be in use.

**Mitigation**:
- Detect port conflicts on server start
- Show clear error message with port number
- Allow port configuration in settings
- Consider auto-increment to find free port

## Dependencies to Add

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

Note: May need additional packages for HTTP transport during implementation.

## Success Metrics

MVP is successful when:
1. User can install plugin
2. Server starts automatically
3. Claude Desktop connects successfully
4. User can create custom tool script in a vault-root script folder
5. Custom tool appears in Claude Desktop
6. Tool executes successfully from Claude
7. All built-in note tools work correctly

## Next Steps After MVP

Potential future enhancements:
- Search tools (full-text search, tag search)
- Link graph queries (backlinks, forward links)
- Metadata/frontmatter operations
- Dataview integration
- API key authentication for network access
- WebSocket transport option
- Tool composition/chaining
