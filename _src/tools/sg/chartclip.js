// Every value label of every chart must stay inside its SVG canvas (no clipping), on both canvases.
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [mode, dev] of [['mobile', devices['iPhone 14']], ['desktop', { viewport: { width: 1280, height: 900 } }]]) {
    const ctx = await b.newContext(dev); const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/psat/'); await p.evaluate(() => sessionStorage.setItem('door:songgong', 'b883ddfa1079c250e8a6485c3fe1295b20a943727b649f01faffca22f75a87e6')); await p.reload(); await p.waitForTimeout(700);
    let bad = 0, n = 0, minTop = 1e9;
    const runs = [];
    for (let i = 0; i < 90; i++) runs.push(['gen', 'data', 'D-chart', 1000 + i * 37, (i % 3) + 1]);
    runs.push(['bank', 'data', 'D-B08']);
    for (const r of runs) {
      await p.evaluate((r) => (r[0] === 'gen' ? window.SONGGONG.showGen(r[1], r[2], r[3], null, r[4]) : window.SONGGONG.showBank(r[1], r[2], null)), r);
      await p.waitForTimeout(20);
      const res = await p.evaluate(() => [...document.querySelectorAll('svg.chart')].filter((s) => getComputedStyle(s).display !== 'none').map((s) => { const vb = s.viewBox.baseVal; let top = 1e9, right = -1e9, left = 1e9; for (const t of s.querySelectorAll('text')) { const bb = t.getBBox(); const m = t.getCTM(); const sm = s.getCTM(); const pt = s.createSVGPoint(); const corners = [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x, bb.y + bb.height], [bb.x + bb.width, bb.y + bb.height]].map(([x, y]) => { pt.x = x; pt.y = y; const q = pt.matrixTransform(sm.inverse().multiply(m)); return q; }); for (const q of corners) { top = Math.min(top, q.y); right = Math.max(right, q.x); left = Math.min(left, q.x); } } return { top, right, left, W: vb.width }; }));
      for (const c of res) { n++; minTop = Math.min(minTop, c.top); if (c.top < 0 || c.right > c.W + 0.5 || c.left < -0.5) { bad++; if (bad < 4) console.log('clip', mode, r.join(':'), JSON.stringify(c)); } }
    }
    console.log(mode, 'charts', n, 'clipped', bad, 'min label top', minTop.toFixed(1), 'errors', errs.length ? errs[0] : 'none');
    await ctx.close();
  }
  await b.close();
})();
