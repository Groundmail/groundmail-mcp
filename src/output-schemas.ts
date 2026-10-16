/**
 * JSON Schemas for the structured results the tools return. They describe the
 * fields Groundmail's API documents; objects stay open so additive API changes
 * do not make a result invalid.
 */

type Schema = Record<string, unknown>
export type ObjectSchema = {
  type: 'object'
  properties: Record<string, Schema>
  required?: string[]
}

const nullableString = (description: string): Schema => ({ type: ['string', 'null'], description })
const string = (description: string): Schema => ({ type: 'string', description })
const boolean = (description: string): Schema => ({ type: 'boolean', description })
const number = (description: string): Schema => ({ type: 'number', description })
const stringArray = (description: string): Schema => ({
  type: 'array',
  items: { type: 'string' },
  description,
})

export function object(properties: Record<string, Schema>, required: string[] = []): ObjectSchema {
  return { type: 'object', properties, ...(required.length ? { required } : {}) }
}

export function described(schema: Schema, description: string): Schema {
  return { ...schema, description }
}

export function arrayOf(items: Schema, description: string): Schema {
  return { type: 'array', items, description }
}

/** `{ ok: true }` style acknowledgement. */
export const okOutput: ObjectSchema = object(
  { ok: boolean('True when the request completed') },
  ['ok'],
)

const paginationOutput = {
  has_more: boolean('True when another page of results is available'),
  next_cursor: nullableString('Cursor to pass as `cursor` to fetch the next page; null on the last page'),
}

export function pagedOutput(key: string, item: Schema, description: string): ObjectSchema {
  return object(
    {
      [key]: arrayOf(item, description),
      ...paginationOutput,
    },
    [key],
  )
}

export const emailItem: Schema = object(
  {
    id: string('Email id (msg_…)'),
    from: string('Sender address'),
    to: stringArray('Recipient addresses'),
    cc: stringArray('Cc addresses'),
    bcc: stringArray('Bcc addresses'),
    reply_to: stringArray('Reply-To addresses'),
    subject: string('Subject line'),
    status: string('Current delivery status, for example sent, delivered or bounced'),
    last_event: nullableString('Most recent delivery event, if any'),
    bounce_reason: nullableString('Reason reported when the email bounced'),
    tags: { description: 'Tags attached to the email' },
    scheduled_at: nullableString('When the email is scheduled to send (ISO 8601)'),
    cancelled_at: nullableString('When the scheduled email was cancelled (ISO 8601)'),
    created_at: string('When the email was created (ISO 8601)'),
    sent_at: nullableString('When the email was handed off for delivery (ISO 8601)'),
    delivered_at: nullableString('When the email was delivered (ISO 8601)'),
    bounced_at: nullableString('When the email bounced (ISO 8601)'),
    opened_at: nullableString('First open (ISO 8601); needs open tracking on the sending domain'),
    clicked_at: nullableString('First tracked-link click (ISO 8601); needs click tracking on the sending domain'),
  },
  ['id', 'from', 'to', 'subject', 'status'],
)

export const domainItem: Schema = object(
  {
    id: string('Domain id'),
    name: string('Domain name, for example example.com'),
    status: string('Verification status: pending, verified or failed'),
    created_at: string('When the domain was added (ISO 8601)'),
    verified_at: nullableString('When the domain was verified (ISO 8601)'),
    open_tracking: boolean('Whether open tracking is enabled'),
    click_tracking: boolean('Whether click tracking is enabled'),
    tracking_status: string('Whether tracking is applied: disabled, pending, active or error'),
    tracking_error: nullableString('Why tracking is not active yet, when pending or in error'),
    tls_mode: string('TLS mode for outgoing mail: opportunistic or enforced'),
    inbound_enabled: boolean('Whether inbound receiving is enabled'),
    inbound_status: string('Inbound status: disabled, pending, active or error'),
    inbound_error: nullableString('Inbound setup error, if any'),
  },
  ['id', 'name', 'status'],
)

export const dnsRecordItem: Schema = object(
  {
    type: string('DNS record type, for example TXT, CNAME or MX'),
    host: string('Record host name'),
    value: string('Record value'),
    purpose: string('What the record is for, for example SPF or DKIM'),
    priority: number('MX preference, present on MX records'),
  },
  ['type', 'host', 'value'],
)

export const dnsRecords = arrayOf(dnsRecordItem, 'DNS records to publish for the domain')

export const webhookItem: Schema = object(
  {
    id: string('Webhook id (wh_…)'),
    url: string('URL that receives events'),
    events: stringArray('Event types delivered to this endpoint'),
    enabled: boolean('Whether the endpoint receives events'),
    created_at: string('When the endpoint was created (ISO 8601)'),
    updated_at: string('When the endpoint was last changed (ISO 8601)'),
  },
  ['id', 'url', 'events'],
)

export const suppressionItem: Schema = object(
  {
    id: string('Suppression id'),
    email: string('Suppressed email address'),
    reason: nullableString('Why the address was suppressed'),
    source: string('How the suppression was created, for example api or bounce'),
    created_at: string('When the suppression was created (ISO 8601)'),
    updated_at: string('When the suppression was last changed (ISO 8601)'),
  },
  ['id', 'email'],
)

