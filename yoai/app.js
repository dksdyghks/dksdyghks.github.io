/* 요AI — 연구자의 서재. 선행연구 PDF를 이 컴퓨터 안에 쌓아 두고, 모든 쪽을 찾아 읽고, 인용을 모아 각주 달린 Word로 낸다.
   서버도 인터넷도 쓰지 않는다. 문헌·노트·지난 대화는 이 브라우저의 저장소(IndexedDB)에만 있고, 한 번 연 뒤에는 오프라인에서도 열린다. */
import { renderMarkdown } from './md.js?v=156b0996e9';
import { buildDocx, DOCX_MIME } from './docx.js?v=156b0996e9';
import { AI, WEB_MODELS, stripThink } from './ai.js?v=156b0996e9';

const EMBED = window.parent !== window;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const DEFAULTS = { theme: 'auto', read: 'pdf' };
let WIPED = false; // set once 요AI has been removed from this computer: nothing may be written after that

/* ---------------- storage ---------------- */
const DB = (() => {
  let db = null;
  const open = () => new Promise((res, rej) => {
    const req = indexedDB.open('yoai', 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const s of ['projects', 'chats', 'docs', 'cards']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
    };
    req.onsuccess = () => { db = req.result; db.onversionchange = () => db.close(); res(db); };
    req.onerror = () => rej(req.error);
    req.onblocked = () => rej(new Error('다른 창에 열린 요AI 때문에 저장소를 열지 못했습니다. 다른 창을 닫고 다시 여세요.'));
  });
  const run = (st, mode, fn) => new Promise((res, rej) => { if (!db) { res(undefined); return; } let out; const t = db.transaction(st, mode); const r = fn(t.objectStore(st)); if (r) r.onsuccess = () => { out = r.result; }; t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  return { open, get: (s, k) => run(s, 'readonly', (o) => o.get(k)), all: (s) => run(s, 'readonly', (o) => o.getAll()), put: (s, v, k) => run(s, 'readwrite', (o) => (k === undefined ? o.put(v) : o.put(v, k))), del: (s, k) => run(s, 'readwrite', (o) => o.delete(k)) };
})();
const S = { settings: { ...DEFAULTS }, projects: [], chats: [], docs: [], cards: [], project: null, view: 'find', q: '', qDoc: '', reader: null, chat: null, persistent: false, folder: null, sync: null, indexing: null };
async function saveSettings() { applyTheme(); if (WIPED) return; try { await DB.put('kv', S.settings, 'settings'); } catch (e) { /* ignore */ } }
const saveProject = (p) => { p.updatedAt = Date.now(); return DB.put('projects', p).catch(() => {}); };
const saveCard = (c) => { c.updatedAt = Date.now(); return DB.put('cards', c).catch((e) => toast('노트를 저장하지 못했습니다: ' + e.message)); };
function applyTheme() { const r = document.documentElement; if (S.settings.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', S.settings.theme); }
let toastT = 0;
function toast(m) { let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); } t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800); }
const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);
const kdate = (ts) => { const d = new Date(ts || Date.now()); return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`; };

/* ---------------- documents: kept whole, with the text of every page ---------------- */
let pdfjsP = null;
const pdfjsLib = () => { if (!pdfjsP) pdfjsP = import('./pdf.js?v=156b0996e9').then((m) => { m.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.js?v=156b0996e9', import.meta.url).href; return m; }); return pdfjsP; };
const docMeta = (d) => ({ id: d.id, title: d.title, author: d.author, year: d.year, venue: d.venue, page1: d.page1 || '', kind: d.kind, size: d.size, npages: d.npages || 0, addedAt: d.addedAt, folder: d.folder || '', sig: d.sig || '', indexed: Array.isArray(d.pages) && d.blank != null, chars: d.chars || 0, blank: !!d.blank, textOnly: !!d.textOnly, ocr: !!d.ocr, digest: d.digest ? d.digest.text : '', digestModel: d.digest ? d.digest.model : '', digestMode: d.digest ? d.digest.mode || 'full' : '', hasFacts: !!d.facts, brief: d.facts ? d.facts.brief || '' : '' });
async function pdfPageCount(bytes) { try { const pdfjs = await pdfjsLib(); const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise; const n = doc.numPages; doc.destroy(); return n; } catch (e) { return 0; } }
async function pdfText(bytes) {
  const pdfjs = await pdfjsLib();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) { const pg = await doc.getPage(i); const tc = await pg.getTextContent(); pages.push(tc.items.map((it) => (it.str || '') + (it.hasEOL ? '\n' : '')).join('').replace(/[ \t]+\n/g, '\n').trim()); }
  doc.destroy();
  return pages;
}
const chunkText = (t) => { const out = []; for (let i = 0; i < t.length; i += 3000) out.push(t.slice(i, i + 3000)); return out.length ? out : ['']; };
async function docPages(id) {
  const d = await DB.get('docs', id); if (!d) return null;
  if (!Array.isArray(d.pages) || d.blank == null) {
    if (!Array.isArray(d.pages)) d.pages = d.kind === 'pdf' ? (d.bytes ? await pdfText(d.bytes) : []) : chunkText(d.text || '');
    const all = d.pages.join('');
    d.chars = all.replace(/\s+/g, '').length; d.blank = d.chars < 50;
    if (!d.blank) d.facts = extractFacts(d.pages);
    await DB.put('docs', d);
    const m = S.docs.find((x) => x.id === id); if (m) Object.assign(m, { indexed: true, chars: d.chars, blank: d.blank, hasFacts: !!d.facts, brief: d.facts ? d.facts.brief : '' });
  } else if (!d.blank && !d.facts) {
    d.facts = extractFacts(d.pages); await DB.put('docs', d);
    const m = S.docs.find((x) => x.id === id); if (m) Object.assign(m, { hasFacts: true, brief: d.facts.brief });
  }
  return { id, pages: d.pages };
}
async function addFiles(files, opts = {}) {
  const ids = [];
  for (const f of files) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const title = f.name.replace(/\.[^.]+$/, '');
    const doc = { id: uid(), title, author: '', year: '', venue: '', size: f.size, addedAt: Date.now(), ...(opts.folder ? { folder: opts.folder, sig: opts.sig } : {}) };
    if (ext === 'pdf' || f.type === 'application/pdf') { doc.kind = 'pdf'; doc.bytes = await f.arrayBuffer(); doc.npages = await pdfPageCount(doc.bytes); }
    else if (['txt', 'md', 'text'].includes(ext) || (f.type || '').startsWith('text/')) { doc.kind = 'text'; doc.text = await f.text(); }
    else { if (!opts.quiet) toast(`${f.name}: PDF나 텍스트 파일만 넣을 수 있습니다.`); continue; }
    try { await DB.put('docs', doc); }
    catch (e) { // storage full: keep the text of every page, which is what finding and reading need
      if (doc.kind !== 'pdf') { toast(`${f.name}: 저장 공간이 부족해 넣지 못했습니다.`); continue; }
      try { doc.pages = await pdfText(doc.bytes); doc.bytes = null; doc.textOnly = true; await DB.put('docs', doc); toast(`저장 공간이 부족해 ‘${title}’은(는) 본문 글자만 보관합니다.`); }
      catch (e2) { toast(`${f.name}: 저장 공간이 부족해 넣지 못했습니다.`); continue; }
    }
    S.docs.push(docMeta(doc)); ids.push(doc.id);
  }
  if (ids.length && !opts.quiet) toast(`서재에 ${ids.length}개 문헌을 넣었습니다. 본문을 읽어 찾을 수 있게 합니다.`);
  if (ids.length) { LIB = null; indexLibrary(); }
  return ids;
}
async function removeDoc(id) { await DB.del('docs', id); S.docs = S.docs.filter((d) => d.id !== id); LIB = null; if (PDFDOC && PDFDOC.id === id) closePdf(); }
async function replaceDoc(id, f, sig) { // a file in the connected folder changed: same entry, new contents (cards keep pointing at it)
  const d = await DB.get('docs', id); if (!d) return;
  d.size = f.size; d.sig = sig; delete d.pages; delete d.blank; delete d.chars; delete d.textOnly; delete d.digest; delete d.facts;
  if (d.kind === 'pdf') { d.bytes = await f.arrayBuffer(); d.npages = await pdfPageCount(d.bytes); } else d.text = await f.text();
  await DB.put('docs', d); LIB = null; if (PDFDOC && PDFDOC.id === id) closePdf();
  const i = S.docs.findIndex((x) => x.id === id); if (i >= 0) S.docs[i] = docMeta(d);
}
const docOf = (id) => S.docs.find((d) => d.id === id) || null;

/* ---------------- index and search: every page of every document, on this computer ---------------- */
let LIB = null; // { key, docs: [{ id, pages, norm }] }
const libKey = () => S.docs.filter((d) => d.indexed && !d.blank).map((d) => `${d.id}:${d.sig || d.size}`).join(',');
async function libLoad() {
  const key = libKey();
  if (LIB && LIB.key === key) return LIB;
  const docs = [];
  for (const d of S.docs) {
    if (!d.indexed || d.blank) continue;
    const pg = await docPages(d.id); if (!pg) continue;
    docs.push({ id: d.id, pages: pg.pages, norm: pg.pages.map((t) => t.toLowerCase().replace(/\s+/g, ' ')) });
  }
  LIB = { key, docs };
  return LIB;
}
const WORD_RE = /[^0-9a-zÀ-ɏ가-힣一-鿿ㄱ-ㆎ]+/;
/* "따옴표" = that exact expression, -낱말 = pages without it; everything else is matched in two-letter pieces, so spacing
   and particles do not matter (의회유보 also finds 의회 유보, 의회유보의, 의회유보를) */
function parseQuery(q) {
  const phrases = [], neg = [];
  let rest = String(q || '').replace(/["“”]([^"“”]+)["“”]/g, (_, a) => { const p = a.toLowerCase().replace(/\s+/g, ' ').trim(); if (p) phrases.push(p); return ` ${a} `; });
  rest = rest.replace(/(^|\s)-(\S+)/g, (_, s, w) => { neg.push(w.toLowerCase()); return ' '; });
  const terms = new Set(), words = [];
  for (const w of rest.toLowerCase().split(WORD_RE)) {
    if (!w) continue;
    if (w.length > 1) words.push(w);
    if (/[가-힣一-鿿ㄱ-ㆎ]/.test(w)) { if (w.length === 1) terms.add(w); else for (let i = 0; i + 1 < w.length; i++) terms.add(w.slice(i, i + 2)); }
    else if (w.length > 1 || /\d/.test(w)) terms.add(w);
  }
  return { terms: [...terms], words, phrases, neg };
}
function searchLib(lib, q, k = 50, only = '') { // BM25 over pages; pages matching more of the query and the exact phrase rank higher
  const pq = typeof q === 'string' ? parseQuery(q) : q;
  if (!pq.terms.length) return [];
  const docs = only ? lib.docs.filter((d) => d.id === only) : lib.docs;
  let N = 0, tot = 0; for (const d of docs) for (const p of d.norm) { N++; tot += p.length; }
  if (!N) return [];
  const avg = tot / N || 1;
  const idf = pq.terms.map((t) => { let n = 0; for (const d of docs) for (const p of d.norm) if (p.includes(t)) n++; return n ? Math.log(1 + (N - n + 0.5) / (n + 0.5)) : 0; });
  const whole = pq.words.join(' ');
  const out = [];
  for (const d of docs) d.norm.forEach((p, i) => {
    if (pq.phrases.some((ph) => !p.includes(ph)) || pq.neg.some((w) => p.includes(w))) return;
    let sc = 0, hit = 0;
    for (let j = 0; j < pq.terms.length; j++) {
      if (!idf[j]) continue;
      let tf = 0, at = p.indexOf(pq.terms[j]);
      while (at >= 0 && tf < 30) { tf++; at = p.indexOf(pq.terms[j], at + 1); }
      if (!tf) continue;
      hit++; sc += idf[j] * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * p.length / avg));
    }
    if (!sc) return;
    sc *= 0.4 + 0.6 * hit / pq.terms.length;
    if (whole.length > 3 && p.includes(whole)) sc *= 1.6;
    for (const w of pq.words) if (w.length > 1 && p.includes(w)) sc *= 1.15;
    out.push({ id: d.id, page: i + 1, score: sc });
  });
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, k);
}
let indexP = null;
function indexLibrary() { // read every page's text once, in the background
  if (indexP) return indexP;
  indexP = (async () => {
    for (;;) {
      const todo = S.docs.filter((d) => !d.indexed || (!d.blank && !d.hasFacts));
      if (!todo.length) break;
      S.indexing = { done: 0, total: todo.length }; paintStatus();
      for (const d of todo) {
        try { await docPages(d.id); } catch (e) { Object.assign(d, { indexed: true, blank: true }); }
        if (d.indexed && !d.blank && !d.hasFacts) d.hasFacts = true; // never loop on a document whose facts could not be read
        S.indexing.done++; paintStatus();
      }
    }
    S.indexing = null; LIB = null; paintStatus();
    if (S.view === 'find' && S.q) runFind();
  })().finally(() => { indexP = null; });
  return indexP;
}
function libStats() {
  const ok = S.docs.filter((d) => d.indexed && !d.blank);
  return { n: S.docs.length, ok: ok.length, pages: ok.reduce((n, d) => n + (d.npages || 0), 0), chars: ok.reduce((n, d) => n + (d.chars || 0), 0), blank: S.docs.filter((d) => d.blank).length, size: S.docs.reduce((n, d) => n + (d.size || 0), 0) };
}

/* ---------------- the connected folder: everything in it, kept in step ---------------- */
const FOLDER_FILE = /\.(pdf|txt|md)$/i;
async function* walkDir(dir, path = '') {
  for await (const [name, h] of dir.entries()) {
    if (name.startsWith('.') || name.startsWith('~$')) continue;
    if (h.kind === 'directory') yield* walkDir(h, `${path}${name}/`);
    else if (FOLDER_FILE.test(name)) yield { path: path + name, get: () => h.getFile() };
  }
}
async function connectFolder() {
  if (window.showDirectoryPicker) { // Chrome·Edge: the folder stays connected and is read again whenever 요AI opens
    let h; try { h = await window.showDirectoryPicker({ id: 'yoai-library', mode: 'read' }); } catch (e) { return; }
    S.folder = { name: h.name, handle: h, perm: 'granted' };
    try { await DB.put('kv', h, 'folder'); } catch (e) { /* this browser cannot keep it; connected for this session */ }
    await syncFolder();
  } else { const inp = $('#folder-in'); if (inp) inp.click(); } // other browsers: read the chosen folder now
}
async function syncFolder(files) {
  if (S.sync) return;
  let root, list = [];
  try {
    if (files) {
      files = files.filter((f) => FOLDER_FILE.test(f.name) && !/(^|\/)[.~]/.test(f.webkitRelativePath || f.name));
      root = ((files[0] && files[0].webkitRelativePath) || '').split('/')[0] || '폴더';
      list = files.map((f) => ({ path: (f.webkitRelativePath || f.name).split('/').slice(1).join('/') || f.name, get: async () => f }));
      S.folder = { name: root, handle: null, perm: 'once' };
    } else {
      const h = S.folder && S.folder.handle; if (!h) return;
      let perm = await h.queryPermission({ mode: 'read' });
      if (perm !== 'granted') { try { perm = await h.requestPermission({ mode: 'read' }); } catch (e) { /* needs a click */ } }
      if (perm !== 'granted') { S.folder.perm = 'prompt'; paintStatus(); return; }
      S.folder.perm = 'granted'; root = h.name;
      for await (const e of walkDir(h)) list.push(e);
    }
  } catch (e) { toast('폴더를 읽지 못했습니다: ' + (e.message || e)); return; }
  S.sync = { done: 0, total: list.length }; paintStatus();
  const seen = new Set(); let added = 0, changed = 0, removed = 0;
  for (const e of list) {
    const key = `${root}/${e.path}`; seen.add(key);
    try {
      const f = await e.get(); const sig = `${f.size}|${f.lastModified}`;
      const old = S.docs.find((d) => d.folder === key);
      if (!old) { if ((await addFiles([f], { folder: key, sig, quiet: true })).length) added++; }
      else if (old.sig !== sig) { await replaceDoc(old.id, f, sig); changed++; }
    } catch (err) { /* unreadable this time; tried again on the next reading */ }
    S.sync.done++; paintStatus();
  }
  for (const d of S.docs.filter((x) => x.folder && x.folder.startsWith(root + '/') && !seen.has(x.folder))) { await removeDoc(d.id); removed++; }
  S.sync = null; S.settings.folderName = root; S.settings.folderAt = Date.now(); saveSettings();
  toast(added || changed || removed ? `폴더 ‘${root}’: 새 문헌 ${added}개, 바뀐 문헌 ${changed}개, 빠진 문헌 ${removed}개를 맞췄습니다.` : `폴더 ‘${root}’: 바뀐 문헌이 없습니다.`);
  LIB = null; paintSide(); paintStatus(); if (S.view === 'library') viewLibrary();
  indexLibrary();
}

/* ---------------- 스캔본 글자 읽기(OCR): pages that are only pictures become text, on this computer ----------------
   Each page is drawn at about 240 dpi and read with Tesseract (Korean and English), all inside this browser; the engine
   and the language data are served from this site and kept for offline use. Pages that already have text are left as they are. */
const TESS = new URL('./vendor/tesseract-7.0.0/', import.meta.url).href;
const OCR = { run: false, stop: false, done: 0, total: 0, doc: '', page: '' };
let ocrWorker = null, ocrError = null;
async function ocrEngine() {
  if (ocrWorker) return ocrWorker;
  const T = (await import(TESS + 'tesseract.esm.min.js')).default;
  ocrError = null;
  ocrWorker = await T.createWorker(['kor', 'eng'], 1, { workerPath: TESS + 'worker.min.js', corePath: TESS + 'core', langPath: TESS + 'lang', gzip: true, cacheMethod: 'none',
    errorHandler: (e) => { ocrError = e; } }); // a failure inside the engine is reported, never mistaken for an empty page
  if (ocrError) throw new Error('글자 인식 엔진을 시작하지 못했습니다');
  return ocrWorker;
}
function cleanOcr(t) { // tidy the recognised text; undo the letter-by-letter spacing Korean OCR sometimes produces
  t = String(t || '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const spaced = (t.match(/[가-힣] (?=[가-힣])/g) || []).length, hangul = (t.match(/[가-힣]/g) || []).length;
  if (hangul > 20 && spaced / hangul > 0.45) t = t.replace(/([가-힣]) (?=[가-힣])/g, '$1');
  return t;
}
const scanned = () => S.docs.filter((d) => d.kind === 'pdf' && !d.textOnly && d.blank);
async function ocrDoc(d) {
  const full = await DB.get('docs', d.id);
  if (!full || !full.bytes) throw new Error('원본 PDF가 남아 있지 않습니다');
  const pdfjs = await pdfjsLib();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(full.bytes.slice(0)) }).promise;
  const engine = await ocrEngine();
  const pages = Array.isArray(full.pages) ? full.pages.slice() : [];
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      if (OCR.stop) break;
      if (pages[i - 1] && pages[i - 1].replace(/\s+/g, '').length >= 30) continue;
      OCR.page = `${i}/${doc.numPages}쪽`; paintStatus();
      const pg = await doc.getPage(i);
      const v1 = pg.getViewport({ scale: 1 });
      const vp = pg.getViewport({ scale: Math.min(3.2, 2000 / Math.max(v1.width, v1.height)) });
      canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pg.render({ canvasContext: ctx, viewport: vp }).promise;
      const r = await engine.recognize(canvas);
      if (ocrError) throw new Error('글자 인식 엔진에 문제가 생겼습니다');
      pages[i - 1] = cleanOcr(r && r.data && r.data.text);
    }
  } finally { doc.destroy(); canvas.width = canvas.height = 0; }
  full.pages = pages; full.ocr = true;
  full.chars = pages.join('').replace(/\s+/g, '').length; full.blank = full.chars < 50;
  delete full.digest; full.facts = full.blank ? undefined : extractFacts(pages);
  await DB.put('docs', full); Object.assign(d, docMeta(full)); LIB = null;
}
async function ocrAll(only) {
  if (OCR.run) return;
  const todo = only ? [docOf(only)].filter(Boolean) : scanned();
  if (!todo.length) { toast('글자를 읽을 스캔본이 없습니다.'); return; }
  Object.assign(OCR, { run: true, stop: false, done: 0, total: todo.length, doc: '', page: '' }); paintStatus();
  let ok = 0; const fail = [];
  try {
    for (const d of todo) {
      if (OCR.stop) break;
      OCR.doc = d.title; OCR.page = ''; paintStatus();
      try { await ocrDoc(d); if (!d.blank) ok++; else if (!OCR.stop) fail.push(`「${d.title}」: 읽을 수 있는 글자를 찾지 못했습니다(흐리거나 손글씨일 수 있습니다)`); }
      catch (e) { fail.push(`「${d.title}」: ${e.message || e}`); if (ocrWorker) { try { await ocrWorker.terminate(); } catch (e2) { /* ignore */ } ocrWorker = null; } }
      OCR.done++; paintStatus();
    }
  } finally {
    const stopped = OCR.stop; Object.assign(OCR, { run: false, stop: false, doc: '', page: '' });
    if (ocrWorker) { try { await ocrWorker.terminate(); } catch (e) { /* ignore */ } ocrWorker = null; }
    paintStatus(); paintSide(); redraw('library');
    if (stopped) toast('글자 읽기를 멈췄습니다. 다시 누르면 남은 쪽부터 이어서 읽습니다.');
    else if (fail.length) modal(`<h2>글자 읽기 결과</h2><p class="sub">${ok ? `스캔본 ${ok}개의 글자를 읽었습니다. ` : ''}다음 문헌은 읽지 못했습니다.</p><ul class="help">${fail.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><div class="modal-foot"><button class="btn primary" data-close>닫기</button></div>`);
    else toast(`스캔본 ${ok}개의 글자를 읽었습니다. 이제 찾기와 묻기에 쓰입니다.`);
  }
}

/* ---------------- citations in the style of Korean public-law journals: 저자, “제목”, 학술지, 연도, 쪽. ---------------- */
function where(doc, a, b) {
  b = b || a;
  if (doc && doc.kind === 'text') return { ui: a === b ? `${a}번째 부분` : `${a}–${b}번째 부분`, note: '' }; // a text file has no printed pages
  const off = doc && +doc.page1 > 1 ? +doc.page1 - 1 : null;
  const rng = (p, q) => (q > p ? `${p}-${q}` : `${p}`);
  if (off !== null) return { ui: `${rng(a + off, b + off)}면 (PDF ${rng(a, b)}쪽)`, note: `${rng(a + off, b + off)}면` };
  return { ui: `${rng(a, b)}쪽`, note: `PDF ${rng(a, b)}쪽` };
}
function footnote(doc, page, page2) {
  if (!doc) return '(서재에서 지운 문헌)';
  const w = page ? where(doc, page, page2).note : '';
  return `${doc.author ? `${doc.author}, ` : ''}“${doc.title}”${doc.venue ? `, ${doc.venue}` : ''}${doc.year ? `, ${doc.year}` : ''}${w ? `, ${w}` : ''}.`;
}
const pageLabel = (doc, p) => where(doc, p).ui;

/* ---------------- shell ---------------- */
const IC = {
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  find: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  ask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5.5h14v10H11l-4 3.5v-3.5H5z"/><path d="M9.5 9.2a2.5 2.5 0 1 1 3.4 2.3c-.5.2-.9.6-.9 1.1"/><path d="M12 14.3h.01"/></svg>',
  notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h9l3.5 3.5v13.5H6z"/><path d="M9 11h6M9 15h6M14.5 3.5V7H18"/></svg>',
  lib: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4v16H5zM10 4h4v16h-4z"/><path d="M15.5 5.5l3.8-1 3 15.5-3.8 1z"/></svg>',
  arch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v4H4zM5.5 10v9.5h13V10M10 14h4"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17h.01"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
};
const VIEWS = { ask: '묻기', find: '찾기', read: '읽기', notes: '노트', library: '서재', archive: '지난 대화' };
function paintShell() {
  $('#app').innerHTML = `<div class="shell">
    <aside class="side" id="side"></aside>
    <section class="main">
      <div class="topbar"><button class="icon menu-btn" data-act="menu" aria-label="메뉴">${IC.menu}</button><div class="title" id="title"></div>
        <span class="net" id="net"></span>
        ${EMBED ? `<button class="icon" data-act="close" title="닫기" aria-label="닫기">${IC.close}</button>` : ''}</div>
      <div class="thread" id="view"></div>
    </section><div class="scrim" data-act="scrim"></div></div>`;
  paintSide(); paintNet(); show(S.view);
}
function paintNet() { const n = $('#net'); if (n) { n.textContent = navigator.onLine ? '' : '오프라인'; n.hidden = navigator.onLine; } }
function paintSide() {
  const el = $('#side'); if (!el) return;
  const nCards = S.cards.filter((c) => c.projectId === (S.project && S.project.id)).length;
  const nChats = S.chats.filter((c) => !c.local).length;
  const nav = (v, ic, label, n) => `<button class="side-btn nav${S.view === v || (v === 'find' && S.view === 'read') ? ' on' : ''}" data-act="go" data-v="${v}">${ic} ${label}${n != null ? `<span class="n">${n}</span>` : ''}</button>`;
  el.innerHTML = `<div class="side-top"><span class="mark">YO</span><div class="brand">YO아이<small>연구 서재 · 오프라인</small></div></div>
    <div class="side-sec"><div class="side-label"><span>연구 프로젝트</span><button class="icon" style="width:26px;height:26px" data-act="new-project" title="새 프로젝트" aria-label="새 프로젝트">${IC.plus}</button></div>
      <select id="project-sel" aria-label="연구 프로젝트">${S.projects.map((p) => `<option value="${p.id}"${S.project && p.id === S.project.id ? ' selected' : ''}>${esc(p.title)}</option>`).join('')}</select></div>
    <nav class="side-nav">${nav('ask', IC.ask, '묻기')}${nav('find', IC.find, '찾기')}${nav('notes', IC.notes, '노트', nCards)}${nav('library', IC.lib, '서재', S.docs.length)}${nChats ? nav('archive', IC.arch, '지난 대화', nChats) : ''}</nav>
    <div class="side-status" id="side-status"></div>
    <div class="side-foot"><button class="side-btn" data-act="help">${IC.help} 사용법</button><button class="side-btn" data-act="settings">${IC.gear} 설정</button></div>`;
  paintStatus();
}
function statusText() {
  if (S.sync) return `폴더 읽는 중 ${S.sync.done}/${S.sync.total}`;
  if (S.indexing) return `본문 읽는 중 ${S.indexing.done}/${S.indexing.total}`;
  if (OCR.run) return `글자 읽는 중 ${OCR.done}/${OCR.total}${OCR.doc ? ` · ${OCR.doc} ${OCR.page}` : ''}`;
  if (DIG.run) return `숙지 중 ${DIG.done}/${DIG.total}${DIG.doc ? ` · ${DIG.doc}` : ''}`;
  return '';
}
function paintStatus() {
  const t = statusText();
  const s = $('#side-status'); if (s) { s.textContent = t; s.hidden = !t; }
  const f = $('#find-status'); if (f) f.innerHTML = findStatus();
  const l = $('#lib-status'); if (l) l.innerHTML = libStatusHTML();
  const dg = $('#dig-status'); if (dg) dg.innerHTML = digestStatusHTML();
}
function closeSide() { const sd = $('#side'); if (sd) sd.classList.remove('open'); const sh = $('.shell'); if (sh) sh.classList.remove('side-open'); }
function show(v) {
  S.view = v; closeSide(); selTool(null);
  if (v !== 'read') closePdf();
  const t = $('#title'); if (t) t.textContent = v === 'archive' && S.chat ? S.chat.title || '지난 대화' : `${VIEWS[v] || ''}${S.project && (v === 'notes') ? ` · ${S.project.title}` : ''}`;
  ({ ask: viewAsk, find: viewFind, read: viewRead, notes: viewNotes, library: viewLibrary, archive: viewArchive }[v] || viewFind)();
  paintSide();
}
const view = () => $('#view');
const redraw = (v) => { if (S.view === v) ({ notes: viewNotes, library: viewLibrary, find: viewFind, ask: viewAsk, archive: viewArchive }[v])(); }; // only if still on screen

/* ---------------- 찾기 ---------------- */
function findStatus() {
  const st = libStats(), t = statusText();
  if (!st.n) return '서재가 비어 있습니다. <button class="linkish" data-act="go" data-v="library">서재</button>에서 PDF 폴더를 고르면 모든 쪽을 찾을 수 있습니다.';
  return `문헌 ${st.ok}개 · ${st.pages.toLocaleString()}쪽에서 찾습니다${t ? ` · <b>${t}</b>` : ''}${st.blank ? ` · 글자 없는 스캔본 ${st.blank}개 제외(<button class="linkish" data-act="go" data-v="library">서재에서 글자 읽기</button>)` : ''}. 띄어쓰기와 조사는 달라도 찾고, <b>"따옴표"</b>로 묶으면 그 표현 그대로, <b>-낱말</b>은 그 낱말이 없는 쪽만 찾습니다.`;
}
function viewFind() {
  const docs = S.docs.filter((d) => d.indexed && !d.blank).sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  view().innerHTML = `<div class="page">
    <div class="find-box">
      <label class="sr" for="q">서재에서 찾기</label><input id="q" type="search" placeholder="서재 전체에서 찾기 · 예: 의회유보 본질성이론" value="${esc(S.q)}" autocomplete="off" enterkeyhint="search">
      <label class="sr" for="q-doc">찾을 문헌</label><select id="q-doc"><option value="">모든 문헌</option>${docs.map((d) => `<option value="${d.id}"${S.qDoc === d.id ? ' selected' : ''}>${esc(d.title)}</option>`).join('')}</select>
    </div>
    <p class="find-meta" id="find-status">${findStatus()}</p>
    <div id="hits"></div></div>`;
  if (S.q) runFind();
  setTimeout(() => { const q = $('#q'); if (q && !S.q && matchMedia('(pointer: fine)').matches) q.focus(); }, 30);
}
function hlTerms(pq) { return [...pq.phrases, ...pq.words].filter((w) => w.length > 1).sort((a, b) => b.length - a.length); }
function highlight(text, terms) { // escape, then mark the query words wherever they occur (case-insensitive)
  let html = esc(text);
  const pats = terms.map((t) => esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean);
  if (!pats.length) return html;
  const re = new RegExp(`(${pats.join('|')})`, 'gi');
  return html.split(/(<[^>]+>)/).map((part) => (part.startsWith('<') ? part : part.replace(re, '<mark>$1</mark>'))).join('');
}
function snippet(text, pq) {
  const flat = text.replace(/\s+/g, ' '), low = flat.toLowerCase();
  let at = -1;
  for (const t of [...pq.phrases, ...pq.words, ...pq.terms]) { const i = low.indexOf(t); if (i >= 0) { at = i; break; } }
  const a = Math.max(0, at - 70), s = flat.slice(a, a + 240);
  return (a ? '…' : '') + s + (a + 240 < flat.length ? '…' : '');
}
let findT = 0, findSeq = 0;
async function runFind() {
  const box = $('#hits'); if (!box) return;
  const seq = ++findSeq;
  const pq = parseQuery(S.q);
  if (!pq.terms.length) { box.innerHTML = ''; return; }
  box.innerHTML = '<p class="sub">찾는 중…</p>';
  const lib = await libLoad();
  if (seq !== findSeq) return;
  const hits = searchLib(lib, pq, 60, S.qDoc);
  if (!hits.length) { box.innerHTML = '<p class="find-none">맞는 쪽이 없습니다. 다른 낱말이나 동의어, 법률명·조문 번호로 찾아 보세요.</p>'; return; }
  const terms = hlTerms(pq);
  const nDocs = new Set(hits.map((h) => h.id)).size;
  S.hits = hits;
  box.innerHTML = `<p class="find-count">${nDocs}개 문헌의 ${hits.length}${hits.length === 60 ? '+' : ''}쪽</p>` + hits.map((h, i) => {
    const d = docOf(h.id), D = lib.docs.find((x) => x.id === h.id);
    const meta = [d.author, d.year].filter(Boolean).join(', ');
    return `<button class="hit" data-act="open-hit" data-i="${i}"><span class="hit-h"><b>${esc(d.title)}</b><span>${pageLabel(d, h.page)}${meta ? ` · ${esc(meta)}` : ''}</span></span><span class="hit-s">${highlight(snippet(D.pages[h.page - 1], pq), terms)}</span></button>`;
  }).join('');
}

/* ---------------- 읽기: the page as printed, or as text to quote from ---------------- */
let PDFDOC = null, renderTask = null;
function closePdf() { if (renderTask) { try { renderTask.cancel(); } catch (e) { /* ignore */ } renderTask = null; } if (PDFDOC) { try { PDFDOC.doc.destroy(); } catch (e) { /* ignore */ } PDFDOC = null; } }
async function pdfDocFor(id) {
  if (PDFDOC && PDFDOC.id === id) return PDFDOC.doc;
  closePdf();
  const d = await DB.get('docs', id); if (!d || !d.bytes) return null;
  const pdfjs = await pdfjsLib();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(d.bytes.slice(0)) }).promise;
  PDFDOC = { id, doc };
  return doc;
}
function openDoc(id, page, terms) { S.reader = { id, page: Math.max(1, page || 1), terms: terms || [], from: S.view === 'read' ? (S.reader && S.reader.from) : S.view }; show('read'); }
async function viewRead() {
  const r = S.reader, d = r && docOf(r.id);
  if (!d) { view().innerHTML = '<div class="page"><p class="find-none">문헌을 찾을 수 없습니다(서재에서 지웠을 수 있습니다).</p></div>'; return; }
  const pg = await docPages(d.id);
  const n = Math.max(1, (pg && pg.pages.length) || d.npages || 1);
  r.page = Math.min(Math.max(1, r.page), n);
  const pdfOk = d.kind === 'pdf' && !d.textOnly;
  const mode = pdfOk ? S.settings.read : 'text';
  const meta = [d.author, d.year, d.venue].filter(Boolean).join(', ');
  const t = $('#title'); if (t) t.textContent = d.title;
  view().innerHTML = `<div class="reader">
    <div class="rd-bar">
      <button class="btn" data-act="rd-back">← ${r.from === 'notes' ? '노트' : r.from === 'library' ? '서재' : '찾기'}</button>
      <div class="rd-t"><b title="${esc(d.title)}">${esc(d.title)}</b><small>${esc(meta || '저자·연도 미입력')} · ${pageLabel(d, r.page)}</small></div>
      <div class="rd-nav"><button class="icon" data-act="rd-prev" aria-label="앞 쪽" ${r.page <= 1 ? 'disabled' : ''}>‹</button><label class="sr" for="rd-pg">쪽</label><input id="rd-pg" inputmode="numeric" value="${r.page}" aria-label="쪽 번호"><span>/ ${n}</span><button class="icon" data-act="rd-next" aria-label="다음 쪽" ${r.page >= n ? 'disabled' : ''}>›</button></div>
      ${pdfOk ? `<div class="seg" role="group" aria-label="보기"><button class="${mode === 'pdf' ? 'on' : ''}" data-act="rd-mode" data-v="pdf">원문</button><button class="${mode === 'text' ? 'on' : ''}" data-act="rd-mode" data-v="text">글자</button></div>` : ''}
    </div>
    <div class="rd-find"><label class="sr" for="rd-q">이 문헌에서 찾기</label><input id="rd-q" type="search" placeholder="이 문헌에서 찾기" autocomplete="off" value="${esc(r.q || '')}"><div id="rd-hits" class="rd-hits"></div></div>
    <div class="rd-body" id="rd-body">${mode === 'pdf' ? '<div class="rd-canvas"><canvas id="rd-canvas" aria-label="원문 쪽"></canvas></div><p class="rd-tip">글을 골라 인용하려면 <b>글자</b> 보기로 바꾸세요.</p>' : `<div class="rd-text" id="rd-text">${pageTextHTML(pg ? pg.pages[r.page - 1] : '', r.terms)}</div><p class="rd-tip">글을 골라 <b>카드에 담기</b>나 <b>인용 복사</b>를 누르세요.</p>`}</div>
    <div class="rd-foot"><button class="btn" data-act="rd-card">이 쪽을 노트에 표시</button><button class="btn" data-act="rd-cite">이 쪽 각주 복사</button>${d.hasFacts || d.digest ? '<button class="btn" data-act="rd-digest">요지</button>' : ''}</div>
  </div>`;
  if (mode === 'pdf') drawPage(d.id, r.page);
  if (r.q) runDocFind();
  const b = $('#rd-body'); if (b) b.scrollTop = 0;
}
function pageTextHTML(text, terms) {
  if (!text || !text.trim()) return '<p class="sub">이 쪽에서는 글자를 추출하지 못했습니다(스캔본일 수 있습니다). 원문 보기로 확인하세요.</p>';
  return text.split(/\n{2,}|\n(?=\s)/).map((p) => `<p>${highlight(p.replace(/\n/g, ' '), terms || [])}</p>`).join('');
}
async function drawPage(id, n) {
  const canvas = $('#rd-canvas'); if (!canvas) return;
  try {
    const doc = await pdfDocFor(id); if (!doc || !$('#rd-canvas')) return;
    const page = await doc.getPage(Math.min(n, doc.numPages));
    const box = canvas.parentElement.clientWidth || 700;
    const v1 = page.getViewport({ scale: 1 });
    const scale = Math.min(2.4, box / v1.width), dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const vp = page.getViewport({ scale: scale * dpr });
    if (renderTask) { try { renderTask.cancel(); } catch (e) { /* ignore */ } }
    canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
    canvas.style.width = `${Math.floor(vp.width / dpr)}px`; canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
    renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
    await renderTask.promise; renderTask = null;
  } catch (e) { if (!e || e.name !== 'RenderingCancelledException') { const b = $('#rd-body'); if (b && $('#rd-canvas')) b.insertAdjacentHTML('afterbegin', '<p class="sub">원문을 그리지 못했습니다. 글자 보기로 확인하세요.</p>'); } }
}
function goPage(n) { const r = S.reader; if (!r) return; r.page = n; viewRead(); }
let docFindT = 0;
async function runDocFind() {
  const r = S.reader, box = $('#rd-hits'); if (!r || !box) return;
  const pq = parseQuery(r.q || '');
  if (!pq.terms.length) { box.innerHTML = ''; return; }
  const lib = await libLoad();
  const hits = searchLib(lib, pq, 30, r.id).sort((a, b) => a.page - b.page);
  box.innerHTML = hits.length ? hits.map((h) => `<button class="pg-chip${h.page === r.page ? ' on' : ''}" data-act="rd-go" data-p="${h.page}">${h.page}</button>`).join('') : '<span class="sub">이 문헌에는 맞는 쪽이 없습니다.</span>';
}
/* the selection toolbar: what is selected in the page text becomes a card or a quotation with its footnote */
function readerSelection() {
  const sel = window.getSelection(), box = $('#rd-text');
  if (!sel || sel.isCollapsed || !box || !box.contains(sel.anchorNode) || !box.contains(sel.focusNode)) return null;
  const text = sel.toString().replace(/\s+/g, ' ').trim();
  return text.length >= 2 ? { text, rect: sel.getRangeAt(0).getBoundingClientRect() } : null;
}
function selTool(s) {
  let t = $('#seltool');
  if (!s) { if (t) t.remove(); return; }
  if (!t) { t = document.createElement('div'); t.id = 'seltool'; t.className = 'seltool'; t.innerHTML = '<button data-act="sel-card">카드에 담기</button><button data-act="sel-cite">인용 복사</button>'; document.body.appendChild(t); }
  const below = s.rect.bottom + 10 + 44 < window.innerHeight;
  t.style.top = `${Math.round(below ? s.rect.bottom + 10 : Math.max(8, s.rect.top - 52))}px`;
  t.style.left = `${Math.round(Math.min(window.innerWidth - 220, Math.max(8, s.rect.left + s.rect.width / 2 - 105)))}px`;
  t.dataset.text = s.text;
}
async function copyText(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); } catch (e) { prompt('아래 내용을 복사하세요', text); }
}
async function addCard(quote, docId, page) {
  if (!S.project) return;
  const order = Math.max(0, ...S.cards.filter((c) => c.projectId === S.project.id).map((c) => c.order || 0)) + 1;
  const c = { id: uid(), projectId: S.project.id, docId: docId || null, page: page || 0, quote: quote || '', memo: '', order, createdAt: Date.now() };
  S.cards.push(c); await saveCard(c); paintSide();
  toast(`‘${S.project.title}’ 노트에 담았습니다.`);
  return c;
}

/* ---------------- 노트: quotations and thoughts per project, out to Word with footnotes ---------------- */
const projectCards = () => S.cards.filter((c) => c.projectId === (S.project && S.project.id)).sort((a, b) => (a.order || 0) - (b.order || 0));
function viewNotes() {
  const p = S.project; if (!p) return;
  const cards = projectCards();
  const f = (k, label, rows) => `<label class="field"><span>${label}</span><textarea data-pf="${k}" rows="${rows || 2}">${esc(p[k] || '')}</textarea></label>`;
  view().innerHTML = `<div class="page">
    <div class="notes-head"><h1>${esc(p.title)}</h1>
      <div class="tools"><button class="btn" data-act="card-new">${IC.plus} 메모 카드</button><button class="btn primary" data-act="notes-docx">Word로 저장</button><button class="btn" data-act="notes-md">마크다운</button></div></div>
    <details class="proj"${p.question || p.concepts || p.decided || p.open || p.notes || p.style ? '' : ' open'}><summary>연구 프로젝트 메모</summary>
      <label class="field"><span>프로젝트 이름</span><input data-pf="title" value="${esc(p.title)}"></label>
      ${f('question', '연구문제', 3)}${f('concepts', '핵심 개념 정의', 3)}${f('decided', '확정한 사항', 3)}${f('open', '미결 쟁점', 3)}${f('notes', '메모', 3)}${f('style', '문체 메모', 2)}
      <button class="btn danger" data-act="del-project">이 프로젝트 지우기</button></details>
    <div class="cards">${cards.map(cardHTML).join('') || '<p class="find-none">아직 카드가 없습니다. <b>찾기</b>에서 쪽을 열고, 글을 골라 <b>카드에 담기</b>를 누르면 여기에 쪽수와 함께 모입니다.</p>'}</div></div>`;
}
function cardHTML(c, i) {
  const d = c.docId ? docOf(c.docId) : null;
  return `<article class="card" data-id="${c.id}">
    ${c.quote ? `<blockquote>“${esc(c.quote)}”</blockquote>` : ''}
    ${c.docId ? `<div class="src">${esc(footnote(d, c.page))}${d ? ` <button class="linkish" data-act="card-open">원문 ${c.page}쪽</button>` : ''}</div>` : ''}
    <label class="sr" for="memo-${c.id}">메모</label><textarea id="memo-${c.id}" data-card-memo="${c.id}" rows="2" placeholder="${c.docId ? '이 인용에 대한 내 생각' : '메모'}">${esc(c.memo || '')}</textarea>
    <div class="card-tools"><span class="n">${i + 1}</span><button data-act="card-up" title="위로" aria-label="위로">↑</button><button data-act="card-down" title="아래로" aria-label="아래로">↓</button>${c.docId ? '<button data-act="card-cite">인용 복사</button>' : ''}<button data-act="card-del" class="del">지우기</button></div>
  </article>`;
}
function citeText(quote, d, page) { return `${quote ? `“${quote}”\n` : ''}${footnote(d, page)}`; }
function notesExport(kind) {
  const p = S.project, cards = projectCards();
  if (!cards.length && !p.question) { toast('저장할 노트가 없습니다.'); return; }
  const memoMd = [['연구문제', p.question], ['핵심 개념 정의', p.concepts], ['확정한 사항', p.decided], ['미결 쟁점', p.open], ['메모', p.notes]].filter(([, v]) => v && v.trim()).map(([k, v]) => `**${k}**\n\n${v.trim()}`).join('\n\n');
  const name = `${(p.title || '요AI 노트').replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 50) || '요AI 노트'}`;
  if (kind === 'md') {
    let out = `# ${p.title}\n\n${memoMd ? memoMd + '\n\n' : ''}`;
    cards.forEach((c) => { const d = c.docId ? docOf(c.docId) : null; if (c.quote) out += `> ${c.quote}\n\n`; if (c.docId) out += `— ${footnote(d, c.page)}\n\n`; if (c.memo) out += `${c.memo}\n\n`; out += '---\n\n'; });
    download(`${name}.md`, out, 'text/markdown;charset=utf-8'); return;
  }
  const sections = [];
  if (memoMd) sections.push({ heading: '연구 프로젝트 메모', md: memoMd, notes: [] });
  cards.forEach((c, i) => {
    const d = c.docId ? docOf(c.docId) : null, note = c.docId ? footnote(d, c.page) : null;
    let md = '';
    if (c.quote) md += `> ${c.quote.replace(/\s+/g, ' ')}${note ? '〔c1〕' : ''}\n\n`;
    if (c.memo && c.memo.trim()) md += c.memo.trim() + (note && !c.quote ? '〔c1〕' : '');
    else if (note && !c.quote) md += `(${d ? d.title : '문헌'} ${c.page}쪽)〔c1〕`;
    sections.push({ heading: i === 0 ? '모은 인용과 메모' : null, md, notes: note ? [note] : [] });
  });
  const bytes = buildDocx({ title: p.title, subtitle: `${kdate()} · 요AI 연구 노트`, sections });
  download(`${name}.docx`, bytes, DOCX_MIME);
}

