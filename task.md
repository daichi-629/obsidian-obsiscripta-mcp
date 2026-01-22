# Obsidian MCP Plugin - Implementation Tasks

## Implementation Phases

### Phase 1: Minimal MCP Server + 1 Tool

**Goal**: 最速で動作確認できる最小構成を実装

**Tasks**:
1. Dependencies installation
   - Add `@modelcontextprotocol/sdk` to package.json
   - Update esbuild config if needed

2. Implement `ToolRegistry` class (tool registration/retrieval)

3. Implement `MCPServer` class with Streamable HTTP transport
   - HTTP server setup (localhost:3000)
   - **POST /mcp エンドポイント実装**
     - initializeリクエストの判定（mcp-session-idヘッダーなし）
     - `StreamableHTTPServerTransport`の生成
     - `onsessioninitialized`でsessionIdを取得・セッションマップに保存
     - `server.connect(transport)`の呼び出し
     - `transport.handleRequest(req, res)`でレスポンス処理
     - 既存セッションへのルーティング（mcp-session-idヘッダーあり）
   - **GET /mcp エンドポイント実装**
     - SSEストリーム確立
     - 既存transportの`handleRequest`にルーティング
   - **DELETE /mcp エンドポイント実装**
     - セッション終了処理
   - **セッション管理**
     - `Map<sessionId, transport>`でセッションを管理
     - `transport.onclose`でセッションマップから削除
    - resumabilityは未実装（`eventStore`は省略）
   - **McpServer生成**
     - セッション単位で`McpServer`を生成（`getServer()`パターン）
     - ツール登録はToolRegistryから取得

4. Implement 1 simple built-in tool: `read_note`

5. Update `main.ts` to start/stop server
   - シャットダウン時に全transportをclose

6. Test with Claude Desktop

**Success Criteria**:
- [x] Server starts on plugin load
- [x] `read_note` tool appears in MCP Inspector
- [x] Tool executes successfully
- [x] 複数セッションが同時に動作する
- [x] セッション終了時にクリーンアップされる

**Status**: ✅ **COMPLETED** (2026-01-22)
- Verified with MCP Inspector
- All endpoints (POST/GET/DELETE /mcp) working correctly
- Session management functional
- read_note tool successfully reads vault notes

**Critical Files**:
- `package.json` - Add MCP SDK dependency
- `src/mcp/tools/registry.ts` - Tool registry
- `src/mcp/tools/types.ts` - Type definitions
- `src/mcp/server.ts` - MCP server (Streamable HTTP transport)
- `src/main.ts` - Plugin entry point

---

### Phase 2: Script Extension System **[PRIORITY]**

**Goal**: ユーザーがカスタムツールを作成できるスクリプトシステムを実装

**Tasks**:
1. Implement `ScriptExecutor` class
   - `Function` constructor with full Obsidian API access (same as dev console)
2. Implement `ScriptCompiler` class
   - Use sucrase for TypeScript compilation
   - Cache compiled scripts
3. Implement `ScriptLoader` class
   - Discover scripts in vault-root `mcp-tools/` (or configured path)
   - Load and register tools
   - File watching for hot-reload
4. Create example script template
5. Inject Dataview API as `dv` when Dataview plugin is installed
6. Add Dataview example script for script authors
7. Integrate with ToolRegistry
8. Test custom tool from Claude Desktop

**Success Criteria**:
- [x] Scripts in the vault-root script folder are auto-discovered
- [x] JavaScript and TypeScript scripts both work
- [x] Custom tools appear in Claude Desktop
- [x] Scripts reload on file changes
- [x] Example script provided to users
- [x] Dataview plugin provides `dv` in script scope when installed

**Critical Files**:
- `src/mcp/tools/scripting/script-loader.ts`
- `src/mcp/tools/scripting/script-executor.ts`
- `src/mcp/tools/scripting/script-compiler.ts`
- `src/mcp/utils/plugin-access.ts`

