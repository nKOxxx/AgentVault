# AgentVault Local Installation

## Quick Install (macOS/Linux)

```bash
# 1. Clone/navigate to project
cd AgentVault

# 2. Install dependencies
npm install

# 3. Start server
node server.js

# 4. Open in browser
open http://localhost:8765
```

## First-Time Setup

1. **Create vault** - Enter master password (8+ chars)
2. **Add credentials** - Click "+ Add Credential"
3. **Share to agent** - Click 📤 button (if the agent running)

## Auto-Start (Optional)

Add to `~/.zshrc` or `~/.bash_profile`:

```bash
# Start AgentVault on login
if ! pgrep -f "AgentVault/server.js" > /dev/null; then
  cd AgentVault
  node server.js > /tmp/agentvault.log 2>&1 &
fi
```

## Backup (CRITICAL)

```bash
# Daily backup
cp vault.db \
   ~/backups/vault-$(date +%Y%m%d).db
```

## Reset (Deletes Everything)

```bash
rm -f vault.db .ws-token
# Restart server
```

---

## Status Badges

- ✓ **Green** = Shared with agent
- ⏳ **Orange** = Sharing pending
- ✕ **Red** = Share failed
- ○ **None** = Not shared

---

## Troubleshooting

**Can't connect:**
```bash
# Check if running
curl http://localhost:8765/api/status

# Restart
pkill -f "node server.js"
node server.js
```

**Forgot password:**
- No recovery possible
- Delete `vault.db` and start over

**Share not working:**
- Ensure external agent is running
- Check WebSocket: `ws://localhost:8766`
