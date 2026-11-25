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
    hist: 'sv.hist.v1', mode: 'sv.mode.v1', work: 'sv.work.v1'
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
    step: 0,
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
    scenes: [],
    style: {
      blurOn: true, blurMode: 'blur', blurY: 55, blurH: 18, blurStrength: 18,
      titleOn: true, highlightOn: true,
      capSize: 32, capY: 78, capFont: 'sans', capColor: '#ffffff', capStroke: '#000000',
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
    if (mb) { mb.className = 'badge ' + (live ? 'live' : 'demo'); mb.innerHTML = '<span class="dot"></span>' + (live ? 'Gemini 연결' : '데모 모드'); }
    $$('.js-demo-toggle').forEach(el => { if (el.checked !== !!state.demo) el.checked = !!state.demo; });
    const sm = $('#statusMode');
    if (sm) sm.innerHTML = '<i></i><b>' + (live ? 'Gemini 연결' : '데모 모드') + '</b> · ' + (live ? 'API 키 ' + counts + '개' : '모든 기능 로컬 실행');
    $$('[data-mode-label]').forEach(el => { el.textContent = live ? 'Gemini' : '데모'; });
    const sb = $('#scriptModeBadge'); if (sb) sb.textContent = live ? 'Gemini' : '데모';
    const tb = $('#titleModeBadge'); if (tb) tb.textContent = live ? 'Gemini' : '데모';
    const pdb = $('#prodDemoBadge'); if (pdb) pdb.textContent = (state.product && state.product.demo) ? '데모 분석' : 'AI 분석';
  }

  function openSettings() {
    const m = $('#settingsModal'); if (!m) return;
    m.hidden = false;
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
    return { lang, tone, length, titles, highlights: highlights.filter(Boolean), sentences: sents.map(text => ({ text })), demo: true };
  }

  async function geminiScript() {
    const p = state.product || {};
    const langName = LANG_NAME[state.scriptOpts ? state.scriptOpts.lang : 'ko'];
    const opts = state.scriptOpts || { lang: 'ko', tone: 'friendly', length: 'normal' };
    const n = LEN_COUNT[opts.length] || 5;
    const prompt = [
      '너는 한국 쇼츠 대본 작가다. 아래 제품으로 세로 쇼츠(9:16) 대본을 JSON으로 써라.',
      '제품: ' + (p.name || '제품') + ' / 카테고리: ' + (p.category || '') + ' / 가격: ' + (p.price || ''),
      '후킹 포인트: ' + ((p.hooks || []).join(' | ') || '없음'),
      '키워드: ' + ((p.keywords || []).join(', ') || '없음'),
      '언어: ' + langName + ' / 톤: ' + TONE_NAME[opts.tone] + ' / 길이: ' + n + '문장',
      '규칙: 첫 문장은 1초 훅. 광고 같지 않게, 실제 사용 후기처럼. 각 문장은 20~45자(한국어 기준).',
      '상단 제목은 정확히 2줄(각 22자 이내, 한국어면 18자 이내), 강조 단어 3~5개.',
      'JSON: {"titles":[string,string],"highlights":[string],"sentences":[string]} — 문장은 정확히 ' + n + '개.'
    ].join('\n');
    const raw = await geminiJSON(prompt, { temp: 0.9, maxTokens: 1400 });
    const titles = (Array.isArray(raw.titles) ? raw.titles : []).slice(0, 2).map(t => String(t).slice(0, 40));
    while (titles.length < 2) titles.push(titles[0] || '쇼츠 대본');
    const sents = (Array.isArray(raw.sentences) ? raw.sentences : []).map(s => ({ text: String(s).slice(0, 200) })).filter(s => s.text.trim());
    if (!sents.length) throw new Error('대본 문장이 비어 있습니다');
    return {
      ...opts, titles,
      highlights: (Array.isArray(raw.highlights) ? raw.highlights : []).slice(0, 6).map(String),
      sentences: sents.slice(0, 9), demo: false
    };
  }

  async function writeScript() {
    if (!state.product) { toast('먼저 1~2단계에서 제품을 분석하세요', 'bad'); goStep(1); return; }
    const btn = $('#btnWriteScript'), status = $('#scriptStatus');
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 작성 중';
    status.textContent = '대본 작성 중…';
    try {
      const out = await withDemoFallback(geminiScript, () => demoScript(state.product, state.scriptOpts.lang, state.scriptOpts.tone, state.scriptOpts.length), '대본 작성');
      state.script = out;
      state.voice = null;
      renderScript(); renderTimeline(); buildScenes(); ensurePreview();
      status.textContent = (out.demo ? '데모' : 'Gemini') + ' 대본 완료 · ' + out.sentences.length + '문장' + (out.__fallback ? ' (Gemini 실패 → 데모)' : '');
      toast('대본 ' + out.sentences.length + '문장을 만들었습니다', 'good');
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
    updateModeUI();
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
  const VOICES = {
    calm_f: { pitch: 196, rate: 0.96, name: '차분한 여성' },
    bright_f: { pitch: 232, rate: 1.04, name: '밝은 여성' },
    deep_m: { pitch: 112, rate: 0.94, name: '낮은 남성' },
    energy_m: { pitch: 148, rate: 1.1, name: '에너지 남성' }
  };
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
    const vp = VOICES[opt.voice] || VOICES.calm_f;
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
    const voiceName = { calm_f: 'Kore', bright_f: 'Aoede', deep_m: 'Charon', energy_m: 'Puck' }[voiceKey] || 'Kore';
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

  async function buildVoice() {
    if (!state.script || !state.script.sentences.length) { toast('먼저 대본을 만들어 주세요', 'bad'); return; }
    const btn = $('#btnMakeVoice'), status = $('#voiceStatus');
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 음성 만드는 중';
    const useGemini = !state.demo && realKeys().length > 0;
    const voice = $('#voiceSel').value;
    const speed = Number($('#speedRange').value) || 1;
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
        t += dur + 0.16;
      }
      const totalEnd = timeline.length ? timeline[timeline.length - 1].end : 0;
      state.voice = { mode, voice, speed, timeline, total: totalEnd, buffers };
      renderTimeline();
      ensurePreview();
      status.textContent = (mode === 'gemini' ? 'Gemini TTS' : mode === 'mixed' ? '일부 Gemini · 나머지 합성음' : '브라우저 합성음') + ' · ' + timeline.length + '문장 · ' + totalEnd.toFixed(1) + '초 (실측)';
      toast('음성 타임라인 완성 · ' + totalEnd.toFixed(1) + '초', 'good');
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
    for (const row of v.timeline) { if (t >= row.start && t < row.end + 0.16) return row.i; }
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
    const vt = $('#voiceTitle'); if (vt) vt.textContent = (VOICES[v.voice] || {}).name || '음성';
    const vs = $('#voiceSub');
    if (vs) vs.textContent = (v.mode === 'gemini' ? 'Gemini TTS' : v.mode === 'mixed' ? 'Gemini + 합성음' : '브라우저 합성음(데모)') + ' · ' + v.timeline.length + '문장 · ' + (v.speed || 1).toFixed(2) + 'x';
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
    if (state.voice) return state.voice.timeline;
    if (!state.script) return [];
    let t = 0;
    return state.script.sentences.map((s, i) => {
      const d = clamp((s.text || '').length * 0.15, 1.3, 6);
      const row = { i, start: t, dur: d, end: t + d };
      t += d + 0.16;
      return row;
    });
  }
  function totalDuration() { const tl = previewTimeline(); return tl.length ? tl[tl.length - 1].end : 0; }
  function indexAt(t) {
    const tl = previewTimeline();
    for (const row of tl) { if (t >= row.start && t < row.end + 0.16) return row.i; }
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
    // 자막(현재 문장)
    if (script && script.sentences[idx]) {
      const text = script.sentences[idx].text;
      let fs = Math.round(st.capSize * (W / 540));
      const maxW = W * 0.9;
      let wrap = null, font = '';
      // 자막은 최대 4줄: 넘치면 글자를 줄여 영상 밖으로 나가지 않게 한다
      for (let guard = 0; guard < 14; guard++) {
        font = '800 ' + fs + 'px ' + FONT_STACK[st.capFont];
        wrap = wrapRich(ctx, text, maxW, font);
        if (wrap.lines.length <= 4 || fs <= 18) break;
        fs -= 2;
      }
      let lineH = fs * 1.28;
      let cy = clamp(st.capY, 50, 95) / 100 * H;
      let startY = cy - (wrap.lines.length - 1) * lineH / 2;
      // 광고·대가성 문구와 겹치지 않게 위로 올린다
      const adReserve = st.ad === 'coupang' ? H * 0.90 : st.ad === 'ad' ? H * 0.94 : H * 0.985;
      const bottom = startY + (wrap.lines.length - 1) * lineH + fs / 2;
      if (bottom > adReserve) startY -= (bottom - adReserve);
      startY = Math.max(H * 0.22, startY);
      ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const hl = st.highlightOn ? (script.highlights || []).map(normWord).filter(Boolean) : [];
      wrap.lines.forEach((line, i) => {
        drawRichLine(ctx, line, wrap.space, W / 2, startY + i * lineH, hl, st.capColor, '#ffd166', st.capStroke);
      });
    }
    // 광고 / 대가성 문구
    if (st.ad !== 'off') {
      const label = st.ad === 'coupang'
        ? '광고 · 쿠팡 파트너스 활동의 일환으로 수수료를 제공받습니다'
        : '광고';
      const fs = Math.round(W * (st.ad === 'coupang' ? 0.026 : 0.030));
      ctx.font = '700 ' + fs + 'px ' + FONT_STACK.sans;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width;
      const pad = fs * 0.55;
      const bw = Math.min(W * 0.94, tw + pad * 2), bh = fs + pad * 1.4;
      const bx = W / 2 - bw / 2;
      const by = st.ad === 'coupang' ? H * 0.925 : H * 0.028;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      roundRect(ctx, bx, by - bh / 2, bw, bh, bh / 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.fillText(label, W / 2, by + 1);
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
    const iLen = $('#infoLen'); if (iLen) iLen.textContent = (state.voice ? state.voice.total : totalDuration()).toFixed(1) + 's';
  }

  async function togglePreview() {
    if (PV.playing) { stopPlayback(); return; }
    if (!state.script || !state.script.sentences.length) { toast('먼저 3단계에서 대본을 만들어 주세요', 'bad'); return; }
    if (!state.voice) {
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
    (state.voice ? state.voice.timeline : []).forEach((row, i) => {
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
  function styleFromInputs() {
    const st = state.style;
    st.blurOn = $('#blurOn').checked; st.blurY = Number($('#blurY').value); st.blurH = Number($('#blurH').value); st.blurStrength = Number($('#blurStrength').value);
    st.blurMode = $('#blurMode').value;
    st.titleOn = $('#titleOn').checked; st.highlightOn = $('#highlightOn').checked;
    st.capSize = Number($('#capSize').value); st.capY = Number($('#capY').value); st.capFont = $('#capFont').value;
    st.capColor = $('#capColor').value; st.capStroke = $('#capStroke').value;
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
    updateStyleLabels();
  }
  function updateStyleLabels() {
    const st = state.style;
    const map = { '#blurYVal': st.blurY + '%', '#blurHVal': st.blurH + '%', '#blurStrengthVal': (st.blurMode === 'mosaic' ? '모자이크 ' : '블러 ') + st.blurStrength + 'px', '#capSizeVal': String(st.capSize), '#capYVal': st.capY + '%', '#bgmVolVal': st.bgmVol + '%' };
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
    if (!state.voice) {
      await buildVoice();
      if (!state.voice) return;
    }
    exporting = true;
    stopPlayback();
    const W = 540, H = 960, fps = 30;
    const dur = state.voice.total;
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

    // 오디오 스케줄
    const startAt = ac.currentTime + 0.18;
    const sources = [];
    state.voice.timeline.forEach((row, i) => {
      const src = ac.createBufferSource(); src.buffer = state.voice.buffers[i];
      const g = ac.createGain(); g.gain.value = 1; src.connect(g); g.connect(dest);
      try { src.start(startAt + row.start); sources.push(src); } catch (e) {}
    });
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
    if (info) info.textContent = '540×960 WebM · ' + dur.toFixed(1) + '초 · 음성 ' + (state.voice.mode === 'gemini' ? 'Gemini TTS' : '합성음') + ' 포함';
    state.exported++;
    addHistoryFromProduct(true);
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
    const desc = ($('#descInput') && $('#descInput').value) || t.desc || '';
    const hook = (p.hooks && p.hooks[0]) || '';
    const common = [desc, disc].filter(Boolean).join('\n\n');
    const texts = {
      yt: [title, '', common, link ? '👉 ' + link : '', (tags.join(' ') + ' #Shorts').trim()].filter(Boolean).join('\n'),
      tt: [title, hook ? '· ' + hook : '', link ? 'link in bio · ' + link : '', tags.join(' ')].filter(Boolean).join('\n'),
      ig: [title, '', desc, disc, link ? '🔗 ' + link : '', tags.join(' ')].filter(Boolean).join('\n'),
      th: [title + (hook ? ' — ' + hook : ''), link ? '👉 ' + link : '', tags.slice(0, 5).join(' '), disc].filter(Boolean).join('\n'),
      fb: [title, '', desc, disc, link ? link : '', tags.join(' ')].filter(Boolean).join('\n')
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
    if (!silent) toast('링크 히스토리에 추가했습니다', 'good');
  }
  function addHistoryManual() {
    const p = state.product;
    const name = p ? p.name : '직접 추가한 링크';
    const link = coupangLink() || (state.coupang.auto ? autoLink(name) : '');
    state.history.push({ id: uid('h'), name, link, date: new Date().toISOString(), auto: !state.history.some(h => h.link === link) });
    lsSet(LS.hist, state.history);
    renderHistory(); buildHubTexts(); renderHub();
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

  /* ---------------- navigation / progress ---------------- */
  const STEP_LABEL = ['키 설정', '링크 넣기', '비슷한 제품', '대본·음성', '자동 편집', '썸네일·제목', '다뿔려 업로드', '쿠팡 파트너스'];

  function stepDone(n) {
    switch (n) {
      case 0: return realKeys().length > 0;
      case 1: return getItems().length > 0;
      case 2: return !!state.product;
      case 3: return !!(state.script && state.script.sentences.length && state.voice);
      case 4: return !!(state.scenes.length && state.voice);
      case 5: return !!(state.titles && state.titles.pick >= 0);
      case 6: return !!(state.hubTexts && state.hubTexts.yt);
      case 7: return state.history.length > 0;
      default: return false;
    }
  }
  function refreshRail() {
    $$('#stepRail .step-btn').forEach(b => {
      const n = +b.dataset.step;
      b.classList.toggle('done', stepDone(n) && n !== state.step);
    });
    const ss = $('#statusStep'); if (ss) ss.textContent = 'STEP ' + state.step;
  }

  function goStep(n, opts) {
    opts = opts || {};
    n = clamp(Number(n) || 0, 0, 7);
    state.step = n;
    $$('.step-panel').forEach(p => p.classList.toggle('show', +p.dataset.step === n));
    $$('#stepRail .step-btn').forEach(b => {
      const on = +b.dataset.step === n;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    refreshRail();
    if (n === 3 && state.script) { /* 대본 화면은 이미 렌딩됨 */ }
    if (n === 4) { if (!state.scenes.length) buildScenes(); ensurePreview(); updatePreviewMeta(); }
    if (n === 5) { renderTitles(); renderThumb(); }
    if (n === 6) { buildHubTexts(); renderHub(); }
    if (n === 7) { renderHistory(); renderCpBadge(); }
    if (!opts.keepScroll) {
      try { window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' }); } catch (e) { window.scrollTo(0, 0); }
    }
    if (window.matchMedia && window.matchMedia('(max-width:1060px)').matches) {
      const b = $('#stepRail .step-btn.active');
      if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    if (n >= 3) ensurePreview();
    drawPreview();
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
      if (b) goStep(+b.dataset.step);
    });
    $('#mPrev').addEventListener('click', () => goStep(state.step - 1));
    $('#mNext').addEventListener('click', () => goStep(state.step + 1));
    $('#mPreview').addEventListener('click', () => {
      const el = $('#previewPane');
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.style.boxShadow = '0 0 0 2px rgba(255,122,69,.65)';
      setTimeout(() => { el.style.boxShadow = ''; }, 1200);
    });
    $('#btnHeroStart').addEventListener('click', () => goStep(1));
    $('#btnHeroDemo').addEventListener('click', async () => { fillSampleLinks(); await runAnalysis(); });
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
  }

  /* ---------------- init ---------------- */
  function init() {
    state.scriptOpts = { lang: 'ko', tone: 'friendly', length: 'normal' };
    loadKeys(); loadPreset(); loadCoupang();
    renderKeys(); updateModeUI(); updateAnalyzeHint();
    renderLinks(); renderFiles(); renderProduct(); renderRefs(); renderCart();
    renderScript(); renderTimeline(); renderScenes(); renderTitles(); renderThumb();
    buildHubTexts(); renderHub(); renderHistory(); renderCpBadge(); updatePreviewMeta(); updateStyleLabels();
    wire();
    goStep(0, { keepScroll: true });
    drawPreview();
    const vm = $('#voiceModeBadge'); if (vm) { vm.className = 'badge'; vm.textContent = state.demo ? '데모' : '대기'; }
    const pm = $('#previewBadge'); if (pm) pm.textContent = '9:16';
    const em = $('#exportBadge'); if (em) em.textContent = pickMime().includes('vp9') ? '9:16 · WebM/VP9' : '9:16 · WebM';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* 테스트·고급 사용용 공개 훅(읽기/자동화). UI와 같은 코드 경로를 쓴다. */
  window.SV = {
    version: '1.0.0', state, PV,
    goStep, syncLinks, runAnalysis, writeScript, buildVoice, exportWebM, drawFrame, drawPreview,
    totalDuration, previewTimeline, suggestTitles, pickTitle, makeThumbBlob, downloadThumb,
    buildHubTexts, renderHub, savePreset, loadPreset, renderKeys, renderHistory, saveCoupang,
    addFiles, addHistoryFromProduct, togglePreview, stopPlayback, synthSpeechBuffer, bgmBuffer,
    disclosureText, autoLink, coupangLink, fillSampleLinks, isDemo: () => state.demo || !realKeys().length,
    setTime: t => { PV.t = clamp(t, 0, totalDuration()); drawPreview(); },
    now: () => PV.t
  };
})();
