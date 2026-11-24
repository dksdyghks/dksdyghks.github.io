// 서재: writes the reader's marks (highlights and underlines) into a copy of the PDF as standard annotations,
// so they show in Acrobat, Preview, Edge/Chrome and pdf.js, and come out when the page is printed.
//
//   buildAnnotatedPdf(originalBytes, marks, opts) -> Promise<Uint8Array>   (the whole saved PDF)
//
// originalBytes is always the untouched original file; the marks are written fresh each time.
// A mark: { id, p (0-based page index), kind: 'hl' | 'ul', color: '#RRGGBB', rects: [[x, y, w, h], ...], text }
// rects are normalized 0..1 to the page as pdf.js displays it (page.getViewport({ scale: 1 }): /Rotate and the
// CropBox applied, origin top-left); here they are mapped back to PDF user space with the same transform pdf.js uses.
// Each mark becomes one /Highlight or /Underline annotation with /QuadPoints, a colour, /F 4 (print), /T 서재,
// /NM seojae:<id>, the mark's text in /Contents and an explicit appearance stream. Highlights are painted with the
// Multiply blend mode, so text under them stays black on screen and on paper. Annotations made by other apps are
// left as they are; any earlier 서재 annotation in the input (/NM seojae:…) is removed first.
// Errors carry .code: 'encrypted' (password-protected file; pdf-lib cannot rewrite it) or 'invalid' (cannot parse,
// or the written file did not read back). Nothing corrupt is ever returned: the output is re-read before it is returned.
import * as PDFLib from './vendor/pdf-lib-1.17.1/pdf-lib.esm.min.js';

const { PDFDocument, PDFName, PDFString, PDFHexString, PDFArray, PDFDict, PDFNumber, PDFRef, ParseSpeeds } = PDFLib;

export const MARK_COLORS = Object.freeze({
  hl: Object.freeze({ yellow: '#FFD84D', green: '#8EE0A6', sky: '#8EC5FF' }),
  ul: Object.freeze({ red: '#E5484D', blue: '#2F6FEB' }),
});

const HL_OPACITY = 0.45;          // fill opacity of a highlight (with Multiply)
const UL_RATIO = 0.07;            // underline thickness, as a share of the line's height
const UL_MIN = 0.6;               // ... but never thinner than this (pt)
const AUTHOR = '서재';
const N = (name) => PDFName.of(name);

function fail(code, message, cause) {
  const e = new Error(message);
  e.code = code;
  if (cause) e.cause = cause;
  return e;
}
const r3 = (v) => { const x = Math.round(v * 1000) / 1000; return Object.is(x, -0) ? 0 : x; };
const fmt = (v) => String(r3(v));

function rgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  const h = m ? m[1] : 'FFD84D';
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

