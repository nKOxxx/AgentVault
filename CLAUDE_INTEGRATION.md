# IronVault × Claude Integration

Connect IronVault to Claude so it can securely access your stored credentials — in **Claude Desktop** (chat) and **Claude Code** (terminal).

---

## How It Works

IronVault runs an **MCP server** (`ironvault-mcp.js`) over stdio. When connected, Claude gains four tools:

| Tool | What it does |
|------|-------------|
| `vault_status` | Check if vault is unlocked and ready |
| `list_credentials` | See all stored credentials by name (no secret values) |
| `get_credential` | Fetch a specific credential's secret value |
| `search_credentials` | Search credentials by name or service |

**Security:** Claude only receives secret values when it explicitly calls `get_credential`. Listing credentials never exposes values.

---

## Prerequisites

1. **IronVault is running** — either `npm start` or the desktop app is open
2. **Vault is unlocked** — enter your master password in the IronVault UI
3. **Node.js ≥ 18** installed

---

## Setup: Claude Code

```bash
claude mcp add ironvault --transport stdio -- node /path/to/IronVault/ironvault-mcp.js
```

Verify:
```bash
claude mcp list
# ironvault: node .../ironvault-mcp.js - ✓ Connected
```

That's it. IronVault tools are now available in every Claude Code session.

### Usage in Claude Code

Just ask naturally in your terminal session:

```
> get my OpenAI API key from IronVault
> list all credentials in the vault
> search for anthropic credentials
```

Or Claude can use it autonomously when working on code that needs credentials.

---

## Setup: Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ironvault": {
      "command": "node",
      "args": ["/absolute/path/to/IronVault/ironvault-mcp.js"],
      "env": {
        "IRONVAULT_PORT": "8765"
      }
    }
  }
}
```

**Restart Claude Desktop** for the change to take effect. You'll see the 🔌 MCP indicator in the chat UI.

### Usage in Claude Desktop

In any conversation:

```
"Get my Anthropic API key from IronVault"
"What credentials do I have stored?"
"Find my GitHub token"
```

---

## Example Interactions

### Check vault is ready
> "Is my IronVault unlocked?"

Claude calls `vault_status` and responds:
> "IronVault is unlocked and ready. You have 5 credentials stored."

### Fetch a specific credential
> "I need to make an OpenAI API call — get my key from the vault"

Claude calls `search_credentials("openai")`, finds the match, then calls `get_credential` and uses the key directly in code.

### List everything
> "What API keys do I have in IronVault?"

Claude calls `list_credentials` — returns names and services, no secret values exposed until explicitly requested.

---

## Troubleshooting

**"Could not reach IronVault"**
→ IronVault server isn't running. Start it with `npm start` or open the desktop app.

**"The vault is locked"**
→ Unlock IronVault with your master password in the UI, then ask Claude to retry.

**Claude Code: server not connecting**
→ Check `claude mcp list`. If it shows an error, try removing and re-adding:
```bash
claude mcp remove ironvault
claude mcp add ironvault --transport stdio -- node /path/to/ironvault-mcp.js
```

**Custom port**
```bash
IRONVAULT_PORT=9000 node ironvault-mcp.js
```
Or set in the mcpServers env config.

---

## Security Notes

- The MCP server only connects to `127.0.0.1` — no remote access
- Credentials are only decrypted when explicitly requested via `get_credential`
- The vault must be manually unlocked before any credentials are accessible
- All credential access is recorded in IronVault's encrypted audit log
- Revoking Claude's access: just lock the vault (`Ctrl+L` in the UI)