/* ---------------- 서재 ---------------- */
function libStatusHTML() {
  const st = libStats(), f = S.folder, t = statusText();
  const folder = f ? `<b>${esc(f.name)}</b> · ${f.perm === 'granted' ? '연결됨(열 때마다 다시 읽음)' : f.perm === 'prompt' ? '‘다시 읽기’를 누르면 바뀐 내용을 맞춥니다' : '이번에 읽음(폴더가 바뀌면 다시 골라 주세요)'}`
    : S.settings.folderName ? `<b>${esc(S.settings.folderName)}</b> · 바뀐 내용을 맞추려면 폴더를 다시 고르세요` : '아직 없음';
  return `<div class="lib-line">연결된 폴더: ${folder}${S.settings.folderAt ? ` · 마지막 확인 ${new Date(S.settings.folderAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}</div>
    <div class="lib-line">문헌 ${st.n}개${st.ok ? ` · ${st.pages.toLocaleString()}쪽 · 본문 ${st.chars >= 10000 ? `약 ${Math.round(st.chars / 10000).toLocaleString()}만` : st.chars.toLocaleString()}자` : ''} · ${fmtSize(st.size)}${t ? ` · <b>${t}</b>` : ''}</div>
    ${OCR.run ? `<div class="lib-line"><b>스캔본 글자 읽는 중</b> ${OCR.done}/${OCR.total} · 「${esc(OCR.doc)}」 ${esc(OCR.page)} <button class="btn" data-act="ocr-stop">멈추기</button></div>`
      : scanned().length ? `<div class="lib-line warn">글자가 없는 스캔본 ${scanned().length}개는 아직 찾기와 묻기에서 빠집니다. <button class="btn primary" data-act="ocr-all">글자 읽기(OCR)</button></div><div class="lib-line">글자 읽기는 이 컴퓨터 안에서 쪽마다 몇 초씩 걸립니다(인터넷 필요 없음). 켜 두고 다른 일을 하세요.</div>` : ''}
    <div class="lib-line" id="store-line"></div>`;
}
async function paintStore() {
  const el = $('#store-line'); if (!el || !navigator.storage || !navigator.storage.estimate) return;
  try {
    const e = await navigator.storage.estimate(), kept = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    el.innerHTML = `이 컴퓨터의 저장 공간: ${fmtSize(e.usage || 0)} 사용${e.quota ? ` / ${fmtSize(e.quota)} 가능` : ''} · ${kept ? '브라우저가 임의로 지우지 않도록 보호됨' : '<button class="linkish" data-act="persist">브라우저가 임의로 지우지 않게 보호하기</button>'}`;
  } catch (err) { /* not available */ }
}
function viewLibrary() {
  const rows = S.docs.slice().sort((a, b) => b.addedAt - a.addedAt).map((d) => `<div class="doc-row" data-id="${d.id}">
      <div><button class="doc-open" data-act="doc-open" title="${esc(d.title)}">${esc(d.title)}</button><div class="m">${esc([d.author, d.year, d.venue].filter(Boolean).join(', ') || '저자·연도 미입력')} · ${d.kind === 'pdf' ? `PDF${d.npages ? ` ${d.npages}쪽` : ''}` : '텍스트'} · ${fmtSize(d.size || 0)}${+d.page1 > 1 ? ` · ${d.page1}면부터` : ''}${d.blank ? (d.kind === 'pdf' && !d.textOnly ? ' · <b class="warn">스캔본</b> <button class="linkish" data-act="ocr-one">글자 읽기</button>' : ' · <b class="warn">글자 없음</b>') : !d.indexed ? ' · 읽는 중' : d.ocr ? ' · 글자 인식함' : ''}${d.folder ? ` · <span title="${esc(d.folder)}">폴더</span>` : ''}${d.hasFacts || d.digest ? ' · <button class="linkish" data-act="dig-show">요지</button>' : ''}</div></div>
      <div class="doc-tools"><button class="btn" data-act="doc-edit">정보</button><button class="btn danger" data-act="doc-del">지우기</button></div></div>`).join('');
  view().innerHTML = `<div class="page">
    <div class="notes-head"><h1>서재</h1></div>
    <div class="lib-box">
      <div class="lib-head"><b>폴더 통째로 넣기</b><span><button class="btn primary" data-act="folder">${S.folder || S.settings.folderName ? '다른 폴더 고르기' : '폴더 고르기'}</button><button class="btn" data-act="folder-sync" ${S.folder && S.folder.handle ? '' : 'hidden'}>다시 읽기</button></span></div>
      <p class="sub">폴더(하위 폴더 포함) 안의 PDF·텍스트를 모두 넣고 모든 쪽의 글자를 읽어 둡니다. 문헌은 이 컴퓨터 안에만 있으며 어디로도 보내지 않습니다.</p>
      <div id="lib-status">${libStatusHTML()}</div>
      <input type="file" id="folder-in" webkitdirectory multiple class="sr">
    </div>
    <div class="lib-box"><div class="lib-head"><b>AI 숙지</b><span class="ai-mini">AI: ${esc(aiLabel())} <button class="btn" data-act="ai-setup">AI 준비</button></span></div>
      <p class="sub">문헌을 넣으면 AI 없이 곧바로 숙지합니다. 문헌마다 목차·초록·주제어·결론의 첫머리·다룬 법령과 조문·인용 판례의 사건번호를 원문에서 그대로 뽑아 둡니다. 수백 편도 몇 초면 끝나고, 묻기에서는 이 개요와 관련 쪽을 함께 읽고 답합니다. AI가 직접 쓰는 요지가 필요하면 문헌의 <b>요지</b> 창에서 그 문헌만 쓰게 하세요.</p>
      <div id="dig-status">${digestStatusHTML()}</div></div>
    <label class="drop" id="drop">파일 몇 개만 넣으려면 여기에 끌어 놓거나 <u>눌러서 고르세요</u><input type="file" id="files" accept=".pdf,.txt,.md,application/pdf,text/plain" multiple class="sr"></label>
    <p class="sub">각 문헌의 <b>정보</b>에 저자·연도·학술지를 적으면 각주가 그대로 만들어지고, 학술지 논문의 <b>첫 쪽 번호</b>를 적으면 학술지 쪽수(○면)로 인용됩니다.</p>
    <div class="doc-list">${rows || '<p class="find-none">아직 문헌이 없습니다.</p>'}</div></div>`;
  paintStore();
}
async function editDoc(id) {
  const d = docOf(id); if (!d) return;
  const v = await formBox('문헌 정보', [{ label: '제목', value: d.title }, { label: '저자', value: d.author }, { label: '연도', value: d.year }, { label: '학술지·출판사 (예: 「공법연구」 제50집 제1호)', value: d.venue }, { label: '첫 쪽 번호 (학술지 논문의 인쇄된 첫 쪽, 없으면 비워 두기)', value: d.page1 }]);
  if (!v) return;
  const full = await DB.get('docs', id); if (!full) return;
  [full.title, full.author, full.year, full.venue] = v.slice(0, 4).map((x) => x.trim());
  full.page1 = /^\d+$/.test(v[4].trim()) ? v[4].trim() : '';
  if (!full.title) full.title = d.title;
  await DB.put('docs', full); Object.assign(d, docMeta(full)); redraw('library');
}

/* ---------------- 지난 대화: earlier AI conversations, kept readable ---------------- */
function archParts(m) {
  let md = ''; const cites = [];
  for (const b of m.content || []) {
    if (b.type !== 'text') continue;
    md += b.text;
    if (b.citations && b.citations.length) {
      const nums = [];
      for (const c of b.citations) {
        const k = c.url || c.source || `${c.document_index}|${c.document_title}|${c.start_page_number ?? c.start_block_index ?? ''}`;
        let i = cites.findIndex((x) => x.k === k); if (i < 0) { cites.push({ k, c }); i = cites.length - 1; }
        if (!nums.includes(i + 1)) nums.push(i + 1);
      }
      md += nums.map((n) => `〔c${n}〕`).join('');
    }
  }
  return { md, cites: cites.map((x) => x.c) };
}
function archWhere(c, m) {
  const lib = c.type === 'search_result_location' && /^yoai-lib:([^:]+):(\d+)$/.exec(c.source || '');
  if (lib) return { doc: docOf(lib[1]), a: +lib[2] };
  const id = m && m.docIds ? m.docIds[c.document_index] : null;
  const doc = (id && docOf(id)) || S.docs.find((x) => x.title === c.document_title) || null;
  const a = c.type === 'content_block_location' ? (c.start_block_index | 0) + 1 : c.start_page_number || 0;
  return { doc, a, title: c.document_title };
}
function archNote(c, m) {
  if (c.url) return `“${c.title || c.url}”, ${c.url} (최종 확인: ${kdate(m.at)}).`;
  const w = archWhere(c, m);
  return w.doc ? footnote(w.doc, w.a) : `“${w.title || '문헌'}”${w.a ? `, ${w.a}쪽` : ''}.`;
}
function viewArchive() {
  const chats = S.chats.filter((x) => !x.local).sort((a, b) => b.updatedAt - a.updatedAt);
  const c = S.chat && !S.chat.local && S.chats.includes(S.chat) ? S.chat : null;
  if (!c) {
    view().innerHTML = `<div class="page"><div class="notes-head"><h1>지난 대화</h1></div><p class="sub">예전에 AI와 나눈 대화입니다. 읽기와 Word·마크다운 저장, 지우기만 됩니다.</p>
      <div class="doc-list">${chats.map((x) => { const p = S.projects.find((q) => q.id === x.projectId); return `<div class="doc-row"><div><button class="doc-open" data-act="arch-open" data-id="${x.id}">${esc(x.title || '대화')}</button><div class="m">${esc(p ? p.title : '')} · ${kdate(x.updatedAt)} · 질문 ${x.messages.filter((m) => m.role === 'user').length}개</div></div></div>`; }).join('') || '<p class="find-none">지난 대화가 없습니다.</p>'}</div></div>`;
    return;
  }
  const html = c.messages.map((m) => {
    if (m.role === 'user') return `<div class="msg user"><div class="bubble">${esc(m.text)}</div></div>`;
    const p = archParts(m); if (!p.md.trim()) return '';
    let body = renderMarkdown(p.md).replace(/〔c(\d+)〕/g, (_, n) => `<sup class="cite">${n}</sup>`);
    return `<div class="msg ai"><div class="answer">${body}</div>${p.cites.length ? `<div class="sources"><b>출처</b><ol>${p.cites.map((x) => `<li>${esc(archNote(x, m))}</li>`).join('')}</ol></div>` : ''}</div>`;
  }).join('');
  view().innerHTML = `<div class="page"><div class="notes-head"><button class="btn" data-act="arch-list">← 목록</button><div class="tools"><button class="btn" data-act="arch-docx">Word로 저장</button><button class="btn" data-act="arch-md">마크다운</button><button class="btn danger" data-act="arch-del">지우기</button></div></div><div class="thread-in arch">${html}</div></div>`;
}
function archExport(kind) {
  const c = S.chat; if (!c) return;
  const name = `${(c.title || '대화').replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 50) || '대화'}`;
  if (kind === 'md') {
    let out = `# ${c.title}\n\n`;
    for (const m of c.messages) {
      if (m.role === 'user') out += `## 질문\n\n${m.text}\n\n`;
      else { const p = archParts(m); if (!p.md.trim()) continue; out += `## 답변\n\n${p.md.replace(/〔c(\d+)〕/g, '[$1]')}\n\n`; if (p.cites.length) out += p.cites.map((x, i) => `${i + 1}. ${archNote(x, m)}`).join('\n') + '\n\n'; }
    }
    download(`${name}.md`, out, 'text/markdown;charset=utf-8'); return;
  }
  const sections = []; let q = '', k = 0;
  for (const m of c.messages) {
    if (m.role === 'user') { q = m.text; continue; }
    const p = archParts(m); if (!p.md.trim()) continue;
    k++; sections.push({ heading: `질문 ${k}`, question: q, md: p.md.replace(/\s*\[(첨부 문헌|검색 확인|일반 법리|추론|검증 필요)\]/g, ''), notes: p.cites.map((x) => archNote(x, m)) });
  }
  if (!sections.length) { toast('저장할 답변이 없습니다.'); return; }
  download(`${name}.docx`, buildDocx({ title: c.title || '대화', subtitle: `${kdate(c.updatedAt)} · 요AI 지난 대화`, sections }), DOCX_MIME);
}

