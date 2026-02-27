# AgentVault Desktop

A secure credential manager for AI agents. Runs as a native desktop app.

## Install

### macOS
1. Download `AgentVault-1.2.0.dmg`
2. Drag AgentVault to Applications
3. Launch from Applications folder

### Windows
1. Download `AgentVault-Setup-1.2.0.exe`
2. Run installer
3. Launch from Start menu

### Linux
1. Download `AgentVault-1.2.0.AppImage`
2. Make executable: `chmod +x AgentVault-1.2.0.AppImage`
3. Run: `./AgentVault-1.2.0.AppImage`

## Usage

1. **First launch** — Create your master password
2. **Add credentials** — Click "+ Add Credential"
3. **Share to agent** — Click 📤 (if OpenClaw running)
4. **Access anytime** — Click tray icon or use Cmd/Ctrl+Shift+V

## Features

- 🔐 AES-256-GCM encryption
- 📤 Share credentials to OpenClaw agent
- ✓ Visual share status (green/orange/red badges)
- 🔔 Menu bar/tray icon
- 💾 Auto-starts on login (optional)

## Data Location

Your vault is stored locally:
- **macOS**: `~/Library/Application Support/AgentVault/`
- **Windows**: `%APPDATA%/AgentVault/`
- **Linux**: `~/.config/AgentVault/`

**Backup this folder!** If you lose it, your credentials are gone.

## Uninstall

1. Quit AgentVault
2. Delete app
3. (Optional) Delete data folder to remove all credentials

## Security Notes

- **No password recovery** — Don't forget your master password
- **No cloud sync** — Everything stays on your machine
- **Backup required** — We don't backup your data

---

Built with Electron
