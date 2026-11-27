// 연구실 책장 — 공법의 같은 뜻 다른 말, and the common words of the law. A search that holds one of these finds what says
// it another way too ('처분성' and '항고소송의 대상'), and a common word of the law ('남용', '처분') is never taken for a
// person's name. Pure: no DOM, no network, so it loads anywhere (offline too, and in node for the tests).
//   expand(w)        → [w, ...the other ways of saying it]  (w itself first, as typed; [] for an empty w)
//   isLegalTerm(w)   → true when w is a word of the law (a common one, or one of a group below)
//   groupOf(w)       → the group w is in ([] when none)
//   concepts(words)  → the words of a question read as ideas: adjacent words that together are one term of a group
//                      ('정당 보조금', '재량권 일탈 남용') are one idea, each other word an idea of its own:
//                      [{ words: [...], text, variants: [the other ways of saying it] }]
//   areasOf(w)       → the fields of law w's group belongs to (['일반행정', '세무']), [] when none
//   tight(s)         → s without spaces and marks (how the groups are matched)
//   addTerms(words)  → more common words of the law (e.g. 법령용어 headwords)
export const tight = (s) => String(s || '').normalize('NFKC').replace(/[\s·ㆍ.,'"‘’“”「」『』()[\]<>]/g, '').toLowerCase();

// each group: one idea, the ways public-law writing and the courts say it (the first is the term a scholar would look up).
// Only true equivalents: a group widens a search, so a word that is merely near (취소소송 for 항고소송) is not in it.
const GROUPS = [
  // 행정법 — 행정소송
  ['처분성', '항고소송의 대상', '행정처분에 해당', '행정소송의 대상'],
  ['원고적격', '법률상 이익', '법률상 보호되는 이익'],
  ['협의의 소익', '소의 이익', '회복되는 법률상 이익', '권리보호의 이익', '권리보호이익'],
  ['재량통제', '재량권 일탈', '재량권 남용', '재량권 일탈·남용', '재량권의 일탈·남용'],
  ['하자승계', '하자의 승계', '선행처분의 위법'],
  ['처분사유 추가변경', '처분사유의 추가·변경', '처분사유의 추가 변경'],
  ['제재적 처분기준', '행정처분기준', '처분기준'],
  ['영업정지', '영업의 정지'],
  // 헌법 — 심사의 기준
  ['과잉금지원칙', '과잉금지', '과잉금지의 원칙', '비례원칙', '비례의 원칙', '비례성 원칙'],
  ['명확성원칙', '명확성의 원칙', '명확성 원칙'],
  ['포괄위임금지', '포괄위임입법금지', '포괄위임금지원칙', '위임입법의 한계'],
  ['신뢰보호원칙', '신뢰보호의 원칙', '신뢰보호'],
  ['소급입법금지', '소급입법금지원칙', '소급입법금지의 원칙'],
  ['적법절차', '적법절차원칙', '적법절차의 원칙'],
  ['법률유보', '법률유보원칙', '법률유보의 원칙'],
  ['평등원칙', '평등의 원칙', '평등권'],
  ['기본권 제한', '기본권 침해'],
  ['표현의 자유', '언론·출판의 자유', '언론 출판의 자유'],
  // 선거법·정치관계법
  ['선거운동의 자유', '정치적 표현의 자유'],
  ['선거의 공정', '선거의 공정성', '공정선거'],
  ['선관위', '선거관리위원회'],
  ['중앙선관위', '중앙선거관리위원회'],
  ['정당보조금', '정당에 대한 보조금', '정당에 대한 국고보조금', '정당 국고보조금'],
  ['1인 1표', '1인1표제', '1인 1표제'],
];
// words of the law that are never a person's name (two to three letters mostly: the ones a name test could mistake — many
// begin with a letter that is also a family name: 정당, 이익, 조례, 임용, 장관, 최저 …)
const COMMON = ['남용', '일탈', '처분', '재량', '위법', '취소', '무효', '각하', '기각', '인용', '행정', '소송', '계획', '결정', '판결',
  '위헌', '합헌', '침해', '제한', '보호', '정당', '선거', '국가', '공무',
  '헌법', '법률', '법령', '조례', '규칙', '명령', '위임', '입법', '사법', '재판', '판례', '법원', '헌재', '심판', '청구', '제청', '소원',
  '기본권', '자유', '평등', '권리', '의무', '책임', '손해', '배상', '보상', '수용', '허가', '인가', '특허', '신고', '등록', '승인',
  '과징금', '과태료', '벌금', '형벌', '처벌', '공소', '기소', '영장', '구속', '체포', '압수', '수색', '증거',
  '투표', '후보', '후보자', '정치', '자금', '의원', '국회', '정부', '지방', '자치', '공공', '공익', '사익', '이익', '법익', '민주',
  '비례', '과잉', '명확', '신뢰', '소급', '절차', '적법', '본질', '원칙', '기준', '요건', '효력', '시행', '개정', '폐지', '부칙',
  '조항', '단서', '본문', '위반', '해당', '적용', '해석', '판단', '사건', '경정', '의결', '공포', '집행', '정지', '계약', '행위',
  '사실', '임용', '장관', '최저', '강제', '윤리', '정의', '조세', '부담금', '보조금', '기탁금', '선거권', '피선거권', '공직', '공천'];

// the fields of law a group belongs to, as the judgments' index names them (precq's cats): a judgment of that field is
// weighed a little higher when the question holds the group ('협의의 소익' is the 항고소송's; civil procedure has its own
// '소의 이익')
const ADMIN = ['일반행정', '세무'], ELECTION = ['선거·특별', '형사'];
const AREAS = new Map([['처분성', ADMIN], ['원고적격', ADMIN], ['협의의 소익', ADMIN], ['재량통제', ADMIN], ['하자승계', ADMIN],
  ['처분사유 추가변경', ADMIN], ['제재적 처분기준', ADMIN], ['영업정지', ADMIN], ['선거운동의 자유', ELECTION], ['선거의 공정', ELECTION],
  ['선관위', ELECTION], ['중앙선관위', ELECTION], ['정당보조금', ELECTION], ['1인 1표', ELECTION]]);
const byWord = new Map();   // tight form → the group it is in
for (const g of GROUPS) for (const w of g) byWord.set(tight(w), g);
const common = new Set(COMMON.map(tight));
const MAX_SPAN = Math.max(...GROUPS.flat().map((w) => w.split(/\s+/).length), 3);

export function groupOf(w) { return byWord.get(tight(w)) || []; }
export function areasOf(w) { const g = groupOf(w); return (g.length && AREAS.get(g[0])) || []; }
export function expand(w) {
  const s = String(w ?? '').trim();
  if (!s) return [];
  const out = [s], seen = new Set([tight(s)]);
  for (const x of groupOf(s)) { const k = tight(x); if (!seen.has(k)) { seen.add(k); out.push(x); } }
  return out;
}
export function isLegalTerm(w) { const k = tight(w); return !!k && (common.has(k) || byWord.has(k)); }
export function addTerms(words) { for (const w of words || []) { const k = tight(w); if (k.length >= 2) common.add(k); } }
// adjacent words that are one term of a group, the longest first ('재량권 일탈 남용' is one idea, not three)
export function concepts(words) {
  const ws = (words || []).map((w) => String(w || '').trim()).filter(Boolean), out = [];
  for (let i = 0; i < ws.length;) {
    let took = 0;
    for (let n = Math.min(MAX_SPAN, ws.length - i); n >= 2 && !took; n--) if (byWord.has(tight(ws.slice(i, i + n).join('')))) took = n;
    const part = ws.slice(i, i + (took || 1)), text = part.join(' ');
    out.push({ words: part, text, variants: expand(text).slice(1) });
    i += took || 1;
  }
  return out;
}
