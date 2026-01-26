# Phase 3, Task 7: packages/stdio-bridge/tsconfig.json 作成

## タスク説明
`packages/stdio-bridge/tsconfig.json` を作成し、stdio-bridge パッケージの TypeScript コンパイル設定を定義する。ルート `tsconfig.json` を継承し、stdio-bridge 固有の設定（出力先、ターゲット等）を追加する。

## 必須情報
- **作成ファイル**: `packages/stdio-bridge/tsconfig.json`
- **基本設定**:
  ```json
  {
    "extends": "../../tsconfig.json",
    "compilerOptions": {
      "outDir": "./dist",
      "rootDir": "./src",
      "target": "ES2020",
      "module": "ESNext",
      "lib": ["ES2020"],
      "declaration": true,
      "declarationMap": true,
      "sourceMap": true,
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "forceConsistentCasingInFileNames": true,
      "resolveJsonModule": true,
      "moduleResolution": "node"
    },
    "include": ["src/**/*"],
    "exclude": ["node_modules", "dist"]
  }
  ```
- **参考**: plan_stdio.md の Phase 3 セクション（行186）

## 完了条件
- [ ] `packages/stdio-bridge/tsconfig.json` が作成される
- [ ] ルート `tsconfig.json` が存在し、extends されている
- [ ] `"outDir": "./dist"` が設定されている
- [ ] `"rootDir": "./src"` が設定されている
- [ ] **重要**: 出力構造は `rootDir: ./src` → `outDir: ./dist` なので:
  - `src/index.ts` → `dist/index.js` （`dist/src/index.js` ではない）
  - `src/plugin-client.ts` → `dist/plugin-client.js`
  - `src/bridge-server.ts` → `dist/bridge-server.js`
  - つまり `dist/` 直下にまとめられる
- [ ] JSON形式が有効である
- [ ] `pnpm build` で TypeScript がコンパイルされる（dist/ に出力）
- [ ] **ビルドスクリプト**: Task 1 の `package.json` に定義した `"scripts"` で `tsc` が実行される際、bin/ ディレクトリもコピーされるか確認（Task 8参照）
