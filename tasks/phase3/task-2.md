# Phase 3, Task 2: packages/stdio-bridge/src/types.ts 作成

## タスク説明
`packages/stdio-bridge/src/types.ts` ファイルを作成し、stdio-bridge が Bridge API（プラグイン）と通信するために必要な型定義を実装する。Bridge Protocol型定義を再利用または参照し、stdio-bridge 固有の型（PolingResult, ToolRegistryStateなど）も定義する。

## 必須情報
- **作成ファイル**: `packages/stdio-bridge/src/types.ts`
- **型定義対象**:
  - Bridge Protocol型（プラグイン側の `bridge-types.ts` を参照）
    - HealthResponse
    - Tool
    - ToolListResponse
    - ToolCallRequest
    - ToolCallResponse
    - ErrorResponse
  - stdio-bridge 固有型:
    - MCPContent: `{ type: "text" | "image", text?: string, data?: string }`
    - PluginClientConfig: `{ host: string, port: number, timeout: number }`
    - PollingState: `{ lastHash: string, tools: Map<string, MCPToolDefinition>, lastError?: Error }`
    - MCPToolDefinition: MCP ツール定義
- **参考**: plan_stdio.md の Phase 3 セクション（行181-182）

## 完了条件
- [ ] `packages/stdio-bridge/src/types.ts` が作成される
- [ ] すべての型がエクスポートされている
- [ ] Bridge Protocol型が正しく定義されている
- [ ] **重要**: MCPContent型定義に以下の説明をコメントとして記載
  - `content` フィールドは MCP 形式をそのまま中継する
  - 変換や拡張は行わない（プロキシ動作）
  - 型: `{ type: "text" | "image" | ..., text?: string, data?: string, ... }`
- [ ] TypeScriptコンパイルエラーがない
- [ ] 型定義が stdio-bridge の他のモジュールで利用可能である
