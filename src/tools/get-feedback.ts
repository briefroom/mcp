import { z } from 'zod'

import {
  runCliAsToolResult,
  type ToolCliOverrides,
  type ToolTextResult,
} from '../lib/tool-result.js'

export const getFeedbackDescription =
  'Fetch reviewer comments for a briefroom share URL (or raw token) as an AI-agent-optimized Markdown prompt by default, or JSON. Public API — works without auth, but auth returns owner-only fields.'

// deploy-html.ts と同じ flag injection 防御。詳細はそちらのコメント参照。
// share は URL / base32 token のみで `-` 始まりはあり得ないため無条件で reject。
// since は ISO 8601 (`YYYY-MM-DD...`) だが `- ...` の紛れ込みを防ぐため refine で reject。
const SHARE_INJECTION_MSG =
  "share must not start with '-' (would be interpreted as a CLI flag). Pass a URL like 'https://briefroom.net/s/…' or a base32 token."
const SINCE_INJECTION_MSG =
  "since must not start with '-'."

export const getFeedbackInputShape = {
  share: z
    .string()
    .min(1)
    .refine((v) => !v.startsWith('-'), { message: SHARE_INJECTION_MSG })
    .describe(
      'Share URL (https://.../s/<token>) or raw base32 token (17 or 32 chars).',
    ),
  status: z
    .enum(['open', 'resolved', 'all'])
    .optional()
    .describe('Filter comments by status. Defaults to all.'),
  since: z
    .string()
    .refine((v) => !v.startsWith('-'), { message: SINCE_INJECTION_MSG })
    .optional()
    .describe(
      'ISO 8601 timestamp. Return only comments updated after this instant.',
    ),
  format: z
    .enum(['prompt', 'json'])
    .optional()
    .describe(
      'prompt = Markdown for AI agents (default). json = machine-readable.',
    ),
  locale: z
    .enum(['ja', 'en'])
    .optional()
    .describe('Language of the returned Markdown. Defaults to OS locale.'),
}

export type GetFeedbackInput = {
  share: string
  status?: 'open' | 'resolved' | 'all'
  since?: string
  format?: 'prompt' | 'json'
  locale?: 'ja' | 'en'
}

export const FEEDBACK_TIMEOUT_MS = 30_000

export async function runGetFeedback(
  input: GetFeedbackInput,
  cliOpts: ToolCliOverrides = {},
): Promise<ToolTextResult> {
  // value flag は inline `=`、positional share は `--` 以降に置く。
  const args: string[] = ['feedback', 'pull']
  if (input.format) args.push(`--format=${input.format}`)
  if (input.status) args.push(`--status=${input.status}`)
  if (input.since) args.push(`--since=${input.since}`)
  if (input.locale) args.push(`--locale=${input.locale}`)
  args.push('--', input.share)

  return runCliAsToolResult(
    { timeoutMs: FEEDBACK_TIMEOUT_MS, ...cliOpts, args },
    (stdout) => stdout.trimEnd(),
  )
}
