#!/usr/bin/env node
import { createRequire } from 'node:module'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import {
  deployHtmlDescription,
  deployHtmlInputShape,
  runDeployHtml,
  type DeployHtmlInput,
} from './tools/deploy-html.js'
import {
  getFeedbackDescription,
  getFeedbackInputShape,
  runGetFeedback,
  type GetFeedbackInput,
} from './tools/get-feedback.js'
import {
  listDeploymentsDescription,
  listDeploymentsInputShape,
  runListDeployments,
  type ListDeploymentsInput,
} from './tools/list-deployments.js'

const pkg = createRequire(import.meta.url)('../package.json') as {
  name: string
  version: string
}

export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: pkg.name,
      version: pkg.version,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  )

  server.registerTool(
    'deploy_html',
    {
      description: deployHtmlDescription,
      inputSchema: deployHtmlInputShape,
    },
    async (args) => runDeployHtml(args as DeployHtmlInput),
  )

  server.registerTool(
    'get_feedback',
    {
      description: getFeedbackDescription,
      inputSchema: getFeedbackInputShape,
    },
    async (args) => runGetFeedback(args as GetFeedbackInput),
  )

  server.registerTool(
    'list_deployments',
    {
      description: listDeploymentsDescription,
      inputSchema: listDeploymentsInputShape,
    },
    async (args) => runListDeployments((args ?? {}) as ListDeploymentsInput),
  )

  return server
}

async function main(): Promise<void> {
  const server = createMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // stdout は JSON-RPC 専用。診断出力は stderr のみ。
  process.stderr.write(
    `[@briefroom/mcp v${pkg.version}] stdio transport ready\n`,
  )
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`[@briefroom/mcp] fatal: ${msg}\n`)
  process.exit(1)
})
