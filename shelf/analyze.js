// 서재 — reading the text of a PDF page (pdf.js text content): footnotes and the markers that point to them,
// printed page numbers, headings, plain page text for search, and clean text for copying.
// Pure functions, no imports. Every detector is conservative: when unsure it returns nothing, because a wrong
// footnote or a wrong page number is worse than none.
//
// Input (built by the app from pdf.js at scale 1, rotation applied, origin top-left):
//   page = { n, W, H, items: [{ s, x, y /* baseline */, w, h /* font size */, f /* font name */, eol }] }
// All returned coordinates use the same space (points at scale 1, from the top-left of the page as displayed).
//
// Exports
//   docStats(pages)              -> { bodySize, bodyFont, lineGap, marginTop, marginBottom }   (samples ≤14 pages)
//   footnotes(page, stats, ctx?) -> { notes: [{ no, text, y0, y1 } | { no: null, cont: true, text, y0, y1 }],
//                                     refs:  [{ no, x, y /* top of the marker box */, w, h }] }
//                                   ctx = { prevLastNo } (the previous page's last note number) helps accept a note
//                                   continued from the previous page; without it, only an indented continuation counts.
//   pageLabels(pages)            -> { offset, confident, scheme }   printed page = page.n + 1 + offset
//   outline(pages, stats?)       -> [{ title, level: 1..3, page, y }]
//   pageText(page, stats?)       -> body paragraphs (markers removed, running head/foot dropped), then "\n\n" and the notes
//   cleanCopy(str)               -> text selected in the text layer, ready to paste

