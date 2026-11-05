/* 한글 문서 읽기: .hwp(한글 5.0 이진 형식)와 .hwpx(개방형 XML)에서 본문 문단과 각주를 나누어 꺼낸다.
   readHangul(bytes, name) → { paras: [문단], notes: [각주 본문], text } */
import { readZip, inflateRaw } from './zip.js?v=c8c5385068';

/* ---- .hwp: OLE 복합 문서 → BodyText/Section* → (raw deflate) → 레코드 ---- */
function cfb(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint32(0, true) !== 0xE011CFD0) throw new Error('한글(.hwp) 파일 구조가 아닙니다');
  const ss = 1 << dv.getUint16(30, true), mss = 1 << dv.getUint16(32, true);
  const dirFirst = dv.getUint32(48, true), cutoff = dv.getUint32(56, true);
  const miniFatFirst = dv.getUint32(60, true), nMiniFat = dv.getUint32(64, true), difFirst = dv.getUint32(68, true), nDif = dv.getUint32(72, true);
  const sec = (i) => b.subarray((i + 1) * ss, (i + 2) * ss);
  const u32 = (a, o) => new DataView(a.buffer, a.byteOffset, a.byteLength).getUint32(o, true);
  const difat = []; for (let i = 0; i < 109; i++) difat.push(dv.getUint32(76 + i * 4, true));
  let d = difFirst; for (let k = 0; k < nDif && d < 0xFFFFFFFA; k++) { const s = sec(d); for (let i = 0; i < ss / 4 - 1; i++) difat.push(u32(s, i * 4)); d = u32(s, ss - 4); }
  const fat = []; for (const s of difat) { if (s >= 0xFFFFFFFA) continue; const x = sec(s); for (let i = 0; i < ss / 4; i++) fat.push(u32(x, i * 4)); }
  const chain = (start, next) => { const out = [], seen = new Set(); let s = start; while (s < 0xFFFFFFFA && !seen.has(s) && out.length < 1e6) { seen.add(s); out.push(s); s = next[s]; } return out; };
  const join = (arrs) => { const n = arrs.reduce((a, x) => a + x.length, 0), o = new Uint8Array(n); let p = 0; for (const x of arrs) { o.set(x, p); p += x.length; } return o; };
  const read = (start) => join(chain(start, fat).map(sec));
  const dir = read(dirFirst), ents = [], td = new TextDecoder('utf-16le');
  for (let i = 0; i + 128 <= dir.length; i += 128) {
    const e = dir.subarray(i, i + 128), ev = new DataView(e.buffer, e.byteOffset, 128), nl = ev.getUint16(64, true);
    ents.push({ name: td.decode(e.subarray(0, Math.max(0, nl - 2))), type: e[66], left: ev.getUint32(68, true), right: ev.getUint32(72, true), child: ev.getUint32(76, true), start: ev.getUint32(116, true), size: ev.getUint32(120, true) });
  }
  const root = ents[0], mini = root && root.start < 0xFFFFFFFA ? read(root.start) : new Uint8Array(0);
  const miniFat = []; if (nMiniFat) { const m = read(miniFatFirst); for (let i = 0; i + 4 <= m.length; i += 4) miniFat.push(u32(m, i)); }
  const stream = (e) => (e.size >= cutoff ? read(e.start).subarray(0, e.size) : join(chain(e.start, miniFat).map((s) => mini.subarray(s * mss, (s + 1) * mss))).subarray(0, e.size));
  const paths = new Map();
  const walk = (i, prefix, depth) => {
    if (i === 0xFFFFFFFF || i >= ents.length || depth > 64) return;
    const e = ents[i]; walk(e.left, prefix, depth + 1); walk(e.right, prefix, depth + 1);
    if (e.type === 2) paths.set(prefix + e.name, e);
    if ((e.type === 1 || e.type === 5) && e.child !== 0xFFFFFFFF) walk(e.child, e.type === 5 ? '' : `${prefix}${e.name}/`, depth + 1);
  };
  walk(0, '', 0);
  return { paths, stream };
}
const FN_ID = ('f'.charCodeAt(0) << 24 | 'n'.charCodeAt(0) << 16 | 0x20 << 8 | 0x20) >>> 0;
const EN_ID = ('e'.charCodeAt(0) << 24 | 'n'.charCodeAt(0) << 16 | 0x20 << 8 | 0x20) >>> 0;
function paraText(rec) {
  let s = '';
  const dv = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
  for (let j = 0; j + 2 <= rec.length;) {
    const c = dv.getUint16(j, true);
    if (c < 32) {
      if (c === 9) { s += '\t'; j += 16; } // tab is an inline control (8 units)
      else if ([0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31].includes(c)) { s += c === 10 ? '\n' : c === 13 ? '' : c >= 24 ? ' ' : ''; j += 2; }
      else { if (c === 17) s += '\u0011'; j += 16; } // extended/inline controls take 8 WCHARs; 17 = 각주·미주 (its place is kept)
    } else { s += String.fromCharCode(c); j += 2; }
  }
  return s;
}
export async function readHwp(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const { paths, stream } = cfb(b);
  const head = paths.get('FileHeader'); if (!head) throw new Error('한글 파일 머리 정보가 없습니다');
  const h = stream(head), flags = new DataView(h.buffer, h.byteOffset, h.byteLength).getUint32(36, true);
  if (flags & 2) throw new Error('암호가 걸린 한글 파일은 읽을 수 없습니다');
  if (flags & 4) throw new Error('배포용 한글 문서는 내용이 잠겨 있어 읽을 수 없습니다');
  const compressed = !!(flags & 1);
  const secs = [...paths.keys()].filter((p) => /^BodyText\/Section\d+$/.test(p)).sort((a, b2) => +a.slice(16) - +b2.slice(16));
  const paras = [], notes = []; let cur = null, noteLevel = -1, noteBuf = [];
  for (const p of secs) {
    let body = stream(paths.get(p)); if (compressed) body = await inflateRaw(body);
    const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
    for (let i = 0; i + 4 <= body.length;) {
      const hd = dv.getUint32(i, true); const tag = hd & 0x3FF, level = (hd >>> 10) & 0x3FF; let size = hd >>> 20; i += 4;
      if (size === 0xFFF) { size = dv.getUint32(i, true); i += 4; }
      const rec = body.subarray(i, i + size); i += size;
      if (noteLevel >= 0 && level <= noteLevel) { notes.push(noteBuf.join('\n').trim()); noteBuf = []; noteLevel = -1; }
      if (tag === 71 && rec.length >= 4) { const id = new DataView(rec.buffer, rec.byteOffset, 4).getUint32(0, true); if (id === FN_ID || id === EN_ID) { noteLevel = level; noteBuf = []; } }
      else if (tag === 66) { if (noteLevel < 0 && level === 0) { if (cur !== null) paras.push(cur); cur = ''; } }
      else if (tag === 67) { const t = paraText(rec); if (noteLevel >= 0) noteBuf.push(t.replace(/\u0011/g, '')); else if (cur === null) cur = t; else cur += (level > 0 && cur ? ' ' : '') + t; }
    }
    if (noteLevel >= 0) { notes.push(noteBuf.join('\n').trim()); noteBuf = []; noteLevel = -1; }
  }
  if (cur !== null) paras.push(cur);
  let k = 0; // each 각주 mark, in reading order, gets the number of the note read at that point
  return finish(paras.map((p) => p.replace(/\u0011/g, () => `〔주${++k}〕`)), notes);
}

