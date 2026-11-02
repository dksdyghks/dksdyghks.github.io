# 0128.kr 원본과 도구

이 폴더는 사이트에 게시되지 않습니다. GitHub Pages(Jekyll)는 이름이 `_`로 시작하는 폴더를 건너뜁니다.
저장소가 공개라 GitHub에서는 누구나 볼 수 있으므로 비밀번호(PIN)는 어디에도 넣지 않았습니다.
송공·요AI의 문은 솔트를 친 반복 해시만 가지고 있고, 테스트는 PIN을 환경변수로 받습니다.

## 구성

`site/`: 홈페이지와 두 앱의 원본

| 파일 | 하는 일 |
|---|---|
| `build.py` | 홈페이지 내용(학력·소속·논문·과제·발표·강의·수상)과 페이지 생성. 실행하면 저장소 루트의 `index.html`, `404.html`, `psat/`, `yoai/`, `fonts/`를 만들고, claude.ai 미리보기용 `index.html`을 원본 폴더에 만듭니다. |
| `style.css`, `script.js` | 홈페이지 모양과 동작 |
| `doors.css`, `doors.js` | 숨은 문: 태극기를 세 번 누르면 송공, 금색 문장을 세 번 누르면 요AI |
| `taegukgi.py` | 태극기 SVG |
| `topicmap.py` | 연구 주제 지도(주제 사이의 연결망). 지금 페이지에서는 쓰지 않음 |
| `photo.b64` | 프로필 사진(JPEG, base64) |
| `serif_subset.py` | 송공 지문 글꼴(Noto Serif KR)을 송공에 나오는 글자와 KS X 1001 한글로 잘라 `fonts/noto-serif-kr/`에 만듦 |
| `home_fonts.py` | 홈페이지 서명·명조 글꼴을 페이지에 쓰인 글자만 남겨 `fonts/home/`에 만듦 |
| `psat/` | 송공. `index.html`의 `__V__`는 빌드 때 버전으로 바뀜 |
| `yoai/` | 요AI. `app.js`의 모듈 주소에도 빌드 때 버전이 붙음 |

`tools/`: 검증과 테스트

| 폴더 | 내용 |
|---|---|
| `psat/` | 문항 검증. `bankcheck.js`(정답·해설 일관성), `verify-new.py`·`verify-bank.py`(계산·논리 문항 전수 재풀이), `textverify.js`·`dataverify.js`(화면에 보이는 문장만 읽고 독립 재풀이), `particles.js`(조사), `lint.js`(띄어쓰기·중복), `levels.js`·`test-gen.js`(생성기가 난이도마다 정상 출제하는지) |
| `sg/` | 화면 테스트(Playwright). `flow.js`(풀이 흐름), `set-test.js`·`set40.js`(실전 세트), `doors-test.js`(숨은 문), `bankall.js`·`chartclip.js`·`tablewide.js`(모든 문항 렌더링, 그래프 잘림, 표 넘침), `pwa-test.js`(오프라인과 새 버전 교체), `hero.js`·`edu.js`·`home.js`·`stmt-widths.js`·`nf.js`(홈페이지), `yoai-test*.js`(요AI, 가짜 API) |
| `cat/` | 고양이 아이콘(`render.js`)과 송공 링크 미리보기 카드(`og-cat.js`) |
| `lh/` | GitHub Pages처럼 gzip으로 보내는 정적 서버(`gzserve.js`)와 Lighthouse |

## 다시 작업할 때

Claude Code 클라우드 세션의 경로를 기준으로 합니다.

```bash
git clone https://github.com/dksdyghks/dksdyghks.github.io /home/user/dksdyghks.github.io
cp -r /home/user/dksdyghks.github.io/_src/site /home/user/yohan-ahn
cp -r /home/user/dksdyghks.github.io/fonts /home/user/yohan-ahn/fonts
pip install fonttools brotli
python3 /home/user/yohan-ahn/build.py
```

글꼴 원본(TTF)은 다시 자를 일이 생길 때 Google Fonts에서 받아 `/home/user/yohan-ahn/fonts-src/`에 둡니다(저장소에는 넣지 않음).
글자가 그대로면 빌드는 자른 글꼴을 다시 만들지 않습니다.

## 테스트

```bash
mkdir -p /tmp/yohan-work && cp -r /home/user/dksdyghks.github.io/_src/tools/* /tmp/yohan-work/
export SONGGONG_PIN=송공비밀번호 YOAI_PIN=요AI비밀번호
python3 /tmp/yohan-work/sg/mkpdf.py /tmp/yohan-work/sg/small.pdf 6 Short
python3 /tmp/yohan-work/sg/mkpdf.py /tmp/yohan-work/sg/big.pdf 120 Long
sh /tmp/yohan-work/sg/serve.sh
(cd /home/user/dksdyghks.github.io && python3 -m http.server 8766 --bind 127.0.0.1 &)
(cd /tmp/yohan-work/lh && npm install && node gzserve.js /home/user/dksdyghks.github.io 8770 &)
```

문항을 고치거나 더하면 `tools/psat/`의 검증을 모두 통과시킨 뒤 배포합니다. 예를 들어 `node /tmp/yohan-work/psat/bankcheck.js`, `python3 /tmp/yohan-work/psat/verify-new.py`가 있습니다.
화면 테스트는 `node /tmp/yohan-work/sg/flow.js mobile`처럼 실행합니다.