const SYMBOL_START = /^[\s]*[*†‡※§¶#]/;
const KEEP_HYPHEN = /(^|[^A-Za-z])(self|non|quasi|well|cross|so|ex)-$/i;
const HANGUL = /[ㄱ-ㆎ가-힣]/;

function num(v) { return typeof v === 'number' && isFinite(v); }
function median(a) {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---------------------------------------------------------------- items and lines
function usable(items) {
  const out = [];
  for (const it of items || []) {
    if (!it || typeof it.s !== 'string' || !it.s.trim()) continue;
    if (!num(it.x) || !num(it.y) || !num(it.h) || it.h < 1 || it.h > 400) continue;
    out.push({ s: it.s, x: it.x, y: it.y, w: num(it.w) && it.w > 0 ? it.w : it.s.length * it.h * 0.5, h: it.h, f: it.f || '' });
  }
  return out;
}

// The size most of the text is set in (weighted by characters).
function dominantSize(items) {
  const acc = new Map();
  for (const it of items) {
    const k = Math.round(it.h * 4) / 4;
    acc.set(k, (acc.get(k) || 0) + it.s.replace(/\s/g, '').length);
  }
  let best = 0, bw = -1;
  for (const [k, w] of acc) if (w > bw) { bw = w; best = k; }
  return best;
}

// A gutter between two columns: a vertical band in the middle of the page that body lines never cross.
function findGutter(items, W, body) {
  const bodyItems = items.filter((it) => it.h > body * 0.8 && it.h < body * 1.25);
  if (bodyItems.length < 40) return null;
  const step = 2, n = Math.ceil(W / step) + 1, cover = new Array(n).fill(0);
  for (const it of bodyItems) {
    const a = Math.max(0, Math.floor(it.x / step)), b = Math.min(n - 1, Math.ceil((it.x + it.w) / step));
    for (let i = a; i <= b; i++) cover[i]++;
  }
  const max = Math.max(...cover);
  const lo = Math.floor(W * 0.3 / step), hi = Math.ceil(W * 0.7 / step);
  let best = null, run = 0, start = 0;
  for (let i = lo; i <= hi; i++) {
    if (cover[i] <= max * 0.02) { if (!run) start = i; run++; } else { if (run && (!best || run > best.run)) best = { run, start }; run = 0; }
  }
  if (run && (!best || run > best.run)) best = { run, start };
  if (!best || best.run * step < body * 1.2) return null;
  const mid = (best.start + best.run / 2) * step;
  // both sides must be substantial columns
  const left = bodyItems.filter((it) => it.x + it.w <= mid).length, right = bodyItems.filter((it) => it.x >= mid).length;
  if (left < bodyItems.length * 0.25 || right < bodyItems.length * 0.25) return null;
  return mid;
}

// Lines of one column: items on the same baseline, plus raised small items (superscript markers) attached to the line.
function buildLines(items) {
  const sorted = items.slice().sort((a, b) => b.h - a.h || a.y - b.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    let target = null, raised = false;
    for (const L of lines) {
      if (Math.abs(L.base - it.y) > Math.max(L.h, it.h)) continue;
      const same = Math.abs(L.base - it.y) <= 0.22 * Math.min(L.h, it.h) + 0.3 && it.h >= 0.7 * L.h && it.h <= 1.45 * L.h;
      if (same) { target = L; raised = false; break; }
      const sup = it.h < 0.86 * L.h && it.y <= L.base + 0.06 * L.h && it.y >= L.base - 0.62 * L.h
        && it.x >= L.x0 - 1.5 * L.h && it.x <= L.x1 + 1.5 * L.h;
      if (sup && !target) { target = L; raised = true; }
    }
    if (!target) { lines.push({ base: it.y, h: it.h, items: [it], sups: [], x0: it.x, x1: it.x + it.w }); continue; }
    if (raised) target.sups.push(it); else target.items.push(it);
    target.x0 = Math.min(target.x0, it.x); target.x1 = Math.max(target.x1, it.x + it.w);
  }
  for (const L of lines) {
    L.items.sort((a, b) => a.x - b.x); L.sups.sort((a, b) => a.x - b.x);
    L.text = joinItems(L.items);
    L.top = L.base - L.h * 0.9; L.bot = L.base + L.h * 0.25;
    L.font = L.items[0].f;
  }
  lines.sort((a, b) => a.base - b.base || a.x0 - b.x0);
  return lines;
}

function joinItems(items) {
  let out = '', prev = null;
  for (const it of items) {
    if (prev) {
      const gap = it.x - (prev.x + prev.w);
      if (gap > 0.18 * Math.min(prev.h, it.h) && !/\s$/.test(out) && !/^\s/.test(it.s)) out += ' ';
    }
    out += it.s; prev = it;
  }
  return out.replace(/\s+/g, ' ').trim();
}

// Group raised items that touch into tokens ("12" + ")" -> "12)").
function supTokens(L) {
  const toks = [];
  for (const s of L.sups) {
    const last = toks[toks.length - 1];
    if (last && s.x - (last.x + last.w) < 0.6 * s.h && Math.abs(s.y - last.y) < 0.5 * s.h) {
      last.s += s.s; last.w = s.x + s.w - last.x; last.h = Math.max(last.h, s.h);
    } else toks.push({ s: s.s, x: s.x, y: s.y, w: s.w, h: s.h });
  }
  return toks;
}

// The page as columns of lines, with the running head/foot and the footnote block marked.
function layout(page, stats) {
  const items = usable(page.items);
  const W = page.W || 600, H = page.H || 800;
  const body = (stats && stats.bodySize) || dominantSize(items) || 10;
  const gutter = findGutter(items, W, body);
  const groups = gutter ? [items.filter((it) => it.x + it.w / 2 < gutter), items.filter((it) => it.x + it.w / 2 >= gutter)] : [items];
  const cols = groups.map((g) => buildLines(g));
  const all = [].concat(...cols);
  // running head and foot: the first/last lines of the page, near the edge and set off from the text
  const byBase = all.slice().sort((a, b) => a.base - b.base);
  const lead = (stats && stats.lineGap) || body * 1.6;
  const head = new Set(), foot = new Set();
  for (let i = 0; i < Math.min(2, byBase.length); i++) {
    const L = byBase[i], next = byBase[i + 1];
    const gapNext = next ? next.top - L.bot : Infinity;
    // a running head is set off from the text and is either a page number, set smaller than the text,
    // or a short line followed by a wide gap (a body line that merely opens the page is none of these)
    const isHead = L.base < H * 0.14 && L.text.length < 90 && (isPageNo(L.text)
      || (L.h < body * 0.97 && gapNext > lead * 0.5)
      || (gapNext > lead * 1.6 && L.text.length < 50 && L.h <= body * 1.02));
    if (isHead) head.add(L); else break;
  }
  for (let i = byBase.length - 1; i >= Math.max(0, byBase.length - 2); i--) {
    const L = byBase[i], prev = byBase[i - 1];
    if (L.base > H * 0.86 && L.text.length < 90 && (isPageNo(L.text) || (!prev || L.top - prev.bot > lead * 0.9) && L.h <= body * 1.05)) foot.add(L); else break;
  }
  for (const L of all) { L.head = head.has(L); L.foot = foot.has(L); }
  return { cols, all, body, gutter, W, H };
}

function isPageNo(t) { return /^[-–—\s]*\d{1,4}[-–—\s]*$/.test(t) || /^(p\.?|page)\s*\d{1,4}$/i.test(t.trim()); }

// ---------------------------------------------------------------- docStats
export function docStats(pages) {
  const ps = (pages || []).filter((p) => p && p.items);
  const pick = ps.length <= 14 ? ps : Array.from({ length: 14 }, (_, i) => ps[Math.floor((i + 0.5) * ps.length / 14)]);
  const items = [].concat(...pick.map((p) => usable(p.items)));
  const bodySize = dominantSize(items) || 10;
  const fontCount = new Map();
  for (const it of items) if (Math.abs(it.h - bodySize) < bodySize * 0.08) fontCount.set(it.f, (fontCount.get(it.f) || 0) + it.s.length);
  let bodyFont = '', fc = -1;
  for (const [f, c] of fontCount) if (c > fc) { fc = c; bodyFont = f; }
  const gaps = [], tops = [], bots = [];
  for (const p of pick) {
    const lay = layout(p, { bodySize });
    for (const col of lay.cols) {
      const bl = col.filter((L) => !L.head && !L.foot && Math.abs(L.h - bodySize) < bodySize * 0.15);
      for (let i = 1; i < bl.length; i++) { const g = bl[i].base - bl[i - 1].base; if (g > bodySize * 0.9 && g < bodySize * 3) gaps.push(g); }
      if (bl.length) { tops.push(bl[0].top); bots.push(bl[bl.length - 1].base); }
    }
  }
  return { bodySize, bodyFont, lineGap: median(gaps) || bodySize * 1.6, marginTop: median(tops), marginBottom: median(bots) };
}

// ---------------------------------------------------------------- footnotes
// A note starts with "12)" / "12." / "12 " or a raised small "12"; returns { no, rest } or null.
function noteStart(L, body) {
  const toks = supTokens(L);
  const first = L.items[0];
  if (toks.length && toks[0].x <= first.x + 0.5 && /^\d{1,4}\)?$/.test(toks[0].s.trim())) {
    return { no: parseInt(toks[0].s, 10), kind: 'sup', x: toks[0].x };
  }
  const t = L.text;
  let m = /^(\d{1,4})\)\s*(\S.*)$/.exec(t);
  if (m) return { no: parseInt(m[1], 10), kind: 'paren', x: first.x };
  // "12. text": the period marks a note number even when it shares a run with the text
  m = /^(\d{1,3})\.\s+(\S.*)$/.exec(t);
  if (m) return { no: parseInt(m[1], 10), kind: 'plain', x: first.x };
  // "12 text": only when the number is its own piece of text (not "12 U.S.C. § 1983" or "45면" in one run)
  m = /^(\d{1,3})\s+(\S.*)$/.exec(t);
  if (m && /^\d{1,3}$/.test(first.s.trim())) return { no: parseInt(m[1], 10), kind: 'plain', x: first.x };
  return null;
}

