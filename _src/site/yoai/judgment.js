/* YO아이 — 판결문 분석. 사용자가 넣은 판결문(대법원·하급심 판결서, 헌법재판소 결정문, 종합법률정보의 【】 양식)을
   규칙만으로 읽어 사건 정보 · 사실관계 · 소송의 경과 · 판결 이유 · 쟁점으로 나눈다.
   AI도 바깥 정보도 쓰지 않는다. 판결문에 없는 내용은 지어내지 않고, 찾지 못한 것은 ‘찾지 못함’으로 둔다.
   정리 틀은 안요환의 판례 연구 방식을 따른다: 대상 판결 → 1. 사실관계 → 2. 소송의 경과(가. 제1심 나. 제2심 다. 제3심 …, 심급마다 판결을 각주로)
   → 3. 판결이유(주요 부분을 그대로 발췌, 생략은 [･･･]) → 4. 쟁점.
   analyzeJudgment(pages) → 결과 객체(아래 맨 끝 참조). DOM을 쓰지 않으므로 node에서도 시험할 수 있다. */

export const OMIT = '[･･･]';

/* ---------------- 글자 다듬기 ---------------- */
const sp = (s) => String(s || '').replace(/[  -​　]/g, ' ').replace(/\s+/g, ' ').trim();
const nospace = (s) => String(s || '').replace(/\s+/g, '');
// ‘주 문’ ‘이 유’ ‘청 구 취 지’처럼 한 글자씩 띄운 머리말은 붙인다
const collapse = (l) => (/^[【\[<〈]?\s*(?:[가-힣0-9]\s){1,8}[가-힣0-9]\s*[】\]>〉]?$/.test(l) && /[가-힣].*[가-힣]/.test(l) ? l.replace(/\s+/g, '') : l);
const NOISE = /판결서\s*인터넷\s*열람|열람용|무단\s*(전재|배포)|출력\s*일시|^사용자\s*[:：]|^page\s*\d+|^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/i;
const PAGE_NO = /^(?:[-–—]\s*)?\d{1,4}(?:\s*[-–—])?$|^\d{1,4}\s*\/\s*\d{1,4}$|^[-–—]\s*\d{1,4}\s*\/\s*\d{1,4}\s*[-–—]$|^\(\s*\d{1,4}\s*\)$/;

/* ---------------- 날짜·법원·사건번호 ---------------- */
const DATE_RE = /((?:19|20)\d{2})\s*[.．년]\s*(\d{1,2})\s*[.．월]\s*(\d{1,2})\s*[.．일]?/;
export const kDate = (s) => { const m = String(s || '').match(DATE_RE); return m ? `${m[1]}. ${+m[2]}. ${+m[3]}.` : ''; };
const CASE_NO = /((?:19|20)\d{2}|[4-9]\d)\s?(헌[가나다라마바사아]|[가-힣]{1,3})\s?(\d{1,7})(?![\d])/;
const CASE_NO_G = new RegExp(CASE_NO.source, 'g');
export const caseCode = (no) => { const m = String(no || '').replace(/\s/g, '').match(/^\d+(\D+?)\d+/); return m ? m[1] : ''; };
const COURT_ABBR = [[/^서울중앙지법/, '서울중앙지방법원'], [/^서울(동부|서부|남부|북부)지법/, '서울$1지방법원'], [/^서울행법/, '서울행정법원'], [/^서울가법/, '서울가정법원'], [/^서울회생법원/, '서울회생법원'],
  [/^([가-힣]{2,4})고법(?:\s?\(([가-힣]+)\))?/, (m, a, b) => `${a}고등법원${b ? `(${b})` : ''}`], [/^([가-힣]{2,4})지법\s?([가-힣]{1,4})지원/, '$1지방법원 $2지원'], [/^([가-힣]{2,4})지법/, '$1지방법원'], [/^([가-힣]{2,4})가법/, '$1가정법원'], [/^([가-힣]{2,4})행법/, '$1행정법원'], [/^특허법원/, '특허법원'], [/^헌재/, '헌법재판소'], [/^대법(?!원)/, '대법원']];
export function fullCourt(c) { c = sp(c); for (const [re, to] of COURT_ABBR) if (re.test(c)) return c.replace(re, to); return c; }
const COURT_RE = /(대법원|헌법재판소|특허법원|[가-힣]{2,6}(?:고등|지방|가정|행정|회생)법원(?:\s?\([가-힣]+\))?(?:\s?[가-힣]{1,5}지원)?|[가-힣]{2,4}(?:고법|지법|가법|행법)(?:\s?[가-힣]{1,4}지원)?|헌재|대법)/;
// 「법원 날짜 선고 사건번호 판결」 꼴의 인용 하나를 읽는다(약칭 법원명은 풀어 쓴다)
const CITE_RE = new RegExp(`${COURT_RE.source}\\s*,?\\s*${DATE_RE.source}\\s*(?:자\\s*|선고\\s*)?((?:(?:19|20)\\d{2}|[4-9]\\d)\\s?(?:헌[가나다라마바사아]|[가-힣]{1,3})\\s?\\d{1,7}(?:\\s?[,，]\\s?(?:(?:19|20)\\d{2}|[4-9]\\d)?\\s?(?:헌[가나다라마바사아]|[가-힣]{1,3})?\\s?\\d{1,7})*(?:\\s?\\((?:병합|반소|참가)\\))?)\\s*(전원합의체|전원재판부|제\\s?\\d+\\s?지정재판부)?\\s*(판결|결정|명령)?`, 'g');
export function parseCite(s) {
  CITE_RE.lastIndex = 0; const m = CITE_RE.exec(String(s || '')); if (!m) return null;
  return { court: fullCourt(m[1]), date: `${m[2]}. ${+m[3]}. ${+m[4]}.`, no: m[5].replace(/\s+/g, ''), bench: m[6] ? m[6].replace(/\s+/g, '') : '', kind: m[7] || '', raw: m[0] };
}
export function citesIn(text) { const out = []; CITE_RE.lastIndex = 0; for (const m of String(text || '').matchAll(CITE_RE)) out.push({ court: fullCourt(m[1]), date: `${m[2]}. ${+m[3]}. ${+m[4]}.`, no: m[5].replace(/\s+/g, ''), bench: m[6] ? m[6].replace(/\s+/g, '') : '', kind: m[7] || '', at: m.index }); return out; }
/* 인용 표기: 대법원 1993. 12. 10. 선고 93다12947 판결 / 헌법재판소 2007. 6. 28. 선고 2004헌마644 전원재판부 결정 / 대법원 2020. 1. 1. 자 2019마1234 결정 */
export function citeText(c) {
  if (!c || !c.no) return '';
  const cc = c.court === '헌법재판소', kind = c.kind || (cc ? '결정' : /^(마|스|그|라|카|모|초|브|으|즈)/.test(caseCode(c.no)) ? '결정' : '판결');
  const bench = c.bench || (cc ? '전원재판부' : '');
  const sel = !cc && kind === '결정' ? '자' : '선고';
  return `${c.court || '○○법원'} ${c.date || '○. ○. ○.'} ${sel} ${c.no}${bench ? ` ${bench}` : ''} ${kind}`;
}
/* 사건 종류 부호로 심급을 가린다 */
const FIRST = /^(가합|가단|가소|고합|고단|고정|고약|구합|구단|드합|드단|느합|느단|카합|카단|카기|하합|하단|회합|회단|허|재가합|재가단)$/;
const SECOND = /^(나|노|누|르|브|라|재나|재노|재누)$/;
const THIRD = /^(다|도|두|므|스|마|그|후|추|모|재다|재도|재두|다카|누)$/; // 누: 옛 대법원 행정 사건
export function stageOf(c) {
  if (!c) return '';
  if (c.court === '헌법재판소' || /^헌/.test(caseCode(c.no))) return '헌법재판';
  if (c.court === '대법원') return '상고심';
  const k = caseCode(c.no);
  if (FIRST.test(k)) return '제1심';
  if (SECOND.test(k) || /고등법원|특허법원/.test(c.court)) return '항소심';
  return /지방법원|가정법원|행정법원|지원/.test(c.court) ? '제1심' : '';
}

/* ---------------- 쪽 → 줄 → 문단 ---------------- */
function linesOf(pages) {
  const raw = pages.map((t) => String(t || '').replace(/\r/g, '').split('\n').map((l) => sp(l.replace(/[\ue000-\uf8ff]/g, ' ')))); // 글꼴이 사용자 영역 글자로 내보낸 기호(쪽 번호의 ‘-’ 따위)는 지운다
  // 여러 쪽에 똑같이 되풀이되는 짧은 줄(머리글·바닥글·워터마크)은 뺀다
  const cnt = new Map();
  raw.forEach((ls) => new Set(ls.filter((l) => l && l.length <= 60)).forEach((l) => cnt.set(l, (cnt.get(l) || 0) + 1)));
  const rep = pages.length >= 3 ? Math.max(3, Math.ceil(pages.length * 0.5)) : Infinity;
  const out = [];
  raw.forEach((ls, pi) => ls.forEach((l) => {
    if (!l) { out.push({ t: '', p: pi + 1 }); return; }
    if (PAGE_NO.test(l) || NOISE.test(l) || cnt.get(l) >= rep) return;
    out.push({ t: collapse(l.replace(/○\s+(?=○)/g, '○').replace(/○\s+(의|은|는|이|가|을|를|과|와|에게|에|로|으로)(?=\s)/g, '○$1')), p: pi + 1 });
  }));
  return out;
}
const MARK_RE = /^(?:(\d{1,2})\.\s+(?!\d{1,2}\s*\.)|([가-하])\.\s+|(\d{1,2})\)\s*|([가-하])\)\s*|\((\d{1,2})\)\s*|\(([가-하])\)\s*|([①-⑳])\s*)(?=\S)/;
const SEC_LABELS = { 주문: 'order', 청구취지: 'claim', 청구취지및항소취지: 'claim', 청구취지및상고취지: 'claim', 항소취지: 'claim', 상고취지: 'claim', 신청취지: 'claim', 신청취지및항고취지: 'claim', 청구취지및부대항소취지: 'claim', 항소취지및부대항소취지: 'claim', '청구취지,항소취지및부대항소취지': 'claim',
  이유: 'reasons', 판시사항: 'points', 판결요지: 'summary', 결정요지: 'summary', 요지: 'summary', 참조조문: 'refLaws', 참조판례: 'refCases', 따름판례: 'follow', 전문: 'full', 재항고이유: 'reasons' };
