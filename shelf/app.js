// 연구실 책장 — a private PDF library and reader for one owner, on every device.
// The library lives on the owner's server (Cloudflare R2 behind a small Worker); this device keeps copies of what was
// opened, so files open at once and without a connection. Marks and reading positions are saved here first and sent on.
import * as api from './api.js';
import * as store from './store.js';
import * as pdfkit from './pdfkit.js';
import * as A from './analyze.js';
import { Reader, gradeSVG } from './reader.js';
import * as naming from './naming.js';
import * as cases from './cases.js';
import * as laws from './laws.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const VERSION = (document.documentElement.dataset.v || 'dev');

const S = {
  index: { folders: [], files: [] },
  state: { files: {} },
  view: { kind: 'home', folder: null },
  tabs: [],          // papers open as tabs on this device: { id, page, y, zoom, at }
  sort: 'added', q: '', select: null, prefs: {},
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
  law: '<svg viewBox="0 0 24 24"><path d="M12 4v16M8 20h8M5 7h14"/><path d="M5 7l-2.5 6a2.5 2.5 0 0 0 5 0zM19 7l-2.5 6a2.5 2.5 0 0 0 5 0z"/></svg>',
  cloud: '<svg viewBox="0 0 24 24"><path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.3 1.6A3.8 3.8 0 0 1 17 18z"/></svg>',
  device: '<svg viewBox="0 0 24 24"><path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.3 1.6A3.8 3.8 0 0 1 17 18z"/><path d="M9.5 13.5l2 2 3.5-4"/></svg>',
  pdf: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/></svg>',
};

/* ================= start ================= */
async function boot() {
  document.documentElement.classList.toggle('touch', matchMedia('(pointer: coarse)').matches);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js?v=' + encodeURIComponent(VERSION)).catch(() => {});
  api.setSignedOutHandler(() => showLogin('다른 곳에서 이 기기를 로그아웃했습니다. 비밀번호를 다시 넣어 주세요.'));
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
  document.body.innerHTML = `<div class="gate"><div class="gate-card"><h1 class="brand-big">연구실 책장</h1><p class="gate-s">책장 서버를 준비하고 있습니다.<br>준비가 끝나면 이 화면에서 바로 쓸 수 있습니다.</p></div></div>`;
}

/* ================= sign-in ================= */
function showLogin(message) {
  syncOn = false; clearTimeout(pullT); pullT = null;   // nothing goes to the server until the PIN is in
  if (S.reader) { S.reader.destroy(); S.reader = null; }
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
    draw();
    if (pin.length < 6) return;
    busy = true; msg.textContent = '확인하는 중…';
    try {
      await api.login(pin, deviceName());
      await startLibrary();
    } catch (e) {
      pin = ''; draw(); busy = false;
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      if (e.code === 'pin') msg.textContent = `비밀번호가 다릅니다${e.left != null ? ` (남은 기회 ${e.left}번)` : ''}`;
      else if (e.code === 'locked') msg.textContent = `잠시 잠겼습니다. ${Math.max(1, Math.ceil(((e.until || Date.now()) - Date.now()) / 60000))}분 뒤에 다시 해 주세요.`;
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
  S.index = (await store.get('kv', 'index')) || S.index;
  S.state = (await store.get('kv', 'state')) || S.state;
  S.cached = new Set(await store.keys('files').catch(() => []));
  S.info = (await store.get('kv', 'paperInfo').catch(() => null)) || {};
  infoAsked = (await store.get('kv', 'paperInfoAsked').catch(() => null)) || {};
  await loadTabs();
  renderShell();
  render();
  await refresh(true);
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
    });
    window.addEventListener('popstate', onPop);
  }
  syncOn = true; lastTouch = Date.now();
  pullLoop();
  setTimeout(() => fetchAllMarks(), 4000);
  ocrSoon(6000);
  setTimeout(() => fillPaperInfo(), 9000);
  setTimeout(async () => {   // once a day: which outside sources answer from here (the server keeps the answer, for fixing what is blocked)
    if (Date.now() - ((await store.get('kv', 'diagAt').catch(() => 0)) || 0) < 864e5 || !navigator.onLine) return;
    store.put('kv', 'diagAt', Date.now()); api.diagnose().catch(() => {});
  }, 20000);
  const m = /#r=([0-9a-f]{24})/.exec(location.hash);
  if (m && fileById(m[1])) openFile(m[1], { replace: true, resume: true });
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
      if (S.reader) {
        renderUsage(); const f = fileById(S.readerId); if (f) S.reader.setStars(f.stars || 0);
        if (f && f.ocr && !S.reader.ocr) { const rd = S.reader; Promise.all([ocrData(f), textOf(f).catch(() => null)]).then(([d, t]) => { if (d && S.reader === rd) rd.setOcr(d.pages, t); }); }
      } else render();
      setTimeout(prefetch, 800); setTimeout(preparePending, 300); if (liveFiles().some(needsOcr)) ocrSoon();
    }
    if (r.libTag) syncTags.lib = r.libTag;
    if (r.state) { mergeState(r.state); await store.put('kv', 'state', S.state); if (!S.reader) render(); }
    if (r.stateTag) syncTags.state = r.stateTag;
    if (id && r.marks && S.readerId === id) await takeMarks(id, r.marks.marks || [], r.marksTag);
    if (id && r.marksTag && S.readerId === id) { syncTags.marks = r.marksTag; syncTags.marksId = id; }
  } catch (e) { /* offline or busy: the next round */ } finally { pulling = false; }
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
          first = await nameFromBand(doc, p1, p2, naming.withFileName(naming.readFirstPages(p1, p2), f.orig || f.name), f.orig || f.name);
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
        if (S.reader) renderUsage(); else render();
      } catch (e) { break; }
    }
  } finally { preparing = false; }
}

async function loadTabs() { try { S.tabs = (await store.get('kv', 'tabs')) || []; } catch (e) { S.tabs = []; } }

async function refresh(first) {
  try {
    const [idx, st] = await Promise.all([api.library(), api.getState()]);
    S.index = idx; applyPending(await store.get('kv', 'pendingOps')); await store.put('kv', 'index', S.index);
    mergeState(st); await store.put('kv', 'state', S.state);
    if (S.reader) { renderUsage(); } else render();
    setTimeout(prefetch, 1500); setTimeout(preparePending, 600);
  } catch (e) {
    if (first && !api.isOffline(e) && e.code !== 'auth') toast('책장을 불러오지 못했습니다. 잠시 뒤에 다시 시도합니다.');
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

function renderShell() {
  document.body.innerHTML = `
  <div class="app">
    <aside class="rail">
      <div class="brand"><span class="brand-mark"></span><b>연구실 책장</b></div>
      <button class="btn primary up-btn">${I.up}<span>PDF 올리기</span></button>
      <nav class="views">
        <button data-view="home">${I.home}<span>내 책장</span></button>
        <button data-view="recent">${I.clock}<span>최근 읽은 글</span></button>
        <button data-view="law">${I.law}<span>판례·법령</span></button>
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
        <button class="ib menu-btn" aria-label="메뉴">${I.menu}</button>
        <nav class="crumbs"></nav>
        <button class="tabs-btn" hidden></button>
      </header>
      <div class="toolrow"><div class="tools"></div><label class="find">${I.search}<input type="search" placeholder="제목과 본문에서 찾기" enterkeyhint="search" autocomplete="off"></label></div>
      <div class="offline" hidden>인터넷에 연결되어 있지 않습니다 · 이 기기에 받아 둔 파일만 열 수 있습니다</div>
      <section class="content"></section>
    </main>
    <div class="uploads" hidden></div>
    <div class="toast" hidden></div>
    <input type="file" class="file-in" accept="application/pdf,.pdf" multiple hidden>
    <input type="file" class="dir-in" webkitdirectory multiple hidden>
  </div>`;
  const app = $('.app');
  $('.up-btn').onclick = () => uploadBox();
  $('.file-in').onchange = (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) upload(fs); closeRail(); };
  $('.dir-in').onchange = (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) upload(fs); else toast('그 폴더에 PDF가 없습니다'); closeRail(); };
  $('.views').onclick = (e) => { const b = e.target.closest('[data-view]'); if (!b) return; S.view = { kind: b.dataset.view, folder: null }; S.q = ''; $('.find input').value = ''; S.select = null; render(); closeRail(); };
  $('.tree').onclick = (e) => { const b = e.target.closest('[data-folder]'); if (!b) return; S.view = { kind: 'home', folder: b.dataset.folder }; S.q = ''; $('.find input').value = ''; S.select = null; render(); closeRail(); };
  $('.settings-btn').onclick = () => { closeRail(); settings(); };
  $('.tabs-btn').onclick = () => { const t = S.tabs.slice().sort((a, b) => b.at - a.at)[0]; if (t) openFile(t.id, { tab: true }); };
  $('.trash-btn').onclick = () => { S.view = { kind: 'trash', folder: null }; S.q = ''; $('.find input').value = ''; S.select = null; render(); closeRail(); };
  $('.menu-btn').onclick = () => app.classList.toggle('rail-open');
  $('.scrim').onclick = closeRail;
  const fin = $('.find input');
  fin.addEventListener('input', () => { clearTimeout(S.qT); S.qT = setTimeout(() => { S.q = fin.value.trim(); render(); }, 220); });
  fin.addEventListener('keydown', (e) => { if (e.key === 'Escape') { fin.value = ''; S.q = ''; render(); } });
  $('.content').addEventListener('click', onContentClick);
  $('.crumbs').onclick = (e) => { const b = e.target.closest('[data-folder]'); if (b) { S.view = { kind: 'home', folder: b.dataset.folder || null }; S.select = null; render(); } };
  $('.tools').onclick = onTools;
  // drop PDFs anywhere on the library to upload them into the folder being shown
  const main = $('.main');
  main.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); main.classList.add('drop'); } });
  main.addEventListener('dragleave', (e) => { if (e.target === main || !main.contains(e.relatedTarget)) main.classList.remove('drop'); });
  main.addEventListener('drop', (e) => { e.preventDefault(); main.classList.remove('drop'); filesFromDrop(e.dataTransfer).then((fs) => { if (fs.length) upload(fs); }); });
  let lp = null;   // long press on a row (or a 이어 읽기 card) starts selecting
  $('.content').addEventListener('pointerdown', (e) => { const row = e.target.closest('.row[data-file], .row[data-fid], .card-w[data-file]'); if (!row || e.pointerType === 'mouse') return; lp = setTimeout(() => { lp = null; pressedAt = Date.now(); startSelect(row.dataset.file ? { file: row.dataset.file } : { folder: row.dataset.fid }); }, 550); });
  for (const t of ['pointerup', 'pointercancel', 'pointermove']) $('.content').addEventListener(t, (e) => { if (lp && (t !== 'pointermove' || Math.abs(e.movementY) > 3)) { clearTimeout(lp); lp = null; } });
  $('.content').addEventListener('contextmenu', (e) => { const row = e.target.closest('.row[data-file], .row[data-fid], .card-w[data-file]'); if (!row) return; e.preventDefault(); row.dataset.file ? fileMenu(row.dataset.file, e.clientX, e.clientY) : folderMenu(row.dataset.fid, e.clientX, e.clientY); });
}
function closeRail() { const a = $('.app'); if (a) a.classList.remove('rail-open'); }

function renderOffline() { const o = $('.offline'); if (o) o.hidden = navigator.onLine; }

function render() {
  if (!$('.app')) return;
  for (const b of document.querySelectorAll('.views [data-view]')) b.classList.toggle('on', !S.q && b.dataset.view === S.view.kind && !(S.view.kind === 'home' && S.view.folder));
  $('.trash-btn').classList.toggle('on', !S.q && S.view.kind === 'trash');
  renderTree(); renderUsage(); renderCrumbs(); renderTools(); renderTabsBtn();
  const c = $('.content');
  c.classList.toggle('picking', !!S.select);
  syncFind();
  if (S.q) { renderSearch(c); return; }
  if (S.view.kind === 'law') { const b = c.querySelector(':scope > .law-body'); if (!b || b.dataset.law !== (S.lq || '').trim() || !b.querySelector('.law-home, .law-res')) renderLaw(c); return; }   // asked of servers: drawn again only for a new question
  if (S.view.kind === 'recent') renderRecent(c);
  else if (S.view.kind === 'trash') renderTrash(c);
  else renderFolder(c, S.view.folder);
  lazyThumbs();
}

