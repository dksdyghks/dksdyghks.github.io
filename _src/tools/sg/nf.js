const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [name, opt] of [['light', { ...devices['iPhone 14'], colorScheme: 'light' }], ['dark', { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' }]]) {
    const p = await b.newPage(opt); const errs = []; p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    await p.goto('http://127.0.0.1:8766/404.html'); await p.waitForTimeout(400);
    await p.screenshot({ path: `shots/404-${name}.png` });
    console.log(name, await p.title(), '| img ok', await p.evaluate(() => document.querySelector('img').naturalWidth), errs.length ? errs : 'no errors');
    await p.close();
  }
  await b.close();
})();