const secKey = (t) => { const k = nospace(t).replace(/^[【\[<〈]|[】\]>〉:：]$/g, '').replace(/[【】\[\]<>〈〉:：]/g, ''); return SEC_LABELS[k] ? { key: SEC_LABELS[k], label: k } : null; };
// 【주문】 상고를 기각한다.  처럼 머리말과 내용이 한 줄에 있는 경우
const INLINE_SEC = /^【\s*([^】]{1,16})\s*】\s*(.*)$/;
const PARTY = '(?:원\\s*고|피\\s*고\\s*인|피\\s*고|청\\s*구\\s*인|피\\s*청\\s*구\\s*인|신\\s*청\\s*인|피\\s*신\\s*청\\s*인|채\\s*권\\s*자|채\\s*무\\s*자|재\\s*항\\s*고\\s*인|항\\s*고\\s*인|상\\s*대\\s*방|제\\s*청\\s*법\\s*원|제\\s*청\\s*신\\s*청\\s*인|검\\s*사|변\\s*호\\s*인|(?:원고|피고)?\\s*보\\s*조\\s*참\\s*가\\s*인|독립당사자참가인|참\\s*가\\s*인|소\\s*송\\s*대\\s*리\\s*인|국\\s*선\\s*대\\s*리\\s*인|대\\s*리\\s*인|사\\s*건\\s*본\\s*인|이해관계인|선\\s*정\\s*자|당\\s*해\\s*사\\s*건)(?:들)?(?:\\s*\\([^)]{1,12}\\))?';
const APPEAL = '(?:재항고인|항고인|상고인|피상고인|항소인|피항소인|부대항소인|부대피항소인|피고인|피감호청구인|피부착명령청구자|상대방)';
const PARTY_RE = new RegExp(`^[【\\[]?\\s*(${PARTY}(?:\\s*[,，]\\s*${APPEAL}(?:\\s*겸\\s*${APPEAL})*)*)(?=[\\s,，:：】\\]]|$)\\s*[】\\]]?\\s*[:：]?\\s*(.*)$`);
const FIELD_RE = /^[【\[]?\s*(사\s*건|원\s*심\s*판\s*결|원\s*판\s*결|제\s*1\s*심\s*판\s*결|환\s*송\s*판\s*결|환\s*송\s*전\s*원\s*심\s*판\s*결|변\s*론\s*종\s*결|판\s*결\s*선\s*고|선\s*고\s*일?|결\s*정\s*일|심\s*판\s*대\s*상\s*조\s*문)\s*[】\]]?\s*[:：]?\s*(.*)$/;
const SIGN_RE = /^(?:재판장\s*)?(?:대법원장\s*|대법관\s*|재판관\s*|(?:부장)?판사\s*|주\s*심\s*대법관\s*)([가-힣○]{2,4})(?=\s|$|\()/;
function isBreakLine(t, inHead) { return MARK_RE.test(t) || /^[【\[]/.test(t) || secKey(t) || inHead && (FIELD_RE.test(t) || PARTY_RE.test(t) && t.length < 80) || SIGN_RE.test(t) && t.length < 60 || /^(판\s*결|결\s*정)$/.test(nospace(t)); }
const ENDS = /(?:[다요음함임됨]|[가-힣]\))[.。](?:["”’)」』])?$|[다요][.。]["”’]$/;
function parasOf(L) {
  const lens = L.filter((x) => x.t.length > 20).map((x) => x.t.length).sort((a, b) => a - b);
  const full = lens.length ? lens[Math.floor(lens.length * 0.8)] : 60;
  const out = []; let cur = null, inHead = true;
  const flush = () => { if (cur && cur.t) out.push(cur); cur = null; };
  for (const x of L) {
    const t = x.t;
    if (!t) { flush(); continue; }
    const im = t.match(INLINE_SEC);
    if (im && secKey(im[1])) { flush(); const k = secKey(im[1]); if (k.key === 'order' || k.key === 'reasons') inHead = false; if (k.key === 'full') inHead = true; out.push({ t: `【${nospace(im[1])}】`, p: x.p }); if (im[2]) cur = { t: im[2], p: x.p }; continue; }
    // ‘원심판결 … 선고 92나36689’ 다음 줄의 ‘판결’은 머리말이 아니라 그 인용의 끝이다
    if (cur && /^(판결|결정)$/.test(nospace(t)) && /선고\s*\S+$|자\s*\S+$|\d$/.test(cur.t)) { cur.t += ' ' + nospace(t); cur.last = t.length; continue; }
    if (cur && isBreakLine(t, inHead) && (!MARK_RE.test(t) || ENDS.test(cur.t) || (cur.last || 0) < full * 0.75 || /[:：]$/.test(cur.t))) flush();
    if (secKey(t) || /^(판결|결정)$/.test(nospace(t))) { flush(); const k = secKey(t); if (k && (k.key === 'order' || k.key === 'reasons')) inHead = false; if (k && k.key === 'full') inHead = true; out.push({ t: nospace(t).replace(/[【】\[\]]/g, ''), p: x.p, label: true }); continue; }
    // 줄을 이을 때: 다음 줄이 닫는 부호나 ‘(’로 시작하면(‘상당하다(대법원 …’) 띄우지 않는다
    if (!cur) cur = { t, p: x.p, last: t.length }; else { cur.t += (/^[)\]}”’」』,.·:;]/.test(t) || /^\(/.test(t) && /[가-힣0-9]$/.test(cur.t) ? '' : ' ') + t; cur.last = t.length; }
    // 번호가 붙은 짧은 제목 줄(‘2. 상고이유 제2점에 관하여’)은 홀로 선다
    if (cur.t === t && MARK_RE.test(t) && isTitle(t.replace(MARK_RE, '')) && t.length < full * 0.75) { flush(); continue; }
    // 문장이 끝나고 줄이 짧으면(또는 붙여 넣은 긴 줄이면) 문단이 끝난다
    if (ENDS.test(t) && (t.length < full * 0.9 || t.length > full * 1.4) && balanced(cur.t)) flush();
    else if (inHead && (FIELD_RE.test(cur.t) || PARTY_RE.test(cur.t) && cur.t.length < 80 && !/[다]\.$/.test(cur.t))) { /* a header line stands alone unless it wraps */ if (t.length < full * 0.7) flush(); }
  }
  flush();
  return out.map((x, i) => { const { last, ...y } = x; return { ...y, t: sp(x.t), i }; });
}
const balanced = (s) => (s.match(/[“"]/g) || []).length % 2 === 0 && (s.match(/\(/g) || []).length <= (s.match(/\)/g) || []).length + 0;

/* ---------------- 문장 ---------------- */
export function sentences(text) {
  const s = sp(text); if (!s) return [];
  const out = []; let depth = 0, q = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++; else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === '“') q++; else if (c === '”') q = Math.max(0, q - 1);
    else if (c === '.' && depth === 0 && q === 0 && /[다요음함임됨)]/.test(s[i - 1] || '') && (i + 1 >= s.length || s[i + 1] === ' ')) {
      if (s[i - 1] === ')' && !/참조\)$|다\)$|[다요]\.?\)$/.test(s.slice(Math.max(0, i - 4), i))) continue;
      out.push(s.slice(start, i + 1).trim()); start = i + 1;
    }
  }
  if (start < s.length && s.slice(start).trim()) out.push(s.slice(start).trim());
  return out.filter((x) => x.length >= 2);
}

