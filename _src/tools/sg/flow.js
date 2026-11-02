// Use 송공 like a person: unlock, pick a subject, answer wrong on purpose, read the explanation, answer right,
// open the 오답노트, re-solve, look at stats and settings, reload and resume. Screenshots at each step.
const { chromium, devices } = require('playwright');
const fonts = require('./fonts.js');
const OUT = '/tmp/yohan-work/sg/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const URL = 'http://127.0.0.1:8765/psat/';
const mode = process.argv[2] || 'desktop';
(async () => {
  const b = await chromium.launch();
  const dev = mode === 'mobile' ? devices['iPhone 14'] : { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 };
  const ctx = await b.newContext({ ...dev, colorScheme: process.argv[3] || 'light' });
  await fonts(ctx);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const shot = async (n) => { await p.waitForTimeout(250); await p.screenshot({ path: OUT + `${mode}-${n}.png`, fullPage: !!process.env.FULL }); };
  await p.goto(URL); await p.waitForTimeout(600);
  await shot('00-lock');
  // wrong PIN then right PIN, typed on the keyboard
  await p.keyboard.type('123456'); await p.waitForTimeout(500);
  const stillLocked = await p.$('.lock-card'); console.log('wrong pin keeps lock:', !!stillLocked);
  await p.keyboard.type(process.env.SONGGONG_PIN); await p.waitForTimeout(900);
  console.log('unlocked:', !!(await p.$('.subjects')));
  await shot('01-home');
  const subj = process.env.SUBJ || 'sit';
  await p.click(`.subj[data-subj="${subj}"]`); await p.waitForTimeout(400);
  await shot('02-question');
  const q1 = await p.evaluate(() => { const c = window.SONGGONG.S.cur; return { id: c.q.id, ans: c.q.answer, type: c.q.type }; });
  console.log('Q1', q1);
  const wrong = (q1.ans + 2) % 5;
  await p.keyboard.press(String(wrong + 1)); await p.waitForTimeout(150);
  await shot('03-selected');
  await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  await shot('04-explain-wrong');
  const verdict = await p.textContent('.verdict h2'); console.log('verdict after wrong:', verdict);
  // memo + star
  await p.keyboard.press('m'); await p.keyboard.type('출발점: 고정 조건부터. 경우 2개로 나눔.'); await p.waitForTimeout(600);
  await p.keyboard.press('Escape'); await p.keyboard.press('s'); await p.waitForTimeout(300);
  await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  const q2 = await p.evaluate(() => { const c = window.SONGGONG.S.cur; return { id: c.q.id, ans: c.q.answer, type: c.q.type }; });
  console.log('Q2', q2);
  await p.click(`.opt[data-i="${q2.ans}"]`); await p.waitForTimeout(100);
  await p.click('[data-act="submit"]'); await p.waitForTimeout(500);
  await shot('05-explain-right');
  console.log('verdict after right:', await p.textContent('.verdict h2'));
  // notes
  await p.click('[data-act="notes"]'); await p.waitForTimeout(400);
  await shot('06-notes');
  const n = await p.$$eval('.item', (els) => els.length); console.log('notes items:', n);
  // make the wrong one due today and start review
  await p.evaluate((id) => { const it = window.SONGGONG.S.items.get(id); it.due = '2000-01-01'; }, q1.id);
  await p.click('[data-act="nf-kind"][data-v="all"]'); await p.waitForTimeout(200);
  const rv = await p.$('[data-act="review-start"]'); console.log('review button:', !!rv);
  if (rv) { await rv.click(); await p.waitForTimeout(400); await shot('07-review-q'); const rq = await p.evaluate(() => window.SONGGONG.S.cur.q.id); console.log('review shows Q1:', rq === q1.id);
    const a = await p.evaluate(() => window.SONGGONG.S.cur.q.answer); await p.keyboard.press(String(a + 1)); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
    const it = await p.evaluate((id) => { const x = window.SONGGONG.S.items.get(id); return { box: x.box, due: x.due, wrong: x.wrong, right: x.right, memo: x.memo, star: x.star }; }, q1.id);
    console.log('after review correct:', it); await shot('08-review-explain'); }
  await p.click('[data-act="stats"]'); await p.waitForTimeout(300); await shot('09-stats');
  await p.click('[data-act="settings"]'); await p.waitForTimeout(300); await shot('10-settings');
  // reload: data persisted?
  await p.reload(); await p.waitForTimeout(900);
  const persisted = await p.evaluate(() => ({ items: window.SONGGONG.S.items.size, seen: window.SONGGONG.S.seen.size, agg: JSON.stringify(window.SONGGONG.S.agg.subj), persistent: window.SONGGONG.S.persistent }));
  console.log('after reload:', persisted, 'view:', await p.evaluate(() => window.SONGGONG.S.view));
  await shot('11-after-reload');
  // types page
  await p.click('[data-act="home"]'); await p.waitForTimeout(200);
  await p.click(`[data-act="types"][data-subj="${subj}"]`); await p.waitForTimeout(300); await shot('12-types');
  const vw = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  console.log('scrollWidth/innerWidth', vw.join('/'));
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await b.close();
})();