// The block of small-type lines at the bottom of a column, above the running foot.
function noteBlock(col, body) {
  const lines = col.filter((L) => !L.head && !L.foot);
  const block = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const L = lines[i];
    if (!(L.h <= body * 0.92 && L.h >= body * 0.45)) break;
    if (block.length) {
      const below = block[0], gap = below.top - L.bot, step = below.base - L.base;
      if (gap > Math.max(below.h, L.h) * 2.2 || step > Math.max(below.h, L.h) * 3.2) break;
    }
    block.unshift(L);
  }
  if (!block.length) return null;
  // there must be body text above the block, ending before it
  const above = lines.filter((L) => L.base < block[0].top);
  if (!above.some((L) => L.h > body * 0.92)) return null;
  return block;
}

export function footnotes(page, stats, ctx) {
  const empty = { notes: [], refs: [] };
  try {
    const lay = layout(page, stats);
    const body = lay.body;
    const notes = [], refs = [];
    for (const col of lay.cols) {
      const block = noteBlock(col, body);
      if (!block) continue;
      const starts = block.map((L) => (SYMBOL_START.test(L.text) ? { symbol: true } : noteStart(L, body)));
      // the longest run of consecutive numbers, in order
      let best = null;
      for (let i = 0; i < starts.length; i++) {
        if (!starts[i] || starts[i].symbol) continue;
        const run = [i]; let want = starts[i].no + 1;
        for (let j = i + 1; j < starts.length; j++) if (starts[j] && !starts[j].symbol && starts[j].no === want) { run.push(j); want++; }
        if (!best || run.length > best.length) best = run;
      }
      if (!best) continue;
      // two lines claiming the same number, or a claimed start whose style differs from the others: unsure
      const kinds = new Set(best.map((i) => starts[i].kind));
      if (kinds.size > 1) continue;
      const kind = [...kinds][0];
      const xs = best.map((i) => starts[i].x);
      if (Math.max(...xs) - Math.min(...xs) > body * 0.6) continue;
      const claimed = new Set(best);
      let dup = false;
      for (let i = 0; i < starts.length; i++) {
        if (claimed.has(i) || !starts[i] || starts[i].symbol) continue;
        // a line outside the run that looks exactly like a note start of the same style, aligned with the others
        // (a note whose number was lost, a duplicate, a gap in the numbering): ambiguous, so this column says nothing
        if (starts[i].kind === kind && Math.abs(starts[i].x - xs[0]) < 1) dup = true;
      }
      if (dup) continue;
      const startX = xs[0];
      // continuation lines of numbered notes (to learn their indent)
      const contX = [];
      for (let k = 0; k < best.length; k++) {
        const a = best[k], b = k + 1 < best.length ? best[k + 1] : block.length;
        for (let j = a + 1; j < b; j++) if (!starts[j] || !starts[j].symbol) contX.push(block[j].x0);
      }
      const colNotes = [];
      // lines at the top of the block before the first numbered note: a note continued from the previous page
      const firstIdx = best[0];
      const lead = [];
      for (let j = 0; j < firstIdx; j++) {
        if (starts[j] && starts[j].symbol) { lead.length = 0; break; }
        lead.push(block[j]);
      }
      if (lead.length) {
        const indentOk = contX.length ? Math.abs(lead[0].x0 - median(contX)) < 1.5 && Math.abs(lead[0].x0 - startX) > 2 : false;
        const prevOk = ctx && num(ctx.prevLastNo) && starts[firstIdx].no === ctx.prevLastNo + 1;
        if (indentOk || prevOk) {
          colNotes.push({ no: null, cont: true, text: lead.map((L) => L.text).join(' '), y0: lead[0].top, y1: lead[lead.length - 1].bot });
        }
      }
      for (let k = 0; k < best.length; k++) {
        const a = best[k], b = k + 1 < best.length ? best[k + 1] : block.length;
        const ls = [];
        for (let j = a; j < b; j++) { if (starts[j] && starts[j].symbol) break; ls.push(block[j]); }
        let text = ls.map((L) => L.text).join(' ');
        if (kind === 'sup') text = text.replace(/^\s*/, '');
        else text = text.replace(/^(\d{1,4})(\)|\.)?\s*/, '');
        colNotes.push({ no: starts[a].no, text: text.trim(), y0: ls[0].top, y1: ls[ls.length - 1].bot });
      }
      // markers in the body of this column
      const nos = new Set(colNotes.filter((n) => n.no != null).map((n) => n.no));
      const blockTop = block[0].top;
      const colRefs = [];
      for (const L of col) {
        if (L.head || L.foot || L.base >= blockTop) continue;
        if (L.h < body * 0.9) continue;
        for (const t of supTokens(L)) {
          const m = /^(\d{1,4})\)?$/.exec(t.s.trim());
          if (!m) continue;
          const no = parseInt(m[1], 10);
          if (!nos.has(no)) continue;
          colRefs.push({ no, x: t.x, y: t.y - t.h * 0.9, w: t.w, h: t.h * 1.15 });
        }
      }
      // conservative: a column's notes count only if at least one of them is pointed to from its text
      if (!colRefs.length) continue;
      // each number pointed to at most once on the page
      const seen = new Set(), uniq = [];
      for (const r of colRefs) { if (seen.has(r.no)) { uniq.length = 0; break; } seen.add(r.no); uniq.push(r); }
      if (!uniq.length) continue;
      notes.push(...colNotes); refs.push(...uniq);
    }
    return { notes, refs };
  } catch (e) {
    return empty;
  }
}

