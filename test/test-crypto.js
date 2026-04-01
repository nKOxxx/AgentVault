/**
 * IronVault Encryption Test Suite
 *
 * Tests the core cryptographic operations:
 * - AES-256-GCM encryption/decryption
 * - PBKDF2 key derivation
 * - IV uniqueness
 * - Auth tag verification (tamper detection)
 * - Edge cases and error handling
 */

const crypto = require('crypto');
const assert = require('assert');

// ─── Replicate server.js crypto functions ───

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function encrypt(text, keyHex) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = Buffer.from(keyHex, 'hex');
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let ciphertext = cipher.update(text, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + authTag.toString('hex') + ciphertext;
}

function decrypt(encryptedHex, keyHex) {
  const encrypted = Buffer.from(encryptedHex, 'hex');
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

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256').toString('hex');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') return { valid: false, message: 'Password is required' };
  if (password.length < 12) return { valid: false, message: 'Password must be at least 12 characters' };
  if (!/[A-Z]/.test(password)) return { valid: false, message: 'Missing uppercase' };
  if (!/[a-z]/.test(password)) return { valid: false, message: 'Missing lowercase' };
  if (!/[0-9]/.test(password)) return { valid: false, message: 'Missing number' };
  if (!/[^A-Za-z0-9]/.test(password)) return { valid: false, message: 'Missing special char' };
  return { valid: true, message: 'OK' };
}

// ─── Test Runner ───

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

// ─── Test Suites ───

console.log('\n🔐 IronVault Encryption Tests\n');

console.log('── Basic Encryption/Decryption ──');

test('encrypt and decrypt a simple string', () => {
  const key = crypto.randomBytes(32).toString('hex');
  const plaintext = 'sk-abc123def456';
  const encrypted = encrypt(plaintext, key);
  const decrypted = decrypt(encrypted, key);
  assert.strictEqual(decrypted, plaintext);
});

test('encrypt and decrypt empty string', () => {
  const key = crypto.randomBytes(32).toString('hex');
  const encrypted = encrypt('', key);
  const decrypted = decrypt(encrypted, key);
  assert.strictEqual(decrypted, '');
});

test('encrypt and decrypt unicode text', () => {
  const key = crypto.randomBytes(32).toString('hex');
  const plaintext = '🔐 IronVault 密码 пароль';
  const encrypted = encrypt(plaintext, key);
  const decrypted = decrypt(encrypted, key);
  assert.strictEqual(decrypted, plaintext);
});

test('encrypt and decrypt long credential (4KB)', () => {
  const key = crypto.randomBytes(32).toString('hex');
  const plaintext = crypto.randomBytes(2048).toString('base64');
  const encrypted = encrypt(plaintext, key);
  const decrypted = decrypt(encrypted, key);
  assert.strictEqual(decrypted, plaintext);
});

test('encrypt and decrypt JSON credential (Twitter OAuth)', () => {
  const key = crypto.randomBytes(32).toString('hex');
  const credential = JSON.stringify({
    apiKey: 'abc123',
    apiSecret: 'def456',
    accessToken: 'ghi789',
    accessSecret: 'jkl012',
    bearerToken: 'mno345'
  });
  const encrypted = encrypt(credential, key);
  const decrypted = decrypt(encrypted, key);
  assert.deepStrictEqual(JSON.parse(decrypted), JSON.parse(credential));
});

console.log('\n── IV Uniqueness ──');

test('each encryption produces a unique ciphertext (different IVs)', () => {
  const key = crypto.randomBytes(32).toString('hex');
  const plaintext = 'same-secret';
  const encrypted1 = encrypt(plaintext, key);
  const encrypted2 = encrypt(plaintext, key);
  assert.notStrictEqual(encrypted1, encrypted2, 'Two encryptions of the same text must differ');
  // But both must decrypt to the same value
  assert.strictEqual(decrypt(encrypted1, key), plaintext);
  assert.strictEqual(decrypt(encrypted2, key), plaintext);
});

