# Phase 1, Task 4: Bridge APIのcurlテスト

## タスク説明
Bridge API実装（health, tools, call エンドポイント）が正しく動作することを確認するため、curlコマンドでエンドポイントをテストする。プラグインがローカルホスト上で起動している状態で実行すること。

## 必須情報
- **テスト前提条件**:
  - Obsidian プラグイン（HTTP サーバー）が `127.0.0.1:3000` で起動している
  - Phase 1 の task-1, task-2, task-3 が完了している
- **テストコマンド**:
  ```bash
  # 1. Health エンドポイント
  curl http://127.0.0.1:3000/bridge/v1/health

  # 2. Tools エンドポイント
  curl http://127.0.0.1:3000/bridge/v1/tools

  # 3. Tool Call エンドポイント（例: read_note）
  curl -X POST http://127.0.0.1:3000/bridge/v1/tools/read_note/call \
    -H "Content-Type: application/json" \
    -d '{"arguments": {"path": "test.md"}}'
  ```

## 完了条件
- [ ] `curl http://127.0.0.1:3000/bridge/v1/health` で HTTPステータス 200、JSON形式のレスポンスが返却される
- [ ] レスポンスに `"status": "ok"`, `"version"`, `"protocolVersion"` フィールドが含まれている
- [ ] `curl http://127.0.0.1:3000/bridge/v1/tools` で HTTPステータス 200、tools配列とハッシュが返却される
- [ ] `curl` でツール呼び出しが成功した場合、HTTPステータス 200、`"success": true` が返却される
- [ ] ツール呼び出しが失敗した場合、HTTPステータス 200、`"success": false` が返却される
- [ ] 存在しないツール呼び出しの場合、HTTPステータス 404 が返却される
- [ ] 外部からのアクセス（`127.0.0.1` 以外）がブロックされている
