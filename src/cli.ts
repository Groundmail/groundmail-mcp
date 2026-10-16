export type CliOptions =
  | { mode: 'stdio' }
  | { mode: 'http'; port: number; host: string }
  | { mode: 'help' }

const DEFAULT_HTTP_PORT = 3000
const DEFAULT_HTTP_HOST = '127.0.0.1'

export function parseCliArgs(argv: string[]): CliOptions {
  const args = argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    return { mode: 'help' }
  }

  const http = args.includes('--http')
  if (!http) {
    return { mode: 'stdio' }
  }

  let port = DEFAULT_HTTP_PORT
  let host = DEFAULT_HTTP_HOST

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--port' || arg === '-p') {
      const raw = args[i + 1]
      const parsed = Number(raw)
      if (!raw || !Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        throw new Error(`Invalid --port value: ${raw ?? '(missing)'}`)
      }
      port = parsed
      i++
      continue
    }
    if (arg?.startsWith('--port=')) {
      const raw = arg.slice('--port='.length)
      const parsed = Number(raw)
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        throw new Error(`Invalid --port value: ${raw}`)
      }
      port = parsed
      continue
    }
    if (arg === '--host') {
      const raw = args[i + 1]?.trim()
      if (!raw) throw new Error('Missing --host value')
      host = raw
      i++
      continue
    }
    if (arg?.startsWith('--host=')) {
      const raw = arg.slice('--host='.length).trim()
      if (!raw) throw new Error('Missing --host value')
      host = raw
    }
  }

  return { mode: 'http', port, host }
}

export function printHelp(): void {
  console.error(`Usage:
  groundmail-mcp                  # stdio (default)
  groundmail-mcp --http [--port 3000] [--host 127.0.0.1]

Environment:
  GROUNDMAIL_API_KEY   Required for stdio (Bearer gm_… for HTTP)
  GROUNDMAIL_API_URL   Optional API base (default https://api.groundmail.dev)

HTTP auth:
  Authorization: Bearer gm_… (API key) or MCP OAuth access token
`)
}

/** True for dashboard/API keys (`gm_` + 48 hex chars). */
export function isGroundmailApiKey(token: string): boolean {
  return /^gm_[a-f0-9]{48}$/i.test(token.trim())
}

/** Extract Bearer token from an Authorization header value. */
export function parseBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null
  const match = /^Bearer\s+(\S+)/i.exec(authorization.trim())
  return match?.[1] || null
}

/** Extract Bearer gm_ API key from an Authorization header value. */
export function parseBearerApiKey(authorization: string | undefined): string | null {
  const token = parseBearerToken(authorization)
  if (!token || !isGroundmailApiKey(token)) return null
  return token
}
