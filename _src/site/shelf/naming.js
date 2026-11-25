// 연구실 책장 — what a paper's first page says: a name for the file, "저자_제목" (the subtitle left out), and where it was
// published (journal, its society, volume and issue, date).
// Built on how Korean law journals lay out a first page: a header with the journal and the date, the title (often over two
// lines, with a footnote mark), a subtitle between dashes, an English title, the author (with a footnote number in front,
// spaced out, or in hanja after the affiliation), then 목차 / 요약. A database cover (DBpia, KCI …) is read by its labels.
// Careful by design: when the title and the author are not both clear, no name is given and the file keeps its own.
// Input: page objects as made by pdfkit.pageItems(): { W, H, items: [{ s, x, y, w, h }] } (y grows downward).
import { PAIRS } from './hanja.js';

// ---------------------------------------------------------------- hanja → hangul
let HANJA = null;
const hanjaMap = () => { if (!HANJA) { HANJA = new Map(); for (let i = 0; i + 1 < PAIRS.length; i += 2) HANJA.set(PAIRS[i], PAIRS[i + 1]); } return HANJA; };
const IS_HAN = /[㐀-鿿豈-﫿]/;
const readHan = (ch) => hanjaMap().get(ch) || hanjaMap().get(ch.normalize('NFC')) || null;
function initialRule(syl) {   // 두음법칙 for the first syllable of a word: 리→이, 로→노, 녀→여 …
  const c = syl.charCodeAt(0) - 0xAC00; if (c < 0 || c > 11171) return syl;
  const L = Math.floor(c / 588), V = Math.floor((c % 588) / 28), T = c % 28;
  const iotized = [2, 3, 6, 7, 12, 17, 20].includes(V);   // ㅑ ㅒ ㅕ ㅖ ㅛ ㅠ ㅣ
  const L2 = L === 5 ? (iotized ? 11 : 2) : (L === 2 && iotized ? 11 : L);   // ㄹ→ㅇ/ㄴ, ㄴ→ㅇ
  return String.fromCharCode(0xAC00 + L2 * 588 + V * 28 + T);
}
const WORD_START = /[論](?=[叢集文壇考])/;   // 論叢 論集 論文 論壇 論考 begin a word of their own (法學論叢 → 법학논총)
export function hangulize(s) {   // 公法學硏究 第18卷 → 공법학연구 제18권
  let out = '', prev = '';
  const cs = [...String(s)];
  cs.forEach((ch, i) => {
    const r = IS_HAN.test(ch) ? readHan(ch) : null;
    const start = !/[\p{L}\p{N}]/u.test(prev) || WORD_START.test(ch + (cs[i + 1] || ''));
    if (r) out += start ? initialRule(r) : r; else out += ch;
    prev = ch;
  });
  return out;
}
function hanjaName(s) {   // 金大仁 → 김대인 (the surname and the given name's first syllable by the initial-sound rule)
  const r = [...s].map(readHan);
  if (!r.length || r.some((x) => !x)) return null;
  const sur = SURNAMES2.has(r[0] + (r[1] || '')) && r.length >= 3 ? 2 : 1;
  r[0] = initialRule(r[0]);
  if (r.length > sur + 1) r[sur] = initialRule(r[sur]);
  return r.join('');
}

// ---------------------------------------------------------------- words
const HEADINGS = new Set(['목차', '차례', '목록', '요약', '요지', '초록', '국문초록', '국문요약', '한글초록', '한글요약', '논문요약', '영문초록', '영문요약', '개요',
  '서론', '결론', '머리말', '맺음말', '들어가며', '들어가는말', '나가며', '맺는말', '주제어', '핵심어', '핵심용어', '키워드', '참고문헌', '투고일', '심사일',
  '게재확정일', '게재일', '논문', '연구논문', '일반논문', '특집논문', '기획논문', '특집', '기획', '논설', '평석', '판례평석', '판례연구', '연구', '특별기고', '기고',
  '심사논문', '투고논문', '부록', '서문', '발간사', '편집', '권두언', 'abstract', 'contents', 'tableofcontents', 'keywords', 'keyword', 'introduction',
  'references', 'summary', 'article', 'articles', 'researcharticle']);
