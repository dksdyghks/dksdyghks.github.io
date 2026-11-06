// 해설의 “N문단 … ‘인용’”이 실제로 지문 N번째 문단(각주 p.fn 제외)에 있는지 확인한다. 채점 뒤 '문제 다시 보기'에 붙는 문단 번호와 같은 기준이다.
// 인용이 다른 문단에만 있으면 WRONG, 문단 수보다 큰 번호면 OVER로 실패한다(지문 어디에도 없는 인용은 quotecheck가 따로 본다).
const vm = require('vm'), fs = require('fs');
const { dir, all } = require('./files.js');
for (const f of all) vm.runInThisContext(fs.readFileSync(dir + f, 'utf8'), { filename: f });
const strip = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
let refs = 0, good = 0, bad = 0;
for (const q of Object.values(globalThis.PSAT.bank).flat()) {
  const ps = (q.body || []).filter((b) => b.t === 'passage'); if (ps.length !== 1) continue;
  const paras = [...String(ps[0].h).matchAll(/<p(\s[^>]*)?>([\s\S]*?)<\/p>/g)].filter((m) => !/\bfn\b/.test(m[1] || '')).map((m) => strip(m[2]));
  const ex = strip(JSON.stringify(q.explain).replace(/\\"/g, '"'));
  for (const m of ex.matchAll(/(\d+)문단(?:의|에서|에 따르면| 첫 문장에서| 끝에서)?[^“\d]{0,40}“([^”]+)”/g)) {
    refs++; const n = +m[1], parts = m[2].split(/\s*\.\.\.\s*|…/).filter(Boolean);
    if (n > paras.length) { bad++; console.log('OVER', q.id, n + '문단 > ' + paras.length); continue; }
    if (parts.every((x) => paras[n - 1].includes(x))) { good++; continue; }
    const where = paras.map((p, i) => (parts.every((x) => p.includes(x)) ? i + 1 : 0)).filter(Boolean);
    if (where.length) { bad++; console.log('WRONG', q.id, n + '문단이라 했으나 ' + where.join(',') + '문단에 있음:', m[2].slice(0, 40)); }
  }
}
console.log(`paragraph refs ${refs}, matched ${good}`); console.log(bad ? 'PARACHECK FAILURES: ' + bad : 'PARACHECK OK');
process.exitCode = bad ? 1 : 0;
