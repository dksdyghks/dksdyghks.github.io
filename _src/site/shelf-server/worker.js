// 서재 server: one Cloudflare Worker in front of one R2 bucket, for a single owner.
//
// Sign-in: the owner's 6-digit PIN, kept here only as a peppered SHA-256 hash (env.PIN_HASH, env.PEPPER are secrets).
//   A correct PIN gives the device a long random token; the token is what every later request carries.
//   Failed PINs are counted in R2 (auth/fails.json): 8 failures within an hour lock sign-in for an hour.
//
// R2 layout:
//   lib/index.json                 the library: folders and files (names, places, sizes, dates, trash)
//   files/<id>.pdf                 each PDF exactly as uploaded (never rewritten; <id> = first 24 hex of its SHA-256)
//   meta/<id>/thumb.jpg            first-page picture (made by the device that uploaded it)
//   meta/<id>/text.json.gz         the text of every page, for search (made by the device that uploaded it)
//   meta/<id>/ocr.json.gz          a scanned paper's words and where they sit on each page (read by a device, see app ocr.js)
//   marks/<id>.json                highlights and underlines
//   backup/marks/<id>/<ms>.json    a paper's marks as they were before the first change of a day (and before a restore), 60 days
//   backup/lib/<YYYY-MM-DD>.json   the library as it was before the first change of that day, 60 days
//   state.json                     where each file was last being read (newest wins)
//   auth/devices/<sha256(token)>   one small record per signed-in device
//   auth/fails.json                failed sign-in counter
//
// Lookups asked through here, so their keys never leave the server (secrets set in the Cloudflare dashboard):
//   /api/law/search|item   국가법령정보 공동활용 (법령·판례·헌재결정례…): env.LAW_OC
//   /api/assembly/<service> 열린국회정보 (의안 등): env.ASSEMBLY_KEY
//   /api/bills?law=…        국회 계류 법안 of one law, with the articles each would change (kept in R2: bills/<law name>.json)
//   /api/bills/one?no=&id=  one bill's 제안이유 및 주요내용 and the meetings that took it up (회의록)
//   /api/data/<기관>/<서비스>[/<기능>] 공공데이터포털 (헌법재판소·국회입법조사처·법제처): env.DATA_GO_KR_KEY (법제처 1170000: env.MOLEG_KEY)
//   /api/kci/oai            KCI OAI-PMH (no key)
//   /api/nl/<op>            국립중앙도서관 (소장자료·KOLIS-NET·ISBN 서지): env.NL_KEY
//   /api/nanet/<op>          국회도서관 국가학술정보 클라우드 (통합검색·상세보기·연구자·주제어·연관 연구자/학술지/발행기관/주제어·추이): env.NANET_KEY
//   /api/scienceon/search|view  KISTI ScienceON 논문 (권호·쪽·초록·DOI·원문): env.SCIENCEON_CLIENT_ID, SCIENCEON_KEY, SCIENCEON_MAC
//                           (its access token, issued with those, is kept in R2 at auth/scienceon.json and renewed when it runs out)
//   /api/foreign/<id>       비교법 원문: a few foreign election laws from their official sources, by name only (FOREIGN)
//   /api/diag               which of these answer, asked from where the device is (Cloudflare runs us near it); kept in diag/last.json
// Their answers are kept at Cloudflare's edge for a while (kept()), but only real answers: an error, a daily-limit answer or a
// maintenance page is never kept, so the next ask goes out again.

const ID = /^[0-9a-f]{24}$/;
const FOLDER_ID = /^f_[0-9a-z]{10}$/;
const MAX_JSON = 4 * 1024 * 1024;
const MAX_META = 25 * 1024 * 1024;
const TRASH_DAYS = 7;   // a deleted paper waits in the trash this long before it is really gone
const MARK_COLORS = /^#[0-9A-Fa-f]{6}$/;

export default {
  async fetch(req, env, ctx) {
    const cors = corsHeaders(req.headers.get('origin') || '', env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-max-age': '86400' } });
    let res;
    try {
      res = await route(req, env, ctx);
    } catch (e) {
      res = json({ error: 'server', message: String((e && e.message) || e).slice(0, 300) }, 500);
    }
    const h = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) h.set(k, v);
    return new Response(res.body, { status: res.status, headers: h });
  },
};

function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin);
  return {
    'access-control-allow-origin': ok ? origin : (allowed[0] || 'null'),
    'access-control-allow-methods': 'GET, HEAD, PUT, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, range, if-match, x-file-name',
    'access-control-expose-headers': 'etag, content-length, content-range, accept-ranges',
    vary: 'origin',
  };
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
}
const err = (code, status, more = {}) => json({ error: code, ...more }, status);

async function readJSON(req, max = MAX_JSON) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > max) throw Object.assign(new Error('too large'), { status: 413 });
  const text = await req.text();
  if (text.length > max) throw Object.assign(new Error('too large'), { status: 413 });
  try { return JSON.parse(text || '{}'); } catch { throw Object.assign(new Error('bad json'), { status: 400 }); }
}

async function route(req, env, ctx) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);   // ['api', ...]
  if (p[0] !== 'api') return err('not_found', 404);
  const m = req.method;

  try {
    if (p[1] === 'login' && m === 'POST') return await login(req, env);
    if (p[1] === 'ping') return json({ ok: true, at: Date.now() });
    const dev = await authenticate(req, env, ctx);
    if (!dev) return err('auth', 401);
    if (dev.kind === 'inbox') {   // a share key (iPad/iPhone share menu): it can put a PDF in, nothing more
      if (p[1] === 'inbox' && m === 'POST' && p.length === 2) return await inbox(req, env, ctx, dev, url);
      return err('share_key_only', 403);
    }
    switch (p[1]) {
      case 'inbox': if (m === 'POST' && p.length === 2) return await inbox(req, env, ctx, dev, url); break;
      case 'me': return json({ device: publicDevice(dev, dev.key) });
      case 'logout': if (m === 'POST') { await env.BUCKET.delete(dev.key); return json({ ok: true }); } break;
      case 'devices':
        if (m === 'GET' && p.length === 2) return await listDevices(env, dev);
        if (m === 'POST' && p[2] === 'sharekey') return await makeShareKey(req, env);
        if (m === 'DELETE' && p[2]) return await dropDevice(env, p[2], dev);
        break;
      case 'lib':
        if (m === 'GET' && p.length === 2) return await getIndex(env);
        if (m === 'POST' && p[2] === 'ops') return await applyOps(req, env, ctx, dev);
        break;
      case 'files':
        if (!ID.test(p[2] || '')) return err('bad_id', 400);
        if (p.length === 3 && (m === 'GET' || m === 'HEAD')) return await getFile(req, env, p[2], m === 'HEAD');
        if (p.length === 3 && m === 'PUT') return await putFile(req, env, p[2]);
        if (p[3] === 'mpu') return await multipart(req, env, p[2], p.slice(4));
        break;
      case 'meta':
        if (!ID.test(p[2] || '') || !['thumb', 'text', 'ocr'].includes(p[3])) return err('bad_id', 400);
        if (m === 'GET') return await getMeta(env, p[2], p[3]);
        if (m === 'PUT') return await putMeta(req, env, p[2], p[3]);
        break;
      case 'marks':
        if (p.length === 2 && m === 'GET') return await marksTags(env);
        if (!ID.test(p[2] || '')) return err('bad_id', 400);
        if (p.length === 3 && m === 'GET') return await getMarks(env, p[2]);
        if (p.length === 3 && m === 'PUT') return await putMarks(req, env, p[2]);
        if (p[3] === 'history' && m === 'GET') return await marksHistory(env, p[2]);
        if (p[3] === 'restore' && m === 'POST') return await restoreMarks(req, env, p[2]);
        break;
      case 'sync':
        if (m === 'GET') return await pull(env, url);
        break;
      case 'state':
        if (m === 'GET') return await getState(env);
        if (m === 'PUT') return await putState(req, env);
        break;
      case 'law':
        if (m === 'GET' && (p[2] === 'search' || p[2] === 'item') && p.length === 3) return await lawApi(env, ctx, p[2], url);
        break;
      case 'assembly':
        if (m === 'GET' && p.length === 3) return await assemblyApi(env, ctx, p[2], url);
        break;
      case 'foreign':
        if (m === 'GET' && p.length === 3) return await foreignLaw(ctx, p[2]);
        break;
      case 'bills':
        if (m === 'GET' && p.length === 2) return await billsApi(env, url);
        if (m === 'GET' && p[2] === 'one' && p.length === 3) return await billOne(env, ctx, url);
        break;
      case 'data':
        if (m === 'GET' && p.length >= 4 && p.length <= 6) return await dataApi(env, ctx, p.slice(2), url);
        break;
      case 'nl':
        if (m === 'GET' && p.length === 3) return await nlApi(env, ctx, p[2], url);
        break;
      case 'kci':
        if (m === 'GET' && p[2] === 'oai' && p.length === 3) return await kciOai(ctx, url);
        break;
      case 'nanet':
        if (m === 'GET' && p.length === 3) return await nanetApi(env, ctx, p[2], url);
        break;
      case 'scienceon':
        if (m === 'GET' && p.length === 3) return await scienceonApi(env, p[2], url);
        break;
      case 'diag':
        if (m === 'GET' && p.length === 2) return await diag(req, env);
        if (m === 'GET' && p[2] === 'last') { const o = await env.BUCKET.get('diag/last.json'); return o ? new Response(o.body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }) : err('none', 404); }
        break;
    }
  } catch (e) {
    if (e && e.status) return err(e.message.replace(/\s+/g, '_'), e.status);
    throw e;
  }
  return err('not_found', 404);
}

/* ---------------- 법령·판례 and 국회: asked from here so the keys stay on the server ---------------- */

