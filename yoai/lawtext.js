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
export const fixGlyphs = (t) => String(t || '').replace(/[뺷\u{F0854}]/gu, '『').replace(/[뺸\u{F0855}]/gu, '』').replace(/｢/g, '「').replace(/｣/g, '」').replace(/\u0002(?=[^\u0003\n]{1,40}\u0003)/g, '『').replace(/\u0003/g, '』');
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

/* ---------------- 문헌 정보 제안: 학술지 논문의 첫 쪽들에서 ----------------
   믿을 만한 곳만 본다: 둘째·셋째 쪽 머리(“64 입법과 정책 제13권 제1호”, “明知法學 제24권 제1호 - 20 -”),
   첫 쪽의 쪽 범위(pp.063~088, 272~293면, - 19 -), 권호 바로 옆의 발행 연월, 저자 줄(안요환*, 안 요 환(Yohan AHN)**), 그 위의 제목.
   제안일 뿐이며 사용자가 눌러야 들어간다. */
const HANJA_NUM = (s) => s.replace(/第\s*(\d+)\s*輯/g, '제$1집').replace(/第\s*(\d+)\s*卷/g, '제$1권').replace(/第\s*(\d+)\s*號/g, '제$1호').replace(/通卷\s*第?\s*(\d+)\s*號/g, '통권 제$1호');
const VOL_SRC = '(?:제\\s?\\d+\\s?[권집](?:\\s?제?\\s?\\d+\\s?호)?(?:\\s?\\(\\s?통권\\s?제?\\s?\\d+\\s?호\\s?\\))?|통권\\s?제?\\s?\\d+\\s?호|제\\s?\\d+\\s?호|\\d+\\s?권\\s?\\d+\\s?호)';
const tidyVol = (v) => v.replace(/\s+/g, ' ').replace(/제 (\d)/g, '제$1').replace(/(\d) ([권집호])/g, '$1$2').replace(/\( /g, '(').replace(/ \)/g, ')').trim();
const NOT_NAME = /^(성명|저자|필자|교수|조교수|부교수|명예교수|강사|박사|학생|연구위원|연구관|변호사|판사|검사|교신저자|주저자|공저자|국문초록|국문요지|논문요지|논문요약|초록|요약|목차|주제어|서론|결론|차례|연구논문|특집|기획|논단|판례평석|머리말)$/;
/* journal names printed in Hanja are offered in Hangul (as they are cited), only when every Hanja is in this short list */
const HJ = { 法: '법', 學: '학', 硏: '연', 研: '연', 究: '구', 政: '정', 策: '책', 立: '립', 明: '명', 知: '지', 航: '항', 空: '공', 宇: '우', 宙: '주', 會: '회', 誌: '지', 論: '론', 叢: '총', 集: '집', 大: '대', 韓: '한', 國: '국', 公: '공', 私: '사', 刑: '형', 民: '민', 商: '상', 憲: '헌', 行: '행', 社: '사', 科: '과', 院: '원', 報: '보', 評: '평', 刊: '간', 紀: '기', 要: '요', 經: '경', 濟: '제', 人: '인', 文: '문', 比: '비', 較: '교', 際: '제', 境: '경', 環: '환', 勞: '로', 動: '동', 財: '재', 産: '산', 稅: '세', 租: '조', 地: '지', 方: '방', 自: '자', 治: '치', 安: '안', 保: '보', 全: '전', 統: '통', 一: '일', 北: '북', 外: '외', 交: '교', 軍: '군', 事: '사', 防: '방', 警: '경', 察: '찰', 犯: '범', 罪: '죄', 正: '정', 義: '의', 東: '동', 西: '서', 南: '남', 中: '중', 央: '앙', 新: '신', 成: '성', 均: '균', 館: '관', 高: '고', 麗: '려', 延: '연', 世: '세', 梨: '이', 花: '화', 漢: '한', 陽: '양', 慶: '경', 熙: '희', 釜: '부', 山: '산', 江: '강', 原: '원', 忠: '충', 州: '주', 光: '광', 仁: '인', 荷: '하', 檀: '단', 判: '판', 例: '례', 硏究: '연구', 議: '의', 選: '선', 擧: '거', 管: '관', 理: '리', 敎: '교', 育: '육', 史: '사', 哲: '철', 思: '사', 想: '상', 基: '기', 本: '본', 權: '권', 制: '제', 度: '도', 司: '사', 研究: '연구', 實: '실', 務: '무', 情: '정', 報學: '보학', 金: '금', 融: '융', 企: '기', 業: '업', 醫: '의', 生: '생', 命: '명', 倫: '윤', 技: '기', 術: '술', 産業: '산업', 家: '가', 族: '족', 女: '여', 性: '성', 兒: '아', 童: '동', 少: '소', 年: '년', 老: '노', 福: '복', 祉: '지', 歐: '구', 美: '미', 日: '일', 本法: '본법', 獨: '독', 逸: '일', 佛: '불', 英: '영', 亞: '아', 細: '세', 洲: '주' };
const INITIAL = { 립: '입', 론: '논', 로: '노', 례: '예', 려: '여', 리: '이', 년: '연', 륜: '윤' };
const hangulVenue = (v) => {
  v = v.normalize('NFKC');
  if (!/[一-鿿]/.test(v)) return v;
  let out = ''; for (const ch of v) { if (/[一-鿿]/.test(ch)) { if (!HJ[ch]) return v; out += HJ[ch]; } else out += ch; }
  return out.split(/(\s+)/).map((w) => (INITIAL[w[0]] ? INITIAL[w[0]] + w.slice(1) : w)).join('');
};
const cleanVenue0 = (v) => String(v || '').replace(/[\u0000-\u001f]/g, '').replace(/[『』「」❙|∣]/g, '').replace(/^(국회입법조사처|연구논문|\(社\)\S+|사단법인\s?\S+)\s*/, '').replace(/\s*연구논문$/, '').trim();
const cleanVenue = (v) => hangulVenue(cleanVenue0(v)).replace(/․/g, '·');
const COVER = /저작권 정책|Copyright Policy/;
export function guessMeta(pages) {
  // page1 means what YO아이 uses everywhere: the journal page number printed on PDF page 1 (a cover page shifts it)
  const P = (pages || []).slice(0, 6).map((p) => HANJA_NUM(fixGlyphs(p || '')).replace(/[－−–—]/g, '-').replace(/[ \t\u00a0]+/g, ' ').replace(/www\.earticle\.net/g, '\n'));
  const out = {}, p1votes = new Map();
  const vote = (n, w) => { if (n > 0 && n < 5000) p1votes.set(n, (p1votes.get(n) || 0) + w); };
  // 1. running heads: the printed page number of each following page, and often the journal with its volume
  for (let i = 1; i < P.length; i++) {
    const ls = P[i].split('\n').map((l) => l.trim()).filter(Boolean), head = ls.slice(0, 2).join(' ').slice(0, 140); let m;
    if ((m = head.match(/^[∣|]\s?(\d{1,4})\s?[∣|]/))) vote(+m[1] - i, 3);
    else if ((m = ls[0] && ls[0].match(/^(?:19|20)\d{2}\.\s?\d{1,2}\.?\s+(\d{1,4})$/))) vote(+m[1] - i, 2);
    else if ((m = head.match(/^(\d{1,4})\s+[^\s\d.)]/))) vote(+m[1] - i, 2);
    else if ((m = head.match(/(?:^|\s)-\s?(\d{1,4})\s?-(?:\s|$)/))) vote(+m[1] - i, 2);
    else if ((m = ls[0] && ls[0].match(/^[가-힣「『][^\n]{3,80}?\s(\d{1,4})$/))) vote(+m[1] - i, 1);
    const hv = head.replace(/^[∣|]?\s?\d{1,4}\s?[∣|]?\s+/, '').match(new RegExp(`^(\\S.{0,28}?)\\s+(${VOL_SRC})`));
    if (hv && !out.venue && !/\d/.test(hv[1])) { const v = cleanVenue(hv[1]); if (v.length >= 2) { out.venue = v; out.vol = tidyVol(hv[2]); } }
  }
  // 2. the first page: its printed number, or the page range (weaker: a cover page may come first)
  const flat0 = (P[0] || '').replace(/\n/g, ' ');
  const pn = (P[0] || '').match(/(?:^|\n)\s*-\s?(\d{1,4})\s?-\s*(?:\n|$)/); if (pn) vote(+pn[1], 3);
  const r = flat0.match(/pp\.?\s?(\d{1,4})\s?[~∼-]\s?(\d{1,4})/i) || flat0.match(/(\d{1,4})\s?[~∼]\s?(\d{1,4})\s?면/);
  if (r && +r[2] > +r[1] && !COVER.test(P[0])) vote(+r[1], 2);
  if (r && +r[2] > +r[1]) out.pages = `${+r[1]}-${+r[2]}`;
  const best = [...p1votes.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= 3) out.page1 = String(best[0]);
  // 3. journal, volume and date on the first pages (the date near the volume, never a date in the text)
  const first = P.slice(0, 3).filter((p) => !COVER.test(p)), flat = first.join('\n').replace(/\n/g, ' ');
  const fv = flat.match(new RegExp(`(?:^|[\\s❙|『「(\\u0002])([가-힣A-Za-z一-鿿·과 ]{2,24}?)\\s*[❙|』」\\u0003]?\\s*(${VOL_SRC}|\\d{4}\\s?년\\s?제\\s?\\d+\\s?호)`));
  if (fv) {
    const venue = cleanVenue(fv[1]);
    if (!out.venue && venue.length >= 2 && !/^(제|통권)/.test(venue)) out.venue = venue;
    if (!out.vol) out.vol = tidyVol(fv[2]).replace(/^(\d{4})\s?년\s?/, '');
    // the publisher, only when it is printed right beside the journal (other societies are cited all over a first page)
    const near = flat.slice(Math.max(0, fv.index - 40), fv.index + fv[0].length + 70).normalize('NFKC');
    const pubs = [...near.matchAll(/(?:\(社\)|사단법인\s?)?([가-힣一-鿿·․]{2,24}(?:학회|學會|협회|協會|연구소|硏究所|研究所|연구원|조사처|연수원|법제처|출판부))/g)].map((x) => hangulVenue(x[1]).replace(/․/g, '·'));
    if (pubs.length) out.publisher = pubs.sort((x, y) => y.length - x.length)[0];
    const after = flat.slice(fv.index + fv[0].length, fv.index + fv[0].length + 40);
    const d = after.match(/^[^가-힣]{0,4}\(?\s?((?:19|20)\d{2})\s?[.년]\s?(\d{1,2})?/) || after.match(/((?:19|20)\d{2})\s?\.\s?(\d{1,2})\s?\.\s?\d{1,2}\s?\./);
    const y = (d && d[1]) || (fv[2].match(/^(\d{4})\s?년/) || [])[1];
    if (y) out.date = d && d[2] && +d[2] >= 1 && +d[2] <= 12 ? `${y}. ${+d[2]}.` : y;
  }
  if (!out.date || /^\d{4}$/.test(out.date)) { const d = flat.match(/((?:19|20)\d{2})\s?년\s?(\d{1,2})\s?월\s?(?:\d{1,2}\s?일\s?)?(?:발행|발간)/) || flat.match(/(?:발행|발간)(?:일)?\s*:?\s*((?:19|20)\d{2})\s?[.년]\s?(\d{1,2})/); if (d && +d[2] >= 1 && +d[2] <= 12 && (!out.date || out.date === d[1])) out.date = `${d[1]}. ${+d[2]}.`; }
  const doi = flat.match(/(?:doi\.org\/|DOI\s*:?\s*)(10\.\d{4,9}\/[^\s,]+)/i); if (doi) out.doi = doi[1].replace(/[.)]+$/, '');
  // 4. the author line and the title above it
  const NAME = /^[가-힣]{2,4}$/;
  const nameOf = (x) => { x = x.replace(/\([^)]*\)/g, '').trim(); if (/^[가-힣](\s[가-힣]){1,3}$/.test(x)) return x.replace(/\s/g, ''); const tok = x.split(/\s+/)[0]; return NAME.test(tok) && !/\s/.test(x.replace(/\s+(공군|서강|고려|연세|서울|대학|교수|조교수|박사|부교수|연구위원)\S*.*$/, '').replace(/\s+\S$/u, '')) ? tok : ''; };
  for (const page of first) {
    const lines = page.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 60);
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i], l = raw.replace(/^\d{1,3}\)\s?/, '').replace(/\*+\s?\d{0,3}\)?/g, ' ').replace(/\s+/g, ' ').trim();
      if (!l || l.length > 70 || /\d|[.。:]$|다\.?$/.test(l)) continue;
      const parts = l.split(/\s*(?:[․·・∙ㆍ,]|\band\b)\s*/).filter(Boolean).map(nameOf);
      if (!parts.length || parts.length > 6 || parts.some((x) => !x || NOT_NAME.test(x))) continue;
      const marked = /\*/.test(raw) || /\([A-Z][a-z]/.test(raw) || /^[가-힣](\s[가-힣]){1,3}(\s|$)/.test(l) || /[^\s가-힣A-Za-z0-9.,:()\-『』「」“”‘’·․・]/.test(l);
      if (!marked) continue;
      out.author = parts.join('·');
      const above = [];
      for (let j = i - 1; j >= 0 && above.length < 3; j--) {
        const t = lines[j];
        const meta = /DOI|doi\.org|ISSN|https?:|pp\.|^-?\s?\d{1,4}\s?-?$|연구논문|^\(社\)|학회$|Download|Accessed/.test(t) || new RegExp(VOL_SRC).test(t) || /\s\d{1,4}$/.test(t) || /^(?:19|20)\d{2}\s?\./.test(t) || !/[가-힣]{2}/.test(t) || /^[A-Za-z]/.test(t);
        if (meta) { if (above.length) break; continue; }
        above.unshift(t);
      }
      const title = above.join(' ').replace(/\*+/g, '').replace(/\s?\d+\)$/, '').replace(/\s+/g, ' ').trim();
      if (title.length >= 6 && title.length <= 160) out.title = title;
      return out;
    }
  }
  return out;
}

