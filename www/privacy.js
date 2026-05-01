const PrivacyModule = (() => {
  function init() {
    document.getElementById('permAuditBtn')?.addEventListener('click', runPermAudit);
    document.getElementById('trackerCleanBtn')?.addEventListener('click', () => showTool('trackerTool'));
    document.getElementById('fingerprintBtn')?.addEventListener('click', () => showTool('fingerprintTool'));
    document.getElementById('urlScanBtn')?.addEventListener('click', () => showTool('urlScanTool'));

    document.getElementById('trackerToolBack')?.addEventListener('click', () => hideTool('trackerTool'));
    document.getElementById('urlScanToolBack')?.addEventListener('click', () => hideTool('urlScanTool'));
    document.getElementById('fingerprintToolBack')?.addEventListener('click', () => hideTool('fingerprintTool'));

    document.getElementById('trackerCleanAction')?.addEventListener('click', cleanUrl);
    document.getElementById('trackerCopy')?.addEventListener('click', () => {
      const output = document.getElementById('trackerOutput');
      if (output) { navigator.clipboard.writeText(output.textContent); toast('Copied'); }
    });

    document.getElementById('urlScanAction')?.addEventListener('click', scanUrl);
  }

  function showTool(id) {
    document.getElementById('privacyGrid')?.classList.add('hidden');
    document.querySelectorAll('.privacy-tool').forEach(t => t.classList.add('hidden'));
    document.getElementById(id)?.classList.remove('hidden');
    if (id === 'fingerprintTool') showFingerprint();
  }

  function hideTool(id) {
    document.getElementById(id)?.classList.add('hidden');
    document.getElementById('privacyGrid')?.classList.remove('hidden');
  }

  /* Permission Audit */
  async function runPermAudit() {
    const perms = [
      {name:'Camera', api:'camera', check:() => queryPermission('camera')},
      {name:'Microphone', api:'microphone', check:() => queryPermission('microphone')},
      {name:'Geolocation', api:'geolocation', check:() => queryPermission('geolocation')},
      {name:'Notifications', api:'notifications', check:() => Notification.permission},
      {name:'Clipboard', api:'clipboard-read', check:() => queryPermission('clipboard-read')},
    ];
    const results = await Promise.all(perms.map(async p => {
      try { const state = await p.check(); return {name: p.name, state}; } catch { return {name: p.name, state:'unsupported'}; }
    }));
    toast('Audit complete');
  }

  async function queryPermission(name) {
    if (!navigator.permissions) return 'unknown';
    try { const r = await navigator.permissions.query({name}); return r.state; } catch { return 'unknown'; }
  }

  /* Tracker Cleaner */
  function cleanUrl() {
    const input = document.getElementById('trackerInput')?.value?.trim();
    if (!input) return;
    try {
      const url = new URL(input);
      const trackerParams = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','fbclid','gclid','twclid','_hsenc','_hsmi','hsa_acc','hsa_cam','hsa_grp','hsa_ad','hsa_src','hsa_tgt','hsa_kw','hsa_mt','hsa_ol','hsa_net','ref','source','share'];
      const params = new URLSearchParams(url.search);
      let removed = 0;
      for (const key of [...params.keys()]) {
        if (trackerParams.some(t => key.toLowerCase().includes(t))) { params.delete(key); removed++; }
      }
      url.search = params.toString();
      const result = document.getElementById('trackerResult');
      const output = document.getElementById('trackerOutput');
      if (output) output.textContent = url.toString();
      if (result) result.classList.remove('hidden');
      toast(removed > 0 ? `Removed ${removed} tracker params` : 'No trackers found');
    } catch {
      toast('Invalid URL', 'red');
    }
  }

  /* URL Scanner */
  function scanUrl() {
    const input = document.getElementById('urlScanInput')?.value?.trim();
    if (!input) return;
    const result = document.getElementById('urlScanResult');
    const output = document.getElementById('urlScanOutput');
    if (!result || !output) return;
    try {
      const url = new URL(input);
      const params = new URLSearchParams(url.search);
      const analysis = [
        {label:'Protocol', value: url.protocol === 'https:' ? 'Secure (HTTPS)' : 'Not secure (HTTP)'},
        {label:'Domain', value: url.hostname},
        {label:'Path', value: url.pathname || '/'},
        {label:'Query params', value: params.size > 0 ? `${params.size} parameter(s)` : 'None'},
        {label:'Trackers found', value: [...params.keys()].filter(k => ['utm_','fbclid','gclid','twclid'].some(t => k.includes(t))).length.toString()},
      ];
      output.innerHTML = analysis.map(a => `
        <div class="fp-item"><span class="fp-label">${a.label}</span><span class="fp-value">${a.value}</span></div>
      `).join('');
      result.classList.remove('hidden');
    } catch {
      toast('Invalid URL', 'red');
    }
  }

  /* Browser Fingerprint */
  function showFingerprint() {
    const output = document.getElementById('fingerprintOutput');
    if (!output) return;
    const items = [
      {label:'User Agent', value:navigator.userAgent.slice(0,80)+'…'},
      {label:'Language', value:navigator.language},
      {label:'Platform', value:navigator.platform},
      {label:'Screen', value:`${screen.width}x${screen.height}`},
      {label:'Color Depth', value:`${screen.colorDepth}-bit`},
      {label:'Cookies', value:navigator.cookieEnabled?'Enabled':'Disabled'},
      {label:'Do Not Track', value:navigator.doNotTrack||'Not set'},
      {label:'Touch', value:navigator.maxTouchPoints>0?`${navigator.maxTouchPoints} points`:'No'},
      {label:'Online', value:navigator.onLine?'Yes':'No'},
      {label:'Cores', value:navigator.hardwareConcurrency||'Unknown'},
      {label:'Memory', value:navigator.deviceMemory?`${navigator.deviceMemory} GB`:'Unknown'},
    ];
    output.innerHTML = items.map(i => `
      <div class="fp-item"><span class="fp-label">${i.label}</span><span class="fp-value">${i.value}</span></div>
    `).join('');
  }

  function toast(msg, type) {
    const t = document.createElement('div');
    t.className = 'toast' + (type === 'red' ? ' red' : ' green');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }

  return { init };
})();
