// 요AI end to end: folder → index → find → read (PDF + text) → select → card → Word, 묻기 and 숙지 with a stand-in AI,
// the archive of earlier conversations, and the whole thing again with no connection.
const { chromium, devices } = require('playwright'); const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:8766/yoai/', DIR = __dirname, SHOTS = DIR + '/shots/'; fs.mkdirSync(SHOTS, { recursive: true });
const MODE = process.argv[2] || 'desktop';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...(MODE === 'mobile' ? devices['iPhone 14'] : { viewport: { width: 1360, height: 900 } }), acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8766' });
  await ctx.addInitScript(() => {
    window.__YOAI_FAKE_AI = (messages) => {
      const sys = messages[0].content, last = messages[messages.length - 1].content;
      if (sys.includes('꼼꼼히 읽고')) return last.includes('부분별로 정리한 것') ? '1) 주제: 의회유보 (1쪽)\n2) 핵심 주장: 본질적 사항은 입법자가 정한다 (1쪽)' : '- 본질적 사항은 입법자가 스스로 정한다 (1쪽)';
      const n = (last.match(/^\[(\d+)\] /gm) || []).length;
      return n ? `의회유보는 본질적 사항을 입법자가 스스로 정하라는 원칙이다 [1].${n > 1 ? ' 위임입법에서는 포괄위임이 금지된다 [2].' : ''}` : '서재 자료에서 확인되지 않는다.';
    };
  });
  const p = await ctx.newPage(); const errs = [], other = [];
  p.on('pageerror', (e) => errs.push('pageerror ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  p.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1:8766/') && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) other.push(r.url()); });
  const log = (...a) => console.log(MODE, ...a);
  await p.goto(BASE); await p.keyboard.type(process.env.YOAI_PIN); await p.waitForSelector('.side-nav');
  log('first view:', await p.evaluate(() => window.YOAI.S.view), '| nav:', await p.$$eval('.side-nav .side-btn', (els) => els.map((e) => e.textContent.trim()).join(' / ')));
  // a whole folder (with a sub-folder), through the folder picker that every browser has
  if (MODE === 'mobile') await p.click('[data-act="menu"]').catch(() => {});
  await p.evaluate(() => { const g = document.querySelector('[data-act="go"][data-v="library"]'); g && g.click(); });
  // the folder as the browser hands it over (files with their path inside the chosen folder, sub-folders included)
  const files = [['서재/의회유보와 본질성이론.pdf'], ['서재/하위/선거관리위원회의 독립성.pdf']].map(([rel]) => ({ rel, b64: fs.readFileSync(DIR + '/' + rel).toString('base64') }));
  await p.evaluate(async (list) => { const fs2 = list.map(({ rel, b64 }) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const f = new File([bin], rel.split('/').pop(), { type: 'application/pdf', lastModified: 1700000000000 }); Object.defineProperty(f, 'webkitRelativePath', { value: rel }); return f; }); await window.YOAI.syncFolder(fs2); }, files);
  await p.waitForFunction(() => window.YOAI.S.docs.length === 2 && window.YOAI.S.docs.every((d) => d.indexed) && !window.YOAI.S.indexing, null, { timeout: 30000 });
  log('library:', await p.evaluate(() => window.YOAI.S.docs.map((d) => `${d.title} ${d.npages}쪽 ${d.folder} chars=${d.chars}`).join(' | ')));
  log('library status:', (await p.textContent('#lib-status')).replace(/\s+/g, ' ').slice(0, 160));
  await p.screenshot({ path: SHOTS + `lib-${MODE}.png`, fullPage: true });
  // edit one document's details: journal pages in the footnote
  const did = await p.evaluate(() => window.YOAI.S.docs.find((d) => d.title.startsWith('의회유보')).id);
  await p.click(`.doc-row[data-id="${did}"] [data-act="doc-edit"]`);
  await p.fill('#fb1', '홍길동'); await p.fill('#fb2', '2024'); await p.fill('#fb3', '「공법연구」 제52집 제3호'); await p.fill('#fb4', '101'); await p.click('#fb-ok'); await p.waitForFunction((id) => window.YOAI.S.docs.find((d) => d.id === id).author === '홍길동', did);
  log('footnote with journal pages:', await p.evaluate((id) => window.YOAI.footnote(window.YOAI.S.docs.find((d) => d.id === id), 2), did));
  // find: spacing and particles do not matter; quotes and minus narrow it
  await p.evaluate(() => document.querySelector('[data-act="go"][data-v="find"]').click());
  for (const q of ['의회유보', '의회 유보의 범위', '"포괄위임은 금지"', '독립성 -영장주의', '없는낱말조합']) {
    await p.fill('#q', q); await p.waitForTimeout(450);
    log(`find "${q}":`, await p.$$eval('.hit', (els) => els.map((e) => e.querySelector('.hit-h').textContent.replace(/\s+/g, ' ').slice(0, 40)).join(' | ') || '(none)'));
  }
  await p.fill('#q', '본질적 사항'); await p.waitForTimeout(450);
  log('marks in snippets:', await p.$$eval('.hit mark', (els) => els.length));
  await p.screenshot({ path: SHOTS + `find-${MODE}.png` });
  // read: the page as printed (canvas) and as text
  await p.click('.hit >> nth=0'); await p.waitForSelector('#rd-canvas');
  await p.waitForFunction(() => { const c = document.querySelector('#rd-canvas'); if (!c || !c.width) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let i = 0; i < d.length; i += 400) if (d[i] < 128) ink++; return ink > 20; }, null, { timeout: 15000 }).then(() => log('PDF page drawn: yes'), () => log('PDF page drawn: NO'));
  await p.screenshot({ path: SHOTS + `read-pdf-${MODE}.png` });
  await p.click('[data-act="rd-mode"][data-v="text"]'); await p.waitForSelector('#rd-text');
  log('text view marks:', await p.$$eval('#rd-text mark', (els) => els.map((e) => e.textContent).join(',')));
  // select a sentence → card
  await p.evaluate(() => { const el = document.querySelector('#rd-text p'); const r = document.createRange(); const t = el.firstChild; r.setStart(t, 0); r.setEnd(t, Math.min(40, t.length)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  await p.dispatchEvent('#rd-text', 'mouseup'); await p.waitForSelector('#seltool');
  await p.click('#seltool [data-act="sel-cite"]'); log('copied quotation:', JSON.stringify((await p.evaluate(() => navigator.clipboard.readText())).slice(0, 120)));
  await p.evaluate(() => { const el = document.querySelector('#rd-text p'); const r = document.createRange(); const t = el.firstChild; r.setStart(t, 0); r.setEnd(t, Math.min(40, t.length)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  await p.dispatchEvent('#rd-text', 'mouseup'); await p.waitForSelector('#seltool'); await p.click('#seltool [data-act="sel-card"]');
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300); log('arrow key page:', await p.evaluate(() => window.YOAI.S.reader.page));
  // notes → Word with footnotes
  await p.evaluate(() => document.querySelector('[data-act="go"][data-v="notes"]').click());
  log('cards:', await p.$$eval('.card', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 110)).join(' | ')));
  await p.fill('.card textarea', '본질성이론의 기준을 서론에서 정리할 것'); await p.waitForTimeout(600);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-act="notes-docx"]')]);
  const docx = DIR + `/notes-${MODE}.docx`; await dl.saveAs(docx);
  const foot = execSync(`unzip -p "${docx}" word/footnotes.xml`).toString().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const body = execSync(`unzip -p "${docx}" word/document.xml`).toString().replace(/<[^>]+>/g, '').slice(0, 400);
  log('docx name:', dl.suggestedFilename(), '| footnotes:', foot.trim().slice(0, 160), '| has memo:', body.includes('서론에서 정리'));
  // 묻기 with a stand-in AI
  await p.evaluate(() => { window.YOAI.S.settings.ai = { backend: 'fake' }; document.querySelector('[data-act="go"][data-v="ask"]').click(); });
  await p.fill('#ask-in', '의회유보의 범위는 어떻게 정해지나?'); await p.press('#ask-in', 'Enter');
  await p.waitForFunction(() => !window.YOAI.S.asking, null, { timeout: 15000 }); await p.waitForTimeout(200);
  log('answer:', (await p.textContent('.msg.ai .answer')).replace(/\s+/g, ' ').slice(0, 140));
  log('source buttons:', await p.$$eval('.msg.ai .src-ref', (els) => els.map((e) => e.title).join(' | ')));
  await p.screenshot({ path: SHOTS + `ask-${MODE}.png` });
  await p.click('.msg.ai .src-ref >> nth=0'); await p.waitForSelector('.reader');
  log('source opens:', await p.evaluate(() => `${window.YOAI.S.view} p${window.YOAI.S.reader.page}`));
  // 숙지
  await p.evaluate(() => document.querySelector('[data-act="go"][data-v="library"]').click());
  await p.click('[data-act="dig-start"]'); await p.waitForFunction(() => !window.YOAI.DIG.run && window.YOAI.S.docs.every((d) => d.digest), null, { timeout: 20000 });
  log('digests:', await p.evaluate(() => window.YOAI.S.docs.map((d) => d.digest.slice(0, 30)).join(' | ')));
  await p.click('[data-act="dig-show"] >> nth=0'); log('digest window:', (await p.textContent('.modal')).replace(/\s+/g, ' ').slice(0, 90)); await p.click('.modal [data-close]');
  // an earlier AI conversation is still readable
  await p.evaluate(async (id) => { await new Promise((res, rej) => { const r = indexedDB.open('yoai', 2); r.onsuccess = () => { const t = r.result.transaction('chats', 'readwrite'); t.objectStore('chats').put({ id: 'old1', projectId: window.YOAI.S.project.id, title: '예전 대화', updatedAt: Date.now(), messages: [{ role: 'user', text: '의회유보란?' }, { role: 'assistant', docIds: [id], content: [{ type: 'text', text: '본질적 사항은 법률로 정한다 [첨부 문헌]', citations: [{ type: 'page_location', document_index: 0, document_title: '의회유보와 본질성이론', start_page_number: 1, end_page_number: 2, cited_text: '본질적 사항' }] }] }] }); t.oncomplete = () => { r.result.close(); res(); }; t.onerror = rej; }; r.onerror = rej; }); }, did);
  await p.reload(); await p.waitForSelector('.side-nav');
  log('archive in nav:', await p.$$eval('.side-nav .side-btn', (els) => els.some((e) => e.textContent.includes('지난 대화'))));
  await p.evaluate(() => document.querySelector('[data-act="go"][data-v="archive"]').click()); await p.click('[data-act="arch-open"]');
  log('archive answer + source:', (await p.textContent('.arch')).replace(/\s+/g, ' ').slice(0, 160));
  // with no connection
  await ctx.setOffline(true); await p.reload(); await p.waitForSelector('.side-nav', { timeout: 15000 });
  await p.evaluate(() => document.querySelector('[data-act="go"][data-v="find"]').click()); await p.fill('#q', '선거범죄'); await p.waitForTimeout(500);
  log('offline find:', await p.$$eval('.hit', (els) => els.length), '| offline label:', await p.textContent('#net'));
  await p.evaluate(() => { window.YOAI.S.settings.ai = { backend: 'fake' }; document.querySelector('[data-act="go"][data-v="ask"]').click(); });
  await p.click('[data-act="ask-new"]'); await p.fill('#ask-in', '선거관리위원회의 독립성의 기초는?'); await p.press('#ask-in', 'Enter');
  await p.waitForFunction(() => !window.YOAI.S.asking, null, { timeout: 15000 });
  log('offline answer:', (await p.textContent('.msg.ai .answer')).replace(/\s+/g, ' ').slice(0, 80));
  await ctx.setOffline(false);
  log('requests to other sites:', other.length ? [...new Set(other)].join(' ') : 'none');
  log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
  await b.close();
})();