// 국가법령정보 공동활용 (law.go.kr DRF): lawSearch.do (search) and lawService.do (one item), as JSON
const LAW_TARGETS = new Set(['law', 'prec', 'detc', 'expc', 'admrul']);   // 법령, 판례, 헌재결정례, 법령해석례, 행정규칙
const LAW_PARAMS = new Set(['query', 'display', 'page', 'sort', 'search', 'section', 'ID', 'MST', 'LID', 'LM', 'JO', 'efYd', 'nb', 'org', 'curt', 'date', 'knd']);
// 국가법령정보 OPEN API checks who is asking against what the owner registered there (open.law.go.kr → OPEN API 신청):
// requests say plainly which site they are made for — the registered domain — and what is making them
// every outside request says plainly what is making it
const UA = '0128-bookshelf/1.0 (+https://0128.kr/shelf/)';
const lawHeaders = (env) => ({ referer: env.LAW_DOMAIN || 'https://0128.kr/', 'user-agent': UA });
// 국가법령정보 answers a refused or failed ask with 200 and {"result": "…실패…"}: such an answer is passed on, never kept
const realLaw = (t) => /^\s*[{[<]/.test(t) && !/"result"\s*:\s*"[^"]*(?:실패|오류|제한|점검)/.test(t.slice(0, 800));
async function lawApi(env, ctx, kind, url) {
  if (!env.LAW_OC) return err('no_key', 503);
  const target = url.searchParams.get('target') || 'law';
  if (!LAW_TARGETS.has(target)) return err('bad_target', 400);
  const q = new URLSearchParams({ OC: env.LAW_OC, target, type: 'JSON' });
  for (const [k, v] of url.searchParams) if (LAW_PARAMS.has(k) && v.length <= 200) q.set(k, v);
  const u = `https://www.law.go.kr/DRF/${kind === 'item' ? 'lawService' : 'lawSearch'}.do?${q}`;
  return passOn(await kept(ctx, u, 21600, () => fetch(u, { headers: lawHeaders(env), signal: AbortSignal.timeout(20000) }), realLaw), env.LAW_OC);
}

// 열린국회정보 (open.assembly.go.kr): one service by its code, parameters passed on (KEY and Type are set here). It answers a
// request that does not say what is making it with a bare "Bad Request.", so every request here says so (UA).
const ASSEMBLY_SERVICE = /^[A-Za-z0-9]{6,40}$/;
const ASM_TTL = { BPMBILLSUMMARY: 30 * 86400, VCONFBILLCONFLIST: 86400, BILLINFODETAIL: 6 * 3600 };   // others: an hour
const asmGet = (u) => fetch(u, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
// a real answer says INFO-000 (rows) or INFO-200 (none); ERROR-… (a missing value, the key, the day's limit: ERROR-337) is not kept
const realAssembly = (t) => /"CODE"\s*:\s*"INFO-(?:000|200)"|<CODE>INFO-(?:000|200)<\/CODE>/.test(t.slice(0, 1200));
async function assemblyApi(env, ctx, service, url) {
  if (!env.ASSEMBLY_KEY) return err('no_key', 503);
  if (!ASSEMBLY_SERVICE.test(service || '')) return err('bad_service', 400);
  const q = new URLSearchParams({ KEY: env.ASSEMBLY_KEY, Type: 'json', pIndex: '1', pSize: '20' });
  for (const [k, v] of url.searchParams) if (/^[A-Za-z_]{2,30}$/.test(k) && !/^(KEY|Type)$/i.test(k) && v.length <= 200) q.set(k, v);
  const u = `https://open.assembly.go.kr/portal/openapi/${service}?${q}`;
  return passOn(await kept(ctx, u, ASM_TTL[service] || 3600, () => asmGet(u), realAssembly), env.ASSEMBLY_KEY);
}

/* ---------------- 비교법 원문 ---------------- */
// A few foreign election laws for comparative work (일본·캐나다·미국), each from its official source and passed on as it
// comes (the app reads it): only these, by name — this is no way to fetch anything else. Kept at the edge for a day; an
// answer that is not the expected kind (a maintenance page) is passed over and not kept.
const FOREIGN = {
  'jp-koshoku': ['https://laws.e-gov.go.jp/api/2/law_data/325AC1000000100?law_full_text_format=json', /json/],   // 公職選挙法 (e-Gov 法令API)
  'jp-seiji': ['https://laws.e-gov.go.jp/api/2/law_data/323AC1000000194?law_full_text_format=json', /json/],     // 政治資金規正法
  'ca-elections': ['https://laws-lois.justice.gc.ca/eng/XML/E-2.01.xml', /xml/],                                   // Canada Elections Act (Justice Laws)
  // 52 U.S.C. Voting and Elections (govinfo's yearly editions, the newest that is there)
  // (govinfo answers a missing edition with its "Page Not Found" page, and status 200: told by its first bytes)
  'us-title52': [['2027', '2026', '2025', '2024'].map((y) => `https://www.govinfo.gov/content/pkg/USCODE-${y}-title52/html/USCODE-${y}-title52.htm`), /html/, /govinfo\.gov\/error|<title>[^<]*Page Not Found/i],
};
// the first bytes of a body (as text), and the whole body still to be read
async function peek(body, n = 4096) {
  const r = body.getReader(), first = await r.read();
  const head = first.value ? new TextDecoder().decode(first.value.slice(0, n)) : '';
  const rest = new ReadableStream({
    start(c) { if (first.done) c.close(); else c.enqueue(first.value); },
    async pull(c) { const { done, value } = await r.read(); if (done) c.close(); else c.enqueue(value); },
    cancel(reason) { return r.cancel(reason); },
  });
  return [head, rest];
}
async function foreignLaw(ctx, id) {
  // one section of 52 U.S.C. (선거법), through govinfo's link service: us52-30106 (§ 30106, the Federal Election Commission)
  const sec = /^us52-(\d{5})$/.exec(id);
  const src = sec ? [`https://www.govinfo.gov/link/uscode/52/${sec[1]}?type=usc&year=mostrecent&link-type=html`, /html/] : Object.prototype.hasOwnProperty.call(FOREIGN, id) ? FOREIGN[id] : null;
  if (!src) return err('bad_law', 400);
  const urls = [].concat(src[0]);
  const key = new Request(KEPT + 'foreign/' + id + '/' + (await sha256hex(urls.join(' '))).slice(0, 16));   // (a new source is a new key)
  const hit = await caches.default.match(key).catch(() => null);
  if (hit) return new Response(hit.body, { headers: { 'content-type': hit.headers.get('content-type') || 'application/octet-stream', 'x-source': hit.headers.get('x-source') || '', 'cache-control': 'private, max-age=3600' } });
  let last = 0;
  for (const u of urls) {   // the first source that gives the expected kind
    let up;
    try { up = await fetch(u, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000) }); } catch (e) { continue; }
    const type = up.headers.get('content-type') || '';
    if (!up.ok || !up.body || !src[1].test(type)) { last = up.status; if (up.body) await up.body.cancel().catch(() => {}); continue; }
    let body = up.body;
    if (src[2]) {   // its first bytes say it is not the law (a page saying there is no such edition): the next source
      const [head, rest] = await peek(body);
      if (src[2].test(head)) { await rest.cancel().catch(() => {}); continue; }
      body = rest;
    }
    const [a, b] = body.tee();
    ctx.waitUntil(caches.default.put(key, new Response(b, { headers: { 'content-type': type, 'x-source': u, 'cache-control': 'public, max-age=86400' } })).catch(() => {}));
    return new Response(a, { headers: { 'content-type': type, 'x-source': u, 'cache-control': 'private, max-age=3600' } });
  }
  return err('upstream', 502, { status: last });
}

