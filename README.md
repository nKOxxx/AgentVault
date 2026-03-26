# AgentVault

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey)](https://github.com/nKOxxx/AgentVault/releases)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16-brightgreen)](https://nodejs.org/)

Secure encrypted credential vault for AI agents. Store API keys and secrets locally with AES-256-GCM encryption, audit logging, and WebSocket integration for seamless agent access.

## Download (macOS Desktop App)

No terminal required — native menubar app.

| Intel | Apple Silicon (M1/M2/M3) |
|-------|--------------------------|
| [AgentVault-1.2.0.dmg](https://github.com/nKOxxx/AgentVault/releases/download/v1.3.0/AgentVault-1.2.0.dmg) (94 MB) | [AgentVault-1.2.0-arm64.dmg](https://github.com/nKOxxx/AgentVault/releases/download/v1.3.0/AgentVault-1.2.0-arm64.dmg) (89 MB) |

> **First launch:** macOS may warn about an unsigned app. Right-click → Open, or go to System Settings → Privacy & Security → "Open Anyway".

[All releases](https://github.com/nKOxxx/AgentVault/releases) · [Security Audit v1.3.0](SECURITY_AUDIT_v1.3.0.md) (Score: 8.5/10)

## Quick Start (Server)

```bash
git clone https://github.com/nKOxxx/AgentVault.git
cd AgentVault
npm install
npm start
```

Open http://localhost:8765, create a master password, and add your first key.

## Features

- **AES-256-GCM encryption** — hardware-accelerated via Node native crypto
- **Audit logging** — full trail of vault access and key operations
- **WebSocket integration** — share keys securely with OpenClaw agents
- **Key rotation reminders** — track when keys need rotation
- **Web UI** — manage secrets through a browser interface
- **Local only** — your data never leaves your machine

## Architecture

```
AgentVault (localhost:8765) ◄──WebSocket──► OpenClaw Agent
        │
    vault.db     ← SQLite (AES-256-GCM encrypted values)
    audit.log    ← Security audit trail
```

## API Reference

All endpoints require vault to be unlocked (except `/api/init` and `/api/unlock`).

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/init` | Initialize vault with master password |
| POST | `/api/unlock` | Unlock vault |
| POST | `/api/logout` | Lock vault |
| GET | `/api/status` | Vault status |
| GET | `/api/keys` | List all keys |
| POST | `/api/keys` | Add a key |
| DELETE | `/api/keys/:id` | Delete a key |
| POST | `/api/keys/:id/share` | Share key with agent |
| POST | `/api/keys/share-all` | Share all unshared keys |
| GET | `/api/audit` | Audit log |
| POST | `/api/reset` | Delete all data (irreversible) |

### WebSocket Protocol

AgentVault connects to OpenClaw on port `8766`.

**AgentVault → OpenClaw:**
```json
{
  "type": "shared_secret",
  "keyId": "abc123",
  "timestamp": "2026-02-24T10:00:00Z",
  "data": { "name": "Supabase Prod", "service": "supabase", "value": "sb_..." }
}
```

**OpenClaw → AgentVault (confirmation):**
```json
{
  "type": "key_received",
  "keyId": "abc123",
  "keyName": "Supabase Prod",
  "agentName": "OpenClaw Agent"
}
```

## Security

| Aspect | Detail |
|--------|--------|
| Algorithm | AES-256-GCM (authenticated encryption) |
| Key derivation | PBKDF2, 100,000 iterations |
| IV | 16 random bytes per encryption |
| Rate limiting | 5 unlock attempts per 15 minutes |
| Scope | Localhost only, no cloud services |

> **Important:** AgentVault stores all data locally in `vault.db`. If this file is lost or your master password is forgotten, keys are unrecoverable — there is no cloud backup or password reset. Back up `vault.db` regularly.

## Configuration

```bash
PORT=8765     # HTTP server port (default)
WS_PORT=8766  # WebSocket port (default)
MAX_KEYS=20   # Max keys per vault (default)
```

## License

MIT — see [LICENSE](LICENSE).