test('IV is 16 bytes (32 hex chars) at start of ciphertext', () => {
  const key = crypto.randomBytes(32).toString('hex');
  const encrypted = encrypt('test', key);
  const iv = encrypted.substring(0, 32); // 16 bytes = 32 hex chars
  assert.strictEqual(iv.length, 32);
  assert.ok(/^[0-9a-f]+$/.test(iv), 'IV should be hex');
});

console.log('\n── Tamper Detection (GCM Auth Tag) ──');

test('tampered ciphertext is rejected', () => {
  const key = crypto.randomBytes(32).toString('hex');
  const encrypted = encrypt('secret-value', key);
  // Flip a byte in the ciphertext portion (after IV + authTag = 64 hex chars)
  const tampered = encrypted.substring(0, 65) +
    (encrypted[65] === 'a' ? 'b' : 'a') +
    encrypted.substring(66);
  assert.throws(() => decrypt(tampered, key), /Unsupported state|unable to authenticate/i);
});

test('tampered auth tag is rejected', () => {
  const key = crypto.randomBytes(32).toString('hex');
  const encrypted = encrypt('secret-value', key);
  // Flip a byte in the auth tag portion (chars 32-63)
  const tampered = encrypted.substring(0, 33) +
    (encrypted[33] === 'a' ? 'b' : 'a') +
    encrypted.substring(34);
  assert.throws(() => decrypt(tampered, key), /Unsupported state|unable to authenticate/i);
});

test('wrong key is rejected', () => {
  const key1 = crypto.randomBytes(32).toString('hex');
  const key2 = crypto.randomBytes(32).toString('hex');
  const encrypted = encrypt('my-secret', key1);
  assert.throws(() => decrypt(encrypted, key2), /Unsupported state|unable to authenticate/i);
});

console.log('\n── Key Derivation (PBKDF2) ──');

test('same password + salt produces same key', () => {
  const salt = generateSalt();
  const key1 = deriveKey('MyPassword123!', salt);
  const key2 = deriveKey('MyPassword123!', salt);
  assert.strictEqual(key1, key2);
});

test('different passwords produce different keys', () => {
  const salt = generateSalt();
  const key1 = deriveKey('Password1!abc', salt);
  const key2 = deriveKey('Password2!abc', salt);
  assert.notStrictEqual(key1, key2);
});

test('different salts produce different keys', () => {
  const salt1 = generateSalt();
  const salt2 = generateSalt();
  const key1 = deriveKey('SamePassword!1', salt1);
  const key2 = deriveKey('SamePassword!1', salt2);
  assert.notStrictEqual(key1, key2);
});

test('derived key is 32 bytes (64 hex chars)', () => {
  const key = deriveKey('TestPassword!1', generateSalt());
  assert.strictEqual(key.length, 64);
  assert.ok(/^[0-9a-f]+$/.test(key));
});

test('salt is 16 bytes (32 hex chars)', () => {
  const salt = generateSalt();
  assert.strictEqual(salt.length, 32);
  assert.ok(/^[0-9a-f]+$/.test(salt));
});

console.log('\n── Password Verification Flow ──');

test('correct password verifies successfully', () => {
  const password = 'SecurePass123!x';
  const salt = generateSalt();
  const key = deriveKey(password, salt);
  const verifyToken = encrypt('ironvault-verify', key);

  // Simulate unlock
  const unlockKey = deriveKey(password, salt);
  const result = decrypt(verifyToken, unlockKey);
  assert.strictEqual(result, 'ironvault-verify');
});

test('wrong password fails verification', () => {
  const password = 'SecurePass123!x';
  const wrongPassword = 'WrongPass456!x';
  const salt = generateSalt();
  const key = deriveKey(password, salt);
  const verifyToken = encrypt('ironvault-verify', key);

  const wrongKey = deriveKey(wrongPassword, salt);
  assert.throws(() => decrypt(verifyToken, wrongKey));
});

console.log('\n── Full Credential Lifecycle ──');

