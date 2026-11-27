// CPU of one /api/texts/bundle answer (E5), with storage kept in memory so only the worker's own work is timed — the free
// plan allows 10 ms of CPU an invocation. 115 papers of ~30 KB gzipped texts, the owner's shelf's size.
//   node bench-8.mjs
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import worker from './worker.js';

// (each object's etag worked out once, when it is stored — as R2 keeps it — so the timing is the worker's alone)
const tags = new WeakMap();
const store = new Map();
const etag = (b) => { let t = tags.get(b); if (!t) { t = crypto.createHash('md5').update(b).digest('hex'); tags.set(b, t); } return t; };
const realSet = store.set.bind(store);
store.set = (k, b) => { etag(b); return realSet(k, b); };
const obj = (key, b, extra = {}) => ({ key, size: b.length, etag: etag(b), httpEtag: '"' + etag(b) + '"', uploaded: new Date(), ...extra });
const bucket = {
  async get(key, o = {}) {
    const b = store.get(key); if (!b) return null;
    const s = o.range ? b.subarray(o.range.offset, o.range.offset + o.range.length) : b;
    return { ...obj(key, b), body: new Blob([s]).stream(), arrayBuffer: async () => s.buffer.slice(s.byteOffset, s.byteOffset + s.byteLength), text: async () => Buffer.from(s).toString(), json: async () => JSON.parse(Buffer.from(s).toString()) };
  },
  async head(key) { const b = store.get(key); return b ? obj(key, b) : null; },
  async put(key, v, o = {}) {
    if (o.onlyIf && o.onlyIf.etagMatches && (!store.has(key) || etag(store.get(key)) !== o.onlyIf.etagMatches)) return null;
    const b = typeof v === 'string' ? Buffer.from(v) : v instanceof Blob ? Buffer.from(await v.arrayBuffer()) : Buffer.from(v);
    store.set(key, b); return obj(key, b);
  },
  async delete(keys) { for (const k of [].concat(keys)) store.delete(k); },
  async list({ prefix = '' } = {}) { return { objects: [...store.keys()].filter((k) => k.startsWith(prefix)).sort().map((k) => obj(k, store.get(k))), truncated: false }; },
};
const PEPPER = 'p', TOKEN = 'tok-bench-0123456789abcdefghijklmnopqrstuv';
const env = { BUCKET: bucket, ALLOWED_ORIGINS: 'http://x', PEPPER, PIN_HASH: 'x' };
store.set('auth/devices/' + crypto.createHash('sha256').update(TOKEN).digest('hex'), Buffer.from(JSON.stringify({ name: 'bench', created: Date.now(), seen: Date.now() })));
const files = [];
for (let i = 0; i < 115; i++) {
  const id = crypto.createHash('sha256').update('b' + i).digest('hex').slice(0, 24);
  files.push({ id, name: i + '.pdf', folder: null, size: 1, pages: 20, text: true, trashed: null });
  const pages = Array.from({ length: 25 }, (_, p) => `쪽 ${p} ` + crypto.randomBytes(1500).toString('base64'));
  store.set(`meta/${id}/text.json.gz`, zlib.gzipSync(JSON.stringify({ v: 1, pages })));
  store.set(`meta/${id}/thumb.jpg`, Buffer.from('x'));
}
store.set('lib/index.json', Buffer.from(JSON.stringify({ v: 1, rev: 1, updated: 0, folders: [], files })));
const call = async (after) => {
  const pend = [];
  const req = new Request('http://w/api/texts/bundle?limit=40' + (after ? '&after=' + after : ''), { headers: { authorization: 'Bearer ' + TOKEN } });
  const c0 = process.cpuUsage();
  const r = await worker.fetch(req, env, { waitUntil: (p) => pend.push(p) });
  const c1 = process.cpuUsage(c0);
  const b = Buffer.from(await r.arrayBuffer());
  await Promise.all(pend);
  return { ms: (c1.user + c1.system) / 1000, bytes: b.length, next: r.headers.get('x-next'), status: r.status };
};
for (const round of ['cold', 'warm', 'warm']) {
  let after = '', out = [];
  for (;;) { const x = await call(after); out.push(x); if (!x.next) break; after = x.next; }
  console.log(round, out.map((x) => `${x.status} ${x.ms.toFixed(2)} ms CPU, ${(x.bytes / 1024).toFixed(0)} KB`).join(' | '));
}
process.exit(0);