/* ---------- page geometry, exactly as pdf.js computes it ---------- */
function numbers(ctx, obj) {
  const arr = ctx.lookup(obj);
  if (!(arr instanceof PDFArray) || arr.size() !== 4) return null;
  const v = [];
  for (let i = 0; i < 4; i++) {
    const n = ctx.lookup(arr.get(i));
    if (!(n instanceof PDFNumber)) return null;
    v.push(n.asNumber());
  }
  return v.every(Number.isFinite) ? v : null;
}
function boxOf(leaf, name) {                       // inheritable /MediaBox or /CropBox, normalized; null when invalid
  const v = numbers(leaf.context, leaf.getInheritableAttribute(N(name)));
  if (!v) return null;
  const b = [Math.min(v[0], v[2]), Math.min(v[1], v[3]), Math.max(v[0], v[2]), Math.max(v[1], v[3])];
  return b[2] - b[0] > 0 && b[3] - b[1] > 0 ? b : null;
}
function viewOf(leaf) {                            // pdf.js Page.view: the CropBox clipped to the MediaBox
  const media = boxOf(leaf, 'MediaBox') || [0, 0, 612, 792];
  const crop = boxOf(leaf, 'CropBox') || media;
  if (crop.some((v, i) => v !== media[i])) {
    const b = [Math.max(crop[0], media[0]), Math.max(crop[1], media[1]), Math.min(crop[2], media[2]), Math.min(crop[3], media[3])];
    if (b[2] - b[0] > 0 && b[3] - b[1] > 0) return b;
  }
  return media;
}
function rotationOf(leaf) {                        // pdf.js Page.rotate
  const n = leaf.context.lookup(leaf.getInheritableAttribute(N('Rotate')));
  let r = n instanceof PDFNumber ? n.asNumber() : 0;
  if (!Number.isFinite(r) || r % 90 !== 0) return 0;
  r %= 360;
  return r < 0 ? r + 360 : r;
}
// pdf.js PageViewport at scale 1: user space -> display (origin top-left). Returns the matrix, its inverse, and the size.
function viewport(view, rotation) {
  const cx = (view[2] + view[0]) / 2, cy = (view[3] + view[1]) / 2;
  let a, b, c, d;
  switch (rotation) {
    case 90: a = 0; b = 1; c = 1; d = 0; break;
    case 180: a = -1; b = 0; c = 0; d = 1; break;
    case 270: a = 0; b = -1; c = -1; d = 0; break;
    default: a = 1; b = 0; c = 0; d = -1;
  }
  let ox, oy, width, height;
  if (a === 0) {
    ox = Math.abs(cy - view[1]); oy = Math.abs(cx - view[0]);
    width = view[3] - view[1]; height = view[2] - view[0];
  } else {
    ox = Math.abs(cx - view[0]); oy = Math.abs(cy - view[1]);
    width = view[2] - view[0]; height = view[3] - view[1];
  }
  const e = ox - a * cx - c * cy, f = oy - b * cx - d * cy;
  const det = a * d - b * c;                       // always -1 here (the y axis flips)
  const toUser = (X, Y) => [(d * (X - e) - c * (Y - f)) / det, (-b * (X - e) + a * (Y - f)) / det];
  return { width, height, toUser };
}

/* ---------- marks ---------- */
function cleanRects(rects) {
  const out = [];
  for (const r of Array.isArray(rects) ? rects : []) {
    if (!Array.isArray(r) || r.length < 4) continue;
    let [x, y, w, h] = r.map(Number);
    if (![x, y, w, h].every(Number.isFinite)) continue;
    const x2 = Math.min(1, x + w), y2 = Math.min(1, y + h);
    x = Math.max(0, x); y = Math.max(0, y);
    if (x2 - x <= 0 || y2 - y <= 0) continue;
    out.push([x, y, x2 - x, y2 - y]);
  }
  return out;
}
// Rects of one mark that sit on the same line and touch (or nearly) become one; lines and columns stay apart.
// Only boxes of horizontal text are joined (a box at least half as wide as it is tall): the boxes of text that runs
// up or down the screen are tall and narrow, and side by side they are separate lines, not pieces of one.
const across = (r) => r[2] >= 0.5 * r[3];
function mergeLine(rects) {
  const rs = rects.map((r) => r.slice()).sort((p, q) => (p[1] + p[3] / 2) - (q[1] + q[3] / 2) || p[0] - q[0]);
  const out = [];
  for (const r of rs) {
    const m = across(r) && out.find((o) => {
      if (!across(o)) return false;
      const hMin = Math.min(o[3], r[3]), hMax = Math.max(o[3], r[3]);
      if (hMin / hMax < 0.6) return false;
      if (Math.abs((o[1] + o[3] / 2) - (r[1] + r[3] / 2)) > 0.35 * hMin) return false;
      const gap = Math.max(o[0], r[0]) - Math.min(o[0] + o[2], r[0] + r[2]);
      return gap <= 0.5 * hMax;
    });
    if (!m) { out.push(r); continue; }
    const x1 = Math.min(m[0], r[0]), y1 = Math.min(m[1], r[1]);
    const x2 = Math.max(m[0] + m[2], r[0] + r[2]), y2 = Math.max(m[1] + m[3], r[1] + r[3]);
    m[0] = x1; m[1] = y1; m[2] = x2 - x1; m[3] = y2 - y1;
  }
  return out;
}