test('add → encrypt → store → retrieve → decrypt', () => {
  const password = 'VaultMaster99!x';
  const salt = generateSalt();
  const key = deriveKey(password, salt);

  // Simulate adding credentials
  const credentials = [
    { name: 'OpenAI', value: 'sk-abc123' },
    { name: 'GitHub', value: 'ghp_def456' },
    { name: 'Anthropic', value: 'sk-ant-ghi789' }
  ];

  const stored = credentials.map(c => ({
    name: c.name,
    encrypted_value: encrypt(c.value, key)
  }));

  // Simulate retrieval
  stored.forEach((s, i) => {
    const decrypted = decrypt(s.encrypted_value, key);
    assert.strictEqual(decrypted, credentials[i].value);
  });
});

test('key rotation: re-encrypt with new password', () => {
  const oldPassword = 'OldPassword1!x';
  const newPassword = 'NewPassword2!x';
  const salt = generateSalt();

  const oldKey = deriveKey(oldPassword, salt);
  const encrypted = encrypt('my-api-key', oldKey);

  // Decrypt with old key
  const value = decrypt(encrypted, oldKey);

  // Re-encrypt with new key (new salt for new password)
  const newSalt = generateSalt();
  const newKey = deriveKey(newPassword, newSalt);
  const reEncrypted = encrypt(value, newKey);

  // Verify new encryption works
  assert.strictEqual(decrypt(reEncrypted, newKey), 'my-api-key');

  // Old key can't decrypt new data
  assert.throws(() => decrypt(reEncrypted, oldKey));
});

console.log('\n── Password Strength Validation ──');

test('rejects passwords shorter than 12 chars', () => {
  assert.strictEqual(validatePasswordStrength('Short1!a').valid, false);
});

test('rejects passwords without uppercase', () => {
  assert.strictEqual(validatePasswordStrength('lowercase123!xx').valid, false);
});

test('rejects passwords without lowercase', () => {
  assert.strictEqual(validatePasswordStrength('UPPERCASE123!XX').valid, false);
});

test('rejects passwords without numbers', () => {
  assert.strictEqual(validatePasswordStrength('NoNumbersHere!x').valid, false);
});

test('rejects passwords without special characters', () => {
  assert.strictEqual(validatePasswordStrength('NoSpecials123xx').valid, false);
});

test('accepts strong password', () => {
  assert.strictEqual(validatePasswordStrength('StrongPass123!x').valid, true);
});

test('rejects null/undefined password', () => {
  assert.strictEqual(validatePasswordStrength(null).valid, false);
  assert.strictEqual(validatePasswordStrength(undefined).valid, false);
});

console.log('\n── Security Edge Cases ──');

test('encryption output is hex-only (no binary leaks)', () => {
  const key = crypto.randomBytes(32).toString('hex');
  const encrypted = encrypt('test-value', key);
  assert.ok(/^[0-9a-f]+$/.test(encrypted), 'Output must be hex only');
});

test('credentials with special characters survive round-trip', () => {
  const key = crypto.randomBytes(32).toString('hex');
  const specials = 'p@$$w0rd!#%^&*()_+-=[]{}|;:\'",.<>?/`~\\';
  assert.strictEqual(decrypt(encrypt(specials, key), key), specials);
});

test('newlines in credentials are preserved', () => {
  const key = crypto.randomBytes(32).toString('hex');
  const multiline = 'line1\nline2\nline3';
  assert.strictEqual(decrypt(encrypt(multiline, key), key), multiline);
});

test('very long credential (1MB) encrypts/decrypts correctly', () => {
  const key = crypto.randomBytes(32).toString('hex');
  const longValue = 'x'.repeat(1024 * 1024);
  const encrypted = encrypt(longValue, key);
  const decrypted = decrypt(encrypted, key);
  assert.strictEqual(decrypted.length, longValue.length);
  assert.strictEqual(decrypted, longValue);
});

// ─── Results ───

console.log('\n' + '═'.repeat(50));
console.log(`  Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\n  Failures:');
  failures.forEach(f => console.log(`    - ${f.name}: ${f.error}`));
}
console.log('═'.repeat(50) + '\n');

process.exit(failed > 0 ? 1 : 0);
