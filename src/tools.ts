import type { EmailWebhookEventType, Groundmail, WebhookEventType } from 'groundmail'

export type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

export function textResult(value: unknown, isError = false): McpToolResult {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
    ...(isError ? { isError: true } : {}),
  }
}

function optString(args: Record<string, unknown>, key: string): string | undefined {
  if (args[key] == null) return undefined
  const value = String(args[key]).trim()
  return value || undefined
}

function optNumber(args: Record<string, unknown>, key: string): number | undefined {
  if (args[key] == null || args[key] === '') return undefined
  const n = Number(args[key])
  return Number.isFinite(n) ? n : undefined
}

function optBoolean(args: Record<string, unknown>, key: string): boolean | undefined {
  if (args[key] == null) return undefined
  if (typeof args[key] === 'boolean') return args[key]
  const raw = String(args[key]).trim().toLowerCase()
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  return undefined
}

function optStringArray(args: Record<string, unknown>, key: string): string[] | undefined {
  const value = args[key]
  if (value == null) return undefined
  if (Array.isArray(value)) return value.map(v => String(v))
  return undefined
}

const EMAIL_WEBHOOK_EVENTS = new Set<string>([
  'email.received',
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.complained',
  'email.opened',
  'email.clicked',
  'email.failed',
  'email.suppressed',
  'email.scheduled',
])

export async function callMcpTool(
  client: Groundmail,
  name: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  try {
    switch (name) {
      case 'send_email': {
        const from = optString(args, 'from')
        const to = optString(args, 'to')
        const subject = optString(args, 'subject')
        const templateId = optString(args, 'template_id') || optString(args, 'template_alias')
        if (!from) return textResult('Missing required argument: from', true)
        if (!to) return textResult('Missing required argument: to', true)
        if (!templateId && !subject) {
          return textResult('Provide subject, or template_id / template_alias', true)
        }
        const variables =
          args.variables && typeof args.variables === 'object' && !Array.isArray(args.variables)
            ? (args.variables as Record<string, string | number | boolean>)
            : undefined
        const result = await client.emails.send({
          from,
          to,
          ...(subject ? { subject } : {}),
          html: optString(args, 'html'),
          text: optString(args, 'text'),
          reply_to: optString(args, 'reply_to'),
          ...(templateId
            ? { template: { id: templateId, ...(variables ? { variables } : {}) } }
            : {}),
        })
        return textResult(result)
      }
      case 'list_emails': {
        const result = await client.emails.list({
          limit: optNumber(args, 'limit'),
          cursor: optString(args, 'cursor'),
        })
        return textResult(result)
      }
      case 'get_email': {
        const id = optString(args, 'id')
        if (!id) return textResult('Missing required argument: id', true)
        return textResult(await client.emails.get(id))
      }
      case 'apply_domain_dns': {
        const domain = String(args.domain ?? '').trim()
        if (!domain) {
          return textResult('Missing required argument: domain', true)
        }
        const providerRaw =
          typeof args.provider === 'string' ? args.provider.trim().toLowerCase() : ''
        if (providerRaw !== 'cloudflare' && providerRaw !== 'godaddy' && providerRaw !== 'vercel') {
          return textResult(
            'Missing or invalid provider. Use provider "cloudflare", "godaddy", or "vercel".',
            true,
          )
        }
        const credentials =
          args.credentials && typeof args.credentials === 'object'
            ? (args.credentials as Record<string, string>)
            : undefined
        const result = await client.domains.apply(domain, {
          provider: providerRaw,
          ...(credentials ? { credentials } : {}),
        })
        return textResult(result)
      }
      case 'verify_domain': {
        const domain = optString(args, 'domain')
        if (!domain) return textResult('Missing required argument: domain', true)
        const result = await client.domains.verify(domain)
        return textResult(result)
      }
      case 'list_domains': {
        const result = await client.domains.list({
          limit: optNumber(args, 'limit'),
          cursor: optString(args, 'cursor'),
        })
        return textResult(result)
      }
      case 'create_domain': {
        const domainName = optString(args, 'name')
        if (!domainName) return textResult('Missing required argument: name', true)
        const inbound = optBoolean(args, 'inbound_enabled')
        return textResult(
          await client.domains.create({
            name: domainName,
            ...(inbound !== undefined ? { inbound_enabled: inbound } : {}),
          }),
        )
      }
      case 'list_webhooks': {
        return textResult(
          await client.webhooks.list({
            limit: optNumber(args, 'limit'),
            cursor: optString(args, 'cursor'),
          }),
        )
      }
      case 'create_webhook': {
        const url = optString(args, 'url')
        if (!url) return textResult('Missing required argument: url', true)
        const events = optStringArray(args, 'events') as WebhookEventType[] | undefined
        return textResult(
          await client.webhooks.create({
            url,
            ...(events ? { events } : {}),
          }),
        )
      }
      case 'delete_webhook': {
        const id = optString(args, 'id')
        if (!id) return textResult('Missing required argument: id', true)
        return textResult(await client.webhooks.delete(id))
      }
      case 'list_suppressions': {
        return textResult(
          await client.suppressions.list({
            limit: optNumber(args, 'limit'),
            cursor: optString(args, 'cursor'),
            email: optString(args, 'email'),
          }),
        )
      }
      case 'add_suppression': {
        const email = optString(args, 'email')
        if (!email) return textResult('Missing required argument: email', true)
        return textResult(
          await client.suppressions.create({
            email,
            reason: optString(args, 'reason'),
          }),
        )
      }
      case 'remove_suppression': {
        const idOrEmail = optString(args, 'id') ?? optString(args, 'email')
        if (!idOrEmail) {
          return textResult('Missing required argument: id or email', true)
        }
        return textResult(await client.suppressions.remove(idOrEmail))
      }
      case 'list_templates': {
        const status = optString(args, 'status')
        return textResult(
          await client.templates.list({
            limit: optNumber(args, 'limit'),
            cursor: optString(args, 'cursor'),
            ...(status === 'draft' || status === 'published' ? { status } : {}),
          }),
        )
      }
      case 'get_template': {
        const idOrAlias = optString(args, 'id') ?? optString(args, 'alias')
        if (!idOrAlias) return textResult('Missing required argument: id or alias', true)
        return textResult(await client.templates.get(idOrAlias))
      }
      case 'create_template': {
        const name = optString(args, 'name')
        const subjectArg = optString(args, 'subject')
        if (!name) return textResult('Missing required argument: name', true)
        if (!subjectArg) return textResult('Missing required argument: subject', true)
        const format = optString(args, 'format')
        return textResult(
          await client.templates.create({
            name,
            subject: subjectArg,
            ...(format === 'blocks' || format === 'html' ? { format } : {}),
            html: optString(args, 'html'),
            text: optString(args, 'text'),
            alias: optString(args, 'alias'),
          }),
        )
      }
      case 'publish_template': {
        const idOrAlias = optString(args, 'id') ?? optString(args, 'alias')
        if (!idOrAlias) return textResult('Missing required argument: id or alias', true)
        return textResult(await client.templates.publish(idOrAlias))
      }
      case 'send_test_webhook_event': {
        const event = optString(args, 'event')
        if (!event || !EMAIL_WEBHOOK_EVENTS.has(event)) {
          return textResult(
            `Missing or invalid event. Use one of: ${[...EMAIL_WEBHOOK_EVENTS].join(', ')}`,
            true,
          )
        }
        return textResult(
          await client.emails.testWebhook({
            event: event as EmailWebhookEventType,
            email_id: optString(args, 'email_id'),
            deliver: optBoolean(args, 'deliver'),
          }),
        )
      }
      case 'get_deliverability': {
        const window = args.window === '7d' ? '7d' : '30d'
        const result = await client.emails.insights(window)
        return textResult(result)
      }
      default:
        return textResult(`Unknown tool: ${name}`, true)
    }
  } catch (error) {
    return textResult(formatToolError(error), true)
  }
}

