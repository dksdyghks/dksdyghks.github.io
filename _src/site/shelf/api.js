// Talking to the 연구실 책장 server. Every call carries this device's token; a 401 means the device was signed out.
import * as store from './store.js';

const CONFIG_API = (globalThis.SHELF_CONFIG && globalThis.SHELF_CONFIG.api) || '';
export function base() {
  let o = null;
  try { o = localStorage.getItem('shelf:api'); } catch (e) { /* ignore */ }
  return (o || CONFIG_API).replace(/\/+$/, '');
}

let token = null;
let onSignedOut = () => {};
export function setSignedOutHandler(fn) { onSignedOut = fn; }
export async function loadToken() { token = (await store.get('kv', 'token')) || null; return token; }
export function hasToken() { return !!token; }
export function authHeader() { return token ? { authorization: 'Bearer ' + token } : {}; }
// the server refused the token a request went out with: sign out once (a late answer to an older token, or a
// second refusal while the sign-in screen is already up, changes nothing)
async function signedOut(sent) {
  if (!sent || token !== sent) return;
  token = null;
  await store.del('kv', 'token');
  onSignedOut();
}

// (the server's answer comes along as extra: its own `code` and `status` — ScienceON's error code, its status line — are kept
// as srcCode and srcStatus, never in place of the server's word for the trouble and the HTTP status)
export class ApiError extends Error {
  constructor(code, status, extra = {}) {
    super(code);
    Object.assign(this, extra);
    if (extra && extra.code !== undefined && extra.code !== code) this.srcCode = extra.code;
    if (extra && extra.status !== undefined && extra.status !== status) this.srcStatus = extra.status;
    this.code = code; this.status = status;
  }
}
export const isOffline = (e) => e && e.code === 'offline';
// whether the server answered the last time it was asked: a call that got no answer while the device is online means the
// server (not the internet) is down — the app says which (onReach is told each time this changes)
let reach = true, onReach = () => {};
export const serverDown = () => !reach && (typeof navigator === 'undefined' || navigator.onLine !== false);
export function setReachHandler(fn) { onReach = fn; }
function reached(ok) { if (ok === reach) return; reach = ok; try { onReach(ok); } catch (e) { /* the app's own */ } }

