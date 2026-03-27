const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Keep references to prevent garbage collection
let mainWindow = null;
let tray = null;
let serverProcess = null;

// Get app data directory for storing vault
console.log('[AgentVault] BEFORE app.ready - app.name:', app.name);
console.log('[AgentVault] BEFORE app.ready - app.getPath(userData):', app.getPath('userData'));
const userDataPath = app.getPath('userData');
let vaultPath = path.join(userDataPath, 'vault.json');
const configPath = path.join(userDataPath, 'config.json');

// Simple encryption (for production, use better encryption)
const crypto = require('crypto');

function encrypt(text, password) {
  const algorithm = 'aes-256-gcm';
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return salt.toString('hex') + ':' + iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText, password) {
  const algorithm = 'aes-256-gcm';
  const parts = encryptedText.split(':');
  if (parts.length !== 4) throw new Error('Invalid encrypted data');
  const salt = Buffer.from(parts[0], 'hex');
  const iv = Buffer.from(parts[1], 'hex');
  const authTag = Buffer.from(parts[2], 'hex');
  const encrypted = parts[3];
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

let vaultPassword = null;
let vaultData = { initialized: false, keys: [] };

// Check if vault file exists on startup
console.log('[AgentVault] Checking for vault at:', vaultPath);
console.log('[AgentVault] userDataPath is:', userDataPath);
console.log('[AgentVault] File exists check:', fs.existsSync(vaultPath));
if (fs.existsSync(vaultPath)) {
  vaultData.initialized = true;
  console.log('[AgentVault] Existing vault found at:', vaultPath);
} else {
  console.log('[AgentVault] No existing vault found at:', vaultPath);
}

// Security: Auto-lock after inactivity
let inactivityTimer = null;
const AUTO_LOCK_TIMEOUT = 15 * 60 * 1000; // 15 minutes

// Security: Rate limiting for unlock attempts
let failedAttempts = 0;
let lockoutEndTime = null;
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  if (vaultPassword) {
    inactivityTimer = setTimeout(() => {
      console.log('[Security] Auto-locking due to inactivity');
      vaultPassword = null;
      vaultData.keys = [];
      if (mainWindow) {
        mainWindow.webContents.send('vault-auto-locked');
      }
    }, AUTO_LOCK_TIMEOUT);
  }
}

function checkRateLimit() {
  if (lockoutEndTime && Date.now() < lockoutEndTime) {
    const remaining = Math.ceil((lockoutEndTime - Date.now()) / 1000 / 60);
    return { locked: true, remainingMinutes: remaining };
  }
  if (lockoutEndTime && Date.now() >= lockoutEndTime) {
    // Reset after lockout period
    failedAttempts = 0;
    lockoutEndTime = null;
  }
  return { locked: false };
}

function recordFailedAttempt() {
  failedAttempts++;
  if (failedAttempts >= MAX_ATTEMPTS) {
    lockoutEndTime = Date.now() + LOCKOUT_DURATION;
    console.log(`[Security] Rate limit triggered. Locked for 15 minutes.`);
    return { locked: true, remainingMinutes: 15 };
  }
  return { locked: false, remainingAttempts: MAX_ATTEMPTS - failedAttempts };
}

function loadVault(password) {
  try {
    if (!fs.existsSync(vaultPath)) {
      return { initialized: false, keys: [] };
    }
    const encrypted = fs.readFileSync(vaultPath, 'utf8');
    const decrypted = decrypt(encrypted, password);
    return JSON.parse(decrypted);
  } catch (e) {
    throw new Error('Invalid password or corrupted vault');
  }
}

function saveVault(data, password) {
  const encrypted = encrypt(JSON.stringify(data), password);
  // Security: Set restrictive file permissions (owner read/write only)
  fs.writeFileSync(vaultPath, encrypted, { mode: 0o600 });
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 520,
    height: 700,
    minWidth: 400,
    minHeight: 500,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset',
    show: false
  });

  // Load the local HTML file
  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Hide instead of close (keep in tray)
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // Create a simple 16x16 tray icon (white lock on transparent)
  const iconPath = path.join(__dirname, 'tray-icon.png');
  let trayIcon;
  
  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
  } else {
    // Create a simple icon programmatically if file doesn't exist
    trayIcon = nativeImage.createEmpty();
  }
  
  tray = new Tray(trayIcon);
  tray.setToolTip('AgentVault');
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open AgentVault',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  
  // Click to toggle window
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    } else {
      createWindow();
    }
  });
}

