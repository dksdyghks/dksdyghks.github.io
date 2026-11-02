// 송공's icons: the heart cat (no Taegukgi anywhere in 송공). Maskable gets room so a round mask keeps the whole cat.
const { chromium } = require('playwright'); const fs = require('fs'); const { cat, tiny, C } = require('./cat.js');
const OUT = '/home/user/yohan-ahn/psat/';
const padded = (n) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${n}" height="${n}"><rect width="512" height="512" fill="${C.bg}"/><g transform="translate(${256 - 256 * 0.78} ${512 - 512 * 0.78 - 30}) scale(0.78)">${cat({ artOnly: true })}</g></svg>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  for (const [name, n, svg] of [['icon-192.png', 192, cat({ size: 192 })], ['icon-512.png', 512, cat({ size: 512 })], ['icon-maskable-512.png', 512, padded(512)], ['apple-touch-icon.png', 180, cat({ size: 180 })]]) {
    await p.setViewportSize({ width: n, height: n });
    await p.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    await p.screenshot({ path: OUT + name, clip: { x: 0, y: 0, width: n, height: n } });
  }
  // the small face for the page itself (tab icon, header and lock screen)
  fs.writeFileSync(__dirname + '/face.svg', tiny({ size: 16 }).replace(/ width="16" height="16"/, '').replace(/\n\s*/g, ''));
  await b.close(); console.log('ok');
})();
