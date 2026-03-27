#!/usr/bin/env node

/**
 * IronVault CLI
 *
 * Securely fetch credentials from IronVault without exposing them
 * in chat, logs, or terminal history.
 *
 * Usage:
 *   ironvault status                    — Check vault status
 *   ironvault list                      — List stored keys (metadata only)
 *   ironvault get <name-or-id>          — Fetch key value (stdout, for piping)
 *   ironvault get <name-or-id> --env    — Export as ENV variable
 *   ironvault get <name-or-id> --json   — Output as JSON
 *   ironvault env <name> <VAR_NAME>     — Set env var for current shell
 *   ironvault share <id>                — Share key to connected agent
 *   ironvault share-all                 — Share all unshared keys
 *
 * The CLI communicates over localhost only. Key values are fetched via
 * WebSocket and never written to disk, logs, or shell history.
 *
 * For agent integration:
 *   SUPABASE_KEY=$(ironvault get "Supabase Prod" --silent)
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

// Config
const VAULT_PORT = process.env.IRONVAULT_PORT || 8765;
const WS_PORT = process.env.IRONVAULT_WS_PORT || 8766;
const VAULT_URL = `http://127.0.0.1:${VAULT_PORT}`;
const WS_URL = `ws://127.0.0.1:${WS_PORT}`;
const TOKEN_PATH = process.env.IRONVAULT_TOKEN_PATH || path.join(__dirname, '.ws-token');

// Flags
const args = process.argv.slice(2);
const silent = args.includes('--silent') || args.includes('-s');
const jsonOutput = args.includes('--json') || args.includes('-j');
const envOutput = args.includes('--env') || args.includes('-e');
const command = args.find(a => !a.startsWith('-'));
const commandArgs = args.filter(a => !a.startsWith('-')).slice(1);

// ============================================
// HTTP helpers (no external deps needed)
// ============================================

function httpGet(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, VAULT_URL);
    http.get(url.toString(), (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    }).on('error', reject);
  });
}

function httpPost(urlPath, body = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, VAULT_URL);
    const payload = JSON.stringify(body);
    const req = http.request(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ============================================
// WebSocket key fetch (secure, in-memory only)
// ============================================

function loadWsToken() {
  try {
    return fs.readFileSync(TOKEN_PATH, 'utf8').trim();
  } catch {
    return null;
  }
}

function fetchKeyViaWs(keyId) {
  return new Promise((resolve, reject) => {
    const token = loadWsToken();
    if (!token) {
      reject(new Error('WebSocket token not found. Is IronVault running?'));
      return;
    }

    const ws = new WebSocket(WS_URL);
    let timeout;

    ws.on('open', () => {
      // Authenticate
      ws.send(JSON.stringify({ type: 'auth', token }));
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'auth_success') {
          // Authenticated — request the key
          ws.send(JSON.stringify({ type: 'get_key', keyId }));
          timeout = setTimeout(() => {
            ws.close();
            reject(new Error('Timeout waiting for key data'));
          }, 10000);
        }

        if (msg.type === 'auth_failed') {
          ws.close();
          reject(new Error('WebSocket authentication failed. Token may be stale.'));
        }

        if (msg.type === 'key_data') {
          clearTimeout(timeout);
          // Send confirmation
          ws.send(JSON.stringify({
            type: 'key_received',
            keyId: msg.keyId,
            keyName: msg.data.name,
            agentName: 'ironvault-cli'
          }));
          ws.close();
          resolve(msg.data);
        }

        if (msg.type === 'error') {
          clearTimeout(timeout);
          ws.close();
          reject(new Error(msg.message || 'Unknown error'));
        }
      } catch (e) {
        clearTimeout(timeout);
        ws.close();
        reject(e);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      if (err.code === 'ECONNREFUSED') {
        reject(new Error('IronVault not running on localhost:' + WS_PORT));
      } else {
        reject(err);
      }
    });

    ws.on('close', () => {
      clearTimeout(timeout);
    });
  });
}

// ============================================
// Find key by name or ID
// ============================================

async function findKeyId(nameOrId) {
  const res = await httpGet('/api/keys');
  if (res.status === 401) {
    throw new Error('Vault is locked. Unlock via the web UI first.');
  }
  if (res.status !== 200) {
    throw new Error('Failed to list keys: ' + JSON.stringify(res.data));
  }

  const keys = res.data;

  // Try exact ID match first
  const byId = keys.find(k => k.id === nameOrId);
  if (byId) return byId;

  // Try exact name match (case-insensitive)
  const byName = keys.find(k => k.name.toLowerCase() === nameOrId.toLowerCase());
  if (byName) return byName;

  // Try partial name match
  const partial = keys.filter(k => k.name.toLowerCase().includes(nameOrId.toLowerCase()));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new Error(`Ambiguous key name "${nameOrId}". Matches:\n` +
      partial.map(k => `  ${k.id}  ${k.name} (${k.service})`).join('\n'));
  }

  throw new Error(`Key not found: "${nameOrId}"`);
}

// ============================================
// Commands
// ============================================

async function cmdStatus() {
  try {
    const res = await httpGet('/api/status');
    const s = res.data;

    if (jsonOutput) {
      process.stdout.write(JSON.stringify(s, null, 2) + '\n');
      return;
    }

    console.log('IronVault Status');
    console.log('─────────────────');
    console.log(`  Initialized:  ${s.initialized ? 'yes' : 'no'}`);
    console.log(`  Unlocked:     ${s.unlocked ? 'yes' : 'no'}`);
    console.log(`  Keys stored:  ${s.keyCount}/${s.maxKeys}`);
    console.log(`  Agent:        ${s.connected ? 'connected' : 'not connected'}`);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      console.error('IronVault is not running.');
      process.exit(1);
    }
    throw err;
  }
}

async function cmdList() {
  const res = await httpGet('/api/keys');
  if (res.status === 401) {
    console.error('Vault is locked. Unlock via the web UI first.');
    process.exit(1);
  }

  const keys = res.data;

  if (jsonOutput) {
    // Strip any sensitive data, output metadata only
    const safe = keys.map(k => ({
      id: k.id,
      name: k.name,
      service: k.service,
      shared: !!k.shared_with,
      needs_rotation: k.needs_rotation,
      created_at: k.created_at
    }));
    process.stdout.write(JSON.stringify(safe, null, 2) + '\n');
    return;
  }

  if (keys.length === 0) {
    console.log('No keys stored.');
    return;
  }

  console.log('ID                                Name                    Service         Shared');
  console.log('────────────────────────────────  ──────────────────────  ──────────────  ──────');
  for (const k of keys) {
    const id = k.id.substring(0, 32).padEnd(32);
    const name = k.name.substring(0, 22).padEnd(22);
    const service = (k.service || '-').substring(0, 14).padEnd(14);
    const shared = k.shared_with ? 'yes' : 'no';
    console.log(`${id}  ${name}  ${service}  ${shared}`);
  }
  console.log(`\n${keys.length} key(s)`);
}

async function cmdGet(nameOrId) {
  if (!nameOrId) {
    console.error('Usage: ironvault get <name-or-id>');
    process.exit(1);
  }

  // Find the key metadata
  const keyMeta = await findKeyId(nameOrId);

  // Fetch the actual value via WebSocket (never via REST)
  const keyData = await fetchKeyViaWs(keyMeta.id);

  if (jsonOutput) {
    process.stdout.write(JSON.stringify({
      name: keyData.name,
      service: keyData.service,
      value: keyData.value
    }, null, 2) + '\n');
    return;
  }

  if (envOutput) {
    // Output as export statement for eval
    const varName = keyData.name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .replace(/_+/g, '_');
    process.stdout.write(`export ${varName}='${keyData.value.replace(/'/g, "'\\''")}'`);
    return;
  }

  // Default: raw value only (for piping)
  // This is the key use case: SUPABASE_KEY=$(ironvault get "Supabase Prod")
  process.stdout.write(keyData.value);
}

async function cmdEnv(nameOrId, varName) {
  if (!nameOrId) {
    console.error('Usage: ironvault env <name-or-id> <VAR_NAME>');
    process.exit(1);
  }

  const keyMeta = await findKeyId(nameOrId);
  const keyData = await fetchKeyViaWs(keyMeta.id);

  const envName = varName || keyData.name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_');

  process.stdout.write(`export ${envName}='${keyData.value.replace(/'/g, "'\\''")}'`);
}

async function cmdShare(keyId) {
  if (!keyId) {
    console.error('Usage: ironvault share <key-id-or-name>');
    process.exit(1);
  }

  const keyMeta = await findKeyId(keyId);
  const res = await httpPost(`/api/keys/${keyMeta.id}/share`);

  if (res.status === 200) {
    if (!silent) console.log(`Shared "${keyMeta.name}" with connected agent.`);
  } else {
    console.error(`Share failed: ${res.data.error || 'Unknown error'}`);
    process.exit(1);
  }
}

async function cmdShareAll() {
  const res = await httpPost('/api/keys/share-all');
  if (res.status === 200) {
    if (!silent) console.log(`Shared ${res.data.shared || 0} key(s) with connected agent.`);
  } else {
    console.error(`Share failed: ${res.data.error || 'Unknown error'}`);
    process.exit(1);
  }
}

// ============================================
// Main
// ============================================

async function main() {
  try {
    switch (command) {
      case 'status':
      case 's':
        await cmdStatus();
        break;

      case 'list':
      case 'ls':
      case 'l':
        await cmdList();
        break;

      case 'get':
      case 'g':
        await cmdGet(commandArgs[0]);
        break;

      case 'env':
      case 'e':
        await cmdEnv(commandArgs[0], commandArgs[1]);
        break;

      case 'share':
        await cmdShare(commandArgs[0]);
        break;

      case 'share-all':
        await cmdShareAll();
        break;

      case 'help':
      case '-h':
      case '--help':
      case undefined:
        console.log(`
IronVault CLI — Secure credential access for agents

Usage:
  ironvault status                      Check vault status
  ironvault list                        List stored keys (no values shown)
  ironvault get <name-or-id>            Output key value to stdout (for piping)
  ironvault get <name-or-id> --json     Output as JSON
  ironvault get <name-or-id> --env      Output as export statement
  ironvault env <name> [VAR_NAME]       Output export VAR_NAME=value
  ironvault share <name-or-id>          Share key to connected agent
  ironvault share-all                   Share all unshared keys

Flags:
  --silent, -s    Suppress non-essential output
  --json, -j      Output as JSON
  --env, -e       Output as shell export

Examples:
  # Pipe key directly into a command (value never shown)
  SUPABASE_KEY=$(ironvault get "Supabase Prod")

  # Load into current shell
  eval $(ironvault env "OpenAI" OPENAI_API_KEY)

  # List all keys
  ironvault list --json | jq '.[].name'

  # Use in scripts
  curl -H "apikey: $(ironvault get supabase)" https://...

Security:
  - Key values fetched via WebSocket (localhost only)
  - Values never written to disk or logs
  - Use command substitution $() to avoid shell history exposure
  - Vault must be unlocked via web UI before CLI access
`);
        break;

      default:
        console.error(`Unknown command: ${command}\nRun 'ironvault --help' for usage.`);
        process.exit(1);
    }
  } catch (err) {
    if (!silent) console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
