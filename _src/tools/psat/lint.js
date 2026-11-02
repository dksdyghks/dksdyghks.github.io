// Text lint over rendered generator output: spacing, stray tokens, broken markup, duplicated words.
const vm = require('vm'), fs = require('fs');
const dir = '/home/user/yohan-ahn/psat/';
for (const f of require('./files.js').all) if (fs.existsSync(dir + f)) vm.runInThisContext(fs.readFileSync(dir + f, 'utf8'), { filename: f });
const P = globalThis.PSAT; const N = +(process.env.N || 200);
const strip = (h) => String(h).replace(/<br\s*\/?>/g, ' ').replace(/<\/(li|p|td|th|div)>/g, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
function collect(o, out, path) { if (o == null) return; if (typeof o === 'string') out.push([path, o]); else if (Array.isArray(o)) o.forEach((x, i) => collect(x, out, path)); else if (typeof o === 'object') for (const k of Object.keys(o)) if (!['id', 'src', 'subject', 't', 'answer', 'k', 'ind'].includes(k)) collect(o[k], out, path + '.' + k); }
const RULES = [
  [/ {2,}/, 'double space'], [/ [.,)]/, 'space before punctuation'], [/\( /, 'space after ('], [/undefined|NaN|null|\[object/, 'bad token'],
  [/(%|%p|배|명|원|년|일) (에|을|를|이|가|은|는|으로|로)( |$)/, 'space before particle'], [/([가-힣]+) \1( |\.|$)/, 'repeated word'],
  [/\.\./, 'double period'], [/<\/?[a-z]+[^>]*$/, 'broken tag'], [/−-|--/, 'double minus'], [/ ,|,,/, 'comma spacing'],
];
const hits = new Map();
function check(id, path, raw) {
  if (/<[a-z]/.test(raw) && (raw.match(/</g) || []).length !== (raw.match(/>/g) || []).length) { const k = 'unbalanced <> ' + id.split(':')[0]; if (!hits.has(k)) hits.set(k, raw.slice(0, 160)); }
  const t = strip(raw);
  for (const [re, name] of RULES) { const m = re.exec(t); if (m) { const k = name + ' ' + id.split(':')[0] + ' ' + path; if (!hits.has(k)) hits.set(k, '…' + t.slice(Math.max(0, m.index - 40), m.index + 40) + '…'); } }
}
for (const [subject, gens] of Object.entries(P.gens)) for (const g of gens) for (let i = 0; i < N; i++) {
  const q = P.make(subject, g, 5000 + i * 7907); if (!q) continue; const out = []; collect(q, out, ''); out.forEach(([path, t]) => check(q.id, path, t));
}
for (const [subject, items] of Object.entries(P.bank || {})) for (const q of items) { const out = []; collect(q, out, ''); out.forEach(([path, t]) => check(q.id, path, t)); }
for (const [k, v] of hits) console.log(k, '::', v);
console.log('lint findings:', hits.size);
