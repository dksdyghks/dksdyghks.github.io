// 송공 navigation: labelled header buttons, "나가기" leaves a question unrecorded, and the weak-type analysis.
const { chromium, devices } = require('playwright');
const fonts = require('./fonts.js');
const OUT = __dirname + '/shots/';
(async () => {
  const b = await chromium.launch();
  for (const mode of ['mobile', 'desktop']) {
    const ctx = await b.newContext(mode === 'mobile' ? { ...devices['iPhone 14'] } : { viewport: { width: 1280, height: 900 } });
    await fonts(ctx);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/psat/'); await p.evaluate(() => sessionStorage.setItem('door:songgong', 'b883ddfa1079c250e8a6485c3fe1295b20a943727b649f01faffca22f75a87e6')); await p.reload(); await p.waitForTimeout(700);
    const labels = await p.$$eval('.top .icon-btn.lab span', (els) => els.map((e) => e.textContent));
    const over = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    console.log(mode, 'header labels:', labels.join(' · '), '| overflow', over);
    // start a question, then leave
    await p.click('[data-act="start"][data-subj="data"], .subj >> nth=1');
    await p.waitForSelector('.sheet'); await p.screenshot({ path: OUT + `nav-q-${mode}.png` });
    const before = await p.evaluate(() => window.SONGGONG.S.log ? window.SONGGONG.S.log.length : JSON.stringify(window.SONGGONG.S.agg.subj));
    await p.click('.actions [data-act="home"]'); await p.waitForTimeout(400);
    const after = await p.evaluate(() => window.SONGGONG.S.log ? window.SONGGONG.S.log.length : JSON.stringify(window.SONGGONG.S.agg.subj));
    const toast = await p.evaluate(() => (document.querySelector('.toast') || {}).textContent || '');
    const resume = await p.$('[data-act="resume"]');
    console.log(mode, 'left question → home:', await p.evaluate(() => window.SONGGONG.S.view), '| nothing recorded:', before === after, '| resume offered:', !!resume, '| toast:', toast.slice(0, 30));
    // weak-type analysis: seed stats
    await p.evaluate(() => { const S = window.SONGGONG.S; const t = S.agg.type; S.agg.subj = { lang: { n: 40, ok: 30, ms: 40 * 110000 }, data: { n: 30, ok: 21, ms: 30 * 120000 }, sit: { n: 20, ok: 14, ms: 20 * 130000 } };
      t['data|자료해석 · 매칭'] = { n: 6, ok: 2, ms: 6 * 150000 }; t['data|자료해석 · 표 해석'] = { n: 12, ok: 10, ms: 12 * 100000 }; t['data|자료해석 · 계산'] = { n: 12, ok: 9, ms: 12 * 230000 };
      t['lang|논증 · 강화/약화'] = { n: 10, ok: 5, ms: 10 * 120000 }; t['lang|독해 · 추론'] = { n: 30, ok: 25, ms: 30 * 100000 }; t['sit|상황판단 · 법조문'] = { n: 20, ok: 14, ms: 20 * 130000 }; });
    await p.click('.top [data-act="stats"]'); await p.waitForTimeout(400);
    console.log(mode, '약점 분석:', (await p.textContent('.weak')).replace(/\s+/g, ' ').slice(0, 220));
    await p.screenshot({ path: OUT + `nav-stats-${mode}.png`, fullPage: true });
    console.log(mode, 'errors', errs.length ? errs.join(' | ') : 'none');
    await ctx.close();
  }
  await b.close();
})();
