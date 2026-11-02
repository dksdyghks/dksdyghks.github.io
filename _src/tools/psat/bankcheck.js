// Structural + consistency checks for every curated bank item (independent of the app).
const vm = require('vm'), fs = require('fs');
const { dir, all } = require('./files.js');
globalThis.PSAT_DEBUG = 1;
for (const f of all) { vm.runInThisContext(fs.readFileSync(dir + f, 'utf8'), { filename: f }); if (f === 'core.js') globalThis.PSAT.debug = true; }
const P = globalThis.PSAT;
const CIRC = '①②③④⑤';
let bad = 0, n = 0; const pos = { lang: [0, 0, 0, 0, 0], data: [0, 0, 0, 0, 0], sit: [0, 0, 0, 0, 0] }; const types = {};
const fail = (q, m) => { bad++; console.log('FAIL', q.id, '-', m); };
const htmlFields = (q) => { const out = []; const walk = (o, k) => { if (o == null) return; if (typeof o === 'string') out.push([k, o]); else if (Array.isArray(o)) o.forEach((x) => walk(x, k)); else if (typeof o === 'object') for (const kk of Object.keys(o)) if (!['id', 'type', 'stem', 'subject', 'src', 'set', 't', 'title', 'v'].includes(kk)) walk(o[kk], kk); }; walk(q.body, 'body'); walk(q.explain, 'explain'); return out; };
for (const [subj, items] of Object.entries(P.bank)) for (const q of items) {
  n++; pos[subj][q.answer]++; types[subj + ' | ' + q.type] = (types[subj + ' | ' + q.type] || 0) + 1;
  if (![1, 2, 3].includes(q.lv)) fail(q, 'lv missing');
  const oxs = q.explain.filter((b) => b.t === 'ox'), bxs = q.explain.filter((b) => b.t === 'bx');
  for (const b of oxs) {
    if (b.items.length !== 5) fail(q, 'ox has ' + b.items.length + ' items');
    const okv = b.items.map((x) => x.ok); const odd = okv.filter((x) => x === okv[q.answer]).length;
    if (odd !== 1) fail(q, 'answer is not the unique odd one out in ox: ' + okv.join(','));
    const verd = b.items.map((x) => x.v); if (verd.filter((v) => v === verd[q.answer]).length !== 1) fail(q, 'answer verdict text not unique: ' + verd[q.answer]);
  }
  const boxB = q.body.find((b) => b.t === 'box' && b.title === '보기');
  if (/<보기>/.test(q.stem) && !boxB) fail(q, 'stem mentions <보기> but no 보기 box');
  if (boxB && bxs.length) {
    const labels = boxB.items.map((s) => (s.match(/^([ㄱ-ㅎ])\./) || [])[1]).filter(Boolean);
    const bl = bxs[0].items.map((x) => x.label);
    if (labels.join() !== bl.join()) fail(q, 'bx labels ' + bl + ' vs box ' + labels);
    if (/모두 고르면/.test(q.stem)) {
      const want = bxs[0].items.filter((x) => x.ok).map((x) => x.label).join(', ');
      const opt = q.options[q.answer].replace(/<[^>]+>/g, '');
      if (opt !== want) fail(q, `answer option "${opt}" != ok labels "${want}"`);
      const dup = q.options.filter((o) => o === want).length; if (dup !== 1) fail(q, 'combo appears ' + dup + ' times');
      for (const o of q.options) if (!/^[ㄱ-ㅎ](, [ㄱ-ㅎ])*$/.test(o)) fail(q, 'odd combo option ' + o);
      // canonical order: by size then lexicographic
      const key = (o) => o.split(', ').length * 100 + o.split(', ').map((c) => 'ㄱㄴㄷㄹㅁㅂ'.indexOf(c)).reduce((a, x) => a * 7 + x, 0) / 1e6;
      for (let i = 1; i < 5; i++) if (key(q.options[i]) < key(q.options[i - 1])) fail(q, 'combo options not in canonical order');
    }
  }
  for (const b of q.explain) if (b.t === 'p' && /정답은 <b>([①②③④⑤])<\/b>/.test(b.h)) { const c = b.h.match(/정답은 <b>([①②③④⑤])<\/b>/)[1]; if (CIRC.indexOf(c) !== q.answer) fail(q, 'explain says ' + c + ' but answer is ' + CIRC[q.answer]); }
  for (const [k, h] of htmlFields(q)) {
    if (/<(?![a-z/!])/i.test(h)) fail(q, `raw "<" in ${k}: ` + h.slice(h.search(/<(?![a-z/!])/i) - 15, h.search(/<(?![a-z/!])/i) + 20));
    const tags = [...h.matchAll(/<(\/?)([a-z0-9]+)[^>]*>/g)]; const st = [];
    for (const [, cl, t] of tags) { if (['br', 'img', 'hr'].includes(t)) continue; if (!cl) st.push(t); else if (st.pop() !== t) { fail(q, 'unbalanced tag ' + t + ' in ' + k); break; } }
    if (st.length) fail(q, 'unclosed ' + st + ' in ' + k);
  }
  for (const o of q.options) if (/<(?![a-z/])/i.test(o)) fail(q, 'raw < in option');
  if (q.set) { const sib = items.filter((x) => x.set === q.set); if (sib.length !== q.setOf) fail(q, 'set size mismatch'); }
}
console.log('items', n, 'answer positions', JSON.stringify(pos));
for (const [k, v] of Object.entries(types).sort()) console.log('  ', k, v);
console.log(bad ? 'BANKCHECK FAILURES: ' + bad : 'BANKCHECK OK');
