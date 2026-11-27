// 연구실 책장 — 논문 찾기 over every source the server reaches, as one list of papers.
//   국회도서관 (papers.js)   journal papers, theses and books of every year
//   KCI (its own Open API)   every paper KCI holds, of every year, with its abstract and how often it is cited
//   ScienceON (KISTI)        Korean papers from 1940, with abstracts
//   KCI 색인 (kciq.js)       the law papers KCI registered lately, on this device: instant, and there offline
// All are asked together; their rows become one paper each (the same title, with or without its subtitle, a year apart at
// most, the same first author — or the same KCI id or DOI), each keeping what any of them knows of it, and are ordered by one
// score of our own, in groups that never mix: a journal's papers (a person's own first, when a person is asked), then
// magazine pieces (잡지·기사), then an issue's front matter (발간사·권두언 …). A source that cannot be asked (its key not set
// yet, or refused) is simply left out (api.js remembers it).
import * as api from './api.js?v=aedca5545d';
import * as papers from './papers.js?v=aedca5545d';
import * as kciq from './kciq.js?v=aedca5545d';
import * as naming from './naming.js?v=aedca5545d';
import * as terms from './terms.js?v=aedca5545d';

export const PAGE = 20;                                   // papers shown at a time
const SIZE = { idx: 20, nanet: 20, kci: 50, so: 20 };     // asked of each source at a time (KCI has no order by relevance of its
                                                          // own, so it is asked for more at once: the score below picks from them)
export const NAMES = { nanet: '국회도서관', kci: 'KCI', so: 'ScienceON', idx: 'KCI 최근 법학 논문' };

