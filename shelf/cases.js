// 헌재 결정 바로 보기: case numbers as papers cite them (헌재 2004. 10. 21. 2004헌마554등), and the decision itself from
// 헌법재판소 판례정보 (공공데이터포털), asked through the 책장 server once and kept on this device (a decision does not change).
import * as api from './api.js?v=6f9f98f247';
import * as store from './store.js?v=6f9f98f247';
import { scanArticles, articleScope, scanCourtCases, artLabel, lawGoKr, corners, oldLaw, oldArticlesOf, successor } from './laws.js?v=6f9f98f247';
import * as terms from './terms.js?v=6f9f98f247';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 2004헌마554, 89헌가113; a page's text sometimes spaces them (2004 헌마 554) or breaks the line inside one.
// The court numbers its cases by year from 88 (1988): two digits until 99, four from 2000.
const CASE_RE = /((?:19|20)\d{2}|[89]\d)\s?헌\s?([가나다라마바사아])\s?(\d{1,4})(?!\d)/g;
// 2004헌마554·566(병합), 2004헌마554, 566 → the bare number repeats year·헌·kind. Not when that number is the start of the next
// full one ("92헌마174, 93헌마186": 93 is a year) or a date ("…554, 2005. 2. 3.") — those are read as what they are.
const CASE_CONT = /\s*[,·ㆍ]\s*(\d{1,4})(?!\d)(?!\s?[가-힣]{1,3}\s?\d)(?!\s?\.\s?\d{1,2}\s?\.)/y;
export function scanCases(text) {
  const out = [];
  if (!text) return out;
  const last = new Date().getFullYear() + 1;
  CASE_RE.lastIndex = 0;
  let m;
  while ((m = CASE_RE.exec(text))) {
    let y = Number(m[1]);
    if (m[1].length === 2) { if (y < 88) continue; }
    else if (y < 1988 || y > last) continue;
    else if (y < 2000) y -= 1900;
    const n = Number(m[3]);
    if (!n) continue;
    const kind = m[2];
    out.push({ no: `${y}헌${kind}${n}`, i: m.index, len: m[0].length });
    let at = m.index + m[0].length, c; CASE_CONT.lastIndex = at;
    while ((c = CASE_CONT.exec(text))) { const num = Number(c[1]); if (num) { const k = c[0].search(/\d/); out.push({ no: `${y}헌${kind}${num}`, i: c.index + k, len: c[0].length - k }); } at = CASE_CONT.lastIndex; }
    CASE_RE.lastIndex = at;
  }
  return out;
}
// a search that is one case number (2004헌마554, 헌재 2004헌마554, 2004헌마554등): that number
export function caseQuery(q) {
  const m = /^(?:헌재)?(\d{2,4}헌[가나다라마바사아]\d{1,4})등?$/.exec(String(q || '').replace(/\s+/g, ''));
  const c = m && scanCases(m[1])[0];
  return c && c.len === m[1].length ? c.no : null;
}
// a search shaped like a case number that is none (2099헌마99999: a year to come, five digits): the number as typed, so the
// screen says there is no such decision instead of searching its words (and showing judgments that merely share digits)
export function caseShape(q) {
  const t = String(q || '').replace(/\s+/g, '');
  const m = /^(?:헌재)?(\d{2,4}헌[가나다라마바사아]\d+)등?$/.exec(t);
  return m && !caseQuery(t) ? m[1] : null;
}

/* ---------------- the decision ---------------- */
const SVC = '9750000/PrecedentInfomationService/', CASES = '9750000/IncidentInfoService/';
const KIND = { 결정문: '01', 공보: '02', 판례집: '03' };
const SRC = { '01': '결정문', '02': '공보', '03': '판례집' };
const SHAPE = 1;                 // how a decision is kept here (a new shape is asked again)
const AGAIN = 3 * 864e5;         // a number not found is asked again after three days: the court may have added it
const asking = new Map();

// the decision, or null when the court's data has no such case; onRow(first) gets the list's line (name, date, result)
// while the full text is still on its way. hint: what the row it was opened from says of it ({ name, date, area, nick, seq }:
// a line of 주요 결정 or of a list) — a second way to it when its number finds nothing, and what is shown of it when nothing
// does (missingView). Throws { code: 'offline' | 'server' | 'unavailable' }.
export function decision(no, onRow, hint) {
  if (!asking.has(no)) asking.set(no, ask(no, onRow, hint).then(mend).finally(() => asking.delete(no)));
  return asking.get(no);
}
export async function kept(no) {
  const k = await store.get('kv', 'case:' + no).catch(() => null);
  return k && k.v === SHAPE ? k : null;
}
// what was learnt of a number the court's data did not answer: the cases decided together with it (group, its first the one
// decided under) and decisions of the same name and day under a number outside that group (cands: maybe it, maybe not)
const misses = new Map();
export const missOf = (no) => misses.get(no) || null;
async function ask(no, onRow, hint) {
  const k = await kept(no), named = !!(hint && hint.name);
  // (a number not found is asked again sooner when a name to look it up by has come with it since)
  if (k && (k.d || (Date.now() - k.at < AGAIN && (k.named || !named)))) { if (!k.d && k.miss) misses.set(no, k.miss); return k.d; }
  if (!navigator.onLine) { if (k) return k.d; throw fail('offline'); }
  let row = await byNo(no), filed = '', group = null, d = null, miss = null;
  if (!row) {
    group = await mergedGroup(no).catch(() => null);
    if (group && group[0] !== no) {
      // a case decided together with another (2004헌마566 in 2004헌마554·566): the court files the decision under the first
      const l = await decision(group[0], onRow);
      if (l) d = { ...l, asked: no }; else miss = { group, cands: [] };
    } else {
      // the first number of its group (2012헌마190 of 2012헌마190 등 7건), or one never joined, that the list does not answer
      // by: the court's record may carry it with 등, or under another number of the group; and a name finds a decision too
      for (const alt of [no + '등', ...(group || []).slice(1, 4)]) {
        row = await byNo(alt, alt === no + '등' ? no : alt).catch(() => null);
        if (row) { if (alt !== no + '등') filed = alt; break; }
      }
      let cands = [];
      if (!row && named) { const r = await byNameOf(no, hint, group).catch(() => null); if (r && r.row) ({ row, filed } = r); else if (r) cands = r.cands; }
      if (!row) miss = { group, cands };
    }
  }
  // (what the digest says of it — its holdings, its day and book as the digest cites it — is shown in its place: missingView)
  if (miss) miss.digest = await digestOf(no).catch(() => null);
  if (row) d = await detailed(no, row, onRow, filed, group);
  // (a decision whose record has no 판례집 page: how the digest cites it is asked before it is shown — a moment, PJ_WAIT at most
  // — so its cite and its line are drawn once, complete, and nothing grows under the reader afterwards)
  if (d && !where(d) && pjDue(d)) await Promise.race([pjFill(d), new Promise((r) => setTimeout(r, PJ_WAIT))]);
  if (miss) misses.set(no, miss); else misses.delete(no);
  await store.put('kv', 'case:' + no, d ? { v: SHAPE, at: Date.now(), d } : { v: SHAPE, at: Date.now(), d, miss, named }).catch(() => {});
  return d;
}
// the decision of a list's line: its text by the kind the line says it has (판례집, 공보, else the bare 결정문)
async function detailed(no, row, onRow, filed, group) {
  // a line that carries the number among others ('2012헌마190 등' is this one; '2004헌마554·566' asked as 566 is 554's)
  const lead = (scanCases(String(row.eventNo || ''))[0] || {}).no;
  const asked = !filed && lead && lead !== no ? no : '';
  if (asked) no = lead;
  if (onRow) { try { onRow(mend({ ...shape(no, row, null, ''), pending: true })); } catch (e) { /* only a preview */ } }
  const want = KIND[String(row.panreType || '').trim()] || '01';
  let d = null;
  for (const code of want === '01' ? ['01'] : [want, '01']) {
    const det = items(await get('getKorPrcdntDetail', { type: 'json', eventNum: String(row.eventNum), panreType: code }))[0];
    if (det) { d = shape(no, row, det, code); break; }
  }
  if (!d) d = shape(no, row, null, '');
  if (asked) d.asked = asked;
  if (filed) d.filed = filed;                       // (its record is under another number of its group: said so)
  if (group && group.length > 1) d.joined = true;   // cited with 등 whatever its heading says
  learn(d.cites); learn(d.reason);                  // the 판례집 books of what it cites
  return d;
}
const fail = (code) => Object.assign(new Error(code), { code });
// no answer from the shelf's server: 'offline' when the device has no internet, 'server' when it has one and the server is
// down — told apart as app.js tells them (navigator.onLine), so neither is said to be the other
const noAnswer = () => (navigator.onLine === false ? 'offline' : 'server');
async function get(op, params, svc = SVC) {
  try { return await api.publicData(svc + op, params); }
  catch (e) { throw fail(api.isOffline(e) ? noAnswer() : 'unavailable'); }
}
// the list's line for a number: the line that is that number, else one that carries it with others ('2012헌마190 등',
// '2004헌마554·566(병합)'). (Twenty lines: a number may also answer the numbers that begin with it, 2012헌마19 → 2012헌마190 …)
const bareNo = (r) => String(r.eventNo || '').replace(/\s+/g, '');
function rowFor(rows, no) {
  return rows.find((r) => bareNo(r) === no) || rows.find((r) => scanCases(String(r.eventNo || '')).some((c) => c.no === no)) || null;
}
async function byNo(q, no = q) {
  return rowFor(items(await get('getKorPrcdntList', { type: 'json', numOfRows: '20', pageNo: '1', eventNo: q })), no);
}
// the numbers decided together with this one ("2004헌마554,2004헌마566(병합)"), the first being the one decided under; null when
// it was never joined to another
async function mergedGroup(no) {
  const r = items(await get('getMergedCase', { type: 'json', numOfRows: '5', pageNo: '1', eventNo: no }, CASES))[0];
  const all = r ? [...new Set(scanCases(String(r.mrgNms || '')).map((c) => c.no))] : [];
  return all.length && all.includes(no) ? all : null;
}
// the decision by its name and day (a line of 주요 결정 or a list gives them): a line that carries its number, or another
// number of its group. A line of the same name and day under a number outside the group may be another decision: offered
// (cands), never taken for this one. The name as written, then its law and article alone (the court's records space names
// their own way: '별표1', '별표 1')
async function byNameOf(no, hint, group) {
  const day = (/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./.exec(String(hint.date || '')) || []).slice(1).map((x, i) => (i ? x.padStart(2, '0') : x)).join('');
  const art = (/^(.*?제\s*\d+\s*조(?:의\s*\d+)?)/.exec(hint.name) || [])[1];
  const tight = (s) => String(s || '').replace(/[\s·ㆍ]/g, '');
  let cands = [];
  for (const nm of [...new Set([hint.name, art].filter(Boolean))]) {
    const rows = (await list(SVC, 'getKorPrcdntList', { eventNm: nm }, 1, 30)).rows;
    for (const m of [no, ...(group || []).filter((x) => x !== no)]) { const row = rowFor(rows, m); if (row) return { row, filed: m === no ? '' : m }; }
    if (!cands.length) cands = rows.filter((x) => tight(nameOf(x.eventNm)) === tight(hint.name) && (!day || String(x.rstaDate || '').trim() === day))
      .map((x) => ({ no: bareNo(x), name: nameOf(x.eventNm), date: ymd(x.rstaDate) })).filter((x) => x.no && x.no !== no);
  }
  return { cands };
}

