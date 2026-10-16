function getOAuthResolveUrl(): string {
  const appBase = (
    process.env.GROUNDMAIL_APP_URL?.trim() ||
    process.env.GROUNDMAIL_OAUTH_ISSUER?.trim() ||
    'https://app.groundmail.dev'
  ).replace(/\/$/, '')

  return `${appBase}/api/mcp/oauth/resolve`
}

export async function resolveOAuthAccessToken(accessToken: string): Promise<string | null> {
  const resolveSecret =
    process.env.GROUNDMAIL_MCP_RESOLVE_SECRET?.trim() ||
    process.env.GROUNDMAIL_CREDENTIALS_ENCRYPTION_KEY?.trim() ||
    (process.env.NODE_ENV === 'production' ? '' : 'groundmail-dev-mcp-resolve')

  if (!resolveSecret) return null

  const response = await fetch(getOAuthResolveUrl(), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'x-groundmail-mcp-resolve': resolveSecret,
    },
  })

  if (!response.ok) return null
  const data = (await response.json().catch(() => null)) as { apiKey?: string } | null
  const apiKey = data?.apiKey?.trim()
  return apiKey || null
}
