// ── State ──────────────────────────────────────────
const PIN_KEY='ss_pin', DECOY_KEY='ss_decoy', SETT_KEY='ss_settings';
let PIN        = localStorage.getItem(PIN_KEY) || '1234';
let DECOY_PIN  = localStorage.getItem(DECOY_KEY) || '';
let digits     = [];
let activeTab  = 'dashboard';
let failCount  = 0;
let lockoutEnd = 0;
let lockoutInterval = null;
let autoLockTimer = null;

let S = {blur:false, camera:false, shake:false, autoLock:true, selfDestruct:false, intruder:true};
try { S = {...S, ...JSON.parse(localStorage.getItem(SETT_KEY)||'{}')}; } catch{}

// Expose lock globally for shake.js
const App = { lock: _lockApp };

// ── Boot ───────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  _initLock();
  _initNav();
  _initVault();
  _initSettings();
  SecureBrowser.init();
  EncClipboard.init();
  _applySettings();
  _drawLockCanvas();
  _initIntruderLog();
  // Set stealth tab title
  document.title = 'Battery ⚡ 78%';
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) _lockApp();
});

// ── LOCK CANVAS (animated particles) ──────────────
function _drawLockCanvas() {
  const canvas = document.getElementById('lockCanvas');
  if (!canvas) return;
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const pts = Array.from({length:40}, () => ({
    x: Math.random()*canvas.width, y: Math.random()*canvas.height,
    vx: (Math.random()-0.5)*0.4, vy: (Math.random()-0.5)*0.4,
    r: Math.random()*2+1
  }));
  function frame() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pts.forEach(p => {
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0||p.x>canvas.width) p.vx*=-1;
      if(p.y<0||p.y>canvas.height) p.vy*=-1;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle='rgba(127,255,178,0.5)'; ctx.fill();
      pts.forEach(q => {
        const d=Math.hypot(p.x-q.x,p.y-q.y);
        if(d<100){ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.strokeStyle=`rgba(127,255,178,${0.12*(1-d/100)})`;ctx.lineWidth=0.5;ctx.stroke();}
      });
    });
    requestAnimationFrame(frame);
  }
  frame();
}

// ── PIN / LOCK ──────────────────────────────────────
function _initLock() {
  document.querySelectorAll('.num-key[data-digit]').forEach(b => b.addEventListener('click', () => _addDigit(b.dataset.digit)));
  document.getElementById('delBtn').addEventListener('click', _del);
  document.getElementById('decoyBtn').addEventListener('click', _triggerPanic);
  document.getElementById('intruderOk').addEventListener('click', () => document.getElementById('intruderAlert').classList.add('hidden'));
  document.getElementById('panicBtn').addEventListener('click', _triggerPanic);
  document.getElementById('panicQA').addEventListener('click', _triggerPanic);
  document.getElementById('biometricBtn').addEventListener('click', _biometricUnlock);

  // Decoy tap-to-exit
  let tapCount=0;
  document.getElementById('panicOverlay').addEventListener('click', (e) => {
    if(!e.target.classList.contains('calc-btn')){tapCount++;if(tapCount>=5){tapCount=0;_lockApp();}}
  });
}

function _addDigit(d) {
  if (_isLockedOut()) return;
  if (digits.length >= 4) return;
  digits.push(d); _renderDots();
  if (digits.length === 4) _checkPin();
}
function _del() { if(digits.length>0){digits.pop();_renderDots();document.getElementById('pinError').textContent='';} }
function _renderDots() {
  [0,1,2,3].forEach(i => { const el=document.getElementById('pd'+i); if(el) el.classList.toggle('filled',i<digits.length); });
}

async function _checkPin() {
  const entered = digits.join(''); digits=[]; _renderDots();
  if (DECOY_PIN && entered === DECOY_PIN) { _triggerPanic(); return; }
  if (entered === PIN) {
    failCount = 0;
    try { await Vault.unlock(entered); } catch{}
    _showApp();
  } else {
    failCount++;
    document.getElementById('lockAttemptInfo').textContent = `Attempt ${failCount}/5`;
    const errEl = document.getElementById('pinError');
    errEl.textContent = 'Wrong PIN';
    document.querySelector('.lock-content').classList.add('shake');
    setTimeout(() => { document.querySelector('.lock-content').classList.remove('shake'); errEl.textContent=''; }, 450);

    if (S.intruder && failCount === 3) CameraWatch.captureIntruder();
    if (S.selfDestruct && failCount >= 5) { _selfDestruct(); return; }
    if (failCount >= 3) _startLockout();
  }
}

