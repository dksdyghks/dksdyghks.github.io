// Instant 숙지: facts read straight off the pages (no AI), the 요지 window, page links, and timing on a large library.
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { window.__YOAI_FAKE_AI = () => '요지'; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://127.0.0.1:8766/yoai/'); await p.keyboard.type(process.env.YOAI_PIN); await p.waitForSelector('.side-nav');
  const body = (k) => `선거관리위원회는 헌법 제114조에 따라 설치된 독립기관이다. ${k}에 관하여는 「공직선거법」 제272조의2와 공직선거법 제264조를 본다. 헌법재판소 2014. 12. 19. 선고 2013헌다1 결정과 대법원 2022. 5. 12. 선고 2017다278187 판결 참조. 이러한 방법 제3조 같은 말은 법령이 아니다. 「헌법학원론」은 책이다. `.repeat(3);
  const pages = ['선거관리위원회의 독립성과 정치적 중립성에 관한 연구\n안요환', '목 차\n제1장 서론 ··········· 1\n제5장 결론 ··········· 250',
    '국문초록\n이 논문은 선거관리위원회의 독립성과 정치적 중립성을 헌법적으로 검토한다. 비교법적으로 미국과 캐나다를 살핀다. 결론적으로 위원 구성 방식의 개선을 제안한다.\n주제어: 선거관리위원회, 독립성, 정치적 중립성, 헌법 제114조'];
  for (let i = 4; i <= 260; i++) pages.push(i === 4 ? '제1장 서론\n제1절 연구의 목적\n' + body('목적') : i === 20 ? '제2장 헌법적 지위\n' + body('지위') : i === 250 ? '제5장 결론\n이상의 검토를 요약하면 선거관리위원회의 독립성은 위원 구성과 예산에서 보장되어야 한다. 이를 위해 국회 동의 절차를 정비할 필요가 있다.' : i === 256 ? '참고문헌\n허영, 한국헌법론, 박영사, 2023.' : body(`${i}쪽`));
  const t0 = Date.now();
  const f = await p.evaluate((pg) => window.YOAI.extractFacts(pg), pages);
  console.log('extract ms', Date.now() - t0);
  console.log('abstract p', f.abstract && f.abstract.p, '|', f.abstract && f.abstract.text.slice(0, 40));
  console.log('keywords', f.keywords.join(' / '));
  console.log('outline', f.outline.map((h) => `${h.t}(${h.p})`).join(' · '));
  console.log('conclusion', f.conclusion && f.conclusion.head, f.conclusion && f.conclusion.p);
  console.log('laws', f.laws.map((x) => `${x.key}×${x.n}`).join(' | '));
  console.log('cases', f.cases.map((x) => `${x.key}×${x.n}`).join(' | '));
  console.log('brief', f.brief.slice(0, 120));
  // library: the two test PDFs; facts appear with reading, no AI involved
  const files = [['서재/의회유보와 본질성이론.pdf'], ['서재/하위/선거관리위원회의 독립성.pdf']].map(([rel]) => ({ rel, b64: fs.readFileSync(__dirname + '/' + rel).toString('base64') }));
  await p.evaluate(async (list) => { const fs2 = list.map(({ rel, b64 }) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const f = new File([bin], rel.split('/').pop(), { type: 'application/pdf' }); Object.defineProperty(f, 'webkitRelativePath', { value: rel }); return f; }); await window.YOAI.syncFolder(fs2); }, files);
  await p.waitForFunction(() => window.YOAI.S.docs.length === 2 && window.YOAI.S.docs.every((d) => d.indexed && (d.blank || d.hasFacts)), null, { timeout: 30000 });
  console.log('library facts:', JSON.stringify(await p.evaluate(() => window.YOAI.S.docs.map((d) => [d.title, d.hasFacts, d.brief.slice(0, 50)]))));
  await p.evaluate(() => { location.hash = '#library'; });
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.dataset.act === 'nav' && /서재/.test(x.innerText)); if (b) b.click(); });
  await p.waitForTimeout(300);
  const st = await p.evaluate(() => (document.querySelector('#dig-status') || {}).innerText || '(none)'); console.log('status:', st);
  await p.evaluate(async (txt) => { await window.YOAI.addFiles([new File([txt], '선관위 독립성 박사논문.txt', { type: 'text/plain' })]); }, pages.join('\n\n'));
  await p.waitForFunction(() => window.YOAI.S.docs.length === 3 && window.YOAI.S.docs.every((d) => d.indexed && (d.blank || d.hasFacts)), null, { timeout: 30000 });
  const id = await p.evaluate(() => window.YOAI.S.docs.find((d) => /박사논문/.test(d.title)).id);
  await p.evaluate((i) => window.YOAI.showDigest(i), id); await p.waitForSelector('.modal-wrap .fact, .modal-wrap .find-none');
  const modalInfo = await p.evaluate(() => { const m = document.querySelector('.modal-wrap'); return { heads: [...m.querySelectorAll('.fact h3')].map((h) => h.innerText.split('\n')[0]), btns: [...m.querySelectorAll('.modal-foot button')].map((b) => b.innerText), links: m.querySelectorAll('[data-act="open-at"]').length }; });
  console.log('요지 window:', JSON.stringify(modalInfo));
  await p.screenshot({ path: __dirname + '/shots/facts-modal.png' });
  if (modalInfo.links) { await p.click('.modal-wrap [data-act="open-at"]'); await p.waitForTimeout(500); console.log('after page link: view', await p.evaluate(() => window.YOAI.S.view + ' p' + (window.YOAI.S.reader && window.YOAI.S.reader.page))); }
  // AI 요지 for one document only
  await p.evaluate(() => { window.YOAI.AI.useFake(); window.YOAI.S.settings.ai = { backend: 'fake' }; });
  await p.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((x) => x.remove()));
  await p.evaluate((i) => window.YOAI.showDigest(i), id); await p.waitForSelector('.modal-wrap [data-act="dig-one"]');
  await p.click('.modal-wrap [data-act="dig-one"]'); await p.waitForFunction(() => !window.YOAI.DIG.run && window.YOAI.S.docs.some((d) => d.digest), null, { timeout: 15000 });
  console.log('AI 요지 written for:', JSON.stringify(await p.evaluate(() => window.YOAI.S.docs.filter((d) => d.digest).map((d) => d.title))));
  console.log('errors', errs.length ? errs.join(' | ') : 'none');
  await b.close();
})();
