# Obsidian非依存領域のE2Eテスト計画（再整理）

## 目的

Obsidianアプリ本体を起動せずに、以下 3 層を結合テストとして検証する。

1. `script-loader-core`（スクリプト読み込み・ホットリロード）
2. `obsidian-plugin` の `BridgeServer` / MCP HTTP API（サーバー本体）
3. `stdio-bridge`（stdio MCP ↔ HTTPブリッジ）

> 方針: 「Obsidian依存」ではなく「Obsidian API依存」を切り分け、依存性をモックすればテスト可能な層はE2E/Integrationに含める。

## 前提（なぜここまでテスト可能か）

- `script-loader-core` は既に契約テスト群があり、ファイル監視・再読込・エラー処理をモック可能な設計になっている。
- `BridgeServer` は Hono ベースのHTTPサーバーで、`ToolExecutor` を注入する構造のため、Obsidian APIそのものを起動せずにHTTP挙動を検証できる。
- `stdio-bridge` は `PluginClient` 経由でHTTP APIに依存するだけなので、Fake HTTPサーバーまたは実 `BridgeServer` を相手に結合できる。

## テスト対象スコープ（再定義）

### 含める

- `packages/script-loader-core/` のスクリプトロード/ホットリロード契約
- `packages/obsidian-plugin/src/mcp/server.ts` の HTTP API（`/bridge/v1/*`, `/mcp`）
- `packages/stdio-bridge/src/index.ts` / `bridge-server.ts` / `plugin-client.ts`
- 上記をまたぐプロトコル変換・フォールバック・エラー透過

### 含めない（この計画の範囲外）

- Obsidianアプリ実体のライフサイクル（Plugin enable/disable）
- Vault実ファイルI/O、Editor更新、Workspace状態などObsidian API実装依存
- Claude Desktop等の外部クライアント固有挙動

## モック方針（どこをモックするか）

### A. script-loader-core 層

- **モックするもの**
  - FileSystem/Watcher相当（既存テストで使うテストホスト）
  - Runtime依存（必要に応じて）
- **モックしないもの**
  - ローダー本体の状態遷移、デバウンス、登録/解除ロジック

### B. BridgeServer 層（obsidian-plugin）

- **モックするもの（最小限）**
  - Obsidian APIに触れる `context`（Vault/Workspace/Editor など）
  - 必要な場合のみ `ToolExecutor` の一部依存（外部副作用が強い箇所）
- **原則実装を使うもの**
  - `ToolExecutor` 本体ロジック（可能な限り実体を使用）
  - Honoルーティング
  - HTTPステータス/JSONレスポンス
  - Body size制限、バリデーション分岐、エラー整形

> 例外的に `ToolExecutor` 全体をモックするのは、HTTPレイヤだけを切り分けて検証したいピンポイントテストに限定する。

### C. stdio-bridge 層

- **モックするもの（ケース別）**
  1. Fake Plugin HTTPサーバー（純粋に `PluginClient`/フォールバックを見るケース）
  2. 実 `BridgeServer`（B層方針に従い「実 `ToolExecutor` + モックcontext」で `stdio-bridge` と接続するケース）
- **モックしないもの**
  - `obsidian-mcp-bridge` 実プロセス起動
  - stdio framing（Content-Length）
  - localhost HTTP通信


## Executorモック方針（追加）

- 第一選択: **実 `ToolExecutor` を使う**（contextのみモック）。
- 第二選択: 副作用の強い依存がある箇所だけ部分スタブ。
- 最終手段: `ToolExecutor` 全モック（HTTP層の純粋な分岐確認時のみ）。

この優先順位で、モック過多による実装乖離を避ける。

## テストマトリクス（何を作るか）

## 1) script-loader-core 契約テスト（既存拡張）

- 起動時ロード、追加・更新・削除、デバウンス、コンパイル失敗
- `isScriptPath` フィルタ、名前衝突、エラーハンドリング

## 2) BridgeServer HTTP統合テスト（新規）

