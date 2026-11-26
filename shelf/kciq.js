// 연구실 책장 — KCI 법학 논문을 낱말로 찾기. The index kciq/ (made from the law papers gathered into shelf/kci/law/ by
// _tools/kci_index.py) holds, for every two letters next to each other in a paper's title, authors and journal, and in the
// start of its abstract, the papers that have them (two lists: in the title, else only in the abstract). A search keeps the
// papers holding every piece of every word asked — first those whose title holds them all, then those whose abstract does —
// each in the index's order (newest first). f.bin carries every paper's journal, month and times-cited, so the whole set
// is narrowed (by journal, by year) and ordered (최신·피인용) without reading a row. Rows for the page shown come from m/.
// The parts are fetched as needed and kept on this device until the index is made again, so a search asked again, or
// offline, is answered at once.
import * as store from './store.js?v=3dab24bfa8';

const BASE = new URL('./kciq/', import.meta.url);
const LETTERS = /[^0-9A-Za-zㄱ-ㆎ가-힣㐀-䶿一-鿿豈-﫿]+/g;
export const words = (q) => String(q || '').normalize('NFKC').replace(LETTERS, ' ').toLowerCase().split(' ').filter(Boolean);
// a word's ending particle, as typed ('직업의 자유', '헌법재판소의 결정'), is not asked for: '업의' would leave out every title
// that says '직업선택의'; a two-letter word (정의, 국가) is left as it is
const PARTICLE = /(?:으로서|에서|에게|으로|부터|까지|로서|의|은|는|이|가|을|를|에|와|과|로|도|만)$/;
export const bare = (w) => { if (!/[가-힣]$/.test(w) || w.length < 3) return w; const b = w.replace(PARTICLE, ''); return b.length >= 2 ? b : w; };
const piecesOf = (w) => { const out = []; for (let i = 0; i + 1 < w.length; i++) { const p = w.slice(i, i + 2); if (!/\d/.test(p) && !out.includes(p)) out.push(p); } return out; };
const shardOf = (p, n) => { let h = 0; for (let i = 0; i < p.length; i++) h = (Math.imul(h, 31) + p.charCodeAt(i)) >>> 0; return h % n; };

