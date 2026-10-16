import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('resolveOAuthAccessToken', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('GROUNDMAIL_APP_URL', 'https://app.groundmail.dev')
    vi.stubEnv('GROUNDMAIL_MCP_RESOLVE_SECRET', 'resolve-secret')
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('calls the app-hosted resolve endpoint, not the API host', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ apiKey: 'gm_test_key' }), { status: 200 }),
    )

    const { resolveOAuthAccessToken } = await import('./oauth-resolve.js')
    const apiKey = await resolveOAuthAccessToken('gm_oat_test')

    expect(apiKey).toBe('gm_test_key')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.groundmail.dev/api/mcp/oauth/resolve',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer gm_oat_test',
          'x-groundmail-mcp-resolve': 'resolve-secret',
        }),
      }),
    )
  })

  it('returns null when resolve secret is not configured in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('GROUNDMAIL_MCP_RESOLVE_SECRET', '')
    vi.stubEnv('GROUNDMAIL_CREDENTIALS_ENCRYPTION_KEY', '')

    const { resolveOAuthAccessToken } = await import('./oauth-resolve.js')
    await expect(resolveOAuthAccessToken('gm_oat_test')).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
