// Tests for worker.js through the mock runtime. Uses a throwaway PIN (never the real one).
import crypto from 'node:crypto';
import fs from 'node:fs';
import { MockR2, serve, fakeData } from './mock.mjs';
import worker from './worker.js';
const PORT = Number(process.env.PORT) || 8791, BASE = `http://127.0.0.1:${PORT}/api`, ORIGIN = 'http://127.0.0.1:8770';
const PEPPER = 'test-pepper', PIN = '123456';
const dir = '/tmp/claude-0/-home-user/32c96ca5-ace8-5bfb-8ce5-1b09a2bc0eb1/scratchpad/seojae-mock-test';
fs.rmSync(dir, { recursive: true, force: true });
const bucket = new MockR2(dir);
const env = { BUCKET: bucket, ALLOWED_ORIGINS: ORIGIN, WRITE_DAY_CAP: '150', WRITE_DAY_USD: '40', PEPPER, PIN_HASH: crypto.createHash('sha256').update(PEPPER + ':' + PIN).digest('hex') };
const server = await serve(PORT, env);
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.log('FAIL', m); } else console.log('ok  ', m); };
const call = (path, opt = {}, token) => fetch(BASE + path, { ...opt, headers: { origin: ORIGIN, ...(token ? { authorization: 'Bearer ' + token } : {}), ...(opt.headers || {}) } });
const j = async (r) => ({ status: r.status, body: await r.json() });
const hex = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 24);

// CORS
let r = await fetch(BASE + '/lib', { method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-method': 'PUT' } });
ok(r.status === 204 && r.headers.get('access-control-allow-origin') === ORIGIN && /authorization/.test(r.headers.get('access-control-allow-headers')), 'preflight allows the app origin');
r = await fetch(BASE + '/ping', { headers: { origin: 'https://evil.example' } });
ok(r.headers.get('access-control-allow-origin') !== 'https://evil.example', 'other origins are not echoed');

// sign-in, lockout
let x = await j(await call('/login', { method: 'POST', body: JSON.stringify({ pin: '000000', device: 'test' }) }));
ok(x.status === 401 && x.body.left === 7, 'wrong PIN -> 401, 7 tries left');
for (let i = 0; i < 6; i++) await call('/login', { method: 'POST', body: JSON.stringify({ pin: '000001' }) });
x = await j(await call('/login', { method: 'POST', body: JSON.stringify({ pin: '000002' }) }));
ok(x.status === 429 && x.body.until > Date.now(), '8th wrong PIN locks for an hour');
x = await j(await call('/login', { method: 'POST', body: JSON.stringify({ pin: PIN }) }));
ok(x.status === 429, 'even the right PIN waits while locked');
const clearTries = async () => { const l = await bucket.list({ prefix: 'auth/try' }); await bucket.delete(l.objects.filter(Boolean).map((o) => o.key)); };
const login = (pin, ip, device) => call('/login', { method: 'POST', body: JSON.stringify({ pin, device }), headers: ip ? { 'cf-connecting-ip': ip } : {} }).then(j);
x = await login(PIN, '10.0.0.9'); ok(x.status === 200, 'the lock is for that address only: the right PIN from another address gets in');
// 60 wrong PINs at once from one address: at most 8 are checked (the try is written before it is counted), the rest refused
{
  await clearTries();
  const hash = env.PIN_HASH; let reads = 0;
  Object.defineProperty(env, 'PIN_HASH', { configurable: true, get() { reads++; return hash; } });
  const rs = await Promise.all(Array.from({ length: 60 }, (_, i) => login(String(100000 + i), '10.0.0.1')));
  const checks = reads - 60;   // read once on the way in, and once more for a PIN that is compared
  Object.defineProperty(env, 'PIN_HASH', { configurable: true, writable: true, value: hash });
  ok(checks <= 8 && checks >= 1, `60 parallel wrong PINs: ${checks} checked (at most 8)`);
  ok(rs.filter((r) => r.status === 401).length <= 7 && rs.every((r) => r.status === 401 || r.status === 429), `the rest refused (${rs.filter((r) => r.status === 429).length} × 429)`);
  x = await login(PIN, '10.0.0.1'); ok(x.status === 429 && x.body.until > Date.now(), 'that address stays locked, even for the right PIN');
  x = await login(PIN, '10.0.0.2'); ok(x.status === 200, 'the owner elsewhere is not locked out');
  x = await login('000000', '10.0.0.1'); const u1 = x.body.until;
  x = await login('000000', '10.0.0.1'); ok(x.status === 429 && x.body.until === u1, 'waiting out the hour is enough: refused tries do not push the lock on');
  const realNow = Date.now; Date.now = () => realNow() + 3600e3 + 5000;
  x = await login(PIN, '10.0.0.1'); ok(x.status === 200, 'an hour later the address gets in again');
  Date.now = realNow;
}
// many addresses (past 30 wrong PINs in an hour): one try a minute, so nobody is locked out for good
{
  await clearTries();
  const realNow = Date.now; let off = 0; Date.now = () => realNow() + off;
  for (let a = 0; a < 5; a++) for (let i = 0; i < 7; i++) await login('11111' + i, '10.1.0.' + a);
  off = 61e3;   // the next minute
  const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => login('22222' + (i % 10), '10.2.0.' + i)));
  ok(rs.filter((r) => r.status === 401).length <= 1 && rs.filter((r) => r.status === 429 && r.body.slow).length >= 19, `20 tries from 20 addresses in one minute: ${rs.filter((r) => r.status === 401).length} checked`);
  x = await login(PIN, '10.3.0.1'); ok(x.status === 429 && x.body.slow && x.body.until - Date.now() <= 60e3, 'the owner waits a minute at most (slow, not locked)');
  off = 122e3;
  x = await login(PIN, '10.3.0.1'); ok(x.status === 200, 'the minute after, the right PIN gets in');
  // a stranger's one wrong PIN at the start of each minute would keep a slowed owner out: an address the right PIN came from
  // before is not slowed (its own 8 an hour still hold)
  // (the minutes are the server's whole clock minutes: each round starts just after one begins, so the stranger's try, the
  // owner's and the new address's below all fall in the same minute whatever second the test started at)
  let ownerIn = 0; const al = 60e3 - (realNow() % 60e3);
  for (let m = 3; m <= 7; m++) { off = al + m * 60e3 + 500; await login('333333', '10.4.0.1'); off += 20e3; if ((await login(PIN, '10.3.0.1')).status === 200) ownerIn++; }
  ok(ownerIn === 5, `a known address is not kept out by a stranger's try each minute (${ownerIn} of 5 in)`);
  x = await login(PIN, '10.3.0.9'); ok(x.status === 429 && x.body.slow, 'a new address is still slowed meanwhile');
  Date.now = realNow;
  await clearTries();
  const kn = await bucket.list({ prefix: 'auth/known/' }); await bucket.delete(kn.objects.filter(Boolean).map((o) => o.key));
  const devs = await bucket.list({ prefix: 'auth/devices/' }); await bucket.delete(devs.objects.filter(Boolean).map((o) => o.key));   // (the devices these tests signed in)
}
x = await j(await call('/login', { method: 'POST', body: JSON.stringify({ pin: PIN, device: '아이패드' }) }));
ok(x.status === 200 && x.body.token && x.body.device.name === '아이패드', 'right PIN -> token');
const T = x.body.token;
const T2 = (await j(await call('/login', { method: 'POST', body: JSON.stringify({ pin: PIN, device: '컴퓨터' }) }))).body.token;
ok((await call('/me', {}, 'x'.repeat(43))).status === 401, 'unknown token -> 401');
ok((await call('/lib')).status === 401, 'no token -> 401');
x = await j(await call('/me', {}, T)); ok(x.status === 200 && x.body.device.name === '아이패드', '/me');
x = await j(await call('/devices', {}, T)); ok(x.body.devices.length === 2 && x.body.devices.some((d) => d.current), 'two devices listed');

// library ops
const ops = (list, t = T) => call('/lib/ops', { method: 'POST', body: JSON.stringify({ ops: list }) }, t).then(j);
x = await ops([{ op: 'addFolder', folder: { id: 'f_aaaaaaaaaa', name: '논문', parent: null } }, { op: 'addFolder', folder: { id: 'f_bbbbbbbbbb', name: '헌법', parent: 'f_aaaaaaaaaa' } }]);
ok(x.status === 200 && x.body.index.folders.length === 2, 'two folders');
const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), crypto.randomBytes(5 * 1024 * 1024 + 123)]);
const id = hex(pdf);
x = await ops([{ op: 'addFile', file: { id, name: '기본권 제한.pdf', folder: 'f_bbbbbbbbbb', size: pdf.length, pages: 22, thumb: true, text: true } }]);
ok(x.body.results[0].ok && x.body.index.files[0].by === '아이패드', 'file added with the device name');
x = await ops([{ op: 'addFile', file: { id, name: 'again.pdf', folder: null, size: 1 } }]);
ok(x.body.results[0].error === 'exists', 'same PDF twice -> exists');
x = await ops([{ op: 'addFile', file: { id: hex(Buffer.from('z')), name: 'x.pdf', folder: 'f_nonexist00' } }]);
ok(x.body.results[0].error === 'no_folder', 'unknown folder refused');
x = await ops([{ op: 'moveFolder', id: 'f_aaaaaaaaaa', parent: 'f_bbbbbbbbbb' }]);
ok(x.body.results[0].error === 'cycle', 'a folder cannot move into its own child');
x = await ops([{ op: 'updateFile', id, set: { stars: 2 } }]);
ok(x.body.index.files[0].stars === 2 && x.body.index.files[0].rated > 0, 'two stars kept with the time');
x = await ops([{ op: 'updateFile', id, set: { stars: 7 } }]);
ok(x.body.index.files[0].stars === 0 && x.body.index.files[0].rated === null, 'out-of-range stars clear the rating');
x = await ops([{ op: 'updateFile', id, set: { stars: -1 } }]);
ok(x.body.index.files[0].stars === -1, '✕ (no need to come back) kept as -1');
x = await ops([{ op: 'updateFile', id, set: { stars: -2 } }]);
ok(x.body.index.files[0].stars === -2, '△ (skim once more) kept as -2');
// a mark kept offline arrives late with the time it was given: the newer mark stays
x = await ops([{ op: 'updateFile', id, set: { stars: -1 }, at: Date.now() }]);
x = await ops([{ op: 'updateFile', id, set: { stars: 3 }, at: Date.now() - 60e3 }]);
ok(x.body.index.files[0].stars === -1 && x.body.results[0].stale, 'an older ★ sent late does not replace a newer ✕');
x = await ops([{ op: 'updateFile', id, set: { stars: 0 } }]);
x = await ops([{ op: 'updateFile', id, set: { stars: 2 }, at: Date.now() - 60e3 }]);
ok(x.body.index.files[0].stars === 0, 'nor a newer "no mark"');
x = await ops([{ op: 'updateFile', id, set: { stars: 1 }, at: Date.now() + 3600e3 }]);
ok(x.body.index.files[0].stars === 1 && x.body.index.files[0].starsAt <= Date.now(), 'a time ahead of the server counts as now');
x = await ops([{ op: 'updateFile', id, set: { stars: -2 } }]);
ok(x.body.index.files[0].stars === -2 && !x.body.results[0].stale, 'an op without a time (an older app) counts as given now');
// device clocks: with op.sent (when the device sent it, by its own clock) the mark's age is sent − at, by the server's clock
{
  const SLOW = -10 * 60e3, FAST = 10 * 60e3;   // a device 10 minutes behind, another 10 minutes ahead
  x = await ops([{ op: 'updateFile', id, set: { stars: -1 } }]);   // ✕ given now (server's clock)
  let d = Date.now() + SLOW;   // the slow device gives ★★★ a second after: by its clock 10 minutes ago
  x = await ops([{ op: 'updateFile', id, set: { stars: 3 }, at: d + 1000, sent: d + 1000 }]);
  ok(x.body.index.files[0].stars === 3 && !x.body.results[0].stale, 'a slow device clock: a fresh ★ with its send time is not refused as stale');
  ok(Math.abs(x.body.index.files[0].starsAt - Date.now()) < 5000, 'its time is set by the server clock');
  // (the app reads the server's clock from index.updated, the time the ops were written: starsAt is exactly updated − (sent − at))
  ok(x.body.index.files[0].starsAt === x.body.index.updated, 'sent = at: the mark is as of when the server wrote it (index.updated)');
  await new Promise((r) => setTimeout(r, 150));   // (a mark 50 ms old, given after the one above)
  x = await ops([{ op: 'updateFile', id, set: { stars: 3 }, at: d + 2000, sent: d + 2050 }]);
  ok(x.body.index.files[0].stars === 3 && !x.body.results[0].stale && x.body.index.files[0].starsAt === x.body.index.updated - 50, 'starsAt = index.updated − (sent − at)');
  x = await ops([{ op: 'updateFile', id, set: { stars: -1 }, at: d + 1000 }]);
  ok(x.body.index.files[0].stars === 3 && x.body.results[0].stale, 'the same without its send time (an older app): taken by the device clock, refused');
  // the fast device gave ✕ 5 minutes ago while offline, and sends it now: it is older than the ★ above, so it stays ★
  d = Date.now() + FAST;
  x = await ops([{ op: 'updateFile', id, set: { stars: -1 }, at: d - 5 * 60e3, sent: d }]);
  ok(x.body.index.files[0].stars === 3 && x.body.results[0].stale, 'a fast device clock: a ✕ kept offline 5 minutes is older than a ★ given since');
  ok(x.body.index.files[0].starsAt <= Date.now(), 'the time kept is never ahead of the server');
  // two queued ops sent together: their order by age stays (the newer of the two wins)
  d = Date.now() + FAST;
  x = await ops([{ op: 'updateFile', id, set: { stars: 1 }, at: d, sent: d }, { op: 'updateFile', id, set: { stars: -2 }, at: d - 2000, sent: d }]);
  ok(x.body.index.files[0].stars === 1 && !x.body.results[0].stale && x.body.results[1].stale, 'of two sent together, the one given later stays');
  // a send time before its own time (the device clock was set back in between) counts as now, not as later than now
  x = await ops([{ op: 'updateFile', id, set: { stars: -1 }, at: Date.now(), sent: Date.now() - 60e3 }]);
  ok(x.body.index.files[0].stars === -1 && x.body.index.files[0].starsAt <= Date.now(), 'a send time before the given time counts as now');
  x = await ops([{ op: 'updateFile', id, set: { stars: 2 }, at: 'x', sent: Date.now() }]);
  ok(x.body.index.files[0].stars === 2 && !x.body.results[0].stale, 'a send time with no given time: counts as now');
  x = await ops([{ op: 'updateFile', id, set: { stars: -2 } }]);
}
x = await ops([{ op: 'addFolder', folder: { id: 'f_bidibidi00', name: '\u202efdp.exe\u202c 폴더', parent: null } }]);
ok(x.body.index.folders.find((f) => f.id === 'f_bidibidi00').name === 'fdp.exe 폴더', 'characters that turn the text around are taken out of names');
x = await ops([{ op: 'purgeFolder', id: 'f_bidibidi00' }]);
x = await ops([{ op: 'updateFile', id, set: { name: '  기본권   제한의 한계.pdf ', folder: 'f_aaaaaaaaaa' } }]);
ok(x.body.index.files[0].name === '기본권 제한의 한계.pdf' && x.body.index.files[0].folder === 'f_aaaaaaaaaa', 'rename + move (name tidied)');
// concurrent writers: no update is lost
await Promise.all(Array.from({ length: 12 }, (_, i) => ops([{ op: 'addFolder', folder: { id: 'f_c' + String(i).padStart(9, '0'), name: 'c' + i, parent: null } }], i % 2 ? T : T2)));
x = await j(await call('/lib', {}, T));
ok(x.body.folders.length === 14, `12 parallel folder adds all kept (have ${x.body.folders.length})`);
x = await ops([{ op: 'trashFolder', id: 'f_aaaaaaaaaa' }]);
x = await ops([{ op: 'addFile', file: { id: hex(Buffer.from('q')), name: 'q.pdf', folder: 'f_bbbbbbbbbb' } }]);
ok(x.body.results[0].error === 'no_folder', 'cannot add into a trashed folder (child of trashed)');
x = await ops([{ op: 'restoreFolder', id: 'f_aaaaaaaaaa' }]);
ok(!x.body.index.folders.find((f) => f.id === 'f_aaaaaaaaaa').trashed, 'folder restored');

