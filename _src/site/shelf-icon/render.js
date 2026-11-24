const { chromium } = require('playwright'); const fs = require('fs'); const { svg } = require('./icon.js');
const OUT = __dirname + '/../shelf/';
(async () => { const b = await chromium.launch(); const p = await b.newPage();
  const shots = [['icon-512.png', 512, {}], ['icon-192.png', 192, {}], ['apple-touch-icon.png', 180, { round: 0 }], ['icon-maskable-512.png', 512, { round: 0, maskable: true }], ['favicon-32.png', 32, { round: 104 }]];
  for (const [name, n, o] of shots) { await p.setViewportSize({ width: n, height: n }); await p.setContent(`<html><body style="margin:0;background:transparent">${svg(n, o)}</body></html>`); await p.screenshot({ path: OUT + name, omitBackground: true, clip: { x: 0, y: 0, width: n, height: n } }); }
  fs.writeFileSync(OUT + 'icon.svg', svg(512).replace(/ width="\d+" height="\d+"/, ''));
  // preview sheet: home screen and rail
  const img = (f) => 'data:image/png;base64,' + fs.readFileSync(OUT + f).toString('base64');
  await p.setViewportSize({ width: 760, height: 300 });
  await p.setContent(`<html><body style="margin:0;padding:24px;background:linear-gradient(160deg,#6B8BB8,#C9A3B9);font:600 13px -apple-system,sans-serif;display:flex;gap:30px;align-items:flex-start">
    <img src="${img('icon-512.png')}" width="200" height="200" style="border-radius:44px">
    <div style="display:flex;gap:22px;color:#fff;text-shadow:0 1px 2px #0006;text-align:center"><div><img src="${img('apple-touch-icon.png')}" width="70" height="70" style="border-radius:16px;display:block"><span>연구실 책장</span></div>
    <div><span style="display:block;width:70px;height:70px;border-radius:16px;background:#ffffff55"></span><span>메모</span></div></div>
    <div style="background:#0A1426;color:#fff;padding:14px 16px;border-radius:14px;display:flex;align-items:center;gap:10px"><img src="${img('icon-192.png')}" width="32" height="32" style="border-radius:8px"><b style="font-size:17px">연구실 책장</b></div>
    <img src="${img('favicon-32.png')}" width="32" height="32"></body></html>`);
  await p.screenshot({ path: '/tmp/claude-0/-home-user/32c96ca5-ace8-5bfb-8ce5-1b09a2bc0eb1/scratchpad/shelf-icon/preview.png' });
  await b.close(); })();
