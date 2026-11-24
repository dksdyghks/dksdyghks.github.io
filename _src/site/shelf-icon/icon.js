// 연구실 책장 icon: gold books on a navy tile (gold only on navy, like the homepage)
const NAVY = '#0A1426', NAVY2 = '#132646', GOLD = '#F2D7A6', GILT = '#C9A15A', DEEP = '#A9803B';
function art() {
  // shelf board, five spines of different heights and shades, the fourth leaning on the fifth
  const books = [
    { x: 118, w: 50, h: 236, c: GOLD },
    { x: 172, w: 40, h: 206, c: GILT },
    { x: 216, w: 58, h: 252, c: GOLD },
    { x: 278, w: 44, h: 216, c: DEEP },
  ];
  const base = 372;
  let s = '';
  for (const b of books) {
    s += `<rect x="${b.x}" y="${base - b.h}" width="${b.w}" height="${b.h}" rx="7" fill="${b.c}"/>`;
    s += `<rect x="${b.x + 9}" y="${base - b.h + 26}" width="${b.w - 18}" height="9" rx="3" fill="${NAVY}" opacity=".28"/>`;
    s += `<rect x="${b.x + 9}" y="${base - 46}" width="${b.w - 18}" height="9" rx="3" fill="${NAVY}" opacity=".28"/>`;
  }
  // the leaning book
  s += `<g transform="rotate(16 382 ${base})"><rect x="334" y="${base - 222}" width="48" height="222" rx="7" fill="${GILT}"/><rect x="343" y="${base - 196}" width="30" height="9" rx="3" fill="${NAVY}" opacity=".28"/><rect x="343" y="${base - 46}" width="30" height="9" rx="3" fill="${NAVY}" opacity=".28"/></g>`;
  // the shelf
  s += `<rect x="92" y="${base}" width="328" height="20" rx="6" fill="${GOLD}"/>`;
  return s;
}
function svg(size, { round = 112, maskable = false } = {}) {
  const pad = maskable ? 56 : 0;   // maskable icons keep the art inside the safe circle
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${NAVY2}"/><stop offset="1" stop-color="${NAVY}"/></linearGradient>
  <clipPath id="r"><rect width="512" height="512" rx="${round}"/></clipPath></defs>
  <g clip-path="url(#r)"><rect width="512" height="512" fill="url(#g)"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - 2 * pad) / 512})"><g transform="translate(256 256) scale(1.13) translate(-256 -262)">${art()}</g></g></g></svg>`;
}
module.exports = { svg, art };
