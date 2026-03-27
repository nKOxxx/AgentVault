# IronVault Desktop - Quick Start

## Run in Development Mode (No Build Required)

```bash
cd desktop
./dev.sh
```

This starts the desktop app immediately without building.

## Build Distribution App

### Prerequisites
- Node.js 18+
- macOS: Xcode Command Line Tools
- Windows: Windows Build Tools

### Build
```bash
cd desktop
./build.sh
```

Output will be in `dist/`:
- **macOS**: `IronVault-1.2.0.dmg`
- **Windows**: `IronVault Setup 1.2.0.exe`
- **Linux**: `IronVault-1.2.0.AppImage`

## What Users See

1. **Install app** — Double-click DMG/EXE/AppImage
2. **Launch** — App appears in Applications/Start menu
3. **Tray icon** — 🔐 icon in menu bar/system tray
4. **Window** — Native app window (not browser)
5. **Quit** — Cmd+Q or right-click tray → Quit

## Data Storage

Vault data stored in OS-standard location:
- macOS: `~/Library/Application Support/IronVault/`
- Windows: `%APPDATA%\IronVault\`
- Linux: `~/.config/IronVault/`

No files in app directory — fully portable.
