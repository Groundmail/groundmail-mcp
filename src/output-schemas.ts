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

function heldBackItem(): Schema {
  return object(
    {
      email: string('The held-back address'),
      reason: string(
        'Why: invalid_address (cannot exist), no_mail_server (domain takes no email), previously_bounced (hard-bounced for a Groundmail sender in the last 90 days) or mailbox_not_found',
      ),
    },
    ['email', 'reason'],
  )
}

const nullableBoolean = (description: string): Schema => ({ type: ['boolean', 'null'], description })

/** The receiving server's side of the latest delivery attempt (`delivery` on an email). */
export const emailDelivery: Schema = {
  ...object(
    {
      receiving_server: nullableString("Hostname of the recipient's mail server, e.g. gmail-smtp-in.l.google.com"),
      response: nullableString(
        'Its exact SMTP reply to the latest attempt that finished: 250 … when it accepted the email, 5xx … when it refused it',
      ),
      tls: nullableBoolean('Whether the connection used TLS; null when the attempt did not say'),
      deferred_response: nullableString('Its reply to the latest deferral (a 4xx such as greylisting; delivery is retried); null when none'),
      deferred_at: nullableString('When the latest deferral happened (ISO 8601)'),
    },
    ['receiving_server', 'response', 'tls', 'deferred_response', 'deferred_at'],
  ),
  type: ['object', 'null'],
  description:
    "What the recipient's mail server said about the latest delivery attempt. Null until an attempt reports one, and for test emails. delivered_at minus created_at is how long it took to land",
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
    bounce_type: {
      type: ['string', 'null'],
      enum: ['hard', 'block', null],
      description:
        'Why it bounced: hard (address cannot receive; suppressed) or block (the receiving server refused the sender for reputation or policy; address not suppressed, safe to retry later). Null if it did not bounce',
    },
    delivery: emailDelivery,
    held_back: arrayOf(
      heldBackItem(),
      'Recipients Groundmail validation held back before sending, with why; empty when none were',
    ),
    test: boolean(
      'True when the email never reached the mail server: sent with a test key (gm_test_…) or only to simulator addresses. Its status and events are simulated',
    ),
    tags: { description: 'Tags attached to the email' },
    scheduled_at: nullableString('When the email is scheduled to send (ISO 8601)'),
    cancelled_at: nullableString('When the scheduled email was cancelled (ISO 8601)'),
    created_at: string('When the email was created (ISO 8601)'),
    sent_at: nullableString('When the email was handed off for delivery (ISO 8601)'),
    delivered_at: nullableString('When the email was delivered (ISO 8601)'),
    bounced_at: nullableString('When the email bounced (ISO 8601)'),
    opened_at: nullableString('First open (ISO 8601); needs open tracking on the sending domain'),
    clicked_at: nullableString('First tracked-link click (ISO 8601); needs click tracking on the sending domain'),
    tenant: nullableString('External id of the tenant the email was sent as. Present only when it was sent as a tenant'),
    stream: string('Mail stream it went out on: transactional, product or newsletter (each sends from its own IPs)'),
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
    tenant: nullableString('External id of the tenant that owns the domain. Absent for a domain the whole account can use'),
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
    already_set: boolean(
      'True when the domain already publishes a record that does this job (its own DMARC record). The value is what is there now: nothing to add or change, never publish a second one',
    ),
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
    tenants: stringArray('Present only when the endpoint receives email events for some tenants only: their external ids'),
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
    tenant: string('External id of the tenant, on an entry of a tenant\'s own suppression list'),
    created_at: string('When the suppression was created (ISO 8601)'),
    updated_at: string('When the suppression was last changed (ISO 8601)'),
  },
  ['id', 'email'],
)

export const categoryOptOutItem: Schema = object(
  {
    id: string('Category opt-out id'),
    type: string('Always category_opt_out'),
    email: string('Address that opted out'),
    category: string('Category the address opted out of: product or newsletter'),
    tenant: nullableString("External id of the tenant whose email the reader left; null when account-wide"),
    created_at: string('When the reader opted out (ISO 8601)'),
    updated_at: string('When the opt-out was last changed (ISO 8601)'),
  },
  ['id', 'email', 'category'],
)

