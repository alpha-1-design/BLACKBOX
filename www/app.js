const PIN_KEY = 'bb_pin';
const DECOY_KEY = 'bb_decoy';
const SETT_KEY = 'bb_settings';

let PIN = localStorage.getItem(PIN_KEY) || null; // salted SHA-256 verifier (or legacy plaintext, migrated on first unlock)
let DECOY_PIN = localStorage.getItem(DECOY_KEY) || ''; // same, for the decoy profile
let digits = [];
let activeTab = 'home';
let _setupActive = false;
let _bioReady = false; // a persisted master key exists → fingerprint can unlock
let _animLock = false; // re-lock while the unlock animation is playing
let failCount = 0;
let lockoutEnd = 0;
let lockoutInterval = null;
let autoLockTimer = null;

let S = {blur: false, shake: false, autoLock: true, selfDestruct: false, alive: false, wallpaper: 'none'};
try { S = {...S, ...JSON.parse(localStorage.getItem(SETT_KEY) || '{}')}; } catch {}

const App = { lock: _lockApp };

window.addEventListener('DOMContentLoaded', () => {
  // About-section version always comes from the single source of truth
  // (updater.js currentVersion, enforced == package.json == gradle by ci/checks.js)
  const aboutVersion = document.getElementById('aboutVersion');
  if (aboutVersion && window.Updater) aboutVersion.textContent = 'BLACKBOX v' + Updater.currentVersion;

  _initDialogs();
  _initLock();
  _initBiometric();
  _initNav();
  _initSettings();
  _applySettings();
  SecretsModule.init();
  FilesManager.init();
  JournalModule.init();
  AuthModule.init();
  PrivacyModule.init();
  EncClipboard.init();
  VoiceModule.init();

  // Appearance suite (alive colours, wallpapers) + tour
  Appearance.apply();
  _syncToggle('aliveToggle', S.alive, v => { S.alive = v; _saveSett(); Appearance.apply(); });
  const wallSel = document.getElementById('wallpaperSelect');
  if (wallSel) {
    wallSel.value = S.wallpaper;
    wallSel.addEventListener('change', () => { S.wallpaper = wallSel.value; _saveSett(); Appearance.apply(); });
  }
  document.getElementById('coolTourBtn')?.addEventListener('click', () => CoolTour.open());
  document.getElementById('closeCoolModal')?.addEventListener('click', () => document.getElementById('coolModal').classList.add('hidden'));
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && Vault.isUnlocked()) _lockApp();
});

/* ══════════════════════════════════════════════
   IN-APP DIALOGS — replaces all native
   alert()/confirm()/prompt() popups, which render
   in the OS theme (not ours) and trap flows.
   ══════════════════════════════════════════════ */
const Dialog = (() => {
  let alertRes = null, confirmRes = null, promptRes = null;

  function show(id) { document.getElementById(id)?.classList.remove('hidden'); }
  function hide(id) { document.getElementById(id)?.classList.add('hidden'); }

  function init() {
    document.getElementById('infoOk')?.addEventListener('click', () => { hide('infoModal'); if (alertRes) { alertRes(); alertRes = null; } });
    document.getElementById('infoX')?.addEventListener('click', () => { hide('infoModal'); if (alertRes) { alertRes(); alertRes = null; } });
    document.getElementById('deleteCancel')?.addEventListener('click', () => { hide('deleteModal'); if (confirmRes) { confirmRes(false); confirmRes = null; } });
    document.getElementById('deleteOk')?.addEventListener('click', () => { hide('deleteModal'); if (confirmRes) { confirmRes(true); confirmRes = null; } });
    document.getElementById('promptCancel')?.addEventListener('click', () => { hide('promptModal'); if (promptRes) { promptRes(null); promptRes = null; } });
    document.getElementById('promptOk')?.addEventListener('click', () => {
      const v = document.getElementById('promptInput').value;
      hide('promptModal'); if (promptRes) { promptRes(v); promptRes = null; }
    });
    document.getElementById('promptInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('promptOk').click(); }
    });
  }

  function uiAlert(title, msg) {
    document.getElementById('infoTitle').textContent = title;
    document.getElementById('infoBody').textContent = msg;
    show('infoModal');
    return new Promise(res => { alertRes = res; });
  }

  /** Returns Promise<boolean>. `danger` styles OK red. Custom labels supported. */
  function uiConfirm(title, msg, opts) {
    opts = opts || {};
    document.getElementById('deleteTitle').textContent = title;
    document.getElementById('deleteMsg').textContent = msg;
    const okBtn = document.getElementById('deleteOk');
    const cancelBtn = document.getElementById('deleteCancel');
    okBtn.textContent = opts.okLabel || 'OK';
    cancelBtn.textContent = opts.cancelLabel || 'Cancel';
    okBtn.classList.toggle('danger-btn', !!opts.danger);
    show('deleteModal');
    return new Promise(res => { confirmRes = res; });
  }

  /** Returns Promise<string|null>. */
  function uiPrompt(title, placeholder, opts) {
    opts = opts || {};
    document.getElementById('promptTitle').textContent = title;
    const inp = document.getElementById('promptInput');
    inp.value = '';
    inp.placeholder = placeholder || '';
    inp.type = opts.type || 'text';
    inp.autocomplete = 'off';
    show('promptModal');
    setTimeout(() => inp.focus(), 60);
    return new Promise(res => { promptRes = res; });
  }

  return { init, uiAlert, uiConfirm, uiPrompt };
})();

