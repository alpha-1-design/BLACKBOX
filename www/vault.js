const Vault = (() => {
  const SK = 'bb_vault_salt';
  const STORES = {
    notes:   'bb_notes',
    files:   'bb_files',
    secrets: 'bb_secrets',
    journal: 'bb_journal',
    auth:    'bb_auth',
    clip:    'bb_clip',
  };
  let _key = null;

  async function _deriveKey(pin, salt) {
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), {name:'PBKDF2'}, false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:150000, hash:'SHA-256'}, km, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
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

  async function unlock(pin) { _key = await _deriveKey(pin, _getSalt()); }
  function lock() { _key = null; }
  function isUnlocked() { return !!_key; }

  /* ── Notes (legacy) ── */
  async function saveNote(n) {
    const notes = _raw(STORES.notes), id = n.id || Date.now().toString();
    notes[id] = {id, eT: await _enc(n.title||'Untitled'), eB: await _enc(n.body||''), ts: Date.now()};
    _save(STORES.notes, notes); return id;
  }
  async function getAllNotes() {
    const r = _raw(STORES.notes), out = [];
    for (const id of Object.keys(r).sort((a,b)=>r[b].ts-r[a].ts)) {
      try { out.push({id, title: await _dec(r[id].eT), body: await _dec(r[id].eB), ts: r[id].ts}); } catch {}
    }
    return out;
  }
  async function deleteNote(id) { const n = _raw(STORES.notes); delete n[id]; _save(STORES.notes, n); }

  /* ── Files (legacy) ── */
  async function saveFile(file) {
    const b64 = await new Promise((res,rej) => { const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(file); });
    const id = Date.now().toString(), files = _raw(STORES.files);
    files[id] = {id, eD: await _enc(b64), eN: await _enc(file.name), size: file.size, type: file.type, ts: Date.now()};
    _save(STORES.files, files); return id;
  }
  async function getAllFiles() {
    const r = _raw(STORES.files), out = [];
    for (const id of Object.keys(r).sort((a,b)=>r[b].ts-r[a].ts)) {
      try { out.push({id, name: await _dec(r[id].eN), size: r[id].size, type: r[id].type, ts: r[id].ts}); } catch {}
    }
    return out;
  }
  async function downloadFile(id) {
    const r = _raw(STORES.files), e = r[id]; if (!e) return;
    const b64 = await _dec(e.eD), name = await _dec(e.eN);
    const bytes = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], {type: e.type||'application/octet-stream'}));
    Object.assign(document.createElement('a'), {href:url, download:name}).click();
    URL.revokeObjectURL(url);
  }
  async function deleteFile(id) { const f = _raw(STORES.files); delete f[id]; _save(STORES.files, f); }

  /* ── Secrets ── */
  async function saveSecret(s) {
    const store = _raw(STORES.secrets), id = s.id || crypto.randomUUID();
    const entry = {id, eName: await _enc(s.name), eValue: await _enc(s.value), category: s.category||'other', ts: Date.now()};
    if (s.notes) entry.eNotes = await _enc(s.notes);
    store[id] = entry;
    _save(STORES.secrets, store); return id;
  }
  async function getAllSecrets() {
    const r = _raw(STORES.secrets), out = [];
    for (const id of Object.keys(r).sort((a,b)=>r[b].ts-r[a].ts)) {
      try {
        const item = {id, name: await _dec(r[id].eName), value: await _dec(r[id].eValue), category: r[id].category, ts: r[id].ts};
        if (r[id].eNotes) item.notes = await _dec(r[id].eNotes);
        out.push(item);
      } catch {}
    }
    return out;
  }
  async function deleteSecret(id) { const s = _raw(STORES.secrets); delete s[id]; _save(STORES.secrets, s); }

  /* ── Journal ── */
  async function saveEntry(e) {
    const store = _raw(STORES.journal), id = e.id || crypto.randomUUID();
    const entry = {id, eTitle: await _enc(e.title||'Untitled'), eBody: await _enc(e.body||''), category: e.category||'personal', ts: Date.now()};
    if (e.tags) entry.tags = e.tags;
    store[id] = entry;
    _save(STORES.journal, store); return id;
  }
  async function getAllEntries() {
    const r = _raw(STORES.journal), out = [];
    for (const id of Object.keys(r).sort((a,b)=>r[b].ts-r[a].ts)) {
      try {
        const item = {id, title: await _dec(r[id].eTitle), body: await _dec(r[id].eBody), category: r[id].category, ts: r[id].ts};
        if (r[id].tags) item.tags = r[id].tags;
        out.push(item);
      } catch {}
    }
    return out;
  }
  async function deleteEntry(id) { const j = _raw(STORES.journal); delete j[id]; _save(STORES.journal, j); }

  /* ── Auth / TOTP ── */
  async function saveTotp(t) {
    const store = _raw(STORES.auth), id = t.id || crypto.randomUUID();
    store[id] = {id, eAccount: await _enc(t.account), eSecret: await _enc(t.secret), digits: t.digits||6, ts: Date.now()};
    _save(STORES.auth, store); return id;
  }
  async function getAllTotp() {
    const r = _raw(STORES.auth), out = [];
    for (const id of Object.keys(r).sort((a,b)=>r[b].ts-r[a].ts)) {
      try { out.push({id, account: await _dec(r[id].eAccount), secret: await _dec(r[id].eSecret), digits: r[id].digits, ts: r[id].ts}); } catch {}
    }
    return out;
  }
  async function deleteTotp(id) { const a = _raw(STORES.auth); delete a[id]; _save(STORES.auth, a); }

  /* ── Clipboard ── */
  async function saveClip(text) {
    const e = await _enc(text);
    localStorage.setItem(STORES.clip, JSON.stringify({e, ts: Date.now()}));
  }
  async function getClip() {
    try { const r = JSON.parse(localStorage.getItem(STORES.clip)); if (!r) return null; return {text: await _dec(r.e), ts: r.ts}; } catch { return null; }
  }
  function clearClip() { localStorage.removeItem(STORES.clip); }

  /* ── Backup / Restore ── */
  async function exportBackup() {
    const data = {v:3, ts: Date.now()};
    for (const [name, key] of Object.entries(STORES)) { data[name] = _raw(key); }
    const blob = new Blob([JSON.stringify(data)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {href:url, download:`blackbox-backup-${Date.now()}.blackbox`}).click();
    URL.revokeObjectURL(url);
  }
  async function importBackup(file) {
    const text = await new Promise((res,rej) => { const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsText(file); });
    const data = JSON.parse(text);
    let count = 0;
    for (const [name, key] of Object.entries(STORES)) {
      if (data[name]) { const existing = _raw(key); Object.assign(existing, data[name]); _save(key, existing); count += Object.keys(data[name]).length; }
    }
    return count;
  }

  /* ── Utility ── */
  function clearAll() { Object.values(STORES).forEach(k => localStorage.removeItem(k)); localStorage.removeItem(SK); _key = null; }
  function formatSize(b) { return b<1024?b+' B':b<1048576?(b/1024).toFixed(1)+' KB':(b/1048576).toFixed(1)+' MB'; }
  function relTime(ts) { const d=Date.now()-ts; return d<60000?'just now':d<3600000?Math.floor(d/60000)+'m ago':d<86400000?Math.floor(d/3600000)+'h ago':Math.floor(d/86400000)+'d ago'; }
  function esc(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

  return {
    unlock, lock, isUnlocked,
    saveNote, getAllNotes, deleteNote,
    saveFile, getAllFiles, downloadFile, deleteFile,
    saveSecret, getAllSecrets, deleteSecret,
    saveEntry, getAllEntries, deleteEntry,
    saveTotp, getAllTotp, deleteTotp,
    saveClip, getClip, clearClip,
    exportBackup, importBackup,
    clearAll, formatSize, relTime, esc,
  };
})();
