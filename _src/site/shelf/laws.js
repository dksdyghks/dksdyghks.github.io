// 조문과 판결: 헌법 and 헌법재판소법 in full (from 헌법재판소 법령정보, 공공데이터포털), every other law and the courts'
// judgments (from 국가법령정보 OPEN API, once the owner's registration there lets the server ask), each kept on this device;
// how a search or a paper names an article or a court's case; and the 국가법령정보센터 pages for what cannot be shown here.
import * as api from './api.js';
import * as store from './store.js';

const SVC = '9750000/LawInfoService/';
// the two laws whose text the court publishes; 헌법 does not change, 헌법재판소법 is asked again after a month
export const LAWS = {
  헌법: { gubun: '1147', full: '대한민국헌법', again: 365 * 864e5 },
  헌법재판소법: { gubun: '1148', full: '헌법재판소법', again: 30 * 864e5 },
};
const ALIAS = { 헌법: '헌법', 대한민국헌법: '헌법', 헌재법: '헌법재판소법', 헌법재판소법: '헌법재판소법' };
export const lawKey = (name) => ALIAS[String(name || '').replace(/\s+/g, '')] || null;

/* ---------------- what a search asks for ---------------- */
// 헌법 제37조 제2항 · 헌법 37조 2항 · 형법 제269조 제1항 · 헌재법 68조 · 국가공무원법 제66조의2
const ART_RE = /^(.+?)\s*제?\s*(\d{1,4})\s*조(?:\s*의\s*(\d{1,3}))?(?:\s*제?\s*(\d{1,3})\s*항)?(?:\s*제?\s*(\d{1,3})\s*호)?$/;
export function articleQuery(q) {
  const s = String(q || '').trim().replace(/\s+/g, ' ');
  const m = ART_RE.exec(s);
  if (!m) return null;
  const law = m[1].replace(/\s+/g, '');
  if (!/^[가-힣ㆍ·]{2,40}$/.test(law) || !/(?:법|령|규칙|법률)$/.test(law)) return null;
  return { law: lawKey(law) || law, art: Number(m[2]), sub: m[3] ? Number(m[3]) : 0, para: m[4] ? Number(m[4]) : 0, item: m[5] ? Number(m[5]) : 0 };
}
// a court's case number (대법원 2000두7735, 2019다12345, 2018고단1234): 헌재's own (헌가, 헌마 …) are not these
export function courtQuery(q) {
  const m = /^(?:대법원|서울고등법원|[가-힣]{2,8}법원)?\s*((?:19|20)\d{2}|\d{2})\s*([가-힣]{1,3})\s*(\d{1,7})$/.exec(String(q || '').trim().replace(/\s+/g, ' '));
  if (!m || /^헌/.test(m[2])) return null;
  return { no: m[1] + m[2] + Number(m[3]) };
}

// the 국가법령정보센터 pages (its documented links by name), for what this app cannot show itself yet
export const lawGoKr = {
  article: (law, art, sub) => `https://www.law.go.kr/법령/${encodeURIComponent(law)}/제${art}조${sub ? '의' + sub : ''}`,
  law: (law) => `https://www.law.go.kr/법령/${encodeURIComponent(law)}`,
  case: (no) => `https://www.law.go.kr/판례/(${encodeURIComponent(no)})`,
};