// Short aliases used across modules
function uiAlert(t, m) { return Dialog.uiAlert(t, m); }
function uiConfirm(t, m, o) { return Dialog.uiConfirm(t, m, o); }
function uiPrompt(t, p, o) { return Dialog.uiPrompt(t, p, o); }
function _initDialogs() { Dialog.init(); }

/* ══════════════════════════════════════════════
   LOCK
   ══════════════════════════════════════════════ */
function _initLock() {
  document.querySelectorAll('#numpad .num-key[data-digit]').forEach(b => b.addEventListener('click', () => _addDigit(b.dataset.digit)));
  document.getElementById('delBtn')?.addEventListener('click', _delDigit);
  document.getElementById('decoyBtn')?.addEventListener('click', _triggerPanic);
  document.getElementById('panicBtn')?.addEventListener('click', _triggerPanic);
  document.getElementById('biometricBtn')?.addEventListener('click', _biometricUnlock);

  // Decoy calculator keypad (replaces inline onclick + eval)
  document.querySelectorAll('.calc-btn[data-calc]').forEach(b => b.addEventListener('click', () => _calcInput(b.dataset.calc)));

  let tapCount = 0;
  document.getElementById('panicOverlay')?.addEventListener('click', (e) => {
    if (!e.target.classList.contains('calc-btn')) {
      tapCount++;
      if (tapCount >= 5) { tapCount = 0; _lockApp(); }
    }
  });

  if (!PIN) _showSetupPinModal();
}

function _initBiometric() {
  async function check() {
    if (!window.Capacitor?.Plugins?.ShieldBiometric) return;
    try {
      const res = await window.Capacitor.Plugins.ShieldBiometric.isAvailable();
      // Only offer the button when a key from a previous successful unlock is
      // actually stored — otherwise tapping it can never work.
      if (res.available) {
        const persisted = await window.Capacitor.Plugins.ShieldBiometric.hasPersistedKey();
        _bioReady = !!(persisted && persisted.hasKey);
        if (_bioReady) document.getElementById('biometricBtn').style.display = 'flex';
      }
    } catch {}
  }
  if (window.Capacitor) {
    check();
  } else {
    window.addEventListener('capacitorReady', check, { once: true });
  }
}

