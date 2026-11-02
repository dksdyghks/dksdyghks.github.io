#!/usr/bin/env python3
"""Builds the profile page from the data below.

Outputs:
  /home/user/yohan-ahn/index.html          (claude.ai artifact version, no document skeleton)
  /home/user/dksdyghks.github.io/index.html (GitHub Pages version, full document)
"""
from html import escape as e
import re
import taegukgi
from urllib.parse import quote
from pathlib import Path

PHOTO_B64 = (Path(__file__).parent / 'photo.b64').read_text().strip()  # the profile photo (JPEG, base64), kept with the sources
EN_MONTH = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split()

def ko_ym(y, m, d=None): return f'{y}. {m}. {d}.' if d else f'{y}. {m}.'
def en_ym(y, m, d=None): return f'{EN_MONTH[m-1]} {d}, {y}' if d else f'{EN_MONTH[m-1]} {y}'

# ---------------------------------------------------------------- data
PERSON = {
    'ko': dict(name='안요환', role='공군사관학교 항공우주정책학과',
               fields=['입법정책', '정치관계법', '행정법', '헌법']),
    'en': dict(name='Yohan Ahn', role='Republic of Korea Air\u00a0Force\u00a0Academy',
               fields=['Election & Political Law', 'Legislative Policy', 'Public Law']),
}
EPIGRAPH = '“Drei berichtigende Worte des Gesetzgebers und ganze Bibliotheken werden zu Makulatur.”'
EPIGRAPH_CITE = {
    'ko': 'J. H. von Kirchmann, 「학문으로서 법학의 무가치성」(1847)',
    'en': 'J. H. von Kirchmann, <i>Die Wertlosigkeit der Jurisprudenz als Wissenschaft</i> (1847)',
}
STATEMENT = {
    'ko': ('율리우스 폰 키르히만은 입법권자가 세\u00a0마디만 고치면 법학서적은 \n모두 휴지조각이 된다며 법학의 학문적 가치를 비판하였다.',
           '그러나 법학이 학문으로서 가치가 있기에 ', '나의 연구는 입법권자로 하여금 문제의 세\u00a0마디를 바로잡도록 할 것이라\u00a0믿는다.'),
    'en': ('Julius von Kirchmann questioned the value of legal scholarship as a science: \n“three corrective words by the legislator \rturn whole legal libraries into waste paper.”',
           'Yet legal scholarship does have value as a science; therefore, ', 'I believe my research will lead the legislature to correct the three words in\u00a0question.'),
}
TEACHING = {
    'ko': ['법학개론', '융합캡스톤', '행정법', '항공우주법', '헌법과 민주시민'],
    'en': ['Introduction to Law', 'Capstone Design', 'Administrative Law', 'Aviation and Space Law', 'Constitutional Law'],
}
EDUCATION = {  # newest first: (school, department, degree)
    'ko': [('서강대학교', None, '법학박사'), ('서강대학교', None, '법학석사'),
           ('University of Queensland', None, '정치학석사'),
           ('연세대학교', None, '정치학사')],
    'en': [('Sogang University', None, 'Ph.D. in Law'), ('Sogang University', None, 'Master of Laws'),
           ('The University of Queensland', None, 'Master of International Relations'), ('Yonsei University', None, 'B.A. in Political Science')],
}
AFFILIATION = [  # (start, end or None while current, ko org, ko dept, en org, en dept)
    ((2023, 1), None, '공군사관학교', '항공우주정책학과', 'Republic of Korea Air Force Academy', 'Department of Aerospace Policy'),
    ((2021, 4), (2022, 7), '중앙선거관리위원회', '제도연구부', 'National Election Commission', 'Electoral Systems Research Division'),
    ((2020, 1), (2021, 2), '국회입법조사처', '기획법무담당관실', 'National Assembly Research Service', 'Planning and Legal Affairs Division'),
]
THESES = [  # newest first
    dict(date=(2026, 8), ko_kind='박사', en_kind='Ph.D.',
         ko='선거관리위원회의 독립성과 정치적 중립성에 관한 연구',
         en='The Independence and Political Neutrality of Korea’s National Election Commission',
         ko_note='박사학위논문, 서강대학교', en_note='Doctoral dissertation, Sogang University'),
    dict(date=(2022, 8), ko_kind='석사', en_kind='Master’s',
         ko='헌법상 영장주의와 선거관리위원회의 선거범죄 조사에 관한 연구',
         en='A Study on Warrant Requirement and Investigations Conducted by the National Election Commission',
         ko_note='석사학위논문, 서강대학교', en_note='Master’s thesis, Sogang University'),
]