/* ---------------- the texts ---------------- */
const fail = (code) => Object.assign(new Error(code), { code });
const mem = {};
const asking = {};
export function lawText(name) {
  const key = lawKey(name) || String(name || '').replace(/\s+/g, '');
  if (mem[key]) return Promise.resolve(mem[key]);
  if (!asking[key]) asking[key] = (LAWS[key] ? load(key) : loadDrf(key, String(name).replace(/\s+/g, ' ').trim())).then((t) => (mem[key] = t)).finally(() => { delete asking[key]; });
  return asking[key];
}
async function load(key) {
  const L = LAWS[key];
  const kept = await store.get('kv', 'law:' + key).catch(() => null);
  const ok = kept && kept.v === 1 && kept.text;
  if (ok && (Date.now() - kept.at < L.again || !navigator.onLine)) return parse(key, kept);
  if (!navigator.onLine) throw fail('offline');
  try {
    const list = items(await api.publicData(SVC + 'getLawordList', { type: 'json', gubun: L.gubun, numOfRows: '50', pageNo: '1' }));
    const cur = list.filter((x) => x.boardId).sort((a, b) => String(b.revDate || '').localeCompare(String(a.revDate || '')))[0];
    if (!cur) throw fail('unavailable');
    if (ok && kept.board === String(cur.boardId)) { kept.at = Date.now(); await store.put('kv', 'law:' + key, kept).catch(() => {}); return parse(key, kept); }
    const det = items(await api.publicData(SVC + 'getLawordDetail', { type: 'json', gubun: L.gubun, boardId: String(cur.boardId), numOfRows: '1', pageNo: '1' }))[0];
    if (!det || !det.content) throw fail('unavailable');
    const rec = { v: 1, at: Date.now(), board: String(cur.boardId), title: String(det.title || cur.title || L.full).trim(), rev: String(cur.revDate || ''), text: htmlText(det.content) };
    await store.put('kv', 'law:' + key, rec).catch(() => {});
    return parse(key, rec);
  } catch (e) {
    if (ok) return parse(key, kept);   // the copy kept here, while the court's server does not answer
    throw e && e.code ? e : fail(api.isOffline(e) ? 'offline' : 'unavailable');
  }
}
function items(data) {
  const h = data && data.header;
  if (!h || !/^0+$/.test(String(h.resultCode))) throw fail('unavailable');
  const it = data.body && data.body.items && data.body.items.item;
  return it == null || it === '' ? [] : Array.isArray(it) ? it : [it];
}
export function htmlText(html) {
  const marked = String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|div|li|tr|h\d)\s*>/gi, '\n');
  const doc = new DOMParser().parseFromString(marked, 'text/html');
  return (doc.body.textContent || '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}
// articles in order, each with its chapter; the 부칙 (which numbers its own articles from 1 again) ends the body
export function parse(key, rec) {
  const arts = [], pre = [];
  let cur = null, chapter = '', inPre = false, last = 0;
  for (const L of String(rec.text).split('\n')) {
    if (/^부\s*칙/.test(L)) break;
    if (/^전\s*문$/.test(L)) { inPre = true; continue; }
    if (/^제\s*\d+\s*장\s*\S/.test(L) && L.length <= 40) { chapter = L.replace(/\s+/g, ' ').replace(/^제\s*(\d+)\s*장\s*/, '제$1장 '); cur = null; inPre = false; continue; }
    if (/^제\s*\d+\s*절\s*\S/.test(L) && L.length <= 40) { cur = null; continue; }
    const m = /^제(\d{1,4})조(?:의(\d{1,3}))?(?:\s*\(([^)]{1,40})\))?(?:\s+|(?=[①-⑳])|$)(.*)$/.exec(L);
    // a line that opens with a reference ("제68조 제1항에 따른 …") is not a new article: articles come in order
    if (m && (last === 0 ? Number(m[1]) <= 2 : Number(m[1]) >= last && Number(m[1]) <= last + 3)) {
      last = Number(m[1]);
      cur = { art: last, sub: m[2] ? Number(m[2]) : 0, title: m[3] || '', chapter, lines: m[4] ? [m[4].trim()] : [] };
      arts.push(cur); inPre = false; continue;
    }
    if (inPre) { pre.push(L); continue; }
    if (cur) cur.lines.push(L);
  }
  return { key, title: rec.title, rev: rec.rev, full: LAWS[key].full, preamble: pre.join('\n'), arts: arts.map((a) => ({ ...a, text: a.lines.join('\n') })) };
}
export const artLabel = (a) => `제${a.art}조${a.sub ? '의' + a.sub : ''}`;
export function findArt(law, art, sub = 0) { return law.arts.find((a) => a.art === art && a.sub === sub) || null; }
// the paragraph lines of an article (①, ②, …), so one can be picked out
export function paras(a) {
  const out = [];
  for (const l of String(a.text).split('\n')) { if (/^[①-⑳]/.test(l) || !out.length) out.push(l); else out[out.length - 1] += '\n' + l; }
  return out;
}

