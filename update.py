#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════╗
║  ShieldSpace v2.1 — Targeted Update                 ║
║  Run inside ~/ShieldSpace: python3 update.py        ║
╚══════════════════════════════════════════════════════╝
Touches only 7 files:
  1. www/icons.js          (new) — professional SVG icon system
  2. www/permissions.js    (new) — one-by-one permission onboarding
  3. www/overlay-manager.js(new) — system overlay + per-app control
  4. www/overlay.js        (update) — 60s inactivity timer
  5. www/styles.css        (append) — permission + overlay manager styles
  6. www/index.html        (update) — wire new screens + icon references
  7. android/app/src/main/AndroidManifest.xml (update) — full permissions
"""
import os, re

def write(path, content):
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content.lstrip('\n'))
    print(f"  \033[92m✓\033[0m  {path}")

def append(path, content):
    with open(path, 'a', encoding='utf-8') as f:
        f.write(content)
    print(f"  \033[94m+\033[0m  {path} (appended)")

print('\n\033[92m🛡  ShieldSpace v2.1 — applying targeted updates...\033[0m\n')

# ══════════════════════════════════════════════════════
# 1. icons.js — full professional SVG icon library
# ══════════════════════════════════════════════════════
write('www/icons.js', r"""
/**
 * icons.js — ShieldSpace professional SVG icon system
 * All icons: 24×24, stroke-based, currentColor, 1.6 stroke-width
 * Usage: Icons.get('shield') or Icons.shield
 */
const Icons = (() => {
  const S = (d, extra='') =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

  const lib = {
    // Navigation
    home:        S(`<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`),
    vault:       S(`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 118 0v4"/><circle cx="12" cy="16" r="1.5" fill="currentColor" stroke="none"/>`),
    browser:     S(`<circle cx="12" cy="12" r="9"/><path d="M12 3c-2.5 3-4 5.5-4 9s1.5 6 4 9M12 3c2.5 3 4 5.5 4 9s-1.5 6-4 9M3 12h18"/>`),
    intel:       S(`<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>`),
    settings:    S(`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>`),

    // Security
    shield:      S(`<path d="M12 2L4 5v7c0 5.25 3.6 10.15 8 11.5C16.4 22.15 20 17.25 20 12V5l-8-3z"/>`),
    shieldCheck: S(`<path d="M12 2L4 5v7c0 5.25 3.6 10.15 8 11.5C16.4 22.15 20 17.25 20 12V5l-8-3z"/><path d="M9 12l2 2 4-4"/>`),
    lock:        S(`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 118 0v4"/>`),
    unlock:      S(`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018-3.87"/>`),
    key:         S(`<circle cx="7.5" cy="15.5" r="3.5"/><path d="M10.5 15.5H21V12h-2v3.5M17 12V9"/>`),
    fingerprint: S(`<path d="M12 10a2 2 0 00-2 2v1a2 2 0 004 0v-1a2 2 0 00-2-2z"/><path d="M12 7a5 5 0 015 5v1a5 5 0 01-10 0v-1a5 5 0 015-5z"/><path d="M12 4a8 8 0 018 8v1a8 8 0 01-16 0v-1a8 8 0 018-8z"/>`),
    eye:         S(`<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>`),
    eyeOff:      S(`<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`),
    camera:      S(`<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>`),
    panic:       S(`<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`, `stroke-width="1.4"`),
    skull:       S(`<circle cx="12" cy="10" r="7"/><path d="M9 21h6M10 17v4M14 17v4M9 13h.01M15 13h.01"/>`),
    alert:       S(`<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`),

    // Features
    blur:        S(`<circle cx="12" cy="12" r="2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>`),
    shake:       S(`<path d="M4 14.5V9a2 2 0 012-2h12a2 2 0 012 2v5.5"/><path d="M4 14.5c0 2.5 1.5 4.5 4 5.5h8c2.5-1 4-3 4-5.5"/><line x1="9" y1="7" x2="9" y2="2"/><line x1="15" y1="7" x2="15" y2="2"/>`),
    overlay:     S(`<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" fill-opacity="0.15" stroke-dasharray="2 2"/><path d="M7 7l10 10M17 7L7 17"/>`),
    layers:      S(`<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>`),
    apps:        S(`<rect x="2" y="2" width="9" height="9" rx="1"/><rect x="13" y="2" width="9" height="9" rx="1"/><rect x="2" y="13" width="9" height="9" rx="1"/><rect x="13" y="13" width="9" height="9" rx="1"/>`),
    notification:S(`<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>`),
    bell:        S(`<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>`),
    bellOff:     S(`<line x1="1" y1="1" x2="23" y2="23"/><path d="M17 17H3s3-2 3-9a6 6 0 01.34-2M13.73 21a2 2 0 01-3.46 0M21 21c-.01-2.5-1-4.5-3-7"/><path d="M8.53 3.43A6 6 0 0118 8c0 2.17-.35 3.99-1 5.5"/>`),

    // Actions
    plus:        S(`<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`),
    trash:       S(`<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>`),
    download:    S(`<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>`),
    upload:      S(`<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>`),
    search:      S(`<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`),
    close:       S(`<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`),
    check:       S(`<polyline points="20 6 9 17 4 12"/>`),
    chevronRight:S(`<polyline points="9 18 15 12 9 6"/>`),
    back:        S(`<polyline points="15 18 9 12 15 6"/>`),
    copy:        S(`<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>`),
    save:        S(`<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13"/><polyline points="7 3 7 8 15 8"/>`),
    export:      S(`<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>`),

    // Files
    file:        S(`<path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>`),
    fileText:    S(`<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>`),
    image:       S(`<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>`),
    video:       S(`<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>`),
    music:       S(`<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>`),

    // Status
    wifi:        S(`<path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><line x1="12" y1="20" x2="12.01" y2="20" stroke-width="3"/>`),
    timer:       S(`<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/>`),
    info:        S(`<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16" stroke-width="2.5"/>`),
    zap:         S(`<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`, `stroke-width="1.4"`),
  };

  // Render icon into an element by name
  function get(name, size=20, cls='') {
    const svg = lib[name];
    if (!svg) return '';
    return svg.replace('<svg ', `<svg width="${size}" height="${size}" class="${cls}" `);
  }

  // Inject icons into all elements with data-icon attribute
  function applyAll() {
    document.querySelectorAll('[data-icon]').forEach(el => {
      const name = el.dataset.icon;
      const size = el.dataset.size || 20;
      el.innerHTML = get(name, size);
    });
  }

  return { get, applyAll, ...lib };
})();
""")

# ══════════════════════════════════════════════════════
# 2. permissions.js — one-by-one permission onboarding
# ══════════════════════════════════════════════════════
write('www/permissions.js', r"""
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
""")

# ══════════════════════════════════════════════════════
# 3. overlay-manager.js — system overlay + per-app control
# ══════════════════════════════════════════════════════
write('www/overlay-manager.js', r"""
/**
 * overlay-manager.js
 * Controls the system-level privacy overlay:
 *   - All apps
 *   - Notifications only
 *   - Specific apps (user-defined list)
 *
 * In PWA mode: manages in-app overlay + posts to service worker
 * In APK mode: communicates with native Capacitor plugin
 */
