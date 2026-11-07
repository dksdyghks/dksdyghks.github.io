/* 송공 — the app. Choose a subject, solve one question, read the explanation on the next page, move on.
   Wrong answers go to the 오답노트 with the whole question stored, and come back on a 1·3·7·14·30-day schedule.
   Everything lives in this browser (IndexedDB); a backup file carries it to another device. */
(function () {
  'use strict';
  const P = window.PSAT;
  const Door = window.Door;
  const EMBED = window.parent !== window;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const SUBJ = {
    lang: { name: '언어논리', pace: 135, bankP: 0.62, key: '1', hint: '독해 · 논증 · 형식논리' },
    data: { name: '자료해석', pace: 135, bankP: 0.7, key: '2', hint: '표 해석 · 매칭 · 계산' },
    sit: { name: '상황판단', pace: 135, bankP: 0.7, key: '3', hint: '법조문 · 규칙 적용 · 퀴즈' },
  };
  const ORDER = ['lang', 'data', 'sit'];
  const INTERVALS = [1, 3, 7, 14, 30];
  const DEFAULTS = { theme: 'auto', size: 'm', face: 'serif', timer: true, mixReview: true, level: 'auto', goal: '0' };
  const CAUSES = ['계산 실수', '조건을 놓침', '개념·법리 부족', '시간 부족', '기타'];

  /* ---------------- small utilities ---------------- */
  const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); const t = new Date(y, m - 1, d + n); return dayKey(t.getTime()); };
  const md = (key) => { const [, m, d] = key.split('-').map(Number); return `${m}/${d}`; };
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const clock = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
  const human = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); const m = Math.floor(s / 60); return m ? (s % 60 ? `${m}분 ${pad(s % 60)}초` : `${m}분`) : `${s}초`; };
  const hours = (ms) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`; };
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const stemText = (s) => String(s || '').replace(/<\/?(u|b)>/g, '');
  const plain = (h) => String(h || '').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  function cyrb53(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  const snippet = (q) => { for (const b of q.body || []) { const t = b.t === 'table' ? `〈${b.caption || '표'}〉 ${(b.head || []).join(' · ')}` : b.t === 'box' ? (b.items || []).join(' ') : b.h; const p = plain(t || ''); if (p) return p.length > 90 ? p.slice(0, 90) + '…' : p; } return ''; };
  const isHidden = (key) => (S.settings.hidden || []).includes(key);
  const seenKey = (q) => (q.src === 'gen' ? 'h:' + cyrb53(JSON.stringify([q.stem, q.body, q.options])) : 'id:' + q.id);
  const paceOf = (q) => (q && q.sec) || SUBJ[q.subject].pace; // 직접 출제 문항은 검수표의 예상 풀이 시간, 그 밖에는 과목 기준 속도
  const typeShort = (subj, type) => String(type || '').replace((SUBJ[subj] ? SUBJ[subj].name : '') + ' · ', '');
  let toastTimer = 0;
  function toast(msg) {
    let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------------- storage: IndexedDB, with an in-memory fallback ---------------- */
  const DB = (() => {
    let db = null;
    const open = () => new Promise((res, rej) => {
      let req;
      try { req = indexedDB.open('songgong', 1); } catch (e) { rej(e); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('items')) d.createObjectStore('items', { keyPath: 'qid' });
        if (!d.objectStoreNames.contains('log')) d.createObjectStore('log', { autoIncrement: true });
        if (!d.objectStoreNames.contains('seen')) d.createObjectStore('seen');
      };
      req.onsuccess = () => { db = req.result; db.onversionchange = () => db.close(); res(db); };
      req.onerror = () => rej(req.error);
      req.onblocked = () => rej(new Error('blocked'));
    });
    const run = (store, mode, fn) => new Promise((res, rej) => {
      if (!db) { res(undefined); return; }
      let out;
      try {
        const t = db.transaction(store, mode); const s = t.objectStore(store);
        const r = fn(s); if (r) r.onsuccess = () => { out = r.result; };
        t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      } catch (e) { rej(e); }
    });
    const kvAll = () => new Promise((res, rej) => {
      if (!db) { res({}); return; }
      const out = {}; const t = db.transaction('kv', 'readonly'); const c = t.objectStore('kv').openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error);
    });
    return {
      open, kvAll, ready: () => !!db,
      get: (st, k) => run(st, 'readonly', (s) => s.get(k)),
      put: (st, v, k) => run(st, 'readwrite', (s) => (k === undefined ? s.put(v) : s.put(v, k))),
      add: (st, v) => run(st, 'readwrite', (s) => s.add(v)),
      del: (st, k) => run(st, 'readwrite', (s) => s.delete(k)),
      all: (st) => run(st, 'readonly', (s) => s.getAll()),
      keys: (st) => run(st, 'readonly', (s) => s.getAllKeys()),
      clear: (st) => run(st, 'readwrite', (s) => s.clear()),
      putMany: (st, vals) => run(st, 'readwrite', (s) => { for (const [v, k] of vals) (k === undefined ? s.put(v) : s.put(v, k)); return null; }),
    };
  })();

  const S = {
    settings: { ...DEFAULTS },
    agg: { subj: {}, type: {} },
    daily: {},
    queue: [],
    items: new Map(),
    seen: new Set(),
    meta: {},
    lv: {},        // 자동 난이도: 'subj|type' -> {lv, recent: [true/false…]}
    persistent: false,
    view: 'home',
    ctx: null,     // {subj, type, mode: 'new' | 'review' | 'note'}
    cur: null,     // {q, ctx, phase: 'q' | 'x', choice, ms, ok, review}
  };
  let saveChain = Promise.resolve();
  let warnedSave = false;
  function persist(fn) {
    saveChain = saveChain.then(fn).catch((e) => { if (!warnedSave) { warnedSave = true; toast('기록을 저장하지 못했습니다. 저장 공간을 확인해 주세요.'); } console.error(e); });
    return saveChain;
  }
  const saveKV = (k) => persist(() => DB.put('kv', S[k], k));
  const CUR_KEY = 'songgong.cur', SET_KEY = 'songgong.set';
  function saveSet() { try { if (S.set) localStorage.setItem(SET_KEY, JSON.stringify(S.set)); else localStorage.removeItem(SET_KEY); } catch (e) { /* ignore */ } }
  function loadSet() { try { const v = localStorage.getItem(SET_KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function saveCur() {
    try {
      if (S.cur) localStorage.setItem(CUR_KEY, JSON.stringify({ q: S.cur.q, ctx: S.cur.ctx, phase: S.cur.phase, choice: S.cur.choice, ms: S.cur.ms, ok: S.cur.ok, review: S.cur.review, no: S.cur.no, deferred: !!S.cur.deferred }));
      else localStorage.removeItem(CUR_KEY);
    } catch (e) { /* storage full or blocked: the question is simply not restored */ }
  }
  function loadCur() { try { const v = localStorage.getItem(CUR_KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; } }

  async function load() {
    try {
      await DB.open();
      const kv = await DB.kvAll();
      S.settings = { ...DEFAULTS, ...(kv.settings || {}) };
      S.agg = kv.agg || S.agg; S.daily = kv.daily || {}; S.queue = kv.queue || []; S.meta = kv.meta || {}; S.lv = kv.lv || {};
      if (!S.agg.p5) { S.agg.p5 = {}; for (const e of (await DB.all('log')) || []) if (isP5(e.qid)) bump(S.agg.p5, e.subj, e.ok, e.ms); } // 이 기록이 생기기 전의 풀이도 반영
      for (const it of (await DB.all('items')) || []) S.items.set(it.qid, it);
      for (const k of (await DB.keys('seen')) || []) S.seen.add(k);
      S.persistent = true;
      if (!S.meta.createdAt) { S.meta.createdAt = Date.now(); saveKV('meta'); }
    } catch (e) {
      S.persistent = false;
      try { const v = localStorage.getItem('songgong.settings'); if (v) S.settings = { ...DEFAULTS, ...JSON.parse(v) }; } catch (e2) { /* ignore */ }
    }
    S.cur = loadCur();
    S.set = loadSet();
    S.mock = loadMock();
  }

  /* ---------------- statistics ---------------- */
  const bump = (map, k, ok, ms) => { const a = map[k] || (map[k] = { n: 0, ok: 0, ms: 0 }); a.n++; a.ok += ok ? 1 : 0; a.ms += ms; };
  const isP5 = (id) => /^[SDL]-(Z|[A-Z]{2})\d+$/.test(id || ''); // 5급 실전(심화) 정예 문항(core.js의 q.p5와 같은 기준)
  function addToStats(e) {
    bump(S.agg.subj, e.subj, e.ok, e.ms);
    if (isP5(e.qid)) bump(S.agg.p5 || (S.agg.p5 = {}), e.subj, e.ok, e.ms);
    bump(S.agg.type, e.subj + '|' + e.type, e.ok, e.ms);
    const d = dayKey(e.at); const day = S.daily[d] || (S.daily[d] = { n: 0, ok: 0, ms: 0, s: {} });
    day.n++; day.ok += e.ok ? 1 : 0; day.ms += e.ms;
    const ds = day.s[e.subj] || (day.s[e.subj] = { n: 0, ok: 0 }); ds.n++; ds.ok += e.ok ? 1 : 0;
  }
  function streak() {
    let k = dayKey(), n = 0;
    if (!(S.daily[k] && S.daily[k].n)) k = addDays(k, -1);
    while (S.daily[k] && S.daily[k].n) { n++; k = addDays(k, -1); }
    return n;
  }
  const dueItems = (subj) => {
    const t = dayKey();
    return Array.from(S.items.values()).filter((it) => SUBJ[it.subj] && it.due && it.due <= t && (!subj || it.subj === subj) && !isHidden(it.h || ('id:' + it.qid))).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.lastAt - b.lastAt));
  };
  function srUpdate(rec, ok) {
    const t = dayKey();
    if (ok) {
      rec.box = (rec.box == null ? 0 : rec.box) + 1;
      if (rec.box >= INTERVALS.length) { rec.due = null; rec.done = true; } else { rec.due = addDays(t, INTERVALS[rec.box]); rec.done = false; }
    } else { rec.box = 0; rec.due = addDays(t, INTERVALS[0]); rec.done = false; }
  }

  /* ---------------- question supply ---------------- */
  function typesOf(subj) {
    const seen = new Set(), out = [];
    for (const g of P.gens[subj] || []) if (!seen.has(g.label)) { seen.add(g.label); out.push(g.label); }
    for (const q of P.bank[subj] || []) if (!seen.has(q.type)) { seen.add(q.type); out.push(q.type); }
    return out;
  }
  function chooseGen(subj, type) {
    const gens = (P.gens[subj] || []).filter((g) => !type || g.label === type);
    if (!gens.length) return null;
    const tot = gens.reduce((s, g) => s + g.w, 0); let x = Math.random() * tot;
    for (const g of gens) { if ((x -= g.w) < 0) return g; }
    return gens[gens.length - 1];
  }
  const levelFor = (subj, label) => (S.settings.level === 'auto' ? ((S.lv[subj + '|' + label] || {}).lv || 2) : +S.settings.level || 2);
  function fromGenerator(subj, type) {
    for (let k = 0; k < 40; k++) {
      const g = chooseGen(subj, type); if (!g) return null;
      const q = P.make(subj, g, P.newSeed(), levelFor(subj, g.label));
      if (!q) continue;
      if (S.seen.has(seenKey(q))) continue;
      return q;
    }
    return null;
  }
  const bankCopy = (q, subj) => JSON.parse(JSON.stringify({ ...q, subject: subj, src: q.src || 'bank' }));
  function fromBank(subj, type, p5) {
    const pool = (P.bank[subj] || []).filter((q) => (!type || q.type === type) && (!p5 || q.p5) && !(q.setNo > 1) && !S.seen.has('id:' + q.id) && !isHidden('id:' + q.id));
    if (!pool.length) return null;
    const q = bankCopy(pool[Math.floor(Math.random() * pool.length)], subj);
    if (q.set) { // 1지문 2문항: queue the sibling(s) to come right after
      const sib = (P.bank[subj] || []).filter((x) => x.set === q.set && x.setNo > q.setNo).sort((a, b) => a.setNo - b.setNo);
      S.queue = sib.map((x) => ({ subj, id: x.id })).concat(S.queue.filter((e) => !sib.some((x) => x.id === e.id)));
      saveKV('queue');
    }
    return q;
  }
  const bankLeft = (subj, type, p5) => (P.bank[subj] || []).filter((q) => (!type || q.type === type) && (!p5 || q.p5) && !(q.setNo > 1) && !S.seen.has('id:' + q.id) && !isHidden('id:' + q.id)).length;
  function nextQuestion(ctx) {
    const { subj, type } = ctx;
    if (ctx.mode === 'review') {
      const due = dueItems(subj).filter((it) => !type || it.type === type);
      return due.length ? { q: due[0].q, review: true } : null;
    }
    if (ctx.mode === 'set' && S.set && Array.isArray(S.set.plan)) { // 세트는 미리 짠 문항 순서대로, 다 쓰면 생성 문항으로 채운다
      const later = S.set.later || [];
      if (S.set.results.length + later.length >= S.set.n) { // 새 문항을 다 냈으면 넘긴 문항으로 돌아간다(쓴 시간과 고른 답은 그대로)
        if (!later.length) return null;
        const x = later.shift(); saveSet(); return { q: x.q, ms: x.ms, choice: x.choice, no: x.no, deferred: true };
      }
      while (S.set.plan.length) {
        const id = S.set.plan.shift(); saveSet();
        const q = (P.bank[subj] || []).find((x) => x.id === id);
        if (q && !isHidden('id:' + q.id)) return { q: bankCopy(q, subj) };
      }
      const gt = S.set.genTypes || []; // 약점 위주 세트: 생성 유형 가운데 약한 유형을 돌아가며
      for (let i = 0; i < 8; i++) { const t = gt.length ? gt[(S.set.gi = ((S.set.gi || 0) + 1)) % gt.length] : ''; const g = fromGenerator(subj, t) || (t ? fromGenerator(subj, '') : null); if (!g) break; if (!isHidden(seenKey(g))) { saveSet(); return { q: g }; } }
      const b = fromBank(subj, ''); return b ? { q: b } : null;
    }
    while (S.queue.length) {
      const e = S.queue.shift(); saveKV('queue');
      const q = (P.bank[e.subj] || []).find((x) => x.id === e.id);
      if (q && e.subj === subj && !S.seen.has('id:' + q.id) && !isHidden('id:' + q.id)) return { q: bankCopy(q, subj) };
    }
    if (ctx.p5) { const b = fromBank(subj, type, true); return b ? { q: b } : null; } // 5급 실전 정예만: 직접 출제 정예 문항에서만 낸다
    if (S.settings.mixReview && !type && ctx.mode !== 'set') {
      const due = dueItems(subj);
      if (due.length && Math.random() < 0.22) return { q: due[0].q, review: true };
    }
    if (bankLeft(subj, type) && Math.random() < SUBJ[subj].bankP) { const q = fromBank(subj, type); if (q) return { q }; }
    for (let i = 0; i < 8; i++) { const g = fromGenerator(subj, type); if (!g) break; if (!isHidden(seenKey(g))) return { q: g }; }
    const b = fromBank(subj, type); if (b) return { q: b };
    return null;
  }

  /* ---------------- rendering of question blocks ---------------- */
  const stemHTML = (s) => esc(s).replace(/&lt;(\/?)(u|b)&gt;/g, '<$1$2>');
  function tableHTML(b) {
    const keep = (c) => { const t = String(c == null ? '' : c); return t.length <= 10 && !/[<&]/.test(t) ? `<span class="nw">${t}</span>` : t; }; // short values never split across lines
    const head = b.head ? `<thead><tr>${b.head.map((c, i) => `<th${i === 0 && b.num ? ' class="l"' : ''} scope="col">${c}</th>`).join('')}</tr></thead>` : '';
    const rows = (b.rows || []).map((r) => `<tr>${r.map((c, i) => (i === 0 && b.head ? `<th scope="row">${keep(c)}</th>` : `<td>${keep(c)}</td>`)).join('')}</tr>`).join('');
    const cap = b.caption || b.unit ? `<div class="tbl-cap"><b>${b.caption ? `〈${esc(b.caption).replace(/^〈|〉$/g, '')}〉` : ''}</b><span>${b.unit ? esc(b.unit) : ''}</span></div>` : '';
    return `<div class="tblock">${cap}<div class="tbl-wrap"><table class="t${b.num ? ' num' : ''}">${head}<tbody>${rows}</tbody></table></div>${b.note ? `<p class="tbl-note">※ ${b.note.replace(/^※\s*/, '')}</p>` : ''}</div>`;
  }
  let chartSeq = 0;
  /* exam-style monochrome bar chart: a nice 0-based scale, each series told apart by tone and hatching (not colour alone),
     every bar labelled with its value (rotated when bars are narrow) and a legend for two or more series */
  function chartHTML(b) {
    const id = 'c' + (++chartSeq);
    const series = b.series || [], cats = b.cats || [], n = Math.max(1, series.length), dec = b.dec || 0;
    const all = series.flatMap((s) => s.v);
    const top = Math.max(...all, 0);
    const rough = top / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(rough || 1)));
    const step = b.step || [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= rough) || 10 * mag;
    const styles = [
      { fill: 'currentColor', op: 0.86, pat: '' },
      { fill: 'currentColor', op: 0.45, pat: '' },
      { fill: 'hatch', op: 1, pat: 'hatch' },
      { fill: 'var(--sheet)', op: 1, pat: 'outline' },
      { fill: 'dots', op: 1, pat: 'dots' },
    ];
    /* one drawing routine, two canvases: a wide one for desktop and a compact one that fits a phone without side-scrolling */
    const draw = (W, H, key, f) => {
      const R = 10, T = 18, B = 40;
      const rotate0 = n >= 3 || Math.min(40, (((W - f.L - R) / cats.length) * 0.76) / n) < 30;
      let max = b.max || Math.ceil((top * (1 + (rotate0 ? 0.3 : 0.14))) / step) * step;
      if (!b.max && /%/.test(b.unit || '') && !/%p/.test(b.unit || '') && top <= 85 && max > 100) max = 100; // a percentage axis ends at 100 when the labels still fit
      const ticks = []; for (let v = 0; v <= max + 1e-9; v += step) ticks.push(P.fmt(v, Number.isInteger(step) ? 0 : 1));
      const L = Math.max(f.L, Math.ceil(10 + Math.max(...ticks.map((t) => t.length)) * f.axis * 0.62)); // room for the longest tick label
      const groupW = (W - L - R) / cats.length;
      const bw = Math.min(40, (groupW * 0.76) / n);
      const rotate = n >= 3 || bw < 30;
      const y0 = H - B, y1 = T;
      const Y = (v) => y0 - (v / max) * (y0 - y1);
      const pid = id + key;
      const fillOf = (st) => (st.pat === 'hatch' ? `url(#${pid}h)` : st.pat === 'dots' ? `url(#${pid}d)` : st.fill);
      let g = `<defs><pattern id="${pid}h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--sheet)"/><line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" stroke-width="2.2"/></pattern><pattern id="${pid}d" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="var(--sheet)"/><circle cx="2.5" cy="2.5" r="1.1" fill="currentColor"/></pattern></defs>`;
      ticks.forEach((t, k) => {
        const v = k * step, y = Y(v);
        g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="currentColor" stroke-opacity="${v ? 0.12 : 0.9}" stroke-width="${v ? 1 : 1.2}"/><text x="${L - 6}" y="${y + 4}" text-anchor="end" font-size="${f.axis}">${t}</text>`;
      });
      cats.forEach((c, i) => { g += `<text x="${L + groupW * (i + 0.5)}" y="${y0 + 18}" text-anchor="middle" font-size="${f.cat}">${esc(c)}</text>`; });
      series.forEach((s, si) => {
        const st = styles[si % styles.length];
        s.v.forEach((v, i) => {
          const x = L + groupW * (i + 0.5) - (n * bw) / 2 + si * bw, y = Y(v), h = y0 - y;
          g += `<rect x="${x + 0.75}" y="${y}" width="${Math.max(1, bw - 1.5)}" height="${h}" fill="${fillOf(st)}" fill-opacity="${st.op}" stroke="currentColor" stroke-width="${st.pat ? 1 : 0}"/>`;
          const lab = P.fmt(v, dec), cx = x + bw / 2;
          g += rotate
            ? `<text x="${cx + f.val * 0.35}" y="${y - 4}" transform="rotate(-90 ${cx + f.val * 0.35} ${y - 4})" text-anchor="start" font-size="${f.val}">${lab}</text>`
            : `<text x="${cx}" y="${y - 5}" text-anchor="middle" font-size="${f.val}">${lab}</text>`;
        });
      });
      return `<svg class="chart ${key}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.caption || '그래프')}" style="color:var(--ink-2)">${g}</svg>`;
    };
    const sw = (si) => { const st = styles[si % styles.length]; return `<svg width="16" height="11" viewBox="0 0 16 11" aria-hidden="true" style="vertical-align:-1px;color:var(--ink-2)"><defs><pattern id="${id}lh${si}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="var(--sheet)"/><line x1="0" y1="0" x2="0" y2="5" stroke="currentColor" stroke-width="2"/></pattern><pattern id="${id}ld${si}" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="var(--sheet)"/><circle cx="2" cy="2" r="0.9" fill="currentColor"/></pattern></defs><rect x="0.5" y="0.5" width="15" height="10" fill="${st.pat === 'hatch' ? `url(#${id}lh${si})` : st.pat === 'dots' ? `url(#${id}ld${si})` : st.fill}" fill-opacity="${st.op}" stroke="currentColor" stroke-width="${st.pat ? 1 : 0}"/></svg>`; };
    const legend = n > 1 ? `<div class="legend">${series.map((s, si) => `<span>${sw(si)} ${esc(s.name)}</span>`).join('')}</div>` : '';
    const cap = `<div class="tbl-cap"><b>${b.caption ? `〈${esc(b.caption)}〉` : ''}</b><span>${b.unit ? esc(b.unit) : ''}</span></div>`;
    const wide = draw(680, 300, 'cw', { L: 52, axis: 11, cat: 12, val: 11 });
    const narrow = draw(340, 300, 'cn', { L: 30, axis: 9.5, cat: 10.5, val: 9.5 });
    return `<div class="tblock">${cap}${legend}<div class="chart-box">${wide}${narrow}</div>${b.note ? `<p class="tbl-note">※ ${b.note}</p>` : ''}</div>`;
  }
  // 틀렸을 때 고른 선지에는 '내가 고른 답'(〈보기〉 조합이면 잘못 판단한 ㄱ·ㄴ·ㄷ에 '내 판단과 다름') 표시를 붙여, 어디서 틀렸는지 바로 찾게 한다.
  function oxItem(n, text, it, isAns, isPick, bxPick) {
    return `<li class="ox${isAns ? ' ans' : ''}${isPick ? ' pick' : ''}"><span class="n" aria-hidden="true">${n}</span><div class="ob">${text ? `<div class="ot">${text}</div>` : ''}<div class="ow"><b class="v ${it.ok ? 'yes' : 'no'}">${it.v}.</b> ${it.why}${isAns ? ' <span class="ans-tag">정답</span>' : ''}${isPick ? ` <span class="ans-tag pick-tag">${bxPick ? '내 판단과 다름' : '내가 고른 답'}</span>` : ''}</div></div></li>`;
  }
  function blockHTML(b, q, pick) {
    if (!b) return '';
    switch (b.t) {
      case 'passage': { const h = String(b.h || ''); return `<div class="passage${b.frame ? ' frame' : ''}">${/^\s*</.test(h) ? h : `<p>${h}</p>`}</div>`; }
      case 'law': return `<div class="law">${b.h}</div>`;
      case 'box': return `<div class="box${b.plain ? ' plain' : ''}">${b.title ? `<div class="box-title">〈${esc(b.title)}〉</div>` : ''}<ul>${(b.items || []).map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
      case 'table': return tableHTML(b);
      case 'chart': return chartHTML(b);
      case 'p': return `<p>${b.h}</p>`;
      case 'list': return `<ul class="ex">${(b.items || []).map((x) => `<li>${x}</li>`).join('')}</ul>`;
      case 'steps': return `<ol class="steps">${(b.items || []).map((s) => `<li class="${s.ind ? 'i1' : ''}${s.k === 'case' ? ' case' : ''}${s.k === 'ok' ? ' ok' : ''}">${s.h}</li>`).join('')}</ol>`;
      case 'h': return `<h4>${b.h}</h4>`;
      case 'ox': return `<ol class="oxl" aria-label="선지별 해설">${(b.items || []).map((it, i) => oxItem(i + 1, q ? q.options[i] : '', it, q && i === q.answer, q && pick >= 0 && pick !== q.answer && i === pick)).join('')}</ol>`;
      case 'bx': {   // 해설에서 ㄱ·ㄴ·ㄷ마다 <보기> 원문을 그대로 보여 준다(선지별 해설이 선지 원문을 보여 주듯이). 원문을 못 찾으면 요약 글을 쓴다.
        const vb = q && (q.body || []).find((x) => x.t === 'box' && x.title === '보기');
        const full = (l) => { const s = vb && (vb.items || []).find((x) => String(x).startsWith(l + '. ')); return s ? String(s).slice(l.length + 2) : ''; };
        // 틀린 조합을 골랐다면, 그 조합이 옳고 그름을 잘못 판단한 ㄱ·ㄴ·ㄷ에 표시한다.
        const po = q && pick >= 0 && pick !== q.answer ? String(q.options[pick] || '').replace(/<[^>]+>/g, '') : '';
        const mine = /^[ㄱ-ㅎ](, [ㄱ-ㅎ])*$/.test(po) ? po.split(', ') : null;
        return `<ul class="oxl bx" aria-label="보기별 해설">${(b.items || []).map((it) => oxItem(it.label, full(it.label) || it.text, it, false, mine ? mine.includes(it.label) !== !!it.ok : false, true)).join('')}</ul>`;
      }
      default: return b.h ? `<p>${b.h}</p>` : '';
    }
  }
  // 채점 뒤 '문제 다시 보기'의 지문에만 문단 번호를 붙여, 해설의 'N문단'을 바로 찾게 한다(풀 때는 실제 시험처럼 번호가 없다). 각주(p.fn)는 세지 않는다.
  const paraCount = (b) => (String(b.h || '').match(/<p(?![^>]*\bfn\b)[\s>]/g) || []).length;
  // 해설 속 'N문단'을 누르면 '문제 다시 보기'를 펼치고 그 문단으로 옮겨 잠깐 강조한다. 태그 밖의 글자만 바꾸고, 지문에 없는 번호는 그대로 둔다.
  function paraLinks(html, q) {
    const ps = (q.body || []).filter((b) => b.t === 'passage'); const n = ps.length === 1 ? paraCount(ps[0]) : 0;
    if (n < 2) return html;
    return html.split(/(<[^>]+>)/).map((seg) => (seg.startsWith('<') ? seg : seg.replace(/(\d+)문단/g, (m, k) => (+k >= 1 && +k <= n ? `<button type="button" class="plink" data-act="goto-para" data-n="${k}">${m}</button>` : m)))).join('');
  }
  function gotoPara(k) {
    const d = $('details.reshow'); if (d) d.open = true;
    const p = $$('.passage.pnum p:not(.fn)')[k - 1]; if (!p) return;
    p.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    p.classList.remove('flash'); void p.offsetWidth; p.classList.add('flash');
  }
  // 소거법: 풀면서 아니라고 본 선지를 지워 둔다(문항마다 기억, 채점 뒤에는 보이지 않음). 선지를 고르는 것과는 따로 움직인다.
  const STRUCK = new Map();
  const struckOf = (q) => { if (!STRUCK.has(q.id)) STRUCK.set(q.id, new Set()); return STRUCK.get(q.id); };
  function toggleStrike(i) {
    const q = S.view === 'mock' && S.mock ? S.mock.items[S.mock.i].q : S.cur && S.cur.q; if (!q) return;
    const set = struckOf(q); if (set.has(i)) set.delete(i); else set.add(i);
    const btn = document.querySelector(`.opt-x[data-i="${i}"]`); if (!btn) return;
    const on = set.has(i); btn.closest('li').classList.toggle('struck', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false'); btn.setAttribute('aria-label', `${i + 1}번 선지 ${on ? '되살리기' : '지우기'}`);
  }
  // 지문 밑줄: 시험지에 펜으로 긋듯 문장을 누르면 밑줄이 그어지고, 다시 누르면 지워진다. 1지문 2문항은 지문 단위로 기억하여 둘째 문항에도 그대로 보이고,
  // 채점 뒤 '문제 다시 보기'에도 보여 어디에 주목했는지 돌아볼 수 있다(이 기기, 이번 사용 동안만). 태그가 문장 경계에 걸친 문단은 건드리지 않는다.
  const MARKS = new Map();
  const markKey = (q) => q.set || q.id;
  const VOID = /^<(br|img|hr|wbr)\b/i;
  const balanced = (h) => { let d = 0; for (const t of h.match(/<[^>]+>/g) || []) { if (VOID.test(t) || /\/>$/.test(t)) continue; d += t[1] === '/' ? -1 : 1; if (d < 0) return false; } return d === 0; };
  function markPassage(html, q, live) {
    const on = MARKS.get(markKey(q)) || new Set(); let pi = -1;
    return html.replace(/<p(\s[^>]*)?>([\s\S]*?)<\/p>/g, (m, attrs, inner) => {
      if (attrs && /\bfn\b/.test(attrs)) return m;
      pi++;
      const out = []; let cur = '';
      for (const seg of inner.split(/(<[^>]+>)/)) {
        if (seg.startsWith('<')) { cur += seg; continue; }
        let last = 0;
        for (const mm of seg.matchAll(/[.?!][”’"')]*(\s+)/g)) { const end = mm.index + mm[0].length - mm[1].length; cur += seg.slice(last, end); out.push(cur, mm[1]); cur = ''; last = mm.index + mm[0].length; }
        cur += seg.slice(last);
      }
      if (cur) out.push(cur);
      const sents = out.filter((x, i) => i % 2 === 0);
      if (!sents.length || !sents.every((x) => balanced(x))) return m;
      let si = -1;
      const body = out.map((x, i) => { if (i % 2) return x; si++; const k = `${pi}.${si}`; return `<span class="sn${on.has(k) ? ' on' : ''}"${live ? ` data-act="mark" data-k="${k}"` : ''}>${x}</span>`; }).join('');
      return `<p${attrs || ''}>${body}</p>`;
    });
  }
  function toggleMark(el) {
    const q = S.view === 'mock' && S.mock ? S.mock.items[S.mock.i].q : S.cur && S.cur.q; if (!q) return;
    const key = markKey(q); if (!MARKS.has(key)) MARKS.set(key, new Set());
    const set = MARKS.get(key), k = el.dataset.k;
    if (set.has(k)) set.delete(k); else set.add(k);
    el.classList.toggle('on', set.has(k));
    if (!S.settings.markSeen) { S.settings.markSeen = true; saveSettings(); }
    $$('.mark-hint').forEach((x) => x.remove());
  }
  function questionHTML(q, o) {
    const graded = o && o.graded;
    const opts = q.options.map((x, i) => {
      let cls = 'opt';
      if (!graded && o && o.choice === i) cls += ' sel';
      if (graded) { if (i === q.answer) cls += ' correct'; else if (i === o.choice) cls += ' miss'; else cls += ' dim'; }
      const off = !graded && struckOf(q).has(i);
      return `<li${off ? ' class="struck"' : ''}><button type="button" class="${cls}" data-i="${i}" ${graded ? 'tabindex="-1" aria-disabled="true"' : ''} aria-pressed="${!graded && o && o.choice === i ? 'true' : 'false'}"><span class="n" aria-hidden="true">${i + 1}</span><span class="x">${x}</span><span class="sr">${i + 1}번${graded && i === q.answer ? ' (정답)' : ''}${graded && i === o.choice && i !== q.answer ? ' (고른 답)' : ''}</span></button>${graded ? '' : `<button type="button" class="opt-x" data-act="strike" data-i="${i}" aria-pressed="${off ? 'true' : 'false'}" aria-label="${i + 1}번 선지 ${off ? '되살리기' : '지우기'}" title="소거법: 아닌 선지를 지워 둡니다">×</button>`}</li>`;
    }).join('');
    const tags = [`<span class="tag">${esc(SUBJ[q.subject].name)} · ${esc(typeShort(q.subject, q.type))}</span>`];
    if (o && o.review) tags.push('<span class="tag rev">복습</span>');
    if (q.exam) tags.push(`<span class="tag src">${esc(q.exam)}</span>`);
    if (q.p5) tags.push('<span class="tag p5" title="5급 공채 PSAT 실전·심화 수준으로 직접 출제한 정예 문항">5급 실전</span>');
    if (q.lv) tags.push(`<span class="tag">난이도 ${P.LEVELS[q.lv]}</span>`);
    if (q.set && q.setOf) tags.push(`<span class="tag">1지문 ${q.setOf}문항 · ${q.setNo}/${q.setOf}</span>`);
    const fold = !graded && !(o && o.review) && q.setNo > 1 && q.set && S.lastSetDone === q.set;   // 바로 앞에서 같은 지문의 문항을 풀었을 때만
    return `<div class="qhead">${tags.join('')}</div>
      <p class="stem"><span class="no">${o && o.no ? `${o.no}.` : ''}</span><span>${stemHTML(q.stem)}</span></p>
      <div class="body">${(q.body || []).map((b) => { const ph = b.t === 'passage' ? markPassage(blockHTML(b, q), q, !graded) : blockHTML(b, q); return fold && b.t === 'passage' ? `<details class="pass-fold"><summary>앞 문항과 같은 지문입니다 · 펼쳐 보기</summary>${ph}</details>` : graded && b.t === 'passage' && paraCount(b) >= 2 ? ph.replace('<div class="passage', '<div class="passage pnum') : ph; }).join('')}${!graded && !S.settings.markSeen && (q.body || []).some((b) => b.t === 'passage') ? '<p class="mark-hint">지문의 문장을 누르면 밑줄이 그어지고, 다시 누르면 지워집니다.</p>' : ''}</div>
      <ol class="opts${graded ? ' graded' : ''}" aria-label="선택지">${opts}</ol>`;
  }

  /* ---------------- shell ---------------- */
  const ICON = {
    notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/><path d="M9 8h6"/></svg>',
    stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20h16"/><path d="M7 16v-5"/><path d="M12 16V6"/><path d="M17 16v-8"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-6.5 8 6.5"/><path d="M6.5 9.5V19h11V9.5"/><path d="M10.2 19v-5h3.6v5"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  };
  const MARK = '<svg class="brand-mark" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#0A1426"/><g fill="#F5C46C"><path d="M1.6 8.6 L2.6 2.2 L6.6 5.2 Z"/><path d="M14.4 8.6 L13.4 2.2 L9.4 5.2 Z"/><ellipse cx="8" cy="9.7" rx="6.6" ry="4.9"/></g><g fill="#E5323B"><path transform="translate(5.2 9.6) scale(1.45)" d="M0 0.78 C-0.22 0.58 -1 0.18 -1 -0.28 C-1 -0.64 -0.76 -0.86 -0.5 -0.86 C-0.25 -0.86 -0.06 -0.7 0 -0.52 C0.06 -0.7 0.25 -0.86 0.5 -0.86 C0.76 -0.86 1 -0.64 1 -0.28 C1 0.18 0.22 0.58 0 0.78 Z"/><path transform="translate(10.8 9.6) scale(1.45)" d="M0 0.78 C-0.22 0.58 -1 0.18 -1 -0.28 C-1 -0.64 -0.76 -0.86 -0.5 -0.86 C-0.25 -0.86 -0.06 -0.7 0 -0.52 C0.06 -0.7 0.25 -0.86 0.5 -0.86 C0.76 -0.86 1 -0.64 1 -0.28 C1 0.18 0.22 0.58 0 0.78 Z"/></g></svg>'; // the heart cat's face (no Taegukgi inside 송공)
  function shell(crumb, inner, o = {}) {
    const nd = dueItems().length;
    const timer = o.timer ? `<span class="timer${S.settings.timer ? '' : ' hide'}" id="timer" aria-label="경과 시간">00:00</span>` : '';
    return `<header class="top"><div class="top-in">
        <button class="brand" data-act="home" aria-label="송공 처음 화면">${MARK}<span class="brand-name">송공</span></button>
        <div class="crumb">${crumb || ''}</div>
        <div class="tools">${timer}
          <button class="icon-btn lab" data-act="home" title="처음 화면 (풀던 문제는 기록하지 않고 나갑니다)">${ICON.home}<span>홈</span></button>
          <button class="icon-btn lab" data-act="notes" title="틀린 문제를 모아 다시 풉니다 (W)${nd ? ` · 오늘 복습 ${nd}문제` : ''}">${ICON.notes}<span>오답노트</span>${nd ? `<b class="nbadge" aria-label="오늘 복습 ${nd}문제">${nd > 99 ? '99+' : nd}</b>` : ''}</button>
          <button class="icon-btn lab" data-act="stats" title="과목·유형별 정답률, 약한 유형">${ICON.stats}<span>기록</span></button>
          <button class="icon-btn lab" data-act="settings" title="글자 크기, 시간, 백업">${ICON.gear}<span>설정</span></button>
          ${EMBED ? `<button class="icon-btn" data-act="close" title="닫기 (Esc)" aria-label="닫기">${ICON.close}</button>` : ''}
        </div></div></header>
      <main id="main">${inner}</main>`;
  }
  const app = () => $('#app');
  const WIDTH = { home: 'w-mid', types: 'w-mid', notes: 'w-mid', stats: 'w-mid', settings: 'w-mid', help: 'w-read', setup: 'w-read', setresult: 'w-mid', quiz: 'w-read', explain: 'w-wide', mock: 'w-wide', mockresult: 'w-mid', mocksetup: 'w-read' };
  function paint(html, view) {
    S.view = view;
    stopTimer();
    app().innerHTML = html;
    app().className = WIDTH[view] || 'w-mid';
    window.scrollTo(0, 0);
    const top = $('.top'); if (top) top.classList.toggle('scrolled', false);
    const m = $('#main'); if (m) m.focus({ preventScroll: true });
  }
  function applySettings() {
    const r = document.documentElement;
    if (S.settings.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', S.settings.theme);
    if (S.settings.size === 'm') r.removeAttribute('data-size'); else r.setAttribute('data-size', S.settings.size);
    if (S.settings.face === 'serif') r.removeAttribute('data-face'); else r.setAttribute('data-face', S.settings.face);
  }
  function saveSettings() { applySettings(); if (S.persistent) saveKV('settings'); else { try { localStorage.setItem('songgong.settings', JSON.stringify(S.settings)); } catch (e) { /* ignore */ } } }

  /* ---------------- views ---------------- */
  function viewHome() {
    const t = dayKey(), d = S.daily[t] || { n: 0, ok: 0, ms: 0 };
    const now = new Date();
    const due = dueItems();
    const cards = ORDER.map((k) => {
      const a = S.agg.subj[k] || { n: 0, ok: 0, ms: 0 };
      const dk = due.filter((it) => it.subj === k).length;
      const today = (d.s && d.s[k]) ? d.s[k].n : 0;
      return `<div class="subj" role="button" tabindex="0" data-act="start" data-subj="${k}" aria-label="${SUBJ[k].name} 풀기">
        <div class="subj-name">${SUBJ[k].name}</div>
        <div class="subj-meta">${a.n ? `누적 ${a.n.toLocaleString()}문항 · 정답률 ${pct(a.ok, a.n)}%` : SUBJ[k].hint}${today ? ` · 오늘 ${today}` : ''}</div>
        <div class="acc-bar" aria-hidden="true"><i style="width:${a.n ? pct(a.ok, a.n) : 0}%"></i></div>
        <div class="subj-foot">
          <span>${dk ? `<span class="due">복습 ${dk}</span>` : ''}</span>
          <span style="display:flex;gap:8px;align-items:center"><button class="subj-types" data-act="types" data-subj="${k}">유형별</button><span class="subj-go">풀기 ${ICON.arrow}</span></span>
        </div></div>`;
    }).join('');
    const resume = S.cur && S.cur.q && SUBJ[S.cur.q.subject] ? `<button class="item resume" data-act="resume"><span class="t1"><span class="tag rev">이어서 풀기</span>${esc(SUBJ[S.cur.q.subject].name)} · ${esc(typeShort(S.cur.q.subject, S.cur.q.type))}${S.cur.phase === 'x' ? ' · 해설 보는 중' : ''}</span><span class="t2">${esc(stemText(S.cur.q.stem))}</span></button>` : '';
    const nItems = Array.from(S.items.values()).filter((it) => SUBJ[it.subj] && (it.wrong > 0 || it.star)).length;
    const html = shell('', `
      <section class="hello">
        <h1>${now.getMonth() + 1}월 ${now.getDate()}일 ${WD[now.getDay()]}요일</h1>
        ${+S.settings.goal ? `<div class="goal" role="progressbar" aria-label="오늘 목표" aria-valuemin="0" aria-valuemax="${+S.settings.goal}" aria-valuenow="${Math.min(d.n, +S.settings.goal)}"><div class="goal-t"><span>오늘 목표 <b>${Math.min(d.n, +S.settings.goal)}</b> / ${+S.settings.goal}문항</span><span>${d.n >= +S.settings.goal ? '<b class="ok">달성</b>' : `${+S.settings.goal - d.n}문항 남음`}</span></div><div class="acc-bar"><i style="width:${Math.min(100, Math.round(d.n * 100 / +S.settings.goal))}%"></i></div></div>` : ''}
        <div class="today"><span>오늘 <b>${d.n}</b>문항</span><span>정답률 <b>${d.n ? pct(d.ok, d.n) + '%' : '–'}</b></span><span>연속 <b>${streak()}</b>일</span></div>
      </section>
      ${resume}
      <div class="subjects">${cards}</div>
      <div class="row-links">
        <button class="link-card" data-act="notes"><span class="t">오답노트 ${due.length ? `<span class="due">오늘 복습 ${due.length}</span>` : ''}</span><span class="s">${nItems ? `${nItems}문항 보관 중` : '틀린 문제가 자동으로 모입니다'}</span></button>
        <button class="link-card" data-act="mock"><span class="t">모의고사 ${S.mock && !S.mock.done ? '<span class="due">풀던 회차</span>' : ''}</span><span class="s">7급·5급 실제 형식, 답안지로 오가며</span></button>
        <button class="link-card" data-act="setup"><span class="t">실전 세트</span><span class="s">5~40문항을 시험 속도로</span></button>
        <button class="link-card" data-act="stats"><span class="t">기록</span><span class="s">과목·유형별 정답률과 시간</span></button>
        <button class="link-card" data-act="settings"><span class="t">설정 · 백업</span><span class="s">${S.persistent ? (S.meta.lastBackup ? `마지막 백업 ${md(dayKey(S.meta.lastBackup))}` : '백업 파일로 기록 보관') : '<b>기록이 저장되지 않는 환경</b>'}</span></button>
      </div>
      ${S.persistent ? '' : '<div class="notice"><b>이 브라우저에서는 기록이 저장되지 않습니다.</b> 비공개(시크릿) 창이거나 저장 공간이 막혀 있을 수 있습니다. 문제 풀이는 가능하지만 창을 닫으면 기록이 사라집니다.</div>'}
      <p class="notice">처음이라면 <button class="linkish" data-act="help">사용법</button>을 먼저 보세요.<span class="kbd-hint"> 숫자 키 <b>1~3</b>으로 과목을 바로 시작하고, 문제에서는 <b>1~5</b>로 고른 뒤 <b>Enter</b>로 채점합니다. ${EMBED ? '<b>Esc</b>를 누르면 바로 닫힙니다(풀던 문제는 그대로 남습니다).' : ''}</span><span class="touch-hint"> 과목 카드를 누르면 바로 한 문제가 나오고, 선택지를 누른 뒤 <b>정답 확인</b>을 누르면 채점과 해설이 나옵니다. 풀던 문제는 창을 닫아도 그대로 남습니다.</span></p>`);
    paint(html, 'home');
  }

  function viewTypes(subj) {
    const rows = typesOf(subj).map((t) => {
      const a = S.agg.type[subj + '|' + t] || { n: 0, ok: 0, ms: 0 };
      const left = bankLeft(subj, t), gen = (P.gens[subj] || []).some((g) => g.label === t);
      return `<tr><td>${esc(typeShort(subj, t))}<div class="subj-meta">${gen ? '무제한 생성' : `직접 출제 · 남은 ${left}문항`}</div></td><td>${a.n}</td><td>${a.n ? pct(a.ok, a.n) + '%' : '–'}</td><td>${a.n ? human(a.ms / a.n) : '–'}</td><td><button class="btn sm" data-act="start" data-subj="${subj}" data-type="${esc(t)}" ${!gen && !left ? 'disabled' : ''}>풀기</button></td></tr>`;
    }).join('');
    paint(shell(`<b>${SUBJ[subj].name}</b> · 유형별`, `
      <div class="page-h"><h1>${SUBJ[subj].name} 유형별 연습</h1><span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-act="start" data-subj="${subj}" data-p5="1" ${bankLeft(subj, '', true) ? '' : 'disabled'} title="5급 공채 PSAT 실전·심화 수준으로 직접 출제한 정예 문항만 냅니다">5급 실전 정예만 · 남은 ${bankLeft(subj, '', true)}</button><button class="btn primary sm" data-act="start" data-subj="${subj}">모든 유형 섞어 풀기</button></span></div>
      <div class="card"><table class="st"><thead><tr><th>유형</th><th>풀이</th><th>정답률</th><th>평균 시간</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`), 'types');
  }

  /* ----- quiz ----- */
  let tick = 0, lastT = 0, saveTick = 0;
  function startTimer() {
    stopTimer(); lastT = performance.now();
    tick = setInterval(() => {
      const now = performance.now();
      if (!document.hidden && S.cur && S.cur.phase === 'q') {
        S.cur.ms += now - lastT;
        if (S.set && !S.set.done && S.cur.ctx && S.cur.ctx.mode === 'set') { S.set.usedMs += now - lastT; if (S.set.usedMs >= S.set.limitMs) { lastT = now; finishSet(true); return; } }
      }
      lastT = now; drawTimer();
      if (++saveTick % 20 === 0) saveCur();
    }, 250);
    drawTimer();
  }
  function stopTimer() { if (tick) clearInterval(tick); tick = 0; }
  function drawTimer() {
    const el = $('#timer'); if (!el || !S.cur) return;
    if (S.set && !S.set.done && S.cur.ctx && S.cur.ctx.mode === 'set') {
      const left = Math.max(0, S.set.limitMs - S.set.usedMs);
      el.textContent = '남은 ' + clock(left); el.classList.toggle('over', left < 60000); el.classList.toggle('paused', document.hidden); return;
    }
    el.textContent = clock(S.cur.ms);
    el.classList.toggle('over', S.cur.ms / 1000 > paceOf(S.cur.q));
    el.classList.toggle('paused', document.hidden);
  }
  function startSession(ctx) {
    S.ctx = ctx;
    const got = nextQuestion(ctx);
    if (!got) {
      if (ctx.mode === 'review') { toast('오늘 복습할 문제를 모두 풀었습니다.'); viewNotes(); }
      else { toast(ctx.p5 ? '5급 실전 정예 문항을 모두 풀었습니다. 새 문항이 계속 추가됩니다.' : '이 유형에서 더 낼 문제가 없습니다.'); viewTypes(ctx.subj); }
      return;
    }
    const d = S.daily[dayKey()];
    let no;
    if (ctx.mode === 'set' && S.set) { if (got.no) no = got.no; else { S.set.drawn = (S.set.drawn || S.set.results.length + (S.set.later || []).length) + 1; no = S.set.drawn; saveSet(); } }
    else no = ((d && d.s && d.s[got.q.subject]) ? d.s[got.q.subject].n : 0) + 1;
    S.cur = { q: got.q, ctx, phase: 'q', choice: got.choice == null ? null : got.choice, ms: got.ms || 0, ok: null, review: !!got.review, no, deferred: !!got.deferred };
    saveCur();
    viewQuiz();
  }
  // 계산 메모: 폰에는 시험지 여백이 없으므로 문항마다 메모 칸을 둔다(이 기기, 이번 사용 동안만 기억). 채점 뒤 해설 위에 다시 보여 준다.
  const SCRATCH = new Map();
  // 연습 풀이와 모의고사가 같은 메모 칸을 쓴다(모의고사는 채점 뒤 문항별 해설에서 다시 보인다).
  const scratchHTML = (q) => `<details class="scratch"${SCRATCH.get(q.id) ? ' open' : ''}><summary>계산 메모 <span class="m">시험지 여백처럼 쓰는 곳 · 채점 뒤 해설에서 다시 보입니다</span></summary><label class="sr" for="scratch">계산 메모</label><textarea id="scratch" rows="4" placeholder="예: 60 × 1.5 = 90, (가) = 1,800 ÷ 75 …" autocomplete="off" spellcheck="false">${esc(SCRATCH.get(q.id) || '')}</textarea></details>`;
  function viewQuiz() {
    const c = S.cur, q = c.q;
    const inSet = c.ctx && c.ctx.mode === 'set' && S.set && !S.set.done, later = inSet ? (S.set.later || []).length : 0;
    const canLater = inSet && (S.set.results.length + later + 1 < S.set.n || later > 0);
    const crumb = inSet ? `<span class="crumb-x"><b>실전 세트</b> · ${SUBJ[q.subject].name} · </span>푼 문항 <b>${S.set.results.length}/${S.set.n}</b>${later ? ` · 넘긴 ${later}` : ''}${c.deferred ? ' · <b>넘겼던 문항</b>' : ''}` : `<b>${SUBJ[q.subject].name}</b>${c.ctx && c.ctx.type ? ` · ${esc(typeShort(q.subject, c.ctx.type))}` : ''}${c.ctx && c.ctx.mode === 'review' ? ' · 복습' : ''}${c.ctx && c.ctx.p5 ? ' · 5급 실전 정예' : ''}`;
    paint(shell(crumb, `
      <article class="sheet fade-in" aria-label="문제">${questionHTML(q, { choice: c.choice, no: c.no, review: c.review })}</article>
      ${scratchHTML(q)}
      <div class="actions">
        <button class="btn ghost" data-act="home" title="기록하지 않고 처음 화면으로 나갑니다">나가기</button>
        ${canLater ? '<button class="btn ghost" data-act="later" title="이 문항을 넘기고, 남은 문항을 다 푼 뒤에 다시 풉니다(쓴 시간과 고른 답은 그대로) · 단축키 L">넘기기</button>' : ''}
        <button class="btn ghost" data-act="skip" title="${inSet ? '모른다고 표시하고 다음 문항으로 (오답으로 기록)' : '해설 바로 보기 (오답으로 기록)'}">모르겠음</button>
        <button class="btn primary grow" data-act="submit" ${c.choice == null ? 'disabled' : ''}>정답 확인 <span class="kbd">Enter</span></button>
      </div>`, { timer: true }), 'quiz');
    startTimer();
  }
  function choose(i) {
    if (!S.cur || S.cur.phase !== 'q') return;
    S.cur.choice = i;
    $$('.opt').forEach((b) => { const on = +b.dataset.i === i; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    const s = $('[data-act="submit"]'); if (s) s.disabled = false;
    saveCur();
  }
  /* one answer into the record: statistics, seen, level, 오답노트(복습 일정) */
  function recordAnswer(q, choice, ms, mode, isReview) {
    const ok = choice === q.answer, at = Date.now();
    S.lastSetDone = q.set || null;   // 방금 푼 문항의 지문 묶음: 같은 지문의 다음 문항에서 지문을 접어 둔다
    const e = { qid: q.id, h: seenKey(q), subj: q.subject, type: q.type, ok, choice, ans: q.answer, ms: Math.round(ms), at, mode };
    addToStats(e);
    S.seen.add(e.h);
    let lvMsg = '';
    if (q.src === 'gen' && q.lv && S.settings.level === 'auto' && !isReview) {
      const key = q.subject + '|' + q.type, st = S.lv[key] || (S.lv[key] = { lv: 2, recent: [] });
      st.recent.push(ok); if (st.recent.length > 6) st.recent.shift();
      const good = st.recent.filter(Boolean).length;
      if (st.recent.length >= 5 && good >= 5 && st.lv < 3) { st.lv++; st.recent = []; lvMsg = `이 유형의 난이도를 ‘${P.LEVELS[st.lv]}’${P.pp(P.LEVELS[st.lv], '으로/로')} 올립니다.`; }
      else if (st.recent.length >= 5 && good <= 2 && st.lv > 1) { st.lv--; st.recent = []; lvMsg = `이 유형의 난이도를 ‘${P.LEVELS[st.lv]}’${P.pp(P.LEVELS[st.lv], '으로/로')} 낮춥니다.`; }
    }
    let rec = S.items.get(q.id);
    if (rec || !ok) {
      rec = rec || { qid: q.id, subj: q.subject, type: q.type, addedAt: at, wrong: 0, right: 0, box: 0, due: null, star: false, memo: '', flag: '' };
      rec.q = q; rec.lastAt = at; rec.lastOk = ok; rec.lastChoice = choice;
      if (ok) rec.right++; else rec.wrong++;
      if (rec.wrong > 0) srUpdate(rec, ok);
      S.items.set(q.id, rec);
    }
    if (S.persistent) {
      persist(async () => {
        await DB.add('log', e);
        await DB.put('seen', at, e.h);
        if (rec) await DB.put('items', rec);
        await DB.put('kv', S.agg, 'agg');
        await DB.put('kv', S.daily, 'daily');
        await DB.put('kv', S.lv, 'lv');
      });
    }
    return { ok, lvMsg };
  }
  function submit(skip) {
    const c = S.cur; if (!c || c.phase !== 'q') return;
    if (!skip && c.choice == null) return;
    if (skip) c.choice = -1;
    stopTimer();
    const q = c.q;
    const { ok, lvMsg } = recordAnswer(q, c.choice, c.ms, c.review ? 'review' : (c.ctx && c.ctx.mode === 'note' ? 'note' : 'new'), c.review);
    c.ok = ok; c.phase = 'x'; c.lvMsg = lvMsg;
    saveCur();
    if (c.ctx && c.ctx.mode === 'set' && S.set && !S.set.done) {
      S.set.results.push({ q, choice: c.choice, ok, ms: Math.round(c.ms), no: c.no, deferred: !!c.deferred }); saveSet();
      if (S.set.results.length >= S.set.n) { finishSet(false); return; }
      startSession(c.ctx); return;
    }
    viewExplain();
  }
  function verdictSVG(ok) {
    return ok
      ? '<svg class="mark" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="17" style="stroke-dasharray:110;stroke-dashoffset:0"/></svg>'
      : '<svg class="mark" viewBox="0 0 48 48" aria-hidden="true"><path d="M13 37 L35 11"/></svg>';
  }
  function viewExplain() {
    const c = S.cur, q = c.q, rec = S.items.get(q.id);
    const wide = window.matchMedia('(min-width: 1180px)').matches;
    const chosen = c.choice >= 0 ? `고른 답 <b>${c.choice + 1}번</b> · ` : '';
    const title = c.choice < 0 ? '해설을 먼저 봤습니다' : c.ok ? '정답입니다' : '오답입니다';
    const sub = `${chosen}정답 <b>${q.answer + 1}번</b> · ${human(c.ms)}${c.ms / 1000 > paceOf(q) ? ` (권장 ${human(paceOf(q) * 1000)})` : ''}${!c.ok ? ` · 오답노트에 담았습니다${rec && rec.due ? `(${md(rec.due)} 복습)` : ''}` : rec && rec.box ? (rec.done ? ' · 오답노트 졸업' : rec.due ? ` · 다음 복습 ${md(rec.due)}` : '') : ''}`;
    const src = q.exam ? `출처 <b>${esc(q.exam)}</b>` : q.src === 'bank' ? '출처 <b>송공 출제</b> · 기출의 발문·선지 양식을 본뜬 창작 문항' : '출처 <b>송공 생성</b> · 조건과 정답을 프로그램이 계산하고 검증한 문항';
    const crumb = `<b>${SUBJ[q.subject].name}</b> · 해설`;
    paint(shell(crumb, `
      <div class="${wide ? '' : 'narrow'}">
      <section class="verdict fade-in">${verdictSVG(c.ok)}<div><h2>${title}</h2><p>${sub}</p>${c.lvMsg ? `<p class="lvmsg">${esc(c.lvMsg)}</p>` : ''}</div></section>
      <div class="exp-layout${wide ? ' two' : ''}">
        <div class="qcol"><details class="reshow"${wide ? ' open' : ''}><summary>문제 다시 보기</summary><div class="sheet">${questionHTML(q, { graded: true, choice: c.choice, no: c.no, review: c.review })}</div></details></div>
        <div class="exp"><article class="sheet">
          ${SCRATCH.get(q.id) ? `<details class="scratch-x" open><summary>풀 때 쓴 계산 메모</summary><pre>${esc(SCRATCH.get(q.id))}</pre></details>` : ''}
          <h3>해설</h3>
          <div class="exp-body">${paraLinks((q.explain || []).map((b) => blockHTML(b, q, c.choice)).join(''), q)}</div>
          <div class="src-line">${src}<br><span style="font-size:.75rem">문항 번호 ${esc(q.id)}</span></div>
          ${!c.ok ? `<div class="cause-row"><span class="subj-meta">틀린 이유</span>${CAUSES.map((x) => `<button class="chip${rec && rec.cause === x ? ' on' : ''}" data-act="cause" data-v="${x}">${x}</button>`).join('')}</div>` : ''}
          <div class="tools-row">
            <button class="btn sm${rec && rec.star ? ' on' : ''}" data-act="star" aria-pressed="${rec && rec.star ? 'true' : 'false'}">★ 중요 <span class="kbd">S</span></button>
            <button class="btn sm${rec && rec.memo ? ' on' : ''}" data-act="memo">메모 <span class="kbd">M</span></button>
            <button class="btn sm${rec && rec.flag ? ' on' : ''}" data-act="flag">이상한 점 알리기</button>
            <button class="btn sm" data-act="hide-q" title="이 문제를 다시는 내지 않습니다. 설정에서 되살릴 수 있습니다">이 문제 지우기</button>
            ${c.ctx && ['new', 'review', 'note', 'setreview', 'mockreview'].includes(c.ctx.mode) && !(c.ctx.once) ? `<button class="btn sm${c.ok ? '' : ' primary'}" data-act="same-type" title="이 유형의 새 문제를 한 문제 더 풀고, 끝나면 하던 곳으로 돌아갑니다">같은 유형 한 문제 더 <span class="kbd">T</span></button>` : ''}
          </div>
          <div class="memo-wrap hide" style="margin-top:10px"><label class="sr" for="memo">메모</label><textarea id="memo" class="memo" placeholder="풀이 요령, 실수한 이유 등을 적어 두세요. 오답노트에 함께 보관됩니다.">${esc(rec ? rec.memo : '')}</textarea></div>
          <div class="flag-wrap hide" style="margin-top:10px"><label class="sr" for="flag">알릴 내용</label><textarea id="flag" class="memo" placeholder="문제·정답·해설에서 이상한 점을 적어 주세요. 기록 화면에서 모아 볼 수 있습니다.">${esc(rec ? rec.flag : '')}</textarea></div>
        </article></div>
      </div>
      </div>
      <div class="actions ${wide ? '' : 'narrow'}">
        <button class="btn" data-act="home">그만 풀기</button>
        <button class="btn primary grow" data-act="next">${c.ctx && c.ctx.mode === 'note' ? '오답노트로' : c.ctx && c.ctx.mode === 'setreview' ? '세트 결과로' : c.ctx && c.ctx.mode === 'mockreview' ? '모의고사 결과로' : '다음 문제'} <span class="kbd">Enter</span></button>
      </div>`), 'explain');
  }
  function ensureRec(q) {
    let rec = S.items.get(q.id);
    if (!rec) { rec = { qid: q.id, subj: q.subject, type: q.type, addedAt: Date.now(), lastAt: Date.now(), wrong: 0, right: 0, box: 0, due: null, star: false, memo: '', flag: '', q }; S.items.set(q.id, rec); }
    return rec;
  }
  const putRec = (rec) => { if (S.persistent) persist(() => DB.put('items', rec)); };
  function toggleStar() {
    if (!S.cur) return;
    const rec = ensureRec(S.cur.q); rec.star = !rec.star; putRec(rec);
    const b = $('[data-act="star"]'); if (b) { b.classList.toggle('on', rec.star); b.setAttribute('aria-pressed', rec.star ? 'true' : 'false'); }
    toast(rec.star ? '중요 문제로 표시했습니다.' : '중요 표시를 해제했습니다.');
  }
  /* 해설을 본 뒤 같은 유형의 새 문제를 하나 더: 끝나면 하던 곳(과목 풀이·오답노트·세트 결과 등)으로 돌아간다 */
  function sameType() {
    const c = S.cur; if (!c || c.phase !== 'x') return;
    const back = c.ctx || { subj: c.q.subject, mode: 'new' };
    startSession({ subj: c.q.subject, type: c.q.type, mode: 'new', once: back });
  }
  function next() {
    if (!S.cur) { viewHome(); return; }
    const ctx = S.cur.ctx || { subj: S.cur.q.subject, mode: 'new' };
    if (ctx.once) { const o = ctx.once; S.cur.ctx = o; if (['note', 'setreview', 'mockreview'].includes(o.mode)) { next(); return; } startSession(o); return; }
    if (ctx.mode === 'note') { S.cur = null; saveCur(); viewNotes(); return; }
    if (ctx.mode === 'setreview') { S.cur = null; saveCur(); viewSetResult(); return; }
    if (ctx.mode === 'mockreview') { S.cur = null; saveCur(); viewMockResult(); return; }
    startSession(ctx);
  }


  /* ================= 모의고사: 실제 시험 형식의 한 회분, 답안지로 오가며 풀고 한꺼번에 채점 ================= */
  const MOCK_KEY = 'songgong.mock';
  const MOCKS = {
    p5l: { name: '5급 PSAT 언어논리', note: '40문항 · 90분', parts: [['lang', 40]], min: 90 },
    p5d: { name: '5급 PSAT 자료해석', note: '40문항 · 90분', parts: [['data', 40]], min: 90 },
    p5s: { name: '5급 PSAT 상황판단', note: '40문항 · 90분', parts: [['sit', 40]], min: 90 },
    h5l: { name: '5급 언어논리 하프', note: '20문항 · 45분 (점심·쉬는 시간용, 시험과 같은 속도)', parts: [['lang', 20]], min: 45 },
    h5d: { name: '5급 자료해석 하프', note: '20문항 · 45분 (점심·쉬는 시간용, 시험과 같은 속도)', parts: [['data', 20]], min: 45 },
    h5s: { name: '5급 상황판단 하프', note: '20문항 · 45분 (점심·쉬는 시간용, 시험과 같은 속도)', parts: [['sit', 20]], min: 45 },
    p7a: { name: '7급 PSAT 1교시', note: '언어논리 25문항 · 상황판단 25문항 · 120분', parts: [['lang', 25], ['sit', 25]], min: 120 },
    p7b: { name: '7급 PSAT 2교시', note: '자료해석 25문항 · 60분', parts: [['data', 25]], min: 60 },
  };
  function saveMock() { try { if (S.mock) localStorage.setItem(MOCK_KEY, JSON.stringify(S.mock)); else localStorage.removeItem(MOCK_KEY); } catch (e) { /* ignore */ } }
  function loadMock() { try { const v = localStorage.getItem(MOCK_KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function composeMock(kind) {
    const items = [];
    for (const [subj, n] of MOCKS[kind].parts) {
      const qs = [], keys = new Set();
      for (const id of planSet(subj, n)) { const q = (P.bank[subj] || []).find((x) => x.id === id); if (q && qs.length < n) { const c = bankCopy(q, subj); qs.push(c); keys.add(seenKey(c)); } }
      for (let guard = 0; qs.length < n && guard < 400; guard++) { const g = fromGenerator(subj, ''); if (g && !keys.has(seenKey(g)) && !isHidden(seenKey(g))) { keys.add(seenKey(g)); qs.push(g); } }
      qs.forEach((q) => items.push({ q, subj, choice: null, flag: false, ms: 0 }));
    }
    return items;
  }
  function startMock(kind) {
    const items = composeMock(kind);
    if (!items.length) { toast('낼 문항이 없습니다.'); return; }
    S.mock = { kind, items, i: 0, usedMs: 0, limitMs: MOCKS[kind].min * 60000, at: Date.now(), done: false };
    saveMock(); viewMock();
  }
  const mockAnswered = (m) => m.items.filter((x) => x.choice != null).length;
  function omrHTML(m) {
    let html = `<div class="omr-h"><b>답안지</b><span>${mockAnswered(m)}/${m.items.length} 답함</span><button class="btn ghost sm omr-close" data-act="mk-sheet">닫기</button></div>`, last = '';
    m.items.forEach((x, k) => {
      if (x.subj !== last) { if (last) html += '</div>'; html += `<div class="omr-sub">${SUBJ[x.subj].name}</div><div class="omr-grid">`; last = x.subj; }
      html += `<button class="omr-c${k === m.i ? ' cur' : ''}${x.choice != null ? ' ans' : ''}${x.flag ? ' flag' : ''}" data-act="mk-go" data-i="${k}" aria-label="${k + 1}번${x.choice != null ? `, ${x.choice + 1}번 고름` : ', 안 품'}${x.flag ? ', 체크' : ''}"><span class="n">${k + 1}</span><span class="a">${x.choice != null ? '①②③④⑤'[x.choice] : ''}</span></button>`;
    });
    return html + '</div><button class="btn primary omr-submit" data-act="mk-submit">답안 제출</button><p class="omr-note">답을 고르면 답안지에 표시됩니다. 제출 전까지 언제든 바꿀 수 있고, 같은 답을 한 번 더 누르면 지워집니다. 빨간 점은 체크한 문항입니다.<span class="kbd-hint"><br>1~5 답 · ←/→ 이동 · F 체크</span></p>';
  }
  function viewMock() {
    const m = S.mock; if (!m) { viewMockSetup(); return; }
    if (m.done) { viewMockResult(); return; }
    const it = m.items[m.i], total = m.items.length;
    const crumb = `<span class="crumb-x"><b>모의고사</b> · ${MOCKS[m.kind].name} · </span><b>${SUBJ[it.subj].name}</b> ${m.i + 1}/${total}`;   // 좁은 화면에서는 과목과 문항 번호만
    paint(shell(crumb, `<div class="mock">
      <div class="mock-q"><article class="sheet fade-in" aria-label="문제">${questionHTML(it.q, { choice: it.choice, no: m.i + 1 })}</article>
        ${scratchHTML(it.q)}
        <div class="actions">
          <button class="btn ghost" data-act="mk-prev" ${m.i === 0 ? 'disabled' : ''} aria-label="이전 문항">‹ 이전</button>
          <button class="btn ghost${it.flag ? ' on' : ''}" data-act="mk-flag" aria-pressed="${it.flag ? 'true' : 'false'}" title="다시 볼 문항으로 표시 (F)">${it.flag ? '체크 해제' : '체크'}</button>
          <button class="btn ghost mk-sheet" data-act="mk-sheet">답안지 ${mockAnswered(m)}/${total}</button>
          ${m.i < total - 1 ? '<button class="btn primary grow" data-act="mk-next">다음 ›</button>' : '<button class="btn primary grow" data-act="mk-submit">답안 제출</button>'}
        </div></div>
      <aside class="omr" id="omr" aria-label="답안지">${omrHTML(m)}</aside></div>`, { timer: true }), 'mock');
    startMockTimer();
  }
  let mockTick = 0, mockLast = 0, mockSave = 0;
  function startMockTimer() {
    stopMockTimer(); mockLast = performance.now();
    mockTick = setInterval(() => {
      const now = performance.now(), m = S.mock;
      if (!m || m.done || S.view !== 'mock') { stopMockTimer(); return; }
      if (!document.hidden) { const dt = now - mockLast; m.usedMs += dt; m.items[m.i].ms += dt; if (m.usedMs >= m.limitMs) { mockLast = now; finishMock(true); return; } }
      mockLast = now; drawMockTimer();
      if (++mockSave % 20 === 0) saveMock();
    }, 250);
    drawMockTimer();
  }
  function stopMockTimer() { if (mockTick) clearInterval(mockTick); mockTick = 0; }
  function drawMockTimer() {
    const el = $('#timer'), m = S.mock; if (!el || !m) return;
    const left = Math.max(0, m.limitMs - m.usedMs);
    el.classList.remove('hide'); el.textContent = '남은 ' + clock(left); el.classList.toggle('over', left < 5 * 60000); el.classList.toggle('paused', document.hidden);
  }
  function mockGo(k) { const m = S.mock; if (!m || m.done || k < 0 || k >= m.items.length) return; m.i = k; saveMock(); viewMock(); const o = $('#omr'); if (o) o.classList.remove('open'); }
  function mockChoose(i) {
    const m = S.mock; if (!m || m.done) return;
    const it = m.items[m.i]; it.choice = it.choice === i ? null : i; saveMock();
    $$('.opt').forEach((b) => { const on = +b.dataset.i === it.choice; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    const o = $('#omr'); if (o) { const open = o.classList.contains('open'); o.innerHTML = omrHTML(m); o.classList.toggle('open', open); }
    const sb = $('.mk-sheet'); if (sb) sb.textContent = `답안지 ${mockAnswered(m)}/${m.items.length}`;
  }
  function mockFlag() { const m = S.mock; if (!m || m.done) return; const it = m.items[m.i]; it.flag = !it.flag; saveMock(); viewMock(); }
  function mockSubmitAsk() {
    const m = S.mock; if (!m || m.done) return;
    const blank = m.items.length - mockAnswered(m), flags = m.items.filter((x) => x.flag).length;
    const msg = `${blank ? `안 푼 문항 ${blank}개` : '모든 문항에 답했습니다'}${flags ? `, 체크한 문항 ${flags}개` : ''}. 남은 시간 ${clock(Math.max(0, m.limitMs - m.usedMs))}. 답안을 제출하고 채점할까요?`;
    if (window.confirm(msg)) finishMock(false);
  }
  function finishMock(timeUp) {
    const m = S.mock; if (!m || m.done) return;
    stopMockTimer();
    m.done = true; m.timeUp = !!timeUp; m.end = Date.now();
    for (const it of m.items) { const r = recordAnswer(it.q, it.choice == null ? -1 : it.choice, it.ms, 'mock', false); it.ok = r.ok; }
    const per = {}; for (const it of m.items) { const a = per[it.subj] || (per[it.subj] = { n: 0, ok: 0 }); a.n++; if (it.ok) a.ok++; }
    (S.meta.mocks = S.meta.mocks || []).push({ at: m.at, end: m.end, kind: m.kind, per, usedMs: Math.round(Math.min(m.usedMs, m.limitMs)), limitMs: m.limitMs, timeUp: !!timeUp, blank: m.items.filter((x) => x.choice == null).length });
    S.meta.mocks = S.meta.mocks.slice(-200); saveKV('meta'); saveMock();
    if (timeUp) toast('시험 시간이 끝나 답안을 제출했습니다.');
    viewMockResult();
  }
  const score100 = (ok, n) => (n ? Math.round((ok / n) * 1000) / 10 : 0);
  function viewMockResult() {
    const m = S.mock; if (!m || !m.done) { viewMockSetup(); return; }
    const subs = [...new Set(m.items.map((x) => x.subj))];
    const stat = (xs) => ({ n: xs.length, ok: xs.filter((x) => x.ok).length });
    const tot = stat(m.items), pace = (x) => paceOf(x.q) * 1000;
    const slow = m.items.filter((x) => x.ms > pace(x)), luck = m.items.filter((x) => x.flag && x.ok), blank = m.items.filter((x) => x.choice == null);
    const types = {}; m.items.forEach((x) => { const k = x.subj + '|' + x.q.type; const a = types[k] || (types[k] = { subj: x.subj, type: x.q.type, n: 0, ok: 0, ms: 0 }); a.n++; a.ms += x.ms; if (x.ok) a.ok++; });
    const typeRows = Object.values(types).sort((a, b) => a.ok / a.n - b.ok / b.n).map((a) => `<tr><td>${SUBJ[a.subj].name} · ${esc(typeShort(a.subj, a.type))}</td><td>${a.ok}/${a.n}</td><td>${pct(a.ok, a.n)}%</td><td>${human(a.ms / a.n)}</td></tr>`).join('');
    const rows = m.items.map((x, k) => `<tr class="${x.ok ? '' : 'wrong'}"><td>${k + 1}${x.flag ? ' <small class="tag">체크</small>' : ''}</td><td>${esc(typeShort(x.subj, x.q.type))}</td><td>${x.choice == null ? '–' : x.choice + 1}</td><td>${x.q.answer + 1}</td><td>${x.ok ? '<b style="color:var(--ok)">○</b>' : '<b style="color:var(--pen)">×</b>'}</td><td class="${x.ms > pace(x) ? 'slowt' : ''}">${human(x.ms)}</td><td><button class="btn sm" data-act="mk-review" data-i="${k}">해설</button></td></tr>`).join('');
    const hist = (S.meta.mocks || []).filter((x) => x.kind === m.kind);
    const histHTML = hist.length > 1 ? `<div class="card"><h2>같은 시험의 지난 기록</h2><table class="st"><thead><tr><th>날짜</th>${subs.map((k) => `<th>${SUBJ[k].name}</th>`).join('')}<th>시간</th></tr></thead><tbody>${hist.slice(-8).reverse().map((h) => `<tr><td>${md(dayKey(h.at))}</td>${subs.map((k) => `<td>${h.per[k] ? score100(h.per[k].ok, h.per[k].n) + '점' : '–'}</td>`).join('')}<td>${human(h.usedMs)}${h.timeUp ? ' <small class="tag">시간 종료</small>' : ''}</td></tr>`).join('')}</tbody></table></div>` : '';
    paint(shell('<b>모의고사</b> · 결과', `
      <div class="page-h"><h1>${MOCKS[m.kind].name} 결과</h1><button class="btn primary sm" data-act="mock">새 모의고사</button></div>
      <div class="stat-grid">
        ${subs.map((k) => { const a = stat(m.items.filter((x) => x.subj === k)); return `<div class="stat"><div class="k">${SUBJ[k].name}</div><div class="v">${score100(a.ok, a.n)}<small>점 · ${a.ok}/${a.n}</small></div></div>`; }).join('')}
        ${subs.length > 1 ? `<div class="stat"><div class="k">평균</div><div class="v">${score100(tot.ok, tot.n)}<small>점</small></div></div>` : ''}
        <div class="stat"><div class="k">쓴 시간</div><div class="v" style="font-size:1.125rem">${human(Math.min(m.usedMs, m.limitMs))}<small> / ${human(m.limitMs)}</small></div></div>
      </div>
      <p class="notice">점수는 문항마다 같은 배점(100점 만점)으로 환산했습니다.${blank.length ? ` 안 푼 문항 ${blank.length}개는 오답으로 셉니다.` : ''}${m.timeUp ? ' 시험 시간이 끝나 자동으로 제출했습니다.' : ''}</p>
      <div class="card"><h2>다시 볼 문항</h2><ul class="mk-list">
        <li><b>체크했는데 맞힌 문항 ${luck.length}개</b> — 확신 없이 맞힌 문항입니다. 해설로 근거를 확인하세요.${luck.length ? ` ${luck.map((x) => `<button class="linkish" data-act="mk-review" data-i="${m.items.indexOf(x)}">${m.items.indexOf(x) + 1}번</button>`).join(' ')}` : ''}</li>
        <li><b>권장 시간을 넘긴 문항 ${slow.length}개</b> (그중 오답 ${slow.filter((x) => !x.ok).length}개) — 시험장에서는 넘기고 돌아올 문항입니다.${slow.length ? ` ${slow.map((x) => `<button class="linkish" data-act="mk-review" data-i="${m.items.indexOf(x)}">${m.items.indexOf(x) + 1}번</button>`).join(' ')}` : ''}</li>
        <li><b>틀린 문항 ${tot.n - tot.ok}개</b>는 오답노트에 담겼고 1일 뒤부터 복습에 나옵니다.</li></ul></div>
      <div class="card"><h2>유형별</h2><table class="st"><thead><tr><th>유형</th><th>맞힘</th><th>정답률</th><th>평균 시간</th></tr></thead><tbody>${typeRows}</tbody></table></div>
      <div class="card"><h2>문항별</h2><table class="st mk-rows"><thead><tr><th>문항</th><th>유형</th><th>내 답</th><th>정답</th><th></th><th>시간</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      ${histHTML}`), 'mockresult');
  }
  function reviewMockItem(k) {
    const x = S.mock && S.mock.items[k]; if (!x) return;
    S.cur = { q: x.q, ctx: { subj: x.subj, mode: 'mockreview' }, phase: 'x', choice: x.choice == null ? -1 : x.choice, ms: x.ms, ok: x.ok, review: false, no: k + 1 };
    viewExplain();
  }
  function viewMockSetup() {
    const going = S.mock && !S.mock.done;
    const left = (subj) => (P.bank[subj] || []).filter((q) => !S.seen.has('id:' + q.id) && !isHidden('id:' + q.id)).length;
    const cards = Object.entries(MOCKS).map(([k, x]) => `<button class="item mk-kind" data-act="mk-start" data-k="${k}"><span class="t1"><b>${x.name}</b></span><span class="t2">${x.note}</span><span class="t2 sub">${x.parts.map(([s2]) => `${SUBJ[s2].name} 송공 출제 문항 중 아직 안 푼 것 ${left(s2)}개`).join(' · ')}</span></button>`).join('');
    const hist = (S.meta.mocks || []).slice(-10).reverse();
    paint(shell('<b>모의고사</b>', `
      <div class="page-h"><h1>모의고사</h1></div>
      ${going ? `<div class="card mk-going"><b>풀던 모의고사가 있습니다</b> · ${MOCKS[S.mock.kind].name} · ${mockAnswered(S.mock)}/${S.mock.items.length}문항 답함 · 남은 시간 ${clock(Math.max(0, S.mock.limitMs - S.mock.usedMs))}<div class="actions" style="margin-top:10px"><button class="btn primary" data-act="mk-resume">이어서 풀기</button><button class="btn ghost" data-act="mk-quit">버리기</button></div></div>` : ''}
      <p class="prose">실제 시험과 같은 문항 수와 시간으로 한 회분을 풉니다. 화면을 끄거나 다른 앱으로 가면 시간이 멈추고, 나중에 그 자리에서 이어서 풉니다. 답안지에서 아무 문항으로나 오가고, 막히는 문항은 <b>체크</b>해 두었다가 돌아옵니다. 답은 제출하기 전까지 바꿀 수 있고, 제출하면 한꺼번에 채점합니다. 송공 출제 문항(난이도 기본 25%·실전 55%·심화 20%, 유형 고르게)을 먼저 쓰고, 모자라면 생성 문항으로 채웁니다.</p>
      <div class="mk-kinds">${cards}</div>
      ${hist.length ? `<div class="card" style="margin-top:12px"><h2>모의고사 기록</h2><table class="st"><thead><tr><th>날짜</th><th>시험</th><th>점수</th><th>시간</th></tr></thead><tbody>${hist.map((h) => `<tr><td>${md(dayKey(h.at))}</td><td>${MOCKS[h.kind] ? MOCKS[h.kind].name : h.kind}</td><td>${Object.entries(h.per).map(([k, a]) => `${SUBJ[k] ? SUBJ[k].name : k} ${score100(a.ok, a.n)}`).join(' · ')}</td><td>${human(h.usedMs)}</td></tr>`).join('')}</tbody></table></div>` : ''}`), 'mocksetup');
  }

  /* ----- 실전 세트 ----- */
  let setPick = { subj: 'lang', n: 10, focus: 'even' };
  /* 약한 유형: 3문항 이상 푼 유형 가운데 정답률이 60% 미만이거나 과목 평균보다 10%p 이상 낮은 것(기록 화면의 약점 분석과 같은 기준) */
  function weakTypesOf(subj) {
    const sa = S.agg.subj[subj] || { n: 0, ok: 0 }; const avg = sa.n ? sa.ok / sa.n : 0;
    return Object.entries(S.agg.type).filter(([k, a]) => k.startsWith(subj + '|') && a.n >= 3 && (a.ok / a.n < 0.6 || a.ok / a.n <= avg - 0.1)).sort((x, y) => x[1].ok / x[1].n - y[1].ok / y[1].n).map(([k]) => k.slice(subj.length + 1));
  }
  /* 세트 기록: 과목마다 최근 점수와, 그 앞의 같은 수 세트와 견준 흐름 */
  const setsOf = (subj) => (S.meta.sets || []).filter((x) => SUBJ[x.subj] && (!subj || x.subj === subj));
  function setTrendHTML(subj) {
    const list = setsOf(subj); if (list.length < 2) return '';
    const rate = (xs) => Math.round(xs.reduce((a, x) => a + x.ok / x.n, 0) / xs.length * 100);
    const k = Math.min(5, Math.floor(list.length / 2)), now = list.slice(-k), before = list.slice(-2 * k, -k);
    const d = rate(now) - rate(before);
    return `<p class="notice">${SUBJ[subj].name} 최근 ${k}세트 정답률 <b>${rate(now)}%</b> · 그 앞 ${k}세트 ${rate(before)}% (${d > 0 ? '+' : ''}${d}%p)</p>`;
  }
  function setHistHTML() {
    const all = setsOf(''); if (!all.length) return '';
    const per = ORDER.filter((k) => setsOf(k).length).map((k) => {
      const xs = setsOf(k), last = xs.slice(-12);
      const bars = last.map((x) => { const r = Math.round(x.ok / x.n * 100); return `<i style="height:${Math.max(4, r)}%" title="${md(dayKey(x.at))} · ${x.ok}/${x.n} (${r}%)${x.timeUp ? ' · 시간 초과' : ''}"></i>`; }).join('');
      const best = Math.max(...xs.map((x) => Math.round(x.ok / x.n * 100)));
      return `<div class="set-hist"><div class="sh-h"><b>${SUBJ[k].name}</b><span>${xs.length}세트 · 최고 ${best}%</span></div><div class="bars sh-bars" aria-label="${SUBJ[k].name} 세트 정답률">${bars}</div></div>`;
    }).join('');
    const rows = all.slice(-10).reverse().map((x) => `<tr><td>${md(dayKey(x.at))}</td><td>${SUBJ[x.subj].name}</td><td>${x.ok}/${x.n}</td><td>${Math.round(x.ok / x.n * 100)}%</td><td>${human(x.usedMs)}${x.timeUp ? ' <small class="tag">시간 초과</small>' : ''}</td></tr>`).join('');
    return `<div class="card" style="margin-top:12px"><h2>세트 기록</h2>${per}<table class="st"><thead><tr><th>날짜</th><th>과목</th><th>점수</th><th>정답률</th><th>시간</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function viewSetup() {
    const segS = ORDER.map((k) => `<button class="${setPick.subj === k ? 'on' : ''}" data-act="set-subj" data-v="${k}">${SUBJ[k].name}</button>`).join('');
    const segN = [5, 10, 20, 40].map((n) => `<button class="${setPick.n === n ? 'on' : ''}" data-act="set-n" data-v="${n}">${n}문항</button>`).join('');
    const lim = setPick.n * SUBJ[setPick.subj].pace * 1000;
    const weak = weakTypesOf(setPick.subj), weakLeft = weak.reduce((t, x) => t + bankLeft(setPick.subj, x), 0), p5Left = bankLeft(setPick.subj, '', true);
    if (setPick.focus === 'weak' && !weak.length) setPick.focus = 'even';
    if (setPick.focus === 'p5' && !p5Left) setPick.focus = 'even';
    paint(shell('<b>실전 세트</b>', `
      <div class="page-h"><h1>실전 세트</h1></div>
      <div class="card"><div class="set-row"><div class="l">과목</div><div class="seg">${segS}</div></div>
        <div class="set-row"><div class="l">문항 수</div><div class="seg">${segN}</div></div>
        <div class="set-row"><div class="l">구성<small>${setPick.focus === 'p5' ? `5급 실전 정예: 5급 공채 PSAT 실전·심화 수준으로 직접 출제한 문항 가운데 아직 풀지 않은 ${p5Left}개에서 유형을 고루 섞어 짜고, 모자라면 다른 문항으로 채웁니다` : weak.length ? `약점 위주: 정답률이 낮은 ${weak.length}개 유형(${weak.slice(0, 3).map((x) => esc(typeShort(setPick.subj, x))).join(', ')}${weak.length > 3 ? ' …' : ''})에서 남은 직접 출제 문항 ${weakLeft}개를 먼저 넣고, 모자라면 다른 유형으로 채웁니다` : '유형마다 3문항 이상 풀면 정답률이 낮은 유형 위주로도 짤 수 있습니다'}</small></div><div class="seg"><button class="${setPick.focus !== 'weak' && setPick.focus !== 'p5' ? 'on' : ''}" data-act="set-focus" data-v="even">고르게</button><button class="${setPick.focus === 'weak' ? 'on' : ''}" data-act="set-focus" data-v="weak" ${weak.length ? '' : 'disabled'}>약점 위주</button><button class="${setPick.focus === 'p5' ? 'on' : ''}" data-act="set-focus" data-v="p5" ${p5Left ? '' : 'disabled'} title="5급 공채 PSAT 실전·심화 수준으로 직접 출제한 정예 문항으로 짭니다">5급 정예</button></div></div>
        <div class="set-row"><div class="l">제한 시간<small>실제 시험 속도(문항당 ${human(SUBJ[setPick.subj].pace * 1000)})로 계산합니다. 40문항은 실제 시험 한 과목(90분)과 같습니다. 다른 창을 보는 동안은 멈춥니다.</small></div><b style="font-variant-numeric:tabular-nums">${human(lim)}</b></div>
        <p class="prose" style="margin:8px 0 12px">문항 사이에는 해설을 보여 주지 않고 시험처럼 이어서 풉니다. 막히는 문항은 <b>넘기기</b>(L)로 미뤄 두면 남은 문항을 다 푼 뒤에 다시 나옵니다(쓴 시간과 고른 답은 그대로). 끝나면 점수와 문항별 해설을 한꺼번에 봅니다. 틀린 문제는 오답노트에 담깁니다.</p>
        <button class="btn primary" data-act="set-start">시작하기</button></div>
      ${S.set && S.set.done ? '<button class="item" data-act="set-result" style="margin-top:12px"><span class="t1"><span class="tag">지난 세트</span></span><span class="t2">지난 실전 세트 결과 다시 보기</span></button>' : ''}
      ${setHistHTML()}`), 'setup');
  }
  /* 실전 세트 문항 구성: 아직 풀지 않은 직접 출제 문항에서 난이도 하 25% · 중 55% · 상 20%를 맞추고,
     같은 난이도 안에서는 유형이 고루 섞이도록 돌아가며 뽑는다. 1지문 2문항은 붙여서 넣는다. 모자라면 생성 문항으로 채운다. */
  function planSet(subj, n, focus) {
    const all0 = P.bank[subj] || [];
    if (focus && focus.length) { // 약점 위주: 약한 유형의 문항으로 먼저 짜고, 남는 자리는 고르게 채운다
      const first = planSet(subj, n, null, all0.filter((q) => focus.includes(q.type)));
      if (first.length >= n) return first;
      const rest = planSet(subj, n - first.length, null, all0.filter((q) => !first.includes(q.id) && !(q.set && all0.some((x) => x.set === q.set && first.includes(x.id)))));
      return first.concat(rest);
    }
    const all = arguments[3] || all0, shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const unitOf = (q) => (q.set ? all0.filter((x) => x.set === q.set).sort((a, b) => a.setNo - b.setNo) : [q]); // 1지문 2문항은 유형이 달라도 함께
    const pool = all.filter((q) => !(q.setNo > 1) && !S.seen.has('id:' + q.id) && !isHidden('id:' + q.id));
    const byLv = { 1: [], 2: [], 3: [] }; pool.forEach((q) => byLv[q.lv || 2].push(q));
    const want = { 1: Math.round(n * 0.25), 2: Math.round(n * 0.55) }; want[3] = Math.max(0, n - want[1] - want[2]);
    const picked = [], used = new Set(); let count = 0;
    const take = (lv, k) => { // 같은 난이도 안에서 유형을 돌아가며
      const groups = {}; shuffle(byLv[lv].slice()).forEach((q) => (groups[q.type] = groups[q.type] || []).push(q));
      const keys = shuffle(Object.keys(groups)); let got = 0, moved = true;
      while (got < k && count < n && moved) { moved = false; for (const t of keys) { if (got >= k || count >= n) break; const q = groups[t].shift(); if (!q) continue; if (used.has(q.id)) continue; const u = unitOf(q); if (count + u.length > n) continue; u.forEach((x) => used.add(x.id)); picked.push(u); count += u.length; got += u.length; moved = true; } }
    };
    [1, 2, 3].forEach((lv) => take(lv, want[lv]));
    [2, 1, 3].forEach((lv) => take(lv, n - count)); // 어느 난이도가 모자라면 다른 난이도로 채운다
    return shuffle(picked).flat().map((q) => q.id);
  }
  /* 넘기기: 실제 시험처럼 막히는 문항을 미뤄 두었다가 마지막에 다시 푼다 */
  function deferSetItem() {
    const c = S.cur; if (!c || c.phase !== 'q' || !S.set || S.set.done || !c.ctx || c.ctx.mode !== 'set') return;
    const later = S.set.later || (S.set.later = []);
    if (!(S.set.results.length + later.length + 1 < S.set.n || later.length)) return;
    later.push({ q: c.q, ms: Math.round(c.ms), choice: c.choice, no: c.no }); saveSet();
    toast(`${c.no}번을 넘겼습니다. 남은 문항을 다 푼 뒤에 다시 나옵니다.`);
    startSession(c.ctx);
  }
  function startSet() {
    const focus = setPick.focus === 'weak' ? weakTypesOf(setPick.subj) : null;
    let plan = planSet(setPick.subj, setPick.n, focus), genTypes = [];
    if (setPick.focus === 'p5') { // 5급 실전 정예로 먼저 짜고, 모자라면 나머지 문항으로 채운다
      const all0 = P.bank[setPick.subj] || [];
      const first = planSet(setPick.subj, setPick.n, null, all0.filter((q) => q.p5));
      plan = first.length >= setPick.n ? first : first.concat(planSet(setPick.subj, setPick.n - first.length, null, all0.filter((q) => !first.includes(q.id) && !(q.set && all0.some((x) => x.set === q.set && first.includes(x.id))))));
    }
    if (focus) { // 약한 유형이 생성 유형이면, 문항의 70%가 약한 유형이 되도록 뒤쪽 자리를 생성 문항에 내준다
      genTypes = focus.filter((t) => (P.gens[setPick.subj] || []).some((g) => g.label === t));
      const bankWeak = plan.filter((id) => { const q = (P.bank[setPick.subj] || []).find((x) => x.id === id); return q && focus.includes(q.type); }).length;
      const room = Math.max(0, Math.round(setPick.n * 0.7) - bankWeak);
      if (genTypes.length && room) plan = plan.slice(0, Math.max(bankWeak, plan.length - room));
    }
    S.set = { subj: setPick.subj, n: setPick.n, results: [], usedMs: 0, limitMs: setPick.n * SUBJ[setPick.subj].pace * 1000, at: Date.now(), done: false, plan, focus: focus ? 'weak' : setPick.focus === 'p5' ? 'p5' : 'even', genTypes };
    saveSet();
    startSession({ subj: setPick.subj, type: '', mode: 'set' });
  }
  function finishSet(timeUp) {
    if (!S.set) { viewHome(); return; }
    S.set.done = true; S.set.timeUp = !!timeUp;
    if (!S.set.logged) {
      const r = S.set.results;
      (S.meta.sets = S.meta.sets || []).push({ at: S.set.at, end: Date.now(), subj: S.set.subj, n: S.set.n, ok: r.filter((x) => x.ok).length, answered: r.length, usedMs: Math.round(Math.min(S.set.usedMs, S.set.limitMs)), limitMs: S.set.limitMs, timeUp: !!timeUp, deferred: r.filter((x) => x.deferred).length });
      S.meta.sets = S.meta.sets.slice(-300); S.set.logged = true; saveKV('meta');
    }
    saveSet();
    S.cur = null; saveCur(); stopTimer();
    if (timeUp) toast('제한 시간이 끝났습니다.');
    viewSetResult();
  }
  function viewSetResult() {
    const st = S.set; if (!st) { viewHome(); return; }
    const okN = st.results.filter((x) => x.ok).length, used = st.results.reduce((a, x) => a + x.ms, 0);
    const rows = st.results.map((x, i) => [x, i]).sort((a, b) => (a[0].no || a[1] + 1) - (b[0].no || b[1] + 1)).map(([x, i]) => `<tr><td>${x.no || i + 1}${x.deferred ? ' <small class="tag">넘김</small>' : ''}</td><td>${esc(typeShort(x.q.subject, x.q.type))}</td><td>${x.choice < 0 ? '모름' : x.ok ? '<b style="color:var(--ok)">○</b>' : '<b style="color:var(--pen)">×</b>'}</td><td>${human(x.ms)}</td><td><button class="btn sm" data-act="set-review" data-i="${i}">해설</button></td></tr>`).join('');
    const miss = st.n - st.results.length;
    paint(shell('<b>실전 세트</b> · 결과', `
      <div class="page-h"><h1>${SUBJ[st.subj].name} 실전 세트 결과</h1><button class="btn primary sm" data-act="setup">새 세트</button></div>
      <div class="stat-grid">
        <div class="stat"><div class="k">점수</div><div class="v">${okN}<small>/ ${st.n}</small></div></div>
        <div class="stat"><div class="k">정답률</div><div class="v">${pct(okN, st.n)}<small>%</small></div></div>
        <div class="stat"><div class="k">쓴 시간</div><div class="v" style="font-size:1.125rem">${human(used)}</div></div>
        <div class="stat"><div class="k">제한 시간</div><div class="v" style="font-size:1.125rem">${human(st.limitMs)}</div></div>
      </div>
      ${miss > 0 ? `<p class="notice">시간이 끝나 ${miss}문항은 풀지 못했습니다${(st.later || []).length ? `(넘겼다가 돌아오지 못한 문항 ${st.later.length}개 포함)` : ''}. 풀지 못한 문항은 점수에서 오답으로 셉니다.</p>` : ''}
      ${(() => { const d = st.results.filter((x) => x.deferred); return d.length ? `<p class="notice">넘겼다가 다시 푼 ${d.length}문항 중 ${d.filter((x) => x.ok).length}문항을 맞혔습니다.</p>` : ''; })()}
      ${setTrendHTML(st.subj)}
      <div class="card"><h2>문항별</h2><table class="st"><thead><tr><th>문항</th><th>유형</th><th>결과</th><th>시간</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="notice">틀린 문제는 오답노트에 담겼고, 1일 뒤부터 복습에 나옵니다.</p>`), 'setresult');
  }
  function reviewSetItem(i) {
    const x = S.set && S.set.results[i]; if (!x) return;
    S.cur = { q: x.q, ctx: { subj: x.q.subject, mode: 'setreview' }, phase: 'x', choice: x.choice, ms: x.ms, ok: x.ok, review: false, no: i + 1 };
    viewExplain();
  }

  /* ----- 오답노트 ----- */
  let noteFilter = { subj: '', kind: 'all' };
  function viewNotes() {
    const t = dayKey();
    const all = Array.from(S.items.values()).filter((it) => SUBJ[it.subj] && (it.wrong > 0 || it.star || it.memo));
    const due = dueItems(noteFilter.subj);
    let list = all.filter((it) => !noteFilter.subj || it.subj === noteFilter.subj);
    if (noteFilter.kind === 'due') list = list.filter((it) => it.due && it.due <= t);
    if (noteFilter.kind === 'star') list = list.filter((it) => it.star);
    if (noteFilter.kind === 'memo') list = list.filter((it) => it.memo);
    if (noteFilter.kind === 'done') list = list.filter((it) => it.done);
    if (noteFilter.kind === 'p5') list = list.filter((it) => isP5(it.qid));
    list.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    const seg1 = [['', '전체'], ...ORDER.map((k) => [k, SUBJ[k].name])].map(([k, n]) => `<button class="${noteFilter.subj === k ? 'on' : ''}" data-act="nf-subj" data-v="${k}">${n}</button>`).join('');
    const seg2 = [['all', '모두'], ['due', '오늘 복습'], ['p5', '5급 실전'], ['star', '★ 중요'], ['memo', '메모'], ['done', '졸업']].map(([k, n]) => `<button class="${noteFilter.kind === k ? 'on' : ''}" data-act="nf-kind" data-v="${k}">${n}</button>`).join('');
    // 지난번에 틀릴 때 고른 선지(번호가 아니라 글로: 다시 풀 때 선지 순서가 바뀔 수 있다). 정답은 보여 주지 않는다.
    const lastPick = (it) => {
      if (it.lastOk !== false || !it.q || !Array.isArray(it.q.options)) return '';
      const c = it.lastChoice;
      const txt = c === -1 ? '모르겠음으로 넘김' : Number.isInteger(c) && it.q.options[c] != null ? stemText(String(it.q.options[c])) : '';
      return txt ? `<span class="t5">지난번 고른 답: ${esc(txt.length > 46 ? txt.slice(0, 46) + '…' : txt)}</span>` : '';
    };
    const items = list.map((it) => {
      const st = it.done ? '<span class="tag">졸업</span>' : it.due ? (it.due <= t ? '<span class="tag rev">오늘 복습</span>' : `<span class="tag">${md(it.due)} 복습</span>`) : '';
      return `<button class="item" data-act="open-note" data-id="${esc(it.qid)}">
        <span class="t1"><span>${esc(SUBJ[it.subj].name)} · ${esc(typeShort(it.subj, it.type))}</span>${st}${it.star ? '<span class="tag src">★</span>' : ''}${it.wrong ? `<span>오답 ${it.wrong}회</span>` : ''}${it.cause ? `<span class="tag">${esc(it.cause)}</span>` : ''}${it.right ? `<span>정답 ${it.right}회</span>` : ''}</span>
        <span class="t2">${esc(stemText(it.q.stem))}</span>
        <span class="t4">${esc(snippet(it.q))}</span>
        ${lastPick(it)}<span class="t3">${md(dayKey(it.addedAt))} 담음${it.memo ? ` · 메모: ${esc(it.memo.replace(/\s+/g, ' ').slice(0, 60))}` : ''}</span></button>`;
    }).join('');
    paint(shell('<b>오답노트</b>', `
      <div class="page-h"><h1>오답노트</h1>${due.length ? `<button class="btn primary sm" data-act="review-start">오늘 복습 ${due.length}문제 시작</button>` : '<span class="subj-meta">오늘 복습할 문제가 없습니다</span>'}</div>
      <div class="seg" style="margin-bottom:8px">${seg1}</div>
      <div class="seg sub" style="margin-bottom:14px">${seg2}</div>
      ${items ? `<div class="list">${items}</div>` : `<div class="empty">${all.length ? '조건에 맞는 문제가 없습니다.' : '틀린 문제는 여기에 자동으로 모이고, 1일·3일·7일·14일·30일 뒤에 다시 나옵니다.<br>다섯 번 연속으로 맞히면 ‘졸업’합니다.'}</div>`}
      <p class="notice">복습 문제를 맞히면 다음 복습일이 1일 → 3일 → 7일 → 14일 → 30일로 늘어나고, 틀리면 다음 날로 돌아갑니다. 과목 풀이 중에도 복습할 문제가 가끔 섞여 나옵니다(설정에서 끌 수 있음).</p>`), 'notes');
  }
  function openNote(id) {
    const it = S.items.get(id); if (!it) return;
    const due = it.due && it.due <= dayKey();
    S.cur = { q: it.q, ctx: { subj: it.subj, mode: 'note' }, phase: 'q', choice: null, ms: 0, ok: null, review: !!due, no: 0 };
    saveCur(); viewQuiz();
  }

  /* ----- 기록 ----- */
  function viewStats() {
    const tot = Object.values(S.agg.subj).reduce((a, x) => ({ n: a.n + x.n, ok: a.ok + x.ok, ms: a.ms + x.ms }), { n: 0, ok: 0, ms: 0 });
    const days = []; for (let i = 29; i >= 0; i--) days.push(addDays(dayKey(), -i));
    const mx = Math.max(1, ...days.map((k) => (S.daily[k] ? S.daily[k].n : 0)));
    const bars = days.map((k) => { const n = S.daily[k] ? S.daily[k].n : 0; return `<i class="${n ? '' : 'zero'}" style="height:${n ? Math.max(4, (n / mx) * 100) : 2}%" title="${md(k)} · ${n}문항"></i>`; }).join('');
    const subjRows = ORDER.map((k) => { const a = S.agg.subj[k] || { n: 0, ok: 0, ms: 0 }; return `<tr><td>${SUBJ[k].name}</td><td>${a.n.toLocaleString()}</td><td>${a.n ? pct(a.ok, a.n) + '%' : '–'}</td><td>${a.n ? human(a.ms / a.n) : '–'}</td><td>${human(SUBJ[k].pace * 1000)}</td></tr>`; }).join('');
    /* 약점 분석: per subject, the types answered at least 3 times; weak = 정답률 10%p 이상 낮거나 60% 미만, slow = 평균 시간이 권장의 1.3배 이상 */
    const types = Object.entries(S.agg.type).map(([k, a]) => { const [s, ...rest] = k.split('|'); return { s, t: rest.join('|'), a }; }).filter((x) => SUBJ[x.s] && x.a.n >= 3);
    const weakBy = {};
    for (const k of ORDER) {
      const sa = S.agg.subj[k] || { n: 0, ok: 0 }; const avg = sa.n ? sa.ok / sa.n : 0; const pace = SUBJ[k].pace * 1000;
      const list = types.filter((x) => x.s === k).map((x) => ({ ...x, acc: x.a.ok / x.a.n, wrong: x.a.n - x.a.ok, avgMs: x.a.ms / x.a.n }));
      const weak = list.filter((x) => x.acc < 0.6 || x.acc <= avg - 0.1).sort((x, y) => x.acc - y.acc).slice(0, 2);
      const slow = list.filter((x) => x.avgMs >= pace * 1.3 && !weak.includes(x)).sort((x, y) => y.avgMs - x.avgMs).slice(0, 1);
      weakBy[k] = { list: list.sort((x, y) => x.acc - y.acc), weak, slow, avg, pace };
    }
    const focus = (x) => `<button class="btn sm" data-act="start" data-subj="${x.s}" data-type="${esc(x.t)}">집중 연습</button>`;
    const weakItems = ORDER.flatMap((k) => [...weakBy[k].weak.map((x) => `<li><div><div class="w-t">${SUBJ[k].name} · ${esc(typeShort(k, x.t))}</div><div class="w-s">정답률 ${pct(x.a.ok, x.a.n)}% (과목 평균 ${Math.round(weakBy[k].avg * 100)}%) · 오답 ${x.wrong}개 / ${x.a.n}문항</div></div>${focus(x)}</li>`),
      ...weakBy[k].slow.map((x) => `<li><div><div class="w-t">${SUBJ[k].name} · ${esc(typeShort(k, x.t))} <small>시간</small></div><div class="w-s">평균 ${human(x.avgMs)} · 권장 ${human(weakBy[k].pace)}보다 오래 걸림 · 정답률 ${pct(x.a.ok, x.a.n)}%</div></div>${focus(x)}</li>`)]);
    const weakSets = ORDER.filter((k) => weakBy[k].weak.length).map((k) => `<button class="btn sm" data-act="setup-weak" data-subj="${k}">${SUBJ[k].name} 약점 세트</button>`).join('');
    const weakCard = `<div class="card"><h2>약점 분석</h2>${weakSets ? `<div class="tools-row" style="margin:0 0 10px">${weakSets}</div>` : ''}${weakItems.length ? `<p class="subj-meta" style="margin:0 0 8px">정답률이 과목 평균보다 10%p 이상 낮거나 60%에 못 미치는 유형, 권장 시간보다 1.3배 이상 오래 걸리는 유형입니다.</p><ul class="weak">${weakItems.join('')}</ul>` : `<p class="subj-meta" style="margin:0">${types.length ? '지금은 눈에 띄게 약한 유형이 없습니다. 유형마다 고르게 풀고 있습니다.' : '유형마다 3문항 이상 풀면 약한 유형을 찾아 드립니다.'}</p>`}</div>`;
    const typeRows = ORDER.filter((k) => weakBy[k].list.length).map((k) => `<tr><th colspan="5" class="st-sub">${SUBJ[k].name}</th></tr>` + weakBy[k].list.map((x) => `<tr><td>${esc(typeShort(x.s, x.t))}</td><td>${x.a.n}<small> (오답 ${x.wrong})</small></td><td class="${weakBy[k].weak.includes(x) ? 'bad' : ''}">${pct(x.a.ok, x.a.n)}%</td><td class="${x.avgMs >= weakBy[k].pace * 1.3 ? 'bad' : ''}">${human(x.avgMs)}</td><td><button class="btn sm" data-act="start" data-subj="${x.s}" data-type="${esc(x.t)}">연습</button></td></tr>`).join('')).join('');
    const flags = Array.from(S.items.values()).filter((it) => it.flag && SUBJ[it.subj]);
    paint(shell('<b>기록</b>', `
      <div class="page-h"><h1>기록</h1></div>
      <div class="stat-grid">
        <div class="stat"><div class="k">누적 풀이</div><div class="v">${tot.n.toLocaleString()}<small>문항</small></div></div>
        <div class="stat"><div class="k">정답률</div><div class="v">${tot.n ? pct(tot.ok, tot.n) : 0}<small>%</small></div></div>
        <div class="stat"><div class="k">연속 학습</div><div class="v">${streak()}<small>일</small></div></div>
        <div class="stat"><div class="k">총 풀이 시간</div><div class="v" style="font-size:1.125rem">${hours(tot.ms)}</div></div>
      </div>
      ${weakCard}
      <div class="card"><h2>최근 30일</h2><div class="bars" aria-label="최근 30일 하루 풀이 수">${bars}</div><div class="bars-x"><span>${md(days[0])}</span><span>오늘</span></div></div>
      <div class="card"><h2>과목별</h2><table class="st"><thead><tr><th>과목</th><th>풀이</th><th>정답률</th><th>평균 시간</th><th>권장</th></tr></thead><tbody>${subjRows}</tbody></table></div>
      ${(() => { const p5 = S.agg.p5 || {}; const rows = ORDER.map((k) => { const a = p5[k] || { n: 0, ok: 0, ms: 0 }, all = S.agg.subj[k] || { n: 0, ok: 0 }, left = bankLeft(k, '', true); return `<tr><td>${SUBJ[k].name}</td><td>${a.n.toLocaleString()}</td><td>${a.n ? pct(a.ok, a.n) + '%' : '–'}${a.n >= 5 && all.n ? ` <small style="color:var(--muted)">(전체 ${pct(all.ok, all.n)}%)</small>` : ''}</td><td>${a.n ? human(a.ms / a.n) : '–'}</td><td>${left}</td></tr>`; }).join(''); return `<div class="card"><h2>5급 실전 정예</h2><p class="prose" style="margin:0 0 10px">5급 공채 PSAT 실전·심화 수준으로 직접 출제한 문항(‘5급 실전’ 표시)만 따로 모은 결과입니다. 실제 시험에 가장 가까운 지표로 보세요.</p><table class="st"><thead><tr><th>과목</th><th>풀이</th><th>정답률</th><th>평균 시간</th><th>남은 문항</th></tr></thead><tbody>${rows}</tbody></table></div>`; })()}
      <div class="card"><h2>과목별 유형 · 정답률 낮은 순</h2>${typeRows ? `<table class="st"><thead><tr><th>유형</th><th>풀이</th><th>정답률</th><th>평균</th><th></th></tr></thead><tbody>${typeRows}</tbody></table>` : '<p class="subj-meta" style="margin:0">유형마다 3문항 이상 풀면 약한 유형이 여기에 나타납니다.</p>'}</div>
      ${(() => { const cs = {}; let tot = 0; for (const it of S.items.values()) if (it.cause && SUBJ[it.subj]) { cs[it.cause] = (cs[it.cause] || 0) + 1; tot++; } return tot ? `<div class="card"><h2>틀린 이유</h2><table class="st"><tbody>${Object.entries(cs).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}문항</td><td>${pct(v, tot)}%</td></tr>`).join('')}</tbody></table><p class="subj-meta" style="margin:8px 0 0">해설 화면에서 고른 ‘틀린 이유’를 모은 것입니다. 가장 많은 이유부터 습관을 고치면 점수가 빨리 오릅니다.</p></div>` : ''; })()}
      ${flags.length ? `<div class="card"><h2>이상한 점을 알린 문제 ${flags.length}개</h2><p class="subj-meta" style="margin:0 0 10px">아래 버튼으로 내용을 복사해 전달하면 확인 후 고칩니다.</p><button class="btn sm" data-act="copy-flags">내용 복사</button><ul class="prose" style="margin-top:12px">${flags.map((it) => `<li>${esc(it.qid)} — ${esc(plain(it.flag).slice(0, 120))}</li>`).join('')}</ul></div>` : ''}`), 'stats');
  }

  /* ----- 설정 ----- */
  function seg(name, cur, opts) { return `<div class="seg" role="group">${opts.map(([v, l]) => `<button class="${cur === v ? 'on' : ''}" data-act="set" data-k="${name}" data-v="${v}">${l}</button>`).join('')}</div>`; }
  const sw = (k, on, label) => `<button class="switch" id="sw-${k}" role="switch" aria-checked="${on ? 'true' : 'false'}" data-act="toggle" data-k="${k}" aria-label="${label}"></button>`;
  function viewSettings() {
    const nBank = ORDER.map((k) => `${SUBJ[k].name} ${(P.bank[k] || []).length}`).join(' · ');
    paint(shell('<b>설정</b>', `
      <div class="page-h"><h1>설정</h1></div>
      <div class="card"><h2>화면</h2>
        <div class="set-row"><div class="l">테마</div>${seg('theme', S.settings.theme, [['auto', '자동'], ['light', '밝게'], ['dark', '어둡게']])}</div>
        <div class="set-row"><div class="l">글자 크기</div>${seg('size', S.settings.size, [['s', '작게'], ['m', '보통'], ['l', '크게']])}</div>
        <div class="set-row"><div class="l">지문 글꼴<small>시험지처럼 명조, 화면에선 고딕이 편할 수도 있습니다</small></div>${seg('face', S.settings.face, [['serif', '명조'], ['sans', '고딕']])}</div>
      </div>
      ${(S.settings.hidden || []).length ? `<div class="card"><h2>지운 문제</h2><div class="set-row"><div class="l">지운 문제 ${S.settings.hidden.length}개<small>해설 화면의 ‘이 문제 지우기’로 지운 문제는 다시 나오지 않습니다</small></div><button class="btn sm" data-act="unhide-all">모두 되살리기</button></div></div>` : ''}
      <div class="card"><h2>난이도</h2>
        <div class="set-row"><div class="l">문제 난이도<small>‘자동’은 유형마다 최근 5~6문제 결과를 보고 한 단계씩 올리거나 내립니다. 기본·실전·심화는 인원·조건·경우의 수·자료 크기로 조절되며, 어느 단계든 정답 검증은 같습니다. 직접 출제한 독해·논증 문항은 난이도와 관계없이 나옵니다.</small></div>${seg('level', S.settings.level, [['auto', '자동'], ['1', '기본'], ['2', '실전'], ['3', '심화']])}</div>
      </div>
      <div class="card"><h2>풀이</h2>
        <div class="set-row"><label class="l sw-label" for="sw-timer">타이머 표시<small>권장 시간을 넘기면 빨갛게 바뀝니다. 다른 창을 보는 동안은 멈춥니다</small></label>${sw('timer', S.settings.timer, '타이머 표시')}</div>
        <div class="set-row"><label class="l sw-label" for="sw-mixReview">복습 문제 섞기<small>과목 풀이 중에 복습할 때가 된 오답이 가끔 나옵니다</small></label>${sw('mixReview', S.settings.mixReview, '복습 문제 섞기')}</div>
        <div class="set-row"><div class="l">하루 목표<small>첫 화면에 오늘 푼 문항 수와 목표까지 남은 수를 보여 줍니다</small></div>${seg('goal', String(S.settings.goal || '0'), [['0', '없음'], ['20', '20문항'], ['40', '40문항'], ['60', '60문항'], ['100', '100문항']])}</div>
      </div>
      <div class="card"><h2>기록 보관</h2>
        <p class="prose" style="margin:0 0 10px">모든 기록은 이 브라우저 안에만 저장됩니다. 다른 기기로 옮기거나 만일에 대비하려면 가끔 백업 파일을 저장해 두세요. 불러오면 지금 기록과 합쳐집니다(같은 풀이는 한 번만 셉니다).</p>
        <div class="tools-row" style="margin-top:0"><button class="btn sm" data-act="help">사용법</button><button class="btn sm" data-act="export">백업 파일 저장</button><label class="btn sm" style="cursor:pointer">백업 불러오기<input type="file" accept="application/json,.json" data-act="import" class="sr"></label><button class="btn sm ghost" data-act="relock">잠금 다시 걸기</button><button class="btn sm ghost" data-act="wipe" style="color:var(--pen)">기록 모두 지우기</button></div>
      </div>
      <div class="card"><h2>문항 안내</h2><div class="prose">
        <p><b>PSAT</b>은 기출을 그대로 싣지 않습니다. 인사혁신처 기출의 발문과 선지 구성을 본떠 새로 만든 문항입니다.</p>
        <ul><li><b>송공 생성</b>: 명제·순서·참거짓 추론, 논증 강화·약화, 표·그래프 해석, 계산, 법조문·일정·규칙 적용, 리그전·자리 배치. 조건과 정답을 프로그램이 직접 계산하고, 정답이 하나뿐인지 모든 경우를 따져 확인한 문항만 나옵니다. 사실상 끝없이 새로 나옵니다.</li>
        <li><b>송공 출제</b>: 사람이 직접 쓴 문항 — 독해(세부 내용·추론·빈칸·논지·문맥 수정·적용), 논증(강화·약화·논쟁 분석), 1지문 2문항 세트, 형식논리, 자료해석·상황판단 대표 유형. 선지마다 근거 문단을 대어 정답을 확인했고, 계산·논리가 들어간 문항은 프로그램으로 경우를 모두 따져 한 번 더 검증했습니다. 현재 ${nBank}문항.</li></ul>
        <p>한 번 푼 문제는 다시 나오지 않습니다(오답노트 복습 제외).</p></div></div>`), 'settings');
  }

  /* ----- 사용법 ----- */
  function viewHelp() {
    paint(shell('<b>사용법</b>', `
      <div class="page-h"><h1>사용법</h1></div>
      <div class="card prose">
        <h2>한 문제씩 풀기</h2>
        <p>처음 화면에서 과목을 누르면<span class="kbd-hint">(숫자 키 <b>1~3</b>)</span> 바로 한 문제가 나옵니다. 선택지를 누르고<span class="kbd-hint">(<b>1~5</b>)</span> <b>정답 확인</b><span class="kbd-hint">(Enter)</span>을 누르면 다음 화면에서 채점과 해설을 보여 줍니다. <b>다음 문제</b><span class="kbd-hint">(Enter)</span>로 계속 풀거나 <b>그만 풀기</b>로 멈추면 됩니다. 모르는 문제는 <b>모르겠음</b>을 누르면 해설로 넘어가며, 오답으로 기록됩니다.</p>
        <p>창을 닫아도<span class="kbd-hint">(Esc를 눌러도)</span> 풀던 문제는 그대로 남아, 다시 열면 이어서 풀 수 있습니다. 다른 창을 보는 동안에는 타이머가 멈춥니다.</p>
        <h2>해설 읽는 법</h2>
        <p>해설은 출발점 → 경우 나누기 → 확정 순서로 사람이 푸는 방식대로 적었고, 선지마다 근거와 판정을 붙였습니다. 빨간 동그라미가 정답, 빗금이 고른 오답입니다. 넓은 화면에서는 왼쪽에 문제, 오른쪽에 해설이 나란히 보입니다.</p>
        <h2>오답노트와 복습</h2>
        <p>틀린 문제는 문제 전체가 오답노트에 자동으로 저장됩니다. 1일 → 3일 → 7일 → 14일 → 30일 뒤에 다시 나오고, 틀리면 다음 날로 돌아갑니다. 다섯 번 연속 맞히면 ‘졸업’합니다. 해설 화면에서 <b>틀린 이유</b>를 골라 두면 나중에 실수 유형을 돌아볼 수 있고, <b>★ 중요</b>(S)와 <b>메모</b>(M)도 함께 보관됩니다.</p>
        <h2>같은 유형 한 문제 더</h2>
        <p>해설 화면의 <b>같은 유형 한 문제 더</b>(<b>T</b>)를 누르면 방금 푼 문제와 같은 유형의 새 문제가 하나 나오고, 다 풀면 하던 곳(과목 풀이·오답노트·세트 결과)으로 돌아갑니다. 틀린 직후 같은 유형을 한 번 더 풀면 실수한 지점이 오래 남습니다.</p>
        <h2>난이도와 유형별 연습</h2>
        <p>설정의 <b>난이도</b>를 ‘자동’으로 두면 유형마다 최근 결과를 보고 기본 → 실전 → 심화로 조절합니다. 특정 유형만 연습하려면 과목 카드의 <b>유형별</b>을 누르세요. 그 화면의 <b>5급 실전 정예만</b>을 누르면 5급 공채 PSAT 실전·심화 수준으로 직접 출제한 문항(문제 위에 ‘5급 실전’ 표시)만 차례로 풉니다. <b>기록</b> 화면에는 5급 실전 정예 문항만 따로 모은 정답률도 나오고, 정답률이 낮은 유형이 위에 나오며, ‘집중’ 버튼으로 바로 연습할 수 있습니다.</p>
        <h2>실전 세트</h2>
        <p>처음 화면의 <b>실전 세트</b>에서 과목과 문항 수를 고르면 실제 시험 속도로 제한 시간이 정해지고, 해설 없이 이어서 풉니다. 막히는 문항은 <b>넘기기</b>(<b>L</b>)로 미뤄 두면 남은 문항을 다 푼 뒤에 다시 나옵니다. 끝난 세트는 <b>세트 기록</b>에 쌓여 과목별 점수의 흐름을 볼 수 있습니다.</p>
        <p>구성을 <b>약점 위주</b>로 고르면 기록 화면의 약점 분석과 같은 기준(3문항 이상 푼 유형 가운데 정답률 60% 미만이거나 과목 평균보다 10%p 이상 낮은 유형)으로 약한 유형의 문항을 먼저 넣습니다. 설정에서 <b>하루 목표</b>를 정하면 첫 화면에 남은 문항 수가 보입니다.</p>
        <p>구성을 <b>5급 정예</b>로 고르면 5급 공채 PSAT 실전·심화 수준으로 직접 출제한 문항(문제 위에 ‘5급 실전’ 표시)만으로 세트를 짭니다. 아직 풀지 않은 정예 문항이 모자라면 다른 문항으로 채웁니다.</p>
        <h2>모의고사</h2>
        <p>처음 화면의 <b>모의고사</b>에서 7급 PSAT(1교시 언어논리·상황판단 50문항 120분, 2교시 자료해석 25문항 60분)이나 5급 PSAT(과목별 40문항 90분)을 고릅니다. 답안지에서 아무 문항으로나 오가고(←/→), 답(1~5)은 제출 전까지 바꿀 수 있으며, 다시 볼 문항은 <b>체크</b>(F)합니다. 제출하면 100점 환산 점수, 유형별 정답률, 체크했는데 맞힌 문항, 시간을 넘긴 문항을 보여 줍니다.</p>
        <h2>기록 보관</h2>
        <p>기록은 이 브라우저 안에만 저장됩니다. 다른 기기로 옮기거나 만일에 대비하려면 <b>설정 → 백업 파일 저장</b>으로 파일을 받아 두고, 다른 기기에서 <b>백업 불러오기</b>를 누르면 기록이 합쳐집니다.</p>
        <h2>문제가 이상할 때</h2>
        <p>해설 화면의 <b>이상한 점 알리기</b>에 적어 두면 <b>기록</b> 화면에 모입니다. ‘내용 복사’로 한꺼번에 전달하면 확인 후 고칩니다.</p>
        <h2>문항 구성</h2>
        <p>PSAT은 기출을 그대로 싣지 않고, 인사혁신처 5급 공채 기출의 발문·선지 양식을 본뜬 문항만 냅니다. 퀴즈·표·법조문 문항은 프로그램이 조건과 정답을 직접 계산하고 정답이 하나뿐인지 모든 경우를 따져 확인한 것만 나오며, 독해·논증은 직접 쓴 문항입니다. 한 번 푼 문제는 다시 나오지 않습니다(복습 제외).</p>
      </div>`), 'help');
  }

  /* ----- backup ----- */
  async function exportBackup() {
    try {
      const log = S.persistent ? await DB.all('log') : [];
      const data = { app: 'songgong', v: 1, exportedAt: new Date().toISOString(), settings: S.settings, meta: S.meta, items: Array.from(S.items.values()), seen: Array.from(S.seen), log };
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `songgong-backup-${dayKey().replace(/-/g, '')}.json`;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      S.meta.lastBackup = Date.now(); saveKV('meta');
      toast(`백업 파일을 저장했습니다 (풀이 ${log.length.toLocaleString()}건).`);
    } catch (e) { toast('백업 파일을 만들지 못했습니다.'); console.error(e); }
  }
  async function importBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.app !== 'songgong' || !Array.isArray(data.log)) { toast('송공 백업 파일이 아닙니다.'); return; }
      const cur = S.persistent ? await DB.all('log') : [];
      const keyOf = (e) => `${e.at}|${e.qid}`;
      const have = new Set(cur.map(keyOf));
      const add = data.log.filter((e) => e && e.qid && e.at && !have.has(keyOf(e)));
      const merged = cur.concat(add).sort((a, b) => a.at - b.at);
      S.agg = { subj: {}, type: {}, p5: {} }; S.daily = {};
      for (const e of merged) addToStats(e);
      for (const h of data.seen || []) S.seen.add(h);
      if (data.meta && Array.isArray(data.meta.mocks)) { const have = new Set((S.meta.mocks || []).map((x) => x.at)); S.meta.mocks = (S.meta.mocks || []).concat(data.meta.mocks.filter((x) => x && x.at && !have.has(x.at))).sort((a, b) => a.at - b.at).slice(-200); saveKV('meta'); }
      if (data.meta && Array.isArray(data.meta.sets)) { const have = new Set((S.meta.sets || []).map((x) => x.at)); S.meta.sets = (S.meta.sets || []).concat(data.meta.sets.filter((x) => x && x.at && !have.has(x.at))).sort((a, b) => a.at - b.at).slice(-300); saveKV('meta'); }
      for (const it of data.items || []) {
        if (!it || !it.qid || !it.q) continue;
        const mine = S.items.get(it.qid);
        if (!mine || (it.lastAt || 0) > (mine.lastAt || 0)) {
          const keep = mine ? { star: mine.star || it.star, memo: mine.memo && it.memo && mine.memo !== it.memo ? `${it.memo}\n${mine.memo}` : (it.memo || mine.memo || '') } : {};
          S.items.set(it.qid, { ...it, ...keep });
        } else if (it.star && !mine.star) { mine.star = true; }
      }
      if (S.persistent) {
        await persist(async () => {
          await DB.putMany('log', add.map((e) => [e]));
          await DB.putMany('seen', (data.seen || []).map((h) => [Date.now(), h]));
          await DB.putMany('items', Array.from(S.items.values()).map((it) => [it]));
          await DB.put('kv', S.agg, 'agg'); await DB.put('kv', S.daily, 'daily');
        });
      }
      toast(`불러왔습니다: 새 풀이 ${add.length.toLocaleString()}건을 합쳤습니다.`);
      viewSettings();
    } catch (e) { toast('파일을 읽지 못했습니다.'); console.error(e); }
  }
  async function wipe() {
    if (!confirm('모든 풀이 기록과 오답노트를 지웁니다. 되돌릴 수 없습니다. 계속할까요?')) return;
    if (!confirm('정말 지울까요? 백업 파일이 없다면 복구할 수 없습니다.')) return;
    if (S.persistent) await persist(async () => { for (const st of ['kv', 'items', 'log', 'seen']) await DB.clear(st); });
    S.agg = { subj: {}, type: {}, p5: {} }; S.daily = {}; S.items.clear(); S.seen.clear(); S.queue = []; S.cur = null; S.meta = { createdAt: Date.now() };
    saveCur(); saveKV('meta'); saveSettings();
    toast('기록을 모두 지웠습니다.'); viewHome();
  }

  /* ----- lock screen (when opened directly, not through the flag) ----- */
  function viewLock() {
    const n = Door.len('songgong');
    document.title = '송공';
    app().innerHTML = `<div class="lock"><form class="lock-card" autocomplete="off" onsubmit="return false">
      ${MARK.replace('class="brand-mark"', 'class="brand-mark" style="width:44px;height:44px"')}
      <h1>송공</h1><p>비밀번호를 입력하세요</p>
      <div class="pin-dots" aria-hidden="true">${'<i></i>'.repeat(n)}</div>
      <input class="pin-in" id="pin" inputmode="numeric" pattern="[0-9]*" maxlength="${n}" aria-label="비밀번호" autocomplete="one-time-code">
      <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button type="button" data-d="${d}">${d}</button>`).join('')}<button type="button" class="fn" data-d="clr">지우기</button><button type="button" data-d="0">0</button><button type="button" class="fn" data-d="del">←</button></div>
      <label class="remember"><input type="checkbox" id="remember"> 이 기기에서 30일 동안 묻지 않기</label>
    </form></div>`;
    let pin = '', busy = false, fails = 0;
    const draw = () => $$('.pin-dots i').forEach((el, i) => el.classList.toggle('on', i < pin.length));
    const tryPin = () => {
      if (pin.length < n || busy) return;
      busy = true;
      setTimeout(() => {
        if (Door.check('songgong', pin)) { Door.open('songgong', $('#remember').checked); start(); }
        else { fails++; const card = $('.lock-card'); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); pin = ''; draw(); if (fails >= 5) { busy = true; $('.lock-card p').textContent = '잠시 후 다시 시도하세요'; setTimeout(() => { busy = false; fails = 0; $('.lock-card p').textContent = '비밀번호를 입력하세요'; }, 15000); return; } }
        busy = false;
      }, 30);
    };
    const press = (d) => { if (busy) return; if (d === 'del') pin = pin.slice(0, -1); else if (d === 'clr') pin = ''; else if (pin.length < n) pin += d; draw(); if (pin.length === n) tryPin(); };
    $('.pad').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) press(b.dataset.d); });
    const input = $('#pin');
    input.addEventListener('input', () => { pin = input.value.replace(/\D/g, '').slice(0, n); input.value = ''; draw(); if (pin.length === n) tryPin(); });
    document.addEventListener('keydown', lockKeys);
    function lockKeys(e) {
      if (!$('.lock')) { document.removeEventListener('keydown', lockKeys); return; }
      if (/^[0-9]$/.test(e.key)) { press(e.key); e.preventDefault(); }
      else if (e.key === 'Backspace') { press('del'); e.preventDefault(); }
      else if (e.key === 'Escape' && EMBED) closeOverlay();
    }
  }

  /* ---------------- events ---------------- */
  function closeOverlay() {
    saveCur();
    if (EMBED) { try { window.parent.postMessage({ type: 'songgong:close' }, location.origin); } catch (e) { /* ignore */ } }
  }
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data) return;
    if (e.data.type === 'songgong:save') { saveCur(); try { e.source.postMessage({ type: 'songgong:saved' }, location.origin); } catch (err) { /* ignore */ } }
  });
  document.addEventListener('click', (e) => {
    const opt = e.target.closest('.opt');
    if (opt && S.view === 'quiz') { choose(+opt.dataset.i); return; }
    if (opt && S.view === 'mock') { mockChoose(+opt.dataset.i); return; }
    const el = e.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act;
    if (el.tagName === 'INPUT') return;
    switch (act) {
      case 'home': { if (S.view === 'mock') { saveMock(); stopMockTimer(); toast('모의고사는 그대로 두었습니다. 모의고사에서 이어서 풀 수 있습니다.'); }
        const leaving = S.view === 'quiz' && S.cur && S.cur.phase === 'q'; if (S.view === 'quiz' && S.cur) saveCur(); viewHome(); if (leaving) toast('풀던 문제는 기록하지 않았습니다. 처음 화면의 ‘이어서 풀기’로 돌아올 수 있습니다.'); break; }
      case 'notes': viewNotes(); break;
      case 'stats': viewStats(); break;
      case 'settings': viewSettings(); break;
      case 'close': closeOverlay(); break;
      case 'types': e.stopPropagation(); viewTypes(el.dataset.subj); break;
      case 'start': startSession({ subj: el.dataset.subj, type: el.dataset.type || '', mode: 'new', p5: el.dataset.p5 === '1' }); break;
      case 'resume': if (S.cur) (S.cur.phase === 'x' ? viewExplain() : viewQuiz()); break;
      case 'submit': submit(false); break;
      case 'skip': submit(true); break;
      case 'later': deferSetItem(); break;
      case 'mock': viewMockSetup(); break;
      case 'mk-start': if (!S.mock || S.mock.done || window.confirm('풀던 모의고사를 버리고 새로 시작할까요?')) startMock(el.dataset.k); break;
      case 'mk-resume': viewMock(); break;
      case 'mk-quit': if (window.confirm('풀던 모의고사를 버릴까요? 기록에 남지 않습니다.')) { S.mock = null; saveMock(); viewMockSetup(); } break;
      case 'mk-prev': mockGo(S.mock.i - 1); break;
      case 'mk-next': mockGo(S.mock.i + 1); break;
      case 'mk-go': mockGo(+el.dataset.i); break;
      case 'mk-flag': mockFlag(); break;
      case 'mk-sheet': { const o = $('#omr'); if (o) o.classList.toggle('open'); break; }
      case 'mk-submit': mockSubmitAsk(); break;
      case 'mk-review': reviewMockItem(+el.dataset.i); break;
      case 'next': next(); break;
      case 'same-type': sameType(); break;
      case 'star': toggleStar(); break;
      case 'goto-para': gotoPara(+el.dataset.n); break;
      case 'strike': toggleStrike(+el.dataset.i); break;
      case 'mark': toggleMark(el); break;
      case 'cause': { if (!S.cur) break; const rec = ensureRec(S.cur.q); rec.cause = rec.cause === el.dataset.v ? '' : el.dataset.v; putRec(rec); $$('[data-act="cause"]').forEach((b) => b.classList.toggle('on', b.dataset.v === rec.cause)); break; }
      case 'help': viewHelp(); break;
      case 'memo': { const w = $('.memo-wrap'); w.classList.toggle('hide'); if (!w.classList.contains('hide')) $('#memo').focus(); break; }
      case 'hide-q': {
        const q = S.cur && S.cur.q; if (!q) break;
        const key = seenKey(q); S.settings.hidden = [...new Set([...(S.settings.hidden || []), key])]; saveSettings();
        toast('이 문제를 지웠습니다. 다시 나오지 않습니다. (설정에서 되살릴 수 있습니다)'); next(); break;
      }
      case 'unhide-all': S.settings.hidden = []; saveSettings(); toast('지운 문제를 모두 되살렸습니다.'); viewSettings(); break;
      case 'flag': { const w = $('.flag-wrap'); w.classList.toggle('hide'); if (!w.classList.contains('hide')) $('#flag').focus(); break; }
      case 'nf-subj': noteFilter.subj = el.dataset.v; viewNotes(); break;
      case 'nf-kind': noteFilter.kind = el.dataset.v; viewNotes(); break;
      case 'open-note': openNote(el.dataset.id); break;
      case 'setup': viewSetup(); break;
      case 'set-subj': setPick.subj = el.dataset.v; viewSetup(); break;
      case 'set-n': setPick.n = +el.dataset.v; viewSetup(); break;
      case 'set-focus': setPick.focus = el.dataset.v; viewSetup(); break;
      case 'setup-weak': setPick.subj = el.dataset.subj; setPick.focus = 'weak'; viewSetup(); break;
      case 'set-start': startSet(); break;
      case 'set-result': viewSetResult(); break;
      case 'set-review': reviewSetItem(+el.dataset.i); break;
      case 'review-start': startSession({ subj: noteFilter.subj || '', type: '', mode: 'review' }); break;
      case 'set': S.settings[el.dataset.k] = el.dataset.v; saveSettings(); viewSettings(); break;
      case 'toggle': S.settings[el.dataset.k] = !S.settings[el.dataset.k]; saveSettings(); el.setAttribute('aria-checked', S.settings[el.dataset.k] ? 'true' : 'false'); break;
      case 'export': exportBackup(); break;
      case 'wipe': wipe(); break;
      case 'relock': Door.close('songgong'); toast('다음에 열 때 비밀번호를 다시 묻습니다.'); break;
      case 'copy-flags': {
        const txt = Array.from(S.items.values()).filter((it) => it.flag && SUBJ[it.subj]).map((it) => `[${it.qid}] ${SUBJ[it.subj].name} · ${it.type}\n문제: ${stemText(it.q.stem)}\n선택지: ${it.q.options.map((o, i) => `${i + 1}) ${plain(o)}`).join(' / ')}\n정답: ${it.q.answer + 1}번\n알린 내용: ${it.flag}`).join('\n\n');
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('복사했습니다.'), () => { prompt('아래 내용을 복사하세요', txt); });
        break;
      }
      default: break;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.closest && e.target.closest('.subj') && !e.target.closest('button')) { e.target.click(); return; }
  });
  document.addEventListener('change', (e) => { if (e.target.matches('[data-act="import"]') && e.target.files[0]) importBackup(e.target.files[0]); });
  let memoTimer = 0;
  document.addEventListener('input', (e) => {
    if (e.target.id === 'scratch') {
      const q = S.view === 'mock' && S.mock && !S.mock.done ? S.mock.items[S.mock.i].q : S.cur && S.cur.q; if (!q) return;
      const v = e.target.value; if (v.trim()) SCRATCH.set(q.id, v); else SCRATCH.delete(q.id); return;
    }
    if (!S.cur) return;
    if (e.target.id === 'memo' || e.target.id === 'flag') {
      const rec = ensureRec(S.cur.q); rec[e.target.id] = e.target.value;
      clearTimeout(memoTimer); memoTimer = setTimeout(() => { putRec(rec); const b = $(`[data-act="${e.target.id}"]`); if (b) b.classList.toggle('on', !!rec[e.target.id]); }, 400);
    }
  });
  document.addEventListener('keydown', (e) => {
    if ($('.lock')) return;
    const typing = e.target.closest && e.target.closest('textarea, input, select, [contenteditable]');
    if (typing) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (S.view === 'mock') {
      if (/^[1-5]$/.test(k)) { mockChoose(+k - 1); e.preventDefault(); }
      else if (k === 'ArrowRight' || k === 'Enter') { mockGo(S.mock.i + 1); e.preventDefault(); }
      else if (k === 'ArrowLeft') { mockGo(S.mock.i - 1); e.preventDefault(); }
      else if (k === 'f' || k === 'F') { mockFlag(); e.preventDefault(); }
      return;
    }
    if (S.view === 'quiz') {
      if (/^[1-5]$/.test(k)) { choose(+k - 1); e.preventDefault(); }
      else if (k === 'Enter') { submit(false); e.preventDefault(); }
      else if ((k === 'l' || k === 'L') && $('[data-act="later"]')) { deferSetItem(); e.preventDefault(); }
      else if (k === 'Escape') { saveCur(); if (EMBED) closeOverlay(); else viewHome(); }
    } else if (S.view === 'explain') {
      if ((k === 't' || k === 'T') && $('[data-act="same-type"]')) { sameType(); e.preventDefault(); return; }
      if (k === 'Enter' || k === 'ArrowRight') { if (!e.target.closest('button') || e.target.dataset.act === 'next') { next(); e.preventDefault(); } }
      else if (k === 's' || k === 'S') toggleStar();
      else if (k === 'm' || k === 'M') { const w = $('.memo-wrap'); w.classList.remove('hide'); $('#memo').focus(); e.preventDefault(); }
      else if (k === 'Escape') { if (EMBED) closeOverlay(); else viewHome(); }
    } else if (S.view === 'home') {
      const subj = ORDER.find((s) => SUBJ[s].key === k);
      if (subj) startSession({ subj, type: '', mode: 'new' });
      else if (k === 'w' || k === 'W') viewNotes();
      else if (k === 'Escape' && EMBED) closeOverlay();
    } else if (k === 'Escape') viewHome();
  });
  window.addEventListener('scroll', () => { const t = $('.top'); if (t) t.classList.toggle('scrolled', window.scrollY > 4); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { saveCur(); saveMock(); } drawTimer(); drawMockTimer(); });
  window.addEventListener('pagehide', () => { saveCur(); saveMock(); });

  /* ---------------- start ---------------- */
  let started = false;
  async function start() {
    if (started) return; started = true;
    await load();
    applySettings();
    if (S.cur && S.cur.q && SUBJ[S.cur.q.subject]) { S.ctx = S.cur.ctx; if (S.cur.phase === 'x') viewExplain(); else viewQuiz(); }
    else { S.cur = null; viewHome(); }
  }
  // test hook: show a given generated question (used by the automated walkthroughs)
  function showGen(subj, genId, seed, choice, lv) {
    const g = (P.gens[subj] || []).find((x) => x.id === genId); if (!g) return false;
    const q = P.make(subj, g, seed, lv); if (!q) return false;
    S.cur = { q, ctx: { subj, mode: 'new' }, phase: 'q', choice: null, ms: 0, ok: null, review: false, no: 1 };
    if (choice == null) viewQuiz(); else { S.cur.choice = choice; submit(choice < 0); }
    return true;
  }
  function showBank(subj, id, choice) {
    const src = (P.bank[subj] || []).find((x) => x.id === id); if (!src) return false;
    S.cur = { q: bankCopy(src, subj), ctx: { subj, mode: 'new' }, phase: 'q', choice: null, ms: 0, ok: null, review: false, no: 1 };
    if (choice == null) viewQuiz(); else { S.cur.choice = choice; submit(choice < 0); }
    return true;
  }
  window.SONGGONG = { startMock, finishMock, viewMock, S, nextQuestion, startSession, submit, choose, viewHome, DB, showGen, showBank };
  try { const v = localStorage.getItem('songgong.settings'); if (v) { S.settings = { ...DEFAULTS, ...JSON.parse(v) }; applySettings(); } } catch (e) { /* ignore */ }
  if (Door.isOpen('songgong')) start(); else viewLock();
})();
