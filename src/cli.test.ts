import { describe, expect, it } from 'vitest'
import { parseBearerApiKey, parseCliArgs } from './cli'

describe('parseCliArgs', () => {
  it('defaults to stdio', () => {
    expect(parseCliArgs(['node', 'groundmail-mcp'])).toEqual({ mode: 'stdio' })
  })

  it('parses --http with defaults', () => {
    expect(parseCliArgs(['node', 'groundmail-mcp', '--http'])).toEqual({
      mode: 'http',
      port: 3000,
      host: '127.0.0.1',
    })
  })

  it('parses --port and --host', () => {
    expect(
      parseCliArgs(['node', 'groundmail-mcp', '--http', '--port', '3100', '--host', '0.0.0.0']),
    ).toEqual({
      mode: 'http',
      port: 3100,
      host: '0.0.0.0',
    })
  })

  it('parses --port= form', () => {
    expect(parseCliArgs(['node', 'groundmail-mcp', '--http', '--port=4000'])).toEqual({
      mode: 'http',
      port: 4000,
      host: '127.0.0.1',
    })
  })

  it('rejects invalid port', () => {
    expect(() => parseCliArgs(['node', 'groundmail-mcp', '--http', '--port', 'nope'])).toThrow(
      /Invalid --port/,
    )
  })

  it('returns help mode', () => {
    expect(parseCliArgs(['node', 'groundmail-mcp', '--help'])).toEqual({ mode: 'help' })
  })
})

describe('parseBearerApiKey', () => {
  const apiKey = `gm_${'a'.repeat(48)}`

  it('accepts Bearer gm_ API keys', () => {
    expect(parseBearerApiKey(`Bearer ${apiKey}`)).toBe(apiKey)
    expect(parseBearerApiKey(`bearer ${apiKey}`)).toBe(apiKey)
  })

  it('rejects missing, oauth, or non-api tokens', () => {
    expect(parseBearerApiKey(undefined)).toBeNull()
    expect(parseBearerApiKey('Basic gm_test')).toBeNull()
    expect(parseBearerApiKey('Bearer re_test')).toBeNull()
    expect(parseBearerApiKey('Bearer gm_oat_test')).toBeNull()
    expect(parseBearerApiKey('Bearer gm_test')).toBeNull()
  })
})
