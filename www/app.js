const PIN_KEY = 'bb_pin';
const DECOY_KEY = 'bb_decoy';
const SETT_KEY = 'bb_settings';

let PIN = localStorage.getItem(PIN_KEY) || null;
let DECOY_PIN = localStorage.getItem(DECOY_KEY) || '';
let digits = [];
let activeTab = 'home';
let failCount = 0;
let lockoutEnd = 0;
let lockoutInterval = null;
let autoLockTimer = null;

let S = {blur: false, shake: false, autoLock: true, selfDestruct: false};
try { S = {...S, ...JSON.parse(localStorage.getItem(SETT_KEY) || '{}')}; } catch {}

const App = { lock: _lockApp };

window.addEventListener('DOMContentLoaded', () => {
  _initLock();
  _initNav();
  _initSettings();
  _initClipboard();
  _applySettings();
  SecretsModule.init();
  JournalModule.init();
  AuthModule.init();
  PrivacyModule.init();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) _lockApp();
});

/* ── LOCK ── */
function _initLock() {
  document.querySelectorAll('.num-key[data-digit]').forEach(b => b.addEventListener('click', () => _addDigit(b.dataset.digit)));
  document.getElementById('delBtn')?.addEventListener('click', _delDigit);
  document.getElementById('decoyBtn')?.addEventListener('click', _triggerPanic);
  document.getElementById('panicBtn')?.addEventListener('click', _triggerPanic);
  document.getElementById('biometricBtn')?.addEventListener('click', _biometricUnlock);

  let tapCount = 0;
  document.getElementById('panicOverlay')?.addEventListener('click', (e) => {
    if (!e.target.classList.contains('calc-btn')) {
      tapCount++;
      if (tapCount >= 5) { tapCount = 0; _lockApp(); }
    }
  });

  if (!PIN) {
    const newPin = prompt('Set a 4-digit PIN for BLACKBOX:');
    if (newPin && /^\d{4}$/.test(newPin)) {
      PIN = newPin;
      localStorage.setItem(PIN_KEY, PIN);
    } else {
      PIN = '0000';
      localStorage.setItem(PIN_KEY, PIN);
    }
  }
}

function _addDigit(d) {
  if (_isLockedOut()) return;
  if (digits.length >= 4) return;
  digits.push(d);
  _renderDots();
  if (digits.length === 4) _checkPin();
}

function _delDigit() {
  if (digits.length > 0) { digits.pop(); _renderDots(); document.getElementById('pinError').textContent = ''; }
}

function _renderDots() {
  [0, 1, 2, 3].forEach(i => {
    const el = document.getElementById('pd' + i);
    if (el) el.classList.toggle('filled', i < digits.length);
  });
}

async function _checkPin() {
  const entered = digits.join('');
  digits = [];
  _renderDots();

  if (DECOY_PIN && entered === DECOY_PIN) { _triggerPanic(); return; }
  if (entered === PIN) {
    failCount = 0;
    try { await Vault.unlock(entered); } catch {}
    _showApp();
  } else {
    failCount++;
    document.getElementById('lockAttemptInfo').textContent = `Attempt ${failCount}/5`;
    const errEl = document.getElementById('pinError');
    errEl.textContent = 'Wrong PIN';
    document.querySelector('.lock-content')?.classList.add('shake');
    setTimeout(() => {
      document.querySelector('.lock-content')?.classList.remove('shake');
      errEl.textContent = '';
    }, 450);

    if (S.selfDestruct && failCount >= 5) { _selfDestruct(); return; }
    if (failCount >= 3) _startLockout();
  }
}

function _startLockout() {
  lockoutEnd = Date.now() + 120000;
  const numpad = document.getElementById('numpad');
  if (numpad) { numpad.style.opacity = '0.3'; numpad.style.pointerEvents = 'none'; }
  const el = document.getElementById('lockoutTimer');
  if (el) el.classList.remove('hidden');
  lockoutInterval = setInterval(() => {
    const rem = Math.ceil((lockoutEnd - Date.now()) / 1000);
    if (rem <= 0) {
      clearInterval(lockoutInterval);
      lockoutEnd = 0;
      failCount = 0;
      if (numpad) { numpad.style.opacity = ''; numpad.style.pointerEvents = ''; }
      if (el) el.classList.add('hidden');
      document.getElementById('lockAttemptInfo').textContent = '';
    } else {
      if (el) el.textContent = `Locked out — wait ${rem}s`;
    }
  }, 500);
}

function _isLockedOut() { return lockoutEnd > Date.now(); }

function _selfDestruct() {
  Vault.clearAll();
  localStorage.clear();
  document.getElementById('pinError').textContent = 'VAULT WIPED';
  document.getElementById('lockAttemptInfo').textContent = 'All data destroyed';
  setTimeout(() => location.reload(), 2000);
}

function _showApp() {
  document.getElementById('lockScreen').classList.remove('active');
  document.getElementById('mainApp').classList.remove('hidden');
  document.getElementById('panicOverlay').classList.add('hidden');
  _resetAutoLock();
  _refreshAll();
}

function _lockApp() {
  Vault.lock();
  document.getElementById('lockScreen').classList.add('active');
  document.getElementById('mainApp').classList.add('hidden');
  digits = [];
  _renderDots();
  document.getElementById('pinError').textContent = '';
  _clearAutoLock();
  if (PrivacyOverlay.isEnabled()) PrivacyOverlay.disable();
}

async function _biometricUnlock() {
  if (!window.PublicKeyCredential) { _toast('Biometrics not available', 'red'); return; }
  try {
    await navigator.credentials.get({publicKey: {challenge: new Uint8Array(32), rpId: location.hostname, userVerification: 'required', timeout: 30000}});
    try { await Vault.unlock(PIN); } catch {}
    _showApp();
  } catch {
    _toast('Biometric failed — use PIN', 'red');
  }
}

