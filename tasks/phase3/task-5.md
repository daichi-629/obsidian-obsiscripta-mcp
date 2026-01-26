# Phase 3, Task 5: packages/stdio-bridge/src/index.ts CLIエントリポイント実装

## タスク説明
`packages/stdio-bridge/src/index.ts` を実装し、stdio-bridge の CLIエントリポイントとして機能させる。環境変数（`OBSIDIAN_MCP_HOST`, `OBSIDIAN_MCP_PORT`）からプラグイン接続情報を読み込み、StdioBridgeServer を起動する。

## 必須情報
- **作成ファイル**: `packages/stdio-bridge/src/index.ts`
- **実装内容**:
  ```typescript
  // 環境変数読み込み
  const host = process.env.OBSIDIAN_MCP_HOST || '127.0.0.1';
  const port = parseInt(process.env.OBSIDIAN_MCP_PORT || '3000', 10);

  // PluginClient, StdioBridgeServer 初期化
  const pluginClient = new PluginClient({ host, port, timeout: 5000 });
  const server = new StdioBridgeServer(pluginClient);

  // サーバー起動
  await server.start();
  ```
- **環境変数仕様**:
  - `OBSIDIAN_MCP_HOST`: プラグイン Bridge API バインドアドレス（デフォルト: `127.0.0.1`）
  - `OBSIDIAN_MCP_PORT`: プラグイン Bridge API バインドポート（デフォルト: `3000`）
- **エラーハンドリング**: 起動失敗時のエラーログ出力（stderr）
- **参考**: plan_stdio.md の Phase 3 セクション（行184）

## 完了条件
- [ ] `packages/stdio-bridge/src/index.ts` が作成される
- [ ] PluginClient が環境変数から正しく初期化される
- [ ] StdioBridgeServer が正しく起動される
- [ ] 環境変数 `OBSIDIAN_MCP_HOST`, `OBSIDIAN_MCP_PORT` が反映される
- [ ] エラー時に適切なログが stderr に出力される
- [ ] TypeScriptコンパイルエラーがない