// ---------------------------------------------------------------- printed page numbers
function marginNumbers(page) {
  const items = usable(page.items);
  if (!items.length) return [];
  const lines = buildLines(items);
  const H = page.H || 800;
  const out = [];
  const take = (L, band) => {
    if (L.text.length > 80) return;
    const toks = L.text.match(/\d{1,4}/g) || [];
    if (toks.length > 8) return;
    for (const t of new Set(toks)) {
      const v = parseInt(t, 10);
      if (v > 0 && v < 10000) out.push({ v, band });
    }
  };
  const top = lines.filter((L) => L.base < H * 0.14).slice(0, 2);
  const bot = lines.filter((L) => L.base > H * 0.86).slice(-2);
  for (const L of top) take(L, 'header');
  for (const L of bot) take(L, 'footer');
  return out;
}

export function pageLabels(pages) {
  const none = { offset: null, confident: false, scheme: null };
  try {
    const ps = (pages || []).filter((p) => p && p.items);
    if (ps.length < 3) return none;
    const counts = new Map(), bands = new Map();
    let withCand = 0;
    for (const p of ps) {
      const cands = marginNumbers(p);
      if (!cands.length) continue;
      withCand++;
      const seen = new Set();
      for (const c of cands) {
        const off = c.v - (p.n + 1);
        if (seen.has(off)) continue;
        seen.add(off);
        counts.set(off, (counts.get(off) || 0) + 1);
        const b = bands.get(off) || { header: 0, footer: 0 }; b[c.band]++; bands.set(off, b);
      }
    }
    let best = null, bc = 0;
    for (const [off, c] of counts) if (c > bc) { bc = c; best = off; }
    if (best == null || bc < 3 || bc < withCand * 0.7) return none;
    // the runner-up must be far behind (a margin full of numbers gives many offsets the same support)
    for (const [off, c] of counts) if (off !== best && c > bc * 0.5) return none;
    // numbers that start after the PDF's first page: a notice or a cover put before the paper (KJCI, earticle) moves them
    // on by a page or so (the pages before the one printed 1 are labelled apart: 표지)
    if (best < -3) return none;
    const b = bands.get(best);
    return { offset: best, confident: true, scheme: b.header >= b.footer ? 'header' : 'footer' };
  } catch (e) {
    return none;
  }
}

