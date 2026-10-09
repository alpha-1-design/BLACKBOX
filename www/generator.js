/* Password generator — crypto-strong, on-device, with live entropy.
   Unbiased sampling via rejection (no modulo bias), one guaranteed
   character from every selected class, and a secure Fisher–Yates shuffle.
   Reachable from the home feature card and directly inside the secret
   add/edit form ("Generate a strong password"). Nothing ever leaves the
   device — crypto.getRandomValues is the platform CSPRNG. */
const PasswordGen = (() => {
  const SETS = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    digit: '0123456789',
    symbol: '!@#$%^&*()-_=+[]{}:,.?/~',
  };

  // Unbiased integer in [0, max): reject the tail of the 32-bit range that
  // would skew the modulo, so every character is equally likely.
  function _rand(max) {
    const limit = Math.floor(4294967296 / max) * max;
    const a = new Uint32Array(1);
    let v;
    do { crypto.getRandomValues(a); v = a[0]; } while (v >= limit);
    return v % max;
  }

  function _classes(o) {
    const keys = Object.keys(SETS).filter(k => o[k]);
    return keys.length ? keys : ['lower']; // never emit an empty password
  }

  function generate(opts) {
    const o = Object.assign({ length: 20, upper: true, lower: true, digit: true, symbol: true }, opts || {});
    const keys = _classes(o);
    const pools = keys.map(k => SETS[k]);
    const all = pools.join('');
    const len = Math.max(1, o.length | 0); // exact length is the contract
    const out = [];
    for (const set of pools) out.push(set[_rand(set.length)]);       // guarantee coverage
    while (out.length < len) out.push(all[_rand(all.length)]);
    for (let i = out.length - 1; i > 0; i--) {                        // secure shuffle
      const j = _rand(i + 1);
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out.join('');
  }

  function poolSize(opts) {
    const o = Object.assign({ upper: true, lower: true, digit: true, symbol: true }, opts || {});
    return _classes(o).reduce((n, k) => n + SETS[k].length, 0);
  }

  const entropyBits = (len, pool) => len * Math.log2(pool);

  function describe(bits) {
    if (bits < 45) return 'Weak';
    if (bits < 60) return 'Fair';
    if (bits < 80) return 'Strong';
    return 'Excellent';
  }

  /* ── UI ── */
  let _forSecret = false;

  function init() {
    document.getElementById('openGenBtn')?.addEventListener('click', () => open());
    document.getElementById('secretGenBtn')?.addEventListener('click', () => open({ forSecret: true }));
    document.getElementById('closeGenModal')?.addEventListener('click', close);
    ['genUpper', 'genLower', 'genDigit', 'genSymbol'].forEach(id =>
      document.getElementById(id)?.addEventListener('change', _render));
    document.getElementById('genLength')?.addEventListener('input', _render);
    document.getElementById('genRefresh')?.addEventListener('click', _render);
    document.getElementById('genCopy')?.addEventListener('click', _copy);
    document.getElementById('genUse')?.addEventListener('click', _use);
  }

  function open(opts) {
    _forSecret = !!(opts && opts.forSecret);
    document.getElementById('genUse')?.classList.toggle('hidden', !_forSecret);
    document.getElementById('genModal')?.classList.remove('hidden');
    _render();
  }

  function close() {
    document.getElementById('genModal')?.classList.add('hidden');
  }

  function _opts() {
    const num = id => parseInt(document.getElementById(id)?.value, 10);
    const on = id => !!document.getElementById(id)?.checked;
    return {
      length: num('genLength') || 20,
      upper: on('genUpper'),
      lower: on('genLower'),
      digit: on('genDigit'),
      symbol: on('genSymbol'),
    };
  }

  function _render() {
    const o = _opts();
    const out = document.getElementById('genOutput');
    if (!out) return;
    out.value = generate(o);
    const lenVal = document.getElementById('genLenVal');
    if (lenVal) lenVal.textContent = String(o.length);
    const pool = poolSize(o);
    const bits = entropyBits(o.length, pool);
    const ent = document.getElementById('genEntropy');
    if (ent) ent.textContent = `${Math.round(bits)} bits · ${describe(bits)} · ${o.length} characters from a ${pool}-character alphabet`;
  }

  async function _copy() {
    const out = document.getElementById('genOutput');
    if (!out || !out.value) return;
    try {
      await navigator.clipboard.writeText(out.value);
      toast('Copied to clipboard');
    } catch (e) {
      toast('Copy failed — grant clipboard permission', true);
    }
  }

  function _use() {
    const target = document.getElementById('secretValue');
    const out = document.getElementById('genOutput');
    if (!target || !out || !out.value) return;
    target.value = out.value;
    close();
    toast('Strong password inserted');
  }

  function toast(msg, red) {
    const t = document.createElement('div');
    t.className = 'toast ' + (red ? 'red' : 'green');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  return { init, open, close, generate, poolSize, entropyBits, describe };
})();