function annotsOf(page) {                          // the page's own /Annots array (created when missing)
  const leaf = page.node;
  const arr = leaf.lookup(N('Annots'));
  if (arr instanceof PDFArray) return arr;
  const fresh = leaf.context.obj([]);
  leaf.set(N('Annots'), fresh);
  return fresh;
}
function textOf(obj) {
  try { return obj instanceof PDFString || obj instanceof PDFHexString ? obj.decodeText() : ''; } catch (e) { return ''; }
}
function removeOurs(page) {                        // defensive: drop 서재 annotations already in the input
  const leaf = page.node, ctx = leaf.context;
  const arr = leaf.lookup(N('Annots'));
  if (!(arr instanceof PDFArray)) return 0;
  let removed = 0;
  for (let i = arr.size() - 1; i >= 0; i--) {
    const raw = arr.get(i), dict = ctx.lookup(raw);
    if (!(dict instanceof PDFDict) || !textOf(dict.lookup(N('NM'))).startsWith('seojae:')) continue;
    arr.remove(i);
    removed++;
    const ap = dict.lookup(N('AP'));
    if (ap instanceof PDFDict) for (const k of ['N', 'R', 'D']) { const v = ap.get(N(k)); if (v instanceof PDFRef) ctx.delete(v); }
    if (raw instanceof PDFRef) ctx.delete(raw);
  }
  return removed;
}

