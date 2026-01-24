# Phase 2, Task 4: ルート package.json に packageManager 設定追加

## タスク説明
プロジェクトルートの `package.json` に `"packageManager"` フィールドを追加し、pnpm を全面的に使用することを宣言する。npm や yarn の使用を防ぎ、monoレポ全体で pnpm による統一的な依存管理を実現する。

## 必須情報
- **修正ファイル**: `package.json` (プロジェクトルート)
- **追加フィールド**:
  ```json
  {
    "packageManager": "pnpm@<バージョン>"
  }
  ```
- **pnpm バージョン確認**:
  - `pnpm --version` で現在インストール済みのバージョンを確認
  - または最新の安定版バージョン（e.g., "pnpm@8.14.0"）を指定
- **参考**: plan_stdio.md の Phase 2 セクション（行174）

## 完了条件
- [ ] ルート `package.json` に `"packageManager"` フィールドが追加される
- [ ] バージョン形式が `"pnpm@X.Y.Z"` で正しい
- [ ] JSON形式が有効である（JSONLint可能）
- [ ] 他の既存フィールドが破損していない
- [ ] `pnpm install` が正常に実行される