// file bytes
r = await call('/files/' + id, { method: 'PUT', body: pdf, headers: { 'content-type': 'application/pdf' } }, T);
x = await j(r); ok(x.status === 200 && x.body.size === pdf.length, 'upload 5 MB');
r = await call('/files/' + id, { method: 'PUT', body: pdf }, T); x = await j(r); ok(x.body.existed, 'same bytes again: not rewritten');
r = await call('/files/' + id, {}, T); let b = Buffer.from(await r.arrayBuffer());
ok(r.status === 200 && b.equals(pdf) && r.headers.get('accept-ranges') === 'bytes' && /immutable/.test(r.headers.get('cache-control')), 'download whole file');
r = await call('/files/' + id, { headers: { range: 'bytes=0-1023' } }, T); b = Buffer.from(await r.arrayBuffer());
ok(r.status === 206 && b.equals(pdf.subarray(0, 1024)) && r.headers.get('content-range') === `bytes 0-1023/${pdf.length}`, 'range: first KB');
r = await call('/files/' + id, { headers: { range: 'bytes=-500' } }, T); b = Buffer.from(await r.arrayBuffer());
ok(r.status === 206 && b.equals(pdf.subarray(pdf.length - 500)), 'range: last 500 bytes');
r = await call('/files/' + id, { headers: { range: `bytes=${pdf.length + 5}-` } }, T); ok(r.status === 416, 'range past the end -> 416');
r = await call('/files/' + id, { method: 'HEAD' }, T); ok(r.status === 200 && Number(r.headers.get('content-length')) === pdf.length, 'HEAD gives the size');
r = await fetch(BASE + '/files/' + id, { headers: { origin: ORIGIN, authorization: 'Bearer ' + T, range: 'bytes=0-9' } });
ok(/content-range/.test(r.headers.get('access-control-expose-headers')), 'range headers exposed to the browser');

// multipart (a big book)
const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), crypto.randomBytes(11 * 1024 * 1024)]);
const bid = hex(big);
x = await j(await call(`/files/${bid}/mpu`, { method: 'POST', body: JSON.stringify({ size: big.length }) }, T)); const up = x.body.uploadId;
const parts = [];
for (let i = 0, n = 1; i < big.length; i += 5 * 1024 * 1024, n++) { const p = await j(await call(`/files/${bid}/mpu/${encodeURIComponent(up)}/${n}`, { method: 'PUT', body: big.subarray(i, i + 5 * 1024 * 1024) }, T)); parts.push(p.body); }
x = await j(await call(`/files/${bid}/mpu/${encodeURIComponent(up)}/complete`, { method: 'POST', body: JSON.stringify({ parts }) }, T));
r = await call('/files/' + bid, {}, T); b = Buffer.from(await r.arrayBuffer());
ok(x.body.ok && b.equals(big), 'multipart upload of 11 MB in 3 parts');

// thumbnails / text
r = await call(`/meta/${id}/thumb`, { method: 'PUT', body: Buffer.from([0xff, 0xd8, 1, 2, 3]) }, T);
r = await call(`/meta/${id}/thumb`, {}, T); ok(r.status === 200 && (await r.arrayBuffer()).byteLength === 5 && r.headers.get('content-type') === 'image/jpeg', 'thumbnail stored');
r = await call(`/meta/${bid}/text`, {}, T); ok(r.status === 404, 'missing text -> 404');

// marks: two devices write at once, deletions win by time
const mk = (i, t, extra = {}) => ({ id: 'm' + i, p: 0, kind: 'hl', color: '#ffd84d', rects: [[0.1, 0.1 + i * 0.01, 0.5, 0.02]], text: '문장 ' + i, t, ...extra });
await Promise.all([
  call('/marks/' + id, { method: 'PUT', body: JSON.stringify({ marks: [mk(1, 1000), mk(2, 1000)] }) }, T),
  call('/marks/' + id, { method: 'PUT', body: JSON.stringify({ marks: [mk(3, 1000)] }) }, T2),
]);
x = await j(await call('/marks/' + id, {}, T));
ok(x.body.marks.length === 3 && x.body.marks[0].color === '#FFD84D', 'concurrent mark writes merged (3)');
x = await j(await call('/marks/' + id, { method: 'PUT', body: JSON.stringify({ marks: [{ id: 'm2', del: true, t: 2000 }, mk(1, 500, { color: '#8EE0A6' })] }) }, T));
ok(x.body.marks.filter((m) => !m.del).length === 2 && x.body.marks.find((m) => m.id === 'm1').color === '#FFD84D', 'deletion applied, older edit ignored');
x = await j(await call('/marks/' + id, { method: 'PUT', body: JSON.stringify({ marks: [{ id: 'bad', p: -1, kind: 'hl', color: 'red', rects: [], t: 1 }, mk(9, 3000, { rects: [[0, 0, 2, 2]] })] }) }, T));
ok(!x.body.marks.find((m) => m.id === 'bad' || m.id === 'm9'), 'invalid marks dropped');

// reading positions
await call('/state', { method: 'PUT', body: JSON.stringify({ files: { [id]: { page: 5, y: 0.3, at: 2000 } } }) }, T);
x = await j(await call('/state', { method: 'PUT', body: JSON.stringify({ files: { [id]: { page: 2, y: 0.1, at: 1000 } } }) }, T2));
ok(x.body.files[id].page === 5, 'older reading position does not overwrite a newer one');