function renderTabsBtn() {
  pruneTabs();
  const b = $('.tabs-btn'); if (!b) return;
  b.hidden = !S.tabs.length;
  b.innerHTML = `${I.tabs}<span>읽던 문서</span><em>${S.tabs.length}</em>`;
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
function tabsSheet() {
  const box = sheet(`<h2>열린 문서</h2><ul class="tab-list">${S.tabs.map((t) => { const f = fileById(t.id); return `<li class="${t.id === S.readerId ? 'on' : ''}"><button class="go" data-go="${t.id}"><span class="thumb" data-thumb="${f && f.thumb ? f.id : ''}">${coverMark(f && f.stars)}</span><b>${esc(stem(f ? f.name : ''))}</b></button><button class="ib" data-x="${t.id}" aria-label="닫기">${I.close}</button></li>`; }).join('')}</ul>`);
  lazyThumbs();
  box.onclick = (e) => {
    const g = e.target.closest('[data-go]'); if (g) { closeSheet(); switchTab(g.dataset.go); return; }
    const x = e.target.closest('[data-x]'); if (x) { x.closest('li').remove(); closeTab(x.dataset.x); if (!S.tabs.length) closeSheet(); }
  };
}

function renderTree() {
  const box = $('.tree');
  const walk = (parent, depth) => childFolders(parent).map((f) => `<button data-folder="${f.id}" class="${S.view.kind === 'home' && S.view.folder === f.id && !S.q ? 'on' : ''}" style="--d:${depth}">${I.folder}<span>${esc(f.name)}</span></button>` + (depth < 3 ? walk(f.id, depth + 1) : '')).join('');
  const html = walk(null, 0);
  box.innerHTML = html || '<p class="tree-empty">폴더가 없습니다</p>';
}

function renderUsage() {
  const used = S.index.files.reduce((s, f) => s + (f.size || 0), 0), free = CAP;
  $('.usage-t').textContent = `${size(used)} / 9GB` + (used >= CAP ? ' · 가득 참' : used >= CAP * 0.9 ? ' · 거의 참' : '');
  $('.usage-bar i').style.width = Math.min(100, 100 * used / free) + '%';
  const n = liveFiles().length, have = liveFiles().filter((f) => S.cached.has(f.id)).length;
  $('.usage-d').textContent = n ? (have >= n ? `이 기기에 모두 있음 · ${n}편` : `이 기기에 ${have} / ${n}편`) : '';
}

function renderCrumbs() {
  const c = $('.crumbs');
  if (S.q) { c.innerHTML = `<b>찾기</b>`; return; }
  if (S.view.kind === 'recent') { c.innerHTML = '<b>최근 읽은 글</b>'; return; }
  if (S.view.kind === 'law') { c.innerHTML = '<b>판례·법령</b>'; return; }
  if (S.view.kind === 'trash') { c.innerHTML = '<b>휴지통</b>'; return; }
  const path = folderPath(S.view.folder);
  c.innerHTML = [`<button data-folder="">내 책장</button>`, ...path.map((f, i) => i === path.length - 1 ? `<b>${esc(f.name)}</b>` : `<button data-folder="${f.id}">${esc(f.name)}</button>`)].join('<span class="sl">›</span>');
  if (!path.length) c.innerHTML = '<b>내 책장</b>';
}

function renderTools() {
  const t = $('.tools');
  if (S.select) {
    const n = S.select.files.size + S.select.folders.size;
    t.innerHTML = `<span class="sel-n">${n}개 선택</span><button class="btn" data-t="move" ${n ? '' : 'disabled'}>옮기기</button><button class="btn" data-t="trash" ${n ? '' : 'disabled'}>휴지통으로</button><button class="btn ghost" data-t="endsel">선택 끝</button>`;
    return;
  }
  if (S.q) { t.innerHTML = ''; return; }
  if (S.view.kind === 'trash') {
    const any = S.index.files.some((f) => f.trashed) || S.index.folders.some((f) => f.trashed);
    t.innerHTML = `<span class="hint">휴지통의 파일은 7일 동안 보관된 뒤 자동으로 지워집니다</span>${any ? '<button class="btn danger" data-t="empty">휴지통 비우기</button>' : ''}`;
    return;
  }
  if (S.view.kind === 'recent' || S.view.kind === 'law') { t.innerHTML = ''; return; }
  const label = { added: '최근 올린 순', name: '이름순', opened: '최근 읽은 순', published: '발간일 순', stars: '★ 순' }[S.sort];
  t.innerHTML = `<button class="btn" data-t="newfolder">${I.newfolder}<span>새 폴더</span></button><button class="btn" data-t="upload">${I.up}<span>올리기</span></button><span class="sp"></span><button class="btn ghost" data-t="sort">${I.sort}<span>${label}</span></button>`;
}

function sorted(files) {
  const opened = (f) => (S.state.files[f.id] && S.state.files[f.id].at) || 0;
  const pub = (f) => (S.info[f.id] && S.info[f.id].date) || '';
  const by = { added: (a, b) => b.added - a.added, published: (a, b) => (pub(b) > pub(a) ? 1 : pub(b) < pub(a) ? -1 : b.added - a.added), name: (a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }), opened: (a, b) => opened(b) - opened(a) || b.added - a.added, stars: (a, b) => gradeRank(b.stars) - gradeRank(a.stars) || b.added - a.added }[S.sort];
  return files.slice().sort(by);
}

function renderFolder(c, folder) {
  const folders = childFolders(folder);
  const files = sorted(liveFiles().filter((f) => (f.folder ?? null) === (folder ?? null)));
  let html = '';
  if (!folder) {
    const resume = liveFiles().map((f) => ({ f, s: S.state.files[f.id] })).filter((x) => x.s && !x.s.done && x.f.pages && x.s.page < x.f.pages - 1).sort((a, b) => b.s.at - a.s.at).slice(0, 4);
    if (resume.length) html += `<h2 class="sec-h">이어 읽기</h2><div class="resume">${resume.map(({ f, s }) => `<div class="card-w ${S.select && S.select.files.has(f.id) ? 'sel' : ''}" data-file="${f.id}"><button class="card" data-open="${f.id}" data-resume="1"><span class="thumb" data-thumb="${f.thumb ? f.id : ''}">${coverMark(f.stars)}</span><span class="card-t">${esc(stem(f.name))}</span><span class="card-s">${pageOf(s, f.pages)} · ${ago(s.at)}</span><span class="pbar"><i style="width:${Math.round(100 * (s.page + 1) / f.pages)}%"></i></span></button>${ckBox(S.select && S.select.files.has(f.id))}${S.select ? '' : `<button class="card-x" data-unresume="${f.id}" aria-label="이어 읽기에서 빼기" title="이어 읽기에서 빼기">${I.close}</button>`}</div>`).join('')}</div>`;
  }
  if (!folders.length && !files.length) {
    html += `<div class="empty-big">${I.pdf}<p>${folder ? '이 폴더는 비어 있습니다' : '아직 올린 PDF가 없습니다'}</p><p class="sub">PDF를 여기로 끌어다 놓거나 <button class="link" data-t="upload">올리기</button>를 누르세요.</p></div>`;
    c.innerHTML = html; return;
  }
  html += listHead(folder ? `${folders.length + files.length}개` : files.length ? '전체' : '폴더');
  html += '<div class="list">' + folders.map(folderRow).join('') + files.map((f) => fileRow(f)).join('') + '</div>';
  c.innerHTML = html;
}

const boxes = () => !S.q && S.view.kind !== 'trash';   // rows carry a checkbox here
const allPicked = () => { const all = shownItems(); return !!S.select && all.files.length + all.folders.length > 0 && all.files.every((id) => S.select.files.has(id)) && all.folders.every((id) => S.select.folders.has(id)); };
function listHead(label) {   // the list's heading, with 전체 선택 at its right (it picks what this list shows)
  return `<div class="list-h"><h2 class="sec-h">${esc(label)}</h2>${boxes() ? `<button type="button" class="sec-act" data-selall>${allPicked() ? '선택 해제' : '전체 선택'}</button>` : ''}</div>`;
}
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
  return `<div class="row folder ${sel ? 'sel' : ''}" data-fid="${f.id}"><span class="ficon">${I.folder}${boxes() ? ckBox(sel) : ''}</span><span class="meta"><b>${esc(f.name)}</b><span class="sub">${n ? n + '개' : '비어 있음'}</span></span>${S.select ? '' : `<button class="ib more" data-fmenu="${f.id}" aria-label="폴더 메뉴">${I.more}</button>`}</div>`;
}

function fileRow(f, extra = '') {
  const s = S.state.files[f.id];
  const sel = S.select && S.select.files.has(f.id);
  const where = (S.q || S.view.kind === 'recent') && f.folder ? esc((folderById(f.folder) || {}).name || '') : '';
  return `<div class="row file ${sel ? 'sel' : ''} ${f.stars === -1 ? 'dim' : ''}" data-file="${f.id}">
    <span class="thumb" data-thumb="${f.thumb ? f.id : ''}">${coverMark(f.stars)}${boxes() ? ckBox(sel) : ''}</span>
    <span class="meta"><b>${esc(stem(f.name))}</b><span class="sub">${[paperLine(f) || (f.pages ? f.pages + '쪽' : ''), where, f.pending ? '정리하는 중' : ''].filter(Boolean).join(' · ')}<span class="ocr-p">${isScan(f) ? (OCR.id === f.id ? ` · 글자 읽는 중 ${OCR.done}/${OCR.total}쪽` : needsOcr(f) ? ' · 스캔본' : '') : ''}</span></span>${extra}</span>
    <span class="here ${S.cached.has(f.id) ? 'on' : ''}" title="${S.cached.has(f.id) ? '이 기기에 받아 둠' : ''}">${S.cached.has(f.id) ? I.device : ''}</span>
    ${S.select ? '' : `<button class="ib more" data-menu="${f.id}" aria-label="파일 메뉴">${I.more}</button>`}</div>`;
}

function gradeRank(v) { return v > 0 ? v : v === -2 ? 0.5 : v === -1 ? -1 : 0; }   // ★★★ ★★ ★ △ (none) ✕
function coverMark(v) { return v ? `<i class="cover-mark" aria-label="${v > 0 ? '별 ' + v + '개' : v === -2 ? '세모' : '엑스'}">${gradeSVG(v)}</i>` : ''; }

const recentList = () => liveFiles().filter((f) => S.state.files[f.id]).sort((a, b) => S.state.files[b.id].at - S.state.files[a.id].at).slice(0, 60);
function shownItems() {   // what the list in view shows (전체 선택 picks these)
  if (S.view.kind === 'recent') return { files: recentList().map((f) => f.id), folders: [] };
  if (S.view.kind === 'home') return { files: liveFiles().filter((f) => (f.folder ?? null) === (S.view.folder ?? null)).map((f) => f.id), folders: childFolders(S.view.folder).map((f) => f.id) };
  return { files: [], folders: [] };
}
function renderRecent(c) {
  const list = recentList();
  c.innerHTML = list.length ? listHead(`${list.length}편`) + '<div class="list">' + list.map((f) => fileRow(f)).join('') + '</div>' : `<div class="empty-big">${I.clock}<p>아직 읽은 글이 없습니다</p></div>`;
}

function renderTrash(c) {
  const fs = S.index.folders.filter((f) => f.trashed), files = S.index.files.filter((f) => f.trashed || folderTrashed(f.folder));
  const topFiles = files.filter((f) => f.trashed && !folderTrashed(f.folder));
  if (!fs.length && !topFiles.length) { c.innerHTML = `<div class="empty-big">${I.trash}<p>휴지통이 비어 있습니다</p></div>`; return; }
  c.innerHTML = '<div class="list">' +
    fs.map((f) => `<div class="row folder"><span class="ficon">${I.folder}</span><span class="meta"><b>${esc(f.name)}</b><span class="sub">${date(f.trashed)}에 버림 · ${keepLeft(f.trashed)}</span></span><button class="btn small" data-restore-folder="${f.id}">되살리기</button><button class="btn small danger ghost" data-purge-folder="${f.id}">영구 삭제</button></div>`).join('') +
    topFiles.map((f) => `<div class="row file"><span class="thumb" data-thumb="${f.thumb ? f.id : ''}"></span><span class="meta"><b>${esc(stem(f.name))}</b><span class="sub">${size(f.size)} · ${date(f.trashed)}에 버림 · ${keepLeft(f.trashed)}</span></span><button class="btn small" data-restore="${f.id}">되살리기</button><button class="btn small danger ghost" data-purge="${f.id}">영구 삭제</button></div>`).join('') + '</div>';
}

