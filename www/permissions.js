/**
 * permissions.js — One-by-one permission onboarding
 * Shows a beautiful explanation screen for each permission
 * before requesting it. Skips already-granted ones.
 */
const Permissions = (() => {

  const DONE_KEY = 'ss_perms_done';

  // Define permissions in order with explanations
  const PERMS = [
    {
      id: 'camera',
      icon: 'camera',
      title: 'Camera Access',
      why: 'ShieldSpace uses your front camera for two features:',
      points: [
        '📸 Intruder Selfie — photos wrong-PIN attempts automatically',
        '👁 Camera Watch — blurs your screen if someone else looks at it',
      ],
      note: 'No photos are ever uploaded. Everything stays on your device.',
      color: '#7fffb2',
      request: async () => {
        try {
          const s = await navigator.mediaDevices.getUserMedia({video: true});
          s.getTracks().forEach(t => t.stop());
          return true;
        } catch { return false; }
      }
    },
    {
      id: 'notifications',
      icon: 'bell',
      title: 'Notifications',
      why: 'Optional — ShieldSpace can alert you when:',
      points: [
        '🔔 An intruder photo is captured',
        '⚡ Panic mode is triggered',
        '⏱ Your vault auto-locks',
      ],
      note: 'You can turn individual alerts on or off in Settings.',
      color: '#ffc94a',
      request: async () => {
        if (!('Notification' in window)) return false;
        const r = await Notification.requestPermission();
        return r === 'granted';
      }
    },
    {
      id: 'motion',
      icon: 'shake',
      title: 'Motion Sensors',
      why: 'Needed for Shake-to-Lock:',
      points: [
        '📳 Shake your phone = instant lock, no buttons needed',
        '🔒 Useful when someone grabs your phone unexpectedly',
      ],
      note: 'Motion data is never stored or transmitted anywhere.',
      color: '#a78bfa',
      request: async () => {
        if (typeof DeviceMotionEvent === 'undefined') return false;
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
          try {
            const r = await DeviceMotionEvent.requestPermission();
            return r === 'granted';
          } catch { return false; }
        }
        return true; // Android grants automatically
      }
    },
    {
      id: 'overlay',
      icon: 'overlay',
      title: 'Draw Over Other Apps',
      why: 'The most powerful privacy feature:',
      points: [
        '🛡 Privacy blur works on ALL apps, not just ShieldSpace',
        '🔔 Dims your screen during notifications to block snooping',
        '📱 You choose: all apps, notifications only, or specific apps',
      ],
      note: 'Android will open its settings page for you to enable this.',
      color: '#38bdf8',
      request: async () => {
        // Capacitor/Android native handles this — we flag it for the native layer
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ShieldOverlay) {
          try {
            await window.Capacitor.Plugins.ShieldOverlay.requestOverlayPermission();
            return true;
          } catch { return false; }
        }
        // PWA fallback — note that true overlay needs native
        return 'partial';
      }
    },
    {
      id: 'biometric',
      icon: 'fingerprint',
      title: 'Fingerprint / Face ID',
      why: 'Unlock ShieldSpace without typing your PIN:',
      points: [
        '👆 Tap fingerprint sensor = instant unlock',
        '😊 Face unlock supported on compatible devices',
        '🔒 Biometrics never leave your device — Android handles everything',
      ],
      note: 'Your PIN still works as a fallback if biometrics fail.',
      color: '#f472b6',
      request: async () => {
        if (!window.PublicKeyCredential) return false;
        try {
          const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          return available;
        } catch { return false; }
      }
    },
  ];

  let currentIdx = 0;
  let results = {};
  let onDoneCallback = null;

  // ── Public ───────────────────────────────────────
  function isFirstRun() {
    return !localStorage.getItem(DONE_KEY);
  }

  function start(onDone) {
    onDoneCallback = onDone;
    currentIdx = 0;
    results = {};
    _showScreen();
  }

  function markDone() {
    localStorage.setItem(DONE_KEY, '1');
  }

  // ── UI ───────────────────────────────────────────
  function _showScreen() {
    if (currentIdx >= PERMS.length) {
      _finish();
      return;
    }
    const p = PERMS[currentIdx];
    const existing = document.getElementById('permScreen');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'permScreen';
    el.className = 'perm-screen';
    el.innerHTML = `
      <div class="perm-inner">
        <div class="perm-progress">
          ${PERMS.map((_,i) => `<div class="perm-pip ${i <= currentIdx ? 'active' : ''}"></div>`).join('')}
        </div>
        <div class="perm-icon-wrap" style="--pcolor:${p.color}">
          <div class="perm-icon" data-icon="${p.icon}" data-size="36"></div>
        </div>
        <h2 class="perm-title">${p.title}</h2>
        <p class="perm-why">${p.why}</p>
        <ul class="perm-points">
          ${p.points.map(pt => `<li>${pt}</li>`).join('')}
        </ul>
        <p class="perm-note">${p.note}</p>
        <div class="perm-actions">
          <button class="perm-allow-btn" id="permAllow" style="--pcolor:${p.color}">Allow</button>
          <button class="perm-skip-btn" id="permSkip">Skip for now</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    Icons.applyAll();

    document.getElementById('permAllow').addEventListener('click', async () => {
      const btn = document.getElementById('permAllow');
      btn.textContent = 'Requesting…';
      btn.disabled = true;
      const r = await p.request();
      results[p.id] = r;
      _next();
    });
    document.getElementById('permSkip').addEventListener('click', () => {
      results[p.id] = false;
      _next();
    });

    // Animate in
    requestAnimationFrame(() => el.classList.add('perm-visible'));
  }

  function _next() {
    const el = document.getElementById('permScreen');
    if (el) { el.classList.remove('perm-visible'); setTimeout(() => el.remove(), 300); }
    currentIdx++;
    setTimeout(_showScreen, 350);
  }

  function _finish() {
    markDone();
    const el = document.getElementById('permScreen');
    if (el) el.remove();
    if (onDoneCallback) onDoneCallback(results);
  }

  return { isFirstRun, start, markDone };
})();