// ---------------------------------------------------------------- headings
const ROMAN_UP = 'ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ';
function headingKind(t) {
  t = t.trim();
  if (/^(국문\s*초록|초\s*록|요\s*약|Abstract|ABSTRACT|참고\s*문헌|References|REFERENCES|Bibliography|BIBLIOGRAPHY)$/.test(t.replace(/[<>【】\[\]〈〉《》]/g, '').trim())) return 'special';
  if (new RegExp('^[' + ROMAN_UP + ']+\\s*[.．]\\s*\\S').test(t)) return 'roman';
  if (/^[IVX]{1,6}\.\s+\S/.test(t)) return 'roman';
  if (/^제\s*\d+\s*장(\s|$)/.test(t)) return 'chapter';
  if (/^제\s*\d+\s*절(\s|$)/.test(t)) return 'section';
  if (/^\d{1,2}\.\s*[^\d\s.]/.test(t)) return 'arabic';
  if (/^[A-H]\.\s+[A-Z가-힣]/.test(t)) return 'latin';
  if (/^[가-하]\.\s*[^\s”’"')\]」』]/.test(t)) return 'hangul';   // (다.” … is the end of a quotation, not a heading)
  if (/^\(\d{1,2}\)\s*\S/.test(t)) return 'paren';
  return null;
}

// a contents list cleaned of what the paper's own printed 목차 box puts into it: a line holding two headings side by side
// (Ⅰ. 서론 Ⅳ. 결론 — the box's two columns read across), and a heading listed in the box before the same heading in the text
const MARK = /(?:^|\s)(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]{1,4}\s*[.．]|(?:I|II|III|IV|V|VI|VII|VIII|IX|X)\.\s|\d{1,2}\.\s*(?=[가-힣A-Za-z「『‘“(]))\s*\S/g;
const headKey = (t) => String(t || '').replace(/^[\sⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVX\d.．()가-하]{1,6}?[.．)]\s*/, '').replace(/[\s「」｢｣『』‘’“”'"·:：\-–—]/g, '').slice(0, 24);
// ---- a scan's headings mended (8차 E4) ----
// A scan's reader (OCR) reads a chapter's roman numeral as anything: Ⅰ as Ｌ or l, Ⅲ as 피, m, IlI or Ⅱl, Ⅳ as #, 0 or 1 — and
// a heading it read so is no roman (dropped, or taken for a lower one: '피. 쟁점별 검토' under '2. 프랑스'). The paper's own
// printed 목차 box, when it has one, names the chapters in order: each is found again in the text (the same words on a line
// of their own, whatever is read before the dot) and given its numeral (Ⅰ, Ⅱ, …) at the top level. Without a box, a known
// misreading is read as its numeral by the chapters before and after it (Ⅱ … ? … Ⅳ → Ⅲ). And what a list after the
// references heading reads as headings (a book's entry, '2. 사1386, 14070[1617, 2012.') is no heading; a footnote's number
// glued to a heading ('개관2', '차이점33)') is not its words.
const ROMANS = 'ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ';
const ASCII_ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
const OCR_ROMAN = { 'Ｌ': 1, L: 1, l: 1, '|': 1, 'Ｉ': 1, 'ㅣ': 1, 'Il': 2, lI: 2, ll: 2, 'Ⅰl': 2, 'Ⅰ1': 2, 'Ⅱl': 3, 'ⅡI': 3, IlI: 3, lll: 3, Ill: 3, IIl: 3, lIl: 3, '피': 3, '미': 3, m: 3, 'Ⅲl': 4, lV: 4, 'Ⅰv': 4, 'Ⅰ∨': 4, IV: 4, '#': 0, '0': 0, 'O': 0, 'Ｏ': 0, '': 0 };
const HEAD_RE = /^\s*(\S{0,4}?)\s*[.．]\s*(\S.*)$/;
function romanOf(t) {   // { v (0: a misreading of no known numeral), ocr, rest } for a heading led by a roman numeral or its misreading
  const m = HEAD_RE.exec(String(t || ''));
  if (!m) return null;
  const pre = m[1], rest = m[2];
  if (pre.length === 1 && ROMANS.includes(pre)) return { v: ROMANS.indexOf(pre) + 1, ocr: false, rest };
  if (ASCII_ROMAN[pre]) return { v: ASCII_ROMAN[pre], ocr: false, rest };
  if (pre in OCR_ROMAN && pre !== '' && !/^\d+$/.test(pre) && /^[가-힣「『"“(]/.test(rest)) return { v: OCR_ROMAN[pre], ocr: true, rest };
  return null;
}
const REFS = /^(?:참\s*고\s*문\s*헌|References|REFERENCES|Bibliography|BIBLIOGRAPHY)$/;
const APPENDIX = /^[\s<〈《【\[(]*(?:부\s*록|별\s*첨|별\s*표|Appendix|APPENDIX)(?:\s*\d{1,2})?(?:$|[\s>〉》】\])][^,]{0,40}$|[.:：][^,]{0,40}$)/;
const isRefs = (t) => REFS.test(String(t || '').replace(/[<>【】\[\]〈〉《》]/g, '').trim());
const squash = (t) => String(t || '').replace(/[\s·ㆍ「」『』"“”'‘’]/g, '');
// the printed 목차 box on the first pages: its chapters' words, in order (null without one)
function contentsBox(pages) {
  for (let pi = 0; pi < Math.min(3, pages.length); pi++) {
    const lines = String(pages[pi] || '').split('\n');
    const at = lines.findIndex((l) => /^\s*[<〈《【\[(]?\s*목\s*차\s*[>〉》】\])]?\s*$/.test(l));
    if (at < 0) continue;
    const ent = [];
    for (let i = at + 1; i < lines.length && ent.length < 16; i++) {
      const l = lines[i].trim().replace(/[\s.·…]{3,}\d{1,4}$/, '').replace(/\s+\d{1,4}$/, '');
      if (!l) { if (ent.length) break; continue; }
      if (headingKind(l) === 'special') break;
      const m = /^([^가-힣\s]{0,4}?)\s*[.．]?\s*([가-힣「『(][^\n]{0,38})$/.exec(l);
      if (!m || l.length > 44) break;
      const pre = m[1], title = m[2].trim();
      if (/^[가-하]\s*[.．)]/.test(title) || /^\(?\d{1,2}\)$/.test(pre)) { ent.push({ sub: true }); continue; }   // (가. or (1): an entry under a chapter)
      ent.push({ pre, title, line: i });
    }
    const top = ent.filter((e) => !e.sub);
    if (top.length >= 2) return { page: pi, line: top[top.length - 1].line, titles: top.map((e) => e.title), pres: top.map((e) => e.pre) };
  }
  return null;
}
// each of the box's chapters found again in the text: { k, page, yf } (yf: how far down its page, by its line)
// a line's words without what leads it: a numeral as read (Ⅲ, 피., Ｌ, #.) and its dot
const lineWords = (l) => String(l || '').trim().replace(/^(?:피|미|ㅣ)\s*[.．]\s*/, '').replace(/^[^가-힣「『]{0,6}/, '');
function lineOf(pages, page, title) {
  const want = squash(lineWords(String(title).replace(HEAD_RE, '$2')));
  if (!want) return -1;
  const lines = String(pages[page] || '').split('\n');
  return lines.findIndex((l) => squash(lineWords(l)) === want || squash(l) === squash(title));
}
function findChapters(pages, box) {
  const out = [];
  let pi = box.page, li = box.line + 1;
  for (let k = 0; k < box.titles.length; k++) {
    const want = squash(box.titles[k]);
    let hit = null;
    for (let p = pi; p < pages.length && !hit; p++) {
      const lines = String(pages[p] || '').split('\n');
      for (let i = p === pi ? li : 0; i < lines.length; i++) {
        const rest = lineWords(lines[i]);
        if (rest && squash(rest) === want) { hit = { k, page: p, yf: lines.length > 1 ? i / lines.length : 0, line: i, lead: lines[i].trim().slice(0, lines[i].trim().length - rest.length).replace(/[\s.．]+$/, '') }; break; }
      }
    }
    if (!hit) continue;
    out.push(hit); pi = hit.page; li = hit.line + 1;
  }
  return out;
}
function mendRomans(list, pages, scan) {
  let out = list.map((x) => ({ ...x }));
  // (a scan only: a paper set in type has its numerals as printed, and its box lists sections too)
  const box = scan && pages && pages.length ? contentsBox(pages) : null;
  // a chapter: an entry led, in the box or in the text, by a numeral or what a numeral is misread as — never by a plain
  // digit in both (1. 의의 is a section)
  const lead = (t) => t === '' || ROMANS.includes(t) || !!ASCII_ROMAN[t] || (t in OCR_ROMAN && !/^\d+$/.test(t));
  const found = box ? findChapters(pages, box).filter((f) => lead(box.pres[f.k]) || lead(f.lead)) : [];
  if (box && found.length >= 2) {
    found.forEach((f, n) => {
      const words = box.titles[f.k], key = squash(words), numeral = ROMANS[n] || String(n + 1);
      const e = out.find((x) => x.page === f.page && squash(String(x.title).replace(HEAD_RE, '$2')) === key);
      const r = e && romanOf(e.title);
      if (e) { if (!(r && !r.ocr)) e.title = `${numeral}. ${words}`; e.level = 1; }   // (a numeral read right stays as printed)
      else out.push({ title: `${numeral}. ${words}`, level: 1, page: f.page, yf: Math.round(f.yf * 1000) / 1000, mended: true });
    });
    // the chapters put back in their place on their page: every entry of that page by its line in the page's text (an
    // entry not found there keeps its place after the one before it); a chapter put back is scrolled to just above the
    // heading after it (or below the one before)
    const mendedPages = new Set(out.filter((x) => x.mended).map((x) => x.page));
    let ln = -1, lastPage = -1;
    for (const x of out) {
      if (!mendedPages.has(x.page)) continue;
      if (x.page !== lastPage) { ln = -1; lastPage = x.page; }
      const at = x.mended ? Math.round(x.yf * String(pages[x.page] || '').split('\n').length) : lineOf(pages, x.page, x.title);
      x._ln = at >= 0 ? at : ln + 0.01; ln = x._ln;
    }
    out = out.map((x, i) => [x, i]).sort((a, b) => a[0].page - b[0].page || (mendedPages.has(a[0].page) ? a[0]._ln - b[0]._ln : 0) || a[1] - b[1]).map(([x]) => x);
    out.forEach((x, i) => {
      if (!x.mended) return;
      const next = out.slice(i + 1).find((q) => q.page === x.page && q.y != null), prev = out.slice(0, i).reverse().find((q) => q.page === x.page && q.y != null);
      if (next) { x.y = Math.max(0, next.y - 30); delete x.yf; } else if (prev) { x.y = prev.y + 30; delete x.yf; }
    });
    for (const x of out) { delete x._ln; delete x.mended; }
    return out;
  }
  // no box: a misreading between true numerals takes the numeral between them; alone, its likeliest reading (that, a scan
  // only: a paper set in type — or read by its publisher — has a misreading mended only right between two numerals,
  // Ⅱ … m. … Ⅳ; '미. 국의 제도', 'L. 영국' there are its own words)
  const rs = out.map((x) => ({ x, r: romanOf(x.title) })).filter((o) => o.r);
  if (!rs.some((o) => o.r.ocr)) return out;
  for (let i = 0; i < rs.length; i++) {
    const o = rs[i]; if (!o.r.ocr) continue;
    const prev = rs.slice(0, i).reverse().find((q) => !q.r.ocr || q.fixed), next = rs.slice(i + 1).find((q) => !q.r.ocr);
    let v = 0;
    if (prev) v = (prev.fixed || prev.r.v) + 1;
    else if (next && next.r.v > 1) v = next.r.v - (rs.slice(0, rs.indexOf(next)).filter((q) => q.r.ocr).length);
    if (!v || (next && v >= next.r.v)) v = o.r.v;
    if (!v) continue;
    if (!scan && !(prev && next && v === (prev.fixed || prev.r.v) + 1 && v === next.r.v - 1)) continue;
    o.fixed = v; o.x.title = `${ROMANS[v - 1]}. ${o.r.rest}`; o.x.level = 1;
  }
  return out;
}
// a heading's last word and the number glued to it ('개관2', '사례1'): { key (the words before the number, without the
// heading's own numbering), n } or null
const GLUED = /([가-힣])(\d{1,3})$/;
const gluedOf = (t) => { const m = GLUED.exec(t); return m ? { key: t.slice(0, m.index + 1).replace(/^\S{1,4}\s*[.．)]\s*/, '').trim(), n: Number(m[2]), word: (/[가-힣]+$/.exec(t.slice(0, m.index + 1)) || [''])[0] } : null; };
function mendTitles(list) {
  let refs = false;
  const out = [];
  // (the same words numbered in turn — 사례1, 사례2 — are headings so numbered, not a note's number: kept)
  const numbered = new Map();
  for (const x of list) { const g = gluedOf(String(x.title || '').trim()); if (g) { if (!numbered.has(g.key)) numbered.set(g.key, new Set()); numbered.get(g.key).add(g.n); } }
  for (const x of list) {
    let t = String(x.title || '');
    // (a note's number glued to the last word — not 제9 of an article cut short, nor a case number's 헌마554; a bare number
    // is kept when the same words come numbered next to it (사례1 · 사례2) or the heading numbers that word already
    // (모형1과 모형2); with its ')' — 차이점33) — it is a note's always)
    if (!/제\d{1,3}\)?$|조의\d{1,3}\)?$|\d{2,4}\s*[가-힣]{1,3}\d{1,6}\)?$/.test(t)) {
      const g = /\)$/.test(t) ? null : gluedOf(t.trim());
      const own = g && ((numbered.get(g.key) || new Set()).has(g.n - 1) || (numbered.get(g.key) || new Set()).has(g.n + 1) || (g.word && new RegExp(g.word + '\\s*\\d').test(t.trim().slice(0, -String(g.n).length - g.word.length))));
      if (!own) t = t.replace(/([가-힣])\d{1,3}\)?$/, '$1');
    }
    t = t.replace(/([가-힣)])\s*[*†‡]+$/, '$1').trim();
    if (isRefs(t)) refs = true;
    else if (refs && APPENDIX.test(t)) refs = false;   // (an appendix after the references: headings again — 부록's 1. 설문지 2020 stays; an abstract's lines are no headings)
    else if (refs && (x.level || 1) >= 1) {
      const k = headingKind(t), body = t.replace(/^\S{1,4}\s*[.．)]\s*/, '');
      if (k && k !== 'special' && k !== 'roman' && k !== 'chapter' && (/\d/.test(body) || (/,/.test(body) && [...body].length > 12) || [...body].length > 24)) continue;   // (a book's entry, not a heading: 국내문헌, (2) 논문, 기타 stay)
      if (k === 'roman' || k === 'chapter') refs = false;   // (a chapter after the references: headings again)
    }
    out.push(t === x.title ? x : { ...x, title: t });
  }
  return out;
}
// opts.pages: the paper's page texts (index.pages), for the 목차 box and the chapters' lines; opts.ocr: it is a scan read by OCR
export function tidyOutline(list, opts = {}) {
  try { list = mendRomans(mendTitles((list || []).filter((x) => x && x.title)), opts.pages, !!opts.ocr); } catch (e) { /* as it was */ }
  const xs = (list || []).filter((x) => x && x.title);
  // (a decision named by its date is one heading: the 10. of 1993. 12. 10. 선고 is no second number)
  const undated = (t) => String(t).replace(/(?:19|20)\d{2}\s*\.\s*\d{1,2}\s*\.(?:\s*\d{1,2}\s*\.)?/g, (m) => m.replace(/\S/g, '#'));
  const two = (t) => { const ms = [...undated(t).matchAll(MARK)]; return ms.length >= 2 && ms[1].index > 2; };
  let out = xs.filter((x) => !two(x.title));
  // a heading of the box on the first pages met again on a later page (the text itself): the later one stays (a heading
  // that comes back in another chapter — 1. 개관, 소결 — is not the box's, and stays where it is)
  // (only a run of them, or most of a page's entries: the box lists several headings together, a heading of the text stands
  // alone — and the text's own 1. 의의 and 2. 내용 under Ⅱ., met again under Ⅲ., are two of its page's entries, not most;
  // the first pages are the paper's own, after a cover or a notice put before it)
  // (a journal's margin logo glued to an entry of the box — 시사점 Legislation — leaves it the same heading)
  const first = Math.min(...out.map((x) => x.page ?? 0));
  const sameKey = (a, b) => a === b || (b.length >= 6 && a.startsWith(b) && /^[A-Za-z]+$/.test(a.slice(b.length)));
  const twin = out.map((x, i) => { const k = headKey(x.title); return !!k && x.page <= first + 1 && out.slice(i + 1).some((y) => sameKey(k, headKey(y.title)) && (y.page > x.page || (y.page === x.page && (y.y || 0) > (x.y || 0)))); });
  const perPage = {}, onPage = {};
  out.forEach((x, i) => { onPage[x.page] = (onPage[x.page] || 0) + 1; if (twin[i]) perPage[x.page] = (perPage[x.page] || 0) + 1; });
  const boxPage = (p) => perPage[p] >= 2 && perPage[p] * 2 > onPage[p];
  out = out.filter((x, i) => !(twin[i] && (twin[i - 1] || twin[i + 1] || boxPage(x.page))));
  return out.length >= 2 ? out : xs;
}