/**
 * Error text an agent can act on: the API message, then the stable code,
 * HTTP status, the scope it lacked, structured details, the API's hint and
 * the docs link for that code.
 */
export function formatToolError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Request failed'
  const err = error as {
    message?: unknown
    code?: unknown
    status?: unknown
    details?: unknown
    upgradeUrl?: unknown
    hint?: unknown
    docsUrl?: unknown
    requiredScope?: unknown
  }
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)
  const lines = [text(err.message) ?? 'Request failed']
  const code = typeof err.code === 'string' && /^[a-z_]+$/.test(err.code) ? err.code : null
  if (code) {
    const status = typeof err.status === 'number' ? ` (HTTP ${err.status})` : ''
    lines.push(`code: ${code}${status}`)
  }
  const requiredScope = text(err.requiredScope)
  if (requiredScope) lines.push(`required scope: ${requiredScope}`)
  if (err.details !== undefined && err.details !== null) {
    lines.push(`details: ${JSON.stringify(err.details)}`)
  }
  const upgradeUrl = text(err.upgradeUrl)
  if (upgradeUrl) {
    lines.push(
      `upgrade: ${/^https?:\/\//.test(upgradeUrl) ? upgradeUrl : `https://app.groundmail.dev${upgradeUrl.startsWith('/') ? '' : '/'}${upgradeUrl}`}`,
    )
  }
  const hint = text(err.hint)
  if (hint) lines.push(`hint: ${hint}`)
  const docsUrl = text(err.docsUrl) ?? (code ? `https://docs.groundmail.dev/errors#${code}` : null)
  if (docsUrl) lines.push(`how to fix: ${docsUrl}`)
  return lines.join('\n')
}

const paginationProps = {
  limit: { type: 'number', description: 'Page size (1–100)' },
  cursor: { type: 'string', description: 'Opaque cursor for the next page' },
}

