// 연구실 책장 — a name for a newly added paper: "저자_제목" (the subtitle left out).
// Read from the paper's first page, or from the page after a database cover (DBpia, KCI and the like).
// Careful by design: when the title and the author are not both clear, it returns null and the file keeps its own name.
// Input: page objects as made by pdfkit.pageItems(): { W, H, items: [{ s, x, y, w, h }] } (y grows downward).

const COVER_WORDS = ['논문명', '저자', '발행기관', '발행처', '학술지', '수록', '권호', 'DBpia', 'dbpia', 'KCI', '이용일', '이용정보', '자료유형', '출처', 'URL', '누리미디어'];
const META_LINE = /^\s*[\[【(]?\s*(출처|발행처|발행기관|학술지명?|권호사항|수록면|수록페이지|발행일|발행연도|URL|APA\s*Style|이용정보|이용일|자료유형|DOI|ISSN|Source|Publisher)\b/;
const NOT_NAMES = new Set(['목차', '차례', '초록', '국문초록', '요약', '서론', '결론', '머리말', '맺음말', '들어가며', '나가며', '개요', '참고문헌', '주제어', '키워드', '논문', '연구', '특집', '기획', '논설', '평석', '판례평석', '연구논문', '일반논문', '투고논문', '심사논문', '목적', '방법', '결과', '논의', '부록', '서문', '발간사', '편집']);
const ROLE = /\s*(명예교수|초빙교수|겸임교수|연구교수|부교수|조교수|교수|강사|선임연구원|책임연구원|전임연구원|연구위원|연구원|박사과정|박사|석사과정|석사|변호사|판사|검사|교신저자|제1저자|주저자|공동저자)\s*$/;

// ---------------------------------------------------------------- lines
function lines(pg) {
  if (!pg || !pg.items) return [];
  const its = pg.items.filter((i) => i.s && i.s.trim() && i.h > 0).slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const out = [];
  for (const it of its) {
    let L = null;
    for (let k = out.length - 1; k >= 0 && k >= out.length - 4; k--) {
      const c = out[k];
      if (Math.abs(c.y - it.y) <= Math.max(1.5, 0.45 * Math.min(c.h, it.h))) { L = c; break; }
    }
    if (L) { L.parts.push(it); L.h = Math.max(L.h, it.h); } else out.push({ y: it.y, h: it.h, parts: [it] });
  }
  for (const L of out) {
    L.parts.sort((a, b) => a.x - b.x);
    let s = '', end = null;
    for (const p of L.parts) {
      if (end != null && p.x - end > 0.22 * p.h && !s.endsWith(' ')) s += ' ';
      s += p.s; end = p.x + p.w;
    }
    L.s = s.replace(/\s+/g, ' ').trim();
    L.x0 = Math.min(...L.parts.map((p) => p.x));
    L.x1 = Math.max(...L.parts.map((p) => p.x + p.w));
  }
  return out.filter((L) => L.s);
}
function bodySize(ls) {   // the size most of the text is set in
  const w = new Map();
  for (const L of ls) { const k = Math.round(L.h * 2) / 2; w.set(k, (w.get(k) || 0) + L.s.length); }
  let best = 0, n = -1; for (const [k, v] of w) if (v > n) { n = v; best = k; }
  return best || 10;
}

// ---------------------------------------------------------------- title
const DASHES = '-–—―─~～';
function isSubtitleLine(s) {
  const t = s.trim();
  return new RegExp(`^[${DASHES}]`).test(t) || /^[〈<《(（]/.test(t) && /[〉>》)）]$/.test(t)
    || /(중심으로|관하여|대하여|위하여|통하여|focusingon)[-–—―)）]*$/i.test(t.replace(/\s/g, ''));
}
function cleanTitle(s) {
  let t = s.replace(/[「」『』《》〈〉【】"“”]/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/[*†‡§¶⁎∗]+$/g, '').replace(/\s*\d{1,2}\)$/, '').trim();          // a footnote mark after the title
  const cut = (re) => { const m = re.exec(t); if (m && m.index >= 4) t = t.slice(0, m.index).trim(); };
  cut(new RegExp(`\\s[${DASHES}]{1,2}\\s?`));                                        // 제목 - 부제 -
  cut(new RegExp(`[—―─]`));                                                          // 제목—부제
  cut(/\s?[:：]\s?/);                                                                 // 제목: 부제
  { const o = Math.max(t.lastIndexOf('('), t.lastIndexOf('（'));                      // 제목(…을 중심으로), even when a line break split a word
    if (o >= 4 && /(중심으로|관하여|대하여|위하여|비교|검토|분석|사례|소고|시론|focus|with)/i.test(t.slice(o).replace(/\s/g, ''))) t = t.slice(0, o).trim(); }
  if (/^[가-힣]/.test(t)) cut(/\s(?=[A-Za-z][A-Za-z ,.'’:;-]{12,}$)/);               // a Korean title followed by its English translation
  t = t.replace(new RegExp(`[\\s${DASHES},.·]+$`), '').trim();
  return titleCase(t);
}
function titleCase(s) {   // ALL CAPS English → ordinary capitals
  if (/[a-z]/.test(s) || !/[A-Z]{3}/.test(s) || /[가-힣]/.test(s)) return s;
  const small = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'nor', 'of', 'in', 'on', 'for', 'to', 'at', 'by', 'with', 'from', 'as', 'into', 'via', 'vs', 'vs.']);
  let first = true;
  return s.toLowerCase().split(/(\s+)/).map((w) => {
    if (/^\s+$/.test(w)) return w;
    const out = !first && small.has(w) ? w : w.replace(/^([("'“‘]?)(\p{L})/u, (m, a, b) => a + b.toUpperCase());
    first = false; return out;
  }).join('');
}

// ---------------------------------------------------------------- authors
function nameCase(w) { return /[a-z]/.test(w) ? w : w.toLowerCase().replace(/(^|[\s])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()); }
function parseAuthors(raw) {
  if (!raw || raw.length > 70) return null;
  let s = raw.replace(/[(（\[【][^)）\]】]*[)）\]】]/g, ' ');                       // (소속) [소속]
  s = s.replace(/[*†‡§¶#⁎∗]+/g, ' ').replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, ' ').replace(/(\D)\d{1,2}\)/g, '$1 ');
  s = s.replace(/^\s*(저자|글쓴이|by)\s*[:：]?\s*/i, '');
  const parts = s.split(/\s*(?:[,，·・ㆍ‧･/;、&]|\band\b|\s와\s|\s및\s)\s*/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length || parts.length > 8) return null;
  const names = [];
  for (let p of parts) {
    p = p.replace(/\d+$/, '').trim();
    if (/^([가-힣一-龥]\s+){1,4}[가-힣一-龥]$/.test(p)) p = p.replace(/\s+/g, '');      // 홍 길 동 → 홍길동
    p = p.replace(ROLE, '').trim();
    if (/^[가-힣]{2,5}$/.test(p) || /^[一-龥]{2,4}$/.test(p)) { if (NOT_NAMES.has(p)) return null; names.push(p); continue; }
    const e = nameCase(p);
    if (/^[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){1,3}$/.test(e)) { names.push(e); continue; }
    return null;
  }
  return names.length ? names : null;
}
function authorText(names) { return names.length === 1 ? names[0] : names.length === 2 ? names.join('·') : names[0] + ' 외'; }

// ---------------------------------------------------------------- one page
function fromArticle(pg, onlyAbove) {
  let ls = lines(pg);
  if (!ls.length) return null;
  if (onlyAbove != null) ls = ls.filter((L) => L.y < onlyAbove);
  const all = ls.map((L) => L.s).join(' ');
  if (/학위\s*논문|지도\s*교수|Dissertation|Thesis/i.test(all)) return null;   // a thesis cover: left as it is
  const body = bodySize(lines(pg));
  const H = pg.H || 842;
  const cand = ls.filter((L) => L.y < H * 0.6 && L.h >= body * 1.22 && L.s.replace(/\s/g, '').length >= 3 && !isSubtitleLine(L.s) && !META_LINE.test(L.s));
  if (!cand.length) return null;
  const sizes = [...new Set(cand.map((L) => Math.round(L.h * 4) / 4))].sort((x, y) => y - x).slice(0, 4);
  for (const size of sizes) {
    const top = cand.find((L) => Math.round(L.h * 4) / 4 === size);
    const r = tryTitle(ls, top, body, H);
    if (r) return r;
  }
  return null;
}
function tryTitle(ls, top, body, H) {
  // the title block: this line, with the lines of the same size right above and below it
  let i = ls.indexOf(top), a = i, z = i;
  const same = (L) => Math.abs(L.h - top.h) <= top.h * 0.12 && !isSubtitleLine(L.s);
  while (a > 0 && same(ls[a - 1]) && top.y - ls[a - 1].y <= top.h * 2.6 * (i - a + 1)) a--;
  while (z < ls.length - 1 && same(ls[z + 1]) && ls[z + 1].y - ls[z].y <= top.h * 2.4) z++;
  const title = cleanTitle(ls.slice(a, z + 1).map((L) => L.s).join(' '));
  if (title.replace(/\s/g, '').length < 4 || title.length > 160) return null;
  // the author: one of the next few short lines (skipping a subtitle or an English title)
  let names = null;
  for (let k = z + 1, skipped = 0; k < ls.length && k <= z + 6 && skipped <= 3; k++) {
    const L = ls[k];
    if (L.y > H * 0.75) break;
    if (isSubtitleLine(L.s)) { skipped++; continue; }
    if (L.h >= body * 1.22 && L.s.replace(/\s/g, '').length > 6) return null;   // another title-sized line first: not the title
    names = parseAuthors(L.s);
    if (names) break;
    if (L.s.length > 70 && Math.abs(L.h - body) < 0.6) break;   // the text has begun
    skipped++;
  }
  return names ? { title, authors: names } : null;
}
function fromCoverLabels(pg) {
  const ls = lines(pg);
  let title = null, authors = null;
  const value = (k, re) => { const m = re.exec(ls[k].s); if (!m) return null; const v = ls[k].s.slice(m[0].length).trim(); return v || (ls[k + 1] ? ls[k + 1].s : ''); };
  for (let k = 0; k < ls.length; k++) {
    if (!title) { const v = value(k, /^\s*[\[【]?\s*(논문명|논문\s*제목|제목|Title)\s*[\]】]?\s*[:：]?\s*/); if (v) title = cleanTitle(v); }
    if (!authors) { const v = value(k, /^\s*[\[【]?\s*(저자명?|저\s*자|Authors?)\s*[\]】]?\s*[:：]?\s*/); if (v) authors = parseAuthors(v); }
  }
  return title && authors && title.replace(/\s/g, '').length >= 4 ? { title, authors } : null;
}
function isCover(pg) {
  const t = lines(pg).map((L) => L.s).join('\n');
  return COVER_WORDS.filter((k) => t.includes(k)).length >= 3;
}

// ---------------------------------------------------------------- the name
export function nameFromPages(p1, p2) {
  let r = null;
  try {
    if (isCover(p1)) {
      r = fromCoverLabels(p1);
      if (!r) { const meta = lines(p1).find((L) => META_LINE.test(L.s)); r = fromArticle(p1, meta ? meta.y : null); }
      if (!r && p2) r = fromArticle(p2);
    } else r = fromArticle(p1);
  } catch (e) { r = null; }
  if (!r) return null;
  const name = (authorText(r.authors) + '_' + r.title).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const short = name.length > 150 ? name.slice(0, name.lastIndexOf(' ', 150) > 60 ? name.lastIndexOf(' ', 150) : 150).trim() : name;
  return { name: short, title: r.title, authors: r.authors };
}