# (date, ko title, ko subtitle, en title, ko journal, ko vol, en journal, en vol, pages, ko authors, en authors, ko fund, en fund)
LP = ('입법과 정책', 'Legislation and Policy Studies')
LJ = ('법조', 'Korean Lawyers Association Journal')
BJ = ('법제', 'Legislation')
MS = ('군사과학논집', 'Journal of Military Science Research')
SE = ('선거연구', 'The Study of Election')
CFE = ('자유기업원 연구비 지원', 'Funded by the Center for Free Enterprise')
PAPERS = [
    ((2021, 4, 30), '우리나라 중대재해처벌 관련 법제의 개선방안 연구:', '「중대재해처벌법」을 중심으로',
     'A Study on the Improvements of Korea’s Criminal Punishment Law for Severe Accidents',
     LP[0], '제13권 제1호', LP[1], 'Vol. 13, No. 1', '63-88', None, None, None),
    ((2021, 8, 31), '불법원인급여에 대한 반환 금지 규정의 개선방안 연구:', '대법원 1993. 12. 10. 선고 93다12947 판결을 기초로',
     'A Study on the Improvements of Korea’s Civil Act Article Regarding ‘Performance for Illegal Cause’',
     LP[0], '제13권 제2호', LP[1], 'Vol. 13, No. 2', '35-58', None, None, None),
    ((2022, 8, 31), '선거관리위원회 조사권에 관한 일고찰', None,
     'A Study on the Improvements of National Election Commission’s Investigative Powers',
     LP[0], '제14권 제2호', LP[1], 'Vol. 14, No. 2', '31-59', None, None, None),
    ((2022, 8, 31), '헌법상 영장주의에 관한 일고찰', '- 적용범위의 현실화를 위한 개헌안을 중심으로 -',
     'Constitutional Study Regarding the Scope of Korea’s Warrant Requirement for Administrative Institutions',
     '입법학연구', '제19집 제2호', 'Journal of Legislation Studies', 'Vol. 19, No. 2', '159-184', None, None, None),
    ((2023, 12, 31), '제5기 헌법재판소 결정에 대한 성향분석', '- 집회·결사의 자유를 중심으로 -',
     'Analysis on the Judicial Inclination of the Fifth Korean Constitutional Court Regarding Right to Freedom of Assembly and Association',
     MS[0], '제74집 통권', MS[1], 'Vol. 74', '107-124', None, None, None),
    ((2024, 3, 31), '부동산 담보신탁에서 완전한 소유권의 이전 필요성에 관한 검토', '- 대법원 2022. 5. 12. 선고 2017다278187 판결을 중심으로 -',
     'A Study Regarding the Necessity of Transferring Absolute Ownership in Collateral Trust',
     'Ewha Law Review', '제13권호', 'Ewha Law Review', 'Vol. 13', '71-88', None, None, None),
    ((2024, 4, 28), '군형법상 상관모욕죄의 입법적 및 해석적 오류', None,
     'Legislative and Interpretive Error in Korea’s Military Justice for Insult to Superior',
     LJ[0], '통권 제764호', LJ[1], 'No. 764', '122-147', None, None, None),
    ((2024, 12, 15), '선거 관련 법제에 관한 헌법학적 연구', '- 선거범죄로 인한 당선무효를 중심으로 -',
     'A Constitutional Study on Korea’s Election Law for Overturning of Election due to Election Crime',
     BJ[0], '통권 제707호', BJ[1], 'No. 707', '115-142', None, None, ('서강대학교 연구비 지원', 'Funded by Sogang University')),
    ((2024, 12, 28), '우리나라의 적극행정 법제에 관한 연구', '- 제도의 모호성과 모순성 및 무가치성 문제를 중심으로 -',
     'A Study on Korea’s Legislation for Active Administration',
     LJ[0], '통권 제768호', LJ[1], 'No. 768', '139-159', '이유진·안요환', 'Yu Jin Lee & Yohan Ahn', None),
    ((2025, 7, 31), '위헌법률심판에서 재판의 전제성과 예외로서 심판의 필요성', None,
     'Determining Prerequisite for Constitutional Adjudication',
     '명지법학', '제24권 제1호', 'Myongji Law Review', 'Vol. 24, No. 1', '19-37', None, None, CFE),
    ((2025, 9, 15), '선거범죄 조사 관련 우리나라 헌법재판소의 해석과 일본 사례', None,
     'Constitutional Court of Korea’s Interpretation on Election Crime Investigation in Comparative Perspective with Japan',
     BJ[0], '통권 제710호', BJ[1], 'No. 710', '259-280', None, None, None),
    ((2025, 10, 28), '민간투자법의 입법론적 개선 필요성에 관한 연구', None,
     'Supreme Court of Korea’s Interpretation on ‘Supervision and Order’ for Public-Private Partnership Project Matters',
     LJ[0], '통권 제773호', LJ[1], 'No. 773', '272-293', '안요환·정도준', 'Yohan Ahn & Do-june Jeong', CFE),
    ((2025, 11, 30), '우리 헌법상 선거제도와 선거관리 일반론', None,
     'Constitutional Framework of the Electoral System and Election Management in Korea',
     SE[0], '제23호', SE[1], 'No. 23', '61-88', None, None, None),
    ((2025, 12, 30), '사이버안보 업무에 관한 헌법학적 연구', '- 국가정보기관 직무로서의 문제를 중심으로 -',
     'A Constitutional Study on Cybersecurity Services: Issues Regarding the Duties of Korea’s National Intelligence Service',
     '법과정책', '제31집 제3호', 'Law & Policy Review', 'Vol. 31, No. 3', '181-208', '안요환·최은석', 'Yohan Ahn & Eun-Suk Choi',
     ('국고 연구비 지원', 'Government-funded')),
    ((2025, 12, 31), '공범과 신분에 관한 규정의 개선방안 연구', None,
     'A Study on the Improvements of Korea’s Criminal Act Article Regarding ‘Complicity and Status’',
     MS[0], '제76집 통권', MS[1], 'Vol. 76', '37-54', None, None, None),
    ((2025, 12, 31), '헌법적 관점에서 본 우주법상 전유화 금지 원칙과 우주사고 책임', None,
     'Issues on Outer Space Treaty’s Non-Appropriation Principle and Liability Regimes in Korea for Damage Caused by Space Objects: A Constitutional Perspective',
     '법과정책연구', '제25집 제4호', 'Journal of Law and Politics Research', 'Vol. 25, No. 4', '39-65', '안요환·조원용', 'Yohan Ahn & WonYong Cho', None),
    ((2026, 4, 30), '근우주 영역의 규범적 공백에 관한 일고찰', '- 근우주식별구역의 제언 -',
     'A Study on the Normative Gap in Near Space: Proposal for a ‘Near Space Identification Zone’',
     '항공우주정책·법학회지', '제41권 제1호', 'The Korean Journal of Air & Space Law and Policy', 'Vol. 41, No. 1', '129-149',
     '조정흠·이의섭·박세혁·최지웅·안요환', 'JeongHeum Jo, EuiSub Lee, SeHyeok Park, JiUng Choi & Yohan Ahn', None),
    ((2026, 5, 31), '선거관리 주체의 독립성과 권한 통제에 관한 비교연구:', '미국 및 캐나다 법제 사례를 중심으로',
     'Comparative Study on Independence and Authority Control of Election Management Bodies',
     SE[0], '통권 제24호', SE[1], 'No. 24', '65-85', None, None, None),
]
PROJECTS = [  # newest first: (period, ko title, ko sponsor, en title, en sponsor); period = ((y,m),(y,m)) or year
    (((2026, 3), (2026, 11)), '북한 공무원·행정관료제도에 관한 법적 연구', '공군사관학교', 'A Legal Study on North Korea’s Civil Service and Administrative Bureaucracy', 'Republic of Korea Air Force Academy'),
    (((2025, 3), (2025, 11)), '사이버안보 업무에 관한 헌법학적 연구', '공군사관학교', 'A Constitutional Study on Cybersecurity Services', 'Republic of Korea Air Force Academy'),
    (((2024, 3), (2025, 2)), '우리나라 공직선거법의 개선방안에 관한 헌법학적 연구', '서강대학교', 'A Constitutional Study on Improving Korea’s Public Official Election Act', 'Sogang University'),
    ((2021, 8), '외국의 재선거와 보궐선거', '중앙선거관리위원회', 'Re-elections and By-elections in Foreign Countries', 'National Election Commission'),
]
TALKS = [  # newest first: (y,m,d, ko role, en role, ko title, ko venue, en title, en venue)
    (2025, 8, 28, '발표', 'Presenter', '우주법제의 헌법적 쟁점',
     '제7회 한국헌법학자대회(한국헌법학회 et al.)',
     'The Constitution in Outer Space: Issues in Space Legislation',
     '7th Conference of Korean Constitutional Scholars (Korean Constitutional Law Association et al.)'),
    (2025, 4, 19, '발표', 'Presenter', '위헌법률심판의 적법요건 판단에 관한 일고찰', '한국헌법판례연구학회 제149회 월례발표회',
     'Gatekeeping Constitutional Review: Admissibility in the Review of Statutes', '149th Monthly Meeting, Korean Society of Constitutional Case Law'),
    (2024, 8, 30, '발표', 'Presenter', '선거범죄로 인한 당선무효의 존립방안', '제6회 한국헌법학자대회(한국헌법학회 et al.)',
     'Forfeiting the Seat: The Future of Election Invalidation for Electoral Crimes',
     '6th Conference of Korean Constitutional Scholars (Korean Constitutional Law Association et al.)'),
    (2023, 6, 16, '토론', 'Discussant', '중대재해처벌법의 적용에서 항공분야의 특수성과 관련 법적 쟁점', '한국항공우주정책·법학회 제70회 학술대회',
     'Aviation Under the Serious Accidents Punishment Act: Distinctive Features and Legal Issues',
     '70th Conference, Korean Society of Air & Space Law and Policy'),
]
AWARDS = [((2024, 5, 16), '최우수 논문상', '이화여자대학교 법학전문대학원',
           'Best Paper Award', 'Ewha Womans University School of Law')]

