/* 한글(.hwpx) 문서 쓰기. 한컴이 만든 빈 문서 골격(hwpx-skeleton.hwpx) 위에 문단과 진짜 각주를 얹는다.
   각주는 한컴이 저장하는 모양 그대로(본문 문단의 ctrl › footNote › subList › 각주 스타일 문단 + autoNum)로 쓴다.
   buildHwpx(skeletonBytes, { title, author, blocks }) → Uint8Array
   blocks: [{ t: 'title'|'subtitle'|'h1'|'h2'|'h3'|'p'|'quote'|'small', text, notes? }]
     text 안의 〔n:k〕 자리에 notes[k]가 각주로 들어간다. 표시가 없으면 notes는 문단 끝에 차례로 붙는다. */
import { readZip, writeZip } from './zip.js?v=585c905fca';

const X = (s) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// the extra character and paragraph shapes YO아이 adds to the skeleton's header (ids follow the skeleton's own 0–6 and 0–19)
const CH = { body: 0, note: 3, bold: 7, title: 8, head: 9, small: 2 };
const PA = { body: 0, note: 10, center: 20, quote: 21, head: 22, title: 23 };
function addHeaderShapes(h) {
  const c0 = h.match(/<hh:charPr id="0"[\s\S]*?<\/hh:charPr>/)[0];
  const bold = (id, height) => c0.replace('id="0"', `id="${id}"`).replace('height="1000"', `height="${height}"`).replace('<hh:underline', '<hh:bold/><hh:underline');
  h = h.replace('</hh:charProperties>', bold(CH.bold, 1000) + bold(CH.title, 1500) + bold(CH.head, 1100) + '</hh:charProperties>')
    .replace(/<hh:charProperties itemCnt="(\d+)"/, (_, n) => `<hh:charProperties itemCnt="${+n + 3}"`);
  const p0 = h.match(/<hh:paraPr id="0"[\s\S]*?<\/hh:paraPr>/)[0];
  const center = p0.replace('id="0"', `id="${PA.center}"`).replace('horizontal="JUSTIFY"', 'horizontal="CENTER"');
  const quote = p0.replace('id="0"', `id="${PA.quote}"`).replace(/<hc:left value="0"/g, '<hc:left value="2400"').replace(/<hc:right value="0"/g, '<hc:right value="2400"').replace(/<hc:prev value="0"/g, '<hc:prev value="600"').replace(/<hc:next value="0"/g, '<hc:next value="600"').replace(/value="160" unit="HWPUNIT"\/>/g, 'value="150" unit="HWPUNIT"/>');
  const head = p0.replace('id="0"', `id="${PA.head}"`).replace('keepWithNext="0"', 'keepWithNext="1"').replace(/<hc:prev value="0"/g, '<hc:prev value="1600"').replace(/<hc:next value="0"/g, '<hc:next value="600"').replace('horizontal="JUSTIFY"', 'horizontal="LEFT"');
  const title = center.replace(`id="${PA.center}"`, `id="${PA.title}"`).replace(/<hc:next value="0"/g, '<hc:next value="1200"');
  return h.replace('</hh:paraProperties>', center + quote + head + title + '</hh:paraProperties>')
    .replace(/<hh:paraProperties itemCnt="(\d+)"/, (_, n) => `<hh:paraProperties itemCnt="${+n + 4}"`);
}
let pid = 1000, inst = 1;
const noteXml = (k, text) => `<hp:ctrl><hp:footNote number="${k}" suffixChar="41" instId="${(Date.now() % 1e8) * 10 + inst++}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0"><hp:p id="0" paraPrIDRef="${PA.note}" styleIDRef="15" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${CH.note}"><hp:ctrl><hp:autoNum num="${k}" numType="FOOTNOTE"><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/></hp:autoNum></hp:ctrl><hp:t> ${X(text)}</hp:t></hp:run></hp:p></hp:subList></hp:footNote></hp:ctrl>`;
const tXml = (s) => (s ? `<hp:t>${X(s)}</hp:t>` : '');
const SHAPE = { title: [PA.title, CH.title], subtitle: [PA.center, CH.body], h1: [PA.head, CH.head], h2: [PA.head, CH.bold], h3: [PA.head, CH.bold], p: [PA.body, CH.body], quote: [PA.quote, CH.small], small: [PA.body, CH.small] };
export function sectionBody(blocks, counter) {
  let out = '';
  for (const b of blocks) {
    const [pp, cp] = SHAPE[b.t] || SHAPE.p;
    const lines = String(b.text || '').split('\n');
    lines.forEach((line, li) => {
      const notes = b.notes || []; let inner = '';
      const parts = line.split(/〔n:(\d+)〕/);
      for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 0) inner += tXml(parts[i]);
        else { const k = +parts[i]; if (notes[k] != null) inner += noteXml(++counter.n, notes[k]); }
      }
      if (li === lines.length - 1 && !/〔n:\d+〕/.test(b.text)) notes.forEach((n) => { inner += noteXml(++counter.n, n); });
      out += `<hp:p id="${pid++}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp}">${inner || '<hp:t/>'}</hp:run></hp:p>`;
    });
  }
  return out;
}
export async function buildHwpx(skeleton, doc) {
  const z = await readZip(skeleton), dec = new TextDecoder();
  const get = (k) => dec.decode(z.get(k));
  const header = addHeaderShapes(get('Contents/header.xml'));
  let sec = get('Contents/section0.xml');
  // the skeleton's only paragraph carries the page set-up (secPr); it becomes the first line of the document
  const first = sec.match(/<hp:p [\s\S]*?<\/hp:p>/)[0];
  const blocks = doc.blocks || [];
  const head = blocks.length && blocks[0].t === 'title' ? blocks.shift() : null;
  const counter = { n: 0 };
  const firstNew = first.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/, '')
    .replace(/<hp:run charPrIDRef="0"><hp:t\/><\/hp:run>/, head ? `<hp:run charPrIDRef="${CH.title}">${tXml(head.text)}</hp:run>` : '<hp:run charPrIDRef="0"><hp:t/></hp:run>')
    .replace(/paraPrIDRef="0"/, `paraPrIDRef="${head ? PA.title : PA.body}"`);
  sec = sec.replace(first, firstNew + sectionBody(blocks, counter));
  const now = new Date(), iso = now.toISOString().replace(/\.\d+Z$/, 'Z');
  const hpf = get('Contents/content.hpf').replace(/<opf:title\/>|<opf:title>[\s\S]*?<\/opf:title>/, `<opf:title>${X(doc.title || '')}</opf:title>`)
    .replace(/(<opf:meta name="creator" content="text">)[^<]*/, `$1${X(doc.author || 'YO아이')}`).replace(/(<opf:meta name="lastsaveby" content="text">)[^<]*/, `$1${X(doc.author || 'YO아이')}`)
    .replace(/(<opf:meta name="CreatedDate" content="text">)[^<]*/, `$1${iso}`).replace(/(<opf:meta name="ModifiedDate" content="text">)[^<]*/, `$1${iso}`)
    .replace(/(<opf:meta name="date" content="text">)[^<]*/, `$1${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`);
  const preview = [head ? head.text : '', ...blocks.map((b) => String(b.text || '').replace(/〔n:\d+〕/g, ''))].join('\r\n').slice(0, 1000);
  const order = ['mimetype', 'version.xml', 'Contents/header.xml', 'Contents/section0.xml', 'Preview/PrvText.txt', 'settings.xml', 'Preview/PrvImage.png', 'META-INF/container.rdf', 'Contents/content.hpf', 'META-INF/container.xml', 'META-INF/manifest.xml'];
  const files = { 'Contents/header.xml': header, 'Contents/section0.xml': sec, 'Contents/content.hpf': hpf, 'Preview/PrvText.txt': preview };
  const names = [...order.filter((k) => z.has(k)), ...[...z.keys()].filter((k) => !order.includes(k))];
  return writeZip(names.map((k) => ({ name: k, data: files[k] != null ? files[k] : z.get(k), store: k === 'mimetype' || k.endsWith('.png') })));
}
export const HWPX_MIME = 'application/hwp+zip';
