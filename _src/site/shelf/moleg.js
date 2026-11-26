// 법제처 국가법령정보 공유서비스 (공공데이터포털 1170000/law, through the shelf's server, which holds the key): the lists of
// 법령해석례 (expc), 행정규칙 (admrul), 자치법규 (ordin) and 법령용어 (lstrm) by their names' words. The service gives lists
// only — its lawService.do (the text itself) does not exist there — so each row links to its own public page at
// 국가법령정보센터 (www.law.go.kr/LSW/…InfoP.do by the row's serial number, as the site itself links them), never to the DRF
// links in the answer, which carry another party's OC. Answers are kept for this session.
import * as api from './api.js';

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
const ROW = { expc: 'expc', admrul: 'admrul', ordin: 'law', lstrm: 'lstrm' };   // each list's row element
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
  return { total: r.total, got: r.rows.length, rows: r.rows.map((g) => ({ seq: num(g('법령해석례일련번호')), title: g('안건명'), no: g('안건번호'), asker: g('질의기관명'), by: g('회신기관명'), date: dateText(g('회신일자')), d: day(g('회신일자')) })).filter((x) => x.title) };
}
// 행정규칙: 이름, 종류, 발령일·번호, 소관부처, 현행/연혁
export async function rules(q, pg = 1, size = 10) {
  const r = await list('admrul', q, pg, size);
  return { total: r.total, rows: r.rows.map((g) => ({ seq: num(g('행정규칙일련번호')), name: g('행정규칙명'), kind: g('행정규칙종류'), date: dateText(g('발령일자')), no: g('발령번호'), dept: g('소관부처명'), now: g('현행연혁구분') })).filter((x) => x.name) };
}
// 자치법규: 이름, 지자체, 종류, 공포일
export async function ordins(q, pg = 1, size = 10) {
  const r = await list('ordin', q, pg, size);
  return { total: r.total, rows: r.rows.map((g) => ({ seq: num(g('자치법규일련번호')), name: g('자치법규명'), org: g('지자체기관명'), kind: g('자치법규종류'), date: dateText(g('공포일자')), how: g('제개정구분명') })).filter((x) => x.name) };
}
// 법령용어: the terms the dictionary has under the words asked — only those that are the words themselves (a term is
// written '선거운동' or '공공기관(정보공개법)': its name before the brackets), so a near miss says nothing
const bare = (s) => String(s || '').replace(/\([^()]*\)\s*$/, '').replace(/[\s·ㆍ]/g, '');
export async function terms(q, max = 3) {
  const want = bare(q);
  if (want.length < 2) return [];
  const r = await list('lstrm', q, 1, 20);
  return r.rows.map((g) => ({ id: num(g('법령용어ID')), name: g('법령용어명') })).filter((x) => x.id && x.name && bare(x.name) === want).slice(0, max);
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
  out.sort((a, b) => b.d.localeCompare(a.d));
  return { total: out.length, rows: out, read: Math.min(read, total), of: total };
}