/* ---------------- 찾기: 헌재 결정 by name, by the words of their holdings, by the law they reviewed ---------------- */
const found = new Map();   // this session's answers, by question
async function list(svc, op, params, page, size = 20) {
  const key = svc + op + '?' + new URLSearchParams({ ...params, pageNo: String(page), numOfRows: String(size) });
  if (found.has(key)) return found.get(key);
  const d = await get(op, { type: 'json', pageNo: String(page), numOfRows: String(size), ...params }, svc);
  const out = { total: Number(d && d.body && d.body.totalCount) || 0, rows: items(d) };
  if (out.rows.length || out.total) found.set(key, out);   // (an empty answer may be the portal's blank page: asked again)
  return out;
}
// decisions whose name has the words — of the 전원재판부 (panel ''), or of the 지정재판부, whose dismissals would otherwise come
// first, newest first, before the decision that settled the question
export async function byName(q, page = 1, panel = '전원재판부') {
  const r = await list(SVC, 'getKorPrcdntList', { eventNm: q, ...(panel ? { jgdmtCort: panel } : {}) }, page);
  // (a line's number as the court writes it may carry others: '2012헌마190 등' is 2012헌마190)
  return { total: r.total, rows: r.rows.map(nameRow) };
}
const nameRow = (x) => ({ no: (scanCases(String(x.eventNo || ''))[0] || {}).no || bareNo(x), name: nameOf(x.eventNm), date: ymd(x.rstaDate), result: one(x.rstaRsta), court: one(x.jgdmtCort), joined: joinedNo(x.eventNo) });
// a line's number that carries others — '2012헌마190 등', '2012헌마190등(병합)', '2004헌마554·566' — is a joined decision's
const joinedNo = (s) => /등|병합|\d\s*[,·ㆍ]\s*\d/.test(String(s || ''));
// the court's digest of holdings (판례요지집): entries whose text has the words, each placed under the article it concerns.
// A line names its heading (seq) and its own title; the words asked go with it (two holdings may share a title: holding)
// The service lists them by heading, last first — 조례편, then 법령편 from <하> back to <가>, 헌법편 last: for '헌법 제37조 제2항'
// (391) the first pages were all 기타 법령편 and its holdings on 제37조 itself came at the very end. Read whole (pages of 100,
// up to 500) and shown in the digest's own order instead: 헌법편 first, by the constitution's order, then 법령편 (가나다), then
// 조례편. (The list carries no decision number or day — only each heading's holdings do — so it cannot be ordered by those.)
const HOLD_ALL = 500, HOLD_PAGE = 20;
const digestPart = (path) => (/^헌법편/.test(path) ? 0 : /^기타 법령편\s*>\s*법령편/.test(path) ? 1 : /^기타 법령편\s*>\s*조례편/.test(path) ? 2 : 3);
export async function byHolding(q, page = 1) {
  const row = (x) => ({ seq: one(x.seqNo), title: one(x.title), path: one(x.cntntpth), q });
  const first = await list(SVC, 'getOcprOutlineList', { content: q }, 1, 100);
  if (first.total > HOLD_ALL || (first.total > first.rows.length && first.rows.length < 100)) {   // (too many, or pages smaller than asked: as the service orders them)
    // (the page asked, from the first answer when it holds it: no second ask for what is here)
    if (first.rows.length >= page * HOLD_PAGE) return { total: first.total, rows: first.rows.slice((page - 1) * HOLD_PAGE, page * HOLD_PAGE).map(row) };
    const r = await list(SVC, 'getOcprOutlineList', { content: q }, page);
    return { total: r.total, rows: r.rows.map(row) };
  }
  const rest = await Promise.all(Array.from({ length: Math.ceil(first.total / 100) - 1 }, (_, i) => list(SVC, 'getOcprOutlineList', { content: q }, i + 2, 100)));
  const all = [first, ...rest].flatMap((r) => r.rows).map(row).map((x, i) => ({ x, i, k: [digestPart(x.path), Number(x.seq) || 0] }));
  all.sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.i - b.i);
  return { total: Math.max(first.total, all.length), rows: all.slice((page - 1) * HOLD_PAGE, page * HOLD_PAGE).map((a) => a.x) };
}
/* One holding of the digest. Its seqNo names a heading — 【관습헌법】, 헌법 제130조 제2항, a law of 기타 법령편 — and asked by it
   the service answers every holding under that heading, in its own order: the holding tapped is the one with its title (five
   share 【관습헌법】; a law's heading has one for each provision reviewed). Two may share a title too (기타 법령편 files each
   decision on a provision under that provision): the words the list was asked tell them apart, and when they do not, all
   of them are shown, each with the decision it comes from. A title the heading does not have (the digest changed since the
   list was read) shows the heading's titles instead — never another holding in its place. Kept here by (heading, title). */
