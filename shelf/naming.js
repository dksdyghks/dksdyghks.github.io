// 연구실 책장 — what a paper's first page says: a name for the file, "저자_제목" (the subtitle left out), and where it was
// published (journal, its society, volume and issue, date).
// Built on how Korean law journals lay out a first page: a header with the journal and the date, the title (often over two
// lines, with a footnote mark), a subtitle between dashes, an English title, the author (with a footnote number in front,
// spaced out, or in hanja after the affiliation), then 목차 / 요약. A database cover (DBpia, KCI …) is read by its labels.
// Careful by design: when the title and the author are not both clear, no name is given and the file keeps its own.
// Input: page objects as made by pdfkit.pageItems(): { W, H, items: [{ s, x, y, w, h }] } (y grows downward).
// Where it was published is read by cite.js from every line of the first pages (running heads too), the reading here by
// position standing in when cite.js finds nothing.
import { PAIRS } from './hanja.js?v=8af7a0a5d7';
import { printedCitation, issueText as citeIssue, dateText, glyphs, cleanName, plausibleName, notPubDates, stripLinks, nameKey } from './cite.js?v=8af7a0a5d7';

// ---------------------------------------------------------------- hanja → hangul
let HANJA = null;
const hanjaMap = () => { if (!HANJA) { HANJA = new Map(); for (let i = 0; i + 1 < PAIRS.length; i += 2) HANJA.set(PAIRS[i], PAIRS[i + 1]); } return HANJA; };
const IS_HAN = /[\u3400-\u9FFF\uF900-\uFAFF]/;
const readHan = (ch) => hanjaMap().get(ch) || hanjaMap().get(ch.normalize('NFC')) || null;
function initialRule(syl) {   // 두음법칙 for the first syllable of a word: 리→이, 로→노, 녀→여 …
  const c = syl.charCodeAt(0) - 0xAC00; if (c < 0 || c > 11171) return syl;
  const L = Math.floor(c / 588), V = Math.floor((c % 588) / 28), T = c % 28;
  const iotized = [2, 3, 6, 7, 12, 17, 20].includes(V);   // ㅑ ㅒ ㅕ ㅖ ㅛ ㅠ ㅣ
  const L2 = L === 5 ? (iotized ? 11 : 2) : (L === 2 && iotized ? 11 : L);   // ㄹ→ㅇ/ㄴ, ㄴ→ㅇ
  return String.fromCharCode(0xAC00 + L2 * 588 + V * 28 + T);
}
const WORD_START = /[論](?=[叢集文壇考])/;   // 論叢 論集 論文 論壇 論考 begin a word of their own (法學論叢 → 법학논총)
// In running text a few hanja are read otherwise than the standard's first reading (a person's name keeps it: 金 is 김 in a
// name, 금 in 賃金·金融·罰金), and some words are read as a whole.
const TEXT_READ = { 率: '률', 宅: '택', 金: '금' };
const WORDS = [['令狀', '영장'], ['訴狀', '소장'], ['省略', '생략'], ['更新', '갱신'], ['復活', '부활'], ['遊說', '유세'], ['簡易', '간이'],
  ['容易', '용이'], ['安易', '안이'], ['洞察', '통찰'], ['降伏', '항복'], ['句讀', '구두'], ['不利益', '불이익'], ['不實', '부실']];
