// 연구실 책장 — 법원 판결을 낱말로 찾기. The index precq/ (made from the public mirror of 법제처's judgments by
// _tools/prec_search.py, once a month) holds, for every two letters next to each other in a judgment's 사건명, 판시사항 and
// 판결요지 once the spaces and punctuation are taken out, the judgments that have them (in three lists: in the name, else in
// the 판시사항, else only in the 판결요지). A search asks first for the words as one phrase (every piece of them written
// together: '소의 이익' as 소의·의이·이익), then for every word anywhere (each word's own pieces), less the phrase's: so the
// judgments that say what was asked come first, then those that have every word somewhere. Within each, those whose name
// holds it, then those whose 판시사항 does, then the rest; each in the index's own order (대법원 first, then 고등법원, then
// the rest; within each the leading judgments — 전원합의체, and those cited most — then newest first). Its parts are fetched
// as they are needed and kept on this device (until the index is made again), so a search asked again, or offline, is
// answered at once. (An index made before fmt 2 took its pieces within each word and left the commonest out: it is still
// read, the old way, until it is made again.)
import * as store from './store.js';

const BASE = new URL('./precq/', import.meta.url);
const LETTERS = /[^0-9A-Za-zㄱ-ㆎ가-힣㐀-䶿一-鿿\uF900-\uFAFF]+/g;
const OPENS = /^(?:(?:19|20)\d{2}|42\d{2}|\d{2})[가-힣]{1,4}\d{1,7}/;   // the number that opens a judgment (of joined numbers the first, as shelf/prec/ keys it)
export const words = (q) => String(q || '').normalize('NFKC').replace(LETTERS, ' ').toLowerCase().split(' ').filter(Boolean);
const piecesOf = (w) => { const out = []; for (let i = 0; i + 1 < w.length; i++) { const p = w.slice(i, i + 2); if (!/\d/.test(p) && !out.includes(p)) out.push(p); } return out; };
const shardOf = (p, n) => { let h = 0; for (let i = 0; i < p.length; i++) h = (Math.imul(h, 31) + p.charCodeAt(i)) >>> 0; return h % n; };
const NONE = { ids: new Uint32Array(0), lvl: new Uint8Array(0) };