/* ---------------- 국회 계류 법안 ---------------- */
// A law's bills now before the National Assembly (열린국회정보 계류의안: 의원·정부·위원장 제안), each with its gist and the
// articles it would change, both read from its 제안이유 및 주요내용 (BPMBILLSUMMARY). Kept in R2 (bills/<law>.json): the list
// is asked again after six hours, and each call reads the summaries of up to BILL_FILL more bills, newest first — a law with
// many bills (공직선거법: about 300) fills in over a few calls the first time, and after that only new bills are read.
const BILL_FRESH = 6 * 3600e3, BILL_FILL = 40, BILLS_V = 2;
const LAW_NAME = /^[가-힣A-Za-z0-9·ㆍ・ ,()「」-]{2,60}$/;
function assemblyAge(t = Date.now()) {   // the Assembly now sitting: the 22nd from 30 May 2024, a new one every four years
  const k = new Date(t + 9 * 3600e3);
  const y = k.getUTCFullYear() - (k.getUTCMonth() < 4 || (k.getUTCMonth() === 4 && k.getUTCDate() < 30) ? 1 : 0);
  return 22 + Math.floor((y - 2024) / 4);
}
const asmUrl = (env, service, params) => `https://open.assembly.go.kr/portal/openapi/${service}?${new URLSearchParams({ KEY: env.ASSEMBLY_KEY, Type: 'json', pIndex: '1', pSize: '100', ...params })}`;
// the rows of an answer ([] when there are none), or null when it is an error
function asmRows(text, service) {
  let d; try { d = JSON.parse(text); } catch { return null; }
  if (d && d.RESULT) return d.RESULT.CODE === 'INFO-200' ? { total: 0, rows: [] } : null;
  const top = d && d[service];
  if (!Array.isArray(top)) return null;
  const head = (top[0] && top[0].head) || [];
  const code = head[1] && head[1].RESULT && head[1].RESULT.CODE;
  if (code && !/^INFO-(?:000|200)$/.test(code)) return null;
  return { total: Number(head[0] && head[0].list_total_count) || 0, rows: (top[1] && top[1].row) || [] };
}
// a bill that amends the law (공직선거법 일부개정법률안, …전부개정법률안, 「공직선거법·정치자금법」 일부개정법률안), not one that only
// holds its name ("헌법재판소법" holds "헌법")
const dots = (t) => String(t || '').replace(/[·ㆍ・‧∙]/g, '·').replace(/\s+/g, ' ').trim();
function amends(name, law) {
  const n = dots(name), l = dots(law);
  if (!n.startsWith(l)) return false;
  const rest = n.slice(l.length);
  return rest === '' || /^[\s(·,]|^(?:일부|전부)?개정|^폐지|^중\s*개정/.test(rest);
}
function billStep(r) {   // how far it has gone, and since when
  if (r.LAW_PROC_DT) return [`법사위 ${r.LAW_PROC_RESULT_CD || '처리'}`, r.LAW_PROC_DT];
  if (r.LAW_PRESENT_DT) return ['법사위 상정', r.LAW_PRESENT_DT];
  if (r.LAW_SUBMIT_DT) return ['법사위 회부', r.LAW_SUBMIT_DT];
  if (r.CMT_PROC_DT) return [`위원회 ${r.CMT_PROC_RESULT_CD || '처리'}`, r.CMT_PROC_DT];
  if (r.CMT_PRESENT_DT) return ['위원회 상정', r.CMT_PRESENT_DT];
  if (r.COMMITTEE_DT) return ['위원회 회부', r.COMMITTEE_DT];
  return ['접수', r.PROPOSE_DT];
}
const billRow = (r) => {
  const [step, stepAt] = billStep(r);
  // once taken up in committee (상정) the committee's 검토보고서 exists, on the bill's page at 의안정보시스템
  return { id: r.BILL_ID, no: String(r.BILL_NO || ''), name: dots(r.BILL_NAME), by: dots(r.PROPOSER), kind: r.PROPOSER_KIND || '', date: r.PROPOSE_DT || '', cmt: r.CURR_COMMITTEE || '', step, stepAt: stepAt || '', review: !!r.CMT_PRESENT_DT };
};
// the articles a bill would change, as its 주요내용 names them: "(안 제24조제1항)" → 24; "(안 제6조의4 및 제6조의5 신설,
// 제151조제8항)" → 6의4, 6의5, 151; "(안 제59조부터 제61조까지)" → 59, 60, 61. Only brackets that begin with 안 are read (an
// article of another law is named as 「…법」 제N조 in the text); a summary without them gives its plain brackets "(제59조)".
function billArts(s) {
  const out = new Set(), t = String(s || '');
  const groups = [...t.matchAll(/\(\s*안\s*(제[^()]*)\)/g)].map((m) => m[1]);
  if (!groups.length) for (const m of t.matchAll(/(.)\(\s*(제\s*\d+\s*조[^()]*)\)/g)) if (m[1] !== '」') groups.push(m[2]);
  for (const g of groups) {
    for (const m of g.matchAll(/제\s*(\d+)\s*조(?:\s*의\s*(\d+))?(?:(?:\s*제\s*\d+\s*[항호])*\s*부터\s*제\s*(\d+)\s*조(?:\s*의\s*(\d+))?\s*까지)?/g)) {
      const a = Number(m[1]), sa = m[2] ? Number(m[2]) : 0;
      out.add(sa ? `${a}의${sa}` : String(a));
      if (!m[3]) continue;
      const b = Number(m[3]), sb = m[4] ? Number(m[4]) : 0;
      if (a === b) { for (let k = sa + 1; k < sb; k++) out.add(`${a}의${k}`); }
      else if (b > a && b - a <= 80) for (let k = a + 1; k <= b; k++) out.add(String(k));
      if (sb) out.add(`${b}의${sb}`);
    }
  }
  return [...out];
}
// what the bill does, in a line: its first 주요내용 item ("가. …"), or else the sentence that says what it would do ("이에 …것임")
function billGist(s) {
  // (a closing 참고사항 — "이 법률안은 …의 의결을 전제로 하는 것이므로 …" — says nothing of what the bill does)
  const t = String(s || '').replace(/\r/g, '').replace(/\n\s*참고사항[\s\S]*$/, '').replace(/\(\s*안\s*제[^()]*\)/g, '');
  const item = /주요내용\s*\n\s*(?:\n\s*)*가\.\s*([\s\S]*?)(?:\n\s*나\.|$)/.exec(t);
  let g = item ? item[1] : '';
  if (!g) {
    const body = t.replace(/^\s*제안이유(?:\s*및\s*주요내용)?\s*/, '');
    const sents = body.split(/(?<=[.])\s+/).map((x) => x.trim()).filter(Boolean);
    g = sents.find((x) => /^이에\s/.test(x)) || [...sents].reverse().find((x) => /것임\.?$/.test(x)) || sents[sents.length - 1] || '';
    g = g.replace(/^(?:이에\s*따라|이에|따라서|이러한\s*취지에서)\s*,?\s*/, '');
  }
  g = g.replace(/\s+/g, ' ').replace(/\.{2,}$/, '.').trim();
  return g.length > 150 ? g.slice(0, 148).replace(/\s+\S*$/, '') + '…' : g;
}
// how many points its 주요내용 lists (가. 나. 다. …), 0 when it is one paragraph
const billItems = (s) => (/주요내용\s*\n\s*(?:\n\s*)*가\./.test(String(s || '')) ? 1 + (String(s).match(/\n\s*[나다라마바사아자차카타파하]\.\s/g) || []).length : 0);
async function fillBill(env, x) {   // its gist and articles; false when 열린국회정보 did not answer (asked again next call)
  const r = await asmGet(asmUrl(env, 'BPMBILLSUMMARY', { BILL_NO: x.no, pSize: '1' })).catch(() => null);
  if (!r || !r.ok) return false;
  const d = asmRows(await r.text(), 'BPMBILLSUMMARY');
  if (!d) return false;
  const s = d.rows[0] && d.rows[0].SUMMARY;
  x.arts = s ? billArts(s) : []; x.gist = s ? billGist(s) : ''; x.items = billItems(s);
  if (s) delete x.retry; else x.retry = Date.now() + 864e5;   // a bill just received may have no summary yet: a day later, again
  return true;
}
async function billList(env, law, age) {
  const rows = [];
  for (let page = 1; page <= 3; page++) {
    const r = await asmGet(asmUrl(env, 'nwbqublzajtcqpdae', { AGE: String(age), BILL_NAME: law, pIndex: String(page), pSize: '1000' })).catch(() => null);
    if (!r || !r.ok) return null;
    const d = asmRows(await r.text(), 'nwbqublzajtcqpdae');
    if (!d) return null;
    rows.push(...d.rows);
    if (rows.length >= d.total || d.rows.length < 1000) break;
  }
  return rows.filter((x) => amends(x.BILL_NAME, law));
}
async function billsApi(env, url) {
  if (!env.ASSEMBLY_KEY) return err('no_key', 503);
  const law = dots(url.searchParams.get('law'));
  if (!LAW_NAME.test(law)) return err('bad_law', 400);
  const key = 'bills/' + law + '.json', age = assemblyAge(), now = Date.now();   // (LAW_NAME allows no '/')
  let b = await env.BUCKET.get(key).then((o) => (o ? o.json() : null)).catch(() => null);
  if (b && (b.v !== BILLS_V || b.age !== age)) b = null;
  let changed = false;
  if (!b || now - b.at > BILL_FRESH) {
    const got = await billList(env, law, age);
    if (got) {
      const old = new Map(((b && b.rows) || []).map((x) => [x.no, x]));
      const rows = got.map((r) => { const x = billRow(r), o = old.get(x.no); if (o && o.arts) { x.arts = o.arts; x.gist = o.gist; x.items = o.items || 0; if (o.retry) x.retry = o.retry; } return x; });
      rows.sort((p, q) => (q.date || '').localeCompare(p.date || '') || q.no.localeCompare(p.no));
      b = { v: BILLS_V, law, age, at: now, rows };
      changed = true;
    } else if (!b) return err('assembly_unavailable', 502);   // the list we have stays, and is asked again next time
  }
  const todo = b.rows.filter((x) => !x.arts || (x.retry && x.retry < now)).slice(0, BILL_FILL);
  if (todo.length && (await Promise.all(todo.map((x) => fillBill(env, x)))).some(Boolean)) changed = true;
  if (changed) await env.BUCKET.put(key, JSON.stringify(b), { httpMetadata: { contentType: 'application/json' } });
  const missing = b.rows.filter((x) => !x.arts).length;
  return json({ law, age, at: b.at, total: b.rows.length, missing, rows: b.rows.map(({ retry, ...x }) => x) });
}
// one bill: its 제안이유 및 주요내용 in full and the meetings that took it up (회의록, as PDF at record.assembly.go.kr)
async function billOne(env, ctx, url) {
  if (!env.ASSEMBLY_KEY) return err('no_key', 503);
  const no = url.searchParams.get('no') || '', id = url.searchParams.get('id') || '';
  if (!/^\d{6,9}$/.test(no) || !/^PRC_[A-Z0-9]{20,40}$/.test(id)) return err('bad_id', 400);
  const [s, m] = await Promise.all([
    kept(ctx, 'bill-summary:' + no, ASM_TTL.BPMBILLSUMMARY, () => asmGet(asmUrl(env, 'BPMBILLSUMMARY', { BILL_NO: no, pSize: '1' })), realAssembly),
    kept(ctx, 'bill-minutes:' + id, ASM_TTL.VCONFBILLCONFLIST, () => asmGet(asmUrl(env, 'VCONFBILLCONFLIST', { BILL_ID: id, pSize: '50' })), realAssembly),
  ]);
  const sd = s.ok ? asmRows(s.text, 'BPMBILLSUMMARY') : null, md = m.ok ? asmRows(m.text, 'VCONFBILLCONFLIST') : null;
  if (!sd && !md) return err('assembly_unavailable', 502);
  const summary = sd ? String((sd.rows[0] && sd.rows[0].SUMMARY) || '') : null;
  const minutes = md ? md.rows.map((x) => ({ kind: String(x.CONF_KND || '').trim(), sess: String(x.SESS || '').trim(), dgr: String(x.DGR || '').trim(), date: String(x.CONF_DT || '').trim(), url: String(x.DOWN_URL || '').replace(/^http:/, 'https:') }))
    .filter((x) => /^https:\/\/record\.assembly\.go\.kr\//.test(x.url)).sort((p, q) => p.date.localeCompare(q.date)) : null;
  return json({ summary, minutes });
}

// 공공데이터포털: https://apis.data.go.kr/<기관>/<서비스>[/<기능>]?serviceKey=… (one key for every API the owner applied for)
const DATA_SEG = /^(?!\.)[A-Za-z0-9_-]{1,60}(?:\.do)?$/;   // a name, or one ending in .do (법제처: lawSearchList.do); never '..'
// 법제처 (1170000: 국가법령정보 공유서비스, apis.data.go.kr/1170000/law) is approved for the owner's newer key (MOLEG_KEY);
// every other service there takes DATA_GO_KR_KEY
const dataKey = (env, segs) => (segs[0] === '1170000' && env.MOLEG_KEY) || env.DATA_GO_KR_KEY || env.MOLEG_KEY;
// the owner's keys, the one for this service first: a service approved later (한국연구재단 KCI, B552540) may know only one of them,
// so an answer that says the key is not registered for it is asked again with the other
const dataKeys = (env, segs) => [...new Set([dataKey(env, segs), env.DATA_GO_KR_KEY, env.MOLEG_KEY].filter(Boolean))];
const notRegistered = (t) => /SERVICE_KEY_IS_NOT_REGISTERED|<returnReasonCode>\s*(?:30|31)\s*</.test(t.slice(0, 1500));
// the portal's own refusals (an unregistered key, the day's limit, a retired service) and a service's error code are not kept
const realData = (t) => !/OpenAPI_ServiceResponse|<errMsg>|<returnReasonCode>|SERVICE_KEY_IS|LIMITED_NUMBER|"resultCode"\s*:\s*"(?!0+")|<resultCode>(?!0+<)/.test(t.slice(0, 1500));
async function dataApi(env, ctx, segs, url) {
  const keys = dataKeys(env, segs);
  if (!keys.length) return err('no_key', 503);
  if (!segs.every((x) => DATA_SEG.test(x))) return err('bad_service', 400);
  const params = [...url.searchParams].filter(([k, v]) => /^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(k) && !/^servicekey$/i.test(k) && v.length <= 300);
  let res;
  for (const key of keys) {
    const q = new URLSearchParams({ serviceKey: key });
    for (const [k, v] of params) q.set(k, v);
    const u = `https://apis.data.go.kr/${segs.join('/')}?${q}`;
    res = await kept(ctx, u, 3600, () => fetch(u, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) }), realData);
    if (!notRegistered(res.text)) break;
  }
  return passOn(res, keys);
}

