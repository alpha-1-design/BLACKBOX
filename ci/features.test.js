#!/usr/bin/env node
/**
 * Feature logic tests — password generator + vault health audit, run in a
 * DOM-less vm so the math (unbiased RNG, entropy, scoring, reuse detection)
 * is verified without a browser. The DOM shells are covered by ui-contract.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const webcrypto = require('crypto').webcrypto;

let failures = 0;
const check = (cond, msg) => { console.log(`  ${cond ? '\u2713' : '\u2717'} ${msg}`); if (!cond) failures++; };

function load(file, globalName) {
  const sandbox = {
    crypto: webcrypto,
    console, setTimeout, clearTimeout,
    document: {
      getElementById: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} } }),
      body: { appendChild() {} },
    },
    navigator: { clipboard: { writeText: async () => {} } },
    Event: class Event { constructor(type) { this.type = type; } },
  };
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(__dirname, '..', 'www', file), 'utf8');
  vm.runInContext(src + `\n;globalThis.__mod = ${globalName};`, sandbox, { filename: file });
  return sandbox.__mod;
}

const Gen = load('generator.js', 'PasswordGen');
const Health = load('health.js', 'VaultHealth');

/* ── Generator ── */
console.log('Password generator:');
{
  const full = { length: 20, upper: true, lower: true, digit: true, symbol: true };
  const p = Gen.generate(full);
  check(p.length === 20, `generate() honours length (got ${p.length})`);
  check(/[A-Z]/.test(p), 'contains an uppercase letter (class guarantee)');
  check(/[a-z]/.test(p), 'contains a lowercase letter (class guarantee)');
  check(/\d/.test(p), 'contains a digit (class guarantee)');
  check(/[^A-Za-z0-9]/.test(p), 'contains a symbol (class guarantee)');

  const pool = Gen.poolSize(full);
  const charsets = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}:,.?/~';
  check(pool === 86, `pool size for all classes is 86 (got ${pool})`);
  check([...p].every(c => charsets.includes(c)), 'every character comes from the declared alphabet');

  const digitsOnly = Gen.generate({ length: 14, upper: false, lower: false, digit: true, symbol: false });
  check(/^\d{14}$/.test(digitsOnly), 'single-class mode emits only that class');

  const fallback = Gen.generate({ length: 10, upper: false, lower: false, digit: false, symbol: false });
  check(/^[a-z]{10}$/.test(fallback), 'all classes off falls back to lowercase (never empty)');

  const bits = Gen.entropyBits(20, pool);
  check(Math.abs(bits - 20 * Math.log2(86)) < 1e-9, 'entropy = length × log2(pool)');
  check(Gen.describe(30) === 'Weak' && Gen.describe(50) === 'Fair' && Gen.describe(70) === 'Strong' && Gen.describe(120) === 'Excellent',
    'quality labels map to the documented thresholds');

  // Unbiased draw sanity: 300 single-digit draws must hit all 10 digits
  // (probability of a miss ≈ 1e-13 — a biased/broken RNG would show it).
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(Gen.generate({ length: 1, upper: false, lower: false, digit: true, symbol: false }));
  check(seen.size === 10, 'RNG reaches every digit across 300 draws (no modulo starvation)');

  const unique = new Set(Array.from({ length: 50 }, () => Gen.generate(full)));
  check(unique.size === 50, 'regenerating produces fresh passwords');
}

/* ── Vault health ── */
console.log('Vault health audit:');
{
  const weak = Health.analyze([{ id: '1', name: 'Home WiFi', category: 'password', value: 'password' }]);
  check(weak.issues.some(i => i.reason === 'Common password'), 'dictionary password is flagged');
  check(weak.score < 60, `common password drops the score (got ${weak.score})`);
  check(weak.weak === 1, 'weak counter counts the entry once');

  const digitTrapped = Health.analyze([{ id: '1', name: 'Old account', category: 'password', value: 'password123' }]);
  check(digitTrapped.issues.some(i => i.reason === 'Common password'), 'trailing digits are stripped before the dictionary lookup');

  const strongVal = 'Tr0ub4dor&3-xK9!mQ';
  const strong = Health.analyze([{ id: '1', name: 'Main vault', category: 'password', value: strongVal }]);
  check(strong.issues.length === 0, `strong password produces no issues (got: ${strong.issues.map(i => i.reason).join(', ') || 'none'})`);
  check(strong.score === 100 && strong.label === 'Excellent', 'clean vault scores 100 · Excellent');

  const reused = Health.analyze([
    { id: '1', name: 'Alpha', category: 'password', value: 'Same-Secr3t!value' },
    { id: '2', name: 'Beta', category: 'password', value: 'Same-Secr3t!value' },
  ]);
  check(reused.reused === 1, 'identical values across entries are detected once');
  check(reused.issues.some(i => i.reason === 'Reused value'), 'reuse is reported as an issue');
  check(reused.score < 100, `reuse costs score points (got ${reused.score})`);

  const empty = Health.analyze([{ id: '1', name: 'Blank', category: 'password', value: '' }]);
  check(empty.issues.some(i => i.reason === 'Very short'), 'empty values are flagged');

  const repeated = Health.analyze([{ id: '1', name: 'Old code', category: 'password', value: 'aaaaaaaa' }]);
  check(repeated.issues.some(i => i.reason === 'Single repeated character'), 'pure single-character repeats are flagged as critical');
  check(repeated.score < 60, `a pure repeat scores below "Fair" (got ${repeated.score})`);

  const nameTok = Health.analyze([{ id: '1', name: 'Twitter Account', category: 'password', value: 'twitter-2024' }]);
  check(nameTok.issues.some(i => i.reason === 'Contains the name'), 'password containing its own entry name is flagged');

  const none = Health.analyze([]);
  check(none.score === 100 && none.count === 0, 'empty vault scores 100 with nothing to audit');
  check(Health.labelFor(95) === 'Excellent' && Health.labelFor(80) === 'Good' && Health.labelFor(60) === 'Fair' && Health.labelFor(30) === 'At risk',
    'score labels map to the documented thresholds');
}

console.log('');
if (failures > 0) { console.error(`FAILED: ${failures} feature check(s).`); process.exit(1); }
console.log('All feature logic tests passed.');
process.exit(0);
