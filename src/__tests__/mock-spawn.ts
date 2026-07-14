import { EventEmitter } from 'node:events'
import type { spawn as nodeSpawn } from 'node:child_process'
import { PassThrough } from 'node:stream'

export type SpawnCall = {
  command: string
  args: readonly string[]
  env: NodeJS.ProcessEnv | undefined
}

export type MockSpawnBehavior = {
  code: number
  stdout?: string
  stderr?: string
}

/**
 * Vitest / node-child_process 互換 spawn の最小モック。
 * runCli() が使う `stdio: ['ignore', 'pipe', 'pipe']` / `on('close')` / `on('error')` /
 * `kill()` だけを満たす。テストごとに 1 回の spawn 呼び出しに対して 1 つの ChildLike を返し、
 * 次の tick で stdout/stderr/close を emit する。
 *
 * 返却する spawn は node の real signature (overload だらけ) に代入できるよう
 * `unknown` 経由で cast する。実行時は runCli() が使う API subset だけを触るので安全。
 */
export function createMockSpawn(behavior: MockSpawnBehavior): {
  spawn: typeof nodeSpawn
  calls: SpawnCall[]
} {
  const calls: SpawnCall[] = []

  const impl = (
    command: string,
    args: readonly string[],
    opts: { env?: NodeJS.ProcessEnv } = {},
  ): EventEmitter & {
    stdout: PassThrough
    stderr: PassThrough
    kill: (signal?: NodeJS.Signals | number) => boolean
  } => {
    calls.push({ command, args, env: opts.env })

    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough
      stderr: PassThrough
      kill: (signal?: NodeJS.Signals | number) => boolean
    }
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = () => true

    setImmediate(() => {
      if (behavior.stdout) child.stdout.write(behavior.stdout)
      if (behavior.stderr) child.stderr.write(behavior.stderr)
      child.stdout.end()
      child.stderr.end()
      child.emit('close', behavior.code, null)
    })

    return child
  }

  return { spawn: impl as unknown as typeof nodeSpawn, calls }
}

/**
 * 子プロセスが決して close しない spawn モック (timeout パス検証用)。
 * runCli() 側の setTimeout → SIGKILL → close の一連を再現する:
 * kill() が呼ばれたら次の tick で close を emit する。
 */
export function createHangingSpawn(): { spawn: typeof nodeSpawn } {
  const impl = () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough
      stderr: PassThrough
      kill: (signal?: NodeJS.Signals | number) => boolean
    }
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = (signal) => {
      setImmediate(() => {
        child.emit('close', null, signal ?? 'SIGKILL')
      })
      return true
    }
    return child
  }
  return { spawn: impl as unknown as typeof nodeSpawn }
}

/**
 * 子プロセスが 'error' event を emit する spawn モック (spawn 失敗パス検証用)。
 * ENOENT (node が見つからない等) を模す。
 * Node の実 spawn は ENOENT のとき 'error' + 'close' 両方を発火するため、
 * mock も 'error' の次 tick で 'close' を追加発火して cli-runner の
 * "先に settle した callback だけが有効" 契約を検証できるようにする。
 */
export function createErroringSpawn(err: Error): { spawn: typeof nodeSpawn } {
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
      child.emit('error', err)
      setImmediate(() => {
        child.emit('close', null, null)
      })
    })
    return child
  }
  return { spawn: impl as unknown as typeof nodeSpawn }
}

/**
 * spawn 自体が同期的に throw するモック (bin resolution 失敗などを模す)。
 * runCli() は Promise executor 内で spawn を呼ぶので、同期 throw は
 * Promise の rejection に変換される — が、tool 層の catch がその経路も
 * 拾うことを検証する。
 */
export function createSyncThrowingSpawn(err: Error): {
  spawn: typeof nodeSpawn
} {
  const impl = () => {
    throw err
  }
  return { spawn: impl as unknown as typeof nodeSpawn }
}