// KCI OAI-PMH (open, no key): one record, or a page of records
// 국립중앙도서관 Open API: 소장자료 검색, KOLIS-NET 종합목록, ISBN 서지 — each with the owner's key (NL_KEY), parameters passed on
const NL_OPS = {
  search: ['https://www.nl.go.kr/NL/search/openApi/search.do', 'key'],
  kolisnet: ['https://www.nl.go.kr/NL/search/openApi/searchKolisNet.do', 'key'],
  seoji: ['https://www.nl.go.kr/seoji/SearchApi.do', 'cert_key'],
};
const realNl = (t) => /^\s*[{[<]/.test(t) && !/"error(?:Code)?"\s*:|<error/i.test(t.slice(0, 400));
async function nlApi(env, ctx, op, url) {
  if (!env.NL_KEY) return err('no_key', 503);
  const svc = NL_OPS[op];
  if (!svc) return err('bad_service', 400);
  const q = new URLSearchParams({ [svc[1]]: env.NL_KEY });
  for (const [k, v] of url.searchParams) if (/^[A-Za-z_]{2,30}$/.test(k) && !/^(key|cert_key)$/i.test(k) && v.length <= 300) q.set(k, v);
  const u = `${svc[0]}?${q}`;
  return passOn(await kept(ctx, u, 86400, () => fetch(u, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) }), realNl), env.NL_KEY);
}

// 국회도서관 국가학술정보 클라우드 Open API (losi-open.nanet.go.kr): 통합검색 (searchTotal) and 상세보기 (searchView), each asked
// by POST with the owner's key (authKey = NANET_KEY); only the parameters each one takes are passed on
const NANET_REL = new Set(['searchTerm', 'searchType', 'searchID', 'startYear', 'endYear']);
const NANET_OPS = {
  search: ['searchTotal', new Set(['searchTerm', 'searchType', 'searchSort', 'sortType', 'startYear', 'endYear', 'pageNo', 'printRowCnt', 'searchRange'])],
  view: ['searchView', new Set(['lodID', 'divFlag'])],
  author: ['authorView', new Set(['lodID', 'name_ko', 'name_en', 'orgName_ko', 'page', 'size'])],   // 연구자 정보
  subject: ['subjectView', new Set(['lodID'])],                                                       // 주제어 정보 (동의어·상위어·하위어·관련어)
  relAuthor: ['relAuthor', NANET_REL], relJournal: ['relJournal', NANET_REL],                          // 연관 연구자·학술지
  relPublisher: ['relPublisher', NANET_REL], relKeyword: ['relKeyword', NANET_REL],                    // 연관 발행기관·주제어
  trend: ['articleTrend', new Set(['searchTerm', 'searchType', 'searchID', 'searchRange'])],          // 학술정보 추이 (해마다 몇 편)
};
const nanetAsk = (env, path, params) => fetch(`http://losi-api.nanet.go.kr/${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', accept: 'application/json', 'user-agent': UA },
  body: new URLSearchParams({ authKey: env.NANET_KEY, ...params }).toString(),
  signal: AbortSignal.timeout(20000),
});
// a search is kept half a day, one record (상세·연구자·주제어) three days; the day's-limit answer ("트랙픽 양이 초과") is not kept
const realNanet = (t) => /^\s*\{/.test(t) && !/"error"\s*:/.test(t.slice(0, 800));
async function nanetApi(env, ctx, op, url) {
  if (!env.NANET_KEY) return err('no_key', 503);
  const svc = NANET_OPS[op];
  if (!svc) return err('bad_service', 400);
  const params = {};
  for (const [k, v] of url.searchParams) if (svc[1].has(k) && v.length <= 300) params[k] = v;
  if (['search', 'relAuthor', 'relJournal', 'relPublisher', 'relKeyword', 'trend'].includes(op) && !(params.searchTerm || '').trim()) return err('no_term', 400);
  if (op === 'view' && !(params.lodID && params.divFlag)) return err('no_id', 400);
  if ((op === 'subject' && !params.lodID) || (op === 'author' && !params.lodID && !params.name_ko)) return err('no_id', 400);
  const ttl = ['view', 'author', 'subject'].includes(op) ? 3 * 86400 : 12 * 3600;
  return passOn(await kept(ctx, 'nanet:' + svc[0] + ':' + JSON.stringify(Object.entries(params).sort()), ttl, () => nanetAsk(env, svc[0], params), realNanet), env.NANET_KEY);
}

// KISTI ScienceON API Gateway: a token is asked for with the owner's client id and, encrypted with the owner's key (AES-256-CBC,
// the gateway's fixed IV), the MAC address the owner registered and the time; the token (2 hours) and its refresh token (2 weeks)
// are kept in R2. Answers come as XML and are handed on as JSON: { total, rows: [{ CN, Title, Author, JournalName, … }] }.
const SO = 'https://apigateway.kisti.re.kr';
const SO_IV = 'jvHJ1EFA0IXBrxxz';   // given by the gateway's own sample code; the same for every user
const soReady = (env) => env.SCIENCEON_CLIENT_ID && env.SCIENCEON_KEY && env.SCIENCEON_MAC;
async function soAccounts(env) {
  const kst = new Date(Date.now() + 9 * 3600e3).toISOString().replace(/\D/g, '').slice(0, 14);   // YYYYMMDDHHmmss, Korean time
  const plain = JSON.stringify({ mac_address: env.SCIENCEON_MAC, datetime: kst });
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SCIENCEON_KEY), { name: 'AES-CBC' }, false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: new TextEncoder().encode(SO_IV) }, key, new TextEncoder().encode(plain)));
  let bin = ''; for (const b of ct) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return [b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), b64];   // as the gateway's sample sends it, and as its guide shows it
}
const soTime = (s) => { const t = Date.parse(String(s || '').replace(' ', 'T') + '+09:00'); return Number.isFinite(t) ? t : 0; };
async function soToken(env, fresh) {
  const kept = await env.BUCKET.get('auth/scienceon.json').then((o) => (o ? o.json() : null)).catch(() => null);
  if (!fresh && kept && kept.access && kept.accessUntil - Date.now() > 5 * 60e3) return kept.access;
  const ask = async (q) => {
    const r = await fetch(`${SO}/tokenrequest.do?${new URLSearchParams({ ...q, client_id: env.SCIENCEON_CLIENT_ID })}`, { signal: AbortSignal.timeout(15000) });
    const d = await r.json().catch(() => null);
    return d && d.access_token ? d : null;
  };
  let d = kept && kept.refresh && kept.refreshUntil - Date.now() > 60e3 ? await ask({ refresh_token: kept.refresh }) : null;
  if (!d) { const [safe, plain] = await soAccounts(env); d = await ask({ accounts: safe }) || await ask({ accounts: plain }); }
  if (!d) throw Object.assign(new Error('scienceon_token'), { status: 502 });
  const keep = { access: d.access_token, accessUntil: soTime(d.access_token_expire) || Date.now() + 110 * 60e3, refresh: d.refresh_token || (kept && kept.refresh), refreshUntil: soTime(d.refresh_token_expire) || (kept && kept.refreshUntil) || 0 };
  await env.BUCKET.put('auth/scienceon.json', JSON.stringify(keep), { httpMetadata: { contentType: 'application/json' } });
  return keep.access;
}
const xmlText = (s) => String(s || '').replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/\r/g, '').trim();
function soParse(xml) {
  const status = (/<statusCode>\s*(\d+)\s*<\/statusCode>/.exec(xml) || [])[1] || '';
  const code = (/<errorCode>\s*([^<]+)<\/errorCode>/.exec(xml) || [])[1] || '';
  const rows = [];
  for (const m of xml.matchAll(/<record\b[^>]*>([\s\S]*?)<\/record>/g)) {
    const row = {};
    for (const it of m[1].matchAll(/<item\s+metaCode="([A-Za-z0-9_]+)"[^>]*>([\s\S]*?)<\/item>/g)) row[it[1]] = xmlText(it[2]);
    rows.push(row);
  }
  return { status, code, total: Number((/<TotalCount>\s*(\d+)\s*<\/TotalCount>/i.exec(xml) || [])[1]) || 0, rows };
}
const SO_FIELDS = new Set(['BI', 'TI', 'AU', 'AB', 'KW', 'PB', 'SN', 'BN', 'PY', 'CN', 'DI']);
async function scienceonApi(env, op, url) {
  if (!soReady(env)) return err('no_key', 503);
  const q = { version: '1.0', target: 'ARTI' };
  if (op === 'search') {
    const field = SO_FIELDS.has(url.searchParams.get('field')) ? url.searchParams.get('field') : 'BI';
    const term = (url.searchParams.get('q') || '').trim().slice(0, 200);
    if (!term) return err('no_term', 400);
    Object.assign(q, { action: 'search', searchQuery: JSON.stringify({ [field]: term }), curPage: String(Math.max(1, Math.min(99, Number(url.searchParams.get('page')) || 1))), rowCount: String(Math.max(1, Math.min(50, Number(url.searchParams.get('rows')) || 20))) });
    const sort = url.searchParams.get('sort'); if (['pubyear', 'title', 'jtitle'].includes(sort)) q.sortField = sort;
  } else if (op === 'view') {
    const cn = url.searchParams.get('cn') || '';
    if (!/^[A-Z]{4}\d{8,20}$/.test(cn)) return err('no_id', 400);
    Object.assign(q, { action: 'browse', cn });
  } else return err('bad_service', 400);
  for (let round = 0; round < 2; round++) {
    const token = await soToken(env, round > 0);
    const r = await fetch(`${SO}/openapicall.do?${new URLSearchParams({ client_id: env.SCIENCEON_CLIENT_ID, token, ...q })}`, { signal: AbortSignal.timeout(20000) });
    const d = soParse(await r.text());
    if (d.status === '401' && round === 0) continue;   // the token ran out early: a new one, once
    if (d.status && d.status !== '200') return json({ error: 'scienceon', status: d.status, code: d.code }, 502);
    return json({ total: d.total, rows: d.rows });
  }
  return err('scienceon_token', 502);
}

const OAI_PARAMS = new Set(['verb', 'identifier', 'metadataPrefix', 'set', 'from', 'until', 'resumptionToken']);
const realKci = (t) => t.includes('<OAI-PMH') && !/<error\b/.test(t.slice(0, 3000));
async function kciOai(ctx, url) {
  const verb = url.searchParams.get('verb');
  if (!['GetRecord', 'ListRecords', 'ListIdentifiers', 'Identify', 'ListSets'].includes(verb)) return err('bad_verb', 400);
  const q = new URLSearchParams();
  for (const [k, v] of url.searchParams) if (OAI_PARAMS.has(k) && v.length <= 200) q.set(k, v);
  const u = `https://open.kci.go.kr/oai/request?${q}`;
  return passOn(await kept(ctx, u, 86400, () => fetch(u, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000) }), realKci), '');
}

