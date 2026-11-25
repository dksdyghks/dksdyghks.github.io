// 학술지 · 권호 · 학회 · 발간일 of a paper on the shelf: what its first page said, set right and filled in by the libraries'
// records of this very paper (its title, and its author's name).
//   국회도서관 (국가학술정보): the journal and its publisher, surest of all (the first page's reading can catch a word of the
//     title, or a misread letter: 민주범학); its names are often in hanja (法學論集), read here in Hangul
//   국립중앙도서관: the date to the month or the day
//   Crossref (a Korean journal's DOI): the volume and issue, and the date to the month
// Pure functions: the app asks the libraries and keeps the answer (app.js libraryInfo).
import * as naming from './naming.js';

export const norm = (s) => naming.hangulize(String(s || '')).replace(/<[^>]+>/g, '').replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase();
export const mainTitle = (t) => { const m = /^(.{8,}?)\s+[-―—–]\s*\S.*$/.exec(t) || /^(.{8,}?)\s*:\s*\S.*$/.exec(t); return (m ? m[1] : String(t)).trim(); };
// the words a catalogue is asked with: an odd middle dot (5･18) keeps 국회도서관 from finding the title, written as its own
// (5·18); the brackets of a law's name (「개식용종식법」) are part of what it finds, and stay
export const searchTerm = (title) => mainTitle(title).replace(/[･・ㆍ‧∙]/g, '·').replace(/\s+/g, ' ').trim().slice(0, 80);
const tidy = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
// a journal's name as a citation writes it: in Hangul, without what was read around it (、 민주법학 ┃)
export const journalName = (s) => naming.hangulize(tidy(s)).replace(/^[\s、,.·:;'"‘’“”「」『』<>《》\-–—_=]+|[\s┃│|ㅣ,.·:;\-–—_=]+$/g, '').trim();
// a publisher or society as the libraries write it (梨花女子大學校 法學硏究所, 서울 : 한국헌법학회, 20100330)
export function societyName(s) {
  let t = naming.hangulize(tidy(s)).replace(/\d{6,8}/g, ' ').replace(/(^|\D)(?:19|20)\d{2}(?!\d)/g, '$1 ');
  const at = t.indexOf(':');
  if (at >= 0) {   // "place : publisher": a short place name before the colon goes
    const before = t.slice(0, at).trim(), after = t.slice(at + 1).trim();
    t = !before || (/^[가-힣]{2,3}(?:시|군|도)?$/.test(before) && !/학회|대학|연구|원|사$|회$/.test(before)) ? after : before + ' ' + after;
  }
  t = t.replace(/^(?:서울|파주|고양|성남|과천|세종|대전|부산|대구|광주|인천|울산|수원|춘천|청주|전주|제주)\s+(?=\S)/, '').replace(/\s+(?:서울|파주|고양|성남|과천|세종|대전|부산|대구|광주|인천|울산|수원|춘천|청주|전주|제주)$/, '').replace(/[\s,:;]+/g, ' ').trim();
  if (/^(?:법학)?연구(?:소|원)$|^법학연구$/.test(t)) return '';   // "법학연구소" alone: whose is not said
  return /[가-힣A-Za-z]{2,}/.test(t) ? t : '';
}
const ymOf = (digits) => { const d = String(digits || '').replace(/\D/g, ''); return d.length >= 6 && +d.slice(4, 6) >= 1 && +d.slice(4, 6) <= 12 ? `${d.slice(0, 4)}-${d.slice(4, 6)}` : d.length >= 4 ? d.slice(0, 4) : ''; };
const sameName = (a, b) => { const x = naming.personName(a) || norm(a), y = naming.personName(b) || norm(b); return !!x && x === y; };

// 국회도서관's records (search rows) of exactly this title, by this author when the author is known
export function nanetOf(rows, title, author) {
  const want = norm(mainTitle(title));
  const same = (rows || []).filter((x) => norm(mainTitle(tidy(x.title).split(/\s=\s/)[0])) === want);
  const mine = author ? same.filter((x) => (x.authorList || []).some((a) => sameName(a && a.name, author))) : same;
  return mine.map((x) => ({ journal: journalName(x.journal && x.journal.title), publisher: societyName(x.publisher), year: /^\d{4}/.test(String(x.pubYear || '')) ? String(x.pubYear).slice(0, 4) : '', kind: x.divFlag || '' }));
}
// 국립중앙도서관's article records of this title (its start agreeing), by this author when the author is known
export function nlOf(rows, title, author) {
  const want = norm(title), who = norm(author);
  return (rows || []).filter((x) => /기사|논문/.test(x.typeName || '') && (norm(x.titleInfo).startsWith(want.slice(0, 14)) || want.startsWith(norm(x.titleInfo).slice(0, 14))) && (!who || norm(x.authorInfo).includes(who) || sameName(tidy(x.authorInfo).split(/[;,]/)[0], author)))
    .map((x) => ({ date: ymOf(x.pubYearInfo), society: societyName(x.pubInfo), print: /오프라인/.test(x.menuName || '') }));
}

// what the first page said (cur), set right and filled in by the libraries; why: what changed and on whose word
export function merge(cur0, { nanet = [], nl = [], cr = null } = {}) {
  const cur = { journal: journalName(cur0 && cur0.journal), society: tidy(cur0 && cur0.society), issue: tidy(cur0 && cur0.issue), date: String((cur0 && cur0.date) || '') };
  const out = { ...cur }, why = [];
  // the journal: the library's record of this very paper; the one naming the same journal as the first page, when there is one
  const recs = nanet.filter((r) => r.journal);
  const agree = recs.find((r) => norm(r.journal) === norm(cur.journal));
  const rec = agree || recs[0] || nanet[0] || null;
  if (rec && rec.journal && !agree) {
    if (cur.journal) why.push(`학술지 ${cur.journal} → ${rec.journal} (국회도서관)`);
    out.journal = rec.journal;
    if (cur.journal && rec.publisher) out.society = rec.publisher;   // the first page's society went with the journal it misread
  }
  if (!out.society) {
    const nlSoc = (nl.find((x) => x.print && x.society) || nl.find((x) => x.society) || {}).society;
    out.society = (rec && rec.publisher) || nlSoc || '';
  }
  // the date: to the month, from a record whose year agrees with the paper's (its own date, or the library's year)
  const year = out.date.slice(0, 4) || (rec && rec.year) || '';
  const crDate = cr && cr.date ? cr.date : '';
  const precise = [...nl.map((x) => x.date), crDate].filter((d) => /^\d{4}-\d{2}$/.test(d) && (!year || d.startsWith(year)));
  if (!/^\d{4}-\d{2}/.test(out.date) && precise.length) { out.date = precise[0]; why.push(`발간일 ${cur.date || '없음'} → ${out.date}`); }
  else if (!out.date) {
    const y = year || (nl.find((x) => x.date) || {}).date || '';
    if (y) { out.date = y.slice(0, 7); why.push(`발간일 없음 → ${out.date}`); }
  }
  // the volume and issue, from Crossref (title and year agreeing)
  if (out.journal && !out.issue && cr && (cr.volume || cr.issue) && (!out.date || !cr.date || cr.date.startsWith(out.date.slice(0, 4)))) {
    out.issue = [cr.volume && `제${cr.volume}권`, cr.issue && `제${cr.issue}호`].filter(Boolean).join(' ');
    why.push(`권호 → ${out.issue}`);
  }
  if (out.journal !== cur.journal && !why.some((w) => w.startsWith('학술지'))) why.push(`학술지 → ${out.journal}`);
  if (out.society !== cur.society) why.push(`학회 ${cur.society || '없음'} → ${out.society}`);
  return { info: out, why };
}
// a paper's line still wanting something the libraries may know, or looking misread: a stray mark around the journal, or a
// journal that is a word of the paper's own title (이른바 「개식용종식법」에 관한 … read as the journal 개식용종식법)
export function wants(i, title = '') {
  if (!i) return true;
  if (!i.journal || !i.date || /^\d{4}$/.test(i.date) || !i.issue) return true;
  if (journalName(i.journal) !== String(i.journal).trim()) return true;
  const j = norm(i.journal);
  return j.length >= 3 && norm(title).includes(j);
}