// IPC handlers for vault operations
ipcMain.handle('vault-status', () => {
  // Check if vault file exists on disk (even if not loaded in memory)
  const vaultExists = fs.existsSync(vaultPath);
  console.log('[AgentVault] vault-status called:');
  console.log('  vaultPath:', vaultPath);
  console.log('  vaultExists:', vaultExists);
  console.log('  vaultData.initialized:', vaultData.initialized);
  console.log('  returning initialized:', vaultData.initialized || vaultExists);
  return {
    initialized: vaultData.initialized || vaultExists,
    unlocked: !!vaultPassword,
    keyCount: vaultData.keys ? vaultData.keys.length : 0
  };
});

ipcMain.handle('vault-init', (event, { password }) => {
  try {
    console.log('[AgentVault] vault-init called, saving to:', vaultPath);
    vaultData = { initialized: true, keys: [] };
    saveVault(vaultData, password);
    vaultPassword = password;
    console.log('[AgentVault] vault saved successfully');
    return { success: true };
  } catch (e) {
    console.error('[AgentVault] vault-init failed:', e.message);
    return { error: e.message };
  }
});

ipcMain.handle('vault-unlock', (event, { password }) => {
  try {
    // Security: Check rate limiting
    const rateLimit = checkRateLimit();
    if (rateLimit.locked) {
      return { 
        error: `Too many failed attempts. Try again in ${rateLimit.remainingMinutes} minutes.`,
        locked: true,
        remainingMinutes: rateLimit.remainingMinutes
      };
    }
    
    vaultData = loadVault(password);
    vaultPassword = password;
    
    // Security: Reset failed attempts on success
    failedAttempts = 0;
    lockoutEndTime = null;
    
    // Security: Start inactivity timer
    resetInactivityTimer();
    
    return { success: true };
  } catch (e) {
    // Security: Record failed attempt
    const rateStatus = recordFailedAttempt();
    if (rateStatus.locked) {
      return { 
        error: `Too many failed attempts. Locked for ${rateStatus.remainingMinutes} minutes.`,
        locked: true,
        remainingMinutes: rateStatus.remainingMinutes
      };
    }
    return { 
      error: 'Invalid password',
      remainingAttempts: rateStatus.remainingAttempts
    };
  }
});

ipcMain.handle('vault-lock', () => {
  vaultPassword = null;
  vaultData = { initialized: vaultData.initialized, keys: [] };
  
  // Security: Clear inactivity timer
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
  
  return { success: true };
});

ipcMain.handle('keys-list', () => {
  if (!vaultPassword) return { error: 'Vault locked' };
  // Security: Reset inactivity timer on user activity
  resetInactivityTimer();
  return { keys: vaultData.keys || [] };
});

ipcMain.handle('keys-add', (event, { name, service, value }) => {
  if (!vaultPassword) return { error: 'Vault locked' };
  
  // Security: Reset inactivity timer on user activity
  resetInactivityTimer();
  
  const id = require('crypto').randomBytes(16).toString('hex');
  const key = {
    id,
    name,
    service: service || 'custom',
    value,
    created_at: new Date().toISOString(),
    share_status: 'none'
  };
  
  vaultData.keys.push(key);
  saveVault(vaultData, vaultPassword);
  
  return { success: true, id };
});

ipcMain.handle('keys-delete', (event, { id }) => {
  if (!vaultPassword) return { error: 'Vault locked' };
  
  // Security: Reset inactivity timer on user activity
  resetInactivityTimer();
  
  vaultData.keys = vaultData.keys.filter(k => k.id !== id);
  saveVault(vaultData, vaultPassword);
  
  return { success: true };
});

ipcMain.handle('keys-get', (event, { id }) => {
  if (!vaultPassword) return { error: 'Vault locked' };
  
  // Security: Reset inactivity timer on user activity
  resetInactivityTimer();
  
  const key = vaultData.keys.find(k => k.id === id);
  if (!key) return { error: 'Key not found' };
  
  return { success: true, value: key.value };
});