let verP = null;
function version() {
  return (verP ||= (async () => {
    let v = null;
    try { const r = await fetch(new URL('v.json', BASE), { cache: 'no-cache' }); if (r.ok) { v = await r.json(); if (v && v.n) store.put('kv', 'kq:v', v).catch(() => {}); } }
    catch (e) { /* offline: the last v.json kept on this device stands in, so the index (its parts also kept) still answers */ }
    if (!v || !v.n) v = await store.get('kv', 'kq:v').catch(() => null);
    if (!v || !v.n) { verP = null; return null; }
    v.stopSet = new Set(v.stop || []);
    forget(v.v);
    return v;
  })());
}
let forgot = false;   // the parts of an index made before this one are let go (once a session)
async function forget(cur) {
  if (forgot) return; forgot = true;
  try { for (const k of await store.keys('kv')) if (typeof k === 'string' && k.startsWith('kq:') && k !== 'kq:v' && !k.startsWith('kq:' + cur + ':')) store.del('kv', k).catch(() => {}); } catch (e) { /* kept */ }
}
const kept = new Map();   // the parts read in this session
async function part(v, name, read) {
  const key = 'kq:' + v.v + ':' + name;
  if (kept.has(key)) return kept.get(key);
  const p = (async () => {
    const have = await store.get('kv', key).catch(() => null);
    if (have != null) return have;
    if (!navigator.onLine) throw Object.assign(new Error('offline'), { code: 'offline' });
    const r = await fetch(new URL(name, BASE));
    if (!r.ok) throw Object.assign(new Error('kciq'), { code: 'unavailable' });
    const d = await read(r);
    store.put('kv', key, d).catch(() => {});
    return d;
  })();
  kept.set(key, p);
  p.catch(() => kept.delete(key));
  return p;
}
// f.bin: for every paper, journalIdx, ym (year*13+month, month 0 when unknown), cites, flags (bit0 원문 공개)
let fP = null;
function fields(v) {
  return (fP ||= part(v, 'f.bin', (r) => r.arrayBuffer()).then((buf) => {
    const dv = new DataView(buf), n = v.n, j = new Uint16Array(n), ym = new Uint16Array(n), c = new Uint16Array(n), fl = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const o = i * 7; j[i] = dv.getUint16(o, true); ym[i] = dv.getUint16(o + 2, true); c[i] = dv.getUint16(o + 4, true); fl[i] = dv.getUint8(o + 6); }
    return { j, ym, c, fl };
  }));
}
// one shard: its pieces and where each one's two lists are (title, abstract)
const dirs = new WeakMap();
function dirOf(buf) {
  if (dirs.has(buf)) return dirs.get(buf);
  const dv = new DataView(buf), n = dv.getUint16(0, true), dir = new Map();
  let off = 2 + n * 20;
  for (let i = 0; i < n; i++) {
    const o = 2 + i * 20, lists = [];
    for (let f = 0; f < 2; f++) { const len = dv.getUint32(o + 4 + f * 8, true); lists.push({ off, len, cnt: dv.getUint32(o + 8 + f * 8, true) }); off += len; }
    dir.set(String.fromCharCode(dv.getUint16(o, true), dv.getUint16(o + 2, true)), lists);
  }
  dirs.set(buf, dir);
  return dir;
}
function idsOf(buf, e) {
  const u8 = new Uint8Array(buf, e.off, e.len), out = new Uint32Array(e.cnt);
  let i = 0, k = 0, last = 0;
  while (i < u8.length && k < e.cnt) {
    let v = 0, s = 0, b;
    do { b = u8[i++]; v += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80);
    last += v; out[k++] = last;
  }
  return out;
}
// a piece's papers, ascending, each with where it holds the piece (0 title, 1 abstract)
function heldBy(buf, lists) {
  const parts = lists.map((e) => idsOf(buf, e));
  const n = parts[0].length + parts[1].length, ids = new Uint32Array(n), lvl = new Uint8Array(n);
  const at = [0, 0];
  for (let k = 0; k < n; k++) {
    let best = -1;
    for (let f = 0; f < 2; f++) if (at[f] < parts[f].length && (best < 0 || parts[f][at[f]] < parts[best][at[best]])) best = f;
    ids[k] = parts[best][at[best]++]; lvl[k] = best;
  }
  return { ids, lvl };
}
function intersect(lists) {
  lists.sort((a, b) => a.ids.length - b.ids.length);
  let ids = lists[0].ids, lvl = lists[0].lvl;
  for (let j = 1; j < lists.length && ids.length; j++) {
    const other = lists[j], keepI = [], keepL = [];
    let lo = 0;
    for (let k = 0; k < ids.length; k++) {
      const x = ids[k];
      let hi = other.ids.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (other.ids[mid] < x) lo = mid + 1; else hi = mid; }
      if (lo < other.ids.length && other.ids[lo] === x) { keepI.push(x); keepL.push(Math.max(lvl[k], other.lvl[lo])); }
    }
    ids = Uint32Array.from(keepI); lvl = Uint8Array.from(keepL);
  }
  return { ids, lvl };
}
const asked = new Map();   // a question's papers (their numbers in the index), while the app is open
async function matches(q) {
  const v = await version();
  if (!v) throw Object.assign(new Error('kciq'), { code: 'unavailable' });
  const key = words(q).join(' ');
  if (asked.has(key)) return { v, ...asked.get(key) };
  const ws = words(q).map((w) => ({ w, ps: piecesOf(bare(w)).filter((p) => !v.stopSet.has(p)) }));
  const used = ws.filter((x) => x.ps.length);
  if (!used.length) { const r = { ids: new Uint32Array(0), lvl: new Uint8Array(0), common: ws.length > 0, left: [] }; asked.set(key, r); return { v, ...r }; }
  const lists = await Promise.all(used.flatMap((x) => x.ps).map(async (p) => {
    const buf = await part(v, `p/${shardOf(p, v.shards)}.bin`, (r) => r.arrayBuffer());
    const e = dirOf(buf).get(p);
    return e ? heldBy(buf, e) : { ids: new Uint32Array(0), lvl: new Uint8Array(0) };
  }));
  const both = intersect(lists);
  const r = { ids: both.ids, lvl: both.lvl, common: false, left: ws.filter((x) => !x.ps.length).map((x) => x.w) };
  asked.set(key, r);
  return { v, ...r };
}
const blocks = new Map();
async function rowOf(v, id) {
  const b = Math.floor(id / v.block), key = v.v + ':' + b;
  if (!blocks.has(key)) blocks.set(key, part(v, `m/${b}.tsv`, (r) => r.text()).then((t) => t.split('\n')));
  const row = ((await blocks.get(key))[id - b * v.block] || '').split('\t');
  if (!row[0]) return null;
  const [kid, o, j, ym, vol, iss, fp, lp, open, cites, doi, authors, title, ab] = row;
  const jn = v.journals[Number(j)] || ['', '', 0];
  return { id: kid, o, journal: jn[0], publisher: jn[1], y: ym ? ym.slice(0, 4) : '', m: ym ? String(Number(ym.slice(4, 6))) : '',
    v: vol || '', i: iss || '', fp: fp || '', lp: lp || '', open: open === '1', c: Number(cites) || 0, doi: doi || '',
    a: authors ? authors.split('·') : [], t: title || '', ab: ab || '' };
}
const asc = (a, b) => a - b;
// a page of law papers that hold every word asked, narrowed and ordered as told:
//   q         the words (empty: every paper, for a journal's list or the newest)
//   journal   an index into v.journals (only that journal's papers)
//   y0, y1    the years to keep (inclusive)
//   sort      'rel' (title first, then abstract, each newest), 'new' (newest), 'cited' (most cited), 'issue' (a journal:
//             newest issue first) — 'rel' needs q; without q it falls back to 'new'
//   → { total, rows: [{…, at: 'title'|'abstract'}], common, left, journals: v.journals, n: v.n }
export async function search(q, { journal = -1, y0 = 0, y1 = 9999, sort = 'rel', page = 1, size = 20, facets = false } = {}) {
  const v = await version();
  if (!v) throw Object.assign(new Error('kciq'), { code: 'unavailable' });
  const f = await fields(v);
  const hasQ = words(q).length > 0;
  let ids, lvl = null, left = [], common = false;
  if (hasQ) { const m = await matches(q); ids = Array.from(m.ids); lvl = new Map(); for (let k = 0; k < m.ids.length; k++) lvl.set(m.ids[k], m.lvl[k]); left = m.left; common = m.common; }
  else { ids = Array.from({ length: v.n }, (_, i) => i); }
  const lvlOf = (id) => (lvl ? lvl.get(id) : 0);
  const lo = y0 * 13, hi = y1 * 13 + 12;   // ym = year*13 + month (0 when the month is unknown), so Dec and an unknown month of the next year never collide
  ids = ids.filter((i) => !f.ym[i] || (f.ym[i] >= lo && f.ym[i] <= hi));   // the year first, so the journal tally covers the whole answer
  let jsel = -1;   // journal may be an index, or "name\u0001publisher" (as a journal's name is tapped)
  if (typeof journal === 'string' && journal) { const [nm, pb] = journal.split('\u0001'); jsel = v.journals.findIndex((j) => j[0] === nm && (j[1] || '') === (pb || '')); }
  else if (typeof journal === 'number') jsel = journal;
  let jFacet = [];
  if (facets) { const t = new Map(); for (const i of ids) t.set(f.j[i], (t.get(f.j[i]) || 0) + 1); jFacet = [...t.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]); }
  if (jsel >= 0) ids = ids.filter((i) => f.j[i] === jsel);
  const use = hasQ && sort === 'rel' ? 'rel' : sort === 'cited' ? 'cited' : 'new';
  if (use === 'rel') {
    const lv = new Map(ids.map((i) => [i, lvlOf(i)]));
    ids.sort((a, b) => lv.get(a) - lv.get(b) || a - b);   // a is already newest-first (the index's order)
  } else if (use === 'cited') {
    ids.sort((a, b) => f.c[b] - f.c[a] || a - b);
  } else {
    ids.sort(asc);   // the index is newest first, so ascending id = newest first
  }
  const from = (page - 1) * size, pageIds = ids.slice(from, from + size);
  const rows = (await Promise.all(pageIds.map(async (id) => { const r = await rowOf(v, id); return r && { ...r, at: ['title', 'abstract'][hasQ ? lvlOf(id) : 0] }; }))).filter(Boolean);
  return { total: ids.length, rows, common, left, journals: v.journals, jFacet, n: v.n, ymMax: v.ymMax };
}
// the journals, as [name, publisher, count], most papers first (for the 골라 보기 list)
export async function journals() { const v = await version(); return v ? v.journals : []; }
export async function ready() { return !!(await version()); }
