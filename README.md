# AgentVault 🔐

**Secure credential storage for AI agents with audit logging.**

AgentVault stores API keys, tokens, and secrets locally with hardware-accelerated encryption (AES-256-GCM). Share credentials securely with your OpenClaw agent via WebSocket.

---

## Features

- **🔒 Hardware-Accelerated Encryption** — AES-256-GCM via Node native crypto
- **📊 Audit Logging** — Full trail of vault access and key operations
- **🤖 OpenClaw Integration** — Share keys securely with your AI agent
- **🔄 Key Rotation Reminders** — Track when keys need rotation
- **🌐 Web UI** — Manage secrets through browser interface
- **💾 Local Storage** — Your data never leaves your machine

---

## Quick Start

### Prerequisites

- Node.js 16+
- macOS, Linux, or Windows

### Installation

```bash
# Clone the repository
git clone https://github.com/nKOxxx/AgentVault.git
cd AgentVault

# Install dependencies
npm install

# Start the server
npm start

# Or use the launcher
./start.sh start
```

### First Run

1. Open http://localhost:8765
2. Create a master password (min 8 characters)
3. Add your first API key
4. Connect OpenClaw agent to receive keys

---

## Architecture

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│   AgentVault    │ ◄────────────────► │   OpenClaw      │
│   localhost:8765│                    │   Agent (Ares)  │
└────────┬────────┘                    └─────────────────┘
         │
    ┌────▼────┐
    │ vault.db│  ← SQLite (encrypted values)
    └────┬────┘
    ┌────▼────┐
    │audit.log│  ← Security audit trail
    └─────────┘
```

---

## API Reference

### Authentication

All endpoints require vault to be unlocked (except `/api/init` and `/api/unlock`).

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/init` | Initialize vault with master password |
| POST | `/api/unlock` | Unlock vault |
| POST | `/api/logout` | Lock vault (clear key from memory) |
| GET | `/api/status` | Get vault status |
| GET | `/api/keys` | List all keys |
| POST | `/api/keys` | Add new key |
| DELETE | `/api/keys/:id` | Delete key |
| POST | `/api/keys/:id/share` | Share key with OpenClaw |
| POST | `/api/keys/share-all` | Share all unshared keys |
| GET | `/api/audit` | Get audit log |
| POST | `/api/reset` | Delete all data (DANGER) |

### WebSocket Protocol

AgentVault connects to OpenClaw via WebSocket on port `8766`.

**From AgentVault to OpenClaw:**
```json
{
  "type": "shared_secret",
  "keyId": "abc123",
  "timestamp": "2026-02-24T10:00:00Z",
  "data": {
    "name": "Supabase Production",
    "service": "supabase",
    "url": "https://...",
    "value": "sb_..."
  }
}
```

**From OpenClaw to AgentVault (confirmation):**
```json
{
  "type": "key_received",
  "keyId": "abc123",
  "keyName": "Supabase Production",
  "agentName": "Ares"
}
```

---

## Security

### Encryption

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Derivation**: PBKDF2 with 100,000 iterations
- **IV**: Random 16 bytes per encryption
- **Auth Tag**: 16 bytes (tamper detection)

### Audit Logging

All security events are logged to `audit.log`:
- Vault initialization/unlock/lock
- Key addition, sharing, deletion
- Failed unlock attempts
- Connection events

### Rate Limiting

- 5 attempts per 15 minutes for unlock
- Prevents brute-force attacks

### Local Only

- No cloud services
- No external APIs
- Your data stays on your machine

---

## Configuration

### Environment Variables

```bash
PORT=8765           # HTTP server port
WS_PORT=8766        # WebSocket port
MAX_KEYS=20         # Maximum keys per vault
```

### File Locations

```
~/.openclaw/workspace/projects/AgentVault/
├── vault.db        # Encrypted database
├── audit.log       # Security audit trail
└── server.js       # Main server
```

---

## Integration with OpenClaw

AgentVault is designed to work with OpenClaw agents. The WebSocket protocol allows secure key sharing:

1. AgentVault detects OpenClaw connection on port 8766
2. Keys marked for sharing are sent via WebSocket
3. OpenClaw confirms receipt
4. AgentVault marks key as "shared" in database

---

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm start

# View audit log
tail -f audit.log
```

---

## Security Disclosure

**IMPORTANT**: AgentVault is designed for local use. For production deployments:

1. Use strong master passwords (16+ characters)
2. Enable full-disk encryption on your machine
3. Backup your vault.db file securely
4. Review audit logs regularly

---

## License

MIT — See LICENSE file

---

**Built for the agent economy. Your keys, your control.** 🔐