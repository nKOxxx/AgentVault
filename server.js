const express = require('express');
const WebSocket = require('ws');
const crypto = require('crypto');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');

// Security: Use Node native crypto (AES-256-GCM)
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

const app = express();
const PORT = process.env.PORT || 8765;
const WS_PORT = process.env.WS_PORT || 8766;

// ============================================
// REVERSE PROXY / HTTPS SUPPORT
// ============================================

// Trust proxy headers when behind reverse proxy (nginx, traefik, etc.)
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', true);
  console.log('[IronVault] Trusting proxy headers (X-Forwarded-For, etc.)');
}

// Security: Force HTTPS redirect in production
app.use((req, res, next) => {
  if (process.env.FORCE_HTTPS === 'true' && !req.secure) {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

// ============================================
// WEBSOCKET AUTHENTICATION
// ============================================

// Generate or load WebSocket auth token
const WS_TOKEN_PATH = path.join(__dirname, '.ws-token');
let WS_AUTH_TOKEN;

function generateOrLoadWsToken() {
  if (fs.existsSync(WS_TOKEN_PATH)) {
    WS_AUTH_TOKEN = fs.readFileSync(WS_TOKEN_PATH, 'utf8').trim();
  } else {
    WS_AUTH_TOKEN = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(WS_TOKEN_PATH, WS_AUTH_TOKEN, { mode: 0o600 });
    console.log('[IronVault] Generated new WebSocket auth token');
  }
  return WS_AUTH_TOKEN;
}

WS_AUTH_TOKEN = generateOrLoadWsToken();

// Track authenticated clients
const authenticatedClients = new Set();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Security: CORS - Only allow localhost origins
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
    res.setHeader('Access-Control-Allow-Origin', origin || 'http://localhost');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  next();
});

// Security: Remove server header
app.disable('x-powered-by');

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ws://localhost:* ws://127.0.0.1:*");
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

/**
 * Validate password strength
 * @param {string} password
 * @returns {{ valid: boolean, message: string }}
 */
function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required' };
  }
  if (password.length < 12) {
    return { valid: false, message: 'Password must be at least 12 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character' };
  }
  return { valid: true, message: 'Password meets requirements' };
}

// Input validation middleware
function validateInput(fields) {
  return (req, res, next) => {
    for (const field of fields) {
      const value = req.body[field];
      if (value !== undefined && typeof value === 'string' && value.length > 2000) {
        return res.status(400).json({ error: 'Input too long' });
      }
    }
    next();
  };
}

const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 5; // 5 attempts per window

function checkRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  if (!rateLimits.has(ip)) {
    rateLimits.set(ip, []);
  }
  
  const attempts = rateLimits.get(ip);
  // Remove old attempts
  const recentAttempts = attempts.filter(time => time > windowStart);
  rateLimits.set(ip, recentAttempts);
  
  if (recentAttempts.length >= RATE_LIMIT_MAX) {
    return false;
  }
  
  recentAttempts.push(now);
  return true;
}

function rateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ 
      error: 'Too many attempts. Please try again in 15 minutes.',
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 1000)
    });
  }
  
  next();
}

// Database setup
const DB_PATH = path.join(__dirname, 'vault.db');
const AUDIT_LOG_PATH = path.join(__dirname, 'audit.log');
let db;
let encryptionKey = null;
let maxKeys = 20;

// ============================================
// AUDIT LOGGING (ENCRYPTED)
// ============================================

/**
 * Log security events to encrypted audit log
 * @param {string} event - Event type (unlock, key_added, key_accessed, etc.)
 * @param {object} details - Event details
 */
function logAudit(event, details = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    event,
    ...details
  };
  
  // Always log to console for visibility
  console.log(`[AUDIT] ${event}:`, JSON.stringify(details));
  
  // Encrypt audit log if vault is unlocked
  if (encryptionKey) {
    try {
      const encrypted = encrypt(JSON.stringify(logEntry), encryptionKey);
      fs.appendFileSync(AUDIT_LOG_PATH, encrypted + '\n');
    } catch (e) {
      console.error('[AUDIT] Failed to encrypt audit log:', e.message);
    }
  } else {
    // Vault locked - store plaintext temporarily (will be encrypted on next unlock)
    fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(logEntry) + '\n');
  }
}

