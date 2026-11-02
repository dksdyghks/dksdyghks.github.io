// load core + generator files, generate many questions per generator, validate, show samples
const vm = require('vm'), fs = require('fs');
const files = process.argv.slice(2);
globalThis.PSAT = undefined;
for (const f of ['/home/user/yohan-ahn/psat/core.js', ...files]) vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
const P = globalThis.PSAT; P.debug = true;
const N = +(process.env.N || 400);
for (const [subject, gens] of Object.entries(P.gens)) {
  for (const g of gens) {
    let ok = 0, fail = 0, ids = new Set(), ansDist = [0,0,0,0,0], texts = new Set();
    for (let i = 0; i < N; i++) {
      const q = P.make(subject, g, 1000 + i * 7919);
      if (!q) { fail++; continue; }
      ok++; ansDist[q.answer]++; texts.add(JSON.stringify([q.body, q.options]));
    }
    console.log(`${subject} ${g.id.padEnd(10)} ok=${ok} fail=${fail} unique=${texts.size} answers=${ansDist.join('/')}`);
    if (process.env.SHOW === g.id) {
      const q = P.make(subject, g, +(process.env.SEED || 5));
      const strip = (h) => String(h).replace(/<li>/g, '\n  • ').replace(/<\/p>/g, '\n').replace(/<[^>]+>/g, '');
      console.log('\n[' + q.type + '] ' + q.stem);
      for (const b of q.body) console.log(b.t === 'table' ? JSON.stringify(b) : strip(b.h || b.items));
      q.options.forEach((o, i) => console.log((i === q.answer ? '*' : ' ') + P.CIRC[i] + ' ' + strip(o)));
      console.log('--- 해설'); for (const b of q.explain) console.log(b.t === 'table' ? JSON.stringify(b.rows) : b.t === 'list' ? b.items.map(strip).join('\n') : b.t === 'steps' ? b.items.map(s => '  '.repeat(s.ind) + strip(s.h)).join('\n') : b.t === 'ox' ? b.items.map((it, i) => `${P.CIRC[i]} [${it.v}] ${strip(it.why)}`).join('\n') : b.t === 'bx' ? b.items.map((it) => `${it.label}. ${strip(it.text)} → [${it.v}] ${strip(it.why)}`).join('\n') : strip(b.h));
    }
  }
}
