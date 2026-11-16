#!/usr/bin/env node
/**
 * Extra feature tests: otpauth:// import parsing and the new sort exports.
 * Dependency-free — runs the real www/*.js inside DOM-less vm contexts,
 * modelled on ci/totp.test.js and ci/features.test.js.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const webcrypto = require('crypto').webcrypto;

let failures = 0;
const check = (cond, msg) => { console.log(`  ${cond ? '\u2713' : '\u2717'} ${msg}`); if (!cond) failures++; };

function el(extra = {}) {
  return Object.assign({
    innerHTML: '', value: '', textContent: '', dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    querySelectorAll: () => [], addEventListener() {}, appendChild() {}, focus() {}, reset() {},
  }, extra);
}

function load(file, globalName, sandboxExtras = {}) {
  const sandbox = Object.assign({
    crypto: webcrypto,
    console,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    URL, URLSearchParams, TextEncoder, TextDecoder,
    document: {
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      addEventListener() {}, createElement: () => el(), body: el(),
    },
    window: {},
  }, sandboxExtras);
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(__dirname, '..', 'www', file), 'utf8');
  vm.runInContext(src + `\n;globalThis.__mod = ${globalName};`, sandbox, { filename: file });
  return sandbox.__mod;
}

(async () => {
  /* ── auth.js: parser + import ── */
  let vaultSaved = [];
  const Auth = load('auth.js', 'AuthModule', {
    Vault: {
      isUnlocked: () => true,
      getAllTotp: async () => vaultSaved.slice(),
      saveTotp: async t => { vaultSaved.push(t); return 'generated-id'; },
      esc: s => String(s),
    },
  });

  console.log('auth.js otpauth:// parser:');
  check(typeof Auth.parseOtpauthUri === 'function', 'auth.js exports parseOtpauthUri');
  check(typeof Auth.importUri === 'function', 'auth.js exports importUri');
  check(typeof Auth.generateTOTP === 'function' && typeof Auth.base32ToBytes === 'function',
    'auth.js still exports generateTOTP + base32ToBytes');

  {
    const p = Auth.parseOtpauthUri('otpauth://totp/GitHub:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=8&algorithm=SHA1&period=30');
    check(p.account === 'alice@example.com', `issuer prefix stripped from account (got ${p.account})`);
    check(p.secret === 'JBSWY3DPEHPK3PXP', `secret parsed (got ${p.secret})`);
    check(p.digits === 8, `digits param honoured (got ${p.digits})`);
    check(p.issuer === 'GitHub', `issuer param returned (got ${p.issuer})`);
    check(p.algorithm === 'SHA1', `algorithm parsed (got ${p.algorithm})`);
    check(p.period === 30, `period parsed (got ${p.period})`);
  }
  {
    const p = Auth.parseOtpauthUri('otpauth://totp/My%20Service:alice%40example.com?secret=JBSWY3DPEHPK3PXP');
    check(p.account === 'alice@example.com', `URL-encoded label decoded (got ${p.account})`);
    check(p.issuer === 'My Service', `optional issuer prefix used when no issuer param (got ${p.issuer})`);
    check(p.digits === 6, `digits default to 6 (got ${p.digits})`);
    check(p.algorithm === 'SHA1', `algorithm defaults to SHA1 (got ${p.algorithm})`);
    check(p.period === 30, `period defaults to 30 (got ${p.period})`);
  }
  {
    const p = Auth.parseOtpauthUri('otpauth://totp/Work:me@example.com?secret=JBSWY3DPEHPK3PXP&digits=8&algorithm=sha256&period=60');
    check(p.algorithm === 'SHA256', `lowercase algorithm normalised (got ${p.algorithm})`);
    check(p.period === 60, `non-default period parsed (got ${p.period})`);
    check(p.digits === 8, `digits=8 preserved with non-default metadata (got ${p.digits})`);
  }
  {
    const p = Auth.parseOtpauthUri('otpauth://totp/Lowercase?secret=gezd%20gnbv%20gy3t%20qojq%20gezd%20gnbv%20gy3t%20qojq');
    check(p.secret === 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', `lowercase spaced base32 normalised (got ${p.secret})`);
    check(p.issuer === '', 'no issuer prefix/param yields empty issuer');
  }
  {
    let err = null;
    try { Auth.parseOtpauthUri('otpauth://hotp/Foo?secret=JBSWY3DPEHPK3PXP&counter=1'); } catch (e) { err = e; }
    check(!!err && /hotp/i.test(err.message), `HOTP rejected with clear error (got ${err ? err.message : 'no error'})`);
  }
  {
    let err = null;
    try { Auth.parseOtpauthUri('otpauth://totp/Foo?secret=N0T!VAL1D'); } catch (e) { err = e; }
    check(!!err, `invalid base32 rejected (got ${err ? err.message : 'no error'})`);
  }
  {
    let err = null;
    try { Auth.parseOtpauthUri('otpauth://totp/Foo?secret=MZXW6=='); } catch (e) { err = e; }
    check(!!err, `bad base32 padding rejected (got ${err ? err.message : 'no error'})`);
  }
  {
    let err = null;
    try { Auth.parseOtpauthUri('https://example.com/totp?secret=JBSWY3DPEHPK3PXP'); } catch (e) { err = e; }
    check(!!err, 'non-otpauth scheme rejected');
  }
  {
    let err = null;
    try { Auth.parseOtpauthUri('otpauth://totp/Foo?secret=JBSWY3DPEHPK3PXP&algorithm=MD5'); } catch (e) { err = e; }
    check(!!err && /algorithm/i.test(err.message), `unsupported algorithm rejected (got ${err ? err.message : 'no error'})`);
  }
  {
    let err = null;
    try { Auth.parseOtpauthUri('otpauth://totp/Foo?secret=JBSWY3DPEHPK3PXP&period=0'); } catch (e) { err = e; }
    check(!!err && /period/i.test(err.message), `out-of-range period rejected (got ${err ? err.message : 'no error'})`);
  }
  {
    let err = null;
    try { Auth.parseOtpauthUri('otpauth://totp/Foo?secret=JBSWY3DPEHPK3PXP&digits=7'); } catch (e) { err = e; }
    check(!!err && /digits/i.test(err.message), `unsupported digits rejected (got ${err ? err.message : 'no error'})`);
  }

  console.log('auth.js importUri:');
  {
    const n = await Auth.importUri('otpauth://totp/Import:new@example.com?secret=JBSWY3DPEHPK3PXP&digits=6');
    check(n === 1, `importUri returns saved count 1 (got ${n})`);
    check(vaultSaved.length === 1 && vaultSaved[0].account === 'new@example.com',
      'importUri persisted one TOTP with the parsed account');
    check(vaultSaved[0].algorithm === 'SHA1' && vaultSaved[0].period === 30 && vaultSaved[0].digits === 6,
      `importUri persists default algorithm/period/digits (got ${vaultSaved[0].algorithm}/${vaultSaved[0].period}/${vaultSaved[0].digits})`);
    let dup = false;
    // same account+secret but spaced/lowercase -> must still be seen as a duplicate
    try { await Auth.importUri('otpauth://totp/Import:new@example.com?secret=jbsw%20y3dp%20ehpk%203pxp'); } catch { dup = true; }
    check(dup && vaultSaved.length === 1, 'importUri rejects an existing account+secret pair');
  }
  {
    const n = await Auth.importUri('otpauth://totp/Import:sha@example.com?secret=JBSWY3DPEHPK3PXP&algorithm=SHA256&period=60');
    const last = vaultSaved[vaultSaved.length - 1];
    check(n === 1 && vaultSaved.length === 2, `importUri accepts a distinct account with non-default metadata (count=${n})`);
    check(last.account === 'sha@example.com' && last.algorithm === 'SHA256' && last.period === 60 && last.digits === 6,
      `importUri persists non-default algorithm/period (got ${last.algorithm}/${last.period}/${last.digits})`);
  }

  /* ── secrets.js: exports + sort behaviour ── */
  console.log('secrets.js sorting:');
  const secList = el(), secSearch = el({ value: '' });
  const Secrets = load('secrets.js', 'SecretsModule', {
    document: {
      getElementById: id => id === 'secretsList' ? secList : id === 'secretsSearch' ? secSearch : null,
      querySelectorAll: () => [], addEventListener() {}, createElement: () => el(), body: el(),
    },
    Vault: {
      isUnlocked: () => true,
      getAllSecrets: async () => [
        { id: '1', name: 'zed', value: 'v', category: 'api', ts: 300 },
        { id: '2', name: 'Alpha', value: 'v', category: 'login', ts: 200 },
        { id: '3', name: 'beta', value: 'v', category: 'api', ts: 100 },
      ],
      esc: s => String(s), relTime: () => 'today',
    },
  });
  check(typeof Secrets.setSort === 'function' && typeof Secrets.purge === 'function',
    'secrets.js exports setSort + purge');
  const secOrder = () => [...secList.innerHTML.matchAll(/secret-item-name">([^<]*)</g)].map(m => m[1]).join(',');
  await Secrets.refresh();
  check(secOrder() === 'zed,Alpha,beta', `recent = ts desc (got ${secOrder()})`);
  Secrets.setSort('name');
  check(secOrder() === 'Alpha,beta,zed', `name = case-insensitive A–Z (got ${secOrder()})`);
  Secrets.setSort('category');
  check(secOrder() === 'beta,zed,Alpha', `category then name (got ${secOrder()})`);
  Secrets.setSort('recent');
  check(secOrder() === 'zed,Alpha,beta', 'recent restored without re-decrypt');
  let sErr = false; try { Secrets.setSort('bogus'); } catch { sErr = true; }
  check(sErr, 'secrets setSort rejects an unknown mode');

  /* ── journal.js: exports + sort behaviour ── */
  console.log('journal.js sorting:');
  const jList = el(), jSearch = el({ value: '' });
  const Journal = load('journal.js', 'JournalModule', {
    document: {
      getElementById: id => id === 'journalList' ? jList : id === 'journalSearch' ? jSearch : null,
      querySelectorAll: () => [], addEventListener() {}, createElement: () => el(), body: el(),
    },
    Vault: {
      isUnlocked: () => true,
      getAllEntries: async () => [
        { id: '1', title: 'Zebra', body: '', category: 'personal', ts: 300 },
        { id: '2', title: 'apple', body: '', category: 'work', ts: 200 },
        { id: '3', title: 'Mango', body: '', category: 'personal', ts: 100 },
      ],
      esc: s => String(s), relTime: () => 'today',
    },
  });
  check(typeof Journal.setSort === 'function' && typeof Journal.purge === 'function',
    'journal.js exports setSort + purge');
  const jOrder = () => [...jList.innerHTML.matchAll(/journal-item-title">([^<]*)</g)].map(m => m[1]).join(',');
  await Journal.refresh();
  check(jOrder() === 'Zebra,apple,Mango', `recent = ts desc (got ${jOrder()})`);
  Journal.setSort('oldest');
  check(jOrder() === 'Mango,apple,Zebra', `oldest = ts asc (got ${jOrder()})`);
  Journal.setSort('title');
  check(jOrder() === 'apple,Mango,Zebra', `title = case-insensitive A–Z (got ${jOrder()})`);
  jSearch.value = 'an'; // 'Mango' only
  Journal.setSort('oldest'); // re-render applies the active search filter + sort
  check(jOrder() === 'Mango', `sort composes with search filter (got ${jOrder()})`);
  jSearch.value = '';
  Journal.setSort('recent');
  let jErr = false; try { Journal.setSort('bogus'); } catch { jErr = true; }
  check(jErr, 'journal setSort rejects an unknown mode');

  console.log('');
  if (failures) { console.log(`feature-extra test FAILED (${failures})`); process.exit(1); }
  console.log('feature-extra test passed.');
  process.exit(0);
})();
