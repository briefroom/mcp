import { z } from 'zod'
import { describe, expect, it } from 'vitest'

import { createMockSpawn } from '../__tests__/mock-spawn.js'
import { getFeedbackInputShape, runGetFeedback } from './get-feedback.js'

const FAKE_BIN = '/fake/cli/dist/index.js'
const FAKE_NODE = '/fake/node'

const getFeedbackSchema = z.object(getFeedbackInputShape)

describe('get_feedback tool', () => {
  it('maps input to `feedback pull -- <share>` and returns stdout', async () => {
    const md = '# Reviewer Comments\n\n## Comment 1 [open]\n'
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: md })

    const result = await runGetFeedback(
      { share: 'https://briefroom.net/s/aB3xQ2mK9pNvR4' },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )

    expect(result.isError).toBeFalsy()
    expect(result.content[0].text).toBe(md.trimEnd())
    expect(calls[0].args).toEqual([
      FAKE_BIN,
      'feedback',
      'pull',
      '--',
      'https://briefroom.net/s/aB3xQ2mK9pNvR4',
    ])
  })

  it('uses inline `=` for value flags and `--` before share', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runGetFeedback(
      {
        share: 'abcdefghijklmnopq',
        format: 'json',
        status: 'open',
        since: '2026-07-01T00:00:00Z',
        locale: 'ja',
      },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )
    expect(calls[0].args).toEqual([
      FAKE_BIN,
      'feedback',
      'pull',
      '--format=json',
      '--status=open',
      '--since=2026-07-01T00:00:00Z',
      '--locale=ja',
      '--',
      'abcdefghijklmnopq',
    ])
  })

  it('maps HTTP 404 exit to error text', async () => {
    const { spawn } = createMockSpawn({
      code: 1,
      stderr: 'Share link not found\n',
    })
    const result = await runGetFeedback(
      { share: 'nonexistent12345x' },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Share link not found')
  })
})

describe('get_feedback schema-level flag injection defense', () => {
  it('rejects share that starts with -- (--api-url injection attempt)', () => {
    const r = getFeedbackSchema.safeParse({
      share: '--api-url=http://attacker.example/',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(['share'])
      expect(r.error.issues[0].message).toMatch(/must not start with '-'/)
    }
  })

  it('rejects share that starts with a single -', () => {
    const r = getFeedbackSchema.safeParse({ share: '-token' })
    expect(r.success).toBe(false)
  })

  it('accepts URL and bare base32 share values', () => {
    expect(
      getFeedbackSchema.safeParse({
        share: 'https://briefroom.net/s/aB3xQ2mK9pNvR4xy',
      }).success,
    ).toBe(true)
    expect(
      getFeedbackSchema.safeParse({ share: 'abcdefghij2345678' }).success,
    ).toBe(true)
  })

  it('rejects since that starts with -', () => {
    const r = getFeedbackSchema.safeParse({
      share: 'abcdefghij2345678',
      since: '--api-url=http://attacker.example/',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(['since'])
    }
  })

  it('accepts valid ISO 8601 timestamps', () => {
    expect(
      getFeedbackSchema.safeParse({
        share: 'abcdefghij2345678',
        since: '2026-07-12T15:30:00Z',
      }).success,
    ).toBe(true)
  })
})

describe('get_feedback argv-level flag injection defense (schema bypass hypothetical)', () => {
  it('since override attempt stays as a single argv token via inline =', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runGetFeedback(
      {
        share: 'abcdefghij2345678',
        since: '--api-url=http://attacker.example/',
      },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )
    expect(calls[0].args).toContain(
      '--since=--api-url=http://attacker.example/',
    )
    expect(calls[0].args).not.toContain('--api-url=http://attacker.example/')
  })

  it('share is placed after `--` separator (positional protection)', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runGetFeedback(
      { share: '-hypothetical-bypass' },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )
    const args = calls[0].args
    const doubleDashIdx = args.indexOf('--')
    expect(doubleDashIdx).toBeGreaterThan(0)
    expect(args[doubleDashIdx + 1]).toBe('-hypothetical-bypass')
  })
})
