const SecretsModule = (() => {
  let _secrets = [];
  let _activeCat = 'all';
  let _editingId = null;

  function init() {
    document.getElementById('addSecretBtn')?.addEventListener('click', () => openForm(null));
    document.getElementById('closeSecretModal')?.addEventListener('click', closeForm);
    document.getElementById('cancelSecretBtn')?.addEventListener('click', closeForm);
    document.getElementById('secretForm')?.addEventListener('submit', async e => { e.preventDefault(); await saveForm(); });
    document.getElementById('toggleSecretVis')?.addEventListener('click', toggleVis);
    document.getElementById('secretsSearch')?.addEventListener('input', render);
    document.querySelectorAll('#secretPills .pill').forEach(p => {
      p.addEventListener('click', () => {
        document.querySelectorAll('#secretPills .pill').forEach(x => x.classList.remove('active'));
        p.classList.add('active');
        _activeCat = p.dataset.cat;
        render();
      });
    });
    document.querySelector('#secretModal .modal-backdrop')?.addEventListener('click', closeForm);
  }

  async function refresh() {
    if (!Vault.isUnlocked()) return;
    _secrets = await Vault.getAllSecrets();
    render();
  }

  function render() {
    const list = document.getElementById('secretsList');
    if (!list) return;
    const q = (document.getElementById('secretsSearch')?.value || '').toLowerCase();
    let filtered = _secrets;
    if (_activeCat !== 'all') filtered = filtered.filter(s => s.category === _activeCat);
    if (q) filtered = filtered.filter(s => s.name.toLowerCase().includes(q) || (s.notes||'').toLowerCase().includes(q));

    if (filtered.length === 0) {
      list.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="40" height="40"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg><p>${q ? 'No secrets match your search.' : 'No secrets yet.<br/>Tap <strong>+ Add</strong> to store one.'}</p></div>`;
      return;
    }

    list.innerHTML = filtered.map(s => `
      <div class="secret-item" data-id="${s.id}">
        <div class="secret-item-header">
          <span class="secret-item-name">${Vault.esc(s.name)}</span>
          <span class="secret-item-cat">${s.category}</span>
        </div>
        <div class="secret-item-preview value-hidden" data-value="${Vault.esc(s.value)}">Click to reveal</div>
        <div class="secret-item-meta">
          <span class="secret-item-date">${Vault.relTime(s.ts)}</span>
          <div class="secret-item-actions">
            <button class="secret-action-btn copy-btn" data-id="${s.id}" title="Copy value">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
            <button class="secret-action-btn edit-btn" data-id="${s.id}" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="secret-action-btn delete delete-btn" data-id="${s.id}" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          </div>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.secret-item').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('.secret-action-btn')) return;
        const preview = el.querySelector('.secret-item-preview');
        if (preview.classList.contains('value-hidden')) {
          preview.textContent = el.dataset.value;
          preview.classList.remove('value-hidden');
        } else {
          preview.textContent = 'Click to reveal';
          preview.classList.add('value-hidden');
        }
      });
    });
    list.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const s = _secrets.find(x => x.id === btn.dataset.id);
        if (s) { navigator.clipboard.writeText(s.value); toast('Copied'); }
      });
    });
    list.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const s = _secrets.find(x => x.id === btn.dataset.id);
        if (s) openForm(s);
      });
    });
    list.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        if (confirm('Delete this secret?')) {
          await Vault.deleteSecret(btn.dataset.id);
          await refresh();
        }
      });
    });
  }

  function openForm(s) {
    _editingId = s ? s.id : null;
    document.getElementById('secretModalTitle').textContent = s ? 'Edit Secret' : 'New Secret';
    document.getElementById('secretName').value = s ? s.name : '';
    document.getElementById('secretCategory').value = s ? s.category : 'api';
    document.getElementById('secretValue').value = s ? s.value : '';
    document.getElementById('secretValue').type = 'password';
    document.getElementById('secretNotes').value = s ? (s.notes || '') : '';
    document.getElementById('secretModal').classList.remove('hidden');
    document.getElementById('secretName').focus();
  }

  function closeForm() {
    document.getElementById('secretModal').classList.add('hidden');
    _editingId = null;
    document.getElementById('secretForm').reset();
  }

  async function saveForm() {
    const name = document.getElementById('secretName').value.trim();
    const value = document.getElementById('secretValue').value.trim();
    const category = document.getElementById('secretCategory').value;
    const notes = document.getElementById('secretNotes').value.trim();
    if (!name || !value) return;
    await Vault.saveSecret({id: _editingId, name, value, category, notes});
    closeForm();
    await refresh();
  }

  function toggleVis() {
    const inp = document.getElementById('secretValue');
    inp.type = inp.type === 'password' ? 'text' : 'password';
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
