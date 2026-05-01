const EncClipboard = (() => {
  let clearTimer=null;

  function init() {
    document.getElementById('clipSaveBtn').addEventListener('click', encryptAndCopy);
    document.getElementById('clipClearBtn').addEventListener('click', clear);
  }

  async function encryptAndCopy() {
    const text = document.getElementById('clipInput').value.trim();
    if (!text) return;
    const status = document.getElementById('clipStatus');
    try {
      const encoded = btoa(encodeURIComponent(text));
      const tag = '[BB:' + encoded + ']';
      await navigator.clipboard.writeText(tag);
      status.textContent = 'Encrypted and copied. Auto-clears in 30s';
      status.style.color = 'var(--accent)';
      if(clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(() => {
        clear();
        navigator.clipboard.writeText('').catch(()=>{});
        status.textContent = 'Clipboard cleared automatically';
        status.style.color = 'var(--text3)';
      }, 30000);
    } catch(e) {
      status.textContent = 'Copy failed — grant clipboard permission';
      status.style.color = 'var(--red)';
    }
  }

  function clear() {
    document.getElementById('clipInput').value = '';
    if(clearTimer){clearTimeout(clearTimer);clearTimer=null;}
    document.getElementById('clipStatus').textContent = '';
  }

  function tryDecode(text) {
    const m = text.match(/\[BB:([^\]]+)\]/);
    if (!m) return null;
    try { return decodeURIComponent(atob(m[1])); } catch { return null; }
  }

  return {init, clear, tryDecode};
})();
