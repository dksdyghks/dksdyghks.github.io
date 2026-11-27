// 8차 L5 server routes: /api/texts/bundle (E5), /api/lawgit/commits (E6), /api/write/history (E7) — with the app's own
// api.js reading the bundle (its framed, gzipped answer unpacked as it streams). Offline; throwaway PIN.
//   PORT=9143 node test-8.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { MockR2, serve } from './mock.mjs';
const PORT = Number(process.env.PORT) || 9143, ORIGIN = 'http://127.0.0.1:8770', API = `http://127.0.0.1:${PORT}`, BASE = API + '/api';
const PEPPER = 'test-pepper', PIN = '123456';
const dir = '/tmp/claude-0/-home-user/32c96ca5-ace8-5bfb-8ce5-1b09a2bc0eb1/scratchpad/seojae-mock-8-' + PORT;
fs.rmSync(dir, { recursive: true, force: true });
const r2 = new MockR2(dir);
// every storage call counted, by kind (a test reads them per request)
const ops = { get: 0, head: 0, list: 0, put: 0, delete: 0, range: 0, texts: 0 };
const bucket = new Proxy(r2, { get(t, k) {
  const v = t[k];
  if (typeof v !== 'function') return v;
  return (...a) => { if (k in ops) ops[k]++; if (k === 'get' && a[1] && a[1].range) ops.range++; if (k === 'get' && /^meta\/[0-9a-f]{24}\/text\.json\.gz$|^bundle\/texts\/b-/.test(a[0])) ops.texts++; return v.apply(t, a); };
} });
const env = { BUCKET: bucket, ALLOWED_ORIGINS: ORIGIN, PEPPER, PIN_HASH: crypto.createHash('sha256').update(PEPPER + ':' + PIN).digest('hex') };
const realFetch = globalThis.fetch;
const server = await serve(PORT, env);
let failures = 0, passed = 0;
const ok = (c, m) => { if (!c) { failures++; console.log('FAIL', m); } else { passed++; console.log('ok  ', m); } };
const call = (path, opt = {}, token) => realFetch(BASE + path, { ...opt, headers: { origin: ORIGIN, ...(token ? { authorization: 'Bearer ' + token } : {}), ...(opt.headers || {}) } });
const T = (await (await call('/login', { method: 'POST', body: JSON.stringify({ pin: PIN, device: 'test-8' }) })).json()).token;
const jcall = async (path, opt = {}, token = T) => { const r = await call(path, { ...opt, headers: { 'content-type': 'application/json', ...(opt.headers || {}) } }, token); const text = await r.text(); let body = null; try { body = JSON.parse(text); } catch (e) { /* not JSON */ } return { status: r.status, body, text, headers: r.headers }; };
const snap = () => ({ ...ops });
const diff = (a) => Object.fromEntries(Object.keys(ops).map((k) => [k, ops[k] - a[k]]));

// ---------------- a shelf of 115 papers with texts (and a few that must not come) ----------------
const hex = (i) => crypto.createHash('sha256').update('paper-' + i).digest('hex').slice(0, 24);
const textOf = (i, v = 1) => ({ v: 1, pages: Array.from({ length: 3 + (i % 5) }, (_, p) => `논문 ${i} 쪽 ${p + 1} 판 ${v} — 선거운동의 자유와 과잉금지원칙. ${'헌법재판소 결정을 검토한다. '.repeat(40 + (i % 30))}`), labels: { offset: 0 }, outline: [], ...(i === 7 ? { ocr: 123 } : {}) });
const files = [], N = 115;
for (let i = 0; i < N; i++) files.push({ id: hex(i), name: `논문${i}.pdf`, folder: null, size: 1000, pages: 3, thumb: false, text: true });
files.push({ id: hex(900), name: 'no-text-flag.pdf', folder: null, size: 10, pages: 1, text: false });   // (no text: never asked)
files.push({ id: hex(901), name: 'trashed.pdf', folder: null, size: 10, pages: 1, text: true });
files.push({ id: hex(902), name: 'flag-but-no-object.pdf', folder: null, size: 10, pages: 1, text: true });
let x = await jcall('/lib/ops', { method: 'POST', body: JSON.stringify({ ops: files.map((f) => ({ op: 'addFile', file: f })) }) });
ok(x.status === 200, `118 papers added (${x.status})`);
x = await jcall('/lib/ops', { method: 'POST', body: JSON.stringify({ ops: [{ op: 'trashFile', id: hex(901) }] }) });
for (let i = 0; i < N; i++) await r2.put(`meta/${hex(i)}/text.json.gz`, zlib.gzipSync(JSON.stringify(textOf(i))), { httpMetadata: { contentType: 'application/gzip' } });
await r2.put(`meta/${hex(901)}/text.json.gz`, zlib.gzipSync(JSON.stringify(textOf(901))), {});
await r2.put(`meta/${hex(900)}/thumb.jpg`, 'x', {});