/* ---------------- 머리(사건 정보) ---------------- */
function roleOf(label) {
  const l = nospace(label).replace(/\([^)]*\)/g, '');
  const base = (l.match(/^(원고|피고인|피고|청구인|피청구인|신청인|피신청인|채권자|채무자|재항고인|항고인|상대방|제청법원|제청신청인|검사|변호인|원고보조참가인|피고보조참가인|보조참가인|독립당사자참가인|참가인|소송대리인|국선대리인|대리인|사건본인|이해관계인|선정자|당해사건)/) || [])[1] || l;
  const ap = (l.match(/(상고인|피상고인|항소인|피항소인|재항고인|항고인|부대항소인)/g) || []);
  return { base, appeal: ap };
}
const cleanName = (v) => sp(String(v || '').replace(/\s*\(?\s*(소송대리인|대리인|담당\s*변호사|법무법인|주소|등록기준지|송달장소|주거|본점|피고인의?\s*변호인)[^]*$/, '').replace(/\s*외\s*(\d+)\s*명?$/, ' 외 $1명').replace(/[,，]\s*$/, ''));
function parseHead(paras, upto) {
  const H = { court: '', bench: '', kind: '', no: '', name: '', date: '', parties: [], lower: [], fields: {} };
  for (const x of paras.slice(0, upto)) {
    const t = x.t;
    if (!H.court) { const c = t.match(new RegExp(`^${COURT_RE.source}(?:\\s|$)`)); if (c && t.length <= 40) H.court = fullCourt(c[1]); }
    if (/^(제\s?\d+\s?(민사|형사|행정|가사)?\s?부|제\s?\d+\s?(민사|형사|행정|가사)?\s?(부|과)|전원합의체|전원재판부|제\s?\d+\s?지정재판부|[가-힣]+\s?(민사|형사|행정)\s?(제?\d+)?\s?부)\s*(\(.*\))?$/.test(t) && t.length <= 30) H.bench = nospace(t).replace(/\(.*\)/, '');
    if (/^(판결|결정)$/.test(nospace(t))) H.kind = nospace(t);
    // 종합법률정보 첫 줄: 대법원 2019. 3. 28. 선고 2016두43176 판결 [감독명령처분취소]
    if (H.no && !H.name && x.i < 5 && /^[\[〔]([^\]〕]{2,60})[\]〕]$/.test(t)) H.name = t.slice(1, -1).trim();
    if (!H.no && x.i < 4) { const c = parseCite(t); if (c && c.no && c.raw.length >= t.length - 40 && !/^【/.test(t)) { Object.assign(H, { court: c.court, date: c.date, no: c.no, kind: c.kind || H.kind }); if (c.bench) H.bench = c.bench; const nm = t.match(/[\[〔(]([^\]〕)]{2,60})[\]〕)]\s*$/); if (nm) H.name = sp(nm[1]); } }
    const f = t.match(FIELD_RE);
    if (f) {
      const k = nospace(f[1]), v = sp(f[2]);
      H.fields[k] = v;
      if (k === '사건' && v) { const m = v.match(CASE_NO); if (m) { H.no = H.no || m[0].replace(/\s+/g, ''); H.name = H.name || sp(v.slice(m.index + m[0].length).replace(/^\s*(?:\([^)]*\))?\s*/, (s) => (/병합|반소/.test(s) ? '' : s))); } }
      if (/선고|판결선고|결정일|선고일/.test(k) && kDate(v)) H.date = H.date || kDate(v);
      if (/원심판결|원판결|제1심판결|환송판결|환송전원심판결/.test(k)) { const c = parseCite(v); H.lower.push({ field: k, ...(c || { court: fullCourt((v.match(COURT_RE) || [])[1] || ''), date: kDate(v), no: (v.match(CASE_NO) || [''])[0].replace(/\s+/g, ''), kind: '' }), raw: v }); }
      continue;
    }
    const am = t.match(/^[【\[]?\s*(상\s*고\s*인|항\s*소\s*인|재\s*항\s*고\s*인|항\s*고\s*인)\s*[】\]]?\s*[:：]?\s*(.+)$/);
    if (am) { const ap = nospace(am[1]); for (const w of sp(am[2]).split(/\s*[,，]\s*|\s+및\s+/)) { const role = /^검사/.test(w) ? '검사' : /^피고인/.test(w) ? '피고인' : /^원고/.test(w) ? '원고' : /^피고/.test(w) ? '피고' : ''; if (role) H.parties.push({ role, appeal: [ap], label: ap, name: role === '검사' ? '검사' : w, only: true }); } continue; }
    const pm = t.match(PARTY_RE);
    if (pm && !/^(검사|변호인)\s*(는|가|의|은)/.test(t)) {
      const r = roleOf(pm[1]);
      if (/대리인|변호인/.test(r.base)) continue;
      if (/^(소송\s?대리인|대리인|변호인|소송수행자|법률상\s?대표자|대표자)/.test(sp(pm[2]))) continue;
      const name = cleanName(pm[2]);
      if (!name) continue;
      if (r.base === '당해사건') { H.fields['당해사건'] = name; continue; }
      if (r.base === '제청법원') { H.fields['제청법원'] = name; continue; }
      H.parties.push({ role: r.base, appeal: r.appeal, label: sp(pm[1]).replace(/(?<=[가-힣])\s(?=[가-힣])/g, '').replace(/\s*[,，]\s*/g, ', '), name });
    }
  }
  if (!H.court) { const c = paras.slice(0, Math.min(upto, 6)).map((x) => x.t.match(COURT_RE)).find(Boolean); if (c) H.court = fullCourt(c[1]); }
  if (!H.kind) H.kind = H.court === '헌법재판소' ? '결정' : '판결';
  return H;
}

/* ---------------- 이유의 짜임: 1. 가. 1) 가) (1) (가) ① ---------------- */
const TYPES = ['n.', 'g.', 'n)', 'g)', '(n)', '(g)', '①'];
const GA = '가나다라마바사아자차카타파하';
function markOf(t) {
  const m = t.match(MARK_RE); if (!m) return null;
  const i = m.slice(1).findIndex((v) => v !== undefined), v = m[i + 1];
  const k = i === 6 ? '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'.indexOf(v) + 1 : /\d/.test(v) ? +v : GA.indexOf(v) + 1;
  return { type: TYPES[i], k, mark: m[0].trim(), rest: t.slice(m[0].length) };
}
const isTitle = (s) => s.length <= 60 && !ENDS.test(s) && !/[다]\s*$/.test(s);
function outlineOf(paras) {
  const root = { kids: [], paras: [], depth: 0, title: '' }; const stack = [root]; const last = {};
  for (const x of paras) {
    const m = markOf(x.t);
    let ok = false;
    if (m) {
      const at = stack.findIndex((n) => n.type === m.type);
      if (at > 0) ok = m.k === (last[at] || 0) + 1 || m.k === stack[at].k + 1;
      else ok = m.k === 1 || (m.k === 2 && m.type === 'n.' && stack.length === 1 && !root.kids.length); // ‘2.’로 시작하는 판결(1.이 앞 단락에 녹아 있는 경우)
      if (ok) {
        if (at > 0) stack.length = at; // 같은 단계의 다음 번호: 그 단계로 돌아간다
        const parent = stack[stack.length - 1];
        const node = { type: m.type, k: m.k, mark: m.mark, title: isTitle(m.rest) ? m.rest : '', paras: [], kids: [], depth: stack.length, p: x.p, i: x.i, parent };
        if (!node.title && m.rest) node.paras.push({ ...x, t: x.t });
        parent.kids.push(node); stack.push(node); last[stack.length - 1] = m.k;
        continue;
      }
    }
    stack[stack.length - 1].paras.push(x);
  }
  return root;
}
const walk = (n, f, path = []) => { for (const k of n.kids) { f(k, path); walk(k, f, [...path, k]); } };
const nodeText = (n) => [...n.paras.map((x) => x.t), ...n.kids.flatMap((k) => [k.title ? `${k.mark} ${k.title}` : '', ...nodeText(k).split('\n')].filter(Boolean))].join('\n');
const nodeParas = (n) => [...n.paras, ...n.kids.flatMap((k) => [...(k.title ? [{ t: `${k.mark} ${k.title}`, p: k.p, i: k.i, head: true }] : []), ...nodeParas(k)])].sort((a, b) => a.i - b.i);
const label = (n) => sp(`${n.mark} ${n.title || (n.paras[0] ? n.paras[0].t.replace(/^\S+\s*/, '').slice(0, 40) + '…' : '')}`);

/* ---------------- 부분의 성격 ---------------- */
const FACTS_T = /기초\s?사실|인정\s?사실|사실\s?관계|전제\s?사실|사건의?\s?개요|사안의?\s?개요|사건\s?개요|사건의?\s?경위|사안의?\s?경위|처분의?\s?경위|기본적\s?사실|다툼\s?없는\s?사실|범죄\s?사실|공소\s?사실의?\s?요지|사실의\s?인정|인정되는\s?사실|이\s?사건의?\s?경위/;
const HIST_T = /소송의?\s?경과|사건의?\s?경과|소송\s?경과|심판의?\s?경과|재판의?\s?경과|절차의?\s?경과|원심의?\s?판단|제1심의?\s?판단|원심판결의?\s?요지|원심의\s?판단\s?요지|제1심\s?및\s?원심의\s?판단/;
const CLAIM_T = /당사자(들)?의?\s?주장|원고(들)?의?\s?주장|피고(들)?의?\s?주장|피고인의?\s?주장|변호인의?\s?주장|청구인(들)?의?\s?주장|피청구인의?\s?(주장|의견|답변)|이해관계(인|기관)의?\s?의견|관계\s?기관의?\s?의견|제청(법원의?|신청인의?)?\s?(위헌\s?제청\s?)?이유|주장의?\s?요지|상고이유의?\s?요지|항소이유의?\s?요지|항소이유|청구이유의?\s?요지|청구\s?원인/;
const TARGET_T = /심판\s?대상|심판의\s?대상|관련\s?(법령|조항)|관계\s?법령/;
const JUDGE_T = /판단|살펴본다|관하여$|대하여$|상고이유\s?제?\s?\d*\s?점?|적법\s?요건|본안|위헌\s?여부|기본권\s?침해\s?여부/;
const CONC_T = /^결론$|^결\s?론$|^맺음말$/;
const OPIN_RE = /^(?:\d{1,2}\.\s*|[가-하]\.\s*)?(?:대법관|재판관)\s+((?:[가-힣○]{2,4})(?:\s*[,，]\s*[가-힣○]{2,4})*)(?:\s*의)?\s*(다수의견에\s?대한\s?보충의견|반대의견에\s?대한\s?보충의견|법정의견에\s?대한\s?보충의견|별개의견에\s?대한\s?보충의견|보충의견|일부\s?반대의견|반대의견|별개의견|헌법불합치의견|각하의견|인용의견|기각의견|합헌의견|위헌의견|일부\s?인용의견)/;
export function partKind(title) {
  const t = sp(title);
  if (!t) return '';
  if (CONC_T.test(nospace(t))) return 'conclusion';
  if (FACTS_T.test(t)) return /쟁점/.test(t) ? 'facts+issues' : 'facts';
  if (HIST_T.test(t)) return 'history';
  if (CLAIM_T.test(t)) return 'claims';
  if (TARGET_T.test(t)) return 'target';
  if (/쟁점/.test(t)) return 'issues';
  if (JUDGE_T.test(t)) return 'judge';
  return '';
}

