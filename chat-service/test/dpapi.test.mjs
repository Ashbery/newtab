import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encryption } from '../dpapi.mjs';

test('CurrentUser DPAPI round-trip protects synthetic credentials without writing plaintext', { skip: process.platform !== 'win32' }, async () => {
  const plaintext = JSON.stringify({ token: 'SYNTHETIC_TEST_TOKEN_NO_ACCOUNT', label: '測試貓貓 🐾' });
  assert.equal(encryption.isAvailable(), true);
  const encrypted = await encryption.encrypt(plaintext);
  assert.ok(encrypted instanceof Uint8Array); assert.ok(encrypted.length > plaintext.length);
  assert.ok(!Buffer.from(encrypted).includes(Buffer.from('SYNTHETIC_TEST_TOKEN_NO_ACCOUNT')));
  assert.equal(await encryption.decrypt(encrypted), plaintext);
  const again = await encryption.encrypt(plaintext);
  assert.notDeepEqual(again, encrypted, 'DPAPI ciphertext must be randomized');
});

test('corrupt DPAPI bytes fail closed with a generic non-sensitive error', { skip: process.platform !== 'win32' }, async () => {
  await assert.rejects(encryption.decrypt(Buffer.from('SYNTHETIC_CORRUPTED_CIPHER')), error => {
    assert.ok(!error.message.includes('SYNTHETIC')); return /Credential encryption failed/.test(error.message);
  });
});
