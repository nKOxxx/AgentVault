const express = require('express');
const WebSocket = require('ws');
const CryptoJS = require('crypto-js');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');

const app = express();
const PORT = 8765;
const WS_PORT = 8766;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Security: CORS - Only allow localhost origins
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  next();
});

// Security: Remove server header
app.disable('x-powered-by');

// Input validation middleware
function validateInput(fields) {
  return (req, res, next) => {
    for (const field of fields) {
      const value = req.body[field];
      if (value !== undefined) {
        // Check for common injection patterns
        if (typeof value === 'string' && /[<>'"]|(\-\-)|(;)|(\/\*)/.test(value)) {
          return res.status(400).json({ error: 'Invalid characters in input' });
        }
        // Length limits
        if (typeof value === 'string' && value.length > 1000) {
          return res.status(400).json({ error: 'Input too long' });
        }
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
let db;
let encryptionKey = null;
let maxKeys = 20;

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
      shared_with TEXT DEFAULT NULL
    )`);
    
    // Migration: Add shared_with column if it doesn't exist
    db.run(`ALTER TABLE keys ADD COLUMN shared_with TEXT DEFAULT NULL`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.log('Note: shared_with column may already exist');
      }
    });
  });
}

// Encryption functions
function encrypt(text, key) {
  return CryptoJS.AES.encrypt(text, key).toString();
}

function decrypt(ciphertext, key) {
  const bytes = CryptoJS.AES.decrypt(ciphertext, key);
  return bytes.toString(CryptoJS.enc.Utf8);
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
    const salt = CryptoJS.lib.WordArray.random(128/8).toString();
    const key = CryptoJS.PBKDF2(password, salt, { keySize: 256/32, iterations: 100000 }).toString();
    
    db.run("INSERT OR REPLACE INTO vault_meta (key, value) VALUES (?, ?)", ['salt', salt], (err) => {
      if (err) reject(err);
      db.run("INSERT OR REPLACE INTO vault_meta (key, value) VALUES (?, ?)", ['initialized', 'true'], (err) => {
        if (err) reject(err);
        encryptionKey = key;
        resolve(key);
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
      const key = CryptoJS.PBKDF2(password, salt, { keySize: 256/32, iterations: 100000 }).toString();
      
      // Test decryption
      db.get("SELECT encrypted_value FROM keys LIMIT 1", (err, testRow) => {
        if (err) reject(err);
        if (testRow) {
          try {
            decrypt(testRow.encrypted_value, key);
          } catch (e) {
            reject(new Error('Invalid password'));
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
    db.all("SELECT id, name, service, url, created_at, last_rotated, rotation_interval, shared_with FROM keys ORDER BY created_at DESC", (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
}

// Add key
function addKey(name, service, url, value) {
  return new Promise((resolve, reject) => {
    const id = CryptoJS.lib.WordArray.random(128/8).toString();
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
      if (err) reject(err);
      if (!row) reject(new Error('Key not found'));
      
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
function markKeyShared(id, agentName = 'Ares') {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE keys SET shared_with = ? WHERE id = ?",
      [agentName, id],
      function(err) {
        if (err) reject(err);
        resolve();
      }
    );
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

// WebSocket server for OpenClaw connection
const wss = new WebSocket.Server({ port: WS_PORT });
let openclawClient = null;
let pendingShares = new Map(); // Track pending shares

wss.on('connection', (ws) => {
  console.log('🔌 OpenClaw connected via WebSocket');
  openclawClient = ws;
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received from OpenClaw:', data.type);
      
      // Handle requests from OpenClaw
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
          markKeyShared(data.keyId, data.agentName || 'Ares').catch(console.error);
        }
        // Remove from pending
        pendingShares.delete(data.keyId);
      }
    } catch (e) {
      console.error('Invalid message from OpenClaw:', e);
    }
  });
  
  ws.on('close', () => {
    console.log('🔌 OpenClaw disconnected');
    openclawClient = null;
  });
});

// Share key to OpenClaw
async function shareToOpenClaw(keyData, keyId) {
  return new Promise((resolve, reject) => {
    if (!openclawClient) {
      reject(new Error('Ares not connected. Please wait for connection or refresh the page.'));
      return;
    }
    
    // Track pending share
    pendingShares.set(keyId, {
      timestamp: Date.now(),
      retries: 0
    });
    
    openclawClient.send(JSON.stringify({
      type: 'shared_secret',
      keyId: keyId,
      timestamp: new Date().toISOString(),
      data: keyData
    }));
    
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
        reject(new Error('Timeout: Ares did not confirm receipt within 10 seconds'));
      }
    }, 500);
  });
}

// Share all unshared keys
async function shareAllUnshared() {
  if (!openclawClient) {
    throw new Error('Ares not connected');
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
      await shareToOpenClaw(keyData, key.id);
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

app.get('/api/status', async (req, res) => {
  try {
    const initialized = await isVaultInitialized();
    const unlocked = encryptionKey !== null;
    const keyCount = unlocked ? await countKeys() : 0;
    const connected = openclawClient !== null;
    
    res.json({
      initialized,
      unlocked,
      keyCount,
      maxKeys,
      connected,
      agentName: 'Ares'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/init', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
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
    
    // Auto-share if requested and connected
    let shared = false;
    if (autoShare && openclawClient) {
      try {
        const keyData = await getKeyValue(id);
        await shareToOpenClaw(keyData, id);
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
    await shareToOpenClaw(keyData, req.params.id);
    
    res.json({ success: true, message: 'Shared with Ares' });
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

app.delete('/api/keys/:id', async (req, res) => {
  try {
    if (!encryptionKey) {
      return res.status(401).json({ error: 'Vault locked' });
    }
    
    await deleteKey(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Logout (clear encryption key from memory)
app.post('/api/logout', (req, res) => {
  encryptionKey = null;
  res.json({ success: true, message: 'Logged out successfully' });
});

// Reset - delete all vault data
app.post('/api/reset', async (req, res) => {
  try {
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

// LLM Configuration
app.get('/api/config', async (req, res) => {
  try {
    db.get("SELECT value FROM vault_meta WHERE key = 'llm_config'", (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      if (row) {
        res.json(JSON.parse(row.value));
      } else {
        // Default config
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

// Start server
initDB();

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🔐 AgentVault is running!');
  console.log('');
  console.log(`   Web interface: http://localhost:${PORT}`);
  console.log(`   Also accessible: http://0.0.0.0:${PORT}`);
  console.log(`   WebSocket:     ws://localhost:${WS_PORT}`);
  console.log('');
  console.log('   Open http://localhost:8765 in your browser');
  console.log('');
});
