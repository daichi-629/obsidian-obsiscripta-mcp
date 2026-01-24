# stdio MCP Bridge 実装計画

## 前提・ポリシー

- **外部アクセス禁止**: バインド先を`127.0.0.1`に固定、localhost専用運用
- **認証なし**: トークン等は導入しない（ローカルプロセス間通信のみ）
- **MCP互換性**: `content`フィールドはMCP形式をそのまま中継（変換や拡張は行わない）
- **パッケージマネージャー**: `npm`ではなく`pnpm`を使用

## アーキテクチャ

```
Claude Desktop
    ↓ stdio (MCP JSON-RPC)
obsidian-mcp-bridge (pnpm package)
    ↓ HTTP REST API /bridge/v1 (127.0.0.1:3000)
Obsidian Plugin (HTTP Server)
    ↓
Obsidian Vault / Tools
```

## Bridge Protocol v1 仕様

### 基本情報
- **ベースURL**: `http://127.0.0.1:3000/bridge/v1`
- **バインド**: `127.0.0.1`固定（外部アクセス不可）
- **Content-Type**: `application/json` (全リクエスト/レスポンス)
- **認証**: なし

### エンドポイント

#### 1. GET /bridge/v1/health
**HTTPステータス**: 200

```json
{
  "status": "ok",
  "version": "1.0.0",
  "protocolVersion": "1"
}
```

#### 2. GET /bridge/v1/tools
**HTTPステータス**: 200

```json
{
  "tools": [
    {
      "name": "read_note",
      "description": "...",
      "inputSchema": { "type": "object", "properties": {...}, "required": [...] }
    }
  ],
  "hash": "SHA256(JSON.stringify(tools_sorted))"
}
```

**hash説明**: ツール一覧のSHA256ハッシュ。ポーリング時、hashが変わったら全ツール再登録。
**算出方法（深い正規化で安定性確保）**:
```typescript
// 再帰的にキーをソート（inputSchema内部のオブジェクトキー順の揺らぎを防ぐ）
// 前提: inputSchema内の配列（enum値など）は要素順が安定であること
function deepSort(obj: any): any {
  if (Array.isArray(obj)) {
    // 配列は順序を保持（配列要素の順序変動はハッシュ変動として検知）
    return obj.map(deepSort);
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj)
      .sort()  // オブジェクトキーを辞書順にソート
      .reduce((acc, key) => {
        acc[key] = deepSort(obj[key]);
        return acc;
      }, {} as any);
  }
  return obj;
}

const sorted = toolRegistry.list()
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(t => deepSort({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema
  }));
const hashInput = JSON.stringify(sorted); // 完全に正規化されたJSON
const hash = crypto.createHash('sha256').update(hashInput).digest('hex');
```
**説明**:
- deepSort関数で全ネストレベルにおいてオブジェクトキーを辞書順ソートし、オブジェクト生成順序の違いによる誤検知を防ぐ
- 配列（enum値などのリスト）は要素順が安定であることを前提とし、順序変動はハッシュ変動として正当に検知する
- これにより、JavaScript処理系差や実装差によるキー順揺らぎから守りつつ、実際の定義変更は確実に検知できる

#### 3. POST /bridge/v1/tools/{name}/call

**Request**:
```json
{ "arguments": { "path": "note.md" } }
```

**Response (成功) - HTTPステータス 200**:
```json
{
  "success": true,
  "content": [
    { "type": "text", "text": "..." }
  ]
}
```

**Response (ツール実行エラー) - HTTPステータス 200**:
```json
{
  "success": false,
  "content": [
    { "type": "text", "text": "Error: Note not found" }
  ],
  "isError": true
}
```

**Response (ツール未登録) - HTTPステータス 404**:
```json
{
  "error": "TOOL_NOT_FOUND",
  "message": "Tool 'unknown_tool' not found"
}
```

**Response (バリデーション失敗) - HTTPステータス 400**:
```json
{
  "error": "INVALID_ARGUMENTS",
  "message": "Missing required argument: path",
  "details": { "missing": ["path"] }
}
```

**Response (サーバーエラー) - HTTPステータス 500**:
```json
{
  "error": "EXECUTION_ERROR",
  "message": "Internal server error"
}
```

