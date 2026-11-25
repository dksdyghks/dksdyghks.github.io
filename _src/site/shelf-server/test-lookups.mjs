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
const realFetch = globalThis.fetch, asked = [], sentHeaders = [];
globalThis.fetch = async (url, init) => {
  const u = String(url);
  const fake = fakeAssembly(u);
  if (fake) { asked.push(u); sentHeaders.push(new Headers((init && init.headers) || {})); return fake; }
  if (u.startsWith('https://www.law.go.kr/') || u.startsWith('https://open.assembly.go.kr/')) {
    asked.push(u); sentHeaders.push(new Headers((init && init.headers) || {}));
    return new Response(JSON.stringify({ asked: u, link: '/DRF/lawService.do?OC=' + OC + '&KEY=' + KEY }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(url, init);
};
// 열린국회정보 for the bill routes: 계류의안 of 공직선거법 (two that amend it, one that only holds the name), their summaries,
// one bill's meetings; BUSY makes it answer as at the end of its day's allowance (ERROR-337)
let BUSY = false;
const asmJson = (svc, rows, total = rows.length) => new Response(JSON.stringify({ [svc]: [{ head: [{ list_total_count: total }, { RESULT: { CODE: 'INFO-000', MESSAGE: '정상 처리되었습니다.' } }] }, { row: rows }] }), { headers: { 'content-type': 'application/json' } });
const SUMS = {
  2223151: '제안이유 및 주요내용\n\n  현행 「공직선거법」은 …있음.\n  이에 중앙선거관리위원회가 투표보조 절차를 연구ㆍ개발하려는 것임(안 제6조의4 및 제6조의5 신설, 제151조제8항).',
  2222983: '제안이유\n\n  현행법은 …있음.\n\n\n주요내용\n\n가. 국회의원선거구획정위원회의 활동기한을 선거일 전 6개월까지로 함(안 제24조제1항).\n나. 선거구획정기준을 통보하도록 함(안 제24조제11항 신설).',
};
function fakeAssembly(u) {
  if (!u.startsWith('https://open.assembly.go.kr/portal/openapi/')) return null;
  const x = new URL(u), svc = x.pathname.split('/').pop(), q = x.searchParams;
  if (!['nwbqublzajtcqpdae', 'BPMBILLSUMMARY', 'VCONFBILLCONFLIST', 'CACHETEST'].includes(svc)) return null;
  if (BUSY) return new Response(JSON.stringify({ RESULT: { CODE: 'ERROR-337', MESSAGE: '일별 트래픽 제한을 넘은 호출입니다.' } }), { headers: { 'content-type': 'application/json' } });
  if (svc === 'CACHETEST') return asmJson(svc, [{ N: asked.filter((a) => a.includes('CACHETEST')).length }]);
  if (svc === 'nwbqublzajtcqpdae') {
    if (q.get('AGE') !== '22' || q.get('BILL_NAME') !== '공직선거법') return asmJson(svc, []);
    return asmJson(svc, [
      { BILL_ID: 'PRC_B0A9F5A257FE4A519BBFCC734D24D6', BILL_NO: '2223151', BILL_NAME: '공직선거법 일부개정법률안', PROPOSER: '김예지의원 등 10인', PROPOSER_KIND: '의원', PROPOSE_DT: '2026-11-24', CURR_COMMITTEE: null },
      { BILL_ID: 'PRC_75598305B0484647B86910AE3ECBFA', BILL_NO: '2222983', BILL_NAME: '공직선거법 일부개정법률안', PROPOSER: '임미애의원 등 10인', PROPOSER_KIND: '의원', PROPOSE_DT: '2026-11-19', CURR_COMMITTEE: '행정안전위원회', COMMITTEE_DT: '2026-11-20', CMT_PRESENT_DT: '2026-11-24' },
      { BILL_ID: 'PRC_X0A9F5A257FE4A519BBFCC734D24D6', BILL_NO: '2223000', BILL_NAME: '재외국민 공직선거법 특례법안', PROPOSER: '정부', PROPOSER_KIND: '정부', PROPOSE_DT: '2026-11-10' },
    ]);
  }
  if (svc === 'BPMBILLSUMMARY') { const no = q.get('BILL_NO'); return SUMS[no] ? asmJson(svc, [{ BILL_NO: no, SUMMARY: SUMS[no] }]) : new Response(JSON.stringify({ RESULT: { CODE: 'INFO-200', MESSAGE: '해당하는 데이터가 없습니다.' } })); }
  return asmJson(svc, [
    { BILL_ID: q.get('BILL_ID'), CONF_KND: '국회본회의 회의록', SESS: '제439회', DGR: '제9차', CONF_DT: '20260917        ', DOWN_URL: 'https://record.assembly.go.kr/assembly/viewer/minutes/download/pdf.do?id=57268' },
    { BILL_ID: q.get('BILL_ID'), CONF_KND: '기타', SESS: '', DGR: '', CONF_DT: '20260901', DOWN_URL: 'https://elsewhere.example/x.pdf' },
  ]);
}
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
ok(sentHeaders.at(-1).get('referer') === 'https://0128.kr/' && /0128-bookshelf/.test(sentHeaders.at(-1).get('user-agent') || ''), 'law: says plainly which site asks (the registered domain) and what is asking');
ok(!JSON.stringify(b).includes(OC), 'law: the key is taken out of the answer');
r = await call('/law/item?target=prec&ID=123456', T); u = new URL(asked.at(-1));
ok(r.status === 200 && u.pathname === '/DRF/lawService.do' && u.searchParams.get('target') === 'prec' && u.searchParams.get('ID') === '123456', 'law item: one 판례 by its number');
ok((await call('/law/search?target=../../x&query=a', T)).status === 400, 'law: unknown target -> 400');
r = await call('/assembly/TVBPMBILL11?BILL_NAME=' + encodeURIComponent('행정기본법') + '&KEY=other', T); b = await r.json(); u = new URL(asked.at(-1));
ok(!sentHeaders.at(-1).get('referer'), 'assembly: no 법령 domain sent elsewhere');
ok(r.status === 200 && u.pathname === '/portal/openapi/TVBPMBILL11' && u.searchParams.get('KEY') === KEY && u.searchParams.get('Type') === 'json' && u.searchParams.get('BILL_NAME') === '행정기본법', 'assembly: asked with the key and the bill name (a KEY sent along is ignored)');
ok(!JSON.stringify(b).includes(KEY), 'assembly: the key is taken out of the answer');
ok((await call('/assembly/..%2Fx', T)).status === 400 || (await call('/assembly/a', T)).status === 400, 'assembly: odd service names -> 400');

// kept at the edge: a real answer once, then from the edge; an error answer is asked again
const n0 = asked.length;
await call('/assembly/CACHETEST?XX=1', T); await call('/assembly/CACHETEST?XX=1', T);
await new Promise((ok2) => setTimeout(ok2, 50));
r = await call('/assembly/CACHETEST?XX=1', T);
ok(asked.length - n0 <= 2 && /"N":/.test(await r.text()), 'edge: a real answer is kept (asked at most twice before the edge holds it)');
const before = asked.length; await call('/assembly/CACHETEST?XX=1', T);
ok(asked.length === before, 'edge: once kept, the same question is not asked again');
BUSY = true; const nb = asked.length;
r = await call('/assembly/CACHETEST?XX=2', T); await call('/assembly/CACHETEST?XX=2', T);
const nbx = asked.length - nb, st = r.status;
ok(nbx === 2 && st === 200, "edge: the day's-limit answer (ERROR-337) is passed on but not kept" + (nbx === 2 && st === 200 ? '' : ` (asked ${nbx}, status ${st})`));
BUSY = false;

// 국회 계류 법안
r = await call('/bills?law=' + encodeURIComponent('공직선거법'), T); b = await r.json();
ok(r.status === 200 && b.total === 2 && b.rows.every((x) => x.name.startsWith('공직선거법 일부개정')), 'bills: only the bills that amend the law ("재외국민 공직선거법 특례법안" left out)');
ok(b.missing === 0 && JSON.stringify(b.rows[0].arts) === '["6의4","6의5","151"]' && JSON.stringify(b.rows[1].arts) === '["24"]', 'bills: the articles each would change, from its 주요내용');
ok(b.rows[0].no === '2223151' && /투표보조/.test(b.rows[0].gist) && b.rows[1].items === 2 && /활동기한/.test(b.rows[1].gist), 'bills: newest first, each with its gist (and how many points)');
ok(b.rows[1].step === '위원회 상정' && b.rows[1].review === true && b.rows[0].step === '접수' && b.rows[1].cmt === '행정안전위원회', 'bills: how far each has gone (상정: 검토보고서 exists)');
ok(!JSON.stringify(b).includes(KEY), 'bills: no key in the answer');
const billFile = dir + '/' + encodeURIComponent('bills/공직선거법.json');
const kept1 = JSON.parse(fs.readFileSync(billFile, 'utf8'));
ok(kept1.v === 2 && kept1.age === 22 && kept1.rows.length === 2, 'bills: kept in R2 (bills/<law>.json)');
const na = asked.length; r = await call('/bills?law=' + encodeURIComponent('공직선거법'), T);
ok(r.status === 200 && asked.length === na, 'bills: asked again within six hours: answered from R2, nothing asked outside');
kept1.at -= 7 * 3600e3; kept1.rows[0].arts = ['999']; fs.writeFileSync(billFile, JSON.stringify(kept1));
const nc = asked.length; b = await (await call('/bills?law=' + encodeURIComponent('공직선거법'), T)).json();
ok(asked.length - nc === 1 && b.rows[0].arts[0] === '999', 'bills: after six hours the list is asked again; bills already read keep what was read (no summary asked again)');
fs.rmSync(billFile, { force: true }); fs.rmSync(billFile + '.meta.json', { force: true });
BUSY = true; r = await call('/bills?law=' + encodeURIComponent('공직선거법'), T);
ok(r.status === 502, "bills: 열린국회정보 at its day's limit and nothing kept yet -> 502");
BUSY = false;
r = await call('/bills?law=' + encodeURIComponent('정당법'), T); b = await r.json();
ok(r.status === 200 && b.total === 0 && b.missing === 0, 'bills: a law with no bills pending -> none');
ok((await call('/bills?law=' + encodeURIComponent('<script>'), T)).status === 400 && (await call('/bills', T)).status === 400, 'bills: an odd law name -> 400');
r = await call('/bills/one?no=2222983&id=PRC_75598305B0484647B86910AE3ECBFA', T); b = await r.json();
ok(r.status === 200 && /활동기한/.test(b.summary) && b.minutes.length === 1 && b.minutes[0].date === '20260917' && b.minutes[0].url.startsWith('https://record.assembly.go.kr/'), "bills/one: the summary in full and the meetings' records (only record.assembly.go.kr links)");
ok((await call('/bills/one?no=1&id=x', T)).status === 400, 'bills/one: odd numbers -> 400');
r = await call('/bills/one?no=2223999&id=PRC_75598305B0484647B86910AE3ECBFB', T); b = await r.json();
ok(r.status === 200 && b.summary === '', 'bills/one: a bill without a summary yet -> an empty summary');

server.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
