# Phase 2, Task 3: packages/stdio-bridge ディレクトリ構造作成

## タスク説明
`packages/stdio-bridge/` ディレクトリとその基本構造（src, bin, dist）を作成する準備を行う。後続のPhase 3での詳細実装の基盤となる。

## 必須情報
- **作成ディレクトリ構造**:
  ```
  packages/stdio-bridge/
  ├── src/
  │   ├── types.ts
  │   ├── plugin-client.ts
  │   ├── bridge-server.ts
  │   └── index.ts
  ├── bin/
  │   └── obsidian-mcp.js
  ├── dist/ (ビルド後)
  ├── package.json
  └── tsconfig.json
  ```
- **参考**: plan_stdio.md の Phase 3 セクション（行177-192）
- **前提条件**: Phase 2 Task 1, 2 が完了している（pnpm-workspace.yaml が存在し、プラグインが移動済み）

## 完了条件
- [ ] `packages/stdio-bridge/` ディレクトリが作成される
- [ ] `packages/stdio-bridge/src/` ディレクトリが作成される
- [ ] `packages/stdio-bridge/bin/` ディレクトリが作成される
- [ ] ディレクトリ構造が計画と一致している
- [ ] 次のタスク（package.json作成）の実行準備が完了している
