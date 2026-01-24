# Phase 4, Task 3: Claude Desktop で動作確認

## タスク説明
Claude Desktop で Obsidian MCP が正しく機能することを確認する。stdio-bridge がClaude Desktopから stdio 経由で起動され、プラグイン側のツールが正しく実行される統合テストを実施する。

## 必須情報
- **前提条件**:
  - Phase 1, 2, 3, Phase 4 Task 1, 2 が完了している
  - `pnpm build` が成功している
  - Obsidian プラグイン HTTP サーバーが起動している
  - Claude Desktop がインストール済み
- **Claude Desktop 設定例** (plan_stdio.md参照):
  ```json
  {
    "mcpServers": {
      "obsidian": {
        "command": "obsidian-mcp",
        "env": {
          "OBSIDIAN_MCP_PORT": "3000",
          "OBSIDIAN_MCP_HOST": "127.0.0.1"
        }
      }
    }
  }
  ```
  設定ファイルパス: `~/.claude/claude_desktop_config.json` (Windows/Mac)
- **グローバルインストール**:
  ```bash
  pnpm install -g obsidian-mcp-bridge
  ```
- **テスト項目**:
  1. Claude Desktopを再起動後、MCP Server接続状況を確認
  2. Claude に Obsidian ツール使用を促すプロンプトを入力
  3. ツール実行ログが正しく出力されることを確認

## 完了条件
- [ ] `pnpm install -g obsidian-mcp-bridge` でグローバルインストール成功
- [ ] Claude Desktop 設定ファイルに `"obsidian"` サーバーが設定されている
- [ ] Claude Desktop 再起動後、MCP Server として認識される
- [ ] Claude からツール実行プロンプト入力時、ツール一覧が表示される
- [ ] ツール実行が成功し、結果が返却される
- [ ] プラグイン未起動時に、リトライ後適切なエラーメッセージが返却される
