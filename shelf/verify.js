// 연구실 책장 — a paper's line (학술지 · 권호 · 학회 · 발간 연월) set against what the paper itself prints.
// The first pages of a Korean law paper say where it came out: its journal's header or footer (경제규제와 법 … 제12권 제1호
// (통권 제23호). 2019. 5.; 이화여자대학교 법학논집 제26권 제1호 통권 75호 (2021. 9); 80 헌법학연구 제16권 제3호 (2010. 9.)).
// What is printed there with the journal's own name — its issue and the month after it — fills what the line lacks, and
// sets right an issue only when the paper's own DOI bears the printed one out. The DOI (…/nal.2018.11.3.2) only backs up
// what is printed: it picks between two printed issues (two journals' headers laid one over the other), and no volume,
// issue or month is ever taken from its digits (선거연구's …/nec.2026.1.24.003 is 제24호 of 2026: no 제1권, no January).
// A society that is the journal's printer (박영사, 법문사 …) gives way to the society KCI names for the journal.
import * as naming from './naming.js?v=aedca5545d';
import { glyphs, stripLinks, notPubDates, doisIn as doisOfText, doiParts } from './cite.js?v=aedca5545d';

const squash = (s) => naming.hangulize(String(s || '')).replace(/\s+/g, '');
const PRINTERS = /^(?:박영사|법문사|관악사|피앤씨미디어|한국학술정보|경인문화사|세창출판사|진원사|삼영사|신영사|오래|도서출판\s*\S+|\(주\)\s*\S+)$/;
const SOCIETY = /(?:학회|연구회|협회|학술원|연구소|연구원|센터|재단|위원회|재판소|법원|법조협회)$/;

// the DOIs printed on page 1, anywhere on it (pdf.js can give the head's DOI last), less a numbered footnote's, which cites
// another paper (analyze.pageText sets the notes after a blank line, each starting with its number); and the issue each names
function doisIn(p1) {
  const t = glyphs(p1), at = t.indexOf('\n\n');
  const notes = at < 0 ? '' : t.slice(at).split('\n').filter((l) => !/^\s*\d{1,3}\)?(?:\s|[^\d.\s])/.test(l)).join('\n');
  return doisOfText((at < 0 ? t : t.slice(0, at)) + '\n' + notes).map((doi) => { const x = doiParts(doi) || {}; return { doi, y: x.y || '', vol: x.vol || '', no: x.no || '' }; });
}
// "제26권 제1호", "제52집 제3호", "제 호2" (digits set apart), "第11卷 第3號" (hangulized first) → { vol, unit, no }
function issueAt(s) {
  const t = s.replace(/제\s*호\s*(\d+)/g, '제$1호');
  let m = /제\s*(\d+)\s*([권집])\s*(?:제\s*)?(\d+)\s*호/.exec(t);
  if (m) return { vol: String(+m[1]), unit: m[2], no: String(+m[3]), len: m.index + m[0].length, at: m.index };
  m = /(?:^|[^통권\d])제\s*(\d+)\s*호/.exec(t);
  if (m) return { vol: '', unit: '', no: String(+m[1]), len: m.index + m[0].length, at: m.index };
  return null;
}
// a month printed right after the issue: (2021. 9), (2010. 9.), 2019. 5., (2018년 1월) — read with links and DOIs taken out
function monthAt(s0) {
  // (the serial number and the English volume between them are passed over: (통권 제23호). (Vol. 12. No. 1). 2019. 5.)
  const s = s0.replace(/\(\s*통권[^)]*\)/g, ' ').replace(/통권\s*(?:제\s*)?\d+\s*호/g, ' ').replace(/\(?\s*Vol\.?\s*\d+\s*[.,]?\s*No\.?\s*\d+\s*\)?\s*\.?/gi, ' ');
  const m = /^[^가-힣]{0,40}?((?:19|20)\d{2})\s*(?:\.|년)\s*(\d{1,2})\s*(?:\.|월|\))/.exec(s) || /^.{0,60}?\(\s*((?:19|20)\d{2})\s*(?:\.|년)\s*(\d{1,2})\s*(?:\.|월)?\s*\)/.exec(s);
  return m && +m[2] >= 1 && +m[2] <= 12 ? `${m[1]}-${String(+m[2]).padStart(2, '0')}` : '';
}
// every place where the journal's own name is followed by an issue and a month (the header, a footer, a running head — not
// a footnote citing another paper, which gives a year alone), in the order of the text
function printedIn(text, journal) {
  const j = squash(journal);
  if (j.length < 2) return [];
  const flat = naming.hangulize(glyphs(text)).replace(/\s+/g, ' ');
  const sq = [], map = [];   // the text without spaces, and where each letter was
  for (let i = 0; i < flat.length; i++) if (flat[i] !== ' ') { sq.push(flat[i]); map.push(i); }
  const s = sq.join(''), out = [];
  for (let at = s.indexOf(j); at >= 0; at = s.indexOf(j, at + 1)) {
    const from = map[at + j.length - 1] + 1, after = notPubDates(stripLinks(flat.slice(from, from + 170)));   // (a DOI's digits, a date of review, are no month)
    const iss = issueAt(after);
    if (!iss || iss.at > 130) continue;
    const ym = monthAt(after.slice(iss.len));
    if (ym) out.push({ vol: iss.vol, unit: iss.unit, no: iss.no, ym });
  }
  return out;
}
const volNo = (issue) => { const v = /(\d+)\s*[권집]/.exec(issue || ''), n = /(?:^|[^통권\d])(?:제\s*)?(\d+)\s*호/.exec(String(issue || '').replace(/통권\s*(?:제\s*)?\d+\s*호/, '')); return { vol: v ? String(+v[1]) : '', no: n ? String(+n[1]) : '' }; };
const issueText = (vol, no, ser, unit) => (vol ? `제${vol}${unit || '권'}` : '') + (no ? `${vol ? ' ' : ''}제${no}호` : '') + (ser ? ` (통권 제${ser}호)` : '');   // (권 or 집, as printed)

