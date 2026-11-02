const { chromium, devices } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 14'] });
  await ctx.addInitScript(() => { window.__YOAI_FAKE_AI = () => '의회유보는 본질적 사항을 입법자가 스스로 정하라는 원칙이다 [1]. 위임입법에서는 포괄위임이 금지된다 [2].'; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://127.0.0.1:8766/yoai/'); await p.keyboard.type(process.env.YOAI_PIN); await p.waitForSelector('.side-nav');
  const files = [['서재/의회유보와 본질성이론.pdf'], ['서재/하위/선거관리위원회의 독립성.pdf']].map(([rel]) => ({ rel, b64: fs.readFileSync(__dirname + '/' + rel).toString('base64') }));
  await p.evaluate(async (list) => { const fs2 = list.map(({ rel, b64 }) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const f = new File([bin], rel.split('/').pop(), { type: 'application/pdf' }); Object.defineProperty(f, 'webkitRelativePath', { value: rel }); return f; }); await window.YOAI.syncFolder(fs2); }, files);
  await p.waitForFunction(() => window.YOAI.S.docs.every((d) => d.indexed) && window.YOAI.S.docs.length === 2);
  const shot = async (n) => { await p.waitForTimeout(250); await p.screenshot({ path: __dirname + `/shots/m-${n}.png` }); console.log(n, 'overflow', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)); };
  await shot('library');
  await p.click('[data-act="menu"]'); await shot('menu');
  await p.click('[data-act="go"][data-v="find"]'); await p.fill('#q', '본질적 사항'); await p.waitForTimeout(500); await shot('find');
  await p.click('.hit >> nth=0'); await p.waitForTimeout(800); await shot('read');
  await p.evaluate(() => { window.YOAI.S.settings.ai = { backend: 'fake' }; window.YOAI.S.view = 'x'; });
  await p.click('[data-act="menu"]'); await p.click('[data-act="go"][data-v="ask"]');
  await p.fill('#ask-in', '의회유보의 범위는?'); await p.click('[data-act="ask-send"]'); await p.waitForFunction(() => !window.YOAI.S.asking); await shot('ask');
  console.log(errs.length ? errs : 'no errors'); await b.close();
})();
