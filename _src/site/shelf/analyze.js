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
    if (best + 1 < 1) return none;
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
  if (/^[가-하]\.\s*\S/.test(t)) return 'hangul';
  if (/^\(\d{1,2}\)\s*\S/.test(t)) return 'paren';
  return null;
}

export function outline(pages, stats) {
  try {
    const ps = (pages || []).filter((p) => p && p.items);
    if (!ps.length) return [];
    const st = stats && stats.bodySize ? stats : docStats(ps);
    const body = st.bodySize, gap = st.lineGap || body * 1.6;
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
          if (t.length > (ko ? 40 : 90)) continue;
          if (/다\.$|[,;]$/.test(t)) continue;
          if (L.h < body * 0.95) continue;
          const bigger = L.h >= body * 1.04;
          const bold = st.bodyFont && L.font && L.font !== st.bodyFont && Math.abs(L.h - body) < body * 0.1;
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
    // levels: roman/chapter/special = 1; the other families by the order they first appear
    const order = [];
    for (const c of cands) if (!['roman', 'chapter', 'special'].includes(c.kind) && !order.includes(c.kind)) order.push(c.kind);
    const fixed = { section: 2 };
    let out = cands.map((c) => {
      let level = 1;
      if (!['roman', 'chapter', 'special'].includes(c.kind)) level = Math.min(3, (fixed[c.kind] || 0) || 2 + order.indexOf(c.kind));
      return { title: c.title, level, page: c.page, y: Math.round(c.y * 10) / 10 };
    });
    if (out.length > 60) out = out.filter((o) => o.level <= 2);
    if (out.length > 60) return [];
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
