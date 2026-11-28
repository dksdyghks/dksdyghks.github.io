// 연구실 책장 — a private PDF library and reader for one owner, on every device.
// The library lives on the owner's server (Cloudflare R2 behind a small Worker); this device keeps copies of what was
// opened, so files open at once and without a connection. Marks and reading positions are saved here first and sent on.
import * as api from './api.js?v=6f9f98f247';
import * as store from './store.js?v=6f9f98f247';
import * as pdfkit from './pdfkit.js?v=6f9f98f247';
import * as A from './analyze.js?v=6f9f98f247';
import { Reader, gradeSVG } from './reader.js?v=6f9f98f247';
import * as naming from './naming.js?v=6f9f98f247';
import * as cases from './cases.js?v=6f9f98f247';
import * as laws from './laws.js?v=6f9f98f247';
import * as papers from './papers.js?v=6f9f98f247';
import * as research from './research.js?v=6f9f98f247';
import * as biblio from './biblio.js?v=6f9f98f247';
import * as bills from './bills.js?v=6f9f98f247';
import * as kci from './kci.js?v=6f9f98f247';
import * as moleg from './moleg.js?v=6f9f98f247';
import * as precq from './precq.js?v=6f9f98f247';
import * as kciq from './kciq.js?v=6f9f98f247';
import * as pfind from './pfind.js?v=6f9f98f247';
import * as ccnews from './ccnews.js?v=6f9f98f247';
import * as verify from './verify.js?v=6f9f98f247';
import * as write from './write.js?v=6f9f98f247';

const $ = (s, r = document) => r.querySelector(s);
// the characters that turn the direction of the text around (a file named '\u202Efdp.exe' shows as 'exe.pdf'): never shown
const unbidi = (s) => String(s ?? '').replace(/[\u202A-\u202E\u2066-\u2069]/g, '');
const esc = (s) => unbidi(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeHref = (u) => (/^https?:\/\//i.test(String(u || '')) ? esc(u) : '#');   // an address from outside: http(s) only, escaped
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const VERSION = (document.documentElement.dataset.v || 'dev');
// no answer, said as it is (the same words everywhere): this device has no internet — '인터넷에 연결되면 …' — or it has, and
// the 책장 server did not answer — '책장 서버에 닿지 않습니다 · 잠시 뒤 다시 …' (the line at the top says the same)
const noNet = () => navigator.onLine === false;
const unreached = (then, again = '해 주세요') => (noNet() ? `인터넷에 연결되면 ${then}` : `책장 서버에 닿지 않습니다 · 잠시 뒤 다시 ${again}`);
const offline = (e) => !!e && (e.code === 'offline' || api.isOffline(e));

const S = {
  index: { folders: [], files: [] },
  state: { files: {} },
  view: { kind: 'home', folder: null },
  tabs: [],          // papers open as tabs on this device: { id, page, y, zoom, at }
  sort: 'added', q: '', select: null, prefs: {},
  lq: '', cq: '',    // what 법령 (lq) and 판례 (cq) were asked: two screens, each with its own question
  uploads: [], reader: null, readerId: null,
  cached: new Set(),
  info: {},          // where each paper was published: id -> { journal, society, issue, date } or null
};

const I = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
  tabs: '<svg viewBox="0 0 24 24"><rect x="3.5" y="7" width="13" height="13" rx="2"/><path d="M7.5 4h11a2 2 0 0 1 2 2v11"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  newfolder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  sort: '<svg viewBox="0 0 24 24"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/></svg>',
  select: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  papers: '<svg viewBox="0 0 24 24"><path d="M13 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21H11"/><path d="M13 3l5 5v3"/><path d="M13 3v5h5"/><circle cx="15.5" cy="16" r="3.2"/><path d="M17.9 18.4L20.5 21"/></svg>',
  // 판례: a gavel · 법령: a bound code with its lines
  gavel: '<svg viewBox="0 0 24 24"><path d="M9.5 7.5l5-5 7 7-5 5z"/><path d="M13 11l-8.5 8.5"/><path d="M13.5 21h7.5"/></svg>',
  code: '<svg viewBox="0 0 24 24"><path d="M5 19.5v-15A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5a1.5 1.5 0 0 0 1.5 1.5H19"/><path d="M9 7.5h6M9 11h6"/></svg>',
  cloud: '<svg viewBox="0 0 24 24"><path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.3 1.6A3.8 3.8 0 0 1 17 18z"/></svg>',
  device: '<svg viewBox="0 0 24 24"><path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.3 1.6A3.8 3.8 0 0 1 17 18z"/><path d="M9.5 13.5l2 2 3.5-4"/></svg>',
  pdf: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24"><path d="M3.5 12s3.1-5.5 8.5-5.5c1.6 0 3 .5 4.2 1.2M20.5 12s-3.1 5.5-8.5 5.5c-1.6 0-3-.5-4.2-1.2"/><path d="M9.9 14.1a3 3 0 0 1 4.2-4.2"/><path d="M4.5 19.5l15-15"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M3 12s3.3-6 9-6 9 6 9 6-3.3 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.8"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
  // 다듬기: a fountain pen's nib (its slit and breather hole) drawing a proofreader's wavy mark under a line — the owner's
  // own text set right, not written for them (no sparkle); the pencil stays for 이름 바꾸기
  polish: '<svg viewBox="0 0 24 24"><path d="M13.2 15.6L8.9 11.2l4.2-7.7 5.6 5.6z"/><path d="M13.2 15.6l2.6-3.6"/><circle cx="14.6" cy="10.3" r="1.25"/><path d="M3 20.4q1.6-1.7 3.2 0t3.2 0 3.2 0 3.2 0 3.2 0"/></svg>',
};

// the five menus, in this order everywhere (the rail, the iPad's top bar, the phone's bar at the foot): four kinds of sources,
// then the one that works on the owner's own text. (다듬기's view is still 'write' inside: saved state and #write links live on)
const VIEWS = [['home', 'home', '서재'], ['papers', 'papers', '논문'], ['cases', 'gavel', '판례'], ['law', 'code', '법령'], ['write', 'polish', '다듬기']];

/* ================= start ================= */
// the first screen is up (sign-in, the shelf, or a notice): index.html's watchdog stands down (it offers a fresh load after 12 s)
const booted = () => { try { if (window.__shelfUp) window.__shelfUp(); } catch (e) { /* no watchdog */ } };
async function boot() {
  document.documentElement.classList.toggle('touch', matchMedia('(pointer: coarse)').matches);
  api.setSignedOutHandler(() => showLogin('다른 곳에서 이 기기를 로그아웃했습니다. 비밀번호를 다시 넣어 주세요.'));
  api.setReachHandler((ok) => { renderOffline(); if (ok && syncOn) flushOps(); });
  S.prefs = (await store.get('kv', 'prefs').catch(() => null)) || {};
  await api.loadToken();
  if (!api.base()) { showSetup(); return; }
  if (!api.hasToken()) { showLogin(); return; }
  await startLibrary();
}

function deviceName() {
  const u = navigator.userAgent;
  if (/iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1)) return '아이패드';
  if (/iPhone/.test(u)) return '아이폰';
  if (/Android/.test(u)) return /Mobile/.test(u) ? '안드로이드 폰' : '안드로이드 태블릿';
  if (/Macintosh/.test(u)) return '맥';
  if (/Windows/.test(u)) return '윈도우 PC';
  return '컴퓨터';
}

function showSetup() {
  booted();
  document.body.innerHTML = `<div class="gate"><div class="gate-card"><h1 class="brand-big">연구실 책장</h1><p class="gate-s">책장 서버를 준비하고 있습니다.<br>준비가 끝나면 이 화면에서 바로 쓸 수 있습니다.</p></div></div>`;
}

/* ================= sign-in ================= */
function showLogin(message) {
  syncOn = false; clearTimeout(pullT); pullT = null;   // nothing goes to the server until the PIN is in
  if (S.reader) { S.reader.destroy(); S.reader = null; }
  booted();
  let pin = '', busy = false;
  document.body.innerHTML = `<div class="gate"><div class="gate-card" role="dialog" aria-label="연구실 책장 로그인">
    <h1 class="brand-big">연구실 책장</h1>
    <p class="gate-s">${esc(message || '비밀번호 6자리를 넣어 주세요')}</p>
    <div class="dots" aria-hidden="true">${'<i></i>'.repeat(6)}</div>
    <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-d="${n}">${n}</button>`).join('')}<span></span><button data-d="0">0</button><button data-d="del" aria-label="지우기">←</button></div>
    <p class="gate-note">이 기기에서는 처음 한 번만 넣으면 됩니다.</p></div></div>`;
  const msg = $('.gate-s'), card = $('.gate-card');
  const draw = () => document.querySelectorAll('.dots i').forEach((d, i) => d.classList.toggle('on', i < pin.length));
  const press = async (k) => {
    if (busy) return;
    if (k === 'del') pin = pin.slice(0, -1); else if (pin.length < 6) pin += k;
    if (msg.classList.contains('err') && pin.length === 1) { msg.classList.remove('err'); msg.removeAttribute('role'); }   // (typing again: the line goes back to its hint colour, its words stay)
    draw();
    if (pin.length < 6) return;
    busy = true; msg.classList.remove('err'); msg.textContent = '확인하는 중…';
    try {
      await api.login(pin, deviceName());
      await startLibrary();
    } catch (e) {
      pin = ''; draw(); busy = false;
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      const wait = () => { const m = Math.max(1, Math.ceil(((e.until || Date.now()) - Date.now()) / 60000)); return m >= 60 ? '1시간' : m + '분'; };
      msg.classList.add('err'); msg.setAttribute('role', 'alert');   // (said in the danger colour, with the shake — not as the grey hint)
      if (e.code === 'pin') msg.textContent = `비밀번호가 다릅니다${e.left != null ? ` · ${e.left}번 남음` : ''}`;
      else if (e.code === 'locked' && e.slow) msg.textContent = '시도가 많습니다 · 1분 뒤 다시 넣어 주세요';
      else if (e.code === 'locked') msg.textContent = `여러 번 틀렸습니다 · ${wait()} 뒤 다시 넣어 주세요`;
      else if (api.isOffline(e)) msg.textContent = navigator.onLine ? '책장 서버에 아직 연결할 수 없습니다. 잠시 뒤에 다시 해 주세요.' : '인터넷에 연결되어 있지 않습니다';
      else msg.textContent = '지금은 로그인할 수 없습니다. 잠시 뒤에 다시 해 주세요.';
    }
  };
  $('.pad').onclick = (e) => { const b = e.target.closest('[data-d]'); if (b) press(b.dataset.d); };
  document.onkeydown = (e) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); };
}

/* ================= library ================= */
async function startLibrary() {
  document.onkeydown = null;
  store.persist();
  const kept = await store.get('kv', 'index').catch(() => null);
  S.index = kept || S.index;
  S.indexKnown = !!kept; S.indexSrc = kept ? 'store' : '';   // (a new device: the shelf is not known until the server says)
  if (kept) noteLastN();
  S.state = (await store.get('kv', 'state')) || S.state;
  S.cached = new Set(await store.keys('files').catch(() => []));
  S.info = (await store.get('kv', 'paperInfo').catch(() => null)) || {};
  texted = new Set((await store.keys('texts').catch(() => [])).map(String));
  infoAsked = (await store.get('kv', 'paperInfoAsked').catch(() => null)) || {};
  await loadTabs();
  await uiLoad();
  renderShell();
  laws.lawIndex();   // the names of every filed law, so a citation in a paper links to its law from the first page read
  render();
  booted();
  await refresh(true);
  flushOps();   // changes kept while offline (or signed out: a device signed in again) go out now
  syncMarksAll();
  pushState();
  if (!wired) {   // once per page, even after signing in again
    wired = true;
    window.addEventListener('online', async () => { if (!syncOn) return; await flushOps(); refresh(); syncMarksAll(); pushState(); renderOffline(); });
    window.addEventListener('offline', () => { if (syncOn) renderOffline(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !syncOn) return;
      lastTouch = Date.now(); if (!pullT) pullLoop();
      flushOps(); syncMarksAll(); pushState(); pull();
      if (Date.now() - (UI.pulled || 0) > 10 * 60e3) { UI.pulled = Date.now(); uiPull(); }
    });
    window.addEventListener('popstate', onPop);
  }
  syncOn = true; lastTouch = Date.now();
  pullLoop();
  setTimeout(uiPull, 2500);   // (the marks' names and the articles watched, as the other devices left them)
  watchSoon(12000);            // (the articles watched: counted again once a day, idle, no paper open)
  citedLoad(); setTimeout(() => { const go = () => citedScan().catch(() => {}); if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 8000 }); else go(); }, 15000);
  setTimeout(() => fetchAllMarks(), 4000);
  ocrSoon(6000);
  setTimeout(() => fillPaperInfo(), 9000);
  setTimeout(seedPapers, 7000);
  setTimeout(async () => {   // once a day: which outside sources answer from here (the server keeps the answer, for fixing what is blocked)
    if (Date.now() - ((await store.get('kv', 'diagAt').catch(() => 0)) || 0) < 864e5 || !navigator.onLine) return;
    store.put('kv', 'diagAt', Date.now()); api.diagnose().catch(() => {});
  }, 20000);
  const m = /#r=([0-9a-f]{24})/.exec(location.hash);
  if (m && fileById(m[1])) openFile(m[1], { replace: true, resume: true });
  else {
    const h = /^#(law|cases|papers)(?:=(.*))?$/.exec(location.hash), f = /^#f=(.+)$/.exec(location.hash);
    let openNo = '';   // (#cases=2007헌마1001&open=2007헌마1001: the decision's sheet open over its screen)
    if (h) {
      let raw = h[2] || '';
      const om = /&open=([^&]*)$/.exec(raw); if (om) { openNo = unhash(om[1]); raw = raw.slice(0, om.index); }
      const v = unhash(raw);
      S.view = { kind: h[1], folder: null };
      if (h[1] === 'papers') S.pq = v;
      else if (h[1] === 'cases') S.cq = v;
      else if (caseLike(v)) { S.view.kind = 'cases'; S.cq = v; }   // a link from when 판례 and 법령 were one screen: a case is 판례's
      else S.lq = v;
      render();
    }
    else if (f && folderById(f[1])) { S.view = { kind: 'home', folder: f[1] }; render(); }
    else if (location.hash === '#trash') { S.view = { kind: 'trash', folder: null }; render(); }
    else if (location.hash === '#write' || location.hash === '#polish') { S.view = { kind: 'write', folder: null }; render(); }   // (#polish: 다듬기 by its name)
    history.replaceState({ nav: navNow(), depth: 0 }, '', location.pathname + location.search + (navHash(navNow()) === '#' ? '' : navHash(navNow())));
    lastDepth = 0;
    if (openNo) { if (cases.caseQuery(openNo)) caseSheet(cases.caseQuery(openNo)); else if (laws.courtQuery(openNo)) courtSheet(openNo); }
  }
}

const syncTags = { lib: '', state: '', marks: '', marksId: '' };
let pullT = null, pulling = false, syncOn = false, wired = false;
let lastTouch = Date.now();
function pullLoop() {
  clearTimeout(pullT); pullT = null;
  if (!syncOn) return;
  const idle = Date.now() - lastTouch;
  if (idle > 15 * 60e3) return;   // asleep until someone touches the screen again
  pullT = setTimeout(async () => { await pull(); pullLoop(); }, idle > 3 * 60e3 ? 30000 : S.readerId ? 3000 : 8000);
}
function touched() {
  const asleep = !pullT;
  lastTouch = Date.now();
  if (asleep && syncOn && !document.hidden) { pull(); pullLoop(); }
}
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => document.addEventListener(ev, touched, { passive: true, capture: true }));
async function pull() {
  if (!syncOn || pulling || document.hidden || !navigator.onLine) return;
  pulling = true;
  try {
    const id = S.readerId || '';
    const r = await api.sync({ lib: syncTags.lib, state: syncTags.state, marks: id, mtag: id && id === syncTags.marksId ? syncTags.marks : '' });
    if (r.lib) {
      S.index = r.lib; applyPending(await store.get('kv', 'pendingOps')); await store.put('kv', 'index', S.index);
      S.indexKnown = true; S.indexSrc = 'server';
      if (S.reader) {
        renderUsage(); readerSync(); const f = fileById(S.readerId);
        noteGone();
        if (f && f.ocr && !S.reader.ocr) { const rd = S.reader; Promise.all([ocrData(f), textOf(f).catch(() => null)]).then(([d, t]) => { if (d && S.reader === rd) rd.setOcr(d.pages, t); }); }
      } else renderBg();
      setTimeout(prefetch, 800); setTimeout(preparePending, 300); if (liveFiles().some(needsOcr)) ocrSoon();
    }
    if (r.libTag) syncTags.lib = r.libTag;
    if (r.state) { mergeState(r.state); await store.put('kv', 'state', S.state); if (!S.reader) renderBg(); }
    if (r.stateTag) syncTags.state = r.stateTag;
    if (id && r.marks && S.readerId === id) await takeMarks(id, r.marks.marks || [], r.marksTag);
    if (id && r.marksTag && S.readerId === id) { syncTags.marks = r.marksTag; syncTags.marksId = id; }
  } catch (e) { /* offline or busy: the next round */ } finally { pulling = false; }
}
// the paper being read went to the trash on another device (the library came from the server: pull, refresh, flushOps) —
// said once, with 되살리기; reading goes on. This device's own changes (doOps) are taken in quietly.
const isGone = (f) => !!f && (!!f.trashed || folderTrashed(f.folder));
let readerGone = false;
function noteGone(quiet) {
  if (!S.reader) return;
  const f = fileById(S.readerId), gone = isGone(f);
  if (gone && !readerGone && !quiet) toast('다른 기기에서 이 논문을 휴지통으로 옮겼습니다', 10000, f.trashed ? { label: '되살리기', fn: () => doOps([{ op: 'restoreFile', id: f.id }], '되살렸습니다') } : undefined);
  readerGone = gone;
}
// the open paper's ★△✕ (and its tabs' titles) as the shelf now has them: after a pull, a flush of what was kept offline, a
// change made here or on another device (drawn only when they differ)
let readerTabsSig = '';
function readerSync() {
  if (!S.reader) return;
  const f = fileById(S.readerId);
  if (f && (f.stars || 0) !== (S.reader.stars || 0)) S.reader.setStars(f.stars || 0);
  const ti = tabInfo(), sig = JSON.stringify(ti);
  if (sig !== readerTabsSig) { readerTabsSig = sig; S.reader.setTabs(ti); }
}
// marks from another device, merged with this device's own (nothing is dropped: each mark keeps its newest version)
async function takeMarks(id, remote, tag) {
  const local = (await store.get('marks', id)) || { marks: [], pending: false };
  let merged = mergeMarks(remote, local.marks);
  if (S.reader && S.readerId === id) {
    if (S.reader.drag) return;   // in the middle of a stroke: next round
    merged = mergeMarks(merged, S.reader.allMarks);
    const sig = (l) => l.map((m) => m.id + ':' + m.t).sort().join(',');
    if (sig(merged) !== sig(S.reader.allMarks)) S.reader.setRemoteMarks(merged);
  }
  await store.put('marks', id, { marks: merged, pending: local.pending, tag: tag || local.tag || '' });
  marksCache = null;
}

let preparing = false;
async function preparePending() {
  if (preparing || !navigator.onLine || document.hidden) return;
  if (!liveFiles().some((f) => f.pending)) return;
  preparing = true;
  try {
    for (const f0 of liveFiles().filter((f) => f.pending)) {
      if (!navigator.onLine || document.hidden) break;
      const f = fileById(f0.id); if (!f || !f.pending) continue;
      const set = { pending: false };
      let doc = null;
      try { doc = await pdfkit.openBytes(await (await getBytes(f)).arrayBuffer()); }
      catch (e) { if (api.isOffline(e)) break; }   // a PDF that will not open: stop trying, it stays as it came
      if (doc) {
        set.pages = doc.numPages;
        let first = null;
        try {
          const p1 = (await pdfkit.pageItems(doc, 0)).page;
          const p2 = doc.numPages > 1 ? (await pdfkit.pageItems(doc, 1)).page : null;
          first = await nameFromBand(doc, p1, p2, naming.withFileName(naming.readFirstPages(p1, p2, await morePages(doc), await kci.names()), f.orig || f.name), f.orig || f.name);
          if ((S.prefs.autoName !== false || /^공유로 넣은 PDF/.test(f.name)) && first && first.name) set.name = first.name + '.pdf';
        } catch (e) { /* keeps its name */ }
        try { const th = await pdfkit.thumbnail(doc); await api.putMeta(f.id, 'thumb', th, 'image/jpeg'); await store.put('thumbs', f.id, th); set.thumb = true; } catch (e) { /* no picture */ }
        try {
          const t = await pdfkit.textIndex(doc, A); t.paper = paperOf(first); notePaper(f.id, t);
          await api.putMeta(f.id, 'text', await pdfkit.gzipJSON(t), 'application/gzip'); await store.put('texts', f.id, t); set.text = true;
          const scan = (await pdfkit.picturePages(doc, t.pages).catch(() => [])).length; if (scan) set.scan = scan;
        } catch (e) { /* not searchable */ }
        doc.destroy();
      }
      try {
        const r = await api.ops([{ op: 'updateFile', id: f.id, set }]);
        S.index = r.index; applyPending(await store.get('kv', 'pendingOps')); await store.put('kv', 'index', S.index); syncTags.lib = '';
        if (set.scan) ocrSoon(1500);
        if (S.reader) { renderUsage(); readerSync(); } else renderBg();
      } catch (e) { break; }
    }
  } finally { preparing = false; }
}

async function loadTabs() { try { S.tabs = (await store.get('kv', 'tabs')) || []; } catch (e) { S.tabs = []; } }

async function refresh(first) {
  try {
    const [idx, st] = await Promise.all([api.library(), api.getState()]);
    S.index = idx; applyPending(await store.get('kv', 'pendingOps')); await store.put('kv', 'index', S.index); noteGone();
    const was = S.indexKnown; S.indexKnown = true; S.indexSrc = 'server'; noteLastN();
    mergeState(st); await store.put('kv', 'state', S.state);
    if (S.reader) { renderUsage(); readerSync(); } else if (!was) render(); else renderBg();
    setTimeout(prefetch, 1500); setTimeout(preparePending, 600);
  } catch (e) {
    if (first && !api.isOffline(e) && e.code !== 'auth') toast('책장을 불러오지 못했습니다. 잠시 뒤에 다시 시도합니다.');
    // (no answer on a device that had no shelf yet: the grey rows give way to a line that says so — not to '비어 있습니다')
    if (!S.indexKnown) { S.indexKnown = true; if (!S.reader) render(); }
  }
  renderOffline();
}

function mergeState(st) {
  for (const [id, v] of Object.entries((st && st.files) || {})) {
    const cur = S.state.files[id];
    if (!cur || v.at > cur.at) S.state.files[id] = v;
  }
}

const liveFiles = () => S.index.files.filter((f) => !f.trashed && !folderTrashed(f.folder));
function folderTrashed(id) {
  let f = folderById(id), guard = 0;
  while (f && guard++ < 100) { if (f.trashed) return true; f = folderById(f.parent); }
  return false;
}
const fileById = (id) => S.index.files.find((f) => f.id === id);
const folderById = (id) => (id ? S.index.folders.find((f) => f.id === id) : null);
const childFolders = (id) => S.index.folders.filter((f) => (f.parent ?? null) === (id ?? null) && !f.trashed).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
function folderPath(id) { const out = []; let f = folderById(id), g = 0; while (f && g++ < 50) { out.unshift(f); f = folderById(f.parent); } return out; }

/* ---------- choices kept across devices: the marks' names (A18), the articles watched (A19) ----------
   Kept here at once (kv 'uiPrefs') and sent with the server's prefs as { ui: { key: { at, v } } } — the newest word for each
   key wins on every device. A server that does not keep ui yet answers without it: the choice stays on this device and is
   sent again later (never in a loop: once a start, and when a choice changes). */
const UI = { v: {}, at: {}, q: {}, t: 0, on: new Map() };
async function uiLoad() {
  const k = await store.get('kv', 'uiPrefs').catch(() => null);
  if (k && typeof k === 'object') { UI.v = k.v || {}; UI.at = k.at || {}; UI.q = k.q || {}; }
}
const uiSave = () => store.put('kv', 'uiPrefs', { v: UI.v, at: UI.at, q: UI.q }).catch(() => {});
const uiGet = (k, d) => (UI.v[k] !== undefined ? UI.v[k] : d);
function uiSet(k, v, quiet) {
  UI.v[k] = v; UI.at[k] = Date.now(); UI.q[k] = 1; uiSave();
  clearTimeout(UI.t); UI.t = setTimeout(uiPush, 900);
  if (!quiet) for (const fn of UI.on.get(k) || []) { try { fn(v); } catch (e) { /* its own */ } }
}
const uiWhen = (k, fn) => { UI.on.set(k, [...(UI.on.get(k) || []), fn]); };
function uiMerge(ui) {
  if (!ui || typeof ui !== 'object') return;
  const changed = [];
  for (const [k, x] of Object.entries(ui)) {
    if (!x || !Number.isFinite(x.at) || (UI.at[k] && x.at <= UI.at[k])) continue;
    UI.v[k] = x.v; UI.at[k] = x.at; delete UI.q[k]; changed.push(k);
  }
  if (!changed.length) return;
  uiSave();
  for (const k of changed) for (const fn of UI.on.get(k) || []) { try { fn(UI.v[k]); } catch (e) { /* its own */ } }
}
async function uiPush() {
  const ks = Object.keys(UI.q);
  if (!ks.length || !navigator.onLine || !api.base() || !api.hasToken()) return;
  const ui = {}; for (const k of ks) ui[k] = { at: UI.at[k], v: UI.v[k] };
  try {
    const r = await fetch(api.base() + '/api/prefs', { method: 'PUT', cache: 'no-store', headers: { 'content-type': 'application/json', ...api.authHeader() }, body: JSON.stringify({ hidden: {}, ui }) });
    if (!r.ok) return;
    const d = await r.json().catch(() => null);
    if (d && d.ui && typeof d.ui === 'object') {   // (kept there: what was sent is sent no more)
      for (const k of ks) if (d.ui[k] && d.ui[k].at >= UI.at[k]) delete UI.q[k];
      uiSave(); uiMerge(d.ui);
    }
  } catch (e) { /* sent with the next change, or the next start */ }
}
async function uiPull() {
  if (!navigator.onLine || !api.hasToken()) return;
  try { const r = await api.getPrefs(); if (r && r.ui) uiMerge(r.ui); if (r && r.hidden) kciMerge(r.hidden); } catch (e) { /* this device's word stands */ }
  if (Object.keys(UI.q).length) uiPush();
}

/* ---------- the marks' names (★ 인용 후보 · ★★ 중요 · ★★★ 핵심 · △ 보류 · ✕ 안 씀), the owner's own words, set in 설정 ---------- */
const MARKS = [[1, '★'], [2, '★★'], [3, '★★★'], [-2, '△'], [-1, '✕']];
const MARK_DEF = { 1: '인용 후보', 2: '중요', 3: '핵심', '-2': '보류', '-1': '안 씀' };
const markName = (g) => { const v = (uiGet('markNames', {}) || {})[g]; return (typeof v === 'string' && v.trim()) ? v.trim().slice(0, 12) : MARK_DEF[g]; };
// 서재 by mark: 전체 · ★ (any star) · △ · ✕ — the shelf's papers with that mark, from this folder down, as one list (kept per device)
const MF = 'shelf.markFilter';
const MFS = { star: { glyph: '★', test: (f) => f.stars > 0, name: () => `${markName(1)} 이상` }, tri: { glyph: '△', test: (f) => f.stars === -2, name: () => markName(-2) }, x: { glyph: '✕', test: (f) => f.stars === -1, name: () => markName(-1) } };
let markFilter = (() => { try { const v = localStorage.getItem(MF) || ''; return MFS[v] ? v : ''; } catch (e) { return ''; } })();
const anyMarked = () => liveFiles().some((f) => f.stars);
const mfOn = () => (markFilter && S.view.kind === 'home' && !S.q && anyMarked() ? MFS[markFilter] : null);
function setMarkFilter(v) {
  markFilter = MFS[v] ? v : '';
  try { if (markFilter) localStorage.setItem(MF, markFilter); else localStorage.removeItem(MF); } catch (e) { /* this time only */ }
  S.select = null; render();
  const c = $('.content'); if (c) c.scrollTop = 0;
}
const inSubtree = (fid, root) => { if (!root) return true; let f = folderById(fid), g = 0; while (f && g++ < 60) { if (f.id === root) return true; f = folderById(f.parent); } return false; };
function mfHtml() {
  const on = markFilter;
  const n = (k) => liveFiles().filter(MFS[k].test).length;
  return `<div class="pp-sort mk-f" role="group" aria-label="표지로 거르기" style="margin:-1px 0 -1px auto"><button type="button" data-mf="" class="${on ? '' : 'on'}" aria-pressed="${on ? 'false' : 'true'}">전체</button>${Object.entries(MFS).map(([k, m]) => (n(k) ? `<button type="button" data-mf="${k}" class="${on === k ? 'on' : ''}" aria-pressed="${on === k ? 'true' : 'false'}" title="${esc(m.name())} · ${n(k)}편">${m.glyph}<small style="margin-left:3px;font-weight:500">${n(k)}</small></button>` : '')).join('')}</div>`;
}

uiWhen('markNames', () => { if ($('.app') && !S.reader) renderBg(); });

/* ---------- 조문 지켜보기 (A19) ----------
   An article watched (its card's 지켜보기): how many 헌재 decisions, court judgments and pending bills it had when last seen,
   and how many now — counted again once a day while the app stands idle and no paper is open (three asks an article at most:
   cases.byLawAll, precq.citingAll, the bills), never while one is read. 법령's first screen says what is new ('새 결정 1 ·
   새 법안 2'); opening the article takes it as seen. Kept with the server like the marks' names (ui 'watch'). */
const WATCH_MAX = 30, WATCH_DAY = 20 * 3600e3;
const watchKey = (a) => `${laws.lawId ? laws.lawId(a.law) : String(a.law).replace(/\s+/g, '')}|${a.art}|${a.sub || 0}|${a.para || 0}`;
const watchList = () => { const l = uiGet('watch', []); return Array.isArray(l) ? l.filter((w) => w && w.k && w.law && typeof w.art === 'number') : []; };
const watchOf = (a) => watchList().find((w) => w.k === watchKey(a)) || null;
const watchLabel = (a) => `${shortLaw(a.law)} ${laws.artLabel(a)}${a.para ? ` 제${a.para}항` : ''}`;
const watchNews = (w) => {
  const d = (k) => (w.now && w.seen && Number.isFinite(w.now[k]) && Number.isFinite(w.seen[k]) ? Math.max(0, w.now[k] - w.seen[k]) : 0);
  return [['hj', '새 결정'], ['ct', '새 판결'], ['bl', '새 법안']].map(([k, t]) => (d(k) ? `${t} ${d(k)}` : '')).filter(Boolean).join(' · ');
};
function watchSave(list) { uiSet('watch', list.slice(0, WATCH_MAX)); }
// how many there are now (asked as 판례 and the article's page ask them: kept answers, no second ask on the same day)
async function watchCounts(a) {
  const own = !!laws.LAWS[a.law], ref = `${a.law} ${laws.artLabel(a)}${a.para ? ` 제${a.para}항` : ''}`;
  const name = laws.oldLaw(a.law) ? a.law : a.law === '헌법' ? '헌법' : await laws.lawOf(a.law).then((x) => (x && x.name) || a.law, () => a.law);
  const tot = (p) => p.then((r) => (r && Number.isFinite(r.total) ? r.total : null), () => null);
  const [hj, ct, bl] = await Promise.all([
    tot(own ? cases.byHolding(ref, 1) : typeof cases.byLawAll === 'function' ? cases.byLawAll(name, a.art, a.para, 1) : cases.byLaw(name, a.art, a.para, 1)),
    tot(typeof precq.citingAll === 'function' ? precq.citingAll(name, a.art, a.sub, 1) : precq.citing(name, a.art, a.sub, 1)),
    bills.byAssembly(name) ? bills.pending(name).then((d) => (d ? bills.touching(d, a.art, a.sub).length : null), () => null) : Promise.resolve(null),
  ]);
  return { hj, ct, bl };
}
const keepNum = (x, y) => (Number.isFinite(x) ? x : y);
async function watchToggle(a, btn) {
  const k = watchKey(a), list = watchList(), was = list.find((w) => w.k === k);
  if (was) {
    watchSave(list.filter((w) => w.k !== k)); watchBtn(btn, false);
    toast('지켜보기를 그만두었습니다', 5000, { label: '되돌리기', fn: () => { watchSave([was, ...watchList().filter((w) => w.k !== k)]); watchBtn(btn, true); paintWatch(); } });
    paintWatch(); return;
  }
  const w = { k, law: a.law, art: a.art, sub: a.sub || 0, para: a.para || 0, label: watchLabel(a), seen: null, now: null, chk: 0, at: Date.now() };
  watchSave([w, ...list]); watchBtn(btn, true); paintWatch();
  toast('이 조문을 지켜봅니다 · 새 결정·판결·법안이 나오면 법령 첫 화면에 표시합니다', 4200);
  const c = await watchCounts(a).catch(() => null);
  if (c) watchSeen(a, c);
}
function watchSeen(a, c) {   // opened (or just watched): what there is now is what was seen
  const k = watchKey(a), list = watchList(), w = list.find((x) => x.k === k); if (!w) return;
  const now = { hj: keepNum(c && c.hj, w.now && w.now.hj), ct: keepNum(c && c.ct, w.now && w.now.ct), bl: keepNum(c && c.bl, w.now && w.now.bl) };
  if (JSON.stringify(now) === JSON.stringify(w.now) && JSON.stringify(now) === JSON.stringify(w.seen)) return;
  watchSave(list.map((x) => (x.k === k ? { ...x, now, seen: { ...now }, chk: Date.now() } : x)));
  paintWatch();
}
const watchBtn = (b, on) => { if (!b) return; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('on', on); b.innerHTML = `${on ? I.eye : I.bell}<span>${on ? '지켜보는 중' : '지켜보기'}</span>`; };
// once a day, idle, no paper open: each watched article counted again (one at a time, a pause between)
let watchBusy = false;
async function watchCheck() {
  if (watchBusy || S.reader || S.readerId || document.hidden || !navigator.onLine) return;
  const due = watchList().filter((w) => Date.now() - (w.chk || 0) > WATCH_DAY);
  if (!due.length) return;
  watchBusy = true;
  try {
    for (const w of due.slice(0, 6)) {
      if (S.reader || S.readerId || document.hidden) break;   // (a paper opened meanwhile: the rest wait for the next idle time)
      const c = await watchCounts(w).catch(() => null);
      if (!c) continue;
      const list = watchList(), x = list.find((y) => y.k === w.k); if (!x) continue;
      const now = { hj: keepNum(c.hj, x.now && x.now.hj), ct: keepNum(c.ct, x.now && x.now.ct), bl: keepNum(c.bl, x.now && x.now.bl) };
      watchSave(list.map((y) => (y.k === w.k ? { ...y, now, seen: y.seen || { ...now }, chk: Date.now() } : y)));
      paintWatch();
      await new Promise((ok) => setTimeout(ok, 1500));
    }
  } finally { watchBusy = false; }
}
function watchSoon(ms) { clearTimeout(watchSoon.t); watchSoon.t = setTimeout(() => { const go = () => watchCheck(); if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 4000 }); else go(); }, ms); }
setInterval(() => watchSoon(1000), 60 * 60e3);
uiWhen('watch', () => paintWatch());
// 법령's first screen: the articles watched, what is new on each (only this line is drawn again when the counts change)
function watchRowHtml() {
  const list = watchList();
  if (!list.length) return '';
  const chip = (w) => { const news = watchNews(w); return `<button type="button" data-lq="${esc(`${w.law} ${laws.artLabel(w)}${w.para ? ` 제${w.para}항` : ''}`)}"${news ? ' class="lw-new"' : ''}><span>${esc(w.label || watchLabel(w))}</span>${news ? `<small><b>${esc(news)}</b></small>` : '<small>새 소식 없음</small>'}</button>`; };
  return `<h2 class="sec-h">지켜보는 조문</h2><div class="lh"><div class="lh-row"><span class="lh-k">${list.length}개</span><div class="lh-v">${list.map(chip).join('')}</div></div></div>`;
}
function paintWatch() { for (const at of document.querySelectorAll('.lw-watch')) paint(at, watchRowHtml()); }

/* ---------- 내 서재가 많이 인용한 결정 (A21) ----------
   Once a day, in idle moments, the page texts kept on this device are read for 헌재 case numbers (cases.scanCases, as the
   reader links them) and each counted once a paper: the eight cited by the most papers, kept (kv 'citedTop'), are a row on
   판례's first screen. Nothing is drawn while it reads; a list that is new when 판례's first screen is up waits for its next
   drawing (the screen is not pushed down under the reader). */
let citedTop = null, citedBusy = false;
async function citedLoad() { if (!citedTop) citedTop = (await store.get('kv', 'citedTop').catch(() => null)) || { at: 0, list: [] }; return citedTop; }
async function citedScan() {
  await citedLoad();
  if (citedBusy || Date.now() - (citedTop.at || 0) < 864e5 || S.reader || document.hidden) return;
  citedBusy = true;
  try {
    const n = new Map();
    const files = liveFiles().filter((f) => f.text && texted.has(f.id));
    if (files.length < 3) return;
    for (const f of files) {
      if (S.reader) return;   // (a paper opened: the rest another time)
      await new Promise((ok) => (window.requestIdleCallback ? requestIdleCallback(ok, { timeout: 800 }) : setTimeout(ok, 30)));
      const t = await store.get('texts', f.id).catch(() => null);
      if (!t || !t.pages) continue;
      const nos = new Set();
      for (const pg of t.pages) { if (!pg || !/\d헌[가-힣]/.test(pg)) continue; for (const c of cases.scanCases(pg)) nos.add(c.no); }
      for (const no of nos) n.set(no, (n.get(no) || 0) + 1);
    }
    const list = [...n.entries()].filter(([, k]) => k >= 2).sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0])).slice(0, 8).map(([no, k]) => ({ no, n: k }));
    // (a device still fetching the texts: what it has is shown, and read again at the next start until nearly all are here)
    const all = liveFiles().filter((f) => f.text).length;
    citedTop = { at: files.length >= all * 0.8 ? Date.now() : 0, list, of: files.length };
    store.put('kv', 'citedTop', citedTop).catch(() => {});
  } finally { citedBusy = false; }
}
function citedRowHtml() {
  const l = citedTop && citedTop.list;
  if (!l || !l.length) return '';
  return lhRow('내 서재가 많이 인용한 결정', l.map((x) => `<button type="button" data-case-open="${esc(x.no)}"><span>${esc(x.no)}</span><small>${x.n}편</small></button>`).join(''));
}

function renderShell() {
  document.body.innerHTML = `
  <div class="app">
    <aside class="rail">
      <div class="brand"><span class="brand-mark"></span><b>연구실 책장</b></div>
      <button class="btn primary up-btn">${I.up}<span>PDF 올리기</span></button>
      <nav class="views" aria-label="메뉴">${VIEWS.map(([k, ico, t]) => `
        <button data-view="${k}">${I[ico]}<span>${t}</span></button>`).join('')}
      </nav>
      <div class="tree-h">폴더</div>
      <div class="tree"></div>
      <div class="rail-foot">
        <div class="usage"><div class="usage-t"></div><div class="usage-bar"><i></i></div><div class="usage-d"></div></div>
        <div class="foot-row"><button class="settings-btn">${I.gear}<span>설정</span></button><button class="trash-btn" aria-label="휴지통">${I.trash}<span>휴지통</span></button></div>
      </div>
    </aside>
    <div class="scrim"></div>
    <main class="main">
      <header class="bar">
        <button class="ib menu-btn" aria-label="폴더 · 휴지통 · 설정">${I.menu}</button>
        <nav class="crumbs" aria-label="지금 보는 곳"></nav>
        <nav class="topnav" aria-label="메뉴">${VIEWS.map(([k, ico, t]) => `<button data-view="${k}">${I[ico]}<span>${t}</span></button>`).join('')}</nav>
        <button class="tabs-btn" hidden></button>
      </header>
      <div class="toolrow"><div class="tools"></div><label class="find">${I.search}<input type="search" placeholder="제목과 본문에서 찾기" enterkeyhint="search" autocomplete="off"></label></div>
      <div class="offline" hidden>인터넷에 연결되어 있지 않습니다 · 이 기기에 받아 둔 파일만 열 수 있습니다</div>
      <section class="content"></section>
    </main>
    <nav class="tabbar" aria-label="메뉴">${VIEWS.map(([k, ico, t]) => `<button type="button" data-view="${k}">${I[ico]}<span>${t}</span></button>`).join('')}</nav>
    <div class="uploads" hidden></div>
    <div class="toast" hidden></div>
    <input type="file" class="file-in" accept="application/pdf,.pdf" multiple hidden>
    <input type="file" class="dir-in" webkitdirectory multiple hidden>
  </div>`;
  const app = $('.app');
  $('.up-btn').onclick = () => uploadBox();
  $('.file-in').onchange = (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) upload(fs); closeRail(); };
  $('.dir-in').onchange = (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) upload(fs); else toast('그 폴더에 PDF가 없습니다'); closeRail(); };
  // a menu (서재 · 논문 · 판례 · 법령 · 다듬기, or 휴지통): each comes back scrolled where it was left
  const goView = (kind) => { noteScroll(); clearTimeout(S.qT); clearTimeout(S.sugT); S.view = { kind, folder: null }; S.q = ''; $('.find input').value = ''; S.select = null; render(); closeRail(); nav(); scrollBackTo(secScroll.get(secKey()) || 0); };
  $('.views').onclick = $('.topnav').onclick = $('.tabbar').onclick = (e) => { const b = e.target.closest('[data-view]'); if (b) goView(b.dataset.view); };
  $('.tree').onclick = (e) => { const b = e.target.closest('[data-folder]'); if (!b) return; noteScroll(); S.view = { kind: 'home', folder: b.dataset.folder }; S.q = ''; $('.find input').value = ''; S.select = null; render(); closeRail(); nav(); scrollBackTo(secScroll.get(secKey()) || 0); };
  $('.settings-btn').onclick = () => { closeRail(); settings(); };
  $('.tabs-btn').onclick = (e) => tabsPanel(e.currentTarget);
  $('.trash-btn').onclick = () => goView('trash');
  $('.menu-btn').onclick = () => app.classList.toggle('rail-open');
  $('.scrim').onclick = closeRail;
  const fin = $('.find input');
  // 찾기 asks once the typing has stood 200 ms — never for a syllable still being put together (선ㄱ), and never again for
  // what is asked already (a space after it, a letter typed and taken back). A Mac's, an iPad's or an iPhone's Korean
  // keyboard keeps the last syllable open until the next key: 선거 left standing (whole syllables, no bare ㄱ) is asked
  // after a longer pause, as it was before
  let finIme = false;
  const finAsk = (ms = 200) => { clearTimeout(S.qT); S.qT = setTimeout(() => { if (finIme && !imeWhole(fin.value)) return; const v = fin.value.trim(); if (v === S.q) return; S.q = v; render(); }, ms); };
  fin.addEventListener('compositionstart', () => { finIme = true; clearTimeout(S.qT); });
  fin.addEventListener('compositionend', () => { finIme = false; finAsk(); });
  fin.addEventListener('blur', () => { if (finIme) { finIme = false; finAsk(); } });
  fin.addEventListener('input', (e) => { if (e.isComposing || finIme) { if (imeWhole(fin.value)) finAsk(IME_PAUSE); else clearTimeout(S.qT); return; } finAsk(); });
  fin.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.isComposing && e.keyCode !== 229) { clearTimeout(S.qT); fin.value = ''; if (S.q) { S.q = ''; render(); } } });
  $('.content').addEventListener('click', onContentClick);
  $('.content').addEventListener('keydown', (e) => {   // a paper's (or folder's) name, reached with Tab: Enter or Space opens it
    const m = e.target.closest && e.target.closest('.row .meta[role="button"]');
    if (!m || m !== e.target || (e.key !== 'Enter' && e.key !== ' ') || e.isComposing) return;
    e.preventDefault(); m.click();
  });
  $('.crumbs').onclick = (e) => { const b = e.target.closest('[data-folder]'); if (b) { noteScroll(); S.view = { kind: 'home', folder: b.dataset.folder || null }; S.select = null; render(); nav(); scrollBackTo(secScroll.get(secKey()) || 0); } };
  $('.tools').onclick = onTools;
  // drop PDFs anywhere on the library to upload them into the folder being shown
  const main = $('.main');
  main.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); main.classList.add('drop'); } });
  main.addEventListener('dragleave', (e) => { if (e.target === main || !main.contains(e.relatedTarget)) main.classList.remove('drop'); });
  main.addEventListener('drop', (e) => { e.preventDefault(); main.classList.remove('drop'); filesFromDrop(e.dataTransfer).then((fs) => { if (fs.length) upload(fs); }); });
  let lp = null;   // a long press on a row starts selecting
  $('.content').addEventListener('pointerdown', (e) => { const row = e.target.closest('.row[data-file], .row[data-fid]'); if (!row || e.pointerType === 'mouse') return; lp = setTimeout(() => { lp = null; pressedAt = Date.now(); startSelect(row.dataset.file ? { file: row.dataset.file } : { folder: row.dataset.fid }); }, 550); });
  for (const t of ['pointerup', 'pointercancel', 'pointermove']) $('.content').addEventListener(t, (e) => { if (lp && (t !== 'pointermove' || Math.abs(e.movementY) > 3)) { clearTimeout(lp); lp = null; } });
  $('.content').addEventListener('contextmenu', (e) => { const row = e.target.closest('.row[data-file], .row[data-fid]'); if (!row) return; e.preventDefault(); row.dataset.file ? fileMenu(row.dataset.file, e.clientX, e.clientY) : folderMenu(row.dataset.fid, e.clientX, e.clientY); });
}
function closeRail() { const a = $('.app'); if (a) a.classList.remove('rail-open'); }
// a word being typed in Hangul whose syllables are whole (선거 — not 선ㄱ, a bare jamo): fit to be asked while its last
// syllable is still open (a Mac's, an iPad's, an iPhone's Korean keyboard keeps it open until the next key)
const imeWhole = (v) => !!String(v || '').trim() && !/[\u1100-\u11FF\u3131-\u318E\uA960-\uA97F\uD7B0-\uD7FF]/.test(v);
const IME_PAUSE = 600;

// no internet, or the internet but no answer from the 책장 server (down, or its daily limit): each said as it is
function renderOffline() {
  const o = $('.offline'); if (!o) return;
  const down = navigator.onLine && api.serverDown();
  o.hidden = navigator.onLine && !down;
  o.textContent = down ? '책장 서버에 연결할 수 없습니다 · 이 기기에 받아 둔 논문은 읽을 수 있습니다' : '인터넷에 연결되어 있지 않습니다 · 이 기기에 받아 둔 파일만 열 수 있습니다';
}

/* ---------- the stable-drawing contract ----------
   1. Only what changed is drawn: every region goes through paint (the same HTML again changes nothing), every list through
      patchList (a row whose HTML is the same stays the very node it was: its cover is not decoded again, the focus in it
      stays, a finger on it keeps its tap).
   2. A redraw nobody asked for (another device's change, a paper's line filled in, a paper kept on this device) is one per
      frame at most, and waits while a finger or the mouse is down on the list or a Hangul syllable is being put together —
      it comes just after. */
let pressing = false, bgWaiting = false, bgRaf = 0, imeOn = false;
function renderBg() {
  if (pressing || imeOn) { bgWaiting = true; return; }
  if (bgRaf) return;
  bgRaf = requestAnimationFrame(() => {
    bgRaf = 0;
    if (pressing || imeOn) { bgWaiting = true; return; }
    if (!S.reader) render();
  });
}
const bgAfter = (ms) => { if (!bgWaiting) return; bgWaiting = false; setTimeout(() => { if (!S.reader) renderBg(); }, ms); };
document.addEventListener('pointerdown', (e) => { if (e.target && e.target.closest && e.target.closest('.content, .toolrow, .bar, .rail, .tabbar')) pressing = true; }, { capture: true, passive: true });
['pointerup', 'pointercancel'].forEach((ev) => document.addEventListener(ev, () => {
  if (!pressing) return;
  pressing = false;
  bgAfter(350);   // after the tap's own click
}, { capture: true, passive: true }));
// (a press whose end this page never hears — the window left mid-press for another app, a system sheet, a call — is over)
const pressLost = () => { if (!pressing) return; pressing = false; bgAfter(60); };
window.addEventListener('blur', pressLost);
document.addEventListener('visibilitychange', () => { if (document.hidden) pressLost(); });
// (a word still being put together — 선ㄱ on the way to 선거 — is not a question yet, and nothing is drawn under it)
document.addEventListener('compositionstart', () => { imeOn = true; }, true);
document.addEventListener('compositionend', () => { imeOn = false; bgAfter(60); }, true);
document.addEventListener('focusout', () => { if (imeOn) { imeOn = false; bgAfter(60); } }, true);
// a region drawn again exactly as it is stays as it is (nothing replaced under a finger, no flicker of its pictures)
function paint(c, html) {
  if (c._html === html && c._first !== undefined && c._first === c.firstElementChild && (!c._first || c._first.isConnected)) return false;
  c.innerHTML = html; c._html = html; c._first = c.firstElementChild;
  return true;
}
const setText = (e, t) => { if (e && e.textContent !== t) e.textContent = t; };
const setAttr = (e, k, v) => { if (!e) return; if (v == null) { if (e.hasAttribute(k)) e.removeAttribute(k); } else if (e.getAttribute(k) !== v) e.setAttribute(k, v); };
const tpl = document.createElement('template');
const nodeOf = (html) => { tpl.innerHTML = html.trim(); const n = tpl.content.firstElementChild; tpl.innerHTML = ''; return n; };
// what has the focus, said so that the same control can be found again in a row drawn anew
function focusKey(row) {
  const a = document.activeElement;
  if (!a || !row.contains(a)) return null;
  for (const k of ['menu', 'fmenu', 'open', 'ck', 'restore', 'purge', 'caseOpen', 'courtOpen', 'holding', 'pr', 'kci']) if (a.dataset && a.dataset[k] !== undefined) return `[data-${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}="${CSS.escape(a.dataset[k])}"]`;
  if (a.classList.contains('meta')) return '.meta';
  return a === row ? ':scope' : null;
}
/* A keyed list: items in order, each with its key and its HTML. A row whose key and HTML are as drawn is kept as it is (only
   moved when the order changed); a row with new HTML is replaced in its place; a new key is put in; what is gone goes. The
   focus inside a replaced row goes to the same control in the new one. Returns how many rows were written. */
function patchList(list, items, keyFn, htmlFn) {
  const old = new Map();
  for (const ch of [...list.children]) { if (ch._key != null && !old.has(ch._key)) old.set(ch._key, ch); else ch.remove(); }
  let prev = null, wrote = 0;
  for (const it of items) {
    const k = keyFn(it), h = htmlFn(it);
    let n = old.get(k);
    if (n) old.delete(k);
    if (n && n._html !== h) {
      const fk = focusKey(n), m = nodeOf(h);
      n.replaceWith(m); n = m; wrote++;
      if (fk) { const t = fk === ':scope' ? n : n.querySelector(fk); if (t && t.focus) t.focus({ preventScroll: true }); }
    } else if (!n) { n = nodeOf(h); wrote++; }
    if (!n) continue;
    n._key = k; n._html = h;
    const want = prev ? prev.nextSibling : list.firstChild;
    if (n !== want) list.insertBefore(n, want);
    prev = n;
  }
  for (const n of old.values()) { n.remove(); wrote++; }
  return wrote;
}
// a phone (below 700 px): the menus as a bar at the foot, the shelf's tools as two icons beside its search
const phoneMq = matchMedia('(max-width: 699px)');
const narrow = () => phoneMq.matches;
phoneMq.addEventListener && phoneMq.addEventListener('change', () => { if ($('.app') && !S.reader) render(); });
function render() {
  if (!$('.app')) return;
  if (S.view.kind === 'recent') S.view = { kind: 'home', folder: null };
  for (const b of document.querySelectorAll('.views [data-view], .topnav [data-view]')) {
    const on = !S.q && b.dataset.view === S.view.kind && !(S.view.kind === 'home' && S.view.folder);
    if (b.classList.contains('on') !== on) b.classList.toggle('on', on);
    setAttr(b, 'aria-current', on ? 'page' : null);   // (said to a screen reader too)
  }
  // the bar at a phone's foot: 서재 is on in its folders and its search too (they are the shelf's)
  for (const b of document.querySelectorAll('.tabbar [data-view]')) {
    const on = b.dataset.view === S.view.kind;
    if (b.classList.contains('on') !== on) b.classList.toggle('on', on);
    setAttr(b, 'aria-current', on ? 'page' : null);
  }
  const app = $('.app');
  setAttr(app, 'data-view', S.view.kind);
  if (app.classList.contains('phone') !== narrow()) app.classList.toggle('phone', narrow());
  const tb = $('.trash-btn'), tOn = !S.q && S.view.kind === 'trash';
  if (tb.classList.contains('on') !== tOn) tb.classList.toggle('on', tOn);
  renderTree(); renderUsage(); renderCrumbs(); renderTools(); renderTabsBtn();
  const c = $('.content');
  if (c._staged && !lawView()) {   // (판례 or 법령 on its way, and another screen asked for: it is given up)
    for (const x of c._staged) x.remove();
    c._staged = null; setAttr(c, 'aria-busy', null);
    for (const x of c.querySelectorAll(':scope > .is-stale')) x.classList.remove('is-stale');
  }
  if (c.classList.contains('picking') !== !!S.select) c.classList.toggle('picking', !!S.select);
  syncFind();
  if (S.q) { renderSearch(c); return; }
  if (lawView()) { const b = c.querySelector(':scope > .law-body:not(.pp-body):not(.is-stale):not([hidden])') || c.querySelector(':scope > .law-body:not(.pp-body):not(.is-stale)'); if (!b || b.dataset.law !== lawQ().trim() || b.dataset.mode !== S.view.kind || !b.querySelector('.law-home, .law-res')) renderLaw(c); return; }   // asked of servers: drawn again only for a new question
  if (S.view.kind === 'papers') { const b = c.querySelector(':scope > .pp-body'); if (!b || b.dataset.ppkey !== paperKey() || !b.querySelector('.pp-home, .pp-res, .pp-kci, .pp-jv')) renderPapers(c); return; }
  if (S.view.kind === 'write') { write.show(c, { files: liveFiles, textOf, toast, openFrom }); return; }   // (drawn once: kept as typed while the app redraws)
  if (S.view.kind === 'trash') renderTrash(c);
  else renderFolder(c, S.view.folder);
  lazyThumbs();
}

function renderTabsBtn() {
  pruneTabs();
  const b = $('.tabs-btn'); if (!b) return;
  if (b.hidden !== !S.tabs.length) b.hidden = !S.tabs.length;
  if (!S.tabs.length) { if (b._html) { b._html = ''; b.innerHTML = ''; } return; }
  const front = S.tabs.slice().sort((x, y) => y.at - x.at).slice(0, 3);
  const html = `<span class="tb-covers">${front.map((t) => { const f = fileById(t.id); return `<span class="thumb" data-thumb="${f && f.thumb ? f.id : ''}"></span>`; }).join('')}</span><span class="tb-t">열린 문서</span><em>${S.tabs.length}</em>`;
  setAttr(b, 'aria-label', `열린 문서 ${S.tabs.length}개`);
  if (b._html !== html) { b._html = html; b.innerHTML = html; }
}
// the papers open as tabs; only the one in front is drawn, the others keep just their place
const MAX_TABS = 8;
const CAP = 9 * 1024 ** 3;   // the server takes PDFs only up to this, so the shelf never leaves R2's free tier
function pruneTabs() {
  const before = S.tabs.length;
  S.tabs = S.tabs.filter((t) => { const f = fileById(t.id); return f && !f.trashed && !folderTrashed(f.folder); });
  if (S.tabs.length !== before) saveTabs();
}
function saveTabs() { store.put('kv', 'tabs', S.tabs).catch(() => {}); }
function tabInfo() { return S.tabs.map((t) => ({ id: t.id, title: stem((fileById(t.id) || { name: '' }).name) })); }
function rememberTab() {
  if (!S.reader || !S.readerId) return;
  const t = S.tabs.find((x) => x.id === S.readerId); if (!t) return;
  const c = S.reader.current(); t.page = c.page; t.y = c.y; t.zoom = S.reader.zoom; t.at = Date.now();
  saveTabs();
}
function addTab(id) {
  let t = S.tabs.find((x) => x.id === id);
  if (!t) {
    t = { id, page: null, y: 0, zoom: 1, at: Date.now() };
    S.tabs.push(t);
    while (S.tabs.length > MAX_TABS) { const old = S.tabs.filter((x) => x.id !== id).sort((a, b) => a.at - b.at)[0]; S.tabs = S.tabs.filter((x) => x !== old); }
  }
  t.at = Date.now();
  saveTabs();
  return t;
}
function switchTab(id) { if (id && id !== S.readerId) openFile(id, { tab: true, replace: true }); }
function closeTab(id) {
  const i = S.tabs.findIndex((x) => x.id === id);
  if (i < 0) { if (id === S.readerId) history.back(); return; }
  S.tabs.splice(i, 1); saveTabs();
  if (id !== S.readerId) { if (S.reader) S.reader.setTabs(tabInfo()); return; }
  const next = S.tabs[i] || S.tabs[i - 1];
  if (next) openFile(next.id, { tab: true, replace: true, noRemember: true });
  else history.back();   // the last tab: back to the shelf
}
// the papers left open, newest first: a tap goes back to one, × closes it, 모두 닫기 closes them all (undone from the toast)
function tabsSheet() { tabsPanel(null); }
function tabsPanel(anchor) {
  document.querySelectorAll('.menu-wrap').forEach((m) => m.remove());
  const list = S.tabs.slice().sort((x, y) => y.at - x.at);
  if (!list.length) return;
  const where = (t) => {
    const f = fileById(t.id), st = S.state.files[t.id];
    const pg = t.page != null ? t.page : st && !st.done ? st.page : null;
    return [t.id === S.readerId ? '지금 보는 문서' : '', f && f.pages && pg != null ? pageOf({ page: pg, o: st && st.o }, f.pages) : ''].filter(Boolean).join(' · ');
  };
  const sheetLike = !anchor || (innerWidth < 600 && matchMedia('(pointer: coarse)').matches);
  const w = el('div', 'menu-wrap tabs-wrap' + (sheetLike ? ' as-sheet' : ''), `<div class="menu tabs-pop" role="dialog" aria-label="열린 문서" tabindex="-1">
    <div class="tp-h"><b>열린 문서</b><span class="tp-n">${list.length}</span><button type="button" class="tp-all">모두 닫기</button></div>
    <ul class="tp-list">${list.map((t) => { const f = fileById(t.id); return `<li class="${t.id === S.readerId ? 'on' : ''}"><button type="button" class="tp-go" data-go="${t.id}"><span class="thumb" data-thumb="${f && f.thumb ? f.id : ''}">${coverMark(f && f.stars)}</span><span class="tp-m"><b>${esc(f ? stem(f.name) : '')}</b><small>${esc(where(t))}</small></span></button><button type="button" class="ib tp-x" data-x="${t.id}" aria-label="닫기" title="닫기">${I.close}</button></li>`; }).join('')}</ul></div>`);
  document.body.appendChild(w);
  const m = $('.menu', w);
  if (!sheetLike) {
    const r = anchor.getBoundingClientRect(), mw = m.offsetWidth;
    const left = Math.max(8, Math.min(innerWidth - mw - 8, r.right - mw));
    m.style.left = left + 'px'; m.style.top = (r.bottom + 6) + 'px';
    m.style.transformOrigin = `${Math.round(Math.min(mw, Math.max(0, r.right - left)))}px 0`;
  }
  lazyThumbs();
  requestAnimationFrame(() => w.classList.add('in'));
  const close = () => { document.removeEventListener('keydown', onKey, true); w.classList.remove('in'); w.classList.add('out'); setTimeout(() => w.remove(), 140); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', onKey, true);
  m.focus({ preventScroll: true });
  w.addEventListener('click', (e) => {
    if (!e.target.closest('.menu')) { close(); return; }
    if (e.target.closest('.tp-all')) { close(); closeAllTabs(); return; }
    const x = e.target.closest('[data-x]');
    if (x) {
      const li = x.closest('li'); li.classList.add('going');
      setTimeout(() => { li.remove(); const n = m.querySelectorAll('.tp-list li').length; $('.tp-n', m).textContent = n; if (!n) close(); }, 160);
      closeTab(x.dataset.x);
      if (!S.reader) render();
      return;
    }
    const g = e.target.closest('[data-go]');
    if (g) { close(); if (S.reader) switchTab(g.dataset.go); else openFile(g.dataset.go, { tab: true }); }
  });
}
function closeAllTabs() {
  const before = S.tabs.map((t) => ({ ...t }));
  if (!before.length) return;
  if (S.reader) rememberTab();
  const kept = S.tabs.map((t) => ({ ...t }));
  S.tabs = []; saveTabs();
  if (S.readerId) history.back(); else render();
  toast(`열린 문서 ${kept.length}개를 닫았습니다`, 6000, { label: '되돌리기', fn: () => { S.tabs = kept; saveTabs(); if (S.reader) S.reader.setTabs(tabInfo()); render(); } });
}

function renderTree() {
  const box = $('.tree');
  const walk = (parent, depth) => childFolders(parent).map((f) => `<button data-folder="${f.id}" class="${S.view.kind === 'home' && S.view.folder === f.id && !S.q ? 'on' : ''}" style="--d:${depth}">${I.folder}<span>${esc(f.name)}</span></button>` + (depth < 3 ? walk(f.id, depth + 1) : '')).join('');
  const html = walk(null, 0);
  // (before the shelf is known — a new device's first moments — nothing is said: '폴더가 없습니다' would be a guess)
  paint(box, html || (S.indexKnown ? '<p class="tree-empty">폴더가 없습니다</p>' : ''));
}

function renderUsage() {
  const used = S.index.files.reduce((s, f) => s + (f.size || 0), 0), free = CAP;
  setText($('.usage-t'), S.indexKnown ? `${size(used)} / 9GB` + (used >= CAP ? ' · 가득 참' : used >= CAP * 0.9 ? ' · 거의 참' : '') : '');
  const bar = $('.usage-bar i'), w = Math.min(100, 100 * used / free) + '%';
  if (bar.style.width !== w) bar.style.width = w;
  const live = liveFiles(), n = live.length, have = live.filter((f) => S.cached.has(f.id)).length;
  setText($('.usage-d'), n ? (have >= n ? `이 기기에 모두 있음 · ${n}편` : `이 기기에 ${have} / ${n}편`) : '');
}

function renderCrumbs() {
  const c = $('.crumbs');
  const one = S.q ? '찾기' : lawView() ? (S.view.kind === 'cases' ? '판례' : '법령') : S.view.kind === 'papers' ? '논문' : S.view.kind === 'write' ? '다듬기' : S.view.kind === 'trash' ? '휴지통' : '';
  if (one) { paint(c, `<b>${one}</b>`); return; }
  const path = folderPath(S.view.folder);
  const html = path.length ? [`<button data-folder="">서재</button>`, ...path.map((f, i) => i === path.length - 1 ? `<b>${esc(f.name)}</b>` : `<button data-folder="${f.id}">${esc(f.name)}</button>`)].join('<span class="sl">›</span>') : '<b>서재</b>';
  if (paint(c, html) && path.length) c.scrollLeft = c.scrollWidth;   // (too long for the bar: the open folder is the part kept in sight)
}

const SORTS = [['added', '최근 올린 순'], ['opened', '최근 읽은 순'], ['published', '발간일 순'], ['stars', '★ 순'], ['name', '이름순']];
const sortLabel = () => (SORTS.find((x) => x[0] === S.sort) || SORTS[0])[1];
function renderTools() {
  const t = $('.tools');
  if (S.select) {
    const n = S.select.files.size + S.select.folders.size;
    // (the same buttons, type and height as the bar has when nothing is picked: only what they do changes)
    paint(t, `<span class="sel-n" aria-live="polite"><b>${n}</b>개 선택</span><button class="btn" data-t="move" ${n ? '' : 'disabled'}>${MI.move}<span>옮기기</span></button><button class="btn" data-t="trash" ${n ? '' : 'disabled'}>${I.trash}<span>휴지통으로</span></button><span class="sp"></span><button class="btn ghost" data-t="endsel">${I.close}<span>선택 끝</span></button>`);
    return;
  }
  if (S.view.kind === 'trash' && !S.q) {
    const any = S.index.files.some((f) => f.trashed) || S.index.folders.some((f) => f.trashed);
    paint(t, `<span class="hint">휴지통의 파일은 7일 동안 보관된 뒤 자동으로 지워집니다</span>${any ? '<button class="btn danger" data-t="empty">휴지통 비우기</button>' : ''}`);
    return;
  }
  if (lawView()) { paint(t, ''); return; }
  // a phone: one line — the search, then the order (an icon that says which) and ＋ (새 폴더 · 올리기 · 여러 개 고르기); the
  // same during a search, so the search box never jumps up when the first search runs
  if (narrow() && S.view.kind === 'home') {
    paint(t, `<button type="button" class="btn ghost tool-sort" data-t="sort" aria-label="정렬: ${sortLabel()}" title="${sortLabel()}">${I.sort}</button><button type="button" class="btn ghost tool-add" data-t="add" aria-label="새 폴더 · 올리기" title="새 폴더 · 올리기">${I.plus}</button>`);
    return;
  }
  if (S.q) { paint(t, ''); return; }
  paint(t, `<button class="btn" data-t="newfolder">${I.newfolder}<span>새 폴더</span></button><button class="btn" data-t="upload">${I.up}<span>올리기</span></button><span class="sp"></span><button class="btn ghost" data-t="sort">${I.sort}<span>${sortLabel()}</span></button>`);
}

function sorted(files) {
  const opened = (f) => (S.state.files[f.id] && S.state.files[f.id].at) || 0;
  const pub = (f) => (infoOf(f) || {}).date || '';
  const by = { added: (a, b) => b.added - a.added, published: (a, b) => (pub(b) > pub(a) ? 1 : pub(b) < pub(a) ? -1 : b.added - a.added), name: (a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }), opened: (a, b) => opened(b) - opened(a) || b.added - a.added, stars: (a, b) => gradeRank(b.stars) - gradeRank(a.stars) || b.added - a.added }[S.sort];
  return files.slice().sort(by);
}

// the shelf's list: its heading and its rows, each row kept as it is while it reads the same (patchList). A new device whose
// shelf is not known yet shows grey rows where the papers will be (as many as last time), never '아직 올린 PDF가 없습니다'
const LASTN = 'shelf.lastN';
const lastN = () => { try { const n = Number(localStorage.getItem(LASTN)); return n > 0 ? Math.min(n, 14) : 8; } catch (e) { return 8; } };
function noteLastN() { try { localStorage.setItem(LASTN, String(liveFiles().filter((f) => !f.folder).length + childFolders(null).length)); } catch (e) { /* this time only */ } }
function libFrame(c) {
  const f = c._lib;
  if (f && f.head.parentNode === c && f.list.parentNode === c && c.firstElementChild === f.head && f.list.nextElementSibling === null) return f;
  c.innerHTML = '<div class="list-h"></div><div class="list"></div>';
  c._html = null; c._first = undefined;
  return (c._lib = { head: c.firstElementChild, list: c.lastElementChild });
}
function renderFolder(c, folder) {
  const folders = childFolders(folder);
  const files = sorted(liveFiles().filter((f) => (f.folder ?? null) === (folder ?? null)));
  if (!folders.length && !files.length && !S.indexKnown && !folder) {   // (the shelf not known yet: its shape, in grey)
    const fr = libFrame(c);
    paint(fr.head, listHeadInner('전체').replace('data-selall', 'disabled aria-hidden="true" tabindex="-1"'));   // (its place, not yet its use)
    fr.head.hidden = narrow() && !S.select;
    patchList(fr.list, Array.from({ length: lastN() }, (_, i) => i), (i) => 'sk:' + i, () => '<div class="sk-row" aria-hidden="true"></div>');
    if (!fr.list.classList.contains('sk-list')) fr.list.classList.add('sk-list');
    setAttr(c, 'aria-busy', 'true');
    return;
  }
  setAttr(c, 'aria-busy', null);
  if (c._lib && c._lib.list.classList.contains('sk-list')) c._lib.list.classList.remove('sk-list');
  if (!folders.length && !files.length) {
    const binned = !folder && (S.index.files.some((f) => f.trashed) || S.index.folders.some((f) => f.trashed));   // (all of it put in the trash: said where it is)
    // (a shelf the server has not told of — no answer on a new device — is not called empty)
    const unknown = !folder && S.indexSrc !== 'server' && S.indexSrc !== 'store';
    const html = `<div class="empty-big">${I.pdf}<p>${folder ? '이 폴더는 비어 있습니다' : binned ? '서재가 비어 있습니다' : unknown ? '책장을 아직 불러오지 못했습니다' : '아직 올린 PDF가 없습니다'}</p>${unknown ? `<p class="sub">${navigator.onLine ? '책장 서버에 닿으면 바로 보여 드립니다.' : '인터넷에 연결되면 바로 보여 드립니다.'}</p>` : `${binned ? '<p class="sub">버린 파일은 <button class="link" data-go-trash>휴지통</button>에서 7일 동안 되살릴 수 있습니다.</p>' : ''}<p class="sub">PDF를 여기로 끌어다 놓거나 <button class="link" data-t="upload">올리기</button>를 누르세요.</p>`}</div>`;
    paint(c, html); return;
  }
  const fr = libFrame(c);
  // 서재 by mark (★ · △ · ✕): the papers with it from this folder down, one list, each with its folder's name
  const mf = mfOn();
  if (mf) {
    const hits = sorted(liveFiles().filter((f) => mf.test(f) && inSubtree(f.folder, folder)));
    const label = `${mf.glyph} ${mf.name()} · ${hits.length}편`;
    paint(fr.head, narrow() && !S.select ? `<h2 class="sec-h">${esc(label)}</h2><button type="button" class="link mk-all" data-mf="">모두 보기</button>` : listHeadInner(label));
    if (fr.head.hidden) fr.head.hidden = false;
    patchList(fr.list, hits.length ? hits.map((f) => ({ f })) : [{ none: 1 }], (x) => (x.f ? 'f:' + x.f.id : 'mf:none'), (x) => (x.f ? fileRow(x.f) : `<p class="none">${esc(mf.name())} 표지를 단 논문이 ${folder ? '이 폴더에 ' : ''}없습니다</p>`));
    return;
  }
  paint(fr.head, listHeadInner(folder ? `${folders.length + files.length}개` : files.length ? '전체' : '폴더'));
  // (a phone keeps its first rows high: the heading and 전체 선택 show only while picking)
  const hideHead = narrow() && !S.select;
  if (fr.head.hidden !== hideHead) fr.head.hidden = hideHead;
  patchList(fr.list, [...folders.map((f) => ({ d: f })), ...files.map((f) => ({ f }))], (x) => (x.d ? 'd:' + x.d.id : 'f:' + x.f.id), (x) => (x.d ? folderRow(x.d) : fileRow(x.f)));
}

const boxes = () => !S.q && S.view.kind !== 'trash';   // rows carry a checkbox here
const allPicked = () => { const all = shownItems(); return !!S.select && all.files.length + all.folders.length > 0 && all.files.every((id) => S.select.files.has(id)) && all.folders.every((id) => S.select.folders.has(id)); };
function listHeadInner(label) {   // the list's heading, with 전체 선택 at its right (it picks what this list shows); 서재's marks to sort by beside it
  const mf = S.view.kind === 'home' && !S.q && S.indexKnown && !narrow() && anyMarked() ? mfHtml() : '';
  return `<h2 class="sec-h">${esc(label)}</h2>${mf}${boxes() ? `<button type="button" class="sec-act" data-selall>${allPicked() ? '선택 해제' : '전체 선택'}</button>` : ''}`;
}
function listHead(label) { return `<div class="list-h">${listHeadInner(label)}</div>`; }
function pickAll() {   // everything in this list, or nothing if it already was
  const all = shownItems();
  if (allPicked()) S.select = null;
  else { S.select = S.select || { files: new Set(), folders: new Set() }; all.files.forEach((id) => S.select.files.add(id)); all.folders.forEach((id) => S.select.folders.add(id)); }
  render();
}
const ckBox = (on) => `<button type="button" class="ck" data-ck aria-label="선택" aria-pressed="${on ? 'true' : 'false'}">${I.check}</button>`;
function folderRow(f) {
  const n = liveFiles().filter((x) => x.folder === f.id).length + childFolders(f.id).length;
  const sel = S.select && S.select.folders.has(f.id);
  return `<div class="row folder ${sel ? 'sel' : ''}" data-fid="${f.id}"><span class="ficon">${I.folder}${boxes() ? ckBox(sel) : ''}</span><span class="meta"${S.view.kind === 'trash' ? '' : ' role="button" tabindex="0"'}><b>${esc(f.name)}</b><span class="sub">${n ? n + '개' : '비어 있음'}</span></span>${S.select ? '' : `<button class="ib more" data-fmenu="${f.id}" aria-label="폴더 메뉴">${I.more}</button>`}</div>`;
}

function fileRow(f, extra = '') {
  const s = S.state.files[f.id];
  const sel = S.select && S.select.files.has(f.id);
  const where = (S.q || mfOn()) && f.folder ? esc((folderById(f.folder) || {}).name || '') : '';
  return `<div class="row file ${sel ? 'sel' : ''} ${f.stars === -1 ? 'dim' : ''}" data-file="${f.id}">
    <span class="thumb" data-thumb="${f.thumb ? f.id : ''}">${coverMark(f.stars)}${readBar(f, s)}${boxes() ? ckBox(sel) : ''}</span>
    <span class="meta"${S.view.kind === 'trash' ? '' : ' role="button" tabindex="0"'}><b>${esc(stem(f.name))}</b><span class="sub">${[paperLine(f) || (f.pages ? f.pages + '쪽' : ''), where, f.pending ? '정리하는 중' : ''].filter(Boolean).join(' · ')}<span class="ocr-p">${isScan(f) ? (OCR.id === f.id ? ` · 글자 읽는 중 ${OCR.done}/${OCR.total}쪽` : needsOcr(f) ? ' · 스캔본' : '') : ''}</span></span>${extra}</span>
    <span class="here ${S.cached.has(f.id) ? 'on' : ''}" title="${S.cached.has(f.id) ? '이 기기에 받아 둠' : ''}">${S.cached.has(f.id) ? I.device : ''}</span>
    ${S.select ? '' : `<button class="ib more" data-menu="${f.id}" aria-label="파일 메뉴">${I.more}</button>`}</div>`;
}

// how far a paper has been read: a thin line along the foot of its cover (none before the first page is left, or once read through)
function readBar(f, s) {
  if (!s || s.done || !f.pages || f.pages < 2 || !(s.page > 0)) return '';
  const p = Math.min(100, Math.max(4, Math.round(100 * (s.page + 1) / f.pages)));
  return `<i class="th-read" style="--p:${p}%" title="${s.page + 1} / ${f.pages}쪽까지 읽음"></i>`;
}
function gradeRank(v) { return v > 0 ? v : v === -2 ? 0.5 : v === -1 ? -1 : 0; }   // ★★★ ★★ ★ △ (none) ✕
function coverMark(v) { return v ? `<i class="cover-mark" aria-label="${v > 0 ? '별 ' + v + '개' : v === -2 ? '세모' : '엑스'}">${gradeSVG(v)}</i>` : ''; }

function shownItems() {   // what the list in view shows (전체 선택 picks these)
  const mf = mfOn();
  if (mf) return { files: liveFiles().filter((f) => mf.test(f) && inSubtree(f.folder, S.view.folder)).map((f) => f.id), folders: [] };
  if (S.view.kind === 'home') return { files: liveFiles().filter((f) => (f.folder ?? null) === (S.view.folder ?? null)).map((f) => f.id), folders: childFolders(S.view.folder).map((f) => f.id) };
  return { files: [], folders: [] };
}
function renderTrash(c) {
  const fs = S.index.folders.filter((f) => f.trashed), files = S.index.files.filter((f) => f.trashed || folderTrashed(f.folder));
  const topFiles = files.filter((f) => f.trashed && !folderTrashed(f.folder));
  if (!fs.length && !topFiles.length) { paint(c, `<div class="empty-big">${I.trash}<p>휴지통이 비어 있습니다</p></div>`); return; }
  paint(c, '<div class="list">' +
    fs.map((f) => `<div class="row folder"><span class="ficon">${I.folder}</span><span class="meta"><b>${esc(f.name)}</b><span class="sub">${date(f.trashed)}에 버림 · ${keepLeft(f.trashed)}</span></span><button class="btn small" data-restore-folder="${f.id}">되살리기</button><button class="btn small danger ghost" data-purge-folder="${f.id}">영구 삭제</button></div>`).join('') +
    topFiles.map((f) => `<div class="row file"><span class="thumb" data-thumb="${f.thumb ? f.id : ''}"></span><span class="meta"><b>${esc(stem(f.name))}</b><span class="sub">${size(f.size)} · ${date(f.trashed)}에 버림 · ${keepLeft(f.trashed)}</span></span><button class="btn small" data-restore="${f.id}">되살리기</button><button class="btn small danger ghost" data-purge="${f.id}">영구 삭제</button></div>`).join('') + '</div>');
}

/* ---------- search: names at once, then the text of every page ---------- */
// 찾기 compares text as a reader reads it: spaces and case ignored, and hanja read in Hangul (憲法裁判所 is found by 헌법재판소,
// 理論 by 이론; a query in hanja finds the Hangul too). flat: the compared letters; map: each one's place in the text itself.
function findForm(t) {
  t = String(t || '');
  const han = naming.HAS_HAN.test(t), src = han ? naming.searchForm(t) : t;
  let flat = ''; const map = [];
  for (let i = 0; i < t.length; i++) if (!/\s/.test(t[i])) { flat += src[i].toLowerCase(); map.push(i); }
  return { flat, map, han };
}
function findKey(q) {   // the query in both forms: as typed (hanja read), and as compared with text that has hanja
  const plain = naming.hangulize(String(q || '').replace(/\s+/g, '')).toLowerCase();
  return { plain, soft: naming.soft(plain) };
}
const keyFor = (k, f) => (f.han ? k.soft : k.plain);
/* 찾기 is drawn once for each question (and each change in the papers that have texts): a redraw for anything else — a ★ given
   on another device, a paper's line filled in, the shelf's sync — leaves its answers where they are and only sets right the
   rows that changed. A new question keeps the last answer on screen, dimmed, until the new one has something to show (or a
   moment has passed). While the pages are read, papers are added at the foot as they are found; they are put in order of how
   often the words are found once every paper has been read — rows do not jump about while one reads them. */
let searchGen = 0;
const textSig = () => liveFiles().filter((f) => f.text).map((f) => f.id + (f.ocr || '')).join(',');
function renderSearch(c) {
  const q = S.q, key = q.replace(/\s+/g, '').toLowerCase(), k2 = findKey(q);
  const sig = k2.plain + '\u0001' + textSig();
  const old = c._sv && c._sv.root.parentNode === c && !c._sv.dead ? c._sv : null;
  if (old && old.sig === sig) { old.patch(); return; }
  const gen = ++searchGen;
  const root = el('div', 'find-res');
  const live = () => searchGen === gen && !!S.q && root.isConnected;
  // a decision's or judgment's number, or an article: that first (the decision, the judgment, the article's text), then the
  // papers that cite it
  const caseNo = cases.caseQuery(q), courtNo = !caseNo && laws.courtQuery(q), artQ = !caseNo && !courtNo && laws.articleQuery(q);
  root.innerHTML = `${caseNo ? '<div class="case-sec"></div>' : courtNo ? '<div class="court-sec"></div>' : artQ ? '<div class="art-sec slot-art"></div>' : ''}<h2 class="sec-h">이름</h2><div class="list name-hits"></div><p class="none name-none" hidden>이름이 맞는 파일이 없습니다</p>
    <div class="mark-sec" hidden><h2 class="sec-h">내 표시 <span class="sec-n mark-n"></span></h2><div class="list mark-list"></div></div>
    <h2 class="sec-h">본문 <span class="sec-n text-n"></span></h2><div class="list text-hits"></div><p class="none text-none" hidden></p>`;
  const sv = { sig, gen, root, hits: null, marks: null, committed: false };
  const nameList = $('.name-hits', root), box = $('.text-hits', root), n = $('.text-n', root), none = $('.text-none', root);
  const named = (name) => { const f = findForm(name); return f.flat.includes(keyFor(k2, f)); };
  const names = () => {
    const nameHits = sorted(liveFiles().filter((f) => named(f.name))), folderHits = S.index.folders.filter((f) => !f.trashed && !folderTrashed(f.id) && named(f.name));
    patchList(nameList, [...folderHits.map((d) => ({ d })), ...nameHits.map((f) => ({ f }))], (x) => (x.d ? 'd:' + x.d.id : 'f:' + x.f.id), (x) => (x.d ? folderRow(x.d) : fileRow(x.f)));
    const any = !!(nameHits.length || folderHits.length);
    if ($('.name-none', root).hidden !== any) $('.name-none', root).hidden = any;
  };
  const drawHits = () => {
    if (!sv.hits) return;
    const { results, done, all } = sv.hits;
    patchList(box, results.slice(0, 80), (r) => r.f.id, (r) => fileRow(r.f, snipsHtml(r, q)));
    const nt = done === all && !results.length ? '본문에서 찾지 못했습니다' : '';
    setText(none, nt); if (none.hidden !== !nt) none.hidden = !nt;
    setText(n, done < all ? `찾는 중 ${done}/${all}` : (results.length ? `${results.length}개 파일` : ''));
  };
  const drawMarks = () => {
    if (!sv.marks) return;
    const { hits, offs } = sv.marks, total = hits.reduce((t, r) => t + r.snips.length, 0), sec = $('.mark-sec', root);
    if (sec.hidden !== !total) sec.hidden = !total;
    setText($('.mark-n', root), total ? `${total}개` : '');
    patchList($('.mark-list', root), hits, (r) => r.f.id, (r) => fileRow(r.f, `<span class="snips">${r.snips.slice(0, 6).map((x) => `<button class="snip mark-snip" data-open="${r.f.id}" data-page="${x.m.p}" data-mark="${esc(x.m.id)}"><em>${pageLabel(r.f.id, x.m.p, offs.get(r.f.id))}</em><i class="${x.m.kind === 'ul' ? 'uw' : 'sw'}" style="--c:${esc(x.m.color)}"></i>${x.pre ? '…' : ''}${esc(x.a)}<mark>${esc(x.w)}</mark>${esc(x.b)}${x.post ? '…' : ''}</button>`).join('')}${r.snips.length > 6 ? `<span class="snip-more">외 ${r.snips.length - 6}곳</span>` : ''}</span>`));
  };
  sv.patch = () => { names(); drawMarks(); drawHits(); lazyThumbs(); };
  // the new answer takes the old one's place in one frame, once every paper is read (or 350 ms have passed)
  const commit = () => {
    if (sv.committed || searchGen !== gen || !S.q) return;
    sv.committed = true;
    for (const x of [...c.children]) if (x !== root) x.remove();
    if (root.hidden) root.hidden = false;
    setAttr(c, 'aria-busy', null);
    lazyThumbs();
  };
  names();
  c._sv = sv; c._html = null; c._first = undefined;
  if (old) {
    old.dead = true; old.root.classList.add('is-stale'); setAttr(c, 'aria-busy', 'true');
    root.hidden = true; c.appendChild(root);
    setTimeout(commit, 350);
  } else { c.replaceChildren(root); commit(); }
  if (caseNo) caseCard($('.case-sec', root), caseNo, live);
  else if (courtNo) courtCard($('.court-sec', root), courtNo, live);
  else if (artQ) articleCard($('.art-sec', root), artQ, live);
  if (key.length < 2) { none.textContent = '두 글자 이상 넣으면 표시와 본문에서도 찾습니다'; none.hidden = false; commit(); return; }
  // my own marks: what I already found worth marking
  const fillMarks = async () => {
    const hits = await markHits(key);
    const offs = await printedOffsets(hits.map((r) => r.f.id));
    if (!live()) return;
    sv.marks = { hits, offs }; drawMarks(); lazyThumbs();
  };
  fillMarks();
  fetchAllMarks().then((changed) => { if (changed && searchGen === gen && S.q) fillMarks(); });
  // (an article: where the papers cite it, however they write it — articleFinder)
  pageHits([key], () => searchGen === gen && !!S.q && root.isConnected, (results, done, all) => {
    sv.hits = { results, done, all };
    // (every paper read — a moment when their texts are on this device — or the 350 ms are up: the first few found a frame
    // before the rest are never shown on their own, else the old answer would drop to them and the screen grow back)
    if (!sv.committed && done === all) commit();
    drawHits(); lazyThumbs();
  }, artQ || null);
}
// (a place an article was found in, as the page writes it — ｢행정기본법｣ 제27조 — is what the paper opens looking for)
const snipsHtml = (r, q) => `<span class="snips">${r.snips.map((s) => `<button class="snip" data-open="${r.f.id}" data-page="${s.page}" data-q="${esc(s.q || q)}"><em>${r.o == null ? (s.page + 1) + '쪽' : printedPage(s.page, r.o)}</em>…${esc(s.a)}<mark>${esc(s.w)}</mark>${esc(s.b)}…</button>`).join('')}</span>`;
/* An article asked (행정기본법 제27조): the places a page cites it, however it is written — the law's name in 「」, ｢｣ or 『』
   or bare, spaced or not, with middle dots or without, by its own name or the one lawyers use (국가계약법 ↔ 국가를 당사자로 하는
   계약에 관한 법률), a version note between ("(… 개정되기 전의 것)"), 상 after it — and the places the citation reader
   (laws.scanArticles) finds besides: an article in a list after the name ("행정기본법 제26조, 제27조"), "같은 법 제27조". Not
   제27조의2 for 제27조, nor 제27조 제2항 when 제1항 is asked, nor a longer name that ends with it (임대주택법 is not 주택법).
   Each place once: [start, end] in the page. null for what is no numbered article (헌법 전문 is found as words). */
const CIRCLES = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const ART_SKIP = /[\s「」｢｣『』·ㆍ・･‧∙⋅]/;
function articleFinder(art) {
  if (!art || typeof art.art !== 'number') return null;
  const names = laws.lawAliases(art.law).sort((a, b) => b.length - a.length), id = laws.lawId(art.law);
  const tail = `제${art.art}조${art.sub ? '의' + art.sub : ''}`;
  const re = new RegExp(`(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?:\\([^()]{0,90}\\))?(?:상의|상|의)?${tail}`, 'g');
  const digits = String(art.art);
  return (txt) => {
    if (!txt || !txt.includes(digits)) return [];   // (most pages: the number is not there at all)
    // (a name in hanja, 行政基本法, read in Hangul — one letter for one — but not softened as 찾기's words are: the names asked are as laws write them)
    const h = naming.HAS_HAN.test(txt) && !/[\uD800-\uDFFF]/.test(txt) ? naming.hangulize(txt) : txt, src = h.length === txt.length ? h : txt;
    let flat = ''; const map = [];
    for (let i = 0; i < txt.length; i++) if (!ART_SKIP.test(txt[i])) { flat += src[i]; map.push(i); }
    if (!flat.includes(tail) || !(names.some((n) => flat.includes(n)) || /같은법|동법/.test(flat))) return [];
    // (the citation reader's reading of the page: its own finds, and those it reads as another country's law — a bare
    // "(형사소송법 제199조)" in a section on Japan's — which a name and a number alone must not bring back)
    const parsed = laws.scanArticlesAll(src), abroad = parsed.filter((x) => x.foreign);
    const hits = [];
    let m; re.lastIndex = 0;
    while ((m = re.exec(flat))) {
      const after = flat.slice(m.index + m[0].length, m.index + m[0].length + 6);
      if (!art.sub && /^의\d/.test(after)) continue;   // (제27조의2 is another article)
      if (art.sub && /^\d/.test(after)) continue;       // (… and 제27조의23 is not 제27조의2)
      const p = art.para && /^(?:제(\d{1,3})항|([①-⑳]))/.exec(after);
      if (p && (p[1] ? Number(p[1]) : CIRCLES.indexOf(p[2]) + 1) !== art.para) continue;   // (another 항 of it)
      const a = map[m.index], b = map[m.index + m[0].length - 1] + 1;
      if (a > 0 && /[가-힣]/.test(txt[a - 1])) {   // glued to the word before: part of another name, unless that word is 구 or 현행
        let q = a; while (q > 0 && /[가-힣]/.test(txt[q - 1])) q--;
        if (!/^(?:구|현행|신|개정)$/.test(txt.slice(q, a))) continue;
      }
      if (abroad.some((x) => x.i < b && a < x.i + x.len)) continue;
      hits.push([a, b]);
    }
    for (const x of parsed) if (!x.foreign && x.art === art.art && x.sub === art.sub && (!art.para || !x.para || x.para === art.para) && laws.lawId(x.law) === id) hits.push([x.i, x.i + x.len]);
    hits.sort((x, y) => x[0] - y[0]);
    const out = [];
    for (const h of hits) { const l = out[out.length - 1]; if (l && h[0] < l[1]) l[1] = Math.max(l[1], h[1]); else out.push(h.slice()); }
    return out;
  };
}
// every paper's page texts searched for the words (spaces and case ignored); the papers by how often, a few places each.
// A word that ends in a number does not match a longer number (헌법 제1조 is not 제10조, 2004헌마55 is not 2004헌마554).
// art: an article asked (laws.articleQuery) — its citations are looked for instead, as articleFinder reads them
async function pageHits(keys, live, onUpdate, art = null) {
  const ks = keys.map(findKey), find = articleFinder(art);
  if (find) await Promise.race([laws.lawIndex(), new Promise((ok) => setTimeout(ok, 2500))]);   // (every law's name, for the citation reader)
  const withText = liveFiles().filter((f) => f.text);
  // the papers whose texts are on this device first (their hits show at once), then the ones fetched — a new device takes them
  // all in a few answers (bundleTexts) rather than one request a paper
  const results = [], queue = withText.filter((f) => texted.has(f.id)).concat(withText.filter((f) => !texted.has(f.id)));
  if (queue.some((f) => !texted.has(f.id))) bundleTexts();
  let done = 0;
  // (while the pages are read the papers stay in the order they were found; in order of how often, once all are read)
  const update = (end) => { if (live()) onUpdate(end ? results.sort((a, b) => b.n - a.n) : results, done, withText.length); };
  update();
  const worker = async () => {
    while (queue.length && live()) {
      const f = queue.shift();
      fgUntil = Math.max(fgUntil, Date.now() + 1500);   // the background waits while 찾기 fetches
      if (bundling && !texted.has(f.id)) await bundling;   // (coming in the bundle: read from this device once it is here)
      if (!live()) break;
      const t = await textOf(f).catch(() => null);
      done++;
      if (t && t.pages) {
        const snips = []; let count = 0;
        t.pages.forEach((txt, page) => {
          if (find) {
            for (const [a, b] of find(txt)) { count++; if (snips.length < 3) snips.push({ page, a: txt.slice(Math.max(0, a - 30), a), w: txt.slice(a, b), b: txt.slice(b, b + 40), q: txt.slice(a, b).replace(/\s+/g, ' ') }); }
            return;
          }
          const ff = findForm(txt), flat = ff.flat, map = ff.map;
          for (const key of ks.map((k) => keyFor(k, ff))) {
            const digitEnd = /\d$/.test(key);
            let i = flat.indexOf(key);
            while (i >= 0) {
              if (!(digitEnd && /\d/.test(txt[map[i + key.length - 1] + 1] || ''))) {   // the next letter in the page itself (a space between two numbers is a boundary)
                count++;
                if (snips.length < 3) { const a = map[i], b = map[i + key.length - 1] + 1; snips.push({ page, a: txt.slice(Math.max(0, a - 30), a), w: txt.slice(a, b), b: txt.slice(b, b + 40) }); }
              }
              i = flat.indexOf(key, i + key.length);
            }
          }
        });
        if (count) results.push({ f, n: count, snips, o: t.labels && t.labels.confident && t.labels.offset != null ? t.labels.offset : null });
      }
      if (done % 4 === 0) update();
    }
  };
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);   // six at a time: a new device fetches every paper's texts
  update(true);
}
/* A new device's page texts in a few answers (the server's bundle: forty papers an answer) instead of one request a paper —
   찾기 and the background fetch share the one run. A server without the bundle (an older one) answers null: each paper's
   texts are then read alone, as before. */
const BUNDLE_MIN = 6;
let bundling = null, bundleNo = false;
function bundleTexts() {
  if (bundling) return bundling;
  if (bundleNo || !navigator.onLine || typeof api.textsBundle !== 'function') return Promise.resolve(false);
  const want = new Map(liveFiles().filter((f) => f.text && !texted.has(f.id)).map((f) => [f.id, f]));
  if (want.size < BUNDLE_MIN) return Promise.resolve(false);
  const puts = [];
  bundling = (async () => {
    const r = await api.textsBundle((d) => {
      const f = want.get(d.id), t = d && d.text;
      if (!f || !t || !Array.isArray(t.pages) || (f.ocr && t.ocr !== f.ocr) || texted.has(d.id)) return;
      puts.push(store.put('texts', d.id, t).then(() => { texted.add(d.id); notePaper(d.id, t); }, () => {}));
    });
    await Promise.all(puts);
    if (r === null) bundleNo = true;
    return !!r;
  })().catch(() => false).finally(() => { bundling = null; });
  return bundling;
}

/* ---------- 헌재 결정: a card in 찾기, and the decision in a sheet ---------- */
async function caseCard(box, no, live) {
  const head = '<h2 class="sec-h">헌재 결정</h2>';
  // (cited in full — 헌재 2014. 12. 19. 2013헌다1, 판례집 26-2하, 1 — once its 판례집 book is read; marked until then: citeHtml)
  const card = (d) => `${head}<button type="button" class="case-card" data-case-open="${esc(no)}"><b>${esc(d.name || no)}</b><span>${cases.citeHtml(d)}${d.result ? ' · ' + esc(d.result) : ''}</span>${d.order || d.points ? `<em>${esc(String(d.order || d.points).split('\n')[0])}</em>` : ''}</button>`;
  box.innerHTML = head + '<p class="none">헌법재판소 판례정보에서 찾는 중…</p>';
  try {
    const d = await cases.decision(no, (pre) => { if (live()) box.innerHTML = card(pre); });
    if (!live()) return;
    if (d) { box.innerHTML = card(d); cases.book(d).then(() => { if (live() && box.isConnected) box.innerHTML = card(d); }, () => {}); }
    // not in the court's data: what is known of it, and the sheet with the ways to read it elsewhere
    else box.innerHTML = head + `<button type="button" class="case-card" data-case-open="${esc(no)}"><b>헌재 ${esc(no)}</b><span>${esc(cases.missingLine(no))}</span><em>국가법령정보센터·헌재 판례검색에서 보기 ›</em></button>`;
  } catch (e) {
    if (live()) box.innerHTML = head + `<p class="none">${offline(e) ? unreached('결정을 찾아 보여 드립니다', '찾아 보세요') : '지금은 헌법재판소 판례정보에 닿지 않습니다'}</p>`;
  }
}
/* ---------- 판례 and 법령: two screens, each with its own search ----------
   판례 (kind 'cases'): 헌재 결정 and the courts' judgments, by case number, words, an article (the cases on it) or a law's name;
   and, for words or a law's name, 법제처's 법령해석례.
   법령 (kind 'law'): every law's articles, by its name or an article — the text, how an article came to read so (연혁), the
   coming amendments, the bills before the Assembly, 법제처's interpretations of the article, the shelf's papers that cite it —
   and, one tap away, its cases in 판례; for words or a law's name, the 행정규칙 and 자치법규 by their names too. A case number
   asked of 법령 goes, on Enter, to 판례, which answers it.
   Each first screen is the owner's research: the provisions the homepage lists (research.json), the cases a paper is about,
   and the laws of each field. */
let lawRecent = null, caseRecent = null;
const lawView = (k = S.view.kind) => k === 'law' || k === 'cases';
const lawQ = () => (S.view.kind === 'cases' ? S.cq : S.lq) || '';
const setLawQ = (v) => { if (S.view.kind === 'cases') S.cq = v; else { S.lq = v; S.lold = null; } };   // (typed: no citation's old text behind it)
// a citation pasted from a paper or a footnote ('대법원 2006. 3. 16. 선고 2006두330 판결', '헌재 2004. 10. 21. 2004헌마554등
// 결정'): the one case it names (several different numbers are words to look for, not one case)
const one = (xs) => (xs.length && xs.every((x) => x.no === xs[0].no) ? xs[0] : null);
const citedCase = (q) => { const c = one(cases.scanCases(q)); return c ? { cno: c.no } : (() => { const k = one(laws.scanCourtCases(q)); return k ? { court: { no: k.no, court: k.court || '' } } : null; })(); };
const caseLike = (q) => !!(cases.caseQuery(q) || laws.courtQuery(q) || (!laws.articleQuery(q) && citedCase(q)));
// a question that reads as a law (its name, an article) rather than a case or plain words
const lawish = (q) => !caseLike(q) && !!(laws.articleQuery(q) || laws.lawKey(q) || /(?:법|법률|령|규칙|규정)$/.test(String(q || '').replace(/\s+/g, '')));
// the screen that answers what the other could not: a case number asked of 법령 → 판례 (판례 answers everything it is asked)
const otherKind = (kind, q) => (q && kind === 'law' && caseLike(q) ? 'cases' : '');
const unhash = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };
// 판례 and 법령 have their own search, wide at the top of the page (the shelf's small box in the toolbar is put away here)
function syncFind() {
  // (while 판례 or 법령 is made beside the screen shown, that screen keeps its own frame: changed when the new one is put in)
  const c = $('.content'); if (c && c._staged) return;
  const main = $('.main'), on = lawView() || S.view.kind === 'papers' || S.view.kind === 'write';
  if (on && lawView() && c && c.children.length && !c.querySelector(':scope > .law-top:not(.pp-top):not([hidden]):not(.is-stale)')) return;   // (not on screen yet: swap sets it)
  if (main && main.classList.contains('law-mode') !== on) main.classList.toggle('law-mode', on);
}
/* ---------- 논문 찾기: 국회도서관 국가학술정보 (학술논문·학위논문·단행본) ----------
   Asked through the shelf's server (which holds the key). A paper already on this shelf is marked; a paper opens a sheet with its
   abstract, contents and keywords, and the ways to its full text (국회전자도서관) and to other catalogues (RISS, 구글 학술검색). */
const ppRows = new Map();   // the papers on screen, for their sheets
const paperKey = () => [(S.pq || '').trim(), S.pjv || '', S.pj || '', S.ks || 'rel', S.pk ?? 'ARTICLE', S.ps || ''].join('|');
function paperFrame(c) {
  if (c.querySelector(':scope > .pp-top')) return;
  c.innerHTML = `<div class="law-top pp-top"><label class="law-find"><button type="button" class="ib nav-back" aria-label="뒤로" title="뒤로" hidden>${I.back}</button><span class="lf-ico">${I.search}</span><input type="search" placeholder="제목 · 주제어 · 저자 · 학술지" enterkeyhint="search" autocomplete="off" aria-label="논문 찾기"></label></div><div class="law-body pp-body"></div>`;
  const inp = $('.law-find input', c);
  inp.value = S.pq || '';
  const ask = (how = 'push') => {
    clearTimeout(S.pqT);
    // (typing that leaves the question as it is on screen — a space after it, a letter typed and taken back — asks nothing
    // and leaves the list as it is: it is not drawn again in another order)
    if (how === 'typing' && inp.value.trim() === (S.pq || '').trim() && !S.pjv) return;
    noteScroll(); S.pq = inp.value.trim(); S.pjv = ''; S.pj = ''; ppHow = how; renderPapers(c); ppHow = ''; nav(how);
  };
  inp.addEventListener('input', () => { ppTyped = Date.now(); clearTimeout(S.pqT); S.pqT = setTimeout(() => ask('typing'), 500); });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Escape') { inp.value = ''; ask('typing'); } if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ask(); inp.blur(); } });
  if (matchMedia('(hover: hover) and (pointer: fine)').matches && !S.pq) setTimeout(() => inp.focus(), 0);
  $('.nav-back', c).onclick = () => history.back();
  paintBack();
}
let ppSeq = 0;   // each drawing of 논문 찾기 (an older one still waiting for its answer gives way to the newer)
async function renderPapers(cIn) {
  const q = (S.pq || '').trim(), key = paperKey(), seq = ++ppSeq;
  paperFrame(cIn);
  downNote(cIn, 'papers');
  const inp = $('.law-find input', cIn);
  if (inp && inp.value.trim() !== q && document.activeElement !== inp) inp.value = q;
  const c = $('.pp-body', cIn);
  c.dataset.ppkey = key;
  const live = () => S.view.kind === 'papers' && !S.q && paperKey() === key && seq === ppSeq;
  if (S.pjv) { journalView(c, live); return; }
  if (!q) {
    if (!live()) return;
    // (what the box searches, said once under it: every year, not only the recent KCI papers listed below)
    c.innerHTML = `<div class="pp-home"><p class="pp-cap">모든 연도의 학술논문 · 학위논문 · 단행본에서 찾습니다</p><h2 class="sec-h">내 논문</h2><div class="law-ex"><button type="button" data-pq="${esc(research.ME)}"><span>${esc(research.ME)}</span><small>내가 쓴 글 · 연구자 정보</small></button></div>
      <section class="kci-new" hidden></section></div>`;
    store.del('kv', 'paperRecent').catch(() => {});
    kciNewSec($('.kci-new', c), live);
    return;
  }
  // the words are looked for everywhere at once: 국회도서관, KCI, ScienceON and this device's KCI index, as one list
  paperResults(cIn, c, q, live);
}
/* 논문 찾기's answer: every source the server reaches asked together (pfind.js) and made one list of papers — each paper once,
   with what any source knows of it — under one short line naming the sources that answered (all years, not only the KCI
   papers gathered here). The list is drawn once the quick sources have answered or PP_WAIT has passed, and no row moves after
   that unless asked: a paper a slower source adds to one already drawn is drawn again in its place (KCI's 권호, 피인용 …); papers
   it brings that this page would show are announced on the line above the list ('KCI에서 관련 높은 논문 2편이 더 왔습니다 ·
   보기'), and drawn, in order, only when that is tapped; the rest wait for 더 보기. Drawing each answer as it came would put
   the best papers first, but would move the rows one is reading or about to tap — and what is below the list with them;
   waiting for the slowest would leave the screen empty when one source is slow. The row of journals is made once too. */
const PP_WAIT = 1500;    // how long the first drawing waits for the slower sources
const PP_STAND = 1200;   // while typing, how long the words must stand after the last letter before the servers are asked
let ppHow = '';          // how the question was asked: 'push' (Enter), 'typing', or '' (going back, a sort, a journal …)
let ppTyped = 0;         // when the last letter was typed in the box
const PP_SORTS = [['rel', '관련도'], ['new', '최신'], ['cited', '피인용']];
const ppSortsHtml = (sort, cites) => PP_SORTS.filter(([k]) => k !== 'cited' || cites || sort === 'cited').map(([k, t]) => `<button type="button" data-ks="${k}" class="${k === sort ? 'on' : ''}">${t}</button>`).join('');
const ppKindsHtml = (kind) => papers.KINDS.map(([k, t]) => `<button type="button" data-pk="${k}" class="${k === kind ? 'on' : ''}">${t}</button>`).join('');
const ppHidden = (r) => !!(r.kci && kciHidden(r.kci));   // 관심 없음 (KCI papers set aside), on every device
// an order, a kind or a journal chosen above the list: shown at once, the answer follows — the same while the first answer
// is still awaited (the frame drawn then has these buttons too)
function ppPick(t, cIn) {
  const res = t.closest('.pp-res');
  const pick = (sel, b) => { if (res) for (const x of res.querySelectorAll(sel)) x.classList.toggle('on', x === b); };
  const sort = ['new', 'cited'].includes(S.ks) ? S.ks : 'rel', kind = S.pk ?? 'ARTICLE';
  const go = () => { noteScroll(); renderPapers(cIn); nav('typing'); };
  const ks = t.closest('[data-ks]'); if (ks) { if (ks.dataset.ks !== sort) { pick('[data-ks]', ks); S.ks = ks.dataset.ks; go(); } return true; }
  const pk = t.closest('[data-pk]'); if (pk) { if (pk.dataset.pk !== kind) { pick('[data-pk]', pk); S.pk = pk.dataset.pk; S.pj = ''; go(); } return true; }
  const jp = t.closest('[data-jpick]'); if (jp) { if (pfind.jkey(jp.dataset.jpick) !== pfind.jkey(S.pj || '')) { pick('[data-jpick]', jp); S.pj = jp.dataset.jpick; go(); } return true; }
  return false;
}
async function paperResults(cIn, c, q, live) {
  const how = ppHow, kind = S.pk ?? 'ARTICLE', sort = ['new', 'cited'].includes(S.ks) ? S.ks : 'rel';
  // what is there stays, faded, until the answer is drawn (a new question too: never a frame of an empty list between two)
  const was = c.querySelector(':scope > .pp-res');
  if (was) {
    was.classList.add('pp-stale', 'is-stale');
    if (c.dataset.kq !== q) { c.dataset.kq = ''; for (const x of c.children) x.classList.add('is-stale'); }
  }
  else {
    c.dataset.kq = '';
    c.innerHTML = `<section class="pp-res pp-kci"><div class="pp-kh"><h2 class="sec-h">논문 <span class="sec-n"></span></h2><div class="pp-sort" role="group" aria-label="순서">${ppSortsHtml(sort, false)}</div></div>
      <p class="pp-scope"><span class="pp-src">찾는 중…</span></p><div class="pp-opts" role="group" aria-label="자료 종류">${ppKindsHtml(kind)}</div><div class="list law-list kci-list pp-klist"><p class="none">찾는 중…</p></div></section>`;
    $(':scope > .pp-res', c).onclick = (e) => { ppPick(e.target, cIn); };
  }
  kci.journals().then(pfind.setJournals, () => {});   // (KCI's journals: a journal it lists is never taken for a magazine)
  // still typing: the servers are asked only once the words have stood PP_STAND since the last letter (Enter asks at once),
  // and only if the box still says them
  if (how === 'typing' && navigator.onLine) {
    for (;;) { const wait = ppTyped + PP_STAND - Date.now(); if (wait <= 0) break; await new Promise((ok) => setTimeout(ok, wait)); if (!live()) return; }
    const inp = $('.law-find input', cIn); if (inp && inp.value.trim() !== q) return;
  }
  const [jl] = await Promise.all([kciq.journals().catch(() => []), kciHiddenReady().catch(() => {})]);
  if (!live()) return;
  pfind.setPeople(ppPeople());   // (a name among the words is taken for a person's when the app knows it for one)
  const f = pfind.feed(q, kind), v = pfind.view(f, sort, S.pj || '', jl);
  if (how === 'push' || how === 'typing') { v.reset(); if (!v.j) f.facet = null; }   // asked anew: drawn anew (going back shows it as it was left)
  v.start();
  fgUntil = Math.max(fgUntil, Date.now() + 4000);   // (the shelf's own lookups in the background wait while this is answered)
  await v.settle(PP_WAIT);
  // nothing holds every word ('김대인 공법상 계약'): is a word someone's name? if so, their papers on the rest, waited for too
  if (live() && await v.probe() && live()) await v.settle(PP_WAIT);
  if (live()) ppPaint(cIn, c, q, f, v, jl, live);
}
// the people this app knows by name: the owner, and the authors its shelf's papers are named by (저자_제목: 홍길동·김철수_…)
function ppPeople() {
  const out = new Set([research.ME]);
  for (const f of liveFiles()) {
    if (!hasAuthor(f.name)) continue;
    for (const p of stem(f.name).split('_')[0].split(/[\s·ㆍ,]+/)) { const n = p !== '외' && naming.personName(p); if (n) out.add(n); }
  }
  return [...out];
}
// the index's journals by name, for a tap on a paper's journal (its own list, by issue): only when the name tells which one
function ppJournalOf(jl) {
  const m = new Map();
  for (const j of jl || []) { const k = pfind.jkey(j[0]); if (k) m.set(k, [...(m.get(k) || []), j]); }
  return (r) => {
    const l = m.get(pfind.jkey(r.journal));
    if (!l) return null;
    if (l.length === 1) return l[0];
    const p = papers.norm(r.publisher), hit = p ? l.filter((j) => papers.norm(j[1]) === p) : [];
    return hit.length === 1 ? hit[0] : null;
  };
}
// (a mouse can point at a journal's name in a row; on a touch screen the name is plain text, and the paper's sheet has the
// button to the journal's list — a tap meant for the paper never lands on a name 15 px tall)
const finePointer = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
function ppRow(r, shelf, jOf, kind) {
  const mine = shelf.get(papers.norm(papers.mainTitle(r.t)));
  const who = r.a.length > 3 ? r.a.slice(0, 3).join('·') + ' 외' : r.a.join('·');
  const x = { journal: r.journal, v: r.v, i: r.i, y: r.y, m: r.m }, iss = kciIssue(x), when = kciWhen(x);
  const art = !r.kind || r.kind === 'ARTICLE', jj = art && r.journal && finePointer() ? jOf(r) : null;
  const jn = !art || !r.journal ? '' : jj ? `<i class="pp-jn" role="link" tabindex="0" data-jn="${esc(jj[0])}" data-jp="${esc(jj[1] || '')}">${esc(r.journal)}</i>` : esc(r.journal);
  const where = art ? [jn + (iss ? (jn ? ' ' : '') + esc(iss) : '')] : [kind === '' ? esc(r.kindName || '') : '', esc(r.publisher || '')];
  const meta = [who ? esc(who) : '', ...where, when ? esc(when) : ''].filter(Boolean).join(' · ');
  // (KCI 등재 · 등재후보 only where an answer said so of the journal: a bare 'KCI' would read as that standing, and it only
  // meant that KCI's record had come back)
  const grade = art ? pfind.gradeOf(r) : '', mag = art && pfind.venue(r) === 1;
  const badges = `${grade ? ` <em class="pp-kcib">${esc(grade)}</em>` : ''}${mag ? ' <em class="pp-mag">잡지</em>' : ''}${mine ? ' <em class="pp-mine">내 서재</em>' : ''}${r.open ? ' <em class="pp-open">원문 공개</em>' : ''}${r.c ? ` <em class="pp-cited">피인용 ${r.c}</em>` : ''}`;
  const ab = r.ab ? `<span class="pp-ab">${esc(r.ab.length > 118 ? r.ab.slice(0, 117) + '…' : r.ab)}</span>` : '';
  return `<div class="kci-item no-x" data-row="${r.n}"><button type="button" class="lrow pp-row" data-pr="${r.n}"><b>${esc(r.t)}${badges}</b>${r.reading ? `<span class="pp-read">${esc(r.reading)}</span>` : ''}<span>${meta}</span>${ab}</button></div>`;
}
// the sources whose papers are on screen, as one line, with how far back they reach: '국회도서관 · KCI · ScienceON · 모든 연도',
// and this device's index of the recent KCI law papers (when KCI itself is not asked) as 'KCI 최근 법학 논문'.
// A source is named once one of its papers is on screen (with nothing on screen, every source that answered)
function ppScope(v, onScreen) {
  const ok = (b) => { const s = v.state(b); return !!s && s.state === 'ok'; };
  const shown = (b) => ok(b) && (!onScreen.size || onScreen.has(b));
  const all = ['nanet', 'kci', 'so'].filter(shown).map((b) => pfind.NAMES[b]);
  const recent = onScreen.size ? onScreen.has('idx') && !onScreen.has('kci') : ok('idx') && !ok('kci');
  const wait = v.srcs.some((s) => s.state === 'busy');
  // ('국회도서관 · KCI · 모든 연도' reads as where the papers come from, then how far back; the recent index after them)
  const parts = [all.length ? all.join(' · ') + ' · 모든 연도' : '', recent ? 'KCI 최근 법학 논문' : ''].filter(Boolean);
  if (!parts.length) return wait ? '찾는 중…' : '';
  return parts.join(' · ') + (wait ? ' · 더 찾는 중' : '');
}
// why a source is not in the answer, when it should be said: no internet, or 국회도서관's day used up or out of reach (a key
// not set, or a source refusing it, is never spoken of: the source is just not named above)
function ppTrouble(v) {
  const na = v.state('nanet'), e = na && na.state === 'err' ? na.err : null;
  if (!navigator.onLine || (e && api.isOffline(e))) {
    const ok = (b) => { const s = v.state(b); return !!s && s.state === 'ok'; };
    const why = navigator.onLine ? '책장 서버에 닿지 않' : '인터넷에 연결되지 않';
    return { offline: true, text: ['nanet', 'kci', 'so'].some(ok) ? `${why}습니다 · 앞서 찾아 둔 것만 보여 드립니다` : ok('idx') ? `${why}아 이 기기에 받아 둔 KCI 최근 법학 논문에서만 찾았습니다` : unreached('찾을 수 있습니다', '찾아 보세요') };
  }
  if (e && e.code === 'busy') return { text: '오늘은 국회도서관의 이용량이 다 차서 국회도서관 없이 찾았습니다 · 자정이 지나면 다시 함께 찾습니다' };
  if (e && !pfind.refused(e)) return { text: '지금은 국회도서관에 닿지 않아 국회도서관 없이 찾았습니다 · 잠시 뒤 다시 찾아 보세요' };
  return null;
}
// the question is a person (a paper here was written by someone of exactly that name, pfind's view.who): a card to the
// researcher's page, with where they are and how many papers KCI holds by them once KCI has said
function ppWho(v) {
  const who = v.who;
  if (!who) return '';
  const na = v.f.pool.recs.map((r) => r.parts.nanet && r.parts.nanet.raw).find((x) => x && x.ids && x.ids[who]);
  return `<div class="pp-wholine"><button type="button" class="pp-who pp-card" data-who="${esc(who)}" data-aid="${esc((na && na.ids[who]) || '')}"><b>${esc(who)}</b><span class="pp-cardm">${esc(ppWhoMeta(v))}</span><span class="pp-cardgo">연구자 정보 ›</span></button></div>`;
}
function ppWhoMeta(v) {
  const n = new Map();
  for (const r of v.f.pool.recs) { const a = r.affOf && r.affOf[v.who]; if (a) n.set(a, (n.get(a) || 0) + 1); }
  const aff = [...n.entries()].sort((a, b) => b[1] - a[1])[0];
  const au = v.srcs.find((s) => /^kci:au:/.test(s.id) && s.page > 0);
  return [aff ? aff[0] : '', au && au.total ? `KCI 논문 ${au.total.toLocaleString()}편` : ''].filter(Boolean).join(' · ');
}
// the question is a journal's very name (one this device's index knows, and only one of that name): a card to its own list,
// issue by issue, above its papers
function ppJournalCard(q, jl, v) {
  const k = papers.norm(q);
  if (v.j || v.who || k.length < 2) return '';
  const hit = (jl || []).filter((j) => pfind.jkey(j[0]) === k);
  if (hit.length !== 1) return '';
  const [name, pub] = hit[0];
  return `<div class="pp-wholine"><button type="button" class="pp-card pp-jcard" data-jn="${esc(name)}" data-jp="${esc(pub || '')}"><b>${esc(name)}</b><span class="pp-cardm">${esc(pub || '')}</span><span class="pp-cardgo">호별로 보기 ›</span></button></div>`;
}
// a paper opens the richest sheet there is: KCI's when its KCI id is known, else 국회도서관's, else ScienceON's record as one
// (with what the others know of it: 국회도서관's keywords and its record's page, each author's affiliation as KCI gave it)
const ppKci = (r) => ({ id: r.kci || '', o: r.o || '', t: r.t, a: r.a || [], journal: r.journal || '', publisher: r.publisher || '', y: r.y || '', m: r.m || '', v: r.v || '', i: r.i || '', fp: r.fp || '', lp: r.lp || '',
  open: !!(r.open && r.kci), c: r.c || 0, doi: r.doi || '', ab: r.ab || '', affs: r.affs || [], affOf: r.affOf || null, kw: r.kw || [],
  nanet: (r.parts.nanet && r.parts.nanet.raw && r.parts.nanet.raw.page) || '',
  links: r.so ? [r.so.full && ['ScienceON 원문', r.so.full], r.so.page && ['ScienceON', r.so.page]].filter(Boolean) : [] });
// back: where the sheet was opened from (a researcher's page) — its ‹ goes there again
function openPaper(r, back) {
  const na = r.parts.nanet && r.parts.nanet.raw;
  if (!r.kci && na) { ppRows.set(na.id + ':' + na.kind, na); paperSheet(na, back); return; }
  kciSheet(ppKci(r), back);
}
function ppPaint(cIn, c, q, f, v, jl, live) {
  if (c.dataset.kq !== q) {   // 내 책장에서 and 다른 곳에서: once per question (a sort, a kind or a journal leaves them as they are)
    c.dataset.kq = q;
    // (the list is drawn now; the last question's 내 책장에서 and 국회입법조사처 stay, faded, until this question's are ready —
    // read from the stored texts, a moment — so the screen never drops to the list alone and grows back under the reader)
    const oldTail = [...c.children].filter((x) => !x.matches('.pp-res'));
    const fresh = document.createRange().createContextualFragment(`<section class="pp-res pp-kci"></section><section class="pp-mine-sec"></section><section class="nr-sec" hidden></section>${elsewhereRow(q)}`);
    const nres = fresh.firstElementChild, mine = $('.pp-mine-sec', fresh), nr = $('.nr-sec', fresh);
    const oldRes = c.querySelector(':scope > .pp-res');
    if (oldRes) oldRes.replaceWith(nres); else c.prepend(nres);
    const tail = [...fresh.childNodes];
    let swapped = false;
    const swap = () => {
      if (swapped) return; swapped = true;
      if (!nres.isConnected) return;
      for (const x of oldTail) x.remove();
      nres.after(...tail);
      lazyThumbs();
    };
    if (!oldTail.length) swap();
    // 국회입법조사처's reports whose titles hold the words (nars.js, loaded on first use; nothing found: nothing shown)
    pfind.narsSection(nr, q, { upload, toast, live, mine: (t) => shelfTitles().has(papers.norm(papers.mainTitle(t))) });
    let read = null;
    if (q.replace(/\s+/g, '').length >= 2) read = mineSec(mine, [q.replace(/\s+/g, '')], q, live, null, '편 본문에', null, true);
    if (!swapped) {
      const t0 = Date.now();
      // (ready: every stored text read — a moment; a device still fetching texts swaps at 1.2 s and the section fills in place)
      const look = () => { if (swapped || !live()) return; if (!read || Date.now() - t0 > 1200) swap(); else requestAnimationFrame(look); };
      if (read) read.then(swap, swap);
      requestAnimationFrame(look);
    }
  }
  const res = $(':scope > .pp-res', c), token = {};
  if (res._unhear) res._unhear();
  res._token = token;
  res.classList.remove('pp-stale', 'is-stale');
  const kind = v.f.kind, sort = v.sort, art = kind === 'ARTICLE' || kind === '';
  if (!f.facet && !v.j) f.facet = pfind.journalsOf(f, ppHidden);
  const facet = !art ? [] : f.facet && f.facet.length ? f.facet.slice(0, 8) : v.j ? [{ name: v.jname, n: 0 }] : [];
  const rows = v.shown.filter((r) => !ppHidden(r));
  if (rows.length < pfind.PAGE) rows.push(...v.next(pfind.PAGE - rows.length, ppHidden));
  const jOf = ppJournalOf(jl), trouble = ppTrouble(v);
  const waiting = () => v.srcs.some((s) => s.state === 'busy');
  const drawn = new Map();   // the papers on screen, each with what it knew when drawn (one that learns more is drawn again)
  const onScreen = () => { const s = new Set(); for (const r of drawn.keys()) for (const b of r.srcs) s.add(b); return s; };
  const atPaint = new Set(v.srcs.filter((s) => s.state === 'ok').map((s) => s.id)), lateFrom = new Set();
  let lastG = null, late = null, busy = false;
  // rows in the view's order, a line above each group after the first (잡지 · 기사 3편 …)
  const rowsHtml = (list) => {
    const shelf = shelfTitles();
    return list.map((r) => {
      const g = v.g(r), prev = lastG === null ? '' : v.label(lastG);
      let lab = v.label(g);
      if (!lab && prev) lab = v.who ? `${v.who}의 글` : '논문';   // (back to the first group after a later one, as a late answer may bring)
      drawn.set(r, r.ver); lastG = g;
      return (lab && lab !== prev ? `<div class="pp-div">${esc(ppGroupLine(v, g, lab))}</div>` : '') + ppRow(r, shelf, jOf, kind);
    }).join('');
  };
  // ('1편 · 비슷한 논문 29편 · 그 밖의 글 1편': the question's own papers, the widened ones and the rest, said apart — v.countLine)
  const countText = () => { const k = v.count(ppHidden); return k.n ? (typeof v.countLine === 'function' ? v.countLine(ppHidden) : `${k.n.toLocaleString()}편${k.more ? ' 이상' : ''}`) : waiting() ? '' : '0편'; };
  const nameLine = () => { const nn = typeof v.nameNote === 'function' ? v.nameNote() : null; return nn ? `<p class="pp-split pp-nn">${esc(nn.text)} · <button type="button" class="law-eg" data-unsplit>${esc(nn.again)}</button></p>` : ''; };
  // (a person's papers are read newest first, a few pages at a time: while there are older ones, nothing found is not 'none')
  const empty = () => (trouble ? trouble.text : v.who && v.topic ? (v.hasMore(ppHidden) ? `${v.who}의 최근 글 가운데에는 ‘${v.topic}’에 관한 글이 없습니다 · 예전 글은 아래에서 더 찾아 보세요`
    : `${v.who}의 글 가운데 ‘${v.topic}’에 관한 글을 찾지 못했습니다 · 연구자 정보에서 모든 글을 볼 수 있습니다`)
    : v.srcs.some((s) => s.common) && !v.srcs.some((s) => s.total) ? '너무 흔한 낱말입니다 · 더 또렷한 말로 찾아 보세요' : '찾지 못했습니다 · 낱말을 줄이거나 다른 말로 찾아 보세요');
  // nothing found, and a word of the question could be a person's name not yet known for one: offered as that person's papers
  // on the rest ('김대인의 글에서 공법상 계약 찾기')
  const hintHtml = () => { const h = !trouble && v.hint(); return h ? `<p class="pp-split"><button type="button" class="law-eg" data-split="${esc(h.who)}">${esc(h.who)}의 글에서 ${esc(h.topic)} 찾기</button></p>` : ''; };
  const shownN = () => v.shown.filter((r) => !ppHidden(r)).length;
  // (no count to give — a person's papers on a topic are picked from their list as it is read — is no '0 / 0')
  const moreText = () => { const n = Math.max(v.count(ppHidden).n, shownN()); return !shownN() && v.who && v.topic ? `${v.who}의 예전 글에서 더 찾기` : n ? `더 보기 · ${shownN().toLocaleString()} / ${n.toLocaleString()}` : '더 보기'; };
  const moreHtml = () => (v.hasMore(ppHidden) ? `<button type="button" class="more">${esc(moreText())}</button>` : '');
  // none holding every word, the similar papers of a widened question shown: said above them — a person's papers on a topic,
  // none of theirs on it, as the empty screen says it; a name not yet known for a person's, with the offer of their papers
  const noneAbove = () => (v.count(ppHidden).exact ? '' : v.who && v.topic ? empty() : !trouble && v.hint() ? '모든 낱말이 든 논문은 찾지 못했습니다' : '');
  const aboveHtml = () => { const t = waiting() ? '' : noneAbove(); return t ? `<p class="none">${esc(t)}</p>${hintHtml()}` : ''; };
  const listHtml = rows.length ? aboveHtml() + rowsHtml(rows) : `<p class="none">${esc(waiting() ? '찾는 중…' : empty())}</p>${waiting() ? '' : hintHtml()}`;
  const none = !rows.length && !waiting();   // (nothing found: no orders to choose among)
  res.innerHTML = `<div class="pp-kh"><h2 class="sec-h">논문 <span class="sec-n">${countText()}</span></h2><div class="pp-sort" role="group" aria-label="순서"${none ? ' hidden' : ''}>${ppSortsHtml(sort, v.hasCites())}</div></div>
    <p class="pp-scope"><span class="pp-src">${esc(ppScope(v, onScreen()))}</span></p>
    <div class="pp-opts" role="group" aria-label="자료 종류">${ppKindsHtml(kind)}</div>
    ${facet.length ? `<div class="pp-facet"><button type="button" class="pp-fc ${v.j ? '' : 'on'}" data-jpick="">전체</button>${facet.map((j) => `<button type="button" class="pp-fc ${pfind.jkey(j.name) === v.j ? 'on' : ''}" data-jpick="${esc(j.name)}">${esc(j.name)}${j.n ? ` <em>${j.n}</em>` : ''}</button>`).join('')}</div>` : ''}
    ${trouble && rows.length ? `<p class="pp-note">${esc(trouble.text)}</p>` : ''}${ppWho(v)}${nameLine()}${ppJournalCard(q, jl, v)}
    <div class="list law-list kci-list pp-klist">${listHtml}${moreHtml()}</div>
    <div class="pp-foot"></div>`;
  const list = $('.pp-klist', res);
  // (a tall screen sees what is under the list — 내 책장에서, 다른 곳에서 — while the answers are on their way: the list keeps
  // the rest of the screen until it has a page of papers, so those come in above the fold instead of pushing it down. The
  // room is kept under a short final list until the next question: given back, it would pull up what is under it)
  const hold = () => {
    if (!list.isConnected || !waiting() || list.querySelectorAll('.lrow').length >= pfind.PAGE) return;
    const want = Math.round(innerHeight - list.getBoundingClientRect().top + 24);
    if (want > list.offsetHeight) list.style.minHeight = want + 'px';
  };
  hold();
  // the row of journals scrolls sideways: it fades at the right edge while there are more to the right
  const fc = $('.pp-facet', res);
  if (fc) { const fz = () => fc.classList.toggle('pp-fade', fc.scrollLeft + fc.clientWidth < fc.scrollWidth - 2); fc.addEventListener('scroll', fz, { passive: true }); requestAnimationFrame(fz); }
  // the line above the list: the sources whose papers are on screen — or, when papers came late that this page would show,
  // how many and from where, with 보기 (one line either way: what is below it does not move)
  const scope = () => {
    const sc = $('.pp-scope', res); if (!sc) return;
    sc.innerHTML = late ? `<span class="pp-src">${esc(late)}</span><button type="button" class="pp-lateb">보기</button>` : `<span class="pp-src">${esc(ppScope(v, onScreen()))}</span>`;
  };
  const refresh = () => {   // what may change in place without moving a row: the count, the orders, the line above, the journals' numbers, 더 보기
    const n = $('.pp-kh .sec-n', res); if (n) n.textContent = countText();
    const sg = $('.pp-sort', res);
    if (sg) {
      sg.hidden = !list.querySelector('.lrow') && !waiting();
      if (v.hasCites() && !sg.querySelector('[data-ks="cited"]')) sg.insertAdjacentHTML('beforeend', '<button type="button" data-ks="cited">피인용</button>');   // (citation counts came late)
    }
    scope();
    if (facet.length) {
      const m = pfind.journalCounts(f, ppHidden);
      for (const b of res.querySelectorAll('.pp-fc[data-jpick]')) { const e = b.querySelector('em'), x = m.get(pfind.jkey(b.dataset.jpick)); if (e && x && x.n > Number(e.textContent)) e.textContent = x.n; }
    }
    const wm = $('.pp-who .pp-cardm', res); if (wm) wm.textContent = ppWhoMeta(v);
    if (busy) return;
    // (a 더 보기 that comes only now is put below the rows while that place is out of sight: else it would push down what is
    // under the list as one reads it — the line above says what came, and 보기 draws it with its 더 보기)
    const old = list.querySelector(':scope > .more'), has = v.hasMore(ppHidden);
    if (old && has) old.textContent = moreText(); else if (old) old.remove(); else if (has && (!list.querySelector('.lrow') || !endSeen())) list.insertAdjacentHTML('beforeend', moreHtml());
  };
  const endSeen = () => list.getBoundingClientRect().bottom <= innerHeight;
  const append = (add) => {
    if (!add.length) return;
    const nn = list.querySelector(':scope > .none'); if (nn) { const t = waiting() ? '' : noneAbove(); if (t) nn.textContent = t; else nn.remove(); }
    // (the offer of a person's papers stays while none hold every word: the similar papers a widened question found come
    // under it — '오정민의 글에서 공법상 계약 찾기' is still the way to what was meant)
    const sp = list.querySelector(':scope > .pp-split'); if (sp && (v.count(ppHidden).exact || !v.hint())) sp.remove();
    const at = list.querySelector(':scope > .more');
    const html = rowsHtml(add);
    if (at) at.insertAdjacentHTML('beforebegin', html); else list.insertAdjacentHTML('beforeend', html);
  };
  // a paper on screen that a later answer told more of (KCI's 권호, month, 피인용, its title as KCI writes it): drawn again in
  // its place
  const repaint = () => {
    const shelf = shelfTitles();
    for (const [r, ver] of drawn) {
      if (r.ver === ver) continue;
      drawn.set(r, r.ver);
      const el = list.querySelector(`:scope > .kci-item[data-row="${r.n}"]`);
      if (el) el.outerHTML = ppRow(r, shelf, jOf, kind);
    }
  };
  // papers that came after the drawing and that a drawing made now would put on this page (above its last row, or filling
  // a short page): told on the line above, drawn in order only when 보기 is tapped
  const lateNote = () => {
    late = null;
    const have = [...drawn.keys()].filter((r) => !ppHidden(r)), last = have[have.length - 1];
    if (busy || !last) return;
    const next = v.peek(pfind.PAGE, ppHidden);
    const above = next.filter((r) => v.cmp(r, last) < 0), fill = have.length < pfind.PAGE ? next.slice(0, pfind.PAGE - have.length) : [];
    const add = new Set([...above, ...fill]);
    if (!add.size) {   // (papers for after this page, and no 더 보기 under it that could be put there unseen)
      const rest = v.left(ppHidden).length;
      if (rest && !list.querySelector(':scope > .more') && endSeen()) late = `논문 ${rest.toLocaleString()}편이 더 왔습니다`;
      return;
    }
    const from = ['kci', 'so', 'nanet', 'idx'].filter((b) => lateFrom.has(b) && [...add].some((r) => r.srcs.has(b))).map((b) => (b === 'idx' ? 'KCI 최근 법학 논문' : pfind.NAMES[b]));
    const what = above.length ? { rel: '관련 높은 ', new: '더 최근 ', cited: '더 많이 인용된 ' }[sort] : '';
    late = `${from.length ? from.join(' · ') + '에서 ' : ''}${what}논문 ${add.size}편이 더 왔습니다`;
  };
  const hear = (s) => {
    if (res._token !== token || !res.isConnected || !live()) { f.hear.delete(hear); return; }
    if (!v.ids.includes(s.id)) return;
    if (s.state === 'ok' && !atPaint.has(s.id)) lateFrom.add(s.base);
    if (busy) return;   // (더 보기 is under way: what came is drawn with it)
    repaint();
    if (!list.querySelector('.lrow')) {   // nothing on screen yet: the first papers are simply drawn
      const add = v.next(pfind.PAGE, ppHidden);
      if (add.length) append(add);
      else {
        const nn = list.querySelector(':scope > .none');
        if (nn && !waiting()) {
          const t = ppTrouble(v); nn.textContent = t ? t.text : empty();
          const sp = list.querySelector(':scope > .pp-split'); if (sp) sp.remove();
          if (!t) nn.insertAdjacentHTML('afterend', hintHtml());
          if (v.who && !res.querySelector('.pp-wholine')) list.insertAdjacentHTML('beforebegin', ppWho(v));   // (a name found on the way: its card)
        }
      }
    } else {
      // a short page (the quick sources had few, the library answered later): what came is added under the rows there, so
      // the page fills — nothing above moves; papers that rank above the rows shown are still told on the line above
      const have = [...drawn.keys()].filter((r) => !ppHidden(r)).length;
      if (have < pfind.PAGE) { const add = v.next(pfind.PAGE - have, ppHidden); if (add.length) append(add); }
      lateNote();
    }
    // a note on what could not be asked, the person's card: below the list, and only while that is out of sight
    const foot = $('.pp-foot', res), t = ppTrouble(v), unseen = foot && foot.getBoundingClientRect().top > innerHeight;
    if (unseen && t && list.querySelector('.lrow') && !res.querySelector('.pp-note') && !foot.textContent) foot.innerHTML = `<p class="pp-note">${esc(t.text)}</p>`;
    if (unseen && !res.querySelector('.pp-who')) { const w = ppWho(v); if (w) foot.insertAdjacentHTML('beforeend', w); }
    refresh();
    hold();
  };
  f.hear.add(hear);
  res._unhear = () => f.hear.delete(hear);
  res.onclick = async (e) => {
    const t = e.target;
    if (ppPick(t, cIn)) return;
    if (t.closest('.pp-lateb')) { late = null; v.reset(); ppPaint(cIn, c, q, f, v, jl, live); return; }   // (the late papers in their places: drawn anew)
    const us = t.closest('[data-unsplit]');
    if (us && typeof v.unsplit === 'function') {   // a word read as a person's name, taken back: the words alone, widened, drawn anew once answered
      us.disabled = true; us.textContent = '찾는 중…';
      v.unsplit(); v.start();
      await v.settle(PP_WAIT);
      if (res._token === token && live()) { v.reset(); ppPaint(cIn, c, q, f, v, jl, live); }
      return;
    }
    const sp = t.closest('[data-split]');
    if (sp) {   // the offer taken: that person's papers on the rest, asked now and drawn anew once they have answered
      sp.disabled = true; sp.textContent = '찾는 중…';
      v.force(sp.dataset.split);
      await v.settle(PP_WAIT);
      if (res._token === token && live()) { v.reset(); ppPaint(cIn, c, q, f, v, jl, live); }
      return;
    }
    const jc = t.closest('.pp-jcard'); if (jc) { openJournal(jc.dataset.jn, jc.dataset.jp); return; }
    if (t.closest('.pp-jn')) return;   // (a journal's name: its own list, opened by the content's click)
    const mb = t.closest('.pp-klist > .more');
    if (mb) {
      if (busy) return;
      busy = true; mb.textContent = '불러오는 중…';
      const add = await v.more(pfind.PAGE, ppHidden);
      busy = false;
      if (res._token !== token || !live()) return;
      repaint(); append(add); lateNote(); refresh();
      if (!add.length && v.failed) {   // (a page that could not be had: said, and asked again on the next tap)
        const msg = navigator.onLine ? '불러오지 못했습니다 · 다시 누르기' : '인터넷에 연결되면 더 볼 수 있습니다 · 다시 누르기';
        const b = list.querySelector(':scope > .more');
        if (b) b.textContent = msg; else list.insertAdjacentHTML('beforeend', `<button type="button" class="more">${esc(msg)}</button>`);
      }
      return;
    }
    const pr = t.closest('[data-pr]');
    if (pr && Date.now() - pressedAt >= 800) { const r = f.pool.recs[Number(pr.dataset.pr)]; if (r) openPaper(r); }
  };
}
// the line above a group: '잡지 · 기사 3편', '피인용 정보 없음 (국회도서관 · ScienceON)' …
function ppGroupLine(v, g, lab) {
  if (g >> 2) return `${lab} ${v.groupCount(g, ppHidden).toLocaleString()}편`;
  if (v.sort === 'cited' && (g & 1)) {
    const from = ['nanet', 'so'].filter((b) => v.srcs.some((s) => s.base === b && s.state === 'ok')).map((b) => pfind.NAMES[b]);
    return lab + (from.length ? ` (${from.join(' · ')})` : '');
  }
  return lab;
}
/* a journal's papers, newest issue first (reached by tapping a journal's name), under a head for each issue — '제23권 제3호 ·
   2026. 10. · 13편' — and, above them, how much of the journal the shelf's index holds: '책장이 모은 호 2개 (2024. 2. – 2026. 10.)'
   with the way to the rest at KCI. Where two issues shown are not one after the other, a quiet line says the issues between
   are not gathered yet (kciq.issues: gapAfter) — never read as a journal that published nothing. The heads, the line on what
   is held and the first rows come in one frame. */
const kciJournalUrl = (name) => `https://www.kci.go.kr/kciportal/po/search/poTotalSearList.kci?sereArticleSearchBean.keyword=${encodeURIComponent(name)}`;
async function journalView(c, live) {
  const [name, pub] = String(S.pjv).split('\u0001');
  await kciq.ready();
  if (!c.querySelector('.pp-jv')) c.innerHTML = `<section class="pp-jv"><div class="list-h pp-jvh"><h2 class="sec-h">${esc(name)}${pub ? ` <span class="sec-n">${esc(pub)}</span>` : ''}</h2></div><p class="law-note pp-jcov">&nbsp;</p><div class="list law-list kci-list pp-jlist"><p class="none">불러오는 중…</p></div></section>`;
  const list = $('.pp-jlist', c), cov = $('.pp-jcov', c);
  const iss = typeof kciq.issues === 'function' ? await kciq.issues(S.pjv).catch(() => null) : null;
  const byKey = new Map(((iss && iss.issues) || []).map((g, i) => [g.key, { ...g, i }]));
  const keyOf = (x) => (typeof kciq.issueKey === 'function' ? kciq.issueKey(x) : [x.v || '', x.i || '', x.y || ''].join('|'));
  const headOf = (g, x) => [g ? kciIssue({ journal: name, v: g.vol, i: g.no }) : kciIssue({ ...x, journal: name }), g ? g.date : kciWhen(x), g && g.n ? `${g.n}편` : ''].filter(Boolean).join(' · ') || '권호 미상';
  const kciLink = `<a href="${kciJournalUrl(name)}" target="_blank" rel="noopener">KCI에서 보기</a>`;
  let page = 1, busy = false, lastKey = null;
  const seenKeys = new Set();
  const draw = async (append) => {
    const r = await kciq.search('', { sort: 'new', journal: S.pjv, page, size: 24 }).catch(() => null);
    if (!live() || !list.isConnected) return;
    if (!r) { if (!append) { list.innerHTML = '<p class="none">불러오지 못했습니다</p>'; setText(cov, ''); } return; }
    if (!append) {
      list.innerHTML = '';
      if (!$('.pp-jvh .sec-cnt', c)) $('.pp-jvh', c).insertAdjacentHTML('beforeend', `<span class="sec-cnt">${r.total.toLocaleString()}편</span>`);
      const n = iss ? iss.issues.length : 0;
      cov.innerHTML = n ? `책장이 모은 호 ${n}개${iss.from && iss.to ? ` (${esc(iss.from === iss.to ? iss.to : `${iss.from} – ${iss.to}`)})` : ''} · 빠진 호는 ${kciLink}` : `책장의 KCI 색인에 있는 논문입니다 · 다른 호는 ${kciLink}`;
    }
    const old = list.querySelector('.more'); if (old) old.remove();
    const shelf = shelfTitles();
    let html = '';
    for (const x of r.rows) {
      const k = keyOf(x);
      if (k !== lastKey && !seenKeys.has(k)) {
        const g = byKey.get(k), pg = lastKey != null ? byKey.get(lastKey) : null;
        // (the issue before it in the list is not the one before it in the journal: the issues between are not here)
        if (pg && pg.gapAfter && g && g.i === pg.i + 1) html += `<p class="none pp-gap">이 사이 호는 아직 모으지 못했습니다 · ${kciLink}</p>`;
        html += `<div class="kci-month pp-iss" data-iss="${esc(k)}">${esc(headOf(g, x))}</div>`;
        seenKeys.add(k);
      }
      lastKey = k;
      html += kciRow(x, shelf, { snip: false, jtap: false });
    }
    list.insertAdjacentHTML('beforeend', html);
    const shown = list.querySelectorAll('.lrow').length;
    if (shown < r.total && r.rows.length) {
      list.insertAdjacentHTML('beforeend', `<button type="button" class="more">더 보기 · ${shown.toLocaleString()} / ${r.total.toLocaleString()}</button>`);
      list.lastElementChild.onclick = async (e) => { if (busy) return; busy = true; e.currentTarget.textContent = '불러오는 중…'; page++; await draw(true); busy = false; };
    }
  };
  await draw(false);
}
function openJournal(name, pub) {   // to a journal's own list of papers, by issue
  noteScroll();
  S.pjv = name + '\u0001' + (pub || '');
  const cIn = ($('.pp-body') && $('.pp-body').parentElement) || $('.content');
  if (cIn) { renderPapers(cIn); nav(); }
}
/* ---------- KCI 법학 논문 ----------
   Every law paper in KCI by the month it came out (kci/law/ beside the app: gathered from KCI's OAI-PMH every week going
   forward, and every hour going back until three years are covered), newest month first, a journal's papers together,
   headed '새로 나온 KCI 법학 논문' (how far back the gathering has come is not the reader's concern). One opens with the start of its abstract
   and its KCI page; one set aside (관심 없음) is left out from then on, on every device. Months are read only as the list
   reaches them. (kci/new.json, the last eight weeks, stands in while the months are not there.) */
const kciUrl = (path) => new URL('./kci/' + path, location.href);
let kciIdxP = null, kciNewP = null;
const kciIndex = () => (kciIdxP ||= fetch(kciUrl('law/index.json'), { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => { kciIdxP = null; return null; }));
const kciNew = () => (kciNewP ||= fetch(kciUrl('new.json'), { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : [])).then((d) => (Array.isArray(d) ? d : [])).catch(() => { kciNewP = null; return []; }));
const kciMonthP = new Map();
// a month's papers, a journal's together (its newest issue first, each issue in page order)
const kciOrder = (a, b) => (a.j || '').localeCompare(b.j || '', 'ko') || (Number(b.v) || 0) - (Number(a.v) || 0) || (Number(b.i) || 0) - (Number(a.i) || 0) || (Number(a.fp) || 0) - (Number(b.fp) || 0);
const kciMonth = (key) => { if (!kciMonthP.has(key)) kciMonthP.set(key, fetch(kciUrl(`law/${key}.json`)).then((r) => (r.ok ? r.json() : [])).then((d) => (Array.isArray(d) ? d.slice().sort(kciOrder) : [])).catch(() => { kciMonthP.delete(key); return []; })); return kciMonthP.get(key); };
const monthName = (key) => (key.endsWith('-00') ? `${key.slice(0, 4)}년` : `${key.slice(0, 4)}년 ${Number(key.slice(5))}월`);
// (how far back the gathering has come is the pipeline's business, not the reader's: the list is headed by what it is, the
// new KCI law papers, and the search box above says it searches every year)
/* the KCI papers set aside (관심 없음): kept on this device at once and with the server, so every device leaves them out —
   { ART…: { at, on } }, set aside or brought back, the newest word wins */
const KH = { map: {}, q: {}, t: 0, ready: null, at: 0 };
function kciHiddenReady() {   // (asked of the server again when the list is drawn ten minutes or more after the last time)
  if (KH.ready && Date.now() - KH.at < 10 * 60e3) return KH.ready;
  const first = !KH.ready;
  KH.at = Date.now();
  return (KH.ready = (async () => {
    if (first) {
      KH.map = (await store.get('kv', 'kciHidden').catch(() => null)) || {};
      KH.q = (await store.get('kv', 'kciHiddenQ').catch(() => null)) || {};
      for (const [k, v] of Object.entries(KH.q)) if (!KH.map[k] || v.at >= KH.map[k].at) KH.map[k] = v;   // (a word not sent yet)
    }
    if (navigator.onLine) {
      try { const r = await Promise.race([api.getPrefs(), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 2500))]); kciMerge(r && r.hidden); if (r && r.ui) uiMerge(r.ui); } catch (e) { /* this device's word stands until the server answers */ }
    }
    if (Object.keys(KH.q).length) kciPush();
  })());
}
function kciMerge(h) {
  if (!h || typeof h !== 'object') return;
  for (const [k, v] of Object.entries(h)) if (v && Number.isFinite(v.at) && (!KH.map[k] || v.at > KH.map[k].at)) KH.map[k] = { at: v.at, on: !!v.on };
  store.put('kv', 'kciHidden', KH.map).catch(() => {});
}
const kciHidden = (id) => !!(KH.map[id] && KH.map[id].on);
function kciSetHidden(ids, on) {
  const at = Date.now();
  for (const id of ids) { KH.map[id] = { at, on }; KH.q[id] = { at, on }; }
  store.put('kv', 'kciHidden', KH.map).catch(() => {});
  store.put('kv', 'kciHiddenQ', KH.q).catch(() => {});
  clearTimeout(KH.t); KH.t = setTimeout(kciPush, 800);
}
async function kciPush() {
  const q = { ...KH.q };
  if (!Object.keys(q).length || !navigator.onLine) return;
  try {
    const r = await api.putPrefs(q);
    for (const k of Object.keys(q)) if (KH.q[k] && KH.q[k].at === q[k].at) delete KH.q[k];
    store.put('kv', 'kciHiddenQ', KH.q).catch(() => {});
    kciMerge(r && r.hidden);
  } catch (e) { /* kept: sent with the next change, or the next time the list is drawn */ }
}
window.addEventListener('online', () => { if (Object.keys(KH.q).length) kciPush(); });
const kciRows = new Map();
// (권, 집 or 호 as the journal numbers itself — 『공법연구』 제50집 제3호: papers.issueText — the same on the row, the sheet and the copy)
const kciIssue = (x) => (typeof papers.issueText === 'function' ? papers.issueText({ journal: x.journal || x.j || '', v: x.v, i: x.i }) : x.v && x.i ? `제${x.v}권 제${x.i}호` : x.i ? `제${x.i}호` : x.v ? `제${x.v}권` : '');
const kciWho = (x) => ((x.a || []).length > 3 ? x.a.slice(0, 3).join('·') + ' 외' : (x.a || []).join('·'));
const kciWhen = (x) => (x.y ? `${x.y}.${x.m ? ` ${Number(x.m)}.` : ''}` : '');
const kciJn = (x) => x.journal || x.j || '';
const kciPub = (x) => x.publisher || x.p || '';
function kciRow(x, shelf, opts = {}) {
  kciRows.set(x.id, x);
  const mine = shelf.get(papers.norm(papers.mainTitle(x.t)));
  const j = kciJn(x), iss = kciIssue(x), when = kciWhen(x), who = kciWho(x), cites = x.c || 0;
  const jn = opts.jtap && j ? `<i class="pp-jn" role="link" tabindex="0" data-jn="${esc(j)}" data-jp="${esc(kciPub(x))}">${esc(j)}</i>` : esc(j);
  const meta = [who ? esc(who) : '', j ? `${jn}${iss ? ' ' + esc(iss) : ''}` : esc(iss), when ? esc(when) : ''].filter(Boolean).join(' · ');
  const badges = `${mine ? ' <em class="pp-mine">내 서재</em>' : ''}${x.open ? ' <em class="pp-open">원문 공개</em>' : ''}${cites ? ` <em class="pp-cited">피인용 ${cites}</em>` : ''}`;
  const ab = opts.snip && x.ab ? `<span class="pp-ab">${esc(x.ab.length > 118 ? x.ab.slice(0, 117) + '…' : x.ab)}</span>` : '';
  // (관심 없음: an eye shut — set aside, not deleted; ✕ means 닫기 everywhere else)
  const xBtn = opts.x ? `<button type="button" class="kci-x" data-kci-x="${esc(x.id)}" aria-label="관심 없음 · 숨기기" title="관심 없음 · 숨기기">${I.eyeOff}</button>` : '';
  return `<div class="kci-item${opts.x ? '' : ' no-x'}"><button type="button" class="lrow pp-row" data-kci="${esc(x.id)}"><b>${esc(x.t)}${badges}</b><span>${meta}</span>${ab}</button>${xBtn}</div>`;
}
async function kciNewSec(sec, live) {
  if (!sec) return;
  const [idx] = await Promise.all([kciIndex(), kciHiddenReady().catch(() => {})]);
  const months = idx && idx.months ? Object.keys(idx.months).filter((k) => idx.months[k] > 0).sort().reverse() : [];
  if (!months.length && !(await kciNew()).length) return;
  if (!live() || !sec.isConnected) return;
  let want = 8, busy = false;
  const seen = new Set(), got = [];   // [{ key, x }] in order
  let mi = 0;
  const shown = () => got.filter((g) => g.x.pub !== 0 && !kciHidden(g.x.id));   // not another field entirely, not set aside
  // read months (newest first) until there are enough rows for the list, or none is left
  const fill = async () => {
    if (!months.length) { if (!got.length) for (const x of await kciNew()) { if (!seen.has(x.id)) { seen.add(x.id); got.push({ key: '', x }); } } return; }
    while (mi < months.length && shown().length < want) {
      const key = months[mi++];
      for (const x of await kciMonth(key)) if (!seen.has(x.id)) { seen.add(x.id); got.push({ key, x }); }
    }
  };
  const draw = () => {
    const shelf = shelfTitles(), rows = shown(), list = rows.slice(0, want);
    let html = '', last = null;
    for (const g of list) {
      if (g.key && g.key !== last) { html += `<div class="kci-month">${esc(monthName(g.key))}</div>`; last = g.key; }
      html += kciRow(g.x, shelf, { x: true });
    }
    const more = rows.length > list.length || mi < months.length;
    sec.hidden = false;
    sec.innerHTML = `<div class="list-h"><h2 class="sec-h">새로 나온 KCI 법학 논문</h2></div>
      <div class="list law-list kci-list">${html || '<p class="none">새로 모은 논문이 없습니다</p>'}${more ? '<button type="button" class="more kci-more">더 보기</button>' : ''}</div>`;
    const mb = $('.kci-more', sec);
    if (mb) mb.onclick = async () => { if (busy) return; busy = true; mb.textContent = '불러오는 중…'; want += 20; await fill(); busy = false; if (live() && sec.isConnected) draw(); };
  };
  // 관심 없음: the row folds away and the list keeps its length; one notice (되돌리기) speaks for those set aside together
  let batch = [], batchTill = 0;
  sec.onclick = async (e) => {
    const b = e.target.closest('[data-kci-x]');
    if (!b || !sec.contains(b)) return;
    const id = b.dataset.kciX, item = b.closest('.kci-item');
    if (kciHidden(id)) return;
    kciSetHidden([id], true);
    if (Date.now() > batchTill) batch = [];
    batch.push(id);
    const ids = batch.slice();
    batchTill = Date.now() + 5000;
    toast(ids.length > 1 ? `${ids.length}편을 숨겼습니다` : '숨겼습니다', 5000, { label: '되돌리기', fn: async () => {
      kciSetHidden(ids, false); batch = []; batchTill = 0;
      if (live() && sec.isConnected) draw();
    } });
    if (item && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      item.style.height = item.offsetHeight + 'px'; void item.offsetHeight;
      item.classList.add('gone'); item.style.height = '0px';
      await new Promise((r) => setTimeout(r, 230));
    }
    await fill();
    if (live() && sec.isConnected) draw();
  };
  await fill();
  if (live() && sec.isConnected) draw();
}
// one KCI paper: who wrote it and from where, the abstract (its whole text fetched from KCI on open), the citation ready to
// copy, and the ways to the full text — KCI's page (its PDF where 원문 공개), the journal's own list, 국회도서관
const kciPg = (x) => (x.fp ? `${x.fp}${x.lp ? '–' + x.lp : ''}면` : '');   // (in 면, as the copied citation writes it: kciCite)
function kciCite(x) {   // 저자, "제목", 『학술지』 제N권 제N호, 발행기관, 연도, 시작-끝면.
  const au = (x.a || []).join('·');
  const ji = [kciJn(x), kciIssue(x)].filter(Boolean).join(' ');
  const pg = x.fp ? `${x.fp}${x.lp ? '-' + x.lp : ''}면` : '';
  return `${au ? au + ', ' : ''}"${x.t}"${ji ? `, 『${kciJn(x)}』${kciIssue(x) ? ' ' + kciIssue(x) : ''}` : ''}${kciPub(x) ? ', ' + kciPub(x) : ''}${x.y ? ', ' + x.y : ''}${pg ? ', ' + pg : ''}.`;
}
// where a paper's original can be read: the pages that hold it (KCI's own download when it is 원문 공개, a public repository
// for the few journals that have one, the publisher's page by DOI) — and, apart, the catalogues where it can be looked for.
// (KCI serves its downloads only to a reader's own browser: the app opens the page; it never pretends to be a browser.)
function paperSources(x) {
  const t = (x.t || '').trim(), j = kciJn(x);
  const kciUrl = `https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=${encodeURIComponent(x.id)}`;
  const q = encodeURIComponent(t), out = [];
  // (a KCI-free paper's download is the button above)
  // (a publisher's list of all its issues is not a way to the paper: only pages that lead to this one are offered)
  if (/서울대|서울대학교/.test(j) && /법학/.test(j)) out.push({ label: 'S-Space', note: '서울대 공개 · 제목으로', url: `https://s-space.snu.ac.kr/simple-search?query=${q}` });
  if (x.doi) out.push({ label: 'DOI 페이지', note: '구독일 수 있음', url: `https://doi.org/${String(x.doi).split('/').map(encodeURIComponent).join('/')}` });
  if (/^ART\d+$/.test(x.id || '')) out.push({ label: 'KCI 논문 정보', url: kciUrl });
  if (/^https:\/\/[^\s"'<>]+$/.test(x.nanet || '')) out.push({ label: '국회전자도서관', url: x.nanet });   // (국회도서관 knows it too: its record)
  for (const [label, url] of x.links || []) if (/^https:\/\//.test(url)) out.push({ label, url });   // (a paper known from ScienceON: its own pages)
  return out;
}
// the catalogues that may hold it, searched by its title (each says it is a search)
const paperSearches = (x) => {
  const q = encodeURIComponent((x.t || '').trim());
  return [['국회도서관', `https://dl.nanet.go.kr/search/searchInnerList.do?queryText=${q}`], ['RISS', `https://www.riss.kr/search/Search.do?isDetailSearch=N&searchGubun=true&viewYn=OP&colName=re_a_kor&query=${q}`], ['구글 학술검색', `https://scholar.google.com/scholar?hl=ko&q=${q}`]];
};
// a paper's keywords: those in Korean first, then — on a quieter line of their own, in the order the source gave them — those
// in other languages (Wahlgerechtigkeit, Überhitzung des Wahlkampfs …), so a word and its pair are not shuffled together
function kwHtml(list) {
  const kws = [...new Set((list || []).map((k) => String(k || '').trim()).filter(Boolean))].slice(0, 24);
  if (!kws.length) return '';
  const ko = kws.filter((k) => /[가-힣]/.test(k)), other = kws.filter((k) => !/[가-힣]/.test(k));
  const chips = (xs) => xs.map((k) => `<button type="button" data-kw="${esc(k)}">${esc(k)}</button>`).join('');
  return `<div class="cs-sec"><h4>주제어</h4>${ko.length ? `<div class="law-ex pp-kw">${chips(ko.slice(0, 18))}</div>` : ''}${other.length ? `<div class="law-ex pp-kw pp-kw-x" lang="${/[äöüßÄÖÜ]/.test(other.join('')) ? 'de' : 'en'}">${chips(other.slice(0, 12))}</div>` : ''}</div>`;
}
function kciSheet(x, back) {
  const j = kciJn(x), pub = kciPub(x);
  // (each author with where they are, as KCI gave it; only when KCI gave none so tied does the list of affiliations stand apart)
  const affOf = x.affOf || {}, tied = (x.a || []).some((a) => affOf[a]);
  const box = sheet(`<div class="cs-head">${back ? `<button class="ib cs-back" aria-label="뒤로">${I.back}</button>` : ''}<h2>${esc(x.t)}</h2></div><div class="cs-body">
    ${(x.a || []).length ? `<div class="pp-by">${x.a.map((a) => `<button type="button" class="pp-au" data-pq="${esc(a)}" title="${esc(a)}의 글 찾기">${esc(a)}${affOf[a] ? ` <small class="pp-aff">${esc(affOf[a])}</small>` : ''}</button>`).join('')}</div>` : ''}
    <p class="pp-meta">${j ? `<button type="button" class="pp-jn cs-jn" data-jn="${esc(j)}" data-jp="${esc(pub)}">${esc(j)}</button>` : ''}${esc([kciIssue(x), pub, kciWhen(x), kciPg(x), x.c ? `피인용 ${x.c}` : ''].filter(Boolean).join(' · '))}</p>
    ${x.ab ? `<div class="cs-sec cs-abs"><h4>초록</h4><p class="cs-ab">${esc(x.ab)}</p></div>` : '<div class="cs-sec cs-abs" hidden><h4>초록</h4><p class="cs-ab"></p></div>'}
    <div class="cs-aff"${!tied && x.affs && x.affs.length ? '' : ' hidden'}>${esc((x.affs || []).join(' · '))}</div>
    ${kwHtml(x.kw)}
    <div class="cs-sec cs-src"><h4>원문</h4><div class="cs-get-at"><p class="cs-probe">서재에 바로 넣을 수 있는 공개 PDF를 찾는 중…</p></div><div class="cs-links">${paperSources(x).map((s) => `<a class="cs-link" href="${safeHref(s.url)}" target="_blank" rel="noopener">${esc(s.label)}${s.note ? ` <em>${esc(s.note)}</em>` : ''}</a>`).join('')}</div><p class="cs-search">찾아보기 ${paperSearches(x).map(([t, u]) => `<a href="${safeHref(u)}" target="_blank" rel="noopener">${esc(t)}</a>`).join(' · ')}</p></div>
  </div><div class="row-btns"><button type="button" class="btn ghost cs-copy">인용 복사</button></div>`);
  box.classList.add('case-sheet', 'paper-sheet');
  $('.cs-copy', box).onclick = () => copyText(kciCite(x));
  // the button that puts the original on the shelf comes only once the server has found it open and checked that it is a PDF
  // (most law journals are not: then it says so, and the pages above are the way)
  const getAt = $('.cs-get-at', box), want = { doi: x.doi || '', title: papers.mainTitle(x.t), authors: x.a || [], art: x.id, journal: kciJn(x), year: x.y || '' };
  const put = (blob) => {
    const nm = (x.a && x.a[0] ? x.a[0] + '_' : '') + papers.mainTitle(x.t);
    upload([new File([blob], nm.slice(0, 120) + '.pdf', { type: 'application/pdf' })]);
    closeSheet(); toast('공개된 원문을 서재에 넣고 있습니다');
  };
  if (x.open && /^ART\d+$/.test(x.id || '')) {
    const kciPage = `https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=${encodeURIComponent(x.id)}`;
    getAt.innerHTML = `<div class="cs-open"><a class="btn cs-get" href="${kciPage}" target="_blank" rel="noopener">KCI에서 무료 원문 받기</a><label class="btn ghost cs-put">받은 PDF 서재에 넣기<input type="file" accept="application/pdf,.pdf" hidden></label></div><p class="cs-probe">KCI가 원문을 공개한 논문입니다 · 내려받은 뒤 ‘받은 PDF 서재에 넣기’로 이 논문 이름으로 넣습니다</p>`;
    $('.cs-put input', getAt).onchange = (e) => { const f = e.target.files && e.target.files[0]; if (f) put(f); };
  } else api.paperPdf({ ...want, probe: true }).then((r) => {
    if (!box.isConnected) return;
    if (!r) { getAt.innerHTML = '<p class="cs-probe">서재에 바로 넣을 수 있는 공개 PDF는 없습니다 · 대개 DBpia 등 구독 서비스에 있습니다</p>'; return; }
    getAt.innerHTML = `<button type="button" class="btn cs-get">원문 PDF를 서재에 넣기${r.host ? ` <small>${esc(r.host.replace(/^www\./, ''))}</small>` : ''}</button>`;
    const b = $('.cs-get', getAt);
    b.onclick = async () => {
      if (r.blob) { put(r.blob); return; }
      b.disabled = true; const was = b.innerHTML; b.innerHTML = '원문을 받는 중…';
      try {
        const got = await api.paperPdf(want);
        if (got && got.blob) put(got.blob);
        else { b.disabled = false; b.innerHTML = was; toast('지금은 원문을 받지 못했습니다 · 잠시 뒤 다시 눌러 주세요'); }
      } catch (e) { b.disabled = false; b.innerHTML = was; toast(offline(e) ? unreached('받을 수 있습니다') : '지금은 원문을 받지 못했습니다'); }
    };
  }, () => { if (box.isConnected) getAt.innerHTML = ''; });
  box.addEventListener('click', (e) => {
    if (back && e.target.closest('.cs-back')) { back(); return; }
    const au = e.target.closest('.pp-au[data-pq]'); if (au) { closeSheet(); paperGo(au.dataset.pq); return; }
    const k = e.target.closest('[data-kw]'); if (k) { closeSheet(); paperGo(k.dataset.kw); return; }
    const jn = e.target.closest('.cs-jn'); if (jn) { closeSheet(); openJournal(jn.dataset.jn, jn.dataset.jp); }
  });
  // the whole record from KCI: the full abstract and the authors' affiliations replace the stored start
  if (x.o) kci.record(x.o).then((r) => {
    if (!r || !box.isConnected) return;
    if (r.ab && r.ab.length > (x.ab || '').length) { const a = $('.cs-abs', box), p = $('.cs-ab', box); a.hidden = false; p.textContent = r.ab; x.ab = r.ab; }
    if (r.affs && r.affs.length && !tied) { const af = $('.cs-aff', box); af.hidden = false; af.textContent = r.affs.join(' · '); }
    if (r.cites != null) x.c = r.cites;
    if (r.doi) x.doi = r.doi;
  }).catch(() => {});
}
function paperGo(q) {   // to 논문 찾기, asking q
  noteScroll();
  S.view = { kind: 'papers', folder: null }; S.q = ''; S.pq = q;
  const fi = $('.find input'); if (fi) fi.value = '';
  render(); closeRail();
  const c = $('.content'); if (c) c.scrollTop = 0; window.scrollTo(0, 0);
  nav();
}
// the same words asked of the other places a paper is found, each in a new tab (구글 학술검색 reads the papers' text too)
function elsewhereRow(q) {
  const u = encodeURIComponent(q);
  const go = [['구글 학술검색', `https://scholar.google.com/scholar?hl=ko&q=${u}`], ['RISS', `https://www.riss.kr/search/Search.do?isDetailSearch=N&searchGubun=true&viewYn=OP&query=${u}`],
    ['KCI', `https://www.kci.go.kr/kciportal/po/search/poTotalSearList.kci?sereArticleSearchBean.keyword=${u}`], ['DBpia', `https://www.dbpia.co.kr/search/topSearch?searchOption=all&query=${u}`]];
  return `<div class="pp-else"><span>다른 곳에서</span>${go.map(([t, href]) => `<a href="${href}" target="_blank" rel="noopener">${t}</a>`).join('')}</div>`;
}
function shelfTitles() {   // the papers on this shelf by title (without the subtitle), to mark what is here already
  const m = new Map();
  for (const f of liveFiles()) { const nm = stem(f.name), cut = hasAuthor(f.name) ? nm.indexOf('_') : -1; m.set(papers.norm(papers.mainTitle(cut > 0 ? nm.slice(cut + 1) : nm)), f); }
  return m;
}
function paperRow(x, shelf) {
  const mine = shelf.get(papers.norm(papers.mainTitle(x.title)));
  const who = x.authors.length > 3 ? x.authors.slice(0, 3).join('·') + ' 외' : x.authors.join('·');
  const meta = [who, x.kind === 'ARTICLE' ? x.journal : '', x.publisher, x.year, (S.pk ?? 'ARTICLE') === '' ? x.kindName : ''].filter(Boolean);
  return `<button type="button" class="lrow pp-row" data-paper="${esc(x.id + ':' + x.kind)}"><b>${esc(x.title)}${mine ? ' <em class="pp-mine">내 서재</em>' : ''}</b>${x.reading ? `<span class="pp-read">${esc(x.reading)}</span>` : ''}<span>${meta.map(esc).join(' · ')}</span></button>`;
}
function paperSheet(row, back) {
  const box = sheet(`<div class="cs-head">${back ? `<button class="ib cs-back" aria-label="뒤로">${I.back}</button>` : ''}<h2></h2></div><div class="cs-body"></div>`);
  box.classList.add('case-sheet', 'paper-sheet');
  const h = $('h2', box), body = $('.cs-body', box);
  let shown = row, so = null;
  const draw = (p, wait) => {
    if (!box.isConnected) return;
    shown = p;
    const mine = shelfTitles().get(papers.norm(papers.mainTitle(p.title)));
    // (권 or 집 as the journal numbers itself — 『공법연구』 제50집 — and pages in 면, as the citation below writes them: papers.js)
    const vol = so ? (typeof papers.sheetIssue === 'function' ? papers.sheetIssue(p, so) : [so.volume ? `제${so.volume}권` : '', so.issue ? `제${so.issue}호` : ''].filter(Boolean).join(' ')) : '';
    const pagesT = typeof papers.sheetPages === 'function' ? papers.sheetPages(so) : so && so.pages ? so.pages + '쪽' : '';
    const where = p.kind === 'THESIS' ? [p.school || p.publisher, p.degree ? p.degree + '학위논문' : '학위논문', p.major].filter(Boolean).join(' ') : [p.kind === 'ARTICLE' ? [p.journal, vol].filter(Boolean).join(' ') : '', p.publisher].filter(Boolean).join(' · ');
    const abs = p.abstract || (so && so.abstract) || '';
    const links = papers.elsewhere({ ...p, doi: p.doi || (so && so.doi) || '' });
    if (so && so.full) links.unshift(['원문', so.full]);
    if (so && so.page) links.push(['ScienceON', so.page]);
    const co = p.kind ? (typeof papers.citeOf === 'function' ? papers.citeOf(p, so) : { text: papers.cite(p, so), partial: false }) : null, cite = co ? co.text : '';
    // (the title as the lists and the citation write it: ' :부제' as ' - 부제 -')
    h.textContent = typeof papers.tidyTitle === 'function' ? papers.tidyTitle(p.title) : p.title;
    body.innerHTML = `${p.reading ? `<p class="pp-read">${esc(p.reading)}</p>` : ''}
      ${p.authors.length ? `<div class="pp-by">${p.authors.map((a, i) => `<button type="button" class="pp-au" data-author="${esc(a)}" data-aid="${esc((p.ids || {})[a] || '')}" data-aff="${esc(((p.affOf || {})[a]) || (p.authors.length === 1 && p.affs && p.affs[0]) || '')}" title="${esc(a)} 연구자 정보">${esc(a)}</button>`).join('')}</div>` : ''}
      <p class="pp-meta">${esc([where, p.when || p.year, pagesT].filter(Boolean).join(' · '))}</p>
      ${p.advisor ? `<p class="pp-meta">지도교수 ${esc(p.advisor)}</p>` : ''}
      ${mine ? `<p class="pp-here">내 서재에 있습니다 <button type="button" class="btn ghost small" data-open-file="${mine.id}">열기</button></p>` : ''}
      ${abs ? `<div class="cs-sec"><h4>초록</h4><p>${esc(abs)}</p></div>` : ''}
      ${p.toc ? `<details class="cs-fold"><summary>목차</summary><p>${esc(p.toc)}</p></details>` : ''}
      ${kwHtml(p.keywords)}
      ${cite ? `<div class="cs-sec pp-cite"><h4>인용</h4><p>${esc(cite)}</p>${co.partial && !wait ? '<p class="law-note pp-partial">권호 미상 · 원문에서 권·호를 확인한 뒤 쓰세요</p>' : ''}<button type="button" class="btn ghost small" data-cite>인용 복사</button></div>` : ''}
      ${wait ? '<p class="cs-wait">자세한 정보를 불러오는 중…</p>' : ''}
      <div class="cs-out pp-out">${links.map(([t, u]) => `<a class="btn ghost small" href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`).join('')}</div>
      ${p.uci || p.isbn ? `<p class="pp-id">${esc([p.uci ? 'UCI ' + p.uci : '', p.isbn ? 'ISBN ' + p.isbn : ''].filter(Boolean).join(' · '))}</p>` : ''}`;
  };
  draw(row, true);
  papers.detail(row).then((d) => d || row, () => row).then((d) => {
    draw(d, d.kind === 'ARTICLE');
    if (d.kind !== 'ARTICLE') return;
    papers.extra(d).then((x) => { so = x; draw(d, false); }, () => draw(d, false));   // 권호·쪽·DOI (ScienceON, Crossref), 초록·원문 (ScienceON)
  });
  const again = () => paperSheet(row, back);
  box.addEventListener('click', (e) => {
    if (e.target.closest('.cs-back')) { back(); return; }
    // (the author's namesakes ordered by this paper: where its author is, and its journal — papers.researcher's ctx)
    const a = e.target.closest('[data-author]'); if (a) { researcherSheet(a.dataset.author, a.dataset.aid, again, { aff: a.dataset.aff || '', journals: shown.journal ? [shown.journal] : [] }); return; }
    const k = e.target.closest('[data-kw]'); if (k) { closeSheet(); paperGo(k.dataset.kw); return; }
    if (e.target.closest('[data-cite]')) { copyText(papers.cite(shown, so)); return; }
    const o = e.target.closest('[data-open-file]'); if (o) { closeSheet(); openFile(o.dataset.openFile); }
  });
}
// a researcher: where they are, how much they wrote each year, what they wrote (newest first), the researchers working on the
// same things, their journals and their subjects — each a tap from the next
function researcherSheet(name, id, back, ctx = {}) {
  const box = sheet(`<div class="cs-head">${back ? `<button class="ib cs-back" aria-label="뒤로">${I.back}</button>` : ''}<h2>${esc(name)}</h2></div><div class="cs-body"><p class="cs-wait">연구자 정보를 불러오는 중…</p></div>`);
  box.classList.add('case-sheet', 'person-sheet');
  const body = $('.cs-body', box);
  const again = () => researcherSheet(name, id, back, ctx);
  let page = 1, rid = id || '';
  // the works grouped and merged (pfind.researcherWorks: 국회도서관's list with the KCI index's and the shelf's own papers by
  // that name, each once — 학술논문 · 학위논문 · 토론회·기타), each group's rows keyed, so 더 보기 adds under them and moves none
  const recs = new Map(), groups = new Map();
  const shelfBy = () => liveFiles().filter((f) => hasAuthor(f.name) && stem(f.name).split('_')[0].split(/[\s·ㆍ,]+/).includes(name)).map((f) => {
    const i = infoOf(f) || {}, d = String(i.date || ''), ym = /(\d{4})\D*(\d{1,2})?/.exec(d) || [];
    return { title: stem(f.name).split('_').slice(1).join('_') || stem(f.name), journal: i.journal || '', publisher: i.society || '', year: ym[1] || '', month: ym[2] || '', issue: i.issue || '', id: f.id };
  });
  const recRow = (r) => {
    const iss = kciIssue({ journal: r.journal, v: r.v, i: r.i }), when = kciWhen({ v: r.v, i: r.i, y: r.y, m: r.m });
    const meta = [r.journal ? r.journal + (iss ? ' ' + iss : '') : r.publisher || '', when].filter(Boolean).join(' · ');
    return `<button type="button" class="lrow pp-row" data-rw="${esc(r._k)}"><b>${esc(r.t)}${r.shelfId || (r.srcs && r.srcs.has && r.srcs.has('shelf')) ? ' <em class="pp-mine">내 서재</em>' : ''}</b><span>${esc(meta)}</span></button>`;
  };
  const worksGrouped = async () => {
    const list = $('.pp-works', body); if (!list) return;
    const more = list.parentElement.querySelector('.pp-wmore'); if (more) more.textContent = '불러오는 중…';
    let r = null, why = null;
    try { r = await pfind.researcherWorks(name, rid, { page, shelf: page === 1 ? shelfBy() : [] }); } catch (e) { r = null; why = e; }
    if (!box.isConnected) return;
    if (more) more.remove();
    if (!r) { if (page === 1) list.innerHTML = `<p class="none">${why && why.code === 'busy' ? '국회도서관의 하루 이용량이 다 찼습니다 · 자정이 지나면 다시 볼 수 있습니다' : '지금은 국회도서관에 닿지 않습니다'}</p>`; return; }
    if (page === 1) list.innerHTML = '';
    for (const g of r.groups) {
      let gr = groups.get(g.key);
      if (!gr) {
        const sec = el('div', 'pp-wg', `<div class="pp-div">${esc(g.label)} <span class="pp-wn"></span></div><div class="pp-wl"></div>`);
        list.appendChild(sec); gr = { sec, rows: [], seen: new Set() }; groups.set(g.key, gr);
      }
      for (const x of g.rows) {
        const k = papers.norm(x.t) + '|' + (x.y || '');
        if (gr.seen.has(k)) continue;
        gr.seen.add(k); x._k = g.key + ':' + gr.rows.length; recs.set(x._k, x); gr.rows.push(x);
      }
      patchList($('.pp-wl', gr.sec), gr.rows, (x) => x._k, recRow);
      setText($('.pp-wn', gr.sec), `${gr.rows.length}편`);
    }
    // (the groups kept in their order: 학술논문, 학위논문, 토론회·기타)
    for (const key of ['article', 'thesis', 'other']) { const gr = groups.get(key); if (gr) list.appendChild(gr.sec); }
    if (!groups.size) list.innerHTML = '<p class="none">찾지 못했습니다</p>';
    if (r.more) list.insertAdjacentHTML('afterend', '<button type="button" class="more pp-wmore">더 보기</button>');
    page++;
  };
  const works = typeof pfind.researcherWorks === 'function' ? worksGrouped : async () => {
    const list = $('.pp-works', body); if (!list) return;
    const more = list.querySelector('.more'); if (more) more.textContent = '불러오는 중…';
    let r = null, why = null;
    try { r = await papers.search(name, { kind: '', page, sort: 'new', by: 'author' }); } catch (e) { r = null; why = e; }
    if (!box.isConnected) return;
    if (more) more.remove();
    if (!r) { if (page === 1) list.innerHTML = `<p class="none">${why && why.code === 'busy' ? '국회도서관의 하루 이용량이 다 찼습니다 · 자정이 지나면 다시 볼 수 있습니다' : '지금은 국회도서관에 닿지 않습니다'}</p>`; return; }
    const mine = r.rows.filter((x) => x.authors.includes(name) && (!rid || !x.ids[name] || x.ids[name] === rid));   // the same person, not a namesake
    const shelf = shelfTitles();
    if (page === 1) list.innerHTML = '';
    list.insertAdjacentHTML('beforeend', mine.map((x) => { ppRows.set(x.id + ':' + x.kind, x); return paperRow(x, shelf); }).join('') || (page === 1 ? '<p class="none">찾지 못했습니다</p>' : ''));
    if (page * 20 < r.total && r.rows.length) list.insertAdjacentHTML('beforeend', '<button type="button" class="more">더 보기</button>');
    page++;
  };
  papers.researcher(name, id, ctx).then((r) => {
    if (!box.isConnected) return;
    rid = r.id;
    if (!r.id && r.others.length > 1) {   // namesakes: which one — the likeliest first, each with where they are and the journal they write in most
      body.innerHTML = `<p class="pp-meta">같은 이름의 연구자가 여럿입니다. 누구인지 골라 주세요.</p><div class="pp-by">${r.others.map((o) => `<button type="button" class="pp-au" data-pid="${esc(o.id)}" data-pname="${esc(o.name)}">${esc(o.name)}${(o.label || o.org) ? ` · ${esc(o.label || o.org)}` : ''}</button>`).join('')}</div>`;
      return;
    }
    const total = r.years.reduce((n, y) => n + y.count, 0);
    const about = r.prof ? [r.prof.org, r.prof.position, r.prof.nameEn].filter(Boolean).join(' · ') : '';
    body.innerHTML = `<p class="pp-meta">${esc(about || '국회도서관 국가학술정보의 연구자')}</p>
      ${r.years.length ? `<div class="cs-sec"><h4>해마다 쓴 글 <span class="pp-n">모두 ${total.toLocaleString()}편</span></h4>${yearBars(r.years)}</div>` : ''}
      <div class="cs-sec"><h4>쓴 글 <span class="pp-n">최근 것부터</span></h4><div class="list law-list pp-works"><p class="none">찾는 중…</p></div></div>
      ${r.people.length ? `<div class="cs-sec"><h4>같은 주제를 다루는 연구자</h4><div class="law-ex pp-kw">${r.people.map((x) => `<button type="button" data-pid="${esc(x.id)}" data-pname="${esc(x.name)}">${esc(x.name)}</button>`).join('')}</div></div>` : ''}
      ${r.journals.length ? `<div class="cs-sec"><h4>주로 싣는 학술지</h4><div class="law-ex pp-kw">${r.journals.map((j) => `<button type="button" data-kw="${esc(j)}">${esc(j)}</button>`).join('')}</div></div>` : ''}
      ${r.keywords.length ? `<div class="cs-sec"><h4>주제어</h4><div class="law-ex pp-kw">${r.keywords.map((k) => `<button type="button" data-kw="${esc(k)}">${esc(k)}</button>`).join('')}</div></div>` : ''}
      <div class="cs-out pp-out"><a class="btn ghost small" href="${esc('https://scholar.google.com/scholar?q=' + encodeURIComponent('author:"' + name + '"'))}" target="_blank" rel="noopener">구글 학술검색</a><a class="btn ghost small" href="${esc('https://www.riss.kr/search/Search.do?isDetailSearch=N&searchGubun=true&viewYn=OP&query=' + encodeURIComponent(name))}" target="_blank" rel="noopener">RISS</a></div>`;
    works();
  }, (e) => { if (box.isConnected) body.innerHTML = `<p class="cs-wait">${e && e.code === 'busy' ? '국회도서관의 하루 이용량이 다 찼습니다. 자정이 지나면 다시 열어 보세요.' : '지금은 국회도서관에 닿지 않습니다. 잠시 뒤 다시 열어 보세요.'}</p>`; });
  box.addEventListener('click', (e) => {
    if (e.target.closest('.cs-back')) { back(); return; }
    const pr = e.target.closest('[data-pid]'); if (pr) { researcherSheet(pr.dataset.pname, pr.dataset.pid, again); return; }
    const k = e.target.closest('[data-kw]'); if (k) { closeSheet(); paperGo(k.dataset.kw); return; }
    const pp = e.target.closest('[data-paper]'); if (pp) { const row = ppRows.get(pp.dataset.paper); if (row) paperSheet(row, again); return; }
    const rw = e.target.closest('[data-rw]'); if (rw) { const x = recs.get(rw.dataset.rw); if (x) { if (x.shelfId || (x.parts && x.parts.shelf && x.parts.shelf.shelfId)) { closeSheet(); openFile(x.shelfId || x.parts.shelf.shelfId); } else openPaper(x, again); } return; }
    if (e.target.closest('.pp-works .more, .pp-wmore')) works();
  });
}
// papers a year, as thin bars (the first and last year and the busiest one written under them)
function yearBars(years) {
  const from = years[0].year, to = Math.max(years[years.length - 1].year, from);
  const by = new Map(years.map((y) => [y.year, y.count]));
  const all = []; for (let y = from; y <= to; y++) all.push([y, by.get(y) || 0]);
  const max = Math.max(1, ...all.map((x) => x[1])), top = all.find((x) => x[1] === max);
  return `<div class="pp-years" role="img" aria-label="${from}년부터 ${to}년까지 해마다 쓴 글, 가장 많은 해는 ${top[0]}년 ${max}편">${all.map(([y, n]) => `<i style="height:${Math.max(n ? 6 : 1, Math.round(100 * n / max))}%" title="${y}년 ${n}편"></i>`).join('')}</div><div class="pp-axis"><span>${from}</span><span>가장 많은 해 ${top[0]}년 · ${max}편</span><span>${to}</span></div>`;
}

/* A screen's frame (판례 · 법령 · 논문: the search box and the body under it) made apart from the screen shown, and put in its
   place in one frame once it has something to show (stage → swap): what was there stays, dimmed, until then — no frame of
   an empty screen between the two. */
function stage(c, nodes) {
  if (c._staged) for (const x of c._staged) if (!nodes.includes(x)) x.remove();   // (an earlier screen still on its way: given up)
  for (const x of c.children) if (!nodes.includes(x)) x.classList.add('is-stale');
  setAttr(c, 'aria-busy', 'true');
  for (const n of nodes) { n.hidden = true; c.appendChild(n); }
  c._staged = nodes; c._html = null; c._first = undefined;
}
function swap(c, nodes) {
  if (!c._staged || (nodes && c._staged !== nodes)) return false;
  const ns = c._staged;
  for (const x of [...c.children]) if (!ns.includes(x)) x.remove();
  for (const n of ns) n.hidden = false;
  c._staged = null; setAttr(c, 'aria-busy', null);
  syncFind();
  c.scrollTop = 0;   // (a new screen starts at its top; scrollBackTo takes it back to where it was left, if anywhere)
  for (const fn of ns.flatMap((n) => n._onShow || [])) fn();
  return true;
}
// the frame shown for this screen, or the one on its way (fresh: just made, not in the page yet)
function lawFrame(c) {
  const mode = S.view.kind === 'cases' ? 'cases' : 'law', cs = mode === 'cases';
  const mine = (t) => t && t.dataset.mode === mode && !t.classList.contains('is-stale') && t.parentNode === c;
  const tops = [...c.querySelectorAll(':scope > .law-top:not(.pp-top)')];
  const have = (c._staged || []).find((t) => t.classList && t.classList.contains('law-top') && mine(t)) || tops.find((t) => mine(t) && !t.hidden);
  if (have) return { top: have, body: have.nextElementSibling, fresh: false };   // its own frame (논문 찾기's looks alike, and so does the other screen's: replaced)
  const hold = document.createElement('div');
  hold.innerHTML = `<div class="law-top" data-mode="${mode}"><label class="law-find"><button type="button" class="ib nav-back" aria-label="뒤로" title="뒤로" hidden>${I.back}</button><span class="lf-ico">${I.search}</span><input type="search" placeholder="${cs ? '사건번호 · 낱말 · 조문으로 판례 찾기' : '법령 이름 · 조문 (공직선거법 제93조)'}" enterkeyhint="search" autocomplete="off" aria-label="${cs ? '판례 찾기' : '법령 찾기'}" aria-autocomplete="list" aria-controls="law-sugg" aria-expanded="false"></label><div class="law-sugg" id="law-sugg" role="listbox" aria-label="법령 이름" hidden></div></div><div class="law-body"></div>`;
  const frame = { top: hold.firstElementChild, body: hold.lastElementChild, fresh: true };
  const inp = $('.law-find input', frame.top), sug = $('.law-sugg', frame.top);
  inp.value = lawQ();
  // asked of the courts' servers: it waits a little longer for the typing to settle, and Enter asks at once
  // the search that runs by itself while typing leaves the names offered where they are (they used to vanish under the
  // finger at that moment); Enter, a name picked, Esc or a tap elsewhere closes them
  const ask = (how = 'push') => {
    clearTimeout(S.qT); if (how !== 'typing') { clearTimeout(S.sugT); hide(); }
    if (!inp.isConnected) return;   // this box was put away (the other screen opened) before its turn
    if (S.view.kind !== mode) {
      // the last screen's box, still shown (dimmed) while the screen just opened is made: what is asked in it is asked of that
      // screen, not lost (판례에서 찾기 › from 법령, then a new question typed before 판례 has come)
      const v = inp.value.trim();
      if (how !== 'typing' && inp.closest('.is-stale') && (S.view.kind === 'cases' || S.view.kind === 'law')) lawGo(v, otherKind(S.view.kind, v) || S.view.kind);   // (an empty box: that screen's first page)
      return;
    }
    const v = inp.value.trim(), other = how === 'typing' ? '' : otherKind(mode, v);
    if (other) { lawGo(v, other); return; }   // asked of the screen that does not answer it: to the one that does
    noteScroll(); setLawQ(v); renderLaw(c, how === 'push'); nav(how);
  };
  let lawIme = false;   // (a syllable still being put together asks nothing: 선ㄱ is not a question)
  inp.addEventListener('compositionstart', () => { lawIme = true; });
  inp.addEventListener('compositionend', () => { lawIme = false; inp.dispatchEvent(new Event('input')); });
  // the names of laws that begin with (or hold) what is typed, from the app's own index: one tap and the law opens
  let shown = [], at = -1, seq = 0;
  function hide() { seq++; shown = []; at = -1; sug.hidden = true; sug.textContent = ''; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); }
  const mark = () => {
    sug.querySelectorAll('[role="option"]').forEach((x, i) => { x.setAttribute('aria-selected', String(i === at)); if (i === at) x.scrollIntoView({ block: 'nearest' }); });
    if (at >= 0) inp.setAttribute('aria-activedescendant', 'law-sugg-' + at); else inp.removeAttribute('aria-activedescendant');
  };
  async function suggest() {
    const t = inp.value.trim(), my = ++seq;
    if (t.length < 2 || /\d/.test(t) || document.activeElement !== inp) { hide(); return; }
    if (cs && !/(?:법|법률|령|규칙|규정)$/.test(t.replace(/\s+/g, ''))) { hide(); return; }
    const names = await laws.lawNames(t, 7, research.PREFER).catch(() => []);
    if (my !== seq || document.activeElement !== inp || inp.value.trim() !== t) return;
    if (!names.length || (names.length === 1 && laws.sameLaw(names[0].name, t))) { hide(); return; }
    shown = names; at = -1;
    const pat = new RegExp(t.replace(/\s+/g, '').split('').map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'));
    const mark1 = (name) => { const m = pat.exec(name); return m ? esc(name.slice(0, m.index)) + '<b>' + esc(m[0]) + '</b>' + esc(name.slice(m.index + m[0].length)) : esc(name); };
    sug.innerHTML = names.map((x, i) => `<button type="button" role="option" id="law-sugg-${i}" aria-selected="false" tabindex="-1" data-i="${i}"><span>${mark1(x.name)}</span>${x.also ? `<small>${esc(x.also)}</small>` : x.kind ? `<small>${esc(x.kind)}</small>` : ''}</button>`).join('');
    sug.hidden = false; inp.setAttribute('aria-expanded', 'true');
  }
  const pick = (i) => { const x = shown[i]; if (!x) return; inp.value = x.name; ask(); inp.blur(); };
  sug.addEventListener('pointerdown', (e) => e.preventDefault());
  sug.addEventListener('mousedown', (e) => e.preventDefault());   // the box keeps the focus (and a phone its keyboard) while a name is picked
  sug.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) pick(Number(b.dataset.i)); });
  inp.addEventListener('input', (e) => { clearTimeout(S.sugT); S.sugT = setTimeout(suggest, 80); clearTimeout(S.qT); if ((e.isComposing || lawIme) && !imeWhole(inp.value)) return; S.qT = setTimeout(() => { if (lawIme && !imeWhole(inp.value)) return; ask('typing'); }, cs ? 1200 : 650); });
  inp.addEventListener('blur', () => { clearTimeout(S.sugT); setTimeout(() => { if (document.activeElement !== inp) hide(); }, 150); });
  inp.addEventListener('keydown', (e) => {
    if (!sug.hidden && shown.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); at = e.key === 'ArrowDown' ? (at + 1 >= shown.length ? -1 : at + 1) : (at - 1 < -1 ? shown.length - 1 : at - 1); mark(); return; }
    if (e.key === 'Escape' && (e.isComposing || e.keyCode === 229)) return;   // (the IME takes its own Esc)
    if (e.key === 'Escape') { e.preventDefault(); if (!sug.hidden) { hide(); return; } inp.value = ''; ask('typing'); return; }   // a search box would clear itself
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); if (!sug.hidden && at >= 0) { pick(at); return; } ask(); inp.blur(); }
  });
  // a keyboard at hand: ready to type (once the frame is on screen)
  if (matchMedia('(hover: hover) and (pointer: fine)').matches && !lawQ()) frame.top._onShow = [() => setTimeout(() => { if (inp.isConnected && !inp.closest('[hidden]')) inp.focus({ preventScroll: true }); }, 0)];
  $('.nav-back', frame.top).onclick = () => history.back();
  return frame;
}
// the first screens. 법령: the provisions of the owner's research, each field's laws, the recent asks.
// 판례: the cases the owner's papers are about, the cases on the provisions of their research, the recent asks.
const lawChip = (attr) => (q, label, sub) => `<button type="button" ${attr}="${esc(q)}"><span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
const lhRow = (k, html) => (html ? `<div class="lh-row"><span class="lh-k">${esc(k)}</span><div class="lh-v">${html}</div></div>` : '');
const shortLaw = (law) => (law === '대한민국헌법' ? '헌법' : law);
function provisionRows(mine, chip) {   // each article of the owner's research by its group (the law itself when no article is named)
  return (mine ? mine.provisions : []).map((g) => lhRow(g.group, g.items.flatMap((it) => (it.arts.some((a) => /^제\s*\d/.test(a))
    ? it.arts.filter((a) => /^제\s*\d/.test(a)).map((a) => chip(`${shortLaw(it.law)} ${a}`, `${shortLaw(it.law)} ${a}`, it.topic))
    : [chip(shortLaw(it.law), shortLaw(it.law), it.topic)])).join(''))).join('');
}
// the recent asks, each with its own ✕, and 모두 지우기 (kind: 'cases' | 'law'; app's click handler: data-rc-del / data-rc-clear)
const recentRow = (list, attr) => {
  if (!list || !list.length) return '';
  const kind = attr === 'data-cq' ? 'cases' : 'law';
  return `<section class="rc-sec" data-rc="${kind}"><h2 class="sec-h rc-h"><span>최근 찾은 것</span><button type="button" class="rc-clear" data-rc-clear="${kind}">모두 지우기</button></h2><div class="law-ex rc-list">${list.map((x) => `<span class="rc-item"><button type="button" ${attr}="${esc(x)}">${esc(x)}</button><button type="button" class="rc-x" data-rc-del="${kind}" data-rc-q="${esc(x)}" aria-label="‘${esc(x)}’ 기록 지우기" title="이 기록 지우기"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></span>`).join('')}</div></section>`;
};
// forget one recent ask, or all of a screen's (kept on this device); the row changes in place, 되돌리기 brings them back
async function forgetRecent(kind, q, btn) {
  await loadRecent();
  const was = kind === 'cases' ? caseRecent.slice() : lawRecent.slice();
  const now = q == null ? [] : was.filter((x) => x !== q);
  const put = (list) => {
    if (kind === 'cases') caseRecent = list; else lawRecent = list;
    store.put('kv', kind === 'cases' ? 'caseRecent' : 'lawRecent', list).catch(() => {});
  };
  put(now);
  const sec = btn && btn.closest('.rc-sec');
  const paintSec = (list) => {
    const cur = document.querySelector(`.rc-sec[data-rc="${kind}"]`) || sec;
    if (!cur || !cur.isConnected) return;
    if (!list.length) { cur.hidden = true; return; }   // (kept, hidden: 되돌리기 fills it again in the same place)
    const t = document.createElement('div'); t.innerHTML = recentRow(list, kind === 'cases' ? 'data-cq' : 'data-lq');
    cur.replaceWith(t.firstElementChild);
  };
  if (q != null && sec && now.length) { const it = btn.closest('.rc-item'); if (it) it.remove(); }
  else paintSec(now);
  toast(q == null ? '최근 찾은 기록을 모두 지웠습니다' : '기록을 지웠습니다', 5000, { label: '되돌리기', fn: () => {
    const cur = kind === 'cases' ? caseRecent : lawRecent;
    const merged = [...cur.filter((x) => !was.includes(x)), ...was].slice(0, 8);   // (asks made since stay first)
    put(merged);
    paintSec(merged);
  } });
}
const egs = (list, attr) => list.map((x) => `<button type="button" class="law-eg" ${attr}="${esc(x)}">${esc(x)}</button>`).join(' · ');
function lawHome(mine) {
  const chip = lawChip('data-lq');
  const mineRows = provisionRows(mine, chip);
  const fields = research.FIELDS.map((f) => lhRow(f.name, f.laws.map(([label, name]) => chip(name || label, label)).join(''))).join('');
  return `<div class="law-home">
    <div class="lw-watch">${watchRowHtml()}</div>
    ${mineRows ? `<h2 class="sec-h">내 연구 조문 · 조문 보기</h2><div class="lh">${mineRows}</div>` : ''}
    <h2 class="sec-h">내 연구 분야 법령</h2><div class="lh">${fields}</div>
    ${recentRow(lawRecent, 'data-lq')}
    <p class="law-note">법제처가 공개한 모든 법률·시행령·규칙의 현행 조문을 법령 이름이나 조문으로 찾습니다. 조문의 연혁과 법령해석례, 시행 예정인 개정이 있으면 바뀌는 내용, 국회에 계류 중인 개정안이 있으면 그 법안도 함께 보여 드리고, 행정규칙·자치법규도 이름으로 찾습니다 — ${egs(['헌법 제37조 제2항', '정보공개법', '공직선거법 제93조'], 'data-lq')}</p>
  </div>`;
}
function caseHome(mine) {
  const chip = lawChip('data-cq');
  const papers = mine && mine.cases.length ? lhRow('내 논문', mine.cases.map((x) => chip(`${x.court} ${x.no}`, `${x.court} ${x.no}`, x.work.length > 16 ? x.work.slice(0, 15) + '…' : x.work)).join('')) : '';
  const mineRows = provisionRows(mine, chip), cited = citedRowHtml();
  return `<div class="law-home">
    ${papers || cited ? `<h2 class="sec-h">내 연구 판례</h2><div class="lh">${papers}${cited}</div>` : ''}
    ${mineRows ? `<h2 class="sec-h">내 연구 조문 · 이 조문의 판례 찾기</h2><div class="lh">${mineRows}</div>` : ''}
    ${recentRow(caseRecent, 'data-cq')}
    <p class="law-note">헌법재판소 결정과 대법원·각급 법원 판결을 사건번호, 사건명·판시사항의 낱말, 조문으로 찾습니다. 낱말이나 법령 이름으로는 법제처의 법령해석례도 함께 찾습니다 — ${egs(['2004헌마554', '대법원 2000두7735', '관습헌법', '헌법 제37조 제2항'], 'data-cq')}</p>
  </div>`;
}
async function renderLaw(cIn, force = false) {
  const mode = S.view.kind === 'cases' ? 'cases' : 'law';
  const q = lawQ().trim(), key = mode + '\u0001' + q;
  const fr = lawFrame(cIn);
  // (this question is on screen or on its way: asked again only by Enter)
  if (!force && fr.body.dataset.law === q && fr.body.dataset.mode === mode && fr.body._want === key) return;
  if (force) fr.body._want = '';
  const c = fr.body;
  c.dataset.law = q; c.dataset.mode = mode; c._want = key;
  const inp = $('.law-find input', fr.top);
  if (inp && inp.value.trim() !== q && document.activeElement !== inp) inp.value = q;
  const live = () => S.view.kind === mode && !S.q && lawQ().trim() === q;
  // a new frame (another screen was shown): made beside it and put in its place when its body is ready; the same frame (a
  // new question): the last answer stays, dimmed, until the new one is
  // (a frame still on its way — made for a question asked a moment ago and not yet shown — is this question's now: it is put in
  // place when this one is ready, else it would stay hidden behind the dimmed last screen for good)
  const nodes = fr.fresh ? [fr.top, fr.body] : cIn._staged && cIn._staged.includes(fr.top) ? cIn._staged : null;
  if (fr.fresh) { if (cIn.children.length) stage(cIn, nodes); else { cIn.append(fr.top, fr.body); for (const f of fr.top._onShow || []) f(); } }
  downNote(fr.top, mode);
  const show = () => { if (nodes) { swap(cIn, nodes); paintBack(); } };
  if (!q) {
    // the first screen: drawn at once from what is at hand (the recent asks are on this device; the owner's research list is
    // asked once and kept) — a moment's wait only the first time
    const mine = await Promise.race([Promise.all([loadRecent(), research.mine()]).then((r) => r[1]), new Promise((ok) => setTimeout(() => ok(undefined), 1500))]);
    laws.lawIndex();   // the names offered while typing, ready before the first letter
    if (!live() || c._want !== key) return;
    c.innerHTML = mode === 'cases' ? caseHome(mine || null) : lawHome(mine || null);
    if (mode === 'cases') {   // 헌재 소식 (선고 일정 · 주요 결정 · 변론) at the top of 판례: shown once it has come (or 800 ms)
      ccnews.mount($('.law-home', c));
      await cnReady($('.law-home', c), nodes ? 800 : 0);
      if (!live() || c._want !== key) return;
    }
    show();
    if (mine === undefined) research.mine().then((m) => {   // (slow: the owner's rows come in when it answers — rows of their own place)
      if (!m || !live() || c._want !== key || !c.isConnected) return;
      const h = $('.law-home', c); if (!h) return;
      const fresh = el('div', '', mode === 'cases' ? caseHome(m) : lawHome(m)).firstElementChild;
      const cn = h.querySelector(':scope > .cn'); if (cn) fresh.prepend(cn);
      keepAnchor($('.content'), () => h.replaceWith(fresh));
    });
    return;
  }
  rememberLaw(q, mode);
  const box = el('div', 'law-res');
  const was = [...c.children];
  let done = false;
  const commit = () => {
    if (done || !live() || c._want !== key) return;
    done = true;
    for (const x of was) x.remove();
    if (box.hidden) box.hidden = false;
    show();
  };
  if (was.length) { for (const x of was) x.classList.add('is-stale'); box.hidden = true; }
  c.appendChild(box);
  if (!was.length && !nodes) done = true;
  setTimeout(commit, mode === 'cases' ? LEAD_WAIT + 100 : 2500);   // (whatever has come by then: a slow source does not keep the last answer up; 판례 waits for its first section — casesView)
  if (mode === 'cases') casesView(box, q, live, commit); else lawsView(box, q, live, commit);
}
// 헌재 소식's card: the screen waits a moment for it, and its card keeps the height it last had (in this browser) while it is
// read, so what is under it does not move when it comes
const CNH = 'shelf.cnH';
function cnReady(home, ms) {
  const card = home && home.querySelector('.cn .cn-card'); if (!card) return Promise.resolve();
  let kept = 0;
  try { const h = Number(localStorage.getItem(CNH)); if (h > 40 && h < 900) { card.style.minHeight = h + 'px'; kept = h; } } catch (e) { /* none kept */ }
  const keep = () => { try { if (!card.querySelector('.cn-wait')) { const h = Math.round(card.getBoundingClientRect().height); if (h > 40) localStorage.setItem(CNH, String(h)); } } catch (e) { /* this time only */ } };
  // ready: nothing in the card still '불러오는 중' — the day's list under its head too (it comes in two steps). A device that has
  // no height kept for the card waits longer the first time (the last screen stays, dimmed): a card that grew from one line to
  // a day's forty decisions under the reader moved the whole screen
  const waiting = () => !!card.querySelector('.cn-wait');
  if (ms && !kept) ms = Math.max(ms, 2500);
  return new Promise((ok) => {
    const done = () => { mo.disconnect(); clearTimeout(t); ok(); setTimeout(keep, 50); };
    const mo = new MutationObserver(() => { if (!waiting()) done(); });
    mo.observe(card, { childList: true, subtree: true });
    const t = setTimeout(done, ms);
    if (!waiting()) done();
  });
}
/* the place on screen held still while something above it changes: the first thing seen at the top of the view is measured,
   the change made, and the view scrolled by what that thing moved (Safari has no scroll anchoring of its own) */
function keepAnchor(scroller, fn) {
  if (!scroller || !scroller.isConnected) { fn(); return; }
  const top = scroller.getBoundingClientRect().top;
  let anchor = null, y0 = 0;
  if (scroller.scrollTop > 0) {
    const cand = scroller.querySelectorAll('.slot-h, .sec-h, .lrow, .row, .law-card, .x-go, .bill-line, p');
    for (const e of cand) { const r = e.getBoundingClientRect(); if (r.height && r.bottom > top + 1) { anchor = e; y0 = r.top; break; } }
  }
  fn();
  if (anchor && anchor.isConnected) { const d = anchor.getBoundingClientRect().top - y0; if (Math.abs(d) >= 1) scroller.scrollTop += d; }
}
// an article asked by a name its law had before: one quiet line under the head on what became of the name, and that the
// decisions and judgments under both are shown together
function oldNameLine(o) {
  if (!o || !o.now) return '';
  const fin = finalC(o.now), was = `${esc(o.name)}${finalC(o.name) ? '은' : '는'}`;
  const how = o.gone ? `${laws.dateText(String(o.gone).replace(/-/g, '')) || ''} 폐지되었습니다 · 뒤를 이은 법률 ${esc(o.nowText || o.now)}`
    : o.whole ? `${esc(o.date)} 전부개정으로 ${esc(o.now)}${fin ? '이' : '가'} 되었습니다 · 이어받은 조문의 결정과 판결도 함께 찾습니다`
    : `${esc(o.date)} ${esc(o.now)}${fin && fin !== 8 ? '으로' : '로'} 이름이 바뀌었습니다 · 옛 이름과 지금 이름의 결정과 판결을 함께 보여 드립니다`;
  return `<p class="law-note x-old">${was} ${how}</p>`;
}
/* 결정 흐름: above an article's 헌재 decisions, one dot a decision by the year it was decided — 위헌·한정위헌 red, 헌법불합치
   (amber, .nc), 합헌·기각 quiet, 각하 faint, 심리중 an empty ring at the right end — 40 px high, drawn with the first rows. A
   year is a button: a tap goes to that year's first decision in the list (more pages read until it is there). */
const tlKind = (res) => { const t = String(res || ''); return !t || /심리\s*중/.test(t) ? 'no' : /(?:^|[\s,])(?:한정)?위헌(?!소원|확인)/.test(t) && !/^헌법불합치$/.test(t) ? 'un' : /헌법불합치/.test(t) ? 'un nc' : /각하/.test(t) && !/기각|합헌|인용/.test(t) ? 'dis' : 'ok'; };
const tlYear = (d) => Number((/((?:19|20)\d{2})\s*\./.exec(String(d || '')) || [])[1]) || 0;
async function csTimeline(r, pageOf) {
  const rows = [...(r.rows || [])], pages = Math.min(15, Math.ceil((r.total || 0) / Math.max(1, rows.length || 20)));
  for (let p = 2; p <= pages && rows.length < r.total; p++) { const x = await pageOf(p); if (!x || !x.rows || !x.rows.length) break; rows.push(...x.rows); }
  const now = new Date(Date.now() + 9 * 3600e3).getUTCFullYear();
  const dots = rows.map((x) => ({ no: x.no, y: tlYear(x.date) || (tlKind(x.result) === 'no' ? now : 0), k: tlKind(x.result), res: x.result || '심리중', date: x.date || '' })).filter((d) => d.y);
  if (dots.length < 2) return '';
  const from = Math.min(...dots.map((d) => d.y)), to = Math.max(...dots.map((d) => d.y));
  const rank = { un: 0, 'un nc': 1, ok: 2, dis: 3, no: 4 };
  const cols = [];
  for (let y = from; y <= to; y++) {
    const ds = dots.filter((d) => d.y === y).sort((a, b) => rank[a.k] - rank[b.k]);
    if (!ds.length) { cols.push('<span aria-hidden="true"></span>'); continue; }
    const shown = ds.slice(0, 4), more = ds.length - shown.length;
    cols.push(`<button type="button" class="cs-y" data-tly="${y}" title="${esc(`${y}년 · ${ds.map((d) => `${d.no} ${d.res}`).join(', ')}`)}" aria-label="${y}년 결정 ${ds.length}건">${shown.map((d) => `<i class="${d.k}" data-tln="${esc(d.no)}"></i>`).join('')}${more ? `<i class="ok more" aria-hidden="true" title="외 ${more}건"></i>` : ''}</button>`);
  }
  const n = (k) => dots.filter((d) => d.k === k || (k === 'un' && d.k === 'un nc')).length, un = n('un'), nc = dots.filter((d) => d.k === 'un nc').length;
  const sum = [un ? `위헌·헌법불합치 ${un}건${nc ? `(헌법불합치 ${nc})` : ''}` : '', n('ok') ? `합헌·기각 등 ${n('ok')}건` : '', n('dis') ? `각하 ${n('dis')}건` : '', n('no') ? `심리중 ${n('no')}건` : ''].filter(Boolean).join(' · ');
  return `<div class="cs-tl" data-tl><div class="cs-timeline" role="group" aria-label="연도별 결정 ${dots.length}건: ${esc(sum)}">${cols.join('')}</div><div class="cs-axis"><span>${from}</span><span>${to}</span></div><p class="law-note faint cs-tl-k">${esc(sum)}</p></div>`;
}
// a year of the flow tapped: its first decision in the list, read further page by page until it is there
async function tlGo(btn) {
  const sec = btn.closest('section'), list = sec && $('.law-list', sec), y = Number(btn.dataset.tly);
  if (!list) return;
  const want = new Set([...btn.querySelectorAll('[data-tln]')].map((i) => i.dataset.tln));
  const find = () => [...list.querySelectorAll('[data-case-open]')].find((x) => want.has(x.dataset.caseOpen) || tlYear(x.dataset.cdate) === y);
  for (let k = 0; k < 15 && !find(); k++) {
    const more = list.querySelector(':scope > .more'); if (!more) break;
    more.click();
    const t0 = Date.now(); while (Date.now() - t0 < 4000 && list.querySelector(':scope > .more') === more && more.isConnected) await new Promise((ok) => setTimeout(ok, 60));
  }
  const row = find(); if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  row.classList.add('tl-hit'); setTimeout(() => row.classList.remove('tl-hit'), 1600);
  row.focus({ preventScroll: true });
}
// the top of 판례 asked about a law or an article: what it is, and the law itself one tap away in 법령
const xHead = (title, go, attr, q) => `<div class="x-head"><b>${esc(title)}</b><button type="button" class="x-to" ${attr}="${esc(q)}">${esc(go)} ›</button></div>`;
// what one screen was asked that the other answers (typed, not yet sent there by Enter; or a link from before the two were apart)
const crossCard = (title, why, attr, q, go) => `<div class="law-card x-card"><div class="lc-h"><b>${esc(title)}</b></div><p class="law-note">${esc(why)}</p><div class="lc-acts"><button type="button" class="btn small" ${attr}="${esc(q)}">${esc(go)} ›</button></div></div>`;
// 판례: what was asked, in 헌재's records and the courts' judgments
const LEAD_WAIT = 4000;
async function casesView(box, q, live, commit = () => {}) {
  const art = laws.articleQuery(q), cited = art ? null : citedCase(q);
  const cno = cases.caseQuery(q) || (cited && cited.cno), court = laws.courtQuery(q) || (cited && cited.court);
  // (one case: its card in place once found, or after 600 ms with its line '찾는 중', then the shelf's papers citing it below)
  const soon = (p) => Promise.race([p, new Promise((ok) => setTimeout(ok, 600))]).then(commit, commit);
  if (cno) { box.innerHTML = '<div class="case-sec"></div>'; soon(caseCard($('.case-sec', box), cno, live)); mineSec(box, [cno.toLowerCase()], q, live); return; }
  if (court) { box.innerHTML = '<div class="court-sec"></div>'; let mineP = null; soon(courtCard($('.court-sec', box), court, live, () => mineP, q)); mineP = mineSec(box, [court.no.toLowerCase()], q, live); return; }
  // (shaped like a case number but none — 2099헌마99999, a year to come or five digits: said so, not searched as words, which
  // would show judgments that merely share its digits)
  const shape = !art && typeof cases.caseShape === 'function' && cases.caseShape(q);
  if (shape) {
    box.innerHTML = `<div class="case-sec"><div class="law-card"><div class="lc-h"><b>${esc(shape)}</b></div><p class="none">그런 사건번호의 헌재 결정은 없습니다 · 연도와 번호를 확인해 보세요</p></div></div>`;
    commit(); return;
  }
  let secs, head = '', none = '판례에서 찾지 못했습니다 · 낱말을 바꾸거나 줄여 보세요';
  const words = q.trim().split(/\s+/).filter(Boolean), multi = !art && words.length >= 2 && typeof cases.byWords === 'function', hj = {};
  if (art) {
    // the cases on one article: 헌재's (for 헌법 and 헌법재판소법, the holdings its digest files under the article), and the
    // courts' judgments that name it in their 참조조문 (by the law's own name, as judgments write it)
    const own = !!laws.LAWS[art.law];
    const ref = `${art.law} ${laws.artLabel(art)}${art.para ? ` 제${art.para}항` : ''}`;
    const full = art.law === '헌법' ? Promise.resolve('헌법') : laws.lawOf(art.law).then((n) => (n && n.name) || art.law, () => art.law);
    // every name the law had (cases.byLawAll, precq.citingAll): an article asked by an old name is asked by that name, so a
    // 전부개정's old article finds what became of it (정치자금에관한법률 제30조 → 정치자금법 제45조) and the reverse
    const o = laws.oldLaw(art.law), asked = async () => (o ? art.law : await full);
    head = xHead(o && (o.whole || o.gone) ? '구 ' + ref : ref, '조문 보기', 'data-lq', q) + oldNameLine(o);
    // (and above its list, with its first rows, the decisions' flow by year: csTimeline)
    const decided = typeof cases.byLawAll === 'function' ? async (pg) => {
      const name = await asked(), r = await cases.byLawAll(name, art.art, art.para, pg);
      if (pg === 1 && r && r.total > 1) r.timeline = await csTimeline(r, (p) => cases.byLawAll(name, art.art, art.para, p)).catch(() => '');
      return r;
    } : async (pg) => cases.byLaw(await full, art.art, art.para, pg);
    const cited = typeof precq.citingAll === 'function' ? async (pg) => precq.citingAll(await asked(), art.art, art.sub, pg) : async (pg) => precq.citing(await full, art.art, art.sub, pg);
    secs = [own ? ['holding', '이 조문이 나오는 헌재 결정요지 <small>판례요지집</small>', (pg) => cases.byHolding(art.art === '전문' ? '헌법 전문' : ref, pg)] : ['law', '이 조문을 심판한 헌재 결정', decided]];
    if (typeof art.art === 'number') secs.push(['court', '이 조문을 참조한 법원 판결 <small>대법원 · 하급심</small>', cited]);
    none = '이 조문을 다룬 판례를 찾지 못했습니다';
  } else {
    // a law's name (its own, or one lawyers use): what 헌재 decided on it first; else words. Then the courts' judgments
    // (대법원 first) by their 사건명·판시사항·판결요지, and 헌법재판소: its cases by name, its digest of holdings, its leading decisions
    const key = laws.lawKey(q), named = key ? { name: laws.LAWS[key].full } : await laws.lawOf(q).catch(() => null);
    if (!live()) return;
    const name = named ? named.name : q, lawLike = !!named || /(?:법|법률|령|규칙|규정)$/.test(q.replace(/\s+/g, ''));
    // 헌법재판소 first (its leading decisions, the 전원재판부's by name, its digest of holdings), then the courts; the 지정재판부's
    // dismissals by name last
    // (several words: 헌재's services hold a phrase only as written — each word is asked on its own and the decisions holding
    // every word kept, cases.byWords; what each 헌재 section said is kept for the line under the first: hj)
    const hjAsk = (kind, one) => async (pg) => {
      try { const r = multi ? await cases.byWords(kind, q, pg) : await one(pg); if (pg === 1) hj[kind] = r; return r; }
      catch (e) { if (pg === 1) hj[kind] = { err: e }; throw e; }
    };
    secs = [['leading', '헌재 주요 결정', hjAsk('leading', (pg) => cases.byLeading(q, pg))], ['name', '헌재 결정 <small>사건명 · 전원재판부</small>', hjAsk('name', (pg) => cases.byName(q, pg))], ['holding', '헌재 결정요지 <small>판례요지집</small>', hjAsk('holding', (pg) => cases.byHolding(q, pg))],
      ['court', '법원 판결 <small>대법원 · 하급심</small>', (pg) => precq.search(name, pg).then(named ? exactOnly : (x) => x)], ['panel', '헌재 지정재판부 결정 <small>사건명 · 각하 등</small>', (pg) => cases.byName(q, pg, '지정재판부')]];
    if (lawLike && key !== '헌법') secs.unshift(['law', '이 법률을 심판한 헌재 결정', (pg) => cases.byLaw(named ? named.name : q.replace(/\s+/g, ''), 0, 0, pg)]);
    // and after the courts, 법제처's interpretations whose 안건명 holds the words or the law's name (each opens at 국가법령정보센터)
    if (key !== '헌법') secs.push(['expc', '법령해석례 <small>법제처 · 국가법령정보센터에서 열립니다</small>', (pg) => moleg.interps(name, pg)]);
    if (named) { head = xHead(name, '법령 보기', 'data-lq', key ? q : name); none = '이 법령을 다룬 판례를 찾지 못했습니다'; }
  }
  /* Every section keeps its place from the start (fixed order, a one-line head that is never taken away): '찾는 중', then its
     count — or '이 말로는 없음' instead of folding away under what is already shown. What has come within 600 ms of the
     question is drawn at once (a moment longer while nothing has rows yet); a section that answers after that, with any
     section below it, comes in folded ('12건 ›', a tap opens it): nothing on screen is pushed down by a late answer. */
  box.innerHTML = head + secs.map(([k, t]) => lawSec(k, t)).join('') + `<p class="none law-empty" hidden>${none}</p>`
    + (art ? '' : '<p class="law-note faint cs-scope">헌법재판소 결정은 사건명·판례요지집·주요 결정에서, 법원 판결은 사건명·판시사항·판결요지에서, 법령해석례는 안건명에서, 행정심판 재결례는 사건명·피청구인·관련 법령에서 찾습니다 (결정문·판결문 전문은 찾지 않습니다)</p>');
  // (drawn when every section has answered; or, from 600 ms on, once the first section — the one read first — has; at
  // 1.5 s whatever has come: the sections that answer later come folded, so the top ones are seldom folded)
  const st = { shown: false, t0: Date.now(), left: 0, any: false };
  box._slots = st;
  const first = $('.slot', box);
  const go = () => { if (st.shown) return; st.shown = true; commit(); };
  const check = () => { if (!st.shown && Date.now() - st.t0 >= 590 && st.any && first && !first.classList.contains('is-wait')) go(); };
  const done = (n) => {
    st.any = st.any || n > 0;
    if (--st.left === 0) { if (!st.any && live()) $('.law-empty', box).hidden = false; go(); }
    else check();
  };
  setTimeout(check, 600);
  // (the first section is what was asked about — 이 조문을 심판한 헌재 결정, 헌재 주요 결정 — and the one a cold 헌재 service keeps
  // longest: at 1.5 s the screen comes once it has answered; until then, up to 4 s, the last answer stays dimmed rather than
  // the first section coming folded away under the courts' rows)
  setTimeout(() => { if (!first || !first.classList.contains('is-wait')) go(); }, 1500);
  setTimeout(go, LEAD_WAIT);
  // 행정심판 재결례 (국민권익위 온라인행정심판): right after 법원 판결, from the server's index of the last three years (adjud.js) —
  // drawn by adjud.js inside a place of its own, shown when it has rows (or what it could not reach)
  const courtSec = !art && $('[data-sec="court"]', box);
  if (courtSec) {
    courtSec.insertAdjacentHTML('afterend', lawSec('acrc', '행정심판 재결례 <small>국민권익위 온라인행정심판</small>').replace('<div class="list law-list"></div>', '<div class="aj-wrap" hidden><section data-sec="acrc-in"></section></div>'));
    st.left++;
    const slot = $('[data-sec="acrc"]', box), wrap = $('.aj-wrap', slot), inner = $('[data-sec="acrc-in"]', slot);
    import('./adjud.js?v=6f9f98f247').then((m) => m.render(inner, q, () => live() && slot.isConnected, { sheet, closeSheet, lawGo, caseSheet, courtSheet, toast }), () => 0).then((n) => {
      n = Number(n) || 0;
      if (!live() || !slot.isConnected) { done(0); return; }
      const said = !inner.hidden && !!inner.textContent.trim();   // (rows, or the line on what it could not reach)
      if (!said) { slotState(slot, 0); done(0); return; }
      const open = () => { slot.classList.remove('slot', 'is-wait', 'is-folded'); $('.slot-h', slot).hidden = true; wrap.hidden = false; };
      if (!st.shown || !slotBelow(slot)) open();
      else slotFold(slot, n ? `${n.toLocaleString()}건` : '보기', open);
      done(n);
    }, () => done(0));
  }
  st.left += secs.length;
  const fills = secs.map(([k, , ask]) => [k, fillSec(box, k, ask, live).then((n) => { done(n); return n; })]);
  // several words: under the first 헌재 section's head, from the start, one chip a word (each its own search) — and once the
  // three 헌재 sections have answered with nothing for the whole of it, that head says so: '‘과잉금지 선거운동’ 전체로는 없음'.
  // Nothing comes in later that would push the sections below down: the chips' line is there from the first frame
  if (multi) {
    const lead = $('[data-sec="leading"]', box);
    if (lead) {
      $('.slot-h', lead).insertAdjacentHTML('afterend', `<div class="cq-chips cq-words" role="group" aria-label="낱말별로 따로 찾기" style="flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none"><span class="cq-l" style="align-self:center;flex:none;font-size:13px;color:var(--muted);white-space:nowrap">낱말별로 따로 찾기</span>${words.slice(0, 6).map((w) => `<button type="button" data-cq="${esc(w)}" style="flex:none">${esc(w)}</button>`).join('')}</div>`);
      Promise.all(fills.filter(([k]) => k === 'leading' || k === 'name' || k === 'holding').map((x) => x[1])).then(() => {
        if (!live() || !lead.isConnected) return;
        const rs = ['leading', 'name', 'holding'].map((k) => hj[k]);
        if (rs.some((r) => !r || r.err) || rs.some((r) => r.total)) return;   // (a section that could not ask is no 'none')
        slotState(lead, 0, `‘${q.trim()}’ 전체로는 없음`, '낱말을 하나씩 따로 찾아 보세요');
        lead.classList.add('cq-none');
      });
    }
  }
}
// 법령: a law, or one article of it — its text, the coming amendments, the bills before the Assembly, the shelf's papers that
// cite it — and its cases one tap away in 판례
async function lawsView(box, q, live, commit = () => {}) {
  if (caseLike(q)) { box.innerHTML = crossCard(q, '사건번호입니다 · 결정과 판결은 판례에서 봅니다', 'data-cq', q, '판례에서 보기'); commit(); return; }
  const art = laws.articleQuery(q);
  box._slots = { shown: false };
  const shown = () => { box._slots.shown = true; commit(); };
  const wait = setTimeout(shown, 600);   // (a slow article: the screen comes with its place held, 220 px of quiet lines)
  if (art) {
    /* An article's page, in this order: the article (its place held until it comes), the one line of 국회 계류 법안 (48 px,
       opens on a tap), the cases on it (one card), 법제처's interpretations, the shelf's papers that cite it. All but the
       article come in with it, in one frame, under it — nothing waits above what is already on screen. */
    box.innerHTML = '<div class="art-sec slot-art"></div><div class="bill-at"></div><div class="x-cases"></div>';
    // (an article as it read before a 전부개정 — 구 정치자금에관한법률 제30조, a judgment's '식품위생법(2009. 2. 6. 전부 개정되기
    // 전의 것) 제58조' — is not today's article of that number: its own card, oldArticleCard)
    const lold = S.lold && S.lold.q === q ? S.lold : null, ol = laws.oldLaw(art.law);
    const wholeOld = typeof art.art === 'number' && typeof laws.successor === 'function' && (!!(ol && (ol.whole || ol.gone)) || !!(lold && /전부\s*개정/.test(lold.old || '')));
    (wholeOld ? oldArticleCard($('.art-sec', box), art, live, lold, ol) : articleCard($('.art-sec', box), art, live, lold)).then((law) => {
      clearTimeout(wait);
      if (!live()) return;
      const num = !!law && typeof art.art === 'number';
      if (num) billLine($('.bill-at', box), law, art, live);
      casesLink($('.x-cases', box), q, art, live);
      if (num && laws.lawKey(law.full) !== '헌법') {
        box.insertAdjacentHTML('beforeend', `<section class="law-sec slot mo-sec is-wait" data-sec="artexpc"><h2 class="sec-h slot-h">이 조문 관련 법령해석례 <small>법제처 · 국가법령정보센터에서 열립니다</small> <span class="sec-n"></span><span class="slot-st">찾는 중</span></h2><div class="list law-list"></div></section>`);
      }
      const tail = art.art === '전문' ? '전문' : `제${art.art}조${art.sub ? '의' + art.sub : ''}${art.para ? `제${art.para}항` : ''}`;
      const names = art.law === '헌법' ? ['헌법', '대한민국헌법'] : [art.law.replace(/\s+/g, '')];
      mineSec(box, names.flatMap((nm) => [nm + tail, '「' + nm + '」' + tail]), q, live, null, undefined, art);
      shown();
      if (num && watchOf(art)) watchCounts(art).then((c) => { if (live()) watchSeen(art, c); }, () => {});   // (opened: what is new is seen)
      if (num) artInterps($('[data-sec="artexpc"]', box), law, art, live);
    });
    return;
  }
  const key = laws.lawKey(q), named = key ? null : await laws.lawOf(q).catch(() => null);
  if (!live()) return;
  if (key || named || lawish(q)) {
    // the law itself (a name the index does not hold is asked of 법제처: a law too new for the index, a rule); if none has that
    // name, the laws whose names come close. Under it its bills' line and its cases; then what comes later (국회입법조사처,
    // 행정규칙 · 자치법규) below those
    box.innerHTML = '<div class="whole-sec slot-art"></div><div class="bill-at"></div><div class="x-cases"></div><section class="nr-sec" hidden></section>';
    lawWhole($('.whole-sec', box), key || (named ? named.name : q), live).then((law) => {
      clearTimeout(wait);
      if (!live()) return;
      if (!law) { if ($('.whole-sec', box).dataset.err === 'repealed') casesLink($('.x-cases', box), q, null, live); else lawNamesSec(box, q, live, true); shown(); return; }
      const ren = named && named.was ? renamedNote(laws.oldLaw(q)) : '', h = ren && $('.whole-sec .lc-h', box);
      if (h) h.insertAdjacentHTML('afterend', ren);
      billLine($('.bill-at', box), law, null, live);
      casesLink($('.x-cases', box), key ? q : law.full, null, live, law);
      shown();
      // 국회입법조사처's reports that name this law in their titles (the law itself, not its 시행령 or 규칙)
      if (!/(?:시행령|시행규칙)$/.test(law.full)) import('./nars.js?v=6f9f98f247').then((m) => m.lawSection($('.nr-sec', box), law.full, { upload, toast, live, aliases: laws.lawAliases(law.full), mine: (t) => shelfTitles().has(papers.norm(papers.mainTitle(t))) }), () => 0);
      if (key !== '헌법') ruleSecs(box, law.full.replace(/\s*(?:시행령|시행규칙)$/, ''), live);
    });
    return;
  }
  clearTimeout(wait);
  lawNamesSec(box, q, live).then(shown, shown);
}
// 법령 asked a law's name or words: the 행정규칙 (훈령·예규·고시 …) and 자치법규 (조례·규칙) whose names hold them, from
// 법제처's lists. Quiet: a section shows only once it has rows (none, or 법제처 not answering, leaves nothing behind)
function ruleSecs(box, q, live) {
  for (const [kind, title, ask] of [['admrul', '행정규칙 <small>훈령 · 예규 · 고시 등 · 국가법령정보센터에서 열립니다</small>', (pg) => moleg.rules(q, pg)],
    ['ordin', '자치법규 <small>조례 · 규칙 · 국가법령정보센터에서 열립니다</small>', (pg) => moleg.ordins(q, pg)]]) {
    const sec = el('section', 'mo-sec', `<h2 class="sec-h">${title} <span class="sec-n"></span></h2><div class="list law-list"></div>`);
    sec.dataset.sec = kind; sec.hidden = true;
    box.appendChild(sec);
    fillSec(box, kind, ask, live).then((n) => { if (n > 0 && live()) sec.hidden = false; });
  }
}
// under an article (법령): 법제처's interpretations of it — its law's list by name, those whose 안건명 cite this article
// (제60조, not 제60조의2; not another law's 제60조 named in the same 안건명); quiet like the rules above
async function artInterps(sec, law, a, live) {
  if (!sec || laws.lawKey(law.full) === '헌법') return;   // (법제처 does not interpret the constitution)
  let r;
  try { r = await moleg.articleInterps(law.full, a.art, a.sub); }
  catch (e) { if (live() && sec.isConnected) slotState(sec, 0, offline(e) ? unreached('찾을 수 있습니다', '찾아 보세요') : '지금은 법제처 자료에 닿지 않습니다'); return; }
  if (!live() || !sec.isConnected) return;
  if (!r.total) { slotState(sec, 0, '없음'); return; }
  const page = (k) => r.rows.slice(k * 10, k * 10 + 10).map(lawRow.expc).join('');
  const list = $('.law-list', sec);
  setText($('.sec-n', sec), `${r.total}건`);
  list.innerHTML = page(0) + (r.of > r.read ? `<p class="law-note faint">이 법령의 해석례 ${r.of.toLocaleString()}건 가운데 ${r.read}건에서 찾았습니다</p>` : '');
  slotState(sec, r.total);
  if (slotBelow(sec)) slotFold(sec, `${r.total}건`);   // (late, and the shelf's papers are under it: behind its head)
  let k = 0;
  const more = () => {
    if ((k + 1) * 10 >= r.rows.length) return;
    const note = list.querySelector(':scope > .law-note');
    const b = el('button', 'more'); b.type = 'button'; b.textContent = `더 보기 · ${(k + 1) * 10} / ${r.total}`;
    list.insertBefore(b, note);
    b.onclick = () => { b.remove(); k++; list.insertBefore(document.createRange().createContextualFragment(page(k)), note); more(); };
  };
  more();
}
// words that are no law's name: the laws whose names hold them, each one tap away, and the same words in 판례
async function lawNamesSec(box, q, live, close) {
  // (the dictionary's terms are asked at once with the names: those that come within 600 ms are drawn with the section, in
  // their place above it; a later answer goes under it, so nothing already on screen is pushed down)
  const termsP = moleg.terms(q).catch(() => []);
  // (and the articles that say what the word means — 공직선거법 제58조 제1항 for 선거운동: laws.defines, from the records worked
  // out beforehand, a moment — drawn with the section, above its list)
  const defsP = typeof laws.defines === 'function' && !close ? laws.defines(q).catch(() => []) : Promise.resolve([]);
  let early = null; termsP.then((ts) => { if (early === null) early = ts; });
  const names = await laws.lawNames(q, 30, research.PREFER).catch(() => []);
  if (!live()) return;
  if (early === null) await Promise.race([termsP, new Promise((ok) => setTimeout(ok, 600))]);
  const defs = await Promise.race([defsP, new Promise((ok) => setTimeout(() => ok([]), 400))]);
  if (!live()) return;
  const row = (x) => `<button type="button" class="lrow" data-lq="${esc(x.name)}"><b>${esc(x.name)}</b><span>${esc([x.name === '대한민국헌법' ? '헌법' : x.kind || '법률', x.also ? '약칭 ' + x.also : ''].filter(Boolean).join(' · '))}</span></button>`;
  const sec = el('section', 'law-sec names-sec');
  const defRow = (d) => { const lab = `${d.law} 제${d.art}조${d.sub ? '의' + d.sub : ''}${d.para ? ` 제${d.para}항` : ''}`; return `<button type="button" class="lrow def-row" data-lq="${esc(lab)}"><b>${esc(lab)}</b><span>${esc(String(d.sentence || '').replace(/^[①-⑳]\s*/, ''))}</span></button>`; };
  const defsHtml = defs && defs.length ? `<h2 class="sec-h">‘${esc(q)}’의 뜻을 정한 조문 <span class="sec-n">${defs.length}개</span></h2><div class="list law-list def-list">${defs.map(defRow).join('')}</div>` : '';
  sec.innerHTML = defsHtml + (names.length
    ? `<h2 class="sec-h">${close ? '비슷한 이름의 법령' : '이름으로 찾은 법령'} <span class="sec-n">${names.length >= 30 ? '30개 넘게' : names.length + '개'}</span></h2><div class="list law-list">${names.map(row).join('')}</div>`
    : close ? '' : `<p class="none">‘${esc(q)}’ — 이 낱말이 이름에 든 법령은 없습니다</p>`)
    + `<p class="law-note x-also"><button type="button" class="law-eg" data-cq="${esc(q)}">판례에서 ‘${esc(q)}’ 찾기</button></p>`;
  box.appendChild(sec);
  // a term 법제처's dictionary of legal terms has (the words themselves, not a term that merely holds them): one quiet line
  // above, each opening its definitions at 국가법령정보센터
  const termLine = (ts) => {
    const name = (t) => { const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(t.name); return m ? `${esc(m[1])} <small>(${esc(m[2])})</small>` : esc(t.name); };   // (the law that defines it, quiet)
    return el('p', 'mo-term', `<b>용어</b> ${ts.map((t) => `<a href="${esc(moleg.page.lstrm(t.id))}" target="_blank" rel="noopener">${name(t)}</a>`).join('<span aria-hidden="true"> · </span>')}<small>법령용어사전 · 국가법령정보센터</small>`);
  };
  if (early && early.length) sec.before(termLine(early));
  else if (early === null) termsP.then((ts) => { if (ts.length && live() && sec.isConnected) sec.appendChild(termLine(ts)); });
  ruleSecs(box, q, live);
}
// a law's own name asked of the courts' index: only the judgments that hold all of it (the similar ones, holding a few of
// its words — '…처벌등에관한법률위반' for another 처벌 법률 — are not about this law)
const exactOnly = (r) => (r && r.exact != null ? { ...r, rows: r.rows.filter((x) => !x.near), total: r.exact } : r);
// under a law or an article (법령): what 판례 holds on it, counted, one tap away
function casesLink(at, q, art, live, law) {
  if (!at) return;
  at.innerHTML = `<button type="button" class="x-go" data-cq="${esc(q)}"><span><b>${art ? '이 조문의 판례' : '이 법령의 판례'}</b><small class="x-n">헌재 결정 · 법원 판결</small></span><i aria-hidden="true">›</i></button>`;
  const n = $('.x-n', at), asks = [];
  if (art) {
    const own = !!laws.LAWS[art.law], ref = art.art === '전문' ? '헌법 전문' : `${art.law} ${laws.artLabel(art)}${art.para ? ` 제${art.para}항` : ''}`;
    const fullP = art.law === '헌법' ? Promise.resolve('헌법') : laws.lawOf(art.law).then((x) => (x && x.name) || art.law, () => art.law);
    // (every name the law had: an old name is asked as it is, so a 전부개정's old article counts what became of it — the same
    // answers 판례 then shows, kept)
    const askedP = laws.oldLaw(art.law) ? Promise.resolve(art.law) : fullP;
    asks.push([own ? '헌재 결정요지' : '헌재 결정', own ? cases.byHolding(ref, 1) : askedP.then((nm) => (typeof cases.byLawAll === 'function' ? cases.byLawAll(nm, art.art, art.para, 1) : cases.byLaw(nm, art.art, art.para, 1)))]);
    if (typeof art.art === 'number') asks.push(['법원 판결', askedP.then((nm) => (typeof precq.citingAll === 'function' ? precq.citingAll(nm, art.art, art.sub, 1) : precq.citing(nm, art.art, art.sub, 1)))]);
  } else if (law) {
    if (laws.lawKey(law.full) !== '헌법') asks.push(['헌재 결정', cases.byLaw(law.full, 0, 0, 1)]);
    asks.push(['법원 판결', precq.search(law.full, 1).then(exactOnly)]);
  }
  Promise.allSettled(asks.map((a) => a[1])).then((rs) => {
    if (!live() || !at.isConnected) return;
    const parts = rs.map((r, i) => (r.status === 'fulfilled' && r.value ? `${asks[i][0]} ${Number((r.value.exact ?? r.value.total) || 0).toLocaleString()}건` : '')).filter(Boolean);
    if (parts.length) n.textContent = parts.join(' · ');
  });
}
// the shelf's papers that cite what was looked up, right under it
// (art: an article, found where the papers cite it however they write it — pageHits' articleFinder)
function mineSec(box, keys, q, live, after, says = '편이 인용', art = null, quiet = false) {
  // (a place of its own from the start — its head says how far the reading has come — and its rows added under it; none found:
  // one line says so. quiet: shown only when there are some, as on 논문 찾기)
  const sec = el('section', 'mine-sec' + (quiet ? '' : ' slot is-wait'), `<h2 class="sec-h${quiet ? '' : ' slot-h'}">내 서재에서 <span class="sec-n"></span>${quiet ? '' : '<span class="slot-st">찾는 중</span>'}</h2><div class="list mine-list"></div>`);
  if (quiet) sec.hidden = true;
  if (after) after.after(sec); else box.appendChild(sec);
  const list = $('.mine-list', sec), n = $('.sec-n', sec), st = $('.slot-st', sec);
  let fin = null; const out = new Promise((ok) => { fin = ok; });   // (what was found, once every paper is read)
  pageHits(keys.map((k) => k.toLowerCase()), live, (results, done, all) => {
    if (done === all && fin) { const f = fin; fin = null; setTimeout(() => f(results.slice()), 0); }
    if (quiet) { const hide = !results.length && done === all; if (sec.hidden !== hide) sec.hidden = hide; }
    patchList(list, results.slice(0, 40), (r) => r.f.id, (r) => fileRow(r.f, snipsHtml(r, q)));
    setText(n, results.length && done === all ? `${results.length}${says}` : '');
    if (quiet) setText(n, done < all ? `찾는 중 ${done}/${all}` : results.length ? `${results.length}${says}` : '');
    else if (done < all) setText(st, `찾는 중 ${done}/${all}`);
    else slotState(sec, results.length, all ? `${all}편에는 인용한 곳이 없습니다` : '본문을 읽은 논문이 아직 없습니다');
    lazyThumbs();
  }, art).catch(() => {}).finally(() => { if (fin) fin([]); });
  return out;
}
// the recent asks of each screen, kept on this device (from when 판례 and 법령 were one screen: each to the screen that answers it)
async function loadRecent() {
  if (lawRecent && caseRecent) return;
  const [l, c] = await Promise.all([store.get('kv', 'lawRecent').catch(() => null), store.get('kv', 'caseRecent').catch(() => null)]);
  if (lawRecent && caseRecent) return;
  lawRecent = Array.isArray(l) ? l : [];
  if (Array.isArray(c)) { caseRecent = c; return; }
  caseRecent = lawRecent.filter((x) => !lawish(x)); lawRecent = lawRecent.filter(lawish);
  store.put('kv', 'caseRecent', caseRecent).catch(() => {}); store.put('kv', 'lawRecent', lawRecent).catch(() => {});
}
function rememberLaw(q, mode) {   // kept once the question has stood a moment (not every half-typed word)
  clearTimeout(S.lawRemT);
  S.lawRemT = setTimeout(async () => {
    if (!q || S.view.kind !== mode || lawQ().trim() !== q || otherKind(mode, q)) return;
    await loadRecent();
    if (mode === 'cases') { caseRecent = [q, ...caseRecent.filter((x) => x !== q)].slice(0, 8); store.put('kv', 'caseRecent', caseRecent).catch(() => {}); }
    else { lawRecent = [q, ...lawRecent.filter((x) => x !== q)].slice(0, 8); store.put('kv', 'lawRecent', lawRecent).catch(() => {}); }
  }, 1500);
}
const lawRow = {
  // (the court's name without its spaces: '서울 고등법원', '대구지법 안동지원 영주시법원' are read as one court name)
  // (a row the index calls 전원합의체 tells the judgment's sheet so too, where its text cannot tell: laws.markEnbanc; the word
  // in the row is set right by courtSnips once the judgment is read — a 소부's signature outweighs the index)
  court: (r) => (r.enbanc && /^대법원$/.test(String(r.court || '').replace(/\s+/g, '')) && laws.markEnbanc(String(r.no).replace(/_.*$/, '')), `<button type="button" class="lrow pq-row" data-court-open="${esc(r.court.replace(/\s+/g, '') + ' ' + String(r.no).replace(/_.*$/, ''))}"><b>${esc(r.name || r.no)}</b><span>${esc([r.court, r.date ? r.date + (/^\d{2,4}(?:마|그|스|브|카|모|로|초|라|느|무|루|아|즈)/.test(r.no) ? '자' : ' 선고') : '', r.nos || r.no].filter(Boolean).join(' '))}<span class="pq-eb">${r.enbanc ? ' 전원합의체' : ''}</span>${r.cat ?` · ${esc(r.cat)}` : ''}${r.oldName ? ` · <span class="cs-was">구 ${esc(r.oldName)}</span>` : ''}</span><span class="pq-snip" data-snip="${esc(r.court.replace(/\s+/g, '') + ' ' + String(r.no).replace(/_.*$/, ''))}" data-at="${r.at || ''}"></span></button>`),
  name: (r) => caseRow(r.no, r.name, [r.no, r.date, r.court], r.result, '', r),
  panel: (r) => caseRow(r.no, r.name, [r.no, r.date, r.court], r.result, '', r),
  // (a decision found only under a name the law had before: its article as it was named then — 구 공직선거및선거부정방지법 …)
  law: (r) => caseRow(r.no, r.name, [r.no, r.date, r.oldName && r.target && !/^구\s/.test(r.target) ? '구 ' + r.target : r.target], r.result, r.order, r),
  // (its common name before its name only when it is another name: 'UCC 사전선거운동 금지 사건' twice says it once; a field
  // written twice by a merge of two lists is said once too)
  leading: (r) => caseRow(r.no, leadTitle(r), [r.no, r.date, onceEach(r.area)], '', '', r),
  // (a holding is opened by its heading and its own title — the heading alone opens its first: cases.holding)
  holding: (r) => {
    const parts = String(r.path || '').split('>').map((x) => x.trim()).filter(Boolean);
    const law = /^기타 법령편/.test(r.path || '') && parts.length > 1 ? parts[parts.length - 1] : '';
    const head = law && !r.title.includes(law) ? `${law} ${r.title}` : r.title;
    // (the decision it comes from — 사건번호 · 선고일 — read from the digest once the row is in view: its line is held from the start)
    return `<button type="button" class="lrow ho-row" data-holding="${esc(r.seq)}" data-title="${esc(r.title)}"${r.q ? ` data-q="${esc(r.q)}"` : ''}><b>${esc(head)}</b><span>${esc(law ? '심판대상 · ' + parts.slice(1, -1).filter((x) => !/^</.test(x)).join(' > ') : r.path)}</span><span class="ho-cite">&nbsp;</span></button>`;
  },
  // 법제처's lists: a list is all the service gives, so each row opens its own page at 국가법령정보센터
  expc: (r) => moRow(moleg.page.expc, r.seq, r.title, [r.no ? `안건번호 ${r.no}` : '', r.asker ? `질의 ${r.asker}` : '', r.date ? `${r.date} 회신${r.by && r.by !== '법제처' ? ` (${r.by})` : ''}` : '']),
  admrul: (r) => moRow(moleg.page.admrul, r.seq, r.name, [r.kind, r.date ? `${r.date} 발령${r.no ? ` 제${r.no}호` : ''}` : '', r.dept, r.now]),
  ordin: (r) => moRow(moleg.page.ordin, r.seq, r.name, [r.org, r.kind, r.date ? `${r.date} 공포` : '', r.past ? '연혁 · 폐지' : '']),   // (moleg puts the ones no longer in force last, past)
};
const tightW = (x) => String(x || '').replace(/[\s·ㆍ.,'"‘’“”「」『』()]/g, '');
const leadTitle = (r) => {
  const name = String(r.name || ''), nicks = [...new Set(String(r.nick || '').split(' · ').map((x) => x.trim()).filter((x) => x && tightW(x) !== tightW(name) && !tightW(name).includes(tightW(x))))];
  return nicks.length ? `${nicks.join(' · ')} · ${name}` : name;
};
// 'A · B · A · B' → 'A · B' (a value that holds ' · ' itself, as 정치 · 선거관계에 관한 결정 does, said once)
const onceEach = (t) => {
  const s = String(t || '').trim();
  if (!s) return '';
  const parts = s.split(' · ');
  for (let k = 1; k <= parts.length / 2; k++) {
    if (parts.length % k) continue;
    const unit = parts.slice(0, k).join(' · ');
    if (parts.every((p, i) => p === parts[i % k])) return unit;
  }
  return s;
};
const moRow = (url, seq, title, meta) => {
  const m = esc(meta.filter(Boolean).join(' · '));
  return seq ? `<a class="lrow mo-row" href="${url(seq)}" target="_blank" rel="noopener"><b>${esc(title)}</b><span>${m}</span></a>` : `<div class="lrow mo-row"><b>${esc(title)}</b><span>${m}</span></div>`;
};
// under each judgment found, its 판시사항 (or 판결요지) at the words asked, marked: read from the judgment itself, three at a time
async function courtSnips(list, q, live) {
  const ws = precq.words(q).filter((w) => w.length > 1);
  const todo = [...list.querySelectorAll('.pq-snip:not([data-done])')];
  todo.forEach((x) => { x.dataset.done = '1'; });
  let i = 0;
  const one = async () => {
    while (i < todo.length && live()) {
      const x = todo[i++];
      try {
        const d = await laws.courtCase(x.dataset.snip);
        // (전원합의체 as the judgment itself reads, so the row says what its sheet and 인용 복사 will)
        const eb = d && x.isConnected && x.parentNode.querySelector('.pq-eb');
        if (eb) eb.textContent = d.enbanc ? ' 전원합의체' : '';
        // where the words were found: the 판결요지 when only it has them, else the 판시사항
        const t = d && (x.dataset.at === 'summary' ? d.summary || d.points : d.points || d.summary);
        if (t && x.isConnected) { x.innerHTML = (x.dataset.at === 'summary' ? '<em class="pq-at">판결요지</em> ' : '') + snipAt(t, ws); x.classList.add('on'); }
      } catch (e) { /* the row stays as it is */ }
    }
  };
  await Promise.all([one(), one(), one()]);
}
// under each holding of the digest found, the decision it comes from ('2004헌마554 · 2004. 10. 21.', and how many more): read
// from the digest (cases.holding, kept on this device) for the rows that come into view, two at a time
let hoIO = null;
const hoQueue = [];
let hoBusy = 0;
function holdingCites(list, live) {
  if (!hoIO) hoIO = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { hoIO.unobserve(e.target); hoQueue.push(e.target); hoPump(); } }, { rootMargin: '120px' });
  for (const r of list.querySelectorAll('.ho-row:not([data-hc])')) { r.dataset.hc = '1'; r._live = live; hoIO.observe(r); }
}
function hoPump() {
  while (hoBusy < 2 && hoQueue.length) {
    const r = hoQueue.shift();
    if (!r.isConnected || (r._live && !r._live())) continue;
    hoBusy++;
    cases.holding(r.dataset.holding, r.dataset.title, r.dataset.q || '').then((h) => {
      const x = r.querySelector('.ho-cite'); if (!x || !r.isConnected) return;
      const picked = (h && (h.pick && h.pick.length ? h.pick : h.same)) || [];
      const cites = [], seen = new Set();
      for (const p of picked) for (const c of p.cites || []) if (!seen.has(c.no)) { seen.add(c.no); cites.push(c); }
      if (!cites.length) for (const p of picked) for (const no of p.nos || []) if (!seen.has(no)) { seen.add(no); cites.push({ no, date: '' }); }
      if (!cites.length) return;
      cites.sort((a, b) => String(a.day || '9').localeCompare(String(b.day || '9')));   // (the first decision that held it)
      const c = cites[0];
      x.textContent = [c.no + (c.joined ? '등' : ''), c.date ? c.date + ' 결정' : ''].filter(Boolean).join(' · ') + (cites.length > 1 ? ` 외 ${cites.length - 1}건` : '');
      x.classList.add('on');
    }, () => {}).finally(() => { hoBusy--; hoPump(); });
  }
}
// a word is found across the spaces and marks a judgment puts in it ('소의이익' in '소의 이익', '재량권일탈' in '재량권 일탈·남용'),
// as the index of judgments by their words reads them
const GAP = '[^0-9A-Za-z\\u3131-\\u318E\\uAC00-\\uD7A3\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF]{0,3}';
const loose = (w, flags) => new RegExp([...w].map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(GAP), flags);
function snipAt(text, ws) {
  const flat = String(text).replace(/\s+/g, ' ').replace(/^[\[［]\d+[\]］]\s*/, '').trim();
  let at = -1;
  for (const w of ws) { const m = loose(w, 'i').exec(flat); if (m && (at < 0 || m.index < at)) at = m.index; }
  let start = at > 60 ? flat.lastIndexOf(' ', at - 40) + 1 : 0;
  if (start < 0) start = 0;
  const piece = (start ? '… ' : '') + flat.slice(start, start + 150) + (flat.length > start + 150 ? ' …' : '');
  let html = esc(piece);
  for (const w of ws) html = html.replace(loose(esc(w), 'gi'), (m) => `<mark>${m}</mark>`);
  return html;
}
// a decision's line. hint: what the line knows of it (its name, day, field, common name, 주요판례 card) — its sheet looks it up
// by these too when its number finds nothing, and shows them then
function caseRow(no, name, meta, result, order, hint = {}) {
  if (!no) return '';
  const h = ['name', 'date', 'area', 'nick', 'seq', 'joined'].map((k) => (hint[k] ? ` data-c${k}="${esc(hint[k])}"` : '')).join('');
  return `<button type="button" class="lrow" data-case-open="${esc(no)}"${h}><b>${esc(name || no)}</b><span>${meta.filter(Boolean).map(esc).join(' · ')}${result ? ` · <em>${esc(result)}</em>` : ''}</span>${order ? `<span class="lr-o">${esc(order.split('\n')[0])}</span>` : ''}</button>`;
}
const hintOf = (el) => (el ? { name: el.dataset.cname || '', date: el.dataset.cdate || '', area: el.dataset.carea || '', nick: el.dataset.cnick || '', seq: el.dataset.cseq || '', joined: el.dataset.cjoined === 'true' } : {});   // (joined: its line wrote '2012헌마190등(병합)': cited with 등 even when its decision cannot be read)
// a section of answers that keeps its place (.slot): its one-line head — title, count, state — is there from the start
function lawSec(kind, title) { return `<section class="law-sec slot is-wait" data-sec="${kind}"><h2 class="sec-h slot-h">${title} <span class="sec-n"></span><span class="slot-st">찾는 중</span></h2><div class="list law-list"></div></section>`; }
// its state once answered: rows (the head says how many), or none ('이 말로는 없음' — the section stays, one quiet line)
function slotState(sec, n, note = '', why = '') {
  if (sec.classList.contains('is-wait')) sec.classList.remove('is-wait');
  if (sec.classList.contains('is-empty') !== !n) sec.classList.toggle('is-empty', !n);
  const st = $('.slot-st', sec);
  if (st) { setText(st, n ? '' : note || '이 말로는 없음'); setAttr(st, 'title', why || null); }
}
// a late answer, with sections under it already drawn: the rows wait behind 'n건 ›' in the head (a tap opens them)
function slotFold(sec, label, open) {
  sec.classList.add('is-folded');
  const h = $('.slot-h', sec), n = $('.sec-n', sec);
  if (n && !n.textContent) n.textContent = label;   // (the count in the head; the button opens the rows)
  let b = h.querySelector('.slot-more');
  if (!b) { b = el('button', 'slot-more'); b.type = 'button'; h.appendChild(b); }
  b.textContent = '보기 ›'; b.setAttribute('aria-expanded', 'false');
  b.setAttribute('aria-label', `${label} 보기`);
  b.onclick = (e) => { e.stopPropagation(); sec.classList.remove('is-folded'); b.remove(); if (open) open(); };
}
const slotBelow = (sec) => { for (let n = sec.nextElementSibling; n; n = n.nextElementSibling) if (!n.hidden && n.matches('section, .x-cases, .mine-sec')) return true; return false; };
// one section of answers, a page at a time; resolves to how many there are in all. A slot keeps its place whatever comes
// (none: its head says so); another section (행정규칙 · 자치법규) is quiet, shown only once it has rows
async function fillSec(box, kind, ask, live, keep, page = 1) {
  const sec = $(`[data-sec="${kind}"]`, box); if (!sec) return 0;
  const list = $('.law-list', sec), n = $('.sec-n', sec), slot = sec.classList.contains('slot');
  try {
    const r = await ask(page);
    if (!live()) return 0;
    const late = slot && page === 1 && box._slots && box._slots.shown && slotBelow(sec);   // (answered after the screen was drawn)
    if (page === 1) list.innerHTML = '';
    const more = list.querySelector('.more'); if (more) more.remove();
    if (!r.total && page === 1 && kind === 'court' && r.common) {
      if (slot) { slotState(sec, 0, '너무 흔한 낱말이라 이 말만으로는 찾지 않았습니다', '다른 말을 함께 넣어 보세요'); return 0; }
      list.innerHTML = '<p class="none">너무 흔한 낱말이라 법원 판결은 이 말만으로 찾지 않았습니다 · 다른 말을 함께 넣어 보세요</p>'; return 0;
    }
    if (!r.total && page === 1) { if (slot) slotState(sec, 0); else if (keep) list.innerHTML = '<p class="none">없습니다</p>'; else sec.hidden = true; return 0; }
    // (법원 판결: those holding every word first; then, when they are few, the similar ones — those holding the most of the
    // words — under one line saying so, once, also after 더 보기. The count says how many hold every word)
    const rows = r.rows.map(lawRow[kind]), near = kind === 'court' ? r.rows.findIndex((x) => x.near) : -1;
    if (near >= 0 && !list.querySelector('.pq-near')) rows.splice(near, 0, `<p class="none pq-near">${r.exact ? '여기부터 비슷한 판결 · 찾는 낱말이 많이 든 순서' : '모든 낱말이 든 판결은 없어 비슷한 판결을 보입니다'}</p>`);
    // (found word by word: said once, quietly, above the rows — and a word too common to sift by, said too)
    if (page === 1 && r.via === 'split' && r.total) {
      const ws = (r.words || []).join(' · '), lw = (r.loose || []).join(' ');
      rows.unshift(`<p class="none cs-split">낱말을 나눠 찾았습니다 · ${esc(ws)}${finalC(ws) ? '이' : '가'} 모두 든 결정${lw ? ` · ‘${esc(lw)}’${finalC(lw) ? '은' : '는'} 너무 많은 결정에 나와 그 말로는 거르지 않았습니다` : ''}</p>`);
    }
    if (page === 1 && r.timeline) rows.unshift(r.timeline);   // (the flow by year, drawn with the first rows: no shift)
    list.insertAdjacentHTML('beforeend', rows.join(''));
    const nearN = kind === 'court' && r.exact != null ? r.total - r.exact : 0;
    n.textContent = nearN > 0 ? `${r.exact ? `${r.exact.toLocaleString()}건 · ` : ''}비슷한 판결 ${nearN.toLocaleString()}건` : `${r.total.toLocaleString()}건`;
    if (slot && page === 1) { slotState(sec, r.total); if (late) slotFold(sec, `${(r.exact || r.total).toLocaleString()}건`, () => { if (kind === 'court') courtSnips(list, lawQ(), live); }); }
    // (the index of every two-letter piece leaves out only one-letter words and words with digits; an index built before it
    // left out the commonest words too, and says so)
    if (kind === 'court') { if (!sec.classList.contains('is-folded')) courtSnips(list, lawQ(), live); if (page === 1 && r.left && r.left.length) list.insertAdjacentHTML('afterbegin', `<p class="none pq-left">‘${esc(r.left.join(' '))}’은(는) ${r.left.every((w) => w.length < 2 || /\d/.test(w)) ? '한 글자이거나 숫자가 든 말이라 따로 찾지 않았습니다' : '너무 흔해 빼고 찾았습니다'}</p>`); }
    if (kind === 'holding') holdingCites(list, live);
    const shown = list.querySelectorAll('.lrow').length;
    if (shown < r.total && r.rows.length) {
      list.insertAdjacentHTML('beforeend', `<button type="button" class="more">더 보기 · ${shown} / ${r.total}</button>`);
      list.lastElementChild.onclick = (e) => { e.currentTarget.textContent = '불러오는 중…'; fillSec(box, kind, ask, live, keep, page + 1); };
    }
    return r.total;
  } catch (e) {
    if (!live()) return 0;
    const more = list.querySelector('.more');
    const mo = kind === 'expc' || kind === 'admrul' || kind === 'ordin';
    const why = offline(e) ? unreached('찾을 수 있습니다', '찾아 보세요') : kind === 'court' ? '지금은 판결 색인에 닿지 않습니다' : mo ? '지금은 법제처 자료에 닿지 않습니다' : '지금은 헌법재판소 자료에 닿지 않습니다';
    if (page > 1 && more) more.textContent = '불러오지 못했습니다 · 다시 누르기';   // the rows already shown stay
    else if (mo && e && e.code === 'no_key') { if (slot) slotState(sec, 0, '자료를 받을 수 없습니다'); else sec.hidden = true; }   // (a server without 법제처's key: nothing to show)
    else if (slot) slotState(sec, 0, why);
    else list.innerHTML = `<p class="none">${why}</p>`;
    return 0;
  }
}
const lawErr = (e) => (offline(e) ? unreached('볼 수 있습니다', '찾아 보세요') : e && e.code === 'nolaw' ? '그 이름의 법령을 찾지 못했습니다. 정식 이름이나 약칭으로 찾아 보세요' : e && e.code === 'repealed' ? `폐지된 법률입니다${goneText(e)}` : '지금은 불러오지 못했습니다. 잠시 뒤 다시 찾아 보세요');
// a repealed law: ' (1994. 3. 16. 폐지 · 뒤를 이은 법률: 공직선거법)' — what laws.lawText knows of it
const goneText = (e) => { const t = [e && e.date ? `${laws.dateText(String(e.date).replace(/-/g, ''))} 폐지` : '', e && e.now ? `뒤를 이은 법률: ${esc(e.now)}` : ''].filter(Boolean).join(' · '); return t ? ` (${t})` : ''; };
// a law asked by the name it had before (laws.oldLaw): '공직선거및선거부정방지법은 2005. 8. 4. 공직선거법으로 이름이 바뀌었습니다'
// (art: under one article, whose number a 전부개정 may have changed)
const finalC = (w) => { const c = String(w || '').charCodeAt(String(w || '').length - 1) - 0xac00; return c >= 0 && c < 11172 ? c % 28 : 0; };   // (받침: 0 none, 8 ㄹ)
function renamedNote(o, art) {
  if (!o || o.gone || !o.now) return '';
  const fin = finalC(o.now);
  const how = o.whole ? `${o.date} 전부개정되어 ${o.now}${fin ? '이' : '가'} 되었습니다${art ? ' · 조문 번호가 다를 수 있습니다' : ''}` : `${o.date} ${o.now}${fin && fin !== 8 ? '으로' : '로'} 이름이 바뀌었습니다`;
  return `<p class="lc-ahead lc-old lc-renamed">${esc(o.name)}${finalC(o.name) ? '은' : '는'} ${esc(how)}</p>`;
}
// a chapter's name, its own notes (<신설 2005.8.4>, <개정 …>) kept quiet beside it
const chTitle = (t) => { const m = /^(.*?)\s*(<[^<>]*>\s*)+$/.exec(t); return m ? `${esc(m[1])} <small>${esc(t.slice(m[1].length).trim())}</small>` : esc(t); };
// a coming amendment (or a text not yet in force) as the article and the law show it
const aheadNote = (law) => `<p class="lc-ahead">${esc(laws.dateText(law.rev))}부터 시행되는 조문입니다. 지금 시행 중인 조문은 <a href="${laws.lawGoKr.law(law.full)}" target="_blank" rel="noopener">국가법령정보센터</a>에서 확인하세요.</p>`;
function pendingNote(law, x) {
  if (!law.next) return '';
  const pend = laws.pendingArt(law, x);
  const later = law.later && law.later.length ? ` 그 뒤 ${law.later.map((r) => laws.dateText(r)).join(', ')}에도 시행 예정 개정이 있습니다.` : '';
  if (!pend) return `<p class="lc-same">${esc(laws.dateText(law.next.rev))} 시행 예정 개정이 있으나 이 조문은 그대로입니다.${esc(later)}</p>`;
  if (!pend.art) return `<p class="lc-ahead">${esc(pend.date)}부터 이 조문은 없어집니다.</p>`;
  return `<details class="lc-next" open><summary>${esc(pend.date)}부터 이렇게 바뀝니다</summary><div class="lc-t">${diffParas(x, pend.art)}</div></details>${later ? `<p class="lc-same">${esc(later.trim())}</p>` : ''}`;
}
// the coming text, paragraph by paragraph: what it adds marked, what it drops struck through (신구 대비 in place)
const diffParas = (today, coming) => laws.pendingParas(today, coming).map((p) => (p.diff
  ? `<p class="chg">${p.diff.map(([k, t]) => (k === '=' ? esc(t) : k === '+' ? `<ins>${esc(t)}</ins>` : `<del>${esc(t)}</del>`)).join('')}</p>`
  : `<p>${cases.linkCases(p.text)}</p>`)).join('');
// an article of 헌법 or 헌법재판소법, the paragraph asked for picked out; the articles before and after one tap away
// old: { old, by } when the article was opened from a citation of its old text (a judgment's 구 …법(… 개정되기 전의 것)) —
// the card says above the text that it is today's, and leads to the article's 연혁 for the version meant
async function articleCard(box, a, live, old = null) {
  // (a place held for it: its quiet lines in the card's size, .slot-art — else one line)
  box.innerHTML = box.classList.contains('slot-art') ? '' : '<div class="law-card"><p class="none">조문을 불러오는 중…</p></div>';
  // (the 위헌·헌법불합치 band is drawn with the card when the list is at hand within a moment — not put in above the text later)
  const ucP = typeof laws.unconstList === 'function' ? Promise.resolve().then(() => laws.unconstList()).catch(() => null) : Promise.resolve(null);
  let law;
  try { law = await laws.lawText(a.law); } catch (e) { if (live()) box.innerHTML = e && /unregistered|nolaw|repealed/.test(e.code) ? lawLinkCard(a, e.code, e) : `<div class="law-card"><p class="none">${lawErr(e)}</p></div>`; return null; }
  if (!live()) return null;
  if (a.art === '전문') {   // 헌법 전문: the preamble itself
    box.innerHTML = `<div class="law-card"><div class="lc-h"><b>헌법 전문</b><span>${esc(law.title || law.full)}</span></div>
      <div class="lc-t">${law.preamble ? `<p>${esc(law.preamble)}</p>` : '<p class="none">전문을 불러오지 못했습니다</p>'}</div>
      <div class="lc-acts"><button type="button" class="btn ghost small" data-lq="헌법 제1조">제1조 ›</button><span class="sp"></span><button type="button" class="btn ghost small lc-copy">복사</button><a class="btn ghost small" href="${laws.lawGoKr.law(law.full)}" target="_blank" rel="noopener">국가법령정보센터</a></div></div>`;
    $('.lc-copy', box).onclick = () => copyText(`대한민국헌법 전문\n${law.preamble || ''}`.trim());
    return law;
  }
  let x = laws.findArt(law, a.art, a.sub), coming = false;
  const name = a.law === '헌법' ? '헌법' : law.full;
  if (!x && law.next) { x = laws.findArt(law.next, a.art, a.sub); coming = !!x; }   // an article the coming amendment adds
  // (a 구법 article today's law no longer has: the citation is right, the text is gone — said so, with the versions compared)
  if (!x && old) { box.innerHTML = `<div class="law-card"><p class="lc-ahead lc-old">${esc(cases.oldBand(old.old, old.by, true))}</p><p class="none">${esc(law.full)}의 마지막 조문은 ${laws.artLabel(law.arts[law.arts.length - 1])}</p><div class="lc-acts"><a class="btn ghost small" href="${laws.lawGoKr.oldNew(law.full)}" target="_blank" rel="noopener">국가법령정보센터 신구법 비교</a></div></div>`; return law; }
  if (!x) { box.innerHTML = `<div class="law-card">${renamedNote(laws.oldLaw(a.law), true)}<p class="none">${esc(law.full)}에서 그 조문을 찾지 못했습니다 · 마지막 조문은 ${laws.artLabel(law.arts[law.arts.length - 1])}</p></div>`; return law; }
  const list = coming ? law.next.arts : law.arts, i = list.indexOf(x), prev = list[i - 1], next = list[i + 1];
  const ps = laws.paras(x), pick = a.para && ps[a.para - 1] ? a.para : 0;
  const go = (y, text) => `<button type="button" class="btn ghost small" data-lq="${esc(name + ' ' + laws.artLabel(y))}">${text}</button>`;
  const uc = await Promise.race([ucP, new Promise((ok) => setTimeout(() => ok(null), 600))]);
  if (!live()) return null;
  let band = '';
  try { band = uc && uc.idx && typeof laws.ucArticleBand === 'function' ? laws.ucArticleBand(uc.idx, law.full, x.art, x.sub) : ''; } catch (e) { band = ''; }
  box.innerHTML = `<div class="law-card"${uc && uc.idx ? ' data-vb=""' : ''}>
    <div class="lc-h"><b>${esc(name)} ${laws.artLabel(x)}${x.title ? `<span class="lc-tt">(${esc(x.title)})</span>` : ''}</b><span>${esc([x.chapter, law.src ? law.title : ''].filter(Boolean).join(' · '))}</span></div>
    ${old ? `<p class="lc-ahead lc-old">${esc(cases.oldBand(old.old, old.by))}<button type="button" class="law-eg lc-oldh" hidden>연혁에서 그때 조문 보기</button></p>` : renamedNote(laws.oldLaw(a.law), true)}
    ${a.via === 'abbr' && typeof laws.foundAs === 'function' ? `<p class="law-note faint lc-via">‘${esc(a.law)}’ · ${esc(laws.foundAs(law.full))}</p>` : ''}
    ${law.ahead ? aheadNote(law) : coming ? `<p class="lc-ahead">${esc(laws.dateText(law.next.rev))}부터 시행되는 개정으로 새로 생기는 조문입니다.</p>` : ''}
    ${band}<div class="lc-t">${ps.map((t, k) => `<p class="${pick === k + 1 ? 'on' : ''}">${cases.linkCases(t)}</p>`).join('')}</div>
    ${coming || law.ahead ? '' : pendingNote(law, x)}
    <div class="lc-hist-at"></div>
    <div class="lc-acts">${prev ? go(prev, '‹ ' + laws.artLabel(prev)) : ''}<span class="sp"></span>${typeof x.art === 'number' && !coming ? '<button type="button" class="btn ghost small lc-watch" aria-pressed="false"></button>' : ''}<button type="button" class="btn ghost small lc-copy">복사</button><a class="btn ghost small" href="${laws.lawGoKr.article(law.full, x.art, x.sub)}" target="_blank" rel="noopener">국가법령정보센터</a><span class="sp"></span>${next ? go(next, laws.artLabel(next) + ' ›') : ''}</div>
  </div>`;
  linkByl($('.lc-t', box), law.full);   // ('별표 23과 같다': the card's own law's 별표)
  const wb = $('.lc-watch', box);
  if (wb) { const wa = { law: a.law, art: x.art, sub: x.sub || 0, para: a.para || 0 }; watchBtn(wb, !!watchOf(wa)); wb.onclick = () => watchToggle(wa, wb); }
  $('.lc-copy', box).onclick = () => copyText(`${law.full} ${laws.artLabel(x)}${pick ? ` 제${pick}항` : ''}${old ? ' (현행 조문)' : ''}\n${pick ? ps[pick - 1] : x.text}`);
  const hp = histSec($('.lc-hist-at', box), law, x, live);
  if (old) oldHist(box, old.old);
  // (its 연혁 line comes with the card when it is found within a moment: what goes under the card is put there after it)
  await Promise.race([hp, new Promise((ok) => setTimeout(ok, 500))]);
  return law;
}
/* An article of a law as it read before a 전부개정 (or before its law was repealed): today's article of the same number is
   another article, so it is never this card's body. The card says what happened ('2009. 2. 6. 전부개정 전 조문입니다'), shows
   the old text when the record has it (laws.versionAt, through laws.successor), the articles of today's law that took it over
   — the checked map first, then the likest by title and words — the way to 국가법령정보센터's 신구법 비교, and, folded, today's
   article of that number for what it is ('현행 제58조(다른 내용) 보기'). */
const dotDayOf = (t) => { const m = /((?:19|20)\d{2})\s*[.\-]\s*(\d{1,2})\s*[.\-]\s*(\d{1,2})/.exec(String(t || '')); return m ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.` : ''; };
async function oldArticleCard(box, a, live, old, o) {
  box.innerHTML = box.classList.contains('slot-art') ? '' : '<div class="law-card"><p class="none">조문을 불러오는 중…</p></div>';
  const day = dotDayOf(old && old.old) || (o && o.gone ? dotDayOf(o.gone) : o ? o.date : '');
  const s = await laws.successor(a.law, a.art, day, {}).catch(() => null) || { whole: true, note: '', now: '', candidates: [] };
  if (!live()) return null;
  const now = s.now || (o && o.now) || (o ? '' : a.law), name = o ? o.name : a.law;
  const label = `구 ${name} ${laws.artLabel(a)}${a.para ? ` 제${a.para}항` : ''}`;
  const what = o && o.gone ? `${day} 폐지된 법률의 조문` : `${day ? day + ' ' : ''}전부개정 전 조문`;
  const oldT = s.old && s.old.text ? s.old : null;
  const ps = oldT ? laws.paras({ text: typeof laws.histText === 'function' ? laws.histText(oldT.text) : oldT.text }) : [];
  const pick = a.para && ps[a.para - 1] ? a.para : 0;
  const why = { map: '확인된 대응 조문', title: '제목이 같음', text: '내용이 비슷함', words: '낱말이 겹침', same: '같은 번호' };
  const cands = (s.candidates || []).filter((c) => c && c.law && typeof c.art === 'number');
  const cand = (c) => `<button type="button" class="lrow lc-succ" data-lq="${esc(`${c.law} 제${c.art}조${c.sub ? '의' + c.sub : ''}`)}"><b>${esc(c.law)} 제${c.art}조${c.sub ? '의' + c.sub : ''}${c.title ? ` <span class="lc-tt">(${esc(c.title)})</span>` : ''}</b><span>${esc(why[c.why] || (c.score >= 1 ? '확인된 대응 조문' : '비슷한 조문'))}</span></button>`;
  const cmp = now ? `<a class="btn ghost small" href="${laws.lawGoKr.oldNew(now)}" target="_blank" rel="noopener">국가법령정보센터 신구법 비교</a>` : `<a class="btn ghost small" href="${laws.lawGoKr.search(name)}" target="_blank" rel="noopener">국가법령정보센터에서 검색</a>`;
  const same = now && !(o && o.gone && !s.candidates.length) ? `<details class="lc-cur"><summary>현행 ${esc(now)} ${laws.artLabel(a)}(다른 내용) 보기</summary><div class="lc-cur-in"><p class="none">불러오는 중…</p></div></details>` : '';
  box.innerHTML = `<div class="law-card lc-oldart">
    <div class="lc-h"><b>${esc(label)}</b><span>${esc(what)}</span></div>
    <p class="lc-ahead lc-old">${esc(s.note || `${what}입니다. 같은 번호의 현행 조문은 다른 조문입니다.`)}</p>
    ${ps.length ? `<div class="lc-t">${ps.map((t, k) => `<p class="${pick === k + 1 ? 'on' : ''}">${cases.linkCases(t)}</p>`).join('')}</div><p class="law-note faint">${esc([oldT.d ? `${histDate(oldT.d)} 공포된 판` : '그때의 판', 'legalize-kr의 기록'].join(' · '))}</p>`
      : `<p class="law-note">그때 조문의 글은 이 앱의 기록에 없습니다 · 국가법령정보센터의 신구법 비교나 연혁에서 볼 수 있습니다</p>`}
    <h4 class="lc-sub">이 조문을 이어받은 현행 조문${cands.some((c) => c.score >= 1) ? '' : '(후보)'}</h4>
    ${cands.length ? `<div class="list law-list lc-succs">${cands.map(cand).join('')}</div>` : '<p class="none">이어받은 현행 조문을 찾지 못했습니다 · 신구법 비교에서 확인해 보세요</p>'}
    ${same}
    <div class="lc-acts">${cmp}<span class="sp"></span>${ps.length ? '<button type="button" class="btn ghost small lc-copy">복사</button>' : ''}</div>
  </div>`;
  const cp = $('.lc-copy', box);
  if (cp) cp.onclick = () => copyText(`${label} (${what})\n${pick ? ps[pick - 1] : ps.join('\n')}`);
  const det = $('.lc-cur', box);
  if (det) det.addEventListener('toggle', async () => {
    const inn = $('.lc-cur-in', det); if (!det.open || inn.dataset.done) return; inn.dataset.done = '1';
    try {
      const law = await laws.lawText(now), x = laws.findArt(law, a.art, a.sub);
      inn.innerHTML = x ? `<p class="law-note faint">지금의 ${esc(law.full)} ${laws.artLabel(x)}${x.title ? `(${esc(x.title)})` : ''} — 위 조문과는 다른 조문입니다</p><div class="lc-t">${laws.paras(x).map((t) => `<p>${cases.linkCases(t)}</p>`).join('')}</div><p><button type="button" class="law-eg" data-lq="${esc(law.full + ' ' + laws.artLabel(x))}">현행 조문으로 가기 ›</button></p>` : `<p class="none">${esc(law.full)}에는 지금 그 번호의 조문이 없습니다</p>`;
    } catch (e) { inn.innerHTML = `<p class="none">${lawErr(e)}</p>`; }
  });
  return null;
}
// the old-text band's way into the article's 연혁 (histSec): shown once the 연혁 fold is there; it opens the fold and, once
// its versions are drawn, the one the note means — for "2011. 3. 31. 개정 전" the newest before that day, for "… 개정된 것"
// the newest on or before it (the versions are newest first, each headed by its date)
function oldHist(box, note) {
  const b = $('.lc-oldh', box), det = $('.lc-hist', box);
  if (!b || !det) return;
  const show = () => { b.hidden = det.hidden || det.dataset.none === '1'; };   // (the fold that found no record: no way into it)
  new MutationObserver(show).observe(det, { attributes: true, attributeFilter: ['hidden', 'data-none'] });
  show();
  const dash = (t) => { const m = /((?:19|20)\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})/.exec(t || ''); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : ''; };
  // ("… 시행 전" dates the version by the day the change took effect: each version's 시행 day, said beside its date when it differs)
  const day = dash(note), before = / 전$/.test(note || ''), byEff = / 시행 전$/.test(note || '');
  b.onclick = () => {
    det.open = true;
    det.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (!day) return;
    const t0 = Date.now();
    const pick = () => {
      if (!det.isConnected) return;
      const vs = [...det.querySelectorAll('.hs-v')];
      if (!vs.length) { if (Date.now() - t0 < 15000) setTimeout(pick, 300); return; }
      const hit = vs.find((d) => {
        const at = (byEff && dash(($('summary .hs-eff, summary .hs-soon', d) || {}).textContent)) || dash(($('summary b', d) || {}).textContent);
        return at && (before ? at < day : at <= day);
      });
      if (hit) { hit.open = true; setTimeout(() => hit.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60); }
    };
    pick();
  };
}
/* ---------- 조문 연혁 ---------- */
// On the article card, folded: when the article changed and how — newest first, each version's date, kind and number, and
// opened in place, its text then with what that amendment put in marked and what it took out struck through (the version
// just before it as the base). Worked out beforehand for the owner's laws (lawhist/); for any other law it is searched on this
// device only once the fold is opened, a few versions at a time (laws.artHistory).
const todayDash = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const histDate = (d) => laws.dateText(String(d || '').replace(/-/g, '')) || '날짜 미상';
const histNum = (e, type) => (e.no ? `${e.type || type || '법령'} 제${e.no}호` : '');
// why a search on the device stopped (the connection, GitHub's hourly allowance, or the mirror not answering)
const histErr = (h) => (h.err === 'offline' ? (noNet() ? '인터넷에 연결되면 이어서 찾을 수 있습니다' : '지금은 법령 기록에 닿지 않습니다 · 잠시 뒤 다시 찾아 보세요') : h.err === 'busy' ? '지금은 GitHub가 판 목록을 주지 않습니다 · 한 시간쯤 뒤 다시 찾아 보세요'
  : h.net ? '연결이 끊겨 지난 판을 다 읽지 못했습니다' : '지금은 지난 판을 읽지 못했습니다');
function histHead(e, type, now) {
  const t = todayDash();
  const how = e.how === 'new' ? '신설' : e.how === 'start' ? '기록의 처음' : e.fresh ? '최근 개정' : '';
  const eff = e.eff && e.eff !== e.d ? (e.eff > t ? `<em class="hs-soon">${esc(histDate(e.eff))} 시행 예정</em>` : `<span class="hs-eff">${esc(histDate(e.eff))} 시행</span>`) : '';
  return `<b>${esc(histDate(e.d))}</b><span>${esc([e.gone ? '조문이 빠짐' : '', e.kind, how, histNum(e, type)].filter(Boolean).join(' · '))}</span>${now ? '<em class="hs-now">현행</em>' : ''}${eff}`;
}
function histBody(e, before) {
  if (e.gone) return '<p class="none">이 판에서 이 조문이 빠졌습니다</p>';
  const x = { text: laws.histText(e.text) };   // (법제처's pictures as 〔그림〕, not their markup)
  const vs = before && !before.gone && e.how !== 'whole' && e.how !== 'new';   // (marked against the version before it)
  const tt = vs && before.title !== e.title ? `<p class="hs-tt">제목 ${before.title ? `<del>(${esc(before.title)})</del> ` : ''}<ins>${e.title ? `(${esc(e.title)})` : '(없음)'}</ins></p>` : e.title ? `<p class="hs-tt">(${esc(e.title)})</p>` : '';
  const text = vs ? diffParas({ text: laws.histText(before.text) }, x) : laws.paras(x).map((p) => `<p>${cases.linkCases(p)}</p>`).join('');
  const note = e.how === 'start' ? '<p class="law-note faint">이 판부터 기록이 있습니다 · 그 전의 개정은 조문 끝의 〈개정 …〉에 적혀 있습니다</p>'
    : e.how === 'whole' ? `<p class="law-note faint">${e.kind === '제정' ? '이 법이 제정될 때의 조문입니다' : `${esc(e.kind || '전부개정')}으로 새로 쓰인 조문입니다 · 그 전의 같은 번호는 다른 조문입니다`}</p>` : '';
  return `<div class="lc-t">${tt}${text}</div>${note}`;
}
function histList(h, type) {
  const t = todayDash(), list = h.list;
  const nowAt = list.findIndex((e) => !e.gone && (e.eff || e.d) <= t);
  return `<ol class="hs-list">${list.map((e, i) => `<li><details class="hs-v"${i === 0 ? ' open' : ''} data-i="${i}"><summary>${histHead(e, type, i === nowAt)}</summary><div class="hs-in"></div></details></li>`).join('')}</ol>`;
}
function histSec(at, law, x, live) {
  if (!at || typeof x.art !== 'number') return;
  // (the fold is there from the first frame, saying 찾는 중: an answer that comes after the card is drawn fills its line, and
  // never pushes the card's buttons down under the reader's finger; no record is said on the same line, never folded away)
  at.innerHTML = '<details class="lc-hist"><summary><b>연혁</b><span class="hs-n">찾는 중</span></summary><div class="hs-body"></div></details>';
  const det = $('.lc-hist', at), n = $('.hs-n', at), body = $('.hs-body', at);
  $('summary', det).addEventListener('click', (e) => { if (!h) e.preventDefault(); });   // (nothing to open yet)
  const out = laws.lawGoKr.article(law.full, x.art, x.sub);
  let h = null, busy = false;
  const summary = () => {
    if (h.unsure && h.idle) { n.textContent = '열면 기록을 찾습니다'; return; }   // (the records worked out beforehand not reached yet)
    if (h.big && !h.list.length && !h.err) { n.textContent = '판이 큰 법령 · 국가법령정보센터에서 봅니다'; return; }
    if (h.idle) { n.textContent = '열면 지난 판에서 찾습니다'; return; }
    const changes = h.list.filter((e) => !e.how).length, base = h.list[h.list.length - 1];
    if (!h.done) { n.textContent = h.list.length ? `최근 ${changes}번 바뀜 · 더 찾을 수 있습니다` : h.err ? '찾지 못했습니다 · 다시 찾을 수 있습니다' : '찾는 중'; return; }
    if (!base) { n.textContent = '기록이 없습니다'; return; }
    const since = base.how === 'new' ? `${histDate(base.d)} 신설` : base.how === 'whole' ? `${histDate(base.d)} ${base.kind || '전부개정'}` : `${histDate(base.d)}부터의 기록`;
    // (a record that starts later than the law — a rename the mirror does not cross: 공직선거법 from 2005. 8. 4. — never reads as the
    // whole history: the fold's line says where it stops, and the line under the list where the rest is: laws.artHistory's gap)
    n.textContent = `${since} · ${changes ? `${changes}번 바뀜` : '바뀐 적 없음'}${h.gap ? ' · 그 전은 국가법령정보센터에' : ''}`;
  };
  const open = (d) => {   // each version's text is made when it is first opened
    const inn = $('.hs-in', d);
    if (!inn || inn.dataset.done) return;
    const i = Number(d.dataset.i), e = h.list[i];
    inn.dataset.done = '1';
    inn.innerHTML = histBody(e, e.before !== undefined ? e.before : h.list[i + 1]);
  };
  const draw = () => {
    if (!h) return;
    // (a law too large to read version by version here: its page at 국가법령정보센터, which shows each article's 연혁)
    // (a round that failed: what was found stays, with the reason and a way to go on from where it stopped)
    body.innerHTML = (h.list.length ? histList(h, h.type || law.type) : '')
      + (h.done ? '' : h.err ? `<p class="law-note hs-more hs-err">${esc(histErr(h))} · <button type="button" class="law-eg">다시 찾기</button></p>` : h.big ? `<p class="law-note">이 법령은 한 판이 커서 휴대전화로 지난 판을 하나하나 읽어 찾지 않습니다 · <a href="${out}" target="_blank" rel="noopener">국가법령정보센터에서 보기</a></p>`
        : `<p class="law-note hs-more">${h.read ? `지난 판 ${h.n}개 가운데 ${h.read}개를 읽었습니다 · ` : ''}<button type="button" class="law-eg">더 찾기</button></p>`)
      + (h.gap && h.gap.text ? `<p class="law-note hs-gap">${esc(h.gap.text)} <a href="${esc(h.gap.url || out)}" target="_blank" rel="noopener">보기 ›</a></p>` : '')
      + (h.list.length ? `<p class="law-note faint hs-src">법제처 법령 원문을 판마다 모아 둔 legalize-kr의 기록에서 찾았습니다 · <a href="${out}" target="_blank" rel="noopener">국가법령정보센터</a></p>` : '');
    body.querySelectorAll('.hs-v').forEach((d) => { if (d.open) open(d); d.addEventListener('toggle', () => { if (d.open) open(d); }); });
    const more = $('.hs-more button', body);
    if (more) more.onclick = () => search();
    summary();
  };
  // (asking failed before a round could begin — GitHub's list of versions, or the law itself: what earlier rounds found stays)
  const fail = (e) => {
    const was = h && !h.idle && h.list ? h : { list: [], src: 'live', done: false, read: 0, n: 0 };
    h = { ...was, idle: false, unsure: false, done: false, err: (e && e.code) || 'unavailable', net: !!(e && e.net) };
    draw();
  };
  const search = async () => {   // (not worked out beforehand: read the versions it needs, now that it is asked)
    if (busy) return;
    busy = true;
    const more = $('.hs-more', body);
    if (more) more.textContent = '지난 판을 읽는 중…'; else body.innerHTML = '<p class="none hs-wait">지난 판을 읽어 바뀐 때를 찾는 중…</p>';
    try {
      const r = await laws.artHistory(law, x, { live: true, onStep: (k, all) => { const w = $('.hs-wait, .hs-more', body); if (w) w.textContent = `지난 판을 읽어 바뀐 때를 찾는 중… (${k} / ${all})`; } });
      if (!live() || !at.isConnected) return;
      if (!r) { if (!h || !h.list || !h.list.length) { det.open = false; det.dataset.none = '1'; n.textContent = '기록이 없습니다'; } return; }
      h = r; draw();
    } catch (e) { if (live() && at.isConnected) fail(e); }
    finally { busy = false; }
  };
  det.addEventListener('toggle', () => { if (det.open && h && ((h.idle && !h.big) || h.unsure || (h.err && !h.list.length))) search(); });
  return laws.artHistory(law, x).then((r) => {
    if (!live() || !at.isConnected) return;
    if (!r) { det.dataset.none = '1'; n.textContent = '기록이 없습니다'; return; }
    h = r;
    if (h.idle && (!h.big || h.unsure)) summary(); else draw();
  }).catch(() => { if (live() && at.isConnected && !h) n.textContent = '찾지 못했습니다'; });
}
// a whole law, chapter by chapter, one line per article
async function lawWhole(box, key, live, quiet) {
  box.innerHTML = quiet || box.classList.contains('slot-art') ? '' : '<div class="law-card"><p class="none">불러오는 중…</p></div>';
  const ucP = typeof laws.unconstList === 'function' ? Promise.resolve().then(() => laws.unconstList()).catch(() => null) : Promise.resolve(null);
  let law;
  try { law = await laws.lawText(key); } catch (e) { box.dataset.err = (e && e.code) || ''; if (live() && !quiet) box.innerHTML = `<div class="law-card"><p class="none">${lawErr(e)}</p></div>`; return null; }
  if (!live()) return null;
  const name = key === '헌법' ? '헌법' : law.full;
  const line = (a) => `<button type="button" class="lw-a" data-lq="${esc(name + ' ' + laws.artLabel(a))}"><b>${laws.artLabel(a)}${a.title ? ` ${esc(a.title)}` : ''}</b><span>${esc(a.text.split('\n')[0])}</span></button>`;
  const groups = [];
  for (const a of law.arts) { if (!groups.length || groups[groups.length - 1].ch !== a.chapter) groups.push({ ch: a.chapter, arts: [] }); groups[groups.length - 1].arts.push(a); }
  // a long law opens as its chapters (공직선거법: 17 장, 400여 조), each one tap away; a short one as its articles
  const fold = law.arts.length > 60 && groups.length > 1;
  const html = groups.map((g) => (fold
    ? `<details class="lw-fold"><summary><b>${chTitle(g.ch || '처음 조문')}</b><span>${laws.artLabel(g.arts[0])}${g.arts.length > 1 ? ' ~ ' + laws.artLabel(g.arts[g.arts.length - 1]) : ''}</span></summary>${g.arts.map(line).join('')}</details>`
    : `${g.ch ? `<h3 class="lw-ch">${chTitle(g.ch)}</h3>` : ''}${g.arts.map(line).join('')}`)).join('');
  const pend = laws.pendingArts(law);
  const later = law.later && law.later.length ? `<span>그 뒤 ${law.later.map((r) => esc(laws.dateText(r))).join(', ')}에도 시행 예정 개정이 있습니다</span>` : '';
  const next = law.next ? `<div class="lc-next lw-next"><b>${esc(laws.dateText(law.next.rev))} 시행 예정 개정</b><span>${pend.length ? `바뀌는 조문 ${pend.length}개` : '조문은 그대로입니다'}</span>${later}${pend.length ? `<div class="lw-next-arts">${pend.slice(0, 40).map((a) => `<button type="button" data-lq="${esc(name + ' ' + laws.artLabel(a))}">${laws.artLabel(a)}${a.how !== '개정' ? `<small>${a.how}</small>` : ''}</button>`).join('')}${pend.length > 40 ? `<span>외 ${pend.length - 40}개</span>` : ''}</div>` : ''}</div>` : '';
  const more = /(?:시행령|시행규칙)$/.test(law.full) ? `<button type="button" class="lw-rel" data-lq="${esc(law.full.replace(/\s*(?:시행령|시행규칙)$/, ''))}">법률</button>` : '';
  const rel = more + (law.files || []).filter((f) => (f === '시행령' || f === '시행규칙') && !law.full.endsWith(f)).map((f) => `<button type="button" class="lw-rel" data-lq="${esc(law.full.replace(/\s*(?:시행령|시행규칙)$/, '') + ' ' + f)}">${f}</button>`).join('');
  const out = `<a class="lc-out" href="${laws.lawGoKr.law(law.full)}" target="_blank" rel="noopener">국가법령정보센터</a>`;
  const uc = await Promise.race([ucP, new Promise((ok) => setTimeout(() => ok(null), 600))]);
  if (!live()) return null;
  box.innerHTML = `<div class="law-card law-whole"${uc && uc.idx ? ' data-vb=""' : ''}><div class="lc-h"><b>${esc(law.title)}</b><span>${law.arts.length}개 조</span>${rel ? `<span class="lw-rels">${rel}</span>` : ''}${out}</div>${law.ahead ? aheadNote(law) : next}${law.preamble ? `<details class="cs-fold"><summary>전문</summary><p>${esc(law.preamble)}</p></details>` : ''}${html}</div>`;
  if (uc && uc.idx) wholeBand(box.firstElementChild, law.full, uc);
  // (coming back to it: the chapters that were open, open again in the same frame, so the scroll kept can be reached)
  const hs = history.state, ds = hs && Array.isArray(hs.folds) && hs.nav && hs.nav.kind === 'law' ? box.querySelectorAll('.lw-fold') : null;
  if (ds) for (const i of hs.folds) if (ds[i]) ds[i].open = true;
  return law;
}
// a law page's 위헌·헌법불합치 marks, drawn with it (as laws.js would add them a moment later): the band under its head, a mark
// on each article line, and on each folded chapter how many of its articles are marked
function wholeBand(card, name, uc) {
  try {
    const lines = [...card.querySelectorAll('.lw-a[data-lq]')].map((b) => [b, laws.articleQuery(b.dataset.lq)]).filter(([, q]) => q && typeof q.art === 'number');
    const band = laws.ucLawBand(uc.idx, name, uc.rec && uc.rec.asOf, new Set(lines.map(([, q]) => q.art + ':' + (q.sub || 0))));
    if (band) card.querySelector(':scope > .lc-h').insertAdjacentHTML('afterend', band);
    for (const [b, q] of lines) { const tag = laws.ucTag(uc.idx, name, q.art, q.sub); if (tag) { const t = b.querySelector('b'); if (t) t.insertAdjacentHTML('beforeend', ' ' + tag); } }
    for (const d of card.querySelectorAll('.lw-fold')) {
      const n = d.querySelectorAll('.lw-a .vb-tag').length, t = d.querySelector(':scope > summary > b');
      if (n && t) t.insertAdjacentHTML('beforeend', ` <em class="vb-tag${d.querySelector('.lw-a .vb-tag.vb-un') ? ' vb-un' : ''}">위헌·헌법불합치 ${n}개 조</em>`);
    }
  } catch (e) { card.removeAttribute('data-vb'); }   // (laws.js marks it then, as before)
}

/* ---------- 국회 계류 법안 ---------- */
// Under an article, the bills now before the Assembly that would change it; under a whole law, all of them, newest first.
// The first look at a law with many bills takes a while (the server reads each bill's 주요내용): what is found shows as it comes.
const billRows = new Map();   // bill number → { x, law }: the rows on screen, for their sheets
const billArtsText = (x, max = 4) => (x.arts && x.arts.length ? x.arts.slice(0, max).map((k) => { const a = bills.artOf(k); return a ? laws.artLabel(a) : k; }).join(' · ') + (x.arts.length > max ? ` 외 ${x.arts.length - max}개` : '') : '');
function billRow(x, law, here) {
  billRows.set(x.no, { x, law });
  const arts = here ? billArtsText({ arts: x.arts.filter((k) => k !== here) }, 3) : billArtsText(x);
  const meta = [here && arts ? '함께 바꾸는 조문 ' + arts : arts, bills.byText(x), bills.dateText(x.date), bills.stepText(x)].filter(Boolean);
  return `<button type="button" class="lrow bill-row" data-bill="${esc(x.no)}"><b>${esc(x.gist || x.name)}</b><span>${meta.map(esc).join(' · ')}</span>${x.gist ? '' : '<span class="lr-o">주요내용을 읽는 중…</span>'}</button>`;
}
/* Under an article (or a law), one line of 48 px — '이 조문을 고치는 계류 법안 3건 ›', '… 없음 · 개정안 291건 중' — that
   opens the bills on a tap. It never grows by itself, however long the server takes or however many bills it finds. */
function billLine(at, law, a, live) {
  if (!at || !bills.byAssembly(law.full)) return;   // a 시행령 or 규칙 is not amended by the Assembly
  const name = law.full, here = a ? bills.artKey(a.art, a.sub) : null, constitution = /헌법$/.test(name) && !/재판소법$/.test(name);
  let more = 10, d0 = null, open = false;
  at.innerHTML = '<button type="button" class="bill-line" aria-expanded="false"><span class="bl-t">국회 계류 법안</span><small class="bl-s">불러오는 중</small></button><section class="bill-sec" hidden></section>';
  const btn = $('.bill-line', at), sec = $('.bill-sec', at);
  const whole = () => `<button type="button" class="law-eg" data-lq="${esc(name)}">${esc(name)} 계류 법안 전체 보기</button>`;
  const say = (t, sm) => { btn.innerHTML = `<span class="bl-t">${t}</span>${sm ? `<small class="bl-s">${esc(sm)}</small>` : ''}`; };
  const rowsOf = (d) => (here ? bills.touching(d, a.art, a.sub) : d.rows);
  const line = (d) => {
    const rows = rowsOf(d), reading = d.missing > 0 && !d.stale && !d.stalled;
    const when = d.at ? `${bills.dateText(new Date(d.at + 9 * 3600e3).toISOString().slice(0, 10))} 기준` : '';
    if (rows.length) say(`${here ? '이 조문을 고치는 계류 법안' : '국회 계류 법안'} <b>${rows.length}건</b>`, reading ? `주요내용 살피는 중 ${d.total - d.missing}/${d.total}` : when);
    else if (reading) say(here ? '이 조문을 고치는 계류 법안을 찾는 중' : '국회 계류 법안을 찾는 중', `${d.total - d.missing}/${d.total}`);
    else if (!d.total) say(constitution ? '국회에 계류 중인 헌법 개정안 없음' : `국회에 계류 중인 ${esc(name)} 개정안 없음`, when);
    else say(here ? '이 조문을 고치는 계류 법안 없음' : '국회 계류 법안 없음', `${name} 개정안 ${d.total}건 중`);
  };
  const panel = (d) => {
    const rows = rowsOf(d), reading = d.missing > 0 && !d.stale && !d.stalled;
    const when = d.at ? `${bills.dateText(new Date(d.at + 9 * 3600e3).toISOString().slice(0, 10))} 기준` : '';
    if (!rows.length && !reading) {
      sec.className = 'bill-sec bill-none';
      sec.innerHTML = `<p class="law-note">${!d.total ? `국회에 계류 중인 ${esc(name)} 개정안이 없습니다` : `국회에 계류 중인 ${esc(name)} 개정안 ${d.total}건 가운데 이 조문을 고치는 법안은 없습니다 · ${whole()}`}${when ? ` <span class="bill-when">(${when})</span>` : ''}</p>`;
      return;
    }
    sec.className = 'bill-sec';
    const list = rows.slice(0, more);
    sec.innerHTML = `<div class="list law-list">${list.map((x) => billRow(x, law, here)).join('') || '<p class="none">이 조문을 고치는 법안을 찾는 중…</p>'}${rows.length > list.length ? `<button type="button" class="more bill-more">더 보기 · ${list.length} / ${rows.length}</button>` : ''}</div>
      <p class="law-note bill-foot">${here ? `${whole()} · ` : ''}제안이유 및 주요내용이 밝힌 조문을 기준으로 모았습니다 · 열린국회정보${when ? ` · ${when}` : ''}${d.stale ? ' · 지금은 국회 의안정보에 닿지 않아 전에 받은 목록입니다' : d.stalled && d.missing ? ` · 법안 ${d.missing}건의 주요내용은 아직 읽지 못했습니다` : ''}</p>`;
    const mb = $('.bill-more', sec); if (mb) mb.onclick = () => { more += 20; panel(d); };
  };
  btn.onclick = () => {
    open = !open; btn.setAttribute('aria-expanded', String(open)); sec.hidden = !open;
    if (open) { if (d0) panel(d0); else sec.innerHTML = '<p class="law-note">국회 의안정보를 불러오는 중…</p>'; }
  };
  const draw = (d) => { if (!live() || !at.isConnected || !d) return; d0 = d; line(d); if (open) panel(d); };
  bills.pending(name, draw).then(draw, (e) => {
    if (!live() || !at.isConnected) return;
    const t = offline(e) ? unreached('국회 계류 법안을 볼 수 있습니다', '열어 보세요') : '지금은 국회 의안정보에 닿지 않습니다';
    say(esc(t)); btn.disabled = true; sec.hidden = true; open = false; btn.setAttribute('aria-expanded', 'false');   // (opened before it failed: closed with it)
  });
}
// one bill: who proposed it and how far it has gone, its 제안이유 및 주요내용 (the articles it names, one tap away), the
// meetings that took it up, and its page at 의안정보시스템 (검토보고서·원문)
function billSheet(x, law) {
  const name = law.full;
  const arts = (x.arts || []).map((k) => { const a = bills.artOf(k); return a ? `<button type="button" data-art="${esc(name + ' ' + laws.artLabel(a))}">${laws.artLabel(a)}</button>` : ''; }).join('');
  const step = bills.stepText(x) + (x.step !== '접수' && x.stepAt ? ` (${bills.dateText(x.stepAt)})` : '');
  const box = sheet(`<div class="cs-head"><h2>${esc(x.name)}</h2></div><div class="cs-body">
    <div class="cs-meta">의안번호 ${esc(x.no)} · ${esc(bills.byText(x))} · ${esc(bills.dateText(x.date))} 제안</div>
    <div class="cs-meta">${esc(step)}</div>
    ${arts ? `<div class="bill-arts">${arts}</div>` : ''}
    <section class="cs-sec bill-sum"><p class="cs-wait">제안이유 및 주요내용을 불러오는 중…</p></section>
    <section class="cs-sec bill-min" hidden></section>
  </div><div class="row-btns"><a class="btn ghost" href="${bills.likms(x)}" target="_blank" rel="noopener">${x.review ? '검토보고서 · 원문' : '원문'} (의안정보시스템)</a><button type="button" class="btn ghost cs-copy">인용 복사</button></div>`);
  box.classList.add('case-sheet');
  $('.cs-copy', box).onclick = () => copyText(bills.cite(x));
  const sum = $('.bill-sum', box), min = $('.bill-min', box);
  // the articles a bracket names ("(안 제24조제1항 및 제24조의2 신설)"), each one tap from its text in this law
  const linkArts = (t) => esc(t).replace(/\(\s*안\s*제[^()]*\)/g, (g) => g.replace(/제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/g, (m, n, sub) => `<button type="button" class="case-ln" data-art="${esc(name)} 제${n}조${sub ? '의' + sub : ''}">${m}</button>`));
  bills.one(x).then((d) => {
    if (!box.isConnected) return;
    const t = String(d.summary || '').replace(/\r/g, '').trim();
    if (d.summary === null) sum.innerHTML = '<p class="cs-wait">지금은 국회 의안정보에서 제안이유를 불러오지 못했습니다. 잠시 뒤 다시 열거나 의안정보시스템에서 원문을 보세요.</p>';
    else sum.innerHTML = t ? t.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean).map((p) => (/^(?:제안이유(?:\s*및\s*주요내용)?|주요내용|참고사항)$/.test(p) ? `<h4>${esc(p)}</h4>` : `<p>${linkArts(p)}</p>`)).join('') : '<p class="cs-wait">제안이유 및 주요내용이 아직 실리지 않았습니다. 의안정보시스템에서 원문을 보세요.</p>';
    if (d.minutes && d.minutes.length) {
      min.hidden = false;
      min.innerHTML = `<h4>회의록</h4><div class="bill-mins">${d.minutes.map((m) => `<a href="${esc(m.url)}" target="_blank" rel="noopener"><b>${esc(m.kind || '회의록')}</b><span>${esc([m.sess, m.dgr].filter(Boolean).join(' '))} · ${esc(bills.dateText(m.date))}</span></a>`).join('')}</div>`;
    }
  }, (e) => { if (box.isConnected) sum.innerHTML = `<p class="cs-wait">${offline(e) ? unreached('제안이유 및 주요내용을 볼 수 있습니다', '열어 보세요') : '지금은 국회 의안정보에 닿지 않습니다. 의안정보시스템에서 원문을 보세요.'}</p>`; });
  sheetLinks(box, null, null, null);
}
// a court's judgment (대법원 and the other courts, as 법제처 publishes them); a number two courts share shows the other too
const COURT_NONE = '법제처가 공개한 판결 가운데 이 사건이 없습니다. 공개되지 않은 판결이거나 번호가 다를 수 있습니다.';
/* A judgment 법제처 has not published (2010두23859, in 판례공보 but not in the public set): what can be known of it all the same.
   Its court and day, as the question or the shelf's papers cite it ('대법원 2011. 6. 30. 선고', in a line held from the start);
   the ways to it — 국가법령정보센터's search and 대법원 종합법률정보 (its number copied on the way, to paste there); and, in a sheet,
   the shelf's papers that cite it with their pages. */
const GLAW = 'https://glaw.scourt.go.kr/';
const COURT_AT = /(대법원|대판|[가-힣]{2,10}(?:고등법원|지방법원|행정법원|가정법원|특허법원|고법|지법|행법)(?:\s?[가-힣]{2,4}지원)?)[\s,]*((?:19|20)\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?\s*(선고|자)?\s*$/;
function courtDayIn(texts) {   // the court and day most of the texts put just before the number
  const n = new Map();
  for (const t of texts) {
    const m = COURT_AT.exec(String(t || '').replace(/\s+/g, ' ').slice(-60)); if (!m) continue;
    const k = `${m[1] === '대판' ? '대법원' : m[1]} ${m[2]}. ${Number(m[3])}. ${Number(m[4])}. ${m[5] || '선고'}`;
    n.set(k, (n.get(k) || 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0] || null;
}
const courtMissHtml = (ref, no, why, said) => `<div class="law-card court-miss"><div class="lc-h"><b>${esc(ref)}</b><span>법원 판결</span></div>
  <p class="law-note cm-day">${said ? esc(said) : '&nbsp;'}</p><p class="law-note">${why}</p>
  <div class="lc-acts"><a class="btn ghost small" href="${laws.lawGoKr.precSearch(no)}" target="_blank" rel="noopener">국가법령정보센터에서 검색</a><a class="btn ghost small" href="${GLAW}" target="_blank" rel="noopener" data-copy-no="${esc(no)}">대법원 종합법률정보에서 찾기</a></div></div>`;
function courtDayLine(box, q, results) {
  const line = $('.cm-day', box); if (!line) return;
  const fromQ = courtDayIn([String(q || '').replace(/\s*\d{2,4}\s*[가-힣]{1,3}\s*\d+[\s\S]*$/, '')]);   // ('대법원 2011. 6. 30. 선고 2010두23859 판결' pasted)
  const fromP = results && results.length ? courtDayIn(results.flatMap((r) => r.snips.map((x) => x.a))) : null;
  const hit = fromQ || fromP;
  if (hit) setText(line, fromQ ? hit[0] : `${hit[0]} · 내 서재 논문 ${results.length}편이 인용한 대로`);
}
async function courtCard(box, q, live, mineP = null, asked = '') {
  const ref = q.court && q.court !== '대법원' ? `${q.court} ${q.no}` : q.no;
  const plain = (why) => courtMissHtml(ref, q.no, why, '');
  box.innerHTML = `<h2 class="sec-h">법원 판결</h2><p class="none">판결을 찾는 중…</p>`;
  try {
    const d = await laws.courtCase(ref);
    if (!live()) return;
    const head = d && (d.points || d.summary || d.reason || '').split('\n').find((l) => l.trim()) || '';
    box.innerHTML = d ? `<h2 class="sec-h">법원 판결</h2><button type="button" class="case-card" data-court-open="${esc(ref)}"><b>${esc(d.name || d.no)}</b><span>${esc(laws.courtCite(d))}</span>${head ? `<em>${esc(head.length > 160 ? head.slice(0, 158) + '…' : head)}</em>` : ''}</button>`
      + (d.others && d.others.length ? `<p class="law-note court-also">같은 번호의 다른 법원 판결 ${d.others.map((c) => `<button type="button" class="law-eg" data-cq="${esc(c + ' ' + d.no)}">${esc(c)}</button>`).join(' · ')}</p>` : '') : plain(COURT_NONE);
    if (!d) { courtDayLine(box, asked, null); const mp = mineP && mineP(); if (mp) mp.then((rs) => { if (live() && box.isConnected) courtDayLine(box, asked, rs); }); }
  } catch (e) {
    if (live()) { box.innerHTML = plain(lawErr(e)); courtDayLine(box, asked, null); const mp = mineP && mineP(); if (mp) mp.then((rs) => { if (live() && box.isConnected) courtDayLine(box, asked, rs); }); }
  }
}
function lawLinkCard(a, why, e) {
  const label = `${a.law} ${laws.artLabel(a)}${a.para ? ` 제${a.para}항` : ''}`;
  const msg = why === 'nolaw' ? '현행 법령 가운데 이 이름의 법령이 없습니다. 폐지되었거나 이름이 바뀐 법률일 수 있습니다 — 정식 이름이나 약칭으로 찾아 보세요.'
    : why === 'repealed' ? `폐지된 법률입니다${goneText(e)}. 이 조문을 다룬 판례는 아래 ‘이 조문의 판례’에서 볼 수 있습니다.`
    : '지금은 이 조문을 불러오지 못했습니다.';
  return `<div class="law-card"><div class="lc-h"><b>${esc(label)}</b></div>
    <p class="law-note">${msg}</p>
    <div class="lc-acts"><a class="btn ghost small" href="${laws.lawGoKr.search(a.law === '헌법' ? '대한민국헌법' : a.law)}" target="_blank" rel="noopener">국가법령정보센터에서 검색</a></div></div>`;
}
// the shelf's own papers that name this case (by its number), each with the page to jump to — added inside a case sheet
// (the number as papers write it is found in its 등 form too — '2007헌마1001등' holds '2007헌마1001', and a longer number
// never matches a shorter one: pageHits. onDone(results): what was found, once every paper is read — 평석 찾기 puts these first)
function appendShelfCites(box, term, label, what = '이 결정을', onDone = null, at = null) {
  if (!term || box.dataset.cited) return null;
  box.dataset.cited = '1';
  const body = $('.cs-body', box); if (!body) return null;
  // (its place at the sheet's foot from the start — how far the reading has come, then how many papers, or one line saying
  // that none of them does: the section never goes away)
  const sec = el('section', 'cs-sec cs-shelf');
  sec.innerHTML = `<h4>${esc(label)} <span class="sec-n">찾는 중</span></h4><div class="cs-cites"></div><p class="cs-wait cs-none" hidden></p>`;
  if (at && at.parentNode === body) body.insertBefore(sec, at); else body.appendChild(sec);
  const list = $('.cs-cites', sec), n = $('.sec-n', sec), none = $('.cs-none', sec);
  const q = term.replace(/\s+/g, '');
  pageHits([q], () => box.isConnected, (results, done, all) => {
    setText(n, done < all ? `찾는 중 ${done}/${all}` : results.length ? `${results.length}편` : '없음');
    patchList(list, results.slice(0, 20), (r) => r.f.id, (r) => `<div class="cs-cite"><b>${esc(stem(r.f.name))}</b>${snipsHtml(r, term)}</div>`);
    const nt = done === all && !results.length ? (all ? `내 서재 ${all}편에는 ${what} 인용한 곳이 없습니다` : '본문을 읽은 논문이 아직 없습니다') : '';
    setText(none, nt); if (none.hidden !== !nt) none.hidden = !nt;
    if (done === all && onDone) { const f = onDone; onDone = null; f(results); }
  });
  box.addEventListener('click', (e) => { const o = e.target.closest('.cs-cites [data-open]'); if (o) { leaveSheet(); openFile(o.dataset.open, { page: Number(o.dataset.page), query: o.dataset.q }); } });
  return sec;
}
/* 평석 찾기: at the foot of a decision's or a judgment's sheet, the papers written on the case — the shelf's own first, then
   those the KCI index and 국회도서관 hold (pfind.aboutCase: a title or an abstract naming its number), eight at most, the rest
   one tap away in 논문 찾기. Its head is there from the start and stays ('찾지 못했습니다' when none); it is asked once the
   section comes into view (a sheet opened and closed asks the library nothing). */
let aboutIO = null;
function aboutSec(box, no) {
  if (!no || box.dataset.about || typeof pfind.aboutCase !== 'function') return;
  box.dataset.about = '1';
  const body = $('.cs-body', box); if (!body) return;
  const sec = el('section', 'cs-sec cs-about');
  sec.innerHTML = `<h4>이 사건을 다룬 논문 <span class="sec-n"></span></h4><div class="list law-list cs-about-l"></div><p class="cs-wait cs-none" hidden></p><p class="cs-about-go"><button type="button" class="law-eg cs-about-more">논문 찾기에서 ‘${esc(no)}’ 찾아보기 ›</button></p>`;
  body.appendChild(sec);
  const n = $('.sec-n', sec), list = $('.cs-about-l', sec), none = $('.cs-none', sec);
  const recs = [];
  const go = () => {
    setText(n, '찾는 중');
    const shelf = shelfTitles();
    const onShelf = (r) => shelf.get(papers.norm(papers.mainTitle(r.t || '')));
    pfind.aboutCase(no, { shelf: (r) => !!onShelf(r) }).then((rows) => {
      if (!sec.isConnected) return;
      const shown = rows.slice(0, 8);
      recs.push(...shown);
      setText(n, rows.length ? `${rows.length >= 20 ? '20편 넘게' : rows.length + '편'}` : '');
      list.innerHTML = shown.map((r, i) => {
        const f = r.onShelf ? onShelf(r) : null;
        const who = (r.a || []).length > 3 ? r.a.slice(0, 3).join('·') + ' 외' : (r.a || []).join('·');
        const iss = kciIssue({ journal: r.journal, v: r.v, i: r.i }), when = kciWhen({ y: r.y, m: r.m });
        const meta = [who, [r.journal, iss].filter(Boolean).join(' '), when].filter(Boolean).map(esc).join(' · ');
        return `<button type="button" class="lrow pp-row" data-about="${i}"${f ? ` data-about-file="${f.id}"` : ''}><b>${esc(r.t)}${f ? ' <em class="pp-mine">내 서재</em>' : ''}${r.open ? ' <em class="pp-open">원문 공개</em>' : ''}</b><span>${meta}</span></button>`;
      }).join('');
      if (rows.length > shown.length) setText($('.cs-about-more', sec), `논문 찾기에서 ‘${no}’ 더 보기 · ${rows.length}편 ›`);
      const nt = rows.length ? '' : '이 사건번호를 제목이나 초록에 쓴 논문을 찾지 못했습니다';
      setText(none, nt); if (none.hidden !== !nt) none.hidden = !nt;
    });
  };
  if (!aboutIO) aboutIO = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { aboutIO.unobserve(e.target); const f = e.target._go; e.target._go = null; if (f) f(); } }, { rootMargin: '240px' });
  sec._go = go; aboutIO.observe(sec);
  sec.addEventListener('click', (e) => {
    if (e.target.closest('.cs-about-more')) { leaveSheet(); paperGo(no); return; }
    const b = e.target.closest('[data-about]'); if (!b) return;
    if (b.dataset.aboutFile) { leaveSheet(); openFile(b.dataset.aboutFile); return; }
    const r = recs[Number(b.dataset.about)]; if (r) openPaper(r);
  });
}
function courtSheet(no, trail = []) {
  const box = sheetRec({ kind: 'court', no, trail }, `<div class="cs-head">${trail.length ? `<button class="ib cs-back" aria-label="뒤로">${I.back}</button>` : ''}<h2>${esc(no)}</h2></div><div class="cs-body"><p class="cs-wait">불러오는 중…</p></div><div class="row-btns"><button class="btn ghost cs-copy" hidden>인용 복사</button></div>`);
  box.classList.add('case-sheet');
  const body = $('.cs-body', box), h = $('h2', box), cp = $('.cs-copy', box);
  const bare = (laws.courtQuery(no) || { no }).no;
  // (not among the published judgments, or not reached: its day as the papers cite it, the two ways to it, and the papers)
  const missing = (why) => {
    body.innerHTML = courtMissHtml(no, bare, why, '');
    courtDayLine(body, no, null);
    appendShelfCites(box, bare, '내 서재에서 이 판결을 인용한 곳', '이 판결을', (rs) => { if (box.isConnected) courtDayLine(body, no, rs); });
    aboutSec(box, bare);
  };
  laws.courtCase(no).then((d) => {
    if (!box.isConnected) return;
    if (!d) { missing(COURT_NONE); return; }
    h.textContent = laws.courtCite(d); body.innerHTML = cases.judgmentView(d); cases.wireCase(body, d);
    linkByl(body, '', d.date || '');
    cp.hidden = false; cp.onclick = () => copyText(laws.courtCite(d));
    appendShelfCites(box, bare, '내 서재에서 이 판결을 인용한 곳', '이 판결을');
    aboutSec(box, bare);
  }, (e) => { if (box.isConnected) missing(lawErr(e)); });
  sheetLinks(box, (to) => courtSheet(to, [...trail, no]), no, () => courtSheet(trail[trail.length - 1], trail.slice(0, -1)));
}
// links inside a decision or judgment: another decision or judgment opens in the sheet; an article, in 법령
function sheetLinks(box, again, self, back) {
  box.addEventListener('click', (e) => {
    const cn = e.target.closest('[data-copy-no]'); if (cn) { copyText(cn.dataset.copyNo, cases.COPY_NO || '검색 창에 사건번호를 붙여 넣으세요'); return; }   // (and the link opens)
    const ln = e.target.closest('[data-case]'); if (ln) { if (ln.dataset.case !== self) caseSheet(ln.dataset.case); return; }
    const lc = e.target.closest('[data-court]'); if (lc) { if (lc.dataset.court !== self) courtSheet(lc.dataset.court); return; }
    const la = e.target.closest('[data-art]'); if (la) { leaveSheet(); lawGo(la.dataset.art, 'law', oldOf(la)); return; }
    if (back && e.target.closest('.cs-back')) back();
  });
}
// old: { old, by } for an article opened from a citation of its old text (cases.linkCases' data-old): kept with this
// question (S.lold, and in the history with it), so its card says the text shown is today's — any other question drops it
function lawGo(q, kind = 'law', old = null) {   // to 법령 (or 판례), asking q
  noteScroll(); clearTimeout(S.qT); clearTimeout(S.sugT);
  S.view = { kind, folder: null }; S.q = ''; S.select = null; if (kind === 'cases') S.cq = q; else S.lq = q; $('.find input').value = '';
  S.lold = kind === 'law' && old ? { q, ...old } : null;
  render(); $('.content').scrollTop = 0; window.scrollTo(0, 0); nav();
}
const oldOf = (el) => (el && el.dataset.old ? { old: el.dataset.old, by: el.dataset.by || '' } : null);
// a holding of the digest, by its heading and its own title (cases.holding: the heading alone answers all its holdings, the
// first not being the one tapped); q, the words its list was asked, tells apart holdings of one title. trail: the holdings
// opened before it here ([seq, title, q]), for ‹
function holdingSheet(seq, title, q, trail = []) {
  const box = sheetRec({ kind: 'holding', seq, title, q: q || '', trail }, `<div class="cs-head">${trail.length ? `<button class="ib cs-back" aria-label="뒤로">${I.back}</button>` : ''}<h2>결정요지</h2></div><div class="cs-body"><p class="cs-wait">불러오는 중…</p></div>`);
  box.classList.add('case-sheet');
  const body = $('.cs-body', box);
  cases.holding(seq, title, q).then((h) => {
    if (!box.isConnected) return;
    body.innerHTML = cases.holdingView(h); cases.wireHolding(body);
  }, (e) => { if (box.isConnected) body.innerHTML = `<p class="cs-wait">${lawErr(e)}</p>`; });
  box.addEventListener('click', (e) => {
    const o = e.target.closest('[data-holding]'); if (o) { holdingSheet(o.dataset.holding, o.dataset.title, '', [...trail, [seq, title, q]]); return; }
    const ln = e.target.closest('[data-case]'); if (ln) { caseSheet(ln.dataset.case, [], hintOf(ln)); return; }
    const lc = e.target.closest('[data-court]'); if (lc) { courtSheet(lc.dataset.court); return; }
    const la = e.target.closest('[data-art]'); if (la) { leaveSheet(); lawGo(la.dataset.art, 'law', oldOf(la)); return; }
    if (e.target.closest('.cs-back')) { const [s, t, qq] = trail[trail.length - 1]; holdingSheet(s, t, qq, trail.slice(0, -1)); }
  });
}
// a 헌재 decision. hint: what the line it was opened from knows of it (caseRow) — a second way to it, and what is shown when
// the court's data has nothing. 인용 복사 copies the full form (판례집 or 공보 with it) once its book is read
function caseSheet(no, trail = [], hint = {}) {
  const box = sheetRec({ kind: 'case', no, trail, hint }, `<div class="cs-head">${trail.length ? `<button class="ib cs-back" aria-label="뒤로">${I.back}</button>` : ''}<h2>헌재 ${esc(no)}</h2></div><div class="cs-body"><p class="cs-wait">불러오는 중…</p></div><div class="row-btns"><button class="btn ghost cs-copy" hidden>인용 복사</button></div>`);
  box.classList.add('case-sheet');
  const body = $('.cs-body', box), h = $('h2', box), cp = $('.cs-copy', box);
  const show = (d) => {
    if (!box.isConnected) return;
    h.textContent = cases.cite(d); body.innerHTML = cases.caseView(d); linkByl(body, '');
    cases.wireCase(body, d, { hint, copy: copyText, onBook: () => { cp.hidden = false; cp.onclick = () => { const c = typeof cases.citeCopy === 'function' ? cases.citeCopy(d) : { text: cases.citeFull(d), note: cases.citeNote(d) }; copyText(c.text, c.incomplete ? c.note || '판례집 권·쪽 없이 복사했습니다' : c.note); }; } });
    if (!d.pending) { appendShelfCites(box, no, '내 서재에서 이 결정을 인용한 곳'); aboutSec(box, no); }   // (after the preview: its body is replaced)
  };
  cases.decision(no, show, hint).then((d) => {
    if (!box.isConnected) return;
    if (d) { show(d); return; }
    // (a citation needs its day: from the line opened, or as the digest cites it — with its book then: missingCites)
    const mc = cases.missingCites(no, hint);
    h.textContent = mc.short; body.innerHTML = cases.missingView(no, hint, undefined, { holdings: true });
    cp.hidden = !mc.dated; cp.onclick = () => copyText(mc.full);
    appendShelfCites(box, no, '내 서재에서 이 결정을 인용한 곳'); aboutSec(box, no);   // (the shelf's papers name it all the same)
  }, (e) => {
    // the court's service did not answer: what the line opened knows (name, day, field) and the ways to read it elsewhere stay
    if (!box.isConnected) return;
    const was = cases.missOf(no) || {}, mc = cases.missingCites(no, hint, was);   // (what an earlier answer told of it, if any)
    h.textContent = mc.short;
    body.innerHTML = cases.missingView(no, hint, was, { failed: offline(e) ? unreached('결정 내용을 볼 수 있습니다', '열어 보세요') : '지금은 헌법재판소 판례정보에서 결정을 불러오지 못했습니다. 잠시 뒤 다시 열어 보세요.' });
    cp.hidden = !mc.dated; cp.onclick = () => copyText(mc.full);
    appendShelfCites(box, no, '내 서재에서 이 결정을 인용한 곳'); aboutSec(box, no);   // (this device's papers answer without the court)
  });
  box.addEventListener('click', (e) => {
    const cn = e.target.closest('[data-copy-no]'); if (cn) { copyText(cn.dataset.copyNo, cases.COPY_NO); return; }   // (and the link opens)
    const ho = e.target.closest('[data-holding]'); if (ho) { holdingSheet(ho.dataset.holding, ho.dataset.title, ho.dataset.q); return; }   // (its holdings, when the decision is missing)
    const ln = e.target.closest('[data-case]');
    if (ln) { if (ln.dataset.case !== no) caseSheet(ln.dataset.case, [...trail, no], hintOf(ln)); return; }
    const lc = e.target.closest('[data-court]'); if (lc) { courtSheet(lc.dataset.court); return; }
    const la = e.target.closest('[data-art]'); if (la) { leaveSheet(); lawGo(la.dataset.art, 'law', oldOf(la)); return; }
    if (e.target.closest('.cs-back')) caseSheet(trail[trail.length - 1], trail.slice(0, -1));
  });
}
/* ---------- 별표 ----------
   '별표 23과 같다', '[별표 15] 행정처분기준', '같은 법 시행규칙 별표 5의2': each one a link (laws.bylRefs: the law it belongs to
   is the one named before it, else the law of the text — an article card's own), opening a sheet with the 별표's title and its
   원문 at 국가법령정보센터 (PDF, HWP: laws.byl). A 별표 a judgment cites as it read then (구 …, '… 개정되기 전의 것') is looked
   for as it was on that day, and said to be the version of then. Links L3's own text makes (cases.linkCases) are left as made. */
function linkByl(root, law, day = '') {   // day: the judgment's own, for a 별표 it cites as it read then (구 …)
  if (!root || typeof laws.bylRefs !== 'function' || !/별표/.test(root.textContent || '')) return;
  // (read as one text — a law's name is often a link of its own just before the 별표, '「식품위생법 시행규칙」 [별표 15]' — and
  // a 별표 made a link only where it lies whole in plain text)
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; let full = '';
  for (let n = walk.nextNode(); n; n = walk.nextNode()) { nodes.push({ n, at: full.length, ok: !(n.parentElement && n.parentElement.closest('a, button, [data-byl], summary, h2, h4')) }); full += n.nodeValue; }
  let refs; try { refs = laws.bylRefs(full, law || ''); } catch (e) { refs = []; }
  if (!refs.length) return;
  const byNode = new Map();
  for (const b of refs) {
    const x = nodes.find((y) => y.ok && b.i >= y.at && b.i + b.len <= y.at + y.n.nodeValue.length);
    if (!x) continue;
    if (!byNode.has(x)) byNode.set(x, []);
    byNode.get(x).push({ ...b, i: b.i - x.at });
  }
  for (const [x, bs] of byNode) {
    const t = x.n.nodeValue, frag = document.createDocumentFragment();
    let at = 0;
    for (const b of bs.sort((p, q) => p.i - q.i)) {
      if (b.i < at) continue;
      frag.appendChild(document.createTextNode(t.slice(at, b.i)));
      const a = document.createElement('a');
      a.href = '#'; a.setAttribute('role', 'button'); a.dataset.byl = `${b.law}|${b.n}`; if (b.old) { a.dataset.bylOld = b.old; if (day) a.dataset.bylDay = day; }
      a.textContent = t.slice(b.i, b.i + b.len);
      frag.appendChild(a); at = b.i + b.len;
    }
    frag.appendChild(document.createTextNode(t.slice(at)));
    x.n.replaceWith(frag);
  }
}
async function bylSheet(spec, old = '', judged = '') {
  const [law, n] = String(spec || '').split('|');
  if (!law || !n) return;
  // (the day the citation names; a bare 구 — '구 식품위생법 시행규칙 [별표 15]' — by the judgment's own day: the 별표 as it read then)
  const named = dotDayOf(old), day = named || (old ? dotDayOf(judged) : ''), before = !!named && / 전(?:의 것)?\s*$|전의\s*것|개정\s*전|되기\s*전/.test(old || '');
  const dash = (t) => { const m = /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/.exec(t || ''); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : ''; };
  // (from a decision's or a judgment's sheet: ‹ goes back to it, where it was)
  const st = history.state, from = !S.readerId && st && st.sheet && st.rec && document.querySelector('.sheet-wrap') ? { ...st.rec, scroll: (document.querySelector('.sheet-wrap .sheet') || {}).scrollTop || 0 } : null;
  const box = sheet(`<div class="cs-head">${from ? `<button class="ib cs-back" aria-label="뒤로">${I.back}</button>` : ''}<h2>[별표 ${esc(n)}]</h2></div><div class="cs-body"><p class="cs-meta">${esc(law)}</p><p class="cs-wait">별표를 찾는 중…</p></div>`);
  box.classList.add('case-sheet', 'byl-sheet');
  if (from) $('.cs-back', box).onclick = () => reopenSheet(from);
  const body = $('.cs-body', box), h = $('h2', box);
  const b = typeof laws.byl === 'function' ? await laws.byl(law, n, day ? { date: day, before } : {}).catch(() => null) : null;
  if (!box.isConnected) return;
  const search = (b && b.search) || laws.lawGoKr.law(law);
  if (b && b.title) h.textContent = b.title;
  const links = (b && b.links) || [];
  const at = b && b.at ? `${histDate(b.at)} 공포된 판의 별표` : '';
  // (a 구 별표 found as it read on its day, or — when that version is not in the record — today's, said to be today's)
  const then = !!(old && day && b && b.at && b.at <= (dash(day) || '9'));
  if (old && !then && b && b.title) h.textContent = `[별표 ${n}] (지금의 별표)`;
  body.innerHTML = `<p class="cs-meta">${esc([(old ? '구 ' : '') + law, old && !then && b && b.at ? `지금의 판 (${histDate(b.at)} 공포)` : at].filter(Boolean).join(' · '))}</p>
    ${old ? `<p class="lc-ahead lc-old">${then ? `인용된 것은 ${esc(day)} 무렵의 별표입니다 · 그때의 판을 보여 드립니다` : `인용된 것은 개정 전(구법)의 별표입니다 · 아래는 지금의 [별표 ${esc(n)}]${b && b.name ? `(${esc(b.name)})` : ''}로, 그때와 다른 표일 수 있습니다`}</p>` : ''}
    ${b && b.gone ? '<p class="cs-wait">이 판에서는 삭제된 별표입니다.</p>' : ''}
    ${links.length ? `<p class="cs-wait">별표는 표와 그림이 많아 국가법령정보센터의 원문(PDF·HWP)으로 봅니다</p><div class="cs-out byl-links">${links.map((x) => `<a class="btn ghost small" href="${safeHref(x.url)}" target="_blank" rel="noopener">원문 ${x.kind === 'pdf' ? 'PDF' : 'HWP'}</a>`).join('')}</div>`
      : `<p class="cs-wait">이 별표의 원문 주소를 찾지 못했습니다 · 국가법령정보센터의 이 법령 화면에서 ‘별표·서식’을 보세요</p>`}
    <p class="cs-out"><a class="btn ghost small" href="${safeHref(search)}" target="_blank" rel="noopener">국가법령정보센터에서 ${esc(law)} 보기</a>${old ? `<a class="btn ghost small" href="${laws.lawGoKr.oldNew(law)}" target="_blank" rel="noopener">신구법 비교</a>` : ''}</p>`;
}
document.addEventListener('click', (e) => {
  const a = e.target && e.target.closest && e.target.closest('[data-byl]');
  if (!a) return;
  e.preventDefault(); e.stopPropagation();
  bylSheet(a.dataset.byl, a.dataset.bylOld || '', a.dataset.bylDay || '');
}, true);

// note: what the copied text leaves unsaid, said with it ('판례집 상·하 권은 확인하지 못했습니다')
async function copyText(t, note = '') {
  try { await navigator.clipboard.writeText(t); toast(note ? `복사했습니다 · ${note}` : '복사했습니다', note ? 4200 : 2600); } catch (e) { toast('복사하지 못했습니다'); }
}

const textAsking = new Map();   // a paper's texts asked for once at a time (찾기 and the background fetch share one answer)
let texted = new Set();         // the papers whose texts are kept on this device
async function textOf(f) {
  const t = await store.get('texts', f.id);
  if (t && (!f.ocr || t.ocr === f.ocr)) return t;   // a scan read since then: its texts now have the words
  if (!navigator.onLine) return t || null;
  if (!textAsking.has(f.id)) {
    textAsking.set(f.id, (async () => {
      const s = await pdfkit.gunzipJSON(await api.getMeta(f.id, 'text'));
      await store.put('texts', f.id, s); texted.add(f.id);
      notePaper(f.id, s);
      return s;
    })().finally(() => textAsking.delete(f.id)));
  }
  return textAsking.get(f.id);
}
// the paper being opened comes first: what is fetched in the background waits until its first pages are drawn
let fgUntil = 0;
async function fgWait() { while (Date.now() < fgUntil) await new Promise((r) => setTimeout(r, 250)); }

/* ---------- thumbnails: from this device, else fetched once ---------- */
let thumbIO = null;
function lazyThumbs() {
  if (!thumbIO) thumbIO = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { thumbIO.unobserve(e.target); loadThumb(e.target); } }, { rootMargin: '300px' });
  document.querySelectorAll('[data-thumb]:not([data-done])').forEach((t) => {
    t.dataset.done = '1';
    const id = t.dataset.thumb; if (!id) return;
    const url = thumbUrls.get(id);
    if (url) { t.style.backgroundImage = `url("${url}")`; t.classList.add('has'); return; }   // held already: drawn at once, so a list drawn again does not blink
    thumbIO.observe(t);
  });
}
const thumbUrls = new Map();
async function loadThumb(span) {
  const id = span.dataset.thumb;
  try {
    let url = thumbUrls.get(id);
    if (!url) {
      let b = await store.get('thumbs', id);
      if (!b) { if (!navigator.onLine) return; await fgWait(); b = await api.getMeta(id, 'thumb'); await store.put('thumbs', id, b); }
      url = URL.createObjectURL(b); thumbUrls.set(id, url);
    }
    span.style.backgroundImage = `url("${url}")`; span.classList.add('has');
  } catch (e) { /* plain placeholder */ }
}

/* ---------- clicks in the list ---------- */
let pressedAt = 0;
function onContentClick(e) {
  if (Date.now() - pressedAt < 800) return;   // the tap that ended a long press
  const t = e.target;
  const co = t.closest('[data-case-open]'); if (co) { caseSheet(co.dataset.caseOpen, [], hintOf(co)); return; }
  const cc = t.closest('[data-court-open]'); if (cc) { courtSheet(cc.dataset.courtOpen); return; }
  const il = t.closest('.case-ln');   // a citation inside an article's text: the decision, the judgment, or that article
  if (il) { if (il.dataset.case) caseSheet(il.dataset.case); else if (il.dataset.court) courtSheet(il.dataset.court); else if (il.dataset.art) lawGo(il.dataset.art, 'law', oldOf(il)); return; }
  const ty = t.closest('[data-tly]'); if (ty) { tlGo(ty); return; }
  const cno = t.closest('[data-copy-no]'); if (cno) { copyText(cno.dataset.copyNo, cases.COPY_NO || '검색 창에 사건번호를 붙여 넣으세요'); return; }   // (and the link opens)
  const pq = t.closest('[data-pq]'); if (pq) { paperGo(pq.dataset.pq); return; }
  const pw = t.closest('[data-who]'); if (pw) { researcherSheet(pw.dataset.who, pw.dataset.aid); return; }
  const pp = t.closest('[data-paper]'); if (pp) { const row = ppRows.get(pp.dataset.paper); if (row) paperSheet(row); return; }
  const rcd = t.closest('[data-rc-del], [data-rc-clear]');
  if (rcd) { if (rcd.dataset.rcClear) forgetRecent(rcd.dataset.rcClear, null, rcd); else forgetRecent(rcd.dataset.rcDel, rcd.dataset.rcQ, rcd); return; }
  const lq = t.closest('[data-lq], [data-cq]'); if (lq) { if (lq.dataset.cq !== undefined) lawGo(lq.dataset.cq, 'cases'); else lawGo(lq.dataset.lq); return; }   // a law (법령) or its cases (판례)
  const ho = t.closest('[data-holding]'); if (ho) { holdingSheet(ho.dataset.holding, ho.dataset.title, ho.dataset.q); return; }
  const bl = t.closest('[data-bill]'); if (bl) { const b = billRows.get(bl.dataset.bill); if (b) billSheet(b.x, b.law); return; }
  const jn = t.closest('.pp-jn'); if (jn) { openJournal(jn.dataset.jn, jn.dataset.jp); return; }
  const kc = t.closest('[data-kci]'); if (kc) { const x = kciRows.get(kc.dataset.kci); if (x) kciSheet(x); return; }
  if (t.closest('[data-selall]')) { pickAll(); return; }
  const mfb = t.closest('[data-mf]'); if (mfb) { setMarkFilter(mfb.dataset.mf); return; }
  if (t.closest('[data-go-trash]')) { $('.trash-btn').click(); return; }
  const ck = t.closest('[data-ck]');
  if (ck) { const row = ck.closest('.row'); if (row) { pick(row.dataset.file ? { file: row.dataset.file } : { folder: row.dataset.fid }); } return; }
  const up = t.closest('[data-t="upload"]'); if (up) { uploadBox(); return; }
  const r = t.closest('[data-restore]'); if (r) { doOps([{ op: 'restoreFile', id: r.dataset.restore }], '되살렸습니다'); return; }
  const rf = t.closest('[data-restore-folder]'); if (rf) { doOps([{ op: 'restoreFolder', id: rf.dataset.restoreFolder }], '되살렸습니다'); return; }
  const p = t.closest('[data-purge]'); if (p) { confirmBox('영구 삭제', '이 파일과 표시를 완전히 지웁니다. 되돌릴 수 없습니다.', '영구 삭제', true).then((ok) => ok && doOps([{ op: 'purgeFile', id: p.dataset.purge }], '지웠습니다')); return; }
  const pf = t.closest('[data-purge-folder]'); if (pf) { confirmBox('영구 삭제', '이 폴더와 안의 파일을 완전히 지웁니다. 되돌릴 수 없습니다.', '영구 삭제', true).then((ok) => ok && doOps([{ op: 'purgeFolder', id: pf.dataset.purgeFolder }], '지웠습니다')); return; }
  const mm = t.closest('[data-menu]'); if (mm) { const b = mm.getBoundingClientRect(); fileMenu(mm.dataset.menu, b.right, b.bottom); return; }
  const fm = t.closest('[data-fmenu]'); if (fm) { const b = fm.getBoundingClientRect(); folderMenu(fm.dataset.fmenu, b.right, b.bottom); return; }
  const sn = t.closest('[data-open]'); if (sn) { openFile(sn.dataset.open, sn.dataset.mark ? { page: Number(sn.dataset.page), mark: sn.dataset.mark } : sn.dataset.page != null ? { page: Number(sn.dataset.page), query: sn.dataset.q } : {}); return; }
  const row = t.closest('.row');
  if (!row) return;
  if (S.select) { pick(row.dataset.file ? { file: row.dataset.file } : { folder: row.dataset.fid }); return; }
  if (row.dataset.fid) { noteScroll(); S.view = { kind: 'home', folder: row.dataset.fid }; S.q = ''; $('.find input').value = ''; render(); nav(); scrollBackTo(secScroll.get(secKey()) || 0); return; }
  if (row.dataset.file && S.view.kind !== 'trash') openFile(row.dataset.file);
}
function toggleSet(set, v) { if (set.has(v)) set.delete(v); else set.add(v); }
function pick(it) {   // tick or untick one row; with nothing ticked the selection ends
  if (!S.select) S.select = { files: new Set(), folders: new Set() };
  if (it.file) toggleSet(S.select.files, it.file); else if (it.folder) toggleSet(S.select.folders, it.folder);
  if (!S.select.files.size && !S.select.folders.size) S.select = null;
  render();
}
function startSelect(first) {
  S.select = { files: new Set(), folders: new Set() };
  if (first && first.file) S.select.files.add(first.file);
  if (first && first.folder) S.select.folders.add(first.folder);
  if (navigator.vibrate) navigator.vibrate(10);
  render();
}

function onTools(e) { const b = e.target.closest('[data-t]'); if (b) toolDo(b.dataset.t, b); }
async function toolDo(t, b) {
  if (t === 'upload') uploadBox();
  else if (t === 'newfolder') {
    const name = await promptBox('새 폴더', '폴더 이름', '', '만들기');
    if (name) doOps([{ op: 'addFolder', folder: { id: 'f_' + rid(10), name, parent: S.view.folder || null } }]);
  } else if (t === 'add') {   // (a phone's ＋: what the wide bar shows as buttons)
    const k = await menu(b.getBoundingClientRect(), [['newfolder', '새 폴더'], ['upload', 'PDF 올리기'], ['-'], ['select', '여러 개 고르기']], null);
    if (k) toolDo(k, b);
  } else if (t === 'sort') {
    // (a phone: the marks to see by are here too — its list has no heading line to hold them)
    const mfs = narrow() && anyMarked() ? [['-'], ['mf:', '모든 논문 보기'], ...Object.entries(MFS).map(([k, m]) => ['mf:' + k, `${m.glyph} ${m.name()}만 보기`])] : [];
    const k = await menu(b.getBoundingClientRect(), [...SORTS, ...mfs], [S.sort, 'mf:' + markFilter]);
    if (k && k.startsWith('mf:')) setMarkFilter(k.slice(3));
    else if (k) { S.sort = k; render(); }
  } else if (t === 'select') startSelect();
  else if (t === 'endsel') { S.select = null; render(); }
  else if (t === 'selall') pickAll();
  else if (t === 'trash' && S.select) {
    const files = [...S.select.files], folders = [...S.select.folders];
    toTrash(files, folders, () => { S.select = null; });   // (picking ends once they go; Esc or 취소 on the question keeps it)
  } else if (t === 'move' && S.select) {
    const avoid = new Set(S.select.folders);
    const to = await pickFolder('옮길 곳', avoid);
    if (to === undefined) return;
    const ops = [...S.select.files].map((id) => ({ op: 'updateFile', id, set: { folder: to } })).concat([...S.select.folders].filter((id) => id !== to).map((id) => ({ op: 'moveFolder', id, parent: to })));
    S.select = null; doOps(ops, '옮겼습니다');
  } else if (t === 'empty') {
    if (await confirmBox('휴지통 비우기', '휴지통의 모든 파일과 폴더를 완전히 지웁니다. 되돌릴 수 없습니다.', '모두 지우기', true)) doOps([{ op: 'emptyTrash' }], '휴지통을 비웠습니다');
  }
}

async function fileMenu(id, x, y) {
  const f = fileById(id); if (!f) return;
  const k = await menu({ left: x, right: x, top: y, bottom: y }, [['marks', f.stars || 0], ['rename', '이름 바꾸기'], ['move', '옮기기'], ['share', '공유하기'], ['-'], ...(needsOcr(f) && isScan(f) ? [['ocr', OCR.id === f.id ? '글자 읽는 중…' : '글자 읽기 (스캔본)']] : []), ['back', '예전 표시 되살리기'], ['clear', '표시 모두 지우기', 'danger'], ['trash', '휴지통으로', 'danger']], null, { title: stem(f.name), sub: paperLineText(f) || (f.pages ? f.pages + '쪽' : '') });
  if (k && k.startsWith('g:')) { const g = Number(k.slice(2)); rate(id, g === (f.stars || 0) ? 0 : g); return; }
  if (k === 'rename') { const n = await promptBox('이름 바꾸기', '파일 이름', stem(f.name), '바꾸기', f.orig && f.orig !== f.name ? stem(f.orig) : null); if (n) doOps([{ op: 'updateFile', id, set: { name: n.endsWith('.pdf') ? n : n + '.pdf' } }]); }
  else if (k === 'move') { const to = await pickFolder('옮길 곳'); if (to !== undefined) doOps([{ op: 'updateFile', id, set: { folder: to } }], '옮겼습니다'); }
  else if (k === 'share') shareSheet(f);
  else if (k === 'clear') clearAllMarks(f);
  else if (k === 'back') marksBack(f);
  else if (k === 'ocr') { if (OCR.id === f.id) return; if (ocrRun) { toast('다른 스캔본을 읽는 중입니다. 끝나면 이어서 읽습니다'); return; } toast('글자를 읽기 시작했습니다. 쪽마다 몇 초씩 걸립니다', 4000); ocrQueue(f.id); }
  else if (k === 'trash') toTrash([id], []);
}
// to the trash: many at once, or a folder with something in it, asked first (Esc or 취소 keeps them); then 되돌리기 on the
// toast for a few seconds puts them back where they were
async function toTrash(files, folders, going = () => {}) {
  const n = files.length + folders.length; if (!n) return false;
  const inner = folders.length ? liveFiles().filter((f) => f.folder && folderPath(f.folder).some((x) => folders.includes(x.id))).length : 0;
  const full = folders.some((id) => childFolders(id).length) || inner > 0;
  if (n >= 5 || full) {
    const what = [files.length ? `파일 ${files.length}개` : '', folders.length ? `폴더 ${folders.length}개${inner ? `(안의 파일 ${inner}개 포함)` : ''}` : ''].filter(Boolean).join('와 ');
    if (!await confirmBox('휴지통으로 옮기기', `${what}를 휴지통으로 옮깁니다. 7일 안에는 휴지통에서 되살릴 수 있습니다.`, '휴지통으로', true)) return false;
  }
  going();
  const r = await doOps(files.map((id) => ({ op: 'trashFile', id })).concat(folders.map((id) => ({ op: 'trashFolder', id }))));
  if (!r) return false;
  if ((r.results || []).some((x) => !x.ok)) return true;   // (doOps said what went wrong)
  const back = folders.map((id) => ({ op: 'restoreFolder', id })).concat(files.map((id) => ({ op: 'restoreFile', id })));   // (folders first: a file goes back into its folder)
  toast(n > 1 ? `${n}개를 휴지통으로 옮겼습니다` : '휴지통으로 옮겼습니다', 8000, { label: '되돌리기', fn: () => doOps(back, '되돌렸습니다') });
  return true;
}

/* ---------- ★ △ ✕ on the cover (works offline too: kept here and sent when the internet is back) ---------- */
async function rate(id, n) {
  const f = fileById(id); if (!f) return;
  const at = Date.now();   // when it was given: the server keeps the newer of this and another device's (a ✕ given later elsewhere wins)
  const op = { op: 'updateFile', id, set: { stars: n }, at };
  f.stars = n; f.rated = n ? at : null; f.starsAt = at;   // shown at once
  if (S.reader && S.readerId === id) S.reader.setStars(n);
  render();
  const q = ((await store.get('kv', 'pendingOps')) || []).filter((x) => !(x.op === 'updateFile' && x.id === id && 'stars' in x.set));
  q.push(op); await store.put('kv', 'pendingOps', q); await store.put('kv', 'index', S.index);
  flushOps();
}
let flushing = null;
async function flushOps() {   // changes made without internet, in order, each with its time: the server keeps whichever is newer
  if (flushing || !navigator.onLine) return flushing;
  flushing = (async () => {
    let left = [];
    try {
      const q = (await store.get('kv', 'pendingOps')) || [];
      if (!q.length) return;
      // (each with when it is sent, by this device's clock as its at is: the server takes the mark's age from the two, so a
      // device clock running slow or fast does not matter)
      const sent = Date.now();
      const r = await api.ops(q.map((o) => (o.at ? { ...o, sent } : o)));
      // (what the server adds to this device's times: it wrote these at index.updated and took each mark as given at
      // index.updated − (sent − at), i.e. at + this. applyPending sets a mark still queued beside the server's so, and a
      // mark given just after another one on its way is not taken for the older)
      if (r.index && Number.isFinite(r.index.updated)) clockSkew = r.index.updated - sent;
      // what was sent goes from the queue, and only that: a mark given meanwhile took its file's earlier one's place in the
      // queue (rate), so the queue is not just longer — counting off q.length lost that newer mark
      const gone = q.map((o) => JSON.stringify(o));
      left = ((await store.get('kv', 'pendingOps')) || []).filter((o) => { const i = gone.indexOf(JSON.stringify(o)); if (i < 0) return true; gone.splice(i, 1); return false; });
      await store.put('kv', 'pendingOps', left);
      S.index = r.index; applyPending(left); await store.put('kv', 'index', S.index); syncTags.lib = ''; noteGone();
      if (S.reader) { renderUsage(); readerSync(); } else renderBg();
    } catch (e) { left = []; /* kept; sent later */ } finally { flushing = null; }
    if (left.length) flushOps();   // (given while these were on their way: sent now, not at the next return to the app)
  })();
  return flushing;
}
let clockSkew = 0;
function applyPending(q) {   // (a mark another device gave after this one was queued stays: the server keeps it too)
  for (const o of q || []) if (o.op === 'updateFile') { const f = fileById(o.id); if (f && 'stars' in o.set && !(o.at && (f.starsAt || f.rated || 0) > o.at + clockSkew)) f.stars = o.set.stars; }
}

/* ---------- clear every mark in a file (the PDF itself is untouched); undo from the toast ---------- */
async function clearAllMarks(f) {
  const all = await loadMarks(f.id);
  const live = all.filter((m) => !m.del);
  if (!live.length) { toast('지울 표시가 없습니다'); return; }
  if (!await confirmBox('표시 모두 지우기', `「${stem(f.name)}」의 표시(밑줄·형광펜) ${live.length}개를 모두 지웁니다. PDF 원본은 그대로입니다.`, '모두 지우기', true)) return;
  const t = Date.now();
  const next = all.map((m) => (m.del ? m : { id: m.id, del: true, t }));
  await saveMarks(f.id, next);
  if (S.reader && S.readerId === f.id) S.reader.setRemoteMarks(next);
  toast(`표시 ${live.length}개를 지웠습니다`, 9000, { label: '되돌리기', fn: async () => {
    const rec = await store.get('marks', f.id);
    const back = mergeMarks(rec ? rec.marks : next, live.map((m) => ({ ...m, t: Date.now() })));
    await saveMarks(f.id, back);
    if (S.reader && S.readerId === f.id) S.reader.setRemoteMarks(back);
    toast('되돌렸습니다');
  } });
}
async function folderMenu(id, x, y) {
  const f = folderById(id); if (!f) return;
  const k = await menu({ left: x, right: x, top: y, bottom: y }, [['rename', '이름 바꾸기'], ['move', '옮기기'], ['-'], ['trash', '휴지통으로', 'danger']], null, { title: f.name, sub: '폴더' });
  if (k === 'rename') { const n = await promptBox('폴더 이름 바꾸기', '폴더 이름', f.name, '바꾸기'); if (n) doOps([{ op: 'renameFolder', id, name: n }]); }
  else if (k === 'move') { const to = await pickFolder('옮길 곳', new Set([id])); if (to !== undefined && to !== id) doOps([{ op: 'moveFolder', id, parent: to }], '옮겼습니다'); }
  else if (k === 'trash') toTrash([], [id]);
}

// (a change the server is slow to take says so after half a second — '저장하는 중…' — and the same change pressed again while
// the first is on its way is not sent twice: two folders of one name from one impatient tap)
const opsBusy = new Set();
async function doOps(ops, done) {
  if (noNet()) { toast(unreached('할 수 있습니다')); return false; }
  const key = JSON.stringify(ops);
  if (opsBusy.has(key)) return false;
  opsBusy.add(key);
  let slowShown = false;
  const slow = setTimeout(() => { slowShown = true; toast('저장하는 중…', 20000); }, 500);
  const settle = () => { clearTimeout(slow); opsBusy.delete(key); };
  try {
    let r;
    try { r = await api.ops(ops); } finally { settle(); }
    if (slowShown && !done) hideToast();
    S.index = r.index; await store.put('kv', 'index', r.index); noteGone(true);
    const bad = (r.results || []).find((x) => !x.ok);
    if (S.reader) readerSync();
    render();
    if (bad) toast(bad.error === 'cycle' ? '폴더를 그 안의 폴더로 옮길 수는 없습니다' : bad.error === 'no_folder' ? '그 폴더가 더 이상 없습니다' : '일부를 처리하지 못했습니다');
    else if (done) toast(done);
    return r;
  } catch (e) {
    toast(offline(e) ? (noNet() ? unreached('할 수 있습니다') : '책장 서버에 닿지 않아 하지 못했습니다 · 잠시 뒤 다시 해 주세요') : '처리하지 못했습니다. 다시 해 주세요.', 4200);
    return false;
  }
}

/* ================= upload ================= */
// files dropped in: a dropped folder is opened, and the folders inside it, for its PDFs
function filesFromDrop(dt) {
  if (!dt) return Promise.resolve([]);
  const plain = [...(dt.files || [])];   // read now: the drop's data is gone once this handler returns
  const entries = [...(dt.items || [])].filter((i) => i.kind === 'file' && i.webkitGetAsEntry).map((i) => i.webkitGetAsEntry()).filter(Boolean);
  if (!entries.some((en) => en.isDirectory)) return Promise.resolve(plain);
  const out = [];
  const walk = async (en, depth) => {
    if (out.length >= 5000 || depth > 12) return;
    if (en.isFile) { if (/\.pdf$/i.test(en.name)) { try { out.push(await new Promise((res, rej) => en.file(res, rej))); } catch (e) { /* unreadable */ } } return; }
    if (!en.isDirectory) return;
    const r = en.createReader();
    for (;;) {
      const batch = await new Promise((res) => r.readEntries(res, () => res([])));
      if (!batch.length) break;
      for (const c of batch) await walk(c, depth + 1);
    }
  };
  return (async () => { for (const en of entries) await walk(en, 0); if (!out.length) toast('넣은 폴더에 PDF가 없습니다'); return out; })();
}
function uploadBox() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) { $('.file-in').click(); return; }   // iPad, phone: the system picker
  const where = S.view.kind === 'home' && S.view.folder ? folderPath(S.view.folder).map((f) => f.name).join(' › ') : '서재';
  const box = sheet(`<h2>PDF 올리기</h2><div class="drop-zone" tabindex="0">${I.up}<p>PDF를 여기로 끌어다 놓으세요</p><div class="pick-row"><button class="btn primary pick-file">파일 고르기</button><button class="btn pick-dir">폴더째 고르기</button></div></div><p class="drop-where">올릴 곳 · ${esc(where)}</p>`);
  const z = $('.drop-zone', box);
  const has = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  z.ondragenter = z.ondragover = (e) => { if (!has(e)) return; e.preventDefault(); e.stopPropagation(); z.classList.add('over'); };
  z.ondragleave = (e) => { if (!z.contains(e.relatedTarget)) z.classList.remove('over'); };
  z.ondrop = (e) => { e.preventDefault(); e.stopPropagation(); const got = filesFromDrop(e.dataTransfer); closeSheet(); got.then((fs) => { if (fs.length) upload(fs); }); };
  $('.pick-file', box).onclick = () => { closeSheet(); $('.file-in').click(); };
  $('.pick-dir', box).onclick = () => { closeSheet(); $('.dir-in').click(); };
}
const FULL_MSG = '자리가 없습니다';   // the panel says once, above the rows, what to do
async function upload(fileList) {
  const pdfs = fileList.filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
  const skipped = fileList.length - pdfs.length;
  if (skipped) toast(`PDF가 아닌 파일 ${skipped}개는 건너뛰었습니다`);
  if (!pdfs.length) return;
  const folder = S.view.kind === 'home' ? (S.view.folder || null) : null;
  for (const file of pdfs) S.uploads.push({ key: rid(8), file, name: file.name, size: file.size, folder, status: 'wait', p: 0 });
  renderUploads();
  pumpUploads();
}
let running = 0;
function pumpUploads() {
  while (running < 2) {
    const u = S.uploads.find((x) => x.status === 'wait');
    if (!u) break;
    running++;
    uploadOne(u).finally(() => { running--; renderUploads(); pumpUploads(); });
  }
}
async function uploadOne(u) {
  const set = (status, extra = {}) => { Object.assign(u, { status }, extra); renderUploads(); };
  try {
    set('read');
    const buf = await u.file.arrayBuffer();
    if (!/%PDF-/.test(new TextDecoder('latin1').decode(new Uint8Array(buf, 0, Math.min(1024, buf.byteLength))))) { set('error', { msg: 'PDF 파일이 아닙니다' }); return; }
    const id = await pdfkit.sha256id(buf);
    u.id = id;
    if (!fileById(id) && S.index.files.reduce((s, f) => s + (f.size || 0), 0) + buf.byteLength > CAP) { set('error', { msg: FULL_MSG, full: true }); return; }
    const have = fileById(id);
    if (have && !have.trashed && !folderTrashed(have.folder)) { set('dup', { msg: `이미 있습니다${have.folder ? ' · ' + ((folderById(have.folder) || {}).name || '') : ''}`, have: have.id }); return; }
    let doc;
    try { doc = await pdfkit.openBytes(buf); }
    catch (e) { set('error', { msg: e && e.name === 'PasswordException' ? '암호가 걸린 PDF는 올릴 수 없습니다' : '열 수 없는 PDF입니다' }); return; }
    const pages = doc.numPages;
    if (!u.orig) u.orig = u.name;
    let first = null;   // what the first page says: "저자_제목" (used only when both are clear), and where it was published
    try {
      const p1 = (await pdfkit.pageItems(doc, 0)).page;
      const p2 = pages > 1 ? (await pdfkit.pageItems(doc, 1)).page : null;
      first = await nameFromBand(doc, p1, p2, naming.withFileName(naming.readFirstPages(p1, p2, await morePages(doc), await kci.names()), u.orig || u.name), u.orig || u.name);
      if (S.prefs.autoName !== false && first && first.name) { u.name = first.name + '.pdf'; renderUploads(); }
    } catch (e) { /* keeps the file's own name */ }
    let thumb = null;
    try { thumb = await pdfkit.thumbnail(doc); } catch (e) { /* no picture */ }
    set('up', { p: 0 });
    await api.uploadFile(id, new Blob([buf], { type: 'application/pdf' }), (p) => { u.p = p; renderUploads(); });
    if (thumb) { try { await api.putMeta(id, 'thumb', thumb, 'image/jpeg'); await store.put('thumbs', id, thumb); } catch (e) { thumb = null; } }
    const r = await api.ops([{ op: 'addFile', file: { id, name: u.name, orig: u.orig, folder: u.folder, size: buf.byteLength, pages, thumb: !!thumb, text: false } }]);
    const res = r.results[0];
    if (!res.ok && res.error === 'no_folder') await api.ops([{ op: 'addFile', file: { id, name: u.name, orig: u.orig, folder: null, size: buf.byteLength, pages, thumb: !!thumb, text: false } }]);
    S.index = r.index;
    await store.put('files', id, new Blob([buf], { type: 'application/pdf' })); S.cached.add(id);
    renderBg();
    set('index', { p: 0 });
    // page texts for search: after the file is safely stored, so a failure here never loses the upload
    try {
      const t = await pdfkit.textIndex(doc, A, (p) => { u.p = p; renderUploads(); });
      t.paper = paperOf(first);
      notePaper(id, t);
      const gz = await pdfkit.gzipJSON(t);
      await api.putMeta(id, 'text', gz, 'application/gzip');
      await store.put('texts', id, t);
      const scan = (await pdfkit.picturePages(doc, t.pages).catch(() => [])).length;   // a scan: its words are read next (글자 읽기)
      const r2 = await api.ops([{ op: 'updateFile', id, set: { text: true, ...(scan ? { scan } : {}) } }]);
      S.index = r2.index;
      if (scan) ocrSoon(1500);
    } catch (e) { /* search will not include this file */ }
    doc.destroy();
    await store.put('kv', 'index', S.index);
    set('done');
    renderBg();
    libSoon();   // what its first page did not say: asked of the libraries now, not at the next start
  } catch (e) {
    set('error', { msg: offline(e) ? (noNet() ? '인터넷 연결이 끊겼습니다' : '책장 서버에 닿지 않습니다') : e.code === 'full' ? FULL_MSG : e.code === 'too_large' ? '파일이 너무 큽니다' : '올리지 못했습니다', full: e.code === 'full' });
  }
}
function renderUploads() {
  const box = $('.uploads'); if (!box) return;
  const room = (px) => { const v = px ? px + 'px' : ''; if (document.documentElement.style.getPropertyValue('--up-room') !== v) { if (v) document.documentElement.style.setProperty('--up-room', v); else document.documentElement.style.removeProperty('--up-room'); } };
  if (!S.uploads.length) { if (!box.hidden) box.hidden = true; room(0); return; }
  const active = S.uploads.filter((u) => !['done', 'dup', 'error'].includes(u.status)).length;
  const label = { wait: '기다리는 중', read: '확인하는 중', up: '올리는 중', index: '본문 색인 중', done: '완료', dup: '', error: '' };
  if (box.hidden) box.hidden = false;
  // (the panel's frame once; its head drawn only when it changes, its rows keyed: the row going up is drawn anew with each
  // step, the others — 열기 on a file already there, 다시 — stay the very buttons they are, so a press on one is never lost)
  if (!box._up || box._up.top.parentNode !== box || box._up.ul.parentNode !== box) { box.innerHTML = '<div class="up-top"></div><ul></ul>'; box._html = null; box._up = { top: box.firstElementChild, ul: box.lastElementChild }; }
  paint(box._up.top, `<div class="up-h"><b>${active ? `올리는 중 ${S.uploads.length - active}/${S.uploads.length}` : '올리기 끝'}</b>${active ? '' : '<button class="ib" data-x aria-label="닫기">' + I.close + '</button>'}</div>
    ${S.uploads.some((u) => u.status === 'error' && u.full) ? '<p class="up-note">무료 한도 9GB가 찼습니다. 휴지통을 비우거나 안 읽을 논문을 지운 뒤 <b>다시</b>를 누르세요.</p>' : ''}
    ${S.uploads.length > 30 ? `<p class="up-sum">${S.uploads.filter((u) => u.status === 'done').length}편 완료${S.uploads.filter((u) => u.status === 'dup').length ? ` · 이미 있던 ${S.uploads.filter((u) => u.status === 'dup').length}편` : ''}${S.uploads.filter((u) => u.status === 'error').length ? ` · 실패 ${S.uploads.filter((u) => u.status === 'error').length}편` : ''}${active ? ` · 남은 ${active}편` : ''}</p>` : ''}`);
  patchList(box._up.ul, (S.uploads.length > 30 ? S.uploads.filter((u) => !['done', 'dup', 'wait'].includes(u.status)).concat(S.uploads.filter((u) => u.status === 'wait').slice(0, 3)) : S.uploads), (u) => u.key, (u) => `<li class="${u.status}${u.status === 'dup' ? ' up-dup' : ''}"><span class="n">${esc(stem(u.name))}</span><span class="s">${u.msg ? esc(u.msg) : label[u.status]}${u.status === 'up' || u.status === 'index' ? ' ' + Math.round(u.p * 100) + '%' : ''}</span>${u.status === 'error' ? `<button class="btn small" data-retry="${u.key}">다시</button>` : u.status === 'dup' && u.have && fileById(u.have) ? `<button class="btn small ghost" data-up-open="${u.have}">열기</button>` : ''}<i class="upbar"><b style="width:${u.status === 'done' || u.status === 'dup' ? 100 : Math.round((u.status === 'up' ? u.p * 0.9 : u.status === 'index' ? 0.9 + u.p * 0.1 : 0) * 100)}%"></b></i></li>`);
  // (a file already on the shelf is a finished one too — its row grey, with the way to it: the panel goes by itself 5 s after
  // the last one is done; one that failed keeps it, for 다시)
  room(Math.ceil(box.getBoundingClientRect().height) + 18);   // (the list's end kept clear of the panel: room at its foot, nothing above moves)
  clearTimeout(S.upT);
  const finished = () => S.uploads.length && S.uploads.every((u) => u.status === 'done' || u.status === 'dup');
  if (!active && finished()) S.upT = setTimeout(() => { if (finished()) { S.uploads = []; renderUploads(); } }, 5000);
  box.onclick = (e) => {
    if (e.target.closest('[data-x]')) { S.uploads = []; renderUploads(); return; }
    const op = e.target.closest('[data-up-open]'); if (op) { S.uploads = S.uploads.filter((u) => u.have !== op.dataset.upOpen); renderUploads(); openFile(op.dataset.upOpen); return; }
    const r = e.target.closest('[data-retry]'); if (r) { const u = S.uploads.find((x) => x.key === r.dataset.retry); if (u) { u.status = 'wait'; u.msg = ''; u.full = false; u.p = 0; renderUploads(); pumpUploads(); } }
  };
}

/* ================= reading ================= */
async function getBytes(f, onProgress) {
  const b = await store.get('files', f.id);
  if (b) return b;
  const blob = await api.download('/files/' + f.id, onProgress);
  await store.put('files', f.id, blob); S.cached.add(f.id);
  if (f.text && !(f.id in S.info)) { clearTimeout(getBytes.t); getBytes.t = setTimeout(fillPaperInfo, 3000); }   // now its first page can be read here
  return blob;
}

/* A paper opens over the shelf. Its reader is made underneath, out of sight, and shown only once its first pages are drawn:
   switching between open papers keeps the one on screen (with a thin line at its top after 300 ms) until the next is ready —
   no '여는 중' card, no empty grey screen between the two. Only a first open that takes a while shows the card, after 250 ms
   (and the shelf stays under it until then). */
let openSeq = 0;
const LOADING = '<div class="loading"><div class="spin"></div><p>여는 중…</p><div class="lbar"><i></i></div></div>';
async function openFile(id, at = {}) {
  const f = fileById(id); if (!f) return;
  const my = ++openSeq;
  fgUntil = Date.now() + 8000;   // the background waits while this paper's first pages come (released once drawn)
  // what is on screen now: the paper being read (a tab switch), kept until the next is drawn
  const old = S.reader ? { reader: S.reader, id: S.readerId, host: S.reader._host || document.querySelector('.reader-host:not(.rh-next):not(.rh-wait)') } : null;
  if (old && old.id === id && at.page == null && !at.mark) return;   // (already the one on screen)
  if (old) {
    if (!at.noRemember) rememberTab();
    savePosition(old.id, old.reader.current(), old.reader.N, true);
  }
  document.querySelectorAll('.reader-host.rh-next, .reader-host.rh-wait').forEach((h) => { if (h._reader) { try { h._reader.destroy(); } catch (e) { /* gone */ } if (h._reader.docRef) h._reader.docRef.destroy(); } h.remove(); });   // (an open still on its way: given up)
  const tab = addTab(id);
  if (at.tab && tab.page != null) at = { ...at, page: tab.page, y: tab.y, zoom: tab.zoom, resume: true };
  // (from a sheet that can be opened again from the history — a decision, a judgment: after it; another sheet: in its place)
  const hs = history.state;
  if (at.replace || (hs && hs.sheet && !hs.rec)) history.replaceState({ r: id }, '', '#r=' + id); else history.pushState({ r: id }, '', '#r=' + id);
  const host = el('div', 'reader-host rh-next');
  host.style.visibility = 'hidden';
  document.body.appendChild(host);
  document.body.classList.add('reading');
  let cover = null;   // the card shown meanwhile on a first open, or the thin line on the paper being read
  const coverT = setTimeout(() => {
    if (my !== openSeq) return;
    if (old && old.host) old.host.classList.add('rd-busy');
    else if (!host._shown) { cover = el('div', 'reader-host rh-wait', LOADING); document.body.insertBefore(cover, host); }
  }, old ? 300 : 250);
  const drop = () => { clearTimeout(coverT); if (cover) cover.remove(); if (old && old.host) old.host.classList.remove('rd-busy'); };
  // (S.reader and S.readerId stay the paper on screen until the next is drawn: what syncs and marks meanwhile goes to the one
  // seen; a first open has no paper on screen, and is known as the one opening)
  if (!old) S.readerId = id;
  try {
    let doc;
    const cached = await store.get('files', id);
    if (cached) doc = await pdfkit.openBytes(await cached.arrayBuffer());
    else {
      if (!navigator.onLine) throw Object.assign(new Error('offline'), { code: 'offline' });
      // stream from the server: the first pages show before the whole file has arrived; the copy is kept once complete
      doc = await pdfkit.openUrl(api.fileUrl(id), api.authHeader());
      doc.getDownloadInfo().then(async () => { try { const data = await doc.getData(); await store.put('files', id, new Blob([data], { type: 'application/pdf' })); S.cached.add(id); } catch (e) { /* not kept */ } });
    }
    if (my !== openSeq) { doc.destroy(); return; }
    // a read scan's words, like its marks: a slow server is not waited on past 3 s (they are laid on the pages when they come)
    const ocrAsk = f.ocr ? ocrData(f).catch(() => null) : null;
    let ocrT = null;
    const [marks, index, ocrNow] = await Promise.all([loadMarks(id, 3000), store.get('texts', id).catch(() => null),
      ocrAsk && Promise.race([ocrAsk, new Promise((res) => { ocrT = setTimeout(() => res(SLOW), 3000); })]).finally(() => clearTimeout(ocrT))]);
    if (my !== openSeq) { doc.destroy(); return; }
    const ocr = ocrNow === SLOW ? null : ocrNow;
    const s = S.state.files[id];
    const rd = new Reader(host, {
      doc, title: stem(f.name), analyze: A, marks, index, ocr: ocr && ocr.pages,
      at: at.page != null ? { page: at.page, y: at.y || 0, query: at.query, mark: at.mark } : (s && !s.done ? { page: s.page, y: s.y } : {}),
      zoom: at.zoom,
      id, tabs: tabInfo(),
      onTab: (t) => switchTab(t),
      onTabClose: (t) => closeTab(t),
      onTabList: () => tabsSheet(),
      prefs: S.prefs,
      onClose: () => history.back(),
      onMarks: (list) => saveMarks(id, list),
      onPrefs: (p) => { S.prefs = { ...S.prefs, ...p }; store.put('kv', 'prefs', S.prefs); },
      onPosition: (pos) => savePosition(id, pos, doc.numPages),
      onShare: () => shareSheet(f),
      stars: f.stars || 0,
      markName,
      onRate: (v) => rate(id, v),
      onClearAll: () => clearAllMarks(fileById(id) || f),
      confirm: (t, x, ok) => confirmBox(t, x, ok, true),
      decision: (no, onRow) => cases.decision(no, onRow),
      article: (r) => laws.lawText(r.law).then((law) => ({ law, a: laws.findArt(law, r.art, r.sub) })),
      courtCase: (no) => laws.courtCase(no),
      reviewed: (law, art, para) => cases.byLaw(law, art, para),
      // 다듬기로 보내기: the passage chosen goes to 다듬기's box, with where it was read (going back returns to that page)
      onPolish: (text, at) => polishFrom(text, at || {}, id),
      toast,
    });
    rd.docRef = doc; rd._host = host; host._reader = rd;
    if (ocrNow === SLOW) ocrAsk.then((d) => { if (d && S.reader === rd) rd.setOcr(d.pages); });
    await rd.start();
    if (my !== openSeq) return;   // (another paper was asked for meanwhile: it takes over; this one is dropped with its host)
    // drawn: shown in one frame, and what was on screen goes
    if (old) { try { old.reader.destroy(); } catch (e) { /* gone */ } if (old.reader.docRef) old.reader.docRef.destroy(); }
    S.reader = rd; S.readerId = id; readerTabsSig = JSON.stringify(tabInfo());
    host.classList.remove('rh-next'); host.style.visibility = ''; host._shown = true; host._reader = null;
    drop();
    document.querySelectorAll('.reader-host').forEach((h) => { if (h !== host) h.remove(); });
    noteGone(true);
    fgUntil = Date.now() + 1500;   // drawn: the background goes on a moment later
    keepAwake();
    if (!index && f.text) textOf(f).then((t) => { if (S.reader === rd) rd.setIndex(t); }).catch(() => {});
  } catch (e) {
    if (my !== openSeq) return;
    fgUntil = 0;
    drop();
    if (host._reader) { try { host._reader.destroy(); } catch (x) { /* gone */ } }
    host.remove();
    if (old && S.reader === old.reader) {   // (a switch that failed: the paper on screen stays the one read)
      history.replaceState({ r: old.id }, '', '#r=' + old.id);
    } else {
      S.reader = null; S.readerId = null; document.body.classList.remove('reading');
      if (location.hash.startsWith('#r=')) history.replaceState(null, '', location.pathname);
    }
    toast(e.code === 'offline' ? '이 파일은 아직 이 기기에 없습니다. 인터넷에 연결되면 열 수 있습니다.' : e.name === 'PasswordException' ? '암호가 걸린 PDF입니다'
      : api.serverDown() && !S.cached.has(id) ? '책장 서버에 연결할 수 없어 열지 못했습니다. 이 기기에 받아 둔 논문은 열 수 있습니다.' : '파일을 열지 못했습니다');
  }
}
let wake = null, wakeT = null;
async function keepAwake() {
  clearTimeout(wakeT); wakeT = setTimeout(letSleep, 10 * 60e3);
  if (wake || !S.reader || document.hidden || !('wakeLock' in navigator)) return;
  try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } catch (e) { wake = null; }
}
function letSleep() { clearTimeout(wakeT); if (wake) { wake.release().catch(() => {}); wake = null; } }
let awakeAt = 0;
function nudgeAwake() { const t = Date.now(); if (S.reader && t - awakeAt > 20e3) { awakeAt = t; keepAwake(); } }
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => document.addEventListener(ev, nudgeAwake, { passive: true, capture: true }));
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.reader) keepAwake(); });

/* 다듬기로 보내기 (the reader's selection pop): the passage chosen is put in 다듬기's box — the draft there before it one tap
   from coming back (되돌리기) — with the line '읽던 곳: <title> · 12쪽' above it. The paper closes as it would by going back
   (its tab and page kept), and 다듬기 comes in its place in the history: Back returns to the paper at that page, and the
   line's button (‹ 읽던 곳으로) opens it there too. */
async function polishFrom(text, at, id) {
  const t = String(text || '').trim(); if (!t) return;
  const f = fileById(at.fileId || id) || fileById(id);
  // (the draft there now: the box itself when it is drawn, else as write.js keeps it — localStorage first, then IndexedDB)
  let prev = null, prevFrom = null;
  const ta0 = document.querySelector('.wr-in');
  try { prev = ta0 ? ta0.value : localStorage.getItem('shelf:write:draft'); prevFrom = JSON.parse(localStorage.getItem('shelf:write:from') || 'null'); } catch (e) { /* none kept here */ }
  if (prev == null) prev = await store.get('kv', 'write:draft').catch(() => null);
  if (!prevFrom) prevFrom = await store.get('kv', 'write:from').catch(() => null);
  const from = { title: at.title || (f ? stem(f.name) : ''), page: at.label != null && at.label !== '' ? at.label : (Number.isInteger(at.page) ? at.page + 1 : ''), fileId: (f && f.id) || id, at: Number.isInteger(at.page) ? at.page : undefined };
  write.setDraft(t, { from });
  const back = lastDepth;
  closeReader(true);   // (its place and tab kept: rememberTab, savePosition)
  S.view = { kind: 'write', folder: null }; S.q = ''; S.select = null;
  const fi = $('.find input'); if (fi) fi.value = '';
  render(); closeRail();
  // (the reader's place in the history stays where it is: 다듬기 goes on top of it)
  const n = navNow(), url = location.pathname + location.search + navHash(n);
  history.pushState({ nav: n, depth: back + 1, typed: false, key: Math.random().toString(36).slice(2), from: 'reader', reader: from.fileId, page: from.at }, '', url);
  lastDepth = back + 1; paintBack();
  const c = $('.content'); if (c) c.scrollTop = 0;
  if (prev && prev.trim() && prev.trim() !== t) toast('전에 있던 글 대신 넣었습니다', 7000, { label: '되돌리기', fn: () => write.setDraft(prev, { from: prevFrom }) });
  else toast('다듬기 칸에 넣었습니다');
  setTimeout(() => { const ta = document.querySelector('.wr-in'); if (ta && matchMedia('(hover: hover) and (pointer: fine)').matches) ta.focus({ preventScroll: true }); }, 60);
}
// '‹ 읽던 곳으로' above 다듬기's box: the paper at the page the passage came from (going back to the place in the history
// it was left at, when it is the one right behind)
function openFrom(f) {
  if (!f || !f.fileId || !fileById(f.fileId)) { toast('그 논문이 책장에 없습니다'); return; }
  const st = history.state;
  if (st && st.from === 'reader' && st.reader === f.fileId && S.view.kind === 'write') { history.back(); return; }
  openFile(f.fileId, Number.isInteger(f.at) ? { page: f.at } : { tab: true });
}
function closeReader(silent, noRemember) {
  if (!S.reader && !S.readerId) return;
  openSeq++;   // (an open on its way is given up)
  if (S.reader && !noRemember) rememberTab();
  if (S.reader) { const pos = S.reader.current(); savePosition(S.readerId, pos, S.reader.N, true); const d = S.reader.docRef; S.reader.destroy(); if (d) d.destroy(); }
  document.querySelectorAll('.reader-host').forEach((h) => { if (h._reader && h._reader !== S.reader) { try { h._reader.destroy(); } catch (e) { /* gone */ } if (h._reader.docRef) h._reader.docRef.destroy(); } h.remove(); });
  S.reader = null; S.readerId = null; letSleep();
  document.body.classList.remove('reading');
  if (watchList().some((w) => Date.now() - (w.chk || 0) > WATCH_DAY)) watchSoon(10000);   // (what waited while the paper was read)
  if (!silent) render();
}
function onPop(e) {
  if (sheetBack) { sheetBack = false; lastDepth = (history.state && history.state.depth) || 0; paintBack(); return; }   // (a sheet closed by its ✕, Esc or a button took its own place in the history away)
  const st = e && e.state;
  lastDepth = (st && st.depth) || 0;
  if (S.readerId && !/#r=/.test(location.hash)) {
    // (the screen under the paper is the one the history goes back to — after 다듬기로 보내기 it was not the one left)
    if (st && st.nav && !sameNav(st.nav, navNow())) { closeReader(true); applyNav(st); } else closeReader();
    if (st && st.sheet && st.rec) reopenSheet(st.rec);
    return;
  }
  // a paper's place reached by going back (from 다듬기, where its passage was sent): the paper again, at the page it was left
  if (!S.readerId && st && st.r && !st.nav && fileById(st.r)) { document.querySelectorAll('.sheet-wrap').forEach((w) => w.remove()); openFile(st.r, { tab: true, replace: true }); return; }
  if (S.readerId || !st || !st.nav) return;
  // a sheet open now closes (as its ✕ does: whoever waits on it hears 'no') — the history is already where it should be
  const open = document.querySelector('.sheet-wrap .sheet-x');
  sheetQuiet = true;
  try { if (open) open.click(); else closeSheet(); } finally { sheetQuiet = false; }
  document.querySelectorAll('.menu-wrap').forEach((m) => m.remove());
  // a place a sheet had that cannot be made again (a menu's question, settings …): passed over, never an empty stop
  if (st.sheet && !st.rec) { sheetBack = true; history.back(); return; }
  if (!sameNav(st.nav, navNow())) applyNav(st);
  else { closeRail(); paintBack(); }   // back from a sheet: the screen under it stays as it was
  if (st.sheet && st.rec) reopenSheet(st.rec);   // a decision's sheet, where it was left
}
// the screen a place in the history keeps, put back as it was left (its question, its scroll)
function applyNav(st) {
  const n = st.nav;
  const c0 = $('.content'); if (c0 && !S.q) secScroll.set(secKey(), c0.scrollTop);   // (the menu left by going back: where it was, for its next visit)
  S.view = { kind: n.kind || 'home', folder: n.folder || null }; S.q = ''; S.select = null;
  S.lq = n.lq || ''; S.cq = n.cq || ''; S.pq = n.pq || ''; if (n.pk !== undefined) S.pk = n.pk; if (n.ps !== undefined) S.ps = n.ps; S.pjv = n.pjv || ''; S.pj = n.pj || ''; S.ks = n.ks || '';
  S.lold = n.lo || null;
  const fi = $('.find input'); if (fi) fi.value = '';
  render(); closeRail();
  scrollBackTo(st.scroll || 0);
}
// back to y on the screen now shown: the answers come a moment later, so once the screen is long enough again (for up to 3 s);
// given up when another screen comes first
let scrollSeq = 0;
function scrollBackTo(y) {
  const c = $('.content'); if (!c) return;
  const my = ++scrollSeq, key = history.state && history.state.key;
  const busy = () => c.getAttribute('aria-busy') === 'true' && !!c._staged;   // (the screen still on its way: the last one stays where it is)
  if (!busy()) c.scrollTop = 0;
  const t0 = Date.now();
  let reset = !busy();
  const tick = () => {
    if (my !== scrollSeq || !c.isConnected || (history.state && history.state.key) !== key) return;
    if (busy() && Date.now() - t0 < 3000) { setTimeout(tick, 30); return; }
    if (!reset) { reset = true; c.scrollTop = 0; }
    if (!(y > 0)) return;
    const max = c.scrollHeight - c.clientHeight;
    if (max >= y - 2 || Date.now() - t0 > 3000) { c.scrollTop = Math.min(y, max); return; }
    setTimeout(tick, 90);
  };
  if (reset && !(y > 0)) return;
  setTimeout(tick, reset ? 60 : 30);
}
// how far each menu's screen was scrolled when it was left (서재 and each folder on its own), for coming back to it
const secScroll = new Map();
const secKey = () => S.view.kind + ':' + (S.view.kind === 'home' ? S.view.folder || '' : '');
// the screen one is on, as history keeps it
const navNow = () => ({ kind: S.view.kind, folder: S.view.folder || null, lq: S.view.kind === 'law' ? S.lq || '' : '', cq: S.view.kind === 'cases' ? S.cq || '' : '', pq: S.view.kind === 'papers' ? S.pq || '' : '', pk: S.pk, ps: S.ps, pjv: S.pjv || '', pj: S.pj || '', ks: S.ks || '',
  lo: S.view.kind === 'law' && S.lold && S.lold.q === S.lq ? S.lold : null });   // (an article opened from a citation of its old text)
const navHash = (n) => (n.kind === 'law' ? '#law' + (n.lq ? '=' + encodeURIComponent(n.lq) : '') : n.kind === 'cases' ? '#cases' + (n.cq ? '=' + encodeURIComponent(n.cq) : '') : n.kind === 'papers' ? '#papers' + (n.pq ? '=' + encodeURIComponent(n.pq) : '') : n.kind === 'trash' ? '#trash' : n.kind === 'write' ? '#write' : n.folder ? '#f=' + n.folder : '#');
const sameNav = (a, b) => !!a && !!b && a.kind === b.kind && (a.folder || null) === (b.folder || null) && (a.lq || '') === (b.lq || '') && (a.cq || '') === (b.cq || '') && (a.pq || '') === (b.pq || '') && (a.pjv || '') === (b.pjv || '') && (a.pj || '') === (b.pj || '');
// how: 'push' (a question asked, a view or folder opened: going back returns to the screen before) or 'typing' (what is
// being typed: one passing place on top of the history, taken over by the question once it is asked — so going back never
// stops at half a word)
function nav(how = 'push') {
  if (S.readerId) return;
  const n = navNow(), st = history.state || {}, cur = st.nav;
  const url = location.pathname + location.search + (navHash(n) === '#' ? '' : navHash(n));
  const key = Math.random().toString(36).slice(2);
  // (from: the menu of the place before this one — the ‹ in a search box goes back only within its own menu)
  const push = (typed) => history.pushState({ nav: n, depth: (st.depth || 0) + 1, typed, key, from: cur.kind || '' }, '', url);
  const put = (typed) => history.replaceState({ nav: n, depth: st.depth || 0, typed, key, from: st.from || '' }, '', url);
  if (!cur) history.replaceState({ nav: n, depth: 0, typed: how === 'typing', key, from: st.from || '' }, '', url);
  else if (st.sheet && st.rec) push(how === 'typing');   // from a decision's sheet: it keeps its place, to come back to
  else if (st.sheet) { if (!sameNav(cur, n)) put(how === 'typing'); }   // from another sheet: its place is taken
  else if (st.typed) {
    // the tip is a half-typed, passing entry. A deliberate move into a sub-screen (a journal's own list) keeps it, so going
    // back returns to the search; more typing, or finishing the same search box (Enter, a facet, a sort), takes its place.
    if (how !== 'typing' && (n.pjv || '')) push(false);
    else put(how === 'typing');
  } else if (!sameNav(cur, n)) push(how === 'typing');
  lastDepth = (history.state && history.state.depth) || 0;
  paintBack();
}
// before a screen is changed: how far it is scrolled, kept with it (so going back returns there)
function noteScroll() {
  const st = history.state, c = $('.content');
  if (c && !S.q && !S.readerId) secScroll.set(secKey(), c.scrollTop);
  if (st && st.nav && !st.typed && !st.sheet && c) {
    // (a whole law's chapters opened, kept with the place too: back from an article, they are open again where they were)
    const folds = S.view.kind === 'law' ? [...c.querySelectorAll('.law-whole .lw-fold')].map((d, i) => (d.open ? i : -1)).filter((i) => i >= 0) : null;
    history.replaceState({ ...st, scroll: c.scrollTop, ...(folds ? { folds } : {}) }, '');
  }
}
// ‹ beside the search box, when the screen to go back to is of this same menu (an app on the home screen has no back button
// of its own): 판례 → 판례's earlier question, never 판례 → 다듬기 from a ‹ that reads as 'back in this search'. The magnifier
// stays — it says what the box is
function paintBack() {
  const st = history.state;
  const can = !!(st && st.depth > 0 && st.nav && st.from && st.from === st.nav.kind);
  document.querySelectorAll('.law-top .nav-back').forEach((b) => { if (b.hidden !== !can) b.hidden = !can; const ico = b.parentElement && b.parentElement.querySelector('.lf-ico'); if (ico && ico.hidden) ico.hidden = false; });
}

/* ---------- 공유하기: the PDF with this paper's marks written in, or the original — sent (메일·메시지·AirDrop: the device's
   own share sheet), saved as a file, or printed. The PDF is made as soon as the sheet opens, so a tap on 보내기 reaches the
   share sheet at once (a browser lets a page share only straight after a tap). ---------- */
async function makePdf(f, withMarks) {
  const blob = await getBytes(f);
  let out = new Uint8Array(await blob.arrayBuffer()), note = '';
  if (withMarks) {
    const list = (await loadMarks(f.id)).filter((m) => !m.del);
    if (list.length) {
      try { const { buildAnnotatedPdf } = await import('./annot.js?v=6f9f98f247'); out = await buildAnnotatedPdf(out, list); }
      catch (e) {
        // a locked file cannot take annotations: draw its pages with the marks into a new PDF instead
        try { out = await pdfkit.flattenWithMarks(out, list); note = '잠긴 PDF라 쪽을 그림으로 바꿔 표시와 함께 만들었습니다'; }
        catch (e2) { note = '표시를 넣지 못해 원본으로 드립니다'; }
      }
    }
  }
  const base = stem(f.name.endsWith('.pdf') ? f.name : f.name + '.pdf');
  return { file: new File([out], base + (withMarks && !note.startsWith('표시를 넣지') ? ' (표시)' : '') + '.pdf', { type: 'application/pdf' }), note };
}
function saveFile(file) {
  const url = URL.createObjectURL(file), a = el('a');
  a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const canShareFiles = () => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(4)], 'x.pdf', { type: 'application/pdf' })] })); } catch (e) { return false; } };
async function shareSheet(f) {
  const marks = (await loadMarks(f.id).catch(() => [])).filter((m) => !m.del).length;
  const send = canShareFiles(), touch = matchMedia('(pointer: coarse)').matches;
  let want = marks ? 'marks' : 'orig';
  const made = {};   // the PDFs made so far: { marks: Promise, orig: Promise }
  const prep = (v) => (made[v] ||= makePdf(f, v === 'marks'));
  const box = sheet(`<h2>공유하기</h2><p class="sh-t">${esc(stem(f.name))}</p>
    ${marks ? `<div class="pp-sort sh-seg" role="group" aria-label="보낼 파일"><button type="button" data-v="marks">표시 넣은 PDF</button><button type="button" data-v="orig">원본</button></div>` : ''}
    <div class="sh-acts">
      ${send ? `<button type="button" class="sh-a" data-a="send"><i class="mi">${MI.send}</i><span><b>보내기</b><small>메일 · 메시지</small></span></button>` : ''}
      <button type="button" class="sh-a" data-a="save"><i class="mi">${MI.orig}</i><span><b>저장하기</b><small>PDF 파일로</small></span></button>
      <button type="button" class="sh-a" data-a="print"><i class="mi">${MI.print}</i><span><b>인쇄</b></span></button>
    </div>`);
  const paint = () => box.querySelectorAll('.sh-seg [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === want));
  paint();
  prep(want).catch(() => {});
  const seg = box.querySelector('.sh-seg');
  if (seg) seg.onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; want = b.dataset.v; paint(); prep(want).catch(() => {}); };
  box.querySelector('.sh-acts').onclick = async (e) => {
    const b = e.target.closest('[data-a]'); if (!b || box.dataset.busy) return;
    const act = b.dataset.a, v = want;
    // printing on a computer opens the PDF in a window: it is opened during the tap, so it is not blocked
    const win = act === 'print' && !touch ? window.open('', '_blank') : null;
    let got;
    try {
      const p = prep(v);
      got = await Promise.race([p, new Promise((r) => setTimeout(r, 40))]);
      if (!got) { box.dataset.busy = '1'; b.classList.add('busy'); got = await p; }
    } catch (err) {
      if (win) win.close();
      delete made[v];
      toast(offline(err) ? (noNet() ? '이 파일은 아직 이 기기에 없습니다. 인터넷에 연결되면 할 수 있습니다.' : '이 파일은 아직 이 기기에 없고, 책장 서버에 닿지 않습니다 · 잠시 뒤 다시 해 주세요') : 'PDF를 만들지 못했습니다');
      return;
    } finally { delete box.dataset.busy; b.classList.remove('busy'); }
    const { file, note } = got;
    if (act === 'send' || (act === 'print' && touch && send)) {   // on a phone or tablet, 인쇄 is in the share sheet
      try { await navigator.share({ files: [file], title: stem(f.name) }); closeSheet(); if (note) toast(note, 5000); }
      catch (err) { if (err && err.name === 'NotAllowedError') toast('PDF가 준비됐습니다. 한 번 더 눌러 주세요'); }
      return;
    }
    if (act === 'save') { saveFile(file); closeSheet(); toast(note || '저장했습니다', note ? 5000 : 2600); return; }
    const url = URL.createObjectURL(file);   // print
    if (win) win.location = url; else window.open(url, '_blank');
    closeSheet(); if (note) toast(note, 5000);
  };
}

/* ---------- marks: this device first, then the server ---------- */
function mergeMarks(a, b) {
  const m = new Map(); for (const x of a) m.set(x.id, x);
  for (const x of b) { const o = m.get(x.id); if (!o || x.t >= o.t) m.set(x.id, x); }
  return [...m.values()];
}
// wait: at most this long for the server's marks (opening a paper: a slow server must not hold up a paper kept here). When the
// server answers later, its marks are merged in as another device's would be (takeMarks), into the reader if it is open by then
const SLOW = Symbol('slow');
async function loadMarks(id, wait = 0) {
  const local = (await store.get('marks', id)) || { marks: [], pending: false };
  if (!navigator.onLine) return local.marks;
  try {
    const ask = api.getMarks(id);
    let timer = null;
    const remote = wait ? await Promise.race([ask, new Promise((res) => { timer = setTimeout(() => res(SLOW), wait); })]).finally(() => clearTimeout(timer)) : await ask;
    if (remote === SLOW) {
      ask.then(async (r) => { await takeMarks(id, (r && r.marks) || [], r && r.tag); const rec = await store.get('marks', id); if (rec && rec.pending) pushMarks(id); }).catch(() => {});
      return local.marks;
    }
    const merged = mergeMarks(remote.marks || [], local.marks);
    await store.put('marks', id, { marks: merged, pending: local.pending, tag: remote.tag || '' });
    marksCache = null;
    if (local.pending) pushMarks(id);
    return merged;
  } catch (e) { return local.marks; }
}
const markTimers = new Map();
async function saveMarks(id, list) {
  const old = await store.get('marks', id);
  await store.put('marks', id, { marks: list, pending: true, tag: (old && old.tag) || '' });
  marksCache = null;
  clearTimeout(markTimers.get(id));
  markTimers.set(id, setTimeout(() => pushMarks(id), 500));
}
async function pushMarks(id) {
  const rec = await store.get('marks', id);
  if (!rec || !rec.pending || !navigator.onLine) return;
  try {
    const res = await api.putMarks(id, rec.marks);
    const now = await store.get('marks', id);
    // only clear the flag if nothing changed while the request was out
    if (now && JSON.stringify(now.marks) === JSON.stringify(rec.marks)) await store.put('marks', id, { marks: res.marks, pending: false, tag: res.tag || '' });
    else await store.put('marks', id, { marks: mergeMarks(res.marks, now.marks), pending: true, tag: res.tag || '' });
    marksCache = null;
  } catch (e) { /* stays pending; sent when online again */ }
}
async function syncMarksAll() {
  if (!navigator.onLine) return;
  for (const id of await store.keys('marks')) { const r = await store.get('marks', id); if (r && r.pending) await pushMarks(id); }
}

/* ---------- 스캔본 글자 읽기 (OCR) ----------
   A paper whose pages are pictures gets its words read on this device (ocr.js; nothing leaves it but the result).
   An iPad or a computer does it on its own, one paper at a time; on a phone it waits for the file menu. The words
   go to the server, so every device can then search them, select them and mark them. */
const OCR = { id: null, done: 0, total: 0 };
let ocrRun = null;
// pages 3 to 6, for where the paper says it was published (a cover, a notice, a title page alone or a blank page can come
// before its first page): until two that carry text are in. items(i): page i as naming.js reads it (a read scan's words)
async function morePages(doc, items = async (i) => { const r = await pdfkit.pageItems(doc, i); r.pdfPage.cleanup(); return r.page; }) {
  const out = [];
  for (let i = 2, n = 0; i < Math.min(doc.numPages, 6) && n < 2; i++) {
    const pg = await items(i);
    if (!pg) break;
    out.push(pg);
    if (pg.items.some((x) => x.s && x.s.trim())) n++;
  }
  return out;
}
// An author line the text layer does not carry (drawn, not written: 임 지 봉 under the title, yet no text there): that strip of
// page 1 is read like a scan, and the name read again with it. Only when the title is read but no author, and not on a phone.
async function nameFromBand(doc, p1, p2, first, fileName) {
  if (!first || first.name || !first.title || isPhone()) return first;
  const band = naming.authorBand(p1); if (!band) return first;
  let mod = null, pg = null;
  try {
    mod = await import('./ocr.js?v=6f9f98f247');
    pg = await doc.getPage(1);
    const vp = pg.getViewport({ scale: 1 });
    const r = await mod.readPage(pg, 'kor');
    const again = naming.withFileName(naming.readFirstPages(naming.withBand(p1, band, ocrPageItems(0, r.lines, vp.width, vp.height).items), p2), fileName);
    if (!again || !again.name) return first;
    return { ...again, journal: first.journal || again.journal, society: first.society || again.society, issue: first.issue || again.issue, date: first.date || again.date };
  } catch (e) { return first; } finally { if (pg) pg.cleanup(); if (mod && !ocrRun) mod.stop(); }
}
const isPhone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600 && !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const needsOcr = (f) => !!f && f.scan > 0 && !f.ocr && !f.trashed && !f.pending && !folderTrashed(f.folder);
const isScan = (f) => !!f && f.scan > 0 && (!f.pages || f.scan * 2 >= f.pages);   // most of its pages are pictures
function ocrSoon(ms = 3000) {
  if (isPhone()) return;
  clearTimeout(ocrSoon.t); ocrSoon.t = setTimeout(() => ocrQueue(), ms);
}
// a device reads a scan on its own only up to this many pages (a longer one waits for 글자 읽기 in its menu), and never a PDF
// that turns out to have its text after all (taken for a scan by an older check: it is then marked as no scan)
const OCR_AUTO_MAX = 60;
const ocrSkip = new Set();
function ocrQueue(only) {
  if (ocrRun) return ocrRun;
  ocrRun = (async () => {
    let mod = null;
    try {
      for (;;) {
        const f = only ? fileById(only) : liveFiles().find((x) => needsOcr(x) && x.scan <= OCR_AUTO_MAX && !ocrSkip.has(x.id));
        if (!needsOcr(f) || !syncOn || !navigator.onLine) break;
        mod = mod || await import('./ocr.js?v=6f9f98f247');
        let r;
        try { r = await ocrFile(f, mod, !only); }
        catch (e) { if (only) toast(offline(e) ? unreached('할 수 있습니다') : '글자를 읽지 못했습니다'); break; }
        if (r === 'none' && only) toast('글자가 이미 들어 있는 PDF입니다. 따로 읽을 쪽이 없습니다');
        if (r) ocrSkip.add(f.id);
        if (only) break;
      }
    } finally {
      OCR.id = null; showOcrProgress();
      if (mod) await mod.stop();
      ocrRun = null;
    }
  })();
  return ocrRun;
}
function ocrPageItems(n, lines, W, H) {   // read words in the shape the page analysis expects (for page numbers, headings, the name)
  return { n, W, H, items: (lines || []).map((l) => ({ s: l[4].map((w) => w[2]).join(' '), x: l[0] * W, y: l[3] * H, w: (l[2] - l[0]) * W, h: (l[3] - l[1]) * H * 0.85, f: 'ocr', eol: true })) };
}
async function ocrFile(f, mod, auto) {
  const doc = await pdfkit.openBytes(await (await getBytes(f)).arrayBuffer());
  try {
    const t = (await textOf(f).catch(() => null)) || await pdfkit.textIndex(doc, A);
    const todo = await pdfkit.picturePages(doc, t.pages);
    if (!todo.length) {   // no page is a picture: not a scan after all
      const r = await api.ops([{ op: 'updateFile', id: f.id, set: { scan: 0 } }]);
      S.index = r.index; applyPending(await store.get('kv', 'pendingOps')); await store.put('kv', 'index', S.index); syncTags.lib = '';
      if (S.reader) { renderUsage(); readerSync(); } else renderBg();
      return 'none';
    }
    if (auto && todo.length > OCR_AUTO_MAX) return 'long';
    // each page read is kept here at once (one small record per page), so an interruption costs at most one page
    const key = (i) => 'ocr:' + f.id + ':' + i;
    const saved = { pages: {}, lang: ((await store.get('kv', 'ocr:' + f.id)) || {}).lang || 'kor' };
    for (const i of todo) { const l = await store.get('kv', key(i)); if (l) saved.pages[i] = l; }
    Object.assign(OCR, { id: f.id, total: todo.length, done: Object.keys(saved.pages).length }); showOcrProgress();
    for (const i of todo) {
      if (saved.pages[i]) continue;
      if (!fileById(f.id) || fileById(f.id).trashed) return;   // thrown away meanwhile
      const pg = await doc.getPage(i + 1);
      try { const r = await mod.readPage(pg, saved.lang); saved.pages[i] = r.lines; if (r.lang !== saved.lang) { saved.lang = r.lang; await store.put('kv', 'ocr:' + f.id, { lang: r.lang }); } }
      finally { pg.cleanup(); }
      await store.put('kv', key(i), saved.pages[i]);
      OCR.done++; showOcrProgress();
    }
    // the words go into the page texts (search), page numbers and headings are read from them, and the paper gets a name
    const pages = [];
    for (let i = 0; i < doc.numPages; i++) {
      const pg = await doc.getPage(i + 1); const vp = pg.getViewport({ scale: 1 });
      if (saved.pages[i]) { pages.push(ocrPageItems(i, saved.pages[i], vp.width, vp.height)); t.pages[i] = mod.textOf(saved.pages[i]); }
      else pages.push((await pdfkit.pageItems(doc, i, pg)).page);
      pg.cleanup();
    }
    try { const L = A.pageLabels(pages); if (L && L.confident) t.labels = L; } catch (e) { /* no numbering */ }
    try { const o = A.outline(pages, A.docStats(pages)); if (o && o.length && !(t.outline || []).length) t.outline = o; } catch (e) { /* no headings */ }
    t.chars = t.pages.reduce((s, x) => s + x.length, 0);
    const known = await kci.names();
    const first = (() => { try { return naming.withFileName(naming.readFirstPages(pages[0], pages[1] || null, pages.slice(2, 6), known), f.orig || f.name); } catch (e) { return null; } })();
    if (!t.paper && paperOf(first)) t.paper = paperOf(first);
    if (t.paper === undefined) t.paper = null;
    notePaper(f.id, t);
    const when = Date.now();
    t.ocr = when;   // these texts carry the read words (devices holding older ones fetch these)
    const data = { v: 1, lang: saved.lang, pages: saved.pages };
    await api.putMeta(f.id, 'ocr', await pdfkit.gzipJSON(data), 'application/gzip');
    await api.putMeta(f.id, 'text', await pdfkit.gzipJSON(t), 'application/gzip');
    await store.put('texts', f.id, t); await store.put('texts', f.id + ':ocr', data);
    const set = { ocr: when, text: true };
    const now = fileById(f.id);
    if (now && S.prefs.autoName !== false && (!now.orig || now.name === now.orig) && pages[0] && saved.pages[0]) {   // still its file name: name it 저자_제목
      if (first && first.name) set.name = first.name + '.pdf';
    }
    const r = await api.ops([{ op: 'updateFile', id: f.id, set }]);
    S.index = r.index; applyPending(await store.get('kv', 'pendingOps')); await store.put('kv', 'index', S.index); syncTags.lib = '';
    await store.del('kv', 'ocr:' + f.id); for (const i of todo) await store.del('kv', key(i));
    if (S.reader && S.readerId === f.id) S.reader.setOcr(data.pages, t);
    if (S.reader) { renderUsage(); readerSync(); } else renderBg();
    libSoon();
  } finally { doc.destroy(); }
}
function showOcrProgress() {   // just the line under the paper's name, not the whole list
  for (const s of document.querySelectorAll('.row.file .ocr-p')) {
    const id = s.closest('.row').dataset.file;
    const f = fileById(id);
    s.textContent = !isScan(f) ? '' : OCR.id === id ? ` · 글자 읽는 중 ${OCR.done}/${OCR.total}쪽` : needsOcr(f) ? ' · 스캔본' : '';
  }
}
async function ocrData(f) {   // a read paper's words for the reader: kept here, else fetched once
  let d = await store.get('texts', f.id + ':ocr').catch(() => null);
  if (d || !navigator.onLine) return d;
  try { d = await pdfkit.gunzipJSON(await api.getMeta(f.id, 'ocr')); await store.put('texts', f.id + ':ocr', d); } catch (e) { d = null; }
  return d;
}

/* ---------- where a paper was published (journal · society · date), read from its first page and kept in its page texts,
   and in the library's index too (f.paper), so every device shows it at once — a new one without fetching any paper's texts.
   S.info: id -> { journal, society, issue, date } or null, what this device read ---------- */
// (a new device reads a paper's texts every half second or so: their lines are drawn together — 1.5 s after the last one,
// and at least every 4 s while they keep coming — and then only the rows whose line changed are written: patchList)
let infoT = null, infoFirst = 0, infoDraw = false;
function notePaper(id, t, quiet) {
  if (!t || t.paper === undefined) return;
  const v = t.paper || null;
  queuePaper(id, v);
  if (JSON.stringify(S.info[id] ?? null) === JSON.stringify(v) && id in S.info) return;
  S.info[id] = v;
  if (!quiet) infoDraw = true;
  const now = Date.now();
  if (!infoT) infoFirst = now;
  clearTimeout(infoT);
  infoT = setTimeout(() => {
    infoT = null;
    store.put('kv', 'paperInfo', S.info);
    if (infoDraw && !S.reader) renderBg();
    infoDraw = false;
  }, Math.max(0, Math.min(1500, infoFirst + 4000 - now)));
}
const paperOf = (r) => (r && (r.journal || r.date) ? { journal: r.journal || '', society: r.society || '', issue: r.issue || '', date: r.date || '' } : null);
const infoOf = (f) => (f && (f.paper || S.info[f.id])) || null;   // the index's (shared, newest) first, else what this device read
// a paper's line written into the library's index as well (a few at a time, once each), never clearing what is there
const paperQ = new Map();
function queuePaper(id, v) {
  const f = fileById(id), want = paperOf(v);
  if (!f || !want || JSON.stringify(f.paper || null) === JSON.stringify(want)) return;
  paperQ.set(id, want);
  clearTimeout(queuePaper.t); queuePaper.t = setTimeout(flushPapers, 2500);
}
async function flushPapers() {
  if (!paperQ.size || !syncOn || !navigator.onLine) return;
  const ops = [...paperQ].map(([id, paper]) => ({ op: 'updateFile', id, set: { paper } }));
  paperQ.clear();
  try {
    for (let i = 0; i < ops.length; i += 40) {
      const r = await api.ops(ops.slice(i, i + 40));
      S.index = r.index; applyPending(await store.get('kv', 'pendingOps')); await store.put('kv', 'index', S.index); syncTags.lib = '';
    }
  } catch (e) { /* the next start asks again */ }
}
function seedPapers() {   // what this device read before the index kept lines: written there once
  for (const f of liveFiles()) if (S.info[f.id]) queuePaper(f.id, S.info[f.id]);
}
const pubText = (d) => (d ? d.replace(/^(\d{4})-(\d{2})(?:-\d{2})?$/, (m, y, mo) => `${y}. ${+mo}.`).replace(/^(\d{4})$/, '$1.') : '');   // 2018-03 → 2018. 3.; a year alone → 2018.
function paperLine(f) {   // 학술지 · 학회 · 발간일, as a citation lists them (a narrow screen leaves the society out, so the date stays in view)
  const i = infoOf(f);
  if (!i || !(i.journal || i.date)) return '';
  const jn = String(i.journal || '').replace(/[\s┃│|ㅣ]+$/, '');   // a stray rule character read with it
  // (a journal known for certain gives its society though the page did not print it; a journal read without its 권호 says so —
  // the line is not to be copied into a footnote as it is)
  const soc = i.society || (jn && typeof naming.journalSociety === 'function' ? naming.journalSociety(jn) : '');
  const part = jn && typeof naming.issuePartial === 'function' && naming.issuePartial(i);
  let s = jn ? esc(jn) + (i.issue ? ' ' + esc(i.issue) : '') : '';
  if (soc) s += s ? `<span class="soc"> · ${esc(soc)}</span>` : esc(soc);
  if (i.date) s += (s ? ' · ' : '') + esc(pubText(i.date));
  if (part) s += '<span class="pl-part"> · 권호 확인 필요</span>';
  return s;
}
function paperLineText(f) {   // the same, as plain words (a menu's head)
  const i = infoOf(f);
  if (!i || !(i.journal || i.date)) return '';
  const jn = String(i.journal || '').replace(/[\s┃│|ㅣ]+$/, '');
  return [[jn, jn && i.issue].filter(Boolean).join(' '), i.society, i.date ? pubText(i.date) : ''].filter(Boolean).join(' · ');
}
// papers whose texts were made before this was read: fetch the newer texts once, or read the first page here and share it
let filling = false;
const askedInfo = new Set();
// A paper known as "nothing found" is asked about again at most once a day: the server may know more by now
// (another device read it, or the reading improved). What is shown meanwhile stays as it was.
let infoAsked = {};
const askAgain = (id) => S.info[id] === null && Date.now() - (infoAsked[id] || 0) > 864e5;
async function fillPaperInfo() {
  if (filling || !syncOn) return;
  filling = true;
  try {
    for (const f of liveFiles().filter((x) => x.text && !x.paper && !askedInfo.has(x.id) && (!(x.id in S.info) || askAgain(x.id)))) {   // (a line the index keeps needs no texts fetched)
      if (!navigator.onLine || document.hidden) break;
      if (needsOcr(f) || OCR.id === f.id) continue;   // a scan still to be read: its reading fills this in (and writes its texts)
      let t = await store.get('texts', f.id).catch(() => null);
      if (t && t.paper !== undefined && !(f.id in S.info)) { notePaper(f.id, t); if (t.paper) continue; }
      askedInfo.add(f.id); infoAsked[f.id] = Date.now(); store.put('kv', 'paperInfoAsked', infoAsked);   // the server's page texts
      await fgWait();
      try {
        const s = await pdfkit.gunzipJSON(await api.getMeta(f.id, 'text'));
        if (s && s.paper !== undefined) { await store.put('texts', f.id, s); notePaper(f.id, s); if (s.paper) continue; }
        t = s || t;
      } catch (e) { continue; }
      if (!t || !S.cached.has(f.id)) continue;   // the PDF is not on this device: a device that has it will do it
      let doc = null;
      try {
        doc = await pdfkit.openBytes(await (await getBytes(f)).arrayBuffer());
        if (!f.ocr) {   // text that is garbage (a broken font), from before upload caught it: the paper is read like a scan, which also names it
          const pics = await pdfkit.picturePages(doc, t.pages || []).catch(() => []);
          if (pics.length > (f.scan || 0)) {
            const r = await api.ops([{ op: 'updateFile', id: f.id, set: { scan: pics.length } }]);
            S.index = r.index; applyPending(await store.get('kv', 'pendingOps')); await store.put('kv', 'index', S.index); syncTags.lib = '';
            ocrSoon(1500); if (!S.reader) renderBg();
            continue;
          }
        }
        const o = f.ocr ? await ocrData(f) : null;   // a read scan: its first pages are the words read, not the (empty) text layer
        const items = async (i) => {
          if (i >= doc.numPages) return null;
          if (o && o.pages && o.pages[i]) { const pg = await doc.getPage(i + 1); const vp = pg.getViewport({ scale: 1 }); pg.cleanup(); return ocrPageItems(i, o.pages[i], vp.width, vp.height); }
          return (await pdfkit.pageItems(doc, i)).page;
        };
        const paper = paperOf(naming.readFirstPages(await items(0), await items(1), await morePages(doc, items), await kci.names()));
        if (paper || t.paper === undefined) {   // written only when it says something new
          t.paper = paper;
          await store.put('texts', f.id, t);
          await api.putMeta(f.id, 'text', await pdfkit.gzipJSON(t), 'application/gzip');
        }
        notePaper(f.id, { paper });
      } catch (e) { /* next time */ } finally { if (doc) doc.destroy(); }
    }
  } finally { filling = false; }
  await rereadLines().catch(() => {});
  libraryInfo();
}
// once, with the reading of where a paper was published that came in November 2026 (cite.js: the running heads and feet,
// the pages after a cover): a paper on this device whose line lacks its 권호 or its month, or carries a garbled journal, is read
// again from its own first pages — and only what is missing (or garbled) is filled; what the line holds stays
let rereading = false;
async function rereadLines() {
  if (rereading || !syncOn || S.reader) return;
  rereading = true;
  try {
    const done = (await store.get('kv', 'cite2Done').catch(() => null)) || {};
    const lacks = (i) => !i || !i.issue || !/^\d{4}-\d{2}/.test(i.date || '') || !i.journal || biblio.junkName(i.journal);
    let n = 0;
    for (const f of liveFiles().filter((x) => S.cached.has(x.id) && !done[x.id] && lacks(infoOf(x)))) {
      if (!navigator.onLine || document.hidden || S.reader || n >= 12) break;   // (a dozen at a time; the rest on a later round)
      if (needsOcr(f) || OCR.id === f.id) continue;
      await fgWait();
      let doc = null;
      try {
        doc = await pdfkit.openBytes(await (await getBytes(f)).arrayBuffer());
        const o = f.ocr ? await ocrData(f) : null;
        const items = async (i) => {
          if (i >= doc.numPages) return null;
          if (o && o.pages && o.pages[i]) { const pg = await doc.getPage(i + 1); const vp = pg.getViewport({ scale: 1 }); pg.cleanup(); return ocrPageItems(i, o.pages[i], vp.width, vp.height); }
          return (await pdfkit.pageItems(doc, i)).page;
        };
        const got = paperOf(naming.readFirstPages(await items(0), await items(1), await morePages(doc, items), await kci.names()));
        const cur = infoOf(f);
        if (got) {
          const next = biblio.fillLine(cur, got);
          if (JSON.stringify(paperOf(next)) !== JSON.stringify(paperOf(cur))) notePaper(f.id, { paper: paperOf(next) });
        }
        done[f.id] = Date.now(); n++;
        store.put('kv', 'cite2Done', done).catch(() => {});
      } catch (e) { /* a later round */ } finally { if (doc) doc.destroy(); }
    }
  } finally { rereading = false; }
}

/* ---------- what the first page did not say: 국립중앙도서관's record of the paper, found by its title (and author) ----------
   Only what is missing is filled — a date (or a whole date where only the year was read) and the society that published it;
   what the page itself said is never changed. The answer is written into the paper's texts like the rest, so every device
   has it. A paper the library does not know is asked about again after a month. */
let libAsked = null, kciAsked = null, libRunning = false;
const libNorm = biblio.norm;
const hasAuthor = (name) => /^[^_]{2,20}_\S/.test(name);
const mainTitle = (t) => { const m = /^(.{8,}?)\s+[-―—–]\s*\S.*$/.exec(t) || /^(.{8,}?)\s*:\s*\S.*$/.exec(t); return (m ? m[1] : t).trim(); };   // the subtitle off
function libAuthor(x) {   // 林智奉 → 임지봉; "홍길동 ; 김철수" → 홍길동 외
  const names = String((x && x.authorInfo) || '').replace(/<[^>]+>/g, '').split(/\s*[;,·]\s*|\s{2,}/)
    .map((s) => naming.personName(s.replace(/\s*(?:\[[^\]]*\]|\([^)]*\)|저|지음|공저|편저|편|역|옮김)$/g, '').trim())).filter(Boolean);
  return names.length ? names[0] + (names.length > 1 ? ' 외' : '') : '';
}
// 국회도서관 국가학술정보 클라우드: its records (학술기사) found by the title, each with its authors in Hangul, its journal and its
// publisher — the surest outside answer to "who wrote this" and "where" for a Korean law paper
async function nanetRows(title) {
  const d = await papers.ask('search', { searchTerm: biblio.searchTerm(title), searchRange: 'ARTICLE', printRowCnt: '10' });
  return (d && d.result && d.result[0] && d.result[0].searchList) || [];
}
const sameTitle = (rows, title) => { const want = libNorm(mainTitle(title)); return rows.filter((x) => libNorm(mainTitle(papers.clean(x.title).split(/\s=\s/)[0])) === want); };
const nanetNames = (x) => ((x && x.authorList) || []).map((a) => naming.personName(a.name)).filter(Boolean);
const nameText = (names) => (names.length === 1 ? names[0] : names.length === 2 ? names.join('·') : names[0] + ' 외');   // as the first page's names are written
function nanetAuthor(same) {   // one name text when every record of the title agrees on it, else ''
  const who = [...new Set(same.map(nanetNames).filter((n) => n.length).map(nameText))];
  return who.length === 1 ? who[0] : '';
}
// asked again a few seconds after a paper arrives or is read (several arrivals: one round); a call while a round runs comes after it
function libSoon(ms = 4000) { clearTimeout(libSoon.t); libSoon.t = setTimeout(() => libraryInfo(), ms); }
let libAgain = false;
// a paper's line, set in its texts (the server's copy and this device's) when it says more than before; true when written.
// It is written onto the server's texts as they are now (a scan read on another device has its words there, which this
// device's copy may not have yet), and not while this device is reading the scan's words (its texts are about to change).
async function writePaper(f, cur, merged) {
  if (!paperOf(merged) || JSON.stringify(paperOf(merged)) === JSON.stringify(paperOf(cur))) return false;
  if (OCR.id === f.id) return false;
  try {
    const t = await pdfkit.gunzipJSON(await api.getMeta(f.id, 'text'));
    t.paper = paperOf(merged);
    await store.put('texts', f.id, t);
    await api.putMeta(f.id, 'text', await pdfkit.gzipJSON(t), 'application/gzip');
    notePaper(f.id, t, true);
    return true;
  } catch (e) { return false; }   // next time
}
let verAsked = null;
async function libraryInfo() {
  if (libRunning) { libAgain = true; return; }
  if (!syncOn || !navigator.onLine) return;
  libRunning = true;
  let changed = false;
  const wrote = new Map();   // the lines written in this round
  try {
  // (3: every paper whose line wants something asked again once, now that the libraries' records are merged)
  if (!libAsked) libAsked = (await store.get('kv', 'libAsked3').catch(() => null)) || {};
  for (const f of liveFiles()) {
    if (!navigator.onLine || document.hidden) break;
    const unnamed = !hasAuthor(f.name) && (!f.orig || f.name === f.orig) && S.prefs.autoName !== false && !f.pending;   // still its uploaded name
    const known = f.id in S.info || !!f.paper;   // its first page was read (a scan still to be read is not, yet it can be named from its title)
    const name = stem(f.name), cut = hasAuthor(f.name) ? name.indexOf('_') : -1;
    const author = cut > 0 ? name.slice(0, cut).replace(/\s*외$/, '') : '', title = (cut > 0 ? name.slice(cut + 1) : name).trim();
    if (!(unnamed || (known && biblio.wants(infoOf(f), title))) || Date.now() - (libAsked[f.id] || 0) < 30 * 864e5) continue;
    if (libNorm(title).length < 6) continue;
    libAsked[f.id] = Date.now(); store.put('kv', 'libAsked3', libAsked).catch(() => {});
    await fgWait();
    let rows = [];   // 국회도서관's records found by this title
    try { rows = await nanetRows(title); } catch (e) {
      // offline, or 국회도서관's daily allowance used up: this paper is asked again another time, and the round ends here
      if (api.isOffline(e) || (e && e.code === 'busy')) { delete libAsked[f.id]; store.put('kv', 'libAsked3', libAsked).catch(() => {}); break; }
    }
    const same = sameTitle(rows, title);
    let d = null;
    try { d = await api.nlib('search', { apiType: 'json', srchTarget: 'title', kwd: mainTitle(title).slice(0, 60), pageNum: '1', pageSize: '10' }); } catch (e) { if (api.isOffline(e)) break; }
    if (unnamed) {   // named 저자_제목 only when the libraries' records of exactly this title agree on one author (국회도서관 first)
      let who = nanetAuthor(same);
      if (!who) {
        const want = libNorm(mainTitle(title));
        const nl = ((d && d.result) || []).filter((x) => /기사|논문/.test(x.typeName || '') && libNorm(mainTitle(String(x.titleInfo || '').replace(/<[^>]+>/g, '').split(/\s=\s/)[0])) === want);
        const names = [...new Set(nl.map(libAuthor).filter(Boolean))];
        if (names.length === 1) who = names[0];
      }
      if (who) {
        try {
          const r = await api.ops([{ op: 'updateFile', id: f.id, set: { name: `${who}_${mainTitle(title)}.pdf` } }]);
          S.index = r.index; applyPending(await store.get('kv', 'pendingOps')); await store.put('kv', 'index', S.index); syncTags.lib = ''; changed = true;
        } catch (e) { /* next time */ }
      }
      if (!known || !biblio.wants(infoOf(fileById(f.id) || f), title)) continue;
    }
    // where it was published: what the first page said, set right and filled in by the libraries' records of this very paper
    // (국회도서관: the journal; 국립중앙도서관: the date to the month; Crossref: the volume, issue and month)
    const cur = infoOf(fileById(f.id) || f) || {};
    const nanet = biblio.nanetOf(rows, title, author), nl = biblio.nlOf((d && d.result) || [], title, author);
    let merged = biblio.merge(cur, { nanet, nl, title }).info;
    if (merged.journal && (!merged.issue || !/^\d{4}-\d{2}/.test(merged.date))) {
      const cr = await papers.crossref({ title: mainTitle(title), year: String(merged.date || '').slice(0, 4), authors: [] }).catch(() => null);
      if (cr) merged = biblio.merge(cur, { nanet, nl, cr, title }).info;
      await new Promise((ok) => setTimeout(ok, 350));   // Crossref is asked gently, one paper at a time
    }
    if (await writePaper(f, cur, merged)) { changed = true; wrote.set(f.id, merged); }
  }
  // KCI (한국연구재단): the month, and the issue when it can be told, of papers whose line names the journal but not yet both
  // (the issue a line names gives the month; a known month gives the issue) — asked once a month, apart from the round above
  if (!kciAsked) kciAsked = (await store.get('kv', 'kciAsked1').catch(() => null)) || {};
  let kciFails = 0;
  for (const f of liveFiles()) {
    if (!navigator.onLine || document.hidden) break;
    const cur = wrote.get(f.id) || infoOf(f);   // (a line written just now reaches the index a moment later)
    if (!cur || !cur.journal || (cur.issue && /^\d{4}-\d{2}/.test(cur.date || '')) || Date.now() - (kciAsked[f.id] || 0) < 30 * 864e5) continue;
    kciAsked[f.id] = Date.now(); store.put('kv', 'kciAsked1', kciAsked).catch(() => {});
    await fgWait();
    const name = stem(f.name), cut = hasAuthor(f.name) ? name.indexOf('_') : -1, title = (cut > 0 ? name.slice(cut + 1) : name).trim();
    let k = null;
    try { k = await kci.fill(cur, title); kciFails = 0; } catch (e) {
      // not answered (offline, KCI or the portal out of reach, its day's limit): this paper is asked again in three days, and
      // the round stops when it happens again and again (a paper's own trouble does not hold up the others)
      kciAsked[f.id] = Date.now() - 27 * 864e5; store.put('kv', 'kciAsked1', kciAsked).catch(() => {});
      if (api.isOffline(e) || ++kciFails >= 3) break;
      continue;
    }
    if (!k) continue;
    const merged = { ...cur, issue: cur.issue || k.issue, society: cur.society || k.society, date: /^\d{4}-\d{2}/.test(cur.date || '') ? cur.date : k.date };
    if (await writePaper(f, cur, merged)) { changed = true; wrote.set(f.id, merged); }
  }
  // what the paper itself prints, over every record: the issue and month printed with its journal's name (its DOI only
  // telling which printed issue is its own); a printer named as the society gives way to the journal's society; a line with
  // no journal takes the one the DOI on its first page names (Crossref) — once for each paper that has a line (and again
  // when this check is made better)
  if (!verAsked) verAsked = (await store.get('kv', 'verify1').catch(() => null)) || {};
  for (const f of liveFiles()) {
    if (!navigator.onLine || document.hidden) break;
    if (verAsked[f.id] || OCR.id === f.id) continue;
    const t = await store.get('texts', f.id).catch(() => null);
    if (!t || !Array.isArray(t.pages) || !t.pages.length) continue;   // (its text is not on this device yet: next time)
    const cur = wrote.get(f.id) || infoOf(f);
    if (!cur) continue;   // (no line yet: checked once it has one)
    verAsked[f.id] = Date.now(); store.put('kv', 'verify1', verAsked).catch(() => {});
    await fgWait();
    let kj = null;
    try { kj = cur.journal ? await kci.journalOf(cur.journal, cur.society) : null; } catch (e) { kj = null; }
    let next = verify.check(cur, t.pages[0] || '', t.pages[1] || '', kj).line;
    if (!next.journal) {
      const dois = verify.doisOf(t.pages[0] || '');
      const found = [];
      for (const doi of dois.slice(0, 3)) { try { const c = await papers.crossrefDoi(doi); if (c && c.journal) found.push(c); } catch (e) { break; } }
      if (found.length && found.every((c) => c.journal === found[0].journal)) {
        const c = found[0], kc = await kci.journalOf(c.journal).catch(() => null);
        const vol = String(+c.volume || ''), no = String(+c.issue || '');
        next = { ...next, journal: kc ? kc.k : c.journal, society: next.society || (kc && kc.p) || '',
          issue: next.issue || (vol && no ? `제${vol}권 제${no}호` : ''),
          date: c.year && c.month && (!next.date || next.date === c.year) ? `${c.year}-${c.month}` : next.date };
      }
    }
    if (await writePaper(f, cur, next)) { changed = true; wrote.set(f.id, next); }
  }
  } finally {
    libRunning = false;
    if (changed && !S.reader) renderBg();   // drawn once, after all of them
    if (libAgain) { libAgain = false; libSoon(1500); }
  }
}

/* ---------- every paper's marks kept on this device as well (for 찾기, also without internet) ----------
   One small request lists every paper's marks version; only papers whose marks changed are fetched. */
let marksCache = null, allMarksAt = 0, allMarksP = null;
function fetchAllMarks(force) {
  if (allMarksP) return allMarksP;
  if (!syncOn || !navigator.onLine || (!force && Date.now() - allMarksAt < 60e3)) return Promise.resolve(false);
  allMarksP = (async () => {
    let changed = false;
    try {
      const tags = await api.marksTags();
      allMarksAt = Date.now();
      const known = new Set(S.index.files.map((f) => f.id));
      for (const [id, tag] of Object.entries(tags)) {
        if (!known.has(id) || id === S.readerId) continue;   // the open paper keeps itself up to date
        const local = await store.get('marks', id);
        if (local && local.tag === tag) continue;
        const r = await api.getMarks(id);
        const now = (await store.get('marks', id)) || { marks: [], pending: false };
        await store.put('marks', id, { marks: mergeMarks(r.marks || [], now.marks), pending: now.pending, tag: r.tag || tag });
        changed = true;
      }
    } catch (e) { /* offline or busy: next time */ }
    if (changed) marksCache = null;
    return changed;
  })().finally(() => { allMarksP = null; });
  return allMarksP;
}
async function allMarks() {   // paper id -> its marks that have words, from this device
  if (marksCache) return marksCache;
  const m = new Map();
  for (const [id, r] of await store.entries('marks').catch(() => [])) {
    const list = r && r.marks ? r.marks.filter((x) => !x.del && x.text) : [];
    if (list.length) m.set(id, list.sort((a, b) => (a.p - b.p) || ((a.rects?.[0]?.[1] ?? 0) - (b.rects?.[0]?.[1] ?? 0))));
  }
  return (marksCache = m);
}
function pageLabel(id, p, found) {   // printed page number when known, else the PDF page (both ○쪽)
  const o = (S.state.files[id] || {}).o;
  const off = Number.isInteger(o) ? o : found;
  return Number.isInteger(off) ? printedPage(p, off) : (p + 1) + '쪽';
}
// PDF page p (0-based) by its printed number, o its offset; a page before the one printed 1 (a notice or a cover put before
// the paper: the offset is below zero) has no number of its own — 표지, as the reader names it
function printedPage(p, o) { const v = p + 1 + o; return v >= 1 ? v + '쪽' : '표지'; }
async function printedOffsets(ids) {   // id -> how far the printed page numbers run ahead of the PDF's, as the page texts found it
  const out = new Map();
  for (const id of ids) {
    const t = await store.get('texts', id).catch(() => null), L = t && t.labels;
    if (L && L.confident && Number.isInteger(L.offset)) out.set(id, L.offset);
  }
  return out;
}
async function markHits(key) {
  const live = new Map(liveFiles().map((f) => [f.id, f]));
  const out = [];
  for (const [id, list] of await allMarks()) {
    const f = live.get(id); if (!f) continue;
    const snips = [];
    for (const m of list) {
      const t = m.text, ff = findForm(t), map = ff.map, k = keyFor(findKey(key), ff);
      const i = ff.flat.indexOf(k); if (i < 0) continue;
      const a = map[i], b = map[i + k.length - 1] + 1;
      snips.push({ m, pre: a > 40, a: t.slice(Math.max(0, a - 40), a), w: t.slice(a, b), b: t.slice(b, b + 70), post: b + 70 < t.length });
    }
    if (snips.length) out.push({ f, snips });
  }
  return out.sort((x, y) => y.snips.length - x.snips.length || x.f.name.localeCompare(y.f.name, 'ko'));
}

/* ---------- 예전 표시 되살리기: the server keeps how a paper's marks were before each day's first change (60 days) ---------- */
const when = (t) => new Date(t).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
async function marksBack(f) {
  if (noNet()) { toast(unreached('할 수 있습니다')); return; }
  let list;
  try { await pushMarks(f.id); list = await api.marksHistory(f.id); }
  catch (e) { toast(offline(e) ? unreached('할 수 있습니다') : '불러오지 못했습니다'); return; }
  if (!list.length) { toast('되살릴 예전 표시가 없습니다. 표시를 바꾸면, 그날 처음 바꾸기 전 상태가 60일 동안 남습니다.', 6000); return; }
  const box = sheet(`<h2>예전 표시 되살리기</h2><p class="sheet-p small">「${esc(stem(f.name))}」의 표시를 고른 때의 상태로 되돌립니다. 지금 표시도 남겨 두므로 다시 되돌릴 수 있습니다.</p>
    <ul class="hist">${list.map((h) => `<li><button class="hist-b" data-ts="${h.ts}"><b>${esc(when(h.updated || h.ts))}</b><span>표시 ${h.n}개</span></button></li>`).join('')}</ul>`);
  $('.hist', box).onclick = (e) => { const b = e.target.closest('[data-ts]'); if (!b) return; closeSheet(); restoreMarksTo(f, Number(b.dataset.ts), true); };
}
async function restoreMarksTo(f, ts, offerUndo) {
  try {
    const before = ((await store.get('marks', f.id)) || { marks: [] }).marks.filter((m) => !m.del).length;
    const r = await api.restoreMarks(f.id, ts);
    await store.put('marks', f.id, { marks: r.marks, pending: false, tag: r.tag || '' }); marksCache = null;
    if (S.reader && S.readerId === f.id) S.reader.setRemoteMarks(r.marks);
    const n = r.marks.filter((m) => !m.del).length;
    const undo = offerUndo && before ? { label: '되돌리기', fn: async () => {   // what was there a moment ago was kept by the server
      const l = await api.marksHistory(f.id).catch(() => []);
      const back = l.find((h) => Math.abs(h.ts - r.updated) < 120e3);
      if (back) restoreMarksTo(f, back.ts, false); else toast('되돌리지 못했습니다');
    } } : undefined;
    toast(`표시 ${n}개로 되살렸습니다`, 9000, undo);
  } catch (e) { toast(offline(e) ? unreached('할 수 있습니다') : '되살리지 못했습니다'); }
}

/* ---------- all marks in one file, for keeping a copy yourself (readable, with the data inside) ---------- */
async function exportAllMarks() {
  toast('모으는 중…', 30000);
  await fetchAllMarks(true);
  const all = await allMarks();
  const files = liveFiles().filter((f) => all.has(f.id)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  if (!files.length) { toast('아직 표시가 없습니다'); return; }
  const day = new Date().toLocaleDateString('sv-SE');
  const n = files.reduce((s, f) => s + all.get(f.id).length, 0);
  const offs = await printedOffsets(files.map((f) => f.id));
  const full = {};
  for (const [id, r] of await store.entries('marks').catch(() => [])) if (r && r.marks && r.marks.length) full[id] = r.marks;
  const data = JSON.stringify({ app: '연구실 책장', at: Date.now(), index: S.index, state: S.state, marks: full }).replace(/</g, '\\u003c');
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>연구실 책장 표시 ${day}</title>
<style>body{margin:0 auto;max-width:760px;padding:28px 18px 60px;font:16px/1.7 -apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#1b2433;background:#fff}h1{font-size:22px;margin:0}p.s{color:#5a6578;margin:4px 0 26px}h2{font-size:17px;margin:30px 0 8px;padding-top:14px;border-top:1px solid #e3e7ee}p.j{margin:-6px 0 8px;color:#5a6578;font-size:14px}ol{list-style:none;margin:0;padding:0}li{display:flex;gap:12px;padding:7px 0}.pg{flex:none;width:52px;color:#7b8597;font-size:13px;padding-top:3px}.t{background:linear-gradient(transparent 55%,color-mix(in srgb,var(--c) 55%,transparent) 55%)}.t[data-k=ul]{background:none;text-decoration:underline;text-decoration-color:var(--c);text-decoration-thickness:2px;text-underline-offset:4px}@media print{h2{break-after:avoid}li{break-inside:avoid}}</style></head><body>
<h1>연구실 책장 표시</h1><p class="s">${day} · 논문 ${files.length}편 · 표시 ${n}개</p>
${files.map((f) => `<h2>${esc(stem(f.name))}</h2>${paperLine(f) ? `<p class="j">${paperLine(f)}</p>` : ''}<ol>${all.get(f.id).map((m) => `<li><span class="pg">${pageLabel(f.id, m.p, offs.get(f.id))}</span><span class="t" data-k="${m.kind}" style="--c:${esc(m.color)}">${esc(m.text)}</span></li>`).join('')}</ol>`).join('\n')}
<script type="application/json" id="shelf-backup">${data}</script></body></html>`;
  const file = new File([html], `연구실 책장 표시 ${day}.html`, { type: 'text/html' });
  hideToast();
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); } catch (e) { /* closed */ }
    return;
  }
  const url = URL.createObjectURL(file);
  const a = el('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast('내려받았습니다');
}

/* ---------- reading positions ---------- */
let stateT = null; const stateDirty = new Set();
function savePosition(id, pos, pages, now) {
  if (!id) return;
  S.state.files[id] = { page: pos.page, y: pos.y, at: Date.now(), done: pages ? pos.page >= pages - 1 : false };
  if (Number.isInteger(pos.o)) S.state.files[id].o = pos.o;
  stateDirty.add(id);
  store.put('kv', 'state', S.state);
  clearTimeout(stateT); stateT = setTimeout(pushState, now ? 0 : 1500);
}
async function pushState() {
  const ids = [...stateDirty]; if (!ids.length || !navigator.onLine) return;
  const files = {}; for (const id of ids) files[id] = S.state.files[id];
  try { const st = await api.putState(files); for (const id of ids) stateDirty.delete(id); mergeState(st); store.put('kv', 'state', S.state); } catch (e) { /* later */ }
}
window.addEventListener('pagehide', () => { if (S.reader) savePosition(S.readerId, S.reader.current(), S.reader.N, true); });

/* ---------- fetch new files ahead (so they open at once, also offline) ---------- */
let prefetching = false;
async function prefetch() {
  if (prefetching || !navigator.onLine || document.hidden) return;
  prefetching = true;
  try { await prefetchRun(); } finally { prefetching = false; }
}
async function prefetchRun() {
  await bundleTexts();   // (a new device: every paper's texts in a few answers)
  for (const f of liveFiles().filter((x) => x.text)) {   // page texts are small: always kept, for search
    if (!navigator.onLine || document.hidden) return;
    const have = await store.get('texts', f.id).catch(() => null);
    if (have && (!f.ocr || have.ocr === f.ocr)) continue;
    await fgWait();
    try { await textOf(f); } catch (e) { break; }
  }
  const mode = keepMode();
  if (mode === 'opened') return;
  const since = Date.now() - 30 * 86400e3;
  const todo = liveFiles().filter((f) => (mode === 'all' || f.added > since || ((S.state.files[f.id] || {}).at || 0) > since) && !S.cached.has(f.id)).sort((a, b) => b.added - a.added);
  const est = await store.estimate().catch(() => null);
  let budget = mode === 'all' ? (est && est.quota ? est.quota * 0.8 - (est.usage || 0) : 8 * 1024 ** 3) : 600 * 1024 * 1024;
  for (const f of todo) {
    if (!navigator.onLine || document.hidden) break;
    if (S.readerId && !S.cached.has(S.readerId)) { await new Promise((r) => setTimeout(r, 1500)); continue; }   // the open paper first
    await fgWait();
    if (f.size > budget) continue;
    // (kept here now: the usage line, and that one row's mark — a redraw of the frame's own, which writes that row only)
    try { await getBytes(f); budget -= f.size; renderUsage(); renderBg(); } catch (e) { break; }
    if (f.ocr) await ocrData(f);
  }
}
// an iPad keeps every paper (readable without internet), a phone the last 30 days, a computer only what was opened
function keepMode() {
  if (S.prefs.keep) return S.prefs.keep;
  const iPad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;   // iPadOS reports itself as a Mac
  const touch = iPad || matchMedia('(pointer: coarse)').matches;
  return !touch ? 'opened' : Math.min(screen.width, screen.height) < 600 ? 'recent' : 'all';
}

/* ================= settings ================= */
/* ---------- 점검 결과: the server's daily check of the outside sources (/api/diag/last) ---------- */
// Each day the server (its hourly cron, and a check from Korea when a device there signs in) asks every outside source once;
// a source counts as working that day when any check found it working, and as failing when it did not work two days in a
// row. 설정 shows the last 14 days; a screen whose source failed two days in a row says so in one quiet line under its box.
const SRC_NAMES = { data: '헌재 판례정보', ccourt: '헌재 소식', acrc: '행정심판 재결례', law: '국가법령정보센터', moleg: '법제처 해석례·규칙',
  assembly: '국회 의안정보', nars: '국회입법조사처', kci: 'KCI 논문 수집', kcisearch: 'KCI 논문 검색', nanet: '국회도서관', nl: '국립중앙도서관',
  scienceontoken: 'ScienceON 접속', scienceon: 'ScienceON', anthropic: '다듬기 (Claude)' };
const SCREEN_SRCS = { cases: ['data', 'ccourt', 'acrc', 'law', 'moleg'], law: ['law', 'moleg', 'assembly', 'nars'], papers: ['kci', 'kcisearch', 'nanet', 'scienceontoken', 'scienceon', 'nars'] };
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const dayDot = (day, year) => { const [y, m, d] = day.split('-'); return `${year ? y + '. ' : ''}${+m}. ${+d}.`; };
const DIAG_FRESH = 3 * 3600e3;
let diagMem = null, diagAsk = null, diagMiss = 0;   // { got, d } (d: null when the server has no record yet); the last failed ask
async function diagLast(force) {
  if (!diagMem) { const k = await store.get('kv', 'diagLast').catch(() => null); if (k && k.got) diagMem = k; }
  if (!force && diagMem && Date.now() - diagMem.got < DIAG_FRESH) return diagMem.d;
  const fail = (code) => Object.assign(new Error(code), { code });
  if (!force && Date.now() - diagMiss < 10 * 60e3) { if (diagMem) return diagMem.d; throw fail('server'); }   // (asked again in a while)
  if (!api.base() || !api.hasToken()) throw fail('auth');
  if (navigator.onLine === false) throw fail('offline');
  diagAsk = diagAsk || (async () => {
    let r;
    try { r = await fetch(api.base() + '/api/diag/last', { headers: api.authHeader(), cache: 'no-store' }); } catch (e) { throw fail(navigator.onLine === false ? 'offline' : 'server'); }
    const d = await r.json().catch(() => null);
    if (r.status === 404) return null;   // (no check made yet)
    if (!r.ok || !d) throw fail((d && d.error) || 'http_' + r.status);
    // kept: what the screens need (the answers' own text is left on the server)
    return { at: d.at, from: d.from, country: d.country, days: Array.isArray(d.days) ? d.days : [], failing: Array.isArray(d.failing) ? d.failing : [], acrc: d.acrc || null };
  })().then((d) => { diagMem = { got: Date.now(), d }; store.put('kv', 'diagLast', diagMem).catch(() => {}); return d; }, (e) => { diagMiss = Date.now(); throw e; }).finally(() => { diagAsk = null; });
  return diagAsk;
}
// the sources of this screen that failed two days in a row (an old record — the last check more than a day ago — says nothing)
// a source the screen only falls back on (or adds to) is not news while the one it stands beside works: 국가법령정보센터's own
// service backs up 법제처's, KCI's search and ScienceON add to the KCI index and 국회도서관 (설정 '점검 결과' still lists them all)
const SRC_BESIDE = { law: 'moleg', kcisearch: 'kci', scienceontoken: 'nanet', scienceon: 'nanet' };
const downKeys = (d, screen) => (!d || !d.days || !d.days.length || !d.failing || !d.failing.length || d.days[d.days.length - 1].day < kstDay(Date.now() - 864e5)
  ? [] : (SCREEN_SRCS[screen] || []).filter((k) => d.failing.includes(k) && !(SRC_BESIDE[k] && !d.failing.includes(SRC_BESIDE[k]))));
function downFor(d, screen) { return [...new Set(downKeys(d, screen).map((k) => SRC_NAMES[k].replace(/ 접속$/, '')))]; }
// how many days in a row, to the last day checked, a source did not work (a day with no check ends the count)
function downRun(days, k) {
  let n = 0;
  for (let i = days.length - 1; i >= 0 && days[i].ok && days[i].ok[k] === false; i--) {
    if (i < days.length - 1 && Date.parse(days[i + 1].day) - Date.parse(days[i].day) !== 864e5) break;
    n++;
  }
  return n;
}
// the screen's note: '국회입법조사처에 이틀째 닿지 않습니다 …' (사흘째, 5일째; several sources down for different spans: 며칠째)
function downText(d, screen) {
  const names = downFor(d, screen); if (!names.length) return '';
  const runs = new Set(downKeys(d, screen).map((k) => downRun(d.days, k)));
  const n = runs.size === 1 ? [...runs][0] : 0;
  const span = n === 2 ? '이틀째' : n === 3 ? '사흘째' : n === 4 ? '나흘째' : n > 4 ? (n >= 14 ? `${n}일 넘게` : `${n}일째`) : '며칠째';
  return `${names.join(' · ')}에 ${span} 닿지 않습니다 · 그 결과는 빠질 수 있습니다`;
}
function downNote(cIn, screen) {
  const top = cIn.classList.contains('law-top') ? cIn : cIn.querySelector(':scope > .law-top:not(.is-stale)'); if (!top) return;
  const paint = (d) => {
    if (!top.isConnected) return;
    const t = downText(d, screen);
    let p = top.querySelector(':scope > .dn-note');
    if (!t) { if (p) p.remove(); return; }
    if (!p) { p = el('p', 'dn-note'); top.appendChild(p); }
    p.textContent = t;
  };
  if (diagMem) paint(diagMem.d);
  diagLast().then(paint, () => {});
}
const whyText = (w) => (!w ? '' : /^HTTP \d+$/.test(w) ? w : w === 'refused' ? '요청을 받지 않음' : /timeout|abort/i.test(w) ? '응답 없음' : '연결 안 됨');
function diagHtml(d, keptAt) {
  if (!d) return '<p class="kv-note">아직 점검한 기록이 없습니다 · 서버가 하루 한 번 점검합니다</p>';
  const now = Date.now(), cols = [];
  for (let i = 13; i >= 0; i--) cols.push(kstDay(now - i * 864e5));
  const byDay = new Map((d.days || []).map((x) => [x.day, x]));
  const seen = new Set();
  for (const x of d.days || []) for (const k of Object.keys(x.ok || {})) seen.add(k);
  const srcs = [...Object.keys(SRC_NAMES).filter((k) => seen.has(k)), ...[...seen].filter((k) => !SRC_NAMES[k]).sort()];
  const name = (k) => SRC_NAMES[k] || k;
  const t = new Date((d.at || 0) + 9 * 3600e3);
  const when = d.at ? `${t.getUTCMonth() + 1}. ${t.getUTCDate()}. ${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}` : '';
  const where = d.from === 'cron' ? '자동 점검' : d.country === 'KR' ? '한국에서' : '';
  const failing = d.failing || [];
  // (the record's last day before yesterday: the server has not checked since — what it found then is said as of then)
  const lastDay = (d.days || []).length ? d.days[d.days.length - 1].day : '', stale = lastDay && lastDay < kstDay(now - 864e5);
  // each source not working on the latest day it was checked: since when, and what it answered
  const now0 = [];
  for (const k of srcs) {
    const recs = (d.days || []).filter((x) => x.ok && k in x.ok);
    const last = recs[recs.length - 1];
    if (!last || last.ok[k] !== false) continue;
    let from = last.day;
    for (let i = recs.length - 2; i >= 0 && recs[i].ok[k] === false; i--) from = recs[i].day;
    now0.push(`<li><b>${esc(name(k))}</b> ${from === last.day ? dayDot(from) : `${dayDot(from)}부터`} 안 됨${last.why && last.why[k] ? ` · ${esc(whyText(last.why[k]))}` : ''}</li>`);
  }
  const cell = (day, k) => {
    const x = byDay.get(day), v = x && x.ok ? x.ok[k] : undefined;
    if (v === true) return `<td class="dg-ok" title="${dayDot(day)} 됨"><span class="vh">됨</span></td>`;
    if (v === false) return `<td class="dg-x" title="${dayDot(day)} 안 됨${x.why && x.why[k] ? ' · ' + esc(whyText(x.why[k])) : ''}"><span aria-hidden="true">✕</span><span class="vh">안 됨</span></td>`;
    return `<td class="dg-n" title="${dayDot(day)} ${x ? '점검하지 않음' : '점검 없음'}"><span class="vh">점검 없음</span></td>`;
  };
  const head = cols.map((day) => `<th scope="col" title="${dayDot(day, true)}"${day === cols[cols.length - 1] ? ' class="dg-today"' : ''}>${+day.slice(8)}</th>`).join('');
  const rows = srcs.map((k) => `<tr${failing.includes(k) ? ' class="dg-bad"' : ''}><th scope="row" title="${esc(name(k))}">${esc(name(k))}</th>${cols.map((day) => cell(day, k)).join('')}</tr>`).join('');
  const lastLine = `<p class="kv"><span>마지막 점검</span><b>${esc([when, where].filter(Boolean).join(' · ') || '—')}</b></p>`;
  if (!srcs.length) return lastLine + '<p class="kv-note">날짜별 점검 기록은 아직 없습니다 · 서버가 하루 한 번 점검합니다</p>';
  return lastLine
    + (failing.length ? `<p class="dg-sum dg-warn">${stale ? dayDot(lastDay) + ' 점검에서 ' : ''}이틀 연속 안 된 곳 · ${failing.map((k) => esc(name(k))).join(', ')}</p>` : '<p class="dg-sum">이틀 연속 안 된 곳은 없습니다</p>')
    + (stale ? `<p class="kv-note">${dayDot(lastDay)} 뒤로는 점검한 기록이 없습니다</p>` : '')
    + (now0.length ? `<ul class="dg-why">${now0.join('')}</ul>` : '')
    + (srcs.length ? `<div class="dg-wrap"><table class="dg-t"><caption class="vh">최근 14일 점검 결과</caption><thead><tr><th scope="col" class="dg-c0">${+cols[0].slice(5, 7) === +cols[13].slice(5, 7) ? +cols[0].slice(5, 7) : +cols[0].slice(5, 7) + '–' + +cols[13].slice(5, 7)}월</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      <p class="dg-key" aria-hidden="true"><i class="dg-ok"></i>됨 <i class="dg-x">✕</i>안 됨 <i class="dg-n"></i>점검 없음</p>` : '')
    + (d.acrc && d.acrc.want ? `<p class="kv-note">행정심판 재결례 ${d.acrc.want}개월 가운데 ${Math.min(d.acrc.months || 0, d.acrc.want)}개월을 모았습니다</p>` : '')
    + (keptAt ? `<p class="kv-note">지금은 새 결과를 받지 못해 ${esc(keptAt)}에 받은 결과를 보여 드립니다</p>` : '');
}
async function diagSection(body) {
  try { const d = await diagLast(true); if (body.isConnected) body.innerHTML = diagHtml(d); }
  catch (e) {
    if (!body.isConnected) return;
    if (diagMem) { const t = new Date(diagMem.got + 9 * 3600e3); body.innerHTML = diagHtml(diagMem.d, `${t.getUTCMonth() + 1}. ${t.getUTCDate()}. ${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`); return; }
    body.innerHTML = `<p class="kv-note">${e && e.code === 'offline' ? unreached('볼 수 있습니다', '열어 보세요') : e && e.code === 'server' ? '책장 서버에 닿지 않습니다 · 잠시 뒤 다시 열어 보세요' : '지금은 점검 결과를 불러오지 못했습니다'}</p>`;
  }
}

async function settings() {
  const used = S.index.files.reduce((s, f) => s + (f.size || 0), 0);
  const local = await store.filesSize().catch(() => 0);
  const est = await store.estimate();
  const box = sheet(`<h2>설정</h2>
    <section><h3>저장 공간</h3><p class="kv"><span>책장 서버</span><b>${size(used)} / 9GB</b></p><p class="kv-note">무료 한도(10GB) 안에서만 쓰도록 9GB까지만 올립니다. 휴지통에 있는 것도 비우기 전까지는 자리를 차지합니다.</p><p class="kv"><span>이 기기에 받아 둔 파일</span><b>${size(local)}</b></p>
      ${est && est.quota ? `<p class="kv"><span>이 기기에서 쓸 수 있는 공간</span><b>약 ${size(est.quota)}</b></p>` : ''}
      <div class="keep" role="radiogroup" aria-label="이 기기에 받아 두기"><p class="keep-h">이 기기에 받아 두기 <small>인터넷 없이도 읽을 수 있습니다</small></p>
        ${[['all', '모든 논문'], ['recent', '최근 30일'], ['opened', '열어 본 것만']].map(([k, t]) => `<label class="opt"><input type="radio" name="keep" value="${k}" ${keepMode() === k ? 'checked' : ''}><span>${t}</span></label>`).join('')}
        <p class="keep-n">${S.cached.size} / ${liveFiles().length}편 받아 둠</p></div>
      <button class="btn ghost clear-local">이 기기에 받아 둔 파일 비우기</button></section>
    <section><h3>올리기</h3><label class="opt"><input type="checkbox" class="an" ${S.prefs.autoName === false ? '' : 'checked'}><span>이름을 ‘저자_제목’으로 정리 <small>(부제 생략, 확실할 때만)</small></span></label></section>
    <section class="mk-names"><h3>표지 이름 <small>모든 기기에서 같습니다</small></h3><p class="sheet-p small">논문 메뉴의 ★ △ ✕ 아래에 보이는 이름입니다. 서재에서 표지별로 걸러 볼 때도 씁니다.</p>
      ${MARKS.map(([g, glyph]) => `<label class="field mk-name"><span>${glyph}</span><input type="text" data-mk="${g}" value="${esc(markName(g))}" placeholder="${esc(MARK_DEF[g])}" maxlength="12" enterkeyhint="done"></label>`).join('')}</section>
    <section><h3>공유로 넣기 <small>아이패드·아이폰</small></h3><p class="sheet-p small">Safari나 파일 앱의 공유 버튼에서 바로 책장에 넣습니다. 키를 한 번 만들어 단축어에 넣어 두면 됩니다.</p><button class="btn share-key">공유 키 만들기</button></section>
    <section><h3>백업</h3><p class="sheet-p small">표시와 폴더 정리는 날마다, 처음 바뀌기 전 상태가 서버에 60일 동안 남습니다. 표시를 잘못 지웠다면 그 논문의 ⋯ 메뉴에서 <b>예전 표시 되살리기</b>를 고르세요.</p><button class="btn export-marks">모든 표시를 파일로 받기</button></section>
    <section class="dg"><h3>점검 결과 <small>바깥 자료에 닿는지 · 최근 14일</small></h3><div class="dg-body"><p class="kv-note">불러오는 중…</p></div></section>
    <section><h3>로그인된 기기</h3><ul class="devs"><li class="none">불러오는 중…</li></ul></section>
    <section class="foot"><button class="btn danger ghost signout">이 기기에서 로그아웃</button><p class="ver">연구실 책장 ${esc(VERSION)}</p></section>`);
  $('.share-key', box).onclick = () => shareKeySheet();
  diagSection($('.dg-body', box));
  $('.export-marks', box).onclick = () => { closeSheet(); exportAllMarks(); };
  $('.an', box).onchange = (e) => { S.prefs.autoName = e.target.checked; store.put('kv', 'prefs', S.prefs); };
  // (each name kept as it is typed, a moment after the last letter; an empty box goes back to the plain name)
  let mkT = 0;
  $('.mk-names', box).addEventListener('input', (e) => {
    if (!e.target.dataset.mk || e.isComposing) return;
    clearTimeout(mkT);
    mkT = setTimeout(() => {
      const v = {}; for (const i of box.querySelectorAll('[data-mk]')) { const t = i.value.trim(); if (t && t !== MARK_DEF[i.dataset.mk]) v[i.dataset.mk] = t.slice(0, 12); }
      if (JSON.stringify(v) !== JSON.stringify(uiGet('markNames', {}) || {})) uiSet('markNames', v);
    }, 500);
  });
  $('.mk-names', box).addEventListener('compositionend', (e) => { if (e.target.dataset.mk) e.target.dispatchEvent(new Event('input', { bubbles: true })); });
  $('.keep', box).onchange = (e) => { if (e.target.name !== 'keep') return; S.prefs.keep = e.target.value; store.put('kv', 'prefs', S.prefs); prefetch(); };
  $('.clear-local', box).onclick = async () => {
    if (!(await confirmBox('받아 둔 파일 비우기', '이 기기에 받아 둔 사본만 지웁니다. 책장 서버의 파일과 표시는 그대로입니다.', '비우기'))) return;
    await store.clear('files'); S.cached = new Set(); render(); closeSheet(); toast('비웠습니다');
  };
  $('.signout', box).onclick = async () => {
    if (!(await confirmBox('로그아웃', '이 기기에서 로그아웃합니다. 받아 둔 파일과 표시 사본도 이 기기에서 지웁니다.', '로그아웃', true))) return;
    await syncMarksAll(); await pushState();
    await api.logout();
    for (const s of ['files', 'thumbs', 'texts', 'marks', 'kv']) await store.clear(s).catch(() => {});
    location.reload();
  };
  try {
    const devs = await api.devices();
    $('.devs', box).innerHTML = devs.map((d) => `<li><span><b>${esc(d.name)}</b>${d.current ? ' <em>이 기기</em>' : ''}<small>${d.kind === 'inbox' ? (d.seen ? '마지막으로 넣은 때 ' + ago(d.seen) : '아직 쓰지 않음') : '마지막 사용 ' + ago(d.seen)}</small></span>${d.current ? '' : `<button class="btn small ghost" data-drop="${d.id}">로그아웃시키기</button>`}</li>`).join('');
    $('.devs', box).onclick = async (e) => {
      const b = e.target.closest('[data-drop]'); if (!b) return;
      if (!(await confirmBox('기기 로그아웃', '그 기기는 다시 비밀번호를 넣어야 책장을 열 수 있습니다.', '로그아웃시키기', true))) return;
      await api.dropDevice(b.dataset.drop); b.closest('li').remove(); toast('로그아웃시켰습니다');
    };
  } catch (e) { $('.devs', box).innerHTML = `<li class="none">${offline(e) ? unreached('볼 수 있습니다', '열어 보세요') : '지금은 기기 목록을 불러오지 못했습니다'}</li>`; }
}

/* ================= small UI parts ================= */
let toastT = null;
function toast(msg, ms = 2600, action) {
  const t = $('.toast') || (() => { const x = el('div', 'toast'); document.body.appendChild(x); return x; })();
  t.textContent = '';
  const m = el('span', 'toast-m'); m.textContent = msg; t.appendChild(m);
  t.hidden = false; t.classList.add('in');
  t.classList.toggle('has-act', !!action);
  t.classList.toggle('over-tools', !!document.querySelector('.reader-host'));
  t.setAttribute('role', 'status');
  if (action) { const b = el('button', 'toast-act'); b.type = 'button'; b.textContent = action.label; b.onclick = () => { hideToast(); action.fn(); }; t.appendChild(b); }
  clearTimeout(toastT); toastT = setTimeout(hideToast, ms);
}
function hideToast() { const t = $('.toast'); if (t) { t.classList.remove('in'); t.hidden = true; } }

// A sheet takes the focus (Tab stays in it), Escape closes it as ✕ does, and the focus goes back to what opened it. A sheet
// that replaces another gives the focus back to what opened the first.
// Over the library a sheet has its own place in the history, so the back button (or a swipe back) closes the sheet alone and
// the screen under it — its search, its answers, how far it was scrolled — stays; a sheet that replaces another shares it.
let sheetFrom = null, sheetBack = false, sheetQuiet = false, lastDepth = 0;
/* A decision's, a judgment's or a holding's sheet keeps what it is in its place in the history (and '&open=' in the address):
   going on from it to an article (or a paper that cites it) leaves it there, so Back opens it again where it was scrolled;
   so does Forward after it was closed. A link to it (#cases=2007헌마1001&open=2007헌마1001) opens it too. */
function sheetRec(rec, html) {
  const box = sheet(html);
  const st = history.state;
  if (!S.readerId && st && st.sheet && st.nav) {
    const h = navHash(st.nav), open = rec.no && /^#(?:cases|law)/.test(h) ? '&open=' + encodeURIComponent(rec.no) : '';
    history.replaceState({ ...st, rec: { ...rec, trail: (rec.trail || []).slice(-6) } }, '', location.pathname + location.search + (h === '#' ? '' : h) + open);
  }
  return box;
}
// leaving a sheet for a screen it links to: the sheet's place stays in the history (with how far it was scrolled)
function leaveSheet() {
  const st = history.state, box = document.querySelector('.sheet-wrap .sheet');
  if (!S.readerId && st && st.sheet && st.rec && box) history.replaceState({ ...st, rec: { ...st.rec, scroll: box.scrollTop } }, '');
  if (!(st && st.sheet && st.rec)) { closeSheet(); return; }
  closeSheet(true); sheetFrom = null;
}
function reopenSheet(rec) {
  const go = { case: () => caseSheet(rec.no, rec.trail || [], rec.hint || {}), court: () => courtSheet(rec.no, rec.trail || []), holding: () => holdingSheet(rec.seq, rec.title, rec.q || '', rec.trail || []) }[rec.kind];
  if (!go) return false;
  go();
  const box = document.querySelector('.sheet-wrap .sheet'), y = rec.scroll || 0;
  if (box && y > 0) {   // (its text comes a moment later: back to where it was once it is long enough, for up to 4 s)
    const t0 = Date.now();
    const tick = () => { if (!box.isConnected) return; if (box.scrollHeight - box.clientHeight >= y - 2 || Date.now() - t0 > 4000) { box.scrollTop = y; return; } setTimeout(tick, 80); };
    setTimeout(tick, 60);
  }
  return true;
}
function sheet(html) {
  const from = document.querySelector('.sheet-wrap') ? sheetFrom : document.activeElement;
  closeSheet(true);
  sheetFrom = from;
  const st = history.state;
  if (!S.readerId && st && st.nav && !st.sheet) { noteScroll(); history.pushState({ ...history.state, sheet: true, rec: null, typed: false, depth: (st.depth || 0) + 1, key: Math.random().toString(36).slice(2) }, '', location.href); lastDepth = history.state.depth; paintBack(); }
  const w = el('div', 'sheet-wrap', `<div class="sheet" role="dialog" aria-modal="true" tabindex="-1"><button class="ib sheet-x" aria-label="닫기">${I.close}</button>${html}</div>`);
  document.body.appendChild(w);
  const box = $('.sheet', w), h = $('h2, h3', box);
  if (h) { h.id = h.id || 'sh-' + rid(6); box.setAttribute('aria-labelledby', h.id); }
  requestAnimationFrame(() => w.classList.add('in'));
  box.focus({ preventScroll: true });
  w.addEventListener('click', (e) => { if (e.target === w || e.target.closest('.sheet-x')) closeSheet(); });
  return box;
}
function closeSheet(keepFocus) {
  const had = document.querySelectorAll('.sheet-wrap');
  had.forEach((w) => w.remove());
  if (keepFocus || !had.length) return;
  // its place in the history goes too — unless the same moment opens another sheet, or goes on to another screen (nav: that
  // screen takes the place)
  if (sheetQuiet) return;   // (closed by the history itself: it is already where it should be)
  setTimeout(() => { if (!document.querySelector('.sheet-wrap') && !S.readerId && history.state && history.state.sheet) { sheetBack = true; history.back(); } }, 0);
  const f = sheetFrom; sheetFrom = null;
  if (f && f.isConnected && f.focus) f.focus({ preventScroll: true });
}
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
window.addEventListener('keydown', (e) => {
  const ws = document.querySelectorAll('.sheet-wrap'); const w = ws[ws.length - 1];
  if (!w || document.querySelector('.menu-wrap')) return;   // (a menu over the sheet handles its own keys)
  const box = $('.sheet', w);
  if (e.key === 'Escape' && (e.isComposing || e.keyCode === 229)) return;   // (a word still being put together — 한글 입력 — takes its Esc itself; Tab is still kept in the sheet)
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const x = $('.sheet-x', box); if (x) x.click(); else closeSheet(); return; }
  if (e.key !== 'Tab') return;
  const fs = [...box.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
  if (!fs.length) { e.preventDefault(); box.focus(); return; }
  const first = fs[0], last = fs[fs.length - 1], at = document.activeElement;
  if (!box.contains(at)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
  else if (e.shiftKey && (at === first || at === box)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
}, true);

// Esc also ends picking (as 선택 끝 does) when nothing is open over the list
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.isComposing || !S.select || S.readerId || e.defaultPrevented || document.querySelector('.sheet-wrap, .menu-wrap')) return;
  if (e.target && e.target.closest && e.target.closest('input, textarea, [contenteditable="true"]')) return;
  S.select = null; render();
});

function promptBox(title, label, value, ok, orig) {
  return new Promise((resolve) => {
    const box = sheet(`<h2>${esc(title)}</h2><label class="field"><span>${esc(label)}</span><input type="text" value="${esc(value)}" maxlength="200"></label>${orig ? `<p class="orig-name">처음 이름 · <span>${esc(orig)}</span> <button class="link restore" type="button">되돌리기</button></p>` : ''}<div class="row-btns"><button class="btn ghost cancel">취소</button><button class="btn primary ok">${esc(ok)}</button></div>`);
    const inp = $('input', box);
    if (orig) $('.restore', box).onclick = () => { inp.value = orig; inp.focus(); };
    setTimeout(() => { inp.focus(); inp.select(); }, 60);
    const done = (v) => { closeSheet(); resolve(v); };
    $('.ok', box).onclick = () => { const v = inp.value.trim(); if (v) done(v); else inp.focus(); };
    $('.cancel', box).onclick = () => done(null);
    // (Enter's own keypress must not reach the button the focus goes back to — 새 폴더 — and open this box again)
    inp.onkeydown = (e) => { if (e.isComposing || e.keyCode === 229) return; if (e.key === 'Enter') { e.preventDefault(); $('.ok', box).click(); } if (e.key === 'Escape') { e.preventDefault(); done(null); } };
    box.closest('.sheet-wrap').addEventListener('click', (e) => { if (e.target.classList.contains('sheet-wrap') || e.target.closest('.sheet-x')) resolve(null); });
  });
}
function confirmBox(title, text, ok, danger) {
  return new Promise((resolve) => {
    const box = sheet(`<h2>${esc(title)}</h2><p class="sheet-p">${esc(text)}</p><div class="row-btns"><button class="btn ghost cancel">취소</button><button class="btn ${danger ? 'danger' : 'primary'} ok">${esc(ok)}</button></div>`);
    $('.ok', box).onclick = () => { closeSheet(); resolve(true); };
    $('.cancel', box).onclick = () => { closeSheet(); resolve(false); };
    box.closest('.sheet-wrap').addEventListener('click', (e) => { if (e.target.classList.contains('sheet-wrap') || e.target.closest('.sheet-x')) resolve(false); });
  });
}
async function shareKeySheet() {
  let d;
  try { d = await api.makeShareKey(/iPhone/.test(navigator.userAgent) ? '아이폰' : '아이패드'); }
  catch (e) { toast(offline(e) ? unreached('만들 수 있습니다') : '만들지 못했습니다'); return; }
  const url = api.base() + '/api/inbox';
  const box = sheet(`<h2>공유 키</h2>
    <p class="sheet-p small">이 화면을 닫으면 다시 볼 수 없습니다. 아래 순서대로 단축어를 만든 뒤 닫으세요. 키가 새면 설정의 기기 목록에서 지우면 됩니다. 이 키로는 PDF를 넣는 것만 할 수 있습니다.</p>
    <div class="key-row"><code class="key">Bearer ${esc(d.token)}</code><button class="btn small copy-key">복사</button></div>
    <ol class="steps">
      <li><b>단축어</b> 앱에서 <b>＋</b>를 눌러 새 단축어를 만들고, 이름을 <b>책장에 넣기</b>로 바꿉니다.</li>
      <li>아래쪽 <b>ⓘ</b>를 눌러 <b>공유 시트에서 보기</b>를 켭니다. 맨 위 입력 종류는 <b>PDF</b>만 남깁니다.</li>
      <li>동작 추가에서 <b>URL의 콘텐츠 가져오기</b>를 고르고, URL 자리에 아래 주소를 붙여 넣습니다.<div class="key-row"><code>${esc(url)}</code><button class="btn small copy-url">복사</button></div></li>
      <li>그 동작을 펼쳐 <b>방법</b>은 <b>POST</b>, <b>헤더</b>를 하나 추가해 키는 <b>Authorization</b>, 값은 위의 <b>Bearer …</b> 전체를 붙여 넣습니다.</li>
      <li><b>요청 본문</b>은 <b>파일</b>로 바꾸고, 파일 자리에 <b>단축어 입력</b>을 넣습니다. (원하면 마지막에 <b>알림 보기</b> 동작을 더해 ‘책장에 넣었습니다’라고 쓰면 됩니다.)</li>
      <li>이제 PDF에서 <b>공유</b> → <b>책장에 넣기</b>. 책장을 열면 표지 그림·본문 찾기·이름 정리가 저절로 됩니다.</li>
    </ol>`);
  const copy = async (t, b) => { try { await navigator.clipboard.writeText(t); b.textContent = '복사됨'; setTimeout(() => { b.textContent = '복사'; }, 1600); } catch (e) { toast('길게 눌러 직접 복사해 주세요'); } };
  $('.copy-key', box).onclick = (e) => copy('Bearer ' + d.token, e.currentTarget);
  $('.copy-url', box).onclick = (e) => copy(url, e.currentTarget);
}
function pickFolder(title, avoid = new Set()) {
  return new Promise((resolve) => {
    const banned = new Set(); for (const id of avoid) { banned.add(id); for (const f of S.index.folders) { let p = f, g = 0; while (p && g++ < 50) { if (p.id === id) banned.add(f.id); p = folderById(p.parent); } } }
    const walk = (parent, depth) => childFolders(parent).filter((f) => !banned.has(f.id)).map((f) => `<button data-to="${f.id}" style="--d:${depth}">${I.folder}<span>${esc(f.name)}</span></button>` + walk(f.id, depth + 1)).join('');
    const box = sheet(`<h2>${esc(title)}</h2><div class="pick"><button data-to="" style="--d:0">${I.home}<span>서재 (맨 위)</span></button>${walk(null, 1)}</div><div class="row-btns"><button class="btn ghost newf">${I.newfolder}<span>새 폴더</span></button><span class="sp"></span><button class="btn ghost cancel">취소</button></div>`);
    $('.pick', box).onclick = (e) => { const b = e.target.closest('[data-to]'); if (!b) return; closeSheet(); resolve(b.dataset.to || null); };
    $('.cancel', box).onclick = () => { closeSheet(); resolve(undefined); };
    $('.newf', box).onclick = async () => {
      closeSheet();
      const name = await promptBox('새 폴더', '폴더 이름', '', '만들기');
      if (!name) { resolve(undefined); return; }
      const id = 'f_' + rid(10);
      const r = await doOps([{ op: 'addFolder', folder: { id, name, parent: null } }]);
      resolve(r ? id : undefined);
    };
    box.closest('.sheet-wrap').addEventListener('click', (e) => { if (e.target.classList.contains('sheet-wrap') || e.target.closest('.sheet-x')) resolve(undefined); });
  });
}
function marksRow(v) {
  // (each glyph with the owner's name for it under it — ★ 인용 후보, △ 보류 … — not a rating of 1 to 3 stars)
  const b = (g, on, label) => `<button data-k="g:${g}" class="${on ? 'on' : ''}" aria-label="${label} · ${esc(markName(g))}" title="${esc(markName(g))}">${gradeSVG(g > 0 ? 1 : g)}<span class="mark-lbl">${esc(markName(g))}</span></button>`;
  return `<div class="menu-marks" role="group" aria-label="표지">${b(1, v >= 1, '별 1개')}${b(2, v >= 2, '별 2개')}${b(3, v >= 3, '별 3개')}<span class="sep"></span>${b(-2, v === -2, '세모')}${b(-1, v === -1, '엑스')}${v ? '<button data-k="g:0" class="grade-none">표지 떼기</button>' : ''}</div><hr>`;   // 표지 떼기 takes the mark off
}
const MI = {
  rename: '<svg viewBox="0 0 24 24"><path d="M4 20h4.5L19 9.5 14.5 5 4 15.5z"/><path d="M12.5 7l4.5 4.5"/></svg>',
  move: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M10 13h6M13.5 10.5L16 13l-2.5 2.5"/></svg>',
  print: '<svg viewBox="0 0 24 24"><path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="2"/><path d="M7 14h10v6H7z"/></svg>',
  orig: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19h14"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V4M8 7.5L12 4l4 3.5"/><path d="M8 11H6.5A1.5 1.5 0 0 0 5 12.5v6A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5H16"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M20.5 3.5L10 14"/><path d="M20.5 3.5l-6.5 17-4-6.5-6.5-4z"/></svg>',
  ocr: '<svg viewBox="0 0 24 24"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 9h8M8 12h8M8 15h5"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 4.5v4h4"/><path d="M12 8v4.5l3 1.8"/></svg>',
  clear: '<svg viewBox="0 0 24 24"><path d="M15.6 4.4l4 4a1.5 1.5 0 0 1 0 2.1L11 19H6.5l-3-3a1.5 1.5 0 0 1 0-2.1l10-9.5a1.5 1.5 0 0 1 2.1 0z"/><path d="M10 8.5l5.5 5.5M11 19h9"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  newfolder: I.newfolder, upload: I.up, select: I.select,   // (a phone's ＋)
};
function menu(rect, items, current, head) {
  return new Promise((resolve) => {
    document.querySelectorAll('.menu-wrap').forEach((m) => m.remove());
    const from = document.activeElement;
    const sheetLike = innerWidth < 600 && matchMedia('(pointer: coarse)').matches;
    const isOn = (k) => (Array.isArray(current) ? current.includes(k) : k === current);   // (an order and a view: both said)
    const row = ([k, label, cls]) => (k === '-' ? '<hr>' : k === 'marks' ? marksRow(label)
      : `<button type="button" data-k="${k}" class="mi-b ${cls || ''} ${isOn(k) ? 'on' : ''}" role="menuitem">${MI[k] ? `<i class="mi">${MI[k]}</i>` : ''}<span>${esc(label)}</span>${isOn(k) ? `<i class="mi-on">${I.check}</i>` : ''}</button>`);
    const w = el('div', 'menu-wrap' + (sheetLike ? ' as-sheet' : ''), `<div class="menu" role="menu" tabindex="-1">${head ? `<div class="menu-h"><b>${esc(head.title)}</b>${head.sub ? `<span>${esc(head.sub)}</span>` : ''}</div>` : ''}${items.map(row).join('')}</div>`);
    document.body.appendChild(w);
    const m = $('.menu', w);
    if (!sheetLike) {
      const W = innerWidth, H = innerHeight, mw = m.offsetWidth, mh = m.offsetHeight;
      const left = Math.max(8, Math.min(W - mw - 8, rect.right - mw));
      const below = rect.bottom + mh + 8 < H;
      m.style.left = left + 'px';
      m.style.top = (below ? rect.bottom + 6 : Math.max(8, rect.top - mh - 6)) + 'px';
      m.style.transformOrigin = `${Math.round(Math.min(mw, Math.max(0, rect.right - left)))}px ${below ? 0 : mh}px`;   // it grows out of the button
    }
    requestAnimationFrame(() => w.classList.add('in'));
    const done = (v) => {
      document.removeEventListener('keydown', onKey, true);
      w.classList.remove('in'); w.classList.add('out');
      setTimeout(() => w.remove(), 140);
      const at = document.activeElement;
      if (from && from !== document.body && from.isConnected && (!at || at === document.body || w.contains(at))) from.focus({ preventScroll: true });
      resolve(v);
    };
    const btns = () => [...m.querySelectorAll('.mi-b:not([disabled])')];
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(null); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const bs = btns(), i = bs.indexOf(document.activeElement);
        const n = e.key === 'ArrowDown' ? (i + 1) % bs.length : (i <= 0 ? bs.length - 1 : i - 1);
        if (bs[n]) bs[n].focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    m.focus({ preventScroll: true });
    w.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b || !e.target.closest('.menu')) done(b ? b.dataset.k : null); });
  });
}

/* ================= formats ================= */
function size(b) { if (!b) return '0MB'; if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + 'KB'; if (b < 1024 ** 3) return (b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0) + 'MB'; return (b / 1024 ** 3).toFixed(1) + 'GB'; }
function date(t) { if (!t) return ''; const d = new Date(t), n = new Date(); return d.getFullYear() === n.getFullYear() ? `${d.getMonth() + 1}월 ${d.getDate()}일` : `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`; }
function keepLeft(t) { const d = Math.ceil((t + 7 * 86400e3 - Date.now()) / 86400e3); return d > 1 ? `${d}일 뒤 완전히 지워짐` : '곧 완전히 지워짐'; }   // the server keeps the trash for 7 days
function pageOf(s, pages) { const o = Number.isInteger(s.o) ? s.o : null; return o == null ? `${s.page + 1} / ${pages}쪽` : `${s.page + 1 + o >= 1 ? s.page + 1 + o : '표지'} / ${pages + o}쪽`; }   // same numbers as the reader (표지: before the page printed 1)
function ago(t) { if (!t) return ''; const s = (Date.now() - t) / 1000; if (s < 90) return '방금'; if (s < 3600) return Math.round(s / 60) + '분 전'; if (s < 86400) return Math.round(s / 3600) + '시간 전'; if (s < 86400 * 7) return Math.round(s / 86400) + '일 전'; return date(t); }
function stem(n) { return unbidi(n || '').replace(/\.pdf$/i, ''); }
function rid(n) { const a = 'abcdefghijklmnopqrstuvwxyz0123456789'; const b = crypto.getRandomValues(new Uint8Array(n)); return [...b].map((x) => a[x % 36]).join(''); }

boot().catch((e) => { console.error(e); booted(); document.body.innerHTML = '<div class="gate"><div class="gate-card"><h1 class="brand-big">연구실 책장</h1><p class="gate-s">문제가 생겼습니다. 다시 열어 주세요.</p></div></div>'; });
