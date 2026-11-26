// 7차 b review: problems found in the new routes, each shown here first (these failed before the fixes in worker.js).
// Offline: the services are played by fakeData (mock.mjs); every other outside address answers 503. Throwaway PIN.
//   PORT=9051 node test-7b-review.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import { MockR2, serve, fakeData } from './mock.mjs';
import worker from './worker.js';
const PORT = Number(process.env.PORT) || 9051, BASE = `http://127.0.0.1:${PORT}/api`, ORIGIN = 'http://127.0.0.1:8770';
const PEPPER = 'test-pepper', PIN = '123456';
const dir = '/tmp/claude-0/-home-user/32c96ca5-ace8-5bfb-8ce5-1b09a2bc0eb1/scratchpad/seojae-mock-7b-review';
fs.rmSync(dir, { recursive: true, force: true });
const bucket = new MockR2(dir);
const env = { BUCKET: bucket, ALLOWED_ORIGINS: ORIGIN, PEPPER, PIN_HASH: crypto.createHash('sha256').update(PEPPER + ':' + PIN).digest('hex'), DATA_GO_KR_KEY: 'fake-data-key' };
const realFetch = globalThis.fetch;
const server = await serve(PORT, env);
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.log('FAIL', m); } else console.log('ok  ', m); };
const call = (path, opt = {}, token) => realFetch(BASE + path, { ...opt, headers: { origin: ORIGIN, ...(token ? { authorization: 'Bearer ' + token } : {}), ...(opt.headers || {}) } });
const T = (await (await call('/login', { method: 'POST', body: JSON.stringify({ pin: PIN, device: 'review' }) })).json()).token;
const get = async (path) => { const r = await call(path, {}, T); const text = await r.text(); let body = null; try { body = JSON.parse(text); } catch (e) { /* not JSON */ } return { status: r.status, body, text }; };
const KST = (s) => Date.parse(s + '+09:00');
const cron = async (t) => { const pend = []; await worker.scheduled({ scheduledTime: t, cron: '17 * * * *' }, env, { waitUntil: (p) => pend.push(p) }); await Promise.allSettled(pend); };

const asked = [], fopts = { key: 'fake-data-key', asked, statLatest: '2026-10' };
const fake = fakeData(fopts);
let kciUp = false, statExtra = null, narsTotal = 0;
globalThis.fetch = async (input, init) => {
  const u = String(typeof input === 'string' ? input : input.url);
  if (u.startsWith('http://127.0.0.1')) return realFetch(input, init);
  if (kciUp && u.startsWith('https://open.kci.go.kr/oai/')) return new Response('<?xml version="1.0"?><OAI-PMH><Identify><repositoryName>KCI</repositoryName></Identify></OAI-PMH>', { headers: { 'content-type': 'text/xml' } });
  const f = fake(input, init);
  if (!f) return new Response('offline in test', { status: 503 });
  const r = await f;
  // (a few answers changed in place: one more statistics row on its first page; a NARS total of many pages)
  if (statExtra && u.includes('getVioconstitDecsnLawSttus') && /[?&]pageNo=1(&|$)/.test(u)) {
    const j = await r.json();
    if (j.body.items && j.body.items.item) { j.body.items.item.unshift(statExtra); j.body.totalCount++; }
    return new Response(JSON.stringify(j), { headers: { 'content-type': 'application/json' } });
  }
  if (narsTotal && u.includes('getResearchReportList')) {
    const j = await r.json();
    j.getResearchReportList.totalCount = narsTotal;
    return new Response(JSON.stringify(j), { headers: { 'content-type': 'application/json' } });
  }
  return r;
};

{ // 1. 위헌결정 법률현황: the statistics may lag (the live probe asked 2025-12): the newest month they have is found further back
  fopts.statLatest = '2025-12';
  const realNow = Date.now; Date.now = () => KST('2026-11-26T10:00:00');
  let x = await get('/ccourt/unconst');
  Date.now = realNow;
  ok(x.status === 200 && x.body.asOf === '2025-12' && x.body.total === 860, `statistics last out for 2025-12, asked in 2026-11: still built (${x.status} ${x.body && (x.body.error || x.body.asOf)})`);
  // the cron, the next day: it starts two months after the month found last time (2026-02, 2026-01, then 2025-12), and the
  // service giving 50 a page fits its budget
  fopts.statCap = 50;
  let n = asked.length;
  await cron(KST('2026-11-27T00:17:00')); await cron(KST('2026-11-27T01:17:00'));
  const months = asked.slice(n).filter((u) => u.includes('getVioconstitDecsnLawSttus') && /pageNo=1&/.test(u)).map((u) => new URL(u).searchParams.get('year') + '-' + new URL(u).searchParams.get('month'));
  let st = JSON.parse(await (await bucket.get('cron/state.json')).text());
  ok(months.join() === '2026-02,2026-01,2025-12' && st.unconst === '2026-11-27' && !/unconst|budget/.test(st.last.err || ''), `the next day's list: months asked ${months.join(', ')}; made (${st.last.err || 'no error'})`);
  // a newer month out: found the day after
  fopts.statLatest = '2026-01';
  n = asked.length;
  await cron(KST('2026-11-28T00:17:00')); await cron(KST('2026-11-28T01:17:00'));
  x = await get('/ccourt/unconst');
  ok(x.body.asOf === '2026-01', `a newer month out: taken (${x.body.asOf})`);
  // and the first list, with the statistics a year behind and 50 a page, made by the cron alone
  await bucket.delete(['ccourt/unconst.json', 'cron/state.json']);
  fopts.statLatest = '2025-12';
  await cron(KST('2026-11-29T00:17:00')); await cron(KST('2026-11-29T01:17:00'));
  st = JSON.parse(await (await bucket.get('cron/state.json')).text());
  x = await get('/ccourt/unconst');
  ok(st.unconst === '2026-11-29' && x.body.asOf === '2025-12' && x.body.items.length >= 860, `the first list, made by the cron alone (${st.last.err || 'no error'})`);
  delete fopts.statCap;
  fopts.statLatest = '2026-10';
  await bucket.delete('ccourt/unconst.json');
}