// which outside sources answer, asked from where we run now (near the device that asked); the answer is kept for reading later
async function diag(req, env) {
  const tries = [
    ['kci', 'https://open.kci.go.kr/oai/request?verb=Identify'],
    ['law', env.LAW_OC && `https://www.law.go.kr/DRF/lawSearch.do?OC=${encodeURIComponent(env.LAW_OC)}&target=law&type=JSON&display=1&query=${encodeURIComponent('헌법')}`, lawHeaders(env)],
    ['assembly', env.ASSEMBLY_KEY && `https://open.assembly.go.kr/portal/openapi/nzmimeepazxkubdpn?KEY=${encodeURIComponent(env.ASSEMBLY_KEY)}&Type=json&pIndex=1&pSize=1&AGE=22`, { 'user-agent': UA, accept: 'application/json' }],
    ['data', env.DATA_GO_KR_KEY && `https://apis.data.go.kr/9750000/PrecedentInfomationService/getKorPrcdntList?serviceKey=${encodeURIComponent(env.DATA_GO_KR_KEY)}&type=json&numOfRows=1&pageNo=1&eventNo=${encodeURIComponent('2004헌마554')}`],
    ['nl', env.NL_KEY && `https://www.nl.go.kr/NL/search/openApi/search.do?key=${encodeURIComponent(env.NL_KEY)}&apiType=json&kwd=${encodeURIComponent('관습헌법')}&pageNum=1&pageSize=1`],
  ];
  const keys = [env.LAW_OC, env.ASSEMBLY_KEY, env.DATA_GO_KR_KEY, env.MOLEG_KEY, env.NL_KEY, env.NANET_KEY, env.SCIENCEON_CLIENT_ID, env.SCIENCEON_KEY, env.SCIENCEON_MAC].filter(Boolean);
  // the shape of each data.go.kr key (never its value): a 64-letter hex key is the portal's newer '일반 인증키'
  const shape = (k) => (k ? { len: k.length, hex: /^[0-9a-f]+$/i.test(k) } : null);
  const out = { at: Date.now(), colo: req.cf && req.cf.colo, country: req.cf && req.cf.country, keys: { DATA_GO_KR_KEY: shape(env.DATA_GO_KR_KEY), MOLEG_KEY: shape(env.MOLEG_KEY) }, results: {} };
  tries.push(['nanet', env.NANET_KEY && (() => nanetAsk(env, 'searchTotal', { searchTerm: '관습헌법', printRowCnt: '1' }))]);
  tries.push(['moleg', dataKey(env, ['1170000']) && `https://apis.data.go.kr/1170000/law/lawSearchList.do?${new URLSearchParams({ serviceKey: dataKey(env, ['1170000']), target: 'law', query: '공직선거법', numOfRows: '1', pageNo: '1' })}`]);
  tries.push(['scienceon', soReady(env) && (async () => { const t = await soToken(env); return fetch(`${SO}/openapicall.do?${new URLSearchParams({ client_id: env.SCIENCEON_CLIENT_ID, token: t, version: '1.0', action: 'search', target: 'ARTI', searchQuery: JSON.stringify({ BI: '관습헌법' }), rowCount: '1' })}`, { signal: AbortSignal.timeout(15000) }); })]);
  await Promise.all(tries.map(async ([k, u, headers]) => {
    if (!u) { out.results[k] = { status: 'no key' }; return; }
    try {
      const r = typeof u === 'function' ? await u() : await fetch(u, { headers: headers || {}, signal: AbortSignal.timeout(12000) });
      let t = (await r.text()).slice(0, 400);
      for (const key of keys) t = t.split(key).join('');
      t = t.replace(/\b[0-9A-Fa-f]{64}\b/g, '…');   // a token the answer repeats
      out.results[k] = { status: r.status, head: t };
    } catch (e) { out.results[k] = { error: String((e && e.message) || e).slice(0, 200) }; }
  }));
  await env.BUCKET.put('diag/last.json', JSON.stringify(out), { httpMetadata: { contentType: 'application/json' } });
  return json(out);
}

// An outside answer, kept at the edge for ttl seconds when real(text) says it is a real one (not an error, a daily-limit answer
// or a maintenance page, which go out again next time). id names the question (the URL asked, or a key of our own), hashed.
const KEPT = 'https://kept.bookshelf.invalid/';
async function kept(ctx, id, ttl, ask, real) {
  const key = new Request(KEPT + (await sha256hex(id)));
  const hit = await caches.default.match(key).catch(() => null);
  if (hit) return { ok: true, status: 200, type: hit.headers.get('content-type'), text: await hit.text() };
  let up;
  try { up = await ask(); } catch (e) { return { ok: false, status: 504, type: 'application/json', text: JSON.stringify({ error: 'upstream_unreachable' }) }; }
  const text = await up.text();
  const out = { ok: up.ok, status: up.status, type: up.headers.get('content-type'), text };
  if (up.ok && ttl > 0 && text.length <= 4 * 1024 * 1024 && real(text)) {
    ctx.waitUntil(caches.default.put(key, new Response(text, { headers: { 'content-type': out.type || 'text/plain; charset=utf-8', 'cache-control': `public, max-age=${ttl}` } })).catch(() => {}));
  }
  return out;
}
// the answer as it came, with the key taken out wherever it is echoed (links in the answer carry it)
function passOn(res, key) {
  let text = res.text;
  if (text.length > 4 * 1024 * 1024) return err('too_large', 502);
  for (const k of [].concat(key || [])) if (k) text = text.split(k).join('');
  return new Response(text, { status: res.ok ? 200 : 502, headers: { 'content-type': res.type || 'application/json; charset=utf-8', 'cache-control': 'private, max-age=600' } });
}

/* ---------------- sign-in ---------------- */

async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', typeof s === 'string' ? new TextEncoder().encode(s) : s);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function sameHex(a, b) {   // constant-time comparison of two hex strings
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
function token() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function cleanName(s, max = 40) {
  return String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function login(req, env) {
  if (!env.PIN_HASH || !env.PEPPER) return err('not_configured', 503);
  const now = Date.now();
  const failsObj = await env.BUCKET.get('auth/fails.json');
  let fails = failsObj ? await failsObj.json() : { count: 0, first: now, until: 0 };
  if (fails.until > now) return err('locked', 429, { until: fails.until });
  const body = await readJSON(req, 4096);
  const pin = String(body.pin || '');
  const ok = /^\d{6}$/.test(pin) && sameHex(await sha256hex(env.PEPPER + ':' + pin), env.PIN_HASH);
  if (!ok) {
    if (now - fails.first > 3600e3) fails = { count: 0, first: now, until: 0 };
    fails.count++;
    if (fails.count >= 8) { fails.until = now + 3600e3; fails.count = 0; fails.first = now; }
    await env.BUCKET.put('auth/fails.json', JSON.stringify(fails));
    return err(fails.until > now ? 'locked' : 'pin', fails.until > now ? 429 : 401, { left: fails.until > now ? 0 : 8 - fails.count, until: fails.until || undefined });
  }
  if (failsObj) await env.BUCKET.delete('auth/fails.json');
  const t = token();
  const key = 'auth/devices/' + (await sha256hex(t));
  const rec = { name: cleanName(body.device) || '기기', created: now, seen: now };
  await env.BUCKET.put(key, JSON.stringify(rec));
  return json({ token: t, device: publicDevice(rec, key) });
}

// Every request reads its device record afresh (no cache): a device signed out, or removed from the list, is out at once
// on every server instance. One small read per request stays far inside the free tier.

async function authenticate(req, env, ctx) {
  const h = req.headers.get('authorization') || '';
  const t = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(t)) return null;
  const key = 'auth/devices/' + (await sha256hex(t));
  const now = Date.now();
  const o = await env.BUCKET.get(key);
  if (!o) return null;
  const rec = { ...(await o.json()), key };
  if (now - (rec.seen || 0) > 3600e3) {   // remember when the device was last used, at most once an hour
    const save = { name: rec.name, created: rec.created, seen: now, ...(rec.kind ? { kind: rec.kind } : {}) };
    rec.seen = now;
    const w = env.BUCKET.put(key, JSON.stringify(save));
    if (ctx && ctx.waitUntil) ctx.waitUntil(w); else await w;
  }
  return rec;
}