// purge removes the stored objects
x = await ops([{ op: 'trashFile', id }, { op: 'emptyTrash' }]);
await new Promise((ok2) => setTimeout(ok2, 100));
ok(!(await bucket.head('files/' + id + '.pdf')) && !(await bucket.head('marks/' + id + '.json')) && !(await bucket.head('meta/' + id + '/thumb.jpg')), 'emptying the trash deletes the PDF, marks and thumbnail');
{ // one cheap request tells a device what changed since the versions it holds
  let y = await j(await call('/sync', {}, T));
  ok(y.status === 200 && y.body.lib && y.body.libTag && y.body.stateTag !== undefined, 'sync with nothing held returns the library and its version');
  const tag = y.body.libTag;
  y = await j(await call('/sync?lib=' + tag + '&state=' + (y.body.stateTag || ''), {}, T));
  ok(!y.body.lib && !y.body.state && y.body.libTag === tag, 'nothing changed -> nothing sent');
  await ops([{ op: 'addFolder', folder: { id: 'f_dddddddddd', name: '바뀜', parent: null } }]);
  y = await j(await call('/sync?lib=' + tag, {}, T));
  ok(y.body.lib && y.body.libTag !== tag && y.body.lib.folders.some((f) => f.id === 'f_dddddddddd'), 'after a change the new library comes back');
}
{ // a tidied name keeps the file's own name beside it
  const idn = hex(Buffer.from('named'));
  const y = await ops([{ op: 'addFile', file: { id: idn, name: '홍길동_기본권 제한의 한계.pdf', orig: 'DBpia_12345.pdf', folder: null, size: 10 } }]);
  const f = y.body.index.files.find((x) => x.id === idn);
  ok(f && f.name === '홍길동_기본권 제한의 한계.pdf' && f.orig === 'DBpia_12345.pdf', 'the original file name is kept with the tidied one');
  await ops([{ op: 'trashFile', id: idn }, { op: 'emptyTrash' }]);
}
{ // the share menu: a key that can only put PDFs in
  let y = await j(await call('/devices/sharekey', { method: 'POST', body: JSON.stringify({ name: '아이패드' }) }, T));
  ok(y.status === 200 && y.body.token && y.body.device.kind === 'inbox', 'a share key is made');
  const SK = y.body.token;
  ok((await call('/lib', {}, SK)).status === 403, 'the share key cannot read the shelf');
  ok((await call('/lib/ops', { method: 'POST', body: JSON.stringify({ ops: [{ op: 'emptyTrash' }] }) }, SK)).status === 403, 'nor change it');
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), crypto.randomBytes(3000)]);
  y = await j(await call('/inbox?name=' + encodeURIComponent('DBpia 받은 논문'), { method: 'POST', body: pdf, headers: { 'content-type': 'application/pdf' } }, SK));
  ok(y.status === 200 && y.body.ok && y.body.id === hex(pdf) && y.body.name === 'DBpia 받은 논문.pdf', 'a PDF sent with the share key lands on the shelf');
  let ix = (await j(await call('/lib', {}, T))).body;
  const got = ix.files.find((f) => f.id === hex(pdf));
  ok(got && got.pending === true && got.folder === null && got.orig === 'DBpia 받은 논문.pdf', 'marked to be prepared by a device');
  ok(!!(await bucket.head('files/' + hex(pdf) + '.pdf')), 'the PDF itself is stored');
  y = await j(await call('/inbox', { method: 'POST', body: pdf }, SK));
  ok(y.status === 200 && y.body.dup === true, 'the same PDF twice -> already there');
  y = await j(await call('/inbox', { method: 'POST', body: Buffer.from('not a pdf at all, just words') }, SK));
  ok(y.status === 415, 'not a PDF -> refused');
  y = await ops([{ op: 'updateFile', id: hex(pdf), set: { pending: false, thumb: true, text: true, pages: 3 } }]);
  ok(!('pending' in y.body.index.files.find((f) => f.id === hex(pdf))), 'a device clears the mark after preparing it');
  const dv = (await j(await call('/devices', {}, T))).body.devices;
  const sk = dv.find((d) => d.kind === 'inbox');
  ok(sk && /공유로 넣기/.test(sk.name), 'the share key is listed with the devices');
  await call('/devices/' + sk.id, { method: 'DELETE' }, T);
  ok((await call('/inbox', { method: 'POST', body: pdf }, SK)).status === 401, 'a removed share key no longer works');
  await ops([{ op: 'trashFile', id: hex(pdf) }, { op: 'emptyTrash' }]);
}
{ // never past the free tier: no new PDF once the shelf would pass the cap
  env.CAP_BYTES = String(1024 * 1024);   // a tiny cap (1 MB) for this test only; the test PDF is 2 MB
  const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), crypto.randomBytes(2 * 1024 * 1024)]);
  let y = await call('/files/' + hex(big), { method: 'PUT', body: big, headers: { 'content-type': 'application/pdf' } }, T);
  ok(y.status === 507 && (await y.json()).error === 'full', 'a PDF past the cap is refused (full)');
  y = await call('/files/' + hex(big) + '/mpu', { method: 'POST', body: JSON.stringify({ size: big.length }) }, T);
  ok(y.status === 507, 'a large upload past the cap is refused before it starts');
  y = await call('/files/' + hex(big) + '/mpu', { method: 'POST', body: JSON.stringify({}) }, T);
  ok(y.status === 411, 'a large upload must say its size');
  const skr = (await j(await call('/devices/sharekey', { method: 'POST', body: JSON.stringify({}) }, T))).body; const sk = skr.token;
  y = await call('/inbox', { method: 'POST', body: big }, sk);
  ok(y.status === 507, 'the share menu is refused past the cap too');
  ok(!(await bucket.head('files/' + hex(big) + '.pdf')), 'nothing was stored');
  await call('/devices/' + skr.device.id, { method: 'DELETE' }, T);
  delete env.CAP_BYTES;
}
{ // a scanned paper: how many pages are only pictures, the words read from them, and when they were read
  const sid = hex(Buffer.from('scanned-paper'));
  let y = await ops([{ op: 'addFile', file: { id: sid, name: '스캔본.pdf', folder: null, size: 10, pages: 12, scan: 12 } }]);
  ok(y.body.index.files.find((f) => f.id === sid).scan === 12, 'a scanned paper says how many of its pages are pictures');
  ok(y.body.index.files.filter((f) => f.id !== sid).every((f) => !('scan' in f)), 'ordinary papers carry no such field');
  const gz = Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  let r = await call(`/meta/${sid}/ocr`, { method: 'PUT', body: gz }, T);
  ok(r.status === 200, 'the words read from it are stored');
  r = await call(`/meta/${sid}/ocr`, {}, T);
  ok(r.status === 200 && Buffer.from(await r.arrayBuffer()).equals(gz) && r.headers.get('content-type') === 'application/gzip', 'and come back as they were');
  ok((await call(`/meta/${sid}/other`, {}, T)).status === 400, 'no other kinds of meta');
  y = await ops([{ op: 'updateFile', id: sid, set: { ocr: 1700000000000, scan: 12 } }]);
  ok(y.body.index.files.find((f) => f.id === sid).ocr === 1700000000000, 'the paper remembers when it was read');
  await ops([{ op: 'trashFile', id: sid }, { op: 'emptyTrash' }]);
  await new Promise((r2) => setTimeout(r2, 150));
  ok(!(await bucket.head('meta/' + sid + '/ocr.json.gz')), 'emptying the trash takes the read words too');
}
{ // marks for search, and backups: what was there before the day's first change is kept, and can come back
  const kday = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const pid = hex(Buffer.from('backup-paper'));
  await ops([{ op: 'addFile', file: { id: pid, name: '백업 시험.pdf', folder: null, size: 10 } }]);
  const put = (list, t = T) => call('/marks/' + pid, { method: 'PUT', body: JSON.stringify({ marks: list }) }, t).then(j);
  const hist = async () => (await j(await call('/marks/' + pid + '/history', {}, T))).body.list;
  const restore = (ts) => call('/marks/' + pid + '/restore', { method: 'POST', body: JSON.stringify({ ts }) }, T).then(j);
  const live = (y) => y.body.marks.filter((m) => !m.del).length;
  const yesterday = async () => { const c = await (await bucket.get('marks/' + pid + '.json')).json(); c.snap = '2000-01-01'; await bucket.put('marks/' + pid + '.json', JSON.stringify(c)); return c; };
  let y = await put([mk(1, 1000), mk(2, 1000), mk(3, 1000)]);
  ok(y.body.tag && y.body.snap === kday, 'saving marks returns their version');
  ok((await hist()).length === 0, 'a paper\'s first marks leave nothing to keep');
  await put([mk(4, 1100)]);
  ok((await hist()).length === 0, 'more changes on the same day keep nothing more');
  const before = await yesterday();
  let tags = (await j(await call('/marks', {}, T))).body.tags;
  ok(tags[pid] === (await bucket.head('marks/' + pid + '.json')).etag && (await j(await call('/marks/' + pid, {}, T))).body.tag === tags[pid], 'one listing gives every paper\'s marks version, the same one a paper\'s marks come with');
  y = await put([1, 2, 3, 4].map((i) => ({ id: 'm' + i, del: true, t: 5000 })));
  ok(live(y) === 0, 'all four marks cleared (the day\'s first change)');
  let h = await hist();
  ok(h.length === 1 && h[0].n === 4 && h[0].updated === before.updated, 'how it was before the clearing is kept: 4 marks');
  tags = (await j(await call('/marks', {}, T))).body.tags;
  ok(tags[pid] === (await bucket.head('marks/' + pid + '.json')).etag, 'the listing follows the change');
  y = await restore(h[0].ts);
  ok(y.status === 200 && live(y) === 4 && y.body.tag, 'brought back: 4 marks');
  y = await put([1, 2, 3, 4].map((i) => ({ id: 'm' + i, del: true, t: 5000 })), T2);
  ok(live(y) === 4, 'another device\'s older copy (still cleared) cannot undo it');
  await put([mk(5, Date.now())]);
  y = await restore(h[0].ts);
  ok(live(y) === 4 && y.body.marks.find((m) => m.id === 'm5').del, 'bringing back the same version again takes away the mark added since');
  h = await hist();
  ok(h.length === 2 && h[0].n === 5, 'what was there before a restore is kept too (5 marks)');
  y = await restore(h[0].ts);
  ok(live(y) === 5, 'so a restore can itself be undone');
  ok((await restore(12345)).status === 404 && (await j(await call('/marks/' + pid + '/restore', { method: 'POST', body: '{}' }, T))).status === 400, 'unknown or missing version refused');
  const oldKey = 'backup/marks/' + pid + '/' + (Date.now() - 61 * 86400e3) + '.json';
  await bucket.put(oldKey, '{"marks":[]}', { customMetadata: { updated: '1', n: '1' } });
  await yesterday(); await put([mk(6, Date.now())]);
  ok(!(await bucket.head(oldKey)), 'kept versions older than 60 days are let go');
  // the library: kept as it was before the day's first change
  const ix = await (await bucket.get('lib/index.json')).json(); ix.snap = '2000-01-01'; await bucket.put('lib/index.json', JSON.stringify(ix));
  await ops([{ op: 'addFolder', folder: { id: 'f_eeeeeeeeee', name: '백업', parent: null } }]);
  const kept = await bucket.get('backup/lib/' + kday + '.json');
  ok(kept && !(await kept.json()).folders.some((f) => f.id === 'f_eeeeeeeeee'), 'the library is kept as it was before the day\'s first change');
  const e1 = (await bucket.head('backup/lib/' + kday + '.json')).etag;
  await ops([{ op: 'addFolder', folder: { id: 'f_ffffffffff', name: '백업2', parent: null } }]);
  ok((await bucket.head('backup/lib/' + kday + '.json')).etag === e1, 'later changes that day leave it alone');
  await bucket.put('backup/lib/2000-01-01.json', '{}');
  const ix2 = await (await bucket.get('lib/index.json')).json(); ix2.snap = '2000-01-02'; await bucket.put('lib/index.json', JSON.stringify(ix2));
  await ops([{ op: 'trashFolder', id: 'f_ffffffffff' }]);
  ok(!(await bucket.head('backup/lib/2000-01-01.json')), 'kept libraries older than 60 days are let go');
  // a paper gone for good takes its kept versions with it
  await ops([{ op: 'trashFile', id: pid }, { op: 'emptyTrash' }]);
  await new Promise((r2) => setTimeout(r2, 150));
  ok((await bucket.list({ prefix: 'backup/marks/' + pid + '/' })).objects.length === 0, 'emptying the trash also lets go of the paper\'s kept marks');
}
{ // the trash keeps a paper for 7 days, then lets it go at the next change
  const id7 = hex(Buffer.from('seven days'));
  x = await ops([{ op: 'addFile', file: { id: id7, name: '지난 논문.pdf', folder: null, size: 10 } }, { op: 'trashFile', id: id7 }]);
  const age = async (days) => { const ix = await (await bucket.get('lib/index.json')).json(); ix.files.find((f) => f.id === id7).trashed = Date.now() - days * 86400e3; await bucket.put('lib/index.json', JSON.stringify(ix)); };
  await age(6.5);
  x = await ops([{ op: 'addFolder', folder: { id: 'f_cccccccccc', name: '빈 폴더', parent: null } }]);
  ok(x.body.index.files.some((f) => f.id === id7 && f.trashed), 'still in the trash after 6.5 days');
  await age(7.2);
  x = await ops([{ op: 'renameFolder', id: 'f_cccccccccc', name: '빈 폴더 2' }]);
  ok(!x.body.index.files.some((f) => f.id === id7), 'gone from the trash after 7 days');
}
ok((await j(await call('/lib', {}, T))).body.files.every((f) => f.id !== id), 'file gone from the library');

