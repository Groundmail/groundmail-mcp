import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMcpServer } from './server'
import { MCP_TOOLS } from './tools'

const API_KEY = `gm_${'a'.repeat(48)}`
const NOW = '2026-01-01T00:00:00.000Z'

const email = {
  id: 'msg_1',
  from: 'noreply@example.com',
  to: ['ada@example.com'],
  cc: [],
  bcc: [],
  reply_to: [],
  subject: 'Hi',
  status: 'delivered',
  last_event: 'email.delivered',
  bounce_reason: null,
  held_back: [],
  tags: [],
  scheduled_at: null,
  cancelled_at: null,
  created_at: NOW,
  sent_at: NOW,
  delivered_at: NOW,
  bounced_at: null,
  opened_at: null,
  clicked_at: null,
}
const domain = {
  id: 'dom_1',
  name: 'example.com',
  status: 'verified',
  created_at: NOW,
  verified_at: NOW,
  open_tracking: false,
  click_tracking: false,
  tracking_status: 'disabled',
  tracking_error: null,
  tls_mode: 'opportunistic',
  inbound_enabled: false,
  inbound_status: 'disabled',
  inbound_error: null,
}
const records = [{ type: 'TXT', host: 'example.com', value: 'v=spf1 ~all', purpose: 'SPF' }]
const webhook = {
  id: 'wh_1',
  url: 'https://example.com/hooks',
  events: ['email.bounced'],
  enabled: true,
  created_at: NOW,
  updated_at: NOW,
}
const suppression = {
  id: 'sup_1',
  email: 'a@example.com',
  reason: null,
  source: 'api',
  created_at: NOW,
  updated_at: NOW,
}
const template = {
  id: 'tpl_1',
  name: 'Welcome',
  alias: 'welcome',
  status: 'published',
  format: 'html',
  subject: 'Hi {{name}}',
  preheader: null,
  html: '<p>Hi</p>',
  text: null,
  design: null,
  variables: ['name'],
  unsubscribe_enabled: false,
  category: 'transactional',
  published_version_id: 'ver_1',
  published_at: NOW,
  created_at: NOW,
  updated_at: NOW,
}
const tenant = {
  id: 'ten_1',
  object: 'tenant',
  external_id: 'acme',
  name: 'Acme',
  status: 'active',
  paused_reason: null,
  paused_at: null,
  pause_source: null,
  default_from_domain: null,
  stream_policy: 'all',
  daily_limit: 500,
  metadata: { plan: 'pro' },
  created_at: NOW,
  updated_at: NOW,
}
const page = { has_more: false, next_cursor: null }
const bucket = {
  total_emails: 1,
  attempted: 1,
  sent: 1,
  delivered: 1,
  bounced: 0,
  complained: 0,
  failed: 0,
  suppressed: 0,
  scheduled: 0,
  opened: 0,
  clicked: 0,
  bounce_rate: 0,
  complaint_rate: 0,
  delivery_rate: 1,
  open_rate: 0,
  click_rate: 0,
}