/* ---------------- 주문의 결과 ---------------- */
export function outcomeOf(order, kind) {
  const o = sp(Array.isArray(order) ? order.join(' ') : order);
  const has = (re) => re.test(o);
  if (!o) return '';
  if (has(/헌법에\s?합치되지\s?아니한다/)) return '헌법불합치';
  if (has(/헌법에\s?위반되지\s?아니한다/)) return '합헌';
  if (has(/헌법에\s?위반된다/)) return '위헌';
  if (has(/원심판결을\s?파기하고[^.]*환송한다/)) return '원심판결 파기환송';
  if (has(/원심판결\s?중[^.]*(부분을\s?)?파기하고[^.]*환송/)) return '원심판결 일부 파기환송' + (has(/나머지\s?상고를\s?기각/) ? ', 나머지 상고 기각' : '');
  if (has(/원심판결을\s?파기하고[^.]*이송/)) return '원심판결 파기이송';
  if (has(/원심판결을\s?파기한다/)) return has(/항소를\s?기각|제1심판결을\s?취소|무죄|처한다/) ? '원심판결 파기자판' : '원심판결 파기';
  if (has(/(재항고|상고|항고)를\s?(모두\s)?기각한다/)) return `${(o.match(/(재항고|상고|항고)를/) || [])[1]} 기각`;
  if (has(/(재항고|상고|항고)를\s?(모두\s)?각하한다/)) return `${(o.match(/(재항고|상고|항고)를/) || [])[1]} 각하`;
  if (has(/제1심판결을\s?취소한다|제1심판결\s?중[^.]*취소/)) {
    if (has(/소를\s?각하/)) return '제1심판결 취소, 소 각하';
    if (has(/청구를\s?(모두\s)?기각/)) return '제1심판결 취소, 청구 기각';
    if (has(/환송한다/)) return '제1심판결 취소, 환송';
    return has(/지급하라|이행하라|인도하라|취소한다\.?.*취소한다/) ? '제1심판결 취소, 청구 인용' : '제1심판결 (일부) 취소';
  }
  if (has(/항소를\s?(모두\s)?기각한다/)) return has(/부대항소/) ? '항소 및 부대항소 기각' : '항소 기각';
  if (has(/항소를\s?각하한다/)) return '항소 각하';
  if (has(/심판청구를\s?(모두\s)?각하한다/) && has(/기각한다/)) return '일부 각하, 일부 기각';
  if (has(/심판청구를\s?(모두\s)?각하한다|청구를\s?(모두\s)?각하한다|소를\s?(모두\s)?각하한다/)) return '각하';
  if (has(/심판청구를\s?(모두\s)?기각한다/)) return '기각';
  if (has(/무죄/) && has(/처한다/)) return '일부 유죄, 일부 무죄';
  if (has(/무죄/)) return '무죄';
  if (has(/(징역|벌금|금고|구류|과료)[^.]*처한다|형의\s?선고를\s?유예/)) return '유죄';
  if (has(/공소를\s?기각/)) return '공소 기각';
  if (has(/청구를\s?(모두\s)?기각한다/) && !has(/지급하라|이행하라|인도하라|이전등기|말소등기|확인한다|취소한다|무효임을/)) return '청구 기각';
  if (has(/나머지\s?청구를\s?기각/)) return '청구 일부 인용';
  if (has(/지급하라|이행하라|인도하라|이전등기절차를|말소등기절차를|확인한다|무효임을\s?확인|취소한다|인용한다/)) return kind === '결정' && has(/인용/) ? '인용' : '청구 인용';
  return '';
}
const subj = (s) => (/[가-힣]$/.test(s) ? (((s.charCodeAt(s.length - 1) - 0xac00) % 28) ? `${s}이` : `${s}가`) : `${s}이`);
const topic = (s) => (/[가-힣]$/.test(s) ? (((s.charCodeAt(s.length - 1) - 0xac00) % 28) ? `${s}은` : `${s}는`) : `${s}은`);
function appellants(parties0, stage) {
  let parties = parties0;
  const want = stage === '상고심' ? /^(상고인|재항고인|항고인)$/ : /^(항소인|부대항소인)$/;
  if (parties.some((x) => x.only)) parties = parties.filter((x) => x.only || !x.appeal.length);
  const who = [...new Set(parties.filter((x) => x.appeal.some((a) => want.test(a))).map((x) => x.role === '검사' ? '검사' : /외\s?\d+\s?(인|명)|들$/.test(x.name) || /들/.test(x.label) ? `${x.role}들` : x.role))];
  return who;
}