/* ---- .hwpx: Contents/section*.xml ---- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unent = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] || m));
export function sectionText(xml) {
  const paras = [], notes = []; let body = '', note = '', inT = 0, noteDepth = 0, pDepth = 0;
  const re = /<(\/?)([a-zA-Z0-9]+:)?([a-zA-Z0-9]+)([^>]*?)(\/?)>|([^<]+)/g; let m;
  while ((m = re.exec(xml))) {
    if (m[6] !== undefined) { if (inT) { const t = unent(m[6]); if (noteDepth) note += t; else body += t; } continue; }
    const close = m[1] === '/', name = m[3], self = m[5] === '/';
    if (name === 'footNote' || name === 'endNote') { if (!close && !self) { noteDepth++; note = ''; if (noteDepth === 1) body += `〔주${notes.length + 1}〕`; } else if (close) { noteDepth--; if (!noteDepth) notes.push(note.trim()); } continue; }
    if (name === 't') { if (!close && !self) inT++; else if (close) inT = Math.max(0, inT - 1); continue; }
    if (name === 'tab' && inT) { if (noteDepth) note += '\t'; else body += '\t'; continue; }
    if (name === 'lineBreak' && inT) { if (noteDepth) note += '\n'; else body += '\n'; continue; }
    if (name === 'p') {
      if (noteDepth) { if (close && note && !note.endsWith('\n')) note += '\n'; continue; }
      if (!close && !self) pDepth++;
      else if (close) { pDepth--; if (pDepth === 0) { paras.push(body); body = ''; } else body += ' '; }
    }
  }
  if (body) paras.push(body);
  return { paras, notes };
}
export async function readHwpx(buf) {
  const z = await readZip(buf), dec = new TextDecoder();
  const secs = [...z.keys()].filter((k) => /^Contents\/section\d+\.xml$/.test(k)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
  if (!secs.length) throw new Error('한글(.hwpx) 본문을 찾지 못했습니다');
  const paras = [], notes = [];
  for (const k of secs) {
    const r = sectionText(dec.decode(z.get(k)));
    const base = notes.length;
    paras.push(...r.paras.map((p) => p.replace(/〔주(\d+)〕/g, (_, n) => `〔주${+n + base}〕`))); notes.push(...r.notes);
  }
  return finish(paras, notes);
}
function finish(paras, notes) {
  paras = paras.map((p) => p.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/ /g, ' '));
  notes = notes.map((n) => n.replace(/\s+/g, ' ').trim());
  return { paras, notes, text: paras.join('\n') };
}
export async function readHangul(buf, name = '') {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b[0] === 0x50 && b[1] === 0x4B) return readHwpx(b);
  if (b[0] === 0xD0 && b[1] === 0xCF) return readHwp(b);
  throw new Error(`${name || '파일'}: 한글 문서(.hwp, .hwpx) 형식이 아닙니다`);
}
