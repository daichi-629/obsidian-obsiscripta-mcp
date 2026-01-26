# Phase 3, Task 4: packages/stdio-bridge/src/bridge-server.ts 実装

## タスク説明
`packages/stdio-bridge/src/bridge-server.ts` を実装し、stdio MCP サーバーを構築する。StdioBridgeServer クラスで、Claude Desktop からの stdio 経由通信を受け取り、プラグイン側の Bridge API を介してツールを実行する。ポーリング機構でプラグイン側のツール変更を監視し、自動的に同期する。

## 必須情報
- **作成ファイル**: `packages/stdio-bridge/src/bridge-server.ts`
- **実装クラス**: `StdioBridgeServer`
- **主要メソッド**:
  1. `constructor(pluginClient: PluginClient, pollingInterval: number = 5000)`
  2. `async start(): Promise<void>` - MCP StdioServerTransport 開始
  3. `async syncTools(): Promise<void>` - ポーリングでツール一覧を同期（hash変更検知）
  4. `async registerProxiedTool(tool: MCPToolDefinition): Promise<void>` - ツール登録
  5. `async executeToolCall(toolName: string, arguments: any): Promise<ToolCallResponse>` - ツール実行
- **ポーリング機構**:
  - 5秒間隔（デフォルト）で listTools() を呼び出し
  - hash が変わったら全ツール再登録
  - 起動時にはリトライ（最大30回）
- **MCP統合**:
  - `@anthropic-sdk/sdk` の StdioServerTransport を使用
  - ツール実行時に Bridge API に POST /bridge/v1/tools/{name}/call
  - レスポンスを MCP content 形式で Claude に返却
- **参考**: plan_stdio.md の Phase 3 セクション（行183-192）

## 完了条件
- [ ] `packages/stdio-bridge/src/bridge-server.ts` が作成される
- [ ] `StdioBridgeServer` クラスが実装されている
- [ ] MCP StdioServerTransport が正しく初期化される
- [ ] `syncTools()` で 5秒間隔のポーリングが動作する
- [ ] hash 変更時にツール再登録が実行される
- [ ] プラグイン未起動時のリトライロジック（exponential backoff）が実装されている
- [ ] ツール実行が Bridge API 経由で正しく実行される
- [ ] TypeScriptコンパイルエラーがない
