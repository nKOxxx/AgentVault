#!/usr/bin/env node
/**
 * IronVault MCP Server
 *
 * Exposes IronVault as a Model Context Protocol server over stdio.
 * Connects to the local IronVault HTTP API (default: http://127.0.0.1:8765).
 *
 * Works with:
 *   - Claude Desktop (claude_desktop_config.json)
 *   - Claude Code    (claude mcp add ironvault ...)
 *   - Any MCP-compatible client
 *
 * No extra dependencies — uses Node.js built-in modules only.
 *
 * Usage:
 *   node ironvault-mcp.js                     # default port 8765
 *   IRONVAULT_PORT=8765 node ironvault-mcp.js
 */

'use strict';

const http = require('http');
const readline = require('readline');

const IRONVAULT_BASE = `http://127.0.0.1:${process.env.IRONVAULT_PORT || 8765}`;
const SERVER_NAME    = 'ironvault';
const SERVER_VERSION = '1.5.0';

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function apiRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, IRONVAULT_BASE);
    const options = {
      hostname : url.hostname,
      port     : url.port,
      path     : url.pathname + url.search,
      method,
      headers  : { 'Content-Type': 'application/json' },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try   { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name        : 'vault_status',
    description : 'Check whether the IronVault is initialized and unlocked. ' +
                  'Call this first to confirm the vault is ready before requesting credentials.',
    inputSchema : { type: 'object', properties: {}, required: [] },
  },
  {
    name        : 'list_credentials',
    description : 'List all stored credentials by name and service type. ' +
                  'Returns metadata only — no secret values are returned. ' +
                  'Use this to discover which credentials are available, then call get_credential to retrieve a value.',
    inputSchema : { type: 'object', properties: {}, required: [] },
  },
  {
    name        : 'get_credential',
    description : 'Retrieve the secret value of a stored credential. ' +
                  'The vault must be unlocked. You can provide either the credential ID or its name. ' +
                  'If multiple credentials match the name, all matches are returned.',
    inputSchema : {
      type       : 'object',
      properties : {
        id   : { type: 'string', description: 'Exact credential ID (from list_credentials)' },
        name : { type: 'string', description: 'Credential name to search for (partial match, case-insensitive)' },
      },
    },
  },
  {
    name        : 'search_credentials',
    description : 'Search credentials by name or service type. Returns metadata (no secret values). ' +
                  'Useful for finding the right credential ID before calling get_credential.',
    inputSchema : {
      type       : 'object',
      properties : {
        query: {
          type        : 'string',
          description : 'Search term matched against credential name and service (case-insensitive)',
        },
      },
      required: ['query'],
    },
  },
];

// ─── Tool handlers ────────────────────────────────────────────────────────────

async function handleVaultStatus() {
  try {
    const res = await apiRequest('GET', '/api/status');
    const s   = res.body;
    if (!s.initialized) {
      return text('IronVault is not initialized yet. Open the vault UI and create a master password first.');
    }
    if (!s.unlocked) {
      return text(
        'IronVault is locked. Open the IronVault app and unlock it with your master password, then try again.'
      );
    }
    return text(
      `IronVault is unlocked and ready.\n` +
      `• Stored credentials: ${s.keyCount} / ${s.maxKeys}\n` +
      `• Agent connected via WebSocket: ${s.connected ? 'yes' : 'no'}`
    );
  } catch (e) {
    return error(
      `Could not reach IronVault at ${IRONVAULT_BASE}. ` +
      `Make sure IronVault is running (npm start or open the desktop app). Error: ${e.message}`
    );
  }
}

async function handleListCredentials() {
  try {
    const statusRes = await apiRequest('GET', '/api/status');
    if (!statusRes.body.unlocked) {
      return text('The vault is locked. Please unlock IronVault first.');
    }
    const res  = await apiRequest('GET', '/api/keys');
    const keys = Array.isArray(res.body) ? res.body : [];
    if (keys.length === 0) {
      return text('No credentials stored in the vault yet.');
    }
    const lines = keys.map((k) => {
      const rotation = k.needs_rotation ? ' ⚠️ rotation due' : '';
      const shared   = k.is_shared ? ` (shared with ${k.shared_with})` : '';
      return `• [${k.id}] ${k.name} — ${k.service || 'custom'}${shared}${rotation}`;
    });
    return text(`${keys.length} credential(s) stored:\n\n${lines.join('\n')}`);
  } catch (e) {
    return error(`Failed to list credentials: ${e.message}`);
  }
}

