// 송공 link preview card: the heart cat on the homepage navy, nothing else (the messenger prints the title under it).
const { chromium } = require('playwright'); const { cat, C } = require('./cat.js');
const heart = 'M0 0.78 C-0.22 0.58 -1 0.18 -1 -0.28 C-1 -0.64 -0.76 -0.86 -0.5 -0.86 C-0.25 -0.86 -0.06 -0.7 0 -0.52 C0.06 -0.7 0.25 -0.86 0.5 -0.86 C0.76 -0.86 1 -0.64 1 -0.28 C1 0.18 0.22 0.58 0 0.78 Z';
const floats = [[205, 200, 30, -14, .9], [300, 390, 18, 10, .55], [140, 470, 14, -6, .4], [995, 210, 26, 12, .85], [905, 400, 20, -10, .55], [1065, 470, 13, 8, .4]];
const card = (withHearts) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs><radialGradient id="g" cx="600" cy="360" r="560" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#17305C"/><stop offset="1" stop-color="${C.bg}"/></radialGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  ${withHearts ? floats.map(([x, y, s, r, op]) => `<path transform="translate(${x} ${y}) rotate(${r}) scale(${s})" d="${heart}" fill="${C.heart}" opacity="${op}"/>`).join('') : ''}
  <g transform="translate(${600 - 256 * 1.2} ${630 - 512 * 1.2}) scale(1.2)">${cat({ artOnly: true })}</g>
</svg>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  for (const [name, h] of [['og-plain.png', false], ['og-hearts.png', true]]) {
    await p.setContent(`<html><body style="margin:0">${card(h)}</body></html>`);
    await p.screenshot({ path: __dirname + '/' + name, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  }
  await b.close(); console.log('ok');
})();
