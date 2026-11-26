// 헌재 결정 바로 보기: case numbers as papers cite them (헌재 2004. 10. 21. 2004헌마554등), and the decision itself from
// 헌법재판소 판례정보 (공공데이터포털), asked through the 책장 server once and kept on this device (a decision does not change).
import * as api from './api.js';
import * as store from './store.js';
import { scanArticles, scanCourtCases, artLabel, lawGoKr } from './laws.js';

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

/* ---------------- the decision ---------------- */
const SVC = '9750000/PrecedentInfomationService/', CASES = '9750000/IncidentInfoService/';
const KIND = { 결정문: '01', 공보: '02', 판례집: '03' };
const SRC = { '01': '결정문', '02': '공보', '03': '판례집' };
const SHAPE = 1;                 // how a decision is kept here (a new shape is asked again)
const AGAIN = 3 * 864e5;         // a number not found is asked again after three days: the court may have added it
const asking = new Map();

// the decision, or null when the court's data has no such case; onRow(first) gets the list's line (name, date, result)
// while the full text is still on its way. Throws { code: 'offline' | 'unavailable' }.
export function decision(no, onRow) {
  if (!asking.has(no)) asking.set(no, ask(no, onRow).finally(() => asking.delete(no)));
  return asking.get(no);
}
export async function kept(no) {
  const k = await store.get('kv', 'case:' + no).catch(() => null);
  return k && k.v === SHAPE ? k : null;
}
async function ask(no, onRow) {
  const k = await kept(no);
  if (k && (k.d || Date.now() - k.at < AGAIN)) return k.d;
  if (!navigator.onLine) { if (k) return k.d; throw fail('offline'); }
  const rows = items(await get('getKorPrcdntList', { type: 'json', numOfRows: '10', pageNo: '1', eventNo: no }));
  const row = rows.find((r) => String(r.eventNo || '').replace(/\s+/g, '') === no);
  let d = null;
  if (!row) {
    // a case decided together with another (2004헌마566 in 2004헌마554·566): the court files the decision under the first
    const lead = await leadCase(no).catch(() => null);
    if (lead && lead !== no) { const l = await decision(lead, onRow); d = l ? { ...l, asked: no } : null; }
  } else {
    if (onRow) { try { onRow({ ...shape(no, row, null, ''), pending: true }); } catch (e) { /* only a preview */ } }
    const want = KIND[String(row.panreType || '').trim()] || '01';
    for (const code of want === '01' ? ['01'] : [want, '01']) {
      const det = items(await get('getKorPrcdntDetail', { type: 'json', eventNum: String(row.eventNum), panreType: code }))[0];
      if (det) { d = shape(no, row, det, code); break; }
    }
    if (!d) d = shape(no, row, null, '');
  }
  await store.put('kv', 'case:' + no, { v: SHAPE, at: Date.now(), d }).catch(() => {});
  return d;
}
const fail = (code) => Object.assign(new Error(code), { code });
async function get(op, params, svc = SVC) {
  try { return await api.publicData(svc + op, params); }
  catch (e) { throw fail(api.isOffline(e) ? 'offline' : 'unavailable'); }
}
async function leadCase(no) {
  const r = items(await get('getMergedCase', { type: 'json', numOfRows: '5', pageNo: '1', eventNo: no }, CASES))[0];
  const all = r ? scanCases(String(r.mrgNms || '')).map((c) => c.no) : [];
  return all.length && all.includes(no) ? all[0] : null;   // "2004헌마554,2004헌마566(병합)": the first is the one decided under
}

