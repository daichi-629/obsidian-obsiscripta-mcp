# ObsiScripta Bridge

Obsidian の Vault 操作を MCP 経由で扱うための、**Obsidian プラグイン + stdio ブリッジ**のモノレポです。
スクリプトツールを追加して拡張できることを重視しています。

> [!IMPORTANT]
>
> - **Desktop 版 Obsidian 専用**です（モバイル非対応）。
> - スクリプト拡張は Obsidian API へフルアクセス可能で、サンドボックスはありません。
> - Bridge Protocol v1 エンドポイントには認証がありません（互換維持のため）。
> - MCP Standard エンドポイントは API キー認証必須です。

## できること

- **MCP Standard HTTP API**（JSON-RPC 2.0）を利用できる
- 互換維持のための **Bridge Protocol v1 HTTP API** も同時提供
- ノート操作の組み込みツール（読み取り + 編集系）
- JavaScript / TypeScript でカスタムツールを追加
- `mcp-tools/` のスクリプトをホットリロード

## リポジトリ構成（monorepo）

- `packages/obsidian-plugin/`
  Obsidian プラグイン本体（ローカル HTTP サーバーを提供）
- `packages/stdio-bridge/`
  MCP stdio サーバー（CLI: `obsidian-mcp`）。プラグインの HTTP サーバーへフォワード
- `packages/shared/`
  共有型・プロトコル定義
- `examples/`
  スクリプトツールのサンプル
- `docs/`
  プロトコル仕様・リリース手順など

## アーキテクチャ概要

1. Obsidian プラグインがローカル HTTP サーバーを起動
2. stdio bridge が MCP クライアント（Claude Desktop など）と接続
3. stdio bridge からプラグインへ HTTP で中継
4. ツール実行時に組み込みツール / script tools を呼び出し

stdio bridge の通信モードは次の 3 つです。

- `auto`（既定）: MCP Standard を優先し、必要なら v1 へフォールバック
- `mcp`: MCP Standard のみ
- `v1`: Bridge Protocol v1 のみ

## セットアップ

### 前提

- Node.js（LTS 推奨）
- `pnpm`（このリポジトリは pnpm workspace）
- Obsidian Desktop

### 開発起動

```bash
pnpm install
pnpm run dev
```

その後、Obsidian をリロードし、**Settings → Community plugins** でプラグインを有効化してください。

### ビルド

```bash
pnpm run build
```

## よく使うコマンド

### ルート（全パッケージ横断）

```bash
pnpm run dev
pnpm run build
pnpm run lint
pnpm run test
pnpm run test:integration
```

### パッケージ単位

```bash
pnpm --filter obsiscripta-bridge-plugin run dev
pnpm --filter obsiscripta-bridge-plugin run build
pnpm --filter obsiscripta-bridge-plugin run lint

pnpm --filter obsidian-mcp-bridge run dev
pnpm --filter obsidian-mcp-bridge run build
pnpm --filter obsidian-mcp-bridge run build:binary

pnpm --filter @obsiscripta/shared run build
```

## インストール

### 手動インストール

以下を vault 側のプラグインフォルダへ配置します。

```text
<Vault>/.obsidian/plugins/obsidian-mcp/
  main.js
  manifest.json
  styles.css
```

### BRAT 経由

1. **BRAT** をインストールして有効化
2. **Settings → BRAT → Add Beta plugin** を選択
3. リポジトリ URL（例: `https://github.com/daichi-629/obsidian-obsiscripta-mcp`）を入力
4. **Settings → Community plugins** から **ObsiScripta Bridge** を有効化

## エンドポイント仕様

プラグインは次の 2 系統を同時に公開します。

1. **MCP Standard HTTP（推奨）**
   `http://127.0.0.1:3000/mcp`
    - JSON-RPC 2.0
    - MCP specification 2025-03-26
    - API キー必須（`X-ObsiScripta-Api-Key` または `Authorization: Bearer ...`）

2. **Bridge Protocol v1（互換用）**
   `http://127.0.0.1:3000/bridge/v1`
    - 旧来の独自 HTTP API
    - v1 互換維持のため認証なし

詳細は [docs/protocol.md](docs/protocol.md) を参照してください。

## Claude Desktop 連携（stdio bridge）

1. Obsidian の **Settings → Community plugins → ObsiScripta Bridge** を開く
2. **Connection info** でホストとポートを確認（例: `127.0.0.1:3000`）
3. プラグイン設定で MCP API キーを発行
4. GitHub Releases から OS 向け `obsidian-mcp` バイナリを取得
5. Claude Desktop の MCP 設定へ追加

```json
{
	"mcpServers": {
		"obsidian": {
			"command": "/path/to/obsidian-mcp",
			"env": {
				"OBSIDIAN_MCP_HOST": "127.0.0.1",
				"OBSIDIAN_MCP_PORT": "3000",
				"OBSIDIAN_MCP_API_KEY": "obsi_...",
				"OBSIDIAN_MCP_TRANSPORT": "auto"
			}
		}
	}
}
```

ポート変更後はプラグインで **Restart server** を実行し、`OBSIDIAN_MCP_PORT` も合わせて更新してください。

## Script tools

既定では vault ルート配下の `mcp-tools/` を監視します（設定で変更可能）。

```text
mcp-tools/
```

最小例:

```js
export default {
	// ツール名はファイルパスから自動決定されます。
	// mcp-tools/example_tool.js -> example_tool
	// mcp-tools/utils/helper.js -> utils/helper
	description: "Example custom tool",
	inputSchema: {
		type: "object",
		properties: {
			query: { type: "string" },
		},
		required: ["query"],
	},
	handler: async (args, context) => {
		const files = context.vault.getMarkdownFiles();
		return {
			content: [{ type: "text", text: `Found ${files.length} files` }],
		};
	},
};
```

補足:

- 相対 import はスクリプトファイル基準で解決されます
- Dataview が有効なら `dv` API を利用可能
- Templater が有効なら `tp` API を利用可能
- Omnisearch が有効ならグローバル `omnisearch` API を利用可能

サンプルは以下を参照:

- `examples/dataview-example.js`
- `examples/templater-example.js`
- `examples/omnisearch-example.js`

## テスト

```bash
pnpm run test
pnpm run test:integration
```

統合テストは `packages/integration-tests` に集約されています。

## バージョン管理

モノレポ内のバージョン同期はルートスクリプトを使ってください。

```bash
pnpm run version:patch
pnpm run version:minor
pnpm run version:major
pnpm run version:bump <x.y.z>
```

## リリース

GitHub Actions を利用した配布手順は [docs/release.md](docs/release.md) を参照してください。

## 参考リンク

- Obsidian API docs: https://docs.obsidian.md
- Releases: https://github.com/daichi-629/obsidian-obsiscripta-mcp/releases
