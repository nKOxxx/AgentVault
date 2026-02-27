# AgentVault - Standalone Local Version

Secure credential management for AI agents. Runs locally on your machine.

## Quick Start

```bash
# Install
git clone https://github.com/nKOxxx/AgentVault.git
cd AgentVault
npm install

# Run
node server.js

# Open manually: http://localhost:8765
```

## Features

- **Encrypted vault** — AES-256-GCM encryption
- **Local only** — No cloud, no external dependencies
- **Share to agent** — Send credentials to OpenClaw agent
- **Status badges** — Visual sharing status (✓ shared, ⏳ pending, ✕ error)
- **Audit logging** — Track all vault operations

## First Run

1. Create vault password (8+ characters)
2. Add credentials
3. Share to agent (optional)

## Security

- **No password recovery** — Don't forget your password
- **No automatic backups** — Backup `vault.db` yourself
- **Local storage only** — Data never leaves your machine

## Backup

```bash
# Backup vault
cp vault.db ~/backups/vault-$(date +%Y%m%d).db
```

## Reset

```bash
# WARNING: Deletes all data
rm -f vault.db .ws-token
```

## License

MIT
