const JournalModule = (() => {
  let _entries = [];
  let _activeCat = 'all';

  function init() {
    document.getElementById('addEntryBtn')?.addEventListener('click', () => openForm(null));
    document.getElementById('closeJournalModal')?.addEventListener('click', closeForm);
    document.getElementById('cancelJournalBtn')?.addEventListener('click', closeForm);
    document.getElementById('journalForm')?.addEventListener('submit', async e => { e.preventDefault(); await saveForm(); });
    document.getElementById('journalSearch')?.addEventListener('input', render);
    document.querySelectorAll('#journalPills .pill').forEach(p => {
      p.addEventListener('click', () => {
        document.querySelectorAll('#journalPills .pill').forEach(x => x.classList.remove('active'));
        p.classList.add('active');
        _activeCat = p.dataset.cat;
        render();
      });
    });
    document.querySelector('#journalModal .modal-backdrop')?.addEventListener('click', closeForm);
  }

  async function refresh() {
    if (!Vault.isUnlocked()) return;
    _entries = await Vault.getAllEntries();
    render();
  }

  function render() {
    const list = document.getElementById('journalList');
    if (!list) return;
    const q = (document.getElementById('journalSearch')?.value || '').toLowerCase();
    let filtered = _entries;
    if (_activeCat !== 'all') filtered = filtered.filter(e => e.category === _activeCat);
    if (q) filtered = filtered.filter(e => e.title.toLowerCase().includes(q) || e.body.toLowerCase().includes(q));

    if (filtered.length === 0) {
      list.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="40" height="40"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><p>${q ? 'No entries match your search.' : 'No journal entries yet.<br/>Tap <strong>+ Add</strong> to write one.'}</p></div>`;
      return;
    }

    list.innerHTML = filtered.map(e => `
      <div class="journal-item" data-id="${e.id}">
        <div class="journal-item-header">
          <span class="journal-item-title">${Vault.esc(e.title)}</span>
          <span class="journal-item-cat">${e.category}</span>
        </div>
        <div class="journal-item-body">${Vault.esc(e.body)}</div>
        <div class="journal-item-date">${Vault.relTime(e.ts)}</div>
      </div>
    `).join('');

    list.querySelectorAll('.journal-item').forEach(el => {
      el.addEventListener('click', async () => {
        const entry = _entries.find(x => x.id === el.dataset.id);
        if (!entry) return;
        if (confirm(`Edit "${entry.title}"?\n\nOK = Edit | Cancel = Delete`)) {
          openForm(entry);
        } else if (confirm('Delete this entry permanently?')) {
          await Vault.deleteEntry(entry.id);
          await refresh();
        }
      });
    });
  }

  function openForm(e) {
    document.getElementById('journalModalTitle').textContent = e ? 'Edit Entry' : 'New Entry';
    document.getElementById('journalTitle').value = e ? e.title : '';
    document.getElementById('journalCategory').value = e ? e.category : 'personal';
    document.getElementById('journalBody').value = e ? e.body : '';
    document.getElementById('journalModal').classList.remove('hidden');
    document.getElementById('journalTitle').focus();
  }

  function closeForm() {
    document.getElementById('journalModal').classList.add('hidden');
    document.getElementById('journalForm').reset();
  }

  async function saveForm() {
    const title = document.getElementById('journalTitle').value.trim() || 'Untitled';
    const body = document.getElementById('journalBody').value.trim();
    const category = document.getElementById('journalCategory').value;
    if (!body) return;
    await Vault.saveEntry({title, body, category});
    closeForm();
    await refresh();
  }

  return { init, refresh };
})();