/** What the API returns for each tool's request, as the routes build it. */
const API_RESPONSES: Record<string, unknown> = {
  get_import_report: undefined,
  import_from_provider: {
    migration: {
      id: 'mig_1',
      provider: 'sendgrid',
      dry_run: true,
      status: 'completed',
      started_at: NOW,
      resources: ['templates', 'suppressions'],
      has_more: false,
      next_cursor: null,
      retry_after_seconds: null,
      templates: { totals: { found: 1, imported: 1 }, items: [] },
      suppressions: { totals: { found: 3 }, skipped_reasons: {}, estimated: true },
      errors: [],
      notes: [],
      attention: [],
      template_map: [{ source_id: 'd-1', alias: 'welcome' }],
      code_changes: [{ stack: 'node', label: 'Node.js', diff: '-a\n+b' }],
      agent_prompt: 'Switch to Groundmail.',
    },
  },
  send_email: { id: 'msg_1', status: 'queued' },
  list_emails: { emails: [email], ...page },
  get_email: { email },
  list_domains: { domains: [domain], ...page },
  create_domain: {
    domain,
    records,
    inbound_records: [],
    inbound_note: 'Add these MX records to receive mail.',
    mail_server_dns_synced: true,
  },
  apply_domain_dns: {
    provider: 'cloudflare',
    domain: 'example.com',
    results: [{ purpose: 'SPF', host: 'example.com', action: 'created' }],
    records,
  },
  verify_domain: {
    domain,
    records,
    verified: true,
    checks: { ownership: true, spf: true, dkim: true, dmarc: true },
    signing_ready: true,
    inbound_configured: false,
    inbound_pending: false,
    inbound_error: null,
  },
  list_webhooks: { webhooks: [webhook], ...page },
  create_webhook: { webhook, secret: 'whsec_x' },
  delete_webhook: { ok: true },
  list_suppressions: { data: [suppression], ...page },
  add_suppression: { suppression },
  remove_suppression: { ok: true },
  list_category_opt_outs: {
    data: [
      {
        id: 'opt_1',
        type: 'category_opt_out',
        email: 'a@example.com',
        category: 'newsletter',
        tenant: 'acme',
        created_at: '2026-10-19T00:00:00.000Z',
        updated_at: '2026-10-19T00:00:00.000Z',
      },
    ],
    ...page,
  },
  remove_category_opt_out: { ok: true, deleted: 1 },
  validate_email: {
    email: 'ada@gmial.com',
    domain: 'gmial.com',
    verdict: 'risky',
    reasons: ['possible_typo'],
    suggestion: 'ada@gmail.com',
    disposable: false,
    role: false,
  },
  list_templates: { data: [template], ...page },
  get_template: { template },
  create_template: { template },
  publish_template: { template },
  send_test_webhook_event: {
    ok: true,
    payload: { type: 'email.bounced' },
    delivered: true,
    deliveries: [{ endpoint_id: 'wh_1', url: 'https://example.com/hooks', success: true, status: 200 }],
  },
  list_tenants: { data: [tenant], ...page },
  create_tenant: { tenant },
  get_tenant: { tenant },
  update_tenant: { tenant },
  pause_tenant: { tenant: { ...tenant, status: 'paused', paused_reason: 'unpaid', paused_at: NOW, pause_source: 'api' } },
  resume_tenant: { tenant },
  get_tenant_stats: {
    tenant: 'acme',
    stats: {
      object: 'tenant_stats',
      days: 7,
      from: NOW,
      total: 10,
      queued: 0,
      scheduled: 0,
      sent: 10,
      delivered: 9,
      bounced: 1,
      complained: 0,
      failed: 0,
      suppressed: 0,
      opened: 2,
      clicked: 1,
      bounce_rate: 0.1,
      complaint_rate: 0,
    },
    ramp: {
      object: 'tenant_ramp',
      active: true,
      stage: 1,
      daily_limit: { transactional: 300, product: 100 },
      used_today: { transactional: 4, product: 0 },
      completed: false,
      resets_at: NOW,
    },
  },
  get_deliverability: {
    window: '30d',
    window_start: NOW,
    generated_at: NOW,
    summary: bucket,
    by_domain: [{ domain: 'example.com', ...bucket }],
    top_bounce_reasons: [{ reason: 'mailbox full', count: 1 }],
    notes: ['Best-effort metrics.'],
  },
}

API_RESPONSES.get_dmarc_report = {
  dmarc: { domain: 'example.com', enabled: false, status: 'disabled', dns: { host: '_dmarc.example.com', record: null, policy: null } },
}
API_RESPONSES.enable_dmarc_monitoring = {
  dmarc: {
    domain: 'example.com',
    enabled: true,
    status: 'waiting',
    report_address: 'abcdefghijkmnpqr@dmarc.groundmail.dev',
    rua: 'mailto:abcdefghijkmnpqr@dmarc.groundmail.dev',
    dns: { host: '_dmarc.example.com', record: null, rua_present: false, policy: null, suggested_record: 'v=DMARC1; p=none; rua=mailto:abcdefghijkmnpqr@dmarc.groundmail.dev' },
    digest_enabled: true,
    last_report_at: null,
    window_days: 30,
    summary: { messages: 0, dmarc_pass: 0, dmarc_fail: 0, pass_rate: 0, reports: 0, reporters: [] },
    sources: [],
    daily: [],
    readiness: { verdict: 'no_data', label: 'Waiting for reports', detail: 'Soon.', days_of_data: 0, blocking_sources: [] },
  },
  applied: null,
}

