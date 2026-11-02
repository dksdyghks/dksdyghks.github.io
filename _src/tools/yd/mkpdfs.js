// Two small Korean PDFs (printed by Chromium, so their text can be extracted like a real article's)
const { chromium } = require('playwright'); const fs = require('fs');
const docs = {
  '서재/의회유보와 본질성이론.pdf': ['의회유보의 의의', '의회유보란 국가공동체와 그 구성원에게 기본적이고도 중요한 의미를 갖는 본질적 사항은 입법자가 스스로 정하여야 한다는 원칙이다. 본질성이론에 따르면 기본권 실현에 관련된 영역에서 국가의 결정은 법률로 정하여야 한다.', '위임입법의 한계', '행정입법에 위임하는 경우에도 구체적으로 범위를 정하여야 하며, 포괄위임은 금지된다. 헌법재판소는 텔레비전방송수신료 사건에서 수신료 금액의 결정은 본질적 사항이라고 보았다.', '결론', '의회유보의 범위는 기본권 관련성과 규율대상의 중요성에 따라 달라진다.'],
  '서재/하위/선거관리위원회의 독립성.pdf': ['선거관리위원회의 지위', '선거관리위원회는 헌법기관으로서 정치적 중립성과 독립성이 보장된다. 위원의 임기와 신분보장은 독립성의 제도적 기초이다.', '선거범죄 조사권', '선거관리위원회의 선거범죄 조사권은 영장주의와의 관계에서 그 한계가 문제된다.'],
};
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  for (const [file, parts] of Object.entries(docs)) {
    const pages = []; for (let i = 0; i < parts.length; i += 2) pages.push(`<section style="page-break-after:always"><h2>${parts[i]}</h2><p>${parts[i + 1]}</p></section>`);
    fs.writeFileSync(__dirname + '/tmp.html', `<html><head><meta charset="utf-8"><link rel="stylesheet" href="file:///home/user/yohan-ahn/fonts/noto-serif-kr/noto-serif-kr.css"><style>body{font-family:'Noto Serif KR';font-size:14pt;line-height:1.8;margin:40px}</style></head><body>${pages.join('')}</body></html>`);
    await p.goto('file://' + __dirname + '/tmp.html'); await p.evaluate(() => document.fonts.ready);
    fs.mkdirSync(require('path').dirname(__dirname + '/' + file), { recursive: true });
    await p.pdf({ path: __dirname + '/' + file, format: 'A4' });
    console.log(file, fs.statSync(__dirname + '/' + file).size, 'bytes');
  }
  await b.close();
})();
