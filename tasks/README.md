# stdio MCP Bridge 実装計画 - タスク一覧

このディレクトリには、plan_stdio.md の実装計画を段階的なタスクに分割したファイルが含まれています。

## プロジェクト概要

**目標**: Obsidian MCP プラグインに stdio-bridge 機能を追加し、Claude Desktop から stdio 経由で Obsidian ツールにアクセス可能にする。

**アーキテクチャ**:
```
Claude Desktop
    ↓ stdio (MCP JSON-RPC)
obsidian-mcp-bridge (pnpm package)
    ↓ HTTP REST API /bridge/v1 (127.0.0.1:3000)
Obsidian Plugin (HTTP Server)
    ↓
Obsidian Vault / Tools
```

## タスク構成

### Phase 1: Plugin側 (Bridge API追加) - 5タスク

プラグイン側に Bridge Protocol v1 エンドポイントを実装し、既存の Streamable HTTP 実装をクリーンアップする段階です。

| # | タスク | 説明 |
|---|--------|------|
| 1 | [task-1.md](phase1/task-1.md) | Bridge Protocol型定義ファイル作成 |
| 2 | [task-2.md](phase1/task-2.md) | Bridge APIハンドラー実装 |
| 3 | [task-3.md](phase1/task-3.md) | server.ts にルーティング追加 |
| 4 | [task-4.md](phase1/task-4.md) | Bridge APIの curl テスト |
| 5 | [task-5.md](phase1/task-5.md) | Streamable HTTP 実装の削除とクリーンアップ |

**成果物**: `src/mcp/bridge-types.ts`, `src/mcp/bridge-api.ts`, 修正: `src/mcp/server.ts`, 削除: Streamable HTTP 関連ファイル

**期待結果**: HTTP エンドポイント `/bridge/v1/health`, `/bridge/v1/tools`, `/bridge/v1/tools/{name}/call` が動作、古い Streamable HTTP 実装は削除

---

### Phase 2: プロジェクト構造 (pnpm モノレポ化) - 5タスク

プロジェクトを pnpm monorepo 構造に移行する段階です。

| # | タスク | 説明 |
|---|--------|------|
| 1 | [task-1.md](phase2/task-1.md) | pnpm-workspace.yaml 作成 |
| 2 | [task-2.md](phase2/task-2.md) | プラグインを packages/obsidian-plugin/ へ移動 |
| 3 | [task-3.md](phase2/task-3.md) | packages/stdio-bridge ディレクトリ構造作成 |
| 4 | [task-4.md](phase2/task-4.md) | ルート package.json に packageManager 設定 |
| 5 | [task-5.md](phase2/task-5.md) | pnpm install 実行 |

**成果物**: `pnpm-workspace.yaml`, 再構成: `packages/obsidian-plugin/`, `packages/stdio-bridge/`

**期待結果**: monorepo 構造の完成、`pnpm install` でワークスペース全体の依存解決

---

### Phase 3: stdio-bridge実装 - 8タスク

stdio-bridge パッケージを実装する段階です。

| # | タスク | 説明 |
|---|--------|------|
| 1 | [task-1.md](phase3/task-1.md) | packages/stdio-bridge/package.json 作成 |
| 2 | [task-2.md](phase3/task-2.md) | packages/stdio-bridge/src/types.ts 作成 |
| 3 | [task-3.md](phase3/task-3.md) | packages/stdio-bridge/src/plugin-client.ts 実装 |
| 4 | [task-4.md](phase3/task-4.md) | packages/stdio-bridge/src/bridge-server.ts 実装 |
| 5 | [task-5.md](phase3/task-5.md) | packages/stdio-bridge/src/index.ts 実装 |
| 6 | [task-6.md](phase3/task-6.md) | packages/stdio-bridge/bin/obsidian-mcp.js 作成 |
| 7 | [task-7.md](phase3/task-7.md) | packages/stdio-bridge/tsconfig.json 作成 |
| 8 | [task-8.md](phase3/task-8.md) | stdio-bridge ビルド確認 |

**成果物**: stdio-bridge パッケージ全体 (`packages/stdio-bridge/`)

**期待結果**: ビルド完了、`obsidian-mcp` コマンド実行可能

---

### Phase 4: テスト・リリース準備 - 5タスク

統合テストとリリース工程を実施する段階です。

| # | タスク | 説明 |
|---|--------|------|
| 1 | [task-1.md](phase4/task-1.md) | Bridge API が 127.0.0.1 のみリッスンを確認 |
| 2 | [task-2.md](phase4/task-2.md) | pnpm build 実行・確認 |
| 3 | [task-3.md](phase4/task-3.md) | Claude Desktop で動作確認 |
| 4 | [task-4.md](phase4/task-4.md) | バージョン更新・manifest.json修正 |
| 5 | [task-5.md](phase4/task-5.md) | リリース実行 |

**成果物**: リリースアーティファクト、GitHub Release、npm/pnpm registry publish

**期待結果**: ユーザーが `pnpm install -g obsidian-mcp-bridge` でインストール・使用可能

---

## 各タスクの構成

各タスクファイルには以下の項目が含まれています：

1. **タスク説明** - タスクの目的と概要
2. **必須情報** - 作成/修正ファイル、参考資料、依存関係、実装詳細
3. **完了条件** - チェックリスト形式の完了基準

## 実行順序

1. Phase 1 (task-1 → task-5) 順序に実行
   - task-5 は task-1～4 完了後の最終クリーンアップタスク
2. Phase 2 (task-1 → task-5) 順序に実行
3. Phase 3 (task-1 → task-8) 順序に実行
4. Phase 4 (task-1 → task-5) 順序に実行

**前提**: 各 Phase は前の Phase が完了してから開始

## ポリシー

プロジェクト全体に適用されるポリシー（plan_stdio.md 前提・ポリシーセクション参照）：

- **外部アクセス禁止**: バインド先を `127.0.0.1` に固定、localhost専用運用
  - Phase 4 Task 1 でセキュリティ検証を実施
- **認証なし**: トークン等は導入しない（ローカルプロセス間通信のみ）
- **MCP互換性**: `content` フィールドは MCP 形式をそのまま中継（変換や拡張は行わない）
  - プロキシとしての動作を徹底
  - Phase 3 Task 2 で型定義時にコメント記載
- **パッケージマネージャー**: `npm` ではなく `pnpm` を使用
  - monorepo 全体で統一
  - Phase 2 で `pnpm-workspace.yaml` と `packageManager` フィールドで強制

## 関連ファイル

- **計画書**:
  - `plan_stdio.md` (プロジェクトルート) - 全体実装計画
  - `review.md` - plan_stdio.md レビュー
  - `task-review.md` - タスク不整合レビュー
- **参考資料**:
  - `streamable-http-notes.md` - Streamable HTTP 実装パターン（Phase 1 Task 5 参照）
- **既存コード参照**:
  - `src/mcp/server.ts:140-187` - handleRequest実装
  - `src/mcp/tools/types.ts` - MCPToolDefinition
  - `src/mcp/tools/registry.ts` - ToolRegistry
