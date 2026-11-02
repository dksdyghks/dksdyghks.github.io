// On a phone, does any table need side-scrolling (hidden columns)? Questions and explanations, generators and bank.
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext(devices['iPhone 14']); const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8765/psat/'); await p.evaluate(() => sessionStorage.setItem('door:songgong', 'b883ddfa1079c250e8a6485c3fe1295b20a943727b649f01faffca22f75a87e6')); await p.reload(); await p.waitForTimeout(700);
  const gens = await p.evaluate(() => Object.entries(window.PSAT.gens).flatMap(([s, a]) => a.map((g) => [s, g.id])));
  const bank = await p.evaluate(() => Object.entries(window.PSAT.bank).flatMap(([s, a]) => a.map((q) => [s, q.id])));
  const stat = {};
  const probe = () => [...document.querySelectorAll('.tbl-wrap')].map((w) => w.scrollWidth - w.clientWidth);
  for (const [s, id] of gens) for (let i = 0; i < 12; i++) for (const ph of [null, 0]) {
    await p.evaluate(([s, id, seed, ph, lv]) => window.SONGGONG.showGen(s, id, seed, ph, lv), [s, id, 4000 + i * 101, ph, (i % 3) + 1]); await p.waitForTimeout(10);
    const over = (await p.evaluate(probe)).filter((x) => x > 1);
    stat[id] = stat[id] || { n: 0, wide: 0, max: 0 }; stat[id].n++; if (over.length) { stat[id].wide++; stat[id].max = Math.max(stat[id].max, ...over); }
  }
  for (const [s, id] of bank) for (const ph of [null, 0]) {
    await p.evaluate(([s, id, ph]) => window.SONGGONG.showBank(s, id, ph), [s, id, ph]); await p.waitForTimeout(10);
    const over = (await p.evaluate(probe)).filter((x) => x > 1);
    if (over.length) { stat[id] = stat[id] || { n: 0, wide: 0, max: 0 }; stat[id].wide++; stat[id].max = Math.max(stat[id].max, ...over); }
  }
  for (const [k, v] of Object.entries(stat)) if (v.wide) console.log('WIDE', k, JSON.stringify(v));
  console.log('checked', gens.length, 'generators and', bank.length, 'bank items');
  await b.close();
})();
