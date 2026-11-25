"""Whether a KCI law journal belongs in the 논문 찾기 new-papers feed for this user. Judged by the journal's name, carefully:
a public-law journal, a general law review, a criminal-law / labour / 항공우주 / 부동산법학 journal, or an unknown name is
kept; only a journal that is clearly a private- or commercial-law field (tax, civil/property, commercial/finance, IP/media,
medical, consumer, maritime, private-international) is left out. Returns 1 (in the feed) or 0 (out).

The user asked to keep criminal-law journals (형사법의 신동향 등), 항공우주, 일감부동산법학 and labour-law journals.

Used by kci_oai.py as papers are gathered, and by a backfill over what is already gathered; the app's feed reads the flag.
"""
import re

# never dropped — public law, a word marking a public-law journal, a general/again review, or a field the user keeps
KEEP = re.compile(
    r'헌법|행정|공법|입법|국가법|지방자치|자치|인권|통일|북한|사회보장|사회법|환경법|환경과|토지공법|토지법|'
    r'경제규제|규제와|법제|법과정책|법정책|선거|정치|의정|민주|법철학|법사학|법과\s*사회|법이론|'
    r'형사|형법|교정|矯正|범죄|피해자|소년|보호관찰|'            # criminal (kept, by request)
    r'노동|'                                                   # labour (kept, by request)
    r'항공우주|'                                               # aviation/space (kept, by request)
    r'부동산법학|'                                             # real-estate law journals (kept, by request)
    r'법학연구|법학논|법학일반|기타법학|비교법연구|비교공법|외법논집|저스티스|법조|국제법학회|법학교육|기초법')
# a journal that is entirely a private- or commercial-law field — left out of the feed (search still finds it)
DROP = re.compile(
    r'조세|세무|지방세논|관세|'                                 # tax
    r'민사|재산법|가족법|친족|상속|부동산경영|부동산연구|감정평가|'  # civil / property (not 부동산법학/토지법)
    r'상사|상법|기업법|경영법|회사|금융법|증권|보험법|회생|도산|경쟁법|법경제|선진상사|'  # commercial / finance
    r'지식재산|산업재산|저작권|특허|지적재산|엔터테인먼트|스포츠|문화미디어|정보법|콘텐츠|'  # IP / media
    r'과학기술|의생명|'                                        # sci-tech
    r'의료|보건|약사|'                                         # medical
    r'소비자|동물법|건설법무|건설법|해사|선박|'                 # misc single private fields
    r'국제거래|국제사법|국제경제|통상법|비교사법')              # private international / trade


def in_field(journal):
    j = re.sub(r'\s+', '', str(journal or ''))
    if not j:
        return 1
    if KEEP.search(j):
        return 1
    if DROP.search(j):
        return 0
    return 1


if __name__ == '__main__':
    import sys
    for line in sys.stdin:
        name = line.strip()
        if name:
            print(('keep' if in_field(name) else 'DROP'), name)
