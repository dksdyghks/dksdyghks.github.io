// App icons for 송공: the taeguk emblem on the paper colour, inside the maskable safe zone (centre 80%).
const { chromium } = require('playwright');
const OUT = '/home/user/yohan-ahn/psat/';
const svg = (n) => `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="0 0 512 512"><rect width="512" height="512" fill="#F4F2EE"/><g transform="translate(256 256) scale(5.2) translate(-75 -50)"><circle cx="75" cy="50" r="25" fill="#0047A0"/><path d="M54.199,36.132 A25,25 0 0 1 95.801,63.868 A12.5,12.5 0 0 0 75,50 A12.5,12.5 0 0 1 54.199,36.132 Z" fill="#CD2E3A"/></g></svg>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  for (const [name, n] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]]) {
    await p.setViewportSize({ width: n, height: n });
    await p.setContent(`<html><body style="margin:0">${svg(n)}</body></html>`);
    await p.screenshot({ path: OUT + name, clip: { x: 0, y: 0, width: n, height: n } });
    console.log('wrote', name);
  }
  await b.close();
})();
