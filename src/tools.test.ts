import { describe, expect, it, vi } from 'vitest'
import { callMcpTool, formatToolError } from './tools'

function mockClient() {
  return {
    emails: {
      send: vi.fn().mockResolvedValue({ id: 'msg_1', status: 'sent' }),
      list: vi.fn().mockResolvedValue({ data: [], has_more: false, next_cursor: null }),
      get: vi.fn().mockResolvedValue({ email: { id: 'msg_1', status: 'sent' } }),
      insights: vi.fn().mockResolvedValue({ window: '7d', totals: { sent: 1 } }),
      testWebhook: vi.fn().mockResolvedValue({ ok: true, payload: {}, delivered: false }),
    },
    domains: {
      list: vi.fn().mockResolvedValue({ data: [], has_more: false, next_cursor: null }),
      create: vi.fn().mockResolvedValue({ domain: { id: 'dom_1', name: 'example.com' } }),
      apply: vi.fn().mockResolvedValue({ ok: true, applied: 4 }),
      verify: vi.fn().mockResolvedValue({ status: 'verified' }),
    },
    webhooks: {
      list: vi.fn().mockResolvedValue({ webhooks: [], has_more: false, next_cursor: null }),
      create: vi.fn().mockResolvedValue({ webhook: { id: 'wh_1' }, secret: 'whsec_x' }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
    },
    suppressions: {
      list: vi.fn().mockResolvedValue({ data: [], has_more: false, next_cursor: null }),
      create: vi.fn().mockResolvedValue({ suppression: { id: 'sup_1', email: 'a@b.com' } }),
      remove: vi.fn().mockResolvedValue({ ok: true }),
    },
    templates: {
      list: vi.fn().mockResolvedValue({ data: [], has_more: false, next_cursor: null }),
      get: vi.fn().mockResolvedValue({ template: { id: 'tpl_1', alias: 'welcome' } }),
    },
  }
}

describe('callMcpTool', () => {
  it('send_email calls the SDK', async () => {
    const client = mockClient()
    const result = await callMcpTool(client as never, 'send_email', {
      from: 'noreply@mail.groundmail.dev',
      to: 'owner@example.com',
      subject: 'Hi',
      html: '<p>Hi</p>',
    })

    expect(client.emails.send).toHaveBeenCalledWith({
      from: 'noreply@mail.groundmail.dev',
      to: 'owner@example.com',
      subject: 'Hi',
      html: '<p>Hi</p>',
      reply_to: undefined,
    })
    expect(result.content[0]?.text).toContain('msg_1')
  })

  it('send_email omits subject when using a template', async () => {
    const client = mockClient()
    await callMcpTool(client as never, 'send_email', {
      from: 'noreply@mail.groundmail.dev',
      to: 'owner@example.com',
      template_alias: 'welcome',
      variables: { name: 'Ada' },
    })

    expect(client.emails.send).toHaveBeenCalledWith({
      from: 'noreply@mail.groundmail.dev',
      to: 'owner@example.com',
      html: undefined,
      text: undefined,
      reply_to: undefined,
      template: { id: 'welcome', variables: { name: 'Ada' } },
    })
    expect(client.emails.send.mock.calls[0]?.[0]).not.toHaveProperty('subject')
  })

  it('send_email requires from, to, and subject', async () => {
    const client = mockClient()
    const missingFrom = await callMcpTool(client as never, 'send_email', {
      to: 'owner@example.com',
      subject: 'Hi',
    })
    expect(missingFrom.isError).toBe(true)
    expect(missingFrom.content[0]?.text).toMatch(/from/i)
    expect(client.emails.send).not.toHaveBeenCalled()

    const missingTo = await callMcpTool(client as never, 'send_email', {
      from: 'noreply@mail.groundmail.dev',
      subject: 'Hi',
    })
    expect(missingTo.isError).toBe(true)
    expect(missingTo.content[0]?.text).toMatch(/to/i)

    const missingSubject = await callMcpTool(client as never, 'send_email', {
      from: 'noreply@mail.groundmail.dev',
      to: 'owner@example.com',
    })
    expect(missingSubject.isError).toBe(true)
    expect(missingSubject.content[0]?.text).toMatch(/subject/i)
  })

  it('list_emails and get_email call the SDK', async () => {
    const client = mockClient()
    await callMcpTool(client as never, 'list_emails', { limit: 10 })
    expect(client.emails.list).toHaveBeenCalledWith({ limit: 10, cursor: undefined })

    await callMcpTool(client as never, 'get_email', { id: 'msg_1' })
    expect(client.emails.get).toHaveBeenCalledWith('msg_1')
  })

  it('verify_domain calls the SDK', async () => {
    const client = mockClient()
    await callMcpTool(client as never, 'verify_domain', { domain: 'example.com' })
    expect(client.domains.verify).toHaveBeenCalledWith('example.com')
  })

  it('list_domains and create_domain call the SDK', async () => {
    const client = mockClient()
    await callMcpTool(client as never, 'list_domains', {})
    expect(client.domains.list).toHaveBeenCalled()

    await callMcpTool(client as never, 'create_domain', {
      name: 'example.com',
      inbound_enabled: true,
    })
    expect(client.domains.create).toHaveBeenCalledWith({
      name: 'example.com',
      inbound_enabled: true,
    })
  })

  it('apply_domain_dns requires provider', async () => {
    const client = mockClient()
    const missing = await callMcpTool(client as never, 'apply_domain_dns', {
      domain: 'example.com',
    })
    expect(missing.isError).toBe(true)
    expect(missing.content[0]?.text).toMatch(/provider/i)
    expect(client.domains.apply).not.toHaveBeenCalled()

    const invalid = await callMcpTool(client as never, 'apply_domain_dns', {
      domain: 'example.com',
      provider: 'route53',
    })
    expect(invalid.isError).toBe(true)
    expect(client.domains.apply).not.toHaveBeenCalled()
  })

  it('apply_domain_dns calls the SDK when provider is set', async () => {
    const client = mockClient()
    const result = await callMcpTool(client as never, 'apply_domain_dns', {
      domain: 'example.com',
      provider: 'cloudflare',
    })

    expect(client.domains.apply).toHaveBeenCalledWith('example.com', { provider: 'cloudflare' })
    expect(result.isError).toBeUndefined()
  })

  it('webhook tools call the SDK', async () => {
    const client = mockClient()
    await callMcpTool(client as never, 'list_webhooks', {})
    expect(client.webhooks.list).toHaveBeenCalled()

    await callMcpTool(client as never, 'create_webhook', {
      url: 'https://example.com/hooks',
      events: ['email.bounced'],
    })
    expect(client.webhooks.create).toHaveBeenCalledWith({
      url: 'https://example.com/hooks',
      events: ['email.bounced'],
    })

    await callMcpTool(client as never, 'delete_webhook', { id: 'wh_1' })
    expect(client.webhooks.delete).toHaveBeenCalledWith('wh_1')
  })

  it('suppression tools call the SDK', async () => {
    const client = mockClient()
    await callMcpTool(client as never, 'list_suppressions', { email: 'a@b.com' })
    expect(client.suppressions.list).toHaveBeenCalledWith({
      limit: undefined,
      cursor: undefined,
      email: 'a@b.com',
    })

    await callMcpTool(client as never, 'add_suppression', {
      email: 'a@b.com',
      reason: 'bounced',
    })
    expect(client.suppressions.create).toHaveBeenCalledWith({
      email: 'a@b.com',
      reason: 'bounced',
    })

    await callMcpTool(client as never, 'remove_suppression', { email: 'a@b.com' })
    expect(client.suppressions.remove).toHaveBeenCalledWith('a@b.com')
  })

  it('template tools call the SDK', async () => {
    const client = mockClient()
    await callMcpTool(client as never, 'list_templates', { status: 'published' })
    expect(client.templates.list).toHaveBeenCalledWith({
      limit: undefined,
      cursor: undefined,
      status: 'published',
    })

    await callMcpTool(client as never, 'get_template', { alias: 'welcome' })
    expect(client.templates.get).toHaveBeenCalledWith('welcome')
  })

  it('send_test_webhook_event calls emails.testWebhook', async () => {
    const client = mockClient()
    await callMcpTool(client as never, 'send_test_webhook_event', {
      event: 'email.bounced',
      email_id: 'msg_1',
      deliver: false,
    })
    expect(client.emails.testWebhook).toHaveBeenCalledWith({
      event: 'email.bounced',
      email_id: 'msg_1',
      deliver: false,
    })
  })

  it('send_test_webhook_event rejects invalid event', async () => {
    const client = mockClient()
    const result = await callMcpTool(client as never, 'send_test_webhook_event', {
      event: 'not.real',
    })
    expect(result.isError).toBe(true)
    expect(client.emails.testWebhook).not.toHaveBeenCalled()
  })

  it('formats API errors with code, status and docs link', () => {
    const text = formatToolError({
      message: 'Sandbox sends are limited to owner@example.com.',
      code: 'forbidden',
      status: 403,
      upgradeUrl: '/settings/billing',
    })
    expect(text).toContain('Sandbox sends are limited')
    expect(text).toContain('code: forbidden (HTTP 403)')
    expect(text).toContain('upgrade: https://app.groundmail.dev/settings/billing')
    expect(text).toContain('how to fix: https://docs.groundmail.dev/errors#forbidden')
    expect(formatToolError(new Error('boom'))).toBe('boom')
  })

  it('formats the hint, docs link and required scope the SDK error carries', () => {
    const text = formatToolError({
      message: 'This credential cannot add domains.',
      code: 'insufficient_scope',
      status: 403,
      hint: 'Reconnect with the domains:write scope.',
      docsUrl: 'https://docs.groundmail.dev/errors#insufficient_scope',
      requiredScope: 'domains:write',
    })
    expect(text).toContain('code: insufficient_scope (HTTP 403)')
    expect(text).toContain('required scope: domains:write')
    expect(text).toContain('hint: Reconnect with the domains:write scope.')
    expect(text).toContain('how to fix: https://docs.groundmail.dev/errors#insufficient_scope')
  })

  it('returns object results as structuredContent beside the text', async () => {
    const client = mockClient()
    const result = await callMcpTool(client as never, 'send_email', {
      from: 'noreply@mail.groundmail.dev',
      to: 'owner@example.com',
      subject: 'Hi',
    })
    expect(result.structuredContent).toEqual({ id: 'msg_1', status: 'sent' })
    expect(JSON.parse(result.content[0]?.text ?? '')).toEqual(result.structuredContent)
  })

  it('does not attach structuredContent to errors', async () => {
    const client = mockClient()
    const result = await callMcpTool(client as never, 'get_email', {})
    expect(result.isError).toBe(true)
    expect(result.structuredContent).toBeUndefined()
  })

  it('tenant tools call the SDK', async () => {
    const tenant = { id: 'ten_1', external_id: 'acme', status: 'active' }
    const tenants = {
      list: vi.fn().mockResolvedValue({ data: [tenant], has_more: false, next_cursor: null }),
      create: vi.fn().mockResolvedValue({ tenant }),
      get: vi.fn().mockResolvedValue({ tenant }),
      update: vi.fn().mockResolvedValue({ tenant }),
      pause: vi.fn().mockResolvedValue({ tenant: { ...tenant, status: 'paused' } }),
      resume: vi.fn().mockResolvedValue({ tenant }),
      stats: vi.fn().mockResolvedValue({ tenant: 'acme', stats: { days: 30 } }),
    }
    const client = { ...mockClient(), tenants }

    await callMcpTool(client as never, 'list_tenants', { status: 'paused', limit: 5 })
    expect(tenants.list).toHaveBeenCalledWith({ limit: 5, cursor: undefined, status: 'paused' })

    await callMcpTool(client as never, 'create_tenant', {
      external_id: 'acme',
      name: 'Acme',
      daily_limit: 500,
      stream_policy: 'transactional_only',
      metadata: { plan: 'pro' },
    })
    expect(tenants.create).toHaveBeenCalledWith({
      external_id: 'acme',
      name: 'Acme',
      daily_limit: 500,
      stream_policy: 'transactional_only',
      metadata: { plan: 'pro' },
    })

    await callMcpTool(client as never, 'get_tenant', { tenant: 'acme' })
    expect(tenants.get).toHaveBeenCalledWith('acme')

    await callMcpTool(client as never, 'update_tenant', { tenant: 'acme', daily_limit: null })
    expect(tenants.update).toHaveBeenCalledWith('acme', { daily_limit: null })

    await callMcpTool(client as never, 'pause_tenant', { tenant: 'acme', reason: 'unpaid' })
    expect(tenants.pause).toHaveBeenCalledWith('acme', 'unpaid')

    await callMcpTool(client as never, 'resume_tenant', { tenant: 'acme' })
    expect(tenants.resume).toHaveBeenCalledWith('acme')

    await callMcpTool(client as never, 'get_tenant_stats', { tenant: 'acme', days: 30 })
    expect(tenants.stats).toHaveBeenCalledWith('acme', { days: 30 })
  })

  it('tenant tools validate arguments before calling the API', async () => {
    const tenants = { create: vi.fn(), update: vi.fn(), get: vi.fn() }
    const client = { ...mockClient(), tenants }
    expect((await callMcpTool(client as never, 'create_tenant', {})).isError).toBe(true)
    expect((await callMcpTool(client as never, 'create_tenant', { external_id: 'a', stream_policy: 'x' })).isError).toBe(true)
    expect((await callMcpTool(client as never, 'update_tenant', { tenant: 'a' })).isError).toBe(true)
    expect((await callMcpTool(client as never, 'update_tenant', { tenant: 'a', daily_limit: -1 })).isError).toBe(true)
    expect((await callMcpTool(client as never, 'get_tenant', {})).isError).toBe(true)
    expect(tenants.create).not.toHaveBeenCalled()
    expect(tenants.update).not.toHaveBeenCalled()
    expect(tenants.get).not.toHaveBeenCalled()
  })

  it('passes tenant to sends, lists, domains, suppressions, webhooks and test events', async () => {
    const client = mockClient()
    await callMcpTool(client as never, 'send_email', {
      from: 'a@acme.com',
      to: 'b@example.com',
      subject: 'Hi',
      text: 'x',
      tenant: 'acme',
    })
    expect(client.emails.send.mock.calls[0]?.[0]).toMatchObject({ tenant: 'acme' })
    await callMcpTool(client as never, 'list_emails', { tenant: 'acme' })
    expect(client.emails.list.mock.calls[0]?.[0]).toMatchObject({ tenant: 'acme' })
    await callMcpTool(client as never, 'list_domains', { tenant: 'acme' })
    expect(client.domains.list.mock.calls[0]?.[0]).toMatchObject({ tenant: 'acme' })
    await callMcpTool(client as never, 'create_domain', { name: 'mail.acme.com', tenant: 'acme' })
    expect(client.domains.create).toHaveBeenCalledWith({ name: 'mail.acme.com', tenant: 'acme' })
    await callMcpTool(client as never, 'list_suppressions', { tenant: 'acme' })
    expect(client.suppressions.list.mock.calls[0]?.[0]).toMatchObject({ tenant: 'acme' })
    await callMcpTool(client as never, 'add_suppression', { email: 'x@y.com', tenant: 'acme' })
    expect(client.suppressions.create.mock.calls[0]?.[0]).toMatchObject({ tenant: 'acme' })
    await callMcpTool(client as never, 'remove_suppression', { email: 'x@y.com', tenant: 'acme' })
    expect(client.suppressions.remove).toHaveBeenCalledWith('x@y.com', { tenant: 'acme' })
    await callMcpTool(client as never, 'create_webhook', { url: 'https://x.test/h', tenants: ['acme'] })
    expect(client.webhooks.create).toHaveBeenCalledWith({ url: 'https://x.test/h', tenants: ['acme'] })
    await callMcpTool(client as never, 'send_test_webhook_event', { event: 'email.delivered', tenant: 'acme' })
    expect(client.emails.testWebhook.mock.calls[0]?.[0]).toMatchObject({ tenant: 'acme' })
  })

  it('send_email leaves tenant out when not given', async () => {
    const client = mockClient()
    await callMcpTool(client as never, 'send_email', { from: 'a@acme.com', to: 'b@example.com', subject: 'Hi', text: 'x' })
    expect(client.emails.send.mock.calls[0]?.[0]).not.toHaveProperty('tenant')
  })

  it('returns error text for unknown tools', async () => {
    const client = mockClient()
    const result = await callMcpTool(client as never, 'nope', {})
    expect(result.isError).toBe(true)
  })
})

describe('resolveApiKey', () => {
  it('requires GROUNDMAIL_API_KEY', async () => {
    const prev = process.env.GROUNDMAIL_API_KEY
    delete process.env.GROUNDMAIL_API_KEY
    const { resolveApiKey } = await import('./tools')
    expect(() => resolveApiKey()).toThrow(/GROUNDMAIL_API_KEY/)
    process.env.GROUNDMAIL_API_KEY = prev
  })
})
