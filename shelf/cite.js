// 연구실 책장 — where a paper says it was published, read from the text of its own first pages: journal, 권/집, 호, 통권,
// year · month (· day), first–last page, and the paper's DOI.
// Korean law journals print this on the paper itself, in a header or footer of page 1 and the running heads after it:
//   국회입법조사처 『입법과 정책』 제13권 제1호 2021. 4. 30. pp.063~088        法과 政策硏究 / 第25輯 第4號 / 2025. 12.
//   법조 제73권 제2호(통권 제764호) 122∼147면 / 법조협회 2024. 4. 28.         ❙선거연구❙ 2025년 제23호
//   明知法學 제24권 제1호(2025. 7.)        航空宇宙政策․法學會誌 第 41 卷 第 1 號 / 2026년 4월 30일 발행, pp. 129~149
//   To cite this article : … , 입법학연구, 19:2, 159-184                       ∣160∣ 立法學硏究 제19집 제2호
// Input: page texts, one line of the page to a line of text (naming.js's lines, running heads included: the texts the app
// stores drop them), and optionally the names of KCI's journals (knownNames) to tell a journal from other words.
// Careful by design: what a footnote cites (another paper's journal) or a law (「…법」, 법률 제7681호) is never taken; a DOI
// only backs up what is printed (it picks between two printed issues, and adds the year or month only when its own volume
// and issue are the printed ones); nothing is returned when no journal is printed with its volume or issue.
// Pure and without imports: naming.js hands in its hangulize (第25輯 → 제25집), so the two never import each other.

// ---------------------------------------------------------------- text as the citation is read
const DOTS = /[․‧・･ㆍ·∙⋅•]/g;   // ․ ‧ ・ ･ ㆍ · ∙ ⋅ • → ·
const PUA = /[\uE000-\uF8FF]|[\u{F0000}-\u{FFFFD}]|[\u{100000}-\u{10FFFD}]/gu;   // private-use glyphs (a font's own marks)
// 『 』 as two text layers write them: U+0002/U+0003 (pdf.js) or 뺷/뺸 (U+BEB7/U+BEB8, other readers) — HWP's fonts; and
// other control characters, which no reader of the text wants
export const glyphs = (s) => String(s || '').replace(/[\u0002뺷]/g, '『').replace(/[\u0003뺸]/g, '』').replace(/｢/g, '「').replace(/｣/g, '」')
  .replace(PUA, ' ').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ');
