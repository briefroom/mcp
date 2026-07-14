import { describe, expect, it } from 'vitest'

import {
  createErroringSpawn,
  createHangingSpawn,
  createSyncThrowingSpawn,
} from '../__tests__/mock-spawn.js'
import { runDeployHtml } from '../tools/deploy-html.js'
import { runGetFeedback } from '../tools/get-feedback.js'
import { runListDeployments } from '../tools/list-deployments.js'
import { CliTimeoutError, type CliRunResult } from './cli-runner.js'
import { cliErrorResult, cliExceptionResult } from './tool-result.js'

const FAKE_BIN = '/fake/cli/dist/index.js'
const FAKE_NODE = '/fake/node'
const OVERRIDES = { cliBinPath: FAKE_BIN, nodePath: FAKE_NODE, timeoutMs: 25 }

describe('cliExceptionResult (unit)', () => {
  it('formats CliTimeoutError with the ms value + retry hint', () => {
    const r = cliExceptionResult(new CliTimeoutError(120_000))
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toContain('120000ms')
    expect(r.content[0].text).toMatch(/timed out|Retry/i)
  })

  it('wraps generic Error with "Failed to launch" prefix', () => {
    const r = cliExceptionResult(new Error('boom'))
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toContain('Failed to launch briefroom CLI')
    expect(r.content[0].text).toContain('boom')
  })

  it('appends Node err.code (ENOENT etc.) when present', () => {
    const err = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })
    const r = cliExceptionResult(err)
    expect(r.content[0].text).toContain('spawn ENOENT')
    expect(r.content[0].text).toContain('(ENOENT)')
  })

  it('ignores non-string code field (e.g. numeric errno-only)', () => {
    const err = Object.assign(new Error('generic'), { code: 42 })
    const r = cliExceptionResult(err)
    expect(r.content[0].text).toContain('generic')
    expect(r.content[0].text).not.toContain('(42)')
  })

  it('coerces string, null, undefined via String() fallback', () => {
    expect(cliExceptionResult('boom').content[0].text).toContain(
      'Failed to launch briefroom CLI: boom',
    )
    expect(cliExceptionResult(null).content[0].text).toContain(
      'Failed to launch briefroom CLI: null',
    )
    expect(cliExceptionResult(undefined).content[0].text).toContain(
      'Failed to launch briefroom CLI: undefined',
    )
  })
})

describe('cliErrorResult (unit)', () => {
  const mkResult = (over: Partial<CliRunResult> = {}): CliRunResult => ({
    code: 1,
    stdout: '',
    stderr: '',
    ...over,
  })

  it('prefers stderr when both are set', () => {
    const r = cliErrorResult(
      mkResult({ stderr: 'stderr wins\n', stdout: 'stdout' }),
    )
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toBe('stderr wins')
  })

  it('falls back to stdout when stderr is empty', () => {
    const r = cliErrorResult(mkResult({ stderr: '', stdout: 'stdout msg\n' }))
    expect(r.content[0].text).toBe('stdout msg')
  })

  it('falls back to exit-code placeholder when both empty', () => {
    const r = cliErrorResult(mkResult({ code: 137 }))
    expect(r.content[0].text).toBe('CLI exited with code 137')
  })

  it('injects auth hint on "Not signed in" (case-insensitive)', () => {
    const r = cliErrorResult(mkResult({ stderr: 'not signed in.\n' }))
    expect(r.content[0].text).toContain('BRIEFROOM_TOKEN')
    expect(r.content[0].text).toContain('npx @briefroom/cli login')
  })

  it('injects auth hint on "Authentication failed"', () => {
    const r = cliErrorResult(
      mkResult({ stderr: 'Authentication failed. Run login.\n' }),
    )
    expect(r.content[0].text).toContain('BRIEFROOM_TOKEN')
  })

  it('does not inject auth hint on unrelated errors', () => {
    const r = cliErrorResult(
      mkResult({ stderr: 'Room slug already exists.\n' }),
    )
    expect(r.content[0].text).not.toContain('BRIEFROOM_TOKEN')
  })
})

describe('tool timeout is normalized to isError:true (per-tool integration)', () => {
  it('deploy_html: hanging spawn → timeout tool error', async () => {
    const { spawn } = createHangingSpawn()
    const result = await runDeployHtml(
      { path: '.' },
      { ...OVERRIDES, spawn },
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/timed out after 25ms/i)
  })

  it('get_feedback: hanging spawn → timeout tool error', async () => {
    const { spawn } = createHangingSpawn()
    const result = await runGetFeedback(
      { share: 'abcdefghij2345678' },
      { ...OVERRIDES, spawn },
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/timed out after 25ms/i)
  })

  it('list_deployments: hanging spawn → timeout tool error', async () => {
    const { spawn } = createHangingSpawn()
    const result = await runListDeployments(
      {},
      { ...OVERRIDES, spawn },
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/timed out after 25ms/i)
  })
})

describe('tool spawn failure is normalized to isError:true (per-tool integration)', () => {
  const spawnErr = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })

  it('deploy_html: erroring spawn → launch-failure with (ENOENT) code', async () => {
    const { spawn } = createErroringSpawn(spawnErr)
    const result = await runDeployHtml(
      { path: '.' },
      { ...OVERRIDES, timeoutMs: 5000, spawn },
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Failed to launch briefroom CLI')
    expect(result.content[0].text).toContain('spawn ENOENT')
    expect(result.content[0].text).toContain('(ENOENT)')
  })

  it('get_feedback: erroring spawn → launch-failure tool error', async () => {
    const { spawn } = createErroringSpawn(spawnErr)
    const result = await runGetFeedback(
      { share: 'abcdefghij2345678' },
      { ...OVERRIDES, timeoutMs: 5000, spawn },
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Failed to launch briefroom CLI')
  })

  it('list_deployments: erroring spawn → launch-failure tool error', async () => {
    const { spawn } = createErroringSpawn(spawnErr)
    const result = await runListDeployments(
      {},
      { ...OVERRIDES, timeoutMs: 5000, spawn },
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Failed to launch briefroom CLI')
  })
})

describe('tool synchronous spawn throw is normalized to isError:true', () => {
  // spawn() が同期的に throw する経路 (bin resolution 失敗を模す)。
  // Promise executor 内での throw は Promise の rejection に変換され、
  // runCliAsToolResult の try/catch が拾い、cliExceptionResult が整形する。
  // これが正しく動かないと future refactor で await の位置を変えたときに regression する。
  const syncErr = new Error('resolve bin failed')

  it('deploy_html: sync-throwing spawn → tool error, no unhandled rejection', async () => {
    const { spawn } = createSyncThrowingSpawn(syncErr)
    const result = await runDeployHtml(
      { path: '.' },
      { ...OVERRIDES, timeoutMs: 5000, spawn },
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Failed to launch briefroom CLI')
    expect(result.content[0].text).toContain('resolve bin failed')
  })

  it('get_feedback: sync-throwing spawn → tool error', async () => {
    const { spawn } = createSyncThrowingSpawn(syncErr)
    const result = await runGetFeedback(
      { share: 'abcdefghij2345678' },
      { ...OVERRIDES, timeoutMs: 5000, spawn },
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('resolve bin failed')
  })

  it('list_deployments: sync-throwing spawn → tool error', async () => {
    const { spawn } = createSyncThrowingSpawn(syncErr)
    const result = await runListDeployments(
      {},
      { ...OVERRIDES, timeoutMs: 5000, spawn },
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('resolve bin failed')
  })
})
