/**
 * IronVault API Test Suite
 *
 * Tests the HTTP API endpoints for correct behavior:
 * - Vault initialization and unlock flow
 * - Credential CRUD operations
 * - Security controls (rate limiting, auth checks)
 * - Edge cases and error handling
 *
 * Requires: npm start (server running on port 8765)
 */

const http = require('http');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://127.0.0.1:8765';
const TEST_PASSWORD = 'TestVault2026!x';

// ─── HTTP Helper ───

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Test Runner ───

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

// ─── Tests ───

async function runTests() {
  console.log('\n🌐 IronVault API Tests\n');

  // Check server is running
  try {
    await request('GET', '/api/status');
  } catch (e) {
    console.log('  ⚠️  Server not running on port 8765. Start with: npm start');
    console.log('  ⚠️  Skipping API tests.\n');
    return;
  }

  console.log('── Status Endpoint ──');

  await test('GET /api/status returns valid response', async () => {
    const res = await request('GET', '/api/status');
    assert.strictEqual(res.status, 200);
    assert.ok('initialized' in res.body);
    assert.ok('unlocked' in res.body);
  });

  console.log('\n── Vault Initialization ──');

  await test('POST /api/init rejects weak password (too short)', async () => {
    const res = await request('POST', '/api/init', { password: 'short' });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error);
  });

  await test('POST /api/init rejects password without uppercase', async () => {
    const res = await request('POST', '/api/init', { password: 'nouppercase123!' });
    assert.strictEqual(res.status, 400);
  });

  await test('POST /api/init rejects password without special char', async () => {
    const res = await request('POST', '/api/init', { password: 'NoSpecials123xx' });
    assert.strictEqual(res.status, 400);
  });

  console.log('\n── Authentication ──');

  await test('POST /api/unlock rejects wrong password', async () => {
    const res = await request('POST', '/api/unlock', { password: 'WrongPassword!1' });
    assert.ok(res.status === 401 || res.status === 429);
  });

  await test('POST /api/unlock rejects empty password', async () => {
    const res = await request('POST', '/api/unlock', { password: '' });
    assert.ok(res.status === 400 || res.status === 401);
  });

  console.log('\n── Protected Endpoints (Vault Locked) ──');

  // Lock vault first
  await request('POST', '/api/logout');

  await test('GET /api/keys returns 401 when locked', async () => {
    const res = await request('GET', '/api/keys');
    assert.strictEqual(res.status, 401);
  });

  await test('POST /api/keys returns 401 when locked', async () => {
    const res = await request('POST', '/api/keys', { name: 'test', value: 'test' });
    assert.strictEqual(res.status, 401);
  });

  await test('GET /api/audit returns 401 when locked', async () => {
    const res = await request('GET', '/api/audit');
    assert.strictEqual(res.status, 401);
  });

  await test('GET /api/ws-token returns 401 when locked', async () => {
    const res = await request('GET', '/api/ws-token');
    assert.strictEqual(res.status, 401);
  });

  await test('GET /api/config returns 401 when locked', async () => {
    const res = await request('GET', '/api/config');
    assert.strictEqual(res.status, 401);
  });

  await test('POST /api/reset returns 401 when locked', async () => {
    const res = await request('POST', '/api/reset');
    assert.strictEqual(res.status, 401);
  });

  console.log('\n── Input Validation ──');

  // Unlock for remaining tests
  await request('POST', '/api/unlock', { password: TEST_PASSWORD });

  await test('POST /api/keys rejects missing name', async () => {
    const res = await request('POST', '/api/keys', { value: 'test-value' });
    assert.strictEqual(res.status, 400);
  });

  await test('POST /api/keys rejects missing value', async () => {
    const res = await request('POST', '/api/keys', { name: 'test-key' });
    assert.strictEqual(res.status, 400);
  });

  await test('POST /api/keys rejects name over 100 chars', async () => {
    const res = await request('POST', '/api/keys', {
      name: 'x'.repeat(101),
      value: 'test-value'
    });
    assert.strictEqual(res.status, 400);
  });

  console.log('\n── Credential CRUD ──');

  let testKeyId = null;

  await test('POST /api/keys creates a credential', async () => {
    const res = await request('POST', '/api/keys', {
      name: 'Test API Key',
      service: 'custom',
      value: 'test-secret-value-123'
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.id);
    assert.strictEqual(res.body.success, true);
    testKeyId = res.body.id;
  });

  await test('GET /api/keys lists credentials', async () => {
    const res = await request('GET', '/api/keys');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    const found = res.body.find(k => k.id === testKeyId);
    assert.ok(found, 'Created key should be in list');
    assert.strictEqual(found.name, 'Test API Key');
    // Value should NOT be in the list response
    assert.ok(!found.value, 'Secret value must not be in list response');
    assert.ok(!found.encrypted_value, 'Encrypted value must not be in list response');
  });

  await test('GET /api/keys/:id/value returns decrypted value', async () => {
    const res = await request('GET', `/api/keys/${testKeyId}/value`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.value, 'test-secret-value-123');
    assert.strictEqual(res.body.name, 'Test API Key');
  });

  await test('PUT /api/keys/:id updates a credential', async () => {
    const res = await request('PUT', `/api/keys/${testKeyId}`, {
      name: 'Updated API Key',
      service: 'custom',
      url: '',
      value: 'updated-secret-value',
      resetRotation: true
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);

    // Verify update
    const get = await request('GET', `/api/keys/${testKeyId}/value`);
    assert.strictEqual(get.body.value, 'updated-secret-value');
    assert.strictEqual(get.body.name, 'Updated API Key');
  });

  await test('DELETE /api/keys/:id deletes a credential', async () => {
    const res = await request('DELETE', `/api/keys/${testKeyId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);

    // Verify deletion
    const get = await request('GET', `/api/keys/${testKeyId}/value`);
    assert.strictEqual(get.status, 500); // Key not found
  });

  console.log('\n── Audit Log ──');

  await test('GET /api/audit returns log entries', async () => {
    const res = await request('GET', '/api/audit?limit=10');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.logs));
  });

  console.log('\n── Security Headers ──');

  await test('response includes security headers', async () => {
    const res = await new Promise((resolve, reject) => {
      http.get(`${BASE_URL}/api/status`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ headers: res.headers, status: res.statusCode }));
      }).on('error', reject);
    });

    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(res.headers['x-frame-options'], 'DENY');
    assert.ok(res.headers['content-security-policy']);
    assert.ok(res.headers['referrer-policy']);
  });

  await test('x-powered-by header is not present', async () => {
    const res = await new Promise((resolve, reject) => {
      http.get(`${BASE_URL}/api/status`, (res) => {
        resolve({ headers: res.headers });
      }).on('error', reject);
    });

    assert.ok(!res.headers['x-powered-by'], 'x-powered-by should not be present');
  });

  // ─── Cleanup: lock vault ───
  await request('POST', '/api/logout');

  // ─── Results ───
  console.log('\n' + '='.repeat(50));
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\n  Failures:');
    failures.forEach(f => console.log(`    - ${f.name}: ${f.error}`));
  }
  console.log('='.repeat(50) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Test suite error:', e);
  process.exit(1);
});
