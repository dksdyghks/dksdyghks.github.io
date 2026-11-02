// Independent 조사 checker over rendered text of every generator (and the curated bank if loaded).
const vm = require('vm'), fs = require('fs');
const dir = '/home/user/yohan-ahn/psat/';
const files = require('./files.js').all;
for (const f of files) vm.runInThisContext(fs.readFileSync(dir + f, 'utf8'), { filename: f });
const P = globalThis.PSAT;
const N = +(process.env.N || 250);
// readings (independent of core.js)
const HAN = { '甲': '갑', '乙': '을', '丙': '병', '丁': '정', '戊': '무', '己': '기', '庚': '경', '辛': '신' };
const LAT = { A: '에이', B: '비', C: '씨', D: '디', E: '이', F: '에프', G: '지', H: '에이치', I: '아이', J: '제이', K: '케이', L: '엘', M: '엠', N: '엔', O: '오', P: '피', Q: '큐', R: '알', S: '에스', T: '티', U: '유', V: '브이', W: '더블유', X: '엑스', Y: '와이', Z: '제트' };
const DIG = '영일이삼사오육칠팔구';
const UNIT = { '%': '트', '²': '곱' };
function reading(ch) {
  if (HAN[ch]) return HAN[ch].slice(-1);
  if (LAT[ch.toUpperCase()] && /[A-Za-z]/.test(ch)) return LAT[ch.toUpperCase()].slice(-1);
  if (/[0-9]/.test(ch)) return DIG[+ch];
  if (UNIT[ch]) return UNIT[ch];
  return ch;
}
const jong = (syl) => { const c = syl.charCodeAt(0); if (c < 0xAC00 || c > 0xD7A3) return -1; return (c - 0xAC00) % 28; };
function expectOK(prev, part) {
  const j = jong(reading(prev));
  if (j < 0) return null; // unknown
  const has = j !== 0, rieul = j === 8;
  switch (part) {
    case '은': case '이': case '을': case '과': return has;
    case '는': case '가': case '를': case '와': return !has;
    case '으로': return has && !rieul;
    case '로': return !has || rieul;
  }
  return null;
}
const strip = (h) => String(h).replace(/<br\s*\/?>/g, ' ').replace(/<\/(li|p|td|th|div)>/g, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function collect(o, out) { if (o == null) return; if (typeof o === 'string') out.push(strip(o)); else if (Array.isArray(o)) o.forEach((x) => collect(x, out)); else if (typeof o === 'object') for (const k of Object.keys(o)) if (!['id', 'src', 'subject', 't', 'answer', 'gen'].includes(k)) collect(o[k], out); }
const strict = new Map(), soft = new Map();
const COPULA = /^(다|고|며|면|나|므로|지만|라|라는|라고|어야|었|에|어서|어도)/;
function scan(text, where) {
  const re = /(\S?)(\S)(\([^()]*\))?(으로|은|는|이|가|을|를|과|와|로)(?=([\s.,·)”’?!:;\]…]|$))/g;
  let m;
  while ((m = re.exec(text))) {
    const prev = m[2], part = m[4];
    const ok = expectOK(prev, part);
    if (ok === null || ok) continue;
    const ctx = text.slice(Math.max(0, m.index - 12), m.index + m[0].length + 6);
    const nonHangul = !/[가-힣]/.test(prev) || m[3];
    const key = (m[1] + prev + (m[3] || '') + part);
    const map = nonHangul ? strict : soft;
    if (!map.has(key)) map.set(key, { n: 0, ctx, where });
    map.get(key).n++;
  }
}
for (const [subject, gens] of Object.entries(P.gens)) for (const g of gens) for (let i = 0; i < N; i++) {
  const q = P.make(subject, g, 3000 + i * 104729); if (!q) continue; const out = []; collect(q, out); out.forEach((t) => scan(t, g.id));
}
for (const [subject, items] of Object.entries(P.bank || {})) for (const q of items) { const out = []; collect(q, out); out.forEach((t) => scan(t, q.id)); }
console.log('STRICT (non-Hangul or parenthetical before particle):');
for (const [k, v] of strict) console.log(`  ${k}  x${v.n}  [${v.where}]  …${v.ctx}…`);
console.log('SOFT (Hangul syllable + mismatching particle form; review by eye):');
for (const [k, v] of [...soft].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${k}  x${v.n}  [${v.where}]  …${v.ctx}…`);