const lead = (syl) => { const c = syl.charCodeAt(0) - 0xAC00; return c >= 0 && c <= 11171 ? Math.floor(c / 588) : -1; };   // its first consonant (ㄷ 3, ㅈ 12)
const tail = (syl) => { const c = syl.charCodeAt(0) - 0xAC00; return c >= 0 && c <= 11171 ? c % 28 : -1; };              // its last (none 0, ㄴ 4)
export function hangulize(s) {   // 公法學硏究 第18卷 → 공법학연구 제18권; one syllable for each hanja, so places in the text stay
  const cs = [...String(s)];
  const fixed = [];
  if (cs.some((ch) => IS_HAN.test(ch))) {
    for (const [w, r] of WORDS) {
      const ws = [...w];
      for (let i = 0; i + ws.length <= cs.length; i++) if (cs[i] === ws[0] && ws.every((x, k) => cs[i + k] === x)) [...r].forEach((y, k) => { fixed[i + k] = y; });
    }
  }
  const textRead = (ch) => TEXT_READ[ch] || readHan(ch);
  let out = '', prev = '';
  cs.forEach((ch, i) => {
    let r = IS_HAN.test(ch) ? fixed[i] || textRead(ch) : null;
    if (r && !fixed[i] && ch === '不') { const nx = IS_HAN.test(cs[i + 1] || '') ? textRead(cs[i + 1]) : null; r = nx && (lead(nx) === 3 || lead(nx) === 12) ? '부' : '불'; }   // 不當 부당, 不正 부정, 不備 불비, 不法 불법
    const start = !/[\p{L}\p{N}]/u.test(prev) || WORD_START.test(ch + (cs[i + 1] || ''));
    if (r) {
      let y = start && !fixed[i] ? initialRule(r) : r;
      if (!start && !fixed[i] && (y === '렬' || y === '률') && out && [0, 4].includes(tail(out[out.length - 1]))) y = y === '렬' ? '열' : '율';   // 規律 규율, 比率 비율, 分裂 분열
      out += y;
    } else out += ch;
    prev = ch;
  });
  return out;
}
// A text as 찾기 compares it: its hanja read in Hangul, and an initial ㄹ or ㄴ taken as a word's first sound is (理論 = 이론 =
// 리론, 規律 = 규율) — one letter for each letter, so places in the text stay. Text without hanja is left as it is.
export const HAS_HAN = /[\u3400-\u9FFF\uF900-\uFAFF]/;
export function soft(s) {
  let out = '';
  for (const ch of String(s)) {
    const c = ch.charCodeAt(0) - 0xAC00;
    if (c < 0 || c > 11171) { out += ch; continue; }
    const L = Math.floor(c / 588), V = Math.floor((c % 588) / 28), T = c % 28;
    const iot = [2, 3, 6, 7, 12, 17, 20].includes(V);
    const L2 = L === 5 ? (iot ? 11 : 2) : (L === 2 && iot ? 11 : L);
    out += L2 === L ? ch : String.fromCharCode(0xAC00 + L2 * 588 + V * 28 + T);
  }
  return out;
}
export function searchForm(s) {
  s = String(s || '');
  if (!HAS_HAN.test(s) || /[\uD800-\uDFFF]/.test(s)) return s;
  const h = hangulize(s);
  return h.length === s.length ? soft(h) : s;
}
export function personName(s) {   // a person's name as a library writes it (林智奉, 林 智 奉, 임지봉) → 임지봉, or null when it is no name
  let t = String(s || '').trim().replace(/^([가-힣]{3})\s+[가-힣]$/, '$1');   // "임지봉 이": a stray letter after a full name
  t = t.replace(/\s+/g, '');
  if (/^[가-힣]{2,5}$/.test(t)) return t;
  if (/^[\u3400-\u9FFF\uF900-\uFAFF]{2,4}$/.test(t)) return hanjaName(t);
  // half in hanja (安요환, 金철수: a catalogue's way with a surname): the hanja read, the rest kept
  if (/^[\u3400-\u9FFF\uF900-\uFAFF가-힣]{2,5}$/.test(t) && /[가-힣]/.test(t)) {
    const n = hanjaName(t);
    return n && (SURNAMES.has(n[0]) || SURNAMES2.has(n.slice(0, 2))) ? n : null;
  }
  return null;
}
export const isSurnameStart = (t) => SURNAMES.has(String(t)[0]) || SURNAMES2.has(String(t).slice(0, 2));
function hanjaName(s) {   // 金大仁 → 김대인 (the surname and the given name's first syllable by the initial-sound rule); 安요환 → 안요환
  const cs = [...s], r = cs.map((ch) => (/[가-힣]/.test(ch) ? ch : readHan(ch)));
  if (!r.length || r.some((x) => !x)) return null;
  const sur = SURNAMES2.has(r[0] + (r[1] || '')) && r.length >= 3 ? 2 : 1;
  if (IS_HAN.test(cs[0])) r[0] = initialRule(r[0]);
  if (r.length > sur + 1 && IS_HAN.test(cs[sur])) r[sur] = initialRule(r[sur]);   // (a syllable printed in Hangul is kept as printed)
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
const TITLE_PHRASE = /(?:에\s*관한|에\s*대한|고찰|검토|방안|쟁점|시론|소고|평석|중심으로)|[가-힣]의\s/;   // what a title says and an affiliation does not
// words that begin with a surname's syllable and stand where a name can (before an institution: 최근 대법원 …, 국립 부경대학교 …;
// a field before a degree: 정치학 박사), but are no one's name
const NOT_NAME = new Set(('한국 우리 최근 국가 국립 국제 국회 국군 국방 공군 육군 해군 공립 사립 공공 민간 서울 부산 지방 전국 연방 영국 독일 유럽 '
  + '대한 평시 현행 기존 주요 독립 독립적 정치학 경제학 경영학 사회학 국제학 경찰학').split(' '));
function koreanName(n) {
  if (!/^[가-힣]{2,5}$/.test(n) || isHeading(n) || NOT_NAME.has(n)) return false;
  if (SURNAMES2.has(n.slice(0, 2))) return n.length >= 3;
  return SURNAMES.has(n[0]) && (n.length <= 3 || (n.length === 4 && !TITLE_WORDS.test(n)));   // 대한연구 (a title's last words) is not a name
}
const ROLE = /(명예교수|초빙교수|겸임교수|연구교수|객원교수|석좌교수|부교수|조교수|교수|강사|선임연구원|책임연구원|전임연구원|연구위원|연구관|연구원|박사과정|박사수료|박사|석사과정|석사|변호사|판사|검사|교신저자|제1저자|주저자|공동저자|사무관|서기관|조사관|위원|소장|원장|실장|팀장|대표|교사|학생|조교|연구교수)/;
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
// The same few pages are asked for their lines again and again at upload (is it a notice, a cover, where is the citation,
// the title …), so a page's lines are kept with it — while its items stay the ones they were made from. (No caller changes
// the lines it is given.)
const LINES = new WeakMap();
function lines(pg) {
  if (!pg || !pg.items) return [];
  const kept = LINES.get(pg);
  if (kept && kept.items === pg.items && kept.n === pg.items.length) return kept.out;
  const out = makeLines(pg);
  LINES.set(pg, { items: pg.items, n: pg.items.length, out });
  return out;
}
function makeLines(pg) {
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
  // 『』 as HWP's fonts give them (\u0002 \u0003, 뺷 뺸), a font's private marks; HWP's middle dot (․ ∙ ⋅: 안 요 환 ․조 원 용) as ·
  for (const L of out) L.s = glyphs(L.s.normalize('NFC')).replace(/[․∙⋅]/g, '·').replace(/\s+/g, ' ').trim();
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
  t = t.replace(new RegExp(`[\\s${DASH},.·:：]+$`), '').trim();   // (a colon left where the subtitle was cut off at a line end)
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
  if (workLine(s) || authorsOf(s)) return false;
  if (korean && hangulShare(s) < 0.3) return false;                     // the English title of a Korean paper
  if (/[.。]$/.test(s) && s.length > 40) return false;                  // a sentence of the text
  return L.h >= body * 1.15;
}
function pickTitle(ls, body, H, korean) {
  // not a journal's name set large (earticle's sheet: 입법학연구 over 제19집 제2호): a known journal, or a line its volume follows
  const issueNext = (L, i) => { const n = ls[i + 1]; return !!n && n.y - L.y < L.h * 2.5 && /^\s*(?:제\s*\d+\s*[권집호]|Vol\.?\s*\d)/i.test(n.s); };
  const cand = ls.filter((L, i) => L.y < H * 0.62 && titleLike(L, body, korean) && !knownJournal(L.s) && !issueNext(L, i));
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
  // y: where the title block starts (the header is what stands above it; a running head repeating the title is not it)
  if (misread(title)) return { title: '', misread: title, end: z, y: ls[a].y };   // the letters were read wrong: no title from it, but the author line below is still found
  return { title, end: z, y: ls[a].y };
}
// letters a scan reader got wrong (한-8ㅁ 87^의 …): a loose consonant or vowel, or signs no title uses
const misread = (t) => /[가-힣]/.test(t) && /[\u3131-\u3160\u3162\u3163^|\\{}@#$%=+<>]/.test(t);

// ---------------------------------------------------------------- authors
const nameCase = (w) => (/[a-z]/.test(w) ? w : w.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()));   // GIL-DONG HONG → Gil-dong Hong
const NOT_ENGLISH_NAME = /\b(Study|Studies|Law|Laws|Legal|Korea|Korean|Journal|University|Review|Research|Rights?|Public|Court|Constitution\w*|Administrative|Act|Policy|Theory|Analysis|Comparative|System|Procurement|Contract|Focusing|Abstract|Introduction|Department|School|Professor)\b/i;
// where an author works, as an author line names it (경찰대학, 공군사관학교, 국회입법조사처 …), and the same word ending a word
// after the name (안요환 공군사관학교**: the name, then where he works, no role)
const INSTITUTION = /(대학교|대학원|대학|학교|연구원|연구소|법원|재판소|위원회|법무법인|입법조사처|법제처|국회|감사원)/;
const AFFIL_TOKEN = /(대학교|대학원|대학|학교|연구원|연구소|법원|재판소|위원회|법무법인|입법조사처|법제처)[*†‡\d)]*$/;
function affiliationLine(s) { return INSTITUTION.test(s) && /(교수|강사|연구원|연구위원|연구관|조사관|박사|변호사|판사|검사|원장|소장|사무관|서기관)/.test(s); }
// a line that only says where an author works, as no title does: in the narrower words of before (a title may well begin
// 국회, 대학 …: 대학 시간강사 제도 개선), and not one a title's phrase is in (국회의 입법권과 법원의 판사 …)
const workLine = (s) => /(대학교|대학원|연구원|연구소|법원|재판소|위원회|법무법인)/.test(s) && /(교수|강사|연구원|연구위원|박사|변호사|판사|검사|원장|소장)/.test(s) && !TITLE_PHRASE.test(s);
function cleanNamePart(p) {
  p = p.replace(/[*†‡§¶#⁎∗]+/g, ' ').replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, ' ')
    .replace(/^(\s*\d{1,3}\))+\s*/, '').replace(/(\s*\d{1,3}\))+\s*$/, '')                 // footnote numbers, also several (조 원 용 1)2))
    .replace(/["“”'’‘`´]+\s*$/, '').replace(/\d+$/, '').trim();
  return p;
}
function oneName(p) {
  p = cleanNamePart(p);
  if (!p) return null;
  if (/^([가-힣\u3400-\u9FFF\uF900-\uFAFF]\s+){1,4}[가-힣\u3400-\u9FFF\uF900-\uFAFF]$/.test(p)) p = p.replace(/\s+/g, '');          // 김 대 인, 金 大 仁
  else if (/^[가-힣]+(\s+[가-힣]+){1,2}$/.test(p) && (p.replace(/\s+/g, '').length === 3 || SURNAMES2.has(p.split(/\s+/)[0]) && p.replace(/\s+/g, '').length === 4)) p = p.replace(/\s+/g, '');   // 홍길 동 (a scan's stray space)
  p = p.replace(new RegExp(`\\s*${ROLE.source}\\s*$`), '').trim();
  if (/^[\u3400-\u9FFF\uF900-\uFAFF]{2,4}$/.test(p)) p = hanjaName(p) || p;                                                            // 金大仁 → 김대인
  if (/^[가-힣㐀-鿿豈-﫿]{2,5}$/.test(p) && IS_HAN.test(p) && /[가-힣]/.test(p)) { const n = hanjaName(p); if (n && isSurnameStart(n)) p = n; }   // 安 요 환: the surname in hanja
  // a mark the font gave a syllable's code after a full name (안요환빳 공군사관학교: no name ends in ㄸ ㅃ ㅉ)
  if (/^[가-힣]{4}$/.test(p) && !SURNAMES2.has(p.slice(0, 2)) && [4, 8, 13].includes(lead(p[3])) && koreanName(p.slice(0, 3))) p = p.slice(0, 3);
  { const m = new RegExp(`^${ROLE.source}\\s+([가-힣]{3})$`).exec(p); if (m && koreanName(m[2])) p = m[2]; }   // 변호사 홍길동 (a name of three: 변호사 윤리 is none)
  if (koreanName(p)) return p;
  const e = nameCase(p);
  // (nor where one works: Sejong Institute on the line under an author's is no second author)
  if (/^[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){1,3}$/.test(e) && !NOT_ENGLISH_NAME.test(e) && !AFF_EN.test(e)) return e;
  return null;
}
function authorsOf(raw) {   // the names on an author line, or null
  if (!raw || raw.length > 90) return null;
  let s = raw.normalize('NFC').replace(/[(（[【][^)）\]】]*[)）\]】]/g, ' ');                            // (Dae-in Kim) (소속) [소속]
  s = s.replace(/^\s*\d{1,3}\)\s*/, '').replace(/^\s*(?:저자|글쓴이|by(?=[\s:：])|authors?(?=[\s:：]))\s*[:：]?\s*/i, '');   // (Author(s): lost its (s) with the brackets)
  // a book's word after the names (홍길동 지음, 洪吉童 著, 홍길동 저: a name's own last syllable stays), "외 3인" for the others,
  // and Jr. kept with its name (JOHN G. ROBERTS, JR.)
  let etal = false;
  s = s.replace(/\s+(?:지음|공저|편저|공편|편역|엮음|옮김|저|편|역)\s*$|\s*(?:編著|共著|著|編|譯)\s*$/, '')
    .replace(/\s+(?:외|外)(?:\s*\d+\s*(?:인|명))?\s*$/, () => { etal = true; return ''; })
    .replace(/,?\s+(Jr|Sr)\.?(?=\s*$|\s*[,*†])/gi, ' $1.')
    .replace(/^\s*([A-Z][A-Za-z]+)\s*,\s*([A-Z][A-Za-z]*-[A-Za-z]+)\s*([*†‡\d]*)\s*$/, '$2 $1$3');   // Hong, Gil-Dong: the surname first
  if (affiliationLine(s)) {   // 이화여자대학교 법학전문대학원 교수 金 大 仁 / 홍길동 서울대학교 교수
    const toks = s.trim().split(/\s+/);
    const aff = toks.map((t) => ROLE.test(t) || AFFIL.test(t));
    // the name at the line's end is no part of the affiliation, though it ends as one does (교수 박지원, 교수 박 지 원: 원);
    // a role is no part of the name (법무법인 태평양 변호사 홍길동: 변호사 홍길동 would read as one, and the line's last role be lost)
    for (let n = Math.min(5, toks.length - 1); n >= 1; n--) {
      const tail = toks.slice(-n);
      if (aff.slice(0, toks.length - n).some(Boolean) && !tail.some((t) => ROLE.test(t)) && oneName(tail.join(' '))) { aff.fill(false, toks.length - n); break; }
    }
    const lastRole = aff.lastIndexOf(true);
    const after = toks.slice(lastRole + 1).join(' ');
    const firstAff = aff.indexOf(true);
    const before = toks.slice(0, Math.max(0, firstAff)).join(' ');
    s = after.replace(/[,，].*$/, '').trim() || before;
    if (!s) return null;
  } else {   // 안요환 공군사관학교**: the name, then where he works — one person's name (홍익법학 홍익대학교 법학연구소 is a
    // journal over its publisher: a word of four syllables is no name here). Nothing but where he works may follow it: in
    // 최근 대법원 판결을 중심으로, 평시 군사법원 체제 전환에 관한 소고 the institution is a title's word
    const toks = s.trim().split(/\s+/), k = toks.findIndex((t, i) => i > 0 && AFFIL_TOKEN.test(t));
    const work = (t) => MARK_ONLY.test(t) || AFFIL_TOKEN.test(t) || AFFIL.test(t.replace(/[*†‡\d)]+$/, '')) || ROLE.test(t);
    const head = k > 0 && toks.slice(k + 1).every(work) ? toks.slice(0, k).join(' ') : '', n = head && oneName(head);
    if (n && !(/^[가-힣]{4,}$/.test(n) && !SURNAMES2.has(n.slice(0, 2)))) s = head;
  }
  let parts = s.split(/\s*(?:[,，·・ㆍ‧･∙⋅/;、&]|\band\b|\s와\s|\s및\s)\s*/).map((p) => p.trim()).filter((p) => p && !MARK_ONLY.test(p));
  // Lim Jibong / Professor of Law, Konkuk University: the name without where he works
  if (parts.length > 1 && s.includes('/') && parts.some((p) => AFF_EN.test(p))) parts = parts.filter((p) => !AFF_EN.test(p));
  if (!parts.length || parts.length > 8) return null;
  const names = [];
  for (const p of parts) { const n = oneName(p); if (!n) return null; names.push(n); }
  if (etal) names.etal = true;
  return names;
}
const AFF_EN = /\b(University|College|Institute|School|Professor|Lecturer|Researcher|Department|Faculty|Ministry|Court)\b/i;
// the author lines after the first (법조: each author on a line of his own, the affiliation before the name), past the lines
// of where they work between them, until a heading or the text; names in the first line's script only (a romanized name
// on the next line is the same author). The block is set close: a line far below the last of it (a book's publisher at the
// foot of its title page: 박영사, 동방문화사) is not in it. A line that says where its author works gives names only after a
// first line of that kind (법조); after a line of names alone it is that author's affiliation (홍 길 동 / 법무법인 화우
// 변호사, 국립 부경대학교 법학과 교수: no 화우, no 국립)
const worksLine = (s) => affiliationLine(s) || INSTITUTION.test(s) || ROLE.test(s);
function nextAuthors(ls, k, names, body) {
  const first = ls[k], ko = /[가-힣]/.test(names[0]), firstWorks = worksLine(first.s);
  for (let j = k + 1, more = 0, prev = first; j < ls.length && more < 4 && names.length < 8; j++) {
    const M = ls[j];
    if (MARK_ONLY.test(M.s)) continue;
    if (M.y - prev.y > Math.max(prev.h, M.h) * 3) break;
    more++;
    if (isHeading(M.s) || (M.s.length > 45 && Math.abs(M.h - body) < 0.8)) break;
    const works = worksLine(M.s);
    const again = Math.abs(M.h - first.h) <= first.h * 0.2 && (firstWorks || !works) ? authorsOf(M.s) : null;
    if (again && again.every((n) => /[가-힣]/.test(n) === ko)) {
      for (const n of again) if (!names.includes(n)) names.push(n);
      if (again.etal) names.etal = true;
      more = 0; prev = M; continue;
    }
    if (!works) break;
    prev = M;
  }
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
    if (names) return nextAuthors(ls, k, names, body);
    if (isSubtitle(L.s) || (korean && hangulShare(L.s) < 0.3 && L.h >= body)) continue;   // a subtitle, the English title
    if (L.s.length > 45 && Math.abs(L.h - body) < 0.8 && !(korean && hangulShare(L.s) < 0.3)) break;   // the text has begun (not the English title)
  }
  return null;
}
export const authorText = (names) => (names.length === 1 && !names.etal ? names[0] : names.length === 2 && !names.etal ? names.join('·') : names[0] + ' 외');   // (etal: 홍길동 외 3인)

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
  ['국제법학회논총', '대한국제법학회'], ['서울대학교 법학', '서울대학교 법학연구소'], ['가천법학', '가천대학교 법학연구소'], ['중앙법학', '중앙법학회'],
  ['민주법학', '민주주의법학연구회'], ['법과정책', '제주대학교 법과정책연구원'], ['선거연구', '중앙선거관리위원회 선거연수원'],
  ['법학논집', null], ['법학연구', null], ['법학논총', null],
];
const squash = (s) => s.replace(/\s+/g, '');
// a journal's name as a page misprints or a reading misreads it: '…범학' (범 for 법: 민주범학) is no word in Korean; the
// halfwidth/katakana middle dots become '·'
export const fixJournal = (j) => String(j || '').replace(/범학(?=$|\s|연구|논집|논총)/g, '법학').replace(/[･・ㆍ‧]/g, '·');
function knownJournal(name) { const k = squash(name); return JOURNALS.find(([j]) => squash(j) === k) || null; }
// 8차: the society of a journal known here for certain ('가천법학' → '가천대학교 법학연구소'), or '' — for a shelf line read
// before the journal was known (the app may fill the society it lacks from it)
export function journalSociety(name) { const k = knownJournal(String(name || '').replace(/[「」『』]/g, '').trim()); return (k && k[1]) || ''; }
// 8차: a paper's line that names its journal but no volume or issue (권호 확인 필요): the app marks it from this
export const issuePartial = (info) => !!(info && info.journal && !String(info.issue || '').trim());
function knownJournalAt(line) {   // a line that starts with a known journal's name (a header like 「경제규제와 법(Journal of …)」 or a footer)
  const k = squash(line);
  return JOURNALS.filter(([j, soc]) => soc !== undefined && squash(j).length >= 3 && k.startsWith(squash(j))).sort((a, b) => b[0].length - a[0].length)[0] || null;
}
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
function dateIn(s0) {
  const s = stripLinks(s0);   // a DOI's digits are no date (…/nec.2025.1.23.003)
  let m = /(\d{4})\s*년\s*(\d{1,2})\s*월(?:\s*(\d{1,2})\s*일)?/.exec(s);
  if (!m) m = /(?:^|[^\d.])(\d{4})\s*\.\s*(\d{1,2})(?:\s*\.\s*(\d{1,2}))?\s*\.?(?!\d)/.exec(s);   // 2021. 4. 30. · (2014. 12) · 2024. 12 115: no period needed after the month
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
  m = /제\s*([권집])\s*(?:제\s*)?호\s*(\d+)\s+(\d+)(?!\d)/.exec(s);   // digits set apart from their words (제 권 호9 2: 제9권 제2호)
  if (m) return `제${m[2]}${m[1]} 제${m[3]}호`;
  m = /(?:^|[^통권\d])제\s*(\d+)\s*호/.exec(s);
  if (m) return `제${m[1]}호`;
  m = /[』」]\s*\.?\s*(\d+)\s*\(\s*(\d+)\s*\)/.exec(s) || /Vol\.?\s*(\d+)\s*[.,]?\s*No\.?\s*(\d+)/i.exec(s);   // Vol.19. No.2 too
  if (m) return `제${m[1]}권 제${m[2]}호`;
  m = /Vol\.?\s*(\d+)(?!\d)(?!\s*[.,]?\s*No)/i.exec(s);   // Vol. 513 alone: the one running number (its digits not cut short: Vol.19. No.2 is no 제1호)
  if (m) return `제${m[1]}호`;
  return '';
}
function journalIn(s) {
  // a name in brackets right before its volume (「법조」 제71권, 『공법연구』 제48집 제4호) is the journal
  let m = /[『「]([^』」]{2,30})[』」]\s*,?\s*(?:통권\s*)?제\s*\d+\s*[권집호]/.exec(s);
  if (m) return m[1].trim();
  m = /^(?:사단법인\s+)?(.{2,30}?)\s*(?:\(|（)?\s*(?:통권\s*)?제\s*(\d+)\s*([권집호])/.exec(s);
  if (m) {   // what stands before the issue, less what is no name: a rule's other side, page numbers, a year, a publisher in front (❙선거연구❙ 2026년, ∣160∣ 입법학연구)
    const j = cleanName(m[1].replace(/[❙∣│┃|]/g, ' | ')).name.replace(/\s*\(.*$/, '').replace(/[\s,·.]+$/, '').trim();
    const lawNo = m[3] === '호' && m[2].length >= 3 && /(?:법|법률|령|규칙|규정|조례|고시|훈령)$/.test(m[1].trim());   // 법률 제4496호
    if (!/^(제\s*\d|vol|no\b|\d)/i.test(j) && /[가-힣A-Za-z]{2}/.test(j) && !/[「」『』]/.test(j) && !lawNo && nameLike(j)) return j;
  }
  // a running head with the title first and the journal after it (…일고찰/조원용 7 중앙법학 제27집 제4호): the name before its volume
  m = /(?:^|[\s/|·])([가-힣][가-힣·]{1,14})\s*(?:통권\s*)?제\s*\d+\s*[권집]/.exec(s);
  if (m && !/^(?:법률|대통령령|조례|규칙|헌법|동법|같은법)$/.test(m[1])) return m[1];
  // a name in brackets anywhere else — but not a law's name inside a title (이른바 「개식용종식법」에 관한 …)
  m = /[『「]([^』」]{2,30})[』」]/.exec(s);
  if (m && !/(?:법|법률|령|규칙|조약|협정)$/.test(m[1].replace(/\s+/g, '')) && nameLike(m[1].trim())) return m[1].trim();
  return '';
}
// words that are no journal's name: a sentence's (조사 between words, quotes), or a law's name (행정규제기본법 제 조, 군정법령,
// 운영규정) — unless they are a journal's above (비교사법)
function nameLike(j) {
  if (knownJournal(j)) return true;
  return plausibleName(j) && !j.split(/\s+/).some((w) => /^[가-힣]{2,}(?:법|법률|령|규칙|규정|조례|고시|훈령)$/.test(w));
}
function societyIn(s) {
  const m = /(?:사단법인|\(사\)|（사）)?\s*([가-힣][가-힣·\s]{1,24}?(?:학회|협회|연구회|연구소|연구원|센터|법원|재판소))(?=\s|$|\d|[,.])/.exec(s);
  return m && !/(대학원|법학전문)/.test(m[1]) ? m[1].replace(/\s+/g, ' ').trim() : '';
}
function infoFrom(ls, H, titleY, more = []) {   // the header (above the title) and the foot of page 1, then the running heads of page 2
  const head = ls.filter((L) => L.y < (titleY != null ? titleY : H * 0.25) || L.y > H * 0.9).concat(more);
  const info = { journal: '', society: '', issue: '', date: '' };
  for (const L of head) {
    // a page number at either end of a running head (not the number of Vol. 513 or of 제 권 호9 2)
    const s = hangulize(L.s).replace(/제\s*호\s*(\d+)/g, '제$1호').replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0))
      .replace(/^\s*[-–]?\s*\d{1,4}\s*[-–|]?\s+(?=\D)/, '').replace(/(\S*)\s+[-–|]?\s*\d{1,4}\s*[-–]?\s*$/, (m, w) => (/(?:^|[^a-z])(?:vol|no)\.?$|^[제호권집]\d*$|^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?$/i.test(w) ? m : w));   // (nor the year of June 2022)
    if (!info.journal) {
      const kj = knownJournalAt(s);
      const j = kj ? kj[0] : journalIn(s);
      if (j && letters(j) >= 2 && !isHeading(j)) { info.journal = j; info.issue = issueIn(s) || info.issue; }
    }
    if (!info.issue) info.issue = issueIn(s);
    if (!info.society) info.society = societyIn(s);
    if (!info.date) info.date = dateIn(notPubDates(s)) || '';   // (when it was sent, reviewed or accepted is cut out of the line)
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
  const H = pg.H || 842;
  // a thesis's cover says so in a line of its own (박사학위논문, 지도교수 …, A Dissertation); a paper's note that it grew out of
  // one (본 연구는 … 학위논문의 일부를 …) is no cover
  if (ls.some((L) => L.y < H * 0.8 && thesisLine(L.s))) return { thesis: true, info: infoFrom(ls, H, null, runningHeads(next)) };
  const big = ls.filter((L) => L.y < H * 0.62 && letters(L.s) >= 4).reduce((a, b) => (!a || b.h > a.h + 0.4 ? b : a), null);
  const korean = hangulShare(all) >= 0.3 || !!big && hangulShare(big.s) >= 0.5;   // a Korean title over an English title and abstract
  // the size of the text; a title page alone (법제: its title, subtitle and author, nothing else) has none, so the usual one
  const body = all.length < 200 ? Math.min(bodySize(ls), 10.5) : bodySize(ls);
  let t = pickTitle(ls, body, H, korean);
  let authors = t ? findAuthors(ls, t.end, body, H, korean) : null;
  if (!authors) { const a = titleAboveAuthors(ls, body, H, korean); if (a) { t = a.t; authors = a.authors; } }
  const info = infoFrom(ls, H, t ? t.y : null, runningHeads(next));
  if (!t) return { info };
  return { title: t.title, misread: t.misread, authors, info };
}
// (a cover's line: 법학박사 학위논문, 지도교수 김 은 수, A Dissertation submitted to …; not a note's sentence that mentions one:
// * 이 글은 필자의 박사학위논문 …)
const thesisLine = (s) => {
  const t = hangulize(s).trim();
  if (/^지도\s*교수/.test(t)) return t.length <= 40;
  if (/^A\s+(?:Dissertation|Thesis)\s+(?:submitted|presented)\b/i.test(t)) return true;
  if (t.length > 40 || /^[*†‡\d]|[은는을를의]\s/.test(t)) return false;
  return /(?:석사|박사)?\s*학위\s*(?:청구\s*)?논문$|^(?:A\s+)?(?:Doctoral\s+|Master'?s\s+)?(?:Dissertation|Thesis)\b/i.test(t);
};
function titleAboveAuthors(ls, body, H, korean) {   // the first author line in the upper page, and the title just above it
  for (let k = 1; k < ls.length && ls[k].y < H * 0.6; k++) {
    if (isHeading(ls[k].s) || (ls[k].s.length > 45 && Math.abs(ls[k].h - body) < 0.8 && !(korean && hangulShare(ls[k].s) < 0.3))) break;   // the text has begun
    if (MARK_ONLY.test(ls[k].s) || ls[k].h < body * 0.95) continue;
    const names = authorsOf(ls[k].s);
    if (!names) continue;
    const t = pickTitle(ls.slice(0, k), body, H, korean);
    return t ? { t, authors: nextAuthors(ls, k, names, body) } : null;
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
// a database's cover (DBpia, KCI …), read by its labels: three of these words make one
const LABEL_WORDS = ['논문명', '저자', '발행기관', '발행처', '학술지', '수록', '권호', 'DBpia', 'dbpia', 'KCI', '이용일', '이용정보', '자료유형', '출처', 'URL', '누리미디어'];
const isCover = (pg) => { const t = lines(pg).map((L) => L.s).join('\n'); return LABEL_WORDS.filter((k) => t.includes(k)).length >= 3; };
// … and the notices put before a paper (KJCI's copyright notice, earticle's download sheet). A cover or a notice, a title
// page alone (법제: its title and author, then a blank page) and a blank page are passed over when the citation is read; a
// notice is not read for a title (its words are no labels). ("earticle" alone is on every page of its PDFs: its notice's words)
const COVER_WORDS = [...LABEL_WORDS, '저작권 정책', 'KJCI', '셀프아카이빙', 'earticle에서 제공', '학술교육원', 'To cite this article'];
const noticeWords = (ls) => { const t = ls.map((L) => L.s).join('\n'), sq = t.replace(/\s+/g, ''); return COVER_WORDS.filter((k) => t.includes(k) || sq.includes(k.replace(/\s+/g, ''))).length >= 3; };
function notPaper(pg) {
  const ls = lines(pg);
  if (!ls.length || noticeWords(ls)) return true;
  return ls.length <= 6 && !/\d/.test(ls.map((L) => L.s).join('\n'));   // no number on it, so no citation either
}

// ---------------------------------------------------------------- where it was published, as the paper prints it
// cite.js over every line of the paper's first pages (page 1's header and foot, the running heads after it, wherever they sit)
// (the journals above are known too, KCI's list or not: a name ending in 법 — 경제규제와 법 — is else taken for a law's)
const JOURNAL_KEYS = new Set(JOURNALS.map(([j]) => nameKey(j)));
function printedOn(pages, known) {
  try {
    const use = pages.filter((pg) => pg && pg.items && !notPaper(pg)).slice(0, 5);
    if (!use.length) return null;
    const kn = { has: (k) => JOURNAL_KEYS.has(k) || (!!known && known.has(k)) };
    const c = printedCitation(use.map((pg) => lines(pg).map((L) => L.s).join('\n')), { known: kn, hangulize });
    return c.found ? c : null;
  } catch (e) { return null; }
}
// what the position reading gave (info), with the printed citation over it: its journal, its issue, its date — but a year
// alone gives way to that year with its month, read on the page's head
function withPrinted(info, c) {
  if (!c) return info;
  const out = { ...info };
  const k = knownJournal(c.journal), was = knownJournal(info.journal);
  out.journal = k ? k[0] : c.journal;
  const same = !!info.journal && nameKey(was ? was[0] : info.journal) === nameKey(out.journal);
  out.issue = citeIssue(c) || (same ? info.issue : '');
  const d = dateText(c.date), had = String(info.date || '');
  out.date = !d ? had : d.length === 4 && had.startsWith(d + '-') ? had : d;
  if (!same && was && was[1] && out.society === was[1]) out.society = '';   // (the society of the journal it took for this one)
  if (k && k[1]) out.society = k[1];
  else if (c.society) out.society = c.society;
  if (out.society && out.journal.endsWith(out.society)) out.society = '';
  return out;
}

// ---------------------------------------------------------------- what the first page says
// p1, p2: pages 1 and 2; more: the pages after them (two to four: a cover, a notice or a blank page can come first);
// known: KCI's journal names (cite.knownNames), or null
// earticle's download sheet names the paper in a line of its own: To cite this article : 안요환 (2022) 제목 - 부제 -, 입법학연구, 19:2, 159-184
function fromEarticle(pg) {
  const all = lines(pg).map((L) => L.s).join(' '), at = all.search(/To cite this article\s*:/i);
  if (at < 0) return null;
  // (the citation is one sentence: it is read within a few hundred letters of its label, in groups of bounded length, so a
  // long page whose citation never completes cannot make the match slow)
  const m = /^To cite this article\s*:\s*(.{1,120}?)\s*\(((?:19|20)\d{2})\)\s*(.{1,300}?)\s*,\s*([^,]{2,40}?)\s*,\s*(\d+)\s*:\s*(\d+)\s*,/i.exec(all.slice(at, at + 600));
  return m ? { title: cleanTitle(m[3]), authors: authorsOf(m[1]), info: null } : null;
}
// The result's page: where the paper itself begins (0-based; past a database's cover or notice, the page its name was read
// from), for its picture in the library
export function readFirstPages(p1, p2, more = [], known = null) {
  let r = null, page = 0;
  try {
    const notice = notPaper(p1) && !isCover(p1);   // a notice put before the paper (KJCI, earticle), a title page alone, a blank page
    const e = notice ? fromEarticle(p1) : null;
    const pages = [p1, p2, ...(more || [])].filter(Boolean);
    const i = notice ? pages.findIndex((pg, k) => k > 0 && !notPaper(pg)) : -1;
    if (e && e.title && e.authors) { r = e; page = Math.max(0, i); }
    else if (notice) {   // the first of the pages up to the paper's own first page that gives both its title and its author
      const upTo = pages.slice(0, i < 0 ? pages.length : i + 1);
      let found = null;
      const got = [];
      for (let k = 0; k < upTo.length && !found; k++) { const x = got[k] = fromArticle(upTo[k], upTo[k + 1] || null); if (x && x.title && x.authors) { found = x; page = k; } }
      // (nothing read: the picture is of the first page that is neither blank nor a notice — a book's cover, which is
      // passed over as a notice when the citation is read, is its own picture)
      if (!found) page = Math.max(0, pages.findIndex((pg) => { const L = lines(pg); return L.length > 0 && !noticeWords(L); }));
      r = found || (i > 0 ? (i in got ? got[i] : fromArticle(pages[i], pages[i + 1] || null)) : fromArticle(p1, p2));
    } else if (isCover(p1)) {
      const c = fromCover(p1);
      const a = p2 ? fromArticle(p2, null) : null;
      if (p2) page = 1;
      r = { title: c.title || (a && a.title) || '', authors: c.authors || (a && a.authors) || null, info: c.info || (a && a.info) || null, thesis: a && a.thesis };
    } else r = fromArticle(p1, p2);
  } catch (e) { r = null; page = 0; }
  const c = printedOn([p1, p2, ...(more || [])], known);
  if (!r && !c) return null;
  r = r || {};
  const info = withPrinted({ journal: '', society: '', issue: '', date: '', ...(r.info || {}) }, c);
  const out = { journal: fixJournal(info.journal || ''), society: info.society || '', issue: info.issue || '', date: info.date || '', title: r.title || '', misread: r.misread || '', authors: r.authors || null, name: null, page };
  if (!out.society && out.journal) out.society = journalSociety(out.journal);   // (a journal known for certain: its society, though the page did not print it)
  if (issuePartial(out)) out.partial = true;   // (the journal read but not its 권호: '권호 확인 필요' on the shelf's row)
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
// { y0, y1 } on page 1 to read like a scan, else null: the strip under the title when its text has a title but no author line;
// or, marked top, the page above its first line when the text begins low with no title over it (the title, the author and
// the 목차 box drawn as outlines, not written: a KCI download of 法과 政策 whose text starts at the abstract) — only on a page
// whose text is a paper's (a scan's lone download notice is no reason to read a whole page at upload)
export function authorBand(p1) {
  try {
    const ls = lines(p1); if (!ls.length) return null;
    const H = p1.H || 842, body = bodySize(ls), all = ls.map((L) => L.s).join(' ');
    const korean = hangulShare(all) >= 0.3;
    const t = pickTitle(ls, body, H, korean);
    if (!t) {
      const f = ls.find((L) => letters(L.s) >= 4);
      return f && f.y - f.h > H * 0.35 && f.y < H * 0.75 && ls.length >= 6 && all.length >= 200 && !notPaper(p1) ? { y0: 0, y1: f.y - f.h * 1.2, top: true } : null;
    }
    if (!t.title || findAuthors(ls, t.end, body, H, korean)) return null;
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
