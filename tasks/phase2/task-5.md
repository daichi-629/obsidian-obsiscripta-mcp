# Phase 2, Task 5: pnpm install 実行

## タスク説明
pnpm monoレポ構造の完成を確認するため、`pnpm install` を実行する。すべてのワークスペースパッケージの依存関係が正しく解決され、`pnpm-lock.yaml` が生成されることを確認する。

## 必須情報
- **実行コマンド**:
  ```bash
  cd /home/daichi/Documents/obsidianPluginDev/.obsidian/plugins/obsidian-mcp
  pnpm install
  ```
- **前提条件**:
  - Phase 2 Task 1, 2, 3, 4 が完了している
  - `pnpm-workspace.yaml` が存在する
  - `packages/obsidian-plugin/package.json` と `packages/stdio-bridge/package.json` が存在する
  - ルート `package.json` に `"packageManager": "pnpm@..."` が設定されている
- **予期される結果**:
  - `pnpm-lock.yaml` が生成される
  - `node_modules/` ディレクトリが作成される
  - `packages/obsidian-plugin/node_modules` と `packages/stdio-bridge/node_modules` が作成される

## 完了条件
- [ ] `pnpm install` が正常に完了する（エラーがない）
- [ ] `pnpm-lock.yaml` ファイルが生成される
- [ ] `node_modules/` ディレクトリが作成される
- [ ] `packages/obsidian-plugin/` と `packages/stdio-bridge/` 配下に `node_modules/` が存在する（リンク構造）
- [ ] `pnpm list` でワークスペースパッケージが認識されている
- [ ] 両ワークスペースパッケージのビルドコマンドが実行可能である（`pnpm -w build` など）