/* ---------- search: names at once, then the text of every page ---------- */
async function renderSearch(c) {
  const q = S.q, key = q.replace(/\s+/g, '').toLowerCase();
  const files = liveFiles();
  const nameHits = files.filter((f) => f.name.replace(/\s+/g, '').toLowerCase().includes(key));
  const folderHits = S.index.folders.filter((f) => !f.trashed && f.name.replace(/\s+/g, '').toLowerCase().includes(key));
  // a decision's or judgment's number, or an article: that first (the decision, the judgment, the article's text), then the
  // papers that cite it
  const caseNo = cases.caseQuery(q), courtNo = !caseNo && laws.courtQuery(q), artQ = !caseNo && !courtNo && laws.articleQuery(q);
  c.innerHTML = `${caseNo ? '<div class="case-sec"></div>' : courtNo ? '<div class="court-sec"></div>' : artQ ? '<div class="art-sec"></div>' : ''}<h2 class="sec-h">이름</h2>${nameHits.length || folderHits.length ? '<div class="list">' + folderHits.map(folderRow).join('') + nameHits.map((f) => fileRow(f)).join('') + '</div>' : '<p class="none">이름이 맞는 파일이 없습니다</p>'}
    <div class="mark-sec"></div>
    <h2 class="sec-h">본문 <span class="sec-n text-n"></span></h2><div class="list text-hits"></div>`;
  lazyThumbs();
  if (caseNo) caseCard($('.case-sec', c), caseNo, () => S.q === q);
  else if (courtNo) courtCard($('.court-sec', c), courtNo.no, () => S.q === q);
  else if (artQ) articleCard($('.art-sec', c), artQ, () => S.q === q);
  const box = $('.text-hits', c), n = $('.text-n', c);
  if (key.length < 2) { box.innerHTML = '<p class="none">두 글자 이상 넣으면 밑줄과 본문에서도 찾습니다</p>'; return; }
  // my own marks: what I already found worth marking
  const fillMarks = async () => {
    const hits = await markHits(key);
    const offs = await printedOffsets(hits.map((r) => r.f.id));
    if (S.q !== q) return;
    const total = hits.reduce((s, r) => s + r.snips.length, 0);
    $('.mark-sec', c).innerHTML = total ? `<h2 class="sec-h">내 밑줄 <span class="sec-n">${total}개</span></h2><div class="list">${hits.map((r) => fileRow(r.f, `<span class="snips">${r.snips.slice(0, 6).map((s) => `<button class="snip mark-snip" data-open="${r.f.id}" data-page="${s.m.p}" data-mark="${esc(s.m.id)}"><em>${pageLabel(r.f.id, s.m.p, offs.get(r.f.id))}</em><i class="${s.m.kind === 'ul' ? 'uw' : 'sw'}" style="--c:${esc(s.m.color)}"></i>${s.pre ? '…' : ''}${esc(s.a)}<mark>${esc(s.w)}</mark>${esc(s.b)}${s.post ? '…' : ''}</button>`).join('')}${r.snips.length > 6 ? `<span class="snip-more">외 ${r.snips.length - 6}곳</span>` : ''}</span>`)).join('')}</div>` : '';
    lazyThumbs();
  };
  fillMarks();
  fetchAllMarks().then((changed) => { if (changed && S.q === q) fillMarks(); });
  pageHits([key], () => S.q === q, (results, done, all) => {
    box.innerHTML = results.slice(0, 80).map((r) => fileRow(r.f, snipsHtml(r, q))).join('') || (done === all ? '<p class="none">본문에서 찾지 못했습니다</p>' : '');
    n.textContent = done < all ? `찾는 중 ${done}/${all}` : (results.length ? `${results.length}개 파일` : '');
    lazyThumbs();
  });
}
const snipsHtml = (r, q) => `<span class="snips">${r.snips.map((s) => `<button class="snip" data-open="${r.f.id}" data-page="${s.page}" data-q="${esc(q)}"><em>${r.o == null ? (s.page + 1) + '쪽' : (s.page + 1 + r.o) + '면'}</em>…${esc(s.a)}<mark>${esc(s.w)}</mark>${esc(s.b)}…</button>`).join('')}</span>`;
// every paper's page texts searched for the words (spaces and case ignored); the papers by how often, a few places each.
// A word that ends in a number does not match a longer number (헌법 제1조 is not 제10조, 2004헌마55 is not 2004헌마554).
async function pageHits(keys, live, onUpdate) {
  const withText = liveFiles().filter((f) => f.text);
  const results = [], queue = withText.slice();
  let done = 0;
  const update = () => { if (live()) onUpdate(results.sort((a, b) => b.n - a.n), done, withText.length); };
  update();
  const worker = async () => {
    while (queue.length && live()) {
      const f = queue.shift();
      const t = await textOf(f).catch(() => null);
      done++;
      if (t && t.pages) {
        const snips = []; let count = 0;
        t.pages.forEach((txt, page) => {
          let flat = ''; const map = [];
          for (let i = 0; i < txt.length; i++) if (!/\s/.test(txt[i])) { flat += txt[i].toLowerCase(); map.push(i); }
          for (const key of keys) {
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
      if (done % 4 === 0 || !queue.length) update();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  update();
}

/* ---------- 헌재 결정: a card in 찾기, and the decision in a sheet ---------- */
async function caseCard(box, no, live) {
  const head = '<h2 class="sec-h">헌재 결정</h2>';
  const card = (d) => `${head}<button type="button" class="case-card" data-case-open="${esc(no)}"><b>${esc(d.name || no)}</b><span>${esc(cases.cite(d))}${d.result ? ' · ' + esc(d.result) : ''}</span>${d.order || d.points ? `<em>${esc(String(d.order || d.points).split('\n')[0])}</em>` : ''}</button>`;
  box.innerHTML = head + '<p class="none">헌법재판소 판례정보에서 찾는 중…</p>';
  try {
    const d = await cases.decision(no, (pre) => { if (live()) box.innerHTML = card(pre); });
    if (!live()) return;
    box.innerHTML = d ? card(d) : head + '<p class="none">헌법재판소 판례정보에서 찾지 못했습니다</p>';
  } catch (e) {
    if (live()) box.innerHTML = head + `<p class="none">${e && e.code === 'offline' ? '인터넷에 연결되면 결정을 찾아 보여 드립니다' : '지금은 헌법재판소 판례정보에 닿지 않습니다'}</p>`;
  }
}
/* ---------- 판례·법령: 헌재 결정, and the articles of 헌법 and 헌법재판소법, by number, words or article ---------- */
const LAW_EX = ['2004헌마554', '관습헌법', '헌법 제37조 제2항', '공직선거법 제82조의8', '선거관리위원회법', '대법원 2000두7735', '헌법'];
let lawRecent = null;
// 판례·법령 has its own search, wide at the top of the page (the shelf's small box in the toolbar is put away here)
function syncFind() {
  const main = $('.main'); if (main) main.classList.toggle('law-mode', S.view.kind === 'law');
}
function lawFrame(c) {
  if (c.querySelector(':scope > .law-top')) return;
  c.innerHTML = `<div class="law-top"><label class="law-find">${I.search}<input type="search" placeholder="사건번호 · 낱말 · 조문 — 2004헌마554, 관습헌법, 헌법 제37조" enterkeyhint="search" autocomplete="off" aria-label="판례·법령 찾기"></label></div><div class="law-body"></div>`;
  const inp = $('.law-find input', c);
  inp.value = S.lq || '';
  // asked of the courts' servers: it waits a little longer for the typing to settle, and Enter asks at once
  const ask = () => { clearTimeout(S.qT); S.lq = inp.value.trim(); renderLaw(c); };
  inp.addEventListener('input', () => { clearTimeout(S.qT); S.qT = setTimeout(ask, 650); });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Escape') { inp.value = ''; ask(); } if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ask(); inp.blur(); } });
  if (matchMedia('(hover: hover) and (pointer: fine)').matches && !S.lq) setTimeout(() => inp.focus(), 0);   // a keyboard at hand: ready to type
}
async function renderLaw(cIn) {
  const q = (S.lq || '').trim();
  lawFrame(cIn);
  const inp = $('.law-find input', cIn);
  if (inp && inp.value.trim() !== q && document.activeElement !== inp) inp.value = q;
  const c = $('.law-body', cIn);
  c.dataset.law = q;
  const live = () => S.view.kind === 'law' && !S.q && (S.lq || '').trim() === q;
  if (!q) {
    if (!lawRecent) lawRecent = (await store.get('kv', 'lawRecent').catch(() => null)) || [];
    if (!live()) return;
    const chips = (xs) => `<div class="law-ex">${xs.map((x) => `<button type="button" data-lq="${esc(x)}">${esc(x === '헌법' ? '헌법 전체' : x)}</button>`).join('')}</div>`;
    c.innerHTML = `<div class="law-home"><h2 class="sec-h">이렇게 찾습니다</h2>${chips(LAW_EX)}
      <p class="law-note">사건번호를 넣으면 그 결정·판결을, 낱말을 넣으면 사건명·결정요지·주요 결정에서 찾습니다. 「헌법 제37조 제2항」처럼 조문을 넣으면 그 조문과 함께, 헌법이면 관련 결정요지를, 다른 법률이면 그 조문을 심판한 헌재 결정을 보여 드립니다. 법률 이름만 넣으면 그 법의 조문 전체와 그 법을 심판한 결정이 나옵니다.</p>
      ${lawRecent.length ? `<h2 class="sec-h">최근 찾은 것</h2>${chips(lawRecent)}` : ''}
      ${laws.drfReady() ? '' : '<p class="law-note faint">대법원 판결과 다른 법률의 조문 내용은 국가법령정보 연결을 마치면 여기서 바로 보입니다. 그 전에는 국가법령정보센터의 해당 페이지를 열어 드립니다.</p>'}</div>`;
    return;
  }
  rememberLaw(q);
  c.innerHTML = '<div class="law-res"></div>';
  const box = $('.law-res', c);
  const cno = cases.caseQuery(q), court = laws.courtQuery(q), art = laws.articleQuery(q), whole = laws.lawKey(q);
  if (cno) { box.innerHTML = '<div class="case-sec"></div>'; caseCard($('.case-sec', box), cno, live); mineSec(box, [cno.toLowerCase()], q, live); return; }
  if (court) { box.innerHTML = '<div class="court-sec"></div>'; courtCard($('.court-sec', box), court.no, live); mineSec(box, [court.no.toLowerCase()], q, live); return; }
  if (art) {
    const own = !!laws.LAWS[art.law];   // 헌법, 헌법재판소법: the court's own text; any other law: 국가법령정보
    box.innerHTML = '<div class="art-sec"></div>' + (own ? lawSec('holding', '이 조문이 나오는 결정요지') : lawSec('law', '이 조문을 심판한 헌재 결정'));
    articleCard($('.art-sec', box), art, live);
    const ref = `${art.law} ${laws.artLabel(art)}${art.para ? ` 제${art.para}항` : ''}`;
    if (own) fillSec(box, 'holding', (pg) => cases.byHolding(ref, pg), live);
    else fillSec(box, 'law', (pg) => cases.byLaw(art.law, art.art, art.para, pg), live, true);
    const tail = `제${art.art}조${art.sub ? '의' + art.sub : ''}${art.para ? `제${art.para}항` : ''}`;
    const names = art.law === '헌법' ? ['헌법', '대한민국헌법'] : [art.law.replace(/\s+/g, '')];
    mineSec(box, names.flatMap((nm) => [nm + tail, '「' + nm + '」' + tail]), q, live, $('.art-sec', box));
    return;
  }
  if (whole) { lawWhole(box, whole, live); return; }
  const lawLike = /(?:법|법률|령|규칙)$/.test(q.replace(/\s+/g, ''));
  const secs = [['name', '사건명', (pg) => cases.byName(q, pg)], ['holding', '결정요지 (판례요지집)', (pg) => cases.byHolding(q, pg)], ['leading', '주요 결정', (pg) => cases.byLeading(q, pg)]];
  if (lawLike) secs.unshift(['law', '이 법률을 심판한 결정', (pg) => cases.byLaw(q.replace(/\s+/g, ''), 0, 0, pg)]);
  box.innerHTML = (lawLike ? '<div class="whole-sec"></div>' : '') + secs.map(([k, t]) => lawSec(k, t)).join('') + '<p class="none law-empty" hidden>헌법재판소 자료에서 찾지 못했습니다</p>';
  if (lawLike) lawWhole($('.whole-sec', box), q, live, true);
  let left = secs.length, any = false;
  for (const [k, , ask] of secs) fillSec(box, k, ask, live).then((n) => { any = any || n > 0; if (--left === 0 && !any && live()) $('.law-empty', box).hidden = false; });
}
// the papers on this shelf that cite what was looked up, right under it
function mineSec(box, keys, q, live, after) {
  const sec = el('section', 'mine-sec', '<h2 class="sec-h">내 책장에서 <span class="sec-n"></span></h2><div class="list mine-list"></div>');
  sec.hidden = true;
  if (after) after.after(sec); else box.appendChild(sec);
  const list = $('.mine-list', sec), n = $('.sec-n', sec);
  pageHits(keys.map((k) => k.toLowerCase()), live, (results, done, all) => {
    sec.hidden = !results.length && done === all;
    if (!results.length && done < all) { sec.hidden = false; n.textContent = `찾는 중 ${done}/${all}`; return; }
    list.innerHTML = results.slice(0, 40).map((r) => fileRow(r.f, snipsHtml(r, q))).join('');
    n.textContent = done < all ? `찾는 중 ${done}/${all}` : `${results.length}편이 인용`;
    lazyThumbs();
  });
}
function rememberLaw(q) {   // kept once the question has stood a moment (not every half-typed word)
  clearTimeout(S.lawRemT);
  S.lawRemT = setTimeout(() => {
    if (!q || (S.lq || '').trim() !== q) return;
    lawRecent = [q, ...(lawRecent || []).filter((x) => x !== q)].slice(0, 8);
    store.put('kv', 'lawRecent', lawRecent).catch(() => {});
  }, 1500);
}
const lawRow = {
  name: (r) => caseRow(r.no, r.name, [r.no, r.date, r.court], r.result),
  law: (r) => caseRow(r.no, r.name, [r.no, r.date, r.target], r.result, r.order),
  leading: (r) => caseRow(r.no, r.nick ? `${r.nick} · ${r.name}` : r.name, [r.no, r.date, r.area]),
  holding: (r) => `<button type="button" class="lrow" data-holding="${esc(r.seq)}"><b>${esc(r.title)}</b><span>${esc(r.path)}</span></button>`,
};
function caseRow(no, name, meta, result, order) {
  if (!no) return '';
  return `<button type="button" class="lrow" data-case-open="${esc(no)}"><b>${esc(name || no)}</b><span>${meta.filter(Boolean).map(esc).join(' · ')}${result ? ` · <em>${esc(result)}</em>` : ''}</span>${order ? `<span class="lr-o">${esc(order.split('\n')[0])}</span>` : ''}</button>`;
}
function lawSec(kind, title) { return `<section class="law-sec" data-sec="${kind}"><h2 class="sec-h">${title} <span class="sec-n"></span></h2><div class="list law-list"><p class="none">찾는 중…</p></div></section>`; }
// one section of answers, a page at a time; resolves to how many there are in all (an empty section folds away)
async function fillSec(box, kind, ask, live, keep, page = 1) {
  const sec = $(`[data-sec="${kind}"]`, box); if (!sec) return 0;
  const list = $('.law-list', sec), n = $('.sec-n', sec);
  try {
    const r = await ask(page);
    if (!live()) return 0;
    if (page === 1) list.innerHTML = '';
    const more = list.querySelector('.more'); if (more) more.remove();
    if (!r.total && page === 1) { if (keep) list.innerHTML = '<p class="none">없습니다</p>'; else sec.hidden = true; return 0; }
    list.insertAdjacentHTML('beforeend', r.rows.map(lawRow[kind]).join(''));
    n.textContent = `${r.total}건`;
    const shown = list.querySelectorAll('.lrow').length;
    if (shown < r.total && r.rows.length) {
      list.insertAdjacentHTML('beforeend', `<button type="button" class="more">더 보기 · ${shown} / ${r.total}</button>`);
      list.lastElementChild.onclick = (e) => { e.currentTarget.textContent = '불러오는 중…'; fillSec(box, kind, ask, live, keep, page + 1); };
    }
    return r.total;
  } catch (e) {
    if (!live()) return 0;
    const more = list.querySelector('.more');
    if (page > 1 && more) more.textContent = '불러오지 못했습니다 · 다시 누르기';   // the rows already shown stay
    else list.innerHTML = `<p class="none">${e && e.code === 'offline' ? '인터넷에 연결되면 찾을 수 있습니다' : '지금은 헌법재판소 자료에 닿지 않습니다'}</p>`;
    return 0;
  }
}
const lawErr = (e) => (e && e.code === 'offline' ? '인터넷에 연결되면 볼 수 있습니다' : '지금은 헌법재판소 자료에 닿지 않습니다');
// an article of 헌법 or 헌법재판소법, the paragraph asked for picked out; the articles before and after one tap away
async function articleCard(box, a, live) {
  box.innerHTML = '<div class="law-card"><p class="none">조문을 불러오는 중…</p></div>';
  let law;
  try { law = await laws.lawText(a.law); } catch (e) { if (live()) box.innerHTML = e && /unregistered|nolaw/.test(e.code) ? lawLinkCard(a, e.code) : `<div class="law-card"><p class="none">${lawErr(e)}</p></div>`; return; }
  if (!live()) return;
  const x = laws.findArt(law, a.art, a.sub);
  const name = a.law === '헌법' ? '헌법' : law.full;
  if (!x) { box.innerHTML = `<div class="law-card"><p class="none">${esc(law.full)}에서 그 조문을 찾지 못했습니다 · 마지막 조문은 ${laws.artLabel(law.arts[law.arts.length - 1])}</p></div>`; return; }
  const i = law.arts.indexOf(x), prev = law.arts[i - 1], next = law.arts[i + 1];
  const ps = laws.paras(x), pick = a.para && ps[a.para - 1] ? a.para : 0;
  const go = (y, text) => `<button type="button" class="btn ghost small" data-lq="${esc(name + ' ' + laws.artLabel(y))}">${text}</button>`;
  box.innerHTML = `<div class="law-card">
    <div class="lc-h"><b>${esc(name)} ${laws.artLabel(x)}${x.title ? `<span class="lc-tt">(${esc(x.title)})</span>` : ''}</b><span>${esc([x.chapter, law.src ? law.title : ''].filter(Boolean).join(' · '))}</span></div>
    <div class="lc-t">${ps.map((t, k) => `<p class="${pick === k + 1 ? 'on' : ''}">${cases.linkCases(t)}</p>`).join('')}</div>
    <div class="lc-acts">${prev ? go(prev, '‹ ' + laws.artLabel(prev)) : ''}<span class="sp"></span><button type="button" class="btn ghost small lc-copy">복사</button><a class="btn ghost small" href="${laws.lawGoKr.article(law.full, x.art, x.sub)}" target="_blank" rel="noopener">국가법령정보센터</a><span class="sp"></span>${next ? go(next, laws.artLabel(next) + ' ›') : ''}</div>
  </div>`;
  $('.lc-copy', box).onclick = () => copyText(`${law.full} ${laws.artLabel(x)}${pick ? ` 제${pick}항` : ''}\n${pick ? ps[pick - 1] : x.text}`);
}
// a whole law, chapter by chapter, one line per article
async function lawWhole(box, key, live, quiet) {
  box.innerHTML = quiet ? '' : '<div class="law-card"><p class="none">불러오는 중…</p></div>';
  let law;
  try { law = await laws.lawText(key); } catch (e) { if (live() && !quiet) box.innerHTML = `<div class="law-card"><p class="none">${lawErr(e)}</p></div>`; return; }
  if (!live()) return;
  const name = key === '헌법' ? '헌법' : law.full;
  let html = '', ch = null;
  for (const a of law.arts) {
    if (a.chapter !== ch) { ch = a.chapter; html += `<h3 class="lw-ch">${esc(ch || '')}</h3>`; }
    html += `<button type="button" class="lw-a" data-lq="${esc(name + ' ' + laws.artLabel(a))}"><b>${laws.artLabel(a)}${a.title ? ` ${esc(a.title)}` : ''}</b><span>${esc(a.text.split('\n')[0])}</span></button>`;
  }
  box.innerHTML = `<div class="law-card law-whole"><div class="lc-h"><b>${esc(law.title)}</b><span>${law.arts.length}개 조</span></div>${law.preamble ? `<details class="cs-fold"><summary>전문</summary><p>${esc(law.preamble)}</p></details>` : ''}${html}</div>`;
}
// a court's judgment: in the app when 국가법령정보 answers, else its page at 국가법령정보센터
async function courtCard(box, no, live) {
  const link = `<a class="btn primary small" href="${laws.lawGoKr.case(no)}" target="_blank" rel="noopener">국가법령정보센터에서 보기</a>`;
  const plain = (why) => `<div class="law-card"><div class="lc-h"><b>${esc(no)}</b><span>법원 판결</span></div><p class="law-note">${why}</p><div class="lc-acts">${link}</div></div>`;
  box.innerHTML = `<h2 class="sec-h">법원 판결</h2><p class="none">국가법령정보에서 찾는 중…</p>`;
  try {
    const d = await laws.courtCase(no);
    if (!live()) return;
    box.innerHTML = d ? `<h2 class="sec-h">법원 판결</h2><button type="button" class="case-card" data-court-open="${esc(no)}"><b>${esc(d.name || no)}</b><span>${esc(laws.courtCite(d))}</span>${d.points ? `<em>${esc(d.points.split('\n')[0])}</em>` : ''}</button>` : plain('국가법령정보에서 이 사건을 찾지 못했습니다. 공개되지 않은 판결일 수 있습니다.');
  } catch (e) {
    if (live()) box.innerHTML = plain(e && e.code === 'unregistered' ? '법원 판결은 국가법령정보 연결을 마치면 이 안에서 판시사항·판결요지·전문까지 보입니다. 지금은 국가법령정보센터의 판례 페이지에서 엽니다.' : lawErr(e));
  }
}
function lawLinkCard(a, why) {
  const label = `${a.law} ${laws.artLabel(a)}${a.para ? ` 제${a.para}항` : ''}`;
  return `<div class="law-card"><div class="lc-h"><b>${esc(label)}</b></div>
    <p class="law-note">${why === 'nolaw' ? '국가법령정보에서 이 이름의 법령을 찾지 못했습니다. 정식 이름으로 찾아 보세요.' : '이 법률의 조문 내용은 국가법령정보 연결을 마치면 여기서 바로 보입니다.'} 아래에는 이 조문을 심판대상으로 한 헌재 결정을 모았습니다.</p>
    <div class="lc-acts"><a class="btn ghost small" href="${laws.lawGoKr.article(a.law, a.art, a.sub)}" target="_blank" rel="noopener">국가법령정보센터에서 조문 보기</a></div></div>`;
}
function courtSheet(no, trail = []) {
  const box = sheet(`<div class="cs-head">${trail.length ? `<button class="ib cs-back" aria-label="뒤로">${I.back}</button>` : ''}<h2>${esc(no)}</h2></div><div class="cs-body"><p class="cs-wait">불러오는 중…</p></div><div class="row-btns"><button class="btn ghost cs-copy" hidden>인용 복사</button></div>`);
  box.classList.add('case-sheet');
  const body = $('.cs-body', box), h = $('h2', box), cp = $('.cs-copy', box);
  laws.courtCase(no).then((d) => {
    if (!box.isConnected) return;
    if (!d) { body.innerHTML = `<p class="cs-wait">국가법령정보에서 이 사건을 찾지 못했습니다.</p><p><a class="btn ghost small" href="${laws.lawGoKr.case(no)}" target="_blank" rel="noopener">국가법령정보센터에서 보기</a></p>`; return; }
    h.textContent = laws.courtCite(d); body.innerHTML = cases.judgmentView(d); cases.wireCase(body, d);
    cp.hidden = false; cp.onclick = () => copyText(laws.courtCite(d));
  }, (e) => { if (box.isConnected) body.innerHTML = `<p class="cs-wait">${e && e.code === 'unregistered' ? '법원 판결은 국가법령정보 연결을 마치면 여기서 바로 보입니다.' : lawErr(e)}</p><p><a class="btn ghost small" href="${laws.lawGoKr.case(no)}" target="_blank" rel="noopener">국가법령정보센터에서 보기</a></p>`; });
  sheetLinks(box, (to) => courtSheet(to, [...trail, no]), no, () => courtSheet(trail[trail.length - 1], trail.slice(0, -1)));
}
// links inside a decision or judgment: another decision or judgment opens in the sheet; an article, in 판례·법령
function sheetLinks(box, again, self, back) {
  box.addEventListener('click', (e) => {
    const ln = e.target.closest('[data-case]'); if (ln) { if (ln.dataset.case !== self) caseSheet(ln.dataset.case); return; }
    const lc = e.target.closest('[data-court]'); if (lc) { if (lc.dataset.court !== self) courtSheet(lc.dataset.court); return; }
    const la = e.target.closest('[data-art]'); if (la) { closeSheet(); lawGo(la.dataset.art); return; }
    if (back && e.target.closest('.cs-back')) back();
  });
}
function lawGo(q) {   // to 판례·법령, asking q
  S.view = { kind: 'law', folder: null }; S.q = ''; S.select = null; S.lq = q; $('.find input').value = '';
  render(); $('.content').scrollTop = 0; window.scrollTo(0, 0);
}
function holdingSheet(seq) {
  const box = sheet(`<div class="cs-head"><h2>결정요지</h2></div><div class="cs-body"><p class="cs-wait">불러오는 중…</p></div>`);
  box.classList.add('case-sheet');
  const body = $('.cs-body', box);
  cases.holding(seq).then((h) => {
    if (!box.isConnected) return;
    if (!h) { body.innerHTML = '<p class="cs-wait">찾지 못했습니다.</p>'; return; }
    body.innerHTML = `<div class="cs-meta">${esc(h.path)}</div><div class="cs-name">${esc(h.title)}</div><section class="cs-sec"><p>${cases.linkCases(cases.unwrap(h.text))}</p></section>`
      + (h.cases.length ? `<section class="cs-sec"><h4>관련 결정</h4><p>${h.cases.map((no) => `<button type="button" class="case-ln" data-case="${esc(no)}">${esc(no)}</button>`).join(' · ')}</p></section>` : '');
  }, (e) => { if (box.isConnected) body.innerHTML = `<p class="cs-wait">${lawErr(e)}</p>`; });
  sheetLinks(box, null, null, null);
}
function caseSheet(no, trail = []) {
  const box = sheet(`<div class="cs-head">${trail.length ? `<button class="ib cs-back" aria-label="뒤로">${I.back}</button>` : ''}<h2>헌재 ${esc(no)}</h2></div><div class="cs-body"><p class="cs-wait">불러오는 중…</p></div><div class="row-btns"><button class="btn ghost cs-copy" hidden>인용 복사</button></div>`);
  box.classList.add('case-sheet');
  const body = $('.cs-body', box), h = $('h2', box), cp = $('.cs-copy', box);
  const show = (d) => {
    if (!box.isConnected) return;
    h.textContent = cases.cite(d); body.innerHTML = cases.caseView(d); cases.wireCase(body, d);
    cp.hidden = false; cp.onclick = () => copyText(cases.cite(d));
  };
  cases.decision(no, show).then((d) => { if (!box.isConnected) return; if (d) show(d); else body.innerHTML = '<p class="cs-wait">헌법재판소 판례정보에서 찾지 못했습니다. 병합된 사건의 뒷번호이거나 아직 실리지 않은 결정일 수 있습니다.</p>'; },
    (e) => { if (box.isConnected) body.innerHTML = `<p class="cs-wait">${e && e.code === 'offline' ? '인터넷에 연결되면 결정 내용을 볼 수 있습니다.' : '지금은 결정을 불러오지 못했습니다. 잠시 뒤 다시 열어 보세요.'}</p>`; });
  box.addEventListener('click', (e) => {
    const ln = e.target.closest('[data-case]');
    if (ln) { if (ln.dataset.case !== no) caseSheet(ln.dataset.case, [...trail, no]); return; }
    const lc = e.target.closest('[data-court]'); if (lc) { courtSheet(lc.dataset.court); return; }
    const la = e.target.closest('[data-art]'); if (la) { closeSheet(); lawGo(la.dataset.art); return; }
    if (e.target.closest('.cs-back')) caseSheet(trail[trail.length - 1], trail.slice(0, -1));
  });
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('복사했습니다'); } catch (e) { toast('복사하지 못했습니다'); }
}

async function textOf(f) {
  let t = await store.get('texts', f.id);
  if (t && (!f.ocr || t.ocr === f.ocr)) return t;   // a scan read since then: its texts now have the words
  if (!navigator.onLine) return t || null;
  t = await pdfkit.gunzipJSON(await api.getMeta(f.id, 'text'));
  await store.put('texts', f.id, t);
  notePaper(f.id, t);
  return t;
}

/* ---------- thumbnails: from this device, else fetched once ---------- */
let thumbIO = null;
function lazyThumbs() {
  if (!thumbIO) thumbIO = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { thumbIO.unobserve(e.target); loadThumb(e.target); } }, { rootMargin: '300px' });
  document.querySelectorAll('[data-thumb]:not([data-done])').forEach((t) => { t.dataset.done = '1'; if (t.dataset.thumb) thumbIO.observe(t); });
}
const thumbUrls = new Map();
async function loadThumb(span) {
  const id = span.dataset.thumb;
  try {
    let url = thumbUrls.get(id);
    if (!url) {
      let b = await store.get('thumbs', id);
      if (!b) { if (!navigator.onLine) return; b = await api.getMeta(id, 'thumb'); await store.put('thumbs', id, b); }
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
  const un = t.closest('[data-unresume]'); if (un) { unresume(un.dataset.unresume); return; }
  const co = t.closest('[data-case-open]'); if (co) { caseSheet(co.dataset.caseOpen); return; }
  const cc = t.closest('[data-court-open]'); if (cc) { courtSheet(cc.dataset.courtOpen); return; }
  const il = t.closest('.case-ln');   // a citation inside an article's text: the decision, the judgment, or that article
  if (il) { if (il.dataset.case) caseSheet(il.dataset.case); else if (il.dataset.court) courtSheet(il.dataset.court); else if (il.dataset.art) lawGo(il.dataset.art); return; }
  const lq = t.closest('[data-lq]'); if (lq) { S.lq = lq.dataset.lq; const li = $('.law-find input'); if (li) li.value = S.lq; renderLaw($('.content')); $('.content').scrollTop = 0; window.scrollTo(0, 0); return; }
  const ho = t.closest('[data-holding]'); if (ho) { holdingSheet(ho.dataset.holding); return; }
  if (t.closest('[data-selall]')) { pickAll(); return; }
  const ck = t.closest('[data-ck]');
  if (ck) { const row = ck.closest('.row, .card-w[data-file]'); if (row) { pick(row.dataset.file ? { file: row.dataset.file } : { folder: row.dataset.fid }); } return; }
  if (S.select) { const cw = t.closest('.card-w[data-file]'); if (cw) { pick({ file: cw.dataset.file }); return; } }
  const up = t.closest('[data-t="upload"]'); if (up) { uploadBox(); return; }
  const r = t.closest('[data-restore]'); if (r) { doOps([{ op: 'restoreFile', id: r.dataset.restore }], '되살렸습니다'); return; }
  const rf = t.closest('[data-restore-folder]'); if (rf) { doOps([{ op: 'restoreFolder', id: rf.dataset.restoreFolder }], '되살렸습니다'); return; }
  const p = t.closest('[data-purge]'); if (p) { confirmBox('영구 삭제', '이 파일과 밑줄을 완전히 지웁니다. 되돌릴 수 없습니다.', '영구 삭제', true).then((ok) => ok && doOps([{ op: 'purgeFile', id: p.dataset.purge }], '지웠습니다')); return; }
  const pf = t.closest('[data-purge-folder]'); if (pf) { confirmBox('영구 삭제', '이 폴더와 안의 파일을 완전히 지웁니다. 되돌릴 수 없습니다.', '영구 삭제', true).then((ok) => ok && doOps([{ op: 'purgeFolder', id: pf.dataset.purgeFolder }], '지웠습니다')); return; }
  const mm = t.closest('[data-menu]'); if (mm) { const b = mm.getBoundingClientRect(); fileMenu(mm.dataset.menu, b.right, b.bottom); return; }
  const fm = t.closest('[data-fmenu]'); if (fm) { const b = fm.getBoundingClientRect(); folderMenu(fm.dataset.fmenu, b.right, b.bottom); return; }
  const sn = t.closest('[data-open]'); if (sn) { openFile(sn.dataset.open, sn.dataset.mark ? { page: Number(sn.dataset.page), mark: sn.dataset.mark } : sn.dataset.page != null ? { page: Number(sn.dataset.page), query: sn.dataset.q } : sn.dataset.resume ? { resume: true } : {}); return; }
  const row = t.closest('.row');
  if (!row) return;
  if (S.select) { pick(row.dataset.file ? { file: row.dataset.file } : { folder: row.dataset.fid }); return; }
  if (row.dataset.fid) { S.view = { kind: 'home', folder: row.dataset.fid }; S.q = ''; $('.find input').value = ''; render(); return; }
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

async function onTools(e) {
  const b = e.target.closest('[data-t]'); if (!b) return;
  const t = b.dataset.t;
  if (t === 'upload') uploadBox();
  else if (t === 'newfolder') {
    const name = await promptBox('새 폴더', '폴더 이름', '', '만들기');
    if (name) doOps([{ op: 'addFolder', folder: { id: 'f_' + rid(10), name, parent: S.view.folder || null } }]);
  } else if (t === 'sort') {
    const k = await menu(b.getBoundingClientRect(), [['added', '최근 올린 순'], ['opened', '최근 읽은 순'], ['published', '발간일 순'], ['stars', '★ 순'], ['name', '이름순']], S.sort);
    if (k) { S.sort = k; render(); }
  } else if (t === 'select') startSelect();
  else if (t === 'endsel') { S.select = null; render(); }
  else if (t === 'selall') pickAll();
  else if (t === 'trash' && S.select) {
    const ops = [...S.select.files].map((id) => ({ op: 'trashFile', id })).concat([...S.select.folders].map((id) => ({ op: 'trashFolder', id })));
    S.select = null; doOps(ops, '휴지통으로 옮겼습니다');
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
  const k = await menu({ left: x, right: x, top: y, bottom: y }, [['marks', f.stars || 0], ['open', '열기'], ['start', '처음부터 열기'], ['rename', '이름 바꾸기'], ['move', '옮기기'], ['-'], ['dl', '밑줄 넣어 내려받기'], ['print', '인쇄'], ['orig', '원본 내려받기'], ['-'], ...(needsOcr(f) && isScan(f) ? [['ocr', OCR.id === f.id ? '글자 읽는 중…' : '글자 읽기 (스캔본)']] : []), ['back', '예전 밑줄 되살리기'], ['clear', '밑줄 모두 지우기', 'danger'], ['trash', '휴지통으로', 'danger']]);
  if (k && k.startsWith('g:')) { const g = Number(k.slice(2)); rate(id, g === (f.stars || 0) ? 0 : g); return; }
  if (k === 'open') openFile(id);
  else if (k === 'start') openFile(id, { page: 0 });
  else if (k === 'rename') { const n = await promptBox('이름 바꾸기', '파일 이름', stem(f.name), '바꾸기', f.orig && f.orig !== f.name ? stem(f.orig) : null); if (n) doOps([{ op: 'updateFile', id, set: { name: n.endsWith('.pdf') ? n : n + '.pdf' } }]); }
  else if (k === 'move') { const to = await pickFolder('옮길 곳'); if (to !== undefined) doOps([{ op: 'updateFile', id, set: { folder: to } }], '옮겼습니다'); }
  else if (k === 'dl') exportPdf(f, { marks: true, mode: 'download' });
  else if (k === 'print') exportPdf(f, { marks: true, mode: 'print' });
  else if (k === 'orig') exportPdf(f, { marks: false, mode: 'download' });
  else if (k === 'clear') clearAllMarks(f);
  else if (k === 'back') marksBack(f);
  else if (k === 'ocr') { if (OCR.id === f.id) return; if (ocrRun) { toast('다른 스캔본을 읽는 중입니다. 끝나면 이어서 읽습니다'); return; } toast('글자를 읽기 시작했습니다. 쪽마다 몇 초씩 걸립니다', 4000); ocrQueue(f.id); }
  else if (k === 'trash') doOps([{ op: 'trashFile', id }], '휴지통으로 옮겼습니다');
}

/* ---------- ★ △ ✕ on the cover (works offline too: kept here and sent when the internet is back) ---------- */
async function rate(id, n) {
  const f = fileById(id); if (!f) return;
  const op = { op: 'updateFile', id, set: { stars: n } };
  f.stars = n; f.rated = n ? Date.now() : null;           // shown at once
  if (S.reader && S.readerId === id) S.reader.setStars(n);
  render();
  const q = ((await store.get('kv', 'pendingOps')) || []).filter((x) => !(x.op === 'updateFile' && x.id === id && 'stars' in x.set));
  q.push(op); await store.put('kv', 'pendingOps', q); await store.put('kv', 'index', S.index);
  flushOps();
}
let flushing = null;
async function flushOps() {   // changes made without internet, in order; the server copy wins for everything else
  if (flushing || !navigator.onLine) return flushing;
  flushing = (async () => {
    try {
      const q = (await store.get('kv', 'pendingOps')) || [];
      if (!q.length) return;
      const r = await api.ops(q);
      const now = (await store.get('kv', 'pendingOps')) || [];
      await store.put('kv', 'pendingOps', now.slice(q.length));
      S.index = r.index; applyPending(now.slice(q.length)); await store.put('kv', 'index', S.index); syncTags.lib = '';
      if (S.reader) renderUsage(); else render();
    } catch (e) { /* kept; sent later */ } finally { flushing = null; }
  })();
  return flushing;
}
function applyPending(q) { for (const o of q || []) if (o.op === 'updateFile') { const f = fileById(o.id); if (f && 'stars' in o.set) f.stars = o.set.stars; } }

/* ---------- clear every mark in a file (the PDF itself is untouched); undo from the toast ---------- */
async function clearAllMarks(f) {
  const all = await loadMarks(f.id);
  const live = all.filter((m) => !m.del);
  if (!live.length) { toast('지울 밑줄이 없습니다'); return; }
  if (!await confirmBox('밑줄 모두 지우기', `「${stem(f.name)}」의 형광펜과 밑줄 ${live.length}개를 모두 지웁니다. PDF 원본은 그대로입니다.`, '모두 지우기', true)) return;
  const t = Date.now();
  const next = all.map((m) => (m.del ? m : { id: m.id, del: true, t }));
  await saveMarks(f.id, next);
  if (S.reader && S.readerId === f.id) S.reader.setRemoteMarks(next);
  toast(`밑줄 ${live.length}개를 지웠습니다`, 9000, { label: '되돌리기', fn: async () => {
    const rec = await store.get('marks', f.id);
    const back = mergeMarks(rec ? rec.marks : next, live.map((m) => ({ ...m, t: Date.now() })));
    await saveMarks(f.id, back);
    if (S.reader && S.readerId === f.id) S.reader.setRemoteMarks(back);
    toast('되돌렸습니다');
  } });
}
async function folderMenu(id, x, y) {
  const f = folderById(id); if (!f) return;
  const k = await menu({ left: x, right: x, top: y, bottom: y }, [['rename', '이름 바꾸기'], ['move', '옮기기'], ['-'], ['trash', '휴지통으로', 'danger']]);
  if (k === 'rename') { const n = await promptBox('폴더 이름 바꾸기', '폴더 이름', f.name, '바꾸기'); if (n) doOps([{ op: 'renameFolder', id, name: n }]); }
  else if (k === 'move') { const to = await pickFolder('옮길 곳', new Set([id])); if (to !== undefined && to !== id) doOps([{ op: 'moveFolder', id, parent: to }], '옮겼습니다'); }
  else if (k === 'trash') doOps([{ op: 'trashFolder', id }], '휴지통으로 옮겼습니다');
}

async function doOps(ops, done) {
  if (!navigator.onLine) { toast('인터넷에 연결되면 할 수 있습니다'); return false; }
  try {
    const r = await api.ops(ops);
    S.index = r.index; await store.put('kv', 'index', r.index);
    const bad = (r.results || []).find((x) => !x.ok);
    render();
    if (bad) toast(bad.error === 'cycle' ? '폴더를 그 안의 폴더로 옮길 수는 없습니다' : bad.error === 'no_folder' ? '그 폴더가 더 이상 없습니다' : '일부를 처리하지 못했습니다');
    else if (done) toast(done);
    return r;
  } catch (e) {
    toast(api.isOffline(e) ? '인터넷에 연결되면 할 수 있습니다' : '처리하지 못했습니다. 다시 해 주세요.');
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
  const where = S.view.kind === 'home' && S.view.folder ? folderPath(S.view.folder).map((f) => f.name).join(' › ') : '내 책장';
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
    if (have && !have.trashed && !folderTrashed(have.folder)) { set('dup', { msg: `이미 있습니다${have.folder ? ' · ' + ((folderById(have.folder) || {}).name || '') : ''}` }); return; }
    let doc;
    try { doc = await pdfkit.openBytes(buf); }
    catch (e) { set('error', { msg: e && e.name === 'PasswordException' ? '암호가 걸린 PDF는 올릴 수 없습니다' : '열 수 없는 PDF입니다' }); return; }
    const pages = doc.numPages;
    if (!u.orig) u.orig = u.name;
    let first = null;   // what the first page says: "저자_제목" (used only when both are clear), and where it was published
    try {
      const p1 = (await pdfkit.pageItems(doc, 0)).page;
      const p2 = pages > 1 ? (await pdfkit.pageItems(doc, 1)).page : null;
      first = await nameFromBand(doc, p1, p2, naming.withFileName(naming.readFirstPages(p1, p2), u.orig || u.name), u.orig || u.name);
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
    render();
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
    render();
  } catch (e) {
    set('error', { msg: api.isOffline(e) ? '인터넷 연결이 끊겼습니다' : e.code === 'full' ? FULL_MSG : e.code === 'too_large' ? '파일이 너무 큽니다' : '올리지 못했습니다', full: e.code === 'full' });
  }
}
function renderUploads() {
  const box = $('.uploads'); if (!box) return;
  if (!S.uploads.length) { box.hidden = true; return; }
  const active = S.uploads.filter((u) => !['done', 'dup', 'error'].includes(u.status)).length;
  const label = { wait: '기다리는 중', read: '확인하는 중', up: '올리는 중', index: '본문 색인 중', done: '완료', dup: '', error: '' };
  box.hidden = false;
  box.innerHTML = `<div class="up-h"><b>${active ? `올리는 중 ${S.uploads.length - active}/${S.uploads.length}` : '올리기 끝'}</b>${active ? '' : '<button class="ib" data-x aria-label="닫기">' + I.close + '</button>'}</div>
    ${S.uploads.some((u) => u.status === 'error' && u.full) ? '<p class="up-note">무료 한도 9GB가 찼습니다. 휴지통을 비우거나 안 읽을 논문을 지운 뒤 <b>다시</b>를 누르세요.</p>' : ''}
    ${S.uploads.length > 30 ? `<p class="up-sum">${S.uploads.filter((u) => u.status === 'done').length}편 완료${S.uploads.filter((u) => u.status === 'dup').length ? ` · 이미 있던 ${S.uploads.filter((u) => u.status === 'dup').length}편` : ''}${S.uploads.filter((u) => u.status === 'error').length ? ` · 실패 ${S.uploads.filter((u) => u.status === 'error').length}편` : ''}${active ? ` · 남은 ${active}편` : ''}</p>` : ''}
    <ul>${(S.uploads.length > 30 ? S.uploads.filter((u) => !['done', 'dup', 'wait'].includes(u.status)).concat(S.uploads.filter((u) => u.status === 'wait').slice(0, 3)) : S.uploads).map((u) => `<li class="${u.status}"><span class="n">${esc(stem(u.name))}</span><span class="s">${u.msg ? esc(u.msg) : label[u.status]}${u.status === 'up' || u.status === 'index' ? ' ' + Math.round(u.p * 100) + '%' : ''}</span>${u.status === 'error' ? `<button class="btn small" data-retry="${u.key}">다시</button>` : ''}<i class="upbar"><b style="width:${u.status === 'done' || u.status === 'dup' ? 100 : Math.round((u.status === 'up' ? u.p * 0.9 : u.status === 'index' ? 0.9 + u.p * 0.1 : 0) * 100)}%"></b></i></li>`).join('')}</ul>`;
  clearTimeout(S.upT);
  if (!active && S.uploads.every((u) => u.status === 'done')) S.upT = setTimeout(() => { if (S.uploads.every((u) => u.status === 'done')) { S.uploads = []; renderUploads(); } }, 5000);
  box.onclick = (e) => {
    if (e.target.closest('[data-x]')) { S.uploads = []; renderUploads(); return; }
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

async function openFile(id, at = {}) {
  const f = fileById(id); if (!f) return;
  if (S.reader) closeReader(true, at.noRemember);
  const tab = addTab(id);
  if (at.tab && tab.page != null) at = { ...at, page: tab.page, y: tab.y, zoom: tab.zoom, resume: true };
  if (at.replace) history.replaceState({ r: id }, '', '#r=' + id); else history.pushState({ r: id }, '', '#r=' + id);
  const host = el('div', 'reader-host');
  document.body.appendChild(host);
  host.innerHTML = `<div class="loading"><div class="spin"></div><p>여는 중…</p><div class="lbar"><i></i></div></div>`;
  S.readerId = id;
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
    if (S.readerId !== id) { doc.destroy(); return; }
    const [marks, index] = await Promise.all([loadMarks(id), store.get('texts', id).catch(() => null)]);
    const s = S.state.files[id];
    host.innerHTML = '';
    const ocr = f.ocr ? await ocrData(f) : null;
    S.reader = new Reader(host, {
      doc, title: stem(f.name), analyze: A, marks, index, ocr: ocr && ocr.pages,
      at: at.page != null ? { page: at.page, y: at.y || 0, query: at.query, mark: at.mark } : (s ? { page: s.page, y: s.y } : {}),
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
      onShare: (btn) => shareMenu(f, btn),
      stars: f.stars || 0,
      onRate: (v) => rate(id, v),
      onClearAll: () => clearAllMarks(fileById(id) || f),
      confirm: (t, x, ok) => confirmBox(t, x, ok, true),
      decision: (no, onRow) => cases.decision(no, onRow),
      article: (r) => laws.lawText(r.law).then((law) => ({ law, a: laws.findArt(law, r.art, r.sub) })),
      courtCase: (no) => laws.courtCase(no),
      reviewed: (law, art, para) => cases.byLaw(law, art, para),
      toast,
    });
    S.reader.docRef = doc;
    await S.reader.start();
    keepAwake();
    if (at.page == null && !at.resume && !at.tab && s && s.page > 0) S.reader.askResume(S.reader.label(s.page) + S.reader.unit());
    if (!index && f.text) textOf(f).then((t) => { if (S.reader && S.readerId === id) S.reader.setIndex(t); }).catch(() => {});
  } catch (e) {
    host.remove(); S.readerId = null;
    if (location.hash.startsWith('#r=')) history.replaceState(null, '', location.pathname);
    toast(e.code === 'offline' ? '이 파일은 아직 이 기기에 없습니다. 인터넷에 연결되면 열 수 있습니다.' : e.name === 'PasswordException' ? '암호가 걸린 PDF입니다' : '파일을 열지 못했습니다');
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

function closeReader(silent, noRemember) {
  if (!S.reader && !S.readerId) return;
  if (S.reader && !noRemember) rememberTab();
  if (S.reader) { const pos = S.reader.current(); savePosition(S.readerId, pos, S.reader.N, true); const d = S.reader.docRef; S.reader.destroy(); if (d) d.destroy(); }
  S.reader = null; S.readerId = null; letSleep();
  document.querySelectorAll('.reader-host').forEach((h) => h.remove());
  if (!silent) render();
}
function onPop() { if (S.readerId && !/#r=/.test(location.hash)) closeReader(); }

async function shareMenu(f, btn) {
  const r = btn.getBoundingClientRect();
  const k = await menu(r, [['dl', '밑줄 넣어 내려받기'], ['print', '인쇄'], ['orig', '원본 내려받기']]);
  if (k === 'dl') exportPdf(f, { marks: true, mode: 'download' });
  else if (k === 'print') exportPdf(f, { marks: true, mode: 'print' });
  else if (k === 'orig') exportPdf(f, { marks: false, mode: 'download' });
}

async function exportPdf(f, { marks, mode }) {
  const isTouch = matchMedia('(pointer: coarse)').matches;
  const win = !isTouch && mode === 'print' ? window.open('', '_blank') : null;   // opened during the tap, so it is not blocked
  toast('PDF를 만드는 중…', 60000);
  try {
    const blob = await getBytes(f);
    let out = new Uint8Array(await blob.arrayBuffer());
    let note = '';
    if (marks) {
      const list = (await loadMarks(f.id)).filter((m) => !m.del);
      if (list.length) {
        try { const { buildAnnotatedPdf } = await import('./annot.js'); out = await buildAnnotatedPdf(out, list); }
        catch (e) {
          // a locked file cannot take annotations: draw its pages with the marks into a new PDF instead
          try {
            out = await pdfkit.flattenWithMarks(out, list, (p) => toast(`잠긴 PDF라 쪽을 그림으로 만드는 중… ${Math.round(p * 100)}%`, 60000));
            note = '잠긴 PDF라 쪽을 그림으로 바꿔 밑줄과 함께 만들었습니다';
          } catch (e2) { note = '밑줄을 넣지 못해 원본으로 드립니다'; }
        }
      }
    }
    const name = f.name.endsWith('.pdf') ? f.name : f.name + '.pdf';
    const file = new File([out], name, { type: 'application/pdf' });
    if (win) { win.location = URL.createObjectURL(file); if (note) toast(note, 5000); else hideToast(); return; }
    if (isTouch && navigator.canShare && navigator.canShare({ files: [file] })) {
      if (note) toast(note, 5000); else hideToast();
      try { await navigator.share({ files: [file], title: stem(name) }); } catch (e) { /* closed */ }
      return;
    }
    const url = URL.createObjectURL(file);
    if (mode === 'print') { window.open(url, '_blank'); if (note) toast(note, 5000); else hideToast(); return; }
    const a = el('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast(note || '내려받았습니다', note ? 5000 : 2600);
  } catch (e) {
    if (win) win.close();
    toast(api.isOffline(e) ? '이 파일은 아직 이 기기에 없습니다. 인터넷에 연결되면 할 수 있습니다.' : '만들지 못했습니다');
  }
}

/* ---------- marks: this device first, then the server ---------- */
function mergeMarks(a, b) {
  const m = new Map(); for (const x of a) m.set(x.id, x);
  for (const x of b) { const o = m.get(x.id); if (!o || x.t >= o.t) m.set(x.id, x); }
  return [...m.values()];
}
async function loadMarks(id) {
  const local = (await store.get('marks', id)) || { marks: [], pending: false };
  if (!navigator.onLine) return local.marks;
  try {
    const remote = await api.getMarks(id);
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
// An author line the text layer does not carry (drawn, not written: 임 지 봉 under the title, yet no text there): that strip of
// page 1 is read like a scan, and the name read again with it. Only when the title is read but no author, and not on a phone.
async function nameFromBand(doc, p1, p2, first, fileName) {
  if (!first || first.name || !first.title || isPhone()) return first;
  const band = naming.authorBand(p1); if (!band) return first;
  let mod = null, pg = null;
  try {
    mod = await import('./ocr.js');
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
function ocrQueue(only) {
  if (ocrRun) return ocrRun;
  ocrRun = (async () => {
    let mod = null;
    try {
      for (;;) {
        const f = only ? fileById(only) : liveFiles().find(needsOcr);
        if (!needsOcr(f) || !syncOn || !navigator.onLine) break;
        mod = mod || await import('./ocr.js');
        try { await ocrFile(f, mod); }
        catch (e) { if (only) toast(api.isOffline(e) ? '인터넷에 연결되면 할 수 있습니다' : '글자를 읽지 못했습니다'); break; }
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
async function ocrFile(f, mod) {
  const doc = await pdfkit.openBytes(await (await getBytes(f)).arrayBuffer());
  try {
    const t = (await textOf(f).catch(() => null)) || await pdfkit.textIndex(doc, A);
    const todo = await pdfkit.picturePages(doc, t.pages);
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
    const first = (() => { try { return naming.withFileName(naming.readFirstPages(pages[0], pages[1] || null), f.orig || f.name); } catch (e) { return null; } })();
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
    if (S.reader) renderUsage(); else render();
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
   so every device learns it with the texts (no extra request). S.info: id -> { journal, society, issue, date } or null ---------- */
let infoT = null;
function notePaper(id, t) {
  if (!t || t.paper === undefined) return;
  const v = t.paper || null;
  if (JSON.stringify(S.info[id] ?? null) === JSON.stringify(v) && id in S.info) return;
  S.info[id] = v;
  clearTimeout(infoT); infoT = setTimeout(() => { store.put('kv', 'paperInfo', S.info); if (!S.reader) render(); }, 500);
}
const paperOf = (r) => (r && (r.journal || r.date) ? { journal: r.journal, society: r.society, issue: r.issue, date: r.date } : null);
const pubText = (d) => (d ? d.replace(/^(\d{4})-(\d{2})(?:-\d{2})?$/, (m, y, mo) => `${y}. ${+mo}.`).replace(/^(\d{4})$/, '$1.') : '');   // 2018-03 → 2018. 3.; a year alone → 2018.
function paperLine(f) {   // 학술지 · 학회 · 발간일, as a citation lists them (a narrow screen leaves the society out, so the date stays in view)
  const i = S.info[f.id];
  if (!i || !(i.journal || i.date)) return '';
  const jn = String(i.journal || '').replace(/[\s┃│|ㅣ]+$/, '');   // a stray rule character read with it
  let s = jn ? esc(jn) : '';
  if (i.society) s += s ? `<span class="soc"> · ${esc(i.society)}</span>` : esc(i.society);
  if (i.date) s += (s ? ' · ' : '') + esc(pubText(i.date));
  return s;
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
    for (const f of liveFiles().filter((x) => x.text && !askedInfo.has(x.id) && (!(x.id in S.info) || askAgain(x.id)))) {
      if (!navigator.onLine || document.hidden) break;
      if (needsOcr(f) || OCR.id === f.id) continue;   // a scan still to be read: its reading fills this in (and writes its texts)
      let t = await store.get('texts', f.id).catch(() => null);
      if (t && t.paper !== undefined && !(f.id in S.info)) { notePaper(f.id, t); if (t.paper) continue; }
      askedInfo.add(f.id); infoAsked[f.id] = Date.now(); store.put('kv', 'paperInfoAsked', infoAsked);   // the server's page texts
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
            ocrSoon(1500); if (!S.reader) render();
            continue;
          }
        }
        const o = f.ocr ? await ocrData(f) : null;   // a read scan: its first pages are the words read, not the (empty) text layer
        const items = async (i) => {
          if (i >= doc.numPages) return null;
          if (o && o.pages && o.pages[i]) { const pg = await doc.getPage(i + 1); const vp = pg.getViewport({ scale: 1 }); pg.cleanup(); return ocrPageItems(i, o.pages[i], vp.width, vp.height); }
          return (await pdfkit.pageItems(doc, i)).page;
        };
        const paper = paperOf(naming.readFirstPages(await items(0), await items(1)));
        if (paper || t.paper === undefined) {   // written only when it says something new
          t.paper = paper;
          await store.put('texts', f.id, t);
          await api.putMeta(f.id, 'text', await pdfkit.gzipJSON(t), 'application/gzip');
        }
        notePaper(f.id, { paper });
      } catch (e) { /* next time */ } finally { if (doc) doc.destroy(); }
    }
  } finally { filling = false; }
  libraryInfo();
}

/* ---------- what the first page did not say: 국립중앙도서관's record of the paper, found by its title (and author) ----------
   Only what is missing is filled — a date (or a whole date where only the year was read) and the society that published it;
   what the page itself said is never changed. The answer is written into the paper's texts like the rest, so every device
   has it. A paper the library does not know is asked about again after a month. */
let libAsked = null;
const libNorm = (s) => naming.hangulize(String(s || '')).replace(/<[^>]+>/g, '').replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase();
function libSociety(x) {
  let t = naming.hangulize(String((x && x.pubInfo) || '').replace(/<[^>]+>/g, '')).replace(/\d{6,8}/g, ' ').replace(/(^|\D)(?:19|20)\d{2}(?!\d)/g, '$1 ');
  const at = t.indexOf(':');
  if (at >= 0) {   // "place : publisher": a short place name before the colon goes
    const before = t.slice(0, at).trim(), after = t.slice(at + 1).trim();
    t = !before || (/^[가-힣]{2,3}(?:시|군|도)?$/.test(before) && !/학회|대학|연구|원|사$|회$/.test(before)) ? after : before + ' ' + after;
  }
  t = t.replace(/^(?:서울|파주|고양|성남|과천|세종|대전|부산|대구|광주|인천|울산|수원|춘천|청주|전주|제주)\s+(?=\S)/, '').replace(/\s+(?:서울|파주|고양|성남|과천|세종|대전|부산|대구|광주|인천|울산|수원|춘천|청주|전주|제주)$/, '').replace(/[\s,:;]+/g, ' ').trim();
  if (/^(?:법학)?연구(?:소|원)$|^법학연구$/.test(t)) return '';   // "법학연구소" alone: whose is not said
  return /[가-힣A-Za-z]{2,}/.test(t) ? t : '';
}
function libNeeds(i) { return !i || !i.date || /^\d{4}$/.test(i.date) || !(i.journal || i.society); }
async function libraryInfo() {
  if (!syncOn || !navigator.onLine) return;
  if (!libAsked) libAsked = (await store.get('kv', 'libAsked').catch(() => null)) || {};
  for (const f of liveFiles()) {
    if (!navigator.onLine || document.hidden) break;
    if (!(f.id in S.info) || !libNeeds(S.info[f.id]) || Date.now() - (libAsked[f.id] || 0) < 30 * 864e5) continue;
    const name = stem(f.name), cut = name.indexOf('_');
    const author = cut > 0 ? name.slice(0, cut).replace(/\s*외$/, '') : '', title = (cut > 0 ? name.slice(cut + 1) : name).trim();
    if (libNorm(title).length < 6) continue;
    libAsked[f.id] = Date.now(); store.put('kv', 'libAsked', libAsked).catch(() => {});
    let d;
    try { d = await api.nlib('search', { apiType: 'json', srchTarget: 'title', kwd: title.slice(0, 60), pageNum: '1', pageSize: '10' }); } catch (e) { if (api.isOffline(e)) break; continue; }
    const want = libNorm(title), who = libNorm(author);
    const hits = ((d && d.result) || []).filter((x) => /기사|논문/.test(x.typeName || '') && (libNorm(x.titleInfo).startsWith(want.slice(0, 14)) || want.startsWith(libNorm(x.titleInfo).slice(0, 14))) && (!who || libNorm(x.authorInfo).includes(who)));
    if (!hits.length) continue;
    const ymd = (x) => String(x.pubYearInfo || '').replace(/\D/g, '');
    const best = hits.slice().sort((a, b) => ymd(b).length - ymd(a).length)[0];
    const digits = ymd(best);
    const date = digits.length >= 6 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}` : digits.length === 4 ? digits : '';
    // the society: the print record says it plainly (한양대학교 법학연구소); the online one adds a place and a date (서울 : 韓國公法學會, 20220228)
    const society = libSociety(hits.find((x) => /오프라인/.test(x.menuName || '')) || hits[0]) || hits.map(libSociety).filter(Boolean)[0] || '';
    const cur = S.info[f.id] || {};
    const merged = { journal: String(cur.journal || '').replace(/[\s┃│|ㅣ]+$/, ''), society: cur.society || society, issue: cur.issue || '', date: cur.date && !(/^\d{4}$/.test(cur.date) && date.startsWith(cur.date) && date.length > 4) ? cur.date : (date || cur.date || '') };
    if (JSON.stringify(paperOf(merged)) === JSON.stringify(paperOf(cur))) continue;
    try {
      const t = (await store.get('texts', f.id).catch(() => null)) || await pdfkit.gunzipJSON(await api.getMeta(f.id, 'text'));
      t.paper = paperOf(merged);
      await store.put('texts', f.id, t);
      await api.putMeta(f.id, 'text', await pdfkit.gzipJSON(t), 'application/gzip');
      notePaper(f.id, t);
    } catch (e) { /* next time */ }
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
function pageLabel(id, p, found) {   // printed page number when known (○면), else the PDF page (○쪽)
  const o = (S.state.files[id] || {}).o;
  const off = Number.isInteger(o) ? o : found;
  return Number.isInteger(off) ? (p + 1 + off) + '면' : (p + 1) + '쪽';
}
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
      const t = m.text; let flat = ''; const map = [];
      for (let i = 0; i < t.length; i++) if (!/\s/.test(t[i])) { flat += t[i].toLowerCase(); map.push(i); }
      const i = flat.indexOf(key); if (i < 0) continue;
      const a = map[i], b = map[i + key.length - 1] + 1;
      snips.push({ m, pre: a > 40, a: t.slice(Math.max(0, a - 40), a), w: t.slice(a, b), b: t.slice(b, b + 70), post: b + 70 < t.length });
    }
    if (snips.length) out.push({ f, snips });
  }
  return out.sort((x, y) => y.snips.length - x.snips.length || x.f.name.localeCompare(y.f.name, 'ko'));
}

/* ---------- 예전 밑줄 되살리기: the server keeps how a paper's marks were before each day's first change (60 days) ---------- */
const when = (t) => new Date(t).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
async function marksBack(f) {
  if (!navigator.onLine) { toast('인터넷에 연결되면 할 수 있습니다'); return; }
  let list;
  try { await pushMarks(f.id); list = await api.marksHistory(f.id); }
  catch (e) { toast(api.isOffline(e) ? '인터넷에 연결되면 할 수 있습니다' : '불러오지 못했습니다'); return; }
  if (!list.length) { toast('되살릴 예전 밑줄이 없습니다. 밑줄을 바꾸면, 그날 처음 바꾸기 전 상태가 60일 동안 남습니다.', 6000); return; }
  const box = sheet(`<h2>예전 밑줄 되살리기</h2><p class="sheet-p small">「${esc(stem(f.name))}」의 밑줄을 고른 때의 상태로 되돌립니다. 지금 밑줄도 남겨 두므로 다시 되돌릴 수 있습니다.</p>
    <ul class="hist">${list.map((h) => `<li><button class="hist-b" data-ts="${h.ts}"><b>${esc(when(h.updated || h.ts))}</b><span>밑줄 ${h.n}개</span></button></li>`).join('')}</ul>`);
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
    toast(`밑줄 ${n}개로 되살렸습니다`, 9000, undo);
  } catch (e) { toast(api.isOffline(e) ? '인터넷에 연결되면 할 수 있습니다' : '되살리지 못했습니다'); }
}

/* ---------- all marks in one file, for keeping a copy yourself (readable, with the data inside) ---------- */
async function exportAllMarks() {
  toast('모으는 중…', 30000);
  await fetchAllMarks(true);
  const all = await allMarks();
  const files = liveFiles().filter((f) => all.has(f.id)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  if (!files.length) { toast('아직 밑줄이 없습니다'); return; }
  const day = new Date().toLocaleDateString('sv-SE');
  const n = files.reduce((s, f) => s + all.get(f.id).length, 0);
  const offs = await printedOffsets(files.map((f) => f.id));
  const full = {};
  for (const [id, r] of await store.entries('marks').catch(() => [])) if (r && r.marks && r.marks.length) full[id] = r.marks;
  const data = JSON.stringify({ app: '연구실 책장', at: Date.now(), index: S.index, state: S.state, marks: full }).replace(/</g, '\\u003c');
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>연구실 책장 밑줄 ${day}</title>
<style>body{margin:0 auto;max-width:760px;padding:28px 18px 60px;font:16px/1.7 -apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#1b2433;background:#fff}h1{font-size:22px;margin:0}p.s{color:#5a6578;margin:4px 0 26px}h2{font-size:17px;margin:30px 0 8px;padding-top:14px;border-top:1px solid #e3e7ee}p.j{margin:-6px 0 8px;color:#5a6578;font-size:14px}ol{list-style:none;margin:0;padding:0}li{display:flex;gap:12px;padding:7px 0}.pg{flex:none;width:52px;color:#7b8597;font-size:13px;padding-top:3px}.t{background:linear-gradient(transparent 55%,color-mix(in srgb,var(--c) 55%,transparent) 55%)}.t[data-k=ul]{background:none;text-decoration:underline;text-decoration-color:var(--c);text-decoration-thickness:2px;text-underline-offset:4px}@media print{h2{break-after:avoid}li{break-inside:avoid}}</style></head><body>
<h1>연구실 책장 밑줄</h1><p class="s">${day} · 논문 ${files.length}편 · 밑줄 ${n}개</p>
${files.map((f) => `<h2>${esc(stem(f.name))}</h2>${paperLine(f) ? `<p class="j">${paperLine(f)}</p>` : ''}<ol>${all.get(f.id).map((m) => `<li><span class="pg">${pageLabel(f.id, m.p, offs.get(f.id))}</span><span class="t" data-k="${m.kind}" style="--c:${esc(m.color)}">${esc(m.text)}</span></li>`).join('')}</ol>`).join('\n')}
<script type="application/json" id="shelf-backup">${data}</script></body></html>`;
  const file = new File([html], `연구실 책장 밑줄 ${day}.html`, { type: 'text/html' });
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

/* ---------- 이어 읽기에서 빼기: the paper counts as finished for now; reading on in it brings it back ---------- */
function unresume(id) {
  const s = S.state.files[id]; if (!s) return;
  const before = { ...s };
  const put = (v) => { S.state.files[id] = { ...v, at: (S.state.files[id].at || 0) + 1 }; stateDirty.add(id); store.put('kv', 'state', S.state); pushState(); render(); };
  put({ ...s, done: true });
  toast('이어 읽기에서 뺐습니다', 6000, { label: '되돌리기', fn: () => put(before) });
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
  for (const f of liveFiles().filter((x) => x.text)) {   // page texts are small: always kept, for search
    if (!navigator.onLine || document.hidden) return;
    const have = await store.get('texts', f.id).catch(() => null);
    if (have && (!f.ocr || have.ocr === f.ocr)) continue;
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
    if (f.size > budget) continue;
    try { await getBytes(f); budget -= f.size; renderUsage(); if (!S.reader) render(); } catch (e) { break; }
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
    <section><h3>공유로 넣기 <small>아이패드·아이폰</small></h3><p class="sheet-p small">Safari나 파일 앱의 공유 버튼에서 바로 책장에 넣습니다. 키를 한 번 만들어 단축어에 넣어 두면 됩니다.</p><button class="btn share-key">공유 키 만들기</button></section>
    <section><h3>백업</h3><p class="sheet-p small">밑줄과 폴더 정리는 날마다, 처음 바뀌기 전 상태가 서버에 60일 동안 남습니다. 밑줄을 잘못 지웠다면 그 논문의 ⋯ 메뉴에서 <b>예전 밑줄 되살리기</b>를 고르세요.</p><button class="btn export-marks">모든 밑줄을 파일로 받기</button></section>
    <section><h3>로그인된 기기</h3><ul class="devs"><li class="none">불러오는 중…</li></ul></section>
    <section class="foot"><button class="btn danger ghost signout">이 기기에서 로그아웃</button><p class="ver">연구실 책장 ${esc(VERSION)}</p></section>`);
  $('.share-key', box).onclick = () => shareKeySheet();
  $('.export-marks', box).onclick = () => { closeSheet(); exportAllMarks(); };
  $('.an', box).onchange = (e) => { S.prefs.autoName = e.target.checked; store.put('kv', 'prefs', S.prefs); };
  $('.keep', box).onchange = (e) => { if (e.target.name !== 'keep') return; S.prefs.keep = e.target.value; store.put('kv', 'prefs', S.prefs); prefetch(); };
  $('.clear-local', box).onclick = async () => {
    if (!(await confirmBox('받아 둔 파일 비우기', '이 기기에 받아 둔 사본만 지웁니다. 책장 서버의 파일과 밑줄은 그대로입니다.', '비우기'))) return;
    await store.clear('files'); S.cached = new Set(); render(); closeSheet(); toast('비웠습니다');
  };
  $('.signout', box).onclick = async () => {
    if (!(await confirmBox('로그아웃', '이 기기에서 로그아웃합니다. 받아 둔 파일과 밑줄 사본도 이 기기에서 지웁니다.', '로그아웃', true))) return;
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
  } catch (e) { $('.devs', box).innerHTML = '<li class="none">인터넷에 연결되면 볼 수 있습니다</li>'; }
}

/* ================= small UI parts ================= */
let toastT = null;
function toast(msg, ms = 2600, action) {
  const t = $('.toast') || (() => { const x = el('div', 'toast'); document.body.appendChild(x); return x; })();
  t.textContent = msg; t.hidden = false; t.classList.add('in');
  t.classList.toggle('has-act', !!action);
  t.classList.toggle('over-tools', !!document.querySelector('.reader-host'));
  if (action) { const b = el('button', 'toast-act'); b.type = 'button'; b.textContent = action.label; b.onclick = () => { hideToast(); action.fn(); }; t.appendChild(b); }
  clearTimeout(toastT); toastT = setTimeout(hideToast, ms);
}
function hideToast() { const t = $('.toast'); if (t) { t.classList.remove('in'); t.hidden = true; } }

function sheet(html) {
  closeSheet();
  const w = el('div', 'sheet-wrap', `<div class="sheet" role="dialog" aria-modal="true"><button class="ib sheet-x" aria-label="닫기">${I.close}</button>${html}</div>`);
  document.body.appendChild(w);
  requestAnimationFrame(() => w.classList.add('in'));
  w.addEventListener('click', (e) => { if (e.target === w || e.target.closest('.sheet-x')) closeSheet(); });
  return $('.sheet', w);
}
function closeSheet() { document.querySelectorAll('.sheet-wrap').forEach((w) => w.remove()); }

function promptBox(title, label, value, ok, orig) {
  return new Promise((resolve) => {
    const box = sheet(`<h2>${esc(title)}</h2><label class="field"><span>${esc(label)}</span><input type="text" value="${esc(value)}" maxlength="200"></label>${orig ? `<p class="orig-name">처음 이름 · <span>${esc(orig)}</span> <button class="link restore" type="button">되돌리기</button></p>` : ''}<div class="row-btns"><button class="btn ghost cancel">취소</button><button class="btn primary ok">${esc(ok)}</button></div>`);
    const inp = $('input', box);
    if (orig) $('.restore', box).onclick = () => { inp.value = orig; inp.focus(); };
    setTimeout(() => { inp.focus(); inp.select(); }, 60);
    const done = (v) => { closeSheet(); resolve(v); };
    $('.ok', box).onclick = () => { const v = inp.value.trim(); if (v) done(v); else inp.focus(); };
    $('.cancel', box).onclick = () => done(null);
    inp.onkeydown = (e) => { if (e.key === 'Enter') $('.ok', box).click(); if (e.key === 'Escape') done(null); };
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
  catch (e) { toast(api.isOffline(e) ? '인터넷에 연결되면 만들 수 있습니다' : '만들지 못했습니다'); return; }
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
    const box = sheet(`<h2>${esc(title)}</h2><div class="pick"><button data-to="" style="--d:0">${I.home}<span>내 책장 (맨 위)</span></button>${walk(null, 1)}</div><div class="row-btns"><button class="btn ghost newf">${I.newfolder}<span>새 폴더</span></button><span class="sp"></span><button class="btn ghost cancel">취소</button></div>`);
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
  const b = (g, on, label) => `<button data-k="g:${g}" class="${on ? 'on' : ''}" aria-label="${label}">${gradeSVG(g > 0 ? 1 : g)}</button>`;
  return `<div class="menu-marks" role="group" aria-label="표시">${b(1, v >= 1, '별 1개')}${b(2, v >= 2, '별 2개')}${b(3, v >= 3, '별 3개')}<span class="sep"></span>${b(-2, v === -2, '세모')}${b(-1, v === -1, '엑스')}</div><hr>`;
}
function menu(rect, items, current) {
  return new Promise((resolve) => {
    document.querySelectorAll('.menu-wrap').forEach((m) => m.remove());
    const w = el('div', 'menu-wrap', `<div class="menu" role="menu">${items.map(([k, label, cls]) => k === '-' ? '<hr>' : k === 'marks' ? marksRow(label) : `<button data-k="${k}" class="${cls || ''} ${k === current ? 'on' : ''}" role="menuitem">${esc(label)}</button>`).join('')}</div>`);
    document.body.appendChild(w);
    const m = $('.menu', w), W = innerWidth, H = innerHeight;
    const mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(W - mw - 8, rect.right - mw)) + 'px';
    m.style.top = (rect.bottom + mh + 8 < H ? rect.bottom + 6 : Math.max(8, rect.top - mh - 6)) + 'px';
    const done = (v) => { w.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    document.addEventListener('keydown', onKey, true);
    w.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); done(b ? b.dataset.k : null); });
  });
}

/* ================= formats ================= */
function size(b) { if (!b) return '0MB'; if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + 'KB'; if (b < 1024 ** 3) return (b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0) + 'MB'; return (b / 1024 ** 3).toFixed(1) + 'GB'; }
function date(t) { if (!t) return ''; const d = new Date(t), n = new Date(); return d.getFullYear() === n.getFullYear() ? `${d.getMonth() + 1}월 ${d.getDate()}일` : `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`; }
function keepLeft(t) { const d = Math.ceil((t + 7 * 86400e3 - Date.now()) / 86400e3); return d > 1 ? `${d}일 뒤 완전히 지워짐` : '곧 완전히 지워짐'; }   // the server keeps the trash for 7 days
function pageOf(s, pages) { const o = Number.isInteger(s.o) ? s.o : null; return o == null ? `${s.page + 1} / ${pages}쪽` : `${s.page + 1 + o} / ${pages + o}면`; }   // same numbers as the reader
function ago(t) { if (!t) return ''; const s = (Date.now() - t) / 1000; if (s < 90) return '방금'; if (s < 3600) return Math.round(s / 60) + '분 전'; if (s < 86400) return Math.round(s / 3600) + '시간 전'; if (s < 86400 * 7) return Math.round(s / 86400) + '일 전'; return date(t); }
function stem(n) { return String(n || '').replace(/\.pdf$/i, ''); }
function rid(n) { const a = 'abcdefghijklmnopqrstuvwxyz0123456789'; const b = crypto.getRandomValues(new Uint8Array(n)); return [...b].map((x) => a[x % 36]).join(''); }

boot().catch((e) => { console.error(e); document.body.innerHTML = '<div class="gate"><div class="gate-card"><h1 class="brand-big">연구실 책장</h1><p class="gate-s">문제가 생겼습니다. 다시 열어 주세요.</p></div></div>'; });