const HSHAPE = 2, HAGAIN = 30 * 864e5;   // (2: citedAs; and what shape 1 kept of blank answers is dropped with it)
const holds = new Map();
const tightQ = (s) => String(s || '').replace(/\s+/g, '');
export async function holding(seq, title, q = '') {
  const want = one(title), key = `hold:${seq}:${want}`;
  let h = holds.get(key);
  if (!h) { const k = await store.get('kv', key).catch(() => null); if (k && k.v === HSHAPE && (Date.now() - k.at < HAGAIN || !navigator.onLine)) h = k.h; }
  if (!h) {
    if (!navigator.onLine) throw fail('offline');
    const node = await heading(seq);
    const all = node.rows.map(held);
    const loose = (s) => String(s || '').replace(/[\s·ㆍ.,'"‘’“”「」『』()[\]<>]/g, '');
    let same = all.filter((x) => x.title === want);
    if (!same.length) same = all.filter((x) => loose(x.title) === loose(want));   // (only its spacing or marks differ)
    const own = new Set(same.flatMap((x) => x.cites.map((c) => c.no)));
    h = { seq, title: want, path: (same[0] || all[0] || {}).path || '', same, total: node.total, read: all.length,
      titles: same.length ? [] : all.map((x) => x.title),                                          // (a title not found: the heading's)
      others: [...new Set(all.flatMap((x) => x.nos))].filter((no) => !own.has(no)),               // the heading's other decisions
      // (and how the heading's texts cite them — day, 등, book: '헌재 2004. 10. 21. 2004헌마554등', not a bare number)
      citedAs: Object.fromEntries(ownCites(all.flatMap((x) => x.cites)).map((c) => [c.no, c])) };
    for (const x of all) learn(x.text);
    // kept only what can be trusted later: the title found, in a heading read to its end. A blank answer (the portal sometimes
    // answers a heading with nothing) or a heading cut short is asked again the next time it is opened — kept, it would say
    // for 30 days that the holding the list just named is not there
    if (same.length && all.length >= node.total) { holds.set(key, h); store.put('kv', key, { v: HSHAPE, at: Date.now(), h }).catch(() => {}); }
  }
  let pick = h.same;
  if (pick.length > 1 && q) { const w = pick.filter((x) => tightQ(x.title + x.text).includes(tightQ(q))); if (w.length) pick = w; }
  return { ...h, pick };
}
// every holding under one heading, in the digest's order: pages of 100 (or of what the service gives at most), three asked at
// a time, at most `most` pages
async function heading(seq, most = 10) {
  const first = await list(SVC, 'getOcprOutlineDetail', { seqNo: seq }, 1, 100);
  const per = first.rows.length && first.rows.length < Math.min(100, first.total) ? first.rows.length : 100;
  const pages = Math.min(most, Math.ceil(first.total / per)), rows = [...first.rows];
  for (let p = 2; p <= pages; p += 3) {
    const got = await Promise.all([p, p + 1, p + 2].filter((x) => x <= pages).map((x) => list(SVC, 'getOcprOutlineDetail', { seqNo: seq }, x, per)));
    for (const g of got) rows.push(...g.rows);
  }
  return { total: first.total, rows };
}
// a holding as shown: its title, heading, text (its line breaks are the court's own: kept as they are), the decisions its text
// cites with their day and book ('헌재 2004. 10. 21. 2004헌마554등, 판례집 16-2하, 1, 50'), and the numbers the service lists
// with it (for the heading as a whole: the same number again for each holding — once here)
function held(r) {
  const text = clean(r.content);
  return { title: one(r.title), path: one(r.cntntpth), text, cites: citesIn(text), nos: [...new Set(scanCases(String(r.eventNo || '')).map((c) => c.no))] };
}
// the court's own selection of leading decisions (주요판례), searched in their full text and, on the first page, by the common
// name they go by too (별칭: '관습헌법 사건'); each has its common name
export async function byLeading(q, page = 1) {
  const ask = (p) => list(SVC, 'getRealmMainPrcdntList', { code: '0', decisionNm: q }, p);
  const [nick, ...pages] = await Promise.all([list(SVC, 'getRealmMainPrcdntList', { code: '0', eventNm: q }, 1).catch(() => ({ total: 0, rows: [] })),
    ...Array.from({ length: page }, (_, i) => (i + 1 < page ? ask(i + 1).catch(() => ({ total: 0, rows: [] })) : ask(i + 1)))]);
  // the court lists a decision once for each field it is filed under, and the common-name search finds it again: one line a
  // decision, its common names and fields together (the lines of the pages before count: they were shown already)
  const at = new Map(), mine = [];
  let dup = 0;
  pages.forEach((p, i) => {
    for (const x of [...(i === 0 ? nick.rows : []), ...p.rows].map(leadRow)) {
      const y = x.no && at.get(x.no);
      if (!y) { if (x.no) at.set(x.no, x); if (i === page - 1) mine.push(x); continue; }
      dup++;
      leadMerge(y, x);
    }
  });
  return { total: Math.max(mine.length, pages[page - 1].total + nick.rows.length - dup), rows: mine.map(leadDone) };
}
// a line of 주요 결정: its common names and fields kept as lists while lines of one decision are merged (a field's own name
// may hold ' · ': '정치 · 선거관계에 관한 결정'), each once; a common name that is only its name again is no common name
function leadRow(x) {
  const name = one(x.title), nick = one(x.nick), area = one(x.classNm);
  return { no: (scanCases(String(x.eventNo || ''))[0] || {}).no || '', nick, name, date: ymd(x.adjudgeDt), area, seq: one(x.seq), joined: joinedNo(x.eventNo),
    nicks: nick && loose(nick) !== loose(name) ? [nick] : [], areas: area ? [area] : [] };
}
function leadMerge(y, x) {
  y.joined = y.joined || x.joined;
  for (const k of ['nicks', 'areas']) for (const v of x[k]) if (!y[k].some((w) => loose(w) === loose(v))) y[k].push(v);
}
function leadDone(y) {
  const { nicks, areas, ...r } = y;
  return { ...r, nick: nicks.join(' · '), area: areas.join(' · ') };
}
// decisions that reviewed a law (or one article of it): 형법 제269조 제1항
export async function byLaw(law, art, para, page = 1) {
  const r = await list(CASES, 'getLawCaseList', lawAsk(law, art, para), page);
  return { total: r.total, rows: lawRows(r.rows) };
}
const lawAsk = (law, art, para) => ({ lawNm: law, ...(art ? { provision: String(art) } : {}), ...(para ? { clause: String(para) } : {}) });
// the service answers a row for every article a case reviewed: one row a case, its articles together
// ('국가보안법 제2조 제1항 · 제7조 제1항 · 제7조 제5항'); rows of the same case met earlier (at) are merged into those
const lawOfT = (t) => (/^(.*?)\s*제\s*\d/.exec(t) || [, ''])[1];
// the 주문 as the court's lists give it may begin with what is left of the parties' lines ('2. 주○○⏎3. 나○○⏎⏎공직선거법 …
// 헌법에 위반되지 아니한다.' — 2021헌바292): those lines left out, so its first line is what was decided
const PARTY = /^(?:[ \t]*(?:\d{1,3}|[가-하])[ \t]*\.[ \t]*(?:(?:주식회사|사단법인|재단법인|학교법인)[ \t]*)?[가-힣A-Za-z]{0,8}[ \t]*[○◯Ｏ〇]{1,4}[가-힣]{0,3}(?:[ \t]*외[ \t]*\d+[ \t]*(?:인|명))?[ \t]*(?:\n|$)|[ \t]*\n)+/;
export const orderText = (t) => String(t || '').replace(PARTY, '').replace(/^\s+/, '');
// the result the court's records give, against its 주문: 2000헌마91 is filed '한정위헌', but its 주문 1 holds two provisions
// unconstitutional outright (2 is the 한정위헌). A 단순위헌 or 헌법불합치 the 주문 says and the record leaves out is put first:
// '위헌, 한정위헌'. (A 주문 that says it only of a reading or a reach — '해석하는 한', '범위에서', '…하는 것은' — is 한정위헌.)
const simpleUnconst = (t) => /(?:은|는)\s*(?:모두\s*)?헌법에\s*위반된다/.test(t) && !/해석하는\s*한|범위\s*(?:내\s*)?에서|것은\s*(?:모두\s*)?헌법에|경우에\s*(?:한하여\s*)?|한정/.test(t);
export function resultOf(result, order) {
  const r = String(result || '').trim();
  if (!order || /심리\s*중/.test(r)) return r;
  const parts = r ? r.split(/\s*,\s*/).filter(Boolean) : [], items = String(order).split(/\n(?=\s*\d{1,2}\s*\.)/);
  const add = [];
  if (!parts.includes('위헌') && items.some(simpleUnconst)) add.push('위헌');
  if (!parts.includes('헌법불합치') && items.some((t) => /헌법에\s*합치되지\s*아니한다/.test(t))) add.push('헌법불합치');
  return add.length ? [...add, ...parts].join(', ') : r;
}
function lawRows(raw, at = new Map(), rows = [], extra = null) {
  for (const x of raw.map((x) => { const order = orderText(clean(x.lawArtiClent)); return { no: one(x.eventNo).replace(/\s+/g, ''), name: one(x.eventNm), target: fixTarget(one(x.refreeePrvsn)), date: ymd(x.endDate), result: resultOf(one(x.endRsta), order), order, ...(extra || {}) }; })) {
    const y = at.get(x.no);
    if (!y) { at.set(x.no, x); rows.push(x); continue; }
    const t = x.target && lawOfT(x.target) === lawOfT(y.target) ? x.target.slice(lawOfT(x.target).length).trim() : x.target;
    if (t && !y.target.includes(t)) y.target += ' · ' + t;
  }
  return rows;
}
/* ---------------- 8차: every name a law had ---------------- */
// decisions on an article under every name the law had: today's, each old name it had only by a rename (the same
// numbers: 공직선거및선거부정방지법 for 공직선거법), and the old articles laws.successor's map says became it (laws.oldArticlesOf:
// 정치자금에관한법률 제30조 for 정치자금법 제45조; a 항 is not carried across a 전부개정). Asked by an old name, today's is found
// first (a rename: the same number; a 전부개정: the curated map). Every page of each — up to ALL_MOST rows a name for an
// article, ALL_LAW for a whole law, read three pages at a time — one row a case (a row from an old name only carries
// oldName), 심리중 first, then newest first; the service's broken '제55조 제3의' read as '제55조의3' (fixTarget).
//   → { total, rows, page, names, cut }   (cut: rows the service has beyond what was read — 0 almost always)
const ALL_MOST = 300, ALL_LAW = 1500, ALL_PAGE = 20, ALL_PER = 100;
const asAll = new Map();
const dayNo = (d) => { const m = /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/.exec(String(d || '')); return m ? Number(m[1]) * 1e4 + Number(m[2]) * 100 + Number(m[3]) : 0; };
export const fixTarget = (t) => String(t || '').replace(/조\s*제\s*(\d{1,3})\s*의(?![가-힣])/g, '조의$1');
const tightName = (s) => String(s || '').replace(/[\s·ㆍ「」『』]/g, '');
// today's law and article for one asked by an old name (itself when it is today's, or when nothing says what became of it)
async function todayOf(law, art) {
  const o = oldLaw(law);
  if (!o || !o.now) return { name: law, art, same: true };
  if (!o.whole && !o.gone) return { name: o.now, art, same: true };
  if (!art) return { name: o.now, art: 0, same: false };
  const s = await successor(law, art).catch(() => null), c = s && (s.candidates || []).find((x) => x.score >= 1);
  return c ? { name: c.law, art: c.art, same: false } : { name: law, art, same: true };
}
async function readAll(params, most) {
  const first = await list(CASES, 'getLawCaseList', params, 1, ALL_PER);
  const per = first.rows.length && first.rows.length < ALL_PER && first.total > first.rows.length ? first.rows.length : ALL_PER;
  const pages = Math.min(Math.ceil(Math.min(first.total, most) / per), Math.ceil(most / per));
  const got = [first.rows];
  for (let pg = 2; pg <= pages; pg += 3) {
    const more = await Promise.all([pg, pg + 1, pg + 2].filter((x) => x <= pages).map((x) => list(CASES, 'getLawCaseList', params, x, per).then((r) => r.rows, () => null)));
    if (more.some((r) => r === null)) { got.push(...more.filter(Boolean)); break; }   // (a page's trouble: what was read stands)
    got.push(...more);
    if (more.some((r) => !r.length)) break;
  }
  const rows = got.flat();
  return { rows, cut: Math.max(0, first.total - rows.length) };
}
export async function byLawAll(law, art, para, page = 1) {
  const key = [law, art || '', para || ''].join('|');
  let p = asAll.get(key);
  if (!p) {
    p = (async () => {
      const now = await todayOf(law, art || 0);
      const asks = [{ name: now.name, art: now.art, para: now.same ? para : 0 },
        // (a 항 is not carried across a 전부개정 — but the old article asked, by its own name and number, keeps the 항 asked)
        ...oldArticlesOf(now.name, now.art || 0).map((o) => ({ name: o.name, art: now.art ? o.art : 0,
          para: tightName(o.name) === tightName(law) && Number(o.art) === Number(art) ? para : o.whole || !now.same ? 0 : para }))];
      if (!asks.some((x) => tightName(x.name) === tightName(law))) asks.push({ name: law, art, para });   // (the old name asked, as it was asked)
      const seen = new Set(), list2 = asks.filter((x) => { const k = `${tightName(x.name)}|${x.art || 0}|${x.para || 0}`; if (seen.has(k)) return false; seen.add(k); return true; });
      const names = [...new Set(list2.map((x) => x.name))];
      const at = new Map(), rows = [], most = art ? ALL_MOST : ALL_LAW;
      let cut = 0;
      // (every name asked at once — a cold service answers each in a second or two, and 판례 waits for this section: one round,
      // not one a name — then merged in the order asked, today's name first, as before)
      const got = await Promise.all(list2.map((x, i) => readAll(lawAsk(x.name, x.art, x.para), most).catch((e) => { if (i === 0) throw e; return null; })));   // (today's name must answer; an old name's trouble leaves it out)
      for (let i = 0; i < list2.length; i++) {
        const r = got[i]; if (!r) continue;
        cut += r.cut;
        lawRows(r.rows, at, rows, i && tightName(list2[i].name) !== tightName(now.name) ? { oldName: list2[i].name } : null);
      }
      const pending = (x) => (!x.result || /심리\s*중/.test(x.result) ? 0 : 1);
      rows.sort((a, b) => pending(a) - pending(b) || dayNo(b.date) - dayNo(a.date));
      return { rows, names, cut };
    })();
    asAll.set(key, p);
    p.catch(() => asAll.delete(key));
  }
  const { rows, names, cut } = await p;
  return { total: rows.length, rows: rows.slice((page - 1) * ALL_PAGE, page * ALL_PAGE), page, names, cut };
}
// 헌재 결정 for a question of several words ('과잉금지 선거운동'). The court's services hold a phrase only as written, so
// when the phrase finds nothing each word is asked on its own — in the decisions' full text (주요 결정), their names
// (사건명) or the digest's holdings (판례요지집), as the kind asks — and the decisions every word found are kept: an AND the
// services do not do. A word is also asked the other ways of saying it (terms.expand: '과잉금지' as '비례원칙'), and words
// that together are one term ('정당 보조금') the other ways of saying that. Each word read up to WORDS_MOST lines; a word
// with more than that (a word in very many decisions) sifts nothing and is said so (loose). One word: as today.
//   byWords(kind, q, page)  kind 'leading' (주요 결정) | 'name' (사건명) | 'holding' (결정요지)  — also byWords(q, page, kind)
//   → { total, rows, via: 'phrase' | 'split', words, loose }   (rows: those of byLeading / byName / byHolding, as they are)
const WORDS_MOST = 300, WORDS_MAX = 4, FORMS = 2;   // (lines a word, words a question, other ways a word)
const KINDS = { leading: (q, p) => byLeading(q, p), name: (q, p) => byName(q, p), holding: (q, p) => byHolding(q, p) };
const loose = (s) => String(s || '').normalize('NFKC').replace(/[\s·ㆍ.,'"‘’“”「」『』()[\]<>]/g, '');
// how each kind is read word by word: its service and question, its lines, what names a line (one decision; one holding)
const SPLIT = {
  leading: { op: 'getRealmMainPrcdntList', ask: (w) => ({ code: '0', decisionNm: w }), also: (w) => ({ code: '0', eventNm: w }), row: leadRow, id: (r) => r.no },
  name: { op: 'getKorPrcdntList', ask: (w) => ({ eventNm: w, jgdmtCort: '전원재판부' }), row: nameRow, id: (r) => r.no },
  holding: { op: 'getOcprOutlineList', ask: (w) => ({ content: w }), row: (x) => ({ seq: one(x.seqNo), title: one(x.title), path: one(x.cntntpth), q: '' }), id: (r) => r.seq + '|' + r.title },
};
async function readWord(op, params, most, firstOnly) {
  const first = await list(SVC, op, params, 1, 100);
  const per = first.rows.length && first.rows.length < 100 && first.total > first.rows.length ? first.rows.length : 100;
  const pages = firstOnly ? 1 : Math.min(Math.ceil(first.total / per), Math.ceil(most / per));
  const rest = pages > 1 ? await Promise.all(Array.from({ length: pages - 1 }, (_, i) => list(SVC, op, params, i + 2, per).then((r) => r.rows, () => []))) : [];
  const rows = [first.rows, ...rest].flat();
  return { rows, total: first.total, whole: rows.length >= first.total };
}
const asWords = new Map();
export async function byWords(a, b, c) {
  const [kind, q, page] = typeof a === 'string' && KINDS[a] && typeof b === 'string' ? [a, b, Number(c) || 1] : [KINDS[c] ? c : 'leading', String(a || ''), Number(b) || 1];
  const ask = KINDS[kind], words = String(q).trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return { ...(await ask(q.trim(), page)), via: 'phrase', words, loose: [] };
  const whole = await ask(words.join(' '), page);   // (the service's own trouble is said as today: never taken for 'none')
  if (whole.total) return { ...whole, via: 'phrase', words, loose: [] };
  const key = kind + '|' + words.join(' ');
  let p = asWords.get(key);
  if (!p) {
    p = split(kind, words);
    asWords.set(key, p);
    p.catch(() => asWords.delete(key));
  }
  const r = await p;
  return { total: r.rows.length, rows: r.rows.slice((page - 1) * 20, page * 20), via: 'split', words, loose: r.loose };
}
async function split(kind, typed) {
  const k = SPLIT[kind];
  // (the longest words first, at most WORDS_MAX: the shortest of a long question are the least telling)
  const words = [...new Set(typed)].sort((x, y) => y.length - x.length).slice(0, WORDS_MAX);
  // each word with the other ways of saying it that are not merely it written longer ('과잉금지원칙' holds '과잉금지')
  const formsOf = (w) => terms.expand(w).slice(1).filter((v) => !loose(v).includes(loose(w))).slice(0, FORMS);
  const read = async (w, firstOnly) => {
    const [r, n] = await Promise.all([readWord(k.op, k.ask(w), WORDS_MOST, firstOnly), k.also ? list(SVC, k.op, k.also(w), 1, 100).catch(() => null) : null]);
    if (n) r.rows = [...n.rows, ...r.rows];
    return r;
  };
  // (every word and its other ways asked at once: a question of two words waits about as long as one of them)
  const per = await Promise.all(words.map(async (w) => {
    const [own, ...more] = await Promise.all([read(w, false), ...formsOf(w).map((f) => read(f, true).catch(() => null))]);   // (a word's own trouble is the search's: thrown)
    const rows = [own, ...more].filter(Boolean).flatMap((r) => r.rows).map(k.row);
    return { w, rows, ids: new Set(rows.map(k.id)), total: own.total, whole: own.whole, forms: [w, ...formsOf(w)].map(loose) };
  }));
  // words that together are one term: the decisions found by its other ways hold all of them
  const joint = [];
  for (const c of terms.concepts(typed)) {
    if (c.words.length < 2 || !c.variants.length) continue;
    const got = await Promise.all(c.variants.slice(0, FORMS).map((f) => read(f, true).catch(() => null)));
    joint.push({ words: c.words, ids: new Set(got.filter(Boolean).flatMap((r) => r.rows).map(k.row).map(k.id)), rows: got.filter(Boolean).flatMap((r) => r.rows).map(k.row) });
  }
  // (a word with more lines than were read — a word in very many decisions — cannot say which lack it: it does not sift
  // them, and is said so, loose. Sifting by a part of its lines would drop, unseen, the decisions beyond them)
  const loosely = per.filter((x) => !x.whole).map((x) => x.w);
  // the lines to keep come from the word that found the fewest, or from a term's other ways
  const base = per.slice().sort((x, y) => x.total - y.total)[0];
  const text = (r) => loose([r.name, r.nick, r.area, r.title, r.path, ...(r.nicks || []), ...(r.areas || [])].filter(Boolean).join(' '));
  const holds = (r, x) => x.ids.has(k.id(r)) || x.forms.some((f) => text(r).includes(f)) || joint.some((j) => j.words.includes(x.w) && j.ids.has(k.id(r)));
  const at = new Map(), out = [];
  for (const r of [...base.rows, ...joint.flatMap((j) => j.rows)]) {
    const id = k.id(r);
    if (!id) continue;
    const y = at.get(id);
    if (y) { if (kind === 'leading') leadMerge(y, r); continue; }
    if (!per.every((x) => holds(r, x) || !x.whole)) continue;
    at.set(id, r); out.push(r);
  }
  // newest first (a decision); the digest's own order (헌법편, then 법령편, then 조례편) for its holdings
  const rows = kind === 'holding'
    ? out.map((x, i) => ({ x, i, k: [digestPart(x.path), Number(x.seq) || 0] })).sort((p, q) => p.k[0] - q.k[0] || p.k[1] - q.k[1] || p.i - q.i).map((e) => ({ ...e.x, q: base.w }))
    : out.sort((p, q) => dayNo(q.date) - dayNo(p.date)).map((r) => (kind === 'leading' ? leadDone(r) : r));
  return { rows, loose: loosely };
}
function items(data) {
  const h = data && data.header;
  if (!h || !/^0+$/.test(String(h.resultCode))) throw fail('unavailable');
  const it = data.body && data.body.items && data.body.items.item;
  return it == null || it === '' ? [] : Array.isArray(it) ? it : [it];
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·' };
function clean(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] || m)
    .replace(/<br\s*\/?>/gi, '\n')   // the digest (판례요지집) and the 주요판례 write their line breaks as <br>: breaks, never text
    .replace(/\r\n?/g, '\n').replace(/[　\t]/g, ' ').replace(/[ ]+\n/g, '\n').trim();
}
// a name on one line. '？' (or '?') right between two Hangul letters is a '·' lost on the way to the court's data
// ('탈법방법에 의한 문서？인쇄물의 배부？게시 금지'): a question mark there never asks anything
// a decision's or judgment's own headings — 【주문】, 【주 문】, 【이 유】, 【참 조 조 문】 — read alike, the spaces in them aside.
// dropHead: a part that begins with its own heading ('【주 문】⏎1. 국가공무원법 …' as 2018헌마551's 주문 came) without it;
// partOf: the text under one heading of a judgment's full text, up to the next heading ('' when it has none)
const HEAD_AT = /^\s*【[ \t]*([^【】\n]{1,30}?)[ \t]*】[ \t]*\n?/;
const headName = (h) => String(h || '').replace(/[\s·ㆍ]/g, '');
export const dropHead = (t, ...names) => { const s = String(t || ''); const m = HEAD_AT.exec(s); return m && names.includes(headName(m[1])) ? s.slice(m[0].length).replace(/^\s+/, '') : s; };
export function partOf(text, name) {
  const s = String(text || ''), re = /【[ \t]*([^【】\n]{1,30}?)[ \t]*】/g;
  let m, from = -1;
  while ((m = re.exec(s))) {
    if (from >= 0) return s.slice(from, m.index).trim();
    if (headName(m[1]) === name) from = m.index + m[0].length;
  }
  return from >= 0 ? s.slice(from).trim() : '';
}
const one = (s) => midDot(clean(s).replace(/\s+/g, ' ')).trim();
// ('배부？게시', '배부 ? 살포': a '·' lost on the way — in a name or a title a question mark never asks anything)
export const midDot = (s) => String(s || '').replace(/([가-힣])[ \t]*[？?][ \t]*(?=[가-힣])/g, '$1·');
const ymd = (s) => { const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(s || '').trim()); return m ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.` : ''; };
const nameOf = (s) => one(s).replace(/(\d조(?:의\d+)?|\d항|\d호)\s+(의|에)(?=\s)/g, '$1$2');   // 제241조 의 → 제241조의
// what a decision says, read as it should be: its 주문 without the parties' lines, its result as the 주문 gives it (resultOf).
// Kept decisions are mended as they are read, so one kept before reads the same
function mend(d) {
  if (!d || typeof d !== 'object') return d;
  if (d.order) d.order = orderText(dropHead(d.order, '주문'));
  if (d.order && !d.pending) d.result = resultOf(d.result, d.order);
  return d;
}
function shape(no, row, det, code) {
  const g = (k) => (det ? clean(det[k]) : '');
  const info = g('panreInfo');   // (2004. 10. 21. 2004헌마554·566(병합) 전원재판부)
  let reason = g('reason');
  if (!reason && det) reason = ['eventSummary', 'abjObt', 'caseRelatedOpinion', 'judgement', 'conclusion', 'otherOpinions'].map(g).filter(Boolean).join('\n\n');
  return {
    no, name: nameOf(row.eventNm) || nameOf(g('panreTitle')), date: ymd(row.rstaDate || (det && det.rstaDate)),
    result: one(row.rstaRsta || g('rstaRsta')), court: one(row.jgdmtCort || g('jgdmtCort')),
    joined: /병합|\d\s*·\s*\d|\d등/.test(info), src: SRC[code] || '', info: one(info),   // (its heading: some carry [판례집 11-1, 653~666])
    vol: one(g('volumeInfo')), ser: one(g('seriesInfo')), pages: one(g('pages')),
    order: dropHead(g('textOfDecision'), '주문'), points: dropHead(g('pansiMatt'), '판시사항'), summary: dropHead(g('decisionGst'), '결정요지', '판결요지'),
    laws: dropHead(g('refrnPrvsn'), '참조조문'), cites: dropHead(g('refrnPrcdnt'), '참조판례'), reason,
  };
}

// 헌재 2004. 10. 21. 2004헌마554등 — the form papers cite a decision by; and in full, with where it is printed:
// 헌재 2014. 12. 19. 2013헌다1, 판례집 26-2하, 1 (공보: 헌재 2020. 7. 16. 2018헌바242등, 공보 286, 1018)
export const cite = (d) => `헌재 ${d.date ? d.date + ' ' : ''}${d.no}${d.joined ? '등' : ''}`;
export const citeFull = (d) => { const w = where(d); return cite(d) + (w ? ', ' + w : ''); };
const volOf = (d) => `${Number(d.vol) || d.vol}${d.ser && d.ser !== '0' ? '-' + d.ser : ''}`;
const firstPage = (d) => String(d.pages || '').split(/[~-]/)[0].trim();
function where(d) {
  if (!d) return '';
  if (!d.vol && d.pj && d.pj.vs) return `판례집 ${d.pj.vs}${d.pj.h || ''}${d.pj.p ? ', ' + d.pj.p : ''}`;
  const p = firstPage(d);
  if (d.src === '판례집' && d.vol) return `판례집 ${d.book ? d.book.vs + d.book.h : volOf(d)}${p ? ', ' + p : ''}`;
  if (d.src === '공보' && d.vol) return `공보 ${d.vol}${p ? ', ' + p : ''}`;
  return '';
}

/* ---------------- 판례집: the volume, and for a volume printed in two books, the book ----------------
   The court's record of a decision says 판례집 16, 집 2, pages 1~75 — not which of the two books of 16-2 (상·하) it is in,
   and each book numbers its pages from 1: 16-2상 1 and 16-2하 1 are different decisions. So the book is read where the court
   writes it — the decision's own heading ([판례집 11-1, 653~666]); its cites, in the digest ('헌재 2004. 10. 21. 2004헌마554등,
   판례집 16-2하, 1, 50'), in other decisions' 참조판례, on the 주요판례 card ('판례집 16-2권(하)') — or from the order of the
   volume, known from the cites of other decisions in it: a volume stands by date, 상 before 하, each book's pages rising, so a
   decision before one in 상 is in 상, one after one in 하 is in 하, one after a 상 decision on a lower page than it is in 하,
   one before a 하 decision on a higher page than it is in 상. Anything else is said to be unknown — never guessed. */
// 판례집 volumes printed as one book: 1–14 and 15-1, and those the court cites with no book (16-1, 17-1, 17-2, 19-1, 19-2)
const ONE_BOOK = new Set(['15-1', '16-1', '17-1', '17-2', '19-1', '19-2']);
const oneBook = (vs) => Number(String(vs).split('-')[0]) < 15 || ONE_BOOK.has(vs);
// places in the volumes printed in two books, from the court's own cites (date, book, first page = number), read from its
// decisions and digest as recorded for the app's tests
const ANCHORS = `15-2 20031030하185=2002헌마518 20031127하339=2003헌마259 20031127하350=2003헌마694 20031218하609=2001헌마754
16-2 20040826상141=2002헌가1 20041021하1=2004헌마554 20041028하104=99헌바91 20041125하381=2004헌바35
18-1 20060223상208=2004헌바80 20060525하28=2005헌라4 20060629하337=2005헌마165
20-1 20080228상279=2005헌마872 20080327상332=2006헌라1
20-2 20080731상91=2004헌바81 20080731상236=2004헌마1010 20080925상647=2008헌마456 20081030상793=2006헌바35 20081226하960=2008헌마419
21-1 20090226상292=2008헌마370 20090326상406=2007헌바72 20090430하23=2005헌바101 20090528하503=2006헌바86 20090528하545=2006헌바109 20090528하746=2006헌마618
21-2 20090730상364=2007헌마991 20091029하248=2008헌바146
22-1 20100527하244=2009헌바49 20100527하275=2005헌마346
23-1 20110224상75=2009헌바29
23-2 20110830상174=2008헌가22 20110830상286=2009헌바42 20110830상366=2006헌마788 20111025하18=2010헌바476 20111025하101=2010헌마661
24-2 20120823상471=2010헌바402 20121129하250=2011헌마827 20121227하387=2011헌바117
25-2 20130829상382=2010헌바354 20131128하559=2012헌마166
26-1 20140227상310=2014헌마7
26-2 20140724상226=2013헌마423
27-1 20150226상20=2009헌바17 20150625하402=2013헌가17
27-2 20150730상370=2014헌마340 20150924상545=2013헌바393 20151126하335=2012헌마940
28-1 20160225상242=2013헌마838 20160331상509=2014헌마785
28-2 20161027상732=2014헌마709`;
const books = new Map();   // number → { vs: '16-2', h: '하' | '', p: 1, date: '20041021', mine } — where the court cites it
const marks = new Map();   // '16-2' → [{ date, h, p }]: the known places of a volume printed in two books
const twoBooks = (vs) => marks.has(vs);
// (a cite is taken only when its date fits its volume: volume = year − 1988, 집 1 = January to June, 집 2 = July to December)
const fits = (vs, day) => { const [v, s] = String(vs).split('-').map(Number), y = Number(String(day).slice(0, 4)), mo = Number(String(day).slice(4, 6)); return y - 1988 === v && (!s || (s === 1 ? mo <= 6 : mo >= 7)); };
function place(no, vs, h, p, day, mine) {
  if (!no || !day || !fits(vs, day)) return false;
  const k = books.get(no);
  if (k && (k.h || !h)) return false;   // known already, as well as this says
  books.set(no, { vs, h, p, date: day, mine });
  if (h) { if (!marks.has(vs)) marks.set(vs, []); marks.get(vs).push({ date: day, h, p }); }
  return true;
}
for (const l of ANCHORS.split('\n')) { const [vs, ...xs] = l.trim().split(/\s+/); for (const x of xs) { const m = /^(\d{8})(상|하)(\d+)=(.+)$/.exec(x); if (m) place(m[4], vs, m[2], Number(m[3]), m[1], false); } }
let booksRead = null, saveT = 0;
function loadBooks() {
  return booksRead || (booksRead = store.get('kv', 'pjbooks').catch(() => null).then((o) => {
    for (const [no, [vs, h, p, day]] of Object.entries(o || {})) place(no, vs, h, p, day, true);
  }));
}
function saveBooks() {
  const o = {};
  for (const [no, b] of books) if (b.mine) o[no] = [b.vs, b.h, b.p, b.date];
  store.put('kv', 'pjbooks', o).catch(() => {});
}
// the decisions a text cites with their day — '헌재 2004. 10. 21. 2004헌마554등, 판례집 16-2하, 1, 50' — and, where it says, the
// book and first page they are printed at
const CITED = /헌재\s*((?:19|20)\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*/g;
const BOOK = /^[^,，;]{0,16}[,，]\s*판례집\s*(\d{1,2})(?:\s*-\s*(\d))?\s*(상|하)?\s*[,，]\s*(\d{1,4})/;
export function citesIn(text) {
  const s = String(text || ''), out = [];
  CITED.lastIndex = 0;
  let m;
  while ((m = CITED.exec(s))) {
    const rest = s.slice(CITED.lastIndex, CITED.lastIndex + 100), c = scanCases(rest)[0];
    if (!c || c.i !== 0) continue;
    const after = rest.slice(c.len), b = BOOK.exec(after);
    out.push({ no: c.no, date: `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.`, day: m[1] + m[2].padStart(2, '0') + m[3].padStart(2, '0'),
      joined: /^\s*(?:등|[,·ㆍ]\s*\d)/.test(after), book: b ? { vs: b[1] + (b[2] ? '-' + b[2] : ''), h: b[3] || '', p: Number(b[4]) } : null });
  }
  return out;
}
// what the court's texts read here cite: kept on this device, for the books of the decisions opened later
const remember = () => loadBooks().then(() => { clearTimeout(saveT); saveT = setTimeout(saveBooks, 1500); });
function learn(text) {
  let n = 0;
  for (const c of citesIn(text)) if (c.book && place(c.no, c.book.vs, c.book.h, c.book.p, c.day, true)) n++;
  if (n) remember();
  return n;
}
// the book from the order of the volume (see above); '' when the known places do not say
function infer(vs, day, p) {
  if (!day) return '';   // (no date: no place in the order)
  let up = false, down = false;
  for (const m of marks.get(vs) || []) {
    if (m.h === '상') { if (day < m.date) up = true; else if (day > m.date && p && p < m.p) down = true; }
    else if (day > m.date) down = true; else if (day < m.date && p && p > m.p) up = true;
  }
  return up === down ? '' : up ? '상' : '하';
}
const dayOf = (date) => { const m = /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./.exec(String(date || '')); return m ? m[1] + m[2].padStart(2, '0') + m[3].padStart(2, '0') : ''; };
// the decision's 판례집 book: { vs: '16-2', h: '하' | '', sure }, kept on the decision (d.book); sure false: a volume that is
// or may be in two books, and where in it this decision is could not be read. hint.seq: its 주요판례 card, when opened from one
export async function book(d, hint) {
  if (!d || d.src !== '판례집' || !d.vol) return null;
  if (d.book && !d.book.later) return d.book;
  const vs = volOf(d), p = Number(firstPage(d)) || 0, day = dayOf(d.date), set = (h, sure, later) => (d.book = { vs, h, sure, ...(later ? { later } : {}) });
  if (oneBook(vs)) return set('', true);
  const br = /\[\s*판례집\s*(\d{1,3})(?:\s*-\s*(\d))?\s*(상|하)?\s*,/.exec(d.info || '');
  if (br && br[1] + (br[2] ? '-' + br[2] : '') === vs && (br[3] || !twoBooks(vs))) return set(br[3] || '', true);
  await loadBooks();
  const known = () => { const k = books.get(d.no); return k && k.vs === vs && (!p || !k.p || k.p === p) ? k : null; };
  const read = () => { const k = known(); if (k && k.h) return set(k.h, true); const h = infer(vs, day, p); if (h) return set(h, true); return k && !twoBooks(vs) ? set('', true) : null; };
  let b = read();
  if (b || !navigator.onLine) return b || set('', false, true);   // (offline: said to be unknown, and asked again later)
  if (hint && hint.seq) b = await fromLeading(d, vs, hint.seq).catch(() => null);
  if (!b) { await fromDigest(d.no).catch(() => {}); b = read(); }
  return b || set('', false);
}
// the 주요판례 card of the decision: '판례집 16-2권(하)'
async function fromLeading(d, vs, seq) {
  const x = (await list(SVC, 'getRealmMainPrcdntDetail', { seq }, 1, 1)).rows[0];
  const m = x && /판례집\s*(\d{1,3})(?:\s*-\s*(\d))?\s*권?\s*(?:\(\s*(상|하)\s*\))?/.exec(one(x.exeBook));
  if (!m || m[1] + (m[2] ? '-' + m[2] : '') !== vs || !scanCases(String(x.eventNo || '')).some((c) => c.no === d.no)) return null;
  if (!m[3] && twoBooks(vs)) return null;
  if (place(d.no, vs, m[3] || '', Number(firstPage(d)) || 0, dayOf(d.date), true)) remember();
  return (d.book = { vs, h: m[3] || '', sure: true });
}
// the digest's holdings that come from the decision, the smallest heading first: their cites say its book
async function fromDigest(no) {
  const r = await list(SVC, 'getOcprOutlineList', { eventNo: no }, 1, 20);
  const n = new Map();
  for (const x of r.rows) { const s = one(x.seqNo); n.set(s, (n.get(s) || 0) + 1); }
  for (const seq of [...n.keys()].sort((a, b) => n.get(a) - n.get(b)).slice(0, 2)) {
    for (const x of (await heading(seq, 2)).rows) learn(clean(x.content));
    if (books.has(no)) return;
  }
}
// what the digest (판례요지집) knows of a decision the court's list does not answer (2012헌마190, asked by its number alone, has
// no name to look it up by): its holdings there ({ seq, title }) and how they cite it ('헌재 2014. 10. 30. 2012헌마190등,
// 판례집 26-2상, 668'). The digest's list asked by a number gives no number with its lines, and may answer others that begin
// with it (2012헌마19 …): a holding is taken only when its own text cites this number. null when the digest has nothing
async function digestOf(no) {
  const r = await list(SVC, 'getOcprOutlineList', { eventNo: no }, 1, 20);
  const want = new Set(r.rows.map((x) => one(x.seqNo) + '\n' + one(x.title)));
  const holds = [], seen = new Set();
  let cited = null;
  for (const seq of [...new Set(r.rows.map((x) => one(x.seqNo)).filter(Boolean))].slice(0, 3)) {
    for (const x of (await heading(seq, 2)).rows) {
      const h = held(x), k = one(x.seqNo || seq) + '\n' + h.title;
      learn(h.text);
      const mine = h.cites.filter((c) => c.no === no);
      if (!mine.length) continue;
      for (const c of mine) cited = !cited || (!cited.book && c.book) ? { ...c, joined: c.joined || !!(cited && cited.joined) } : { ...cited, joined: cited.joined || c.joined };   // (the fullest cite)
      if (want.has(k) && !seen.has(k)) { seen.add(k); holds.push({ seq: one(x.seqNo || seq), title: h.title, path: h.path }); }
    }
  }
  return holds.length || cited ? { holds: holds.slice(0, 12), cite: cited } : null;
}
function bookHtml(d) {
  if (!where(d)) return pjPending(d) ? '<small class="cs-unsure">판례집 확인 중</small>' : '<span class="cs-nobook">판례집 표기 없음</span>';
  const w = esc(where(d));
  return d.book && !d.book.sure ? `${w} <small class="cs-unsure">상·하 미확인</small>` : bookPending(d) ? `${w} <small class="cs-unsure">상·하 확인 중</small>` : w;
}
// the two forms to cite it by, each copied with a tap (filled in once its book is read)
function citeAsHtml(d) {
  const full = citeFull(d), short = cite(d);
  const row = (k, t) => `<button type="button" class="cs-cf" data-cite-copy="${k}"><span>${esc(t)}</span><em>복사</em></button>`;
  const unsure = d.book && !d.book.sure
    ? `<p class="cs-note">판례집 ${esc(d.book.vs)} — ${twoBooks(d.book.vs) ? '상·하 두 권으로 나뉘어 있는데, 이 결정이 어느 권에 실렸는지' : '상·하 두 권으로 나뉘었는지'} 확인하지 못했습니다. 인용하기 전에 확인하세요.</p>` : '';
  const none = !where(d) ? '<p class="cs-note">판례집 표기가 공개 자료에 없습니다 · 헌재 판례검색에서 확인하세요.</p>'
    : d.pj && !d.vol ? '<p class="cs-note">판례집 표기는 판례요지집이 이 결정을 인용한 대로 적었습니다.</p>' : '';
  return `<h4>인용</h4>${row('full', full)}${full !== short ? row('short', short) : ''}${unsure}${none}`;
}
// a decision whose record has no 판례집 volume and page (2013헌바389: the court's data gives only its 결정문): how the
// digest (판례요지집) cites it — '헌재 2016. 7. 28. 2013헌바389, 판례집 28-2상, 1' — is its book (d.pj), when the day it gives
// is the decision's own; and the digest's holdings of it (d.holds) stand where its 결정요지 is missing. Asked once, after
// its first year (a newer one is not printed yet), then again after PJ_AGAIN; what was learnt is kept with the decision
const PJ_AGAIN = 30 * 864e5, PJ_WAIT = 2500, PJ_BLANK = 864e5;
// (still being asked: never offline, nor once this session's ask has ended — answered or failed — so '판례집 확인 중' never
// stays on a line with nothing on its way)
const pjTried = new Set();
export const pjPending = (d) => !!(d && !d.pending && !where(d) && !d.pjAt && pjDue(d) && !pjTried.has(d.no) && (typeof navigator === 'undefined' || navigator.onLine !== false));
const pjDue = (d) => { const day = dayOf(d.date); return !!day && Date.now() - Date.parse(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}T00:00:00Z`) > 365 * 864e5; };
const pjAsking = new Map();
export function pjFill(d) {
  if (!d || d.pending || where(d) || (d.pjAt && Date.now() - d.pjAt < PJ_AGAIN) || !pjDue(d) || !navigator.onLine) return Promise.resolve(false);
  if (!pjAsking.has(d.no)) {
    pjAsking.set(d.no, digestOf(d.no).then((g) => {
      const c = g && g.cite;
      const pj = c && c.book && c.date === d.date ? { vs: c.book.vs, h: c.book.h || '', p: c.book.p } : null;
      return { pj, holds: (g && g.holds) || [], blank: !g };
    }).finally(() => { pjTried.add(d.no); setTimeout(() => pjAsking.delete(d.no), 1000); }));
  }
  return pjAsking.get(d.no).then(async ({ pj, holds, blank }) => {
    // (the digest answering nothing at all may be the portal's blank page: asked again after a day, not after PJ_AGAIN)
    d.pjAt = blank ? Date.now() - PJ_AGAIN + PJ_BLANK : Date.now();
    if (pj) d.pj = pj;
    if (holds.length) d.holds = holds;
    const k = await store.get('kv', 'case:' + d.no).catch(() => null);
    if (k && k.v === SHAPE && k.d && k.d.no === d.no) store.put('kv', 'case:' + d.no, { ...k, d: { ...k.d, pjAt: d.pjAt, ...(pj ? { pj } : {}), ...(holds.length ? { holds } : {}) } }).catch(() => {});
    return !!pj || !!holds.length;
  }, () => false);
}
// (copied with no 판례집 or 공보 volume and page at all — not printed yet, or not in the court's public data — said so, so it is
// not put in a footnote as it is)
export const NO_BOOK = '판례집 권·쪽 없이 복사했습니다';
export const citeNote = (d) => (d && d.book && !d.book.sure ? '판례집 상·하 권은 확인하지 못했습니다' : d && !where(d) ? NO_BOOK : '');
// its book not read yet (book() still on its way) in a volume that is or may be printed in two books: '판례집 25-2, 398' would
// read as a settled cite though 25-2상 398 and 25-2하 398 are different decisions
export const bookPending = (d) => !!(d && d.src === '판례집' && d.vol && !d.book && !oneBook(volOf(d)));   // (offline: book() says it is unknown — 미확인)
// what a copy button copies now: the full form once its book is read (said when it could not be), until then the short form
// — never a 판례집 cite that leaves out its book unsaid
// incomplete: what is copied has no 판례집 (or 공보) volume and page — not printed yet, its book still being read, or not in
// the court's public data (the caller says so: '판례집 권·쪽 없이 복사했습니다'); note keeps its own word as before
export const citeCopy = (d) => (bookPending(d) ? { text: cite(d), note: '판례집 권을 아직 확인하는 중이라 사건번호까지만 복사했습니다', incomplete: true } : { text: citeFull(d), note: citeNote(d), incomplete: !where(d || {}) });
// the full form for a line (the card in 판례): marked while its book is being read, or when it could not be
export const citeHtml = (d) => esc(citeFull(d)) + (bookPending(d) ? ' <small class="cs-unsure">상·하 확인 중</small>' : d && d.book && !d.book.sure ? ' <small class="cs-unsure">상·하 미확인</small>' : '');

/* ---------------- what is known when the court's data has no decision ---------------- */
// the court's own search (a search page, asked by hand: the number is copied on the way there)
const CCOURT = 'https://search.ccourt.go.kr/ths/pr/ths_pr0101_L1.do';
const outLinks = (no) => `<p class="cs-out"><a class="btn ghost small" href="${lawGoKr.decision(no)}" target="_blank" rel="noopener">국가법령정보센터에서 보기</a>`
  + `<a class="btn ghost small" href="${CCOURT}" target="_blank" rel="noopener" data-copy-no="${esc(no)}">헌법재판소 판례검색</a></p>`;
export const COPY_NO = '판례검색 창에 사건번호를 붙여 넣으세요';
// the same, in a line (the card a number asked in 판례 shows)
export function missingLine(no) {
  const g = (missOf(no) || {}).group, c = missingCites(no);
  return (c.dated ? c.full + ' · ' : '') + (g && g[0] !== no ? `${g[0]} 사건에 병합되어 함께 결정되었습니다 · 판례정보에서 찾지 못했습니다`
    : g && g.length > 1 ? `병합 사건(${g.length}건)의 앞번호입니다 · 판례정보에서 찾지 못했습니다` : '헌법재판소 판례정보에서 찾지 못했습니다');
}
// the decision as far as it is known — the line it was opened from (name, date, field), the cases decided with it — what was
// tried, and where to read it: never a guess at why it is missing (a first number is never called a later one)
// opts.holdings: its holdings in the digest listed, each opening it (data-holding; the 판례 screen's sheet opens them)
export function missingView(no, hint = {}, miss = missOf(no) || {}, opts = {}) {
  const group = miss.group || null, lead = group && group[0] !== no ? group[0] : '', named = !!hint.name;
  const dg = miss.digest || {}, c = missingCites(no, hint, miss), date = hint.date || (dg.cite && dg.cite.date) || '';
  const meta = [hint.nick, date && date + ' 선고', hint.area].filter(Boolean).map(esc).join(' · ');
  // (the digest's own cite of it: its day and book as the court prints them — the line a footnote needs)
  const cited = dg.cite ? `<p class="cs-wait">판례요지집은 이 결정을 이렇게 인용합니다: <b>${esc(citeLine({ ...dg.cite, no, joined: dg.cite.joined || c.joined }))}</b></p>` : '';
  const holds = opts.holdings && (dg.holds || []).length ? `<section class="cs-sec"><h4>판례요지집의 이 결정 요지 ${dg.holds.length}건</h4><div class="cs-rels">${dg.holds.map((x) => `<button type="button" class="cs-rel" data-holding="${esc(x.seq)}" data-title="${esc(x.title)}" data-q="${esc(no)}"><b>${esc(x.title)}</b><span>${esc(x.path)}</span></button>`).join('')}</div></section>` : '';
  // (opts.failed: the court's service did not answer — what is known shown all the same, and never "not found")
  const why = opts.failed ? esc(opts.failed) : lead ? `${esc(no)} —${esc(lead)} 사건 등과 병합되어 함께 결정되었습니다. 헌법재판소 판례정보(공공데이터포털)에서 이 결정을 찾지 못했습니다.`
    : group && group.length > 1 ? `병합된 사건의 앞번호입니다 (함께 결정된 사건 ${group.length}건: ${group.map(esc).join(' · ')}). 헌법재판소 판례정보(공공데이터포털)에서 이 번호로도, 함께 결정된 번호로도${named ? ', 사건명으로도' : ''} 결정을 찾지 못했습니다.`
    : `헌법재판소 판례정보(공공데이터포털)에서 이 결정을 찾지 못했습니다${named ? ' (사건번호로도, 사건명으로도)' : ''}. 아직 실리지 않았거나 사건번호가 다를 수 있습니다.`;
  const cands = (miss.cands || []).length ? `<p class="cs-wait">같은 날 같은 이름으로 실린 결정 ${miss.cands.map((c) => `<button type="button" class="case-ln" data-case="${esc(c.no)}" data-cdate="${esc(c.date)}">${esc(c.no)}</button>`).join(' · ')} — 같은 결정인지 확인하세요.</p>` : '';
  return (named ? `<div class="cs-name">${esc(hint.name)}</div>` : '') + (meta ? `<div class="cs-meta">${meta}</div>` : '')
    + `<p class="cs-wait">${why}</p>${cited}${cands}${holds}<p class="cs-wait">국가법령정보센터나 헌법재판소 판례검색에서 결정문을 볼 수 있습니다.</p>` + outLinks(lead || no);
}
// the forms to cite it by, from what is known: the day from the line it was opened from or from the digest's cite of it, 등
// for the first number of a joined group (or as the digest writes it), and the book only as the digest gives it. dated: a
// citation needs its day — without one, only the number is known
export function missingCites(no, hint = {}, miss = missOf(no) || {}) {
  const g = miss.group, dc = (miss.digest || {}).cite || null;
  const joined = !!(g && g.length > 1 && g[0] === no) || !!(dc && dc.joined) || !!hint.joined, date = hint.date || (dc && dc.date) || '';
  const short = cite({ no, date, joined });
  const full = dc && dc.book && (!hint.date || dc.date === hint.date) ? citeLine({ ...dc, no, joined }) : short;
  return { short, full, joined, dated: !!date };
}
export const missingCite = (no, hint = {}) => missingCites(no, hint).short;

/* ---------------- the digest's holdings, shown ---------------- */
// a decision's name and day, for a line of a list (관련 결정): the decision kept here, else the list's line for its number
const briefs = new Map();
export function brief(no) {
  if (!briefs.has(no)) {
    briefs.set(no, (async () => {
      const k = await kept(no);
      if (k && k.d) return { no, name: k.d.name, date: k.d.date, result: k.d.result, joined: !!k.d.joined };
      if (!navigator.onLine) return null;
      const r = await byNo(no);
      if (!r) return null;
      // joined: the list's line carries other numbers ('2012헌마190 등'), else the court's record of joined cases says so
      // (the line of 2004헌마554 is the bare number: its group 2004헌마554·566 is only in getMergedCase)
      const joined = /등|[,·ㆍ]/.test(String(r.eventNo || '')) || ((await mergedGroup(no).catch(() => null)) || []).length > 1;
      return { no, name: nameOf(r.eventNm), date: ymd(r.rstaDate), result: one(r.rstaRsta), joined };
    })().catch(() => null));
  }
  return briefs.get(no);
}
const citeLine = (c) => `헌재 ${c.date ? c.date + ' ' : ''}${c.no}${c.joined ? '등' : ''}${c.book ? `, 판례집 ${c.book.vs}${c.book.h}, ${c.book.p}` : ''}`;
const relRow = (c) => `<button type="button" class="cs-rel" data-case="${esc(c.no)}" data-cdate="${esc(c.date || '')}"${c.joined ? ' data-joined="1"' : ''}><b>${esc(citeLine(c))}</b><span data-name="${esc(c.no)}"></span></button>`;
// each decision once (its fullest cite), by date
function ownCites(xs) {
  const at = new Map();
  for (const c of xs) { const y = at.get(c.no); if (!y || (!y.book && c.book)) at.set(c.no, y ? { ...c, joined: c.joined || y.joined } : c); }
  return [...at.values()].sort((a, b) => a.day.localeCompare(b.day));
}
// a holding (holding()): where the digest files it, its title, its text, the decisions it comes from (with their names), and,
// folded, the heading's other decisions. Several holdings of the one title: each in turn. A title the heading lacks: its titles
export function holdingView(h) {
  const head = `<div class="cs-meta">${esc(h.path)}</div><div class="cs-name">${esc(h.title)}</div>`;
  // (nothing came for the heading the list just named: the portal's blank answer — never "0건", and asked again next time)
  if (!h.read) return head + '<p class="cs-wait">판례요지집이 이 항목의 결정요지를 보내 주지 않았습니다. 잠시 뒤 다시 열어 보세요.</p>';
  if (!h.pick.length) {
    return head + `<p class="cs-wait">판례요지집의 이 항목에서 이 제목의 결정요지를 찾지 못했습니다${h.read < h.total ? ` (${h.total}건 가운데 ${h.read}건을 읽었습니다)` : ''}. 다른 요지를 이 제목으로 보여 드리지 않습니다 — 이 항목의 결정요지 ${h.titles.length}건입니다.</p>`
      + `<div class="cs-rels">${h.titles.map((t) => `<button type="button" class="cs-rel" data-holding="${esc(h.seq)}" data-title="${esc(t)}"><b>${esc(t)}</b></button>`).join('')}</div>`;
  }
  const many = h.pick.length > 1, rest = h.same.filter((x) => !h.pick.includes(x));
  const text = (x) => `<p>${linkCases(x.text, 'decision')}</p>`;
  const own = ownCites(h.pick.flatMap((x) => x.cites));
  const others = h.others.filter((no) => !own.some((c) => c.no === no));
  return head
    + (many ? `<p class="cs-wait">이 항목에 같은 제목의 결정요지가 ${h.pick.length}건 있습니다 · 각 요지 끝에 그 요지가 나온 결정이 있습니다.</p>` : '')
    + h.pick.map((x, i) => `<section class="cs-sec">${many ? `<h4>${i + 1} / ${h.pick.length}</h4>` : ''}${text(x)}</section>`).join('')
    + (rest.length ? `<details class="cs-fold" data-same><summary>같은 제목의 다른 결정요지<span>${rest.length}</span></summary>${rest.map(text).join('')}</details>` : '')
    + (own.length ? `<section class="cs-sec"><h4>이 요지의 결정</h4><div class="cs-rels">${own.map(relRow).join('')}</div></section>` : '')
    // (how the heading's texts cite them — day, 등, book — goes with the fold: its lines are cites, not bare numbers)
    + (others.length ? `<details class="cs-fold" data-others data-cited="${esc(JSON.stringify(Object.fromEntries(others.filter((no) => (h.citedAs || {})[no]).map((no) => [no, h.citedAs[no]]))))}"><summary>이 항목의 다른 결정<span>${others.length}</span></summary><div class="cs-rels" data-nos="${esc(others.join(' '))}"></div></details>` : '');
}
// the names of the decisions listed (three asked at a time); the heading's other decisions once their fold opens, by date
const noKey = (no) => { const m = /^(\d{2,4})헌(.)(\d+)$/.exec(no) || []; const y = Number(m[1]) || 0; return (y < 100 ? 1900 + y : y) * 1e5 + (Number(m[3]) || 0); };
export function wireHolding(box) {
  const names = async (rows) => {
    let i = 0;
    const next = async () => {
      while (i < rows.length) {
        const r = rows[i++], b = await brief(r.dataset.case);
        if (!b || !r.isConnected) continue;
        const s = r.querySelector('[data-name]'); if (s) s.textContent = [b.name, b.result].filter(Boolean).join(' · ');
        // (a line still without its day gets it in citation form — with 등 for joined cases: 헌재 2004. 10. 21. 2004헌마554등)
        if (!r.dataset.cdate && b.date) { r.dataset.cdate = b.date; r.querySelector('b').textContent = cite({ no: r.dataset.case, date: b.date, joined: b.joined || r.dataset.joined === '1' }); }
      }
    };
    await Promise.all([next(), next(), next()]);
  };
  names([...box.querySelectorAll('.cs-rel[data-case]')]);
  const f = box.querySelector('details[data-others]');
  if (f) f.addEventListener('toggle', () => {
    if (!f.open || f.dataset.done) return;
    f.dataset.done = '1';
    const list = f.querySelector('.cs-rels'), nos = list.dataset.nos.split(' ').filter(Boolean).sort((a, b) => noKey(a) - noKey(b));
    let cited = {}; try { cited = JSON.parse(f.dataset.cited || '{}'); } catch (e) { /* bare numbers, then */ }
    list.innerHTML = nos.map((no) => relRow(cited[no] || { no })).join('');
    names([...list.children].slice(0, 30)).then(() => {
      const rows = [...list.children], at = (r) => dayOf(r.dataset.cdate) || '9';
      rows.sort((a, b) => at(a).localeCompare(at(b)) || noKey(a.dataset.case) - noKey(b.dataset.case)).forEach((r) => list.appendChild(r));
    });
  });
}

/* ---------------- shown ---------------- */
// the court's texts keep the line breaks of their print: a break inside a sentence (even inside a word) is joined again,
// one before a numbered point, a heading, a "label : value" line or after a finished sentence stays
const POINT = /^\s*(?:\d{1,2}\s*[.)](?!\s*\d)|\(\s*(?:\d{1,2}|[가나다라마바사아자차카타파하])\s*\)|[①-⑳㉠-㉭○◯●■□▶▷◆◇※\-–—·]|\[|재판관\s|대리인\s|【)/;
const HPOINT = /^\s*[가나다라마바사아자차카타파하]\s*\.\s/;   // 가. 나. … (but 다. also ends a sentence cut before its last letter)
const ENDS = /(?:[다음함것임됨요까]\.|[?!。])\s*$/;
// (a line that is only its point's number — '[1]', '［2］' — goes on with the point's text, after a space; a line that ends
// in an opening quote — ‘ “ 「 『 — goes on with what it quotes: 판시사항 are printed so)
const LONE_NO = /^\s*[[［]\s*\d{1,2}\s*[\]］]\s*$/, OPEN_Q = /[‘“「『]\s*$/;
// 판시사항 as the court lists them, an item a line ('다. … 침해 여부⏎라. …' — items that end without a period, which unwrap would
// run together: '여부라.'): only those two joins, every other line as it was
export function joinPoints(s) {
  const ls = String(s || '').split('\n');
  let out = ls[0] || '';
  for (let i = 1; i < ls.length; i++) {
    const a = ls[i - 1], b = ls[i];
    if (b.trim() && LONE_NO.test(a)) out = out.replace(/\s+$/, '') + ' ' + b.trim();
    else if (b.trim() && OPEN_Q.test(a)) out = out.replace(/\s+$/, '') + b.trim();
    else out += '\n' + b;
  }
  return out;
}
export function unwrap(s) {
  const ls = String(s || '').split('\n');
  let out = ls[0] || '';
  for (let i = 1; i < ls.length; i++) {
    const a = ls[i - 1], b = ls[i];
    if (b.trim() && LONE_NO.test(a)) { out = out.replace(/\s+$/, '') + ' ' + b.trim(); continue; }
    if (b.trim() && OPEN_Q.test(a)) { out = out.replace(/\s+$/, '') + b.trim(); continue; }
    const heading = (POINT.test(a) || HPOINT.test(a)) && a.trim().length <= 40 && !/[.。]\s*$/.test(a);
    const keep = !a.trim() || !b.trim() || POINT.test(b) || (HPOINT.test(b) && (ENDS.test(a) || /[.)]\s*$/.test(a) || heading)) || heading || ENDS.test(a) || /^\S{1,10}\s?:\s/.test(b);
    out += (keep ? '\n' : /[.,;:]$/.test(a) && /^[\p{L}\p{N}]/u.test(b) ? ' ' : '') + b;   // 2004. 10. | 21. → 2004. 10. 21.
  }
  return out;
}
// text with what it cites as links: 헌재 decisions, courts' judgments, and articles of laws. The text is read with its corner
// brackets as HWP writes them made plain (｢ ｣ → 「 」, one letter for one) and shown as it is. An article cited as it read
// before (구 …법, "(… 개정되기 전의 것)") carries what its note says (data-old) and whose text cites it (by: 'judgment',
// 'decision'), so the article opened from it — today's — says so (oldBand)
// vers: what the version notes elsewhere in the same decision or judgment say of each law (versOf), for "구 …법 제N조" here
export function linkCases(text, by = '', vers = null) {
  if (!text) return '';
  const t = corners(text);
  const refs = [
    ...scanCases(t).map((c) => ({ ...c, attr: `data-case="${esc(c.no)}"` })),
    ...scanCourtCases(t).map((c) => ({ ...c, attr: `data-court="${esc(c.ref)}"` })),
    ...scanArticles(t, vers && vers.length ? { vers } : null).map((a) => ({ ...a, attr: `data-art="${esc(`${a.law} ${artLabel(a)}${a.para ? ` 제${a.para}항` : ''}`)}"${a.old ? ` data-old="${esc(a.old)}"${by ? ` data-by="${by}"` : ''}` : ''}` })),
  ].sort((a, b) => a.i - b.i);
  let out = '', last = 0;
  for (const r of refs) {
    if (r.i < last) continue;   // overlapping finds: the first wins
    // (an old constitution's article — 1972년 헌법 제40조, 유신헌법 제53조 — is no link: today's 헌법 is not it. Said so beside it)
    if (r.oldcon) { out += esc(text.slice(last, r.i)) + `<span class="case-oldc" title="${esc(r.oldcon)} · 현행 헌법 조문이 아닙니다">${esc(text.slice(r.i, r.i + r.len))}<small class="case-tag">옛 헌법</small></span>`; last = r.i + r.len; continue; }
    // (a note between the law's name and 제N조 — "(2011. 3. 31. … 개정되기 전의 것, 이하 ‘구 민간투자법’이라 한다)" — is read as
    // the text around it, the name and the article each a link: one button that long would stand as a block of its own)
    const s = text.slice(r.i, r.i + r.len), o = r.attr.startsWith('data-art') ? s.indexOf('(') : -1, c = s.lastIndexOf(')');
    const btn = (x) => `<span class="case-ln" role="button" tabindex="0" ${r.attr}>${esc(x)}</span>`;
    const split = o > 0 && c > o && /제\s*\d/.test(s.slice(c)), lead = split ? /^\s*/.exec(s.slice(c + 1))[0] : '';
    out += esc(text.slice(last, r.i)) + (split ? btn(s.slice(0, o)) + esc(s.slice(o, c + 1) + lead) + btn(s.slice(c + 1 + lead.length)) : btn(s));
    last = r.i + r.len;
  }
  return out + esc(text.slice(last));
}
// (a link in running text is a span, not a <button>: a button is one box that cannot break across lines, so on a phone a long
// citation stood as a block of its own in the middle of the 주문. As a button, it is reached by Tab and opened by Enter or Space)
if (typeof document !== 'undefined') document.addEventListener('keydown', (e) => {
  const t = e.target;
  if ((e.key === 'Enter' || e.key === ' ') && t && t.matches && t.matches('span.case-ln[role="button"]')) { e.preventDefault(); if (!e.repeat) t.click(); }   // (a key held down opens it once)
});
// what the version notes of a decision's or judgment's short parts say of each law ([law, '2011. 3. 31. 개정 전'] …): the
// 판시사항's "구 민간투자법 제4조" is the text the 판결요지 or the 참조조문 dates "(2011. 3. 31. … 개정되기 전의 것)"
const versOf = (d) => articleScope([d.points, d.summary, d.laws, d.order].filter(Boolean).join('\n')).vers || [];
// a court's judgment as a card, like a decision's: 판시사항 and 판결요지 open, the rest folded
export function judgmentView(d) {
  const vs = versOf(d);
  const sec = (h, body) => (body ? `<section class="cs-sec"><h4>${h}</h4><p>${body}</p></section>` : '');
  const fold = (h, part, n) => (d[part] ? `<details class="cs-fold" data-part="${part}"><summary>${h}${n ? `<span>${n}</span>` : ''}</summary><p></p></details>` : '');
  // (전원합의체 said where the kind is, and marked: the whole court's judgment is cited as one — laws.courtCite)
  // (a judgment with neither 판시사항 nor 판결요지 — most of the lower courts' — shows its 주문, read from the full text under
  // 【주문】 or 【주 문】; the full text then stays folded)
  const order = !d.points && !d.summary ? partOf(d.reason, '주문') : '';
  return `<div class="cs-name">${esc(d.name || d.no)}</div>`
    + `<div class="cs-meta">${d.enbanc ? '<b class="cs-res cs-eb">전원합의체</b> · ' : ''}${[d.courtName, d.date && d.date + (d.kind === '결정' ? '자' : ' 선고'), d.kind].filter(Boolean).map(esc).join(' · ')}</div>`
    + sec('판시사항', linkCases(joinPoints(dropHead(d.points, '판시사항')), 'judgment', vs))
    + sec(d.kind === '결정' ? '결정요지' : '판결요지', linkCases(unwrap(dropHead(d.summary, '판결요지', '결정요지')), 'judgment', vs))
    + sec('주문', linkCases(order, 'judgment', vs))
    + (!d.points && !d.summary && !d.reason ? '<p class="cs-wait">공개된 판결문에 아직 내용이 실리지 않았습니다.</p>' : '')
    + fold('참조판례', 'cites', lines(d.cites))
    + fold('참조조문', 'laws')
    + fold('전문', 'reason').replace('<details', !d.points && !d.summary && !order ? '<details open' : '<details')   // the whole text, when that is all there is
    + (d.url ? `<p class="cs-out"><a class="btn ghost small" href="${esc(d.url)}" target="_blank" rel="noopener">국가법령정보센터에서 보기</a></p>` : '');
}
const lines = (s) => String(s || '').split('\n').filter((l) => l.trim()).length;
/* ---------------- 과잉금지 심사기준: where the decision weighs each step ----------------
   A decision that reviews a restriction by the 과잉금지원칙 weighs it step by step — 목적의 정당성, 수단의 적합성, 침해의
   최소성, 법익의 균형성 — under headings of its 이유 ('(가) 목적의 정당성 및 수단의 적합성') or in sentences of its
   결정요지. Found, each is a chip ('심사기준: 목적 · 수단 · 최소성 · 균형성') that opens the reasons there and marks the
   paragraph; a dissent that weighs them on its own has its own row. Fewer than two found: no bar (a decision that only
   names the principle is not one that applies it). */
