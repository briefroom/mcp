import { z } from 'zod'
import { describe, expect, it } from 'vitest'

import { createMockSpawn } from '../__tests__/mock-spawn.js'
import {
  deployHtmlDescription,
  deployHtmlInputShape,
  runDeployHtml,
} from './deploy-html.js'

const FAKE_BIN = '/fake/cli/dist/index.js'
const FAKE_NODE = '/fake/node'

const deployHtmlSchema = z.object(deployHtmlInputShape)

describe('deploy_html tool', () => {
  it('maps input to `deploy --json --no-interactive -- <path>` and returns stdout', async () => {
    const { spawn, calls } = createMockSpawn({
      code: 0,
      stdout: '{"share_url":"https://briefroom.net/s/aB3xQ2mK9pNvR4"}\n',
    })

    const result = await runDeployHtml(
      { path: './mockups' },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )

    expect(result.isError).toBeFalsy()
    expect(result.content[0].text).toBe(
      '{"share_url":"https://briefroom.net/s/aB3xQ2mK9pNvR4"}',
    )
    expect(calls).toHaveLength(1)
    expect(calls[0].command).toBe(FAKE_NODE)
    expect(calls[0].args).toEqual([
      FAKE_BIN,
      'deploy',
      '--json',
      '--no-interactive',
      '--',
      './mockups',
    ])
  })

  it('uses inline `=` for value flags and `--` before path', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runDeployHtml(
      { path: '.', room: 'demo-room', expires: '30d', new: true },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )
    expect(calls[0].args).toEqual([
      FAKE_BIN,
      'deploy',
      '--json',
      '--no-interactive',
      '--room=demo-room',
      '--expires=30d',
      '--new',
      '--',
      '.',
    ])
  })

  it('omits --new when false', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runDeployHtml(
      { path: '.', new: false },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )
    expect(calls[0].args).not.toContain('--new')
  })

  it('maps non-zero exit to error result with stderr message', async () => {
    const { spawn } = createMockSpawn({
      code: 1,
      stderr: 'Directory not found: /nope\n',
    })
    const result = await runDeployHtml(
      { path: '/nope' },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Directory not found: /nope')
  })

  it('appends auth hint when stderr mentions Not signed in', async () => {
    const { spawn } = createMockSpawn({
      code: 1,
      stderr:
        'Not signed in. Run `briefroom login` first, or set BRIEFROOM_TOKEN (CI / MCP).\n',
    })
    const result = await runDeployHtml(
      { path: '.' },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Not signed in.')
    expect(result.content[0].text).toContain('BRIEFROOM_TOKEN')
  })

  it('appends auth hint when stderr says Authentication failed', async () => {
    const { spawn } = createMockSpawn({
      code: 1,
      stderr: 'Authentication failed. Run `briefroom login` again.\n',
    })
    const result = await runDeployHtml(
      { path: '.' },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('BRIEFROOM_TOKEN')
  })

  it('passes env to the child process', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runDeployHtml(
      { path: '.' },
      {
        spawn,
        cliBinPath: FAKE_BIN,
        nodePath: FAKE_NODE,
        env: {
          BRIEFROOM_TOKEN: 'pat_test_123',
          BRIEFROOM_API_URL: 'http://localhost:3000',
        },
      },
    )
    expect(calls[0].env?.BRIEFROOM_TOKEN).toBe('pat_test_123')
    expect(calls[0].env?.BRIEFROOM_API_URL).toBe('http://localhost:3000')
  })

  it('passes --visibility=X inline as a value flag', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runDeployHtml(
      { path: '.', visibility: 'unlisted' },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )
    expect(calls[0].args).toContain('--visibility=unlisted')
  })

  // 判断 #111 (T-PRIVATE-ROOM-3): private → --visibility=email_invite_only へ写す。
  it('maps private: true to --visibility=email_invite_only', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runDeployHtml(
      { path: '.', private: true },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )
    expect(calls[0].args).toContain('--visibility=email_invite_only')
    expect(calls[0].args.some((a) => a.startsWith('--private'))).toBe(false)
  })

  it('omits --visibility when private is false / omitted (= 既定は unlisted のまま)', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runDeployHtml(
      { path: '.', private: false },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )
    expect(calls[0].args.some((a) => a.startsWith('--visibility'))).toBe(false)
  })

  it('rejects private + password without spawning the CLI', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    const result = await runDeployHtml(
      { path: '.', private: true, password: 's3cret-pw' },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/cannot be combined with 'private'/i)
    expect(calls).toHaveLength(0)
  })

  it('rejects private + a conflicting visibility without spawning the CLI', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    const result = await runDeployHtml(
      { path: '.', private: true, visibility: 'unlisted' },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/shorthand for visibility/i)
    expect(calls).toHaveLength(0)
  })

  it('判断 #105: passes --name=<display> inline (Japanese OK) when name is provided', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runDeployHtml(
      { path: '.', name: '提案書 A 社' },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )
    // inline `=` で 1 トークン化 (flag 注入面積を最小化)
    expect(calls[0].args).toContain('--name=提案書 A 社')
  })

  it('判断 #105: omits --name when name is not provided (= 未指定は API 側で既存名維持)', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runDeployHtml(
      { path: '.' },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )
    expect(calls[0].args.some((a) => a.startsWith('--name'))).toBe(false)
  })

  it('passes password via BRIEFROOM_SHARE_PASSWORD env, never as an argv flag', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runDeployHtml(
      { path: '.', password: 's3cret-pw' },
      {
        spawn,
        cliBinPath: FAKE_BIN,
        nodePath: FAKE_NODE,
        env: { BRIEFROOM_TOKEN: 'pat_x' },
      },
    )
    // env に password が乗る + 既存 env は保持
    expect(calls[0].env?.BRIEFROOM_SHARE_PASSWORD).toBe('s3cret-pw')
    expect(calls[0].env?.BRIEFROOM_TOKEN).toBe('pat_x')
    // argv には password 値も --password フラグも一切出ない (ps 露出回避)
    const argsStr = calls[0].args.join(' ')
    expect(argsStr).not.toContain('s3cret-pw')
    expect(calls[0].args.some((a) => a.includes('password'))).toBe(false)
  })

  it('does not set BRIEFROOM_SHARE_PASSWORD when password is omitted', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runDeployHtml(
      { path: '.' },
      {
        spawn,
        cliBinPath: FAKE_BIN,
        nodePath: FAKE_NODE,
        env: { BRIEFROOM_TOKEN: 'pat_x' },
      },
    )
    expect(calls[0].env?.BRIEFROOM_SHARE_PASSWORD).toBeUndefined()
  })

  it('P2-1: rejects password + visibility=unlisted without spawning the CLI', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    const result = await runDeployHtml(
      { path: '.', password: 's3cret-pw', visibility: 'unlisted' },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/cannot be combined with visibility/i)
    // 矛盾は CLI を起動する前に弾く (= password が env で漏れて解除される穴を塞ぐ)
    expect(calls).toHaveLength(0)
  })

  it('P2-2: strips ambient BRIEFROOM_SHARE_PASSWORD from child env when no password input', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runDeployHtml(
      { path: '.' },
      {
        spawn,
        cliBinPath: FAKE_BIN,
        nodePath: FAKE_NODE,
        // 親 env に紛れ込んだ password が deploy_html({path}) だけで再適用されないこと
        env: { BRIEFROOM_SHARE_PASSWORD: 'leaked-from-parent', BRIEFROOM_TOKEN: 'x' },
      },
    )
    expect(calls[0].env?.BRIEFROOM_SHARE_PASSWORD).toBeUndefined()
    // 他の env は保持される (hermetic なのは password だけ)
    expect(calls[0].env?.BRIEFROOM_TOKEN).toBe('x')
  })
})