# key provisions examined in the research: (group ko, group en, [(law ko, law en, article ko, article en, topic ko, topic en, [work keys])])
PROVISIONS = [
    ('헌법', 'Constitution', [
        ('대한민국헌법', 'Constitution of the Republic of Korea', '제12조 제3항 · 제16조', 'Art. 12(3) · Art. 16', '영장주의', 'Warrant requirement',
         ['헌법상 영장주의에 관한 일고찰', '선거관리위원회 조사권에 관한 일고찰', '선거범죄 조사 관련 우리나라 헌법재판소의 해석과 일본 사례', '헌법상 영장주의와 선거관리위원회의 선거범죄 조사에 관한 연구']),
        ('대한민국헌법', 'Constitution of the Republic of Korea', '제114조', 'Art. 114', '선거관리위원회', 'Election commissions',
         ['선거관리위원회의 독립성과 정치적 중립성에 관한 연구', '선거관리 주체의 독립성과 권한 통제에 관한 비교연구:', '우리 헌법상 선거제도와 선거관리 일반론']),
        ('대한민국헌법', 'Constitution of the Republic of Korea', '제107조 제1항', 'Art. 107(1)', '재판의 전제성', 'Relevance to the trial',
         ['위헌법률심판에서 재판의 전제성과 예외로서 심판의 필요성']),
        ('대한민국헌법', 'Constitution of the Republic of Korea', '제21조', 'Art. 21', '집회·결사의 자유', 'Freedom of assembly and association',
         ['제5기 헌법재판소 결정에 대한 성향분석']),
        ('대한민국헌법', 'Constitution of the Republic of Korea', '제23조', 'Art. 23', '재산권', 'Property rights',
         ['헌법적 관점에서 본 우주법상 전유화 금지 원칙과 우주사고 책임']),
    ]),
    ('선거법', 'Election law', [
        ('공직선거법', 'Public Official Election Act', '제264조 · 제265조', 'Arts. 264–265', '선거범죄로 인한 당선무효', 'Election annulled for election crimes',
         ['선거 관련 법제에 관한 헌법학적 연구']),
        ('공직선거법', 'Public Official Election Act', '제272조의2', 'Art. 272-2', '선거범죄의 조사', 'Investigation of election crimes',
         ['선거관리위원회 조사권에 관한 일고찰', '선거범죄 조사 관련 우리나라 헌법재판소의 해석과 일본 사례']),
    ]),
    ('형사법', 'Criminal law', [
        ('형법', 'Criminal Act', '제33조', 'Art. 33', '공범과 신분', 'Complicity and status', ['공범과 신분에 관한 규정의 개선방안 연구']),
        ('군형법', 'Military Criminal Act', '제64조', 'Art. 64', '상관모욕', 'Insulting a superior', ['군형법상 상관모욕죄의 입법적 및 해석적 오류']),
        ('중대재해처벌법', 'Serious Accidents Punishment Act', '법률 전반', 'Act as a whole', '중대재해 처벌', 'Punishment for serious accidents',
         ['우리나라 중대재해처벌 관련 법제의 개선방안 연구:']),
    ]),
    ('민사법', 'Civil law', [
        ('민법', 'Civil Act', '제746조', 'Art. 746', '불법원인급여', 'Performance for an illegal cause', ['불법원인급여에 대한 반환 금지 규정의 개선방안 연구:']),
    ]),
    ('행정·안보법', 'Administrative and security law', [
        ('행정기본법', 'General Act on Public Administration', '제4조', 'Art. 4', '적극행정', 'Proactive administration', ['우리나라의 적극행정 법제에 관한 연구']),
        ('민간투자법', 'Act on Public-Private Partnerships in Infrastructure', '제45조 제1항', 'Art. 45(1)', '감독명령', 'Supervisory orders', ['민간투자법의 입법론적 개선 필요성에 관한 연구']),
        ('국가정보원법', 'National Intelligence Service Act', '제4조', 'Art. 4', '국가정보원의 직무', 'Duties of the NIS', ['사이버안보 업무에 관한 헌법학적 연구']),
        ('군용기운용법', 'Military Aircraft Operation Act', '제2조', 'Art. 2', '근우주 영역', 'Near space', ['근우주 영역의 규범적 공백에 관한 일고찰']),
    ]),
]

TEACH_EN = {0}  # course indexes also taught in English (법학개론)

