# Phase1 Code Review

## 指摘（重要度順）

### High
- **autoStart 設定が無視されてサーバーが常時起動**: `autoStart` が `false` でも `onload()` 内で必ず `start()` されるため、設定の意味がありません。期待と実動作がズレます。`src/main.ts:16-45`
- **起動失敗後にサーバーが「稼働中」に見える**: `start()` の `error` イベントで `httpServer` を `null` に戻さないため、ポート競合などで起動に失敗しても `isRunning()` が `true` を返します。UIのリボン表示や再起動操作が誤解を招きます。`src/mcp/server.ts:152-175`, `src/mcp/server.ts:197-198`

### Medium
- **scriptsPath の保存値が実際の利用値と不一致になり得る**: `updateScriptsPath()` はユーザー入力をそのまま保存し、`ScriptLoader` 側で無効パス（絶対パス/`..` 含む）をデフォルトへフォールバックします。結果として、UI上の設定値と実際の読み込み先がズレます。`src/main.ts:96-104`, `src/mcp/tools/scripting/script-loader.ts:60-83`

### Low
- **リクエストボディのサイズ上限がない**: `readRequestBody()` が無制限に蓄積するため、大きなボディでメモリ負荷が増える可能性があります。`src/mcp/server.ts:131-140`

## テスト・検証の抜け
- `autoStart=false` のときに `onload()` でサーバーが起動しないことの確認が必要です。
- ポート競合時（`EADDRINUSE`）にステータス表示と `restart-server` コマンドが正しく機能するか確認してください。
- 無効な `scriptsPath` を保存した後に、実際の読み込み先がどこになるか（UI表示と一致するか）を確認してください。