{ // KCI's own Open API (논문 검색), stood in for here: the key is only ours, never the caller's; KCI writes it back into its
  // answer (inputData), which never reaches the device; a refusal (200 with resultMsg) is told as kci_refused and never kept
  const realFetch = globalThis.fetch, asked = [];
  const rec = (id, t) => `<record><journalInfo><journal-name>공법연구</journal-name><publisher-name>한국공법학회</publisher-name><pub-year>2021</pub-year><pub-mon>03</pub-mon><volume>49</volume><issue>3</issue></journalInfo><articleInfo article-id="${id}"><title-group><article-title lang="original"><![CDATA[${t}]]></article-title></title-group><author-group><author>홍길동(한국대학교)</author></author-group><abstract-group><abstract lang="original"><![CDATA[초록 & 본문]]></abstract></abstract-group><fpage>1</fpage><lpage>30</lpage><orte-open-yn>N</orte-open-yn><citation-count kci="3" wos="0">3</citation-count><url><![CDATA[https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=${id}]]></url></articleInfo></record>`;
  globalThis.fetch = async (input, init) => {
    const u = String(typeof input === 'string' ? input : input.url);
    if (!u.startsWith('https://open.kci.go.kr/po/openapi/openApiSearch.kci')) return realFetch(input, init);
    const q = new URL(u).searchParams; asked.push(q);
    const echo = `<inputData><key>${q.get('key')}</key><apiCode>${q.get('apiCode')}</apiCode><title><![CDATA[${q.get('title') || ''}]]></title><page>${q.get('page') || ''}</page><displayCount>${q.get('displayCount') || ''}</displayCount></inputData>`;
    const body = q.get('key') !== 'kci-test-key0001'
      ? `<?xml version="1.0" encoding="UTF-8"?><MetaData>${echo}<outputData><result><resultMsg>등록되지 않은 key 입니다.</resultMsg></result></outputData></MetaData>`
      : `<?xml version="1.0" encoding="UTF-8"?><MetaData>${echo}<outputData><result><total>2</total></result>${rec('ART002000001', '관습헌법의 법리')}${rec('ART002000002', '관습헌법과 수도')}</outputData></MetaData>`;
    return new Response(body, { headers: { 'content-type': 'text/xml;charset=UTF-8' } });
  };
  const kq = (qs, t = T) => call('/kci/search?' + qs, {}, t);
  let r = await kq('title=' + encodeURIComponent('관습헌법'));
  ok(r.status === 503 && (await r.json()).error === 'no_key' && asked.length === 0, 'KCI search with no key set: no_key, and KCI is not asked');
  ok((await kq('title=x', null)).status === 401, 'KCI search needs a signed-in device');
  env.KCI_KEY = ' "kci-test-key0001" ';   // as pasted, with the quotes and spaces a paste brings along
  r = await kq('title=' + encodeURIComponent('관습헌법') + '&displayCount=20');
  let text = await r.text();
  ok(r.status === 200 && /xml/.test(r.headers.get('content-type') || '') && (text.match(/<record>/g) || []).length === 2 && text.includes('관습헌법의 법리'), 'KCI search: the records come through as KCI wrote them');
  ok(!text.includes('kci-test-key0001') && !/<inputData/.test(text), 'the key KCI writes back (inputData) never reaches the device');
  ok(asked[0].get('key') === 'kci-test-key0001' && asked[0].get('apiCode') === 'articleSearch' && asked[0].get('title') === '관습헌법' && asked[0].get('displayCount') === '20', 'asked with the owner\'s key (quotes and spaces off) for articleSearch');
  r = await kq('title=' + encodeURIComponent('관습헌법') + '&displayCount=20');
  ok(r.status === 200 && asked.length === 1, 'a good answer is kept: the same question again is not asked of KCI');
  asked.length = 0;
  r = await kq('title=' + encodeURIComponent('헌법') + '&key=evil&apiCode=citation&abstract=x&regDateFrom=20200101&sortNm=bogus&sortDir=up&displayCount=500&page=-3&dateFrom=202001&dateTo=2020&journal=' + encodeURIComponent('공법연구') + '&callback=x');
  const w = asked[0];
  ok(r.status === 200 && w && w.get('key') === 'kci-test-key0001' && w.get('apiCode') === 'articleSearch' && w.get('journal') === '공법연구' && w.get('dateFrom') === '202001', 'KCI search: the parameters KCI takes are passed on');
  ok(w && !w.has('abstract') && !w.has('regDateFrom') && !w.has('callback') && !w.has('sortNm') && !w.has('sortDir') && !w.has('dateTo') && w.get('displayCount') === '100' && w.get('page') === '1', 'and nothing else: the caller\'s key and question kind, unknown or bad parameters are dropped; displayCount at most 100');
  ok((await kq('journal=' + encodeURIComponent('공법연구'))).status === 400 && asked.length === 1, 'no title, keyword or author: refused here, KCI is not asked');
  r = await kq('author=' + encodeURIComponent('홍길동') + '&sortNm=pubiYr&sortDir=desc');
  ok(r.status === 200 && asked.length === 2 && asked[1].get('author') === '홍길동' && !asked[1].has('title') && asked[1].get('sortNm') === 'pubiYr', 'a person\'s papers: asked of KCI by the author alone (the app stops asking that way if KCI will not take it)');
  asked.length = 0;
  r = await kq('id=ART002000001');
  ok(r.status === 200 && asked[0] && asked[0].get('apiCode') === 'articleDetail' && asked[0].get('id') === 'ART002000001' && !asked[0].has('title'), 'one paper whole: articleDetail by its id');
  ok((await kq('id=' + encodeURIComponent('../x'))).status === 400 && asked.length === 1, 'a bad id is refused');
  env.KCI_KEY = 'wrong-kci-key-7';   // (e.g. the data.go.kr key pasted in its place)
  asked.length = 0;
  for (let i = 0; i < 2; i++) {
    r = await kq('title=' + encodeURIComponent('관습헌법') + '&displayCount=20');
    text = await r.text();
    ok(r.status === 502 && JSON.parse(text).error === 'kci_refused' && JSON.parse(text).msg === '등록되지 않은 key 입니다.' && !text.includes('wrong-kci-key-7'), `KCI's refusal is told as kci_refused, with its words and without the key (${i ? 'again' : 'first'})`);
  }
  ok(asked.length === 2, 'a refusal is never kept: asked again, KCI is asked again');
  delete env.KCI_KEY;
  globalThis.fetch = realFetch;
}