/* ---------------- 오프라인 AI: 준비 ---------------- */
const aiLabel = () => { const st = AI.state; return st.status === 'ready' ? `${st.name} · ${st.backend === 'ollama' ? 'Ollama' : st.backend === 'fake' ? '시험용' : '브라우저 안'}` : st.status === 'loading' ? `불러오는 중 ${st.progress}%` : st.status === 'error' ? '불러오지 못함' : '준비 안 됨'; };
AI.on(() => { const b = $('#ai-bar'); if (b) b.innerHTML = aiBarHTML(); const p = $('#ai-progress'); if (p) p.innerHTML = aiProgressHTML(); });
function aiBarHTML() {
  const st = AI.state;
  return `<span class="ai-dot ${st.status}"></span><span>AI: <b>${esc(aiLabel())}</b>${st.status === 'ready' ? ` · 한 번에 약 ${Math.round(st.ctx / 1000)}천 토큰` : ''}</span>${st.status === 'loading' ? `<span class="bar"><i style="width:${st.progress}%"></i></span>` : ''}<button class="btn" data-act="ai-setup">${st.status === 'ready' ? '바꾸기' : 'AI 준비'}</button>`;
}
function aiProgressHTML() { const st = AI.state; return st.status === 'loading' ? `<div class="bar"><i style="width:${st.progress}%"></i></div><p class="sub">${esc(st.text || '')}</p>` : st.status === 'error' ? `<p class="lib-line warn">${esc(st.text)}</p>` : ''; }
/* bring back the AI chosen last time (from this computer's storage; only the first download needs the internet) */
async function ensureAI() {
  if (AI.ready()) return true;
  if (AI.state.status === 'loading') { await new Promise((res) => { const off = AI.on((st) => { if (st.status !== 'loading') { off(); res(); } }); }); return AI.ready(); }
  const c = S.settings.ai;
  if (!c) return false;
  if (c.backend === 'fake' && AI.fake) { AI.useFake(); return true; }
  if (c.backend === 'ollama') { try { const ms = await AI.ollamaModels(); const hit = ms.find((m) => m.name === c.model); if (hit) return AI.useOllama(c.model, hit.size); } catch (e) { /* not running */ } toast('Ollama에 연결하지 못했습니다. Ollama를 실행했는지 확인하세요.'); return false; }
  if (c.backend === 'web') {
    if (!navigator.onLine && !(await AI.webCached(c.model, c.f16))) { toast('AI 모델을 아직 내려받지 않았습니다. 인터넷에 연결된 상태에서 한 번 내려받아 주세요.'); return false; }
    return AI.loadWeb(c.model, c.f16);
  }
  return false;
}
async function openAISetup() {
  const sup = await AI.webSupport();
  const cached = {};
  if (sup.ok) for (const m of WEB_MODELS) cached[m.id] = await AI.webCached(m.id, sup.f16);
  const cur = S.settings.ai || {};
  const rows = sup.ok ? WEB_MODELS.map((m) => `<div class="ai-model${cur.backend === 'web' && cur.model === m.id ? ' on' : ''}"><div><b>${m.name}</b>${m.id === sup.rec ? ' <span class="tag">이 컴퓨터에 권장</span>' : ''}<div class="m">${m.note} · 그래픽 메모리 약 ${(m.vram / 1024).toFixed(1)}GB${cached[m.id] ? ' · <b>내려받음</b>' : ''}</div></div>
      <span><button class="btn${cached[m.id] ? '' : ' primary'}" data-ai-web="${m.id}">${cached[m.id] ? '쓰기' : '내려받아 쓰기'}</button>${cached[m.id] ? `<button class="btn danger" data-ai-del="${m.id}" title="이 컴퓨터에서 지우기">지우기</button>` : ''}</span></div>`).join('')
    : `<p class="lib-line warn">${esc(sup.reason)}</p>`;
  const m = modal(`<h2>AI 준비</h2>
    <p class="sub">AI는 이 컴퓨터 안에서만 돌아갑니다. 서재 문헌과 질문은 어디로도 보내지 않습니다. 모델은 처음 한 번만 인터넷으로 내려받고, 그 뒤로는 인터넷 없이 씁니다.</p>
    <h3 class="mh">브라우저 안에서 (설치 없음)</h3>
    <div class="ai-models">${rows}</div>
    <div id="ai-progress">${aiProgressHTML()}</div>
    <h3 class="mh">Ollama로 (더 큰 모델)</h3>
    <p class="sub">컴퓨터에 <b>Ollama</b>(ollama.com, 무료)를 설치하면 한국어에 강한 더 큰 모델(예: LG <b>EXAONE 3.5</b>)을 쓸 수 있습니다. <button class="linkish" data-ai-howto>설치 방법</button></p>
    <div id="ollama-box"><button class="btn" data-ai-ollama>Ollama 연결 확인</button></div>
    <div class="modal-foot"><button class="btn" data-close>닫기</button></div>`);
  m.el.addEventListener('click', async (e) => {
    const w = e.target.closest('[data-ai-web]'), del = e.target.closest('[data-ai-del]'), ol = e.target.closest('[data-ai-ollama]'), use = e.target.closest('[data-ai-use]'), how = e.target.closest('[data-ai-howto]');
    if (w) {
      const id = w.dataset.aiWeb;
      if (!cached[id] && !navigator.onLine) { toast('처음 내려받을 때는 인터넷 연결이 필요합니다.'); return; }
      if (navigator.storage && navigator.storage.persist) { try { await navigator.storage.persist(); } catch (err) { /* ignore */ } }
      S.settings.ai = { backend: 'web', model: id, f16: sup.f16 }; saveSettings();
      $$('button', m.el).forEach((b) => { b.disabled = true; });
      const ok = await AI.loadWeb(id, sup.f16);
      $$('button', m.el).forEach((b) => { b.disabled = false; });
      if (ok) { toast(`${AI.state.name}을(를) 준비했습니다.`); m.close(); if (S.view === 'ask') viewAsk(); }
    } else if (del) {
      if (!(await confirmBox('이 모델을 이 컴퓨터에서 지울까요? 다시 쓰려면 다시 내려받아야 합니다.', '지우기'))) return;
      if (AI.state.backend === 'web' && AI.state.model === del.dataset.aiDel) await AI.unload();
      try { await AI.deleteWeb(del.dataset.aiDel, sup.f16); toast('지웠습니다.'); } catch (err) { toast('지우지 못했습니다: ' + err.message); }
      m.close(); openAISetup();
    } else if (ol) {
      const box = $('#ollama-box', m.el); box.innerHTML = '<p class="sub">확인하는 중…</p>';
      try {
        const ms = await AI.ollamaModels();
        box.innerHTML = ms.length ? `<div class="ai-models">${ms.map((x) => `<div class="ai-model"><div><b>${esc(x.name)}</b><div class="m">${x.size ? (x.size / 1073741824).toFixed(1) + 'GB' : ''}</div></div><span><button class="btn primary" data-ai-use="${esc(x.name)}" data-ai-size="${x.size || 0}">쓰기</button></span></div>`).join('')}</div>`
          : '<p class="sub">Ollama는 연결됐지만 내려받은 모델이 없습니다. 명령 프롬프트(Windows)나 터미널(Mac)에서 <code>ollama pull exaone3.5:7.8b</code>를 실행한 뒤 다시 확인하세요.</p>';
      } catch (err) { box.innerHTML = `<p class="lib-line warn">Ollama에 연결하지 못했습니다. Ollama가 켜져 있는지, 아래 2~3단계를 마쳤는지 확인하세요.</p>${ollamaHowto(sup.ok)}`; }
    } else if (use) {
      await AI.useOllama(use.dataset.aiUse, Number(use.dataset.aiSize) || 0); S.settings.ai = { backend: 'ollama', model: use.dataset.aiUse }; saveSettings(); toast(`${use.dataset.aiUse}을(를) 씁니다.`); m.close(); if (S.view === 'ask') viewAsk();
    } else if (how) { const box = $('#ollama-box', m.el); if (!box.querySelector('.howto')) box.insertAdjacentHTML('beforeend', ollamaHowto(sup.ok)); }
    const cp = e.target.closest('[data-copy]');
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast('복사했습니다. 창에 붙여 넣으세요.'); } catch (err) { toast('복사하지 못했습니다. 글자를 직접 골라 복사하세요.'); } }
  });
}
function ollamaHowto(webOk = true) {
  /* plain steps for the computer in front of the reader first; the other kind folded below */
  const cmd = (c) => `<span class="cmd"><code>${esc(c)}</code><button class="btn" data-copy="${esc(c)}">복사</button></span>`;
  const win = `<ol class="howto">
    <li><b>ollama.com</b>에 들어가 <b>Windows용</b> Ollama를 내려받아 설치합니다.</li>
    <li>화면 왼쪽 아래 <b>시작</b> 단추를 누르고 ‘명령 프롬프트’를 검색해 엽니다. 검은 창에 아래 두 줄을 한 줄씩 붙여 넣고 Enter를 누릅니다.
      ${cmd('setx OLLAMA_ORIGINS "https://0128.kr"')}
      ${cmd('ollama pull exaone3.5:7.8b')}
      첫째 줄은 Ollama에 ‘0128.kr은 연결해도 된다’고 알려 줍니다. 둘째 줄은 모델(약 5GB)을 내려받습니다. 다 받을 때까지 창을 닫지 마세요.</li>
    <li>화면 오른쪽 아래(시계 옆) Ollama 아이콘을 오른쪽 단추로 눌러 <b>Quit Ollama</b>를 고릅니다. 그다음 시작 메뉴에서 Ollama를 다시 실행합니다. 설정은 Ollama를 다시 켜야 적용됩니다.</li>
    <li>이 창에서 <b>Ollama 연결 확인</b>을 누릅니다. 브라우저가 ‘로컬 네트워크의 기기에 접근’을 허용할지 물으면 <b>허용</b>을 누릅니다. 그래도 안 되면 컴퓨터를 한 번 다시 켠 뒤 Ollama를 실행하고 다시 확인합니다.</li></ol>`;
  const mac = `<ol class="howto">
    <li><b>ollama.com</b>에 들어가 <b>Mac용</b> Ollama를 내려받아 설치하고 실행합니다.</li>
    <li><b>응용 프로그램 › 유틸리티 › 터미널</b>을 엽니다. 아래 두 줄을 한 줄씩 붙여 넣고 return을 누릅니다.
      ${cmd('launchctl setenv OLLAMA_ORIGINS "https://0128.kr"')}
      ${cmd('ollama pull exaone3.5:7.8b')}
      첫째 줄은 Ollama에 ‘0128.kr은 연결해도 된다’고 알려 줍니다. 둘째 줄은 모델(약 5GB)을 내려받습니다.</li>
    <li>화면 오른쪽 위 메뉴 막대의 Ollama 아이콘을 눌러 <b>Quit Ollama</b>를 고른 뒤, Ollama를 다시 실행합니다. 설정은 Ollama를 다시 켜야 적용됩니다.</li>
    <li>이 창에서 <b>Ollama 연결 확인</b>을 누릅니다. 브라우저가 ‘로컬 네트워크의 기기에 접근’을 허용할지 물으면 <b>허용</b>을 누릅니다.</li>
    <li>Mac을 껐다 켜면 첫째 줄 설정이 풀립니다. 그때는 터미널에서 첫째 줄만 다시 넣고 Ollama를 다시 실행합니다.</li></ol>`;
  const isMac = /Mac/i.test(navigator.platform || navigator.userAgent);
  const [first, firstName, other, otherName] = isMac ? [mac, 'Mac', win, 'Windows'] : [win, 'Windows', mac, 'Mac'];
  return `<div class="howto-box">
    <p class="sub">${webOk ? '<b>Ollama는 꼭 필요하지 않습니다.</b> 위의 ‘브라우저 안에서’ 모델은 설치 없이 바로 쓸 수 있습니다. Ollama는 더 큰 모델을 쓰고 싶을 때만 설치합니다.' : '<b>이 컴퓨터에서는 ‘브라우저 안에서’ 방식을 쓸 수 없어서 Ollama가 필요합니다.</b> 한 번만 설정하면 됩니다.'}</p>
    <p class="sub">Ollama는 보안을 위해 웹페이지가 연결하는 것을 기본으로 막아 둡니다. 아래 순서대로 하면 이 페이지(0128.kr)만 연결할 수 있게 됩니다.</p>
    <p class="sub"><b>${firstName} 컴퓨터</b></p>${first}
    <details><summary>${otherName} 컴퓨터라면</summary>${other}</details>
    <p class="sub">더 큰 <code>exaone3.5:32b</code>(약 19GB)는 그래픽 카드 메모리(VRAM)가 24GB 이상인 컴퓨터에서만 권합니다. 그보다 작으면 CPU로 돌아 컴퓨터 전체가 느려지고, 숙지도 몇 배 오래 걸립니다. 대부분의 컴퓨터에는 <code>exaone3.5:7.8b</code>가 알맞습니다.</p></div>`;
}

