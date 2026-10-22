import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpServer } from './server.js'
import { isGroundmailApiKey, parseBearerToken } from './cli.js'
import {
  buildProtectedResourceMetadata,
  buildWwwAuthenticateChallenge,
  PROTECTED_RESOURCE_METADATA_PATHS,
} from './oauth-metadata.js'
import { resolveOAuthAccessToken } from './oauth-resolve.js'

export type HttpServerOptions = {
  port: number
  host?: string
  /** Injected for tests */
  listen?: boolean
}

/**
 * Browser-based MCP clients (for example MCP Inspector) read the 401
 * challenge and session headers cross-origin, so every response carries CORS
 * headers, not only the preflight. Auth is a Bearer header, never cookies.
 */
const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': 'WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version',
}

const CORS_PREFLIGHT_HEADERS: Record<string, string> = {
  ...CORS_HEADERS,
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers':
    'Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID, X-Groundmail-Mcp-Resolve',
  'access-control-max-age': '86400',
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    ...CORS_HEADERS,
    ...headers,
  })
  res.end(payload)
}

const UNAUTHORIZED_HINT =
  'Connect with OAuth: add https://mcp.groundmail.dev/mcp to your MCP client with no headers and sign in when it opens a browser. For scripts, send Authorization: Bearer gm_… with an API key from https://app.groundmail.dev/api-keys.'

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined
  const raw = Array.isArray(value) ? value[0] : value
  const trimmed = raw?.split(',')[0]?.trim()
  return trimmed || undefined
}

function getRequestOrigin(req: IncomingMessage): string {
  const host =
    firstHeaderValue(req.headers['x-forwarded-host']) ||
    firstHeaderValue(req.headers.host) ||
    '127.0.0.1'
  const proto = firstHeaderValue(req.headers['x-forwarded-proto']) || 'http'
  return `${proto}://${host}`
}

async function resolveApiKeyFromAuthorization(
  authorization: string | undefined,
  baseUrl?: string,
): Promise<string | null> {
  const bearer = parseBearerToken(authorization)
  if (!bearer) return null
  if (isGroundmailApiKey(bearer)) return bearer
  return resolveOAuthAccessToken(bearer)
}

export async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: { baseUrl?: string } = {},
): Promise<void> {
  const origin = getRequestOrigin(req)
  const url = new URL(req.url || '/', origin)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_PREFLIGHT_HEADERS)
    res.end()
    return
  }

  if (url.pathname === '/health') {
    sendJson(res, 200, { ok: true, service: 'groundmail-mcp' })
    return
  }

  if (PROTECTED_RESOURCE_METADATA_PATHS.has(url.pathname)) {
    sendJson(res, 200, buildProtectedResourceMetadata(origin), {
      'cache-control': 'public, max-age=300, s-maxage=3600',
    })
    return
  }

  if (url.pathname !== '/mcp' && url.pathname !== '/') {
    sendJson(res, 404, { error: 'Not found. MCP endpoint is POST/GET /mcp' })
    return
  }

  const authorization =
    typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined
  const apiKey = await resolveApiKeyFromAuthorization(authorization, options.baseUrl)
  if (!apiKey) {
    const message = 'Missing or invalid Authorization. Use Bearer gm_… or complete MCP OAuth.'
    sendJson(
      res,
      401,
      {
        error: message,
        code: 'unauthorized',
        message,
        hint: UNAUTHORIZED_HINT,
        docs_url: 'https://docs.groundmail.dev/errors#unauthorized',
      },
      {
        'www-authenticate': buildWwwAuthenticateChallenge(origin, {
          invalidToken: Boolean(parseBearerToken(authorization)),
        }),
      },
    )
    return
  }

  const server = createMcpServer(apiKey, options.baseUrl, { http: true })
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })

  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(name, value)
  }

  try {
    await server.connect(transport)
    await transport.handleRequest(req, res)
  } finally {
    await transport.close().catch(() => undefined)
    await server.close().catch(() => undefined)
  }
}

export async function runHttpServer(options: HttpServerOptions): Promise<void> {
  const host = options.host ?? '127.0.0.1'
  const port = options.port
  const baseUrl = process.env.GROUNDMAIL_API_URL?.trim() || undefined

  const httpServer = createServer((req, res) => {
    void handleHttpRequest(req, res, { baseUrl }).catch((error) => {
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: error instanceof Error ? error.message : 'Internal server error',
        })
      } else {
        res.end()
      }
    })
  })

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(port, host, () => resolve())
  })

  console.error(`Groundmail MCP HTTP listening on http://${host}:${port}/mcp`)
  console.error('Authenticate with Bearer gm_… or MCP OAuth access token')
}