{ // 글쓰기 도우미: Anthropic's Messages API stood in for here (never the real one). Its stream comes in pieces cut anywhere
  // (across events and inside a Hangul letter's bytes); the key is the server's only; the model's thinking stays there
  const realFetch = globalThis.fetch, asked = [], plan = [];
  const KEY = 'sk-ant-test-key-0001';
  const sse = (evs) => evs.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');
  const stream = (s, cut = 37) => { const b = Buffer.from(s); return new ReadableStream({ start(c) { for (let i = 0; i < b.length; i += cut) c.enqueue(new Uint8Array(b.subarray(i, i + cut))); c.close(); } }); };
  // a whole answer as Anthropic streams it: message_start, a thinking block (empty, as it comes when its display is omitted)
  // with its signature, a ping, the text in pieces, then how it stopped
  const answer = (model, text, stop = 'end_turn', extra = []) => sse([
    ['message_start', { type: 'message_start', message: { id: 'msg_t', type: 'message', role: 'assistant', model, content: [], stop_reason: null, usage: { input_tokens: 1200, cache_creation_input_tokens: 0, cache_read_input_tokens: 2400, output_tokens: 1 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } }],
    ['ping', { type: 'ping' }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'SIGNATURE-STAYS-HERE' } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ...(text ? [['content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }],
      ...(text.match(/[\s\S]{1,9}/g) || []).map((t) => ['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: t } }]),
      ['content_block_stop', { type: 'content_block_stop', index: 1 }]] : []),
    ...extra,
    ...(stop ? [['message_delta', { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null, ...(stop === 'refusal' ? { stop_details: { category: 'cyber' } } : {}) }, usage: { output_tokens: 321 } }], ['message_stop', { type: 'message_stop' }]] : []),
  ]);
  const ok200 = (model, text, stop, extra) => () => new Response(stream(answer(model, text, stop, extra)), { headers: { 'content-type': 'text/event-stream' } });
  const fail = (status, type, message = '', headers = {}) => () => new Response(JSON.stringify({ type: 'error', error: { type, message } }), { status, headers: { 'content-type': 'application/json', ...headers } });
  globalThis.fetch = async (input, init) => {
    const u = String(typeof input === 'string' ? input : input.url);
    if (!u.startsWith('https://api.anthropic.com/')) return realFetch(input, init);
    asked.push({ url: u, headers: new Headers(init.headers), body: JSON.parse(init.body) });
    const next = plan.shift();
    return next ? next() : fail(500, 'api_error', 'no plan')();
  };
  const events = (text) => text.split('\n\n').filter((b) => /^event: /m.test(b)).map((b) => ({ ev: /^event: (.*)$/m.exec(b)[1], d: JSON.parse(/^data: (.*)$/m.exec(b)[1]) }));
  const shelf = (es) => es.filter((e) => e.ev === 'shelf').map((e) => e.d);
  const written = (es) => es.filter((e) => e.ev === 'delta').map((e) => e.d.delta.text).join('');
  const write = async (body, t = T) => { const r = await call('/write', { method: 'POST', body: JSON.stringify(body) }, t); return { status: r.status, type: r.headers.get('content-type') || '', text: await r.text() }; };
  const used = async () => (await j(await call('/write', {}, T))).body.used;
  const SAMPLE = '이 조항은 선거의 공정을 해치는 행위를 막기 위한 것이다. 그러나 그 범위가 넓어 표현의 자유를 지나치게 제한할 우려가 있다(헌재 2004. 10. 21. 2004헌마554등 결정; 대법원 2006. 3. 16. 선고 2006두330 판결).12)';
  const GOOD = '이 조항은 선거의 공정을 해치는 행위를 막으려는 것이다. 그러나 그 범위가 넓어 표현의 자유를 지나치게 제한할 우려가 있다(헌재 2004. 10. 21. 2004헌마554등 결정; 대법원 2006. 3. 16. 선고 2006두330 판결).12) [근거 필요: 제한의 정도를 보여 주는 자료]';

  // no key on the server: no_key, and Anthropic is not asked
  let x = await j(await call('/write', {}, T));
  ok(x.status === 200 && x.body.key === false && x.body.cap === 150 && x.body.max === 600000 && x.body.used === 0 && x.body.style === null && x.body.models[0].id === 'claude-fable-5-2' && x.body.models[1].id === 'claude-opus-5-5', '글쓰기 info: no key, the models (Fable 5.2, then Opus 5.5), cap 150, 12,000 letters, nothing used');
  let w = await write({ action: 'polish', text: SAMPLE });
  ok(w.status === 503 && JSON.parse(w.text).error === 'no_key' && asked.length === 0, 'no key: 503 no_key, and Anthropic is never asked');
  ok((await call('/write', { method: 'POST', body: JSON.stringify({ action: 'polish', text: SAMPLE }) })).status === 401, '글쓰기 needs a signed-in device');

  env.ANTHROPIC_API_KEY = KEY;
  // a good answer, streamed on
  plan.push(ok200('claude-fable-5-2', GOOD));
  w = await write({ action: 'polish', text: SAMPLE });
  let es = events(w.text), sh = shelf(es);
  ok(w.status === 200 && /text\/event-stream/.test(w.type), 'polish: 200, server-sent events');
  ok(sh[0].type === 'start' && sh[0].model.id === 'claude-fable-5-2' && sh[0].used === 1 && sh[0].cap === 150, 'start: Fable first, today\'s count 1 of 150');
  ok(written(es) === GOOD, 'the text arrives whole, piece by piece (cut across events and letters on the way)');
  const done = sh[sh.length - 1];
  ok(done.type === 'done' && done.model.id === 'claude-fable-5-2' && done.stop === 'end_turn' && done.usage.output_tokens === 321 && done.usage.cache_read_input_tokens === 2400, 'done: model, stop reason and usage (cache reads included)');
  ok(!w.text.includes('SIGNATURE-STAYS-HERE') && !w.text.includes('thinking_delta') && !w.text.includes(KEY), 'the thinking and its signature stay on the server; the key is never in the answer');
  ok(/^: ping$/m.test(w.text), 'Anthropic\'s ping passed on as a comment (keeps the connection awake)');
  let q = asked[0];
  ok(asked.length === 1 && q.url === 'https://api.anthropic.com/v1/messages' && q.headers.get('x-api-key') === KEY && q.headers.get('anthropic-version') === '2026-10-21' && /^0128-bookshelf\//.test(q.headers.get('user-agent')), 'asked of the Messages API with the key, the API version and the shelf\'s own user agent');
  ok(q.body.model === 'claude-fable-5-2' && q.body.stream === true && q.body.output_config.effort === 'high' && q.body.max_tokens >= 32000, 'model claude-fable-5-2, streamed, effort high, room for thinking and answer');
  ok(!('thinking' in q.body) && !('temperature' in q.body) && !('top_p' in q.body) && !('top_k' in q.body) && q.body.messages.length === 1 && q.body.messages[0].role === 'user', 'no thinking settings, no sampling parameters, no prefill (one user turn)');
  ok(q.body.system.length === 1 && q.body.system[0].cache_control && q.body.system[0].cache_control.type === 'ephemeral' && /사건번호/.test(q.body.system[0].text), 'no style yet: the rules alone, marked for the cache');
  ok(q.body.messages[0].content.startsWith('<글>\n' + SAMPLE + '\n</글>') && /글쓴이의 문체로 다듬어/.test(q.body.messages[0].content) && /아직 <글쓴이의 문체>가 없습니다/.test(q.body.messages[0].content), 'the text first, then the request (and that no style is learned yet)');
  ok(await used() === 1, 'counted: 1 today');

  // refusal mid-answer → the same request on Opus 5.5; the part already sent is to be thrown away (the fallback event says so)
  asked.length = 0;
  plan.push(ok200('claude-fable-5-2', '이 조항은 선거의', 'refusal'), ok200('claude-opus-5-5', GOOD));
  w = await write({ action: 'concise', text: SAMPLE });
  es = events(w.text); sh = shelf(es);
  const fb = sh.find((d) => d.type === 'fallback');
  ok(fb && fb.why === 'refusal' && fb.from.id === 'claude-fable-5-2' && fb.to.id === 'claude-opus-5-5', 'refusal: a fallback event, Fable → Opus 5.5');
  const after = es.slice(es.findIndex((e) => e.ev === 'shelf' && e.d.type === 'fallback') + 1);
  ok(written(after) === GOOD && sh[sh.length - 1].type === 'done' && sh[sh.length - 1].model.id === 'claude-opus-5-5', 'Opus 5.5 answers in full after it');
  ok(asked.length === 2 && asked[1].body.model === 'claude-opus-5-5' && JSON.stringify({ ...asked[1].body, model: '' }) === JSON.stringify({ ...asked[0].body, model: '' }), 'the same request, only the model changed');
  ok(asked[0].body.output_config.effort === 'high' && /간결하게/.test(asked[0].body.messages[0].content), 'concise: its own request');
  ok(await used() === 2, 'one request counted once');

  // refused before any text, and by both
  asked.length = 0;
  plan.push(ok200('claude-fable-5-2', '', 'refusal'), ok200('claude-opus-5-5', '', 'refusal'));
  w = await write({ action: 'logic', text: SAMPLE });
  sh = shelf(events(w.text));
  ok(sh.some((d) => d.type === 'fallback') && sh[sh.length - 1].type === 'error' && sh[sh.length - 1].code === 'refused' && asked.length === 2, 'both refuse: error refused');
  ok(asked[0].body.output_config.effort === 'high' && /의견만/.test(asked[0].body.messages[0].content), 'logic: opinions only');

  // rate-limited: one wait (as long as Anthropic says, at least 2 s), one more try, then a plain error with the wait; not counted
  asked.length = 0;
  const before = await used();
  plan.push(fail(429, 'rate_limited', 'Number of request tokens has exceeded your per-minute rate limit', { 'retry-after': '1' }), fail(429, 'rate_limited', 'again', { 'retry-after': '40' }));
  let t0 = Date.now();
  w = await write({ action: 'proof', text: SAMPLE });
  sh = shelf(events(w.text));
  const wt = sh.find((d) => d.type === 'wait');
  ok(wt && wt.why === 'rate' && wt.sec === 2 && Date.now() - t0 >= 1900, '429: told to wait 2 s, waited, asked once more');
  ok(sh[sh.length - 1].type === 'error' && sh[sh.length - 1].code === 'rate_limited' && sh[sh.length - 1].sec === 40 && asked.length === 2, '429 again: error rate_limited with Anthropic\'s wait (40 s); not a third try, not the other model');
  ok(await used() === before, 'a request that got no answer is given back to the day');
  ok(asked[0].body.output_config.effort === 'medium' && /맞춤법/.test(asked[0].body.messages[0].content), 'proof: medium effort');

  // overloaded once: the second try answers
  asked.length = 0;
  plan.push(fail(529, 'overloaded_error', 'Overloaded'), ok200('claude-fable-5-2', GOOD));
  w = await write({ action: 'polish', text: SAMPLE });
  sh = shelf(events(w.text));
  ok(sh.some((d) => d.type === 'wait' && d.why === 'busy') && sh[sh.length - 1].type === 'done' && sh[sh.length - 1].model.id === 'claude-fable-5-2' && asked.length === 2, '529 then 200: one wait, then Fable\'s answer');
  // overloaded twice: Opus 5.5 instead (Fable cannot be had now)
  asked.length = 0;
  plan.push(fail(529, 'overloaded_error', 'Overloaded'), fail(529, 'overloaded_error', 'Overloaded'), ok200('claude-opus-5-5', GOOD));
  w = await write({ action: 'polish', text: SAMPLE });
  sh = shelf(events(w.text));
  ok(sh.some((d) => d.type === 'fallback' && d.why === 'unavailable') && sh[sh.length - 1].type === 'done' && sh[sh.length - 1].model.id === 'claude-opus-5-5' && asked.map((a) => a.body.model).join() === 'claude-fable-5-2,claude-fable-5-2,claude-opus-5-5', '529 twice: Opus 5.5 answers');
  // a model the key may not use: straight to the next, no waiting
  asked.length = 0;
  plan.push(fail(404, 'not_found_error', 'model: claude-fable-5-2'), ok200('claude-opus-5-5', GOOD));
  t0 = Date.now();
  w = await write({ action: 'english', text: SAMPLE });
  sh = shelf(events(w.text));
  ok(sh.some((d) => d.type === 'fallback' && d.why === 'unavailable') && sh[sh.length - 1].type === 'done' && asked.length === 2 && Date.now() - t0 < 1500, '404 (model not offered to the key): Opus 5.5 at once');
  ok(/영어 초록/.test(asked[0].body.messages[0].content) && /2004Hun-Ma554/.test(asked[0].body.messages[0].content), 'english: an academic abstract, case numbers in the courts\' English form');
  // overloaded in the middle of the stream after some text: the part is kept, a plain error
  plan.push(ok200('claude-fable-5-2', '이 조항은', '', [['error', { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }]]));
  w = await write({ action: 'polish', text: SAMPLE });
  sh = shelf(events(w.text));
  ok(sh[sh.length - 1].type === 'error' && sh[sh.length - 1].code === 'overloaded' && sh[sh.length - 1].partial === true, 'overloaded mid-answer: error overloaded, the part so far marked partial');
  // the key refused: no retry, no other model, a plain error that never repeats the key
  asked.length = 0;
  const n0 = await used();
  plan.push(fail(401, 'authentication_error', 'invalid x-api-key ' + KEY));
  w = await write({ action: 'polish', text: SAMPLE });
  sh = shelf(events(w.text));
  ok(sh[sh.length - 1].code === 'bad_key' && asked.length === 1 && !w.text.includes(KEY) && await used() === n0, '401: bad_key at once; the key never in the answer; not counted');
  // the owner's own limit on the Anthropic account (the server sets none): said as such, not as some other failure
  asked.length = 0;
  plan.push(fail(400, 'invalid_request_error', 'You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.'));
  w = await write({ action: 'polish', text: SAMPLE });
  sh = shelf(events(w.text));
  ok(sh[sh.length - 1].code === 'billing' && asked.length === 1, "the account's usage limit reached: billing (the app says the limit set on the Anthropic account was reached)");
  plan.push(fail(400, 'invalid_request_error', 'something about ' + KEY + ' was wrong'));
  w = await write({ action: 'polish', text: SAMPLE });
  sh = shelf(events(w.text));
  ok(sh[sh.length - 1].code === 'bad_request' && /something about/.test(sh[sh.length - 1].message) && !w.text.includes(KEY), 'any word passed on from Anthropic has the key taken out');

  // the limits, before anything goes out
  asked.length = 0;
  w = await write({ action: 'polish', text: '가'.repeat(600001) });
  ok(w.status === 413 && JSON.parse(w.text).error === 'too_long' && JSON.parse(w.text).max === 600000 && JSON.parse(w.text).got === 600001 && asked.length === 0, 'over 600,000 letters: 413 too_long (max, got); Anthropic not asked');
  plan.push(ok200('claude-fable-5-2', '가'));
  w = await write({ action: 'proof', text: '가'.repeat(150000) });
  ok(w.status === 200 && asked.length === 1, 'a whole paper (150,000 Hangul letters, 450,000 bytes) goes in one request');
  ok(asked[0].body.max_tokens === 128000, 'room for a whole paper\'s answer: max_tokens 128000');
  // an answer longer than one reply: the app sends what was written so far, and the request carries on from there
  asked.length = 0; plan.push(ok200('claude-fable-5-2', '나머지'));
  w = await write({ action: 'polish', text: SAMPLE, sofar: '앞부분' });
  const ms = asked[0] && asked[0].body.messages;
  ok(w.status === 200 && ms && ms.length === 3 && ms[1].role === 'assistant' && ms[1].content === '앞부분' && ms[2].role === 'user' && /끊긴 바로 다음부터/.test(ms[2].content), 'carried on: the text, what was written so far, then 이어서 써 주세요');
  // 내 글쓰기 원칙: kept for every device and put into every request
  x = await j(await call('/write/principles', {}, T));
  ok(x.status === 200 && x.body.text === '', 'no principles yet');
  x = await j(await call('/write/principles', { method: 'PUT', body: JSON.stringify({ text: '# 독자\n독자는 법학교수와 변호사다.' }) }, T));
  ok(x.status === 200 && /법학교수/.test(x.body.text) && x.body.at > 0, 'principles kept');
  asked.length = 0; plan.push(ok200('claude-fable-5-2', GOOD));
  await write({ action: 'logic', text: SAMPLE });
  const sys = asked[0] && asked[0].body.system;
  ok(sys && sys.some((b) => /<글쓴이의 글쓰기 원칙>[\s\S]*법학교수/.test(b.text)) && sys[sys.length - 1].cache_control, 'the principles go into the system prompt (cached with the rules)');
  ok(/논리적 흐름과 일관성/.test(asked[0].body.messages[0].content) && /글쓰기 원칙>이 있으면 항목마다/.test(asked[0].body.messages[0].content), '논리·일관성 점검 asks for flow, consistency and the principles item by item');
  x = await j(await call('/write', {}, T));
  ok(x.body.principles && x.body.principles.size > 0, 'info says principles are set');
  x = await j(await call('/write/principles', { method: 'PUT', body: JSON.stringify({ text: '' }) }, T));
  ok(x.status === 200 && x.body.text === '' && !(await bucket.head('write/principles.json')), 'an empty text takes them away');
  ok((await write({ action: 'translate', text: SAMPLE })).status === 400 && (await write({ action: 'polish', text: '   ' })).status === 400, 'an unknown request or an empty text: 400');
  const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  await bucket.put('write/use.json', JSON.stringify({ day, n: 150 }));
  asked.length = 0;
  w = await write({ action: 'polish', text: SAMPLE });
  let e = JSON.parse(w.text);
  ok(w.status === 429 && e.error === 'daily_cap' && e.cap === 150 && e.used === 150 && e.reset > Date.now() && e.reset - Date.now() <= 86400e3 && asked.length === 0, 'the day\'s 150 used: 429 daily_cap (with when it opens again); Anthropic not asked');
  await bucket.put('write/use.json', JSON.stringify({ day: '2000-01-01', n: 150 }));
  ok(await used() === 0, 'a new day starts from 0');

  // 내 문체 익히기: paragraphs in, the style described, kept, and set before every later request
  const PROFILE = '1. 문장: 문장은 대체로 60~90자 안팎이다. "이에 따라 정부는" 같은 연결로 시작한다.\n2. 종결 표현: "-ㄹ 필요가 있다", "-라고 할 것이다"가 잦다.\n'.repeat(4);
  const paras = Array.from({ length: 6 }, (_, i) => ({ text: `${i + 1}번째 문단이다. ` + '이러한 문제를 개선하기 위해서는 본 법이 형벌체계상의 정당성과 균형을 잃었는지 여부를 검토해볼 필요가 있다. '.repeat(3), part: ['서론', '본론', '결론'][i % 3], paper: 1 + (i % 3) }));
  ok((await write({ action: 'profile', paragraphs: paras.slice(0, 4) })).status === 400, 'fewer than 5 paragraphs: refused');
  asked.length = 0;
  plan.push(ok200('claude-fable-5-2', PROFILE));
  w = await write({ action: 'profile', paragraphs: paras, sources: [{ title: '우리나라 중대재해처벌 관련 법제의 개선방안 연구', n: 2 }] });
  sh = shelf(events(w.text));
  const pd = sh[sh.length - 1];
  ok(pd.type === 'done' && pd.style && pd.style.papers === 3 && pd.style.paragraphs === 6 && pd.style.at > 0, 'profile: done, and the style kept (3 papers, 6 paragraphs)');
  q = asked[0].body;
  ok(q.system.length === 1 && /문체를 분석하는/.test(q.system[0].text) && /<문단 번호="1" 논문="1" 부분="서론">/.test(q.messages[0].content) && /종결 표현/.test(q.messages[0].content) && !/중대재해처벌 관련 법제/.test(JSON.stringify(q)), 'the paragraphs with their paper\'s number and part, then the request; no titles go out');
  x = await j(await call('/write/style', {}, T));
  ok(x.status === 200 && x.body.text === PROFILE && x.body.sources[0].title === '우리나라 중대재해처벌 관련 법제의 개선방안 연구', 'the style can be read back whole (for the owner to read), with the papers it came from');
  x = await j(await call('/write', {}, T));
  ok(x.body.style && x.body.style.paragraphs === 6 && x.body.style.papers === 3, 'info: when and from what the style was learned');
  asked.length = 0;
  plan.push(ok200('claude-fable-5-2', GOOD));
  await write({ action: 'polish', text: SAMPLE });
  q = asked[0].body;
  ok(q.system.length === 2 && !q.system[0].cache_control && q.system[1].cache_control && q.system[1].text.includes(PROFILE) && q.system[1].text.startsWith('<글쓴이의 문체>'), 'every later request: the rules, then the style — marked for the cache (prompt caching)');
  ok(!/아직 <글쓴이의 문체>가 없습니다/.test(q.messages[0].content), 'and no longer says there is no style');
  // a profile cut short is not kept
  plan.push(ok200('claude-fable-5-2', '짧은 정리', 'max_tokens'));
  w = await write({ action: 'profile', paragraphs: paras });
  x = await j(await call('/write/style', {}, T));
  ok(shelf(events(w.text)).pop().stop === 'max_tokens' && x.body.text === PROFILE, 'a style cut short (max_tokens) does not replace the one kept');

  // the day's budget: each answer's cost (from its usage, at its model's price) is added; once spent, nothing more goes
  await bucket.put('write/use.json', JSON.stringify({ day, n: 3, usd: 1 }));
  plan.push(ok200('claude-fable-5-2', GOOD));
  w = await write({ action: 'polish', text: SAMPLE });
  let dn = shelf(events(w.text)).pop();
  const fableCost = (1200 * 10 + 2400 * 0.25 + 321 * 50) / 1e6;   // input, cache reads, output at Fable's price
  let usej = await (await bucket.get('write/use.json')).json();
  ok(dn.type === 'done' && Math.abs(usej.usd - (1 + fableCost)) < 1e-4 && dn.spent === Math.round((1 + fableCost) * 100) / 100 && dn.budget === 40, `an answer's cost is added to the day (${usej.usd} USD), and the app is told`);
  plan.push(ok200('claude-fable-5-2', '이 조항은', 'refusal'), ok200('claude-opus-5-5', GOOD));
  await write({ action: 'polish', text: SAMPLE });
  usej = await (await bucket.get('write/use.json')).json();
  const opusCost = (1200 * 4 + 2400 * 0.2 + 321 * 20) / 1e6;
  ok(Math.abs(usej.usd - (1 + 2 * fableCost + opusCost)) < 1e-4, 'a refused answer is billed too: both models\' costs are added');
  x = await j(await call('/write', {}, T));
  ok(x.body.budget === 40 && Math.abs(x.body.spent - usej.usd) < 1e-9, 'info: the day\'s budget and what is spent');
  await bucket.put('write/use.json', JSON.stringify({ day, n: 10, usd: 40.01 }));
  asked.length = 0;
  w = await write({ action: 'polish', text: SAMPLE });
  e = JSON.parse(w.text);
  ok(w.status === 429 && e.error === 'daily_budget' && e.budget === 40 && e.spent === 40.01 && e.reset > Date.now() && asked.length === 0, 'the day\'s budget spent: 429 daily_budget (with when it opens again); Anthropic not asked');
  await bucket.put('write/use.json', JSON.stringify({ day, n: 10, usd: 0 }));
  // the deployed worker has no day's limits (the owner keeps the spending limit on the Anthropic account): none set, none applied
  const capsWere = [env.WRITE_DAY_CAP, env.WRITE_DAY_USD]; delete env.WRITE_DAY_CAP; delete env.WRITE_DAY_USD;
  await bucket.put('write/use.json', JSON.stringify({ day, n: 500, usd: 999 }));
  x = await j(await call('/write', {}, T));
  ok(x.body.cap === null && x.body.budget === null && x.body.used === 500, 'no caps set: info says none (cap and budget null), the day is still counted');
  asked.length = 0; plan.push(ok200('claude-fable-5-2', GOOD));
  w = await write({ action: 'polish', text: SAMPLE });
  ok(w.status === 200 && asked.length === 1 && shelf(events(w.text))[0].cap === null, 'no caps set: past 500 requests and $999 the request still goes to Anthropic');
  [env.WRITE_DAY_CAP, env.WRITE_DAY_USD] = capsWere;
  await bucket.put('write/use.json', JSON.stringify({ day, n: 10, usd: 0 }));

  // the latest answer kept for an app that lost the connection: the events as streamed, fetched by the app's id
  plan.push(ok200('claude-fable-5-2', GOOD));
  w = await write({ action: 'proof', text: SAMPLE, id: 'abc123xyz' });
  x = await j(await call('/write/last?id=abc123xyz', {}, T));
  ok(x.status === 200 && x.body.state === 'done' && x.body.act === 'proof' && written(events(x.body.sse)) === GOOD && shelf(events(x.body.sse)).pop().type === 'done' && !/ping/.test(x.body.sse), 'write/last: the answer kept whole, as it was streamed (done event included, pings left out)');
  ok((await call('/write/last?id=other12345', {}, T)).status === 404 && (await call('/write/last?id=abc123xyz')).status === 401, 'another id: 404 (only the latest is kept); signed-in devices only');
  ok(!JSON.stringify(x.body).includes(KEY) && !x.body.sse.includes('SIGNATURE-STAYS-HERE'), 'nothing kept that the app would not have seen');

  // the app goes away mid-answer (reload, a locked phone): with an id the answer is read to the end and kept; stopped
  // on purpose (멈추기) or with no id, Anthropic's stream is let go
  const { default: worker } = await import('./worker.js');
  const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
  const slowly = (s, gap, st) => { const b = Buffer.from(s); let i = 0; return new ReadableStream({ async pull(c) { if (i >= b.length) { st.end = true; c.close(); return; } await sleepMs(gap); c.enqueue(new Uint8Array(b.subarray(i, i + 100))); i += 100; }, cancel() { st.cancelled = true; } }); };
  const direct = async (body, st, text, readFor = 300) => {
    plan.push(() => new Response(slowly(answer('claude-fable-5-2', text), 60, st), { headers: { 'content-type': 'text/event-stream' } }));
    const pend = [];
    const res = await worker.fetch(new Request(BASE + '/write', { method: 'POST', body: JSON.stringify(body), headers: { origin: ORIGIN, authorization: 'Bearer ' + T, 'content-type': 'application/json' } }), env, { waitUntil: (p) => pend.push(p) });
    const rd = res.body.getReader(), t1 = Date.now();
    while (Date.now() - t1 < readFor) { const c = await rd.read(); if (c.done) break; }
    return { rd, pend };
  };
  const settleAll = async (pend) => { for (let k = 0; k < 20 && pend.length; k++) { const p = pend.splice(0); await Promise.allSettled(p); } };
  let st = {}, d1 = await direct({ action: 'polish', text: SAMPLE, id: 'gone0001' }, st, GOOD);
  await d1.rd.cancel();
  await settleAll(d1.pend);
  x = await j(await call('/write/last?id=gone0001', {}, T));
  ok(st.end && !st.cancelled && x.body.state === 'done' && written(events(x.body.sse)) === GOOD && shelf(events(x.body.sse)).pop().type === 'done', 'the app gone mid-answer: the answer is read to the end and kept for it');
  st = {}; d1 = await direct({ action: 'polish', text: SAMPLE, id: 'stop0001' }, st, GOOD.repeat(4));
  ok((await call('/write/stop', { method: 'POST', body: JSON.stringify({ id: 'stop0001' }) }, T)).status === 200, '멈추기: the stop is told to the server');
  await d1.rd.cancel();
  await settleAll(d1.pend);
  x = await j(await call('/write/last?id=stop0001', {}, T));
  ok(st.cancelled && !st.end && x.body.state === 'stopped', 'stopped on purpose: Anthropic\'s stream is let go (not billed further), kept as stopped');
  st = {}; d1 = await direct({ action: 'polish', text: SAMPLE }, st, GOOD.repeat(4));
  await d1.rd.cancel();
  await settleAll(d1.pend);
  ok(st.cancelled && !st.end, 'no id (an older app) and gone: let go at once, as before');
  ok((await call('/write/stop', { method: 'POST', body: JSON.stringify({ id: '../x' }) }, T)).status === 400, 'a stop needs a proper id');

  delete env.ANTHROPIC_API_KEY;
  globalThis.fetch = realFetch;
}

{ // 7차 b: 헌재 소식, 위헌·헌법불합치 법령, 국회입법조사처 발간물, 행정심판 재결례, and the cron (the daily check among it).
  // The services are played by fakeData (mock.mjs: real rows recorded 2026-11-26, more made up in their shape); nothing
  // outside is asked — every other address answers 503 here
  const realFetch = globalThis.fetch, asked = [], other = [];
  const fopts = { key: 'fake-data-key', asked, statLatest: '2026-10' };
  const fake = fakeData(fopts);
  let kciUp = false;   // (KCI's OAI answering, for the daily check)
  globalThis.fetch = (input, init) => {
    const u = String(typeof input === 'string' ? input : input.url);
    if (u.startsWith('http://127.0.0.1')) return realFetch(input, init);
    const f = fake(input, init);
    if (f) return f;
    other.push(u);
    if (kciUp && u.startsWith('https://open.kci.go.kr/oai/')) return Promise.resolve(new Response('<?xml version="1.0"?><OAI-PMH><Identify><repositoryName>KCI</repositoryName></Identify></OAI-PMH>', { headers: { 'content-type': 'text/xml' } }));
    return Promise.resolve(new Response('offline in test', { status: 503 }));
  };
  const get = async (path, t = T) => { const r = await call(path, {}, t); const text = await r.text(); let body = null; try { body = JSON.parse(text); } catch (e) { /* not JSON */ } return { status: r.status, body, text, cc: r.headers.get('cache-control') || '' }; };
  const enc = encodeURIComponent;

  // no key: the service is not asked
  let x = await get('/ccourt/recent');
  ok(x.status === 503 && x.body.error === 'no_key' && asked.length === 0, '헌재 소식 with no key: no_key, nothing asked');
  for (const p of ['/ccourt/recent', '/ccourt/unconst', '/nars/reports?q=x', '/acrc/index', '/acrc/body?no=202500966', '/diag/last']) ok((await get(p, null)).status === 401, `${p} needs a signed-in device`);
  env.DATA_GO_KR_KEY = 'fake-data-key';

  // 헌재 소식
  x = await get('/ccourt/schedule?year=2026&month=10');
  ok(x.status === 200 && x.body.year === 2026 && x.body.month === 10 && x.body.sentence.length === 1 && x.body.sentence[0].at === '202610221400' && x.body.sentence[0].date === '2026-10-22' && x.body.sentence[0].time === '14:00', '선고 일정 of a month: at, date, time');
  ok(x.body.discuss.length === 2 && x.body.discuss[0].at === '202610211500' && x.body.discuss[0].time === '15:00', '변론 일정 of the same month (the service\'s trailing spaces off), in order');
  ok(/private, max-age=/.test(x.cc), 'kept a little by the device too');
  let n = asked.length;
  x = await get('/ccourt/schedule?year=2026&month=10');
  ok(x.status === 200 && asked.length === n, 'asked again: kept at the edge, the service is not asked');
  ok(new URL(asked[0]).searchParams.get('month') === '10' && new URL(asked[0]).searchParams.get('type') === 'json', 'asked as JSON, the month two-digit');
  ok((await get('/ccourt/schedule?year=2026&month=13')).status === 400 && (await get('/ccourt/schedule?year=x&month=1')).status === 400, 'a bad month is refused');
  x = await get('/ccourt/day?at=202611261400');
  const d0 = x.body.items[0];
  ok(x.status === 200 && x.body.date === '2026-11-26' && x.body.items.length === 4 && d0.eventNo === '2023헌가21' && d0.result === '심리중' && d0.court === '부산고등법원' && d0.merged.join() === '2023헌가21,2025헌가10' && d0.changed === '2026-11-23', '그날 선고 목록: 사건번호, 사건명, 결과, 제청법원, 병합');
  ok(!('outline' in d0) && !('party' in d0) && x.body.items[2].court === undefined, 'empty fields are left out');
  ok((await get('/ccourt/day?at=2026112614')).status === 400, 'a bad time is refused');
  x = await get('/ccourt/recent');
  ok(x.status === 200 && x.body.total === 3288 && x.body.page === 1 && x.body.items[0].seq === '4268001' && x.body.items[0].date === '2026-10-22' && x.body.items[0].result === '합헌', '최근 주요 결정: seq, 사건, date, result');
  x = await get('/ccourt/outline?seq=4268001');
  ok(x.status === 200 && x.body.eventNo === '2022헌가28' && x.body.text.startsWith('마약류관리법 위반자의 택배서비스사업') && !/<p>|&nbsp;|&lsquo;/.test(x.body.text) && x.body.text.includes('‘화물자동차 운수사업법’ 제9조의2') && x.body.text.includes('\n□ 심판대상'), '결정 개요 as plain text: paragraphs a line, no HTML or entities');
  ok((await get('/ccourt/outline?seq=999')).status === 404 && (await get('/ccourt/outline?seq=x1')).status === 400, 'an unknown seq: 404; a bad one: 400');
  x = await get('/ccourt/hearings');
  ok(x.status === 200 && x.body.total === 287 && x.body.items[3].title === '경찰청장(조지호) 탄핵 (경찰청장에 대한 탄핵심판 사건)' && x.body.items[0].half === '2027/상반기' && x.body.items[0].date === '2027-01-14', '주요 변론 일정 (spaces in names made one)');
  x = await get('/ccourt/hearing?eventNo=' + enc('2026헌마1630'));
  ok(x.status === 200 && x.body.items[0].files[0].name === '변론사건_개요(2026헌마1630).pdf' && x.body.items[0].files[0].url.startsWith('https://www.ccourt.go.kr/') && x.body.items[0].text === '', '주요 변론 상세: the 변론 개요 PDF');
  ok((await get('/ccourt/hearing?eventNo=' + enc('../x'))).status === 400 && (await get('/ccourt/nope')).status === 404, 'a bad 사건번호, an unknown op');
  ok(asked.every((u) => new URL(u).searchParams.get('serviceKey') === 'fake-data-key'), 'every ask carries the owner\'s key (added here)');
  ok(!JSON.stringify(x.body).includes('fake-data-key'), 'and no answer carries it');

  // 위헌결정 법률현황 + 미개정 법령: every page gathered (a service that gives 50 a page whatever is asked, too), joined
  fopts.statCap = 50;
  n = asked.length;
  x = await get('/ccourt/unconst');
  const statAsks = asked.slice(n).filter((u) => u.includes('getVioconstitDecsnLawSttus'));
  ok(x.status === 200 && x.body.total === 860 && x.body.asOf === '2026-10' && x.body.items.filter((i) => !i.unam || i.full !== i.law).length === 860, `위헌결정 법률현황: all 860 rows gathered (${statAsks.length} asks)`);
  ok(statAsks.some((u) => /year=2026&month=11/.test(u)) && statAsks.some((u) => /year=2026&month=10/.test(u)), 'this month not out yet: the month before is taken');
  ok(new Set(x.body.items.filter((i) => i.eventNo.startsWith('20') && /^시험/.test(i.law)).map((i) => i.eventNo)).size === 856, 'no row twice, none lost (pages asked at the service\'s own size)');
  const gs = x.body.items.find((i) => i.eventNo === '2022헌마1247');
  ok(gs && gs.law === '공직선거법' && gs.old === true && gs.ver.startsWith('2022. 4. 20. 법률 제18841호로 개정되고') && gs.art === '제26조 제1항' && gs.part.startsWith('[별표 2]') && gs.kind === '헌법불합치' && gs.date === '2025-10-23', '구 공직선거법(…) 제26조 제1항 [별표 2] …: law, 구, version, article, part, kind, date');
  const yu = x.body.items.find((i) => i.eventNo === '2024헌가12');
  ok(yu && yu.law === '국가유공자 등 예우 및 지원에 관한 법률' && !yu.old && yu.art === '제13조 제2항 제3호' && /^전문 전단 중/.test(yu.part), '국가유공자 등 예우 및 지원에 관한 법률(…) 제13조 제2항 제3호 전문 전단 중 …');
  const jp = x.body.items.find((i) => i.eventNo === '2008헌가25');
  ok(jp && jp.law === '집회 및 시위에 관한 법률' && jp.art === '제10조' && jp.book === '21-2상' && jp.page === '427' && jp.unam && jp.unam.kind === '헌법불합치' && jp.unam.progress === '경과' && jp.unam.deadline === '2010-06-30' && jp.unam.office === '경찰청' && /^https:\/\/www\.ccourt\.go\.kr\//.test(jp.outline) && /\.hwp$/.test(jp.hwp), '미개정 헌법불합치 (집시법 2008헌가25) joined to its row: 경과, 개정 시한, 소관부처, 개요 link');
  const nk = x.body.items.filter((i) => i.law === '국가보안법' && i.unam);
  ok(nk.length === 2 && nk.every((i) => i.unam.kind === '위헌' && i.src === undefined && i.full === '국가보안법' && /\.hwp$/.test(i.hwp)) && x.body.unamended.vio === 3 && x.body.unamended.cnstit === 3, '미개정 위헌 laws the statistics do not list are kept as their own rows');
  ok(x.body.items.every((i, k, a) => !k || a[k - 1].date >= i.date), 'newest first');
  ok(x.text.length < 400 * 1024, `compact: ${Math.round(x.text.length / 1024)} KB for ${x.body.items.length} rows`);
  n = asked.length;
  x = await get('/ccourt/unconst');
  ok(x.status === 200 && x.body.total === 860 && asked.length === n && (await bucket.head('ccourt/unconst.json')), 'kept in R2: asked again, served from there');
  delete fopts.statCap;

  // 국회입법조사처 발간물
  x = await get('/nars/reports?q=' + enc('선거'));
  const r0 = x.body.items[0];
  ok(x.status === 200 && x.body.total === 3 && x.body.items.length === 3 && r0.id === 'BDM00000018503' && r0.kind === '이슈와 논점' && r0.kindCode === '201010000' && r0.date === '2026-11-26' && /^http:\/\/www\.nars\.go\.kr\/fileDownload2\.do\?doc_id=1Q8GqL7SYg9/.test(r0.pdf) && /^http:\/\/drm\.nars\.go\.kr:7003\//.test(r0.viewer), '발간물: id, title, kind, date, pdf, viewer');
  ok(new URL(asked[asked.length - 1]).searchParams.get('book_nm') === '선거' && new URL(asked[asked.length - 1]).searchParams.get('resultType') === 'json', 'asked by book_nm (LIKE), as JSON');
  x = await get('/nars/reports?q=' + enc('지방 선거'));
  ok(x.status === 200 && x.body.items.length === 1 && x.body.items[0].title.startsWith('511명의 무투표당선') && new URL(asked[asked.length - 1]).searchParams.get('book_nm') === '지방', 'two words: the longer asked of the service, both matched here');
  x = await get('/nars/reports?q=' + enc('선거') + '&kind=201190000');
  ok(x.status === 200 && x.body.items.length === 1 && x.body.items[0].kind === 'NARS 브리프', 'by kind (div_cd)');
  ok((await get('/nars/reports?kind=abc')).status === 400, 'a bad kind is refused');
  // its PDF onto the shelf (/api/paper/pdf with nars: the link as given): NARS only, by https first
  const pp = (b) => call('/paper/pdf', { method: 'POST', body: JSON.stringify(b) }, T);
  n = asked.length;
  let pr = await pp({ nars: r0.pdf, probe: true });
  let pj = await pr.json();
  ok(pr.status === 200 && pj.found === true && pj.host === 'www.nars.go.kr' && asked.slice(n).every((u) => u.startsWith('https://www.nars.go.kr/fileDownload2.do?doc_id=1Q8GqL7SYg9')), 'NARS PDF: found, asked by https (whatever type its server says)');
  pr = await pp({ nars: r0.pdf });
  const pb = Buffer.from(await pr.arrayBuffer());
  ok(pr.status === 200 && pr.headers.get('content-type') === 'application/pdf' && pb.subarray(0, 4).toString() === '%PDF' && pr.headers.get('x-pdf-source') === 'www.nars.go.kr', 'and the PDF itself, for the shelf');
  fopts.narsHttps = false; n = asked.length;
  pr = await pp({ nars: x.body.items[0].pdf });
  ok(pr.status === 200 && (pr.headers.get('content-type') || '').includes('pdf') && asked.slice(n).some((u) => u.startsWith('http://www.nars.go.kr/')), 'https not answering: the link as given (http), that host only');
  delete fopts.narsHttps;
  n = asked.length; const on = other.length;
  for (const bad of ['https://evil.example/fileDownload2.do?doc_id=1Q8GqL7SYg9', 'http://www.nars.go.kr/other.do?doc_id=1Q8GqL7SYg9', 'http://www.nars.go.kr:8080/fileDownload2.do?doc_id=1Q8GqL7SYg9', 'http://www.nars.go.kr.evil.example/fileDownload2.do?doc_id=1Q8GqL7SYg9', 'http://www.nars.go.kr/fileDownload2.do?doc_id=../../x', 'javascript:alert(1)']) {
    pr = await pp({ nars: bad, probe: true });
    ok(pr.status === 400, `not a NARS PDF link: refused (${bad.slice(0, 48)})`);
  }
  ok(asked.length === n && other.length === on, 'and nothing was fetched for them (no open proxy)');

  // 행정심판 재결례: one 재결 (about 4 MB as the service gives it, a picture in base64) kept as its text only
  n = asked.length;
  x = await get('/acrc/body?no=202500966');
  const b = x.body;
  ok(x.status === 200 && b.no === '202500966' && b.cmt === '경기도행정심판위원회' && b.date === '2025-10-13' && b.clme === '성남시' && b.title === '수의계약 배제처분 취소청구' && b.result === '각하' && b.order === '이 사건 심판청구를 각하한다.' && b.claim.startsWith('피청구인이 2025. 8. 1.'), '재결: 위원회, 재결일, 피청구인, 사건명, 결과, 주문, 청구취지');
  ok(b.reason.startsWith('1. 사건개요\n청구인은') && b.reason.includes('[표]') && b.reason.endsWith('주문과 같이 재결한다.') && !/<\/?Text>|<Object|CDATA|Qk1KqC4|<표 삽입/.test(b.reason), '재결 이유: as text, the editor\'s marks out, a table shown as [표]');
  ok(b.laws.startsWith('【행정심판법】') && b.lawNames.includes('행정심판법') && b.lawNames.includes('지방자치단체를 당사자로 하는 계약에 관한 법률'), '관련 법령: the text and the law names');
  ok(b.raw === undefined || b.raw > 3e6, 'the raw size, where the service tells it');
  ok(x.text.length < 100 * 1024 && !x.text.includes('Qk1KqC4') && b.hwp.startsWith('https://ino.simpan.go.kr/'), `trimmed: ${(x.text.length / 1024).toFixed(1)} KB (from ~4 MB), the HWP link kept`);
  ok(asked.length === n + 1 && (await bucket.head('acrc/body/202500966.json')), 'asked once, kept in R2');
  x = await get('/acrc/body?no=202500966');
  ok(x.status === 200 && x.body.reason === b.reason && asked.length === n + 1, 'asked again: from R2, the service is not asked');
  ok((await get('/acrc/body?no=12ab')).status === 400 && (await get('/acrc/body?no=209900001')).status === 404, 'a bad number: 400; one the service does not have: 404');
  x = await get('/acrc/index');
  ok(x.status === 200 && x.body.rows.length === 0 && x.body.want === 36, 'before the cron ran: an empty index (the app says it is being gathered)');

  // the cron, with a clock of its own. 2026-11-26 10:00 in Korea: this month (to today) has 230 재결, September 450
  const KST = (s) => Date.parse(s + '+09:00');
  const counts = { '2026-11': 230, '2026-09': 450 };
  fopts.acrcCount = (ym) => counts[ym] ?? (Number(ym.slice(5)) % 3) + 1;
  const inMonth = (ym, through = 31) => Array.from({ length: fopts.acrcCount(ym) }, (_, i) => (i % 28) + 1).filter((d) => d <= through).length;
  env.CRON_ACRC_CALLS = '4';   // the checks below were written for four asks a run (the deployed worker makes two)
  const pend = [];
  const cron = async (t) => { await worker.scheduled({ scheduledTime: t, cron: '17 * * * *' }, env, { waitUntil: (p) => pend.push(p) }); await Promise.allSettled(pend); return JSON.parse(await (await bucket.get('cron/state.json')).text()); };
  const listAsks = () => asked.filter((u) => u.includes('adjdctexeList') && new URL(u).searchParams.get('numOfRows') !== '1');
  const astate = async () => JSON.parse(await (await bucket.get('acrc/state.json')).text());
  let t0 = KST('2026-11-26T10:00:00'), before = listAsks().length;
  let st = await cron(t0);
  let la = listAsks().slice(before);
  ok(st.last.did[0] === 'diag' && st.diag === '2026-11-26', 'first run of the day: the daily check');
  ok(la.length === 4 && la.slice(0, 3).every((u) => /adjdcStartDe=20261101&adjdcEndDe=20261126/.test(u)) && /adjdcStartDe=20261001&adjdcEndDe=20261031/.test(la[3]), 'then 4 asks: this month (to today, 3 pages), then last month');
  let as = await astate();
  ok(as.months['2026-11'].n === inMonth('2026-11', 26) && as.months['2026-10'].n === inMonth('2026-10'), `both months whole (${as.months['2026-11'].n} and ${as.months['2026-10'].n})`);
  x = await get('/acrc/month?ym=2026-11');
  ok(x.status === 200 && x.body.items.length === as.months['2026-11'].n && x.body.items[0].date >= x.body.items[x.body.items.length - 1].date && x.body.items.every((i) => i.date <= '2026-11-26'), 'a month\'s list, newest first');
  const it = x.body.items.find((i) => i.no === '2026110001');
  ok(it && it.cmt === '서울특별시행정심판위원회' && it.clme === '국세청장' && it.title.startsWith('영업정지처분 취소청구') && it.result === '기각' && it.field === '영업' && it.laws.join() === '행정심판법,식품위생법' && it.upd === '2026-11-28', 'each: 위원회, 재결일, 피청구인, 사건명, 결과, 분야, 관련 법령 names');
  ok(!x.text.includes('제3조(행정심판의 대상)'), 'the laws\' text itself is not kept in the list');
  // September has 450: four asks this run, the fifth carried to the next
  t0 += 3600e3; before = listAsks().length;
  st = await cron(t0);
  la = listAsks().slice(before);
  as = await astate();
  ok(st.last.did[0] === 'unconst' && la.length === 4 && la.every((u) => /adjdcStartDe=20260901/.test(u)) && as.part && as.part.ym === '2026-09' && as.part.next === 5 && !as.months['2026-09'], 'next run: the 위헌 법령 list, then September 4 pages of 5, carried over (not yet in the index)');
  t0 += 3600e3; before = listAsks().length;
  st = await cron(t0);
  la = listAsks().slice(before);
  as = await astate();
  ok(/pageNo=5/.test(la[0]) && /adjdcStartDe=20260901/.test(la[0]) && as.months['2026-09'].n === 450 && !as.part && /adjdcStartDe=20260801/.test(la[1]) && la.length === 4, 'the run after: September\'s last page first (all 450), then on to August, July…');
  // on until three years are in: never more than 4 asks a run
  let runs = 3, most = 0;
  while (Object.keys((await astate()).months).length < 36 && runs < 40) { t0 += 3600e3; before = listAsks().length; await cron(t0); most = Math.max(most, listAsks().length - before); runs++; }
  as = await astate();
  ok(Object.keys(as.months).length === 36 && as.months['2023-12'] && !as.months['2023-11'] && most <= 4, `three years (2023-12 … 2026-11) in ${runs} runs, at most ${most} asks a run`);
  x = await get('/acrc/index');
  const ix = x.body;
  ok(x.status === 200 && ix.rows.length === Object.values(as.months).reduce((s, m) => s + m.n, 0) && Object.keys(ix.months).length === 36 && ix.months['2026-09'] === 450, `the index: ${ix.rows.length} 재결 in ${Math.round(x.text.length / 1024)} KB`);
  const row = ix.rows.find((r) => r[0] === '2026110001');
  ok(row && row[1] === '2026-11-01' && ix.cmts[row[2]] === '서울특별시행정심판위원회' && row[3] === '국세청장' && row[4].startsWith('영업정지처분') && ix.results[row[5]] === '기각' && row[6].map((k) => ix.laws[k]).join() === '행정심판법,식품위생법' && ix.fields[row[7]] === '영업', 'a row: [no, date, 위원회#, 피청구인, 사건명, 결과#, [법령#], 분야#]');
  ok(ix.rows.every((r, k, a) => !k || a[k - 1][1] >= r[1]) && new Set(ix.rows.map((r) => r[0])).size === ix.rows.length, 'newest first, no 재결 twice');
  // nothing due: nothing asked; the next day this month and last again (and the day's check)
  t0 += 3600e3; before = listAsks().length;
  st = await cron(t0);
  ok(listAsks().length === before && !st.last.did.length, 'all gathered and fresh: a run asks nothing');
  t0 = KST('2026-11-27T09:30:00'); before = listAsks().length;
  st = await cron(t0);
  la = listAsks().slice(before);
  ok(st.last.did[0] === 'diag' && st.diag === '2026-11-27' && la.length === 4 && la.slice(0, 3).every((u) => /adjdcEndDe=20261127/.test(u)) && /20261001/.test(la[3]), 'a day later: the check, then this month (now to the 27th) and last month again');
  as = await astate();
  ok(as.months['2026-11'].n === inMonth('2026-11', 27), 'this month now has the 27th too');
  // a new month in Korea (00:30 on 1 December, 15:30 the day before in UTC): it comes first, the oldest one leaves
  counts['2026-12'] = 2;
  t0 = KST('2026-12-01T00:30:00'); before = listAsks().length;
  st = await cron(t0);
  la = listAsks().slice(before);
  as = await astate();
  x = await get('/acrc/index');
  ok(/adjdcStartDe=20261201&adjdcEndDe=20261201/.test(la[0]) && as.months['2026-12'] && !as.months['2023-12'] && !x.body.rows.some((r) => r[1] < '2024-01') && x.body.months['2023-12'] === undefined, 'a new month (Korea\'s calendar): asked first; three years back from it, the oldest left out');
  // a page that fails: told, carried, asked again next run; three times running, that month waits a day
  counts['2026-12'] = 5;
  fopts.acrcFail = (ym) => ym === '2026-12';
  t0 = KST('2026-12-02T01:00:00');
  st = await cron(t0);
  as = await astate();
  ok(/acrc 2026-12 p1: upstream 503/.test(st.last.err || '') && as.part && as.part.ym === '2026-12' && as.part.fails === 1 && as.months['2026-12'].n === 1, 'a failing page: the error kept, the month carried (what was there stays)');
  for (let i = 0; i < 2; i++) { t0 += 3600e3; st = await cron(t0); }
  as = await astate();
  ok(!as.part && as.skip && as.skip['2026-12'] > t0, 'three failures running: it waits a day, the others go on');
  before = listAsks().length; t0 += 3600e3; st = await cron(t0);
  ok(!listAsks().slice(before).some((u) => /20261201/.test(u)), 'meanwhile it is not asked');
  delete fopts.acrcFail;
  t0 += 86400e3; before = listAsks().length; st = await cron(t0);
  as = await astate();
  ok(listAsks().slice(before).some((u) => /20261201/.test(u)) && as.months['2026-12'].n === inMonth('2026-12', 3) && !as.skip, 'a day later asked again, and taken');
  // a service that gives fewer a page than asked (50 of 100), seen on the first page: asked page by page at that size
  {
    fs.rmSync(dir + '-acrc-cap', { recursive: true, force: true });
    const b2 = new MockR2(dir + '-acrc-cap'), env2 = { ...env, BUCKET: b2 };
    fopts.acrcCap = 50; counts['2026-12'] = 120;
    const a0 = asked.length;
    await worker.scheduled({ scheduledTime: KST('2026-12-31T12:00:00'), cron: '17 * * * *' }, env2, { waitUntil: (p) => pend.push(p) });
    const s2 = JSON.parse(await (await b2.get('acrc/state.json')).text());
    const pages = asked.slice(a0).filter((u) => /adjdctexeList/.test(u) && /20261201/.test(u) && !/numOfRows=1&/.test(u));
    ok(s2.rows === 50 && s2.months['2026-12'].n === 120 && pages.length === 3 && /numOfRows=100/.test(pages[0]) && /pageNo=2&numOfRows=50/.test(pages[1]), 'a service capped at 50 a page: all 120 taken in 3 asks');
    delete fopts.acrcCap;
  }

  // the daily check: 14 days kept, a source failing two days running flagged (KCI's OAI does not answer here)
  x = await get('/diag/last');
  ok(x.status === 200 && Array.isArray(x.body.days) && x.body.days.length >= 3 && x.body.cron && x.body.acrc && x.body.acrc.want === 36 && x.body.results && x.body.from === 'cron', '/api/diag/last: the latest check whole, the days, the cron\'s last run, 재결례 gathered');
  const dl = x.body.days[x.body.days.length - 1];
  ok(dl.ok.ccourt === true && dl.ok.nars === true && dl.ok.acrc === true && dl.ok.kci === false && dl.why.kci === 'HTTP 503' && !('law' in dl.ok) && dl.from.includes('cron'), 'a day: the new sources working, KCI not (HTTP 503); sources with no key not judged');
  ok(x.body.failing.includes('kci') && !x.body.failing.includes('ccourt') && !x.body.failing.includes('acrc'), `failing two days in a row: ${x.body.failing.join(', ')}`);
  for (let dd = 0; dd < 16; dd++) await cron(KST('2026-12-04T03:00:00') + dd * 86400e3);
  x = await get('/diag/last');
  ok(x.body.days.length === 14 && x.body.days[13].day === '2026-12-19' && x.body.days[0].day === '2026-12-06', 'only the last 14 days are kept');
  // a check from Korea the same day finds KCI working: that day counts as working, and the flag goes
  kciUp = true;
  const realNow = Date.now; Date.now = () => KST('2026-12-19T12:00:00');
  x = await get('/diag');
  Date.now = realNow;
  x = await get('/diag/last');
  ok(x.body.days[13].ok.kci === true && x.body.days[13].runs === 2 && !x.body.failing.includes('kci') && x.body.from === 'device', 'a later check that day finds KCI working: the day counts as working, no flag');
  // the cron's check (made elsewhere) does not replace a fresh one from Korea
  await bucket.put('diag/last.json', JSON.stringify({ at: KST('2026-12-20T02:00:00'), country: 'KR', results: {} }));
  await cron(KST('2026-12-20T03:00:00'));
  x = await get('/diag/last');
  ok(x.body.country === 'KR' && x.body.days[13].day === '2026-12-20', 'a fresh check from Korea stays the latest; the cron\'s still counts for the day');
  ok(other.every((u) => !/^https?:\/\/(?:127\.0\.0\.1)/.test(u)) && !other.some((u) => u.includes('apis.data.go.kr')), 'nothing real was asked (every outside address played or refused)');
  ok(asked.every((u) => /^https:\/\/apis\.data\.go\.kr\/|^https?:\/\/www\.nars\.go\.kr\//.test(u)), 'and the services only where they are');

  delete env.DATA_GO_KR_KEY;
  globalThis.fetch = realFetch;
}

// devices: sign another device out, then sign out
const devs = (await j(await call('/devices', {}, T))).body.devices;
const other = devs.find((d) => !d.current);
await call('/devices/' + other.id, { method: 'DELETE' }, T);
ok((await call('/me', {}, T2)).status === 401, 'removed device can no longer get in');
await call('/logout', { method: 'POST' }, T);
ok((await call('/me', {}, T)).status === 401, 'signed out');
x = await j(await call('/login', { method: 'POST', body: 'not json' })); ok(x.status === 400, 'bad JSON -> 400');

server.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
