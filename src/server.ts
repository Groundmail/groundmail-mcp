import { AsyncLocalStorage } from 'node:async_hooks'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { Groundmail } from 'groundmail'
import { callMcpTool, HTTP_EXCLUDED_TOOL_MESSAGE, HTTP_EXCLUDED_TOOLS, MCP_TOOLS, resolveApiKey, textResult } from './tools.js'

/** Keep in step with package.json `version`. */
export const MCP_SERVER_VERSION = '0.20.1'

/** Sent to clients on initialize; agents read it before calling tools. */
export const MCP_SERVER_INSTRUCTIONS = [
  'Groundmail sends transactional email from domains the user has verified.',
  'To test before a domain is verified, call send_email with from "noreply@mail.groundmail.dev" and to set to the Groundmail account email; sandbox sends to any other address are rejected.',
  'Sending to other recipients needs a verified domain (list_domains, create_domain, apply_domain_dns, verify_domain) and billing set up by the user in the Groundmail dashboard at https://app.groundmail.dev/settings/billing (no charge on the Free plan).',
  'Confirm with the user before sending email to anyone other than themselves.',
  'Never ask for or accept payment card numbers, passwords, government ID numbers, health information or other sensitive personal data in chat; the user enters billing and account details only in the Groundmail dashboard.',
  'Errors include a stable code and a link to https://docs.groundmail.dev/errors#<code> that says how to fix them.',
].join(' ')

export type McpServerOptions = {
  /** Serving over HTTP: leaves out HTTP_EXCLUDED_TOOLS. */
  http?: boolean
  /** The MCP host calling us (over HTTP, from its User-Agent); stdio reads it from initialize. */
  agent?: string | null
}

/** The tool whose API calls are in flight, for the `X-Groundmail-Mcp-Tool` header. */
const currentTool = new AsyncLocalStorage<string>()

/** A short token for the MCP host's name ("claude-ai", "cursor"…), or null. */
export function agentToken(name: string | null | undefined): string | null {
  const token = name?.trim().split(/[\s/]/)[0]?.replace(/[^\w.-]/g, '').slice(0, 60)
  return token || null
}

/** `groundmail-mcp/<version> (agent <name>)`: lets Groundmail count MCP use by agent. */
export function mcpUserAgent(agent: string | null | undefined): string {
  const token = agentToken(agent)
  return `groundmail-mcp/${MCP_SERVER_VERSION}${token ? ` (agent ${token})` : ''} node/${process.versions.node}`
}

/** fetch for the SDK: our User-Agent, and the tool being called. */
function mcpFetch(getAgent: () => string | null): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers)
    headers.set('User-Agent', mcpUserAgent(getAgent()))
    const tool = currentTool.getStore()
    if (tool) headers.set('X-Groundmail-Mcp-Tool', tool)
    return fetch(input, { ...init, headers })
  }
}

export function createMcpServer(apiKey: string, baseUrl?: string, options: McpServerOptions = {}) {
  const excluded = options.http ? HTTP_EXCLUDED_TOOLS : new Set<string>()
  let server: Server | null = null
  const fetchImpl = mcpFetch(() => options.agent ?? server?.getClientVersion()?.name ?? null)
  const client = new Groundmail(apiKey, baseUrl ? { baseUrl, fetch: fetchImpl } : { fetch: fetchImpl })
  server = new Server(
    { name: 'groundmail-mcp', title: 'Groundmail', version: MCP_SERVER_VERSION },
    { capabilities: { tools: {} }, instructions: MCP_SERVER_INSTRUCTIONS },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: MCP_TOOLS.filter((tool) => !excluded.has(tool.name)).map((tool) => ({
      name: tool.name,
      description: tool.description,
      title: tool.annotations.title,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: tool.annotations,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (excluded.has(request.params.name)) return textResult(HTTP_EXCLUDED_TOOL_MESSAGE, true)
    return currentTool.run(request.params.name, () =>
      callMcpTool(client, request.params.name, request.params.arguments ?? {}),
    )
  })

  return server
}

export async function runStdioServer() {
  const apiKey = resolveApiKey()
  const baseUrl = process.env.GROUNDMAIL_API_URL?.trim()
  const server = createMcpServer(apiKey, baseUrl || undefined)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
