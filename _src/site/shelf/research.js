// 연구실 책장's first screens, made for its owner's research (안요환, 공군사관학교 항공우주정책학과: 입법정책·정치관계법·
// 행정법·헌법). The provisions examined in the research and the cases a work names come from the homepage itself
// (build.py writes research.json from its own lists), so a new paper there is here too; the laws of each field below, and
// the topics 논문 찾기 starts from, are this app's own.
export const ME = '안요환';

// 판례·법령: each field's laws, as a lawyer names them (the second, when given, is the law's own name)
export const FIELDS = [
  { name: '정치관계법', laws: [['공직선거법'], ['공직선거관리규칙'], ['선거관리위원회법'], ['정당법'], ['정치자금법'], ['국민투표법']] },
  { name: '헌법·헌법재판', laws: [['헌법'], ['헌법재판소법'], ['헌법재판소 심판 규칙'], ['국회법'], ['집시법', '집회 및 시위에 관한 법률']] },
  { name: '행정법', laws: [['행정기본법'], ['적극행정 운영규정'], ['행정조사기본법'], ['행정절차법'], ['행정소송법'], ['국가배상법'], ['민간투자법', '사회기반시설에 대한 민간투자법'], ['국가계약법', '국가를 당사자로 하는 계약에 관한 법률']] },
  { name: '형사·안보·군사', laws: [['형법'], ['형사소송법'], ['군형법'], ['군사법원법'], ['통신비밀보호법'], ['국가정보원법'], ['사이버안보 업무규정'], ['군용기운용법', '군용항공기 운용 등에 관한 법률']] },
  { name: '항공우주법', laws: [['우주개발 진흥법'], ['우주손해배상법'], ['우주항공청법', '우주항공청의 설치 및 운영에 관한 특별법'], ['항공안전법'], ['항공사업법']] },
  { name: '민사·경제', laws: [['민법'], ['신탁법'], ['중대재해처벌법', '중대재해 처벌 등에 관한 법률'], ['산업안전보건법']] },
];

// the laws above by their own names, for the names offered while typing (these come first)
export const PREFER = FIELDS.flatMap((f) => f.laws.map(([label, name]) => name || label));

// 논문 찾기: the research topics, as words a catalogue finds them by
export const TOPICS = ['선거관리위원회 독립성', '선거범죄 조사', '당선무효', '영장주의', '재판의 전제성', '집회의 자유', '적극행정',
  '민간투자법', '상관모욕죄', '공범과 신분', '불법원인급여', '중대재해처벌법', '사이버안보', '우주법', '근우주'];

// the homepage's lists (research.json, beside this file): asked once; none when it cannot be read (the screens do without)
let asked = null;
export function mine() {
  if (!asked) asked = fetch(new URL('./research.json', import.meta.url)).then((r) => (r.ok ? r.json() : null)).then((d) => (d && Array.isArray(d.provisions) ? d : null)).catch(() => { asked = null; return null; });
  return asked;
}
