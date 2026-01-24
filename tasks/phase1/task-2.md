# Phase 1, Task 2: Bridge APIハンドラー実装

## タスク説明
`src/mcp/bridge-api.ts` ファイルを作成し、Bridge Protocol v1の3つのエンドポイント（health, tools, call）に対応するハンドラー関数を実装する。ツール一覧のハッシュ計算では、オブジェクトキーの深い正規化を行い、JavaScript処理系差による誤検知を防ぐ。

## 必須情報
- **作成ファイル**: `src/mcp/bridge-api.ts`
- **依存モジュール**:
  - `src/mcp/bridge-types.ts` (型定義)
  - `src/mcp/tools/registry.ts` (ToolRegistry)
  - `crypto` (Node.js標準 - ハッシュ計算用)
- **実装関数**:
  1. `deepSort(obj: any): any` - オブジェクトキーを再帰的にソート（plan_stdio.md 行64-77参照）
  2. `computeToolsHash(tools: MCPToolDefinition[]): string` - tools配列からSHA256ハッシュを計算
  3. `handleHealth(): HealthResponse` - health エンドポイント
  4. `handleTools(registry: ToolRegistry): ToolListResponse` - tools エンドポイント、ハッシュを含む
  5. `handleToolCall(toolName: string, arguments: any, registry: ToolRegistry): Promise<ToolCallResponse>` - call エンドポイント
- **重要**: `handleToolCall()` の責務
  - ツール実行エラーは `HTTP 200 + { success: false, content: [...], isError: true }` で返す
  - HTTPステータスコード 404/400/500 を返すのは **ルーティング層** (server.ts) の責務
  - `handleToolCall()` 自体は常に ToolCallResponse を返す（HTTP 200）

## 完了条件
- [ ] `src/mcp/bridge-api.ts` が作成される
- [ ] `deepSort()` 関数が正しく実装されている（オブジェクトキーを辞書順にソート）
- [ ] `computeToolsHash()` でtools配列の順序がソートされている
- [ ] ハッシュが `JSON.stringify(sorted)` に対するSHA256値と一致
- [ ] エラーレスポンス（404, 400, 500）が正しく返却される
- [ ] **重要**: 実装時に以下の前提を明記する
  - `inputSchema` 内の配列（enum値などのリスト）は要素順が安定であること
  - 配列要素の順序変動はハッシュ変動として正当に検知される
  - この前提により、JavaScript処理系差によるキー順揺らぎから守りつつ、実際の定義変更は確実に検知できる
- [ ] TypeScriptコンパイルエラーがない