const STEPS = [
  ['purpose', '목적', /(?:입법\s*)?목적의\s*정당성/],
  ['means', '수단', /(?:수단|방법)의\s*(?:적합성|적절성|적정성)/],
  ['least', '최소성', /(?:침해|피해)의\s*최소성/],
  ['balance', '균형성', /법익(?:의)?\s*균형(?:성)?/],
];
// the opinions of a decision's reasons: the court's, then each that the reasons head as a judge's own (반대의견, 별개의견 …)
const OPINION = /^\s*(?:\d{1,2}\s*\.\s*|[가-하]\s*\.\s*|\(\s*\d{1,2}\s*\)\s*)?(?:재판관\s+[^\n]{1,80}?의\s*)?((?:일부\s*)?반대\s*의견|별개\s*의견|보충\s*의견|(?:단순\s*)?위헌\s*의견|합헌\s*의견|헌법불합치\s*의견|한정위헌\s*의견|각하\s*의견|인용\s*의견|기각\s*의견)\s*$/;
const isHead = (l) => l.trim().length <= 60 && !/(?:다|함|음)\s*\.\s*$/.test(l.trim());
function testOf(lines) {
  const parts = [{ label: '', from: 0, to: lines.length }];
  lines.forEach((l, i) => { const m = l.trim().length <= 120 && OPINION.exec(l); if (m && i > 0) { parts[parts.length - 1].to = i; parts.push({ label: m[1].replace(/\s+/g, ''), from: i, to: lines.length }); } });
  return parts.map((pt) => {
    const hits = {};
    for (const [k, , re] of STEPS) {
      let head = -1, said = -1;
      for (let i = pt.from; i < pt.to && head < 0; i++) {
        const l = lines[i];
        if (!re.test(l)) continue;
        const n = STEPS.filter((x) => x[2].test(l)).length;   // (a line naming three or four steps defines the test: not where one is weighed)
        if (n >= 3) continue;
        if (isHead(l)) head = i; else if (said < 0) said = i;
      }
      const at = head >= 0 ? head : said;
      if (at >= 0) hits[k] = at;
    }
    return { label: pt.label, hits, n: Object.keys(hits).length };
  });
}
// the bar: the court's opinion first (the reasons, else the 결정요지), then a dissent's own; '' when not two steps anywhere
function testBar(d) {
  const rows = [];
  const reasonLines = d.reason ? unwrap(d.reason).split('\n') : [], sumLines = d.summary ? unwrap(dropHead(d.summary, '결정요지')).split('\n') : [];
  const fromReason = testOf(reasonLines), court = fromReason[0];
  const sum = testOf(sumLines)[0];
  const main = court && court.n >= 2 ? { ...court, src: 'reason' } : sum && sum.n >= 2 ? { ...sum, src: 'summary' } : null;
  if (main) rows.push({ ...main, label: '' });
  for (const o of fromReason.slice(1)) if (o.n >= 2) rows.push({ ...o, src: 'reason' });
  if (!rows.length) return '';
  const chip = (r, k, t) => (r.hits[k] != null ? `<button type="button" class="cs-tchip" data-test-go="${r.src}:${r.hits[k]}">${t}</button>` : '');
  return `<nav class="cs-test" aria-label="과잉금지 심사기준">${rows.map((r, i) => `<div class="cs-test-row"><span class="cs-test-h">${i === 0 && !r.label ? '심사기준' : esc(r.label || '심사기준')}</span>${STEPS.map(([k, t]) => chip(r, k, t)).join('')}</div>`).join('')}</nav>`;
}
// a text shown a paragraph a span (data-para: its line), so a chip can open it there: the links put in first, over the whole
// text (a law named once is the one '같은 법' means later), and the lines cut after — a link is never cut in two
function paras(html) {
  const segs = String(html).split('\n'), out = [];
  let buf = null, depth = 0, line = 0, start = 0;
  for (const seg of segs) {
    buf = buf == null ? seg : buf + '\n' + seg;
    depth += (seg.match(/<span\b/g) || []).length - (seg.match(/<\/span>/g) || []).length;
    if (depth <= 0) { out.push(buf.trim() ? `<span class="cs-para" data-para="${start}">${buf}</span>` : buf); buf = null; depth = 0; start = line + 1; }
    line++;
  }
  if (buf != null) out.push(buf);
  return out.join('\n');
}
let testCss = false;
function testStyle() {   // (the bar's own look, at no weight: app.css may restyle it)
  if (testCss || typeof document === 'undefined') return;
  testCss = true;
  const st = document.createElement('style');
  // (one class deep: above the app's plain 'button' rule. Wherever a decision is shown — the sheet's .cs-body, the reader's
  // note pop .note-t —, so not under .cs-body: in the reader the bar lay unstyled and the paragraph a chip opened went unmarked)
  st.textContent = `:where(html) .cs-test{display:flex;flex-direction:column;gap:6px;margin:18px 0 4px}
:where(.cs-test) .cs-test-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
:where(.cs-test) .cs-test-h{font-size:12.5px;font-weight:600;color:var(--muted);min-width:4.2em}
:where(.cs-test) .cs-tchip{display:inline-flex;align-items:center;height:32px;padding:0 13px;border:0;border-radius:16px;background:var(--card);box-shadow:inset 0 0 0 1px var(--rule);font:inherit;font-size:13px;font-weight:600;line-height:1;color:var(--ink-2);cursor:pointer}
:where(.cs-test) .cs-tchip[aria-current="true"]{box-shadow:inset 0 0 0 1.5px var(--accent);color:var(--accent)}
:where(html) .cs-para.cs-hit{background:rgba(224,178,58,.34);background:color-mix(in srgb,var(--gold,#E0B23A) 34%,transparent);border-radius:3px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
@media (pointer:coarse){:where(.cs-test) .cs-tchip{height:44px;padding:0 16px}}
@media (hover:hover){:where(.cs-test) .cs-tchip:hover{box-shadow:inset 0 0 0 1px var(--muted)}}`;
  document.head.appendChild(st);
}

