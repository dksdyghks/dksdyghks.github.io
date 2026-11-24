// 스캔본 글자 읽기 (OCR): a page that is only a picture is read here, in this browser, with Tesseract.
// Korean first; a page that comes out mostly in Latin letters is read again as English, and the rest of that paper with it.
// The engine and its language data come from this site (vendor/tesseract-7.0.0) and are kept for use without internet.
const TESS = new URL('./vendor/tesseract-7.0.0/', import.meta.url).href;
const workers = {};
let failed = null;

async function engine(lang) {
  if (workers[lang]) return workers[lang];
  const T = (await import(TESS + 'tesseract.esm.min.js')).default;
  failed = null;
  const w = await T.createWorker(lang, 1, {
    workerPath: TESS + 'worker.min.js', corePath: TESS + 'core', langPath: TESS + 'lang', gzip: true, cacheMethod: 'none',
    errorHandler: (e) => { failed = e; },   // a failure inside the engine is reported, never taken for an empty page
  });
  if (failed) { try { await w.terminate(); } catch (e) { /* gone */ } throw new Error('engine'); }
  workers[lang] = w;
  return w;
}
export async function stop() {
  for (const k of Object.keys(workers)) { try { await workers[k].terminate(); } catch (e) { /* gone */ } delete workers[k]; }
}

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const hangulShare = (s) => { const h = (s.match(/[가-힣]/g) || []).length, l = (s.match(/[A-Za-z]/g) || []).length; return h + l ? h / (h + l) : 1; };

async function draw(pdfPage) {   // about 2000 px on the long side: enough for small print, quick enough for a tablet
  const v1 = pdfPage.getViewport({ scale: 1 });
  const vp = pdfPage.getViewport({ scale: Math.min(3.2, 2000 / Math.max(v1.width, v1.height)) });
  const c = document.createElement('canvas');
  c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await pdfPage.render({ canvasContext: ctx, viewport: vp }).promise;
  return c;
}

// The engine's own line text is spaced right, while its 'words' are sometimes single Korean syllables. So the words of a
// line are taken from that text, each placed over the pieces it is made of; if the two ever disagree, close pieces are joined.
function lineWords(ln) {
  const ws = (ln.words || []).filter((x) => x.text && x.text.trim() && x.bbox);
  if (!ws.length) return [];
  const own = [];   // for every letter of the engine's pieces, which piece it is in
  ws.forEach((w, i) => { for (const ch of w.text.replace(/\s+/g, '')) own.push(i); });
  const tokens = String(ln.text || '').split(/\s+/).filter(Boolean);
  const flat = (a) => a.join('').replace(/\s+/g, '');
  if (tokens.length && flat(tokens) === flat(ws.map((w) => w.text)) && [...flat(tokens)].length === own.length) {
    const out = []; let k = 0;
    for (const tok of tokens) {
      const n = [...tok].length, a = own[k], b = own[k + n - 1]; k += n;
      let x0 = Infinity, x1 = -Infinity;
      for (let i = a; i <= b; i++) { x0 = Math.min(x0, ws[i].bbox.x0); x1 = Math.max(x1, ws[i].bbox.x1); }
      out.push([x0, x1, tok]);
    }
    return out;
  }
  const h = Math.max(1, ln.bbox.y1 - ln.bbox.y0), out = [];
  for (const w of ws) {
    const last = out[out.length - 1];
    if (last && w.bbox.x0 - last[1] < 0.42 * h) { last[1] = Math.max(last[1], w.bbox.x1); last[2] += w.text.trim(); }
    else out.push([w.bbox.x0, w.bbox.x1, w.text.trim()]);
  }
  return out;
}

async function recognize(c, lang) {
  const w = await engine(lang);
  const r = await w.recognize(c, {}, { blocks: true, text: false });
  if (failed) throw new Error('engine');
  const W = c.width, H = c.height, lines = [];
  for (const b of r.data.blocks || []) for (const pa of b.paragraphs || []) for (const ln of pa.lines || []) {
    if (!ln.bbox) continue;
    const words = lineWords(ln);
    if (!words.length) continue;
    const L = ln.bbox;
    lines.push([r4(L.x0 / W), r4(L.y0 / H), r4(L.x1 / W), r4(L.y1 / H), words.map(([a, z, t]) => [r4(a / W), r4(z / W), t])]);
  }
  return lines;
}

// one page -> { lines: [[x0, y0, x1, y1, [[x0, x1, word], …]], …] (places as parts of the page, 0..1), lang }
export async function readPage(pdfPage, lang = 'kor') {
  const c = await draw(pdfPage);
  try {
    let lines = await recognize(c, lang), used = lang;
    if (lang === 'kor' && lines.length && hangulShare(textOf(lines)) < 0.15) { lines = await recognize(c, 'eng'); used = 'eng'; }
    return { lines, lang: used };
  } finally { c.width = c.height = 0; }
}

// the words of a page as plain text, a line to a line (for search)
export function textOf(lines) {
  return (lines || []).map((l) => l[4].map((w) => w[2]).join(' ')).join('\n');
}
