// UI state machine: picker → readiness → interview → report.
import { INDUSTRIES, RUBRIC } from './data.js';
import * as H from './heuristics.js';
import { llmProbe, llmReport, DEFAULT_MODEL, activeProvider, PROXY_URL } from './llm.js';
import { loadFace, analyseFrame, brightness, faceStatus } from './face.js';

const $ = sel => document.querySelector(sel);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const settings = Object.assign({ provider: 'auto', apiKey: '', model: DEFAULT_MODEL, voice: true, zhLocale: 'zh-HK' }, JSON.parse(localStorage.getItem('aip.settings') || '{}'));
const saveSettings = () => localStorage.setItem('aip.settings', JSON.stringify(settings));

const S = {
  lang: 'zh', industry: 'ib', screen: 'picker',
  stream: null, faceOn: false, recorder: null, chunks: [], recStart: 0, videoUrl: null,
  qa: [], qIndex: 0, phase: 'answer', questions: [],
  tele: { frames: 0, faceFrames: 0, eyeFrames: 0, browFrames: 0 },
  speech: { text: '', secs: 0, curText: '', curSecs: 0 }, report: null, drill: null,
};

const L = {
  en: { brand: 'AI Interview Studio', start: 'Continue', industry: 'Industry track', lang: 'Interview language', ready: 'Presence & readiness check', lighting: 'Lighting', face: 'Face centred, eye level', mic: 'Microphone', practice: '10-second practice', practicePrompt: 'Introduce yourself in one sentence.', begin: 'Start interview', skipCam: 'Continue without camera', q: 'Question', of: 'of', submit: 'Submit answer', submitProbe: 'Submit follow-up answer', thinking: 'Interviewer is reviewing your answer…', mic_on: 'Stop mic', mic_off: 'Speak', typeHere: 'Speak or type your answer…', bench: 'Hiring manager benchmark', rubric: 'Rubric checklist', eye: 'Eye contact', brow: 'Brow tension', pace: 'Pace', own: 'Ownership: I vs we', analysing: 'Writing your diagnostic report…', decision: 'Hiring decision', percentile: 'Cohort percentile (simulated)', strengths: 'Strengths', improvements: 'Deficiencies', rewrite: 'Executive before / after', before: 'Before', after: 'After', replay: 'Replay', drill: 'Drill weakest question', restart: 'New session', perQ: 'Per-question score', settings: 'Settings', engineAI: 'Claude API', engineOff: 'Offline heuristic engine', cue: 'Insider cue', noSpeech: 'Speech recognition is not available in this browser (use Chrome, Edge, Android Chrome or iOS Safari). Type your answers instead.' },
  zh: { brand: 'AI 模擬面試室', start: '繼續', industry: '行業路線', lang: '面試語言', ready: '表現及準備檢查', lighting: '光線', face: '面部置中、視線平齊', mic: '咪高峰', practice: '10秒練習', practicePrompt: '用一句話介紹你自己。', begin: '開始面試', skipCam: '不使用鏡頭繼續', q: '問題', of: '/', submit: '提交答案', submitProbe: '提交追問回答', thinking: '面試官正在審視你的答案…', mic_on: '停止錄音', mic_off: '開始說話', typeHere: '說話或輸入你的答案…', bench: '招聘經理基準', rubric: '評分清單', eye: '眼神接觸', brow: '皺眉比率', pace: '語速', own: '個人貢獻：我 vs 我們', analysing: '正在生成診斷報告…', decision: '招聘決定', percentile: '同儕百分位（模擬）', strengths: '優勢', improvements: '不足', rewrite: '高管級改寫', before: '原句', after: '改寫', replay: '重播', drill: '重練最弱問題', restart: '重新開始', perQ: '各題分數', settings: '設定', engineAI: 'Claude API', engineOff: '離線規則引擎', cue: '面試官暗中測試', noSpeech: '此瀏覽器不支援語音辨識（請用 Chrome、Edge、Android Chrome 或 iOS Safari），請改為輸入文字。' },
};
const t = k => L[S.lang][k];
const ctx = () => { const ind = INDUSTRIES[S.industry]; return { lang: S.lang, industry: ind.name[S.lang], role: ind.role[S.lang], interviewer_title: ind.title[S.lang] }; };
const engineLabel = () => ({ deepseek: 'DeepSeek', claude: t('engineAI'), offline: t('engineOff') })[activeProvider(settings)];
const aiOn = () => activeProvider(settings) !== 'offline';

