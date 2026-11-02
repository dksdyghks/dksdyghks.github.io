const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ ...devices['iPhone 14'], colorScheme: scheme, serviceWorkers: 'block' });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://127.0.0.1:8770/psat/'); await p.keyboard.type(process.env.SONGGONG_PIN); await p.waitForSelector('.subjects');
    await p.click('[data-act="settings"]'); await p.waitForTimeout(400);
    const card = p.locator('.card', { hasText: '다른 사람에게 보내기' });
    await card.scrollIntoViewIfNeeded();
    const box = await p.locator('.card', { hasText: '휴대폰 앱처럼 쓰기' }).boundingBox();
    const box2 = await card.boundingBox();
    await p.screenshot({ path: `shots/settings-share-${scheme}.png`, clip: { x: 0, y: Math.max(0, box.y - 10), width: 390, height: box2.y + box2.height - box.y + 20 } });
    // the share button falls back to copying when there is no share sheet
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    await p.evaluate(() => { delete Navigator.prototype.share; });
    await card.locator('[data-act="share"]').click(); await p.waitForTimeout(300);
    console.log(scheme, 'toast:', await p.textContent('.toast'), '| clipboard:', await p.evaluate(() => navigator.clipboard.readText()), errs.length ? errs : '');
    await ctx.close();
  }
  await b.close();
})();
