const { chromium, devices } = require('playwright'); const fonts = require('./fonts.js');
const tag = process.argv[2] || 'before';
(async () => { const b = await chromium.launch(); for (const [m, dev] of [['desktop', { viewport: { width: 1280, height: 900 } }], ['mobile', devices['iPhone 14']]]) for (const lang of ['ko', 'en']) {
  const ctx = await b.newContext(dev); await fonts(ctx); const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://127.0.0.1:8766/?lang=' + lang); await p.waitForTimeout(800);
  const card = p.locator(`[lang] section.card:visible`).filter({ has: p.locator('ul.edu') }).first();
  await card.scrollIntoViewIfNeeded(); await card.screenshot({ path: `/tmp/yohan-work/sg/shots/edu-${tag}-${m}-${lang}.png` });
  console.log(m, lang, (await card.innerText()).replace(/\n+/g, ' | ').slice(0, 260), errs.length ? errs : '');
  await ctx.close(); } await b.close(); })();
