// The statement at many widths: line count of the gold sentence, its last line, and no empty line before it.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const out = [];
  for (const lang of ['ko', 'en']) for (const w of [360, 390, 430, 700, 768, 1024, 1199, 1200, 1280, 1440, 1920]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.goto('http://127.0.0.1:8766/?lang=' + lang); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150);
    const r = await p.evaluate(() => {
      const st = [...document.querySelectorAll('.stmt strong')].find((x) => x.offsetParent);
      const range = document.createRange(); range.selectNodeContents(st);
      const rects = [...range.getClientRects()].filter((r) => r.width > 2);
      const lines = []; for (const r of rects) { const l = lines.find((x) => Math.abs(x.top - r.top) < 4); if (l) l.right = Math.max(l.right, r.right); else lines.push({ top: r.top, left: r.left, right: r.right }); }
      // words on the last line
      const words = st.textContent.split(/\s+/); let last = 0; const lastTop = lines[lines.length - 1].top;
      const tw = document.createTreeWalker(st, NodeFilter.SHOW_TEXT); const t = tw.nextNode(); const rr = document.createRange();
      let idx = 0; const lastWords = [];
      for (const word of t.textContent.split(/(\s+)/)) { if (word.trim()) { rr.setStart(t, idx); rr.setEnd(t, idx + word.length); const rc = rr.getClientRects()[0]; if (rc && Math.abs(rc.top - lastTop) < 4) lastWords.push(word); } idx += word.length; }
      const s2 = st.parentElement.getBoundingClientRect(), sb = st.getBoundingClientRect();
      const prev = st.previousSibling; const lh = parseFloat(getComputedStyle(st).lineHeight);
      return { lines: lines.length, last: lastWords.join(' '), widths: lines.map((l) => Math.round(l.right - l.left)), gapAbove: Math.round(sb.top - s2.top), lh: Math.round(lh) };
    });
    out.push(`${lang} ${String(w).padStart(4)}  lines ${r.lines}  widths ${r.widths.join('/')}  last line: "${r.last}"  top offset ${r.gapAbove}px (line ${r.lh}px)`);
    await p.close();
  }
  console.log(out.join('\n')); await b.close();
})();