{ // 2. the 미개정 join: a case that held one article 헌법불합치 and another 위헌 — the 헌법불합치 list's entry goes on the
  //    헌법불합치 row, not on the 위헌 one too
  statExtra = { lawNm: '집회 및 시위에 관한 법률(2007. 5. 11. 법률 제8424호로 전부개정된 것) 제23조 제3호 중 “제10조 본문” 부분', eventNo: '2008헌가25', rstaDate: '20090924', rstaRsta: '위헌', precdntBook: '21-2상', precdntPage: '427' };
  const x = await get('/ccourt/unconst');
  const rows = (x.body.items || []).filter((i) => i.eventNo === '2008헌가25');
  const nc = rows.find((i) => i.kind === '헌법불합치'), wi = rows.find((i) => i.kind === '위헌');
  ok(x.status === 200 && nc && nc.unam && nc.unam.kind === '헌법불합치', '2008헌가25 제10조 (헌법불합치): marked 헌법불합치 · 개정 안 됨');
  ok(wi && !wi.unam, `2008헌가25 제23조 (위헌): not marked as an unamended 헌법불합치 (${wi && JSON.stringify(wi.unam)})`);
  statExtra = null;
  await bucket.delete('ccourt/unconst.json');
}

{ // 3. pages: a page past what is served is not answered as another page
  let x = await get('/ccourt/recent?page=61');
  ok(x.status === 200 && x.body.page === 61, `최근 주요 결정 page 61 (of 66): answered as page ${x.body && x.body.page}`);
  narsTotal = 5000;
  x = await get('/nars/reports?q=' + encodeURIComponent('선거') + '&page=100');
  const at100 = x.body;
  x = await get('/nars/reports?q=' + encodeURIComponent('선거') + '&page=101');
  ok(at100.page === 100 && at100.more === false && x.status === 400 && x.body.error === 'bad_page', `국회입법조사처: page 100 (the last served) says no more (${at100.more}); page 101 is refused (${x.status})`);
  x = await get('/ccourt/recent?page=1001');
  ok(x.status === 400 && (await get('/ccourt/hearings?page=0')).body.page === 1, 'a page past 1000 is refused; page 0 is page 1');
  narsTotal = 0;
}

{ // 4. the daily check: a source that answers only Korean addresses (here KCI: never from the cron, which runs elsewhere, but
  //    from the device) is not flagged when on two days only the cron could check it; a real outage still is
  const dayCheck = async (t) => { const realNow = Date.now; Date.now = () => t; await get('/diag'); Date.now = realNow; };
  kciUp = false; await cron(KST('2026-12-01T00:17:00'));
  kciUp = true; await dayCheck(KST('2026-12-01T12:00:00'));   // the owner's device, that day: KCI answers it
  kciUp = false; await cron(KST('2026-12-02T00:17:00'));       // two days the owner does not open the app: the cron only
  await cron(KST('2026-12-03T00:17:00'));
  let x = await get('/diag/last');
  const d3 = x.body.days[x.body.days.length - 1];
  ok(d3.day === '2026-12-03' && d3.ok.kci === false && !x.body.failing.includes('kci'), `KCI failing in the cron only, working from the device: not flagged (failing: ${x.body.failing.join(', ')})`);
  ok(x.body.failing.includes('kcisearch') === false && ['ccourt', 'nars', 'acrc'].every((k) => !x.body.failing.includes(k)), 'the services that answer the cron are not flagged');
  // the device's own checks fail too, two days running: flagged
  await dayCheck(KST('2026-12-03T12:00:00'));
  await cron(KST('2026-12-04T00:17:00')); await dayCheck(KST('2026-12-04T12:00:00'));
  x = await get('/diag/last');
  ok(x.body.failing.includes('kci'), `KCI failing from the device two days running: flagged (failing: ${x.body.failing.join(', ')})`);
  // a source never working from anywhere is still flagged from the cron's checks alone (as before)
  await bucket.delete(['diag/days.json', 'diag/last.json']);
  await cron(KST('2026-12-10T00:17:00')); await cron(KST('2026-12-11T00:17:00'));
  x = await get('/diag/last');
  ok(x.body.days.length === 2 && x.body.failing.includes('kci'), `with no sign of it working anywhere: flagged from the cron alone (failing: ${x.body.failing.join(', ')})`);
}

server.close();
globalThis.fetch = realFetch;
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