**注**: `content`フィールドはMCP形式（`{type: "text"|"image", text?: string, data?: string, ...}`）をそのまま中継する

## 実装手順

### Phase 1: Plugin側 (Bridge API追加)

**ファイル作成**:
1. `src/mcp/bridge-types.ts` - Bridge Protocol型定義
2. `src/mcp/bridge-api.ts` - Bridge APIハンドラー（health/tools/call）

**修正**:
3. `src/mcp/server.ts` - `/bridge/v1/*` ルーティング追加（handleRequestで分岐）

**テスト**:
```bash
curl http://127.0.0.1:3000/bridge/v1/health
curl http://127.0.0.1:3000/bridge/v1/tools
curl -X POST http://127.0.0.1:3000/bridge/v1/tools/read_note/call \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"path": "test.md"}}'
```

### Phase 2: プロジェクト構造 (pnpm モノレポ化)

1. ルート `pnpm-workspace.yaml` 作成
2. `packages/obsidian-plugin/` にプラグインを移動
3. `packages/stdio-bridge/` 作成
4. ルート `package.json` に`"packageManager": "pnpm@..."`を追加
5. `pnpm install` で依存解決

### Phase 3: stdio-bridge実装

**ファイル作成**:
1. `packages/stdio-bridge/package.json` - `"bin": {"obsidian-mcp": "./dist/bin/obsidian-mcp.js"}`
2. `packages/stdio-bridge/src/types.ts` - Bridge Protocol型定義
3. `packages/stdio-bridge/src/plugin-client.ts` - REST APIクライアント（fetch経由）
4. `packages/stdio-bridge/src/bridge-server.ts` - StdioServerTransport + ツール同期
5. `packages/stdio-bridge/src/index.ts` - CLIエントリポイント
6. `packages/stdio-bridge/bin/obsidian-mcp.js` - シェバング付きエントリポイント
7. `packages/stdio-bridge/tsconfig.json`

**主要実装**:
- `PluginClient`: health/listTools/callToolメソッド
- `StdioBridgeServer`: start/syncTools/registerProxiedTool
- ポーリング: 5秒間隔でツール一覧をポーリング、hash変更時に再登録
- エラー処理: Plugin未起動時のリトライ（exponential backoff、最大30回）

### Phase 4: テスト・リリース準備

**機能テスト**:
1. Bridge APIが`127.0.0.1`のみリッスン（外部アクセス不可）を確認
2. `pnpm build` で stdio-bridge がバンドルされることを確認
3. Claude Desktopで`obsidian-mcp`コマンドが動作することを確認

**リリース工程**:
1. `packages/obsidian-plugin/manifest.json`の`version`を更新
2. `packages/obsidian-plugin/versions.json`に新バージョンエントリ追加
3. `packages/obsidian-plugin/`を`pnpm build`
4. Obsidian公式リリース手順に従い、GitHub Releasesへ`main.js`/`manifest.json`/`styles.css`をアップロード
5. `packages/stdio-bridge/`を`pnpm publish`（pnpm全面移行方針に従う）

## 関連ファイル

**既存（参照）**:
- `src/mcp/server.ts:140-187` - handleRequest実装
- `src/mcp/tools/types.ts` - MCPToolDefinition
- `src/mcp/tools/registry.ts` - ToolRegistry

**新規作成**:
- `src/mcp/bridge-types.ts` - Bridge Protocol型
- `src/mcp/bridge-api.ts` - Bridge APIハンドラー
- `packages/stdio-bridge/src/*` - Bridgeパッケージ全体

## Claude Desktop設定例

pnpm全面移行方針に従い、グローバルインストール済みバイナリを前提とする：

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "obsidian-mcp",
      "env": {
        "OBSIDIAN_MCP_PORT": "3000",
        "OBSIDIAN_MCP_HOST": "127.0.0.1"
      }
    }
  }
}
```

**前提条件**:
- `pnpm install -g obsidian-mcp-bridge` でグローバルインストール済み
- PATHに pnpm グローバルbin ディレクトリが含まれている（通常デフォルト）
- または、フルパスで指定：`/path/to/.pnpm/obsidian-mcp@1.0.0/bin/obsidian-mcp`