/* ---------------- 참고문헌: 각주의 첫 인용에서 만들고, 원고의 참고문헌과 맞춰 본다 ----------------
   박사학위논문의 참고문헌 양식: Ⅰ. 국내자료(1. 단행본, 2. 학술연구) Ⅱ. 국외자료, 저자·제목 가나다순.
   항목은 각주의 첫 인용에서 인용한 쪽을 뺀 것이고, 학술지 논문은 논문 전체의 쪽 범위(109-125면)를 붙인다. */
const RNAME = '(?:[가-힣]{2,5}(?:\\s?외\\s?\\d+\\s?인|\\s?외\\s?공저|\\s?외|\\s?공저|\\s?편저?)?(?:[·ㆍ][가-힣]{2,5}){0,3}(?:\\s?공저|\\s?편저?)?|[가-힣]{2,15}(?:학회|연구원|연구소|위원회|조사처|법원|재판소|정책연구원|출판부|감사원|사법연수원)|[A-Z][A-Za-z.\'\\-]+(?:,?\\s(?:&\\s|of\\s|the\\s|and\\s|for\\s)?[A-Z][A-Za-z.\'\\-]+){0,6}(?:,?\\s(?:et al\\.|&\\s[A-Z][A-Za-z.\'\\-]+(?:\\s[A-Z][A-Za-z.\'\\-]+){0,3}))?)';
const RX = {
  article: new RegExp(`(${RNAME}),\\s*“((?:[^”]|”(?!\\s*,))+?)”\\s*,?\\s*『([^』]{1,60})』\\s*([^()『“]{0,60}?)\\s*,?\\s*\\(([^()]{2,80})\\)`, 'g'),
  book: new RegExp(`(${RNAME}),\\s*『([^』]{1,120})』\\s*\\(([^()]{2,80})\\)`, 'g'),
  report: new RegExp(`(${RNAME}),\\s*“([^”]{3,220})”\\s*,?\\s*\\(([^()]{2,80}\\d{4}[^()]{0,20})\\)`, 'g'),
  foreign: new RegExp(`(${RNAME}),\\s*“((?:[^”]|”(?!\\s*,))+?)”\\s*,\\s*([^“”()]{2,160}?)\\s*\\((\\d{4})\\)`, 'g'),
};
const sq = (s) => String(s || '').replace(/\s+/g, ' ').trim();
export function noteCitations(notes) {
  const out = new Map();
  (notes || []).forEach((raw, i) => {
    const n = fixGlyphs(raw).replace(/\s+/g, ' ').replace(/[“"]\s/g, '“').replace(/\s[”"]/g, '”');
    const taken = [];
    const add = (c, m) => { if (taken.some(([a, b]) => m.index < b && m.index + m[0].length > a)) return; taken.push([m.index, m.index + m[0].length]); const key = titleKey(c.title); if (key.length < 2) return; const id = normKey(c.author.replace(/\s*(외.*|공저|편저?)$/, '')) + '|' + key; if (!out.has(id)) out.set(id, { ...c, key, note: i + 1, notes: [i + 1] }); else out.get(id).notes.push(i + 1); };
    for (const m of n.matchAll(RX.article)) add({ kind: 'article', author: sq(m[1]), title: sq(m[2]), venue: sq(m[3]), vol: sq(m[4]).replace(/,$/, ''), paren: sq(m[5]) }, m);
    for (const m of n.matchAll(RX.book)) add({ kind: /[A-Za-z]{3}/.test(m[1]) && !/[가-힣]/.test(m[2]) ? 'fbook' : 'book', author: sq(m[1]), title: sq(m[2]), paren: sq(m[3]) }, m);
    for (const m of n.matchAll(RX.report)) add({ kind: 'report', author: sq(m[1]), title: sq(m[2]), paren: sq(m[3]) }, m);
    for (const m of n.matchAll(RX.foreign)) if (/[A-Za-z]{3}/.test(m[1] + m[2])) add({ kind: 'foreign', author: sq(m[1]), title: sq(m[2]), venue: sq(m[3]).replace(/,?\s*(?:pp?\.\s*[\d\-–, ]+|\d+\s*-\s*\d+)\s*$/i, '').replace(/,$/, ''), year: m[4] }, m);
  });
  return [...out.values()];
}
const isForeign = (c) => c.kind === 'foreign' || c.kind === 'fbook';
/* one reference-list entry, in the dissertation's form; range = the article's own page range (e.g. '109-125'), when known */
export function refEntry(c, range) {
  if (c.kind === 'book') return `${c.author}, 『${c.title}』 (${c.paren}).`;
  if (c.kind === 'fbook') return `${c.author}, 『${c.title}』 (${c.paren}).`;
  if (c.kind === 'report') return `${c.author}, “${c.title}”, (${c.paren}).`;
  if (c.kind === 'foreign') return `${c.author}, “${c.title}”${c.venue ? `, ${c.venue}` : ''} (${c.year}).`;
  return `${c.author}, “${c.title}”, 『${c.venue}』${c.vol ? ' ' + c.vol : ''} (${c.paren})${range ? `, ${range}면` : ''}.`;
}
const sortKey = (s) => s.replace(/^[“"『「]/, '');
export function buildRefList(cites, rangeOf = () => '') {
  const dom = cites.filter((c) => !isForeign(c)), fo = cites.filter(isForeign);
  const ent = (c) => ({ c, text: refEntry(c, rangeOf(c)) });
  const by = (a, b) => (sortKey(a.text) < sortKey(b.text) ? -1 : sortKey(a.text) > sortKey(b.text) ? 1 : 0);
  return { books: dom.filter((c) => c.kind === 'book').map(ent).sort(by), papers: dom.filter((c) => c.kind !== 'book').map(ent).sort(by), foreign: fo.map(ent).sort((a, b) => a.text.localeCompare(b.text, 'en')) };
}
/* the manuscript's own reference list: the paragraphs after [참고문헌], until the abstract */
export function parseRefList(paras) {
  let i = -1; for (let k = paras.length - 1; k >= 0; k--) if (/^\s*[\[<【(]?\s*참\s*고\s*문\s*헌\s*[\]>】)]?\s*$/.test(paras[k])) { i = k; break; }
  if (i < 0) return null;
  const out = [];
  for (let k = i + 1; k < paras.length; k++) {
    const t = fixGlyphs(paras[k]).replace(/\s+/g, ' ').trim(); if (!t) continue;
    if (/^[\[<【]?\s*(abstract|영문\s*초록|국문\s*초록)/i.test(t)) break;
    if (/^([ⅠⅡⅢⅣ]+|\d{1,2}|[가-하])\s*[.．]\s*\S{1,12}$/.test(t)) continue; // section heads
    const m = t.match(/[“"]((?:[^”"]|[”"](?!\s*,))+?)[”"]\s*,/) || t.match(/[“"]([^”"]{3,220})[”"]/) || t.match(/『([^』]{1,120})』/);
    if (m) out.push({ key: titleKey(m[1]), text: t, para: k });
  }
  return out;
}

/* a library document as a citation for the reference list (its 정보 decides the form) */
export function docCitation(d) {
  const c = d.cite || {}, k = c.kind || (d.venue ? 'article' : 'other'), date = c.date || d.year || '';
  const paren = (...xs) => xs.filter(Boolean).join(', ');
  const base = { author: d.author || '', title: d.title, key: titleKey(d.title), doc: d.id };
  if (k === 'book') return { ...base, kind: 'book', paren: paren(c.publisher, date) };
  if (k === 'foreign') return { ...base, kind: 'foreign', venue: d.venue || c.publisher || '', year: (String(date).match(/\d{4}/) || [''])[0] };
  if (k === 'report' || k === 'thesis' || k === 'web' || k === 'other' || !d.venue) return { ...base, kind: 'report', paren: paren(k === 'thesis' && c.publisher && !/학위논문/.test(c.publisher) ? c.publisher + ' 학위논문' : c.publisher, date) };
  return { ...base, kind: 'article', venue: d.venue.replace(/^[『「]|[』」]$/g, ''), vol: c.vol || '', paren: paren(c.publisher, date) };
}
/* footnotes against the manuscript's own reference list: missing, never cited, years that differ */
export function compareRefs(cites, listed) {
  // a work is the same when the titles agree and so do the authors (『헌법강의』 is several people's book)
  const who = (a) => String(a || '').replace(/\s*(외\s*\d*\s*인?|외\s*공저|공저|편저?|et al\.?)\s*$/i, '').split(/[·ㆍ,&]|\sand\s/)[0].replace(/\s+/g, '').toLowerCase();
  const lauthor = (t) => who(t.split(/,\s*[“"『]/)[0]);
  const sameTitle = (a, b) => a === b || (a.length >= 8 && b.length >= 8 && (a.includes(b) || b.includes(a)));
  const same = (c, x) => sameTitle(c.key, x.key) && (!who(c.author) || !lauthor(x.text) || who(c.author) === lauthor(x.text) || who(c.author).includes(lauthor(x.text)) || lauthor(x.text).includes(who(c.author)));
  const missing = cites.filter((c) => !listed.some((x) => same(c, x))), uncited = listed.filter((x) => !cites.some((c) => same(c, x))), years = [];
  for (const c of cites) {
    const hit = listed.find((x) => same(c, x)); if (!hit) continue;
    const cy = (String(c.paren || c.year || '').match(/(?:19|20)\d{2}/) || [])[0], ly = ([...hit.text.replace(/[“"][^”"]*[”"]/g, '').matchAll(/\(([^()]*)\)/g)].map((m) => (m[1].match(/(?:19|20)\d{2}/) || [])[0]).filter(Boolean).pop()) || (hit.text.match(/((?:19|20)\d{2})/) || [])[1];
    if (cy && ly && cy !== ly) years.push({ c, l: hit, cy, ly });
  }
  return { missing, uncited, years };
}
