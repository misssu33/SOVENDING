/* =========================================================
   쇼츠자판기 · Shorts Vending — app.js
   순수 브라우저 JS(외부 라이브러리 0). 단일 index.html로 인라인 빌드된다.
   구성: 0 키관리/Gemini · 1 링크·업로드·분석 · 2 레퍼런스/장바구니
        3 대본/음성 · 4 장면/미리보기/WebM · 5 제목/썸네일
        6 업로드 문구 허브 · 7 쿠팡 파트너스
   ========================================================= */
(function () {
  'use strict';

  /* ---------------- utils ---------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const pad = n => String(n).padStart(2, '0');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtTime = t => { t = Math.max(0, t || 0); const m = Math.floor(t / 60); const s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };
  const fmtNum = n => n >= 1e8 ? (n / 1e8).toFixed(1).replace(/\.0$/, '') + '억' : n >= 1e4 ? (n / 1e4).toFixed(1).replace(/\.0$/, '') + '만' : String(Math.round(n));
  const uid = (p => () => p + (++uidN).toString(36) + Date.now().toString(36).slice(-3))( 'i');
  let uidN = 0;

  function hash32(str) {
    let h = 2166136261 >>> 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function toast(msg, kind) {
    const t = $('#toast'); if (!t) return;
    $('#toastMsg').textContent = msg;
    t.className = 'show ' + (kind || '');
    t.querySelector('.ico').textContent = kind === 'bad' ? '⚠️' : kind === 'good' ? '✅' : 'ℹ️';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.className = ''; }, 3200);
  }

  const LS = {
    keys: 'sv.keys.v1', preset: 'sv.preset.v1', coupang: 'sv.coupang.v1',
    hist: 'sv.hist.v1', mode: 'sv.mode.v1', work: 'sv.work.v1',
    accounts: 'sv.accounts.v1', famous: 'sv.famous.v1', multi: 'sv.multi.v1', trend: 'sv.trend.v1'
  };
  function lsGet(key, fb) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fb; } catch (e) { return fb; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); flashSaved(); return true; } catch (e) { return false; }
  }
  let savedT = null;
  function flashSaved() {
    const s = $('#statusSave'); if (!s) return;
    s.classList.remove('off'); s.innerHTML = '<i></i>자동 저장됨';
    clearTimeout(savedT); savedT = setTimeout(() => { s.innerHTML = '<i></i>자동 저장'; s.classList.add('off'); }, 1600);
  }

  /* ---------------- state ---------------- */
  const state = {
    view: 'perf',
    step: -1,
    demo: true,
    keys: [],          // {id, value, status:'empty'|'waiting'|'active'|'exhausted', used, note}
    activeKey: null,
    links: [],         // {id, url, platform, title}
    files: [],         // {id, name, size, url, duration, w, h, el, poster, objectUrl}
    mainId: null,
    platforms: ['tiktok', 'xiaohongshu', 'instagram', 'youtube'],
    product: null,
    refs: [],
    script: null,
    voice: null,
    voiceGap: 0.15,
    scenes: [],
    accounts: { yt: false, tiktok: false, instagram: false, threads: false, facebook: false, coupang: false },
    famous: {
      layout: 'full', noThumb: false, sources: ['tiktok', 'youtube', 'instagram'],
      aiMark: true, topN: true, topPos: 'tl', topCount: 5,
      tz: 'Asia/Seoul', perDay: 10, random: true,
      title: '', caption: '', pick: null,
      accounts: [
        { id: 'fa1', name: '메인 계정', time: '12:00' },
        { id: 'fa2', name: '서브 계정', time: '19:30' }
      ]
    },
    multi: { links: [] },
    eraser: { fileId: '', t: 0, x: 18, y: 58, w: 64, h: 18, mode: 'blur', strength: 18 },
    stt: { file: null, url: '', mime: '', video: false, dur: 0, lang: 'auto', format: 'text', text: '', segments: [], sample: false, busy: false, error: '' },
    trend: { videos: [], sort: 'score', filter: 'all', platform: 'all', pickId: '', bench: null, benchDemo: false, benchAt: 0 },
    subTl: null,
    activity: [],
    style: {
      blurOn: true, blurMode: 'blur', blurY: 55, blurH: 18, blurStrength: 18,
      titleOn: true, highlightOn: true,
      capSize: 32, capY: 78, capFont: 'sans', capColor: '#ffffff', capStroke: '#000000',
      capMotion: 'outline-basic', smartPlace: false,
      bgm: 'upbeat', bgmVol: 18, ad: 'ad'
    },
    titles: null,
    hub: { confirm: true },
    coupang: { access: '', secret: '', auto: true, base: 'https://link.coupang.com/a/', disclosure: true },
    history: [],
    lastAnalyzedAt: 0,
    exported: 0
  };

  /* ---------------- keys / settings ---------------- */
  const STATUS_LABEL = { empty: '비어 있음', waiting: '대기', active: '활성', exhausted: '한도초과' };
  const STATUS_CLASS = { empty: '', waiting: '', active: 'live', exhausted: 'danger' };

  function newKeySlot() { return { id: uid('k'), value: '', status: 'empty', used: 0, note: '' }; }
  function realKeys() { return state.keys.filter(k => k.value); }
  function usableKeys() { return state.keys.filter(k => k.value && k.status !== 'exhausted'); }

  function loadKeys() {
    const saved = lsGet(LS.keys, null);
    if (saved && Array.isArray(saved.keys) && saved.keys.length) {
      state.keys = saved.keys.slice(0, 5).map(k => ({
        id: k.id || uid('k'), value: k.value || '',
        status: k.value ? (k.status === 'active' ? 'waiting' : (k.status || 'waiting')) : 'empty',
        used: k.used || 0, note: k.note || ''
      }));
      if (saved.day !== new Date().toDateString()) {
        state.keys.forEach(k => { if (k.status === 'exhausted') { k.status = 'waiting'; k.note = ''; } });
      }
    }
    if (!state.keys.length) state.keys = [newKeySlot()];
    const mode = lsGet(LS.mode, null);
    state.demo = mode === null ? !realKeys().length : !!mode.demo;
  }
  function saveKeys() {
    const payload = { keys: state.keys, day: new Date().toDateString() };
    try { localStorage.setItem(LS.keys, JSON.stringify(payload)); } catch (e) {}
    lsSet(LS.mode, { demo: state.demo });
  }
  function maskKey(v) { return v ? v.slice(0, 4) + '••••••••' + v.slice(-4) : ''; }

  function keyStateBadge(k) {
    const cls = STATUS_CLASS[k.status] || '';
    return '<span class="badge ' + cls + '">' + (STATUS_LABEL[k.status] || '대기') + '</span>';
  }

  function renderKeys() {
    // modal rows
    const wrap = $('#keyRows'); if (!wrap) return;
    wrap.innerHTML = state.keys.map((k, i) => {
      return '<div class="key-row ' + (k.status === 'active' ? 'used' : k.status === 'exhausted' ? 'exhausted' : '') + '" data-key-row="' + i + '">' +
        '<span class="idx">' + (i + 1) + '</span>' +
        '<input type="password" data-key-input="' + i + '" value="' + esc(k.value) + '" placeholder="AIza... Gemini API 키" spellcheck="false" autocomplete="off" aria-label="' + (i + 1) + '번 키">' +
        '<span class="key-state">' + keyStateBadge(k) + '</span>' +
        '<span class="acts">' +
        '<button class="btn xs ghost" type="button" data-key-reveal="' + i + '" title="키 보기">👁</button>' +
        '<button class="btn xs danger" type="button" data-key-del="' + i + '" title="삭제">✕</button>' +
        '</span></div>';
    }).join('');
    // step 0 summary
    const sum = $('#keySummaryList');
    if (sum) {
      sum.innerHTML = state.keys.map((k, i) =>
        '<div class="kv"><span>' + (i + 1) + '번 키 <span class="mono" style="font-size:9.5px;color:var(--dim)">' + (k.value ? esc(maskKey(k.value)) : '미등록') + '</span></span>' + keyStateBadge(k) + '</div>'
      ).join('') + '<div class="kv"><span>사용 가능</span><b>' + usableKeys().length + ' / ' + state.keys.length + '</b></div>';
    }
    const nb = realKeys().length;
    ['#keyBadge', '#keyBadge2', '#keyBadge3'].forEach(s => { const el = $(s); if (el) el.textContent = '키 ' + nb + '/5'; });
    const sk = $('#statusKeys'); if (sk) { sk.classList.toggle('off', !nb); sk.innerHTML = '<i></i>Gemini 키 ' + nb + '/5'; }
    updateModeUI();
  }

  function updateModeUI() {
    const counts = realKeys().length;
    const live = !state.demo && counts > 0;
    const mb = $('#modeBadge');
    if (mb) {
      mb.className = 'badge ' + (live ? 'live' : 'demo');
      mb.innerHTML = '<span class="dot"></span>' + (live ? 'AI 연결됨' : '데모 모드') + ' · 키 ' + counts + '/5';
    }
    const lb = $('#loginBadge');
    if (lb) { const n = loginCount(); lb.className = 'badge ' + (n ? 'blue' : ''); lb.innerHTML = '<span class="dot"></span>로그인 ' + n + '/6'; }
    $$('.js-demo-toggle').forEach(el => { if (el.checked !== !!state.demo) el.checked = !!state.demo; });
    const sm = $('#statusMode');
    if (sm) sm.innerHTML = '<i></i><b>' + (live ? 'Gemini 연결' : '데모 모드') + '</b> · ' + (live ? 'API 키 ' + counts + '개' : '모든 기능 로컬 실행');
    $$('[data-mode-label]').forEach(el => { el.textContent = live ? 'Gemini' : '데모'; });
    const sb = $('#scriptModeBadge'); if (sb) sb.textContent = live ? 'Gemini' : '데모';
    const tb = $('#titleModeBadge'); if (tb) tb.textContent = live ? 'Gemini' : '데모';
    const pdb = $('#prodDemoBadge'); if (pdb) pdb.textContent = (state.product && state.product.demo) ? '데모 분석' : 'AI 분석';
  }

  /* ---------------- 로그인 계정 (표시용) ---------------- */
  const ACCOUNTS = [
    { id: 'yt', name: 'YouTube', ico: '▶️' },
    { id: 'tiktok', name: 'TikTok', ico: '🎵' },
    { id: 'instagram', name: 'Instagram', ico: '📸' },
    { id: 'threads', name: 'Threads', ico: '🧵' },
    { id: 'facebook', name: 'Facebook', ico: '📘' },
    { id: 'coupang', name: '쿠팡 파트너스', ico: '🏷️' }
  ];
  function loginCount() { return ACCOUNTS.filter(a => state.accounts[a.id]).length; }
  function loadAccounts() {
    const saved = lsGet(LS.accounts, null);
    if (saved && typeof saved === 'object') ACCOUNTS.forEach(a => { if (saved[a.id] != null) state.accounts[a.id] = !!saved[a.id]; });
  }
  function saveAccounts() { lsSet(LS.accounts, state.accounts); updateModeUI(); }
  function renderAccounts() {
    const wrap = $('#acctList'); if (!wrap) return;
    wrap.innerHTML = ACCOUNTS.map(a =>
      '<label class="acct ' + (state.accounts[a.id] ? 'on' : '') + '"><input type="checkbox" data-acct="' + a.id + '" ' + (state.accounts[a.id] ? 'checked' : '') + ' aria-label="' + esc(a.name) + ' 로그인"><span>' + a.ico + ' ' + esc(a.name) + '</span></label>').join('');
    const b = $('#acctBadge'); if (b) b.textContent = loginCount() + '/6';
    updateModeUI();
  }

  function openSettings() {
    const m = $('#settingsModal'); if (!m) return;    m.hidden = false;
    renderKeys();
    setTimeout(() => { const first = $('#keyRows input'); if (first) first.focus(); }, 40);
  }
  function closeSettings() { const m = $('#settingsModal'); if (m) m.hidden = true; }

  function readKeyInputs() {
    const vals = $$('#keyRows [data-key-input]').map(inp => inp.value.trim());
    // merge: keep existing slot ids/status; new values become waiting
    const next = [];
    vals.forEach((v, i) => {
      const old = state.keys[i] || newKeySlot();
      if (!v) { next.push({ id: old.id, value: '', status: 'empty', used: old.used || 0, note: '' }); return; }
      const changed = v !== old.value;
      next.push({ id: old.id, value: v, status: changed ? 'waiting' : (old.status === 'active' ? 'active' : old.status || 'waiting'), used: old.used || 0, note: changed ? '' : old.note || '' });
    });
    return next;
  }

  function saveKeysFromModal() {
    const prev = realKeys().length;
    state.keys = readKeyInputs().slice(0, 5);
    if (!state.keys.length) state.keys = [newKeySlot()];
    // de-dupe identical keys, keep first
    const seen = new Set();
    state.keys.forEach(k => { if (k.value) { if (seen.has(k.value)) { k.status = 'waiting'; k.note = '중복 키'; } seen.add(k.value); } });
    if (!prev && realKeys().length) state.demo = false;   // 키를 처음 넣으면 바로 Gemini 모드
    if (!realKeys().length) state.demo = true;            // 키를 모두 지우면 데모로
    saveKeys(); renderKeys(); closeSettings();
    toast(realKeys().length ? '키 ' + realKeys().length + '개를 저장했습니다' + (prev ? '' : ' · 이제 Gemini로 동작합니다') : '저장했습니다. 키가 없으면 데모 모드로 동작합니다', 'good');
  }

  async function testKeys(btn) {
    const out = $('#testOut'), res = $('#testResult');
    const res2 = $('#testResult2'), out2 = $('#keyTestOut');
    const set = (txt, cls) => {
      if (res) { res.textContent = txt; res.className = 'badge ' + (cls || ''); }
      if (res2) { res2.textContent = txt; res2.className = 'badge ' + (cls || ''); }
      if (out && txt.length < 120) out.textContent = txt;
      if (out2) out2.textContent = txt;
    };
    if (!realKeys().length) { set('키 없음 · 데모 모드 사용', 'demo'); toast('먼저 ⚙️ 설정에서 키를 저장하세요', 'bad'); return; }
    if (btn) { btn.disabled = true; btn.dataset.old = btn.textContent; btn.innerHTML = '<span class="spin"></span> 테스트 중'; }
    set('테스트 중…', '');
    try {
      const before = usableKeys().map(k => k.id);
      const data = await geminiCall('gemini-2.5-flash', {
        contents: [{ parts: [{ text: 'Reply with exactly one word: OK' }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8 }
      }, { timeout: 20000, tag: 'test' });
      const txt = geminiText(data) || '(빈 응답)';
      const active = state.keys.find(k => k.value && k.status === 'active');
      set('연결 성공 · ' + (active ? state.keys.indexOf(active) + 1 : '?') + '번 키 · "' + txt.slice(0, 30) + '"', 'live');
      const failed = state.keys.filter(k => k.status === 'exhausted').length;
      toast('연결 성공' + (failed ? ' · 한도 초과 ' + failed + '개는 건너뜀' : ''), 'good');
    } catch (e) {
      set(errMsg(e), 'danger');
      toast(errMsg(e), 'bad');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.old || '연결 테스트'; }
    }
  }

  function errMsg(e) {
    if (!e) return '알 수 없는 오류';
    if (e.code === 'no_key') return '사용 가능한 키가 없습니다. 설정에서 키를 추가하세요.';
    if (e.code === 'all_exhausted') return '모든 키가 한도 초과입니다. 내일 다시 시도하거나 데모 모드를 쓰세요.';
    if (e.name === 'AbortError') return '요청 시간 초과';
    return String(e.message || e).slice(0, 160);
  }

  /* ---------------- Gemini API (자동 전환) ---------------- */
  const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

  async function geminiCall(model, body, opts) {
    opts = opts || {};
    const cands = usableKeys();
    if (!cands.length) {
      const e = new Error('사용 가능한 Gemini 키가 없습니다');
      e.code = realKeys().length ? 'all_exhausted' : 'no_key';
      throw e;
    }
    let last = null;
    for (let i = 0; i < cands.length; i++) {
      const k = cands[i];
      const url = GEMINI_BASE + '/models/' + model + ':generateContent?key=' + encodeURIComponent(k.value);
      const ctrl = new AbortController();
      const timer = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, opts.timeout || 45000);
      try {
        const res = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: ctrl.signal
        });
        clearTimeout(timer);
        if (res.status === 404) {
          const err = new Error('Gemini 모델을 찾을 수 없습니다: ' + model);
          err.code = 'model';
          throw err;
        }
        if (res.status === 400) {
          const txt = await res.text().catch(() => '');
          if (/RESOURCE_EXHAUSTED|quota|exceeded/i.test(txt)) {
            k.status = 'exhausted'; k.note = '한도 초과(400)';
            saveKeys(); renderKeys();
            const nxt = cands[i + 1];
            if (nxt) toast((state.keys.indexOf(k) + 1) + '번 키 한도 초과 → ' + (state.keys.indexOf(nxt) + 1) + '번 키로 자동 전환', 'bad');
            last = new Error('Gemini 400 · 한도 초과');
            last.code = 'quota';
            continue;
          }
          const err2 = new Error('Gemini 400 · ' + txt.slice(0, 140));
          err2.code = 'http';
          throw err2;
        }
        if (res.status === 429 || res.status === 401 || res.status === 403) {
          const before = state.keys.findIndex(x => x.status === 'active');
          k.status = 'exhausted';
          k.note = res.status === 429 ? '한도 초과(429)' : '키 거부(' + res.status + ')';
          state.lastFailover = { from: k.id, code: res.status, at: Date.now(), toIndex: state.keys.indexOf(cands[i + 1]) };
          saveKeys(); renderKeys();
          const nxt = cands[i + 1];
          if (nxt) toast((state.keys.indexOf(k) + 1) + '번 키 ' + (res.status === 429 ? '한도 초과' : '거부') + ' → ' + (state.keys.indexOf(nxt) + 1) + '번 키로 자동 전환', 'bad');
          last = new Error('Gemini ' + res.status + ' · 키 한도/거부');
          last.code = 'quota';
          continue;
        }
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          const err = new Error('Gemini ' + res.status + (txt ? ' · ' + txt.slice(0, 140) : ''));
          err.code = 'http';
          throw err;
        }
        const data = await res.json();
        k.status = 'active'; k.used = (k.used || 0) + 1; k.note = '';
        state.activeKey = k.id;
        saveKeys(); renderKeys();
        return data;
      } catch (e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') { last = e; continue; }
        if (e.code === 'quota') { last = e; continue; }
        throw e;
      }
    }
    const err = new Error('모든 키가 한도 초과입니다');
    err.code = 'all_exhausted'; err.last = last;
    if (last && /429|401|403/.test(last.message || '')) { /* fallthrough */ }
    throw err;
  }

  function geminiText(data) {
    const c = data && data.candidates && data.candidates[0];
    if (!c) return '';
    return ((c.content && c.content.parts) || []).map(p => p.text || '').join('').trim();
  }

  function parseJSONLoose(text) {
    if (!text) throw new Error('빈 응답');
    let t = String(text).trim();
    t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
    try { return JSON.parse(t); } catch (e) {
      const a2 = text.indexOf('['), b2 = text.lastIndexOf(']');
      if (a2 >= 0 && b2 > a2) return JSON.parse(text.slice(a2, b2 + 1));
      throw new Error('JSON 해석 실패: ' + String(text).slice(0, 80));
    }
  }

  const TEXT_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

  async function geminiJSON(prompt, opts) {
    let last = null;
    for (const model of TEXT_MODELS) {
      try {
        const data = await geminiCall(model, {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: opts && opts.temp != null ? opts.temp : 0.8, responseMimeType: 'application/json', maxOutputTokens: (opts && opts.maxTokens) || 2048 }
        }, opts);
        const text = geminiText(data);
        if (!text) throw new Error('Gemini 응답이 비어 있습니다');
        return parseJSONLoose(text);
      } catch (e) {
        if (e.code === 'model') { last = e; continue; }   // 모델이 없으면 다음 모델로
        throw e;
      }
    }
    throw last || new Error('사용 가능한 Gemini 텍스트 모델이 없습니다');
  }

  async function withDemoFallback(realFn, demoFn, label) {
    if (!state.demo && realKeys().length) {
      try { return await realFn(); }
      catch (e) {
        const msg = errMsg(e);
        toast(label + ' 실패(' + msg + ') → 데모 결과로 이어갑니다', 'bad');
        await new Promise(r => setTimeout(r, 250));
        const out = demoFn();
        out.__fallback = msg;
        return out;
      }
    }
    await new Promise(r => setTimeout(r, 180));
    return demoFn();
  }

  /* ---------------- platform helpers ---------------- */
  const PLATFORMS = {
    tiktok: { name: '틱톡', icon: '🎵', color: '#25f4ee' },
    xiaohongshu: { name: '샤오홍슈', icon: '📕', color: '#ff2442' },
    instagram: { name: '인스타그램', icon: '📸', color: '#e1306c' },
    youtube: { name: '유튜브', icon: '▶️', color: '#ff0033' },
    douyin: { name: '더우인', icon: '🎶', color: '#fe2c55' },
    file: { name: '내 영상', icon: '🎬', color: '#2fe3b0' },
    youtubeShorts: { name: 'YouTube Shorts', icon: '▶️', color: '#ff0033' },
    threads: { name: 'Threads', icon: '🧵', color: '#aaa' },
    facebook: { name: 'Facebook', icon: '📘', color: '#1877f2' }
  };
  function platformOf(url) {
    const u = String(url || '').toLowerCase();
    if (u.includes('tiktok')) return 'tiktok';
    if (u.includes('xiaohongshu') || u.includes('xhslink') || u.includes('xhs.')) return 'xiaohongshu';
    if (u.includes('instagram')) return 'instagram';
    if (u.includes('youtu')) return 'youtube';
    if (u.includes('douyin')) return 'douyin';
    return 'tiktok';
  }
  function platformBadge(pf) {
    const p = PLATFORMS[pf] || PLATFORMS.tiktok;
    return '<span class="badge pf">' + p.icon + ' ' + p.name + '</span>';
  }

  /* ---------------- step 1: links / files ---------------- */
  const MAX_LINKS = 12;
  function parseLinks(text) {
    const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const out = [];
    const seen = new Set();
    for (const line of lines) {
      const m = line.match(/https?:\/\/[^\s"'<>]+/i);
      if (!m) continue;
      let url = m[0].replace(/[),.;]+$/, '');
      if (seen.has(url)) continue;
      seen.add(url);
      out.push(url);
      if (out.length >= MAX_LINKS) break;
    }
    return out;
  }
  function linkTitle(url, pf) {
    try {
      const u = new URL(url);
      const seg = u.pathname.split('/').filter(Boolean);
      const handle = seg.find(s => s.startsWith('@'));
      if (pf === 'youtube' && seg.length) return 'youtube.com/' + seg[0];
      if (handle) return handle + (seg[seg.length - 1] && seg[seg.length - 1] !== handle ? ' · ' + seg[seg.length - 1].slice(0, 12) : '');
      return u.hostname.replace('www.', '') + '/' + (seg[0] || '');
    } catch (e) { return url.slice(0, 48); }
  }
  function syncLinks() {
    const urls = parseLinks($('#linkInput').value);
    const prev = state.links;
    state.links = urls.map((u, i) => {
      const old = prev.find(x => x.url === u);
      return old || { id: uid('l'), url: u, platform: platformOf(u), title: linkTitle(u, platformOf(u)) };
    });
    const cnt = $('#linkCount');
    const rawLines = String($('#linkInput').value || '').split(/\r?\n/).filter(s => s.trim());
    if (cnt) { cnt.textContent = state.links.length + '/' + MAX_LINKS; cnt.classList.toggle('over', rawLines.length > MAX_LINKS); }
    if (state.mainId && !getItems().some(it => it.id === state.mainId)) state.mainId = null;
    if (!state.mainId && state.links.length) state.mainId = state.links[0].id;
    if (!state.mainId && state.files.length) state.mainId = state.files[0].id;
    renderLinks(); renderFiles(); updateAnalyzeHint();
  }

  function getItems() {
    return state.links.map(l => ({ id: l.id, kind: 'link', title: l.title, platform: l.platform, url: l.url }))
      .concat(state.files.map(f => ({ id: f.id, kind: 'file', title: f.name, platform: 'file', url: f.url, duration: f.duration })));
  }
  function mainItem() { return getItems().find(i => i.id === state.mainId) || getItems()[0] || null; }

  function renderLinks() {
    const wrap = $('#linkList'); if (!wrap) return;
    if (!state.links.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = state.links.map((l, i) =>
      '<div class="link-item ' + (l.id === state.mainId ? 'is-main' : '') + '" data-link="' + l.id + '">' +
      '<span class="idx">' + (i + 1) + '</span>' +
      '<span class="meta"><b>' + esc(l.title) + '</b><span>' + esc(l.url) + '</span></span>' +
      platformBadge(l.platform) +
      (l.id === state.mainId ? '<span class="badge acc">대표</span>' : '<button class="btn xs ghost" type="button" data-main="' + l.id + '">대표로</button>') +
      '<span class="acts"><button class="btn xs danger" type="button" data-unlink="' + l.id + '" title="빼기">✕</button></span>' +
      '</div>').join('');
  }

  function renderFiles() {
    const wrap = $('#fileList'); if (!wrap) return;
    if (!state.files.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = state.files.map(f =>
      '<div class="file-item" data-file="' + f.id + '">' +
      (f.poster ? '<img src="' + f.poster + '" alt="" style="width:38px;height:48px;object-fit:cover;border-radius:5px;background:#000;flex:none">' : '<div style="width:38px;height:48px;border-radius:5px;background:#182434;display:grid;place-items:center;flex:none">🎬</div>') +
      '<span class="meta"><b>' + esc(f.name) + '</b><span>' + fmtTime(f.duration) + ' · ' + (f.w || '?') + '×' + (f.h || '?') + ' · ' + (f.size / 1048576).toFixed(1) + 'MB</span></span>' +
      (f.id === state.mainId ? '<span class="badge acc">대표</span>' : '<button class="btn xs ghost" type="button" data-main="' + f.id + '">대표로</button>') +
      '<button class="btn xs danger" type="button" data-unfile="' + f.id + '" title="빼기">✕</button>' +
      '</div>').join('');
  }

  function setMain(id) {
    state.mainId = id;
    renderLinks(); renderFiles(); updateAnalyzeHint();
    const it = mainItem();
    toast('대표 영상: ' + (it ? it.title : '없음'), 'good');
  }

  function removeLink(id) {
    state.links = state.links.filter(l => l.id !== id);
    if (state.mainId === id) state.mainId = null;
    const box = $('#linkInput');
    box.value = state.links.map(l => l.url).join('\n');
    syncLinks();
  }

  function removeFile(id) {
    const f = state.files.find(x => x.id === id);
    if (f) {
      if (f.el) { try { f.el.pause(); f.el.removeAttribute('src'); f.el.load(); f.el.remove(); } catch (e) {} }
      if (f.objectUrl) { try { URL.revokeObjectURL(f.objectUrl); } catch (e) {} }
    }
    state.files = state.files.filter(x => x.id !== id);
    if (state.mainId === id) state.mainId = null;
    syncLinks(); updateAnalyzeHint();
  }

  function updateAnalyzeHint() {
    const n = getItems().length;
    const h = $('#analyzeHint');
    if (h) h.textContent = n ? ('대표 영상: ' + (mainItem() ? mainItem().title : '-') + ' · 전체 ' + n + '개') : '대표 영상 1개 이상(링크 또는 내 영상)이 필요합니다.';
    const b = $('#btnAnalyze'); if (b) b.disabled = n === 0;
  }

  let videoPool = null;
  function getVideoPool() {
    if (!videoPool) {
      videoPool = document.createElement('div');
      videoPool.id = 'videoPool';
      videoPool.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none';
      document.body.appendChild(videoPool);
    }
    return videoPool;
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []).filter(f => /^video\//.test(f.type) || /\.(mp4|webm|mov|m4v)$/i.test(f.name));
    if (!files.length) { toast('MP4/WebM 영상 파일을 선택해 주세요', 'bad'); return; }
    for (const file of files) {
      const id = uid('f');
      const url = URL.createObjectURL(file);
      const el = document.createElement('video');
      el.muted = true; el.playsInline = true; el.preload = 'auto'; el.src = url;
      el.setAttribute('crossorigin', 'anonymous');
      getVideoPool().appendChild(el);
      const meta = await new Promise(resolve => {
        let done = false;
        const finish = () => { if (done) return; done = true; resolve({ duration: isFinite(el.duration) ? el.duration : 0, w: el.videoWidth || 0, h: el.videoHeight || 0 }); };
        el.addEventListener('loadedmetadata', finish, { once: true });
        el.addEventListener('error', finish, { once: true });
        setTimeout(finish, 4000);
      });
      let poster = '';
      try {
        if (meta.w) {
          await new Promise(res => { if (el.readyState >= 2) return res(); el.addEventListener('loadeddata', res, { once: true }); setTimeout(res, 2500); });
          el.currentTime = Math.min(0.15, (meta.duration || 1) / 3);
          await new Promise(res => { el.addEventListener('seeked', res, { once: true }); setTimeout(res, 1800); });
          const c = document.createElement('canvas'); c.width = 180; c.height = 320;
          const cx = c.getContext('2d');
          const s = Math.max(c.width / (meta.w || 1), c.height / (meta.h || 1));
          const dw = (meta.w || 1) * s, dh = (meta.h || 1) * s;
          cx.drawImage(el, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
          poster = c.toDataURL('image/jpeg', 0.72);
        }
      } catch (e) {}
      state.files.push({ id, name: file.name, size: file.size, url, objectUrl: url, duration: meta.duration, w: meta.w, h: meta.h, el, poster });
    }
    if (!state.mainId && state.files.length) state.mainId = state.files[0].id;
    syncLinks();
    toast(files.length + '개 영상을 추가했습니다', 'good');
  }

  /* ---------------- demo catalogue ---------------- */
  const CATALOG = [
    { name: '글로우랩 비타민C 세rum 30ml', category: '뷰티 · 스킨케어', price: '12,900~18,900원', emoji: '🧴', palette: ['#ffb07c', '#6b4bff'],
      hooks: ['바르고 3일, 톤이 한 단계 밝아짐', '한 방울로 얼굴 전체 커버', '끈적임 없이 수분 광채'], keywords: ['비타민C세럼', '톤업세럼', '수분광채'], summary: 'SNS에서 반복 노출되는 저가 세럼. 가격 대비 체감이 좋아 초반 3초 훅이 중요한 제품.' },
    { name: '에어프라이어 5.5L 대용량', category: '주방가전', price: '39,900~59,000원', emoji: '🍟', palette: ['#ffd166', '#ef476f'],
      hooks: ['기름 없이 바삭하게', '한 번에 5인분', '세척은 3초면 끝'], keywords: ['에어프라이어', '대용량', '기름없이'], summary: '가격 비교와 조리 장면이 성과를 만드는 제품. 초반에 완성 요리 컷을 먼저 보여주는 구성이 유리.' },
    { name: '무선 청소기 400W', category: '생활가전', price: '89,000~129,000원', emoji: '🧹', palette: ['#8ecae6', '#023047'],
      hooks: ['먼지 99.9% 흡입', '2kg 초경량', '한 번 충전 60분'], keywords: ['무선청소기', '경량청소기', '흡입력'], summary: '스펙보다 체감 장면(먼지 흡입)이 중요한 제품. 청소 전후 비교 컷이 핵심.' },
    { name: '반려동물 자동 급식기 3L', category: '펫용품', price: '34,900~49,000원', emoji: '🐾', palette: ['#b8f2e6', '#5e548e'],
      hooks: ['앱으로 예약 급식', '내 목소리 녹음 알림', '3L 대용량'], keywords: ['자동급식기', '반려동물', '예약급식'], summary: '집을 비우는 반려인이 타깃. 걱정을 먼저 건드리는 후킹이 잘 먹히는 카테고리.' },
    { name: '남녀공용 오버핏 후드', category: '패션', price: '19,900~29,900원', emoji: '👕', palette: ['#f4a261', '#264653'],
      hooks: ['출근룩도 데일리도', '세탁 100번에도 보풀 없음', '핏이 예술'], keywords: ['오버핏후드', '데일리룩', '남녀공용'], summary: '핏과 색감을 보여주는 제품. 1초 안에 착용 전신 컷을 보여주는 게 좋다.' },
    { name: '캠핑 접이식 테이블', category: '아웃도어', price: '27,900~39,000원', emoji: '🏕️', palette: ['#a7c957', '#386641'],
      hooks: ['3초 설치', '가방에 쏙 들어감', '흔들림 제로'], keywords: ['캠핑테이블', '접이식', '경량캠핑'], summary: '설치·수납 장면이 곧 후킹. 타임랩스 한 컷이면 설명이 끝나는 제품.' }
  ];
  // 카탈로그 이름 정리(오타 방지)
  CATALOG[0].name = '글로우랩 비타민C 세럼 30ml';

  function pickProduct(seedText) {
    const h = hash32(seedText);
    const base = CATALOG[h % CATALOG.length];
    const r = rng(h);
    return {
      name: base.name, category: base.category, price: base.price,
      hooks: base.hooks.slice(), keywords: base.keywords.slice(), summary: base.summary,
      emoji: base.emoji, palette: base.palette.slice(),
      confidence: Math.round(72 + r() * 22),
      demo: true
    };
  }

  const REF_ACCENTS = ['#6b4bff', '#ef476f', '#0f7b8f', '#b5179e', '#f77f00', '#3a86ff'];
  function demoRefs(product, seedText) {
    const r = rng(hash32(seedText + '|refs'));
    const pfs = state.platforms.length ? state.platforms : ['tiktok', 'instagram', 'youtube'];
    const base = hash32(seedText);
    const hooks = product.hooks;
    const titles = [
      product.name + ' 언박싱, 이게 진짜야?',
      hooks[0] + ' · 15초 솔직 후기',
      product.keywords[0] + ' 3일 써본 결과',
      product.name + ' 사기 전에 꼭 보세요',
      hooks[1] + ' | 비교 실험',
      product.keywords[1] + ' 하나로 끝내는 법'
    ];
    const feats = [
      '첫 1초 훅 · 자막 크게', '제품 클로즈업 3회', '가격 비교 컷 삽입',
      '전후 비교 구성', '손으로 만지는 장면', '마지막 CTA 2초'
    ];
    return titles.map((t, i) => {
      const views = Math.round(80000 + r() * 3800000);
      return {
        id: uid('r'), platform: pfs[i % pfs.length], title: t,
        views, likes: Math.round(views * (0.03 + r() * 0.05)),
        features: feats[i % feats.length], motif: (base + i * 37) % 6,
        emoji: product.emoji, palette: [product.palette[0], REF_ACCENTS[i % REF_ACCENTS.length]], inCart: false
      };
    });
  }

  function sourceText() {
    const parts = state.links.map(l => l.url).concat(state.files.map(f => f.name));
    return parts.join('\n') || 'demo';
  }

  function demoAnalyze() {
    const txt = sourceText();
    const p = pickProduct(txt);
    p.source = state.links.length + '개 링크 · ' + state.files.length + '개 내 영상 · ' + state.platforms.map(x => PLATFORMS[x].name).join(', ');
    const refs = demoRefs(p, txt);
    return { product: p, refs };
  }

  async function geminiAnalyze() {
    const items = getItems().slice(0, 12).map((it, i) => (i + 1) + '. [' + PLATFORMS[it.platform].name + '] ' + (it.kind === 'link' ? it.url : '내 영상 파일: ' + it.title));
    const prompt = [
      '너는 한국 쇼츠 커머스 분석가다. 아래 제품 영상 목록을 보고 상품을 추정해 JSON만 출력하라.',
      '목록:', items.join('\n'),
      '규칙: 링크 내용을 실제로 볼 수 없으므로 링크·파일명에서 추정하고 confidence(0~100)에 반영하라.',
      '조회수·좋아요는 추정치이며 실제 값이 아님을 전제로 숫자를 만들어라.',
      'JSON 스키마: {"product":{"name":string,"category":string,"price":string,"summary":string,"hooks":[string x3],"keywords":[string x3],"confidence":number},',
      '"refs":[{"platform":"tiktok|xiaohongshu|instagram|youtube|douyin","title":string,"views":number,"likes":number,"features":string}] }',
      'refs는 정확히 6개, 제목은 한국어로 40자 이내.'
    ].join('\n');
    const raw = await geminiJSON(prompt, { temp: 0.7, maxTokens: 1600 });
    const p = raw.product || {};
    const product = {
      name: String(p.name || '분석된 제품').slice(0, 60),
      category: String(p.category || '기타').slice(0, 30),
      price: String(p.price || '가격 미확인').slice(0, 40),
      summary: String(p.summary || '').slice(0, 200),
      hooks: (Array.isArray(p.hooks) ? p.hooks : []).slice(0, 4).map(String),
      keywords: (Array.isArray(p.keywords) ? p.keywords : []).slice(0, 6).map(String),
      confidence: clamp(Number(p.confidence) || 60, 0, 100),
      emoji: '📦', palette: ['#ffb07c', '#6b4bff'], demo: false,
      source: state.links.length + '개 링크 · ' + state.files.length + '개 내 영상'
    };
    if (!product.hooks.length) product.hooks = ['제품의 첫인상', '사용 장면', '가격 메리트'];
    if (!product.keywords.length) product.keywords = [product.category, '추천', '후기'];
    const refs = (Array.isArray(raw.refs) ? raw.refs : []).slice(0, 6).map((r, i) => ({
      id: uid('r'), platform: PLATFORMS[r.platform] ? r.platform : 'tiktok',
      title: String(r.title || '레퍼런스 ' + (i + 1)).slice(0, 70),
      views: Math.max(0, Math.round(Number(r.views) || 0)), likes: Math.max(0, Math.round(Number(r.likes) || 0)),
      features: String(r.features || '').slice(0, 60), motif: i % 6,
      emoji: '📦', palette: [product.palette[0], REF_ACCENTS[i % REF_ACCENTS.length]], inCart: false
    }));
    return { product, refs };
  }

  async function runAnalysis() {
    const items = getItems();
    if (!items.length) { toast('링크나 내 영상을 먼저 넣어 주세요', 'bad'); goStep(1); return; }
    const btn = $('#btnAnalyze');
    const badge = $('#analyzeBadge'), status = $('#analyzeStatus');
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 분석 중';
    badge.className = 'badge'; badge.textContent = '분석 중';
    status.textContent = (state.demo || !realKeys().length) ? '데모 분석 중…' : 'Gemini 분석 중…';
    try {
      const out = await withDemoFallback(geminiAnalyze, demoAnalyze, '제품 분석');
      state.product = out.product;
      if (out.product.source == null) out.product.source = state.links.length + '개 링크 · ' + state.files.length + '개 내 영상';
      state.refs = out.refs;
      state.lastAnalyzedAt = Date.now();
      renderProduct(); renderRefs(); renderCart();
      badge.className = 'badge live'; badge.textContent = out.__fallback ? '데모 대체' : (state.product.demo ? '데모 완료' : '분석 완료');
      status.textContent = out.__fallback ? ('Gemini 실패 → 데모 결과 (' + out.__fallback + ')') : ((state.product.demo ? '데모' : 'Gemini') + ' 분석 완료 · 제품 1개 · 레퍼런스 ' + state.refs.length + '개');
      toast('분석 완료 · ' + state.product.name, 'good');
      logActivity('🧠', '제품 분석 완료 · ' + state.product.name + (state.product.demo ? ' (데모)' : ' (AI)'));
      goStep(2);
    } catch (e) {
      badge.className = 'badge danger'; badge.textContent = '실패';
      status.textContent = errMsg(e);
      toast('분석 실패: ' + errMsg(e), 'bad');
    } finally {
      btn.disabled = false; btn.innerHTML = '🧠 분석 시작';
      updateAnalyzeHint();
    }
  }

  function renderProduct() {
    const p = state.product;
    const name = $('#prodName'), sub = $('#prodSub'), price = $('#prodPrice'), points = $('#prodPoints'), kw = $('#prodKw');
    if (!p) {
      if (name) name.textContent = '아직 분석된 제품이 없습니다';
      return;
    }
    name.textContent = p.name;
    sub.textContent = p.category + ' · ' + (p.summary || '요약 없음');
    price.textContent = '💰 ' + p.price;
    points.innerHTML = p.hooks.map(h => '<li>' + esc(h) + '</li>').join('');
    kw.innerHTML = p.keywords.map(k => '<span class="tag">#' + esc(k) + '</span>').join('');
    const conf = $('#prodConf'); if (conf) conf.textContent = '신뢰도 ' + (p.confidence || 0) + '%';
    const src = $('#prodSource'); if (src) src.textContent = '출처: ' + (p.source || '입력 링크');
    const badge = $('#prodDemoBadge'); if (badge) badge.textContent = p.demo ? '데모 분석' : 'AI 분석';
    const th = $('#prodThumb');
    if (th) {
      th.innerHTML = '<canvas width="224" height="280"></canvas>';
      paintCover(th.querySelector('canvas'), { motif: 0, emoji: p.emoji || '📦', palette: p.palette || ['#ffb07c', '#6b4bff'], title: p.name }, 0.6);
    }
    updateModeUI();
  }

  function renderRefs() {
    const grid = $('#refGrid'), empty = $('#refEmpty'), cnt = $('#refCount');
    if (!grid) return;
    if (cnt) cnt.textContent = state.refs.length + '개';
    if (empty) empty.classList.toggle('hidden', state.refs.length > 0);
    grid.innerHTML = state.refs.map(r =>
      '<div class="ref" data-ref="' + r.id + '">' +
      '<div class="cover"><canvas width="216" height="312" data-ref-canvas="' + r.id + '"></canvas>' +
      platformBadge(r.platform) + '<span class="views">▶ ' + fmtNum(r.views) + '</span></div>' +
      '<div class="body"><b>' + esc(r.title) + '</b><div class="feat">' + esc(r.features) + '</div>' +
      '<div class="foot"><span class="likes">♥ ' + fmtNum(r.likes) + '</span>' +
      '<button class="btn xs ' + (r.inCart ? 'mint' : 'soft') + '" type="button" data-cart="' + r.id + '">' + (r.inCart ? '담김 ✓' : '담기') + '</button></div></div></div>').join('');
    state.refs.forEach(r => {
      const cv = grid.querySelector('[data-ref-canvas="' + r.id + '"]');
      if (cv) paintCover(cv, r, (r.views % 1000) / 1000);
    });
  }

  function toggleCart(id) {
    const r = state.refs.find(x => x.id === id);
    if (!r) return;
    r.inCart = !r.inCart;
    renderRefs(); renderCart();
    toast(r.inCart ? '장바구니에 담았습니다' : '장바구니에서 뺐습니다');
  }
  function renderCart() {
    const list = $('#cartList'), empty = $('#cartEmpty'), cnt = $('#cartCount');
    if (!list) return;
    const cart = state.refs.filter(r => r.inCart);
    if (cnt) cnt.textContent = String(cart.length);
    if (empty) empty.classList.toggle('hidden', cart.length > 0);
    list.innerHTML = cart.map(r =>
      '<div class="cart-item"><span class="pf">' + platformBadge(r.platform) + '</span><b>' + esc(r.title) + '</b>' +
      '<span class="dim mono" style="font-size:10px">▶ ' + fmtNum(r.views) + '</span>' +
      '<button class="btn xs danger" type="button" data-cart="' + r.id + '">빼기</button></div>').join('');
    if (state.scenes.length) { /* 장면 재료 갱신은 4단계에서 */ }
  }

  function fillSampleLinks() {
    const seeds = [
      'https://www.tiktok.com/@glowlab.kr/video/7312847563920481025',
      'https://www.instagram.com/reel/Cz9mQ2rLx1t/',
      'https://www.youtube.com/shorts/8dQ2mJ7xK1A'
    ];
    $('#linkInput').value = seeds.join('\n');
    syncLinks();
    toast('예시 링크 3개를 넣었습니다', 'good');
  }

  /* ---------------- canvas painting (covers / scenes) ---------------- */
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function hexA(hex, a) {
    const h = String(hex || '#ffffff').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // 제품/장면 모티프: 사진 없이도 일관된 9:16 비주얼을 그린다.
  function drawMotif(ctx, W, H, motif, t, pal) {
    const c1 = pal[0] || '#ffb07c', c2 = pal[1] || '#6b4bff';
    const s = Math.min(W, H);
    ctx.save();
    // stage light
    const rg = ctx.createRadialGradient(W * 0.5, H * 0.38, s * 0.05, W * 0.5, H * 0.5, s * 0.78);
    rg.addColorStop(0, hexA('#ffffff', 0.30)); rg.addColorStop(0.45, hexA(c1, 0.16)); rg.addColorStop(1, hexA('#000000', 0.28));
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    const bob = Math.sin(t * 1.7) * s * 0.012;
    ctx.translate(0, bob);
    if (motif === 0) { // 병/세럼
      const bw = s * 0.30, bh = s * 0.52, x = (W - bw) / 2, y = H * 0.30;
      ctx.fillStyle = hexA('#ffffff', 0.14); roundRect(ctx, x, y, bw, bh, s * 0.09); ctx.fill();
      ctx.strokeStyle = hexA('#ffffff', 0.5); ctx.lineWidth = Math.max(1, s * 0.006); ctx.stroke();
      ctx.fillStyle = hexA(c1, 0.85); roundRect(ctx, x + bw * 0.28, y - s * 0.085, bw * 0.44, s * 0.10, s * 0.03); ctx.fill();
      ctx.fillStyle = hexA('#ffffff', 0.22); roundRect(ctx, x + bw * 0.14, y + bh * 0.12, bw * 0.18, bh * 0.62, bw * 0.09); ctx.fill();
      ctx.fillStyle = hexA('#ffffff', 0.9);
      ctx.beginPath(); ctx.arc(x + bw * 0.5, y + bh * 0.62, s * 0.045, 0, Math.PI * 2); ctx.fill();
    } else if (motif === 1) { // 박스/언박싱
      const bw = s * 0.46, bh = s * 0.36, x = (W - bw) / 2, y = H * 0.38;
      ctx.fillStyle = hexA(c1, 0.9); roundRect(ctx, x, y, bw, bh, s * 0.02); ctx.fill();
      ctx.fillStyle = hexA('#000000', 0.18); ctx.fillRect(x, y, bw, bh * 0.16);
      ctx.fillStyle = hexA('#ffffff', 0.85); ctx.fillRect(x + bw * 0.45, y, bw * 0.1, bh);
      ctx.strokeStyle = hexA('#ffffff', 0.6); ctx.lineWidth = Math.max(1, s * 0.008);
      ctx.beginPath(); ctx.moveTo(x, y + bh * 0.16); ctx.lineTo(x + bw * 0.45, y - s * 0.02); ctx.lineTo(x + bw, y + bh * 0.16); ctx.stroke();
    } else if (motif === 2) { // 클로즈업 링
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = hexA(i === 1 ? c1 : '#ffffff', 0.22 + i * 0.14);
        ctx.lineWidth = s * (0.012 + i * 0.006);
        ctx.beginPath(); ctx.arc(W * 0.5, H * 0.44, s * (0.12 + i * 0.09), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = hexA('#ffffff', 0.85); ctx.beginPath(); ctx.arc(W * 0.5, H * 0.44, s * 0.035, 0, Math.PI * 2); ctx.fill();
    } else if (motif === 3) { // 전후 비교
      const gap = s * 0.02, pw = (W - s * 0.16 - gap) / 2, ph = H * 0.4, y = H * 0.3;
      ctx.fillStyle = hexA('#ffffff', 0.10); roundRect(ctx, s * 0.055, y, pw, ph, s * 0.02); ctx.fill();
      ctx.fillStyle = hexA(c1, 0.55); roundRect(ctx, s * 0.055 + pw + gap, y, pw, ph, s * 0.02); ctx.fill();
      ctx.strokeStyle = hexA('#ffffff', 0.55); ctx.lineWidth = Math.max(1, s * 0.005);
      ctx.beginPath(); ctx.moveTo(W / 2, y - s * 0.03); ctx.lineTo(W / 2, y + ph + s * 0.03); ctx.stroke();
    } else if (motif === 4) { // 가격 태그
      const tw = s * 0.42, th = s * 0.26, x = (W - tw) / 2, y = H * 0.36;
      ctx.fillStyle = hexA(c1, 0.9);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + tw - th * 0.4, y); ctx.lineTo(x + tw, y + th / 2); ctx.lineTo(x + tw - th * 0.4, y + th); ctx.lineTo(x, y + th); ctx.closePath(); ctx.fill();
      ctx.fillStyle = hexA('#20100a', 0.85); ctx.beginPath(); ctx.arc(x + tw * 0.2, y + th / 2, s * 0.025, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = hexA('#ffffff', 0.9); ctx.font = '700 ' + Math.round(s * 0.13) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('%', x + tw * 0.62, y + th / 2);
    } else { // 디바이스/테이블
      const dw = s * 0.4, dh = s * 0.5, x = (W - dw) / 2, y = H * 0.3;
      ctx.fillStyle = hexA('#ffffff', 0.10); roundRect(ctx, x, y, dw, dh, s * 0.05); ctx.fill();
      ctx.strokeStyle = hexA(c1, 0.9); ctx.lineWidth = s * 0.012; ctx.stroke();
      ctx.fillStyle = hexA(c1, 0.35); roundRect(ctx, x + dw * 0.1, y + dh * 0.1, dw * 0.8, dh * 0.55, s * 0.02); ctx.fill();
      ctx.fillStyle = hexA('#ffffff', 0.7);
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + dw * (0.3 + i * 0.2), y + dh * 0.82, s * 0.016, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
    // vignette + grain
    const vg = ctx.createRadialGradient(W / 2, H / 2, s * 0.2, W / 2, H / 2, s * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.055;
    for (let i = 0; i < 46; i++) {
      const gx = (hash32(i + 'g') % 1000) / 1000 * W, gy = (hash32(i + 'h') % 1000) / 1000 * H;
      ctx.fillStyle = '#fff'; ctx.fillRect(gx, gy, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  function paintCover(cv, opt, t) {
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const pal = (opt && opt.palette) || ['#ff7a45', '#6b4bff'];
    const lg = ctx.createLinearGradient(0, 0, W, H);
    lg.addColorStop(0, pal[1] || '#26344a'); lg.addColorStop(0.55, pal[0] || '#ff7a45'); lg.addColorStop(1, '#101823');
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    drawMotif(ctx, W, H, (opt && opt.motif) || 0, (t == null ? 0.4 : t) * 6.0, pal);
  }

  /* ---------------- step 3: script ---------------- */
  const LANG_NAME = { ko: '한국어', en: 'English', ja: '日本語', zh: '中文' };
  const LEN_COUNT = { short: 3, normal: 5, long: 7 };
  const TONE_NAME = { friendly: '친근하게', pro: '전문적으로', fun: '유머러스' };

  function shortName(n) { return String(n || '').replace(/\s*\d+(\.\d+)?\s*(ml|L|l|g|kg|W)?$/i, '').slice(0, 16); }
  function hookShort(h) { return String(h || '').replace(/[.!?]$/, '').split(',')[0].slice(0, 16); }

  /** 후킹 멘트 후보 6개 (첫 문장 자리에 그대로 쓰는 문장) */
  function demoHooks(p, lang, name, h, k) {
    const price = (p && p.price) || '합리적인 가격';
    const h0 = h[0] || '첫인상', h1 = h[1] || '사용감';
    const k0 = k[0] || '이 제품';
    if (lang === 'en') return [
      'This ' + name + ' is everywhere on social right now, so I finally tried it.',
      'Three days in, ' + h1 + ' — and it is real.',
      'Before you buy ' + name + ', watch these 15 seconds.',
      h0 + '. That was the first thing I noticed.',
      'This price for this quality is a steal.',
      'If you were looking for ' + k0 + ', stop scrolling.'
    ];
    if (lang === 'ja') return [
      'SNSで話題の' + name + '、ついに試してみました。',
      '3日使ってみたら、' + h1 + 'は本当でした。',
      name + ' を買う前に、15秒だけ見てください。',
      h0 + '。第一印象はこれでした。',
      'この価格でこの品質は買いです。',
      k0 + ' を探していたなら、スクロールを止めて。'
    ];
    if (lang === 'zh') return [
      '最近社交平台上超火的' + name + '，我终于试了。',
      '用了三天，' + h1 + '是真的。',
      '买' + name + '之前，先看这15秒。',
      h0 + '，这是第一印象。',
      '这个价格配这个品质，真的很划算。',
      '如果你在找' + k0 + '，先别划走。'
    ];
    return [
      '요즘 SNS에서 난리난 ' + name + ', 저도 드디어 써봤어요.',
      '3일만 써보세요. ' + h1 + '이 달라집니다.',
      name + ' 사기 전에 딱 15초만 보세요.',
      h0 + '. 이건 진짜였어요.',
      '이 가격(' + price + ')에 이 품질? 안 살 이유가 없죠.',
      k0 + ' 찾고 있었다면, 잠깐만 보세요.'
    ];
  }

  function demoScript(product, lang, tone, length) {
    const p = product || { name: '제품', hooks: ['첫인상', '사용감', '가격'], keywords: ['추천', '후기'], price: '합리적인 가격' };
    const h = p.hooks && p.hooks.length ? p.hooks : ['첫인상', '사용감', '가격'];
    const k = p.keywords && p.keywords.length ? p.keywords : ['추천', '후기'];
    const name = shortName(p.name);
    const n = LEN_COUNT[length] || 5;
    let sents, titles, highlights;
    if (lang === 'en') {
      sents = [
        'This ' + name + ' is everywhere on social right now, so I finally tried it.',
        'First impression? ' + h[0] + '.',
        'I used it for three days, and ' + (h[1] || 'the result') + ' is real.',
        'What surprised me most was ' + (h[2] || 'how easy it is') + '.',
        'If you were looking for ' + (k[0] || 'this') + ', this is the one.',
        'The price is ' + p.price + ', and honestly that is a steal.',
        'Link is in the pinned comment. Go check it out!' 
      ];
      titles = [name + ' is real?', '3 days later, the truth'];
      highlights = [String(k[0] || 'real'), '3 days', name.split(' ')[0]];
    } else if (lang === 'ja') {
      sents = [
        'SNSで話題の' + name + '、ついに試してみました。',
        '第一印象は、' + h[0] + '。',
        '3日使ってみたら、' + (h[1] || '効果') + 'は本当でした。',
        '一番驚いたのは' + (h[2] || '使いやすさ') + 'です。',
        (k[0] || 'これ') + 'を探していたなら、これは見るべきです。',
        '価格は' + p.price + '、これは買いです。',
        'リンクは固定コメントにあります。今すぐチェック！'
      ];
      titles = [name + ' 本当？', '3日使った本音'];
      highlights = [String(k[0] || '本当'), '3日', name.slice(0, 6)];
    } else if (lang === 'zh') {
      sents = [
        '最近社交平台上超火的' + name + '，我终于试了。',
        '第一印象就是：' + h[0] + '。',
        '用了三天，' + (h[1] || '效果') + '是真的。',
        '最让我惊讶的是' + (h[2] || '很好用') + '。',
        '如果你在找' + (k[0] || '这个') + '，一定要看。',
        '价格' + p.price + '，真的很划算。',
        '链接在置顶评论，快去看看吧！'
      ];
      titles = [name + '是真的吗？', '用了三天的真实感受'];
      highlights = [String(k[0] || '真的'), '三天', name.slice(0, 6)];
    } else {
      const toneTail = tone === 'pro' ? '습니다' : tone === 'fun' ? '더라고요 ㅋㅋ' : '어요';
      sents = [
        '요즘 SNS에서 난리난 ' + name + ', 저도 드디어 써봤' + toneTail + '.',
        h[0] + '.',
        '3일 써보니 ' + (h[1] || '사용감') + '. 이건 진짜였' + toneTail + '.',
        '제가 특히 좋았던 건 ' + (h[2] || '가격 대비 만족도') + '.',
        (k[0] || '이 제품') + ' 찾고 있었다면 이건 꼭 보세요.',
        '가격도 ' + p.price + ', 이 정도면 안 살 이유가 없죠.',
        '링크는 고정댓글에 있어요. 지금 확인해 보세요!'
      ];
      titles = [name + ' 이거 실화?', hookShort(h[0]) + ' 진짜였어'];
      highlights = [String(k[0] || '실화'), '3일', name.split(' ')[0]];
    }
    sents = sents.slice(0, n);
    if (tone === 'fun' && lang === 'ko') sents[0] = '요즘 SNS에서 난리난 ' + name + ', 저도 홀린 듯이 사버렸어요 ㅋㅋ';
    if (tone === 'pro' && lang === 'ko') sents[0] = 'SNS에서 화제인 ' + name + ', 3일간 직접 사용해 검증했습니다.';
    titles = titles.map(t => String(t).slice(0, lang === 'ko' ? 22 : 40));
    const hooks = demoHooks(p, lang, name, h, k).slice(0, 6);
    hooks[0] = sents[0];
    return { lang, tone, length, titles, highlights: highlights.filter(Boolean), hooks, sentences: sents.map(text => ({ text })), demo: true };
  }

  /* ---------------- 대본 유형 · 8종 프롬프트(쿠팡파트너스 무한 소재) ---------------- */
  const SCRIPT_TYPES = [
    { id: 'base', label: '기본 자유형', hint: '지금까지 쓰던 자유 구성', order: '첫 문장 훅 → 핵심 장점 2~3개 → 확인 안내', chars: 170, sentences: 5 },
    { id: 'r1', label: '3-1 실사용 후기형', hint: '고민 → 달라진 점 → 단점 1개 → 확인', order: '고민 → 달라진 점 → 아쉬운 점 1개 → 확인 안내', chars: 160, sentences: 5 },
    { id: 'r2', label: '3-2 구매후기 요약형', hint: '구매후기 요약 · 단점 포함', order: "훅 → 반복 장점 2~3개 → 단점 1~2개 → '이런 사람에게 맞음/안 맞음' → 확인 안내", chars: 170, sentences: 6 },
    { id: 'cmp', label: '5 공정 비교형 (A vs B)', hint: 'A·B 장단점 → 대상 구분', order: "훅 → A 장단점 2개씩 → B 장단점 2개씩 → '이런 사람은 A, 이런 사람은 B' → 확인 안내", chars: 180, sentences: 7 },
    { id: 'season', label: '6 시즌·생활장면형', hint: '장면 → 불편 → 해결 → 질문', order: '생활 장면 → 그때 생기는 불편 → 제품이 해결하는 점 → 질문 한 줄', chars: 160, sentences: 5 },
    { id: 'bundle', label: '7 5종 묶음 큐레이션형', hint: '한 테마 5개 묶음', order: "훅 → 번호 리스트 1~5(상품마다 '이럴 때 쓰는 물건' 한 줄) → 마무리", chars: 200, sentences: 7 },
    { id: 'loop', label: '⚡ 초단편 루프 (6~15초)', hint: '6~15초 · 탑티어 루프', order: '0~2초 훅 → 손 시연 컷 1~2문장 → 단점 1줄 → 무언 CTA(루프로 다시 시작)', chars: 90, sentences: 4 }
  ];
  const TOP_TIER_TYPES = ['r1', 'cmp', 'season', 'loop'];   // 탑티어 크리에이터가 자주 쓰는 유형(무지개 표시)
  const TYPE_RULES = {
    base: [],
    r1: ['내가 직접 써본 것처럼 쓰되, 제품 정보에 없는 수치·효과는 지어내지 않는다', '아쉬운 점(현실 단점)을 반드시 1개 넣는다'],
    r2: ["나는 아직 안 써봤다. '구매후기 읽어보니' 형식으로 말한다", "'써보니' 같은 직접 사용 표현 금지", '후기에 없는 내용·수치 금지, 단점을 반드시 1개 이상'],
    cmp: ['한쪽만 띄우지 않는다(양쪽 장단점을 같은 개수로)', '제품 정보에 없는 수치는 지어내지 않는다'],
    season: ["'시즌 필수템 / 지금 꼭 사세요' 같은 억지 연결 금지", '안 써봤으면 써본 척 금지', '마지막은 질문 한 줄로 끝낸다'],
    bundle: ['제품 정보에 준 특징 외 효과는 지어내지 않는다', "번호를 소리 내어 읽어도 자연스럽게('하나, 둘' 형태 허용)"],
    loop: ['문장은 8~22자로 아주 짧게, 4문장 이내(6~15초 분량)', '마지막 문장은 첫 문장으로 자연스럽게 이어지게(루프)', "말로 '구독·좋아요'를 요청하지 않는다(무언 CTA)"]
  };
  const HOOK5_TYPES = ['호기심', '공감', '반전', '질문', '숫자'];
  const HOOK_BANNED = ['필수템', '강추', '인생템', '꼭 사세요'];
  const TYPE_DEMO = {
    r1: ['사기 전에 제일 걱정했던 게 {worry} 문제였어요.', '며칠 써보니 {good1} 부분이 생각보다 확실했어요.',
         '다만 {bad}은 미리 알고 사는 게 좋아요.', '그래도 {good2} 덕분에 계속 쓰고 있어요.',
         '자세한 건 설명란에 적어뒀으니 확인해 보세요.'],
    r2: ['구매후기 읽어보니 결론이 갈리는 제품이에요.', '반복해서 나온 장점은 {good1}, {good2}이라는 점이었어요.',
         '단점으로는 {bad} 얘기가 많았어요.', '정리하면 이래서 사고, 이래서 말리는 물건이에요.',
         '내 상황과 맞는지 한 번 더 보고 결정하세요.', '구매후기 모아둔 링크는 설명란에 있어요.'],
    cmp: ['비슷해 보이는데 값이 다른 두 제품, 뭐가 다를까요?', 'A는 {good1}이 좋고, {bad}이 아쉬워요.',
          'B는 {good2}이 편하고, {bad2}이 걸려요.', '매일 쓰면 A, 가끔 쓰면 B가 맞아요.',
          '둘 다 장단점이 분명한 제품이에요.', '정리한 표는 설명란에 올려뒀어요.', '본인 생활에 맞는 쪽을 고르세요.'],
    season: ['이맘때만 되면 {scene}에서 늘 같은 불편이 생겨요.', '그럴 때마다 {pain} 때문에 번거롭죠.',
             '이 제품은 그 부분을 조금 덜어줘요.', '특히 {good1} 부분이 마음에 들었어요.',
             '여러분은 이 상황, 어떻게 해결하고 계세요?'],
    bundle: ['한 테마로 묶어봤습니다, 다섯 개만 보세요.', '하나, 매일 아침 쓰는 물건이에요.',
             '둘, 좁은 공간에 두기 좋은 쪽이에요.', '셋, 관리할 때 하나 있으면 편해요.',
             '넷, 선물해도 무난한 물건이에요.', '다섯, 가격 부담이 적은 걸로 골랐어요.', '필요한 것만 골라서 보세요.'],
    loop: ['{worry} 때문에 샀어요.', '한 번 써보니 {good1}.', '단점은 {bad}, 감안하세요.', '{worry} 때문에 샀어요.']
  };
  const TYPE_TITLES = {
    r1: ['사고 전에 단점부터', '솔직하게 정리'],
    r2: ['구매후기 정리', '결론 갈리는 이유'],
    cmp: ['A vs B 비교', '뭐가 다를까'],
    season: ['이맘때 쓰는 이유', '생활 장면'],
    bundle: ['한 테마 5종', '골라 담기'],
    loop: ['6초 요약', '한 번에 보기']
  };
  const TARGETS = ['30대 자취 직장인', '4인 가족 주부', '초보 운전자', '1인 가구 사회초년생', '반려동물과 사는 20대', '아이 키우는 맞벌이 부부'];
  const CATEGORIES = ['생활용품', '주방', '차량용품', '청소·정리', '계절가전', '반려동물', '캠핑·아웃도어', '수납·정리'];
  const MATERIAL_IDEAS = {
    '생활용품': [['욕실 습기', '욕실 선반·환풍기 커버'], ['먼지·털', '돌돌이·먼지 제거'], ['빨래', '건조대·빨래 집게']],
    '주방': [['조리 도구', '실리콘 조리도구·밀폐용기'], ['설거지', '수세미·싱크대 정리'], ['보관', '양념통·냉장고 정리']],
    '차량용품': [['실내 청소', '차량용 청소기·틈새 브러시'], ['수납', '트렁크 정리함·선글라스 홀더'], ['관리', '광택제·워셔액']],
    '청소·정리': [['바닥', '밀대·물걸레'], ['정리', '서랍 칸막이·케이블 정리'], ['냄새', '탈취제·제습']],
    '계절가전': [['습도', '가습기·제습기'], ['온도', '온풍기·핫팩'], ['공기', '공기청정·환기']],
    '반려동물': [['급식', '자동 급식기·식기'], ['위생', '배변패드·탈취'], ['이동', '이동장·하네스']],
    '캠핑·아웃도어': [['설치', '접이식 테이블·체어'], ['수납', '수납 박스·카트'], ['조명', '랜턴·스트링 조명']],
    '수납·정리': [['좁은 공간', '선반·행거'], ['서랍', '칸막이·정리함'], ['주방', '회전 트레이·걸이']]
  };
  const BAD_POOL = ['물 보충이 잦은 점', '색상 선택이 좁은 점', '설명서가 간단한 점', '무게가 살짝 나가는 점'];

  function typeMeta(id) { return SCRIPT_TYPES.find(t => t.id === id) || SCRIPT_TYPES[0]; }
  function isTopType(id) { return TOP_TIER_TYPES.includes(id); }

  function renderTypeChips() {
    const box = $('#typeChips'); if (!box) return;
    const cur = (state.scriptOpts && state.scriptOpts.type) || 'base';
    box.innerHTML = SCRIPT_TYPES.map(t => {
      const top = isTopType(t.id);
      return '<button type="button" class="type-chip' + (top ? ' top' : '') + (cur === t.id ? ' on' : '') +
        '" data-type="' + t.id + '" title="' + esc(t.order) + '">' +
        (top ? '<span class="tt">🌈 탑티어</span>' : '') + esc(t.label) + '</button>';
    }).join('');
  }

  function demoTemplate(type, p) {
    const h = ((p && p.hooks) || []).filter(Boolean);
    const map = { worry: '물통 크기', good1: h[0] || '쓰기 편한 점', good2: h[1] || '관리가 쉬운 점',
                  bad: BAD_POOL[0], bad2: BAD_POOL[1], scene: '아침 준비', pain: '정리와 청소' };
    return (TYPE_DEMO[type] || TYPE_DEMO.r1).map(l => l.replace(/\{(\w+)\}/g, (m, k) => map[k] || m));
  }

  function demoScriptByType(p, type, lang, tone, length, commentLine) {
    const meta = typeMeta(type);
    if (meta.id === 'base') {
      const out = demoScript(p, lang, tone, length);
      out.script_type = 'base';
      if (commentLine) out.comment_line = demoComment(p).closing;
      return out;
    }
    const name = shortName((p && p.name) || '제품');
    const lines = demoTemplate(meta.id, p);
    const n = Math.min(Math.max(4, LEN_COUNT[length] || 5), lines.length);
    const sents = lines.slice(0, n);
    const hooks5 = demoHooks5(p).hooks.map(h => h.text);
    const out = {
      lang, tone, length, titles: [name, TYPE_TITLES[meta.id][0]].map(t => String(t).slice(0, 22)),
      highlights: [name.split(' ')[0], '단점'].filter(Boolean),
      hooks: hooks5.concat(sents[0]).slice(0, 6),
      sentences: sents.map(text => ({ text })), demo: true, script_type: meta.id
    };
    if (commentLine) out.comment_line = demoComment(p).closing;
    return out;
  }

  function demoHooks5(p) {
    const name = (p && p.name) || '이 제품';
    const hooks = [
      { type: '호기심', text: '이거 왜 다들 하나만 사는 걸까요?', reason: '이유가 궁금해서 멈춘다' },
      { type: '공감', text: '매번 같은 불편, 저만 그런 거 아니죠?', reason: '내 얘기 같아서 멈춘다' },
      { type: '반전', text: '비싼 게 답이 아니었어요.', reason: '예상이 뒤집혀서 본다' },
      { type: '질문', text: '그거 하루면 충분할까요?', reason: '답을 확인하려고 본다' },
      { type: '숫자', text: '3일 써보고 남은 결론 하나.', reason: '숫자가 구체적이라 신뢰가 간다' }
    ];
    return { hooks, best: hooks[0].text, demo: true };
  }

  function hookRule(type, text, product) {
    const t = String(text || '').trim();
    if (!t) return '빈 문장';
    if (t.length > 24) return '24자 초과';
    if (HOOK_BANNED.some(w => t.includes(w))) return '금지 표현';
    const p = product || state.product || {};
    const name = String(p.name || '').trim();
    if (name.length >= 3 && t.includes(name)) return '상품명 노출';
    const digits = String(p.price || '').replace(/[^0-9]/g, '');
    if (digits && t.includes(digits)) return '가격 노출';
    return '';
  }

  function demoComment(p) {
    const q = [
      { type: '공감', text: '저도 이거 살까 말까 고민했는데, 다들 어느 쪽이세요?' },
      { type: '반박', text: '이 가격이면 그냥 다른 거 사는 게 낫다는 분도 있겠죠?' },
      { type: '경험 공유', text: '써보신 분은 단점이 뭐였는지 알려주세요.' }
    ];
    return { questions: q, closing: q[0].text, demo: true };
  }

  function demoMaterials(target, category) {
    const tgt = target || TARGETS[Math.floor(Math.random() * TARGETS.length)];
    const cat = category || CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const ideas = MATERIAL_IDEAS[cat] || MATERIAL_IDEAS['생활용품'];
    const groups = ideas.map(([title, ex]) => ({
      name: title, examples: [ex + ' 기본형', ex + ' 대용량', ex + ' 선물 세트'],
      point: "'" + title + "' 문제를 15초 안에 1컷으로 보여줄 수 있음 (타깃: " + tgt + ")",
      price: ['1만 원대', '2~3만 원대', '3~5만 원대'][Math.floor(Math.random() * 3)]
    }));
    return {
      demo: true, target: tgt, category: cat, groups,
      avoid: [{ type: '효능·건강 과장 제품', why: '플랫폼·공정위 규정 위반 위험' },
              { type: '브랜드 로고가 크게 보이는 제품', why: '타 브랜드 홍보로 보임' },
              { type: '설치·시공이 필요한 제품', why: '15초 영상으로 설명이 안 됨' }],
      table: groups.map((g, i) => ({ name: g.name, impulse: i === 0 ? '상' : '중', material: '상', together: i === 2 ? '하' : '중' }))
    };
  }

  function demoRevise(script, metrics) {
    const sents = ((script && script.sentences) || []).map(s => s.text);
    const views = Number(metrics.views) || 0, likes = Number(metrics.likes) || 0, clicks = Number(metrics.clicks) || 0;
    const rate = views ? likes / views * 100 : 0, ctr = views ? clicks / views * 100 : 0;
    const issues = [];
    if (rate && rate < 3) issues.push('첫 문장이 약합니다. 좋아요율이 낮아 초반 이탈이 큰 것으로 보입니다.');
    if (ctr && ctr < 1) issues.push('마지막 확인 안내가 약합니다. 링크 클릭이 낮습니다.');
    if (!issues.length) issues.push('문장 길이가 고른 편입니다. 단점 문장을 조금 더 앞으로 옮겨 보세요.');
    return {
      demo: true, issues,
      dropAt: { seconds: Math.max(2, Math.round(sents.length * 1.2)), sentence: 2, why: '설명 문장이 이어지는 구간' },
      versions: [{ title: '수정안 1 · 첫 문장 교체', sentences: sents.slice(0, 6) },
                 { title: '수정안 2 · 단점 앞당김', sentences: sents.slice(0, 6).reverse() }],
      disclosure: '쿠팡 파트너스 활동의 일환으로 수수료를 받을 수 있습니다'
    };
  }

  async function geminiHooks5() {
    const p = state.product || {};
    const prompt = [
      '너는 숏폼 카피라이터다.',
      '상품: ' + (p.name || '제품') + ' / 핵심 스펙: ' + ((p.hooks || []).slice(0, 3).join(', ') || p.summary || '') + ' / 가격대: ' + (p.price || '미확인'),
      '타깃: ' + (p.target || '20~40대 쇼핑 관심층'),
      '스크롤을 멈추게 하는 첫 문장 5개를 호기심형/공감형/반전형/질문형/숫자형으로 하나씩 써라.',
      '상품명·가격은 넣지 말고 24자 이내, 필수템·강추·인생템 금지. 각 훅 옆에 멈추게 되는 이유 한 줄.',
      'JSON: {"hooks":[{"type":"호기심","text":"...","reason":"..."}],"best":"..."} — hooks 5개 고정'
    ].join('\n');
    const raw = await geminiJSON(prompt, { temp: 1.0, maxTokens: 900 });
    const hooks = (raw.hooks || []).map(h => typeof h === 'string' ? { text: h } : h)
      .map(h => ({ type: HOOK5_TYPES.includes(h.type) ? h.type : '호기심', text: String(h.text || '').trim(), reason: String(h.reason || '').slice(0, 60) }))
      .filter(h => h.text && !hookRule(h.type, h.text, p)).slice(0, 5);
    while (hooks.length < 5) { const f = demoHooks5(p).hooks[hooks.length]; if (!hooks.some(h => h.text === f.text)) hooks.push(f); else break; }
    const best = hooks.some(h => h.text === raw.best) ? raw.best : (hooks[0] || {}).text || '';
    return { hooks: hooks.slice(0, 5), best, demo: false };
  }

  async function geminiComment() {
    const p = state.product || {};
    const prompt = [
      '너는 숏폼 참여 유도 전략가다. 주제: ' + (p.name || '생활용품'),
      '댓글 달고 싶게 만드는 질문 3개를 공감형/반박형/경험 공유형으로 써라.',
      "'댓글 달아주세요' 같은 직접 요청 없이 친구한테 묻듯이. 그중 하나로 끝나는 마지막 1~2문장도 함께.",
      'JSON: {"questions":[{"type":"공감","text":"..."}],"closing":"..."}'
    ].join('\n');
    const raw = await geminiJSON(prompt, { temp: 0.95, maxTokens: 700 });
    const qs = (raw.questions || []).slice(0, 3).map(q => typeof q === 'string' ? { type: '공감', text: q } : q)
      .map(q => ({ type: String(q.type || '공감'), text: String(q.text || '').slice(0, 80) })).filter(q => q.text);
    if (!qs.length) return demoComment(p);
    return { questions: qs, closing: String(raw.closing || qs[0].text).slice(0, 80), demo: false };
  }

  async function geminiMaterials() {
    const target = TARGETS[Math.floor(Math.random() * TARGETS.length)];
    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const prompt = [
      '너는 숏폼 제휴마케팅 전문가다. 타깃: ' + target + ' / 분야: ' + category,
      '1) 이 타깃이 15~20초 영상을 보고 바로 클릭할 상품군 3개, 상품 예시 3개씩',
      '2) 상품군별 소구 포인트 1줄과 예상 가격대 3) 숏폼에서 피해야 할 상품 유형 3개와 이유',
      '수치는 지어내지 말고 1,000자 이내. JSON: {"groups":[{"name":"","examples":["","",""],"point":"","price":""}],"avoid":[{"type":"","why":""}]}',
      '타깃과 분야는 반드시 ' + target + ' / ' + category + ' 로 고정.'
    ].join('\n');
    const raw = await geminiJSON(prompt, { temp: 1.0, maxTokens: 1200 });
    const groups = (raw.groups || []).slice(0, 3).map(g => ({
      name: String(g.name || '').slice(0, 30), examples: (g.examples || []).slice(0, 3).map(String),
      point: String(g.point || '').slice(0, 80), price: String(g.price || '').slice(0, 20)
    })).filter(g => g.name && g.examples.length);
    if (groups.length < 3) return demoMaterials(target, category);
    return { target, category, groups, avoid: (raw.avoid || []).slice(0, 3), table: (raw.table || []).slice(0, 3), demo: false };
  }

  async function geminiRevise(script, metrics) {
    const lines = ((script && script.sentences) || []).map((s, i) => (i + 1) + '. ' + s.text).join('\n');
    const prompt = [
      '너는 숏폼 콘텐츠 분석가다.',
      '[기존 대본]\n' + lines,
      '[반응] 조회 ' + (metrics.views || 0) + ' / 좋아요 ' + (metrics.likes || 0) + ' / 댓글 ' + (metrics.comments || 0) + ' / 링크 클릭 ' + (metrics.clicks || 0),
      '1) 광고 같거나 지루한 문장을 짚어라 2) 몇 초·어느 문장에서 이탈했을지 추정하라',
      '3) 160자 이내 수정 대본 2개 4) 대가성 고지 문구가 빠졌으면 지적하고 넣어라',
      'JSON: {"issues":[""],"dropAt":{"seconds":8,"sentence":2,"why":""},"versions":[{"title":"","sentences":[""]}],"disclosure":""}'
    ].join('\n');
    const raw = await geminiJSON(prompt, { temp: 0.9, maxTokens: 1400 });
    const versions = (raw.versions || []).slice(0, 2).map((v, i) => ({
      title: String(v.title || ('수정안 ' + (i + 1))).slice(0, 40),
      sentences: (v.sentences || []).map(String).filter(Boolean).slice(0, 8)
    })).filter(v => v.sentences.length);
    if (!versions.length) return demoRevise(script, metrics);
    return { issues: (raw.issues || []).slice(0, 4).map(String), dropAt: raw.dropAt || {},
             versions, disclosure: String(raw.disclosure || ''), demo: false };
  }

  function recipeCard(title, note, rainbow) {
    const box = $('#recipeBox'); if (!box) return null;
    box.classList.remove('hidden');
    box.innerHTML = '<div class="recipe-card' + (rainbow ? ' rainbow' : '') + '"><div class="card-head"><h3>' + title +
      '</h3><span class="hint">' + (note || '') + '</span></div><div class="stack" id="recipeInner"></div></div>';
    return $('#recipeInner');
  }

  async function runHooks5() {
    if (!state.product) { toast('먼저 1~2단계에서 제품을 분석하세요', 'bad'); return; }
    const inner = recipeCard('🌈 후킹 5종 (2번 프롬프트)', "24자 이내 · 상품명·가격 숨김 · '필수템·강추·인생템' 금지", true);
    if (!inner) return;
    inner.innerHTML = '<span class="hint">만드는 중…</span>';
    const out = await withDemoFallback(geminiHooks5, () => demoHooks5(state.product), '후킹 5종');
    state.hooks5 = out;
    inner.innerHTML = out.hooks.map((h, i) =>
      '<div class="row between" style="gap:10px;align-items:flex-start"><div><span class="badge">' + esc(h.type) + '</span> <b>' + esc(h.text) +
      '</b><div class="hint">' + esc(h.reason || '') + ' · ' + String(h.text).length + '자</div></div>' +
      '<button class="btn xs ghost" data-hook5="' + i + '">첫 문장으로</button></div>').join('') +
      '<p class="hint">추천: <b>' + esc(out.best) + '</b>' + (out.demo ? ' · 데모' : ' · Gemini') + '</p>';
  }

  async function runComment() {
    if (!state.product) { toast('먼저 1~2단계에서 제품을 분석하세요', 'bad'); return; }
    const inner = recipeCard('💬 댓글 유도 1줄 (4번 프롬프트)', "직접 '댓글 달아주세요' 없이 묻듯이", false);
    if (!inner) return;
    inner.innerHTML = '<span class="hint">만드는 중…</span>';
    const out = await withDemoFallback(geminiComment, () => demoComment(state.product), '댓글 유도');
    state.commentCands = out;
    inner.innerHTML = out.questions.map((q, i) =>
      '<div class="row between" style="gap:10px"><div><span class="badge">' + esc(q.type) + '</span> ' + esc(q.text) + '</div>' +
      '<button class="btn xs ghost" data-close="' + i + '">이 문장 붙이기</button></div>').join('') +
      '<p class="hint">마무리: <b>' + esc(out.closing) + '</b>' + (out.demo ? ' · 데모' : ' · Gemini') + '</p>';
  }

  function appendSentence(text) {
    if (!state.script) { toast('먼저 대본을 만들어 주세요', 'bad'); return; }
    const sents = state.script.sentences.map(s => ({ text: s.text }));
    sents.push({ text: String(text).slice(0, 90) });
    state.script.sentences = sents.slice(0, 9);
    state.voice = null;
    renderScript(); renderTimeline(); buildScenes(); ensurePreview();
    toast('마지막 문장으로 붙였습니다', 'good');
  }

  async function runMaterials() {
    const inner = recipeCard('🎲 랜덤 소재 발굴 (1번 프롬프트)', '타깃 × 분야 → 상품군 3개 × 예시 3개 = 9개', false);
    if (!inner) return;
    inner.innerHTML = '<span class="hint">만드는 중…</span>';
    const out = await withDemoFallback(geminiMaterials, () => demoMaterials(), '소재 발굴');
    state.materials = out;
    const groups = out.groups.map(g => '<div class="card inner" style="padding:10px"><h3>' + esc(g.name) + '</h3>' +
      '<div class="hint">' + esc(g.point || '') + ' · ' + esc(g.price || '') + '</div>' +
      '<div class="kw" style="margin-top:6px">' + g.examples.map(x => '<span class="tag">' + esc(x) + '</span>').join('') + '</div></div>').join('');
    inner.innerHTML = '<p class="hint">타깃 <b>' + esc(out.target) + '</b> · 분야 <b>' + esc(out.category) + '</b>' + (out.demo ? ' · 데모' : ' · Gemini') + '</p>' +
      groups + '<p class="hint">피할 유형: ' + (out.avoid || []).map(a => esc(a.type) + '(' + esc(a.why) + ')').join(' · ') + '</p>';
  }

  async function runRevise() {
    if (!state.script) { toast('먼저 3단계에서 대본을 만들어 주세요', 'bad'); return; }
    const inner = recipeCard('📊 수치 피드백 수정 (8번 프롬프트)', '조회·좋아요·댓글·클릭으로 이탈 구간을 짚고 수정안 2개', true);
    if (!inner) return;
    inner.innerHTML = '<div class="grid4" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">' +
      ['views|조회', 'likes|좋아요', 'comments|댓글', 'clicks|링크 클릭'].map(x => {
        const [k, label] = x.split('|');
        return '<label class="field"><span>' + label + '</span><input type="number" min="0" id="rv_' + k + '" value="0"></label>';
      }).join('') + '</div><button class="btn primary" id="btnReviseGo">수치로 수정안 받기</button>';
    const go = $('#btnReviseGo'); if (!go) return;
    go.addEventListener('click', async () => {
      const metrics = { views: +($('#rv_views') || {}).value || 0, likes: +($('#rv_likes') || {}).value || 0,
                        comments: +($('#rv_comments') || {}).value || 0, clicks: +($('#rv_clicks') || {}).value || 0 };
      const out = await withDemoFallback(() => geminiRevise(state.script, metrics), () => demoRevise(state.script, metrics), '피드백 수정');
      state.revise = out;
      inner.innerHTML = '<ul class="hint" style="margin:0 0 8px 18px">' + out.issues.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>' +
        (out.dropAt && out.dropAt.sentence ? '<p class="hint">이탈 추정: 약 ' + out.dropAt.seconds + '초 · ' + out.dropAt.sentence + '번째 문장 (' + esc(out.dropAt.why || '') + ')</p>' : '') +
        out.versions.map((v, i) => '<div class="card inner" style="padding:10px"><h3>' + esc(v.title) + '</h3><ol style="margin:6px 0 0 18px">' +
          v.sentences.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>' +
          '<button class="btn xs ghost" data-ver="' + i + '">이 안으로 대본 바꾸기</button></div>').join('') +
        '<p class="hint">고지: ' + esc(out.disclosure || '') + (out.demo ? ' · 데모' : ' · Gemini') + '</p>';
      $$('#recipeInner [data-ver]').forEach(b => b.addEventListener('click', () => {
        const v = out.versions[+b.dataset.ver]; if (!v) return;
        state.script.sentences = v.sentences.map(t => ({ text: t }));
        state.voice = null;
        renderScript(); renderTimeline(); buildScenes(); ensurePreview();
        toast('수정안을 대본에 적용했습니다', 'good');
      }));
    });
  }

  async function geminiScript() {
    const p = state.product || {};
    const langName = LANG_NAME[state.scriptOpts ? state.scriptOpts.lang : 'ko'];
    const opts = state.scriptOpts || { lang: 'ko', tone: 'friendly', length: 'normal' };
    const meta = typeMeta(opts.type || 'base');
    const n = Math.min(LEN_COUNT[opts.length] || 5, meta.sentences + 2);
    const typeBlock = meta.id === 'base' ? [] : [
      '【대본 유형】 ' + meta.label,
      '- 문장 순서(반드시): ' + meta.order,
      '- 분량: 본문 ' + meta.chars + '자 이내, 문장 ' + Math.max(4, n) + '개 내외, 문장당 2~4초',
      '- 유형 규칙: ' + (TYPE_RULES[meta.id] || []).join(' / ')
    ];
    const prompt = [
      '너는 숏폼 커머스 대본 작가다. 아래 제품으로 세로 쇼츠(9:16, 15~20초) 대본을 JSON으로 써라.',
      '제품: ' + (p.name || '제품') + ' / 카테고리: ' + (p.category || '') + ' / 가격: ' + (p.price || ''),
      '후킹 포인트: ' + ((p.hooks || []).join(' | ') || '없음'),
      '키워드: ' + ((p.keywords || []).join(', ') || '없음'),
      '언어: ' + langName + ' / 톤: ' + TONE_NAME[opts.tone] + ' / 길이: ' + n + '문장',
      ...typeBlock,
      '규칙: 첫 문장은 1초 훅. 광고 같지 않게, 실제 사용 후기처럼. 각 문장은 20~45자(한국어 기준).',
      '제품 정보에 없는 수치·효과·수상·판매량을 지어내지 마라.',
      '상단 제목은 정확히 2줄(각 22자 이내, 한국어면 18자 이내), 강조 단어 3~5개.',
      '후킹 후보(hooks)는 첫 문장 자리에 그대로 쓸 수 있는 1초 훅 6개, 서로 다른 각도(호기심·공감·반전·질문·숫자).',
      opts.comment ? "마지막 1~2문장은 댓글을 부르는 문장으로 끝낸다('댓글 달아주세요' 직접 요청 금지)." : '',
      'JSON: {"titles":[string,string],"highlights":[string],"hooks":[string x6],"sentences":[string]} — 문장은 정확히 ' + n + '개.'
    ].filter(Boolean).join('\n');
    const raw = await geminiJSON(prompt, { temp: 0.9, maxTokens: 1400 });
    const titles = (Array.isArray(raw.titles) ? raw.titles : []).slice(0, 2).map(t => String(t).slice(0, 40));
    while (titles.length < 2) titles.push(titles[0] || '쇼츠 대본');
    const sents = (Array.isArray(raw.sentences) ? raw.sentences : []).map(s => ({ text: String(s).slice(0, 200) })).filter(s => s.text.trim());
    if (!sents.length) throw new Error('대본 문장이 비어 있습니다');
    let hooks = (Array.isArray(raw.hooks) ? raw.hooks : []).map(s => String(s).trim()).filter(Boolean).slice(0, 6);
    if (hooks.length < 6) {
      const p2 = state.product || {};
      const fill = demoHooks(p2, opts.lang, shortName(p2.name || '제품'), p2.hooks || [], p2.keywords || []);
      for (let i = 0; hooks.length < 6 && i < fill.length; i++) { if (!hooks.includes(fill[i])) hooks.push(fill[i]); }
    }
    hooks = hooks.slice(0, 6);
    hooks[0] = sents[0].text;
    const out = {
      ...opts, titles, hooks, script_type: meta.id,
      highlights: (Array.isArray(raw.highlights) ? raw.highlights : []).slice(0, 6).map(String),
      sentences: sents.slice(0, 9), demo: false
    };
    if (opts.comment) out.comment_line = String(raw.comment_line || '').slice(0, 80) || demoComment(p).closing;
    return out;
  }

  async function writeScript() {
    if (!state.product) { toast('먼저 1~2단계에서 제품을 분석하세요', 'bad'); goStep(1); return; }
    const btn = $('#btnWriteScript'), status = $('#scriptStatus');
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 작성 중';
    status.textContent = '대본 작성 중…';
    try {
      const opts = state.scriptOpts;
      const out = await withDemoFallback(geminiScript,
        () => demoScriptByType(state.product, opts.type || 'base', opts.lang, opts.tone, opts.length, !!opts.comment), '대본 작성');
      if (opts.comment && out.comment_line && out.script_type && out.script_type !== 'base') {
        const sents = (out.sentences || []).slice();
        sents[sents.length - 1] = { text: out.comment_line };
        out.sentences = sents;
      }
      state.script = out;
      state.voice = null;
      renderScript(); renderTimeline(); buildScenes(); ensurePreview();
      status.textContent = (out.demo ? '데모' : 'Gemini') + ' 대본 완료 · ' + out.sentences.length + '문장'
        + (out.script_type && out.script_type !== 'base' ? ' · ' + typeMeta(out.script_type).label : '')
        + (out.__fallback ? ' (Gemini 실패 → 데모)' : '');
      toast('대본 ' + out.sentences.length + '문장을 만들었습니다', 'good');
      logActivity('✍️', '대본 ' + out.sentences.length + '문장 · 후킹 후보 ' + ((out.hooks || []).length) + '개' + (out.demo ? ' (데모)' : ' (AI)'));
    } catch (e) {
      status.textContent = errMsg(e); toast('대본 실패: ' + errMsg(e), 'bad');
    } finally {
      btn.disabled = false; btn.innerHTML = '🪄 AI 대본 쓰기';
    }
  }

  function renderScript() {
    const s = state.script;
    const empty = $('#sentEmpty');
    if (!s) { if (empty) empty.classList.remove('hidden'); return; }
    $('#title1').value = s.titles[0] || '';
    $('#title2').value = s.titles[1] || '';
    updateTitleLens();
    $('#highlightInput').value = s.highlights.join(', ');
    renderHighlightPreview();
    const list = $('#sentList');
    list.innerHTML = s.sentences.map((x, i) =>
      '<div class="sent-item" data-sent="' + i + '">' +
      '<span class="n">' + pad(i + 1) + '</span>' +
      '<div><textarea data-sent-text="' + i + '" aria-label="' + (i + 1) + '번 문장" placeholder="문장을 입력하세요">' + esc(x.text) + '</textarea>' +
      '<div class="chars" data-chars="' + i + '">' + x.text.length + '자</div></div>' +
      '<div class="acts"><button class="btn xs ghost" type="button" data-sent-up="' + i + '" title="위로">↑</button>' +
      '<button class="btn xs ghost" type="button" data-sent-down="' + i + '" title="아래로">↓</button>' +
      '<button class="btn xs danger" type="button" data-sent-del="' + i + '" title="삭제">✕</button></div></div>').join('');
    if (empty) empty.classList.toggle('hidden', s.sentences.length > 0);
    const cnt = $('#sentCount'); if (cnt) cnt.textContent = s.sentences.length + '문장';
    renderHooks();
    updateModeUI();
  }

  /* 후킹 멘트 후보 6개 — 누르면 첫 문장이 그 문장으로 바로 바뀐다 */
  function renderHooks() {
    const wrap = $('#hookChips'); if (!wrap) return;
    const s = state.script;
    const hooks = (s && s.hooks) || [];
    const first = s && s.sentences[0] ? String(s.sentences[0].text || '').trim() : '';
    const cnt = $('#hookCount'); if (cnt) cnt.textContent = String(hooks.length);
    const empty = $('#hookEmpty'); if (empty) empty.classList.toggle('hidden', hooks.length > 0);
    wrap.innerHTML = hooks.map((h, i) =>
      '<button class="hook-chip ' + (String(h).trim() === first ? 'on' : '') + '" type="button" data-hook="' + i + '" title="이 문장을 첫 문장으로 쓰기">' +
      '<span class="n">' + pad(i + 1) + '</span><span>' + esc(h) + '</span></button>').join('');
    const st = $('#hookStatus');
    if (st) st.textContent = hooks.length ? '지금 첫 문장: ' + (first || '(비어 있음)') : '대본을 만들면 후킹 후보 6개가 여기에 나옵니다.';
  }
  function applyHook(i) {
    const s = state.script;
    if (!s || !s.hooks || !s.hooks[i]) return;
    const text = String(s.hooks[i]);
    if (!s.sentences.length) s.sentences.push({ text }); else s.sentences[0].text = text;
    state.voice = null;
    renderScript(); renderTimeline(); ensurePreview(); buildScenes();
    drawPreview(); drawFamousPreview();
    toast('첫 문장을 ' + (i + 1) + '번 후킹으로 바꿨습니다', 'good');
  }

  function updateTitleLens() {
    const a = $('#title1'), b = $('#title2');
    if ($('#len1')) $('#len1').textContent = (a.value || '').length + '/22';
    if ($('#len2')) $('#len2').textContent = (b.value || '').length + '/26';
  }
  function renderHighlightPreview() {
    const el = $('#highlightPreview'); if (!el) return;
    const list = parseHighlights();
    el.innerHTML = list.map(w => '<span class="tag">' + esc(w) + '</span>').join('');
  }
  function parseHighlights() {
    return ($('#highlightInput').value || '').split(/[,，]/).map(s => s.trim()).filter(Boolean).slice(0, 8);
  }
  function syncScriptFromInputs() {
    if (!state.script) return;
    state.script.titles = [$('#title1').value, $('#title2').value];
    state.script.highlights = parseHighlights();
    state.script.sentences = $$('#sentList [data-sent-text]').map(ta => ({ text: ta.value }));
    const cnt = $('#sentCount'); if (cnt) cnt.textContent = state.script.sentences.length + '문장';
    updateTitleLens(); renderHighlightPreview();
    drawPreview();
  }

  function moveSentence(i, dir) {
    const s = state.script; if (!s) return;
    const j = i + dir; if (j < 0 || j >= s.sentences.length) return;
    const t = s.sentences[i]; s.sentences[i] = s.sentences[j]; s.sentences[j] = t;
    state.voice = null; renderScript(); renderTimeline(); buildScenes(); ensurePreview();
  }
  function removeSentence(i) {
    const s = state.script; if (!s) return;
    s.sentences.splice(i, 1); state.voice = null;
    renderScript(); renderTimeline(); buildScenes(); ensurePreview();
  }
  function addSentence() {
    if (!state.script) { toast('먼저 대본을 만들어 주세요', 'bad'); return; }
    state.script.sentences.push({ text: '' });
    state.voice = null;
    renderScript(); renderTimeline();
    const tas = $$('#sentList [data-sent-text]');
    if (tas.length) tas[tas.length - 1].focus();
  }

  /* ---------------- voice: Web Audio formant synth ---------------- */
  let AC = null;
  function getAC() {
    if (!AC) {
      const C = window.AudioContext || window.webkitAudioContext;
      AC = new C({ latencyHint: 'interactive' });
    }
    if (AC.state === 'suspended') AC.resume().catch(() => {});
    return AC;
  }
  // 구글 목소리 — Gemini Native TTS 5종 (이름은 실제 TTS voiceName과 같다)
  const VOICES = {
    kore: { pitch: 210, rate: 0.98, name: 'Kore', desc: '여성 · 따뜻하고 다정한' },
    aoede: { pitch: 236, rate: 1.06, name: 'Aoede', desc: '여성 · 밝고 가벼운' },
    charon: { pitch: 104, rate: 0.92, name: 'Charon', desc: '남성 · 낮고 차분한' },
    puck: { pitch: 142, rate: 1.10, name: 'Puck', desc: '남성 · 힘 있고 에너지 있는' },
    fenrir: { pitch: 118, rate: 0.96, name: 'Fenrir', desc: '남성 · 중저음 서사' }
  };
  const VOICE_ORDER = ['kore', 'aoede', 'charon', 'puck', 'fenrir'];
  function voiceInfo(key) { return VOICES[key] || VOICES.kore; }
  function currentVoiceKey() { const el = $('#voiceSel'); return el && VOICES[el.value] ? el.value : 'kore'; }
  function renderVoiceNames() {
    const wrap = $('#voiceNames'); if (!wrap) return;
    const cur = currentVoiceKey();
    wrap.innerHTML = VOICE_ORDER.map(k => '<span class="voice-name ' + (k === cur ? 'on' : '') + '" title="' + esc(VOICES[k].desc) + '">' + VOICES[k].name + '</span>').join('');
  }
  const KO_VOWELS = ['a', 'e', 'a', 'e', 'eo', 'e', 'eo', 'e', 'o', 'a', 'e', 'e', 'o', 'u', 'eo', 'e', 'i', 'u', 'eu', 'i', 'i'];
  const FORMANTS = {
    a: [820, 1250], e: [560, 1850], i: [330, 2350], o: [540, 900], u: [350, 820],
    eo: [600, 1400], eu: [440, 1500], ae: [700, 1600], schwa: [560, 1300]
  };

  function splitSyllables(text) {
    const out = [];
    const chars = Array.from(String(text || ''));
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const code = ch.charCodeAt(0);
      if (/\s/.test(ch)) { out.push({ t: 'space' }); continue; }
      if (/[.!?。！？]/.test(ch)) { out.push({ t: 'pause', d: 0.26 }); continue; }
      if (/[,，·]/.test(ch)) { out.push({ t: 'pause', d: 0.13 }); continue; }
      if (code >= 0xAC00 && code <= 0xD7A3) {
        const vi = Math.floor((code - 0xAC00) % 588 / 28);
        const li = Math.floor((code - 0xAC00) / 588);
        out.push({ t: 'syl', v: KO_VOWELS[vi] || 'a', con: li });
      } else if (/[가-힣]/.test(ch)) {
        out.push({ t: 'syl', v: 'a', con: 0 });
      } else if (/[a-zA-Z0-9]/.test(ch)) {
        const lc = ch.toLowerCase();
        const v = 'aeiou'.includes(lc) ? lc : (lc === 'y' ? 'i' : 'schwa');
        out.push({ t: 'syl', v: v, con: 0, latin: true });
      } else {
        out.push({ t: 'syl', v: 'a', con: 0 });
      }
    }
    return out;
  }

  function synthSpeechBuffer(text, opt) {
    const ac = getAC();
    const sr = ac.sampleRate;
    const vp = voiceInfo(opt.voice);
    const rate = clamp(opt.speed || 1, 0.6, 2);
    const pitch = vp.pitch * (0.98 + (rate - 1) * 0.12);
    const tokens = splitSyllables(text);
    const baseDur = 0.135 / (rate * vp.rate);
    // 1) 길이 계산
    let total = 0.06;
    const plan = [];
    for (const tk of tokens) {
      if (tk.t === 'space') { total += 0.045 / rate; plan.push({ tk, dur: 0.045 / rate }); continue; }
      if (tk.t === 'pause') { const d = (tk.d || 0.15) / rate; total += d; plan.push({ tk, dur: d }); continue; }
      const dur = baseDur * (tk.latin ? 0.82 : 1);
      total += dur; plan.push({ tk, dur });
    }
    total += 0.12;
    const n = Math.max(1, Math.ceil(total * sr));
    const buf = ac.createBuffer(1, n, sr);
    const out = buf.getChannelData(0);
    // 2) 합성 (글리탈 펄스 -> 포만트 공진 2단)
    let t = 0.06;
    let phase = 0;
    for (const item of plan) {
      const tk = item.tk, dur = item.dur;
      const start = Math.floor(t * sr), len = Math.max(1, Math.floor(dur * sr));
      if (tk.t === 'syl') {
        const F = FORMANTS[tk.v] || FORMANTS.schwa;
        const f1 = F[0] * (vp.pitch / 196 * 0.25 + 0.75), f2 = F[1];
        const r1 = Math.exp(-Math.PI * 90 / sr), th1 = 2 * Math.PI * f1 / sr;
        const r2 = Math.exp(-Math.PI * 150 / sr), th2 = 2 * Math.PI * f2 / sr;
        const b11 = 2 * r1 * Math.cos(th1), b12 = -r1 * r1;
        const b21 = 2 * r2 * Math.cos(th2), b22 = -r2 * r2;
        let y1 = 0, y2 = 0, z1 = 0, z2 = 0;
        const f0start = pitch * 1.06, f0end = pitch * (tk.v === 'i' || tk.v === 'e' ? 1.12 : 0.94);
        let ph = 0;
        for (let i = 0; i < len; i++) {
          const k = i / len;
          const f0 = f0start + (f0end - f0start) * k;
          ph += f0 / sr; if (ph >= 1) ph -= 1;
          // glottal-ish pulse
          let src = Math.exp(-ph * 9) * (ph < 0.5 ? 1 : -1);
          if (tk.con % 3 === 1 && i < len * 0.16) src += (Math.random() * 2 - 1) * 0.5; // 파열/마찰
          y1 = src + b11 * z1 + b12 * z2; z2 = z1; z1 = y1;
          y2 = y1 + b21 * z1 * 0.35 + b22 * z2 * 0.35; z2 = z1; z1 = y2;
          const env = Math.min(1, i / (sr * 0.012)) * Math.min(1, (len - i) / (sr * 0.02)) * 0.5;
          const idx = start + i;
          if (idx < out.length) out[idx] += y2 * env * 0.55;
        }
      }
      t += dur;
    }
    // 3) 문장 엔벨로프·정규화
    let peak = 0;
    for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
    const norm = peak > 0 ? Math.min(2.2, 0.82 / peak) : 1;
    for (let i = 0; i < out.length; i++) out[i] *= norm;
    return buf;
  }

  function pcmToBuffer(b64, rate) {
    const ac = getAC();
    const bin = atob(b64);
    const n = Math.floor(bin.length / 2);
    const buf = ac.createBuffer(1, n, rate || 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      let v = (bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8));
      if (v >= 32768) v -= 65536;
      ch[i] = v / 32768;
    }
    return buf;
  }

  async function geminiTTS(text, voiceKey) {
    const voiceName = voiceInfo(voiceKey).name;
    const data = await geminiCall('gemini-2.5-flash-preview-tts', {
      contents: [{ parts: [{ text: '다음 문장을 자연스러운 쇼츠 내레이션으로 읽어 주세요: ' + text }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } }
    }, { timeout: 60000 });
    const part = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0];
    const inline = part && (part.inlineData || part.inline_data);
    if (!inline || !inline.data) throw new Error('TTS 응답에 오디오가 없습니다');
    const rate = /rate=(\d+)/.exec(inline.mimeType || inline.mime_type || '') ? Number(/rate=(\d+)/.exec(inline.mimeType || inline.mime_type)[1]) : 24000;
    return pcmToBuffer(inline.data, rate);
  }

  function voiceGap() {
    const el = $('#gapSel');
    const v = el ? Number(el.value) : state.voiceGap;
    return isFinite(v) ? clamp(v, 0, 2) : 0.15;
  }
  function gapLabel(g) { return g === 0 ? '0초 (바로 이어서)' : (Math.round(g * 100) / 100) + '초'; }
  /** 문장 사이 간격만 바꾸면 오디오는 그대로 두고 타임라인 시작점만 다시 계산한다. */
  function applyGap() {
    state.voiceGap = voiceGap();
    const lab = $('#gapVal'); if (lab) lab.textContent = gapLabel(state.voiceGap);
    if (state.voice) {
      let t = 0;
      state.voice.timeline = state.voice.buffers.map((b, i) => {
        const row = { i, start: t, dur: b.duration, end: t + b.duration };
        t += b.duration + state.voiceGap;
        return row;
      });
      state.voice.total = state.voice.timeline.length ? state.voice.timeline[state.voice.timeline.length - 1].end : 0;
      state.voice.gap = state.voiceGap;
      renderTimeline(); updatePreviewMeta();
    }
    const vs = $('#voiceStatus');
    if (vs && state.voice) vs.textContent = '문장 사이 ' + gapLabel(state.voiceGap) + ' · ' + state.voice.timeline.length + '문장 · ' + state.voice.total.toFixed(1) + '초';
    drawPreview(); drawFamousPreview();
  }

  async function buildVoice() {
    if (!state.script || !state.script.sentences.length) { toast('먼저 대본을 만들어 주세요', 'bad'); return; }
    const btn = $('#btnMakeVoice'), status = $('#voiceStatus');
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 음성 만드는 중';
    const useGemini = !state.demo && realKeys().length > 0;
    const voice = currentVoiceKey();
    const speed = Number($('#speedRange').value) || 1;
    const gap = voiceGap();
    state.voiceGap = gap;
    const timeline = [];
    const buffers = [];
    let mode = useGemini ? 'gemini' : 'demo';
    let t = 0;
    try {
      for (let i = 0; i < state.script.sentences.length; i++) {
        const text = state.script.sentences[i].text.trim();
        status.textContent = '음성 ' + (i + 1) + '/' + state.script.sentences.length + ' 만드는 중…';
        let buf;
        if (!text) { buf = getAC().createBuffer(1, Math.floor(0.3 * getAC().sampleRate), getAC().sampleRate); }
        else if (useGemini) {
          try { buf = await geminiTTS(text, voice); }
          catch (e) { mode = 'mixed'; buf = synthSpeechBuffer(text, { voice, speed }); }
        } else {
          buf = synthSpeechBuffer(text, { voice, speed });
        }
        buffers.push(buf);
        const dur = buf.duration;
        timeline.push({ i, start: t, dur, end: t + dur });
        t += dur + gap;
      }
      const totalEnd = timeline.length ? timeline[timeline.length - 1].end : 0;
      state.voice = { mode, voice, speed, gap, timeline, total: totalEnd, buffers };
      if (state.subTl && state.subTl.length) { state.subTl = null; updateSubTlUI(); toast('음성을 만들었으므로 STT 타이밍을 끄고 음성 기준으로 바꿨습니다'); }
      renderTimeline();
      ensurePreview();
      status.textContent = (mode === 'gemini' ? 'Gemini TTS · ' + voiceInfo(voice).name : mode === 'mixed' ? '일부 Gemini · 나머지 합성음' : '브라우저 합성음 · ' + voiceInfo(voice).name) + ' · 문장 사이 ' + gapLabel(gap) + ' · ' + timeline.length + '문장 · ' + totalEnd.toFixed(1) + '초 (실측)';
      toast('음성 타임라인 완성 · ' + totalEnd.toFixed(1) + '초', 'good');
      logActivity('🔊', '음성 ' + timeline.length + '문장 · ' + totalEnd.toFixed(1) + '초 · ' + voiceInfo(voice).name + ' · 간격 ' + gapLabel(gap));
      const vm = $('#voiceModeBadge'); if (vm) { vm.className = 'badge ' + (mode === 'gemini' ? 'live' : 'demo'); vm.textContent = mode === 'gemini' ? 'Gemini TTS' : mode === 'mixed' ? '혼합' : '데모 합성음'; }
    } catch (e) {
      status.textContent = errMsg(e); toast('음성 실패: ' + errMsg(e), 'bad');
    } finally {
      btn.disabled = false; btn.innerHTML = '🔊 음성 만들기';
    }
  }

  function sentenceAt(t) {
    const v = state.voice;
    if (!v) return -1;
    const gap = v.gap == null ? state.voiceGap : v.gap;
    for (const row of v.timeline) { if (t >= row.start && t < row.end + gap) return row.i; }
    return -1;
  }

  function renderTimeline() {
    const body = $('#timelineBody'); if (!body) return;
    const v = state.voice;
    if (!v) {
      body.innerHTML = '<tr><td colspan="5" style="color:var(--dim);text-align:center;padding:14px">아직 타임라인이 없습니다</td></tr>';
      const tl = $('#totalLen'); if (tl) tl.textContent = '0.0s';
      const il = $('#infoLen'); if (il) il.textContent = '0.0s';
      return;
    }
    const maxDur = Math.max.apply(null, v.timeline.map(r => r.dur).concat([0.001]));
    body.innerHTML = v.timeline.map((row, i) => {
      const text = (state.script.sentences[i] || {}).text || '';
      return '<tr data-tl="' + i + '"><td class="num">' + pad(i + 1) + '</td>' +
        '<td>' + esc(text.slice(0, 46)) + (text.length > 46 ? '…' : '') + '</td>' +
        '<td class="num">' + row.start.toFixed(2) + 's</td>' +
        '<td class="num">' + row.dur.toFixed(2) + 's</td>' +
        '<td><div class="bar" style="width:' + Math.round(row.dur / maxDur * 100) + '%"></div></td></tr>';
    }).join('');
    const total = v.total;
    const tl = $('#totalLen'); if (tl) tl.textContent = total.toFixed(1) + 's';
    const il = $('#infoLen'); if (il) il.textContent = total.toFixed(1) + 's';
    const vt = $('#voiceTitle'); if (vt) vt.textContent = voiceInfo(v.voice).name + ' · ' + voiceInfo(v.voice).desc;
    const vs = $('#voiceSub');
    if (vs) vs.textContent = (v.mode === 'gemini' ? 'Gemini TTS' : v.mode === 'mixed' ? 'Gemini + 합성음' : '브라우저 합성음(데모)') + ' · ' + v.timeline.length + '문장 · 문장 사이 ' + gapLabel(v.gap == null ? state.voiceGap : v.gap) + ' · ' + (v.speed || 1).toFixed(2) + 'x';
    updatePreviewMeta();
  }

  /* ---------------- step 4: scenes ---------------- */
  const SCENE_KIND_LABEL = { ref: '레퍼런스 장면', generated: '자동 생성 장면', clip: '내 영상' };

  function buildScenes() {
    if (!state.script || !state.script.sentences.length) {
      state.scenes = []; renderScenes(); updatePreviewMeta(); return;
    }
    const refs = state.refs;
    const files = state.files;
    const old = state.scenes;
    state.scenes = state.script.sentences.map((s, i) => {
      const prev = old[i];
      const ref = refs.length ? refs[i % refs.length] : null;
      const useClip = files.length > 0;
      const base = prev || {};
      const kind = base.kind || (useClip ? 'clip' : (ref ? 'ref' : 'generated'));
      return {
        i,
        kind,
        refId: base.refId != null ? base.refId : (ref ? ref.id : null),
        motif: base.motif != null ? base.motif : (ref ? ref.motif : i % 6),
        label: base.label || (kind === 'clip' && files.length ? files[i % files.length].name : (ref ? ref.title : '자동 생성 장면 ' + (i + 1))),
        source: base.source || (kind === 'clip' && files.length ? '내 영상' : (ref ? PLATFORMS[ref.platform].name : '자동 생성')),
        emoji: base.emoji || (ref && ref.emoji) || (state.product && state.product.emoji) || '📦',
        palette: base.palette || (ref && ref.palette) || (state.product && state.product.palette) || ['#ff7a45', '#6b4bff'],
        fileId: base.fileId || (files.length ? files[i % files.length].id : null),
        start: base.start || 0,
        muted: !!base.muted
      };
    });
    renderScenes(); updatePreviewMeta();
  }

  function renderScenes() {
    const list = $('#sceneList'), empty = $('#sceneEmpty'), cnt = $('#sceneCount');
    if (!list) return;
    if (cnt) cnt.textContent = String(state.scenes.length);
    if (empty) empty.classList.toggle('hidden', state.scenes.length > 0);
    list.innerHTML = state.scenes.map((sc, i) => {
      const sent = (state.script && state.script.sentences[i]) ? state.script.sentences[i].text : '';
      return '<div class="scene ' + (sc.muted ? 'off' : '') + '" data-scene="' + i + '">' +
        '<div class="thumb"><canvas width="104" height="128" data-scene-canvas="' + i + '"></canvas></div>' +
        '<div class="meta"><b>' + (sc.muted ? '장면 없음 (빼짐)' : esc(sc.label)) + '</b>' +
        '<span>' + (sc.muted ? '자막·제목만 나옴' : SCENE_KIND_LABEL[sc.kind] + ' · ' + esc(sc.source)) + '</span>' +
        '<div class="sent">' + pad(i + 1) + ' · ' + esc(sent.slice(0, 30)) + '</div></div>' +
        '<div class="acts"><button class="btn xs ghost" type="button" data-scene-jump="' + i + '">보기</button>' +
        '<button class="btn xs ' + (sc.muted ? 'mint' : 'danger') + '" type="button" data-scene-mute="' + i + '">' + (sc.muted ? '복원' : '빼기') + '</button>' +
        '<button class="btn xs soft" type="button" data-scene-swap="' + i + '">장면 추가</button></div></div>';
    }).join('');
    state.scenes.forEach((sc, i) => {
      const cv = list.querySelector('[data-scene-canvas="' + i + '"]');
      if (!cv) return;
      const ctx = cv.getContext('2d');
      if (sc.muted) { ctx.fillStyle = '#0a0f16'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.fillStyle = '#3f5168'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('—', cv.width / 2, cv.height / 2); return; }
      const lg = ctx.createLinearGradient(0, 0, cv.width, cv.height);
      lg.addColorStop(0, sc.palette[1] || '#26344a'); lg.addColorStop(1, sc.palette[0] || '#ff7a45');
      ctx.fillStyle = lg; ctx.fillRect(0, 0, cv.width, cv.height);
      drawMotif(ctx, cv.width, cv.height, sc.motif, i * 0.7, sc.palette);
    });
  }

  function muteScene(i) {
    const sc = state.scenes[i]; if (!sc) return;
    sc.muted = !sc.muted; renderScenes(); drawPreview();
    toast(sc.muted ? '장면을 뺐습니다 · 자막만 나옵니다' : '장면을 되살렸습니다');
  }
  function swapScene(i) {
    const sc = state.scenes[i]; if (!sc) return;
    if (sc.muted) { sc.muted = false; renderScenes(); drawPreview(); toast('장면을 되살렸습니다'); return; }
    const files = state.files;
    if (sc.kind === 'clip' || files.length) {
      // 내 영상 → 다음 영상 → 레퍼런스/생성
      const order = files.map(f => f.id);
      const cur = order.indexOf(sc.fileId);
      if (cur >= 0 && order.length > 1) {
        sc.kind = 'clip'; sc.fileId = order[(cur + 1) % order.length];
        sc.label = files.find(f => f.id === sc.fileId).name; sc.source = '내 영상';
        renderScenes(); drawPreview(); toast('다음 내 영상으로 교체했습니다'); return;
      }
      if (state.refs.length) {
        const ridx = state.refs.findIndex(r => r.id === sc.refId);
        const ref = state.refs[(ridx + 1) % state.refs.length];
        sc.kind = 'ref'; sc.refId = ref.id; sc.motif = ref.motif; sc.palette = ref.palette;
        sc.label = ref.title; sc.source = PLATFORMS[ref.platform].name;
        renderScenes(); drawPreview(); toast('레퍼런스 장면으로 교체했습니다'); return;
      }
    }
    if (sc.kind === 'ref' && state.refs.length > 1) {
      const ridx = state.refs.findIndex(r => r.id === sc.refId);
      const ref = state.refs[(ridx + 1) % state.refs.length];
      sc.refId = ref.id; sc.motif = ref.motif; sc.palette = ref.palette; sc.label = ref.title; sc.source = PLATFORMS[ref.platform].name;
      renderScenes(); drawPreview(); toast('다른 레퍼런스로 교체했습니다'); return;
    }
    sc.kind = 'generated'; sc.motif = (sc.motif + 1) % 6; sc.label = '자동 생성 장면 ' + (sc.motif + 1); sc.source = '자동 생성';
    renderScenes(); drawPreview(); toast('새 장면을 추가했습니다');
  }
  function jumpScene(i) {
    const tl = previewTimeline();
    if (!tl[i]) return;
    PV.t = tl[i].start + 0.02; drawPreview(); updatePlayhead();
    toast('미리보기를 ' + (i + 1) + '번 문장으로 이동했습니다', 'good');
  }

  /* ---------------- preview timeline ---------------- */
  function previewTimeline() {
    if (state.subTl && state.subTl.length) return state.subTl;
    if (state.voice) return state.voice.timeline;
    if (!state.script) return [];
    const gap = state.voiceGap;
    let t = 0;
    return state.script.sentences.map((s, i) => {
      const d = clamp((s.text || '').length * 0.15, 1.3, 6);
      const row = { i, start: t, dur: d, end: t + d };
      t += d + gap;
      return row;
    });
  }
  function totalDuration() { const tl = previewTimeline(); return tl.length ? tl[tl.length - 1].end : 0; }
  function indexAt(t) {
    const tl = previewTimeline();
    const gap = (state.subTl && state.subTl.length) ? 0 : (state.voice && state.voice.gap != null ? state.voice.gap : state.voiceGap);
    for (const row of tl) { if (t >= row.start && t < row.end + gap) return row.i; }
    return tl.length ? tl[tl.length - 1].i : -1;
  }

  /* ---------------- renderer ---------------- */
  const FONT_STACK = {
    sans: "'Noto Sans CJK KR','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif",
    black: "'Noto Sans CJK KR','Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif",
    serif: "'Noto Serif CJK KR','Noto Serif KR','Nanum Myeongjo','Batang',serif",
    mono: "'Noto Sans Mono CJK KR','DejaVu Sans Mono','Noto Sans CJK KR',monospace"
  };

  function drawVideoCover(ctx, v, W, H, zoom) {
    const vw = v.videoWidth || 9, vh = v.videoHeight || 16;
    const s = Math.max(W / vw, H / vh) * (zoom || 1);
    const dw = vw * s, dh = vh * s;
    ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }

  function drawScene(ctx, W, H, sc, localT, globalT) {
    const pal = sc.palette || ['#ff7a45', '#6b4bff'];
    const lg = ctx.createLinearGradient(0, 0, W, H);
    lg.addColorStop(0, pal[1] || '#1d2a3a'); lg.addColorStop(0.62, pal[0] || '#ff7a45'); lg.addColorStop(1, '#0a0f16');
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    let drew = false;
    if (sc.kind === 'clip') {
      const f = state.files.find(x => x.id === sc.fileId);
      if (f && f.el && f.el.readyState >= 2) {
        try {
          const dur = f.el.duration || f.duration || 1;
          const vt = (localT + (sc.start || 0)) % Math.max(0.2, dur);
          if (Math.abs(f.el.currentTime - vt) > 0.32) { try { f.el.currentTime = vt; } catch (e) {} }
          drawVideoCover(ctx, f.el, W, H, 1.02 + Math.sin(globalT * 0.5 + sc.i) * 0.02);
          drew = true;
        } catch (e) {}
      }
    }
    if (!drew) drawMotif(ctx, W, H, sc.motif || 0, globalT * 0.8 + sc.i * 1.3, pal);
    // 상단/하단 가독성 스크림
    const tg = ctx.createLinearGradient(0, 0, 0, H * 0.3);
    tg.addColorStop(0, 'rgba(0,0,0,.55)'); tg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = tg; ctx.fillRect(0, 0, W, H * 0.3);
    const bg = ctx.createLinearGradient(0, H * 0.55, 0, H);
    bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(1, 'rgba(0,0,0,.62)');
    ctx.fillStyle = bg; ctx.fillRect(0, H * 0.55, W, H * 0.45);
  }

  function applyBlurRegion(ctx, W, H, x, y, w, h, px, mode) {
    if (mode === 'mosaic') return applyMosaic(ctx, W, H, x, y, w, h, px);
    const pad = Math.min(H, Math.round(px * 2));
    const sx = Math.max(0, x - pad), sy = Math.max(0, y - pad);
    const sw =Math.min(W - sx, w + pad * 2), sh = Math.min(H - sy, h + pad * 2);
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(sw)); off.height = Math.max(1, Math.round(sh));
    const oc = off.getContext('2d');
    oc.drawImage(ctx.canvas, sx, sy, sw, sh, 0, 0, off.width, off.height);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    try { ctx.filter = 'blur(' + Math.max(1, px) + 'px)'; } catch (e) {}
    ctx.drawImage(off, sx, sy, sw, sh);
    ctx.restore();
  }

  function applyMosaic(ctx, W, H, x, y, w, h, block) {
    const bw = Math.max(2, Math.round(w / block));
    const bh = Math.max(2, Math.round(h / block));
    const small = document.createElement('canvas');
    small.width = bw; small.height = bh;
    const sc = small.getContext('2d');
    sc.imageSmoothingEnabled = false;
    try { sc.drawImage(ctx.canvas, x, y, w, h, 0, 0, bw, bh); } catch (e) { return; }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, bw, bh, x, y, w, h);
    ctx.restore();
    // 살짝 블러 레이어
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.restore();
  }

  function wrapRich(ctx, text, maxW, font) {
    ctx.font = font;
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = []; let line = []; let wsum = 0;
    const space = ctx.measureText(' ').width;
    for (const w of words) {
      const ww = ctx.measureText(w).width;
      if (line.length && wsum + space + ww > maxW) { lines.push(line); line = [w]; wsum = ww; }
      else { line.push(w); wsum += (line.length > 1 ? space : 0) + ww; }
    }
    if (line.length) lines.push(line);
    return { lines, space };
  }

  function normWord(w) { return String(w || '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase(); }

  function drawRichLine(ctx, line, space, x, y, hlWords, baseColor, hlColor, strokeColor) {
    let total = 0;
    const widths = line.map(w => ctx.measureText(w).width);
    line.forEach((w, i) => { total += widths[i] + (i ? space : 0); });
    let cx = x - total / 2;
    const prevAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    line.forEach((w, i) => {
      const nw = normWord(w);
      const isHl = hlWords.some(h => nw && (nw === h || (h.length > 1 && nw.includes(h))));
      ctx.fillStyle = isHl ? hlColor : baseColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = Math.max(2, Math.round(ctx.canvas.height * 0.006));
      ctx.lineJoin = 'round';
      ctx.strokeText(w, cx, y);
      ctx.fillText(w, cx, y);
      cx += widths[i] + space;
    });
    ctx.textAlign = prevAlign;
  }

  function fitFont(ctx, text, maxW, size, weight, family, min) {
    let s = size;
    const set = () => { ctx.font = weight + ' ' + s + 'px ' + family; };
    set();
    while (s > (min || 18) && ctx.measureText(text || '').width > maxW) { s -= 2; set(); }
    return s;
  }

  // (광고) 배지·대가성 문구 상자 — 유튜브 쇼츠 모바일 UI를 피한 자리(1080×1920 기준).
  //   위에서 190px: 상단 검색·카메라·더보기 아이콘 줄 아래 / 우측 여백 40px
  //   아래에서 400px: 채널명·제목·진행바가 깔리는 아래 390px 위
  const AD_SAFE = { top: 0.099, bottom: 0.792, right: 0.037 };
  function adBox(W, H, ad, textWidth, fontSize) {
    const pad = fontSize * 0.55, h = fontSize + pad * 1.4;
    if (ad === 'coupang') {
      const w = Math.min(W * 0.94, textWidth + pad * 2);
      return { x: W / 2 - w / 2, y: H * AD_SAFE.bottom - h, w, h, tx: W / 2, align: 'center' };
    }
    const w = textWidth + pad * 2;
    const x = W - Math.round(W * AD_SAFE.right) - w;
    return { x, y: H * AD_SAFE.top, w, h, tx: x + pad, align: 'left' };
  }

  /* ================================================================
     자막 모션 15종 (1탄 motion-library 이식) + 스마트 자막 위치
     ----------------------------------------------------------------
     외부 의존성 0. 계산·레이아웃·그리기를 모두 이 파일 안에서 한다.
     미리보기(#previewCanvas)와 WebM 내보내기(MediaRecorder)가 같은 drawFrame()을
     쓰므로, 같은 모션 코드가 두 경로에 그대로 적용된다.
     ================================================================ */
  const CAP_MOTIONS = [
    { id: 'outline-basic', label: '기본 외곽선', family: '기본', note: '움직이지 않는 안전한 기본값입니다. 흰 글자 + 검은 외곽선.' },
    { id: 'pop-bounce', label: '팝·바운스', family: '스케일', note: '낱말마다 0.55배에서 튕겨 올라옵니다. 숏폼에서 가장 무난한 기본 모션.' },
    { id: 'typewriter', label: '타자기', family: '등장', note: '한 글자씩 찍히고 커서가 깜빡입니다. 정보형 첫 문장에 어울립니다.' },
    { id: 'shift-key', label: '시프트 키', family: '낱말', note: '낱말이 또각또각 박히듯 1.35배에서 내려앉습니다. 핵심 낱말 강조.' },
    { id: 'chip-wipe', label: '칩 와이프', family: '배경', note: '어두운 칩이 좌→우로 깔리고 그 위로 글자가 드러납니다. 소제목용.' },
    { id: 'rise-lines', label: '줄마다 올라오기', family: '줄', note: '줄 단위로 아래에서 올라오며 나타납니다. 2줄 설명·브릿지 자막.' },
    { id: 'word-highlight', label: '낱말 강조', family: '색', note: '강조 낱말만 노란색으로 커졌다 작아지며 맥동합니다. 명사·숫자 강조.' },
    { id: 'emoji-attach', label: '이모지 부착', family: '장식', note: '문장 끝에 리액션 이모지가 톡 붙습니다. 문장 내용에 맞춰 이모지를 고릅니다.' },
    { id: 'count-up', label: '숫자 카운트', family: '숫자', note: '숫자가 0에서 목표값까지 올라갑니다. 조회수·기간·금액에 적합.' },
    { id: 'random-appear', label: '무작위 등장', family: '등장', note: '글자가 제각각 순서로 톡톡 나타납니다. 의성어·짧은 감탄.' },
    { id: 'slide-in-top', label: '위에서 내려오기', family: '이동', note: '문장 전체가 위에서 내려옵니다. 컷 직후 새 정보를 넣을 때.' },
    { id: 'jelly', label: '젤리 글자', family: '스케일', note: '글자마다 젤리처럼 출렁이며 등장합니다. 귀여운 예능 톤.' },
    { id: 'led-marquee', label: 'LED 전광판', family: '반복', note: '전광판처럼 글자가 차례로 켜지고 색이 흘러갑니다. 짧은 문구 반복.' },
    { id: 'zoom-swap', label: '줌 아웃 교체', family: '스케일', note: '1.65배에서 줄어들며 등장하고, 끝나면 작아지며 사라집니다.' },
    { id: 'color-fill', label: '색 입히기', family: '색', note: '흰 글자에 강조색이 좌→우로 채워집니다. 결론 문장·유도 한 줄.' }
  ];
  const MOTION_BY_ID = {};
  CAP_MOTIONS.forEach(m => { MOTION_BY_ID[m.id] = m; });
  // 모션이 순간적으로 커지는 배율 — 광고·고지 문구와 겹치지 않게 자리 계산에 쓴다
  const CAP_MAX_SCALE = { 'pop-bounce': 1.22, 'zoom-swap': 1.65, 'jelly': 1.34, 'shift-key': 1.35, 'word-highlight': 1.16, 'emoji-attach': 1.15 };

  const EASE = {
    outCubic: p => 1 - Math.pow(1 - p, 3),
    inCubic: p => p * p * p,
    inOutCubic: p => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2,
    outBack: (p, s) => { s = s == null ? 1.70158 : s; const c = s + 1; return 1 + c * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2); },
    outExpo: p => p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)
  };
  const EMOJI_FONT = '"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji","Noto Emoji",sans-serif';

  function toRgb(h) {
    const s = String(h || '#ffffff').replace('#', '');
    const n = parseInt(s.length === 3 ? s.split('').map(c => c + c).join('') : s, 16);
    return isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 255, 255];
  }
  function mixColor(a, b, t) {
    const A = toRgb(a), B = toRgb(b); t = clamp(t, 0, 1);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }

  const EMOJI_RULES = [
    [/(할인|가격|최저가|반값|원\b|쿠팡)/, '💰'],
    [/(불|화재|뜨거|열기|화력)/, '🔥'],
    [/(물|세척|씻|습기|비가|곰팡)/, '💧'],
    [/(먹|맛|요리|음식|식사)/, '😋'],
    [/(빠르|속도|초만|분이면|즉시)/, '⚡'],
    [/(청소|먼지|정리|수납)/, '🧹'],
    [/(운동|다이어트|무게|가볍)/, '💪'],
    [/(잠|수면|밤에)/, '🌙'],
    [/(아이|아기|반려|강아지|고양이|펫)/, '🐾'],
    [/(주의|위험|실수|사고)/, '⚠️'],
    [/(추천|좋아|최고|만족|후회)/, '👍']
  ];
  function pickEmoji(text) {
    const s = String(text || '');
    for (const [re, e] of EMOJI_RULES) if (re.test(s)) return e;
    return '✨';
  }

  /* --- 레이아웃: 단어·글자 단위로 x 좌표까지 계산한다(모션이 글자마다 움직이려면 필요) --- */
  function captionLayout(ctx, text, maxW, font, hlWords) {
    ctx.font = font;
    const space = ctx.measureText(' ').width;
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const rows = []; let cur = [], curW = 0;
    for (const w of words) {
      const ww = ctx.measureText(w).width;
      if (cur.length && curW + space + ww > maxW) { rows.push(cur); cur = [w]; curW = ww; }
      else { cur.push(w); curW += (cur.length > 1 ? space : 0) + ww; }
    }
    if (cur.length) rows.push(cur);
    const hl = hlWords || [];
    let width = 0;
    const lines = rows.map(line => {
      const widths = line.map(w => ctx.measureText(w).width);
      const total = widths.reduce((a, b) => a + b, 0) + space * Math.max(0, line.length - 1);
      width = Math.max(width, total);
      let x = -total / 2;
      const ws = line.map((w, i) => {
        const chars = []; let cx = x;
        for (const ch of Array.from(w)) { const cw = ctx.measureText(ch).width; chars.push({ ch, x: cx + cw / 2, w: cw }); cx += cw; }
        const nw = normWord(w);
        const isHl = hl.some(h => nw && h && (nw === h || (h.length > 1 && nw.includes(h))));
        const o = { text: w, x: x + widths[i] / 2, w: widths[i], chars, hl: isHl };
        x += widths[i] + space;
        return o;
      });
      return { words: ws, width: total };
    });
    return { space, lines, width };
  }

  function captionModel(ctx, W, H, text, st, hlWords) {
    let fs = Math.round(st.capSize * (W / 540));
    const maxW = W * 0.9;
    const fam = FONT_STACK[st.capFont] || FONT_STACK.sans;
    let font = '', lay = null;
    // 자막은 최대 4줄: 넘치면 글자를 줄여 영상 밖으로 나가지 않게 한다
    for (let guard = 0; guard < 14; guard++) {
      font = '800 ' + fs + 'px ' + fam;
      lay = captionLayout(ctx, text, maxW, font, hlWords);
      if (lay.lines.length <= 4 || fs <= 18) break;
      fs -= 2;
    }
    return { fs, font, lineH: fs * 1.28, space: lay.space, lines: lay.lines, width: lay.width };
  }

  /* --- 그리기 기본기: 외곽선 + 채우기 한 덩어리 --- */
  function paintText(ctx, str, cx, cy, o) {
    o = o || {};
    const a = clamp((o.alpha == null ? 1 : o.alpha) * (o.fade == null ? 1 : o.fade), 0, 1);
    if (a <= 0.004 || !str) return;
    ctx.save();
    ctx.globalAlpha = clamp(ctx.globalAlpha * a, 0, 1);
    ctx.translate(cx + (o.dx || 0), cy + (o.dy || 0));
    if (o.rot) ctx.rotate(o.rot * Math.PI / 180);
    const sx = o.scaleX != null ? o.scaleX : (o.scale == null ? 1 : o.scale);
    const sy = o.scaleY != null ? o.scaleY : (o.scale == null ? 1 : o.scale);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    if (o.font) ctx.font = o.font;
    ctx.fillStyle = o.color || '#ffffff';
    if (o.sw > 0) {
      ctx.strokeStyle = o.stroke || '#000000'; ctx.lineWidth = o.sw;
      ctx.lineJoin = 'round'; ctx.miterLimit = 2;
      ctx.strokeText(str, 0, 0);
    }
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }

  function countText(str, e) {
    return String(str).replace(/\d[\d,]*(?:\.\d+)?/g, m => {
      const dec = (m.split('.')[1] || '').length;
      const raw = Number(m.replace(/,/g, ''));
      if (!isFinite(raw)) return m;
      const v = raw * e;
      let out = dec ? v.toFixed(dec) : String(Math.round(v));
      if (m.includes(',')) out = Number(out).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      return out;
    });
  }

  /* --- 15종 렌더러 --- */
  const CAP_RENDER = {
    'outline-basic'(ctx, M) {
      M.lines.forEach((line, li) => {
        const cy = M.startY + li * M.lineH;
        for (const w of line.words) paintText(ctx, w.text, M.cx + w.x, cy, { color: w.hl ? M.accent : M.base, sw: M.sw, stroke: M.stroke, fade: M.exitFade });
      });
    },

    'pop-bounce'(ctx, M) {
      let g = 0;
      const breathe = 1 + 0.012 * Math.sin(M.lt * (Math.PI * 2 / 2.2));
      M.lines.forEach((line, li) => {
        const cy = M.startY + li * M.lineH;
        for (const w of line.words) {
          const p = clamp((M.lt - g * 0.085) / 0.34, 0, 1);
          const e = EASE.outBack(p, 1.7);
          paintText(ctx, w.text, M.cx + w.x, cy, {
            alpha: clamp(p * 3.2, 0, 1), fade: M.exitFade,
            scale: (0.55 + 0.45 * e) * breathe,
            dy: 0.18 * M.fs * (1 - e), rot: -4 * (1 - e),
            color: w.hl ? M.accent : M.base, sw: M.sw, stroke: M.stroke
          });
          g++;
        }
      });
    },

    typewriter(ctx, M) {
      let gi = 0, lastC = null, lastCy = 0;
      const totalCh = M.lines.reduce((a, l) => a + l.words.reduce((b, w) => b + w.chars.length, 0), 0);
      const step = Math.min(0.045, (M.dur * 0.72) / Math.max(1, totalCh));
      const n = Math.floor(M.lt / step) + 1;
      M.lines.forEach((line, li) => {
        const cy = M.startY + li * M.lineH;
        for (const w of line.words) {
          for (const c of w.chars) {
            if (gi < n) {
              paintText(ctx, c.ch, M.cx + c.x, cy, { color: w.hl ? M.accent : M.base, sw: M.sw, stroke: M.stroke, fade: M.exitFade });
              lastC = c; lastCy = cy;
            }
            gi++;
          }
        }
      });
      if (lastC && n <= totalCh && Math.sin(M.lt * 9) > -0.2) {
        paintText(ctx, '|', M.cx + lastC.x + lastC.w / 2 + M.fs * 0.07, lastCy, { color: M.accent, sw: M.sw * 0.6, stroke: M.stroke, alpha: 0.9, fade: M.exitFade });
      }
    },

    'shift-key'(ctx, M) {
      let g = 0;
      M.lines.forEach((line, li) => {
        const cy = M.startY + li * M.lineH;
        for (const w of line.words) {
          const p = clamp((M.lt - g * 0.07) / 0.2, 0, 1);
          const e = EASE.outBack(p, 3.4);
          paintText(ctx, w.text, M.cx + w.x, cy, {
            alpha: clamp(p * 2.6, 0, 1), fade: M.exitFade,
            scale: 1.35 - 0.35 * e, dy: -0.06 * M.fs * (1 - e),
            color: w.hl ? M.accent : M.base, sw: M.sw, stroke: M.stroke
          });
          g++;
        }
      });
    },

    'chip-wipe'(ctx, M) {
      M.lines.forEach((line, li) => {
        const cy = M.startY + li * M.lineH;
        const p = clamp((M.lt - li * 0.09) / 0.42, 0, 1);
        const e = EASE.outCubic(p);
        const padX = M.fs * 0.5, h = M.fs * 1.26;
        const full = line.width + padX * 2;
        const x0 = M.cx - line.width / 2 - padX, y0 = cy - h / 2;
        const w = Math.max(2, full * (0.03 + 0.97 * e));
        ctx.save();
        ctx.globalAlpha = clamp(ctx.globalAlpha * clamp(p * 5, 0, 1) * M.exitFade, 0, 1);
        roundRect(ctx, x0, y0, w, h, Math.min(h * 0.3, w / 2)); ctx.fillStyle = 'rgba(8,12,18,.80)'; ctx.fill();
        ctx.fillStyle = M.accent; roundRect(ctx, x0 + 3, y0 + 3, Math.min(6, w * 0.18), h - 6, 3); ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
        for (const wd of line.words) paintText(ctx, wd.text, M.cx + wd.x, cy, { color: wd.hl ? M.accent : M.base, sw: M.sw, stroke: M.stroke, fade: M.exitFade });
        ctx.restore();
      });
    },

    'rise-lines'(ctx, M) {
      M.lines.forEach((line, li) => {
        const cy = M.startY + li * M.lineH;
        const p = clamp((M.lt - li * 0.12) / 0.5, 0, 1);
        const dy = 0.5 * M.fs * (1 - EASE.outCubic(p));
        for (const w of line.words) paintText(ctx, w.text, M.cx + w.x, cy + dy, { alpha: clamp(p * 1.6, 0, 1), fade: M.exitFade, color: w.hl ? M.accent : M.base, sw: M.sw, stroke: M.stroke });
      });
    },

    'word-highlight'(ctx, M) {
      let g = 0;
      const appear = clamp(M.lt / 0.22, 0, 1);
      M.lines.forEach((line, li) => {
        const cy = M.startY + li * M.lineH;
        for (const w of line.words) {
          const hot = w.hl || (M.hlFallback && !M.hlAny && w.text === M.hlFallback);
          const p = hot ? clamp((M.lt - 0.15 - g * 0.08) / 0.2, 0, 1) : 0;
          const pulse = hot ? 0.5 + 0.5 * Math.sin(M.lt * 4.4 - g * 0.8) : 0;
          paintText(ctx, w.text, M.cx + w.x, cy, {
            alpha: appear, fade: M.exitFade,
            scale: hot ? 1 + 0.16 * pulse * p : 1,
            color: hot ? M.accent : M.base, sw: M.sw, stroke: M.stroke
          });
          g++;
        }
      });
    },

    'emoji-attach'(ctx, M) {
      let g = 0;
      M.lines.forEach((line, li) => {
        const cy = M.startY + li * M.lineH;
        for (const w of line.words) {
          const p = clamp((M.lt - g * 0.03) / 0.25, 0, 1);
          paintText(ctx, w.text, M.cx + w.x, cy, { alpha: p, fade: M.exitFade, dy: 0.08 * M.fs * (1 - p), color: w.hl ? M.accent : M.base, sw: M.sw, stroke: M.stroke });
          g++;
        }
      });
      const line = M.lines[M.lines.length - 1];
      if (!line) return;
      const pe = clamp((M.lt - 0.42) / 0.34, 0, 1);
      if (pe <= 0.01) return;
      const eb = EASE.outBack(pe, 2.6);
      const cy = M.startY + (M.lines.length - 1) * M.lineH;
      const ex = Math.min(M.W - M.fs * 0.5, M.cx + line.width / 2 + M.fs * 0.5);
      const ey = cy - M.fs * 0.2 - Math.abs(Math.sin(M.lt * 3)) * M.fs * 0.05;
      ctx.save();
      ctx.globalAlpha = clamp(ctx.globalAlpha * clamp(pe * 2, 0, 1) * M.exitFade, 0, 1);
      ctx.translate(ex, ey);
      ctx.rotate((-8 * (1 - eb)) * Math.PI / 180);
      const s = Math.max(0.01, 0.45 + 0.55 * eb);
      ctx.scale(s, s);
      ctx.font = Math.round(M.fs * 0.9) + 'px ' + EMOJI_FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(M.emoji, 0, 0);
      ctx.restore();
    },

    'count-up'(ctx, M) {
      if (!M.hasNum) return CAP_RENDER.typewriter(ctx, M);
      let g = 0;
      M.lines.forEach((line, li) => {
        const cy = M.startY + li * M.lineH;
        for (const w of line.words) {
          const p = clamp((M.lt - 0.04) / 0.9, 0, 1);
          const e = EASE.outExpo(p);
          const txt = countText(w.text, e);
          const pop = p > 0.86 ? 1 + 0.07 * Math.sin((p - 0.86) / 0.14 * Math.PI) : 1;
          const appears = /\d/.test(w.text) ? 1 : clamp((M.lt - 0.2 - g * 0.02) / 0.25, 0, 1);
          paintText(ctx, txt, M.cx + w.x, cy, { alpha: appears, fade: M.exitFade, scale: pop, color: w.hl ? M.accent : M.base, sw: M.sw, stroke: M.stroke });
          g++;
        }
      });
    },

    'random-appear'(ctx, M) {
      let gi = 0;
      const seedBase = hash32(M.text || 'x');
      M.lines.forEach((line, li) => {
        const cy = M.startY + li * M.lineH;
        for (const w of line.words) {
          for (const c of w.chars) {
            const r = rng((seedBase + gi * 2654435761) >>> 0);
            const delay = 0.04 + r() * 0.42;
            const p = clamp((M.lt - delay) / 0.3, 0, 1);
            const e = EASE.outBack(p, 2.2);
            paintText(ctx, c.ch, M.cx + c.x, cy, {
              alpha: clamp(p * 2.6, 0, 1), fade: M.exitFade,
              scale: 0.62 + 0.38 * e,
              dy: (r() * 2 - 1) * 0.12 * M.fs * (1 - e),
              rot: (r() * 2 - 1) * 8 * (1 - e),
              color: w.hl ? M.accent : M.base, sw: M.sw, stroke: M.stroke
            });
            gi++;
          }
        }
      });
    },

    'slide-in-top'(ctx, M) {
      M.lines.forEach((line, li) => {
        const cy = M.startY + li * M.lineH;
        const p = clamp((M.lt - li * 0.06) / 0.42, 0, 1);
        const dy = -0.6 * M.fs * (1 - EASE.outCubic(p));
        for (const w of line.words) paintText(ctx, w.text, M.cx + w.x, cy + dy, { alpha: clamp(p * 2.6, 0, 1), fade: M.exitFade, color: w.hl ? M.accent : M.base, sw: M.sw, stroke: M.stroke });
      });
    },

    jelly(ctx, M) {
      let gi = 0;
      M.lines.forEach((line, li) => {
        const cy = M.startY + li * M.lineH;
        for (const w of line.words) {
          for (const c of w.chars) {
            const t2 = Math.max(0, M.lt - gi * 0.035);
            const damp = Math.exp(-4.6 * t2);
            const wob = Math.sin(t2 * 17) * damp;
            paintText(ctx, c.ch, M.cx + c.x, cy + 0.08 * M.fs * wob, {
              alpha: clamp(t2 * 9, 0, 1), fade: M.exitFade,
              scale: 1 + 0.34 * wob, rot: 7 * wob,
              color: w.hl ? M.accent : M.base, sw: M.sw, stroke: M.stroke
            });
            gi++;
          }
        }
      });
    },

    'led-marquee'(ctx, M) {
      const left = M.cx - M.width / 2;
      const span = Math.max(1, M.width);
      const sweep = ((M.lt * 0.9) % 1.7) - 0.35;
      const blink = 0.86 + 0.14 * Math.sin(M.lt * 7.5);
      M.lines.forEach((line, li) => {
        const cy = M.startY + li * M.lineH;
        for (const w of line.words) {
          for (const c of w.chars) {
            const u = (M.cx + c.x - left) / span;
            const lit = clamp(1 - Math.abs(u - sweep) * 1.5, 0, 1);
            const col = mixColor(M.base, M.accent, lit);
            paintText(ctx, c.ch, M.cx + c.x, cy, { alpha: (0.52 + 0.48 * lit) * blink, fade: M.exitFade, color: col, sw: M.sw, stroke: M.stroke });
          }
        }
      });
    },

    'zoom-swap'(ctx, M) {
      const p = clamp(M.lt / 0.36, 0, 1);
      const e = EASE.outCubic(p);
      const pe = clamp((M.lt - (M.dur - 0.22)) / 0.22, 0, 1);
      let s = (1.65 - 0.65 * e) * (1 - 0.28 * pe);
      const fit = M.width > 1 ? Math.min(1, (M.W * 0.96) / M.width) : 1;
      if (s > 1) s = 1 + (s - 1) * fit;
      const cy = M.startY + (M.lines.length - 1) * M.lineH / 2;
      ctx.save();
      ctx.globalAlpha = clamp(ctx.globalAlpha * clamp(p * 2.2, 0, 1) * (1 - pe), 0, 1);
      ctx.translate(M.cx, cy); ctx.scale(s, s); ctx.translate(-M.cx, -cy);
      M.lines.forEach((line, li) => {
        const yy = M.startY + li * M.lineH;
        for (const w of line.words) paintText(ctx, w.text, M.cx + w.x, yy, { color: w.hl ? M.accent : M.base, sw: M.sw / s, stroke: M.stroke });
      });
      ctx.restore();
    },

    'color-fill'(ctx, M) {
      const appear = clamp(M.lt / 0.16, 0, 1);
      M.lines.forEach((line, li) => {
        const cy = M.startY + li * M.lineH;
        for (const w of line.words) paintText(ctx, w.text, M.cx + w.x, cy, { alpha: appear, fade: M.exitFade, color: M.base, sw: M.sw, stroke: M.stroke });
      });
      const p = EASE.inOutCubic(clamp(M.lt / 0.7, 0, 1));
      if (p <= 0.001) return;
      const x0 = M.cx - M.width / 2 - M.fs * 0.2;
      const wAll = (M.width + M.fs * 0.4) * p;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, M.startY - M.lineH, Math.max(0.5, wAll), M.lineH * (M.lines.length + 0.4));
      ctx.clip();
      M.lines.forEach((line, li) => {
        const cy = M.startY + li * M.lineH;
        for (const w of line.words) paintText(ctx, w.text, M.cx + w.x, cy, { alpha: appear, fade: M.exitFade, color: M.accent, sw: M.sw, stroke: M.stroke });
      });
      ctx.restore();
    }
  };

  function renderCaption(ctx, M) {
    const fn = CAP_RENDER[M.motion] || CAP_RENDER['outline-basic'];
    try { fn(ctx, M); } catch (e) { try { CAP_RENDER['outline-basic'](ctx, M); } catch (e2) {} }
  }

  /* ---------------- 스마트 자막 위치: 얼굴 회피 + 여백(복잡도) 분석 ---------------- */
  const SMART = {
    supported: (typeof window !== 'undefined' && typeof window.FaceDetector === 'function'),
    det: null, faces: [], facesAt: 0, busy: false, failed: false,
    key: '', yFrac: 0.78, at: 0, last: null
  };

  // 순수 함수: 밝기 배열에서 띠별 복잡도(에지·분산)와 얼굴 겹침을 점수화한다.
  //   낮은 점수 = 한산한 자리. 테스트에서 합성 데이터로 직접 검증한다.
  function analyzeBands(lum, w, h, o) {
    o = o || {};
    const yMin = o.yMin == null ? 0.22 : o.yMin;
    const yMax = o.yMax == null ? 0.985 : o.yMax;
    const capH = o.capH == null ? h * 0.1 : o.capH;
    const base = o.base == null ? 0.78 : o.base;
    const faces = o.faces || [];
    const n = o.count || 7;
    // 단위 주의: yMin/yMax/base는 화면 대비 비율(0~1), capH는 표본 픽셀 단위다.
    const capHpx = Math.max(2, capH);
    const x0 = Math.round(w * 0.05), x1 = Math.max(x0 + 2, Math.round(w * 0.95));
    const lo = Math.max(0, yMin * h + capHpx / 2), hi = Math.max(lo, yMax * h - capHpx / 2);
    const span = Math.max(0.0001, hi - lo);
    const out = [];
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0.5 : i / (n - 1);
      const yc = lo + span * f;
      const ya = clamp(yc - capHpx / 2, 0, h), yb = clamp(yc + capHpx / 2, 0, h);
      const r0 = Math.max(0, Math.floor(ya)), r1 = Math.min(h, Math.ceil(yb));
      let sum = 0, sum2 = 0, grad = 0, cnt = 0;
      for (let y = r0; y < r1; y++) {
        for (let x = x0; x < x1; x++) {
          const v = lum[y * w + x];
          sum += v; sum2 += v * v; cnt++;
          if (x + 1 < x1) grad += Math.abs(lum[y * w + x + 1] - v);
          if (y + 1 < r1) grad += Math.abs(lum[(y + 1) * w + x] - v);
        }
      }
      if (!cnt) continue;
      const mean = sum / cnt;
      const sd = Math.sqrt(Math.max(0, sum2 / cnt - mean * mean));
      const g = grad / cnt;
      let score = (g / 42) * 0.62 + (sd / 62) * 0.38;
      if (mean > 196) score += (mean - 196) / 40;          // 아주 밝은 곳(흰 배경)은 피한다
      const rx0 = x0 / w, rx1 = x1 / w, ry0 = ya / h, ry1 = yb / h;
      let ov = 0;
      for (const fc of faces) {
        const ix = Math.max(0, Math.min(rx1, fc.x + fc.w) - Math.max(rx0, fc.x));
        const iy = Math.max(0, Math.min(ry1, fc.y + fc.h) - Math.max(ry0, fc.y));
        ov += ix * iy;
      }
      ov = Math.min(1, ov / Math.max(0.0001, (rx1 - rx0) * (ry1 - ry0)));
      if (ov > 0.02) score += 3 + ov * 6;                  // 얼굴 위는 사실상 배제
      score += Math.abs(yc / h - base) * 0.12;             // 사용자가 정한 위치에서 크게 벗어나지 않게
      out.push({ yc, yFrac: yc / h, score, grad: g, sd, mean, faceOverlap: ov, ok: !(ov > 0.02) });
    }
    const ranked = out.slice().sort((a, b) => a.score - b.score);
    return { best: ranked[0] || null, bands: out, ranked };
  }

  const SAMPLE = { cv: null, g: null, w: 96, h: 171 };
  function sampleScene(srcCtx) {
    if (!SAMPLE.cv) {
      SAMPLE.cv = document.createElement('canvas');
      SAMPLE.g = SAMPLE.cv.getContext('2d', { willReadFrequently: true });
    }
    SAMPLE.cv.width = SAMPLE.w; SAMPLE.cv.height = SAMPLE.h;
    const g = SAMPLE.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, SAMPLE.w, SAMPLE.h);
    try { g.drawImage(srcCtx.canvas, 0, 0, SAMPLE.w, SAMPLE.h); } catch (e) { return null; }
    let img;
    try { img = g.getImageData(0, 0, SAMPLE.w, SAMPLE.h); } catch (e) { return null; }
    const d = img.data, n = SAMPLE.w * SAMPLE.h, lum = new Float32Array(n);
    for (let i = 0, p = 0; p < n; i += 4, p++) lum[p] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    return { lum, w: SAMPLE.w, h: SAMPLE.h, canvas: SAMPLE.cv };
  }

  function kickFaceDetect(sample) {
    if (!SMART.supported || SMART.busy || !sample) return;
    if (performance.now() - SMART.facesAt < 420) return;
    SMART.facesAt = performance.now();
    SMART.busy = true;
    try {
      if (!SMART.det) SMART.det = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 4 });
      const res = SMART.det.detect(sample.canvas);
      Promise.resolve(res).then(list => {
        SMART.faces = (list || []).map(f => {
          const b = (f && f.boundingBox) || {};
          return { x: (b.x || 0) / sample.w, y: (b.y || 0) / sample.h, w: (b.width || 0) / sample.w, h: (b.height || 0) / sample.h };
        }).filter(b => b.w > 0.01 && b.h > 0.01);
        SMART.busy = false;
      }).catch(() => { SMART.faces = []; SMART.failed = true; SMART.busy = false; });
    } catch (e) { SMART.faces = []; SMART.failed = true; SMART.busy = false; }
  }

  // 화면을 실제로 재서 자막을 놓을 띠를 고른다. 문장이 바뀌면 즉시, 같은 문장에서는 120ms마다 갱신.
  function smartCaptionY(ctx, W, H, capH, st, key) {
    const adReserve = st.ad === 'coupang' ? H * 0.757 : H * 0.985;
    const base = clamp(st.capY, 50, 95) / 100;
    // 안전영역: 상단 제목 2줄 아래(0.26) ~ 하단 UI·광고 문구 위(0.92 / 쿠팡이면 0.757)
    const yMin = 0.26, yMax = Math.max(yMin, Math.min(0.92, adReserve / H));
    const now = performance.now();
    if (SMART.key === String(key) && now - SMART.at < 120 && SMART.last) return SMART.last;
    const sample = sampleScene(ctx);
    if (!sample) return { yFrac: base, mode: 'off', best: null };
    kickFaceDetect(sample);
    const res = analyzeBands(sample.lum, sample.w, sample.h, {
      capH: (capH / H) * sample.h, yMin, yMax, base, faces: SMART.faces, count: 7
    });
    const best = res.best;
    const out = {
      yFrac: best ? best.yFrac : base,
      score: best ? best.score : 0,
      faceOverlap: best ? best.faceOverlap : 0,
      mode: SMART.supported ? (SMART.faces.length ? 'face' : 'face-ok') : 'band',
      faces: SMART.faces.length,
      bands: res.ranked ? res.ranked.slice(0, 3).map(b => ({ yFrac: +b.yFrac.toFixed(3), score: +b.score.toFixed(3) })) : []
    };
    SMART.last = out; SMART.key = String(key); SMART.at = now; SMART.yFrac = out.yFrac;
    return out;
  }

  /* --- 자막 블록: 레이아웃 → 자리(스마트/수동) → 모션 --- */
  function drawCaption(ctx, W, H, st, text, hlWords, lt, dur, key) {
    const hl = st.highlightOn ? (hlWords || []) : [];
    const model = captionModel(ctx, W, H, text, st, hl);
    const motion = MOTION_BY_ID[st.capMotion] ? st.capMotion : 'outline-basic';
    const maxScale = CAP_MAX_SCALE[motion] || 1;
    const capH = (model.lines.length - 1) * model.lineH + model.fs * Math.max(1, maxScale);
    const adReserve = st.ad === 'coupang' ? H * 0.757 : H * 0.985;

    let placed = null, yCenter;
    if (st.smartPlace) {
      placed = smartCaptionY(ctx, W, H, capH, st, key);
      const loY = H * 0.26 + capH / 2;
      const hiY = Math.max(loY, Math.min(adReserve, H * 0.92) - capH / 2);
      yCenter = clamp(placed.yFrac * H, loY, hiY);
    } else {
      yCenter = clamp(st.capY, 50, 95) / 100 * H;
    }
    let startY = yCenter - (model.lines.length - 1) * model.lineH / 2;
    // 광고·대가성 문구와 겹치지 않게 위로 올린다
    const bottom = startY + (model.lines.length - 1) * model.lineH + model.fs / 2 * Math.max(1, maxScale);
    if (bottom > adReserve) startY -= (bottom - adReserve);
    startY = Math.max(H * 0.22, startY);

    const longest = model.lines.reduce((a, l) => {
      for (const w of l.words) if (!a || w.text.length > a.length) a = w.text;
      return a;
    }, '');
    const hlAny = model.lines.some(l => l.words.some(w => w.hl));
    const hasNum = /\d/.test(text || '');
    const M = {
      cx: W / 2, W, H, fs: model.fs, lineH: model.lineH, startY,
      space: model.space, lines: model.lines, width: model.width,
      sw: Math.max(2, Math.round(H * 0.006)),
      base: st.capColor, stroke: st.capStroke, accent: '#ffd166',
      font: model.font, motion, text: text || '',
      lt: Math.max(0, lt), dur: Math.max(0.5, dur), exitFade: 1,
      emoji: pickEmoji(text), hasNum, hlAny, hlFallback: longest, placed
    };
    ctx.font = model.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const exitP = clamp((M.lt - (M.dur - 0.16)) / 0.16, 0, 1);
    M.exitFade = motion === 'zoom-swap' ? 1 : 1 - exitP;
    renderCaption(ctx, M);
    return { model, M, placed, adReserve, yCenter, startY, maxScale,
      bottom: startY + (model.lines.length - 1) * model.lineH + model.fs / 2 * Math.max(1, maxScale) };
  }

  let LAST_CAP = null;

  function drawFrame(ctx, W, H, t) {
    const st = state.style;
    const script = state.script;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#05080c'; ctx.fillRect(0, 0, W, H);
    const tl = previewTimeline();
    const idx = indexAt(t);
    const row = tl[idx] || null;
    const sc = state.scenes[idx] || null;
    if (sc && !sc.muted) {
      drawScene(ctx, W, H, sc, row ? (t - row.start) : t, t);
    } else {
      const lg = ctx.createLinearGradient(0, 0, W, H);
      lg.addColorStop(0, '#131b26'); lg.addColorStop(1, '#080c11');
      ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    }
    // 원본 자막 영역 가리기(모자이크)
    if (st.blurOn) {
      const y = clamp(st.blurY, 5, 95) / 100 * H;
      const h = clamp(st.blurH, 3, 50) / 100 * H;
      const yy = clamp(y - h / 2, 0, H - h);
      applyBlurRegion(ctx, W, H, 0, Math.round(yy), W, Math.round(h), Math.max(2, st.blurStrength * (H / 960)), st.blurMode || 'blur');
    }
    // 상단 제목 2줄
    if (st.titleOn && script) {
      const f1 = Math.round(W * 0.085), f2 = Math.round(W * 0.075);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const t1 = script.titles[0] || '';
      const t2 = script.titles[1] || '';
      const fam = FONT_STACK[st.capFont];
      const s1 = fitFont(ctx, t1, W * 0.92, f1, '900', fam, 22);
      const y1 = H * 0.075 + (f1 - s1) / 2, y2 = y1 + s1 * 1.12;
      ctx.lineWidth = Math.max(3, Math.round(W * 0.012)); ctx.strokeStyle = 'rgba(0,0,0,.72)'; ctx.lineJoin = 'round';
      ctx.font = '900 ' + s1 + 'px ' + fam;
      ctx.strokeText(t1, W / 2, y1); ctx.fillStyle = '#ffffff'; ctx.fillText(t1, W / 2, y1);
      const s2 = fitFont(ctx, t2, W * 0.92, f2, '800', fam, 20);
      ctx.font = '800 ' + s2 + 'px ' + fam;
      ctx.strokeText(t2, W / 2, y2); ctx.fillStyle = '#ffd166'; ctx.fillText(t2, W / 2, y2);
    }
    // 자막(현재 문장) — 모션 15종 · 스마트 위치
    if (script && script.sentences[idx]) {
      const text = script.sentences[idx].text;
      const hlWords = (script.highlights || []).map(normWord).filter(Boolean);
      const rowStart = row ? row.start : 0;
      const dur = row ? Math.max(0.5, row.end - row.start) : 2;
      LAST_CAP = drawCaption(ctx, W, H, st, text, hlWords, t - rowStart, dur, idx);
    } else {
      LAST_CAP = null;
    }
    // 광고 / 대가성 문구 — 유튜브 쇼츠 상·하단 UI 세이프존을 피한다.(PC 패키지와 같은 자리)
    if (st.ad !== 'off') {
      const label = st.ad === 'coupang'
        ? '광고 · 쿠팡 파트너스 활동의 일환으로 수수료를 제공받습니다'
        : '광고';
      const fs = Math.round(W * (st.ad === 'coupang' ? 0.026 : 0.030));
      ctx.font = '700 ' + fs + 'px ' + FONT_STACK.sans;
      ctx.textBaseline = 'middle';
      const box = adBox(W, H, st.ad, ctx.measureText(label).width, fs);
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      roundRect(ctx, box.x, box.y, box.w, box.h, box.h / 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.textAlign = box.align;
      ctx.fillText(label, box.tx, box.y + box.h / 2 + 1);
    }
    ctx.restore();
  }

  /* preview loop */
  const PV = { playing: false, t: 0, raf: 0, t0: 0, sources: [], bgm: null };

  function ensurePreview() {
    const ph = $('#previewPh');
    const has = !!(state.script && state.script.sentences.length);
    if (ph) ph.classList.toggle('hidden', has);
    if (has) drawPreview();
    updatePreviewMeta();
  }
  function drawPreview() {
    const cv = $('#previewCanvas'); if (!cv) return;
    const total = totalDuration();
    if (PV.t > total) PV.t = total;
    drawFrame(cv.getContext('2d'), cv.width, cv.height, PV.t);
    updatePlayhead();
  }
  function updatePlayhead() {
    const total = totalDuration();
    const seek = $('#seek');
    if (seek && document.activeElement !== seek) seek.value = String(Math.round(total ? PV.t / total * 1000 : 0));
    const tl = $('#timeLabel'); if (tl) tl.textContent = fmtTime(PV.t) + ' / ' + fmtTime(total);
    const now = $('#pvNow');
    const idx = indexAt(PV.t);
    const s = state.script && state.script.sentences[idx];
    if (now) now.innerHTML = '현재 문장: <b>' + (s ? esc(s.text.slice(0, 40)) + (s.text.length > 40 ? '…' : '') : '없음') + '</b>';
    $$('#timelineBody tr[data-tl]').forEach((tr, i) => tr.classList.toggle('on', i === idx));
    const play = $('#btnPlay'); if (play) play.textContent = PV.playing ? '⏸' : '▶';
  }
  function updatePreviewMeta() {
    const st = state.style;
    const bgmNames = { none: 'BGM 없음', upbeat: 'BGM 경쾌한 비트', calm: 'BGM 잔잔한 피아노', lofi: 'BGM 로파이', epic: 'BGM 웅장한 신스' };
    const b = $('#pvBgm'); if (b) b.textContent = bgmNames[st.bgm] || 'BGM';
    const a = $('#pvAd'); if (a) a.textContent = st.ad === 'off' ? '광고 표시 없음' : st.ad === 'coupang' ? '쿠팡 대가성 문구' : '(광고)';
    const r = $('#pvRes'); if (r) r.textContent = '540×960';
    const iScenes = $('#infoScenes'); if (iScenes) iScenes.textContent = String(state.scenes.filter(s => !s.muted).length);
    const iBlur = $('#infoBlur'); if (iBlur) iBlur.textContent = st.blurOn ? (st.blurMode === 'mosaic' ? '모자이크 ' : '블러 ') + st.blurStrength + 'px' : '꺼짐';
    const iAd = $('#infoAd'); if (iAd) iAd.textContent = st.ad === 'off' ? '없음' : st.ad === 'coupang' ? '쿠팡 파트너스' : '(광고)';
    const iLen = $('#infoLen'); if (iLen) iLen.textContent = totalDuration().toFixed(1) + 's';
  }

  async function togglePreview() {
    if (PV.playing) { stopPlayback(); return; }
    if (!state.script || !state.script.sentences.length) { toast('먼저 3단계에서 대본을 만들어 주세요', 'bad'); return; }
    if (!state.voice && !(state.subTl && state.subTl.length)) {
      await buildVoice();
      if (!state.voice) return;
    }
    const total = totalDuration();
    startPlayback(PV.t >= total - 0.05 ? 0 : PV.t);
  }

  function stopSources() {
    PV.sources.forEach(s => { try { s.stop(); } catch (e) {} });
    PV.sources = [];
    if (PV.bgm) { try { PV.bgm.stop(); } catch (e) {} PV.bgm = null; }
  }
  function stopPlayback() {
    PV.playing = false;
    cancelAnimationFrame(PV.raf);
    stopSources();
    const eqp = $('#voicePlayer'); if (eqp) eqp.classList.remove('playing');
    updatePlayhead();
  }
  function startPlayback(from) {
    const ac = getAC();
    stopSources();
    const now = ac.currentTime + 0.06;
    const srtOnly = !!(state.subTl && state.subTl.length);
    (!srtOnly && state.voice ? state.voice.timeline : []).forEach((row, i) => {
      if (row.end <= from) return;
      const src = ac.createBufferSource();
      src.buffer = state.voice.buffers[i];
      src.connect(ac.destination);
      const when = now + Math.max(0, row.start - from);
      const off = Math.max(0, from - row.start);
      try { src.start(when, off); PV.sources.push(src); } catch (e) {}
    });
    if (state.style.bgm !== 'none' && state.style.bgmVol > 0) {
      const buf = bgmBuffer(state.style.bgm, Math.max(2, totalDuration()));
      if (buf) {
        const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
        const g = ac.createGain(); g.gain.value = (state.style.bgmVol / 100) * 0.5;
        src.connect(g); g.connect(ac.destination);
        try { src.start(now); PV.bgm = src; } catch (e) {}
      }
    }
    PV.playing = true;
    PV.t = from;
    PV.t0 = performance.now() / 1000 - from;
    const eqp = $('#voicePlayer'); if (eqp) eqp.classList.add('playing');
    const step = () => {
      if (!PV.playing) return;
      const t = performance.now() / 1000 - PV.t0;
      const total = totalDuration();
      PV.t = Math.min(total, t);
      drawPreview();
      if (t >= total) { stopPlayback(); PV.t = total; drawPreview(); return; }
      PV.raf = requestAnimationFrame(step);
    };
    PV.raf = requestAnimationFrame(step);
  }

  /* ---------------- BGM synthesis ---------------- */
  const bgmCache = {};
  function bgmBuffer(track, dur) {
    if (track === 'none') return null;
    const ac = getAC();
    const loopLen = track === 'epic' ? 8 : 6.4;
    if (bgmCache[track]) return bgmCache[track];
    const sr = ac.sampleRate;
    const n = Math.floor(loopLen * sr);
    const buf = ac.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    const chords = track === 'calm' ? [[261.63, 329.63, 392.0], [220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [196.0, 246.94, 293.66]]
      : track === 'lofi' ? [[220, 261.63, 329.63], [196, 246.94, 293.66], [174.61, 220, 261.63], [164.81, 207.65, 246.94]]
      : track === 'epic' ? [[110, 164.81, 220], [98, 146.83, 196], [87.31, 130.81, 174.61], [110, 164.81, 220]]
      : [[261.63, 329.63, 392.0], [293.66, 369.99, 440], [329.63, 415.3, 493.88], [261.63, 329.63, 392.0]];
    const barLen = loopLen / chords.length;
    for (let b = 0; b < chords.length; b++) {
      const start = Math.floor(b * barLen * sr);
      const len = Math.floor(barLen * sr);
      const ch = chords[b];
      for (let i = 0; i < len; i++) {
        const tt = i / sr;
        const env = Math.min(1, tt / 0.02) * Math.min(1, (barLen - tt) / 0.12);
        let v = 0;
        ch.forEach((f, ci) => { v += Math.sin(2 * Math.PI * f * tt) * (0.18 / (ci + 1)); });
        // 리듬
        if (track === 'upbeat' || track === 'lofi') {
          const beat = 60 / (track === 'lofi' ? 78 : 112);
          const bt = tt % beat;
          if (bt < 0.06) v += Math.sin(2 * Math.PI * 58 * bt) * Math.exp(-bt * 55) * 0.5;
          const ht = (tt + beat / 2) % beat;
          if (ht < 0.03) v += (Math.random() * 2 - 1) * Math.exp(-ht * 90) * 0.12;
        }
        if (track === 'epic') v += Math.sin(2 * Math.PI * 55 * tt) * 0.22;
        d[start + i] += v * env * 0.5;
      }
    }
    // 페이드 엣지 (루프 클릭 방지)
    const fade = Math.floor(0.02 * sr);
    for (let i = 0; i < fade; i++) { d[i] *= i / fade; d[n - 1 - i] *= i / fade; }
    let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < n; i++) d[i] *= 0.9 / peak;
    bgmCache[track] = buf;
    return buf;
  }

  /* ---------------- style / preset ---------------- */
  const DEFAULT_STYLE = JSON.parse(JSON.stringify(state.style));

  function renderCapMotionChips() {
    const box = $('#capMotionChips'); if (!box) return;
    const cur = (state.style && state.style.capMotion) || 'outline-basic';
    box.innerHTML = CAP_MOTIONS.map(m =>
      '<button type="button" class="motion-chip' + (m.id === cur ? ' on' : '') + '" data-motion="' + m.id + '" title="' + esc(m.note) + '">' +
      '<span class="fam">' + esc(m.family) + '</span>' + esc(m.label) + '</button>').join('');
  }
  function setCapMotion(id) {
    const m = MOTION_BY_ID[id] || CAP_MOTIONS[0];
    state.style.capMotion = m.id;
    renderCapMotionChips();
    const now = $('#capMotionNow'); if (now) now.textContent = m.label;
    const hint = $('#capMotionHint'); if (hint) hint.textContent = m.note;
    drawPreview();
    if ($('#presetRemember') && $('#presetRemember').checked) savePreset(true);
  }
  function updateSmartNote() {
    const badge = $('#smartPlaceBadge'), note = $('#smartPlaceNote');
    const sup = SMART.supported;
    if (badge) { badge.textContent = sup ? '얼굴+여백' : '여백 분석'; badge.className = 'badge ' + (sup ? 'live' : 'blue'); }
    if (note) {
      note.innerHTML = state.style.smartPlace
        ? (sup
          ? '켜짐 · <span class="ok">이 브라우저는 얼굴 인식(FaceDetector)을 지원합니다.</span> 얼굴을 피해 가장 한산한 띠에 자막을 놓습니다. 위 「자막 위치」는 기준값으로만 쓰입니다.'
          : '켜짐 · <span class="warn">이 브라우저는 얼굴 인식이 없어 여백·복잡도 분석만으로 배치합니다</span>(Safari·Firefox 포함). 위 「자막 위치」는 기준값으로만 쓰입니다.')
        : '켜면 장면에서 <b>가장 한산한 띠</b>를 찾아 자막을 자동으로 옮깁니다. ' + (sup ? '<span class="ok">이 브라우저는 얼굴 인식도 지원합니다.</span>' : '<span class="warn">이 브라우저는 얼굴 인식 미지원 → 여백 분석으로 동작합니다.</span>');
    }
  }
  function setSmartPlace(on) {
    state.style.smartPlace = !!on;
    const cb = $('#smartPlace'); if (cb) cb.checked = !!on;
    SMART.key = ''; SMART.last = null; SMART.yFrac = clamp(state.style.capY, 50, 95) / 100;
    updateSmartNote(); updateStyleLabels(); drawPreview();
    if ($('#presetRemember') && $('#presetRemember').checked) savePreset(true);
  }
  function styleFromInputs() {
    const st = state.style;
    st.blurOn = $('#blurOn').checked; st.blurY = Number($('#blurY').value); st.blurH = Number($('#blurH').value); st.blurStrength = Number($('#blurStrength').value);
    st.blurMode = $('#blurMode').value;
    st.titleOn = $('#titleOn').checked; st.highlightOn = $('#highlightOn').checked;
    st.capSize = Number($('#capSize').value); st.capY = Number($('#capY').value); st.capFont = $('#capFont').value;
    st.capColor = $('#capColor').value; st.capStroke = $('#capStroke').value;
    st.capMotion = (MOTION_BY_ID[st.capMotion] ? st.capMotion : 'outline-basic');
    st.bgm = $('#bgmSel').value; st.bgmVol = Number($('#bgmVol').value);
    updateStyleLabels(); drawPreview(); updatePreviewMeta();
    if ($('#presetRemember').checked) savePreset(true);
  }
  function applyStyleToInputs(st) {
    const set = (sel, val) => { const el = $(sel); if (!el) return; if (el.type === 'checkbox') el.checked = !!val; else el.value = val; };
    set('#blurOn', st.blurOn); set('#blurY', st.blurY); set('#blurH', st.blurH); set('#blurStrength', st.blurStrength); set('#blurMode', st.blurMode || 'blur');
    set('#titleOn', st.titleOn); set('#highlightOn', st.highlightOn);
    set('#capSize', st.capSize); set('#capY', st.capY); set('#capFont', st.capFont); set('#capColor', st.capColor); set('#capStroke', st.capStroke);
    set('#bgmSel', st.bgm); set('#bgmVol', st.bgmVol);
    setAdSeg(st.ad);
    renderCapMotionChips();
    const mn = $('#capMotionNow'); if (mn) mn.textContent = (MOTION_BY_ID[st.capMotion] || CAP_MOTIONS[0]).label;
    const mh = $('#capMotionHint'); if (mh) mh.textContent = (MOTION_BY_ID[st.capMotion] || CAP_MOTIONS[0]).note;
    const sp = $('#smartPlace'); if (sp) sp.checked = !!st.smartPlace;
    updateSmartNote(); updateStyleLabels();
  }
  function updateStyleLabels() {
    const st = state.style;
    const capYLabel = st.smartPlace ? ('자동 ' + Math.round(((SMART.last && SMART.last.yFrac) || (clamp(st.capY, 50, 95) / 100)) * 100) + '%') : st.capY + '%';
    const map = { '#blurYVal': st.blurY + '%', '#blurHVal': st.blurH + '%', '#blurStrengthVal': (st.blurMode === 'mosaic' ? '모자이크 ' : '블러 ') + st.blurStrength + 'px', '#capSizeVal': String(st.capSize), '#capYVal': capYLabel, '#bgmVolVal': st.bgmVol + '%' };
    Object.keys(map).forEach(k => { const el = $(k); if (el) el.textContent = map[k]; });
    const ad = $('#adPreview');
    if (ad) ad.innerHTML = st.ad === 'off' ? '광고 표시를 끕니다.' : st.ad === 'coupang' ? '하단에 <b>광고 · 쿠팡 파트너스 …수수료를 제공받습니다</b> 문구가 들어갑니다.' : '상단에 <b>(광고)</b> 배지가 표시됩니다.';
    const info = $('#infoBlur'); if (info) info.textContent = st.blurOn ? (st.blurMode === 'mosaic' ? '모자이크 ' : '블러 ') + st.blurStrength + 'px' : '꺼짐';
    const infoAd = $('#infoAd'); if (infoAd) infoAd.textContent = st.ad === 'off' ? '없음' : st.ad === 'coupang' ? '쿠팡 파트너스' : '(광고)';
    const bgmNames = { none: 'BGM 없음', upbeat: 'BGM 경쾌한 비트', calm: 'BGM 잔잔한 피아노', lofi: 'BGM 로파이', epic: 'BGM 웅장한 신스' };
    const pvBgm = $('#pvBgm'); if (pvBgm) pvBgm.textContent = bgmNames[st.bgm] || 'BGM';
    const pvAd = $('#pvAd'); if (pvAd) pvAd.textContent = st.ad === 'off' ? '광고 표시 없음' : st.ad === 'coupang' ? '쿠팡 대가성 문구' : '(광고)';
  }
  function setAdSeg(v) {
    state.style.ad = v;
    $$('#segAd button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    updatePreviewMeta(); drawPreview();
    const ad = $('#adPreview');
    if (ad) ad.innerHTML = v === 'off' ? '광고 표시를 끕니다.' : v === 'coupang' ? '하단에 <b>광고 · 쿠팡 파트너스 …수수료를 제공받습니다</b> 문구가 들어갑니다.' : '상단에 <b>(광고)</b> 배지가 표시됩니다.';
    if ($('#presetRemember').checked) savePreset(true);
  }
  function savePreset(silent) {
    const payload = { style: state.style, remember: $('#presetRemember') ? $('#presetRemember').checked : false, savedAt: Date.now() };
    try { localStorage.setItem(LS.preset, JSON.stringify(payload)); } catch (e) {}
    const el = $('#presetStatus');
    if (el) el.textContent = '저장됨 · ' + new Date(payload.savedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    if (!silent) { toast('다음 영상에도 이 설정으로 저장했습니다', 'good'); flashSaved(); }
  }
  function loadPreset() {
    const p = lsGet(LS.preset, null);
    if (p && p.style) {
      Object.keys(DEFAULT_STYLE).forEach(k => { if (p.style[k] != null) state.style[k] = p.style[k]; });
      const el = $('#presetStatus');
      if (el) el.textContent = '저장된 스타일 불러옴 · ' + new Date(p.savedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      const rem = $('#presetRemember');
      if (rem && p.remember) rem.checked = true;
    }
    applyStyleToInputs(state.style);
  }
  function resetStyle() {
    state.style = JSON.parse(JSON.stringify(DEFAULT_STYLE));
    applyStyleToInputs(state.style);
    drawPreview();
    toast('스타일을 기본값으로 되돌렸습니다');
  }

  /* ---------------- WebM export ---------------- */
  let exporting = false;
  function pickMime() {
    const cands = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (const c of cands) { try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c; } catch (e) {} }
    return '';
  }

  async function exportWebM() {
    if (exporting) { toast('이미 내보내는 중입니다'); return; }
    if (!state.script || !state.script.sentences.length) { toast('먼저 3단계에서 대본을 만들어 주세요', 'bad'); return; }
    if (!window.MediaRecorder) { toast('이 브라우저는 MediaRecorder를 지원하지 않습니다', 'bad'); return; }
    const srtOnly = !!(state.subTl && state.subTl.length);
    if (!state.voice && !srtOnly) {
      await buildVoice();
      if (!state.voice) return;
    }
    exporting = true;
    stopPlayback();
    const W = 540, H = 960, fps = 30;
    const dur = totalDuration();
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    cv.style.cssText = 'position:fixed;left:-10000px;top:0;width:540px;height:960px';
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d');
    const stream = cv.captureStream(fps);
    const ac = getAC();
    const dest = ac.createMediaStreamDestination();
    dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    const mime = pickMime();
    let rec;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4200000, audioBitsPerSecond: 128000 } : undefined);
    } catch (e) {
      toast('녹화기를 시작할 수 없습니다: ' + e.message, 'bad'); cv.remove(); exporting = false; return;
    }
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(res => { rec.onstop = () => res(new Blob(chunks, { type: 'video/webm' })); });
    const prog = $('#exportProg'), bar = $('#exportBar'), status = $('#exportStatus'), timeEl = $('#exportTime');
    const recBadge = $('#previewRec');
    if (prog) prog.classList.add('on');
    if (recBadge) recBadge.classList.add('on');
    ['#btnExport', '#btnExportMini', '#btnPlay'].forEach(s => { const b = $(s); if (b) b.disabled = true; });

    // 오디오 스케줄 (STT 타이밍만 쓸 때는 TTS 음성을 내보내지 않는다)
    const startAt = ac.currentTime + 0.18;
    const sources = [];
    if (!srtOnly && state.voice) {
      state.voice.timeline.forEach((row, i) => {
        const src = ac.createBufferSource(); src.buffer = state.voice.buffers[i];
        const g = ac.createGain(); g.gain.value = 1; src.connect(g); g.connect(dest);
        try { src.start(startAt + row.start); sources.push(src); } catch (e) {}
      });
    }
    if (state.style.bgm !== 'none' && state.style.bgmVol > 0) {
      const buf = bgmBuffer(state.style.bgm, Math.max(2, dur));
      if (buf) {
        const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
        const g = ac.createGain(); g.gain.value = (state.style.bgmVol / 100) * 0.5;
        src.connect(g); g.connect(dest);
        try { src.start(startAt); sources.push(src); } catch (e) {}
      }
    }
    rec.start(1000);
    drawFrame(ctx, W, H, 0);
    const t0 = performance.now();
    await new Promise(resolve => {
      function frame() {
        const elapsed = (performance.now() - t0) / 1000;
        const t = Math.min(dur, elapsed);
        try { drawFrame(ctx, W, H, t); } catch (e) {}
        if (bar) bar.style.width = Math.round(elapsed / dur * 100) + '%';
        if (status) status.textContent = '녹화 중… ' + elapsed.toFixed(1) + ' / ' + dur.toFixed(1) + '초';
        if (timeEl) timeEl.textContent = Math.round(elapsed / dur * 100) + '%';
        if (elapsed >= dur) { resolve(); return; }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    try { rec.stop(); } catch (e) {}
    const blob = await done;
    sources.forEach(s => { try { s.stop(); } catch (e) {} });
    stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
    dest.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
    cv.remove();
    if (prog) prog.classList.remove('on');
    if (recBadge) recBadge.classList.remove('on');
    ['#btnExport', '#btnExportMini', '#btnPlay'].forEach(s => { const b = $(s); if (b) b.disabled = false; });
    exporting = false;

    if (!blob || blob.size < 1024) {
      if (status) status.textContent = '내보내기 실패 · 데이터 없음';
      toast('WebM 데이터가 만들어지지 않았습니다', 'bad');
      return;
    }
    const url = URL.createObjectURL(blob);
    const name = 'shorts-vending-' + new Date().toISOString().slice(0, 10) + '.webm';
    const a = $('#exportLink'); if (a) { a.href = url; a.download = name; }
    const a2 = $('#exportMiniLink'); if (a2) { a2.href = url; a2.download = name; a2.classList.remove('hidden'); }
    const wrap = $('#exportResult'); if (wrap) wrap.classList.remove('hidden');
    if (status) status.textContent = '완료 · ' + (blob.size / 1048576).toFixed(2) + 'MB · ' + dur.toFixed(1) + '초';
    if (timeEl) timeEl.textContent = '100%';
    const info = $('#exportInfo');
    /* 내보내기 정보는 아래에서 채운다 */
    if (info) info.textContent = '540×960 WebM · ' + dur.toFixed(1) + '초 · ' + (srtOnly ? '자막 타이밍(STT) · TTS 음성 없음' : '음성 ' + (state.voice && state.voice.mode === 'gemini' ? 'Gemini TTS' : '합성음') + ' 포함');
    state.exported++;
    addHistoryFromProduct(true);
    logActivity('⬇️', 'WebM 내보내기 · ' + dur.toFixed(1) + '초 · ' + (blob.size / 1048576).toFixed(2) + 'MB');
    toast('WebM 완성 · ' + (blob.size / 1048576).toFixed(2) + 'MB', 'good');
    return blob;
  }

  /* ---------------- step 5: titles / thumbnail ---------------- */
  function demoTitles(p) {
    const n = shortName(p.name || '이 제품');
    const h = (p.hooks && p.hooks.length ? p.hooks : ['첫인상', '사용감', '가격']);
    const k = (p.keywords && p.keywords.length ? p.keywords : ['추천', '후기']);
    const list = [
      n + ' 3일 써봤는데 진짜 충격',
      hookShort(h[0]) + ' · 이거 실화?',
      (k[0] || '이 제품') + ' 하나면 끝납니다',
      n + ' 사기 전에 꼭 보세요',
      '이 가격에 이 품질? ' + (k[0] || '반전'),
      (h[1] || '써보니') + ' (솔직 후기)',
      n + ' vs 비싼 제품 비교해봤다',
      'SNS에서 난리난 이유가 있었네',
      (k[1] || '이거') + ' 찾다가 드러난 진실',
      '안 사면 후회하는 ' + (p.category || '아이템')
    ];
    const r = rng(hash32((p.name || '') + 'titles'));
    return list.slice(0, 10).map((t, i) => ({ text: String(t).slice(0, 90), score: Math.round(74 + r() * 24) }));
  }

  async function geminiTitles() {
    const p = state.product || {};
    const prompt = [
      '한국 쇼츠 커머스 채널의 카피라이터다. 아래 제품으로 클릭률 높은 제목 10개와 설명·해시태그를 JSON으로 써라.',
      '제품: ' + (p.name || '') + ' / ' + (p.category || '') + ' / ' + (p.price || ''),
      '후킹: ' + ((p.hooks || []).join(' | ')),
      '키워드: ' + ((p.keywords || []).join(', ')),
      '규칙: 제목은 10개, 각 45자 이내, 과장·허위 금지, 숫자·반전·궁금증 활용. score 0~100.',
      '설명은 3~5줄(제품 특징 3개 + 가격 + CTA), 해시태그는 #없이 8개.',
      'JSON: {"titles":[{"text":string,"score":number}],"description":string,"hashtags":[string],"thumbText":string}',
      'thumbText는 30자 이내의 썸네일 문구 1개.'
    ].join('\n');
    const raw = await geminiJSON(prompt, { temp: 0.95, maxTokens: 1800 });
    let list = (Array.isArray(raw.titles) ? raw.titles : []).map(t => typeof t === 'string' ? { text: t, score: 80 } : { text: String(t.text || ''), score: clamp(Number(t.score) || 80, 0, 100) }).filter(t => t.text).slice(0, 10);
    if (list.length < 10) throw new Error('제목이 10개가 아닙니다(' + list.length + ')');
    return {
      list,
      desc: String(raw.description || ''),
      hashtags: (Array.isArray(raw.hashtags) ? raw.hashtags : []).map(h => String(h).replace(/^#/, '')).slice(0, 12),
      thumbText: String(raw.thumbText || list[0].text).slice(0, 30),
      demo: false
    };
  }

  async function suggestTitles() {
    if (!state.product) { toast('먼저 1~2단계에서 제품을 분석하세요', 'bad'); goStep(1); return; }
    const btn = $('#btnSuggestTitles'), st = $('#titleStatus');
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 추천 중';
    st.textContent = '제목 추천 중…';
    try {
      const demo = () => {
        const p = state.product;
        const list = demoTitles(p);
        const tags = (p.keywords || []).concat(['쇼츠', '추천', '리뷰', '언박싱', '살림템']).map(x => String(x).replace(/[#\s]/g, '')).filter(Boolean).slice(0, 8);
        return { list, desc: defaultDescription(p, list[0].text, tags), hashtags: tags, thumbText: list[0].text.slice(0, 30), demo: true };
      };
      const out = await withDemoFallback(geminiTitles, demo, '제목 추천', 1);
      state.titles = { list: out.list, pick: -1, desc: out.desc || '', hashtags: out.hashtags || [], thumbText: out.thumbText || '', demo: out.demo };
      renderTitles();
      st.textContent = (out.demo ? '데모' : 'Gemini') + ' 추천 완료 · 제목 ' + out.list.length + '개 · 하나를 고르면 설명이 채워집니다' + (out.__fallback ? ' (Gemini 실패 → 데모)' : '');
      toast('제목 ' + out.list.length + '개를 추천했습니다', 'good');
      logActivity('💡', '제목 ' + out.list.length + '개 추천 · 해시테그 ' + (out.hashtags || []).length + '개');
    } catch (e) {
      st.textContent = errMsg(e); toast('제목 추천 실패: ' + errMsg(e), 'bad');
    } finally {
      btn.disabled = false; btn.innerHTML = '제목·설명 추천받기';
    }
  }

  function defaultDescription(p, title, tags) {
    const h = p.hooks || [];
    return [
      (p.name || '') + ' 직접 써보고 정리했습니다.',
      '▶ ' + (h[0] || '첫인상'),
      '▶ ' + (h[1] || '사용감'),
      '▶ ' + (h[2] || '가격'),
      '',
      '가격: ' + (p.price || '-'),
      '',
      tags.map(t => '#' + t).join(' ')
    ].join('\n');
  }

  function renderTitles() {
    const t = state.titles, list = $('#titleList'), empty = $('#titleEmpty');
    if (!list) return;
    if (!t) { if (empty) empty.classList.remove('hidden'); return; }
    if (empty) empty.classList.add('hidden');
    list.innerHTML = t.list.map((x, i) =>
      '<div class="title-opt ' + (t.pick === i ? 'on' : '') + '" data-title-opt="' + i + '" role="button" tabindex="0">' +
      '<span class="n">' + pad(i + 1) + '</span><b>' + esc(x.text) + '</b><span class="score">' + (x.score || 0) + '점</span></div>').join('');
    if (t.pick >= 0) renderPicked(); else renderThumb();
  }

  function pickTitle(i) {
    const t = state.titles; if (!t || !t.list[i]) return;
    const prev = t.pick;
    t.pick = i;
    const title = t.list[i].text;
    const p = state.product || {};
    if (!t.desc || (!t.descManual && prev !== i)) t.desc = defaultDescription(p, title, t.hashtags);
    if (!t.thumbTextManual) t.thumbText = title.slice(0, 30);
    renderTitles(); renderPicked();
  }

  function renderPicked() {
    const t = state.titles; if (!t) return;
    $('#descInput').value = t.desc || '';
    $('#thumbText').value = t.thumbText || '';
    renderTags(); renderThumb();
    const dc = $('#descCount'); if (dc) dc.textContent = ($('#descInput').value || '').length + '자';
    buildHubTexts(); renderHub();
  }
  function renderTags() {
    const el = $('#hashtagList'), t = state.titles; if (!el) return;
    el.innerHTML = ((t && t.hashtags) || []).map(h => '<span class="tag">#' + esc(h) + '</span>').join('') || '<span class="hint">해시태그가 없습니다</span>';
  }

  /* 썸네일 */
  function drawThumb(ctx, W, H) {
    const p = state.product || { palette: ['#ff7a45', '#6b4bff'], motif: 0 };
    const t = state.titles || {};
    const pal = p.palette || ['#ff7a45', '#6b4bff'];
    const lg = ctx.createLinearGradient(0, 0, W, H);
    lg.addColorStop(0, pal[1] || '#26344a'); lg.addColorStop(0.55, pal[0] || '#ff7a45'); lg.addColorStop(1, '#0b1017');
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    drawMotif(ctx, W, H, 1, 0.8, pal);
    // 하단 그라데이션 + 텍스트 박스
    const g2 = ctx.createLinearGradient(0, H * 0.42, 0, H);
    g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(0.45, 'rgba(0,0,0,.55)'); g2.addColorStop(1, 'rgba(0,0,0,.88)');
    ctx.fillStyle = g2; ctx.fillRect(0, H * 0.42, W, H * 0.58);
    const text = (t.thumbText || (t.list && t.pick >= 0 ? t.list[t.pick].text : '') || p.name || '쇼츠 썸네일').toUpperCase();
    const fs = Math.round(W * 0.105);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 ' + fs + 'px ' + FONT_STACK.black;
    const maxW = W * 0.88;
    const words = String(text).split(/\s+/);
    const lines = []; let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    const show = lines.slice(0, 3);
    const lh = fs * 1.16;
    let y = H * 0.62 - (show.length - 1) * lh / 2;
    show.forEach(l => {
      ctx.lineWidth = Math.max(6, Math.round(W * 0.018));
      ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineJoin = 'round';
      ctx.strokeText(l, W / 2, y);
      ctx.fillStyle = '#ffffff'; ctx.fillText(l, W / 2, y);
      y += lh;
    });
    // 제품명 태그
    if (p.name) {
      const fs2 = Math.round(W * 0.036);
      ctx.font = '700 ' + fs2 + 'px ' + FONT_STACK.sans;
      const label = p.name.slice(0, 26);
      const tw = ctx.measureText(label).width + fs2 * 1.6;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      roundRect(ctx, W / 2 - tw / 2, H * 0.86, tw, fs2 * 2.1, fs2);
      ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillText(label, W / 2, H * 0.86 + fs2 * 1.05);
    }
    if (state.style.ad !== 'off') {
      const fs3 = Math.round(W * 0.028);
      ctx.font = '700 ' + fs3 + 'px ' + FONT_STACK.sans;
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.textAlign = 'left';
      ctx.fillText(state.style.ad === 'coupang' ? '광고 · 쿠팡 파트너스' : '광고', W * 0.05, H * 0.05);
    }
  }
  function renderThumb() {
    const cv = $('#thumbCanvas'); if (!cv) return;
    drawThumb(cv.getContext('2d'), cv.width, cv.height);
  }
  function makeThumbBlob() {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
    drawThumb(c.getContext('2d'), 1080, 1920);
    return new Promise(res => { if (c.toBlob) c.toBlob(b => res(b), 'image/png'); else res(null); });
  }
  async function downloadThumb() {
    const blob = await makeThumbBlob();
    if (!blob) { toast('PNG를 만들지 못했습니다', 'bad'); return; }
    const url = URL.createObjectURL(blob);
    const name = 'shorts-thumbnail-' + new Date().toISOString().slice(0, 10) + '.png';
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    const st = $('#thumbStatus'); if (st) st.textContent = '완료 · 1080×1920 · ' + (blob.size / 1024).toFixed(0) + 'KB';
    toast('썸네일 PNG를 내려받았습니다', 'good');
    return blob;
  }

  async function copyText(text, label) {
    if (!text) { toast('복사할 내용이 없습니다', 'bad'); return false; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); }
      else {
        const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      toast((label || '복사') + ' 완료', 'good');
      return true;
    } catch (e) {
      try {
        const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        toast((label || '복사') + ' 완료', 'good'); return true;
      } catch (e2) { toast('복사 실패 · 직접 선택해 복사하세요', 'bad'); return false; }
    }
  }

  /* ---------------- step 6: upload hub ---------------- */
  const HUB_LIMITS = { yt: 5000, tt: 2200, ig: 2200, th: 500, fb: 63206 };
  function disclosureText() {
    return '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';
  }
  function coupangLink() {
    const p = state.product;
    if (!p) return '';
    const exact = state.history.find(h => h.name === p.name && h.link);
    if (exact) return exact.link;
    const latest = state.history.length ? state.history[state.history.length - 1].link : '';
    if (latest) return latest;
    if (state.coupang.auto) return autoLink(p.name);
    return '';
  }
  function autoLink(name) {
    const base = state.coupang.base || 'https://link.coupang.com/a/';
    const slug = String(name || 'product').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'product';
    const code = hash32(name || 'x').toString(36).slice(0, 4);
    return base + slug + '-' + code;
  }

  function buildHubTexts() {
    const t = state.titles;
    if (!t || t.pick < 0) { state.hubTexts = {}; return; }
    const title = t.list[t.pick].text;
    const p = state.product || {};
    const tags = (t.hashtags || []).map(x => '#' + x);
    const link = coupangLink();
    const disc = state.coupang.disclosure ? disclosureText() : '';
    const aiLine = state.famous.aiMark ? '이 영상은 AI로 만든 합성 콘텐츠입니다.' : '';
    const desc = ($('#descInput') && $('#descInput').value) || t.desc || '';
    const hook = (p.hooks && p.hooks[0]) || '';
    const common = [desc, disc, aiLine].filter(Boolean).join('\n\n');
    const texts = {
      yt: [title, '', common, link ? '👉 ' + link : '', (tags.join(' ') + ' #Shorts').trim()].filter(Boolean).join('\n'),
      tt: [title, hook ? '· ' + hook : '', link ? 'link in bio · ' + link : '', aiLine, tags.join(' ')].filter(Boolean).join('\n'),
      ig: [title, '', desc, disc, aiLine, link ? '🔗 ' + link : '', tags.join(' ')].filter(Boolean).join('\n'),
      th: [title + (hook ? ' — ' + hook : ''), link ? '👉 ' + link : '', tags.slice(0, 5).join(' '), disc, aiLine].filter(Boolean).join('\n'),
      fb: [title, '', desc, disc, aiLine, link ? link : '', tags.join(' ')].filter(Boolean).join('\n')
    };
    state.hubTexts = texts;
  }

  function renderHub() {
    const texts = state.hubTexts || {};
    const ids = ['yt', 'tt', 'ig', 'th', 'fb'];
    ids.forEach(pf => {
      const ta = $('#cap-' + pf); if (!ta) return;
      const val = texts[pf] || '';
      if (ta.value !== val) ta.value = val;
      const cnt = $('#cnt-' + pf);
      if (cnt) { cnt.textContent = val.length + ' / ' + HUB_LIMITS[pf].toLocaleString(); cnt.classList.toggle('over', val.length > HUB_LIMITS[pf]); }
    });
    const st = $('#hubStatus');
    if (st) st.textContent = texts.yt ? '5개 플랫폼 문구 준비됨 · 복사해서 붙여넣고 마지막 게시는 직접 누르세요.' : '아직 문구가 생성되지 않았습니다. 5단계에서 제목을 고르면 자동으로 채워집니다.';
    const pb = $('#publishBadge');
    if (pb) { pb.className = 'badge ' + (state.hub.confirm ? 'live' : 'warn'); pb.textContent = state.hub.confirm ? '직접 게시' : '게시 버튼 확인 필요'; }
  }

  /* ---------------- step 7: coupang ---------------- */
  function loadCoupang() {
    const c = lsGet(LS.coupang, null);
    if (c) Object.keys(state.coupang).forEach(k => { if (c[k] != null) state.coupang[k] = c[k]; });
    state.history = lsGet(LS.hist, []) || [];
    if (!Array.isArray(state.history)) state.history = [];
    const a = $('#cpAccess'), s = $('#cpSecret');
    if (a) a.value = state.coupang.access || '';
    if (s) s.value = state.coupang.secret || '';
    const base = $('#cpBase'); if (base) base.value = state.coupang.base;
    const auto = $('#cpAuto'); if (auto) auto.checked = !!state.coupang.auto;
    const disc = $('#cpDisclosure'); if (disc) disc.checked = !!state.coupang.disclosure;
    renderCpBadge(); renderHistory();
  }
  function saveCoupang(silent) {
    state.coupang.access = ($('#cpAccess').value || '').trim();
    state.coupang.secret = ($('#cpSecret').value || '').trim();
    state.coupang.base = ($('#cpBase').value || 'https://link.coupang.com/a/').trim();
    state.coupang.auto = $('#cpAuto').checked;
    state.coupang.disclosure = $('#cpDisclosure').checked;
    lsSet(LS.coupang, state.coupang);
    renderCpBadge(); buildHubTexts(); renderHub(); renderThumb();
    if (!silent) toast('쿠팡 파트너스 설정을 저장했습니다 (로컬)', 'good');
  }
  function renderCpBadge() {
    const b = $('#cpBadge'), st = $('#cpStatus');
    const has = !!(state.coupang.access && state.coupang.secret);
    if (b) { b.className = 'badge ' + (has ? 'live' : ''); b.textContent = has ? '저장됨 · 로컬' : '저장 안 됨'; }
    if (st) st.textContent = has ? ('저장됨 · Access ' + state.coupang.access.slice(0, 4) + '•••• · 서버 전송 없음') : '로컬 저장 · 서버 전송 없음';
  }
  function addHistoryFromProduct(silent) {
    const p = state.product;
    if (!p) return;
    const link = coupangLink() || (state.coupang.auto ? autoLink(p.name) : '');
    const row = { id: uid('h'), name: p.name, link, date: new Date().toISOString(), auto: !state.history.some(h => h.link === link) };
    state.history.push(row);
    lsSet(LS.hist, state.history);
    renderHistory();
    logActivity('🏷️', '쿠팡 링크 추가 · ' + p.name + (row.auto ? ' (자동 생성)' : ''));
    if (!silent) toast('링크 히스토리에 추가했습니다', 'good');
  }
  function addHistoryManual() {
    const p = state.product;
    const name = p ? p.name : '직접 추가한 링크';
    const link = coupangLink() || (state.coupang.auto ? autoLink(name) : '');
    state.history.push({ id: uid('h'), name, link, date: new Date().toISOString(), auto: !state.history.some(h => h.link === link) });
    lsSet(LS.hist, state.history);
    renderHistory(); buildHubTexts(); renderHub();
    logActivity('🏷️', '쿠팡 링크 직접 추가 · ' + name);
    toast(link ? '링크를 추가했습니다' : '링크가 비어 있습니다 · 자동 생성을 켜 보세요', link ? 'good' : 'bad');
  }
  function renderHistory() {
    const body = $('#histBody'); if (!body) return;
    const list = state.history;
    const cnt = $('#histCount'); if (cnt) cnt.textContent = String(list.length);
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--dim);padding:16px">아직 등록된 링크가 없습니다</td></tr>';
      return;
    }
    body.innerHTML = list.slice().reverse().map((h, ri) => {
      const n = list.length - ri;
      return '<tr data-hist="' + h.id + '"><td class="num">' + pad(n) + '</td>' +
        '<td>' + esc(h.name || '-') + (h.auto ? ' <span class="tag">자동</span>' : '') + '</td>' +
        '<td>' + (h.link ? '<a class="lk" href="' + esc(h.link) + '" target="_blank" rel="noopener noreferrer">' + esc(h.link) + '</a>' : '<span class="dim">링크 없음</span>') + '</td>' +
        '<td class="num">' + new Date(h.date).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) + '</td>' +
        '<td><div class="acts"><button class="btn xs ghost" type="button" data-hist-copy="' + h.id + '">복사</button>' +
        '<button class="btn xs danger" type="button" data-hist-del="' + h.id + '">✕</button></div></td></tr>';
    }).join('');
    const hs = $('#histStatus');
    if (hs) hs.textContent = state.history.length + '개 링크 · 최신 링크가 업로드 문구에 들어갑니다.';
  }
  function deleteHistory(id) {
    state.history = state.history.filter(h => h.id !== id);
    lsSet(LS.hist, state.history); renderHistory(); buildHubTexts(); renderHub();
  }

  /* ---------------- 내 성과 ---------------- */
  function logActivity(ico, text) {
    state.activity.unshift({ t: Date.now(), ico: ico || '•', text: String(text || '') });
    if (state.activity.length > 40) state.activity.length = 40;
    renderPerf();
  }
  function renderPerf() {
    const grid = $('#perfStats');
    const sentences = state.script ? state.script.sentences.length : 0;
    const voiceLen = state.voice ? state.voice.total : 0;
    const titles = state.titles && state.titles.list ? state.titles.list.length : 0;
    if (grid) {
      const items = [
        { k: '대본 문장', v: String(sentences), u: '문장', cls: '' },
        { k: '음성 길이', v: voiceLen ? voiceLen.toFixed(1) : '–', u: voiceLen ? '초' : '', cls: 'mint' },
        { k: '내보낸 영상', v: String(state.exported || 0), u: '개', cls: 'acc' },
        { k: '제목 후보', v: String(titles), u: '개', cls: '' },
        { k: '레퍼런스', v: String(state.refs.length), u: '개', cls: 'blue' },
        { k: '담은 장면', v: String(state.refs.filter(r => r.inCart).length), u: '개', cls: '' },
        { k: '쿠팡 링크', v: String(state.history.length), u: '개', cls: '' },
        { k: '로그인 계정', v: loginCount() + '/6', u: '', cls: 'mint' }
      ];
      grid.innerHTML = items.map(it => '<div class="stat ' + it.cls + '"><span class="k">' + it.k + '</span><span class="v">' + it.v + (it.u ? '<small>' + it.u + '</small>' : '') + '</span></div>').join('');
    }
    const list = $('#perfActivity'), empty = $('#perfEmpty'), cnt = $('#perfCount');
    if (cnt) cnt.textContent = state.activity.length + '건';
    if (empty) empty.classList.toggle('hidden', state.activity.length > 0);
    if (list) list.innerHTML = state.activity.map(a => {
      const d = new Date(a.t);
      return '<div class="act"><span class="ico">' + a.ico + '</span><span class="txt">' + esc(a.text) + '</span><span class="t">' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '</span></div>';
    }).join('');
    const g = $('#perfGoalBadge');
    if (g) g.textContent = (state.exported || 0) + ' / ' + state.famous.perDay;
  }

  /* ---------------- 도구 · 🔥 유명 쇼츠 ---------------- */
  const FAMOUS = { playing: false, t: 0, raf: 0, t0: 0, live: false };
  function loadFamous() {
    const saved = lsGet(LS.famous, null);
    if (saved && typeof saved === 'object') {
      const f = state.famous;
      ['layout', 'noThumb', 'sources', 'aiMark', 'topN', 'topPos', 'topCount', 'tz', 'perDay', 'random', 'title', 'caption'].forEach(k => { if (saved[k] != null) f[k] = saved[k]; });
      if (Array.isArray(saved.accounts) && saved.accounts.length) {
        f.accounts = saved.accounts.slice(0, 8).map((a, i) => ({ id: a.id || ('fa' + (i + 1)), name: a.name || ('계정 ' + (i + 1)), time: a.time || '12:00' }));
      }
      if (!Array.isArray(f.sources) || !f.sources.length) f.sources = ['tiktok', 'youtube', 'instagram'];
      f.perDay = clamp(Math.round(Number(f.perDay) || 10), 1, 50);
      f.topCount = clamp(Math.round(Number(f.topCount) || 5), 2, 30);
    }
  }
  function saveFamous(silent) {
    lsSet(LS.famous, state.famous);
    if (!silent) toast('유명 쇼츠 설정을 저장했습니다', 'good');
  }
  function famousDur() {
    if (state.voice) return Math.max(1, state.voice.total);
    const tl = totalDuration();
    if (tl > 0) return tl;
    const f = state.files[0];
    return Math.min(8, Math.max(3, (f && f.duration) || 6));
  }
  function posName(p) { return ({ tl: '왼쪽 위', tr: '오른쪽 위', bl: '왼쪽 아래' })[p] || '왼쪽 위'; }
  function syncVal(sel, val) { const el = $(sel); if (el && document.activeElement !== el && el.value !== String(val)) el.value = String(val); }
  function syncChk(sel, val) { const el = $(sel); if (el && el.checked !== !!val) el.checked = !!val; }

  function famousCandidates() {
    const f = state.famous;
    return state.refs.filter(r => f.sources.includes(r.platform)).slice(0, 8);
  }
  function famousSourceScene() {
    const f = state.famous;
    if (f.pick) {
      const ref = state.refs.find(r => r.id === f.pick);
      if (ref) return { kind: 'ref', motif: ref.motif, palette: ref.palette, label: ref.title };
    }
    const sc = state.scenes.find(s => !s.muted) || state.scenes[0];
    if (sc) return sc;
    const p = state.product || {};
    return { kind: 'generated', motif: 1, palette: p.palette || ['#ff7a45', '#6b4bff'], label: '자동 생성' };
  }
  function famousSlot(acct, dayOffset) {
    const f = state.famous;
    const d = new Date(); d.setDate(d.getDate() + (dayOffset || 0));
    const r = rng(hash32(acct.id + '|' + d.toDateString() + '|' + acct.time));
    const parts = String(acct.time || '12:00').split(':').map(Number);
    const base = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60;
    const off = f.random ? Math.round(r() * 3600 - 1800) : 0;
    const sec = (base + off + 86400) % 86400;
    return { day: d, sec, hh: Math.floor(sec / 3600), mm: Math.floor((sec % 3600) / 60), ss: sec % 60 };
  }
  function fmtSlot(sl) { return pad(sl.hh) + ':' + pad(sl.mm) + ':' + pad(sl.ss); }
  function famousConfig() {
    const f = state.famous;
    return {
      app: 'shorts-vending', kind: 'famous-shorts-schedule', version: 2,
      generatedAt: new Date().toISOString(),
      timezone: f.tz, perDay: f.perDay, randomizeWithinSeconds: f.random ? 1800 : 0,
      layout: f.layout, useThumbnail: !f.noThumb, sources: f.sources.slice(),
      marks: { ai: !!f.aiMark, topN: !!f.topN, topCount: f.topCount, position: f.topPos },
      title: f.title || '', caption: f.caption || '',
      accounts: f.accounts.map(a => ({
        name: a.name, baseTime: a.time,
        slots: [0, 1, 2].map(k => { const s = famousSlot(a, k); return s.day.toISOString().slice(0, 10) + 'T' + fmtSlot(s); })
      }))
    };
  }
  function famousConfigText() { return JSON.stringify(famousConfig(), null, 2); }

  function renderFamousCandidates() {
    const wrap = $('#famousCandidates'), empty = $('#famousCandEmpty');
    if (!wrap) return;
    const list = famousCandidates();
    if (empty) empty.classList.toggle('hidden', list.length > 0);
    wrap.innerHTML = list.map(r =>
      '<div class="cand ' + (state.famous.pick === r.id ? 'on' : '') + '" data-cand="' + r.id + '">' +
      platformBadge(r.platform) + '<span class="meta"><b>' + esc(r.title) + '</b><span>' + esc(r.features || '') + '</span></span>' +
      '<span class="v">▶ ' + fmtNum(r.views) + '</span>' +
      '<button class="btn xs ' + (state.famous.pick === r.id ? 'mint' : 'soft') + '" type="button" data-cand-pick="' + r.id + '">' + (state.famous.pick === r.id ? '골랐음 ✓' : '이 소재로') + '</button></div>').join('');
    const hint = $('#famousCandHint');
    if (hint) hint.textContent = list.length ? (state.refs.length ? '2단계 레퍼런스에서' : '데모 목록') : '소재 없음';
  }
  function renderFamousAccounts() {
    const wrap = $('#famousAccounts'); if (!wrap) return;
    const f = state.famous;
    wrap.innerHTML = f.accounts.map((a, i) =>
      '<div class="acct-row" data-fa="' + a.id + '">' +
      '<input type="text" data-fa-name="' + i + '" value="' + esc(a.name) + '" maxlength="18" aria-label="계정 이름">' +
      '<input type="time" data-fa-time="' + i + '" value="' + esc(a.time) + '" aria-label="' + esc(a.name) + ' 올릴 시각">' +
      '<button class="btn xs danger" type="button" data-fa-del="' + i + '" aria-label="계정 삭제">✕</button></div>').join('');
    const hint = $('#famousAcctHint');
    if (hint) hint.textContent = f.accounts.length + '개 계정 · 하루 ' + f.perDay + '개까지';
  }
  function renderFamousSched() {
    const body = $('#famousSchedBody'); if (!body) return;
    const f = state.famous;
    if (!f.accounts.length) { body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--dim);padding:14px">계정을 추가하면 스케줄이 나옵니다</td></tr>'; return; }
    body.innerHTML = f.accounts.map(a => {
      const slots = [0, 1, 2].map(k => famousSlot(a, k));
      return '<tr data-fsched="' + a.id + '"><td>' + esc(a.name) + '</td>' +
        '<td class="mono">' + esc(a.time) + '</td>' +
        slots.map(sl => '<td class="mono">' + fmtSlot(sl) + '</td>').join('') + '</tr>';
    }).join('');
    const hint = $('#famousRandomHint');
    if (hint) hint.textContent = f.random ? '±30분 랜덤 (분·초까지)' : '설정 시각 그대로';
  }

  /* ---- 유명 쇼츠 렌더러 ---- */
  function drawVideoIn(ctx, el, x, y, w, h) {
    const vw = el.videoWidth || 9, vh = el.videoHeight || 16;
    const s = Math.max(w / vw, h / vh);
    ctx.drawImage(el, x + (w - vw * s) / 2, y + (h - vh * s) / 2, vw * s, vh * s);
  }
  function drawSceneInto(ctx, x, y, w, h, sc, tt, gt) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = '#0a0f16'; ctx.fillRect(x, y, w, h);
    let drew = false;
    if (sc && sc.kind === 'clip') {
      const file = state.files.find(f => f.id === sc.fileId) || state.files[0];
      if (file && file.el && file.el.readyState >= 2) {
        const dur = file.el.duration || file.duration || 1;
        const vt = tt % Math.max(0.2, dur);
        if (!FAMOUS.live && Math.abs(file.el.currentTime - vt) > 0.3) { try { file.el.currentTime = vt; } catch (e) {} }
        try { drawVideoIn(ctx, file.el, x, y, w, h); drew = true; } catch (e) {}
      }
    }
    if (!drew) {
      const pal = (sc && sc.palette) || (state.product && state.product.palette) || ['#ff7a45', '#6b4bff'];
      const lg = ctx.createLinearGradient(x, y, x + w, y + h);
      lg.addColorStop(0, pal[1] || '#26344a'); lg.addColorStop(1, pal[0] || '#ff7a45');
      ctx.fillStyle = lg; ctx.fillRect(x, y, w, h);
      ctx.save(); ctx.translate(x, y);
      drawMotif(ctx, w, h, (sc && sc.motif) || 0, gt * 0.8, pal);
      ctx.restore();
    }
    ctx.restore();
  }
  function wrapTextCenter(ctx, text, cx, cy, maxW, lineH, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = []; let line = '';
    words.forEach(w => {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    });
    if (line) lines.push(line);
    const show = lines.slice(0, maxLines || 2);
    const start = cy - (show.length - 1) * lineH / 2;
    show.forEach((l, i) => ctx.fillText(l, cx, start + i * lineH));
    return show.length;
  }
  function drawFamousMarks(ctx, W, H, t, dur) {
    const f = state.famous;
    if (!f.aiMark && !f.topN) return;
    const padX = Math.round(W * 0.045), padY = Math.round(H * 0.035);
    const right = f.topPos === 'tr';
    const bottom = f.topPos === 'bl';
    // 위아래 검은 화면에서는 제목·문구 영역을 피해 오버레이를 놓는다
    const topOffset = f.layout === 'banded' ? Math.round(H * 0.135) : 0;
    const botOffset = f.layout === 'banded' ? Math.round(H * 0.175) : 0;
    const fam = FONT_STACK.sans;
    const gap = Math.round(H * 0.012);
    ctx.save();
    ctx.textBaseline = 'top';
    let yCur = bottom ? H - padY - botOffset : padY + topOffset;
    // AI 표기
    if (f.aiMark) {
      const fs = Math.round(W * 0.036);
      ctx.font = '800 ' + fs + 'px ' + fam;
      const label = 'AI 생성';
      const bw = ctx.measureText(label).width + fs * 1.6, bh = fs * 1.9;
      const bx = right ? W - padX - bw : padX;
      const by = bottom ? yCur - bh : yCur;
      ctx.fillStyle = 'rgba(0,0,0,.66)';
      roundRect(ctx, bx, by, bw, bh, bh / 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = Math.max(1, W * 0.003);
      roundRect(ctx, bx, by, bw, bh, bh / 2); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(label, bx + bw / 2, by + (bh - fs) / 2);
      yCur = bottom ? by - gap : by + bh + gap;
    }
    // TOP N 카운트다운
    if (f.topN) {
      const n = clamp(Math.round(Number(f.topCount) || 5), 2, 30);
      const remain = Math.max(1, Math.ceil(n * (1 - (dur ? clamp(t / dur, 0, 1) : 0))));
      const bw = Math.round(W * 0.22), bh = Math.round(H * 0.125);
      const bx = right ? W - padX - bw : padX;
      const by = bottom ? yCur - bh : yCur;
      ctx.fillStyle = 'rgba(0,0,0,.68)';
      roundRect(ctx, bx, by, bw, bh, Math.round(bw * 0.16)); ctx.fill();
      ctx.strokeStyle = 'rgba(255,122,69,.8)'; ctx.lineWidth = Math.max(2, W * 0.006);
      roundRect(ctx, bx, by, bw, bh, Math.round(bw * 0.16)); ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd166';
      ctx.font = '800 ' + Math.round(W * 0.032) + 'px ' + fam;
      ctx.fillText('TOP', bx + bw / 2, by + bh * 0.12);
      ctx.fillStyle = '#fff';
      ctx.font = '900 ' + Math.round(W * 0.088) + 'px ' + fam;
      ctx.fillText(String(remain), bx + bw / 2, by + bh * 0.36);
    }
    ctx.restore();
  }
  function drawFamousFrame(ctx, W, H, t) {
    const f = state.famous;
    const dur = famousDur();
    const tt = dur > 0 ? (((t % dur) + dur) % dur) : t;
    const sc = famousSourceScene();
    const fam = FONT_STACK.sans;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#05080c'; ctx.fillRect(0, 0, W, H);
    const title = String(f.title || (state.script && state.script.titles && state.script.titles[0]) || (state.product && state.product.name) || '유명 쇼츠').slice(0, 40);
    const caption = String(f.caption || '').trim();
    if (f.layout === 'banded') {
      const topH = Math.round(H * 0.135), botH = Math.round(H * 0.175);
      const vidH = H - topH - botH;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let fs = Math.round(W * 0.072);
      ctx.font = '900 ' + fs + 'px ' + fam;
      while (fs > 18 && ctx.measureText(title).width > W * 0.88) { fs -= 2; ctx.font = '900 ' + fs + 'px ' + fam; }
      ctx.fillStyle = '#ffffff';
      ctx.fillText(title, W / 2, topH / 2);
      drawSceneInto(ctx, 0, topH, W, vidH, sc, tt, t);
      if (caption) {
        const cfs = Math.round(W * 0.05);
        ctx.fillStyle = 'rgba(255,255,255,.94)';
        ctx.font = '700 ' + cfs + 'px ' + fam;
        wrapTextCenter(ctx, caption, W / 2, topH + vidH + botH / 2, W * 0.86, cfs * 1.35, 2);
      }
    } else {
      drawSceneInto(ctx, 0, 0, W, H, sc, tt, t);
      if (caption) {
        const strip = Math.round(H * 0.11);
        const g = ctx.createLinearGradient(0, H - strip, 0, H);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.8)');
        ctx.fillStyle = g; ctx.fillRect(0, H - strip, W, strip);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const cfs = Math.round(W * 0.05);
        ctx.font = '700 ' + cfs + 'px ' + fam;
        wrapTextCenter(ctx, caption, W / 2, H - strip * 0.46, W * 0.88, cfs * 1.3, 2);
      }
    }
    drawFamousMarks(ctx, W, H, tt, dur);
    ctx.restore();
  }
  function drawFamousPreview() {
    const cv = $('#famousCanvas'); if (!cv) return;
    drawFamousFrame(cv.getContext('2d'), cv.width, cv.height, FAMOUS.t);
    const total = famousDur();
    const seek = $('#famousSeek');
    if (seek && document.activeElement !== seek) seek.value = String(Math.round(total ? FAMOUS.t / total * 1000 : 0));
    const tl = $('#famousTimeLabel'); if (tl) tl.textContent = fmtTime(FAMOUS.t) + ' / ' + fmtTime(total);
    const lb = $('#famousInfoLayout'); if (lb) lb.textContent = state.famous.layout === 'banded' ? '위아래 검은 화면' : '꽉 찬 화면';
    const mb = $('#famousInfoMark');
    if (mb) mb.textContent = (state.famous.aiMark || state.famous.topN) ? [state.famous.aiMark ? 'AI' : '', state.famous.topN ? 'TOP ' + state.famous.topCount : ''].filter(Boolean).join(' · ') + ' · ' + posName(state.famous.topPos) : '표기 없음';
  }
  function stopFamousPlay() {
    FAMOUS.playing = false;
    cancelAnimationFrame(FAMOUS.raf);
    const b = $('#famousPlay'); if (b) b.textContent = '▶';
    drawFamousPreview();
  }
  function toggleFamousPlay() {
    if (FAMOUS.playing) { stopFamousPlay(); return; }
    FAMOUS.playing = true;
    FAMOUS.t0 = performance.now() / 1000 - FAMOUS.t;
    const b = $('#famousPlay'); if (b) b.textContent = '⏸';
    const step = () => {
      if (!FAMOUS.playing) return;
      const total = famousDur();
      FAMOUS.t = performance.now() / 1000 - FAMOUS.t0;
      if (FAMOUS.t >= total) { FAMOUS.t = total; stopFamousPlay(); return; }
      drawFamousPreview();
      FAMOUS.raf = requestAnimationFrame(step);
    };
    FAMOUS.raf = requestAnimationFrame(step);
  }
  function renderFamous() {
    const f = state.famous;
    syncVal('#famousLayout', f.layout);
    syncVal('#famousTitle', f.title || '');
    syncVal('#famousCaption', f.caption || '');
    syncVal('#famousTz', f.tz);
    syncVal('#famousPos', f.topPos);
    syncVal('#famousTopCount', f.topCount);
    syncChk('#famousNoThumb', f.noThumb);
    syncChk('#famousAiMark', f.aiMark);
    syncChk('#famousTopN', f.topN);
    syncChk('#famousRandom', f.random);
    const pd = $('#famousPerDay'); if (pd) pd.textContent = String(f.perDay);
    const tzb = $('#famousTzBadge'); if (tzb) tzb.textContent = f.tz;
    const lb = $('#famousLayoutBadge'); if (lb) lb.textContent = f.layout === 'banded' ? '위아래 검은 화면' : '꽉 찬 화면';
    const mb = $('#famousMarkBadge'); if (mb) mb.textContent = (f.aiMark ? 'AI' : '표기 없음') + (f.topN ? ' · TOP ' + f.topCount : '');
    const sc = $('#famousSrcCount'); if (sc) sc.textContent = f.sources.length + '곳';
    $$('#famousSources [data-src]').forEach(b => b.classList.toggle('on', f.sources.includes(b.dataset.src)));
    renderFamousCandidates(); renderFamousAccounts(); renderFamousSched();
    drawFamousPreview();
    const jst = $('#famousJsonStatus');
    if (jst && !jst.dataset.keep) jst.textContent = 'PC 패키지 자동 스케줄에 넣어 씁니다 · ' + f.accounts.length + '개 계정';
  }

  /* ---- 캔버스 녹화(유명 쇼츠·자막 지우개 공용) ---- */
  async function recordClip(drawFn, dur, ui, opts) {
    opts = opts || {}; ui = ui || {};
    const W = 540, H = 960;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    cv.style.cssText = 'position:fixed;left:-10000px;top:0;width:540px;height:960px';
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d');
    const stream = cv.captureStream(30);
    const ac = getAC();
    let dest = null;
    if (opts.audio) {
      dest = ac.createMediaStreamDestination();
      dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    }
    const mime = pickMime();
    let rec;
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4200000, audioBitsPerSecond: 128000 } : undefined); }
    catch (e) { cv.remove(); throw e; }
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(res => { rec.onstop = () => res(new Blob(chunks, { type: 'video/webm' })); });
    rec.start(1000);
    const startAt = ac.currentTime + 0.18;
    if (opts.audio) { try { opts.audio(dest, ac, startAt); } catch (e) {} }
    if (ui.prog) ui.prog.classList.add('on');
    const t0 = performance.now();
    await new Promise(resolve => {
      function frame() {
        const elapsed = (performance.now() - t0) / 1000;
        const t = Math.min(dur, elapsed);
        try { drawFn(ctx, W, H, t); } catch (e) {}
        if (ui.bar) ui.bar.style.width = Math.round(elapsed / dur * 100) + '%';
        if (ui.status) ui.status.textContent = (ui.label || '녹화') + ' 녹화 중… ' + elapsed.toFixed(1) + ' / ' + dur.toFixed(1) + '초';
        if (elapsed >= dur) { resolve(); return; }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    try { rec.stop(); } catch (e) {}
    const blob = await done;
    stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
    if (dest) dest.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
    cv.remove();
    if (ui.prog) ui.prog.classList.remove('on');
    return blob;
  }

  async function exportFamousWebM() {
    if (exporting) { toast('이미 내보내는 중입니다'); return; }
    exporting = true;
    stopFamousPlay(); stopPlayback();
    const dur = famousDur();
    const status = $('#famousExportStatus'), bar = $('#famousBar'), prog = $('#famousProg');
    FAMOUS.live = true;
    const srcFile = state.files.find(f => f.el && f.el.readyState >= 2);
    let blob = null;
    try {
      blob = await recordClip((ctx, W, H, t) => drawFamousFrame(ctx, W, H, t), dur, { prog, bar, status, label: '유명 쇼츠' }, {
        audio: (dest, ac, startAt) => {
          if (!state.voice) return;
          state.voice.timeline.forEach((row, i) => {
            const src = ac.createBufferSource(); src.buffer = state.voice.buffers[i];
            const g = ac.createGain(); g.gain.value = 1;
            src.connect(g); g.connect(dest);
            try { src.start(startAt + row.start); } catch (e) {}
          });
        }
      });
    } catch (e) { toast('내보내기 실패: ' + (e.message || e), 'bad'); }
    if (srcFile && srcFile.el) { try { srcFile.el.pause(); } catch (e) {} }
    FAMOUS.live = false;
    exporting = false;
    if (!blob || blob.size < 1024) { if (status) status.textContent = '내보내기 실패 · 데이터 없음'; return; }
    const url = URL.createObjectURL(blob);
    const name = 'famous-shorts-' + new Date().toISOString().slice(0, 10) + '.webm';
    const a = $('#famousExportLink'); if (a) { a.href = url; a.download = name; a.classList.remove('hidden'); }
    if (status) status.textContent = '완료 · ' + (blob.size / 1048576).toFixed(2) + 'MB · ' + dur.toFixed(1) + '초';
    state.exported++;
    logActivity('🔥', '유명 쇼츠 WebM 내보내기 · ' + dur.toFixed(1) + '초 · ' + (state.famous.layout === 'banded' ? '위아래 검은 화면' : '꽉 찬 화면'));
    toast('유명 쇼츠 WebM 완성 · ' + (blob.size / 1048576).toFixed(2) + 'MB', 'good');
    return blob;
  }

  /* ---------------- 도구 · 멀티 다운로더 ---------------- */
  function parseMultiLinks(text) {
    const seen = new Set(), out = [];
    String(text || '').split(/\r?\n/).forEach(line => {
      const m = line.match(/https?:\/\/[^\s"'<>]+/i);
      if (!m) return;
      const url = m[0].replace(/[),.;]+$/, '');
      if (seen.has(url)) return;
      seen.add(url); out.push(url);
    });
    return out.slice(0, 50);
  }
  function loadMulti() {
    const saved = lsGet(LS.multi, null);
    if (saved && Array.isArray(saved.links)) state.multi.links = saved.links.slice(0, 50).map(String);
    const ta = $('#multiInput'); if (ta) ta.value = state.multi.links.join('\n');
  }
  function setMulti(text, silent) {
    state.multi.links = parseMultiLinks(text);
    lsSet(LS.multi, state.multi);
    renderMulti();
    if (!silent) toast(state.multi.links.length + '개 링크를 정리했습니다', state.multi.links.length ? 'good' : 'bad');
  }
  function multiCommand() {
    const links = state.multi.links;
    if (!links.length) return '링크를 넣으면 여기에 다운로드 명령이 만들어집니다.';
    return 'yt-dlp -f "bv*+ba/b" --no-playlist -P downloads "' + links.join('" "') + '"' +
      '\n\n# 또는 links.txt로 저장한 뒤\n# yt-dlp -a links.txt -f "bv*+ba/b" --no-playlist -P downloads';
  }
  function renderMulti() {
    const links = state.multi.links;
    const cnt = $('#multiCount'); if (cnt) cnt.textContent = links.length + '개';
    const cmd = $('#multiCmd'); if (cmd) cmd.textContent = multiCommand();
    const list = $('#multiList');
    if (list) list.innerHTML = links.map((u, i) =>
      '<div class="link-item" data-multi-item="' + i + '"><span class="idx">' + (i + 1) + '</span>' +
      '<span class="meta"><b>' + esc(linkTitle(u, platformOf(u))) + '</b><span>' + esc(u) + '</span></span>' +
      platformBadge(platformOf(u)) +
      '<span class="acts"><button class="btn xs danger" type="button" data-multi-del="' + i + '" title="빼기">✕</button></span></div>').join('');
    const st = $('#multiStatus');
    if (st) st.textContent = links.length ? links.length + '개 · 중복은 자동으로 뺐습니다.' : '한 번에 최대 50개까지 정리합니다.';
  }
  function downloadText(name, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
    return blob;
  }

  /* ---------------- 도구 · 자막 지우개 ---------------- */
  function eraserFile() {
    const e = state.eraser;
    return state.files.find(f => f.id === e.fileId) || state.files[0] || null;
  }
  function renderEraserOptions() {
    const sel = $('#eraserFile'); if (!sel) return;
    if (!state.files.length) { sel.innerHTML = '<option value="">1단계에서 올린 영상이 없습니다</option>'; return; }
    const cur = state.eraser.fileId || state.files[0].id;
    if (!state.eraser.fileId) state.eraser.fileId = cur;
    sel.innerHTML = state.files.map(f => '<option value="' + f.id + '"' + (f.id === cur ? ' selected' : '') + '>' + esc(f.name) + ' · ' + fmtTime(f.duration) + '</option>').join('');
  }
  function syncEraserInputs() {
    const e = state.eraser;
    const t = eraserFile();
    const max = t ? Math.max(0.1, (t.el && t.el.duration) || t.duration || 3) : 3;
    const ts = $('#eraserTime'); if (ts) ts.max = String(max.toFixed(2));
    ['#eraserX', '#eraserY', '#eraserW', '#eraserH', '#eraserStrength'].forEach((sel, i) => {
      const keys = ['x', 'y', 'w', 'h', 'strength'];
      syncVal(sel, e[keys[i]]);
    });
    syncVal('#eraserTime', e.t.toFixed(2));
    syncVal('#eraserMode', e.mode);
    const lab = { '#eraserXVal': e.x + '%', '#eraserYVal': e.y + '%', '#eraserWVal': e.w + '%', '#eraserHVal': e.h + '%', '#eraserStrengthVal': e.strength + 'px', '#eraserTimeVal': e.t.toFixed(1) + 's' };
    Object.keys(lab).forEach(k => { const el = $(k); if (el) el.textContent = lab[k]; });
    const badge = $('#eraserFileBadge'); if (badge) badge.textContent = t ? t.name.slice(0, 24) : '영상 없음';
  }
  function drawEraserFrame(ctx, W, H, guide) {
    const e = state.eraser;
    const f = eraserFile();
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#05080c'; ctx.fillRect(0, 0, W, H);
    let drew = false;
    if (f && f.el && f.el.readyState >= 2) {
      try { drawVideoIn(ctx, f.el, 0, 0, W, H); drew = true; } catch (err) {}
    }
    if (!drew) {
      ctx.fillStyle = '#0d151f'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#4f637a';
      ctx.font = Math.round(W * 0.045) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('영상을 고르면 여기에 나옵니다', W / 2, H / 2);
    }
    const x = Math.round(e.x / 100 * W), y = Math.round(e.y / 100 * H);
    const w = Math.max(2, Math.round(e.w / 100 * W)), h = Math.max(2, Math.round(e.h / 100 * H));
    applyBlurRegion(ctx, W, H, x, y, Math.min(w, W - x), Math.min(h, H - y), Math.max(2, e.strength * (H / 960)), e.mode);
    if (guide) {
      ctx.strokeStyle = 'rgba(47,227,176,.6)'; ctx.lineWidth = 2; ctx.setLineDash([9, 7]);
      ctx.strokeRect(x + 1, y + 1, Math.min(w, W - x) - 2, Math.min(h, H - y) - 2);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
  function drawEraserPreview(seekTo) {
    const cv = $('#eraserCanvas'); if (!cv) return;
    const f = eraserFile();
    if (f && f.el && seekTo) {
      const dmax = (f.el.duration || f.duration || 1);
      const target = clamp(state.eraser.t, 0, Math.max(0.05, dmax - 0.06));
      try { f.el.currentTime = target; } catch (e) {}
      if (f.el.readyState >= 2) { setTimeout(() => { const c2 = $('#eraserCanvas'); if (c2) drawEraserFrame(c2.getContext('2d'), c2.width, c2.height, true); }, 120); }
    }
    drawEraserFrame(cv.getContext('2d'), cv.width, cv.height, true);
    const st = $('#eraserStatus');
    if (st) st.textContent = f ? (f.name + ' · ' + state.eraser.t.toFixed(1) + 's 지점 · ' + gapFreeLabel()) : '영상을 고르면 미리보기가 나옵니다.';
  }
  function gapFreeLabel() {
    return state.eraser.mode === 'mosaic' ? '모자이크 ' + state.eraser.strength + 'px' : '블러 ' + state.eraser.strength + 'px';
  }
  async function exportEraserWebM() {
    if (exporting) { toast('이미 내보내는 중입니다'); return; }
    const f = eraserFile();
    if (!f || !f.el) { toast('먼저 영상을 골라 주세요', 'bad'); return; }
    exporting = true;
    const dur = Math.min(30, Math.max(0.6, f.el.duration || f.duration || 3));
    const status = $('#eraserStatus'), bar = $('#eraserBar'), prog = $('#eraserProg');
    try { f.el.muted = true; f.el.currentTime = 0; await f.el.play(); } catch (e) {}
    let blob = null;
    try {
      blob = await recordClip((ctx, W, H) => drawEraserFrame(ctx, W, H, false), dur, { prog, bar, status, label: '자막 지우개' });
    } catch (e) { toast('내보내기 실패: ' + (e.message || e), 'bad'); }
    try { f.el.pause(); } catch (e) {}
    exporting = false;
    if (!blob || blob.size < 1024) { if (status) status.textContent = '내보내기 실패 · 데이터 없음'; return; }
    const url = URL.createObjectURL(blob);
    const name = 'no-subtitle-' + new Date().toISOString().slice(0, 10) + '.webm';
    const a = $('#eraserLink'); if (a) { a.href = url; a.download = name; a.classList.remove('hidden'); }
    if (status) status.textContent = '완료 · ' + (blob.size / 1048576).toFixed(2) + 'MB · ' + dur.toFixed(1) + '초 · 영상만(음성 없음)';
    state.exported++;
    logActivity('▨', '자막 지우개 WebM 내보내기 · ' + dur.toFixed(1) + '초 · ' + gapFreeLabel());
    toast('자막 가린 WebM 완성 · ' + (blob.size / 1048576).toFixed(2) + 'MB', 'good');
    return blob;
  }

  /* ---------------- navigation / progress ---------------- */
  const STEP_LABEL = ['설정', '링크 넣기', '비슷한 제품', '대본·음성', '자동 편집', '썸네일·제목', '다뿌려 업로드', '쿠팡 파트너스'];
  const VIEW_ORDER = ['perf', '1', '2', '3', '4', '5', '6', 'multi', 'eraser', 'stt', 'trend', 'famous', 'settings', 'coupang'];
  const VIEW_NUM = { settings: 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, coupang: 7 };
  const VIEW_NAME = { perf: '내 성과', multi: '멀티 다운로더', eraser: '자막 지우개', stt: '음성→텍스트 · STT', trend: '떡상 순위 · 벤치마킹', famous: '유명 쇼츠', settings: '설정', coupang: '쿠팡 파트너스' };

  /* =========================================================
     도구 · 음성→텍스트 (STT) — Gemini 멀티모달 오디오 입력
     ========================================================= */
  const STT_MAX = 14 * 1024 * 1024;              // base64 33% 증가 + 요청 20MB 한도
  const STT_EXT = /\.(mp3|m4a|wav|ogg|oga|flac|aac|opus|mpga|mp4|webm|mov|m4v|mpg|mpeg)$/i;
  const STT_LANG_NAME = { auto: '파일에서 들리는 언어 그대로', ko: '한국어', en: '영어', ja: '일본어' };
  const STT_SAMPLE_TEXT = [
    '이 제품 진짜 써 봤는데 생각보다 훨씬 좋았어요.',
    '먼저 물기만 닦아도 윤기가 남는 게 신기했어요.',
    '일주일 써 보니 손이 자주 가는 이유를 알겠더라고요.',
    '가격 생각하면 이 정도면 충분하다 싶었습니다.',
    '궁금하면 고정댓글 링크 확인해 보세요.'
  ].join('\n');
  const STT_SAMPLE_SEGS = [
    { start: 0.0, end: 2.6, text: '이 제품 진짜 써 봤는데' },
    { start: 2.6, end: 5.4, text: '생각보다 훨씬 좋았어요' },
    { start: 5.6, end: 8.9, text: '먼저 물기만 닦아도 윤기가 남는 게 신기했어요' },
    { start: 9.1, end: 12.4, text: '일주일 써 보니 손이 자주 가는 이유를 알겠더라고요' },
    { start: 12.6, end: 15.2, text: '가격 생각하면 이 정도면 충분하다 싶었습니다' },
    { start: 15.4, end: 17.8, text: '궁금하면 고정댓글 링크 확인해 보세요' }
  ];

  function sttMimeOf(file) {
    const n = String(file.name || '').toLowerCase();
    const t = String(file.type || '');
    if (/\.mp3$/.test(n) || /mpeg/.test(t)) return 'audio/mp3';
    if (/\.wav$/.test(n) || /wav/.test(t)) return 'audio/wav';
    if (/\.m4a$/.test(n)) return 'audio/mp4';
    if (/\.aac$/.test(n)) return 'audio/aac';
    if (/\.(ogg|oga|opus)$/.test(n) || /ogg|opus/.test(t)) return 'audio/ogg';
    if (/\.flac$/.test(n)) return 'audio/flac';
    if (/\.mp4$/.test(n) || /mp4/.test(t)) return 'video/mp4';
    if (/\.mov$/.test(n) || /quicktime/.test(t)) return 'video/mov';
    if (/\.webm$/.test(n) || /webm/.test(t)) return 'video/webm';
    if (/\.(mpg|mpeg)$/.test(n)) return 'video/mpeg';
    return /^audio\//.test(t) ? t : 'video/mp4';
  }
  function sttSizeText(n) {
    n = Number(n) || 0;
    return n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB';
  }
  function sttReady() { return !state.demo && realKeys().length > 0; }

  function sttSetFile(file) {
    if (!file) return false;
    const st = state.stt;
    const okName = STT_EXT.test(file.name || '') || /^(audio|video)\//.test(file.type || '');
    if (!okName) {
      st.error = '음성·영상 파일만 올릴 수 있습니다 (mp3 · wav · m4a · mp4 · webm · mov).';
      renderStt(); toast('음성·영상 파일을 선택해 주세요', 'bad'); return false;
    }
    if (file.size > STT_MAX) {
      st.error = '파일이 ' + sttSizeText(file.size) + '로 14MB를 넘습니다. Gemini 요청 한도(20MB) 때문에 인식할 수 없으니, PC 패키지의 Whisper STT로 처리하세요.';
      renderStt(); toast('14MB가 넘는 파일은 인식할 수 없습니다', 'bad'); return false;
    }
    if (st.url) { try { URL.revokeObjectURL(st.url); } catch (e) {} }
    st.file = { name: file.name, size: file.size, type: file.type, raw: file };
    st.url = URL.createObjectURL(file);
    st.mime = sttMimeOf(file);
    st.video = /^video\//.test(st.mime);
    st.dur = 0; st.text = ''; st.segments = []; st.sample = false; st.error = ''; st.busy = false;
    const v = $('#sttVideo'), a = $('#sttAudio'), empty = $('#sttEmpty');
    const el = st.video ? v : a, other = st.video ? a : v;
    if (v) { try { v.pause(); } catch (e) {} v.removeAttribute('src'); }
    if (a) { try { a.pause(); } catch (e) {} a.removeAttribute('src'); }
    if (other) other.classList.add('hidden');
    if (empty) empty.classList.add('hidden');
    if (el) {
      el.classList.remove('hidden');
      el.src = st.url;
      el.onloadedmetadata = () => { st.dur = isFinite(el.duration) ? el.duration : 0; renderStt(); };
      el.onerror = () => { st.error = '브라우저가 이 파일을 재생하지 못했습니다. mp3·wav·m4a로 바꾸거나 PC 패키지를 쓰세요.'; renderStt(); };
    }
    toast('파일을 올렸습니다 · ' + file.name, 'good');
    renderStt();
    return true;
  }

  function sttBase64(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => { const s = String(fr.result || ''); const i = s.indexOf(','); resolve(i >= 0 ? s.slice(i + 1) : ''); };
      fr.onerror = () => reject(new Error('파일을 읽지 못했습니다'));
      fr.readAsDataURL(file);
    });
  }

  function sttPrompt(lang, format) {
    const lines = [
      '너는 음성 받아쓰기(STT) 엔진이다. 첨부한 오디오/영상 파일의 말을 그대로 받아쓴다.',
      '번역·요약·의역·추측 금지. 들리지 않는 말을 지어내지 마라. 말소리가 없으면 SPEECH_NOT_FOUND 한 줄만 출력한다.',
      '언어: ' + (STT_LANG_NAME[lang] || STT_LANG_NAME.auto) + '.'
    ];
    if (format === 'srt') {
      lines.push('출력: SRT 자막 형식만. 각 자막은 1) 번호 2) 00:00:00,000 --> 00:00:02,400 3) 자막 한 줄 순서로 쓰고, 자막 사이는 빈 줄로 구분한다.');
      lines.push('자막 한 줄은 20자 안팎으로 끊고, 타임스탬프는 실제로 말한 시각을 밀리초 3자리(쉼표)로 적는다.');
    } else {
      lines.push('출력: 순수 텍스트만. 한 문장마다 줄바꿈. 번호·타임스탬프·머리말 금지.');
    }
    return lines.join('\n');
  }

  /* SRT 파서 — "00:00:01,200 --> 00:00:03,400" / 마침표 표기 모두 허용 */
  function sttParseSRT(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const T = /^\s*(?:\d+\s*)?(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;
    const sec = (h, m, s, ms) => (+h) * 3600 + (+m) * 60 + (+s) + Number('0.' + String(ms || '0').padEnd(3, '0'));
    const out = [];
    let cur = null;
    lines.forEach(ln => {
      const m = ln.match(T);
      if (m) {
        if (cur && cur.text.trim()) out.push(cur);
        cur = { start: sec(m[1], m[2], m[3], m[4]), end: sec(m[5], m[6], m[7], m[8]), text: '' };
        return;
      }
      if (!cur) return;
      const t = ln.trim();
      if (!t) { if (cur.text.trim()) { out.push(cur); cur = null; } return; }
      if (/^\d{1,4}$/.test(t)) return;                 // 큐 번호 줄
      cur.text += (cur.text ? ' ' : '') + t;
    });
    if (cur && cur.text.trim()) out.push(cur);
    return out.filter(s => s.text && s.end > s.start)
      .map((s, i) => ({ i, start: s.start, end: s.end, dur: s.end - s.start, text: s.text.replace(/<[^>]+>/g, '').trim() }));
  }

  function sttSrtTime(sec) {
    sec = Math.max(0, Number(sec) || 0);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
    const ms = Math.round((sec - Math.floor(sec)) * 1000);
    return pad(h) + ':' + pad(m) + ':' + pad(s) + ',' + String(ms).padStart(3, '0');
  }
  function sttFormatSRT(segs) {
    return (segs || []).map((x, i) => (i + 1) + '\n' + sttSrtTime(x.start) + ' --> ' + sttSrtTime(x.end) + '\n' + String(x.text || '').trim()).join('\n\n') + '\n';
  }

  /* 긴 글 → 대본 문장 (문장부호 기준, 너무 길면 쉼표/길이로 나눔) */
  function sttSplitSentences(text) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return [];
    const parts = raw.split(/(?<=[.!?。！？])\s+/).map(s => s.trim()).filter(Boolean);
    const out = [];
    parts.forEach(p => {
      if (p.length <= 70) { out.push(p); return; }
      const chunks = p.split(/(?<=[,，、])\s*/);
      let cur = '';
      chunks.forEach(c => {
        if (!cur) cur = c;
        else if ((cur + ' ' + c).length <= 45) cur += ' ' + c;
        else { out.push(cur.trim()); cur = c; }
      });
      if (cur.trim()) out.push(cur.trim());
    });
    return out.filter(Boolean).slice(0, 40);
  }
  /* 자막 한 줄 길이로 나누기 */
  function sttSplitCaptions(text, max) {
    const limit = max || 22;
    const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const out = []; let cur = '';
    words.forEach(w => {
      if (!cur) cur = w;
      else if ((cur + ' ' + w).length <= limit) cur += ' ' + w;
      else { out.push(cur); cur = w; }
      while (cur.length > limit * 2) { out.push(cur.slice(0, limit)); cur = cur.slice(limit); }
    });
    if (cur) out.push(cur);
    return out.slice(0, 80);
  }

  function ensureScriptShell() {
    if (!state.script) state.script = { lang: 'ko', tone: 'friendly', length: 'normal', titles: ['', ''], highlights: [], hooks: [], sentences: [], demo: false };
    if (!Array.isArray(state.script.titles)) state.script.titles = ['', ''];
    while (state.script.titles.length < 2) state.script.titles.push('');
    if (!Array.isArray(state.script.highlights)) state.script.highlights = [];
    if (!Array.isArray(state.script.hooks)) state.script.hooks = [];
    if (!Array.isArray(state.script.sentences)) state.script.sentences = [];
    return state.script;
  }

  function updateSubTlUI() {
    const on = !!(state.subTl && state.subTl.length);
    const bar = $('#subTlBar'), info = $('#subTlInfo');
    if (bar) bar.classList.toggle('hidden', !on);
    if (info && on) {
      const last = state.subTl[state.subTl.length - 1];
      info.textContent = 'STT 타임스탬프 ' + state.subTl.length + '줄 · ' + (last.end || 0).toFixed(1) + '초까지 이 타이밍으로 자막을 보여줍니다' + (state.voice ? ' (음성은 잠시 꺼짐)' : '');
    }
  }

  function renderStt() {
    const st = state.stt;
    const badge = $('#sttFileBadge');
    if (badge) badge.textContent = st.file ? st.file.name : '파일 없음';
    const info = $('#sttFileInfo');
    if (info) {
      info.innerHTML = st.file
        ? '<div class="file-item"><span style="font-size:16px">' + (st.video ? '🎬' : '🎧') + '</span><div class="meta"><b>' + esc(st.file.name) + '</b>' +
          '<span>' + sttSizeText(st.file.size) + ' · ' + esc(st.mime) + ' · ' + (st.dur ? st.dur.toFixed(1) + '초' : '길이 확인 중') + '</span></div>' +
          '<button class="btn xs danger" type="button" data-stt-remove="1" title="파일 빼기">✕</button></div>'
        : '';
    }
    const dur = $('#sttDurBadge'); if (dur) dur.textContent = (st.dur ? st.dur.toFixed(1) : '0.0') + 's';
    const run = $('#btnSttRun');
    if (run) {
      run.disabled = !st.file || st.busy;
      run.innerHTML = st.busy ? '<span class="spin"></span> 인식 중' : '🎧 음성 인식 시작';
    }
    const status = $('#sttStatus');
    if (status) {
      status.textContent = st.busy ? 'Gemini가 음성을 받아쓰는 중… 파일이 크면 1~2분 걸립니다.'
        : st.error ? st.error
        : st.text ? '결과 ' + st.text.length + '자' + (st.segments.length ? ' · 자막 ' + st.segments.length + '줄' : '') + (st.sample ? ' · 샘플' : '')
        : st.file ? '「음성 인식 시작」을 누르면 받아씁니다.' : '파일을 올리면 인식할 수 있습니다.';
    }
    const badgeR = $('#sttResultBadge');
    if (badgeR) {
      badgeR.textContent = st.sample ? '샘플' : st.text ? '완료' : '없음';
      badgeR.className = 'badge ' + (st.sample ? 'demo' : st.text ? 'live' : '');
    }
    const ta = $('#sttResult');
    if (ta && document.activeElement !== ta) ta.value = st.text || '';
    if (ta) ta.classList.toggle('srt', /-->/.test(st.text || ''));
    const cnt = $('#sttCount');
    if (cnt) cnt.textContent = (st.text || '').length + '자 · ' + ((st.text || '').split('\n').filter(l => l.trim()).length) + '줄';
    const setDis = (sel, v) => { const b = $(sel); if (b) b.disabled = !!v; };
    setDis('#btnSttCopy', !st.text);
    setDis('#btnSttTxt', !st.text);
    setDis('#btnSttSrt', !(st.segments && st.segments.length));
    setDis('#btnSttToScript', !st.text);
    setDis('#btnSttToCaption', !st.text);
    const sh = $('#sttSendHint');
    if (sh) {
      const nS = st.segments.length ? st.segments.length : sttSplitCaptions(st.text, 22).length;
      const nScript = st.segments.length ? st.segments.length : sttSplitSentences(st.text).length;
      sh.textContent = st.text ? '3단계 대본은 문장 ' + nScript + '개, 4단계 자막은 ' + nS + '줄로 들어갑니다.' : '3단계 대본은 문장으로, 4단계 자막은 자막 줄로 들어갑니다.';
    }
    const keyNote = $('#sttKeyNoteText');
    if (keyNote) {
      keyNote.textContent = sttReady()
        ? 'Gemini 키 ' + realKeys().length + '개로 실제 인식합니다 (gemini-2.5-flash · 한도가 찬 키는 자동 전환).'
        : realKeys().length ? '데모 모드가 켜져 있어 실제 인식 대신 샘플을 씁니다. ⚙️ 설정에서 데모 모드를 끄면 실제 인식합니다.'
        : 'Gemini 키가 없어 실제 인식은 할 수 없습니다. ⚙️ 설정에서 키를 넣으면 바로 동작합니다 (키 없이도 샘플로 화면을 볼 수 있습니다).';
    }
    const segCard = $('#sttSegCard'), segBody = $('#sttSegBody'), segCnt = $('#sttSegCount');
    if (segCard) segCard.classList.toggle('hidden', !(st.segments && st.segments.length));
    if (segCnt) segCnt.textContent = String((st.segments || []).length);
    if (segBody) segBody.innerHTML = (st.segments || []).slice(0, 80).map((s, i) =>
      '<tr><td class="num">' + pad(i + 1) + '</td><td class="num">' + s.start.toFixed(1) + 's</td><td class="num">' + s.end.toFixed(1) + 's</td><td>' + esc(s.text) + '</td></tr>').join('');
  }

  async function sttRun() {
    const st = state.stt;
    if (!st.file || !st.file.raw) { toast('먼저 음성·영상 파일을 올려 주세요', 'bad'); return; }
    if (st.busy) return;
    if (!sttReady()) {
      st.error = realKeys().length ? '데모 모드가 켜져 있어 실제 인식은 하지 않습니다. ⚙️ 설정에서 데모 모드를 끄세요.' : 'Gemini 키가 없어 실제 인식은 할 수 없습니다. ⚙️ 설정에서 키를 넣으세요.';
      renderStt(); toast(st.error, 'bad'); return;
    }
    st.busy = true; st.error = ''; st.sample = false;
    st.text = ''; st.segments = [];
    const prog = $('#sttProg'), bar = $('#sttBar');
    if (prog) prog.classList.add('on');
    if (bar) bar.style.width = '8%';
    renderStt();
    try {
      const b64 = await sttBase64(st.file.raw);
      if (!b64) throw new Error('파일을 읽지 못했습니다');
      if (bar) bar.style.width = '32%';
      const body = {
        contents: [{ parts: [{ text: sttPrompt(st.lang, st.format) }, { inlineData: { mimeType: st.mime, data: b64 } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8192 }
      };
      const data = await geminiCall('gemini-2.5-flash', body, { timeout: 180000, tag: 'stt' });
      if (bar) bar.style.width = '88%';
      const raw = geminiText(data);
      if (!raw) throw new Error('인식 결과가 비어 있습니다 (말소리가 없는 파일일 수 있습니다)');
      if (/SPEECH_NOT_FOUND/i.test(raw)) throw new Error('이 파일에서 말소리를 찾지 못했습니다');
      st.text = raw.trim();
      st.segments = sttParseSRT(st.text);
      if (st.format === 'srt' && !st.segments.length) st.error = 'SRT 형식이 아닌 응답이 왔습니다. 결과를 확인하고 「SRT 자막」으로 다시 인식해 보세요.';
      if (bar) bar.style.width = '100%';
      toast('음성 인식 완료 · ' + st.text.length + '자' + (st.segments.length ? ' · 자막 ' + st.segments.length + '줄' : ''), 'good');
      logActivity('🎙️', '음성 인식 · ' + st.file.name + ' · ' + st.text.length + '자' + (st.segments.length ? ' · 자막 ' + st.segments.length + '줄' : ''));
    } catch (e) {
      const msg = errMsg(e);
      st.error = '인식 실패: ' + msg + (/한도|quota|429/i.test(msg) ? ' · 키를 바꾸거나 내일 다시 시도하세요' : '');
      toast('음성 인식 실패: ' + msg, 'bad');
    } finally {
      st.busy = false;
      if (prog) setTimeout(() => { prog.classList.remove('on'); if (bar) bar.style.width = '0%'; }, 500);
      renderStt();
    }
  }

  function sttRemoveFile() {
    const st = state.stt;
    if (st.url) { try { URL.revokeObjectURL(st.url); } catch (e) {} }
    ['#sttVideo', '#sttAudio'].forEach(sel => {
      const el = $(sel);
      if (!el) return;
      try { el.pause(); } catch (e) {}
      el.removeAttribute('src');
      el.classList.add('hidden');
    });
    const empty = $('#sttEmpty'); if (empty) empty.classList.remove('hidden');
    state.stt = { file: null, url: '', mime: '', video: false, dur: 0, lang: st.lang, format: st.format, text: '', segments: [], sample: false, busy: false, error: '' };
    renderStt();
    toast('파일을 뺐습니다');
  }

  function sttSample() {
    const st = state.stt;
    st.sample = true; st.error = '';
    st.segments = STT_SAMPLE_SEGS.map((s, i) => ({ i, start: s.start, end: s.end, dur: s.end - s.start, text: s.text }));
    st.text = st.format === 'srt' ? sttFormatSRT(st.segments) : STT_SAMPLE_TEXT;
    renderStt();
    toast('샘플 결과를 채웠습니다 — 실제 음성 인식이 아닙니다');
  }

  function sttPlainText() {
    const st = state.stt;
    if (!st.text) return '';
    return (st.segments && st.segments.length) ? st.segments.map(s => s.text).join('\n') : st.text;
  }
  function sttStamp() { return new Date().toISOString().slice(0, 10); }
  function sttDownloadTxt() {
    const t = sttPlainText();
    if (!t) { toast('저장할 결과가 없습니다', 'bad'); return; }
    downloadText('stt-' + sttStamp() + '.txt', t, 'text/plain;charset=utf-8');
    toast('TXT로 저장했습니다', 'good');
  }
  function sttDownloadSrt() {
    const st = state.stt;
    const segs = (st.segments && st.segments.length) ? st.segments : sttParseSRT(st.text);
    if (!segs.length) { toast('타임스탬프가 없어 SRT를 만들 수 없습니다 · 「SRT 자막」으로 인식하세요', 'bad'); return; }
    downloadText('stt-' + sttStamp() + '.srt', sttFormatSRT(segs), 'application/x-subrip;charset=utf-8');
    toast('SRT로 저장했습니다 · ' + segs.length + '줄', 'good');
  }

  function sttToScript() {
    const st = state.stt;
    if (!st.text) { toast('보낼 인식 결과가 없습니다', 'bad'); return; }
    const sents = (st.segments && st.segments.length)
      ? st.segments.map(s => String(s.text || '').trim()).filter(Boolean)
      : sttSplitSentences(st.text);
    if (!sents.length) { toast('보낼 인식 결과가 없습니다', 'bad'); return; }
    const s = ensureScriptShell();
    s.sentences = sents.map(text => ({ text }));
    s.demo = st.sample; s.source = 'stt';
    state.voice = null;
    state.subTl = null;
    renderScript(); renderTimeline(); buildScenes(); ensurePreview(); updateSubTlUI();
    goView('3');
    toast('3단계 대본을 음성 인식 ' + sents.length + '문장으로 바꿨습니다', 'good');
    logActivity('🎙️', 'STT → 3단계 대본 ' + sents.length + '문장');
  }

  function sttToCaption() {
    const st = state.stt;
    if (!st.text) { toast('보낼 인식 결과가 없습니다', 'bad'); return; }
    const segs = (st.segments && st.segments.length) ? st.segments : [];
    const lines = segs.length ? segs.map(s => s.text) : sttSplitCaptions(st.text, 22);
    if (!lines.length) { toast('보낼 자막이 없습니다', 'bad'); return; }
    const s = ensureScriptShell();
    s.sentences = lines.map(text => ({ text }));
    s.demo = st.sample; s.source = 'stt';
    state.subTl = segs.length ? segs.map((g, i) => ({ i, start: g.start, dur: Math.max(0.4, g.end - g.start), end: g.end })) : null;
    buildScenes(); renderScript(); renderTimeline(); ensurePreview(); updateSubTlUI(); goView('4'); drawPreview();
    toast('4단계 자막 ' + lines.length + '줄' + (segs.length ? ' · 타임스탬프 반영' : ' · 음성 길이에 맞춰'), 'good');
    logActivity('🅰️', 'STT → 4단계 자막 ' + lines.length + '줄' + (segs.length ? ' · 타임스탬프' : ''));
  }

  /* =========================================================
     도구 · 떡상 순위 & 6종 벤치마킹
     ========================================================= */
  const TREND_PF_NAME = { youtube: '유튜브', tiktok: '틱톡', instagram: '인스타그램', other: '기타' };
  const TREND_SAMPLE = [
    ['순위', '채널', '영상 제목', '플랫폼', '구독자', '조회수', '좋아요', '업로드', '순위 변동'],
    ['1', '살림천재TV', '3천원으로 주방 정리 끝내기', '유튜브', '18만', '412만', '8.9만', '2일 전', 'NEW'],
    ['2', '먹방하는 수진', '편의점 신상 6종 한 번에', '틱톡', '4.2만', '186만', '6.1만', '4일 전', '▲7'],
    ['3', '테크맛집', '이어폰 노캔 비교 30초컷', '유튜브', '31만', '95만', '2.4만', '55일 전', '▲2'],
    ['4', '뷰티로그 민', '겨울 보습 크림 3일 사용기', '인스타그램', '9.8만', '78만', '3.3만', '1일 전', 'NEW'],
    ['5', '주부살림왕', '세탁기 곰팡이 10분 정리', '유튜브', '46만', '52만', '1.1만', '400일 전', '▲3'],
    ['6', '캠핑요리사', '캠핑에서 5분 카레', '틱톡', '2.1만', '41만', '1.9만', '1일 전', 'NEW'],
    ['7', '다이어트하는 직장인', '도시락 3일 준비', '인스타그램', '6.5만', '12만', '4,200', '6일 전', '▼4'],
    ['8', '살림하는 남자', '냉장고 정리 역주행', '유튜브', '12만', '390만', '5.2만', '900일 전', '▲1']
  ];
  const TREND_SAMPLE_TEXT = TREND_SAMPLE.map(r => r.join('\t')).join('\n');

  const TREND_COLS = [
    ['rank', /^(순위|랭킹|rank|no\.?|#)$/i],
    ['move', /(변동|급등|순위\s*변|change)/i],
    ['channel', /(채널|channel|크리에이터|계정|creator)/i],
    ['title', /(영상|제목|콘텐츠|title|video)/i],
    ['platform', /(플랫폼|platform|사이트)/i],
    ['subs', /(구독|subscriber|subs)/i],
    ['views', /(조회|views?|재생|play)/i],
    ['likes', /(좋아요|likes?|하트)/i],
    ['comments', /(댓글|comments?)/i],
    ['uploaded', /(업로드|게시|날짜|date|등록)/i],
    ['url', /(링크|url|주소)/i]
  ];

  function trendParseCount(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? Math.max(0, Math.round(v)) : 0;
    const s = String(v).replace(/[,\s]/g, '').replace(/(명|회|개|views?|subs?)/gi, '');
    const m = s.match(/^(-?\d+(?:\.\d+)?)(억|만|천|[KkMm])?$/);
    if (!m) return 0;
    let n = parseFloat(m[1]);
    const u = m[2] || '';
    if (u === '억') n *= 1e8;
    else if (u === '만') n *= 1e4;
    else if (u === '천') n *= 1e3;
    else if (/k/i.test(u)) n *= 1e3;
    else if (/m/i.test(u)) n *= 1e6;
    return Math.max(0, Math.round(n));
  }

  function trendParseMove(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return { type: 'none', delta: 0 };
    if (/^new$/i.test(s) || /신규/.test(s)) return { type: 'new', delta: 0 };
    const up = s.match(/[▲+↑]\s*(\d+)/); if (up) return { type: 'up', delta: +up[1] };
    const dn = s.match(/[▼\-↓]\s*(\d+)/); if (dn) return { type: 'down', delta: +dn[1] };
    if (/^[-–—]$/.test(s)) return { type: 'same', delta: 0 };
    return { type: 'none', delta: 0 };
  }

  function trendParseDate(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v > 1e11 ? v : Date.now() - Math.max(0, v) * 86400000;
    const s = String(v).trim();
    const ago = s.match(/(\d+)\s*(분|시간|일|주|개월|달|년)\s*전/);
    if (ago) {
      const n = +ago[1]; const u = ago[2];
      const days = (u === '분' || u === '시간') ? n / 24 : u === '일' ? n : u === '주' ? n * 7 : (u === '개월' || u === '달') ? n * 30 : n * 365;
      return Date.now() - days * 86400000;
    }
    const m = s.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
    const m2 = s.match(/^(\d{1,2})[.\-\/](\d{1,2})$/);
    if (m2) { const now = new Date(); return new Date(now.getFullYear(), +m2[1] - 1, +m2[2]).getTime(); }
    return null;
  }
  function trendDays(v) {
    if (!v.uploaded) return null;
    return Math.max(0, Math.floor((Date.now() - v.uploaded) / 86400000));
  }
  function trendPlatformKey(name) {
    const s = String(name || '').toLowerCase();
    if (/youtu|유튜브|yt/.test(s)) return 'youtube';
    if (/tiktok|틱톡|douyin|더우인/.test(s)) return 'tiktok';
    if (/insta|인스타|reels/.test(s)) return 'instagram';
    return 'other';
  }

  function trendSplitDelim(line, delim) {
    if (delim !== ',') return line.split(delim).map(s => s.trim());
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === ',' && !q) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim());
  }

  function trendGuessCols(width) {
    if (width >= 7) return { rank: 0, channel: 1, title: 2, subs: 3, views: 4, likes: 5, uploaded: 6 };
    if (width === 6) return { rank: 0, channel: 1, subs: 2, views: 3, likes: 4, uploaded: 5 };
    if (width === 5) return { rank: 0, channel: 1, subs: 2, views: 3, uploaded: 4 };
    if (width === 4) return { rank: 0, channel: 1, subs: 2, views: 3 };
    if (width === 3) return { channel: 0, subs: 1, views: 2 };
    if (width === 2) return { channel: 0, views: 1 };
    return { channel: 0 };
  }

  function trendRowVideo(c, cols) {
    const g = k => (cols[k] != null && c[cols[k]] != null) ? String(c[cols[k]]).trim() : '';
    const channel = g('channel');
    const title = g('title');
    const views = trendParseCount(g('views'));
    const subs = trendParseCount(g('subs'));
    if (!views && !subs) return null;
    return {
      id: '',
      rank: trendParseCount(g('rank')) || null,
      move: trendParseMove(g('move') || (cols.move == null ? '' : '')),
      channel, title,
      platform: trendPlatformKey(g('platform') || channel + ' ' + title),
      subs, views,
      likes: trendParseCount(g('likes')),
      comments: trendParseCount(g('comments')),
      uploaded: trendParseDate(g('uploaded')),
      url: g('url'), desc: '', captions: '', memo: ''
    };
  }

  function trendParseText(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
    if (!lines.length) return [];
    const delim = lines.slice(0, 3).some(l => l.indexOf('\t') >= 0) ? '\t' : (lines[0].split(',').length >= 3 ? ',' : 'multi');
    const split = l => delim === 'multi' ? l.split(/\s{2,}|\t/).map(s => s.trim()) : trendSplitDelim(l, delim);
    let cells = lines.map(split).filter(r => r.length && r.some(c => c !== ''));
    if (!cells.length) return [];
    let cols = null;
    const head = cells[0].join(' ');
    if (/구독|조회|채널|channel|views|subs/i.test(head)) {
      cols = {};
      cells[0].forEach((h, i) => { TREND_COLS.forEach(([k, re]) => { if (cols[k] == null && re.test(h)) cols[k] = i; }); });
      cells = cells.slice(1);
    }
    if (!cols) cols = trendGuessCols(cells[0].length);
    return cells.map(c => trendRowVideo(c, cols)).filter(Boolean);
  }

  function trendFromObject(o) {
    if (!o || typeof o !== 'object') return null;
    const pick = (...keys) => { for (const k of keys) { if (o[k] != null && o[k] !== '') return o[k]; } return ''; };
    const views = trendParseCount(pick('views', 'viewCount', 'view_count', '조회수', 'playCount'));
    const subs = trendParseCount(pick('subs', 'subscribers', 'subscriberCount', 'subscriber_count', '구독자'));
    if (!views && !subs) return null;
    const channel = String(pick('channel', 'channelName', 'creator', '채널', 'author') || '');
    const title = String(pick('title', 'videoTitle', 'name', '영상 제목', '제목') || '');
    return {
      id: '', rank: trendParseCount(pick('rank', '순위')) || null,
      move: trendParseMove(pick('move', 'rankChange', '변동', '순위 변동')),
      channel, title,
      platform: trendPlatformKey(pick('platform', '플랫폼', 'site') || channel + ' ' + title),
      subs, views,
      likes: trendParseCount(pick('likes', 'likeCount', '좋아요')),
      comments: trendParseCount(pick('comments', 'commentCount', '댓글')),
      uploaded: trendParseDate(pick('uploaded', 'uploadDate', 'publishedAt', 'date', '업로드')),
      url: String(pick('url', 'link', '링크') || ''),
      desc: String(pick('desc', 'description', '설명') || ''),
      captions: String(pick('captions', 'subtitle', '자막') || ''),
      memo: String(pick('memo', 'note', '메모') || '')
    };
  }

  function trendFromJSON(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('JSON 해석 실패: ' + String(e.message || '').slice(0, 70)); }
    const arr = Array.isArray(data) ? data : (data.videos || data.items || data.rows || data.data || []);
    if (!Array.isArray(arr)) throw new Error('JSON에서 영상 목록을 찾지 못했습니다 (배열 또는 videos)');
    return arr.map(trendFromObject).filter(Boolean);
  }

  function trendKey(v) {
    return [v.platform || '', v.channel || '', v.title || '', v.views || 0].join('|');
  }
  function trendAddVideos(list, replace) {
    if (replace) state.trend.videos = [];
    const seen = new Set(state.trend.videos.map(trendKey));
    let added = 0;
    (list || []).forEach(v => {
      const k = trendKey(v);
      if (seen.has(k)) return;
      seen.add(k);
      v.id = uid('t');
      state.trend.videos.push(v);
      added++;
    });
    saveTrend();
    renderTrend();
    return added;
  }

  function trendScore(v) {
    const ratio = v.subs > 0 ? v.views / v.subs : 0;
    const ratioPts = clamp(Math.log10(Math.max(ratio, 0.01)) / Math.log10(100) * 40, 0, 40);
    const mv = v.move || { type: 'none', delta: 0 };
    const movePts = mv.type === 'new' ? 25 : mv.type === 'up' ? Math.min(25, 8 + mv.delta * 2) : mv.type === 'down' ? 0 : 8;
    const d = trendDays(v);
    let freshPts = d == null ? 6 : d <= 3 ? 15 : d <= 7 ? 12 : d <= 14 ? 8 : d <= 30 ? 4 : 0;
    const reverse = d != null && d > 30 && ratio >= 5;
    if (reverse) freshPts = 15;
    const eng = v.views > 0 ? ((v.likes || 0) + (v.comments || 0)) / v.views : 0;
    const engPts = clamp(eng / 0.12 * 20, 0, 20);
    const total = Math.round(clamp(ratioPts + movePts + freshPts + engPts, 0, 100));
    const tag = mv.type === 'new' ? 'NEW' : reverse ? '역주행' : (d != null && d <= 7 && ratio >= 2) ? '신작 급등' : mv.type === 'up' ? '▲' + mv.delta : '';
    const tagKind = mv.type === 'new' ? 'new' : reverse ? 'reverse' : (d != null && d <= 7 && ratio >= 2) ? 'fresh' : mv.type === 'up' ? 'up' : 'none';
    return { ratio, ratioPts, movePts, freshPts, engPts, total, reverse, tag, tagKind, days: d, label: total >= 80 ? '폭발' : total >= 60 ? '떡상' : total >= 40 ? '상승' : '관찰' };
  }

  function trendList() {
    const t = state.trend;
    let list = t.videos.map(v => ({ v, s: trendScore(v) }));
    if (t.platform && t.platform !== 'all') list = list.filter(x => x.v.platform === t.platform);
    if (t.filter === 'new') list = list.filter(x => x.v.move && x.v.move.type === 'new');
    if (t.filter === 'rise') list = list.filter(x => x.v.move && x.v.move.type === 'up');
    if (t.filter === 'reverse') list = list.filter(x => x.s.reverse);
    if (t.filter === 'fresh') list = list.filter(x => x.s.days != null && x.s.days <= 7);
    const key = t.sort;
    const cmp = key === 'views' ? (a, b) => b.v.views - a.v.views
      : key === 'ratio' ? (a, b) => b.s.ratio - a.s.ratio
      : key === 'move' ? (a, b) => ((b.v.move.type === 'new' ? 99 : 0) + (b.v.move.delta || 0)) - ((a.v.move.type === 'new' ? 99 : 0) + (a.v.move.delta || 0))
      : key === 'date' ? (a, b) => (b.v.uploaded || 0) - (a.v.uploaded || 0)
      : (a, b) => b.s.total - a.s.total;
    list.sort((a, b) => cmp(a, b) || ((a.v.rank || 999) - (b.v.rank || 999)));
    return list;
  }

  function trendPicked() { return state.trend.videos.find(v => v.id === state.trend.pickId) || null; }
  function trendPick(id) {
    state.trend.pickId = id;
    saveTrend();
    renderTrend();
  }

  function renderTrend() {
    const t = state.trend;
    const list = trendList();
    if ($('#trendCount')) $('#trendCount').textContent = t.videos.length + '개';
    if ($('#trendEmpty')) $('#trendEmpty').classList.toggle('hidden', list.length > 0);
    const body = $('#trendTableBody');
    if (body) {
      body.innerHTML = list.slice(0, 80).map((x, idx) => {
        const v = x.v, s = x.s, mv = v.move || { type: 'none', delta: 0 };
        const mvHtml = mv.type === 'new' ? '<span class="sig new">NEW</span>'
          : mv.type === 'up' ? '<span class="sig up">▲' + mv.delta + '</span>'
          : mv.type === 'down' ? '<span class="sig none">▼' + mv.delta + '</span>'
          : '<span class="sig none">—</span>';
        const sigHtml = s.tag ? '<span class="sig ' + s.tagKind + '">' + esc(s.tag) + '</span>' : '<span class="sig none">—</span>';
        const dateTxt = s.days == null ? '' : (s.days === 0 ? '오늘' : s.days + '일 전');
        return '<tr data-trend="' + v.id + '" class="' + (v.id === t.pickId ? 'on' : '') + '">' +
          '<td class="num">' + (v.rank != null ? v.rank : idx + 1) + '</td>' +
          '<td><span class="t-title">' + esc(v.title || v.channel || '(제목 없음)') + '</span>' +
          '<span class="t-sub">' + esc([v.channel, TREND_PF_NAME[v.platform], dateTxt].filter(Boolean).join(' · ')) + '</span></td>' +
          '<td class="num">' + fmtNum(v.subs) + '</td>' +
          '<td class="num">' + fmtNum(v.views) + '</td>' +
          '<td class="num">' + (s.ratio ? s.ratio.toFixed(1) + 'x' : '—') + '</td>' +
          '<td>' + mvHtml + '</td><td>' + sigHtml + '</td>' +
          '<td><div class="score-cell"><span class="sb"><i style="width:' + s.total + '%"></i></span><b>' + s.total + '</b></div></td></tr>';
      }).join('');
    }
    const st = $('#trendStatus');
    if (st) st.textContent = t.videos.length ? '전체 ' + t.videos.length + '개 · 지금 보기 ' + list.length + '개' : '표를 붙여넣고 「표 정리하기」를 누르면 순위가 계산됩니다.';
    const sortEl = $('#trendSort'); if (sortEl && sortEl.value !== t.sort) sortEl.value = t.sort;
    $$('#segTrendFilter [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === t.filter));
    $$('#trendPlatform [data-pf]').forEach(b => b.classList.toggle('on', b.dataset.pf === t.platform));
    renderTrendPick();
  }

  function renderTrendPick() {
    const v = trendPicked();
    const card = $('#trendPickBody'), empty = $('#trendPickEmpty'), badge = $('#trendPickBadge'), score = $('#tpScore');
    if (badge) badge.textContent = v ? (v.title || v.channel || '선택') : '없음';
    if (empty) empty.classList.toggle('hidden', !!v);
    if (card) card.classList.toggle('hidden', !v);
    if (!v) { if (score) score.innerHTML = ''; return; }
    const s = trendScore(v);
    const setVal = (sel, val) => { const el = $(sel); if (el && document.activeElement !== el) el.value = val || ''; };
    setVal('#tpTitle', v.title);
    setVal('#tpDesc', v.desc);
    setVal('#tpCaptions', v.captions);
    setVal('#tpMemo', v.memo);
    if (score) {
      score.innerHTML =
        '<div class="sb-item"><span>배율</span><b>' + (s.ratio ? s.ratio.toFixed(1) + 'x' : '—') + '</b></div>' +
        '<div class="sb-item"><span>배율 점수</span><b>' + s.ratioPts.toFixed(0) + '</b></div>' +
        '<div class="sb-item"><span>순위 점수</span><b>' + s.movePts.toFixed(0) + '</b></div>' +
        '<div class="sb-item"><span>업로드 점수</span><b>' + s.freshPts.toFixed(0) + '</b></div>' +
        '<div class="sb-item total"><span>떡상 점수 · ' + esc(s.label) + '</span><b>' + s.total + '</b></div>';
    }
  }

  function trendPickField(key, val) {
    const v = trendPicked();
    if (!v) return;
    v[key] = val;
    saveTrend();
    if (key === 'title') renderTrend();
  }

  function trendAddManual() {
    const v = trendFromObject({
      title: $('#tNewTitle').value, channel: $('#tNewChannel').value, platform: $('#tNewPlatform').value,
      subs: $('#tNewSubs').value, views: $('#tNewViews').value, likes: $('#tNewLikes').value,
      uploaded: $('#tNewDate').value, move: $('#tNewMove').value
    });
    if (!v) { toast('조회수나 구독자를 숫자로 넣어 주세요', 'bad'); return; }
    v.platform = $('#tNewPlatform').value;
    const added = trendAddVideos([v], false);
    if (added) {
      state.trend.pickId = state.trend.videos[state.trend.videos.length - 1].id;
      saveTrend(); renderTrend();
      ['#tNewTitle', '#tNewChannel', '#tNewSubs', '#tNewViews', '#tNewLikes', '#tNewDate', '#tNewMove'].forEach(sel => { const el = $(sel); if (el) el.value = ''; });
      toast('영상을 추가했습니다', 'good');
    } else toast('이미 목록에 있는 영상입니다', 'bad');
  }

  function trendParseFromInput() {
    const text = ($('#trendInput').value || '').trim();
    if (!text) { toast('표를 붙여넣거나 샘플 차트를 눌러 주세요', 'bad'); return; }
    let list = [];
    try {
      if (/^[\[{]/.test(text)) list = trendFromJSON(text);
      else list = trendParseText(text);
    } catch (e) { toast(String(e.message || e), 'bad'); return; }
    if (!list.length) { toast('표에서 영상 줄을 찾지 못했습니다 · 열 이름(구독자·조회수)을 확인하세요', 'bad'); return; }
    const prev = trendPicked();
    const added = trendAddVideos(list, false);
    if (!prev && state.trend.videos.length) state.trend.pickId = state.trend.videos[0].id;
    saveTrend(); renderTrend();
    toast(added + '개 영상을 정리했습니다' + (list.length - added ? ' (중복 ' + (list.length - added) + '개 제외)' : ''), 'good');
    logActivity('📊', '떡상 순위 ' + added + '개 정리');
  }

  function trendLoadSample() {
    const prev = trendPicked();
    trendAddVideos(trendParseText(TREND_SAMPLE_TEXT), false);
    if (!prev && state.trend.videos.length) state.trend.pickId = state.trend.videos[0].id;
    saveTrend(); renderTrend();
    toast('샘플 차트 8개를 넣었습니다 — 확인용 예시 데이터입니다');
  }

  /* ---------- 6종 벤치마킹 ---------- */
  function benchNormalize(raw) {
    const r = raw || {};
    const arr = v => Array.isArray(v) ? v : (v ? [v] : []);
    const str = v => String(v == null ? '' : v);
    const obj = v => (v && typeof v === 'object') ? v : {};
    const an = obj(r.analysis), pl = obj(r.plan), cta = obj(r.cta);
    return {
      analysis: {
        summary: str(an.summary), whyHot: str(an.whyHot || an.why || ''), target: str(an.target),
        strengths: arr(an.strengths).map(str).slice(0, 6),
        weaknesses: arr(an.weaknesses).map(str).slice(0, 6),
        keywords: arr(an.keywords).map(str).slice(0, 10)
      },
      plan: {
        concept: str(pl.concept), angle: str(pl.angle), format: str(pl.format), length: str(pl.length),
        points: arr(pl.points).map(str).slice(0, 8)
      },
      hooks: arr(r.hooks).map(str).filter(Boolean).slice(0, 6),
      script: arr(r.script).map(str).filter(Boolean).slice(0, 12),
      scenes: arr(r.scenes).map(x => ({ time: str((x || {}).time), scene: str((x || {}).scene), visual: str((x || {}).visual), caption: str((x || {}).caption), direction: str((x || {}).direction) })).slice(0, 12),
      captions: arr(r.captions).map(str).filter(Boolean).slice(0, 20),
      cta: { text: str(cta.text), comment: str(cta.comment), hashtags: arr(cta.hashtags).map(str).slice(0, 10) }
    };
  }

  async function geminiBench(v) {
    const s = trendScore(v);
    const mv = v.move || { type: 'none', delta: 0 };
    const mvTxt = mv.type === 'new' ? 'NEW' : mv.type === 'up' ? '▲' + mv.delta : mv.type === 'down' ? '▼' + mv.delta : '변동 없음';
    const prompt = [
      '너는 한국 쇼츠·릴스 콘텐츠 전략가다. 아래 경쟁 영상을 분석해 6종 벤치마킹을 JSON 하나로 써라.',
      '영상 제목: ' + (v.title || '(없음)'),
      '채널: ' + (v.channel || '(없음)') + ' / 플랫폼: ' + (TREND_PF_NAME[v.platform] || '기타'),
      '구독자: ' + v.subs + ' / 조회수: ' + v.views + ' / 구독자 대비 배율: ' + s.ratio.toFixed(1) + 'x',
      '업로드: ' + (s.days != null ? s.days + '일 전' : '미상') + ' / 순위 변동: ' + mvTxt + ' / 떡상 점수: ' + s.total + '/100',
      '설명: ' + (v.desc || '(없음)'),
      '공개 자막·대사: ' + (v.captions || '(없음)'),
      '내 메모: ' + (v.memo || '(없음)'),
      '규칙: 주어진 정보와 자막에서 확인되는 것만 근거로 쓴다. 없는 조회수·시청자 반응을 지어내지 마라. 한국어로, 바로 따라 만들 수 있게 구체적으로.',
      'hooks는 6개(각 1초 안에 말할 수 있는 짧은 문장), script는 5~7문장, scenes는 4~6개(초 구간 포함), captions는 5~10줄.',
      'JSON: {"analysis":{"summary":"","whyHot":"","target":"","strengths":[""],"weaknesses":[""],"keywords":[""]},' +
      '"plan":{"concept":"","angle":"","format":"","length":"","points":[""]},' +
      '"hooks":[""],"script":[""],"scenes":[{"time":"0-3초","scene":"","visual":"","caption":"","direction":""}],' +
      '"captions":[""],"cta":{"text":"","comment":"","hashtags":["#쇼츠"]}}'
    ].join('\n');
    const raw = await geminiJSON(prompt, { temp: 0.8, maxTokens: 3000 });
    const out = benchNormalize(raw);
    if (!out.hooks.length && !out.script.length && !out.analysis.summary) throw new Error('벤치마킹 응답이 비어 있습니다');
    out.demo = false;
    return out;
  }

  function demoBench(v) {
    const name = v.title || v.channel || '이 영상';
    const ch = v.channel || '경쟁 채널';
    const s = trendScore(v);
    return {
      demo: true,
      analysis: {
        summary: name + '은(는) ' + ch + '의 ' + (s.days != null ? s.days + '일 전 ' : '') + '영상으로, 구독자 대비 조회수 ' + s.ratio.toFixed(1) + '배 · 떡상 점수 ' + s.total + '점을 기록했습니다.',
        whyHot: '첫 1~2초에 결과 장면을 먼저 보여 주고 설명은 뒤로 미룹니다. 화면 자막이 짧아 소리 없이 봐도 내용이 남습니다.',
        target: '정보를 빠르게 얻고 싶은 20~40대 시청자',
        strengths: ['첫 장면에 결과를 먼저 보여 줌', '자막 한 줄이 15자 안팎으로 짧음', '마지막에 저장·공유를 자연스럽게 유도'],
        weaknesses: ['중반 설명이 길어 이탈 지점이 생김', '제품 실제 사용 장면이 짧음'],
        keywords: [ch, v.title || '쇼츠', '떡상 구조']
      },
      plan: {
        concept: name + ' 구조를 내 제품에 맞게 바꾸기',
        angle: '결과 선공개 → 이유 3가지 → 마무리 CTA',
        format: '9:16 세로 · 자막 중심 · 컷 2초 내외',
        length: '20~25초 (문장 5~6개)',
        points: ['도입 2초 안에 결과 컷', '이유는 숫자·비교로 3개만', '자막은 한 줄 15자 이내', '마지막 3초에 댓글 유도']
      },
      hooks: [
        '이거 진짜 ' + (v.title || '이거') + ' 맞아요?',
        '3천원으로 이게 된다고?',
        '저만 몰랐던 방법이에요',
        '이거 보기 전엔 사지 마세요',
        '1분만 보면 바로 따라 합니다',
        '결과부터 보여 드릴게요'
      ],
      script: [
        '결과부터 보여 드릴게요. 이렇게 됩니다.',
        '방법은 세 가지인데, 첫 번째가 제일 중요해요.',
        '준비물은 집에 있는 것만 쓰면 됩니다.',
        '저는 이걸 모르고 3년을 그냥 지나쳤어요.',
        '순서만 바꿔도 결과가 달라집니다.',
        '자세한 준비물은 고정댓글에 정리해 뒀어요.'
      ],
      scenes: [
        { time: '0-3초', scene: '결과 먼저', visual: '완성된 결과 클로즈업', caption: '이거 3천원이면 됩니다', direction: '결과 화면을 1.2배 확대' },
        { time: '3-9초', scene: '이유 1', visual: '준비물 나열 컷', caption: '준비물은 이 3개뿐', direction: '손으로 하나씩 집어 보여 주기' },
        { time: '9-16초', scene: '이유 2·3', visual: '전후 비교 분할 화면', caption: '순서만 바꿔도 이 차이', direction: '전후 화면을 번갈아 0.5초씩' },
        { time: '16-22초', scene: '마무리 CTA', visual: '완성 화면 + 댓글 안내', caption: '준비물은 고정댓글에', direction: '마지막 2초는 정지 화면' }
      ],
      captions: ['결과부터 보여 드릴게요', '이렇게 됩니다', '방법은 세 가지', '첫 번째가 제일 중요해요', '준비물은 집에 있는 것만', '순서만 바꿔도 결과가 달라져요', '준비물은 고정댓글에 있어요'],
      cta: { text: '준비물 목록은 고정댓글에서 확인하세요. 저장해 두면 주말에 바로 따라 할 수 있어요.', comment: '궁금한 점 댓글로 남겨 주세요. 다음 영상에서 다뤄 드립니다.', hashtags: ['#쇼츠', '#살림템', '#꿀팁'] }
    };
  }

  async function runBenchmark() {
    const v = trendPicked();
    if (!v) { toast('순위표에서 영상을 먼저 고르세요', 'bad'); return; }
    const btn = $('#btnBenchRun'), status = $('#benchStatus');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 만드는 중'; }
    if (status) status.textContent = '6종 벤치마킹을 만드는 중…';
    try {
      let out;
      if (!state.demo && realKeys().length > 0) {
        out = await geminiBench(v);
      } else {
        await new Promise(r => setTimeout(r, 220));
        out = demoBench(v);
      }
      state.trend.bench = out;
      state.trend.benchDemo = !!out.demo;
      state.trend.benchAt = Date.now();
      saveTrend(); renderBench();
      if (status) status.textContent = (out.demo ? '데모' : 'Gemini') + ' 6종 벤치마킹 완료 · ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      toast(out.demo ? '데모 6종 벤치마킹을 만들었습니다' : '6종 벤치마킹 완성', 'good');
      logActivity('🪄', '6종 벤치마킹 · ' + (v.title || v.channel || '영상') + (out.demo ? ' (데모)' : ' (AI)'));
    } catch (e) {
      if (status) status.textContent = '생성 실패: ' + errMsg(e);
      toast('벤치마킹 실패: ' + errMsg(e), 'bad');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '🪄 6종 벤치마킹 생성'; }
    }
  }

  function benchLines(arr) {
    return '<ol class="lines">' + (arr || []).map((x, i) => '<li><i>' + (i + 1) + '</i><span>' + esc(x) + '</span></li>').join('') + '</ol>';
  }
  function benchPara(label, val) {
    return val ? '<div class="line"><strong>' + esc(label) + '</strong> · ' + esc(val) + '</div>' : '';
  }

  function renderBench() {
    const b = state.trend.bench, grid = $('#benchGrid'), empty = $('#benchEmpty'), badge = $('#benchBadge');
    if (!grid) return;
    if (empty) empty.classList.toggle('hidden', !!b);
    if (badge) {
      badge.textContent = b ? (state.trend.benchDemo ? '데모' : 'Gemini') : '없음';
      badge.className = 'badge ' + (b ? (state.trend.benchDemo ? 'demo' : 'live') : '');
    }
    const copyBtn = k => '<button class="btn xs ghost" type="button" data-bench-copy="' + k + '">📋 복사</button>';
    if (!b) { grid.innerHTML = ''; return; }
    const item = (no, title, body, acts, wide) =>
      '<div class="bench-item' + (wide ? ' wide' : '') + '"><div class="bh"><b>' + no + ' ' + esc(title) + '</b><div class="row">' + (acts || '') + '</div></div><div class="bb">' + body + '</div></div>';
    const an = b.analysis || {}, pl = b.plan || {}, cta = b.cta || {};
    const anBody = benchPara('요약', an.summary) + benchPara('왜 떴나', an.whyHot) + benchPara('타깃', an.target) +
      (an.strengths && an.strengths.length ? '<div class="line"><strong>강점</strong></div>' + benchLines(an.strengths) : '') +
      (an.weaknesses && an.weaknesses.length ? '<div class="line"><strong>약점</strong></div>' + benchLines(an.weaknesses) : '') +
      (an.keywords && an.keywords.length ? '<div class="line"><strong>키워드</strong> · ' + esc(an.keywords.join(', ')) + '</div>' : '');
    const plBody = benchPara('콘셉트', pl.concept) + benchPara('앵글', pl.angle) + benchPara('형식', pl.format) + benchPara('길이', pl.length) +
      (pl.points && pl.points.length ? benchLines(pl.points) : '');
    const scBody = (b.scenes || []).map(x => '<div class="line"><strong>' + esc(x.time || '') + '</strong> · ' + esc(x.scene || '') +
      (x.visual ? ' · 화면: ' + esc(x.visual) : '') + (x.caption ? ' · 자막: ' + esc(x.caption) : '') + (x.direction ? ' · 연출: ' + esc(x.direction) : '') + '</div>').join('');
    const ctBody = (b.captions && b.captions.length ? benchLines(b.captions) : '') +
      benchPara('CTA', cta.text) + benchPara('댓글 유도', cta.comment) +
      (cta.hashtags && cta.hashtags.length ? '<div class="line"><strong>해시태그</strong> · ' + esc(cta.hashtags.join(' ')) + '</div>' : '');
    grid.innerHTML =
      item('①', '레퍼런스 분석', anBody || '<span class="hint">내용 없음</span>', copyBtn('analysis'), true) +
      item('②', '콘텐츠 기획', plBody || '<span class="hint">내용 없음</span>', copyBtn('plan'), false) +
      item('③', '후킹 문구', b.hooks.length ? benchLines(b.hooks) : '<span class="hint">내용 없음</span>', copyBtn('hooks') + '<button class="btn xs soft" type="button" data-bench-send="hooks">🎣 3단계 후킹으로</button>', false) +
      item('④', '대본', b.script.length ? benchLines(b.script) : '<span class="hint">내용 없음</span>', copyBtn('script') + '<button class="btn xs soft" type="button" data-bench-send="script">📝 3단계 대본으로</button>', false) +
      item('⑤', '장면별 구성', scBody || '<span class="hint">내용 없음</span>', copyBtn('scenes') + '<button class="btn xs ghost" type="button" data-bench-send="scenes">🎬 4단계 장면 이름으로</button>', true) +
      item('⑥', '자막 및 CTA', ctBody || '<span class="hint">내용 없음</span>', copyBtn('cta') + '<button class="btn xs mint" type="button" data-bench-send="captions">🅰️ 4단계 자막으로</button>', true);
  }

  function benchTextOf(kind) {
    const b = state.trend.bench;
    if (!b) return '';
    if (kind === 'analysis') {
      const an = b.analysis || {};
      return ['① 레퍼런스 분석', '요약: ' + an.summary, '왜 떴나: ' + an.whyHot, '타깃: ' + an.target,
        '강점: ' + (an.strengths || []).join(' / '), '약점: ' + (an.weaknesses || []).join(' / '), '키워드: ' + (an.keywords || []).join(', ')].join('\n');
    }
    if (kind === 'plan') {
      const pl = b.plan || {};
      return ['② 콘텐츠 기획', '콘셉트: ' + pl.concept, '앵글: ' + pl.angle, '형식: ' + pl.format, '길이: ' + pl.length,
        ...(pl.points || []).map((p, i) => (i + 1) + '. ' + p)].join('\n');
    }
    if (kind === 'hooks') return (b.hooks || []).map((h, i) => (i + 1) + '. ' + h).join('\n');
    if (kind === 'script') return (b.script || []).map((s, i) => (i + 1) + '. ' + s).join('\n');
    if (kind === 'scenes') return (b.scenes || []).map((s, i) => (i + 1) + '. ' + [s.time, s.scene, s.visual && ('화면: ' + s.visual), s.caption && ('자막: ' + s.caption), s.direction && ('연출: ' + s.direction)].filter(Boolean).join(' · ')).join('\n');
    if (kind === 'cta') {
      const c = b.cta || {};
      return ['⑥ 자막 및 CTA', ...(b.captions || []).map((x, i) => (i + 1) + '. ' + x), 'CTA: ' + c.text, '댓글: ' + c.comment, '해시태그: ' + (c.hashtags || []).join(' ')].join('\n');
    }
    return '';
  }
  function benchAllText() {
    return ['①', '②', '③', '④', '⑤', '⑥'].map((n, i) => benchTextOf(['analysis', 'plan', 'hooks', 'script', 'scenes', 'cta'][i])).filter(Boolean).join('\n\n');
  }
  function benchMarkdown() {
    const b = state.trend.bench;
    if (!b) return '';
    const v = trendPicked();
    const s = v ? trendScore(v) : null;
    const head = ['# 6종 벤치마킹 — ' + ((v && (v.title || v.channel)) || '선택 영상'), ''];
    if (v) head.push('- 채널: ' + (v.channel || '—') + ' / 플랫폼: ' + (TREND_PF_NAME[v.platform] || '기타'),
      '- 구독자: ' + v.subs + ' / 조회수: ' + v.views + ' / 배율: ' + (s.ratio ? s.ratio.toFixed(1) + 'x' : '—'),
      '- 떡상 점수: ' + s.total + '점 (' + s.label + ')', '');
    const an = b.analysis || {}, pl = b.plan || {}, c = b.cta || {};
    const md = [
      '## ① 레퍼런스 분석', '', '**요약** ' + (an.summary || ''), '', '**왜 떴나** ' + (an.whyHot || ''), '', '**타깃** ' + (an.target || ''), '',
      '**강점**', ...(an.strengths || []).map(x => '- ' + x), '', '**약점**', ...(an.weaknesses || []).map(x => '- ' + x), '',
      '**키워드** ' + (an.keywords || []).join(', '), '',
      '## ② 콘텐츠 기획', '', '- 콘셉트: ' + (pl.concept || ''), '- 앵글: ' + (pl.angle || ''), '- 형식: ' + (pl.format || ''), '- 길이: ' + (pl.length || ''), '',
      ...(pl.points || []).map((p, i) => (i + 1) + '. ' + p), '',
      '## ③ 후킹 문구', '', ...(b.hooks || []).map((h, i) => (i + 1) + '. ' + h), '',
      '## ④ 대본', '', ...(b.script || []).map((t, i) => (i + 1) + '. ' + t), '',
      '## ⑤ 장면별 구성', '', '| 초 | 장면 | 화면 | 자막 | 연출 |', '|---|---|---|---|---|',
      ...(b.scenes || []).map(x => '| ' + [x.time, x.scene, x.visual, x.caption, x.direction].map(y => String(y || '').replace(/\|/g, '/')).join(' | ') + ' |'), '',
      '## ⑥ 자막 및 CTA', '', ...(b.captions || []).map((t, i) => (i + 1) + '. ' + t), '',
      '**CTA** ' + (c.text || ''), '', '**댓글 유도** ' + (c.comment || ''), '', '**해시태그** ' + (c.hashtags || []).join(' ')
    ];
    return head.concat(md).join('\n');
  }

  function benchSend(kind) {
    const b = state.trend.bench;
    if (!b) { toast('먼저 6종 벤치마킹을 만들어 주세요', 'bad'); return; }
    const s = ensureScriptShell();
    if (kind === 'hooks') {
      if (!(b.hooks || []).length) { toast('후킹 문구가 없습니다', 'bad'); return; }
      s.hooks = b.hooks.slice(0, 6);
      if (!s.sentences.length) s.sentences = [{ text: s.hooks[0] }];
      renderScript(); goView('3');
      toast('3단계 후킹 후보 ' + s.hooks.length + '개로 보냈습니다', 'good');
      logActivity('🎣', '벤치마킹 → 3단계 후킹 ' + s.hooks.length + '개');
      return;
    }
    if (kind === 'script') {
      if (!(b.script || []).length) { toast('대본이 없습니다', 'bad'); return; }
      s.sentences = b.script.map(text => ({ text }));
      const t1 = ((b.plan || {}).concept || (b.analysis || {}).summary || '').slice(0, 22);
      s.titles = [t1, s.titles[1] || ''];
      state.voice = null; state.subTl = null;
      renderScript(); renderTimeline(); buildScenes(); ensurePreview(); updateSubTlUI(); goView('3');
      toast('3단계 대본을 벤치마킹 ' + s.sentences.length + '문장으로 바꿨습니다', 'good');
      logActivity('📝', '벤치마킹 → 3단계 대본 ' + s.sentences.length + '문장');
      return;
    }
    if (kind === 'captions') {
      if (!(b.captions || []).length) { toast('자막이 없습니다', 'bad'); return; }
      s.sentences = b.captions.map(text => ({ text }));
      state.subTl = null; state.voice = null;
      buildScenes(); renderScript(); renderTimeline(); ensurePreview(); updateSubTlUI(); goView('4'); drawPreview();
      toast('4단계 자막 ' + s.sentences.length + '줄로 보냈습니다', 'good');
      logActivity('🅰️', '벤치마킹 → 4단계 자막 ' + s.sentences.length + '줄');
      return;
    }
    if (kind === 'scenes') {
      if (!(b.scenes || []).length) { toast('장면 구성이 없습니다', 'bad'); return; }
      if (!s.sentences.length) s.sentences = b.script.length ? b.script.map(text => ({ text })) : b.captions.map(text => ({ text }));
      if (!s.sentences.length) { toast('장면을 붙일 대본이 없습니다 · ④ 대본을 먼저 보내세요', 'bad'); return; }
      buildScenes();
      state.scenes.forEach((sc, i) => {
        const plan = b.scenes[i];
        if (plan) sc.label = [plan.scene, plan.visual].filter(Boolean).join(' · ').slice(0, 40) || sc.label;
      });
      renderScenes(); goView('4'); drawPreview();
      toast('4단계 장면 이름에 벤치마킹 구성을 넣었습니다', 'good');
      logActivity('🎬', '벤치마킹 → 4단계 장면 이름');
    }
  }

  function loadTrend() {
    const saved = lsGet(LS.trend, null);
    if (!saved || typeof saved !== 'object') return;
    if (Array.isArray(saved.videos)) state.trend.videos = saved.videos.filter(v => v && v.id).slice(0, 300);
    ['sort', 'filter', 'platform'].forEach(k => { if (typeof saved[k] === 'string') state.trend[k] = saved[k]; });
    if (typeof saved.pickId === 'string') state.trend.pickId = saved.pickId;
    if (saved.bench && typeof saved.bench === 'object') state.trend.bench = saved.bench;
    state.trend.benchDemo = !!saved.benchDemo;
    state.trend.benchAt = saved.benchAt || 0;
  }
  function saveTrend() {
    const t = state.trend;
    lsSet(LS.trend, { videos: t.videos, sort: t.sort, filter: t.filter, platform: t.platform, pickId: t.pickId, bench: t.bench, benchDemo: t.benchDemo, benchAt: t.benchAt });
  }

  function stepDone(n) {
    switch (n) {
      case 1: return getItems().length > 0;
      case 2: return !!state.product;
      case 3: return !!(state.script && state.script.sentences.length && state.voice);
      case 4: return !!(state.scenes.length && state.voice);
      case 5: return !!(state.titles && state.titles.pick >= 0);
      case 6: return !!(state.hubTexts && state.hubTexts.yt);
      default: return false;
    }
  }
  function refreshRail() {
    $$('#stepRail .step-btn').forEach(b => {
      const raw = b.dataset.step;
      const n = raw == null || raw === '' ? null : +raw;
      b.classList.toggle('done', n != null && n >= 1 && n <= 6 && stepDone(n) && b.dataset.view !== state.view);
    });
    const ss = $('#statusStep');
    if (ss) ss.textContent = state.step >= 0 ? 'STEP ' + state.step : (VIEW_NAME[state.view] || '성과');
  }

  function goView(id, opts) {
    opts = opts || {};
    if (VIEW_ORDER.indexOf(id) < 0) id = 'perf';
    state.view = id;
    state.step = VIEW_NUM[id] != null ? VIEW_NUM[id] : -1;
    $$('.step-panel').forEach(p => p.classList.toggle('show', p.dataset.view === id));
    $$('#stepRail .step-btn').forEach(b => {
      const on = b.dataset.view === id;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    refreshRail();
    if (id === '3') renderHooks();
    if (id === '4') { if (!state.scenes.length) buildScenes(); ensurePreview(); updatePreviewMeta(); updateSubTlUI(); }
    if (id === '5') { renderTitles(); renderThumb(); }
    if (id === '6') { buildHubTexts(); renderHub(); }
    if (id === 'coupang') { renderHistory(); renderCpBadge(); }
    if (id === 'perf') renderPerf();
    if (id === 'famous') renderFamous();
    if (id === 'multi') renderMulti();
    if (id === 'eraser') { renderEraserOptions(); syncEraserInputs(); drawEraserPreview(); }
    if (id === 'stt') renderStt();
    if (id === 'trend') { renderTrend(); renderBench(); }
    if (id === 'settings') { renderKeys(); renderAccounts(); }
    if (!opts.keepScroll) {
      try { window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' }); } catch (e) { window.scrollTo(0, 0); }
    }
    if (window.matchMedia && window.matchMedia('(max-width:1060px)').matches) {
      const b = $('#stepRail .step-btn.active');
      if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    if (['1', '2', '3', '4', '5', '6', 'famous', 'eraser'].indexOf(id) >= 0) ensurePreview();
    drawPreview();
    drawFamousPreview();
  }
  function goStep(n, opts) {
    const num = Number(n);
    const id = num === 0 ? 'settings' : num === 7 ? 'coupang' : String(num);
    goView(id, opts);
  }

  /* ---------------- key slot UI actions ---------------- */
  function addKeySlot() {
    if (state.keys.length >= 5) { toast('키는 최대 5개까지 저장할 수 있습니다', 'bad'); return; }
    state.keys.push(newKeySlot());
    renderKeys();
    const ins = $$('#keyRows [data-key-input]');
    if (ins.length) ins[ins.length - 1].focus();
  }
  function removeKeySlot(i) {
    if (state.keys.length <= 1) { state.keys = [newKeySlot()]; renderKeys(); return; }
    state.keys.splice(i, 1);
    if (!state.keys.length) state.keys = [newKeySlot()];
    renderKeys(); saveKeys();
  }

  /* ---------------- events ---------------- */
  function wire() {
    // rail + mobile
    $('#stepRail').addEventListener('click', e => {
      const b = e.target.closest('.step-btn');
      if (b && b.dataset.view) goView(b.dataset.view);
    });
    $('#mPrev').addEventListener('click', () => goView(VIEW_ORDER[Math.max(0, VIEW_ORDER.indexOf(state.view) - 1)]));
    $('#mNext').addEventListener('click', () => goView(VIEW_ORDER[Math.min(VIEW_ORDER.length - 1, VIEW_ORDER.indexOf(state.view) + 1)]));
    $('#mPreview').addEventListener('click', () => {
      const el = $('#previewPane');
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.style.boxShadow = '0 0 0 2px rgba(255,122,69,.65)';
      setTimeout(() => { el.style.boxShadow = ''; }, 1200);
    });
    $('#btnHeroStart').addEventListener('click', () => goStep(1));
    $('#btnHeroDemo').addEventListener('click', async () => { fillSampleLinks(); await runAnalysis(); });
    // ===== 도구 · 음성→텍스트 (STT) =====
    const sdz = $('#sttDrop'), sfi = $('#sttFileInput');
    if (sdz && sfi) {
      sdz.addEventListener('click', () => sfi.click());
      sdz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sfi.click(); } });
      ['dragenter', 'dragover'].forEach(ev => sdz.addEventListener(ev, e => { e.preventDefault(); sdz.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(ev => sdz.addEventListener(ev, e => { e.preventDefault(); sdz.classList.remove('over'); }));
      sdz.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) sttSetFile(e.dataTransfer.files[0]); });
      sfi.addEventListener('change', () => { if (sfi.files && sfi.files[0]) sttSetFile(sfi.files[0]); sfi.value = ''; });
    }
    $('#sttFileInfo').addEventListener('click', e => { if (e.target.closest('[data-stt-remove]')) sttRemoveFile(); });
    $('#sttLang').addEventListener('change', () => { state.stt.lang = $('#sttLang').value; renderStt(); });
    $('#segSttFormat').addEventListener('click', e => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      state.stt.format = b.dataset.v;
      $$('#segSttFormat [data-v]').forEach(x => x.classList.toggle('on', x === b));
      if (state.stt.sample) state.stt.text = state.stt.format === 'srt' ? sttFormatSRT(state.stt.segments) : STT_SAMPLE_TEXT;
      renderStt();
      toast(state.stt.format === 'srt' ? 'SRT 자막으로 인식합니다 · 타임스탬프가 붙습니다' : '대본 텍스트로 인식합니다');
    });
    $('#btnSttRun').addEventListener('click', sttRun);
    $('#btnSttSample').addEventListener('click', sttSample);
    $('#btnSttCopy').addEventListener('click', () => copyText($('#sttResult').value, '인식 결과'));
    $('#btnSttTxt').addEventListener('click', sttDownloadTxt);
    $('#btnSttSrt').addEventListener('click', sttDownloadSrt);
    $('#btnSttToScript').addEventListener('click', sttToScript);
    $('#btnSttToCaption').addEventListener('click', sttToCaption);
    let sttTimer = null;
    $('#sttResult').addEventListener('input', () => {
      const st = state.stt;
      st.text = $('#sttResult').value;
      st.sample = false;
      clearTimeout(sttTimer);
      sttTimer = setTimeout(() => { st.segments = sttParseSRT(st.text); renderStt(); }, 150);
    });
    $('#btnSubTlOff').addEventListener('click', () => {
      state.subTl = null; updateSubTlUI(); drawPreview();
      toast('STT 타이밍을 해제했습니다 · 음성/대본 길이 기준으로 돌아갑니다');
    });

    // ===== 도구 · 떡상 순위 & 6종 벤치마킹 =====
    $('#btnTrendParse').addEventListener('click', trendParseFromInput);
    $('#btnTrendSample').addEventListener('click', () => { $('#trendInput').value = TREND_SAMPLE_TEXT; trendLoadSample(); });
    $('#btnTrendFile').addEventListener('click', () => $('#trendFileInput').click());
    $('#trendFileInput').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const text = await f.text();
        const list = (/\.json$/i.test(f.name) || /^[\[{]/.test(text.trim())) ? trendFromJSON(text) : trendParseText(text);
        if (!list.length) { toast('파일에서 영상 줄을 찾지 못했습니다', 'bad'); return; }
        const added = trendAddVideos(list, false);
        toast(f.name + ' · ' + added + '개 추가' + (list.length - added ? ' (중복 ' + (list.length - added) + ')' : ''), 'good');
      } catch (err) { toast(String(err.message || err), 'bad'); }
    });
    $('#btnTrendManual').addEventListener('click', () => { const b = $('#trendAddBox'); if (b) b.classList.toggle('hidden'); });
    $('#btnTrendAdd').addEventListener('click', trendAddManual);
    $('#btnTrendClear').addEventListener('click', () => {
      state.trend.videos = []; state.trend.pickId = ''; state.trend.bench = null; state.trend.benchDemo = false;
      saveTrend(); renderTrend(); renderBench();
      toast('목록을 비웠습니다');
    });
    $('#trendTableBody').addEventListener('click', e => { const tr = e.target.closest('[data-trend]'); if (tr) trendPick(tr.dataset.trend); });
    $('#trendPlatform').addEventListener('click', e => { const b = e.target.closest('[data-pf]'); if (!b) return; state.trend.platform = b.dataset.pf; saveTrend(); renderTrend(); });
    $('#segTrendFilter').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; state.trend.filter = b.dataset.v; saveTrend(); renderTrend(); });
    $('#trendSort').addEventListener('change', () => { state.trend.sort = $('#trendSort').value; saveTrend(); renderTrend(); });
    [['#tpTitle', 'title'], ['#tpDesc', 'desc'], ['#tpCaptions', 'captions'], ['#tpMemo', 'memo']].forEach(pair => {
      const el = $(pair[0]);
      if (el) el.addEventListener('input', () => trendPickField(pair[1], el.value));
    });
    $('#btnTpStt').addEventListener('click', () => {
      const v = trendPicked();
      if (!v) { toast('영상을 먼저 고르세요', 'bad'); return; }
      const t = sttPlainText() || state.stt.text;
      if (!t) { toast('먼저 🎙️ 음성→텍스트에서 인식하거나 샘플을 채워 주세요', 'bad'); return; }
      v.captions = t;
      saveTrend(); renderTrend();
      toast('STT 결과를 자막 칸에 넣었습니다' + (state.stt.sample ? ' (샘플)' : ''), 'good');
    });
    $('#btnTrendRemove').addEventListener('click', () => {
      const v = trendPicked(); if (!v) return;
      state.trend.videos = state.trend.videos.filter(x => x.id !== v.id);
      state.trend.pickId = '';
      saveTrend(); renderTrend();
      toast('목록에서 뺐습니다');
    });
    $('#btnBenchRun').addEventListener('click', runBenchmark);
    $('#btnBenchClear').addEventListener('click', () => { state.trend.bench = null; state.trend.benchDemo = false; saveTrend(); renderBench(); toast('벤치마킹 결과를 지웠습니다'); });
    $('#btnBenchCopyAll').addEventListener('click', () => { const t = benchAllText(); if (!t) { toast('복사할 결과가 없습니다', 'bad'); return; } copyText(t, '6종 벤치마킹'); });
    $('#btnBenchJson').addEventListener('click', () => {
      const b = state.trend.bench;
      if (!b) { toast('저장할 결과가 없습니다', 'bad'); return; }
      const v = trendPicked();
      const payload = { generatedAt: new Date().toISOString(), demo: !!state.trend.benchDemo,
        video: v ? { title: v.title, channel: v.channel, platform: v.platform, subs: v.subs, views: v.views, score: trendScore(v) } : null, bench: b };
      downloadText('bench-' + sttStamp() + '.json', JSON.stringify(payload, null, 2), 'application/json');
      toast('JSON으로 저장했습니다', 'good');
    });
    $('#btnBenchMd').addEventListener('click', () => {
      const md = benchMarkdown();
      if (!md) { toast('저장할 결과가 없습니다', 'bad'); return; }
      downloadText('bench-' + sttStamp() + '.md', md, 'text/markdown;charset=utf-8');
      toast('MD로 저장했습니다', 'good');
    });
    $('#benchGrid').addEventListener('click', e => {
      const c = e.target.closest('[data-bench-copy]');
      if (c) { const t = benchTextOf(c.dataset.benchCopy); if (t) copyText(t, '벤치마킹'); return; }
      const s = e.target.closest('[data-bench-send]');
      if (s) benchSend(s.dataset.benchSend);
    });

    $('#btnSettings').addEventListener('click', openSettings);
    $('#btnOpenSettings').addEventListener('click', openSettings);
    $('#btnCloseSettings').addEventListener('click', closeSettings);
    $('#btnCancelSettings').addEventListener('click', closeSettings);
    $('#settingsModal').addEventListener('click', e => { if (e.target === $('#settingsModal')) closeSettings(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$('#settingsModal').hidden) closeSettings();
    });
    $('#btnSaveKeys').addEventListener('click', saveKeysFromModal);
    $('#btnAddKey').addEventListener('click', addKeySlot);
    $('#btnResetKeys').addEventListener('click', () => {
      let n = 0;
      state.keys.forEach(k => { if (k.status === 'exhausted') { k.status = k.value ? 'waiting' : 'empty'; k.note = ''; n++; } });
      saveKeys(); renderKeys();
      toast(n ? n + '개 키의 한도 상태를 초기화했습니다' : '초기화할 한도초과 키가 없습니다', n ? 'good' : '');
    });
    $('#btnTestKeys').addEventListener('click', e => testKeys(e.currentTarget));
    $('#btnTestKeys2').addEventListener('click', e => testKeys(e.currentTarget));
    $('#keyRows').addEventListener('click', e => {
      const del = e.target.closest('[data-key-del]');
      if (del) { removeKeySlot(+del.dataset.keyDel); return; }
      const rv = e.target.closest('[data-key-reveal]');
      if (rv) {
        const inp = $('#keyRows [data-key-input="' + rv.dataset.keyReveal + '"]');
        if (inp) { inp.type = inp.type === 'password' ? 'text' : 'password'; }
      }
    });
    $$('.js-demo-toggle').forEach(el => el.addEventListener('change', () => {
      state.demo = el.checked;
      saveKeys(); updateModeUI(); updateAnalyzeHint();
      toast(state.demo ? '데모 모드로 전환했습니다' : (realKeys().length ? 'Gemini 모드로 전환했습니다' : '키가 없어 데모로 동작합니다'), state.demo ? '' : (realKeys().length ? 'good' : 'bad'));
    }));

    // step 1
    const linkInput = $('#linkInput');
    let linkTimer = null;
    linkInput.addEventListener('input', () => { clearTimeout(linkTimer); linkTimer = setTimeout(syncLinks, 60); });
    linkInput.addEventListener('blur', syncLinks);
    $('#btnClearLinks').addEventListener('click', () => { linkInput.value = ''; syncLinks(); toast('링크를 지웠습니다'); });
    $('#btnSampleLinks').addEventListener('click', fillSampleLinks);
    const dz = $('#dropZone'), fi = $('#fileInput');
    dz.addEventListener('click', () => fi.click());
    dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
    fi.addEventListener('change', async () => { await addFiles(fi.files); fi.value = ''; });
    $('#linkList').addEventListener('click', e => {
      const m = e.target.closest('[data-main]'); if (m) { setMain(m.dataset.main); return; }
      const u = e.target.closest('[data-unlink]'); if (u) removeLink(u.dataset.unlink);
    });
    $('#fileList').addEventListener('click', e => {
      const m = e.target.closest('[data-main]'); if (m) { setMain(m.dataset.main); return; }
      const u = e.target.closest('[data-unfile]'); if (u) removeFile(u.dataset.unfile);
    });
    $('#platformPick').addEventListener('click', e => {
      const c = e.target.closest('[data-pf]'); if (!c) return;
      c.classList.toggle('on');
      state.platforms = $$('#platformPick [data-pf]').filter(x => x.classList.contains('on')).map(x => x.dataset.pf);
    });
    $('#btnAnalyze').addEventListener('click', runAnalysis);

    // step 2
    $('#refGrid').addEventListener('click', e => { const c = e.target.closest('[data-cart]'); if (c) toggleCart(c.dataset.cart); });
    $('#cartList').addEventListener('click', e => { const c = e.target.closest('[data-cart]'); if (c) toggleCart(c.dataset.cart); });
    $('#btnRefreshRefs').addEventListener('click', runAnalysis);
    $('#btnGoStep1').addEventListener('click', () => goStep(1));
    $('#btnNextScript').addEventListener('click', () => goStep(3));

    // step 3
    [['#segLang', 'lang'], ['#segTone', 'tone'], ['#segLen', 'length']].forEach(([sel, key]) => {
      $(sel).addEventListener('click', e => {
        const b = e.target.closest('button[data-v]'); if (!b) return;
        $$(sel + ' button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        state.scriptOpts[key] = b.dataset.v;
      });
    });
    $('#btnWriteScript').addEventListener('click', writeScript);
    renderTypeChips();
    const typeBox = $('#typeChips');
    if (typeBox) typeBox.addEventListener('click', e => {
      const b = e.target.closest('.type-chip'); if (!b) return;
      state.scriptOpts.type = b.dataset.type || 'base';
      renderTypeChips();
      const meta = typeMeta(state.scriptOpts.type);
      const st = $('#scriptStatus');
      if (st && !state.script) st.textContent = '유형: ' + meta.label + ' — 「AI 대본 쓰기」를 눌러 주세요.';
    });
    const cChk = $('#commentLineChk');
    if (cChk) cChk.addEventListener('change', () => { state.scriptOpts.comment = !!cChk.checked; });
    [['#btnHooks5', runHooks5], ['#btnComment', runComment], ['#btnMaterials', runMaterials], ['#btnRevise', runRevise]]
      .forEach(([sel, fn]) => { const b = $(sel); if (b) b.addEventListener('click', fn); });
    const rBox = $('#recipeBox');
    if (rBox) rBox.addEventListener('click', e => {
      const h5 = e.target.closest('[data-hook5]');
      if (h5 && state.hooks5) {
        const h = state.hooks5.hooks[+h5.dataset.hook5]; if (!h) return;
        if (!state.script) { toast('먼저 대본을 만들어 주세요', 'bad'); return; }
        state.script.hooks = state.script.hooks || [];
        if (!state.script.hooks.includes(h.text)) state.script.hooks.unshift(h.text);
        if (!state.script.sentences.length) state.script.sentences.push({ text: h.text });
        else state.script.sentences[0] = { text: h.text };
        state.voice = null;
        renderScript(); renderTimeline(); buildScenes(); ensurePreview();
        toast('첫 문장을 바꿨습니다: ' + h.text, 'good');
        return;
      }
      const cl = e.target.closest('[data-close]');
      if (cl && state.commentCands) {
        const q = state.commentCands.questions[+cl.dataset.close]; if (!q) return;
        appendSentence(q.text);
      }
    });
    ['#title1', '#title2', '#highlightInput'].forEach(sel => $(sel).addEventListener('input', syncScriptFromInputs));
    $('#sentList').addEventListener('input', e => {
      const ta = e.target.closest('[data-sent-text]'); if (!ta) return;
      const i = +ta.dataset.sentText;
      if (state.script && state.script.sentences[i]) state.script.sentences[i].text = ta.value;
      const c = $('[data-chars="' + i + '"]'); if (c) c.textContent = ta.value.length + '자';
      if (state.voice) {
        state.voice = null;
        renderTimeline(); updatePreviewMeta();
        const vs = $('#voiceStatus'); if (vs) vs.textContent = '문장이 바뀌었습니다 · 음성을 다시 만들어 주세요.';
      }
      drawPreview();
    });
    $('#sentList').addEventListener('click', e => {
      const up = e.target.closest('[data-sent-up]'); if (up) return moveSentence(+up.dataset.sentUp, -1);
      const dn = e.target.closest('[data-sent-down]'); if (dn) return moveSentence(+dn.dataset.sentDown, 1);
      const del = e.target.closest('[data-sent-del]'); if (del) return removeSentence(+del.dataset.sentDel);
    });
    $('#btnAddSentence').addEventListener('click', addSentence);
    $('#speedRange').addEventListener('input', () => { $('#speedVal').textContent = Number($('#speedRange').value).toFixed(2) + 'x'; });
    $('#voiceSel').addEventListener('change', () => { renderVoiceNames(); drawPreview(); });
    $('#gapSel').addEventListener('change', applyGap);
    $('#hookChips').addEventListener('click', e => { const b = e.target.closest('[data-hook]'); if (b) applyHook(+b.dataset.hook); });
    $('#btnMakeVoice').addEventListener('click', buildVoice);
    $('#btnPlayVoice').addEventListener('click', togglePreview);
    $('#btnNextEdit').addEventListener('click', () => goStep(4));

    // step 4 style
    const styleIds = ['#blurOn', '#blurMode', '#blurY', '#blurH', '#blurStrength', '#titleOn', '#highlightOn', '#capSize', '#capY', '#capFont', '#capColor', '#capStroke', '#bgmSel', '#bgmVol'];
    styleIds.forEach(sel => {
      const el = $(sel); if (!el) return;
      el.addEventListener('input', styleFromInputs);
      el.addEventListener('change', styleFromInputs);
    });
    $('#segAd').addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b) setAdSeg(b.dataset.v); });
    $('#capMotionChips').addEventListener('click', e => { const b = e.target.closest('[data-motion]'); if (b) setCapMotion(b.dataset.motion); });
    $('#smartPlace').addEventListener('change', () => setSmartPlace($('#smartPlace').checked));
    $('#btnSavePreset').addEventListener('click', () => savePreset(false));
    $('#btnResetStyle').addEventListener('click', resetStyle);
    $('#presetRemember').addEventListener('change', () => {
      if ($('#presetRemember').checked) { savePreset(true); $('#presetStatus').textContent = '자동 저장 켜짐 · 변경할 때마다 저장'; toast('‘다음 영상에도 이 설정으로’를 켰습니다', 'good'); }
      else { $('#presetStatus').textContent = '자동 저장 꺼짐'; }
    });
    $('#sceneList').addEventListener('click', e => {
      const j = e.target.closest('[data-scene-jump]'); if (j) return jumpScene(+j.dataset.sceneJump);
      const m = e.target.closest('[data-scene-mute]'); if (m) return muteScene(+m.dataset.sceneMute);
      const s = e.target.closest('[data-scene-swap]'); if (s) return swapScene(+s.dataset.sceneSwap);
    });
    $('#btnAutoScenes').addEventListener('click', () => { buildScenes(); toast('장면을 다시 매칭했습니다', 'good'); });

    // preview
    $('#btnPlay').addEventListener('click', togglePreview);
    $('#seek').addEventListener('input', () => {
      const val = Number($('#seek').value);   // stopPlayback이 값을 덮어쓰기 전에 읽는다
      stopPlayback();
      const total = totalDuration();
      PV.t = total * (val / 1000);
      drawPreview();
    });
    $('#btnExport').addEventListener('click', () => exportWebM());
    $('#btnExportMini').addEventListener('click', () => exportWebM());

    // step 5
    $('#btnSuggestTitles').addEventListener('click', suggestTitles);
    $('#titleList').addEventListener('click', e => { const o = e.target.closest('[data-title-opt]'); if (o) pickTitle(+o.dataset.titleOpt); });
    $('#titleList').addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const o = e.target.closest('[data-title-opt]'); if (o) { e.preventDefault(); pickTitle(+o.dataset.titleOpt); }
    });
    $('#descInput').addEventListener('input', () => {
      if (!state.titles) return;
      state.titles.desc = $('#descInput').value;
      state.titles.descManual = true;
      $('#descCount').textContent = state.titles.desc.length + '자';
      buildHubTexts(); renderHub();
    });
    $('#thumbText').addEventListener('input', () => { if (state.titles) { state.titles.thumbText = $('#thumbText').value; state.titles.thumbTextManual = true; renderThumb(); } });
    $('#btnDownloadThumb').addEventListener('click', downloadThumb);
    $('#btnCopyDesc').addEventListener('click', () => copyText($('#descInput').value, '설명 복사'));
    $('#btnCopyTags').addEventListener('click', () => copyText(((state.titles && state.titles.hashtags) || []).map(h => '#' + h).join(' '), '해시태그 복사'));
    $('#btnGoHub').addEventListener('click', () => goStep(6));

    // step 6
    $('#hubGrid').addEventListener('click', e => {
      const c = e.target.closest('[data-copy]');
      if (c) { const ta = $('#cap-' + c.dataset.copy); copyText(ta ? ta.value : '', '문구 복사'); }
    });
    $('#hubGrid').addEventListener('input', e => {
      const ta = e.target.closest('textarea[id^="cap-"]'); if (!ta) return;
      const pf = ta.id.slice(4);
      const cnt = $('#cnt-' + pf);
      if (cnt) { cnt.textContent = ta.value.length + ' / ' + HUB_LIMITS[pf].toLocaleString(); cnt.classList.toggle('over', ta.value.length > HUB_LIMITS[pf]); }
      if (state.hubTexts) state.hubTexts[pf] = ta.value;
    });
    $('#btnCopyAll').addEventListener('click', () => {
      const t = state.hubTexts || {};
      const all = ['[YouTube Shorts]', t.yt, '', '[TikTok]', t.tt, '', '[Instagram Reels]', t.ig, '', '[Threads]', t.th, '', '[Facebook Reels]', t.fb].filter(x => x != null).join('\n');
      copyText(all, '전체 문구 복사');
    });
    $('#confirmPublish').addEventListener('change', () => {
      state.hub.confirm = $('#confirmPublish').checked;
      renderHub();
      toast(state.hub.confirm ? '마지막 게시 버튼은 직접 누르도록 설정했습니다' : '게시 전 확인이 필요합니다', state.hub.confirm ? 'good' : '');
    });
    $('#btnGoCoupang').addEventListener('click', () => goStep(7));

    // step 7
    $('#btnSaveCp').addEventListener('click', () => saveCoupang(false));
    $('#btnCpClear').addEventListener('click', () => {
      state.coupang.access = ''; state.coupang.secret = '';
      $('#cpAccess').value = ''; $('#cpSecret').value = '';
      lsSet(LS.coupang, state.coupang); renderCpBadge();
      toast('쿠팡 키를 새로 지웠습니다', 'good');
    });
    ['#cpAuto', '#cpDisclosure', '#cpBase'].forEach(sel => $(sel).addEventListener('change', () => saveCoupang(true)));
    $('#btnAddHist').addEventListener('click', addHistoryManual);
    $('#btnAddFromProduct').addEventListener('click', () => addHistoryFromProduct(false));
    $('#btnSyncHub').addEventListener('click', () => { buildHubTexts(); renderHub(); toast('업로드 문구에 링크를 반영했습니다', 'good'); });
    $('#histBody').addEventListener('click', e => {
      const c = e.target.closest('[data-hist-copy]');
      if (c) { const h = state.history.find(x => x.id === c.dataset.histCopy); copyText(h ? h.link : '', '링크 복사'); return; }
      const d = e.target.closest('[data-hist-del]'); if (d) deleteHistory(d.dataset.histDel);
    });
    $('#btnCopyDisclosure').addEventListener('click', () => copyText(disclosureText(), '대가성 문구 복사'));

    // ---- 설정 · 로그인 계정 ----
    $('#acctList').addEventListener('change', e => {
      const i = e.target.closest('[data-acct]');
      if (!i) return;
      state.accounts[i.dataset.acct] = i.checked;
      saveAccounts(); renderAccounts(); renderPerf();
      toast(i.checked ? '로그인해 둔 계정으로 표시했습니다' : '표시를 해제했습니다');
    });
    const mainEl = document.querySelector('.main');
    if (mainEl) mainEl.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) goView(g.dataset.go); });

    // ---- 내 성과 (목표 배지 갱신) ----
    ['#perfStats', '#perfActivity'].forEach(sel => { const el = $(sel); if (el) el.addEventListener('click', () => {}); });

    // ---- 도구 · 유명 쇼츠 ----
    const famCommit = () => { saveFamous(true); renderFamous(); renderPerf(); };
    $('#famousLayout').addEventListener('change', () => {
      state.famous.layout = $('#famousLayout').value;
      logActivity('🔥', '유명 쇼츠 화면 구성: ' + (state.famous.layout === 'banded' ? '위아래 검은 화면' : '꽉 찬 화면'));
      famCommit();
    });
    $('#famousTitle').addEventListener('input', () => { state.famous.title = $('#famousTitle').value; saveFamous(true); drawFamousPreview(); });
    $('#famousCaption').addEventListener('input', () => { state.famous.caption = $('#famousCaption').value; saveFamous(true); drawFamousPreview(); });
    $('#famousNoThumb').addEventListener('change', () => { state.famous.noThumb = $('#famousNoThumb').checked; famCommit(); });
    $('#famousAiMark').addEventListener('change', () => {
      state.famous.aiMark = $('#famousAiMark').checked;
      buildHubTexts(); renderHub(); famCommit();
    });
    $('#famousTopN').addEventListener('change', () => { state.famous.topN = $('#famousTopN').checked; famCommit(); });
    $('#famousTopCount').addEventListener('input', () => {
      state.famous.topCount = clamp(Math.round(Number($('#famousTopCount').value) || 5), 2, 30);
      saveFamous(true); renderFamous();
    });
    $('#famousPos').addEventListener('change', () => { state.famous.topPos = $('#famousPos').value; famCommit(); });
    $('#famousTz').addEventListener('change', () => { state.famous.tz = $('#famousTz').value; famCommit(); });
    $('#famousMinus').addEventListener('click', () => { state.famous.perDay = clamp(state.famous.perDay - 1, 1, 50); famCommit(); });
    $('#famousPlus').addEventListener('click', () => { state.famous.perDay = clamp(state.famous.perDay + 1, 1, 50); famCommit(); });
    $('#famousRandom').addEventListener('change', () => { state.famous.random = $('#famousRandom').checked; famCommit(); });
    $('#famousSources').addEventListener('click', e => {
      const c = e.target.closest('[data-src]'); if (!c) return;
      const s = c.dataset.src;
      const arr = state.famous.sources.slice();
      const i = arr.indexOf(s);
      if (i >= 0) {
        if (arr.length <= 1) { toast('영상 찾을 곳은 최소 1곳이어야 합니다', 'bad'); return; }
        arr.splice(i, 1);
      } else arr.push(s);
      state.famous.sources = arr;
      if (state.famous.pick) {
        const ref = state.refs.find(r => r.id === state.famous.pick);
        if (!ref || !arr.includes(ref.platform)) state.famous.pick = null;
      }
      famCommit();
    });
    $('#famousCandidates').addEventListener('click', e => {
      const b = e.target.closest('[data-cand-pick]'); if (!b) return;
      state.famous.pick = state.famous.pick === b.dataset.candPick ? null : b.dataset.candPick;
      famCommit();
      toast(state.famous.pick ? '소재로 골랐습니다 · 미리보기에 반영' : '소재 선택을 해제했습니다', 'good');
    });
    $('#famousAddAcct').addEventListener('click', () => {
      const f = state.famous;
      if (f.accounts.length >= 8) { toast('계정은 8개까지 넣을 수 있습니다', 'bad'); return; }
      f.accounts.push({ id: 'fa' + Date.now().toString(36).slice(-4), name: '계정 ' + (f.accounts.length + 1), time: '12:00' });
      famCommit();
    });
    $('#famousAccounts').addEventListener('input', e => {
      const n = e.target.closest('[data-fa-name]'), t = e.target.closest('[data-fa-time]');
      if (n) { state.famous.accounts[+n.dataset.faName].name = n.value; }
      if (t) { state.famous.accounts[+t.dataset.faTime].time = t.value || '12:00'; }
      renderFamousSched(); saveFamous(true);
    });
    $('#famousAccounts').addEventListener('click', e => {
      const d = e.target.closest('[data-fa-del]'); if (!d) return;
      state.famous.accounts.splice(+d.dataset.faDel, 1);
      if (!state.famous.accounts.length) state.famous.accounts.push({ id: 'fa' + Date.now().toString(36).slice(-4), name: '계정 1', time: '12:00' });
      famCommit();
    });
    $('#famousExportJson').addEventListener('click', () => {
      const text = famousConfigText();
      downloadText('sovending-famous-schedule-' + new Date().toISOString().slice(0, 10) + '.json', text, 'application/json;charset=utf-8');
      const st = $('#famousJsonStatus');
      if (st) { st.dataset.keep = '1'; st.textContent = 'JSON 내려받음 · ' + state.famous.accounts.length + '개 계정 · ' + state.famous.tz; }
      logActivity('🗓️', '유명 쇼츠 설정 JSON 내보내기 · ' + state.famous.accounts.length + '개 계정 · ' + state.famous.tz);
      toast('설정 JSON을 내려받았습니다', 'good');
    });
    $('#famousCopyJson').addEventListener('click', () => copyText(famousConfigText(), '설정 JSON 복사'));
    $('#famousPlay').addEventListener('click', toggleFamousPlay);
    $('#famousSeek').addEventListener('input', () => {
      const v = Number($('#famousSeek').value);
      stopFamousPlay();
      FAMOUS.t = famousDur() * (v / 1000);
      drawFamousPreview();
    });
    $('#famousExportWebM').addEventListener('click', () => exportFamousWebM());

    // ---- 도구 · 멀티 다운로더 ----
    let multiTimer = null;
    $('#multiInput').addEventListener('input', () => {
      clearTimeout(multiTimer);
      multiTimer = setTimeout(() => setMulti($('#multiInput').value, true), 220);
    });
    $('#multiInput').addEventListener('blur', () => setMulti($('#multiInput').value, true));
    $('#multiClean').addEventListener('click', () => {
      const ta = $('#multiInput');
      setMulti(ta.value, false);
      ta.value = state.multi.links.join('\n');
    });
    $('#multiClear').addEventListener('click', () => { $('#multiInput').value = ''; setMulti('', true); });
    $('#multiFromStep1').addEventListener('click', () => {
      const t = state.links.map(l => l.url).join('\n');
      $('#multiInput').value = t;
      setMulti(t, true);
      toast(t ? '1단계 링크 ' + state.links.length + '개를 가져왔습니다' : '1단계에 링크가 없습니다', t ? 'good' : 'bad');
    });
    $('#multiList').addEventListener('click', e => {
      const d = e.target.closest('[data-multi-del]'); if (!d) return;
      state.multi.links.splice(+d.dataset.multiDel, 1);
      $('#multiInput').value = state.multi.links.join('\n');
      setMulti($('#multiInput').value, true);
    });
    $('#multiCopyCmd').addEventListener('click', () => copyText(multiCommand(), '명령 복사'));
    $('#multiCopyUrls').addEventListener('click', () => copyText(state.multi.links.join('\n'), 'URL 목록 복사'));
    $('#multiDownloadTxt').addEventListener('click', () => {
      if (!state.multi.links.length) { toast('링크를 먼저 넣어 주세요', 'bad'); return; }
      downloadText('links.txt', state.multi.links.join('\n'));
      toast('links.txt를 내려받았습니다', 'good');
    });

    // ---- 도구 · 자막 지우개 ----
    $('#eraserFile').addEventListener('change', () => {
      state.eraser.fileId = $('#eraserFile').value;
      state.eraser.t = 0;
      syncEraserInputs(); drawEraserPreview(true);
    });
    [['#eraserX', 'x'], ['#eraserY', 'y'], ['#eraserW', 'w'], ['#eraserH', 'h']].forEach(([sel, key]) => {
      $(sel).addEventListener('input', () => { state.eraser[key] = Number($(sel).value); syncEraserInputs(); drawEraserPreview(); });
    });
    $('#eraserStrength').addEventListener('input', () => { state.eraser.strength = Number($('#eraserStrength').value); syncEraserInputs(); drawEraserPreview(); });
    $('#eraserMode').addEventListener('change', () => { state.eraser.mode = $('#eraserMode').value; syncEraserInputs(); drawEraserPreview(); });
    $('#eraserTime').addEventListener('input', () => { state.eraser.t = Number($('#eraserTime').value); syncEraserInputs(); drawEraserPreview(true); });
    $('#eraserReset').addEventListener('click', () => {
      state.eraser.x = 18; state.eraser.y = 58; state.eraser.w = 64; state.eraser.h = 18;
      syncEraserInputs(); drawEraserPreview();
    });
    $('#eraserUploadBtn').addEventListener('click', () => $('#eraserFileInput').click());
    $('#eraserFileInput').addEventListener('change', async e => {
      await addFiles(e.target.files);
      e.target.value = '';
      const last = state.files[state.files.length - 1];
      if (last) state.eraser.fileId = last.id;
      renderEraserOptions(); syncEraserInputs(); drawEraserPreview(true);
    });
    $('#eraserExport').addEventListener('click', () => exportEraserWebM());
    (function eraserDrag() {
      const cv = $('#eraserCanvas'); if (!cv) return;
      let drag = null;
      const norm = ev => {
        const r = cv.getBoundingClientRect();
        return { x: clamp((ev.clientX - r.left) / r.width * 100, 0, 100), y: clamp((ev.clientY - r.top) / r.height * 100, 0, 100) };
      };
      cv.addEventListener('pointerdown', ev => { drag = norm(ev); try { cv.setPointerCapture(ev.pointerId); } catch (e) {} });
      cv.addEventListener('pointermove', ev => {
        if (!drag) return;
        const p = norm(ev);
        state.eraser.x = Math.round(Math.min(drag.x, p.x));
        state.eraser.y = Math.round(Math.min(drag.y, p.y));
        state.eraser.w = Math.max(10, Math.round(Math.abs(p.x - drag.x)));
        state.eraser.h = Math.max(5, Math.round(Math.abs(p.y - drag.y)));
        syncEraserInputs(); drawEraserPreview();
      });
      cv.addEventListener('pointerup', () => {
        if (!drag) return;
        drag = null;
        const st = $('#eraserHint');
        if (st) st.textContent = '영역을 잡았습니다 · ' + state.eraser.x + '%,' + state.eraser.y + '% · ' + state.eraser.w + '×' + state.eraser.h + '%';
      });
    })();
  }

  /* ---------------- init ---------------- */
  function init() {
    state.scriptOpts = { lang: 'ko', tone: 'friendly', length: 'normal', type: 'base', comment: false };
    loadKeys(); loadPreset(); loadCoupang(); loadAccounts(); loadFamous(); loadMulti(); loadTrend();
    renderKeys(); updateModeUI(); updateAnalyzeHint(); renderAccounts();
    renderLinks(); renderFiles(); renderProduct(); renderRefs(); renderCart();
    renderScript(); renderVoiceNames(); renderTimeline(); renderScenes(); renderTitles(); renderThumb();
    buildHubTexts(); renderHub(); renderHistory(); renderCpBadge(); updatePreviewMeta(); updateStyleLabels();
    const gapSel = $('#gapSel');
    if (gapSel) gapSel.value = String(state.voiceGap);
    const gapLab = $('#gapVal'); if (gapLab) gapLab.textContent = gapLabel(state.voiceGap);
    renderPerf(); renderMulti(); renderEraserOptions(); syncEraserInputs();
    renderStt(); updateSubTlUI(); renderTrend(); renderBench();
    wire();
    goView('perf', { keepScroll: true });
    drawPreview();
    drawFamousPreview();
    const vm = $('#voiceModeBadge'); if (vm) { vm.className = 'badge'; vm.textContent = state.demo ? '데모' : '대기'; }
    const pm = $('#previewBadge'); if (pm) pm.textContent = '9:16';
    const em = $('#exportBadge'); if (em) em.textContent = pickMime().includes('vp9') ? '9:16 · WebM/VP9' : '9:16 · WebM';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* 테스트·고급 사용용 공개 훅(읽기/자동화). UI와 같은 코드 경로를 쓴다. */
  window.SV = {
    version: '2.0.0', state, PV, FAMOUS, AD_SAFE, adBox,
    goStep, goView, VIEW_ORDER, syncLinks, runAnalysis, writeScript, buildVoice, exportWebM, drawFrame, drawPreview,
    totalDuration, previewTimeline, suggestTitles, pickTitle, makeThumbBlob, downloadThumb,
    SCRIPT_TYPES, TOP_TIER_TYPES, typeMeta, isTopType, renderTypeChips, demoScriptByType, demoHooks5,
    demoComment, demoMaterials, demoRevise, hookRule, runHooks5, runComment, runMaterials, runRevise,
    buildHubTexts, renderHub, savePreset, loadPreset, renderKeys, renderHistory, saveCoupang, updateModeUI,
    addFiles, addHistoryFromProduct, togglePreview, stopPlayback, synthSpeechBuffer, bgmBuffer,
    disclosureText, autoLink, coupangLink, fillSampleLinks, isDemo: () => state.demo || !realKeys().length,
    // 새 화면·도구
    renderHooks, applyHook, renderVoiceNames, applyGap, gapLabel,
    renderPerf, logActivity, renderAccounts, loginCount,
    renderFamous, drawFamousFrame, drawFamousPreview, famousDur, famousConfig, famousConfigText, famousSlot,
    famousCandidates, exportFamousWebM, toggleFamousPlay, stopFamousPlay, recordClip,
    renderMulti, setMulti, multiCommand, parseMultiLinks,
    renderEraserOptions, syncEraserInputs, drawEraserFrame, drawEraserPreview, exportEraserWebM,
    // STT
    sttSetFile, sttRemoveFile, sttRun, sttSample, sttToScript, sttToCaption, sttDownloadTxt, sttDownloadSrt,
    sttParseSRT, sttFormatSRT, sttSplitSentences, sttSplitCaptions, renderStt, updateSubTlUI, sttPlainText,
    // 떡상 순위 & 벤치마킹
    renderTrend, renderTrendPick, trendPick, trendList, trendScore, trendParseText, trendFromJSON, trendAddVideos,
    trendParseFromInput, trendLoadSample, runBenchmark, renderBench, benchTextOf, benchAllText, benchMarkdown, benchSend,
    TREND_SAMPLE_TEXT,
    setTime: t => { PV.t = clamp(t, 0, totalDuration()); drawPreview(); },
    // 자막 모션 15종 · 스마트 자막 위치
    CAP_MOTIONS, MOTION_BY_ID, setCapMotion, renderCapMotionChips, setSmartPlace, updateSmartNote,
    drawCaption, captionModel, captionLayout, analyzeBands, smartCaptionY, sampleScene, SMART,
    lastCaption: () => LAST_CAP ? {
      yCenter: LAST_CAP.yCenter, startY: LAST_CAP.startY, adReserve: LAST_CAP.adReserve,
      bottom: LAST_CAP.bottom, maxScale: LAST_CAP.maxScale, lineH: LAST_CAP.model.lineH,
      lines: LAST_CAP.model.lines.length, fs: LAST_CAP.model.fs, motion: LAST_CAP.M.motion,
      placed: LAST_CAP.placed, lt: LAST_CAP.M.lt, exitFade: LAST_CAP.M.exitFade
    } : null,
    setFamousTime: t => { FAMOUS.t = clamp(t, 0, famousDur()); drawFamousPreview(); },
    famousNow: () => FAMOUS.t,
    now: () => PV.t
  };
})();
