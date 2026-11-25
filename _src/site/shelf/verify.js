// 연구실 책장 — a paper's line (학술지 · 권호 · 학회 · 발간 연월) set against what the paper itself prints.
// The first pages of a Korean law paper say where it came out twice over: its journal's header or footer (경제규제와 법 …
// 제12권 제1호 (통권 제23호). 2019. 5.; 이화여자대학교 법학논집 제26권 제1호 통권 75호 (2021. 9); 80 헌법학연구 제16권 제3호
// (2010. 9.)), and its DOI, which for KCI's journals carries the year, volume and issue (…/nal.2018.11.3.2). What is printed
// there is taken over the libraries' records: an issue and month printed with the journal's name, then the issue the DOI
// names. A society that is the journal's printer (박영사, 법문사 …) gives way to the society KCI names for the journal.
import * as naming from './naming.js';

const squash = (s) => naming.hangulize(String(s || '')).replace(/\s+/g, '');
const PRINTERS = /^(?:박영사|법문사|관악사|피앤씨미디어|한국학술정보|경인문화사|세창출판사|진원사|삼영사|신영사|오래|도서출판\s*\S+|\(주\)\s*\S+)$/;
const SOCIETY = /(?:학회|연구회|협회|학술원|연구소|연구원|센터|재단|위원회|재판소|법원|법조협회)$/;

// the DOIs at the head of page 1 (a footnote's DOI is another paper's), and the issue each names
function doisIn(p1) {
  const head = String(p1 || '').slice(0, 900);
  const out = [];
  for (const m of head.matchAll(/10\.\d{4,9}\/[^\s"'<>()]+/g)) {
    const doi = m[0].replace(/[.,;:]+$/, '');
    let x = /[./]((?:19|20)\d{2})\.(\d{1,3})\.(\d{1,3})\.\d{1,5}$/.exec(doi);
    if (x) { out.push({ doi, y: x[1], vol: String(+x[2]), no: String(+x[3]), m: '' }); continue; }
    x = /[./](\d{1,3})\.(\d{1,3})\.((?:19|20)\d{2})(\d{2})\.\d{1,5}$/.exec(doi);
    if (x && +x[4] >= 1 && +x[4] <= 12) { out.push({ doi, y: x[3], vol: String(+x[1]), no: String(+x[2]), m: x[4] }); continue; }
    out.push({ doi, y: '', vol: '', no: '', m: '' });
  }
  return out;
}
// "제26권 제1호", "제 호2" (digits set apart), "第11卷 第3號" (hangulized first) → { vol, no }
function issueAt(s) {
  const t = s.replace(/제\s*호\s*(\d+)/g, '제$1호');
  let m = /제\s*(\d+)\s*[권집]\s*(?:제\s*)?(\d+)\s*호/.exec(t);
  if (m) return { vol: String(+m[1]), no: String(+m[2]), len: m.index + m[0].length, at: m.index };
  m = /(?:^|[^통권\d])제\s*(\d+)\s*호/.exec(t);
  if (m) return { vol: '', no: String(+m[1]), len: m.index + m[0].length, at: m.index };
  return null;
}
// a month printed right after the issue: (2021. 9), (2010. 9.), 2019. 5., (2018년 1월)
function monthAt(s0) {
  // (the serial number and the English volume between them are passed over: (통권 제23호). (Vol. 12. No. 1). 2019. 5.)
  const s = s0.replace(/\(\s*통권[^)]*\)/g, ' ').replace(/통권\s*(?:제\s*)?\d+\s*호/g, ' ').replace(/\(?\s*Vol\.?\s*\d+\s*[.,]?\s*No\.?\s*\d+\s*\)?\s*\.?/gi, ' ');
  const m = /^[^가-힣]{0,40}?((?:19|20)\d{2})\s*(?:\.|년)\s*(\d{1,2})\s*(?:\.|월|\))/.exec(s) || /^.{0,60}?\(\s*((?:19|20)\d{2})\s*(?:\.|년)\s*(\d{1,2})\s*(?:\.|월)?\s*\)/.exec(s);
  return m && +m[2] >= 1 && +m[2] <= 12 ? `${m[1]}-${String(+m[2]).padStart(2, '0')}` : '';
}
// where the journal's own name is followed by an issue and a month (the header, a footer, a running head — not a footnote
// citing another paper, which gives a year alone)
function printedIn(text, journal) {
  const j = squash(journal);
  if (j.length < 2) return null;
  const flat = naming.hangulize(String(text || '')).replace(/\s+/g, ' ');
  const sq = [], map = [];   // the text without spaces, and where each letter was
  for (let i = 0; i < flat.length; i++) if (flat[i] !== ' ') { sq.push(flat[i]); map.push(i); }
  const s = sq.join('');
  for (let at = s.indexOf(j); at >= 0; at = s.indexOf(j, at + 1)) {
    const from = map[at + j.length - 1] + 1, after = flat.slice(from, from + 170);
    const iss = issueAt(after);
    if (!iss || iss.at > 130) continue;
    const ym = monthAt(after.slice(iss.len));
    if (ym) return { vol: iss.vol, no: iss.no, ym };
  }
  return null;
}
const volNo = (issue) => { const v = /(\d+)\s*[권집]/.exec(issue || ''), n = /(?:^|[^통권\d])(?:제\s*)?(\d+)\s*호/.exec(String(issue || '').replace(/통권\s*(?:제\s*)?\d+\s*호/, '')); return { vol: v ? String(+v[1]) : '', no: n ? String(+n[1]) : '' }; };
const issueText = (vol, no, ser) => (vol ? `제${vol}권` : '') + (no ? `${vol ? ' ' : ''}제${no}호` : '') + (ser ? ` (통권 제${ser}호)` : '');

