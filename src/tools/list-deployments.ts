import { z } from 'zod'

import {
  runCliAsToolResult,
  type ToolCliOverrides,
  type ToolTextResult,
} from '../lib/tool-result.js'

export const listDeploymentsDescription =
  'List briefroom rooms owned by the current PAT, with their latest deploy and share URL. Requires BRIEFROOM_TOKEN or a prior `briefroom login`.'

export const listDeploymentsInputShape = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Max rooms to list (1-100). Defaults to 20.'),
  archived: z
    .boolean()
    .optional()
    .describe('List archived rooms instead of active ones.'),
}

export type ListDeploymentsInput = {
  limit?: number
  archived?: boolean
}

export const LIST_TIMEOUT_MS = 30_000

export async function runListDeployments(
  input: ListDeploymentsInput,
  cliOpts: ToolCliOverrides = {},
): Promise<ToolTextResult> {
  // list には positional なし。limit は zod で数値強制済だが、他ツールと揃えて
  // inline `=` を使う (万一 schema 前段で bypass されても injection にならない)。
  const args: string[] = ['list', '--json']
  if (input.limit !== undefined) args.push(`--limit=${input.limit}`)
  if (input.archived) args.push('--archived')

  return runCliAsToolResult(
    { timeoutMs: LIST_TIMEOUT_MS, ...cliOpts, args },
    (stdout) => stdout.trim(),
  )
}
