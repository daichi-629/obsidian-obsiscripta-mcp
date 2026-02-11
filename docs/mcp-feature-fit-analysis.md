# MCP追加機能（Resources / Prompts / その他）の適合性調査

## 1. 現状サマリ

このリポジトリのMCP実装は、現時点では **tools/list と tools/call を中心にした最小実装** です。

- Plugin 側のJSON-RPCルータは `tools/list` / `tools/call` のみを分岐処理し、それ以外は `Method not found` を返します。
- stdio bridge 側のMCP server capability も `tools` のみを宣言しています。
- 公式ドキュメント上も、Phase 1の制約として「SSEなし・セッションなし・サーバー起点通知なし」が明記されています。

## 2. 機能別の適合性評価

### A. Resources（`resources/list`, `resources/read`, `resources/templates/list`）

**適合性: 高い（実装価値が高い）**

#### 期待ユースケース

- Vault内ノートを `obsidian://note/<path>` のようなURIで参照
- Attachments（画像/PDF）をバイナリリソースとして参照
- Dataview結果や検索結果を仮想リソースとして公開

#### このプラグインとの相性

- 既に `read_note` ツールがVaultアクセスを持っており、Vault読み取りの土台はある。
- Resourcesは「呼び出し型のTool」よりも「参照型データ提供」に適しており、ノート閲覧/要約系ワークロードで効率化しやすい。

#### 実装ポイント

1. Plugin `mcp-api.ts` に `resources/list`, `resources/read` を追加。
2. URIスキーム設計（例: `obsidian://vault/<path>`）。
3. アクセス制御（公開範囲、除外フォルダ、バイナリサイズ上限）。
4. stdio bridgeでResourceハンドラを登録し、HTTP `/mcp` に透過フォワード。

#### 注意点

- 画像/PDFの大量読み込みは応答サイズとメモリ圧迫に注意。
- ノートの機密情報を意図せず列挙しないため、公開ポリシーが必要。

---

### B. Prompts（`prompts/list`, `prompts/get`）

**適合性: 中〜高（運用次第で価値が大きい）**

#### 期待ユースケース

- 「週次レビュー」「ノート要約」「文体整形」など定型プロンプトを配布
- Vaultテンプレートやfrontmatterに紐づくプロンプト生成

#### このプラグインとの相性

- 既に script tools をホットリロードできる設計のため、同様に `mcp-prompts/` ディレクトリを持たせる実装が自然。
- Obsidianユーザーはテンプレート運用に慣れており、Prompt資産化との親和性が高い。

#### 実装ポイント

1. Prompt定義の保存形式（YAML/JSON/TS）を決定。
2. `prompts/list` でメタデータ列挙、`prompts/get` で引数展開して返却。
3. script tools同様の検証・ロードエラーハンドリングを導入。

#### 注意点

- Prompt注入リスク（ノート本文をそのまま埋め込む場合）へのガードが必要。

---

### C. Completions（`completion/complete`）

**適合性: 中（限定用途なら有効）**

#### 期待ユースケース

- Tool引数のパス補完（ノート名、タグ、フォルダ）
- Prompt引数の候補提示（テンプレート名、日付形式）

#### このプラグインとの相性

- Vaultのファイル名・タグ・見出しなど候補ソースが豊富。
- ただしMCPクライアント側がcompletion UIをどう扱うかに依存するため、導入効果はクライアント実装次第。

#### 実装ポイント

- 最初は `path` 引数補完に限定して小さく始める。
- 補完候補生成に対するタイムアウトと件数制限を設定。

---

### D. Roots

**適合性: 中（多Vault/ワークスペース運用で効く）**

#### 期待ユースケース

- MCPクライアントから見た作業ルートをVault単位で宣言
- 複数Vaultや部分公開時の境界管理

#### 相性

- 現実装では単一Obsidian Vaultコンテキスト前提なので必須ではない。
- ただし将来の「公開範囲制御」と組み合わせると効果的。

---

### E. Progress / Notifications / Logging

**適合性: 中（長時間Toolで有効）**

#### 背景

- docs上で現状は「サーバー起点通知なし」。
- Script toolには長時間処理（検索・集計・生成）があり得る。

#### 価値

- 進捗通知によりUX改善（“止まっているように見える”問題の軽減）。
- logging連携でトラブルシュートが容易。

#### 前提

- まずSSE/streaming対応（少なくとも通知を運べる経路）が必要。

---

### F. Sampling / Elicitation など高度機能

**適合性: 低〜中（段階導入推奨）**

- 実装難易度と安全設計コストが高い。
- まずは Resources / Prompts / Completions を先行し、利用実績を見て判断するのが妥当。

## 3. 追加機能導入の前提ギャップ

現コードから見える主要ギャップは以下です。

1. **Methodディスパッチがtools専用**
   - Plugin `handleMCPRequest` の分岐は `tools/list` と `tools/call` のみ。
2. **stdio bridge capabilityがtoolsのみ**
   - `McpServer` 初期化時に `capabilities.tools` だけを宣言。
3. **セッション/ストリーミング未対応**
   - 仕様ドキュメントに現時点の制約として明記。

## 4. 推奨ロードマップ（実装優先度）

### Phase A（短期・高効果）

1. Resources（list/read）
2. Prompts（list/get）

> どちらも既存のVaultデータ・script運用と親和性が高く、価値が伝わりやすい。

### Phase B（中期）

3. Completions（path補完から開始）
4. Roots（公開範囲とセット）

### Phase C（中長期）

5. Notifications / Progress / Logging（SSE導入後）
6. Sampling / Elicitation（ガバナンス設計後）

## 5. 実装方式の提案（最小変更）

- 既存の `ToolRegistry` と同様に、`ResourceRegistry` / `PromptRegistry` を追加。
- Pluginは `/mcp` エンドポイントを維持しつつ、JSON-RPC methodを段階拡張。
- stdio bridgeは `PluginClient` に `mcpRequest()` ベースの汎用メソッドを追加し、機能別ラッパーを薄く実装。
- まずは「HTTP単発レスポンスで成立する機能（Resources / Prompts）」から実装し、SSE依存機能は後続に分離。

## 6. 結論

- このプラグインは **Resources と Prompts の適合性が特に高く、次点でCompletions** です。
- 一方で、通知系・セッション依存系は現状アーキテクチャ（stateless + no SSE）とのギャップが大きいため、段階導入が現実的です。
- したがって、次の一歩としては **Resources/PROMPTSを先行導入し、運用で得た要求をもとに通知・高度機能へ拡張** する方針を推奨します。
