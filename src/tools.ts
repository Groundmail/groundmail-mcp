import type { CreateMigrationParams, EmailWebhookEventType, Groundmail, MigrationResource, WebhookEventType } from 'groundmail'
import {
  applyDnsOutput,
  createWebhookOutput,
  deliverabilityOutput,
  domainItem,
  domainWithRecordsOutput,
  emailItem,
  getEmailOutput,
  migrationOutput,
  okOutput,
  pagedOutput,
  sendEmailOutput,
  suppressionItem,
  suppressionOutput,
  templateItem,
  templateOutput,
  testWebhookOutput,
  verifyDomainOutput,
  webhookItem,
  type ObjectSchema,
} from './output-schemas.js'

export type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>
  /** The same result as a JSON object, matching the tool's `outputSchema`. */
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

/**
 * Tool result with the JSON as text (older clients) and, for successful object
 * results, as `structuredContent` (clients that read `outputSchema`).
 */
export function textResult(value: unknown, isError = false): McpToolResult {
  const isObject = value !== null && typeof value === 'object' && !Array.isArray(value)
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
    ...(!isError && isObject ? { structuredContent: value as Record<string, unknown> } : {}),
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
      case 'import_from_provider': {
        const provider = optString(args, 'provider')
        if (provider !== 'sendgrid' && provider !== 'postmark' && provider !== 'mailgun') {
          return textResult('Missing or unknown provider: use sendgrid, postmark or mailgun', true)
        }
        const apiKey = optString(args, 'api_key')
        if (!apiKey) return textResult('Missing required argument: api_key (the key of the account to import from)', true)
        const region = optString(args, 'region')
        const resources = optStringArray(args, 'resources')
        const cursor = optString(args, 'cursor')
        const params: CreateMigrationParams = {
          provider,
          api_key: apiKey,
          ...(optString(args, 'account_api_key') ? { account_api_key: optString(args, 'account_api_key') } : {}),
          ...(region === 'us' || region === 'eu' ? { region } : {}),
          ...(resources?.length ? { resources: resources as MigrationResource[] } : {}),
          ...(optBoolean(args, 'dry_run') ? { dry_run: true } : {}),
          ...(cursor ? { cursor } : {}),
        }
        return textResult({ migration: await client.migrations.run(params) })
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

/** MCP tool annotations (https://modelcontextprotocol.io/specification/2025-06-18/schema#toolannotations). */
type ToolAnnotations = {
  title: string
  readOnlyHint: boolean
  destructiveHint: boolean
  idempotentHint: boolean
  openWorldHint: boolean
}

/** Reads Groundmail data only. */
const readOnly = (title: string): ToolAnnotations => ({
  title,
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
})

export type McpToolDefinition = {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  outputSchema: ObjectSchema
  annotations: ToolAnnotations
}

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'send_email',
    description:
      'Send a transactional email via Groundmail. Provide subject + html/text, or a published template_id / template_alias with optional variables.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Sender address (must match a verified domain or sandbox sender)' },
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Subject line. Optional when using a published template' },
        html: { type: 'string', description: 'HTML body. Do not combine with template_id or template_alias' },
        text: { type: 'string', description: 'Plain-text body. Do not combine with template_id or template_alias' },
        reply_to: { type: 'string', description: 'Address that replies should go to' },
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
    outputSchema: sendEmailOutput,
    annotations: {
      title: 'Send email',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'list_emails',
    description: 'List recent emails sent from this account.',
    inputSchema: {
      type: 'object',
      properties: { ...paginationProps },
    },
    outputSchema: pagedOutput('emails', emailItem, 'Emails on this page, newest first'),
    annotations: readOnly('List emails'),
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
    outputSchema: getEmailOutput,
    annotations: readOnly('Get email'),
  },
  {
    name: 'list_domains',
    description: 'List sending domains for this account.',
    inputSchema: {
      type: 'object',
      properties: { ...paginationProps },
    },
    outputSchema: pagedOutput('domains', domainItem, 'Sending domains on this page'),
    annotations: readOnly('List domains'),
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
    outputSchema: domainWithRecordsOutput,
    annotations: {
      title: 'Create domain',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'apply_domain_dns',
    description:
      'Apply Groundmail DNS records for a domain. Cloudflare and GoDaddy can use credentials stored in the dashboard; GoDaddy also accepts one-time credentials on the request.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Domain name or id of a domain already added to this account (example.com)' },
        provider: {
          type: 'string',
          enum: ['cloudflare', 'godaddy', 'vercel'],
          description: 'DNS provider that hosts the domain',
        },
        credentials: {
          type: 'object',
          description: 'Optional inline registrar credentials (GoDaddy api key/secret)',
        },
      },
      required: ['domain', 'provider'],
    },
    outputSchema: applyDnsOutput,
    // Writes to the user's DNS provider and can update records that already exist at the same host.
    // Re-running it leaves matching records unchanged.
    annotations: {
      title: 'Apply domain DNS records',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'verify_domain',
    description: 'Verify DNS for a sending domain after records are applied.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Domain name or id to check (example.com)' },
      },
      required: ['domain'],
    },
    outputSchema: verifyDomainOutput,
    // Looks up public DNS and records the result on the domain.
    annotations: {
      title: 'Verify domain',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'list_webhooks',
    description: 'List webhook endpoints for this account.',
    inputSchema: {
      type: 'object',
      properties: { ...paginationProps },
    },
    outputSchema: pagedOutput('webhooks', webhookItem, 'Webhook endpoints on this page'),
    annotations: readOnly('List webhooks'),
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
    outputSchema: createWebhookOutput,
    annotations: {
      title: 'Create webhook',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
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
    outputSchema: okOutput,
    annotations: {
      title: 'Delete webhook',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
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
    outputSchema: pagedOutput('data', suppressionItem, 'Suppressed addresses on this page'),
    annotations: readOnly('List suppressions'),
  },
  {
    name: 'add_suppression',
    description: 'Add an address to the suppression list.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email address to stop sending to' },
        reason: { type: 'string', description: 'Optional note on why the address is suppressed' },
      },
      required: ['email'],
    },
    outputSchema: suppressionOutput,
    // Adding an address that is already suppressed updates that entry instead of creating a second one.
    annotations: {
      title: 'Add suppression',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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
    outputSchema: okOutput,
    annotations: {
      title: 'Remove suppression',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'list_templates',
    description: 'List email templates.',
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationProps,
        status: { type: 'string', enum: ['draft', 'published'], description: 'Optional filter by template status' },
      },
    },
    outputSchema: pagedOutput('data', templateItem, 'Templates on this page'),
    annotations: readOnly('List templates'),
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
    outputSchema: templateOutput,
    annotations: readOnly('Get template'),
  },
  {
    name: 'create_template',
    description: 'Create a draft email template (html or blocks format).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Template name' },
        subject: { type: 'string', description: 'Subject line, may contain {{variables}}' },
        format: { type: 'string', enum: ['html', 'blocks'], description: 'Template format (html or blocks)' },
        html: { type: 'string', description: 'HTML body' },
        text: { type: 'string', description: 'Plain-text body' },
        alias: { type: 'string', description: 'Optional short alias to reference the template by instead of its id' },
      },
      required: ['name', 'subject'],
    },
    outputSchema: templateOutput,
    annotations: {
      title: 'Create template',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'publish_template',
    description: 'Publish a template, snapshotting an immutable version for sends.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Template id (tpl_…)' },
        alias: { type: 'string', description: 'Template alias (alternative to id)' },
      },
    },
    outputSchema: templateOutput,
    // Each publish snapshots a new version; earlier versions are kept.
    annotations: {
      title: 'Publish template',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
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
    outputSchema: testWebhookOutput,
    annotations: {
      title: 'Send test webhook event',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'get_deliverability',
    description:
      'Fetch best-effort deliverability metrics for recent sends (7d or 30d window).',
    inputSchema: {
      type: 'object',
      properties: {
        window: { type: 'string', enum: ['7d', '30d'], description: 'Time window to summarize (default 30d)' },
      },
    },
    outputSchema: deliverabilityOutput,
    annotations: readOnly('Get deliverability metrics'),
  },
  {
    name: 'import_from_provider',
    description:
      'Beta. Import templates, suppressions (bounces, complaints, unsubscribes), sending domains and webhooks from SendGrid, Postmark or Mailgun into Groundmail. Ask the user for their provider API key; it is used for this import only and never stored, so do not write it to a file. Run with dry_run first to show the user what will be imported. Imported webhooks start disabled; templates that use logic Groundmail does not convert are imported as drafts. The result includes what needs attention, the code change, and a prompt for making it.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['sendgrid', 'postmark', 'mailgun'], description: 'Provider to import from' },
        api_key: {
          type: 'string',
          description: 'SendGrid API key, Postmark server API token, or Mailgun private API key (read access is enough)',
        },
        account_api_key: { type: 'string', description: 'Postmark only: account API token, needed to import sending domains' },
        region: { type: 'string', enum: ['us', 'eu'], description: 'SendGrid and Mailgun: eu for EU-region accounts (default us)' },
        resources: {
          type: 'array',
          items: { type: 'string', enum: ['domains', 'webhooks', 'templates', 'suppressions'] },
          description: 'What to import (default: all four)',
        },
        dry_run: { type: 'boolean', description: 'Preview without writing anything' },
        cursor: { type: 'string', description: 'next_cursor from an import that stopped early, to continue it' },
      },
      required: ['provider', 'api_key'],
    },
    outputSchema: migrationOutput,
    // Re-running skips what already exists, so it is safe to repeat.
    annotations: {
      title: 'Import from another provider',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
]

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
