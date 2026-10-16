const EncClipboard = (() => {
  // "Encrypted clipboard": text is encrypted at rest in the vault and the
  // system clipboard is auto-cleared after 30s. What goes ON the clipboard
  // is always the readable text — writing a [BB:base64] tag was a bug that
  // pasted gibberish into other apps.
  let clearTimer = null;
  let clipboardItem = null; // Blob => never persist plaintext to disk
  let autoClear = true;     // driven by the Home "Clipboard" toggle

  /** The auto-clear toggle used to be a no-op switch: on by default, always
   *  rendered checked, and wired to an empty callback. It is real now — off
   *  means the 30s purge is not scheduled and the timer is cancelled. */
  function setAutoClear(on) {
    autoClear = on !== false;
    if (!autoClear && clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
  }

  function init() {
    const save = document.getElementById('clipSaveBtn');
    const clearBtn = document.getElementById('clipClearBtn');
    if (save) save.addEventListener('click', encryptAndCopy);
    if (clearBtn) clearBtn.addEventListener('click', clear);
    if (save || clearBtn) appBind();
  }

  // Home tab previously bound its own duplicate handlers in app.js.
  function appBind() {
    // no-op: single binding point is EncClipboard.init()
  }

  async function encryptAndCopy() {
    const input = document.getElementById('clipInput');
    const status = document.getElementById('clipStatus');
    if (!input || !status) return;
    const text = input.value.trim();
    if (!text) return;
    await Vault.saveClip(text); // encrypted at rest (AES-GCM)
    const res = await copy(text);
    status.style.color = res.ok ? 'var(--green)' : 'var(--red)';
    status.textContent = res.ok
      ? (res.purges ? 'Copied · clipboard clears in 30 seconds' : 'Copied · auto-clear is off (Home → Clipboard)')
      : 'Copy failed — grant clipboard permission';
  }

  /** Write text and arm the purge. Returns whether the write actually landed.
   *  Previously the promise from writeText() was not awaited, so a rejected
   *  clipboard write (no permission, insecure context) still reported success. */
  async function _writeClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      clipboardItem = null;
      return true;
    } catch { return false; }
  }

  /* The single entry point for copying anything sensitive.
     Home promised a 30-second purge, but the secrets copy buttons and the 2FA
     codes called navigator.clipboard.writeText() directly — so a copied API
     key, password or TOTP code sat on the system clipboard indefinitely, which
     is precisely the exposure this app exists to avoid. */
  /** Resolves { ok, purges } — deliberately not a bare boolean. Returning just
   *  `true` when auto-clear is switched off made every caller's "clears in 30s"
   *  message a lie, which is the same over-promise this helper was added to
   *  remove. Callers read `purges` to decide what they may claim. */
  async function copy(text, opts) {
    const ok = await _writeClipboard(text);
    if (!ok || !autoClear) return { ok, purges: false };
    if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
    clearTimer = setTimeout(_purge, (opts && opts.ms) || 30000);
    return { ok: true, purges: true };
  }

  /** Single source of wording for a copy result, so no call site can announce
   *  a purge that was never armed. */
  function copyMessage(res) {
    if (!res || !res.ok) return 'Copy failed — grant clipboard permission';
    return res.purges ? 'Copied · clears in 30s' : 'Copied · auto-clear is off';
  }

  async function _purge() {
    clearTimer = null;
    await _writeClipboard('');
    Vault.clearClip();
    clipboardItem = null;
    const input = document.getElementById('clipInput');
    if (input) input.value = '';
    const status = document.getElementById('clipStatus');
    if (status) { status.textContent = 'Clipboard cleared'; status.style.color = 'var(--text3)'; }
  }

  function clear() {
    const input = document.getElementById('clipInput');
    const status = document.getElementById('clipStatus');
    if (input) input.value = '';
    if (status) { status.textContent = ''; }
    if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
    Vault.clearClip();
    navigator.clipboard.writeText('').catch(() => {});
  }

  return { init, clear, encryptAndCopy, setAutoClear, copy, copyMessage };
})();
