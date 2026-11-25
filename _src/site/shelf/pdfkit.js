// The PDF engine (pdf.js, vendored) and what 연구실 책장 asks of it: open, picture of page 1, page texts for search.
const V = './vendor/pdfjs-4.10.38/';
let libp = null;

export function lib() {
  if (!libp) {
    if (!Promise.withResolvers) {   // older Safari
      Promise.withResolvers = function () { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
    }
    libp = import(V + 'pdf.min.js').then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL(V + 'pdf.worker.min.js', import.meta.url).href;
      return m;
    });
  }
  return libp;
}

const OPTS = () => ({
  cMapUrl: new URL(V + 'cmaps/', import.meta.url).href,
  cMapPacked: true,
  standardFontDataUrl: new URL(V + 'standard_fonts/', import.meta.url).href,
  isEvalSupported: false,
  enableXfa: false,
});

// Open from bytes (pdf.js takes the buffer it is given, so a copy is passed) or from the server with range requests
export async function openBytes(bytes, password) {
  const pdfjs = await lib();
  const data = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes.slice(0));
  return pdfjs.getDocument({ ...OPTS(), data, password }).promise;
}
export async function openUrl(url, headers) {
  const pdfjs = await lib();
  return pdfjs.getDocument({ ...OPTS(), url, httpHeaders: headers, withCredentials: false, rangeChunkSize: 262144, disableAutoFetch: false }).promise;
}

// A page's text items in the shape analyze.js expects
export async function pageItems(doc, n, page) {
  const pdfjs = await lib();
  const pg = page || await doc.getPage(n + 1);
  const vp = pg.getViewport({ scale: 1 });
  const tc = await pg.getTextContent();
  const items = [];
  for (const it of tc.items) {
    if (!('str' in it)) continue;
    const t = pdfjs.Util.transform(vp.transform, it.transform);
    const h = Math.hypot(t[2], t[3]);
    const h0 = Math.hypot(it.transform[2], it.transform[3]) || 1;
    items.push({ s: it.str, x: t[4], y: t[5], w: it.width * (h / h0 || 1), h, f: it.fontName, eol: !!it.hasEOL });
  }
  return { page: { n, W: vp.width, H: vp.height, items }, textContent: tc, pdfPage: pg };
}

// First page as a small JPEG for the library list
export async function thumbnail(doc, width = 240) {
  const pg = await doc.getPage(1);
  const vp1 = pg.getViewport({ scale: 1 });
  const scale = width / vp1.width;
  const vp = pg.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await pg.render({ canvasContext: ctx, viewport: vp }).promise;
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.78));
  c.width = c.height = 0;
  pg.cleanup();
  return blob;
}

// Every page's text, plus the printed page numbering and headings, done once by the device that uploads the file
export async function textIndex(doc, A, onProgress, signal) {
  const pages = [];
  const n = doc.numPages;
  for (let i = 0; i < n; i++) {
    if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
    const { page, pdfPage } = await pageItems(doc, i);
    pages.push(page);
    pdfPage.cleanup();
    if (onProgress && (i % 5 === 4 || i === n - 1)) onProgress((i + 1) / n);
    if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));   // stay responsive on long books
  }
  const stats = A.docStats(pages);
  let labels = { offset: null, confident: false }, outline = [];
  try { labels = A.pageLabels(pages); } catch (e) { /* no numbering */ }
  try { outline = A.outline(pages, stats); } catch (e) { /* no headings */ }
  const texts = pages.map((p) => { try { return A.pageText(p, stats); } catch (e) { return p.items.map((x) => x.s).join(' '); } });
  return { v: 1, pages: texts, labels, outline, chars: texts.reduce((s, t) => s + t.length, 0) };
}

