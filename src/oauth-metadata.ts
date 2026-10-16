export const MCP_HTTP_PATH = '/mcp'

/** RFC 9728 well-known path for OAuth protected resource metadata. */
export const PROTECTED_RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource'

/**
 * Paths that serve the protected resource metadata. RFC 9728 inserts the
 * resource path after the well-known prefix (`…/oauth-protected-resource/mcp`
 * for `https://mcp.groundmail.dev/mcp`); MCP clients also probe the root form.
 */
export const PROTECTED_RESOURCE_METADATA_PATHS = new Set([
  PROTECTED_RESOURCE_METADATA_PATH,
  `${PROTECTED_RESOURCE_METADATA_PATH}${MCP_HTTP_PATH}`,
])

const DOCS_URL = 'https://docs.groundmail.dev/ai/mcp'

/**
 * Scopes a client may ask for when it connects (the authorization server's
 * catalog). With none, the sign-in asks for `full`; the person can narrow it.
 */
export const MCP_SCOPES_SUPPORTED = [
  'full',
  'emails:send',
  'emails:read',
  'domains:read',
  'domains:write',
  'webhooks:write',
  'templates:write',
  'suppressions:write',
  'account:read',
] as const

function trimOrigin(origin: string): string {
  return origin.replace(/\/$/, '')
}

export function buildProtectedResourceMetadata(origin: string) {
  const resource = `${trimOrigin(origin)}${MCP_HTTP_PATH}`
  const appOrigin =
    process.env.GROUNDMAIL_OAUTH_ISSUER?.trim() ||
    process.env.GROUNDMAIL_APP_URL?.trim() ||
    'https://app.groundmail.dev'

  return {
    resource,
    resource_name: 'Groundmail',
    resource_documentation: DOCS_URL,
    authorization_servers: [appOrigin.replace(/\/$/, '')],
    scopes_supported: [...MCP_SCOPES_SUPPORTED],
    bearer_methods_supported: ['header'],
  }
}

/**
 * RFC 6750 / RFC 9728 challenge. Without credentials the client simply has
 * not authenticated yet, so no `error` is set; a rejected token gets
 * `invalid_token`.
 */
export function buildWwwAuthenticateChallenge(
  origin: string,
  options: { invalidToken?: boolean } = {},
): string {
  const metadataUrl = `${trimOrigin(origin)}${PROTECTED_RESOURCE_METADATA_PATH}`
  if (options.invalidToken === false) {
    return `Bearer resource_metadata="${metadataUrl}"`
  }
  return `Bearer error="invalid_token", error_description="OAuth authentication required", resource_metadata="${metadataUrl}"`
}
