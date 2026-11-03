/* 연구자 안요환의 문체·연구 방식 기준값.
   박사학위논문(2026)과 학술지 논문 14편(단독·2인 공저)의 본문을 lawtext.styleMetrics로 잰 값이다.
   본문만 잰다: 쪽 아래의 각주, 본문 속 각주 번호, 목차, 참고문헌은 뺀다(lawtext.bodyOfPages, write.proseOf). 새 원고도 같은 방식으로 잰다.
   군사과학논집 게재 글과 3인 이상 공저는 넣지 않았다. median = 15편의 가운데 값, lo–hi = 아래·위 10%를 뺀 범위.
   서재에서 ‘내 글’로 표시한 문헌이 생기면 YO아이가 그 문헌으로 같은 값을 다시 재어 함께 보여 준다. */
export const BASE = {
  n: 15, sentences: 5302,
  avgLen: { median: 98, lo: 85, hi: 115, label: '문장 평균 길이', unit: '자' },
  p90: { median: 151, lo: 132, hi: 218, label: '긴 문장(상위 10%) 길이', unit: '자' },
  longShare: { median: 5, lo: 2.2, hi: 12.6, label: '200자 넘는 문장 비율', unit: '%' },
  assertShare: { median: 7.2, lo: 3.3, hi: 13.6, label: '단정형 맺음(필요가 있다·타당하다 등)', unit: '%' },
  hedgeShare: { median: 1.5, lo: 0.4, hi: 3.8, label: '유보형 맺음(생각된다·보인다 등)', unit: '%' },
  quoteMarks: { median: 1.81, lo: 0.84, hi: 3.11, label: '‘작은따옴표’ 강조(천 자당)', unit: '회' },
  selfRef: { median: 0.2, lo: 0.11, hi: 0.4, label: '자기 지칭(본고·본 연구, 천 자당)', unit: '회' },
};
/* 내 글에서 빼는 것: 이 기준값과 자기표절 대조의 ‘내 글’ 묶음 모두에 적용 */
export const EXCLUDE = { venue: /군사과학/, maxAuthors: 2 };
export const authorCount = (a) => { const s = String(a || ''), more = +((s.match(/외\s*(\d+)\s*인/) || [])[1] || 0); return s.replace(/\s*외\s*\d+\s*인/, '').split(/[·,&ㆍ]|\sand\s/).map((x) => x.trim()).filter(Boolean).length + more; };
export const excluded = (d) => !!(d && (d.exclude || EXCLUDE.venue.test(d.venue || '') || EXCLUDE.venue.test(d.title || '') || authorCount(d.author) > EXCLUDE.maxAuthors));

export const PORTRAIT = {
  thesis: '이름(형식)이 실질을 가려 국가권력이 받아야 할 통제를 비켜 가고 있지 않은가 — 그렇다면 입법권자가 숙의를 거쳐 이름을 바로잡아야 한다.',
  threads: [
    ['형식과 실질의 괴리', '‘조사’의 실질은 강제수사(영장주의), ‘당선무효’의 실질은 무효가 아님(정명), 국정원 ‘조사권’은 수사권 폐지의 우회로, 적극행정 ‘면책’은 사후에만 판단됨'],
    ['권한에 상응하는 통제', '고도의 독립성일수록 그에 상응하는 통제가 없으면 편향의 관철 수단으로 전용될 위험 — 박사논문의 결론 명제'],
    ['입법권자의 숙의', '결론은 거의 언제나 입법권자의 결단과 숙의로 향한다(‘숙의’ 81회, ‘입법권자’ 42회)'],
  ],
  flow: ['서론: 현실의 사건·통계 → 입법자의 의도와 현실의 괴리 → 연구 목적', '현황: 법제의 내용과 연혁(조문 대조표)', '판례 평가: 헌법재판소·대법원 판단의 오판·간과를 사건번호와 함께 비판', '비교법: 미국·일본·캐나다(·호주) → 시사점, 반면교사·정면교사', '개선방안: 개헌안·개정안을 ①②③으로 조문까지', '결론: “이상에서 … 그 결과 …를 확인하였다”, 후속연구'],
  style: ['단정적 맺음(필요가 있다·타당하다·바람직하다), 유보 표현은 드묾', '‘본 연구’로 자기 지칭, ‘필자’는 거의 쓰지 않음, 사견은 ‘사견’·‘생각건대’로 표시', '핵심 개념을 ‘작은따옴표’로 자주 강조, 개념어에 한자 병기', '“~라는 점이 그것이다” 구문, ‘요컨대’, ‘첫째, 둘째’', '대비 수사: 추상적 선과 구체적 악, 반면교사와 정면교사, 형식과 실질'],
  strengths: ['일관된 렌즈(형식과 실질, 권한과 통제)로 연구자 정체성이 뚜렷함', '판례를 정확히 인용·비판하고 결론이 구체적 조문 개정안으로 끝남', '논문마다 새로 씀(논문끼리 7어절 이상 겹침 3% 미만)'],
  watch: ['반론 검토가 짧음: 반대 견해·예상 반론을 정면으로 다루는 서술이 학술지 논문 한 편에 1회 남짓', '대륙법(독일·프랑스) 비교가 적음', '200자를 넘는 긴 문장', '작은따옴표 강조의 밀도', '결론이 본문 요약에 치우침: 서론의 질문과 결론의 답이 한 문장으로 맞물리는지'],
  citeStyle: { article: '저자, “제목”, 『학술지』 제○권 제○호 (발행기관, 연도. 월.), ○면.', book: '저자, 『책』 (출판사, 연도), ○면.', again: '저자, 앞의 논문, ○면. (같은 저자의 글이 둘 이상이면: 임지봉, 앞의 논문 (2022), 72-73면.)', case: '헌법재판소 2007. 6. 28. 선고 2004헌마644 전원재판부 결정.' },
};
/* 첫 쪽에서 군사과학논집 게재 글이나 3인 이상 공저로 보이는지: ‘내 글’로 켤 때 물어보는 데 쓴다(저절로 빼지는 않는다) */
export function excludeHint(pages) {
  const t = String((pages || []).slice(0, 2).join(' ')).replace(/\s+/g, ' ');
  if (/군사과학논집|Journal of Military Science/i.test(t)) return '군사과학논집 게재 글';
  // an author line: three or more names joined by ·, one of them 안요환 (‘거부·정지·제한’ in a sentence is not one)
  for (const m of t.slice(0, 4000).matchAll(/[가-힣]{2,4}(?:\s*\*{0,8}\s*[・·∙ㆍ]\s*[가-힣]{2,4}){2,}/g)) {
    const names = m[0].split(/\s*\*{0,8}\s*[・·∙ㆍ]\s*/).map((x) => x.replace(/\*+/g, '').trim());
    if (names.length >= 3 && names.some((x) => /^안\s?요\s?환$/.test(x))) return `3인 이상 공저(${names.join('·')})`;
  }
  return '';
}
