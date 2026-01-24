# task-review: plan_stdio.md 照合で見つかった不足点

## 主な不整合・不足

1. **Phase 3 Task 6/8 と Task 1 の整合性不足**
   - `packages/stdio-bridge/package.json` の `bin` は `./dist/bin/obsidian-mcp.js` を指すが、
     Task 6 は `packages/stdio-bridge/bin/obsidian-mcp.js` の作成のみ。
   - `dist/bin/obsidian-mcp.js` を生成/コピーする手順がタスクに存在しない。
   - Task 8 は `dist/bin/obsidian-mcp.js` の生成を期待しており、現行タスクでは満たせない。

2. **Phase 3 Task 7 と Task 8 の出力パス不一致**
   - Task 7 の `tsconfig.json` では `rootDir: ./src`, `outDir: ./dist` なので生成物は `dist/index.js` などになる。
   - Task 8 は `dist/src/index.js` 等を期待しており、想定パスが一致していない。

3. **Phase 1 Task 2 のエラーハンドリング範囲が計画と不一致**
   - plan_stdio.md では `tool` 実行エラーは `HTTP 200 + success:false + isError:true`。
   - Task 2 は 404/400/500 を返すことを完了条件に含めているが、
     これは HTTP ルーティング側での応答に属するため、`handleToolCall()` 単体の責務とずれる。

4. **Phase 4 Task 5 のリリース手順が plan_stdio.md に明記されていない**
   - plan_stdio.md の Phase 4 は機能テスト中心で、GitHub Release や registry publish の具体手順がない。
   - Task 5 は GitHub Release 作成や `pnpm publish` を必須としており、計画の範囲を超えている。

## 軽微なズレ・曖昧さ

5. **Phase 2 Task 2 のファイル名が古い可能性**
   - タスクに `esbuild.mjs` とあるが、現行リポジトリは `esbuild.config.mjs`。

6. **Phase 3 Task 1 の依存関係区分が不明確**
   - `typescript` と `@types/node` を `dependencies` とする記述があるが、
     一般的には `devDependencies` で管理するため、方針の明確化が必要。

7. **Phase 4 Task 5 の npm ログイン手順が方針と曖昧**
   - plan_stdio.md は `pnpm` 使用を明記しているが、Task 5 では `npm login` を前提にしている。