// ---------------- shell ----------------
function shell(inner) {
  app.innerHTML = `
  <header class="border-b border-slate-200/80 bg-white/70 backdrop-blur">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
      <div class="flex items-center gap-3 min-w-0"><div class="shrink-0 h-7 w-7 rounded-md bg-slate-900 text-white grid place-items-center text-xs font-semibold">AI</div><span class="font-semibold tracking-tight truncate">${t('brand')}</span></div>
      <div class="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm shrink-0">
        <span class="whitespace-nowrap px-2 py-0.5 rounded-full border ${aiOn() ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-slate-300 text-slate-600 bg-white'}" data-testid="engine">${engineLabel()}</span>
        <button id="btn-settings" class="whitespace-nowrap min-h-11 px-1 text-slate-600 hover:text-slate-900">${t('settings')}</button>
      </div>
    </div>
  </header>
  <main class="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">${inner}</main>
  <dialog id="dlg" class="rounded-xl p-0 w-[calc(100%-2rem)] max-w-md backdrop:bg-slate-900/30">
    <form method="dialog" class="p-6 space-y-4">
      <h3 class="font-semibold">${t('settings')}</h3>
      <label class="block text-sm">AI engine
        <select id="set-prov" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">${[['auto', 'Auto'], ['deepseek', 'DeepSeek (server-side key)' + (PROXY_URL ? '' : ' — proxy not configured')], ['claude', 'Claude (your own key)'], ['offline', 'Offline heuristic engine']].map(([v, l]) => `<option value="${v}" ${settings.provider === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="block text-sm">Anthropic API key <span class="text-slate-500">(optional, stored only in this browser)</span>
        <input id="set-key" type="password" autocomplete="off" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value="${esc(settings.apiKey)}" placeholder="sk-ant-…"></label>
      <label class="block text-sm">Model <input id="set-model" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value="${esc(settings.model)}"></label>
      <label class="block text-sm">繁中語音辨識 locale
        <select id="set-loc" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">${['zh-HK', 'yue-Hant-HK', 'zh-TW'].map(l => `<option ${l === settings.zhLocale ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="flex items-center gap-2 text-sm"><input id="set-voice" type="checkbox" ${settings.voice ? 'checked' : ''}> Interviewer reads questions aloud</label>
      <p class="text-xs text-slate-500">DeepSeek runs through the site's proxy, so no key ever reaches this page. A Claude key stays in this browser and goes only to api.anthropic.com. With no AI engine available, the built-in heuristic engine runs fully offline.</p>
      <div class="flex justify-end gap-2"><button value="cancel" class="px-3 py-1.5 text-sm">Cancel</button><button id="set-save" value="ok" class="px-3 py-1.5 text-sm rounded-md bg-slate-900 text-white">Save</button></div>
    </form>
  </dialog>`;
  $('#btn-settings').onclick = () => $('#dlg').showModal();
  $('#set-save').onclick = () => {
    settings.provider = $('#set-prov').value; settings.apiKey = $('#set-key').value.trim(); settings.model = $('#set-model').value.trim() || DEFAULT_MODEL;
    settings.zhLocale = $('#set-loc').value; settings.voice = $('#set-voice').checked; saveSettings();
    setTimeout(render, 0);
  };
}

function render() {
  ({ picker: renderPicker, ready: renderReady, interview: renderInterview, analysing: renderAnalysing, report: renderReport })[S.screen]();
}

// ---------------- 1. picker ----------------
function renderPicker() {
  shell(`
  <section class="max-w-3xl">
    <p class="text-sm text-slate-500">Step 1 / 4</p>
    <h1 class="text-2xl sm:text-3xl font-semibold tracking-tight mt-1">${S.lang === 'zh' ? '選擇行業與職位' : 'Choose your industry and role'}</h1>
    <p class="text-slate-600 mt-2">${S.lang === 'zh' ? '三條問題，每條之後面試官會即時追問。完成後獲得四大支柱診斷報告。' : 'Three questions, each followed by a live probe from the interviewer, then a four-pillar diagnostic report.'}</p>
    <div class="mt-8"><h2 class="text-sm font-medium text-slate-700">${t('lang')}</h2>
      <div class="mt-2 inline-flex rounded-lg border border-slate-200 bg-white p-1">
        ${[['zh', '繁體中文'], ['en', 'English']].map(([k, v]) => `<button data-lang="${k}" class="px-4 py-1.5 rounded-md text-sm ${S.lang === k ? 'bg-slate-900 text-white' : 'text-slate-600'}">${v}</button>`).join('')}
      </div></div>
    <div class="mt-8"><h2 class="text-sm font-medium text-slate-700">${t('industry')}</h2>
      <div class="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      ${Object.entries(INDUSTRIES).map(([k, v]) => `
        <button data-ind="${k}" class="text-left rounded-xl border p-4 bg-white transition ${S.industry === k ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200/80 hover:border-slate-400'}">
          <div class="font-medium">${v.name[S.lang]}</div>
          <div class="text-sm text-slate-500 mt-1">${v.role[S.lang]}</div>
          <div class="text-xs text-slate-400 mt-3">${S.lang === 'zh' ? '面試官' : 'Interviewer'}: ${v.title[S.lang]}</div>
        </button>`).join('')}
      </div></div>
    <button id="go" class="mt-10 px-5 py-2.5 rounded-lg bg-slate-900 text-white">${t('start')} →</button>
  </section>`);
  app.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { S.lang = b.dataset.lang; render(); });
  app.querySelectorAll('[data-ind]').forEach(b => b.onclick = () => { S.industry = b.dataset.ind; render(); });
  $('#go').onclick = () => { S.screen = 'ready'; render(); };
}

