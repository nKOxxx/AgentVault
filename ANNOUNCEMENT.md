# AgentVault v1.2.0 — Desktop App Release

## 🚀 Download & Install (30 seconds)

### macOS Users

**Step 1:** Download the DMG for your Mac
- **Intel Macs**: [AgentVault-1.2.0.dmg](https://github.com/nKOxxx/AgentVault/releases/download/v1.2.0/AgentVault-1.2.0.dmg) (94 MB)
- **Apple Silicon** (M1/M2/M3): [AgentVault-1.2.0-arm64.dmg](https://github.com/nKOxxx/AgentVault/releases/download/v1.2.0/AgentVault-1.2.0-arm64.dmg) (89 MB)

**Step 2:** Double-click the DMG file

**Step 3:** Drag AgentVault to your Applications folder

**Step 4:** Launch from Applications

> ⚠️ **First launch only**: macOS will warn it's from an unidentified developer. Right-click the app → Open, then click "Open" again. Or go to System Settings → Privacy & Security → "Open Anyway".

That's it. No terminal. No `npm install`. No configuration.

---

## What is AgentVault?

A **native desktop app** that securely stores your AI agent credentials:

- 🔐 **AES-256-GCM encryption** — Military-grade security
- 💻 **Native app** — Not a web app in a browser
- 📤 **Share to your agent** — One-click credential sharing with OpenClaw
- ✓ **Visual status badges** — Know what's shared (✓ shared, ⏳ pending, ✕ error)
- 🔔 **Menu bar icon** — Always accessible
- 💾 **Local storage** — Your data never leaves your machine

---

## Quick Start

1. **Create vault** — Set a master password (don't forget it!)
2. **Add credentials** — API keys, tokens, passwords
3. **Share to agent** — Click 📤 button (if OpenClaw is running)
4. **Copy to use** — Click 📋 to copy to clipboard

---

## Why?

Because right now your API keys are probably:
- In plain text files
- Scattered in environment variables  
- In your shell history
- Copy-pasted into chatGPT

**AgentVault fixes this.** One secure location. Encrypted. Local.

---

## ⚠️ Critical: Backup Your Vault

Your credentials are stored in:
- **macOS**: `~/Library/Application Support/AgentVault/`

**If you lose this folder, your credentials are GONE FOREVER.**

There's no cloud backup. No password recovery. Back it up yourself.

---

## For Developers

Want to build from source or run the web version?

```bash
git clone https://github.com/nKOxxx/AgentVault.git
cd AgentVault/desktop
npm install
npm start
```

See [VERSIONS.md](https://github.com/nKOxxx/AgentVault/blob/main/VERSIONS.md) for all distribution options.

---

**Download**: https://github.com/nKOxxx/AgentVault/releases

**Repository**: https://github.com/nKOxxx/AgentVault

#AIagents #security #devtools #macOS