/* ---------------- 쟁점·법리·평가 ---------------- */
const SPECIFIC = /이\s?사건|원고|피고|피고인|청구인|피청구인|신청인|원심|제1심|위\s?인정|앞서\s?본\s?사실|기록에\s?의하면|위와\s?같은\s?사실|소외|甲|乙|丙/;
const RULE_END = /((?:어|여|아)야\s?한다|할\s?것이다|봄이\s?(상당|타당)하다|하여야\s?한다|해야\s?한다|보아야\s?한다|해석(하여야|함이\s?(상당|타당))|해석된다|판단하여야|고려하여야|의미한다|뜻한다|라\s?할\s?것이다|라고\s?보아야|볼\s?수\s?없다|할\s?수\s?없다|허용되지\s?않는다|허용된다|아니한다|않는다|이다)[.]?\s*(\([^()]*(?:\([^()]*\)[^()]*)*참조\))?[.]?$/;
const EVAL_RE = /봄이\s?(타당|상당)하다|(위법|적법|부당)하다\.|인정된다\.|인정할\s?수\s?(없|있)다|원심의?\s?(위와\s?같은\s?)?(판단|조치|인정\s?판단)(은|에는)|원심판결에는|잘못이\s?(있다|없다)|위법이\s?(있다|없다)|정당하고|정당하다|수긍할\s?수\s?(있다|없다)|이유\s?(있다|없다)|받아들일\s?수\s?(없다|있다)|받아들이지\s?아니한다|받아들이지\s?않는다|배척한다|헌법에\s?위반된다|침해하지\s?않는다|침해한다|과잉금지원칙에\s?위반/;
const CONC_RE = /^(그러므로|그렇다면|따라서|이상의\s?이유로|이상과\s?같은\s?이유로|결국).*(주문과\s?같이\s?(판결|결정)한다|주문과\s?같이\s?(판결|결정)하기로|판결한다\.?$|결정한다\.?$)/;
const VERDICT = [[/이유\s?있다|받아들인다|인용한다/, '받아들임'], [/이유\s?없다|받아들이지\s?(아니한다|않는다)|받아들일\s?수\s?없다|배척|잘못이\s?없다|위법이\s?없다|수긍할\s?수\s?있다|침해하지\s?않는다|위반되지\s?아니한다|위반되지\s?않는다/, '배척'], [/잘못이\s?있다|위법이\s?있다|수긍할\s?수\s?없다|위법하다/, '원심 잘못']];
const BOILER = /^(?:따라서\s|그러므로\s)?(?:이\s?부분\s?)?(?:상고이유\s?주장|논지|항소이유\s?주장|이\s?부분\s?주장|원고의\s?(?:위\s?)?주장|피고의\s?(?:위\s?)?주장|이를\s?지적하는[^.]{0,30}주장)[은는]\s?(?:모두\s?)?(?:이유\s?(?:있다|없다)|받아들일\s?수\s?없다|받아들이지\s?아니한다)\.?$/;
const verdictOf = (text) => {
  const ss = sentences(text).reverse(); let cat = '', said = '';
  for (const s of ss.slice(0, 6)) { if (!cat) for (const [re, v] of VERDICT) if (re.test(s) && (v !== '원심 잘못' || /원심/.test(s))) { cat = v; break; } if (!said && !BOILER.test(s) && s.length >= 12 && EVAL_RE.test(s) || !said && /(따라서|그렇다면|결국)\s/.test(s) && !BOILER.test(s)) said = s; if (cat && said) break; }
  if (!said && ss[0] && !BOILER.test(ss[0]) && ss[0].length <= 160 && /(인정된다|보아야\s?한다|봄이\s?(상당|타당)하다|할\s?것이다|이다)\.?$/.test(ss[0])) said = ss[0];
  said = said.replace(MARK_RE, '');
  return [cat, said.length > 140 ? said.slice(0, 140) + '…' : said].filter(Boolean).join(' · ');
};
const ISSUE_HEAD = /(여부|인지|는지|의\s?의미|의\s?범위|의\s?한계|의\s?요건|의\s?성격|의\s?효력|의\s?법적\s?성질|해당\s?여부|위반\s?여부|침해\s?여부|관하여$|대하여$|관한\s?판단$|대한\s?판단$|상고이유\s?제?\s?\d+\s?점|주장에\s?관한|에\s?관한\s?주장)/;
const GENERIC_HEAD = /^(판\s?단|이\s?법원의\s?판단|당원의\s?판단|대법원의\s?판단|헌법재판소의\s?판단|상고이유에\s?대한\s?판단|상고이유에\s?관하여|상고이유를\s?판단한다\.?|본안에\s?관한\s?판단|본안\s?판단|적법요건에\s?관한\s?판단|결론|소결|관련\s?법리|관련\s?규정|법리|구체적\s?판단|구체적\s?검토|이\s?사건의\s?경우|이\s?사건에\s?관한\s?판단|이\s?사건에\s?대한\s?판단|이\s?사건의\s?판단|사안의\s?적용|이\s?사건에의\s?적용)$/;
/* ‘…에 관한 법리를 오해한’ / ‘…에 관한 법리오해의 위법’에서 다투어진 법리를 꺼낸다 */
export function legalPoint(text) {
  const m = String(text).match(/((?:[^\s,.()]+\s){0,7}[^\s,.()]+?)(?:에\s?(?:관한|대한)\s?|의\s?)법리(?:를|의)?\s?오해/);
  if (!m) return '';
  const w = m[1].split(/\s+/), keep = [];
  for (let i = w.length - 1; i >= 0; i--) { const x = w[i]; if (keep.length && (/(나|이나|거나|며|고|는|은|에|에는|에서|하여|하는|등의|같은|같이|에게|으로|로)$/.test(x) && !/(의|과|와|및)$/.test(x) || /^(거기에|원심판결에는|원심에는|소론과|상고이유|주장과|위와|등|및|그)$/.test(x))) break; if (!keep.length && /^(거기에|원심판결에는|등)$/.test(x)) break; keep.unshift(x); if (keep.length >= 6) break; }
  const x = keep.join(' ').trim();
  return x.length >= 2 ? `${x}에 관한 법리` : '';
}
function issueSentences(text) {
  const out = [];
  for (const s of sentences(text)) {
    let m;
    if ((m = s.match(/(?:이\s?사건의?\s?)?(?:주된\s?|핵심\s?)?쟁점은\s*(.{6,180}?)(?:이다|이라\s?할\s?것이다|에\s?있다|라고\s?할\s?수\s?있다)\./))) out.push(m[1]);
    else if ((m = s.match(/심판(?:의)?\s?대상은\s*(.{6,200}?)(?:이다|이라\s?할\s?것이다)\./))) out.push(m[1]);
    else if ((m = s.match(/^(.{6,160}?(?:인지|는지|ㄴ지|은지|할지)\s?(?:여부)?)(?:가|이|에\s?관하여|에\s?대하여)\s?(?:문제된다|문제가\s?된다|쟁점이다|다투어진다|살펴본다|본다|판단한다)/))) out.push(m[1]);
    else if ((m = s.match(/(.{6,140}?\s?여부)(?:가|이)\s?(?:문제된다|쟁점이다|이\s?사건의\s?쟁점)/))) out.push(m[1]);
  }
  return out.map((x) => sp(x).replace(/^(그런데|그러므로|따라서|먼저|우선|다음으로|나아가)\s*,?\s*/, ''));
}
function lawsIn(text) {
  const c = new Map(), T = String(text);
  for (const m of T.matchAll(/([가-힣·ㆍ]{0,30}(?:법|법률|시행령|시행규칙|규칙|헌법))\s?(?:\([^)]{1,40}\)\s?)?(제\s?\d+\s?조(?:의\s?\d+)?(?:\s?제\s?\d+\s?항)?(?:\s?제\s?\d+\s?호)?)/g)) {
    let law = m[1];
    if (!law || /^(같은|위|이|동|본|구|당해)?(법|법률|시행령|시행규칙)$/.test(law) || /(방법|입법|사법|위법|불법|적법|합법|편법|기법|수법|해법|용법|탈법|준법|처법)$/.test(law)) continue;
    // ‘공공기관의 정보공개에 관한 법률’, ‘사회기반시설에 대한 민간투자법’: 앞의 ‘…에 관한/대한/따른’ 고리만 이름에 넣는다
    const before = T.slice(Math.max(0, m.index - 60), m.index).split(' ').filter(Boolean);
    let name = [law];
    while (before.length >= 2 && /^(관한|대한|따른|관하여)$/.test(before[before.length - 1]) && /^[가-힣·ㆍ]{1,20}(에|과|와)$/.test(before[before.length - 2])) { name.unshift(before.pop()); name.unshift(before.pop()); if (before.length && /^[가-힣]{1,12}(의|및)$/.test(before[before.length - 1])) name.unshift(before.pop()); }
    if (before.length && before[before.length - 1] === '구' ) name.unshift('구');
    const k = `${name.join(' ')} ${nospace(m[2]).replace(/조(?=제)/, '조 ').replace(/항(?=제)/, '항 ')}`;
    c.set(k, (c.get(k) || 0) + 1);
  }
  return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n }));
}