// the app's api.js, in node (no IndexedDB: the sign-in's token is set by login() before it tries to keep it)
globalThis.SHELF_CONFIG = { api: API };
const api = await import('../shelf/api.js');
await api.login(PIN, 'api-js').catch(() => {});
ok(api.hasToken(), 'api.js signed in (node)');

// ---------------- E5 · the bundle ----------------
async function run(label, opts = {}) {
  const got = new Map(), before = snap();
  let calls = 0;
  const f0 = globalThis.fetch;
  globalThis.fetch = (u, o) => { if (/\/api\/texts\/bundle/.test(String(u))) calls++; return f0(u, o); };
  const per = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (u, o) => { const s = snap(); const r = await real(u, o); const buf = await r.arrayBuffer(); per.push(diff(s)); return new Response(buf, { status: r.status, headers: r.headers }); };
  const t0 = Date.now();
  const r = await api.textsBundle((d) => { got.set(d.id, d.text); }, opts);
  globalThis.fetch = f0;
  return { r, got, calls, per, ms: Date.now() - t0, all: diff(before), label };
}
{
  const cold = await run('cold');
  ok(cold.r && cold.r.done && cold.r.count === N, `cold device: all ${N} texts in one run (${JSON.stringify(cold.r)})`);
  ok(cold.calls <= 4, `cold device: ${cold.calls} requests (≤ 4)`);
  const textReads = cold.per.map((d) => d.texts);
  ok(textReads.every((n) => n <= 40), `cold: text reads per call ≤ 40 (${textReads.join(', ')})`);
  ok(cold.per.every((d) => d.list <= 1 + 1), `cold: one list of meta/ per call (${cold.per.map((d) => d.list).join(', ')}; +1 when a bin is kept)`);
  let same = 0;
  for (let i = 0; i < N; i++) if (JSON.stringify(cold.got.get(hex(i))) === JSON.stringify(textOf(i))) same++;
  ok(same === N, `every text exactly as stored (${same}/${N})`);
  ok(!cold.got.has(hex(901)) && !cold.got.has(hex(900)) && !cold.got.has(hex(902)), 'trashed, text-less and object-less papers not sent');
  ok(cold.got.get(hex(7)).ocr === 123, 'a scan’s ocr stamp comes with its text (the app checks it)');
  const man = JSON.parse(await (await r2.get('bundle/texts/manifest.json')).text());
  ok(Object.keys(man.items).length === N && Object.keys(man.bins).length === 3, `bins kept after the answers: ${Object.keys(man.items).length} texts in ${Object.keys(man.bins).length} bins`);

  const warm = await run('warm');
  ok(warm.r && warm.r.count === N && warm.calls === 3, `second device: ${warm.r && warm.r.count} texts in ${warm.calls} requests`);
  const warmReads = warm.per.map((d) => d.get);
  ok(warmReads.every((n) => n <= 5), `second device: ≤ 5 storage reads a call — device, index, manifest, its bins (${warmReads.join(', ')}; ranged ${warm.per.map((d) => d.range).join(', ')})`);
  ok(warm.per.every((d) => d.put === 0), 'second device: nothing written');
  let same2 = 0; for (let i = 0; i < N; i++) if (JSON.stringify(warm.got.get(hex(i))) === JSON.stringify(textOf(i))) same2++;
  ok(same2 === N, `second device: every text exact from the bins (${same2}/${N})`);

  // a text changed since (a scan read again): never served stale — read alone, then kept again
  await r2.put(`meta/${hex(50)}/text.json.gz`, zlib.gzipSync(JSON.stringify(textOf(50, 2))), {});
  await r2.put(`meta/${hex(51)}/text.json.gz`, zlib.gzipSync(JSON.stringify(textOf(51, 2))), {});
  const changed = await run('changed');
  ok(JSON.stringify(changed.got.get(hex(50))) === JSON.stringify(textOf(50, 2)) && JSON.stringify(changed.got.get(hex(51))) === JSON.stringify(textOf(51, 2)), 'a changed text: the new one is sent, not the bin’s');
  const man2 = JSON.parse(await (await r2.get('bundle/texts/manifest.json')).text());
  const e50 = (await r2.head(`meta/${hex(50)}/text.json.gz`)).etag;
  ok(man2.items[hex(50)].etag === e50, 'and the bins are brought up to date for the next device');
  const after = await run('after-change');
  ok(after.per.every((d) => d.get <= 7) && JSON.stringify(after.got.get(hex(50))) === JSON.stringify(textOf(50, 2)), `next device: from the bins again (${after.per.map((d) => d.get).join(', ')} reads)`);

  // a paper deleted for good: not sent, and dropped from the manifest
  await r2.delete(`meta/${hex(3)}/text.json.gz`);
  x = await jcall('/lib/ops', { method: 'POST', body: JSON.stringify({ ops: [{ op: 'trashFile', id: hex(4) }] }) });
  const gone = await run('gone');
  ok(!gone.got.has(hex(3)) && !gone.got.has(hex(4)) && gone.r.count === N - 2, `deleted / trashed papers left out (${gone.r.count})`);

  // the read budget: with no bins at all (every bin gone), no call reads more than 40 texts
  for (const k of (await r2.list({ prefix: 'bundle/texts/' })).objects.map((o) => o.key)) await r2.delete(k);
  const nobin = await run('no-bins');
  ok(nobin.r.count === N - 2 && nobin.per.every((d) => d.texts <= 40), `bins lost: rebuilt, ≤ 40 texts read a call (${nobin.per.map((d) => d.texts).join(', ')})`);

  // two devices at once on a cold server: both get everything; the manifest stays whole
  for (const k of (await r2.list({ prefix: 'bundle/texts/' })).objects.map((o) => o.key)) await r2.delete(k);
  const [a, b] = await Promise.all([run('a'), run('b')]);
  ok(a.r.count === N - 2 && b.r.count === N - 2, `two cold devices at once: ${a.r.count} and ${b.r.count}`);
  const c = await run('c');
  let same3 = 0; for (let i = 0; i < N; i++) if (i !== 3 && i !== 4 && JSON.stringify(c.got.get(hex(i))) === JSON.stringify(textOf(i, i === 50 || i === 51 ? 2 : 1))) same3++;
  ok(same3 === N - 2, `after the race: every text still exact (${same3}/${N - 2})`);
  const binsNow = (await r2.list({ prefix: 'bundle/texts/' })).objects.filter((o) => o.key.endsWith('.bin')).length;
  const man3 = JSON.parse(await (await r2.get('bundle/texts/manifest.json')).text());
  ok(binsNow <= Object.keys(man3.bins).length + 3, `no runaway of bins (${binsNow} stored, ${Object.keys(man3.bins).length} named)`);

  // the route itself
  let r = await call('/texts/bundle?limit=5');
  ok(r.status === 401, `no token: 401 (${r.status})`);
  r = await call('/texts/bundle?after=../../x', {}, T);
  ok(r.status === 400, `a bad cursor: 400 (${r.status})`);
  r = await call('/texts/bundle?limit=500', {}, T);
  const buf = Buffer.from(await r.arrayBuffer());
  const heads = [];
  for (let at = 0; at < buf.length;) { const nl = buf.indexOf(10, at); const h = JSON.parse(buf.subarray(at, nl).toString()); at = nl + 1; if (h.id) { heads.push(h); at += h.n; } }
  ok(r.headers.get('content-type') === 'application/x-shelf-texts' && heads.length === 40 && r.headers.get('x-next'), `limit capped at 40 a call; framed; x-next ${r.headers.get('x-next')}`);
  const share = (await jcall('/devices/sharekey', { method: 'POST', body: JSON.stringify({ name: 'share' }) })).body.token;
  r = await call('/texts/bundle', {}, share);
  ok(r.status === 403, `a share key cannot read texts (${r.status})`);
  // an old server (no route): api.textsBundle says null, the app reads each paper alone
  const f0 = globalThis.fetch;
  globalThis.fetch = async (u, o) => (/texts\/bundle/.test(String(u)) ? new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }) : f0(u, o));
  ok((await api.textsBundle(() => {})) === null, 'a server without the route: null (each paper alone, as before)');
  globalThis.fetch = f0;
  // a plain NDJSON answer (the contract's other form) is read too
  globalThis.fetch = async (u, o) => (/texts\/bundle/.test(String(u)) ? new Response(JSON.stringify({ id: hex(1), text: textOf(1) }) + '\n' + JSON.stringify({ next: null }) + '\n', { headers: { 'content-type': 'application/x-ndjson' } }) : f0(u, o));
  const nd = []; const ndr = await api.textsBundle((d) => nd.push(d));
  globalThis.fetch = f0;
  ok(ndr && ndr.count === 1 && nd[0].text.pages.length === textOf(1).pages.length, 'NDJSON lines {id, text} read as well');
}

