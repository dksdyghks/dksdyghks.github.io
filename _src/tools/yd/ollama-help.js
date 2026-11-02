// Open 요AI's AI setup, show the Ollama steps (Windows and Mac UA), check copy buttons and layout.
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [name, opts] of [['win', { viewport: { width: 1280, height: 900 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' }], ['mobile', { ...devices['iPhone 14'] }]]) {
    const ctx = await b.newContext(opts); await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://127.0.0.1:8766/yoai/'); await p.keyboard.type(process.env.YOAI_PIN); await p.waitForSelector('.side-nav, [data-act]');
    await p.evaluate(() => document.querySelector('[data-act="ai-setup"]') ? document.querySelector('[data-act="ai-setup"]').click() : null);
    await p.waitForSelector('[data-ai-howto]', { timeout: 8000 });
    await p.click('[data-ai-howto]'); await p.waitForSelector('.howto-box');
    const info = await p.evaluate(() => ({ first: document.querySelector('.howto-box p.sub:nth-of-type(3)').innerText, cmds: [...document.querySelectorAll('.howto-box > ol .cmd code')].map((c) => c.innerText), over: document.documentElement.scrollWidth > innerWidth }));
    console.log(name, JSON.stringify(info));
    if (name === 'win') { await p.click('.howto-box > ol .cmd button'); await p.waitForTimeout(200); console.log('clipboard:', await p.evaluate(() => navigator.clipboard.readText()).catch((e) => 'n/a ' + e.message)); }
    const box = await p.$('.modal, [role="dialog"]');
    await (box || p).screenshot({ path: __dirname + `/shots/ollama-${name}.png` });
    console.log(name, 'errors', errs.length ? errs.join(' | ') : 'none');
    await ctx.close();
  }
  await b.close();
})();