AUTHOR_ROLE = {'sole': ('단독', 'Sole author'), 'first': ('주저자', 'First author'), 'corr': ('교신저자', 'Corresponding author')}

LABELS = {
    'ko': dict(intro='소개', teaching='강의과목', education='학력', affiliation='소속', theses='학위논문',
               papers='연구논문', projects='연구과제/보고서', talks='학술대회 발표/토론', awards='수상',
               nav_talks='학술대회', nav_projects='연구과제', lang='언어', contents='목차', fields='연구분야'),
    'en': dict(intro='Introduction', teaching='Teaching', education='Education', affiliation='Appointments', theses='Theses',
               papers='Journal Articles', projects='Research Projects & Reports', talks='Conference Presentations', awards='Awards',
               nav_talks='Conferences', nav_projects='Projects', lang='Language', contents='Contents', fields='Research Fields'),
}

# ---------------------------------------------------------------- render
DOI = {
    '우리나라 중대재해처벌 관련 법제의 개선방안 연구:': '10.22809/nars.2021.13.1.003',
    '불법원인급여에 대한 반환 금지 규정의 개선방안 연구:': '10.22809/nars.2021.13.2.002',
    '선거관리위원회 조사권에 관한 일고찰': '10.22809/nars.2022.14.2.002',
    '헌법상 영장주의에 관한 일고찰': '10.31536/jols.2022.19.2.007',
    '군형법상 상관모욕죄의 입법적 및 해석적 오류': '10.17007/klaj.2024.73.2.004',
    '우리나라의 적극행정 법제에 관한 연구': '10.17007/klaj.2024.73.6.005',
    '위헌법률심판에서 재판의 전제성과 예외로서 심판의 필요성': '10.53066/mlr.2025.24.1.19',
    '민간투자법의 입법론적 개선 필요성에 관한 연구': '10.17007/klaj.2025.74.5.009',
    '우리 헌법상 선거제도와 선거관리 일반론': '10.23018/nec.2025.1.23.003',
    '사이버안보 업무에 관한 헌법학적 연구': '10.36727/jjlpr.31.3.202512.007',
    '헌법적 관점에서 본 우주법상 전유화 금지 원칙과 우주사고 책임': '10.17926/kaolp.2025.25.4.39',
    '근우주 영역의 규범적 공백에 관한 일고찰': '10.31691/KASL41.1.4.',
    '선거관리 주체의 독립성과 권한 통제에 관한 비교연구:': '10.23018/nec.2026.1.24.003',
}
# direct article pages for papers without a DOI (fill in RISS/KCI detail URLs as they are found)
DIRECT = {
    '선거 관련 법제에 관한 헌법학적 연구': ('KCI', 'https://www.kci.go.kr/kciportal/landing/article.kci?arti_id=ART003148455'),
    '선거범죄 조사 관련 우리나라 헌법재판소의 해석과 일본 사례': ('KCI', 'https://www.kci.go.kr/kciportal/landing/article.kci?arti_id=ART003243892'),
    '제5기 헌법재판소 결정에 대한 성향분석': ('RISS', 'https://www.riss.kr/search/detail/DetailView.do?p_mat_type=1a0202e37d52c72d&control_no=45a7ec7c82856b0bc85d2949c297615a'),
    '공범과 신분에 관한 규정의 개선방안 연구': ('RISS', 'https://www.riss.kr/search/detail/DetailView.do?p_mat_type=1a0202e37d52c72d&control_no=a4dc7e3c0e39ae3ad18150b21a227875'),
    '부동산 담보신탁에서 완전한 소유권의 이전 필요성에 관한 검토': ('RISS', 'https://www.riss.kr/search/detail/DetailView.do?p_mat_type=1a0202e37d52c72d&control_no=00f74ab16c5965fac85d2949c297615a'),
}
THESIS_URL = {
    '헌법상 영장주의와 선거관리위원회의 선거범죄 조사에 관한 연구': 'https://www.riss.kr/search/detail/DetailView.do?p_mat_type=be54d9b8bc7cdb09&control_no=e502ac393cc5d3a1ffe0bdc3ef48d419',
    '선거관리위원회의 독립성과 정치적 중립성에 관한 연구': 'https://www.riss.kr/search/detail/DetailView.do?p_mat_type=be54d9b8bc7cdb09&control_no=2496df649a4b4eccffe0bdc3ef48d419',
}

KCI = {'법조': 'excellent', '군사과학논집': 'other', 'Ewha Law Review': 'other'}
KCI_TXT = {'excellent': ('KCI 우수등재', 'KCI Excellent Accredited'), 'listed': ('KCI 등재', 'KCI Accredited'), 'other': ('기타', 'Non-KCI')}

LINK_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'

MAIL = 'yhahn0128@sogang.ac.kr'
MAIL_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/></svg>'
GLOBE = '<svg class="globe" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/></svg>'

ROLE_TXT = {'sole': ('단독', 'Sole author'), 'first': ('주저자', 'First author'), 'corr': ('교신저자', 'Corresponding author')}

SITE = 'https://0128.kr/'
HANGUL = re.compile(r'[가-힣]')
CASE_NO = re.compile(r'\d{2,4}[가-힣]{1,3}\d{3,}')  # Korean court case numbers such as 93다12947, 2017다278187
DOC_TITLE = {'ko': '0128', 'en': '0128'}  # the page is named after its address (0128.kr); who and what are in the description
DOC_DESC = {'ko': '안요환 — 공군사관학교 항공우주정책학과. 연구분야: 입법정책, 정치관계법, 행정법, 헌법. 학력, 소속, 강의, 연구논문, 연구과제, 학술대회 발표.',
            'en': 'Yohan Ahn — Republic of Korea Air Force Academy, Department of Aerospace Policy. Research fields: election & political law, legislative policy, public law.'}