API_RESPONSES.get_import_report = API_RESPONSES.import_from_provider

const TOOL_ARGS: Record<string, Record<string, unknown>> = {
  send_email: { from: 'noreply@example.com', to: 'ada@example.com', subject: 'Hi', text: 'Hi' },
  get_email: { id: 'msg_1' },
  create_domain: { name: 'example.com' },
  apply_domain_dns: { domain: 'example.com', provider: 'cloudflare' },
  verify_domain: { domain: 'example.com' },
  create_webhook: { url: 'https://example.com/hooks' },
  delete_webhook: { id: 'wh_1' },
  add_suppression: { email: 'a@example.com' },
  remove_suppression: { email: 'a@example.com' },
  remove_category_opt_out: { email: 'a@example.com', category: 'newsletter', tenant: 'acme' },
  validate_email: { email: 'ada@gmial.com' },
  get_template: { alias: 'welcome' },
  create_template: { name: 'Welcome', subject: 'Hi' },
  publish_template: { alias: 'welcome' },
  send_test_webhook_event: { event: 'email.bounced' },
  import_from_provider: { provider: 'sendgrid', api_key: 'SG.test_key_value', dry_run: true },
  get_import_report: { id: 'mig_1' },
  create_tenant: { external_id: 'acme', name: 'Acme', daily_limit: 500 },
  get_tenant: { tenant: 'acme' },
  update_tenant: { tenant: 'acme', daily_limit: 500 },
  pause_tenant: { tenant: 'acme', reason: 'unpaid' },
  resume_tenant: { tenant: 'acme' },
  get_tenant_stats: { tenant: 'acme', days: 7 },
  get_dmarc_report: { domain: 'example.com' },
  enable_dmarc_monitoring: { domain: 'example.com' },
}

/** Which tool a request belongs to, by method and path. */
function toolForRequest(method: string, path: string, body: string | undefined): string {
  const action = body ? (JSON.parse(body) as { action?: string }).action : undefined
  if (path.startsWith('/tenants/')) {
    if (path.includes('/stats')) return 'get_tenant_stats'
    if (method === 'GET') return 'get_tenant'
    const status = body ? (JSON.parse(body) as { status?: string }).status : undefined
    if (status === 'paused') return 'pause_tenant'
    if (status === 'active') return 'resume_tenant'
    return 'update_tenant'
  }
  if (path.startsWith('/tenants')) return method === 'POST' ? 'create_tenant' : 'list_tenants'
  if (path.startsWith('/migrations')) return method === 'POST' ? 'import_from_provider' : 'get_import_report'
  if (path.startsWith('/emails/test')) return 'send_test_webhook_event'
  if (path.startsWith('/emails/')) return 'get_email'
  if (path.startsWith('/emails')) return method === 'POST' ? 'send_email' : 'list_emails'
  if (path.startsWith('/deliverability')) return 'get_deliverability'
  if (path.startsWith('/validate')) return 'validate_email'
  if (path.endsWith('/dmarc')) return method === 'POST' ? 'enable_dmarc_monitoring' : 'get_dmarc_report'
  if (path.startsWith('/domains/')) return action === 'apply' ? 'apply_domain_dns' : 'verify_domain'
  if (path.startsWith('/domains')) return method === 'POST' ? 'create_domain' : 'list_domains'
  if (path.startsWith('/webhooks/')) return 'delete_webhook'
  if (path.startsWith('/webhooks')) return method === 'POST' ? 'create_webhook' : 'list_webhooks'
  if (path.startsWith('/suppressions') && path.includes('type=category_opt_out')) {
    return method === 'DELETE' ? 'remove_category_opt_out' : 'list_category_opt_outs'
  }
  if (path.startsWith('/suppressions')) {
    if (method === 'DELETE') return 'remove_suppression'
    return method === 'POST' ? 'add_suppression' : 'list_suppressions'
  }
  if (path.startsWith('/templates/')) return action === 'publish' ? 'publish_template' : 'get_template'
  if (path.startsWith('/templates')) return method === 'POST' ? 'create_template' : 'list_templates'
  throw new Error(`Unexpected request: ${method} ${path}`)
}