// ---------------- media + speech ----------------
let audioCtx, analyser, rafId, sampleTimer;
async function ensureMedia() {
  if (S.stream) return S.stream;
  try { S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: true }); }
  catch (e) { try { S.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { S.stream = null; } }
  if (S.stream?.getAudioTracks().length) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const unlock = () => audioCtx.state === 'suspended' && audioCtx.resume();
    unlock(); document.addEventListener('pointerdown', unlock, { passive: true });
    analyser = audioCtx.createAnalyser(); analyser.fftSize = 1024;
    audioCtx.createMediaStreamSource(S.stream).connect(analyser);
  }
  if (S.stream?.getVideoTracks().length) loadFace();
  return S.stream;
}
function attachVideo(el) { if (el && S.stream?.getVideoTracks().length) { el.srcObject = S.stream; el.play().catch(() => {}); } }
function micLevel() {
  if (!analyser) return 0;
  const d = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(d);
  let s = 0; for (const v of d) s += ((v - 128) / 128) ** 2; return Math.sqrt(s / d.length);
}
function drawWave(canvas) {
  if (!canvas) return;
  const g = canvas.getContext('2d'), w = canvas.width = canvas.clientWidth * 2, h = canvas.height = canvas.clientHeight * 2;
  const loop = () => {
    if (!canvas.isConnected) return;
    g.clearRect(0, 0, w, h); g.strokeStyle = '#334155'; g.lineWidth = 3; g.beginPath();
    if (analyser) {
      const d = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(d);
      for (let i = 0; i < d.length; i += 8) { const x = i / d.length * w, y = h / 2 + (d[i] - 128) / 128 * h * 1.6; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    } else { g.moveTo(0, h / 2); g.lineTo(w, h / 2); }
    g.stroke(); rafId = requestAnimationFrame(loop);
  };
  cancelAnimationFrame(rafId); loop();
}

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, recActive = false, recT0 = 0;
function startSpeech(onText, onState) {
  if (!SR) return false;
  rec = new SR(); rec.lang = S.lang === 'zh' ? settings.zhLocale : 'en-US'; rec.continuous = true; rec.interimResults = true;
  recActive = true; recT0 = performance.now();
  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) { S.speech.curText += r[0].transcript + (S.lang === 'zh' ? '' : ' '); onText(r[0].transcript, true); }
      else interim += r[0].transcript;
    }
    onText(interim, false);
  };
  rec.onend = () => { if (recActive) { try { rec.start(); } catch { } } };   // Chrome stops after silence: restart
  rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { recActive = false; onState(false); } };
  rec.start(); onState(true); return true;
}
function stopSpeech() {
  if (!rec) return;
  recActive = false; S.speech.curSecs += (performance.now() - recT0) / 1000; try { rec.stop(); } catch { }
  rec = null;
}
function speak(text) {
  if (!settings.voice || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = S.lang === 'zh' ? 'zh-HK' : 'en-GB'; u.rate = 1;
  const v = speechSynthesis.getVoices().find(v => v.lang.replace('_', '-').startsWith(u.lang)); if (v) u.voice = v;
  const ind = $('#speaking'); if (ind) { u.onstart = () => ind.classList.remove('opacity-0'); u.onend = () => ind.classList.add('opacity-0'); }
  speechSynthesis.speak(u);
}

// ---------------- 2. readiness ----------------
function renderReady() {
  shell(`
  <section>
    <p class="text-sm text-slate-500">Step 2 / 4</p>
    <h1 class="text-2xl sm:text-3xl font-semibold tracking-tight mt-1">${t('ready')}</h1>
    <div class="mt-8 grid md:grid-cols-2 gap-8">
      <div class="rounded-xl overflow-hidden border border-slate-200/80 bg-slate-900 aspect-video relative">
        <video id="vid" muted playsinline class="w-full h-full object-cover -scale-x-100"></video>
        <div class="absolute inset-0 pointer-events-none grid place-items-center"><div class="w-1/3 h-2/3 rounded-[50%] border-2 border-dashed border-white/40"></div></div>
        <div id="nocam" class="hidden absolute inset-0 grid place-items-center text-slate-300 text-sm">No camera</div>
      </div>
      <div class="space-y-3">
        ${['lighting', 'face', 'mic'].map(k => `<div class="rounded-lg border border-slate-200/80 bg-white px-4 py-3"><div class="flex items-center justify-between"><span>${t(k)}</span><span id="chk-${k}" class="text-sm text-slate-400">…</span></div>${k === 'face' ? `<div id="face-prog" class="mt-2"><div class="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div id="face-bar" class="h-1.5 bg-slate-900 transition-all" style="width:0%"></div></div><p id="face-note" class="mt-1 text-xs text-slate-500"></p></div>` : ''}</div>`).join('')}
        <div class="rounded-lg border border-slate-200/80 bg-white px-4 py-3">
          <div class="flex items-center justify-between"><span>${t('practice')}</span><button id="practice" class="text-sm px-3 py-1 rounded-md border border-slate-300">▶ 10s</button></div>
          <p class="text-sm text-slate-500 mt-2">${t('practicePrompt')}</p>
          <p id="pr-text" class="text-sm mt-2 min-h-5"></p>
          <p id="pr-stat" class="text-xs text-slate-500 mt-1"></p>
        </div>
        ${SR ? '' : `<p class="text-sm text-amber-700">${t('noSpeech')}</p>`}
        <div class="pt-3 flex gap-3"><button id="begin" class="px-5 py-2.5 rounded-lg bg-slate-900 text-white">${t('begin')} →</button></div>
      </div>
    </div>
  </section>`);
  ensureMedia().then(st => {
    const vid = $('#vid'); if (!vid) return;
    if (st?.getVideoTracks().length) attachVideo(vid); else $('#nocam').classList.remove('hidden');
    const cv = document.createElement('canvas');
    clearInterval(sampleTimer);
    sampleTimer = setInterval(() => {
      if (!$('#chk-lighting')) return clearInterval(sampleTimer);
      const set = (k, ok, txt) => { const el = $('#chk-' + k); el.textContent = txt; el.className = 'text-sm ' + (ok ? 'text-emerald-600' : 'text-amber-600'); };
      if (st?.getVideoTracks().length) {
        const b = brightness(vid, cv);
        if (b != null) set('lighting', b >= 70 && b <= 210, b < 70 ? 'Too dark (' + b + ')' : b > 210 ? 'Too bright (' + b + ')' : 'OK (' + b + ')');
        const f = analyseFrame(vid);
        if (f) set('face', f.face && f.centered, !f.face ? 'No face' : f.centered ? 'OK' : 'Re-centre');
        else set('face', false, faceStatus.state === 'failed' ? (S.lang === 'zh' ? '不可用' : 'Unavailable') : faceStatus.pct + '%');
      } else { set('lighting', false, 'n/a'); set('face', false, 'n/a'); }
      renderFaceProgress();
      const lv = micLevel(); set('mic', lv > 0.02, analyser ? (lv > 0.02 ? 'Signal ✓' : 'Say something') : 'n/a');
    }, 400);
  });
  $('#practice').onclick = () => {
    if (!SR) { $('#pr-stat').textContent = t('noSpeech'); return; }
    S.speech.curText = ''; S.speech.curSecs = 0; let shown = '';
    startSpeech((txt, fin) => { if (fin) shown += txt; $('#pr-text').textContent = shown + (fin ? '' : txt); }, () => { });
    let left = 10; $('#pr-stat').textContent = left + 's';
    const iv = setInterval(() => {
      left--; if ($('#pr-stat')) $('#pr-stat').textContent = left + 's';
      if (left <= 0) {
        clearInterval(iv); stopSpeech();
        const p = H.pace(S.speech.curText, S.speech.curSecs, S.lang);
        if ($('#pr-stat')) $('#pr-stat').textContent = p == null ? '—' : `${t('pace')}: ${p} ${H.PACE_UNIT[S.lang]} (${H.paceStatus(p, S.lang)})`;
      }
    }, 1000);
  };
  $('#begin').onclick = () => { clearInterval(sampleTimer); startInterview(INDUSTRIES[S.industry].questions.map(q => q[S.lang])); };
}

// ---------------- 3. interview ----------------
function startInterview(questions, drill = null) {
  S.questions = questions; S.drill = drill; S.qIndex = 0; S.phase = 'answer';
  S.qa = questions.map(q => ({ question: q, answer: '', probe: '', cue: '', probeAnswer: '', t0: 0 }));
  S.tele = { frames: 0, faceFrames: 0, eyeFrames: 0, browFrames: 0 };
  S.speech = { text: '', secs: 0, curText: '', curSecs: 0 };
  S.chunks = []; if (S.videoUrl) URL.revokeObjectURL(S.videoUrl); S.videoUrl = null;
  if (S.stream && window.MediaRecorder) {
    try { const mime = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(m => MediaRecorder.isTypeSupported?.(m)); S.recorder = new MediaRecorder(S.stream, mime ? { mimeType: mime } : undefined); S.recorder.ondataavailable = e => e.data.size && S.chunks.push(e.data); S.recorder.start(1000); S.recStart = performance.now(); } catch { S.recorder = null; }
  }
  S.screen = 'interview'; render();
}

function renderInterview() {
  const ind = INDUSTRIES[S.industry], cur = S.qa[S.qIndex], probing = S.phase !== 'answer';
  shell(`
  <div class="flex items-center justify-between">
    <p class="text-xs sm:text-sm text-slate-500">Step 3 / 4 · ${t('q')} ${S.qIndex + 1} ${t('of')} ${S.qa.length}${S.drill != null ? ' · drill' : ''}</p>
    <div class="flex gap-1">${S.qa.map((_, i) => `<span class="h-1.5 w-6 sm:w-10 rounded-full ${i < S.qIndex ? 'bg-slate-900' : i === S.qIndex ? 'bg-slate-500' : 'bg-slate-200'}"></span>`).join('')}</div>
  </div>
  <div class="mt-6 grid lg:grid-cols-5 gap-6 lg:gap-8">
    <aside class="order-2 lg:order-1 lg:col-span-2 space-y-4">
      <div class="rounded-xl overflow-hidden border border-slate-200/80 bg-slate-900 aspect-video w-40 sm:w-64 relative">
        <video id="vid" muted playsinline class="w-full h-full object-cover -scale-x-100"></video>
        <span class="absolute top-2 left-2 flex items-center gap-1 text-[11px] text-white/90"><span class="h-2 w-2 rounded-full bg-red-500"></span>REC</span>
      </div>
      <div class="rounded-xl border border-slate-200/80 bg-white p-4 space-y-4 text-sm" id="hud">
        <div class="grid grid-cols-2 gap-3">
          <div><div class="text-slate-500">${t('eye')}</div><div id="h-eye" class="text-xl font-semibold tabular-nums">—</div></div>
          <div><div class="text-slate-500">${t('brow')}</div><div id="h-brow" class="text-xl font-semibold tabular-nums">—</div></div>
        </div>
        <div><div class="flex justify-between text-slate-500"><span>${t('pace')}</span><span>${H.PACE_BAND[S.lang].join('–')} ${H.PACE_UNIT[S.lang]}</span></div>
          <div class="relative mt-2 h-2 rounded-full bg-slate-100"><div class="absolute h-2 bg-emerald-100 rounded-full" style="left:40%;width:30%"></div><div id="h-pace-dot" class="absolute -top-1 h-4 w-1.5 rounded bg-slate-400" style="left:0%"></div></div>
          <div id="h-pace" class="mt-1 text-slate-600 tabular-nums">—</div></div>
        <div><div class="text-slate-500">${t('own')}</div>
          <div class="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden flex"><div id="h-own-i" class="bg-slate-900" style="width:50%"></div><div id="h-own-we" class="bg-amber-400" style="width:50%"></div></div>
          <div id="h-own" class="mt-1 text-slate-600">—</div></div>
        <div><div class="text-slate-500">STAR</div><div class="mt-2 flex gap-2" id="h-star">${['S', 'T', 'A', 'R'].map(k => `<span data-k="${k}" class="h-8 w-8 grid place-items-center rounded-md border border-slate-200 text-slate-400 font-medium">${k}</span>`).join('')}</div></div>
      </div>
    </aside>
    <section class="order-1 lg:order-2 lg:col-span-3 space-y-5">
      <div class="rounded-xl border border-slate-200/80 bg-white p-6">
        <div class="flex items-center gap-3">
          <div class="h-11 w-11 rounded-full bg-slate-800 text-white grid place-items-center font-semibold">${esc(ind.title.en.split(/[ ,]/).filter(Boolean).slice(0, 2).map(w => w[0]).join(''))}</div>
          <div><div class="font-medium">${esc(ind.title[S.lang])}</div><div class="text-xs text-slate-500">${esc(ind.role[S.lang])} · ${engineLabel()}</div></div>
          <span id="speaking" class="ml-auto text-xs text-slate-500 opacity-0 transition">speaking…</span>
        </div>
        <p class="mt-5 text-lg leading-relaxed" data-testid="question">${esc(cur.question)}</p>
        ${probing ? `<div class="mt-5 border-l-2 border-slate-900 pl-4">
          ${S.phase === 'thinking' ? `<p class="text-slate-500 animate-pulse">${t('thinking')}</p>` : `
          <p class="font-medium" data-testid="probe">${esc(cur.probe)}</p>
          <p class="mt-2 text-xs text-amber-700"><span class="font-medium">${t('cue')}:</span> ${esc(cur.cue)}</p>`}
        </div>` : ''}
        <canvas id="wave" class="mt-5 w-full h-10"></canvas>
      </div>
      ${probing && cur.answer ? `<div class="text-sm text-slate-500 rounded-lg bg-slate-100/60 p-3 max-h-24 overflow-auto">${esc(cur.answer)}</div>` : ''}
      <div class="rounded-xl border border-slate-200/80 bg-white p-4">
        <div class="lg:hidden flex flex-wrap items-center gap-x-3 gap-y-1 pb-3 mb-3 border-b border-slate-100 text-xs text-slate-600">
          <span id="m-star" class="flex gap-1">${['S', 'T', 'A', 'R'].map(k => `<span data-k="${k}" class="h-6 w-6 grid place-items-center rounded border border-slate-200 text-slate-400 font-medium">${k}</span>`).join('')}</span>
          <span id="m-pace" class="tabular-nums">${t('pace')}: —</span>
          <span id="m-own" class="tabular-nums"></span>
          <span id="m-eye" class="tabular-nums"></span>
        </div>
        <textarea id="ans" rows="6" class="w-full resize-y outline-none text-base leading-relaxed" placeholder="${t('typeHere')}" ${S.phase === 'thinking' ? 'disabled' : ''}></textarea>
        <div class="flex items-center justify-between pt-3 border-t border-slate-100">
          <button id="mic" class="min-h-11 px-3 py-2 rounded-md border border-slate-300 text-sm ${SR ? '' : 'opacity-40 cursor-not-allowed'}" ${SR ? '' : 'disabled title="' + t('noSpeech') + '"'}>🎙 ${t('mic_off')}</button>
          <button id="submit" class="min-h-11 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-40" ${S.phase === 'thinking' ? 'disabled' : ''}>${S.phase === 'probe' ? t('submitProbe') : t('submit')}</button>
        </div>
      </div>
      <details class="rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-sm"><summary class="cursor-pointer text-slate-600">${t('bench')}</summary><p class="mt-2 text-slate-600">${esc(ind.benchmark[S.lang])}</p></details>
      <details class="rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-sm"><summary class="cursor-pointer text-slate-600">${t('rubric')}</summary><ul class="mt-2 space-y-1 text-slate-600 list-disc pl-5">${RUBRIC[S.lang].map(r => `<li>${esc(r)}</li>`).join('')}</ul></details>
    </section>
  </div>`);
  attachVideo($('#vid')); drawWave($('#wave'));
  if (!cur.t0) cur.t0 = (performance.now() - S.recStart) / 1000;
  const ta = $('#ans');
  let base = '';
  ta.oninput = updateHud;
  $('#mic').onclick = () => {
    if (rec) { stopSpeech(); $('#mic').textContent = '🎙 ' + t('mic_off'); return; }
    base = ta.value;
    startSpeech((txt, fin) => {
      if (fin) { base = (base + (base && S.lang === 'en' ? ' ' : '') + txt).trim(); ta.value = base; }
      else ta.value = base + (txt ? (S.lang === 'en' && base ? ' ' : '') + txt : '');
      updateHud();
    }, on => { $('#mic').textContent = '🎙 ' + (on ? t('mic_on') : t('mic_off')); });
  };
  $('#submit').onclick = submit;
  if (S.phase === 'answer') speak(cur.question);
  if (S.phase === 'probe') speak(cur.probe);
  startTelemetry(); updateHud();
}

let teleTimer;
function startTelemetry() {
  clearInterval(teleTimer);
  teleTimer = setInterval(() => {
    const vid = $('#vid'); if (!vid) return clearInterval(teleTimer);
    const f = S.stream?.getVideoTracks().length ? analyseFrame(vid) : null;
    if (f) { S.tele.frames++; if (f.face) { S.tele.faceFrames++; if (f.eyeContact) S.tele.eyeFrames++; if (f.browTension) S.tele.browFrames++; } }
    updateHud();
  }, 250);
}
const teleSummary = () => S.tele.frames < 8 ? { eye: null, brow: null } : { eye: Math.round(S.tele.eyeFrames / S.tele.frames * 100), brow: Math.round(S.tele.browFrames / Math.max(1, S.tele.faceFrames) * 100) };

function updateHud() {
  const ta = $('#ans'); if (!ta) return;
  const text = ta.value, ts = teleSummary();
  $('#h-eye').textContent = ts.eye != null ? ts.eye + '%' : faceStatus.state === 'loading' || faceStatus.state === 'init' ? (S.lang === 'zh' ? '載入 ' : 'loading ') + faceStatus.pct + '%' : '—';
  $('#h-brow').textContent = ts.brow == null ? '—' : ts.brow + '%';
  const secs = S.speech.curSecs + (rec ? (performance.now() - recT0) / 1000 : 0);
  const p = H.pace(S.speech.curText, secs, S.lang), st = H.paceStatus(p, S.lang), [lo, hi] = H.PACE_BAND[S.lang];
  const dot = $('#h-pace-dot');
  dot.style.left = p == null ? '0%' : Math.min(98, p / (hi * 1.4) * 100) + '%';
  dot.className = 'absolute -top-1 h-4 w-1.5 rounded ' + ({ ok: 'bg-emerald-600', slow: 'bg-amber-500', fast: 'bg-red-500', idle: 'bg-slate-300' })[st];
  $('#h-pace').textContent = p == null ? (S.lang === 'zh' ? '開啟咪高峰以量度' : 'Turn on the mic to measure') : p + ' ' + H.PACE_UNIT[S.lang] + ' · ' + ({ ok: S.lang === 'zh' ? '理想' : 'on pace', slow: S.lang === 'zh' ? '太慢（拖沓）' : 'dragging', fast: S.lang === 'zh' ? '太快（急促）' : 'rushed' })[st];
  const o = H.ownership(text, S.lang);
  const iPct = o.weShare == null ? 50 : Math.round((1 - o.weShare) * 100);
  $('#h-own-i').style.width = iPct + '%'; $('#h-own-we').style.width = (100 - iPct) + '%';
  $('#h-own').textContent = o.weShare == null ? '—' : `${S.lang === 'zh' ? '我' : 'I'} ${o.i} · ${S.lang === 'zh' ? '我們' : 'we'} ${o.we}` + (o.we >= 2 && o.weShare > 0.5 ? (S.lang === 'zh' ? ' — 講清楚你個人做了什麼' : ' — own your specific contribution') : '');
  const s = H.star(text, S.lang);
  app.querySelectorAll('#h-star [data-k]').forEach(el => { el.className = 'h-8 w-8 grid place-items-center rounded-md border font-medium ' + (s[el.dataset.k] ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-400'); });
  app.querySelectorAll('#m-star [data-k]').forEach(el => { el.className = 'h-6 w-6 grid place-items-center rounded border font-medium ' + (s[el.dataset.k] ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-400'); });
  const mp = $('#m-pace');
  if (mp) {
    mp.textContent = t('pace') + ': ' + (p == null ? '—' : p + ' ' + H.PACE_UNIT[S.lang]);
    mp.className = 'tabular-nums ' + ({ ok: 'text-emerald-700', slow: 'text-amber-700', fast: 'text-red-600', idle: '' })[st];
    $('#m-own').textContent = o.weShare == null ? '' : (S.lang === 'zh' ? '我 ' : 'I ') + o.i + ' · ' + (S.lang === 'zh' ? '我們 ' : 'we ') + o.we;
    $('#m-own').className = 'tabular-nums ' + (o.we >= 2 && o.weShare > 0.5 ? 'text-amber-700 font-medium' : '');
    $('#m-eye').textContent = ts.eye == null ? '' : t('eye') + ' ' + ts.eye + '%';
  }
}

function commitSpeech() {
  stopSpeech();
  S.speech.text += S.speech.curText + ' '; S.speech.secs += S.speech.curSecs;
  S.speech.curText = ''; S.speech.curSecs = 0;
}

async function submit() {
  const cur = S.qa[S.qIndex], text = $('#ans').value.trim();
  commitSpeech();
  if (S.phase === 'answer') {
    cur.answer = text; S.phase = 'thinking'; render();
    let pr = null;
    if (aiOn()) {
      try { pr = await llmProbe(settings, ctx(), cur.question, text); if (!H.probeLimitOk(pr.probe, S.lang)) { console.warn('LLM probe over length, using heuristic', pr.probe); pr = null; } }
      catch (e) { console.warn('LLM probe failed, using heuristic', e); }
    } else await new Promise(r => setTimeout(r, 600));
    pr = pr || H.heuristicProbe(text, S.lang);
    Object.assign(cur, { probe: pr.probe, cue: pr.cue, probeSource: pr.source });
    S.phase = 'probe'; render();
  } else if (S.phase === 'probe') {
    cur.probeAnswer = text;
    if (S.qIndex < S.qa.length - 1) { S.qIndex++; S.phase = 'answer'; render(); }
    else finish();
  }
}

// ---------------- 4. report ----------------
async function finish() {
  clearInterval(teleTimer); speechSynthesis?.cancel();
  const recDone = new Promise(res => { if (S.recorder && S.recorder.state !== 'inactive') { S.recorder.onstop = res; S.recorder.stop(); } else res(); });
  S.screen = 'analysing'; render();
  const ts = teleSummary();
  const pace = S.speech.secs >= 5 ? H.pace(S.speech.text, S.speech.secs, S.lang) : null;
  const tele = { ...ts, pace, presence: H.presenceScore({ ...ts, pace }, S.lang) };
  const ind = INDUSTRIES[S.industry];
  let rep = null;
  if (aiOn()) { try { rep = await llmReport(settings, ctx(), S.qa, tele); } catch (e) { console.warn('LLM report failed, using heuristic', e); } }
  rep = rep || H.heuristicReport(S.qa, S.lang, ind.keywords, tele);
  rep.tele = tele; rep.presence = tele.presence;
  rep.total = Math.round(rep.structure.score + rep.commercial.score + rep.impact.score + tele.presence);  // total computed in code
  rep.decision = H.decision(rep.total); rep.percentile = H.cohortPercentile(rep.total);
  await recDone;
  if (S.chunks.length) S.videoUrl = URL.createObjectURL(new Blob(S.chunks, { type: S.chunks[0].type || 'video/webm' }));
  S.report = rep; S.screen = 'report'; render();
}

function renderAnalysing() {
  shell(`<div class="py-32 text-center"><div class="mx-auto h-10 w-10 rounded-full border-2 border-slate-300 border-t-slate-900 animate-spin"></div><p class="mt-6 text-slate-600">${t('analysing')}</p><p class="text-xs text-slate-400 mt-1">${engineLabel()}</p></div>`);
}

function ring(r) {
  const parts = [[r.structure.score, '#0f172a', 'STAR'], [r.commercial.score, '#475569', S.lang === 'zh' ? '商業觸覺' : 'Commercial'], [r.impact.score, '#94a3b8', S.lang === 'zh' ? '量化影響' : 'Impact'], [r.presence, '#f59e0b', S.lang === 'zh' ? '台風' : 'Presence']];
  const R = 70, C = 2 * Math.PI * R; let off = 0;
  const arcs = parts.map(([v, col]) => { const seg = (v / 100) * C; const a = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${col}" stroke-width="16" stroke-dasharray="${seg} ${C - seg}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)"/>`; off += seg; return a; }).join('');
  return { svg: `<svg viewBox="0 0 180 180" class="w-48 h-48"><circle r="${R}" cx="90" cy="90" fill="none" stroke="#f1f5f9" stroke-width="16"/>${arcs}<text x="90" y="88" text-anchor="middle" class="fill-slate-900" font-size="34" font-weight="600" data-testid="total">${r.total}</text><text x="90" y="110" text-anchor="middle" class="fill-slate-400" font-size="12">/ 100</text></svg>`, parts };
}

function renderReport() {
  const r = S.report, { svg, parts } = ring(r);
  const decCol = { 'Strong Hire': 'bg-emerald-600', Hire: 'bg-emerald-500', 'Lean Hire': 'bg-amber-500', 'No Hire': 'bg-red-600' }[r.decision];
  const weakest = r.questionScores.indexOf(Math.min(...r.questionScores));
  const pillar = (label, p, max = 25) => `<div class="rounded-xl border border-slate-200/80 bg-white p-4"><div class="flex justify-between text-sm"><span class="text-slate-600">${label}</span><span class="font-semibold tabular-nums">${p.score}/${max}</span></div><div class="mt-2 h-1.5 bg-slate-100 rounded-full"><div class="h-1.5 bg-slate-900 rounded-full" style="width:${p.score / max * 100}%"></div></div><p class="mt-3 text-sm text-slate-600">${esc(p.comment)}</p></div>`;
  shell(`
  <p class="text-sm text-slate-500">Step 4 / 4 · ${r.source === 'llm' ? engineLabel() : t('engineOff')}</p>
  <section class="mt-4 grid md:grid-cols-3 gap-6 items-center rounded-2xl border border-slate-200/80 bg-white p-6">
    <div class="flex justify-center">${svg}</div>
    <div class="space-y-3">
      <div class="text-sm text-slate-500">${t('decision')}</div>
      <div><span class="inline-block px-3 py-1 rounded-full text-white font-medium ${decCol}" data-testid="decision">${r.decision}</span></div>
      <div class="text-sm text-slate-500 pt-2">${t('percentile')}</div><div class="text-2xl font-semibold">P${r.percentile}</div>
    </div>
    <ul class="space-y-2 text-sm">${parts.map(([v, c, l]) => `<li class="flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-sm" style="background:${c}"></span><span class="text-slate-600 flex-1">${l}</span><span class="tabular-nums font-medium">${v}/25</span></li>`).join('')}</ul>
  </section>
  <section class="mt-6 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
    ${pillar('STAR', r.structure)}${pillar(S.lang === 'zh' ? '商業觸覺' : 'Commercial acumen', r.commercial)}${pillar(S.lang === 'zh' ? '量化影響' : 'Quantifiable impact', r.impact)}${pillar(S.lang === 'zh' ? '台風 / 表現' : 'Executive presence', { score: r.presence, comment: r.presenceComment })}
  </section>
  <section class="mt-6 rounded-xl border border-slate-200/80 bg-white p-5">
    <h3 class="font-medium">${t('perQ')}</h3>
    <div class="mt-3 space-y-2" data-testid="qscores">${S.qa.map((q, i) => `<div class="flex items-center gap-3 text-sm"><span class="w-6 text-slate-500">Q${i + 1}</span><span class="flex-1 min-w-0 truncate text-slate-600">${esc(q.question)}</span><div class="w-20 sm:w-40 shrink-0 h-1.5 bg-slate-100 rounded-full"><div class="h-1.5 rounded-full ${i === weakest ? 'bg-amber-500' : 'bg-slate-900'}" style="width:${r.questionScores[i]}%"></div></div><span class="w-10 text-right tabular-nums">${r.questionScores[i]}</span></div>`).join('')}</div>
  </section>
  <section class="mt-6 grid md:grid-cols-2 gap-6">
    <div class="rounded-xl border border-slate-200/80 bg-white p-5"><h3 class="font-medium">${t('strengths')}</h3>
      <ul class="mt-3 space-y-4">${(r.strengths.length ? r.strengths : [{ title: '—', quote: '' }]).map(s => `<li><div class="text-sm font-medium">${esc(s.title)}</div>${s.quote ? `<blockquote class="mt-1 text-sm text-slate-600 border-l-2 border-emerald-500 pl-3">“${esc(s.quote)}”</blockquote>` : ''}</li>`).join('')}</ul></div>
    <div class="rounded-xl border border-slate-200/80 bg-white p-5"><h3 class="font-medium">${t('improvements')}</h3>
      <ul class="mt-3 space-y-4">${r.improvements.map(s => `<li><div class="text-sm font-medium">${esc(s.title)}</div><p class="mt-1 text-sm text-slate-600">${esc(s.detail)}</p></li>`).join('')}</ul></div>
  </section>
  <section class="mt-6 rounded-xl border border-slate-200/80 bg-white p-5"><h3 class="font-medium">${t('rewrite')}</h3>
    <div class="mt-3 grid md:grid-cols-2 gap-4 text-sm">
      <div class="rounded-lg bg-red-50/60 p-4"><div class="text-xs text-red-700 font-medium">${t('before')}</div><p class="mt-1 text-slate-700">${esc(r.rewrite.before) || '—'}</p></div>
      <div class="rounded-lg bg-emerald-50/60 p-4"><div class="text-xs text-emerald-700 font-medium">${t('after')}</div><p class="mt-1 text-slate-700">${esc(r.rewrite.after)}</p></div>
    </div><p class="mt-3 text-sm text-slate-500">${esc(r.rewrite.note)}</p>
    ${r.source === 'llm' ? `<p class="mt-2 text-xs text-amber-700" data-testid="ai-figures">${S.lang === 'zh' ? 'AI 改寫內的數字只作示範，使用前請換上你的真實數據。' : 'Figures in the AI rewrite are illustrative. Replace them with your real numbers.'}</p>` : ''}
  </section>
  <section class="mt-6 rounded-xl border border-slate-200/80 bg-white p-5"><h3 class="font-medium">${t('replay')}</h3>
    ${S.videoUrl ? `<video id="replay" src="${S.videoUrl}" controls class="mt-3 w-full max-w-xl rounded-lg bg-slate-900"></video>
      <div class="mt-3 flex gap-2">${S.qa.map((q, i) => `<button data-seek="${q.t0}" class="text-sm px-3 py-1 rounded-md border border-slate-300">Q${i + 1}</button>`).join('')}</div>` : `<p class="mt-2 text-sm text-slate-500">${S.lang === 'zh' ? '未有錄影（沒有鏡頭／咪高峰權限）。' : 'No recording (camera/mic not available).'}</p>`}
  </section>
  <div class="mt-8 flex flex-wrap gap-3">
    <button id="drill" class="px-5 py-2.5 rounded-lg bg-slate-900 text-white">${t('drill')} (Q${weakest + 1})</button>
    <button id="restart" class="px-5 py-2.5 rounded-lg border border-slate-300">${t('restart')}</button>
  </div>`);
  app.querySelectorAll('[data-seek]').forEach(b => b.onclick = () => { const v = $('#replay'); v.currentTime = +b.dataset.seek; v.play(); });
  $('#drill').onclick = () => startInterview([S.qa[weakest].question], weakest);
  $('#restart').onclick = () => { S.screen = 'picker'; render(); };
}

function renderFaceProgress() {
  const bar = $('#face-bar'); if (!bar) return;
  const st = faceStatus.state, zh = S.lang === 'zh';
  bar.style.width = (st === 'ready' ? 100 : faceStatus.pct) + '%';
  bar.className = 'h-1.5 transition-all ' + (st === 'failed' ? 'bg-amber-500' : st === 'ready' ? 'bg-emerald-600' : 'bg-slate-900');
  $('#face-note').textContent = st === 'ready' ? (zh ? '面部分析已啟用' : 'Face analysis ready')
    : st === 'failed' ? (zh ? '面部分析不可用，其他功能照常' : 'Face analysis unavailable; everything else works')
    : st === 'init' ? (zh ? '正在初始化模型…' : 'Initialising model…')
    : (zh ? `下載面部分析模型 ${faceStatus.mb.toFixed(1)} / ${faceStatus.totalMb.toFixed(1)} MB（可選，可直接開始面試）` : `Downloading face model ${faceStatus.mb.toFixed(1)} / ${faceStatus.totalMb.toFixed(1)} MB (optional — you can start now)`);
  if (st === 'ready') setTimeout(() => $('#face-prog')?.classList.add('hidden'), 1500);
}

window.__aip = S;   // exposed for end-to-end tests
window.__face = faceStatus;
render();
// Prefetch the face model while the user is on the picker, unless the browser asks to save data.
const whenIdle = cb => window.requestIdleCallback ? window.requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 300);
if (!navigator.connection?.saveData) whenIdle(() => loadFace());
