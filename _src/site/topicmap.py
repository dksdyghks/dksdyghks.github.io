"""Topic network for the research map: topics are nodes (size = number of works),
edges join topics that appear in the same work (width = number of shared works).
Topic tags per work are an editorial reading of each paper's author keywords and title."""
import math, random

GROUPS = {
    'pol': ('정치관계법', 'Election & Political Law'),
    'con': ('헌법', 'Constitutional Law'),
    'leg': ('입법정책', 'Legislative Policy'),
    'met': ('연구 방법', 'Method'),
}
TOPICS = {  # key: (group, ko, en)
    'elec_comm': ('pol', '선거관리위원회', 'Election Commission'),
    'elec_crime': ('pol', '선거범죄', 'Election Crimes'),
    'elec_sys': ('pol', '선거제도', 'Electoral System'),
    'warrant': ('con', '영장주의·적법절차', 'Warrants & Due Process'),
    'adjud': ('con', '헌법재판', 'Constitutional Adjudication'),
    'rights': ('con', '기본권', 'Fundamental Rights'),
    'sep': ('con', '권력분립', 'Separation of Powers'),
    'adm_inv': ('con', '행정조사', 'Administrative Investigation'),
    'reform': ('leg', '입법 개선', 'Legislative Reform'),
    'delib': ('leg', '숙의', 'Deliberation'),
    'crim': ('leg', '형사법제', 'Criminal Law'),
    'civil': ('leg', '민사·경제법제', 'Civil & Economic Law'),
    'admin': ('leg', '행정법제', 'Administrative Law'),
    'space': ('leg', '항공우주법', 'Aviation & Space Law'),
    'security': ('leg', '국가안보·군사법', 'Security & Military Law'),
    'comp': ('met', '비교법', 'Comparative Law'),
    'case': ('met', '판례 분석', 'Case Analysis'),
}
TAGS = {  # Korean title (as stored in build.py) -> topic keys
    '우리나라 중대재해처벌 관련 법제의 개선방안 연구:': ['crim', 'reform', 'comp'],
    '불법원인급여에 대한 반환 금지 규정의 개선방안 연구:': ['civil', 'sep', 'delib', 'reform', 'case'],
    '선거관리위원회 조사권에 관한 일고찰': ['elec_comm', 'elec_crime', 'warrant', 'adm_inv', 'delib', 'reform', 'comp'],
    '헌법상 영장주의에 관한 일고찰': ['warrant', 'adm_inv', 'comp', 'reform'],
    '제5기 헌법재판소 결정에 대한 성향분석': ['adjud', 'rights', 'case'],
    '부동산 담보신탁에서 완전한 소유권의 이전 필요성에 관한 검토': ['civil', 'case'],
    '군형법상 상관모욕죄의 입법적 및 해석적 오류': ['crim', 'security', 'adjud', 'case', 'comp', 'reform'],
    '선거 관련 법제에 관한 헌법학적 연구': ['elec_crime', 'elec_sys', 'delib', 'reform', 'comp'],
    '우리나라의 적극행정 법제에 관한 연구': ['admin', 'reform'],
    '위헌법률심판에서 재판의 전제성과 예외로서 심판의 필요성': ['adjud', 'sep', 'delib', 'case'],
    '선거범죄 조사 관련 우리나라 헌법재판소의 해석과 일본 사례': ['elec_comm', 'elec_crime', 'warrant', 'adm_inv', 'adjud', 'comp'],
    '민간투자법의 입법론적 개선 필요성에 관한 연구': ['admin', 'civil', 'case', 'reform'],
    '우리 헌법상 선거제도와 선거관리 일반론': ['elec_sys', 'elec_comm'],
    '사이버안보 업무에 관한 헌법학적 연구': ['security', 'rights', 'adm_inv', 'reform'],
    '공범과 신분에 관한 규정의 개선방안 연구': ['crim', 'reform'],
    '헌법적 관점에서 본 우주법상 전유화 금지 원칙과 우주사고 책임': ['space', 'rights'],
    '근우주 영역의 규범적 공백에 관한 일고찰': ['space', 'security', 'reform'],
    '선거관리 주체의 독립성과 권한 통제에 관한 비교연구:': ['elec_comm', 'sep', 'elec_crime', 'comp'],
    # theses
    '선거관리위원회의 독립성과 정치적 중립성에 관한 연구': ['elec_comm', 'sep', 'comp'],
    '헌법상 영장주의와 선거관리위원회의 선거범죄 조사에 관한 연구': ['warrant', 'elec_comm', 'elec_crime', 'adm_inv'],
}


