// 숙지 (quick mode): which parts are picked from a dissertation-shaped text, and the whole run with the test double.
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const seen = [];
  await ctx.exposeFunction('__seen', (m) => seen.push(m));
  await ctx.addInitScript(() => { window.__YOAI_FAKE_AI = (msgs) => { window.__seen(msgs[msgs.length - 1].content); return '1) 주제와 문제의식: 선거관리위원회의 독립성 (3쪽)\n2) 핵심 주장: 정치적 중립성 보장 (250쪽)'; }; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://127.0.0.1:8766/yoai/'); await p.keyboard.type(process.env.YOAI_PIN); await p.waitForSelector('.side-nav');
  // a dissertation-shaped text: title, 목차, 국문초록, chapters, 결론, 참고문헌
  const body = (k) => `선거관리위원회는 헌법 제114조에 따라 설치된 독립기관이다. 본 절은 ${k}에 관하여 학설과 판례를 검토한다. `.repeat(18);
  const pages = [];
  pages.push('선거관리위원회의 독립성과 정치적 중립성에 관한 연구\n안요환\n서강대학교 대학원');
  pages.push('목 차\n제1장 서론 ··········· 1\n제2장 선거관리위원회의 헌법적 지위 ··········· 20\n제5장 결론 ··········· 250');
  pages.push('국문초록\n이 논문은 선거관리위원회의 독립성과 정치적 중립성을 헌법적으로 검토한다. 비교법적으로 미국과 캐나다를 살핀다.\n주제어: 선거관리위원회, 독립성, 정치적 중립성');
  for (let i = 4; i <= 260; i++) {
    let t = '';
    if (i === 4) t = '제1장 서론\n제1절 연구의 목적\n' + body('연구의 목적');
    else if (i === 20) t = '제2장 선거관리위원회의 헌법적 지위\n제1절 헌법 제114조\n' + body('헌법적 지위');
    else if (i === 120) t = '제3장 비교법적 검토\n' + body('비교법');
    else if (i === 200) t = '제4장 개선방안\n' + body('개선방안');
    else if (i === 250) t = '제5장 결론\n' + '이상의 검토를 요약하면 선거관리위원회의 독립성은 위원 구성과 예산에서 보장되어야 한다. '.repeat(20);
    else if (i === 256) t = '참고문헌\n김철수, 헌법학신론, 박영사, 2020.\n' + '허영, 한국헌법론, 박영사, 2023. '.repeat(30);
    else t = body(`${i}쪽의 쟁점`);
    pages.push(t);
  }
  const kp = await p.evaluate(([pg]) => window.YOAI.keyParts(pg, 9000), [pages]);
  console.log('found', kp.found.join(','), '| text chars', kp.text.length);
  console.log('outline:\n' + kp.outline);
  console.log('has 〔3쪽〕 abstract:', /\[초록\][\s\S]*〔3쪽〕/.test(kp.text), '| intro from 4쪽:', /\[서론\]\s*〔4쪽〕/.test(kp.text), '| conclusion from 250쪽:', /\[결론\]\s*〔250쪽〕/.test(kp.text), '| no 참고문헌 in text:', !/허영, 한국헌법론/.test(kp.text));
  // no headings at all: beginning and end of the text
  const flat = await p.evaluate(() => window.YOAI.keyParts(Array.from({ length: 30 }, (_, i) => `${i + 1}쪽 본문 `.repeat(200)), 6000));
  console.log('no headings ->', flat.found.join(','), flat.text.length, '| ends near 30쪽:', /〔30쪽〕/.test(flat.text));
  // the whole run with the two test PDFs
  const files = [['서재/의회유보와 본질성이론.pdf'], ['서재/하위/선거관리위원회의 독립성.pdf']].map(([rel]) => ({ rel, b64: fs.readFileSync(__dirname + '/' + rel).toString('base64') }));
  await p.evaluate(async (list) => { const fs2 = list.map(({ rel, b64 }) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const f = new File([bin], rel.split('/').pop(), { type: 'application/pdf' }); Object.defineProperty(f, 'webkitRelativePath', { value: rel }); return f; }); await window.YOAI.syncFolder(fs2); }, files);
  await p.waitForFunction(() => window.YOAI.S.docs.length === 2 && window.YOAI.S.docs.every((d) => d.indexed));
  await p.evaluate(() => { window.YOAI.AI.useFake(); window.YOAI.S.settings.ai = { backend: 'fake' }; });
  await p.click('[data-view="library"], [data-nav="library"]').catch(() => {});
  const states = new Set();
  const poll = setInterval(async () => { try { const t = await p.evaluate(() => (document.querySelector('#dig-status') || {}).innerText || ''); if (/읽는 중|쓰는 중/.test(t)) states.add(t.match(/(읽는 중|쓰는 중)/)[1]); } catch (e) {} }, 5);
  await p.evaluate(() => window.YOAI.digestAll());
  clearInterval(poll);
  const res = await p.evaluate(() => window.YOAI.S.docs.map((d) => [d.title, d.digestMode, d.digest ? d.digest.length : 0]));
  console.log('digested:', JSON.stringify(res), '| AI calls:', seen.length, '| saw states:', [...states].join(','));
  console.log('prompt says not the whole text:', seen.every((m) => /본문 전체가 아니다/.test(m)));
  const st = await p.evaluate(() => document.querySelector('#dig-status') ? document.querySelector('#dig-status').innerText : '(no box)');
  console.log('status after:', st.replace(/\n/g, ' | '));
  await p.screenshot({ path: __dirname + '/shots/dig-library.png' });
  console.log('errors', errs.length ? errs.join(' | ') : 'none');
  await b.close();
})();
