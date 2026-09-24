const FilesManager = (() => {
  let _files = [];
  let _pkgFile = null;   // file chosen for the Send composer
  let _openFile = null;  // .bbshare chosen for the opener
  let _opened = null;    // unwrapped package content

  function init() {
    document.getElementById('filesToggleBtn')?.addEventListener('click', () => {
      const sec = document.getElementById('filesSection');
      sec.classList.toggle('hidden');
      if (!sec.classList.contains('hidden')) refresh();
    });
    document.getElementById('closeFilesBtn')?.addEventListener('click', () => {
      document.getElementById('filesSection').classList.add('hidden');
    });
    document.getElementById('importFileBtn')?.addEventListener('click', () => document.getElementById('fileImportInput')?.click());
    document.getElementById('fileImportInput')?.addEventListener('change', async e => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        await Vault.saveFile(f);
        await refresh();
        toast(`Encrypted ${f.name}`);
      } catch {
        toast('Import failed — file too large?', 'red');
      }
      e.target.value = '';
    });
    _initSend();
    _initOpen();
  }

  /* ── Encrypted file list ── */
  async function refresh() {
    if (!Vault.isUnlocked()) return;
    _files = await Vault.getAllFiles();
    _renderFiles();
  }

  function _renderFiles() {
    const list = document.getElementById('filesList');
    if (!list) return;
    if (_files.length === 0) {
      list.innerHTML = `<div class="empty-state"><p>No files yet.<br/>Tap <strong>Import</strong> to encrypt one.</p></div>`;
      return;
    }
    list.innerHTML = _files.map(f => `
      <div class="file-item" data-id="${f.id}">
        <div class="file-info">
          <span class="file-name">${Vault.esc(f.name)}</span>
          <span class="file-meta">${Vault.formatSize(f.size)} · ${Vault.relTime(f.ts)}</span>
        </div>
        <div class="secret-item-actions">
          <button class="secret-action-btn dl-btn" data-id="${f.id}" title="Download">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button class="secret-action-btn delete del-file" data-id="${f.id}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('.dl-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        try { await Vault.downloadFile(btn.dataset.id); } catch { toast('Download failed', 'red'); }
      });
    });
    list.querySelectorAll('.del-file').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const f = _files.find(x => x.id === btn.dataset.id);
        if (f && await uiConfirm('Delete File', `Delete "${f.name}" from the vault permanently?`, { danger: true, okLabel: 'Delete' })) {
          await Vault.deleteFile(btn.dataset.id);
          await refresh();
        }
      });
    });
  }

  /* ── Send: compose an encrypted package ── */
  function _initSend() {
    document.getElementById('sendPkgBtn')?.addEventListener('click', () => {
      _pkgFile = null;
      document.getElementById('pkgFileName').textContent = '';
      document.getElementById('sendForm').reset();
      document.getElementById('sendModal').classList.remove('hidden');
    });
    document.getElementById('closeSendModal')?.addEventListener('click', _closeSend);
    document.getElementById('cancelSendBtn')?.addEventListener('click', _closeSend);
    document.querySelector('#sendModal .modal-backdrop')?.addEventListener('click', _closeSend);
    document.getElementById('pickPkgFile')?.addEventListener('click', () => document.getElementById('pkgFileInput').click());
    document.getElementById('pkgFileInput')?.addEventListener('change', e => {
      _pkgFile = e.target.files[0] || null;
      document.getElementById('pkgFileName').textContent = _pkgFile ? `${_pkgFile.name} (${Vault.formatSize(_pkgFile.size)})` : '';
      e.target.value = '';
    });
    document.getElementById('sendForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const pin = document.getElementById('pkgPin').value;
      const message = document.getElementById('pkgMessage').value.trim();
      if (!_pkgFile) { await uiAlert('Send Package', 'Choose a file to encrypt first.'); return; }
      if (!pin || pin.length < 4) { await uiAlert('Send Package', 'The shared PIN must be at least 4 characters.'); return; }
      try {
        const pkg = await Vault.createPackage({ file: _pkgFile, message, pin });
        const res = await Vault.saveUnwrapped(pkg.filename, pkg.blob);
        _closeSend();
        await uiAlert('Package Created', `${pkg.filename} was saved${res.uri ? ' to Documents/BLACKBOX/' : ' to your downloads'}.\n\nSend it to anyone — WhatsApp, email, Bluetooth. Only someone with the shared PIN can open it in BLACKBOX.`);
      } catch (err) {
        await uiAlert('Send Failed', err.message || 'Could not create the package.');
      }
    });
  }
  function _closeSend() {
    document.getElementById('sendModal').classList.add('hidden');
    _pkgFile = null;
    document.getElementById('sendForm').reset();
    document.getElementById('pkgFileName').textContent = '';
  }

  /* ── Open: decrypt a .bbshare package ── */
  function _initOpen() {
    document.getElementById('openPkgBtn')?.addEventListener('click', () => {
      _openFile = null; _opened = null;
      document.getElementById('openFileName').textContent = '';
      document.getElementById('openPkgPin').value = '';
      document.getElementById('pkgOpenResult').classList.add('hidden');
      document.getElementById('openPkgModal').classList.remove('hidden');
    });
    document.getElementById('closeOpenModal')?.addEventListener('click', _closeOpen);
    document.getElementById('cancelOpenBtn')?.addEventListener('click', _closeOpen);
    document.querySelector('#openPkgModal .modal-backdrop')?.addEventListener('click', _closeOpen);
    document.getElementById('pickOpenFile')?.addEventListener('click', () => document.getElementById('openPkgInput').click());
    document.getElementById('openPkgInput')?.addEventListener('change', e => {
      _openFile = e.target.files[0] || null;
      document.getElementById('openFileName').textContent = _openFile ? _openFile.name : '';
      e.target.value = '';
    });
    document.getElementById('unlockPkgBtn')?.addEventListener('click', async () => {
      const pin = document.getElementById('openPkgPin').value;
      if (!_openFile) { await uiAlert('Open Package', 'Choose a .bbshare file first.'); return; }
      if (!pin) { await uiAlert('Open Package', 'Enter the shared PIN.'); return; }
      try {
        _opened = await Vault.openPackage(_openFile, pin);
        document.getElementById('pkgMsgOut').textContent = _opened.message || '(no message)';
        document.getElementById('pkgFileOut').textContent = `${_opened.name} (${Vault.formatSize(_opened.bytes.length)})`;
        document.getElementById('pkgOpenResult').classList.remove('hidden');
      } catch (err) {
        document.getElementById('pkgOpenResult').classList.add('hidden');
        await uiAlert('Open Failed', err.message || 'Could not decrypt this package.');
      }
    });
    document.getElementById('savePkgFileBtn')?.addEventListener('click', async () => {
      if (!_opened) return;
      const blob = new Blob([_opened.bytes], { type: _opened.type });
      const res = await Vault.saveUnwrapped(_opened.name, blob);
      toast(res.uri ? 'Saved to Documents/BLACKBOX/' : 'Saved to downloads');
    });
  }
  function _closeOpen() {
    document.getElementById('openPkgModal').classList.add('hidden');
    _openFile = null; _opened = null;
    document.getElementById('pkgOpenResult').classList.add('hidden');
  }

  function toast(msg, type) {
    const t = document.createElement('div');
    t.className = 'toast' + (type === 'red' ? ' red' : ' green');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  return { init, refresh };
})();
