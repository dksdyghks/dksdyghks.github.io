/* YO아이 — Word(.docx) 내보내기. 마크다운을 OOXML로 바꾸고, 출처 표시 〔cN〕를 Word 각주로 단다.
   외부 라이브러리 없이 ZIP(무압축)을 직접 만든다. A4, 바탕체, 쪽 번호. */
const enc = new TextEncoder();
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const TEXT_W = 9026; // A4 11906 − 좌우 여백 1440×2 (twip)

/* ---------- zip (stored) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zip(files, when) {
  const d = when || new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
    h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true); c.setUint32(38, 0, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + data.length;
  }
  const size = central.reduce((n, x) => n + x.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
  const all = parts.concat(central, [new Uint8Array(e.buffer)]);
  const out = new Uint8Array(all.reduce((n, x) => n + x.length, 0)); let p = 0;
  for (const x of all) { out.set(x, p); p += x.length; }
  return out;
}

/* ---------- xml helpers ---------- */
const clean = (s) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
const x = (s) => clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const t = (s) => `<w:t xml:space="preserve">${x(s)}</w:t>`;
/* run properties in schema order: rStyle, rFonts, b, bCs, i, iCs, strike, color, sz, szCs, u, shd, vertAlign */
function rpr(st) {
  const o = [];
  if (st.style) o.push(`<w:rStyle w:val="${st.style}"/>`);
  if (st.code) o.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>');
  if (st.b) o.push('<w:b/><w:bCs/>');
  if (st.i) o.push('<w:i/><w:iCs/>');
  if (st.s) o.push('<w:strike/>');
  if (st.code) o.push('<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>');
  return o.length ? `<w:rPr>${o.join('')}</w:rPr>` : '';
}
function run(text, st) {
  // keep line breaks and tabs as Word elements
  const pieces = clean(text).split(/(\n|\t)/);
  let inner = '';
  for (const p of pieces) { if (p === '\n') inner += '<w:br/>'; else if (p === '\t') inner += '<w:tab/>'; else if (p) inner += t(p); }
  return inner ? `<w:r>${rpr(st || {})}${inner}</w:r>` : '';
}

/* ---------- inline markdown → runs ---------- */
const INLINE = /(\*\*|__)(?=\S)([\s\S]*?\S)\1|\*(?=[^\s*])([^*\n]*?[^\s*])\*|`([^`\n]+)`|~~(?=\S)([\s\S]*?\S)~~|\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)|<(https?:\/\/[^>\s]+)>|〔c(\d+)〕/g;
function inline(text, ctx, st) {
  st = st || {};
  let out = '', last = 0, m;
  const re = new RegExp(INLINE.source, 'g');
  while ((m = re.exec(text))) {
    if (m.index > last) out += run(text.slice(last, m.index), st);
    if (m[2] !== undefined) out += inline(m[2], ctx, { ...st, b: true });
    else if (m[3] !== undefined) out += inline(m[3], ctx, { ...st, i: true });
    else if (m[4] !== undefined) out += run(m[4], { ...st, code: true });
    else if (m[5] !== undefined) out += inline(m[5], ctx, { ...st, s: true });
    else if (m[6] !== undefined) out += link(m[6], m[7], ctx, st);
    else if (m[8] !== undefined) out += link(m[8], m[8], ctx, st);
    else if (m[9] !== undefined) out += note(+m[9], ctx);
    last = re.lastIndex;
  }
  if (last < text.length) out += run(text.slice(last), st);
  return out;
}
function link(label, url, ctx, st) {
  let id = ctx.links.get(url);
  if (!id) { id = `rIdL${ctx.links.size + 1}`; ctx.links.set(url, id); }
  const r = run(label, { ...st, style: 'Hyperlink' });
  return r ? `<w:hyperlink r:id="${id}" w:history="1">${r}</w:hyperlink>` : '';
}
function note(n, ctx) {
  const text = ctx.notes[n - 1];
  if (!text) return '';
  ctx.foot.push(text);
  return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${ctx.foot.length}"/></w:r>`;
}

