/**
 * AgentVault Credential Receiver
 * 
 * OpenClaw endpoint for receiving shared credentials from AgentVault
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8765; // AgentVault port
const RECEIVED_DIR = path.join(require('os').homedir(), '.openclaw', 'agentvault-received');

// Ensure directory exists
if (!fs.existsSync(RECEIVED_DIR)) {
  fs.mkdirSync(RECEIVED_DIR, { recursive: true });
}

const server = http.createServer((req, res) => {
  // Enable CORS for AgentVault
  res.setHeader('Access-Control-Allow-Origin', '*');
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
        
        const credentialData = {
          received_at: new Date().toISOString(),
          from: 'AgentVault',
          acknowledged: false,
          credential: {
            id: data.id,
            name: data.name,
            service: data.service,
            value: data.value,
            shared_by: data.shared_by || 'user'
          }
        };
        
        fs.writeFileSync(filepath, JSON.stringify(credentialData, null, 2), { mode: 0o600 });
        
        console.log('[AgentVault] Received credential:', data.name);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: 'Credential received by Ares',
          received_at: credentialData.received_at
        }));
        
      } catch (err) {
        console.error('[AgentVault] Error receiving credential:', err);
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
  console.log(`[AgentVault] Receiver listening on port ${PORT}`);
  console.log(`[AgentVault] Credentials will be saved to: ${RECEIVED_DIR}`);
});

// Also check for existing credentials periodically
setInterval(() => {
  const files = fs.readdirSync(RECEIVED_DIR).filter(f => f.endsWith('.json'));
  if (files.length > 0) {
    console.log(`[AgentVault] ${files.length} unacknowledged credentials`);
  }
}, 30000); // Check every 30 seconds

module.exports = { server, RECEIVED_DIR };