// ---------------- E6 · GitHub history, kept six hours ----------------
{
  const asked = [];
  let mode = 'ok';
  const commit = (n) => ({ sha: crypto.createHash('sha1').update('c' + n).digest('hex'), commit: { message: `공직선거법 (일부개정)\n\n${n}`, author: { date: `2026-0${1 + (n % 9)}-1${n % 10}T00:00:00Z` } } });
  const f0 = globalThis.fetch;
  globalThis.fetch = async (u, o) => {
    const s = String(typeof u === 'string' ? u : u.url);
    if (!s.startsWith('https://api.github.com/')) return f0(u, o);
    asked.push({ url: s, ua: (o && o.headers && o.headers['user-agent']) || '' });
    if (mode === 'busy') return new Response('{"message":"API rate limit exceeded"}', { status: 403 });
    if (mode === 'down') throw new TypeError('fetch failed');
    const pg = Number(new URL(s).searchParams.get('page'));
    const list = pg === 1 ? Array.from({ length: 100 }, (_, i) => commit(i)) : Array.from({ length: 7 }, (_, i) => commit(100 + i));
    return new Response(JSON.stringify(list), { headers: { 'content-type': 'application/json', ...(pg === 1 ? { link: `<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=2>; rel="last"` } : {}) } });
  };
  const path = 'kr/공직선거법/법률.md';
  let r = await jcall('/lawgit/commits?' + new URLSearchParams({ path }));
  ok(r.status === 200 && Array.isArray(r.body) && r.body.length === 107 && r.body[0].sha === commit(0).sha && r.body[106].sha === commit(106).sha, `both pages joined into one list (${r.status}, ${r.body && r.body.length})`);
  ok(asked.length === 2 && asked.every((a) => a.ua === '0128-bookshelf/1.0 (+https://0128.kr/shelf/)'), `GitHub asked twice (two pages), with the shelf's own User-Agent`);
  ok(r.headers.get('x-cache') === 'miss', 'first: miss');
  const n1 = asked.length;
  r = await jcall('/lawgit/commits?' + new URLSearchParams({ path }));
  ok(r.status === 200 && r.body.length === 107 && asked.length === n1 && r.headers.get('x-cache') === 'hit', `the same call again within six hours: no ask upstream (x-cache ${r.headers.get('x-cache')}, upstream ${asked.length - n1})`);
  // through the app's wrapper (laws.js reads these fields)
  const viaApi = await api.lawGitCommits(path);
  ok(Array.isArray(viaApi) && viaApi.length === 107 && viaApi[3].commit.message.startsWith('공직선거법') && /^\d{4}-/.test(viaApi[3].commit.author.date), 'api.lawGitCommits: the list with sha, commit.message, commit.author.date');
  // another `until`: its own entry
  r = await jcall('/lawgit/commits?' + new URLSearchParams({ path, until: '2020-01-01T00:00:00Z' }));
  ok(r.status === 200 && asked.length === n1 + 2, 'another until: asked anew');
  // the edge cache gone (another data centre, or a *.workers.dev Worker whose cache keeps nothing): R2's copy, under six
  // hours old, is the keep — GitHub not asked
  const id = crypto.createHash('sha256').update('lawgit|' + path + '|').digest('hex');
  await caches.default.delete('https://kept.bookshelf.invalid/lawgit/' + id);
  const n2 = asked.length;
  r = await jcall('/lawgit/commits?' + new URLSearchParams({ path }));
  ok(r.status === 200 && r.body.length === 107 && r.headers.get('x-cache') === 'kept' && asked.length === n2, `no edge cache: R2's copy under six hours, GitHub not asked (x-cache ${r.headers.get('x-cache')}, upstream ${asked.length - n2})`);
  // GitHub refusing (its hourly allowance gone) once the copy is older: the last list kept in R2 is given, said stale
  await caches.default.delete('https://kept.bookshelf.invalid/lawgit/' + id);
  { const mf = dir + '/' + encodeURIComponent('cache/lawgit/' + id + '.json') + '.meta.json'; const m = JSON.parse(fs.readFileSync(mf, 'utf8')); m.uploaded = Date.now() - 7 * 3600e3; fs.writeFileSync(mf, JSON.stringify(m)); }
  mode = 'busy';
  r = await jcall('/lawgit/commits?' + new URLSearchParams({ path }));
  ok(r.status === 200 && r.body.length === 107 && r.headers.get('x-cache') === 'stale', `GitHub 403: the kept list, stale (${r.status} ${r.headers.get('x-cache')})`);
  r = await jcall('/lawgit/commits?' + new URLSearchParams({ path: 'kr/정당법/법률.md' }));
  ok(r.status === 502 && r.body.error === 'busy', `GitHub 403 and nothing kept: 502 busy, the app asks GitHub itself (${r.status} ${r.body && r.body.error})`);
  ok((await api.lawGitCommits('kr/정당법/법률.md').then(() => 'resolved', (e) => 'thrown ' + e.code)) === 'thrown busy', 'api.lawGitCommits throws then (laws.js catches it and asks GitHub directly)');
  mode = 'down';
  r = await jcall('/lawgit/commits?' + new URLSearchParams({ path: 'kr/정당법/법률.md' }));
  ok(r.status === 502 && r.body.error === 'upstream_unreachable', `GitHub unreachable: 502 (${r.body && r.body.error})`);
  for (const bad of ['../etc/passwd.md', 'kr/../../x.md', 'kr/x.txt', 'https://evil/x.md', 'kr/a/b/c/d.md']) {
    r = await jcall('/lawgit/commits?' + new URLSearchParams({ path: bad }));
    ok(r.status === 400, `bad path refused: ${bad} (${r.status})`);
  }
  r = await jcall('/lawgit/commits?' + new URLSearchParams({ path, until: 'tomorrow' }));
  ok(r.status === 400, 'bad until refused');
  r = await call('/lawgit/commits?' + new URLSearchParams({ path }));
  ok(r.status === 401, 'no token: 401');
  globalThis.fetch = f0;
}