function _startLockout() {
  lockoutEnd = Date.now() + 120000; // 2 minutes
  document.getElementById('numpad').style.opacity='0.3';
  document.getElementById('numpad').style.pointerEvents='none';
  const el = document.getElementById('lockoutTimer');
  el.classList.remove('hidden');
  lockoutInterval = setInterval(() => {
    const rem = Math.ceil((lockoutEnd - Date.now()) / 1000);
    if (rem <= 0) {
      clearInterval(lockoutInterval); lockoutEnd=0; failCount=0;
      document.getElementById('numpad').style.opacity='';
      document.getElementById('numpad').style.pointerEvents='';
      el.classList.add('hidden');
      document.getElementById('lockAttemptInfo').textContent='';
    } else {
      el.textContent = `Locked out — wait ${rem}s`;
    }
  }, 500);
}
function _isLockedOut() { return lockoutEnd > Date.now(); }

function _selfDestruct() {
  Vault.clearAll(); localStorage.clear();
  document.getElementById('pinError').textContent = '💥 VAULT WIPED';
  document.getElementById('lockAttemptInfo').textContent = 'All data destroyed';
  setTimeout(() => location.reload(), 2000);
}

function _showApp() {
  document.getElementById('lockScreen').classList.remove('active');
  document.getElementById('mainApp').classList.remove('hidden');
  document.getElementById('panicOverlay').classList.add('hidden');
  _resetAutoLock();
  _refreshVault();
  _refreshIntruderLog();
}
function _lockApp() {
  Vault.lock();
  document.getElementById('lockScreen').classList.add('active');
  document.getElementById('mainApp').classList.add('hidden');
  digits=[]; _renderDots();
  document.getElementById('pinError').textContent='';
  _clearAutoLock();
  if(PrivacyOverlay.isEnabled()) PrivacyOverlay.disable();
}

async function _biometricUnlock() {
  if (!window.PublicKeyCredential) { _toast('Biometrics not supported on this device','red'); return; }
  try {
    await navigator.credentials.get({publicKey:{challenge:new Uint8Array(32),rpId:location.hostname,userVerification:'required',timeout:30000}});
    try { await Vault.unlock(PIN); } catch{}
    _showApp();
  } catch(e) {
    _toast('Biometric failed — use PIN','red');
  }
}

// ── AUTO-LOCK ───────────────────────────────────────
function _resetAutoLock() { if(!S.autoLock)return; _clearAutoLock(); autoLockTimer=setTimeout(_lockApp,30000); }
function _clearAutoLock() { if(autoLockTimer){clearTimeout(autoLockTimer);autoLockTimer=null;} }
document.addEventListener('touchstart',()=>{if(!document.getElementById('lockScreen').classList.contains('active'))_resetAutoLock();},{passive:true});

// ── PANIC ───────────────────────────────────────────
function _triggerPanic() {
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('lockScreen').classList.remove('active');
  document.getElementById('panicOverlay').classList.remove('hidden');
  Vault.lock();
}

// ── NAV ─────────────────────────────────────────────
function _initNav() {
  document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click',()=>_switchTab(b.dataset.tab)));
  document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click',()=>_switchTab(b.dataset.goto)));
}
function _switchTab(tab) {
  if(tab===activeTab) return;
  if(activeTab==='browser') SecureBrowser.onLeave();
  activeTab=tab;
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  document.querySelectorAll('.tab-content').forEach(tc=>{tc.classList.toggle('hidden',tc.id!=='tab-'+tab);tc.classList.toggle('active',tc.id==='tab-'+tab);});
  if(tab==='vault') _refreshVault();
  if(tab==='intruders') _refreshIntruderLog();
}