async function handleGetCredential({ id, name }) {
  if (!id && !name) {
    return error('Provide either "id" or "name" to look up a credential.');
  }
  try {
    // If we have a direct ID, fetch it immediately
    if (id) {
      const res = await apiRequest('GET', `/api/keys/${id}/value`);
      if (res.status !== 200) {
        return error(res.body?.error || `Credential not found (id: ${id})`);
      }
      const k = res.body;
      return text(`Credential: ${k.name}\nService: ${k.service || 'custom'}\nValue: ${k.value}`);
    }

    // Search by name
    const listRes = await apiRequest('GET', '/api/keys');
    const keys    = Array.isArray(listRes.body) ? listRes.body : [];
    const matches = keys.filter(
      (k) => k.name?.toLowerCase().includes(name.toLowerCase())
    );

    if (matches.length === 0) {
      return error(
        `No credential found matching "${name}".\n` +
        `Available credentials: ${keys.map((k) => k.name).join(', ') || 'none'}`
      );
    }

    // Fetch values for all matches
    const results = await Promise.all(
      matches.map(async (k) => {
        const r = await apiRequest('GET', `/api/keys/${k.id}/value`);
        if (r.status !== 200) return `• ${k.name}: [error: ${r.body?.error}]`;
        return `• ${r.body.name} (${r.body.service || 'custom'}): ${r.body.value}`;
      })
    );

    const header = matches.length > 1
      ? `Found ${matches.length} credentials matching "${name}":`
      : `Found credential "${matches[0].name}":`;

    return text(`${header}\n\n${results.join('\n')}`);
  } catch (e) {
    return error(`Failed to retrieve credential: ${e.message}`);
  }
}

async function handleSearchCredentials({ query }) {
  if (!query) return error('A search query is required.');
  try {
    const statusRes = await apiRequest('GET', '/api/status');
    if (!statusRes.body.unlocked) {
      return text('The vault is locked. Please unlock IronVault first.');
    }
    const res     = await apiRequest('GET', '/api/keys');
    const keys    = Array.isArray(res.body) ? res.body : [];
    const q       = query.toLowerCase();
    const matches = keys.filter(
      (k) =>
        k.name?.toLowerCase().includes(q) ||
        k.service?.toLowerCase().includes(q)
    );
    if (matches.length === 0) {
      return text(
        `No credentials match "${query}".\n` +
        `Available services: ${[...new Set(keys.map((k) => k.service).filter(Boolean))].join(', ') || 'none'}`
      );
    }
    const lines = matches.map(
      (k) => `• [${k.id}] ${k.name} — ${k.service || 'custom'}`
    );
    return text(
      `${matches.length} credential(s) match "${query}":\n\n${lines.join('\n')}\n\n` +
      `Use get_credential with an id or name to retrieve the secret value.`
    );
  } catch (e) {
    return error(`Search failed: ${e.message}`);
  }
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function text(message) {
  return { content: [{ type: 'text', text: message }] };
}

function error(message) {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

// ─── MCP JSON-RPC protocol over stdio ────────────────────────────────────────

function respond(id, result) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, result });
  process.stdout.write(msg + '\n');
}

function respondError(id, code, message) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
  process.stdout.write(msg + '\n');
}

// Returns a Promise (used for pending tracking)
async function handleMessage(raw) {
  let req;
  try { req = JSON.parse(raw); }
  catch { return; } // ignore malformed input

  const { id, method, params } = req;

  switch (method) {
    case 'initialize':
      respond(id, {
        protocolVersion : '2024-11-05',
        capabilities    : { tools: {} },
        serverInfo      : { name: SERVER_NAME, version: SERVER_VERSION },
      });
      break;

    case 'notifications/initialized':
      // No response needed for notifications
      break;

    case 'tools/list':
      respond(id, { tools: TOOLS });
      break;

    case 'tools/call': {
      const toolName = params?.name;
      const args     = params?.arguments || {};
      let result;

      try {
        switch (toolName) {
          case 'vault_status':         result = await handleVaultStatus();               break;
          case 'list_credentials':     result = await handleListCredentials();           break;
          case 'get_credential':       result = await handleGetCredential(args);        break;
          case 'search_credentials':   result = await handleSearchCredentials(args);    break;
          default:
            result = error(`Unknown tool: "${toolName}"`);
        }
      } catch (e) {
        result = error(`Unexpected error: ${e.message}`);
      }

      respond(id, result);
      break;
    }

    case 'ping':
      respond(id, {});
      break;

    default:
      if (id != null) {
        respondError(id, -32601, `Method not found: ${method}`);
      }
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const rl = readline.createInterface({
  input    : process.stdin,
  terminal : false,
});

// Track pending async operations so we don't exit mid-response
let pending = 0;
let stdinClosed = false;

function checkExit() {
  if (stdinClosed && pending === 0) process.exit(0);
}

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  pending++;
  handleMessage(trimmed).finally(() => {
    pending--;
    checkExit();
  });
});

rl.on('close', () => {
  stdinClosed = true;
  checkExit();
});

// Silence any unhandled errors so they don't corrupt the stdio stream
process.on('uncaughtException', (e) => {
  process.stderr.write(`[IronVault MCP] Unhandled error: ${e.message}\n`);
});

process.stderr.write(`[IronVault MCP] Server started. Connecting to ${IRONVAULT_BASE}\n`);
