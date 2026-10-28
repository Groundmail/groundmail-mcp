<p align="center">
  <a href="https://groundmail.dev?utm_source=github&utm_medium=readme&utm_campaign=groundmail-mcp">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://app.groundmail.dev/images/github/readme-logo-dark.png">
      <img alt="Groundmail" src="https://app.groundmail.dev/images/github/readme-logo-light.png" height="44">
    </picture>
  </a>
</p>

<h1 align="center">Groundmail MCP server</h1>

<p align="center">
  Send transactional email and manage domains, templates, webhooks and suppressions<br>
  from Claude, Claude Code, ChatGPT, Cursor and any other MCP client.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/groundmail-mcp"><img alt="npm" src="https://img.shields.io/npm/v/groundmail-mcp?color=a3461f&label=npm"></a>
  <a href="https://registry.modelcontextprotocol.io"><img alt="MCP registry" src="https://img.shields.io/badge/MCP%20registry-io.github.Groundmail%2Fgroundmail-241c15"></a>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-b48f62"></a>
</p>

<p align="center">
  <a href="https://docs.groundmail.dev/ai/mcp?utm_source=github&utm_medium=readme&utm_campaign=groundmail-mcp">Docs</a> ·
  <a href="https://app.groundmail.dev/signup?utm_source=github&utm_medium=readme&utm_campaign=groundmail-mcp">Get a free account</a> ·
  <a href="https://groundmail.dev?utm_source=github&utm_medium=readme&utm_campaign=groundmail-mcp">groundmail.dev</a>
</p>

---

## Quick start

The fastest way is the hosted server. Add the URL, sign in through your browser, and you're done. No API key to copy.

```
https://mcp.groundmail.dev/mcp
```

| Client | How to connect |
|--------|----------------|
| **Claude Code** | `claude mcp add --transport http groundmail https://mcp.groundmail.dev/mcp`, then run `/mcp`, pick groundmail and choose Authenticate |
| **Cursor** | Add `{ "mcpServers": { "groundmail": { "url": "https://mcp.groundmail.dev/mcp" } } }` to `.cursor/mcp.json`; Cursor shows "Needs login" |
| **Claude.ai** | Settings → Connectors → Add custom connector → paste the URL |
| **ChatGPT** | Settings → Apps & Connectors → Create (developer mode) → paste the URL, authentication OAuth |

When you connect, you choose the access: **Full**, **Send only** or **Read only**. Revoke it any time in Groundmail under Settings → CLIs & agents.

## What you can ask for

> "Send a password reset email to ada@example.com from noreply@mail.acme.com."
>
> "Did my last 10 emails get delivered? Show any bounces."
>
> "Add mail.acme.com as a sending domain and apply the DNS records on Cloudflare."
>
> "How is my deliverability over the last 7 days?"

