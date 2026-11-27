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
// (a citation copied from a paper keeps its brackets — "｢행정기본법｣ 제27조", "「행정기본법」 제27조" — and is the same ask)
export function articleQuery(q) {
  const s = corners(q).replace(/[「」『』]/g, ' ').trim().replace(/\s+/g, ' ');
  if (/^(?:대한민국\s?)?헌법\s?전문$/.test(s)) return { law: '헌법', art: '전문', sub: 0, para: 0, item: 0 };   // the preamble
  const m = ART_RE.exec(s);
  if (!m) return null;
  const law = m[1].replace(/\s+/g, '');
  if (!/^[가-힣ㆍ·]{2,60}$/.test(law) || !/(?:법|령|규칙|법률|규정)$/.test(law)) return null;
  // (a name lawyers use — 선거법 제93조 — keeps the name asked, with the law it stands for: full, via 'abbr')
  const ab = lawKey(law) ? '' : ABBR[law.replace(/·/g, 'ㆍ')] || ABBR[law] || '';
  return { law: lawKey(law) || law, art: Number(m[2]), sub: m[3] ? Number(m[3]) : 0, para: m[4] ? Number(m[4]) : 0, item: m[5] ? Number(m[5]) : 0, ...(ab ? { full: ab, via: 'abbr' } : {}) };
}
// a court's case number (대법원 2000두7735, 2019다12345, 2018고단1234): 헌재's own (헌가, 헌마 …) are not these
export function courtQuery(q) {
  const m = /^(대법원|대판|[가-힣]{2,12}(?:법원|고법|지법|행법|가법)(?:\s?\(?[가-힣]{2,4}(?:지원|재판부|부)?\)?)?)?\s*((?:19|20)\d{2}|42\d{2}|\d{2})\s*([가-힣]{1,3})\s*(\d{1,7})$/.exec(String(q || '').trim().replace(/\s+/g, ' '));
  if (!m || /^헌/.test(m[3])) return null;
  return { no: m[2] + m[3] + Number(m[4]), court: courtName(m[1] || '') };
}

// the 국가법령정보센터 pages (its documented links by name), for what this app cannot show itself yet. A name goes in as the
// mirror's own 출처 links write it — no spaces, 헌법 by its full name; an article address only for a numbered article. These
// are built only from a law the app has found (one in force); a name it could not find gets the site's search instead.
const lgkName = (law) => { const n = String(law || '').replace(/\s+/g, ''); return encodeURIComponent(n === '헌법' ? '대한민국헌법' : n); };
export const lawGoKr = {
  article: (law, art, sub) => (typeof art === 'number' ? `https://www.law.go.kr/법령/${lgkName(law)}/${encodeURIComponent(`제${art}조${sub ? '의' + sub : ''}`)}` : `https://www.law.go.kr/법령/${lgkName(law)}`),
  law: (law) => `https://www.law.go.kr/법령/${lgkName(law)}`,
  case: (no) => `https://www.law.go.kr/판례/(${encodeURIComponent(no)})`,
  decision: (no) => `https://www.law.go.kr/헌재결정례/(${encodeURIComponent(no)})`,
  compare3: (law) => `https://www.law.go.kr/법령/${lgkName(law)}/삼단비교`,
  oldNew: (law) => `https://www.law.go.kr/법령/신구법비교/${lgkName(law)}`,
  search: (q) => `https://www.law.go.kr/lsSc.do?query=${encodeURIComponent(String(q || '').trim())}`,
  precSearch: (no) => `https://www.law.go.kr/LSW/precSc.do?query=${encodeURIComponent(String(no || '').trim())}`,
};

