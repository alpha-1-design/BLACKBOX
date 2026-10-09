/* Vault health — an offline password audit against the decrypted vault:
   strength (length, variety, dictionary, patterns), reuse across entries,
   and hygiene flags, rolled into a 0–100 score.
   Runs entirely in memory against Vault.getAllSecrets(); the embedded
   common-password list means zero network — consistent with the FAQ
   (only the update check and the one-time speech model ever fetch). */
const VaultHealth = (() => {
  // Embedded so the audit never needs the network. Normalized lowercase.
  const COMMON = new Set([
    'password', 'password1', 'password123', '123456', '1234567', '12345678', '123456789',
    '1234567890', 'qwerty', 'qwerty123', 'qwertyuiop', 'abc123', 'iloveyou', 'admin',
    'administrator', 'letmein', 'welcome', 'welcome1', 'monkey', 'dragon', 'football',
    'baseball', 'superman', 'batman', 'trustno1', 'sunshine', 'princess', 'flower',
    'starwars', 'whatever', 'changeme', 'secret', 'master', 'shadow', 'michael',
    'jennifer', 'jordan', 'harley', 'ranger', 'hunter', 'buster', 'soccer', 'hockey',
    'killer', 'george', 'andrew', 'charlie', 'thomas', 'robert', 'daniel', 'ashley',
    'nicole', 'matthew', 'jessica', 'pepper', 'ginger', 'cookie', 'freedom', 'liverpool',
    'arsenal', 'chelsea', 'barcelona', 'realmadrid', 'pokemon', 'minecraft', 'fortnite',
    'access', 'login', 'star', 'hello', 'hello123', 'summer', 'winter', 'spring',
    'autumn', 'january', 'december', 'computer', 'internet', 'samsung', 'google',
    'facebook', 'twitter', 'instagram', 'linkedin', 'amazon', 'netflix', 'spotify',
    'oracle', 'mysql', 'postgres', 'sqlserver', 'database', 'redis', 'docker', 'linux',
    'ubuntu', 'windows', 'cisco', 'root', 'toor', 'guest', 'test', 'test123', 'demo',
    'default', 'system', 'operator', 'service', 'backup', 'temp', 'temp123', 'pass',
    'passw0rd', 'p@ssw0rd', 'p@ssword', 'letmein123', 'qwerty1', 'abc1234', 'aaa123',
    'a1b2c3d4', '111111', '000000', '121212', '654321', '112233', '123123',
    'zaq12wsx', '1q2w3e4r', '1qaz2wsx', 'qazwsx', 'asdfgh', 'asdfghjkl', 'zxcvbn',
    'password!', 'pass123', 'login123', 'hello1', 'iloveu', 'lovely', 'forever',
    'money', 'money123', 'money100', 'mustang', 'corvette', 'ferrari', 'porsche',
    'harley123', 'yankees', 'cowboys', 'lakers', 'jordan23', 'wizards', 'nintendo',
  ]);

  const _norm = v => String(v == null ? '' : v).trim().toLowerCase();
  // "password123!" → "password" for dictionary lookups.
  const _base = v => _norm(v).replace(/[0-9!@#$%^&*_.\-]+$/, '');

  function _sequential(n) {
    let run = 1;
    for (let i = 1; i < n.length; i++) {
      const d = n.charCodeAt(i) - n.charCodeAt(i - 1);
      if (d === 1 || d === -1) { run++; if (run >= 4) return true; }
      else run = 1;
    }
    return false;
  }

  // Strength findings for one value. Weight = score penalty.
  function _strengthIssues(value, name) {
    const v = String(value == null ? '' : value);
    const out = [];
    if (v.length < 6) out.push({ reason: 'Very short', detail: 'Fewer than 6 characters — guessable in milliseconds.', weight: 25 });
    else if (v.length < 8) out.push({ reason: 'Short', detail: 'Under 8 characters — below any modern minimum.', weight: 15 });

    const n = _norm(v);
    if (COMMON.has(n) || COMMON.has(_base(n))) {
      out.push({ reason: 'Common password', detail: 'Found in every breach wordlist — replace it immediately.', weight: 50 });
    }
    if (/^(.)\1+$/.test(n)) {
      out.push({ reason: 'Single repeated character', detail: 'One character over and over — guessable instantly.', weight: 45 });
    } else if (/(.)\1{2,}/.test(n)) {
      out.push({ reason: 'Repeated characters', detail: 'Runs like "aaa" shrink the search space fast.', weight: 10 });
    }
    if (_sequential(n)) {
      out.push({ reason: 'Sequential run', detail: 'Strings like "abcd" or "1234" add almost no strength.', weight: 10 });
    }
    const nameTok = String(name || '').toLowerCase().split(/\s+/).filter(t => t.length >= 4)[0];
    if (nameTok && n.includes(nameTok)) {
      out.push({ reason: 'Contains the name', detail: `Uses "${nameTok}" from the entry's own name.`, weight: 8 });
    }
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-z0-9]/i].filter(re => re.test(v)).length;
    if (v.length >= 8 && classes <= 1) {
      out.push({ reason: 'Single character type', detail: 'Only letters (or only digits) — mix character classes.', weight: 10 });
    }
    return out;
  }

  function analyze(secrets) {
    const list = Array.isArray(secrets) ? secrets : [];
    const issues = [];
    let weak = 0;

    for (const s of list) {
      const found = _strengthIssues(s.value, s.name);
      if (found.length) weak++;
      for (const f of found) {
        issues.push({ id: s.id, label: s.name || '(unnamed)', view: s.name || '', cat: s.category || 'other', reason: f.reason, detail: f.detail, weight: f.weight });
      }
    }

    // Reuse: the same value stored under multiple entries.
    const byVal = new Map();
    for (const s of list) {
      const k = String(s.value == null ? '' : s.value);
      if (!k) continue;
      if (!byVal.has(k)) byVal.set(k, []);
      byVal.get(k).push(s);
    }
    let reused = 0;
    for (const group of byVal.values()) {
      if (group.length < 2) continue;
      reused++;
      issues.push({
        id: group[0].id,
        label: group.map(s => s.name || '(unnamed)').join(', '),
        view: group[0].name || '',
        cat: 'other',
        reason: 'Reused value',
        detail: `The identical value backs ${group.length} entries — if one leaks, all of them do.`,
        weight: 8 * (group.length - 1),
      });
    }

    const penalty = Math.min(95, issues.reduce((n, i) => n + i.weight, 0));
    const score = list.length ? Math.max(5, 100 - penalty) : 100;
    return { score, label: labelFor(score), issues, count: list.length, weak, reused };
  }

  function labelFor(score) {
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 50) return 'Fair';
    return 'At risk';
  }

  /* ── UI ── */
  function init() {
    document.getElementById('openHealthBtn')?.addEventListener('click', () => open());
    document.getElementById('closeHealthModal')?.addEventListener('click', close);
    document.getElementById('healthRescan')?.addEventListener('click', render);
    refreshScore();
  }

  function close() {
    document.getElementById('healthModal')?.classList.add('hidden');
  }

  async function open() {
    document.getElementById('healthModal')?.classList.remove('hidden');
    await render();
  }

  async function render() {
    const scoreEl = document.getElementById('healthScore');
    const summaryEl = document.getElementById('healthSummary');
    const listEl = document.getElementById('healthList');
    if (!scoreEl || !summaryEl || !listEl) return;
    scoreEl.textContent = '···';
    let r;
    try {
      r = analyze(await Vault.getAllSecrets());
    } catch (e) {
      scoreEl.textContent = '—';
      summaryEl.textContent = 'Unlock the vault to run a health check.';
      return;
    }
    scoreEl.textContent = String(r.score);
    scoreEl.style.color = r.score >= 75 ? 'var(--green)' : r.score >= 50 ? 'var(--yellow)' : 'var(--red)';
    summaryEl.textContent = r.count === 0
      ? 'Nothing to audit yet — add some secrets first.'
      : `${r.count} entries · ${r.weak} weak · ${r.reused} reused · ${r.label}`;

    if (r.issues.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="40" height="40"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg><p>${r.count ? 'No weak or reused values.<br/>Your vault is in excellent shape.' : 'Add secrets to see their strength scored here.'}</p></div>`;
    } else {
      listEl.innerHTML = r.issues.map(i => `
        <div class="secret-item" style="cursor:default">
          <div class="secret-item-header">
            <span class="secret-item-name">${Vault.esc(i.label)}</span>
            <span class="secret-item-cat">${Vault.esc(i.reason)}</span>
          </div>
          <div class="secret-item-preview" style="white-space:normal">${Vault.esc(i.detail)}</div>
          <div class="secret-item-meta">
            <span class="secret-item-date">${Vault.esc(i.cat)}</span>
            ${i.view ? `<button type="button" class="tool-btn secondary" data-view="${Vault.esc(i.view)}" style="padding:0.3rem 0.75rem;font-size:0.7rem">View in Secrets</button>` : ''}
          </div>
        </div>`).join('');
      listEl.querySelectorAll('[data-view]').forEach(b =>
        b.addEventListener('click', () => _goto(b.dataset.view)));
    }
    refreshScore();
  }

  // Jump to the offending entry: prefill the Secrets search, then switch.
  function _goto(name) {
    close();
    const input = document.getElementById('secretsSearch');
    if (input) {
      input.value = name;
      input.dispatchEvent(new Event('input'));
    }
    if (typeof _switchTab === 'function') _switchTab('secrets');
  }

  // Home card line: live score without opening the report.
  async function refreshScore() {
    const el = document.getElementById('healthScoreLine');
    if (!el) return;
    if (!Vault.isUnlocked()) return;
    let r;
    try { r = analyze(await Vault.getAllSecrets()); } catch (e) { return; }
    if (r.count === 0) {
      el.textContent = 'Audits strength and reuse across every entry — entirely offline.';
      return;
    }
    el.textContent = `Score ${r.score}/100 · ${r.label}${r.issues.length ? ` · ${r.issues.length} to fix` : ' · all clear'}`;
  }

  return { init, open, close, analyze, refreshScore, labelFor };
})();
