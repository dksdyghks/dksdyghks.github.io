// 조문과 판결: 헌법 and 헌법재판소법 in full (from 헌법재판소 법령정보, 공공데이터포털); every other law, decree and rule, and
// the judgments of 대법원 and the other courts (법제처's texts, from the public mirrors legalize-kr and precedent-kr), each kept
// on this device; how a search or a paper names an article or a court's case; and the 국가법령정보센터 pages beside them.
import * as api from './api.js';
import * as store from './store.js';

const SVC = '9750000/LawInfoService/';
// the two laws whose text the court publishes; 헌법 does not change, 헌법재판소법 is asked again after a month
export const LAWS = {
  헌법: { gubun: '1147', full: '대한민국헌법', again: 365 * 864e5 },
  헌법재판소법: { gubun: '1148', full: '헌법재판소법', again: 30 * 864e5 },
};
const ALIAS = { 헌법: '헌법', 대한민국헌법: '헌법', 헌재법: '헌법재판소법', 헌법재판소법: '헌법재판소법' };
export const lawKey = (name) => ALIAS[String(name || '').replace(/\s+/g, '')] || null;

/* ---------------- what a search asks for ---------------- */
// 헌법 제37조 제2항 · 헌법 37조 2항 · 형법 제269조 제1항 · 헌재법 68조 · 국가공무원법 제66조의2
const ART_RE = /^(.+?)\s*제?\s*(\d{1,4})\s*조(?:\s*의\s*(\d{1,3}))?(?:\s*제?\s*(\d{1,3})\s*항)?(?:\s*제?\s*(\d{1,3})\s*호)?$/;
export function articleQuery(q) {
  const s = String(q || '').trim().replace(/\s+/g, ' ');
  const m = ART_RE.exec(s);
  if (!m) return null;
  const law = m[1].replace(/\s+/g, '');
  if (!/^[가-힣ㆍ·]{2,60}$/.test(law) || !/(?:법|령|규칙|법률|규정)$/.test(law)) return null;
  return { law: lawKey(law) || law, art: Number(m[2]), sub: m[3] ? Number(m[3]) : 0, para: m[4] ? Number(m[4]) : 0, item: m[5] ? Number(m[5]) : 0 };
}
// a court's case number (대법원 2000두7735, 2019다12345, 2018고단1234): 헌재's own (헌가, 헌마 …) are not these
export function courtQuery(q) {
  const m = /^(대법원|대판|[가-힣]{2,12}(?:법원|고법|지법|행법|가법)(?:\s?\(?[가-힣]{2,4}(?:지원|재판부|부)?\)?)?)?\s*((?:19|20)\d{2}|42\d{2}|\d{2})\s*([가-힣]{1,3})\s*(\d{1,7})$/.exec(String(q || '').trim().replace(/\s+/g, ' '));
  if (!m || /^헌/.test(m[3])) return null;
  return { no: m[2] + m[3] + Number(m[4]), court: courtName(m[1] || '') };
}

// the 국가법령정보센터 pages (its documented links by name), for what this app cannot show itself yet
export const lawGoKr = {
  article: (law, art, sub) => `https://www.law.go.kr/법령/${encodeURIComponent(law)}/제${art}조${sub ? '의' + sub : ''}`,
  law: (law) => `https://www.law.go.kr/법령/${encodeURIComponent(law)}`,
  case: (no) => `https://www.law.go.kr/판례/(${encodeURIComponent(no)})`,
  decision: (no) => `https://www.law.go.kr/헌재결정례/(${encodeURIComponent(no)})`,
  compare3: (law) => `https://www.law.go.kr/법령/${encodeURIComponent(law)}/삼단비교`,
  oldNew: (law) => `https://www.law.go.kr/법령/신구법비교/${encodeURIComponent(law)}`,
};

/* ---------------- the texts ---------------- */
const fail = (code) => Object.assign(new Error(code), { code });
const mem = {};
const asking = {};
export function lawText(name) {
  const key = lawKey(name) || String(name || '').replace(/\s+/g, '');
  if (mem[key]) return Promise.resolve(mem[key]);
  if (!asking[key]) asking[key] = (LAWS[key] ? load(key).catch((e) => (e && e.code === 'offline' ? Promise.reject(e) : loadAny('mirror:' + key, LAWS[key].full))) : loadAny(key, String(name).replace(/\s+/g, ' ').trim())).then((t) => (mem[key] = t)).finally(() => { delete asking[key]; });
  return asking[key];
}
async function load(key) {
  const L = LAWS[key];
  const kept = await store.get('kv', 'law:' + key).catch(() => null);
  const ok = kept && kept.v === 1 && kept.text;
  if (ok && (Date.now() - kept.at < L.again || !navigator.onLine)) return parse(key, kept);
  if (!navigator.onLine) throw fail('offline');
  try {
    const list = items(await api.publicData(SVC + 'getLawordList', { type: 'json', gubun: L.gubun, numOfRows: '50', pageNo: '1' }));
    const cur = list.filter((x) => x.boardId).sort((a, b) => String(b.revDate || '').localeCompare(String(a.revDate || '')))[0];
    if (!cur) throw fail('unavailable');
    if (ok && kept.board === String(cur.boardId)) { kept.at = Date.now(); await store.put('kv', 'law:' + key, kept).catch(() => {}); return parse(key, kept); }
    const det = items(await api.publicData(SVC + 'getLawordDetail', { type: 'json', gubun: L.gubun, boardId: String(cur.boardId), numOfRows: '1', pageNo: '1' }))[0];
    if (!det || !det.content) throw fail('unavailable');
    const rec = { v: 1, at: Date.now(), board: String(cur.boardId), title: String(det.title || cur.title || L.full).trim(), rev: String(cur.revDate || ''), text: htmlText(det.content) };
    await store.put('kv', 'law:' + key, rec).catch(() => {});
    return parse(key, rec);
  } catch (e) {
    if (ok) return parse(key, kept);   // the copy kept here, while the court's server does not answer
    throw e && e.code ? e : fail(api.isOffline(e) ? 'offline' : 'unavailable');
  }
}
function items(data) {
  const h = data && data.header;
  if (!h || !/^0+$/.test(String(h.resultCode))) throw fail('unavailable');
  const it = data.body && data.body.items && data.body.items.item;
  return it == null || it === '' ? [] : Array.isArray(it) ? it : [it];
}
export function htmlText(html) {
  const marked = String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|div|li|tr|h\d)\s*>/gi, '\n');
  const doc = new DOMParser().parseFromString(marked, 'text/html');
  return (doc.body.textContent || '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}
// articles in order, each with its chapter; the 부칙 (which numbers its own articles from 1 again) ends the body
export function parse(key, rec) {
  const arts = [], pre = [];
  let cur = null, chapter = '', inPre = false, last = 0;
  for (const L of String(rec.text).split('\n')) {
    if (/^부\s*칙/.test(L)) break;
    if (/^전\s*문$/.test(L)) { inPre = true; continue; }
    if (/^제\s*\d+\s*장\s*\S/.test(L) && L.length <= 40) { chapter = L.replace(/\s+/g, ' ').replace(/^제\s*(\d+)\s*장\s*/, '제$1장 '); cur = null; inPre = false; continue; }
    if (/^제\s*\d+\s*절\s*\S/.test(L) && L.length <= 40) { cur = null; continue; }
    const m = /^제(\d{1,4})조(?:의(\d{1,3}))?(?:\s*\(([^)]{1,40})\))?(?:\s+|(?=[①-⑳])|$)(.*)$/.exec(L);
    // a line that opens with a reference ("제68조 제1항에 따른 …") is not a new article: articles come in order
    if (m && (last === 0 ? Number(m[1]) <= 2 : Number(m[1]) >= last && Number(m[1]) <= last + 3)) {
      last = Number(m[1]);
      cur = { art: last, sub: m[2] ? Number(m[2]) : 0, title: m[3] || '', chapter, lines: m[4] ? [m[4].trim()] : [] };
      arts.push(cur); inPre = false; continue;
    }
    if (inPre) { pre.push(L); continue; }
    if (cur) cur.lines.push(L);
  }
  return { key, title: rec.title, rev: rec.rev, full: LAWS[key].full, preamble: pre.join('\n'), arts: arts.map((a) => ({ ...a, text: a.lines.join('\n') })) };
}
export const artLabel = (a) => `제${a.art}조${a.sub ? '의' + a.sub : ''}`;
export function findArt(law, art, sub = 0) { return law.arts.find((a) => a.art === art && a.sub === sub) || null; }
// the paragraph lines of an article (①, ②, …), so one can be picked out
export function paras(a) {
  const out = [];
  for (const l of String(a.text).split('\n')) { if (/^[①-⑳]/.test(l) || !out.length) out.push(l); else out[out.length - 1] += '\n' + l; }
  return out;
}

