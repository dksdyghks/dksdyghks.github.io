// 연구실 책장 — 논문 찾기: 국회도서관 국가학술정보 클라우드 (학술논문·학위논문·단행본), asked through the shelf's server, which
// holds the key. A search gives each paper's title, authors, journal, publisher and year; a paper's details add its abstract,
// contents, identifiers and the 국회전자도서관 page where its full text is read.
import * as api from './api.js';
import * as naming from './naming.js';

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
const hanjaShare = (s) => { const h = (s.match(/[\u3400-\u9FFF\uF900-\uFAFF]/g) || []).length, k = (s.match(/[가-힣]/g) || []).length; return h + k ? h / (h + k) : 0; };
const person = (s) => naming.personName(s) || clean(s);
const ym = (s) => { const d = String(s || '').replace(/\D/g, ''); return d.length >= 6 ? `${d.slice(0, 4)}. ${+d.slice(4, 6)}.` : d.slice(0, 4); };
const kindName = (k) => (KINDS.find(([x]) => x === k) || [null, ''])[1];
// the 국회전자도서관 page of a record (where its full text is read, on the library's terms)
const dlPage = (control) => (/^[A-Z]{2,6}\d{6,}$/.test(control) ? `https://dl.nanet.go.kr/SearchDetailView.do?cn=${control}` : '');
const web = (u) => (/^https?:\/\/[^\s"'<>]+$/.test(String(u || '')) ? String(u).replace(/^http:\/\/dl\.nanet\.go\.kr\//, 'https://dl.nanet.go.kr/') : '');

function shape(x) {
  const title = clean(x.title), control = clean(x.controlNum);
  return {
    id: clean(x.lodID), kind: clean(x.divFlag), kindName: kindName(clean(x.divFlag)),
    title, reading: hanjaShare(title) >= 0.3 ? naming.hangulize(title) : '',   // a title in hanja, also in Hangul
    year: String(x.pubYear || '').slice(0, 4),
    authors: [...new Set((x.authorList || []).map((a) => person(a && a.name)).filter(Boolean))],
    ids: Object.fromEntries((x.authorList || []).filter((a) => a && a.lodAuthorID).map((a) => [person(a.name), String(a.lodAuthorID)])),
    journal: naming.hangulize(clean(x.journal && x.journal.title)),
    publisher: naming.hangulize(clean(x.publisher)),
    keywords: [...new Set((x.keywordList || []).map((k) => clean(k && k.name)).filter(Boolean))],
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
    title: clean(v.title) || row.title,
    authors: (v.author || []).map(person).filter(Boolean).length ? [...new Set((v.author || []).map(person).filter(Boolean))] : row.authors,
    journal: naming.hangulize(clean(v.journalName)) || row.journal,
    publisher: naming.hangulize(clean(v.orgName)) || row.publisher,
    when: ym(v.pubYear || v.confermentYear) || row.year,
    uci: clean(v.uci), doi: clean(v.doi),
    keywords: [...new Set([...(v.keyword || []).map(clean), ...row.keywords].filter(Boolean))],
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
// a footnote citation as Korean law journals write it: 저자, "제목", 『학술지』 제N권 제N호, 발행기관, 연도, 쪽.
export function cite(p, so) {
  const who = p.authors.length > 3 ? p.authors[0] + ' 외' : p.authors.join('·');
  const t = p.title.replace(/\s*:\s*/, ' - ').replace(/\s+-\s+(.+)$/, ' - $1 -').trim();
  if (p.kind === 'THESIS') return `${who}, 『${p.title}』, ${[p.school || p.publisher, p.degree ? p.degree + '학위논문' : '학위논문'].filter(Boolean).join(' ')}, ${p.year}.`;
  if (p.kind === 'BOOK') return `${who}, 『${p.title}』, ${p.publisher}, ${p.year}.`;
  const vol = so && so.volume ? ` 제${so.volume}권` : '', no = so && so.issue ? ` 제${so.issue}호` : '';
  const pages = so && so.pages ? `, ${so.pages}면` : '';
  return `${who}, "${t}", 『${p.journal}』${vol}${no}, ${p.publisher}, ${p.year}${pages}.`;
}

// a researcher, as 국회도서관 knows them: who and where (소속, 직위), how much they wrote each year, the researchers working on the
// same things, the journals they publish in and their subjects. id: the library's own id (else the name is looked up)
const people = new Map();
const firstList = (d, k) => { const r = d && d.result; const x = Array.isArray(r) ? r.find((y) => y && y[k]) : null; return (x && x[k]) || []; };
export async function researcher(name, id) {
  const key = (id || '') + ':' + name;
  if (people.has(key)) return people.get(key);
  let prof = null;
  const pd = await ask('author', id ? { lodID: id } : { name_ko: name, size: '20' }).catch((e) => { if (e && e.code === 'busy') throw e; return null; });
  const profs = (((pd && pd.result) || []).flat()).filter(Boolean).map((x) => ({ id: clean(x.lodID), name: person(x.name_ko) || clean(x.name_ko), nameEn: clean(x.name_en), org: clean(x.orgName_ko), position: clean(x.position) }));
  if (id) prof = profs.find((x) => x.id === id) || profs[0] || null;
  else if (profs.length === 1) prof = profs[0];
  const out = { name, id: id || (prof && prof.id) || '', prof, others: id || prof ? [] : profs.filter((x) => x.name === name).slice(0, 12), years: [], people: [], journals: [], keywords: [] };
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