function publicDevice(rec, key) { return { id: key.slice(-64, -52), name: rec.name, created: rec.created, seen: rec.seen, ...(rec.kind ? { kind: rec.kind } : {}) }; }

async function listDevices(env, me) {
  const out = [];
  let cursor;
  do {
    const l = await env.BUCKET.list({ prefix: 'auth/devices/', cursor, limit: 100 });
    for (const o of l.objects) {
      const g = await env.BUCKET.get(o.key);
      if (!g) continue;
      const rec = await g.json();
      out.push({ ...publicDevice(rec, o.key), current: o.key === me.key });
    }
    cursor = l.truncated ? l.cursor : undefined;
  } while (cursor);
  out.sort((a, b) => (b.seen || 0) - (a.seen || 0));
  return json({ devices: out });
}

// a key for the iPad/iPhone share menu (단축어 '책장에 넣기'): shown once, kept only as a hash like device keys
async function makeShareKey(req, env) {
  const body = await readJSON(req, 4096);
  const t = token();
  const key = 'auth/devices/' + (await sha256hex(t));
  const rec = { name: '공유로 넣기' + (cleanName(body.name, 30) ? ' · ' + cleanName(body.name, 30) : ''), kind: 'inbox', created: Date.now(), seen: 0 };
  await env.BUCKET.put(key, JSON.stringify(rec));
  return json({ token: t, device: publicDevice(rec, key) });
}

async function dropDevice(env, id, me) {
  if (!/^[0-9a-f]{12}$/.test(id)) return err('bad_id', 400);
  const l = await env.BUCKET.list({ prefix: 'auth/devices/' + id });
  for (const o of l.objects) await env.BUCKET.delete(o.key);
  return json({ ok: true, self: me.key.startsWith('auth/devices/' + id) });
}

/* ---------------- library index ---------------- */

const emptyIndex = () => ({ v: 1, rev: 0, updated: 0, folders: [], files: [] });

async function loadIndex(env) {
  const o = await env.BUCKET.get('lib/index.json');
  if (!o) return { idx: emptyIndex(), etag: null };
  const text = await o.text();
  return { idx: JSON.parse(text), etag: o.etag, text };
}

async function getIndex(env) {
  const { idx } = await loadIndex(env);
  return json(idx);
}

function newFolderOk(f) { return f && FOLDER_ID.test(f.id) && cleanName(f.name, 120); }
function isTrashedFolder(idx, id) {   // a folder counts as trashed when it or any parent is trashed
  const byId = new Map(idx.folders.map((f) => [f.id, f]));
  let f = byId.get(id), guard = 0;
  while (f && guard++ < 200) { if (f.trashed) return true; f = f.parent ? byId.get(f.parent) : null; }
  return false;
}
function descendants(idx, id) {   // all folder ids under (and including) id
  const out = new Set([id]); let grew = true;
  while (grew) { grew = false; for (const f of idx.folders) if (f.parent && out.has(f.parent) && !out.has(f.id)) { out.add(f.id); grew = true; } }
  return out;
}

// Apply a list of operations to the index. Returns the ids whose stored objects must be deleted (purged files).
function apply(idx, ops, dev, now) {
  const purge = [];
  const results = [];
  const file = (id) => idx.files.find((f) => f.id === id);
  const folder = (id) => idx.folders.find((f) => f.id === id);
  const validFolder = (id) => id === null || (folder(id) && !isTrashedFolder(idx, id));
  for (const op of ops) {
    let r = { ok: true };
    switch (op && op.op) {
      case 'addFile': {
        const f = op.file || {};
        if (!ID.test(f.id || '')) { r = { ok: false, error: 'bad_id' }; break; }
        const place = f.folder ?? null;
        if (!validFolder(place)) { r = { ok: false, error: 'no_folder' }; break; }
        const existing = file(f.id);
        if (existing && !existing.trashed) { r = { ok: false, error: 'exists', file: existing }; break; }
        const rec = {
          id: f.id, name: cleanName(f.name, 200) || '이름 없음.pdf', folder: place,
          size: Math.max(0, Number(f.size) || 0), pages: Math.max(0, Number(f.pages) || 0),
          added: now, modified: now, by: dev.name, trashed: null, thumb: !!f.thumb, text: !!f.text,
          orig: f.orig ? cleanName(f.orig, 200) || null : null,   // the file's own name, when it was tidied to 저자_제목
          ...(f.pending ? { pending: true } : {}),                   // came from the share menu: a device still has to prepare it
          ...(Number(f.scan) > 0 ? { scan: Math.min(100000, Math.floor(Number(f.scan))) } : {}),   // pages that are only a picture (a scan)
        };
        if (existing) Object.assign(existing, rec); else idx.files.push(rec);
        r.file = rec;
        break;
      }
      case 'updateFile': {
        const f = file(op.id);
        if (!f) { r = { ok: false, error: 'no_file' }; break; }
        const s = op.set || {};
        if ('name' in s) { const n = cleanName(s.name, 200); if (n) f.name = n; }
        if ('folder' in s) { if (!validFolder(s.folder ?? null)) { r = { ok: false, error: 'no_folder' }; break; } f.folder = s.folder ?? null; }
        for (const k of ['pages', 'scan']) if (k in s) f[k] = Math.max(0, Math.floor(Number(s[k])) || 0);
        if ('ocr' in s) f.ocr = Math.max(0, Number(s.ocr) || 0);   // when its scanned pages were read (0: not yet)
        for (const k of ['thumb', 'text']) if (k in s) f[k] = !!s[k];
        if ('pending' in s && !s.pending) delete f.pending;
        if ('stars' in s) { const v = Math.round(Number(s.stars)); f.stars = (v >= 1 && v <= 3) || v === -1 || v === -2 ? v : 0; f.rated = f.stars ? now : null; }   // after reading: 1–3 stars, -2 = △ (unclear; skim once more), -1 = ✕ (no need to come back); 0 clears
        if ('paper' in s) {   // where it was published (학술지 · 학회 · 권호 · 발간일), kept here so every device shows it at once
          const p = s.paper && typeof s.paper === 'object' ? s.paper : null;
          const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
          const date = String((p && p.date) || '');
          const v = p ? { journal: str(p.journal, 120), society: str(p.society, 120), issue: str(p.issue, 60), date: /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(date) ? date : '' } : null;
          if (v && (v.journal || v.date)) f.paper = v; else delete f.paper;
        }
        if (Object.keys(s).some((k) => k !== 'paper')) f.modified = now;   // a line filled in is not a change of the paper
        r.file = f;
        break;
      }
      case 'trashFile': { const f = file(op.id); if (!f) { r = { ok: false, error: 'no_file' }; break; } f.trashed = now; break; }
      case 'restoreFile': {
        const f = file(op.id); if (!f) { r = { ok: false, error: 'no_file' }; break; }
        f.trashed = null; if (!validFolder(f.folder)) f.folder = null;   // its folder is gone: back to the top
        break;
      }
      case 'purgeFile': {
        const i = idx.files.findIndex((f) => f.id === op.id);
        if (i >= 0) { purge.push(idx.files[i].id); idx.files.splice(i, 1); }
        break;
      }
      case 'addFolder': {
        const f = op.folder;
        if (!newFolderOk(f) || folder(f.id)) { r = { ok: false, error: 'bad_folder' }; break; }
        if (!validFolder(f.parent ?? null)) { r = { ok: false, error: 'no_folder' }; break; }
        idx.folders.push({ id: f.id, name: cleanName(f.name, 120), parent: f.parent ?? null, created: now, trashed: null });
        break;
      }
      case 'renameFolder': { const f = folder(op.id); const n = cleanName(op.name, 120); if (!f || !n) { r = { ok: false, error: 'bad_folder' }; break; } f.name = n; break; }
      case 'moveFolder': {
        const f = folder(op.id), to = op.parent ?? null;
        if (!f) { r = { ok: false, error: 'no_folder' }; break; }
        if (to !== null && (descendants(idx, f.id).has(to) || !validFolder(to))) { r = { ok: false, error: 'cycle' }; break; }
        f.parent = to;
        break;
      }
      case 'trashFolder': {
        const f = folder(op.id); if (!f) { r = { ok: false, error: 'no_folder' }; break; }
        f.trashed = now;
        break;
      }
      case 'restoreFolder': {
        const f = folder(op.id); if (!f) { r = { ok: false, error: 'no_folder' }; break; }
        f.trashed = null; if (f.parent && !validFolder(f.parent)) f.parent = null;
        break;
      }
      case 'purgeFolder': {
        const all = descendants(idx, op.id);
        for (const f of idx.files.filter((x) => all.has(x.folder))) purge.push(f.id);
        idx.files = idx.files.filter((x) => !all.has(x.folder));
        idx.folders = idx.folders.filter((x) => !all.has(x.id));
        break;
      }
      case 'emptyTrash': {
        const trashedFolders = idx.folders.filter((f) => f.trashed).map((f) => f.id);
        const gone = new Set(); for (const id of trashedFolders) for (const d of descendants(idx, id)) gone.add(d);
        for (const f of idx.files) if (f.trashed || gone.has(f.folder)) purge.push(f.id);
        idx.files = idx.files.filter((f) => !(f.trashed || gone.has(f.folder)));
        idx.folders = idx.folders.filter((f) => !gone.has(f.id));
        break;
      }
      default: r = { ok: false, error: 'bad_op' };
    }
    results.push(r);
  }
  // the trash empties itself after TRASH_DAYS (checked whenever the library changes)
  const old = now - TRASH_DAYS * 86400e3;
  const oldFolders = idx.folders.filter((f) => f.trashed && f.trashed < old).map((f) => f.id);
  const gone = new Set(); for (const id of oldFolders) for (const d of descendants(idx, id)) gone.add(d);
  for (const f of idx.files) if ((f.trashed && f.trashed < old) || gone.has(f.folder)) purge.push(f.id);
  idx.files = idx.files.filter((f) => !((f.trashed && f.trashed < old) || gone.has(f.folder)));
  idx.folders = idx.folders.filter((f) => !gone.has(f.id));
  return { purge: [...new Set(purge)], results };
}

