# Phase 3, Task 8: stdio-bridge ビルド確認

## タスク説明
Phase 3 の全実装（Task 1-7）が完了した後、stdio-bridge パッケージがビルド・実行可能な状態になっていることを確認する。ビルドエラーやランタイムエラーがないことをテストする。

## 必須情報
- **ビルドコマンド**:
  ```bash
  cd packages/stdio-bridge
  pnpm build
  ```
  または
  ```bash
  pnpm -w build --filter stdio-bridge
  ```
- **ビルドプロセス**:
  1. TypeScript コンパイル（`tsc`）
  2. **重要**: `bin/` ディレクトリを `dist/bin/` にコピー
     - `package.json` の `build` スクリプトに以下を追加:
       ```json
       "build": "tsc && cp -r bin dist/"
       ```
     - または `build: "tsc && mkdir -p dist/bin && cp bin/obsidian-mcp.js dist/bin/"`
- **確認項目**:
  1. TypeScript コンパイルが成功（`dist/` に `.js` ファイル生成）
  2. `dist/bin/obsidian-mcp.js` が生成される（コピーされる）
  3. `dist/index.js`, `dist/plugin-client.js`, `dist/bridge-server.js`, `dist/types.js` が生成される（`dist/src/` ではなく `dist/` 直下）
- **テストコマンド**:
  ```bash
  node dist/bin/obsidian-mcp.js  # 起動確認（プラグイン未起動でもリトライ）
  ```
- **前提条件**: Phase 3 Task 1-7 が完了している

## 完了条件
- [ ] `pnpm build` が正常に完了する（コンパイルエラーなし）
- [ ] `packages/stdio-bridge/dist/` ディレクトリが生成される
- [ ] `dist/index.js`, `dist/plugin-client.js`, `dist/bridge-server.js`, `dist/types.js` が直下に生成される（`dist/src/` ではない）
- [ ] **重要**: `dist/bin/obsidian-mcp.js` が生成され、実行可能である
  - `cp bin/ dist/` コマンドが実行されていることを確認
- [ ] `node dist/bin/obsidian-mcp.js` で起動時にエラーが発生しない（ただしプラグイン未起動でもリトライ後終了）
- [ ] ソースマップ（`.js.map`, `.d.ts` など）が生成される
- [ ] `package.json` の `"bin"` フィールド `./dist/bin/obsidian-mcp.js` が正しく参照可能
