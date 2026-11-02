// 홈 화면에 추가 helper on different phones and browsers: which page, which steps, does the one-tap path work.
const { chromium, devices } = require('playwright');
const KAKAO_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.9.0';
const SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36';
const NAVER = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.5.0)';
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1';
(async () => {
  const b = await chromium.launch();
  const cases = [
    ['iPhone Safari', { ...devices['iPhone 14'] }],
    ['iPhone Chrome', { ...devices['iPhone 14'], userAgent: CHROME_IOS }],
    ['KakaoTalk', { ...devices['iPhone 14'], userAgent: KAKAO_IOS }],
    ['Naver app', { ...devices['iPhone 14'], userAgent: NAVER }],
    ['Samsung Internet', { ...devices['Galaxy S9+'], userAgent: SAMSUNG }],
    ['Android Chrome + offer', { ...devices['Pixel 7'] }, true],
    ['home-screen app', { ...devices['iPhone 14'] }, false, true],
    ['desktop Chrome', { viewport: { width: 1280, height: 860 } }],
  ];
  for (const [name, opt, offer, standalone] of cases) {
    const ctx = await b.newContext({ ...opt, serviceWorkers: 'block' });
    if (standalone) await ctx.addInitScript(() => { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => (q.includes('display-mode: standalone') ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q)); });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/psat/'); await p.keyboard.type(process.env.SONGGONG_PIN); await p.waitForSelector('.subjects');
    let prompted = 0;
    if (offer) { await p.exposeFunction('__prompted', () => { prompted++; }); await p.evaluate(() => { window.__installEvt = { prompt: async () => { await window.__prompted(); }, userChoice: Promise.resolve({ outcome: 'accepted' }) }; document.dispatchEvent(new Event('songgong:installable')); }); await p.waitForTimeout(100); }
    const bar = await p.$('.install-bar');
    const barText = bar ? (await bar.innerText()).replace(/\s+/g, ' ') : '(no bar)';
    let page = '';
    if (bar) { await p.click('.install-bar .ib-main'); await p.waitForTimeout(300); page = await p.evaluate(() => (window.SONGGONG.S.view === 'install' ? document.querySelector('#main .card').innerText.replace(/\s+/g, ' ').slice(0, 150) : 'view: ' + window.SONGGONG.S.view)); }
    else { await p.click('[data-act="settings"]'); await p.waitForTimeout(200); page = 'settings: ' + (await p.locator('.card', { hasText: '휴대폰 앱처럼 쓰기' }).innerText()).replace(/\s+/g, ' ').slice(0, 90); }
    const ext = await p.$('a[href^="kakaotalk://web/openExternal"]');
    console.log(`${name}\n  bar: ${barText}\n  → ${page}${ext ? '\n  external link: ' + (await ext.getAttribute('href')).slice(0, 70) : ''}${offer ? '\n  prompt() called: ' + prompted : ''}${errs.length ? '\n  ERRORS ' + errs : ''}`);
    if (name === 'iPhone Safari') await p.screenshot({ path: 'shots/install-ios.png' });
    if (name === 'KakaoTalk') await p.screenshot({ path: 'shots/install-kakao.png' });
    await ctx.close();
  }
  // the hide button keeps the bar away for 30 days
  const ctx = await b.newContext({ ...devices['iPhone 14'], serviceWorkers: 'block' }); const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8765/psat/'); await p.keyboard.type(process.env.SONGGONG_PIN); await p.waitForSelector('.subjects');
  await p.click('.install-bar .ib-x'); await p.click('[data-act="settings"]'); await p.click('[data-act="home"]'); await p.waitForTimeout(200);
  console.log('after hiding, bar on home:', !!(await p.$('.install-bar')));
  await b.close();
})();