/* ── AUTO-LOCK ── */
function _resetAutoLock() {
  if (!S.autoLock) return;
  _clearAutoLock();
  autoLockTimer = setTimeout(_lockApp, 30000);
}

function _clearAutoLock() {
  if (autoLockTimer) { clearTimeout(autoLockTimer); autoLockTimer = null; }
}

document.addEventListener('touchstart', () => {
  if (!document.getElementById('lockScreen').classList.contains('active')) _resetAutoLock();
}, {passive: true});

/* ── PANIC ── */
function _triggerPanic() {
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('lockScreen').classList.remove('active');
  document.getElementById('panicOverlay').classList.remove('hidden');
  Vault.lock();
}

/* ── NAV ── */
function _initNav() {
  document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => _switchTab(b.dataset.tab)));
  document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => _switchTab(b.dataset.goto)));
}

function _switchTab(tab) {
  if (tab === activeTab) return;
  activeTab = tab;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(tc => {
    tc.classList.toggle('hidden', tc.id !== 'tab-' + tab);
    tc.classList.toggle('active', tc.id === 'tab-' + tab);
  });
  if (tab === 'secrets') SecretsModule.refresh();
  if (tab === 'journal') JournalModule.refresh();
  if (tab === 'auth') AuthModule.refresh();
}

/* ── REFRESH ALL ── */
function _refreshAll() {
  SecretsModule.refresh();
  JournalModule.refresh();
  AuthModule.refresh();
}

/* ── CLIPBOARD ── */
function _initClipboard() {
  document.getElementById('clipSaveBtn')?.addEventListener('click', async () => {
    const text = document.getElementById('clipInput')?.value?.trim();
    if (!text) return;
    try {
      await Vault.saveClip(text);
      document.getElementById('clipStatus').textContent = 'Saved encrypted';
      document.getElementById('clipStatus').style.color = 'var(--green)';
      setTimeout(() => { Vault.clearClip(); document.getElementById('clipStatus').textContent = 'Cleared'; document.getElementById('clipStatus').style.color = 'var(--text3)'; }, 30000);
    } catch { document.getElementById('clipStatus').textContent = 'Failed'; document.getElementById('clipStatus').style.color = 'var(--red)'; }
  });
  document.getElementById('clipClearBtn')?.addEventListener('click', () => {
    document.getElementById('clipInput').value = '';
    Vault.clearClip();
    document.getElementById('clipStatus').textContent = '';
  });
}

/* ── SETTINGS ── */
function _initSettings() {
  _syncToggle('autoLockToggle', S.autoLock, v => {
    S.autoLock = v;
    if (!v) _clearAutoLock(); else _resetAutoLock();
    document.getElementById('autoLockToggle2').checked = v;
    _saveSett();
  });
  _syncToggle('autoLockToggle2', S.autoLock, v => {
    S.autoLock = v;
    if (!v) _clearAutoLock(); else _resetAutoLock();
    document.getElementById('autoLockToggle').checked = v;
    _saveSett();
  });
  _syncToggle('overlayToggle', S.blur, v => {
    S.blur = v;
    v ? PrivacyOverlay.enable() : PrivacyOverlay.disable();
    _saveSett();
  });
  _syncToggle('selfDestructToggle', S.selfDestruct, v => { S.selfDestruct = v; _saveSett(); });
  _syncToggle('clipAutoClear', true, () => {});

  document.getElementById('changePinBtn')?.addEventListener('click', _changePin);
  document.getElementById('setupDecoyBtn')?.addEventListener('click', _setupDecoy);
  document.getElementById('clearVaultBtn')?.addEventListener('click', () => {
    if (confirm('Delete ALL data permanently?')) { Vault.clearAll(); _toast('Vault cleared', 'red'); }
  });
  document.getElementById('resetAppBtn')?.addEventListener('click', () => {
    if (confirm('Factory reset — wipe everything including PIN?')) { localStorage.clear(); location.reload(); }
  });
  document.getElementById('exportSettingsBtn')?.addEventListener('click', () => Vault.exportBackup());
  document.getElementById('importSettingsBtn')?.addEventListener('click', () => document.getElementById('importInput')?.click());
  document.getElementById('importInput')?.addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    const n = await Vault.importBackup(f);
    _toast(`Imported ${n} items`);
    _refreshAll();
    e.target.value = '';
  });
}

function _syncToggle(id, val, onChange) {
  const el = document.getElementById(id);
  if (!el) return;
  el.checked = val;
  el.addEventListener('change', () => { onChange(el.checked); });
}

function _applySettings() {
  if (S.blur) PrivacyOverlay.enable();
}

function _saveSett() { localStorage.setItem(SETT_KEY, JSON.stringify(S)); }

function _changePin() {
  const n = prompt('New 4-digit PIN:');
  if (!n) return;
  if (!/^\d{4}$/.test(n)) { alert('Must be 4 digits'); return; }
  PIN = n;
  localStorage.setItem(PIN_KEY, n);
  _toast('PIN updated');
}

function _setupDecoy() {
  const d = prompt('Decoy PIN (leave blank to disable):');
  if (d === null) return;
  if (d === '') { DECOY_PIN = ''; localStorage.removeItem(DECOY_KEY); _toast('Decoy disabled'); return; }
  if (!/^\d{4}$/.test(d)) { alert('Must be 4 digits'); return; }
  DECOY_PIN = d;
  localStorage.setItem(DECOY_KEY, d);
  _toast('Decoy PIN set');
}

/* ── HELPERS ── */
function _toast(msg, type) {
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'red' ? ' red' : type === 'green' ? ' green' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
