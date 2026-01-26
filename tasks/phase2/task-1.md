# Phase 2, Task 1: pnpm-workspace.yaml 作成

## タスク説明
プロジェクトルートに `pnpm-workspace.yaml` ファイルを作成し、pnpm モノレポ構造を定義する。workspace内のパッケージ（obsidian-plugin, stdio-bridge）が相互に依存可能な環境を整備する。

## 必須情報
- **作成ファイル**: `pnpm-workspace.yaml` (プロジェクトルート)
- **ワークスペース構成**:
  ```yaml
  packages:
    - 'packages/obsidian-plugin'
    - 'packages/stdio-bridge'
  ```
- **参考**: plan_stdio.md の Phase 2 セクション（行169-175）
- **ディレクトリ構造前提**:
  - `packages/obsidian-plugin/` (プラグイン用、後のタスクで作成)
  - `packages/stdio-bridge/` (stdio-bridge用、後のタスクで作成)

## 完了条件
- [ ] `pnpm-workspace.yaml` ファイルがプロジェクトルートに作成される
- [ ] YAML形式が正しい（インデント2スペース）
- [ ] `packages/obsidian-plugin` と `packages/stdio-bridge` が定義されている
- [ ] ファイルが `pnpm install` で認識されることを確認する
