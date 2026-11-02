// 숙지: the mode switch is kept, the digest window shows the mode and the headings, and "꼼꼼히" re-reads one document.
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { window.__YOAI_FAKE_AI = () => '1) 주제와 문제의식: 의회유보 (1쪽)'; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://127.0.0.1:8766/yoai/'); await p.keyboard.type(process.env.YOAI_PIN); await p.waitForSelector('.side-nav');
  const files = [['서재/의회유보와 본질성이론.pdf']].map(([rel]) => ({ rel, b64: fs.readFileSync(__dirname + '/' + rel).toString('base64') }));
  await p.evaluate(async (list) => { const fs2 = list.map(({ rel, b64 }) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const f = new File([bin], rel.split('/').pop(), { type: 'application/pdf' }); Object.defineProperty(f, 'webkitRelativePath', { value: rel }); return f; }); await window.YOAI.syncFolder(fs2); }, files);
  await p.waitForFunction(() => window.YOAI.S.docs.length === 1 && window.YOAI.S.docs.every((d) => d.indexed));
  await p.evaluate(() => { window.YOAI.AI.useFake(); window.YOAI.S.settings.ai = { backend: 'fake' }; });
  await p.evaluate(() => window.YOAI.digestAll());
  const id = await p.evaluate(() => window.YOAI.S.docs[0].id);
  // open the digest window from the reader
  await p.evaluate((i) => { const b = document.createElement('button'); b.dataset.act = 'dig-redo'; }, id);
  await p.evaluate(() => { const d = window.YOAI.S.docs[0]; return d.digestMode; }).then((m) => console.log('mode after quick run:', m));
  // the mode select: switch to 꼼꼼히 and back is remembered in settings
  await p.evaluate(() => { location.hash = ''; }); 
  const sel = await p.$('#dig-mode'); if (sel) { await sel.selectOption('full'); await p.waitForTimeout(100); console.log('setting after switch:', await p.evaluate(() => window.YOAI.S.settings.digMode)); await sel.selectOption('quick'); }
  else console.log('mode select not on this screen (library view needed)');
  // digest window + 꼼꼼히 button
  await p.evaluate((i) => { const a = document.createElement('a'); a.dataset.act = 'rd-digest'; }, id);
  const opened = await p.evaluate(async (i) => { const ev = (act, extra = {}) => { const el = document.createElement('button'); el.dataset.act = act; Object.assign(el.dataset, extra); document.body.appendChild(el); el.click(); el.remove(); }; window.YOAI.S.reader = { id: i }; ev('rd-digest'); await new Promise((r) => setTimeout(r, 300)); const m = document.querySelector('.modal-wrap'); return m ? { sub: m.querySelector('.sub').innerText, full: !!m.querySelector('[data-act="dig-full"]'), outline: !!m.querySelector('#dig-outline') } : null; }, id);
  console.log('digest window:', JSON.stringify(opened));
  await p.screenshot({ path: __dirname + '/shots/dig-modal.png' });
  if (opened && opened.full) { await p.click('[data-act="dig-full"]'); await p.waitForFunction(() => !window.YOAI.DIG.run && window.YOAI.S.docs[0].digestMode === 'full', null, { timeout: 20000 }); console.log('after 꼼꼼히:', await p.evaluate(() => window.YOAI.S.docs[0].digestMode)); }
  console.log('errors', errs.length ? errs.join(' | ') : 'none');
  await b.close();
})();
