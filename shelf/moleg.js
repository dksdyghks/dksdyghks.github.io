// 법제처 국가법령정보 공유서비스 (공공데이터포털 1170000/law, through the shelf's server, which holds the key): the lists of
// 법령해석례 (expc), 행정규칙 (admrul), 자치법규 (ordin) and 법령용어 (lstrm) by their names' words. The service gives lists
// only — its lawService.do (the text itself) does not exist there — so each row links to its own public page at
// 국가법령정보센터 (www.law.go.kr/LSW/…InfoP.do by the row's serial number, as the site itself links them), never to the DRF
// links in the answer, which carry another party's OC. Answers are kept for this session.
import * as api from './api.js?v=8af7a0a5d7';

const fail = (code) => Object.assign(new Error(code), { code });
const LSW = 'https://www.law.go.kr/LSW/';
const num = (s) => (/^\d{1,20}$/.test(String(s || '').trim()) ? String(s).trim() : '');
// each row's page at 국가법령정보센터 (the serial number the list gives; a name alone gets the site's search)
export const page = {
  expc: (seq) => `${LSW}expcInfoP.do?expcSeq=${encodeURIComponent(seq)}`,
  admrul: (seq) => `${LSW}admRulInfoP.do?admRulSeq=${encodeURIComponent(seq)}`,
  ordin: (seq) => `${LSW}ordinInfoP.do?ordinSeq=${encodeURIComponent(seq)}`,
  lstrm: (id) => `${LSW}lsTrmInfoR.do?trmSeqs=${encodeURIComponent(id)}`,
  search: (q) => `https://www.law.go.kr/lsSc.do?query=${encodeURIComponent(String(q || '').trim())}`,
};
// 20050930 · 2005.09.30 · 2005-09-30 → 2005. 9. 30.
export function dateText(s) {
  const m = /^(\d{4})[.\-]?(\d{2})[.\-]?(\d{2})$/.exec(String(s || '').trim());
  return m && m[1] !== '9999' ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.` : '';
}
const ROW = { expc: 'expc', admrul: 'admrul', ordin: 'law', lstrm: 'lstrm', licbyl: 'licbyl' };   // each list's row element
const found = new Map();
async function list(target, query, page, size) {
  const q = String(query || '').trim();
  if (!q) return { total: 0, rows: [] };
  const key = [target, q, page, size].join('|');
  if (found.has(key)) return found.get(key);
  let xml;
  try { xml = await api.publicDataText('1170000/law/lawSearchList.do', { target, query: q, numOfRows: String(size), pageNo: String(page) }); }
  // (a server without the key answers 503 no_key — its only 503 on this route; the raw answer does not carry the word)
  catch (e) { throw fail(api.isOffline(e) ? 'offline' : e && (e.code === 'no_key' || e.status === 503) ? 'no_key' : 'unavailable'); }
  const doc = new DOMParser().parseFromString(String(xml || ''), 'text/xml');
  const root = doc.documentElement;
  const code = root && root.querySelector(':scope > resultCode');
  if (!root || root.querySelector('parsererror') || !code || !/^0+$/.test(code.textContent.trim())) throw fail('unavailable');
  const f = (el, name) => ((el.getElementsByTagName(name)[0] || {}).textContent || '').trim();
  const rows = [...root.children].filter((x) => x.tagName === ROW[target]).map((el) => (name) => f(el, name));
  const out = { total: Number(f(root, 'totalCnt')) || 0, rows };
  found.set(key, out);
  return out;
}
// 법령해석례: 안건명, 안건번호, 질의기관, 회신일자 (회신기관 is 법제처 itself, save the few another body answered); got: the
// rows the page held
const day = (s) => { const m = /^(\d{4})[.\-]?(\d{2})[.\-]?(\d{2})$/.exec(String(s || '').trim()); return m ? m[1] + m[2] + m[3] : ''; };
export async function interps(q, pg = 1, size = 10) {
  const r = await list('expc', q, pg, size);
  return { total: r.total, got: r.rows.length, rows: sameAsked(r.rows.map((g) => ({ seq: num(g('법령해석례일련번호')), title: g('안건명'), no: g('안건번호'), asker: g('질의기관명'), by: g('회신기관명'), date: dateText(g('회신일자')), d: day(g('회신일자')) })).filter((x) => x.title)) };
}
// one question answered under two numbers (법제처 files a question asked by two bodies, or asked again, once for each:
// the same 안건명, other 안건번호): one row, its numbers together (no: '19-0123 · 19-0124', nos: each, seqs: each, the newest
// answer's first, which the row opens)
function sameAsked(rows) {
  const by = new Map(), out = [];
  for (const x of rows) {
    // (and answered the same day: a question asked again later, or another asked under the same 안건명, is its own answer —
    // its own row, so each answer can still be opened)
    const k = tightName(x.title).replace(/[^가-힣A-Za-z0-9]/g, '') + '|' + (x.d || '');
    const y = by.get(k), nos = x.nos || (x.no ? [x.no] : []), seqs = x.seqs || (x.seq ? [x.seq] : []);
    if (!y) { const z = { ...x, nos: [...nos], seqs: [...seqs] }; by.set(k, z); out.push(z); continue; }
    for (const n of nos) if (!y.nos.includes(n)) y.nos.push(n);
    for (const q of seqs) if (!y.seqs.includes(q)) y.seqs.push(q);
    if (x.asker && y.asker && !y.asker.split(' · ').includes(x.asker)) y.asker += ' · ' + x.asker;
    if (x.d > y.d) { y.d = x.d; y.date = x.date; y.seq = x.seq || y.seq; y.by = x.by || y.by; }
  }
  for (const z of out) if (z.nos.length > 1) z.no = z.nos.join(' · ');
  return out;
}
/* 행정규칙 and 자치법규 in the order a reader looks for them. The service lists them by name (가나다), so '처분' opened on the
   1950–60s 등기예규 of 가등기가처분, long out of force, and '서울특별시 도시계획 조례' on the 자치구' 조례 before the city's own.
   They are read a hundred at a time (one ask; the service gives no other order) and put in this order within each hundred:
   the one whose name is what was asked (spaces aside) first, then those in force, newest first, then the old ones
   (현행연혁구분 연혁, or 폐지) — each marked past: true, and the page says from where (pastFrom) and how many (past), so a
   screen can fold them under '지난 규칙 n건'. Shown ten to a page as before. */
const WIN = 100;
const tightName = (s) => String(s || '').replace(/[\s·ㆍ「」]/g, '');
async function ordered(target, q, pg, size, rowOf, isPast) {
  const from = (pg - 1) * size, w = Math.floor(from / WIN) + 1;
  const r = await list(target, q, w, WIN);
  const want = tightName(q);
  const rows = r.rows.map(rowOf).filter((x) => x.name);
  const rank = (x) => (tightName(x.name) === want ? 0 : isPast(x) ? 2 : 1);
  const sorted = rows.map((x, i) => [x, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || String(b[0].d).localeCompare(String(a[0].d)) || a[1] - b[1]).map(([x]) => ({ ...x, ...(isPast(x) ? { past: true } : {}) }));
  const at = from - (w - 1) * WIN, page = sorted.slice(at, at + size);
  const pastAll = sorted.filter((x) => x.past).length, first = page.findIndex((x) => x.past);
  // got: the rows the service gave for the whole hundred (a short hundred: no more after it)
  return { total: r.total, rows: page, past: pastAll, pastFrom: first, got: r.rows.length };
}
// 행정규칙: 이름, 종류, 발령일·번호, 소관부처, 현행/연혁
export async function rules(q, pg = 1, size = 10) {
  return ordered('admrul', q, pg, size, (g) => ({ seq: num(g('행정규칙일련번호')), name: g('행정규칙명'), kind: g('행정규칙종류'), date: dateText(g('발령일자')), d: day(g('발령일자')), no: g('발령번호'), dept: g('소관부처명'), now: g('현행연혁구분') }),
    (x) => /연혁|폐지/.test(x.now || ''));
}
// 자치법규: 이름, 지자체, 종류, 공포일 (폐지 by its 제개정구분)
export async function ordins(q, pg = 1, size = 10) {
  return ordered('ordin', q, pg, size, (g) => ({ seq: num(g('자치법규일련번호')), name: g('자치법규명'), org: g('지자체기관명'), kind: g('자치법규종류'), date: dateText(g('공포일자')), d: day(g('공포일자')), how: g('제개정구분명') }),
    (x) => /폐지/.test(x.how || ''));
}
/* 별표·서식 by their titles (licbyl: the service finds them by the 별표's own name, not by its law's — '행정처분 기준' gives
   373 across the laws, each law's 행정처분기준 a row): the 별표 of every law whose title holds the words, the newest first
   as the service gives them, each with its law and its 원문 at 국가법령정보센터 (PDF, HWP). A 별표 of a law found by number is
   laws.byl's (the mirror lists each law's own). → { total, rows: [{ seq, title, law, n ('23', '5의2'), kind (별표 | 서식),
   date, links: [{ kind: 'pdf' | 'hwp', url }] }] } */
const LGK = 'https://www.law.go.kr';
const flLink = (s) => { const t = String(s || '').trim(); return /^\/LSW\/flDownload\.do\?flSeq=\d+$/.test(t) ? LGK + t : ''; };
const plainTitle = (s) => String(s || '').replace(/<[^<>]*>/g, '').replace(/\s+/g, ' ').trim();
export async function byls(q, pg = 1, size = 10) {
  const r = await list('licbyl', q, pg, size);
  return { total: r.total, rows: r.rows.map((g) => {
    const no = String(g('별표번호') || ''), n = Number(no.slice(0, 4)) || 0, sub = Number(no.slice(4, 6)) || 0;
    const links = [flLink(g('별표서식PDF파일링크')) ? { kind: 'pdf', url: flLink(g('별표서식PDF파일링크')) } : null, flLink(g('별표서식파일링크')) ? { kind: 'hwp', url: flLink(g('별표서식파일링크')) } : null].filter(Boolean);
    return { seq: num(g('별표일련번호')), title: plainTitle(g('별표명')), law: plainTitle(g('관련법령명')), n: n ? `${n}${sub ? '의' + sub : ''}` : '', kind: g('별표종류') || '별표', date: dateText(g('공포일자')), links };
  }).filter((x) => x.title) };
}
// one law's 별표 by its number, when its title is known (a judgment's "[별표 15] 행정처분기준"): the list by that title, the
// row of that law and number — null when none
export async function byl(law, n, title) {
  const full = plainTitle(title), bare = full.replace(/\(제?\d+조[^)]*관련\)\s*$/, '').trim();
  if (!full || !law) return null;
  const want = tightName(law), no = String(n).replace(/\s+/g, '');
  for (const t of full === bare ? [full] : [full, bare]) {   // (its whole title first — "(제89조 관련)" narrows it to a few)
    const r = await byls(t, 1, 50);
    const hit = r.rows.find((x) => tightName(x.law) === want && String(x.n) === no);
    if (hit) return hit;
  }
  return null;
}
// 법령용어: the terms the dictionary has under the words asked — only those that are the words themselves (a term is
// written '선거운동' or '공공기관(정보공개법)': its name before the brackets), so a near miss says nothing
const bare = (s) => String(s || '').replace(/\([^()]*\)\s*$/, '').replace(/[\s·ㆍ]/g, '');
export async function terms(q, max = 3) {
  const want = bare(q);
  if (want.length < 2) return [];
  const r = await list('lstrm', q, 1, 20);
  // (a term the dictionary keeps in two of its books has two ids, '15368,5503254': 국가법령정보센터 takes them as they are)
  const ids = (s) => { const t = String(s || '').replace(/\s+/g, ''); return /^\d{1,20}(,\d{1,20})*$/.test(t) ? t : ''; };
  return r.rows.map((g) => ({ id: ids(g('법령용어ID')), name: g('법령용어명') })).filter((x) => x.id && x.name && bare(x.name) === want).slice(0, max);
}
/* the interpretations of one article: those whose 안건명 cites it. A title cites articles of several laws ("「공직선거법」
   제60조제2항 및 「지방자치법」 제22조 등 관련"): each 제N조 belongs to the law named last before it, so 공직선거법 제22조 is
   not this one. A title that names no law before its 제N조 is read as this law's when it names this law at all. */
const tight = (s) => String(s || '').replace(/[\s「」『』]/g, '').replace(/·/g, 'ㆍ');
export function citesArticle(title, law, art, sub = 0, also = []) {
  const t = String(title || '').replace(/[『』]/g, (c) => (c === '『' ? '「' : '」')).replace(/\s+/g, ' ');
  const names = [law, ...also].map(tight).filter(Boolean);
  // (the law itself, or its old text: 구 공직선거법 — not another law whose name ends the same, 군형법 for 형법)
  const mine = (n) => { const x = tight(n); return names.some((m) => x === m || x === '구' + m); };
  if (!names.some((m) => tight(t).includes(m))) return false;
  // the laws named in the title, where each ends: 「…」, or a name glued to its 제N조 (공직선거법제112조)
  const marks = [];
  for (const m of t.matchAll(/「([^」]{2,80})」/g)) marks.push({ end: m.index + m[0].length, name: m[1] });
  for (const m of t.matchAll(/([가-힣ㆍ·]{2,40}(?:법률|법|령|규칙|규정))\s*(?=제\s*\d)/g)) if (!marks.some((x) => m.index < x.end && m.index >= x.end - m[0].length - 2)) marks.push({ end: m.index + m[1].length, name: m[1] });
  marks.sort((a, b) => a.end - b.end);
  const ref = new RegExp(`(?<![\\d조])제\\s*${art}\\s*조${sub ? `\\s*의\\s*${sub}(?!\\d)` : '(?!\\s*의\\s*\\d)'}`, 'g');
  for (const m of t.matchAll(ref)) {
    const before = marks.filter((x) => x.end <= m.index).pop();
    if (before ? mine(before.name) : true) return true;
  }
  return false;
}
// the interpretations of 법 제N조: 법제처's list by the law's name, read up to three pages of a hundred, those citing it,
// the latest answer first. read: how many of the list were read (a page shorter than asked ends it: the service gave no more)
export async function articleInterps(law, art, sub = 0, also = []) {
  const out = [];
  let total = 0, read = 0;
  for (let pg = 1; pg <= 3; pg++) {
    const r = await interps(law, pg, 100);
    total = r.total; read += r.got;
    for (const x of r.rows) if (citesArticle(x.title, law, art, sub, also)) out.push(x);
    if (read >= total || r.got < 100) break;
  }
  // (rows of one question across the pages read are one too)
  const rows = sameAsked(out);
  rows.sort((a, b) => b.d.localeCompare(a.d));
  return { total: rows.length, rows, read: Math.min(read, total), of: total };
}
