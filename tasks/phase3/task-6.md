# Phase 3, Task 6: packages/stdio-bridge/bin/obsidian-mcp.js シェバング付きエントリポイント作成

## タスク説明
`packages/stdio-bridge/bin/obsidian-mcp.js` を作成し、ビルド済みコード（`dist/index.js`）をシェバングで実行可能にする。また、ビルド工程（Task 7 tsconfig.json + Task 8 build）で `bin/obsidian-mcp.js` が `dist/bin/obsidian-mcp.js` にコピーされることを確認する。

## 必須情報
- **作成ファイル**: `packages/stdio-bridge/bin/obsidian-mcp.js`
- **ファイル内容**:
  ```javascript
  #!/usr/bin/env node
  require('../dist/index.js').default;
  ```
  または TypeScript ES Module 対応の場合:
  ```javascript
  #!/usr/bin/env node
  import('../dist/index.js').then(m => m.default?.()).catch(e => {
    console.error(e);
    process.exit(1);
  });
  ```
- **重要**: `package.json` の `"bin"` フィールドは `./dist/bin/obsidian-mcp.js` を指す（Task 1参照）
- **ビルド処理**:
  - `tsconfig.json` は `rootDir: ./src` なので、`bin/` は手動でコピーするか、build スクリプトに追加
  - または `bin/obsidian-mcp.js` を `src/` 配下に置くか、build スクリプトで `cp bin/ dist/`
- **パーミッション**: ファイルは実行可能にする（`chmod +x`）
- **参考**: plan_stdio.md の Phase 3 セクション（行185）

## 完了条件
- [ ] `packages/stdio-bridge/bin/obsidian-mcp.js` が作成される
- [ ] ファイルの先頭に `#!/usr/bin/env node` シェバングがある
- [ ] `dist/index.js` を正しくロード・実行している
- [ ] ファイルが実行可能パーミッション（755）を持つ
- [ ] **重要**: Task 8 のビルド後、`dist/bin/obsidian-mcp.js` が存在することを確認
  - `cp bin/obsidian-mcp.js dist/bin/` またはビルドスクリプトで実装
- [ ] `pnpm install` 後、`./bin/obsidian-mcp.js` が直接実行可能である
- [ ] `obsidian-mcp` コマンドがグローバルインストール時に実行可能である（`node dist/bin/obsidian-mcp.js` で実行可能）
