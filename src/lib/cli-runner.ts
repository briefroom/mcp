import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

/**
 * @briefroom/cli の `dist/index.js` を実ファイルパスとして解決する。
 * - `createRequire.resolve('@briefroom/cli/package.json')` で package の実体を掴み、その
 *   dirname に `dist/index.js` を継ぎ足す。workspace symlink 経由でも実パスが返る。
 * - `bin` を直接 resolve しない理由: dist が未 build のとき (test 環境等) は
 *   package.json は必ず存在するので、より頑健な参照点になる。
 */
export function resolveCliBin(): string {
  const require = createRequire(import.meta.url)
  const pkgJson = require.resolve('@briefroom/cli/package.json')
  return path.join(path.dirname(pkgJson), 'dist', 'index.js')
}

export type CliRunResult = {
  code: number
  stdout: string
  stderr: string
}

export type CliRunOptions = {
  /** 追加コマンドライン引数。undefined は無視 (Boolean flag は含めない、false は落とす) */
  args: readonly string[]
  /** ミリ秒。超過時 SIGKILL + timeout error */
  timeoutMs: number
  /** 子プロセスの env。省略時は親 env をそのまま引き継ぐ */
  env?: NodeJS.ProcessEnv
  /** 差し込み可能な bin パス (test 用) */
  cliBinPath?: string
  /** 差し込み可能な spawn (test 用) */
  spawn?: typeof nodeSpawn
  /** 差し込み可能な node バイナリ (test 用) */
  nodePath?: string
}

export class CliTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`briefroom CLI timed out after ${timeoutMs}ms`)
    this.name = 'CliTimeoutError'
  }
}

/**
 * @briefroom/cli を子プロセスとして 1 回実行し、stdout/stderr/exit code を回収する。
 * timeout 超過は SIGKILL + throw。CLI の stdout が JSON なのか Markdown なのかは
 * caller (tools/*) が知っているのでここでは interpret しない。
 */
export function runCli(opts: CliRunOptions): Promise<CliRunResult> {
  const bin = opts.cliBinPath ?? resolveCliBin()
  const nodeBin = opts.nodePath ?? process.execPath
  const spawn = opts.spawn ?? nodeSpawn
  const env = opts.env ?? process.env

  return new Promise((resolve, reject) => {
    const spawnOpts: SpawnOptions = {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
    const child = spawn(nodeBin, [bin, ...opts.args], spawnOpts)

    let stdout = ''
    let stderr = ''
    let timedOut = false

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString()
    })

    const timer = setTimeout(() => {
      timedOut = true
      // SIGKILL で確実に殺す (SIGTERM だと node CLI が握り潰す可能性がある)
      child.kill('SIGKILL')
    }, opts.timeoutMs)

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })

    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (timedOut) {
        reject(new CliTimeoutError(opts.timeoutMs))
        return
      }
      resolve({
        code: typeof code === 'number' ? code : signal ? 128 : 1,
        stdout,
        stderr,
      })
    })
  })
}