async function applyOps(req, env, ctx, dev) {
  const body = await readJSON(req);
  const ops = Array.isArray(body.ops) ? body.ops.slice(0, 500) : [];
  if (!ops.length) return err('no_ops', 400);
  const r = await commit(env, ctx, ops, dev);
  return r ? json(r) : err('busy', 409);
}

async function commit(env, ctx, ops, dev) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { idx, etag, text } = await loadIndex(env);
    const now = Date.now();
    const today = kstDay(now);
    if (text && idx.snap !== today && idx.files.length) await snapshotLibrary(env, text);   // the day's first change: keep how it was
    const { purge, results } = apply(idx, ops, dev, now);
    idx.rev = (idx.rev || 0) + 1; idx.updated = now; idx.snap = today;
    const put = await env.BUCKET.put('lib/index.json', JSON.stringify(idx), {
      httpMetadata: { contentType: 'application/json' },
      onlyIf: etag ? { etagMatches: etag } : undefined,
    });
    if (put === null) { await new Promise((r) => setTimeout(r, 40 + Math.random() * 120)); continue; }   // someone wrote first: redo on the new copy
    if (purge.length) {
      // a purged id might still be in use by another entry only if the same PDF was re-added meanwhile; keep those
      const live = new Set(idx.files.map((f) => f.id));
      const keys = [];
      for (const id of purge) if (!live.has(id)) keys.push('files/' + id + '.pdf', 'meta/' + id + '/thumb.jpg', 'meta/' + id + '/text.json.gz', 'meta/' + id + '/ocr.json.gz', 'marks/' + id + '.json');
      if (keys.length) {
        const gone = purge.filter((id) => !live.has(id));
        const w = (async () => {
          await deleteMany(env, keys);
          for (const id of gone) { const l = await env.BUCKET.list({ prefix: 'backup/marks/' + id + '/', limit: 1000 }); if (l.objects.length) await deleteMany(env, l.objects.map((o) => o.key)); }
        })();
        if (ctx && ctx.waitUntil) ctx.waitUntil(w); else await w;
      }
    }
    return { index: idx, results };
  }
  return null;
}

/* ---------------- a PDF sent from the share menu ----------------
   The body is the PDF itself; ?name= is optional. The file goes to the top of the shelf marked 'pending':
   the next device that opens the app draws its thumbnail, indexes its text and tidies its name. */
const INBOX_MAX = 60 * 1024 * 1024;   // kept in memory to hash it; bigger files go through the app
async function inbox(req, env, ctx, dev, url) {
  if (Number(req.headers.get('content-length') || 0) > INBOX_MAX) return err('too_large', 413);
  const buf = await req.arrayBuffer();
  if (buf.byteLength > INBOX_MAX) return err('too_large', 413);
  const head = new TextDecoder('latin1').decode(new Uint8Array(buf, 0, Math.min(1024, buf.byteLength)));
  if (buf.byteLength < 16 || !head.includes('%PDF-')) return err('not_pdf', 415);
  const id = (await sha256hex(buf)).slice(0, 24);
  if (!(await env.BUCKET.head('files/' + id + '.pdf')) && !(await roomFor(env, buf.byteLength))) return err('full', 507);
  let name = cleanName(url.searchParams.get('name') || '', 200).replace(/[\\/]+/g, ' ').trim();
  if (name && !/\.pdf$/i.test(name)) name += '.pdf';
  if (!(await env.BUCKET.head('files/' + id + '.pdf'))) await env.BUCKET.put('files/' + id + '.pdf', buf, { httpMetadata: { contentType: 'application/pdf' } });
  const r = await commit(env, ctx, [{ op: 'addFile', file: { id, name: name || '공유로 넣은 PDF.pdf', orig: name || null, folder: null, size: buf.byteLength, pages: 0, thumb: false, text: false, pending: true } }], dev);
  if (!r) return err('busy', 409);
  const res = r.results[0];
  if (!res.ok && res.error === 'exists') return json({ ok: true, dup: true, id, name: res.file && res.file.name });
  if (!res.ok) return err(res.error || 'failed', 400);
  return json({ ok: true, id, name: res.file.name });
}

async function deleteMany(env, keys) {
  for (let i = 0; i < keys.length; i += 900) await env.BUCKET.delete(keys.slice(i, i + 900));
}

/* ---------------- files ---------------- */

function parseRange(h, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(h || '');
  if (!m) return null;
  let start, end;
  if (m[1] === '' && m[2] === '') return null;
  if (m[1] === '') { const n = Number(m[2]); start = Math.max(0, size - n); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start > end || start >= size) return 'bad';
  return { offset: start, length: end - start + 1 };
}

async function getFile(req, env, id, headOnly) {
  const key = 'files/' + id + '.pdf';
  const head = await env.BUCKET.head(key);
  if (!head) return err('no_file', 404);
  const size = head.size;
  const base = {
    'content-type': 'application/pdf', 'accept-ranges': 'bytes', etag: head.httpEtag,
    'cache-control': 'private, max-age=31536000, immutable',   // the id is the content's hash: the bytes never change
  };
  const range = parseRange(req.headers.get('range'), size);
  if (range === 'bad') return new Response(null, { status: 416, headers: { ...base, 'content-range': `bytes */${size}` } });
  if (headOnly) return new Response(null, { status: 200, headers: { ...base, 'content-length': String(size) } });
  if (range) {
    const o = await env.BUCKET.get(key, { range });
    if (!o) return err('no_file', 404);
    return new Response(o.body, { status: 206, headers: { ...base, 'content-length': String(range.length), 'content-range': `bytes ${range.offset}-${range.offset + range.length - 1}/${size}` } });
  }
  const o = await env.BUCKET.get(key);
  if (!o) return err('no_file', 404);
  return new Response(o.body, { status: 200, headers: { ...base, 'content-length': String(size) } });
}

/* ---------------- staying inside the free tier ----------------
   R2 charges only past 10GB stored; the shelf takes new PDFs only while all of them (the trash included, which
   still takes space until it is emptied) stay under 9GB, so thumbnails, page texts, marks and backups always fit. */
function capBytes(env) { const c = Number(env.CAP_BYTES); return c > 0 ? c : 9 * 1024 ** 3; }
async function roomFor(env, bytes) {
  const { idx } = await loadIndex(env);
  return idx.files.reduce((s, f) => s + (f.size || 0), 0) + bytes <= capBytes(env);
}

async function putFile(req, env, id) {
  const key = 'files/' + id + '.pdf';
  const len = Number(req.headers.get('content-length') || 0);
  if (!len) return err('length_required', 411);
  const have = await env.BUCKET.head(key);
  if (have && have.size === len) { await req.body?.cancel?.(); return json({ ok: true, size: have.size, existed: true }); }   // the same bytes are already there
  if (!(await roomFor(env, len))) return err('full', 507);   // the unread body is simply dropped
  const o = await env.BUCKET.put(key, req.body, { httpMetadata: { contentType: 'application/pdf' } });
  if (!o) return err('write_failed', 500);
  if (o.size !== len) { await env.BUCKET.delete(key); return err('incomplete', 400); }
  return json({ ok: true, size: o.size });
}

async function multipart(req, env, id, rest) {
  const key = 'files/' + id + '.pdf';
  const m = req.method;
  if (rest.length === 0 && m === 'POST') {
    const body = await readJSON(req, 4096).catch(() => ({}));
    const size = Number(body && body.size);
    if (!(size > 0)) return err('size_required', 411);
    if (!(await roomFor(env, size))) return err('full', 507);
    const up = await env.BUCKET.createMultipartUpload(key, { httpMetadata: { contentType: 'application/pdf' } });
    return json({ uploadId: up.uploadId });
  }
  const uploadId = rest[0];
  if (!uploadId || uploadId.length > 1024) return err('bad_upload', 400);
  const up = env.BUCKET.resumeMultipartUpload(key, uploadId);
  if (rest.length === 2 && m === 'PUT') {
    const n = Number(rest[1]);
    if (!Number.isInteger(n) || n < 1 || n > 10000) return err('bad_part', 400);
    const part = await up.uploadPart(n, req.body);
    return json({ partNumber: part.partNumber, etag: part.etag });
  }
  if (rest.length === 2 && rest[1] === 'complete' && m === 'POST') {
    const body = await readJSON(req);
    const parts = (body.parts || []).map((x) => ({ partNumber: Number(x.partNumber), etag: String(x.etag) }));
    const o = await up.complete(parts);
    return json({ ok: true, size: o.size });
  }
  if (rest.length === 1 && m === 'DELETE') { await up.abort(); return json({ ok: true }); }
  return err('not_found', 404);
}

/* ---------------- thumbnails and page text ---------------- */

const META = { thumb: { key: 'thumb.jpg', type: 'image/jpeg' }, text: { key: 'text.json.gz', type: 'application/gzip' }, ocr: { key: 'ocr.json.gz', type: 'application/gzip' } };

async function getMeta(env, id, kind) {
  const o = await env.BUCKET.get('meta/' + id + '/' + META[kind].key);
  if (!o) return err('no_meta', 404);
  return new Response(o.body, { status: 200, headers: { 'content-type': META[kind].type, 'content-length': String(o.size), 'cache-control': 'private, max-age=604800' } });
}

async function putMeta(req, env, id, kind) {
  const len = Number(req.headers.get('content-length') || 0);
  if (!len) return err('length_required', 411);
  if (len > MAX_META) return err('too_large', 413);
  const o = await env.BUCKET.put('meta/' + id + '/' + META[kind].key, req.body, { httpMetadata: { contentType: META[kind].type } });
  return json({ ok: true, size: o ? o.size : 0 });
}

/* ---------------- highlights and underlines ---------------- */

