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
  ok(x.status === 200 && x.body.key === false && x.body.cap === 150 && x.body.max === 12000 && x.body.used === 0 && x.body.style === null && x.body.models[0].id === 'claude-fable-5-2' && x.body.models[1].id === 'claude-opus-5-5', '글쓰기 info: no key, the models (Fable 5.2, then Opus 5.5), cap 150, 12,000 letters, nothing used');
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
  plan.push(fail(400, 'invalid_request_error', 'something about ' + KEY + ' was wrong'));
  w = await write({ action: 'polish', text: SAMPLE });
  sh = shelf(events(w.text));
  ok(sh[sh.length - 1].code === 'bad_request' && /something about/.test(sh[sh.length - 1].message) && !w.text.includes(KEY), 'any word passed on from Anthropic has the key taken out');

  // the limits, before anything goes out
  asked.length = 0;
  w = await write({ action: 'polish', text: '가'.repeat(12001) });
  ok(w.status === 413 && JSON.parse(w.text).error === 'too_long' && JSON.parse(w.text).max === 12000 && JSON.parse(w.text).got === 12001 && asked.length === 0, 'over 12,000 letters: 413 too_long (max, got); Anthropic not asked');
  plan.push(ok200('claude-fable-5-2', '가'));
  w = await write({ action: 'proof', text: '가'.repeat(12000) });
  ok(w.status === 200 && asked.length === 1, 'exactly 12,000 Hangul letters (36,000 bytes) go: letters are counted, not bytes');
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