/* ================= 분석 ================= */
export function isJudgment(pages) {
  const t = nospace((pages || []).slice(0, 3).join('\n')).slice(0, 6000);
  return /(주문|【주문】)/.test(t) && /(이유|【이유】)/.test(t) && CASE_NO.test(t) && /(판결|결정)/.test(t) && /(법원|헌법재판소|대법원)/.test(t);
}
export function analyzeJudgment(pages) {
  const L = linesOf(pages), P = parasOf(L);
  // 구획: 머리 · 주문 · 청구취지 · 이유 · (판시사항·판결요지·참조) · 서명
  const cut = []; P.forEach((x, i) => { const k = x.label ? secKey(x.t) : /^【.*】$/.test(x.t) ? secKey(x.t) : null; if (k) cut.push({ i, key: k.key, label: k.label }); });
  const firstMain = cut.find((c) => ['order', 'points', 'summary', 'full'].includes(c.key));
  const fullAt = cut.find((c) => c.key === 'full');
  const orderAt = cut.find((c) => c.key === 'order');
  const headEnd = orderAt ? orderAt.i : firstMain ? firstMain.i : Math.min(P.length, 25);
  const secOf = (key) => { const at = cut.findIndex((c) => c.key === key); if (at < 0) return []; const from = cut[at].i + 1, to = at + 1 < cut.length ? cut[at + 1].i : P.length; return P.slice(from, to); };
  const head = parseHead(P, headEnd);
  if (fullAt && fullAt.i < headEnd) { const h2 = parseHead(P.slice(fullAt.i + 1, headEnd), headEnd - fullAt.i - 1); for (const k of ['parties', 'lower']) if (!head[k].length) head[k] = h2[k]; for (const k of ['court', 'no', 'name', 'date']) if (!head[k]) head[k] = h2[k]; Object.assign(head.fields, h2.fields); }
  if (!head.no) { const m = P.slice(0, headEnd + 3).map((x) => x.t.match(CASE_NO)).find(Boolean); if (m) head.no = m[0].replace(/\s+/g, ''); }
  if (!head.date) { const d = P.slice(0, headEnd + 3).map((x) => /선고|결정일|고지/.test(x.t) && kDate(x.t)).find(Boolean); if (d) head.date = d; }

  const order = secOf('order').map((x) => x.t).filter((t) => !SIGN_RE.test(t));
  const claimSec = secOf('claim').map((x) => x.t);
  let reasons = secOf('reasons');
  // 이유 끝: 서명, 그리고 별개·반대의견
  const signAt = reasons.findIndex((x, i) => i > 0 && SIGN_RE.test(x.t) && x.t.length < 60 && reasons.slice(i).every((y) => y.t.length < 80 || OPIN_RE.test(y.t) || SIGN_RE.test(y.t)));
  const judges = [];
  if (signAt >= 0) { for (const x of reasons.slice(signAt)) for (const m of x.t.matchAll(/(?:대법원장|대법관|재판관|판사)\s*([가-힣○]{2,4})/g)) judges.push(m[1]); reasons = reasons.slice(0, signAt); }
  for (const x of P.slice(headEnd)) if (!judges.length && SIGN_RE.test(x.t) && x.t.length < 60) for (const m of x.t.matchAll(/(?:대법원장|대법관|재판관|판사)\s*([가-힣○]{2,4})/g)) judges.push(m[1]);
  const opinions = []; let maj = reasons;
  const opAt = reasons.findIndex((x) => OPIN_RE.test(x.t) && (isTitle(x.t.replace(MARK_RE, '')) || /다음과\s?같다\.?$/.test(x.t)));
  if (opAt > 0) {
    maj = reasons.slice(0, opAt); let cur = null;
    for (const x of reasons.slice(opAt)) {
      const m = x.t.match(OPIN_RE);
      if (m && (isTitle(x.t.replace(MARK_RE, '')) || /다음과\s?같다\.?$/.test(x.t))) { cur = { who: m[1].replace(/\s+/g, ''), kind: m[2].replace(/\s+/g, ' '), paras: [], p: x.p }; opinions.push(cur); if (!isTitle(x.t.replace(MARK_RE, ''))) cur.paras.push(x); continue; }
      if (cur) cur.paras.push(x);
    }
  }
  const tree = outlineOf(maj);
  const parts = []; walk(tree, (n, path) => { const k = partKind(n.title) || (path.length ? '' : ''); n.kind = k; parts.push(n); });
  const top = tree.kids;

  /* 1. 사실관계 */
  const EVID = /^[\[【(]?\s*인정\s?근거\s*[\]】):：]?|^\[?증거\]?\s*[:：]|^【증거의\s?요지】/;
  let factNodes = parts.filter((n) => /facts/.test(n.kind) && !parts.some((m) => m !== n && /facts/.test(m.kind) && isAncestor(m, n)));
  let facts = [], evidence = [], factsFrom = '';
  const pushFacts = (ps) => { for (const x of ps) { if (EVID.test(x.t)) evidence.push(x.t.replace(EVID, '').trim()); else facts.push(x); } };
  const factParas = (n) => [...n.paras, ...n.kids.filter((k) => !k.kind || /facts/.test(k.kind)).flatMap((k) => [...(k.title && !FACTS_T.test(k.title) ? [{ t: `${k.mark} ${k.title}`, p: k.p, i: k.i }] : []), ...factParas(k)])].sort((a, b) => a.i - b.i);
  if (factNodes.length) { for (const n of factNodes) pushFacts(factParas(n)); factsFrom = factNodes.map(label).join(', '); }
  else {
    // ‘다음과 같은 사실을 알 수 있다’ 다음의 항목들
    const lead = maj.findIndex((x) => /(다음과|아래와)\s?같은\s?(사실|사정|경위)(을|이|들을|들이)?\s?(알\s?수\s?있다|인정된다|인정할\s?수\s?있다|인정하거나|드러난다)|(사실관계|경위)는\s?다음과\s?같다/.test(x.t));
    if (lead >= 0) {
      const tail = maj[lead].t.replace(/^.*?(알\s?수\s?있다|인정된다|인정할\s?수\s?있다|다음과\s?같다)\.\s*/, '');
      if (tail && tail !== maj[lead].t) facts.push({ ...maj[lead], t: tail });
      const leadNode = parts.find((n) => n.paras.includes(maj[lead]) || n.i === maj[lead].i);
      const after = maj.slice(lead + 1);
      for (const x of after) { if (/^(이러한|위와\s?같은|이와\s?같은|이를|앞서\s?본|그렇다면|위\s?사실관계|이러한\s?사실관계|위\s?인정\s?사실|이\s?사건\s?사실관계)/.test(x.t.replace(MARK_RE, '')) && facts.length) break; const m = markOf(x.t); if (m && leadNode && m.type === leadNode.type && facts.length) break; if (m && /^n\./.test(m.type) && facts.length) break; pushFacts([x]); if (facts.length > 25) break; }
      factsFrom = '‘다음과 같은 사실’ 부분';
    }
  }

  /* 2. 소송의 경과 */
  const me = { court: head.court, date: head.date, no: head.no, bench: head.bench, kind: head.kind };
  const meStage = stageOf(me) || (head.lower.length ? '항소심' : '제1심');
  const stages = [];
  const seenNo = new Set([me.no]);
  const lowerSorted = head.lower.slice().sort((a, b) => (/제1심/.test(a.field) ? 0 : /환송전/.test(a.field) ? 1 : /환송판결/.test(a.field) ? 2 : 3) - (/제1심/.test(b.field) ? 0 : /환송전/.test(b.field) ? 1 : /환송판결/.test(b.field) ? 2 : 3));
  for (const c of lowerSorted) { if (c.no) seenNo.add(c.no); stages.push({ stage: /제1심/.test(c.field) ? '제1심' : /환송판결/.test(c.field) ? '환송판결' : /환송전/.test(c.field) ? '환송 전 원심' : (stageOf(c) === '제1심' ? '제1심' : meStage === '상고심' ? '제2심(원심)' : '원심'), cite: c, from: c.field }); }
  // 본문에서 이 사건의 다른 심급을 가리키는 인용(‘제1심판결(… 선고 … 판결)’, ‘환송판결’) — 선례 인용(… 참조)은 빼고
  const allText = maj.map((x) => x.t).join('\n');
  for (const c of citesIn(allText)) {
    if (seenNo.has(c.no)) continue;
    const before = allText.slice(Math.max(0, c.at - 30), c.at), after = allText.slice(c.at, c.at + 140);
    if (/참조|등\s?참조|취지|선고된|법리|판시한\s?바/.test(after.slice(0, after.indexOf('판결') + 12)) && !/(제1심|원심|환송|이\s?사건)/.test(before)) continue;
    if (!/(제1심|원심|환송|이\s?사건\s?(제1심|원심|환송))\s?(법원|판결)?\s*[(（]?\s*$/.test(before)) continue;
    seenNo.add(c.no); stages.push({ stage: /환송/.test(before) ? '환송판결' : stageOf(c) === '제1심' ? '제1심' : '원심', cite: c, from: '본문' });
  }
  const order3 = { '제1심': 0, '환송 전 원심': 1, '환송판결': 2, '원심': 3, '제2심(원심)': 3 };
  stages.sort((a, b) => (order3[a.stage] ?? 3) - (order3[b.stage] ?? 3));
  if (meStage === '상고심' && !stages.some((s) => s.stage === '제1심')) stages.unshift({ stage: '제1심', cite: null, from: '' });
  if (meStage === '항소심' && !stages.some((s) => s.stage === '제1심')) stages.unshift({ stage: '제1심', cite: null, from: '' });
  // 심급마다 판결문이 그 심급에 관해 적은 문장
  const sents = maj.flatMap((x) => sentences(x.t).map((s) => ({ s, p: x.p })));
  const said = (re, not) => sents.filter((x) => re.test(x.s) && !(not && not.test(x.s))).slice(0, 4);
  const EVALS = /원심의?\s?(위와\s?같은\s?)?(판단|조치)(은|에는)|원심판결에는|원심이\s?.{0,40}(것은|데에는)|수긍할\s?수|잘못이\s?(있다|없다)|정당하다/;
  const firstSaid = said(/(^|[\s,])(제1심\s?법원|제1심)(은|이|에서는)[\s,]/, EVALS);
  const lowSaid = said(/(^|[\s,])(원심|원심법원)(은|이|에서는)[\s,].{4,}(판단|보았다|인정|배척|인용|기각|취소|하였다|판시|선고)/, EVALS);
  for (const s of stages) s.said = s.stage === '제1심' ? (meStage === '제1심' ? [] : firstSaid) : /원심|제2심/.test(s.stage) ? lowSaid : [];
  const result = outcomeOf(order, head.kind);
  const app = appellants(head.parties, meStage);
  const meCite = citeText(me);
  stages.push({ stage: meStage === '상고심' ? '제3심(대상 판결)' : meStage === '항소심' ? '제2심(대상 판결)' : meStage === '헌법재판' ? '헌법재판소(대상 결정)' : '제1심(대상 판결)', cite: me, me: true, result, appellants: app, said: [] });
  const lowerOf = (st) => stages.find((x) => x.stage === st);
  const adopt = /민사소송법\s?제\s?420\s?조|제1심판결의\s?이유[^.]{0,30}(그대로\s)?인용한다/.test(allText);
  for (const s of stages) s.draft = stageDraft(s, { meStage, head, lowerOf, order, adopt });

  const kindAt = new Map(); walk(tree, (n, path) => { const ks = [...path, n].map((m) => m.kind || '').filter(Boolean); for (const x of n.paras) kindAt.set(x.i, ks); if (n.i !== undefined) kindAt.set(n.i, ks); });
  /* 3. 판결이유: 문단마다 성격 */
  const rparas = maj.map((x) => {
    const t = x.t, flags = [];
    const plain = t.replace(MARK_RE, '');
    if (CONC_RE.test(plain)) flags.push('결론');
    if (/참조\)\.?$|참조\)\s*[.]?$/.test(plain) || /(법리|판단\s?기준|해석)(는|은)\s?(다음과\s?같다|아래와\s?같다)/.test(plain)) flags.push('법리');
    else if (!SPECIFIC.test(plain) && sentences(plain).some((s) => RULE_END.test(s)) && plain.length >= 40) flags.push('법리');
    const ks = kindAt.get(x.i) || [];
    if (ks.some((k) => /claims|facts|target/.test(k))) { const keep = flags.includes('결론'); flags.length = 0; if (keep) flags.push('결론'); flags.push(ks.some((k) => /claims/.test(k)) ? '주장' : ks.some((k) => /facts/.test(k)) ? '사실' : '심판대상'); }
    else if (EVAL_RE.test(plain) && !flags.includes('결론')) flags.push('판단');
    return { t, p: x.p, i: x.i, flags, head: !!markOf(t) && isTitle(plain) };
  });
  const keyIdx = rparas.map((x, k) => (x.flags.includes('법리') || x.flags.includes('결론') || x.flags.includes('판단') ? k : -1)).filter((k) => k >= 0);

  /* 4. 쟁점 */
  const issues = [];
  const addIssue = (text, from, p, verdict = '') => {
    let t = sp(text).replace(/^(\[\d+\]|\d+\.|[가-하]\.|\d+\)|[가-하]\))\s*/, '').replace(/\s*\/\s*$/, '').replace(/[.。]$/, '');
    if (t.length < 4) return;
    const k = nospace(t);
    if (issues.some((x) => { const y = nospace(x.text); return y === k || (k.length > 10 && (y.includes(k) || k.includes(y))); })) return;
    issues.push({ text: t, from, p, verdict });
  };
  const points = secOf('points').map((x) => x.t).join(' ');
  if (points) for (const m of points.split(/(?=\[\d{1,2}\])/)) addIssue(m, '판시사항');
  for (const n of parts) {
    if (!n.title || GENERIC_HEAD.test(sp(n.title)) || /facts|history|conclusion|target/.test(n.kind)) continue;
    if (/제한되는\s?기본권|쟁점의?\s?정리|심사\s?기준/.test(n.title)) { const s0 = sentences((n.paras[0] || { t: '' }).t)[0]; if (s0) addIssue(`${sp(n.title)}: ${s0.length > 160 ? s0.slice(0, 160) + '…' : s0}`, '이유의 제목', n.p); continue; }
    if (ISSUE_HEAD.test(n.title) || n.kind === 'issues') {
      let t = n.title.replace(/\s*(에\s?관하여|에\s?대하여|에\s?관한\s?판단|에\s?대한\s?판단)$/, '');
      if (/상고이유\s?제?\s?\d+\s?점$|주장$/.test(t)) { const lr = legalPoint(nodeText(n)); if (lr) t = `${t} — ${lr}`; }
      if (nospace(t).length < 6 || /^이\s?사건(\s?처분)?$/.test(t)) continue;
      addIssue(t, '이유의 제목', n.p, verdictOf(nodeText(n)));
    }
  }
  for (const x of maj) for (const s of issueSentences(x.t)) addIssue(s, '판결문 문장', x.p);
  for (const x of maj) if (EVAL_RE.test(x.t)) { const lp = legalPoint(x.t); if (lp && !issues.some((y) => y.text.includes(lp))) addIssue(`${lp}(원심이 이를 오해하였는지)`, '판단 문장', x.p, verdictOf(x.t)); }
  for (const n of parts.filter((m) => m.kind === 'claims' && !(m.kids.length && m.kids.every((k) => k.kind === 'claims')) && !(m.parent && m.parent.kind === 'claims' && m.parent.kids.every((k) => k.kind === 'claims') && false))) for (const k of n.kids.length && !n.kids.every((x) => x.kind === 'claims') ? n.kids : [n]) { const t = k === n ? (n.paras[0] || { t: '' }).t : `${k.title ? k.title + ': ' : ''}${(k.paras[0] || { t: '' }).t}`; const s0 = sentences(t)[0] || t; if (s0) addIssue(`[${sp(n.title).replace(/^(?:\d+\.|[가-하]\.)\s*/, '').replace(/의?\s?(주장|요지|의견|답변).*$/, '').replace(/^당사자(들)?$/, '당사자')} 주장] ${s0.length > 160 ? s0.slice(0, 160) + '…' : s0}`, '당사자의 주장', k.p || n.p); }

  /* 덧붙임: 조문·판례·의견 */
  const textAll = P.filter((x, i) => i >= headEnd || !(FIELD_RE.test(x.t) || PARTY_RE.test(x.t))).map((x) => x.t).join('\n');
  const laws = lawsIn(textAll).slice(0, 30);
  const cases = []; const cseen = new Set(seenNo); for (const c of citesIn(textAll)) { if (cseen.has(c.no)) continue; cseen.add(c.no); cases.push(c); }
  return {
    ok: !!(head.no && (order.length || maj.length)),
    head, cite: meCite, stage: meStage, result, appellants: app,
    order, claim: claimSec, summary: secOf('summary').map((x) => x.t), points: secOf('points').map((x) => x.t), refLaws: secOf('refLaws').map((x) => x.t), refCases: secOf('refCases').map((x) => x.t),
    facts: facts.map((x) => ({ t: x.t, p: x.p })), factsFrom, evidence,
    stages: stages.map((s) => ({ stage: s.stage, cite: s.cite ? { court: s.cite.court, date: s.cite.date, no: s.cite.no, bench: s.cite.bench || '', kind: s.cite.kind || '' } : null, citeText: s.cite ? citeText(s.cite) : '', from: s.from || '', me: !!s.me, result: s.result || '', appellants: s.appellants || [], said: (s.said || []).map((x) => ({ s: x.s, p: x.p })), draft: s.draft })),
    outline: parts.map((n) => ({ label: label(n), depth: n.depth, kind: n.kind || '', p: n.p })),
    reasons: rparas, key: keyIdx,
    issues: issues.slice(0, 14),
    opinions: opinions.map((o) => ({ who: o.who, kind: o.kind, p: o.p, text: o.paras.map((x) => x.t).join('\n') })),
    judges: [...new Set(judges)], laws, cases: cases.slice(0, 40),
    stats: { pages: pages.length, paras: P.length, reasons: maj.length },
  };
}
function isAncestor(a, b) { let x = b.parent; while (x) { if (x === a) return true; x = x.parent; } return false; }
/* 심급마다 정리 초안: 판결문이 그 심급에 관해 쓴 문장을 바탕으로, 주어만 ‘○○법원(원심)은’으로 바꾼다. 없으면 비워 둔다 */
function stageDraft(s, ctx) {
  const court = s.cite && s.cite.court;
  if (s.me) {
    const who = s.appellants && s.appellants.length ? s.appellants.join('와 ') : '';
    const c = court || '대상 법원';
    if (ctx.meStage === '상고심') {
      if (!s.result) return who ? `${subj(who)} 상고하였다.` : '';
      const r = s.result;
      if (/파기환송/.test(r)) { const to = (sp((ctx.order || []).join(' ')).match(/사건을\s?([가-힣]+(?:\s[가-힣]+)?(?:법원|지원))(?:\s?[가-힣]*부)?에\s?환송/) || [])[1] || '원심법원'; return `${who ? `${subj(who)} 상고하자, ` : ''}대법원은 ${r.includes('일부') ? `원심판결 중 일부를 파기하고 그 부분 사건을 ${to}에 환송하였다` : `원심판결을 파기하고 사건을 ${to}에 환송하였다`}.`; }
      if (/기각/.test(r)) return `${who ? `${subj(who)} 상고하였으나, ` : ''}대법원은 상고를 기각하였다.`;
      if (/각하/.test(r)) return `${who ? `${subj(who)} 상고하였으나, ` : ''}대법원은 상고를 각하하였다.`;
      return `${who ? `${subj(who)} 상고하였고, ` : ''}대법원은 ‘${r}’로 판결하였다.`;
    }
    if (ctx.meStage === '항소심') {
      const w = who ? `${subj(who)} 항소하였고, ` : '';
      if (!s.result) return w ? w.replace(/고, $/, '다.') : '';
      const adopt = ctx.adopt ? '제1심판결의 이유를 그대로 인용하여 ' : '';
      if (/항소\s?기각/.test(s.result)) return `${who ? `${subj(who)} 항소하였으나, ` : ''}${topic(c)} ${adopt}항소를 기각하였다.`;
      return `${w}${topic(c)} ${s.result.replace(/, /g, '하고 ').replace(/취소$/, '취소').replace(/(기각|인용|각하|취소|환송)$/, '$1')}하였다.`.replace(/하하였다/, '하였다').replace(/취소하고 청구 기각하였다/, '제1심판결을 취소하고 청구를 기각하였다').replace(/제1심판결 취소하고 /, '제1심판결을 취소하고 ').replace(/청구 (기각|인용)하였다/, '청구를 $1하였다');
    }
    if (ctx.meStage === '헌법재판') return s.result ? `헌법재판소는 ${s.result === '위헌' || s.result === '합헌' || s.result === '헌법불합치' ? `${s.result} 결정을 하였다` : `심판청구를 ${s.result.replace(/^청구\s/, '')}하였다`}.`.replace(/심판청구를 각하하였다/, '심판청구를 각하하였다') : '';
    const cl = ctx.head.parties.some((x) => x.role === '원고') ? '원고의 청구' : ctx.head.parties.some((x) => x.role === '신청인') ? '신청인의 신청' : '청구';
    return s.result ? `${topic(c)} ${s.result.replace(/^청구\s?(전부\s|일부\s)?/, (m0, g) => `${cl}를 ${g || ''}`)}하였다.`.replace(/를 인용하였다/, '를 인용하였다') : '';
  }
  const name = court ? `${court}(${s.stage === '제1심' ? '제1심' : /원심|제2심/.test(s.stage) ? '원심' : s.stage})` : s.stage === '제1심' ? '제1심 법원' : '원심';
  const subjRe = s.stage === '제1심' ? /(?:^|(?<=[\s,]))(?:제1심\s?법원|제1심)(?:은|이|에서는)[\s,]+/ : /(?:^|(?<=[\s,]))(?:원심법원|원심)(?:은|이|에서는)[\s,]+/;
  for (const x of s.said || []) {
    const m = x.s.match(subjRe); if (!m) continue;
    let rest = x.s.slice(m.index + m[0].length);
    // 다른 심급이 이어 나오는 겹문장(‘…인정하였으나, 원심은 …’)이면 이 심급의 마디까지만
    const other = rest.search(s.stage === '제1심' ? /[,，]\s*(?:그러나\s)?(?:원심법원|원심|항소심)(?:은|이|에서는)[\s,]/ : /[,，]\s*(?:그러나\s)?(?:제1심\s?법원|제1심|대법원)(?:은|이|에서는)[\s,]/);
    if (other > 0) rest = rest.slice(0, other).replace(/(였|았|었|했|렸)(으나|는데|고|으며|지만)$/, '$1다').replace(/(하)(였으나|였는데|였고|였으며|였지만)$/, '$1였다') + '.';
    if (!/[.。]$/.test(rest)) rest += '.';
    return `${topic(name)} ${rest}`.replace(/\s+/g, ' ');
  }
  return '';
}

