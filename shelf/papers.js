// 연구실 책장 — 논문 찾기: 국회도서관 국가학술정보 클라우드 (학술논문·학위논문·단행본), asked through the shelf's server, which
// holds the key. A search gives each paper's title, authors, journal, publisher and year; a paper's details add its abstract,
// contents, identifiers and the 국회전자도서관 page where its full text is read.
import * as api from './api.js?v=624e00e99c';
import * as naming from './naming.js?v=624e00e99c';

export const KINDS = [['ARTICLE', '학술논문'], ['THESIS', '학위논문'], ['BOOK', '단행본'], ['', '전체']];
// the libraries' text: tags off, entities read (&#x2802; is how one of them writes the middle dot of 554·566)
const entities = (s) => String(s == null ? '' : s).replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\u2802/g, '·');
export const clean = (s) => entities(String(s == null ? '' : s).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const block = (s) => entities(String(s == null ? '' : s).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
export const norm = (s) => naming.hangulize(clean(s)).replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase();
// the title without its subtitle (― … ―, : …), as the shelf names its papers
export function mainTitle(t) {
  t = clean(t);
  const m = /^(.{8,}?)\s+[-―—–]\s*\S.*$/.exec(t) || /^(.{8,}?)\s*:\s*\S.*$/.exec(t) || /^(.{8,}?)\s+=\s+\S.*$/.exec(t);
  return (m ? m[1] : t).trim();
}
// a title as the lists write it: 국회도서관's catalogue marks (' :부제', ' =부제') as KCI's ' - 부제 -', and quotation marks a
// database doubled (''관습헌법'', ''''관습헌법'''') as one pair — so a paper's sheet, its row and its citation read the same.
// (' = ' before a title in another script, English, is that title in the other tongue, and stays.)
export function tidyTitle(t) {
  let s = String(t == null ? '' : t).replace(/\s+/g, ' ').trim().replace(/'{2,}([^']{1,80}?)'{2,}/g, '‘$1’').replace(/'{2,}/g, "'");
  const m = /^(.*?[가-힣].*?)\s+[:=]\s*(.*[가-힣].*)$/.exec(s);
  if (m && !/^[-―—–]/.test(m[2])) s = `${m[1]} - ${m[2].replace(/\s*[-―—–]\s*$/, '')} -`;
  return s;
}
// subjects in Korean first, those in other tongues after them (each kind in the order the source gave): a pair of the
// same idea in two tongues is then read once in each line, not alternately
export const koFirst = (list) => { const ko = [], other = []; for (const k of list || []) (/[가-힣]/.test(k) ? ko : other).push(k); return [...ko, ...other]; };
const hanjaShare = (s) => { const h = (s.match(/[\u3400-\u9FFF\uF900-\uFAFF]/g) || []).length, k = (s.match(/[가-힣]/g) || []).length; return h + k ? h / (h + k) : 0; };
const person = (s) => naming.personName(s) || clean(s);
const ym = (s) => { const d = String(s || '').replace(/\D/g, ''); return d.length >= 6 ? `${d.slice(0, 4)}. ${+d.slice(4, 6)}.` : d.slice(0, 4); };
const kindName = (k) => (KINDS.find(([x]) => x === k) || [null, ''])[1];
// the 국회전자도서관 page of a record (where its full text is read, on the library's terms)
const dlPage = (control) => (/^[A-Z]{2,6}\d{6,}$/.test(control) ? `https://dl.nanet.go.kr/SearchDetailView.do?cn=${control}` : '');
const web = (u) => (/^https?:\/\/[^\s"'<>]+$/.test(String(u || '')) ? String(u).replace(/^http:\/\/dl\.nanet\.go\.kr\//, 'https://dl.nanet.go.kr/') : '');

function shape(x) {
  const title = tidyTitle(clean(x.title)), control = clean(x.controlNum);
  return {
    id: clean(x.lodID), kind: clean(x.divFlag), kindName: kindName(clean(x.divFlag)),
    title, reading: hanjaShare(title) >= 0.3 ? naming.hangulize(title) : '',   // a title in hanja, also in Hangul
    year: String(x.pubYear || '').slice(0, 4),
    authors: [...new Set((x.authorList || []).map((a) => person(a && a.name)).filter(Boolean))],
    ids: Object.fromEntries((x.authorList || []).filter((a) => a && a.lodAuthorID).map((a) => [person(a.name), String(a.lodAuthorID)])),
    journal: naming.hangulize(clean(x.journal && x.journal.title)),
    publisher: naming.hangulize(clean(x.publisher)),
    keywords: koFirst([...new Set((x.keywordList || []).map((k) => clean(k && k.name)).filter(Boolean))]),
    page: web(x.url) || dlPage(control),
  };
}

// 국회도서관 asked through the server; an answer that is an error (its daily allowance used up: "트랙픽 양이 초과 되었습니다")
// is thrown, never taken for "nothing found" — and never kept
export async function ask(op, params) {
  const d = await api.nanet(op, params);
  const r = d && Array.isArray(d.result) ? d.result.find((x) => x && x.error) : null;
  const e = r && (Array.isArray(r.error) ? r.error[0] : r.error);
  // (code 201, "요청에 대한 정상 처리이지만, 결과값이 없습니다", is how it says it found nothing: an answer, not a failure)
  if (e && !(String(e.code) === '201' || /결과값이 없습니다/.test(String(e.message || '')))) throw Object.assign(new Error(String(e.message || 'nanet')), { code: /트랙픽|트래픽|초과|traffic|limit/i.test(String(e.message || '')) ? 'busy' : 'unavailable' });
  return d;
}
const asked = new Map();   // each question asked once while the app is open
export async function search(q, { kind = 'ARTICLE', page = 1, sort = '', by = '' } = {}) {
  const key = [q, kind, page, sort, by].join('\u0001');
  if (asked.has(key)) return asked.get(key);
  const params = { searchTerm: q, pageNo: String(page), printRowCnt: '20' };
  if (kind) params.searchRange = kind;
  if (sort === 'new') { params.searchSort = 'year'; params.sortType = 'desc'; }
  if (by === 'author') params.searchType = 'AUTHOR';
  const d = await ask('search', params);
  const r = ((d && d.result) || []).find((x) => x && Array.isArray(x.searchList)) || (d && d.result && d.result[0]) || {};
  const out = { total: Number(r.totalCount) || 0, rows: (r.searchList || []).map(shape).filter((x) => x.id && x.title) };
  asked.set(key, out);
  return out;
}

const seen = new Map();
export async function detail(row) {
  const key = row.id + ':' + row.kind;
  if (seen.has(key)) return seen.get(key);
  const d = await ask('view', { lodID: row.id, divFlag: row.kind });
  const v = d && d.result && d.result[0] && d.result[0].searchView;
  if (!v) return null;
  const out = {
    ...row,
    title: tidyTitle(clean(v.title)) || row.title,
    authors: (v.author || []).map(person).filter(Boolean).length ? [...new Set((v.author || []).map(person).filter(Boolean))] : row.authors,
    journal: naming.hangulize(clean(v.journalName)) || row.journal,
    publisher: naming.hangulize(clean(v.orgName)) || row.publisher,
    when: ym(v.pubYear || v.confermentYear) || row.year,
    uci: clean(v.uci), doi: clean(v.doi),
    keywords: koFirst([...new Set([...(v.keyword || []).map(clean), ...row.keywords].filter(Boolean))]),
    abstract: block(v.abst), toc: block(v.toc),
    degree: clean(v.degreeType).replace(/^학위논문\((.+)\)$/, '$1'), major: clean(v.major), advisor: person(v.advisor), school: clean(v.graduateSchool),
    isbn: clean(v.isbn || v.ISBN),
    page: web(v.docUrl) || row.page,
  };
  seen.set(key, out);
  return out;
}

// the same paper looked up elsewhere (each opens in a new tab)
export function elsewhere(p) {
  const t = mainTitle(p.title);
  return [
    p.page && ['국회전자도서관', p.page],
    p.doi && ['DOI', 'https://doi.org/' + p.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')],
    ['RISS', 'https://www.riss.kr/search/Search.do?isDetailSearch=N&searchGubun=true&viewYn=OP&query=' + encodeURIComponent(t)],
    ['구글 학술검색', 'https://scholar.google.com/scholar?q=' + encodeURIComponent('"' + t + '"' + (p.authors[0] ? ' ' + p.authors[0] : ''))],
  ].filter(Boolean);
}
// the query is a person: some paper found by it was written by someone of exactly that name (선거 never is; 임지봉 is)
export function authorAsked(q, rows) {
  const t = String(q || '').replace(/\s+/g, '');
  return /^[가-힣]{2,5}$/.test(t) && (rows || []).some((x) => x.authors.includes(t));
}

// KISTI ScienceON: the same paper (title and first author agreeing), for what the 국회도서관 record leaves out — the volume
// and issue, the pages, the abstract, the DOI and the full text — so it can be cited exactly. null when it is not there.
const soSeen = new Map();
export async function scienceon(p) {
  const key = norm(mainTitle(p.title)) + '|' + (p.authors[0] || '');
  if (soSeen.has(key)) return soSeen.get(key);
  const d = await api.scienceon('search', { q: mainTitle(p.title).slice(0, 100), field: 'TI', rows: '10' });
  const want = norm(mainTitle(p.title)), who = p.authors[0] || '';
  const hit = ((d && d.rows) || []).find((r) => norm(mainTitle(r.Title || '')) === want && (!who || clean(r.Author).split(/[;,]/).map((a) => person(a.trim())).includes(who)));
  const out = hit ? {
    volume: clean(hit.VolNo1), issue: clean(hit.VolNo2), pages: clean(hit.PageInfo).replace(/\s*[-~]\s*/, '-'),
    abstract: block(hit.Abstract), doi: clean(hit.DOI), full: web(hit.FulltextURL), page: web(hit.ContentURL),
    journal: clean(hit.JournalName), publisher: clean(hit.Publisher), year: clean(hit.Pubyear).slice(0, 4),
  } : null;
  soSeen.set(key, out);
  return out;
}
// a journal's volume, as the journal itself numbers it: 집 (공법연구 제50집 제3호), 권 (헌법학연구 제30권 제1호), or an issue
// alone (행정법연구 제68호) — from the journals known here, and from what the shelf's own papers print (learnVolWord, given by
// the app the issue lines it read from first pages); 권 when nothing says otherwise
const VOL_WORD = new Map([
  ['공법연구', '집'], ['토지공법연구', '집'], ['헌법논총', '집'], ['중앙법학', '집'],
  ['헌법학연구', '권'], ['공법학연구', '권'], ['미국헌법연구', '권'], ['세계헌법연구', '권'], ['법조', '권'], ['서울대학교법학', '권'],
  ['법과정책연구', '권'], ['입법학연구', '권'], ['지방자치법연구', '권'], ['환경법연구', '권'], ['한국정당학회보', '권'], ['가천법학', '권'],
  ['성균관법학', '권'], ['강원법학', '권'], ['경희법학', '권'], ['홍익법학', '권'], ['언론과법', '권'], ['경제규제와법', '권'], ['비교사법', '권'],
  ['행정법연구', '호'], ['유럽헌법연구', '호'], ['행정법학', '호'], ['사법', '호'], ['저스티스', '호'], ['인권과정의', '호'], ['동아법학', '호'], ['선거연구', '호'],
].map(([j, w]) => [norm(j), w]));
export const volWord = (journal) => VOL_WORD.get(norm(journal)) || '권';
export function learnVolWord(journal, issue) {
  const k = norm(journal), m = /제\s*\d+\s*([권집])/.exec(String(issue || ''));
  if (k && m && !VOL_WORD.has(k)) VOL_WORD.set(k, m[1]);
  else if (k && !m && /^제\s*\d+\s*호$/.test(String(issue || '').trim()) && !VOL_WORD.has(k)) VOL_WORD.set(k, '호');
}
// 제50집 제3호 · 제30권 제1호 · 제68호 — x: { journal, v, i } (a journal numbered by issue alone: its one number)
export function issueText(x) {
  const v = String((x && x.v) || '').trim(), i = String((x && x.i) || '').trim(), w = volWord(x && x.journal);
  if (w === '호') { const n = i || v; return n ? `제${n}호` : ''; }
  return v && i ? `제${v}${w} 제${i}호` : i ? `제${i}호` : v ? `제${v}${w}` : '';
}
// a footnote citation as Korean law journals write it: 저자, "제목", 『학술지』 제N권(집) 제N호, 발행기관, 연도, 쪽면.
// citeOf → { text, partial }: partial when no volume or issue is known (the sheet says 권호 미상 · 확인 후 쓰세요, and the copy
// is not to go into a footnote as it is); cite → the text alone (as before)
export function citeOf(p, so) {
  const who = p.authors.length > 3 ? p.authors[0] + ' 외' : p.authors.join('·');
  let t = tidyTitle(p.title);
  if (/\s[-―—–]\s/.test(t) && !/\s[-―—–]$/.test(t)) t += ' -';
  if (p.kind === 'THESIS') return { text: `${who}, 『${p.title}』, ${[p.school || p.publisher, p.degree ? p.degree + '학위논문' : '학위논문'].filter(Boolean).join(' ')}, ${p.year}.`, partial: false };
  if (p.kind === 'BOOK') return { text: `${who}, 『${p.title}』, ${p.publisher}, ${p.year}.`, partial: false };
  const iss = so ? issueText({ journal: p.journal, v: so.volume, i: so.issue }) : '';
  const pages = so && so.pages ? `, ${so.pages}면` : '';
  // (a publisher or year not known leaves no empty ', ,' behind)
  return { text: `${who}, "${t}", 『${p.journal}』${iss ? ' ' + iss : ''}${p.publisher ? ', ' + p.publisher : ''}${p.year ? ', ' + p.year : ''}${pages}.`, partial: !iss };
}
export const cite = (p, so) => citeOf(p, so).text;
// the volume and issue for a paper's sheet, as its citation writes them ('제50집 제3호'), and its pages in the same unit ('153-187면')
export const sheetIssue = (p, so) => (so ? issueText({ journal: p.journal, v: so.volume, i: so.issue }) : '');
export const sheetPages = (so) => (so && so.pages ? `${so.pages}면` : '');

// a researcher, as 국회도서관 knows them: who and where (소속, 직위), how much they wrote each year, the researchers working on the
// same things, the journals they publish in and their subjects. id: the library's own id (else the name is looked up).
// Namesakes (others) come in the order most likely to be the one meant: ctx.aff — the affiliation the paper it was opened
// from gives its author — first; then the one whose works (the library's author search, the same page the researcher's
// list reads first) are law papers, in the journals ctx.journals names or in law journals; a university's or a court's
// before a hospital's or a firm's. Each says, beside where they are, the journal they write in most (hint, label)
const people = new Map();
const firstList = (d, k) => { const r = d && d.result; const x = Array.isArray(r) ? r.find((y) => y && y[k]) : null; return (x && x[k]) || []; };
const LAW_J = /법|헌법|공법|행정|판례|입법|선거|정당|정치|사법|법조|저스티스|인권/;
// (a school's own name: '한양대학교 법학전문대학원', '한양대 법대' and '한양대학교' all '한양' — and two such names the same
// school only when they are equal, or the shorter has three letters or more: '서울' is not '서울시립')
const affKey = (s) => {
  let t = String(s || '').replace(/\(.*?\)/g, '').trim();
  for (let k = 0; k < 3; k++) { const u = t.replace(/\s*(?:법학전문대학원|대학원|법과대학|법대|법학과|법학부|대학교|대학)\s*$/, ''); if (u === t) break; t = u; }
  t = norm(t);
  return t.length >= 3 && t.endsWith('대') ? t.slice(0, -1) : t;
};
const sameAff = (a, b) => !!(a && b && (a === b || (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a)))));
export async function researcher(name, id, ctx = {}) {
  const key = (id || '') + ':' + name + ':' + (ctx.aff || '') + ':' + (ctx.journals || []).join('|');
  if (people.has(key)) return people.get(key);
  let prof = null;
  const pd = await ask('author', id ? { lodID: id } : { name_ko: name, size: '20' }).catch((e) => { if (e && e.code === 'busy') throw e; return null; });
  const profs = (((pd && pd.result) || []).flat()).filter(Boolean).map((x) => ({ id: clean(x.lodID), name: person(x.name_ko) || clean(x.name_ko), nameEn: clean(x.name_en), org: clean(x.orgName_ko), position: clean(x.position) }));
  if (id) prof = profs.find((x) => x.id === id) || profs[0] || null;
  else if (profs.length === 1) prof = profs[0];
  let others = id || prof ? [] : profs.filter((x) => x.name === name).slice(0, 12);
  if (others.length > 1) others = await rankNamesakes(name, others, ctx);
  const out = { name, id: id || (prof && prof.id) || '', prof, others, years: [], people: [], journals: [], keywords: [] };
  if (out.id) {
    const q = { searchTerm: name, searchType: 'AUTHOR', searchID: out.id };
    const [tr, ra, rj, rk] = await Promise.all(['trend', 'relAuthor', 'relJournal', 'relKeyword'].map((op) => ask(op, q).catch(() => null)));
    out.years = firstList(tr, 'trendList').map((y) => ({ year: Number(y.year), count: Number(y.count) || 0 })).filter((y) => y.year > 1900).sort((a, b) => a.year - b.year);
    out.people = firstList(ra, 'authorList').map((a) => ({ id: clean(a.lodAuthorID), name: person(a.name) || clean(a.name) })).filter((a) => a.name && a.name !== name).slice(0, 16);
    out.journals = firstList(rj, 'journalList').map((j) => naming.hangulize(clean(j.name))).filter(Boolean).slice(0, 12);
    out.keywords = firstList(rk, 'keywordList').map((k) => clean(k.name)).filter(Boolean).slice(0, 20);
  }
  people.set(key, out);
  return out;
}
async function rankNamesakes(name, others, ctx) {
  const r = await search(name, { kind: '', page: 1, sort: 'new', by: 'author' }).catch(() => null);   // (cached: the list asks it too)
  const by = new Map();
  for (const x of (r && r.rows) || []) {
    const aid = x.ids && x.ids[name]; if (!aid) continue;
    const e = by.get(aid) || { n: 0, law: 0, js: new Map() };
    e.n++;
    if (x.kind === 'ARTICLE' && LAW_J.test(x.journal + ' ' + x.publisher)) e.law++;
    if (x.journal) e.js.set(x.journal, (e.js.get(x.journal) || 0) + 1);
    by.set(aid, e);
  }
  const want = new Set((ctx.journals || []).map(norm).filter(Boolean)), aff = affKey(ctx.aff);
  const score = (o) => {
    const e = by.get(o.id), ok = affKey(o.org);
    let v = 0;
    if (sameAff(aff, ok)) v += 100;
    if (e) { v += 4 * e.law + 0.5 * e.n; for (const j of e.js.keys()) if (want.has(norm(j))) v += 20; }
    if (/대학|대학교|법원|헌법재판소|국회|연구원|연구소|법제처/.test(o.org)) v += 2;
    if (/교수|연구|판사|변호사|조사관/.test(o.position || '')) v += 1;
    if (/병원|의원|사무소|회사|주식회사|건축|센터$/.test(o.org) && !(e && e.law)) v -= 3;
    return v;
  };
  return others.map((o, k) => {
    const e = by.get(o.id), top = e ? [...e.js.entries()].sort((a, b) => b[1] - a[1])[0] : null;
    const hint = top ? top[0] : '';
    return { ...o, hint, label: [o.org, hint].filter(Boolean).join(' · '), score: score(o), k };
  }).sort((a, b) => b.score - a.score || a.k - b.k).map(({ score, k, ...o }) => o);
}

// Crossref (the DOI registry, where many Korean journals deposit their papers): the same paper — its Korean title (Crossref
// keeps it as the 'original-title') and its year agreeing — for its volume, issue, pages and DOI. null when not there.
const crSeen = new Map();
const crYear = (it) => Number((((it.issued || it.published || {})['date-parts'] || [[0]])[0] || [0])[0]) || 0;
// a DOI printed on a paper (its own, at the head of its first page): the journal, volume, issue and month Crossref keeps for it
const doiSeen = new Map();
export async function crossrefDoi(doi) {
  const d = String(doi || '').trim();
  if (!/^10\.\d{4,9}\/\S+$/.test(d)) return null;
  if (doiSeen.has(d)) return doiSeen.get(d);
  const r = await fetch('https://api.crossref.org/works/' + encodeURIComponent(d), { signal: AbortSignal.timeout(12000) });
  if (r.status === 404) { doiSeen.set(d, null); return null; }
  if (!r.ok) throw Object.assign(new Error('crossref'), { code: r.status === 429 ? 'busy' : 'unavailable' });
  const m = (await r.json()).message || {};
  const dp = ((m['published-print'] || m['published'] || m.issued || {})['date-parts'] || [[]])[0] || [];
  const out = { journal: clean((m['container-title'] || [])[0]), volume: clean(m.volume), issue: clean(m.issue), year: dp[0] ? String(dp[0]) : '', month: dp[1] ? String(dp[1]).padStart(2, '0') : '', title: clean((m.title || [])[0]) };
  doiSeen.set(d, out);
  return out;
}
export async function crossref(p) {
  const want = norm(mainTitle(p.title));
  const key = want + '|' + p.year;
  if (!want) return null;
  if (crSeen.has(key)) return crSeen.get(key);
  const q = new URLSearchParams({ 'query.bibliographic': mainTitle(p.title).slice(0, 120), rows: '8', select: 'DOI,title,original-title,volume,issue,page,issued,published' });
  const r = await fetch('https://api.crossref.org/works?' + q, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw Object.assign(new Error('crossref'), { code: r.status === 429 ? 'busy' : 'unavailable' });
  const d = await r.json();
  const hit = ((d && d.message && d.message.items) || []).find((it) => [...(it['original-title'] || []), ...(it.title || [])].some((t) => norm(mainTitle(t)) === want)
    && (!Number(p.year) || !crYear(it) || Math.abs(crYear(it) - Number(p.year)) <= 1));
  // a journal numbered once (인권과 정의 제513호) is deposited as a volume alone: that number is its issue
  const v = clean(hit && hit.volume), n = clean(hit && hit.issue);
  const dp = hit ? (((hit.issued || hit.published || {})['date-parts'] || [[]])[0] || []) : [];
  const date = dp[0] && dp[1] ? `${dp[0]}-${String(dp[1]).padStart(2, '0')}` : '';   // to the month, when it is told
  const out = hit ? { volume: n ? v : '', issue: n || v, pages: clean(hit.page).replace(/\s*[-–~]+\s*/, '-'), doi: clean(hit.DOI), date } : null;
  crSeen.set(key, out);
  return out;
}
// what the outside records add to a paper, ScienceON first and Crossref where it is silent
export async function extra(p) {
  const [a, b] = await Promise.allSettled([scienceon(p), crossref(p)]);
  const s = a.status === 'fulfilled' ? a.value : null, c = b.status === 'fulfilled' ? b.value : null;
  if (!s && !c) return null;
  const pick = (k) => (s && s[k]) || (c && c[k]) || '';
  return { volume: pick('volume'), issue: pick('issue'), pages: pick('pages'), doi: pick('doi'), abstract: (s && s.abstract) || '', full: (s && s.full) || '', page: (s && s.page) || '' };
}