// line: { journal, society, issue, date }; p1, p2: the text of pages 1 and 2; kciJournal: the journal as KCI knows it
// ({ k, p }) or null. → { line, why: [...] } (line unchanged and why empty when the paper bears the line out)
export function check(line0, p1, p2, kciJournal) {
  const line = { journal: '', society: '', issue: '', date: '', ...(line0 || {}) };
  const why = [];
  const year = (/^(\d{4})/.exec(line.date || '') || [])[1] || '';
  // 1. what is printed with the journal's own name
  let pr = line.journal ? printedIn(`${p1 || ''}\n${p2 || ''}`, line.journal) : null;
  if (pr && year && Math.abs(+pr.ym.slice(0, 4) - +year) > 1) pr = null;
  // the DOIs at the head of page 1, when they all name one issue in the line's year (or the next): over a printed issue too
  // (two journals' headers laid one over the other print two issues; the DOI is this paper's)
  const ds = doisIn(p1).filter((d) => d.vol && d.no);
  const doi = ds.length && ds.every((d) => d.vol === ds[0].vol && d.no === ds[0].no && d.y === ds[0].y) && (!year || Math.abs(+ds[0].y - +year) <= 1) ? ds[0] : null;
  if (pr && doi && (pr.vol !== doi.vol || pr.no !== doi.no) && pr.vol) { pr.vol = doi.vol; pr.no = doi.no; }
  if (pr) {
    const have = volNo(line.issue);
    const ser = (/통권\s*(?:제\s*)?(\d+)\s*호/.exec(line.issue || '') || [])[1] || '';
    if ((pr.vol && have.vol !== pr.vol) || (pr.no && have.no !== pr.no)) {
      // a single number printed (제720호) where the line has volume and issue is not a disagreement
      if (pr.vol || !have.vol) { line.issue = issueText(pr.vol, pr.no, ser); why.push(`권호: 논문에 ${issueText(pr.vol, pr.no)}`); }
    }
    if (line.date.slice(0, 7) !== pr.ym) { line.date = pr.ym; why.push(`발간: 논문에 ${pr.ym}`); }
  } else {
    // 2. the DOI alone
    if (doi) {
      const d = doi, have = volNo(line.issue);
      if (have.vol !== d.vol || have.no !== d.no) {
        if (have.vol || !have.no) {   // (a line with the serial number alone (제720호) keeps it, with the volume and issue before it)
          line.issue = issueText(d.vol, d.no, '');
        } else line.issue = `${issueText(d.vol, d.no, '')} (통권 제${have.no}호)`;
        why.push(`권호: DOI에 ${issueText(d.vol, d.no)}`);
      }
      if (d.m && line.date.slice(0, 7) !== `${d.y}-${d.m}`) { line.date = `${d.y}-${d.m}`; why.push(`발간: DOI에 ${d.y}-${d.m}`); }
      else if (!d.m && year && year !== d.y) { line.date = d.y; why.push(`발간 연도: DOI에 ${d.y}`); }
    }
  }
  // 3. a printer named as the society, or none: the journal's society, as KCI names it (not a name any university's
  // institute has, like 법학연구소 alone)
  const generic = (p) => /^(?:법학연구소|법학연구원|법학연구센터|사회과학연구소|사회과학연구원|연구소|연구원)$/.test(String(p).replace(/\s+/g, ''));
  if (kciJournal && kciJournal.p && SOCIETY.test(kciJournal.p) && !generic(kciJournal.p) && (!line.society || PRINTERS.test(line.society.trim()))) {
    if (line.society !== kciJournal.p) { why.push(`학회: ${line.society || '(없음)'} → ${kciJournal.p}`); line.society = kciJournal.p; }
  }
  return { line, why };
}
// the DOIs printed at the head of page 1 (for a line with no journal yet: Crossref names it)
export const doisOf = (p1) => doisIn(p1).map((d) => d.doi);
export const _test = { doisIn, printedIn, monthAt, issueAt };
