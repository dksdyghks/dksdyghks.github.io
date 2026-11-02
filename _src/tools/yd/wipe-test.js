// "요AI 자료 모두 지우기": everything of 요AI goes; 송공's records stay.
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  // 송공 records first (same site)
  await p.goto('http://127.0.0.1:8766/psat/');
  await p.evaluate(async () => { localStorage.setItem('songgong.settings', JSON.stringify({ marker: 1 })); await new Promise((res) => { const r = indexedDB.open('songgong', 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); }; r.onsuccess = () => { r.result.close(); res(); }; }); const c = await caches.open('songgong-marker'); await c.put('/psat/marker', new Response('x')); });
  await p.goto('http://127.0.0.1:8766/yoai/'); await p.keyboard.type(process.env.YOAI_PIN); await p.waitForSelector('.side-nav');
  const files = [['서재/의회유보와 본질성이론.pdf']].map(([rel]) => ({ rel, b64: fs.readFileSync(__dirname + '/' + rel).toString('base64') }));
  await p.evaluate(async (list) => { const fs2 = list.map(({ rel, b64 }) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const f = new File([bin], rel.split('/').pop(), { type: 'application/pdf' }); Object.defineProperty(f, 'webkitRelativePath', { value: rel }); return f; }); await window.YOAI.syncFolder(fs2); }, files);
  await p.evaluate(async () => { const c = await caches.open('webllm/model'); await c.put('/fake-model', new Response('m')); });
  await p.waitForTimeout(1500);
  const before = await p.evaluate(async () => ({ dbs: (await indexedDB.databases()).map((d) => d.name).sort(), caches: (await caches.keys()).sort(), sw: (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope.replace(location.origin, '')) }));
  console.log('before:', JSON.stringify(before));
  await p.click('[data-act="settings"]').catch(async () => { await p.evaluate(() => { const b = document.createElement('button'); b.dataset.act = 'settings'; document.body.appendChild(b); b.click(); }); });
  await p.waitForSelector('#wipe'); await p.click('#wipe');
  await p.waitForSelector('.modal-wrap .btn.primary, .modal-wrap .btn.danger'); 
  await p.evaluate(() => { const bs = [...document.querySelectorAll('.modal-wrap button')]; const ok = bs.find((x) => /모두 지우기/.test(x.innerText) && x.id !== 'wipe'); ok.click(); });
  await p.waitForSelector('.wiped', { timeout: 15000 });
  console.log('screen:', (await p.textContent('.wiped')).replace(/\s+/g, ' '));
  const after = await p.evaluate(async () => ({ dbs: (await indexedDB.databases()).map((d) => d.name).sort(), caches: (await caches.keys()).sort(), sw: (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope.replace(location.origin, '')), sg: localStorage.getItem('songgong.settings') }));
  console.log('after:', JSON.stringify(after));
  console.log('yoai gone:', !after.dbs.includes('yoai') && !after.caches.some((k) => /^(yoai-|webllm)/.test(k)) && !after.sw.includes('/yoai/'), '| 송공 kept:', after.dbs.includes('songgong') && after.caches.includes('songgong-marker') && !!after.sg);
  await p.screenshot({ path: __dirname + '/shots/wiped.png' });
  console.log('errors', errs.length ? errs.join(' | ') : 'none');
  await b.close();
})();
