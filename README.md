# AgentVault 🔐 — Secure Credential Management for AI Agents

**Where do AI agents store their secrets?** API keys scattered in environment variables. Tokens in plain text files. No audit trail. No rotation tracking. No security.

**AgentVault solves this.** It's a secure, encrypted vault designed specifically for AI agents — with hardware-accelerated encryption, audit logging, and seamless OpenClaw integration.

> *"Finally, a proper secrets manager for my AI agent that doesn't require enterprise infrastructure."*

---

## ⚠️ CRITICAL: BACKUP REQUIRED

**AgentVault stores everything locally. If you lose the vault.db file, your keys are gone forever.**

### ⚡ You MUST manually backup vault.db

```bash
# macOS/Linux - Add to your backup script:
cp ~/.openclaw/workspace/projects/AgentVault/vault.db ~/backups/vault-$(date +%Y%m%d).db

# Windows - Copy this file regularly:
# C:\Users\[username]\.openclaw\workspace\projects\AgentVault\vault.db
```

### 🚨 What you need to know:
- **No cloud sync** — Your data stays on YOUR machine only
- **No password recovery** — Forget your master password = vault is unrecoverable
- **No automatic backups** — You are responsible for backing up `vault.db`
- **Single user only** — Don't share vault files between users
- **File corruption risk** — Hard drive failure, accidental deletion, etc.

### ✅ Recommended backup strategy:
1. **Daily:** Automated backup of `vault.db` to external drive/cloud
2. **Weekly:** Verify backup file works by testing unlock
3. **Before major changes:** Manual export/copy of vault.db

---

## ⚠️ Production Notice

**AgentVault is designed for LOCAL-ONLY, PERSONAL USE:**
- ✅ Your credentials never leave your machine
- ⚠️ No cloud backup — you must backup `vault.db` and remember your master password
- ⚠️ Encryption keys derived from your master password — don't forget it!
- ⚠️ Not for enterprise multi-user deployments (single-user only)
- ⚠️ WebSocket connection is localhost-only by design

---

## Why AgentVault Exists

| Without AgentVault | With AgentVault |
|-------------------|-----------------|
| ❌ API keys in .env files | ✅ Encrypted vault with master password |
| ❌ No audit trail | ✅ Complete log of who accessed what |
| ❌ Manual key sharing | ✅ One-click share with OpenClaw agent |
| ❌ Forgotten rotations | ✅ Automatic rotation reminders |
| ❌ Keys scattered everywhere | ✅ Centralized, organized secrets |
| ❌ No security controls | ✅ Rate limiting, input validation, CORS |

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
│   localhost:8765│                    │   OpenClaw Agent│
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
  "agentName": "OpenClaw Agent"
}
```

---

## 🧪 Testing AgentVault

### Quick Test (5 minutes)

```bash
# 1. Start AgentVault
cd /path/to/AgentVault
./start.sh start

# 2. Initialize vault (first run only)
curl -X POST http://localhost:8765/api/init \
  -H "Content-Type: application/json" \
  -d '{"password": "testpassword123"}'

# 3. Unlock vault
curl -X POST http://localhost:8765/api/unlock \
  -H "Content-Type: application/json" \
  -d '{"password": "testpassword123"}'

# 4. Add a test key
curl -X POST http://localhost:8765/api/keys \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test API Key",
    "service": "test-service",
    "url": "https://api.test.com",
    "value": "sk_test_12345_secret",
    "autoShare": false
  }'

# 5. List keys
curl http://localhost:8765/api/keys

# 6. Check audit log
curl http://localhost:8765/api/audit

# 7. Open Web UI
open http://localhost:8765
# Verify the test key appears in the list
```

### What to Verify

✅ **Basic functionality:**
- Vault initializes and unlocks correctly
- Keys add and list properly
- Web UI displays keys with correct metadata
- Unlock with wrong password fails (rate limited)

✅ **Encryption:**
```bash
# Verify data is encrypted in database
sqlite3 vault.db "SELECT encrypted_value FROM keys LIMIT 1;"
# Should see hex gibberish, not "sk_test_12345_secret"
```

✅ **Audit logging:**
```bash
# Check audit trail
cat audit.log | tail -5
# Should see vault_unlocked, key_added events
```

✅ **WebSocket (with OpenClaw running):**
1. Start OpenClaw agent
2. Check connection status: `curl http://localhost:8765/api/status`
3. Add key with `"autoShare": true` — should auto-share
4. Check key shows "✓ Shared" badge in Web UI

✅ **Reset (cleanup):**
```bash
# WARNING: This deletes all vault data
curl -X POST http://localhost:8765/api/reset
```

---

## Share Status Badges

Each credential shows a visual indicator of its sharing status with your OpenClaw agent:

| Badge | Status | Meaning |
|-------|--------|---------|
| ✓ | **Green** | Successfully shared with agent |
| ⏳ | **Orange** | Sharing in progress (pending confirmation) |
| ✕ | **Red** | Share failed (agent not connected or error) |
| (none) | **None** | Not shared yet |

### How it works:

1. **Click 📤 Share** — Badge turns orange (⏳ pending)
2. **Agent receives** — Badge turns green (✓ shared)
3. **If failed** — Badge turns red (✕ error)

The status is persistent across vault locks/unlocks.

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

## Backup & Restore

### Why Backup?
AgentVault stores all data locally in `vault.db`. If this file is lost, corrupted, or deleted, your keys are **gone forever**. There is no cloud backup, no recovery service, and no password reset.

### How to Backup

**Option 1: Manual backup (easiest)**
```bash
# macOS/Linux
# Copy vault.db to your backup location
cp ~/.openclaw/workspace/projects/AgentVault/vault.db ~/Documents/agentvault-backup-$(date +%Y%m%d).db

# Windows (PowerShell)
# Copy vault.db to your backup location
Copy-Item "$env:USERPROFILE\.openclaw\workspace\projects\AgentVault\vault.db" "$env:USERPROFILE\Documents\agentvault-backup-$(Get-Date -Format yyyyMMdd).db"
```

**Option 2: Automated daily backup (macOS/Linux)**
```bash
# Add to crontab (runs daily at 2am)
0 2 * * * cp ~/.openclaw/workspace/projects/AgentVault/vault.db ~/backups/vault-$(date +\%Y\%m\%d).db
```

**Option 3: Cloud backup (encrypted)**
Upload `vault.db` to your preferred cloud storage (Dropbox, Google Drive, etc.). The file is already encrypted, so it's safe to store in the cloud.

### How to Restore

1. **Stop AgentVault** if running
2. **Replace vault.db** with your backup:
   ```bash
   cp ~/backups/vault-20260226.db ~/.openclaw/workspace/projects/AgentVault/vault.db
   ```
3. **Restart AgentVault**
4. **Unlock with your master password** (the one from when backup was made)

### What to Backup

| File | Importance | Description |
|------|-----------|-------------|
| `vault.db` | **CRITICAL** | Contains all encrypted keys. Without this, keys are lost. |
| `audit.log` | Optional | Security audit trail. Can be regenerated. |

**You only need `vault.db` for a complete restore.**

### Best Practices

- ✅ Backup daily if you add/modify keys frequently
- ✅ Test restore process monthly with a test vault
- ✅ Store backups in multiple locations (local + cloud)
- ✅ Never commit `vault.db` to Git (it's in `.gitignore`)
- ❌ Don't rename backup files — keep date in filename
- ❌ Don't edit `vault.db` directly — will corrupt it

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