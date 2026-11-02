// 송공 offline: open once online, then with no network: unlock, solve in every subject, reload, open by another address.
const { chromium, devices } = require('playwright');
const BASE = 'http://127.0.0.1:8770/psat/';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 14'] });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const t0 = Date.now();
  await p.goto(BASE);
  const state = await p.evaluate(async () => (await navigator.serviceWorker.ready).active.state);
  await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
  console.log('sw', state, 'controlling after', Date.now() - t0, 'ms');
  const thirdParty = []; p.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1:8770/')) thirdParty.push(r.url()); });
  const caches1 = await p.evaluate(async () => { const o = {}; for (const k of await caches.keys()) { const ks = await (await caches.open(k)).keys(); o[k] = ks.length; } return o; });
  console.log('caches', JSON.stringify(caches1));
  const appKeys = await p.evaluate(async () => { const k = (await caches.keys()).find((x) => x.startsWith('songgong-app-')); return (await (await caches.open(k)).keys()).map((r) => r.url.replace(location.origin, '')); });
  console.log('app files', appKeys.length, appKeys.filter((u) => !/\?v=/.test(u)).join(' '));

  await ctx.setOffline(true);
  for (const addr of [BASE, BASE + 'index.html', BASE + '?from=kakao']) {
    await p.goto(addr).catch((e) => errs.push('goto ' + addr + ': ' + e.message));
    const lock = await p.waitForSelector('.lock-card, .subjects', { timeout: 8000 }).then(() => true, () => false);
    console.log('offline open', addr.replace(BASE, '/psat/') || '/psat/', lock ? 'ok' : 'FAILED');
  }
  if (await p.$('.lock-card')) { await p.keyboard.type(process.env.SONGGONG_PIN); }
  await p.waitForSelector('.subjects', { timeout: 8000 });
  for (const subj of ['lang', 'data', 'sit']) {
    await p.click('[data-act="home"]').catch(() => {}); await p.waitForSelector('.subjects');
    await p.click(`.subj[data-subj="${subj}"]`); await p.waitForSelector('.opt', { timeout: 8000 });
    const q = await p.evaluate(() => { const c = window.SONGGONG.S.cur; return { id: c.q.id, type: c.q.type, opts: document.querySelectorAll('.opt').length }; });
    await p.keyboard.press(String(q.opts ? 1 : 1)); await p.keyboard.press('Enter'); await p.waitForSelector('.verdict', { timeout: 8000 });
    console.log('offline solve', subj, q.type, 'options', q.opts, 'explained', !!(await p.$('.verdict')));
  }
  const fontsUsed = await p.evaluate(async () => { await document.fonts.ready; const f = [...document.fonts].filter((x) => x.status === 'loaded').map((x) => x.family + ' ' + x.weight); return [...new Set(f)]; });
  console.log('fonts loaded offline', fontsUsed.join(', '));
  const brokenFonts = await p.evaluate(() => [...document.fonts].filter((x) => x.status === 'error').length);
  console.log('font faces in error', brokenFonts);
  await p.reload(); await p.waitForSelector('.subjects, .verdict, .opt, .lock-card', { state: 'attached', timeout: 8000 });
  console.log('offline reload resumes', await p.evaluate(() => !!(window.SONGGONG && window.SONGGONG.S)));
  await ctx.setOffline(false);
  // a new version: the page names new files and a new worker; the old saved set must be replaced, not mixed
  const fs = require('fs'); const IDX = '/home/user/dksdyghks.github.io/psat/index.html';
  const html = fs.readFileSync(IDX, 'utf8'); const ver = html.match(/\?v=([0-9a-f]{10})/)[1];
  fs.writeFileSync(IDX, html.split('?v=' + ver).join('?v=feedbeef00'));
  try {
    await p.goto(BASE); await p.waitForTimeout(400);
    let swapped = false;
    for (let t = Date.now(); Date.now() - t < 20000 && !swapped; await p.waitForTimeout(300)) {
      swapped = await p.evaluate(async () => { const k = await caches.keys(); return k.includes('songgong-app-feedbeef00') && !k.some((x) => x.startsWith('songgong-app-') && x !== 'songgong-app-feedbeef00'); });
    }
    console.log('update: new set saved and old set removed:', swapped);
    const sw = await p.evaluate(() => navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL.replace(location.origin, ''));
    console.log('update: caches now', JSON.stringify(await p.evaluate(async () => caches.keys())), 'worker', sw);
    await ctx.setOffline(true); await p.reload(); await p.waitForSelector('.subjects, .verdict, .opt, .lock-card', { state: 'attached', timeout: 8000 });
    const served = await p.evaluate(() => [...document.scripts].map((s) => s.src).filter(Boolean).every((u) => u.includes('?v=feedbeef00')));
    console.log('offline after update uses only the new set:', served);
    await ctx.setOffline(false);
  } finally { fs.writeFileSync(IDX, html); }
  console.log('requests to other sites:', thirdParty.length ? thirdParty.join(' ') : 'none');
  console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
  await b.close();
})();