// the decision as a card: what it is, 주문, 판시사항, 결정요지; the references and the full reasons fold out when wanted.
// Nothing comes in later above what is read: its 판례집 place has its spot in the line from the start ('판례집 확인 중', then
// the place or '판례집 표기 없음'); a missing 결정요지 is said where it would be; what is learnt late goes at the end
export function caseView(d) {
  const vs = versOf(d);
  const meta = [d.date && d.date + ' 선고', d.court].filter(Boolean).map(esc).concat(!d.pending ? [`<span class="cs-book">${bookHtml(d)}</span>`] : []);
  const sec = (h, body, cls = '') => (body ? `<section class="cs-sec${cls}"><h4>${h}</h4><p>${body}</p></section>` : '');
  const fold = (h, part, n) => (d[part] ? `<details class="cs-fold" data-part="${part}"><summary>${h}${n ? `<span>${n}</span>` : ''}</summary><p></p></details>` : '');
  const short = !d.points && !d.summary && d.reason && d.reason.length <= 1500;   // a short decision (각하 and the like): its reasons in full
  const bar = d.pending ? '' : testBar(d);
  if (bar) testStyle();
  const noSum = !d.pending && !d.summary && !short && !!(d.order || d.reason);
  return (d.asked && d.asked !== d.no ? `<p class="cs-wait">${esc(d.asked)} — 이 사건에 병합되어 함께 결정되었습니다.</p>` : '')
    + (d.filed ? `<p class="cs-wait">판례정보에는 함께 결정된 ${esc(d.filed)} 사건번호로 실려 있습니다.</p>` : '')
    + `<div class="cs-name">${esc(d.name || d.no)}</div>`
    + `<div class="cs-meta">${d.result ? `<b class="cs-res">${esc(d.result)}</b>` : ''}${meta.length ? (d.result ? ' · ' : '') + meta.join(' · ') : ''}</div>`
    + sec('주문', linkCases(dropHead(d.order, '주문'), 'decision', vs))   // (a decision kept here before its heading was dropped: dropped here too)
    + sec('판시사항', linkCases(joinPoints(dropHead(d.points, '판시사항')), 'decision', vs))
    + sec('결정요지', paras(linkCases(unwrap(dropHead(d.summary, '결정요지')), 'decision', vs)), ' cs-sum')
    + (noSum ? `<p class="cs-wait cs-nosum">이 결정의 결정요지는 공개 자료에 없습니다${d.reason ? ' · 아래 이유 전문에서 볼 수 있습니다' : ''}.</p>` : '')
    + bar
    + (short ? sec('이유', paras(linkCases(unwrap(d.reason), 'decision', vs)), ' cs-reason') : '')
    + (d.pending ? '<p class="cs-wait">결정문을 불러오는 중…</p>' : !d.order && !d.summary && !d.reason ? '<p class="cs-wait">판례정보에 아직 결정문이 실리지 않았습니다.</p>' : '')
    + fold('참조판례', 'cites', lines(d.cites))
    + fold('참조조문', 'laws')
    + (short ? '' : fold('이유 전문', 'reason'))
    + (d.pending ? '' : '<section class="cs-sec cs-holds" hidden></section><section class="cs-sec cs-citeas" hidden></section>')   // (the digest's holdings and the two forms to cite it by: wireCase)
    + outLinks(d.no);
}
// the digest's holdings of a decision whose 결정요지 the court's data lacks (opts.holdings: the screen opens data-holding)
const holdsHtml = (d) => `<h4>판례요지집의 이 결정 요지 ${d.holds.length}건</h4><div class="cs-rels">${d.holds.map((x) => `<button type="button" class="cs-rel" data-holding="${esc(x.seq)}" data-title="${esc(x.title)}" data-q="${esc(d.no)}"><b>${esc(x.title)}</b><span>${esc(x.path)}</span></button>`).join('')}</div>`;
// fill a fold the first time it opens (the full reasons of a long decision run to tens of thousands of letters). A decision
// (opts given): its 판례집 book is read (book) — or, when its record has none, how the digest cites it (pjFill) — then
// shown with the two forms to cite it by, each copied with opts.copy(text, note) (the note says when no 판례집 page goes
// with it), and opts.onBook(d) told; hint: the line it was opened from (its 주요판례 card). opts.holdings: the digest's
// holdings of a decision without 결정요지 are listed (data-holding). The 심사기준 chips open the reasons where each step is
export function wireCase(box, d, opts) {
  // (a box is wired again when what it shows is drawn again — the preview, then the decision: only the last one answers)
  const wired = (box.__csWire = (box.__csWire || 0) + 1);
  const mine = () => box.__csWire === wired;
  if (opts && d && !d.pending) {
    const shown = () => {
      if (!box.isConnected || !mine()) return;   // (a late answer for what the box showed before: not drawn into what it shows now)
      const b = box.querySelector('.cs-book'); if (b) b.innerHTML = bookHtml(d);
      const c = box.querySelector('.cs-citeas'); if (c) { c.innerHTML = citeAsHtml(d); c.hidden = false; }
      const h = box.querySelector('.cs-holds');
      if (h && opts.holdings && !d.summary && (d.holds || []).length && h.hidden) { h.innerHTML = holdsHtml(d); h.hidden = false; }
      if (opts.onBook) opts.onBook(d);
    };
    if (d.src === '판례집' && (!d.book || d.book.later)) book(d, opts.hint).then(shown, shown);
    else if (pjPending(d) || ((d.pjAt || 0) < Date.now() - PJ_AGAIN && !where(d) && pjDue(d))) {
      // (the cite waits for the digest a moment — so it is not shown without its book and then with it — then shows anyway)
      let done = false;
      const once = () => { if (!done) { done = true; shown(); } };
      const t = setTimeout(once, 3500);
      pjFill(d).then((got) => { clearTimeout(t); if (done) { if (got) shown(); } else once(); }, () => { clearTimeout(t); once(); });
    } else shown();
    box.addEventListener('click', (e) => {
      const c = e.target.closest('[data-cite-copy]');
      if (c && opts.copy && mine()) opts.copy(c.dataset.citeCopy === 'short' ? cite(d) : citeFull(d), c.dataset.citeCopy === 'short' ? '' : citeNote(d));
    });
  }
  const fill = (x) => {
    const p = x.querySelector('p');
    if (!x.open || p.dataset.done) return;
    p.dataset.done = '1';
    const t = d[x.dataset.part] || '';
    const html = linkCases(x.dataset.part === 'reason' ? unwrap(t) : t, d.court === true ? 'judgment' : 'decision', versOf(d));
    p.innerHTML = x.dataset.part === 'reason' ? paras(html) : html;
  };
  box.querySelectorAll('details.cs-fold').forEach((x) => { x.addEventListener('toggle', () => fill(x)); fill(x); });
  // a step of the test: the reasons opened (filled) there, scrolled to within the box's own scroller, the paragraph marked
  box.addEventListener('click', (e) => {
    const g = e.target.closest('[data-test-go]');
    if (!g || !box.contains(g) || !mine()) return;
    const [src, at] = g.dataset.testGo.split(':');
    let host = src === 'summary' ? box.querySelector('.cs-sum') : box.querySelector('.cs-reason') || box.querySelector('details.cs-fold[data-part="reason"]');
    if (!host) return;
    if (host.tagName === 'DETAILS' && !host.open) { host.open = true; fill(host); }
    const el = host.querySelector(`.cs-para[data-para="${at}"]`) || host.querySelector(`.cs-para[data-para]`);
    if (!el) return;
    box.querySelectorAll('.cs-para.cs-hit').forEach((x) => x.classList.remove('cs-hit'));
    box.querySelectorAll('.cs-tchip[aria-current]').forEach((x) => x.removeAttribute('aria-current'));
    el.classList.add('cs-hit'); g.setAttribute('aria-current', 'true');
    let sc = el.parentElement;
    while (sc && sc !== document.body && !(sc.scrollHeight > sc.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (sc && sc !== document.body) {
      const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 20;
      sc.scrollTo({ top: Math.max(0, top), behavior: calm ? 'auto' : 'smooth' });
    } else el.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
  });
}
// the line above an article opened from a citation of its old text (linkCases' data-old): the text below is today's.
// old: what the version note said ('2011. 3. 31. 개정 전', '2016. 1. 6. 개정된 것') or '구'; by: whose text cited it
// gone: today's law has no article of that number (a 구법 article since deleted or renumbered) — said so instead of '아래는 현행
// 조문', so the citation is not taken for a wrong one
export function oldBand(old, by, gone = false) {
  const who = by === 'judgment' ? '판결이 적용한' : by === 'decision' ? '결정이 다룬' : '본문이 인용한';
  const o = String(old || '').trim(), now = gone ? '현행 법령에는 그 번호의 조문이 없습니다(삭제되었거나 번호가 바뀌었습니다)' : '아래는 현행 조문';
  // (a law cited by its old name — "공직선거및선거부정방지법: 2005. 8. 4. 이름 변경 전", laws.scan — is said renamed)
  const nm = /^([^:]+?):\s*(.*)$/.exec(o), ol = nm && oldLaw(nm[1]);
  if (ol && ol.now) {
    const rest = nm[2].replace(new RegExp(`^${ol.date.replace(/\./g, '\\.')}\\s*(?:이름 변경|전부개정) 전$`), '');
    const fin = (ol.now.charCodeAt(ol.now.length - 1) - 0xac00) % 28;   // (받침: 이/가, 으로/로)
    const how = ol.whole ? `${ol.date} 전부개정되어 ${ol.now}${fin ? '이' : '가'} 되었습니다(조문 번호가 다를 수 있습니다)` : `${ol.date} ${ol.now}${fin && fin !== 8 ? '으로' : '로'} 이름이 바뀌었습니다`;
    return `${who} 것은 구 ${ol.name}${rest && rest !== '구' ? `(${rest})` : ''} 조문입니다 · ${how} · ${now}`;
  }
  if (/개정된 것$|제정된 것$/.test(o)) return `${who} 것은 ${o.replace(/\s*것$/, '')} 조문입니다 · ${now}`;
  return `${who} 것은 ${o && o !== '구' ? `(${o}) ` : ''}구법 조문입니다 · ${now}`;
}
