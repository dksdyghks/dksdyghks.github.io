// /api/paper/pdf, asked first with probe: true (only whether an open PDF is there: the start of each candidate is read) and
// then for the PDF itself. The open-access index and the hosts are played here (nothing outside is asked). A throwaway PIN.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { MockR2, serve } from './mock.mjs';
const PORT = Number(process.env.PORT) || 8812, BASE = `http://127.0.0.1:${PORT}/api`, ORIGIN = 'http://127.0.0.1:8770';
const PEPPER = 'test-pepper', PIN = '123456';
const dir = '/tmp/claude-0/-home-user/32c96ca5-ace8-5bfb-8ce5-1b09a2bc0eb1/scratchpad/seojae-mock-probe-' + Date.now();
const bucket = new MockR2(dir);
const env = { BUCKET: bucket, ALLOWED_ORIGINS: ORIGIN, PEPPER, PIN_HASH: crypto.createHash('sha256').update(PEPPER + ':' + PIN).digest('hex'), CORE_KEY: 'test-core' };
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.log('FAIL', m); } else console.log('ok  ', m); };

// the world outside, as this test plays it
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(60000, 32)]);
const asked = [];
let where = 'pdf';   // what the candidate host answers: 'pdf', 'html', 'tiny', 'ignores-range'
const realFetch = globalThis.fetch;
// (a Response made here has no url; a fetched one carries where it ended up, which the worker checks)
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname === '127.0.0.1') return realFetch(input, init);
  const r = await played(url, init);
  Object.defineProperty(r, 'url', { value: url.href });
  return r;
};
async function played(url, init) {
  const h = new Headers(init.headers || {});
  asked.push(url.hostname + (h.get('range') ? ' (range)' : ''));
  if (url.hostname === 'api.core.ac.uk') {   // two papers by title search: only the one with the same title, year and author is taken
    if (/doi:/.test(url.searchParams.get('q') || '')) return new Response(JSON.stringify({ results: [] }), { headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ results: [
      { title: '다른 논문의 제목', yearPublished: 2024, authors: [{ name: '김철수' }], downloadUrl: 'https://wrong.example.org/other.pdf' },
      { title: '선거관리위원회의 독립성 연구', yearPublished: 2024, authors: [{ name: '안요환' }], downloadUrl: 'https://repo.example.org/core.pdf' },
    ] }), { headers: { 'content-type': 'application/json' } });
  }
  if (url.hostname === 'wrong.example.org') return new Response(PDF, { headers: { 'content-type': 'application/pdf', 'content-length': String(PDF.length) } });
  if (url.hostname === 'api.openalex.org') return new Response(JSON.stringify({ open_access: { is_oa: true }, best_oa_location: { pdf_url: 'https://repo.example.org/paper.pdf' }, locations: [] }), { headers: { 'content-type': 'application/json' } });
  if (url.hostname === 'repo.example.org') {
    if (where === 'html') return new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } });
    if (where === 'tiny') return new Response(PDF.subarray(0, 900), { status: 206, headers: { 'content-type': 'application/pdf', 'content-range': 'bytes 0-899/900' } });
    const range = h.get('range');
    if (range && where !== 'ignores-range') return new Response(PDF.subarray(0, 4096), { status: 206, headers: { 'content-type': 'application/pdf', 'content-range': `bytes 0-4095/${PDF.length}` } });
    return new Response(PDF, { headers: { 'content-type': 'application/pdf', 'content-length': String(PDF.length) } });
  }
  return new Response('not here', { status: 404 });
}
const server = await serve(PORT, env);
const call = (path, opt = {}, token) => realFetch(BASE + path, { ...opt, headers: { origin: ORIGIN, ...(token ? { authorization: 'Bearer ' + token } : {}), ...(opt.headers || {}) } });
const T = (await (await call('/login', { method: 'POST', body: JSON.stringify({ pin: PIN, device: 'probe-test' }) })).json()).token;
ok(!!T, 'signed in');
const ask = (body) => call('/paper/pdf', { method: 'POST', body: JSON.stringify(body) }, T);

let r = await ask({ doi: '10.1234/x', title: 't', probe: true });
let d = await r.json().catch(() => null);
ok(r.status === 200 && d && d.found === true && d.host === 'repo.example.org', 'probe: found, and where: ' + JSON.stringify(d));
ok(asked.includes('repo.example.org (range)') && !asked.includes('repo.example.org'), 'probe: only the start of the PDF was asked for (a range)');
asked.length = 0;
r = await ask({ doi: '10.1234/x', title: 't' });
const buf = Buffer.from(await r.arrayBuffer());
ok(r.headers.get('content-type') === 'application/pdf' && buf.length === PDF.length && buf.subarray(0, 5).toString() === '%PDF-', 'then the PDF itself, whole');
ok(r.headers.get('access-control-expose-headers').includes('x-pdf-source') && r.headers.get('x-pdf-source') === 'repo.example.org', 'its source named, and readable by the app');

where = 'ignores-range'; asked.length = 0;
d = await (await ask({ doi: '10.1234/y', probe: true })).json();
ok(d.found === true, 'probe: a host that ignores the range still answers (its first bytes are read, then it is let go)');
where = 'html';
d = await (await ask({ doi: '10.1234/z', probe: true })).json();
ok(d.found === false, 'probe: a page that is not a PDF (a login page) is not offered');
where = 'tiny';
d = await (await ask({ doi: '10.1234/w', probe: true })).json();
ok(d.found === false, 'probe: a PDF too small to be the paper (a notice) is not offered');
// a probe asked again is answered from the edge, nobody asked
where = 'pdf'; asked.length = 0;
d = await (await ask({ doi: '10.1234/x', title: 't', probe: true })).json();
ok(d.found === true && asked.length === 0, 'probe asked again: kept at the edge, nothing fetched (' + asked.join(',') + ')');
// CORE by title: only the same paper
asked.length = 0;
d = await (await ask({ title: '선거관리위원회의 독립성 연구', year: 2024, authors: ['안요환'], probe: true })).json();
ok(d.found === true && !asked.includes('wrong.example.org (range)') && asked.includes('repo.example.org (range)'), 'CORE by title: the same paper only (' + asked.join(',') + ')');
asked.length = 0;
d = await (await ask({ title: '아무도 쓰지 않은 제목', probe: true })).json();
ok(d.found === false && !asked.some((h) => /example\.org/.test(h)), 'CORE by title: an unlike title takes nothing');

server.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
