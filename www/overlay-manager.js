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