/* ── PIN SETUP (with confirm step — a typo must never lock you out) ── */
function _showSetupPinModal() {
  const modal = document.getElementById('setupPinModal');
  const confirmModal = document.getElementById('confirmPinModal');
  if (!modal || !confirmModal) return;
  _setupActive = true;
  modal.classList.remove('hidden');

  const setupDots = [0, 1, 2, 3].map(i => document.getElementById('sd' + i));
  const confirmDots = [0, 1, 2, 3].map(i => document.getElementById('cp' + i));
  let setupDigits = [];
  let confirmDigits = [];
  let firstPin = null;

  const updateDots = (dots, arr) => dots.forEach((dot, i) => dot && dot.classList.toggle('filled', i < arr.length));

  const bindKeys = (root, dots, arr, onDone, delBtnId) => {
    root.querySelectorAll('.num-key[data-digit]').forEach(b => b.addEventListener('click', () => {
      if (arr.length < 4) {
        arr.push(b.dataset.digit);
        updateDots(dots, arr);
        if (arr.length === 4) onDone();
      }
    }));
    document.getElementById(delBtnId)?.addEventListener('click', () => {
      if (arr.length > 0) { arr.pop(); updateDots(dots, arr); }
    });
  };

  bindKeys(modal, setupDots, setupDigits, () => {
    firstPin = setupDigits.join('');
    setTimeout(() => {
      modal.classList.add('hidden');
      // Clear IN PLACE. Reassigning (confirmDigits = []) would swap in a new
      // array while bindKeys' closure keeps pushing into the original one —
      // the confirm check then always compared "" against firstPin ("don't
      // match" on every attempt) and after 4 stale digits the pad went dead.
      confirmDigits.length = 0;
      updateDots(confirmDots, confirmDigits);
      confirmModal.classList.remove('hidden');
    }, 180);
  }, 'setupDelBtn');

  bindKeys(confirmModal, confirmDots, confirmDigits, async () => {
    if (confirmDigits.join('') === firstPin) {
      PIN = await Vault.hashPin(firstPin);
      localStorage.setItem(PIN_KEY, PIN);
      await Vault.unlockWithPin(firstPin); // derive master key immediately
      _bioReady = true; // key persisted → fingerprint unlock available
      _setupActive = false;
      confirmModal.classList.add('hidden');
      if (window.Capacitor?.Plugins?.ShieldBiometric) {
        try {
          const res = await window.Capacitor.Plugins.ShieldBiometric.isAvailable();
          if (res.available && await uiConfirm('Biometrics', 'Register fingerprint/face for faster access?', { okLabel: 'Yes', cancelLabel: 'Not now' })) {
            _biometricUnlock();
          }
        } catch {}
      }
    } else {
      const errEl = document.getElementById('confirmError');
      if (errEl) errEl.textContent = "PINs don't match — try again";
      confirmDigits.length = 0; // in place — see note above; keeps the pad live
      updateDots(confirmDots, confirmDigits);
      setTimeout(() => { if (errEl) errEl.textContent = ''; }, 2000);
    }
  }, 'confirmDelBtn');
}

async function _biometricUnlock() {
  if (!window.Capacitor?.Plugins?.ShieldBiometric) return;
  try {
    const res = await window.Capacitor.Plugins.ShieldBiometric.authenticate({ title: 'Unlock BLACKBOX' });
    if (res.success) {
      failCount = 0;
      try {
        await Vault.unlockFromSession(); // session key, or Keystore-backed key after a restart
      } catch {
        // No stored key (e.g. web / first run) — the fingerprint prompt succeeded
        // but there is nothing to unlock with. Fall back to the PIN pad.
        return;
      }
      _showApp();
    }
  } catch (e) { console.error('Biometric error:', e); }
}

