const { chromium, devices } = require('playwright'); const fonts = require('./fonts.js');
(async () => { const b = await chromium.launch(); for (const [m, dev] of [['desktop', { viewport: { width: 1280, height: 860 } }], ['mobile', devices['iPhone 14']]]) { const ctx = await b.newContext(dev); await fonts(ctx); const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/psat/'); await p.evaluate(() => sessionStorage.setItem('door:songgong', 'b883ddfa1079c250e8a6485c3fe1295b20a943727b649f01faffca22f75a87e6')); await p.reload(); await p.waitForTimeout(900);
  await p.screenshot({ path: `/tmp/yohan-work/sg/shots/home-${m}.png` }); console.log(m, errs.length ? errs : 'ok'); await ctx.close(); } await b.close(); })();