// ---------------- E7 · 다듬은 기록 ----------------
{
  let r = await jcall('/write/history');
  ok(r.status === 200 && Array.isArray(r.body.list) && r.body.list.length === 0, 'empty at first');
  ok(Array.isArray(await api.writeHistory.get()), 'api.writeHistory.get(): a list');
  const ent = (i, extra = {}) => ({ id: 'h' + String(i).padStart(3, '0'), at: 1_800_000_000_000 + i * 1000, act: 'polish', input: '다듬을 글 ' + i, out: '다듬은 글 ' + i, model: { id: 'claude-x', name: 'Claude' }, stop: 'end_turn', usage: { input_tokens: 10, output_tokens: 20 }, note: '', junk: 'dropped', ...extra });
  r = await jcall('/write/history', { method: 'PUT', body: JSON.stringify({ list: Array.from({ length: 12 }, (_, i) => ent(i)) }) });
  ok(r.status === 200 && r.body.list.length === 12 && r.body.list[0].id === 'h011', `12 kept, newest first (${r.status})`);
  ok(!('junk' in r.body.list[0]) && r.body.list[0].model.name === 'Claude' && r.body.list[0].usage.output_tokens === 20, 'fields kept as the app has them; others dropped');
  // another device's entries merged by id: the 20 newest stay
  r = await jcall('/write/history', { method: 'PUT', body: JSON.stringify({ list: Array.from({ length: 15 }, (_, i) => ent(i + 8, i === 0 ? { out: 'newer copy' } : {})) }) });
  const ids = r.body.list.map((e) => e.id);
  ok(r.body.list.length === 20 && ids[0] === 'h022' && ids[19] === 'h003' && new Set(ids).size === 20, `merged by id, 20 newest kept (${ids[0]} … ${ids[19]})`);
  ok(r.body.list.find((e) => e.id === 'h008').out === 'newer copy', 'the same id again: the copy sent replaces the kept one');
  const viaApi = await api.writeHistory.put([ent(30)]);
  ok(Array.isArray(viaApi) && viaApi[0].id === 'h030' && viaApi.length === 20, 'api.writeHistory.put → the list kept now');
  // deleted on one device: gone everywhere, and not brought back by another device's older list
  r = await jcall('/write/history', { method: 'PUT', body: JSON.stringify({ list: [{ id: 'h030', del: true }] }) });
  ok(!r.body.list.some((e) => e.id === 'h030') && r.body.gone.includes('h030'), 'an entry deleted ({id, del: true})');
  r = await jcall('/write/history', { method: 'PUT', body: JSON.stringify({ list: [ent(30)] }) });
  ok(!r.body.list.some((e) => e.id === 'h030'), 'and an older device sending it again does not bring it back');
  // limits
  r = await jcall('/write/history', { method: 'PUT', body: JSON.stringify({ list: [ent(40, { input: '가'.repeat(9000) })] }) });
  const e40 = r.body.list.find((e) => e.id === 'h040');
  ok(e40 && [...e40.input].length === 4000 && e40.inputCut === true, `input cut to 4,000 letters, marked (${e40 && [...e40.input].length})`);
  r = await jcall('/write/history', { method: 'PUT', body: JSON.stringify({ list: [ent(41, { out: 'x'.repeat(210 * 1024) })] }) });
  ok(r.status === 413, `a body over 200 KB: 413 (${r.status})`);
  // twenty long answers through api.js: sent in parts under the limit, all kept
  const long = Array.from({ length: 20 }, (_, i) => ent(200 + i, { out: '다듬은 글 '.repeat(2500) }));
  const kept = await api.writeHistory.put(long);
  ok(Array.isArray(kept) && kept.length === 20 && kept[0].id === 'h219' && kept.every((e) => e.out.length > 10000), `api.writeHistory.put: 20 long answers (~${Math.round(JSON.stringify(long).length / 1024)} KB) sent in parts, all kept`);
  r = await jcall('/write/history', { method: 'PUT', body: JSON.stringify({ list: 'no' }) });
  ok(r.status === 400, 'not a list: 400');
  r = await jcall('/write/history', { method: 'PUT', body: JSON.stringify({ list: [{ id: '../x', at: 1 }, { id: 'ok1', at: 'never' }] }) });
  ok(r.status === 200 && !r.body.list.some((e) => e.id === '../x' || e.id === 'ok1'), 'bad ids and times left out');
  r = await call('/write/history');
  ok(r.status === 401, 'no token: 401');
  // two devices at once: neither loses the other's
  await Promise.all([jcall('/write/history', { method: 'PUT', body: JSON.stringify({ list: [ent(300)] }) }), jcall('/write/history', { method: 'PUT', body: JSON.stringify({ list: [ent(301)] }) })]);
  r = await jcall('/write/history');
  ok(r.body.list.some((e) => e.id === 'h300') && r.body.list.some((e) => e.id === 'h301') && r.body.list.length === 20, 'two devices at once: both kept');
}

server.close();
console.log(failures ? `\n${failures} FAILED, ${passed} passed` : `\nall ${passed} passed`);
process.exit(failures ? 1 : 0);
