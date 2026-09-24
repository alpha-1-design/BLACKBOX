const EncClipboard = (() => {
  // "Encrypted clipboard": text is encrypted at rest in the vault and the
  // system clipboard is auto-cleared after 30s. What goes ON the clipboard
  // is always the readable text — writing a [BB:base64] tag was a bug that
  // pasted gibberish into other apps.
  let clearTimer = null;
  let clipboardItem = null; // Blob => never persist plaintext to disk

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
    try {
      await Vault.saveClip(text); // encrypted at rest (AES-GCM)
      await _writeClipboard(text);
      status.textContent = 'Copied — clipboard clears in 30s';
      status.style.color = 'var(--green)';
      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(async () => {
        await _writeClipboard('');
        Vault.clearClip();
        clipboardItem = null;
        input.value = '';
        status.textContent = 'Clipboard cleared';
        status.style.color = 'var(--text3)';
      }, 30000);
    } catch (e) {
      status.textContent = 'Copy failed — grant clipboard permission';
      status.style.color = 'var(--red)';
    }
  }

  async function _writeClipboard(text) {
    navigator.clipboard.writeText(text);
    if (clipboardItem) clipboardItem = null;
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

  return { init, clear, encryptAndCopy };
})();
