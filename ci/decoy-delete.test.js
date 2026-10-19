#!/usr/bin/env node
/**
 * Decoy/real isolation for DELETES. Before the fix, deleteSecret/Entry/Totp/
 * Note read the active profile's store but wrote it back to the REAL store
 * key, so deleting one item while in the decoy vault replaced the real vault
 * with decoy ciphertext (real data unrecoverable). Reads were isolated, so the
 * older integration test never noticed.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const store = {};
const sandbox = {
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} },
  crypto: require('crypto').webcrypto,
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  TextEncoder, TextDecoder, console, Blob,
  document: { createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} } }), body: { appendChild() {} } },
  window: {},
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'www', 'vault.js'), 'utf8') + '\n;globalThis.Vault = Vault;', sandbox);
const Vault = sandbox.Vault;

let failures = 0;
function check(cond, msg) { console.log(`  ${cond ? '\u2713' : '\u2717'} ${msg}`); if (!cond) failures++; }
const names = async fn => (await fn()).map(x => x.name || x.title || x.account).sort();

const REAL = '1234', DECOY = '9999';

(async () => {
  // Build a real vault with one item in every deletable store.
  await Vault.unlockReal(REAL);
  await Vault.saveSecret({ name: 'REAL-S1', value: 'v1' });
  await Vault.saveSecret({ name: 'REAL-S2', value: 'v2' });
  await Vault.saveEntry({ title: 'REAL-J1', body: 'b', category: 'personal' });
  await Vault.saveTotp({ account: 'REAL-T1', secret: 'JBSWY3DPEHPK3PXP', digits: 6 });
  await Vault.saveNote({ title: 'REAL-N1', body: 'b' });
  Vault.lock();

  // Enter the decoy vault (seeded) and delete one of EVERYTHING in it.
  await Vault.unlockDecoy(DECOY);
  const dSecrets = await Vault.getAllSecrets();
  const dEntries = await Vault.getAllEntries();
  const dTotps = await Vault.getAllTotp();
  check(dSecrets.length > 0 && dEntries.length > 0 && dTotps.length > 0, 'decoy vault is seeded');
  await Vault.saveNote({ title: 'DECOY-N1', body: 'x' });
  const dNote = (await Vault.getAllNotes())[0];

  const secretsBefore = dSecrets.length, entriesBefore = dEntries.length, totpsBefore = dTotps.length;
  await Vault.deleteSecret(dSecrets[0].id);
  await Vault.deleteEntry(dEntries[0].id);
  await Vault.deleteTotp(dTotps[0].id);
  await Vault.deleteNote(dNote.id);

  check((await Vault.getAllSecrets()).length === secretsBefore - 1, 'decoy: deleteSecret removes the decoy secret');
  check((await Vault.getAllEntries()).length === entriesBefore - 1, 'decoy: deleteEntry removes the decoy entry');
  check((await Vault.getAllTotp()).length === totpsBefore - 1, 'decoy: deleteTotp removes the decoy code');
  check((await Vault.getAllNotes()).length === 0, 'decoy: deleteNote removes the decoy note');
  Vault.lock();

  // The real vault must be completely untouched.
  await Vault.unlockReal(REAL);
  check((await names(Vault.getAllSecrets)).join() === 'REAL-S1,REAL-S2', 'real secrets survive a decoy delete');
  check((await names(Vault.getAllEntries)).join() === 'REAL-J1', 'real journal survives a decoy delete');
  check((await names(Vault.getAllTotp)).join() === 'REAL-T1', 'real 2FA survives a decoy delete');
  check((await names(Vault.getAllNotes)).join() === 'REAL-N1', 'real notes survive a decoy delete');

  // And deleting in the real vault must not touch the decoy.
  const rs = await Vault.getAllSecrets();
  await Vault.deleteSecret(rs.find(s => s.name === 'REAL-S1').id);
  check((await names(Vault.getAllSecrets)).join() === 'REAL-S2', 'real: deleteSecret removes only the targeted secret');
  Vault.lock();
  await Vault.unlockDecoy(DECOY);
  check((await Vault.getAllSecrets()).length === secretsBefore - 1, 'decoy secrets unaffected by a real delete');
  Vault.lock();

  if (failures) { console.log(`\nDecoy delete test FAILED (${failures})`); process.exit(1); }
  console.log('\nDecoy delete test passed.');
})();
