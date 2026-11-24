// A stand-in for Cloudflare's runtime, for testing worker.js on this machine: an R2 bucket kept in a folder,
// and a plain HTTP server that hands each request to the worker. Not deployed anywhere.
//   node mock.mjs <port> <data-dir> <allowed-origins> <pepper> <pin-hash>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import worker from './worker.js';

export class MockR2 {
  constructor(dir) { this.dir = dir; fs.mkdirSync(dir, { recursive: true }); this.mpu = new Map(); }
  #file(key) { return path.join(this.dir, encodeURIComponent(key)); }
  #meta(key) { return this.#file(key) + '.meta.json'; }
  #obj(key, size, m) {
    return { key, size, etag: m.etag, httpEtag: '"' + m.etag + '"', uploaded: new Date(m.uploaded), httpMetadata: m.httpMetadata || {}, customMetadata: m.customMetadata || {},
      writeHttpMetadata(h) { if (m.httpMetadata?.contentType) h.set('content-type', m.httpMetadata.contentType); } };
  }
  async head(key) {
    if (!fs.existsSync(this.#file(key))) return null;
    const m = JSON.parse(fs.readFileSync(this.#meta(key), 'utf8'));
    return this.#obj(key, fs.statSync(this.#file(key)).size, m);
  }
  async get(key, opts = {}) {
    const h = await this.head(key);
    if (!h) return null;
    let buf = fs.readFileSync(this.#file(key));
    let range;
    if (opts.range) {
      const r = opts.range;
      const off = 'suffix' in r ? Math.max(0, buf.length - r.suffix) : (r.offset || 0);
      const len = 'length' in r ? r.length : buf.length - off;
      buf = buf.subarray(off, off + len); range = { offset: off, length: buf.length };
    }
    const bytes = new Uint8Array(buf);
    return { ...h, range, body: new Blob([bytes]).stream(), bodyUsed: false,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      text: async () => new TextDecoder().decode(bytes), json: async () => JSON.parse(new TextDecoder().decode(bytes)), blob: async () => new Blob([bytes]) };
  }
  async #bytes(value) {
    if (value == null) return new Uint8Array(0);
    if (typeof value === 'string') return new TextEncoder().encode(value);
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
    if (typeof value.getReader === 'function') return new Uint8Array(await new Response(value).arrayBuffer());
    throw new Error('mock: unsupported body');
  }
  async put(key, value, opts = {}) {
    if (opts.onlyIf && opts.onlyIf.etagMatches) {
      const h = await this.head(key);
      if (!h || h.etag !== String(opts.onlyIf.etagMatches).replace(/"/g, '')) { if (value && value.cancel) await value.cancel(); return null; }
    }
    const bytes = await this.#bytes(value);
    const m = { etag: crypto.createHash('md5').update(bytes).digest('hex'), uploaded: Date.now(), httpMetadata: opts.httpMetadata, customMetadata: opts.customMetadata };
    fs.writeFileSync(this.#file(key), bytes); fs.writeFileSync(this.#meta(key), JSON.stringify(m));
    return this.#obj(key, bytes.length, m);
  }
  async delete(keys) {
    for (const k of [].concat(keys)) { for (const f of [this.#file(k), this.#meta(k)]) if (fs.existsSync(f)) fs.unlinkSync(f); }
  }
  async list({ prefix = '', cursor, limit = 1000 } = {}) {
    const keys = fs.readdirSync(this.dir).filter((f) => !f.endsWith('.meta.json')).map(decodeURIComponent).filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const page = keys.slice(start, start + limit);
    const objects = [];
    for (const k of page) objects.push(await this.head(k));
    const truncated = start + limit < keys.length;
    return { objects, truncated, cursor: truncated ? String(start + limit) : undefined, delimitedPrefixes: [] };
  }
  #upload(key, uploadId) {
    const self = this;
    return {
      key, uploadId,
      async uploadPart(n, body) {
        const parts = self.mpu.get(uploadId); if (!parts) throw new Error('no such upload');
        const bytes = await self.#bytes(body);
        const etag = crypto.createHash('md5').update(bytes).digest('hex');
        parts.set(n, { bytes, etag });
        return { partNumber: n, etag };
      },
      async complete(list) {
        const parts = self.mpu.get(uploadId); if (!parts) throw new Error('no such upload');
        const chunks = [];
        for (const { partNumber, etag } of [...list].sort((a, b) => a.partNumber - b.partNumber)) {
          const p = parts.get(partNumber); if (!p || p.etag !== etag) throw new Error('bad part ' + partNumber);
          chunks.push(p.bytes);
        }
        self.mpu.delete(uploadId);
        return self.put(key, Buffer.concat(chunks.map((c) => Buffer.from(c))));
      },
      async abort() { self.mpu.delete(uploadId); },
    };
  }
  async createMultipartUpload(key) { const id = crypto.randomUUID(); this.mpu.set(id, new Map()); return this.#upload(key, id); }
  resumeMultipartUpload(key, uploadId) { return this.#upload(key, uploadId); }
}

export function serve(port, env) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = 'http://' + req.headers.host + req.url;
      const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      const request = new Request(url, { method: req.method, headers: req.headers, body: hasBody ? Readable.toWeb(req) : undefined, duplex: 'half' });
      const pending = [];
      const r = await worker.fetch(request, env, { waitUntil: (p) => pending.push(p) });
      // like Cloudflare, read away a body the worker did not want (an early refusal), so the connection stays usable
      if (hasBody && !request.bodyUsed) { try { await request.arrayBuffer(); } catch (e) { /* already gone */ } }
      const headers = {}; r.headers.forEach((v, k) => { headers[k] = v; });
      res.writeHead(r.status, headers);
      if (r.body && req.method !== 'HEAD') { for await (const chunk of r.body) res.write(chunk); }
      res.end();
      await Promise.allSettled(pending);
    } catch (e) { console.error(e); try { res.writeHead(500); res.end('mock error'); } catch {} }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

if (process.argv[1] && process.argv[1].endsWith('mock.mjs')) {
  const [port, dir, origins, pepper, pinHash] = process.argv.slice(2);
  const env = { BUCKET: new MockR2(dir), ALLOWED_ORIGINS: origins, PEPPER: pepper, PIN_HASH: pinHash };
  serve(Number(port), env).then(() => console.log('mock 서재 server on', port));
}