/* ---------------- 숙지: the AI reads each document once and keeps a structured digest ----------------
   빠르게(기본): what a reader looks at first — 목차, 초록, 서론, 결론 — in one reading per document.
   꼼꼼히: the whole text part by part, then the parts combined (many readings; long for a book or a dissertation).
   The digest helps the AI see each document whole when it answers; quotations and page numbers always come from the pages themselves. */
const DIG = { run: false, stop: false, done: 0, total: 0, doc: '', part: '', since: 0, times: [], warn: '', mode: '' };
const charBudget = (ctx, reserve) => Math.max(1500, Math.floor((ctx - reserve) * 1.2));
const digMode = () => (S.settings.digMode === 'full' ? 'full' : 'quick');
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분${s % 60 ? ` ${s % 60}초` : ''}`; };
function digestStatusHTML() {
  const ok = S.docs.filter((d) => d.indexed && !d.blank), known = ok.filter((d) => d.hasFacts).length, dug = ok.filter((d) => d.digest).length;
  const warn = DIG.warn ? `<p class="lib-line warn">${esc(DIG.warn)}</p>` : '';
  if (DIG.run) {
    const avg = DIG.times.length ? DIG.times.reduce((a, b) => a + b, 0) / DIG.times.length : 0;
    const eta = avg ? ` · 한 편에 약 ${mmss(avg)}, 남은 시간 약 ${mmss(avg * (DIG.total - DIG.done))}` : '';
    return `<b>AI 요지 쓰는 중</b> ${DIG.done}/${DIG.total} · 「${esc(DIG.doc)}」 ${esc(DIG.part)} <span id="dig-clock">${DIG.since ? mmss(Date.now() - DIG.since) + '째' : ''}</span>${eta} <button class="btn" data-act="dig-stop">멈추기</button>${warn}`;
  }
  if (!ok.length) return '숙지할 문헌이 아직 없습니다.';
  return `문헌 ${ok.length}개 가운데 <b>${known}개</b>를 숙지했습니다${known < ok.length ? '(나머지는 읽는 중)' : ''}. 문헌의 <b>요지</b>를 누르면 목차·초록·결론·법령·판례가 보입니다.${dug ? ` AI 요지를 쓴 문헌은 ${dug}개입니다.` : ''}${warn}`;
}
let digClock = null;
async function digestAll(opts = {}) {
  if (DIG.run) return;
  if (!(await ensureAI())) { openAISetup(); return; }
  if (S.indexing || S.docs.some((d) => !d.indexed)) await indexLibrary();
  const todo = (opts.ids ? opts.ids.map(docOf).filter(Boolean) : S.docs.filter((d) => d.indexed && !d.blank && !d.digest).sort((a, b) => a.addedAt - b.addedAt));
  if (!todo.length) { toast('모든 문헌을 숙지했습니다.'); return; }
  Object.assign(DIG, { run: true, stop: false, done: 0, total: todo.length, doc: '', part: '', since: 0, times: [], warn: '', mode: opts.mode || digMode() }); paintStatus();
  digClock = setInterval(() => { const c = $('#dig-clock'); if (c && DIG.since) c.textContent = mmss(Date.now() - DIG.since) + '째'; }, 1000);
  try {
    for (const d of todo) {
      if (DIG.stop) break;
      DIG.doc = d.title; DIG.part = ''; paintStatus();
      const t0 = Date.now();
      try { await digestDoc(d, DIG.mode); DIG.times.push(Date.now() - t0); } catch (e) { if (DIG.stop) break; toast(`「${d.title}」을(를) 숙지하지 못했습니다: ${e.message}`); }
      DIG.done++; paintStatus();
    }
  } finally {
    clearInterval(digClock);
    const stopped = DIG.stop; Object.assign(DIG, { run: false, stop: false, doc: '', part: '', since: 0 }); paintStatus(); redraw('library'); redraw('ask');
    toast(stopped ? '숙지를 멈췄습니다. 다시 누르면 이어서 합니다.' : '숙지를 마쳤습니다.');
  }
}
/* one reading, shown as it goes: the model first reads (no words yet), then writes */
async function digestCall(messages, o, label) {
  DIG.part = `${label} · 읽는 중`; DIG.since = Date.now(); paintStatus();
  let out = '', last = 0, wrote = false;
  for await (const piece of AI.stream(messages, o)) {
    out += piece;
    if (!wrote || Date.now() - last > 500) { wrote = true; last = Date.now(); DIG.part = `${label} · 쓰는 중 ${out.length}자`; paintStatus(); }
  }
  if (DIG.stop) throw new Error('멈춤');
  if (AI.state.backend === 'ollama' && !DIG.warn) {
    const l = await AI.ollamaLoad();
    if (l && l.size && l.vram < l.size * 0.9) DIG.warn = `${AI.state.name}의 ${Math.round((1 - l.vram / l.size) * 100)}%가 그래픽 메모리에 들어가지 않아 CPU로 돌고 있습니다. 그래서 컴퓨터가 느려지고 숙지도 오래 걸립니다. AI 준비에서 더 작은 모델(예: exaone3.5:7.8b)로 바꾸면 훨씬 빨라집니다.`;
  }
  return stripThink(out);
}
/* the parts a reader looks at first, cut to fit one reading: 목차(headings with pages), 초록, 서론, 결론 */
const HEAD_RE = /^\s*(제\s*\d+\s*[장절편]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*[.．]|(?:I{1,3}|IV|VI{0,3}|IX|X)\s*[.．])\s*\S/;
const TOP_RE = /^\s*(제\s*\d+\s*[장편]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*[.．]|(?:I{1,3}|IV|VI{0,3}|IX|X)\s*[.．])/;
const ABS_RE = /^\s*[<\[【〈(《]?\s*(국\s*문\s*초\s*록|국\s*문\s*요\s*약|논\s*문\s*요\s*약|초\s*록|요\s*약)\s*[>\]】〉)》]?\s*$/;
const ABS_END = /^\s*[<\[【〈(]?\s*(주\s*제\s*어|핵\s*심\s*어|주\s*요\s*어|검\s*색\s*어|key\s*-?\s*words?|abstract)/i;
const REF_RE = /^\s*[<\[【〈(]?\s*(참\s*고\s*문\s*헌|bibliography|references)\s*[>\]】〉)]?\s*$/i;
const INTRO_RE = /서\s*론|서\s*설|들\s*어\s*가\s*며|머\s*리\s*말|문\s*제\s*의\s*제\s*기/;
const CONC_RE = /결\s*론|맺\s*음\s*말|맺\s*는\s*말|나\s*가\s*며|결\s*어|마\s*치\s*며/;
const TOC_LINE = /(\.{3,}|·{3,}|…|‥|\s\d{1,3}\s*$)/;
function keyParts(pages, budget) {
  const L = [];
  pages.forEach((t, i) => String(t || '').split('\n').forEach((x) => { const v = x.replace(/\s+/g, ' ').trim(); if (v) L.push({ p: i + 1, t: v }); }));
  if (!L.length) return { text: '', outline: '', found: [] };
  const n = L.length;
  let end = n; for (let i = n - 1; i > n * 0.4; i--) if (REF_RE.test(L[i].t)) { end = i; break; }
  const heads = []; const seen = new Set();
  for (let i = 0; i < end; i++) { const t = L[i].t; if (t.length <= 80 && HEAD_RE.test(t) && !TOC_LINE.test(t) && !seen.has(t)) { seen.add(t); heads.push({ i, p: L[i].p, t, top: TOP_RE.test(t) }); } }
  const intro = heads.find((h) => INTRO_RE.test(h.t)) || heads[0] || null;
  let conc = null; for (let k = heads.length - 1; k >= 0; k--) if (CONC_RE.test(heads[k].t) && (!intro || heads[k].i > intro.i)) { conc = heads[k]; break; }
  let abs = -1; for (let i = 0; i < n; i++) if (ABS_RE.test(L[i].t)) { abs = i; break; }
  const take = (from, to, max) => { // lines from..to-1 as running text with 〔쪽〕 marks, at most max characters
    let out = '', pg = 0;
    for (let i = from; i < to && out.length < max; i++) { if (L[i].p !== pg) { pg = L[i].p; out += `\n〔${pg}쪽〕 `; } out += L[i].t + ' '; }
    return out.length > max ? out.slice(0, max) + '…' : out;
  };
  const found = []; const parts = []; let left = budget;
  // 목차: top-level headings first, then the next level while there is room
  const outlineOf = (list) => list.map((h) => `${h.t} (${h.p}쪽)`).join('\n');
  let outline = outlineOf(heads.filter((h) => h.top));
  const full = outlineOf(heads); if (full.length <= budget * 0.15) outline = full;
  if (outline.length > budget * 0.15) outline = outline.slice(0, Math.floor(budget * 0.15));
  if (outline) { parts.push(`[목차]\n${outline}`); left -= outline.length; found.push('목차'); }
  if (abs >= 0) {
    let stop = Math.min(n, abs + 1); while (stop < n && !ABS_END.test(L[stop].t) && !HEAD_RE.test(L[stop].t) && !REF_RE.test(L[stop].t) && stop - abs < 200) stop++;
    const t = take(abs + 1, stop, Math.floor(budget * 0.2)); if (t.trim()) { parts.push(`[초록]${t}`); left -= t.length; found.push('초록'); }
  }
  const nextTop = (h) => { const k = heads.findIndex((x) => x.i > h.i && x.top); return k >= 0 ? heads[k].i : end; };
  if (intro && (!conc || intro.i < conc.i)) { const t = take(intro.i, nextTop(intro), Math.floor(Math.min(left * 0.4, budget * 0.3))); parts.push(`[서론]${t}`); left -= t.length; found.push('서론'); }
  if (conc) { const t = take(conc.i, end, Math.max(800, left)); parts.push(`[결론]${t}`); left -= t.length; found.push('결론'); }
  if (!intro && !conc) { // no headings found: the beginning and the end of the text
    const head = take(0, end, Math.floor(left * 0.45)); let k = end, tail = 0; while (k > 0 && tail < left * 0.5) { k--; tail += L[k].t.length + 1; }
    parts.push(`[앞부분]${head}`, `[끝부분]${take(Math.max(k, 0), end, Math.floor(left * 0.5))}`); found.push('앞부분', '끝부분');
  }
  return { text: parts.join('\n\n'), outline: outlineOf(heads.filter((h) => h.top)).slice(0, 4000), found };
}
/* 숙지 without the AI: what can be read straight off the pages, in the document's own words, in an instant —
   목차(headings and pages), 초록, 주제어, 결론의 첫머리, the statutes and articles it discusses, the cases it cites */
const KW_RE = /^\s*[<\[【〈(]?\s*(주\s*제\s*어|핵\s*심\s*어|주\s*요\s*어|검\s*색\s*어|키\s*워\s*드)\s*[>\]】〉)]?\s*[:：]?\s*(.*)$/;
const LAW_END = /(법|법률|시행령|시행규칙|규칙|조례|규정)$/;
const LAW_STOP = /(방법|입법|사법|위법|불법|적법|합법|편법|문법|기법|수법|해법|어법|화법|용법|비법|탈법|준법|변법|본법|동법|이 법|같은 법|법률)$/;
const CASE_RE = /(?<![\d가-힣])((?:19|20)\d{2}|[89]\d)\s?(헌[가나다라마바사아]|재다|재두|재도|구합|가합|고합|다|도|두|누|마|스|므|후|추|그|노|나)\s?(\d{1,6})(?!\d)/g;
function extractFacts(pages) {
  try {
    const L = [];
    pages.forEach((t, i) => String(t || '').split('\n').forEach((x) => { const v = x.replace(/\s+/g, ' ').trim(); if (v) L.push({ p: i + 1, t: v }); }));
    const n = L.length;
    let end = n; for (let i = n - 1; i > n * 0.4; i--) if (REF_RE.test(L[i].t)) { end = i; break; }
    const outline = []; const seen = new Set();
    for (let i = 0; i < end && outline.length < 80; i++) { const t = L[i].t; if (t.length <= 80 && HEAD_RE.test(t) && !TOC_LINE.test(t) && !seen.has(t)) { seen.add(t); outline.push({ t, p: L[i].p, top: TOP_RE.test(t) }); } }
    const run = (from, to, max) => { let out = '', p = 0; for (let i = from; i < to && out.length < max; i++) { if (!p) p = L[i].p; out += L[i].t + ' '; } out = out.trim(); return { text: out.length > max ? out.slice(0, max).replace(/\s\S*$/, '') + ' …' : out, p }; };
    let abstract = null;
    for (let i = 0; i < n; i++) if (ABS_RE.test(L[i].t)) {
      let j = i + 1; while (j < n && j - i < 120 && !ABS_END.test(L[j].t) && !HEAD_RE.test(L[j].t) && !REF_RE.test(L[j].t) && !KW_RE.test(L[j].t)) j++;
      const r = run(i + 1, j, 1500); if (r.text.length > 40) abstract = r; break;
    }
    let keywords = [];
    for (let i = 0; i < n; i++) { const m = L[i].t.match(KW_RE); if (m) { const rest = m[2] || (L[i + 1] ? L[i + 1].t : ''); keywords = rest.split(/\s*[,，·;；]\s*/).map((x) => x.trim()).filter((x) => x && x.length <= 30).slice(0, 12); if (keywords.length) break; } }
    let conclusion = null;
    for (let k = outline.length - 1; k >= 0; k--) if (CONC_RE.test(outline[k].t)) {
      const at = L.findIndex((x) => x.t === outline[k].t && x.p === outline[k].p);
      if (at >= 0) { let stop = at + 1; while (stop < end && !(TOP_RE.test(L[stop].t) && HEAD_RE.test(L[stop].t) && L[stop].t.length <= 80)) stop++; const r = run(at + 1, stop, 900); if (r.text) conclusion = { head: outline[k].t, ...r }; }
      break;
    }
    const lawMap = new Map(), caseMap = new Map();
    const addTo = (map, key, p) => { const e = map.get(key) || { key, n: 0, pages: [] }; e.n++; if (!e.pages.includes(p)) e.pages.push(p); map.set(key, e); };
    pages.forEach((raw, i) => {
      const t = String(raw || '').replace(/\s+/g, ' '); const p = i + 1;
      for (const m of t.matchAll(/「\s*([^」]{2,40}?)\s*」\s*(제\s*\d+\s*조(?:\s*의\s*\d+)?)?/g)) { const name = m[1].trim(); if (LAW_END.test(name) && !LAW_STOP.test(name)) addTo(lawMap, name + (m[2] ? ' ' + m[2].replace(/\s+/g, '') : ''), p); }
      for (const m of t.matchAll(/(?<![가-힣」])([가-힣·]{2,25})\s*제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/g)) {
        const name = m[1]; if (!LAW_END.test(name) || LAW_STOP.test(name)) continue;
        if (name.length === 2 && !['헌법', '민법', '형법', '상법'].includes(name)) continue;
        addTo(lawMap, `${name} 제${m[2]}조${m[3] ? '의' + m[3] : ''}`, p);
      }
      for (const m of t.matchAll(CASE_RE)) addTo(caseMap, `${m[1]}${m[2]}${m[3]}`, p);
    });
    const top = (map, k) => [...map.values()].sort((a, b) => b.n - a.n || a.pages[0] - b.pages[0]).slice(0, k);
    const laws = top(lawMap, 40), cases = top(caseMap, 40);
    const brief = [abstract ? `초록: ${abstract.text.slice(0, 500)}` : '', outline.length ? `목차: ${outline.filter((h) => h.top).map((h) => h.t).join(' · ').slice(0, 300)}` : '', keywords.length ? `주제어: ${keywords.join(', ')}` : ''].filter(Boolean).join(' / ');
    return { outline, abstract, keywords, conclusion, laws, cases, brief, v: 1 };
  } catch (e) { return { outline: [], abstract: null, keywords: [], conclusion: null, laws: [], cases: [], brief: '', v: 1 }; }
}
async function digestDoc(d, mode = 'quick') {
  const pg = await docPages(d.id); if (!pg) return;
  const meta = [d.author, d.year, d.venue].filter(Boolean).join(', ');
  const SYS = '너는 법학 문헌을 꼼꼼히 읽고 정리하는 연구 보조자다. 주어진 본문에 있는 내용만 쓰고, 없는 내용은 만들지 않는다. 한국어 개조식으로 쓴다.';
  const ASKED = '이 문헌을 다음 순서로 정리하라: 1) 주제와 문제의식 2) 핵심 주장 3) 근거와 방법 4) 결론과 제언 5) 다룬 법령·판례·핵심 개념. 각 항목은 2~4줄, 근거 쪽을 (○쪽)으로 밝혀라.';
  let overview, notes = [], outline = '', found = [];
  if (mode === 'quick') {
    const kp = keyParts(pg.pages, Math.min(charBudget(AI.state.ctx, 2400), 9000)); outline = kp.outline; found = kp.found;
    overview = await digestCall([{ role: 'system', content: SYS }, { role: 'user', content: `다음은 「${d.title}」${meta ? `(${meta})` : ''}에서 ${found.join('·')} 부분만 뽑은 것이다(본문 전체가 아니다). 〔○쪽〕은 쪽의 시작이다.\n${kp.text}\n\n이를 바탕으로 ${ASKED} 주어진 부분에 없는 내용은 쓰지 마라.` }], { maxTokens: 700, temperature: 0.2 }, `${found.join('·')} 읽기`);
  } else {
    const per = charBudget(AI.state.ctx, 2200);
    const parts = []; let cur = { from: 1, to: 0, text: '' };
    pg.pages.forEach((t, i) => {
      const body = (t || '').replace(/\s+/g, ' ').trim(); if (!body) return;
      if (cur.text && cur.text.length + body.length > per) { parts.push(cur); cur = { from: i + 1, to: 0, text: '' }; }
      cur.text += `\n〔${i + 1}쪽〕 ${body.slice(0, per)}`; cur.to = i + 1;
    });
    if (cur.text) parts.push(cur);
    for (let k = 0; k < parts.length; k++) {
      if (DIG.stop) throw new Error('멈춤');
      const pt = parts[k];
      const out = await digestCall([{ role: 'system', content: SYS }, { role: 'user', content: `다음은 「${d.title}」${meta ? `(${meta})` : ''}의 ${pt.from}–${pt.to}쪽이다. 〔○쪽〕은 쪽의 시작이다.\n${pt.text}\n\n이 부분의 핵심을 6줄 이내 개조식으로 정리하라. 주장, 근거, 언급된 법령·판례·개념을 빠뜨리지 말고, 줄마다 끝에 (○쪽)을 붙여라.` }], { maxTokens: 400, temperature: 0.2 }, `${k + 1}/${parts.length}부분`);
      notes.push({ from: pt.from, to: pt.to, text: out });
    }
    let joined = notes.map((x) => `[${x.from}–${x.to}쪽]\n${x.text}`).join('\n\n');
    if (joined.length > charBudget(AI.state.ctx, 2600) && notes.length > 1) joined = joined.slice(0, charBudget(AI.state.ctx, 2600)); // the overview reads as much as fits; the part notes are kept whole
    overview = parts.length > 1 ? await digestCall([{ role: 'system', content: SYS }, { role: 'user', content: `다음은 「${d.title}」${meta ? `(${meta})` : ''}을 부분별로 정리한 것이다.\n\n${joined}\n\n이를 바탕으로 ${ASKED}` }], { maxTokens: 800, temperature: 0.2 }, '종합') : notes[0].text;
  }
  const full = await DB.get('docs', d.id); if (!full) return;
  full.digest = { text: overview, parts: notes, model: AI.state.name, at: Date.now(), mode, outline, read: found };
  await DB.put('docs', full); Object.assign(d, { digest: overview, digestModel: AI.state.name, digestMode: mode });
}
async function showDigest(id) {
  const d = docOf(id); if (!d) return;
  const full = await DB.get('docs', id); if (!full) return;
  if (!full.facts && Array.isArray(full.pages) && !full.blank) { full.facts = extractFacts(full.pages); await DB.put('docs', full); Object.assign(d, { hasFacts: true, brief: full.facts.brief }); }
  const f = full.facts || {}, g = full.digest;
  const pg = (p) => `<button class="linkish" data-act="open-at" data-id="${d.id}" data-p="${p}">${d.kind === 'pdf' ? `${p}쪽` : `${p}번째 부분`}</button>`;
  const pgs = (list) => list.slice(0, 6).map(pg).join(', ') + (list.length > 6 ? ` 외 ${list.length - 6}곳` : '');
  const sec = (h, body) => (body ? `<section class="fact"><h3>${h}</h3>${body}</section>` : '');
  const ai = g ? `<div class="answer digest">${renderMarkdown(g.text)}</div><p class="sub">AI 요지 · ${esc(g.model || '')} · ${g.mode === 'quick' ? '목차·초록·서론·결론을 읽고 씀' : '전문을 읽고 씀'} · 쪽수는 원문으로 꼭 확인하세요.</p>`
    : `<p class="sub">AI가 직접 요지를 쓰게 할 수도 있습니다. 이 문헌만 씁니다. 컴퓨터와 모델에 따라 몇 분 이상 걸릴 수 있습니다.</p>`;
  modal(`<h2>${esc(d.title)}</h2><p class="sub">아래는 AI 없이 문헌에서 그대로 뽑은 내용입니다. 쪽을 누르면 그 쪽이 열립니다.</p>
    ${sec(`초록${f.abstract ? ` <span class="m">${pg(f.abstract.p)}</span>` : ''}`, f.abstract ? `<p>${esc(f.abstract.text)}</p>` : '')}
    ${sec('주제어', f.keywords && f.keywords.length ? `<p class="chips">${f.keywords.map((k) => `<span class="tag">${esc(k)}</span>`).join(' ')}</p>` : '')}
    ${sec('목차', f.outline && f.outline.length ? `<ul class="toc">${f.outline.map((h) => `<li class="${h.top ? 'top' : 'sub'}">${esc(h.t)} <span class="m">${pg(h.p)}</span></li>`).join('')}</ul>` : '')}
    ${sec(`결론의 첫머리${f.conclusion ? ` <span class="m">${esc(f.conclusion.head)} · ${pg(f.conclusion.p)}</span>` : ''}`, f.conclusion ? `<p>${esc(f.conclusion.text)}</p>` : '')}
    ${sec('다룬 법령·조문', f.laws && f.laws.length ? `<ul class="refs">${f.laws.map((x) => `<li><b>${esc(x.key)}</b> <span class="m">${x.n}회 · ${pgs(x.pages)}</span></li>`).join('')}</ul>` : '')}
    ${sec('인용한 판례·결정 (사건번호)', f.cases && f.cases.length ? `<ul class="refs">${f.cases.map((x) => `<li><b>${esc(x.key)}</b> <span class="m">${x.n}회 · ${pgs(x.pages)}</span></li>`).join('')}</ul>` : '')}
    ${!(f.abstract || (f.outline && f.outline.length) || f.conclusion || (f.laws && f.laws.length) || (f.cases && f.cases.length)) ? '<p class="find-none">이 문헌에서는 목차·초록 같은 구조를 찾지 못했습니다. 본문 검색과 묻기는 그대로 됩니다.</p>' : ''}
    ${sec('AI 요지', ai)}
    <div class="modal-foot">${g ? `<button class="btn" data-act="dig-redo" data-id="${d.id}">AI 요지 다시 쓰기</button>${g.mode === 'quick' ? `<button class="btn" data-act="dig-full" data-id="${d.id}">전문을 읽고 다시 쓰기</button>` : ''}` : `<button class="btn primary" data-act="dig-one" data-id="${d.id}">AI로 요지 쓰기</button>`}<button class="btn${g ? ' primary' : ''}" data-close>닫기</button></div>`);
}

/* ---------------- 묻기: questions answered from the library, with the pages they rest on ---------------- */
const ASK_SYS = `너는 공법학자 안요환 박사의 개인 연구 서재를 읽고 답하는 연구 보조자다.
1. 아래 [자료]에 실린 서재 문헌의 내용만 근거로 답한다. 자료에 없는 사실·법령·판례·통계를 지어내지 않는다.
2. 근거가 된 자료 번호를 문장 끝에 [1], [2]처럼 붙인다. 여러 자료이면 [1][3]처럼 쓴다.
3. 자료로 답할 수 없으면 '서재 자료에서 확인되지 않는다'고 쓰고, 찾아볼 만한 낱말을 제안한다.
4. 자료끼리 견해가 다르면 나누어 정리한다.
5. 한국어 학술 문어체(~이다)로 간결하게 쓴다.`;
const projectAsks = () => S.chats.filter((c) => c.local && c.projectId === (S.project && S.project.id)).sort((a, b) => b.updatedAt - a.updatedAt);
let ASK = null; // the conversation on screen
function excerpt(text, pq, max) {
  const flat = (text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const low = flat.toLowerCase(); let at = 0;
  for (const t of [...pq.phrases, ...pq.words, ...pq.terms]) { const i = low.indexOf(t); if (i >= 0) { at = i; break; } }
  const a = Math.max(0, Math.min(flat.length - max, at - Math.floor(max / 3)));
  return (a ? '…' : '') + flat.slice(a, a + max) + (a + max < flat.length ? '…' : '');
}
async function gatherSources(question, prev, scope) {
  const lib = await libLoad();
  const pq = parseQuery(`${question} ${prev || ''}`);
  const qq = parseQuery(question);
  const hits = searchLib(lib, pq.terms.length ? pq : qq, 40, scope);
  const budget = charBudget(AI.state.ctx, 2600);
  const perDoc = {}, picked = []; let used = 0;
  const docsHit = [...new Set(hits.map((h) => h.id))];
  const digests = docsHit.map((id) => docOf(id)).filter((d) => d && (d.digest || d.brief)).slice(0, 4);
  const digText = digests.map((d) => `「${d.title}」 ${d.digest ? '요지' : '개요(원문에서 뽑음)'}: ${(d.digest || d.brief).replace(/\s+/g, ' ').slice(0, Math.floor(budget * 0.25 / Math.max(1, digests.length)))}`).join('\n');
  used += digText.length;
  const pageMax = Math.max(900, Math.min(2200, Math.floor(budget / 5)));
  for (const h of hits) {
    if ((perDoc[h.id] || 0) >= 3) continue;
    const D = lib.docs.find((x) => x.id === h.id);
    const ex = excerpt(D.pages[h.page - 1], qq.terms.length ? qq : pq, pageMax);
    if (used + ex.length > budget) { if (picked.length) break; }
    picked.push({ docId: h.id, page: h.page, text: ex }); used += ex.length + 60; perDoc[h.id] = (perDoc[h.id] || 0) + 1;
  }
  return { sources: picked, digText, terms: hlTerms(qq) };
}
function askPrompt(question, src, history) {
  const block = src.sources.map((x, i) => { const d = docOf(x.docId); const meta = [d && d.author, d && d.year].filter(Boolean).join(', '); return `[${i + 1}] 「${d ? d.title : '문헌'}」${meta ? `(${meta})` : ''} ${pageLabel(d, x.page)}\n${x.text}`; }).join('\n\n');
  const msgs = [{ role: 'system', content: ASK_SYS }];
  for (const h of history) msgs.push({ role: h.role, content: h.role === 'assistant' ? h.text.slice(0, 1200) : h.text });
  msgs.push({ role: 'user', content: `${src.digText ? `[관련 문헌의 요지(배경용, 인용하지 말 것)]\n${src.digText}\n\n` : ''}[자료]\n${block || '(서재에서 맞는 쪽을 찾지 못했다)'}\n\n[질문]\n${question}` });
  return msgs;
}
function answerHTML(m) {
  let html = renderMarkdown(stripThink(m.text || ''));
  html = html.replace(/\[(\d{1,2})\]/g, (all, n) => (m.sources && m.sources[n - 1] ? `<button class="src-ref" data-act="ask-src" data-n="${n}" title="${esc(srcTitle(m.sources[n - 1]))}">${n}</button>` : all));
  const list = (m.sources || []).map((x, i) => `<li><button class="linkish" data-act="ask-src" data-n="${i + 1}">${esc(srcTitle(x))}</button></li>`).join('');
  return `${html}${list ? `<details class="sources"${m.live ? '' : ''}><summary>읽은 쪽 ${m.sources.length}개</summary><ol>${list}</ol></details>` : ''}`;
}
const srcTitle = (x) => { const d = docOf(x.docId); return `${d ? d.title : '(지운 문헌)'} · ${d ? pageLabel(d, x.page) : x.page + '쪽'}`; };
function viewAsk() {
  const list = projectAsks();
  if (!ASK || ASK.projectId !== (S.project && S.project.id)) ASK = list[0] || null;
  const docs = S.docs.filter((d) => d.indexed && !d.blank).sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  const msgs = ASK ? ASK.messages : [];
  view().innerHTML = `<div class="page ask">
    <div class="ai-bar" id="ai-bar">${aiBarHTML()}</div>
    <div class="ask-top">${list.length ? `<label class="sr" for="ask-sel">대화</label><select id="ask-sel">${list.map((c) => `<option value="${c.id}"${ASK && c.id === ASK.id ? ' selected' : ''}>${esc(c.title)}</option>`).join('')}</select>` : ''}<button class="btn" data-act="ask-new">${IC.plus} 새 대화</button>${ASK ? '<button class="btn" data-act="ask-docx">Word</button><button class="btn danger" data-act="ask-del">지우기</button>' : ''}</div>
    <div class="ask-thread" id="ask-thread">${msgs.length ? msgs.map((m, i) => (m.role === 'user' ? `<div class="msg user"><div class="bubble">${esc(m.text)}</div></div>` : `<div class="msg ai" data-i="${i}"><div class="answer">${answerHTML(m)}</div>${m.note ? `<p class="notice-line">${esc(m.note)}</p>` : ''}${m.live ? '' : `<div class="ai-foot"><button data-act="ask-card" data-i="${i}">노트에 담기</button><button data-act="ask-copy" data-i="${i}">복사</button></div>`}</div>`)).join('')
      : `<div class="ask-empty"><h1>서재에 물어보세요</h1><p class="lead">AI가 서재 전체에서 관련 쪽을 찾아 읽고, 근거가 된 쪽을 [번호]로 밝혀 답합니다. 번호를 누르면 그 쪽이 열립니다. 모든 것이 이 컴퓨터 안에서 이루어집니다.</p>
        <div class="dig-box" id="dig-status">${digestStatusHTML()}</div>
        <p class="sub">문헌은 넣는 즉시 AI 없이 숙지됩니다(목차·초록·주제어·결론·법령·판례를 원문에서 뽑아 둠). 질문하면 AI가 서재에서 관련 쪽을 찾아 그 개요와 함께 읽고, 근거 쪽을 밝혀 답합니다.</p></div>`}</div>
    <div class="ask-comp"><label class="sr" for="ask-in">질문</label><textarea id="ask-in" rows="2" placeholder="예: 의회유보의 범위에 관한 학설을 정리해 줘 · Enter 보내기, Shift+Enter 줄바꿈"></textarea>
      <div class="ask-bar"><label class="sr" for="ask-scope">범위</label><select id="ask-scope"><option value="">서재 전체에서</option>${docs.map((d) => `<option value="${d.id}"${S.askScope === d.id ? ' selected' : ''}>${esc(d.title)}에서</option>`).join('')}</select>${S.asking ? '<button class="send stop" data-act="ask-stop">멈추기</button>' : '<button class="send" data-act="ask-send">묻기</button>'}</div></div></div>`;
  const th = $('#ask-thread'); if (th) th.scrollTop = th.scrollHeight;
  if (!AI.ready() && S.settings.ai && AI.state.status === 'none') ensureAI();
}
function paintAskLive(m) {
  const th = $('#ask-thread'); if (!th || !ASK) return;
  const i = ASK.messages.indexOf(m), node = th.querySelector(`.msg.ai[data-i="${i}"] .answer`);
  if (!node) { viewAsk(); return; }
  const atBottom = th.scrollHeight - th.scrollTop - th.clientHeight < 80;
  node.innerHTML = answerHTML(m);
  if (atBottom) th.scrollTop = th.scrollHeight;
}
async function askSend() {
  const ta = $('#ask-in'); const q = ta ? ta.value.trim() : '';
  if (!q || S.asking) return;
  if (!libStats().ok) { toast('서재에 읽을 문헌이 없습니다. 서재에서 PDF 폴더를 고르세요.'); return; }
  if (!(await ensureAI())) { openAISetup(); return; }
  if (!ASK) { ASK = { id: uid(), projectId: S.project.id, local: true, title: q.slice(0, 40), messages: [], createdAt: Date.now(), updatedAt: Date.now() }; S.chats.push(ASK); }
  const prevQ = [...ASK.messages].reverse().find((m) => m.role === 'user');
  const history = ASK.messages.filter((m) => !m.note).slice(-2).map((m) => ({ role: m.role, text: m.text }));
  ASK.messages.push({ role: 'user', text: q, at: Date.now() });
  const src = await gatherSources(q, prevQ && prevQ.text, S.askScope || '');
  const msg = { role: 'assistant', text: '', sources: src.sources.map((x) => ({ docId: x.docId, page: x.page })), terms: src.terms, model: AI.state.name, at: Date.now(), live: true };
  ASK.messages.push(msg); S.asking = true;
  if (ta) ta.value = '';
  viewAsk();
  try {
    for await (const d of AI.stream(askPrompt(q, src, history), { maxTokens: 1500 })) { msg.text += d; paintAskLive(msg); }
    msg.text = stripThink(msg.text);
    if (!msg.text) msg.note = 'AI가 답을 내지 않았습니다. 질문을 바꾸어 다시 물어보세요.';
  } catch (e) { msg.note = `답하지 못했습니다: ${e.message || e}`; }
  finally {
    msg.live = false; S.asking = false; ASK.updatedAt = Date.now();
    await DB.put('chats', ASK).catch(() => {});
    if (S.view === 'ask') viewAsk();
  }
}
function askExport() {
  if (!ASK) return;
  const sections = []; let q = '', k = 0;
  for (const m of ASK.messages) {
    if (m.role === 'user') { q = m.text; continue; }
    if (!m.text) continue;
    k++;
    const notes = (m.sources || []).map((x) => footnote(docOf(x.docId), x.page));
    sections.push({ heading: `질문 ${k}`, question: q, md: stripThink(m.text).replace(/\[(\d{1,2})\]/g, (all, n) => (notes[n - 1] ? `〔c${n}〕` : all)), notes });
  }
  if (!sections.length) { toast('저장할 답이 없습니다.'); return; }
  download(`${(ASK.title || '묻기').replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 50) || '묻기'}.docx`, buildDocx({ title: ASK.title, subtitle: `${kdate(ASK.updatedAt)} · 요AI · ${ASK.messages.find((m) => m.model) ? ASK.messages.find((m) => m.model).model : ''}`, sections }), DOCX_MIME);
}

/* ---------------- modals ---------------- */
function modal(html, onClose) {
  const w = document.createElement('div'); w.className = 'modal-wrap'; w.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(w);
  const close = () => { w.remove(); document.removeEventListener('keydown', key); if (onClose) onClose(); };
  const key = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  w.addEventListener('click', (e) => { if (e.target === w || e.target.closest('[data-close]')) close(); });
  return { el: w, close };
}
function confirmBox(text, okLabel) {
  return new Promise((res) => {
    const m = modal(`<h2>확인</h2><p style="font-size:.875rem;color:var(--ink-2);line-height:1.7">${esc(text)}</p><div class="modal-foot"><button class="btn" data-close>취소</button><button class="btn primary" id="cb-ok">${esc(okLabel || '확인')}</button></div>`, () => res(false));
    $('#cb-ok', m.el).addEventListener('click', () => { res(true); m.close(); });
  });
}
function formBox(title, fields) {
  return new Promise((res) => {
    let done = false;
    const m = modal(`<h2>${esc(title)}</h2>${fields.map((f, i) => `<label class="field"><span>${esc(f.label)}</span><input id="fb${i}" value="${esc(f.value || '')}" autocomplete="off"></label>`).join('')}<div class="modal-foot"><button class="btn" data-close>취소</button><button class="btn primary" id="fb-ok">저장</button></div>`, () => { if (!done) res(null); });
    const ok = () => { done = true; const out = fields.map((_, i) => $('#fb' + i, m.el).value); res(out); m.close(); };
    $('#fb-ok', m.el).addEventListener('click', ok);
    m.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !e.isComposing) { e.preventDefault(); ok(); } });
    setTimeout(() => { const f = $('#fb0', m.el); if (f) f.focus(); }, 30);
  });
}
function download(name, data, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); }
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
/* remove everything 요AI keeps in this browser — and only that: 송공 (songgong DB, songgong-* caches) is left alone */
async function wipeAll() {
  WIPED = true;
  try { await AI.unload(); } catch (e) { /* ignore */ }
  try { closePdf(); } catch (e) { /* ignore */ }
  const del = (name) => new Promise((res) => { try { const r = indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = () => res(true); r.onblocked = () => res(false); } catch (e) { res(false); } });
  let blocked = !(await del('yoai'));
  try { if (indexedDB.databases) for (const d of await indexedDB.databases()) if (d.name && /^webllm/i.test(d.name)) blocked = !(await del(d.name)) || blocked; } catch (e) { /* ignore */ }
  try { for (const k of await caches.keys()) if (/^(yoai-|webllm)/i.test(k)) await caches.delete(k); } catch (e) { /* ignore */ }
  try { if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) if (/\/yoai\/$/.test(r.scope)) await r.unregister(); } catch (e) { /* ignore */ }
  for (const st of ['localStorage', 'sessionStorage']) { try { const sto = window[st]; for (const k of Object.keys(sto)) if (/^(yoai|door:yoai)/.test(k)) sto.removeItem(k); } catch (e) { /* ignore */ } }
  document.body.innerHTML = `<main class="wiped"><h1>요AI를 이 컴퓨터에서 지웠습니다</h1><p>문헌·노트·지난 대화·AI 모델·오프라인용 파일을 모두 지웠습니다. 송공 기록은 그대로입니다.</p>${blocked ? '<p><b>다른 창에 요AI가 열려 있으면 그 창을 닫아야 마저 지워집니다.</b></p>' : ''}<p>이 탭을 닫으세요.</p><p><a href="../">0128.kr로 돌아가기</a></p></main>`;
}
function openSettings() {
  const m = modal(`<h2>설정</h2>
    <label class="field"><span>테마</span><select id="s-theme">${[['auto', '자동'], ['light', '밝게'], ['dark', '어둡게']].map(([v, l]) => `<option value="${v}"${S.settings.theme === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field"><span>쪽을 열 때 기본 보기</span><select id="s-read"><option value="pdf"${S.settings.read === 'pdf' ? ' selected' : ''}>원문(PDF 그대로)</option><option value="text"${S.settings.read === 'text' ? ' selected' : ''}>글자(골라서 인용)</option></select></label>
    <h3 class="mh">컴퓨터에 설치</h3>
    <p class="sub">${installEvt ? '<button class="btn" id="install">요AI를 앱으로 설치</button> ' : ''}Chrome·Edge 주소창 오른쪽의 설치 아이콘(또는 메뉴 → 앱 설치)으로 요AI를 컴퓨터에 설치하면 바탕화면·시작 메뉴에서 창으로 열립니다. 한 번 연 뒤에는 인터넷 없이도 열립니다.</p>
    <h3 class="mh">보관</h3>
    <p class="sub">문헌·노트·지난 대화는 이 브라우저 안에만 있습니다. 폴더를 연결해 두면 문헌은 폴더에서 다시 읽을 수 있으니, <b>노트 백업</b>을 가끔 받아 두세요(문헌 본문은 빠지고 문헌 정보는 들어갑니다).</p>
    <div class="tools-row"><button class="btn" id="backup">노트·프로젝트 백업(.json)</button><label class="btn" style="cursor:pointer">백업 불러오기<input type="file" id="restore" accept=".json,application/json" class="sr"></label><button class="btn" id="relock">잠금 다시 걸기</button></div>
    <h3 class="mh">이 컴퓨터에서 지우기</h3>
    <p class="sub">요AI가 이 브라우저에 저장한 것을 모두 지웁니다: 문헌·노트·지난 대화·폴더 연결, 브라우저 안 AI 모델, 오프라인용 파일. 송공 기록은 그대로 둡니다. Ollama는 컴퓨터의 프로그램이라 여기서 지울 수 없습니다(Windows 설정의 앱 목록에서 제거).</p>
    <div class="tools-row"><button class="btn danger" id="wipe">요AI 자료 모두 지우기</button></div>
    <div class="modal-foot"><button class="btn" data-close>닫기</button><button class="btn primary" id="save">저장</button></div>`);
  $('#save', m.el).addEventListener('click', async () => { Object.assign(S.settings, { theme: $('#s-theme', m.el).value, read: $('#s-read', m.el).value }); await saveSettings(); m.close(); toast('저장했습니다.'); });
  $('#wipe', m.el).addEventListener('click', async () => {
    if (!(await confirmBox('문헌·노트·지난 대화·AI 모델이 이 컴퓨터에서 모두 지워집니다. 되돌릴 수 없습니다. 노트를 남기려면 먼저 ‘노트·프로젝트 백업’을 받으세요. 지울까요?', '모두 지우기'))) return;
    m.close(); await wipeAll();
  });
  const ins = $('#install', m.el); if (ins) ins.addEventListener('click', async () => { const e = installEvt; installEvt = null; try { await e.prompt(); } catch (err) { /* ignore */ } m.close(); });
  $('#relock', m.el).addEventListener('click', () => { window.Door.close('yoai'); toast('다음에 열 때 비밀번호를 다시 묻습니다.'); });
  $('#backup', m.el).addEventListener('click', () => {
    const data = { app: 'yoai', v: 2, exportedAt: new Date().toISOString(), projects: S.projects, cards: S.cards, chats: S.chats, docs: S.docs.map((d) => ({ id: d.id, title: d.title, author: d.author, year: d.year, venue: d.venue, page1: d.page1, folder: d.folder })) };
    download(`yoai-backup-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`, JSON.stringify(data), 'application/json');
  });
  $('#restore', m.el).addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text()); if (!d || d.app !== 'yoai') throw new Error('요AI 백업 파일이 아닙니다.');
      let n = 0;
      for (const p of d.projects || []) if (p && p.id && !S.projects.some((x) => x.id === p.id)) { S.projects.push(p); await DB.put('projects', p); n++; }
      for (const c of d.cards || []) if (c && c.id && !S.cards.some((x) => x.id === c.id)) { S.cards.push(c); await DB.put('cards', c); n++; }
      for (const c of d.chats || []) if (c && c.id && !S.chats.some((x) => x.id === c.id)) { S.chats.push(c); await DB.put('chats', c); n++; }
      for (const m2 of d.docs || []) { const doc = docOf(m2.id) || (m2.folder && S.docs.find((x) => x.folder === m2.folder)); if (!doc) continue; const full = await DB.get('docs', doc.id); if (!full) continue; for (const k of ['author', 'year', 'venue', 'page1']) if (!full[k] && m2[k]) full[k] = m2[k]; await DB.put('docs', full); Object.assign(doc, docMeta(full)); }
      toast(`불러왔습니다(새 항목 ${n}개).`); m.close(); paintShell();
    } catch (err) { toast('불러오지 못했습니다: ' + err.message); }
  });
}
function openHelp() {
  modal(`<h2>요AI 사용법</h2><div class="help">
    <p><b>1. 서재 채우기</b> — <b>서재 → 폴더 고르기</b>로 선행연구 PDF가 든 폴더를 고르면 하위 폴더까지 모두 넣고, 모든 쪽의 글자를 읽어 둡니다. Chrome·Edge에서는 폴더가 연결된 채로 남아, 요AI를 열 때마다 새로 넣거나 고친 파일을 맞춥니다.</p>
    <p><b>2. 묻기 (오프라인 AI)</b> — 처음 한 번 <b>AI 준비</b>에서 모델을 내려받으면(인터넷 필요), 그 뒤로는 인터넷 없이 이 컴퓨터 안에서 돌아갑니다. 질문하면 AI가 서재 전체에서 관련 쪽을 찾아 읽고 근거 쪽을 [번호]로 밝혀 답합니다. 문헌마다 원문에서 뽑아 둔 목차·초록도 함께 보고 답합니다. AI는 작은 공개 모델이라 틀릴 수 있으니, 번호를 눌러 원문을 꼭 확인하세요.</p>
    <p><b>3. 찾기</b> — 서재 전체에서 쪽 단위로 찾습니다. 띄어쓰기·조사가 달라도 찾고(의회유보 → 의회 유보, 의회유보의), <b>"따옴표"</b>로 묶으면 그 표현 그대로, <b>-낱말</b>은 그 낱말이 없는 쪽만 찾습니다. 위의 목록에서 문헌 하나만 골라 찾을 수도 있습니다.</p>
    <p><b>4. 읽기</b> — 결과를 누르면 그 쪽이 열립니다. <b>원문</b>은 PDF 그대로, <b>글자</b>는 찾은 낱말이 표시된 본문입니다. ← → 키로 쪽을 넘깁니다.</p>
    <p><b>5. 인용 모으기</b> — 글자 보기에서 글을 고르면 <b>카드에 담기</b>와 <b>인용 복사</b>가 나타납니다. 인용 복사는 인용문과 각주(저자, “제목”, 학술지, 연도, 쪽)를 함께 복사합니다.</p>
    <p><b>6. 노트</b> — 프로젝트마다 카드가 모입니다. 순서를 바꾸고 메모를 달아 <b>Word로 저장</b>하면 인용마다 Word 각주가 달린 문서가 됩니다.</p>
    <p><b>7. 각주를 정확하게</b> — 서재에서 문헌의 <b>정보</b>에 저자·연도·학술지와 학술지 첫 쪽 번호를 적어 두면, 각주가 학술지 쪽수(○면)로 만들어집니다.</p>
    <p><b>8. 오프라인</b> — 한 번 연 뒤에는 인터넷 없이도 열리고 모든 기능이 됩니다. Chrome·Edge에서 설치하면 컴퓨터의 앱처럼 쓸 수 있습니다(설정 참고).</p>
    <p><b>9. 스캔본</b> — 글자가 없는 스캔본 PDF는 서재에서 <b>글자 읽기(OCR)</b>를 누르면 이 컴퓨터 안에서 쪽마다 글자를 읽어 찾기·묻기에 쓰입니다. 인식이 틀릴 수 있으니 인용할 때는 원문 보기로 확인하세요.</p>
    <p><b>10. 보관</b> — 모든 내용은 이 컴퓨터의 이 브라우저 안에만 있습니다. 설정의 <b>노트 백업</b>을 가끔 받아 두세요.</p></div>
    <div class="modal-foot"><button class="btn primary" data-close>닫기</button></div>`);
}

