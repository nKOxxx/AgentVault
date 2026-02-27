# AgentVault

Secure credential management for AI agents.

## Install

```bash
npm install
```

## Run

```bash
node server.js
```

Then open: http://localhost:8765

## First Time

1. Create vault password
2. Add credentials
3. Share to OpenClaw agent (optional)

## Security

- **No cloud storage** — Everything local
- **No password recovery** — Don't forget your password
- **Backup vault.db yourself**

## Reset

```bash
rm -f vault.db .ws-token
```
