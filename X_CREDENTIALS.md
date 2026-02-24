# AgentVault X/Twitter Credentials Format

## Supported X API Credential Types

When adding X (Twitter) credentials, you can provide any combination of:

### OAuth 1.0a (Full Access)
- **API Key** (Consumer Key)
- **API Secret** (Consumer Secret)  
- **Access Token**
- **Access Token Secret**

### OAuth 2.0 (App-Only Access)
- **Bearer Token**
- **Client ID**
- **Client Secret**

## Minimum Required for Posting

For basic automation (posting tweets), you need:
- **Bearer Token** OR
- **Access Token + Access Token Secret** (with tweet permissions)

For full automation (post + reply + like + follow):
- All 4 OAuth 1.0a credentials (Consumer Key/Secret + Access Token/Secret)

## Adding Credentials

1. Open AgentVault at http://localhost:8765
2. Unlock vault
3. Click "+ Add New Key"
4. Select "X (Twitter)" from Social Media category
5. Fill in the fields you have (minimum one credential)
6. Check "Share with Ares immediately"
7. Click "Save Key"

All credentials are encrypted and stored locally.