const bare = (s) => hangulize(s).replace(/[\s[\]【】〈〉<>《》≪≫()（）「」『』｢｣:：.·ㆍ▣■□◆◇○●*\-–—―－_=]/g, '').toLowerCase();
const isHeading = (s) => HEADINGS.has(bare(s)) || HEADINGS.has(bare(String(s).replace(/^\s*(?:[IVXⅠ-Ⅻ]{1,4}|\d{1,2}|[가-하])\s*[.)．]\s*|^\s*제\s*\d+\s*[장절]\s*/, '')));
const SURNAMES = new Set(('김 이 박 최 정 강 조 윤 장 임 한 오 서 신 권 황 안 송 류 유 전 홍 고 문 양 손 배 백 허 남 심 노 하 곽 성 차 주 우 구 민 나 진 지 엄 채 원 천 방 공 현 함 변 염 '
  + '여 추 도 소 석 선 설 마 길 연 위 표 명 기 반 라 왕 금 옥 육 인 맹 제 모 탁 국 어 은 편 용 예 경 봉 사 부 가 간 갈 감 견 계 단 담 당 대 독 돈 동 두 묵 범 복 빈 '
  + '빙 상 섭 순 승 시 영 온 옹 운 음 자 점 종 좌 준 즙 증 창 초 춘 탄 태 판 팽 평 포 풍 피 필 학 해 형 호 화 환 후 흥 뇌 누 로 리 림 량 려 렴 룡 륙').split(' '));
const SURNAMES2 = new Set(['남궁', '제갈', '선우', '독고', '황보', '사공', '서문', '동방', '어금', '망절', '소봉', '장곡']);
const TITLE_WORDS = /(연구|대한|관한|고찰|검토|분석|방안|과제|제도|법제|개념|쟁점|시론|소고|평석|판례|의의|문제|현황|동향|비교|이론)/;
function koreanName(n) {
  if (!/^[가-힣]{2,5}$/.test(n) || isHeading(n)) return false;
  if (SURNAMES2.has(n.slice(0, 2))) return n.length >= 3;
  return SURNAMES.has(n[0]) && (n.length <= 3 || (n.length === 4 && !TITLE_WORDS.test(n)));   // 대한연구 (a title's last words) is not a name
}
const ROLE = /(명예교수|초빙교수|겸임교수|연구교수|객원교수|석좌교수|부교수|조교수|교수|강사|선임연구원|책임연구원|전임연구원|연구위원|연구관|연구원|박사과정|박사수료|박사|석사과정|석사|변호사|판사|검사|교신저자|제1저자|주저자|공동저자|사무관|서기관|위원|소장|원장|실장|팀장|대표|교사|학생|조교|연구교수)/;
const AFFIL = /(대학교|대학원|대학|학부|학과|연구원|연구소|연구회|연구센터|센터|법원|재판소|검찰청|법무법인|법률사무소|위원회|공사|재단|협회|학회|부처|청|처|원)$/;
const META_LINE = /(https?:\/\/|doi\.|DOI|ISSN|ISBN|pp\.\s*\d|Vol\.\s*\d|No\.\s*\d|제\s*\d+\s*[권집호]|통권|第\s*\d+\s*[卷集號]|\d+\s*[~∼～-]\s*\d+\s*면|\d{4}\s*년\s*\d{1,2}\s*월|[『』]|Association|Society|Institute|Journal|Law Review|Korean\s+[A-Z])/;
const MARK_ONLY = /^[\s*†‡§¶#⁎∗\d)）]+$/;
const DASH = '-–—―－~∼〜─ㅡ';   // ㅡ: a dash as a scan reader reads it
const SUBTITLE_START = new RegExp(`^[${DASH}]`);
function isSubtitle(s) {
  const t = s.trim();
  if (SUBTITLE_START.test(t)) return true;
  const sep = t.search(new RegExp(`[:：]\\s|\\s[${DASH}]\\s|[—―]`));
  if (sep >= 4) return false;   // 제목: 부제를 중심으로 — the title with its subtitle on one line
  return new RegExp(`[${DASH}]\\s*[*†]*$`).test(t) && t.length < 80
    || /(중심으로|관하여|대하여|위하여|통하여|focusingon|withspecial|withreference)[\s*†)）-]*$/i.test(t.replace(/\s/g, '')) && t.length < 90;
}
const hangulShare = (s) => { const h = (s.match(/[가-힣]/g) || []).length, l = (s.match(/[A-Za-z]/g) || []).length; return h + l ? h / (h + l) : 0; };

