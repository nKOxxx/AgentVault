/**
 * IronVault Credential Receiver
 * 
 * External Agent endpoint for receiving shared credentials from IronVault
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8765; // IronVault port
const RECEIVED_DIR = path.join(require('os').homedir(), '.ironvault', 'ironvault-received');

// Ensure directory exists
if (!fs.existsSync(RECEIVED_DIR)) {
  fs.mkdirSync(RECEIVED_DIR, { recursive: true });
}

const server = http.createServer((req, res) => {
  // Enable CORS for IronVault
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (req.method === 'POST' && req.url === '/receive') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        // Validate required fields
        if (!data.id || !data.name || !data.value) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing required fields' }));
          return;
        }
        
        // Save credential
        const filename = `credential-${data.id}-${Date.now()}.json`;
        const filepath = path.join(RECEIVED_DIR, filename);
        
        // Store metadata only — never write secret values as plaintext to disk
        const credentialData = {
          received_at: new Date().toISOString(),
          from: 'IronVault',
          acknowledged: false,
          credential: {
            id: data.id,
            name: data.name,
            service: data.service,
            encrypted: true,
            note: 'Secret value not persisted to disk. Re-share from vault when needed.',
            shared_by: data.shared_by || 'user'
          }
        };
        
        fs.writeFileSync(filepath, JSON.stringify(credentialData, null, 2), { mode: 0o600 });
        
        console.log('[IronVault] Received credential:', data.name);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: 'Credential received',
          received_at: credentialData.received_at
        }));
        
      } catch (err) {
        console.error('[IronVault] Error receiving credential:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to process credential' }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`[IronVault] Receiver listening on port ${PORT}`);
  console.log(`[IronVault] Credentials will be saved to: ${RECEIVED_DIR}`);
});

// Also check for existing credentials periodically
setInterval(() => {
  const files = fs.readdirSync(RECEIVED_DIR).filter(f => f.endsWith('.json'));
  if (files.length > 0) {
    console.log(`[IronVault] ${files.length} unacknowledged credentials`);
  }
}, 30000); // Check every 30 seconds

module.exports = { server, RECEIVED_DIR };
