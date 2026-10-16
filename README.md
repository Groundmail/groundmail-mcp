# groundmail-mcp

MCP server for [Groundmail](https://groundmail.dev): send email and manage domains, webhooks, suppressions and templates from Claude, Claude Code, ChatGPT, Cursor and other MCP clients.

**Install:** `npx -y groundmail-mcp` · **Docs:** https://docs.groundmail.dev/ai/mcp

## Transports

| Mode | Command / URL | Auth |
|------|---------------|------|
| **stdio** (default) | `npx -y groundmail-mcp` | `GROUNDMAIL_API_KEY=gm_…` |
| **HTTP** (local) | `npx -y groundmail-mcp --http --port 3000` | `Authorization: Bearer gm_…` on each request |
| **HTTP** (hosted) | `https://mcp.groundmail.dev/mcp` | **OAuth** (recommended) or `Authorization: Bearer gm_…` |

Optional: `GROUNDMAIL_API_URL` (e.g. `http://localhost:3003/api` for local API).

Local HTTP endpoint: `http://127.0.0.1:3000/mcp` · health: `GET /health`  
Hosted health: `GET https://mcp.groundmail.dev/health`

Hosted OAuth: add only `"url": "https://mcp.groundmail.dev/mcp"` — the client runs the browser consent flow. Bearer `gm_…` still works for advanced setups.

---

## Cursor (stdio)

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

### Cursor (local HTTP)

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

### Cursor (hosted)

```json
{
  "mcpServers": {
    "groundmail": {
      "url": "https://mcp.groundmail.dev/mcp",
      "headers": {
        "Authorization": "Bearer gm_your_key_here"
      }
    }
  }
}
```

---

## Claude Code

```bash
# Hosted, OAuth: then run /mcp, pick groundmail, Authenticate
claude mcp add --transport http groundmail https://mcp.groundmail.dev/mcp

# Hosted, API key
claude mcp add --transport http groundmail https://mcp.groundmail.dev/mcp \
  --header "Authorization: Bearer $GROUNDMAIL_API_KEY"

# Local stdio
claude mcp add groundmail --env GROUNDMAIL_API_KEY=gm_your_key_here -- npx -y groundmail-mcp
```

## Claude and ChatGPT

Add a custom connector with the URL `https://mcp.groundmail.dev/mcp` and sign in to Groundmail when prompted (ChatGPT needs developer mode). Step-by-step: https://docs.groundmail.dev/ai/mcp

---

## Tools

See https://docs.groundmail.dev/ai/mcp — emails, domains, webhooks, suppressions, templates, deliverability, webhook test.

## License

MIT
