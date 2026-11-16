const AuthModule = (() => {
  let _totps = [];
  let _intervals = {};
  let _codes = {}; // id -> {window, code} — cached so copy always has the real code

  function init() {
    document.getElementById('addTotpBtn')?.addEventListener('click', () => openForm());
    document.getElementById('closeTotpModal')?.addEventListener('click', closeForm);
    document.getElementById('cancelTotpBtn')?.addEventListener('click', closeForm);
    document.getElementById('totpForm')?.addEventListener('submit', async e => { e.preventDefault(); await saveForm(); });
    document.querySelector('#totpModal .modal-backdrop')?.addEventListener('click', closeForm);
  }

  async function refresh() {
    if (!Vault.isUnlocked()) return;
    startTimers();
    _totps = await Vault.getAllTotp();
    render();
  }

  function stopTimers() {
    Object.values(_intervals).forEach(clearInterval);
    _intervals = {};
    _codes = {};
    // Lock must drop the decrypted secrets too, not just the timers/codes.
    _totps = [];
    // Cached codes are gone, but the rendered spans still hold plaintext.
    document.querySelectorAll?.('.totp-code')?.forEach(el => { el.textContent = '------'; });
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
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        // _codes[id] is {window, code}; copy the string, not the object
        // (writeText(object) coerces to "[object Object]").
        const c = _codes[btn.dataset.id];
        if (!c || !c.code || c.code === '------') return;
        // A live 2FA code on the clipboard indefinitely is a real exposure;
        // it purges on the same 30-second schedule as everything else.
        const res = await EncClipboard.copy(c.code);
        toast(EncClipboard.copyMessage(res), !res.ok);
      });
    });
    list.querySelectorAll('.delete-totp').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const t = _totps.find(x => x.id === btn.dataset.id);
        if (t && await uiConfirm('Remove 2FA', `Remove the code for "${t.account}"?`, { danger: true, okLabel: 'Remove' })) {
          await Vault.deleteTotp(btn.dataset.id);
          await refresh();
        }
      });
    });

    // Tapping the row copies the current code — the row is not dead space.
    list.querySelectorAll('.totp-item').forEach(el => {
      el.addEventListener('click', async e => {
        if (e.target.closest('.secret-action-btn')) return;
        const c = _codes[el.dataset.id];
        if (!c || !c.code || c.code === '------') return;
        const res = await EncClipboard.copy(c.code);
        toast(EncClipboard.copyMessage(res), !res.ok);
      });
    });

    _totps.forEach(t => updateTotp(t));
  }

  function startTimers() {
    if (_intervals.main) clearInterval(_intervals.main);
    _intervals.main = setInterval(() => { _totps.forEach(t => updateTotp(t)); }, 1000);
  }

  function updateTotp(t) {
    const codeEl = document.getElementById('code-' + t.id);
    const progEl = document.getElementById('prog-' + t.id);
    if (!codeEl || !progEl) return;
    const now = Math.floor(Date.now() / 1000);
    const period = t.period || 30;
    const remaining = period - (now % period);
    const win = Math.floor(now / period);

    // Recompute the code only when the window rolls over (async-safe).
    if (_codes[t.id]?.window !== win) {
      _codes[t.id] = { window: win, code: '------' };
      generateTOTP(t.secret, now, t.digits, t.algorithm, period).then(code => {
        if (_codes[t.id]?.window === win) _codes[t.id].code = code;
        const el = document.getElementById('code-' + t.id);
        if (el) el.textContent = code.length > 6 ? code.slice(0,3) + ' ' + code.slice(3) : code;
      }).catch(() => {});
    }
    const cached = _codes[t.id].code;
    if (cached !== '------') codeEl.textContent = cached.length > 6 ? cached.slice(0,3) + ' ' + cached.slice(3) : cached;
    progEl.style.width = ((remaining / period) * 100) + '%';
    if (remaining <= 5) progEl.style.background = 'var(--red)';
    else progEl.style.background = 'var(--accent)';
  }

  async function generateTOTP(secret, timestamp, digits, algorithm = 'SHA1', period = 30) {
    const key = base32ToBytes(secret.replace(/\s/g, ''));
    // RFC 6238: counter T = floor((unix time - T0) / X), T0=0, X=period.
    // Use division (not >>=, which is 32-bit) so large counters stay correct.
    let time = Math.floor(timestamp / period);
    const timeBytes = new Uint8Array(8);
    for (let i = 7; i >= 0; i--) { timeBytes[i] = time % 256; time = Math.floor(time / 256); }
    const hmac = await hmacSign(key, timeBytes, algorithm);
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
    const otp = binary % Math.pow(10, digits);
    return String(otp).padStart(digits, '0');
  }

  async function hmacSign(key, data, algorithm) {
    // RFC 6238 permits SHA-1, SHA-256 and SHA-512; WebCrypto wants dashed names.
    const hash = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' }[algorithm] || 'SHA-1';
    const cryptoKey = await crypto.subtle.importKey('raw', key, {name:'HMAC', hash}, false, ['sign']);
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

  // Strict base32 for imported secrets: uppercase A–Z2–7, spaces/dashes
  // stripped, and canonical '=' padding only. Returns the normalised secret
  // so downstream generateTOTP/base32ToBytes always receive clean input.
  function _normalizeBase32(raw) {
    if (typeof raw !== 'string' || !raw.trim()) throw new Error('secret is missing');
    const cleaned = raw.replace(/[\s-]/g, '').toUpperCase();
    if (!/^[A-Z2-7]+=*$/.test(cleaned)) throw new Error('secret must contain only A–Z and 2–7');
    const m = cleaned.match(/^([A-Z2-7]+)(=*)$/);
    const data = m[1], pad = m[2].length;
    if (pad) {
      if (cleaned.length % 8 !== 0) throw new Error('padding makes the secret length invalid');
      const expect = { 1: 7, 3: 5, 4: 4, 6: 2 }[pad];
      if (!expect || data.length % 8 !== expect) throw new Error('invalid base32 padding');
    }
    return cleaned;
  }

  // Parse an otpauth:// URI into the same shape saveTotp() consumes.
  // The path label is URL-encoded and may carry an "Issuer:" prefix; the
  // account is the part after the first colon (existing label semantics).
  function parseOtpauthUri(uri) {
    if (typeof uri !== 'string' || !/^otpauth:\/\//i.test(uri.trim())) {
      throw new Error('Not an otpauth:// URI.');
    }
    let u;
    try { u = new URL(uri.trim()); }
    catch { throw new Error('Malformed otpauth URI.'); }
    if (u.protocol.toLowerCase() !== 'otpauth:') throw new Error('Unsupported URI scheme — expected otpauth://.');
    const type = u.hostname.toLowerCase();
    if (type !== 'totp') {
      throw new Error(type === 'hotp'
        ? 'HOTP is not supported — only time-based (TOTP) codes can be imported.'
        : `Unsupported OTP type "${type}" — only TOTP is supported.`);
    }

    let label;
    try { label = decodeURIComponent(u.pathname.replace(/^\//, '')); }
    catch { throw new Error('Invalid URI encoding in the account label.'); }
    if (!label) throw new Error('The otpauth URI is missing an account label.');

    let prefix = '';
    let account = label;
    const colon = label.indexOf(':');
    if (colon !== -1) {
      prefix = label.slice(0, colon).trim();
      account = label.slice(colon + 1).trim();
    }
    if (!account) throw new Error('The otpauth URI is missing an account name.');

    const q = u.searchParams;
    const issuer = (q.get('issuer') || prefix || '').trim();

    let secret;
    try { secret = _normalizeBase32(q.get('secret')); }
    catch (e) { throw new Error(`Invalid TOTP secret: ${e.message}`); }

    let digits = 6;
    const rawDigits = q.get('digits');
    if (rawDigits !== null) {
      if (!/^\d+$/.test(rawDigits)) throw new Error('Invalid digits parameter — expected a whole number.');
      digits = parseInt(rawDigits, 10);
      // Vault.saveTotp() only supports 6/8. Accepting anything else here used
      // to produce a silently coerced 6-digit account with an 8-digit URI.
      if (![6, 8].includes(digits)) throw new Error('Unsupported digits value — expected 6 or 8 digits.');
    }

    // RFC 6238 permits SHA-1/256/512 and any period. Silently ignoring either
    // parameter produced permanently invalid codes for real accounts, so we
    // parse and carry them through to the vault and generator.
    const algorithm = (q.get('algorithm') || 'SHA1').toUpperCase();
    if (!['SHA1', 'SHA256', 'SHA512'].includes(algorithm)) {
      throw new Error(`Unsupported algorithm "${algorithm}" — expected SHA1, SHA256 or SHA512.`);
    }
    let period = 30;
    const rawPeriod = q.get('period');
    if (rawPeriod !== null) {
      if (!/^\d+$/.test(rawPeriod)) throw new Error('Invalid period parameter — expected a whole number of seconds.');
      period = parseInt(rawPeriod, 10);
      if (period < 1 || period > 300) throw new Error('Unsupported period value — expected 1 to 300 seconds.');
    }

    return { account, secret, digits, algorithm, period, issuer };
  }

  // Import a single TOTP URI: parse, reject an existing (account + secret)
  // pair, persist, then refresh the visible list via the normal render path.
  async function importUri(uri) {
    const { account, secret, digits, algorithm, period } = parseOtpauthUri(uri);
    const norm = v => (v || '').replace(/[\s-]/g, '').toUpperCase();
    const existing = await Vault.getAllTotp();
    if (existing.some(t => norm(t.secret) === secret && t.account === account)) {
      throw new Error(`"${account}" is already in the vault with this secret.`);
    }
    await Vault.saveTotp({ account, secret, digits, algorithm, period });
    await refresh();
    return 1;
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
    let normalized;
    try {
      // Use the SAME strict validator as otpauth:// import. base32ToBytes()
      // strips invalid characters quietly, so a typo used to save a secret
      // that could never produce a valid code.
      normalized = _normalizeBase32(secret);
    } catch (e) {
      await uiAlert('Invalid Secret', `That does not look like a valid base32 TOTP secret (${e.message}). Copy it again from your provider.`);
      return;
    }
    await Vault.saveTotp({account, secret: normalized, digits});
    closeForm();
    await refresh();
  }

  function toast(msg, red) {
    const t = document.createElement('div');
    t.className = 'toast ' + (red ? 'red' : 'green');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }

  return { init, refresh, stopTimers, generateTOTP, base32ToBytes, parseOtpauthUri, importUri };
})();
