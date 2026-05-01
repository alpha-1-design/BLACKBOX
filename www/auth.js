const AuthModule = (() => {
  let _totps = [];
  let _intervals = {};

  function init() {
    document.getElementById('addTotpBtn')?.addEventListener('click', () => openForm());
    document.getElementById('closeTotpModal')?.addEventListener('click', closeForm);
    document.getElementById('cancelTotpBtn')?.addEventListener('click', closeForm);
    document.getElementById('totpForm')?.addEventListener('submit', async e => { e.preventDefault(); await saveForm(); });
    document.querySelector('#totpModal .modal-backdrop')?.addEventListener('click', closeForm);
  }

  async function refresh() {
    if (!Vault.isUnlocked()) return;
    Object.values(_intervals).forEach(clearInterval);
    _intervals = {};
    _totps = await Vault.getAllTotp();
    render();
    startTimers();
  }

  function render() {
    const list = document.getElementById('totpList');
    const empty = document.getElementById('totpEmpty');
    if (!list || !empty) return;

    if (_totps.length === 0) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    list.innerHTML = _totps.map(t => `
      <div class="totp-item" data-id="${t.id}">
        <div class="totp-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
        </div>
        <div class="totp-info">
          <div class="totp-account">${Vault.esc(t.account)}</div>
          <div class="totp-code-row">
            <span class="totp-code" id="code-${t.id}">------</span>
            <div class="totp-progress"><div class="totp-progress-bar" id="prog-${t.id}"></div></div>
          </div>
        </div>
        <div class="totp-actions">
          <button class="secret-action-btn copy-totp" data-id="${t.id}" title="Copy code">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button>
          <button class="secret-action-btn delete delete-totp" data-id="${t.id}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.copy-totp').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const codeEl = document.getElementById('code-' + btn.dataset.id);
        if (codeEl) { navigator.clipboard.writeText(codeEl.textContent.replace(/\s/g, '')); toast('Code copied'); }
      });
    });
    list.querySelectorAll('.delete-totp').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        if (confirm('Remove this 2FA code?')) {
          await Vault.deleteTotp(btn.dataset.id);
          await refresh();
        }
      });
    });
  }

  function startTimers() {
    _totps.forEach(t => updateTotp(t));
    if (_intervals.main) clearInterval(_intervals.main);
    _intervals.main = setInterval(() => {
      _totps.forEach(t => updateTotp(t));
    }, 1000);
  }

  function updateTotp(t) {
    const codeEl = document.getElementById('code-' + t.id);
    const progEl = document.getElementById('prog-' + t.id);
    if (!codeEl || !progEl) return;
    const now = Math.floor(Date.now() / 1000);
    const period = 30;
    const remaining = period - (now % period);
    const code = generateTOTP(t.secret, now, t.digits);
    codeEl.textContent = code.length > 6 ? code.slice(0,3) + ' ' + code.slice(3) : code;
    progEl.style.width = ((remaining / period) * 100) + '%';
    if (remaining <= 5) progEl.style.background = 'var(--red)';
    else progEl.style.background = 'var(--accent)';
  }

  function generateTOTP(secret, timestamp, digits) {
    try {
      const key = base32ToBytes(secret.replace(/\s/g, ''));
      const time = Math.floor(timestamp / 30);
      const timeBytes = new Uint8Array(8);
      for (let i = 7; i >= 0; i--) { timeBytes[i] = time & 0xff; time >>= 8; }
      return hmacSHA1(key, timeBytes).then(hmac => {
        const offset = hmac[hmac.length - 1] & 0x0f;
        const binary = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
        const otp = binary % Math.pow(10, digits);
        return String(otp).padStart(digits, '0');
      }).catch(() => '------');
    } catch {
      return '------';
    }
  }

  async function hmacSHA1(key, data) {
    const cryptoKey = await crypto.subtle.importKey('raw', key, {name:'HMAC', hash:'SHA-1'}, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, data);
    return new Uint8Array(sig);
  }

  function base32ToBytes(base32) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    const cleaned = base32.toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
    for (const char of cleaned) {
      const val = alphabet.indexOf(char);
      if (val === -1) throw new Error('Invalid base32');
      bits += val.toString(2).padStart(5, '0');
    }
    const bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
    }
    return bytes;
  }

  function openForm() {
    document.getElementById('totpForm').reset();
    document.getElementById('totpModal').classList.remove('hidden');
    document.getElementById('totpAccount').focus();
  }

  function closeForm() {
    document.getElementById('totpModal').classList.add('hidden');
  }

  async function saveForm() {
    const account = document.getElementById('totpAccount').value.trim();
    const secret = document.getElementById('totpSecret').value.trim();
    const digits = parseInt(document.getElementById('totpDigits').value);
    if (!account || !secret) return;
    await Vault.saveTotp({account, secret, digits});
    closeForm();
    await refresh();
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast green';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }

  return { init, refresh };
})();