/* ================= 내보내기: 논문 속 ‘대상 판결’ 장의 모양 ================= */
/* a: analyzeJudgment 결과, e: 사용자가 고친 값 { facts, stages:[{text}], excerpt, issues:[text] }
   반환: [{ t: 'h1'|'h2'|'h3'|'p'|'quote', text, notes }] — write.js의 내보내기(한글·Word·마크다운)가 그대로 받는 꼴(〔@k〕 자리에 notes[k] 각주) */
export function judgmentItems(a, e, opt = {}) {
  const items = [], H = (t, text) => items.push({ t, text, notes: [] });
  const roman = opt.roman || 'Ⅱ';
  H('h1', `${roman}. ${a.cite || '대상 판결'}`);
  const n = (k) => `${k}.`;
  let k = 1;
  H('h2', `${n(k++)} 사실관계`);
  for (const para of String(e.facts || '').split(/\n{2,}|\n(?=\S)/).map((x) => x.trim()).filter(Boolean)) H('p', para);
  if (!String(e.facts || '').trim()) H('p', '(사실관계를 적으세요)');
  H('h2', `${n(k++)} 소송의 경과`);
  const GA2 = '가나다라마바사';
  let si = 0;
  (e.stages || []).forEach((s) => {
    if (!String(s.text || '').trim() && !s.citeText) return;
    H('h3', `${GA2[si] || si + 1}. ${s.title}`); si++;
    const notes = s.citeText && !s.me ? [`${s.citeText}.`] : [];
    const body = String(s.text || '').trim() || '(이 심급의 판단을 적으세요)';
    const paras = body.split(/\n+/).map((x) => x.trim()).filter(Boolean);
    paras.forEach((ptext, j) => items.push({ t: 'p', text: j === 0 && notes.length ? ptext.replace(/([.。])?$/, (m) => `${m || ''}〔@0〕`) : ptext, notes: j === 0 ? notes : [] }));
  });
  H('h2', `${n(k++)} ${a.stage === '상고심' ? '대법원의 판결이유' : a.stage === '헌법재판' ? '헌법재판소의 결정이유' : '판결이유'}`);
  if (String(e.lead || '').trim()) H('p', e.lead.trim());
  const ex = String(e.excerpt || '').trim();
  if (ex) for (const line of ex.split(/\n+/).map((x) => x.trim()).filter(Boolean)) items.push({ t: 'quote', text: line, notes: [] });
  const iss = (e.issues || []).map((x) => String(x || '').trim()).filter(Boolean);
  if (iss.length) { H('h2', `${n(k++)} 쟁점`); iss.forEach((x, i) => H('p', `${iss.length > 1 ? `${'①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭'[i] || i + 1} ` : ''}${x}`)); }
  return items;
}
/* 고른 문단을 판결문 순서대로 잇고, 건너뛴 자리에 [･･･]를 넣어 “ … ”로 묶는다 */
export function excerptOf(reasons, picked) {
  const ks = [...new Set(picked)].filter((k) => reasons[k]).sort((a, b) => a - b);
  if (!ks.length) return '';
  const out = []; let prev = null;
  for (const k of ks) { if (prev !== null && k !== prev + 1) out.push(OMIT); else if (prev === null && k > 0) out.push(OMIT); out.push(reasons[k].t); prev = k; }
  if (ks[ks.length - 1] < reasons.length - 1 && !(reasons[ks[ks.length - 1]].flags || []).includes('결론')) out.push(OMIT);
  return `“${out.join('\n')}”`;
}
/* 심급 이름: 논문에 쓰는 ‘가. 제1심’ ‘나. 제2심’ ‘다. 제3심’ … */
export function stageTitle(s) {
  if (s.me) return s.stage.replace(/\(대상 (판결|결정)\)/, '').trim() || s.stage;
  return s.stage === '제2심(원심)' ? '제2심' : s.stage === '환송판결' ? '환송판결' : s.stage;
}
export function defaultEdit(a, link) {
  const e = {
    facts: a.facts.map((x) => x.t).join('\n'),
    stages: a.stages.map((s) => ({ title: stageTitle(s), text: s.draft || '', citeText: s.citeText, me: s.me })),
    excerpt: excerptOf(a.reasons, a.key),
    picked: a.key.slice(),
    lead: a.stage === '상고심' ? '대법원의 판결이유 중 주요부분을 발췌하여 그대로 인용한다.' : '판결이유 중 주요부분을 발췌하여 그대로 인용한다.',
    issues: a.issues.map((x) => x.text),
  };
  if (link) applyLink(e, link);
  return e;
}
/* ================= 심급 연결: 서재에 같은 사건의 다른 심급 판결문이 있으면 =================
   a: 지금 분석하는 판결, others: [{ id, a }] 서재의 다른 판결문(분석 결과).
   사건번호로 이어 붙인다: 대상 판결의 머리(원심판결·제1심판결)와 본문 인용, 그리고 이어진 판결문의 머리에 적힌 그 아래 심급까지.
   이어진 판결문에서 가져오는 것은 그 판결문이 스스로에 관해 적은 것(인용, 주문에 따른 결과 문장, 기초사실)뿐이다. */