def view(lang):
    L, P = LABELS[lang], PERSON[lang]
    ko = lang == 'ko'
    pre = '' if ko else 'en-'
    sid = lambda k: f'{pre}{k}'
    ym = ko_ym if ko else en_ym
    out = []
    w = out.append
    nav = [('intro', L['intro']), ('education', L['education']), ('affiliation', L['affiliation']),
           ('papers', L['papers']), ('projects', L['nav_projects']), ('talks', L['nav_talks']), ('awards', L['awards'])]
    open_lbl = '논문 페이지 열기' if ko else 'Open article page'
    DOT = '<span class="dot" aria-hidden="true">·</span>'  # rides at the end of the item before it, so no line starts with it
    def glue(text, badge, after=''):
        """The badge stays with the last word; a closing parenthetical such as (한국헌법학회 et al.) moves as one piece."""
        text = text.rstrip().replace(' et al.', '\u00a0et\u00a0al.').replace(' 등)', '\u00a0등)').replace(' 외)', '\u00a0외)')
        text = re.sub(r'\b(Vol\.|No\.|통권) ', '\\1\u00a0', text)  # "No. 1", "통권 제24호" never split
        if text.endswith(')') and '(' in text:
            k = text.rfind('(')
            paren = text[k:]
            if ' ' in paren:  # "(Korean Constitutional Law Association et al.)"
                i = paren.rfind(' ')
                return (f'{e(text[:k])}<wbr><span class="nwd">{e(paren[:i + 1])}<span class="nw">{e(paren[i + 1:])}'
                        f'<span class="badge">{e(badge)}</span>{after}</span></span>')
        sep = ' ' if ' ' in text else '·'  # author lists like 조정흠·이의섭·안요환 break after a middle dot
        i = text.rfind(sep)
        head, tail = (text[:i + 1], text[i + 1:]) if i >= 0 else ('', text)
        j, brk = tail.find('('), ''
        if j > 0:
            head, tail, brk = head + tail[:j], tail[j:], '<wbr>'
        head_html = e(head) if sep == ' ' else e(head).replace('·', '·<wbr>')
        return f'{head_html}{brk}<span class="nw">{e(tail)}<span class="badge">{e(badge)}</span>{after}</span>'

    def nowidow(t):
        """Keep the last two words together (typographic widow control) when they are short."""
        parts = t.rsplit(' ', 2)
        if len(parts) == 3 and len(parts[1]) + len(parts[2]) <= 16:
            return f'{parts[0]} {parts[1]}\u00a0{parts[2]}'
        return t

    def linked(main, sub=None, href=None):
        """Title (and subtitle) as one link. Line-break care:
        - the link icon is glued to the last word, so it never wraps alone;
        - a Korean subtitle's opening "-" stays with the word after it, its closing "-" with the word before it;
        - a short last word (연구, 오류, 검토 …) is kept with the word before it, so it never sits alone on a line;
        - the gap before a subtitle is an ordinary space, so a subtitle that starts a new line is not indented."""
        def split_last(t, short_widow=False):
            t = t.rstrip()
            i = t.rfind(' ')
            if i > 0 and t[i + 1:] in ('-', '–', '—'):  # closing dash of "- 부제 -" travels with its last word
                i = t.rfind(' ', 0, i)
            return (t[:i + 1], t[i + 1:]) if i >= 0 else ('', t)

        def widow_pair(h):
            """Split off the word before the last one, if the last line on a phone would otherwise hold one short word."""
            j = h.rstrip().rfind(' ')
            prev = h.rstrip()[j + 1:]
            return (h[:j + 1], prev + ' ') if j >= 0 else ('', h)

        def sub_html(sub, tail_extra=''):
            h, l = split_last(sub)
            lead = ''
            if h.startswith('- '):
                rest = h[2:]
                j = rest.find(' ')
                if j < 0:  # "- X -": the whole subtitle is one unit
                    h, l = '', h + l
                else:
                    lead, h = f'<span class="nw">-\u00a0{e(rest[:j])}</span>', rest[j:]
            return f'<span class="sub">{lead}{e(h)}<span class="nw">{e(l)}{tail_extra}</span></span>'

        sp = '<span class="sp"> </span>'
        if not href:
            return e(main) + (sp + sub_html(sub) if sub else '')
        icon = f'<span class="ext" aria-hidden="true">{LINK_ICON}</span>'
        if sub:
            inner = e(main) + sp + sub_html(sub, icon)
        else:
            h, l = split_last(main)
            short = (len(l) <= 3) if HANGUL.search(l) else (len(l) <= 12)
            h2, prev = widow_pair(h) if (short and h.strip()) else (h, '')
            if prev and len(prev.strip()) + len(l) <= (10 if HANGUL.search(l) else 24):
                inner = e(h2) + f'<span class="nwm">{e(prev)}<span class="nw">{e(l)}{icon}</span></span>'
            else:
                inner = e(h) + f'<span class="nw">{e(l)}{icon}</span>'
        return f'<a class="ttl-link" href="{e(href)}" target="_blank" rel="noopener" title="{open_lbl}">{inner}</a>'

    def ext(href):
        return f'<a class="ext" href="{e(href)}" target="_blank" rel="noopener" aria-label="{open_lbl}" title="{open_lbl}">{LINK_ICON}</a>'

    w(f'<div class="view" id="view-{lang}" lang="{lang}" data-title="{e(DOC_TITLE[lang])}"{"" if ko else " hidden"}>')
    w(f'<a class="skip" href="#{sid("main")}">{"본문 바로가기" if ko else "Skip to content"}</a>')
    target, tlabel, taria = ('en', 'English', 'View this page in English') if ko else ('ko', '한국어', '한국어로 보기')
    switch = lambda cls: (f'<button type="button" class="lang-btn {cls}" data-lang="{target}" lang="{target}" aria-label="{taria}">'
                          f'{GLOBE}<span>{tlabel}</span></button>')

    # hero
    s1, s2a, s2b = STATEMENT[lang]
    br = lambda t: e(t).replace('\n', '<br class="br-d">').replace('\r', '<br class="br-w">')
    w(f'<header class="hero" id="{sid("intro")}"><div class="hero-in">')
    mail_lbl = ('이메일 보내기: ' if ko else 'Send an email: ') + MAIL
    w(f'<div class="hero-top"><a class="mail" href="mailto:{MAIL}" aria-label="{mail_lbl}" title="{mail_lbl}">{MAIL_ICON}<span>{MAIL}</span></a>'
      + switch('on-dark') + '</div>')
    flag = taegukgi.svg(30, '태극기' if ko else 'Flag of the Republic of Korea')  # a small emblem above the name
    w('<div class="hero-grid"><div class="id">')
    w(f'<img class="photo" src="data:image/jpeg;base64,{PHOTO_B64}" alt="{e(P["name"])}" width="128" height="171" draggable="false">')
    w(f'<div class="id-text">{flag}<h1 class="name">{e(P["name"])}</h1></div>'
      f'<div class="fields-block"><span class="fields-label" id="{sid("fields")}">{e(L["fields"])}</span>'
      f'<ul class="fields" aria-labelledby="{sid("fields")}">' + ''.join(f'<li>{e(f)}</li>' for f in P['fields']) + '</ul></div>')
    w('</div>')
    w(f'<div class="stmt"><p class="s1">{br(s1)}</p><p class="s2">{e(s2a)}<br class="br-t"><strong>{e(s2b)}</strong></p></div>')
    w('</div></div></header>')

    # pill bar (tablet and phone)
    w(f'<nav class="nav" aria-label="{L["contents"]}"><div class="nav-in"><div class="nav-links">' +
      ''.join(f'<a href="#{sid(k)}">{e(t)}</a>' for k, t in nav) + '</div></div></nav>')

    w(f'<main class="main" id="{sid("main")}"><div class="layout">')
    w(f'<aside class="toc-col"><nav class="toc" aria-label="{L["contents"]}"><span class="toc-mark" aria-hidden="true"></span>' +
      ''.join(f'<a href="#{sid(k)}">{e(t)}</a>' for k, t in nav) + '</nav></aside>')
    w('<div class="stack">')

    def card(key, body):
        w(f'<section class="card" id="{sid(key)}" aria-labelledby="{sid(key)}-h"><h2 class="h" id="{sid(key)}-h">{e(L[key])}</h2>{body}</section>')

    # education, with each Sogang dissertation beside its degree
    thesis_for = {0: THESES[0], 1: THESES[1]}
    items = []
    for i, (school, dept, deg) in enumerate(EDUCATION[lang]):
        t = thesis_for.get(i)
        th = ''
        if t:
            label = '학위논문' if ko else ('Dissertation' if i == 0 else 'Thesis')
            when = f' · {ym(*t["date"])}' if t['date'] else ''
            ttl = linked(t['ko'] if ko else t['en'], None, THESIS_URL.get(t['ko']))
            th = f'<div class="edu-thesis"><span class="edu-label">{label}{when}</span><span class="edu-ttl">{ttl}</span></div>'
        dep = f' <span class="edu-dept">{e(dept)}</span>' if dept else ''  # Korean page only
        items.append(f'<li{"" if th else " class=\"solo\""}><div class="edu-main"><span class="edu-school">{e(school)}{dep}</span>'
                     f'<span class="sub-line">{e(deg)}</span></div>{th}</li>')
    card('education', f'<ul class="edu">{"".join(items)}</ul>')

    # appointments, with the courses taught at the current post
    items = []
    for i, ((sy, sm), end, kor, kdep, eor, edep) in enumerate(AFFILIATION):
        org, dep = (kor, kdep) if ko else (eor, edep)
        courses = ''
        if i == 0:
            note = '개설 강좌별 3시간 / 3학점' if ko else '3 hours / 3 credits per course'
            courses = (f'<div class="courses"><p class="courses-head"><span class="courses-label">{e(L["teaching"])}</span>'
                       f'<span class="courses-note">{note}</span></p><ul class="course-list">' +
                       ''.join('<li>' + (f'<span>{e(t)}</span><span class="badge">영어강의</span>' if (ko and j in TEACH_EN) else e(t)) + '</li>'
                               for j, t in enumerate(TEACHING[lang])) + '</ul></div>')
        until = ym(*end) if end else ('현재' if ko else 'Present')
        items.append(f'<li><span class="when">{ym(sy, sm)} – {until}</span>'
                     f'<div><p class="ttl sm">{e(org)}</p><p class="sub-line">{e(dep)}</p>{courses}</div></li>')
    card('affiliation', f'<ol class="rows">{"".join(items)}</ol>')

    # journal articles, newest first
    items = []
    for (date, kt, ks, et, kj, kv, ej, ev, pages, ka, ea, fund) in reversed(PAPERS):
        doi = DOI.get(kt)
        href = f'https://doi.org/{doi}' if doi else DIRECT.get(kt, (None, None))[1]
        if ko:
            shown = None if (ks and CASE_NO.search(ks)) else ks  # e.g. "대법원 … 93다12947 판결을 기초로" is omitted
            title = linked(kt.rstrip(': ') if (ks and not shown) else kt, shown, href)
        else:
            title = linked(et, None, href)
        j, v = (kj, kv) if ko else (ej, ev)
        pg = pages if ko else 'pp. ' + pages.replace('-', '–')
        role = 'sole' if not ka else ('corr' if ka.endswith('안요환') else 'first')
        authors = (ka if ko else ea) if ka else P['name']
        if not ko:  # keep each person's name on one line
            authors = ''.join(p if re.fullmatch(r',\s*', p) else ' &\u00a0' if re.fullmatch(r'\s*&\s*', p)
                              else p.replace(' ', '\u00a0') for p in re.split(r'(,\s*|\s*&\s*)', authors))
        kci = KCI_TXT[KCI.get(kj, 'listed')][0 if ko else 1]
        fund_txt = (fund[0] if ko else fund[1]) if fund else None
        meta = [f'<span class="jr">{e(j)}</span> {glue(v, kci, DOT)}',
                f'<span class="nw">{e(pg)}{DOT if fund_txt else ""}</span>']
        if fund_txt:
            meta.append(e(fund_txt))
        items.append(f'<li class="pub"><span class="when">{ym(*date)}</span><div>'
                     f'<h3 class="ttl">{title}</h3>'
                     f'<p class="by">{glue(authors, ROLE_TXT[role][0 if ko else 1])}</p>'
                     '<p class="meta">' + ''.join(f'<span>{m}</span>' for m in meta) + '</p>'
                     '</div></li>')
    card('papers', f'<ol class="rows pubs">{"".join(items)}</ol>')

    period = lambda v: str(v) if isinstance(v, int) else (ym(*v) if isinstance(v[0], int) else f'{ym(*v[0])} – {ym(*v[1])}')
    kind = lambda ks: (('보고서', 'Report') if ks == '중앙선거관리위원회' else ('연구과제', 'Research project'))[0 if ko else 1]
    items = ''.join(f'<li><span class="when">{period(y)}</span><div><p class="ttl sm">{e(nowidow(kt if ko else et))}</p>'
                    f'<p class="sub-line">{glue(ks if ko else es, kind(ks))}</p></div></li>'
                    for y, kt, ks, et, es in PROJECTS)
    card('projects', f'<ol class="rows">{items}</ol>')

    items = []
    for y, m, d, kr, er, kt, kv, et, ev in TALKS:
        items.append(f'<li><span class="when">{ym(y, m, d)}</span><div><p class="ttl sm">{e(nowidow(kt if ko else et))}</p>'
                     f'<p class="sub-line">{glue(kv if ko else ev, kr if ko else er)}</p></div></li>')
    card('talks', f'<ol class="rows">{"".join(items)}</ol>')

    items = ''.join(f'<li><span class="when">{ym(*y) if isinstance(y, tuple) else y}</span><div><p class="ttl sm">{e(nowidow(kt if ko else et))}</p>'
                    f'<p class="sub-line">{e(ks if ko else es)}</p></div></li>' for y, kt, ks, et, es in AWARDS)
    card('awards', f'<ol class="rows">{items}</ol>')

    w('</div></div></main>')
    w(switch('lang-fab'))
    w(f'<footer class="foot"><div class="foot-in"><p class="foot-row">© 2026 {e(P["name"])}</p></div></footer>')
    w('</div>')
    return '\n'.join(out)


