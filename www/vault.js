const Vault = (() => {
  const SK = 'bb_vault_salt';
  const DKEY = 'bb_d_salt'; // separate salt for the decoy profile
  const PINHASH_KEY = 'bb_pin_hash';        // SHA-256(salt2 + PIN) — migration target
  const PINHASH_SALT_KEY = 'bb_pin_hash_salt';
  const STORES = {
    notes:   'bb_notes',
    files:   'bb_files',
    secrets: 'bb_secrets',
    journal: 'bb_journal',
    auth:    'bb_auth',
    clip:    'bb_clip',
  };
  let _key = null;
  let _profile = 'real'; // 'real' | 'decoy'

  async function _deriveKey(pin, salt) {
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), {name:'PBKDF2'}, false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:150000, hash:'SHA-256'}, km, {name:'AES-GCM', length:256}, true, ['encrypt','decrypt']);
  }
  function _getSalt() {
    let b = localStorage.getItem(SK);
    if (!b) { const s = crypto.getRandomValues(new Uint8Array(16)); b = btoa(String.fromCharCode(...s)); localStorage.setItem(SK, b); }
    return Uint8Array.from(atob(b), c => c.charCodeAt(0));
  }
  async function _enc(text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv}, _key, new TextEncoder().encode(text)));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
    return btoa(String.fromCharCode(...out));
  }
  async function _dec(b64) {
    const d = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:d.slice(0,12)}, _key, d.slice(12));
    return new TextDecoder().decode(pt);
  }
  function _raw(storeKey) { try { return JSON.parse(localStorage.getItem(storeKey)||'{}'); } catch { return {}; } }
  function _save(storeKey, data) { localStorage.setItem(storeKey, JSON.stringify(data)); }

  /* ── PIN handling ──
     PINs are never stored in plaintext: we keep only a salted SHA-256
     verifier. unlockWithPin() derives the AES key from the entered PIN,
     so correctness of the PIN is proven by whether decryption succeeds. */
  async function hashPin(pin) {
    let saltB64 = localStorage.getItem(PINHASH_SALT_KEY);
    if (!saltB64) {
      saltB64 = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
      localStorage.setItem(PINHASH_SALT_KEY, saltB64);
    }
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(saltB64 + ':' + pin));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  /** Async compare — always await. Returns true when `pin` hashes to `hashed`. */
  async function verifyPin(pin, hashed) {
    if (!hashed) return false;
    return (await hashPin(pin)) === hashed;
  }

  /** Plain-PIN entry point for the active profile. */
  async function unlockWithPin(pin) {
    _key = await _deriveKey(pin, await _saltFor());
    try { // cache raw key for this app-process so biometric re-auth works
      const raw = await crypto.subtle.exportKey('raw', _key);
      sessionStorage.setItem('bb_mkey', btoa(String.fromCharCode(...new Uint8Array(raw))));
      sessionStorage.setItem('bb_mprofile', _profile);
    } catch {}
  }
  /** Unlock from the cached per-session key (biometric re-auth). Restores last profile. */
  async function unlockFromSession() {
    const b64 = sessionStorage.getItem('bb_mkey');
    if (!b64) throw new Error('no session key');
    _profile = sessionStorage.getItem('bb_mprofile') === 'decoy' ? 'decoy' : 'real';
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    _key = await crypto.subtle.importKey('raw', raw, {name:'AES-GCM'}, false, ['encrypt','decrypt']);
  }

  /** Re-encrypt every store under a new PIN (used by Change PIN). Real profile only. */
  async function changePin(oldPin, newPin) {
    if (_profile === 'decoy') throw new Error('changePin is not available in the decoy vault');
    await unlockWithPin(oldPin); // verify + get key for the old pin
    const snapshot = {};
    for (const [name, key] of Object.entries(STORES)) {
      const raw = _raw(_sk(name));
      if (!Object.keys(raw).length) continue;
      if (name === 'clip') { snapshot.clip = { text: await _dec(raw.e), ts: raw.ts }; continue; }
      snapshot[name] = {};
      for (const [id, entry] of Object.entries(raw)) {
        const plain = {};
        for (const [field, val] of Object.entries(entry)) {
          plain[field] = (typeof val === 'string' && /^e[A-Z]/.test(field)) ? await _dec(val) : val;
        }
        snapshot[name][id] = plain;
      }
    }
    // Re-encrypt with the new key, then persist atomically per store
    await unlockWithPin(newPin);
    for (const [name, data] of Object.entries(snapshot)) {
      if (name === 'clip') { await saveClip(data.text); continue; }
      const out = {};
      for (const [id, entry] of Object.entries(data)) {
        const enc = {};
        for (const [field, val] of Object.entries(entry)) {
          enc[field] = (typeof val === 'string' && /^e[A-Z]/.test(field)) ? await _enc(val) : val;
        }
        out[id] = enc;
      }
      _save(_sk(name), out);
    }
  }

  /* ── Profile-aware stores ──
     The real vault and the decoy vault live under different storage
     prefixes and different salts, so a key derived from one PIN can
     never decrypt the other profile's data. */
  function _sk(name) { return _profile === 'decoy' ? 'bb_d_' + name : 'bb_' + name; }
  async function _saltFor() {
    if (_profile !== 'decoy') return _getSalt();
    let b = localStorage.getItem(DKEY);
    if (!b) { b = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))); localStorage.setItem(DKEY, b); }
    return Uint8Array.from(atob(b), c => c.charCodeAt(0));
  }

  /** Unlock the REAL vault (main PIN). */
  async function unlockReal(pin) {
    _profile = 'real';
    await unlockWithPin(pin);
  }
  /** Unlock the DECOY vault (decoy PIN); seeds it with plausible data on first use. */
  async function unlockDecoy(pin) {
    _profile = 'decoy';
    try {
      await unlockWithPin(pin);
    } catch (e) { _profile = 'real'; throw e; }
    await _seedDecoyIfEmpty();
  }
  function activeProfile() { return _profile; }

  async function _seedDecoyIfEmpty() {
    if (Object.keys(_raw(_sk('secrets'))).length) return;
    const day = 86400000, ago = n => Date.now() - n * day;
    await saveSecret({name:'GitHub', value:'ghp_9fLx2PqR7sTn3YwKvB1mZdC8aEjU', category:'api', notes:'personal account — rotate quarterly'});
    await saveSecret({name:'Google', value:'gqxz-4471-abcd-9920-plmw', category:'password', notes:'recovery email: sam.g@gmail.com'});
    await saveEntry({title:'Gym plan', body:'Mon/Wed/Fri strength, weekend long run. Cut coffee after 2pm.', category:'personal'});
    await saveEntry({title:'Gift ideas', body:'Dad: leather gloves. Mum: new Kindle. Sam: vinyl + gift card.', category:'ideas'});
    await saveTotp({account:'Email', secret:'KRSXG5CTMVRXEZLU', digits:6});
    await saveClip('wifi HomeNet-F2G7 — sunset-taco-42');
    // Backdate so it looks like a vault that has been in use for months
    for (const name of ['secrets','journal','auth']) {
      const raw = _raw(_sk(name)); let i = 2;
      for (const id of Object.keys(raw)) { raw[id].ts = ago(3 * i++); }
      _save(_sk(name), raw);
    }
  }

  /** Wipe decoy stores and re-seed on next decoy unlock. */
  function resetDecoyVault() {
    Object.values(STORES).forEach(k => localStorage.removeItem('bb_d_' + k));
    localStorage.removeItem(DKEY);
  }

  function lock() { _key = null; }
  function isUnlocked() { return !!_key; }

  /* ── Notes (legacy) ── */
  async function saveNote(n) {
    const notes = _raw(_sk('notes')), id = n.id || Date.now().toString();
    notes[id] = {id, eT: await _enc(n.title||'Untitled'), eB: await _enc(n.body||''), ts: Date.now()};
    _save(_sk('notes'), notes); return id;
  }
  async function getAllNotes() {
    const r = _raw(_sk('notes')), out = [];
    for (const id of Object.keys(r).sort((a,b)=>r[b].ts-r[a].ts)) {
      try { out.push({id, title: await _dec(r[id].eT), body: await _dec(r[id].eB), ts: r[id].ts}); } catch {}
    }
    return out;
  }
  async function deleteNote(id) { const n = _raw(_sk('notes')); delete n[id]; _save(STORES.notes, n); }

  /* ── Files (legacy) ── */
  async function saveFile(file) {
    const b64 = await new Promise((res,rej) => { const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(file); });
    const id = Date.now().toString(), files = _raw(_sk('files'));
    files[id] = {id, eD: await _enc(b64), eN: await _enc(file.name), size: file.size, type: file.type, ts: Date.now()};
    _save(_sk('files'), files); return id;
  }
  async function getAllFiles() {
    const r = _raw(_sk('files')), out = [];
    for (const id of Object.keys(r).sort((a,b)=>r[b].ts-r[a].ts)) {
      try {
        const item = {id, name: await _dec(r[id].eN), size: r[id].size, type: r[id].type, ts: r[id].ts};
        if (r[id].eTr) { try { item.transcript = await _dec(r[id].eTr); } catch {} }
        out.push(item);
      } catch {}
    }
    return out;
  }
  async function downloadFile(id) {
    const r = _raw(_sk('files')), e = r[id]; if (!e) return;
    const b64 = await _dec(e.eD), name = await _dec(e.eN);
    const bytes = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
    const blob = new Blob([bytes], {type: e.type||'application/octet-stream'});
    const res = await _saveToDevice(name, blob);
    if (res.uri) _notify(`Saved to Documents/BLACKBOX/${name}`);
    else if (!res.web) _notify('File could not be saved', 'red');
    else _notify('File downloaded');
  }
  async function deleteFile(id) { const f = _raw(_sk('files')); delete f[id]; _save(_sk('files'), f); }
  /** Attach an encrypted transcript to a stored file (voice notes). */
  async function setFileTranscript(id, text) {
    const files = _raw(_sk('files'));
    if (!files[id]) return;
    files[id].eTr = await _enc(text);
    _save(_sk('files'), files);
  }

  /* ── Secrets ── */
  async function saveSecret(s) {
    const store = _raw(_sk('secrets')), id = s.id || crypto.randomUUID();
    const entry = {id, eName: await _enc(s.name), eValue: await _enc(s.value), category: s.category||'other', ts: Date.now()};
    if (s.notes) entry.eNotes = await _enc(s.notes);
    store[id] = entry;
    _save(_sk('secrets'), store); return id;
  }
  async function getAllSecrets() {
    const r = _raw(_sk('secrets')), out = [];
    for (const id of Object.keys(r).sort((a,b)=>r[b].ts-r[a].ts)) {
      try {
        const item = {id, name: await _dec(r[id].eName), value: await _dec(r[id].eValue), category: r[id].category, ts: r[id].ts};
        if (r[id].eNotes) item.notes = await _dec(r[id].eNotes);
        out.push(item);
      } catch {}
    }
    return out;
  }
  async function deleteSecret(id) { const s = _raw(_sk('secrets')); delete s[id]; _save(STORES.secrets, s); }

  /* ── Journal ── */
  async function saveEntry(e) {
    const store = _raw(_sk('journal')), id = e.id || crypto.randomUUID();
    const entry = {id, eTitle: await _enc(e.title||'Untitled'), eBody: await _enc(e.body||''), category: e.category||'personal', ts: Date.now()};
    if (e.tags) entry.tags = e.tags;
    store[id] = entry;
    _save(_sk('journal'), store); return id;
  }
  async function getAllEntries() {
    const r = _raw(_sk('journal')), out = [];
    for (const id of Object.keys(r).sort((a,b)=>r[b].ts-r[a].ts)) {
      try {
        const item = {id, title: await _dec(r[id].eTitle), body: await _dec(r[id].eBody), category: r[id].category, ts: r[id].ts};
        if (r[id].tags) item.tags = r[id].tags;
        out.push(item);
      } catch {}
    }
    return out;
  }
  async function deleteEntry(id) { const j = _raw(_sk('journal')); delete j[id]; _save(STORES.journal, j); }

  /* ── Auth / TOTP ── */
  async function saveTotp(t) {
    const store = _raw(_sk('auth')), id = t.id || crypto.randomUUID();
    store[id] = {id, eAccount: await _enc(t.account), eSecret: await _enc(t.secret), digits: t.digits||6, ts: Date.now()};
    _save(_sk('auth'), store); return id;
  }
  async function getAllTotp() {
    const r = _raw(_sk('auth')), out = [];
    for (const id of Object.keys(r).sort((a,b)=>r[b].ts-r[a].ts)) {
      try { out.push({id, account: await _dec(r[id].eAccount), secret: await _dec(r[id].eSecret), digits: r[id].digits, ts: r[id].ts}); } catch {}
    }
    return out;
  }
  async function deleteTotp(id) { const a = _raw(_sk('auth')); delete a[id]; _save(STORES.auth, a); }

  /* ── Clipboard ── */
  async function saveClip(text) {
    const e = await _enc(text);
    localStorage.setItem(_sk('clip'), JSON.stringify({e, ts: Date.now()}));
  }
  async function getClip() {
    try { const r = JSON.parse(localStorage.getItem(_sk('clip'))); if (!r) return null; return {text: await _dec(r.e), ts: r.ts}; } catch { return null; }
  }
  function clearClip() { localStorage.removeItem(_sk('clip')); }

  /* ── Encrypted packages (.bbshare) ──
     Send any file + a message to another BLACKBOX user with no server:
     the payload is encrypted with a key derived from a PIN you agree on
     out-of-band. The recipient opens the .bbshare file in their app.
     Format v1: {bbshare:1, salt, iv, ct} — ct = AES-GCM(PBKDF2(pin,salt))
     over JSON {msg, name, type, data:b64(fileBytes)}. */
  function _b64ToBytes(b64) { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }
  function _bytesToB64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }

  async function _derivePkgKey(pin, salt) {
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), {name:'PBKDF2'}, false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:150000, hash:'SHA-256'}, km, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
  }

  async function createPackage(opts) {
    const { file, message, pin } = opts;
    if (!file) throw new Error('no file');
    if (!pin || pin.length < 4) throw new Error('PIN must be at least 4 characters');
    const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await _derivePkgKey(pin, salt);
    const payload = JSON.stringify({ msg: message || '', name: file.name || 'file', type: file.type || 'application/octet-stream', data: b64 });
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(payload));
    const pkg = { bbshare: 1, v: 1, salt: _bytesToB64(salt), iv: _bytesToB64(iv), ct: _bytesToB64(ct) };
    const outName = (file.name || 'package') + '.bbshare';
    return { blob: new Blob([JSON.stringify(pkg)], { type: 'application/json' }), filename: outName };
  }

  async function openPackage(file, pin) {
    const text = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });
    let pkg;
    try { pkg = JSON.parse(text); } catch { throw new Error('Not a BLACKBOX package'); }
    if (pkg.bbshare !== 1 || !pkg.salt || !pkg.iv || !pkg.ct) throw new Error('Not a BLACKBOX package');
    const key = await _derivePkgKey(pin, _b64ToBytes(pkg.salt));
    let pt;
    try {
      pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: _b64ToBytes(pkg.iv) }, key, _b64ToBytes(pkg.ct));
    } catch {
      throw new Error('Wrong PIN — the package stays encrypted');
    }
    const payload = JSON.parse(new TextDecoder().decode(pt));
    return { message: payload.msg || '', name: payload.name || 'file', type: payload.type || 'application/octet-stream', bytes: _b64ToBytes(payload.data) };
  }

  /** Save unwrapped package content (or any bytes) to Documents/BLACKBOX/. */
  async function saveUnwrapped(name, blob) {
    return _saveToDevice(name, blob);
  }

  /* ── Native file output (Capacitor Filesystem) ── */
  function _capPlugin(name) {
    try { return window.Capacitor?.Plugins?.[name] || null; } catch { return null; }
  }
  function _blobToBase64(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }
  function _notify(msg, type) {
    try {
      const t = document.createElement('div');
      t.className = 'toast ' + (type || 'green');
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 3500);
    } catch (e) { /* ignore */ }
  }

  /**
   * Save a blob to the device. In the Capacitor WebView a hidden <a download>
   * click does nothing and gives the user no idea where the file went, so we
   * write through the native Filesystem plugin to Documents/BLACKBOX/ and
   * return the real URI so the UI can show exactly where the file landed.
   * Falls back to the classic browser download when no native bridge exists.
   *
   * NOTE: do not re-add @capacitor/share@5 — its load() registers a
   * BroadcastReceiver without RECEIVER_EXPORTED/NOT_EXPORTED, which is a
   * fatal SecurityException on Android 14+ when targeting SDK 34.
   */
  async function _saveToDevice(name, blob) {
    const FS = _capPlugin('Filesystem');
    if (FS) {
      try {
        const data = await _blobToBase64(blob);
        const path = 'BLACKBOX/' + name;
        await FS.writeFile({ path, data, directory: 'Documents', recursive: true });
        const uri = (await FS.getUri({ path, directory: 'Documents' })).uri;
        return { ok: true, uri, shared: false };
      } catch (e) {
        console.warn('[BLACKBOX] native save failed, falling back to web download:', e);
      }
    }
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: name }).click();
    URL.revokeObjectURL(url);
    return { ok: true, uri: null, web: true };
  }

  /** Decrypted bytes for a stored file (image thumbnails, playback). */
  async function getFileBlob(id) {
    const e = _raw(_sk('files'))[id];
    if (!e) return null;
    const b64 = await _dec(e.eD);
    return new Blob([_b64ToBytes(b64)], { type: e.type || 'application/octet-stream' });
  }

  /* ── Backup / Restore ──
     The .bbvault export is encrypted with its OWN passphrase (not the app
     PIN), so it is safe in transit AND restorable on any device — the
     vault salt travels inside the encrypted envelope. */
  async function exportEncryptedBackup(passphrase) {
    if (_profile === 'decoy') throw new Error('Backups are only available in your main vault');
    if (!passphrase || passphrase.length < 8) throw new Error('Passphrase must be at least 8 characters');
    const stores = {};
    for (const [name, key] of Object.entries(STORES)) {
      const raw = _raw(_sk(name));
      if (Object.keys(raw).length) stores[name] = raw;
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await _derivePkgKey(passphrase, salt);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify({ v: 4, ts: Date.now(), ...stores })));
    const pkg = {
      bbvault: 1,
      salt: _bytesToB64(salt),
      vaultSalt: btoa(String.fromCharCode(..._getSalt())), // so the restore can decrypt data on any device
      iv: _bytesToB64(iv),
      ct: _bytesToB64(ct),
    };
    const name = `blackbox-vault-${Date.now()}.bbvault`;
    const blob = new Blob([JSON.stringify(pkg)], { type: 'application/json' });
    const res = await _saveToDevice(name, blob);
    if (res.uri) _notify(`Encrypted backup saved to Documents/BLACKBOX/${name}`);
    else if (!res.web) _notify('Backup could not be saved', 'red');
    else _notify('Encrypted backup downloaded');
    return res;
  }

  async function importEncryptedBackup(file, passphrase) {
    const text = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });
    let pkg;
    try { pkg = JSON.parse(text); } catch { throw new Error('Not a BLACKBOX backup'); }
    if (pkg.bbvault !== 1 || !pkg.salt || !pkg.iv || !pkg.ct) throw new Error('Not a BLACKBOX backup');
    const key = await _derivePkgKey(passphrase, _b64ToBytes(pkg.salt));
    let pt;
    try {
      pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: _b64ToBytes(pkg.iv) }, key, _b64ToBytes(pkg.ct));
    } catch {
      throw new Error('Wrong passphrase');
    }
    const data = JSON.parse(new TextDecoder().decode(pt));
    if (pkg.vaultSalt) localStorage.setItem(SK, pkg.vaultSalt); // restore on any device
    let count = 0;
    for (const [name, key] of Object.entries(STORES)) {if (data[name]) { const existing = _raw(_sk(name)); Object.assign(existing, data[name]); _save(_sk(name), existing); count += Object.keys(data[name]).length; }
    }
    return count;
  }

  async function exportBackup() {
    if (_profile === 'decoy') throw new Error('Backups are only available in your main vault');
    const data = {v:3, ts: Date.now()};
    for (const [name, key] of Object.entries(STORES)) { data[name] = _raw(_sk(name)); }
    const name = `blackbox-backup-${Date.now()}.blackbox`;
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const res = await _saveToDevice(name, blob);
    if (res.uri) {
      _notify(`Backup saved to Documents/BLACKBOX/${name}`);
    } else if (!res.web) {
      _notify('Backup could not be saved', 'red');
    } else {
      _notify('Backup downloaded');
    }
    return res;
  }
  async function importBackup(file) {
    const text = await new Promise((res,rej) => { const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsText(file); });
    const data = JSON.parse(text);
    let count = 0;
    for (const [name, key] of Object.entries(STORES)) {
      if (data[name]) { const existing = _raw(_sk(name)); Object.assign(existing, data[name]); _save(_sk(name), existing); count += Object.keys(data[name]).length; }
    }
    return count;
  }

  /* ── Utility ── */
  function clearAll() {
    for (const name of Object.keys(STORES)) { localStorage.removeItem(STORES[name]); localStorage.removeItem('bb_d_' + name); }
    localStorage.removeItem(SK); localStorage.removeItem(DKEY); _key = null;
  }
  function formatSize(b) { return b<1024?b+' B':b<1048576?(b/1024).toFixed(1)+' KB':(b/1048576).toFixed(1)+' MB'; }
  function relTime(ts) { const d=Date.now()-ts; return d<60000?'just now':d<3600000?Math.floor(d/60000)+'m ago':d<86400000?Math.floor(d/3600000)+'h ago':Math.floor(d/86400000)+'d ago'; }
  function esc(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

  return {
    hashPin, verifyPin,
    unlockWithPin, unlockReal, unlockDecoy, unlockFromSession, activeProfile,
    resetDecoyVault, changePin,
    lock, isUnlocked,
    saveNote, getAllNotes, deleteNote,
    saveFile, getAllFiles, downloadFile, deleteFile,
    saveSecret, getAllSecrets, deleteSecret,
    saveEntry, getAllEntries, deleteEntry,
    saveTotp, getAllTotp, deleteTotp,
    saveClip, getClip, clearClip,
    createPackage, openPackage, saveUnwrapped,
    getFileBlob, setFileTranscript,
    exportBackup, importBackup, exportEncryptedBackup, importEncryptedBackup,
    clearAll, formatSize, relTime, esc,
  };
})();
