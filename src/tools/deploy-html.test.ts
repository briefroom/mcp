import { z } from 'zod'
import { describe, expect, it } from 'vitest'

import { createMockSpawn } from '../__tests__/mock-spawn.js'
import { deployHtmlInputShape, runDeployHtml } from './deploy-html.js'

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
    // enum 外 (email_invite_only は deploy 経路非対応) は reject
    expect(
      deployHtmlSchema.safeParse({ path: '.', visibility: 'email_invite_only' })
        .success,
    ).toBe(false)
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
