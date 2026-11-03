/* ZIP reading and writing for .hwpx (and .docx) files — no library, the browser's own deflate.
   readZip(bytes) → Map(name → Uint8Array); writeZip([{ name, data, store }]) → Uint8Array. */
const enc = new TextEncoder();
let CRC_T = null;
export function crc32(b) {
  if (!CRC_T) { CRC_T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
async function pipe(bytes, stream) {
  const s = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(s).arrayBuffer());
}
/* 한글 files pad a compressed stream after its end. Browsers stop with an error there and may hold back the last part,
   so when that happens the stream is inflated again here, exactly, stopping at the final block (RFC 1951). */
export async function inflateRaw(b) {
  const reader = new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const parts = []; let n = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); n += value.length; } }
  catch (e) { return inflateExact(b instanceof Uint8Array ? b : new Uint8Array(b)); }
  const out = new Uint8Array(n); let at = 0; for (const x of parts) { out.set(x, at); at += x.length; }
  return out;
}
const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
function huff(lengths) {
  const counts = new Uint16Array(16), offs = new Uint16Array(16), symbols = new Uint16Array(lengths.length);
  for (const l of lengths) counts[l]++;
  counts[0] = 0; for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
  for (let i = 0; i < lengths.length; i++) if (lengths[i]) symbols[offs[lengths[i]]++] = i;
  return { counts, symbols };
}
let FIXED = null;
export function inflateExact(src) {
  let pos = 0, bitbuf = 0, bitcnt = 0, op = 0, out = new Uint8Array(Math.max(4096, src.length * 4));
  const room = (k) => { if (op + k <= out.length) return; let len = out.length * 2; while (len < op + k) len *= 2; const o = new Uint8Array(len); o.set(out.subarray(0, op)); out = o; };
  const bits = (k) => { while (bitcnt < k) { if (pos >= src.length) throw new Error('압축된 내용이 중간에 끊겼습니다'); bitbuf |= src[pos++] << bitcnt; bitcnt += 8; } const v = bitbuf & ((1 << k) - 1); bitbuf >>>= k; bitcnt -= k; return v; };
  const decode = (t) => { let code = 0, first = 0, index = 0; for (let len = 1; len < 16; len++) { code |= bits(1); const c = t.counts[len]; if (code - c < first) return t.symbols[index + (code - first)]; index += c; first += c; first <<= 1; code <<= 1; } throw new Error('압축된 내용이 손상되었습니다'); };
  let final = 0;
  do {
    final = bits(1); const type = bits(2);
    if (type === 0) {
      bitbuf = 0; bitcnt = 0;
      if (pos + 4 > src.length) throw new Error('압축된 내용이 중간에 끊겼습니다');
      const len = src[pos] | (src[pos + 1] << 8); pos += 4;
      room(len); out.set(src.subarray(pos, pos + len), op); op += len; pos += len; continue;
    }
    let lit, dist;
    if (type === 1) {
      if (!FIXED) { const l = new Uint8Array(288); l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288); FIXED = [huff(l), huff(new Uint8Array(30).fill(5))]; }
      [lit, dist] = FIXED;
    } else if (type === 2) {
      const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
      const cl = new Uint8Array(19); for (let i = 0; i < hclen; i++) cl[ORDER[i]] = bits(3);
      const ct = huff(cl), lens = new Uint8Array(hlit + hdist);
      for (let i = 0; i < hlit + hdist;) {
        const sym = decode(ct);
        if (sym < 16) lens[i++] = sym;
        else { let rep = 0, val = 0; if (sym === 16) { if (!i) throw new Error('압축된 내용이 손상되었습니다'); val = lens[i - 1]; rep = 3 + bits(2); } else if (sym === 17) rep = 3 + bits(3); else rep = 11 + bits(7); while (rep-- && i < lens.length) lens[i++] = val; }
      }
      lit = huff(lens.subarray(0, hlit)); dist = huff(lens.subarray(hlit));
    } else throw new Error('압축된 내용이 손상되었습니다');
    for (;;) {
      const sym = decode(lit);
      if (sym < 256) { room(1); out[op++] = sym; }
      else if (sym === 256) break;
      else {
        const li = sym - 257, len = LBASE[li] + bits(LEXT[li]), di = decode(dist), d = DBASE[di] + bits(DEXT[di]);
        if (d > op) throw new Error('압축된 내용이 손상되었습니다');
        room(len); for (let k = 0; k < len; k++, op++) out[op] = out[op - d];
      }
    }
  } while (!final);
  return out.subarray(0, op);
}
export const deflateRaw = (b) => pipe(b, new CompressionStream('deflate-raw'));

export async function readZip(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('압축 파일 구조가 아닙니다');
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const out = new Map(), dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('압축 파일 목차가 손상되었습니다');
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), loc = dv.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
    const lnl = dv.getUint16(loc + 26, true), lxl = dv.getUint16(loc + 28, true);
    const raw = b.subarray(loc + 30 + lnl + lxl, loc + 30 + lnl + lxl + csize);
    if (!name.endsWith('/')) out.set(name, method === 0 ? raw.slice() : method === 8 ? await inflateRaw(raw) : null);
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

export async function writeZip(entries) {
  const parts = [], central = []; let off = 0;
  const now = new Date(), dosT = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), dosD = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const e of entries) {
    const name = enc.encode(e.name), data = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    const crc = crc32(data), comp = e.store ? data : await deflateRaw(data), method = e.store ? 0 : 8;
    const h = new Uint8Array(30 + name.length), dv = new DataView(h.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); dv.setUint16(8, method, true);
    dv.setUint16(10, dosT, true); dv.setUint16(12, dosD, true); dv.setUint32(14, crc, true); dv.setUint32(18, comp.length, true); dv.setUint32(22, data.length, true);
    dv.setUint16(26, name.length, true); dv.setUint16(28, 0, true); h.set(name, 30);
    parts.push(h, comp);
    const c = new Uint8Array(46 + name.length), cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, method, true);
    cv.setUint16(12, dosT, true); cv.setUint16(14, dosD, true); cv.setUint32(16, crc, true); cv.setUint32(20, comp.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, off, true); c.set(name, 46);
    central.push(c); off += h.length + comp.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, off, true);
  const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}