/* ---------------- 찾기: 헌재 결정 by name, by the words of their holdings, by the law they reviewed ---------------- */
const found = new Map();   // this session's answers, by question
async function list(svc, op, params, page, size = 20) {
  const key = svc + op + '?' + new URLSearchParams({ ...params, pageNo: String(page), numOfRows: String(size) });
  if (found.has(key)) return found.get(key);
  const d = await get(op, { type: 'json', pageNo: String(page), numOfRows: String(size), ...params }, svc);
  const out = { total: Number(d && d.body && d.body.totalCount) || 0, rows: items(d) };
  found.set(key, out);
  return out;
}
// decisions whose name has the words — of the 전원재판부 (panel ''), or of the 지정재판부, whose dismissals would otherwise come
// first, newest first, before the decision that settled the question
export async function byName(q, page = 1, panel = '전원재판부') {
  const r = await list(SVC, 'getKorPrcdntList', { eventNm: q, ...(panel ? { jgdmtCort: panel } : {}) }, page);
  return { total: r.total, rows: r.rows.map((x) => ({ no: one(x.eventNo).replace(/\s+/g, ''), name: one(x.eventNm), date: ymd(x.rstaDate), result: one(x.rstaRsta), court: one(x.jgdmtCort) })) };
}
// the court's digest of holdings (판례요지집): entries whose text has the words, each placed under the article it concerns
export async function byHolding(q, page = 1) {
  const r = await list(SVC, 'getOcprOutlineList', { content: q }, page);
  return { total: r.total, rows: r.rows.map((x) => ({ seq: one(x.seqNo), title: one(x.title), path: one(x.cntntpth) })) };
}
export async function holding(seq) {
  const r = (await list(SVC, 'getOcprOutlineDetail', { seqNo: seq }, 1, 5)).rows[0];
  return r ? { seq, title: one(r.title), path: one(r.cntntpth), text: clean(r.content), cases: scanCases(String(r.eventNo || '')).map((c) => c.no) } : null;
}
// the court's own selection of leading decisions (주요판례), searched in their full text and, on the first page, by the common
// name they go by too (별칭: '관습헌법 사건'); each has its common name
export async function byLeading(q, page = 1) {
  const row = (x) => ({ no: (scanCases(String(x.eventNo || ''))[0] || {}).no || '', nick: one(x.nick), name: one(x.title), date: ymd(x.adjudgeDt), area: one(x.classNm) });
  const [r, n] = await Promise.all([list(SVC, 'getRealmMainPrcdntList', { code: '0', decisionNm: q }, page),
    page === 1 ? list(SVC, 'getRealmMainPrcdntList', { code: '0', eventNm: q }, 1).catch(() => ({ total: 0, rows: [] })) : { total: 0, rows: [] }]);
  const rows = r.rows.map(row), have = new Set(rows.map((x) => x.no));
  const more = n.rows.map(row).filter((x) => x.no && !have.has(x.no));
  return { total: r.total + more.length, rows: [...more, ...rows] };
}
// decisions that reviewed a law (or one article of it): 형법 제269조 제1항
export async function byLaw(law, art, para, page = 1) {
  const q = { lawNm: law };
  if (art) q.provision = String(art);
  if (para) q.clause = String(para);
  const r = await list(CASES, 'getLawCaseList', q, page);
  // the service answers a row for every article a case reviewed: one row a case, its articles together
  // ('국가보안법 제2조 제1항 · 제7조 제1항 · 제7조 제5항')
  const lawOfT = (t) => (/^(.*?)\s*제\s*\d/.exec(t) || [, ''])[1];
  const rows = [], at = new Map();
  for (const x of r.rows.map((x) => ({ no: one(x.eventNo).replace(/\s+/g, ''), name: one(x.eventNm), target: one(x.refreeePrvsn), date: ymd(x.endDate), result: one(x.endRsta), order: clean(x.lawArtiClent) }))) {
    const y = at.get(x.no);
    if (!y) { at.set(x.no, x); rows.push(x); continue; }
    const t = x.target && lawOfT(x.target) === lawOfT(y.target) ? x.target.slice(lawOfT(x.target).length).trim() : x.target;
    if (t && !y.target.includes(t)) y.target += ' · ' + t;
  }
  return { total: r.total, rows };
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
    .replace(/\r\n?/g, '\n').replace(/[　\t]/g, ' ').replace(/[ ]+\n/g, '\n').trim();
}
const one = (s) => clean(s).replace(/\s+/g, ' ').trim();
const ymd = (s) => { const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(s || '').trim()); return m ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.` : ''; };
function shape(no, row, det, code) {
  const g = (k) => (det ? clean(det[k]) : '');
  const info = g('panreInfo');   // (2004. 10. 21. 2004헌마554·566(병합) 전원재판부)
  let reason = g('reason');
  if (!reason && det) reason = ['eventSummary', 'abjObt', 'caseRelatedOpinion', 'judgement', 'conclusion', 'otherOpinions'].map(g).filter(Boolean).join('\n\n');
  return {
    no, name: (one(row.eventNm) || one(g('panreTitle'))).replace(/(\d조(?:의\d+)?|\d항|\d호)\s+(의|에)(?=\s)/g, '$1$2'), date: ymd(row.rstaDate || (det && det.rstaDate)),   // 제241조 의 → 제241조의
    result: one(row.rstaRsta || g('rstaRsta')), court: one(row.jgdmtCort || g('jgdmtCort')),
    joined: /병합|\d\s*·\s*\d|\d등/.test(info), src: SRC[code] || '',
    vol: one(g('volumeInfo')), ser: one(g('seriesInfo')), pages: one(g('pages')),
    order: g('textOfDecision'), points: g('pansiMatt'), summary: g('decisionGst'), laws: g('refrnPrvsn'), cites: g('refrnPrcdnt'), reason,
  };
}

// 헌재 2004. 10. 21. 2004헌마554등 — the form papers cite a decision by
export const cite = (d) => `헌재 ${d.date ? d.date + ' ' : ''}${d.no}${d.joined ? '등' : ''}`;
function where(d) {
  const first = String(d.pages || '').split(/[~-]/)[0].trim();
  if (d.src === '판례집' && d.vol) return `판례집 ${d.vol}권${d.ser && d.ser !== '0' ? ' ' + d.ser + '집' : ''}${first ? ' ' + first + '쪽' : ''}`;
  if (d.src === '공보' && d.vol) return `헌법재판소공보 제${d.vol}호${first ? ' ' + first + '쪽' : ''}`;
  return '';
}

/* ---------------- shown ---------------- */
// the court's texts keep the line breaks of their print: a break inside a sentence (even inside a word) is joined again,
// one before a numbered point, a heading, a "label : value" line or after a finished sentence stays
const POINT = /^\s*(?:\d{1,2}\s*[.)](?!\s*\d)|\(\s*(?:\d{1,2}|[가나다라마바사아자차카타파하])\s*\)|[①-⑳㉠-㉭○◯●■□▶▷◆◇※\-–—·]|\[|재판관\s|대리인\s|【)/;
const HPOINT = /^\s*[가나다라마바사아자차카타파하]\s*\.\s/;   // 가. 나. … (but 다. also ends a sentence cut before its last letter)
const ENDS = /(?:[다음함것임됨요까]\.|[?!。])\s*$/;
export function unwrap(s) {
  const ls = String(s || '').split('\n');
  let out = ls[0] || '';
  for (let i = 1; i < ls.length; i++) {
    const a = ls[i - 1], b = ls[i];
    const heading = (POINT.test(a) || HPOINT.test(a)) && a.trim().length <= 40 && !/[.。]\s*$/.test(a);
    const keep = !a.trim() || !b.trim() || POINT.test(b) || (HPOINT.test(b) && (ENDS.test(a) || /[.)]\s*$/.test(a) || heading)) || heading || ENDS.test(a) || /^\S{1,10}\s?:\s/.test(b);
    out += (keep ? '\n' : /[.,;:]$/.test(a) && /^[\p{L}\p{N}]/u.test(b) ? ' ' : '') + b;   // 2004. 10. | 21. → 2004. 10. 21.
  }
  return out;
}
// text with what it cites as links: 헌재 decisions, courts' judgments, and articles of laws
export function linkCases(text) {
  if (!text) return '';
  const refs = [
    ...scanCases(text).map((c) => ({ ...c, attr: `data-case="${esc(c.no)}"` })),
    ...scanCourtCases(text).map((c) => ({ ...c, attr: `data-court="${esc(c.ref)}"` })),
    ...scanArticles(text).map((a) => ({ ...a, attr: `data-art="${esc(`${a.law} ${artLabel(a)}${a.para ? ` 제${a.para}항` : ''}`)}"` })),
  ].sort((a, b) => a.i - b.i);
  let out = '', last = 0;
  for (const r of refs) {
    if (r.i < last) continue;   // overlapping finds: the first wins
    out += esc(text.slice(last, r.i)) + `<button type="button" class="case-ln" ${r.attr}>${esc(text.slice(r.i, r.i + r.len))}</button>`;
    last = r.i + r.len;
  }
  return out + esc(text.slice(last));
}
// a court's judgment as a card, like a decision's: 판시사항 and 판결요지 open, the rest folded
export function judgmentView(d) {
  const sec = (h, body) => (body ? `<section class="cs-sec"><h4>${h}</h4><p>${body}</p></section>` : '');
  const fold = (h, part, n) => (d[part] ? `<details class="cs-fold" data-part="${part}"><summary>${h}${n ? `<span>${n}</span>` : ''}</summary><p></p></details>` : '');
  return `<div class="cs-name">${esc(d.name || d.no)}</div>`
    + `<div class="cs-meta">${[d.courtName, d.date && d.date + (d.kind === '결정' ? '자' : ' 선고'), d.kind].filter(Boolean).map(esc).join(' · ')}</div>`
    + sec('판시사항', linkCases(d.points))
    + sec(d.kind === '결정' ? '결정요지' : '판결요지', linkCases(unwrap(d.summary)))
    + (!d.points && !d.summary && !d.reason ? '<p class="cs-wait">공개된 판결문에 아직 내용이 실리지 않았습니다.</p>' : '')
    + fold('참조판례', 'cites', lines(d.cites))
    + fold('참조조문', 'laws')
    + fold('전문', 'reason').replace('<details', !d.points && !d.summary ? '<details open' : '<details')   // the whole text, when that is all there is
    + (d.url ? `<p class="cs-out"><a class="btn ghost small" href="${esc(d.url)}" target="_blank" rel="noopener">국가법령정보센터에서 보기</a></p>` : '');
}
const lines = (s) => String(s || '').split('\n').filter((l) => l.trim()).length;
// the decision as a card: what it is, 주문, 판시사항, 결정요지; the references and the full reasons fold out when wanted
export function caseView(d) {
  const meta = [d.date && d.date + ' 선고', d.court, where(d)].filter(Boolean).map(esc);
  const sec = (h, body) => (body ? `<section class="cs-sec"><h4>${h}</h4><p>${body}</p></section>` : '');
  const fold = (h, part, n) => (d[part] ? `<details class="cs-fold" data-part="${part}"><summary>${h}${n ? `<span>${n}</span>` : ''}</summary><p></p></details>` : '');
  const short = !d.points && !d.summary && d.reason && d.reason.length <= 1500;   // a short decision (각하 and the like): its reasons in full
  return (d.asked && d.asked !== d.no ? `<p class="cs-wait">${esc(d.asked)} — 이 사건에 병합되어 함께 결정되었습니다.</p>` : '')
    + `<div class="cs-name">${esc(d.name || d.no)}</div>`
    + `<div class="cs-meta">${d.result ? `<b class="cs-res">${esc(d.result)}</b>` : ''}${meta.length ? (d.result ? ' · ' : '') + meta.join(' · ') : ''}</div>`
    + sec('주문', linkCases(d.order))
    + sec('판시사항', linkCases(d.points))
    + sec('결정요지', linkCases(unwrap(d.summary)))
    + (short ? sec('이유', linkCases(unwrap(d.reason))) : '')
    + (d.pending ? '<p class="cs-wait">결정문을 불러오는 중…</p>' : !d.order && !d.summary && !d.reason ? '<p class="cs-wait">판례정보에 아직 결정문이 실리지 않았습니다.</p>' : '')
    + fold('참조판례', 'cites', lines(d.cites))
    + fold('참조조문', 'laws')
    + (short ? '' : fold('이유 전문', 'reason'))
    + `<p class="cs-out"><a class="btn ghost small" href="${lawGoKr.decision(d.no)}" target="_blank" rel="noopener">국가법령정보센터에서 보기</a></p>`;
}
// fill a fold the first time it opens (the full reasons of a long decision run to tens of thousands of letters)
export function wireCase(box, d) {
  const fill = (x) => {
    const p = x.querySelector('p');
    if (!x.open || p.dataset.done) return;
    p.dataset.done = '1';
    const t = d[x.dataset.part] || '';
    p.innerHTML = linkCases(x.dataset.part === 'reason' ? unwrap(t) : t);
  };
  box.querySelectorAll('details.cs-fold').forEach((x) => { x.addEventListener('toggle', () => fill(x)); fill(x); });
}
