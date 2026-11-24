// Tests for worker.js through the mock runtime. Uses a throwaway PIN (never the real one).
import crypto from 'node:crypto';
import fs from 'node:fs';
import { MockR2, serve } from './mock.mjs';
const PORT = Number(process.env.PORT) || 8791, BASE = `http://127.0.0.1:${PORT}/api`, ORIGIN = 'http://127.0.0.1:8770';
const PEPPER = 'test-pepper', PIN = '123456';
const dir = '/tmp/claude-0/-home-user/32c96ca5-ace8-5bfb-8ce5-1b09a2bc0eb1/scratchpad/seojae-mock-test';
fs.rmSync(dir, { recursive: true, force: true });
const bucket = new MockR2(dir);
const env = { BUCKET: bucket, ALLOWED_ORIGINS: ORIGIN, PEPPER, PIN_HASH: crypto.createHash('sha256').update(PEPPER + ':' + PIN).digest('hex') };
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
await bucket.delete('auth/fails.json');
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
