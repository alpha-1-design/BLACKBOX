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