function cleanMark(x) {
  if (!x || typeof x.id !== 'string' || x.id.length > 48 || !Number.isFinite(x.t)) return null;
  if (x.del) return { id: x.id, del: true, t: x.t };
  if (!Number.isInteger(x.p) || x.p < 0 || x.p > 100000) return null;
  if (x.kind !== 'hl' && x.kind !== 'ul') return null;
  if (!MARK_COLORS.test(x.color || '')) return null;
  if (!Array.isArray(x.rects) || !x.rects.length || x.rects.length > 400) return null;
  const rects = [];
  for (const r of x.rects) {
    if (!Array.isArray(r) || r.length !== 4 || !r.every((v) => Number.isFinite(v) && v > -0.05 && v < 1.05)) return null;
    rects.push(r.map((v) => Math.round(v * 1e5) / 1e5));
  }
  return { id: x.id, p: x.p, kind: x.kind, color: x.color.toUpperCase(), rects, text: String(x.text || '').slice(0, 6000), t: x.t };
}

async function getMarks(env, id) {
  const o = await env.BUCKET.get('marks/' + id + '.json');
  if (!o) return json({ rev: 0, marks: [], tag: '' });
  return json({ ...(await o.json()), tag: o.etag });
}

// every paper's marks version, in one listing: a device compares them with what it keeps and fetches only what changed
async function marksTags(env) {
  const tags = {};
  let cursor;
  do {
    const l = await env.BUCKET.list({ prefix: 'marks/', cursor, limit: 1000 });
    for (const o of l.objects) { const k = /^marks\/([0-9a-f]{24})\.json$/.exec(o.key); if (k) tags[k[1]] = o.etag; }
    cursor = l.truncated ? l.cursor : null;
  } while (cursor);
  return json({ tags });
}

/* ---------------- backups ----------------
   Before the first change of a day, the way things were is kept: a paper's marks under backup/marks/<id>/, the library
   under backup/lib/. Nothing runs on a timer and nothing is copied that did not change. Kept for 60 days. */
const KEEP_BACKUP_DAYS = 60;
const kstDay = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);   // the owner's calendar day (Korea)
const liveCount = (marks) => (marks || []).filter((x) => !x.del).length;
async function snapshotMarks(env, id, text, cur) {
  const now = Date.now();
  await env.BUCKET.put('backup/marks/' + id + '/' + now + '.json', text, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { updated: String(cur.updated || 0), n: String(liveCount(cur.marks)) },
  });
  const old = [];
  const l = await env.BUCKET.list({ prefix: 'backup/marks/' + id + '/', limit: 1000 });
  for (const o of l.objects) { const ts = Number(o.key.split('/').pop().replace('.json', '')); if (ts && ts < now - KEEP_BACKUP_DAYS * 86400e3) old.push(o.key); }
  if (old.length) await deleteMany(env, old);
}
async function snapshotLibrary(env, text) {
  const day = kstDay();
  await env.BUCKET.put('backup/lib/' + day + '.json', text, { httpMetadata: { contentType: 'application/json' } });
  const cut = kstDay(Date.now() - KEEP_BACKUP_DAYS * 86400e3);
  const l = await env.BUCKET.list({ prefix: 'backup/lib/', limit: 1000 });
  const old = l.objects.map((o) => o.key).filter((k) => k.slice('backup/lib/'.length, 'backup/lib/'.length + 10) < cut);
  if (old.length) await deleteMany(env, old);
}

// a paper's earlier marks: when each was last changed and how many marks it had, newest first
async function marksHistory(env, id) {
  const l = await env.BUCKET.list({ prefix: 'backup/marks/' + id + '/', limit: 1000, include: ['customMetadata'] });
  const seen = new Set(), list = [];
  for (const o of l.objects.sort((a, b) => (a.key < b.key ? 1 : -1))) {
    const ts = Number(o.key.split('/').pop().replace('.json', ''));
    const cm = o.customMetadata || {};
    const updated = Number(cm.updated) || 0, n = Number(cm.n) || 0;
    if (!ts || !n || seen.has(updated)) continue;   // an empty one is nothing to bring back; the same version twice is shown once
    seen.add(updated);
    list.push({ ts, updated, n });
  }
  return json({ list });
}

// bring a paper's marks back to an earlier version. What is there now is kept first, so this too can be undone.
// The marks come back as new edits (newer than any device's copy), so syncing cannot undo the restore.
async function restoreMarks(req, env, id) {
  const body = await readJSON(req, 4096);
  const ts = Number(body && body.ts);
  if (!Number.isInteger(ts) || ts <= 0) return err('bad_ts', 400);
  const b = await env.BUCKET.get('backup/marks/' + id + '/' + ts + '.json');
  if (!b) return err('not_found', 404);
  const back = await b.json();
  for (let attempt = 0; attempt < 8; attempt++) {
    const o = await env.BUCKET.get('marks/' + id + '.json');
    const text = o ? await o.text() : null;
    const cur = text ? JSON.parse(text) : { rev: 0, marks: [] };
    if (text && liveCount(cur.marks)) await snapshotMarks(env, id, text, cur);
    const now = Date.now();
    const keep = new Map((back.marks || []).filter((x) => !x.del).map((x) => [x.id, { ...x, t: now }]));
    const marks = [];
    for (const x of cur.marks || []) if (!keep.has(x.id)) marks.push(x.del ? x : { id: x.id, del: true, t: now });
    marks.push(...keep.values());
    marks.sort((a, c) => (a.p - c.p) || ((a.rects?.[0]?.[1] ?? 0) - (c.rects?.[0]?.[1] ?? 0)));
    const next = { rev: (cur.rev || 0) + 1, updated: now, snap: kstDay(now), marks };
    const put = await env.BUCKET.put('marks/' + id + '.json', JSON.stringify(next), {
      httpMetadata: { contentType: 'application/json' }, onlyIf: o ? { etagMatches: o.etag } : undefined,
    });
    if (put === null) { await new Promise((r) => setTimeout(r, 30 + Math.random() * 90)); continue; }
    return json({ ...next, tag: put.etag });
  }
  return err('busy', 409);
}

async function putMarks(req, env, id) {
  const body = await readJSON(req);
  const incoming = (Array.isArray(body.marks) ? body.marks : []).slice(0, 20000).map(cleanMark).filter(Boolean);
  for (let attempt = 0; attempt < 8; attempt++) {
    const o = await env.BUCKET.get('marks/' + id + '.json');
    const text = o ? await o.text() : null;
    const cur = text ? JSON.parse(text) : { rev: 0, marks: [] };
    const today = kstDay();
    if (text && cur.snap !== today && liveCount(cur.marks)) await snapshotMarks(env, id, text, cur);   // the day's first change: keep how it was
    const byId = new Map(cur.marks.map((x) => [x.id, x]));
    for (const x of incoming) { const old = byId.get(x.id); if (!old || x.t >= old.t) byId.set(x.id, x); }
    const keepDeleted = Date.now() - 120 * 86400e3;   // forget deletions after four months
    const marks = [...byId.values()].filter((x) => !x.del || x.t > keepDeleted).sort((a, b) => (a.p - b.p) || ((a.rects?.[0]?.[1] ?? 0) - (b.rects?.[0]?.[1] ?? 0)));
    const next = { rev: (cur.rev || 0) + 1, updated: Date.now(), snap: today, marks };
    const put = await env.BUCKET.put('marks/' + id + '.json', JSON.stringify(next), {
      httpMetadata: { contentType: 'application/json' }, onlyIf: o ? { etagMatches: o.etag } : undefined,
    });
    if (put === null) { await new Promise((r) => setTimeout(r, 30 + Math.random() * 90)); continue; }
    return json({ ...next, tag: put.etag });
  }
  return err('busy', 409);
}

/* ---------------- what changed (asked every few seconds while the app is open on a device) ----------------
   The device sends the versions it already has; only what differs comes back. Usually that is nothing. */
async function pull(env, url) {
  const q = url.searchParams, out = {};
  const look = async (key, have, name) => {
    const h = await env.BUCKET.head(key);
    if (!h) return;
    out[name + 'Tag'] = h.etag;
    if (h.etag === have) return;
    const o = await env.BUCKET.get(key);
    if (o) { out[name] = await o.json(); out[name + 'Tag'] = o.etag; }
  };
  await look('lib/index.json', q.get('lib') || '', 'lib');
  await look('state.json', q.get('state') || '', 'state');
  const id = q.get('marks');
  if (id && ID.test(id)) await look('marks/' + id + '.json', q.get('mtag') || '', 'marks');
  return json(out);
}

/* ---------------- reading positions ---------------- */

async function getState(env) {
  const o = await env.BUCKET.get('state.json');
  return json(o ? await o.json() : { files: {} });
}

async function putState(req, env) {
  const body = await readJSON(req, 1024 * 1024);
  const inc = body && typeof body.files === 'object' && body.files ? body.files : {};
  for (let attempt = 0; attempt < 8; attempt++) {
    const o = await env.BUCKET.get('state.json');
    const cur = o ? await o.json() : { files: {} };
    for (const [id, s] of Object.entries(inc)) {
      if (!ID.test(id) || !s || !Number.isFinite(s.at)) continue;
      const v = { page: Math.max(0, Math.floor(Number(s.page) || 0)), y: Math.min(1, Math.max(0, Number(s.y) || 0)), at: s.at, done: !!s.done };
      if (Number.isInteger(s.o) && s.o >= 0 && s.o < 100000) v.o = s.o;   // printed page = page + 1 + o
      if (!cur.files[id] || v.at >= cur.files[id].at) cur.files[id] = v;
    }
    const ids = Object.keys(cur.files);
    if (ids.length > 6000) { ids.sort((a, b) => cur.files[a].at - cur.files[b].at); for (const id of ids.slice(0, ids.length - 6000)) delete cur.files[id]; }
    const put = await env.BUCKET.put('state.json', JSON.stringify(cur), { httpMetadata: { contentType: 'application/json' }, onlyIf: o ? { etagMatches: o.etag } : undefined });
    if (put === null) { await new Promise((r) => setTimeout(r, 30 + Math.random() * 90)); continue; }
    return json(cur);
  }
  return err('busy', 409);
}