/**
 * 判断 #117 (AI-SHARE-SETTINGS): `allow_comments` / `display_mode` / 期限 5 択。
 * boolean は固定文字列 (`--no-comments` / `--comments`)、enum は `--key=value` inline 形式で、
 * すべて path より前・`--` より前に置く (flag injection 防御の規約)。
 */
describe('deploy_html allow_comments / display_mode / expires (判断 #117)', () => {
  const opts = { cliBinPath: FAKE_BIN, nodePath: FAKE_NODE }

  it('allow_comments: false → 固定文字列 --no-comments (値を argv に混ぜない)', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runDeployHtml({ path: './site', allow_comments: false }, { spawn, ...opts })
    expect(calls[0].args).toEqual([
      FAKE_BIN,
      'deploy',
      '--json',
      '--no-interactive',
      '--no-comments',
      '--',
      './site',
    ])
  })

  it('allow_comments: true → 固定文字列 --comments (再び ON にできる)', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runDeployHtml({ path: '.', allow_comments: true }, { spawn, ...opts })
    expect(calls[0].args).toContain('--comments')
    expect(calls[0].args).not.toContain('--no-comments')
  })

  it('allow_comments 未指定 → どちらの flag も付けない (= 既存リンク不変)', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runDeployHtml({ path: '.' }, { spawn, ...opts })
    expect(calls[0].args.some((a) => a.includes('comments'))).toBe(false)
  })

  it('display_mode: live → --display-mode=live (inline `=`、`--` より前)', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runDeployHtml({ path: './site', display_mode: 'live' }, { spawn, ...opts })
    const args = calls[0].args
    expect(args).toContain('--display-mode=live')
    expect(args.indexOf('--display-mode=live')).toBeLessThan(args.indexOf('--'))
  })

  it('display_mode 未指定 → --display-mode を付けない', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runDeployHtml({ path: '.' }, { spawn, ...opts })
    expect(calls[0].args.some((a) => a.startsWith('--display-mode'))).toBe(false)
  })

  it('expires: 24h / 90d (新しい 2 択) も --expires=<v> で渡る', async () => {
    for (const v of ['24h', '90d'] as const) {
      const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
      await runDeployHtml({ path: '.', expires: v }, { spawn, ...opts })
      expect(calls[0].args).toContain(`--expires=${v}`)
    }
  })

  it('3 項目を同時に指定しても順序は flags → -- → path のまま', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runDeployHtml(
      {
        path: './site',
        expires: '90d',
        allow_comments: false,
        display_mode: 'live',
      },
      { spawn, ...opts },
    )
    expect(calls[0].args).toEqual([
      FAKE_BIN,
      'deploy',
      '--json',
      '--no-interactive',
      '--expires=90d',
      '--no-comments',
      '--display-mode=live',
      '--',
      './site',
    ])
  })

  it('schema: expires は 5 択 (24h | 7d | 30d | 90d | never)、それ以外は reject', () => {
    for (const v of ['24h', '7d', '30d', '90d', 'never']) {
      expect(deployHtmlSchema.safeParse({ path: '.', expires: v }).success).toBe(
        true,
      )
    }
    for (const v of ['1h', '14d', 'forever', '']) {
      expect(deployHtmlSchema.safeParse({ path: '.', expires: v }).success).toBe(
        false,
      )
    }
  })

  it('schema: display_mode は review | live のみ、それ以外は reject (--api-url 注入含む)', () => {
    expect(
      deployHtmlSchema.safeParse({ path: '.', display_mode: 'review' }).success,
    ).toBe(true)
    expect(
      deployHtmlSchema.safeParse({ path: '.', display_mode: 'live' }).success,
    ).toBe(true)
    for (const v of ['fullscreen', 'Live', '', 'live --api-url=http://evil/']) {
      expect(
        deployHtmlSchema.safeParse({ path: '.', display_mode: v }).success,
      ).toBe(false)
    }
  })

  it('schema: allow_comments は boolean のみ (文字列 "false" は reject)', () => {
    expect(
      deployHtmlSchema.safeParse({ path: '.', allow_comments: false }).success,
    ).toBe(true)
    expect(
      deployHtmlSchema.safeParse({ path: '.', allow_comments: 'false' }).success,
    ).toBe(false)
  })

  it('description に 3 項目と「同じ URL のまま / 未指定は不変」が書かれている (AI が読む)', () => {
    expect(deployHtmlDescription).toContain('allow_comments')
    expect(deployHtmlDescription).toContain('display_mode')
    expect(deployHtmlDescription).toContain('24h | 7d | 30d | 90d | never')
    expect(deployHtmlDescription).toContain('same URL')
    expect(deployHtmlDescription).toContain('only when set explicitly')
  })
})

