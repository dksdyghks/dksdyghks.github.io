// The homepage icon: a butter-yellow cat making a heart with its arms, heart eyes, on the homepage navy.
// cat(opts) returns an SVG string (viewBox 0 0 512 512). opts.small drops the fine lines that blur below 48px.
const C = { bg: '#0A1426', fur: '#F5C46C', line: '#3B2A17', heart: '#E5323B', chin: '#D9A24F' };
const mirror = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (m, x, y) => `${512 - +x} ${y}`);
const heartPath = 'M0 0.78 C-0.22 0.58 -1 0.18 -1 -0.28 C-1 -0.64 -0.76 -0.86 -0.5 -0.86 C-0.25 -0.86 -0.06 -0.7 0 -0.52 C0.06 -0.7 0.25 -0.86 0.5 -0.86 C0.76 -0.86 1 -0.64 1 -0.28 C1 0.18 0.22 0.58 0 0.78 Z';
function cat(o = {}) {
  const small = !!o.small, round = o.round == null ? 0 : o.round;
  const armL = 'M256 162 C238 112 204 82 162 84 C108 86 72 128 73 192 C74 250 92 300 120 342';
  const armR = mirror(armL);
  const earL = small ? 'M142 258 L156 186 Q160 172 172 180 L220 218 Z' : 'M134 262 L146 168 Q150 152 163 160 L222 214 Z';
  const earR = mirror(earL);
  const body = 'M118 330 C104 400 100 460 98 540 L414 540 C412 460 408 400 394 330 Z';
  const eyeS = small ? 36 : 24, eyeY = small ? 292 : 292;
  const sw = small ? 52 : 50;
  const art = `
  <g fill="${C.fur}">
    <path d="${body}"/>
    <path d="${earL}"/><path d="${earR}"/>
    <ellipse cx="256" cy="300" rx="142" ry="96"/>
  </g>
  <g fill="none" stroke="${C.fur}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
    <path d="${armL}"/><path d="${armR}"/>
  </g>
  ${small ? '' : `<path d="M150 362 Q256 418 362 362" fill="none" stroke="${C.chin}" stroke-width="5" stroke-linecap="round"/>`}
  <g fill="${C.heart}">
    <path transform="translate(198 ${eyeY}) scale(${eyeS})" d="${heartPath}"/>
    <path transform="translate(314 ${eyeY}) scale(${eyeS})" d="${heartPath}"/>
  </g>
  ${small ? '' : `<g fill="none" stroke="${C.line}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M234 318 Q244 334 256 320 Q268 334 278 318"/>
  </g>
  <g fill="none" stroke="${C.line}" stroke-width="3.6" stroke-linecap="round">
    <path d="M136 302 L168 307"/><path d="M134 316 L167 316"/><path d="M137 330 L168 325"/>
    <path d="${mirror('M136 302 L168 307')}"/><path d="${mirror('M134 316 L167 316')}"/><path d="${mirror('M137 330 L168 325')}"/>
  </g>`}`;
  if (o.artOnly) return art;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${o.size || 512}" height="${o.size || 512}">
  <defs><clipPath id="r"><rect width="512" height="512" rx="${round}"/></clipPath></defs>
  <g clip-path="url(#r)"><rect width="512" height="512" fill="${C.bg}"/>${art}</g></svg>`;
}
function tiny(o = {}) {
  const n = o.size || 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="${n}" height="${n}">
  <rect width="16" height="16" rx="3" fill="${C.bg}"/>
  <g fill="${C.fur}"><path d="M1.6 8.6 L2.6 2.2 L6.6 5.2 Z"/><path d="M14.4 8.6 L13.4 2.2 L9.4 5.2 Z"/><ellipse cx="8" cy="9.7" rx="6.6" ry="4.9"/></g>
  <g fill="${C.heart}"><path transform="translate(5.2 9.6) scale(1.45)" d="${heartPath}"/><path transform="translate(10.8 9.6) scale(1.45)" d="${heartPath}"/></g>
  </svg>`;
}
module.exports = { cat, tiny, C };
