/**
 * permissions.js v2.3
 * Calls native Java plugins for real Android permissions.
 * Falls back gracefully in PWA/browser mode.
 */
const Permissions = (() => {

  const DONE_KEY = 'ss_perms_done';

  // Get native plugins if available
  const Native = () => window.Capacitor?.Plugins || {};

  const PERMS = [
    {
      id: 'camera',
      icon: 'camera',
      title: 'Camera Access',
      color: '#7fffb2',
      why: 'ShieldSpace uses your camera for:',
      points: [
        '📸 Intruder Selfie — photos anyone who enters wrong PIN',
        '👁 Camera Watch — blurs screen if someone looks over',
      ],
      note: 'Photos stay on your device. Never uploaded.',
      request: async () => {
        const n = Native();
        if (n.ShieldPermissions) {
          const r = await n.ShieldPermissions.requestCamera();
          return r.granted;
        }
        // PWA fallback
        try {
          const s = await navigator.mediaDevices.getUserMedia({video:true});
          s.getTracks().forEach(t=>t.stop()); return true;
        } catch { return false; }
      }
    },
    {
      id: 'notifications',
      icon: 'bell',
      title: 'Notifications',
      color: '#ffc94a',
      why: 'Get alerted when:',
      points: [
        '🔔 An intruder photo is captured',
        '⚡ Panic mode is triggered remotely',
        '⏱ Your vault auto-locks',
      ],
      note: 'You can control which alerts fire in Settings.',
      request: async () => {
        const n = Native();
        if (n.ShieldPermissions) {
          const r = await n.ShieldPermissions.requestNotifications();
          return r.granted;
        }
        if ('Notification' in window) {
          const r = await Notification.requestPermission();
          return r === 'granted';
        }
        return false;
      }
    },
    {
      id: 'storage',
      icon: 'file',
      title: 'Storage Access',
      color: '#60a5fa',
      why: 'Needed to:',
      points: [
        '📁 Store encrypted files in your vault',
        '💾 Export and import vault backups',
      ],
      note: 'Files are encrypted before saving. Only you can read them.',
      request: async () => {
        const n = Native();
        if (n.ShieldPermissions) {
          const r = await n.ShieldPermissions.requestStorage();
          return r.granted;
        }
        return true;
      }
    },
    {
      id: 'overlay',
      icon: 'layers',
      title: 'Display Over Other Apps',
      color: '#38bdf8',
      why: 'The most powerful privacy feature:',
      points: [
        '🛡 Dims your screen on ANY app to block snooping',
        '📱 Toggle it instantly from your notification shade',
        '🔔 Auto-dims when notifications arrive (optional)',
      ],
      note: 'Android will open Settings — find ShieldSpace and tap Allow.',
      request: async () => {
        const n = Native();
        if (n.ShieldPermissions) {
          const r = await n.ShieldPermissions.requestOverlay();
          return r.granted;
        }
        return false;
      }
    },
    {
      id: 'biometric',
      icon: 'fingerprint',
      title: 'Fingerprint Unlock',
      color: '#f472b6',
      why: 'Unlock ShieldSpace without typing your PIN:',
      points: [
        '👆 Tap fingerprint sensor = instant unlock',
        '🔒 Your fingerprint never leaves your device',
        '🔑 PIN still works as backup',
      ],
      note: 'Uses Android\'s secure biometric system directly.',
      request: async () => {
        const n = Native();
        if (n.ShieldBiometric) {
          const r = await n.ShieldBiometric.isAvailable();
          return r.available;
        }
        return false;
      }
    },
  ];

  let currentIdx = 0;
  let results = {};
  let onDoneCallback = null;

  function isFirstRun() { return !localStorage.getItem(DONE_KEY); }
  function markDone()   { localStorage.setItem(DONE_KEY, '1'); }

  function start(onDone) {
    onDoneCallback = onDone;
    currentIdx = 0; results = {};
    _showScreen();
  }

  function _showScreen() {
    if (currentIdx >= PERMS.length) { _finish(); return; }
    const p = PERMS[currentIdx];
    document.getElementById('permScreen')?.remove();

    const el = document.createElement('div');
    el.id = 'permScreen';
    el.className = 'perm-screen';
    el.innerHTML = `
      <div class="perm-inner">
        <div class="perm-progress">
          ${PERMS.map((_,i)=>`<div class="perm-pip ${i<=currentIdx?'active':''}"></div>`).join('')}
        </div>
        <div class="perm-icon-wrap" style="--pcolor:${p.color}">
          <div class="perm-icon" data-icon="${p.icon}" data-size="36"></div>
        </div>
        <h2 class="perm-title">${p.title}</h2>
        <p class="perm-why">${p.why}</p>
        <ul class="perm-points">${p.points.map(pt=>`<li>${pt}</li>`).join('')}</ul>
        <p class="perm-note">${p.note}</p>
        <div class="perm-actions">
          <button class="perm-allow-btn" id="permAllow" style="--pcolor:${p.color}">Allow</button>
          <button class="perm-skip-btn"  id="permSkip">Skip for now</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    if (typeof Icons !== 'undefined') Icons.applyAll();
    requestAnimationFrame(() => el.classList.add('perm-visible'));

    document.getElementById('permAllow').addEventListener('click', async () => {
      const btn = document.getElementById('permAllow');
      btn.textContent = 'Requesting…'; btn.disabled = true;
      results[p.id] = await p.request();
      _next();
    });
    document.getElementById('permSkip').addEventListener('click', () => {
      results[p.id] = false; _next();
    });
  }

  function _next() {
    const el = document.getElementById('permScreen');
    if (el) { el.classList.remove('perm-visible'); setTimeout(()=>el.remove(), 300); }
    currentIdx++;
    setTimeout(_showScreen, 350);
  }

  function _finish() {
    markDone();
    document.getElementById('permScreen')?.remove();
    if (onDoneCallback) onDoneCallback(results);
  }

  // Re-request a specific permission (from settings)
  async function requestSingle(id) {
    const p = PERMS.find(x => x.id === id);
    if (!p) return false;
    return p.request();
  }

  return { isFirstRun, start, markDone, requestSingle };
})();