describe('deploy_html schema-level flag injection defense', () => {
  it('rejects path that starts with -- (--api-url injection attempt)', () => {
    const r = deployHtmlSchema.safeParse({
      path: '--api-url=http://attacker.example/',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(['path'])
      expect(r.error.issues[0].message).toMatch(/must not start with '-'/)
    }
  })

  it('rejects path that starts with a single -', () => {
    const r = deployHtmlSchema.safeParse({ path: '-foo' })
    expect(r.success).toBe(false)
  })

  it("accepts './-foo' (relative path escape for a literal '-' name)", () => {
    const r = deployHtmlSchema.safeParse({ path: './-foo' })
    expect(r.success).toBe(true)
  })

  it('accepts normal relative and absolute paths', () => {
    expect(deployHtmlSchema.safeParse({ path: './mockups' }).success).toBe(true)
    expect(deployHtmlSchema.safeParse({ path: '/tmp/deploy' }).success).toBe(true)
    expect(deployHtmlSchema.safeParse({ path: 'src' }).success).toBe(true)
  })

  it('rejects room that starts with -', () => {
    const r = deployHtmlSchema.safeParse({
      path: '.',
      room: '--api-url=http://attacker.example/',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(['room'])
    }
  })

  it('accepts normal room slugs including embedded dashes', () => {
    expect(
      deployHtmlSchema.safeParse({ path: '.', room: 'demo-room-a' }).success,
    ).toBe(true)
  })

  it('判断 #105: accepts name (1-100 chars, any language incl. Japanese)', () => {
    expect(
      deployHtmlSchema.safeParse({ path: '.', name: '提案書 A 社' }).success,
    ).toBe(true)
    expect(
      deployHtmlSchema.safeParse({ path: '.', name: 'Proposal for Acme' })
        .success,
    ).toBe(true)
    // 空文字は zod min(1) で reject (API 側の 400 に依存しない早期 reject)
    expect(deployHtmlSchema.safeParse({ path: '.', name: '' }).success).toBe(
      false,
    )
    // 100 字ちょうどは OK、101 字は reject
    expect(
      deployHtmlSchema.safeParse({ path: '.', name: 'a'.repeat(100) }).success,
    ).toBe(true)
    expect(
      deployHtmlSchema.safeParse({ path: '.', name: 'a'.repeat(101) }).success,
    ).toBe(false)
  })

  it('accepts password (6-128) and visibility enum, rejects out-of-range', () => {
    expect(
      deployHtmlSchema.safeParse({
        path: '.',
        password: 'abcdef',
        visibility: 'password_protected',
      }).success,
    ).toBe(true)
    // 6 字未満は reject
    expect(
      deployHtmlSchema.safeParse({ path: '.', password: 'short' }).success,
    ).toBe(false)
    // 判断 #111 (T-PRIVATE-ROOM-3): email_invite_only = 自分専用ルームとして受け付ける
    expect(
      deployHtmlSchema.safeParse({ path: '.', visibility: 'email_invite_only' })
        .success,
    ).toBe(true)
    // enum 外 (org_only は deploy 経路非対応) は reject
    expect(
      deployHtmlSchema.safeParse({ path: '.', visibility: 'org_only' }).success,
    ).toBe(false)
  })

  // 判断 #111 (T-PRIVATE-ROOM-3): private は visibility 'email_invite_only' の別名。
  it('accepts private: true and maps it to --visibility=email_invite_only', async () => {
    expect(deployHtmlSchema.safeParse({ path: '.', private: true }).success).toBe(
      true,
    )
  })
})

describe('deploy_html argv-level flag injection defense (schema bypass hypothetical)', () => {
  // schema を bypass されても、value flag は inline `=` で一つの token として
  // CLI に届く。CLI 側 (citty/mri) は `--room=` の後 (最初の `=` 以降) を丸ごと
  // 値として扱うので、`--api-url=` は独立フラグにならない。
  it('room override attempt stays as a single argv token via inline =', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runDeployHtml(
      // 型としては zod schema を通ることを想定した runtime だが、
      // 型-only の bypass シミュレーション (runDeployHtml は zod を呼ばない)
      { path: '.', room: '--api-url=http://attacker.example/' },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )
    // 期待: `--room=--api-url=http://attacker.example/` が 1 トークン
    expect(calls[0].args).toContain(
      '--room=--api-url=http://attacker.example/',
    )
    // 逆に、注入試行の payload が独立 token として現れないこと
    expect(calls[0].args).not.toContain('--api-url=http://attacker.example/')
    // また --room と value が分離した並びも許さない
    const argsStr = calls[0].args.join(' ')
    expect(argsStr).not.toMatch(/--room --api-url=/)
  })

  // path (positional) は zod で reject されるが、加えて argv 上で `--`
  // 以降に置くことで citty 側でも flag 解釈されない (定義済み behavior、
  // packages/cli/node_modules/citty parseRawArgs line ~168 で確認済み)。
  it('path is placed after `--` separator so CLI sees it as positional even if -prefix', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    // schema bypass の hypothetical: `-foo` を path として渡す (通常は schema
    // で reject)。argv 上での位置が `--` 以降になっていることだけを確認する。
    await runDeployHtml(
      { path: '-hypothetical-bypass' },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )
    const args = calls[0].args
    const doubleDashIdx = args.indexOf('--')
    expect(doubleDashIdx).toBeGreaterThan(0)
    // `--` の直後が path
    expect(args[doubleDashIdx + 1]).toBe('-hypothetical-bypass')
    // path より前に flag 群がすべて置かれている
    expect(args.slice(0, doubleDashIdx)).toContain('--json')
    expect(args.slice(0, doubleDashIdx)).toContain('--no-interactive')
  })
})