function addMark(doc, page, geo, mark, now, opacity) {
  const ctx = doc.context;
  const ul = mark.kind === 'ul';
  const rects = mergeLine(cleanRects(mark.rects));
  if (!rects.length) return false;
  const quads = [], fills = [];
  let llx = Infinity, lly = Infinity, urx = -Infinity, ury = -Infinity;
  const corners = (X, Y, W, H) => [geo.toUser(X, Y), geo.toUser(X + W, Y), geo.toUser(X, Y + H), geo.toUser(X + W, Y + H)];
  const bbox = (pts) => {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  for (const [nx, ny, nw, nh] of rects) {
    const X = nx * geo.width, Y = ny * geo.height, W = nw * geo.width, H = nh * geo.height;
    const q = corners(X, Y, W, H);                       // upper-left, upper-right, lower-left, lower-right (as read)
    for (const p of q) quads.push(r3(p[0]), r3(p[1]));
    const b = bbox(q);
    llx = Math.min(llx, b[0]); lly = Math.min(lly, b[1]); urx = Math.max(urx, b[2]); ury = Math.max(ury, b[3]);
    if (ul) {
      const t = Math.min(H, Math.max(UL_MIN, UL_RATIO * H));
      fills.push(bbox(corners(X, Y + H - t, W, t)));     // a band along the bottom of the line box
    } else {
      fills.push(b);
    }
  }
  const pad = 0.5;
  const rect = [r3(llx - pad), r3(lly - pad), r3(urx + pad), r3(ury + pad)];
  const [cr, cg, cb] = rgb(mark.color || (ul ? MARK_COLORS.ul.red : MARK_COLORS.hl.yellow));
  const body = fills.map((b) => `${fmt(b[0])} ${fmt(b[1])} ${fmt(b[2] - b[0])} ${fmt(b[3] - b[1])} re`).join('\n');
  const content = ul
    ? `q\n${fmt(cr)} ${fmt(cg)} ${fmt(cb)} rg\n${body}\nf\nQ\n`
    : `q\n/GS0 gs\n${fmt(cr)} ${fmt(cg)} ${fmt(cb)} rg\n${body}\nf\nQ\n`;
  const resources = ul ? ctx.obj({}) : ctx.obj({ ExtGState: { GS0: { Type: 'ExtGState', BM: 'Multiply', ca: opacity, CA: opacity } } });
  const ap = ctx.stream(content, { Type: 'XObject', Subtype: 'Form', FormType: 1, BBox: rect, Matrix: [1, 0, 0, 1, 0, 0], Resources: resources });
  const apRef = ctx.register(ap);
  const annot = ctx.obj({
    Type: 'Annot', Subtype: ul ? 'Underline' : 'Highlight', Rect: rect, QuadPoints: quads,
    C: [r3(cr), r3(cg), r3(cb)], F: 4, AP: { N: apRef }, P: page.ref,
  });
  if (!ul) annot.set(N('CA'), PDFNumber.of(opacity));
  annot.set(N('T'), PDFHexString.fromText(AUTHOR));
  annot.set(N('NM'), PDFHexString.fromText('seojae:' + String(mark.id == null ? '' : mark.id)));
  annot.set(N('M'), PDFString.fromDate(now));
  annot.set(N('CreationDate'), PDFString.fromDate(now));
  const text = String(mark.text == null ? '' : mark.text).replace(/\s+/g, ' ').trim();
  if (text) annot.set(N('Contents'), PDFHexString.fromText(text));
  annotsOf(page).push(ctx.register(annot));
  return true;
}

// pdf-lib refuses encrypted files (its error class does not survive the ES5 build, so the message is checked too);
// a file it cannot parse at all but whose trailer names an /Encrypt dictionary is reported as encrypted as well.
function isEncrypted(e, bytes) {
  if (e instanceof PDFLib.EncryptedPDFError || (e && e.name === 'EncryptedPDFError')) return true;
  if (e && /\bencrypted\b/i.test(String(e.message || ''))) return true;
  const tail = bytes.subarray(Math.max(0, bytes.length - 8192));
  let s = '';
  for (let i = 0; i < tail.length; i++) s += String.fromCharCode(tail[i]);
  return /\/Encrypt\s+\d+\s+\d+\s+R|\/Encrypt\s*<</.test(s);
}

export async function buildAnnotatedPdf(originalBytes, marks, opts = {}) {
  let bytes;
  if (originalBytes instanceof Uint8Array) bytes = originalBytes;
  else if (originalBytes instanceof ArrayBuffer) bytes = new Uint8Array(originalBytes);
  else if (ArrayBuffer.isView(originalBytes)) bytes = new Uint8Array(originalBytes.buffer, originalBytes.byteOffset, originalBytes.byteLength);
  else throw fail('invalid', 'buildAnnotatedPdf: expected the PDF bytes');

  let doc;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false, parseSpeed: opts.parseSpeed ?? ParseSpeeds.Fast });
  } catch (e) {
    if (isEncrypted(e, bytes)) throw fail('encrypted', 'The PDF is encrypted', e);
    throw fail('invalid', 'The PDF could not be read', e);
  }

  const opacity = Number.isFinite(opts.opacity) ? Math.min(1, Math.max(0.05, opts.opacity)) : HL_OPACITY;
  const now = opts.date instanceof Date ? opts.date : new Date();
  let pages, pageCount;
  try {
    pages = doc.getPages();
    pageCount = pages.length;
    const geo = new Map();
    for (const page of pages) removeOurs(page);
    for (const mark of Array.isArray(marks) ? marks : []) {
      if (!mark || !Number.isInteger(mark.p) || mark.p < 0 || mark.p >= pageCount) continue;
      const page = pages[mark.p];
      if (!geo.has(mark.p)) geo.set(mark.p, viewport(viewOf(page.node), rotationOf(page.node)));
      addMark(doc, page, geo.get(mark.p), mark, now, opacity);
    }
  } catch (e) {
    throw fail('invalid', 'The marks could not be written into this PDF', e);
  }

  let out;
  try {
    out = await doc.save({ updateFieldAppearances: false, objectsPerTick: opts.objectsPerTick ?? 2000 });
  } catch (e) {
    throw fail('invalid', 'The PDF could not be saved', e);
  }
  try {                                              // never hand back a file that does not read back
    const check = await PDFDocument.load(out, { updateMetadata: false, parseSpeed: ParseSpeeds.Fastest });
    if (check.getPageCount() !== pageCount) throw new Error('page count changed');
  } catch (e) {
    throw fail('invalid', 'The written PDF did not read back', e);
  }
  return out;
}