function _addDigit(d) {
  if (_isLockedOut()) return;
  if (digits.length >= 4) return;
  if (_setupActive) return;
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

  if (DECOY_PIN && await Vault.verifyPin(entered, DECOY_PIN)) {
    if (!Vault.isPinVerifier(DECOY_PIN)) { // migrate legacy plaintext decoy verifier too
      DECOY_PIN = await Vault.hashPin(entered);
      localStorage.setItem(DECOY_KEY, DECOY_PIN);
    }
    _triggerPanic();
    return;
  }
  if (PIN && await Vault.verifyPin(entered, PIN)) {
    failCount = 0;
    // ── Legacy migration (pre-2.0.4 installs): the stored verifier was the
    // plaintext PIN. Accept it, then replace it with a salted hash so it is
    // never persisted again. Data itself was always AES-encrypted with a key
    // derived from the PIN, so the same digits still decrypt everything.
    if (!Vault.isPinVerifier(PIN)) {
      PIN = await Vault.hashPin(entered);
      localStorage.setItem(PIN_KEY, PIN);
    }
    // (A legacy plaintext decoy verifier is not migrated here — we only have
    // the real digits. It keeps working and upgrades if the decoy PIN is
    // entered; see the decoy branch above.)
    try { await Vault.unlockWithPin(entered); } catch {}
    _bioReady = true; // key is persisted → fingerprint can unlock from now on
    const bioBtn = document.getElementById('biometricBtn');
    if (bioBtn && window.Capacitor?.Plugins?.ShieldBiometric) bioBtn.style.display = 'flex';
    _showApp();
  } else {
    failCount++;
    document.getElementById('lockAttemptInfo').textContent = `Attempt ${failCount}/5`;
    const errEl = document.getElementById('pinError');
    errEl.textContent = 'Wrong PIN';
    const dots = document.querySelectorAll('.pin-display .pin-dot');
    const content = document.querySelector('.lock-content');
    dots.forEach(d => { d.classList.add('error'); });
    content?.classList.add('shake');
    setTimeout(() => {
      content?.classList.remove('shake');
      dots.forEach(d => { d.classList.remove('error', 'filled'); });
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
  Vault.clearAll(); // also wipes the Keystore-backed biometric key
  localStorage.clear();
  try { sessionStorage.clear(); } catch {}
  document.getElementById('pinError').textContent = 'VAULT WIPED';
  document.getElementById('lockAttemptInfo').textContent = 'All data destroyed';
  setTimeout(() => location.reload(), 2000);
}

function _showApp() {
  const lock = document.getElementById('lockScreen');
  const app = document.getElementById('mainApp');
  document.getElementById('pinError').textContent = '';
  document.getElementById('lockAttemptInfo').textContent = '';
  document.getElementById('biometricBtn')?.classList.add('unlocking');
  lock.classList.add('unlocking'); // fade+scale the vault door away
  _animLock = true;
  document.getElementById('panicOverlay').classList.add('hidden');
  setTimeout(() => {
    lock.classList.remove('active', 'unlocking');
    document.getElementById('biometricBtn')?.classList.remove('unlocking');
    app.classList.remove('hidden');
    app.classList.add('entering');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      app.classList.remove('entering');
      _animLock = false;
    }));
  }, 380);
  _resetAutoLock();
  _refreshAll();
  _notifyIfUpdate();
}