- `/bridge/v1/health` が期待した健康状態を返す（実 `ToolExecutor` + モックcontext）
- `/bridge/v1/tools` が登録ツール一覧を返す（実 `ToolExecutor` + モックcontext）
- `/bridge/v1/tools/:name/call`
  - ツールなし → 404
  - 不正JSON/不正arguments → 400
  - 実行例外 → 500
  - 成功/ツールエラー（`success: false, isError: true`）の透過
- `/mcp` JSON-RPC
  - `tools/list`, `tools/call` 正常系
  - parse error / invalid request / method not found / internal error
- `content-length` 超過で 413

## 3) stdio-bridge E2E（Fake HTTP相手）の必要性検討

Fake HTTP相手のE2Eは**必須ではなく補助レイヤ**とする。

- **価値が高い点**
  - `PluginClient` 単体の失敗注入（不正JSON、途中切断、遅延、5xx連発）を精密に再現しやすい。
  - MCP→v1フォールバック条件を低コストで網羅できる。
- **弱い点**
  - 相手が実 `BridgeServer` でないため、HTTP実装差分による不整合は検出できない。
  - ケースを増やしすぎると「モック仕様への過適合」が起こる。

**結論（採用方針）**
- Fake HTTPは「異常系注入に特化した少数ケースのみ」採用する。
- 正常系の主要ケースは `stdio-bridge × BridgeServer` 側を正とする。

**最小採用ケース（Fake HTTP）**
- 起動時 `waitForPlugin` 成功・失敗（retry exhausted）
- MCP Standard失敗時の v1 フォールバック
- 不正JSON/不正shape時の `PluginClientError` 経路

## 4) stdio-bridge × BridgeServer 結合E2E（主系・重要）

- 構成: `spawn(stdio-bridge)` ↔ `BridgeServer(実ToolExecutor + モックcontext)`
- 目的: Fake HTTPではなく実サーバー実装と実Executorロジックを相手に、プロトコル境界をまたいで検証
- ケース:
  - v1経路で `tools/list`/`tools/call`
  - MCP経路で `tools/list`/`tools/call`
  - ツールエラー透過（`isError`保持）
  - ツールセット変更時の同期反映

## どこまでテストできるか

### テストできる

- script-loader-core のロード契約と状態遷移
- BridgeServer のHTTP/MCPプロトコル実装（ルーティング・検証・エラー）
- stdio-bridge のtransport切替、再試行、エラー正規化
- `stdio MCP ↔ HTTP API` の実運用に近い接続パス

### テストできない

- Obsidian APIの実体に紐づく副作用（Vault, Editor, UI）
- Obsidianアプリ起動時のプラグインライフサイクル競合
- 配布バイナリ（pkg）のOS差異

## 実装順序（提案）

E2Eを主眼に、まず `BridgeServer` と `stdio-bridge` の結合経路を優先する。

1. `obsidian-plugin` に `BridgeServer` 統合テストを追加（実 `ToolExecutor` + モックcontext）
2. `stdio-bridge × BridgeServer` 結合E2E（主系）を実装
3. CIを先行整備して `test:e2e` を常時実行
   - `test:e2e`（stdio-bridge単体/結合）
4. `stdio-bridge` Fake HTTP E2E（異常系注入に限定）を追加
5. `script-loader-core` 既存テストの不足ケース追加
6. CIをレイヤ分割で拡張
   - `test:contract`（script-loader-core）
   - `test:integration`（BridgeServer）
   - `test:e2e`（stdio-bridge単体/結合）

## リスクと対策

- **リスク:** 非同期（watcher/polling/retry）で不安定
  - **対策:** テスト専用タイミング設定、`waitFor` と明示タイムアウト、flaky検知
- **リスク:** プロセス起動E2Eが重い
  - **対策:** Fake HTTP層を先に高速実行し、結合E2Eは最小ケースに絞る
- **リスク:** Fake HTTPケースが増えすぎて保守コスト増
  - **対策:** Fake HTTPは異常系3〜5ケースに上限化し、正常系はBridgeServer結合E2Eに集約
