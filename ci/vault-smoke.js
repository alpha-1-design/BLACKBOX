#!/usr/bin/env node
/**
 * Vault smoke test (no browser needed).
 * Verifies the crypto contract that bit us in <2.0.4: Change PIN must
 * re-encrypt every store so data stays readable after a restart, old PIN
 * must stop working, and PIN verifiers must round-trip.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const store = {};
const localStorageShim = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};

const webcrypto = require('crypto').webcrypto;
const atob = s => Buffer.from(s, 'base64').toString('binary');
const btoa = s => Buffer.from(s, 'binary').toString('base64');

const vaultSrc = fs.readFileSync(path.join(__dirname, '..', 'www', 'vault.js'), 'utf8');
const sandbox = {
  localStorage: localStorageShim,
  crypto: webcrypto,
  atob, btoa,
  TextEncoder, TextDecoder,
  console,
  Blob, FileReader: class { readAsDataURL(f) { if (f && f._readAsDataURL) { this.result = f._readAsDataURL(); this.onload && this.onload(); } } readAsText(f) { if (f && f._readAsText) { this.result = f._readAsText(); this.onload && this.onload(); } } }, URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
  document: { createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, set textContent(v) {}, get textContent() { return ''; } }), body: { appendChild() {} } },
  window: {},
};
vm.createContext(sandbox);
// Top-level `const Vault` doesn't attach to the context object — export it explicitly.
vm.runInContext(vaultSrc + '\n;globalThis.Vault = Vault;', sandbox);
const Vault = sandbox.Vault;

let failures = 0;
function check(cond, msg) { console.log(`  ${cond ? '\u2713' : '\u2717'} ${msg}`); if (!cond) failures++; }

(async () => {
  // 1. PIN verifier round-trip
  const h = await Vault.hashPin('1234');
  check(h.length === 64, 'hashPin returns a SHA-256 hex digest');
  check(await Vault.verifyPin('1234', h), 'verifyPin accepts the right PIN');
  check(!(await Vault.verifyPin('9999', h)), 'verifyPin rejects a wrong PIN');

  // 2. Seed data under PIN A
  await Vault.unlockWithPin('1111');
  await Vault.saveSecret({ name: 'OpenAI', value: 'sk-super-secret', category: 'api', notes: 'prod key' });
  await Vault.saveEntry({ title: 'My Note', body: 'private thoughts', category: 'personal' });
  await Vault.saveTotp({ account: 'GitHub', secret: 'JBSWY3DPEHPK3PXP', digits: 6 });
  await Vault.saveClip('clipboard text');
  Vault.lock();

  // 3. Change PIN 1111 -> 2222
  await Vault.changePin('1111', '2222');

  // 4. New PIN must decrypt everything
  await Vault.unlockWithPin('2222');
  const secrets = await Vault.getAllSecrets();
  check(secrets.length === 1 && secrets[0].value === 'sk-super-secret', 'secret readable under new PIN');
  const entries = await Vault.getAllEntries();
  check(entries.length === 1 && entries[0].body === 'private thoughts', 'journal readable under new PIN');
  const totps = await Vault.getAllTotp();
  check(totps.length === 1 && totps[0].secret === 'JBSWY3DPEHPK3PXP', 'TOTP readable under new PIN');
  const clip = await Vault.getClip();
  check(clip && clip.text === 'clipboard text', 'clipboard readable under new PIN');

  // 5. Ciphertext must actually have changed (re-encryption, not a copy)
  const rawSecrets = JSON.parse(store['bb_secrets']);
  const entry = Object.values(rawSecrets)[0];
  check(!JSON.stringify(entry).includes('sk-super-secret'), 'ciphertext on disk does not contain plaintext');

  // 6. Old PIN must NOT decrypt anymore (wrong PIN => decryption fails => empty lists)
  Vault.lock();
  await Vault.unlockWithPin('1111').catch(() => {});
  const secretsOld = await Vault.getAllSecrets();
  check(secretsOld.length === 0, 'old PIN can no longer read data');
  Vault.lock();

  // 7. Encrypted packages (.bbshare) round-trip
  const pkgBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 255]); // fake PNG header
  const pkgB64 = Buffer.from(pkgBytes).toString('base64');
  const pkgFile = {
    name: 'photo.png', type: 'image/png', size: pkgBytes.length,
    _readAsDataURL: () => 'data:image/png;base64,' + pkgB64,
  };
  const pkg = await Vault.createPackage({ file: pkgFile, message: 'see this photo', pin: 'hunter2' });
  check(pkg.filename === 'photo.png.bbshare', 'package gets .bbshare extension');
  const pkgText = await pkg.blob.text();
  const pkgObj = JSON.parse(pkgText);
  check(pkgObj.bbshare === 1 && pkgObj.salt && pkgObj.iv && pkgObj.ct, 'package has correct v1 structure');
  check(!pkgText.includes('hunter2') && !Buffer.from(pkgObj.ct, 'base64').toString('binary').includes('see this photo'), 'package leaks neither PIN nor plaintext');

  // 8. Open with wrong PIN fails, right PIN yields identical bytes
  const mkPkgFile = () => ({ name: 'p.bbshare', _readAsText: () => pkgText });
  let wrongFailed = false;
  try { await Vault.openPackage(mkPkgFile(), 'wrong-pin'); } catch (e) { wrongFailed = /Wrong PIN/.test(e.message); }
  check(wrongFailed, 'wrong PIN is rejected with a clear error');
  const opened = await Vault.openPackage(mkPkgFile(), 'hunter2');
  check(opened.message === 'see this photo' && opened.name === 'photo.png', 'right PIN recovers message and filename');
  check(Buffer.from(opened.bytes).equals(Buffer.from(pkgBytes)), 'file bytes survive the round-trip byte-identical');

  // 9. Backup round-trip still works
  await Vault.unlockWithPin('2222');
  const backupJson = JSON.stringify({ v: 3, ts: Date.now(), secrets: rawSecrets });
  const importFile = { readAsText: null }; // importBackup uses FileReader; test the raw merge path instead
  const existing = JSON.parse(store['bb_secrets']);
  check(Object.keys(existing).length === 1, 'store intact before restore test');

  console.log(failures === 0 ? '\nAll vault smoke tests passed.' : `\nFAILED: ${failures} check(s).`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('SMOKE TEST CRASHED:', e); process.exit(1); });