/* ---------- block markdown → paragraphs ---------- */
/* paragraph properties in schema order: pStyle, keepNext, pBdr, shd, tabs, spacing, ind, jc */
function para(content, o) {
  o = o || {};
  const p = [];
  if (o.style) p.push(`<w:pStyle w:val="${o.style}"/>`);
  if (o.keepNext) p.push('<w:keepNext/>');
  if (o.ind) p.push(`<w:ind w:left="${o.ind[0]}" w:hanging="${o.ind[1]}"/>`);
  if (o.jc) p.push(`<w:jc w:val="${o.jc}"/>`);
  return `<w:p>${p.length ? `<w:pPr>${p.join('')}</w:pPr>` : ''}${content}</w:p>`;
}
const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
const LIST = /^(\s*)([-*+•]|\d{1,3}[.)])\s+(.*)$/;
function blocks(md, ctx) {
  const lines = clean(md).replace(/\r\n?/g, '\n').split('\n');
  let out = '', i = 0;
  const starts = (l) => !l.trim() || /^```/.test(l) || /^#{1,6}\s/.test(l) || /^\s*>/.test(l) || LIST.test(l) || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l) || isTableRow(l);
  while (i < lines.length) {
    const L = lines[i];
    if (!L.trim()) { i++; continue; }
    let m;
    if (/^```/.test(L)) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out += buf.map((l) => para(run(l || ' ', { code: true }), { style: 'Code' })).join('') || para('', { style: 'Code' });
      continue;
    }
    if ((m = L.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) { out += para(inline(m[2], ctx), { style: `Heading${Math.min(3, m[1].length)}`, keepNext: true }); i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(L)) { out += para('', { style: 'Rule' }); i++; continue; }
    if (isTableRow(L) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(L); i += 2; const rows = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      out += table(head, rows, ctx); continue;
    }
    if (/^\s*>/.test(L)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out += buf.join('\n').split(/\n\s*\n/).map((q) => para(inline(q.replace(/\n/g, ' '), ctx), { style: 'Quote' })).join('');
      continue;
    }
    if ((m = L.match(LIST))) {
      const lv = Math.min(3, Math.floor(m[1].replace(/\t/g, '  ').length / 2));
      const mark = /\d/.test(m[2]) ? m[2].replace(')', '.') : (lv % 2 ? '◦' : '•');
      let text = m[3]; i++;
      while (i < lines.length && lines[i].trim() && !starts(lines[i]) ) text += ' ' + lines[i++].trim();
      out += para(run(mark) + '<w:r><w:tab/></w:r>' + inline(text, ctx), { style: 'ListParagraph', ind: [400 + lv * 400, 300] });
      continue;
    }
    let text = L.trim(); i++;
    while (i < lines.length && lines[i].trim() && !starts(lines[i])) text += ' ' + lines[i++].trim();
    out += para(inline(text, ctx));
  }
  return out;
}
function table(head, rows, ctx) {
  const n = Math.max(head.length, ...rows.map((r) => r.length));
  const w = Math.floor(TEXT_W / n);
  const cell = (c, hd) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${hd ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : ''}</w:tcPr>${para(inline(c || '', ctx, hd ? { b: true } : {}), { style: 'TableText' })}</w:tc>`;
  const row = (r, hd) => `<w:tr>${hd ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${Array.from({ length: n }, (_, k) => cell(r[k], hd)).join('')}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${w * n}" w:type="dxa"/></w:tblPr><w:tblGrid>${`<w:gridCol w:w="${w}"/>`.repeat(n)}</w:tblGrid>${row(head, true)}${rows.map((r) => row(r, false)).join('')}</w:tbl>${para('', { style: 'AfterTable' })}`;
}

/* ---------- package parts ---------- */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="바탕" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-US" w:eastAsia="ko-KR" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="384" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="360"/><w:jc w:val="center"/></w:pPr><w:rPr><w:color w:val="666666"/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:jc w:val="left"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:jc w:val="left"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:jc w:val="left"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:bCs/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Question"><w:name w:val="Question"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="2F5496"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F3F6FB"/><w:spacing w:before="240" w:after="200"/><w:ind w:left="200" w:right="100"/></w:pPr><w:rPr><w:color w:val="333333"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="BFBFBF"/></w:pBdr><w:ind w:left="400" w:right="200"/></w:pPr><w:rPr><w:color w:val="404040"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:after="0" w:line="260" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="40" w:after="40" w:line="276" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr><w:rPr><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="AfterTable"><w:name w:val="After Table"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="12"/><w:szCs w:val="12"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Rule"><w:name w:val="Rule"/><w:basedOn w:val="Normal"/><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BFBFBF"/></w:pBdr><w:spacing w:after="240" w:line="120" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:pPr><w:spacing w:after="40" w:line="264" w:lineRule="auto"/><w:ind w:left="200" w:hanging="200"/></w:pPr><w:rPr><w:sz w:val="17"/><w:szCs w:val="17"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:color w:val="1F4E9D"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="39"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:left w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:right w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="808080"/></w:tblBorders></w:tblPr></w:style>
</w:styles>`;
const SETTINGS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="${W}"><w:defaultTabStop w:val="400"/><w:characterSpacingControl w:val="doNotCompress"/><w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
const FOOTER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="${W}" xmlns:r="${R}"><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
function footnotesXML(list) {
  const sep = (type, id, el) => `<w:footnote w:type="${type}" w:id="${id}"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><${el}/></w:r></w:p></w:footnote>`;
  const body = list.map((s, k) => `<w:footnote w:id="${k + 1}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>${run(' ' + s)}</w:p></w:footnote>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:footnotes xmlns:w="${W}" xmlns:r="${R}">${sep('separator', -1, 'w:separator')}${sep('continuationSeparator', 0, 'w:continuationSeparator')}${body}</w:footnotes>`;
}
const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * Build a .docx file.
 * @param {{title:string, subtitle?:string, sections:{heading?:string, question?:string, md:string, notes?:string[]}[], creator?:string, when?:Date}} spec
 *   md may contain 〔cN〕 markers; each one becomes a Word footnote whose text is notes[N-1].
 * @returns {Uint8Array}
 */
