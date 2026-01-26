# Phase 1, Task 3: server.ts にルーティング追加

## タスク説明
`src/mcp/server.ts` の `handleRequest()` 関数（行140-187参照）に `/bridge/v1/*` ルーティング分岐を追加する。Bridge API ハンドラーとのルーティング統合により、HTTPリクエストが適切に振り分けられるようにする。

## 必須情報
- **修正ファイル**: `src/mcp/server.ts`
- **修正対象**: `handleRequest()` メソッド（既存の行140-187）
- **ルーティング仕様**:
  - `GET /bridge/v1/health` → handleHealth()
  - `GET /bridge/v1/tools` → handleTools(toolRegistry)
  - `POST /bridge/v1/tools/:toolName/call` → handleToolCall(toolName, body.arguments, toolRegistry)
- **既存参照コード**:
  - `src/mcp/tools/types.ts` - MCPToolDefinition
  - `src/mcp/tools/registry.ts` - ToolRegistry クラス
- **バインド要件**: すべてのエンドポイントは `127.0.0.1` のみにバインド（外部アクセス禁止）

## 完了条件
- [ ] `/bridge/v1/` プレフィックスのリクエストを正しく分岐している
- [ ] 各エンドポイントが対応するハンドラー関数を呼び出している
- [ ] `toolName` パスパラメータが正しく抽出されている
- [ ] request body が JSON として解析されている
- [ ] **重要**: HTTP ステータスコード処理はルーティング層で実装
  - 存在しないツール呼び出し → HTTP 404 （ルーティング層）
  - 不正なリクエストボディ → HTTP 400 （ルーティング層）
  - ハンドラー内部エラー → HTTP 500 （ルーティング層）
  - ツール実行エラーは `handleToolCall()` 側で `HTTP 200 + success:false` で返す（bridge-api.ts で処理）
- [ ] `127.0.0.1` バインドのセキュリティ要件が満たされている
- [ ] TypeScriptコンパイルエラーがない