let verP = null;
function version() {
  return (verP ||= (async () => {
    let v = null;
    try { const r = await fetch(new URL('v.json', BASE), { cache: 'no-cache' }); if (r.ok) { v = await r.json(); if (v && v.n) store.put('kv', 'pq:v', v).catch(() => {}); } }
    catch (e) { /* offline: the last v.json kept on this device stands in, so the index (its parts also kept) still answers */ }
    if (!v || !v.n) v = await store.get('kv', 'pq:v').catch(() => null);
    if (!v || !v.n) { verP = null; return null; }
    v.stopSet = new Set(v.stop || []);
    forget(v.v);
    return v;
  })());
}
// the parts of an index made before this one are let go (once a session)
let forgot = false;
async function forget(cur) {
  if (forgot) return; forgot = true;
  try { for (const k of await store.keys('kv')) if (typeof k === 'string' && k.startsWith('pq:') && k !== 'pq:v' && !k.startsWith('pq:' + cur + ':')) store.del('kv', k).catch(() => {}); } catch (e) { /* kept */ }
}
const kept = new Map();   // the parts read in this session
async function part(v, name, read) {
  const key = 'pq:' + v.v + ':' + name;
  if (kept.has(key)) return kept.get(key);
  const p = (async () => {
    const have = await store.get('kv', key).catch(() => null);
    if (have != null) return have;
    if (!navigator.onLine) throw Object.assign(new Error('offline'), { code: 'offline' });
    // (asked under the index's version, so a part of the index before, still in the browser's cache, is never taken for it)
    const r = await fetch(new URL(`${name}?v=${encodeURIComponent(v.v)}`, BASE));
    if (!r.ok) throw Object.assign(new Error('precq'), { code: 'unavailable' });
    const d = await read(r);
    store.put('kv', key, d).catch(() => {});
    return d;
  })();
  kept.set(key, p);
  p.catch(() => kept.delete(key));
  return p;
}
// one shard: its pieces and where each one's three lists are (사건명, 판시사항, 판결요지)
const dirs = new WeakMap();
function dirOf(buf) {
  if (dirs.has(buf)) return dirs.get(buf);
  const dv = new DataView(buf), n = dv.getUint16(0, true), dir = new Map();
  let off = 2 + n * 28;
  for (let i = 0; i < n; i++) {
    const o = 2 + i * 28, lists = [];
    for (let f = 0; f < 3; f++) { const len = dv.getUint32(o + 4 + f * 8, true); lists.push({ off, len, cnt: dv.getUint32(o + 8 + f * 8, true) }); off += len; }
    dir.set(String.fromCharCode(dv.getUint16(o, true), dv.getUint16(o + 2, true)), lists);
  }
  dirs.set(buf, dir);
  return dir;
}
// a piece's judgments, ascending, each with where it holds the piece (0 사건명, 1 판시사항, 2 판결요지)
function heldBy(buf, lists) {
  const parts = lists.map((e) => idsOf(buf, e));
  const n = parts[0].length + parts[1].length + parts[2].length, ids = new Uint32Array(n), lvl = new Uint8Array(n);
  const at = [0, 0, 0];
  for (let k = 0; k < n; k++) {
    let best = -1;
    for (let f = 0; f < 3; f++) if (at[f] < parts[f].length && (best < 0 || parts[f][at[f]] < parts[best][at[best]])) best = f;
    ids[k] = parts[best][at[best]++]; lvl[k] = best;
  }
  return { ids, lvl };
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
async function heldOf(v, p) {
  const buf = await part(v, `p/${shardOf(p, v.shards)}.bin`, (r) => r.arrayBuffer());
  const e = dirOf(buf).get(p);
  return e ? heldBy(buf, e) : NONE;
}
// the judgments every piece is held by, each with the furthest place any piece is held in (its tier)
function intersect(lists) {
  lists.sort((a, b) => a.ids.length - b.ids.length);
  let ids = lists[0].ids, lvl = lists[0].lvl;
  for (let j = 1; j < lists.length && ids.length; j++) {
    const other = lists[j], keepI = [], keepL = [];
    let lo = 0;
    for (let k = 0; k < ids.length; k++) {   // (the shorter list walks; the longer is searched from where the last one was found)
      const x = ids[k];
      let hi = other.ids.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (other.ids[mid] < x) lo = mid + 1; else hi = mid; }
      if (lo < other.ids.length && other.ids[lo] === x) { keepI.push(x); keepL.push(Math.max(lvl[k], other.lvl[lo])); }
    }
    ids = Uint32Array.from(keepI); lvl = Uint8Array.from(keepL);
  }
  return { ids, lvl };
}
// those of a (ascending) that b (ascending) has not
function minus(a, b) {
  if (!b.ids.length) return a;
  const ids = new Uint32Array(a.ids.length), lvl = new Uint8Array(ids.length);
  let j = 0, n = 0;
  for (let k = 0; k < a.ids.length; k++) {
    const x = a.ids[k];
    while (j < b.ids.length && b.ids[j] < x) j++;
    if (j < b.ids.length && b.ids[j] === x) continue;
    ids[n] = x; lvl[n++] = a.lvl[k];
  }
  return { ids: ids.subarray(0, n), lvl: lvl.subarray(0, n) };
}
// the name first, then the 판시사항, then the rest; each in the index's order (the ids are ascending): put into out from at
function tiers(x, out, at) {
  for (let t = 0; t < 3; t++) for (let k = 0; k < x.ids.length; k++) if (x.lvl[k] === t) { out.ids[at] = x.ids[k]; out.lvl[at++] = t; }
  return at;
}
function ordered(...groups) {
  const n = groups.reduce((s, g) => s + g.ids.length, 0), out = { ids: new Uint32Array(n), lvl: new Uint8Array(n) };
  groups.reduce((at, g) => tiers(g, out, at), 0);
  return out;
}
// the words as one phrase first, then every word anywhere. A word of one letter (or of digits) has no piece of its own: it
// counts within the phrase, and is left aside (left) in the rest
async function byPhrase(v, ws) {
  const own = ws.map(piecesOf), left = ws.filter((w, i) => !own[i].length);
  const phrase = piecesOf(ws.join(''));
  if (!phrase.length) return { ...NONE, common: false, left, phrase: 0 };
  const held = new Map(await Promise.all(phrase.map(async (p) => [p, await heldOf(v, p)])));   // (each word's pieces are among the phrase's)
  const one = intersect(phrase.map((p) => held.get(p)));
  const want = [...new Set(own.flat())];
  const rest = ws.length > 1 && want.length ? minus(intersect(want.map((p) => held.get(p))), one) : NONE;
  return { ...ordered(one, rest), common: false, left, phrase: one.ids.length };
}
// an index made before fmt 2: each word's pieces within it, the commonest (v.stop) not in the index and so left aside
async function byWords(v, ws) {
  const each = ws.map((w) => ({ w, all: piecesOf(w), ps: piecesOf(w).filter((p) => !v.stopSet.has(p)) }));
  const used = [...new Set(each.flatMap((x) => x.ps))];
  const left = each.filter((x) => !x.ps.length).map((x) => x.w);
  if (!used.length) return { ...NONE, common: each.some((x) => x.all.length), left: [], phrase: 0 };   // (common: what was asked is in nearly every judgment)
  const both = intersect(await Promise.all(used.map((p) => heldOf(v, p))));
  return { ...ordered(both), common: false, left, phrase: 0 };
}
const asked = new Map();   // a question's judgments (their numbers in the index), while the app is open
async function matches(q) {
  const v = await version();
  if (!v) throw Object.assign(new Error('precq'), { code: 'unavailable' });
  const ws = words(q), key = ws.join(' ');
  if (asked.has(key)) return { v, ...asked.get(key) };
  const r = (v.fmt || 1) >= 2 ? await byPhrase(v, ws) : await byWords(v, ws);
  asked.set(key, r);
  return { v, ...r };
}
async function block(v, b) {
  return part(v, `m/${b}.tsv`, (r) => r.text());
}
const lines = new Map();
async function rowOf(v, id) {
  const b = Math.floor(id / v.block), key = v.v + ':' + b;
  if (!lines.has(key)) lines.set(key, block(v, b).then((t) => t.split('\n')));
  const [raw, c, d, name, k, written, eb, cited] = ((await lines.get(key))[id - b * v.block] || '').split('\t');
  if (!raw) return null;
  const no = (OPENS.exec(raw) || [raw])[0];
  return {
    no, court: v.courts[Number(c)] || '', date: /^\d{8}$/.test(d) && /[1-9]/.test(d) ? `${d.slice(0, 4)}. ${Number(d.slice(4, 6))}. ${Number(d.slice(6))}.` : '', name: name || '', cat: v.cats[Number(k)] || '',
    nos: written || no, enbanc: eb === '1', cited: Number(cited) || 0,
  };
}
// a page of the judgments found: { total, rows: [{ no, court, date, name, cat, at, nos, enbanc, cited }], common, left, phrase }
// (no: the number that opens it — of joined numbers the first; nos: the numbers as the judgment writes them (2025다220617,
// 220618); at: where the words are — 'name', 'points' (판시사항) or 'summary' (판결요지); enbanc: 전원합의체; cited: how many
// judgments in the mirror name it in their 참조판례; phrase: how many of the first hold the words as one phrase — the rest
// have every word somewhere; left: the words too short to be asked on their own, so only the phrase holds them; common:
// (an index made before fmt 2) every piece asked was too common to be in it)
export async function search(q, page = 1, size = 20) {
  const m = await matches(q);
  const from = (page - 1) * size, ids = m.ids.slice(from, from + size);
  const rows = (await Promise.all([...ids].map(async (id, k) => { const r = await rowOf(m.v, id); return r && { ...r, at: ['name', 'points', 'summary'][m.lvl[from + k]] }; }))).filter(Boolean);
  return { total: m.ids.length, rows, common: m.common, left: m.left || [], phrase: m.phrase || 0 };
}
// the judgments that name an article in their 참조조문 (공직선거법 제250조: '공직선거법', 250, 0), in the index's order (대법원
// first, the leading judgments, then newest first): { total, rows }
export const citeKey = (law, art, sub) => `${String(law || '').replace(/[\s「」『』]/g, '')}|${Number(art)}${sub ? '의' + Number(sub) : ''}`;
const citedP = new Map();
export async function citing(law, art, sub, page = 1, size = 20) {
  const v = await version();
  if (!v || !v.arts) throw Object.assign(new Error('precq'), { code: 'unavailable' });
  const key = citeKey(law, art, sub);
  if (!citedP.has(key)) citedP.set(key, part(v, `a/${shardOf(key, v.arts)}.json`, (r) => r.json()).then((d) => (d && d[key]) || []));
  const ids = await citedP.get(key);
  const from = (page - 1) * size;
  const rows = (await Promise.all(ids.slice(from, from + size).map((id) => rowOf(v, id)))).filter(Boolean).map((r) => ({ ...r, at: 'points' }));
  return { total: ids.length, rows };
}
export async function ready() { return !!(await version()); }