/* ---------- KCI's answer (articleSearch / articleDetail), read defensively: its element names come from a write-up of KCI's
   guide and have not all been seen live, so each is looked for under the names it may carry; the record's XML is kept ---------- */
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ', middot: '·' };
const ents = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m)).replace(/\u2802/g, '·');
// an element's text: CDATA as written (the few marks of HTML some abstracts carry taken out), other markup dropped, entities read
export function xtext(s) {
  const cd = [];
  let t = String(s == null ? '' : s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (m, c) => { cd.push(c); return '\u0000' + (cd.length - 1) + '\u0000'; });
  t = ents(t.replace(/<[^>]+>/g, ' '));
  t = t.replace(/\u0000(\d+)\u0000/g, (m, i) => ents(cd[+i].replace(/<\/?(?:p|br|sup|sub|i|b|u|em|strong|span|div|font)\b[^>]*>/gi, ' ')));
  return t.replace(/\s+/g, ' ').trim();
}
const elRe = (n, g) => new RegExp(`<${reEsc(n)}(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</${reEsc(n)}\\s*>)`, g ? 'gi' : 'i');
function el1(xml, names) {   // the first element of one of these names: { attrs, inner }
  for (const n of names) { const m = elRe(n).exec(xml); if (m) return { attrs: m[1] || '', inner: m[2] || '' }; }
  return null;
}
const els = (xml, n) => [...String(xml || '').matchAll(elRe(n, true))].map((m) => ({ attrs: m[1] || '', inner: m[2] || '' }));
const attr = (attrs, names) => { for (const n of names) { const m = new RegExp(`\\s${reEsc(n)}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(' ' + attrs); if (m) return xtext(m[1] ?? m[2]); } return ''; };
const txt = (xml, names) => { const e = el1(xml, names); return e ? xtext(e.inner) : ''; };
const ORIG = /^(?:original|korean|kor|ko)$/, ENG = /^(?:english|eng|en)$/;
function kciRecord(x) {
  const ji = el1(x, ['journalInfo', 'journal-info']) || { attrs: '', inner: x };
  const ai = el1(x, ['articleInfo', 'article-info']) || { attrs: '', inner: x };
  const a = ai.inner, j = ji.inner;
  const url = txt(a, ['url', 'article-url']);
  let id = attr(ai.attrs, ['article-id', 'articleId', 'id']) || txt(a, ['article-id', 'articleId']) || ((/artiId=(ART\d+)/.exec(url) || [])[1] || '');
  if (!/^ART\d{6,12}$/.test(id)) id = '';
  const titles = els(a, 'article-title').map((e) => ({ lang: attr(e.attrs, ['lang']).toLowerCase(), t: xtext(e.inner) })).filter((e) => e.t);
  const t = (titles.find((e) => ORIG.test(e.lang)) || titles.find((e) => !ENG.test(e.lang)) || titles[0] || { t: txt(a, ['title']) }).t;
  const authors = [], affs = [], affOf = {};
  const ag = el1(a, ['author-group']);
  for (const e of els(ag ? ag.inner : a, 'author')) {
    let name = txt(e.inner, ['name']), aff = txt(e.inner, ['institution', 'affiliation']);
    if (!name) { const s = xtext(e.inner), m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(s); name = m ? m[1] : s; aff = aff || (m ? m[2] : ''); }   // "김갑수(서울교육대학교)"
    name = name.trim();
    if (name && !authors.includes(name)) authors.push(name);
    if (aff && !affs.includes(aff)) affs.push(aff);
    if (name && aff && !affOf[name]) affOf[name] = aff;   // (each author's own, for the sheet: the name with where they are)
  }
  const abs = els(a, 'abstract').map((e) => ({ lang: attr(e.attrs, ['lang']).toLowerCase(), t: xtext(e.inner) })).filter((e) => e.t);
  const ab = (abs.find((e) => ORIG.test(e.lang)) || abs.find((e) => !ENG.test(e.lang)) || { t: '' }).t;
  const cc = el1(a, ['citation-count', 'citationCount']);
  const cites = cc ? (attr(cc.attrs, ['kci']) || xtext(cc.inner)) : '';
  const yr = txt(j, ['pub-year', 'pubYear', 'pubi-year', 'pub-yr']), mon = txt(j, ['pub-mon', 'pubMon', 'pubi-mon', 'pub-month']);
  return {
    id, o: '', t, tEn: (titles.find((e) => ENG.test(e.lang)) || {}).t || '', a: authors, affs, affOf,
    journal: txt(j, ['journal-name', 'journalName', 'journal_name']), publisher: txt(j, ['publisher-name', 'publisherName', 'publisher_name']),
    y: (/\d{4}/.exec(yr) || [''])[0], m: /^\d{1,2}$/.test(mon) && +mon >= 1 && +mon <= 12 ? String(+mon) : '',
    v: txt(j, ['volume', 'vol']), i: txt(j, ['issue', 'isseue', 'iss']),
    fp: txt(a, ['fpage', 'start-page', 'spage']), lp: txt(a, ['lpage', 'end-page', 'epage']),
    open: /^(?:y|yes|true|1)$/i.test(txt(a, ['orte-open-yn', 'open-yn', 'orteOpenYn'])),
    c: /^\d+$/.test(cites) ? Number(cites) : null,
    doi: txt(a, ['doi']).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, ''), uci: txt(a, ['uci']),
    url: /^https:\/\/www\.kci\.go\.kr\//.test(url) ? url : '',
    grade: txt(j, ['kci-registration', 'kciRegistration']), cat: txt(a, ['article-categories']),
    kw: els(a, 'keyword').map((e) => xtext(e.inner)).filter(Boolean),
    ab, raw: x,
  };
}
// { total, rows } — rows shaped like the KCI index's (id, journal, publisher, y, m, v, i, fp, lp, open, c, doi, a, t, ab) and
// more (affs, url, grade, kw, raw). An answer that says why it has no records (resultMsg) is a refusal, never "nothing found".
export function kciParse(xml) {
  const s = String(xml || '');
  const out = (el1(s, ['outputData']) || { inner: s }).inner;
  const recs = els(out, 'record');
  const res = el1(out, ['result']);
  const msg = res ? txt(res.inner, ['resultMsg', 'result-msg', 'errMsg', 'message']) : '';
  if (!recs.length && msg) throw Object.assign(new Error(msg), { code: 'kci_refused' });
  if (!recs.length && !/<MetaData\b/i.test(s)) throw Object.assign(new Error('kci'), { code: 'unavailable' });
  const rows = recs.map((r) => kciRecord(r.inner)).filter((r) => r.t);
  const total = Number(txt(res ? res.inner : out, ['total', 'totalCount', 'total-count']).replace(/\D/g, '')) || 0;
  return { total: Math.max(total, rows.length), rows };
}

/* ---------- each source's rows, as the parts of one paper ---------- */
const person = (s) => naming.personName(s) || papers.clean(s);
// a title as the others write it: 국회도서관's catalogue marks (' :부제', ' =부제') as KCI's ' - 부제 -', and quotation marks a
// database doubled (''관습헌법'', ''''관습헌법'''') as one pair. (' = ' before a title in another script, English, is that title
// in the other tongue, and stays.)
export const tidyTitle = papers.tidyTitle;
// an abstract without the label some write before it ('국문초록 본 연구는 …', '요 약', 'Abstract')
const AB_LABEL = /^\s*[[(〈<【]?\s*(?:국문\s*초록|국문\s*요약|한글\s*초록|초\s*록|요\s*약|요\s*지|abstract|summary)\s*[\])〉>】]?(?=[\s:：.\-–—]|$)[\s:：.\-–—]*/i;
const tidyAb = (s) => String(s || '').replace(AB_LABEL, '');
const fromIdx = (x) => ({ src: 'idx', t: tidyTitle(x.t), a: x.a || [], journal: x.journal, publisher: x.publisher, y: x.y, m: x.m, v: x.v, i: x.i, fp: x.fp, lp: x.lp, doi: x.doi, ab: tidyAb(x.ab), c: Number.isFinite(x.c) ? x.c : null, open: !!x.open, kci: x.id, o: x.o, kind: 'ARTICLE', raw: x });
const fromKci = (x) => ({ src: 'kci', t: tidyTitle(x.t), a: x.a, journal: x.journal, publisher: x.publisher, y: x.y, m: x.m, v: x.v, i: x.i, fp: x.fp, lp: x.lp, doi: x.doi, ab: tidyAb(x.ab), c: x.c, open: x.open, kci: x.id, url: x.url, affs: x.affs, affOf: x.affOf, grade: x.grade, kw: x.kw, kind: 'ARTICLE', raw: x });
const fromNanet = (x) => ({ src: 'nanet', t: tidyTitle(x.title), reading: x.reading, a: x.authors || [], journal: x.kind === 'ARTICLE' ? x.journal : '', publisher: x.publisher, y: x.year, kw: x.keywords || [], kind: x.kind, kindName: x.kindName, raw: x });
function fromSo(x) {
  const pg = /(\d+)\s*[-~–]\s*(\d+)/.exec(papers.clean(x.PageInfo)) || [], py = papers.clean(x.Pubyear).replace(/\D/g, '');
  const web = (u) => (/^https?:\/\/[^\s"'<>]+$/.test(papers.clean(u)) ? papers.clean(u) : '');
  return {
    src: 'so', t: tidyTitle(papers.clean(x.Title)), a: [...new Set(papers.clean(x.Author).split(/\s*[;,]\s*/).map((s) => person(s.trim())).filter(Boolean))],
    journal: naming.hangulize(papers.clean(x.JournalName)), publisher: papers.clean(x.Publisher), y: py.slice(0, 4), m: py.length >= 6 && +py.slice(4, 6) ? String(+py.slice(4, 6)) : '',
    v: papers.clean(x.VolNo1), i: papers.clean(x.VolNo2), fp: pg[1] || '', lp: pg[2] || '', doi: papers.clean(x.DOI).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, ''),
    ab: tidyAb(papers.clean(x.Abstract)), kw: papers.clean(x.Keyword).split(/\s*[;,]\s*/).filter(Boolean), kind: 'ARTICLE',
    so: { cn: papers.clean(x.CN), full: web(x.FulltextURL), page: web(x.ContentURL) }, raw: x,
  };
}

/* ---------- what kind of piece: a journal's paper, another piece (그 밖의 글: a magazine's, a newspaper's, a forum's), or an
   issue's front matter ----------
   국회도서관 indexes weeklies, monthlies and newsletters with the journals and writes nothing that tells them apart (no ISSN
   comes with its rows), so the journal's name does: one KCI lists is a journal's (kci-journals.json, given by setJournals),
   as are the journals named the way scholarly ones are (…학회지, …논총, …연구, …법학, …Review); a name that says weekly,
   monthly, news … is a magazine's, and so is any other name (폴리피플, 미래한국, 프레지던트, 문학공간). KCI's own papers (and the
   index's) are always a journal's; so is a row that names no journal (nothing to tell it by). */
let KJ = null, kjGen = 0;
export function setJournals(list) {
  if (!Array.isArray(list) || !list.length || KJ) return;
  KJ = new Set(); kjGen++;
  for (const j of list) { const k = jkey(j && j.k); if (k) KJ.add(k); }
}
const MAG = /주간|월간|격주간|격월간|시사|뉴스|신문|한겨레|매거진|이코노미스트|weekly|monthly|magazine|newsweek|people|피플|입법민원/i;
const MAG_NAMES = new Set(['anda', '국회보', '신동아', '통일', '고시계', '월간조선', '시사저널', '이달의입법민원']);
// a council's or a group's plea, not a paper (국회도서관 files the 이달의 입법민원 issues' 건의문 · 결의문 · 성명서 as articles)
const PLEA = /(?:촉구\s*)?(?:건의문|건의안|결의문|결의안|성명서|촉구문|규탄문|호소문|탄원서|청원서)(?:\s*$|\s*[-–—―(（])|촉구\s*(?:건의|결의)(?:\s*$|\s*[-–—―(（])/;
const ACADEMIC = /학회|학보|논총|논집|논문|연구|학$|법학|법과|법률|판례|법$|사법|법조|법제|입법|헌법|공법|행정|정치|정의|인권|공익|선거|저스티스|정책|사회과학|저널|학술|대학|review|journal|law|studies|bulletin|quarterly|annals|proceedings/i;
const FRONT = /^[\s[(〈《「『<【]*(?:발간사|發刊辭|권두언|卷頭言|머리말|머리글|편집후기|編輯後記|축사|祝辭|인사말|간행사|刊行辭|창간사|創刊辭|책머리에|격려사|기념사)\s*(?:$|[\])〉》」』>】:：\-–—―·,]|\s+[-–—―:：])/;
// a journal of scholarship, by its name (see above)
export function scholarly(name) {
  const k = jkey(name);
  if (!k) return false;
  if (KJ && KJ.has(k)) return true;
  const h = naming.hangulize(papers.clean(name));
  if (MAG.test(h) || MAG_NAMES.has(k)) return false;
  return ACADEMIC.test(h);
}
export function magazine(name) { return !!jkey(name) && !scholarly(name); }
// 0 a journal's paper (or a thesis, a book), 1 another piece (그 밖의 글), 2 front matter (발간사, 권두언 …)
export function venue(r) {
  if (r.ver && r._vv === r.ver + ':' + kjGen) return r._vg;   // (asked again and again while a list is sorted: kept until the paper changes)
  const g = r.kind && r.kind !== 'ARTICLE' ? 0 : FRONT.test(papers.clean(r.t)) ? 2
    : r.kci || (r.srcs && (r.srcs.has('kci') || r.srcs.has('idx'))) ? 0 : (r.journal && magazine(r.journal)) || PLEA.test(papers.clean(r.t)) ? 1 : 0;
  if (r.ver) { r._vv = r.ver + ':' + kjGen; r._vg = g; }
  return g;
}

/* ---------- one paper from many rows ---------- */
const norm = papers.norm;   // letters and digits only, hanja read as Hangul, lower case
const akey = (a) => norm(String(a || '').replace(/\(.*$/, ''));   // a person's name, an affiliation written after it left off
export const jkey = (j) => norm(String(j || '').split('\u0001')[0]);
// the title without its subtitle: papers.mainTitle's (' - …', ' : …', ' = …') and the other ways the sources write one —
// '본제-부제-' with no space, '본제 (부제)', '본제 ─부제─', '본제 ~부제~'
function mainOf(t) {
  const c = papers.clean(t), m = papers.mainTitle(c);
  if (m !== c) return m;
  const x = /^(.{8,}?)\s*(?:[-―—–─~〜]\s*\S.*?[-―—–─~〜]|[(（][^()（）]{4,}[)）])\s*$/.exec(c);
  return x ? x[1].trim() : c;
}
const subOf = (t) => { const full = norm(t), main = norm(mainOf(t)); return full.startsWith(main) ? full.slice(main.length) : ''; };
// the same paper: one KCI id (two different ones never are), or one DOI, or the same title — the whole of it, or without its
// subtitle — a year apart at most and the same first author; where both give a subtitle, its start agrees too (a paper's
// 제1부 and 제2부 stay two)
function same(r, p) {
  if (r.kind && p.kind && r.kind !== p.kind) return false;   // (a thesis and the article made of it are two works)
  if (r.kci && p.kci) return r.kci === p.kci;
  if (r.doi && p.doi && r.doi.toLowerCase() === p.doi.toLowerCase()) return true;
  const whole = !!p.fk && p.fk.length >= 4 && r.fks.has(p.fk);
  if (!whole && (!p.tk || p.tk.length < 4 || !r.tks.has(p.tk))) return false;
  if (r.y && p.y && Math.abs(Number(r.y) - Number(p.y)) > 1) return false;
  const ra = akey(r.a[0]), pa = akey(p.a && p.a[0]);
  if (ra && pa && ra !== pa) return false;
  if (whole) return true;
  const sa = r.sub, sb = subOf(p.t);
  return !(sa && sb) || sa.slice(0, 4) === sb.slice(0, 4);
}
const RANK = { kci: 0, idx: 1, so: 2, nanet: 3 };   // whose word stands for the bibliographic fields: KCI's own first
const GRADE = new Map();   // a journal's KCI standing (등재, 등재후보) as KCI's answers gave it, for its papers from any source
function enrich(r, p, seq) {
  r.srcs.add(p.src);
  if (!p.relax) r.exact = true;   // (a paper the question itself found, not only one of its words: see View.relax)
  if (!r.parts[p.src]) r.parts[p.src] = p;
  const rk = RANK[p.src];
  for (const k of ['t', 'journal', 'publisher', 'y', 'm', 'v', 'i', 'fp', 'lp']) if (p[k] && (!r[k] || rk < (r.from[k] ?? 9))) { r[k] = String(p[k]); r.from[k] = rk; }
  if (p.a && p.a.length && (!r.a.length || rk < (r.from.a ?? 9))) { r.a = p.a.slice(); r.from.a = rk; }
  for (const k of ['doi', 'kci', 'o', 'url', 'grade', 'reading', 'kindName']) if (!r[k] && p[k]) r[k] = p[k];
  if (p.grade && p.journal) GRADE.set(jkey(p.journal), p.grade);
  if (!r.kind && p.kind) r.kind = p.kind;
  if ((p.ab || '').length > (r.ab || '').length) r.ab = p.ab;   // the longest abstract (the index keeps only its start)
  if (p.c != null) r.c = Math.max(r.c ?? 0, p.c);
  if (p.open) r.open = true;
  if (p.affs && p.affs.length && !(r.affs && r.affs.length)) r.affs = p.affs;
  if (p.affOf) r.affOf = { ...p.affOf, ...(r.affOf || {}) };
  if (p.kw && p.kw.length) r.kw = papers.koFirst([...new Set([...(r.kw || []), ...p.kw])]);
  if (p.so && !r.so) r.so = p.so;
  if (p.at && !r.at) r.at = p.at;
  r.tk = norm(mainOf(r.t)); r.fk = norm(r.t); r.sub = subOf(r.t);
  for (const k of [r.tk, p.tk]) if (k) r.tks.add(k);
  for (const k of [r.fk, p.fk]) if (k) r.fks.add(k);
  r.pos = Math.min(r.pos ?? seq, seq);
  r._n = null;
  r.ver = (r.ver || 0) + 1;   // (a row on screen whose paper learnt more is drawn again, in its place)
}
// a paper's journal's KCI standing: 'KCI 등재', 'KCI 등재후보', or '' when no answer told it
export function gradeOf(r) {
  const g = String(r.grade || (r.journal && GRADE.get(jkey(r.journal))) || '');
  return /후보/.test(g) ? 'KCI 등재후보' : /등재/.test(g) ? 'KCI 등재' : '';
}
class Pool {
  constructor() { this.recs = []; this.byT = new Map(); this.byId = new Map(); }
  add(p, seq) {
    p.tk = norm(mainOf(p.t || '')); p.fk = norm(p.t || '');
    let r = (p.kci && this.byId.get('k:' + p.kci)) || (p.doi && this.byId.get('d:' + p.doi.toLowerCase())) || null;
    if (r && !same(r, p)) r = null;
    if (!r) for (const c of [...(this.byT.get(p.tk) || []), ...(this.byT.get(p.fk) || [])]) if (same(c, p)) { r = c; break; }
    const fresh = !r;
    if (fresh) { r = { n: this.recs.length, srcs: new Set(), parts: {}, from: {}, a: [], t: '', c: null, open: false, tks: new Set(), fks: new Set() }; this.recs.push(r); }
    enrich(r, p, seq);
    if (r.kci) this.byId.set('k:' + r.kci, r);
    if (r.doi) this.byId.set('d:' + r.doi.toLowerCase(), r);
    // (found again by any form of its title a source gave: whole, or without its subtitle)
    for (const k of new Set([...r.tks, ...r.fks])) { const l = this.byT.get(k) || []; if (!l.includes(r)) { l.push(r); this.byT.set(k, l); } }
    return fresh;
  }
}

// (for the checks: a pool of its own, and each source's rows as parts)
export const newPool = () => new Pool();
export const partOf = { idx: fromIdx, kci: fromKci, nanet: fromNanet, so: fromSo };

/* ---------- one score of our own ----------
   The sources' own orders cannot be compared (국회도서관 ranks by its own accuracy, KCI by none, ScienceON by its own, the index
   by where the words stand), so every paper is scored the same way from what it says: each word asked counts once, where it
   says most — as an author's name 3, in the title 3, among the keywords 2, in the journal's name 1.5, in the abstract 1 (a
   long word not there whole, 정당해산, a little less for its two halves: 정당의 해산) — averaged over the words, so a paper
   holding every word comes before one holding some. Every word in the title adds 1 when they stand near one another (0.4
   when they are merely in the same title); the words in the order asked, with nothing between them or only a particle
   (선거관리위원회의 독립성), 1.5 more, with a few letters between (직업선택의 자유) 1.2, or as one of the paper's keywords 1.5;
   a question that is a journal's very name, 3 for that journal's papers (공법연구 before 토지공법연구 and titles saying it).
   The year adds at most 0.4: a tiebreak toward newer work that never outweighs a better match for a question of a few words.
   Equal scores go by date, then by title, so the order is the same on every visit whichever source answered first. */
const GLUE = /^(?:의|와|과|및|에서의|에대한|에관한|로서의|으로서의|상|상의)?$/;
// the words in s in the order asked, each at most three letters after the one before: 2 when only a particle (or nothing)
// stands between them, 1 when other letters do (직업[선택의]자유), 0 when they are not so
function together(s, ws) {
  let best = 0;
  for (let i = s.indexOf(ws[0]); i >= 0 && best < 2; i = s.indexOf(ws[0], i + 1)) {
    let pos = i + ws[0].length, glue = true, ok = true;
    for (let k = 1; k < ws.length && ok; k++) {
      const j = s.indexOf(ws[k], pos);
      if (j < 0 || j - pos > 3) ok = false;
      else { if (!GLUE.test(s.slice(pos, j))) glue = false; pos = j + ws[k].length; }
    }
    if (ok) best = Math.max(best, glue ? 2 : 1);
  }
  return best;
}
// the words near one another: all within a span a few letters longer than they are, not merely in the same title
function near(s, ws) {
  const at = ws.map((w) => s.indexOf(w));
  if (at.some((i) => i < 0)) return false;
  const from = Math.min(...at), to = Math.max(...at.map((i, k) => i + ws[k].length));
  return to - from <= ws.reduce((n, w) => n + w.length, 0) + 8;
}
// a long word not there whole, by its two halves (two letters each at least): 2 when they stand together, 1 when apart
function halves(s, w) {
  if (w.length < 4 || !s) return 0;
  let best = 0;
  for (let i = 2; i <= w.length - 2 && best < 2; i++) {
    const a = w.slice(0, i), b = w.slice(i), ia = s.indexOf(a);
    if (ia < 0 || !s.includes(b)) continue;
    const ib = s.indexOf(b, ia + a.length);
    best = Math.max(best, ib >= 0 && ib - ia - a.length <= 3 ? 2 : 1);
  }
  return best;
}
const fieldsOf = (r) => r._n || (r._n = { T: norm(r.t), A: (r.a || []).map(akey), K: (r.kw || []).map(norm).join('|'), J: norm(r.journal), B: norm(r.ab) });
const wordsOf = (q) => [...new Set(kciq.words(q).map(kciq.bare).map(norm).filter(Boolean))];
export function scorer(q) {
  const ws = wordsOf(q), whole = norm(q);
  return (r) => {
    const f = fieldsOf(r);
    let sum = 0, inT = 0;
    for (const w of ws) {
      let s = 0;
      // (a word that is one of the authors' names counts as the author, even where a title also says it: a person asked for
      // wants their papers before the interviews and reports that carry their name in the title)
      if (f.A.includes(w)) s = 3; else if (f.T.includes(w)) { s = 3; inT++; } else if (f.K.includes(w)) s = 2; else if (f.J.includes(w)) s = 1.5; else if (f.B.includes(w)) s = 1;
      else { const h = halves(f.T, w); if (h) { s = h === 2 ? 2.7 : 2.2; inT++; } else if (halves(f.K, w)) s = 1.6; else if (halves(f.B, w)) s = 0.8; }
      sum += s;
    }
    let score = ws.length ? sum / ws.length : 0;
    if (ws.length && inT === ws.length) score += ws.length === 1 || near(f.T, ws) ? 1 : 0.4;
    if (ws.length > 1 && whole.length >= 3) {
      const t = f.T.includes(whole) ? 2 : together(f.T, ws);
      if (t) score += t === 2 ? 1.5 : 1.2;
      else if (f.K.includes(whole)) score += 1.5;
      else if (together(f.K, ws)) score += 1;
      else if (f.B.includes(whole) || together(f.B, ws) === 2) score += 0.5;
    }
    if (whole.length >= 2 && f.J === whole) score += 3;
    const y = Number(r.y) || 0;
    if (y) score += 0.4 * Math.min(1, Math.max(0, (y - 1980) / 46));
    return score;
  };
}
// the words of a question, each with the other forms the shelf's synonym groups give it (terms.expand), as the score reads
// them: [['선거운동'], ['과잉금지원칙', '과잉금지', '비례원칙', '비례의원칙']]
const formsOf = (q) => kciq.words(q).map(kciq.bare).filter((w) => w.length >= 2).map((w) => [...new Set([w, ...terms.expand(w)].map(norm).filter(Boolean))]);
// a widened question's papers, by how many of its words (in any of their forms) they hold — in the title 3, among the
// subjects 2, in the abstract 1 (a long word by its two halves a little less) — the year a tiebreak
// words found in titles of every kind: never a question's point by themselves
const GENERIC = new Set(['위원회', '독립성', '필요성', '가능성', '문제점', '개선방안', '방안', '문제', '제도', '연구', '고찰', '검토', '쟁점', '과제', '현황',
  '역할', '기능', '의미', '효과', '영향', '관계', '기준', '한계', '비교', '분석', '방향', '개선', '현상', '특징', '중심', '사례', '실태', '이론', '논의']);
const generic = (w) => { const k = norm(w); return GENERIC.has(k) || (terms.isLegalTerm(w) && !terms.groupOf(w).length); };
function widerScorer(q) {
  const groups = formsOf(q);
  const best = (f, g) => { let b = 0; for (const w of g) b = Math.max(b, f.T.includes(w) || f.A.includes(w) ? 3 : f.K.includes(w) ? 2 : f.B.includes(w) ? 1 : halves(f.T, w) ? 2.2 : halves(f.K, w) ? 1.5 : 0); return b; };
  const score = (r) => {
    const f = fieldsOf(r);
    let sum = 0;
    for (const g of groups) sum += best(f, g);
    const y = Number(r.y) || 0;
    // (a law journal's paper a little before another field's holding as many words: 재량권 in 토지공법연구 before 재량권 in 정부학연구)
    return sum + (LAWJ.test(naming.hangulize(papers.clean(r.journal || ''))) ? 0.8 : 0) + (y ? 0.4 * Math.min(1, Math.max(0, (y - 1980) / 46)) : 0);
  };
  // a similar paper holds at least one of the words that say something by themselves (not GENERIC, not a common word of
  // the law), when the question has one: '위원회' alone, of '선거구획정 위원회 독립성', makes nothing similar
  const telling = groups.map((g) => !generic(g[0]));
  score.telling = (r) => { if (!telling.some(Boolean)) return true; const f = fieldsOf(r); return groups.some((g, k) => telling[k] && best(f, g) > 0); };
  return score;
}
const LAWJ = /법|판례|헌법|공법|행정|입법|선거|정당|사법|법조|저스티스|인권|law/i;
// the asks a widened question makes: with one word fewer (the shortest, most common one let go first), then two words at a
// time — each word also in its other forms (선거운동 과잉금지 · 선거운동 비례원칙 · 선관위 독립성) — then each word alone.
// 국회도서관 gets the first three, and (singles) the two longest words alone when those bring too few; this device's index
// up to twelve of them all
export function widerQuestions(q) {
  const raw = [...new Set(kciq.words(q).map(kciq.bare).filter((w) => w.length >= 2))];
  if (raw.length < 2) return { nanet: [], singles: [], idx: [] };
  const forms = raw.map((w) => [...new Set([w, ...terms.expand(w)].map((x) => String(x).trim()).filter(Boolean))]);
  const whole = norm(raw.join(''));
  const asks = [];
  const push = (ws) => { const t = ws.join(' '), k = norm(t); if (k && k !== whole && !asks.some((x) => norm(x) === k)) asks.push(t); };
  const byLen = raw.map((w, i) => i).sort((a, b) => raw[b].length - raw[a].length);
  // (two words: each in its other forms, the other as typed; more: one word fewer first, as a question of many words
  // finds nothing mostly for one too many)
  const synonyms = () => { for (let i = 0; i < raw.length; i++) for (const f of forms[i].slice(1)) push(raw.map((w, k) => (k === i ? f : w))); };
  if (raw.length > 2) for (const drop of byLen.slice().reverse()) push(raw.filter((w, k) => k !== drop));
  synonyms();
  for (let a = 0; a < byLen.length; a++) for (let b = a + 1; b < byLen.length; b++) {
    const i = byLen[a], j = byLen[b];
    for (const fi of forms[i]) for (const fj of forms[j]) if (raw.length > 2 || fi !== raw[i] || fj !== raw[j]) push(i < j ? [fi, fj] : [fj, fi]);
  }
  const pairs = asks.slice();
  // (a word alone only when it says something by itself: three letters or more, not a common word of the law (요건 · 선거 ·
  // 남용) nor a common word of any title (위원회 · 독립성 · 방안: GENERIC) — asked alone, those bring papers on anything that
  // has them; a word with other names (선관위, 과잉금지원칙) is a notion of its own)
  const alone = byLen.filter((i) => raw[i].length >= 3 && !generic(raw[i]));
  for (const i of alone) for (const f of forms[i]) push([f]);
  // (a word alone, the longest first: asked of 국회도서관 only when the others bring too few — a second round, two at most)
  const singles = alone.map((i) => raw[i]).slice(0, 2);
  return { nanet: pairs.slice(0, 3), singles, idx: asks.slice(0, 12) };
}
const rx = (s) => !!(s && s.opts && s.opts.relax);
// 을/를, 이/가 … by the word's last letter
const josa = (w, withF, without) => { const c = String(w || '').charCodeAt(String(w || '').length - 1) - 0xac00; return c >= 0 && c < 11172 && c % 28 ? withF : without; };
// the paper says every word in its title, its keywords, its authors' names or its journal's name (not only in its abstract
// or its full text, where 국회도서관 also finds them)
export function holder(q) {
  const ws = wordsOf(q);
  return (r) => {
    const f = fieldsOf(r);
    return ws.every((w) => f.T.includes(w) || f.K.includes(w) || f.A.includes(w) || f.J.includes(w) || halves(f.T, w) > 0 || halves(f.K, w) > 0);
  };
}

/* ---------- asking: each source once per question, page, kind and order, while the app is open ---------- */
const asked = new Map();   // (the last 80 answers: a KCI page keeps its records' XML, and a phone's memory is not endless)
function once(key, make) {
  if (asked.has(key)) { const p = asked.get(key); asked.delete(key); asked.set(key, p); return p; }
  const p = make();
  asked.set(key, p);
  p.catch(() => asked.delete(key));   // (a failed ask may be asked again)
  while (asked.size > 80) asked.delete(asked.keys().next().value);
  return p;
}
const wkey = (q) => kciq.words(q).join(' ') || String(q || '').trim();
const ASK = {
  idx: (q, o, page) => once(['idx', wkey(q), page, o.sort, o.journal || ''].join('\u0001'), async () => {
    if (!(await kciq.ready())) throw Object.assign(new Error('kciq'), { code: 'unavailable' });
    const r = await kciq.search(q, { sort: o.sort, journal: o.journal || -1, page, size: SIZE.idx, facets: page === 1 && !o.journal && !o.relax });
    // (with the first page, how many of the whole answer each journal holds: the index knows it without reading a row)
    const jf = r.jFacet && r.jFacet.length ? r.jFacet.map(([ji, n]) => [(r.journals[ji] || [''])[0], n]).filter((x) => x[0]) : null;
    return { total: r.total, rows: r.rows.map(fromIdx), common: r.common, jf };
  }),
  // (o.author: a person's papers on o.topic — see nanetBy)
  nanet: (q, o, page) => (o.author ? nanetBy(o, page) : papers.search(q, { kind: o.kind, page, sort: o.sort === 'new' ? 'new' : '' }).then((r) => ({ total: r.total, rows: r.rows.map(fromNanet) }))),
  // (o.author: a person's papers — KCI asked by that author's name alone; a KCI that will not take a question without a
  // title refuses it, and then only that way of asking is left alone for this session, never KCI itself. With o.topic, that
  // person's papers whose title has the topic: KCI asked for both, which it ANDs)
  kci: (q, o, page) => once(['kci', wkey(q), page, o.sort, o.journal || '', o.author || '', o.topic || ''].join('\u0001'), async () => {
    const alone = o.author && !o.topic;
    if (alone && kciNoAuthor) throw Object.assign(new Error('kci author'), { code: 'no_term' });
    const params = o.author ? { author: o.author, ...(o.topic ? { title: String(o.topic).trim().slice(0, 200) } : {}), page: String(page), displayCount: String(SIZE.kci) } : { title: String(q).trim().slice(0, 200), page: String(page), displayCount: String(SIZE.kci) };
    if (o.sort === 'new') { params.sortNm = 'pubiYr'; params.sortDir = 'desc'; }
    if (o.journal) params.journal = o.journal;
    let r;
    try { r = kciParse(await api.kciSearch(params, { mark: !o.author })); } catch (e) {
      if (alone && (e.code === 'kci_refused' || e.code === 'no_term')) { kciNoAuthor = true; e.code = 'no_term'; }
      else api.markSource('kci', e);
      throw e;
    }
    return { total: r.total, rows: r.rows.map(fromKci) };
  }),
  // (o.term: asked for that instead of the question — an author's name, field AU; with o.topic, only that author's papers
  // holding the topic's words are kept)
  so: (q, o, page) => once(['so', wkey(q), page, o.sort, o.field || '', o.term || '', o.topic || ''].join('\u0001'), async () => {
    const d = await api.scienceon('search', { q: String(o.term || q).trim().slice(0, 200), field: o.field || 'BI', page: String(page), rows: String(SIZE.so), ...(o.sort === 'new' ? { sort: 'pubyear' } : {}) });
    const all = ((d && d.rows) || []).map(fromSo).filter((x) => x.t), total = Number(d && d.total) || 0;
    if (!o.topic) return { total, rows: all };
    const rows = all.filter((x) => (!o.term || x.a.some((a) => akey(a) === o.term)) && topicHolds(x, o.topic));
    return { rows, kept: true, more: all.length > 0 && page * SIZE.so < total };
  }),
};
// a paper (one source's row) that holds every word of a topic — in its title, keywords, abstract, authors or journal, or a
// long word by its two halves in its title or keywords ('공법상 계약' in 「공법상계약의 해지」)
function topicHolds(p, topic) {
  const ws = wordsOf(topic).filter((w) => w.length >= 2);
  if (!ws.length) return true;
  const T = norm(p.t), K = (p.kw || []).map(norm).join('|'), B = norm(p.ab), A = (p.a || []).map(akey), J = norm(p.journal);
  return ws.every((w) => T.includes(w) || K.includes(w) || B.includes(w) || A.includes(w) || J.includes(w) || halves(T, w) > 0 || halves(K, w) > 0);
}
// 국회도서관 for a person's papers on a topic: asked by the author (its author search, newest first), those of exactly that name
// and holding every word of the topic kept — a page holding none goes on to the next, three pages a time at most. `seen`: a
// paper of exactly that author came back (so the word is a person's name, whatever the topic)
async function nanetBy(o, page) {
  let p = page - 1, more = true, seen = false;
  const rows = [];
  while (more && !rows.length && p < page + 2) {
    p++;
    const r = await papers.search(o.author, { kind: o.kind, page: p, sort: 'new', by: 'author' });
    const theirs = r.rows.map(fromNanet).filter((x) => x.a.some((a) => akey(a) === o.author));
    if (theirs.length) seen = true;
    rows.push(...theirs.filter((x) => topicHolds(x, o.topic)));
    more = r.rows.length > 0 && p * SIZE.nanet < r.total;
  }
  return { rows, kept: true, more, page: p, seen };
}
let kciNoAuthor = false;
// a refusal (no key yet, the source says no) or a question it will not take: not asked again for this question
const REFUSED = new Set(['no_key', 'kci_refused', 'scienceon', 'scienceon_token', 'auth', 'no_server', 'no_term', 'bad_service']);
export const refused = (e) => !!e && REFUSED.has(e.code);

/* ---------- a question: its sources and the papers they gave ---------- */
class Feed {
  constructor(q, kind) {
    Object.assign(this, { q, kind, pool: new Pool(), srcs: new Map(), seq: 0, views: new Map(), hear: new Set(), facet: null });
  }
  source(id, base, opts) {   // a source of this question (asked from its first page as soon as a view wants it)
    if (!this.srcs.has(id)) this.srcs.set(id, { id, base, opts, page: 0, total: 0, more: true, state: 'idle', err: null, common: false, p: null });
    return this.srcs.get(id);
  }
  pull(s) {   // its next page
    if (s.state === 'busy') return s.p;
    if (!s.more || (s.state === 'err' && refused(s.err))) return Promise.resolve();
    const page = s.page + 1;
    s.state = 'busy';
    return (s.p = ASK[s.base]((s.opts && s.opts.rq) || this.q, { ...s.opts, kind: this.kind }, page).then((r) => {
      const rows = r.rows || [];
      // (r.kept: only some of what the source gave are this question's — a person's papers on a topic — so its count is of
      // those kept so far, and the source says itself whether it has more, and up to which page it read)
      s.page = r.page || page; s.total = r.kept ? s.total + rows.length : Math.max(s.total, Number(r.total) || 0); s.state = 'ok'; s.err = null; s.common = !!r.common;
      if (r.jf) s.jf = r.jf;
      if (r.seen) s.seen = true;
      s.more = r.more != null ? !!r.more : rows.length > 0 && page * SIZE[s.base] < s.total;
      for (const p of rows) this.pool.add(rx(s) ? { ...p, relax: true } : p, this.seq++);
      this.tell(s);
    }, (e) => { s.state = 'err'; s.err = e; this.tell(s); }));
  }
  tell(s) { for (const fn of [...this.hear]) { try { fn(s); } catch (e) { /* a listener's own trouble */ } } }
}
const feeds = new Map();   // the last few questions, kept as they were (going back shows them as they were left)
export function feed(q, kind) {
  const key = [wkey(q), kind].join('\u0001');
  let f = feeds.get(key);
  if (f) { feeds.delete(key); feeds.set(key, f); return f; }
  f = new Feed(q, kind);
  feeds.set(key, f);
  while (feeds.size > 12) feeds.delete(feeds.keys().next().value);
  return f;
}

/* ---------- a view of a question: one order (관련도·최신·피인용), maybe one journal, and what has been shown, in order ----------
   The papers come in groups, each after the one before and never mixed: a journal's papers (a person's own first, newest
   first, when the question is that person), then magazine pieces, then front matter — and in 최신, the papers that say the
   words only in their abstract or text after those that say them in the title or keywords. A later group is held back while
   a source may still give papers of an earlier one (its next page), so 더 보기 never puts a journal's paper below a magazine's;
   in 피인용, the papers whose citations no source counts (국회도서관's, ScienceON's) come after the counted ones. */
const ORDER = {
  rel: (sc) => (a, b) => sc(b) - sc(a),
  new: (sc) => (a, b) => ym(b) - ym(a) || sc(b) - sc(a),
  cited: (sc) => (a, b) => (b.c ?? -1) - (a.c ?? -1) || sc(b) - sc(a),
};
const ym = (r) => (Number(r.y) || 0) * 100 + (Number(r.m) || 0);
const tie = (a, b) => ym(b) - ym(a) || (a.fk < b.fk ? -1 : a.fk > b.fk ? 1 : 0) || a.pos - b.pos;
const PERSON = /^[가-힣]{2,5}$/;
// a word among others that may be a person's name: two or three letters beginning as a Korean surname does, or four beginning
// with a two-letter one (남궁, 선우 …) — only ever tried as a name, never taken for one until some answer says so. Scholars'
// names end as the words of the law do too (김중권, 윤재학, 박종권) and some have two letters (허영), so probe() asks for those
// as well; but the screen offers '…의 글에서 … 찾기' (hint) only for a word that does not read as a word (WORDLIKE: 정당법,
// 기본권, 정치학, 선거), unless an answer has shown that it is someone's
// (never a word of the law: 남용, 일탈, 처분, 재량 … — terms.isLegalTerm — are words, whatever surname they begin with)
const NAMELIKE = (w) => /^[가-힣]{2,4}$/.test(w) && !terms.isLegalTerm(w) && (w.length === 4 ? /^(?:남궁|선우|독고|제갈|황보|사공|서문|동방|어금|망절)/.test(w) : naming.isSurnameStart(w));
const WORDLIKE = (w) => w.length === 2 || /[법론적의권률령칙학]$/.test(w);
// the names the app knows for people's (the owner's, the shelf's authors): setPeople, from the screen
const PEOPLE = new Set();
export function setPeople(names) { for (const n of names || []) { const k = String(n || '').replace(/\s+/g, ''); if (/^[가-힣]{2,4}$/.test(k)) PEOPLE.add(k); } }
class View {
  constructor(f, sort, journal, idxJournals) {
    Object.assign(this, { f, sort, j: journal ? jkey(journal) : '', jname: journal ? String(journal).split('\u0001')[0] : '', shown: [], set: new Set(), who: '', addedAt: 0 });
    const sc = scorer(f.q), memo = new Map(), holds = holder(f.q), wide = widerScorer(f.q), wmemo = new Map();
    this.holds = holds;
    this.score = (r) => { if (!memo.has(r) || memo.get(r)[1] !== r._n) { const v = sc(r); memo.set(r, [v, r._n]); } return memo.get(r)[0]; };
    this.wide = (r) => { if (!wmemo.has(r) || wmemo.get(r)[1] !== r._n) { const v = wide(r); wmemo.set(r, [v, r._n, wide.telling(r)]); } return wmemo.get(r)[0]; };
    this.wideHeld = (r) => { this.wide(r); return wmemo.get(r)[2]; };   // (holds a word that says something: see widerScorer)
    const by0 = ORDER[sort](this.score);
    // the level of a paper: 0 the question's own (a journal's paper), 1 a similar paper (found only when the question was
    // widened, holding some of its words: View.relax), 2 another piece (그 밖의 글), 3 front matter
    this.lv = (r) => { const v = venue(r); if (v === 2) return 3; if (this.relaxed && !r.exact && !holds(r)) return v === 0 ? 1 : 2; return v === 0 ? 0 : 2; };
    // the group: [level, not the person's own, said only in the abstract (최신) / no citation count (피인용)] as one number
    this.g = (r) => this.lv(r) * 4 + (this.who && !this.own(r) ? 2 : 0) + (sort === 'new' ? (holds(r) ? 0 : 1) : sort === 'cited' ? (r.c == null ? 1 : 0) : 0);
    // (a person's own papers newest first — but those on a topic asked with the name by how well they hold it; similar
    // papers by how many of the words they hold, title before subjects before abstract)
    this.cmp = (a, b) => this.g(a) - this.g(b) || (sort === 'rel' && this.who && !this.topic && this.own(a) ? ym(b) - ym(a) : 0) || (sort !== 'new' && this.lv(a) === 1 ? this.wide(b) - this.wide(a) : 0) || by0(a, b) || tie(a, b);
    const kind = f.kind, art = kind === 'ARTICLE' || kind === '';
    const by = this.by = sort === 'new' ? 'new' : 'rel';   // (피인용 orders the same answers as 관련도: nothing more is asked of the servers)
    this.ids = [];
    if (art) this.add('idx:' + by, 'idx', { sort: by });
    if (art && sort === 'cited') this.add('idx:cited', 'idx', { sort: 'cited' });   // (the index knows the most cited of its own at once)
    this.add('nanet:' + by, 'nanet', { sort: by });
    if (art) this.add('kci:' + by, 'kci', { sort: by });
    if (art) this.add('so:' + by, 'so', { sort: by });
    if (this.j && art) {   // one journal: asked of KCI and the index for that journal alone, so its list is whole there
      this.add('kci:' + by + ':j:' + this.j, 'kci', { sort: by, journal: this.jname });
      for (const [nm, pb] of idxJournals || []) if (jkey(nm) === this.j) this.add('idx:' + by + ':j:' + nm + '\u0001' + pb, 'idx', { sort: by, journal: nm + '\u0001' + (pb || '') });
    }
    f.hear.add(() => { if (f.cur === this) { this.person(); this.relax(); } });   // (before the screen hears of an answer: see person())
  }
  add(id, base, opts) { this.f.source(id, base, opts); if (!this.ids.includes(id)) this.ids.push(id); }
  get srcs() { return this.ids.map((id) => this.f.srcs.get(id)); }
  keep(r) {
    if (this.j && jkey(r.journal) !== this.j) return false;
    // (what only a widened ask found: a journal's paper holding some of the words in its title, subjects or abstract — one
    // that says something by itself among them — not a magazine's piece, nor one that has them only in its full text)
    if (this.relaxed && !r.exact && (venue(r) !== 0 || this.wide(r) < 1 || !this.wideHeld(r))) return false;
    const k = this.f.kind;
    if (k && k !== 'ARTICLE') return r.kind === k;
    if (k === 'ARTICLE') return !r.kind || r.kind === 'ARTICLE';
    return true;
  }
  own(r) { return !!this.who && (r.a || []).some((a) => akey(a) === this.who); }
  // a person asked: some paper here was written by someone of exactly that name (선거 never is; 임지봉 is). Their own papers
  // come first from then on, and KCI and ScienceON are asked for that author too (asked by title, they give the interviews
  // and reports with the name in it). The view hears of each answer before the screen does, so these are asked at once.
  person() {
    if (this.who) return this.who;
    const w = String(this.f.q || '').replace(/\s+/g, '');
    const ws = String(this.f.q || '').trim().split(/\s+/).filter(Boolean);
    const theirs = (x) => this.f.pool.recs.some((r) => (r.a || []).some((a) => akey(a) === x));
    if (ws.length > 1 && !(PERSON.test(w) && theirs(w))) return this.named(ws, theirs);
    if (!PERSON.test(w) || !theirs(w)) return '';
    this.who = w;
    if ((this.f.kind === 'ARTICLE' || this.f.kind === '') && !this.j) {
      this.add('kci:au:' + this.by, 'kci', { sort: this.by, author: w });
      this.add('so:au:' + this.by, 'so', { sort: this.by, field: 'AU' });
      this.addedAt = Date.now();
      for (const s of this.srcs) if (s.state === 'idle') this.f.pull(s);
    }
    return w;
  }
  /* A person among other words ('김대인 공법상 계약'): no catalogue finds it asked as words — no title holds a name — so the
     name is asked as the author and the rest as the topic (split). A word is taken for a name once an answer here has a paper
     of exactly that author (a source asked for that author by probe() included), or the app knows it for a person's
     (setPeople: the owner, the shelf's authors). Their papers on the topic come first; others' under them. */
  named(ws, theirs) {
    if (this.j || !(this.f.kind === 'ARTICLE' || this.f.kind === '')) return '';
    const probed = this.srcs.find((s) => s.opts && s.opts.probe && s.seen);
    const w = probed ? probed.opts.author : ws.find((x) => /^[가-힣]{2,4}$/.test(x) && (PEOPLE.has(x) || theirs(x)));
    if (!w || w === this.notName) return '';
    this.split(w);
    return w;
  }
  split(w) {
    if (this.who || w === this.notName) return;
    const ws = String(this.f.q || '').trim().split(/\s+/).filter(Boolean), topic = ws.filter((x) => x !== w).join(' ');
    this.who = w; this.topic = topic;
    this.add('nanet:by:' + w, 'nanet', { author: w, topic });
    this.add('kci:by:' + this.by + ':' + w, 'kci', { sort: this.by, author: w, topic });
    this.add('so:by:' + this.by + ':' + w, 'so', { sort: this.by, field: 'AU', term: w, topic });
    this.addedAt = Date.now();
    for (const s of this.srcs) { if (s.state === 'err' && !refused(s.err)) s.state = 'idle'; if (s.state === 'idle') this.f.pull(s); }   // (one that failed on the way, asked again)
  }
  // nothing found holds every word, and the first or last word could be a name: is it someone's? The KCI index on this device
  // is asked first (its authors are in it: no server asked); then 국회도서관 for that author's papers on the rest — its answer
  // decides (named). Once a question, two words at most; true when it asked anything (the screen waits for it)
  async probe() {
    const named = await this.probeName();
    return this.relax() || named;
  }
  // what probeName would ask about: the first or last of two words or more, read as a name, with nothing holding every word
  mayBeName() {
    if (this.j || !(this.f.kind === 'ARTICLE' || this.f.kind === '')) return false;
    const ws = String(this.f.q || '').trim().split(/\s+/).filter(Boolean);
    if (ws.length < 2) return false;
    const holds = holder(this.f.q);
    if (this.f.pool.recs.some((r) => this.keep(r) && holds(r))) return false;
    return [ws[0], ws[ws.length - 1]].some(NAMELIKE);
  }
  async probeName() {
    if (this.who || this.probed || this.j || !(this.f.kind === 'ARTICLE' || this.f.kind === '')) return false;
    const ws = String(this.f.q || '').trim().split(/\s+/).filter(Boolean);
    if (ws.length < 2) return false;
    const holds = holder(this.f.q);
    if (this.f.pool.recs.some((r) => this.keep(r) && holds(r))) return false;
    const cands = [...new Set([ws[0], ws[ws.length - 1]])].filter(NAMELIKE).sort((a, b) => WORDLIKE(a) - WORDLIKE(b));   // (a word that reads as a name first)
    if (!cands.length) return false;
    this.probed = true;
    for (const w of cands) {
      const r = await kciq.search(w, { size: 20 }).catch(() => null);
      if (r && (r.rows || []).some((x) => (x.a || []).some((a) => akey(a) === w))) { PEOPLE.add(w); this.split(w); return true; }
    }
    for (const w of cands) this.add('nanet:by:' + w, 'nanet', { author: w, topic: ws.filter((x) => x !== w).join(' '), probe: true });
    this.addedAt = Date.now();
    for (const s of this.srcs) if (s.state === 'idle') this.f.pull(s);
    return true;
  }
  // what the screen may offer when nothing was found: that person's papers on the rest ('김대인의 글에서 공법상 계약 찾기') —
  // while the question is not so split and no probe has said the word is no one's (국회도서관 asked, and none of that name)
  hint() {
    if (this.who || this.j || !(this.f.kind === 'ARTICLE' || this.f.kind === '')) return null;
    const ws = String(this.f.q || '').trim().split(/\s+/).filter(Boolean);
    if (ws.length < 2) return null;
    const w = [ws[0], ws[ws.length - 1]].find((x) => NAMELIKE(x) && !WORDLIKE(x) && !this.srcs.some((s) => s.opts && s.opts.probe && s.opts.author === x && s.state === 'ok'));
    return w ? { who: w, topic: ws.filter((x) => x !== w).join(' ') } : null;
  }
  force(w) { if (!this.who && String(this.f.q || '').trim().split(/\s+/).includes(w)) this.split(w); }   // (the offer taken)
  /* Few papers hold every word (fewer than 10, the question of two words or more): the question is widened — asked again
     of 국회도서관 (three asks at most) and of this device's KCI index (as many as it takes: nothing is sent) with fewer of its
     words, and with the other forms the shelf's synonym groups give them (terms.expand: 과잉금지원칙 ↔ 비례원칙, 선관위 ↔
     선거관리위원회). What only those asks found comes after the question's own papers, under '여기부터 비슷한 논문', ordered
     by how many of the words each holds (title, then subjects, then abstract). Once a view, when every source asked for
     the question itself has answered; a person's papers on a topic are widened only when that person has none on it.
     True when it asked anything (the screen waits a little for it). */
  relax() {
    if (this.j || !(this.f.kind === 'ARTICLE' || this.f.kind === '')) return false;
    if (this.relaxed) return this.relaxMore();
    if (wordsOf(this.f.q).length < 2) return false;
    // (the library asked for the question itself has answered — the others may still come: what they bring joins the
    // question's own papers above)
    const lib = this.srcs.filter((s) => s.base === 'nanet' && !rx(s) && !(s.opts && (s.opts.author || s.opts.probe)));
    if (!lib.length || lib.some((s) => s.state === 'busy' || s.state === 'idle')) return false;
    if (this.srcs.some((s) => s.opts && (s.opts.author || s.opts.probe) && (s.state === 'busy' || s.state === 'idle'))) return false;
    if (this.who && (!this.topic || this.f.pool.recs.some((r) => this.keep(r) && this.own(r)))) return false;
    // (a word that may be a name, nothing holding every word, and the name not asked about yet — '김대인 공법상 계약': the
    // probe decides first (probe() asks it, then widens if it must), so a person's papers on a topic are not widened into
    // the papers holding the name or the topic alone)
    if (!this.who && !this.probed && this.mayBeName()) return false;
    if (this.f.pool.recs.filter((r) => this.keep(r) && r.exact && venue(r) === 0).length >= 10) return false;
    const qs = widerQuestions(this.f.q);
    if (!qs.nanet.length && !qs.singles.length && !qs.idx.length) return false;
    this.relaxed = 1;
    this.later = qs.nanet.length ? qs.singles : [];
    for (const q of qs.nanet.length ? qs.nanet : qs.singles) this.add('nanet:rx:' + q, 'nanet', { relax: true, rq: q, sort: 'rel' });
    for (const q of qs.idx) this.add('idx:rx:' + q, 'idx', { relax: true, rq: q, sort: 'rel' });
    this.addedAt = Date.now();
    for (const s of this.srcs) if (s.state === 'idle') this.f.pull(s);
    return true;
  }
  // (the second round: the first widened asks all answered and brought fewer than ten similar papers — the longest words
  // asked alone)
  relaxMore() {
    if (this.relaxed !== 1 || !this.later || !this.later.length) return false;
    if (this.srcs.some((s) => rx(s) && (s.state === 'busy' || s.state === 'idle'))) return false;
    if (this.f.pool.recs.filter((r) => this.keep(r) && this.lv(r) === 1).length >= 10) { this.relaxed = 2; return false; }
    this.relaxed = 2;
    for (const q of this.later) this.add('nanet:rx:' + q, 'nanet', { relax: true, rq: q, sort: 'rel' });
    this.addedAt = Date.now();
    for (const s of this.srcs) if (s.state === 'idle') this.f.pull(s);
    return true;
  }
  // a word taken for a person's name whose papers on the rest came to none: shown with what the words alone give, and a
  // line the screen may offer — '‘남용’을 사람 이름으로 찾았습니다 · 낱말로 다시 찾기' (null when there is nothing to say)
  nameNote() {
    if (!this.who || !this.topic || PEOPLE.has(this.who)) return null;   // (one the app knows for a person: a person)
    const by = this.srcs.filter((s) => /^(?:nanet|kci|so):by:/.test(s.id));
    if (!by.length || by.some((s) => s.state === 'busy' || s.state === 'idle') || this.f.pool.recs.some((r) => this.keep(r) && this.own(r))) return null;
    return { who: this.who, text: `‘${this.who}’${josa(this.who, '을', '를')} 사람 이름으로 찾았습니다`, again: '낱말로 다시 찾기' };
  }
  // … and taken: the word is a word again (for this question), the person's own sources left, the question widened
  unsplit() {
    if (!this.who || !this.topic) return false;
    this.notName = this.who; this.who = ''; this.topic = '';
    this.ids = this.ids.filter((id) => !/^(?:nanet|kci|so):by:/.test(id));
    this.reset();
    this.relax();
    return true;
  }
  // the sources asked (first pages), those that failed for a passing reason asked again: resolves at once
  start() {
    this.f.cur = this;
    for (const s of this.srcs) {
      if (s.state === 'err' && !refused(s.err)) s.state = 'idle';
      if (s.state === 'idle') this.f.pull(s);
    }
    this.person();
  }
  // until every source has answered, or `ms` have passed (a little longer for the sources a person's name added on the way)
  // — and, with none answered by then, until one has
  async settle(ms, fill = PAGE, cap = 6000) {
    const t0 = Date.now();
    const pend = () => this.srcs.filter((s) => s.state === 'busy').map((s) => s.p);
    for (;;) {
      const until = Math.max(t0 + ms, this.addedAt ? Math.min(this.addedAt + 1200, t0 + ms + 1200) : 0), p = pend(), wait = until - Date.now();
      if (!p.length || wait <= 0) break;
      await Promise.race([Promise.allSettled(p), new Promise((ok) => setTimeout(ok, wait))]);
    }
    while (!this.srcs.some((s) => s.state === 'ok') && pend().length) await Promise.race(pend().map((p) => p.then(() => 0, () => 0)));
    // the library (국회도서관, the source that holds every year) still answering while what came would not fill a page: a
    // little longer for it (up to `cap` in all) — a list of two rows drawn first reads as 'nothing found'
    const lib = () => this.srcs.filter((s) => s.base === 'nanet' && s.state === 'busy').map((s) => s.p);
    for (;;) {
      const wait = t0 + cap - Date.now(), p = lib();
      if (!p.length || wait <= 0 || this.avail().length >= fill) break;
      await Promise.race([Promise.allSettled(p), new Promise((ok) => setTimeout(ok, wait))]);
    }
  }
  // a source paged on in this view: every one, or in one journal's view those asked for that journal, and 국회도서관 (asked
  // for the words alone: its papers of that journal are kept) — and the index when it does not know the journal by name
  pageable(s) {
    if (!this.j || /:j:/.test(s.id)) return true;
    return s.base === 'nanet' || (s.base === 'idx' && !this.ids.some((id) => id.startsWith('idx:') && /:j:/.test(id)));
  }
  live(s) { return this.pageable(s) && s.more && !(s.state === 'err' && refused(s.err)); }   // may still give papers
  held(g) { return g >= 2 || (this.sort === 'new' && g % 2 === 1); }   // a group kept for after the ones before it
  left(hidden) { return this.f.pool.recs.filter((r) => !this.set.has(r) && this.keep(r) && !(hidden && hidden(r))); }
  // what may be shown now: a held group only once no source can give more of the groups before it
  // (a source asked for the question itself, that is: what the widened asks bring holds nothing back — nor does a name's
  // probe that found no one of that name)
  avail(hidden) { const l = this.left(hidden); return this.srcs.some((s) => this.live(s) && !rx(s) && !(s.opts && s.opts.probe && !s.seen)) ? l.filter((r) => !this.held(this.g(r))) : l; }
  next(n, hidden, all) {   // the next n papers in this view's order (shown from now on in this place)
    const out = (all ? this.left(hidden) : this.avail(hidden)).sort(this.cmp).slice(0, n);
    for (const r of out) { this.shown.push(r); this.set.add(r); }
    return out;
  }
  peek(n, hidden) { return this.avail(hidden).sort(this.cmp).slice(0, n); }   // … the same, without showing them
  reset() { this.shown = []; this.set = new Set(); }
  // 더 보기: the sources that have little left to show (and more to give) give their next page first — a page that failed is
  // asked again — for a few rounds while what they give is held back; a late answer joins the papers still to come.
  // `failed`: nothing came because a source could not be reached (the screen says so, and asks again on the next tap).
  async more(n, hidden, ms = 4000) {
    const until = Date.now() + ms, failed = new Set();
    for (let round = 0; round < 3; round++) {
      const av = this.avail(hidden), wait = until - Date.now();
      if (av.length >= n || wait <= 0) break;
      const want = this.srcs.filter((s) => this.live(s) && !failed.has(s) && (s.page > 0 || s.state === 'err') && av.filter((r) => r.srcs.has(s.base)).length < n);
      if (!want.length) break;
      await Promise.race([Promise.allSettled(want.map((s) => this.f.pull(s))), new Promise((ok) => setTimeout(ok, wait))]);
      for (const s of want) if (s.state === 'err') failed.add(s);
      if (want.some((s) => s.state === 'busy')) break;   // (still being answered: it joins the papers to come)
      if (this.avail(hidden).length > av.length) break;   // (one page a tap, as long as it brings something to show)
    }
    let out = this.next(n, hidden);
    // (nothing of the groups before is coming now, though a source has pages left — only more of the held ones: shown)
    if (!out.length && !failed.size && !this.srcs.some((s) => s.state === 'busy')) out = this.next(n, hidden, true);
    this.failed = !out.length && failed.size > 0;
    return out;
  }
  hasMore(hidden) { return this.left(hidden).length > 0 || this.srcs.some((s) => this.live(s) && s.page > 0); }
  // how many papers the answer holds, as far as can be told: the largest count a source gave (the others are mostly the
  // same papers again), never less than what is here; `more` when several sources found some (so there may be more), or
  // when, in one journal's view, the count is only of the pages fetched so far
  // n counts them all (the denominator of '더 보기 · 22 / 39'); exact: the question's own papers, sim: the similar ones (a
  // widened question), other: 그 밖의 글 — countLine() says it as one line ('2편 · 비슷한 논문 37편', '33편 이상 · 그 밖의 글 4편')
  count(hidden) {
    const got = this.srcs.filter((s) => s.page > 0 && !rx(s) && !(s.state === 'err' && refused(s.err)) && (!this.j || /:j:/.test(s.id)));
    const here = this.shown.length + this.left(hidden).length;
    const lvs = this.f.pool.recs.filter((r) => this.keep(r) && !(hidden && hidden(r))).map((r) => this.lv(r));
    const sim = lvs.filter((x) => x === 1).length, other = lvs.filter((x) => x === 2).length;
    // (그 밖의 글 apart: a source's own count holds them too, so those here are taken from it)
    const exact = Math.max(0, here - sim - other, ...got.map((s) => s.total - other));
    const several = !this.j && new Set(got.filter((s) => s.total > 0).map((s) => s.base)).size > 1;
    const partial = !!this.j && this.srcs.some((s) => this.pageable(s) && !/:j:/.test(s.id) && s.more);
    return { n: exact + sim + other, exact, sim, other, more: several || partial };
  }
  countLine(hidden) {
    const k = this.count(hidden);
    if (!k.n) return '';
    return [`${k.exact.toLocaleString()}편${k.more ? ' 이상' : ''}`, k.sim ? `비슷한 논문 ${k.sim.toLocaleString()}편` : '', k.other ? `그 밖의 글 ${k.other.toLocaleString()}편` : ''].filter(Boolean).join(' · ');
  }
  state(base) { const l = this.srcs.filter((s) => s.base === base); return l.find((s) => s.state === 'ok') || l.find((s) => s.state === 'busy') || l[0] || null; }
  hasCites() { return this.f.pool.recs.some((r) => r.c != null && this.keep(r)); }
  // the line above a group of rows (none above the first): '' for a journal's papers
  label(g) {
    const v = g >> 2;
    if (v === 3) return '발간사 · 권두언';
    if (v === 2) return '그 밖의 글';
    if (v === 1) return '여기부터 비슷한 논문';
    if (g & 2) return '다른 저자의 글';
    if (g & 1) return this.sort === 'new' ? '초록 · 본문에만 나오는 글' : this.sort === 'cited' ? '피인용 정보 없음' : '';
    return '';
  }
  groupCount(g, hidden) { return this.f.pool.recs.filter((r) => this.keep(r) && !(hidden && hidden(r)) && this.lv(r) === g >> 2).length; }
  // the whole line above a group, as the screen may show it
  groupLine(g, hidden) {
    const v = g >> 2;
    if (v === 1) return '여기부터 비슷한 논문 · 낱말 일부가 든 순서';
    if (v >= 2) return `${this.label(g)} ${this.groupCount(g, hidden).toLocaleString()}편`;
    return this.label(g);
  }
}
export function view(f, sort, journal, idxJournals) {
  const key = sort + '\u0001' + jkey(journal || '');
  if (!f.views.has(key)) f.views.set(key, new View(f, sort, journal, idxJournals));
  return f.views.get(key);
}
// the journals of an answer, most papers first: [{ name, n }] (two at least, each with two papers or more) — counted over the
// papers given so far, and, for the journals of this device's index, over the index's whole answer (whichever is more)
export function journalsOf(f, hidden) {
  const out = [...journalCounts(f, hidden).values()].filter((e) => e.n >= 2).sort((a, b) => b.n - a.n).map((e) => ({ name: [...e.names.entries()].sort((a, b) => b[1] - a[1])[0][0], n: e.n }));
  return out.length >= 2 ? out : [];
}
// … and each journal's count by its key, for the numbers on the row of journals to follow 더 보기 (their places stay)
export function journalCounts(f, hidden) {
  const t = new Map();
  const note = (name, n) => {
    const k = jkey(name); if (!k) return null;
    const e = t.get(k) || { n: 0, idx: 0, names: new Map() };
    e.names.set(name, (e.names.get(name) || 0) + n);
    t.set(k, e);
    return e;
  };
  for (const r of f.pool.recs) {
    if (!r.journal || !r.exact || (hidden && hidden(r)) || (r.kind && r.kind !== 'ARTICLE')) continue;
    const e = note(r.journal, 1); if (e) e.n++;
  }
  for (const s of f.srcs.values()) if (s.base === 'idx' && s.jf && !/:j:/.test(s.id) && !rx(s)) for (const [name, n] of s.jf) { const e = note(name, 0); if (e) e.idx = Math.max(e.idx, n); }
  for (const e of t.values()) e.n = Math.max(e.n, e.idx);
  return t;
}

/* ---------- 국회입법조사처 보고서 (nars.js): a section under the papers, by the words of their titles — loaded only when
   asked, so the papers never wait for it (and a device whose offline copy lacks the file still finds papers) ----------
   narsSection(sec, q, ui): sec an empty <section> (it stays hidden when nothing is found); ui { upload(files), toast(msg),
   mine?(title), live?() }. narsForLaw(name, { aliases }): the reports whose title names that law, for 법령. */
export const narsSection = (sec, q, ui) => import('./nars.js?v=aedca5545d').then((m) => m.mount(sec, q, ui), () => 0);
export const narsForLaw = (name, opts) => import('./nars.js?v=aedca5545d').then((m) => m.forLaw(name, opts));

/* ---------- 8차: papers about a case (평석) ----------
   aboutCase(no, { shelf }) → Promise<rows[]>: the papers that name the case number (2003두1684, 2007헌마1001) — 국회도서관
   asked for the number, and the KCI index on this device read for it (its title and the start of its abstract, the number
   written as one word or spaced: '2003두1684', '2003 두 1684', '2003두 1684'). One record a paper, as the views give them
   (t, a, journal, y, m, v, i, fp, lp, kci, doi, url, srcs …), at most 20; shelf(rec) → true marks a paper on the shelf
   (onShelf), those first, then the newest. Never rejects: [] when nothing is found, offline, or a source refuses. */
const about = new Map();
const caseRe = (no) => { const m = /^(\d{2,4})([가-힣]{1,3})(\d{1,7})$/.exec(no); return m ? new RegExp(`(?<!\\d)${m[1]}\\s*${m[2].split('').join('\\s*')}\\s*${m[3]}(?!\\d)`) : null; };
export function aboutCase(no, { shelf = null } = {}) {
  const key = String(no || '').replace(/\s+/g, '');
  if (!key) return Promise.resolve([]);
  if (!about.has(key)) {
    const p = (async () => {
      const pool = new Pool();
      let seq = 0;
      const re = caseRe(key);
      const [lib, idx] = await Promise.all([
        papers.search(key, { kind: 'ARTICLE', page: 1 }).catch(() => null),
        re ? kciq.rowsHolding((x) => re.test(x.t) || re.test(x.ab)).catch(() => []) : Promise.resolve([]),
      ]);
      for (const x of idx || []) pool.add(fromIdx(x), seq++);
      for (const x of (lib && lib.rows) || []) pool.add(fromNanet(x), seq++);
      return pool.recs.filter((x) => x.t);
    })().catch(() => []);
    about.set(key, p);
    p.then((rows) => { if (!rows.length) about.delete(key); });   // (none: asked again the next time, the source may answer then)
  }
  return about.get(key).then((rows) => rows.map((x) => ({ ...x, onShelf: !!(shelf && safe(() => shelf(x))) }))
    .sort((a, b) => Number(b.onShelf) - Number(a.onShelf) || ym(b) - ym(a)).slice(0, 20));
}
const safe = (fn) => { try { return fn(); } catch (e) { return false; } };

/* ---------- 8차: a researcher's works, merged and grouped ----------
   researcherWorks(name, id, { page, shelf }) → { groups: [{ key, label, rows }], more, total } — 국회도서관's works by that
   person (its author search, newest first, the namesakes left out by id), with, on the first page, the KCI index's papers
   by that name and the shelf's own papers filed by it (shelf: [{ title, journal, publisher, year, month, issue, id }]),
   each paper once; in three groups: 학술논문 (a journal's papers), 학위논문, 토론회·기타 (forums, reports, books,
   magazines). Throws as papers.search does (busy, unavailable) when the library cannot be asked. */
export async function researcherWorks(name, id = '', { page = 1, shelf = [] } = {}) {
  const r = await papers.search(name, { kind: '', page, sort: 'new', by: 'author' });
  const pool = new Pool();
  let seq = 0;
  const who = akey(name);
  const theirs = r.rows.filter((x) => (x.authors || []).includes(name) && (!id || !x.ids || !x.ids[name] || x.ids[name] === id));
  for (const x of theirs) pool.add(fromNanet(x), seq++);
  if (page === 1) {
    const k = await kciq.search(name, { size: 40, sort: 'new' }).catch(() => null);
    for (const x of (k && k.rows) || []) if ((x.a || []).some((a) => akey(a) === who)) pool.add(fromIdx(x), seq++);
    for (const f of shelf || []) {
      if (!f || !f.title) continue;
      const iss = /제\s*(\d+)\s*[권집](?:\s*제\s*(\d+)\s*호)?|제\s*(\d+)\s*호/.exec(f.issue || '') || [];
      pool.add({ src: 'shelf', t: tidyTitle(f.title), a: [name], journal: f.journal || '', publisher: f.publisher || '', y: String(f.year || ''), m: String(f.month || ''),
        v: iss[1] || '', i: iss[2] || iss[3] || '', kind: 'ARTICLE', shelfId: f.id || '' }, seq++);
    }
  }
  const kindOf = (x) => (x.kind === 'THESIS' ? 'thesis' : x.kind && x.kind !== 'ARTICLE' ? 'other' : x.journal && venue(x) === 0 ? 'article' : 'other');
  const all = pool.recs.filter((x) => x.t).sort((a, b) => ym(b) - ym(a) || a.pos - b.pos);
  const groups = [['article', '학술논문'], ['thesis', '학위논문'], ['other', '토론회·기타']].map(([key, label]) => ({ key, label, rows: all.filter((x) => kindOf(x) === key) })).filter((g) => g.rows.length);
  return { groups, more: r.rows.length > 0 && page * SIZE.nanet < r.total, total: r.total };
}