function _lockApp() {
  if (_animLock) return; // don't fight the unlock transition
  if (!Vault.isUnlocked() && document.getElementById('lockScreen').classList.contains('active')) return;
  Vault.lock();
  AuthModule.stopTimers();
  const lock = document.getElementById('lockScreen');
  lock.classList.remove('unlocking');
  lock.classList.add('active');
  document.getElementById('mainApp').classList.add('hidden');
  digits = [];
  _renderDots();
  document.querySelectorAll('.pin-display .pin-dot').forEach(d => d.classList.remove('error'));
  document.getElementById('pinError').textContent = '';
  _clearAutoLock();
  if (PrivacyOverlay.isEnabled()) PrivacyOverlay.disable();
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

/* ── PANIC CALCULATOR (decoy) — no eval(), no globals on onclick ── */
let calcExpr = '', calcPrev = null, calcOp = null, calcFresh = true;

function _calcInput(v) {
  const d = document.getElementById('calcDisplay');
  if (!d) return;
  if (v === 'AC') { calcExpr = ''; calcPrev = null; calcOp = null; calcFresh = true; d.textContent = '0'; return; }
  if (v === '+/-') { const n = parseFloat(calcExpr); if (!isNaN(n)) { calcExpr = String(-n); d.textContent = calcExpr; } return; }
  if (v === '%') { const n = parseFloat(calcExpr); if (!isNaN(n)) { calcExpr = String(n / 100); d.textContent = calcExpr; } return; }
  if (v === '=') { _calcEquals(); return; }
  if ('+-*/'.includes(v)) {
    if (calcExpr !== '' && calcExpr !== '-') { calcPrev = parseFloat(calcExpr); calcOp = v; calcFresh = true; }
    return;
  }
  if (calcFresh) { calcExpr = v === '.' ? '0.' : v; calcFresh = false; }
  else {
    if (v === '.' && calcExpr.includes('.')) return;
    if (calcExpr.length >= 14) return;
    calcExpr += v;
  }
  d.textContent = calcExpr;
}

function _calcEquals() {
  const d = document.getElementById('calcDisplay');
  if (calcOp === null || calcPrev === null || calcExpr === '') return;
  const cur = parseFloat(calcExpr);
  let r;
  switch (calcOp) {
    case '+': r = calcPrev + cur; break;
    case '-': r = calcPrev - cur; break;
    case '*': r = calcPrev * cur; break;
    case '/': r = cur === 0 ? NaN : calcPrev / cur; break;
  }
  if (!isFinite(r)) { d.textContent = 'Error'; calcExpr = ''; calcPrev = null; calcOp = null; calcFresh = true; return; }
  r = Math.round(r * 1e10) / 1e10;
  calcExpr = String(r);
  d.textContent = calcExpr;
  calcPrev = null; calcOp = null; calcFresh = true;
}

function _triggerPanic() {
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('lockScreen').classList.remove('active');
  document.getElementById('panicOverlay').classList.remove('hidden');
  Vault.lock();
  AuthModule.stopTimers();
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
  if (tab === 'secrets') { SecretsModule.refresh(); FilesManager.refresh(); }
  if (tab === 'journal') JournalModule.refresh();
  if (tab === 'auth') AuthModule.refresh();
}

/* ── REFRESH ALL ── */
function _refreshAll() {
  SecretsModule.refresh();
  FilesManager.refresh();
  JournalModule.refresh();
  AuthModule.refresh();
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

  document.getElementById('changePinBtn')?.addEventListener('click', _changePinFlow);
  document.getElementById('setupDecoyBtn')?.addEventListener('click', _setupDecoyFlow);
  document.getElementById('clearVaultBtn')?.addEventListener('click', async () => {
    if (await uiConfirm('Clear All Data', 'Delete ALL data permanently? This cannot be undone.', { danger: true, okLabel: 'Delete Everything' })) {
      Vault.clearAll();
      _toast('Vault cleared', 'red');
    }
  });
  document.getElementById('resetAppBtn')?.addEventListener('click', async () => {
    if (await uiConfirm('Factory Reset', 'Wipe everything including your PIN and settings?', { danger: true, okLabel: 'Reset App' })) {
      localStorage.clear();
      location.reload();
    }
  });
  document.getElementById('exportSettingsBtn')?.addEventListener('click', async () => {
    const pass = await uiPrompt('Encrypted Backup', 'Passphrase (min 8 chars) — needed to restore this backup', { type: 'password' });
    if (pass === null) return;
    if (pass.length < 8) { await uiAlert('Encrypted Backup', 'Use at least 8 characters so the backup stays safe.'); return; }
    const confirm2 = await uiPrompt('Encrypted Backup', 'Confirm passphrase', { type: 'password' });
    if (confirm2 === null) return;
    if (confirm2 !== pass) { await uiAlert('Encrypted Backup', "Passphrases don't match — nothing was exported."); return; }
    try { await Vault.exportEncryptedBackup(pass); }
    catch (e) { await uiAlert('Encrypted Backup', e.message || 'Export failed.'); }
  });
  document.getElementById('importSettingsBtn')?.addEventListener('click', async () => {
    const pass = await uiPrompt('Restore Backup', 'Backup passphrase', { type: 'password' });
    if (pass === null) return;
    document.getElementById('importInput')._pass = pass;
    document.getElementById('importInput')?.click();
  });
  document.getElementById('importInput')?.addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      let n;
      if (f.name.endsWith('.bbvault')) {
        n = await Vault.importEncryptedBackup(f, document.getElementById('importInput')._pass || '');
      } else {
        n = await Vault.importBackup(f); // legacy .blackbox (ciphertext merge)
      }
      _toast(`Imported ${n} items`);
      _refreshAll();
    } catch (err) {
      await uiAlert('Import Failed', err.message || 'This file is not a valid BLACKBOX backup.');
    }
    e.target.value = '';
  });
  document.getElementById('websiteBtn')?.addEventListener('click', () => window.open('https://alpha1studio.vercel.app', '_blank'));
  document.getElementById('featureReqBtn')?.addEventListener('click', _requestFeature);
  document.getElementById('githubBtn')?.addEventListener('click', () => window.open('https://github.com/alpha-1-design/BLACKBOX', '_blank'));
  document.getElementById('faqBtn')?.addEventListener('click', _showFaq);
  document.getElementById('privacyPolicyBtn')?.addEventListener('click', _showPrivacyPolicy);
  document.getElementById('updateStatus')?.addEventListener('click', _checkUpdate);
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