export const MCP_TOOLS = [
  {
    name: 'send_email',
    description:
      'Send a transactional email via Groundmail. Provide subject + html/text, or a published template_id / template_alias with optional variables.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Sender address (must match a verified domain or sandbox sender)' },
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Optional when using a published template' },
        html: { type: 'string' },
        text: { type: 'string' },
        reply_to: { type: 'string' },
        template_id: { type: 'string', description: 'Published template UUID' },
        template_alias: { type: 'string', description: 'Published template alias' },
        variables: {
          type: 'object',
          description: 'Template variables when using template_id or template_alias',
          additionalProperties: true,
        },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'list_emails',
    description: 'List recent emails sent from this account.',
    inputSchema: {
      type: 'object',
      properties: { ...paginationProps },
    },
  },
  {
    name: 'get_email',
    description: 'Get a single email by public id (msg_…).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Email id (msg_…)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_domains',
    description: 'List sending domains for this account.',
    inputSchema: {
      type: 'object',
      properties: { ...paginationProps },
    },
  },
  {
    name: 'create_domain',
    description: 'Add a sending domain. DNS must still be applied and verified before production sends.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Domain name (example.com)' },
        inbound_enabled: { type: 'boolean', description: 'Enable inbound receiving on this domain' },
      },
      required: ['name'],
    },
  },
  {
    name: 'apply_domain_dns',
    description:
      'Apply Groundmail DNS records for a domain. Cloudflare and GoDaddy can use credentials stored in the dashboard; GoDaddy also accepts one-time credentials on the request.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string' },
        provider: { type: 'string', enum: ['cloudflare', 'godaddy', 'vercel'] },
        credentials: {
          type: 'object',
          description: 'Optional inline registrar credentials (GoDaddy api key/secret)',
        },
      },
      required: ['domain', 'provider'],
    },
  },
  {
    name: 'verify_domain',
    description: 'Verify DNS for a sending domain after records are applied.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string' },
      },
      required: ['domain'],
    },
  },
  {
    name: 'list_webhooks',
    description: 'List webhook endpoints for this account.',
    inputSchema: {
      type: 'object',
      properties: { ...paginationProps },
    },
  },
  {
    name: 'create_webhook',
    description: 'Create a webhook endpoint. Returns the endpoint plus a signing secret (shown once).',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'HTTPS URL that receives events' },
        events: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional event types (defaults apply when omitted)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'delete_webhook',
    description: 'Delete a webhook endpoint by id.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Webhook id (wh_…)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_suppressions',
    description: 'List suppressed recipient addresses.',
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationProps,
        email: { type: 'string', description: 'Optional filter by email' },
      },
    },
  },
  {
    name: 'add_suppression',
    description: 'Add an address to the suppression list.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['email'],
    },
  },
  {
    name: 'remove_suppression',
    description: 'Remove a suppression by id or email address.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Suppression id' },
        email: { type: 'string', description: 'Email address (alternative to id)' },
      },
    },
  },
  {
    name: 'list_templates',
    description: 'List email templates.',
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationProps,
        status: { type: 'string', enum: ['draft', 'published'] },
      },
    },
  },
  {
    name: 'get_template',
    description: 'Get a template by id or alias.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Template id (tpl_…)' },
        alias: { type: 'string', description: 'Published alias (alternative to id)' },
      },
    },
  },
  {
    name: 'create_template',
    description: 'Create a draft email template (html or blocks format).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        subject: { type: 'string' },
        format: { type: 'string', enum: ['html', 'blocks'] },
        html: { type: 'string' },
        text: { type: 'string' },
        alias: { type: 'string' },
      },
      required: ['name', 'subject'],
    },
  },
  {
    name: 'publish_template',
    description: 'Publish a template, snapshotting an immutable version for sends.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        alias: { type: 'string' },
      },
    },
  },
  {
    name: 'send_test_webhook_event',
    description:
      'Simulate a webhook event (POST /emails/test) for CI or local webhook testing. Optionally deliver to subscribed endpoints.',
    inputSchema: {
      type: 'object',
      properties: {
        event: {
          type: 'string',
          enum: [...EMAIL_WEBHOOK_EVENTS],
          description: 'Webhook event type to simulate',
        },
        email_id: { type: 'string', description: 'Optional existing email id (msg_…)' },
        deliver: {
          type: 'boolean',
          description: 'When true (default), enqueue delivery to account webhooks',
        },
      },
      required: ['event'],
    },
  },
  {
    name: 'get_deliverability',
    description:
      'Fetch best-effort deliverability metrics for recent sends (7d or 30d window).',
    inputSchema: {
      type: 'object',
      properties: {
        window: { type: 'string', enum: ['7d', '30d'] },
      },
    },
  },
] as const

export function resolveApiKey(): string {
  const key = process.env.GROUNDMAIL_API_KEY?.trim()
  if (!key) {
    throw new Error('GROUNDMAIL_API_KEY is required')
  }
  if (!key.startsWith('gm_')) {
    throw new Error('GROUNDMAIL_API_KEY must start with gm_')
  }
  return key
}
