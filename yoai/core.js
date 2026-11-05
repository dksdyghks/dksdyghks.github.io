/* YO아이 — 바탕: 저장소, 문헌(PDF·한글·텍스트)의 쪽 글자, 찾기, 연결된 폴더, 스캔본 글자 읽기, 각주, 백업.
   서버도 로그인도 없다. 모든 기록은 이 브라우저의 저장소(IndexedDB)에 있고, 사용자가 고른 폴더에만 백업을 쓴다.
   바깥에서 들어오는 정보는 없다: 문헌은 사용자가 넣은 파일뿐이고, 법령·판례 링크는 누를 때만 새 창으로 연다. */
import { readHangul } from './hwp.js?v=585c905fca';
import { extractFacts, fixGlyphs } from './lawtext.js?v=585c905fca';
import { writeZip, readZip } from './zip.js?v=585c905fca';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const EMBED = window.parent !== window;
export const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);
export const kdate = (ts) => { const d = new Date(ts || Date.now()); return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`; };
export const kdt = (ts) => new Date(ts).toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export const ACT = {};   // data-act → handler(el, event)
export const UI = { show: () => {}, side: () => {}, title: () => {}, view: () => document.querySelector('#view') }; // filled in by app.js
export const ON_INPUT = []; // [(target) => boolean handled]
export const ON_CHANGE = [];

/* ---------------- 저장소 ---------------- */
export const DB = (() => {
  let db = null;
  const open = () => new Promise((res, rej) => {
    const req = indexedDB.open('yoai', 3);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const s of ['projects', 'chats', 'docs', 'cards', 'reads', 'ideas']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
    };
    req.onsuccess = () => { db = req.result; db.onversionchange = () => db.close(); res(db); };
    req.onerror = () => rej(req.error);
    req.onblocked = () => rej(new Error('다른 창에 열린 YO아이 때문에 저장소를 열지 못했습니다. 다른 창을 닫고 다시 여세요.'));
  });
  const run = (st, mode, fn) => new Promise((res, rej) => { if (!db) { res(undefined); return; } let out; const t = db.transaction(st, mode); const r = fn(t.objectStore(st)); if (r) r.onsuccess = () => { out = r.result; }; t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('저장하지 못했습니다')); });
  return { open, get: (s, k) => run(s, 'readonly', (o) => o.get(k)), all: (s) => run(s, 'readonly', (o) => o.getAll()), put: (s, v, k) => run(s, 'readwrite', (o) => (k === undefined ? o.put(v) : o.put(v, k))), del: (s, k) => run(s, 'readwrite', (o) => o.delete(k)), ok: () => !!db };
})();
export const DEFAULTS = { theme: 'auto', read: 'pdf' };
export const S = { settings: { ...DEFAULTS }, projects: [], chats: [], docs: [], cards: [], reads: [], ideas: [], project: null, view: 'home', q: '', qDoc: '', reader: null, persistent: false, folder: null, backupDir: null, sync: null, indexing: null, wiped: false };
let dirtyT = 0;
export function touched() { if (S.wiped) return; clearTimeout(dirtyT); dirtyT = setTimeout(() => autoBackup(false), 20000); }
export async function saveSettings() { applyTheme(); if (S.wiped) return; try { await DB.put('kv', S.settings, 'settings'); } catch (e) { /* ignore */ } }
export const saveProject = (p) => { p.updatedAt = Date.now(); touched(); return DB.put('projects', p).catch((e) => toast('저장하지 못했습니다: ' + e.message)); };
export const saveCard = (c) => { c.updatedAt = Date.now(); touched(); return DB.put('cards', c).catch((e) => toast('카드를 저장하지 못했습니다: ' + e.message)); };
export const saveRead = (r) => { r.updatedAt = Date.now(); touched(); return DB.put('reads', r).catch((e) => toast('읽기 카드를 저장하지 못했습니다: ' + e.message)); };
export const saveIdea = (r) => { r.updatedAt = Date.now(); touched(); return DB.put('ideas', r).catch((e) => toast('아이디어를 저장하지 못했습니다: ' + e.message)); };
export function logEvent(p, text) { if (!p) return; p.log = (p.log || []).concat({ at: Date.now(), text }).slice(-300); }
export function applyTheme() { const r = document.documentElement; if (S.settings.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', S.settings.theme); }
let toastT = 0;
export function toast(m) { let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); } t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3400); }

/* ---------------- 문헌: 쪽마다의 글자를 통째로 보관 ---------------- */
const PDFJS_VENDOR = new URL('./vendor/pdfjs-4.10.38/', import.meta.url).href;
let pdfjsP = null;
export const pdfjsLib = () => { if (!pdfjsP) pdfjsP = import('./pdf.js?v=585c905fca').then((m) => { m.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.js?v=585c905fca', import.meta.url).href; return m; }); return pdfjsP; };
// Korean journal PDFs often use CID fonts (Adobe-Korea1) whose letters cannot be read without these maps
export const pdfOpen = async (bytes) => (await pdfjsLib()).getDocument({ data: new Uint8Array(bytes.slice(0)), cMapUrl: PDFJS_VENDOR + 'cmaps/', cMapPacked: true, standardFontDataUrl: PDFJS_VENDOR + 'standard_fonts/' }).promise;
export const TEXT_V = 3; // bump when the way page text is read changes, so every document is read again once
export const docMeta = (d) => ({ isJudg: !!d.isJudg, judgSum: d.judgSum || null, id: d.id, title: d.title, author: d.author, year: d.year, venue: d.venue, page1: d.page1 || '', kind: d.kind, size: d.size, npages: d.npages || 0, addedAt: d.addedAt, folder: d.folder || '', sig: d.sig || '', indexed: Array.isArray(d.pages) && d.tv === TEXT_V, blank: !!d.blank, chars: d.chars || 0, textOnly: !!d.textOnly, ocr: !!d.ocr, mine: !!d.mine, exclude: !!d.exclude, cite: d.cite || {}, hasFacts: !!d.facts, nnotes: d.nnotes || 0 });
async function pdfPageCount(bytes) { try { const doc = await pdfOpen(bytes); const n = doc.numPages; doc.destroy(); return n; } catch (e) { return 0; } }
async function pdfText(bytes) {
  const doc = await pdfOpen(bytes); const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    pages.push(fixGlyphs(tc.items.map((it) => (it.str || '') + (it.hasEOL ? '\n' : '')).join('')).replace(/[ \t]+\n/g, '\n'));
  }
  doc.destroy(); return pages;
}
// text and 한글 documents have no printed pages: they are kept in parts of about 1,800 characters, cut at paragraph ends
export function chunkText(t) {
  const out = []; let cur = '';
  for (const para of String(t || '').split(/\n/)) { if (cur && cur.length + para.length > 1800) { out.push(cur); cur = ''; } cur += (cur ? '\n' : '') + para; }
  if (cur) out.push(cur); return out.length ? out : [''];
}
export async function docPages(id) {
  const d = await DB.get('docs', id); if (!d) return null;
  if (!Array.isArray(d.pages) || d.tv !== TEXT_V || d.chars === undefined) {
    if (d.kind === 'pdf') d.pages = d.bytes ? await pdfText(d.bytes) : (d.pages || []);
    else if (d.kind === 'hwp' && d.bytes) { const r = await readHangul(d.bytes, d.title); d.pages = chunkText(r.text); if (r.notes.length) d.pages.push(...chunkText('[각주]\n' + r.notes.map((n, i) => `${i + 1}) ${n}`).join('\n'))); d.nnotes = r.notes.length; }
    else if (!Array.isArray(d.pages)) d.pages = chunkText(d.text || '');
    d.tv = TEXT_V; d.chars = d.pages.join('').replace(/\s+/g, '').length; d.blank = d.chars < 50;
    d.facts = d.blank ? undefined : extractFacts(d.pages);
    await DB.put('docs', d);
    const m = S.docs.find((x) => x.id === id); if (m) Object.assign(m, docMeta(d));
  }
  return { id, pages: d.pages, facts: d.facts };
}
export async function docFull(id) { return DB.get('docs', id); }
const KIND_OF = (name, type) => { const ext = (name.split('.').pop() || '').toLowerCase(); return ext === 'pdf' || type === 'application/pdf' ? 'pdf' : ext === 'hwp' || ext === 'hwpx' ? 'hwp' : ext === 'docx' ? 'docx' : ['txt', 'md', 'text'].includes(ext) || (type || '').startsWith('text/') ? 'text' : null; };
/* Word(.docx): 본문 문단과 각주를 글자로 읽는다(서식은 버린다) */
export async function docxText(bytes) {
  const z = await readZip(bytes), dec = (n) => (z.get(n) ? new TextDecoder().decode(z.get(n)) : '');
  const ent = (x) => x.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
  const paras = (xml) => (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map((p) => ent([...p.replace(/<w:tab\/>/g, '<w:t>\t</w:t>').replace(/<w:br[^>]*\/>/g, '<w:t>\n</w:t>').matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')).replace(/[ \t]+/g, ' ').trim());
  const body = dec('word/document.xml'); if (!body) throw new Error('Word 문서가 아닙니다.');
  const notes = (dec('word/footnotes.xml').match(/<w:footnote [^>]*w:id="(\d+)"[\s\S]*?<\/w:footnote>/g) || []).filter((f) => !/w:type="(separator|continuationSeparator|continuationNotice)"/.test(f)).map((f) => paras(f).join(' ').trim()).filter(Boolean);
  return paras(body).join('\n') + (notes.length ? '\n[각주]\n' + notes.map((n, i) => `${i + 1}) ${n}`).join('\n') : '');
}
export async function addFiles(files, opts = {}) {
  const ids = [];
  for (const f of files) {
    const kind = KIND_OF(f.name, f.type);
    if (!kind) { if (!opts.quiet) toast(`${f.name}: PDF, 한글(.hwp·.hwpx), Word(.docx), 텍스트 파일만 넣을 수 있습니다.`); continue; }
    const doc = { id: uid(), title: f.name.replace(/\.[^.]+$/, ''), author: '', year: '', venue: '', size: f.size, addedAt: Date.now(), kind: kind === 'docx' ? 'text' : kind, cite: {}, ...(opts.folder ? { folder: opts.folder, sig: opts.sig } : {}), ...(opts.mine ? { mine: true } : {}) };
    try {
      if (kind === 'pdf') { doc.bytes = await f.arrayBuffer(); doc.npages = await pdfPageCount(doc.bytes); }
      else if (kind === 'hwp') { doc.bytes = await f.arrayBuffer(); const r = await readHangul(doc.bytes, f.name); doc.pages = chunkText(r.text); if (r.notes.length) doc.pages.push(...chunkText('[각주]\n' + r.notes.map((n, i) => `${i + 1}) ${n}`).join('\n'))); doc.nnotes = r.notes.length; doc.tv = TEXT_V; doc.npages = doc.pages.length; doc.chars = doc.pages.join('').replace(/\s+/g, '').length; doc.blank = doc.chars < 50; doc.facts = doc.blank ? undefined : extractFacts(doc.pages); }
      else if (kind === 'docx') doc.text = await docxText(await f.arrayBuffer());
      else doc.text = await f.text();
    } catch (e) { if (!opts.quiet) toast(`${f.name}: ${e.message || '읽지 못했습니다'}`); continue; }
    try { await DB.put('docs', doc); }
    catch (e) {
      if (kind !== 'pdf') { toast(`${f.name}: 저장 공간이 부족해 넣지 못했습니다.`); continue; }
      try { doc.pages = await pdfText(doc.bytes); doc.tv = TEXT_V; doc.bytes = null; doc.textOnly = true; await DB.put('docs', doc); toast(`저장 공간이 부족해 ‘${doc.title}’은(는) 본문 글자만 보관합니다.`); }
      catch (e2) { toast(`${f.name}: 저장 공간이 부족해 넣지 못했습니다.`); continue; }
    }
    S.docs.push(docMeta(doc)); ids.push(doc.id);
  }
  if (ids.length && !opts.quiet) toast(`서재에 ${ids.length}개 문헌을 넣었습니다. 본문을 읽어 찾을 수 있게 합니다.`);
  if (ids.length) { LIB = null; indexLibrary(); touched(); }
  return ids;
}
export async function removeDoc(id) { await DB.del('docs', id); S.docs = S.docs.filter((d) => d.id !== id); LIB = null; closePdf(); touched(); }
async function replaceDoc(id, f, sig) {
  const d = await DB.get('docs', id); if (!d) return;
  d.size = f.size; d.sig = sig; for (const k of ['pages', 'blank', 'chars', 'textOnly', 'facts', 'tv', 'ocr', 'nnotes']) delete d[k];
  if (d.kind === 'pdf') { d.bytes = await f.arrayBuffer(); d.npages = await pdfPageCount(d.bytes); } else if (d.kind === 'hwp') d.bytes = await f.arrayBuffer(); else d.text = await f.text();
  await DB.put('docs', d); LIB = null; closePdf();
  const i = S.docs.findIndex((x) => x.id === id); if (i >= 0) S.docs[i] = docMeta(d);
}
export const docOf = (id) => S.docs.find((d) => d.id === id) || null;
export async function updateDoc(id, patch) { const full = await DB.get('docs', id); if (!full) return; Object.assign(full, patch); await DB.put('docs', full); const d = docOf(id); if (d) Object.assign(d, docMeta(full)); touched(); }

/* ---------------- 찾기: 모든 문헌의 모든 쪽 ---------------- */
export let LIB = null;
export const resetLib = () => { LIB = null; };
const libKey = () => S.docs.filter((d) => d.indexed && !d.blank).map((d) => `${d.id}:${d.sig || d.size}`).join(',');
export async function libLoad() {
  const key = libKey(); if (LIB && LIB.key === key) return LIB;
  const docs = [];
  for (const d of S.docs) { if (!d.indexed || d.blank) continue; const pg = await docPages(d.id); if (!pg) continue; docs.push({ id: d.id, pages: pg.pages, norm: pg.pages.map((t) => t.toLowerCase().replace(/\s+/g, ' ')), facts: pg.facts }); }
  LIB = { key, docs }; return LIB;
}
const WORD_RE = /[^0-9a-zÀ-ɏ가-힣一-鿿ㄱ-ㆎ]+/;
export function parseQuery(q) {
  const phrases = [], neg = [];
  let rest = String(q || '').replace(/["“”]([^"“”]+)["“”]/g, (_, a) => { const p = a.toLowerCase().replace(/\s+/g, ' ').trim(); if (p) phrases.push(p); return ` ${a} `; });
  rest = rest.replace(/(^|\s)-(\S+)/g, (_, s, w) => { neg.push(w.toLowerCase()); return ' '; });
  const terms = new Set(), words = [];
  for (const w of rest.toLowerCase().split(WORD_RE)) {
    if (!w) continue; if (w.length > 1) words.push(w);
    if (/[가-힣一-鿿ㄱ-ㆎ]/.test(w)) { if (w.length === 1) terms.add(w); else for (let i = 0; i + 1 < w.length; i++) terms.add(w.slice(i, i + 2)); }
    else if (w.length > 1 || /\d/.test(w)) terms.add(w);
  }
  return { terms: [...terms], words, phrases, neg };
}
export function searchLib(lib, q, k = 50, only = '') {
  const pq = typeof q === 'string' ? parseQuery(q) : q; if (!pq.terms.length) return [];
  const docs = only ? lib.docs.filter((d) => d.id === only) : lib.docs;
  let N = 0, tot = 0; for (const d of docs) for (const p of d.norm) { N++; tot += p.length; }
  if (!N) return [];
  const avg = tot / N || 1;
  const idf = pq.terms.map((t) => { let n = 0; for (const d of docs) for (const p of d.norm) if (p.includes(t)) n++; return n ? Math.log(1 + (N - n + 0.5) / (n + 0.5)) : 0; });
  const whole = pq.words.join(' '); const out = [];
  for (const d of docs) d.norm.forEach((p, i) => {
    if (pq.phrases.some((ph) => !p.includes(ph)) || pq.neg.some((w) => p.includes(w))) return;
    let sc = 0, hit = 0;
    for (let j = 0; j < pq.terms.length; j++) { if (!idf[j]) continue; let tf = 0, at = p.indexOf(pq.terms[j]); while (at >= 0 && tf < 30) { tf++; at = p.indexOf(pq.terms[j], at + 1); } if (!tf) continue; hit++; sc += idf[j] * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * p.length / avg)); }
    if (!sc) return;
    sc *= 0.4 + 0.6 * hit / pq.terms.length;
    if (whole.length > 3 && p.includes(whole)) sc *= 1.6;
    for (const w of pq.words) if (w.length > 1 && p.includes(w)) sc *= 1.15;
    out.push({ id: d.id, page: i + 1, score: sc });
  });
  out.sort((a, b) => b.score - a.score); return out.slice(0, k);
}
let indexP = null;
export const hooks = { status: () => {}, side: () => {}, redraw: () => {} };
export function indexLibrary() {
  if (indexP) return indexP;
  indexP = (async () => {
    for (let round = 0; round < 3; round++) {
      const todo = S.docs.filter((d) => !d.indexed); if (!todo.length) break;
      S.indexing = { done: 0, total: todo.length }; hooks.status();
      for (const d of todo) { try { await docPages(d.id); } catch (e) { await updateDoc(d.id, { pages: [], tv: TEXT_V, blank: true }); } S.indexing.done++; hooks.status(); }
    }
    S.indexing = null; LIB = null; hooks.status(); hooks.side(); hooks.redraw();
  })().finally(() => { indexP = null; });
  return indexP;
}
export function libStats() {
  const ok = S.docs.filter((d) => d.indexed && !d.blank);
  return { n: S.docs.length, ok: ok.length, pages: ok.reduce((n, d) => n + (d.npages || 0), 0), chars: ok.reduce((n, d) => n + (d.chars || 0), 0), blank: S.docs.filter((d) => d.blank).length, size: S.docs.reduce((n, d) => n + (d.size || 0), 0) };
}

/* ---------------- 연결된 폴더: 그 안의 문헌을 늘 맞춰 둔다 ---------------- */
const FOLDER_FILE = /\.(pdf|txt|md|hwp|hwpx)$/i;
async function* walkDir(dir, path = '') {
  for await (const [name, h] of dir.entries()) {
    if (name.startsWith('.') || name.startsWith('~$')) continue;
    if (h.kind === 'directory') yield* walkDir(h, `${path}${name}/`);
    else if (FOLDER_FILE.test(name)) yield { path: path + name, get: () => h.getFile() };
  }
}
export async function connectFolder() {
  if (window.showDirectoryPicker) {
    let h; try { h = await window.showDirectoryPicker({ id: 'yoai-library', mode: 'read' }); } catch (e) { return false; }
    S.folder = { name: h.name, handle: h, perm: 'granted' };
    try { await DB.put('kv', h, 'folder'); } catch (e) { /* kept for this session */ }
    await syncFolder(); return true;
  }
  const inp = $('#folder-in'); if (inp) inp.click(); return false;
}
export async function syncFolder(files) {
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
      if (perm !== 'granted') { S.folder.perm = 'prompt'; hooks.status(); return; }
      S.folder.perm = 'granted'; root = h.name;
      for await (const e of walkDir(h)) list.push(e);
    }
  } catch (e) { toast('폴더를 읽지 못했습니다: ' + (e.message || e)); return; }
  S.sync = { done: 0, total: list.length }; hooks.status();
  const seen = new Set(); let added = 0, changed = 0, removed = 0;
  for (const e of list) {
    const key = `${root}/${e.path}`; seen.add(key);
    try {
      const f = await e.get(); const sig = `${f.size}|${f.lastModified}`;
      const old = S.docs.find((d) => d.folder === key);
      if (!old) { if ((await addFiles([f], { folder: key, sig, quiet: true })).length) added++; }
      else if (old.sig !== sig) { await replaceDoc(old.id, f, sig); changed++; }
    } catch (err) { /* tried again next time */ }
    S.sync.done++; hooks.status();
  }
  for (const d of S.docs.filter((x) => x.folder && x.folder.startsWith(root + '/') && !seen.has(x.folder))) { await removeDoc(d.id); removed++; }
  S.sync = null; S.settings.folderName = root; S.settings.folderAt = Date.now(); saveSettings();
  toast(added || changed || removed ? `폴더 ‘${root}’: 새 문헌 ${added}개, 바뀐 문헌 ${changed}개, 빠진 문헌 ${removed}개를 맞췄습니다.` : `폴더 ‘${root}’: 바뀐 문헌이 없습니다.`);
  LIB = null; hooks.side(); hooks.status(); hooks.redraw();
  indexLibrary();
}

/* ---------------- 스캔본 글자 읽기(OCR): 이 컴퓨터 안에서 ---------------- */
const TESS = new URL('./vendor/tesseract-7.0.0/', import.meta.url).href;
export const OCR = { run: false, stop: false, done: 0, total: 0, doc: '', page: '' };
let ocrWorker = null, ocrError = null;
async function ocrEngine() {
  if (ocrWorker) return ocrWorker;
  const T = (await import(TESS + 'tesseract.esm.min.js')).default; ocrError = null;
  ocrWorker = await T.createWorker(['kor', 'eng'], 1, { workerPath: TESS + 'worker.min.js', corePath: TESS + 'core', langPath: TESS + 'lang', gzip: true, cacheMethod: 'none', errorHandler: (e) => { ocrError = e; } });
  if (ocrError) throw new Error('글자 인식 엔진을 시작하지 못했습니다');
  return ocrWorker;
}
function cleanOcr(t) {
  t = String(t || '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const spaced = (t.match(/[가-힣] (?=[가-힣])/g) || []).length, hangul = (t.match(/[가-힣]/g) || []).length;
  if (hangul > 20 && spaced / hangul > 0.45) t = t.replace(/([가-힣]) (?=[가-힣])/g, '$1');
  return t;
}
export const scanned = () => S.docs.filter((d) => d.kind === 'pdf' && !d.textOnly && d.blank && d.indexed);
async function ocrDoc(d) {
  const full = await DB.get('docs', d.id); if (!full || !full.bytes) throw new Error('원본 PDF가 남아 있지 않습니다');
  const doc = await pdfOpen(full.bytes), engine = await ocrEngine();
  const pages = Array.isArray(full.pages) ? full.pages.slice() : [];
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      if (OCR.stop) break;
      if (pages[i - 1] && pages[i - 1].replace(/\s+/g, '').length >= 30) continue;
      OCR.page = `${i}/${doc.numPages}쪽`; hooks.status();
      const pg = await doc.getPage(i), v1 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: Math.min(3.2, 2000 / Math.max(v1.width, v1.height)) });
      canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pg.render({ canvasContext: ctx, viewport: vp }).promise;
      const r = await engine.recognize(canvas); if (ocrError) throw new Error('글자 인식 엔진에 문제가 생겼습니다');
      pages[i - 1] = cleanOcr(r && r.data && r.data.text);
    }
  } finally { doc.destroy(); canvas.width = canvas.height = 0; }
  full.pages = pages; full.ocr = true; full.tv = TEXT_V;
  full.chars = pages.join('').replace(/\s+/g, '').length; full.blank = full.chars < 50; full.facts = full.blank ? undefined : extractFacts(pages);
  await DB.put('docs', full); Object.assign(d, docMeta(full)); LIB = null;
}
export async function ocrAll(only, done) {
  if (OCR.run) return;
  const todo = only ? [docOf(only)].filter(Boolean) : scanned();
  if (!todo.length) { toast('글자를 읽을 스캔본이 없습니다.'); return; }
  Object.assign(OCR, { run: true, stop: false, done: 0, total: todo.length, doc: '', page: '' }); hooks.status();
  let ok = 0; const fail = [];
  try {
    for (const d of todo) {
      if (OCR.stop) break; OCR.doc = d.title; OCR.page = ''; hooks.status();
      try { await ocrDoc(d); if (!d.blank) ok++; else if (!OCR.stop) fail.push(`「${d.title}」: 읽을 수 있는 글자를 찾지 못했습니다(흐리거나 손글씨일 수 있습니다)`); }
      catch (e) { fail.push(`「${d.title}」: ${e.message || e}`); if (ocrWorker) { try { await ocrWorker.terminate(); } catch (e2) { /* ignore */ } ocrWorker = null; } }
      OCR.done++; hooks.status();
    }
  } finally {
    const stopped = OCR.stop; Object.assign(OCR, { run: false, stop: false, doc: '', page: '' });
    if (ocrWorker) { try { await ocrWorker.terminate(); } catch (e) { /* ignore */ } ocrWorker = null; }
    hooks.status(); hooks.side(); hooks.redraw();
    if (done) done({ ok, fail, stopped });
  }
}

/* ---------------- 각주: 박사논문에서 쓴 양식 그대로 ----------------
   논문  저자, “제목”, 『학술지』 제○권 제○호 (발행기관, 2024. 3.), 195면.
   단행본 저자, 『책』 (출판사, 2026), 122면.
   보고서 저자, “제목”, (발행기관, 2017), 15면.     학위논문 저자, “제목”, (서울대학교 박사학위논문, 2013), 15면.
   다시 인용  저자, 앞의 논문, 375-376면.        쪽은 학술지에 인쇄된 쪽(○면); 첫 쪽을 모르면 PDF 쪽으로 적고 표시한다. */
export const CITE_KINDS = [['article', '학술지 논문'], ['book', '단행본'], ['case', '판결·결정'], ['report', '연구보고서'], ['thesis', '학위논문'], ['chapter', '단행본의 장(편저)'], ['web', '웹 자료'], ['foreign', '외국 문헌'], ['other', '기타']];
export function where(doc, a, b) {
  b = b || a;
  if (doc && doc.kind !== 'pdf') return { ui: a === b ? `${a}번째 부분` : `${a}–${b}번째 부분`, note: '', known: false };
  const off = doc && +doc.page1 > 0 ? +doc.page1 - 1 : null;
  const rng = (p, q) => (q > p ? `${p}-${q}` : `${p}`);
  if (off !== null) return { ui: `${rng(a + off, b + off)}면 (PDF ${rng(a, b)}쪽)`, note: `${rng(a + off, b + off)}면`, known: true };
  return { ui: `PDF ${rng(a, b)}쪽`, note: `PDF ${rng(a, b)}쪽`, known: false };
}
const againWord = (k) => (k === 'book' ? '책' : k === 'report' ? '보고서' : k === 'web' ? '자료' : '논문');
export function footnote(doc, page, page2, opts = {}) {
  if (!doc) return '(서재에서 지운 문헌)';
  const c = doc.cite || {}, k = c.kind || (doc.venue ? 'article' : 'other');
  const a = doc.author || '', t = doc.title || '', y = c.date || doc.year || '';
  const pg = page ? where(doc, page, page2).note : '';
  const tail = pg ? `, ${pg}.` : '.';
  if (k === 'case') return `${String(c.caseCite || t).replace(/[.。]\s*$/, '')}.`; // 판례는 언제나 온전히: 대법원 1993. 12. 10. 선고 93다12947 판결.
  if (opts.again) return `${a ? a + ', ' : ''}앞의 ${againWord(k)}${opts.short ? ` (${opts.short})` : ''}${tail}`;
  const paren = (...xs) => { const s = xs.filter(Boolean).join(', '); return s ? ` (${s})` : ''; };
  switch (k) {
    case 'article': return `${a ? a + ', ' : ''}“${t}”, ${doc.venue ? `『${doc.venue.replace(/^[『「]|[』」]$/g, '')}』` : ''}${c.vol ? ' ' + c.vol : ''}${paren(c.publisher, y)}${tail}`.replace(/, ,/g, ',');
    case 'book': return `${a ? a + ', ' : ''}『${t}』${paren(c.publisher, y)}${tail}`;
    case 'chapter': return `${a ? a + ', ' : ''}“${t}”, ${c.editor ? c.editor + ' 편, ' : ''}『${doc.venue || ''}』${paren(c.publisher, y)}${tail}`;
    case 'report': return `${a ? a + ', ' : ''}“${t}”,${paren(c.publisher, y)}${tail}`;
    case 'thesis': return `${a ? a + ', ' : ''}“${t}”,${paren(c.publisher ? c.publisher + (/학위논문/.test(c.publisher) ? '' : ' 학위논문') : '학위논문', y)}${tail}`;
    case 'web': return `“${t}”, ${c.url || ''}${c.checked ? `(${c.checked} 확인)` : ''}.`;
    case 'foreign': { const raw = pg.replace(/^PDF\s*/, '').replace(/[면쪽]$/, ''); return `${a ? a + ', ' : ''}“${t}”, ${doc.venue || c.publisher || ''}${raw ? `, ${raw.includes('-') ? 'pp.' : 'p.'}${raw}${pg.startsWith('PDF') ? '(PDF)' : ''}` : ''}${y ? ` (${y})` : ''}.`; }
    default: return `${a ? a + ', ' : ''}“${t}”${doc.venue ? `, ${doc.venue}` : ''}${y ? `, ${y}` : ''}${tail}`;
  }
}
/* a run of citations in document order: the second time a work comes back it is “앞의 논문”;
   when an author has two works of the same sort, the short title is added so it is never ambiguous */
export function citer() {
  const seen = new Set(), byAuthor = new Map(), seenDocs = new Map();
  return (doc, page, page2) => {
    if (!doc) return footnote(null);
    seenDocs.set(doc.id, doc);
    const k = (doc.cite && doc.cite.kind) || 'article', key = `${doc.author}|${againWord(k)}`;
    if (!byAuthor.has(key)) byAuthor.set(key, new Set()); byAuthor.get(key).add(doc.id);
    if (!seen.has(doc.id) || !doc.author || k === 'case') { seen.add(doc.id); return footnote(doc, page, page2); }
    // as in the dissertation: “임지봉, 앞의 논문 (2022), 72-73면.” — the year tells two works apart; the short title only when the years are the same too
    const yearOf = (d) => (String((d.cite && d.cite.date) || d.year || '').match(/(?:19|20)\d{2}/) || [''])[0];
    const others = [...byAuthor.get(key)].filter((id) => id !== doc.id).map((id) => seenDocs.get(id)).filter(Boolean);
    const short = !others.length ? '' : yearOf(doc) && !others.some((o) => yearOf(o) === yearOf(doc)) ? yearOf(doc) : `“${doc.title.split(/[:\-–—]/)[0].trim().slice(0, 16)}${doc.title.length > 16 ? '…' : ''}”`;
    return footnote(doc, page, page2, { again: true, short });
  };
}
export const pageLabel = (doc, p) => where(doc, p).ui;
export { guessMeta } from './lawtext.js?v=585c905fca';

/* ---------------- 창, 파일 ---------------- */
export function modal(html, onClose) {
  const w = document.createElement('div'); w.className = 'modal-wrap'; w.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(w);
  const close = () => { w.remove(); document.removeEventListener('keydown', key); if (onClose) onClose(); };
  const key = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  w.addEventListener('click', (e) => { if (e.target === w || e.target.closest('[data-close]')) close(); });
  return { el: w, close };
}
export function closeModals() { $$('.modal-wrap').forEach((x) => x.remove()); }
export function confirmBox(text, okLabel) {
  return new Promise((res) => {
    const m = modal(`<h2>확인</h2><p class="prose">${esc(text)}</p><div class="modal-foot"><button class="btn" data-close>취소</button><button class="btn primary" id="cb-ok">${esc(okLabel || '확인')}</button></div>`, () => res(false));
    $('#cb-ok', m.el).addEventListener('click', () => { res(true); m.close(); });
  });
}
export function formBox(title, fields, opts = {}) {
  return new Promise((res) => {
    let done = false;
    const f = (x, i) => x.type === 'select' ? `<label class="field"><span>${esc(x.label)}</span><select id="fb${i}">${x.options.map(([v, l]) => `<option value="${esc(v)}"${v === x.value ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`
      : x.type === 'textarea' ? `<label class="field"><span>${esc(x.label)}</span><textarea id="fb${i}" rows="${x.rows || 4}" placeholder="${esc(x.placeholder || '')}">${esc(x.value || '')}</textarea></label>`
      : `<label class="field"><span>${esc(x.label)}</span><input id="fb${i}" value="${esc(x.value || '')}" placeholder="${esc(x.placeholder || '')}" autocomplete="off"${x.type === 'date' ? ' type="date"' : ''}></label>`;
    const m = modal(`<h2>${esc(title)}</h2>${opts.intro || ''}${fields.map(f).join('')}<div class="modal-foot"><button class="btn" data-close>취소</button><button class="btn primary" id="fb-ok">${esc(opts.ok || '저장')}</button></div>`, () => { if (!done) res(null); });
    const ok = () => { done = true; const out = fields.map((_, i) => $('#fb' + i, m.el).value); res(out); m.close(); };
    $('#fb-ok', m.el).addEventListener('click', ok);
    m.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !e.isComposing) { e.preventDefault(); ok(); } });
    if (opts.onOpen) opts.onOpen(m);
    setTimeout(() => { const x = $('#fb0', m.el); if (x) x.focus(); }, 30);
  });
}
export function download(name, data, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
export const safeName = (s, fb) => (String(s || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || fb);
export async function copyText(text, done) { try { await navigator.clipboard.writeText(text); toast(done); } catch (e) { prompt('아래 내용을 복사하세요', text); } }
export let PDFDOC = null, renderTask = null;
export function setRender(t) { renderTask = t; }
export function closePdf() { if (renderTask) { try { renderTask.cancel(); } catch (e) { /* ignore */ } renderTask = null; } if (PDFDOC) { try { PDFDOC.doc.destroy(); } catch (e) { /* ignore */ } PDFDOC = null; } }
export async function pdfDocFor(id) {
  if (PDFDOC && PDFDOC.id === id) return PDFDOC.doc;
  closePdf();
  const d = await DB.get('docs', id); if (!d || !d.bytes || d.kind !== 'pdf') return null;
  const doc = await pdfOpen(d.bytes); PDFDOC = { id, doc }; return doc;
}

/* ---------------- 백업: 고른 폴더에 날마다 자동으로, 또는 파일로 ---------------- */
/* 판결 분석에서 사용자가 고친 정리(문헌 기록의 judg)는 백업에도 담는다: 시작할 때와 고칠 때 여기에 비춰 둔다 */
export const JUDG = new Map();
export function backupData() {
  return { app: 'yoai', v: 3, exportedAt: new Date().toISOString(), settings: { ...S.settings }, projects: S.projects, cards: S.cards, reads: S.reads, ideas: S.ideas, chats: S.chats,
    docs: S.docs.map((d) => ({ id: d.id, title: d.title, author: d.author, year: d.year, venue: d.venue, page1: d.page1, folder: d.folder, kind: d.kind, mine: d.mine, exclude: d.exclude, cite: d.cite, ...(JUDG.get(d.id) ? { judg: JUDG.get(d.id) } : {}) })) };
}
export const stamp = () => { const d = new Date(), z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}`; };
let backupBusy = false;
export async function autoBackup(force) {
  const h = S.backupDir; if (!h || backupBusy || S.wiped) return false;
  if (!force && S.settings.backupAt && Date.now() - S.settings.backupAt < 10 * 60 * 1000) { clearTimeout(dirtyT); dirtyT = setTimeout(() => autoBackup(false), 10 * 60 * 1000); return false; }
  backupBusy = true;
  try {
    let perm = await h.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted' && force) { try { perm = await h.requestPermission({ mode: 'readwrite' }); } catch (e) { /* needs a click */ } }
    if (perm !== 'granted') { S.backupState = 'prompt'; hooks.status(); return false; }
    const name = `YO아이-백업-${stamp()}.json`;
    const fh = await h.getFileHandle(name, { create: true }), w = await fh.createWritable();
    await w.write(JSON.stringify(backupData())); await w.close();
    const old = []; for await (const [n] of h.entries()) if (/^YO아이-백업-\d{8}\.json$/.test(n)) old.push(n);
    old.sort(); for (const n of old.slice(0, Math.max(0, old.length - 14))) { try { await h.removeEntry(n); } catch (e) { /* ignore */ } }
    S.settings.backupAt = Date.now(); S.backupState = 'ok'; await saveSettings(); hooks.status();
    return true;
  } catch (e) { S.backupState = 'error'; hooks.status(); return false; } finally { backupBusy = false; }
}
export async function chooseBackupDir() {
  if (!window.showDirectoryPicker) { toast('이 브라우저는 폴더에 자동으로 저장할 수 없습니다. 설정에서 백업 파일을 받아 두세요.'); return false; }
  let h; try { h = await window.showDirectoryPicker({ id: 'yoai-backup', mode: 'readwrite' }); } catch (e) { return false; }
  S.backupDir = h; S.settings.backupName = h.name; try { await DB.put('kv', h, 'backupDir'); } catch (e) { /* this session only */ }
  const ok = await autoBackup(true); if (ok) toast(`‘${h.name}’ 폴더에 백업했습니다. 앞으로 바뀐 내용이 있으면 자동으로 백업합니다.`);
  return ok;
}
export async function fullBackupZip() {
  const files = [{ name: 'yoai-backup.json', data: JSON.stringify(backupData()) }];
  for (const d of S.docs) { if (d.folder) continue; const full = await DB.get('docs', d.id); if (full && full.bytes) files.push({ name: `docs/${d.id}.${d.kind === 'hwp' ? 'hwp' : 'pdf'}`, data: new Uint8Array(full.bytes), store: true }); else if (full && full.text) files.push({ name: `docs/${d.id}.txt`, data: full.text }); }
  return writeZip(files);
}
export async function restoreFrom(file) {
  let data, z = null;
  if (/\.zip$/i.test(file.name)) { z = await readZip(await file.arrayBuffer()); const j = z.get('yoai-backup.json'); if (!j) throw new Error('YO아이 백업 파일이 아닙니다.'); data = JSON.parse(new TextDecoder().decode(j)); }
  else data = JSON.parse(await file.text());
  if (!data || data.app !== 'yoai') throw new Error('YO아이 백업 파일이 아닙니다.');
  let n = 0;
  const merge = async (store, list, key) => { for (const x of list || []) if (x && x.id && !S[key].some((y) => y.id === x.id)) { S[key].push(x); await DB.put(store, x); n++; } };
  await merge('projects', data.projects, 'projects'); await merge('cards', data.cards, 'cards'); await merge('reads', data.reads, 'reads'); await merge('ideas', data.ideas, 'ideas'); await merge('chats', data.chats, 'chats');
  for (const m of data.docs || []) {
    let doc = docOf(m.id) || (m.folder && S.docs.find((x) => x.folder === m.folder));
    const blob = z && [...z.keys()].find((k) => k.startsWith(`docs/${m.id}.`));
    if (!doc && blob) { if (m.judg) { JUDG.set(m.id, m.judg); m.isJudg = true; } const full = { ...m, size: z.get(blob).length, addedAt: Date.now(), ...(m.kind === 'text' ? { text: new TextDecoder().decode(z.get(blob)) } : { bytes: z.get(blob).buffer.slice(0) }) }; await DB.put('docs', full); S.docs.push(docMeta(full)); n++; continue; }
    if (!doc) continue;
    const full = await DB.get('docs', doc.id); if (!full) continue;
    for (const k of ['author', 'year', 'venue', 'page1']) if (!full[k] && m[k]) full[k] = m[k];
    if (m.cite && !Object.keys(full.cite || {}).length) full.cite = m.cite; if (m.mine) full.mine = true; if (m.exclude) full.exclude = true;
    if (m.judg && !full.judg) { full.judg = m.judg; full.isJudg = true; JUDG.set(full.id, m.judg); }
    await DB.put('docs', full); Object.assign(doc, docMeta(full));
  }
  LIB = null; indexLibrary();
  return n;
}