/* ---------------- projects ---------------- */
async function newProject(title) {
  const p = { id: uid(), title: title || '새 연구 프로젝트', question: '', concepts: '', decided: '', open: '', notes: '', style: '', createdAt: Date.now(), updatedAt: Date.now() };
  S.projects.push(p); await saveProject(p); return p;
}
function selectProject(id) { S.project = S.projects.find((p) => p.id === id) || S.projects[0]; DB.put('kv', S.project.id, 'lastProject').catch(() => {}); show(S.view === 'read' ? 'notes' : S.view); }

/* ---------------- events ---------------- */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) { if (!e.target.closest('#seltool')) selTool(null); return; }
  const act = el.dataset.act;
  const card = el.closest('.card'), cid = card && card.dataset.id, c = cid && S.cards.find((x) => x.id === cid);
  const row = el.closest('.doc-row'), did = row && row.dataset.id;
  switch (act) {
    case 'go': show(el.dataset.v); break;
    case 'ai-setup': openAISetup(); break;
    case 'ocr-all': ocrAll(); break;
    case 'ocr-one': if (did) ocrAll(did); break;
    case 'ocr-stop': OCR.stop = true; paintStatus(); break;
    case 'dig-start': digestAll(); break;
    case 'dig-one': { const d = docOf(el.dataset.id); if (d) { $$('.modal-wrap').forEach((x) => x.remove()); digestAll({ ids: [d.id], mode: 'quick' }); } break; }
    case 'open-at': { const id = el.dataset.id, p = Number(el.dataset.p) || 1; $$('.modal-wrap').forEach((x) => x.remove()); openDoc(id, p, []); break; }
    case 'dig-full': { const d = docOf(el.dataset.id); if (d) { $$('.modal-wrap').forEach((x) => x.remove()); digestAll({ ids: [d.id], mode: 'full' }); } break; }
    case 'dig-stop': DIG.stop = true; AI.stop(); paintStatus(); break;
    case 'dig-show': if (did) showDigest(did); break;
    case 'dig-redo': { const d = docOf(el.dataset.id); if (d) { $$('.modal-wrap').forEach((x) => x.remove()); digestAll({ ids: [d.id], mode: 'quick' }); } break; }
    case 'ask-send': askSend(); break;
    case 'ask-stop': AI.stop(); break;
    case 'ask-new': ASK = null; viewAsk(); setTimeout(() => { const t = $('#ask-in'); if (t) t.focus(); }, 30); break;
    case 'ask-del': if (ASK && await confirmBox('이 대화를 지울까요?', '지우기')) { await DB.del('chats', ASK.id); S.chats = S.chats.filter((x) => x !== ASK); ASK = null; redraw('ask'); } break;
    case 'ask-docx': askExport(); break;
    case 'ask-src': { const msgEl = el.closest('.msg.ai'), m = ASK && msgEl && ASK.messages[+msgEl.dataset.i], x = m && m.sources[+el.dataset.n - 1]; if (x && docOf(x.docId)) openDoc(x.docId, x.page, m.terms || []); break; }
    case 'ask-copy': { const m = ASK && ASK.messages[+el.dataset.i]; if (m) copyText(stripThink(m.text) + '\n\n' + (m.sources || []).map((x, k) => `[${k + 1}] ${footnote(docOf(x.docId), x.page)}`).join('\n'), '답과 출처를 복사했습니다.'); break; }
    case 'ask-card': { const m = ASK && ASK.messages[+el.dataset.i]; if (m) { const c2 = await addCard('', null, 0); c2.memo = `${stripThink(m.text)}\n\n${(m.sources || []).map((x, k) => `[${k + 1}] ${footnote(docOf(x.docId), x.page)}`).join('\n')}`; await saveCard(c2); } break; }
    case 'menu': $('#side').classList.toggle('open'); $('.shell').classList.toggle('side-open', $('#side').classList.contains('open')); break;
    case 'scrim': closeSide(); break;
    case 'close': try { window.parent.postMessage({ type: 'yoai:close' }, location.origin); } catch (err) { /* ignore */ } break;
    case 'help': closeSide(); openHelp(); break;
    case 'settings': closeSide(); openSettings(); break;
    case 'new-project': { const v = await formBox('새 연구 프로젝트', [{ label: '프로젝트 이름', value: '' }]); if (!v || !v[0].trim()) break; S.project = await newProject(v[0].trim()); DB.put('kv', S.project.id, 'lastProject').catch(() => {}); show('notes'); break; }
    case 'del-project': {
      if (S.projects.length < 2) { toast('프로젝트가 하나뿐이라 지울 수 없습니다.'); break; }
      if (!(await confirmBox(`‘${S.project.title}’ 프로젝트와 그 카드 ${projectCards().length}개를 지울까요? 되돌릴 수 없습니다.`, '지우기'))) break;
      for (const x of projectCards()) await DB.del('cards', x.id);
      S.cards = S.cards.filter((x) => x.projectId !== S.project.id); await DB.del('projects', S.project.id);
      S.projects = S.projects.filter((x) => x.id !== S.project.id); S.project = S.projects[0]; show('notes'); break;
    }
    case 'open-hit': { const h = S.hits && S.hits[+el.dataset.i]; if (h) openDoc(h.id, h.page, hlTerms(parseQuery(S.q))); break; }
    case 'rd-digest': if (S.reader) showDigest(S.reader.id); break;
    case 'rd-back': show(S.reader && S.reader.from && S.reader.from !== 'read' ? S.reader.from : 'find'); break;
    case 'rd-prev': goPage(S.reader.page - 1); break;
    case 'rd-next': goPage(S.reader.page + 1); break;
    case 'rd-go': goPage(+el.dataset.p); break;
    case 'rd-mode': S.settings.read = el.dataset.v; saveSettings(); viewRead(); break;
    case 'rd-card': { const r = S.reader; if (r) await addCard('', r.id, r.page); break; }
    case 'rd-cite': { const r = S.reader; if (r) copyText(footnote(docOf(r.id), r.page), '이 쪽의 각주를 복사했습니다.'); break; }
    case 'sel-card': { const t = $('#seltool'), r = S.reader; if (t && r) { await addCard(t.dataset.text, r.id, r.page); selTool(null); window.getSelection().removeAllRanges(); } break; }
    case 'sel-cite': { const t = $('#seltool'), r = S.reader; if (t && r) { copyText(citeText(t.dataset.text, docOf(r.id), r.page), '인용문과 각주를 복사했습니다.'); selTool(null); } break; }
    case 'card-new': { const nc = await addCard('', null, 0); viewNotes(); const ta = nc && $(`[data-card-memo="${nc.id}"]`); if (ta) ta.focus(); break; }
    case 'card-open': if (c) openDoc(c.docId, c.page, []); break;
    case 'card-cite': if (c) copyText(citeText(c.quote, docOf(c.docId), c.page), '인용문과 각주를 복사했습니다.'); break;
    case 'card-del': if (c && await confirmBox('이 카드를 지울까요?', '지우기')) { S.cards = S.cards.filter((x) => x.id !== c.id); await DB.del('cards', c.id); redraw('notes'); paintSide(); } break;
    case 'card-up': case 'card-down': {
      const list = projectCards(), i = list.indexOf(c), j = act === 'card-up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= list.length) break;
      list.forEach((x, k) => { x.order = k + 1; });
      [list[i].order, list[j].order] = [list[j].order, list[i].order];
      await saveCard(list[i]); await saveCard(list[j]); redraw('notes'); break;
    }
    case 'notes-docx': notesExport('docx'); break;
    case 'notes-md': notesExport('md'); break;
    case 'folder': await connectFolder(); redraw('library'); break;
    case 'folder-sync': await syncFolder(); break;
    case 'persist': if (navigator.storage && navigator.storage.persist) { const ok = await navigator.storage.persist(); toast(ok ? '이 컴퓨터에서 요AI의 저장소를 보호합니다.' : '브라우저가 보호 요청을 받지 않았습니다. 요AI를 설치하거나 자주 열면 보호될 수 있습니다.'); paintStore(); } break;
    case 'doc-open': if (did) openDoc(did, 1, []); break;
    case 'doc-edit': if (did) editDoc(did); break;
    case 'doc-del': if (did && await confirmBox(`‘${(docOf(did) || {}).title}’을(를) 서재에서 지울까요? 이 문헌을 가리키는 카드는 남습니다.${(docOf(did) || {}).folder ? ' 연결된 폴더에 파일이 남아 있으면 다음에 폴더를 읽을 때 다시 들어옵니다.' : ''}`, '지우기')) { await removeDoc(did); redraw('library'); paintSide(); } break;
    case 'arch-open': S.chat = S.chats.find((x) => x.id === el.dataset.id) || null; show('archive'); break;
    case 'arch-list': S.chat = null; show('archive'); break;
    case 'arch-docx': archExport('docx'); break;
    case 'arch-md': archExport('md'); break;
    case 'arch-del': if (S.chat && await confirmBox('이 대화를 지울까요? 되돌릴 수 없습니다.', '지우기')) { await DB.del('chats', S.chat.id); S.chats = S.chats.filter((x) => x !== S.chat); S.chat = null; show(S.chats.some((x) => !x.local) ? 'archive' : 'find'); } break;
    default: break;
  }
});
let saveT = 0;
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'q') { S.q = t.value; clearTimeout(findT); findT = setTimeout(runFind, 250); return; }
  if (t.id === 'rd-q' && S.reader) { S.reader.q = t.value; clearTimeout(docFindT); docFindT = setTimeout(runDocFind, 250); return; }
  const k = t.dataset && t.dataset.pf;
  if (k && S.project) { S.project[k] = t.value; clearTimeout(saveT); saveT = setTimeout(() => { saveProject(S.project); if (k === 'title') paintSide(); }, 400); return; }
  const mid = t.dataset && t.dataset.cardMemo;
  if (mid) { const c = S.cards.find((x) => x.id === mid); if (c) { c.memo = t.value; clearTimeout(saveT); saveT = setTimeout(() => saveCard(c), 400); } }
});
document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'q-doc') { S.qDoc = t.value; runFind(); }
  else if (t.id === 'ask-scope') S.askScope = t.value;
  else if (t.id === 'dig-mode') { S.settings.digMode = t.value; saveSettings(); }
  else if (t.id === 'ask-sel') { ASK = S.chats.find((x) => x.id === t.value) || null; viewAsk(); }
  else if (t.id === 'project-sel') selectProject(t.value);
  else if (t.id === 'rd-pg') { const n = parseInt(t.value, 10); if (n) goPage(n); }
  else if (t.id === 'files') { await addFiles(Array.from(t.files)); t.value = ''; redraw('library'); paintSide(); }
  else if (t.id === 'folder-in') { const fs = Array.from(t.files); t.value = ''; if (fs.length) await syncFolder(fs); }
});
document.addEventListener('dragover', (e) => { const d = e.target.closest && e.target.closest('#drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
document.addEventListener('dragleave', (e) => { const d = e.target.closest && e.target.closest('#drop'); if (d) d.classList.remove('over'); });
document.addEventListener('drop', async (e) => { const d = e.target.closest && e.target.closest('#drop'); if (!d) return; e.preventDefault(); d.classList.remove('over'); await addFiles(Array.from(e.dataTransfer.files)); redraw('library'); paintSide(); });
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (e.key === 'Enter' && e.target.id === 'ask-in' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); askSend(); return; }
  if (e.key === 'Enter' && e.target.id === 'rd-pg') { e.preventDefault(); const n = parseInt(e.target.value, 10); if (n) goPage(n); return; }
  if (typing || $('.modal-wrap')) return;
  if (S.view === 'read' && S.reader && e.key === 'ArrowLeft') { e.preventDefault(); if (S.reader.page > 1) goPage(S.reader.page - 1); }
  else if (S.view === 'read' && S.reader && e.key === 'ArrowRight') { e.preventDefault(); goPage(S.reader.page + 1); }
  else if (e.key === '/') { e.preventDefault(); if (S.view !== 'find') show('find'); setTimeout(() => { const q = $('#q'); if (q) q.focus(); }, 30); }
});
const onSel = () => setTimeout(() => { if (S.view === 'read') selTool(readerSelection()); }, 10);
document.addEventListener('mouseup', onSel); document.addEventListener('touchend', onSel); document.addEventListener('keyup', (e) => { if (e.shiftKey) onSel(); });
document.addEventListener('scroll', () => selTool(null), true);
addEventListener('online', paintNet); addEventListener('offline', paintNet);
addEventListener('resize', () => { if (S.view === 'read' && S.reader && $('#rd-canvas')) { clearTimeout(saveT); saveT = setTimeout(() => drawPage(S.reader.id, S.reader.page), 200); } });
window.addEventListener('message', (e) => { if (e.origin !== location.origin || !e.data) return; if (e.data.type === 'yoai:save') { try { e.source.postMessage({ type: 'yoai:saved' }, location.origin); } catch (err) { /* ignore */ } } });