ipcMain.handle('keys-edit', (event, { id, updates }) => {
  if (!vaultPassword) return { error: 'Vault locked' };
  
  // Security: Reset inactivity timer on user activity
  resetInactivityTimer();
  
  const keyIndex = vaultData.keys.findIndex(k => k.id === id);
  if (keyIndex === -1) return { error: 'Key not found' };
  
  // Update allowed fields
  if (updates.name !== undefined) vaultData.keys[keyIndex].name = updates.name;
  if (updates.service !== undefined) vaultData.keys[keyIndex].service = updates.service;
  if (updates.value !== undefined) vaultData.keys[keyIndex].value = updates.value;
  vaultData.keys[keyIndex].updated_at = new Date().toISOString();
  
  saveVault(vaultData, vaultPassword);
  
  return { success: true };
});


ipcMain.handle('keys-unshare', (event, { id }) => {
  if (!vaultPassword) return { error: 'Vault locked' };
  
  // Security: Reset inactivity timer on user activity
  resetInactivityTimer();
  
  const keyIndex = vaultData.keys.findIndex(k => k.id === id);
  if (keyIndex === -1) return { error: 'Key not found' };
  
  vaultData.keys[keyIndex].share_status = 'none';
  delete vaultData.keys[keyIndex].shared_with;
  delete vaultData.keys[keyIndex].shared_at;
  
  saveVault(vaultData, vaultPassword);
  
  return { success: true };
});

// App event handlers
// Rate limiting for HTTP receiver
const unlockAttempts = new Map();
const UNLOCK_RATE_WINDOW = 15 * 60 * 1000; // 15 minutes
const UNLOCK_RATE_MAX = 5;

function checkUnlockRate(ip) {
  const now = Date.now();
  const attempts = unlockAttempts.get(ip) || [];
  const recent = attempts.filter(t => t > now - UNLOCK_RATE_WINDOW);
  unlockAttempts.set(ip, recent);
  if (recent.length >= UNLOCK_RATE_MAX) return false;
  recent.push(now);
  unlockAttempts.set(ip, recent);
  return true;
}

// Start AgentVault credential receiver (embedded HTTP server)
let receiverServer = null;

function startReceiver() {
  const RECEIVED_DIR = path.join(app.getPath('userData'), 'agentvault-received');
  if (!fs.existsSync(RECEIVED_DIR)) {
    fs.mkdirSync(RECEIVED_DIR, { recursive: true });
  }
  
  receiverServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    // Vault status endpoint
    if (req.method === 'GET' && req.url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        initialized: vaultData.initialized,
        unlocked: !!vaultPassword,
        keyCount: vaultData.keys ? vaultData.keys.length : 0
      }));
      return;
    }
    
    // Initialize vault endpoint
    if (req.method === 'POST' && req.url === '/api/init') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { password } = JSON.parse(body);
          vaultData = { initialized: true, keys: [] };
          saveVault(vaultData, password);
          vaultPassword = password;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    
    // Unlock vault endpoint (rate limited)
    if (req.method === 'POST' && req.url === '/api/unlock') {
      const ip = req.socket.remoteAddress || '127.0.0.1';
      if (!checkUnlockRate(ip)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Too many unlock attempts. Try again in 15 minutes.' }));
        return;
      }
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { password } = JSON.parse(body);
          vaultData = loadVault(password);
          vaultPassword = password;
          resetInactivityTimer();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid password' }));
        }
      });
      return;
    }
    
    // List keys endpoint
    if (req.method === 'GET' && req.url === '/api/keys') {
      if (!vaultPassword) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Vault locked' }));
        return;
      }
      resetInactivityTimer();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ keys: vaultData.keys || [] }));
      return;
    }
    
    if (req.method === 'POST' && req.url === '/receive') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (!data.id || !data.name || !data.value) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing fields' }));
            return;
          }

          const filename = `credential-${data.id}-${Date.now()}.json`;
          const filepath = path.join(RECEIVED_DIR, filename);

          // Encrypt sensitive value before writing to disk
          const credentialData = {
            received_at: new Date().toISOString(),
            from: 'AgentVault',
            acknowledged: false,
            credential: {
              id: data.id,
              name: data.name,
              service: data.service || '',
              encrypted: true,
              note: 'Value encrypted at rest. Decrypt via vault unlock.'
            }
          };

          // If vault is unlocked, store encrypted; otherwise store metadata only (no secret value)
          if (vaultPassword && vaultData) {
            // Add to vault directly instead of writing plaintext
            const newKey = {
              id: data.id,
              name: data.name,
              service: data.service || 'received',
              value: data.value,
              shared_with: 'received',
              created_at: new Date().toISOString()
            };
            vaultData.keys = vaultData.keys || [];
            vaultData.keys.push(newKey);
            saveVault(vaultData, vaultPassword);
            console.log('[AgentVault] Received and stored credential:', data.name);
          } else {
            // Vault locked — write metadata only, no secret value
            fs.writeFileSync(filepath, JSON.stringify(credentialData, null, 2), { mode: 0o600 });
            console.log('[AgentVault] Received credential metadata (vault locked):', data.name);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Credential received' }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to process' }));
        }
      });
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  
  receiverServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('[AgentVault] Port 8765 already in use. Another instance may be running.');
    } else {
      console.error('[AgentVault] Receiver error:', err.message);
    }
  });
  
  receiverServer.listen(8765, () => {
    console.log('[AgentVault] Receiver listening on port 8765');
  });
}

