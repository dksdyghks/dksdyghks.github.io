// YO아이 mark: "YO" in a refined serif, gold on navy, with 아이 set small beneath and a hairline between
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = '/home/user/yohan-ahn/yoai/';
const html = (n, k) => `<html><head><link rel="stylesheet" href="file:///home/user/yohan-ahn/fonts/noto-serif-kr/noto-serif-kr.css"></head><body style="margin:0">
<div style="width:${n}px;height:${n}px;background:radial-gradient(circle at 50% 38%,#17305C,#0A1426 72%);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#F2D7A6;font-family:'Noto Serif KR'">
<div style="font-weight:600;font-size:${Math.round(n * 0.40 * k)}px;line-height:1;letter-spacing:${(n * 0.02 * k).toFixed(1)}px;margin-right:-${(n * 0.02 * k).toFixed(1)}px">YO</div>
<div style="width:${Math.round(n * 0.30 * k)}px;height:${Math.max(1, Math.round(n * 0.008))}px;background:#C9A867;margin:${Math.round(n * 0.05 * k)}px 0 ${Math.round(n * 0.045 * k)}px"></div>
<div style="font-weight:600;font-size:${Math.round(n * 0.13 * k)}px;line-height:1;letter-spacing:${(n * 0.03 * k).toFixed(1)}px;margin-right:-${(n * 0.03 * k).toFixed(1)}px">아이</div></div></body></html>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  for (const [name, n, k] of [['icon-192.png', 192, 1], ['icon-512.png', 512, 1], ['icon-maskable-512.png', 512, 0.78], ['apple-touch-icon.png', 180, 1]]) {
    await p.setViewportSize({ width: n, height: n });
    fs.writeFileSync(__dirname + '/yo-icon.html', html(n, k)); await p.goto('file://' + __dirname + '/yo-icon.html'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150);
    await p.screenshot({ path: OUT + name, clip: { x: 0, y: 0, width: n, height: n } });
  }
  await b.close(); console.log('ok');
})();