export function outline(pages, stats) {
  try {
    const ps = (pages || []).filter((p) => p && p.items);
    if (!ps.length) return [];
    const st = stats && stats.bodySize ? stats : docStats(ps);
    const body = st.bodySize, gap = st.lineGap || body * 1.6;
    // how many of the paper's characters are set in each size (to a tenth of a point): a size much of the text is in is the
    // text's (a paper whose notes outweigh it: the notes' size is the commonest, its text a size above), not its headings'
    const sizes = new Map();
    let chars = 0;
    for (const p of ps) for (const it of usable(p.items)) { const k = Math.round(it.h * 10); sizes.set(k, (sizes.get(k) || 0) + it.s.length); chars += it.s.length; }
    const shareAt = (h) => { let c = 0; for (const [k, n] of sizes) if (Math.abs(k / 10 - h) <= h * 0.03) c += n; return chars ? c / chars : 1; };
    const cands = [];
    for (const p of ps) {
      const lay = layout(p, st);
      for (const col of lay.cols) {
        const block = noteBlock(col, body);
        const blockTop = block ? block[0].top : Infinity;
        const lines = col.filter((L) => !L.head && !L.foot && L.base < blockTop);
        const colW = Math.max(1, Math.max(...lines.map((L) => L.x1)) - Math.min(...lines.map((L) => L.x0)));
        const left = Math.min(...lines.map((L) => L.x0));
        for (let i = 0; i < lines.length; i++) {
          const L = lines[i];
          const kind = headingKind(L.text);
          if (!kind) continue;
          const t = L.text;
          const ko = HANGUL.test(t);
          if (/다\.$|[,;]$/.test(t)) continue;
          if (L.h < body * 0.95) continue;
          const bigger = L.h >= body * 1.04;
          const bold = st.bodyFont && L.font && L.font !== st.bodyFont && Math.abs(L.h - body) < body * 0.1;
          // a long numbered line (one naming a decision, a law or a foreign act: 1. 대법원 2019. 3. 28. 선고 2016두43176 판결의
          // 사실관계 및 경과) counts only when the whole of it is set larger — not a heading run into the next column's text,
          // not a body line that starts '다. ' after a line break — in a size few of the paper's characters are in (not its
          // text's, a size above its notes'), and in a font's size: a scan reader's line (ocrPageItems: f 'ocr', one item a
          // line) is as tall as its letters make its box, so its height tells no heading from the text
          const len = (xs) => xs.reduce((n, it) => n + it.s.length, 0);
          const allBig = bigger && len(L.items.filter((it) => it.h >= body * 1.04)) >= 0.9 * len(L.items)
            && !L.items.some((it) => it.f === 'ocr') && shareAt(L.h) < 0.12;
          if (t.length > (ko ? (allBig ? 70 : 40) : 90)) continue;
          const prev = lines[i - 1];
          const spaced = !prev || (L.top - prev.bot) >= gap * 0.75;
          const short = (L.x1 - L.x0) < colW * 0.75;
          const centered = Math.abs((L.x0 + L.x1) / 2 - (left + colW / 2)) < body && (L.x0 - left) > body * 2;
          if (!(bigger || bold || (spaced && short && (L.x0 - left < body * 2.5 || centered)))) continue;
          if (kind === 'special' && !(bigger || bold || spaced)) continue;
          cands.push({ title: t, kind, page: p.n, y: L.top });
        }
      }
    }
    if (cands.length < 2) return [];
    // levels: roman/chapter/special = 1; the other families by the order they first appear (in a book or a thesis, under
    // 제N장 and 제N절, Ⅰ. Ⅱ. are a lower family — when its chapters are its frame: two of them at least, the first before any
    // Ⅰ.; one law's chapter quoted in a paper's text, 제2장 선거관리위원회, is no frame of the paper)
    const chap = cands.filter((c) => c.kind === 'chapter'), roman = cands.findIndex((c) => c.kind === 'roman');
    const framed = chap.length >= 2 && (roman < 0 || cands.indexOf(chap[0]) < roman);
    const top = framed ? ['chapter', 'special'] : ['roman', 'chapter', 'special'];
    const order = [];
    for (const c of cands) if (!top.includes(c.kind) && !order.includes(c.kind)) order.push(c.kind);
    const fixed = { section: 2 };
    let out = cands.map((c) => {
      let level = 1;
      if (!top.includes(c.kind)) level = Math.min(3, (fixed[c.kind] || 0) || 2 + order.indexOf(c.kind));
      return { title: c.title, level, page: c.page, y: Math.round(c.y * 10) / 10 };
    });
    out = tidyOutline(out);
    // a long one (a book, a thesis) keeps its upper levels; it is never left with none for being long
    if (out.length > 120) out = out.filter((o) => o.level <= 2);
    if (out.length > 400) out = out.filter((o) => o.level <= 1);
    return out;
  } catch (e) {
    return [];
  }
}

