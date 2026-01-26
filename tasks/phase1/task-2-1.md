# Phase 1, Task 2-1: MCPToolContext 伝播設計と修正

## タスク説明
Bridge API の `handleToolCall()` が `MCPToolContext` を確実に取得できるように、サーバーが context を保持し、tool 実行時に `handleToolCall()` へ渡す設計に統一する。Bridge API / MCP SDK 双方で同一の context を使用する。

## 目的
- issue: `issues/bridge-api-tool-context.md` の解消
- `handleToolCall()` で context 不足により実行不能になる問題を修正

## 必須情報
- **修正ファイル**:
- `src/mcp/bridge-api.ts` (`handleToolCall()` の引数に context を追加)
- `src/mcp/server.ts` (context を保持し、Bridge API 呼び出し時に `handleToolCall()` に渡す)
- **関連型**:
  - `src/mcp/tools/types.ts` - `MCPToolContext`

## 設計方針
- context は **Plugin からサーバー起動時に生成してサーバーが保持**する。
- `ToolRegistry` は context を保持しない。
- `handleToolCall()` は `context` 引数を受け取り、呼び出し側が必ず渡す（暫定的な `unknown` キャストは削除）。

## 実装詳細
1. `bridge-api.ts` の `handleToolCall()` に `context: MCPToolContext` を追加する。
2. `server.ts` が context を保持し、Bridge API ルーティングで `handleToolCall()` に渡す。
3. `handleToolCall()` は `context` が未設定の場合はエラー応答を返す。

## 完了条件
- [ ] サーバーが context を保持する
- [ ] `handleToolCall()` が `context` 引数を受け取る
- [ ] Bridge API の tool call が context 不足で失敗しない
- [ ] `issues/bridge-api-tool-context.md` の問題が解消される
