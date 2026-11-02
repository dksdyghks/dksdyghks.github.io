// Homepage doors: 1–2 presses do nothing; 3 presses ask the PIN; wrong PIN shakes; right PIN opens 송공 in a frame
// without asking again; Esc and the back button close it; the gold sentence asks the other PIN.
const { chromium, devices } = require('playwright');
const fonts = require('./fonts.js');
const OUT = '/tmp/yohan-work/sg/shots/';
(async () => {
  const b = await chromium.launch();
  for (const mode of ['desktop', 'mobile']) {
    const ctx = await b.newContext({ ...(mode === 'mobile' ? devices['iPhone 14'] : { viewport: { width: 1280, height: 860 } }), locale: 'ko-KR' });
    await fonts(ctx);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://127.0.0.1:8766/'); await p.waitForTimeout(1500);
    const flag = p.locator('#view-ko svg.flag');
    await flag.click(); await p.waitForTimeout(200); await flag.click(); await p.waitForTimeout(1500);
    console.log(mode, 'two presses → pin box?', await p.locator('.door-wrap').count());
    await flag.click({ clickCount: 1 }); await flag.click(); await flag.click(); await p.waitForTimeout(400);
    console.log(mode, 'three presses → pin box?', await p.locator('.door-wrap').count());
    if (mode === 'desktop') await p.screenshot({ path: OUT + 'door-pin.png' });
    await p.keyboard.type('111111'); await p.waitForTimeout(600);
    console.log(mode, 'wrong pin keeps box?', await p.locator('.door-wrap').count(), 'app?', await p.locator('.door-app').count());
    for (const d of process.env.SONGGONG_PIN) { await p.locator(`.door-pad button[data-d="${d}"]`).click(); }
    await p.waitForTimeout(1500);
    const frame = p.frameLocator('.door-app iframe');
    const inner = await frame.locator('.subjects').count();
    console.log(mode, 'app open?', await p.locator('.door-app').count(), 'inner home shown (no 2nd PIN)?', inner, 'hash', await p.evaluate(() => location.hash));
    await p.screenshot({ path: OUT + `door-open-${mode}.png` });
    if (mode === 'desktop') { await p.keyboard.press('Escape'); } else { await p.goBack(); }
    await p.waitForTimeout(800);
    console.log(mode, 'closed?', (await p.locator('.door-app').count()) === 0, 'hash', JSON.stringify(await p.evaluate(() => location.hash)));
    // gold sentence → 요AI PIN
    const st = p.locator('#view-ko .stmt .s2 strong');
    await st.click(); await st.click(); await st.click(); await p.waitForTimeout(400);
    console.log(mode, 'sentence → pin box?', await p.locator('.door-wrap').count(), 'dots', await p.locator('.door-dots i').count());
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    console.log(mode, 'errors', errs.length ? errs : 'none');
    await ctx.close();
  }
  await b.close();
})();