CSS = Path('/home/user/yohan-ahn/style.css').read_text() + '\n' + Path('/home/user/yohan-ahn/doors.css').read_text()
JS = Path('/home/user/yohan-ahn/script.js').read_text() + '\n' + Path('/home/user/yohan-ahn/doors.js').read_text()
PRECONNECT = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
              '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n')
FONT_SIG = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kaushan+Script&family=Nanum+Brush+Script&text=%EC%95%88%EC%9A%94%ED%99%98Yohan%20Ahn&display=block">\n'
FONT_SERIF = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">\n'
# Pretendard is served from this site (fonts/pretendard, SIL OFL), so no third-party CDN can hold up the first paint
FONT_PRETENDARD = '<link rel="stylesheet" href="/fonts/pretendard/pretendardvariable-dynamic-subset.css">\n'
FONT_FALLBACK = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap">\n'
BODY = view('ko') + '\n' + view('en') + f'\n<script>\n{JS}</script>\n'

import json as _json
LD = {
    '@context': 'https://schema.org', '@type': 'Person',
    'name': '안요환', 'alternateName': 'Yohan Ahn', 'url': SITE, 'email': 'mailto:' + MAIL, 'image': SITE + 'og-image.png',
    'affiliation': {'@type': 'CollegeOrUniversity', 'name': 'Republic of Korea Air Force Academy', 'alternateName': '공군사관학교',
                    'department': {'@type': 'Organization', 'name': 'Department of Aerospace Policy', 'alternateName': '항공우주정책학과'}},
    'alumniOf': [{'@type': 'CollegeOrUniversity', 'name': n} for n in ('Sogang University', 'The University of Queensland', 'Yonsei University')],
    'knowsAbout': ['입법정책', '정치관계법', '행정법', '헌법', 'Legislative Policy', 'Election and Political Law', 'Public Law'],
}
def icon_url(name):
    """The icon's address with a short hash of its bytes, so a browser that cached an older icon picks up a new one at once."""
    import hashlib
    f = Path('/home/user/dksdyghks.github.io') / name
    return f'{name}?v={hashlib.sha256(f.read_bytes()).hexdigest()[:8]}' if f.exists() else name