async function call(path, { method = 'GET', body, headers = {}, raw = false, signal } = {}) {
  if (!base()) throw new ApiError('no_server', 0);
  const sent = token;
  if (!sent && path !== '/login') throw new ApiError('auth', 401);   // not signed in: nothing to ask the server yet
  let r;
  try {
    r = await fetch(base() + '/api' + path, {
      method, signal, cache: 'no-store',
      headers: { ...authHeader(), ...(body !== undefined && !(body instanceof Blob) ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : (body instanceof Blob ? body : JSON.stringify(body)),
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    if (navigator.onLine !== false) reached(false);
    throw new ApiError('offline', 0);
  }
  reached(true);
  if (r.status === 401 && path !== '/login') { await signedOut(sent); throw new ApiError('auth', 401); }
  // raw: the answer itself; raw 'text': its text, and a refusal keeps the server's word for it (no_key, kci_refused …);
  // raw 'stream': the answer itself, to be read as it comes, a refusal kept in the server's words too (다듬기)
  if (raw) {
    if (!r.ok) { const d = raw === 'text' || raw === 'stream' ? await r.json().catch(() => null) : null; throw new ApiError((d && d.error) || 'http_' + r.status, r.status, d || {}); }
    return raw === 'text' ? r.text() : r;
  }
  let data = null;
  try { data = await r.json(); } catch (e) { /* not JSON */ }
  if (!r.ok) throw new ApiError((data && data.error) || 'http_' + r.status, r.status, data || {});
  return data;
}

export async function login(pin, device) {
  const d = await call('/login', { method: 'POST', body: { pin, device } });
  token = d.token;
  await store.put('kv', 'token', token);
  await store.put('kv', 'device', d.device);
  return d;
}
export async function logout() {
  try { await call('/logout', { method: 'POST' }); } catch (e) { /* signed out locally anyway */ }
  token = null; await store.del('kv', 'token');
}
export const me = () => call('/me');
export const devices = () => call('/devices').then((d) => d.devices);
export const dropDevice = (id) => call('/devices/' + id, { method: 'DELETE' });
export const makeShareKey = (name) => call('/devices/sharekey', { method: 'POST', body: { name } });

export const library = () => call('/lib');
export const diagnose = () => call('/diag');   // which outside sources (KCI, 법령, 국회, 공공데이터) answer from where this device is
export const publicData = (path, params) => call('/data/' + path + '?' + new URLSearchParams(params));
export const publicDataText = (path, params) => call('/data/' + path + '?' + new URLSearchParams(params), { raw: true }).then((r) => r.text());   // an answer in XML (법제처)   // 공공데이터포털 (헌재 판례정보 and the like), through the server, which holds the key
export const lawSearch = (params) => call('/law/search?' + new URLSearchParams(params));   // 국가법령정보 OPEN API (법령·판례 목록)
export const lawItem = (params) => call('/law/item?' + new URLSearchParams(params));       // … and one law or one judgment in full
export const nlib = (op, params) => call('/nl/' + op + '?' + new URLSearchParams(params));   // 국립중앙도서관 (소장자료 검색 …)
export const nanet = (op, params) => call('/nanet/' + op + '?' + new URLSearchParams(params));   // 국회도서관 국가학술정보 클라우드 (통합검색 search, 상세보기 view)
// The outside sources the server may not be able to ask yet — its key not set, or the source refusing it (KCI, ScienceON):
// once one says so it is not asked again in this session (its reloads included) for a few hours, and then asked again, so a
// key set meanwhile is found without anything to do. Nothing about keys is ever shown: such a source is simply left out.
const DOWN_KEY = 'shelf:down';
const DOWN_FOR = { no_key: 3 * 3600e3, kci_refused: 3 * 3600e3, scienceon_token: 3 * 3600e3, scienceon: 30 * 60e3 };
let down = null;
const downMap = () => { if (!down) { try { down = JSON.parse(sessionStorage.getItem(DOWN_KEY) || '{}') || {}; } catch (e) { down = {}; } } return down; };
export const sourceDown = (name) => (downMap()[name] || 0) > Date.now();
// a refusal (no_key, kci_refused …) of this source: left alone for a while. The word made up here for a source already left
// alone (quiet) is no new refusal: it never moves the time on, or a source asked about now and then would never be asked again
export function markSource(name, e) {
  const ms = e && !e.quiet && DOWN_FOR[e.code];
  if (!ms) return false;
  downMap()[name] = Date.now() + ms;
  try { sessionStorage.setItem(DOWN_KEY, JSON.stringify(down)); } catch (x) { /* this page only */ }
  return true;
}
async function guarded(name, ask, mark = true) {
  if (sourceDown(name)) throw new ApiError('no_key', 503, { quiet: true });
  try { return await ask(); } catch (e) { if (mark) markSource(name, e); throw e; }
}
export const scienceon = (op, params) => guarded('scienceon', () => call('/scienceon/' + op + '?' + new URLSearchParams(params)));   // KISTI ScienceON 논문 (search: q, field, page; view: cn)
// KCI's own Open API (논문 검색: articleSearch by title and the like, articleDetail by id) — KCI's XML answer, the key taken out.
// mark: false for a way of asking KCI may not take (by author alone): its refusal is not KCI's refusal of the key
export const kciSearch = (params, { mark = true } = {}) => guarded('kci', () => call('/kci/search?' + new URLSearchParams(params), { raw: 'text' }), mark);
export const foreignText = (id) => call('/foreign/' + encodeURIComponent(id), { raw: true }).then((r) => r.text());   // 비교법 원문 (일본·미국·캐나다), as the source gives it
export const kciOai = (params) => call('/kci/oai?' + new URLSearchParams(params), { raw: true }).then((r) => r.text());   // KCI's OAI-PMH through the server (a whole record, with the full abstract)
// a paper's openly-posted PDF, found and fetched by the server: { blob, host }, or (asked with probe: true) { host } when
// one is there — null when none is open
export async function paperPdf(body) {
  const r = await call('/paper/pdf', { method: 'POST', body, raw: true });
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('pdf')) return { blob: await r.blob(), host: r.headers.get('x-pdf-source') || '' };   // (a server from before the probe sends it whole)
  const d = await r.json().catch(() => null);
  return d && d.found ? { host: String(d.host || '') } : null;
}
// 다듬기 도우미 (Claude, through the server, which holds the owner's Anthropic key): what the screen needs (key set?, the
// models, limits, today's count, when the style was learned), the style itself, and one request — its answer streamed
export const writeInfo = () => call('/write');
export const writeStyle = () => call('/write/style');
export const writePrinciples = () => call('/write/principles');
export const putWritePrinciples = (text) => call('/write/principles', { method: 'PUT', body: { text } });
export const writeAsk = (body, signal) => call('/write', { method: 'POST', body, raw: 'stream', signal });
// the latest answer as the server kept it (for an app that lost the connection), and 멈추기 told to the server
export const writeLast = (id) => call('/write/last?id=' + encodeURIComponent(id));
export const writeStop = (id) => call('/write/stop', { method: 'POST', body: { id } });
export const bills = (law) => call('/bills?' + new URLSearchParams({ law }));   // 국회 계류 법안 of a law (the server reads more on each call)
export const bill = (no, id) => call('/bills/one?' + new URLSearchParams({ no, id }));   // one bill: 제안이유 및 주요내용, 회의록
export const ops = (list) => call('/lib/ops', { method: 'POST', body: { ops: list } });

export const getMarks = (id) => call('/marks/' + id);
export const putMarks = (id, marks) => call('/marks/' + id, { method: 'PUT', body: { marks } });
export const marksTags = () => call('/marks').then((d) => (d && d.tags) || {});   // every paper's marks version, in one answer
export const marksHistory = (id) => call('/marks/' + id + '/history').then((d) => (d && d.list) || []);
export const restoreMarks = (id, ts) => call('/marks/' + id + '/restore', { method: 'POST', body: { ts } });
export const getState = () => call('/state');
export const sync = (q) => call('/sync?' + new URLSearchParams(q));
export const putState = (files) => call('/state', { method: 'PUT', body: { files } });
export const getPrefs = () => call('/prefs');
export const putPrefs = (hidden) => call('/prefs', { method: 'PUT', body: { hidden } });

export function fileUrl(id) { return base() + '/api/files/' + id; }

// Download a whole file (or a thumbnail / text) as a Blob, reporting progress (0..1)
export async function download(path, onProgress, signal) {
  const r = await call(path, { raw: true, signal });
  const total = Number(r.headers.get('content-length')) || 0;
  if (!r.body || !onProgress || !total) return r.blob();
  const reader = r.body.getReader();
  const chunks = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length; onProgress(Math.min(1, got / total));
  }
  return new Blob(chunks, { type: r.headers.get('content-type') || 'application/octet-stream' });
}

// Upload with progress (fetch cannot report upload progress, XMLHttpRequest can)
function xhrPut(url, blob, onProgress, contentType) {
  return new Promise((resolve, reject) => {
    const sent = token;
    if (!sent) { reject(new ApiError('auth', 401)); return; }
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('authorization', 'Bearer ' + sent);
    x.setRequestHeader('content-type', contentType);
    x.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    x.onload = () => {
      let d = null; try { d = JSON.parse(x.responseText); } catch (e) { /* ignore */ }
      if (x.status === 401) { signedOut(sent); reject(new ApiError('auth', 401)); return; }
      if (x.status >= 200 && x.status < 300) resolve(d || {}); else reject(new ApiError((d && d.error) || 'http_' + x.status, x.status));
    };
    x.onerror = () => reject(new ApiError('offline', 0));
    x.ontimeout = () => reject(new ApiError('offline', 0));
    x.send(blob);
  });
}

const PART = 50 * 1024 * 1024;
export async function uploadFile(id, blob, onProgress) {
  if (!base()) throw new ApiError('no_server', 0);
  if (blob.size <= 95 * 1024 * 1024) return xhrPut(fileUrl(id), blob, onProgress, 'application/pdf');
  // big files go up in 50 MB parts
  const { uploadId } = await call('/files/' + id + '/mpu', { method: 'POST', body: { size: blob.size } });
  const parts = [];
  try {
    for (let off = 0, n = 1; off < blob.size; off += PART, n++) {
      const part = blob.slice(off, off + PART);
      const done = off;
      const res = await xhrPut(fileUrl(id) + '/mpu/' + encodeURIComponent(uploadId) + '/' + n, part, (f) => onProgress && onProgress((done + f * part.size) / blob.size), 'application/octet-stream');
      parts.push({ partNumber: res.partNumber, etag: res.etag });
    }
    return await call('/files/' + id + '/mpu/' + encodeURIComponent(uploadId) + '/complete', { method: 'POST', body: { parts } });
  } catch (e) {
    call('/files/' + id + '/mpu/' + encodeURIComponent(uploadId), { method: 'DELETE' }).catch(() => {});
    throw e;
  }
}

export const putMeta = (id, kind, blob, type) => xhrPut(base() + '/api/meta/' + id + '/' + kind, blob, null, type);
export async function getMeta(id, kind) {
  const r = await call('/meta/' + id + '/' + kind, { raw: true });
  return r.blob();
}

/* ---------------- 8차 계약 (L5 fills the server side in): routes a server may not have yet ----------------
   Each resolves null when the server lacks the route (an older server: 404/405/501), so the app keeps its own way then;
   other trouble (offline, signed out) is thrown as from any call. */
const lacks = (e) => !!e && (e.status === 404 || e.status === 405 || e.status === 501 || e.code === 'not_found');
const orNull = (p) => p.catch((e) => { if (lacks(e)) return null; throw e; });
// every live paper's page texts in a few answers: GET /api/texts/bundle?after=<id>&limit=40. The server sends each paper's
// stored texts as they are kept (gzipped: it never unpacks them — the free plan's CPU would not do), framed:
//   {"id":"…","n":<bytes>}\n<n bytes of gzip> … and last {"next":<id>|null,"none":[…],"count":k}\n   (application/x-shelf-texts)
// — read here as it streams in, each paper unpacked and handed on at once: onItem({ id, text }) (text: the parsed JSON, what
// meta/<id>/text is). A plain NDJSON answer ({id, text} a line, the last {next}) is read too.
// → { count, done } — or null when the server has no such route, or this browser cannot unpack gzip (each paper's text is
// then read alone, as before). opts: after (go on from there), limit (≤40 a call), pages (calls at most), signal
const NL = 10;
async function gunzipBytes(bytes) {
  const head = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const s = head ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text() : new TextDecoder().decode(bytes);
  return JSON.parse(s);
}
async function readFrames(r, onItem, signal) {
  const rd = r.body.getReader();
  let buf = new Uint8Array(0), more = null, said = false, count = 0;
  const grow = (chunk) => { const b = new Uint8Array(buf.length + chunk.length); b.set(buf); b.set(chunk, buf.length); buf = b; };
  let want = null, ended = false;   // want: the frame whose bytes are awaited ({ id, n })
  for (;;) {
    // take every whole frame in what has come
    for (;;) {
      // (stopped: nothing more is handed on, not even what has already come — a caller that stopped wants no late papers)
      if (signal && signal.aborted) { try { await rd.cancel(); } catch (e) { /* gone */ } throw new DOMException('aborted', 'AbortError'); }
      if (want) {
        if (buf.length < want.n) break;
        const bytes = buf.subarray(0, want.n); buf = buf.subarray(want.n);
        const id = want.id; want = null;
        let text = null;
        try { text = await gunzipBytes(bytes); } catch (e) { text = null; }   // (one paper unreadable: it is read alone later)
        if (text) { count++; try { onItem && onItem({ id, text }); } catch (e) { /* the caller's own */ } }
        continue;
      }
      const nl = buf.indexOf(NL);
      if (nl < 0) break;
      const line = new TextDecoder().decode(buf.subarray(0, nl)); buf = buf.subarray(nl + 1);
      let d = null; try { d = JSON.parse(line); } catch (e) { d = null; }
      if (!d) continue;
      if (d.id && Number.isFinite(d.n) && d.n >= 0) { want = { id: String(d.id), n: d.n }; continue; }
      if ('next' in d && !('id' in d)) { more = d.next || null; said = true; }
    }
    if (ended) break;
    if (signal && signal.aborted) { try { await rd.cancel(); } catch (e) { /* gone */ } throw new DOMException('aborted', 'AbortError'); }
    const { done, value } = await rd.read();
    if (done) { ended = true; continue; }
    grow(value);
  }
  if (!said) more = r.headers.get('x-next') || null;
  return { more, count };
}
async function readLines(r, onItem, signal) {
  let more = null, said = false, count = 0;
  for (const l of (await r.text()).split('\n')) {
    if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
    if (!l.trim()) continue;
    let d; try { d = JSON.parse(l); } catch (e) { continue; }   // (a line cut short: that paper is read alone later)
    if (d && 'next' in d && !('id' in d)) { more = d.next || null; said = true; continue; }
    if (d && d.id && d.text) { count++; try { onItem && onItem(d); } catch (e) { /* the caller's own */ } }
  }
  if (!said) more = r.headers.get('x-next') || null;
  return { more, count };
}
export async function textsBundle(onItem, { after = '', limit = 40, pages = 50, signal } = {}) {
  if (typeof DecompressionStream === 'undefined' || typeof ReadableStream === 'undefined') return null;
  let count = 0, next = after;
  for (let k = 0; k < pages; k++) {
    let r;
    try { r = await call('/texts/bundle?' + new URLSearchParams({ ...(next ? { after: next } : {}), limit: String(Math.max(1, Math.min(40, limit))) }), { raw: true, signal }); }
    catch (e) { if (lacks(e) && !k) return null; throw e; }
    const framed = /x-shelf-texts/.test(r.headers.get('content-type') || '') && r.body;
    const got = framed ? await readFrames(r, onItem, signal) : await readLines(r, onItem, signal);
    count += got.count;
    if (!got.more || got.more === next) return { count, done: true };
    next = got.more;
  }
  return { count, done: false };
}
// the mirror's history of a law's file, through the server's six-hour cache: GET /api/lawgit/commits?path=&until= → the
// GitHub commits list (sha, commit.message, commit.author.date … as laws.js reads them); null when the server lacks it
export const lawGitCommits = (path, until = '') => orNull(call('/lawgit/commits?' + new URLSearchParams({ path, ...(until ? { until } : {}) }))
  .then((d) => (Array.isArray(d) ? d : d && Array.isArray(d.commits) ? d.commits : [])));
// 다듬은 기록 kept with the server (the last 20, merged by id): writeHistory() / writeHistory.get() → [{ id, act, at, input,
// out, model, … }] or null when the server lacks it; writeHistory.put(list) → the list as the server keeps it now, or null.
// An entry { id, del: true } in the list deletes that answer on every device (the server remembers it, so another device's
// older list never brings it back). Each answer is kept with its input cut to 4,000 letters (inputCut: true when cut).
// (the list is an array as before; its ids deleted on another device ride along on it, not enumerated: list.gone — a
// device drops those from its own copy, so an answer deleted elsewhere does not live on here)
const withGone = (d) => { const list = Array.isArray(d) ? d : (d && Array.isArray(d.list) ? d.list : []); Object.defineProperty(list, 'gone', { value: d && Array.isArray(d.gone) ? d.gone : [], enumerable: false }); return list; };
const histGet = () => orNull(call('/write/history').then(withGone));
// (sent in parts of < 180 KB — the server takes 200 KB a call — so twenty long answers still go up; the last answer is the list)
const histPut = (list) => orNull((async () => {
  const xs = list || [], all = [...xs.filter((x) => x && !x.del).slice(0, 20), ...xs.filter((x) => x && x.del).slice(0, 50)];
  const parts = [[]]; let size = 0;
  for (const e of all) {
    const n = new Blob([JSON.stringify(e)]).size + 1;
    if (parts[parts.length - 1].length && size + n > 180 * 1024) { parts.push([]); size = 0; }
    parts[parts.length - 1].push(e); size += n;
  }
  let d = null;
  for (const part of parts) d = await call('/write/history', { method: 'PUT', body: { list: part } });
  return withGone(d);
})());
export const writeHistory = Object.assign(() => histGet(), { get: histGet, put: histPut });
