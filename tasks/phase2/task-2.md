# Phase 2, Task 2: プラグインディレクトリの移動

## タスク説明
既存の Obsidian プラグインファイルを `packages/obsidian-plugin/` へ移動する。monoレポ構造化により、プラグインと stdio-bridge を独立したパッケージとして管理可能にする。

## 必須情報
- **移動元**: 現在のプロジェクトルート配下の以下ファイル・ディレクトリ
  - `src/` (プラグイン実装コード)
  - `styles.css`
  - `manifest.json`
  - `esbuild.config.mjs` (or `esbuild.mjs` - ビルド設定、現行リポジトリを確認)
  - `package.json` (プラグイン用に修正)
  - `tsconfig.json` (プラグイン用に修正)
  - その他プラグイン関連ファイル
- **移動先**: `packages/obsidian-plugin/`
- **注意事項**:
  - プラグイン用の `package.json` 内の依存関係が正しく設定されることを確認
  - ルート `pnpm-workspace.yaml` に `packages/obsidian-plugin` が記載されていることを前提
  - git で追跡する必要があるので、移動後 `.gitignore` 設定を確認

## 完了条件
- [ ] `packages/obsidian-plugin/` ディレクトリが作成される
- [ ] すべてのプラグイン関連ファイルが移動される
- [ ] `packages/obsidian-plugin/package.json` が存在し、適切な設定を持つ
- [ ] `packages/obsidian-plugin/src/` に実装コードが移動される
- [ ] ルートの `src/` ディレクトリは空になる（または stdio-bridge用コードのみ残る）
- [ ] `pnpm install` が正常に実行される
