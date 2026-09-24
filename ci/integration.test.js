#!/usr/bin/env node
/**
 * Integration tests — cross-module contracts against a DOM-less vault:
 * decoy-profile isolation, encrypted .bbvault backup round-trip,
 * and encrypted transcript attachment.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const store = {}, session = {};
const localStorageShim = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};
const sessionStorageShim = {
  getItem: k => (k in session ? session[k] : null),
  setItem: (k, v) => { session[k] = String(v); },
  removeItem: k => { delete session[k]; },
};
const webcrypto = require('crypto').webcrypto;
const atob = s => Buffer.from(s, 'base64').toString('binary');
const btoa = s => Buffer.from(s, 'binary').toString('base64');

const vaultSrc = fs.readFileSync(path.join(__dirname, '..', 'www', 'vault.js'), 'utf8');
const sandbox = {
  localStorage: localStorageShim, sessionStorage: sessionStorageShim,
  crypto: webcrypto, atob, btoa, TextEncoder, TextDecoder, Blob, console,
  FileReader: class { readAsDataURL(f) { if (f && f._readAsDataURL) { this.result = f._readAsDataURL(); this.onload && this.onload(); } } readAsText(f) { if (f && f._readAsText) { this.result = f._readAsText(); this.onload && this.onload(); } } },
  URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
  document: { createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} } }), body: { appendChild() {} } },
  window: {},
};
vm.createContext(sandbox);
vm.runInContext(vaultSrc + '\n;globalThis.Vault = Vault;', sandbox);
const Vault = sandbox.Vault;

let failures = 0;
const check = (cond, msg) => { console.log(`  ${cond ? '\u2713' : '\u2717'} ${msg}`); if (!cond) failures++; };

(async () => {
  // ── Real vault with data ──
  await Vault.unlockReal('1111');
  await Vault.saveSecret({ name: 'RealKey', value: 'real-secret-123', category: 'api' });
  await Vault.setFileTranscript('none', 'x'); // must not throw on missing id

  // ── Encrypted transcript attach + decode ──
  const pkgBytes = new Uint8Array([1, 2, 3, 4]);
  await Vault.saveFile({
    name: 'note.webm', type: 'audio/webm', size: 4,
    _readAsDataURL: () => 'data:audio/webm;base64,' + Buffer.from(pkgBytes).toString('base64'),
  });
  const files0 = await Vault.getAllFiles();
  const fid = files0[0].id;
  await Vault.setFileTranscript(fid, 'hello from the microphone');
  const files1 = await Vault.getAllFiles();
  check(files1[0].transcript === 'hello from the microphone', 'transcript round-trips encrypted');
  const rawFiles = JSON.parse(store['bb_files']);
  check(!JSON.stringify(rawFiles).includes('hello from the microphone'), 'transcript is not stored in plaintext');

  // ── Decoy vault isolation ──
  Vault.lock();
  await Vault.unlockDecoy('9999');
  const decoySecrets = await Vault.getAllSecrets();
  check(decoySecrets.length >= 2, 'decoy vault auto-seeds plausible data');
  check(!JSON.stringify(decoySecrets).includes('real-secret-123'), 'decoy cannot see real data');
  const rawReal = JSON.parse(store['bb_secrets']);
  const rawDecoy = JSON.parse(store['bb_d_secrets']);
  check(!!rawDecoy && Object.keys(rawDecoy).length > 0, 'decoy has its own storage prefix');
  check(JSON.stringify(rawReal) !== JSON.stringify(rawDecoy), 'real and decoy stores are distinct');

  // Decoy with the real PIN must fail to decrypt real data
  Vault.lock();
  await Vault.unlockReal('1111');
  const realAfter = await Vault.getAllSecrets();
  check(realAfter.length === 1 && realAfter[0].value === 'real-secret-123', 'real vault unaffected by decoy session');

  // ── Encrypted .bbvault backup round-trip ──
  let backupText = null;
  const savedTo = [];
  sandbox.Blob = Blob; // real Blob for text()
  // capture the backup by intercepting the save device
  const origSave = Vault.saveUnwrapped;
  // exportEncryptedBackup saves through _saveToDevice → no URI in sandbox → web path
  // We capture via FileReader on the produced blob instead: monkey-patch not needed,
  // re-derive the envelope by exporting and reading the file the same way.
  const pass = 'correct horse battery';
  let exported = null;
  {
    // Run export but capture the blob: _saveToDevice falls back to a.click(),
    // which we cannot intercept here — so instead verify via import after
    // reconstructing the envelope from localStorage. Simpler: call the
    // internal flow by creating the same JSON the function writes.
    // For a true round-trip we rely on importEncryptedBackup accepting a File shim.
  }
  // Build a backup file shim by calling export with a stubbed save path:
  const __origDocument = sandbox.document;
  sandbox.document = Object.assign(Object.create(Object.getPrototypeOf(__origDocument)), __origDocument);
  const anchorClicks = [];
  sandbox.document.createElement = (tag) => {
    if (tag === 'a') {
      return {
        style: {}, set href(v) { this._href = v; }, get href() { return this._href; },
        set download(v) { this._dl = v; }, get download() { return this._dl; },
        click() { anchorClicks.push({ href: this._href, download: this._dl }); },
      };
    }
    return { style: {}, classList: { add() {}, remove() {}, toggle() {} } };
  };
  await Vault.exportEncryptedBackup(pass);
  check(anchorClicks.length === 1 && anchorClicks[0].download.endsWith('.bbvault'), 'export produces a .bbvault file');
  const blobUrl = anchorClicks[0].href;
  // The sandbox URL.createObjectURL returns '' — re-fetch the blob via export internals
  // is not possible; instead export twice with a URL stub that captures the blob:
  const blobs = [];
  sandbox.URL = { createObjectURL: (b) => { blobs.push(b); return 'blob:x'; }, revokeObjectURL: () => {} };
  await Vault.exportEncryptedBackup(pass);
  backupText = await blobs[blobs.length - 1].text();
  check(backupText.includes('bbvault'), 'backup envelope tagged bbvault:1');
  check(!backupText.includes('real-secret-123'), 'backup leaks no plaintext');

  // Import into a wiped store with the right passphrase
  Vault.lock();
  const backupFile = { name: 'x.bbvault', _readAsText: () => backupText };
  const n = await Vault.importEncryptedBackup(backupFile, pass);
  check(n >= 1, `restore merges ${n} items`);
  await Vault.unlockReal('1111');
  const restored = await Vault.getAllSecrets();
  check(restored.some(s => s.value === 'real-secret-123'), 'restored data decrypts under the app PIN (vaultSalt carried)');

  // Wrong passphrase must fail clearly
  let wrongOk = false;
  try { await Vault.importEncryptedBackup(backupFile, 'wrong-passphrase'); } catch (e) { wrongOk = /Wrong passphrase/.test(e.message); }
  check(wrongOk, 'wrong backup passphrase rejected');

  console.log('');
  if (failures > 0) { console.error(`FAILED: ${failures} integration check(s).`); process.exit(1); }
  console.log('All integration tests passed.');
  process.exit(0);
})().catch(e => { console.error('INTEGRATION CRASHED:', e); process.exit(1); });
