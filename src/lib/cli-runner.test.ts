import { spawn as nodeSpawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { describe, expect, it } from 'vitest'

import { CliTimeoutError, resolveCliBin, runCli } from './cli-runner.js'

describe('resolveCliBin', () => {
  it('resolves to @briefroom/cli/dist/index.js', () => {
    const bin = resolveCliBin()
    expect(bin).toMatch(/@briefroom[\/\\]?cli.*dist[\/\\]index\.js$|cli[\/\\]dist[\/\\]index\.js$/)
  })
})

describe('runCli', () => {
  it('resolves with exit code and captured stdout/stderr', async () => {
    const impl = () => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: PassThrough
        stderr: PassThrough
        kill: () => boolean
      }
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      child.kill = () => true
      setImmediate(() => {
        child.stdout.write('hello\n')
        child.stderr.write('warn\n')
        child.stdout.end()
        child.stderr.end()
        child.emit('close', 0, null)
      })
      return child
    }
    const spawn = impl as unknown as typeof nodeSpawn

    const result = await runCli({
      args: ['deploy', '.'],
      timeoutMs: 1000,
      cliBinPath: '/fake/cli.js',
      nodePath: '/fake/node',
      spawn,
    })
    expect(result.code).toBe(0)
    expect(result.stdout).toBe('hello\n')
    expect(result.stderr).toBe('warn\n')
  })

  it('rejects with CliTimeoutError when the child never closes', async () => {
    const impl = () => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: PassThrough
        stderr: PassThrough
        kill: (signal?: NodeJS.Signals) => boolean
      }
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      child.kill = (signal?: NodeJS.Signals) => {
        setImmediate(() => {
          child.emit('close', null, signal ?? 'SIGKILL')
        })
        return true
      }
      return child
    }
    const spawn = impl as unknown as typeof nodeSpawn

    await expect(
      runCli({
        args: ['deploy', '.'],
        timeoutMs: 20,
        cliBinPath: '/fake/cli.js',
        nodePath: '/fake/node',
        spawn,
      }),
    ).rejects.toBeInstanceOf(CliTimeoutError)
  })
})
