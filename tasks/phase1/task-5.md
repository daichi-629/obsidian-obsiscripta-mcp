# Phase 1, Task 5: Streamable HTTP 実装の削除とコードのクリーンアップ

## タスク説明
Bridge Protocol v1 の実装に伴い、既存の Streamable HTTP MCP サーバー実装を削除し、コードをクリーンアップする。stdio-bridge が Claude Desktop から stdio 経由で接続するため、Streamable HTTP サーバー機能は不要になる。古い実装を整理し、プロジェクトをBridge API中心の設計に統一する。

## 必須情報
- **削除対象**:
  - Streamable HTTP サーバー関連の実装ファイル（`src/mcp/streamable-http/` など、存在する場合）
  - `StreamableHTTPServerTransport` の使用箇所
  - SSE (Server-Sent Events) 関連の実装
  - Session ID 管理（Streamable HTTP用）
  - `eventStore`, `InMemoryEventStore` などの関連クラス
  - `/mcp` エンドポイント（POST/GET/DELETE の Streamable HTTP ハンドラー）
- **参考資料**:
  - `streamable-http-notes.md` - 削除対象の実装パターン
  - プロジェクト内の既存コード検索（git grep または find）
- **保持対象**:
  - Bridge API 実装（`src/mcp/bridge-api.ts`, `src/mcp/bridge-types.ts`）
  - ツール定義・レジストリ（`src/mcp/tools/`）
  - 既存の MCP サーバーコア実装（削除対象外）
- **確認すべきファイル**:
  - `src/mcp/server.ts` - ルーティング分岐の整理
  - `src/mcp/index.ts` - エクスポート整理
  - `package.json` - Streamable HTTP 関連の依存パッケージ削除
  - ビルド設定（`esbuild.config.mjs` など）

## 完了条件
- [ ] `src/mcp/` 配下から Streamable HTTP 関連ファイルが完全に削除されている
- [ ] `src/mcp/server.ts` から `/mcp` エンドポイント（Streamable HTTP）が削除されている
- [ ] Bridge API (`/bridge/v1/*`) のみが有効なエンドポイントとして残っている
- [ ] SSE / `eventStore` / Session ID 管理（Streamable HTTP用）が削除されている
- [ ] `package.json` から Streamable HTTP 関連の不要な依存パッケージが削除されている
- [ ] コンパイルエラーがない（`pnpm build`）
- [ ] `src/mcp/index.ts` のエクスポートが整理されている（削除済みクラス・関数が参照されていない）
- [ ] TypeScript 型チェック（`pnpm check` or `tsc --noEmit`）でエラーがない
- [ ] git diff で削除内容が明確に確認可能（不要な変更がない）
- [ ] **確認コマンド**:
  ```bash
  grep -r "StreamableHTTP\|eventStore\|SSE\|Last-Event-ID" src/
  # 上記で何も返されないことを確認
  grep -r "\/mcp" src/mcp/server.ts
  # `/bridge/v1` のみ残っていることを確認
  ```

## 補足


**参考**: streamable-http-notes.md に Streamable HTTP の実装パターンが記載されているため、削除時の影響範囲を理解するのに参考になる。
