# Phase 3, Task 1: packages/stdio-bridge/package.json 作成

## タスク説明
`packages/stdio-bridge/package.json` を作成し、stdio-bridge パッケージとして機能するための基本設定を行う。バイナリエントリポイント（`"bin"`フィールド）を定義し、`obsidian-mcp` コマンドとして CLIツール化する。

## 必須情報
- **作成ファイル**: `packages/stdio-bridge/package.json`
- **必須フィールド**:
  ```json
  {
    "name": "obsidian-mcp-bridge",
    "version": "1.0.0",
    "description": "stdio bridge for Obsidian MCP",
    "main": "./dist/index.js",
    "bin": {
      "obsidian-mcp": "./dist/bin/obsidian-mcp.js"
    },
    "scripts": {
      "build": "tsc && cp -r bin dist/",
      "dev": "tsc --watch"
    },
    "dependencies": {
    },
    "devDependencies": {
      "@types/node": "^latest",
      "typescript": "^latest"
    },
    "type": "module",
    "engines": {
      "node": ">=16.0.0"
    }
  }
  ```
- **重要**: 依存関係の区分
  - `dependencies`: runtime に必要なパッケージのみ（stdio-bridge では実行時に必要なものを追加）
  - `devDependencies`: 開発・ビルド時のみ必要（`typescript`, `@types/node`）
  - グローバルインストール時、`devDependencies` は不要になる
- **build スクリプト**: `"tsc && cp -r bin dist/"` で TypeScript コンパイル後に bin/ をコピー（Task 8参照）
- **参考**: plan_stdio.md の Phase 3 セクション（行180）
- **前提条件**: Phase 2 Task 3 で `packages/stdio-bridge/` ディレクトリが作成されている

## 完了条件
- [ ] `packages/stdio-bridge/package.json` が作成される
- [ ] `"name"` が "obsidian-mcp-bridge" に設定されている
- [ ] `"bin"` フィールドに `"obsidian-mcp": "./dist/bin/obsidian-mcp.js"` が設定されている
- [ ] `"scripts"` に `"build"` と `"dev"` が定義されている
- [ ] JSON形式が有効である
- [ ] `pnpm install` で依存関係が正しく解決される
