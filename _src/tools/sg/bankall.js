// Render every curated bank item (question + explanation) on mobile and desktop; report page errors and horizontal overflow.
const { chromium, devices } = require('playwright');
const fonts = require('./fonts.js');
const OUT = '/tmp/yohan-work/sg/shots/';
const SHOT = new Set((process.env.SHOT || '').split(',').filter(Boolean));
(async () => {
  const b = await chromium.launch();
  for (const mode of ['mobile', 'desktop']) {
    const ctx = await b.newContext(mode === 'mobile' ? { ...devices['iPhone 14'] } : { viewport: { width: 1280, height: 900 } });
    await fonts(ctx);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto('http://127.0.0.1:8765/psat/'); await p.evaluate(() => sessionStorage.setItem('door:songgong', 'b883ddfa1079c250e8a6485c3fe1295b20a943727b649f01faffca22f75a87e6')); await p.reload(); await p.waitForTimeout(800);
    const ids = await p.evaluate(() => Object.entries(window.PSAT.bank).flatMap(([s, a]) => a.map((q) => [s, q.id, q.answer])));
    let bad = 0;
    for (const [s, id, ans] of ids) {
      for (const phase of ['q', 'x']) {
        await p.evaluate(([s, i, c]) => window.SONGGONG.showBank(s, i, c), [s, id, phase === 'q' ? null : (ans + 1) % 5]);
        await p.waitForTimeout(30);
        const r = await p.evaluate(() => {
          const over = document.documentElement.scrollWidth > innerWidth + 1;
          const wide = [...document.querySelectorAll('main *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('.tbl-wrap')).slice(0, 3).map((e) => e.tagName + '.' + e.className);
          const raw = document.querySelector('main') ? /<\/?[a-z]+[ >]|&lt;|&gt;|&amp;/.test(document.querySelector('main').innerText) : false;
          return { over, wide, raw, h: document.documentElement.scrollHeight };
        });
        if (r.over || r.wide.length || r.raw) { bad++; console.log('BAD', mode, id, phase, JSON.stringify(r)); }
        if (SHOT.has(id)) await p.screenshot({ path: OUT + `b-${id}-${phase}-${mode}.png`, fullPage: true });
      }
    }
    console.log(mode, 'items', ids.length, 'bad', bad, 'errors', errs.length ? errs.slice(0, 3).join(' | ') : 'none');
    await ctx.close();
  }
  await b.close();
})();