export function linkJudgments(a, others) {
  const byNo = new Map(); for (const o of others || []) if (o && o.a && o.a.ok && o.a.head.no && o.a.head.no !== a.head.no) byNo.set(o.a.head.no, o);
  const out = { stages: {}, facts: null, docs: [] };
  const stageKey = (st) => (/제1심/.test(st) ? '제1심' : /원심|제2심|항소심/.test(st) ? '원심' : st);
  // 이어진 판결문들이 아래 심급에 관해 알려 주는 인용(예: 원심 판결문 머리의 ‘제1심판결’)
  const known = {}; // stageKey -> cite
  for (const s of a.stages) if (!s.me && s.cite && s.cite.no) known[stageKey(s.stage)] = s.cite;
  // 이어진 판결문의 머리에 적힌 그 아래 심급(예: 원심 판결문의 ‘제1심판결’)도 알려진 인용으로 더한다(두 단계까지)
  for (let round = 0; round < 2; round++) for (const c of Object.values(known)) {
    const o = byNo.get(c.no); if (!o) continue;
    for (const t of o.a.stages) if (!t.me && t.cite && t.cite.no && !known[stageKey(t.stage)]) known[stageKey(t.stage)] = t.cite;
  }
  a.stages.forEach((s, i) => {
    if (s.me) return;
    const k = stageKey(s.stage), cite = (s.cite && s.cite.no) ? s.cite : known[k];
    const o = cite ? byNo.get(cite.no) : null;
    const sugg = [];
    if (o) { const me = o.a.stages.find((t) => t.me); if (me && me.draft) sugg.push({ s: me.draft, from: o.a.cite, docId: o.id }); }
    // 원심 판결문이 제1심에 관해 적은 문장
    for (const x of byNo.values()) {
      if (o && x === o) continue;
      const t = x.a.stages.find((y) => !y.me && stageKey(y.stage) === k && (!cite || !y.cite || y.cite.no === cite.no));
      if (t && t.draft) sugg.push({ s: t.draft, from: x.a.cite, docId: x.id });
    }
    if (cite || sugg.length) out.stages[i] = { cite: !(s.cite && s.cite.no) && cite ? { court: cite.court, date: cite.date, no: cite.no, bench: cite.bench || '', kind: cite.kind || '' } : null, citeText: !(s.cite && s.cite.no) && cite ? citeText(cite) : '', docId: o ? o.id : '', docCite: o ? o.a.cite : '', sugg };
    if (o && !out.docs.includes(o.id)) out.docs.push(o.id);
  });
  if (!a.facts.length) {
    const order = Object.values(out.stages).map((x) => x.docId).filter(Boolean);
    for (const id of order) { const o = [...byNo.values()].find((x) => x.id === id); if (o && o.a.facts.length) { out.facts = { text: o.a.facts.map((x) => x.t).join('\n'), from: o.a.cite, docId: o.id }; break; } }
  }
  return out;
}
export function applyLink(e, link) {
  for (const [i, l] of Object.entries(link.stages || {})) {
    const st = e.stages[+i]; if (!st) continue;
    if (!st.citeText && l.citeText) st.citeText = l.citeText;
    if (!String(st.text || '').trim() && l.sugg[0]) st.text = l.sugg[0].s;
  }
  if (!String(e.facts || '').trim() && link.facts) e.facts = link.facts.text;
  return e;
}
export const _test = { linesOf, parasOf, outlineOf, markOf, parseHead, sentences, outcomeOf, partKind, lawsIn, citesIn, parseCite, fullCourt, stageOf };