export const templateItem: Schema = object(
  {
    id: string('Template id (tpl_…)'),
    name: string('Template name'),
    alias: nullableString('Alias that can be used in place of the id'),
    status: string('draft or published'),
    format: string('html or blocks'),
    subject: string('Subject line, may contain variables'),
    preheader: nullableString('Preview text shown after the subject in some inboxes'),
    html: nullableString('HTML body'),
    text: nullableString('Plain-text body'),
    variables: {
      type: ['array', 'null'],
      items: { type: 'string' },
      description: 'Variable names the template uses',
    },
    unsubscribe_enabled: boolean('Whether managed unsubscribe is on for sends using this template'),
    category: string('transactional, product or newsletter'),
    published_version_id: nullableString('Id of the version sends currently use'),
    published_at: nullableString('When the template was last published (ISO 8601)'),
    created_at: string('When the template was created (ISO 8601)'),
    updated_at: string('When the template was last changed (ISO 8601)'),
    warnings: arrayOf(
      object({ code: string('Warning code'), message: string('What to fix') }),
      'Content warnings found when the template was saved',
    ),
  },
  ['id', 'name', 'status', 'subject'],
)

const bucketProperties: Record<string, Schema> = {
    total_emails: number('Emails created in the window'),
    attempted: number('Emails with a delivery attempt'),
    sent: number('Emails handed off for delivery'),
    delivered: number('Emails delivered'),
    bounced: number('Emails that bounced'),
    complained: number('Emails reported as spam'),
    failed: number('Emails that failed'),
    suppressed: number('Emails not sent because the recipient was suppressed'),
    scheduled: number('Emails still scheduled'),
    opened: number('Emails opened'),
    clicked: number('Emails with a tracked click'),
    bounce_rate: number('Bounced / attempted, as a fraction'),
    complaint_rate: number('Complained / attempted, as a fraction'),
    delivery_rate: number('Delivered / attempted, as a fraction'),
    open_rate: number('Opened / delivered, as a fraction'),
    click_rate: number('Clicked / delivered, as a fraction'),
}

export const sendEmailOutput: ObjectSchema = object(
  {
    id: string('Email id (msg_…)'),
    status: string('Status after the request, for example queued or scheduled'),
  },
  ['id', 'status'],
)

export const getEmailOutput: ObjectSchema = object({ email: described(emailItem, 'The email') }, ['email'])

export const domainWithRecordsOutput: ObjectSchema = object(
  {
    domain: described(domainItem, 'The domain'),
    records: dnsRecords,
    inbound_records: arrayOf(dnsRecordItem, 'MX records to publish when inbound receiving is enabled'),
    inbound_note: string('Guidance about adding the inbound MX records'),
  },
  ['domain', 'records'],
)

export const verifyDomainOutput: ObjectSchema = object(
  {
    domain: described(domainItem, 'The domain'),
    records: dnsRecords,
    verified: boolean('True when the domain passed verification'),
    checks: described(
      object({
        ownership: boolean('Ownership record found'),
        spf: boolean('SPF record found'),
        dkim: boolean('DKIM record found'),
        dmarc: boolean('DMARC record found'),
      }),
      'Result of each DNS check',
    ),
    signing_ready: boolean('True when outgoing mail can be signed for this domain'),
    inbound_configured: boolean('True when inbound receiving is set up'),
    inbound_pending: boolean('True while inbound setup is still in progress'),
    inbound_error: nullableString('Inbound setup error, if any'),
  },
  ['domain', 'verified'],
)

export const applyDnsOutput: ObjectSchema = object(
  {
    provider: string('DNS provider the records were written to'),
    domain: string('Domain the records belong to'),
    results: arrayOf(
      object(
        {
          purpose: string('What the record is for'),
          host: string('Record host name'),
          action: string('created, updated, unchanged or merged'),
          detail: string('Extra detail about the change'),
        },
        ['purpose', 'host', 'action'],
      ),
      'Outcome for each record',
    ),
    records: dnsRecords,
  },
  ['provider', 'domain', 'results'],
)

export const createWebhookOutput: ObjectSchema = object(
  {
    webhook: described(webhookItem, 'The created webhook endpoint'),
    secret: string('Signing secret for verifying deliveries. Shown only once, so store it'),
  },
  ['webhook', 'secret'],
)

export const suppressionOutput: ObjectSchema = object({ suppression: described(suppressionItem, 'The suppression entry') }, ['suppression'])

export const templateOutput: ObjectSchema = object({ template: described(templateItem, 'The template') }, ['template'])

export const testWebhookOutput: ObjectSchema = object(
  {
    ok: boolean('True when the simulated event was built'),
    payload: { description: 'The event payload that was (or would be) delivered' },
    delivered: boolean('True when delivery to subscribed endpoints was started'),
    deliveries: arrayOf(
      object(
        {
          endpoint_id: string('Webhook endpoint id'),
          url: string('Endpoint URL'),
          success: boolean('Whether the endpoint accepted the event'),
          status: number('HTTP status returned by the endpoint'),
          error: string('Error message when delivery failed'),
        },
        ['endpoint_id', 'url', 'success'],
      ),
      'Per-endpoint results when delivery ran synchronously; empty otherwise',
    ),
  },
  ['ok', 'delivered'],
)

export const deliverabilityOutput: ObjectSchema = object(
  {
    window: string('Window covered: 7d or 30d'),
    window_start: string('Start of the window (ISO 8601)'),
    generated_at: string('When the report was generated (ISO 8601)'),
    summary: { ...object(bucketProperties), description: 'Totals across all domains' },
    by_domain: arrayOf(
      object({ domain: string('Sending domain'), ...bucketProperties }, ['domain']),
      'Metrics for each sending domain',
    ),
    top_bounce_reasons: arrayOf(
      object({ reason: string('Bounce reason'), count: number('Bounces with this reason') }),
      'Most common bounce reasons',
    ),
    notes: stringArray('Caveats about how the metrics were measured'),
  },
  ['window', 'summary'],
)
