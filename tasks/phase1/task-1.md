# Phase 1, Task 1: Bridge Protocol型定義ファイル作成

## タスク説明
`src/mcp/bridge-types.ts` ファイルを作成し、Bridge Protocol v1で定義されたすべての型定義を実装する。HTTPレスポンスやリクエストの型を整備することで、後続のBridge API実装の基盤となる。

## 必須情報
- **作成ファイル**: `src/mcp/bridge-types.ts`
- **参照仕様**: plan_stdio.md の「Bridge Protocol v1 仕様」セクション（行22-148）
- **型定義対象**:
  - HealthResponse: `{ status: "ok", version: string, protocolVersion: string }`
  - Tool: `{ name: string, description: string, inputSchema: object }`
  - ToolListResponse: `{ tools: Tool[], hash: string }`
  - ToolCallRequest: `{ arguments: Record<string, any> }`
  - ToolCallResponse (成功): `{ success: true, content: MCP Content[] }`
  - ToolCallResponse (失敗): `{ success: false, content: MCP Content[], isError: true }`
  - ErrorResponse: `{ error: string, message: string, details?: any }`

## 完了条件
- [ ] `src/mcp/bridge-types.ts` が作成される
- [ ] すべての型が正しくエクスポートされている
- [ ] TypeScriptコンパイルエラーがない
- [ ] 型定義が plan_stdio.md のプロトコル仕様と一致している
