/* 법학 문헌을 규칙으로 읽는 도구들 — AI 없이, 같은 입력에는 언제나 같은 결과.
   빠른 파악(목차·초록·주제어·결론·판례·조문), 각주 속 인용, 문체 수치, 유사 문장, 원고 점검. */

/* ---------------- 공통 ---------------- */
export const HEAD_RE = /^\s*(제\s*\d+\s*[장절편](?=\s)|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*[.．]|(?:I{1,3}|IV|VI{0,3}|IX|X)\s*[.．])\s*\S/;
export const TOP_RE = /^\s*(제\s*\d+\s*[장편](?=\s)|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*[.．]|(?:I{1,3}|IV|VI{0,3}|IX|X)\s*[.．])/;
const SUB_RE = /^\s*(\d{1,2}\s*[.．]\s*\S|[가-하]\s*[.．]\s*\S)/;
const ABS_RE = /^\s*[<\[【〈(《]?\s*(국\s*문\s*초\s*록|국\s*문\s*요\s*약|논\s*문\s*요\s*약|논\s*문\s*요\s*지|초\s*록|요\s*약|요\s*지)\s*[>\]】〉)》]?\s*$/;
const ABS_END = /^\s*[<\[【〈(]?\s*(주\s*제\s*어|핵\s*심\s*어|주\s*요\s*어|검\s*색\s*어|키\s*워\s*드|key\s*-?\s*words?|abstract|목\s*차)/i;
const REF_RE = /^\s*[<\[【〈(]?\s*(참\s*고\s*문\s*헌|bibliography|references)\s*[>\]】〉)]?\s*$/i;
const INTRO_RE = /서\s*론|서\s*설|들\s*어\s*가\s*며|머\s*리\s*말|문\s*제\s*의\s*제\s*기/;
const CONC_RE = /결\s*론|맺\s*음\s*말|맺\s*는\s*말|나\s*가\s*며|결\s*어|마\s*치\s*며/;
const TOC_LINE = /(\.{3,}|·{3,}|…|‥|\s\d{1,3}\s*$)/;
const KW_RE = /^\s*[<\[【〈(]?\s*(주\s*제\s*어|핵\s*심\s*어|주\s*요\s*어|검\s*색\s*어|키\s*워\s*드)\s*[>\]】〉)]?\s*[:：]?\s*(.*)$/;
const LAW_END = /(법|법률|시행령|시행규칙|규칙|조례|규정|헌법)$/;
const LAW_STOP = /(방법|입법|사법|위법|불법|적법|합법|편법|문법|기법|수법|해법|어법|화법|용법|비법|탈법|준법|변법|본법|동법|이 법|같은 법|법률|헌법상|헌법적)$/;
export const CASE_RE = /(?<![\d가-힣])((?:19|20)\d{2}|[89]\d)\s?(헌[가나다라마바사아]|재다|재두|재도|구합|가합|고합|다|도|두|누|마|스|므|후|추|그|노|나)\s?(\d{1,6})(?![\d가-힣])/g;
export const caseCourt = (k) => (/헌[가-아]/.test(k) ? '헌법재판소' : /구합|가합|고합/.test(k) ? '하급심' : '대법원');
const lines = (pages) => { const L = []; pages.forEach((t, i) => String(t || '').split('\n').forEach((x) => { const v = x.replace(/\s+/g, ' ').trim(); if (v) L.push({ p: i + 1, t: v }); })); return L; };
/* some journal PDFs carry 『』「」 as other glyphs (뺷…뺸, private-use marks, half-width ｢｣): put them back */
export const fixGlyphs = (t) => String(t || '').replace(/[뺷\u{F0854}]/gu, '『').replace(/[뺸\u{F0855}]/gu, '』').replace(/｢/g, '「').replace(/｣/g, '」');
export const normKey = (s) => String(s || '').toLowerCase().replace(/[^0-9a-z가-힣一-鿿]/g, '');
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };

/* ---------------- 빠른 파악 ---------------- */
export function extractFacts(pages) {
  try {
    const L = lines(pages), n = L.length;
    let end = n; for (let i = n - 1; i > n * 0.4; i--) if (REF_RE.test(L[i].t)) { end = i; break; }
    const outline = []; const seen = new Set();
    for (let i = 0; i < end && outline.length < 120; i++) {
      const t = L[i].t;
      if (t.length > 80 || TOC_LINE.test(t) || seen.has(t)) continue;
      if (HEAD_RE.test(t)) { seen.add(t); outline.push({ t, p: L[i].p, lv: TOP_RE.test(t) ? 1 : 2 }); }
      else if (SUB_RE.test(t) && t.length <= 40 && outline.length && !/[다요]\.\s*$/.test(t) && /[가-힣A-Za-z]{2}/.test(t)) { seen.add(t); outline.push({ t, p: L[i].p, lv: 3 }); }
    }
    const run = (from, to, max) => { let out = '', p = 0; for (let i = from; i < to && out.length < max; i++) { if (!p) p = L[i].p; out += L[i].t + ' '; } out = out.trim(); return { text: out.length > max ? out.slice(0, max).replace(/\s\S*$/, '') + ' …' : out, p }; };
    let abstract = null;
    for (let i = 0; i < n; i++) if (ABS_RE.test(L[i].t)) {
      let j = i + 1; while (j < n && j - i < 160 && !ABS_END.test(L[j].t) && !HEAD_RE.test(L[j].t) && !REF_RE.test(L[j].t) && !KW_RE.test(L[j].t)) j++;
      const r = run(i + 1, j, 2400); if (r.text.length > 40) { abstract = r; break; }
    }
    let keywords = [];
    for (let i = 0; i < n; i++) { const m = L[i].t.match(KW_RE); if (m) { const rest = m[2] || (L[i + 1] ? L[i + 1].t : ''); keywords = rest.split(/\s*[,，·;；]\s*/).map((x) => x.trim()).filter((x) => x && x.length <= 30).slice(0, 15); if (keywords.length) break; } }
    let intro = null, conclusion = null;
    const tops = outline.filter((h) => h.lv === 1);
    const at = (h) => L.findIndex((x) => x.t === h.t && x.p === h.p);
    const nextTop = (i) => { let s = i + 1; while (s < end && !(TOP_RE.test(L[s].t) && HEAD_RE.test(L[s].t) && L[s].t.length <= 80)) s++; return s; };
    const ih = tops.find((h) => INTRO_RE.test(h.t)); if (ih) { const i = at(ih); if (i >= 0) { const r = run(i + 1, nextTop(i), 1400); if (r.text) intro = { head: ih.t, ...r }; } }
    for (let k = tops.length - 1; k >= 0; k--) if (CONC_RE.test(tops[k].t)) { const i = at(tops[k]); if (i >= 0) { const r = run(i + 1, nextTop(i), 2400); if (r.text) conclusion = { head: tops[k].t, ...r }; } break; }
    const lawMap = new Map(), caseMap = new Map();
    const addTo = (map, key, p) => { const e = map.get(key) || { key, n: 0, pages: [] }; e.n++; if (!e.pages.includes(p)) e.pages.push(p); map.set(key, e); };
    pages.forEach((raw, i) => {
      const t = fixGlyphs(raw).replace(/\s+/g, ' '), p = i + 1;
      for (const m of t.matchAll(/「\s*([^」]{2,40}?)\s*」\s*(제\s*\d+\s*조(?:\s*의\s*\d+)?)?/g)) { const name = m[1].trim(); if (LAW_END.test(name) && !LAW_STOP.test(name)) addTo(lawMap, name + (m[2] ? ' ' + m[2].replace(/\s+/g, '') : ''), p); }
      for (const m of t.matchAll(/(?<![가-힣」])([가-힣·]{2,25})\s*제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/g)) {
        const name = m[1]; if (!LAW_END.test(name) || LAW_STOP.test(name)) continue;
        if (name.length === 2 && !['헌법', '민법', '형법', '상법'].includes(name)) continue;
        addTo(lawMap, `${name} 제${m[2]}조${m[3] ? '의' + m[3] : ''}`, p);
      }
      for (const m of t.matchAll(CASE_RE)) addTo(caseMap, `${m[1]}${m[2]}${m[3]}`, p);
    });
    const top = (map, k) => [...map.values()].sort((a, b) => b.n - a.n || a.pages[0] - b.pages[0]).slice(0, k);
    return { outline, abstract, keywords, intro, conclusion, laws: top(lawMap, 80), cases: top(caseMap, 80), v: 2 };
  } catch (e) { return { outline: [], abstract: null, keywords: [], intro: null, conclusion: null, laws: [], cases: [], v: 2 }; }
}

/* ---------------- 각주 속 인용 (서재 인용망) ---------------- */
const mainTitle = (t) => String(t || '').split(/\s[-–—:]\s|:\s|[–—]/)[0].trim();
export const titleKey = (t) => normKey(mainTitle(t));
const NAME = '(?:[가-힣]{2,4}(?:[·ㆍ,]\\s?[가-힣]{2,4}){0,3}(?:\\s?외\\s?\\d+\\s?인)?|[가-힣]{2,12}(?:학회|연구원|연구소|위원회|조사처|법원|재판소|부|처|청)|[A-Z][A-Za-z.\'\\-]+(?:\\s[A-Z][A-Za-z.\'\\-]+){0,4}(?:\\s(?:et al\\.|&\\s[A-Z][A-Za-z.\\-]+))?)';
const CITE_ART = new RegExp(`(?:^|[\\s.;:)\\]】])(${NAME}),\\s*[“"]([^”"]{4,200})[”"]\\s*,?\\s*(?=[『「(（]|[A-Z][A-Za-z]|[가-힣]{2,}\\s*(?:제|Vol|vol))`, 'g');
const CITE_BOOK = new RegExp(`(?:^|[\\s.;:)\\]】])(${NAME}),\\s*『([^』]{2,90})』\\s*(?=[(（]|,)`, 'g');
// reference lists in the author-date style: 저자. 2015. “제목.” 『학술지』 … / 저자. 2015. 『책』. 출판지: 출판사.
const REF_ART = new RegExp(`(?:^|[\\s.])(${NAME})\\.\\s*((?:19|20)\\d{2})[a-z]?\\.\\s*[“"]([^”"]{4,200}?)[.,]?[”"]`, 'g');
const REF_BOOK = new RegExp(`(?:^|[\\s.])(${NAME})\\.\\s*((?:19|20)\\d{2})[a-z]?\\.\\s*『([^』]{2,90})』`, 'g');
/* full citations written in footnote style anywhere in a text: 저자, “논문”, 『학술지』 … / 저자, 『책』 (출판사 …) */
export function citesIn(text) {
  const out = []; const t = fixGlyphs(text).replace(/\s+/g, ' ');
  for (const m of t.matchAll(CITE_ART)) out.push({ author: m[1].trim(), title: m[2].trim(), kind: /[A-Za-z]{3}/.test(m[1]) && !/[가-힣]/.test(m[2]) ? 'foreign' : 'article' });
  for (const m of t.matchAll(CITE_BOOK)) out.push({ author: m[1].trim(), title: m[2].trim(), kind: 'book' });
  for (const m of t.matchAll(REF_ART)) out.push({ author: m[1].trim(), title: m[3].trim(), year: m[2], kind: 'article' });
  for (const m of t.matchAll(REF_BOOK)) out.push({ author: m[1].trim(), title: m[3].trim(), year: m[2], kind: 'book' });
  return out.filter((c) => c.title.length >= 4 && titleKey(c.title).length >= 4);
}
export function citationsIn(pages) {
  const out = new Map();
  for (const c of citesIn(pages.map((x) => String(x || '')).join('\n'))) { const key = titleKey(c.title); if (!out.has(key)) out.set(key, { key, ...c }); }
  return [...out.values()];
}

/* ---------------- 본문만: 쪽 아래의 각주, 본문 속 각주 번호, 참고문헌을 뺀다 ----------------
   문체 수치는 늘 이렇게 뽑은 본문으로 잰다(박사학위논문의 본문, 학술지 논문의 본문, 새 원고의 본문이 같은 기준). */
const NOTE_START = /^\s*(\d{1,3})\)\s*\S/;
const NOTE_LIKE = /[“『「"]|선고|결정|판결|\d\s*면|쪽\.|pp?\.\s*\d|참조|참고|앞의|같은 곳|위의 |https?:|\(\d{4}|[A-Z][a-z]+,/;
export function stripPageNotes(lines, state) { // the footnote block at the foot of one page starts at the next expected note number
  let cut = lines.length;
  for (let i = 2; i < lines.length; i++) {
    const m = lines[i].match(NOTE_START); if (!m) continue;
    const n = +m[1]; if (n < state.next || n > state.next + 3) continue;
    if (!NOTE_LIKE.test(lines[i]) && lines[i].trim().length <= 45) continue; // “1) 조사권 발동요건” is a heading
    cut = i; break;
  }
  for (let i = cut; i < lines.length; i++) { const m = lines[i].match(NOTE_START); if (m && +m[1] >= state.next && +m[1] < state.next + 40) state.next = +m[1] + 1; }
  return lines.slice(0, cut);
}
const NOTE_MARK = /([.,;:?!”’」』)다])(\d{1,3})\)(?=[\s,.]|$)/g;
export function bodyOfPages(pages) {
  const state = { next: 1 }, out = [];
  for (const raw of pages || []) {
    const t = fixGlyphs(raw); if (/^\s*\[각주\]/.test(t)) break; // 한글 문헌: the notes are kept after the body
    out.push(stripPageNotes(t.split('\n'), state).join('\n'));
  }
  let text = out.join('\n').replace(NOTE_MARK, '$1');
  const refs = [...text.matchAll(/\n\s*[\[<【]?\s*(참\s*고\s*문\s*헌|References|Bibliography)\s*[\]>】]?\s*\n/gi)].filter((m) => m.index > text.length * 0.4);
  if (refs.length) text = text.slice(0, refs[refs.length - 1].index);
  return text.replace(/-\s*\d+\s*-|\n\s*\d{1,3}\s*\n/g, '\n');
}

