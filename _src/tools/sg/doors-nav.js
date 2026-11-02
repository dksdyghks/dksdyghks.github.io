const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [mode, dev] of [['mobile', devices['iPhone 14']], ['desktop', { viewport: { width: 1280, height: 860 } }]]) {
    const ctx = await b.newContext({ ...dev, serviceWorkers: 'block' }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://127.0.0.1:8766/?lang=ko'); await p.waitForTimeout(500);
    const flag = p.locator('svg.flag').filter({ visible: true }).first();
    for (let i = 0; i < 3; i++) await flag.click();
    await p.waitForSelector('.door-pad'); await p.keyboard.type(process.env.SONGGONG_PIN);
    await p.waitForURL('**/psat/**', { timeout: 8000 }); await p.waitForSelector('.subjects', { timeout: 8000 });
    const taeguk = await p.evaluate(() => document.documentElement.outerHTML.includes('0047A0') || document.documentElement.outerHTML.includes('CD2E3A'));
    console.log(mode, '송공 opened at', new URL(p.url()).pathname, '| asked PIN again:', !!(await p.$('.lock-card')), '| Taegukgi inside 송공:', taeguk, '| manifest:', await p.getAttribute('link[rel="manifest"]', 'href'));
    await p.goBack(); await p.waitForTimeout(500);
    const gold = p.locator('.stmt .s2 strong').filter({ visible: true }).first();
    for (let i = 0; i < 3; i++) await gold.click();
    await p.waitForSelector('.door-pad'); await p.keyboard.type(process.env.YOAI_PIN);
    await p.waitForURL('**/yoai/**', { timeout: 8000 }); await p.waitForSelector('.side-nav', { timeout: 8000 });
    console.log(mode, '요AI opened at', new URL(p.url()).pathname, '| brand:', (await p.textContent('.brand')).trim().slice(0, 12), errs.length ? errs : '| no errors');
    await ctx.close();
  }
  await b.close();
})();