/* ---------------- the texts ---------------- */
const fail = (code) => Object.assign(new Error(code), { code });
// no answer from the shelf's server: 'offline' when the device has no internet, 'server' when it has one and the server is
// down (as app.js tells them apart) — a law kept in the mirror is then still read from there
const noAnswer = () => (navigator.onLine === false ? 'offline' : 'server');
const mem = {};
const asking = {};
export function lawText(name) {
  ucWatch();   // (the 위헌·헌법불합치 bands on the cards it makes: below)
  // (an old name: a repealed law is said so at once, with what took its place; a renamed one is today's law)
  const o = oldLaw(name);
  // (now: what took its place as a reader is told it — 공직선거및선거부정방지법(…, 2005. 8. 4. 공직선거법으로 이름 변경) for the four
  // election laws; nowLaw: the law in force today, to open)
  if (o && o.gone) return Promise.reject(Object.assign(fail('repealed'), { date: o.gone, now: o.nowText || o.now, nowLaw: o.now, was: o.name }));
  if (o) return lawText(o.now);
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
    throw api.isOffline(e) ? fail(noAnswer()) : e && e.code ? e : fail('unavailable');
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
export const artLabel = (a) => (a.art === '전문' ? '전문' : `제${a.art}조${a.sub ? '의' + a.sub : ''}`);
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
  청소년성보호법: '아동ㆍ청소년의 성보호에 관한 법률', 아청법: '아동ㆍ청소년의 성보호에 관한 법률',
  // (public-law papers name these by their short names as often as by their own; each checked against lawidx.json)
  지방계약법: '지방자치단체를 당사자로 하는 계약에 관한 법률', 토지보상법: '공익사업을 위한 토지 등의 취득 및 보상에 관한 법률', 공익사업법: '공익사업을 위한 토지 등의 취득 및 보상에 관한 법률',
  국토계획법: '국토의 계획 및 이용에 관한 법률', 국토이용법: '국토의 계획 및 이용에 관한 법률', 공정거래법: '독점규제 및 공정거래에 관한 법률', 독점규제법: '독점규제 및 공정거래에 관한 법률',
  도시정비법: '도시 및 주거환경정비법', 도정법: '도시 및 주거환경정비법', 노동조합법: '노동조합 및 노동관계조정법', 노조법: '노동조합 및 노동관계조정법',
  감염병예방법: '감염병의 예방 및 관리에 관한 법률', 개발제한구역법: '개발제한구역의 지정 및 관리에 관한 특별조치법',
  부패방지법: '부패방지 및 국민권익위원회의 설치와 운영에 관한 법률', 부패방지권익위법: '부패방지 및 국민권익위원회의 설치와 운영에 관한 법률',
  공무원노조법: '공무원의 노동조합 설립 및 운영 등에 관한 법률', 교원노조법: '교원의 노동조합 설립 및 운영 등에 관한 법률',
  하도급법: '하도급거래 공정화에 관한 법률', 공유재산법: '공유재산 및 물품 관리법', 보조금법: '보조금 관리에 관한 법률', 국가유공자법: '국가유공자 등 예우 및 지원에 관한 법률',
  장애인차별금지법: '장애인차별금지 및 권리구제 등에 관한 법률', 남녀고용평등법: '남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률', 기간제법: '기간제 및 단시간근로자 보호 등에 관한 법률',
  파견법: '파견근로자 보호 등에 관한 법률', 산재보험법: '산업재해보상보험법', 신문법: '신문 등의 진흥에 관한 법률', 언론중재법: '언론중재 및 피해구제 등에 관한 법률',
  위치정보법: '위치정보의 보호 및 이용 등에 관한 법률', 형사보상법: '형사보상 및 명예회복에 관한 법률', 범죄수익은닉규제법: '범죄수익은닉의 규제 및 처벌 등에 관한 법률',
  마약류관리법: '마약류 관리에 관한 법률', 폭력행위처벌법: '폭력행위 등 처벌에 관한 법률', 폭처법: '폭력행위 등 처벌에 관한 법률', 아동학대처벌법: '아동학대범죄의 처벌 등에 관한 특례법',
  스토킹처벌법: '스토킹범죄의 처벌 등에 관한 법률', 국정감사법: '국정감사 및 조사에 관한 법률', 국회증언감정법: '국회에서의 증언ㆍ감정 등에 관한 법률',
  제주특별법: '제주특별자치도 설치 및 국제자유도시 조성을 위한 특별법', 부동산실명법: '부동산 실권리자명의 등기에 관한 법률', 상가임대차법: '상가건물 임대차보호법',
  주택임대차법: '주택임대차보호법', 가족관계등록법: '가족관계의 등록 등에 관한 법률', 채무자회생법: '채무자 회생 및 파산에 관한 법률', 자본시장법: '자본시장과 금융투자업에 관한 법률',
  약관규제법: '약관의 규제에 관한 법률', 약관법: '약관의 규제에 관한 법률', 표시광고법: '표시ㆍ광고의 공정화에 관한 법률', 할부거래법: '할부거래에 관한 법률', 방문판매법: '방문판매 등에 관한 법률',
  전자상거래법: '전자상거래 등에서의 소비자보호에 관한 법률', 학교폭력예방법: '학교폭력예방 및 대책에 관한 법률', 지방교육자치법: '지방교육자치에 관한 법률',
  공원녹지법: '도시공원 및 녹지 등에 관한 법률', 도시재정비법: '도시재정비 촉진을 위한 특별법', 빈집법: '빈집 및 소규모주택 정비에 관한 특례법', 조달사업법: '조달사업에 관한 법률',
  전자조달법: '전자조달의 이용 및 촉진에 관한 법률', 공공감사법: '공공감사에 관한 법률', 민원처리법: '민원 처리에 관한 법률', 공공데이터법: '공공데이터의 제공 및 이용 활성화에 관한 법률',
  신용정보법: '신용정보의 이용 및 보호에 관한 법률', 금융실명법: '금융실명거래 및 비밀보장에 관한 법률', 특정금융정보법: '특정 금융거래정보의 보고 및 이용 등에 관한 법률',
  근로자참여법: '근로자참여 및 협력증진에 관한 법률', 교육환경법: '교육환경 보호에 관한 법률', 재난안전법: '재난 및 안전관리 기본법', 경직법: '경찰관 직무집행법',
  개인정보법: '개인정보 보호법', 공공주택법: '공공주택 특별법',
  // (선거법: what scholars and judgments call 공직선거법 — and 통합선거법, the 1994 law that joined the four election laws)
  선거법: '공직선거법', 통합선거법: '공직선거법',
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
// laws a paper or a judgment still cites by a name they no longer have: renamed (the same law: its articles open today's,
// marked 구법 and said renamed — whole: a 전부개정 gave it the new name, so its numbers may differ) or repealed (gone: no
// article of today's opens for it; now names the law that took its place). Each new name checked against lawidx.json; the
// dates are those of the change's 공포 (lawhist/index.json: the new name's first version) or of the repeal's taking effect.
// nowText: what took a repealed law's place, as a footnote would say it (the four election laws were replaced by 공직선거및
// 선거부정방지법, which is 공직선거법 only since its rename)
const ELECTION_1994 = '공직선거및선거부정방지법(1994. 3. 16. 제정, 2005. 8. 4. 공직선거법으로 이름 변경)';
const OLD_LAWS = {
  공직선거및선거부정방지법: { now: '공직선거법', date: '2005. 8. 4.', since: '1994-03-16' },
  정치자금에관한법률: { now: '정치자금법', date: '2005. 8. 4.', whole: true },
  국가안전기획부법: { now: '국가정보원법', date: '1999. 1. 21.' },
  전염병예방법: { now: '감염병의 예방 및 관리에 관한 법률', date: '2009. 12. 29.', whole: true },
  정보통신망이용촉진등에관한법률: { now: '정보통신망 이용촉진 및 정보보호 등에 관한 법률', date: '2001. 1. 16.', whole: true },
  민원사무처리에관한법률: { now: '민원 처리에 관한 법률', date: '2015. 8. 11.', whole: true },
  조세감면규제법: { now: '조세특례제한법', date: '1998. 12. 28.', whole: true },
  상속세법: { now: '상속세 및 증여세법', date: '1996. 12. 30.', whole: true },
  주택건설촉진법: { now: '주택법', date: '2003. 5. 29.', whole: true },
  사회안전법: { now: '보안관찰법', date: '1989. 6. 16.', whole: true },
  임대주택법: { now: '민간임대주택에 관한 특별법', date: '2015. 8. 28.', whole: true },
  국회의원선거법: { gone: '1994-03-16', now: '공직선거법', nowText: ELECTION_1994 },   // (the four election laws: 공직선거및선거부정방지법 부칙)
  대통령선거법: { gone: '1994-03-16', now: '공직선거법', nowText: ELECTION_1994 },
  지방의회의원선거법: { gone: '1994-03-16', now: '공직선거법', nowText: ELECTION_1994 },
  지방자치단체의장선거법: { gone: '1994-03-16', now: '공직선거법', nowText: ELECTION_1994 },
  토지수용법: { gone: '2003-01-01', now: '공익사업을 위한 토지 등의 취득 및 보상에 관한 법률' },
  도시계획법: { gone: '2003-01-01', now: '국토의 계획 및 이용에 관한 법률' },
  국토이용관리법: { gone: '2003-01-01', now: '국토의 계획 및 이용에 관한 법률' },   // (도시계획법 and it: 국토계획법 부칙)
  토지구획정리사업법: { gone: '2000-07-01', now: '도시개발법' },
  도시재개발법: { gone: '2003-07-01', now: '도시 및 주거환경정비법' },
  생활보호법: { gone: '2000-10-01', now: '국민기초생활 보장법' },
  교육법: { gone: '1998-03-01', now: '교육기본법', nowText: '교육기본법 · 초ㆍ중등교육법 · 고등교육법' },
  반공법: { gone: '1980-12-31', now: '국가보안법' },
  언론기본법: { gone: '1987-11-28', now: '' },
  국가보위에관한특별조치법: { gone: '1981-12-17', now: '' },
  공공기관의개인정보보호에관한법률: { gone: '2011-09-30', now: '개인정보 보호법' },
  사회보호법: { gone: '2005-08-04', now: '' },
};
addLawNames(Object.keys(OLD_LAWS));
// what is known of a law cited by an old name: { name, now, date, whole } (renamed) or { name, gone, now } (repealed); null else
export function oldLaw(name) {
  const k = NAME_NORM(name), o = OLD_LAWS[k];
  return o ? { name: k, ...o } : null;
}
// the old names of a law today (공직선거법 → 공직선거및선거부정방지법, and the four election laws it replaced): each as oldLaw
// gives it — whole (a 전부개정 gave the new name: its numbers may differ) or gone (repealed; now names what took its place)
export function oldNamesOf(law) {
  const id = lawId(law);
  return Object.entries(OLD_LAWS).filter(([, o]) => o.now && lawId(o.now) === id).map(([k, o]) => ({ name: k, ...o }));
}

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
  const o = oldLaw(q);   // (a renamed law's old name: today's law, the old name said with it; a repealed one: none)
  if (o) { if (o.gone) return null; const n = await lawOf(o.now); return n ? { ...n, was: o.name, wasDate: o.date, whole: !!o.whole } : null; }
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
  // (a name lawyers use — 선거법, 국토계획법: via 'abbr', so a screen can say '공직선거법으로 찾았습니다')
  return { name: (idx[d][0] || d) + (m ? ' ' + m[2] : ''), dir: d, ...(d !== base ? { via: 'abbr', asked: String(q).trim() } : {}) };
}
// the law an abbreviation stands for ('선거법' → '공직선거법'), or '' — from the list alone, nothing asked
export const abbrOf = (name) => ABBR[dirOf(name)] || '';
// '공직선거법으로 찾았습니다': what a screen says when a name lawyers use was read as a law's own (받침 decides 으로/로)
export const foundAs = (name) => `${name}${josa(name, '으로', '로')} 찾았습니다`;
// a particle after a word, by its last letter's 받침 (으로/로: ㄹ takes 로)
function josa(w, withF, without) {
  const c = String(w || '').trim().replace(/\s*\([^()]*\)$/, ''), code = c.charCodeAt(c.length - 1) - 0xac00;
  if (!(code >= 0 && code < 11172)) return withF;   // (a digit or a closing bracket: as most citations read)
  const f = code % 28;
  return f && !(withF === '으로' && f === 8) ? withF : without;
}
export const sameLaw = (a, b) => dirOf(a) === dirOf(b);
// one law however a text names it, spaces and dots out: its own name (헌법 for 대한민국헌법 too), so an abbreviation and the
// full name (국가계약법, 국가를 당사자로 하는 계약에 관한 법률) compare as one
export const lawId = (name) => NAME_NORM(resolveName(NAME_NORM(name)) || name);
// every name a text may give that law (spaces and dots out): its own and those lawyers use for it — for finding where a
// paper cites it, whichever it wrote
export function lawAliases(name) {
  const id = lawId(name), out = new Set([id]);
  if (LAWS[id]) out.add(NAME_NORM(LAWS[id].full));
  for (const [k, v] of Object.entries(ALIAS)) if (v === id) out.add(k);
  for (const [k, v] of Object.entries(ABBR)) if (NAME_NORM(v) === id) out.add(k);
  return [...out].filter((n) => n.length >= 2);
}
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
    const base = (f) => f.replace(/\(.*\)$/, '');   // 법률(법률), 시행령(대통령령): the kind, its own name aside
    const cands = part ? files.filter((f) => base(f) === part) : files.filter((f) => base(f) !== '시행령' && base(f) !== '시행규칙');
    const pick = cands.length ? cands : part ? [] : [files[0]];
    return pick.length ? { dir: d, file: pick[0], cands: pick, files, name: part ? `${e[0] || d} ${part}` : e[0] || d } : null;
  };
  let hit = at(base) || (ABBR[dirOf(base)] && at(ABBR[dirOf(base)]));
  if (hit && !hit.guess) return hit;
  const official = await officialName(base).catch(() => null);   // an abbreviation, or a law newer than the index
  if (official) { const o = at(official); if (o && !o.guess) return o; hit = hit || o; if (!hit && idx) hit = { dir: dirOf(official), file: part || '법률', guess: true }; }
  return hit;   // a word that only ends like a law's name (관습헌법) is not asked for
}
async function mirrorFile(dir, file, ref = 'main') {
  let r;
  // (the connection dropping on the way: offline when the device says so, else unavailable — net marks it either way, so a
  // search that was under way can say the connection failed it rather than the mirror)
  try { r = await fetch(`${RAW}${ref}/kr/${encodeURIComponent(dir)}/${encodeURIComponent(file)}.md`, ref === 'main' ? { cache: 'no-cache' } : {}); } catch (e) { throw Object.assign(fail(navigator.onLine ? 'unavailable' : 'offline'), { net: true }); }
  if (r.status === 404) return null;
  if (!r.ok) throw fail('unavailable');
  return r.text();
}
// a text's size in UTF-8, as the mirror keeps it (a Korean letter is three bytes; what is sent is compressed besides)
const u8 = (s) => { let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? (i++, 4) : 3; } return n; };
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
  let chapter = '', cur = null, pre = null;
  for (const raw of body.split('\n')) {
    const l = raw.trimEnd();
    if (/^#{1,3}\s*부\s*칙/.test(l)) break;                                                       // the 부칙 number their own articles again
    const ch = /^#{2,3}\s+(제\s*\d+\s*[편장]\S*\s+.+)$/.exec(l); if (ch) { chapter = ch[1].replace(/\s+/g, ' ').trim(); cur = null; continue; }
    if (/^#{3,4}\s+제\s*\d+\s*[절관]/.test(l)) { cur = null; continue; }
    const a = /^#{4,6}\s+제(\d{1,4})조(?:의(\d{1,3}))?\s*(?:\((.*)\))?\s*$/.exec(l);   // (a title in double brackets too: ((목적)))
    if (a) { cur = { art: Number(a[1]), sub: a[2] ? Number(a[2]) : 0, title: (a[3] || '').replace(/^\((.*)\)$/, '$1').trim(), chapter, lines: [] }; arts.push(cur); continue; }
    if (!arts.length && !chapter && /^전\s*문$/.test(l.trim())) { pre = []; continue; }   // 헌법's preamble, before its first chapter
    if (pre && !arts.length && !chapter && l.trim() && !/^#/.test(l)) { pre.push(mdLine(l)); continue; }
    if (/^#/.test(l)) { cur = null; continue; }
    if (cur && l.trim()) cur.lines.push(mdLine(l));
  }
  return { preamble: pre ? pre.join('\n') : '', page: head['출처'] || '', name: head['제목'] || '', rev: String(head['시행일자'] || '').replace(/-/g, ''), promulgated: head['공포일자'] || '', mst: head['법령MST'] || '',
    num: String(head['공포번호'] || '').replace(/^0+/, ''), type: head['법령구분'] || '', arts: arts.map((x) => ({ art: x.art, sub: x.sub, title: x.title, chapter: x.chapter, text: x.lines.join('\n') })) };
}
// today in Korea, as 20261125
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
// the text in force today, when the newest is not yet: the versions before it in the repository's history, newest first.
// Every version passed on the way that is not in force either is a coming amendment too: all of them come back, by date
// The file's versions come through the shelf's server first (its six-hour copy of GitHub's list: api.lawGitCommits), then
// from GitHub itself (60 asks an hour from one address — a school's shared address can run out). When neither answers,
// the record worked out beforehand (lawhist/, the owner's 76 laws) gives each article as it stands today (builtInForce):
// the text in force is shown, the coming one beside it, as when the list is had — never the coming text as today's.
async function inForce(dir, file, now, head) {
  let list = null;
  try { list = await versionList(dir, file, { want: ymdDash(head.promulgated) }); } catch (e) { list = null; }
  if (list && list.length) {
    const coming = [head], p = ymdDash(head.promulgated);
    let skipped = false, tries = 0;
    for (const v of list) {   // (newest first: the version shown is the newest; those before it, until one in force)
      if (p && v.d && v.d > p) continue;
      if (!skipped && (!p || v.d === p)) { skipped = true; continue; }
      skipped = true;
      if (++tries > 5) break;
      const md = await mirrorFile(dir, file, v.sha).catch(() => null);
      if (!md) continue;
      const got = mirrorArts(md);
      if (!got.arts.length || !got.rev) continue;
      if (got.rev <= now) return { cur: { ...got, byls: attachments(md) }, coming: coming.sort((x, y) => x.rev.localeCompare(y.rev)) };
      if (!coming.some((x) => x.rev === got.rev)) coming.push(got);
    }
  }
  const built = await builtInForce(dir, file, head, now).catch(() => null);
  return built ? { cur: built, coming: [head], built: true } : null;
}
// each article as it stands today, from the record worked out beforehand: of its versions (newest first), the newest in
// force today (시행일 on or before today); an article only the coming text has is not in it. null: not one of those laws
async function builtInForce(dir, file, head, now) {
  const idx = await histIndex();
  const e = idx && idx.laws && idx.laws[dir];
  if (!e || (file && e[0] !== file) || !head || !head.arts) return null;
  // (a record made before the newest text was promulgated may lack a version that came between: not one to build today's from)
  const hp = ymdDash(head.promulgated);
  if (!hp || !e[3] || e[3] < hp) return null;
  const tens = [...new Set(head.arts.map((a) => Math.floor(a.art / 10)))];
  const files = await Promise.all(tens.map((t) => histFile(dir, e[0], t, idx).catch(() => null)));
  if (files.some((f) => !f)) return null;   // (a file not reached: not a law to be shown in part)
  const today = `${now.slice(0, 4)}-${now.slice(4, 6)}-${now.slice(6, 8)}`;
  const chapters = new Map(head.arts.map((a) => [a.art * 1000 + a.sub, a.chapter]));
  const arts = [];
  let rev = '', prom = '';
  for (const f of files) {
    for (const [k, list] of Object.entries(f.arts || {})) {
      const x = (list || []).find((v) => (v.eff || v.d) && (v.eff || v.d) <= today);
      if (!x || x.gone) continue;
      const [art, sub] = k.split('-').map(Number);
      arts.push({ art, sub: sub || 0, title: x.title || '', chapter: chapters.get(art * 1000 + (sub || 0)) || '', text: x.text || '' });
      if ((x.eff || '') > rev) rev = x.eff || '';
      if ((x.d || '') > prom) prom = x.d || '';
    }
  }
  if (!arts.length) return null;
  arts.sort((x, y) => x.art - y.art || x.sub - y.sub);
  return { name: head.name, rev: rev.replace(/-/g, ''), arts, promulgated: prom, num: '', mst: head.mst, type: head.type, page: head.page, preamble: head.preamble };
}
const lawView = (key, k) => ({ key, title: `${k.full}${k.rev ? ` (${ymd(k.rev)} 시행)` : ''}`, rev: k.rev, full: k.full, preamble: k.preamble || '', page: k.page || '', arts: k.arts, src: k.src, next: k.next || null, later: k.later || [], ahead: !!k.ahead, files: k.files || null, dir: k.dir || '',
  file: k.file || '', promulgated: k.promulgated || '', num: k.num || '', type: k.type || '', bytes: k.bytes || 0, ...(k.built ? { built: true } : {}), ...(k.byls ? { byls: k.byls } : {}) });   // (the version shown: its file in the mirror, 공포일자, 공포번호, size)
async function loadAny(key, asked) {
  const kept = await store.get('kv', 'law:' + key).catch(() => null);
  const ok = kept && kept.v === 5 && kept.arts;
  const now = today();
  const fresh = ok && Date.now() - kept.at < (kept.ahead || kept.built ? 3600e3 : 3 * 864e5) && !(kept.next && kept.next.rev <= now) && !(kept.ahead && kept.rev <= now);
  if (ok && (fresh || !navigator.onLine)) return lawView(key, kept);
  if (!navigator.onLine) throw fail('offline');
  try {
    const hit = await resolveLaw(asked);
    let md = hit ? await mirrorFile(hit.dir, hit.file) : null;
    if (!md) { if (drfReady()) return await loadDrf(key, asked); throw fail('nolaw'); }
    let got = mirrorArts(md);
    // two files of one kind ("법률" and "법률(법률)": two laws of the same name): the latest promulgated is the one that
    // stands — the plain name is often an old law's repeal record (근로기준법, 1997) or an old text (헌법재판소법, 1998) beside
    // the law in force; when the latest is itself a repeal record, the law is gone (검찰청법, repealed 2026. 10. 2.)
    const stub = (g, t) => g.arts.length <= 1 && /이를\s*폐지한다|은\s*폐지한다/.test(t.slice(0, 1500));
    for (const alt of (hit.cands || []).slice(1)) {
      const m2 = await mirrorFile(hit.dir, alt).catch(() => null);
      if (!m2) continue;
      const g2 = mirrorArts(m2), p1 = got.promulgated || '', p2 = g2.promulgated || '';
      if (p2 > p1 || (p2 === p1 && stub(got, md) && !stub(g2, m2))) { md = m2; got = g2; hit.file = alt; }
    }
    if (stub(got, md)) throw Object.assign(fail('repealed'), { date: got.rev || got.promulgated });   // (the day the repeal took effect)
    if (!got.arts.length) throw fail('unavailable');
    let rec = { v: 5, at: Date.now(), full: got.name || hit.name || asked, rev: got.rev, mst: got.mst, arts: got.arts, preamble: got.preamble, page: got.page, dir: hit.dir, file: hit.file, files: hit.files || null, src: 'legalize-kr',
      promulgated: got.promulgated, num: got.num, type: got.type, bytes: u8(md), byls: attachments(md) };   // (bytes: what one version of it costs to read; byls: its 별표)
    if (got.rev && got.rev > now) {   // the newest text is not in force yet: today's text first, the nearest coming one beside it
      // (a text in force found before is kept while the newest stays the same — not one only the record gave: asked again)
      if (ok && kept.mst === got.mst && kept.next && !kept.built) rec = { ...rec, full: kept.full, rev: kept.rev, arts: kept.arts, next: kept.next, later: kept.later || [], promulgated: kept.promulgated || '', num: kept.num || '', ...(kept.byls ? { byls: kept.byls } : {}) };
      else {
        const found = await inForce(hit.dir, hit.file, now, got).catch(() => null);
        if (found) {
          const [near, ...rest] = found.coming;
          rec = { ...rec, full: found.cur.name || rec.full, rev: found.cur.rev, arts: found.cur.arts, next: { rev: near.rev, promulgated: near.promulgated, arts: near.arts }, later: rest.map((x) => x.rev), promulgated: found.cur.promulgated, num: found.cur.num, ...(found.built ? { built: true } : {}), ...(found.cur.byls ? { byls: found.cur.byls } : {}) };   // (its 별표: those of the text in force)
        } else rec.ahead = true;   // shown as it will read, and marked so (L1 folds it under '현행 판 다시 찾기': law.ahead)
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
// what a paragraph's coming text adds ('+') and drops ('-') against today's ('='), for 신구 대비 in place — and for each
// version of an article's 연혁 against the one before. Compared word by word: a word (letters and digits together: 180일,
// 제93조제1항), a run of spaces or one mark is one piece, so a change reads whole — '선거일전 180일' struck and '선거일 전
// 120일' put in, never 선거일~~전 18~~ 전 12 0일. Within a change: what only spacing moved is no change (the new spacing
// shown); a word that only gains (or loses) letters inside shows just those (우주항공청장이 → 우주항공청장(…말한다)이: only
// "(…말한다)"); and one long word (more than 8 letters) changed into another is compared letter by letter inside it.
// A space or a mark the same between two changes is folded into them, so a phrase rewritten reads as one.
// (ㆍ, the 법령's list dot, is a letter to Unicode: it is a mark here, so '정당ㆍ후보자' is two words and a dot between them)
const PIECE = /\s+|(?:(?!ㆍ)[\p{L}\p{N}])+|\S/gu;
export function wordDiff(before, after) {
  const A = String(before || ''), B = String(after || '');
  const a = A.match(PIECE) || [], b = B.match(PIECE) || [];
  const n = a.length, m = b.length;
  if (n && m && n * m > 400000 && /\n/.test(A) && /\n/.test(B)) return lineDiff(A, B);   // (a 항 of many 호 and 목: line by line)
  if (!n || !m || n * m > 400000) return [['-', A], ['+', B]].filter((x) => x[1]);
  const ops = lcsRuns(a, b);
  // (a short piece left the same between two changes is folded into them: a space, a mark, one short word)
  const folded = [];
  for (let k = 0; k < ops.length; k++) {
    const x = ops[k];
    const short = x[0] === '=' && k > 0 && k < ops.length - 1 && ops[k - 1][0] !== '=' && ops[k + 1][0] !== '='
      && /^\s*(?:(?:[^\s\p{L}\p{N}]|ㆍ)\s*)?$/u.test(x[1].join(''));   // (spaces, or one mark: a word the same between two changes is kept)
    if (short) folded.push(['-', x[1]], ['+', x[1]]); else folded.push(x);
  }
  const out = [];
  const push = (k, t) => { if (!t) return; const l = out[out.length - 1]; if (l && l[0] === k) l[1] += t; else out.push([k, t]); };
  for (let k = 0; k < folded.length;) {
    if (folded[k][0] === '=') { push('=', folded[k][1].join('')); k++; continue; }
    let del = [], ins = [];
    while (k < folded.length && folded[k][0] !== '=') { if (folded[k][0] === '-') del = del.concat(folded[k][1]); else ins = ins.concat(folded[k][1]); k++; }
    // (the same whole pieces at either end stay the same)
    let p = 0; while (p < del.length && p < ins.length && del[p] === ins[p]) p++;
    let q = 0; while (q < del.length - p && q < ins.length - p && del[del.length - 1 - q] === ins[ins.length - 1 - q]) q++;
    push('=', del.slice(0, p).join(''));
    const D = del.slice(p, del.length - q), I = ins.slice(p, ins.length - q);
    for (const [kind, t] of changeOf(D, I)) push(kind, t);
    push('=', del.slice(del.length - q).join(''));
  }
  return out;
}
// the longest common run of pieces, as runs: [['=', pieces], ['-', pieces], ['+', pieces] …]
function lcsRuns(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  const push = (k, t) => { const l = out[out.length - 1]; if (l && l[0] === k) l[1].push(t); else out.push([k, [t]]); };
  let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { push('=', a[i]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) push('-', a[i++]); else push('+', b[j++]); }
  while (i < n) push('-', a[i++]);
  while (j < m) push('+', b[j++]);
  return out;
}
// one change, its pieces dropped (D) and put in (I): how it is shown
function changeOf(D, I) {
  const d = D.join(''), t = I.join('');
  if (!d || !t) return [['-', d], ['+', t]].filter((x) => x[1]);
  if (flat(d) === flat(t)) return [['=', t]];   // (only the spacing moved: no change — 선거일전 → 선거일 전)
  // (letters only put in, or only taken out, inside: those alone)
  let p = 0; while (p < d.length && p < t.length && d[p] === t[p]) p++;
  let q = 0; while (q < d.length - p && q < t.length - p && d[d.length - 1 - q] === t[t.length - 1 - q]) q++;
  if (p + q === d.length && /\S/.test(t.slice(p, t.length - q))) return [['=', d.slice(0, p)], ['+', t.slice(p, t.length - q)], ['=', d.slice(p)]].filter((x) => x[1]);
  if (p + q === t.length && /\S/.test(d.slice(p, d.length - q))) return [['=', t.slice(0, p)], ['-', d.slice(p, d.length - q)], ['=', t.slice(p)]].filter((x) => x[1]);
  // (one long word changed into another: compared letter by letter inside it)
  // (or a long word split or joined by a space as well: 선거관리위원회규칙으로정한다 → 중앙선거관리위원회규칙으로 정한다)
  if ((D.length === 1 || I.length === 1) && D.length <= 3 && I.length <= 3 && d.length > 8 && t.length > 8 && /\S/.test(d) && /\S/.test(t)) return letterDiff(d, t);
  return [['-', d], ['+', t]];
}
// letter by letter, the stray one- and two-letter matches inside a change folded into it, and a pair of changes keeping
// out the letters they share at either end (the comparison before words were its pieces; now only inside one long word)
function letterDiff(A, B) {
  const a = [...A], b = [...B];
  const n = a.length, m = b.length;
  if (n * m > 400000) return [['-', A], ['+', B]];
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let out = [];
  const push = (list, k, t) => { const l = list[list.length - 1]; if (l && l[0] === k) l[1] += t; else list.push([k, t]); };
  let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { push(out, '=', a[i]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) push(out, '-', a[i++]); else push(out, '+', b[j++]); }
  while (i < n) push(out, '-', a[i++]);
  while (j < m) push(out, '+', b[j++]);
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
// a paragraph too long to be compared letter by letter or word by word (공직선거법 제112조 ②: 6,000 letters, 2,700 words, in
// 44 lines): its lines (호, 목) are matched first, spaces aside, and only the lines that differ are compared within — the whole
// paragraph struck out and written again would hide a one-목 change. In a run of differing lines the first dropped goes with
// the first added, and so on; what is left over is dropped or added whole
function lineDiff(A, B) {
  const a = A.split('\n'), b = B.split('\n'), fa = a.map(flat), fb = b.map(flat);
  const n = a.length, m = b.length;
  if (n * m > 400000) return [['-', A], ['+', B]];
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = fa[i] === fb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const rows = [];
  let del = [], ins = [];
  const flush = () => {
    for (let k = 0; k < Math.max(del.length, ins.length); k++) rows.push(k < del.length && k < ins.length ? { r: wordDiff(del[k], ins[k]), a: 1, b: 1 } : k < del.length ? { r: [['-', del[k]]], a: 1 } : { r: [['+', ins[k]]], b: 1 });
    del = []; ins = [];
  };
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && fa[i] === fb[j]) { flush(); rows.push({ r: [['=', b[j]]], a: 1, b: 1 }); i++; j++; }
    else if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) del.push(a[i++]);
    else ins.push(b[j++]);
  }
  flush();
  const out = [];
  const push = (k, t) => { if (!t) return; const l = out[out.length - 1]; if (l && l[0] === k) l[1] += t; else out.push([k, t]); };
  // (the line break before a row is the before text's when the row is in it and a row of it came earlier, the after text's
  // likewise: a line dropped or added brings its own — '=' between two lines kept — so no blank line is left where a 호 went)
  let seenA = false, seenB = false;
  for (const { r, a: inA, b: inB } of rows) {
    const nA = !!inA && seenA, nB = !!inB && seenB;
    if (nA || nB) push(nA && nB ? '=' : nA ? '-' : '+', '\n');
    for (const [kind, t] of r) push(kind, t);
    seenA = seenA || !!inA; seenB = seenB || !!inB;
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

/* ---------------- 조문 연혁: when an article changed, and how ----------------
   Each promulgation is a commit of the mirror, and each version's head gives its 공포일자, 공포번호 and 시행일자; an article's
   연혁 is the versions in which it reads differently from the one before (titles and texts compared as above, spaces aside),
   newest first, down to the version its record starts with: the mirror's first, its 신설, or the 전부개정 that wrote the law
   anew under new numbers (what a number meant before that is another article).
   A phone must not work this out by reading versions: 공직선거법 has 84 in the mirror (2005–2026), each 0.5–0.8 MB, 58 MB in
   all; 헌법재판소법 24 (1988–2026), 41–66 KB each. So for the laws of the owner's research and the app's core laws (76) the
   site's weekly workflow works it out (_tools/law_hist.py → lawhist/: one file for ten articles, 118 KB on average for
   공직선거법, 9 KB as sent), and the device reads one file. For any other law it is found here only when the fold is opened,
   within a budget: GitHub lists the file's versions (one call, kept a week — 60 calls an hour are allowed from one address),
   and only the versions a search between them needs are read, comparing this article alone, the newest change first
   (정당법 제22조, six changes in the 18 versions since its 2005 전부개정: 14 versions read, 0.7 MB, in two rounds); what a
   round leaves is searched on when asked (더 찾기). A law larger than LIVE.big is not searched here at all (the page at
   국가법령정보센터 instead). A change undone by a later one (A → B → A) is missed here, not by the workflow. */
const ymdDash = (s) => { const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(String(s || '').trim()); return m ? `${m[1]}-${m[2]}-${m[3]}` : ''; };
// what an article reads as, for telling its versions apart: the mirror's texts carry 법제처's pictures as markup
// (<img src="…flDownload.do?flSeq=7399353" …>()</img>: the ㉥ of 공직선거법 제179조), whose file numbers, empty "()" and
// "null" come and go between versions with no amendment; and 법제처 spelled 란 and 난 (투표용지의 란) one way and the other
// in versions that did not touch the article. Neither is a change: the pictures are left out, the two spellings read as one,
// spaces aside (shelf/_tools/law_hist.py compares the same way)
// (a picture put in brackets, "(㉥)" for "㉥", is none either; a picture's own text — a table drawn in letters inside it — is
// compared as text)
const IMG = /<img\b[^>]*>(?:(?:null|\(\))?<\/img>)?/g;
export const histSig = (title, text) => `${String(title || '').replace(/난/g, '란')}|${flat(String(text || '').replace(IMG, '\u0000').replace(/<\/img>/g, '')).replace(/\(\u0000\)/g, '').replace(/\u0000/g, '').replace(/난/g, '란')}`;
// an article's text as the 연혁 shows it: each picture as 〔그림〕, not its markup
export const histText = (t) => String(t || '').replace(IMG, '〔그림〕').replace(/\n?<\/img>/g, '');
let histIdx = null, histNext = 0, histMiss = false;   // (asked once in six hours; see below after a failure)
// lawhist/index.json: folder → [file, versions, first 공포일자, last 공포일자, articles]. Not reached (a slow phone past the
// service worker's four seconds, a glitch; and when none is made yet — the service worker answers a missing file as a failed
// one): asked again once, a moment later, and then not for a minute, unless again (an article's 연혁 being opened), so one
// failure does not send the laws worked out beforehand to be searched on the device. histMiss: nothing to go by at all
function histIndex(again = false) {
  if (histIdx && Date.now() < histNext && !(again && histMiss)) return histIdx;
  histNext = Date.now() + 6 * 3600e3; histMiss = false;
  histIdx = (async () => {
    const kept = await store.get('kv', 'lawhist:index').catch(() => null);
    if (kept && kept.idx && (Date.now() - kept.at < 6 * 3600e3 || !navigator.onLine)) return kept.idx;
    for (let k = 0; k < 2; k++) {
      try {
        const r = await fetch(new URL('./lawhist/index.json', import.meta.url), { cache: 'no-cache' });
        const idx = r.ok ? await r.json() : null;
        if (!idx || !idx.laws) throw new Error(String(r.status));
        store.put('kv', 'lawhist:index', { at: Date.now(), idx }).catch(() => {});
        return idx;
      } catch (e) { if (!k && navigator.onLine) await new Promise((ok) => setTimeout(ok, 1500)); else break; }
    }
    if (kept && kept.idx) { histNext = Date.now() + 10 * 60e3; return kept.idx; }   // (last time's, until it is reached)
    histNext = Date.now() + 60e3; histMiss = true;
    return null;
  })();
  return histIdx;
}
const artKey = (a) => (a.sub ? `${a.art}-${a.sub}` : String(a.art));
// one file of the record (the articles of a ten: 9.json holds 제90조 … 제99조), kept here for the record it came with.
// strict: null when it cannot be had (for builtInForce, which must have every file); else an empty one
async function histFile(dir, file, t, idx, strict = true) {
  const key = `lawhist:${dir}/${file}/${t}`;
  const kept = await store.get('kv', key).catch(() => null);
  if (kept && kept.built === idx.built && kept.d) return kept.d;
  try {
    const r = await fetch(new URL(`./lawhist/${encodeURIComponent(dir)}/${encodeURIComponent(file)}/${t}.json`, import.meta.url), { cache: 'no-cache' });
    if (r.status === 404) return { arts: {} };   // (none: none of these ten articles was in the law when the record was made)
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    store.put('kv', key, { built: idx.built, d }).catch(() => {});
    return d;
  } catch (err) { if (kept && kept.d) return kept.d; if (strict) return null; return { arts: {} }; }
}
async function builtHistory(dir, file, a, again = false) {
  const idx = await histIndex(again);
  const e = idx && idx.laws && idx.laws[dir];
  if (!e || (file && e[0] !== file)) return null;
  const d = await histFile(dir, e[0], Math.floor(a.art / 10), idx, false);
  const list = (d.arts && d.arts[artKey(a)]) || [];
  return { list, type: d.type || '', n: e[1], from: e[2], last: e[3] || '', src: 'built', done: true };
}
// where the record begins later than the law: the mirror keeps a law under today's name only, so a law renamed keeps no
// version from before its rename (공직선거법: 2005. 8. 4., its 1994–2005 versions as 공직선거및선거부정방지법 are not there);
// and a record that starts with no 제정 or 전부개정 (how 'start') has had versions before it too. Said, with where to look
// (국가법령정보센터 keeps each article's 연혁 across a rename): { gap: { before, was, since, text, url } } — and gap: true
// on the first entry; {} when the record starts with the law itself
// (also wholeAt: a record that starts at a 전부개정 of the same name — 행정소송법 1984 — says when, so the text of the same
// number before it, another article, can be asked for by that day: versionAt(law, art, the day before, …))
function gapOf(h, dir, law, x) {
  const list = h && h.list, base = list && list.length && (h.done || h.src === 'built') ? list[list.length - 1] : null;
  if (!base || base.how === 'new') return h;
  const ren = Object.entries(OLD_LAWS).find(([, o]) => o.now && !o.gone && dirOf(resolveName(NAME_NORM(o.now)) || o.now) === dir && dayOf(o.date) === base.d);
  const wholeKind = base.how === 'whole' && /^(?:전부개정|폐지제정)$/.test(base.kind || '');
  if (wholeKind && !ren) return { ...h, wholeAt: { d: base.d, kind: base.kind } };
  if (base.how !== 'start' && !(base.how === 'whole' && ren)) return h;
  const before = base.d || h.from || '', was = ren ? ren[0] : '';
  return { ...h, list: [...list.slice(0, -1), { ...base, gap: true }], gap: { before, was, since: ren && ren[1].since ? ren[1].since : '', whole: base.how === 'whole',
    text: `${dotDay(before)} 이전 기록${was ? `(${was} 때)` : ''}은 국가법령정보센터 연혁에서`, url: lawGoKr.article(law.full, x.art, x.sub) } };
}
// the version shown, as an entry of the record (one made after the record: this week's amendment)
const shownEntry = (law, x) => ({ d: ymdDash(law.promulgated), no: law.num || '', kind: '', eff: ymdDash(law.rev), title: x.title, text: x.text, fresh: true });
// a record made before the version shown: when that version changed the article, it comes first
function fresher(h, law, x) {
  const p = ymdDash(law.promulgated);
  if (!h.list.length || !p || !(p > h.list[0].d)) return h;   // (the record reaches the version shown)
  const top = h.list[0];
  if (!top.gone && histSig(top.title, top.text) === histSig(x.title, x.text)) return h;   // (amended since, this article as it was)
  return { ...h, list: [shownEntry(law, x), ...h.list] };
}
// the file's versions in the mirror, newest first, each with the kind of change and the day of its commit (the 공포일자).
// Kept a week; asked again sooner when the text shown is newer than the newest version listed (an amendment since). only:
// what is kept, never asked
async function versionList(dir, file, { want = '', only = false } = {}) {
  const path = `kr/${dir}/${file}.md`, key = 'lawvers:' + path;
  const kept = await store.get('kv', key).catch(() => null);
  const has = !!(kept && Array.isArray(kept.list) && kept.list.length);
  const behind = has && want && kept.list[0].d && kept.list[0].d < want && Date.now() - kept.at > 3600e3;
  if (has && (only || !navigator.onLine || (Date.now() - kept.at < 7 * 864e5 && !behind))) return kept.list;
  if (only) return null;
  if (!navigator.onLine) throw fail('offline');
  const list = [];
  const take = (got) => {
    for (const c of got) {
      if (!c || !/^[0-9a-f]{40}$/.test(c.sha || '')) continue;
      const at = String(((c.commit && (c.commit.author || c.commit.committer)) || {}).date || '');
      list.push({ sha: c.sha, kind: (/\(([^()]*)\)\s*$/.exec(String((c.commit && c.commit.message) || '').split('\n')[0]) || [])[1] || '', d: /^\d{4}-\d{2}-\d{2}/.test(at) ? at.slice(0, 10) : '' });
    }
  };
  // (the shelf's server first: its copy, kept six hours, spares GitHub's hourly allowance; a server without it says null)
  const viaServer = typeof api.lawGitCommits === 'function' && api.hasToken() && api.base() ? await api.lawGitCommits(path).catch(() => null) : null;
  if (Array.isArray(viaServer) && viaServer.length) take(viaServer);
  else {
    for (let pg = 1; pg <= 3; pg++) {
      let r = null;
      try { r = await fetch(`${HIST}?path=${encodeURIComponent(path)}&per_page=100&page=${pg}`, { headers: { Accept: 'application/vnd.github+json' } }); } catch (e) { /* below */ }
      if (!r || !r.ok) { if (has) return kept.list; throw fail(r && (r.status === 403 || r.status === 429) ? 'busy' : 'unavailable'); }
      const got = await r.json().catch(() => null);
      if (!Array.isArray(got)) { if (has) return kept.list; throw fail('unavailable'); }
      take(got);
      if (got.length < 100) break;
    }
  }
  // (the commits' order is not always their days': in 16 files a version backfilled later stands before newer ones, and a
  // commit that only put the newest text back names no kind of change — by day, newest first, without such commits;
  // an unknown day, 1970-01-01, is only ever a law's first versions)
  const byDay = list.map((v, i) => [v, i]).filter(([v]) => v.kind).sort((p, q) => (q[0].d || '').localeCompare(p[0].d || '') || p[1] - q[1]).map(([v]) => v);
  if (!byDay.length && has) return kept.list;
  store.put('kv', key, { at: Date.now(), list: byDay }).catch(() => {});
  return byDay;
}
// what one round may read (versions, and their size in UTF-8: a law of 50 KB, a round of 0.6 MB); a law larger than big is
// not read version by version on this device
const LIVE = { reads: 12, bytes: 3e6, big: 6e5 };
const WHOLE = /^(?:제정|전부개정|폐지제정)$/;   // (a version that writes the law anew: an article's record starts there)
const lives = new Map(), rounds = new Map();
// peek: what earlier rounds found (kept here), nothing asked or read; null when this article was never searched.
// One round at a time for an article: a card left while its round runs does not stop it, and the card drawn again (the
// article asked once more) shares its state — a second round beside it would take the first one's segments off the list
// under it, end with changes missing, and keep that as finished. A round asked meanwhile waits for the one running
function liveHistory(dir, file, a, opt = {}) {
  if (opt.peek) return liveRound(dir, file, a, opt);
  const id = `${dir}/${file}|${artKey(a)}`;
  const run = (rounds.get(id) || Promise.resolve()).catch(() => {}).then(() => liveRound(dir, file, a, opt));
  const tail = run.catch(() => {});
  rounds.set(id, tail);
  tail.then(() => { if (rounds.get(id) === tail) rounds.delete(id); });
  return run;
}
async function liveRound(dir, file, a, { onStep, want = '', bytes = 0, peek = false } = {}) {
  const id = `${dir}/${file}|${artKey(a)}`;
  const vs = await versionList(dir, file, { want, only: peek });
  if (!vs || !vs.length) return null;
  let s = lives.get(id);
  if (!s || s.head !== vs[0].sha) {
    const kept = await store.get('kv', 'arthist:' + id).catch(() => null);
    if (kept && kept.head === vs[0].sha) s = { ...kept, at: new Map(kept.at) };
    else if (peek) return null;
    else {
      const b = vs.findIndex((v) => WHOLE.test(v.kind));
      s = { head: vs[0].sha, vs: vs.slice(0, b < 0 ? vs.length : b + 1), at: new Map(), found: [], todo: null, big: false };
    }
    lives.set(id, s);
  }
  if (peek && !s.todo && !s.big) return null;
  if (bytes > LIVE.big) s.big = true;
  const spent = { reads: 0, bytes: 0 };
  const get = async (i) => {
    if (s.at.has(i)) return s.at.get(i);
    const md = await mirrorFile(dir, file, s.vs[i].sha);
    const n = md ? u8(md) : 0;
    spent.reads++; spent.bytes += n;
    if (n > LIVE.big) s.big = true;
    const g = md ? mirrorArts(md) : null, x = g && g.arts.find((y) => y.art === a.art && y.sub === a.sub);
    const v = { d: ymdDash(g && g.promulgated) || s.vs[i].d || '', no: (g && g.num) || '', eff: ymdDash(g && g.rev), type: (g && g.type) || '', x: x ? { title: x.title, text: x.text } : null };
    s.at.set(i, v);
    if (onStep) onStep(s.at.size, s.vs.length);
    return v;
  };
  const sig = (v) => (v.x ? histSig(v.x.title, v.x.text) : '');
  const L = s.vs.length - 1;
  let err = null;
  if (!peek && !s.big) {
    try {
      if (!s.todo) { await get(0); if (!s.big && L > 0) await get(L); if (!s.big) s.todo = L > 0 ? [[0, L]] : []; }
      while (s.todo && s.todo.length && !s.big && spent.reads < LIVE.reads && spent.bytes < LIVE.bytes) {
        const [lo, hi] = s.todo[s.todo.length - 1];   // (the segment nearer today is on top: the newest changes are found first)
        const A = await get(lo), B = await get(hi);
        if (sig(A) === sig(B)) { s.todo.pop(); continue; }   // (the same at both ends: taken as unchanged between — a change undone later is missed)
        if (hi - lo === 1) { s.todo.pop(); s.found.push(lo); continue; }
        const mid = (lo + hi) >> 1;
        await get(mid);
        s.todo.pop(); s.todo.push([mid, hi], [lo, mid]);
      }
    } catch (e) {   // (a version that could not be read ends the round there: its segment stays on the list, what was found stays found)
      err = e && e.code ? e : fail('unavailable');
    } finally {
      store.put('kv', 'arthist:' + id, { head: s.head, vs: s.vs, at: [...s.at], found: s.found, todo: s.todo, big: s.big }).catch(() => {});
    }
  }
  const entry = (i, how) => { const v = s.at.get(i); return { d: v.d, no: v.no, kind: s.vs[i].kind, eff: v.eff, ...(v.type ? { type: v.type } : {}), ...(v.x ? { title: v.x.title, text: v.x.text } : { gone: true }), ...(how ? { how } : {}) }; };
  const list = [...new Set(s.found)].sort((p, q) => p - q).map((i) => {
    const before = s.at.get(i + 1), e = entry(i, before && !before.x ? 'new' : '');
    return before && before.x ? { ...e, before: before.x } : e;   // (the text it replaced, for the marks: the version just before)
  });
  const done = !!s.todo && !s.todo.length && !s.big;
  const base = s.at.get(L);
  if (done && base && base.x) list.push(entry(L, WHOLE.test(s.vs[L].kind) ? 'whole' : 'start'));
  return { list, src: 'live', done, big: s.big, read: s.at.size, n: s.vs.length, from: done && base ? base.d : '', ...(err ? { err: err.code, net: !!err.net } : {}) };
}
// the 연혁 of an article as the card shows it: { list (newest first), src 'built' | 'live', done, … }; null when the law is not
// one the mirror keeps (a text from 국가법령정보 itself). A law not worked out beforehand is searched only when asked (live);
// until then what an earlier search found here is shown, or { idle } (and big, when it is too large to be searched here)
export async function artHistory(law, x, opt = {}) {
  const h = await artHistoryOf(law, x, opt);
  if (!h || !law || !x) return h;
  const own = LAWS[law.key];
  return gapOf(h, law.dir || (own ? dirOf(own.full) : ''), law, x);
}
async function artHistoryOf(law, x, { live = false, onStep } = {}) {
  if (!law || !x || typeof x.art !== 'number') return null;
  const own = LAWS[law.key];
  let dir = law.dir || (own ? dirOf(own.full) : ''), file = law.file || '';
  if (!dir || (!own && law.src !== 'legalize-kr')) return null;
  let b = await builtHistory(dir, file, x).catch(() => null);
  // (the index not reached when the card was drawn: asked again now that the fold is opened, before searching on the device)
  if (!b && histMiss && live) b = await builtHistory(dir, file, x, true).catch(() => null);
  if (b && b.list.length) return fresher(b, law, x);
  const want = ymdDash(law.promulgated);
  if (b && b.last && want > b.last) return { ...b, list: [{ ...shownEntry(law, x), how: 'new' }] };   // (an article added since the record was made)
  let bytes = law.bytes || 0;
  if (!live) {
    const kept = file ? await liveHistory(dir, file, x, { want, peek: true }).catch(() => null) : null;
    // (unsure: the records worked out beforehand could not be asked — this law may be among them, so not called too large yet)
    return kept || { list: [], src: 'live', done: false, idle: true, big: bytes > LIVE.big, ...(!b && histMiss ? { unsure: true } : {}) };
  }
  if (!file) {   // (the court's own texts of 헌법 and 헌법재판소법, and a law kept here from before files were noted: the mirror's file)
    const m = own ? await loadAny('mirror:' + law.key, own.full) : await resolveLaw(law.full);
    dir = (m && m.dir) || dir; file = (m && m.file) || ''; bytes = bytes || (m && m.bytes) || 0;
    if (!file) return null;
  }
  return liveHistory(dir, file, x, { onStep, want, bytes });
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
  catch (e) { throw fail(api.isOffline(e) ? noAnswer() : e && e.code === 'no_key' ? 'unregistered' : 'unavailable'); }
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
  if (!courtAsking.has(k)) courtAsking.set(k, askCourt(q.no, q.court, k).then(enbanced).finally(() => courtAsking.delete(k)));
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
  // (a third part names the folder when the mirror keeps the judgment under the other level's: a 고등법원 judgment under 대법원/)
  const list = all.split(';').map((e) => { const [cat, stem, lv] = e.split('|'); const c = stem.split('_')[0]; return { cat, stem, court: c, sup: c === '대법원', lv }; });
  const want = courtName(court), lower = list.filter((x) => !x.sup);
  const pick = !want ? list[0] : list.find((x) => courtName(x.court) === want) || (want !== '대법원' && lower.length === 1 ? lower[0] : null);
  if (!pick) return null;
  const r = await fetch(PREC + encodeURIComponent(pick.cat) + '/' + encodeURIComponent(pick.lv === '대법원' || pick.lv === '하급심' ? pick.lv : pick.sup ? '대법원' : '하급심') + '/' + encodeURIComponent(pick.stem) + '.md');
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
  // a judgment read stays; 'not there' is asked again after three days, and at once when it was said before the year index
  // learnt the numbers written oddly in the mirror's file names (v 3)
  if (kept && (((kept.v === 3 || kept.v === 4) && kept.d) || (kept.v === 4 && Date.now() - kept.at < 3 * 864e5))) return kept.d;
  if (!navigator.onLine) { if (kept && kept.d) return kept.d; throw fail('offline'); }
  let d;
  try { d = await mirrorCourt(no, court); } catch (e) { if (kept && kept.d) return kept.d; throw e; }
  if (d === null && drfReady()) d = await drfCourt(no).catch(() => null);   // not in the mirror: 국가법령정보, once it answers us
  await store.put('kv', 'court:' + k, { v: 4, at: Date.now(), d }).catch(() => {});
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
// 대법원 2018. 11. 1. 선고 2016도10912 전원합의체 판결 — the whole court's judgment is cited as such, or the footnote is wrong
export const courtCite = (d) => `${d.courtName || '법원'} ${d.date ? d.date + (d.kind === '결정' ? '자 ' : ' 선고 ') : ''}${d.no} ${d.enbanc ? '전원합의체 ' : ''}${d.kind || '판결'}`;
// 전원합의체, read from the judgment itself: the whole court signs it (대법원장 presiding, with eight justices or more — the
// Chief Justice sits in no 소부, which is four), or it has opinions besides the court's ([다수의견] · [반대의견] · [별개의견],
// "반대의견이 있는 외에는"), which a 소부 never has (it decides as one), or it changes a precedent, which only the whole court
// may (법원조직법 제7조 제1항 제3호). '전원합의체' alone is no sign: a 소부's judgment names the whole court's by it. A judgment
// the index (precq) lists as 전원합의체 — signed so, or cited so by another — is marked by markEnbanc when its row is shown;
// but the index is wrong for some (its builder took a mirror's repeated names, a presiding justice written as 대법원장, or
// "…는 해외출장으로 서명날인 불능" for more signers: 99다68584, 2009마218, 95누4155), so a judgment whose own signature is a
// 소부's (three to five justices, from 1961) is cited as the 소부's whatever the index says. Before 1961 the court was small and
// its whole bench signed with five too (4285행상1, 대법원장 김병로 presiding), so there the index decides. (_tools/prec_search.py
// reads the same.)
const EN_BANC = new Set();
export const markEnbanc = (no) => { if (no) EN_BANC.add(String(no).replace(/\s+/g, '')); };
// how many justices signed: the distinct names on the judgment's last line (before the 【판례적용 주의】 note the mirror adds
// after a rule) — null when that line is no signature. "대법원  장윤관(재판장)" is the mirror's split of 대법원장 윤관; a name
// written twice, and the words of an absence note, count for none
const NOT_NAME = /^(?:대법원장|대법관|대법원|재판장|주심|판사|불능|불능임|서명|날인|출장|해외|퇴직|퇴임|여행|못함|없음|없다|사유|전보|이므로)$/;
export function signers(reason) {
  const body = String(reason || '').replace(/\n\s*-{10,}\s*\n\s*【[\s\S]*$/, '').trimEnd();
  const tail = body.slice(-700), last = tail.slice(tail.lastIndexOf('\n') + 1).trim().replace(/^대법원\s+장\s*/, '대법원장 ');
  if (last.length > 300 || !/^(?:재판장\s*)?대법(?:원장|관|원판사)/.test(last)) return null;
  return new Set(last.replace(/\([^)]*\)/g, ' ').split(/\s+/).filter((w) => /^[가-힣]{2,3}$/.test(w) && !NOT_NAME.test(w))).size;
}
const yearOf = (d) => { const m = /(?:19|20)\d{2}/.exec(d.date || ''); if (m) return Number(m[0]); const y = /^(\d{2,4})/.exec(String(d.no || '')); return !y ? 0 : y[1].length === 2 ? 1900 + Number(y[1]) : Number(y[1]) >= 4200 ? Number(y[1]) - 2333 : Number(y[1]); };
export function enbancOf(d) {
  if (!d || !/^대법원/.test(String(d.courtName || '').replace(/\s+/g, ''))) return false;
  if (/전원합의체/.test(d.kind || '')) return true;
  const reason = String(d.reason || '');
  if (/\[(?:다수|반대|별개)의견\]/.test(`${d.points || ''}\n${d.summary || ''}`)) return true;
  if (/(?:반대|별개)의견이\s*있는\s*(?:것\s*)?외에는|이\s*(?:판결|결정)의\s*견해에\s*배치되는\s*범위\s*(?:내)?에서\s*(?:이를\s*)?(?:모두\s*)?변경하기로\s*한다/.test(reason)) return true;
  // (nine names or more under 대법원장, 대법관 or — in the 1960s and 70s — 대법원판사: a 소부 signs with four)
  const n = signers(reason);
  if (n !== null && n >= 9) return true;
  if (n !== null && n >= 3 && n <= 5 && yearOf(d) >= 1961) return false;
  return EN_BANC.has(String(d.no || '').replace(/\s+/g, ''));
}
// (a judgment kept here before this was read from it is told so too: the reading is the text's own)
const enbanced = (d) => { if (d && typeof d === 'object') { d.enbanc = enbancOf(d); if (d.enbanc && /전원합의체/.test(d.kind || '')) d.kind = String(d.kind).replace(/\s*전원합의체\s*/, '') || '판결'; } return d; };

/* ---------------- citations in a paper's text (parser v2) ----------------
   The law named just before 제N조. A known law (the name dictionary: every filed law, abbreviations) is matched by its longest
   name, so a long spaced name links whole ("국가를 당사자로 하는 계약에 관한 법률 제27조"); a version note "(…개정된 것)"
   between the name and 제 is stepped over. A name not in the dictionary (a repealed law, say) links as before, so it still
   opens 국가법령정보센터 and the 헌재 decisions on it. A foreign jurisdiction governing the clause ("일본 공직선거법",
   "수정헌법", "(Parliamentary Elections Act 1954)") never links to the same-named Korean law, nor does the same law cited bare
   later in the section about it (below). Lists of articles, 항 and circled numbers, 「」 names and 헌법 전문 are handled. */
const SUFFIX = /(?:법률|법|령|규칙|헌법|법전)$/;
// a foreign law written with a Korean name is not the Korean law of that name. A country must govern the name itself —
// "일본국 민법", "일본의 행정절차법", "영국 1998년 인권법", glued "수정헌법"·"연방선거법" — not merely appear in the sentence
// ("미국회사로부터 … 근로기준법 제24조", "[2] 영국 해상보험법 제33조, 상법 제693조" are Korean). "우리 민법", "현행 헌법" are Korean
// always. The one reach-back: a parenthetical source right after a statement about that same foreign law ("일본
// 형사소송법(…)도 …로 정하고 있다(형사소송법 제199조)"). 인도(引渡)·호주(戶主)·이란(…이란) are words, not countries here.
const CTRY = '일본|日本|독일|獨逸|미국|美國|프랑스|佛蘭西|영국|英國|영연방|캐나다|대만|臺灣|중국|中國|오스트리아|오스트레일리아|스위스|이탈리아|스페인|핀란드|뉴질랜드|네덜란드|벨기에|유럽연합|러시아|브라질' +
  '|싱가포르|스웨덴|노르웨이|덴마크|아이슬란드|폴란드|헝가리|체코|그리스|포르투갈|아일랜드|스코틀랜드|룩셈부르크|이스라엘|튀르키예|터키|멕시코|아르헨티나|칠레|콜롬비아|필리핀|인도네시아|태국|베트남|말레이시아|홍콩|몽골|이집트|남아프리카공화국|남아공|우크라이나' +
  '|파나마|라이베리아|마셜제도|마샬군도|바하마|몰타|키프로스|사이프러스|케이맨|버뮤다|캘리포니아|뉴욕|델라웨어|텍사스|플로리다|일리노이|하와이|뉴저지|네바다|온타리오|퀘벡';   // (ships' flags; states and provinces)
const GOVERNS = new RegExp(`(?:${CTRY})(?:국|주|(?:연방)?공화국)?(?:의)?\\s*(?:(?:1[89]|20)\\d{2}\\s*년\\s*|연방\\s*|구\\s*)?$`);
const GLUED_FOREIGN = /(?:수정|연방)\s*$/;
const KOREAN_ANCHOR = /(?:우리|우리나라|한국|대한민국|현행|국내)\s*(?:의\s*)?$/;
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const unwrap = (s) => s.replace(/([가-힣])[ \t]*\n[ \t]*([가-힣])/g, '$1$2');   // a word broken across a line of the PDF is one word
// 「」 and 『』 as HWP-made PDFs write them — the half-width ｢ ｣ (U+FF62/U+FF63), and 뺷 뺸 or U+0002/U+0003 as cite.js glyphs()
// reads them — one letter for one, so every place found in the text is the text's own ("｢행정기본법｣ 제27조" is 「행정기본법」's)
const CORNER = { '｢': '「', '｣': '」', '뺷': '『', '뺸': '』', '\u0002': '『', '\u0003': '』' };
export const corners = (s) => String(s || '').replace(/[｢｣뺷뺸\u0002\u0003]/g, (c) => CORNER[c]);
// what the clause says of the law named at `at`: 'f' foreign, 'k' Korean (우리 민법, 현행헌법, 대한민국 헌법), '' neither
function foreignLaw(text, at, law) {
  const near = unwrap(text.slice(Math.max(0, at - 30), at));   // ('앞의 일⏎본 헌법 제33조' is Japan's)
  if (KOREAN_ANCHOR.test(near) || /^(?:현행|대한민국)/.test(text.slice(at, at + 4))) return 'k';
  if (GOVERNS.test(near) || GLUED_FOREIGN.test(text.slice(Math.max(0, at - 7), at))) return 'f';
  if (/\(\s*$/.test(near)) {   // "(형사소송법 제199조" after "일본 형사소송법 … 정하고 있다"
    const nm = reEsc(NAME_NORM(law)), under = new RegExp(`(?:${CTRY})(?:국|주|(?:연방)?공화국)?(?:의)?(?:\\d{4}년)?${nm}`);
    const sent = NAME_NORM(text.slice(Math.max(0, at - 160), at).split(/[.。!?]\s/).pop());   // a line break in a PDF is a wrap, not a sentence's end
    const close = text.indexOf(')', at), inParen = NAME_NORM(text.slice(at, close > at ? Math.min(close, at + 200) : at + 200));
    // …unless the same parenthesis names it again under a country: "(저작권법 제3조 제3항 및 중국 저작권법 제…)" — a contrast, so this one is Korean
    if (under.test(sent) && !under.test(inParen)) return 'f';
  }
  return '';
}

/* A foreign law cited bare in the section about it. A comparative passage names the law as foreign once — "일본 형사소송법",
   "캐나다 형법은", or the Korean name with the law's own title: "형사소송법(刑事訴訟法)", "형법(Criminal Code)" — and then cites
   it bare: "(형사소송법 제189조 제2항)". Such a bare citation is foreign as well, and is not linked, while all of this holds:
   - the section is about a foreign law: the nearest heading above it that says where it stands names a country or a
     comparison (Ⅲ. 일본 사례의 비교법적 검토 · 2. 캐나다 · 1. 영미법계 · 외국의 입법례), and not Korea (우리, 국내, 현행,
     시사점, 개선, 결론 …). A lower heading (가., (1)) can only say Korea. With no such heading above, the text is Korean,
     whatever it mentions — a Korean section never loses a link this way;
   - the same law was named foreign after the last heading (every heading closes what was named before it), and not named
     Korean after that ("우리 형사소송법", "현행 형법");
   - its own sentence says nothing Korean (우리나라, 한국, 현행 …) after the foreign naming.
   A citation that cannot be Korean names its law foreign too: one whose footnote quotes the provision in its own language
   ("헌법 제45조39)" with note 39 "Subject to this Article, a person shall not be …"), or one beyond the last article of the
   Korean law (형법 has 372; "형법 제750조"). A heading is a short line opening with Ⅰ./I./1./가./(1)/(가)/1); four or more in a
   row are the table of contents. A page is read on its own: what the pages before it left (articleScope of each, in turn)
   comes in as `scope`. */
const CTRY_SCAN = new RegExp(CTRY.split('|').map((c) => [...c].join('(?:[ \\t]*\\n[ \\t]*)?')).join('|'), 'g');   // (cut by a line break too)
const HOME_SCAN = /우리나라|우리|한국|대한민국|현행|국내/g;
const GLOSS_SCAN = /[(（][ \t]*(?=[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ffA-Za-z])/g;   // (刑事訴訟法), (公職選挙法), (Criminal Code)
const HEAD_LINE = /^[ \t]*(?:([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]{1,3})[ \t]*[.．]?|(X?(?:IX|IV|V?I{1,3}|V))[ \t]*[.．]|(\d{1,2})[ \t]*[.．](?![ \t]*\d)|([가-하])[ \t]*[.．]|[(（](\d{1,2})[)）]|[(（]([가-하])[)）]|(\d)\))[ \t]*(\S[^\n]*)$/gm;
const NOTE_WORDS = /\d{3}|면|쪽|頁|p\.|앞의|위의|같은\s*(?:글|책|논문)|참조|판결|결정|선고|[“”"]|http/;   // "16) 위의 책, 23면" is a note, not a heading
const ABROAD = new RegExp(`${CTRY.replace('일본', '일본(?!군)')}|(?:^|[^재])외국(?!인|환|법인|국적)|해외\\s*(?:입법|사례|법제)|비교법|입법례|영미|대륙법|북미|남미|유럽|주요국|각국|연방|최고재판소`);
const AT_HOME = /우리|한국|대한민국|국내|현행|시사점|개선|입법론|결론/;
const HOME_WORD = /우리|한국|대한민국|국내|현행(?!범)/;
const abroadAt = (path) => {   // the headings above, deepest first: the first that says where it stands decides
  for (let l = path.length - 1; l >= 1; l--) { const h = path[l]; if (!h) continue; if (h.home) return false; if (l <= 2 && h.abroad) return true; }
  return false;
};
// the provision quoted in its own language in the footnote its marker points to (a statute's words, not a book or a case)
function quotedAbroad(text, end) {
  const mk = /^[ \t]*(\d{1,3})\)/.exec(text.slice(end, end + 6));
  if (!mk) return false;
  const at = text.indexOf('\n' + mk[1] + ')', end);
  if (at < 0 || at - end > 6000) return false;
  let note = text.slice(at + 1 + mk[1].length + 1, at + 420);
  const next = note.search(/\n\s*\n|\n\d{1,3}\)\s/); if (next > 0) note = note.slice(0, next);
  const han = (note.match(/[가-힣]/g) || []).length, lat = (note.match(/[A-Za-zÀ-ÿ]/g) || []).length, cjk = (note.match(/[\u3040-\u30ff\u3400-\u9fff]/g) || []).length;
  if (han > 4 || (lat < 40 && cjk < 12)) return false;
  if (/\b(?:pp?|S|Vol|vol|Rn|Bd|Aufl|ed|eds|Hrsg|Id|Ibid|supra)\.|\bet al\b|Press|Univ|Journal|Review|Rev\.|U\.S\.\s*\d|F\.\s?\d|BVerfGE|\((?:19|20)\d{2}\)|頁|巻/.test(note)) return false;
  return /\b(?:shall|may|Article|Section|person|Act|Code|article|alinéa|peut|sont|Abs\.|wird|ist)\b|§|第[〇一二三四五六七八九十百千\d]+条/.test(note);
}
// the last article of a law (and whether it has 가지조문, 제N조의M), from the legalize-kr mirror files: an article beyond it,
// by a margin (a law can grow at its end), cannot be this Korean law's — the old text a version note or 구 marks aside
const LAST_ART = { 헌법: [130, 0], 형법: [372, 1], 형사소송법: [494, 1], 민법: [1118, 1], 상법: [935, 1], 민사집행법: [312, 1], 행정소송법: [46, 1],
  공직선거법: [279, 1], 헌법재판소법: [79, 1], 국가공무원법: [85, 1], 지방자치법: [211, 1], 관세법: [330, 1], 군형법: [94, 1], 정치자금법: [65, 1],
  국민투표법: [119, 1], 노동조합및노동관계조정법: [96, 1], 집회및시위에관한법률: [26, 1], 국가재정법: [102, 1], 행정기본법: [40, 1], 선거관리위원회법: [20, 1] };
const beyond = (law, art, sub) => { const b = LAST_ART[NAME_NORM(law)]; return !!b && typeof art === 'number' && (art > b[0] + Math.max(10, Math.ceil(b[0] / 10)) || (!!sub && !b[1])); };

// the headings and the namings of a text, read once and only when asked; `from` is what the text before it left
function sections(text, from) {
  const start = from && from.path ? from : { path: [], named: [] };
  let heads = null, paths = null, named = null;
  const dyn = [];   // what the citations themselves say, as they are read (in order)
  const readHeads = () => {
    heads = []; paths = []; const ends = [];
    let path = start.path.slice();
    HEAD_LINE.lastIndex = 0; let m;
    while ((m = HEAD_LINE.exec(text))) {
      const lvl = m[1] || m[2] ? 1 : m[3] ? 2 : m[4] ? 3 : m[5] ? 4 : m[6] ? 5 : 6, t = m[8].trim();
      if (t.length > (lvl <= 2 ? 50 : lvl < 6 ? 40 : 30) || !/[가-힣]{2}/.test(t) || /[.。]$|[.。?!]\s+\S/.test(t) || (lvl === 6 && NOTE_WORDS.test(t))) continue;
      path = path.slice(0, lvl); path[lvl] = { abroad: ABROAD.test(t), home: AT_HOME.test(t) };
      heads.push(m.index); paths.push(path); ends.push(m.index + m[0].length);
    }
    // a run of four or more heading lines one under another is the table of contents, not a section: after it, no heading is above
    for (let a = 0, b = 0; a < heads.length; a = b) {
      for (b = a + 1; b < heads.length && /^\s*$/.test(text.slice(ends[b - 1], heads[b])); b++);
      if (b - a >= 4) for (let k = a; k < b; k++) paths[k] = [];
    }
  };
  const lastHead = (at) => { let lo = 0, hi = heads.length - 1, k = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (heads[mid] < at) { k = mid; lo = mid + 1; } else hi = mid - 1; } return k; };
  // the law named right after `from` (within 50 letters), when the clause says what `want` asks: its longest name there
  const after = (from, min, want, out) => {
    let got = null;
    for (let e = from; e < Math.min(text.length, from + 50); e++) {
      const c = text[e];
      if (!/[가-힣·ㆍ\s\d「」]/.test(c)) break;
      if (!/[법률령칙전」]/.test(c)) continue;
      const r = lawBefore(text, e + 1);
      if (!r || r.start < min) continue;
      if (got && r.start !== got.start) break;
      if (!got && foreignLaw(text, r.start, r.law) !== want) return;
      got = r;
    }
    if (got) out.push({ i: got.start, law: namingKey(got), k: want });
  };
  const readNamings = () => {   // (only in the stretches under a foreign heading: nothing named elsewhere is ever asked for)
    const out = [];
    for (let k = -1; k < heads.length; k++) {
      if (!abroadAt(k >= 0 ? paths[k] : start.path)) continue;
      const a = k >= 0 ? heads[k] : 0, b = k + 1 < heads.length ? heads[k + 1] : text.length;
      let m;
      CTRY_SCAN.lastIndex = a; while ((m = CTRY_SCAN.exec(text)) && m.index < b) after(m.index + m[0].length, m.index + m[0].length, 'f', out);
      HOME_SCAN.lastIndex = a; while ((m = HOME_SCAN.exec(text)) && m.index < b) after(m.index + m[0].length, m.index, 'k', out);
      GLOSS_SCAN.lastIndex = a;
      while ((m = GLOSS_SCAN.exec(text)) && m.index < b) { const r = lawBefore(text, m.index); if (r) out.push({ i: r.start, law: namingKey(r), k: foreignLaw(text, r.start, r.law) === 'k' ? 'k' : 'f' }); }
    }
    return out.sort((x, y) => x.i - y.i);
  };
  // the last naming of `law` (of the law, or of this very article) after `lo` and before `at`; what came before this text first
  const lastNaming = (law, art, sub, lo, at, before) => {
    const fits = (n) => n.law === law && (n.art == null || (n.art === art && n.sub === sub));
    let last = null;
    if (before) for (const n of start.named) if (fits(n)) last = { ...n, i: -1 };
    for (const list of [named, dyn]) for (const n of list) if (n.i > lo && n.i < at && fits(n) && (!last || n.i >= last.i)) last = n;
    return last;
  };
  return {
    note(law, at, k, art, sub) { dyn.push(art == null ? { i: at, law, k } : { i: at, law, k, art, sub }); },
    // 'f': a bare citation of a law named foreign in this foreign section · 'fa': foreign by its footnote's quote (this
    // article only) · 'k': one its own sentence says is Korean · '' none of these
    said(law, at, end, art, sub) {
      if (!heads) readHeads();
      const k = lastHead(at), path = k >= 0 ? paths[k] : start.path;
      if (!abroadAt(path)) return '';
      if (!named) named = readNamings();
      const lo = k >= 0 ? heads[k] : -1, last = lastNaming(law, art, sub, lo, at, k < 0);
      if (!last) return quotedAbroad(text, end) ? 'fa' : '';
      if (last.k !== 'f') return '';
      const sent = text.slice(Math.max(0, last.i, at - 200), at).split(/[.。!?](?=\s)/).pop();
      return HOME_WORD.test(unwrap(sent)) ? 'k' : 'f';
    },
    // what this text leaves for the text after it: the headings above its end, and what its last section named, in order
    end() {
      if (!heads) readHeads();
      const k = heads.length - 1, path = k >= 0 ? paths[k] : start.path;
      if (!abroadAt(path)) return { path, named: [] };
      if (!named) named = readNamings();
      const lo = k >= 0 ? heads[k] : -1, last = new Map();
      for (const n of [...(k < 0 ? start.named.map((x) => ({ ...x, i: -1 })) : []), ...named, ...dyn].filter((x) => x.i === -1 || x.i > lo).sort((x, y) => x.i - y.i)) {
        const key = n.law + (n.art == null ? '' : `|${n.art}|${n.sub}`); last.delete(key); last.set(key, { law: n.law, k: n.k, ...(n.art == null ? {} : { art: n.art, sub: n.sub }) });
      }
      return { path, named: [...last.values()] };
    },
  };
}
// not a law's name on its own (the bare-name fallback): 같은 법, 동법, a bare 법률·특별법, or a name that begins with a country
const NOT_A_LAW = /^(?:같은|동)(?:법|법률)(?:시행령|시행규칙)$|^(?:같은|동|이|위|본|해당|그|각|이사건|관계|관련|구|신|개정|현행|종전|입|방|불|위|사|공|행정|국제|실정|자연|위헌|합헌|모|부|당해|관련)(?:법률|법|령|규칙)$|^(?:법률|위헌법률|헌법률|수정헌법|기본법|특례법|특별법|조치법|처벌법|시행령|시행규칙|진흥법|촉진법|보호법|관리법|조직법|절차법)$|^(?:미국|독일|프랑스|일본|영국|연방|미|독|불|일|영)/;
const SHORT = new Set(['헌법', '민법', '형법', '상법']);   // the two-letter laws; any other two letters before 법 is a word cut by a line break
// a known name glued to the word before it is taken only after a qualifier (현행헌법, 신민법) or a particle (근거법률인국가공무원법);
// otherwise it is part of another name — 임대주택법 is not 주택법, 수정헌법 is not 헌법
const QUALIFIER = /^(?:현행|개정|신|新)$/;   // "the current one" only — 구민법 is the old 의용민법 and 제헌헌법 the 1948 text, not today's
const PARTICLE = /[의은는을를과와에로인및]$/;
const SUBJECT = /[이가]$/;   // (이·가 end nouns too — 사이, 국가 — so only before a known name in a run that is no name: lawBefore)   // not 상·중·등: they end nouns as often (보상·집중·평등) — 산업재해보상보험업법 is not 보험업법
// the law named just before `end` (the index of 제); null when nothing is there
// "같은 법 시행령 제76조", "동법 제5조", "같은 법률 시행규칙 제3조", "같은 영 제4조": the law cited just before (its 시행령 or
// 시행규칙 when said), only when that one is a law this app knows and was not a foreign one
const SAME_LAW = /(?:같은|동)\s*(법률|법|영)(?:\s*(시행령|시행규칙))?\s*$/;
// where a version note between a name and its 제N조 begins ("…(2009. 8. 6. … 개정되기 전의 것) 제53조"), else end itself
function noteBefore(text, end) {
  let s = end;
  while (s > 0 && /\s/.test(text[s - 1])) s--;
  if (text[s - 1] !== ')') return end;
  const open = text.lastIndexOf('(', s - 1);
  if (open < 0 || s - open > 100) return end;
  const inside = text.slice(open + 1, s - 1);
  return VER_WORDS.test(inside) && !/[A-Za-z()]/.test(inside) ? open : end;
}
function lawSaidAgain(text, end, prev) {
  if (!prev || prev.foreign) return null;
  const m = SAME_LAW.exec(text.slice(Math.max(0, end - 16), end));
  if (!m) return null;
  const base = prev.law.replace(/\s*(?:시행령|시행규칙)$/, '');
  const want = m[1] === '영' ? (/시행령$/.test(prev.law) ? prev.law : '') : m[2] ? base + ' ' + m[2] : base;
  const law = want && resolveName(NAME_NORM(want));
  return law ? { law, start: end - m[0].length + (m[0].length - m[0].trimStart().length) } : null;
}
// the name a section's namings and citations are matched by: the law's own, but a name lawyers use (ABBR) as written — "캐나다
// 선거법(Canada Elections Act)" names Canada's 선거법, not 공직선거법, so a "공직선거법 제264조" after it stays Korean (8차)
const namingKey = (r) => (r.as && ABBR[r.as] && r.as !== NAME_NORM(r.law) ? r.as : r.law);
function lawBefore(text, end) {
  let s = end;
  while (s > 0 && /\s/.test(text[s - 1])) s--;
  if (text[s - 1] === ')') {   // step over "(…개정된 것)" only; any other paren (often a foreign original title) means do not link
    const open = text.lastIndexOf('(', s - 1), inside = open >= 0 ? text.slice(open + 1, s - 1) : '';
    // (and a name given for later, "(이하 ‘토지보상법’이라 한다)", as judgments write after a long name before its 제N조)
    const versionNote = (/개정|신설|전의\s*것|된\s*것|법률\s*제\s*\d+\s*호|대통령령\s*제\s*\d+\s*호|시행|폐지|제정|이전의/.test(inside) || /^\s*이하\s[^()]{1,40}(?:이)?라\s*(?:한다|함|칭한다|칭함)\s*$/.test(inside)) && !/[A-Za-z]/.test(inside);
    if (open >= 0 && s - open < 100 && versionNote) { s = open; while (s > 0 && /\s/.test(text[s - 1])) s--; }
    else if (open >= 0) return null;
  }
  if (text[s - 1] === '」') {   // 「name」
    const open = text.lastIndexOf('「', s - 1);
    if (open >= 0) { const nm = text.slice(open + 1, s - 1).trim(); const canon = resolveName(NAME_NORM(nm)) || (SUFFIX.test(NAME_NORM(nm)) && /^[가-힣·ㆍ\s]{2,50}$/.test(nm) ? nm.replace(/\s+/g, ' ').trim() : null); if (canon) return { law: canon, start: open, as: NAME_NORM(nm) }; }
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
    const rest = span.slice(a), cand = rest.replace(/^[\s·ㆍ]+/, '');   // (a list's middle dot before the name is not the name's: "제1조 · 행정기본법")
    if (cand.length < 2) break;
    if (!SUFFIX.test(NAME_NORM(cand))) continue;
    const canon = resolveName(NAME_NORM(cand));
    if (!canon) continue;
    const abs = start + a + (rest.length - cand.length);
    if (abs > 0 && /[가-힣]/.test(text[abs - 1]) && !tokEnd(abs)) {   // glued to the word before it
      let q = abs; while (q > 0 && /[가-힣]/.test(text[q - 1])) q--;
      const before = text.slice(q, abs);
      if (QUALIFIER.test(before)) return { law: canon, start: q, as: NAME_NORM(cand) };
      // (an old judgment written without spaces: "도로계획결정이도시계획법 제12조" — a subject's 이·가 before a name known here,
      // the whole run being no law's name: only the name is the citation, not the clause glued to it)
      if (!PARTICLE.test(before) && !(SUBJECT.test(before) && before.length >= 3)) continue;
    }
    return { law: canon, start: abs, as: NAME_NORM(cand) };
  }
  // not a known law: the bare name right before 제, as before (a repealed law still opens 국가법령정보센터 and its 헌재 decisions)
  let b = s; while (b > 0 && s - b < 30 && /[가-힣·ㆍ]/.test(text[b - 1]) && !tokEnd(b)) b--;
  const tight = text.slice(b, s).replace(/[·ㆍ]/g, '');
  if (text[b - 1] === '\n') {   // a word cut by a line break ("연⏎방선거운동법"): a foreign name is still foreign
    let q = b - 1; while (q > 0 && /[가-힣]/.test(text[q - 1])) q--;
    if (/^(?:미국|독일|프랑스|일본|영국|연방|수정)/.test(text.slice(q, b - 1) + tight)) return null;
  }
  if (tight && /(?:법률|법|령|규칙)$/.test(tight) && !NOT_A_LAW.test(tight) && (tight.length > 2 || SHORT.has(tight))) return { law: lawKey(tight) || tight, start: b, bare: true };
  return null;
}
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const circ = (c) => (c ? CIRCLED.indexOf(c) + 1 : 0);
// a circled number is a 항 only on the same line and not followed by digits: "제37조②", "제77조의2 ①과 동일" — not the
// 판결요지집's "제53조②777면", nor "제54조⏎③ 원고는…" (the judgment's own list) or a quoted article's "⏎① 근로자가…"
const ART_TAIL = /제\s*(\d{1,4})\s*조(?:\s*의\s*(\d{1,2})(?![\d,]))?(?:\s*제\s*(\d{1,3})\s*항|[ \t]*([①-⑳])(?![ \t]*\d))?/g;
const ART_MORE = /\s*(?:,|·|ㆍ|및|와|과)\s*제\s*(\d{1,4})\s*조(?:\s*의\s*(\d{1,2})(?![\d,]))?(?:\s*제\s*(\d{1,3})\s*항|[ \t]*([①-⑳])(?![ \t]*\d))?/y;
const PARA_MORE = /\s*(?:,|·|ㆍ|및|와|과)\s*(?:제\s*(\d{1,3})\s*항|([①-⑳])(?![ \t]*\d))/y;
// 헌법 전문(前文), not 전문(專門): only before a standalone particle, a list or closing punctuation — "헌법 전문은", "헌법 전문과 제1조", "(헌법 전문)" —
// never "헌법전문가", "헌법 전문성", "헌법소송을 전담할 헌법전문재판소"
const JEONMUN = /(?:대한민국)?헌법\s*전문(?=[은는을를의과와](?![가-힣])|에|\s*(?:[,·ㆍ]|및|[)）.。"”’」]|$))/g;   // 전문과 제1조 ✓, 전문과정 ✗
// scope: what the text before this one left (articleScope), when a page is read on its own
export function scanArticles(textIn, scope = null) { return scan(textIn, scope, false); }
// … and the citations of foreign laws too, each marked foreign (for a search that must leave out what reads like a Korean
// article but is another country's: "(형사소송법 제199조)" in a section on Japan's)
export function scanArticlesAll(textIn, scope = null) { return scan(textIn, scope, false, true); }
// what a text (a page) leaves for the one after it: the headings above, the foreign laws named in the section
export function articleScope(textIn, scope = null) { return scan(textIn, scope, true); }
// what a version note between a law's name and 제N조 says of the text cited: "(2011. 3. 31. 법률 제10522호로 개정되기 전의 것)"
// → '2011. 3. 31. 개정 전', "(… 개정되어 2020. 12. 10. 시행되기 전의 것)" → '2020. 12. 10. 시행 전', "(2016. 1. 6. … 개정된 것)"
// → '2016. 1. 6. 개정된 것' (each the date just before the words that say it); '' when the parenthesis is no version note
// ("(이하 ‘법’이라 한다)") or names no date
const VER_WORDS = /개정|신설|전의\s*것|된\s*것|법률\s*제\s*\d+\s*호|대통령령\s*제\s*\d+\s*호|시행|폐지|제정|이전의/;
const OLD_NOTE = /전의\s*것|되기\s*전|개정\s*전|이전의|폐지/;   // (a note that says the text cited was before some change)
const parenOf = (seg) => { const o = seg.lastIndexOf('('), c = seg.lastIndexOf(')'); return o >= 0 && c > o && /\)\s*$/.test(seg) ? seg.slice(o + 1, c) : ''; };
function verNote(t) {
  if (!t || !VER_WORDS.test(t)) return '';
  const dates = [...t.matchAll(/((?:19|20)\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?/g)].map((d) => ({ i: d.index, s: `${d[1]}. ${Number(d[2])}. ${Number(d[3])}.` }));
  const at = (re) => { const m = re.exec(t); if (!m) return ''; const b = dates.filter((d) => d.i < m.index); return b.length ? b[b.length - 1].s : ''; };
  let d;
  if ((d = at(/시행되기\s*전/))) return `${d} 시행 전`;
  if ((d = at(/전부\s*개정되기\s*전/))) return `${d} 전부 개정 전`;
  if ((d = at(/개정되기\s*전|개정\s*전/))) return `${d} 개정 전`;
  if ((d = at(/폐지되기\s*전/))) return `${d} 폐지 전`;
  if ((d = at(/개정된\s*것|개정되어/))) return `${d} 개정된 것`;
  if ((d = at(/제정된\s*것/))) return `${d} 제정된 것`;
  return '';
}
// "동법 제13조", "같은 법 제5조": the law named last before it — cited (prev) or only named since ("1981년에 국회의원선거법이
// 개정되었다. 동법 제13조", "독일기본법 제38조 … 동법 제93조"). A name counts when it is a law this app knows (or an old name of
// one), a long name of a law it does not (six letters or more: 지방의회의원선거법), or a foreign one ("독일 기본법", "일본국헌법",
// 수정헌법); a word that only ends in 법 (방법, 입법, 행정법, 기본법 alone) does not. The last such name between `from` and `to`
// (the 동법 itself): { law, start, foreign } — null when none is there. 헌법 named in passing does not count, nor 헌법상 (an adjective)
const NAME_TAIL = /^(?:은|는|이|가|을|를|의|에|과|와|도|로|만|에서|으로|이나|이라|이며|이고|이다|에는|에서는|에서의|에도|에의|으로서|으로써|과는|와는|및)(?![가-힣])/;
const NOUN_BEOP = /(?:방법|입법|사법|불법|위법|적법|합법|편법|탈법|기법|수법|용법|논법|요법|화법|문법|판례법|관습법|자연법|실정법|국제법|행정법|비교법|외국법|헌법)$/;   // (위헌심사방법, 기본권제한방법: words, not names)
const FOREIGN_WORD = new RegExp(`^(?:${CTRY})|^(?:수정|연방)`);
function namedSince(text, from, to) {
  for (let e = to; e > from + 1; e--) {
    const c = text[e - 1];
    if (c !== '법' && c !== '」' && !(c === '률' && text[e - 2] === '법')) continue;
    if (e < to && /[가-힣]/.test(text[e]) && !NAME_TAIL.test(text.slice(e, e + 5))) continue;   // (법학, 법원, 법률안: not a name's end)
    let ws = e - (c === '」' ? 1 : 0); while (ws > from && /[가-힣·ㆍ]/.test(text[ws - 1])) ws--;
    const word = text.slice(ws, e).replace(/[」·ㆍ]/g, '');
    if (FOREIGN_WORD.test(word) || (c !== '」' && GOVERNS.test(unwrap(text.slice(Math.max(0, ws - 30), ws))))) {
      if (/(?:법|법률)$/.test(word) && word.length >= 3 && !/^(?:동|같은)/.test(word)) return { law: word, start: ws, foreign: true };
      continue;
    }
    const r = lawBefore(text, e);
    if (!r || r.start < from) continue;
    if (r.bare && (NAME_NORM(r.law).length < 6 || NOUN_BEOP.test(NAME_NORM(r.law))) && !oldLaw(r.law)) continue;
    if (r.law === '헌법' && !GLUED_FOREIGN.test(text.slice(Math.max(0, r.start - 7), r.start))) continue;   // (헌법 named in passing — "헌법은 영장주의를 …" — is not what a 동법 means: it is cited by its articles)
    return foreignLaw(text, r.start, r.law) === 'f' ? { law: r.law, start: r.start, foreign: true } : { law: r.law, start: r.start };
  }
  return null;
}
// a citation of one of the old constitutions — "1972년 헌법", 건국헌법·제헌헌법·유신헌법, "제5공화국 헌법", "구 헌법(1987. 10. 29.
// 전부개정되기 전의 것)" — is not today's 헌법 (each 전부개정 numbered it anew), so it opens no article of today's: what it is,
// said in words ({ label, start }), or null for a citation of today's. The versions by their 공포 (lawhist/index.json: 10, 1948-1987).
const CON_VERS = ['1948. 7. 17.', '1952. 7. 7.', '1954. 11. 29.', '1960. 6. 15.', '1960. 11. 29.', '1962. 12. 26.', '1969. 10. 21.', '1972. 12. 27.', '1980. 10. 27.', '1987. 10. 29.'];
const CON_NICK = { 0: '건국헌법', 7: '유신헌법' };
const dnum = (d) => { const m = /((?:19|20)\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})/.exec(d || ''); return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : 0; };
const conLabel = (lead, k) => `${lead}(${CON_VERS[k]} ${k ? '개정' : '제정'}${CON_NICK[k] && !/(?:건국|제헌|유신)헌법$/.test(lead) ? `, ${CON_NICK[k]}` : ''})`;
const CON_REPUBLIC = { 1: 0, 2: 3, 3: 5, 4: 7, 5: 8 };   // (제1공화국 헌법: 1948-1960, said by its first)
function oldCon(text, nm, was) {
  const law = NAME_NORM(nm.law), pre = text.slice(Math.max(0, nm.start - 24), nm.start);
  let m;
  if ((m = /^(건국|제헌|유신)헌법$/.exec(law))) { const k = m[1] === '유신' ? 7 : 0; return { label: conLabel(law, k), start: nm.start }; }
  if (law === '년헌법' || law === '헌법' || law === '대한민국헌법') {
    const yr = (law === '년헌법' ? /((?:1[6-9]|20)\d{2})\s*$/ : /((?:1[6-9]|20)\d{2})\s*년\s*(?:의\s*)?(?:개정\s*)?$/).exec(pre);
    if (yr) {
      const y = Number(yr[1]);
      if (y >= 1987) return null;   // (1987년 헌법: today's)
      if (y < 1948) return { foreign: true, start: nm.start - pre.length + yr.index };   // (1787년 헌법, 1919년 헌법: no text of the Republic's — not linked)
      let k = CON_VERS.findIndex((d) => Math.floor(dnum(d) / 10000) === y);
      if (k < 0) { k = 0; CON_VERS.forEach((d, i) => { if (Math.floor(dnum(d) / 10000) < y) k = i; }); }
      return { label: conLabel(`${y}년 헌법`, k), start: nm.start - pre.length + yr.index };
    }
    if (law === '년헌법') return null;
    if ((m = /제\s*([1-6])\s*공화국\s*(?:의\s*)?$/.exec(pre))) {
      const n = Number(m[1]);
      return n === 6 ? null : { label: n === 1 ? '제1공화국 헌법(1948~1960)' : conLabel(`제${n}공화국 헌법`, CON_REPUBLIC[n]), start: nm.start - pre.length + m.index };
    }
    if ((m = /(건국|제헌|유신)\s*$/.exec(pre))) { const k = m[1] === '유신' ? 7 : 0; return { label: conLabel(`${m[1]}헌법`, k), start: nm.start - pre.length + m.index }; }
    if (!was) return null;
  } else if ((m = /^(?:구|舊)헌법$/.exec(law))) { if (!was) was = '구'; }
  else if ((m = /^공화국헌법$/.exec(law)) && (m = /제\s*([1-5])\s*$/.exec(pre))) {
    const n = Number(m[1]);
    return { label: n === 1 ? '제1공화국 헌법(1948~1960)' : conLabel(`제${n}공화국 헌법`, CON_REPUBLIC[n]), start: nm.start - pre.length + m.index };
  } else return null;
  // (구 헌법, or a version note: the version in force then — before the day "… 개정되기 전의 것" names, or on the day "… 개정된 것" does)
  const d = dnum(was);
  if (!d) return { label: '구 헌법', start: nm.start };
  const before = / 전$/.test(was);
  let k = -1; CON_VERS.forEach((v, i) => { if (before ? dnum(v) < d : dnum(v) <= d) k = i; });
  if (k === CON_VERS.length - 1) return null;   // (today's)
  return k < 0 ? { label: '구 헌법', start: nm.start } : { label: conLabel('구 헌법', k), start: nm.start };
}
function scan(textIn, scope, wantScope, all = false) {
  const out = [];
  if (!textIn) return wantScope ? (scope && scope.path ? scope : { path: [], named: [] }) : out;
  textIn = corners(textIn);   // (one letter for one: the places found are the text's own)
  // (what each law's last version note here said, by the law: "구 민간투자법 제4조" after "구 사회기반시설에 대한 민간투자법(2011. 3. 31.
  // … 개정되기 전의 것, 이하 ‘구 민간투자법’이라 한다)" is that same version; carried over from the page before too)
  const vers = new Map(scope && Array.isArray(scope.vers) ? scope.vers : []);
  const sec = sections(textIn, scope);
  ART_TAIL.lastIndex = 0;
  // (the law cited last, for "같은 법 시행령 제76조", "동법 제5조"; carried over from the page before when read page by page)
  let m, prev = scope && scope.prev && scope.prev.law ? { law: scope.prev.law, foreign: !!scope.prev.foreign, start: -1, ...(scope.prev.oldcon ? { oldcon: scope.prev.oldcon } : {}) } : null;
  let prevEnd = 0;   // (where the last citation ended: a law named after it is what a 동법 means)
  while ((m = ART_TAIL.exec(textIn))) {
    const tailEnd = m.index + m[0].length;
    let nm = lawBefore(textIn, m.index), again = null;
    if (!nm) {   // "동법 제13조": the law named last — cited before, or only named since
      // (and "같은 법 시행규칙(2009. 8. 6. … 개정되기 전의 것) 제53조": its version note stepped over, and read as the text's)
      const e2 = noteBefore(textIn, m.index);
      const sm = SAME_LAW.exec(textIn.slice(Math.max(0, e2 - 16), e2));
      if (!sm) continue;
      const at = e2 - sm[0].length + (sm[0].length - sm[0].trimStart().length);
      again = namedSince(textIn, prevEnd, at) || prev;
      if (again && again.foreign) {   // (another country's law said again: not linked, nor the list after it)
        if (all) out.push({ law: again.law, art: Number(m[1]), sub: m[2] ? Number(m[2]) : 0, para: m[3] ? Number(m[3]) : circ(m[4]), i: at, len: tailEnd - at, foreign: true });
        prev = { law: again.law, foreign: true, start: at }; prevEnd = tailEnd; continue;
      }
      nm = again && again.oldcon ? { law: '헌법', start: at } : lawSaidAgain(textIn, e2, again);
      // (a 동법 of a law not known here, or of none: not linked — and the next 동법 looks back only to here, so a text of many
      // is read once, not again from its start for each)
      if (!nm) { if (again) prev = { law: again.law, foreign: false, start: at }; prevEnd = tailEnd; continue; }
    }
    prev = nm;
    let art = Number(m[1]), sub = m[2] ? Number(m[2]) : 0;
    // (구 as a word of its own — "구 민간투자법", "(구 형법" — not the end of another: "선행연구 공직선거법")
    const note = parenOf(textIn.slice(nm.start, m.index)), gu = /(?:^|[^가-힣])구\s*$/.test(textIn.slice(Math.max(0, nm.start - 3), nm.start));
    // (an old text's citation says so, with the date its note gives — or the note before it on the same law, or just '구':
    // the article opened from it is today's, and the reader is told. Only 구 or a note that says the text was before some
    // change ("…개정되기 전의 것", "개정 전", "폐지") is old; "…개정된 것" names its version, which the reader is told as
    // such; a bare date, 시행, 제정 or a law's number ("(2022. 1. 27. 시행)", "(법률 제17979호)") marks the text in force —
    // no band, or the scholar is told a law in force is a repealed one)
    let was = gu ? verNote(note) || vers.get(lawId(nm.law)) || '구' : OLD_NOTE.test(note) ? verNote(note) || '구' : verNote(note);
    if (/ 전$/.test(was)) vers.set(lawId(nm.law), was);   // (only a text before some change is "구 …" again later)
    const said = foreignLaw(textIn, nm.start, nm.law) || sec.said(namingKey(nm), nm.start, tailEnd, art, sub);
    // an old constitution (1972년 헌법, 유신헌법, 구 헌법(1987. 10. 29. 전부개정되기 전의 것)): today's is not it — said in words
    // (oldcon), never opened as today's article; and a law cited by an old name: today's (renamed: marked 구법, the old name
    // said) or the repealed law itself (its 'repealed' answer says so: lawText)
    const oc = said ? null : again && again.oldcon ? { label: again.oldcon, start: nm.start } : oldCon(textIn, nm, was);
    if (oc && oc.foreign) {   // (no constitution of the Republic: not linked, nor the list after it — and the section's 헌법 stays Korean)
      if (all) out.push({ law: nm.law, art, sub, para: m[3] ? Number(m[3]) : circ(m[4]), i: oc.start, len: tailEnd - oc.start, foreign: true });
      prev = { ...nm, foreign: true }; prevEnd = tailEnd; continue;
    }
    const ol = oc ? null : oldLaw(nm.law);
    let law = nm.law, i0 = nm.start, xtra = null;
    // (for 찾기 — scanArticlesAll — it is marked as another country's law is: "1972년 헌법 제40조" is no place that cites today's 제40조)
    if (oc) { law = '구 헌법'; i0 = Math.min(i0, oc.start); xtra = { oldcon: oc.label, ...(all ? { foreign: true } : {}) }; prev = { ...nm, oldcon: oc.label }; }
    else if (ol && !ol.gone) { law = resolveName(NAME_NORM(ol.now)) || ol.now; was = `${ol.name}: ${was && was !== '구' ? was : `${ol.date} ${ol.whole ? '전부개정' : '이름 변경'} 전`}`; }
    const old = !!was || !!oc;
    const mark = oc ? xtra : was ? { old: was } : null;
    // no such article in the Korean law: not linked, nor is the same article cited again in this section — but the list after
    // it goes on ("형법 제535조, 제55조 제1항": a slip of the pen, then a real one)
    const none = !old && beyond(nm.law, art, sub);
    if (said === 'fa' || (!said && none)) sec.note(namingKey(nm), nm.start, 'f', art, sub);
    else if (said) sec.note(namingKey(nm), nm.start, said);
    if (said === 'f' || said === 'fa') { if (all) out.push({ law: nm.law, art, sub, para: m[3] ? Number(m[3]) : circ(m[4]), i: nm.start, len: tailEnd - nm.start, foreign: true }); prev = { ...nm, foreign: true }; prevEnd = tailEnd; continue; }
    const keep = (a, s) => old || !beyond(nm.law, a, s);
    if (keep(art, sub)) out.push({ law, art, sub, para: m[3] ? Number(m[3]) : circ(m[4]), i: i0, len: tailEnd - i0, ...mark });
    let at = tailEnd;   // the same law's list: a new article, or another 항 of this article (of the same version)
    for (;;) {
      PARA_MORE.lastIndex = at; const p = PARA_MORE.exec(textIn);
      ART_MORE.lastIndex = at; const a = ART_MORE.exec(textIn);
      if (p && (!a || p.index <= a.index)) { const k = p[0].search(/[제①-⑳]/); if (keep(art, sub)) out.push({ law, art, sub, para: p[1] ? Number(p[1]) : circ(p[2]), i: p.index + k, len: p[0].length - k, ...mark }); at = PARA_MORE.lastIndex; }
      else if (a) { art = Number(a[1]); sub = a[2] ? Number(a[2]) : 0; const k = a[0].search(/제/); if (keep(art, sub)) out.push({ law, art, sub, para: a[3] ? Number(a[3]) : circ(a[4]), i: a.index + k, len: a[0].length - k, ...mark }); at = ART_MORE.lastIndex; }
      else break;
    }
    ART_TAIL.lastIndex = at; prevEnd = at;
  }
  JEONMUN.lastIndex = 0; let j;   // 헌법 전문 (and the articles after it in "헌법 전문, 제1조 …" belong to 헌법)
  while ((j = JEONMUN.exec(textIn))) {
    if (foreignLaw(textIn, j.index, '헌법') === 'f' || /^fa?$/.test(sec.said('헌법', j.index, j.index + j[0].length, '전문', 0))) continue;
    if (oldCon(textIn, { law: '헌법', start: j.index }, /^\s*구\s*$|[^가-힣]구\s*$/.test(textIn.slice(Math.max(0, j.index - 3), j.index)) ? '구' : '') || /(?:건국|제헌|유신|공화국|[^가-힣]구)\s*$/.test(textIn.slice(Math.max(0, j.index - 8), j.index))) continue;   // (1972년 헌법 전문: not today's)
    out.push({ law: '헌법', art: '전문', sub: 0, para: 0, i: j.index, len: j[0].length });
    let at = j.index + j[0].length, a;
    for (;;) { ART_MORE.lastIndex = at; a = ART_MORE.exec(textIn); if (!a) break; const k = a[0].search(/제/); out.push({ law: '헌법', art: Number(a[1]), sub: a[2] ? Number(a[2]) : 0, para: a[3] ? Number(a[3]) : circ(a[4]), i: a.index + k, len: a[0].length - k }); at = ART_MORE.lastIndex; }
  }
  if (wantScope) {   // (what is named after the last citation is what a 동법 at the top of the next page means)
    const last = namedSince(textIn, prevEnd, textIn.length);
    if (last) prev = last;
    return { ...sec.end(), prev: prev ? { law: prev.law, foreign: !!prev.foreign, ...(prev.oldcon ? { oldcon: prev.oldcon } : {}) } : null, vers: [...vers] };
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

/* ---------------- 위헌·헌법불합치 결정 (헌법재판소 통계 + 미개정 법령현황, through the server) ----------------
  The server's compact list (/api/ccourt/unconst: 위헌결정 법률현황 joined with the two 미개정 lists) is asked once a day and
  kept on this device (kv 'unconst'); an article's card gets a short band for each decision on that article, and a law's own
  page those on the law as a whole (no article named, a 부칙, or a law renamed by a 전부개정, whose numbers may differ) and
  those not yet amended, with a quiet mark on each article line that has one. A row is matched by its law's name, spaces and
  dots out — the exact law, so 공직선거법 is never 공직선거법 시행령 — and an old name (OLD_LAWS) by today's: a renamed law's
  articles are today's, a repealed law's are no one's. Each band's line opens the decision's sheet (data-case-open). */
const UC_V = 1, UC_KEY = 'unconst', UC_DAY = 864e5;
const ucEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// what is kept of a row: no more than a band needs. The server keeps a row's first article as art and the rest in part
// ('제269조 제1항' + ', 제270조 제1항 중 ‘의사’에 관한 부분'): the articles that follow it at once are kept too (not one
// named inside 중 ‘…’); pre: the text before a 전부개정 (its numbers may be other articles' today)
const UC_LEAD = /^(?:\s*(?:,|및|ㆍ|·|본문|단서|전단|후단|전문|후문|제\s*\d+\s*조(?:\s*의\s*\d+)?|제\s*\d+\s*항|제\s*\d+\s*호(?:\s*의\s*\d+)?|[가-하]목))+/;
export const ucSlim = (x) => {
  const o = { law: String(x.law || ''), kind: String(x.kind || ''), date: String(x.date || ''), no: String(x.eventNo || '') };
  if (x.art) { const more = UC_LEAD.exec(String(x.part || '')); o.art = String(x.art) + (more && /제\s*\d+\s*조/.test(more[0]) ? more[0].replace(/\s+$/, '') : ''); }
  if (x.old) o.old = 1;
  if (/(?:전부|전문)\s*개정\s*되기\s*전/.test(String(x.ver || ''))) o.pre = 1;
  if (x.unam && typeof x.unam === 'object') { o.un = { kind: String(x.unam.kind || '') }; if (x.unam.progress) o.un.progress = String(x.unam.progress); if (x.unam.deadline) o.un.deadline = String(x.unam.deadline); }
  return o;
};
// the articles a row names: '제26조 제1항' → [{ art: 26, sub: 0, para: 1 }]; a list ('제10조, 제23조 제1호') → each
export function ucArts(s) {
  const out = [], re = /제\s*(\d{1,4})\s*조(?:\s*의\s*(\d{1,3}))?(?:\s*제\s*(\d{1,3})\s*항)?/g;
  let m;
  while ((m = re.exec(String(s || '')))) out.push({ art: Number(m[1]), sub: m[2] ? Number(m[2]) : 0, para: m[3] ? Number(m[3]) : 0 });
  return out;
}
// whose row it is: { key (today's law, as lawId gives it), was (an old name it was cited by), whole (renamed by a 전부개정),
// add (a 부칙's article), gone (a repealed law: matched to nothing in force) }
export function ucLawOf(name) {
  let n = String(name || '').replace(/[「」｢｣『』‘’“”]/g, '').trim().replace(/^구\s+/, '');
  n = NAME_NORM(n);
  const ad = /^(.{2,}?)부칙$/.exec(n);
  if (ad) n = ad[1];
  const o = oldLaw(n);
  const r = o ? (o.gone ? { key: NAME_NORM(n), gone: true } : { key: lawId(o.now), was: o.name, whole: !!o.whole }) : { key: lawId(n) };
  if (ad) r.add = true;
  return r;
}
// the list, by law: key → rows, each with its articles worked out
export function ucIndex(rows) {
  const idx = new Map();
  for (const x of rows || []) {
    if (!x || !x.law || !x.no) continue;
    const w = ucLawOf(x.law);
    if (w.gone) continue;
    const r = { ...x, ...w, arts: ucArts(x.art) };
    if (!idx.has(w.key)) idx.set(w.key, []);
    idx.get(w.key).push(r);
  }
  return idx;
}
// one decision once (two rows of one decision: the parts it held, or two versions of the article): not yet amended if
// either says so, an old version only if both are
function ucOnce(rows) {
  const at = new Map();
  for (const r of rows) {
    const y = at.get(r.no);
    if (!y) { at.set(r.no, { ...r }); continue; }
    if (!y.un && r.un) y.un = r.un;
    if (!r.old) y.old = 0;
    if (!r.pre) y.pre = 0;
    if (!r.was) y.was = '';
  }
  return [...at.values()].sort((a, b) => (b.un ? 1 : 0) - (a.un ? 1 : 0) || String(b.date).localeCompare(String(a.date)));
}
// an article's decisions (the law's name as any text gives it; art and sub as numbers)
export function ucForArticle(idx, law, art, sub = 0) {
  const rows = (idx && idx.get(lawId(law))) || [];
  return ucOnce(rows.filter((r) => !r.whole && !r.add && !r.pre && r.arts.some((a) => a.art === art && a.sub === (sub || 0))));
}
// a law's: on the law as a whole (shown on its page), not yet amended (shown there too), and by article (marked on its lines).
// has: the articles its page lists ('26:0', '66:2'), when known — a row on none of them (an article today's law no longer
// has) is shown with the law's, not counted as marked
export function ucForLaw(idx, law, has = null) {
  const rows = (idx && idx.get(lawId(law))) || [];
  const listed = (r) => !has || !has.size || r.arts.some((a) => has.has(a.art + ':' + a.sub));
  const lawLevel = (r) => !r.arts.length || r.whole || r.add || r.pre || !listed(r);
  const whole = ucOnce(rows.filter(lawLevel)), seen = new Set(whole.map((r) => r.no));
  return { whole, unam: ucOnce(rows.filter((r) => !lawLevel(r) && r.un && !seen.has(r.no))), arts: rows.filter((r) => !lawLevel(r)) };
}
const ucToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const ucDate = (d) => dateText(String(d || '').replace(/-/g, ''));
// one band line: '헌재 위헌 결정 2004헌마554 (2004. 10. 21.)' · '헌법불합치 · 아직 개정 안 됨 (2023헌마…, 개정 시한 …)';
// here: the article the card shows (its 항 said after, when the row names one); else the row's own article, if any
export function ucLine(r, here = null, today = ucToday()) {
  const d = ucDate(r.date), bits = [];
  let head, tail;
  if (r.un) {
    const dl = r.un.deadline, past = (dl && dl < today) || r.un.progress === '경과';
    head = `${r.un.kind || r.kind} · 아직 개정 안 됨`;
    tail = `(${r.no}, ${dl ? `개정 시한 ${ucDate(dl)}${past ? ' 지남' : ''}` : `${d} 결정`})`;
  } else { head = `헌재 ${r.kind} 결정`; tail = `${r.no}${d ? ` (${d})` : ''}`; }
  if (here) { const a = r.arts.find((x) => x.art === here.art && x.sub === (here.sub || 0)); if (a && a.para) bits.push(`제${a.para}항`); }
  else if (r.art) bits.push((r.add ? '부칙 ' : '') + String(r.art).replace(/\s+/g, ' '));
  if (r.was) bits.push(`옛 이름 ${r.was}${r.whole && r.art ? ' 때의 조문' : ''}`);
  if (r.pre) bits.push('전부개정 전 조문');
  else if (r.old) bits.push('개정 전 조문');
  if (r.recent) bits.push('최근 선고');   // (not in the court's monthly statistics yet: its list of recent decisions)
  return `<button type="button" class="vb-l${r.un ? ' vb-un' : ''}" data-case-open="${ucEsc(r.no)}" data-cdate="${ucEsc(d)}"><b>${ucEsc(head)}</b> <span class="vb-no">${ucEsc(tail)}</span>${bits.length ? `<small>${ucEsc(bits.join(' · '))}</small>` : ''}</button>`;
}
const UC_SHOW = 3;
function ucBand(rows, here, extra = '', cls = '') {
  if (!rows.length && !extra) return '';
  const first = rows.slice(0, UC_SHOW).map((r) => ucLine(r, here)).join(''), rest = rows.slice(UC_SHOW);
  const more = rest.length ? `<details class="vb-more"><summary>외 ${rest.length}건</summary>${rest.map((r) => ucLine(r, here)).join('')}</details>` : '';
  return `<div class="vb-band${cls}" role="note" aria-label="헌법재판소 위헌·헌법불합치 결정">${first}${more}${extra}</div>`;
}
// the band for an article's card, or '' (the list not at hand, or nothing on it)
export function ucArticleBand(idx, law, art, sub = 0) { return ucBand(ucForArticle(idx, law, art, sub), { art, sub }); }
// the law page's: its law-level and not-yet-amended decisions, and how many more are marked on its article lines
export function ucLawBand(idx, law, asOf = '', has = null) {
  const f = ucForLaw(idx, law, has), n = new Set(f.arts.map((r) => r.no)).size;
  if (!f.whole.length && !f.unam.length && !n) return '';
  const fresh = [...f.whole, ...f.unam, ...f.arts].some((r) => r.recent);
  const src = (/^\d{4}-\d{2}$/.test(asOf) ? ` · 헌법재판소 통계 ${asOf.slice(0, 4)}. ${Number(asOf.slice(5))}. 기준` : '') + (fresh ? `${asOf ? ',' : ' ·'} 최근 선고 포함` : '');
  const note = `<p class="vb-note">${n ? `조문별 위헌·헌법불합치 결정 ${n}건은 조문 목록에 표시했습니다` : '조문별 위헌·헌법불합치 결정은 없습니다'}${src}</p>`;
  return ucBand([...f.unam, ...f.whole].sort((a, b) => (b.un ? 1 : 0) - (a.un ? 1 : 0) || String(b.date).localeCompare(String(a.date))), null, note, ' vb-law');
}
// the mark on a law page's article line ('헌법불합치', '위헌 2건', '개정 안 됨' first)
export function ucTag(idx, law, art, sub = 0) {
  const rows = ucForArticle(idx, law, art, sub);
  if (!rows.length) return '';
  const r = rows[0], un = rows.some((x) => x.un);
  return `<em class="vb-tag${un ? ' vb-un' : ''}">${ucEsc(un ? `${r.un ? r.un.kind || r.kind : r.kind} · 개정 안 됨` : r.kind)}${rows.length > 1 ? ` 외 ${rows.length - 1}` : ''}</em>`;
}

// the list: the copy kept here while it is under a day old (or there is no connection); else asked again, and the kept copy
// used when the server cannot give it. One ask a session at most (another after 10 minutes when it failed)
let ucAsk = null, ucIdx = null, ucTried = 0;
async function ucGet(path, ms = 0) {
  if (!api.hasToken() || !api.base()) throw fail('auth');
  const ctl = ms && typeof AbortController !== 'undefined' ? new AbortController() : null, timer = ctl ? setTimeout(() => ctl.abort(), ms) : 0;
  let r;
  try { r = await fetch(api.base() + path, { headers: api.authHeader(), cache: 'no-store', ...(ctl ? { signal: ctl.signal } : {}) }); } catch (e) { throw fail('offline'); } finally { clearTimeout(timer); }
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || !Array.isArray(d.items)) throw fail((d && d.error) || 'unavailable');
  return d;
}
const ucFetch = () => ucGet('/api/ccourt/unconst');
// the statistics: the copy kept here while it is under a day old (or there is no connection); else asked again, and the
// kept copy used when the server cannot give it
async function ucStats() {
  const kept = await store.get('kv', UC_KEY).catch(() => null);
  const ok = kept && kept.v === UC_V && Array.isArray(kept.rows);
  if (ok && (Date.now() - kept.got < UC_DAY || navigator.onLine === false)) return kept;
  if (!ok && ucIdx && ucIdx.rec.got && Date.now() - ucIdx.rec.got < UC_DAY) return ucIdx.rec;   // (storage refused it: the copy in memory)
  try {
    const d = await ucFetch();
    const rec = { v: UC_V, got: Date.now(), at: d.at || 0, asOf: String(d.asOf || ''), rows: d.items.map(ucSlim) };
    await store.put('kv', UC_KEY, rec).catch(() => {});
    return rec;
  } catch (e) { return ok ? kept : null; }
}
/* 최근 선고. The statistics come out monthly and late (a decision of today is in them a month or more later), so the court's
   list of its recent major decisions (/api/ccourt/recent, two pages of 50) fills the gap: a 위헌, 헌법불합치 or 한정위헌
   decision whose name names a law and its articles ('구 공직선거법제93조 제1항 본문 등위헌제청') goes on the bands too, said to
   be a recent one ('최근 선고'), until the statistics hold it (a decision they have is theirs alone). Kept here three hours. */
const UC_RECENT = 'unconst:recent', UC_RECENT_AGE = 3 * 3600e3;
const ucMend = (s) => String(s || '').replace(/\s+/g, ' ').trim()
  .replace(/([^\s(「‘'"])(제\s*\d+\s*조)/g, '$1 $2')
  .replace(/(조|항|호|목|본문|단서|전단|후단|전문|후문|부분|등|조의\s*\d+)(위헌|헌법소원|헌법불합치|권한쟁의)/g, '$1 $2');
export function ucKindOf(result) {
  const r = String(result || '');
  // ('인용(위헌확인)', '인용(취소)': a 헌법소원 against an act of power upheld — not a law found unconstitutional)
  if (/인용|확인|취소/.test(r) && !/불합치/.test(r)) return '';
  return /불합치/.test(r) ? '헌법불합치' : /한정위헌/.test(r) ? '한정위헌' : /위헌/.test(r) ? '위헌' : '';
}
// the recent decisions' rows, as ucSlim makes the statistics': { law, kind, date, no, art?, old?, recent: 1 } — one for each
// law the decision's name names (its articles in art, as the statistics write them)
export function ucRecentRows(items) {
  const out = [];
  for (const x of items || []) {
    const no = String((x && x.eventNo) || '').trim(), kind = ucKindOf(x && x.result);
    if (!no || !kind) continue;
    const title = ucMend(x.title), date = dayOf(x.date) || '';
    const by = new Map();
    for (const a of scanArticles(title)) {
      if (a.foreign || a.oldcon || typeof a.art !== 'number') continue;
      const g = by.get(a.law) || { arts: [], old: false };
      const lbl = `제${a.art}조${a.sub ? '의' + a.sub : ''}${a.para ? ` 제${a.para}항` : ''}`;
      if (!g.arts.includes(lbl)) g.arts.push(lbl);
      if (a.old) g.old = true;
      by.set(a.law, g);
    }
    if (!by.size) {   // (a name with no article: the law as a whole — when it is a law known here)
      const m = /^(구\s+)?([가-힣ㆍ·\s]{2,60}?(?:법률|법|령|규칙))(?=\s|$)/.exec(title);
      const law = m && resolveName(NAME_NORM(m[2]));
      if (law) by.set(law, { arts: [], old: !!m[1] });
    }
    for (const [law, g] of by) out.push({ law, kind, date, no, ...(g.arts.length ? { art: g.arts.join(', ') } : {}), ...(g.old ? { old: 1 } : {}), recent: 1 });
  }
  return out;
}
// the recent list kept on this device (any age), and a new one asked of the server (kept when it comes; null when it fails)
async function ucRecentKept() {
  const kept = await store.get('kv', UC_RECENT).catch(() => null);
  return kept && kept.v === 1 && Array.isArray(kept.rows) ? kept : null;
}
async function ucRecentFetch() {
  try {
    const pages = await Promise.all([1, 2].map((p) => ucGet('/api/ccourt/recent?page=' + p, 8000).catch((e) => (p === 1 ? Promise.reject(e) : null))));
    const rec = { v: 1, got: Date.now(), rows: ucRecentRows(pages.flatMap((d) => (d && Array.isArray(d.items) ? d.items : []))) };
    store.put('kv', UC_RECENT, rec).catch(() => {});
    return rec;
  } catch (e) { return null; }
}
// the statistics' rows and the recent ones they do not hold yet
const ucRows = (rec) => { const have = new Set((rec.rows || []).map((r) => r.no)); return [...(rec.rows || []), ...(rec.recent || []).filter((r) => !have.has(r.no))]; };
// One ask a session at most (another after 10 minutes when it failed; a session left open asks again past a day, or past
// three hours for the recent decisions)
export function unconstList() {
  const now = Date.now();
  const stale = ucIdx && (now - ucIdx.rec.got > UC_DAY || now - (ucIdx.rec.recentAt || 0) > UC_RECENT_AGE) && now - ucTried > 10 * 60e3 && navigator.onLine !== false;
  if (ucAsk && !stale) return ucAsk;
  ucTried = now;
  let me = null;
  // (a newer recent list than the one the bands were drawn with: into the list, for the cards drawn after it)
  const later = (p) => p.then((nw) => me.then(() => {
    if (nw && ucAsk === me && ucIdx && nw.got > (ucIdx.rec.recentAt || 0)) { ucIdx.rec.recent = nw.rows; ucIdx.rec.recentAt = nw.got; ucIdx.idx = ucIndex(ucRows(ucIdx.rec)); }
  })).catch(() => {});
  me = ucAsk = (async () => {
    // (the recent decisions never hold a band back once some were had: the kept list, of any age, draws the bands at once
    // and a newer one, asked meanwhile, serves the cards after it. Only the first time — none kept — is it waited for,
    // 1.2 s at most after the statistics: a card is drawn with its band within a moment, not long after it)
    const kept = await ucRecentKept();
    const fresh = kept && (Date.now() - kept.got < UC_RECENT_AGE || navigator.onLine === false);
    const rcP = fresh ? Promise.resolve(kept) : ucRecentFetch();
    const st = await ucStats();
    let rc = kept;
    if (!fresh && kept) later(rcP);
    else if (!kept) {
      rc = await Promise.race([rcP, new Promise((ok) => setTimeout(() => ok(undefined), 1200))]);
      if (rc === undefined) { rc = null; later(rcP); }
    }
    if (!st || !rc) setTimeout(() => { if (ucAsk === me) ucAsk = null; }, 10 * 60e3);   // (asked again later in this session: this ask, not one begun since)
    if (!st && !(rc && rc.rows.length)) return null;
    return { ...(st || { v: UC_V, got: 0, at: 0, asOf: '', rows: [] }), recent: rc ? rc.rows : [], recentAt: rc ? rc.got : 0 };
  })().then((rec) => { ucIdx = rec ? { rec, idx: ucIndex(ucRows(rec)) } : null; return ucIdx; });
  return ucAsk;
}
// the cards on screen, marked once each: an article's card by its 국가법령정보센터 link (law and article as the card built it),
// a law's page by its own. Watched from the first law text asked, so no other screen pays for it.
const LGK = 'https://www.law.go.kr/법령/';
function ucWhere(href) {
  let p;
  try { p = decodeURIComponent(String(href || '')); } catch (e) { return null; }
  if (!p.startsWith(LGK)) return null;
  const [name, at] = p.slice(LGK.length).split('/');
  if (!name || name === '신구법비교') return null;
  if (at === undefined) return { law: name };
  const m = /^제(\d{1,4})조(?:의(\d{1,3}))?$/.exec(at);
  return m ? { law: name, art: Number(m[1]), sub: m[2] ? Number(m[2]) : 0 } : null;
}
function ucDecorate(card, u) {
  if (card.classList.contains('law-whole')) {
    const w = ucWhere(card.querySelector(':scope > .lc-h .lc-out')?.getAttribute('href'));
    if (!w) return;
    const lines = [...card.querySelectorAll('.lw-a[data-lq]')].map((b) => [b, articleQuery(b.dataset.lq)]).filter(([, q]) => q && typeof q.art === 'number');
    const band = ucLawBand(u.idx, w.law, u.rec.asOf, new Set(lines.map(([, q]) => q.art + ':' + (q.sub || 0))));
    if (band) (card.querySelector(':scope > .lc-renamed') || card.querySelector(':scope > .lc-h')).insertAdjacentHTML('afterend', band);
    for (const [b, q] of lines) {
      const tag = ucTag(u.idx, w.law, q.art, q.sub);
      if (tag) { const t = b.querySelector('b'); if (t) t.insertAdjacentHTML('beforeend', ' ' + tag); }
    }
    // (a long law's chapters are folded: each closed chapter says how many of its articles are marked)
    for (const d of card.querySelectorAll('.lw-fold')) {
      const n = d.querySelectorAll('.lw-a .vb-tag').length, t = d.querySelector(':scope > summary > b');
      if (n && t) t.insertAdjacentHTML('beforeend', ` <em class="vb-tag${d.querySelector('.lw-a .vb-tag.vb-un') ? ' vb-un' : ''}">위헌·헌법불합치 ${n}개 조</em>`);
    }
    return;
  }
  const w = ucWhere(card.querySelector(':scope > .lc-acts a[href^="https://www.law.go.kr/"]')?.getAttribute('href'));
  if (!w || typeof w.art !== 'number') return;
  const band = ucArticleBand(u.idx, w.law, w.art, w.sub), t = card.querySelector(':scope > .lc-t');
  if (band && t) t.insertAdjacentHTML('beforebegin', band);
}
let ucWatching = false, ucQueued = false;
function ucScan() {
  ucQueued = false;
  const cards = [...document.querySelectorAll('.law-card:not([data-vb])')].filter((c) => c.querySelector(':scope > .lc-h'));
  if (!cards.length) return;
  for (const c of cards) c.dataset.vb = '';
  unconstList().then((u) => { if (u) for (const c of cards) if (c.isConnected && !c.querySelector('.vb-band')) ucDecorate(c, u); }).catch(() => {});
}
function ucWatch() {
  if (ucWatching || typeof document === 'undefined' || typeof MutationObserver === 'undefined' || !document.body) return;
  ucWatching = true;
  new MutationObserver(() => { if (!ucQueued) { ucQueued = true; setTimeout(ucScan, 30); } }).observe(document.body, { childList: true, subtree: true });
  // (asked now, while the law's text is still coming: the list — and the recent decisions, which a card's band would
  // otherwise wait for — is mostly there by the time the first card is drawn, so its band comes with it, not after)
  if (api.hasToken() && api.base()) unconstList().catch(() => {});
  ucScan();
}


/* ---------------- 구법 조문 · 전부개정 · 별표 · 정의 조항 (8차) ----------------
   A judgment or a paper cites a law as it read then ("구 식품위생법(2009. 2. 6. 법률 제9432호로 전부 개정되기 전의 것) 제58조
   제1항"). After a 전부개정 the same number is another article (today's 식품위생법 제58조 is the 심의위원회's), so the article
   is found as it read on that day: from the record worked out beforehand (lawhist) while it reaches back that far, else from
   the mirror's version of that day — the version just before each 전부개정 is listed beforehand for every file of the mirror
   (lawhist/whole/: 1,512 files, by folder in 16 parts), so the commonest ask, "… 전부개정되기 전의 것", needs no list of
   versions from GitHub at all; any other day takes that list (the server's copy first). What took the old article's place is
   found as a reader would look for it: a map checked by hand, then today's articles whose titles and words the old one shares. */
// a day however it is written — 2007-06-01, 20070601, 2007. 6. 1. — as YYYY-MM-DD ('' when it is none)
const dayOf = (s) => {
  const t = String(s || '').trim();
  const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(t) || /^(\d{4})\s*[.년]\s*(\d{1,2})\s*[.월]\s*(\d{1,2})/.exec(t);
  return m ? `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}` : '';
};
const dotDay = (s) => { const d = dayOf(s); return d ? `${d.slice(0, 4)}. ${Number(d.slice(5, 7))}. ${Number(d.slice(8))}.` : String(s || ''); };
// lawhist/whole/<k>.json: which part holds a folder (law_hist.py shard: the sum of its letters, mod 16)
const wholeShard = (name) => { let n = 0; for (const c of String(name)) n += c.codePointAt(0); return n % 16; };
const wholeParts = new Map();
function wholePart(k, sub = 'whole') {
  const id = sub + ':' + k;
  if (!wholeParts.has(id)) {
    wholeParts.set(id, (async () => {
      const key = `law${sub}:${k}`;
      const kept = await store.get('kv', key).catch(() => null);
      if (kept && kept.d && (Date.now() - kept.at < 7 * 864e5 || navigator.onLine === false)) return kept.d;
      try {
        const r = await fetch(new URL(`./lawhist/${sub}/${k}.json`, import.meta.url));
        if (!r.ok) throw new Error(String(r.status));
        const d = await r.json();
        store.put('kv', key, { at: Date.now(), d }).catch(() => {});
        return d;
      } catch (e) { wholeParts.delete(id); return (kept && kept.d) || null; }
    })());
  }
  return wholeParts.get(id);
}
// a file's 전부개정 (and 폐지제정), newest first: [{ d, pre (the version before it), preD }] — [] when none or not known
async function wholeRevisions(dir, file) {
  const part = await wholePart(wholeShard(dir)).catch(() => null);
  const rows = (part && part.files && part.files[`${dir}/${file}`]) || [];
  return rows.map(([d, pre, preD]) => ({ d, pre: /^[0-9a-f]{40}$/.test(pre || '') ? pre : '', preD: preD || '' }));
}
// (seed: the same name written anew, while lawhist/whole cannot be had)
const WHOLE_REV = {
  식품위생법: [{ upto: '2009-02-06', date: '2009. 2. 6.' }],
};
const SUCC = {   // old article → today's, checked by hand (the old text, and the article that took over its subject)
  '정치자금에관한법률|30': [{ law: '정치자금법', art: 45 }],   // (정치자금 부정수수죄)
  '식품위생법|58': [{ law: '식품위생법', art: 75 }],          // (허가의 취소 등 → 허가취소 등)
  '국회의원선거법|33': [{ law: '공직선거법', art: 56 }],      // (기탁금: 88헌가6)
  '국회의원선거법|34': [{ law: '공직선거법', art: 57 }],      // (기탁금의 반환 등)
};
// one version of a file, read once a session (kept in memory: the few a page asks for)
const versions = new Map();
async function readVersion(dir, file, sha) {
  const id = `${dir}/${file}@${sha}`;
  if (!versions.has(id)) {
    versions.set(id, mirrorFile(dir, file, sha).then((md) => (md ? { ...mirrorArts(md), byls: attachments(md) } : null)).catch((e) => { versions.delete(id); throw e; }));
    if (versions.size > 6) versions.delete(versions.keys().next().value);
  }
  return versions.get(id);
}
// the version of a file as it stood on a day (on or before it; before: strictly before), by the list made beforehand when the
// day falls just before a 전부개정, else by the file's list of versions: { sha, d, kind, whole (a 전부개정 lies after it) }
async function versionOn(dir, file, want, before, listOnly = false) {
  const inDay = (d) => !!d && (before ? d < want : d <= want);
  const revs = await wholeRevisions(dir, file);
  if (listOnly) return versionOnList(dir, file, revs, inDay);
  // (the nearest 전부개정 after the day — newest first, so the last of those after it — and the version just before it: the
  // one that stood on the day, when that version is not later than the day itself)
  const next = revs.filter((r) => !inDay(r.d)).pop();
  if (next && next.pre && (!next.preD || inDay(next.preD))) return { sha: next.pre, d: next.preD, kind: '', whole: true, ...(next.preD ? {} : { undated: true }) };
  return versionOnList(dir, file, revs, inDay);
}
async function versionOnList(dir, file, revs, inDay) {
  let vs = null;
  try { vs = await versionList(dir, file); } catch (e) { vs = null; }
  if (!vs || !vs.length) return null;
  const v = vs.find((x) => x.d > '1970-01-01' && inDay(x.d));
  if (!v) return null;
  return { sha: v.sha, d: v.d, kind: v.kind, whole: revs.some((r) => r.d > v.d && !inDay(r.d)) };
}
// an article as it stood on a day: the last version promulgated on or before it (opt.before: strictly before — for
// "… 개정되기 전의 것"). From the record worked out beforehand while it reaches that day, else (opt.read, the default) the
// mirror's version of that day, across a 전부개정 too. inForce: that version had taken effect by then (one promulgated but
// coming later is still the one a judgment of that day names). null: no such article then, or the day is before what the
// mirror keeps (공직선거법 before 2005. 8. 4.), or the law is not one the mirror keeps. Never rejects.
//   → { law, art, sub, title, text, d, eff, no, kind, inForce, src, whole? }
export async function versionAt(lawName, art, date, sub = 0, opt = {}) {
  try {
    const want = dayOf(date), before = !!opt.before;
    if (!want || typeof art !== 'number') return null;
    const inDay = (d) => !!d && (before ? d < want : d <= want);
    let law;
    try { law = await lawText(lawName); } catch (e) { return null; }
    const x = findArt(law, art, sub) || { art, sub, title: '', text: '' };
    const out = (e, src, extra = {}) => ({ law: law.full || law.title || String(lawName), art, sub, title: e.title || '', text: e.text || '', d: e.d || '', eff: e.eff || '', no: e.no || '', kind: e.kind || '', inForce: !e.eff || e.eff <= want, src, ...extra });
    const h = await artHistory(law, x).catch(() => null);
    if (h && h.list && h.list.length) {
      for (const e of h.list) {   // (newest first)
        if (!inDay(e.d)) continue;
        return e.gone ? null : out(e, h.src);
      }
      const base = h.list[h.list.length - 1];
      if (h.src === 'built' || h.done) {
        if (base.how === 'new' || (base.how === 'whole' && base.kind === '제정')) return null;   // (the article did not exist yet)
        if (base.how === 'start') return null;   // (the mirror has nothing older: its record starts here)
      }
    }
    if (opt.read === false) return null;
    const own = LAWS[law.key];
    let dir = law.dir || '', file = law.file || '';
    if (!file) { const m = own ? await loadAny('mirror:' + law.key, own.full).catch(() => null) : await resolveLaw(law.full).catch(() => null); dir = (m && m.dir) || dir; file = (m && m.file) || ''; }
    if (!dir || !file) return null;
    const key = `lawat:${dir}/${file}|${want}${before ? '<' : ''}|${artKey({ art, sub })}`;
    const kept = await store.get('kv', key).catch(() => null);
    if (kept && kept.v === 1) return kept.r;
    let v = await versionOn(dir, file, want, before);
    if (!v) return null;
    let g = await readVersion(dir, file, v.sha).catch(() => null);
    if (!g) return null;
    // (the version before a 전부개정 whose day the list made beforehand does not know — 1970-01-01 in the mirror — may be
    // later than the day asked: then that day's own version, by the file's list)
    const vd = ymdDash(g.promulgated);
    if (v.undated && vd && !inDay(vd)) {
      v = await versionOn(dir, file, want, before, true);
      g = v ? await readVersion(dir, file, v.sha).catch(() => null) : null;
      if (!g) return null;
    }
    const a = g.arts.find((y) => y.art === art && y.sub === sub);
    const r = a ? out({ title: a.title, text: a.text, d: ymdDash(g.promulgated) || v.d, eff: ymdDash(g.rev), no: g.num, kind: v.kind }, 'mirror', v.whole ? { whole: true } : {}) : null;
    store.put('kv', key, { v: 1, r }).catch(() => {});
    return r;
  } catch (e) { return null; }
}
// what took an old article's place. A rename keeps the numbers: the same article of today's law (whole: false). A 전부개정
// (a new name, or the same name written anew: 식품위생법 2009) or a repeal renumbers: the candidates are those the map above
// names, then today's articles as alike as can be found — the old article's title and words (its text as versionAt finds it)
// and the words the citing text gives (context.words) — never the same number unless its title is the old one's.
//   → { whole, note, now, candidates: [{ law, art, sub, title, score, why }], old? ({ title, text, d }) }
const titleKey = (t) => NAME_NORM(String(t || '').replace(/<[^<>]*>/g, '')).replace(/[()]/g, '').replace(/(?:의|등|및)/g, '');
const grams = (t) => { const f = NAME_NORM(String(t || '').replace(/<[^<>]*>/g, '').replace(/[^가-힣\s]/g, ' ')), g = new Set(); for (let i = 0; i + 1 < f.length; i++) g.add(f.slice(i, i + 2)); return g; };
const dice = (A, B) => { if (!A.size || !B.size) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return (2 * n) / (A.size + B.size); };
export async function successor(oldName, art, date = '', context = {}) {
  const base = { whole: false, note: '', now: '', candidates: [] };
  try {
    const o = oldLaw(oldName), id = NAME_NORM(oldName), want = dayOf(date);
    const now = o ? o.now || '' : resolveName(id) || String(oldName || '').trim();
    // (the same name written anew after the day: the nearest 전부개정 on or after it — the day a note names is that
    // 전부개정's own, "2009. 2. 6. … 전부 개정되기 전의 것")
    let rev = null;
    if (!o && want) {
      const hit = await resolveLaw(now).catch(() => null);
      const revs = hit && hit.dir && hit.file ? await wholeRevisions(hit.dir, hit.file) : [];
      const after = revs.filter((r) => r.d >= want).pop();
      if (after) rev = { upto: after.d, date: dotDay(after.d) };
      else if (!revs.length) rev = (WHOLE_REV[id] || []).find((r) => want <= r.upto) || null;
    }
    const whole = !!(o ? o.whole || o.gone : rev);
    const was = o ? o.name : '';
    const note = o && o.gone ? `${was}${josa(was, '은', '는')} ${dotDay(o.gone)} 폐지되었습니다${o.now ? `. 뒤를 이은 법률은 ${o.nowText || o.now}입니다` : ''}.`
      : o && o.whole ? `${was}${josa(was, '은', '는')} ${o.date} 전부개정으로 ${o.now}${josa(o.now, '이', '가')} 되었습니다. 조문 번호가 달라졌을 수 있습니다.`
      : o ? `${was}${josa(was, '은', '는')} ${o.date} ${o.now}${josa(o.now, '으로', '로')} 이름이 바뀌었습니다. 조문 번호는 같습니다.`
      : rev ? `${rev.date} 전부개정 전 조문입니다. 조문 번호가 달라졌을 수 있습니다.` : '';
    if (typeof art !== 'number' || !now) return { ...base, whole, note, now };
    if (!whole) return { whole, note, now, candidates: [{ law: now, art, sub: 0, title: await titleOf(now, art), score: 1, why: 'same' }] };
    const out = [];
    for (const c of SUCC[`${id}|${art}`] || []) out.push({ law: c.law, art: c.art, sub: c.sub || 0, title: await titleOf(c.law, c.art, c.sub || 0), score: 1, why: 'map' });
    // the old article as it read (before the 전부개정): the same name's version of that day — none for a law the mirror
    // never kept under that name (정치자금에관한법률) or a repealed one
    // (and a law a 전부개정 renamed, when the mirror kept its versions under today's name: 임대주택법 → 민간임대주택에 관한
    // 특별법, read at the day before that 전부개정 — or before the day the citation names, when it is earlier)
    let renamedAt = '';
    if (o && o.whole && !o.gone && now) {
      const od = dayOf(o.date), hit = od ? await resolveLaw(now).catch(() => null) : null;
      const revs = hit && hit.dir && hit.file ? await wholeRevisions(hit.dir, hit.file) : [];
      if (revs.some((r) => r.d === od && r.pre)) renamedAt = want && want < od ? want : od;
    }
    const old = !o && rev ? await versionAt(now, art, rev.upto, 0, { before: true })
      : renamedAt ? await versionAt(now, art, renamedAt, 0, { before: true }) : null;
    const words = [...new Set((context.words || []).map((w) => NAME_NORM(w)).filter((w) => w.length >= 2))];
    let law = null;
    try { law = await lawText(now); } catch (e) { /* none: the map's alone */ }
    if (law && (old || words.length)) {
      const oT = old ? titleKey(old.title) : '', oG = old ? grams(old.title) : null, oX = old ? grams(old.text) : null;
      for (const a of law.arts || []) {
        if (out.some((c) => c.art === a.art && (c.sub || 0) === a.sub)) continue;
        const tk = titleKey(a.title);
        if (a.art === art && !a.sub && !(oT && tk === oT)) continue;   // (the same number is another article, unless titled the same)
        let t = 0, x = 0, w = 0;
        if (old) { t = oT && tk === oT ? 1 : dice(oG, grams(a.title)); x = dice(oX, grams(a.text)); }
        if (words.length) { const hay = NAME_NORM(a.title + a.text); w = words.filter((q) => hay.includes(q)).length / words.length; }
        const score = old ? 0.55 * t + 0.35 * x + (words.length ? 0.1 * w : 0) : 0.5 * w;
        if (score >= 0.2) out.push({ law: now, art: a.art, sub: a.sub, title: a.title || '', score: Math.round(score * 100) / 100, why: old && t >= 0.8 ? 'title' : old && x >= w ? 'text' : 'words' });
      }
    }
    out.sort((p, q) => q.score - p.score);
    return { whole, note, now, candidates: out.slice(0, 5), ...(old ? { old: { title: old.title, text: old.text, d: old.d } } : {}) };
  } catch (e) { return base; }
}
// the old articles an article of today's law was before: the same number under each name the law had only by a rename,
// and those the map above says a 전부개정 or a repeal turned into it (정치자금에관한법률 제30조 → 정치자금법 제45조). An old
// article of the same name (식품위생법 제58조 before 2009) is not one: asked by name and number it is today's 제58조 too.
//   → [{ name, art, sub, whole }]
export function oldArticlesOf(law, art, sub = 0) {
  const id = lawId(law), out = [];
  for (const o of oldNamesOf(law)) if (!o.whole && !o.gone) out.push({ name: o.name, art, sub, whole: false });
  for (const [k, cs] of Object.entries(SUCC)) {
    const [name, a] = k.split('|');
    if (lawId(name) === id) continue;
    if (cs.some((c) => lawId(c.law) === id && c.art === art && (c.sub || 0) === sub)) out.push({ name, art: Number(a), sub: 0, whole: true });
  }
  return out;
}
async function titleOf(name, art, sub = 0) {
  try { const a = findArt(await lawText(name), art, sub); return (a && a.title) || ''; } catch (e) { return ''; }
}

/* ---------------- 별표 ----------------
   The mirror's head of each version lists its 별표 and 서식 with their 원문 at 국가법령정보센터 (첨부파일: 별표번호,
   별표가지번호, 별표구분, 제목, 파일링크 (HWP), PDF링크) — so a 별표 is found with the law itself, no key or other service. */
const unent = (s) => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
export function attachments(md) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(String(md || ''));
  if (!m) return [];
  const at = m[1].indexOf('\n첨부파일:');
  if (at < 0) return [];
  const out = [];
  let cur = null;
  for (const l of m[1].slice(at + 1).split('\n').slice(1)) {
    if (/^[^\s-]/.test(l)) break;   // (the next field of the head; the list's items begin '- ')
    const f = /^\s*(-\s+)?([^:\s][^:]*):\s*'?(.*?)'?\s*$/.exec(l);
    if (!f) continue;
    if (f[1]) { cur = {}; out.push(cur); }
    if (cur) cur[f[2].trim()] = unent(f[3]);
  }
  return out.map((x) => ({ k: x['별표구분'] || '별표', n: Number(x['별표번호']) || 0, s: Number(x['별표가지번호']) || 0, t: (x['제목'] || '').trim(), f: /^https:\/\/www\.law\.go\.kr\//.test(x['파일링크'] || '') ? x['파일링크'] : '', p: /^https:\/\/www\.law\.go\.kr\//.test(x['PDF링크'] || '') ? x['PDF링크'] : '' })).filter((x) => x.n);
}
const bylNo = (n) => { const m = /^\s*(\d{1,3})(?:\s*의\s*(\d{1,2}))?/.exec(String(n || '')); return m ? { n: Number(m[1]), s: m[2] ? Number(m[2]) : 0 } : null; };
const bylLabel = (b) => `${b.k || '별표'} ${b.n}${b.s ? '의' + b.s : ''}`;
const currentByls = new Map();
// one 별표 of a law (or of its version on a day: opt.date, opt.before — a judgment's "구 … 시행규칙 [별표 15]"): its title and
// its 원문 at 국가법령정보센터, PDF and HWP. Never rejects: when it cannot be found, the law's page there (search), where
// its 별표 are listed.   → { law, n, title, name, links: [{ kind: 'pdf' | 'hwp', url }], at, search, gone? }
export async function byl(law, n, opt = {}) {
  const name = String(law || '').trim(), no = String(n || '').trim(), want = bylNo(no);
  const out = { law: name, n: no, title: `[별표 ${no}]`, name: '', links: [], at: '', search: name ? lawGoKr.law(name) : lawGoKr.search('별표 ' + no) };
  if (!name || !want) return out;
  try {
    const hit = await resolveLaw(name);
    if (!hit || !hit.dir || !hit.file || hit.guess) return out;
    out.search = lawGoKr.law(hit.name || name);
    let list = null, at = '';
    const day = dayOf(opt.date);
    if (day) {
      const v = await versionOn(hit.dir, hit.file, day, !!opt.before);
      const g = v ? await readVersion(hit.dir, hit.file, v.sha) : null;
      if (g) { list = g.byls; at = ymdDash(g.promulgated) || v.d; }
    }
    if (!list) {
      const lw = await lawText(hit.name || name).catch(() => null);
      if (lw && Array.isArray(lw.byls)) { list = lw.byls; at = ymdDash(lw.promulgated); }
      else {
        const id = `${hit.dir}/${hit.file}`;
        if (!currentByls.has(id)) currentByls.set(id, mirrorFile(hit.dir, hit.file).then((md) => (md ? { byls: attachments(md), at: ymdDash(front(md).head['공포일자']) } : null)).catch(() => { currentByls.delete(id); return null; }));
        const c = await currentByls.get(id);
        if (c) { list = c.byls; at = c.at; }
      }
    }
    const b = (list || []).find((x) => (x.k || '별표') === '별표' && x.n === want.n && x.s === want.s);
    if (!b) return out;
    const links = [b.p ? { kind: 'pdf', url: b.p } : null, b.f ? { kind: 'hwp', url: b.f } : null].filter(Boolean);
    return { ...out, title: `[${bylLabel(b)}] ${b.t}`, name: b.t, links, at, ...(/^삭제/.test(b.t) ? { gone: true } : {}) };
  } catch (e) { return out; }
}
// where a text cites a 별표: "[별표 23]", "별표 23과 같다", "같은 법 시행규칙 [별표 15]", "별표 5의2" — each with its law: the one
// named just before it (a citation of an article of it, or its name), else the law the text is of (ctx.law: the article
// card's own). { law, n ('23', '5의2'), i, len, old? (the version note of a 구법 citation) }; none when no law is known.
// For data-byl links: bylRefs gives them with their attribute ready (cases.linkCases puts them with the others)
const BYL_RE = /(\[\s*)?별표\s*(\d{1,3})(?:\s*의\s*(\d{1,2}))?(?!\d)(\s*\])?/g;
export function scanByl(text, ctx = {}) {
  const t = corners(String(text || ''));
  const out = [];
  if (!/별표/.test(t)) return out;
  let cites = null;
  BYL_RE.lastIndex = 0;
  let m;
  while ((m = BYL_RE.exec(t))) {
    const nm = lawBefore(t, m.index);
    // ("…의별표": a word's end, not a citation — unless the word is a law's name, as old texts write it: "시행규칙별표 15")
    if (!m[1] && /[가-힣]$/.test(t.slice(Math.max(0, m.index - 1), m.index)) && !(nm && !nm.bare)) continue;
    let law = '', old = '';
    if (nm && !nm.bare) law = nm.law;
    else {
      if (!cites) cites = scanArticles(t);
      const c = cites.filter((x) => x.i + x.len <= m.index && m.index - (x.i + x.len) <= 6 && /^[\s,]*$/.test(t.slice(x.i + x.len, m.index))).pop();
      if (c) { law = c.law; old = c.old || ''; }
      else {
        const e2 = noteBefore(t, m.index);
        const same = SAME_LAW.exec(t.slice(Math.max(0, e2 - 16), e2));
        const prev = same ? (cites.filter((x) => x.i < m.index).pop() || null) : null;
        const again = prev ? lawSaidAgain(t, e2, { law: prev.law, foreign: false }) : null;
        if (again && e2 < m.index) old = verNote(t.slice(e2 + 1, t.lastIndexOf(')', m.index)));
        // (a 시행규칙's "영 별표 1" is its 시행령's, a 시행령's "법 별표 1" its 법률's: said by its kind, of the text's own law)
        const rel = !again && ctx.law ? /(?:^|[^가-힣])(영|법|법률|시행령|시행규칙|규칙)\s*$/.exec(t.slice(Math.max(0, e2 - 12), e2)) : null;
        if (again) law = again.law;
        else if (rel) {
          const base = String(ctx.law).replace(/\s*(?:시행령|시행규칙)$/, '').trim();
          const want = /^(?:영|시행령)$/.test(rel[1]) ? base + ' 시행령' : /^(?:법|법률)$/.test(rel[1]) ? base : base + ' 시행규칙';
          law = resolveName(NAME_NORM(want)) || (NAME_NORM(want) === NAME_NORM(ctx.law) ? ctx.law : '');
        } else if (ctx.law) law = ctx.law;
      }
    }
    if (!law || law === '구 헌법') continue;
    const n = m[2] + (m[3] ? '의' + m[3] : '');
    out.push({ law, n, i: m.index, len: m[0].length, ...(old ? { old } : {}) });
  }
  return out;
}
const bylEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const bylRefs = (text, law = '') => scanByl(text, { law }).map((b) => ({ ...b, attr: `data-byl="${bylEsc(b.law + '|' + b.n)}"${b.old ? ` data-byl-old="${bylEsc(b.old)}"` : ''}` }));

/* ---------------- 정의 조항 ----------------
   Where a law defines a word ("선거운동"이라 함은 …, "정치자금"이란 …, and the 호 of an article on definitions): worked out
   beforehand for the 76 laws of the record (lawhist/defs/: 603 words, by the word in 16 parts — one part of some 5 KB is
   asked for a word), and the laws read on this device this session besides. */
const esc8 = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
//   → [{ law, art, sub, para, sentence, def (an article on definitions) }], at most ten: the definitions articles first
export async function defines(word) {
  try {
    const w = String(word || '').trim(), key = NAME_NORM(w);
    if (key.length < 2) return [];
    const out = [], seen = new Set();
    const add = (r) => { const k = `${lawId(r.law)}|${r.art}|${r.sub}`; if (seen.has(k) || out.length >= 10) return; seen.add(k); out.push(r); };
    for (const k of [key, key + '등']) {
      const part = await wholePart(wholeShard(k), 'defs').catch(() => null);
      for (const [law, art, sub, para, sentence, head] of (part && part.terms && part.terms[k]) || []) add({ law, art, sub, para, sentence, def: !!head });
    }
    const re = new RegExp(`["“”'‘’]${esc8(w)}["“”'‘’]\\s*(?:\\(이\\)\\s*)?(?:이?라\\s*함은|이?란(?![가-힣]))`);
    for (const law of Object.values(mem)) {
      for (const a of (law && law.arts) || []) {
        const at = re.exec(a.text || '');
        if (!at) continue;
        const from = a.text.lastIndexOf('\n', at.index) + 1, to = a.text.indexOf('\n', at.index);
        const ps = paras(a), pi = ps.length > 1 ? ps.findIndex((p) => p.includes(at[0])) + 1 : 0;
        add({ law: law.full || law.title || '', art: a.art, sub: a.sub || 0, para: pi, sentence: a.text.slice(from, to < 0 ? undefined : to).trim().slice(0, 200), def: /정의|용어의\s*뜻/.test(a.title || '') });
      }
    }
    return out.sort((p, q) => (q.def ? 1 : 0) - (p.def ? 1 : 0));
  } catch (e) { return []; }
}
