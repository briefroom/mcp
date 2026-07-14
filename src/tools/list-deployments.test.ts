import { describe, expect, it } from 'vitest'

import { createMockSpawn } from '../__tests__/mock-spawn.js'
import { runListDeployments } from './list-deployments.js'

const FAKE_BIN = '/fake/cli/dist/index.js'
const FAKE_NODE = '/fake/node'

describe('list_deployments tool', () => {
  it('maps input to `list --json` and returns stdout', async () => {
    const json = '{"rooms":[],"total":0,"limit":20}'
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: json })

    const result = await runListDeployments(
      {},
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )

    expect(result.isError).toBeFalsy()
    expect(result.content[0].text).toBe(json)
    expect(calls[0].args).toEqual([FAKE_BIN, 'list', '--json'])
  })

  it('appends --limit=N and --archived when provided (inline = for value flag)', async () => {
    const { spawn, calls } = createMockSpawn({ code: 0, stdout: '{}' })
    await runListDeployments(
      { limit: 50, archived: true },
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )
    expect(calls[0].args).toEqual([
      FAKE_BIN,
      'list',
      '--json',
      '--limit=50',
      '--archived',
    ])
  })

  it('maps 401 exit to error with auth hint', async () => {
    const { spawn } = createMockSpawn({
      code: 1,
      stderr: 'Not signed in. Run `briefroom login` first.\n',
    })
    const result = await runListDeployments(
      {},
      { spawn, cliBinPath: FAKE_BIN, nodePath: FAKE_NODE },
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Not signed in.')
    expect(result.content[0].text).toContain('BRIEFROOM_TOKEN')
  })
})