async function connect() {
  const server = createMcpServer(API_KEY)
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return { client, server }
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname + new URL(url).search
      const tool = toolForRequest(init.method ?? 'GET', path, init.body as string | undefined)
      return new Response(JSON.stringify(API_RESPONSES[tool]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function propertiesMissingDescription(schema: unknown, path = ''): string[] {
  if (!schema || typeof schema !== 'object') return []
  const properties = (schema as { properties?: Record<string, unknown> }).properties
  if (!properties) return []
  return Object.entries(properties).flatMap(([key, value]) => {
    const here = path ? `${path}.${key}` : key
    const described = typeof (value as { description?: unknown })?.description === 'string'
    return [...(described ? [] : [here]), ...propertiesMissingDescription(value, here)]
  })
}

describe('tool definitions', () => {
  it('lists the tools the server exposes', async () => {
    const { client } = await connect()
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual(MCP_TOOLS.map((tool) => tool.name).sort())
    expect(tools).toHaveLength(33)
  })

  it('gives every tool a description, a title and complete annotations', async () => {
    const { client } = await connect()
    const { tools } = await client.listTools()
    for (const tool of tools) {
      expect(tool.description?.trim(), `${tool.name} description`).toBeTruthy()
      expect(tool.title?.trim(), `${tool.name} title`).toBeTruthy()
      expect(tool.annotations, `${tool.name} annotations`).toEqual({
        title: tool.title,
        readOnlyHint: expect.any(Boolean),
        destructiveHint: expect.any(Boolean),
        idempotentHint: expect.any(Boolean),
        openWorldHint: expect.any(Boolean),
      })
    }
  })

  it('gives every tool an object outputSchema', async () => {
    const { client } = await connect()
    const { tools } = await client.listTools()
    for (const tool of tools) {
      expect(tool.outputSchema?.type, `${tool.name} outputSchema`).toBe('object')
      expect(Object.keys(tool.outputSchema?.properties ?? {}).length, `${tool.name} outputSchema`).toBeGreaterThan(0)
    }
  })

  it('describes every input property', () => {
    for (const tool of MCP_TOOLS) {
      expect(propertiesMissingDescription(tool.inputSchema), `${tool.name} inputSchema`).toEqual([])
    }
  })

  it('describes every output property', () => {
    for (const tool of MCP_TOOLS) {
      const missing = propertiesMissingDescription(tool.outputSchema).filter((path) => !path.endsWith('.payload'))
      expect(missing, `${tool.name} outputSchema`).toEqual([])
    }
  })

  it('marks read tools read-only and destructive tools destructive', () => {
    const byName = new Map(MCP_TOOLS.map((tool) => [tool.name, tool.annotations]))
    for (const [name, hints] of byName) {
      if (/^(list|get|validate)_/.test(name)) {
        expect(hints, name).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true })
      } else {
        expect(hints.readOnlyHint, name).toBe(false)
      }
    }
    const destructive = [...byName].filter(([, hints]) => hints.destructiveHint).map(([name]) => name)
    expect(destructive.sort()).toEqual(['apply_domain_dns', 'delete_webhook', 'remove_category_opt_out', 'remove_suppression'])
    for (const name of ['send_email', 'send_test_webhook_event']) {
      expect(byName.get(name), name).toMatchObject({
        readOnlyHint: false,
        idempotentHint: false,
        openWorldHint: true,
      })
    }
  })
})

describe('structured results', () => {
  it('returns structuredContent that matches each tool outputSchema', async () => {
    const { client } = await connect()
    // Listing the tools lets the client validate each result against its outputSchema.
    const { tools } = await client.listTools()
    for (const tool of tools) {
      const result = await client.callTool({ name: tool.name, arguments: TOOL_ARGS[tool.name] ?? {} })
      expect(result.isError, `${tool.name}: ${JSON.stringify(result.content)}`).toBeFalsy()
      expect(result.structuredContent, tool.name).toEqual(API_RESPONSES[tool.name])
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? ''
      expect(JSON.parse(text), tool.name).toEqual(API_RESPONSES[tool.name])
    }
  })

  it('leaves structuredContent off error results', async () => {
    const { client } = await connect()
    await client.listTools()
    const result = await client.callTool({ name: 'get_email', arguments: {} })
    expect(result.isError).toBe(true)
    expect(result.structuredContent).toBeUndefined()
  })
})