/* ---------------- start ---------------- */
async function start() {
  try { await DB.open(); S.persistent = true; } catch (e) { S.persistent = false; toast(e.message || '저장소를 열지 못했습니다.'); }
  if (S.persistent) {
    S.settings = { ...DEFAULTS, ...((await DB.get('kv', 'settings')) || {}) };
    S.projects = (await DB.all('projects')) || []; S.chats = (await DB.all('chats')) || []; S.cards = (await DB.all('cards')) || [];
    S.docs = ((await DB.all('docs')) || []).map(docMeta);
  }
  applyTheme();
  if (!S.projects.length) await newProject('기본 프로젝트');
  const last = S.persistent ? await DB.get('kv', 'lastProject') : null;
  S.project = S.projects.find((p) => p.id === last) || S.projects[0];
  S.view = S.docs.length ? 'ask' : 'library';
  paintShell();
  if (S.persistent) {
    try { const h = await DB.get('kv', 'folder'); if (h && h.queryPermission) { S.folder = { name: h.name, handle: h, perm: await h.queryPermission({ mode: 'read' }) }; paintStatus(); if (S.folder.perm === 'granted') setTimeout(() => syncFolder(), 600); } } catch (e) { /* no folder */ }
    setTimeout(() => indexLibrary(), 900);
  } else toast('이 브라우저에서는 저장이 되지 않습니다(비공개 창 등).');
}
function lockView() {
  const n = window.Door.len('yoai'); let pin = '', fails = 0, busy = false;
  $('#app').innerHTML = `<div class="lock"><div class="lock-card"><span class="mark" style="width:44px;height:44px;font-size:17px;margin:0 auto">YO</span><h1>YO아이</h1><p>비밀번호를 입력하세요</p><div class="dots">${'<i></i>'.repeat(n)}</div>
    <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button data-d="${d}">${d}</button>`).join('')}<button class="fn" data-d="clr">지우기</button><button data-d="0">0</button><button class="fn" data-d="del">←</button></div>
    <label style="display:inline-flex;gap:6px;align-items:center;margin-top:12px;font-size:.75rem;color:var(--muted)"><input type="checkbox" id="rm"> 이 기기에서 30일 동안 묻지 않기</label></div></div>`;
  const draw = () => $$('.dots i').forEach((el, i) => el.classList.toggle('on', i < pin.length));
  const press = (d) => {
    if (busy) return;
    if (d === 'del') pin = pin.slice(0, -1); else if (d === 'clr') pin = ''; else if (pin.length < n) pin += d;
    draw();
    if (pin.length === n) {
      busy = true;
      setTimeout(() => {
        if (window.Door.check('yoai', pin)) { window.Door.open('yoai', $('#rm').checked); document.removeEventListener('keydown', kd); start(); return; }
        fails++; pin = ''; draw(); const c = $('.lock-card'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
        if (fails >= 5) { $('.lock-card p').textContent = '잠시 후 다시 시도하세요'; setTimeout(() => { busy = false; fails = 0; $('.lock-card p').textContent = '비밀번호를 입력하세요'; }, 15000); } else busy = false;
      }, 30);
    }
  };
  $('.pad').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) press(b.dataset.d); });
  const kd = (e) => { if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); };
  document.addEventListener('keydown', kd);
}
window.YOAI = { S, AI, OCR, ocrAll, cleanOcr, searchLib, parseQuery, libLoad, footnote, addFiles, syncFolder, indexLibrary, gatherSources, digestAll, DIG, keyParts, extractFacts, showDigest };
if (window.Door && window.Door.isOpen('yoai')) start(); else lockView();