---

### Phase 3: Complete Built-in Note Tools

**Goal**: 包括的なノート操作ツールを提供

**Tasks**:
1. Implement remaining note tools:
   - `create_note` (path, content)
   - `update_note` (path, content)
   - `delete_note` (path)
   - `list_notes` (folder, extension filter)
2. Add comprehensive error handling
3. Add input validation using JSON schemas
4. Test all edge cases (missing files, invalid paths, etc.)

**Success Criteria**:
- [ ] All 5 CRUD operations work correctly
- [ ] Proper error messages returned to MCP client
- [ ] Edge cases handled gracefully

**Critical Files**:
- `src/mcp/tools/builtin/notes.ts`

---

### Phase 4: Settings UI & Polish

**Goal**: ユーザーフレンドリーな設定とエラーハンドリング

**Tasks**:
1. Implement settings tab:
   - Server enable/disable
   - Port configuration
   - Auto-start toggle
   - Script folder path (vault-root relative)
   - Reload scripts button
   - Server status indicator
   - **注意文言を設定画面に表示**:
     - Desktop only（モバイル非対応）
     - スクリプト拡張はユーザー責任
     - localhost bindのみ（認証なし）
2. Add ribbon icon for quick server toggle
3. Add commands (start/stop server, reload scripts)
4. Implement comprehensive error handling
5. Add debug logging option
6. Write documentation (README, API docs)
   - **READMEの冒頭に注意文言を明記**:
     - Desktop only（モバイル非対応）
     - スクリプト拡張はユーザー責任（サンドボックスなし）
     - API全開放（localhost bindのみで認証なし）

**Success Criteria**:
- [ ] Settings UI is intuitive
- [ ] All settings persist correctly
- [ ] Clear visual feedback for server status
- [ ] Comprehensive documentation

**Critical Files**:
- `src/settings.ts`
- `src/utils/logger.ts`

---

## Verification Checklist

After implementation, verify:

- [ ] Server starts on plugin load
- [ ] Server stops on plugin unload
- [ ] Port conflicts are detected and reported
- [ ] All built-in note tools work (create, read, update, delete, list)
- [ ] Custom JavaScript scripts load and execute
- [ ] Custom TypeScript scripts compile and execute
- [ ] Scripts hot-reload on file changes
- [ ] Example script is created automatically
- [ ] Settings persist across Obsidian restarts
- [ ] Claude Desktop can connect and use tools
- [ ] Error messages are clear and helpful
- [ ] Works on Windows, Mac, and Linux (if testing available)
- [ ] Streamable HTTPの再接続対応は将来検討（`Last-Event-ID`再送は未実装）

---

## Release Checklist

リリース時に確認する項目:

> **Note**: `CHANGELOG.md`は現在存在しないため、初回リリース前に作成が必要

- [ ] `manifest.json` の `version` を更新
- [ ] `manifest.json` の `minAppVersion` を確認（最新Obsidianの要件を反映）
- [ ] `package.json` の `version` を更新
- [ ] `versions.json` を更新（version → minAppVersion のマッピング）
- [ ] CHANGELOG.md を更新（リリースノート）
- [ ] GitHub Release を作成
- [ ] `main.js`, `manifest.json`, `styles.css`（あれば）をリリースに添付

---

## Documentation Deliverables

- [ ] **README.md**: Quick start guide, installation, basic usage
- [ ] **API.md**: Script API reference with examples
- [ ] **EXAMPLES.md**: Collection of useful custom tool scripts
- [ ] **TROUBLESHOOTING.md**: Common issues and solutions

---

## Current Phase: Phase 3 - Complete Built-in Note Tools

**Previous Phase (Phase 1)**: ✅ Completed - Minimal MCP server with read_note tool verified with MCP Inspector

**Current Focus**: Implement script extension system to allow users to create custom tools in JavaScript/TypeScript

**Priority**: HIGH - This is the most valuable feature for extensibility
