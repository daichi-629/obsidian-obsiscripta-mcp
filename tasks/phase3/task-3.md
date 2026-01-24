# Phase 3, Task 3: packages/stdio-bridge/src/plugin-client.ts 実装

## タスク説明
`packages/stdio-bridge/src/plugin-client.ts` を実装し、プラグイン側の Bridge API と通信するRESTクライアントを作成する。PluginClientクラスでhealth確認、ツール一覧取得、ツール呼び出しを実装し、通信エラー時のリトライロジックを含める。

## 必須情報
- **作成ファイル**: `packages/stdio-bridge/src/plugin-client.ts`
- **実装クラス**: `PluginClient`
- **主要メソッド**:
  1. `constructor(config: PluginClientConfig)`
  2. `async health(): Promise<HealthResponse>` - Bridge health チェック
  3. `async listTools(): Promise<ToolListResponse>` - ツール一覧取得
  4. `async callTool(toolName: string, arguments: any): Promise<ToolCallResponse>` - ツール呼び出し
- **エラーハンドリング**:
  - Exponential backoff リトライ（最大30回、初期遅延1秒）
  - タイムアウト設定（デフォルト5秒）
  - ネットワークエラーの適切なエラーメッセージ化
- **参考**: plan_stdio.md の Phase 3 セクション（行182, 189）

## 完了条件
- [ ] `packages/stdio-bridge/src/plugin-client.ts` が作成される
- [ ] `PluginClient` クラスが実装されている
- [ ] `health()`, `listTools()`, `callTool()` メソッドが実装されている
- [ ] fetch で HTTP リクエストが送信されている
- [ ] エラーレスポンス（404, 400, 500）が正しく処理される
- [ ] Exponential backoff リトライが実装されている
- [ ] TypeScriptコンパイルエラーがない