/**
 * Get recent audit events (decrypts if necessary)
 * @param {number} limit - Number of events to return
 * @returns {Array} Audit events
 */
function getAuditLog(limit = 100) {
  if (!fs.existsSync(AUDIT_LOG_PATH)) {
    return [];
  }
  
  const lines = fs.readFileSync(AUDIT_LOG_PATH, 'utf8')
    .trim()
    .split('\n')
    .filter(line => line)
    .map(line => {
      try {
        // Try to decrypt first (if encrypted)
        if (encryptionKey && line.length > 64) {
          // Likely encrypted (hex string longer than typical JSON)
          try {
            const decrypted = decrypt(line, encryptionKey);
            return JSON.parse(decrypted);
          } catch (e) {
            // Decryption failed, try parsing as plaintext
            return JSON.parse(line);
          }
        }
        // Plaintext (legacy or vault was locked)
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    })
    .filter(entry => entry !== null);
  
  return lines.slice(-limit);
}

// Initialize database
function initDB() {
  db = new sqlite3.Database(DB_PATH);
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS vault_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      service TEXT,
      url TEXT,
      encrypted_value TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_rotated DATETIME DEFAULT CURRENT_TIMESTAMP,
      rotation_interval INTEGER DEFAULT 90,
      shared_with TEXT DEFAULT NULL,
      share_status TEXT DEFAULT 'none'
    )`);
    
    // Migration: Add shared_with column if it doesn't exist
    db.run(`ALTER TABLE keys ADD COLUMN shared_with TEXT DEFAULT NULL`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.log('Note: shared_with column may already exist');
      }
    });
    
    // Migration: Add share_status column if it doesn't exist
    db.run(`ALTER TABLE keys ADD COLUMN share_status TEXT DEFAULT 'none'`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.log('Note: share_status column may already exist');
      }
    });
  });
}

// ============================================
// ENCRYPTION (Node Native Crypto - AES-256-GCM)
// ============================================

/**
 * Encrypt text using AES-256-GCM
 * @param {string} text - Plaintext to encrypt
 * @param {string} keyHex - Encryption key as hex string
 * @returns {string} Encrypted data as hex string (iv + ciphertext + authTag)
 */
function encrypt(text, keyHex) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = Buffer.from(keyHex, 'hex');
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let ciphertext = cipher.update(text, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Store as: iv + authTag + ciphertext
  return iv.toString('hex') + authTag.toString('hex') + ciphertext;
}

/**
 * Decrypt ciphertext using AES-256-GCM
 * @param {string} encryptedHex - Encrypted data as hex string
 * @param {string} keyHex - Encryption key as hex string
 * @returns {string} Decrypted plaintext
 */
function decrypt(encryptedHex, keyHex) {
  const encrypted = Buffer.from(encryptedHex, 'hex');
  
  // Extract components
  const iv = encrypted.slice(0, IV_LENGTH);
  const authTag = encrypted.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = encrypted.slice(IV_LENGTH + AUTH_TAG_LENGTH);
  
  const key = Buffer.from(keyHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let plaintext = decipher.update(ciphertext, undefined, 'utf8');
  plaintext += decipher.final('utf8');
  
  return plaintext;
}

/**
 * Derive encryption key from password using PBKDF2
 * @param {string} password - User password
 * @param {string} salt - Salt (hex string)
 * @returns {string} Derived key as hex string
 */
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256').toString('hex');
}

/**
 * Generate random salt
 * @returns {string} Random salt as hex string
 */
function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

// Check if vault is initialized
function isVaultInitialized() {
  return new Promise((resolve, reject) => {
    db.get("SELECT value FROM vault_meta WHERE key = 'initialized'", (err, row) => {
      if (err) reject(err);
      resolve(row && row.value === 'true');
    });
  });
}

// Initialize vault with master password
function initializeVault(password) {
  return new Promise((resolve, reject) => {
    const salt = generateSalt();
    const key = deriveKey(password, salt);
    
    db.run("INSERT OR REPLACE INTO vault_meta (key, value) VALUES (?, ?)", ['salt', salt], (err) => {
      if (err) reject(err);
      db.run("INSERT OR REPLACE INTO vault_meta (key, value) VALUES (?, ?)", ['initialized', 'true'], (err) => {
        if (err) reject(err);
        // Store password verification hash
        const verifyToken = encrypt('ironvault-verify', key);
        db.run("INSERT OR REPLACE INTO vault_meta (key, value) VALUES (?, ?)", ['verify_token', verifyToken], (err) => {
          if (err) reject(err);
          encryptionKey = key;
          resolve(key);
        });
      });
    });
  });
}

// Unlock vault
function unlockVault(password) {
  return new Promise((resolve, reject) => {
    db.get("SELECT value FROM vault_meta WHERE key = 'salt'", (err, row) => {
      if (err) reject(err);
      if (!row) reject(new Error('Vault not initialized'));
      
      const salt = row.value;
      const key = deriveKey(password, salt);
      
      // Always verify password using verification token
      db.get("SELECT value FROM vault_meta WHERE key = 'verify_token'", (err, verifyRow) => {
        if (err) return reject(err);
        if (verifyRow) {
          try {
            const result = decrypt(verifyRow.value, key);
            if (result !== 'ironvault-verify') {
              return reject(new Error('Invalid password'));
            }
          } catch (e) {
            return reject(new Error('Invalid password'));
          }
        }
        encryptionKey = key;
        resolve(key);
      });
    });
  });
}

// Get all keys
function getKeys() {
  return new Promise((resolve, reject) => {
    db.all("SELECT id, name, service, url, created_at, last_rotated, rotation_interval, shared_with, share_status FROM keys ORDER BY created_at DESC", (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
}

// Add key
function addKey(name, service, url, value) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomBytes(16).toString('hex');
    const encrypted = encrypt(value, encryptionKey);
    
    db.run(
      "INSERT INTO keys (id, name, service, url, encrypted_value) VALUES (?, ?, ?, ?, ?)",
      [id, name, service, url, encrypted],
      function(err) {
        if (err) reject(err);
        resolve(id);
      }
    );
  });
}

// Get key value (for sharing)
function getKeyValue(id) {
  return new Promise((resolve, reject) => {
    db.get("SELECT name, service, url, encrypted_value FROM keys WHERE id = ?", [id], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      if (!row) {
        reject(new Error('Key not found'));
        return;
      }

      try {
        const value = decrypt(row.encrypted_value, encryptionKey);
        resolve({
          name: row.name,
          service: row.service,
          url: row.url,
          value: value
        });
      } catch (e) {
        reject(new Error('Decryption failed'));
      }
    });
  });
}

// Mark key as shared
function markKeyShared(id, agentName = 'Agent') {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE keys SET shared_with = ?, share_status = 'shared' WHERE id = ?",
      [agentName, id],
      function(err) {
        if (err) reject(err);
        resolve();
      }
    );
  });
}

// Update share status (pending, shared, error)
function updateShareStatus(id, status) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE keys SET share_status = ? WHERE id = ?",
      [status, id],
      function(err) {
        if (err) reject(err);
        resolve();
      }
    );
  });
}

// Unshare key (revoke from agent)
function unshareKey(id) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE keys SET shared_with = NULL, share_status = 'none' WHERE id = ?",
      [id],
      function(err) {
        if (err) reject(err);
        resolve();
      }
    );
  });
}

// Update key (for rotation/editing)
function updateKey(id, name, service, url, value, resetRotation = false) {
  return new Promise((resolve, reject) => {
    const encrypted = encrypt(value, encryptionKey);
    
    let sql, params;
    if (resetRotation) {
      // Reset rotation timer when updating value
      sql = "UPDATE keys SET name = ?, service = ?, url = ?, encrypted_value = ?, shared_with = NULL, last_rotated = CURRENT_TIMESTAMP WHERE id = ?";
      params = [name, service, url, encrypted, id];
    } else {
      // Just update metadata, keep rotation timer
      sql = "UPDATE keys SET name = ?, service = ?, url = ?, encrypted_value = ?, shared_with = NULL WHERE id = ?";
      params = [name, service, url, encrypted, id];
    }
    
    db.run(sql, params, function(err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
}

// Delete key
function deleteKey(id) {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM keys WHERE id = ?", [id], function(err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
}

// Update rotation date
function updateRotation(id) {
  return new Promise((resolve, reject) => {
    db.run("UPDATE keys SET last_rotated = CURRENT_TIMESTAMP WHERE id = ?", [id], function(err) {
      if (err) reject(err);
      resolve();
    });
  });
}

// Count keys
function countKeys() {
  return new Promise((resolve, reject) => {
    db.get("SELECT COUNT(*) as count FROM keys", (err, row) => {
      if (err) reject(err);
      resolve(row.count);
    });
  });
}

// WebSocket server for agent connection
const wss = new WebSocket.Server({ port: WS_PORT });
let agentClient = null;
let pendingShares = new Map(); // Track pending shares

wss.on('connection', (ws, req) => {
  // Security: Check origin - only allow localhost
  const origin = req.headers.origin;
  if (origin && !origin.match(/^https?:\/\/(localhost|127\.0\.0\.1)/)) {
    console.log(`❌ Rejected WebSocket connection from: ${origin}`);
    ws.close(1008, 'Invalid origin');
    return;
  }
  
  console.log('🔌 WebSocket client connected from localhost');
  
  // Track authentication state
  let isAuthenticated = false;
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Handle authentication first
      if (data.type === 'auth') {
        if (data.token === WS_AUTH_TOKEN) {
          isAuthenticated = true;
          authenticatedClients.add(ws);
          agentClient = ws;
          ws.send(JSON.stringify({ type: 'auth_success' }));
          console.log('✅ WebSocket client authenticated');
        } else {
          ws.send(JSON.stringify({ type: 'auth_failed', error: 'Invalid token' }));
          ws.close(1008, 'Authentication failed');
          console.log('❌ WebSocket authentication failed');
        }
        return;
      }
      
      // Reject all other messages until authenticated
      if (!isAuthenticated) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
        return;
      }
      
      console.log('Received from agent:', data.type);
      
      // Handle requests from agent (now authenticated)
      if (data.type === 'get_key') {
        getKeyValue(data.keyId).then(keyData => {
          ws.send(JSON.stringify({
            type: 'key_data',
            keyId: data.keyId,
            data: keyData
          }));
        }).catch(err => {
          ws.send(JSON.stringify({
            type: 'error',
            message: err.message
          }));
        });
      }
      
      // Handle confirmation that key was received
      if (data.type === 'key_received') {
        console.log(`✅ Key received by agent: ${data.keyName}`);
        // Mark key as shared in database
        if (data.keyId) {
          markKeyShared(data.keyId, data.agentName || 'Agent').catch(console.error);
        }
        // Remove from pending
        pendingShares.delete(data.keyId);
      }
    } catch (e) {
      console.error('Invalid message from agent:', e);
    }
  });
  
  ws.on('close', () => {
    console.log('🔌 WebSocket client disconnected');
    authenticatedClients.delete(ws);
    if (agentClient === ws) {
      agentClient = null;
    }
  });
});

// Share key to agent
async function shareToAgent(keyData, keyId) {
  return new Promise((resolve, reject) => {
    if (!agentClient) {
      reject(new Error('External Agent not connected. Please wait for connection or refresh the page.'));
      return;
    }

    // Track pending share
    pendingShares.set(keyId, {
      timestamp: Date.now(),
      retries: 0
    });

    const message = JSON.stringify({
      type: 'shared_secret',
      keyId: keyId,
      timestamp: new Date().toISOString(),
      data: keyData
    });

    agentClient.send(message);
    
    // Wait for confirmation with timeout
    const checkInterval = setInterval(() => {
      const pending = pendingShares.get(keyId);
      if (!pending) {
        // Key was received
        clearInterval(checkInterval);
        resolve();
      } else if (Date.now() - pending.timestamp > 10000) {
        // Timeout after 10 seconds
        clearInterval(checkInterval);
        pendingShares.delete(keyId);
        reject(new Error('Timeout: External Agent did not confirm receipt within 10 seconds'));
      }
    }, 500);
  });
}

// Share all unshared keys
async function shareAllUnshared() {
  if (!agentClient) {
    throw new Error('External Agent not connected');
  }
  
  const keys = await getKeys();
  const unsharedKeys = keys.filter(k => !k.shared_with);
  
  const results = {
    total: unsharedKeys.length,
    success: 0,
    failed: 0,
    errors: []
  };
  
  for (const key of unsharedKeys) {
    try {
      const keyData = await getKeyValue(key.id);
      await shareToAgent(keyData, key.id);
      results.success++;
    } catch (e) {
      results.failed++;
      results.errors.push(`${key.name}: ${e.message}`);
    }
  }
  
  return results;
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get WebSocket auth token (requires vault to be unlocked)
app.get('/api/ws-token', async (req, res) => {
  try {
    if (!encryptionKey) {
      return res.status(401).json({ error: 'Vault locked' });
    }
    
    res.json({
      token: WS_AUTH_TOKEN,
      wsUrl: `ws://localhost:${WS_PORT}`
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/status', async (req, res) => {
  try {
    const initialized = await isVaultInitialized() || false;
    const unlocked = encryptionKey !== null;
    const keyCount = unlocked ? await countKeys() : 0;
    const connected = agentClient !== null && authenticatedClients.has(agentClient);
    
    res.json({
      initialized,
      unlocked,
      keyCount,
      maxKeys,
      connected,
      agentName: 'External Agent'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/init', async (req, res) => {
  try {
    const { password } = req.body;
    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      return res.status(400).json({ error: strength.message });
    }
    
    await initializeVault(password);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/unlock', rateLimitMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }
    await unlockVault(password);
    res.json({ success: true });
  } catch (e) {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.get('/api/keys', async (req, res) => {
  try {
    if (!encryptionKey) {
      return res.status(401).json({ error: 'Vault locked' });
    }
    
    const keys = await getKeys();
    
    // Calculate days until rotation needed
    const now = new Date();
    const keysWithStatus = keys.map(key => {
      const lastRotated = new Date(key.last_rotated);
      const daysSinceRotation = Math.floor((now - lastRotated) / (1000 * 60 * 60 * 24));
      const daysUntilRotation = key.rotation_interval - daysSinceRotation;
      
      return {
        ...key,
        days_since_rotation: daysSinceRotation,
        days_until_rotation: daysUntilRotation,
        needs_rotation: daysUntilRotation <= 7,
        is_shared: !!key.shared_with,
        shared_with: key.shared_with
      };
    });
    
    res.json(keysWithStatus);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/keys', validateInput(['name', 'service', 'url', 'value']), async (req, res) => {
  try {
    if (!encryptionKey) {
      return res.status(401).json({ error: 'Vault locked' });
    }
    
    const keyCount = await countKeys();
    if (keyCount >= maxKeys) {
      return res.status(400).json({ error: `Maximum ${maxKeys} keys allowed` });
    }
    
    const { name, service, url, value, autoShare } = req.body;
    if (!name || !value) {
      return res.status(400).json({ error: 'Name and value required' });
    }
    
    // Additional validation
    if (name.length > 100) {
      return res.status(400).json({ error: 'Name too long (max 100 characters)' });
    }
    
    const id = await addKey(name, service, url, value);
    
    // Log key addition
    logAudit('key_added', {
      keyId: id,
      keyName: name,
      service: service,
      autoShared: autoShare,
      timestamp: new Date().toISOString()
    });
    
    // Auto-share if requested and connected
    let shared = false;
    if (autoShare && agentClient) {
      try {
        const keyData = await getKeyValue(id);
        await shareToAgent(keyData, id);
        shared = true;
      } catch (e) {
        console.log('Auto-share failed:', e.message);
      }
    }
    
    res.json({ id, success: true, autoShared: shared });
  } catch (e) {
    console.error('Add key error:', e);
    res.status(500).json({ error: 'Failed to add key' });
  }
});

app.post('/api/keys/:id/share', async (req, res) => {
  try {
    if (!encryptionKey) {
      return res.status(401).json({ error: 'Vault locked' });
    }
    
    const keyData = await getKeyValue(req.params.id);
    
    // Set status to pending
    await updateShareStatus(req.params.id, 'pending');
    
    try {
      await shareToAgent(keyData, req.params.id);
      
      // Log key sharing
      logAudit('key_shared', {
        keyId: req.params.id,
        keyName: keyData.name,
        sharedWith: 'External Agent',
        timestamp: new Date().toISOString()
      });
      
      res.json({ success: true, message: 'Shared with External Agent' });
    } catch (shareErr) {
      // Set status to error on failure
      await updateShareStatus(req.params.id, 'error');
      throw shareErr;
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/keys/share-all', async (req, res) => {
  try {
    if (!encryptionKey) {
      return res.status(401).json({ error: 'Vault locked' });
    }
    
    const results = await shareAllUnshared();
    res.json({ success: true, ...results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stop sharing a key (revoke from agent)
app.post('/api/keys/:id/unshare', async (req, res) => {
  try {
    if (!encryptionKey) {
      return res.status(401).json({ error: 'Vault locked' });
    }
    
    await unshareKey(req.params.id);
    
    // Log unshare
    logAudit('key_unshared', {
      keyId: req.params.id,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, message: 'Key sharing revoked' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get single key value (for editing)
app.get('/api/keys/:id/value', async (req, res) => {
  try {
    if (!encryptionKey) {
      return res.status(401).json({ error: 'Vault locked' });
    }
    
    const keyData = await getKeyValue(req.params.id);
    res.json(keyData);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update/edit a key (for rotation)
app.put('/api/keys/:id', async (req, res) => {
  try {
    if (!encryptionKey) {
      return res.status(401).json({ error: 'Vault locked' });
    }
    
    const { name, service, url, value, resetRotation } = req.body;
    
    if (!name || !value) {
      return res.status(400).json({ error: 'Name and value required' });
    }
    
    await updateKey(req.params.id, name, service, url, value, resetRotation);
    
    // Log update
    logAudit('key_updated', {
      keyId: req.params.id,
      keyName: name,
      resetRotation: resetRotation,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, message: 'Key updated successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/keys/:id', async (req, res) => {
  try {
    if (!encryptionKey) {
      return res.status(401).json({ error: 'Vault locked' });
    }
    
    await deleteKey(req.params.id);
    
    // Log key deletion
    logAudit('key_deleted', {
      keyId: req.params.id,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Logout (clear encryption key from memory)
app.post('/api/logout', (req, res) => {
  // Log logout
  logAudit('vault_locked', {
    action: 'user_logout',
    timestamp: new Date().toISOString()
  });
  
  encryptionKey = null;
  res.json({ success: true, message: 'Logged out successfully' });
});

// Get audit log
app.get('/api/audit', async (req, res) => {
  try {
    if (!encryptionKey) {
      return res.status(401).json({ error: 'Vault locked' });
    }
    
    const limit = parseInt(req.query.limit) || 50;
    const logs = getAuditLog(limit);
    
    res.json({
      count: logs.length,
      logs
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Reset - delete all vault data (requires vault to be unlocked for safety)
app.post('/api/reset', async (req, res) => {
  try {
    if (!encryptionKey) {
      return res.status(401).json({ error: 'Vault must be unlocked to perform reset' });
    }

    // Log the reset action before clearing
    logAudit('vault_reset', {
      action: 'full_reset',
      timestamp: new Date().toISOString()
    });

    // Close database connection
    db.close();
    
    // Delete database file
    if (fs.existsSync(DB_PATH)) {
      fs.unlinkSync(DB_PATH);
    }
    
    // Reset state
    encryptionKey = null;
    
    // Reinitialize empty database
    initDB();
    
    res.json({ success: true, message: 'All vault data deleted. Starting fresh.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// LLM Configuration (requires vault unlocked)
app.get('/api/config', async (req, res) => {
  try {
    if (!encryptionKey) {
      return res.status(401).json({ error: 'Vault locked' });
    }

    db.get("SELECT value FROM vault_meta WHERE key = 'llm_config'", (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      if (row) {
        try {
          // Try to decrypt (config is stored encrypted)
          const decrypted = decrypt(row.value, encryptionKey);
          res.json(JSON.parse(decrypted));
        } catch (e) {
          // Fallback: try parsing as plaintext (legacy data)
          try {
            res.json(JSON.parse(row.value));
          } catch (e2) {
            res.status(500).json({ error: 'Failed to read configuration' });
          }
        }
      } else {
        // Default config (no API key stored)
        res.json({
          provider: 'openai',
          model: 'gpt-4',
          apiKey: null
        });
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/config', async (req, res) => {
  try {
    // CRITICAL FIX: Must be unlocked to save config
    if (!encryptionKey) {
      return res.status(401).json({ error: 'Vault locked. Please unlock first.' });
    }
    
    const config = req.body;
    if (!config.apiKey || config.apiKey.length < 10) {
      return res.status(400).json({ error: 'Valid API key required (minimum 10 characters)' });
    }
    
    const encrypted = encrypt(JSON.stringify(config), encryptionKey);
    
    db.run("INSERT OR REPLACE INTO vault_meta (key, value) VALUES (?, ?)", 
      ['llm_config', encrypted], 
      (err) => {
        if (err) {
          console.error('Config save error:', err);
          res.status(500).json({ error: 'Failed to save configuration' });
          return;
        }
        res.json({ success: true });
      }
    );
  } catch (e) {
    console.error('Config endpoint error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Auto-restart agent listener if it crashes
let listenerProcess = null;

function startListener() {
  // Try multiple possible paths for the listener
  const possiblePaths = [
    path.join(__dirname, '..', '..', '.iron-vault', 'listener.js'),  // From projects/IronVault/
    path.join(__dirname, '.iron-vault', 'listener.js'),               // From workspace root
    path.join(process.cwd(), '.iron-vault', 'listener.js'),           // From current working dir
    path.join(os.homedir(), '.ironvault', 'listener.js')         // Absolute path
  ];
  
  let listenerPath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      listenerPath = p;
      break;
    }
  }
  
  if (!listenerPath) {
    console.log('[IronVault] Listener not found at expected paths, skipping auto-start');
    console.log('[IronVault] Searched:', possiblePaths);
    return;
  }
  
  console.log('[IronVault] Found listener at:', listenerPath);

  console.log('[IronVault] Starting agent listener...');

  const { spawn } = require('child_process');
  listenerProcess = spawn('node', [listenerPath], {
    detached: false,
    stdio: 'pipe'
  });

  listenerProcess.stdout.on('data', (data) => {
    console.log(`[listener] ${data.toString().trim()}`);
  });

  listenerProcess.stderr.on('data', (data) => {
    console.error(`[listener] ${data.toString().trim()}`);
  });

  listenerProcess.on('exit', (code) => {
    console.log(`[IronVault] Listener exited with code ${code}, restarting in 5s...`);
    setTimeout(startListener, 5000);
  });
}

// Start server
initDB();

app.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('🔐 IronVault is running!');
  console.log('');
  console.log(`   Web interface: http://localhost:${PORT}`);
  console.log(`   Also accessible: http://127.0.0.1:${PORT}`);
  console.log(`   WebSocket:     ws://localhost:${WS_PORT}`);
  console.log('');
  console.log('   Open http://localhost:8765 in your browser');
  console.log('');

  // Start listener after server is up
  startListener();
});