HEAD_META = (
    f'<title>{DOC_TITLE["ko"]}</title>\n'
    f'<meta name="description" content="{e(DOC_DESC["ko"])}">\n'
    '<meta name="author" content="안요환 (Yohan Ahn)">\n'
    '<meta name="theme-color" content="#0A1426">\n'
    '<meta name="color-scheme" content="light dark">\n'
    '<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">\n'
    f'<link rel="canonical" href="{SITE}">\n'
    f'<link rel="alternate" hreflang="ko" href="{SITE}?lang=ko">\n'
    f'<link rel="alternate" hreflang="en" href="{SITE}?lang=en">\n'
    f'<link rel="alternate" hreflang="x-default" href="{SITE}">\n'
    f'<link rel="icon" type="image/png" sizes="32x32" href="{icon_url("favicon-32.png")}">\n'
    f'<link rel="icon" type="image/png" sizes="16x16" href="{icon_url("favicon-16.png")}">\n'
    f'<link rel="icon" type="image/png" sizes="192x192" href="{icon_url("icon-192.png")}">\n'
    f'<link rel="apple-touch-icon" sizes="180x180" href="{icon_url("apple-touch-icon.png")}">\n'
    '<meta property="og:type" content="profile">\n'
    f'<meta property="og:url" content="{SITE}">\n'
    '<meta property="og:site_name" content="안요환 Yohan Ahn">\n'
    f'<meta property="og:title" content="{e(DOC_TITLE["ko"])}">\n'
    f'<meta property="og:description" content="{e(DOC_DESC["ko"])}">\n'
    f'<meta property="og:image" content="{SITE}og-image.png">\n'
    '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
    '<meta property="og:image:alt" content="안요환 (Yohan Ahn) — 입법정책 · 정치관계법 · 행정법 · 헌법">\n'
    '<meta property="og:locale" content="ko_KR">\n<meta property="og:locale:alternate" content="en_US">\n'
    '<meta property="profile:first_name" content="요환">\n<meta property="profile:last_name" content="안">\n'
    '<meta name="twitter:card" content="summary_large_image">\n'
    f'<meta name="twitter:title" content="{e(DOC_TITLE["ko"])}">\n'
    f'<meta name="twitter:description" content="{e(DOC_DESC["ko"])}">\n'
    f'<meta name="twitter:image" content="{SITE}og-image.png">\n'
    f'<script type="application/ld+json">{_json.dumps(LD, ensure_ascii=False)}</script>\n'
)

artifact = (f'<title>{DOC_TITLE["ko"]}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'
            + PRECONNECT + FONT_FALLBACK + FONT_SIG + FONT_SERIF + f'<style>\n{CSS}</style>\n' + BODY)
Path('/home/user/yohan-ahn/index.html').write_text(artifact)

try:  # the display faces, cut to the letters this page sets in them and served from this site (no third-party request)
    import home_fonts
    HOME_FONT_CSS, HOME_PRELOAD = home_fonts.build(BODY)
    HEAD_FONTS = FONT_PRETENDARD + HOME_PRELOAD
