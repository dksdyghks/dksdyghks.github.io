/* 연구실 책장 service worker: once opened online, the app itself also starts with no connection.
   - The page goes to the network first (so a new version arrives as soon as the device is online) and falls back to the copy
     saved at install. Each version's files are saved together at install, so an offline start never mixes two versions.
   - The app's own files carry their version (?v=, stamped by the build on index.html and on every import): such a file is
     served from that version's own copy, else from the network — never from another version's copy, which would mix two
     versions in one page (on a slow line, a new app.js with an old reader.js stopped the app at '여는 중…').
   - The PDF engine (vendor/…) and its font maps never change under a given path: saved once, served from the copy.
   - Requests to the 책장 server (another origin) are not touched here. */
'use strict';
const VER = new URL(self.location.href).searchParams.get('v') || 'dev';
const APP = 'shelf-app-' + VER;
const VENDOR = 'shelf-vendor';
const FONTS = 'shelf-fonts';
const WAIT = 4000;
const ROOT = new URL('./', self.location.href).href;
const MODULES = ['api.js', 'store.js', 'pdfkit.js', 'analyze.js', 'reader.js', 'annot.js', 'naming.js', 'cite.js', 'hanja.js', 'ocr.js', 'cases.js', 'laws.js', 'papers.js', 'research.js', 'biblio.js', 'bills.js', 'kci.js', 'moleg.js', 'precq.js', 'verify.js', 'kciq.js', 'pfind.js', 'write.js', 'ccnews.js', 'nars.js', 'adjud.js', 'terms.js'];
const EXTRA = ['research.json', 'lawidx.json', 'kci-journals.json', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png'];
const VENDOR_CORE = ['vendor/pdfjs-4.10.38/pdf.min.js', 'vendor/pdfjs-4.10.38/pdf.worker.min.js', 'vendor/pdf-lib-1.17.1/pdf-lib.esm.min.js'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const page = await fetch(ROOT, { cache: 'no-store' });
    if (!page.ok) throw new Error('page ' + page.status);
    const html = await page.clone().text();
    // (a page of another version — a deploy landed meanwhile — is not saved as this one's: the next registration does it)
    if (VER !== 'dev' && !html.includes('data-v="' + VER + '"')) throw new Error('page of another version');
    const stamped = /^[0-9a-z]+$/i.test(VER) && VER !== 'dev';
    const files = new Set([...EXTRA, ...MODULES.map((m) => (stamped ? m + '?v=' + VER : m))]);
    for (const m of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
      const u = m[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(u)) continue;
      if (u.includes('?v=')) files.add(u);
    }
    const app = await caches.open(APP);
    await Promise.all([...files].map(async (f) => {
      const url = new URL(f, ROOT).href;
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) throw new Error(f + ' ' + r.status);
      await app.put(url, r);
    }));
    await app.put(ROOT, page);
    const vendor = await caches.open(VENDOR);
    for (const f of VENDOR_CORE) { const url = new URL(f, ROOT).href; if (!(await vendor.match(url))) { const r = await fetch(url); if (r.ok) await vendor.put(url, r); } }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('shelf-app-') && k !== APP) await caches.delete(k);
    await self.clients.claim();
  })());
});

function timeout(ms) { return new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms)); }

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname.includes('/vendor/')) {
    event.respondWith((async () => {
      const c = await caches.open(VENDOR);
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    })());
    return;
  }
  if (url.origin === self.location.origin && url.pathname.startsWith('/fonts/')) {
    event.respondWith((async () => {
      const c = await caches.open(FONTS);
      const hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    })());
    return;
  }
  if (url.origin !== self.location.origin || !url.href.startsWith(ROOT)) return;
  // the page fetched afresh by index.html's 다시 불러오기 goes to the network only (a saved copy would pass for an answer)
  if (req.cache === 'reload' && req.mode !== 'navigate' && (url.href.split('#')[0] === ROOT || url.href.split('#')[0] === ROOT + 'index.html')) return;
  const v = req.mode !== 'navigate' && url.searchParams.get('v');
  if (v) {   // one version's file: that version's copy, else the network (a ?v= address never changes, so no timeout race)
    event.respondWith((async () => {
      const own = 'shelf-app-' + v;
      if (await caches.has(own)) { const hit = await (await caches.open(own)).match(req.url); if (hit) return hit; }
      try {
        const r = await fetch(req);
        if (r.ok && v === VER) { const c = r.clone(); caches.open(APP).then((a) => a.put(req.url, c)).catch(() => {}); }
        return r;
      } catch (e) {
        for (const k of await caches.keys()) if (k.startsWith('shelf-app-')) { const h = await (await caches.open(k)).match(req.url); if (h) return h; }   // the same address only
        return Response.error();
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const isPage = req.mode === 'navigate';
    const key = isPage ? ROOT : req.url;
    try {
      const r = await Promise.race([fetch(req, { cache: 'no-cache' }), timeout(WAIT)]);
      if (r.ok || r.status === 304) return r;
      throw new Error('status ' + r.status);
    } catch (e) {
      if (await caches.has(APP)) {   // (has: an old worker still running never makes its dropped copy again)
        const app = await caches.open(APP);
        const hit = (await app.match(key)) || (await app.match(key, { ignoreSearch: true }));
        if (hit) return hit;
      }
      for (const k of await caches.keys()) if (k.startsWith('shelf-app-')) { const h = await (await caches.open(k)).match(key, { ignoreSearch: true }); if (h) return h; }
      return Response.error();
    }
  })());
});