/** Result of removing category opt-outs. */
export const removeCategoryOptOutOutput: ObjectSchema = object(
  {
    ok: boolean('True when the request completed'),
    deleted: number('How many opt-outs were removed'),
  },
  ['ok'],
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
    category: string('transactional or product'),
    folder: nullableString('Folder the template is filed in, or null'),
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
    held_back: arrayOf(
      heldBackItem(),
      'Present when Groundmail validation held some recipients back; the email went to the rest',
    ),
    test: boolean('Present and true on a test send (test key or simulator addresses): nothing was delivered'),
  },
  ['id', 'status'],
)

export const validateEmailOutput: ObjectSchema = object(
  {
    email: string('The address as checked (trimmed, lowercased)'),
    domain: nullableString('Domain part of the address; null when there is none'),
    verdict: {
      type: 'string',
      enum: ['valid', 'risky', 'invalid'],
      description: 'valid: safe to send; risky: deliverable but worth a second look; invalid: cannot receive email',
    },
    reasons: stringArray(
      'What was found: syntax, no_mail_server, mailbox_not_found, previously_bounced (invalid); disposable, catch_all, possible_typo (risky); role (informational)',
    ),
    suggestion: nullableString('The address with a likely-mistyped domain corrected, for example ada@gmail.com for ada@gmial.com'),
    disposable: boolean('A throwaway-inbox service'),
    role: boolean('A team or queue mailbox such as info@ or support@'),
  },
  ['email', 'verdict', 'reasons', 'suggestion', 'disposable', 'role'],
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
        spf: boolean('SPF in place. Always true for a main domain (example.com), which needs no SPF change'),
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

const anyObject = (description: string): Schema => ({ type: 'object', description })

/** `get_dmarc_report` and `enable_dmarc_monitoring`: DMARC monitoring for one domain. */
export const dmarcOutput: ObjectSchema = object(
  {
    dmarc: described(
      object(
        {
          domain: string('Monitored domain'),
          enabled: boolean('True when monitoring is on'),
          status: string('waiting (no report yet), receiving, or disabled'),
          report_address: string('Where receivers send the domain\'s aggregate reports'),
          rua: string('The rua= value to add to the DMARC record (mailto:<report_address>)'),
          dns: anyObject('The DMARC record now (host, record, policy), whether it lists the report address (rua_present), and suggested_record: the record to publish'),
          digest_enabled: boolean('True when the weekly digest email is on'),
          last_report_at: nullableString('End of the newest report received (ISO 8601)'),
          window_days: number('Days of reports the summary covers'),
          summary: anyObject('Totals: messages, dmarc_pass, dmarc_fail, pass_rate (0-1), reports, reporters'),
          sources: arrayOf(
            anyObject('A sending source: name, provider, status (passing, failing, or unknown = possible spoofing), messages, pass_rate, spf_aligned_rate, dkim_aligned_rate, ips'),
            'Who sends mail as the domain, grouped by provider, busiest first',
          ),
          daily: arrayOf(anyObject('date, messages, dmarc_pass, pass_rate'), 'Pass rate by day'),
          readiness: anyObject('Whether it is safe to enforce DMARC: verdict (no_data, collecting, fix_sources, ready_quarantine, ready_reject, enforced), label, detail, blocking_sources'),
        },
        ['domain', 'enabled'],
      ),
      'DMARC monitoring for the domain',
    ),
    applied: { type: ['object', 'null'], description: 'When apply was used: the DNS provider and what changed' },
    apply_error: string('Why the DNS provider could not update the record (add it by hand instead)'),
  },
  ['dmarc'],
)

/** `import_from_provider` and `get_import_report`: the combined report of every request of one import. */
export const migrationOutput: ObjectSchema = object(
  {
    migration: described(
      object(
        {
          id: string('Import id'),
          provider: string('sendgrid, postmark or mailgun'),
          dry_run: boolean('True for a preview: nothing was written'),
          status: string('completed, partial (some items failed, each listed), failed, or in_progress'),
          started_at: string('When the import started (ISO 8601)'),
          resources: stringArray('What was imported: domains, webhooks, templates, suppressions'),
          has_more: boolean('True if the import stopped early; call the tool again with `cursor` to continue'),
          next_cursor: nullableString('Pass as `cursor` to continue an import that stopped early'),
          retry_after_seconds: { type: ['number', 'null'], description: 'Wait this long before continuing' },
          domains: anyObject(
            'Totals and one item per domain, with the DNS records and `dns_plan`: each record compared with what the domain publishes today (add, update an existing SPF record, keep the existing DMARC record, or already published), and which old-provider records to keep until the cutover',
          ),
          webhooks: anyObject('Totals and one item per webhook (created disabled), with mapped events and the signing secret'),
          templates: anyObject('Totals and one item per template, with its alias and conversion notes'),
          suppressions: anyObject(
            'Totals by type (bounce, complaint, unsubscribe, manual, product_opt_out) and skip reasons (for example bounces caused by a block on the old provider, which are not suppressed)',
          ),
          errors: arrayOf(anyObject('A resource that could not be read'), 'Resources that could not be read at all'),
          notes: stringArray('What was left out on purpose, and why'),
          attention: stringArray('What the user still needs to do'),
          template_map: arrayOf(anyObject('Provider template id and Groundmail alias'), 'Provider template id → Groundmail alias'),
          code_changes: { type: ['array', 'null'], items: anyObject('One stack'), description: 'Send call before and after, for Node.js, Python and cURL' },
          agent_prompt: nullableString('Prompt for a coding agent to make the code change'),
        },
        ['id', 'provider', 'dry_run', 'status', 'has_more'],
      ),
      'The import report',
    ),
  },
  ['migration'],
)

const nullableNumber = (description: string): Schema => ({ type: ['number', 'null'], description })

export const tenantItem: Schema = object(
  {
    id: string('Groundmail tenant id'),
    object: string('Always tenant'),
    external_id: string('Your id for this customer; unique in the account'),
    name: nullableString('Display name'),
    status: { type: 'string', enum: ['active', 'paused'], description: 'active, or paused (new sends are refused)' },
    paused_reason: nullableString('Why the tenant was paused'),
    paused_at: nullableString('When the tenant was paused (ISO 8601)'),
    pause_source: {
      type: ['string', 'null'],
      enum: ['api', 'admin', 'automated', null],
      description:
        'Who paused it: api (you), admin (Groundmail support) or automated (Groundmail\'s bounce and complaint checks). Only a tenant paused over the API can be resumed over the API',
    },
    default_from_domain: nullableString('Completes a bare from (billing → billing@<domain>) on sends that name this tenant'),
    stream_policy: string('all, or transactional_only (product email is refused for this tenant)'),
    daily_limit: nullableNumber('Most recipients per UTC day for this tenant; null for no tenant limit'),
    metadata: { type: ['object', 'null'], description: 'Your own data about the tenant' },
    created_at: string('When the tenant was created (ISO 8601)'),
    updated_at: string('When the tenant was last changed (ISO 8601)'),
  },
  ['id', 'external_id', 'status'],
)

export const tenantOutput: ObjectSchema = object({ tenant: described(tenantItem, 'The tenant') }, ['tenant'])

const streamCounts = (description: string): Schema => ({
  ...object({
    transactional: nullableNumber('Transactional email recipients'),
    product: nullableNumber('Product email recipients'),
  }),
  description,
})

export const tenantStatsOutput: ObjectSchema = object(
  {
    tenant: string('External id of the tenant'),
    stats: described(
      object(
        {
          object: string('Always tenant_stats'),
          days: number('Days covered'),
          from: string('Start of the window (ISO 8601)'),
          total: number('Emails created in the window'),
          queued: number('Emails waiting to be sent'),
          scheduled: number('Emails still scheduled'),
          sent: number('Emails handed off for delivery'),
          delivered: number('Emails delivered'),
          bounced: number('Emails that bounced'),
          complained: number('Emails reported as spam'),
          failed: number('Emails that failed'),
          suppressed: number('Emails not sent because the recipient was suppressed'),
          opened: number('Emails opened'),
          clicked: number('Emails with a tracked click'),
          bounce_rate: number('Bounced / (delivered + bounced + complained), as a fraction'),
          complaint_rate: number('Complained / (delivered + bounced + complained), as a fraction'),
        },
        ['days', 'total'],
      ),
      'Email counts and rates over the window',
    ),
    ramp: described(
      object({
        object: string('Always tenant_ramp'),
        active: boolean('True when a ramp-up daily limit applies to this tenant today'),
        stage: nullableNumber('Ramp-up stage, 1-based; null when the ramp does not apply'),
        daily_limit: { ...streamCounts('Today\'s limit for each stream'), type: ['object', 'null'] },
        used_today: streamCounts('Recipients sent today on each stream'),
        completed: boolean('True when the tenant finished its ramp-up'),
        resets_at: string('The next 00:00 UTC (ISO 8601)'),
      }),
      'The tenant\'s sending ramp today, when known',
    ),
  },
  ['tenant', 'stats'],
)

export const testInboxOutput: ObjectSchema = object(
  {
    test_inbox: described(
      object(
        {
          object: string('Always test_inbox'),
          domain: string('The team\'s test domain. Mail to any address at it is caught and never delivered'),
          address: string('A fresh unique address on the test domain. Use a new one for each test'),
          addon: anyObject('Email testing add-on: active (boolean) and status'),
          usage: anyObject('This month: received, rejected, included (100 free, 5,000 with the add-on), overage, resets_at'),
          retention_days: number('Days caught emails are kept'),
        },
        ['domain', 'address'],
      ),
      'The team\'s test inbox',
    ),
  },
  ['test_inbox'],
)

const testEmailFields: Record<string, Schema> = {
  object: string('Always test_inbox_email'),
  id: string('Test email id (tie_…)'),
  source: string('inbound (received at the test domain, from any provider) or test_key (sent with a gm_test_ key)'),
  email_id: nullableString('With test_key: the sent email id (msg_…)'),
  from: string('Sender'),
  to: stringArray('Recipients'),
  cc: stringArray('Cc addresses'),
  subject: string('Subject line'),
  code: nullableString('The one-time code found in the email (4 to 8 digits), or null'),
  links: stringArray('http(s) links in the email, in order'),
  received_at: string('When it arrived (ISO 8601)'),
  expires_at: string('When it is deleted (ISO 8601)'),
}

export const testEmailItem: Schema = object(testEmailFields, ['id', 'subject'])

export const testEmailOutput: ObjectSchema = object(
  {
    email: described(
      object(
        {
          ...testEmailFields,
          text_body: nullableString('Plain-text body'),
          html_body: nullableString('HTML body'),
          headers: arrayOf(anyObject('A header: name and value'), 'Message headers in order'),
          raw_source: nullableString('Raw message source, when available'),
        },
        ['id', 'subject'],
      ),
      'The test email',
    ),
  },
  ['email'],
)

const inReplyToEmailItem: Schema = {
  ...object(
    {
      id: string('The sent email id (msg_…)'),
      subject: string('Its subject line'),
      from: string('Its sender'),
      to: stringArray('Its recipients'),
      sent_at: string('When it was sent (ISO 8601)'),
      tags: arrayOf(
        object({ name: string('Tag name'), value: string('Tag value') }, ['name', 'value']),
        'Its tags as sent',
      ),
      tenant: nullableString('External id of the tenant it was sent as; null when it was not sent as a tenant'),
    },
    ['id'],
  ),
  type: ['object', 'null'],
  description:
    'The email you sent through Groundmail that this one replies to, as it was when the reply arrived; null when it replies to none of your sent emails',
}

export const receivedEmailItem: Schema = object(
  {
    id: string('Received email id (inb_…)'),
    domain_name: string('The receiving domain'),
    rcpt_to: string('The address it was delivered to'),
    from: string('Sender'),
    to: stringArray('To addresses'),
    cc: stringArray('Cc addresses'),
    subject: string('Subject line'),
    spam_status: nullableString('Content scanning verdict: clean, suspicious or spam; null when not scanned'),
    message_id: nullableString('Its Message-ID header'),
    in_reply_to: nullableString('Its In-Reply-To header'),
    in_reply_to_email: inReplyToEmailItem,
    attachment_count: number('Number of attachments'),
    received_at: string('When it arrived (ISO 8601)'),
  },
  ['id', 'from', 'subject'],
)