// ---------------------------------------------------------------- lines (a gap wider than a few letters starts a new piece: columns)
function lines(pg) {
  if (!pg || !pg.items) return [];
  const its = pg.items.filter((i) => i.s && i.s.trim() && i.h > 0).slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const it of its) {
    let R = null;
    for (let k = rows.length - 1; k >= 0 && k >= rows.length - 5; k--) {
      const c = rows[k];
      if (Math.abs(c.y - it.y) <= Math.max(1.5, 0.45 * Math.min(c.h, it.h))) { R = c; break; }
    }
    if (R) { R.parts.push(it); R.h = Math.max(R.h, it.h); } else rows.push({ y: it.y, h: it.h, parts: [it] });
  }
  const out = [];
  for (const R of rows) {
    R.parts.sort((a, b) => a.x - b.x);
    let cur = null, end = null, ink = null;
    for (const p of R.parts) {
      const gap = end == null ? 0 : p.x - end;
      let dot = false;
      if (!cur || gap > Math.max(2.6 * Math.min(p.h, cur.hmin), 16)) { cur = { y: R.y, h: p.h, hmin: p.h, s: '', x0: p.x, x1: p.x + p.w }; out.push(cur); ink = null; }
      else {
        // a glyph the text layer lost between a one-syllable word and the next word, as in "공 사법구별": the middle dot (공·사법구별)
        const lost = ink == null ? 0 : (p.x - ink) / p.h;
        dot = lost >= 0.6 && lost <= 1.2 && /(^|\s)[가-힣]\s*$/.test(cur.s) && /^\s*[가-힣]{2}/.test(p.s);
        if (dot) cur.s = cur.s.replace(/\s*$/, '·');
        else if (gap > 0.22 * p.h && !cur.s.endsWith(' ')) cur.s += ' ';
      }
      cur.s += dot ? p.s.trimStart() : p.s; cur.h = Math.max(cur.h, p.h); cur.hmin = Math.min(cur.hmin, p.h); cur.x1 = Math.max(cur.x1, p.x + p.w); end = p.x + p.w;
      if (p.s.trim()) ink = p.x + p.w;
    }
  }
  for (const L of out) L.s = L.s.normalize('NFC').replace(/\s+/g, ' ').trim();
  return out.filter((L) => L.s).sort((a, b) => a.y - b.y || a.x0 - b.x0);
}
function bodySize(ls) {   // the size most of the text is set in
  const w = new Map();
  for (const L of ls) { const k = Math.round(L.h * 2) / 2; w.set(k, (w.get(k) || 0) + L.s.length); }
  let best = 0, n = -1; for (const [k, v] of w) if (v > n) { n = v; best = k; }
  return best || 10;
}

