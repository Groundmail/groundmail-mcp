import type {
  CreateMigrationParams,
  EmailWebhookEventType,
  Groundmail,
  MigrationResource,
  TenantStreamPolicy,
  UpdateTenantParams,
  WebhookEventType,
} from 'groundmail'
import {
  applyDnsOutput,
  categoryOptOutItem,
  removeCategoryOptOutOutput,
  createWebhookOutput,
  deliverabilityOutput,
  dmarcOutput,
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
  tenantItem,
  tenantOutput,
  tenantStatsOutput,
  testEmailItem,
  testEmailOutput,
  testInboxOutput,
  testWebhookOutput,
  validateEmailOutput,
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

/** Tenant settings shared by create_tenant and update_tenant; an error string when one is invalid. */
function tenantSettings(args: Record<string, unknown>): UpdateTenantParams | string {
  const out: UpdateTenantParams = {}
  if (args.name !== undefined) out.name = args.name == null ? null : String(args.name)
  if (args.default_from_domain !== undefined) {
    out.default_from_domain = args.default_from_domain == null ? null : String(args.default_from_domain)
  }
  if (args.stream_policy !== undefined) {
    if (args.stream_policy !== 'all' && args.stream_policy !== 'transactional_only') {
      return 'stream_policy must be all or transactional_only'
    }
    out.stream_policy = args.stream_policy as TenantStreamPolicy
  }
  if (args.daily_limit !== undefined) {
    if (args.daily_limit === null) out.daily_limit = null
    else {
      const n = Number(args.daily_limit)
      if (!Number.isInteger(n) || n < 0) return 'daily_limit must be a whole number, or null for no limit'
      out.daily_limit = n
    }
  }
  if (args.metadata !== undefined) {
    if (args.metadata !== null && (typeof args.metadata !== 'object' || Array.isArray(args.metadata))) {
      return 'metadata must be an object, or null'
    }
    out.metadata = args.metadata as Record<string, unknown> | null
  }
  return out
}

const EMAIL_WEBHOOK_EVENTS = new Set<string>([
  'email.received',
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.held',
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
        const categoryRaw = optString(args, 'category')
        if (categoryRaw && categoryRaw !== 'transactional' && categoryRaw !== 'product' && categoryRaw !== 'newsletter') {
          return textResult('category must be transactional, product or newsletter', true)
        }
        const category = categoryRaw as 'transactional' | 'product' | 'newsletter' | undefined
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
          ...(category ? { category: category as 'product' | 'newsletter' } : {}),
          ...(optString(args, 'tenant') ? { tenant: optString(args, 'tenant') } : {}),
          ...(templateId
            ? { template: { id: templateId, ...(variables ? { variables } : {}) } }
            : {}),
        })
        return textResult(result)
      }
      case 'list_emails': {
        const streamRaw = optString(args, 'stream')
        if (streamRaw && streamRaw !== 'transactional' && streamRaw !== 'product' && streamRaw !== 'newsletter') {
          return textResult('stream must be transactional, product or newsletter', true)
        }
        const stream = streamRaw as 'transactional' | 'product' | 'newsletter' | undefined
        const result = await client.emails.list({
          limit: optNumber(args, 'limit'),
          cursor: optString(args, 'cursor'),
          ...(typeof args.test === 'boolean' ? { test: args.test } : {}),
          ...(optString(args, 'tenant') ? { tenant: optString(args, 'tenant') } : {}),
          ...(stream ? { stream } : {}),
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
        // Only the provider account connected in the dashboard: tool input never carries
        // registrar or DNS tokens, so they don't pass through the chat.
        const result = await client.domains.apply(domain, { provider: providerRaw })
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
          ...(optString(args, 'tenant') ? { tenant: optString(args, 'tenant') } : {}),
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
            ...(optString(args, 'tenant') ? { tenant: optString(args, 'tenant') } : {}),
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
        const tenants = optStringArray(args, 'tenants')
        return textResult(
          await client.webhooks.create({
            url,
            ...(events ? { events } : {}),
            ...(tenants?.length ? { tenants } : {}),
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
            ...(optString(args, 'tenant') ? { tenant: optString(args, 'tenant') } : {}),
          }),
        )
      }
      case 'validate_email': {
        const email = optString(args, 'email')
        if (!email) return textResult('Missing required argument: email', true)
        return textResult(await client.validate(email))
      }
      case 'add_suppression': {
        const email = optString(args, 'email')
        if (!email) return textResult('Missing required argument: email', true)
        return textResult(
          await client.suppressions.create({
            email,
            reason: optString(args, 'reason'),
            ...(optString(args, 'tenant') ? { tenant: optString(args, 'tenant') } : {}),
          }),
        )
      }
      case 'remove_suppression': {
        const idOrEmail = optString(args, 'id') ?? optString(args, 'email')
        if (!idOrEmail) {
          return textResult('Missing required argument: id or email', true)
        }
        const tenant = optString(args, 'tenant')
        return textResult(tenant ? await client.suppressions.remove(idOrEmail, { tenant }) : await client.suppressions.remove(idOrEmail))
      }
      case 'list_category_opt_outs': {
        const category = optString(args, 'category')
        if (category && category !== 'product' && category !== 'newsletter') {
          return textResult('category must be product or newsletter', true)
        }
        return textResult(
          await client.suppressions.listCategoryOptOuts({
            limit: optNumber(args, 'limit'),
            cursor: optString(args, 'cursor'),
            email: optString(args, 'email'),
            ...(category ? { category: category as 'product' | 'newsletter' } : {}),
            ...(optString(args, 'tenant') ? { tenant: optString(args, 'tenant') } : {}),
            ...(args.include_tenants === true ? { includeTenants: true } : {}),
          }),
        )
      }
      case 'remove_category_opt_out': {
        const idOrEmail = optString(args, 'id') ?? optString(args, 'email')
        if (!idOrEmail) {
          return textResult('Missing required argument: id or email', true)
        }
        const category = optString(args, 'category')
        if (category && category !== 'product' && category !== 'newsletter') {
          return textResult('category must be product or newsletter', true)
        }
        const tenant = optString(args, 'tenant')
        return textResult(
          await client.suppressions.removeCategoryOptOut(idOrEmail, {
            ...(category ? { category: category as 'product' | 'newsletter' } : {}),
            ...(tenant ? { tenant } : {}),
          }),
        )
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
            ...(optString(args, 'folder') ? { folder: optString(args, 'folder') } : {}),
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
            ...(optString(args, 'tenant') ? { tenant: optString(args, 'tenant') } : {}),
          }),
        )
      }
      case 'list_tenants': {
        const status = optString(args, 'status')
        return textResult(
          await client.tenants.list({
            limit: optNumber(args, 'limit'),
            cursor: optString(args, 'cursor'),
            ...(status === 'active' || status === 'paused' ? { status } : {}),
          }),
        )
      }
      case 'create_tenant': {
        const externalId = optString(args, 'external_id')
        if (!externalId) return textResult('Missing required argument: external_id', true)
        const settings = tenantSettings(args)
        if (typeof settings === 'string') return textResult(settings, true)
        const { name, ...rest } = settings
        return textResult(
          await client.tenants.create({ external_id: externalId, ...(name ? { name } : {}), ...rest }),
        )
      }
      case 'get_tenant': {
        const tenant = optString(args, 'tenant')
        if (!tenant) return textResult('Missing required argument: tenant', true)
        return textResult(await client.tenants.get(tenant))
      }
      case 'update_tenant': {
        const tenant = optString(args, 'tenant')
        if (!tenant) return textResult('Missing required argument: tenant', true)
        const settings = tenantSettings(args)
        if (typeof settings === 'string') return textResult(settings, true)
        if (!Object.keys(settings).length) {
          return textResult(
            'Nothing to update: pass name, default_from_domain, stream_policy, daily_limit or metadata (use pause_tenant / resume_tenant to pause or resume)',
            true,
          )
        }
        return textResult(await client.tenants.update(tenant, settings))
      }
      case 'pause_tenant': {
        const tenant = optString(args, 'tenant')
        if (!tenant) return textResult('Missing required argument: tenant', true)
        return textResult(await client.tenants.pause(tenant, optString(args, 'reason')))
      }
      case 'resume_tenant': {
        const tenant = optString(args, 'tenant')
        if (!tenant) return textResult('Missing required argument: tenant', true)
        return textResult(await client.tenants.resume(tenant))
      }
      case 'get_tenant_stats': {
        const tenant = optString(args, 'tenant')
        if (!tenant) return textResult('Missing required argument: tenant', true)
        const days = optNumber(args, 'days')
        return textResult(await client.tenants.stats(tenant, days !== undefined ? { days } : {}))
      }
      case 'get_dmarc_report': {
        const domain = optString(args, 'domain')
        if (!domain) return textResult('Missing required argument: domain', true)
        return textResult(await client.dmarc.get(domain))
      }
      case 'enable_dmarc_monitoring': {
        const domain = optString(args, 'domain')
        if (!domain) return textResult('Missing required argument: domain', true)
        const apply = optString(args, 'apply')
        if (apply && apply !== 'cloudflare' && apply !== 'vercel' && apply !== 'godaddy') {
          return textResult('apply must be cloudflare, vercel or godaddy', true)
        }
        return textResult(await client.dmarc.enable(domain, apply ? { apply: apply as 'cloudflare' | 'vercel' | 'godaddy' } : {}))
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
      case 'get_import_report': {
        let id = optString(args, 'id')
        if (!id) {
          const { data } = await client.migrations.list({ limit: 1 })
          if (!data[0]) return textResult('No imports yet. Run import_from_provider first; previews are not stored.', true)
          id = data[0].id
        }
        return textResult(await client.migrations.get(id))
      }
      case 'get_test_inbox_address': {
        // The API returns a fresh unique address on every call.
        return textResult({ test_inbox: await client.testInbox.info() })
      }
      case 'list_test_emails': {
        return textResult(
          await client.testInbox.list({
            limit: optNumber(args, 'limit'),
            cursor: optString(args, 'cursor'),
            to: optString(args, 'to'),
            since: optString(args, 'since'),
          }),
        )
      }
      case 'get_test_email': {
        const id = optString(args, 'id')
        if (!id) return textResult('Missing required argument: id', true)
        return textResult({ email: await client.testInbox.get(id) })
      }
      case 'wait_for_test_email': {
        const to = optString(args, 'to')
        if (!to) return textResult('Missing required argument: to', true)
        const seconds = Math.min(60, Math.max(0, optNumber(args, 'timeout') ?? 30))
        return textResult({
          email: await client.testInbox.waitFor({ to, timeout: seconds * 1000, since: optString(args, 'since') }),
        })
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

/** The tenant a tool acts on or filters by. */
const tenantProp = (description: string) => ({
  type: 'string',
  description: `${description}. The tenant's external id (your id for that customer) or its Groundmail id`,
})

const tenantSettingsProps = {
  name: { type: 'string', description: 'Display name' },
  default_from_domain: {
    type: ['string', 'null'],
    description: 'Domain that completes a bare from (billing → billing@<domain>) on sends naming this tenant; null to clear',
  },
  stream_policy: {
    type: 'string',
    enum: ['all', 'transactional_only'],
    description: 'all (default), or transactional_only to refuse product email for this tenant',
  },
  daily_limit: {
    type: ['number', 'null'],
    description: 'Most recipients per UTC day for this tenant; null for no tenant limit',
  },
  metadata: { type: ['object', 'null'], description: 'Your own data about the tenant (JSON object); null to clear' },
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

/**
 * Tools left out over HTTP (the hosted server and `--http`). import_from_provider needs
 * another provider's API key as input, which over HTTP passes through the chat client;
 * over stdio it stays on the user's machine. Over HTTP, imports run from the dashboard.
 */
export const HTTP_EXCLUDED_TOOLS: ReadonlySet<string> = new Set(['import_from_provider'])

export const HTTP_EXCLUDED_TOOL_MESSAGE =
  'import_from_provider is not available on the hosted Groundmail MCP server, because it needs your other provider\'s API key. Import from the dashboard at https://app.groundmail.dev/import, or run the local server (npx -y groundmail-mcp) where the key stays on your machine.'

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'send_email',
    description:
      'Send a transactional email via Groundmail. Provide subject + html/text, or a published template_id / template_alias with optional variables. To test without delivering anything, send to a simulator address: delivered@, bounce@, block@, complaint@, suppressed@ or delayed@simulator.groundmail.dev (plus addressing like bounce+test1@ works); the result has test: true and webhooks fire as for real mail.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Sender address (must match a verified domain or sandbox sender)' },
        to: {
          type: 'string',
          description: 'Recipient email address. A …@simulator.groundmail.dev address simulates an outcome and never delivers',
        },
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
        category: {
          type: 'string',
          enum: ['transactional', 'product', 'newsletter'],
          description:
            'transactional (default): sign-in codes, receipts, alerts. product: onboarding, lifecycle and notification email, with one-click unsubscribe. newsletter: opt-in newsletters, for approved accounts only (otherwise the send fails with newsletter_not_enabled), sent from separate IPs with one-click unsubscribe',
        },
        tenant: tenantProp(
          'Send as this tenant: the send uses its domains, suppression list, pause switch and daily limit. Omit to send from the account as a whole',
        ),
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
    description: 'List recent emails sent from this account. Test emails (test keys, simulator addresses) have test: true.',
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationProps,
        test: { type: 'boolean', description: 'true: only test emails; false: only live ones. Omit for both' },
        tenant: tenantProp('Only emails sent as this tenant'),
        stream: {
          type: 'string',
          enum: ['transactional', 'product', 'newsletter'],
          description: 'Only emails sent on this mail stream',
        },
      },
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
      properties: { ...paginationProps, tenant: tenantProp('Only domains this tenant owns') },
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
        tenant: tenantProp('Give the domain to this tenant; only that tenant can then send from it'),
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
      'Apply Groundmail DNS records for a domain through Cloudflare, Vercel or GoDaddy, using the provider account connected in the dashboard. If none is connected, ask the user to connect it at https://app.groundmail.dev/integrations (never ask for the provider token in chat), or have them publish the records from create_domain by hand.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Domain name or id of a domain already added to this account (example.com)' },
        provider: {
          type: 'string',
          enum: ['cloudflare', 'godaddy', 'vercel'],
          description: 'DNS provider that hosts the domain',
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
        tenants: {
          type: 'array',
          items: { type: 'string' },
          description: "Optional: only these tenants' email events (external ids or Groundmail ids). Omit for all",
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
        tenant: tenantProp("List this tenant's own suppression list instead of the account's"),
      },
    },
    outputSchema: pagedOutput('data', suppressionItem, 'Suppressed addresses on this page'),
    annotations: readOnly('List suppressions'),
  },
  {
    name: 'validate_email',
    description:
      'Check one email address with Groundmail validation before accepting it (for example at signup): verdict valid | risky | invalid, reasons, a typo suggestion, and disposable / role flags. Free; sends nothing.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email address to check' },
      },
      required: ['email'],
    },
    outputSchema: validateEmailOutput,
    annotations: readOnly('Validate email address'),
  },
  {
    name: 'add_suppression',
    description: 'Add an address to the suppression list.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email address to stop sending to' },
        reason: { type: 'string', description: 'Optional note on why the address is suppressed' },
        tenant: tenantProp("Add to this tenant's own list instead of the account's"),
      },
      required: ['email'],
    },
    outputSchema: suppressionOutput,
    // Adding an address that is already suppressed updates that entry instead of creating a second one.
    annotations: {
      title: 'Add suppression',
      readOnlyHint: false,
      destructiveHint: true,
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
        tenant: tenantProp("Remove the address (by email) from this tenant's own list"),
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
    name: 'list_category_opt_outs',
    description:
      'List category opt-outs: addresses that used a one-click unsubscribe to leave product or newsletter email. Sends in that category to them are refused until the opt-out is removed.',
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationProps,
        email: { type: 'string', description: 'Optional filter by email' },
        category: { type: 'string', enum: ['product', 'newsletter'], description: 'Optional filter by category' },
        tenant: tenantProp("List this tenant's opt-outs instead of the account-wide ones"),
        include_tenants: {
          type: 'boolean',
          description: "Without tenant: also list every tenant's opt-outs (each entry names its tenant)",
        },
      },
    },
    outputSchema: pagedOutput('data', categoryOptOutItem, 'Category opt-outs on this page'),
    annotations: readOnly('List category opt-outs'),
  },
  {
    name: 'remove_category_opt_out',
    description:
      'Remove a category opt-out by id or email address so the address receives that category again. Use only when the reader has asked to re-subscribe.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Category opt-out id' },
        email: { type: 'string', description: 'Email address (alternative to id)' },
        category: {
          type: 'string',
          enum: ['product', 'newsletter'],
          description: 'Only this category; omit to remove every category for the address',
        },
        tenant: tenantProp("Remove from this tenant's opt-outs instead of the account-wide ones"),
      },
    },
    outputSchema: removeCategoryOptOutOutput,
    annotations: {
      title: 'Remove category opt-out',
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
        folder: { type: 'string', description: 'Optional folder to file the template in; created if it does not exist' },
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
      destructiveHint: true,
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
        tenant: tenantProp('Put this tenant on the test event, to test endpoints that only receive some tenants'),
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
    name: 'list_tenants',
    description:
      'List tenants: one per customer you send email for, each with its own domains, suppression list, stats, pause switch and daily limit. Tenants are included on pay as you go and the Dedicated plan.',
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationProps,
        status: { type: 'string', enum: ['active', 'paused'], description: 'Optional filter by status' },
      },
    },
    outputSchema: pagedOutput('data', tenantItem, 'Tenants on this page, newest first'),
    annotations: readOnly('List tenants'),
  },
  {
    name: 'create_tenant',
    description:
      'Create a tenant for one of your customers. Then send with tenant set to its external id, and give it its own domains with create_domain (tenant).',
    inputSchema: {
      type: 'object',
      properties: {
        external_id: {
          type: 'string',
          description: 'Your id for this customer: 1–128 characters of letters, digits and . _ : @ -. Cannot be changed later',
        },
        ...tenantSettingsProps,
      },
      required: ['external_id'],
    },
    outputSchema: tenantOutput,
    annotations: {
      title: 'Create tenant',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'get_tenant',
    description: 'Get one tenant, including whether it is paused and why.',
    inputSchema: {
      type: 'object',
      properties: { tenant: tenantProp('The tenant') },
      required: ['tenant'],
    },
    outputSchema: tenantOutput,
    annotations: readOnly('Get tenant'),
  },
  {
    name: 'update_tenant',
    description: "Change a tenant's name, default from domain, stream policy, daily limit or metadata.",
    inputSchema: {
      type: 'object',
      properties: { tenant: tenantProp('The tenant to change'), ...tenantSettingsProps },
      required: ['tenant'],
    },
    outputSchema: tenantOutput,
    annotations: {
      title: 'Update tenant',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'pause_tenant',
    description:
      "Pause a tenant: its new sends are refused until it is resumed. The rest of the account keeps sending. Confirm with the user first.",
    inputSchema: {
      type: 'object',
      properties: {
        tenant: tenantProp('The tenant to pause'),
        reason: { type: 'string', description: 'Why it is paused (shown on the tenant)' },
      },
      required: ['tenant'],
    },
    outputSchema: tenantOutput,
    annotations: {
      title: 'Pause tenant',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'resume_tenant',
    description:
      'Resume a paused tenant so it can send again. A tenant Groundmail paused (pause_source automated or admin) cannot be resumed this way; the user should fix the cause and contact support.',
    inputSchema: {
      type: 'object',
      properties: { tenant: tenantProp('The tenant to resume') },
      required: ['tenant'],
    },
    outputSchema: tenantOutput,
    annotations: {
      title: 'Resume tenant',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'get_tenant_stats',
    description:
      "A tenant's email counts, bounce and complaint rates over the last days (1–90, default 7), and its sending ramp today.",
    inputSchema: {
      type: 'object',
      properties: {
        tenant: tenantProp('The tenant'),
        days: { type: 'number', description: 'Days to cover, 1–90 (default 7)' },
      },
      required: ['tenant'],
    },
    outputSchema: tenantStatsOutput,
    annotations: readOnly('Get tenant stats'),
  },
  {
    name: 'get_dmarc_report',
    description:
      'DMARC monitoring for a sending domain: who sends mail as it (grouped by provider, with unknown senders flagged as possible spoofing), SPF/DKIM/DMARC pass rates over the last 30 days, and whether it is safe to move the DMARC policy to quarantine. If monitoring is off, shows the current DMARC record; turn it on with enable_dmarc_monitoring.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Domain name or id (example.com)' },
      },
      required: ['domain'],
    },
    outputSchema: dmarcOutput,
    annotations: readOnly('Get DMARC report'),
  },
  {
    name: 'enable_dmarc_monitoring',
    description:
      'Turn on free DMARC monitoring for a sending domain. Returns the report address and the exact DMARC record to publish (the current record with the address added to rua=, keeping the policy and other report addresses). Pass apply to update the record through a DNS provider connected in the dashboard. Reports start arriving within 24 to 48 hours.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Domain name or id (example.com)' },
        apply: {
          type: 'string',
          enum: ['cloudflare', 'vercel', 'godaddy'],
          description: 'Also write the DMARC record through this DNS provider (connected under Integrations)',
        },
      },
      required: ['domain'],
    },
    outputSchema: dmarcOutput,
    annotations: {
      title: 'Enable DMARC monitoring',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
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
  {
    name: 'get_import_report',
    description:
      'Beta. The stored report of an import from SendGrid, Postmark or Mailgun: what was imported, skipped and failed, the DNS changes per domain, what still needs doing, the code change and a prompt for it. Pass the import id, or omit it for the latest import. Previews are not stored.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Import id (the `id` from import_from_provider). Omit for the latest import.' },
      },
    },
    outputSchema: migrationOutput,
    annotations: readOnly('Get an import report'),
  },
  {
    name: 'get_test_inbox_address',
    description:
      "Get a fresh unique address on the team's test domain (<team>.test.groundmail.dev), plus this month's test email usage. Mail sent to it from any email provider (SendGrid, SES, Groundmail or anything else) is caught in the test inbox and never delivered. Use a new address per test, have the app send to it, then call wait_for_test_email.",
    inputSchema: { type: 'object', properties: {} },
    outputSchema: testInboxOutput,
    annotations: readOnly('Get a test inbox address'),
  },
  {
    name: 'list_test_emails',
    description:
      'List emails caught in the test inbox (and emails sent with a gm_test_ key), newest first, with the extracted one-time code and links. Kept 14 days.',
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationProps,
        to: { type: 'string', description: 'Only emails to this exact address' },
        since: { type: 'string', description: 'Only emails received at or after this time (ISO 8601)' },
      },
    },
    outputSchema: pagedOutput('emails', testEmailItem, 'Caught test emails, newest first'),
    annotations: readOnly('List test emails'),
  },
  {
    name: 'get_test_email',
    description: 'Get one caught test email with its text and HTML bodies, headers, source, code and links.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Test email id (tie_…)' } },
      required: ['id'],
    },
    outputSchema: testEmailOutput,
    annotations: readOnly('Get test email'),
  },
  {
    name: 'wait_for_test_email',
    description:
      'Wait for an email to a test inbox address and return it, with the one-time code and links extracted. An email that already arrived is returned at once. Waits up to timeout seconds (default 30, at most 60); on timeout, check that the app sent to the exact address and call again.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'The exact test address the app sent to' },
        timeout: { type: 'number', description: 'Seconds to wait, at most 60 (default 30)' },
        since: { type: 'string', description: 'Only emails received at or after this time (ISO 8601)' },
      },
      required: ['to'],
    },
    outputSchema: testEmailOutput,
    annotations: readOnly('Wait for a test email'),
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
