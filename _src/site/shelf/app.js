// 연구실 책장 — a private PDF library and reader for one owner, on every device.
// The library lives on the owner's server (Cloudflare R2 behind a small Worker); this device keeps copies of what was
// opened, so files open at once and without a connection. Marks and reading positions are saved here first and sent on.
import * as api from './api.js';
import * as store from './store.js';
import * as pdfkit from './pdfkit.js';
import * as A from './analyze.js';
import { Reader } from './reader.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const VERSION = (document.documentElement.dataset.v || 'dev');

const S = {
  index: { folders: [], files: [] },
  state: { files: {} },
  view: { kind: 'home', folder: null },
  sort: 'added', q: '', select: null, prefs: {},
  uploads: [], reader: null, readerId: null,
  cached: new Set(),
};

const I = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
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
  renderShell();
  render();
  await refresh(true);
  syncMarksAll();
  pushState();
  window.addEventListener('online', () => { refresh(); syncMarksAll(); pushState(); renderOffline(); });
  window.addEventListener('offline', renderOffline);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    refresh(); syncMarksAll();
    const id = S.readerId;
    if (id && S.reader) loadMarks(id).then((m) => { if (S.reader && S.readerId === id) S.reader.setRemoteMarks(m); }).catch(() => {});
  });
  setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  window.addEventListener('popstate', onPop);
  const m = /#r=([0-9a-f]{24})/.exec(location.hash);
  if (m && fileById(m[1])) openFile(m[1], { replace: true });
}