const OverlayManager = (() => {

  const KEY = 'ss_overlay_config';

  const MODES = {
    OFF:           'off',
    ALL_APPS:      'all',
    NOTIFICATIONS: 'notifications',
    CUSTOM:        'custom',
  };

  // Popular apps with icons for quick-pick
  const COMMON_APPS = [
    { id: 'com.whatsapp',              name: 'WhatsApp',    icon: '💬' },
    { id: 'com.instagram.android',     name: 'Instagram',   icon: '📷' },
    { id: 'com.facebook.katana',       name: 'Facebook',    icon: '👤' },
    { id: 'com.twitter.android',       name: 'Twitter/X',   icon: '🐦' },
    { id: 'com.google.android.gm',     name: 'Gmail',       icon: '📧' },
    { id: 'com.snapchat.android',      name: 'Snapchat',    icon: '👻' },
    { id: 'com.telegram.messenger',    name: 'Telegram',    icon: '✈️' },
    { id: 'com.google.android.apps.messaging', name: 'Messages', icon: '💬' },
    { id: 'com.tiktok.android',        name: 'TikTok',      icon: '🎵' },
    { id: 'com.linkedin.android',      name: 'LinkedIn',    icon: '💼' },
  ];

  let config = {
    mode: MODES.OFF,
    customApps: [],        // array of app IDs for custom mode
    blurStrength: 'medium', // light / medium / heavy
    dimAmount: 0.7,
  };

  // Load saved config
  try { config = { ...config, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch {}

  function getConfig() { return { ...config }; }
  function getMode() { return config.mode; }
  function getModes() { return MODES; }
  function getCommonApps() { return COMMON_APPS; }

  function setMode(mode) {
    config.mode = mode;
    _save();
    _applyNative();
    _updateUI();
  }

  function toggleCustomApp(appId) {
    const idx = config.customApps.indexOf(appId);
    if (idx === -1) config.customApps.push(appId);
    else config.customApps.splice(idx, 1);
    _save();
    _applyNative();
  }

  function isCustomAppEnabled(appId) {
    return config.customApps.includes(appId);
  }

  function setBlurStrength(s) {
    config.blurStrength = s;
    _save();
    _applyNative();
  }

  // ── Native bridge ─────────────────────────────────
  function _applyNative() {
    // Capacitor plugin bridge
    if (window.Capacitor?.Plugins?.ShieldOverlay) {
      window.Capacitor.Plugins.ShieldOverlay.configure({
        mode: config.mode,
        customApps: config.customApps,
        blurStrength: config.blurStrength,
        dimAmount: config.dimAmount,
      }).catch(() => {});
    }
    // Service worker message for PWA
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'OVERLAY_CONFIG', config
      });
    }
  }

  function _save() {
    localStorage.setItem(KEY, JSON.stringify(config));
  }

  function _updateUI() {
    // Sync status bar
    const dot = document.getElementById('overlayDot');
    const txt = document.getElementById('overlayTxt');
    if (dot) dot.className = 'status-dot ' + (config.mode !== MODES.OFF ? 'on' : 'off');
    if (txt) txt.textContent = {
      [MODES.OFF]: 'off',
      [MODES.ALL_APPS]: 'all apps',
      [MODES.NOTIFICATIONS]: 'notifs',
      [MODES.CUSTOM]: 'custom',
    }[config.mode] || 'off';
  }

  // ── Overlay Manager UI ────────────────────────────
  function openUI() {
    const existing = document.getElementById('overlayManagerModal');
    if (existing) { existing.remove(); return; }

    const el = document.createElement('div');
    el.id = 'overlayManagerModal';
    el.className = 'om-modal';
    el.innerHTML = `
      <div class="om-backdrop"></div>
      <div class="om-sheet">
        <div class="om-handle"></div>
        <div class="om-header">
          <div class="om-header-icon" data-icon="layers" data-size="20"></div>
          <h3>Privacy Overlay</h3>
          <button class="om-close" id="omClose" data-icon="close" data-size="18"></button>
        </div>

        <p class="om-desc">Choose which apps ShieldSpace protects with its privacy blur overlay.</p>

        <div class="om-modes">
          <button class="om-mode-btn ${config.mode===MODES.OFF?'active':''}" data-mode="${MODES.OFF}">
            <div class="om-mode-icon" data-icon="eyeOff" data-size="22"></div>
            <div class="om-mode-text"><strong>Off</strong><span>No system overlay</span></div>
            <div class="om-mode-check" data-icon="check" data-size="16"></div>
          </button>
          <button class="om-mode-btn ${config.mode===MODES.ALL_APPS?'active':''}" data-mode="${MODES.ALL_APPS}">
            <div class="om-mode-icon" data-icon="apps" data-size="22"></div>
            <div class="om-mode-text"><strong>All Apps</strong><span>Overlay on every app</span></div>
            <div class="om-mode-check" data-icon="check" data-size="16"></div>
          </button>
          <button class="om-mode-btn ${config.mode===MODES.NOTIFICATIONS?'active':''}" data-mode="${MODES.NOTIFICATIONS}">
            <div class="om-mode-icon" data-icon="bell" data-size="22"></div>
            <div class="om-mode-text"><strong>Notifications Only</strong><span>Blur when notifications appear</span></div>
            <div class="om-mode-check" data-icon="check" data-size="16"></div>
          </button>
          <button class="om-mode-btn ${config.mode===MODES.CUSTOM?'active':''}" data-mode="${MODES.CUSTOM}">
            <div class="om-mode-icon" data-icon="settings" data-size="22"></div>
            <div class="om-mode-text"><strong>Custom</strong><span>Choose specific apps</span></div>
            <div class="om-mode-check" data-icon="check" data-size="16"></div>
          </button>
        </div>

        <div class="om-custom-apps ${config.mode===MODES.CUSTOM?'':'hidden'}" id="omCustomApps">
          <p class="om-custom-label">Select apps to protect:</p>
          <div class="om-app-grid">
            ${COMMON_APPS.map(app => `
              <button class="om-app-btn ${config.customApps.includes(app.id)?'active':''}" data-appid="${app.id}">
                <span class="om-app-icon">${app.icon}</span>
                <span class="om-app-name">${app.name}</span>
                <span class="om-app-check" data-icon="check" data-size="12"></span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="om-strength">
          <p class="om-custom-label">Blur strength:</p>
          <div class="om-strength-row">
            ${['light','medium','heavy'].map(s => `
              <button class="om-str-btn ${config.blurStrength===s?'active':''}" data-str="${s}">${s}</button>
            `).join('')}
          </div>
        </div>

        <div class="om-native-note">
          <div data-icon="info" data-size="14"></div>
          <p>System overlay requires the <strong>Draw Over Other Apps</strong> permission. Android will ask you to enable it in Settings if not already granted.</p>
        </div>
      </div>
    `;

    document.body.appendChild(el);
    Icons.applyAll();
    requestAnimationFrame(() => el.classList.add('om-visible'));

    // Mode buttons
    el.querySelectorAll('.om-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        setMode(mode);
        el.querySelectorAll('.om-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
        document.getElementById('omCustomApps').classList.toggle('hidden', mode !== MODES.CUSTOM);
      });
    });

    // App toggle buttons
    el.querySelectorAll('.om-app-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        toggleCustomApp(btn.dataset.appid);
        btn.classList.toggle('active', isCustomAppEnabled(btn.dataset.appid));
      });
    });

    // Strength buttons
    el.querySelectorAll('.om-str-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setBlurStrength(btn.dataset.str);
        el.querySelectorAll('.om-str-btn').forEach(b => b.classList.toggle('active', b.dataset.str === btn.dataset.str));
      });
    });

    // Close
    document.getElementById('omClose').addEventListener('click', closeUI);
    el.querySelector('.om-backdrop').addEventListener('click', closeUI);
  }

  function closeUI() {
    const el = document.getElementById('overlayManagerModal');
    if (!el) return;
    el.classList.remove('om-visible');
    setTimeout(() => el.remove(), 300);
  }

  // Init — apply saved config on load
  function init() { _updateUI(); }

  return { init, openUI, closeUI, getMode, getConfig, setMode, getModes, toggleCustomApp, isCustomAppEnabled, getCommonApps };
})();
""")

# ══════════════════════════════════════════════════════
# 4. overlay.js — update inactivity to 60s
# ══════════════════════════════════════════════════════
write('www/overlay.js', r"""
/**
 * overlay.js — In-app privacy blur (vignette/edge dim)
 * Default inactivity: 60 seconds (configurable in Settings)
 */
const PrivacyOverlay = (() => {
  let enabled = false, active = false, timer = null;
  let delayMs = parseInt(localStorage.getItem('ss_blur_delay') || '60000');
  const el = document.getElementById('privacyOverlay');

  function enable()  { enabled=true; el.classList.remove('hidden'); _reset(); _bind(); _sync(); }
  function disable() { enabled=false; _clear(); _unbind(); active=false; el.classList.remove('active'); el.classList.add('hidden'); _sync(); }
  function toggle()  { enabled ? disable() : enable(); return enabled; }
  function isEnabled(){ return enabled; }

  function setDelay(ms) {
    delayMs = ms;
    localStorage.setItem('ss_blur_delay', ms);
    if (enabled) _reset();
  }
  function getDelay() { return delayMs; }

  function _activate()   { if(active)return; active=true;  el.classList.add('active'); }
  function _deactivate() { active=false; el.classList.remove('active'); }
  function _reset() { _clear(); if(enabled) timer=setTimeout(_activate, delayMs); }
  function _clear() { if(timer){clearTimeout(timer);timer=null;} }
  function _onAct() { if(!enabled)return; _deactivate(); _reset(); }

  const EVS = ['touchstart','click','keydown','mousemove','scroll'];
  function _bind()   { EVS.forEach(e=>document.addEventListener(e,_onAct,{passive:true})); document.addEventListener('visibilitychange',_onVis); }
  function _unbind() { EVS.forEach(e=>document.removeEventListener(e,_onAct)); document.removeEventListener('visibilitychange',_onVis); }
  function _onVis()  { document.hidden&&enabled ? _activate() : _onAct(); }

  function _sync() {
    const dot=document.getElementById('blurDot'), txt=document.getElementById('blurTxt');
    if(dot) dot.className='status-dot '+(enabled?'on':'off');
    if(txt) txt.textContent=enabled?'on':'off';
  }

  return { enable, disable, toggle, isEnabled, setDelay, getDelay };
})();
""")

# ══════════════════════════════════════════════════════
# 5. styles-update.css — append new styles
# ══════════════════════════════════════════════════════
append('www/styles.css', r"""

/* ═══════════════════════════════════════════════════
   v2.1 ADDITIONS
═══════════════════════════════════════════════════ */

/* ── PERMISSION ONBOARDING ─────────────────────── */
.perm-screen {
  position: fixed; inset: 0; z-index: 2000;
  background: var(--bg);
  display: flex; align-items: center; justify-content: center;
  padding: 2rem 1.5rem;
  opacity: 0; transform: translateY(20px);
  transition: opacity 0.3s ease, transform 0.3s ease;
  pointer-events: none;
}
.perm-screen.perm-visible { opacity: 1; transform: translateY(0); pointer-events: all; }
.perm-inner {
  width: 100%; max-width: 340px;
  display: flex; flex-direction: column; gap: 1rem;
}
.perm-progress { display: flex; gap: 6px; justify-content: center; margin-bottom: 0.5rem; }
.perm-pip { width: 28px; height: 3px; border-radius: 2px; background: var(--border2); transition: background 0.3s; }
.perm-pip.active { background: var(--accent); }
.perm-icon-wrap {
  width: 72px; height: 72px; border-radius: 20px;
  background: color-mix(in srgb, var(--pcolor) 12%, transparent);
  border: 1.5px solid color-mix(in srgb, var(--pcolor) 35%, transparent);
  display: flex; align-items: center; justify-content: center;
  color: var(--pcolor); align-self: center;
  box-shadow: 0 0 30px color-mix(in srgb, var(--pcolor) 15%, transparent);
}
.perm-icon svg { width: 36px; height: 36px; }
.perm-title { font-size: 1.5rem; font-weight: 800; text-align: center; }
.perm-why { font-size: 0.82rem; color: var(--text2); text-align: center; }
.perm-points { list-style: none; display: flex; flex-direction: column; gap: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); padding: 1rem; }
.perm-points li { font-size: 0.82rem; color: var(--text); line-height: 1.5; }
.perm-note { font-family: var(--mono); font-size: 0.68rem; color: var(--text3); text-align: center; line-height: 1.5; }
.perm-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 0.5rem; }
.perm-allow-btn {
  background: color-mix(in srgb, var(--pcolor) 15%, transparent);
  border: 1.5px solid color-mix(in srgb, var(--pcolor) 40%, transparent);
  border-radius: var(--r); color: var(--pcolor);
  font-family: var(--font); font-size: 1rem; font-weight: 700;
  padding: 0.9rem; cursor: pointer; transition: all 0.2s;
}
.perm-allow-btn:active { opacity: 0.8; }
.perm-skip-btn {
  background: none; border: none; color: var(--text3);
  font-family: var(--mono); font-size: 0.75rem; cursor: pointer; padding: 0.4rem;
}

/* ── OVERLAY MANAGER MODAL ─────────────────────── */
.om-modal {
  position: fixed; inset: 0; z-index: 200;
  display: flex; align-items: flex-end;
  opacity: 0; pointer-events: none;
  transition: opacity 0.3s ease;
}
.om-modal.om-visible { opacity: 1; pointer-events: all; }
.om-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); }
.om-sheet {
  position: relative; z-index: 1; width: 100%;
  background: var(--bg3); border-top: 1px solid var(--border2);
  border-radius: 22px 22px 0 0; padding: 0.75rem 1.2rem 2rem;
  max-height: 90vh; overflow-y: auto;
  transform: translateY(30px);
  transition: transform 0.3s ease;
}
.om-modal.om-visible .om-sheet { transform: translateY(0); }
.om-handle { width: 36px; height: 4px; background: var(--border2); border-radius: 2px; margin: 0 auto 1rem; }
.om-header { display: flex; align-items: center; gap: 10px; margin-bottom: 0.5rem; }
.om-header-icon { color: var(--accent); }
.om-header h3 { flex: 1; font-size: 1.1rem; font-weight: 700; }
.om-close { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; color: var(--text2); width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.om-desc { font-size: 0.8rem; color: var(--text2); line-height: 1.5; margin-bottom: 1rem; }

.om-modes { display: flex; flex-direction: column; gap: 7px; margin-bottom: 1rem; }
.om-mode-btn {
  display: flex; align-items: center; gap: 12px;
  background: var(--surface); border: 1.5px solid var(--border);
  border-radius: var(--r); padding: 0.85rem 1rem;
  cursor: pointer; text-align: left; transition: all 0.2s;
  color: var(--text);
}
.om-mode-btn.active { border-color: var(--accent); background: var(--accent-dim); }
.om-mode-icon { color: var(--text2); flex-shrink: 0; }
.om-mode-btn.active .om-mode-icon { color: var(--accent); }
.om-mode-text { flex: 1; }
.om-mode-text strong { display: block; font-size: 0.88rem; font-weight: 600; }
.om-mode-text span { font-size: 0.72rem; color: var(--text3); }
.om-mode-check { color: var(--accent); opacity: 0; transition: opacity 0.2s; }
.om-mode-btn.active .om-mode-check { opacity: 1; }

.om-custom-apps { margin-bottom: 1rem; }
.om-custom-apps.hidden { display: none; }
.om-custom-label { font-family: var(--mono); font-size: 0.65rem; color: var(--text3); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.6rem; }
.om-app-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 7px; }
.om-app-btn {
  display: flex; align-items: center; gap: 8px;
  background: var(--surface); border: 1.5px solid var(--border);
  border-radius: var(--rs); padding: 0.65rem 0.8rem;
  cursor: pointer; transition: all 0.2s; color: var(--text);
}
.om-app-btn.active { border-color: var(--accent); background: var(--accent-dim); }
.om-app-icon { font-size: 1.1rem; }
.om-app-name { flex: 1; font-size: 0.78rem; font-weight: 600; text-align: left; }
.om-app-check { color: var(--accent); opacity: 0; }
.om-app-btn.active .om-app-check { opacity: 1; }

.om-strength { margin-bottom: 1rem; }
.om-strength-row { display: flex; gap: 7px; }
.om-str-btn {
  flex: 1; background: var(--surface); border: 1.5px solid var(--border);
  border-radius: var(--rs); color: var(--text2);
  font-family: var(--font); font-size: 0.8rem; font-weight: 600;
  padding: 0.5rem; cursor: pointer; text-transform: capitalize;
  transition: all 0.2s;
}
.om-str-btn.active { border-color: var(--accent); background: var(--accent-dim); color: var(--accent); }

.om-native-note {
  display: flex; gap: 8px; align-items: flex-start;
  background: rgba(56,189,248,0.08); border: 1px solid rgba(56,189,248,0.2);
  border-radius: var(--rs); padding: 0.8rem;
}
.om-native-note > div { color: #38bdf8; flex-shrink: 0; margin-top: 1px; }
.om-native-note p { font-size: 0.75rem; color: var(--text2); line-height: 1.5; }
.om-native-note strong { color: #38bdf8; }

/* ── SETTINGS ADDITIONS ─────────────────────────── */
.settings-item .si-badge {
  font-family: var(--mono); font-size: 0.58rem;
  background: var(--accent-dim); border: 1px solid rgba(127,255,178,0.3);
  color: var(--accent); border-radius: 5px; padding: 2px 6px;
}
.timer-row { display: flex; align-items: center; gap: 8px; }
.timer-select {
  background: var(--surface2); border: 1px solid var(--border2);
  border-radius: var(--rs); color: var(--text);
  font-family: var(--mono); font-size: 0.78rem;
  padding: 0.3rem 0.5rem; cursor: pointer;
}

/* ── SVG ICON UTILITY ───────────────────────────── */
[data-icon] svg { display: block; }
.nav-btn [data-icon] { pointer-events: none; }
""")

# ══════════════════════════════════════════════════════
# 6. index.html — add new script tags + overlay button
#    + permission screen hook + settings timer select
# ══════════════════════════════════════════════════════
write('www/index.html', r"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
  <meta name="theme-color" content="#07070f"/>
  <meta name="apple-mobile-web-app-capable" content="yes"/>
  <title>Battery ⚡ 78%</title>
  <link rel="manifest" href="manifest.json"/>
  <link rel="stylesheet" href="styles.css"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet"/>
</head>
<body>

<!-- ── LOCK SCREEN ───────────────────────────────── -->
<div id="lockScreen" class="lock-screen active">
  <canvas id="lockCanvas" class="lock-canvas"></canvas>
  <div class="lock-content">
    <div class="app-logo">
      <div class="logo-a">A</div>
      <div class="logo-text">SHIELD<em>SPACE</em></div>
    </div>
    <div class="lock-status-row">
      <span class="lock-badge">🔒 SECURED</span>
      <span id="lockAttemptInfo" class="lock-attempt-info"></span>
    </div>
    <div class="pin-display">
      <span class="pin-dot" id="pd0"></span>
      <span class="pin-dot" id="pd1"></span>
      <span class="pin-dot" id="pd2"></span>
      <span class="pin-dot" id="pd3"></span>
    </div>
    <div id="pinError" class="pin-error"></div>
    <div id="lockoutTimer" class="lockout-timer hidden"></div>
    <div class="numpad" id="numpad">
      <button class="num-key" data-digit="1">1</button>
      <button class="num-key" data-digit="2">2</button>
      <button class="num-key" data-digit="3">3</button>
      <button class="num-key" data-digit="4">4</button>
      <button class="num-key" data-digit="5">5</button>
      <button class="num-key" data-digit="6">6</button>
      <button class="num-key" data-digit="7">7</button>
      <button class="num-key" data-digit="8">8</button>
      <button class="num-key" data-digit="9">9</button>
      <button class="num-key decoy-key" id="decoyBtn">DECOY</button>
      <button class="num-key" data-digit="0">0</button>
      <button class="num-key del-key" id="delBtn">⌫</button>
    </div>
    <div class="lock-bottom-row">
      <button class="lock-bio-btn" id="biometricBtn">
        <span data-icon="fingerprint" data-size="16"></span>
        Fingerprint
      </button>
    </div>
  </div>
</div>

<!-- ── INTRUDER ALERT ─────────────────────────────── -->
<div id="intruderAlert" class="intruder-alert hidden">
  <div class="intruder-inner">
    <div class="intruder-icon">📸</div>
    <p>Intruder photo captured &amp; encrypted.</p>
    <button id="intruderOk">OK</button>
  </div>
</div>

<!-- ── PANIC / DECOY CALCULATOR ───────────────────── -->
<div id="panicOverlay" class="panic-overlay hidden">
  <div class="panic-content">
    <div class="calc-title">Calculator</div>
    <div class="calc-display" id="calcDisplay">0</div>
    <div class="calc-grid">
      <button class="calc-btn op"     onclick="calcPress('AC')">AC</button>
      <button class="calc-btn op"     onclick="calcPress('+/-')"  >+/-</button>
      <button class="calc-btn op"     onclick="calcPress('%')">%</button>
      <button class="calc-btn accent" onclick="calcPress('/')">÷</button>
      <button class="calc-btn"        onclick="calcPress('7')">7</button>
      <button class="calc-btn"        onclick="calcPress('8')">8</button>
      <button class="calc-btn"        onclick="calcPress('9')">9</button>
      <button class="calc-btn accent" onclick="calcPress('*')">×</button>
      <button class="calc-btn"        onclick="calcPress('4')">4</button>
      <button class="calc-btn"        onclick="calcPress('5')">5</button>
      <button class="calc-btn"        onclick="calcPress('6')">6</button>
      <button class="calc-btn accent" onclick="calcPress('-')">−</button>
      <button class="calc-btn"        onclick="calcPress('1')">1</button>
      <button class="calc-btn"        onclick="calcPress('2')">2</button>
      <button class="calc-btn"        onclick="calcPress('3')">3</button>
      <button class="calc-btn accent" onclick="calcPress('+')">+</button>
      <button class="calc-btn wide"   onclick="calcPress('0')">0</button>
      <button class="calc-btn"        onclick="calcPress('.')">.</button>
      <button class="calc-btn accent" onclick="calcPress('=')">=</button>
    </div>
    <div class="calc-exit-hint">← tap 5× anywhere to exit</div>
  </div>
</div>

<!-- ── MAIN APP ────────────────────────────────────── -->
<div id="mainApp" class="main-app hidden">

  <!-- Header -->
  <header class="app-header">
    <div class="header-logo">
      <span class="hdr-a">A</span>
      <span>ShieldSpace</span>
    </div>
    <div class="header-actions">
      <button class="icon-btn" id="overlayManagerBtn" title="Overlay manager">
        <span data-icon="layers" data-size="18"></span>
      </button>
      <button class="icon-btn" id="blurToggleBtn" title="Privacy blur">
        <span data-icon="eye" data-size="18"></span>
      </button>
      <button class="icon-btn panic-btn" id="panicBtn" title="Panic mode">
        <span data-icon="zap" data-size="18"></span>
      </button>
    </div>
  </header>

  <!-- Status bar -->
  <div class="status-bar">
    <div class="status-item"><span class="status-dot off" id="blurDot"></span><span>Blur <em id="blurTxt">off</em></span></div>
    <div class="status-item"><span class="status-dot off" id="watchDot"></span><span>Watch <em id="watchTxt">off</em></span></div>
    <div class="status-item"><span class="status-dot off" id="shakeDot"></span><span>Shake <em id="shakeTxt">off</em></span></div>
    <div class="status-item"><span class="status-dot off" id="overlayDot"></span><span>Overlay <em id="overlayTxt">off</em></span></div>
  </div>

  <!-- Nav -->
  <nav class="bottom-nav">
    <button class="nav-btn active" data-tab="dashboard">
      <span data-icon="home" data-size="22"></span><span>Home</span>
    </button>
    <button class="nav-btn" data-tab="vault">
      <span data-icon="vault" data-size="22"></span><span>Vault</span>
    </button>
    <button class="nav-btn" data-tab="browser">
      <span data-icon="browser" data-size="22"></span><span>Browser</span>
    </button>
    <button class="nav-btn" data-tab="intruders">
      <span data-icon="intel" data-size="22"></span><span>Intel</span>
    </button>
    <button class="nav-btn" data-tab="settings">
      <span data-icon="settings" data-size="22"></span><span>Settings</span>
    </button>
  </nav>

  <!-- ── DASHBOARD ────────────────────────────────── -->
  <div class="tab-content active" id="tab-dashboard">
    <div class="page-inner">
      <div class="greeting">
        <div class="greeting-a">A</div>
        <h1>Your space,<br/><em>your rules.</em></h1>
        <p class="sub">AES-256 encrypted · Zero servers · Zero tracking</p>
      </div>
      <div class="quick-actions">
        <button class="qa-card" data-goto="vault">
          <div class="qa-icon" data-icon="vault" data-size="28"></div>
          <div class="qa-label">Vault</div><div class="qa-sub">Encrypted notes &amp; files</div>
        </button>
        <button class="qa-card" data-goto="browser">
          <div class="qa-icon" data-icon="browser" data-size="28"></div>
          <div class="qa-label">Browser</div><div class="qa-sub">Zero-trace browsing</div>
        </button>
        <button class="qa-card" data-goto="intruders">
          <div class="qa-icon" data-icon="camera" data-size="28"></div>
          <div class="qa-label">Intel</div><div class="qa-sub" id="intruderCount">Intruder log</div>
        </button>
        <button class="qa-card panic-card" id="panicQA">
          <div class="qa-icon" data-icon="panic" data-size="28"></div>
          <div class="qa-label">Panic</div><div class="qa-sub">Hide everything</div>
        </button>
      </div>
      <div class="feature-cards">
        <div class="feat-card">
          <div class="feat-header">
            <span class="feat-icon" data-icon="blur" data-size="18"></span>
            <span class="feat-title">Privacy Blur</span>
            <label class="toggle-switch"><input type="checkbox" id="blurToggle"/><span class="toggle-track"></span></label>
          </div>
          <p>Edge vignette dims after 60s of inactivity — kills shoulder-surfing.</p>
        </div>
        <div class="feat-card">
          <div class="feat-header">
            <span class="feat-icon" data-icon="shake" data-size="18"></span>
            <span class="feat-title">Shake to Lock</span>
            <label class="toggle-switch"><input type="checkbox" id="shakeToggle"/><span class="toggle-track"></span></label>
          </div>
          <p>Shake phone = instant lock. No buttons needed.</p>
        </div>
        <div class="feat-card">
          <div class="feat-header">
            <span class="feat-icon" data-icon="camera" data-size="18"></span>
            <span class="feat-title">Camera Watch</span>
            <label class="toggle-switch"><input type="checkbox" id="cameraToggle"/><span class="toggle-track"></span></label>
          </div>
          <p>Auto-blurs if a second face appears near your screen.</p>
        </div>
        <div class="feat-card" id="overlayCard" style="cursor:pointer">
          <div class="feat-header">
            <span class="feat-icon" data-icon="layers" data-size="18"></span>
            <span class="feat-title">System Overlay</span>
            <span class="si-badge" id="overlayModeBadge">off</span>
          </div>
          <p>Privacy blur on other apps — notifications, all apps, or your pick.</p>
        </div>
      </div>
      <div class="clipboard-section">
        <div class="section-title">
          <span data-icon="copy" data-size="16"></span>
          Encrypted Clipboard
        </div>
        <textarea id="clipInput" class="clip-input" placeholder="Paste sensitive text — encrypts on save, clears in 30s…"></textarea>
        <div class="clip-actions">
          <button class="clip-btn" id="clipSaveBtn">Encrypt &amp; Copy</button>
          <button class="clip-btn secondary" id="clipClearBtn">Clear</button>
        </div>
        <div id="clipStatus" class="clip-status"></div>
      </div>
    </div>
  </div>

  <!-- ── VAULT ─────────────────────────────────────── -->
  <div class="tab-content hidden" id="tab-vault">
    <div class="page-inner">
      <div class="tab-header">
        <h2>Encrypted Vault</h2>
        <div style="display:flex;gap:8px">
          <button class="add-btn secondary" id="exportVaultBtn">
            <span data-icon="export" data-size="14"></span> Export
          </button>
          <button class="add-btn" id="addNoteBtn">
            <span data-icon="plus" data-size="14"></span> New
          </button>
        </div>
      </div>
      <div class="search-bar">
        <span data-icon="search" data-size="15" style="color:var(--text3);flex-shrink:0"></span>
        <input type="search" id="vaultSearch" placeholder="Search notes…" class="search-input"/>
      </div>
      <div class="vault-tabs">
        <button class="vault-tab active" data-vtype="notes">Notes</button>
        <button class="vault-tab" data-vtype="files">Files</button>
        <button class="vault-tab" data-vtype="import">Import</button>
      </div>
      <div id="notesView" class="vault-view"><div class="vault-list" id="notesList"></div></div>
      <div id="filesView" class="vault-view hidden">
        <label class="file-upload-zone">
          <input type="file" id="fileInput" multiple hidden/>
          <div class="upload-inner">
            <span data-icon="download" data-size="28"></span>
            <p>Tap to encrypt &amp; store a file</p>
            <small>Never uploaded — local only</small>
          </div>
        </label>
        <div class="vault-list" id="filesList"></div>
      </div>
      <div id="importView" class="vault-view hidden">
        <div class="import-box">
          <h3>Import Vault Backup</h3>
          <p>Select an encrypted <code>.shieldspace</code> backup file to restore notes.</p>
          <label class="file-upload-zone">
            <input type="file" id="importInput" accept=".shieldspace,.json" hidden/>
            <div class="upload-inner">
              <span data-icon="upload" data-size="28"></span>
              <p>Select backup file</p>
            </div>
          </label>
        </div>
      </div>
    </div>
    <div class="modal hidden" id="noteModal">
      <div class="modal-backdrop"></div>
      <div class="modal-box">
        <div class="modal-header">
          <input class="modal-title-input" id="noteTitle" placeholder="Note title…"/>
          <div class="modal-actions">
            <button class="modal-save-btn" id="saveNoteBtn">Save</button>
            <button class="modal-close-btn" id="closeNoteBtn">✕</button>
          </div>
        </div>
        <textarea class="modal-body" id="noteBody" placeholder="Write anything… encrypted with AES-256."></textarea>
      </div>
    </div>
  </div>

  <!-- ── BROWSER ────────────────────────────────────── -->
  <div class="tab-content hidden" id="tab-browser">
    <div class="browser-chrome">
      <div class="browser-bar">
        <span data-icon="lock" data-size="14" style="color:var(--accent);flex-shrink:0"></span>
        <input class="url-input" id="urlInput" type="url" placeholder="Enter URL…" autocomplete="off"/>
        <button class="go-btn" id="goBtn">Go</button>
      </div>
      <div class="browser-actions">
        <button class="browser-action-btn" id="clearBrowserBtn">
          <span data-icon="trash" data-size="13"></span> Clear Session
        </button>
        <button class="browser-action-btn" id="reloadBtn">↻ Reload</button>
      </div>
    </div>
    <div class="browser-frame-wrap">
      <iframe id="browserFrame" class="browser-frame" sandbox="allow-scripts allow-same-origin allow-forms" src="about:blank"></iframe>
      <div class="browser-placeholder" id="browserPlaceholder">
        <div class="browser-ph-icon" data-icon="browser" data-size="48" style="color:var(--text3)"></div>
        <h3>Secure Mini-Browser</h3>
        <p>No history saved. Cookies wiped on exit. No trackers.</p>
        <div class="browser-features">
          <span><span data-icon="check" data-size="12"></span> No history</span>
          <span><span data-icon="check" data-size="12"></span> Cookies cleared on exit</span>
          <span><span data-icon="check" data-size="12"></span> Session wiped on tab switch</span>
        </div>
      </div>
    </div>
  </div>

  <!-- ── INTEL / INTRUDERS ─────────────────────────── -->
  <div class="tab-content hidden" id="tab-intruders">
    <div class="page-inner">
      <div class="tab-header">
        <h2>Intruder Intel</h2>
        <button class="add-btn secondary" id="clearIntrudersBtn">
          <span data-icon="trash" data-size="13"></span> Clear
        </button>
      </div>
      <p class="sub" style="margin-top:-0.5rem">Front-camera photos on failed PIN attempts.</p>
      <div id="intruderGrid" class="intruder-grid"></div>
    </div>
  </div>

  <!-- ── SETTINGS ──────────────────────────────────── -->
  <div class="tab-content hidden" id="tab-settings">
    <div class="page-inner">
      <div class="tab-header"><h2>Settings</h2></div>

      <div class="settings-group">
        <div class="settings-label">Security</div>
        <button class="settings-item" id="changePinBtn">
          <span class="si-icon" data-icon="key" data-size="18"></span>
          <div class="si-text"><strong>Change PIN</strong><small>Update your unlock PIN</small></div>
          <span class="si-arrow" data-icon="chevronRight" data-size="16"></span>
        </button>
        <button class="settings-item" id="setupDecoyBtn">
          <span class="si-icon">🎭</span>
          <div class="si-text"><strong>Decoy PIN</strong><small>Opens fake calculator</small></div>
          <span class="si-arrow" data-icon="chevronRight" data-size="16"></span>
        </button>
        <div class="settings-item">
          <span class="si-icon" data-icon="timer" data-size="18"></span>
          <div class="si-text">
            <strong>Auto-lock</strong>
            <small>Lock after inactivity</small>
          </div>
          <label class="toggle-switch"><input type="checkbox" id="autoLockToggle" checked/><span class="toggle-track"></span></label>
        </div>
        <div class="settings-item">
          <span class="si-icon" data-icon="skull" data-size="18"></span>
          <div class="si-text"><strong>Self-Destruct</strong><small>Wipe vault after 5 wrong PINs</small></div>
          <label class="toggle-switch"><input type="checkbox" id="selfDestructToggle"/><span class="toggle-track"></span></label>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-label">Privacy</div>
        <div class="settings-item">
          <span class="si-icon" data-icon="blur" data-size="18"></span>
          <div class="si-text">
            <strong>Privacy Blur</strong>
            <small class="timer-row">
              Dim after
              <select class="timer-select" id="blurDelaySelect">
                <option value="30000">30s</option>
                <option value="60000" selected>60s</option>
                <option value="120000">2 min</option>
                <option value="300000">5 min</option>
              </select>
              of inactivity
            </small>
          </div>
          <label class="toggle-switch"><input type="checkbox" id="blurToggle2"/><span class="toggle-track"></span></label>
        </div>
        <div class="settings-item">
          <span class="si-icon" data-icon="shake" data-size="18"></span>
          <div class="si-text"><strong>Shake to Lock</strong><small>Shake phone = instant lock</small></div>
          <label class="toggle-switch"><input type="checkbox" id="shakeToggle2"/><span class="toggle-track"></span></label>
        </div>
        <div class="settings-item">
          <span class="si-icon" data-icon="camera" data-size="18"></span>
          <div class="si-text"><strong>Camera Watch</strong><small>Auto-blur on extra face</small></div>
          <label class="toggle-switch"><input type="checkbox" id="cameraToggle2"/><span class="toggle-track"></span></label>
        </div>
        <div class="settings-item">
          <span class="si-icon" data-icon="bell" data-size="18"></span>
          <div class="si-text"><strong>Intruder Selfie</strong><small>Photo on 3 wrong PINs</small></div>
          <label class="toggle-switch"><input type="checkbox" id="intruderToggle" checked/><span class="toggle-track"></span></label>
        </div>
        <button class="settings-item" id="overlayManagerSettingsBtn">
          <span class="si-icon" data-icon="layers" data-size="18"></span>
          <div class="si-text">
            <strong>System Overlay</strong>
            <small>Privacy blur on other apps</small>
          </div>
          <span class="si-badge" id="overlayModeBadge2">off</span>
          <span class="si-arrow" data-icon="chevronRight" data-size="16"></span>
        </button>
      </div>

      <div class="settings-group">
        <div class="settings-label">Data</div>
        <button class="settings-item" id="exportSettingsBtn">
          <span class="si-icon" data-icon="export" data-size="18"></span>
          <div class="si-text"><strong>Export Encrypted Backup</strong><small>Save vault to .shieldspace file</small></div>
          <span class="si-arrow" data-icon="chevronRight" data-size="16"></span>
        </button>
        <button class="settings-item danger" id="clearVaultBtn">
          <span class="si-icon" data-icon="trash" data-size="18"></span>
          <div class="si-text"><strong>Clear All Vault Data</strong><small>Permanently delete all data</small></div>
          <span class="si-arrow" data-icon="chevronRight" data-size="16"></span>
        </button>
        <button class="settings-item danger" id="resetAppBtn">
          <span class="si-icon" data-icon="alert" data-size="18"></span>
          <div class="si-text"><strong>Factory Reset</strong><small>Wipe everything</small></div>
          <span class="si-arrow" data-icon="chevronRight" data-size="16"></span>
        </button>
      </div>

      <div class="settings-group">
        <div class="settings-label">About</div>
        <div class="settings-item info-item">
          <span class="si-icon" data-icon="shieldCheck" data-size="18"></span>
          <div class="si-text">
            <strong>ShieldSpace v2.1</strong>
            <small>AES-256-GCM · PBKDF2-SHA256 · No servers · No tracking</small>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Privacy overlay -->
  <div id="privacyOverlay" class="privacy-overlay hidden"></div>
</div>

<script src="icons.js"></script>
<script src="vault.js"></script>
<script src="overlay.js"></script>
<script src="camera.js"></script>
<script src="shake.js"></script>
<script src="browser.js"></script>
<script src="clipboard.js"></script>
<script src="permissions.js"></script>
<script src="overlay-manager.js"></script>
<script src="app.js"></script>
<script>
if('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(()=>{});
let calcExpr='';
function calcPress(v){
  const d=document.getElementById('calcDisplay');
  if(v==='AC'){calcExpr='';d.textContent='0';return;}
  if(v==='='){try{calcExpr=String(eval(calcExpr)||0);d.textContent=calcExpr;}catch{d.textContent='Error';calcExpr='';}return;}
  calcExpr+=v;d.textContent=calcExpr;
}
</script>
</body>
</html>
""")

# ══════════════════════════════════════════════════════
# 7. AndroidManifest.xml — full permissions
# ══════════════════════════════════════════════════════
write('android/app/src/main/AndroidManifest.xml', r"""
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.shieldspace.app">

  <!-- Network (mini-browser) -->
  <uses-permission android:name="android.permission.INTERNET"/>
  <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>

  <!-- Camera (intruder selfie + face watch) -->
  <uses-permission android:name="android.permission.CAMERA"/>
  <uses-feature android:name="android.hardware.camera" android:required="false"/>
  <uses-feature android:name="android.hardware.camera.front" android:required="false"/>

  <!-- Storage for encrypted file vault -->
  <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32"/>
  <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29"/>
  <uses-permission android:name="android.permission.READ_MEDIA_IMAGES"/>
  <uses-permission android:name="android.permission.READ_MEDIA_VIDEO"/>
  <uses-permission android:name="android.permission.READ_MEDIA_AUDIO"/>

  <!-- System overlay (draw over other apps) -->
  <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>

  <!-- Biometric / fingerprint -->
  <uses-permission android:name="android.permission.USE_BIOMETRIC"/>
  <uses-permission android:name="android.permission.USE_FINGERPRINT"/>
  <uses-feature android:name="android.hardware.fingerprint" android:required="false"/>

  <!-- Notifications -->
  <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
  <uses-permission android:name="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"/>

  <!-- Motion sensors (shake-to-lock) -->
  <uses-feature android:name="android.hardware.sensor.accelerometer" android:required="false"/>

  <!-- Vibration (PIN feedback) -->
  <uses-permission android:name="android.permission.VIBRATE"/>

  <!-- Wake lock (camera watch) -->
  <uses-permission android:name="android.permission.WAKE_LOCK"/>

  <!-- Prevent backups (security) -->
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>

  <application
    android:allowBackup="false"
    android:fullBackupContent="false"
    android:dataExtractionRules="@xml/data_extraction_rules"
    android:icon="@mipmap/ic_launcher"
    android:label="ShieldSpace"
    android:theme="@style/AppTheme"
    android:hardwareAccelerated="true"
    android:usesCleartextTraffic="false"
    android:networkSecurityConfig="@xml/network_security_config">

    <activity
      android:name="com.shieldspace.app.MainActivity"
      android:label="ShieldSpace"
      android:launchMode="singleTask"
      android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|uiMode"
      android:windowSoftInputMode="adjustResize"
      android:exported="true"
      android:screenOrientation="portrait">
      <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.LAUNCHER"/>
      </intent-filter>
    </activity>

    <!-- Notification listener for overlay-on-notification feature -->
    <service
      android:name=".ShieldNotificationService"
      android:label="ShieldSpace Overlay"
      android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"
      android:exported="false">
      <intent-filter>
        <action android:name="android.service.notification.NotificationListenerService"/>
      </intent-filter>
    </service>

    <provider
      android:name="androidx.core.content.FileProvider"
      android:authorities="${applicationId}.fileprovider"
      android:exported="false"
      android:grantUriPermissions="true">
      <meta-data
        android:name="android.support.FILE_PROVIDER_PATHS"
        android:resource="@xml/file_paths"/>
    </provider>
  </application>
</manifest>
""")

# ── Also update app.js to wire overlay manager + permissions + icon init ──
# Append a small init patch at the bottom of app.js
append('www/app.js', r"""

// ── v2.1 ADDITIONS ─────────────────────────────────

// Init icons and overlay manager on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  Icons.applyAll();
  OverlayManager.init();

  // Overlay card on dashboard
  const overlayCard = document.getElementById('overlayCard');
  if (overlayCard) overlayCard.addEventListener('click', () => OverlayManager.openUI());

  // Overlay button in header
  const omBtn = document.getElementById('overlayManagerBtn');
  if (omBtn) omBtn.addEventListener('click', () => OverlayManager.openUI());

  // Overlay button in settings
  const omSettBtn = document.getElementById('overlayManagerSettingsBtn');
  if (omSettBtn) omSettBtn.addEventListener('click', () => OverlayManager.openUI());

  // Blur delay selector
  const delaySelect = document.getElementById('blurDelaySelect');
  if (delaySelect) {
    const saved = localStorage.getItem('ss_blur_delay') || '60000';
    delaySelect.value = saved;
    delaySelect.addEventListener('change', () => {
      PrivacyOverlay.setDelay(parseInt(delaySelect.value));
    });
  }

  // Sync overlay mode badges
  function syncOverlayBadge() {
    const mode = OverlayManager.getMode();
    const labels = { off:'off', all:'all apps', notifications:'notifs', custom:'custom' };
    const txt = labels[mode] || 'off';
    ['overlayModeBadge','overlayModeBadge2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    });
  }
  syncOverlayBadge();
  setInterval(syncOverlayBadge, 2000);

  // First-run permission onboarding
  if (Permissions.isFirstRun()) {
    // Wait for app to be unlocked before showing permissions
    const origShowApp = window._showApp;
  }
}, { once: true });

// Trigger permissions after first successful unlock
const _origShowApp = window._showApp;

// Hook into showApp via a custom event
document.addEventListener('ss:unlocked', () => {
  if (Permissions.isFirstRun()) {
    setTimeout(() => {
      Permissions.start((results) => {
        console.log('Permissions results:', results);
        // Apply whatever was granted
        if (results.motion) ShakeLock.enable();
      });
    }, 800);
  }
});
""")

print("""
\033[92m╔══════════════════════════════════════════════════════╗
║  ✅  v2.1 update applied — 7 files updated           ║
╚══════════════════════════════════════════════════════╝\033[0m

Now push to GitHub:

  cd ~/ShieldSpace
  git add .
  git commit -m "✨ v2.1 — icons, permissions, overlay manager, 60s timer"
  git push origin main

GitHub Actions will auto-build your new APK in ~2 minutes.
""")
