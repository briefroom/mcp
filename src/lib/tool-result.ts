import {
  CliTimeoutError,
  runCli,
  type CliRunOptions,
  type CliRunResult,
} from './cli-runner.js'

export type ToolTextResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

/**
 * ツール層が runCli() 経由で拾える override フィールド。args は含めない
 * (spread order `{ ..., args }` と併せて、tool 側が組み立てた args を必ず勝たせる)。
 * timeoutMs は test 経路で短い値へ差し替えるため。他フィールドと同様に
 * MCP tool call 経路 (index.ts) では触られない。
 */
export type ToolCliOverrides = Partial<
  Pick<
    CliRunOptions,
    'cliBinPath' | 'spawn' | 'env' | 'nodePath' | 'timeoutMs'
  >
>

const AUTH_HINT =
  'Hint: run `npx @briefroom/cli login` or set the BRIEFROOM_TOKEN environment variable in your .mcp.json.'

/**
 * CLI が非ゼロ終了したときの MCP error result。stderr が空なら stdout を fallback、
 * "Not signed in" / "Authentication failed" 系メッセージには auth hint を差し込む。
 */
export function cliErrorResult(result: CliRunResult): ToolTextResult {
  const rawMessage = result.stderr.trim() || result.stdout.trim() || `CLI exited with code ${result.code}`
  const needsAuthHint = /not signed in|authentication failed/i.test(rawMessage)
  const body = needsAuthHint ? `${rawMessage}\n\n${AUTH_HINT}` : rawMessage
  return {
    content: [{ type: 'text', text: body }],
    isError: true,
  }
}

/**
 * runCli() 側の rejection (timeout / spawn 失敗) を tool error result に正規化する。
 * ここで拾わないと MCP client には JSON-RPC internal error として届き、
 * 「明確な timeout エラー」の仕様を満たさない。
 *
 * Node の err.code (`ENOENT` / `EACCES` / ...) はエージェントが retry 判定するのに
 * 有用なので、あれば message の末尾に付ける。
 */
export function cliExceptionResult(err: unknown): ToolTextResult {
  if (err instanceof CliTimeoutError) {
    return {
      content: [
        {
          type: 'text',
          text: `briefroom CLI timed out after ${err.timeoutMs}ms. Retry, or check network connectivity to the briefroom API.`,
        },
      ],
      isError: true,
    }
  }
  const msg = err instanceof Error ? err.message : String(err)
  const codeVal =
    err instanceof Error ? (err as unknown as { code?: unknown }).code : undefined
  const code = typeof codeVal === 'string' ? ` (${codeVal})` : ''
  return {
    content: [
      {
        type: 'text',
        text: `Failed to launch briefroom CLI: ${msg}${code}`,
      },
    ],
    isError: true,
  }
}

export function successText(text: string): ToolTextResult {
  return {
    content: [{ type: 'text', text }],
  }
}

/**
 * 3 ツールで共通の実行パス: runCli() → 非ゼロ exit / 例外 / 正常 の 3 分岐を
 * すべて ToolTextResult に落とす。呼び出し側は timeout / spawn 失敗を意識せず、
 * 成功時の stdout 整形だけを渡せば良い。
 */
export async function runCliAsToolResult(
  runOpts: CliRunOptions,
  formatSuccess: (stdout: string) => string,
): Promise<ToolTextResult> {
  try {
    const result = await runCli(runOpts)
    if (result.code !== 0) return cliErrorResult(result)
    return successText(formatSuccess(result.stdout))
  } catch (err) {
    return cliExceptionResult(err)
  }
}
