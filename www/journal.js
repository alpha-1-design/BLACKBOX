const JournalModule = (() => {
  let _entries = [];
  let _activeCat = 'all';
  let _editingId = null;
  let _viewingId = null; // read mode: entry is being read, not edited
  let _images = [];         // photo file ids attached to the entry being edited
  let _pendingImages = new Set(); // ids created during THIS edit (cleaned up if abandoned)
  let _thumbUrls = [];      // object URLs alive for the edit-mode thumb strip
  let _readUrls = [];       // object URLs alive for the read-mode photo grid
  let _mood = 0;            // 1–5 mood of the entry in view/edit (0 = none)
  let _fav = false;         // favorite flag of the entry in view/edit
  let _calMonth = null;     // Date (first of month) shown in the calendar panel
  let _dayFilter = null;    // 'YYYY-MM-DD' when the list is scoped to a single day
  let _promptDismissed = false;
  let _promptIdx = -1;

  const MOODS = [
    { e: '😞', l: 'Rough' }, { e: '😕', l: 'Low' }, { e: '😐', l: 'Okay' },
    { e: '🙂', l: 'Good' }, { e: '😄', l: 'Great' },
  ];

  // Shipped with the app — no server, no AI, nothing ever leaves the device.
  const PROMPTS = [
    "What moment from today do you want to remember a year from now?",
    "What are you grateful for right now — name three small things.",
    "What challenged you today, and what did it teach you?",
    "Describe your day as if writing to your future self.",
    "What is taking up the most space in your mind tonight?",
    "What went better than expected today?",
    "Who made a difference in your day, and why?",
    "What would you do differently if you could replay today?",
    "What are you looking forward to this week?",
    "Write about a small win you haven't celebrated yet.",
    "What boundaries do you need to protect this week?",
    "What made you laugh recently?",
    "If today had a title, what would it be?",
    "What are you avoiding, and what's the smallest next step?",
    "Describe a place that makes you feel calm.",
    "What compliment do you keep dismissing?",
    "What are you learning about yourself lately?",
    "What does a perfect slow morning look like for you?",
    "Which conversation from today deserves a second thought?",
    "What are you proud of that nobody knows about?",
    "Write a short thank-you note to yourself.",
    "What would make tomorrow a good day?",
  ];

  const TEMPLATES = {
    daily: "Today I...\n\nWhat went well:\n\nWhat I would do differently:",
    gratitude: "Three things I'm grateful for:\n1.\n2.\n3.",
    goals: "This week's goals:\n1.\n2.\n3.\n\nWhat got in the way:",
    meeting: "Attendees:\n\nAgenda:\n\nDecisions:\n\nAction items:",
    travel: "Where:\n\nWho with:\n\nHighlights:\n\nThe moment I want to remember:",
  };

  const _dayKey = ts => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const _words = s => (s || '').trim() ? s.trim().split(/\s+/).length : 0;

  function init() {
    document.getElementById('addEntryBtn')?.addEventListener('click', () => openForm(null));
    document.getElementById('closeJournalModal')?.addEventListener('click', () => closeForm(false));
    document.getElementById('cancelJournalBtn')?.addEventListener('click', () => closeForm(false));
    document.getElementById('journalDelete')?.addEventListener('click', deleteEditing);
    document.getElementById('journalMoreEdit')?.addEventListener('click', () => { _closeMenu(); editViewing(); });
    document.getElementById('journalReadEdit')?.addEventListener('click', editViewing);
    document.getElementById('journalReadClose')?.addEventListener('click', () => closeForm(false));
    document.getElementById('journalMoreBtn')?.addEventListener('click', e => {
      e.stopPropagation();
      document.getElementById('journalMoreMenu')?.classList.toggle('open');
    });
    // Tapping anywhere outside the menu closes it.
    document.addEventListener('click', e => {
      const menu = document.getElementById('journalMoreMenu');
      if (menu && menu.classList.contains('open') && !menu.contains(e.target)) {
        menu.classList.remove('open');
      }
    });
    document.getElementById('journalAttachBtn')?.addEventListener('click', () => document.getElementById('journalPhotoInput')?.click());
    document.getElementById('journalPhotoInput')?.addEventListener('change', async e => {
      const files = Array.from(e.target.files || []);
      let failed = 0;
      for (const f of files) {
        try {
          const id = await Vault.saveFile(f); // encrypted like every other file
          _images.push(id);
          _pendingImages.add(id); // unlinked again if the edit is abandoned
        } catch { failed++; }
      }
      e.target.value = '';
      _renderThumbs();
      if (failed) await uiAlert('Photos', `${failed} photo${failed > 1 ? 's' : ''} could not be encrypted and ${failed > 1 ? 'were' : 'was'} skipped.`);
    });
    document.getElementById('journalMoreFav')?.addEventListener('click', () => { _closeMenu(); toggleFav(); });
    document.getElementById('journalMoreExport')?.addEventListener('click', () => { _closeMenu(); exportEntry(); });
    document.getElementById('journalCalBtn')?.addEventListener('click', _toggleCalendar);
    document.getElementById('calPrev')?.addEventListener('click', () => _stepMonth(-1));
    document.getElementById('calNext')?.addEventListener('click', () => _stepMonth(1));
    document.getElementById('journalDayFilterClear')?.addEventListener('click', () => {
      _dayFilter = null;
      _syncDayFilter();
      render();
    });
    document.getElementById('calGrid')?.addEventListener('click', e => {
      const cell = e.target.closest('.cal-cell.has');
      if (!cell) return;
      _dayFilter = _dayFilter === cell.dataset.key ? null : cell.dataset.key;
      _syncDayFilter();
      render();
    });
    document.getElementById('journalMood')?.addEventListener('click', e => {
      const btn = e.target.closest('.mood-opt');
      if (!btn) return;
      const m = +btn.dataset.mood;
      _mood = _mood === m ? 0 : m; // tap the same mood again to clear it
      _syncMood();
    });
    document.getElementById('journalTemplate')?.addEventListener('change', e => {
      if (_editingId) { e.target.value = ''; return; } // never inject into an existing entry
      const t = TEMPLATES[e.target.value];
      if (t) _fillBody(t);
    });
    document.getElementById('journalPromptShuffle')?.addEventListener('click', () => _showPrompt(_nextPrompt()));
    document.getElementById('journalPromptUse')?.addEventListener('click', () => {
      const t = document.getElementById('journalPromptText')?.textContent;
      if (t) _fillBody(t);
    });
    document.getElementById('journalPromptHide')?.addEventListener('click', () => {
      _promptDismissed = true;
      document.getElementById('journalPromptCard')?.classList.add('hidden');
    });
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
    document.querySelector('#journalModal .modal-backdrop')?.addEventListener('click', () => closeForm(false));
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
    if (_activeCat === '__fav') filtered = filtered.filter(e => e.fav);
    else if (_activeCat !== 'all') filtered = filtered.filter(e => e.category === _activeCat);
    if (_dayFilter) filtered = filtered.filter(e => _dayKey(e.ts) === _dayFilter);
    if (q) filtered = filtered.filter(e => e.title.toLowerCase().includes(q) || e.body.toLowerCase().includes(q) || (e.tags || []).join(' ').toLowerCase().includes(q));

    if (filtered.length === 0) {
      list.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="40" height="40"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><p>${q ? 'No entries match your search.' : _dayFilter ? 'No entries on this day.' : _activeCat === '__fav' ? 'No favorites yet — open an entry and star it from the ⋯ menu.' : 'No journal entries yet.<br/>Tap <strong>+ Add</strong> to write one.'}</p></div>`;
      return;
    }

    list.innerHTML = filtered.map(e => `
      <div class="journal-item" data-id="${e.id}">
        <div class="journal-item-header">
          <span class="journal-item-title">${e.fav ? '<span class="fav-star">★</span> ' : ''}${Vault.esc(e.title)}</span>
          <span class="journal-item-cat">${e.category}${e.mood && MOODS[e.mood - 1] ? ` <span class="journal-item-mood">${MOODS[e.mood - 1].e}</span>` : ''}</span>
        </div>
        <div class="journal-item-body">${Vault.esc(e.body)}</div>
        <div class="journal-item-date">${Vault.relTime(e.ts)}${e.images && e.images.length ? ` · 📷 ${e.images.length}` : ''}</div>
      </div>
    `).join('');

    // Tap opens the entry in read mode — a diary entry is for reading first.
    list.querySelectorAll('.journal-item').forEach(el => {
      el.addEventListener('click', () => {
        const entry = _entries.find(x => x.id === el.dataset.id);
        if (entry) openRead(entry);
      });
    });
    _renderStats();
    _renderCal();
  }

  function currentEntry() {
    return _entries.find(x => x.id === (_editingId || _viewingId)) || null;
  }

  function editViewing() {
    const entry = currentEntry();
    if (entry) openForm(entry);
  }

  function _closeMenu() {
    document.getElementById('journalMoreMenu')?.classList.remove('open');
  }

  function _setMode(viewing) {
    document.getElementById('journalReadView')?.classList.toggle('hidden', !viewing);
    document.getElementById('journalForm')?.classList.toggle('hidden', viewing);
  }

  // Read mode: full panel with the entry rendered as readable prose.
  function openRead(e) {
    _viewingId = e.id;
    _editingId = null;
    document.getElementById('journalModalTitle').textContent = 'Journal Entry';
    document.getElementById('journalReadTitle').textContent = e.title || 'Untitled';
    document.getElementById('journalReadCat').textContent = e.category;
    document.getElementById('journalReadDate').textContent = Vault.relTime(e.ts);
    document.getElementById('journalReadBody').textContent = e.body;
    _renderReadMeta(e);
    _renderReadPhotos(e);
    _fav = !!e.fav;
    _mood = typeof e.mood === 'number' ? e.mood : 0;
    _setMode(true);
    document.getElementById('journalMoreBtn')?.classList.remove('hidden');
    document.getElementById('journalMoreEdit')?.classList.remove('hidden');
    document.getElementById('journalMoreExport')?.classList.remove('hidden');
    document.getElementById('journalMoreEditDiv')?.classList.remove('hidden');
    document.getElementById('journalDelete')?.classList.remove('hidden');
    const favBtn = document.getElementById('journalMoreFav');
    if (favBtn) {
      favBtn.textContent = e.fav ? '★ Remove favorite' : '★ Add to favorites';
      favBtn.classList.remove('hidden');
    }
    _closeMenu();
    document.getElementById('journalModal').classList.remove('hidden');
  }

  function openForm(e) {
    _editingId = e ? e.id : null;
    _viewingId = null;
    document.getElementById('journalModalTitle').textContent = e ? 'Edit Entry' : 'New Entry';
    document.getElementById('journalTitle').value = e ? e.title : '';
    document.getElementById('journalCategory').value = e ? e.category : 'personal';
    document.getElementById('journalBody').value = e ? e.body : '';
    _images = Array.isArray(e && e.images) ? [...e.images] : [];
    _pendingImages.clear();
    _renderThumbs();
    document.getElementById('journalTags').value = e && Array.isArray(e.tags) ? e.tags.join(', ') : '';
    document.getElementById('journalTemplate').value = '';
    _mood = e && typeof e.mood === 'number' ? e.mood : 0;
    _fav = !!(e && e.fav);
    _syncMood();
    // The prompt card is a blank-page helper — new entries only.
    const pc = document.getElementById('journalPromptCard');
    if (pc) {
      if (!e && !_promptDismissed) { _showPrompt(_nextPrompt()); pc.classList.remove('hidden'); }
      else pc.classList.add('hidden');
    }
    _setMode(false);
    // Delete option only makes sense for an existing entry — the 3-dot menu
    // in the top bar carries it now instead of a third button in the action row.
    const del = document.getElementById('journalDelete');
    if (del) del.classList.toggle('hidden', !e);
    // "Edit entry" is meaningless while already editing (divider hides with it).
    document.getElementById('journalMoreEdit')?.classList.add('hidden');
    document.getElementById('journalMoreEditDiv')?.classList.add('hidden');
    document.getElementById('journalMoreFav')?.classList.add('hidden');
    document.getElementById('journalMoreExport')?.classList.add('hidden');
    const moreBtn = document.getElementById('journalMoreBtn');
    if (moreBtn) moreBtn.classList.toggle('hidden', !e);
    _closeMenu();
    document.getElementById('journalModal').classList.remove('hidden');
  }

  function _revokeUrls(arr) { arr.forEach(u => URL.revokeObjectURL(u)); }

  // Edit-mode thumbnail strip: decrypt previews, one remove button per photo.
  function _renderThumbs() {
    const wrap = document.getElementById('journalThumbs');
    if (!wrap) return;
    _revokeUrls(_thumbUrls); _thumbUrls = [];
    if (!_images.length) {
      wrap.innerHTML = `<span class="journal-thumbs-empty">No photos attached</span>`;
      return;
    }
    wrap.innerHTML = _images.map((id, i) => `
      <div class="jthumb" data-i="${i}">
        <span class="jthumb-ph"></span>
        <button type="button" class="jthumb-x" data-i="${i}" title="Remove photo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="10" height="10"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`).join('');
    wrap.querySelectorAll('.jthumb').forEach(el => {
      const id = _images[+el.dataset.i];
      Vault.getFileBlob(id).then(blob => {
        if (!blob || !el.isConnected) return;
        const url = URL.createObjectURL(blob);
        if (!el.isConnected) { URL.revokeObjectURL(url); return; }
        _thumbUrls.push(url);
        el.insertAdjacentHTML('afterbegin', `<img src="${url}" alt=""/>`);
      }).catch(() => {});
    });
    wrap.querySelectorAll('.jthumb-x').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const i = +btn.dataset.i;
        const id = _images[i];
        _images.splice(i, 1);
        // Only photos added during THIS edit session get deleted from the
        // vault; pre-existing ones stay in the file vault (they may be
        // referenced elsewhere) — the entry simply unlinks from them.
        if (_pendingImages.has(id)) {
          _pendingImages.delete(id);
          Vault.deleteFile(id).catch(() => {});
        }
        _renderThumbs();
      });
    });
  }

  // Read-mode photo grid: tap opens the shared full-screen viewer.
  function _renderReadPhotos(entry) {
    const wrap = document.getElementById('journalPhotos');
    if (!wrap) return;
    _revokeUrls(_readUrls); _readUrls = [];
    const ids = Array.isArray(entry.images) ? entry.images : [];
    wrap.innerHTML = '';
    wrap.classList.toggle('hidden', ids.length === 0);
    ids.forEach((id, i) => {
      const cell = document.createElement('div');
      cell.className = 'journal-photo';
      cell.innerHTML = `<span class="jthumb-ph"></span>`;
      cell.addEventListener('click', () => {
        if (typeof FilesManager !== 'undefined') FilesManager.openViewer(ids, i);
      });
      wrap.appendChild(cell);
      Vault.getFileBlob(id).then(blob => {
        if (!blob) { cell.remove(); return; } // deleted from the vault since
        const url = URL.createObjectURL(blob);
        if (!cell.isConnected) { URL.revokeObjectURL(url); return; }
        _readUrls.push(url);
        cell.innerHTML = `<img src="${url}" alt=""/>`;
      }).catch(() => {});
    });
  }

  function closeForm(keepData) {
    const modal = document.getElementById('journalModal');
    const form = document.getElementById('journalForm');
    if (!keepData) form.reset();
    // Photos added in this session but never saved must not linger as orphans
    // in the file vault. Saved ones are owned by the entry from here on.
    if (!keepData) for (const id of _pendingImages) Vault.deleteFile(id).catch(() => {});
    _pendingImages.clear();
    _images = [];
    _mood = 0;
    _fav = false;
    _revokeUrls(_thumbUrls); _thumbUrls = [];
    _revokeUrls(_readUrls); _readUrls = [];
    _editingId = null;
    _viewingId = null;
    _setMode(false); // next open starts from the form (Add entry)
    _closeMenu();
    modal.classList.add('hidden');
  }

  /* ── Premium journal: stats, calendar, moods, prompts, favorites ──
     Everything below computes locally over encrypted entry data — the
     offline answer to the paid tiers of Day One / Stoic / Daylio. */

  function _syncMood() {
    document.querySelectorAll('#journalMood .mood-opt').forEach(b => b.classList.toggle('active', +b.dataset.mood === _mood));
  }

  // Never overwrites what's already written: fills an empty page, appends otherwise.
  function _fillBody(text) {
    const b = document.getElementById('journalBody');
    if (!b) return;
    b.value = b.value.trim() ? b.value.trimEnd() + '\n\n' + text : text;
    b.focus();
  }

  function _nextPrompt() {
    if (!PROMPTS.length) return '';
    let i;
    do { i = Math.floor(Math.random() * PROMPTS.length); } while (PROMPTS.length > 1 && i === _promptIdx);
    _promptIdx = i;
    return PROMPTS[i];
  }
  function _showPrompt(text) {
    const el = document.getElementById('journalPromptText');
    if (el) el.textContent = text;
  }

  function _syncDayFilter() {
    const chip = document.getElementById('journalDayFilter');
    if (!chip) return;
    chip.classList.toggle('hidden', !_dayFilter);
    if (_dayFilter) {
      const d = new Date(_dayFilter + 'T00:00:00');
      const label = document.getElementById('journalDayFilterLabel');
      if (label) label.textContent = `Showing ${d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`;
    }
  }

  function _toggleCalendar() {
    const cal = document.getElementById('journalCalendar');
    if (!cal) return;
    const opening = cal.classList.contains('hidden');
    if (opening && !_calMonth) _calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    cal.classList.toggle('hidden', !opening);
    if (opening) _renderCal();
  }
  function _stepMonth(d) {
    if (!_calMonth) _calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    _calMonth = new Date(_calMonth.getFullYear(), _calMonth.getMonth() + d, 1);
    _renderCal();
  }

  function _renderStats() {
    const el = document.getElementById('journalStats');
    if (!el) return;
    if (!_entries.length) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const days = new Set(_entries.map(e => _dayKey(e.ts)));
    let streak = 0;
    const cursor = new Date();
    if (!days.has(_dayKey(cursor))) cursor.setDate(cursor.getDate() - 1); // an unwritten today doesn't break it yet
    while (days.has(_dayKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
    const words = _entries.reduce((s, e) => s + _words(e.body), 0);
    const photos = _entries.reduce((s, e) => s + (Array.isArray(e.images) ? e.images.length : 0), 0);
    el.innerHTML = [
      streak ? `<span class="js-item js-hot">🔥 ${streak}-day streak</span>` : `<span class="js-item">Write today to start a streak</span>`,
      `<span class="js-item"><b>${_entries.length}</b> entries</span>`,
      `<span class="js-item"><b>${words.toLocaleString()}</b> words</span>`,
      `<span class="js-item">📷 <b>${photos}</b></span>`,
    ].join('');
  }

  function _renderCal() {
    const grid = document.getElementById('calGrid');
    if (!grid || !_calMonth) return;
    const title = document.getElementById('calTitle');
    if (title) title.textContent = _calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const byDay = new Map();
    for (const e of _entries) {
      const k = _dayKey(e.ts);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(e);
    }
    const y = _calMonth.getFullYear(), m = _calMonth.getMonth();
    const lead = new Date(y, m, 1).getDay();
    const daysIn = new Date(y, m + 1, 0).getDate();
    let html = '';
    for (let i = 0; i < lead; i++) html += `<span class="cal-cell"></span>`;
    for (let d = 1; d <= daysIn; d++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const list = byDay.get(key);
      let cls = 'cal-cell';
      if (list) {
        cls += ' has';
        const moods = list.map(e => e.mood).filter(mm => typeof mm === 'number');
        if (moods.length) {
          const avg = Math.round(moods.reduce((a, b) => a + b, 0) / moods.length);
          cls += ` m${Math.max(1, Math.min(5, avg))}`; // Daylio-style mood tint
        }
      }
      if (_dayFilter === key) cls += ' sel';
      html += `<button type="button" class="${cls}" data-key="${key}"${list ? '' : ' disabled'}>${d}</button>`;
    }
    grid.innerHTML = html;
  }

  function _renderReadMeta(e) {
    const moodEl = document.getElementById('journalReadMood');
    if (moodEl) {
      const has = typeof e.mood === 'number' && MOODS[e.mood - 1];
      moodEl.classList.toggle('hidden', !has);
      if (has) moodEl.textContent = `${MOODS[e.mood - 1].e} ${MOODS[e.mood - 1].l}`;
    }
    const dateEl = document.getElementById('journalReadDate');
    if (dateEl) dateEl.textContent = new Date(e.ts).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const stats = document.getElementById('journalReadStats');
    if (stats) {
      const parts = [`${_words(e.body)} words`];
      if (Array.isArray(e.images) && e.images.length) parts.push(`${e.images.length} photo${e.images.length > 1 ? 's' : ''}`);
      stats.textContent = parts.join(' · ');
      stats.classList.remove('hidden');
    }
    const tagsEl = document.getElementById('journalReadTags');
    if (tagsEl) {
      const tags = Array.isArray(e.tags) ? e.tags : [];
      tagsEl.classList.toggle('hidden', tags.length === 0);
      tagsEl.innerHTML = tags.map(t => `<span class="tag-chip">#${Vault.esc(String(t))}</span>`).join('');
    }
  }

  async function toggleFav() {
    const e = currentEntry();
    if (!e) return;
    const nv = !e.fav;
    // Full rewrite via saveEntry — ts keeps the entry on its original diary date.
    await Vault.saveEntry({ id: e.id, title: e.title, body: e.body, category: e.category,
      tags: e.tags, images: e.images, mood: e.mood, fav: nv || undefined, ts: e.ts });
    e.fav = nv;
    const favBtn = document.getElementById('journalMoreFav');
    if (favBtn) favBtn.textContent = nv ? '★ Remove favorite' : '★ Add to favorites';
    render(); // star + Favorites pill reflect the change
  }

  async function exportEntry() {
    const e = currentEntry();
    if (!e) return;
    const lines = [e.title, `${new Date(e.ts).toLocaleString()} · ${e.category}${e.mood && MOODS[e.mood - 1] ? ` · ${MOODS[e.mood - 1].l}` : ''}`];
    if (Array.isArray(e.tags) && e.tags.length) lines.push(`Tags: ${e.tags.join(', ')}`);
    lines.push('', e.body);
    if (Array.isArray(e.images) && e.images.length) lines.push('', `[${e.images.length} photo${e.images.length > 1 ? 's' : ''} stored encrypted in this BLACKBOX vault]`);
    const name = ((e.title || '').replace(/[^\w\- ]+/g, '').trim().slice(0, 40) || 'journal-entry') + '.txt';
    try {
      const res = await Vault.saveUnwrapped(name, new Blob([lines.join('\n')], { type: 'text/plain' }));
      await uiAlert('Exported', `${name} was saved ${res && res.uri ? 'to Documents/BLACKBOX/' : 'to your downloads'}.\n\nThe text is yours to keep — photos stay encrypted in the vault.`);
    } catch {
      await uiAlert('Export failed', 'The entry could not be written to a file.');
    }
  }

  async function deleteEditing() {
    const entry = currentEntry();
    closeForm();
    if (!entry) return;
    if (await uiConfirm('Delete Entry', `Delete "${entry.title}" permanently?`, { danger: true, okLabel: 'Delete' })) {
      await Vault.deleteEntry(entry.id);
      await refresh();
    }
  }

  async function saveForm() {
    const title = document.getElementById('journalTitle').value.trim() || 'Untitled';
    const body = document.getElementById('journalBody').value.trim();
    const category = document.getElementById('journalCategory').value;
    if (!body) {
      await uiAlert('Journal', 'Please write something before saving.');
      return;
    }
    const tags = document.getElementById('journalTags').value.split(',').map(t => t.trim()).filter(Boolean).slice(0, 8);
    const prev = _editingId ? _entries.find(x => x.id === _editingId) : null;
    await Vault.saveEntry({
      id: _editingId, title, body, category,
      images: [..._images],
      tags: tags.length ? tags : undefined,   // clearing all tags wipes the field
      mood: _mood || undefined,               // mood 0 clears the mood
      fav: _fav || undefined,
      ts: prev ? prev.ts : undefined,         // edits keep the original diary date
    });
    _pendingImages.clear(); // the entry owns these photos now
    closeForm(true);
    await refresh();
  }

  return { init, refresh };
})();