// Start receiver when app starts
startReceiver();

// Cleanup on quit
app.on('before-quit', () => {
  if (receiverServer) {
    receiverServer.close();
  }
});

app.whenReady().then(() => {
  // Re-check vault path after app is ready (path might be different)
  const readyUserDataPath = app.getPath('userData');
  const readyVaultPath = path.join(readyUserDataPath, 'vault.json');
  console.log('[AgentVault] App ready - userDataPath:', readyUserDataPath);
  console.log('[AgentVault] App ready - vaultPath:', readyVaultPath);
  console.log('[AgentVault] App ready - vault exists:', fs.existsSync(readyVaultPath));
  
  if (fs.existsSync(readyVaultPath)) {
    vaultData.initialized = true;
    vaultPath = readyVaultPath; // Update the global path
    console.log('[AgentVault] Vault detected after app ready - SET initialized = true');
  } else {
    console.log('[AgentVault] No vault found at readyVaultPath');
  }
  
  console.log('[AgentVault] Final vaultData.initialized:', vaultData.initialized);
  
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit - keep running in tray
});

app.on('before-quit', () => {
  app.isQuiting = true;
});

// Ensure data directory exists
if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath, { recursive: true });
}

// === REAL SHARING TO AGENTVAULT ===
// Directly register the real handler (overwrites the dummy one)

ipcMain.handle('keys-share', async (event, { id, agentId }) => {
  if (!vaultPassword) return { error: 'Vault locked' };
  
  resetInactivityTimer();
  
  const keyIndex = vaultData.keys.findIndex(k => k.id === id);
  if (keyIndex === -1) return { error: 'Key not found' };
  
  const credential = vaultData.keys[keyIndex];
  
  // Mark as pending
  vaultData.keys[keyIndex].share_status = 'pending';
  saveVault(vaultData, vaultPassword);
  
  // Send to agent
  try {
    const response = await fetch('http://localhost:8765/receive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: credential.id,
        name: credential.name,
        service: credential.service,
        value: credential.value,
        shared_by: agentId || 'user',
        shared_at: new Date().toISOString()
      })
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    vaultData.keys[keyIndex].share_status = 'shared';
    vaultData.keys[keyIndex].shared_with = 'agent';
    vaultData.keys[keyIndex].shared_at = new Date().toISOString();
    saveVault(vaultData, vaultPassword);
    
    return { success: true, message: 'Credential sent to agent' };
  } catch (err) {
    vaultData.keys[keyIndex].share_status = 'error';
    saveVault(vaultData, vaultPassword);
    return { error: 'Failed to send. Is the agent running?', details: err.message };
  }
});