// ---------------------------------------------------------------- title
function cleanTitle(s) {
  let t = s.replace(/[｢]/g, '「').replace(/[｣]/g, '」').replace(/\s+/g, ' ').trim();
  // a closing bracket the text layer moved to the end: 「행정규제기본법 의 규제 개념에 대한 고찰」 → 「행정규제기본법」의 … (a particle never stands alone)
  t = t.replace(/^([「『])([^」』\s]+)\s(의|은|는|이|가|을|를|과|와|에|에서|으로|로|상)(\s.*)[」』]$/, (m, o, a, p, rest) => o + a + (o === '「' ? '」' : '』') + p + rest);
  t = t.replace(/^\s*\d{1,3}\)\s*/, '').replace(/^[*†‡§¶⁎∗\s]+/, '');                       // a footnote number in front
  t = t.replace(/[*†‡§¶⁎∗#]+(?=\s|$)/g, '').replace(/\s*\d{1,2}\)$/, '').trim();              // footnote marks after it (a scan may read * as #)
  const cut = (re) => { const m = re.exec(t); if (m && m.index >= 4) t = t.slice(0, m.index).trim(); };
  cut(new RegExp(`\\s[${DASH}]{1,2}\\s?`));                                                   // 제목 - 부제 -
  cut(/[—―─－]/);                                                                              // 제목—부제
  cut(/\s?[:：]\s/);                                                                            // 제목: 부제
  { const o = Math.max(t.lastIndexOf('('), t.lastIndexOf('（'));                                // 제목(…을 중심으로), even when a line break split a word
    if (o >= 4 && /[)）]\s*$/.test(t) && /(중심으로|관하여|대하여|위하여|비교|검토|분석|사례|소고|시론|focus|with)/i.test(t.slice(o).replace(/\s/g, ''))) t = t.slice(0, o).trim(); }
  if (/^[「『"“‘]?[가-힣]/.test(t)) cut(/\s(?=[A-Z][A-Za-z ,.'’:;&-]{14,}$)/);                  // a Korean title followed by its English one
  t = t.replace(new RegExp(`[\\s${DASH},.·]+$`), '').trim();
  return titleCase(t);
}
function titleCase(s) {   // ALL CAPS English → ordinary capitals
  if (/[a-z]/.test(s) || !/[A-Z]{3}/.test(s) || /[가-힣]/.test(s)) return s;
  const small = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'nor', 'of', 'in', 'on', 'for', 'to', 'at', 'by', 'with', 'from', 'as', 'into', 'via', 'vs', 'vs.']);
  let first = true;
  return s.toLowerCase().split(/(\s+)/).map((w) => {
    if (/^\s+$/.test(w)) return w;
    const out = !first && small.has(w) ? w : w.replace(/^([("'“‘]?)(\p{L})/u, (m, a, b) => a + b.toUpperCase());
    first = false; return out;
  }).join('');
}
const letters = (s) => s.replace(/[^\p{L}]/gu, '').length;
function titleLike(L, body, korean) {
  const s = L.s;
  if (letters(s) < 4 || s.length > 140) return false;
  if (MARK_ONLY.test(s) || isHeading(s) || isSubtitle(s) || META_LINE.test(s)) return false;
  if (affiliationLine(s) || authorsOf(s)) return false;
  if (korean && hangulShare(s) < 0.3) return false;                     // the English title of a Korean paper
  if (/[.。]$/.test(s) && s.length > 40) return false;                  // a sentence of the text
  return L.h >= body * 1.15;
}
function pickTitle(ls, body, H, korean) {
  const cand = ls.filter((L) => L.y < H * 0.62 && titleLike(L, body, korean));
  if (!cand.length) return null;
  const top = cand.reduce((a, b) => (b.h > a.h + 0.4 ? b : a));
  // the title block: this line with the lines of its size just above and below (over marks such as * or 1) between them)
  const i = ls.indexOf(top);
  const same = (L) => Math.abs(L.h - top.h) <= top.h * 0.12 && !isSubtitle(L.s) && !isHeading(L.s) && !META_LINE.test(L.s) && !(korean && hangulShare(L.s) < 0.3) && !authorsOf(L.s);
  let a = i, z = i;
  for (let k = i - 1, gapTo = top; k >= 0; k--) { const L = ls[k]; if (MARK_ONLY.test(L.s)) continue; if (same(L) && gapTo.y - L.y <= top.h * 2.6) { a = k; gapTo = L; } else break; }
  for (let k = i + 1, gapFrom = top; k < ls.length; k++) { const L = ls[k]; if (MARK_ONLY.test(L.s)) continue; if (same(L) && L.y - gapFrom.y <= top.h * 2.6) { z = k; gapFrom = L; } else break; }
  const block = ls.slice(a, z + 1).filter((L) => !MARK_ONLY.test(L.s));
  const title = cleanTitle(block.map((L) => L.s).join(' '));
  if (letters(title) < 4 || title.length > 160 || isHeading(title)) return null;
  if (misread(title)) return { title: '', misread: title, end: z };   // the letters were read wrong: no title from it, but the author line below is still found
  return { title, end: z };
}
// letters a scan reader got wrong (한-8ㅁ 87^의 …): a loose consonant or vowel, or signs no title uses
const misread = (t) => /[가-힣]/.test(t) && /[\u3131-\u3160\u3162\u3163^|\\{}@#$%=+<>]/.test(t);

// ---------------------------------------------------------------- authors
const nameCase = (w) => (/[a-z]/.test(w) ? w : w.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()));   // GIL-DONG HONG → Gil-dong Hong
const NOT_ENGLISH_NAME = /\b(Study|Studies|Law|Laws|Legal|Korea|Korean|Journal|University|Review|Research|Rights?|Public|Court|Constitution\w*|Administrative|Act|Policy|Theory|Analysis|Comparative|System|Procurement|Contract|Focusing|Abstract|Introduction|Department|School|Professor)\b/i;
function affiliationLine(s) { return /(대학교|대학원|연구원|연구소|법원|재판소|위원회|법무법인)/.test(s) && /(교수|강사|연구원|연구위원|박사|변호사|판사|검사|원장|소장)/.test(s); }
function cleanNamePart(p) {
  p = p.replace(/[*†‡§¶#⁎∗]+/g, ' ').replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, ' ')
    .replace(/^(\s*\d{1,3}\))+\s*/, '').replace(/(\s*\d{1,3}\))+\s*$/, '')                 // footnote numbers, also several (조 원 용 1)2))
    .replace(/["“”'’‘`´]+\s*$/, '').replace(/\d+$/, '').trim();
  return p;
}
function oneName(p) {
  p = cleanNamePart(p);
  if (!p) return null;
  if (/^([가-힣㐀-鿿豈-﫿]\s+){1,4}[가-힣㐀-鿿豈-﫿]$/.test(p)) p = p.replace(/\s+/g, '');          // 김 대 인, 金 大 仁
  else if (/^[가-힣]+(\s+[가-힣]+){1,2}$/.test(p) && (p.replace(/\s+/g, '').length === 3 || SURNAMES2.has(p.split(/\s+/)[0]) && p.replace(/\s+/g, '').length === 4)) p = p.replace(/\s+/g, '');   // 홍길 동 (a scan's stray space)
  p = p.replace(new RegExp(`\\s*${ROLE.source}\\s*$`), '').trim();
  if (/^[㐀-鿿豈-﫿]{2,4}$/.test(p)) p = hanjaName(p) || p;                                                            // 金大仁 → 김대인
  if (koreanName(p)) return p;
  const e = nameCase(p);
  if (/^[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){1,3}$/.test(e) && !NOT_ENGLISH_NAME.test(e)) return e;
  return null;
}
function authorsOf(raw) {   // the names on an author line, or null
  if (!raw || raw.length > 90) return null;
  let s = raw.normalize('NFC').replace(/[(（[【][^)）\]】]*[)）\]】]/g, ' ');                            // (Dae-in Kim) (소속) [소속]
  s = s.replace(/^\s*\d{1,3}\)\s*/, '').replace(/^\s*(저자|글쓴이|by)\s*[:：]?\s*/i, '');
  if (affiliationLine(s)) {   // 이화여자대학교 법학전문대학원 교수 金 大 仁 / 홍길동 서울대학교 교수
    const toks = s.split(/\s+/);
    const lastRole = toks.map((t) => ROLE.test(t) || AFFIL.test(t)).lastIndexOf(true);
    const after = toks.slice(lastRole + 1).join(' ');
    const firstAff = toks.findIndex((t) => ROLE.test(t) || AFFIL.test(t));
    const before = toks.slice(0, Math.max(0, firstAff)).join(' ');
    s = after.replace(/[,，].*$/, '').trim() || before;
    if (!s) return null;
  }
  const parts = s.split(/\s*(?:[,，·・ㆍ‧･/;、&]|\band\b|\s와\s|\s및\s)\s*/).map((p) => p.trim()).filter((p) => p && !MARK_ONLY.test(p));
  if (!parts.length || parts.length > 8) return null;
  const names = [];
  for (const p of parts) { const n = oneName(p); if (!n) return null; names.push(n); }
  return names;
}
function findAuthors(ls, from, body, H, korean) {
  for (let k = from + 1, seen = 0; k < ls.length && seen < 9; k++) {
    const L = ls[k];
    if (L.y > H * 0.72 && !(L.y < H * 0.92 && L.h >= body * 0.95)) break;
    if (MARK_ONLY.test(L.s)) continue;
    seen++;
    if (isHeading(L.s)) break;                                               // 목차 / 요약 came first: no author line
    const names = authorsOf(L.s);
    if (names) return names;
    if (isSubtitle(L.s) || (korean && hangulShare(L.s) < 0.3 && L.h >= body)) continue;   // a subtitle, the English title
    if (L.s.length > 45 && Math.abs(L.h - body) < 0.8 && !(korean && hangulShare(L.s) < 0.3)) break;   // the text has begun (not the English title)
  }
  return null;
}
const authorText = (names) => (names.length === 1 ? names[0] : names.length === 2 ? names.join('·') : names[0] + ' 외');

// ---------------------------------------------------------------- where it was published
// journals whose society is known for certain (the page may not print it)
const JOURNALS = [
  ['공법연구', '한국공법학회'], ['헌법학연구', '한국헌법학회'], ['행정법연구', '행정법이론실무학회'], ['지방자치법연구', '한국지방자치법학회'],
  ['공법학연구', '한국비교공법학회'], ['법조', '법조협회'], ['토지공법연구', '한국토지공법학회'], ['행정법학', '한국행정법학회'],
  ['저스티스', '한국법학원'], ['헌법논총', '헌법재판소'], ['인권과 정의', '대한변호사협회'], ['비교사법', '한국비교사법학회'],
  ['민사법학', '한국민사법학회'], ['형사법연구', '한국형사법학회'], ['환경법연구', '한국환경법학회'], ['경제법연구', '한국경제법학회'],
  ['언론과 법', '한국언론법학회'], ['유럽헌법연구', '유럽헌법학회'], ['미국헌법연구', '미국헌법학회'], ['입법학연구', '한국입법학회'],
  ['법과 정책연구', '한국법정책학회'], ['동북아법연구', '전북대학교 동북아법연구소'], ['경제규제와 법', '서울대학교 공익산업법센터'],
  ['신앙과 학문', '기독교학문연구회'], ['과학기술법연구', '한남대학교 과학기술법연구원'], ['법제', '법제처'], ['사법', '사법발전재단'], ['노동법학', '한국노동법학회'], ['조세법연구', '한국세법학회'],
  ['국제법학회논총', '대한국제법학회'], ['서울대학교 법학', '서울대학교 법학연구소'], ['법학논집', null], ['법학연구', null], ['법학논총', null],
];
const squash = (s) => s.replace(/\s+/g, '');
function knownJournal(name) { const k = squash(name); return JOURNALS.find(([j]) => squash(j) === k) || null; }
function knownJournalAt(line) {   // a line that starts with a known journal's name (a header like 「경제규제와 법(Journal of …)」 or a footer)
  const k = squash(line);
  return JOURNALS.filter(([j, soc]) => soc !== undefined && squash(j).length >= 3 && k.startsWith(squash(j))).sort((a, b) => b[0].length - a[0].length)[0] || null;
}
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
function dateIn(s) {
  let m = /(\d{4})\s*년\s*(\d{1,2})\s*월(?:\s*(\d{1,2})\s*일)?/.exec(s);
  if (!m) m = /(?:^|[^\d])(\d{4})\s*\.\s*(\d{1,2})\s*\.(?:\s*(\d{1,2})\s*\.?)?(?!\d)/.exec(s);
  if (m) return ok(+m[1], +m[2], m[3] ? +m[3] : 0);
  m = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.?\s*,?\s*(\d{4})\b/i.exec(s);
  if (m) return ok(+m[2], MONTHS[m[1].toLowerCase()], 0);
  return null;
  function ok(y, mo, d) { return y >= 1950 && y <= 2100 && mo >= 1 && mo <= 12 ? `${y}-${String(mo).padStart(2, '0')}${d >= 1 && d <= 31 ? '-' + String(d).padStart(2, '0') : ''}` : null; }
}
function dateInDoi(s) {   // …/plj.20.3.201908.012 → 2019-08
  const m = /(?:doi\.org\/|doi:?\s*)[^\s]*?[./](\d{4})(\d{2})[./]\d/i.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2];
  return y >= 1950 && y <= 2100 && mo >= 1 && mo <= 12 ? `${y}-${String(mo).padStart(2, '0')}` : null;
}
function yearInDoi(s) {   // …/HYLR.2018.35.1.029 → 2018 (only the year)
  const m = /(?:doi\.org\/|doi:?\s*)[^\s]*?[./]((?:19|20)\d{2})[./]\d/i.exec(s);
  return m ? m[1] : null;
}
function issueIn(s) {
  let m = /제\s*(\d+)\s*([권집])\s*(?:제?\s*(\d+)\s*호)?/.exec(s);
  if (m) return `제${m[1]}${m[2]}${m[3] ? ` 제${m[3]}호` : ''}`;
  m = /(?:^|[^통권\d])제\s*(\d+)\s*호/.exec(s);
  if (m) return `제${m[1]}호`;
  m = /[』」]\s*\.?\s*(\d+)\s*\(\s*(\d+)\s*\)/.exec(s) || /Vol\.?\s*(\d+)\s*,?\s*No\.?\s*(\d+)/i.exec(s);
  if (m) return `제${m[1]}권 제${m[2]}호`;
  m = /Vol\.?\s*(\d+)(?!\s*[,.]?\s*No)/i.exec(s);
  if (m) return `제${m[1]}호`;
  return '';
}
function journalIn(s) {
  let m = /[『「]([^』」]{2,30})[』」]/.exec(s);
  if (m) return m[1].trim();
  m = /^(?:사단법인\s+)?(.{2,30}?)\s*(?:\(|（)?\s*(?:통권\s*)?제\s*\d+\s*[권집호]/.exec(s);
  if (m) { const j = m[1].replace(/\s*\(.*$/, '').replace(/[\s,·.]+$/, '').trim(); if (!/^(제\s*\d|vol|no\b|\d)/i.test(j) && /[가-힣A-Za-z]{2}/.test(j)) return j; }
  return '';
}
function societyIn(s) {
  const m = /(?:사단법인|\(사\)|（사）)?\s*([가-힣][가-힣·\s]{1,24}?(?:학회|협회|연구회|연구소|연구원|센터|법원|재판소))(?=\s|$|\d|[,.])/.exec(s);
  return m && !/(대학원|법학전문)/.test(m[1]) ? m[1].replace(/\s+/g, ' ').trim() : '';
}
function infoFrom(ls, H, titleY, more = []) {   // the header (above the title) and the foot of page 1, then the running heads of page 2
  const head = ls.filter((L) => L.y < (titleY != null ? titleY : H * 0.25) || L.y > H * 0.9).concat(more);
  const info = { journal: '', society: '', issue: '', date: '' };
  for (const L of head) {
    const s = hangulize(L.s).replace(/제\s*호\s*(\d+)/g, '제$1호').replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0))
      .replace(/^\s*[-–]?\s*\d{1,4}\s*[-–|]?\s+(?=\D)/, '').replace(/\s+[-–|]?\s*\d{1,4}\s*[-–]?\s*$/, '');   // a page number at either end of a running head
    if (!info.journal) {
      const kj = knownJournalAt(s);
      const j = kj ? kj[0] : journalIn(s);
      if (j && letters(j) >= 2 && !isHeading(j)) { info.journal = j; info.issue = issueIn(s) || info.issue; }
    }
    if (!info.issue) info.issue = issueIn(s);
    if (!info.society) info.society = societyIn(s);
    if (!info.date) info.date = dateIn(s) || '';
  }
  if (!info.date) for (const L of ls.slice(0, 40)) { const d = dateInDoi(L.s); if (d) { info.date = d; break; } }
  if (!info.date) for (const L of ls.slice(0, 40)) { const y = yearInDoi(L.s); if (y) { info.date = y; break; } }   // at least the year
  if (info.journal) {
    const k = knownJournal(info.journal);
    if (k) { info.journal = k[0]; if (k[1]) info.society = k[1]; }
    else if (info.journal.endsWith(info.society)) info.society = '';
  }
  return info.journal || info.date ? info : null;
}

// ---------------------------------------------------------------- one page, a cover
const runningHeads = (pg) => {   // the lines at the top and foot of a page; a running head set a little lower counts too when it carries its page number
  if (!pg) return [];
  const H = pg.H || 842;
  return lines(pg).filter((L) => L.y < H * 0.08 || L.y > H * 0.92 || (L.y < H * 0.14 && L.s.length <= 60 && /^\s*\d{1,4}\s|\s\d{1,4}\s*$/.test(L.s)));
};
function fromArticle(pg, next) {
  const ls = lines(pg);
  if (!ls.length) return null;
  const all = ls.map((L) => L.s).join(' ');
  if (/학위\s*논문|지도\s*교수|Dissertation|Thesis/i.test(all)) return { thesis: true, info: infoFrom(ls, pg.H || 842, null, runningHeads(next)) };
  const H = pg.H || 842;
  const big = ls.filter((L) => L.y < H * 0.62 && letters(L.s) >= 4).reduce((a, b) => (!a || b.h > a.h + 0.4 ? b : a), null);
  const korean = hangulShare(all) >= 0.3 || !!big && hangulShare(big.s) >= 0.5;   // a Korean title over an English title and abstract
  const body = bodySize(ls);
  let t = pickTitle(ls, body, H, korean);
  let authors = t ? findAuthors(ls, t.end, body, H, korean) : null;
  if (!authors) { const a = titleAboveAuthors(ls, body, H, korean); if (a) { t = a.t; authors = a.authors; } }
  const info = infoFrom(ls, H, t ? ls[ls.findIndex((L) => cleanTitle(L.s) && t.title.startsWith(cleanTitle(L.s).slice(0, 6)))]?.y : null, runningHeads(next));
  if (!t) return { info };
  return { title: t.title, misread: t.misread, authors, info };
}
function titleAboveAuthors(ls, body, H, korean) {   // the first author line in the upper page, and the title just above it
  for (let k = 1; k < ls.length && ls[k].y < H * 0.6; k++) {
    if (isHeading(ls[k].s) || (ls[k].s.length > 45 && Math.abs(ls[k].h - body) < 0.8 && !(korean && hangulShare(ls[k].s) < 0.3))) break;   // the text has begun
    if (MARK_ONLY.test(ls[k].s) || ls[k].h < body * 0.95) continue;
    const names = authorsOf(ls[k].s);
    if (!names) continue;
    const t = pickTitle(ls.slice(0, k), body, H, korean);
    return t ? { t, authors: names } : null;
  }
  return null;
}
function fromCover(pg) {
  const ls = lines(pg);
  const val = (re) => { for (let k = 0; k < ls.length; k++) { const m = re.exec(ls[k].s); if (m) { const v = ls[k].s.slice(m[0].length).trim(); return v || (ls[k + 1] ? ls[k + 1].s : ''); } } return ''; };
  const title = val(/^\s*[[【]?\s*(논문명|논문\s*제목|제목|Title)\s*[\]】]?\s*[:：]?\s*/);
  const authors = authorsOf(val(/^\s*[[【]?\s*(저자명?|저\s*자|Authors?)\s*[\]】]?\s*[:：]?\s*/));
  const journal = val(/^\s*[[【]?\s*(학술지명?|간행물명?|저널명?|Journal)\s*[\]】]?\s*[:：]?\s*/);
  const society = val(/^\s*[[【]?\s*(발행기관|발행처|학회명?|Publisher)\s*[\]】]?\s*[:：]?\s*/);
  const vol = val(/^\s*[[【]?\s*(권호사항|권호|Vol)\s*[\]】]?\s*[:：]?\s*/);
  const info = journal ? { journal: hangulize(journal).replace(/[「」『』]/g, '').trim(), society: society.replace(/^\(?사\)?\s*/, '').trim(), issue: issueIn(hangulize(vol)) || (/(\d+)\D+(\d+)/.test(vol) ? vol.replace(/^.*?(\d+)\D+(\d+).*$/, '제$1권 제$2호') : ''), date: dateIn(vol) || dateIn(ls.map((L) => L.s).join(' ')) || '' } : null;
  if (info) { const k = knownJournal(info.journal); if (k) { info.journal = k[0]; if (k[1]) info.society = k[1]; } }
  return { title: title ? cleanTitle(title) : '', authors, info };
}
const COVER_WORDS = ['논문명', '저자', '발행기관', '발행처', '학술지', '수록', '권호', 'DBpia', 'dbpia', 'KCI', '이용일', '이용정보', '자료유형', '출처', 'URL', '누리미디어'];
const isCover = (pg) => { const t = lines(pg).map((L) => L.s).join('\n'); return COVER_WORDS.filter((k) => t.includes(k)).length >= 3; };

// ---------------------------------------------------------------- what the first page says
export function readFirstPages(p1, p2) {
  let r = null;
  try {
    if (isCover(p1)) {
      const c = fromCover(p1);
      const a = p2 ? fromArticle(p2, null) : null;
      r = { title: c.title || (a && a.title) || '', authors: c.authors || (a && a.authors) || null, info: c.info || (a && a.info) || null, thesis: a && a.thesis };
    } else r = fromArticle(p1, p2);
  } catch (e) { r = null; }
  if (!r) return null;
  const info = r.info || {};
  const out = { journal: info.journal || '', society: info.society || '', issue: info.issue || '', date: info.date || '', title: r.title || '', misread: r.misread || '', authors: r.authors || null, name: null };
  if (!r.thesis && out.title && out.authors && out.authors.length) {
    const name = (authorText(out.authors) + '_' + out.title).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    out.name = name.length > 150 ? name.slice(0, name.lastIndexOf(' ', 150) > 60 ? name.lastIndexOf(' ', 150) : 150).trim() : name;
  }
  return out;
}
// a middle dot the text layer turned into a space (사 보임 for 사·보임), put back from the file's own name when that holds the
// same title with the dot there; nothing else is taken from the file name
export function withFileName(r, fileName) {
  if (r && !r.name && r.misread && r.authors && r.authors.length && fileName) {   // a scan misread the title (한-8ㅁ 87^의 법적 쟁점): the file's own name, when it is that title
    const ft = cleanTitle(String(fileName).replace(/\.pdf$/i, '').normalize('NFC').replace(/^[^_]{2,20}_/, ''));
    const want = ft.match(/[가-힣]/g) || [];
    let i = 0; for (const ch of r.misread) if (i < want.length && ch === want[i]) i++;
    if (want.length >= 4 && i / want.length >= 0.7 && !misread(ft)) {
      const name = (authorText(r.authors) + '_' + ft).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
      return { ...r, title: ft, name };
    }
    return r;
  }
  if (!r || !r.name || !r.title || !fileName || !r.name.endsWith(r.title) || !r.title.includes(' ')) return r;
  const base = String(fileName).replace(/\.pdf$/i, '').normalize('NFC');
  const pat = r.title.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s·ㆍ･・‧]');
  const m = new RegExp(pat).exec(base);
  if (!m || m[0] === r.title || !/[·ㆍ･・‧]/.test(m[0])) return r;
  const title = m[0].replace(/[ㆍ･・‧]/g, '·');
  return { ...r, title, name: r.name.slice(0, r.name.length - r.title.length) + title };
}
export function authorBand(p1) {   // { y0, y1 } on page 1 to read like a scan when its text has a title but no author line, else null
  try {
    const ls = lines(p1); if (!ls.length) return null;
    const H = p1.H || 842, body = bodySize(ls), all = ls.map((L) => L.s).join(' ');
    const korean = hangulShare(all) >= 0.3;
    const t = pickTitle(ls, body, H, korean);
    if (!t || !t.title || findAuthors(ls, t.end, body, H, korean)) return null;
    let k = t.end + 1;
    while (k < ls.length && (MARK_ONLY.test(ls[k].s) || isSubtitle(ls[k].s))) k++;
    const top = ls[k - 1].y + 2, end = k < ls.length ? ls[k].y - ls[k].h * 0.9 : H * 0.6;
    return end - top >= body * 1.5 ? { y0: top, y1: Math.min(end, H * 0.6) } : null;
  } catch (e) { return null; }
}
// page 1 with the lines read from a picture of it (a scan reader's lines) put into that band
export function withBand(p1, band, items) {
  const add = (items || []).filter((i) => i.y > band.y0 && i.y - i.h < band.y1);
  return add.length ? { ...p1, items: [...p1.items, ...add] } : p1;
}
export function nameFromPages(p1, p2) {   // "저자_제목", or null when either is unclear
  const r = readFirstPages(p1, p2);
  return r && r.name ? { name: r.name, title: r.title, authors: r.authors } : null;
}
export function paperInfo(p1, p2) {   // { journal, society, issue, date } (any may be ''), or null
  const r = readFirstPages(p1, p2);
  return r && (r.journal || r.date) ? { journal: r.journal, society: r.society, issue: r.issue, date: r.date } : null;
}
