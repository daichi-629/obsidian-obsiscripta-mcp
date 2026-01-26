# Phase 4, Task 4: バージョン更新・manifest.json修正

## タスク説明
Obsidian プラグイン リリース前の準備として、バージョン番号を更新し、`manifest.json` と `versions.json` を修正する。リリースバージョンの一貫性を確保する。

## 必須情報
- **修正ファイル**:
  1. `packages/obsidian-plugin/manifest.json` - プラグインメタデータ
  2. `packages/obsidian-plugin/versions.json` - バージョン履歴
- **バージョン例** (例: 1.0.0 から 1.1.0 へ):
  ```json
  // manifest.json
  {
    "id": "obsidian-mcp",
    "name": "Obsidian MCP",
    "version": "1.1.0",
    "minAppVersion": "...",
    "description": "..."
  }
  ```
  ```json
  // versions.json（新規エントリ追加）
  {
    "1.0.0": "...",
    "1.1.0": "X.Y.Z"
  }
  ```
- **参考**: plan_stdio.md の Phase 4 セクション（行202-203）
- **セマンティックバージョニング**: MAJOR.MINOR.PATCH 形式を使用

## 完了条件
- [ ] `packages/obsidian-plugin/manifest.json` の `"version"` フィールドが新バージョンに更新される
- [ ] `packages/obsidian-plugin/versions.json` に新バージョンエントリが追加される
- [ ] バージョン番号が全ファイルで一貫している
- [ ] JSON形式が有効である（JSONLint可能）
- [ ] git ステージングに追加可能（衝突なし）
