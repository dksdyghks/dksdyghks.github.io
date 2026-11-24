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
//   marks/<id>.json                highlights and underlines
//   state.json                     where each file was last being read (newest wins)
//   auth/devices/<sha256(token)>   one small record per signed-in device
//   auth/fails.json                failed sign-in counter

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
      case 'logout': if (m === 'POST') { await env.BUCKET.delete(dev.key); forget(dev.key); return json({ ok: true }); } break;
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
        if (!ID.test(p[2] || '') || !['thumb', 'text'].includes(p[3])) return err('bad_id', 400);
        if (m === 'GET') return await getMeta(env, p[2], p[3]);
        if (m === 'PUT') return await putMeta(req, env, p[2], p[3]);
        break;
      case 'marks':
        if (!ID.test(p[2] || '')) return err('bad_id', 400);
        if (m === 'GET') return await getMarks(env, p[2]);
        if (m === 'PUT') return await putMarks(req, env, p[2]);
        break;
      case 'sync':
        if (m === 'GET') return await pull(env, url);
        break;
      case 'state':
        if (m === 'GET') return await getState(env);
        if (m === 'PUT') return await putState(req, env);
        break;
    }
  } catch (e) {
    if (e && e.status) return err(e.message.replace(/\s+/g, '_'), e.status);
    throw e;
  }
  return err('not_found', 404);
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

const devCache = new Map();   // token hash -> { rec, at } (per isolate, short-lived)
function forget(key) { devCache.delete(key); }

async function authenticate(req, env, ctx) {
  const h = req.headers.get('authorization') || '';
  const t = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(t)) return null;
  const key = 'auth/devices/' + (await sha256hex(t));
  const now = Date.now();
  const c = devCache.get(key);
  if (c && now - c.at < 60e3) return c.rec;
  const o = await env.BUCKET.get(key);
  if (!o) { devCache.delete(key); return null; }
  const rec = { ...(await o.json()), key };
  devCache.set(key, { rec, at: now });
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
  for (const o of l.objects) { await env.BUCKET.delete(o.key); forget(o.key); }
  return json({ ok: true, self: me.key.startsWith('auth/devices/' + id) });
}

/* ---------------- library index ---------------- */

const emptyIndex = () => ({ v: 1, rev: 0, updated: 0, folders: [], files: [] });

async function loadIndex(env) {
  const o = await env.BUCKET.get('lib/index.json');
  if (!o) return { idx: emptyIndex(), etag: null };
  return { idx: await o.json(), etag: o.etag };
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
        for (const k of ['pages']) if (k in s) f[k] = Math.max(0, Number(s[k]) || 0);
        for (const k of ['thumb', 'text']) if (k in s) f[k] = !!s[k];
        if ('pending' in s && !s.pending) delete f.pending;
        if ('stars' in s) { const v = Math.round(Number(s.stars)); f.stars = (v >= 1 && v <= 3) || v === -1 || v === -2 ? v : 0; f.rated = f.stars ? now : null; }   // after reading: 1–3 stars, -2 = △ (unclear; skim once more), -1 = ✕ (no need to come back); 0 clears
        f.modified = now;
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
    const { idx, etag } = await loadIndex(env);
    const now = Date.now();
    const { purge, results } = apply(idx, ops, dev, now);
    idx.rev = (idx.rev || 0) + 1; idx.updated = now;
    const put = await env.BUCKET.put('lib/index.json', JSON.stringify(idx), {
      httpMetadata: { contentType: 'application/json' },
      onlyIf: etag ? { etagMatches: etag } : undefined,
    });
    if (put === null) { await new Promise((r) => setTimeout(r, 40 + Math.random() * 120)); continue; }   // someone wrote first: redo on the new copy
    if (purge.length) {
      // a purged id might still be in use by another entry only if the same PDF was re-added meanwhile; keep those
      const live = new Set(idx.files.map((f) => f.id));
      const keys = [];
      for (const id of purge) if (!live.has(id)) keys.push('files/' + id + '.pdf', 'meta/' + id + '/thumb.jpg', 'meta/' + id + '/text.json.gz', 'marks/' + id + '.json');
      if (keys.length) { const w = deleteMany(env, keys); if (ctx && ctx.waitUntil) ctx.waitUntil(w); else await w; }
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

const META = { thumb: { key: 'thumb.jpg', type: 'image/jpeg' }, text: { key: 'text.json.gz', type: 'application/gzip' } };

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
  if (!o) return json({ rev: 0, marks: [] });
  return json(await o.json());
}

async function putMarks(req, env, id) {
  const body = await readJSON(req);
  const incoming = (Array.isArray(body.marks) ? body.marks : []).slice(0, 20000).map(cleanMark).filter(Boolean);
  for (let attempt = 0; attempt < 8; attempt++) {
    const o = await env.BUCKET.get('marks/' + id + '.json');
    const cur = o ? await o.json() : { rev: 0, marks: [] };
    const byId = new Map(cur.marks.map((x) => [x.id, x]));
    for (const x of incoming) { const old = byId.get(x.id); if (!old || x.t >= old.t) byId.set(x.id, x); }
    const keepDeleted = Date.now() - 120 * 86400e3;   // forget deletions after four months
    const marks = [...byId.values()].filter((x) => !x.del || x.t > keepDeleted).sort((a, b) => (a.p - b.p) || ((a.rects?.[0]?.[1] ?? 0) - (b.rects?.[0]?.[1] ?? 0)));
    const next = { rev: (cur.rev || 0) + 1, updated: Date.now(), marks };
    const put = await env.BUCKET.put('marks/' + id + '.json', JSON.stringify(next), {
      httpMetadata: { contentType: 'application/json' }, onlyIf: o ? { etagMatches: o.etag } : undefined,
    });
    if (put === null) { await new Promise((r) => setTimeout(r, 30 + Math.random() * 90)); continue; }
    return json(next);
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
