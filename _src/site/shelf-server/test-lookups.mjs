// Tests for the 법령·판례 and 국회 routes: the outside sites are stood in for here, so nothing real is called.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { MockR2, serve } from './mock.mjs';
const PORT = Number(process.env.PORT) || 8792, BASE = `http://127.0.0.1:${PORT}/api`, ORIGIN = 'http://127.0.0.1:8770';
const PEPPER = 'test-pepper', PIN = '123456', OC = 'oc-test-id', KEY = 'assemblykey0123456789';
const dir = '/tmp/claude-0/-home-user/32c96ca5-ace8-5bfb-8ce5-1b09a2bc0eb1/scratchpad/seojae-mock-lookups';
fs.rmSync(dir, { recursive: true, force: true });
const env = { BUCKET: new MockR2(dir), ALLOWED_ORIGINS: ORIGIN, PEPPER, PIN_HASH: crypto.createHash('sha256').update(PEPPER + ':' + PIN).digest('hex') };
// the outside sites: answer with what was asked (and echo the key the way law.go.kr links do)
const realFetch = globalThis.fetch, asked = [];
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith('https://www.law.go.kr/') || u.startsWith('https://open.assembly.go.kr/')) {
    asked.push(u);
    return new Response(JSON.stringify({ asked: u, link: '/DRF/lawService.do?OC=' + OC + '&KEY=' + KEY }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(url, init);
};
const server = await serve(PORT, env);
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.log('FAIL', m); } else console.log('ok  ', m); };
const call = (path, token) => realFetch(BASE + path, { headers: { origin: ORIGIN, ...(token ? { authorization: 'Bearer ' + token } : {}) } });
const T = (await (await realFetch(BASE + '/login', { method: 'POST', headers: { origin: ORIGIN }, body: JSON.stringify({ pin: PIN, device: 't' }) })).json()).token;

ok((await call('/law/search?query=x')).status === 401, 'law: signed-in devices only');
ok((await call('/law/search?query=x', T)).status === 503, 'law: no key yet -> 503');
env.LAW_OC = OC; env.ASSEMBLY_KEY = KEY;
let r = await call('/law/search?target=law&query=' + encodeURIComponent('행정기본법') + '&display=5&evil=1', T);
let b = await r.json(), u = new URL(asked.at(-1));
ok(r.status === 200 && u.pathname === '/DRF/lawSearch.do' && u.searchParams.get('OC') === OC && u.searchParams.get('target') === 'law' && u.searchParams.get('type') === 'JSON' && u.searchParams.get('query') === '행정기본법' && u.searchParams.get('display') === '5', 'law search: asked with the key, the target and the words');
ok(!u.searchParams.has('evil'), 'law: parameters outside the list are not passed on');
ok(!JSON.stringify(b).includes(OC), 'law: the key is taken out of the answer');
r = await call('/law/item?target=prec&ID=123456', T); u = new URL(asked.at(-1));
ok(r.status === 200 && u.pathname === '/DRF/lawService.do' && u.searchParams.get('target') === 'prec' && u.searchParams.get('ID') === '123456', 'law item: one 판례 by its number');
ok((await call('/law/search?target=../../x&query=a', T)).status === 400, 'law: unknown target -> 400');
r = await call('/assembly/TVBPMBILL11?BILL_NAME=' + encodeURIComponent('행정기본법') + '&KEY=other', T); b = await r.json(); u = new URL(asked.at(-1));
ok(r.status === 200 && u.pathname === '/portal/openapi/TVBPMBILL11' && u.searchParams.get('KEY') === KEY && u.searchParams.get('Type') === 'json' && u.searchParams.get('BILL_NAME') === '행정기본법', 'assembly: asked with the key and the bill name (a KEY sent along is ignored)');
ok(!JSON.stringify(b).includes(KEY), 'assembly: the key is taken out of the answer');
ok((await call('/assembly/..%2Fx', T)).status === 400 || (await call('/assembly/a', T)).status === 400, 'assembly: odd service names -> 400');
server.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
