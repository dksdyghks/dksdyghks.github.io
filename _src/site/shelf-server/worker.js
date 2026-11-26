// 서재 server: one Cloudflare Worker in front of one R2 bucket, for a single owner.
//
// Sign-in: the owner's 6-digit PIN, kept here only as a peppered SHA-256 hash (env.PIN_HASH, env.PEPPER are secrets).
//   A correct PIN gives the device a long random token; the token is what every later request carries.
//   Tries are limited per address and slowed down for everyone (see login): 8 wrong PINs from one address within an hour lock
//   that address for the hour; past 30 wrong PINs within an hour from anywhere, sign-in takes one try a minute.
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
//   prefs.json                     a few choices kept across devices: the KCI papers set aside (관심 없음), newest wins
//   auth/devices/<sha256(token)>   one small record per signed-in device
//   auth/try/<addr>/<ms>-<r>       one sign-in try from one address (a hash of it), kept an hour unless the PIN was right
//   auth/tryall/<ms>-<r>           the same try, among everyone's
//   auth/known/<addr>              an address the right PIN came from (not slowed when many addresses try; see login)
//   write/style.json               the owner's writing style as Claude described it from the owner's own papers (글쓰기)
//   write/use.json                 글쓰기 requests counted for the day (the owner's day, in Korea), for the daily cap, and
//                                  what they cost (estimated from the usage Anthropic reports), for the day's budget
//   write/last.json                the latest 글쓰기 answer as it was streamed (so an app that lost the connection gets it)
//   write/stop.json                the id of a 글쓰기 answer the owner stopped (read by the request still running)
//   ccourt/unconst.json            위헌결정 법률현황 + 미개정 위헌·헌법불합치 법령, one compact list (the cron, daily)
//   acrc/m/<YYYY-MM>.json          행정심판 재결례 of one month (the cron gathers them, newest first, three years back)
//   acrc/index.json                all of them, compact, for the app to search by words; acrc/state.json what is gathered
//   acrc/part.json                 a month half gathered (carried to the next run); acrc/body/<incdntNo>.json one 재결's text
//   diag/days.json                 the daily check, one entry a day, 14 days; cron/state.json what the cron did last
//
// Lookups asked through here, so their keys never leave the server (secrets set in the Cloudflare dashboard):
//   /api/law/search|item   국가법령정보 공동활용 (법령·판례·헌재결정례…): env.LAW_OC
//   /api/assembly/<service> 열린국회정보 (의안 등): env.ASSEMBLY_KEY
//   /api/bills?law=…        국회 계류 법안 of one law, with the articles each would change (kept in R2: bills/<law name>.json)
//   /api/bills/one?no=&id=  one bill's 제안이유 및 주요내용 and the meetings that took it up (회의록)
//   /api/data/<기관>/<서비스>[/<기능>] 공공데이터포털 (헌법재판소·국회입법조사처·법제처): env.DATA_GO_KR_KEY (법제처 1170000: env.MOLEG_KEY)
//   /api/kci/oai            KCI OAI-PMH (no key)
//   /api/kci/search         KCI Open API 논문 검색 (articleSearch by words; articleDetail by id): env.KCI_KEY
//   /api/nl/<op>            국립중앙도서관 (소장자료·KOLIS-NET·ISBN 서지): env.NL_KEY
//   /api/nanet/<op>          국회도서관 국가학술정보 클라우드 (통합검색·상세보기·연구자·주제어·연관 연구자/학술지/발행기관/주제어·추이): env.NANET_KEY
//   /api/scienceon/search|view  KISTI ScienceON 논문 (권호·쪽·초록·DOI·원문): env.SCIENCEON_CLIENT_ID, SCIENCEON_KEY, SCIENCEON_MAC
//                           (its access token, issued with those, is kept in R2 at auth/scienceon.json and renewed when it runs out)
//   /api/foreign/<id>       비교법 원문: a few foreign election laws from their official sources, by name only (FOREIGN)
//   /api/diag               which of these answer, asked from where the device is (Cloudflare runs us near it); kept in diag/last.json
//   /api/write              글쓰기 도우미: Anthropic's Messages API (Claude), the answer streamed on: env.ANTHROPIC_API_KEY
//   /api/ccourt/<op>        헌재 소식 (schedule, day, recent, outline, hearings, hearing) and unconst (위헌·헌법불합치 법령)
//   /api/nars/reports       국회입법조사처 발간물 by title words and kind (its PDF goes on the shelf through /api/paper/pdf)
//   /api/acrc/<op>          행정심판 재결례: index, month, body (one 재결's 주문·청구취지·이유·관련 법령)
//                           (these three: 공공데이터포털 with env.DATA_GO_KR_KEY, answers trimmed to what the app shows)
// The cron (scheduled, hourly): the daily self-check (/api/diag/last: 14 days, sources failing two days in a row), the
// 위헌 법령 list, and 행정심판 재결례 a few asks a run.
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
  // the hourly cron (deploy.py registers it): the daily self-check, the 위헌 법령 list, 행정심판 재결례 month by month
  async scheduled(event, env, ctx) {
    await cronRun(env, ctx, Number(event && event.scheduledTime) || Date.now());
  },
};