// ---------------------------------------------------------------- page text
function joinLines(lines) {
  let out = '';
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].text;
    if (!out) { out = t; continue; }
    if (/[A-Za-z]-$/.test(out) && /^[A-Za-z0-9]/.test(t)) {
      out = /^[a-z]/.test(t) && !KEEP_HYPHEN.test(out) ? out.slice(0, -1) + t : out + t;
      continue;
    }
    out += ' ' + t;
  }
  return out;
}

export function pageText(page, stats) {
  try {
    const lay = layout(page, stats);
    const body = lay.body;
    const parts = [], noteParts = [];
    for (const col of lay.cols) {
      const block = noteBlock(col, body);
      const blockTop = block ? block[0].top : Infinity;
      const lines = col.filter((L) => !L.head && !L.foot && L.base < blockTop);
      const left = lines.length ? Math.min(...lines.map((L) => L.x0)) : 0;
      const right = lines.length ? Math.max(...lines.map((L) => L.x1)) : 0;
      // paragraphs: a new one starts after a short line or at an indented line
      let para = [];
      const flush = () => { if (para.length) { parts.push(joinLines(para)); para = []; } };
      for (let i = 0; i < lines.length; i++) {
        const L = lines[i], prev = lines[i - 1];
        if (prev && (prev.x1 < right - body * 2 || L.x0 > left + body * 0.8 || L.top - prev.bot > body * 1.2)) flush();
        para.push(L);
      }
      flush();
      if (block) {
        let cur = [];
        for (const L of block) {
          if (cur.length && (noteStart(L, body) || SYMBOL_START.test(L.text))) { noteParts.push(joinLines(cur)); cur = []; }
          cur.push(L);
        }
        if (cur.length) noteParts.push(joinLines(cur));
      }
    }
    return parts.join('\n') + (noteParts.length ? '\n\n' + noteParts.join('\n') : '');
  } catch (e) {
    return '';
  }
}

