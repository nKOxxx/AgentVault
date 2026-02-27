# Code Signing Guide for AgentVault

## macOS Code Signing

To distribute AgentVault without macOS security warnings, you need to code sign the app with an Apple Developer ID.

## Prerequisites

1. **Apple Developer Account** ($99/year)
   - Sign up at: https://developer.apple.com/programs/

2. **Developer ID Certificate**
   - Request from Apple Developer Portal
   - Install in your Mac's Keychain

## Setup

### 1. Install Certificate

After Apple approves your Developer ID:
1. Download certificate from Developer Portal
2. Double-click to install in Keychain Access
3. Trust the certificate

### 2. Environment Variables

Set these before building:

```bash
export CSC_NAME="Your Name (Team ID)"
export CSC_IDENTITY_AUTO_DISCOVERY=true
```

Or use specific certificate:
```bash
export CSC_NAME="Developer ID Application: Your Name (TEAMID)"
```

### 3. Build Signed App

```bash
cd desktop
npm run build:signed
```

## Notarization (Required for macOS 10.15+)

Apple requires notarization for apps outside the App Store.

### Setup Notarization

1. Create app-specific password:
   - https://appleid.apple.com/ → Security → App-Specific Passwords

2. Set environment variables:
```bash
export APPLE_ID="your-email@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="your-app-password"
export APPLE_TEAM_ID="YOURTEAMID"
```

3. Build with notarization:
```bash
npm run build:mac
```

Electron-builder will automatically notarize if credentials are set.

## Alternative: Self-Signing (Testing Only)

For local testing without Apple Developer account:

```bash
# Generate self-signed certificate (valid 365 days)
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes

# Sign the app (manual, not for distribution)
codesign --force --deep --sign - /path/to/AgentVault.app
```

⚠️ **Self-signed apps still show security warnings on other Macs.**

## Current Status

**AgentVault v1.3.0 is NOT code signed.**

Users will see:
> "AgentVault cannot be opened because the developer cannot be verified"

**Workaround for users:**
1. Right-click AgentVault → Open
2. Click "Open" in dialog
3. Or: System Settings → Privacy & Security → "Open Anyway"

## Recommendation

**For public distribution:** Get Apple Developer account and code sign.

**For personal/friends use:** Current unsigned build is fine (users just need to right-click → Open).

## Resources

- Apple Developer Program: https://developer.apple.com/programs/
- Code Signing Guide: https://developer.apple.com/support/code-signing/
- Electron Code Signing: https://www.electron.build/code-signing

---

**Note:** Code signing does NOT affect app security. It only verifies the developer's identity to macOS.