/* ── CHANGE PIN — re-encrypts every store with the new PIN's key ── */
async function _changePinFlow() {
  const cur = await uiPrompt('Change PIN', 'Current PIN', { type: 'password' });
  if (cur === null) return;
  if (!/^\d{4}$/.test(cur)) { await uiAlert('Change PIN', 'The PIN must be exactly 4 digits.'); return; }
  if (!PIN || !await Vault.verifyPin(cur, PIN)) { await uiAlert('Change PIN', 'That is not your current PIN.'); return; }

  const next = await uiPrompt('Change PIN', 'New 4-digit PIN', { type: 'password' });
  if (next === null) return;
  if (!/^\d{4}$/.test(next)) { await uiAlert('Change PIN', 'The new PIN must be exactly 4 digits.'); return; }
  if (next === cur) { await uiAlert('Change PIN', 'The new PIN must be different from the current one.'); return; }

  const confirmPin = await uiPrompt('Change PIN', 'Confirm new PIN', { type: 'password' });
  if (confirmPin === null) return;
  if (confirmPin !== next) { await uiAlert('Change PIN', "PINs don't match — nothing was changed."); return; }

  try {
    await Vault.changePin(cur, next); // re-encrypts all stores under the new key
    PIN = await Vault.hashPin(next);
    localStorage.setItem(PIN_KEY, PIN);
    _toast('PIN updated');
  } catch (err) {
    console.error('PIN change failed:', err);
    await uiAlert('Change PIN', 'Something went wrong while re-encrypting. Your old PIN still works.');
  }
}

/* ── DECOY PIN ── */
async function _setupDecoyFlow() {
  const d = await uiPrompt('Decoy PIN', '4 digits — leave empty to disable', { type: 'password' });
  if (d === null) return;
  if (d === '') {
    DECOY_PIN = '';
    localStorage.removeItem(DECOY_KEY);
    _toast('Decoy disabled');
    return;
  }
  if (!/^\d{4}$/.test(d)) { await uiAlert('Decoy PIN', 'The decoy must be exactly 4 digits.'); return; }
  if (PIN && await Vault.verifyPin(d, PIN)) { await uiAlert('Decoy PIN', 'The decoy PIN must be different from your real PIN.'); return; }
  DECOY_PIN = await Vault.hashPin(d);
  localStorage.setItem(DECOY_KEY, DECOY_PIN);
  _toast('Decoy PIN set');
}

/* ── FAQ / PRIVACY POLICY — in-app modal, not native alert() ── */
async function _showFaq() {
  const faq = [
    { q: 'Is BLACKBOX open source?', a: 'Yes. The full source code is available on GitHub under the MIT license.' },
    { q: 'Where is my data stored?', a: 'All data is stored locally on your device in encrypted form. Nothing is sent to any server.' },
    { q: 'What if I forget my PIN?', a: 'PIN recovery is impossible by design — there is no backdoor. A factory reset will wipe all data.' },
    { q: 'Is there cloud sync?', a: 'No. BLACKBOX is offline-only. The only network call is an optional manual update check — no data ever leaves your device.' },
    { q: 'How strong is the encryption?', a: 'AES-256-GCM with PBKDF2-SHA256 key derivation (150,000 iterations). Industry standard.' },
    { q: 'Can I use biometrics?', a: 'Yes, if your device supports fingerprint or face unlock, you can enable it in Settings.' }
  ];
  const html = faq.map(f => `<div class="faq-item"><strong>${f.q}</strong><p>${f.a}</p></div>`).join('');
  document.getElementById('infoTitle').textContent = 'FAQ';
  document.getElementById('infoBody').innerHTML = html;
  document.getElementById('infoModal').classList.remove('hidden');
}

