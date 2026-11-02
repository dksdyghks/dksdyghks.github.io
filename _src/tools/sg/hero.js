const { chromium, devices } = require('playwright'); const fonts = require('./fonts.js');
(async () => { const b = await chromium.launch(); for (const [m, dev] of [['desktop', { viewport: { width: 1280, height: 860 } }], ['mobile', devices['iPhone 14']]]) for (const lang of ['ko', 'en']) {
  const ctx = await b.newContext({ ...dev, reducedMotion: 'reduce' }); await fonts(ctx); const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://127.0.0.1:8766/?lang=' + lang); await p.waitForTimeout(1200);
  const hero = p.locator(`[lang="${lang}"] .hero, .hero`).filter({ visible: true }).first();
  await hero.screenshot({ path: `/tmp/yohan-work/sg/shots/hero-${m}-${lang}.png` });
  const t = await p.locator('.stmt .s2 strong').filter({ visible: true }).first().innerText();
  console.log(m, lang, JSON.stringify(t), errs.length ? errs : 'ok');
  await ctx.close(); } await b.close(); })();
