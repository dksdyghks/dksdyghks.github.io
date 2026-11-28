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
import * as store from './store.js?v=6f9f98f247';
import { oldArticlesOf, oldLaw, successor } from './laws.js?v=6f9f98f247';
import * as terms from './terms.js?v=6f9f98f247';

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
// a word of the question said another way (terms.js: '처분성' is '항고소송의 대상', '행정소송의 대상' …): a judgment holding
// that other way holds the word. Those found only so (alike) follow the ones holding every word as typed — never before
// them — best first (ranked), and carry which way they said it (syn). Ideas of several words ('정당 보조금',
// '재량권 일탈 남용') are read as one (terms.concepts). At most VAR_MAX other ways an idea.
const VAR_MAX = 6;
const union = (a, b) => {   // ascending ids of either; of one in both, the nearer place
  const ids = new Uint32Array(a.ids.length + b.ids.length), lvl = new Uint8Array(ids.length);
  let i = 0, j = 0, n = 0;
  while (i < a.ids.length || j < b.ids.length) {
    const x = i < a.ids.length ? a.ids[i] : Infinity, y = j < b.ids.length ? b.ids[j] : Infinity;
    if (x === y) { ids[n] = x; lvl[n++] = Math.min(a.lvl[i++], b.lvl[j++]); }
    else if (x < y) { ids[n] = x; lvl[n++] = a.lvl[i++]; }
    else { ids[n] = y; lvl[n++] = b.lvl[j++]; }
  }
  return { ids: ids.subarray(0, n), lvl: lvl.subarray(0, n) };
};
const asc = (x) => { const o = Array.from(x.ids, (id, k) => [id, x.lvl[k]]).sort((a, b) => a[0] - b[0]); return { ids: Uint32Array.from(o, (e) => e[0]), lvl: Uint8Array.from(o, (e) => e[1]) }; };
const has = (x, id) => { let lo = 0, hi = x.ids.length; while (lo < hi) { const m = (lo + hi) >> 1; if (x.ids[m] < id) lo = m + 1; else hi = m; } return lo < x.ids.length && x.ids[lo] === id ? lo : -1; };
async function byPhrase(v, ws) {
  const own = ws.map(piecesOf), left = ws.filter((w, i) => !own[i].length);
  const phrase = piecesOf(ws.join(''));
  if (!phrase.length) return { ...NONE, common: false, left, phrase: 0, exact: 0 };
  const held = new Map();
  const ask = (ps) => Promise.all(ps.filter((p) => !held.has(p)).map(async (p) => { held.set(p, await heldOf(v, p)); }));
  const want = [...new Set(own.flat())];
  // the ideas of the question and, of each, its other ways of saying it with their pieces (asked with the words' own)
  const ideas = terms.concepts(ws).map((c) => ({ ...c, own: [...new Set(c.words.flatMap(piecesOf))],
    vars: c.variants.slice(0, VAR_MAX).map((t) => ({ text: t, ps: piecesOf(words(t).join('')) })).filter((x) => x.ps.length) }));
  const varPs = [...new Set(ideas.flatMap((c) => c.vars.flatMap((x) => x.ps)))].filter((p) => !want.includes(p));
  const said = varPs.length ? ask(varPs) : null;
  if (said) said.catch(() => {});
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
  // found by another way of saying an idea: every idea held as typed or another way, less those found as typed
  let alike = NONE;
  const synOf = new Map();   // id → the other ways it says the ideas ('항고소송의 대상')
  if (said) {
    await said.catch(() => {});
    await ask(ideas.flatMap((c) => c.own));
    const each = ideas.map((c) => {
      const typed = c.own.length ? intersect(c.own.map((p) => held.get(p))) : null;
      const others = c.vars.map((x) => ({ text: x.text, h: x.ps.every((p) => held.has(p)) ? intersect(x.ps.map((p) => held.get(p))) : NONE }));
      const via = others.reduce((u, x) => (x.h.ids.length ? union(u, x.h) : u), NONE);
      return { c, typed, others, any: typed ? union(typed, via) : null };
    }).filter((e) => e.any);
    if (each.some((e) => e.others.some((x) => x.h.ids.length))) {
      const both = intersect(each.map((e) => e.any));
      alike = minus(both, asc(exact));
      for (const id of alike.ids) {
        const ways = [];
        for (const e of each) if (!(e.typed && has(e.typed, id) >= 0)) { const w = e.others.find((x) => has(x.h, id) >= 0); if (w) ways.push(w.text); }
        synOf.set(id, ways);
      }
    }
  }
  // after those holding every word as typed: the alike ones, then the like ones (near) — each by how much of the question
  // it holds and where (an idea said another way counting as held), then weighed by the court (ranked). The like ones only
  // when fewer than NEAR_BELOW hold every word as typed
  const known = new Set(ws.filter((w, i) => own[i].some((p) => held.has(p) && held.get(p).ids.length)));
  const nearToo = n < NEAR_BELOW && known.size > 1;
  const sc = alike.ids.length || nearToo ? scores(v, want.filter((p) => held.has(p)), held, ideas) : null;
  const m = n + alike.ids.length;
  const base = { common: false, left, phrase: one.ids.length, exact: m, alike: alike.ids.length, synOf };
  if (!sc) return { ...exact, ...base };
  const near = nearToo ? nearest(v, sc, union(asc(exact), alike)) : NONE;
  const areas = [...new Set(ideas.flatMap((c) => terms.areasOf(c.text)))];
  const [a, b] = await Promise.all([ranked(v, byScore(alike, sc), areas), ranked(v, near, areas)]);
  const after = { ids: new Uint32Array(a.ids.length + b.ids.length), lvl: new Uint8Array(a.ids.length + b.ids.length) };
  after.ids.set(a.ids); after.ids.set(b.ids, a.ids.length); after.lvl.set(a.lvl); after.lvl.set(b.lvl, a.ids.length);
  const ids = new Uint32Array(n + after.ids.length), lvl = new Uint8Array(ids.length);
  ids.set(exact.ids); ids.set(after.ids, n); lvl.set(exact.lvl); lvl.set(after.lvl, n);
  return { ids, lvl, ...base, nearOf: new Set(near.ids) };
}
// the judgments like the question (near): those holding the most of the words' pieces, each piece counting by how rare it
// is (idf) and where it is held (the name above the 판시사항 above the 판결요지, WEIGHT) — so the judgments holding most of
// the words asked, and the rarer ones, come first; of equal ones the index's order. A judgment that says an idea another
// way (ideas: terms.concepts) counts as holding all of it, where it says it. Only those holding at least NEAR_SHARE of what
// the words weigh (the rarity of all their pieces) are taken, at most NEAR_MAX; not those already found (not)
const WEIGHT = [2.0, 1.25, 1.0], NEAR_SHARE = 0.25, NEAR_MAX = 200;
function scores(v, ps, held, ideas = []) {
  const N = v.n, score = new Float32Array(N), mass = new Float32Array(N), at = new Uint8Array(N).fill(3);
  let whole = 0;
  const idfOf = (df) => Math.log(1 + (N - df + 0.5) / (df + 0.5));
  for (const p of ps) {
    const h = held.get(p), df = h.ids.length;
    if (!df) continue;   // (a piece no judgment has weighs nothing: a mistyped word does not keep the rest out)
    const idf = idfOf(df);
    whole += idf;
    for (let k = 0; k < df; k++) { const x = h.ids[k], l = h.lvl[k]; score[x] += idf * WEIGHT[l]; mass[x] += idf; if (l < at[x]) at[x] = l; }
  }
  // (an idea said another way: what its own pieces weigh, all of it, less what the judgment already has of them)
  for (const c of whole ? ideas : []) {
    const mine = c.own.filter((p) => ps.includes(p) && held.get(p).ids.length);
    if (!mine.length || !c.vars || !c.vars.length) continue;
    const W = mine.reduce((s, p) => s + idfOf(held.get(p).ids.length), 0);
    const got = new Float32Array(N), gotM = new Float32Array(N), best = new Uint8Array(N).fill(3), seen = [];
    for (const x of c.vars) {
      if (!x.ps.every((p) => held.has(p))) continue;
      const h = intersect(x.ps.map((p) => held.get(p)));
      for (let k = 0; k < h.ids.length; k++) { const id = h.ids[k]; if (best[id] === 3) seen.push(id); if (h.lvl[k] < best[id]) best[id] = h.lvl[k]; }
    }
    if (!seen.length) continue;
    for (const p of mine) { const h = held.get(p), idf = idfOf(h.ids.length); for (let k = 0; k < h.ids.length; k++) { const id = h.ids[k]; if (best[id] < 3) { got[id] += idf * WEIGHT[h.lvl[k]]; gotM[id] += idf; } } }
    for (const id of seen) {
      const l = best[id];
      score[id] += Math.max(0, W * WEIGHT[l] - got[id]); mass[id] += Math.max(0, W - gotM[id]);
      if (l < at[id]) at[id] = l;
    }
  }
  return { score, mass, at, whole };
}
function nearest(v, sc, not) {
  const { score, mass, at, whole } = sc, N = v.n;
  if (!whole) return NONE;
  const found = new Uint8Array(N);
  for (const x of not.ids) found[x] = 1;
  const min = whole * NEAR_SHARE - 1e-6, take = [];
  for (let x = 0; x < N; x++) if (mass[x] >= min && !found[x]) take.push(x);
  take.sort((a, b) => score[b] - score[a] || a - b);
  const top = take.slice(0, NEAR_MAX);
  return { ids: Uint32Array.from(top), lvl: Uint8Array.from(top, (x) => at[x]), score: Float32Array.from(top, (x) => score[x]) };
}
// some found judgments (x: ids, lvl) by their score, best first (the alike ones: those saying a word another way)
function byScore(x, sc) {
  const o = Array.from(x.ids, (id, k) => ({ id, l: x.lvl[k], s: sc.score[id] })).sort((a, b) => b.s - a.s || a.id - b.id);
  return { ids: Uint32Array.from(o, (e) => e.id), lvl: Uint8Array.from(o, (e) => e.l), score: Float32Array.from(o, (e) => e.s) };
}
// the like ones weighed by the court too: the first RANK_TOP of them read (their lines: court, 전원합의체, how often cited),
// each score times 1.3 for 대법원, 1.4 for 전원합의체 and 1 + log10(1 + cited) — the leading judgment of a question above a
// lower court's that merely shares its words. The rest stay in their order after them.
const RANK_TOP = 24, AREA_BOOST = 1.3;
async function ranked(v, near, areas = []) {
  if (!near.ids.length || !near.score) return near;
  const k = Math.min(RANK_TOP, near.ids.length);
  const rows = await Promise.all(Array.from({ length: k }, (_, i) => rowOf(v, near.ids[i]).catch(() => null)));
  // (and, when the question holds a term of one field of law — '협의의 소익' is the 항고소송's — a judgment of that field 1.3)
  const boost = (r) => (r ? (r.court === '대법원' ? 1.3 : 1) * (r.enbanc ? 1.4 : 1) * (1 + Math.log10(1 + (r.cited || 0))) * (areas.includes(r.cat) ? AREA_BOOST : 1) : 1);
  const order = Array.from({ length: k }, (_, i) => ({ i, s: near.score[i] * boost(rows[i]) })).sort((a, b) => b.s - a.s || near.ids[a.i] - near.ids[b.i]);
  const ids = near.ids.slice(), lvl = near.lvl.slice();
  order.forEach((o, j) => { ids[j] = near.ids[o.i]; lvl[j] = near.lvl[o.i]; });
  return { ids, lvl };
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
// alike: how many of the exact are found only by another way of saying a word (they follow those holding every word as
// typed; each carries syn: the ways it says them, ['항고소송의 대상']);
// left: the words too short to be asked on their own, so only the phrase holds them; common:
// (an index made before fmt 2) every piece asked was too common to be in it)
export async function search(q, page = 1, size = 20) {
  const m = await matches(q);
  const from = (page - 1) * size, ids = m.ids.slice(from, from + size);
  const exact = m.exact ?? m.ids.length;
  const rows = (await Promise.all([...ids].map(async (id, k) => {
    const r = await rowOf(m.v, id), syn = m.synOf && m.synOf.get(id);
    const near = m.nearOf ? m.nearOf.has(id) : from + k >= exact;
    return r && { ...r, at: ['name', 'points', 'summary'][m.lvl[from + k]], ...(near ? { near: true } : {}), ...(syn && syn.length ? { syn } : {}) };
  }))).filter(Boolean);
  return { total: m.ids.length, exact, rows, common: m.common, left: m.left || [], phrase: m.phrase || 0, alike: m.alike || 0 };
}
// the judgments that name an article in their 참조조문 (공직선거법 제250조: '공직선거법', 250, 0), in the index's order (대법원
// first, the leading judgments, then newest first): { total, rows }
export const citeKey = (law, art, sub) => `${String(law || '').replace(/[\s「」『』]/g, '')}|${Number(art)}${sub ? '의' + Number(sub) : ''}`;
const citedP = new Map();
const citedIds = (v, law, art, sub) => {
  const key = citeKey(law, art, sub);
  if (!citedP.has(key)) { const p = part(v, `a/${shardOf(key, v.arts)}.json`, (r) => r.json()).then((d) => (d && d[key]) || []); citedP.set(key, p); p.catch(() => citedP.delete(key)); }
  return citedP.get(key);
};
export async function citing(law, art, sub, page = 1, size = 20) {
  const v = await version();
  if (!v || !v.arts) throw Object.assign(new Error('precq'), { code: 'unavailable' });
  const ids = await citedIds(v, law, art, sub);
  const from = (page - 1) * size;
  const rows = (await Promise.all(ids.slice(from, from + size).map((id) => rowOf(v, id)))).filter(Boolean).map((r) => ({ ...r, at: 'points' }));
  return { total: ids.length, rows };
}
// the judgments naming an article under any name the law had — today's, each old name it had only by a rename (the same
// numbers), and the old articles laws.successor's map says became it (정치자금에관한법률 제30조 for 정치자금법 제45조):
// laws.oldArticlesOf. Asked by an old name, today's article is found first (a rename: the same number; a 전부개정 or a
// repeal: the curated map), so '정치자금에관한법률 제30조' brings 정치자금법 제45조's judgments too. (The index already files
// most renamed names under today's.) One row a judgment, in the index's order (대법원 first, then the leading ones, then
// newest: an id's own order). A row only an old name gave carries oldName.   → { total, rows, names }
async function todayOf(law, art, sub) {
  const o = oldLaw(law);
  if (!o || !o.now) return { name: law, art, sub };
  if (!o.whole && !o.gone) return { name: o.now, art, sub };
  const s = await successor(law, art).catch(() => null), c = s && (s.candidates || []).find((x) => x.score >= 1);
  return c ? { name: c.law, art: c.art, sub: c.sub || 0 } : { name: law, art, sub };
}
export async function citingAll(law, art, sub, page = 1, size = 20) {
  const v = await version();
  if (!v || !v.arts) throw Object.assign(new Error('precq'), { code: 'unavailable' });
  const now = await todayOf(law, art, sub || 0);
  const asks = [now, ...oldArticlesOf(now.name, now.art, now.sub || 0).map((o) => ({ name: o.name, art: o.art, sub: o.sub || 0 })), { name: law, art, sub: sub || 0 }];
  const seen = new Set(), list = asks.filter((x) => { const k = citeKey(x.name, x.art, x.sub); if (seen.has(k)) return false; seen.add(k); return true; });
  const names = [...new Set(list.map((x) => x.name))];
  const lists = await Promise.all(list.map((x, i) => (i ? citedIds(v, x.name, x.art, x.sub).catch(() => []) : citedIds(v, x.name, x.art, x.sub))));
  const from = new Map();   // id → the old name it came by (none for today's)
  lists.forEach((ids, i) => { for (const id of ids) if (!from.has(id)) from.set(id, i ? list[i].name : ''); else if (!i) from.set(id, ''); });
  const all = [...from.keys()].sort((a, b) => a - b), start = (page - 1) * size;
  const rows = (await Promise.all(all.slice(start, start + size).map(async (id) => { const r = await rowOf(v, id); return r && { ...r, at: 'points', ...(from.get(id) && from.get(id) !== now.name ? { oldName: from.get(id) } : {}) }; }))).filter(Boolean);
  return { total: all.length, rows, names };
}
export async function ready() { return !!(await version()); }