// ---------------------------------------------------------------- clean copy
const ABBR = /(^|[^A-Za-z])(vol|no|nos|pp|p|art|arts|para|paras|sec|secs|ch|chap|cl|fig|n|nn|ed|eds|v|vs|cf|id|ibid|op|cit|at|supra|infra|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|st|mr|mrs|ms|dr|prof|u\.s|e\.g|i\.e)$/i;

export function cleanCopy(str) {
  if (typeof str !== 'string') return '';
  let s = str.replace(/\r\n?/g, '\n').replace(/[   ]/g, ' ').replace(/­/g, '').replace(/[​﻿]/g, '');
  // paragraphs: blank lines stay as one line break; single line breaks inside a paragraph are joined
  const paras = s.split(/\n\s*\n/);
  const out = paras.map((p) => {
    const lines = p.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
    let t = '';
    for (const l of lines) {
      if (!t) { t = l; continue; }
      if (/[A-Za-z]-$/.test(t) && /^[A-Za-z0-9]/.test(l)) {
        // a word broken at the line end loses its hyphen; a compound ("self-executing", "Anglo-American") keeps it
        t = /^[a-z]/.test(l) && !KEEP_HYPHEN.test(t) ? t.slice(0, -1) + l : t + l;
        continue;
      }
      t += ' ' + l;
    }
    // footnote markers glued to the text: "없다.12) 이러한" / "이론12)은" -> marker removed
    t = t.replace(/([가-힣A-Za-z.,;:!?"”’」』)\]])(\d{1,3})\)(?=[\s,.;:"”’」』)\]]|[가-힣]|$)/g, (m, a, d, off, all) => {
      // keep "(12)" and list items "1)" at the start
      return a === ')' && /\(\d{1,3}$/.test(all.slice(0, off + 1)) ? m : a;
    });
    // superscript markers without ")" right after sentence punctuation: "constitution.12 The" / "없다.3 이러한"
    t = t.replace(/(^|[\s(“"'‘])([^\s(“"'‘]*?)([가-힣]|[A-Za-z]{3,})([.,;:])(\d{1,3})(?=\s+[A-Z가-힣“"‘(]|\s*$)/g,
      (m, pre, word, last, punct, d) => {
        const w = word + last;
        if (/^[A-Za-z]/.test(last) && ABBR.test(w)) return m;
        return pre + word + last + punct;
      });
    t = t.replace(/\s+([.,;:!?)\]」』”’])/g, '$1').replace(/([(\[「『“‘])\s+/g, '$1');
    return t.replace(/ {2,}/g, ' ').trim();
  });
  return out.filter(Boolean).join('\n');
}
