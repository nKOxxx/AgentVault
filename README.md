# IronVault

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey)](https://github.com/nKOxxx/AgentVault/releases)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![Security Audit](https://img.shields.io/badge/security%20audit-9.5%2F10-brightgreen)](SECURITY_AUDIT_v1.3.0.md)

**Secure encrypted credential vault for AI agents.** Store API keys and secrets locally with AES-256-GCM encryption, audit logging, and WebSocket integration for seamless agent access. Zero cloud dependency — your secrets never leave your machine.

---

## Table of Contents

- [Download](#download-macos-desktop-app)
- [Quick Start](#quick-start)
- [Security Model](#security-model)
- [User Guide](#user-guide)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [WebSocket Protocol](#websocket-protocol)
- [Configuration](#configuration)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Download (macOS Desktop App)

No terminal required — native menubar app with system tray integration.

| Intel Mac | Apple Silicon (M1/M2/M3/M4) |
|-----------|----------------------------|
| [IronVault.dmg](https://github.com/nKOxxx/AgentVault/releases/latest) | [IronVault-arm64.dmg](https://github.com/nKOxxx/AgentVault/releases/latest) |

> **First launch:** macOS will warn about an unsigned app. Right-click the app → **Open**, or go to **System Settings → Privacy & Security → "Open Anyway"**.

[All releases](https://github.com/nKOxxx/AgentVault/releases) · [Security Audit v1.3.0](SECURITY_AUDIT_v1.3.0.md) (Score: 9.5/10)

---

## Quick Start

### Option 1: Desktop App (Recommended)

1. Download the `.dmg` for your Mac (see above)
2. Drag IronVault to Applications
3. Launch from Applications or Spotlight
4. Create a master password (12+ characters, mixed case, numbers, symbols)
5. Start adding credentials

### Option 2: Server Mode

```bash
git clone https://github.com/nKOxxx/AgentVault.git
cd AgentVault
npm install
npm start
```

Open [http://localhost:8765](http://localhost:8765), create a master password, and add your first key.

### Option 3: Standalone (Portable)

See [README-STANDALONE.md](README-STANDALONE.md) for the portable version that runs without installation.

---

## Security Model

IronVault is built security-first. Every design decision prioritizes the protection of your credentials.

### Encryption

| Component | Implementation |
|-----------|---------------|
| **Algorithm** | AES-256-GCM (authenticated encryption with associated data) |
| **Key Derivation** | PBKDF2-SHA256, 100,000 iterations |
| **IV** | 16 cryptographically random bytes per encryption operation |
| **Auth Tag** | 16-byte GCM authentication tag prevents tampering |
| **Implementation** | Node.js native `crypto` module (hardware-accelerated via OpenSSL) |

### How It Works

```
Master Password
      │
      ▼
  PBKDF2-SHA256 (100k iterations + 16-byte random salt)
      │
      ▼
  256-bit Encryption Key (held in RAM only)
      │
      ├──► Encrypt credentials (AES-256-GCM + random IV)
      ├──► Encrypt audit log entries
      └──► Encrypt LLM configuration
```

- The master password is **never stored** — only the derived key is held in memory while the vault is unlocked
- Each encryption operation uses a **unique random IV**, preventing pattern detection
- GCM mode provides **authenticated encryption** — any tampering is detected and rejected
- The encryption key is **cleared from memory** when you lock the vault or after 15 minutes of inactivity

### Access Controls

| Protection | Detail |
|-----------|--------|
| **Rate Limiting** | 5 failed unlock attempts → 15-minute lockout |
| **Auto-Lock** | Vault locks after 15 minutes of inactivity |
| **Network Scope** | Localhost only (127.0.0.1) — no remote access |
| **CORS** | Restricted to localhost origins |
| **File Permissions** | Vault files created with `0o600` (owner read/write only) |
| **WebSocket Auth** | 32-byte random token required for agent connections |
| **Password Requirements** | 12+ chars, uppercase, lowercase, number, special character |
| **Security Headers** | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |

### Desktop App Security (Electron)

| Feature | Status |
|---------|--------|
| `nodeIntegration` | ❌ Disabled |
| `contextIsolation` | ✅ Enabled |
| External links | Opened in system browser (not in-app) |
| Preload bridge | Minimal, read-only API surface |
| Data directory | Platform-standard secure location |

### What IronVault Does NOT Do

- ❌ No cloud sync — your data stays on your machine
- ❌ No telemetry or analytics
- ❌ No password recovery — if you forget your master password, data is unrecoverable
- ❌ No remote access — only localhost connections accepted

---

## User Guide

### Creating Your First Vault

1. Launch IronVault (desktop app or `npm start`)
2. You'll see the **Create Your Vault** screen
3. Choose a strong master password:
   - Minimum 12 characters
   - Must include: uppercase, lowercase, numbers, and special characters
   - **Write it down and store it safely** — there is no recovery mechanism
4. Confirm your password and click **Create Vault**

### Adding Credentials

1. Click **+ Add Credential** (or press `Ctrl+N`)
2. Select a service type:
   - **OpenAI** — API keys (`sk-...`)
   - **Anthropic** — API keys (`sk-ant-...`)
   - **GitHub** — Personal access tokens (`ghp_...`)
   - **Render** — API keys and service IDs
   - **X/Twitter** — OAuth credentials (API key, secret, access token, bearer)
   - **Custom** — Any key/value pair
3. Enter a descriptive name (e.g., "Production API Key")
4. Paste your credential value
5. Click **Save Credential** — it's encrypted immediately

### Managing Credentials

- **Copy** 📋 — Decrypts and copies the credential to your clipboard
- **Share** 📤 — Sends the credential to a connected AI agent via WebSocket
- **Delete** 🗑️ — Permanently removes the credential (cannot be undone)

### Viewing the Audit Log

1. Click the **📋 Audit Log** tab
2. All vault operations are logged with timestamps:
   - Credential additions, access, sharing, deletions
   - Vault lock/unlock events
   - Failed password attempts
3. Audit entries are encrypted when the vault is unlocked

### Locking the Vault

- Click **🔒 Lock** or press `Ctrl+L`
- The vault auto-locks after 15 minutes of inactivity
- Locking clears the encryption key from memory

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` / `Cmd+N` | Add new credential |
| `Ctrl+L` / `Cmd+L` | Lock the vault |
| `Escape` | Close modal/dialog |

### Connecting an AI Agent

1. Unlock the vault
2. Your agent connects to `ws://localhost:8766`
3. Agent authenticates with the WebSocket token (found in `.ws-token`)
4. Share credentials individually or use "Share All"
5. The agent confirms receipt — sharing status is tracked per credential

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                    IronVault                      │
│                                                   │
│  ┌─────────┐    ┌──────────┐    ┌──────────────┐ │
│  │ Web UI  │◄──►│  Express │◄──►│   SQLite DB  │ │
│  │ :8765   │    │  Server  │    │  (encrypted) │ │
│  └─────────┘    └────┬─────┘    └──────────────┘ │
│                      │                             │
│                 ┌────▼─────┐    ┌──────────────┐  │
│                 │WebSocket │◄──►│  AI Agent    │  │
│                 │  :8766   │    │  (external)  │  │
│                 └──────────┘    └──────────────┘  │
│                      │                             │
│                 ┌────▼─────┐                       │
│                 │  Audit   │                       │
│                 │   Log    │                       │
│                 └──────────┘                       │
└─────────────────────────────────────────────────┘

Data Flow:
  User ──► Master Password ──► PBKDF2 ──► 256-bit Key (RAM only)
                                              │
  Credential ──► AES-256-GCM + Random IV ──► Encrypted Value ──► SQLite
```

### File Layout

| File | Purpose |
|------|---------|
| `vault.db` | SQLite database with encrypted credential values |
| `audit.log` | Encrypted security event log |
| `.ws-token` | WebSocket authentication token (0o600 permissions) |

### Desktop App Data Location

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/IronVault/` |
| Windows | `%APPDATA%/IronVault/` |
| Linux | `~/.config/IronVault/` |

---

## API Reference

All endpoints run on `http://localhost:8765`. Endpoints marked 🔓 require the vault to be unlocked.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/status` | — | Vault status (initialized, unlocked, key count, agent connected) |
| `POST` | `/api/init` | — | Initialize vault with master password |
| `POST` | `/api/unlock` | — | Unlock vault (rate limited: 5 attempts/15 min) |
| `POST` | `/api/logout` | — | Lock vault (clears encryption key from memory) |
| `GET` | `/api/keys` | 🔓 | List all credentials (metadata only, no secret values) |
| `POST` | `/api/keys` | 🔓 | Add a new credential |
| `GET` | `/api/keys/:id/value` | 🔓 | Get decrypted credential value |
| `PUT` | `/api/keys/:id` | 🔓 | Update a credential (supports key rotation) |
| `DELETE` | `/api/keys/:id` | 🔓 | Delete a credential |
| `POST` | `/api/keys/:id/share` | 🔓 | Share credential with connected agent |
| `POST` | `/api/keys/:id/unshare` | 🔓 | Revoke sharing status |
| `POST` | `/api/keys/share-all` | 🔓 | Share all unshared credentials |
| `GET` | `/api/audit` | 🔓 | Get audit log (default: last 50 entries) |
| `GET` | `/api/ws-token` | 🔓 | Get WebSocket auth token |
| `GET` | `/api/config` | 🔓 | Get LLM configuration |
| `POST` | `/api/config` | 🔓 | Save LLM configuration (encrypted) |
| `POST` | `/api/reset` | 🔓 | Delete all vault data (irreversible) |

### Example: Add a Credential

```bash
curl -X POST http://localhost:8765/api/keys \
  -H "Content-Type: application/json" \
  -d '{"name": "OpenAI Prod", "service": "openai", "value": "sk-..."}'
```

### Example: Get Credential Value

```bash
curl http://localhost:8765/api/keys/CREDENTIAL_ID/value
```

---

## WebSocket Protocol

IronVault runs a WebSocket server on port `8766` for real-time credential sharing with AI agents.

### Authentication

```json
// Agent → IronVault
{ "type": "auth", "token": "<32-byte-hex-token-from-.ws-token>" }

// IronVault → Agent (success)
{ "type": "auth_success" }

// IronVault → Agent (failure — connection closed)
{ "type": "auth_failed", "error": "Invalid token" }
```

### Credential Sharing

```json
// IronVault → Agent (shared credential)
{
  "type": "shared_secret",
  "keyId": "abc123...",
  "timestamp": "2026-04-01T10:00:00Z",
  "data": {
    "name": "OpenAI Prod",
    "service": "openai",
    "url": "https://api.openai.com",
    "value": "sk-..."
  }
}

// Agent → IronVault (confirmation)
{
  "type": "key_received",
  "keyId": "abc123...",
  "keyName": "OpenAI Prod",
  "agentName": "My AI Agent"
}
```

### Request Credentials

```json
// Agent → IronVault
{ "type": "get_key", "keyId": "abc123..." }

// IronVault → Agent
{
  "type": "key_data",
  "keyId": "abc123...",
  "data": { "name": "...", "service": "...", "value": "..." }
}
```

---

## Configuration

### Environment Variables

```bash
PORT=8765        # HTTP server port (default: 8765)
WS_PORT=8766     # WebSocket port (default: 8766)
MAX_KEYS=20      # Maximum credentials per vault (default: 20)
TRUST_PROXY=true # Trust reverse proxy headers (for nginx/traefik)
FORCE_HTTPS=true # Force HTTPS redirect (production behind proxy)
```

---

## Best Practices

### Credential Storage

1. **Use descriptive names** — "OpenAI Production" is better than "key1"
2. **Rotate regularly** — IronVault tracks rotation intervals and reminds you
3. **Share selectively** — only share credentials your agent actually needs
4. **Revoke when done** — unshare credentials after agent tasks complete

### Backup

1. **Back up `vault.db` regularly** — this file contains all your encrypted credentials
2. **Store backups encrypted** — the vault file is encrypted, but keep backups in a secure location
3. **Remember your master password** — without it, backups are useless
4. **Test restores** — periodically verify your backup can be unlocked

### Network Security

1. IronVault binds to `127.0.0.1` only — it's not accessible from other machines
2. If you need remote access, use a reverse proxy with TLS (see `TRUST_PROXY` and `FORCE_HTTPS`)
3. The WebSocket token in `.ws-token` is sensitive — protect it like a password
4. Never expose ports 8765/8766 to the public internet

---

## Troubleshooting

### "Vault locked" errors
The vault auto-locks after 15 minutes of inactivity. Unlock it again with your master password.

### "Too many attempts" lockout
After 5 failed password attempts, you're locked out for 15 minutes. Wait and try again.

### Port already in use
Another instance of IronVault (or another service) is using port 8765/8766. Stop the other process or change the port via environment variables.

### Agent can't connect
1. Ensure the vault is unlocked
2. Check the WebSocket token in `.ws-token` matches what your agent is using
3. Verify your agent is connecting to `ws://localhost:8766`

### Desktop app won't open on macOS
Right-click the app → **Open**, then click **Open** in the dialog. Or go to **System Settings → Privacy & Security** and click **Open Anyway**.

### Forgot master password
**There is no recovery mechanism.** The encryption is designed so that without the password, data is unrecoverable. This is a security feature, not a bug. If you have a backup of `vault.db`, you'll still need the original password to unlock it.

---

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  <strong>IronVault</strong> — Your secrets, your machine, your control.
</p>