async function _showPrivacyPolicy() {
  const pp = `BLACKBOX does not collect, transmit, or share any user data.

• All data is stored locally on your device
• No analytics, no tracking, no background network calls
• Optional manual update check (Settings → Check for Updates) fetches the latest release version from GitHub
• No third-party SDKs or services
• Biometric data never leaves your device (handled by Android)
• Clipboard content is cleared after 30 seconds

Contact: alpha-1-design via GitHub

Full policy: github.com/alpha-1-design/BLACKBOX/blob/main/SECURITY.md`;
  await uiAlert('Privacy Policy', pp);
}

/* ── REQUEST A FEATURE — opens the user's mail app, pre-filled ── */
const FEATURE_EMAIL = 'alpha1.design.dev@gmail.com';
async function _requestFeature() {
  const idea = await uiPrompt('Request a Feature', 'What should we build next?', { type: 'text' });
  if (idea === null) return; // cancelled
  const body = idea.trim() ? idea.trim() : '(describe your idea)';
  const mailto = 'mailto:' + FEATURE_EMAIL
    + '?subject=' + encodeURIComponent('[Feature] BLACKBOX v' + Updater.currentVersion)
    + '&body=' + encodeURIComponent(body + '\n\n---\nSent from BLACKBOX v' + Updater.currentVersion);
  try {
    window.open(mailto, '_system');
  } catch {
    await uiAlert('Request a Feature', 'No email app found. You can reach us at ' + FEATURE_EMAIL);
  }
}

/* ── UPDATE NOTIFICATION ──
   Runs once shortly after the vault unlocks. Notifies the user when a newer
   release exists, instead of making them discover it under Settings. */
let _updateNotified = false;
function _notifyIfUpdate() {
  if (_updateNotified) return;
  _updateNotified = true;
  setTimeout(async () => {
    const result = await Updater.check();
    // Silent on error — no network is the normal case offline, not news.
    if (result && result.updateAvailable) _markUpdateAvailable(result);
  }, 8000);
}

function _markUpdateAvailable(result) {
  const txt = document.getElementById('updateText');
  const sub = document.getElementById('updateSub');
  if (txt) { txt.textContent = 'Update v' + result.latestVersion + ' Available'; txt.style.color = 'var(--accent)'; }
  if (sub) sub.textContent = 'Tap to update';
  const el = document.getElementById('updateStatus');
  if (el) el._updateData = result;
  _toast('Update v' + result.latestVersion + ' available — Settings › Update', 'green');
}

/* ── UPDATES ── */
async function _checkUpdate() {
  const el = document.getElementById('updateText');
  const sub = document.getElementById('updateSub');
  el.textContent = 'Checking...';
  sub.textContent = 'Please wait';
  const result = await Updater.check();
  if (result.error) {
    el.textContent = 'Check for Updates';
    sub.textContent = result.error + ' — tap to retry';
    return;
  }
  if (result.updateAvailable) {
    _markUpdateAvailable(result);
  } else {
    el.textContent = 'BLACKBOX v' + Updater.currentVersion;
    sub.textContent = 'You are up to date';
  }
}

document.addEventListener('click', async e => {
  const el = document.getElementById('updateStatus');
  if (!el || !el._updateData) return;
  if (el.contains(e.target)) {
    const r = el._updateData;
    el._updateData = null;
    if (await uiConfirm('Update v' + r.latestVersion, 'A new version is available. Where do you want to update?', { okLabel: 'F-Droid', cancelLabel: 'GitHub' })) {
      Updater.openFdroid();
    } else {
      Updater.openGitHub();
    }
  }
});

/* ── TOAST ── */
function _toast(msg, type) {
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'red' ? ' red' : type === 'green' ? ' green' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