// Pages that are pictures with (almost) no text: a scan. A download notice laid over a scanned page still counts as almost none.
// When most pages are like that, the paper is a scan; otherwise only those few pages that draw an image count (a scanned
// appendix in a typed paper), which is checked page by page.
export async function picturePages(doc, texts) {
  const empty = [], broken = [];
  for (let i = 0; i < doc.numPages; i++) {
    const t = (texts[i] || '').replace(/\s+/g, '');
    if (garbled(t)) broken.push(i); else if (t.length < 150) empty.push(i);
  }
  if (empty.length + broken.length >= doc.numPages * 0.5) return [...empty, ...broken].sort((a, b) => a - b);
  if (!empty.length) return broken;
  const pdfjs = await lib();
  const O = pdfjs.OPS;
  const IMG = new Set([O.paintImageXObject, O.paintInlineImageXObject, O.paintImageXObjectRepeat, O.paintImageMaskXObject, O.paintImageMaskXObjectGroup, O.paintImageMaskXObjectRepeat, O.paintInlineImageXObjectGroup].filter((x) => x != null));
  const out = [];
  for (const i of empty) {
    let pg = null;
    try { pg = await doc.getPage(i + 1); const ops = await pg.getOperatorList(); if (ops.fnArray.some((f) => IMG.has(f))) out.push(i); }
    catch (e) { /* an unreadable page */ } finally { if (pg) pg.cleanup(); }
  }
  return [...out, ...broken].sort((a, b) => a - b);
}
// text that is mostly not letters a Korean or English paper uses: a font whose characters map to nothing sensible
function garbled(t) {
  if (t.length < 40) return false;
  const ok = (t.match(/[가-힣ㄱ-ㅎA-Za-z0-9\u3400-\u9FFF.,()·:;'"“”‘’\-–—「」『』｢｣<>%/~\[\]①-⑳ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/g) || []).length;
  return ok / t.length < 0.5;
}

export async function gzipJSON(obj) {
  const s = new Blob([JSON.stringify(obj)]).stream();
  if (typeof CompressionStream === 'undefined') return new Blob([JSON.stringify(obj)], { type: 'application/json' });
  return new Response(s.pipeThrough(new CompressionStream('gzip'))).blob();
}
export async function gunzipJSON(blob) {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b && typeof DecompressionStream !== 'undefined') {
    return JSON.parse(await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text());
  }
  return JSON.parse(await blob.text());
}

export async function sha256id(buf) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return [...d.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// For files that cannot be rewritten (locked PDFs): every page drawn as a picture with its marks on it, into a new PDF of
// the same page sizes. Used only when writing real annotations into the file is impossible, so printing always shows marks.
export async function flattenWithMarks(bytes, marks, onProgress) {
  const PDFLib = await import('./vendor/pdf-lib-1.17.1/pdf-lib.esm.min.js');
  const doc = await openBytes(bytes);
  const out = await PDFLib.PDFDocument.create();
  const byPage = new Map();
  for (const m of marks) { if (!byPage.has(m.p)) byPage.set(m.p, []); byPage.get(m.p).push(m); }
  for (let i = 0; i < doc.numPages; i++) {
    const pg = await doc.getPage(i + 1);
    const vp1 = pg.getViewport({ scale: 1 });
    const scale = Math.min(200 / 72, 4000 / Math.max(vp1.width, vp1.height));   // about 200 dpi
    const vp = pg.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    for (const m of byPage.get(i) || []) {
      for (const r of m.rects) {
        const x = r[0] * c.width, y = r[1] * c.height, w = r[2] * c.width, h = r[3] * c.height;
        ctx.save();
        if (m.kind === 'hl') { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.45; ctx.fillStyle = m.color; ctx.fillRect(x, y - h * 0.06, w, h * 1.12); }
        else { ctx.fillStyle = m.color; const t = Math.max(2, h * 0.08); ctx.fillRect(x, y + h - t, w, t); }
        ctx.restore();
      }
    }
    const jpg = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86));
    const img = await out.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
    const page = out.addPage([vp1.width, vp1.height]);
    page.drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });
    c.width = c.height = 0; pg.cleanup();
    if (onProgress) onProgress((i + 1) / doc.numPages);
  }
  doc.destroy();
  return out.save();
}
