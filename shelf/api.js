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

export class ApiError extends Error {
  constructor(code, status, extra = {}) { super(code); this.code = code; this.status = status; Object.assign(this, extra); }
}
export const isOffline = (e) => e && e.code === 'offline';

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
    throw new ApiError('offline', 0);
  }
  if (r.status === 401 && path !== '/login') { await signedOut(sent); throw new ApiError('auth', 401); }
  if (raw) { if (!r.ok) throw new ApiError('http_' + r.status, r.status); return r; }
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
export const scienceon = (op, params) => call('/scienceon/' + op + '?' + new URLSearchParams(params));   // KISTI ScienceON 논문 (search: q, field, page; view: cn)
export const foreignText = (id) => call('/foreign/' + encodeURIComponent(id), { raw: true }).then((r) => r.text());   // 비교법 원문 (일본·미국·캐나다), as the source gives it
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
