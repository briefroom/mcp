# @briefroom/mcp

> English README: [README.md](./README.md)

**briefroom stdio MCP server** — [briefroom](https://briefroom.net) の CLI を [Model Context Protocol](https://modelcontextprotocol.io) ツールとして公開し、Claude Code / Codex / Cursor などのエージェントがシェルを起動することなく HTML デプロイやレビュアーコメント取得を行えるようにします。

- **1 コールでデプロイ** — ローカルディレクトリを zip して共有 URL を返す。
- **レビュアーコメント取得** — ブラウザで付いたコメントを AI エージェント向け Markdown で回収。
- **公開中のルーム一覧** — 自分のデプロイ済みルームと共有 URL を列挙。

<!-- demo.gif プレースホルダ — deploy_html + get_feedback を Claude Code / Cursor で叩くセッションを録画 -->

## Claude Code に 1 コマンドで追加

```bash
claude mcp add briefroom -- npx -y @briefroom/mcp
```

環境変数 `BRIEFROOM_TOKEN` に PAT を設定してください（[briefroom.net/dashboard/settings/tokens](https://briefroom.net/dashboard/settings/tokens) で発行）。または `npx @briefroom/cli login` を 1 回実行すれば OS キーチェーンに保存されます。

## エージェントに提供するツール

| ツール | 機能 |
|---|---|
| `deploy_html` | ローカルディレクトリを zip して briefroom にアップロード。共有 URL を返す。 |
| `get_feedback` | 共有 URL のレビュアーコメントを AI エージェント向け Markdown（既定）または JSON で取得。 |
| `list_deployments` | 現在の PAT が所有するルームを最新デプロイと共有 URL 付きで列挙。 |

内部では各ツールが `@briefroom/cli` を子プロセス（`process.execPath` → `node <cli>/dist/index.js`）として起動しているため、挙動は CLI と一致し、両パッケージは同時にバージョンアップしていきます。

## インストール

```bash
npm i -g @briefroom/mcp
# または npx 経由で使う (推奨、.mcp.json 用)
```

## 設定

設定ファイルの場所と `env` の `${VAR}` 展開の挙動はクライアントごとに異なります。使っているクライアントに合ったブロックを選んでください。

### Claude Code

プロジェクトルートに `.mcp.json` を配置します。Claude Code は `${VAR}` を起動シェルの環境変数で展開します。

```json
{
  "mcpServers": {
    "briefroom": {
      "command": "npx",
      "args": ["-y", "@briefroom/mcp"],
      "env": {
        "BRIEFROOM_TOKEN": "${BRIEFROOM_TOKEN}"
      }
    }
  }
}
```

または Claude Code CLI で登録：

```bash
claude mcp add briefroom -- npx -y @briefroom/mcp
```

### Codex CLI

Codex は `~/.codex/config.toml` から MCP サーバ定義を読み込みます（[Codex CLI ドキュメント](https://github.com/openai/codex/blob/main/docs/config.md#mcp_servers)）。

```toml
[mcp_servers.briefroom]
command = "npx"
args = ["-y", "@briefroom/mcp"]
env = { BRIEFROOM_TOKEN = "hak_your_pat_here" }
```

`env` ブロックを省けば、Codex を起動したシェルの `BRIEFROOM_TOKEN` を MCP プロセスがそのまま継承します。

### Cursor

Cursor は MCP 設定の `env` ブロック内で `${VAR}` を展開しないため、PAT の渡し方をあらかじめ決める必要があります。優先順位順に：

**Option A — ユーザ単位設定にリテラル PAT を書く（PAT を repo に入れない）:**

`~/.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "briefroom": {
      "command": "npx",
      "args": ["-y", "@briefroom/mcp"],
      "env": { "BRIEFROOM_TOKEN": "hak_your_pat_here" }
    }
  }
}
```

ホームディレクトリにあるファイルなので、プロジェクトの git 履歴に混入する経路がありません。

**Option B — 親シェルから継承する（PAT をどの設定ファイルにも書かない）:**

`~/.cursor/mcp.json` あるいはプロジェクトの `.cursor/mcp.json` を、**`env` ブロックなし**で書きます：

```json
{
  "mcpServers": {
    "briefroom": {
      "command": "npx",
      "args": ["-y", "@briefroom/mcp"]
    }
  }
}
```

`env` を省略すると、MCP プロセスはシェルの環境変数を継承します。`npx @briefroom/cli login` を 1 回実行済みなら、CLI が OS キーチェーンから PAT を読みます。あるいは `BRIEFROOM_TOKEN=hak_...` を export したシェルから Cursor を起動する運用でも OK です。

**推奨しない — プロジェクトの `.cursor/mcp.json` にリテラル PAT を書く:**

> どうしてもプロジェクトの `.cursor/mcp.json` にリテラル PAT を書くしかない場合は、そのファイルを必ず `.gitignore` に追加してコミットしないでください。公開 repo に流出した PAT は既知のインシデントクラスです — 上記 A / B を優先してください。誤ってコミットしてしまった場合は [briefroom.net/dashboard/settings/tokens](https://briefroom.net/dashboard/settings/tokens) で PAT をローテートしてください。

### その他の stdio MCP クライアント（Cline / Roo Code / Continue / …）

上のスタンザはそのまま動きますが、`${VAR}` 展開の挙動と PAT 直書きの安全性はクライアントのドキュメントで必ず確認してから採用してください — 「ユーザ単位ファイル or 環境変数継承」の優先順は共通で有効です。

## 認証

用途に合わせて 2 通り：

1. **`BRIEFROOM_TOKEN` 環境変数**（`.mcp.json` 向け推奨）: [briefroom.net/dashboard/settings/tokens](https://briefroom.net/dashboard/settings/tokens) で PAT を発行し、上の `env` ブロックから渡す。
2. **OS キーチェーン**（ローカル開発向け推奨）: `npx @briefroom/cli login` を 1 回実行するだけ。MCP サーバは同じクレデンシャルを自動で拾います。

両方セットされている場合は `BRIEFROOM_TOKEN` が優先されます。

`get_feedback` は認証なしでも動きます — 共有 URL のコメントは公開 API です。認証はオーナー限定フィールドの解錠にだけ必要です。

## 環境変数リファレンス

| 変数 | 用途 | デフォルト |
|---|---|---|
| `BRIEFROOM_TOKEN` | Personal Access Token。キーチェーン参照をスキップします。 | (未設定) |
| `BRIEFROOM_API_URL` | 別バックエンド（dev / staging）に向ける。 | `https://briefroom.net` |

## ツールリファレンス

### `deploy_html`

```jsonc
{
  "path": "./mockups",        // 必須 — デプロイ対象ディレクトリ
  "room": "demo-a",           // 任意 — ルーム slug（再デプロイ先を指定する ascii 識別子）
  "name": "企画書 v2",         // 任意 — ルーム表示名、1〜100 字、日本語可
  "expires": "7d",            // 任意 — "7d" | "30d" | "never"（再デプロイ時に既存リンクの期限も更新）
  "new": false,               // 任意 — 新規ルームを開く
  "password": "s3cret",       // 任意 — リンクにパスワード（Pro+ プラン、CLI へは env で渡し argv には出しません）
  "visibility": "unlisted"    // 任意 — "unlisted" | "password_protected"、"unlisted" は既存パスワードをクリア
}
```

CLI の JSON (`share_url`, `room_id`, `version_number`, `visibility`, …) をそのまま返します。

混同しやすい 3 つの識別子:

| フィールド | 意味 |
|---|---|
| `name` | ダッシュボードとビューアに表示される**表示名**。日本語可。初回デプロイで設定し、再デプロイでは**明示した時だけ**既存のルーム名を更新（省略すれば現在の名前を維持）。 |
| `room` | ルーム **slug** — 再デプロイ先の既存ルームを特定するための ascii kebab-case 識別子。共有 URL には使われません。 |
| 共有 URL | 常にランダム token で自動発行 (`/s/<token>`)。`name` や `room` から生成されるものではありません。 |

### `get_feedback`

```jsonc
{
  "share": "https://briefroom.net/s/aB3xQ2mK9pNvR4", // URL または生トークン
  "status": "all",             // 任意 — "open" | "resolved" | "all"
  "since": "2026-07-01T00:00Z",// 任意 — 差分取得用 ISO 8601
  "format": "prompt",          // 任意 — "prompt"（Markdown）| "json"
  "locale": "ja"               // 任意 — "ja" | "en"
}
```

既定では Markdown を返します。エージェントがそのままコンテキストに貼り戻せる形式です。

### `list_deployments`

```jsonc
{
  "limit": 20,     // 任意 — 1〜100、既定 20
  "archived": false
}
```

`/api/v1/rooms` の JSON をそのまま返します。

## デバッグ

ログはすべて **stderr のみ** — stdout は JSON-RPC 専用です。サーバの挙動を確認するには：

```bash
BRIEFROOM_TOKEN=$YOUR_PAT npx @modelcontextprotocol/inspector \
  npx -y @briefroom/mcp
```

ローカル dev サーバに向ける場合は `BRIEFROOM_API_URL=http://localhost:3000` を指定してください。

## ロードマップ

- `resolve_comment` — コメント PATCH エンドポイントの PAT 対応待ち。
- Hosted 利用向け Streamable HTTP transport。

## コントリビュート

Issue / Pull Request は [github.com/briefroom/mcp](https://github.com/briefroom/mcp) でお待ちしています。この public repo は briefroom monorepo 内のソースをミラーしたものです — 変更はまず upstream に取り込まれてから、ここに export されます。

Repo 内での開発：

```bash
npm install
npm run build
npm test
```

## ライセンス

MIT © Talent Cloud, Inc.