def graph():
    count = {k: 0 for k in TOPICS}
    works = {k: [] for k in TOPICS}
    edges = {}
    for title, tags in TAGS.items():
        for t in tags:
            count[t] += 1
            works[t].append(title)
        for i in range(len(tags)):
            for j in range(i + 1, len(tags)):
                a, b = sorted((tags[i], tags[j]))
                edges[(a, b)] = edges.get((a, b), 0) + 1
    return count, works, edges


def layout(width, height, seed=7, iters=900):
    count, works, edges = graph()
    keys = list(TOPICS)
    rnd = random.Random(seed)
    # group anchors keep each field in its own region
    anchors = {'pol': (0.22, 0.32), 'con': (0.5, 0.62), 'leg': (0.78, 0.36), 'met': (0.48, 0.18)}
    if height > width:
        anchors = {'pol': (0.3, 0.2), 'con': (0.6, 0.5), 'leg': (0.4, 0.8), 'met': (0.75, 0.25)}
    pos = {}
    for k in keys:
        ax, ay = anchors[TOPICS[k][0]]
        pos[k] = [ax * width + rnd.uniform(-40, 40), ay * height + rnd.uniform(-40, 40)]
    area = width * height
    kk = 0.62 * math.sqrt(area / len(keys))
    t = width / 8
    for it in range(iters):
        disp = {k: [0.0, 0.0] for k in keys}
        for i, a in enumerate(keys):
            for b in keys[i + 1:]:
                dx = pos[a][0] - pos[b][0]; dy = pos[a][1] - pos[b][1]
                d = math.hypot(dx, dy) or 0.01
                f = kk * kk / d
                disp[a][0] += dx / d * f; disp[a][1] += dy / d * f
                disp[b][0] -= dx / d * f; disp[b][1] -= dy / d * f
        for (a, b), wgt in edges.items():
            dx = pos[a][0] - pos[b][0]; dy = pos[a][1] - pos[b][1]
            d = math.hypot(dx, dy) or 0.01
            f = d * d / kk * (0.35 + 0.25 * wgt)
            disp[a][0] -= dx / d * f; disp[a][1] -= dy / d * f
            disp[b][0] += dx / d * f; disp[b][1] += dy / d * f
        for k in keys:  # gentle pull toward the field anchor
            ax, ay = anchors[TOPICS[k][0]]
            disp[k][0] += (ax * width - pos[k][0]) * 0.9
            disp[k][1] += (ay * height - pos[k][1]) * 0.9
            dx, dy = disp[k]
            d = math.hypot(dx, dy) or 0.01
            pos[k][0] += dx / d * min(d, t); pos[k][1] += dy / d * min(d, t)
        t = max(1.0, t * 0.992)
    # fit into the box with padding for labels
    padx, pady = 90, 46
    xs = [p[0] for p in pos.values()]; ys = [p[1] for p in pos.values()]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    for k in keys:
        pos[k][0] = padx + (pos[k][0] - minx) / ((maxx - minx) or 1) * (width - 2 * padx)
        pos[k][1] = pady + (pos[k][1] - miny) / ((maxy - miny) or 1) * (height - 2 * pady)
    return pos, count, works, edges


RING = ['elec_comm', 'elec_crime', 'elec_sys',
        'rights', 'adjud', 'sep', 'warrant', 'adm_inv',
        'case', 'comp',
        'delib', 'admin', 'civil', 'crim', 'security', 'space']
HUB = 'reform'


def radial(width, height, wide=True):
    """Hub in the middle, the other topics on a ring grouped by field."""
    count, works, edges = graph()
    cx, cy = width / 2, height / 2
    if wide:
        rx, ry = width * 0.33, height * 0.36
    else:
        rx = ry = min(width, height) * 0.36
    pos = {HUB: (cx, cy)}
    n = len(RING)
    start = -math.pi / 2 - math.pi / n * 3   # put the election cluster at the top left
    for i, k in enumerate(RING):
        a = start + 2 * math.pi * i / n
        pos[k] = (cx + rx * math.cos(a), cy + ry * math.sin(a))
    return pos, count, works, edges, (cx, cy)
