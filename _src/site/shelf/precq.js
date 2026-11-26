// 연구실 책장 — 법원 판결을 낱말로 찾기. The index precq/ (made from the public mirror of 법제처's judgments by
// _tools/prec_search.py, once a month) holds, for every two letters next to each other in a judgment's 사건명, 판시사항 and
// 판결요지 once the spaces and punctuation are taken out, the judgments that have them (in three lists: in the name, else in
// the 판시사항, else only in the 판결요지). A search asks first for the words as one phrase (every piece of them written
// together: '소의 이익' as 소의·의이·이익), then for every word anywhere (each word's own pieces), less the phrase's: so the
// judgments that say what was asked come first, then those that have every word somewhere (and when these are few, those
// holding the most of the words, as like it: a question written as a sentence). Within each, those whose name
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
// counts within the phrase, and is left aside (left) in the rest. The words' own pieces are asked first: when no judgment
// holds them all, none holds the phrase either, and its pieces across the words are not fetched. A long question's pieces
// are asked PIECES at a time (one shard each), the next ones only while some judgment still holds all asked so far: a
// passage pasted from a judgment is still found as it is, and one no judgment holds stops at the first PIECES. When fewer
// than NEAR_BELOW hold every word (of two different words or more that some judgment holds: of one word alone, the judgments
// holding some of its pieces are not like it — '사후적고찰' is not '적고'), those that hold the most of them follow (near)
const PIECES = 48, ACROSS = 4, NEAR_BELOW = 20;
async function byPhrase(v, ws) {
  const own = ws.map(piecesOf), left = ws.filter((w, i) => !own[i].length);
  const phrase = piecesOf(ws.join(''));
  if (!phrase.length) return { ...NONE, common: false, left, phrase: 0, exact: 0 };
  const held = new Map();
  const ask = (ps) => Promise.all(ps.filter((p) => !held.has(p)).map(async (p) => { held.set(p, await heldOf(v, p)); }));
  const want = [...new Set(own.flat())];
  // (a short question's few pieces across the words are asked with its own ones, so it waits for one round, not two)
  const across = phrase.filter((p) => !want.includes(p)), early = across.length <= ACROSS ? ask(across) : null;
  if (early) early.catch(() => {});
  let one = NONE, rest = NONE, all = null;
  for (let k = 0; k < want.length && (!all || all.ids.length); k += PIECES) {
    const ps = want.slice(k, k + PIECES);
    await ask(ps);
    all = intersect([...(all ? [all] : []), ...ps.map((p) => held.get(p))]);
  }
  if (!all || all.ids.length) { await early; await ask(phrase); one = intersect(phrase.map((p) => held.get(p))); }   // (each word's pieces are among the phrase's)
  if (all && ws.length > 1) rest = minus(all, one);
  const exact = ordered(one, rest), n = exact.ids.length;
  const known = new Set(ws.filter((w, i) => own[i].some((p) => held.has(p) && held.get(p).ids.length)));
  const near = n < NEAR_BELOW && known.size > 1 ? nearest(v, want.filter((p) => held.has(p)), held, exact) : NONE;
  if (!near.ids.length) return { ...exact, common: false, left, phrase: one.ids.length, exact: n };
  const ids = new Uint32Array(n + near.ids.length), lvl = new Uint8Array(ids.length);
  ids.set(exact.ids); ids.set(near.ids, n); lvl.set(exact.lvl); lvl.set(near.lvl, n);
  return { ids, lvl, common: false, left, phrase: one.ids.length, exact: n };
}
// the judgments like the question (near): those holding the most of the words' pieces, each piece counting by how rare it
// is (idf) and where it is held (the name above the 판시사항 above the 판결요지, WEIGHT) — so the judgments holding most of
// the words asked, and the rarer ones, come first; of equal ones the index's order. Only those holding at least NEAR_SHARE
// of what the words weigh (the rarity of all their pieces) are taken, at most NEAR_MAX; not those already found (not)
const WEIGHT = [1.6, 1.25, 1.0], NEAR_SHARE = 0.25, NEAR_MAX = 200;
function nearest(v, ps, held, not) {
  const N = v.n, score = new Float32Array(N), mass = new Float32Array(N), at = new Uint8Array(N).fill(3);
  let whole = 0;
  for (const p of ps) {
    const h = held.get(p), df = h.ids.length;
    if (!df) continue;   // (a piece no judgment has weighs nothing: a mistyped word does not keep the rest out)
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    whole += idf;
    for (let k = 0; k < df; k++) { const x = h.ids[k], l = h.lvl[k]; score[x] += idf * WEIGHT[l]; mass[x] += idf; if (l < at[x]) at[x] = l; }
  }
  if (!whole) return NONE;
  const found = new Uint8Array(N);
  for (const x of not.ids) found[x] = 1;
  const min = whole * NEAR_SHARE - 1e-6, take = [];
  for (let x = 0; x < N; x++) if (mass[x] >= min && !found[x]) take.push(x);
  take.sort((a, b) => score[b] - score[a] || a - b);
  const top = take.slice(0, NEAR_MAX);
  return { ids: Uint32Array.from(top), lvl: Uint8Array.from(top, (x) => at[x]) };
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
// a page of the judgments found: { total, exact, rows: [{ no, court, date, name, cat, at, nos, enbanc, cited, near }], common,
// left, phrase }
// (no: the number that opens it — of joined numbers the first; nos: the numbers as the judgment writes them (2025다220617,
// 220618); at: where the words are — 'name', 'points' (판시사항) or 'summary' (판결요지); enbanc: 전원합의체; cited: how many
// judgments in the mirror name it in their 참조판례; phrase: how many of the first hold the words as one phrase — the rest
// have every word somewhere; exact: how many of all (total) hold every word — the rest (near: true on each) are the judgments
// like it (비슷한 판결), those holding the most of the words first, there only when fewer than NEAR_BELOW hold them all;
// left: the words too short to be asked on their own, so only the phrase holds them; common:
// (an index made before fmt 2) every piece asked was too common to be in it)
export async function search(q, page = 1, size = 20) {
  const m = await matches(q);
  const from = (page - 1) * size, ids = m.ids.slice(from, from + size);
  const exact = m.exact ?? m.ids.length;
  const rows = (await Promise.all([...ids].map(async (id, k) => { const r = await rowOf(m.v, id); return r && { ...r, at: ['name', 'points', 'summary'][m.lvl[from + k]], ...(from + k >= exact ? { near: true } : {}) }; }))).filter(Boolean);
  return { total: m.ids.length, exact, rows, common: m.common, left: m.left || [], phrase: m.phrase || 0 };
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
