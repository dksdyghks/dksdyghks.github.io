/* The door to 요AI: a short PIN, stored only as an iterated, salted SHA-256 digest.
   This keeps passers-by out of a static site; it is not strong security (a short PIN can be guessed offline). */
(function (G) {
  'use strict';
  const DOORS = {
    yoai: { len: 4, salt: 'yo-0128-2b81e4', n: 4000, h: 'aa950d867c05a6cf9d5a21a2f673a843e7e0b6e6e5a4615536e4b134309ed7dd' },
  };
  /* SHA-256 over UTF-8 (works without crypto.subtle, e.g. on plain http) */
  const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function sha256hex(str) {
    const bytes = new TextEncoder().encode(str);
    const l = bytes.length, nb = ((l + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(nb); m.set(bytes); m[l] = 0x80;
    const bits = l * 8; const dv = new DataView(m.buffer);
    dv.setUint32(nb - 4, bits >>> 0); dv.setUint32(nb - 8, Math.floor(bits / 4294967296));
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const W = new Uint32Array(64);
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = W[i - 15], b = W[i - 2];
        const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
        const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const mj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + mj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    return Array.from(H, (x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  function digest(name, pin) {
    const d = DOORS[name];
    let h = sha256hex(d.salt + ':' + pin);
    for (let i = 0; i < d.n; i++) h = sha256hex(h + d.salt);
    return h;
  }
  const KEY = (name) => 'door:' + name;
  const store = (kind) => { try { return kind === 'local' ? G.localStorage : G.sessionStorage; } catch (e) { return null; } };
  const Door = {
    sha256hex,
    digest,
    len: (name) => DOORS[name].len,
    check: (name, pin) => digest(name, String(pin)) === DOORS[name].h,
    isOpen(name) {
      const d = DOORS[name];
      for (const kind of ['session', 'local']) {
        const s = store(kind); if (!s) continue;
        try {
          const v = s.getItem(KEY(name)); if (!v) continue;
          if (kind === 'local') { const o = JSON.parse(v); if (o && o.h === d.h && o.until > Date.now()) return true; s.removeItem(KEY(name)); }
          else if (v === d.h) return true;
        } catch (e) { /* storage unavailable */ }
      }
      return false;
    },
    open(name, remember) {
      const d = DOORS[name];
      try { const s = store('session'); s && s.setItem(KEY(name), d.h); } catch (e) { /* ignore */ }
      if (remember) { try { const s = store('local'); s && s.setItem(KEY(name), JSON.stringify({ h: d.h, until: Date.now() + 30 * 86400000 })); } catch (e) { /* ignore */ } }
    },
    close(name) { for (const kind of ['session', 'local']) { try { const s = store(kind); s && s.removeItem(KEY(name)); } catch (e) { /* ignore */ } } },
  };
  G.Door = Door;
  if (typeof module !== 'undefined') module.exports = Door;
})(typeof window !== 'undefined' ? window : globalThis);
