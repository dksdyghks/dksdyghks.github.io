const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 14'], serviceWorkers: 'block' }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/psat/'); await p.keyboard.type(process.env.SONGGONG_PIN); await p.waitForSelector('.subjects');
  console.log('home card:', await p.textContent('[data-act="setup"] .s'));
  await p.click('[data-act="setup"]'); await p.click('[data-act="set-subj"][data-v="lang"]'); await p.click('[data-act="set-n"][data-v="40"]');
  console.log('limit shown:', await p.evaluate(() => [...document.querySelectorAll('.set-row')].pop().innerText.replace(/\s+/g, ' ')));
  const segW = await p.evaluate(() => { const s = document.querySelectorAll('.seg')[1]; return [s.scrollWidth, s.clientWidth, document.documentElement.scrollWidth]; });
  console.log('count buttons fit (scroll/client, page):', segW);
  await p.screenshot({ path: 'shots/set40-setup.png' });
  await p.click('[data-act="set-start"]'); await p.waitForSelector('.opt');
  console.log('crumb:', (await p.textContent('.crumb, .topbar .crumb, header')).replace(/\s+/g, ' ').slice(0, 80), '| timer:', await p.textContent('.timer').catch(() => '-'));
  for (let i = 0; i < 3; i++) { await p.keyboard.press('1'); await p.keyboard.press('Enter'); await p.waitForTimeout(250); }
  console.log('answered:', await p.evaluate(() => window.SONGGONG.S.set.results.length), 'of', await p.evaluate(() => window.SONGGONG.S.set.n), '| limit ms', await p.evaluate(() => window.SONGGONG.S.set.limitMs));
  console.log(errs.length ? errs : 'no errors'); await b.close();
})();
