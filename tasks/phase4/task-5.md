# Phase 4, Task 5: リリース実行

## タスク説明
Obsidian プラグイン・stdio-bridge パッケージのリリース工程を実行する。GitHub Releases への公開、npm/pnpm レジストリへのパッケージ公開を行い、ユーザーが利用可能な状態にする。

## 必須情報
- **リリース工程**:
  1. **Obsidian プラグイン** (GitHub Releases):
     - ビルド完了後、`packages/obsidian-plugin/dist/` から以下をアップロード:
       - `main.js`
       - `manifest.json`
       - `styles.css` (存在する場合)
     - GitHub Releases ページ: https://github.com/<owner>/obsidian-mcp/releases
  2. **stdio-bridge** (npm/pnpm registry):
     ```bash
     cd packages/stdio-bridge
     pnpm publish
     ```
- **前提条件**:
  - Phase 4 Task 2-4 が完了している
  - GitHub アカウント・リポジトリへの書き込み権限がある
  - npm/pnpm レジストリへの認証完了（`npm login` / `pnpm login`）
  - `packages/obsidian-plugin/dist/` が最新ビルドで最新化されている
- **参考**: plan_stdio.md の Phase 4 セクション（行201-206）

## 完了条件
- [ ] Obsidian プラグイン release が GitHub Releases に作成される
- [ ] `main.js`, `manifest.json`, `styles.css` が release にアップロードされている
- [ ] Release タイトル・説明が明確である
- [ ] stdio-bridge が npm/pnpm registry に publish される
- [ ] `pnpm install -g obsidian-mcp-bridge` でグローバルインストール可能
- [ ] Claude Desktop で `obsidian-mcp` コマンドが実行可能
- [ ] リリース後、バージョンが repository に正しく反映されている
