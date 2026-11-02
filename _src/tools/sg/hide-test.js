// "이 문제 지우기": the question never comes back; 설정 can restore.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/psat/'); await p.evaluate(() => sessionStorage.setItem('door:songgong', 'b883ddfa1079c250e8a6485c3fe1295b20a943727b649f01faffca22f75a87e6')); await p.reload(); await p.waitForTimeout(600);
  await p.evaluate(() => window.SONGGONG.showBank('sit', 'S-C01', 0)); await p.waitForSelector('[data-act="hide-q"]');
  await p.click('[data-act="hide-q"]'); await p.waitForTimeout(400);
  const hidden = await p.evaluate(() => window.SONGGONG.S.settings.hidden);
  console.log('hidden:', JSON.stringify(hidden), '| moved on to:', await p.evaluate(() => window.SONGGONG.S.view + ' ' + (window.SONGGONG.S.cur && window.SONGGONG.S.cur.q.id)));
  // draw many sit questions: S-C01 must never appear
  const ids = await p.evaluate(() => { const out = []; for (let i = 0; i < 400; i++) { const r = window.SONGGONG.nextQuestion({ subj: 'sit' }); if (r) out.push(r.q.id); } return out; });
  console.log('S-C01 drawn after hiding:', ids.filter((x) => x === 'S-C01').length, 'of', ids.length);
  await p.evaluate(() => { const b = document.createElement('button'); b.dataset.act = 'settings'; document.body.appendChild(b); b.click(); });
  await p.waitForSelector('[data-act="unhide-all"]'); await p.click('[data-act="unhide-all"]'); await p.waitForTimeout(200);
  console.log('after restore:', JSON.stringify(await p.evaluate(() => window.SONGGONG.S.settings.hidden)), '| errors', errs.length ? errs.join(' | ') : 'none');
  await b.close();
})();