// line: { journal, society, issue, date }; p1, p2: the text of pages 1 and 2; kciJournal: the journal as KCI knows it
// ({ k, p }) or null. → { line, why: [...] } (line unchanged and why empty when the paper bears the line out)
export function check(line0, p1, p2, kciJournal) {
  const line = { journal: '', society: '', issue: '', date: '', ...(line0 || {}) };
  const why = [];
  const year = (/^(\d{4})/.exec(line.date || '') || [])[1] || '';
  // the DOIs on page 1, when they all name one issue: this paper's (only to tell which printed issue is this paper's)
  const ds = doisIn(p1).filter((d) => d.no);
  const doi = ds.length && ds.every((d) => d.vol === ds[0].vol && d.no === ds[0].no) ? ds[0] : null;
  const agrees = (x) => !!doi && doi.no === x.no && (!x.vol || doi.vol === x.vol);
  // 1. what is printed with the journal's own name, in the line's year (or the next): the one the DOI bears out, else the first
  const found = line.journal ? printedIn(`${p1 || ''}\n${p2 || ''}`, line.journal).filter((x) => !year || Math.abs(+x.ym.slice(0, 4) - +year) <= 1) : [];
  const pr = found.find(agrees) || found[0] || null;
  if (pr) {
    const have = volNo(line.issue);
    const ser = (/통권\s*(?:제\s*)?(\d+)\s*호/.exec(line.issue || '') || [])[1] || '';
    // the printed issue is the line's (a single number printed, 제720호, where the line has volume and issue, is no disagreement)
    let ours = !((pr.vol && have.vol !== pr.vol) || (pr.no && have.no !== pr.no)) || (!pr.vol && !!have.vol);
    // another issue printed: it fills a line that names none, and replaces the line's only when the DOI bears it out (a
    // footnote can cite another issue of the same journal with its month)
    if (!ours && ((!have.vol && !have.no) || agrees(pr))) { line.issue = issueText(pr.vol, pr.no, ser, pr.unit); why.push(`권호: 논문에 ${issueText(pr.vol, pr.no, '', pr.unit)}`); ours = true; }
    if (ours && line.date.slice(0, 7) !== pr.ym) { line.date = pr.ym; why.push(`발간: 논문에 ${pr.ym}`); }
  }
  // 2. a printer named as the society, or none: the journal's society, as KCI names it (not a name any university's
  // institute has, like 법학연구소 alone)
  const generic = (p) => /^(?:법학연구소|법학연구원|법학연구센터|사회과학연구소|사회과학연구원|연구소|연구원)$/.test(String(p).replace(/\s+/g, ''));
  if (kciJournal && kciJournal.p && SOCIETY.test(kciJournal.p) && !generic(kciJournal.p) && (!line.society || PRINTERS.test(line.society.trim()))) {
    if (line.society !== kciJournal.p) { why.push(`학회: ${line.society || '(없음)'} → ${kciJournal.p}`); line.society = kciJournal.p; }
  }
  return { line, why };
}
// the DOIs printed on page 1 (for a line with no journal yet: Crossref names it)
export const doisOf = (p1) => doisIn(p1).map((d) => d.doi);
export const _test = { doisIn, printedIn, monthAt, issueAt };