Tools cover emails (send, list, look up), domains (add, apply DNS through Cloudflare, Vercel or GoDaddy, verify), templates, webhooks, suppressions, address validation, deliverability, DMARC monitoring, email testing (a test address per run, then wait for the email and read its code and links), imports from other providers and tenants (one per customer you send for: create, update, pause, resume, stats; `tenant` on sends, domains and suppressions). Each tool carries read-only and destructive annotations and an output schema. Full list: [docs.groundmail.dev/ai/mcp](https://docs.groundmail.dev/ai/mcp?utm_source=github&utm_medium=readme&utm_campaign=groundmail-mcp).

## Transports

| Mode | Command / URL | Auth |
|------|---------------|------|
| **HTTP (hosted)** | `https://mcp.groundmail.dev/mcp` | **OAuth** (recommended) or `Authorization: Bearer gm_…` |
| **stdio** | `npx -y groundmail-mcp` | `GROUNDMAIL_API_KEY=gm_…` |
| **HTTP (local)** | `npx -y groundmail-mcp --http --port 3000` | `Authorization: Bearer gm_…` on each request |

Optional: `GROUNDMAIL_API_URL` (for example `http://localhost:3003/api` against a local API).

Local HTTP endpoint: `http://127.0.0.1:3000/mcp` · health: `GET /health`
Hosted health: `GET https://mcp.groundmail.dev/health`

<details>
<summary><strong>Cursor with an API key (stdio)</strong></summary>

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "groundmail": {
      "command": "npx",
      "args": ["-y", "groundmail-mcp"],
      "env": {
        "GROUNDMAIL_API_KEY": "gm_your_key_here"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Cursor with an API key (local or hosted HTTP)</strong></summary>

```bash
npx -y groundmail-mcp --http --port 3000
```

```json
{
  "mcpServers": {
    "groundmail": {
      "url": "http://127.0.0.1:3000/mcp",
      "headers": {
        "Authorization": "Bearer gm_your_key_here"
      }
    }
  }
}
```

For the hosted server with a key instead of OAuth, use `"url": "https://mcp.groundmail.dev/mcp"` with the same header.

</details>

<details>
<summary><strong>Claude Code with an API key</strong></summary>

```bash
# Hosted, API key
claude mcp add --transport http groundmail https://mcp.groundmail.dev/mcp \
  --header "Authorization: Bearer $GROUNDMAIL_API_KEY"

# Local stdio
claude mcp add groundmail --env GROUNDMAIL_API_KEY=gm_your_key_here -- npx -y groundmail-mcp
```

</details>

Want your coding agent to know Groundmail too? Install the [agent skills](https://github.com/Groundmail/groundmail-skills): `npx skills add Groundmail/groundmail-skills -y`.

## Why Groundmail

- **Our own mail servers and IP space.** Your password resets and receipts don't share a pool with bulk marketing senders.
- **Transactional email only.** No newsletters or cold outreach on the platform, which keeps the sending reputation clean.
- **Start free.** Free covers 3,000 emails a month. After that it's pay as you go: $0.70 per 1,000, less as you grow. [Pricing](https://groundmail.dev/pricing/?utm_source=github&utm_medium=readme&utm_campaign=groundmail-mcp)
- **Built for code and for agents.** REST API, SMTP, SDKs for Node, Python, Go, PHP and Ruby, a CLI, and an MCP server for Claude, ChatGPT and Cursor.

## All Groundmail libraries

| Use | Package |
|-----|---------|
| Node.js / TypeScript | [`groundmail`](https://www.npmjs.com/package/groundmail) on npm |
| Python (Django), Go, Ruby (Rails Action Mailer) | [Groundmail/groundmail-sdks](https://github.com/Groundmail/groundmail-sdks) |
| PHP | [Groundmail/groundmail-php](https://github.com/Groundmail/groundmail-php) |
| Laravel | [Groundmail/groundmail-laravel](https://github.com/Groundmail/groundmail-laravel) |
| Symfony Mailer | [Groundmail/groundmail-symfony-mailer](https://github.com/Groundmail/groundmail-symfony-mailer) |
| Nodemailer | [Groundmail/groundmail-nodemailer](https://github.com/Groundmail/groundmail-nodemailer) |
| NestJS | [Groundmail/nestjs-groundmail](https://github.com/Groundmail/nestjs-groundmail) |
| Strapi | [Groundmail/strapi-provider-email-groundmail](https://github.com/Groundmail/strapi-provider-email-groundmail) |
| Medusa | [Groundmail/medusa-notification-groundmail](https://github.com/Groundmail/medusa-notification-groundmail) |
| AdonisJS | [Groundmail/adonisjs-groundmail](https://github.com/Groundmail/adonisjs-groundmail) |
| Phoenix (Swoosh) | [Groundmail/swoosh_groundmail](https://github.com/Groundmail/swoosh_groundmail) |
| CLI | [`groundmail-cli`](https://www.npmjs.com/package/groundmail-cli) on npm |
| MCP server (Claude, ChatGPT, Cursor) | [Groundmail/groundmail-mcp](https://github.com/Groundmail/groundmail-mcp) |
| Agent skills and Claude Code plugin | [Groundmail/groundmail-skills](https://github.com/Groundmail/groundmail-skills) |
| Email templates (React Email, MJML, HTML) | [Groundmail/email-templates](https://github.com/Groundmail/email-templates) |

[Website](https://groundmail.dev?utm_source=github&utm_medium=readme&utm_campaign=groundmail-mcp) · [Docs](https://docs.groundmail.dev?utm_source=github&utm_medium=readme&utm_campaign=groundmail-mcp) · [Pricing](https://groundmail.dev/pricing/?utm_source=github&utm_medium=readme&utm_campaign=groundmail-mcp) · [Sign up free](https://app.groundmail.dev/signup?utm_source=github&utm_medium=readme&utm_campaign=groundmail-mcp)
