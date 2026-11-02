// Renders every icon size straight from the vector (no bitmap downscaling) and a preview sheet.
const { chromium } = require('playwright'); const fs = require('fs'); const { cat, tiny } = require('./cat.js');
const OUT = __dirname + '/out/'; fs.mkdirSync(OUT, { recursive: true });
const shots = [
  ['big-512.png', 512, { round: 0 }],
  ['apple-touch-icon.png', 180, { round: 0 }],            // iOS masks the corners itself, so this one is full-bleed
  ['icon-192.png', 192, { round: 112 }],
  ['icon-512.png', 512, { round: 112 }],
  ['favicon-32.png', 32, { round: 104, small: true }],
  ['favicon-16.png', 16, { tiny: true }],
  ['favicon-48.png', 48, { round: 104, small: true }],
];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [name, n, o] of shots) {
    await p.setViewportSize({ width: n, height: n });
    await p.setContent(`<html><body style="margin:0;background:transparent">${o.tiny ? tiny({ size: n }) : cat({ ...o, size: n })}</body></html>`);
    await p.screenshot({ path: OUT + name, clip: { x: 0, y: 0, width: n, height: n }, omitBackground: true });
  }
  fs.writeFileSync(OUT + 'favicon.svg', cat({ round: 104, small: true }).replace(/ width="\d+" height="\d+"/, '').replace(/\n\s*/g, ''));
  const img = (f) => 'data:image/png;base64,' + fs.readFileSync(OUT + f).toString('base64');
  const title = '안요환 | 공군사관학교 항공우주정책학과';
  const tab = (dark) => `<div class="strip ${dark ? 'dk' : ''}"><div class="tab on"><img src="${img('favicon-32.png')}" width="16" height="16"><span>${title}</span><i>×</i></div><div class="tab"><span class="g"></span><span>새 탭</span><i>×</i></div></div>`;
  const html = `<html><head><style>
    body{margin:0;padding:28px;font-family:'Noto Sans KR',sans-serif;background:#ECEEF2;width:1000px}
    h3{font:600 15px/1.4 sans-serif;margin:22px 0 10px;color:#333}
    .row{display:flex;gap:28px;align-items:flex-end}
    .home{background:linear-gradient(160deg,#6B8BB8,#C9A3B9);padding:22px 26px;border-radius:18px;display:flex;gap:22px}
    .app{display:flex;flex-direction:column;align-items:center;gap:6px;color:#fff;font:500 12px sans-serif;text-shadow:0 1px 2px #0006}
    .app img,.app .ph{width:64px;height:64px;border-radius:15px}
    .ph{background:#ffffff55}
    .strip{background:#DEE1E6;padding:8px 8px 0;display:flex;gap:2px;border-radius:10px 10px 0 0;width:640px}
    .strip.dk{background:#1F2023}
    .tab{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px 8px 0 0;font:13px sans-serif;color:#3C4043;width:250px}
    .tab span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}.tab i{font-style:normal;color:#666}
    .tab.on{background:#fff}.dk .tab{color:#BDC1C6}.dk .tab.on{background:#35363A;color:#E8EAED}
    .g{flex:0 0 16px!important;height:16px;border-radius:50%;background:#9AA0A6}
    .px{image-rendering:pixelated;border:1px solid #ccc}
  </style></head><body>
    <div class="row" style="align-items:flex-start"><img src="${img('big-512.png')}" width="300" height="300" style="border-radius:24px;margin-top:8px">
      <div><h3 style="margin-top:0">휴대폰 홈 화면</h3><div class="home"><div class="app"><span class="ph"></span>메모</div><div class="app"><img src="${img('apple-touch-icon.png')}">안요환</div><div class="app"><span class="ph"></span>사진</div><div class="app"><span class="ph"></span>지도</div></div>
      <h3>실제 픽셀 확대 (32px · 16px)</h3><div class="row" style="align-items:center"><img class="px" src="${img('favicon-32.png')}" width="128" height="128"><img class="px" src="${img('favicon-16.png')}" width="128" height="128"><img src="${img('favicon-16.png')}" width="16" height="16"><img src="${img('favicon-32.png')}" width="32" height="32"></div></div></div>
    <h3>브라우저 탭 (밝은 테마 · 어두운 테마)</h3>${tab(false)}<div style="height:10px"></div>${tab(true)}
  </body></html>`;
  const q = await b.newPage({ deviceScaleFactor: 2 });
  await q.setViewportSize({ width: 1060, height: 640 });
  await q.setContent(html); await q.waitForTimeout(300);
  const h = await q.evaluate(() => document.body.scrollHeight);
  await q.screenshot({ path: __dirname + '/sheet.png', clip: { x: 0, y: 0, width: 1060, height: h } });
  await b.close(); console.log('ok');
})();
