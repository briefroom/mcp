# @briefroom/mcp

> 日本語版 README: [README.ja.md](./README.ja.md)

**briefroom stdio MCP server** — expose the [briefroom](https://briefroom.net) CLI to Claude Code, Codex, Cursor, and other agents so they can deploy HTML and pull reviewer comments without spawning shells themselves.

- **Deploy in one call** — zip a local directory, upload it, get a share URL back.
- **Pull reviewer feedback** — grab comments from the browser as AI-agent-ready Markdown.
- **List your rooms** — enumerate your existing deploys with their share URLs.

<!-- demo.gif placeholder — record a Claude Code / Cursor session driving deploy_html + get_feedback -->

## Add it to Claude Code (one command)

```bash
claude mcp add briefroom -- npx -y @briefroom/mcp
```

Set `BRIEFROOM_TOKEN` in your environment (create a PAT at [briefroom.net/dashboard/settings/tokens](https://briefroom.net/dashboard/settings/tokens)) or run `npx @briefroom/cli login` once to store it in the OS keychain.

## What it gives your agent

| Tool | What it does |
|---|---|
| `deploy_html` | Zip a local directory and upload it to briefroom. Returns a share URL. |
| `get_feedback` | Fetch reviewer comments for a share URL as AI-agent-ready Markdown (default) or JSON. |
| `list_deployments` | List rooms owned by the current PAT with their latest deploy and share URL. |

Internally each tool runs `@briefroom/cli` as a child process (`process.execPath` → `node <cli>/dist/index.js`), so behavior stays identical to the CLI and both packages evolve together.

## Install

```bash
npm i -g @briefroom/mcp
# or use it via npx (recommended for .mcp.json)
```

## Configure

Config file location and `env` interpolation semantics differ per client. Pick the block that matches yours.

### Claude Code

Put `.mcp.json` at your project root. Claude Code expands `${VAR}` against the launching shell's environment:

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

Or register it via the Claude Code CLI:

```bash
claude mcp add briefroom -- npx -y @briefroom/mcp
```

### Codex CLI

Codex reads MCP server definitions from `~/.codex/config.toml` (see the [Codex CLI docs](https://github.com/openai/codex/blob/main/docs/config.md#mcp_servers)):

```toml
[mcp_servers.briefroom]
command = "npx"
args = ["-y", "@briefroom/mcp"]
env = { BRIEFROOM_TOKEN = "hak_your_pat_here" }
```

Or omit the `env` block and let the MCP process inherit `BRIEFROOM_TOKEN` from the shell that launched Codex.

### Cursor

Cursor does not expand `${VAR}` inside `env` blocks in its MCP config, so you have to decide up front how to supply the PAT. Options, in preference order:

**Option A — user-wide config with a literal PAT (keeps PAT out of any repo):**

`~/.cursor/mcp.json`:

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

The file lives in your home directory, so there's no path for it to end up in a project's git history.

**Option B — inherit from the parent shell (no PAT in any config file):**

Either `~/.cursor/mcp.json` or the project's `.cursor/mcp.json`, with **no `env` block**:

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

With `env` omitted, the MCP process inherits your shell's environment. If you've run `npx @briefroom/cli login`, the CLI reads the PAT from the OS keychain. Alternatively, launch Cursor from a shell that has `BRIEFROOM_TOKEN=hak_...` exported.

**Not recommended — project `.cursor/mcp.json` with a literal PAT:**

> If you must put a literal PAT in the project's `.cursor/mcp.json`, add that file to `.gitignore` and never commit it. Leaked PATs in public repos are a well-known incident class — prefer options A or B above. Rotate the PAT at [briefroom.net/dashboard/settings/tokens](https://briefroom.net/dashboard/settings/tokens) if you commit one by accident.

### Other stdio-MCP clients (Cline / Roo Code / Continue / …)

The stanza above works verbatim, but consult your client's docs for `${VAR}` interpolation semantics and PAT-in-file safety before adopting it — the same "user-wide file or env inheritance" preference order applies.

## Authentication

Two options — pick whichever fits your setup:

1. **`BRIEFROOM_TOKEN` env var** (recommended for `.mcp.json`): create a PAT at [briefroom.net/dashboard/settings/tokens](https://briefroom.net/dashboard/settings/tokens) and pass it through the `env` block above.
2. **OS keychain** (recommended for local dev): run `npx @briefroom/cli login` once. The MCP server picks up the same credential automatically.

`BRIEFROOM_TOKEN` takes precedence over the keychain when both are set.

`get_feedback` also works without any credentials — comments on a share URL are public API. Auth only unlocks owner-only fields.

## Configuration reference

| Env var | Purpose | Default |
|---|---|---|
| `BRIEFROOM_TOKEN` | Personal Access Token. Skips the keychain lookup. | (unset) |
| `BRIEFROOM_API_URL` | Point the CLI at a different backend (dev / staging). | `https://briefroom.net` |

## Tool reference

### `deploy_html`

```jsonc
{
  "path": "./mockups",        // required — directory to deploy
  "room": "demo-a",           // optional — room slug: ascii identifier of the room to redeploy into
  "name": "企画書 v2",         // optional — room display name, 1-100 chars, any language
  "expires": "7d",            // optional — "7d" | "30d" | "never" (also updates the existing link on redeploy)
  "new": false,               // optional — start a brand new room
  "password": "s3cret",       // optional — password-protect the link (Pro+ plans; passed to the CLI via env, never argv)
  "visibility": "unlisted"    // optional — "unlisted" | "password_protected"; "unlisted" clears an existing password
}
```

Returns the raw CLI JSON (`share_url`, `room_id`, `version_number`, `visibility`, …).

Three identifiers that are easy to confuse:

| Field | What it is |
|---|---|
| `name` | Display name shown on the dashboard and in the viewer. Any language. Set it on the first deploy; on a redeploy it updates the room name **only when passed explicitly** (omit it to keep the current name). |
| `room` | Room slug — an ascii kebab-case identifier used only to find the existing room to redeploy into. Never part of the share URL. |
| share URL | Always auto-issued with a random token (`/s/<token>`). Not derived from `name` or `room`. |

### `get_feedback`

```jsonc
{
  "share": "https://briefroom.net/s/aB3xQ2mK9pNvR4", // URL or bare token
  "status": "all",             // optional — "open" | "resolved" | "all"
  "since": "2026-07-01T00:00Z",// optional ISO 8601 for delta pulls
  "format": "prompt",          // optional — "prompt" (Markdown) | "json"
  "locale": "ja"               // optional — "ja" | "en"
}
```

Returns Markdown by default, formatted so an agent can paste it straight back into context.

### `list_deployments`

```jsonc
{
  "limit": 20,     // optional — 1-100, default 20
  "archived": false
}
```

Returns the raw `/api/v1/rooms` JSON.

## Debugging

Log lines are written to **stderr only** — stdout is reserved for JSON-RPC. To see what the server does:

```bash
BRIEFROOM_TOKEN=$YOUR_PAT npx @modelcontextprotocol/inspector \
  npx -y @briefroom/mcp
```

Point the inspector at a running backend with `BRIEFROOM_API_URL=http://localhost:3000` when developing against a local dev server.

## Roadmap

- `resolve_comment` — pending backend PAT support on the comment PATCH endpoint.
- Streamable HTTP transport for hosted usage.

## Contributing

Issues and pull requests are welcome at [github.com/briefroom/mcp](https://github.com/briefroom/mcp). The public repo mirrors the internal source of truth in the briefroom monorepo; changes land upstream first, then are exported here.

Local dev inside this repo:

```bash
npm install
npm run build
npm test
```

## License

MIT © Talent Cloud, Inc.
