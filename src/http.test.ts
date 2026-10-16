import { createServer, type IncomingMessage } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { handleHttpRequest } from './http'

vi.mock('./server.js', () => ({
  createMcpServer: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('./oauth-resolve.js', () => ({
  resolveOAuthAccessToken: vi.fn().mockResolvedValue(null),
}))

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: vi.fn().mockImplementation(() => ({
    handleRequest: vi.fn().mockImplementation(async (_req: IncomingMessage, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}))

const API_KEY = `gm_${'a'.repeat(48)}`

function request(
  method: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      void handleHttpRequest(req, res).catch(reject)
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('no address'))
        return
      }
      const req = import('node:http').then(({ request: httpRequest }) => {
        const r = httpRequest(
          {
            hostname: '127.0.0.1',
            port: address.port,
            path,
            method,
            headers,
          },
          (res) => {
            const chunks: Buffer[] = []
            res.on('data', (c) => chunks.push(c))
            res.on('end', () => {
              server.close()
              resolve({
                status: res.statusCode || 0,
                body: Buffer.concat(chunks).toString('utf8'),
                headers: res.headers,
              })
            })
          },
        )
        r.on('error', (err) => {
          server.close()
          reject(err)
        })
        r.end()
      })
      void req
    })
  })
}

describe('handleHttpRequest', () => {
  it('serves /health without auth', async () => {
    const res = await request('GET', '/health')
    expect(res.status).toBe(200)
    expect(res.body).toContain('"ok":true')
  })

  it('serves oauth protected resource metadata', async () => {
    const res = await request('GET', '/.well-known/oauth-protected-resource')
    expect(res.status).toBe(200)
    expect(res.body).toContain('authorization_servers')
  })

  it('uses x-forwarded-proto for oauth metadata behind TLS ingress', async () => {
    const res = await request('GET', '/.well-known/oauth-protected-resource', {
      host: 'mcp.groundmail.dev',
      'x-forwarded-proto': 'https',
    })
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body) as { resource: string }
    expect(body.resource).toBe('https://mcp.groundmail.dev/mcp')
    expect(String(res.headers['www-authenticate'] || '')).toBe('')
  })

  it('includes https resource_metadata in WWW-Authenticate when proxied', async () => {
    const res = await request('POST', '/mcp', {
      host: 'mcp.groundmail.dev',
      'x-forwarded-proto': 'https',
    })
    expect(res.status).toBe(401)
    expect(String(res.headers['www-authenticate'] || '')).toContain(
      'resource_metadata="https://mcp.groundmail.dev/.well-known/oauth-protected-resource"',
    )
  })

  it('requires auth on /mcp with WWW-Authenticate', async () => {
    const unauthorized = await request('POST', '/mcp')
    expect(unauthorized.status).toBe(401)
    expect(String(unauthorized.headers['www-authenticate'] || '')).toContain('resource_metadata')
  })

  it('serves protected resource metadata at the RFC 9728 path-suffixed URL', async () => {
    const res = await request('GET', '/.well-known/oauth-protected-resource/mcp', {
      host: 'mcp.groundmail.dev',
      'x-forwarded-proto': 'https',
    })
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body) as {
      resource: string
      resource_name: string
      resource_documentation: string
    }
    expect(body.resource).toBe('https://mcp.groundmail.dev/mcp')
    expect(body.resource_name).toBe('Groundmail')
    expect(body.resource_documentation).toBe('https://docs.groundmail.dev/ai/mcp')
    expect(res.headers['access-control-allow-origin']).toBe('*')
  })

  it('omits error= in the challenge when no credentials were sent', async () => {
    const res = await request('POST', '/mcp')
    const challenge = String(res.headers['www-authenticate'] || '')
    expect(challenge).toContain('resource_metadata=')
    expect(challenge).not.toContain('invalid_token')
  })

  it('flags a rejected bearer token as invalid_token with a machine-readable body', async () => {
    const res = await request('POST', '/mcp', { authorization: 'Bearer not-a-real-token' })
    expect(res.status).toBe(401)
    expect(String(res.headers['www-authenticate'] || '')).toContain('error="invalid_token"')
    const body = JSON.parse(res.body) as { code: string; hint: string; docs_url: string }
    expect(body.code).toBe('unauthorized')
    expect(body.hint).toContain('OAuth')
    expect(body.docs_url).toBe('https://docs.groundmail.dev/errors#unauthorized')
  })

  it('exposes WWW-Authenticate to browser clients', async () => {
    const res = await request('POST', '/mcp')
    expect(res.headers['access-control-allow-origin']).toBe('*')
    expect(String(res.headers['access-control-expose-headers'])).toContain('WWW-Authenticate')
  })

  it('allows the MCP protocol version header in CORS preflight', async () => {
    const res = await request('OPTIONS', '/mcp', {
      origin: 'http://localhost:6274',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization, content-type, mcp-protocol-version',
    })
    expect(res.status).toBe(204)
    expect(String(res.headers['access-control-allow-headers'])).toContain('Mcp-Protocol-Version')
  })

  it('accepts Bearer gm_ API keys on /mcp', async () => {
    const ok = await request('POST', '/mcp', {
      authorization: `Bearer ${API_KEY}`,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    })
    expect(ok.status).toBe(200)
  })
})