/* ---------------- every other law: 법제처's text, kept in a public mirror ----------------
   국가법령정보 (law.go.kr) answers only servers it knows by a fixed address, which ours cannot have. The same texts — every
   law, decree and rule, as 법제처 publishes them, updated daily — are kept in the open repository legalize-kr (public works,
   저작권법 제7조), one Markdown file each. An index shipped with the app (lawidx.json: folder → name and files) finds the file
   at once; a name it does not know (an abbreviation such as 정보공개법) is confirmed by 법제처's own list (공공데이터포털).
   When the newest text is not in force yet, the text in force today is taken from the repository's history, and the coming
   one is kept beside it. Kept here three days; the copy kept is used offline. */
const RAW = 'https://raw.githubusercontent.com/legalize-kr/legalize-kr/';
const HIST = 'https://api.github.com/repos/legalize-kr/legalize-kr/commits';
const PREC = 'https://raw.githubusercontent.com/legalize-kr/precedent-kr/main/';
const dirOf = (name) => String(name || '').replace(/\s+/g, '').replace(/·/g, 'ㆍ');
// the names lawyers use for laws whose own names are long (법제처's list knows these too; these are never asked for)
const ABBR = {
  민간투자법: '사회기반시설에 대한 민간투자법', 중대재해처벌법: '중대재해 처벌 등에 관한 법률', 중처법: '중대재해 처벌 등에 관한 법률',
  집시법: '집회 및 시위에 관한 법률', 국가계약법: '국가를 당사자로 하는 계약에 관한 법률', 정보공개법: '공공기관의 정보공개에 관한 법률',
  우주항공청법: '우주항공청의 설치 및 운영에 관한 특별법', 군용기운용법: '군용항공기 운용 등에 관한 법률', 정보통신망법: '정보통신망 이용촉진 및 정보보호 등에 관한 법률',
  특정범죄가중법: '특정범죄 가중처벌 등에 관한 법률', 특가법: '특정범죄 가중처벌 등에 관한 법률', 특정경제범죄법: '특정경제범죄 가중처벌 등에 관한 법률',
  성폭력처벌법: '성폭력범죄의 처벌 등에 관한 특례법', 공수처법: '고위공직자범죄수사처 설치 및 운영에 관한 법률', 청탁금지법: '부정청탁 및 금품등 수수의 금지에 관한 법률',
  공공기관운영법: '공공기관의 운영에 관한 법률', 이해충돌방지법: '공직자의 이해충돌 방지법', 테러방지법: '국민보호와 공공안전을 위한 테러방지법',
  선관위법: '선거관리위원회법', 공선법: '공직선거법', 정자법: '정치자금법', 통비법: '통신비밀보호법', 국정원법: '국가정보원법', 집회시위법: '집회 및 시위에 관한 법률',
  행소법: '행정소송법', 행심법: '행정심판법', 행절법: '행정절차법', 민소법: '민사소송법', 형소법: '형사소송법', 민집법: '민사집행법',
  근기법: '근로기준법', 산안법: '산업안전보건법', 국배법: '국가배상법', 개인정보보호법: '개인정보 보호법', 가정폭력처벌법: '가정폭력범죄의 처벌 등에 관한 특례법',
};
// known law names (·/spaces removed → canonical), so a cited article resolves to its filed law even when the name is long
// and spaced ("국가를 당사자로 하는 계약에 관한 법률 제27조") or abbreviated. Seeded here; lawIndex() adds every filed law, so
// a citation links only to a law that actually exists — an unknown or foreign name stays plain.
const NAME_NORM = (s) => String(s || '').replace(/[·ㆍ\s]/g, '');
const LAW_NAMES = new Map();   // normalized → canonical (with spaces)
export function addLawNames(ns) { for (const n of ns || []) { const k = NAME_NORM(n); if (k.length >= 2 && !LAW_NAMES.has(k)) LAW_NAMES.set(k, String(n).trim()); } }
const CORE_NAMES = ['헌법', '헌법재판소법', '공직선거법', '정당법', '정치자금법', '국회법', '정부조직법', '지방자치법', '지방재정법',
  '지방교부세법', '주민투표법', '국가재정법', '국가공무원법', '지방공무원법', '공무원연금법', '국세기본법', '국세징수법', '지방세법', '관세법',
  '형법', '형사소송법', '민법', '민사소송법', '민사집행법', '상법', '행정소송법', '행정심판법', '행정절차법', '행정기본법', '행정규제기본법',
  '질서위반행위규제법', '국가배상법', '행정대집행법', '공공기관의 정보공개에 관한 법률', '개인정보 보호법',
  '국가를 당사자로 하는 계약에 관한 법률', '지방자치단체를 당사자로 하는 계약에 관한 법률', '도시 및 주거환경정비법',
  '국토의 계획 및 이용에 관한 법률', '공익사업을 위한 토지 등의 취득 및 보상에 관한 법률', '건축법', '집회 및 시위에 관한 법률',
  '통신비밀보호법', '국가정보원법', '정보통신망 이용촉진 및 정보보호 등에 관한 법률', '감염병의 예방 및 관리에 관한 법률',
  '근로기준법', '노동조합 및 노동관계조정법', '국가보안법', '방송법', '교육기본법', '초·중등교육법', '고등교육법', '사립학교법', '병역법',
  '군사법원법', '부패방지 및 국민권익위원회의 설치와 운영에 관한 법률', '공무원의 노동조합 설립 및 운영 등에 관한 법률'];
addLawNames([...Object.values(ALIAS), ...Object.keys(ABBR), ...Object.values(ABBR), ...CORE_NAMES]);
const resolveName = (tight) => ALIAS[tight] || ABBR[tight] || LAW_NAMES.get(tight) || null;