export function buildDocx(spec) {
  const when = spec.when || new Date();
  const ctx = { links: new Map(), foot: [], notes: [] };
  let body = para(run(spec.title || 'YO아이'), { style: 'Title' });
  if (spec.subtitle) body += para(run(spec.subtitle), { style: 'Subtitle' });
  for (const s of spec.sections || []) {
    ctx.notes = s.notes || [];
    if (s.heading) body += para(run(s.heading), { style: 'Heading1', keepNext: true });
    if (s.question) body += clean(s.question).split(/\n\s*\n/).map((q) => para(run(q.trim()), { style: 'Question' })).join('');
    body += blocks(s.md || '', ctx);
  }
  const sect = `<w:sectPr><w:footerReference w:type="default" r:id="rIdFt"/><w:footnotePr><w:numFmt w:val="decimal"/></w:footnotePr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1440" w:bottom="1440" w:left="1440" w:header="851" w:footer="851" w:gutter="0"/><w:cols w:space="425"/><w:docGrid w:linePitch="360"/></w:sectPr>`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}${sect}</w:body></w:document>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${PR}"><Relationship Id="rIdSt" Type="${RT}/styles" Target="styles.xml"/><Relationship Id="rIdSe" Type="${RT}/settings" Target="settings.xml"/><Relationship Id="rIdFn" Type="${RT}/footnotes" Target="footnotes.xml"/><Relationship Id="rIdFt" Type="${RT}/footer" Target="footer1.xml"/>${[...ctx.links].map(([url, id]) => `<Relationship Id="${id}" Type="${RT}/hyperlink" Target="${x(url)}" TargetMode="External"/>`).join('')}</Relationships>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  const root = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${RT}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="${PR}/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${RT}/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(spec.title || '')}</dc:title><dc:creator>${x(spec.creator || 'YO아이')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${iso(when)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso(when)}</dcterms:modified></cp:coreProperties>`;
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>YO아이</Application></Properties>`;
  return zip([
    { name: '[Content_Types].xml', data: types },
    { name: '_rels/.rels', data: root },
    { name: 'docProps/core.xml', data: core },
    { name: 'docProps/app.xml', data: app },
    { name: 'word/document.xml', data: doc },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/settings.xml', data: SETTINGS },
    { name: 'word/footnotes.xml', data: footnotesXML(ctx.foot) },
    { name: 'word/footer1.xml', data: FOOTER },
    { name: 'word/_rels/document.xml.rels', data: rels },
  ], when);
}
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
