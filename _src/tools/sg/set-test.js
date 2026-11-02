const { chromium } = require('playwright');
const fonts = require('./fonts.js');
const OUT = '/tmp/yohan-work/sg/shots/';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } }); await fonts(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/psat/'); await p.evaluate(() => sessionStorage.setItem('door:songgong', 'b883ddfa1079c250e8a6485c3fe1295b20a943727b649f01faffca22f75a87e6')); await p.reload(); await p.waitForTimeout(700);
  console.log('home cards:', await p.locator('.subj').count(), 'links:', await p.locator('.link-card').count());
  await p.screenshot({ path: OUT + 'home3.png' });
  await p.click('[data-act="setup"]'); await p.click('[data-act="set-n"][data-v="5"]'); await p.click('[data-act="set-subj"][data-v="data"]');
  await p.click('[data-act="set-start"]'); await p.waitForTimeout(300);
  console.log('crumb:', await p.textContent('.crumb'), 'timer:', await p.textContent('#timer'));
  for (let i = 0; i < 5; i++) { const a = await p.evaluate(() => window.SONGGONG.S.cur.q.answer); await p.keyboard.press(String(i % 2 ? a + 1 : ((a + 1) % 5) + 1)); await p.keyboard.press('Enter'); await p.waitForTimeout(250); }
  console.log('result view:', await p.evaluate(() => window.SONGGONG.S.view), 'score:', await p.textContent('.stat .v'));
  await p.screenshot({ path: OUT + 'set-result.png' });
  await p.click('[data-act="set-review"][data-i="0"]'); await p.waitForTimeout(300);
  console.log('review view:', await p.evaluate(() => window.SONGGONG.S.view), 'next label:', (await p.textContent('[data-act="next"]')).trim());
  await p.click('[data-act="cause"][data-v="계산 실수"]'); await p.waitForTimeout(500);
  await p.click('[data-act="next"]'); await p.waitForTimeout(300);
  console.log('back to:', await p.evaluate(() => window.SONGGONG.S.view));
  await p.click('[data-act="stats"]'); await p.waitForTimeout(300);
  console.log('cause card:', await p.locator('.card h2', { hasText: '틀린 이유' }).count());
  console.log('errors', errs.length ? errs : 'none'); await b.close();
})();