let lawIdx = null;
export function lawIndex() {   // folder → [name, files] (files: '' for a law alone, else '법률,시행령,시행규칙' and the like)
  if (!lawIdx) lawIdx = fetch(new URL('./lawidx.json', import.meta.url)).then((r) => { if (!r.ok) throw new Error('index ' + r.status); return r.json(); })
    .then((idx) => { if (idx) { const ns = []; for (const k in idx) { const [n, f] = idx[k]; if (n) { ns.push(n); if (/시행령/.test(f || '')) ns.push(n + ' 시행령'); if (/시행규칙/.test(f || '')) ns.push(n + ' 시행규칙'); } } addLawNames(ns); } return idx; })
    .catch(() => { lawIdx = null; return null; });
  return lawIdx;
}
// names that begin with, or hold, what is being typed — for the search box: the owner's own laws first (prefer: their
// names), then an abbreviation begun, then laws before decrees before rules, a name's start before its middle, short first
export async function lawNames(typed, limit = 8, prefer = []) {
  const t = dirOf(typed);
  if (t.length < 2) return [];
  const idx = await lawIndex();
  if (!idx) return [];
  const mine = new Set(prefer.map((n) => (/^(대한민국)?헌법$/.test(dirOf(n)) ? '대한민국헌법' : dirOf(ABBR[dirOf(n)] || n))));
  const kindOf = (e) => { const fs = e[1] ? e[1].split(',') : ['법률']; return fs.includes('법률') || fs[0] === '헌법' ? '' : fs[0]; };
  const found = new Map();
  for (const [k, v] of Object.entries(ABBR)) if (k.startsWith(t)) { const d = dirOf(v); if (idx[d]) found.set(d, { name: idx[d][0] || v, dir: d, also: k, kind: kindOf(idx[d]), abbr: true, pre: true }); }
  for (const [d, e] of Object.entries(idx)) {
    if (found.has(d)) continue;
    const at = d.indexOf(t);
    if (at >= 0) found.set(d, { name: e[0] || d, dir: d, kind: kindOf(e), pre: at === 0 });
  }
  const key = (x) => [mine.has(x.dir) ? 0 : 1, x.abbr ? 0 : 1, !x.kind ? 0 : x.kind === '대통령령' ? 1 : 2, x.pre ? 0 : 1, x.name.length];
  const cmp = (a, b) => { const ka = key(a), kb = key(b); for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]; return a.name.localeCompare(b.name, 'ko'); };
  return [...found.values()].sort(cmp).slice(0, limit).map(({ name, dir, also, kind }) => ({ name, dir, also, kind }));
}
// a law's own name for what was typed (its name, or one lawyers use: 민간투자법), from the index alone — nothing is asked
export async function lawOf(q) {
  const t = dirOf(q);
  if (t.length < 2) return null;
  const idx = await lawIndex();
  if (!idx) return null;
  const m = /^(.+?)(시행령|시행규칙)$/.exec(t);
  const base = m ? m[1] : t;
  const d = idx[base] ? base : ABBR[base] && idx[dirOf(ABBR[base])] ? dirOf(ABBR[base]) : null;
  if (!d) return null;
  const files = idx[d][1] ? idx[d][1].split(',') : ['법률'];
  if (m && !files.includes(m[2])) return null;
  return { name: (idx[d][0] || d) + (m ? ' ' + m[2] : ''), dir: d };
}
export const sameLaw = (a, b) => dirOf(a) === dirOf(b);
async function officialName(asked) {   // 법제처's list: the law's name as it stands, for a name or an abbreviation
  const xml = await api.publicDataText('1170000/law/lawSearchList.do', { target: 'law', query: asked, numOfRows: '20', pageNo: '1' });
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const rows = [...doc.querySelectorAll('law')].map((l) => ({ name: (l.querySelector('법령명한글') || {}).textContent || '', short: (l.querySelector('법령약칭명') || {}).textContent || '', now: ((l.querySelector('현행연혁코드') || {}).textContent || '') === '현행' }));
  const want = norm(asked);
  const row = rows.find((r) => r.now && norm(r.name) === want) || rows.find((r) => r.now && norm(r.short) === want) || rows.find((r) => norm(r.name) === want) || null;
  return row ? row.name.trim() : null;
}
// which file of the mirror a name means: 공직선거법 → 공직선거법/법률, 공직선거관리규칙 → its 중앙선거관리위원회규칙,
// 우주개발 진흥법 시행령 → 우주개발진흥법/시행령, 헌법 → 대한민국헌법/헌법
async function resolveLaw(asked) {
  const idx = await lawIndex();
  const m = /^(.*?)\s*(시행령|시행규칙)$/.exec(String(asked).trim());
  const base = (m ? m[1] : String(asked)).trim(), part = m ? m[2] : '';
  const at = (name) => {
    const d = /^(대한민국)?헌법$/.test(dirOf(name)) ? '대한민국헌법' : dirOf(name);
    if (!idx) return { dir: d, file: part || (d === '대한민국헌법' ? '헌법' : '법률'), guess: true };   // no index at hand: as written
    const e = idx[d];
    if (!e) return null;
    const files = e[1] ? e[1].split(',') : ['법률'];
    const file = part ? (files.includes(part) ? part : null) : files.find((f) => f !== '시행령' && f !== '시행규칙') || files[0];
    return file ? { dir: d, file, files, name: part ? `${e[0] || d} ${part}` : e[0] || d } : null;
  };
  let hit = at(base) || (ABBR[dirOf(base)] && at(ABBR[dirOf(base)]));
  if (hit && !hit.guess) return hit;
  const official = await officialName(base).catch(() => null);   // an abbreviation, or a law newer than the index
  if (official) { const o = at(official); if (o && !o.guess) return o; hit = hit || o; if (!hit && idx) hit = { dir: dirOf(official), file: part || '법률', guess: true }; }
  return hit;   // a word that only ends like a law's name (관습헌법) is not asked for
}
async function mirrorFile(dir, file, ref = 'main') {
  const r = await fetch(`${RAW}${ref}/kr/${encodeURIComponent(dir)}/${encodeURIComponent(file)}.md`, ref === 'main' ? { cache: 'no-cache' } : {});
  if (r.status === 404) return null;
  if (!r.ok) throw fail('unavailable');
  return r.text();
}
const front = (md) => {   // the YAML head of a mirror file: its plain fields
  const m = /^---\n([\s\S]*?)\n---\n/.exec(md);
  const out = {};
  if (m) for (const l of m[1].split('\n')) { const k = /^([^\s:][^:]*):\s*'?(.*?)'?\s*$/.exec(l); if (k && k[2]) out[k[1]] = k[2]; }
  return { head: out, body: m ? md.slice(m[0].length) : md };
};
const mdLine = (l) => l.replace(/\*\*([①-⑳])\*\*\s*/g, '$1 ').replace(/\\([.\-*_#()[\]])/g, '$1').replace(/\*\*(.+?)\*\*/g, '$1').trim();
export function mirrorArts(md) {
  const { head, body } = front(md);
  const arts = [];
  let chapter = '', cur = null;
  for (const raw of body.split('\n')) {
    const l = raw.trimEnd();
    if (/^#{1,3}\s*부\s*칙/.test(l)) break;                                                       // the 부칙 number their own articles again
    const ch = /^#{2,3}\s+(제\s*\d+\s*[편장]\S*\s+.+)$/.exec(l); if (ch) { chapter = ch[1].replace(/\s+/g, ' ').trim(); cur = null; continue; }
    if (/^#{3,4}\s+제\s*\d+\s*[절관]/.test(l)) { cur = null; continue; }
    const a = /^#{4,6}\s+제(\d{1,4})조(?:의(\d{1,3}))?\s*(?:\(([^)]*)\))?\s*$/.exec(l);
    if (a) { cur = { art: Number(a[1]), sub: a[2] ? Number(a[2]) : 0, title: (a[3] || '').trim(), chapter, lines: [] }; arts.push(cur); continue; }
    if (/^#/.test(l)) { cur = null; continue; }
    if (cur && l.trim()) cur.lines.push(mdLine(l));
  }
  return { name: head['제목'] || '', rev: String(head['시행일자'] || '').replace(/-/g, ''), promulgated: head['공포일자'] || '', mst: head['법령MST'] || '', arts: arts.map((x) => ({ art: x.art, sub: x.sub, title: x.title, chapter: x.chapter, text: x.lines.join('\n') })) };
}
// today in Korea, as 20261125
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
// the text in force today, when the newest is not yet: the versions before it in the repository's history, newest first.
// Every version passed on the way that is not in force either is a coming amendment too: all of them come back, by date
async function inForce(dir, file, now, head) {
  const r = await fetch(`${HIST}?path=${encodeURIComponent(`kr/${dir}/${file}.md`)}&per_page=8`, { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) return null;
  const list = await r.json().catch(() => null);
  if (!Array.isArray(list)) return null;
  const coming = [head];
  for (const c of list.slice(1, 6)) {
    if (!c || !/^[0-9a-f]{40}$/.test(c.sha || '')) continue;
    const md = await mirrorFile(dir, file, c.sha).catch(() => null);
    if (!md) continue;
    const got = mirrorArts(md);
    if (!got.arts.length || !got.rev) continue;
    if (got.rev <= now) return { cur: got, coming: coming.sort((a, b) => a.rev.localeCompare(b.rev)) };
    if (!coming.some((x) => x.rev === got.rev)) coming.push(got);
  }
  return null;
}
const lawView = (key, k) => ({ key, title: `${k.full}${k.rev ? ` (${ymd(k.rev)} 시행)` : ''}`, rev: k.rev, full: k.full, preamble: '', arts: k.arts, src: k.src, next: k.next || null, later: k.later || [], ahead: !!k.ahead, files: k.files || null, dir: k.dir || '' });
async function loadAny(key, asked) {
  const kept = await store.get('kv', 'law:' + key).catch(() => null);
  const ok = kept && kept.v === 4 && kept.arts;
  const now = today();
  const fresh = ok && Date.now() - kept.at < (kept.ahead ? 3600e3 : 3 * 864e5) && !(kept.next && kept.next.rev <= now) && !(kept.ahead && kept.rev <= now);
  if (ok && (fresh || !navigator.onLine)) return lawView(key, kept);
  if (!navigator.onLine) throw fail('offline');
  try {
    const hit = await resolveLaw(asked);
    const md = hit ? await mirrorFile(hit.dir, hit.file) : null;
    if (!md) { if (drfReady()) return await loadDrf(key, asked); throw fail('nolaw'); }
    const got = mirrorArts(md);
    if (!got.arts.length) throw fail('unavailable');
    let rec = { v: 4, at: Date.now(), full: got.name || hit.name || asked, rev: got.rev, mst: got.mst, arts: got.arts, dir: hit.dir, file: hit.file, files: hit.files || null, src: 'legalize-kr' };
    if (got.rev && got.rev > now) {   // the newest text is not in force yet: today's text first, the nearest coming one beside it
      if (ok && kept.mst === got.mst && kept.next) rec = { ...rec, full: kept.full, rev: kept.rev, arts: kept.arts, next: kept.next, later: kept.later || [] };
      else {
        const found = await inForce(hit.dir, hit.file, now, got).catch(() => null);
        if (found) {
          const [near, ...rest] = found.coming;
          rec = { ...rec, full: found.cur.name || rec.full, rev: found.cur.rev, arts: found.cur.arts, next: { rev: near.rev, promulgated: near.promulgated, arts: near.arts }, later: rest.map((x) => x.rev) };
        } else rec.ahead = true;   // shown as it will read, and marked so
      }
    }
    await store.put('kv', 'law:' + key, rec).catch(() => {});
    return lawView(key, rec);
  } catch (e) {
    if (ok) return lawView(key, kept);
    throw e && e.code ? e : fail('unavailable');
  }
}
// what a coming amendment does to one article: null when nothing is coming or the article stays as it is
const flat = (t) => String(t || '').replace(/\s+/g, '');
export function pendingArt(law, a) {
  if (!law || !law.next || !a) return null;
  const n = law.next.arts.find((x) => x.art === a.art && x.sub === a.sub) || null;
  if (n && flat(n.text) === flat(a.text) && n.title === a.title) return null;
  return { date: ymd(law.next.rev), art: n };
}
// every article the coming amendment changes, adds or takes out, in the law's order
export function pendingArts(law) {
  if (!law || !law.next) return [];
  const old = new Map(law.arts.map((a) => [a.art * 1000 + a.sub, a]));
  const out = [];
  for (const n of law.next.arts) { const o = old.get(n.art * 1000 + n.sub); if (!o) out.push({ ...n, how: '신설' }); else if (flat(o.text) !== flat(n.text) || o.title !== n.title) out.push({ ...n, how: /^삭제/.test(n.text.trim()) ? '삭제' : '개정' }); }
  return out;
}
export const dateText = (s) => ymd(s);
// what a paragraph's coming text adds ('+') and drops ('-') against today's ('='), for 신구 대비 in place: letter by letter
// (words by words for a very long paragraph), then the stray one- and two-letter matches inside a change are folded into it,
// and a pair of changes keeps out the letters they share at either end (우주항공청장이 → 우주항공청장(…말한다)이: only "(…말한다)")
export function wordDiff(before, after) {
  const A = String(before || ''), B = String(after || '');
  const small = A.length * B.length <= 400000;
  const a = small ? [...A] : A.match(/\s+|[^\s\p{P}]+|\p{P}/gu) || [], b = small ? [...B] : B.match(/\s+|[^\s\p{P}]+|\p{P}/gu) || [];
  const n = a.length, m = b.length;
  if (!n || !m || n * m > 400000) return [['-', A], ['+', B]].filter((x) => x[1]);
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let out = [];
  const push = (list, k, t) => { const l = list[list.length - 1]; if (l && l[0] === k) l[1] += t; else list.push([k, t]); };
  let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { push(out, '=', a[i]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) push(out, '-', a[i++]); else push(out, '+', b[j++]); }
  while (i < n) push(out, '-', a[i++]);
  while (j < m) push(out, '+', b[j++]);
  // a run of changes, with what it drops first and what it adds after
  const runs = (list) => {
    const res = [];
    for (let k = 0; k < list.length;) {
      if (list[k][0] === '=') { push(res, '=', list[k][1]); k++; continue; }
      let del = '', ins = '';
      while (k < list.length && list[k][0] !== '=') { if (list[k][0] === '-') del += list[k][1]; else ins += list[k][1]; k++; }
      let pre = 0; while (pre < del.length && pre < ins.length && del[pre] === ins[pre]) pre++;
      let suf = 0; while (suf < del.length - pre && suf < ins.length - pre && del[del.length - 1 - suf] === ins[ins.length - 1 - suf]) suf++;
      if (pre) push(res, '=', del.slice(0, pre));
      if (del.length - pre - suf > 0) push(res, '-', del.slice(pre, del.length - suf));
      if (ins.length - pre - suf > 0) push(res, '+', ins.slice(pre, ins.length - suf));
      if (suf) push(res, '=', del.slice(del.length - suf));
    }
    return res;
  };
  for (let again = true, turns = 0; again && turns < 8; turns++) {
    again = false;
    const next = [];
    for (let k = 0; k < out.length; k++) {
      const x = out[k];
      if (x[0] === '=' && k > 0 && k < out.length - 1 && out[k - 1][0] !== '=' && out[k + 1][0] !== '=' && x[1].replace(/\s/g, '').length <= 2) { next.push(['-', x[1]], ['+', x[1]]); again = true; }
      else next.push(x);
    }
    out = runs(next);
  }
  return out;
}
// each paragraph of an article as the coming amendment has it, with what changes in it: today's paragraph of the same
// number (①, ② …) is its counterpart; null when the paragraph stays as it is
export function pendingParas(today, coming) {
  const lead = (t) => (/^\s*([①-⑳])/.exec(t) || [])[1] || '';
  const was = paras(today), now = paras(coming);
  return now.map((t, k) => {
    const o = (lead(t) && was.find((x) => lead(x) === lead(t))) || (!lead(t) ? was[k] : null);
    if (o && flat(o) === flat(t)) return { text: t, diff: null };
    return { text: t, diff: o ? wordDiff(o, t) : [['+', t]] };
  });
}

/* ---------------- the courts' judgments: 국가법령정보 OPEN API (and the public mirror) ---------------- */
// Until the owner's registration at open.law.go.kr lets the server ask, the answer is a refusal ('unregistered'); it is
// remembered for a while so a page full of citations does not ask again and again.
let refusedAt = 0, answeredAt = 0;
export const drfReady = () => answeredAt > refusedAt;   // 국가법령정보 has answered since it last refused
const arr = (x) => (x == null || x === '' ? [] : Array.isArray(x) ? x : [x]);
const ymd = (s) => { const m = /^(\d{4})\.?(\d{2})\.?(\d{2})$/.exec(String(s || '').trim()); return m ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.` : ''; };
const norm = (s) => String(s || '').replace(/[\s「」·ㆍ]/g, '');
async function drf(kind, params) {
  if (Date.now() - refusedAt < 10 * 60e3) throw fail('unregistered');
  if (!navigator.onLine) throw fail('offline');
  let d;
  try { d = await (kind === 'item' ? api.lawItem(params) : api.lawSearch(params)); }
  catch (e) { throw fail(api.isOffline(e) ? 'offline' : e && e.code === 'no_key' ? 'unregistered' : 'unavailable'); }
  if (!d || typeof d !== 'object') throw fail('unavailable');
  if (d.result && !d.법령 && !d.LawSearch && !d.PrecSearch && !d.PrecService) { refusedAt = Date.now(); throw fail('unregistered'); }
  answeredAt = Date.now();
  return d;
}
const TAG = /<\/?(?:img|br|p|span|div|b|i|u|strong|em|sup|sub|font|a)\b[^>]*>/gi;   // not <개정 2020. 1. 1.>, which is the law's own
function text(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join('\n');
  if (typeof v === 'object') return text(v.content != null ? v.content : '');
  return String(v).replace(/<br\s*\/?>/gi, '\n').replace(TAG, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&')
    .split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean).join('\n');
}
// the 목 of a paragraph come as one list beside its 호; each 호's run of 목 starts again at 가
function mokGroups(list) { const g = []; for (const m of list) { if (!m || typeof m !== 'object') continue; if (!g.length || /^\s*가/.test(String(m.목번호 || ''))) g.push([]); g[g.length - 1].push(m); } return g; }
export function drfArts(d) {
  const law = d && d.법령;
  if (!law) throw fail('unavailable');
  const info = law.기본정보 || {};
  const arts = [];
  let chapter = '', last = null;
  for (const u of arr(law.조문 && law.조문.조문단위)) {
    if (u.조문여부 === '전문') { const h = text(u.조문내용); if (/^제\s*\d+\s*[편장]/.test(h)) chapter = h.replace(/\s+/g, ' '); continue; }
    if (u.조문여부 !== '조문') continue;
    const art = Number(u.조문번호), sub = Number(u.조문가지번호 || 0);
    if (!art || (last && last.art === art && last.sub === sub)) continue;
    const lines = [];
    const head = text(u.조문내용).replace(/^제\s*\d+\s*조(?:\s*의\s*\d+)?\s*(?:\([^)]*\))?\s*/, '');
    if (head) lines.push(head);
    for (const h of arr(u.항)) {
      if (!h || typeof h !== 'object') continue;
      if (h.항내용) lines.push(text(h.항내용));
      const hos = arr(h.호), moks = mokGroups(arr(h.목)), fit = hos.length && moks.length === hos.length;
      hos.forEach((o, i) => {
        if (o && o.호내용) lines.push(text(o.호내용));
        for (const m of arr(o && o.목)) if (m && m.목내용) lines.push(text(m.목내용));
        if (fit) for (const m of moks[i]) if (m.목내용) lines.push(text(m.목내용));
      });
      if (!fit) for (const g of moks) for (const m of g) if (m.목내용) lines.push(text(m.목내용));
    }
    last = { art, sub, title: text(u.조문제목), chapter, text: lines.filter(Boolean).join('\n') };
    arts.push(last);
  }
  const name = text(info.법령명_한글) || '';
  return { name, rev: String(info.시행일자 || ''), arts };
}
async function loadDrf(name, asked) {
  const kept = await store.get('kv', 'law:' + name).catch(() => null);
  const ok = kept && kept.v === 2 && kept.arts;
  const view = (k) => ({ key: name, title: `${k.full}${k.rev ? ` (${ymd(k.rev)} 시행)` : ''}`, rev: k.rev, full: k.full, preamble: '', arts: k.arts, src: 'law.go.kr' });
  if (ok && Date.now() - kept.at < 7 * 864e5) return view(kept);
  try {
    const s = await drf('search', { target: 'law', query: asked || name, display: '20' });
    const rows = arr(s.LawSearch && s.LawSearch.law);
    const want = norm(name);
    const row = rows.find((r) => norm(r.법령명한글) === want && r.현행연혁코드 !== '연혁') || rows.find((r) => norm(r.법령약칭명) === want) || rows.find((r) => norm(r.법령명한글) === want);
    if (!row) throw fail('nolaw');
    const mst = String(row.법령일련번호 || '');
    if (ok && kept.mst === mst) { kept.at = Date.now(); store.put('kv', 'law:' + name, kept).catch(() => {}); return view(kept); }
    const got = drfArts(await drf('item', { target: 'law', MST: mst }));
    if (!got.arts.length) throw fail('unavailable');
    const rec = { v: 2, at: Date.now(), mst, full: got.name || text(row.법령명한글), rev: got.rev || String(row.시행일자 || ''), arts: got.arts };
    await store.put('kv', 'law:' + name, rec).catch(() => {});
    return view(rec);
  } catch (e) {
    if (ok) return view(kept);   // the copy kept here, when the server cannot ask now
    throw e && e.code ? e : fail('unavailable');
  }
}

// a court's judgment (대법원 2000두7735, 서울고등법원 2019누1234 …): 판시사항, 판결요지, references, and the full text;
// kept here once read. ref is a number, or a court and a number as a search or a paper writes them
const courtAsking = new Map();
export function courtCase(ref) {
  const q = courtQuery(ref) || { no: String(ref || '').replace(/\s+/g, ''), court: '' };
  const k = q.court && q.court !== '대법원' ? `${q.no}@${q.court}` : q.no;
  if (!courtAsking.has(k)) courtAsking.set(k, askCourt(q.no, q.court, k).finally(() => courtAsking.delete(k)));
  return courtAsking.get(k);
}
// a court as papers write it: 대판 → 대법원, 서울고법 → 서울고등법원, 서울중앙지법 → 서울중앙지방법원, 서울행법 → 서울행정법원
export function courtName(s) {
  const t = String(s || '').replace(/\s+/g, '');
  if (!t) return '';
  if (/^대(?:법원|판|법)$/.test(t)) return '대법원';
  return t.replace(/고법/, '고등법원').replace(/지법/, '지방법원').replace(/행법$/, '행정법원').replace(/가법$/, '가정법원').replace(/\(([^)]+)\)$/, '$1');
}
// the courts' judgments: an index by the year in the number (shipped with the app: prec/2000.json …; 대법원 first, then any
// other court's judgment under the same number) finds the file in the public mirror precedent-kr (법제처's texts)
const yearIdx = {};
function precIndex(no) {
  const y = (/^(\d{2,4})/.exec(no) || [])[1];
  if (!y) return Promise.resolve({});
  if (!yearIdx[y]) yearIdx[y] = fetch(new URL(`./prec/${y}.json`, import.meta.url)).then((r) => { if (r.status === 404) return {}; if (!r.ok) throw new Error('index'); return r.json(); }).catch(() => { delete yearIdx[y]; return null; });
  return yearIdx[y];
}
const section = (body, name) => { const m = new RegExp(`^##\\s*${name}\\s*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'm').exec(body); return m ? m[1].trim() : ''; };
const DECISION = /^(?:\d{2,4})(?:마|그|스|브|카|모|로|초|라|느|무|루|아|즈)/;   // 결정 by the kind of case, when the text does not say
async function mirrorCourt(no, court) {
  const idx = await precIndex(no);
  if (!idx) throw fail('unavailable');
  const all = idx[no];
  if (!all) return null;
  const list = all.split(';').map((e) => { const [cat, stem] = e.split('|'); const c = stem.split('_')[0]; return { cat, stem, court: c, sup: c === '대법원' }; });
  const want = courtName(court), lower = list.filter((x) => !x.sup);
  const pick = !want ? list[0] : list.find((x) => courtName(x.court) === want) || (want !== '대법원' && lower.length === 1 ? lower[0] : null);
  if (!pick) return null;
  const r = await fetch(PREC + encodeURIComponent(pick.cat) + '/' + (pick.sup ? encodeURIComponent('대법원') : encodeURIComponent('하급심')) + '/' + encodeURIComponent(pick.stem) + '.md');
  if (r.status === 404) return null;
  if (!r.ok) throw fail('unavailable');
  const { head, body } = front(await r.text());
  const plain = (t) => t.split('\n').map(mdLine).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const reason = plain(section(body, '판례내용'));
  const said = /(?:주문과\s*같이|다음과\s*같이)\s*(판결|결정)한다/.exec(reason);
  const day = String(head['선고일자'] || '');
  return {
    no, court: true, name: head['사건명'] || '', date: /^0{4}/.test(day) ? '' : ymd(day.replace(/-/g, '')), courtName: head['법원명'] || pick.court,
    kind: said ? said[1] : DECISION.test(no) ? '결정' : '판결', points: plain(section(body, '판시사항')), summary: plain(section(body, '판결요지')),
    laws: plain(section(body, '참조조문')), cites: plain(section(body, '참조판례')), reason,
    url: /^https:\/\/www\.law\.go\.kr\//.test(head['출처'] || '') ? head['출처'] : '', others: list.filter((x) => x !== pick).map((x) => x.court), src: 'legalize-kr',
  };
}
async function askCourt(no, court, k) {
  const kept = await store.get('kv', 'court:' + k).catch(() => null);
  if (kept && kept.v === 3 && (kept.d || Date.now() - kept.at < 3 * 864e5)) return kept.d;
  if (!navigator.onLine) { if (kept && kept.d) return kept.d; throw fail('offline'); }
  let d;
  try { d = await mirrorCourt(no, court); } catch (e) { if (kept && kept.d) return kept.d; throw e; }
  if (d === null && drfReady()) d = await drfCourt(no).catch(() => null);   // not in the mirror: 국가법령정보, once it answers us
  await store.put('kv', 'court:' + k, { v: 3, at: Date.now(), d }).catch(() => {});
  return d;
}
async function drfCourt(no) {
  const s = await drf('search', { target: 'prec', nb: no, display: '20' });
  const row = arr(s.PrecSearch && s.PrecSearch.prec).find((r) => norm(r.사건번호).split(',').map(norm).includes(no) || norm(r.사건번호) === no);
  if (!row) return null;
  const x = (await drf('item', { target: 'prec', ID: String(row.판례일련번호) })).PrecService || {};
  return {
    no, court: true, name: text(x.사건명 || row.사건명), date: ymd(x.선고일자 || row.선고일자), courtName: text(x.법원명 || row.법원명),
    kind: text(x.판결유형 || row.판결유형) || '판결', points: text(x.판시사항), summary: text(x.판결요지), laws: text(x.참조조문), cites: text(x.참조판례), reason: text(x.판례내용),
  };
}
// 대법원 2004. 4. 22. 선고 2000두7735 판결 · 대법원 2010. 3. 2.자 2009마1234 결정
export const courtCite = (d) => `${d.courtName || '법원'} ${d.date ? d.date + (d.kind === '결정' ? '자 ' : ' 선고 ') : ''}${d.no} ${d.kind || '판결'}`;

/* ---------------- citations in a paper's text (parser v2) ----------------
   The law named just before 제N조. A known law (the name dictionary: every filed law, abbreviations) is matched by its longest
   name, so a long spaced name links whole ("국가를 당사자로 하는 계약에 관한 법률 제27조"); a version note "(…개정된 것)"
   between the name and 제 is stepped over. A name not in the dictionary (a repealed law, say) links as before, so it still
   opens 국가법령정보센터 and the 헌재 decisions on it. A foreign jurisdiction governing the clause ("일본 공직선거법",
   "수정헌법", "(Parliamentary Elections Act 1954)") never links to the same-named Korean law. Lists of articles, 항 and
   circled numbers, 「」 names and 헌법 전문 are handled. */
const SUFFIX = /(?:법률|법|령|규칙|헌법|법전)$/;
// a foreign law written with a Korean name is not the Korean law of that name. A country must govern the name itself —
// "일본국 민법", "일본의 행정절차법", "영국 1998년 인권법", glued "수정헌법"·"연방선거법" — not merely appear in the sentence
// ("미국회사로부터 … 근로기준법 제24조", "[2] 영국 해상보험법 제33조, 상법 제693조" are Korean). "우리 민법", "현행 헌법" are Korean
// always. The one reach-back: a parenthetical source right after a statement about that same foreign law ("일본
// 형사소송법(…)도 …로 정하고 있다(형사소송법 제199조)"). 인도(引渡)·호주(戶主) are delivery and head of household, not countries.
const CTRY = '일본|日本|독일|獨逸|미국|美國|프랑스|佛蘭西|영국|英國|영연방|캐나다|대만|臺灣|중국|中國|오스트리아|오스트레일리아|스위스|이탈리아|스페인|핀란드|뉴질랜드|네덜란드|벨기에|유럽연합|러시아|브라질';
const GOVERNS = new RegExp(`(?:${CTRY})(?:국)?(?:의)?\\s*(?:(?:1[89]|20)\\d{2}\\s*년\\s*|연방\\s*|구\\s*)?$`);
const GLUED_FOREIGN = /(?:수정|연방)\s*$/;
const KOREAN_ANCHOR = /(?:우리|우리나라|한국|대한민국|현행|국내)\s*(?:의\s*)?$/;
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function foreignLaw(text, at, law) {
  const near = text.slice(Math.max(0, at - 24), at);
  if (KOREAN_ANCHOR.test(near)) return false;
  if (GOVERNS.test(near) || GLUED_FOREIGN.test(text.slice(Math.max(0, at - 7), at))) return true;
  if (/\(\s*$/.test(near)) {   // "(형사소송법 제199조" after "일본 형사소송법 … 정하고 있다"
    const nm = reEsc(NAME_NORM(law)), under = new RegExp(`(?:${CTRY})(?:국)?(?:의)?(?:\\d{4}년)?${nm}`);
    const sent = NAME_NORM(text.slice(Math.max(0, at - 160), at).split(/[.。!?]\s/).pop());   // a line break in a PDF is a wrap, not a sentence's end
    const close = text.indexOf(')', at), inParen = NAME_NORM(text.slice(at, close > at ? Math.min(close, at + 200) : at + 200));
    // …unless the same parenthesis names it again under a country: "(저작권법 제3조 제3항 및 중국 저작권법 제…)" — a contrast, so this one is Korean
    if (under.test(sent) && !under.test(inParen)) return true;
  }
  return false;
}
// not a law's name on its own (the bare-name fallback): 같은 법, 동법, a bare 법률·특별법, or a name that begins with a country
const NOT_A_LAW = /^(?:같은|동)(?:법|법률)(?:시행령|시행규칙)$|^(?:같은|동|이|위|본|해당|그|각|이사건|관계|관련|구|신|개정|현행|종전|입|방|불|위|사|공|행정|국제|실정|자연|위헌|합헌|모|부|당해|관련)(?:법률|법|령|규칙)$|^(?:법률|위헌법률|헌법률|수정헌법|기본법|특례법|특별법|조치법|처벌법|시행령|시행규칙|진흥법|촉진법|보호법|관리법|조직법|절차법)$|^(?:미국|독일|프랑스|일본|영국|연방|미|독|불|일|영)/;
const SHORT = new Set(['헌법', '민법', '형법', '상법']);   // the two-letter laws; any other two letters before 법 is a word cut by a line break
// a known name glued to the word before it is taken only after a qualifier (현행헌법, 신민법) or a particle (근거법률인국가공무원법);
// otherwise it is part of another name — 임대주택법 is not 주택법, 수정헌법 is not 헌법
const QUALIFIER = /^(?:현행|개정|신|新)$/;   // "the current one" only — 구민법 is the old 의용민법 and 제헌헌법 the 1948 text, not today's
const PARTICLE = /[의은는을를과와에로인및]$/;   // not 상·중·등: they end nouns as often (보상·집중·평등) — 산업재해보상보험업법 is not 보험업법
// the law named just before `end` (the index of 제); null when nothing is there
function lawBefore(text, end) {
  let s = end;
  while (s > 0 && /\s/.test(text[s - 1])) s--;
  if (text[s - 1] === ')') {   // step over "(…개정된 것)" only; any other paren (often a foreign original title) means do not link
    const open = text.lastIndexOf('(', s - 1), inside = open >= 0 ? text.slice(open + 1, s - 1) : '';
    const versionNote = /개정|신설|전의\s*것|된\s*것|법률\s*제\s*\d+\s*호|대통령령\s*제\s*\d+\s*호|시행|폐지|제정|이전의/.test(inside) && !/[A-Za-z]/.test(inside);
    if (open >= 0 && s - open < 100 && versionNote) { s = open; while (s > 0 && /\s/.test(text[s - 1])) s--; }
    else if (open >= 0) return null;
  }
  if (text[s - 1] === '」') {   // 「name」
    const open = text.lastIndexOf('「', s - 1);
    if (open >= 0) { const nm = text.slice(open + 1, s - 1).trim(); const canon = resolveName(NAME_NORM(nm)) || (SUFFIX.test(NAME_NORM(nm)) && /^[가-힣·ㆍ\s]{2,50}$/.test(nm) ? nm.replace(/\s+/g, ' ').trim() : null); if (canon) return { law: canon, start: open }; }
    return null;
  }
  // a known law, by its longest name ending here
  const hard = Math.max(0, s - 45);
  let start = s;
  // (the walk stops where an earlier "제N조"·"N항"·"N호" ends: "행정소송법 제14조민사소송법 제58조" is two citations)
  const tokEnd = (k) => /[조항호]/.test(text[k - 1]) && /\d/.test(text[k - 2] || '');
  while (start > hard && /[가-힣·ㆍ()\s]/.test(text[start - 1]) && !tokEnd(start)) start--;
  const span = text.slice(start, s);
  for (let a = 0; a < span.length; a++) {   // a grows → the candidate shortens; the first known one is the longest
    const rest = span.slice(a), cand = rest.trimStart();
    if (cand.length < 2) break;
    if (!SUFFIX.test(NAME_NORM(cand))) continue;
    const canon = resolveName(NAME_NORM(cand));
    if (!canon) continue;
    const abs = start + a + (rest.length - cand.length);
    if (abs > 0 && /[가-힣]/.test(text[abs - 1]) && !tokEnd(abs)) {   // glued to the word before it
      let q = abs; while (q > 0 && /[가-힣]/.test(text[q - 1])) q--;
      const before = text.slice(q, abs);
      if (QUALIFIER.test(before)) return { law: canon, start: q };
      if (!PARTICLE.test(before)) continue;
    }
    return { law: canon, start: abs };
  }
  // not a known law: the bare name right before 제, as before (a repealed law still opens 국가법령정보센터 and its 헌재 decisions)
  let b = s; while (b > 0 && s - b < 30 && /[가-힣·ㆍ]/.test(text[b - 1]) && !tokEnd(b)) b--;
  const tight = text.slice(b, s).replace(/[·ㆍ]/g, '');
  if (text[b - 1] === '\n') {   // a word cut by a line break ("연⏎방선거운동법"): a foreign name is still foreign
    let q = b - 1; while (q > 0 && /[가-힣]/.test(text[q - 1])) q--;
    if (/^(?:미국|독일|프랑스|일본|영국|연방|수정)/.test(text.slice(q, b - 1) + tight)) return null;
  }
  if (tight && /(?:법률|법|령|규칙)$/.test(tight) && !NOT_A_LAW.test(tight) && (tight.length > 2 || SHORT.has(tight))) return { law: lawKey(tight) || tight, start: b };
  return null;
}
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const circ = (c) => (c ? CIRCLED.indexOf(c) + 1 : 0);
// a circled number is a 항 only on the same line and not followed by digits: "제37조②", "제77조의2 ①과 동일" — not the
// 판결요지집's "제53조②777면", nor "제54조⏎③ 원고는…" (the judgment's own list) or a quoted article's "⏎① 근로자가…"
const ART_TAIL = /제\s*(\d{1,4})\s*조(?:\s*의\s*(\d{1,3}))?(?:\s*제\s*(\d{1,3})\s*항|[ \t]*([①-⑳])(?![ \t]*\d))?/g;
const ART_MORE = /\s*(?:,|·|ㆍ|및|와|과)\s*제\s*(\d{1,4})\s*조(?:\s*의\s*(\d{1,3}))?(?:\s*제\s*(\d{1,3})\s*항|[ \t]*([①-⑳])(?![ \t]*\d))?/y;
const PARA_MORE = /\s*(?:,|·|ㆍ|및|와|과)\s*(?:제\s*(\d{1,3})\s*항|([①-⑳])(?![ \t]*\d))/y;
const JEONMUN = /(?:대한민국)?헌법\s*전문/g;
export function scanArticles(textIn) {
  const out = [];
  if (!textIn) return out;
  ART_TAIL.lastIndex = 0;
  let m;
  while ((m = ART_TAIL.exec(textIn))) {
    const tailEnd = m.index + m[0].length, nm = lawBefore(textIn, m.index);
    if (!nm || foreignLaw(textIn, nm.start, nm.law)) continue;
    let art = Number(m[1]), sub = m[2] ? Number(m[2]) : 0;
    out.push({ law: nm.law, art, sub, para: m[3] ? Number(m[3]) : circ(m[4]), i: nm.start, len: tailEnd - nm.start });
    let at = tailEnd;   // the same law's list: a new article, or another 항 of this article
    for (;;) {
      PARA_MORE.lastIndex = at; const p = PARA_MORE.exec(textIn);
      ART_MORE.lastIndex = at; const a = ART_MORE.exec(textIn);
      if (p && (!a || p.index <= a.index)) { const k = p[0].search(/[제①-⑳]/); out.push({ law: nm.law, art, sub, para: p[1] ? Number(p[1]) : circ(p[2]), i: p.index + k, len: p[0].length - k }); at = PARA_MORE.lastIndex; }
      else if (a) { art = Number(a[1]); sub = a[2] ? Number(a[2]) : 0; const k = a[0].search(/제/); out.push({ law: nm.law, art, sub, para: a[3] ? Number(a[3]) : circ(a[4]), i: a.index + k, len: a[0].length - k }); at = ART_MORE.lastIndex; }
      else break;
    }
    ART_TAIL.lastIndex = at;
  }
  JEONMUN.lastIndex = 0; let j;   // 헌법 전문 (and the articles after it in "헌법 전문, 제1조 …" belong to 헌법)
  while ((j = JEONMUN.exec(textIn))) {
    if (foreignLaw(textIn, j.index, '헌법')) continue;
    out.push({ law: '헌법', art: '전문', sub: 0, para: 0, i: j.index, len: j[0].length });
    let at = j.index + j[0].length, a;
    for (;;) { ART_MORE.lastIndex = at; a = ART_MORE.exec(textIn); if (!a) break; const k = a[0].search(/제/); out.push({ law: '헌법', art: Number(a[1]), sub: a[2] ? Number(a[2]) : 0, para: a[3] ? Number(a[3]) : circ(a[4]), i: a.index + k, len: a[0].length - k }); at = ART_MORE.lastIndex; }
  }
  return out;
}
// a court's case cited in a paper: 대법원 2004. 4. 22. 선고 2000두7735 판결, 대판 2010다12345, 85다카1151, 2016수64 (단기 4287민상…)
// longer kinds first so 다카 is tried before 다 (alternation is ordered)
const COURT_KINDS = ['다카', '재다카', '가합', '가단', '가소', '카합', '카단', '카기', '구합', '구단', '고합', '고단', '고정', '고약',
  '느합', '느단', '감도', '재다', '재두', '재도', '재노', '재나', '재누', '민상', '형상', '행상', '드합', '드단',
  '가', '나', '다', '라', '마', '머', '두', '누', '구', '도', '노', '로', '모', '오', '보', '초', '수', '무', '므', '르', '드', '카', '브', '스', '으', '느',
  '후', '허', '추', '트', '러', '어', '저', '처', '커', '터', '퍼', '쿠', '주', '즈', '츠', '크', '티', '프', '흐', '그', '아', '부', '루'].join('|');
const COURT_RE = new RegExp(`((?:19|20|42)\\d{2}|[4-9]\\d)\\s?(${COURT_KINDS})\\s?(\\d{1,7})(?!\\d)(?![,.]\\d)`, 'g');   // 42xx = 단기; not 1,234
// a following bare number repeats year·kind (2009두23617, 23624) — not when it starts the next full number ("…, 2010두1234",
// "…, 2004헌마554") or a date ("…, 2010. 1. 1. 선고")
const CONT_NUM = /\s*[,·ㆍ]\s*(\d{1,7})(?!\d)(?![,.]\d)(?!\s?[가-힣]{1,3}\s?\d)(?!\s?\.\s?\d{1,2}\s?\.)/y;
export function scanCourtCases(textIn) {
  const out = [];
  if (!textIn) return out;
  COURT_RE.lastIndex = 0;
  let m;
  while ((m = COURT_RE.exec(textIn))) {
    const before = textIn.slice(Math.max(0, m.index - 40), m.index), after = textIn.slice(m.index + m[0].length, m.index + m[0].length + 14);
    if (!/(?:법원|대판|선고|판결|결정)/.test(before + after)) continue;   // only where it is plainly a court's case
    if (/[가-힣]$/.test(textIn.slice(Math.max(0, m.index - 1), m.index)) && !/[원판]$/.test(before)) continue;
    const named = /(대법원|대판|[가-힣]{2,10}(?:고등법원|지방법원|행정법원|가정법원|회생법원|특허법원|고법|지법|행법|가법)(?:\s?[가-힣]{2,4}지원)?)[^가-힣\d]{0,4}(?:(?:19|20|42)\d{2}\s?\.\s?\d{1,2}\s?\.\s?\d{1,2}\s?\.?\s?(?:자|선고)?\s?)?$/.exec(before);
    const court = named ? courtName(named[1]) : '', yr = m[1], kind = m[2];
    const push = (digits, i, len) => { const no = yr + kind + Number(digits); out.push({ no, court, ref: court && court !== '대법원' ? `${court} ${no}` : no, i, len }); };
    push(m[3], m.index, m[0].length);
    let at = m.index + m[0].length, c; CONT_NUM.lastIndex = at;   // list continuation: same court·year·kind
    while ((c = CONT_NUM.exec(textIn))) { const k = c[0].search(/\d/); push(c[1], c.index + k, c[0].length - k); at = CONT_NUM.lastIndex; }
    COURT_RE.lastIndex = at;
  }
  return out;
}