function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin);
  return {
    'access-control-allow-origin': ok ? origin : (allowed[0] || 'null'),
    'access-control-allow-methods': 'GET, HEAD, PUT, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, range, if-match, x-file-name',
    'access-control-expose-headers': 'etag, content-length, content-range, accept-ranges, x-pdf-source',
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
    if (p[1] === 'login' && m === 'POST') return await login(req, env, ctx);
    if (p[1] === 'ping') return json({ ok: true, at: Date.now() });
    const dev = await authenticate(req, env, ctx);
    if (!dev) return err('auth', 401);
    // the outside sources' check, once from Korea after one ran elsewhere: KISTI ScienceON and some public sites answer Korean
    // addresses only, so a check made abroad says little; it runs beside the owner's own request and never delays it
    if (dev.kind !== 'inbox' && req.cf && req.cf.country === 'KR') ctx.waitUntil(diagFromKorea(req, env).catch(() => {}));
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
      case 'prefs':
        if (m === 'GET' && p.length === 2) return await getPrefs(env);
        if (m === 'PUT' && p.length === 2) return await putPrefs(req, env);
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
        if (m === 'GET' && p[2] === 'search' && p.length === 3) return await kciSearch(env, ctx, url);
        break;
      case 'paper':
        if (m === 'POST' && p[2] === 'pdf' && p.length === 3) return await paperPdf(req, env, ctx);
        break;
      case 'nanet':
        if (m === 'GET' && p.length === 3) return await nanetApi(env, ctx, p[2], url);
        break;
      case 'scienceon':
        if (m === 'GET' && p.length === 3) return await scienceonApi(env, p[2], url);
        break;
      case 'embed':
        if (m === 'POST' && p.length === 2) return await embed(req, env);
        break;
      case 'write':
        if (m === 'GET' && p.length === 2) return await writeInfo(env);
        if (m === 'POST' && p.length === 2) return await writeAsk(req, env, ctx);
        if (m === 'GET' && p[2] === 'style' && p.length === 3) return await writeStyle(env);
        if (m === 'GET' && p[2] === 'last' && p.length === 3) return await writeLast(env, url);
        if (m === 'POST' && p[2] === 'stop' && p.length === 3) return await writeStop(req, env);
        break;
      case 'diag':
        if (m === 'GET' && p.length === 2) return await diag(req, env);
        if (m === 'GET' && p[2] === 'last' && p.length === 3) return await diagLast(env);
        break;
      case 'ccourt':   // 헌재 소식 (선고·변론 일정, 주요 결정·개요) and 위헌·헌법불합치 법령
        if (m === 'GET' && p.length === 3) return await ccourtApi(env, ctx, p[2], url);
        break;
      case 'nars':   // 국회입법조사처 발간물
        if (m === 'GET' && p[2] === 'reports' && p.length === 3) return await narsReports(env, ctx, url);
        break;
      case 'acrc':   // 행정심판 재결례 (gathered by the cron)
        if (m === 'GET' && p.length === 3) return await acrcApi(env, p[2], url);
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
const realLaw = (t) => /^\s*[{[]/.test(t) && !/^\s*\{\s*"result"\s*:/.test(t);   // JSON, and not its refusal ({"result": …})
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
// one bill's summary or meetings: kept only when there are rows (a bill just received has none yet, and soon will)
const realRows = (t) => /"CODE"\s*:\s*"INFO-000"/.test(t.slice(0, 1200));
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
  const r = body.getReader(), got = [];
  let size = 0, done = false;
  while (size < n && !done) { const c = await r.read(); done = c.done; if (c.value) { got.push(c.value); size += c.value.length; } }
  const all = new Uint8Array(size); let at = 0; for (const c of got) { all.set(c, at); at += c.length; }
  const head = new TextDecoder().decode(all.slice(0, n));
  const rest = new ReadableStream({
    start(c) { if (size) c.enqueue(all); if (done) c.close(); },
    async pull(c) { if (done) return; const x = await r.read(); if (x.done) c.close(); else c.enqueue(x.value); },
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
// a bill that amends the law (공직선거법 일부개정법률안, …전부개정법률안, and a bill of two laws: 공직선거법ㆍ정치자금법 일부개정법률안,
// 정당법 및 공직선거법 일부개정법률안), not one that only holds its name ("헌법재판소법" holds "헌법")
const dots = (t) => String(t || '').replace(/[·ㆍ・‧∙]/g, '·').replace(/\s+/g, ' ').trim();
function amends(name, law) {
  const n = dots(name).replace(/[「」]/g, ''), l = dots(law);
  for (let at = n.indexOf(l); at >= 0; at = n.indexOf(l, at + 1)) {
    const before = n.slice(0, at), rest = n.slice(at + l.length);
    if (before && !/(?:·|,|및)\s*$/.test(before)) continue;   // at the start, or after another law of the same bill
    if (rest === '' || /^\s*(?:(?:일부|전부)?개정|폐지|중\s*개정|\(|·|,|및\s)/.test(rest)) return true;
  }
  return false;
}
// what is asked of 열린국회정보 for a law: its name, or for a name with a middle dot (5ㆍ18민주화운동 등에 관한 특별법) its longest
// part without one — the Assembly may write the dot differently — the bills found are then told apart by amends()
const billAsk = (law) => (/[·ㆍ・‧∙]/.test(law) ? law.split(/[·ㆍ・‧∙]/).map((x) => x.trim()).sort((a, b) => b.length - a.length)[0] : law);
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
  let d = null;
  try { const r = await asmGet(asmUrl(env, 'BPMBILLSUMMARY', { BILL_NO: x.no, pSize: '1' })); if (r.ok) d = asmRows(await r.text(), 'BPMBILLSUMMARY'); } catch (e) { d = null; }
  if (!d) {   // not answered: asked again next call — after three misses, a day later (so the rest is not held up)
    x.miss = (x.miss || 0) + 1;
    if (x.miss >= 3) { x.arts = []; x.gist = ''; x.items = 0; x.retry = Date.now() + 864e5; delete x.miss; return true; }
    return false;
  }
  delete x.miss;
  const s = d.rows[0] && d.rows[0].SUMMARY;
  x.arts = s ? billArts(s) : []; x.gist = s ? billGist(s) : ''; x.items = billItems(s);
  if (s) delete x.retry; else x.retry = Date.now() + 864e5;   // a bill just received may have no summary yet: a day later, again
  return true;
}
async function billList(env, law, age) {
  const rows = [];
  for (let page = 1; page <= 3; page++) {
    let d = null;
    try { const r = await asmGet(asmUrl(env, 'nwbqublzajtcqpdae', { AGE: String(age), BILL_NAME: billAsk(law), pIndex: String(page), pSize: '1000' })); if (r.ok) d = asmRows(await r.text(), 'nwbqublzajtcqpdae'); } catch (e) { d = null; }
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
      const rows = got.map((r) => { const x = billRow(r), o = old.get(x.no); if (o && o.arts) { x.arts = o.arts; x.gist = o.gist; x.items = o.items || 0; if (o.retry) x.retry = o.retry; } else if (o && o.miss) x.miss = o.miss; return x; });
      rows.sort((p, q) => (q.date || '').localeCompare(p.date || '') || q.no.localeCompare(p.no));
      b = { v: BILLS_V, law, age, at: now, rows };
      changed = true;
    } else if (!b) return err('assembly_unavailable', 502);   // the list we have stays, and is asked again next time
  }
  const todo = b.rows.filter((x) => !x.arts || (x.retry && x.retry < now)).slice(0, BILL_FILL);
  // six at a time (as many as the platform opens at once), so no request waits out its own time limit in the queue; a miss
  // counts too (it is written down)
  for (let i = 0; i < todo.length; i += 6) { await Promise.all(todo.slice(i, i + 6).map((x) => fillBill(env, x))); changed = true; }
  if (changed) await env.BUCKET.put(key, JSON.stringify(b), { httpMetadata: { contentType: 'application/json' } });
  const missing = b.rows.filter((x) => !x.arts).length;
  return json({ law, age, at: b.at, total: b.rows.length, missing, rows: b.rows.map(({ retry, miss, ...x }) => x) });
}
// one bill: its 제안이유 및 주요내용 in full and the meetings that took it up (회의록, as PDF at record.assembly.go.kr)
async function billOne(env, ctx, url) {
  if (!env.ASSEMBLY_KEY) return err('no_key', 503);
  const no = url.searchParams.get('no') || '', id = url.searchParams.get('id') || '';
  if (!/^\d{6,9}$/.test(no) || !/^PRC_[A-Z0-9]{20,40}$/.test(id)) return err('bad_id', 400);
  const [s, m] = await Promise.all([
    kept(ctx, 'bill-summary:' + no, ASM_TTL.BPMBILLSUMMARY, () => asmGet(asmUrl(env, 'BPMBILLSUMMARY', { BILL_NO: no, pSize: '1' })), realRows),
    kept(ctx, 'bill-minutes:' + id, ASM_TTL.VCONFBILLCONFLIST, () => asmGet(asmUrl(env, 'VCONFBILLCONFLIST', { BILL_ID: id, pSize: '50' })), realRows),
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
// (an empty answer is not kept either: the portal gives an empty 200 when KCI's article list is asked past the first two hundred
// or so of a journal, and that was being kept for an hour)
const realData = (t) => !!t.trim() && !/OpenAPI_ServiceResponse|<errMsg>|<returnReasonCode>|SERVICE_KEY_IS|LIMITED_NUMBER|"resultCode"\s*:\s*"(?!0+")|<resultCode>(?!0+<)|<html|<!DOCTYPE/i.test(t.slice(0, 1500));
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
const realNl = (t) => /^\s*[{[]/.test(t) && !/"error(?:Code)?"\s*:/i.test(t.slice(0, 400));   // (asked as JSON: a page is not an answer)
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

// A paper's openly-posted PDF, found through open-access indexes and fetched here so the app can put it straight on the
// shelf. Only openly-licensed copies are taken: the candidate URLs come from the indexes (OpenAlex, and Unpaywall/CORE when
// their keys are set), never from the caller; KCI's own host is never fetched (it serves downloads only to a browser
// session, which we do not imitate); and the bytes must really be a PDF. Where nothing open exists — most KCI law journals
// live only on paid platforms — it answers { found: false } and the app shows the page links instead.
const PDF_SKIP = /(?:^|\.)kci\.go\.kr$|dbpia\.co\.kr$|kyobobook|kstudy\.com$|earticle\.net$|riss\.kr$/i;
async function openPdfUrls(body, env) {
  const doi = String(body.doi || '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').trim();
  const title = String(body.title || '').slice(0, 300);
  const doiPath = doi.split('/').map(encodeURIComponent).join('/');   // (the slashes of a DOI stay slashes)
  const squash = (t) => String(t || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const year = Number(body.year) || 0, first = String((Array.isArray(body.authors) && body.authors[0]) || '').trim();
  const out = [];
  const add = (u) => { if (u && /^https:\/\//i.test(u)) { try { if (!PDF_SKIP.test(new URL(u).hostname)) out.push(u); } catch (e) { /* skip */ } } };
  const grab = async (u, headers) => { try { const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'application/json', ...headers }, signal: AbortSignal.timeout(12000) }); return r.ok ? await r.json() : null; } catch (e) { return null; } };
  if (doi) {
    const oa = await grab(`https://api.openalex.org/works/doi:${doiPath}?select=open_access,best_oa_location,locations${env.OA_MAILTO ? '&mailto=' + encodeURIComponent(env.OA_MAILTO) : ''}`);
    if (oa) { add(oa.best_oa_location && oa.best_oa_location.pdf_url); for (const l of oa.locations || []) add(l.pdf_url); }
    if (env.UNPAYWALL_EMAIL) {
      const up = await grab(`https://api.unpaywall.org/v2/${doiPath}?email=${encodeURIComponent(env.UNPAYWALL_EMAIL)}`);
      if (up) { add(up.best_oa_location && up.best_oa_location.url_for_pdf); for (const l of up.oa_locations || []) add(l.url_for_pdf); }
    }
  }
  if (env.CORE_KEY && (doi || title)) {
    const q = doi ? `doi:"${doi.replace(/"/g, '')}"` : `title:"${title.replace(/"/g, '')}"`;
    const cr = await grab(`https://api.core.ac.uk/v3/search/works?limit=3&q=${encodeURIComponent(q)}`, { authorization: 'Bearer ' + env.CORE_KEY });
    // a search by title answers papers alike: only the same one is taken (its title, its year within one, its first author)
    for (const w of (cr && cr.results) || []) {
      if (!doi) {
        if (squash(w.title).slice(0, 120) !== squash(title).slice(0, 120)) continue;
        if (year && w.yearPublished && Math.abs(Number(w.yearPublished) - year) > 1) continue;
        if (first && Array.isArray(w.authors) && w.authors.length && !w.authors.some((a) => String((a && a.name) || '').includes(first.slice(0, 1)))) continue;
      }
      add(w.downloadUrl);
    }
  }
  return [...new Set(out)].slice(0, 6);
}
// probe: true asks only whether there is one — the start of each candidate is read (a range; a server that ignores it is
// cut off after the first bytes) — so the app offers its button only for a paper whose original is really there
// A 국회입법조사처 report (nars: its PDF_FILE_URL from /api/nars/reports) is fetched from that one host only (narsPdfUrls).
async function paperPdf(req, env, ctx) {
  const body = (await readJSON(req, 8 * 1024)) || {};
  const probe = body.probe === true;
  const nars = body.nars ? narsPdfUrls(body.nars) : null;
  if (nars && !nars.length) return err('bad_url', 400);
  const pkey = new Request('https://kept.bookshelf.invalid/pdfprobe/' + (await sha256hex(JSON.stringify([String(body.doi || ''), String(body.title || '').slice(0, 300), String(body.art || ''), ...(nars ? [nars[0]] : [])]))));
  if (probe) {
    const hit = await caches.default.match(pkey).catch(() => null);
    if (hit) return json(await hit.json());
  }
  const keep = (found) => { if (ctx) ctx.waitUntil(caches.default.put(pkey, new Response(JSON.stringify(found), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${found.found ? 7 * 86400 : 86400}` } })).catch(() => {})); };
  const urls = nars || (await openPdfUrls(body, env));
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'application/pdf,*/*', ...(probe ? { range: 'bytes=0-4095' } : {}) }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (!r.ok) { if (r.body) r.body.cancel().catch(() => {}); continue; }
      const final = new URL(r.url || u);
      if (nars ? !NARS_HOST.test(final.hostname) : final.protocol !== 'https:') { if (r.body) r.body.cancel().catch(() => {}); continue; }   // a redirect must not drop to http (NARS: must stay there)
      if (PDF_SKIP.test(final.hostname)) continue;   // a redirect that ended on a paywall host
      const host = final.hostname;
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      // (NARS' downloads come with whatever type its server says: the first bytes decide)
      if (!nars && ct && !/pdf|octet-stream|download/.test(ct)) { if (r.body) r.body.cancel().catch(() => {}); continue; }
      if (probe) {
        // the whole size, where the answer tells it: a notice page is tiny
        const total = Number((/\/(\d+)\s*$/.exec(r.headers.get('content-range') || '') || [])[1] || (r.status === 200 && r.headers.get('content-length')) || 0);
        let head = new Uint8Array(0);
        const rd = r.body && r.body.getReader();
        while (rd && head.length < 8) { const { value, done } = await rd.read(); if (done) break; const both = new Uint8Array(head.length + value.length); both.set(head); both.set(value, head.length); head = both; }
        if (rd) rd.cancel().catch(() => {});
        if (total && (total < 40 * 1024 || total > 40 * 1024 * 1024)) continue;
        if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) { const f = { found: true, host: host.slice(0, 60) }; keep(f); return json(f); }   // %PDF
        continue;
      }
      const buf = await r.arrayBuffer();
      if (buf.byteLength < 40 * 1024 || buf.byteLength > 40 * 1024 * 1024) continue;   // a reject/notice page is tiny
      const head = new Uint8Array(buf, 0, 5);
      if (!(head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46)) continue;   // %PDF
      return new Response(buf, { status: 200, headers: { 'content-type': 'application/pdf', 'cache-control': 'no-store', 'x-pdf-source': host.slice(0, 60) } });
    } catch (e) { /* try the next */ }
  }
  if (probe) keep({ found: false });
  return json({ found: false });
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

// KCI's own Open API (open.kci.go.kr, 논문 검색): every paper KCI holds, of every year — articleSearch by the words of a title
// (title is the search; keyword, author, journal and the rest narrow it, as KCI ANDs them), or one paper whole (articleDetail,
// by its id). Asked with the owner's key (KCI_KEY); only the parameters KCI takes are passed on, and the key and the kind of
// question are ours. KCI answers a refusal (a key it does not know, no title) with 200 and outputData/result/resultMsg and no
// records: that is never kept, and the app is told kci_refused (it then stops asking for a while). KCI writes the key back
// into every answer (inputData): the whole inputData is taken out, and the key wherever else it may stand.
const KCI_API = 'https://open.kci.go.kr/po/openapi/openApiSearch.kci';
const KCI_TEXT = ['title', 'keyword', 'author', 'journal', 'institution', 'affiliation', 'doi'];
const kciRefusal = (t) => (/<record\b/i.test(t) ? '' : xmlText((/<resultMsg>([\s\S]*?)<\/resultMsg>/i.exec(t) || [])[1] || ''));
const realKciApi = (t) => /<MetaData\b/i.test(t) && /<outputData\b/i.test(t) && !kciRefusal(t) && (/<record\b/i.test(t) || /<total>\s*\d+\s*<\/total>/i.test(t));
async function kciSearch(env, ctx, url) {
  const key = kciKeyOf(env);
  if (!key) return err('no_key', 503);
  const sp = url.searchParams, q = new URLSearchParams();
  const id = (sp.get('id') || '').trim();
  if (id) {
    if (!/^ART\d{6,12}$/.test(id)) return err('no_id', 400);
    q.set('apiCode', 'articleDetail'); q.set('key', key); q.set('id', id);
  } else {
    q.set('apiCode', 'articleSearch'); q.set('key', key);
    for (const k of KCI_TEXT) { const v = (sp.get(k) || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim(); if (v && v.length <= 200) q.set(k, v); }
    // (KCI's guide wants a title; a keyword alone it also takes. An author alone is passed on for a person's own papers: if
    // KCI will not take it, its refusal is not kept and the app stops asking that way — never KCI's other questions)
    if (!q.get('title') && !q.get('keyword') && !q.get('author')) return err('no_term', 400);
    for (const k of ['dateFrom', 'dateTo']) if (/^\d{6}$/.test(sp.get(k) || '')) q.set(k, sp.get(k));   // YYYYMM, the month it came out
    const num = (k, lo, hi, d) => { const n = Math.floor(Number(sp.get(k))); return String(sp.get(k) && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d); };
    q.set('page', num('page', 1, 1000, 1)); q.set('displayCount', num('displayCount', 1, 100, 10));   // (KCI gives at most 100 a page)
    if (['title', 'author', 'pubiYr'].includes(sp.get('sortNm'))) q.set('sortNm', sp.get('sortNm'));
    if (['asc', 'desc'].includes(sp.get('sortDir'))) q.set('sortDir', sp.get('sortDir'));
  }
  const u = `${KCI_API}?${q}`;
  const res = await kept(ctx, u, 12 * 3600, () => fetch(u, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) }), realKciApi);
  const drop = [key, String(env.KCI_KEY || '')];
  if (res.ok) {
    const msg = kciRefusal(res.text);
    if (msg) { let m2 = msg; for (const k of drop) if (k) m2 = m2.split(k).join(''); return err('kci_refused', 502, { msg: m2.slice(0, 200) }); }
    if (!/<MetaData\b/i.test(res.text)) return err('kci_unexpected', 502);   // (a block or maintenance page, not KCI's answer)
  }
  return passOn({ ...res, text: res.text.replace(/<inputData\b[\s\S]*?<\/inputData>/gi, '') }, drop);
}

// which outside sources answer, asked from where we run now (near the device that asked); the answer is kept for reading later
async function diagFromKorea(req, env) {
  const last = await env.BUCKET.get('diag/last.json').then((o) => (o ? o.json() : null)).catch(() => null);
  if (last && last.country === 'KR' && Date.now() - last.at < 6 * 3600e3) return;   // a recent check from Korea stands
  const mark = await env.BUCKET.get('diag/kr-run.json').then((o) => (o ? o.json() : null)).catch(() => null);
  if (mark && Date.now() - mark.at < 30 * 60e3) return;   // one run at a time (the owner's requests come many at once)
  await env.BUCKET.put('diag/kr-run.json', JSON.stringify({ at: Date.now() }), { httpMetadata: { contentType: 'application/json' } });
  await diag(req, env);
}
// sentence vectors from Workers AI (multilingual models run by Cloudflare itself: the texts go nowhere else), for the search by
// meaning being tried out — signed-in devices only, at most 100 texts of 2,000 letters a call
const EMBED_MODELS = new Set(['@cf/baai/bge-m3', '@cf/google/embeddinggemma-300m', '@cf/qwen/qwen3-embedding-0.6b']);
async function embed(req, env) {
  if (!env.AI) return err('no_ai', 503);
  const b = await req.json().catch(() => null);
  const texts = Array.isArray(b && b.texts) ? b.texts.slice(0, 100).map((t) => String(t || '').slice(0, 2000)) : [];
  if (!texts.length) return err('no_text', 400);
  const model = EMBED_MODELS.has(b.model) ? b.model : '@cf/baai/bge-m3';
  try {
    const r = await env.AI.run(model, { text: texts });
    return json({ model, shape: r.shape, data: r.data });
  } catch (e) { return json({ error: 'ai', message: String((e && e.message) || e).slice(0, 300) }, 502); }
}
// KCI's key as the owner pasted it, without the spaces or quotes a paste can bring along
const kciKeyOf = (env) => String(env.KCI_KEY || '').trim().replace(/^["'“‘]+|["'”’]+$/g, '').trim();
async function diag(req, env) { return json(await diagRun(env, req.cf, 'device')); }
// from: 'device' (asked by the app, or once from Korea) or 'cron' (the daily check); every run is also added to the day's record
async function diagRun(env, cf, from, now = Date.now()) {
  const dk = dataKey(env, ['9750000']);
  const lastMonth = acrcRange(acrcMonths(now, 2)[1], now);
  const tries = [
    ['kci', 'https://open.kci.go.kr/oai/request?verb=Identify'],
    ['law', env.LAW_OC && `https://www.law.go.kr/DRF/lawSearch.do?OC=${encodeURIComponent(env.LAW_OC)}&target=law&type=JSON&display=1&query=${encodeURIComponent('헌법')}`, lawHeaders(env)],
    ['assembly', env.ASSEMBLY_KEY && `https://open.assembly.go.kr/portal/openapi/nzmimeepazxkubdpn?KEY=${encodeURIComponent(env.ASSEMBLY_KEY)}&Type=json&pIndex=1&pSize=1&AGE=22`, { 'user-agent': UA, accept: 'application/json' }],
    ['data', env.DATA_GO_KR_KEY && `https://apis.data.go.kr/9750000/PrecedentInfomationService/getKorPrcdntList?serviceKey=${encodeURIComponent(env.DATA_GO_KR_KEY)}&type=json&numOfRows=1&pageNo=1&eventNo=${encodeURIComponent('2004헌마554')}`],
    ['nl', env.NL_KEY && `https://www.nl.go.kr/NL/search/openApi/search.do?key=${encodeURIComponent(env.NL_KEY)}&apiType=json&kwd=${encodeURIComponent('관습헌법')}&pageNum=1&pageSize=1`],
    // (7차 b) 헌재 소식, 국회입법조사처 발간물, 행정심판 재결례 (last month's list, one row)
    ['ccourt', dk && `https://apis.data.go.kr/${CC}getRecentMainDecsnList?${new URLSearchParams({ serviceKey: dk, type: 'json', pageNo: '1', numOfRows: '1' })}`],
    ['nars', dk && `https://apis.data.go.kr/9735000/PublicationService/getResearchReportList?${new URLSearchParams({ serviceKey: dk, pageNo: '1', numOfRows: '1', resultType: 'json' })}`],
    ['acrc', dk && `https://apis.data.go.kr/${ACRC}adjdctexeList?${new URLSearchParams({ serviceKey: dk, pageNo: '1', numOfRows: '1', ...lastMonth })}`],
  ];
  const keys = [env.LAW_OC, env.ASSEMBLY_KEY, env.DATA_GO_KR_KEY, env.MOLEG_KEY, env.NL_KEY, env.NANET_KEY, env.SCIENCEON_CLIENT_ID, env.SCIENCEON_KEY, env.SCIENCEON_MAC, env.KCI_KEY, kciKeyOf(env), env.ANTHROPIC_API_KEY].filter(Boolean);
  // the shape of each data.go.kr key (never its value): a 64-letter hex key is the portal's newer '일반 인증키'
  const shape = (k) => (k ? { len: k.length, hex: /^[0-9a-f]+$/i.test(k) } : null);
  // KCI's key as pasted (never its value): its length, and whether spaces, quotes or other letters came with it
  const kshape = (k) => (k ? { len: k.length, trimmed: k.trim().length, digits: /^\d+$/.test(k.trim()), alnum: /^[0-9A-Za-z]+$/.test(k.trim()), quoted: /^["'“‘]|["'”’]$/.test(k.trim()), inner: /\s/.test(k.trim()), hex: /^[0-9a-f]+$/i.test(k.trim()), sameAsDataKey: [env.DATA_GO_KR_KEY, env.MOLEG_KEY].some((d) => d && d.trim() === k.trim()) } : null);
  const out = { at: now, from, colo: cf && cf.colo, country: cf && cf.country, keys: { DATA_GO_KR_KEY: shape(env.DATA_GO_KR_KEY), MOLEG_KEY: shape(env.MOLEG_KEY), KCI_KEY: kshape(env.KCI_KEY) }, results: {} };
  tries.push(['nanet', env.NANET_KEY && (() => nanetAsk(env, 'searchTotal', { searchTerm: '관습헌법', printRowCnt: '1' }))]);
  // KCI's own Open API (논문 검색): whether the owner's key is taken, and the shape of its answer (the key taken out)
  // the owner's Claude key: taken or not, and which models it may use (a list, no tokens spent)
  tries.push(['anthropic', env.ANTHROPIC_API_KEY && (() => fetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': env.ANTHROPIC_API_KEY.trim(), 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(12000) }))]);
  const kciKey = kciKeyOf(env);
  tries.push(['kcisearch', kciKey && `https://open.kci.go.kr/po/openapi/openApiSearch.kci?${new URLSearchParams({ apiCode: 'articleSearch', key: kciKey, title: '관습헌법', displayCount: '2' })}`, { 'user-agent': UA }]);
  tries.push(['moleg', dataKey(env, ['1170000']) && `https://apis.data.go.kr/1170000/law/lawSearchList.do?${new URLSearchParams({ serviceKey: dataKey(env, ['1170000']), target: 'law', query: '공직선거법', numOfRows: '1', pageNo: '1' })}`]);
  // ScienceON's token answer itself (what the gateway says when it gives no token), and the shape of what was pasted (never the
  // values: lengths, and the MAC address's pattern with each letter or digit shown as one sign)
  const mask = (v) => String(v || '').replace(/[0-9A-Za-z]/g, (c) => (/[0-9A-F]/.test(c) ? 'H' : /[a-f]/.test(c) ? 'h' : 'x'));
  out.keys.SCIENCEON = soReady(env) ? { idLen: env.SCIENCEON_CLIENT_ID.length, idTrim: env.SCIENCEON_CLIENT_ID.trim().length, keyLen: env.SCIENCEON_KEY.length, keyTrim: env.SCIENCEON_KEY.trim().length, mac: mask(env.SCIENCEON_MAC) } : null;
  tries.push(['scienceontoken', soReady(env) && (async () => { const [safe] = await soAccounts(env); return fetch(`${SO}/tokenrequest.do?${new URLSearchParams({ accounts: safe, client_id: env.SCIENCEON_CLIENT_ID })}`, { signal: AbortSignal.timeout(15000) }); })]);
  tries.push(['scienceon', soReady(env) && (async () => { const t = await soToken(env); return fetch(`${SO}/openapicall.do?${new URLSearchParams({ client_id: env.SCIENCEON_CLIENT_ID, token: t, version: '1.0', action: 'search', target: 'ARTI', searchQuery: JSON.stringify({ BI: '관습헌법' }), rowCount: '1' })}`, { signal: AbortSignal.timeout(15000) }); })]);
  await Promise.all(tries.map(async ([k, u, headers]) => {
    if (!u) { out.results[k] = { status: 'no key' }; return; }
    try {
      const r = typeof u === 'function' ? await u() : await fetch(u, { headers: headers || {}, signal: AbortSignal.timeout(12000) });
      let t = (await r.text()).slice(0, k === 'kcisearch' ? 8000 : k === 'anthropic' ? 4000 : 400);   // (KCI's: one whole record, to read its shape)
      for (const key of keys) t = t.split(key).join('');
      t = t.replace(/\b[0-9A-Fa-f]{64}\b/g, '…');   // a token the answer repeats
      t = t.replace(/("(?:access|refresh)_token"\s*:\s*")[^"]*/g, '$1…');   // ScienceON's tokens, when it gives them
      out.results[k] = { status: r.status, head: t };
    } catch (e) { out.results[k] = { error: String((e && e.message) || e).slice(0, 200) }; }
  }));
  // the cron's check (made elsewhere) does not take the place of a fresh one made from Korea
  const last = from === 'cron' ? await getJ(env, 'diag/last.json') : null;
  if (!(last && last.country === 'KR' && now - last.at < 86400e3)) await env.BUCKET.put('diag/last.json', JSON.stringify(out), { httpMetadata: { contentType: 'application/json' } });
  await diagDays(env, out, from).catch(() => {});
  return out;
}

/* ---------------- 7차 b: 헌재 소식, 위헌·헌법불합치 법령, 국회입법조사처 발간물, 행정심판 재결례, the daily check ---------------- */
// Small typed routes over the 공공데이터포털 services: each asks the service from here (the owner's key added, as /api/data
// does), keeps only what the app shows, and keeps that for a while (at the edge, or in R2 for what the cron gathers).

const upstreamErr = (code, status = 502) => Object.assign(new Error(code), { status });
// one service, its text back. use (the cron's budget: { left }) counts each ask going out
async function dataAsk(env, path, params, use, read = (r) => r.text()) {
  const keys = dataKeys(env, path.split('/'));
  if (!keys.length) throw upstreamErr('no key', 503);
  let out;
  for (const key of keys) {
    if (use) { if (use.left <= 0) throw upstreamErr('budget', 429); use.left--; }
    const u = `https://apis.data.go.kr/${path}?${new URLSearchParams({ serviceKey: key, ...params })}`;
    let r;
    try { r = await fetch(u, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(25000) }); } catch (e) { throw upstreamErr('upstream unreachable', 504); }
    out = { ok: r.ok, status: r.status, text: await read(r) };
    if (!notRegistered(out.text)) break;
  }
  if (!out.ok) throw upstreamErr('upstream ' + out.status);
  if (/SERVICE_KEY_IS|LIMITED_NUMBER|OpenAPI_ServiceResponse|<returnReasonCode>/.test(out.text.slice(0, 1500))) throw upstreamErr('upstream refused');
  return out.text;
}
// an answer we made from a service's answer, kept at the edge (ttl seconds, or ttl(obj))
async function keptJson(ctx, id, ttl, make) {
  const key = new Request(KEPT + 'typed/' + (await sha256hex(id)));
  const hit = await caches.default.match(key).catch(() => null);
  if (hit) return hit.json();
  const obj = await make();
  const s = typeof ttl === 'function' ? ttl(obj) : ttl;
  if (s > 0 && ctx) ctx.waitUntil(caches.default.put(key, new Response(JSON.stringify(obj), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${s}` } })).catch(() => {}));
  return obj;
}
const shown = (obj, age = 300) => json(obj, 200, { 'cache-control': `private, max-age=${age}` });
// a stored JSON in R2 handed on as it is (no parsing here)
const storedJson = (o, age = 600) => new Response(o.body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `private, max-age=${age}` } });
const getJ = (env, key) => env.BUCKET.get(key).then((o) => (o ? o.json() : null)).catch(() => null);
const putJ = (env, key, obj) => env.BUCKET.put(key, JSON.stringify(obj), { httpMetadata: { contentType: 'application/json' } });

const one = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const ymd = (s) => { const m = /^(\d{4})\D?(\d{2})\D?(\d{2})/.exec(String(s || '').trim()); return m ? `${m[1]}-${m[2]}-${m[3]}` : ''; };
const hhmm = (s) => { const m = /(\d{2}):?(\d{2})$/.exec(String(s || '').trim()); return m ? m[1] + ':' + m[2] : ''; };
const pad2 = (n) => String(n).padStart(2, '0');
const httpUrl = (s) => (/^https?:\/\/[^\s"<>]+$/.test(String(s || '').trim()) ? String(s).trim() : '');
const ENT = { nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'", amp: '&', middot: '·', hellip: '…', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', ndash: '–', mdash: '—', bull: '•', times: '×', para: '¶', sect: '§' };
const lines = (s) => s.split('\n').map((l) => l.replace(/[ \t 　]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
// 헌재's HTML (결정 개요) as plain text: one paragraph a line
function htmlText(h) {
  const t = String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|div|li|tr|h\d|table)>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (m, x) => String.fromCodePoint(parseInt(x, 16))).replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENT ? ENT[n.toLowerCase()] : m));
  return lines(t.replace(/\r/g, ''));
}
// 헌재's JSON answers: { header: { resultCode: '0' }, body: { items: { item: [...] | {...} | '' }, totalCount } }
function ccItems(text) {
  let j; try { j = JSON.parse(text); } catch (e) { throw upstreamErr('upstream unexpected'); }
  const h = j.header || (j.response && j.response.header) || {};
  if (h.resultCode != null && !/^0+$/.test(String(h.resultCode))) throw upstreamErr('upstream refused');
  const b = j.body || (j.response && j.response.body) || {};
  const it = b.items && (b.items.item !== undefined ? b.items.item : b.items);
  const items = (Array.isArray(it) ? it : it && typeof it === 'object' ? [it] : []).filter((x) => x && typeof x === 'object');
  return { items, total: Number(b.totalCount) || items.length };
}
const CC = '9750000/SentenceCaseService/', CD = '9750000/DiscussCaseService/';
const EVENT_NO = /^\d{2,4}헌[가-힣]{1,2}\d{1,6}$/;
const ccAsk = (env, op, params, use) => dataAsk(env, op, { type: 'json', pageNo: '1', numOfRows: '100', ...params }, use).then(ccItems);
// (a page past max is refused, 0: it was answered as page max, which a client asking page after page got again and again)
const pageOf = (url, max = 1000) => { const n = Math.floor(Number(url.searchParams.get('page'))); return n > max ? 0 : n >= 1 ? n : 1; };

async function ccourtApi(env, ctx, op, url) {
  const sp = url.searchParams, H = 3 * 3600;
  switch (op) {
    case 'schedule': {   // 선고 일정 and 변론 일정 of one month
      const y = sp.get('year') || '', mo = sp.get('month') || '';
      if (!/^(?:19|20)\d{2}$/.test(y) || !/^(?:0?[1-9]|1[0-2])$/.test(mo)) return err('bad_month', 400);
      const month = pad2(Number(mo));
      const slot = (at, time) => ({ at: one(at), date: ymd(at), time: hhmm(time) || hhmm(one(at).slice(8, 12)) });
      return shown(await keptJson(ctx, `cc/schedule/${y}${month}`, (o) => (o.discuss ? H : 1800), async () => {
        const [s, d] = await Promise.all([
          ccAsk(env, CC + 'getSentenceSchduleList', { year: y, month }),
          ccAsk(env, CD + 'getDscsSchdulList', { year: y, month }).catch(() => null),
        ]);
        const by = (a, b) => a.at.localeCompare(b.at);
        return { year: +y, month: +month, sentence: s.items.map((x) => slot(x.adjudgeDateTime, x.time)).filter((x) => /^\d{12}$/.test(x.at)).sort(by),
          discuss: d ? d.items.map((x) => slot(x.dscsDateTime, x.time)).filter((x) => /^\d{12}$/.test(x.at)).sort(by) : null };
      }));
    }
    case 'day': {   // the cases to be decided (or decided) at one 선고 time
      const at = sp.get('at') || '';
      if (!/^\d{12}$/.test(at)) return err('bad_at', 400);
      // that day's results come in on the day: kept half an hour around it, three hours otherwise
      const near = Math.abs(Date.parse(ymd(at) + 'T00:00:00+09:00') - Date.parse(kstDay() + 'T00:00:00+09:00')) <= 2 * 86400e3;
      return shown(await keptJson(ctx, 'cc/day/' + at, near ? 1800 : H, async () => {
        const items = [];
        for (let page = 1; page <= 3; page++) {
          const r = await ccAsk(env, CC + 'getSentenceList', { adjudgeDateTime: at, pageNo: String(page) });
          items.push(...r.items);
          if (!r.items.length || items.length >= r.total) break;
        }
        return { at, date: ymd(at), time: hhmm(at.slice(8)), items: items.map((x) => {
          const merged = one(x.mrgInfo).replace(/\(병합\)/g, '').split(/\s*,\s*/).filter((e) => EVENT_NO.test(e));
          const o = { eventNo: one(x.eventNo), title: one(x.eventNm), result: one(x.endRsta) };
          if (merged.length > 1) o.merged = merged;
          if (one(x.reqLaw)) o.court = one(x.reqLaw);
          if (one(x.demdNmSub)) o.party = one(x.demdNmSub);
          if (one(x.othDemdNm)) o.other = one(x.othDemdNm);
          if (httpUrl(x.decsnOutlineLink)) o.outline = httpUrl(x.decsnOutlineLink);
          if (httpUrl(x.dtmPpLink)) o.file = httpUrl(x.dtmPpLink);
          if (ymd(x.chgDate)) o.changed = ymd(x.chgDate);
          return o;
        }) };
      }));
    }
    case 'recent': {   // 최근 주요 결정, newest first, 50 a page
      const page = pageOf(url);
      if (!page) return err('bad_page', 400);
      return shown(await keptJson(ctx, 'cc/recent/' + page, H, async () => {
        const r = await ccAsk(env, CC + 'getRecentMainDecsnList', { pageNo: String(page), numOfRows: '50' });
        return { total: r.total, page, items: r.items.map((x) => ({ seq: one(x.seqNo), eventNo: one(x.eventNo), title: one(x.eventNm), date: ymd(x.endDate || x.adjuDate), result: one(x.endResult) })) };
      }));
    }
    case 'outline': {   // one 주요 결정's 개요 (보도자료), as plain text
      const seq = sp.get('seq') || '';
      if (!/^\d{1,12}$/.test(seq)) return err('bad_seq', 400);
      const o = await keptJson(ctx, 'cc/outline/' + seq, (x) => (x.found ? 86400 : 1800), async () => {
        const r = await ccAsk(env, CC + 'getDecsnOutlineDetail', { seqNo: seq });
        const x = r.items[0];
        if (!x) return { found: false };
        return { found: true, seq, eventNo: one(x.eventNo), title: one(x.eventNm), date: ymd(x.endDate || x.adjuDate), result: one(x.endRsta), text: htmlText(x.decsnOutline).slice(0, 200000) };
      });
      if (!o.found) return err('none', 404);
      const { found, ...rest } = o;
      return shown(rest, 3600);
    }
    case 'hearings': {   // 주요 변론 일정, newest first, 50 a page
      const page = pageOf(url);
      if (!page) return err('bad_page', 400);
      return shown(await keptJson(ctx, 'cc/hearings/' + page, H, async () => {
        const r = await ccAsk(env, CD + 'getMainDscsSchduleList', { pageNo: String(page), numOfRows: '50' });
        return { total: r.total, page, items: r.items.map((x) => ({ seq: one(x.seqNo), half: one(x.gubun), eventNo: one(x.eventNo), title: one(x.eventNm), date: ymd(x.dscsDate) })) };
      }));
    }
    case 'hearing': {   // one 주요 변론: its dates, the 변론 개요 PDF(s), any text
      const no = one(sp.get('eventNo'));
      if (!EVENT_NO.test(no)) return err('bad_event', 400);
      return shown(await keptJson(ctx, 'cc/hearing/' + no, 6 * 3600, async () => {
        const r = await ccAsk(env, CD + 'getMainDscsSchduleDetail', { eventNo: no });
        return { eventNo: no, items: r.items.map((x) => ({ date: ymd(x.dscsDate), title: one(x.eventNm),
          files: (Array.isArray(x.fileList) ? x.fileList : []).map((f) => ({ name: one(f && f.atchFileNm), url: httpUrl(f && f.atchFileLink) })).filter((f) => f.url),
          text: x.content ? htmlText(x.content).slice(0, 100000) : '' })) };
      }));
    }
    case 'unconst': {   // 위헌결정 법률현황 + 미개정 위헌·헌법불합치 법령, one list (made daily by the cron; here when missing)
      const o = await env.BUCKET.get(UNCONST_KEY);
      if (o) return storedJson(o, 3600);
      return shown(await unconstBuild(env, Date.now(), { left: 40 }), 600);
    }
  }
  return err('not_found', 404);
}

// 위헌결정 법률현황 (헌법재판통계): every law (or part of one) the court has held 위헌·헌법불합치·한정위헌…, about 860 rows,
// and the two lists of those not yet amended (미개정 위헌결정 법령, 미개정 헌법불합치결정 법령), joined into one compact list
const UNCONST_KEY = 'ccourt/unconst.json';
const STAT = '9750000/CourtStatisticsService/getVioconstitDecsnLawSttus', UNAM = '9750000/UnamLegStatService/';
// '구 공직선거법(2022. 4. 20. 법률 제18841호로 개정되고, … 전의 것) 제26조 제1항 [별표 2] … 부분' → its parts
function lawParts(s) {
  let t = one(s).replace(/[‘’“”「」｢｣]/g, '');
  const out = { law: '', full: one(s) };
  if (/^구\s/.test(t)) { out.old = true; t = t.replace(/^구\s+/, ''); }
  let i = -1;
  for (let k = t.indexOf('('); k >= 0; k = t.indexOf('(', k + 1)) if (/^\(\s*(?:\d{4}\s*\.|법률\s*제|[^)]{0,40}(?:개정|제정|시행))/.test(t.slice(k))) { i = k; break; }
  let rest;
  if (i > 0) {
    let depth = 0, j = i;
    for (; j < t.length; j++) { if (t[j] === '(') depth++; else if (t[j] === ')' && --depth === 0) break; }
    out.law = t.slice(0, i).trim(); out.ver = t.slice(i + 1, j).trim(); rest = t.slice(j + 1).trim();
  } else {
    const a = /\s(제\d+조)/.exec(t);
    out.law = (a ? t.slice(0, a.index) : t.replace(/\s중\s.*$/, '')).trim(); rest = a ? t.slice(a.index).trim() : '';
  }
  const art = /^(제\d+조(?:의\s?\d+)?(?:\s*제\d+항)?(?:\s*제\d+호)?(?:\s*[가-하]목)?)\s*(.*)$/.exec(rest);
  if (art) { out.art = art[1].replace(/\s+/g, ' '); if (art[2]) out.part = art[2]; } else if (rest) out.part = rest;
  return out;
}
const lawKey = (s) => one(s).replace(/^구\s+/, '').replace(/[\s·ㆍ・‧∙]/g, '');
async function allPages(env, path, params, use, max = 20) {
  const first = ccItems(await dataAsk(env, path, { ...params, pageNo: '1', numOfRows: '100' }, use));
  const items = [...first.items];
  // a service that gives fewer a page than asked (and says there are more) is asked page by page at that size
  const rows = first.items.length && first.items.length < 100 && first.total > first.items.length ? first.items.length : 100;
  for (let p = 2; items.length < first.total && p <= max; p++) {
    const r = ccItems(await dataAsk(env, path, { ...params, pageNo: String(p), numOfRows: String(rows) }, use));
    if (!r.items.length) break;
    items.push(...r.items);
  }
  return { items, total: first.total };
}
async function unconstBuild(env, now, use) {
  const d = new Date(now + 9 * 3600e3);
  let y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, stat = null, asOf = '';
  // the newest month the statistics have: this month's may not be out yet, and they can lag by many months, so up to a year
  // back is tried — starting no later than two months after the month the list was last made from (so a daily run asks
  // only a couple of empty months, and still finds a newer month when it comes out)
  const was = await env.BUCKET.head(UNCONST_KEY).then((o) => (o && o.customMetadata && o.customMetadata.asOf) || '').catch(() => '');
  if (/^\d{4}-\d{2}$/.test(was)) {
    const [py, pm] = was.split('-').map(Number), s = new Date(Date.UTC(py, pm - 1 + 2, 1));
    if (`${s.getUTCFullYear()}-${pad2(s.getUTCMonth() + 1)}` < `${y}-${pad2(m)}`) { y = s.getUTCFullYear(); m = s.getUTCMonth() + 1; }
  }
  const TRIES = 13;
  for (let i = 0; i < TRIES && !stat; i++) {
    let r;
    try { r = await allPages(env, STAT, { type: 'json', year: String(y), month: pad2(m) }, use); } catch (e) { if (e.status === 503 || e.message === 'budget' || i === TRIES - 1) throw e; r = { items: [] }; }
    if (r.items.length) { stat = r; asOf = `${y}-${pad2(m)}`; } else if (--m === 0) { m = 12; y--; }
  }
  if (!stat) throw upstreamErr('upstream empty');
  const [vio, cns] = await Promise.all([allPages(env, UNAM + 'getVioconstitQotatDecsnRefreeeIncdnt', { type: 'json' }, use, 5), allPages(env, UNAM + 'getCnstitDscrdRefreeeIncdnt', { type: 'json' }, use, 5)]);
  const unam = [...vio.items.map((x) => ['위헌', x]), ...cns.items.map((x) => ['헌법불합치', x])].map(([kind, x]) => ({ kind, x, used: false }));
  const unamOf = (u) => { const o = { kind: u.kind }; if (one(u.x.progress)) o.progress = one(u.x.progress); if (ymd(u.x.passDate)) o.deadline = ymd(u.x.passDate); if (one(u.x.office)) o.office = one(u.x.office); return o; };
  const links = (o, x) => { if (httpUrl(x.decsnOutlineLink)) o.outline = httpUrl(x.decsnOutlineLink); if (httpUrl(x.dtmPpLink)) o.hwp = httpUrl(x.dtmPpLink); };
  const keyOf = new Map();
  const items = stat.items.map((x) => {
    const o = { ...lawParts(x.lawNm), kind: one(x.rstaRsta), date: ymd(x.rstaDate), eventNo: one(x.eventNo) };
    if (one(x.precdntBook)) o.book = one(x.precdntBook);
    if (x.precdntPage != null && one(x.precdntPage)) o.page = one(x.precdntPage);
    keyOf.set(o, o.eventNo + '|' + lawKey(o.law));
    return o;
  });
  // joined by 사건번호 and law, and by kind: a case can hold one article 헌법불합치 and another 위헌, and a 헌법불합치 list's
  // entry says nothing of the 위헌 one (한정위헌·한정합헌… count as 위헌 here). Only a case with no row of that kind for that
  // law takes the entry on its other rows.
  const kindOf = (k) => (/불합치/.test(k) ? '헌법불합치' : '위헌');
  for (const any of [false, true]) {
    for (const u of unam) {
      if (u.used) continue;
      const key = one(u.x.eventNo) + '|' + lawKey(u.x.lawNm);
      const hits = items.filter((o) => !o.unam && keyOf.get(o) === key && (any || kindOf(o.kind) === u.kind));
      if (!hits.length) continue;
      u.used = true;
      for (const o of hits) { o.unam = unamOf(u); links(o, u.x); }
    }
  }
  for (const u of unam.filter((z) => !z.used)) {   // a not-yet-amended law the statistics do not list (as of their month)
    const o = { law: one(u.x.lawNm), full: one(u.x.lawNm), kind: u.kind, date: ymd(u.x.decsnDate), eventNo: one(u.x.eventNo), unam: unamOf(u) };
    if (one(u.x.article)) o.art = one(u.x.article);
    links(o, u.x);
    items.push(o);
  }
  items.sort((a, b) => b.date.localeCompare(a.date) || a.law.localeCompare(b.law));
  const out = { v: 1, at: now, asOf, total: stat.total, unamended: { vio: vio.total, cnstit: cns.total }, items };
  await env.BUCKET.put(UNCONST_KEY, JSON.stringify(out), { httpMetadata: { contentType: 'application/json' }, customMetadata: { asOf } });
  return out;
}

// 국회입법조사처 발간물 (이슈와 논점·NARS 현안분석·입법·정책보고서…): by the words of a title (the service takes one LIKE
// word: the longest is asked, the others are matched here) and a kind (DIV_CD)
const NARS_PAGES = 100;
async function narsReports(env, ctx, url) {
  const sp = url.searchParams;
  const words = one(sp.get('q')).slice(0, 100).split(' ').filter(Boolean).slice(0, 6);
  const kind = sp.get('kind') || '';
  if (kind && !/^\d{6,12}$/.test(kind)) return err('bad_kind', 400);
  const page = pageOf(url, NARS_PAGES), ask = [...words].sort((a, b) => b.length - a.length)[0] || '';
  if (!page) return err('bad_page', 400);
  const more = words.length > 1, rows = more ? 100 : 20;
  return shown(await keptJson(ctx, `nars/${ask}/${kind}/${page}/${rows}`, 6 * 3600, async () => {
    const q = { pageNo: String(page), numOfRows: String(rows), resultType: 'json' };
    if (ask) q.book_nm = ask;
    if (kind) q.div_cd = kind;
    let j; try { j = JSON.parse(await dataAsk(env, '9735000/PublicationService/getResearchReportList', q)); } catch (e) { if (e.status) throw e; throw upstreamErr('upstream unexpected'); }
    const g = j.getResearchReportList || j.response || j;
    const code = String((g.header && g.header.code) || '');
    if (code && code !== '00' && code !== '03') throw upstreamErr('upstream refused');   // (03: nothing found)
    const it = g.item || (g.body && g.body.items && g.body.items.item) || [];
    const list = (Array.isArray(it) ? it : [it]).filter((x) => x && typeof x === 'object');
    return { total: Number(g.totalCount) || 0, page, rows, items: list.map((x) => {
      const o = { id: one(x.DATA_ID), title: one(x.BOOK_NM), kind: one(x.DIV_NM), kindCode: one(x.DIV_CD), date: ymd(x.INSERT_DT) };
      if (narsPdfUrls(x.PDF_FILE_URL).length) o.pdf = one(x.PDF_FILE_URL);
      if (httpUrl(x.VIEWER_URL)) o.viewer = httpUrl(x.VIEWER_URL);
      return o;
    }) };
  }).then((r) => {
    const further = r.page * r.rows < r.total && r.page < NARS_PAGES;   // (the last page served says so)
    if (!more) return { q: words.join(' '), kind, ...r, more: further };
    const has = (t) => words.every((w) => t.toLowerCase().includes(w.toLowerCase()));
    return { q: words.join(' '), kind, total: r.total, page: r.page, rows: r.rows, more: further, items: r.items.filter((x) => has(x.title)) };
  }));
}
// a NARS PDF link (www.nars.go.kr/fileDownload2.do?doc_id=…, as the service gives it): only that host and path, asked by
// https first and then as given (http) — the server never fetches any other address a caller names
const NARS_HOST = /^(?:www\.)?nars\.go\.kr$/i;
function narsPdfUrls(s) {
  let u; try { u = new URL(String(s || '').trim()); } catch (e) { return []; }
  if (!/^https?:$/.test(u.protocol) || !NARS_HOST.test(u.hostname) || u.port || u.username || u.password || u.pathname !== '/fileDownload2.do') return [];
  const doc = u.searchParams.get('doc_id') || '';
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(doc)) return [];
  const q = new URLSearchParams({ doc_id: doc });
  const name = u.searchParams.get('fileName');
  if (name && name.length <= 400) q.set('fileName', name);
  return [`https://www.nars.go.kr/fileDownload2.do?${q}`, `http://www.nars.go.kr/fileDownload2.do?${q}`];
}

// 행정심판 재결례 (국민권익위원회 온라인행정심판, 1140100/data). The service takes no words, only a date range of a month at most,
// and one 재결 whole is about 4 MB (a picture of each table, in base64): so the cron gathers each month's list into R2
// (newest month first, back three years, a few asks a run), keeps a small index of all of them for the app to search by
// words, and a 재결 asked for is fetched once, without its pictures, and kept in R2 as its text.
const ACRC = '1140100/data/', ACRC_MONTHS = 36, ACRC_ROWS = 100, CRON_ACRC_CALLS = 2;   // two asks a run keep the parsing well inside the free plan's CPU time
const XT = new Map();
const xtag = (s, t) => { let re = XT.get(t); if (!re) XT.set(t, (re = new RegExp(`<${t}>([\\s\\S]*?)</${t}>`))); const m = re.exec(s); return m ? xmlText(m[1]) : ''; };
const lawNamesOf = (s) => [...new Set([...String(s || '').matchAll(/【\s*([^【】\n]{1,80}?)\s*】/g)].map((m) => one(m[1])))].slice(0, 30);
function acrcPage(text) {
  if (!/<response\b/.test(text.slice(0, 400))) throw upstreamErr('upstream unexpected');
  if (!/^(?:200|0+)$/.test(xtag(text.slice(0, 2000), 'resultCode'))) throw upstreamErr('upstream refused');
  const items = [];
  for (const m of text.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const s = m[1], no = xtag(s, 'incdntNo');
    if (!/^\d{4,14}$/.test(no)) continue;
    const o = { no, cmt: one(xtag(s, 'cmtNm')), date: ymd(xtag(s, 'redcYmd')), clme: one(xtag(s, 'clmeNm')), title: one(xtag(s, 'clmIncdntNm')), result: one(xtag(s, 'adjdcResultNm')), field: one(xtag(s, 'parentCdNm')), laws: lawNamesOf(xtag(s, 'relSttDeidntfCn')) };
    if (ymd(xtag(s, 'chgDt'))) o.upd = ymd(xtag(s, 'chgDt'));
    if (xtag(s, 'docRlsYn') === 'N') o.pub = false;
    items.push(o);
  }
  return { items, total: Number(xtag(text.slice(-600), 'totalCount')) || 0 };
}
// the months the index covers (the owner's calendar, in Korea): this one first
function acrcMonths(now, n = ACRC_MONTHS) {
  const d = new Date(now + 9 * 3600e3); let y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const out = [];
  for (let i = 0; i < n; i++) { out.push(`${y}-${pad2(m)}`); if (--m === 0) { m = 12; y--; } }
  return out;
}
const acrcEvery = (age) => (age <= 1 ? 20 * 3600e3 : age <= 5 ? 7 * 86400e3 : 30 * 86400e3);   // this month and last: daily
// which months to ask next: one left half-done, this month and last when due, then those never gathered (newest first),
// then older ones due again (a 재결 is often published months after it was given)
function acrcDue(st, now) {
  const months = acrcMonths(now), have = st.months || {}, skip = st.skip || {};
  const due = (ym, age) => !have[ym] || now - have[ym].at >= acrcEvery(age);
  return [...new Set([
    ...(st.part && months.includes(st.part.ym) ? [st.part.ym] : []),
    ...months.slice(0, 2).filter((ym, age) => due(ym, age)),
    ...months.filter((ym) => !have[ym]),
    ...months.filter((ym, age) => due(ym, age)),
  ])].filter((ym) => !(skip[ym] > now));   // (a month that failed three times running waits a day)
}
function acrcRange(ym, now) {
  const [y, m] = ym.split('-').map(Number), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${ym}-${pad2(last)}`, today = kstDay(now);
  return { adjdcStartDe: `${y}${pad2(m)}01`, adjdcEndDe: (end > today ? today : end).replace(/-/g, '') };
}
async function acrcCollect(env, now, use) {
  const st = (await getJ(env, 'acrc/state.json')) || { v: 1, months: {} };
  st.months = st.months || {};
  const done = new Map(), out = { done: [], asked: 0 };
  const left0 = use.left;
  let part = st.part ? await getJ(env, 'acrc/part.json') : null;
  if (st.part && (!part || part.ym !== st.part.ym)) { part = null; delete st.part; }
  for (const ym of acrcDue(st, now)) {
    if (use.left <= 0) break;
    const cur = part && part.ym === ym ? part : { ym, next: 1, total: 0, items: [] };
    part = null;
    let finished = false;
    while (use.left > 0) {
      let page;
      const rows = st.rows || ACRC_ROWS;
      try { page = acrcPage(await dataAsk(env, ACRC + 'adjdctexeList', { pageNo: String(cur.next), numOfRows: String(rows), ...acrcRange(ym, now) }, use)); }
      catch (e) { if (e.message === 'budget') break; out.err = `${ym} p${cur.next}: ${e.message}`; break; }
      cur.total = page.total;
      cur.items.push(...page.items);
      // fewer than asked on the first page, more said to be there: the service's own page size (asked at that from now on)
      if (cur.next === 1 && page.items.length && page.items.length < rows && page.total > page.items.length) st.rows = page.items.length;
      else if (!page.items.length || page.items.length < rows || cur.items.length >= page.total) { finished = true; break; }
      cur.next++;
    }
    if (!finished) {   // carried over to the next run (or after an error, asked again then: three times, then a day later)
      const fails = out.err ? ((st.part && st.part.ym === ym && st.part.fails) || 0) + 1 : 0;
      if (fails >= 3) {
        delete st.part; await env.BUCKET.delete('acrc/part.json');
        st.skip = { ...(st.skip || {}), [ym]: now + 86400e3 };
      } else {
        st.part = { ym, next: cur.next, total: cur.total, ...(fails ? { fails } : {}) };
        await putJ(env, 'acrc/part.json', cur);
      }
      break;
    }
    const seen = new Set(), items = cur.items.filter((x) => !seen.has(x.no) && seen.add(x.no));
    items.sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no));
    await putJ(env, `acrc/m/${ym}.json`, { v: 1, ym, at: now, total: cur.total, items });
    st.months[ym] = { at: now, n: items.length };
    done.set(ym, items); out.done.push(ym);
    if (st.part && st.part.ym === ym) { delete st.part; await env.BUCKET.delete('acrc/part.json'); }
  }
  const keep = new Set(acrcMonths(now));
  for (const ym of Object.keys(st.months)) if (!keep.has(ym)) delete st.months[ym];
  for (const ym of Object.keys(st.skip || {})) if (!(st.skip[ym] > now)) delete st.skip[ym];
  if (st.skip && !Object.keys(st.skip).length) delete st.skip;
  if (done.size || !(await env.BUCKET.head('acrc/index.json'))) await acrcIndex(env, st, done, now);
  st.last = { at: now, done: out.done, asked: left0 - use.left, ...(out.err ? { err: out.err.slice(0, 200) } : {}) };
  await putJ(env, 'acrc/state.json', st);
  out.asked = left0 - use.left;
  return out;
}
// the index: every 재결 of the months gathered, as rows of [no, date, 위원회, 피청구인, 사건명, 결과, [법령…], 분야], with the
// 위원회, 결과, 법령 and 분야 given as numbers into its lists (cmts, results, laws, fields)
async function acrcIndex(env, st, done, now) {
  const old = (await getJ(env, 'acrc/index.json')) || { v: 1, cmts: [], results: [], laws: [], fields: [], rows: [] };
  const dict = (name) => { const list = old[name] || (old[name] = []); const at = new Map(list.map((x, i) => [x, i])); return (v) => { if (!at.has(v)) { at.set(v, list.length); list.push(v); } return at.get(v); }; };
  const cmt = dict('cmts'), res = dict('results'), law = dict('laws'), fld = dict('fields');
  const keep = new Set(acrcMonths(now)), redo = new Set(done.keys()), fresh = new Set();
  for (const items of done.values()) for (const x of items) fresh.add(x.no);
  const rows = old.rows.filter((r) => keep.has(String(r[1]).slice(0, 7)) && !redo.has(String(r[1]).slice(0, 7)) && !fresh.has(r[0]));
  for (const items of done.values()) for (const x of items) rows.push([x.no, x.date, cmt(x.cmt), x.clme, x.title, res(x.result), x.laws.map(law), fld(x.field)]);
  rows.sort((a, b) => String(b[1]).localeCompare(String(a[1])) || String(b[0]).localeCompare(String(a[0])));
  const months = {};
  for (const [ym, v] of Object.entries(st.months)) months[ym] = v.n;
  await putJ(env, 'acrc/index.json', { v: 1, at: now, want: ACRC_MONTHS, months, cmts: old.cmts, results: old.results, laws: old.laws, fields: old.fields, rows });
}
// a response's text with every <tag>…</tag> left out as it streams in (the 재결's pictures), at most max letters kept
async function textWithout(r, tag, max = 3e6) {
  const enc = new TextEncoder(), open = enc.encode(`<${tag}>`), close = enc.encode(`</${tag}>`);
  const find = (buf, pat, from) => {
    for (let j = buf.indexOf(pat[0], from); j >= 0 && j <= buf.length - pat.length; j = buf.indexOf(pat[0], j + 1)) {
      let k = 1; while (k < pat.length && buf[j + k] === pat[k]) k++;
      if (k === pat.length) return j;
    }
    return -1;
  };
  const dec = new TextDecoder(), rd = r.body.getReader();
  let out = '', inside = false, carry = new Uint8Array(0);
  for (;;) {
    const { value, done } = await rd.read();
    if (done) break;
    let buf = value;
    if (carry.length) { buf = new Uint8Array(carry.length + value.length); buf.set(carry); buf.set(value, carry.length); }
    let i = 0;
    for (;;) {
      if (inside) {
        const k = find(buf, close, i);
        if (k < 0) { i = Math.max(i, buf.length - close.length + 1); break; }
        inside = false; i = k + close.length;
      } else {
        const k = find(buf, open, i);
        if (k < 0) { const end = Math.max(i, buf.length - open.length + 1); out += dec.decode(buf.subarray(i, end), { stream: true }); i = end; break; }
        out += dec.decode(buf.subarray(i, k), { stream: true }); inside = true; i = k + open.length;
      }
    }
    carry = buf.slice(i);
    if (out.length > max) { rd.cancel().catch(() => {}); throw upstreamErr('too large'); }
  }
  if (!inside) out += dec.decode(carry);
  return out;
}
// a 재결's own text: CDATA and the editor's marks (<Text>, <Object … Type="Table">) out, a table shown as [표]
const acrcText = (s, max) => {
  const t = lines(String(s || '').replace(/\r/g, '').replace(/<Object\b[^>]*Type="Table"[^>]*>/gi, '[표]').replace(/<Object\b[^>]*>/gi, '[그림]')
    .replace(/<\/?(?:Text|Object|Image)\b[^>]*>/gi, '').replace(/<표 삽입을 위한 여백>/g, ''));
  return t.length > max ? [t.slice(0, max), true] : [t, false];
};
const ACRC_BODY_V = 1;
async function acrcBody(env, url) {
  const no = url.searchParams.get('no') || '';
  if (!/^\d{4,14}$/.test(no)) return err('bad_no', 400);
  const key = `acrc/body/${no}.json`;
  const o = await env.BUCKET.get(key);
  if (o) return storedJson(o, 86400);
  let size = 0;
  const text = await dataAsk(env, ACRC + 'adjdctexe', { pageNo: '1', numOfRows: '1', incdntNo: no }, null, (r) => {
    size = Number(r.headers.get('content-length')) || 0;
    return r.body ? textWithout(r, 'object') : r.text();
  });
  if (!/<response\b/.test(text.slice(0, 400))) throw upstreamErr('upstream unexpected');
  if (!/^(?:200|0+)$/.test(xtag(text.slice(0, 2000), 'resultCode'))) throw upstreamErr('upstream refused');
  const s = (/<item>([\s\S]*?)<\/item>/.exec(text) || [])[1];
  if (!s || xtag(s, 'incdntNo') !== no) return err('none', 404);
  const [order, c1] = acrcText(xtag(s, 'dcsnOrdr'), 20000), [claim, c2] = acrcText(xtag(s, 'clmIntn'), 20000);
  const [reason, c3] = acrcText(xtag(s, 'dcsnReason'), 150000), [laws, c4] = acrcText(xtag(s, 'relSttDeidntfCn'), 80000);
  const b = { v: ACRC_BODY_V, no, cmt: one(xtag(s, 'cmtNm')), date: ymd(xtag(s, 'redcYmd')), clme: one(xtag(s, 'clmeNm')), title: one(xtag(s, 'clmIncdntNm')), result: one(xtag(s, 'adjdcResultNm')), field: one(xtag(s, 'parentCdNm')),
    order, claim, reason, laws, lawNames: lawNamesOf(xtag(s, 'relSttDeidntfCn')), at: Date.now() };
  const hwp = httpUrl(xtag(s, 'hwpFileDownUrl'));
  if (hwp) b.hwp = hwp;
  if (c1 || c2 || c3 || c4) b.cut = true;
  if (size) b.raw = size;
  await putJ(env, key, b);
  return shown(b, 86400);
}
async function acrcApi(env, op, url) {
  if (op === 'index') {
    const o = await env.BUCKET.get('acrc/index.json');
    if (o) return storedJson(o, 1800);
    return shown({ v: 1, at: 0, want: ACRC_MONTHS, months: {}, cmts: [], results: [], laws: [], fields: [], rows: [] }, 60);
  }
  if (op === 'month') {
    const ym = url.searchParams.get('ym') || '';
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(ym)) return err('bad_month', 400);
    const o = await env.BUCKET.get(`acrc/m/${ym}.json`);
    return o ? storedJson(o, 1800) : err('none', 404);
  }
  if (op === 'body') return acrcBody(env, url);
  return err('not_found', 404);
}

// The cron (every hour, see deploy.py): one daily job a run — the self-check (diag) first, then the 위헌 법령 list — and then a
// few asks for 행정심판 재결례. Within the free plan: at most 44 outside asks a run (its limit is 50), the services' own far off.
async function cronRun(env, ctx, now) {
  const st = (await getJ(env, 'cron/state.json')) || {};
  const day = kstDay(now), did = [], errs = [];
  try {
    if (st.diag !== day) { st.diag = day; await putJ(env, 'cron/state.json', st); await diagRun(env, null, 'cron', now); did.push('diag'); }
    else if (st.unconst !== day && !(st.unconstTry && now - st.unconstTry < 3 * 3600e3)) {
      st.unconstTry = now;
      await unconstBuild(env, now, { left: 40 });   // (statistics lagging a year and 50 a page: 11 + 18 + 2; with 4 for 재결례, under 50)
      st.unconst = day; did.push('unconst');
    }
  } catch (e) { errs.push(String((e && e.message) || e).slice(0, 120)); }
  try {
    const r = await acrcCollect(env, now, { left: Number(env.CRON_ACRC_CALLS) || CRON_ACRC_CALLS });
    if (r.done.length) did.push('acrc ' + r.done.join(','));
    if (r.err) errs.push('acrc ' + r.err);
  } catch (e) { errs.push('acrc ' + String((e && e.message) || e).slice(0, 120)); }
  st.last = { at: now, did, ...(errs.length ? { err: errs.join('; ').slice(0, 300) } : {}) };
  await putJ(env, 'cron/state.json', st);
  return st.last;
}

// The daily check's record: one entry a day (the owner's day), 14 days. A source counts as working that day when any check
// that day found it working (a check from Korea and the cron's, which runs elsewhere, can differ); failing: those that did
// not work on each of the last two days in a row
const DIAG_DAYS = 14;
const DIAG_BAD = /SERVICE_KEY_IS|LIMITED_NUMBER|<errMsg>|<returnReasonCode>|<html|<!DOCTYPE|"error(?:Code)?"\s*:|"result"\s*:\s*"[^"]*실패/i;
function diagOk(k, r) {
  if (!r || r.status === 'no key') return null;
  if (r.error || !(r.status >= 200 && r.status < 300)) return false;
  const h = String(r.head || '');
  if (k === 'acrc') return /<resultCode>\s*(?:200|0+)\s*</.test(h);
  if (k === 'nars') return /"code"\s*:\s*"00"/.test(h);
  if (k === 'kci') return /<OAI-PMH/.test(h) && !/<error\b/.test(h);
  if (k === 'kcisearch') return /<record\b|<total>\s*\d/.test(h);
  if (k === 'assembly' && /"CODE"\s*:\s*"(?!INFO-000|INFO-200)/.test(h)) return false;
  if (/"resultCode"\s*:\s*"(?!0+")|<resultCode>(?!0+<|00<)/.test(h)) return false;
  return !DIAG_BAD.test(h);
}
async function diagDays(env, out, from) {
  const day = kstDay(out.at), days = (await getJ(env, 'diag/days.json')) || [];
  let d = days.find((x) => x.day === day);
  if (!d) { d = { day, runs: 0, from: [], ok: {}, why: {} }; days.push(d); }
  d.runs++; d.at = out.at;
  const where = from === 'cron' ? 'cron' : (out.country || from);
  if (!d.from.includes(where)) d.from.push(where);
  for (const [k, r] of Object.entries(out.results)) {
    const ok = diagOk(k, r);
    if (ok === null) continue;
    if (ok) { d.ok[k] = true; delete d.why[k]; } else if (d.ok[k] !== true) { d.ok[k] = false; d.why[k] = r.error ? String(r.error).slice(0, 80) : r.status >= 200 && r.status < 300 ? 'refused' : 'HTTP ' + r.status; }
    // (and by where it was asked from: the cron, or a device's check)
    const by = from === 'cron' ? (d.cron = d.cron || {}) : (d.dev = d.dev || {});
    by[k] = by[k] === true || ok;
  }
  days.sort((a, b) => a.day.localeCompare(b.day));
  await putJ(env, 'diag/days.json', days.slice(-DIAG_DAYS));
}
// A source that answers Korean addresses only (ScienceON, some public sites) fails every check of the cron, which runs
// elsewhere: one that has worked from a device and never from the cron (in the days kept) is failing only when a device's
// check found it not working on both days — two days the owner did not open the app say nothing of it.
function diagFailing(days) {
  const [a, b] = days.slice(-2);
  if (!a || !b || Date.parse(b.day) - Date.parse(a.day) !== 86400e3) return [];
  const away = (k) => days.some((d) => d.dev && d.dev[k] === true) && !days.some((d) => d.cron && d.cron[k] === true);
  return Object.keys(b.ok).filter((k) => b.ok[k] === false && a.ok[k] === false && (!away(k) || (a.dev && a.dev[k] === false && b.dev && b.dev[k] === false))).sort();
}
async function diagLast(env) {
  const [last, days, cron, acrc] = await Promise.all([getJ(env, 'diag/last.json'), getJ(env, 'diag/days.json'), getJ(env, 'cron/state.json'), getJ(env, 'acrc/state.json')]);
  if (!last && !days) return err('none', 404);
  const list = days || [];
  return json({ ...(last || {}), days: list, failing: diagFailing(list), ...(cron && cron.last ? { cron: cron.last } : {}),
    ...(acrc ? { acrc: { months: Object.keys(acrc.months || {}).length, want: ACRC_MONTHS, last: acrc.last || null } } : {}) });
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
function cleanName(s, max = 40) {   // (and no characters that turn the text around: '\u202efdp.exe' would show as 'exe.pdf')
  return String(s || '').replace(/[\u202a-\u202e\u2066-\u2069]/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Sign-in tries. No one counter everyone shares: parallel requests all read it before any wrote it (60 at once got 51 checks),
// and a stranger could fill it to keep the owner out. Each try is first written as its own small object, and only then are the
// tries counted, by listing them (R2's lists are strongly consistent). Of any tries, the one written last sees all the others,
// so however many arrive at once, no more than TRY_IP of one address are ever checked in an hour. A try refused before its
// PIN was looked at is taken back, so waiting out the time is enough; a right PIN clears its address.
//   per address (Cloudflare's CF-Connecting-IP, kept only as a hash): 8 wrong PINs within an hour lock that address for the hour
//   everyone: past TRY_ALL wrong PINs within an hour, one try a minute — a try that meets another in the same minute waits —
//   so tries from many addresses are slowed down. An address the right PIN came from before (auth/known/<hash>) is not
//   slowed (only its own 8 an hour hold): else a stranger's one wrong PIN at the start of each minute kept the owner out
const TRY_IP = 8, TRY_ALL = 30, TRY_HOUR = 3600e3, TRY_SLOT = 60e3;
async function triesOf(env, prefix) {
  const out = [];
  let cursor;
  do {
    const l = await env.BUCKET.list({ prefix, cursor, limit: 1000 });
    for (const o of l.objects) if (o) out.push({ key: o.key, at: Number(o.key.slice(prefix.length).split('-')[0]) || 0 });
    cursor = l.truncated ? l.cursor : undefined;
  } while (cursor && out.length < 20000);
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

async function login(req, env, ctx) {
  if (!env.PIN_HASH || !env.PEPPER) return err('not_configured', 503);
  const body = await readJSON(req, 4096);
  const now = Date.now();
  const addr = (await sha256hex(env.PEPPER + ':addr:' + (req.headers.get('cf-connecting-ip') || 'local'))).slice(0, 20);
  const mine = 'auth/try/' + addr + '/', every = 'auth/tryall/';
  const name = String(now).padStart(15, '0') + '-' + token().slice(0, 10);
  const later = (w) => { if (ctx && ctx.waitUntil) ctx.waitUntil(w.catch(() => {})); else return w.catch(() => {}); };
  const lockedUntil = (list) => list[Math.max(0, list.length - TRY_IP)].at + TRY_HOUR;   // when fewer than TRY_IP are left in the hour
  // this address
  await env.BUCKET.put(mine + name, '1');
  const here = await triesOf(env, mine);
  const old = here.filter((t) => t.at <= now - TRY_HOUR).map((t) => t.key);
  const recent = here.filter((t) => t.at > now - TRY_HOUR);
  if (old.length) await later(deleteMany(env, old));
  if (recent.length > TRY_IP) {
    await env.BUCKET.delete(mine + name);
    const others = recent.filter((t) => t.key !== mine + name);
    return err('locked', 429, { left: 0, until: lockedUntil(others) });
  }
  // everyone
  await env.BUCKET.put(every + name, '1');
  const all = await triesOf(env, every);
  const oldAll = all.filter((t) => t.at <= now - TRY_HOUR).map((t) => t.key);
  if (oldAll.length) await later(deleteMany(env, oldAll.slice(0, 900)));
  const recentAll = all.filter((t) => t.at > now - TRY_HOUR);
  if (recentAll.length > TRY_ALL && !(await env.BUCKET.head('auth/known/' + addr))) {
    const slot = Math.floor(now / TRY_SLOT);
    if (recentAll.filter((t) => Math.floor(t.at / TRY_SLOT) === slot).length > 1) {
      await deleteMany(env, [mine + name, every + name]);
      return err('locked', 429, { until: (slot + 1) * TRY_SLOT, slow: true });
    }
  }
  const pin = String(body.pin || '');
  const ok = /^\d{6}$/.test(pin) && sameHex(await sha256hex(env.PEPPER + ':' + pin), env.PIN_HASH);
  if (!ok) {
    const left = TRY_IP - recent.length;
    return left > 0 ? err('pin', 401, { left }) : err('locked', 429, { left: 0, until: lockedUntil(recent) });
  }
  await deleteMany(env, [...here.map((t) => t.key), every + name, 'auth/fails.json']);   // (auth/fails.json: the counter of before)
  await env.BUCKET.put('auth/known/' + addr, String(now));
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
        // after reading: 1–3 stars, -2 = △ (unclear; skim once more), -1 = ✕ (no need to come back); 0 clears. op.at is when it was
        // given (a mark kept on a device while offline arrives late): the newer one stays, so an older ★ sent late never
        // replaces a ✕ given since on another device. An op without op.at (an older app) counts as given now.
        // op.sent (newer apps) is when the device sent it, by the same device clock as op.at: the mark is then as old as
        // sent − at by this server's clock, so a device running slow or fast neither loses a fresh ★ nor wins with an old one.
        // Without op.sent (an older app) op.at is taken as it is, never later than now.
        let stale = false;
        if ('stars' in s) {
          const given = Number.isFinite(op.at) && op.at > 0, sent = given && Number.isFinite(op.sent) && op.sent > 0;
          const at = !given ? now : sent ? now - Math.max(0, op.sent - op.at) : Math.min(op.at, now);
          if ((f.starsAt || f.rated || 0) > at) stale = r.stale = true;
          else { const v = Math.round(Number(s.stars)); f.stars = (v >= 1 && v <= 3) || v === -1 || v === -2 ? v : 0; f.rated = f.stars ? at : null; f.starsAt = at; }
        }
        if ('paper' in s) {   // where it was published (학술지 · 학회 · 권호 · 발간일), kept here so every device shows it at once
          const p = s.paper && typeof s.paper === 'object' ? s.paper : null;
          const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
          const date = String((p && p.date) || '');
          const v = p ? { journal: str(p.journal, 120), society: str(p.society, 120), issue: str(p.issue, 60), date: /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(date) ? date : '' } : null;
          if (v && (v.journal || v.date)) f.paper = v; else delete f.paper;
        }
        if (Object.keys(s).some((k) => k !== 'paper' && !(k === 'stars' && stale))) f.modified = now;   // a line filled in is not a change of the paper
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

/* ---------------- 글쓰기 도우미: the owner's academic Korean, polished in the owner's own style by Claude ---------------- */
// Asked of Anthropic's Messages API with the owner's own key (env.ANTHROPIC_API_KEY, a secret): it goes out only in the
// request's x-api-key header and is never logged, kept or sent back (a word passed on from Anthropic has it taken out).
// The answer is streamed (server-sent events: the API guide's raw-HTTP way, this worker being one plain module with no SDK)
// and passed on as it comes: its text pieces just as Anthropic sends them (event: delta, the content_block_delta JSON as is,
// so nothing is parsed per piece here: little CPU however long the answer), and this server's own word on how it goes
// (event: shelf — start, wait, fallback, done, error). The models' thinking (always on for these models) is not passed on.
// Before anything goes out: no key → no_key (nothing is asked of anyone); a text over WRITE_MAX letters → too_long; the
// day's requests at WRITE_DAY_CAP → daily_cap (counted in R2, write/use.json, by the owner's day in Korea; a request that
// never got an answer started is given back).
// The models, in one place. The first is asked; the second takes over when the first declines (stop_reason "refusal":
// a safety classifier's or the model's own — the app throws away any part already shown) or cannot be had (not offered
// to this key, or still overloaded after one more try). Done here by hand, as the guide has it for raw HTTP: the API's own
// fallback list takes only the models it names for Fable (claude-opus-4-8, claude-opus-5), and the owner chose Opus 5.5.
// The guide's fallback credit is left out for the same reason (it is redeemed only on those models); without it a
// refusal costs one cold cache write of a few thousand tokens on the second model.
// usd: the price per million tokens (input, output, cache read; a cache write is input × 1.25), for the day's budget only
// (an estimate: Anthropic's bill is the truth). Fable 5.2's price is not in the API guide this was written from; Fable
// 5.1's ($10 / $50) is used, the higher of the two that have been named, so the budget errs on the safe side.
const WRITE_MODELS = [
  { id: 'claude-fable-5-2', name: 'Claude Fable 5.2', usd: { in: 10, out: 50, read: 0.25 } },
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', usd: { in: 4, out: 20, read: 0.2 } },
];
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2026-10-21';
const WRITE_MAX = 12000;          // letters (Unicode characters: one Hangul syllable is one) a text may have
const WRITE_SAMPLE_MAX = 40000;   // letters of the paragraphs sent to learn the style (내 문체 익히기)
const WRITE_DAY_CAP = 150;        // requests a day
// what a day may cost, in US dollars (estimated from each answer's usage). The request cap alone would allow far more:
// one request may use up to WRITE_OUT tokens (about $3.20 on Fable), so 150 of them about $500 — a client stuck in a loop,
// or a device token in the wrong hands, could spend that. Checked before each request; the request under way finishes.
const WRITE_DAY_USD = 40;
const WRITE_OUT = 64000;          // max_tokens: thinking and answer together; a ceiling only (what is used is what is billed)
// how much a used answer cost: usage as Anthropic reports it, at the model's price
const writeCost = (m, u = {}) => {
  const p = (m && m.usd) || WRITE_MODELS[0].usd, n = (k) => Number(u[k]) || 0;
  return (n('input_tokens') * p.in + n('cache_creation_input_tokens') * p.in * 1.25 + n('cache_read_input_tokens') * p.read + n('output_tokens') * p.out) / 1e6;
};

// What holds for every request (the system prompt's first part, the same bytes every time so it is read from the cache).
// Then, when the owner's style has been learned, the style itself (the second part, where the cache mark goes).
const WRITE_RULES = `당신은 한국의 헌법·공법 연구자가 쓰는 학술 논문을 다듬는 편집자입니다. 글쓴이는 당신이 내놓은 글을 그대로 원고(학술지 논문, 학위논문, 연구보고서)에 옮겨 씁니다.

어떤 작업에서든 다음을 지킵니다.
1. 인용과 근거 표시는 글자 그대로 둡니다. 사건번호(예: 2004헌마554, 2006두330), 선고일·결정일, 결정·판결의 표시, 법령의 이름과 조·항·호·목(예: 헌법 제37조 제2항, 「공직선거법」 제272조의2), 문헌의 저자·연도·제목·쪽수, 따옴표 안의 인용문, 각주 번호(예: 12), [12], ¹²)를 바꾸거나 빼거나 옮기지 않고, 붙어 있던 문장에 그대로 남깁니다.
2. 없는 것을 만들지 않습니다. 원문에 없는 출처, 판례, 법령, 조문, 인용문, 수치, 사실을 지어내거나 기억에 기대어 보태지 않습니다. 근거가 더 필요해 보여도 근거를 만들어 넣지 않습니다(그런 자리를 어떻게 알릴지는 작업마다 정합니다).
3. 글쓴이의 주장과 결론, 논증의 방향과 강도를 바꾸지 않습니다.
4. 한국어로 쓸 때는 학술 문어체로 씁니다. 구어체, 번역투, 과장, 꾸밈을 위한 비유를 쓰지 않습니다.
5. 요청한 결과만 내놓습니다. 인사, 작업 설명, 덧붙이는 말, 마크다운 기호(#, **, 글머리표)를 쓰지 않습니다.

<글쓴이의 문체>가 주어지면, 그것은 글쓴이가 이미 발표한 논문들의 문단을 분석해 정리한 글쓴이의 문체입니다. 어느 작업에서든 글쓴이의 용어와 표기 방식(판례·조문을 부르는 방식 등)은 그에 맞춥니다.`;

// Each request: how hard the model thinks (output_config.effort — the API's control for depth and spend; these models think
// at every level) and what it is asked. The text comes first and the request after it (a long text above the question is
// read best). Requests of one kind share their effort, so their cached prefix too.
const NEEDS = '근거가 더 필요해 보이는 주장은 근거를 만들어 넣지 말고, 그 문장 끝에 [근거 필요: 어떤 근거가 필요한지 짧게]라고 표시합니다.';
const WRITE_ACTIONS = {
  polish: { effort: 'high', ask: `위 <글>을 글쓴이의 문체로 다듬어 주세요.
- <글쓴이의 문체>에 적힌 문장 길이, 종결어미, 접속어, 주장을 펴는 수위, 판례·조문을 인용하는 방식, 즐겨 쓰는 용어를 따릅니다.
- 어색한 문장, 겹치는 말, 주어와 서술어가 맞지 않는 곳, 지나치게 길어 읽기 어려운 문장을 고칩니다. 이미 좋은 문장은 그대로 둡니다.
- 비유나 꾸밈말로 멋을 내지 않고 뜻을 곧바로 씁니다.
- 내용을 더하거나 빼지 않습니다. 원문의 문단 나눔을 지킵니다.
- ${NEEDS}
- 다듬은 글만 내놓습니다.` },
  concise: { effort: 'high', ask: `위 <글>을 간결하게 줄여 주세요.
- 뜻, 주장, 논증의 단계는 그대로 두고 겹치는 말, 군더더기 수식어, 같은 내용의 되풀이, 꼭 필요하지 않은 접속 표현을 덜어냅니다.
- 인용, 사건번호, 조문, 각주 번호는 하나도 빠뜨리지 않습니다. 글쓴이의 문체를 지킵니다. 원문의 문단 나눔을 지킵니다.
- ${NEEDS}
- 줄인 글만 내놓습니다.` },
  proof: { effort: 'medium', ask: `위 <글>의 맞춤법, 띄어쓰기, 문법, 문장 부호만 바로잡아 주세요.
- 한글 맞춤법과 표준어 규정을 따릅니다. 법령 이름과 법령에서 쓰는 용어는 법령의 표기를 따릅니다.
- 문체, 어휘, 문장 구조는 바꾸지 않습니다. 틀린 곳만 고치고, 표시나 설명은 붙이지 않습니다. 원문의 문단 나눔을 지킵니다.
- 고친 글만 내놓습니다.` },
  logic: { effort: 'high', ask: `위 <글>의 논리를 점검해 주세요. 글은 고치지 말고 의견만 씁니다.
- 살필 것: 주장과 근거의 연결이 약한 곳, 논리의 비약, 같은 개념을 다른 뜻으로 쓴 곳, 앞뒤가 어긋나는 곳, 다루지 않은 유력한 반론, 근거가 더 필요한 주장(어떤 근거가 필요한지), 인용한 판례·조문이 글 안에서 그 주장과 실제로 이어져 있는지(판례의 내용을 기억에 기대어 단정하지 않습니다).
- 문제마다 해당 대목을 짧게 따옴표로 옮겨 위치를 밝히고, 왜 문제인지와 어떻게 보완할 수 있는지를 한두 문장으로 씁니다.
- 중요한 것부터 번호(1. 2. 3.)를 붙여 씁니다. 문제가 없는 부분을 따로 칭찬하지 않습니다. 지적할 것이 없으면 '특별히 지적할 곳이 없습니다.'라고만 씁니다.
- 새 출처나 판례를 제시하지 않습니다. 필요한 근거의 종류만 말합니다.` },
  english: { effort: 'high', ask: `위 <글>을 바탕으로 학술 영어 초록(abstract)을 써 주세요.
- 글이 이미 초록이면 충실하게 옮기고, 본문이면 그 내용을 초록으로 요약합니다. 글에 없는 내용을 더하지 않습니다.
- 한 문단, 150~250단어로, 법학 학술지의 영어 초록 문체('This article…', 'This study…', 현재 시제 중심)로 씁니다.
- 기관과 법령은 공식 영문 명칭으로 씁니다(예: the Constitutional Court of Korea, the Public Official Election Act, Article 37(2) of the Constitution). 공식 명칭이 확실하지 않으면 뜻을 옮기고 처음 나올 때 괄호 안에 로마자 표기를 붙입니다.
- 사건번호는 숫자를 바꾸지 말고 헌법재판소·대법원의 영문 표기 방식(예: 2004Hun-Ma554, 2006Du330)으로 씁니다.
- 글에 주제어가 있으면 마지막 줄에 'Keywords:'를 붙여 옮깁니다.
- 초록만 내놓습니다.` },
};
const NO_STYLE = '- 아직 <글쓴이의 문체>가 없습니다. 원문에 드러난 글쓴이의 어투와 표기 방식을 그대로 살리면서 다듬습니다.';

// 내 문체 익히기: paragraphs the app picked from the owner's own papers (introductions, arguments, conclusions; no notes,
// tables or references), each with its paper's number and part only (no titles or names go out), and the request to
// describe the style precisely enough for another editor to write in it. What comes back is kept (write/style.json) and
// shown to the owner, and becomes the second part of every later request's system prompt.
const STYLE_RULES = '당신은 한국어 학술 문체를 분석하는 편집자입니다. 한 헌법·공법 연구자가 이미 발표한 논문들에서 뽑은 문단을 읽고, 이 사람의 문체를 다른 편집자가 그대로 따라 쓸 수 있을 만큼 정확하게 정리합니다. 이 정리는 이후 이 사람의 새 원고를 이 사람의 문체로 다듬을 때 지침으로 쓰입니다.';
const STYLE_ASK = `위 문단들을 바탕으로 글쓴이의 문체를 아래 항목별로 정리해 주세요.

1. 문장: 문장의 길이(대략 몇 자 안팎인지), 한 문장에 담는 생각의 수, 자주 쓰는 문장 구조
2. 종결 표현: 실제로 자주 쓰는 종결 표현과 대략의 비중(예: '-ㄴ다', '-이다', '-ㄹ 것이다', '-라고 할 수 있다', '-로 보인다', '-필요가 있다')
3. 접속어와 전개: 문장과 문단을 잇는 말, 문단을 여는 방식과 맺는 방식
4. 주장의 수위: 단정하는 경우와 유보하는 경우, 그때 쓰는 표현
5. 인용: 판례(헌법재판소 결정, 법원 판결), 법령 조문, 문헌을 본문에서 부르는 방식과 표기(괄호, 낫표, '헌재', '동법', '본 법' 같은 약칭 등)
6. 용어: 즐겨 쓰는 용어와 표기, 피하는 듯한 표현, 한자어와 외래어의 쓰임
7. 서론, 본론, 결론에서 달라지는 점
8. 이 문체로 다듬을 때 꼭 지킬 것과 하지 말 것(5~10가지)

지킬 것:
- 항목마다 문단에서 그대로 옮긴 짧은 구절을 예로 2~4개씩 큰따옴표에 넣어 붙입니다.
- 문단에 드러나지 않은 것은 추측하지 않고 '자료에서 뚜렷하지 않음'이라고 씁니다.
- 이 문단들은 PDF에서 뽑아 줄이 바뀌던 자리에 띄어쓰기가 잘못 들어가거나 빠진 곳이 있습니다(예: '문제 점이'). 띄어쓰기는 문체 판단에 쓰지 않습니다.
- 사람의 이름이나 소속은 쓰지 않습니다.
- 전체 2,500~4,000자로, 항목 번호와 제목 말고 다른 꾸밈(마크다운 기호 등)은 쓰지 않습니다.`;

const writeClean = (s, max = 1e6) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const letterCount = (s) => { let n = 0; for (const c of s) n++; return n; };   // (c of a string: one per code point)
// the next midnight in Korea, when the day's count starts again
const kstMidnight = (t = Date.now()) => Date.parse(kstDay(t) + 'T00:00:00+09:00') + 86400e3;

// the day's requests and spend: d = 0 reads them, +1 takes a request (refused at the cap or once the budget is spent),
// -1 gives one back; usd adds what an answer cost
async function writeCount(env, d, usd = 0) {
  const day = kstDay();
  for (let attempt = 0; attempt < 8; attempt++) {
    const o = await env.BUCKET.get('write/use.json');
    const cur = o ? await o.json().catch(() => ({})) : {};
    const today = cur.day === day;
    const n = today ? Number(cur.n) || 0 : 0, spent = today ? Number(cur.usd) || 0 : 0;
    if (!d && !usd) return { n, usd: spent };
    if (d > 0 && n >= WRITE_DAY_CAP) return { n, usd: spent, full: 'daily_cap' };
    if (d > 0 && spent >= WRITE_DAY_USD) return { n, usd: spent, full: 'daily_budget' };
    const next = { day, n: Math.max(0, n + d), usd: Math.round((spent + usd) * 1e4) / 1e4 };
    const put = await env.BUCKET.put('write/use.json', JSON.stringify(next), { httpMetadata: { contentType: 'application/json' }, onlyIf: o ? { etagMatches: o.etag } : undefined });
    if (put === null) { await new Promise((r) => setTimeout(r, 30 + Math.random() * 90)); continue; }
    return { n: next.n, usd: next.usd };
  }
  return { n: 0, usd: 0, busy: true };
}

// what the app needs to draw the screen: whether a key is set (never the key), the models, the limits, today's count, and
// when the style was learned (its text: /api/write/style)
async function writeInfo(env) {
  const [use, st] = await Promise.all([writeCount(env, 0), env.BUCKET.head('write/style.json')]);
  const m = (st && st.customMetadata) || {};
  return json({
    key: !!env.ANTHROPIC_API_KEY, models: WRITE_MODELS, max: WRITE_MAX, sampleMax: WRITE_SAMPLE_MAX, cap: WRITE_DAY_CAP, used: use.n, reset: kstMidnight(),
    budget: WRITE_DAY_USD, spent: use.usd,
    style: st ? { at: Number(m.at) || 0, model: m.model || '', papers: Number(m.papers) || 0, paragraphs: Number(m.paragraphs) || 0, chars: Number(m.chars) || 0 } : null,
  });
}
async function writeStyle(env) {
  const o = await env.BUCKET.get('write/style.json');
  return o ? new Response(o.body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }) : err('none', 404);
}
// The latest answer, for an app that lost the connection while it was written (the page reloaded or closed, the phone
// locked, the app sent to the background): { id, state: running | done, at, sse — the events as they were streamed }.
// Only the latest is kept; an id that is not the latest's is gone.
const WRITE_ID = /^[a-z0-9]{4,24}$/;
async function writeLast(env, url) {
  const id = url.searchParams.get('id') || '';
  const o = WRITE_ID.test(id) ? await env.BUCKET.get('write/last.json') : null;
  const d = o ? await o.json().catch(() => null) : null;
  if (!d || d.id !== id) return err('gone', 404);
  return json(d);
}
// 멈추기: the app lets go of the stream, which the server would otherwise read to the end (to keep it for the app); this
// says the owner meant it, so the request still running stops too and is not billed further
async function writeStop(req, env) {
  const b = await readJSON(req, 4096);
  const id = b && typeof b.id === 'string' && WRITE_ID.test(b.id) ? b.id : '';
  if (!id) return err('bad_id', 400);
  await env.BUCKET.put('write/stop.json', JSON.stringify({ id, at: Date.now() }), { httpMetadata: { contentType: 'application/json' }, customMetadata: { id } });
  return json({ ok: true });
}

async function writeAsk(req, env, ctx) {
  if (!env.ANTHROPIC_API_KEY) return err('no_key', 503);
  const b0 = await readJSON(req, 512 * 1024), b = b0 && typeof b0 === 'object' ? b0 : {};
  let body, keep = null;
  if (b.action === 'profile') {
    const parts = new Set(['서론', '본론', '결론']);
    const paras = (Array.isArray(b.paragraphs) ? b.paragraphs : []).slice(0, 40)
      .map((p) => ({ text: writeClean(p && p.text, 3000), part: parts.has(p && p.part) ? p.part : '본론', paper: Math.min(99, Math.max(1, Math.floor(Number(p && p.paper) || 1))) }))
      .filter((p) => p.text.length >= 80);
    if (paras.length < 5) return err('too_few', 400, { min: 5 });
    const got = paras.reduce((s, p) => s + letterCount(p.text), 0);
    if (got > WRITE_SAMPLE_MAX) return err('too_long', 413, { max: WRITE_SAMPLE_MAX, got });
    const doc = paras.map((p, i) => `<문단 번호="${i + 1}" 논문="${p.paper}" 부분="${p.part}">\n${p.text}\n</문단>`).join('\n\n');
    body = { max_tokens: WRITE_OUT, stream: true, output_config: { effort: 'high' }, system: [{ type: 'text', text: STYLE_RULES }], messages: [{ role: 'user', content: doc + '\n\n' + STYLE_ASK }] };
    const sources = (Array.isArray(b.sources) ? b.sources : []).slice(0, 60).map((s) => ({ title: cleanName(s && s.title, 160), n: Math.max(0, Math.floor(Number(s && s.n) || 0)) })).filter((s) => s.title);
    const papers = new Set(paras.map((p) => p.paper)).size;
    keep = async (text, model) => {   // the style as described, kept for every device and every later request
      const at = Date.now();
      await env.BUCKET.put('write/style.json', JSON.stringify({ v: 1, text, at, model: model.id, papers, paragraphs: paras.length, chars: got, sources }), {
        httpMetadata: { contentType: 'application/json' },
        customMetadata: { at: String(at), model: model.id, papers: String(papers), paragraphs: String(paras.length), chars: String(got) },
      });
      return { at, model: model.id, papers, paragraphs: paras.length, chars: got };
    };
  } else {
    const act = Object.prototype.hasOwnProperty.call(WRITE_ACTIONS, b.action) ? WRITE_ACTIONS[b.action] : null;
    if (!act) return err('bad_action', 400);
    const text = writeClean(b.text);
    if (!text) return err('no_text', 400);
    const got = letterCount(text);
    if (got > WRITE_MAX) return err('too_long', 413, { max: WRITE_MAX, got });
    const style = await env.BUCKET.get('write/style.json').then((o) => (o ? o.json() : null)).catch(() => null);
    const system = [{ type: 'text', text: WRITE_RULES }];
    if (style && style.text) system.push({ type: 'text', text: `<글쓴이의 문체>\n${style.text}\n</글쓴이의 문체>` });
    system[system.length - 1].cache_control = { type: 'ephemeral' };   // the rules and the style: the same prefix every time
    const ask = act.ask + (b.action === 'polish' && !(style && style.text) ? '\n' + NO_STYLE : '');
    body = { max_tokens: WRITE_OUT, stream: true, output_config: { effort: act.effort }, system, messages: [{ role: 'user', content: `<글>\n${text}\n</글>\n\n${ask}` }] };
  }
  // the app's own name for this request: with it the answer is read to the end even if the app goes away (the style is
  // then kept all the same; a rewrite or an opinion is kept in write/last.json for the app to fetch), unless it is stopped
  const id = typeof b.id === 'string' && WRITE_ID.test(b.id) ? b.id : '';
  const use = await writeCount(env, 1);
  if (use.busy) return err('busy', 409);
  if (use.full === 'daily_cap') return err('daily_cap', 429, { cap: WRITE_DAY_CAP, used: use.n, reset: kstMidnight() });
  if (use.full) return err('daily_budget', 429, { budget: WRITE_DAY_USD, spent: use.usd, reset: kstMidnight() });
  return writeStream(env, ctx, body, use.n, keep, { id, act: b.action, spent: use.usd });
}

// The answer to the app, as it comes. Runs on after the response has begun (ctx.waitUntil). Writes to the app are not
// waited for: an app that is slow, or asleep on a locked phone with the connection still open, must not hold up the
// reading (an answer is at most a few hundred KB, so what waits for it is small). When the app goes away (reloaded,
// closed, sent to the background), a request with the app's id is read to the end all the same — the answer is billed
// either way, so it is kept: a rewrite or an opinion in write/last.json, the events just as they were streamed, which
// the app fetches when it is back; the style as always. The platform gives a request whose app has gone some 30 s more,
// so a long answer may still be lost; the app says so then. A request the owner stopped (멈추기 → write/stop.json), or
// one with no id (an older app), is let go at once, as before, so nothing more is billed.
function writeStream(env, ctx, body, used, keep, job = {}) {
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter(), enc = new TextEncoder();
  const id = job.id || '', logIt = !!id && !keep, t0 = Date.now();
  const halt = { on: false, reader: null };   // (claudeRelay hangs its reader here, so a stop can cancel it)
  let gone = false, over = false, log = '';
  const stop = () => { halt.on = true; if (halt.reader) halt.reader.cancel().catch(() => {}); };
  // stopped on purpose? Asked of R2 every 2 s while the answer is read (a cheap HEAD), not only once the app is seen to
  // have gone: that is seen only at the next write, and a model thinking for minutes writes nothing meanwhile
  const watch = async () => {
    while (!over && !halt.on) {
      await sleep(2000);
      if (over) break;
      const h = await env.BUCKET.head('write/stop.json').catch(() => null);
      if (h && h.customMetadata && h.customMetadata.id === id) stop();
    }
  };
  const left = () => { if (gone) return; gone = true; if (!id) stop(); };
  const send = (s) => { if (!gone) w.write(enc.encode(s)).catch(left); };
  const put = (s) => { if (logIt) log += s; send(s); };
  const ping = () => send(': ping\n\n');   // (not kept: it only keeps the line awake)
  const tell = (o) => put(`event: shelf\ndata: ${JSON.stringify(o)}\n\n`);
  const save = (state) => (logIt ? env.BUCKET.put('write/last.json', JSON.stringify({ id, act: job.act || '', state, at: t0, sse: log }), { httpMetadata: { contentType: 'application/json' } }).catch(() => {}) : null);
  const key = env.ANTHROPIC_API_KEY;
  const plain = (s) => String(s || '').split(key).join('').slice(0, 300);   // a word from Anthropic, the key taken out if ever there
  let started = false;   // an answer was begun (billed): the day's count stands
  let cost = 0, spent = Number(job.spent) || 0, settled = false;
  const settle = async () => {   // what the answers cost, added to the day's spend (once)
    if (settled || !cost) return;
    settled = true;
    const u = await writeCount(env, 0, cost).catch(() => null);
    if (u && !u.busy) spent = u.usd;
  };
  const day = () => ({ used, cap: WRITE_DAY_CAP, spent: Math.round(spent * 100) / 100, budget: WRITE_DAY_USD });
  const run = async () => {
    const stub = save('running');
    try {
      tell({ type: 'start', model: WRITE_MODELS[0], ...day() });
      for (let i = 0; i < WRITE_MODELS.length; i++) {
        const m = WRITE_MODELS[i], next = WRITE_MODELS[i + 1];
        const r = await claudeOpen(env, { ...body, model: m.id }, (sec, why) => tell({ type: 'wait', sec, why }));
        if (!r.ok) {
          if (r.unavailable && next) { tell({ type: 'fallback', from: m, to: next, why: 'unavailable' }); continue; }
          await settle();
          tell({ type: 'error', code: r.code, ...(r.sec ? { sec: r.sec } : {}), ...(r.message ? { message: plain(r.message) } : {}) });
          return;
        }
        started = true;
        const out = await claudeRelay(r.res, put, ping, !!keep, halt);
        cost += writeCost(m, out.usage);
        if (halt.on) { await settle(); tell({ type: 'error', code: 'stopped' }); return; }
        if (out.stop === 'refusal') {
          if (next) { tell({ type: 'fallback', from: m, to: next, why: 'refusal' }); continue; }
          await settle();
          tell({ type: 'error', code: 'refused' });
          return;
        }
        // overloaded in the middle of the stream before any text: as if it could not be had
        if (out.error && !out.any && next && /overloaded|api_error/.test(out.error)) { tell({ type: 'fallback', from: m, to: next, why: 'unavailable' }); continue; }
        await settle();
        if (out.error || !out.stop) { tell({ type: 'error', code: /overloaded/.test(out.error) ? 'overloaded' : 'cut', partial: out.any }); return; }
        const style = keep && out.stop === 'end_turn' && out.text.length >= 200 ? await keep(out.text, m) : null;
        tell({ type: 'done', model: m, stop: out.stop, usage: out.usage, ...day(), ...(style ? { style } : {}) });
        return;
      }
    } catch (e) {
      tell({ type: 'error', code: 'server', message: plain(e && e.message) });
    } finally {
      over = true;
      await settle().catch(() => {});
      if (!started) await writeCount(env, -1).catch(() => {});   // no answer was begun: not counted against the day
      await stub;
      await save(halt.on ? 'stopped' : 'done');
      await w.close().catch(() => {});
    }
  };
  ctx.waitUntil(run());
  if (id) ctx.waitUntil(watch());
  return new Response(readable, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' } });
}

// One model asked, with one more try (after the wait Anthropic gives, at most 20 s) when it is overloaded, failing, rate-
// limited or out of reach; then: { ok, res } or { ok: false, code, unavailable (worth the next model), sec, message }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function claudeOpen(env, body, onWait) {
  const payload = JSON.stringify(body);
  for (let tries = 0; ; tries++) {
    let res = null;
    try {
      res = await fetch(ANTHROPIC, { method: 'POST', body: payload, headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': ANTHROPIC_VERSION, 'user-agent': UA } });
    } catch (e) { res = null; }
    if (res && res.ok && res.body) return { ok: true, res };
    const status = res ? res.status : 0;
    const e = res ? await res.json().catch(() => null) : null;
    const message = String((e && e.error && e.error.message) || '');
    const after = res ? Math.ceil(Number(res.headers.get('retry-after'))) : NaN;
    const busy = !res || status === 429 || status >= 500;
    if (busy && tries === 0 && !(status === 429 && after > 20)) {
      const sec = Math.min(20, Math.max(2, after > 0 ? after : 3));
      await onWait(sec, status === 429 ? 'rate' : 'busy');
      await sleep(sec * 1000);
      continue;
    }
    if (status === 429) return { ok: false, code: 'rate_limited', sec: after > 0 ? after : 30 };
    if (status >= 500) return { ok: false, code: 'overloaded', unavailable: true };
    if (!res) return { ok: false, code: 'upstream' };
    if (status === 401) return { ok: false, code: 'bad_key' };
    if (status === 402 || /credit balance|billing/i.test(message)) return { ok: false, code: 'billing' };
    // a model this key may not use (or not under the account's data-retention setting, which Fable requires)
    if (status === 404 || status === 403 || (status === 400 && /retention/i.test(message))) return { ok: false, code: 'no_model', unavailable: true, message };
    if (status === 413) return { ok: false, code: 'too_large' };
    return { ok: false, code: 'bad_request', message };
  }
}

// Anthropic's stream, passed on: text deltas as they are, a ping as a comment (keeps the connection to the app awake while
// the model thinks); how it ended (stop_reason, usage, an error event) read from the few other events. keep: the text is
// gathered too (the style, to be kept). halt: its reader is hung there (a stop cancels it), and halt.on ends the reading.
async function claudeRelay(res, put, ping, keep, halt = {}) {
  const reader = res.body.getReader(), dec = new TextDecoder();
  halt.reader = reader;
  const out = { stop: '', usage: {}, any: false, error: '', text: '' };
  const send = put;   // (never throws: an app gone away is noticed by the caller)
  let buf = '';
  for (;;) {
    let chunk;
    try { chunk = await reader.read(); } catch (e) { out.error = out.error || 'broken'; break; }
    if (chunk.done || halt.on) { if (halt.on) await reader.cancel().catch(() => {}); break; }
    buf += dec.decode(chunk.value, { stream: true }).replace(/\r/g, '');
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let name = '', data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) name = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (name === 'content_block_delta') {
        if (data.includes('"text_delta"')) {
          send('event: delta\ndata: ' + data + '\n\n');
          out.any = true;
          if (keep) { try { out.text += JSON.parse(data).delta.text || ''; } catch (e) { /* a broken piece */ } }
        }
        continue;   // (thinking and its signature stay here)
      }
      if (name === 'ping') { ping(); continue; }
      let d = null;
      try { d = JSON.parse(data); } catch (e) { continue; }
      if (name === 'message_start' && d.message) Object.assign(out.usage, d.message.usage || {});
      else if (name === 'message_delta') { if (d.delta && d.delta.stop_reason) out.stop = d.delta.stop_reason; if (d.usage) Object.assign(out.usage, d.usage); }
      else if (name === 'error') out.error = String((d.error && d.error.type) || 'error');
    }
  }
  return out;
}

/* ---------------- a few choices kept across devices ---------------- */
// hidden: the KCI papers set aside, { ART…: { at, on } } — set aside again or brought back, the newest word wins
async function getPrefs(env) {
  const o = await env.BUCKET.get('prefs.json');
  const d = o ? await o.json() : {};
  return json({ hidden: d.hidden || {} });
}
async function putPrefs(req, env) {
  const body = await readJSON(req, 256 * 1024);
  const inc = body && typeof body.hidden === 'object' && body.hidden ? body.hidden : {};
  for (let attempt = 0; attempt < 8; attempt++) {
    const o = await env.BUCKET.get('prefs.json');
    const cur = o ? await o.json() : {};
    cur.hidden = cur.hidden || {};
    for (const [k, v] of Object.entries(inc)) {
      if (!/^ART\d{6,12}$/.test(k) || !v || !Number.isFinite(v.at)) continue;
      const x = { at: v.at, on: !!v.on };
      if (!cur.hidden[k] || x.at >= cur.hidden[k].at) cur.hidden[k] = x;
    }
    const ks = Object.keys(cur.hidden);
    if (ks.length > 20000) { ks.sort((a, b) => cur.hidden[a].at - cur.hidden[b].at); for (const k of ks.slice(0, ks.length - 20000)) delete cur.hidden[k]; }
    const put = await env.BUCKET.put('prefs.json', JSON.stringify(cur), { httpMetadata: { contentType: 'application/json' }, onlyIf: o ? { etagMatches: o.etag } : undefined });
    if (put === null) { await new Promise((r) => setTimeout(r, 30 + Math.random() * 90)); continue; }
    return json({ hidden: cur.hidden });
  }
  return err('busy', 409);
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
