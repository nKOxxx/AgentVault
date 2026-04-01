# Changelog

All notable changes to IronVault will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0] - 2026-04-01

### Security

- **BREAKING:** Password requirements increased to 12+ characters with mandatory uppercase, lowercase, number, and special character
- `/api/reset` endpoint now requires vault to be unlocked (previously allowed unauthenticated reset)
- `/api/config` endpoint now requires vault to be unlocked and properly decrypts stored config
- Added Content-Security-Policy header to prevent XSS and code injection
- Added security headers: X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy, Permissions-Policy
- Added HTML escaping for credential names in UI to prevent stored XSS attacks
- Removed console.log statements that leaked sensitive metadata (encryption key status, encrypted value lengths)
- Audit log now records vault reset events before data deletion

### Added

- **Audit log viewer** — new "Audit Log" tab in web UI with formatted event history
- **Security status bar** — shows encryption status, auto-lock timer, and agent connection
- **Keyboard shortcuts** — `Ctrl+N` (add credential), `Ctrl+L` (lock vault), `Escape` (close modal)
- **Agent connection indicator** — real-time status polling for WebSocket agent connection
- **Help tooltips** — password requirements, encryption details shown during vault setup
- **Comprehensive README** — full documentation with security model, user guide, API reference, troubleshooting
- **CHANGELOG.md** — this file
- **End-to-end test suite** — encryption, API, security validation tests

### Changed

- Password strength meter updated to reflect new 12-character minimum and complexity requirements
- Vault setup screen now displays encryption algorithm details (AES-256-GCM, PBKDF2 iterations)
- Tab-based navigation in vault screen (Credentials / Audit Log)

### Fixed

- LLM config endpoint now properly handles encrypted data on read
- Share function no longer logs debug information to console

## [1.4.0] - 2026-03-28

### Added

- WebSocket authentication with 32-byte random token
- Key rotation tracking with configurable intervals
- Auto-share on credential add (optional)
- Share all unshared credentials in one action
- Unshare/revoke credential sharing
- Credential editing and rotation support
- Rate limiting on unlock attempts (5 attempts / 15 min)
- Input validation middleware (2000 char limit)
- CORS restricted to localhost origins

### Changed

- Express upgraded to v5
- Share status tracking (pending, shared, error)

## [1.3.0] - 2026-03-15

### Added

- Desktop app (Electron) with native macOS menubar integration
- System tray with quick access menu
- Auto-lock after 15 minutes of inactivity
- File permissions (0o600) on vault files
- Context isolation and disabled node integration (Electron security)
- Credential receiver HTTP endpoint for desktop app
- Security audit completed (Score: 9.5/10)

### Security

- Electron: nodeIntegration disabled, contextIsolation enabled
- External links open in system browser (not in-app)
- Preload bridge exposes minimal API surface

## [1.2.0] - 2026-03-01

### Added

- Encrypted audit logging
- WebSocket integration for AI agent credential sharing
- Share status badges in UI
- Service-specific credential templates (OpenAI, Anthropic, GitHub, Render, X/Twitter)

## [1.1.0] - 2026-02-15

### Added

- Web UI with dark theme
- Password strength indicator
- Toast notifications
- Modal-based credential management

## [1.0.0] - 2026-02-01

### Added

- Initial release
- AES-256-GCM encryption with PBKDF2 key derivation
- SQLite-backed credential storage
- CLI interface
- HTTP API server
- Master password authentication