except ImportError as err:
    print('WARNING: homepage fonts not cut (pip install fonttools brotli); falling back to Google Fonts:', err)
    HOME_FONT_CSS, HEAD_FONTS = '', PRECONNECT + FONT_PRETENDARD + FONT_SIG + FONT_SERIF
page = ('<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + HEAD_META + HEAD_FONTS +
        f'<style>\n{HOME_FONT_CSS}{CSS}\nbody {{ margin: 0; }}\n[hidden] {{ display: none !important; }}\n</style>\n</head>\n<body>\n' + BODY + '</body>\n</html>\n')
Path('/home/user/dksdyghks.github.io/index.html').write_text(page)

# a mistyped or outdated address gets the site's own page (GitHub Pages serves 404.html with status 404)
NOT_FOUND = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>페이지를 찾을 수 없습니다 | 안요환</title>
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<link rel="icon" type="image/png" sizes="32x32" href="/{icon_url('favicon-32.png')}">
<link rel="icon" type="image/png" sizes="16x16" href="/{icon_url('favicon-16.png')}">
<link rel="apple-touch-icon" sizes="180x180" href="/{icon_url('apple-touch-icon.png')}">
<link rel="stylesheet" href="/fonts/pretendard/pretendardvariable-dynamic-subset.css">
<style>
  :root {{ --bg: #F4F2EE; --card: #FFFFFF; --ink: #141C29; --muted: #586374; --rule: #E5E1D8; --btn: #0A1426; --on-btn: #F7F9FC; }}
  @media (prefers-color-scheme: dark) {{ :root {{ --bg: #080B11; --card: #0F1520; --ink: #EEF2F7; --muted: #9AA6B6; --rule: #1E2633; --btn: #F2D7A6; --on-btn: #0A1426; }} }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; background: var(--bg); color: var(--ink);
         font-family: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; }}
  main {{ width: 100%; max-width: 420px; text-align: center; background: var(--card); border: 1px solid var(--rule); border-radius: 20px; padding: 36px 24px 30px; }}
  img {{ width: 88px; height: 88px; border-radius: 22px; }}
  h1 {{ margin: 18px 0 6px; font-size: 1.25rem; letter-spacing: -0.02em; }}
  p {{ margin: 0; color: var(--muted); line-height: 1.6; }}
  .en {{ margin-top: 2px; font-size: .875rem; }}
  a {{ display: inline-block; margin-top: 22px; padding: 11px 20px; border-radius: 999px; background: var(--btn); color: var(--on-btn); font-weight: 600; text-decoration: none; }}
  a:focus-visible {{ outline: 2px solid var(--ink); outline-offset: 3px; }}
</style>
</head>
<body>
<main>
  <img src="/{icon_url('icon-192.png')}" alt="" width="88" height="88">
  <h1>페이지를 찾을 수 없습니다</h1>
  <p>주소가 바뀌었거나 없는 페이지입니다.</p>
  <p class="en" lang="en">This page could not be found.</p>
  <a href="/">안요환 홈페이지로 · Home</a>
</main>
</body>
</html>
"""
Path('/home/user/dksdyghks.github.io/404.html').write_text(NOT_FOUND)

# the two apps behind the doors (송공: psat/, 요AI: yoai/) — each folder stands alone
import hashlib, shutil
try:  # 송공's passage face, cut to the letters 송공 shows: rebuilt only when those letters change
    import serif_subset
    if serif_subset.build():
        print('rebuilt fonts/noto-serif-kr')
except ImportError as err:
    print('WARNING: fonts/noto-serif-kr was not checked against new letters (pip install fonttools brotli):', err)
fsrc, fdst = Path('/home/user/yohan-ahn/fonts'), Path('/home/user/dksdyghks.github.io/fonts')
if fsrc.exists():  # self-hosted web fonts shared by the homepage and both apps
    if fdst.exists():
        shutil.rmtree(fdst)
    shutil.copytree(fsrc, fdst)
for app in ('psat', 'yoai'):
    src = Path('/home/user/yohan-ahn') / app
    if not src.exists():
        continue
    dst = Path('/home/user/dksdyghks.github.io') / app
    if dst.exists():
        shutil.rmtree(dst)
    dst.mkdir(parents=True)
    files = sorted(p for p in src.iterdir() if p.is_file() and p.suffix in ('.js', '.css', '.html', '.svg', '.png', '.json', '.webmanifest'))
    shared = [Path('/home/user/yohan-ahn/fonts/noto-serif-kr/noto-serif-kr.css')]  # the serif face both apps use is part of each
    ver = hashlib.sha256(b''.join(p.read_bytes() for p in files + [f for f in shared if f.exists()])).hexdigest()[:10]
    import re as _re
    for p in files:
        if p.suffix == '.html':
            (dst / p.name).write_text(p.read_text().replace('__V__', ver))
        elif app == 'yoai' and p.name == 'app.js':
            # version the module's own relative imports too, so a returning browser never mixes an old helper with a new app.js
            txt = _re.sub(r"(['\"])\./((?:docx|md|ai|pdf|pdf\.worker)\.js)\1", lambda m: f"{m.group(1)}./{m.group(2)}?v={ver}{m.group(1)}", p.read_text())
            (dst / p.name).write_text(txt)
        else:
            shutil.copy2(p, dst / p.name)
    for sub in (p for p in src.iterdir() if p.is_dir() and not p.name.startswith(('_', '.'))):  # e.g. yoai/vendor: fixed-version third-party code
        shutil.copytree(sub, dst / sub.name)
    print('copied', app, len(files), 'files, version', ver)
print('built', len(artifact), len(page))

# keep the sources beside the site, in _src/ (Jekyll does not publish folders starting with _), so a fresh workspace can
# rebuild from the repository alone; PINs are never in these files (the doors hold only salted digests)
sdst = Path('/home/user/dksdyghks.github.io/_src/site')
sdst.mkdir(parents=True, exist_ok=True)
for name in ('build.py', 'taegukgi.py', 'topicmap.py', 'serif_subset.py', 'home_fonts.py', 'style.css', 'script.js',
             'doors.css', 'doors.js', 'photo.b64'):
    shutil.copy2(Path('/home/user/yohan-ahn') / name, sdst / name)
for app in ('psat', 'yoai'):
    if (sdst / app).exists():
        shutil.rmtree(sdst / app)
    shutil.copytree(Path('/home/user/yohan-ahn') / app, sdst / app, ignore=shutil.ignore_patterns('__pycache__'))
print('sources kept in _src/site')
