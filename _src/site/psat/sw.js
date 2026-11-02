/* 송공 service worker: once 송공 has been opened online, it also opens and works with no connection.
   - App files go to the network first, so a new version shows up as soon as the phone is online. The saved copy
     answers only when the network fails, stalls for WAIT ms, or the server errs. Each version's files are saved
     together at install (all or nothing), so an offline start never mixes files from two versions.
   - Fonts (Pretendard and Noto Serif KR, both served from this site) are saved once and shared by every version.
   Nothing here sends data anywhere; records stay in the browser's own storage as before. */
'use strict';
const VER = new URL(self.location.href).searchParams.get('v') || 'dev';
const APP = 'songgong-app-' + VER;
const FONTS = 'songgong-fonts';
const WAIT = 4000;
const ROOT = new URL('./', self.location.href).href;
const EXTRA = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const page = await fetch(ROOT, { cache: 'no-store' });
    if (!page.ok) throw new Error('page ' + page.status);
    const html = await page.clone().text();
    // read from the very page being saved: its versioned files (scripts, style sheet) and its font style sheets
    const files = new Set(EXTRA), fontCss = new Set();
    for (const m of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
      const u = m[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u)) continue; // other sites, data: addresses, in-page links
      if (/(?:^|\/)fonts\/[^?]*\.css(?:\?|$)/.test(u)) fontCss.add(new URL(u, ROOT).href);
      else if (u.includes('?v=')) files.add(u);
    }
    const app = await caches.open(APP);
    await app.addAll([...files].map((f) => new URL(f, ROOT).href));
    await app.put(ROOT, page);
    await saveFonts([...fontCss]).catch(() => {}); // fonts are a bonus: they never hold back a new version
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('songgong-app-') && k !== APP) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (same && url.pathname.startsWith('/fonts/')) event.respondWith(font(event));
  else if (same && req.url.startsWith(ROOT)) event.respondWith(app(event));
  // anything else goes to the network exactly as without this worker
});

async function saved(name, key) { return (await caches.open(name)).match(key, { ignoreVary: true }); }

async function app(event) {
  const req = event.request;
  const nav = req.mode === 'navigate';
  const key = nav ? ROOT : req; // every address inside 송공 opens the same page
  // the page itself is always checked with the server (a tiny "not modified" when nothing changed), so a new version
  // appears on the first launch after it is published, not when the browser's own 10-minute copy runs out
  const net = fetch(nav ? new Request(req, { cache: 'no-cache' }) : req);
  net.catch(() => {}); // a late failure after the saved copy has answered is not an error
  let timer;
  const stall = new Promise((resolve) => { timer = setTimeout(resolve, WAIT); });
  try {
    const res = await Promise.race([net, stall]);
    if (res && res.status < 500) return res;
    const copy = await saved(APP, key);
    if (copy) return copy;
    return res || await net;
  } catch (err) {
    const copy = await saved(APP, key);
    if (copy) return copy;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function font(event) {
  const req = event.request;
  const cache = await caches.open(FONTS);
  const copy = await cache.match(req, { ignoreVary: true });
  const fresh = fetch(req).then((res) => {
    if (!res.ok && res.type !== 'opaque') return res;
    const keep = res.clone();
    return cache.put(req, keep).catch(() => {}).then(() => res); // a full disk never stops the font itself
  });
  if (!copy) return fresh;
  // a font file never changes under one name; a style sheet is refreshed quietly for next time
  if (new URL(req.url).pathname.endsWith('.css')) event.waitUntil(fresh.catch(() => {}));
  return copy;
}

/* Each face comes in small pieces that the browser fetches only for the letters on screen. Offline, a missing piece
   would show those letters in another font, so every piece is saved once (about 4 MB in all), a few at a time.
   Pieces no longer named by the current style sheets are dropped, so the cache never grows with old versions. */
async function saveFonts(cssUrls) {
  const cache = await caches.open(FONTS);
  const keep = new Set(), files = [];
  for (const cssUrl of cssUrls) {
    const res = await fetch(cssUrl, { cache: 'no-cache' });
    if (!res.ok) return; // keep everything as it is until a visit can read the style sheets
    const css = await res.clone().text();
    await cache.put(cssUrl, res);
    keep.add(cssUrl);
    for (const m of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) { const u = new URL(m[1], cssUrl).href; if (!keep.has(u)) { keep.add(u); files.push(u); } }
  }
  const missing = [];
  for (const u of files) if (!(await cache.match(u, { ignoreVary: true }))) missing.push(u);
  for (let i = 0; i < missing.length; i += 6) {
    await Promise.all(missing.slice(i, i + 6).map(async (u) => {
      try { const r = await fetch(u); if (r.ok) await cache.put(u, r); } catch (e) { /* saved on a later visit */ }
    }));
  }
  for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
}
