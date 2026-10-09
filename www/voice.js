/* Voice notes — record, replay, transcribe. Recordings are stored through
   the encrypted file vault like everything else. Transcription uses an
   on-device Whisper model (transformers.js), downloaded on first use and
   cached by the browser; audio never leaves the device for processing. */
const VoiceModule = (() => {
  let _mediaStream = null;
  let _recorder = null;
  let _chunks = [];
  let _asr = null; // cached whisper pipeline
  let _asrLoading = null; // promise guard

  function init() {
    document.getElementById('voiceCard')?.addEventListener('click', open);
    document.getElementById('closeVoiceModal')?.addEventListener('click', close);
    document.getElementById('cancelVoiceBtn')?.addEventListener('click', close);
    document.getElementById('voiceRecordBtn')?.addEventListener('click', toggleRecord);
  }

  function open() {
    document.getElementById('voiceModal').classList.remove('hidden');
    document.getElementById('voiceProgressPanel').classList.add('hidden');
    refresh();
  }

  function close() {
    if (_recorder && _recorder.state === 'recording') _recorder.stop();
    if (_mediaStream) {
      _mediaStream.getTracks().forEach(t => t.stop());
      _mediaStream = null;
    }
    document.getElementById('voiceModal').classList.add('hidden');
  }

  async function refresh() {
    if (!Vault.isUnlocked()) return;
    const all = await Vault.getAllFiles();
    const list = document.getElementById('voiceList');
    if (!list) return;
    const voices = all.filter(f => (f.type || '').startsWith('audio/'));
    if (voices.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>No voice notes yet.<br/>Tap the record button.</p></div>';
      return;
    }
    list.innerHTML = voices.map(f => `
      <div class="voice-item" data-id="${f.id}">
        <div class="file-info">
          <span class="file-name">${Vault.esc(f.name)}</span>
          <span class="file-meta">${Vault.formatSize(f.size)} · ${Vault.relTime(f.ts)}</span>
          ${f.transcript ? `<div class="voice-transcript">${Vault.esc(f.transcript)}</div>` : ''}
        </div>
        <div class="secret-item-actions">
          <button class="secret-action-btn play-btn" data-id="${f.id}" title="Play">
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><polygon points="6 4 20 12 6 20"/></svg>
          </button>
          <button class="secret-action-btn st-btn" data-id="${f.id}" title="${f.transcript ? 'Show transcript' : 'Transcribe'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="16" y2="12"/><line x1="4" y1="17" x2="12" y2="17"/></svg>
          </button>
          <button class="secret-action-btn delete del-voice" data-id="${f.id}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>`).join('');

    list.querySelectorAll('.play-btn').forEach(b => b.addEventListener('click', async () => {
      const blob = await Vault.getFileBlob(b.dataset.id);
      if (!blob) return;
      const audio = document.getElementById('voiceAudio');
      audio.src = URL.createObjectURL(blob);
      audio.play();
    }));
    list.querySelectorAll('.st-btn').forEach(b => b.addEventListener('click', () => transcribe(b.dataset.id)));
    list.querySelectorAll('.del-voice').forEach(b => b.addEventListener('click', async () => {
      if (await uiConfirm('Delete Voice Note', 'Delete this recording permanently?', { danger: true, okLabel: 'Delete' })) {
        await Vault.deleteFile(b.dataset.id);
        await refresh();
      }
    }));
  }

  async function toggleRecord() {
    const btn = document.getElementById('voiceRecordBtn');
    const status = document.getElementById('voiceRecStatus');
    if (_recorder && _recorder.state === 'recording') {
      _recorder.stop();
      return;
    }
    try {
      _mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const err = e && e.name ? e.name : String(e);
      if (err === 'NotAllowedError' || err === 'PermissionDeniedError') {
        await uiAlert('Microphone', 'Microphone access is required to record voice notes.', { danger: true });
      } else if (err === 'NotFoundError' || err === 'DevicesEmptyError') {
        await uiAlert('Microphone', 'No microphone was found on this device.');
      } else {
        await uiAlert('Microphone', 'Could not access the microphone: ' + err);
      }
      return;
    }
    _chunks = [];
    _recorder = new MediaRecorder(_mediaStream);
    _recorder.ondataavailable = e => _chunks.push(e.data);
    _recorder.onstop = async () => {
      _mediaStream.getTracks().forEach(t => t.stop());
      _mediaStream = null;
      btn.textContent = 'Record';
      status.textContent = '';
      const blob = new Blob(_chunks, { type: _recorder.mimeType || 'audio/webm' });
      const d = new Date();
      const name = `Voice note ${d.toLocaleDateString()} ${d.toLocaleTimeString()}.webm`;
      await Vault.saveFile(new File([blob], name, { type: blob.type }));
      await refresh();
      toast('Voice note encrypted & saved');
    };
    _recorder.start();
    btn.textContent = 'Stop';
    let secs = 0;
    status.textContent = '0:00';
    const t = setInterval(() => {
      if (!_recorder || _recorder.state !== 'recording') { clearInterval(t); return; }
      secs++;
      status.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    }, 1000);
  }

  /* ── Transcription (on-device Whisper via transformers.js) ── */
  async function _getASR(opts) {
    if (_asr) return _asr;
    if (!_asrLoading) {
      _asrLoading = (async () => {
        try {
          const mod = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
          mod.env.allowLocalModels = false;
          const pipelineOpts = {};
          if (opts && opts.onProgress) pipelineOpts.progress_callback = opts.onProgress;
          _asr = await mod.pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', pipelineOpts);
          return _asr;
        } catch (e) {
          _asrLoading = null;
          throw e;
        }
      })();
      _asrLoading.catch(() => { _asrLoading = null; });
    }
    return _asrLoading;
  }

  async function transcribe(id) {
    const statusEl = document.getElementById('voiceRecStatus');
    const progressPanel = document.getElementById('voiceProgressPanel');
    const ringEl = document.getElementById('voiceModelRing');
    const titleEl = document.getElementById('voiceModelTitle');
    const cancelBtn = document.getElementById('voiceModelCancel');

    const controller = new AbortController();
    const onCancel = () => controller.abort();
    const stopIfAborted = () => {
      if (controller.signal.aborted) throw new DOMException('Cancelled.', 'AbortError');
    };

    try {
      _setProgress(0, 'Connecting to the speech model…');
      progressPanel.classList.remove('hidden');
      statusEl.textContent = 'Preparing…';
      titleEl.textContent = 'Downloading speech model';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.disabled = false;
      cancelBtn.addEventListener('click', onCancel);

      const asr = await _getASR({
        onProgress: p => _setProgress(0.08 + p * 0.8, 'Downloading speech model…'),
      });
      stopIfAborted();

      _setProgress(1, 'Transcribing audio…');
      titleEl.textContent = 'Transcribing';
      statusEl.textContent = 'Transcribing…';
      ringEl.classList.remove('ring-active');
      await _nextFrame();
      stopIfAborted();

      const blob = await Vault.getFileBlob(id);
      const audio = await _blobToFloat32(blob);
      const out = await asr(audio);
      const text = (out && out.text ? out.text : '').trim();
      statusEl.textContent = '';
      _hideProgress();
      if (text) {
        await Vault.setFileTranscript(id, text);
        progressPanel.classList.add('hidden');
        await refresh();
        toast('Transcript saved (encrypted)');
      } else {
        await uiAlert('Transcribe', 'No speech detected in this recording.');
      }
    } catch (e) {
      statusEl.textContent = '';
      _hideProgress();
      if (e && e.name === 'AbortError') {
        toast('Cancelled');
        await uiAlert('Transcribe', 'Transcription cancelled. Run it again when you are ready.');
      } else {
        await uiAlert('Transcribe', 'Could not run the speech model. Check your connection and try again.');
      }
    } finally {
      cancelBtn.removeEventListener('click', onCancel);
    }
  }

  function _nextFrame() {
    return new Promise(r => requestAnimationFrame(() => r()));
  }

  function _blobToFloat32(blob) {
    return new Promise((resolve, reject) => {
      const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      const reader = new FileReader();
      reader.onload = () => {
        ctx.decodeAudioData(reader.result).then(buf => {
          resolve(buf.getChannelData(0));
        }).catch(err => {
          reject(err);
        }).finally(() => {
          ctx.close();
        });
      };
      reader.onerror = () => {
        ctx.close();
        reject(reader.error);
      };
      reader.readAsArrayBuffer(blob);
    });
  }

  function toast(msg, type) {
    const t = document.createElement('div');
    t.className = 'toast' + (type === 'red' ? ' red' : ' green');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  function _hideProgress() {
    const p = document.getElementById('voiceProgressPanel');
    if (p) p.classList.add('hidden');
  }

  function _setProgress(pct, sub) {
    const el = document.getElementById('voiceProgressPanel');
    if (!el) return;
    const pctEl = document.getElementById('voiceModelPct');
    const barEl = document.getElementById('voiceModelBar');
    const ringEl = document.getElementById('voiceModelRing');
    const subEl = document.getElementById('voiceModelSub');
    if (pctEl) pctEl.textContent = Math.round(pct) + '%';
    if (barEl) barEl.style.transform = 'scaleX(' + Math.min(1, Math.max(0, pct)) + ')';
    if (ringEl) ringEl.classList.add('ring-active');
    if (subEl) subEl.textContent = sub || '';
  }

  // Markup contract for CI: index.html must contain voiceProgressPanel,
  // voiceModelTitle, voiceModelCancel, voiceModelRing, voiceModelBar,
  // voiceModelPct, voiceModelSub (the progress panel rendered above the
  // voice list when a model download starts).
  return { init, refresh, transcribe };
})();
