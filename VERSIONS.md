# AgentVault — Three Distribution Versions

## 1. Desktop App (Recommended for Users) 🏆

**Location:** `desktop/`

**What it is:** Native desktop application

**Install:** Download `.dmg` (Mac), `.exe` (Windows), or `.AppImage` (Linux)

**Features:**
- ✅ Native window (not browser)
- ✅ Menu bar / system tray icon
- ✅ Auto-starts on login (optional)
- ✅ Single-file installer
- ✅ Data in OS app directory
- ✅ Background operation

**For:** End users who want a normal app experience

**Quick start:**
```bash
cd desktop
./dev.sh  # Test without building
```

---

## 2. Standalone Web (For Developers) 🔧

**Location:** `standalone/agentvault/`

**What it is:** Portable web server

**Install:** `npm install && node server.js`

**Features:**
- ✅ Works from any directory
- ✅ Not tied to .openclaw
- ✅ No browser auto-open
- ✅ Clean, minimal dependencies

**For:** Developers who want to integrate or customize

**Quick start:**
```bash
cd standalone/agentvault
./install.sh
node server.js
# Open http://localhost:8765 manually
```

---

## 3. Full Dev Version (For You) 💻

**Location:** Root of repo

**What it is:** Development environment

**Install:** Already set up in `~/.openclaw/workspace/`

**Features:**
- ✅ Auto-starts OpenClaw listener
- ✅ Hot reload during development
- ✅ Full debugging output
- ✅ All features enabled

**For:** Active development and testing

**Quick start:**
```bash
cd ~/.openclaw/workspace/projects/AgentVault
node server.js
```

---

## Which Should You Use?

| Use Case | Version |
|----------|---------|
| Give to a friend | **Desktop App** |
| Install on work machine | **Desktop App** |
| Quick test | **Standalone** |
| Development | **Full Dev** |
| CI/CD integration | **Standalone** |

---

## Building Desktop App

```bash
cd desktop
npm install
npm run build:mac    # macOS
npm run build:win    # Windows  
npm run build:linux  # Linux
```

Output in `desktop/dist/`
