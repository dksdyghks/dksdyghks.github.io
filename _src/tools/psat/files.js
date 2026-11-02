// Shared: the script list exactly as psat/index.html loads it (so checks cover what ships).
const fs = require('fs');
const dir = '/home/user/yohan-ahn/psat/';
const html = fs.readFileSync(dir + 'index.html', 'utf8');
const all = [...html.matchAll(/<script src="([^"?]+)/g)].map((m) => m[1]).filter((f) => !/^(gate|app)\.js$/.test(f));
module.exports = { dir, all, banks: all.filter((f) => /^bank-/.test(f)), gens: all.filter((f) => /^(core|gen-)/.test(f)) };