export function normalize(s, han = (x) => x) {
  let t = glyphs(String(s || '').normalize('NFC'));
  t = t.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));   // full-width letters and digits
  t = t.replace(DOTS, '·').replace(/[‐‑]/g, '-');
  t = han(t);                                                                                 // 第25輯 第4號 → 제25집 제4호
  t = t.replace(/[❙∣│┃|]/g, ' | ');                                       // ❙ ∣ │ ┃ |: a rule between parts
  t = t.replace(/[ \t\u00A0\u2000-\u200B\u3000]+/g, ' ');
  t = t.replace(/제\s*(권|집)\s*(?:제\s*)?호\s*(\d+)\s+(\d+)(?!\d)/g, '제$2$1 제$3호').replace(/제\s*호\s*(\d+)/g, '제$1호');   // 제 권 호9 2: digits set apart
  t = t.replace(/(\d)\s+(권|집|호|년|월|일|면|쪽)(?![가-힣])/g, '$1$2').replace(/(\d)\s+(권|집|호)/g, '$1$2').replace(/(제|통권)\s+(?=\d)/g, '$1');
  return t;
}
// a journal's name as names are compared (spaces, dots and brackets aside)
export const nameKey = (s) => String(s || '').replace(/[\s·.,:;'"「」『』〈〉《》()[\]<>\-–—|]/g, '').toLowerCase();
// KCI's journals ([{ k, e }], kci-journals.json) → the set of their names by nameKey, as printedCitation's known (only to
// tell a journal from other words: KCI's spelling is not taken over, it has its slips — 항공우주정책 ·법학회지)
export const knownNames = (list) => new Set((list || []).flatMap((j) => [j && j.k, j && j.e].filter(Boolean).map(nameKey)));

// ---------------------------------------------------------------- the volume and issue on a line
// tokens: 제13권 · 제19집 · 2호 · 제24호 · 통권 제764호 · Vol.19 · No.2 · 19:2 (To cite …)
function tokens(line) {
  const out = [];
  const taken = (i) => out.some((t) => i >= t.at && i < t.end);
  for (const m of line.matchAll(/통권\s*(?:제\s*)?(\d{1,5})\s*호?/g)) out.push({ kind: 'ser', n: String(+m[1]), at: m.index, end: m.index + m[0].length });
  for (const m of line.matchAll(/(제\s*)?(\d{1,4})\s*(권|집)(?![가-힣])/g)) if (!taken(m.index)) out.push({ kind: 'vol', n: String(+m[2]), unit: m[3], je: !!m[1], at: m.index, end: m.index + m[0].length });
  for (const m of line.matchAll(/(제\s*)?(\d{1,4})\s*호(?![가-힣])/g)) {
    if (taken(m.index) || taken(m.index + (m[1] ? m[1].length : 0))) continue;
    const before = line.slice(Math.max(0, m.index - 8), m.index), after = line.slice(m.index + m[0].length, m.index + m[0].length + 3);
    if (/^\s*(?:\d{1,3}\))?\s*(?:에|의|및|와|과|부터|까지|에서|를|을|은|는|이|가|로|으로|에서는|에는)(?![가-힣]{2})/.test(line.slice(m.index + m[0].length))) continue;
    if (/[조항]\s*$/.test(before) || (/(?:^|[\s(「])(?:법률|대통령령|총리령|부령|령|조례|규칙|고시|훈령)\s*$/.test(before) && (m[2].length >= 3 || /^\s*(?:로|으로|에)/.test(after)))) continue;   // 법률 제7681호, 제12조 제3호
    out.push({ kind: 'no', n: String(+m[2]), je: !!m[1], at: m.index, end: m.index + m[0].length });
  }
  for (const m of line.matchAll(/\bVol(?:ume)?\.?\s*(\d{1,4})(?!\d)/gi)) {
    const lone = !/^\s*[.,]?\s*(?:No|Issue)\.?\s*\d/i.test(line.slice(m.index + m[0].length));   // Vol. 513 alone: the one running number
    out.push({ kind: lone ? 'no' : 'vol', n: String(+m[1]), unit: '권', en: true, at: m.index, end: m.index + m[0].length });
  }
  for (const m of line.matchAll(/\b(Serial\s+|Whole\s+)?(?:No|Issue)\.?\s*(\d{1,4})(?!\d)/gi)) if (!/^(?:19|20)\d{2}$/.test(m[2])) out.push({ kind: m[1] ? 'ser' : 'no', n: String(+m[2]), en: true, at: m.index, end: m.index + m[0].length });   // (Serial No. 10: 통권)
  for (const m of line.matchAll(/[』」]\s*\.?\s*(\d{1,4})\s*\(\s*(\d{1,3})\s*\)(?:\s*\.?\s*(\d{1,5})\s*[-–~∼]\s*(\d{1,5}))?/g)) {   // 『신앙과 학문』. 26(2). 163-191.
    const a = m.index + m[0].indexOf(m[1]);
    out.push({ kind: 'vol', n: String(+m[1]), unit: '권', colon: true, at: a, end: a + m[1].length });
    out.push({ kind: 'no', n: String(+m[2]), colon: true, at: a + m[1].length, end: m.index + m[0].length, fp: m[3] ? String(+m[3]) : '', lp: m[4] ? String(+m[4]) : '' });
  }
  for (const m of line.matchAll(/,\s*(\d{1,4}):(\d{1,3}),\s*(\d{1,5})\s*[-–~∼]\s*(\d{1,5})/g)) {   // , 19:2, 159-184
    out.push({ kind: 'vol', n: String(+m[1]), unit: '', colon: true, at: m.index + m[0].indexOf(m[1]), end: m.index + m[0].indexOf(':') });
    out.push({ kind: 'no', n: String(+m[2]), colon: true, at: m.index + m[0].indexOf(':') + 1, end: m.index + m[0].length, fp: String(+m[3]), lp: String(+m[4]) });
  }
  return out.sort((a, b) => a.at - b.at);
}
// tokens next to each other (only separators between) make one statement of the issue
function groups(line) {
  const ts = tokens(line), out = [];
  let g = null;
  for (const t of ts) {
    const gap = g ? line.slice(g.end, t.at) : '';
    const joins = g && /^[\s,.:()（）·]*$/.test(gap) && !(t.kind === 'vol' && (g.vol || g.no)) && !(t.kind === 'no' && g.no) && !(t.kind === 'ser' && g.ser);
    if (!joins) { g = { at: t.at, end: t.end, vol: '', unit: '', no: '', ser: '', en: !!t.en, colon: !!t.colon }; out.push(g); }
    if (t.kind === 'vol') { g.vol = t.n; g.unit = t.unit; }
    if (t.kind === 'no') { g.no = t.n; if (t.fp) { g.fp = t.fp; g.lp = t.lp; } }
    if (t.kind === 'ser') g.ser = t.n;
    g.end = t.end;
    g.je = g.je || !!t.je;
  }
  // a bare number with 권/집/호 and no 제 (12권, 3호) is weak alone: kept only next to another part or in English/colon form
  return out.filter((x) => x.je || x.en || x.colon || (x.vol && x.no) || x.ser);
}

// ---------------------------------------------------------------- the journal named before it
const PUBLISHER = /(?:학회|협회|연구원|연구소|연구회|조사처|위원회|재판소|법원|법제처|센터|학술원)$/;
const LAWNAME = /(?:법|법률|령|규칙|조례|조약|협약|헌장)$/;
// the words before an issue, as a journal's name: links, page numbers, years, a publisher in front and a rule's other side
// taken off (∣160∣ 입법학연구 · 국회입법조사처 『입법과 정책』 · 사단법인 한국공법학회 공법연구) — on normalized text
export function cleanName(s) {
  let t = String(s || '');
  t = t.replace(/<?https?:\/\/\S+|www\.\S+|doi:?\s*\S+|\b10\.\d{4,9}\/\S+/gi, ' ');
  t = t.replace(/\s*[(（]\s*[A-Za-z][^)）]*[)）]\s*/g, ' ');                                       // 경제규제와 법 (Journal of Law & …)
  t = t.replace(/(?:^|\s)-?\s*\d{1,4}\s*-?(?=\s|$)/g, ' ');                                       // page numbers (- 122 -, 64, 130)
  t = t.replace(/\(\s*\d{4}\s*\)|\d{4}\s*년|(?:19|20)\d{2}\s*\.\s*\d{1,2}\s*\.?/g, ' ');           // a year or date between name and issue
  t = t.replace(/\(?사\)?(?=\s*[가-힣]+(?:학회|협회))|사단법인|\(재\)|재단법인/g, ' ');
  t = t.replace(/[,:;]\s*$/, '').replace(/\s+/g, ' ').trim();
  const br = /[『「]\s*([^』」]{2,40}?)\s*[』」][^『「]*$/.exec(t);                                // the bracketed name, when there is one
  if (br) return { name: br[1].trim(), bracket: true };
  t = t.replace(/^[~〜∼『「\s]+|[』」\s]+$/g, '').replace(/^.*[』」]\s*/, '');                      // ~신앙과 학문』: a bracket read as ~
  const seg = t.split('|').map((x) => x.trim()).filter(Boolean);
  t = seg.length ? seg[seg.length - 1] : '';
  // a publisher before the name (국회입법조사처 입법과 정책): dropped when a name is left after it
  const w = t.split(' ');
  while (w.length > 1 && PUBLISHER.test(w[0])) w.shift();
  t = w.join(' ').replace(/^[\s,.·:(（-]+|[\s,.·:(（-]+$/g, '');
  return { name: t, bracket: false };
}
export function plausibleName(n) {
  if (!n || n.length < 2 || n.length > 40) return false;
  if (!/[가-힣A-Za-z]{2}/.test(n)) return false;
  if (/[“”"‘’]|[.?!]$|\s(?:및|의|에|을|를|은|는|이|가)\s/.test(n)) return false;      // a sentence or a quoted title
  if (/^(?:제|vol|no|pp?)\b/i.test(n)) return false;
  if (/^(?:과|와|의|및|은|는|이|가|을|를|에|로)\s/.test(n)) return false;                // the end of a word broken over two lines
  if (/^\(|^[^(]*\)$/.test(n)) return false;
  if (/제\s*\d+\s*조|\d\s*[조항]$/.test(n)) return false;   // 본 법 제2조 (but 법조, a journal)
  if (/제\s*\d+\s*[권집호]|통권\s*제?\s*\d/.test(n)) return false;   // an issue inside it: a running head whose digits were moved (경제규제와 법 제18권 제 호)
  return true;
}

// ---------------------------------------------------------------- date, pages, DOI
const NOT_PUB = /(?:접수|심사|게재\s*확정|게재\s*승인|투고|수정|제출|Received|Revised|Accepted|Download|Accessed|이용일|발표)/i;
// a date said to be when the paper was sent, reviewed or accepted (or downloaded) is cut out, the rest of the line kept
// (two columns read as one line: 2026년 4월 30일 발행, pp. 129~149 논문심사일 2026. 04. 23)
export const notPubDates = (s) => String(s || '').replace(/(?:논문)?(?:접수|심사(?:개시|완료)?|게재\s*확정|게재\s*승인|투고|수정|제출|발표)\s*일?\s*[:：]?\s*(?:19|20)\d{2}\s*[.년]\s*\d{1,2}\s*[.월]?\s*(?:\d{1,2}\s*[.일]?)?/g, ' ')
  .replace(/(?:Received|Revised|Accepted|Download(?:ed)?(?:\s*by)?|Accessed)\b.*$/i, ' ');
// links and DOIs out of a line before its dates are read (…/nec.2025.1.23.003 is no 23 January 2025)
export const stripLinks = (s) => String(s || '').replace(/https?:\/\/\S+|(?:doi\.org\/|doi:?\s*)\S+|\b10\.\d{4,9}\/\S+/gi, ' ');
function dateIn(s0, splitOk) {
  const s = stripLinks(s0);
  const ok = (y, m, d) => (+y >= 1950 && +y <= 2100 && (!m || (+m >= 1 && +m <= 12)) && (!d || (+d >= 1 && +d <= 31)));
  let m = /((?:19|20)\d{2})\s*년\s*(\d{1,2})\s*월(?:\s*(\d{1,2})\s*일)?/.exec(s);
  if (m && ok(m[1], m[2], m[3])) return { y: m[1], m: m[2], d: m[3] || '' };
  m = /(?:^|[^\d.])((?:19|20)\d{2})\s*\.\s*(\d{1,2})(?:\s*\.\s*(\d{1,2}))?\s*\.?(?![\d])/.exec(s);
  if (m && ok(m[1], m[2], m[3])) return { y: m[1], m: m[2], d: m[3] || '' };
  m = /((?:19|20)\d{2})\s+(\d{1,2})\s+(\d{1,2})(?!\d)/.exec(s);                       // 2026 4 30 … 년 월 일 발행 (the words read apart)
  if (m && splitOk && ok(m[1], m[2], m[3])) return { y: m[1], m: m[2], d: m[3] };
  m = /\(\s*((?:19|20)\d{2})\s*\)|((?:19|20)\d{2})\s*년(?![가-힣])(?!\s*\d)|((?:19|20)\d{2})\s*년\s*(?=제?\d+호)/.exec(s);
  if (m) return { y: m[1] || m[2] || m[3], m: '', d: '' };
  return null;
}
function pagesIn(s0) {
  const s = stripLinks(s0);
  const m = /\bpp?\.?\s*(\d{1,5})\s*[~∼～\-–—]\s*(\d{1,5})/i.exec(s) || /(\d{1,5})\s*[~∼～\-–—]\s*(\d{1,5})\s*(?:면|쪽)/.exec(s);
  if (m && +m[2] >= +m[1]) return { fp: String(+m[1]), lp: String(+m[2]) };
  return null;
}
// a KCI DOI's tail: 2021.13.1.003 · 2025.24.1.19 (year, volume, issue, page or number) · 31.3.202512.007 · ..513.202305.013
export function doiParts(doi) {
  let m = /[./](?:19|20)\d{2}[./](\d{1,3})[./](\d{1,3})[./](\d{1,5})$/.exec(doi);
  if (m) return { y: (/[./]((?:19|20)\d{2})[./]\d/.exec(doi) || [])[1], vol: String(+m[1]), no: String(+m[2]), tail: m[3] };
  m = /[./]((?:19|20)\d{2})\.\.(\d{1,4})\.(\d{1,5})$/.exec(doi);                               // unilaw.2024..57.122
  if (m) return { y: m[1], vol: '', no: String(+m[2]), tail: m[3] };
  m = /[./](\d{1,3})?[./](\d{1,4})[./]((?:19|20)\d{2})(\d{2})[./]\d{1,5}$/.exec(doi);
  if (m && +m[4] >= 1 && +m[4] <= 12) return { y: m[3], m: m[4], vol: m[1] ? String(+m[1]) : '', no: String(+m[2]) };
  return null;
}
function footnoteish(line) {
  return /^\s*\d{1,3}\)\s*\S/.test(line) || /^\s*[*†‡]+\s*\S/.test(line) && /(?:교수|연구원|박사|학생|강사|변호사)/.test(line) || /[“”"]/.test(line)
    || /(?:면|쪽|pp?\.\s*\d+)\s*\.\s*$/.test(line) || /\)\s*\.\s*$/.test(line) || /(?:다|음|함|됨|임)\s*\.\s*$/.test(line) || /(?:참조|재인용|선고|판결|결정)/.test(line) || /,\s*(?:19|20)\d{2}\s*,\s*\d/.test(line);
}
const DOI_RE = /\b10\.\d{4,9}\/(?:(?!https?:)[^\s"'<>()（）])+/g;
// the DOIs of a page's text, a footnote's left out (one starting "12) …" cites another paper)
export function doisIn(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    if (/^\s*\d{1,3}\)/.test(line)) continue;
    for (const m of line.match(DOI_RE) || []) { const d = m.replace(/[.,;:]+$/, ''); if (!out.includes(d)) out.push(d); }
  }
  return out;
}

// ---------------------------------------------------------------- the whole
// pages: [text of page 1, page 2, …] (the first three or four are enough); known: a Set of names by nameKey, or null;
// hangulize: naming.js's (hanja read in Hangul), or none. → { found, journal, vol, unit, no, ser, date: { y, m, d } | null,
// pages: { fp, lp } | null, doi, evidence, cite } or { found: false, why, doi }
export function printedCitation(pages, { known = null, hangulize = null, signatures = SIGNATURES } = {}) {
  const han = hangulize || ((x) => x);
  // the first pages that carry text (a blank page, as a cover's back, is passed over: 법제's PDFs open with two)
  const P = (pages || []).slice(0, 8).map((t) => normalize(t, han).split('\n').map((x) => x.trim())).filter((ls) => ls.some((x) => x.replace(/\s/g, '').length > 0)).slice(0, 5);
  const cands = [];
  P.forEach((ls, pi) => {
    const nonEmpty = ls.map((x, i) => [x, i]).filter(([x]) => x);
    const rank = new Map(nonEmpty.map(([, i], k) => [i, k]));
    const last = nonEmpty.length;
    const fnAt = [];   // a footnote's lines, its wrapped continuation lines too (…, 입법 / 과 정책(제14권 제2호), 국회입법조사처(2022).)
    let run = 0;   // (a numbered or quoting footnote's next lines, up to three, until one ends a sentence)
    ls.forEach((line, li) => {
      const prev = li ? ls[li - 1] : '';
      const starts = !!line && (/^\s*\d{1,3}\)\s*\S/.test(line) || /[“”"]/.test(line));
      run = starts ? 3 : run > 0 && !!prev && !/[.!?」』]\s*$/.test(prev) ? run - 1 : 0;
      fnAt[li] = !!line && (footnoteish(line) || (!starts && run > 0 && run < 3) || starts);
    });
    ls.forEach((line, li) => {
      if (!line) return;
      const k = rank.get(li);
      const zone = pi === 0 ? (k < 8 || k >= last - 8 ? 3 : 0) : (k < 2 || k >= last - 2 ? 2 : 0);
      const footnote = fnAt[li];
      for (const g of groups(line)) {
        let { name, bracket } = cleanName(line.slice(0, g.at));
        let from = 'same';
        if (!plausibleName(name)) {                                // 法과 政策硏究 / 第25輯 第4號: the name on the line before
          for (let b = li - 1; b >= Math.max(0, li - 3); b--) {
            if (!ls[b] || /^\s*<?(?:https?:\/\/|doi|10\.\d{4,9}\/)/i.test(ls[b])) continue;   // (a DOI line between)
            const c = cleanName(ls[b]);
            if (plausibleName(c.name) && c.name.length <= 30) { name = c.name; bracket = c.bracket; from = 'above'; }
            break;
          }
        }
        if (!plausibleName(name)) {
          const rest = line.slice(g.end).replace(/^[\s,.)]+/, '').trim();
          if (/^[가-힣][가-힣·\s]{1,25}$/.test(rest) && line.length <= 50) { name = rest; bracket = false; from = 'after'; }
        }
        if (g.colon) {                                              // , 입법 학연구, 19:2 → the words between the commas before
          const joined = (ls[li - 1] || '') + ' ' + line.slice(0, g.at);
          const cm = /([^,]{2,40}),\s*$/.exec(joined);
          if (cm) { name = cm[1].trim(); from = 'colon'; }
        }
        if (!plausibleName(name)) continue;
        const fn = footnote || (from === 'above' && footnoteish(ls[li - 1] || '')) || /^[\s,.()]*(?:(?:[가-힣A-Za-z·\s]+(?:학회|협회|연구원|연구소|조사처|대학교|재단))?\s*,\s*(?:19|20)\d{2}\s*[,.)]|[가-힣A-Za-z·\s]+(?:학회|협회|연구원|연구소|조사처|대학교|재단)\s*\(\s*(?:19|20)\d{2}\s*\))/.test(line.slice(g.end));   // …), 국회입법조사처(2022). · …, 한국항공우주정책·법학회, 2011, 3-12면.
        const kn = known ? known.has(nameKey(name)) : false;
        if (!kn && LAWNAME.test(name.replace(/\s/g, '')) && (/[「『]/.test(line) || !bracket)) continue;   // 산업안전보건법, 「개식용종식법」: a law
        const after = line.slice(g.end) + ' ' + (ls[li + 1] || '') + ' ' + (ls[li + 2] || '');
        const beforeDate = dateIn(notPubDates(line.slice(0, g.at)), false);
        // a line that is a header's (a date, a publisher, pages), not the text: little Hangul is left once those are taken out
        const headerish = (x) => !!x && (notPubDates(stripLinks(x)).replace(/(?:19|20)\d{2}\s*[.년]\s*\d{0,2}\s*[.월]?\s*(?:\d{1,2}\s*[.일]?)?/g, '').replace(/[가-힣A-Za-z·]+(?:학회|협회|연구원|연구소|조사처|위원회|법원|재판소)|발행|발간|pp?\.?|면|쪽/g, '').match(/[가-힣]/g) || []).length <= 12;
        const block = [line.slice(g.end), headerish(ls[li + 1]) ? ls[li + 1] : '', headerish(ls[li + 1]) && headerish(ls[li + 2]) ? ls[li + 2] : ''].map(notPubDates).join(' ');
        const splitOk = /년\s*월\s*일/.test(ls.slice(Math.max(0, li - 3), li + 6).join(' '));
        const prevSame = li > 0 && ls[li - 1] && nameKey(ls[li - 1]).includes(nameKey(name)) && headerish(ls[li - 1]) ? dateIn(notPubDates(ls[li - 1]), false) : null;
        const date = dateIn(block, splitOk) || (beforeDate ? beforeDate : null) || prevSame;
        const nextG = groups(line).find((x) => x.at > g.at && ((x.vol && g.vol && x.vol !== g.vol) || (x.no && g.no && x.no !== g.no)));   // another issue laid over this one
        const pages = g.fp ? { fp: g.fp, lp: g.lp } : pagesIn(nextG ? line.slice(g.end, nextG.at) : after);
        const score = zone + (kn ? 3 : 0) + (bracket ? 1 : 0) + (date ? 1 : 0) + (pages ? 1 : 0) + (/[가-힣]/.test(name) ? 1 : 0) - (fn ? 12 : 0);
        cands.push({ name, from, bracket, known: kn, page: pi + 1, line: li, zone, footnote: fn, vol: g.vol, unit: g.unit, no: g.no, ser: g.ser, date, pages, score, text: line });
      }
    });
  });
  // the DOI printed with page 1's head (not a footnote's)
  let doi = null;
  const dois = [];
  for (const line of P[0] || []) { if (/^\s*\d{1,3}\)/.test(line)) continue; for (const m of line.match(DOI_RE) || []) dois.push(m.replace(/[.,;:]+$/, '')); if (dois.length) break; }
  doi = dois[0] || null;
  const dp = doi ? doiParts(doi) : null;
  const strong = cands.some((c) => c.score >= 3);
  // (a journal named only in a running foot with the page's number: its volume and issue are not taken from the DOI — the
  // DOI backs up what is printed and never stands in for it)
  if (!strong) { const sg = fromSignature(P, signatures, doi); return sg.found || !cands.length ? sg : { found: false, why: 'only weak mentions', cands: cands.slice(0, 3), doi }; }
  // the same journal named again (a running head) backs it up
  const byName = new Map();
  for (const c of cands) { const k = nameKey(c.name); byName.set(k, (byName.get(k) || 0) + 1); }
  for (const c of cands) if (byName.get(nameKey(c.name)) >= 2) c.score += 2;
  if (dp) for (const c of cands) if (c.no && c.no === dp.no && (!c.vol || c.vol === dp.vol || (!c.vol && dp.vol === '1'))) c.score += 2;
  cands.sort((a, b) => b.score - a.score || a.page - b.page || a.line - b.line);
  const best = cands[0];
  if (dois.length > 1) { const hit = dois.find((d) => { const x = doiParts(d); return x && x.no === best.no && (!best.vol || x.vol === best.vol); }); if (hit) { doi = hit; } }
  const dpBest = doi ? doiParts(doi) : null;
  for (const c of cands) if (c !== best && c.date && best.date && Math.abs(+c.date.y - +best.date.y) > 1) c.footnote = true;
  if (best.score < 3) return { found: false, why: 'only weak mentions', cands: cands.slice(0, 3), doi };
  // what the other mentions of the same journal add (통권 printed on page 1, the date in a running head …)
  const same = cands.filter((c) => nameKey(c.name) === nameKey(best.name) && !c.footnote);
  const asPrinted = same.find((c) => c.from !== 'colon' && c.zone) || same.find((c) => c.from !== 'colon') || best;
  const pick = (k) => best[k] || (same.find((c) => c[k] && (k !== 'vol' || !best.no || c.no === best.no)) || {})[k] || '';
  const out = { found: true, journal: asPrinted.name, vol: best.vol || (best.no ? pick('vol') : ''), unit: best.unit || pick('unit'), no: best.no || pick('no'), ser: pick('ser'),
    date: best.date || (same.find((c) => c.date && c.date.m) || same.find((c) => c.date) || {}).date || null, pages: best.pages || (same.find((c) => c.pages) || {}).pages || null, doi, evidence: [] };
  // the DOI agreeing with the printed issue; and then filling the year/month when nothing printed one
  if (dpBest) {
    const d = dpBest;
    const agree = d.no === out.no && (!out.vol || d.vol === out.vol || (d.vol === '1' && !out.vol));
    out.evidence.push(agree ? 'DOI agrees' : `DOI says ${d.vol || ''}/${d.no} (not used)`);
    if (agree && !out.date && d.y) out.date = { y: d.y, m: d.m || '', d: '' };
    if (agree && out.date && !out.date.m && d.m && out.date.y === d.y) out.date = { ...out.date, m: d.m };
    if (agree && !out.pages && d.tail && !/^0/.test(d.tail) && +d.tail > 0) out.pages = { fp: String(+d.tail), lp: '' };
  }
  // page 1's own printed page number (- 19 -, －39－) when no range was printed, and over a range that disagrees with it
  const pn = firstPageNo(P);
  if (!out.pages && pn) out.pages = { fp: pn, lp: '' };
  else if (out.pages && pn && out.pages.fp !== pn && Math.abs(+out.pages.fp - +pn) > 1) { out.evidence.push(`printed range ${out.pages.fp}-${out.pages.lp} disagrees with the page numbers (${pn})`); out.pages = { fp: pn, lp: '' }; }
  out.cite = citeText(out);
  out.from = `p${best.page}: ${best.text}`;
  out.cands = cands.slice(0, 6).map((c) => `${c.score}: p${c.page} "${c.name}" ${c.vol}${c.unit} ${c.no}호${c.ser ? ' 통권' + c.ser : ''} date=${c.date ? c.date.y + '-' + c.date.m : '-'}${c.footnote ? ' (footnote)' : ''}`);
  return out;
}
function firstPageNo(P) {
  const ls = (P[0] || []).filter(Boolean);
  for (const line of [...ls.slice(0, 3), ...ls.slice(-3)]) { const m = /^\s*-\s*(\d{1,4})\s*-\s*$/.exec(line) || /^\s*(\d{1,4})\s*$/.exec(line); if (m) return String(+m[1]); }
  // the running head of page 2 carries its number: page 1 is one less
  const l2 = (P[1] || []).filter(Boolean);
  for (const line of [...l2.slice(0, 2), ...l2.slice(-2)]) { const m = /^\s*-?\s*(\d{1,4})\s*-?\s+\S|\S\s+(\d{1,4})\s*$/.exec(line); if (m && +(m[1] || m[2]) > 1) return String(+(m[1] || m[2]) - 1); }
  return '';
}
// journals that print no volume or issue, known by their running heads (법제: "Ministry of Government Legislation", 법제논단)
const SIGNATURES = [{ re: /Ministry of Government Legislation|법제논단[\s\S]{0,400}Legislation|Legislation[\s\S]{0,400}법제논단|법\s*\n?\s*제\s*\n?\s*Legislation/i, journal: '법제', society: '법제처' }];
function fromSignature(P, signatures, doi) {
  const all = P.map((ls) => ls.join('\n')).join('\n');
  for (const s of signatures || []) {
    if (!s.re.test(all)) continue;
    let date = null, fp = '';
    for (const ls of P) {   // its running head: "2024. 12 115" (the month, then the page), on one line or two
      const x = ls.filter(Boolean);
      for (const i of [...Array(Math.min(x.length, 4)).keys(), ...[4, 3, 2, 1].map((k) => x.length - k).filter((k) => k >= 4)]) {
        if (date) break;
        const d = NOT_PUB.test(x[i]) ? null : dateIn(x[i], false);
        if (!d || !d.m || !/^\s*(?:19|20)\d{2}\s*\.\s*\d{1,2}\s*\.?\s*(?:\d{1,4})?\s*$/.test(x[i])) continue;
        date = d;
        const m = /(?:19|20)\d{2}\s*\.\s*\d{1,2}\s*\.?\s+(\d{1,4})\s*$/.exec(x[i]) || /^\s*(\d{1,4})\s*$/.exec(x[i + 1] || '');
        if (m) fp = m[1];
      }
      if (date) break;
    }
    const out = { found: true, journal: s.journal, society: s.society, vol: '', unit: '', no: '', ser: '', date, pages: fp ? { fp, lp: '' } : null, doi, evidence: ['journal known by its running head; no issue printed'] };
    out.cite = citeText(out);
    return out;
  }
  return { found: false, why: 'no journal printed with a volume or issue', doi };
}
// the issue as the shelf writes it: 제13권 제1호 · 제19집 제2호 · 제24호 · 제73권 제2호 (통권 제764호)
export function issueText(c) {
  const v = c.vol ? `제${c.vol}${c.unit || '권'}` : '', n = c.no ? `제${c.no}호` : '';
  const main = [v, n].filter(Boolean).join(' ');
  return c.ser ? (main ? `${main} (통권 제${c.ser}호)` : `통권 제${c.ser}호`) : main;
}
// the date as the shelf keeps it: 2021-04-30 · 2021-04 · 2021
export const dateText = (d) => (d && d.y ? d.y + (d.m ? '-' + String(+d.m).padStart(2, '0') + (d.d ? '-' + String(+d.d).padStart(2, '0') : '') : '') : '');
function citeText(c) {
  const d = c.date ? `${c.date.y}${c.date.m ? '. ' + +c.date.m + '.' : ''}` : '';
  const p = c.pages ? `${c.pages.fp}${c.pages.lp ? '-' + c.pages.lp : ''}` : '';
  return [c.journal + (issueText(c) ? ' ' + issueText(c) : ''), d, p].filter(Boolean).join(', ');
}
export const _test = { tokens, groups, dateIn, pagesIn };