async function refresh(first) {
  try {
    const [idx, st] = await Promise.all([api.library(), api.getState()]);
    S.index = idx; await store.put('kv', 'index', idx);
    mergeState(st); await store.put('kv', 'state', S.state);
    if (S.reader) { renderUsage(); } else render();
    setTimeout(prefetch, 1500);
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
        <button data-view="recent">${I.clock}<span>최근 읽은 것</span></button>
        <button data-view="trash">${I.trash}<span>휴지통</span></button>
      </nav>
      <div class="tree-h">폴더</div>
      <div class="tree"></div>
      <div class="rail-foot">
        <div class="usage"><div class="usage-t"></div><div class="usage-bar"><i></i></div></div>
        <button class="settings-btn">${I.gear}<span>설정</span></button>
      </div>
    </aside>
    <div class="scrim"></div>
    <main class="main">
      <header class="bar">
        <button class="ib menu-btn" aria-label="메뉴">${I.menu}</button>
        <nav class="crumbs"></nav>
        <label class="find">${I.search}<input type="search" placeholder="제목과 본문에서 찾기" enterkeyhint="search" autocomplete="off"></label>
      </header>
      <div class="tools"></div>
      <div class="offline" hidden>인터넷에 연결되어 있지 않습니다 · 이 기기에 받아 둔 파일만 열 수 있습니다</div>
      <section class="content"></section>
    </main>
    <div class="uploads" hidden></div>
    <div class="toast" hidden></div>
    <input type="file" class="file-in" accept="application/pdf,.pdf" multiple hidden>
  </div>`;
  const app = $('.app');
  $('.up-btn').onclick = () => $('.file-in').click();
  $('.file-in').onchange = (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) upload(fs); closeRail(); };
  $('.views').onclick = (e) => { const b = e.target.closest('[data-view]'); if (!b) return; S.view = { kind: b.dataset.view, folder: null }; S.q = ''; $('.find input').value = ''; S.select = null; render(); closeRail(); };
  $('.tree').onclick = (e) => { const b = e.target.closest('[data-folder]'); if (!b) return; S.view = { kind: 'home', folder: b.dataset.folder }; S.q = ''; $('.find input').value = ''; S.select = null; render(); closeRail(); };
  $('.settings-btn').onclick = () => { closeRail(); settings(); };
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
  main.addEventListener('drop', (e) => { e.preventDefault(); main.classList.remove('drop'); const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) upload(fs); });
  let lp = null;   // long press on a row starts selecting
  $('.content').addEventListener('pointerdown', (e) => { const row = e.target.closest('.row[data-file], .row[data-fid]'); if (!row || e.pointerType === 'mouse') return; lp = setTimeout(() => { lp = null; startSelect(row.dataset.file ? { file: row.dataset.file } : { folder: row.dataset.fid }); }, 550); });
  for (const t of ['pointerup', 'pointercancel', 'pointermove']) $('.content').addEventListener(t, (e) => { if (lp && (t !== 'pointermove' || Math.abs(e.movementY) > 3)) { clearTimeout(lp); lp = null; } });
  $('.content').addEventListener('contextmenu', (e) => { const row = e.target.closest('.row[data-file], .row[data-fid]'); if (!row) return; e.preventDefault(); row.dataset.file ? fileMenu(row.dataset.file, e.clientX, e.clientY) : folderMenu(row.dataset.fid, e.clientX, e.clientY); });
}
function closeRail() { const a = $('.app'); if (a) a.classList.remove('rail-open'); }

function renderOffline() { const o = $('.offline'); if (o) o.hidden = navigator.onLine; }

function render() {
  if (!$('.app')) return;
  for (const b of document.querySelectorAll('.views [data-view]')) b.classList.toggle('on', !S.q && b.dataset.view === S.view.kind && !(S.view.kind === 'home' && S.view.folder));
  renderTree(); renderUsage(); renderCrumbs(); renderTools();
  const c = $('.content');
  if (S.q) { renderSearch(c); return; }
  if (S.view.kind === 'recent') renderRecent(c);
  else if (S.view.kind === 'trash') renderTrash(c);
  else renderFolder(c, S.view.folder);
  lazyThumbs();
}

function renderTree() {
  const box = $('.tree');
  const walk = (parent, depth) => childFolders(parent).map((f) => `<button data-folder="${f.id}" class="${S.view.kind === 'home' && S.view.folder === f.id && !S.q ? 'on' : ''}" style="--d:${depth}">${I.folder}<span>${esc(f.name)}</span></button>` + (depth < 3 ? walk(f.id, depth + 1) : '')).join('');
  const html = walk(null, 0);
  box.innerHTML = html || '<p class="tree-empty">폴더가 없습니다</p>';
}

function renderUsage() {
  const used = S.index.files.reduce((s, f) => s + (f.size || 0), 0), free = 10 * 1024 ** 3;
  $('.usage-t').textContent = `${size(used)} 사용 · 무료 10GB`;
  $('.usage-bar i').style.width = Math.min(100, 100 * used / free) + '%';
}

function renderCrumbs() {
  const c = $('.crumbs');
  if (S.q) { c.innerHTML = `<b>찾기</b>`; return; }
  if (S.view.kind === 'recent') { c.innerHTML = '<b>최근 읽은 것</b>'; return; }
  if (S.view.kind === 'trash') { c.innerHTML = '<b>휴지통</b>'; return; }
  const path = folderPath(S.view.folder);
  c.innerHTML = [`<button data-folder="">내 책장</button>`, ...path.map((f, i) => i === path.length - 1 ? `<b>${esc(f.name)}</b>` : `<button data-folder="${f.id}">${esc(f.name)}</button>`)].join('<span class="sl">›</span>');
  if (!path.length) c.innerHTML = '<b>내 책장</b>';
}

function renderTools() {
  const t = $('.tools');
  if (S.select) {
    const n = S.select.files.size + S.select.folders.size;
    t.innerHTML = `<span class="sel-n">${n}개 선택</span><button class="btn" data-t="move" ${n ? '' : 'disabled'}>옮기기</button><button class="btn" data-t="trash" ${n ? '' : 'disabled'}>휴지통으로</button><button class="btn ghost" data-t="endsel">끝내기</button>`;
    return;
  }
  if (S.q) { t.innerHTML = ''; return; }
  if (S.view.kind === 'trash') {
    const any = S.index.files.some((f) => f.trashed) || S.index.folders.some((f) => f.trashed);
    t.innerHTML = `<span class="hint">휴지통의 파일은 30일 뒤 자동으로 지워집니다</span>${any ? '<button class="btn danger" data-t="empty">휴지통 비우기</button>' : ''}`;
    return;
  }
  if (S.view.kind === 'recent') { t.innerHTML = ''; return; }
  const label = { added: '최근 올린 순', name: '이름순', opened: '최근 읽은 순' }[S.sort];
  t.innerHTML = `<button class="btn" data-t="newfolder">${I.newfolder}<span>새 폴더</span></button><button class="btn" data-t="upload">${I.up}<span>올리기</span></button><span class="sp"></span><button class="btn ghost" data-t="select">${I.select}<span>선택</span></button><button class="btn ghost" data-t="sort">${I.sort}<span>${label}</span></button>`;
}

function sorted(files) {
  const opened = (f) => (S.state.files[f.id] && S.state.files[f.id].at) || 0;
  const by = { added: (a, b) => b.added - a.added, name: (a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }), opened: (a, b) => opened(b) - opened(a) || b.added - a.added }[S.sort];
  return files.slice().sort(by);
}

function renderFolder(c, folder) {
  const folders = childFolders(folder);
  const files = sorted(liveFiles().filter((f) => (f.folder ?? null) === (folder ?? null)));
  let html = '';
  if (!folder) {
    const resume = liveFiles().map((f) => ({ f, s: S.state.files[f.id] })).filter((x) => x.s && !x.s.done && x.f.pages && x.s.page < x.f.pages - 1).sort((a, b) => b.s.at - a.s.at).slice(0, 4);
    if (resume.length) html += `<h2 class="sec-h">이어 읽기</h2><div class="resume">${resume.map(({ f, s }) => `<button class="card" data-open="${f.id}"><span class="thumb" data-thumb="${f.thumb ? f.id : ''}"></span><span class="card-t">${esc(stem(f.name))}</span><span class="card-s">${pageOf(s, f.pages)} · ${ago(s.at)}</span><span class="pbar"><i style="width:${Math.round(100 * (s.page + 1) / f.pages)}%"></i></span></button>`).join('')}</div>`;
  }
  if (!folders.length && !files.length) {
    html += `<div class="empty-big">${I.pdf}<p>${folder ? '이 폴더는 비어 있습니다' : '아직 올린 PDF가 없습니다'}</p><p class="sub">PDF를 여기로 끌어다 놓거나 <button class="link" data-t="upload">올리기</button>를 누르세요.</p></div>`;
    c.innerHTML = html; return;
  }
  if (!folder && (folders.length || files.length)) html += `<h2 class="sec-h">${files.length ? '전체' : '폴더'}</h2>`;
  html += '<div class="list">' + folders.map(folderRow).join('') + files.map((f) => fileRow(f)).join('') + '</div>';
  c.innerHTML = html;
}

function folderRow(f) {
  const n = liveFiles().filter((x) => x.folder === f.id).length + childFolders(f.id).length;
  const sel = S.select && S.select.folders.has(f.id);
  return `<div class="row folder ${sel ? 'sel' : ''}" data-fid="${f.id}">${S.select ? `<span class="ck">${I.check}</span>` : ''}<span class="ficon">${I.folder}</span><span class="meta"><b>${esc(f.name)}</b><span class="sub">${n ? n + '개' : '비어 있음'}</span></span>${S.select ? '' : `<button class="ib more" data-fmenu="${f.id}" aria-label="폴더 메뉴">${I.more}</button>`}</div>`;
}

function fileRow(f, extra = '') {
  const s = S.state.files[f.id];
  const prog = s && f.pages ? Math.round(100 * (s.done ? 1 : (s.page + 1) / f.pages)) : 0;
  const sel = S.select && S.select.files.has(f.id);
  const where = (S.q || S.view.kind === 'recent') && f.folder ? ` · ${esc((folderById(f.folder) || {}).name || '')}` : '';
  return `<div class="row file ${sel ? 'sel' : ''}" data-file="${f.id}">${S.select ? `<span class="ck">${I.check}</span>` : ''}
    <span class="thumb" data-thumb="${f.thumb ? f.id : ''}"></span>
    <span class="meta"><b>${esc(stem(f.name))}</b><span class="sub">${f.pages ? f.pages + '쪽 · ' : ''}${size(f.size)} · ${date(f.added)}${where}</span>${extra}</span>
    ${prog ? `<span class="prog" title="읽은 곳">${prog}%</span>` : ''}
    <span class="here ${S.cached.has(f.id) ? 'on' : ''}" title="${S.cached.has(f.id) ? '이 기기에 받아 둠' : ''}">${S.cached.has(f.id) ? I.device : ''}</span>
    ${S.select ? '' : `<button class="ib more" data-menu="${f.id}" aria-label="파일 메뉴">${I.more}</button>`}</div>`;
}

function renderRecent(c) {
  const list = liveFiles().filter((f) => S.state.files[f.id]).sort((a, b) => S.state.files[b.id].at - S.state.files[a.id].at).slice(0, 60);
  c.innerHTML = list.length ? '<div class="list">' + list.map((f) => fileRow(f)).join('') + '</div>' : `<div class="empty-big">${I.clock}<p>아직 읽은 파일이 없습니다</p></div>`;
}

function renderTrash(c) {
  const fs = S.index.folders.filter((f) => f.trashed), files = S.index.files.filter((f) => f.trashed || folderTrashed(f.folder));
  const topFiles = files.filter((f) => f.trashed && !folderTrashed(f.folder));
  if (!fs.length && !topFiles.length) { c.innerHTML = `<div class="empty-big">${I.trash}<p>휴지통이 비어 있습니다</p></div>`; return; }
  c.innerHTML = '<div class="list">' +
    fs.map((f) => `<div class="row folder"><span class="ficon">${I.folder}</span><span class="meta"><b>${esc(f.name)}</b><span class="sub">${date(f.trashed)}에 버림</span></span><button class="btn small" data-restore-folder="${f.id}">되살리기</button><button class="btn small danger ghost" data-purge-folder="${f.id}">영구 삭제</button></div>`).join('') +
    topFiles.map((f) => `<div class="row file"><span class="thumb" data-thumb="${f.thumb ? f.id : ''}"></span><span class="meta"><b>${esc(stem(f.name))}</b><span class="sub">${size(f.size)} · ${date(f.trashed)}에 버림</span></span><button class="btn small" data-restore="${f.id}">되살리기</button><button class="btn small danger ghost" data-purge="${f.id}">영구 삭제</button></div>`).join('') + '</div>';
}

/* ---------- search: names at once, then the text of every page ---------- */
async function renderSearch(c) {
  const q = S.q, key = q.replace(/\s+/g, '').toLowerCase();
  const files = liveFiles();
  const nameHits = files.filter((f) => f.name.replace(/\s+/g, '').toLowerCase().includes(key));
  const folderHits = S.index.folders.filter((f) => !f.trashed && f.name.replace(/\s+/g, '').toLowerCase().includes(key));
  c.innerHTML = `<h2 class="sec-h">이름</h2>${nameHits.length || folderHits.length ? '<div class="list">' + folderHits.map(folderRow).join('') + nameHits.map((f) => fileRow(f)).join('') + '</div>' : '<p class="none">이름이 맞는 파일이 없습니다</p>'}
    <h2 class="sec-h">본문 <span class="sec-n"></span></h2><div class="list text-hits"></div>`;
  lazyThumbs();
  const box = $('.text-hits', c), n = $('.sec-n', c);
  if (key.length < 2) { box.innerHTML = '<p class="none">두 글자 이상 넣으면 본문에서도 찾습니다</p>'; return; }
  const withText = files.filter((f) => f.text);
  let done = 0, shown = 0;
  const results = [];
  const show = () => {
    if (S.q !== q) return;
    results.sort((a, b) => b.n - a.n);
    box.innerHTML = results.slice(0, 80).map((r) => fileRow(r.f, `<span class="snips">${r.snips.map((s) => `<button class="snip" data-open="${r.f.id}" data-page="${s.page}" data-q="${esc(q)}"><em>${r.o == null ? (s.page + 1) + '쪽' : (s.page + 1 + r.o) + '면'}</em>…${esc(s.a)}<mark>${esc(s.w)}</mark>${esc(s.b)}…</button>`).join('')}</span>`)).join('') || (done === withText.length ? '<p class="none">본문에서 찾지 못했습니다</p>' : '');
    n.textContent = done < withText.length ? `찾는 중 ${done}/${withText.length}` : (results.length ? `${results.length}개 파일` : '');
    shown = results.length;
    lazyThumbs();
  };
  show();
  const queue = withText.slice();
  const worker = async () => {
    while (queue.length && S.q === q) {
      const f = queue.shift();
      const t = await textOf(f).catch(() => null);
      done++;
      if (t && t.pages) {
        const snips = []; let count = 0;
        t.pages.forEach((txt, page) => {
          let flat = '', map = [];
          for (let i = 0; i < txt.length; i++) if (!/\s/.test(txt[i])) { flat += txt[i].toLowerCase(); map.push(i); }
          let i = flat.indexOf(key);
          while (i >= 0) { count++; if (snips.length < 3) { const a = map[i], b = map[i + key.length - 1] + 1; snips.push({ page, a: txt.slice(Math.max(0, a - 30), a), w: txt.slice(a, b), b: txt.slice(b, b + 40) }); } i = flat.indexOf(key, i + key.length); }
        });
        if (count) results.push({ f, n: count, snips, o: t.labels && t.labels.confident && t.labels.offset != null ? t.labels.offset : null });
      }
      if (done % 4 === 0 || !queue.length) show();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (S.q === q) show();
}

async function textOf(f) {
  let t = await store.get('texts', f.id);
  if (t) return t;
  if (!navigator.onLine) return null;
  t = await pdfkit.gunzipJSON(await api.getMeta(f.id, 'text'));
  await store.put('texts', f.id, t);
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
function onContentClick(e) {
  const t = e.target;
  const up = t.closest('[data-t="upload"]'); if (up) { $('.file-in').click(); return; }
  const r = t.closest('[data-restore]'); if (r) { doOps([{ op: 'restoreFile', id: r.dataset.restore }], '되살렸습니다'); return; }
  const rf = t.closest('[data-restore-folder]'); if (rf) { doOps([{ op: 'restoreFolder', id: rf.dataset.restoreFolder }], '되살렸습니다'); return; }
  const p = t.closest('[data-purge]'); if (p) { confirmBox('영구 삭제', '이 파일과 밑줄을 완전히 지웁니다. 되돌릴 수 없습니다.', '영구 삭제', true).then((ok) => ok && doOps([{ op: 'purgeFile', id: p.dataset.purge }], '지웠습니다')); return; }
  const pf = t.closest('[data-purge-folder]'); if (pf) { confirmBox('영구 삭제', '이 폴더와 안의 파일을 완전히 지웁니다. 되돌릴 수 없습니다.', '영구 삭제', true).then((ok) => ok && doOps([{ op: 'purgeFolder', id: pf.dataset.purgeFolder }], '지웠습니다')); return; }
  const mm = t.closest('[data-menu]'); if (mm) { const b = mm.getBoundingClientRect(); fileMenu(mm.dataset.menu, b.right, b.bottom); return; }
  const fm = t.closest('[data-fmenu]'); if (fm) { const b = fm.getBoundingClientRect(); folderMenu(fm.dataset.fmenu, b.right, b.bottom); return; }
  const sn = t.closest('[data-open]'); if (sn) { openFile(sn.dataset.open, sn.dataset.page != null ? { page: Number(sn.dataset.page), query: sn.dataset.q } : {}); return; }
  const row = t.closest('.row');
  if (!row) return;
  if (S.select) {
    if (row.dataset.file) toggleSet(S.select.files, row.dataset.file); else if (row.dataset.fid) toggleSet(S.select.folders, row.dataset.fid);
    render(); return;
  }
  if (row.dataset.fid) { S.view = { kind: 'home', folder: row.dataset.fid }; S.q = ''; $('.find input').value = ''; render(); return; }
  if (row.dataset.file && S.view.kind !== 'trash') openFile(row.dataset.file);
}
function toggleSet(set, v) { if (set.has(v)) set.delete(v); else set.add(v); }
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
  if (t === 'upload') $('.file-in').click();
  else if (t === 'newfolder') {
    const name = await promptBox('새 폴더', '폴더 이름', '', '만들기');
    if (name) doOps([{ op: 'addFolder', folder: { id: 'f_' + rid(10), name, parent: S.view.folder || null } }]);
  } else if (t === 'sort') {
    const k = await menu(b.getBoundingClientRect(), [['added', '최근 올린 순'], ['opened', '최근 읽은 순'], ['name', '이름순']], S.sort);
    if (k) { S.sort = k; render(); }
  } else if (t === 'select') startSelect();
  else if (t === 'endsel') { S.select = null; render(); }
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
  const k = await menu({ left: x, right: x, top: y, bottom: y }, [['open', '열기'], ['rename', '이름 바꾸기'], ['move', '옮기기'], ['dl', '밑줄 넣어 내려받기'], ['print', '인쇄'], ['orig', '원본 내려받기'], ['-'], ['trash', '휴지통으로', 'danger']]);
  if (k === 'open') openFile(id);
  else if (k === 'rename') { const n = await promptBox('이름 바꾸기', '파일 이름', stem(f.name), '바꾸기'); if (n) doOps([{ op: 'updateFile', id, set: { name: n.endsWith('.pdf') ? n : n + '.pdf' } }]); }
  else if (k === 'move') { const to = await pickFolder('옮길 곳'); if (to !== undefined) doOps([{ op: 'updateFile', id, set: { folder: to } }], '옮겼습니다'); }
  else if (k === 'dl') exportPdf(f, { marks: true, mode: 'download' });
  else if (k === 'print') exportPdf(f, { marks: true, mode: 'print' });
  else if (k === 'orig') exportPdf(f, { marks: false, mode: 'download' });
  else if (k === 'trash') doOps([{ op: 'trashFile', id }], '휴지통으로 옮겼습니다');
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
    const have = fileById(id);
    if (have && !have.trashed && !folderTrashed(have.folder)) { set('dup', { msg: `이미 있습니다${have.folder ? ' · ' + ((folderById(have.folder) || {}).name || '') : ''}` }); return; }
    let doc;
    try { doc = await pdfkit.openBytes(buf); }
    catch (e) { set('error', { msg: e && e.name === 'PasswordException' ? '암호가 걸린 PDF는 올릴 수 없습니다' : '열 수 없는 PDF입니다' }); return; }
    const pages = doc.numPages;
    let thumb = null;
    try { thumb = await pdfkit.thumbnail(doc); } catch (e) { /* no picture */ }
    set('up', { p: 0 });
    await api.uploadFile(id, new Blob([buf], { type: 'application/pdf' }), (p) => { u.p = p; renderUploads(); });
    if (thumb) { try { await api.putMeta(id, 'thumb', thumb, 'image/jpeg'); await store.put('thumbs', id, thumb); } catch (e) { thumb = null; } }
    const r = await api.ops([{ op: 'addFile', file: { id, name: u.name, folder: u.folder, size: buf.byteLength, pages, thumb: !!thumb, text: false } }]);
    const res = r.results[0];
    if (!res.ok && res.error === 'no_folder') await api.ops([{ op: 'addFile', file: { id, name: u.name, folder: null, size: buf.byteLength, pages, thumb: !!thumb, text: false } }]);
    S.index = r.index;
    await store.put('files', id, new Blob([buf], { type: 'application/pdf' })); S.cached.add(id);
    render();
    set('index', { p: 0 });
    // page texts for search: after the file is safely stored, so a failure here never loses the upload
    try {
      const t = await pdfkit.textIndex(doc, A, (p) => { u.p = p; renderUploads(); });
      const gz = await pdfkit.gzipJSON(t);
      await api.putMeta(id, 'text', gz, 'application/gzip');
      await store.put('texts', id, t);
      const r2 = await api.ops([{ op: 'updateFile', id, set: { text: true } }]);
      S.index = r2.index;
    } catch (e) { /* search will not include this file */ }
    doc.destroy();
    await store.put('kv', 'index', S.index);
    set('done');
    render();
  } catch (e) {
    set('error', { msg: api.isOffline(e) ? '인터넷 연결이 끊겼습니다' : e.code === 'too_large' ? '파일이 너무 큽니다' : '올리지 못했습니다' });
  }
}
function renderUploads() {
  const box = $('.uploads'); if (!box) return;
  if (!S.uploads.length) { box.hidden = true; return; }
  const active = S.uploads.filter((u) => !['done', 'dup', 'error'].includes(u.status)).length;
  const label = { wait: '기다리는 중', read: '확인하는 중', up: '올리는 중', index: '본문 색인 중', done: '완료', dup: '', error: '' };
  box.hidden = false;
  box.innerHTML = `<div class="up-h"><b>${active ? `올리는 중 ${S.uploads.length - active}/${S.uploads.length}` : '올리기 끝'}</b>${active ? '' : '<button class="ib" data-x aria-label="닫기">' + I.close + '</button>'}</div>
    <ul>${S.uploads.map((u) => `<li class="${u.status}"><span class="n">${esc(stem(u.name))}</span><span class="s">${u.msg ? esc(u.msg) : label[u.status]}${u.status === 'up' || u.status === 'index' ? ' ' + Math.round(u.p * 100) + '%' : ''}</span>${u.status === 'error' ? `<button class="btn small" data-retry="${u.key}">다시</button>` : ''}<i class="upbar"><b style="width:${u.status === 'done' || u.status === 'dup' ? 100 : Math.round((u.status === 'up' ? u.p * 0.9 : u.status === 'index' ? 0.9 + u.p * 0.1 : 0) * 100)}%"></b></i></li>`).join('')}</ul>`;
  clearTimeout(S.upT);
  if (!active && S.uploads.every((u) => u.status === 'done')) S.upT = setTimeout(() => { if (S.uploads.every((u) => u.status === 'done')) { S.uploads = []; renderUploads(); } }, 5000);
  box.onclick = (e) => {
    if (e.target.closest('[data-x]')) { S.uploads = []; renderUploads(); return; }
    const r = e.target.closest('[data-retry]'); if (r) { const u = S.uploads.find((x) => x.key === r.dataset.retry); if (u) { u.status = 'wait'; u.msg = ''; u.p = 0; renderUploads(); pumpUploads(); } }
  };
}

/* ================= reading ================= */
async function getBytes(f, onProgress) {
  const b = await store.get('files', f.id);
  if (b) return b;
  const blob = await api.download('/files/' + f.id, onProgress);
  await store.put('files', f.id, blob); S.cached.add(f.id);
  return blob;
}

async function openFile(id, at = {}) {
  const f = fileById(id); if (!f) return;
  if (S.reader) closeReader(true);
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
    S.reader = new Reader(host, {
      doc, title: stem(f.name), analyze: A, marks, index,
      at: at.page != null ? { page: at.page, query: at.query } : (s ? { page: s.page, y: s.y } : {}),
      prefs: S.prefs,
      onClose: () => history.back(),
      onMarks: (list) => saveMarks(id, list),
      onPrefs: (p) => { S.prefs = { ...S.prefs, ...p }; store.put('kv', 'prefs', S.prefs); },
      onPosition: (pos) => savePosition(id, pos, doc.numPages),
      onShare: (btn) => shareMenu(f, btn),
      toast,
    });
    S.reader.docRef = doc;
    await S.reader.start();
    if (!index && f.text) textOf(f).then((t) => { if (S.reader && S.readerId === id) S.reader.setIndex(t); }).catch(() => {});
  } catch (e) {
    host.remove(); S.readerId = null;
    if (location.hash.startsWith('#r=')) history.replaceState(null, '', location.pathname);
    toast(e.code === 'offline' ? '이 파일은 아직 이 기기에 없습니다. 인터넷에 연결되면 열 수 있습니다.' : e.name === 'PasswordException' ? '암호가 걸린 PDF입니다' : '파일을 열지 못했습니다');
  }
}
function closeReader(silent) {
  if (!S.reader && !S.readerId) return;
  if (S.reader) { const pos = S.reader.current(); savePosition(S.readerId, pos, S.reader.N, true); const d = S.reader.docRef; S.reader.destroy(); if (d) d.destroy(); }
  S.reader = null; S.readerId = null;
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
    await store.put('marks', id, { marks: merged, pending: local.pending });
    if (local.pending) pushMarks(id);
    return merged;
  } catch (e) { return local.marks; }
}
const markTimers = new Map();
async function saveMarks(id, list) {
  await store.put('marks', id, { marks: list, pending: true });
  clearTimeout(markTimers.get(id));
  markTimers.set(id, setTimeout(() => pushMarks(id), 1200));
}
async function pushMarks(id) {
  const rec = await store.get('marks', id);
  if (!rec || !rec.pending || !navigator.onLine) return;
  try {
    const res = await api.putMarks(id, rec.marks);
    const now = await store.get('marks', id);
    // only clear the flag if nothing changed while the request was out
    if (now && JSON.stringify(now.marks) === JSON.stringify(rec.marks)) await store.put('marks', id, { marks: res.marks, pending: false });
    else await store.put('marks', id, { marks: mergeMarks(res.marks, now.marks), pending: true });
  } catch (e) { /* stays pending; sent when online again */ }
}
async function syncMarksAll() {
  if (!navigator.onLine) return;
  for (const id of await store.keys('marks')) { const r = await store.get('marks', id); if (r && r.pending) await pushMarks(id); }
}

/* ---------- reading positions ---------- */
let stateT = null; const stateDirty = new Set();
function savePosition(id, pos, pages, now) {
  if (!id) return;
  S.state.files[id] = { page: pos.page, y: pos.y, at: Date.now(), done: pages ? pos.page >= pages - 1 : false };
  if (Number.isInteger(pos.o)) S.state.files[id].o = pos.o;
  stateDirty.add(id);
  store.put('kv', 'state', S.state);
  clearTimeout(stateT); stateT = setTimeout(pushState, now ? 0 : 2500);
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
    if (S.reader || !navigator.onLine || document.hidden) return;
    if (await store.has('texts', f.id)) continue;
    try { await textOf(f); } catch (e) { break; }
  }
  if (S.prefs.prefetch === false) return;
  const since = Date.now() - 30 * 86400e3;
  const todo = liveFiles().filter((f) => f.added > since && !S.cached.has(f.id)).sort((a, b) => b.added - a.added);
  let budget = 600 * 1024 * 1024;
  for (const f of todo) {
    if (S.reader || !navigator.onLine || document.hidden) break;
    if (f.size > budget) continue;
    try { await getBytes(f); budget -= f.size; render(); } catch (e) { break; }
  }
}

/* ================= settings ================= */
async function settings() {
  const used = S.index.files.reduce((s, f) => s + (f.size || 0), 0);
  const local = await store.filesSize().catch(() => 0);
  const est = await store.estimate();
  const box = sheet(`<h2>설정</h2>
    <section><h3>저장 공간</h3><p class="kv"><span>책장 서버</span><b>${size(used)} / 무료 10GB</b></p><p class="kv"><span>이 기기에 받아 둔 파일</span><b>${size(local)}</b></p>
      ${est && est.quota ? `<p class="kv"><span>이 기기에서 쓸 수 있는 공간</span><b>약 ${size(est.quota)}</b></p>` : ''}
      <label class="sw"><input type="checkbox" class="pf" ${S.prefs.prefetch === false ? '' : 'checked'}><span>최근 30일 새 파일을 미리 받아 두기</span></label>
      <button class="btn ghost clear-local">이 기기에 받아 둔 파일 비우기</button></section>
    <section><h3>로그인된 기기</h3><ul class="devs"><li class="none">불러오는 중…</li></ul></section>
    <section class="foot"><button class="btn danger ghost signout">이 기기에서 로그아웃</button><p class="ver">연구실 책장 ${esc(VERSION)}</p></section>`);
  $('.pf', box).onchange = (e) => { S.prefs.prefetch = e.target.checked; store.put('kv', 'prefs', S.prefs); if (e.target.checked) prefetch(); };
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
    $('.devs', box).innerHTML = devs.map((d) => `<li><span><b>${esc(d.name)}</b>${d.current ? ' <em>이 기기</em>' : ''}<small>마지막 사용 ${ago(d.seen)}</small></span>${d.current ? '' : `<button class="btn small ghost" data-drop="${d.id}">로그아웃시키기</button>`}</li>`).join('');
    $('.devs', box).onclick = async (e) => {
      const b = e.target.closest('[data-drop]'); if (!b) return;
      if (!(await confirmBox('기기 로그아웃', '그 기기는 다시 비밀번호를 넣어야 책장을 열 수 있습니다.', '로그아웃시키기', true))) return;
      await api.dropDevice(b.dataset.drop); b.closest('li').remove(); toast('로그아웃시켰습니다');
    };
  } catch (e) { $('.devs', box).innerHTML = '<li class="none">인터넷에 연결되면 볼 수 있습니다</li>'; }
}

/* ================= small UI parts ================= */
let toastT = null;
function toast(msg, ms = 2600) {
  const t = $('.toast') || (() => { const x = el('div', 'toast'); document.body.appendChild(x); return x; })();
  t.textContent = msg; t.hidden = false; t.classList.add('in');
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

function promptBox(title, label, value, ok) {
  return new Promise((resolve) => {
    const box = sheet(`<h2>${esc(title)}</h2><label class="field"><span>${esc(label)}</span><input type="text" value="${esc(value)}" maxlength="200"></label><div class="row-btns"><button class="btn ghost cancel">취소</button><button class="btn primary ok">${esc(ok)}</button></div>`);
    const inp = $('input', box);
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
function menu(rect, items, current) {
  return new Promise((resolve) => {
    document.querySelectorAll('.menu-wrap').forEach((m) => m.remove());
    const w = el('div', 'menu-wrap', `<div class="menu" role="menu">${items.map(([k, label, cls]) => k === '-' ? '<hr>' : `<button data-k="${k}" class="${cls || ''} ${k === current ? 'on' : ''}" role="menuitem">${esc(label)}</button>`).join('')}</div>`);
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
function pageOf(s, pages) { const o = Number.isInteger(s.o) ? s.o : null; return o == null ? `${s.page + 1} / ${pages}쪽` : `${s.page + 1 + o} / ${pages + o}면`; }   // same numbers as the reader
function ago(t) { if (!t) return ''; const s = (Date.now() - t) / 1000; if (s < 90) return '방금'; if (s < 3600) return Math.round(s / 60) + '분 전'; if (s < 86400) return Math.round(s / 3600) + '시간 전'; if (s < 86400 * 7) return Math.round(s / 86400) + '일 전'; return date(t); }
function stem(n) { return String(n || '').replace(/\.pdf$/i, ''); }
function rid(n) { const a = 'abcdefghijklmnopqrstuvwxyz0123456789'; const b = crypto.getRandomValues(new Uint8Array(n)); return [...b].map((x) => a[x % 36]).join(''); }

boot().catch((e) => { console.error(e); document.body.innerHTML = '<div class="gate"><div class="gate-card"><h1 class="brand-big">연구실 책장</h1><p class="gate-s">문제가 생겼습니다. 다시 열어 주세요.</p></div></div>'; });