/* ---------------- every other law, and the courts' judgments: 국가법령정보 OPEN API ---------------- */
// Until the owner's registration at open.law.go.kr lets the server ask, the answer is a refusal ('unregistered'); it is
// remembered for a while so a page full of citations does not ask again and again.
let refusedAt = 0, answeredAt = 0;
export const drfReady = () => answeredAt > refusedAt;   // 국가법령정보 has answered since it last refused
const arr = (x) => (x == null || x === '' ? [] : Array.isArray(x) ? x : [x]);
const ymd = (s) => { const m = /^(\d{4})\.?(\d{2})\.?(\d{2})$/.exec(String(s || '').trim()); return m ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.` : ''; };
const norm = (s) => String(s || '').replace(/[\s「」·ㆍ]/g, '');
async function drf(kind, params) {
  if (Date.now() - refusedAt < 10 * 60e3) throw fail('unregistered');
  if (!navigator.onLine) throw fail('offline');
  let d;
  try { d = await (kind === 'item' ? api.lawItem(params) : api.lawSearch(params)); }
  catch (e) { throw fail(api.isOffline(e) ? 'offline' : e && e.code === 'no_key' ? 'unregistered' : 'unavailable'); }
  if (!d || typeof d !== 'object') throw fail('unavailable');
  if (d.result && !d.법령 && !d.LawSearch && !d.PrecSearch && !d.PrecService) { refusedAt = Date.now(); throw fail('unregistered'); }
  answeredAt = Date.now();
  return d;
}
const TAG = /<\/?(?:img|br|p|span|div|b|i|u|strong|em|sup|sub|font|a)\b[^>]*>/gi;   // not <개정 2020. 1. 1.>, which is the law's own
function text(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join('\n');
  if (typeof v === 'object') return text(v.content != null ? v.content : '');
  return String(v).replace(/<br\s*\/?>/gi, '\n').replace(TAG, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&')
    .split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean).join('\n');
}
// the 목 of a paragraph come as one list beside its 호; each 호's run of 목 starts again at 가
function mokGroups(list) { const g = []; for (const m of list) { if (!m || typeof m !== 'object') continue; if (!g.length || /^\s*가/.test(String(m.목번호 || ''))) g.push([]); g[g.length - 1].push(m); } return g; }
export function drfArts(d) {
  const law = d && d.법령;
  if (!law) throw fail('unavailable');
  const info = law.기본정보 || {};
  const arts = [];
  let chapter = '', last = null;
  for (const u of arr(law.조문 && law.조문.조문단위)) {
    if (u.조문여부 === '전문') { const h = text(u.조문내용); if (/^제\s*\d+\s*[편장]/.test(h)) chapter = h.replace(/\s+/g, ' '); continue; }
    if (u.조문여부 !== '조문') continue;
    const art = Number(u.조문번호), sub = Number(u.조문가지번호 || 0);
    if (!art || (last && last.art === art && last.sub === sub)) continue;
    const lines = [];
    const head = text(u.조문내용).replace(/^제\s*\d+\s*조(?:\s*의\s*\d+)?\s*(?:\([^)]*\))?\s*/, '');
    if (head) lines.push(head);
    for (const h of arr(u.항)) {
      if (!h || typeof h !== 'object') continue;
      if (h.항내용) lines.push(text(h.항내용));
      const hos = arr(h.호), moks = mokGroups(arr(h.목)), fit = hos.length && moks.length === hos.length;
      hos.forEach((o, i) => {
        if (o && o.호내용) lines.push(text(o.호내용));
        for (const m of arr(o && o.목)) if (m && m.목내용) lines.push(text(m.목내용));
        if (fit) for (const m of moks[i]) if (m.목내용) lines.push(text(m.목내용));
      });
      if (!fit) for (const g of moks) for (const m of g) if (m.목내용) lines.push(text(m.목내용));
    }
    last = { art, sub, title: text(u.조문제목), chapter, text: lines.filter(Boolean).join('\n') };
    arts.push(last);
  }
  const name = text(info.법령명_한글) || '';
  return { name, rev: String(info.시행일자 || ''), arts };
}
async function loadDrf(name, asked) {
  const kept = await store.get('kv', 'law:' + name).catch(() => null);
  const ok = kept && kept.v === 2 && kept.arts;
  const view = (k) => ({ key: name, title: `${k.full}${k.rev ? ` (${ymd(k.rev)} 시행)` : ''}`, rev: k.rev, full: k.full, preamble: '', arts: k.arts, src: 'law.go.kr' });
  if (ok && Date.now() - kept.at < 7 * 864e5) return view(kept);
  try {
    const s = await drf('search', { target: 'law', query: asked || name, display: '20' });
    const rows = arr(s.LawSearch && s.LawSearch.law);
    const want = norm(name);
    const row = rows.find((r) => norm(r.법령명한글) === want && r.현행연혁코드 !== '연혁') || rows.find((r) => norm(r.법령약칭명) === want) || rows.find((r) => norm(r.법령명한글) === want);
    if (!row) throw fail('nolaw');
    const mst = String(row.법령일련번호 || '');
    if (ok && kept.mst === mst) { kept.at = Date.now(); store.put('kv', 'law:' + name, kept).catch(() => {}); return view(kept); }
    const got = drfArts(await drf('item', { target: 'law', MST: mst }));
    if (!got.arts.length) throw fail('unavailable');
    const rec = { v: 2, at: Date.now(), mst, full: got.name || text(row.법령명한글), rev: got.rev || String(row.시행일자 || ''), arts: got.arts };
    await store.put('kv', 'law:' + name, rec).catch(() => {});
    return view(rec);
  } catch (e) {
    if (ok) return view(kept);   // the copy kept here, when the server cannot ask now
    throw e && e.code ? e : fail('unavailable');
  }
}

// a court's judgment (대법원 2000두7735 …): 판시사항, 판결요지, references, and the full text; kept here once read
const courtAsking = new Map();
export function courtCase(no) {
  if (!courtAsking.has(no)) courtAsking.set(no, askCourt(no).finally(() => courtAsking.delete(no)));
  return courtAsking.get(no);
}
async function askCourt(no) {
  const kept = await store.get('kv', 'court:' + no).catch(() => null);
  if (kept && kept.v === 1 && (kept.d || Date.now() - kept.at < 3 * 864e5)) return kept.d;
  const s = await drf('search', { target: 'prec', nb: no, display: '20' });
  const row = arr(s.PrecSearch && s.PrecSearch.prec).find((r) => norm(r.사건번호).split(',').map(norm).includes(no) || norm(r.사건번호) === no);
  let d = null;
  if (row) {
    const x = (await drf('item', { target: 'prec', ID: String(row.판례일련번호) })).PrecService || {};
    d = {
      no, court: true, name: text(x.사건명 || row.사건명), date: ymd(x.선고일자 || row.선고일자), courtName: text(x.법원명 || row.법원명),
      kind: text(x.판결유형 || row.판결유형) || '판결', points: text(x.판시사항), summary: text(x.판결요지), laws: text(x.참조조문), cites: text(x.참조판례), reason: text(x.판례내용),
    };
  }
  await store.put('kv', 'court:' + no, { v: 1, at: Date.now(), d }).catch(() => {});
  return d;
}
// 대법원 2004. 4. 22. 선고 2000두7735 판결
export const courtCite = (d) => `${d.courtName || '법원'} ${d.date ? d.date + ' 선고 ' : ''}${d.no} ${d.kind || '판결'}`;

/* ---------------- citations in a paper's text ---------------- */
// 헌법 제37조 제2항 · 「공직선거법」 제82조의8 제1항 · 형법 제241조 — the law named right before the article (a "구 법률(…)"
// with its version in between, or "같은 법", is left alone: the text shown would be today's, not that one)
const CITE_RE = /(?:「\s*([^」\n]{2,60}?)\s*」|((?:대한민국)?헌법|[가-힣·ㆍ]{1,30}(?:법률|법|령|규칙)))\s*제\s*(\d{1,4})\s*조(?:\s*의\s*(\d{1,3}))?(?:\s*제\s*(\d{1,3})\s*항)?/g;
const NOT_A_LAW = /^(?:같은|동|이|위|본|해당|그|각|이사건|관계|관련|구|신|개정|현행|종전|입|방|불|위|사|공|행정|국제|실정|자연|위헌|합헌|모|부|당해|관련)(?:법률|법|령|규칙)$|^(?:법률|위헌법률|헌법률|수정헌법|기본법|특례법|특별법|조치법|처벌법|시행령|시행규칙|진흥법|촉진법|보호법|관리법|조직법|절차법)$|^(?:미국|독일|프랑스|일본|영국|연방|미|독|불|일|영)/;
const SHORT = new Set(['헌법', '민법', '형법', '상법']);   // the two-letter laws; any other two letters before 법 is a word cut by a line break
export function scanArticles(textIn) {
  const out = [];
  if (!textIn) return out;
  CITE_RE.lastIndex = 0;
  let m;
  while ((m = CITE_RE.exec(textIn))) {
    const tight = (m[1] || m[2]).replace(/[·ㆍ\s]/g, '');
    if (m[1] && (!/(?:법률|법|령|규칙)$/.test(tight) || !/^[가-힣]{2,50}$/.test(tight))) continue;   // 「…」 that is not a law's name
    if (NOT_A_LAW.test(tight) || (tight.length <= 2 && !SHORT.has(tight))) continue;
    const law = lawKey(tight) || (m[1] ? m[1].replace(/\s+/g, ' ').trim() : tight);   // a long name keeps its spaces (that is how it is filed)
    out.push({ law, art: Number(m[3]), sub: m[4] ? Number(m[4]) : 0, para: m[5] ? Number(m[5]) : 0, i: m.index, len: m[0].length });
    // the same law's further articles in a list: 헌법 제10조, 제37조 제2항 및 제21조
    let at = m.index + m[0].length, n;
    MORE_RE.lastIndex = at;
    while ((n = MORE_RE.exec(textIn))) {
      const k = n[0].search(/제/);
      out.push({ law, art: Number(n[1]), sub: n[2] ? Number(n[2]) : 0, para: n[3] ? Number(n[3]) : 0, i: n.index + k, len: n[0].length - k });
      at = MORE_RE.lastIndex;
    }
    CITE_RE.lastIndex = at;
  }
  return out;
}
const MORE_RE = /\s*(?:,|·|ㆍ|및|와|과)\s*제\s*(\d{1,4})\s*조(?:\s*의\s*(\d{1,3}))?(?:\s*제\s*(\d{1,3})\s*항)?/y;
// a court's case cited in a paper: 대법원 2004. 4. 22. 선고 2000두7735 판결, 대판 2010다12345, 서울고법 2019누1234
const COURT_KINDS = '가합|가단|가소|가|나|다|라|마|그|카합|카단|카|머|두|누|구합|구단|구|도|노|고합|고단|고정|고약|로|모|오|보|초|감도|재다|재두|재도|재노|재나|므|르|드|브|스|으|느합|느단|느|후|허|추|트|러|어|저|처|커|터|퍼|쿠|주|즈|츠|크|티|프|흐';
const COURT_RE = new RegExp(`((?:19|20)\\d{2}|[4-9]\\d)\\s?(${COURT_KINDS})\\s?(\\d{1,7})(?!\\d)(?![,.]\\d)`, 'g');   // not 1,234
export function scanCourtCases(textIn) {
  const out = [];
  if (!textIn) return out;
  COURT_RE.lastIndex = 0;
  let m;
  while ((m = COURT_RE.exec(textIn))) {
    const before = textIn.slice(Math.max(0, m.index - 40), m.index), after = textIn.slice(m.index + m[0].length, m.index + m[0].length + 14);
    if (!/(?:법원|대판|선고|판결|결정)/.test(before + after)) continue;   // only where it is plainly a court's case
    if (/[가-힣]$/.test(textIn.slice(Math.max(0, m.index - 1), m.index)) && !/[원판]$/.test(before)) continue;
    out.push({ no: m[1] + m[2] + Number(m[3]), i: m.index, len: m[0].length });
  }
  return out;
}
