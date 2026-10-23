import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { Groundmail } from 'groundmail'
import { callMcpTool, HTTP_EXCLUDED_TOOL_MESSAGE, HTTP_EXCLUDED_TOOLS, MCP_TOOLS, resolveApiKey, textResult } from './tools.js'

/** Keep in step with package.json `version`. */
export const MCP_SERVER_VERSION = '0.15.1'

/** Sent to clients on initialize; agents read it before calling tools. */
export const MCP_SERVER_INSTRUCTIONS = [
  'Groundmail sends transactional email from domains the user has verified.',
  'To test before a domain is verified, call send_email with from "noreply@mail.groundmail.dev" and to set to the Groundmail account email; sandbox sends to any other address are rejected.',
  'Sending to other recipients needs a verified domain (list_domains, create_domain, apply_domain_dns, verify_domain) and a payment method on the account (no charge on the Free plan).',
  'Confirm with the user before sending email to anyone other than themselves.',
  'Errors include a stable code and a link to https://docs.groundmail.dev/errors#<code> that says how to fix them.',
].join(' ')

export type McpServerOptions = {
  /** Serving over HTTP: leaves out HTTP_EXCLUDED_TOOLS. */
  http?: boolean
}

export function createMcpServer(apiKey: string, baseUrl?: string, options: McpServerOptions = {}) {
  const excluded = options.http ? HTTP_EXCLUDED_TOOLS : new Set<string>()
  const client = new Groundmail(apiKey, baseUrl ? { baseUrl } : {})
  const server = new Server(
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
    const result = await callMcpTool(client, request.params.name, request.params.arguments ?? {})
    return result
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