// ── VAULT UI ────────────────────────────────────────
let editId=null;
function _initVault() {
  document.getElementById('addNoteBtn').addEventListener('click',()=>_openNote(null));
  document.getElementById('saveNoteBtn').addEventListener('click',_saveNote);
  document.getElementById('closeNoteBtn').addEventListener('click',_closeNote);
  document.getElementById('noteModal').querySelector('.modal-backdrop').addEventListener('click',_closeNote);
  document.getElementById('fileInput').addEventListener('change',_uploadFile);
  document.getElementById('fileUploadZone')?.addEventListener('click',()=>document.getElementById('fileInput').click());
  document.getElementById('exportVaultBtn').addEventListener('click',()=>Vault.exportBackup());
  document.getElementById('importInput').addEventListener('change',async e=>{
    const f=e.target.files[0]; if(!f) return;
    const n=await Vault.importBackup(f);
    _toast(`✓ Imported ${n} notes`,'green'); _refreshVault(); e.target.value='';
  });
  document.getElementById('vaultSearch').addEventListener('input',_refreshVault);
  document.querySelectorAll('.vault-tab').forEach(t=>t.addEventListener('click',()=>{
    document.querySelectorAll('.vault-tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
    const type=t.dataset.vtype;
    ['notes','files','import'].forEach(v=>document.getElementById(v+'View').classList.toggle('hidden',v!==type));
  }));
}
function _openNote(note) {
  editId=note?note.id:null;
  document.getElementById('noteTitle').value=note?note.title:'';
  document.getElementById('noteBody').value=note?note.body:'';
  document.getElementById('noteModal').classList.remove('hidden');
  document.getElementById('noteTitle').focus();
}
function _closeNote() { document.getElementById('noteModal').classList.add('hidden'); editId=null; }
async function _saveNote() {
  const title=document.getElementById('noteTitle').value.trim()||'Untitled';
  const body=document.getElementById('noteBody').value.trim();
  await Vault.saveNote({id:editId,title,body}); _closeNote(); _refreshVault();
}
async function _refreshVault() {
  if(!Vault.isUnlocked()) return;
  const q=(document.getElementById('vaultSearch').value||'').toLowerCase();
  const notes=await Vault.getAllNotes();
  const filtered=q?notes.filter(n=>n.title.toLowerCase().includes(q)||n.body.toLowerCase().includes(q)):notes;
  const nl=document.getElementById('notesList');
  nl.innerHTML=filtered.length===0
    ?`<div class="empty-state"><div class="empty-icon">📝</div><p>${q?'No notes match your search.':'No encrypted notes yet.<br/>Tap <strong>+ New</strong> to add one.'}</p></div>`
    :filtered.map(n=>`<div class="note-card" data-id="${n.id}"><div class="note-card-title">${_esc(n.title)}</div><div class="note-card-preview">${_esc(n.body)}</div><div class="note-card-meta">🔒 Encrypted · ${_rel(n.ts)}</div></div>`).join('');
  nl.querySelectorAll('.note-card').forEach(c=>{
    c.addEventListener('click',()=>{
      const note=filtered.find(n=>n.id===c.dataset.id);
      if(!note) return;
      if(confirm(`"${note.title}"\n\nOK = Edit | Cancel = Delete`)) _openNote(note);
      else if(confirm('Delete permanently?')) Vault.deleteNote(note.id).then(_refreshVault);
    });
  });
  const files=await Vault.getAllFiles();
  const fl=document.getElementById('filesList');
  fl.innerHTML=files.length===0
    ?`<div class="empty-state"><div class="empty-icon">🔒</div><p>No encrypted files yet.</p></div>`
    :files.map(f=>`<div class="file-card" data-id="${f.id}"><span class="file-icon">${_fIcon(f.type)}</span><div class="file-info"><div class="file-name">${_esc(f.name)}</div><div class="file-size">${Vault.formatSize(f.size)} · ${_rel(f.ts)}</div></div><button class="file-del" data-id="${f.id}">🗑</button></div>`).join('');
  fl.querySelectorAll('.file-card').forEach(c=>{
    c.addEventListener('click',async e=>{
      if(e.target.classList.contains('file-del')){await Vault.deleteFile(e.target.dataset.id);_refreshVault();}
      else await Vault.downloadFile(c.dataset.id);
    });
  });
}
async function _uploadFile(e) {
  for(const f of Array.from(e.target.files||[])) await Vault.saveFile(f);
  e.target.value=''; _refreshVault();
}

// ── INTRUDER LOG ────────────────────────────────────
function _initIntruderLog() {
  document.getElementById('clearIntrudersBtn').addEventListener('click',()=>{
    if(confirm('Delete all intruder photos?')){CameraWatch.clearIntruders();_refreshIntruderLog();}
  });
}
function _refreshIntruderLog() {
  const intruders=CameraWatch.getIntruders();
  const cnt=document.getElementById('intruderCount');
  if(cnt) cnt.textContent=intruders.length?`${intruders.length} captured`:'Intruder log';
  const grid=document.getElementById('intruderGrid');
  if(!grid) return;
  if(intruders.length===0){
    grid.innerHTML=`<div class="empty-state" style="grid-column:span 2"><div class="empty-icon">🕵️</div><p>No intruders captured yet.<br/>Wrong PIN attempts trigger a photo.</p></div>`;
    return;
  }
  grid.innerHTML=intruders.slice().reverse().map((i,idx)=>`
    <div class="intruder-card">
      <img src="${i.img}" alt="Intruder ${idx+1}"/>
      <div class="intruder-meta">⚠️ ${new Date(i.ts).toLocaleString()}</div>
      <button class="intruder-del" data-ts="${i.ts}">✕</button>
    </div>`).join('');
  grid.querySelectorAll('.intruder-del').forEach(b=>{
    b.addEventListener('click',()=>{
      const ts=parseInt(b.dataset.ts);
      const arr=CameraWatch.getIntruders().filter(x=>x.ts!==ts);
      localStorage.setItem('ss_intruders',JSON.stringify(arr));
      _refreshIntruderLog();
    });
  });
}

// ── SETTINGS ────────────────────────────────────────
function _initSettings() {
  // Sync all toggles
  _syncToggle('blurToggle',  S.blur,   v=>{S.blur=v;   v?PrivacyOverlay.enable():PrivacyOverlay.disable(); document.getElementById('blurToggle2').checked=v; document.getElementById('blurToggleBtn').classList.toggle('active',v);});
  _syncToggle('blurToggle2', S.blur,   v=>{S.blur=v;   v?PrivacyOverlay.enable():PrivacyOverlay.disable(); document.getElementById('blurToggle').checked=v; document.getElementById('blurToggleBtn').classList.toggle('active',v);});
  _syncToggle('shakeToggle', S.shake,  v=>{S.shake=v;  v?ShakeLock.enable():ShakeLock.disable(); document.getElementById('shakeToggle2').checked=v;});
  _syncToggle('shakeToggle2',S.shake,  v=>{S.shake=v;  v?ShakeLock.enable():ShakeLock.disable(); document.getElementById('shakeToggle').checked=v;});
  _syncToggle('cameraToggle',S.camera, async v=>{if(v){const ok=await CameraWatch.enable();if(!ok){document.getElementById('cameraToggle').checked=false;return;}}else CameraWatch.disable();S.camera=v;document.getElementById('cameraToggle2').checked=v;_saveSett();});
  _syncToggle('cameraToggle2',S.camera,async v=>{if(v){const ok=await CameraWatch.enable();if(!ok){document.getElementById('cameraToggle2').checked=false;return;}}else CameraWatch.disable();S.camera=v;document.getElementById('cameraToggle').checked=v;_saveSett();});
  _syncToggle('autoLockToggle',S.autoLock,v=>{S.autoLock=v;if(!v)_clearAutoLock();else _resetAutoLock();_saveSett();});
  _syncToggle('selfDestructToggle',S.selfDestruct,v=>{S.selfDestruct=v;_saveSett();});
  _syncToggle('intruderToggle',S.intruder,v=>{S.intruder=v;_saveSett();});

  document.getElementById('blurToggleBtn').addEventListener('click',()=>{const t=document.getElementById('blurToggle');t.checked=!t.checked;t.dispatchEvent(new Event('change'));});
  document.getElementById('changePinBtn').addEventListener('click',_changePin);
  document.getElementById('setupDecoyBtn').addEventListener('click',_setupDecoy);
  document.getElementById('clearVaultBtn').addEventListener('click',()=>{if(confirm('Delete ALL vault data permanently?')){Vault.clearAll();_refreshVault();_toast('🗑 Vault cleared','red');}});
  document.getElementById('resetAppBtn').addEventListener('click',()=>{if(confirm('FACTORY RESET — wipes everything?')){localStorage.clear();location.reload();}});
  document.getElementById('exportSettingsBtn').addEventListener('click',()=>Vault.exportBackup());
}
function _syncToggle(id, val, onChange) {
  const el=document.getElementById(id); if(!el) return;
  el.checked=val;
  el.addEventListener('change',()=>{onChange(el.checked);_saveSett();});
}
function _applySettings() {
  if(S.blur)   PrivacyOverlay.enable();
  if(S.camera) CameraWatch.enable();
  if(S.shake)  ShakeLock.enable();
}
function _saveSett() { localStorage.setItem(SETT_KEY,JSON.stringify(S)); }

function _changePin() {
  const n=prompt('New 4-digit PIN:'); if(!n) return;
  if(!/^\d{4}$/.test(n)){alert('Must be 4 digits');return;}
  PIN=n; localStorage.setItem(PIN_KEY,n); _toast('✓ PIN updated','green');
}
function _setupDecoy() {
  const d=prompt('Decoy PIN (leave blank to disable):'); if(d===null) return;
  if(d===''){DECOY_PIN='';localStorage.removeItem(DECOY_KEY);_toast('Decoy disabled');return;}
  if(!/^\d{4}$/.test(d)){alert('Must be 4 digits');return;}
  DECOY_PIN=d; localStorage.setItem(DECOY_KEY,d); _toast('🎭 Decoy PIN set','green');
}

// ── HELPERS ──────────────────────────────────────────
function _toast(msg,type) {
  const t=document.createElement('div'); t.className='toast '+(type||'');
  t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2500);
}
function _esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function _rel(ts){const d=Date.now()-ts;return d<60000?'just now':d<3600000?Math.floor(d/60000)+'m ago':d<86400000?Math.floor(d/3600000)+'h ago':Math.floor(d/86400000)+'d ago';}
function _fIcon(t=''){return t.startsWith('image/')?'🖼':t.startsWith('video/')?'🎬':t.startsWith('audio/')?'🎵':t.includes('pdf')?'📄':'📁';}