/* ---------------- 문체 수치 ---------------- */
export function sentencesOf(text) {
  const flat = String(text || '').replace(/〔주\d+〕/g, '').replace(/\s+/g, ' ');
  return flat.split(/(?<=[다요음])\.\s+(?=\S)|(?<=[다요])\.(?=["”’])/).map((s) => s.trim()).filter((s) => s.length >= 8);
}
const ASSERT_RE = /(필요가 있다|필요하다|타당하다|바람직하다|하여야 한다|해야 한다|되어야 한다|돼야 한다|할 것이다|옳다)$/;
const HEDGE_RE = /(생각된다|판단된다|보인다|여겨진다|싶다|할 수 있을 것이다|라 할 수 있다|볼 수 있을 것이다|추측된다|아닐까 한다)$/;
export function styleMetrics(text) {
  const sents = sentencesOf(text), flat = String(text || '').replace(/〔주\d+〕/g, '');
  const chars = flat.replace(/\s+/g, ' ').length || 1;
  const lens = sents.map((s) => s.length).sort((a, b) => a - b);
  const q = (p) => (lens.length ? lens[Math.min(lens.length - 1, Math.floor(p * lens.length))] : 0);
  const ends = sents.map((s) => s.replace(/[.”"’\s]+$/, ''));
  const per1k = (n) => Math.round((n / chars) * 100000) / 100; // per 1,000 characters
  return {
    sentences: sents.length, chars,
    avgLen: lens.length ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length) : 0, median: q(0.5), p90: q(0.9),
    longShare: lens.length ? Math.round((lens.filter((x) => x > 200).length / lens.length) * 1000) / 10 : 0,
    assertShare: sents.length ? Math.round((ends.filter((e) => ASSERT_RE.test(e)).length / sents.length) * 1000) / 10 : 0,
    hedgeShare: sents.length ? Math.round((ends.filter((e) => HEDGE_RE.test(e)).length / sents.length) * 1000) / 10 : 0,
    quoteMarks: per1k((flat.match(/‘[^’\n]{1,40}’/g) || []).length),
    hanja: per1k((flat.match(/[가-힣]\([一-鿿]{2,}\)/g) || []).length),
    selfRef: per1k((flat.match(/본고|본 연구|본 논문|이 글/g) || []).length),
    pilja: (flat.match(/필자/g) || []).length,
    geugeosida: per1k((flat.match(/(?:이|가) 그것이다/g) || []).length),
  };
}

/* ---------------- 유사 문장 (7어절 연쇄) ---------------- */
export const words = (t) => String(t || '').replace(/〔주\d+〕/g, ' ').match(/[0-9A-Za-z가-힣一-鿿]+/g) || [];
export function shingleHashes(t, k = 7) { const w = words(t), out = []; for (let i = 0; i + k <= w.length; i++) out.push(fnv(w.slice(i, i + k).join(' '))); return out; }
/* sentences of a manuscript that share at least `min` 7-word runs with one page of a source */
export function similarSentences(sents, sources, min = 2) {
  const index = new Map(); // hash -> [sentence index]
  sents.forEach((s, i) => { for (const h of shingleHashes(s)) { const a = index.get(h); if (a) { if (a[a.length - 1] !== i) a.push(i); } else index.set(h, [i]); } });
  const best = new Map(); // sentence -> {doc, page, n}
  for (const src of sources) src.pages.forEach((pg, pi) => {
    const counts = new Map();
    for (const h of shingleHashes(pg)) { const a = index.get(h); if (a) for (const i of a) counts.set(i, (counts.get(i) || 0) + 1); }
    for (const [i, n] of counts) if (n >= min && (!best.has(i) || best.get(i).n < n)) best.set(i, { doc: src.id, page: pi + 1, n });
  });
  return [...best.entries()].map(([i, b]) => ({ i, sentence: sents[i], ...b, total: Math.max(1, words(sents[i]).length - 6) })).sort((a, b) => a.i - b.i);
}

/* ---------------- 원고 읽기 ---------------- */
/* a manuscript is paragraphs with 〔주n〕 marks plus the notes; from PDF/text it is just paragraphs */
export function manuscriptHeads(paras) {
  return paras.map((t, i) => ({ i, t: t.trim() })).filter((x) => x.t.length <= 80 && (HEAD_RE.test(x.t) || /^\d{1,2}\.\s+\S/.test(x.t) && x.t.length <= 50 && !/[다요]\.\s*$/.test(x.t)) && !TOC_LINE.test(x.t));
}
export function quotesIn(paras) {
  const out = [];
  paras.forEach((p, pi) => {
    for (const m of p.matchAll(/[“"]([^”"]{12,600})[”"]/g)) {
      const before = p.slice(Math.max(0, m.index - 3), m.index), after = p.slice(m.index + m[0].length, m.index + m[0].length + 3);
      if (/,\s*$/.test(before) && /^\s*[,『「:(]/.test(after)) continue; // 저자, “제목”, … is a title, not a quotation
      // the note usually follows the quoting verb: “…”라고 한다.〔주40〕 — the first note before the next quotation
      const rest = p.slice(m.index + m[0].length, m.index + m[0].length + 70), stop = rest.search(/[“"]/), nm = (stop >= 0 ? rest.slice(0, stop) : rest).match(/〔주(\d+)〕/);
      const note = nm ? +nm[1] : 0;
      out.push({ para: pi, text: m[1], note });
    }
  });
  return out;
}
const squash = (s) => String(s || '').replace(/[\s ]+/g, '').replace(/[“”"‘’'`]/g, '').replace(/[·ㆍ・]/g, '·');
export function findQuote(text, sources) {
  const q = squash(text); if (q.length < 10) return null;
  for (const src of sources) for (let i = 0; i < src.pages.length; i++) {
    const pg = squash(src.pages[i]) + squash(src.pages[i + 1] || '').slice(0, 400);
    if (pg.includes(q)) return { doc: src.id, page: i + 1, exact: true };
  }
  // not word for word: the page that shares the most two-letter pieces, if close enough
  const grams = (s) => { const g = new Set(); for (let i = 0; i + 1 < s.length; i++) g.add(s.slice(i, i + 2)); return g; };
  const qg = grams(q); let best = null;
  const head = q.slice(0, 12);
  for (const src of sources) for (let i = 0; i < src.pages.length; i++) {
    const pg = squash(src.pages[i]); if (!pg.includes(head.slice(0, 6)) && !pg.includes(q.slice(-6))) continue;
    const pgg = grams(pg); let hit = 0; for (const x of qg) if (pgg.has(x)) hit++;
    const r = hit / qg.size; if (r >= 0.85 && (!best || r > best.r)) best = { doc: src.id, page: i + 1, exact: false, r };
  }
  return best;
}
/* where the page numbers a footnote cites: "195면", "195-196면", "pp.51-58", "p.169" */
export function notePages(note) {
  const m = String(note || '').match(/(\d{1,4})(?:\s*[-–~]\s*(\d{1,4}))?\s*면/) || String(note || '').match(/pp?\.\s*(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?/);
  return m ? { a: +m[1], b: m[2] ? +m[2] : +m[1] } : null;
}

/* ---------------- 각주 형식 ---------------- */
export function noteKind(n) {
  const s = String(n || '').trim();
  if (/^(헌법재판소|대법원|서울[가-힣]*법원|[가-힣]+지방법원|[가-힣]+고등법원)\s*\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\./.test(s)) return 'case';
  if (/앞의\s*(논문|책|보고서|글|주석서|자료|판결|결정)|위의\s*(논문|책)|같은 곳|상게|전게/.test(s)) return 'again';
  if (/,\s*[“"][^”"]+[”"]\s*,?\s*『/.test(s)) return 'article';
  if (/^[^“"]{1,40},\s*『[^』]+』\s*\(/.test(s)) return 'book';
  if (/https?:\/\//.test(s)) return 'web';
  if (/[A-Za-z]{3,}.*\(\d{4}\)/.test(s)) return 'foreign';
  return 'other';
}
const AGAIN_RE = new RegExp(`(?:^|[\\s.;:)])(${NAME}),\\s*(?:앞의|위의)\\s*(논문|책|보고서|글|주석서|자료)`);
export function noteChecks(notes, bodyText = '') {
  const issues = []; const works = new Map(); // author -> { 논문: Set, 책: Set, 기타: Set }
  const all = notes.join(' '), usesMyeon = /\d\s*면/.test(all), spacedDate = /\d{4}\. \d{1,2}\./.test(all);
  const typeOf = (k) => (k === 'book' ? '책' : '논문');
  notes.forEach((raw, i) => {
    const n = String(raw || '').trim(), k = noteKind(n), no = i + 1;
    if (!n) { issues.push({ no, kind: 'empty', msg: '각주가 비어 있습니다.' }); return; }
    const again = n.match(AGAIN_RE);
    if (again) {
      const a = again[1].trim(), w = works.get(a), kind = again[2] === '책' ? '책' : again[2] === '논문' ? '논문' : null;
      const seenBefore = notes.slice(0, i).some((x) => x.includes(a)) || String(bodyText).includes(a);
      if (!w && !seenBefore) issues.push({ no, kind: 'again', msg: `‘${a}, 앞의 ${again[2]}’라고 했지만 앞선 각주에 ${a}의 문헌이 완전한 형태로 나오지 않습니다.` });
      else if (w && kind && w[kind].size > 1 && !/[“"『(]/.test(n.slice(again[0].length))) issues.push({ no, kind: 'ambig', msg: `앞에서 ${a}의 ${kind}이 ${w[kind].size}편 인용되어 ‘앞의 ${kind}’만으로는 어느 것인지 알 수 없습니다. 제목을 줄여 밝히세요.` });
      if (!/\d+\s*면|pp?\.\s*\d|같은 곳/.test(n)) issues.push({ no, kind: 'nopage', msg: '인용한 쪽(○면)이 없습니다.' });
    }
    for (const c of citesIn(n)) { const a = c.author; if (!works.has(a)) works.set(a, { 논문: new Set(), 책: new Set() }); works.get(a)[typeOf(c.kind)].add(titleKey(c.title)); }
    const cites = k === 'article' || k === 'book' || k === 'case' || k === 'again' || k === 'foreign';
    if (cites && !/[.)」』”]$/.test(n)) issues.push({ no, kind: 'period', msg: '각주가 마침표로 끝나지 않습니다.' });
    if ((k === 'article' || k === 'book' || k === 'again') && usesMyeon && /\d\s*쪽/.test(n)) issues.push({ no, kind: 'page', msg: '쪽수를 ‘쪽’으로 적었습니다. 다른 각주는 ‘면’을 씁니다.' });
    if (cites && spacedDate && /\d{4}\.\d{1,2}\./.test(n)) issues.push({ no, kind: 'date', msg: '날짜를 ‘2024.3.’처럼 붙여 적었습니다. 다른 각주는 ‘2024. 3.’처럼 띄웁니다.' });
    if (k === 'article' && !/\(\s*[^)]*\d{4}[^)]*\)/.test(n)) issues.push({ no, kind: 'pub', msg: '논문 각주에 (발행기관, 연도) 부분이 보이지 않습니다.' });
    if ((k === 'article' || k === 'book') && !/\d+\s*면|pp?\.\s*\d/.test(n) && !/참조|참고|자세히는|이에 대해서는|보라/.test(n)) issues.push({ no, kind: 'nopage', msg: '인용한 쪽(○면)이 없습니다.' });
  });
  return issues;
}

/* ---------------- 본문 형식 ---------------- */
export function bodyChecks(paras) {
  const text = paras.join('\n'), out = [];
  const count = (re) => (text.match(re) || []).length;
  const pair = (a, b, la, lb, why) => { const x = count(a), y = count(b); if (x && y) out.push({ kind: 'mix', msg: `${why}: ${la} ${x}곳, ${lb} ${y}곳. 한쪽으로 맞추세요.`, more: x < y ? a : b }); };
  pair(/제\d+조 제\d+항/g, /제\d+조제\d+항/g, '‘제1조 제2항’(띄움)', '‘제1조제2항’(붙임)', '조문 표기의 띄어쓰기가 섞였습니다');
  pair(/제\s\d+\s?조/g, /(?<!\s)제\d+조/g, '‘제 1조’', '‘제1조’', '조문 번호 띄어쓰기가 섞였습니다');
  pair(/(?<![가-힣])본고(?![가-힣])/g, /본 연구(?![가-힣])/g, '‘본고’', '‘본 연구’', '자기 지칭이 섞였습니다');
  pair(/\d{4}\.\s\d{1,2}\.\s\d{1,2}\./g, /\d{4}\.\d{1,2}\.\d{1,2}\./g, '‘2024. 3. 1.’', '‘2024.3.1.’', '날짜 표기가 섞였습니다');
  pair(/선관위/g, /선거관리위원회/g, '‘선관위’', '‘선거관리위원회’', '줄임말과 본말이 섞였습니다');
  pair(/헌재(?![가-힣])/g, /헌법재판소/g, '‘헌재’', '‘헌법재판소’', '줄임말과 본말이 섞였습니다');
  // "A(이하 ‘B’라 한다)" — after that, A should not come back
  for (const m of text.matchAll(/([가-힣A-Za-z·「」\s]{2,40}?)\s*\(\s*이하\s*[‘'"“]([^’'"”]{1,20})[’'"”]\s*(?:이)?라\s*(?:한다|함)\s*\)/g)) {
    const long = m[1].replace(/^.*?([가-힣A-Za-z·「」]+(?:\s[가-힣A-Za-z·「」]+){0,4})$/, '$1').trim(), short = m[2].trim();
    if (long.length < 3 || long === short) continue;
    const after = text.slice(m.index + m[0].length); const n = after.split(long).length - 1;
    if (n) out.push({ kind: 'abbr', msg: `‘${long}’를 ‘${short}’로 줄여 부르기로 정한 뒤에도 ‘${long}’를 ${n}번 더 썼습니다.` });
  }
  paras.forEach((p, i) => {
    const o = (p.match(/“/g) || []).length, c = (p.match(/”/g) || []).length;
    if (o !== c) out.push({ kind: 'quote', para: i, msg: `${i + 1}번째 문단: 여는 따옴표(“) ${o}개, 닫는 따옴표(”) ${c}개로 짝이 맞지 않습니다.` });
    const ob = (p.match(/\(/g) || []).length, cb = (p.match(/\)/g) || []).length;
    if (ob !== cb) out.push({ kind: 'paren', para: i, msg: `${i + 1}번째 문단: 괄호의 짝이 맞지 않습니다(여는 것 ${ob}, 닫는 것 ${cb}).` });
  });
  const dbl = paras.map((p, i) => (p.length > 30 && / {2,}/.test(p.trim()) && !/^(\S\s{2,}){2,}/.test(p.trim()) ? i + 1 : 0)).filter(Boolean);
  if (dbl.length) out.push({ kind: 'space', msg: `빈칸이 두 번 이상 연달아 있는 문단이 ${dbl.length}곳 있습니다(${dbl.slice(0, 8).join(', ')}${dbl.length > 8 ? ' …' : ''}번째 문단).` });
  return out;
}
/* 반론을 다루는 문장이 있는지: 장(章)마다 */
export const COUNTER_RE = /반대\s?견해|반론|이에 대하여는|이에 대해서는|비판(?:이|하는|적 견해)|견해(?:가|도) (?:있|존재)|다른 견해|이견|그러나 이러한 견해|이와 달리|재반론|이에 대한 반박/;
