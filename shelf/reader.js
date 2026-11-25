// The reader: pages in one continuous column, pinch or buttons to zoom, highlight and underline by dragging over the text.
//   Tools: 읽기 (finger scrolls; a selection offers colours and copy), 형광펜, 밑줄 (one finger or the mouse drags over text
//   to mark it; two fingers scroll). An Apple Pencil always marks, with the last marking tool.
//   Marks follow the letters (a drag is turned into text ranges, never a free stroke) and are kept as page-relative boxes.
import { lib, pageItems } from './pdfkit.js';

// Highlights are drawn at 45% with Multiply (on screen and in the exported PDF), so on white paper these come out as
// soft tints: butter, mint, sky, pink, lilac, apricot.
export const HL = ['#FFE461', '#A8E9B8', '#ABD3FF', '#FFB3CC', '#CCBAFF', '#FFC78E'];
const HL_NAMES = ['노랑', '초록', '하늘', '분홍', '보라', '주황'];
export const UL = ['#E5484D', '#2F6FEB', '#1E9E5A', '#3A4150'];

// ★ △ ✕ drawn the way one marks a printed cover with a pen (a five-line star, an open triangle, a cross)
export function gradeSVG(v) {
  if (v > 0) return '<svg viewBox="0 0 24 24" class="pen"><path d="M12.1 2.9L17.4 19.4L3.3 9.3L20.7 9.1L6.6 19.5L12.6 3.6"/></svg>'.repeat(v);
  if (v === -2) return '<svg viewBox="0 0 24 24" class="pen"><path d="M12.3 3.8L20.6 19.2L3.6 19.4L12.8 4.6"/></svg>';
  if (v === -1) return '<svg viewBox="0 0 24 24" class="pen"><path d="M5 5.2L19.2 19M18.8 4.8L5.3 19.3"/></svg>';
  return '';
}
const UL_NAMES = ['빨강', '파랑', '초록', '먹색'];
const GAP = 14;
const END_H = 300;   // the '끝까지 읽었습니다' card after the last page, with room for the floating tools
const MAX_PIXELS = 12e6;   // per canvas (Safari's hard limit is 16.7M)
const KEEP = 2;            // pages kept rendered beyond the visible ones

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const ICON = {
  walk: '<svg viewBox="0 0 24 24"><path d="M4 7h9M4 12h6M4 17h9"/><path d="M15 8.5l4.5 3.5-4.5 3.5"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  read: '<svg viewBox="0 0 24 24"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5V4.5a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.6 13.8a1.6 1.6 0 0 1 2.6-1.9L9 15"/></svg>',
  hl: '<svg viewBox="0 0 24 24"><path d="M14.5 4.5l5 5-8 8H6.5v-5z"/><path d="M4 20h16"/></svg>',
  ul: '<svg viewBox="0 0 24 24"><path d="M7 4v7a5 5 0 0 0 10 0V4"/><path d="M5 20h14"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12"/></svg>',
};

export class Reader {
  constructor(host, o) {
    this.host = host; this.o = o;
    this.doc = o.doc; this.N = o.doc.numPages;
    this.A = o.analyze;
    this.labels = (o.index && o.index.labels) || { offset: null, confident: false };
    this.texts = (o.index && o.index.pages) || null;
    this.outlineData = (o.index && o.index.outline) || [];
    this.allMarks = (o.marks || []).slice();   // includes deletions (kept for syncing)
    this.ocr = o.ocr || null;   // a scan's words, page by page (read by ocr.js)
    this.zoom = o.zoom > 0 ? o.zoom : 1; this.tool = 'read';
    const pref = o.prefs || {};
    this.hlColor = HL.includes(pref.hl) ? pref.hl : HL[0];
    this.ulColor = UL.includes(pref.ul) ? pref.ul : UL[0];
    this.lastMark = pref.last === 'ul' ? 'ul' : 'hl';
    this.pages = [];
    this.walkList = []; this.walkI = 0; this.walking = false;
    this.stats = null;
    this.dead = false;
    this.build();
  }

  /* ---------------- frame ---------------- */
  build() {
    const r = this.root = el('div', 'rd');
    r.innerHTML = `
      <header class="rd-top">
        <button class="ib rd-back" aria-label="책장으로">${ICON.back}<span>책장</span></button>
        <div class="rd-title"><b></b></div>
        <div class="rd-acts">
          <button class="ib" data-a="search" aria-label="찾기">${ICON.search}</button>
          <button class="ib" data-a="panel" aria-label="목차와 밑줄">${ICON.list}</button>
          <button class="ib" data-a="share" aria-label="내려받기와 인쇄">${ICON.share}</button>
        </div>
      </header>
      <div class="rd-find" hidden>
        <input type="search" placeholder="이 문서에서 찾기" enterkeyhint="search" autocomplete="off">
        <span class="rd-find-n"></span>
        <button class="ib" data-a="prev" aria-label="이전">${ICON.up}</button>
        <button class="ib" data-a="next" aria-label="다음">${ICON.down}</button>
        <button class="ib" data-a="closefind" aria-label="닫기">${ICON.close}</button>
        <div class="rd-find-list" hidden></div>
      </div>
      <div class="rd-body">
        <div class="rd-scroll" tabindex="0"><div class="rd-pages"></div></div>
        <aside class="rd-panel" hidden>
          <div class="seg"><button data-tab="toc" class="on">목차</button><button data-tab="marks">밑줄</button></div>
          <div class="rd-panel-in"></div>
        </aside>
      </div>
      <div class="rd-tools" role="toolbar" aria-label="도구">
        <button data-tool="read" class="on" aria-label="읽기">${ICON.read}<span>읽기</span></button>
        <button data-tool="hl" aria-label="형광펜">${ICON.hl}<span>형광펜</span><i class="dot"></i></button>
        <button data-tool="ul" aria-label="밑줄">${ICON.ul}<span>밑줄</span><i class="dot"></i></button>
        <button data-walk aria-label="표시한 곳만 넘겨 보기">${ICON.walk}<span>넘겨 보기</span></button>
        <div class="rd-colors" hidden></div>
      </div>
      <div class="rd-walk" role="toolbar" aria-label="표시한 곳만 넘겨 보기" hidden>
        <button type="button" class="wb" data-w="prev" aria-label="이전">${ICON.prev}</button>
        <span class="wn" aria-live="polite"></span>
        <button type="button" class="wb" data-w="next" aria-label="다음">${ICON.next}</button>
        <div class="wcolors"></div>
        <span class="wsep"></span>
        <button type="button" class="wb" data-w="stop" aria-label="끝내기">${ICON.close}</button>
      </div>
      <div class="rd-ind">
        <button class="ib rd-zoom" data-a="zout" aria-label="작게">${ICON.minus}</button>
        <button class="rd-pg" data-a="jump"></button>
        <button class="ib rd-zoom" data-a="zin" aria-label="크게">${ICON.plus}</button>
      </div>
      <div class="rd-pop" hidden></div>
      <div class="rd-note" hidden></div>`;
    this.host.appendChild(r);
    this.$ = (s) => r.querySelector(s);
    this.scroller = this.$('.rd-scroll'); this.pagesEl = this.$('.rd-pages');
    this.$('.rd-title b').textContent = this.o.title || '';
    this.tabs = this.o.tabs || [];
    this.renderTabs();
    this.$('.rd-title').addEventListener('click', (e) => {
      const x = e.target.closest('[data-doc-x]');
      if (x) { e.stopPropagation(); this.o.onTabClose && this.o.onTabClose(x.dataset.docX); return; }
      const t = e.target.closest('[data-doc]');
      if (t && t.dataset.doc !== this.o.id) { this.o.onTab && this.o.onTab(t.dataset.doc); return; }
      if (e.target.closest('.rd-tabcount')) this.o.onTabList && this.o.onTabList();
    });
    this.$('.rd-back').onclick = () => this.o.onClose && this.o.onClose();
    r.querySelector('.rd-acts').onclick = (e) => { const b = e.target.closest('[data-a]'); if (b) this.action(b.dataset.a, b); };
    r.querySelector('.rd-ind').onclick = (e) => { const b = e.target.closest('[data-a]'); if (b) this.action(b.dataset.a, b); };
    r.querySelector('.rd-find').onclick = (e) => { const b = e.target.closest('[data-a]'); if (b) this.action(b.dataset.a, b); const it = e.target.closest('[data-hit]'); if (it) this.gotoHit(Number(it.dataset.hit)); };
    const fin = this.$('.rd-find input');
    fin.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (this.findQ === fin.value.trim() && this.hits && this.hits.length) this.gotoHit((this.hitI + (e.shiftKey ? -1 : 1) + this.hits.length) % this.hits.length); else this.find(fin.value); } if (e.key === 'Escape') this.action('closefind'); });
    fin.addEventListener('input', () => { clearTimeout(this.findT); this.findT = setTimeout(() => this.find(fin.value), 350); });
    this.$('.rd-tools').onclick = (e) => {
      const c = e.target.closest('[data-color]');
      if (c) { this.setColor(c.dataset.color); return; }
      if (e.target.closest('[data-walk]')) { this.walkStart(); return; }
      const b = e.target.closest('[data-tool]'); if (!b) return;
      if (b.dataset.tool === this.tool && b.dataset.tool !== 'read') { this.toggleColors(); return; }
      this.setTool(b.dataset.tool);
    };
    this.$('.rd-panel .seg').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) this.showTab(b.dataset.tab); };
    this.$('.rd-walk').onclick = (e) => {
      const c = e.target.closest('[data-wc]');
      if (c) { const cur = this.walkList[this.walkI]; this.walkColor = this.walkColor === c.dataset.wc ? null : c.dataset.wc; this.walkBuild(); this.walkGo(this.walkNear(cur)); return; }
      const b = e.target.closest('[data-w]'); if (!b) return;
      if (b.dataset.w === 'next') this.walkGo(this.walkI + 1);
      else if (b.dataset.w === 'prev') this.walkGo(this.walkI - 1);
      else this.walkStop();
    };
    this.$('.rd-panel-in').onclick = (e) => this.panelClick(e);
    this.paintTools();
    this.wire();
  }

  async start() {
    const first = await this.doc.getPage(1);
    const vp = first.getViewport({ scale: 1 });
    for (let i = 0; i < this.N; i++) {
      const p = { n: i, w: vp.width, h: vp.height, sized: i === 0, el: el('div', 'pg'), canvas: null, cScale: 0, task: null, tl: null, tlScale: 0, items: null, fn: null, pdfPage: i === 0 ? first : null };
      p.el.dataset.n = i;
      p.el.innerHTML = '<div class="pg-marks"></div><div class="pg-hits"></div>';
      this.pagesEl.appendChild(p.el);
      this.pages.push(p);
    }
    this.endEl = el('div', 'rd-end');
    this.endEl.innerHTML = `<div class="rd-grade" role="group" aria-label="표시">${[1, 2, 3].map((n) => `<button type="button" data-star="${n}" aria-label="별 ${n}개">${gradeSVG(1)}</button>`).join('')}<span class="sep"></span><button type="button" data-star="-2" aria-label="세모">${gradeSVG(-2)}</button><button type="button" data-star="-1" aria-label="엑스">${gradeSVG(-1)}</button></div>`;
    this.endEl.onclick = (e) => { const b = e.target.closest('[data-star]'); if (!b) return; const n = Number(b.dataset.star); const v = n === this.stars ? 0 : n; this.setStars(v); this.o.onRate && this.o.onRate(v); };   // the same choice again clears it
    this.pagesEl.appendChild(this.endEl);
    this.setStars(this.o.stars || 0);
    this.layout();
    this.drawAllMarks();
    const to = this.o.at || {};
    this.scrollToPage(clamp(to.page || 0, 0, this.N - 1), to.y || 0, false);
    this.update();
    if (!matchMedia('(pointer: coarse)').matches) this.scroller.focus({ preventScroll: true });
    this.stats = null;
    this.sampleStats();
    if (to.query) { this.action('search'); this.$('.rd-find input').value = to.query; this.find(to.query, to.page); }
    if (to.mark) { const mk = this.allMarks.find((m) => m.id === to.mark && !m.del && m.rects); if (mk) { this.scrollToPage(mk.p, mk.rects[0][1], false); this.flash(mk.id); } }
    this.loadOutline();
  }

  setIndex(index) {
    if (!index || this.dead) return;
    this.texts = index.pages || this.texts;
    if (index.labels && index.labels.confident) { this.labels = index.labels; this.updateInd(); }
    if (index.outline && index.outline.length && (!this.outline || !this.outline.length || this.outline === this.outlineData)) { this.outlineData = index.outline; this.outline = index.outline; if (!this.$('.rd-panel').hidden && this.tab === 'toc') this.showTab('toc'); }
    if (!this.$('.rd-panel').hidden && this.tab === 'marks') this.showTab('marks');
  }

  async sampleStats() {
    try {
      const sample = [];
      for (let i = 0; i < Math.min(this.N, 6); i++) sample.push((await pageItems(this.doc, i)).page);
      this.stats = this.A.docStats(sample);
      if (!this.labels.confident && !this.o.index) {   // no stored numbering (older upload): read it from the first pages
        const more = sample.slice();
        for (let i = more.length; i < Math.min(this.N, 14); i++) more.push((await pageItems(this.doc, i)).page);
        const l = this.A.pageLabels(more);
        if (l && l.confident) { this.labels = l; this.updateInd(); }
      }
      for (const p of this.pages) if (p.tl && !p.fn) this.footnotesFor(p);
    } catch (e) { /* the reader works without it */ }
  }

  /* ---------------- geometry ---------------- */
  fitScale() {
    const cw = this.scroller.clientWidth - 2 * (this.scroller.clientWidth > 700 ? 28 : 10);
    const maxW = Math.max(...this.pages.slice(0, 20).map((p) => p.w));
    return Math.max(0.2, Math.min(cw, 980) / maxW);
  }
  layout() {
    this.base = this.fitScale();
    this.scale = this.base * this.zoom;
    let y = GAP;
    for (const p of this.pages) {
      p.cw = Math.round(p.w * this.scale); p.ch = Math.round(p.h * this.scale);
      p.top = y; y += p.ch + GAP;
      p.el.style.width = p.cw + 'px'; p.el.style.height = p.ch + 'px';
      p.el.style.setProperty('--scale-factor', this.scale);
    }
    if (this.endEl) { this.endEl.style.width = Math.min(520, Math.max(...this.pages.map((p) => p.cw))) + 'px'; y += END_H; }
    this.pagesEl.style.height = y + 'px';
    this.pagesEl.style.width = Math.max(...this.pages.map((p) => p.cw)) + 2 * (this.scroller.clientWidth > 700 ? 28 : 10) + 'px';
  }
  pageAtY(y) {
    let lo = 0, hi = this.N - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.pages[mid].top <= y) lo = mid; else hi = mid - 1; }
    return lo;
  }
  current() {
    if (!this.pages.length) return { page: 0, y: 0 };
    const s = this.scroller, mid = s.scrollTop + s.clientHeight * 0.3;
    const i = this.pageAtY(mid); const p = this.pages[i];
    return { page: i, y: clamp((s.scrollTop - p.top) / p.ch, 0, 1), o: this.labelOff() };
  }
  labelOff() { return this.labels && this.labels.confident && this.labels.offset != null ? this.labels.offset : null; }
  scrollToPage(n, y = 0, smooth = true) {
    const p = this.pages[n]; if (!p) return;
    const top = p.top + y * p.ch - (y ? this.scroller.clientHeight * 0.3 : GAP);
    this.scroller.scrollTo({ top: Math.max(0, top), behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
  }

  async ensureSize(p) {
    if (p.sized) return;
    p.pdfPage = p.pdfPage || await this.doc.getPage(p.n + 1);
    const vp = p.pdfPage.getViewport({ scale: 1 });
    p.sized = true;
    if (Math.abs(vp.width - p.w) > 0.5 || Math.abs(vp.height - p.h) > 0.5) {
      const before = this.scroller.scrollTop, above = p.top < before;
      const oldH = p.ch;
      p.w = vp.width; p.h = vp.height;
      this.layout();
      if (above) this.scroller.scrollTop = before + (p.ch - oldH);
      for (const q of this.pages) if (q.cScale) q.cScale = -1;   // sizes moved: redraw
    }
  }

  /* ---------------- rendering ---------------- */
  update() {
    if (this.dead || !this.pages.length) return;
    const s = this.scroller;
    const a = this.pageAtY(Math.max(0, s.scrollTop - 10)), b = this.pageAtY(s.scrollTop + s.clientHeight + 10);
    for (let i = 0; i < this.N; i++) {
      const p = this.pages[i];
      if (i >= a - KEEP && i <= b + KEEP) { if (i >= a - 1 && i <= b + 1) this.render(p); }
      else this.release(p);
    }
    this.updateInd();
  }
  async render(p) {
    const want = this.scale;
    if (p.cScale === want || p.busy) return;
    p.busy = true;
    try {
      await this.ensureSize(p);
      if (this.dead) return;
      const scale = this.scale;
      p.pdfPage = p.pdfPage || await this.doc.getPage(p.n + 1);
      const vpCss = p.pdfPage.getViewport({ scale });
      let ratio = Math.min(window.devicePixelRatio || 1, 2);
      const area = vpCss.width * vpCss.height * ratio * ratio;
      if (area > MAX_PIXELS) ratio *= Math.sqrt(MAX_PIXELS / area);
      const vp = p.pdfPage.getViewport({ scale: scale * ratio });
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      c.className = 'pg-canvas';
      const ctx = c.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      if (p.task) { try { p.task.cancel(); } catch (e) { /* ignore */ } }
      const pdfjs = await lib();
      p.task = p.pdfPage.render({ canvasContext: ctx, viewport: vp, annotationMode: pdfjs.AnnotationMode.ENABLE });
      await p.task.promise;
      p.task = null;
      if (this.dead || scale !== this.scale) { c.width = c.height = 0; return; }
      if (p.canvas) { p.canvas.width = p.canvas.height = 0; p.canvas.remove(); }
      p.el.insertBefore(c, p.el.firstChild);
      p.canvas = c; p.cScale = scale;
      p.el.classList.add('ready');
      await this.textLayer(p, scale);
    } catch (e) {
      if (!(e && e.name === 'RenderingCancelledException')) console.warn('render', p.n, e);
    } finally { p.busy = false; if (!this.dead && p.cScale !== this.scale && this.isNear(p)) this.render(p); }
  }
  isNear(p) {
    const s = this.scroller;
    return p.top < s.scrollTop + s.clientHeight * 2 && p.top + p.ch > s.scrollTop - s.clientHeight;
  }
  async textLayer(p, scale) {
    if (p.tl && p.tlScale === scale) return;
    const pdfjs = await lib();
    if (!p.items) { const r = await pageItems(this.doc, p.n, p.pdfPage); p.items = r.page; p.tc = r.textContent; }
    if (this.dead) return;
    const lines = this.ocr && this.ocr[p.n];
    let div;
    if (lines && lines.length) div = this.ocrLayer(p, lines);   // a scanned page: its read words, laid where they are on the picture
    else {
      div = el('div', 'textLayer');
      const tl = new pdfjs.TextLayer({ textContentSource: p.tc, container: div, viewport: p.pdfPage.getViewport({ scale }) });
      await tl.render();
    }
    if (this.dead || scale !== this.scale) return;
    if (p.tl) p.tl.remove();
    p.el.appendChild(div);
    p.tl = div; p.tlScale = scale;
    if (this.stats && !p.fn) this.footnotesFor(p);
    if (this.findQ) this.paintHits(p);
  }
  // invisible words over a scanned page, each stretched to its place on the picture, so selecting, marking and 찾기 work as on any page
  ocrLayer(p, lines) {
    const div = el('div', 'textLayer ocr');
    const W = p.cw, H = p.ch;
    const ctx = ocrMeasure || (ocrMeasure = document.createElement('canvas').getContext('2d'));
    for (const [, y0, , y1, words] of lines) {
      const fs = Math.max(4, (y1 - y0) * H * 0.9);
      ctx.font = `${fs}px sans-serif`;
      words.forEach(([a, b, w], i) => {
        const last = i === words.length - 1;
        const text = last ? w : w + ' ';
        const right = last ? b : Math.max(b, words[i + 1][0]);
        const sp = document.createElement('span');
        sp.textContent = text;
        const nat = ctx.measureText(text).width || 1;
        sp.style.cssText = `left:${(a * 100).toFixed(3)}%;top:${(y0 * 100).toFixed(3)}%;font-size:${fs.toFixed(2)}px;font-family:sans-serif;transform:scaleX(${(Math.max(1, (right - a) * W) / nat).toFixed(4)})`;
        div.appendChild(sp);
      });
      div.appendChild(document.createElement('br'));
    }
    div.appendChild(el('div', 'endOfContent'));
    return div;
  }
  // the words of a scan arrived while it is open: lay them on the pages already drawn
  setOcr(pages, index) {
    if (this.dead) return;
    this.ocr = pages || null;
    if (index) { this.texts = null; this.setIndex(index); }
    for (const p of this.pages) {
      if (!p.tl || !this.ocr || !this.ocr[p.n]) continue;
      p.tl.remove(); p.tl = null; p.tlScale = 0;
      if (p.cScale) this.textLayer(p, this.scale);
    }
  }
  release(p) {
    if (p.task) { try { p.task.cancel(); } catch (e) { /* ignore */ } p.task = null; }
    if (p.canvas) { p.canvas.width = p.canvas.height = 0; p.canvas.remove(); p.canvas = null; }
    if (p.tl) { p.tl.remove(); p.tl = null; p.tlScale = 0; }
    p.cScale = 0; p.el.classList.remove('ready');
    if (p.pdfPage && Math.abs(p.n - this.current().page) > 6) { p.pdfPage.cleanup(); }
  }

  /* ---------------- footnotes ---------------- */
  footnotesFor(p) {
    try { p.fn = this.A.footnotes(p.items, this.stats); } catch (e) { p.fn = { notes: [], refs: [] }; }
    const layer = p.el.querySelector('.pg-marks');
    layer.querySelectorAll('.fn-ref').forEach((x) => x.remove());
    for (const r of p.fn.refs || []) {
      const d = el('i', 'fn-ref');
      d.style.left = (100 * r.x / p.w) + '%'; d.style.top = (100 * (r.y + r.h) / p.h) + '%'; d.style.width = (100 * r.w / p.w) + '%';
      layer.appendChild(d);
    }
  }
  async noteAt(p, no) {
    const own = (p.fn && p.fn.notes || []).find((x) => x.no === no);
    if (!own) return null;
    let text = own.text;
    // a note that runs onto the next page: its continuation is that page's unnumbered first footnote lines
    const last = (p.fn.notes || []).filter((x) => x.no != null).slice(-1)[0];
    if (last && last.no === no && p.n + 1 < this.N) {
      try {
        const nx = this.pages[p.n + 1];
        if (!nx.items) { const r = await pageItems(this.doc, nx.n); nx.items = r.page; nx.tc = r.textContent; nx.pdfPage = r.pdfPage; }
        const f = this.A.footnotes(nx.items, this.stats, { prevLastNo: no });
        const cont = (f.notes || []).find((x) => x.cont);
        if (cont && cont.text) text += ' ' + cont.text;
      } catch (e) { /* the note as far as this page goes */ }
    }
    return text;
  }

  /* ---------------- marks ---------------- */
  // several papers open at once: one tab each; on a phone only a count that opens the list
  setTabs(tabs) { this.tabs = tabs || []; this.renderTabs(); }
  renderTabs() {
    const box = this.$('.rd-title'), tabs = this.tabs;
    if (!box) return;
    if (tabs.length < 2) {   // one paper: its name, and the same × as a tab has (closes it and goes back to the shelf)
      box.innerHTML = `<b>${esc(this.o.title || '')}</b><button type="button" class="rd-close1" data-doc-x="${this.o.id}" aria-label="이 문서 닫기" title="닫기">${ICON.close}</button>`;
      box.classList.remove('has-tabs'); box.classList.add('one'); return;
    }
    box.classList.remove('one'); box.classList.add('has-tabs');
    if (this.root.clientWidth < 600) {
      box.innerHTML = `<b>${esc(this.o.title || '')}</b><button type="button" class="rd-tabcount" aria-label="열린 문서 ${tabs.length}개">${tabs.length}</button>`;
      return;
    }
    box.innerHTML = `<div class="rd-tabs" role="tablist">${tabs.map((t) => `<button type="button" role="tab" data-doc="${t.id}" class="${t.id === this.o.id ? 'on' : ''}" aria-selected="${t.id === this.o.id}" title="${esc(t.title)}"><span>${esc(t.title)}</span><i class="x" data-doc-x="${t.id}" role="button" aria-label="닫기">${ICON.close}</i></button>`).join('')}</div>`;
    const on = box.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  setStars(v) {
    this.stars = v;
    if (!this.endEl) return;
    this.endEl.querySelectorAll('[data-star]').forEach((b) => { const n = Number(b.dataset.star); const on = n < 0 ? v === n : v > 0 && n <= v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    // the same mark on the first page, top right, as on the printed cover
    const p0 = this.pages[0];
    if (p0) { let c = p0.el.querySelector('.pg-cover'); if (!c) { c = el('div', 'pg-cover'); p0.el.appendChild(c); } c.innerHTML = gradeSVG(v); c.dataset.g = v; }
  }
  /* ---------------- only the marked passages, one after another ---------------- */
  walkStart() {
    if (!this.marks().length) { this.o.toast && this.o.toast('아직 표시한 곳이 없습니다'); return; }
    this.setTool('read'); this.hidePop();
    this.walking = true; this.walkColor = null;
    this.root.classList.add('walking'); this.$('.rd-walk').hidden = false;
    this.walkBuild();
    const c = this.current();
    const i = this.walkList.findIndex((m) => m.p > c.page || (m.p === c.page && m.rects[0][1] >= c.y - 0.02));
    this.walkGo(i < 0 ? 0 : i);
  }
  walkBuild() {
    const order = (a, b) => a.p - b.p || a.rects[0][1] - b.rects[0][1] || a.rects[0][0] - b.rects[0][0];
    const all = this.marks().sort(order);
    const kinds = [...new Set(all.map((m) => m.kind + m.color))];
    if (this.walkColor && !kinds.includes(this.walkColor)) this.walkColor = null;
    this.walkList = this.walkColor ? all.filter((m) => m.kind + m.color === this.walkColor) : all;
    this.$('.rd-walk .wcolors').innerHTML = kinds.length > 1 ? kinds.map((k) => { const ul = k.startsWith('ul'), c = k.slice(2); return `<button type="button" data-wc="${k}" class="${this.walkColor === k ? 'on' : ''}" style="--c:${c}" aria-label="${ul ? '이 색 밑줄만' : '이 색 형광펜만'}" aria-pressed="${this.walkColor === k}"><i class="${ul ? 'uw' : 'sw'}"></i></button>`; }).join('') : '';
  }
  walkNear(cur) {   // after the filter changes: the first mark at or after the one in view
    if (!cur) return 0;
    const i = this.walkList.findIndex((m) => m.p > cur.p || (m.p === cur.p && m.rects[0][1] >= cur.rects[0][1]));
    return i < 0 ? this.walkList.length - 1 : i;
  }
  walkGo(i) { this.walkShow(i, true); }
  walkShow(i, move) {
    const n = this.walkList.length; if (!n) return;
    this.walkI = clamp(i, 0, n - 1);
    const m = this.walkList[this.walkI];
    if (move) { this.scrollToPage(m.p, m.rects[0][1], true); this.flash(m.id); }
    this.$('.rd-walk .wn').innerHTML = `<b>${this.walkI + 1} / ${n}</b><small>${esc(this.label(m.p))}${this.unit()}</small>`;
    this.$('.rd-walk [data-w="prev"]').disabled = this.walkI === 0;
    this.$('.rd-walk [data-w="next"]').disabled = this.walkI === n - 1;
  }
  walkStop() { this.walking = false; this.root.classList.remove('walking'); this.$('.rd-walk').hidden = true; }

  // opened from the list with a saved place: continue there, or go back to the first page
  askResume(label) {
    const box = el('div', 'rd-resume');
    box.innerHTML = `<button type="button" class="go-on">이어 읽기 <em>${esc(label)}</em></button><button type="button" class="from-start">처음부터</button>`;
    this.root.appendChild(box);
    const done = () => { box.remove(); this.scroller.removeEventListener('scroll', onScroll); };
    const start = this.scroller.scrollTop;
    const onScroll = () => { if (Math.abs(this.scroller.scrollTop - start) > 240) done(); };
    setTimeout(() => this.scroller.addEventListener('scroll', onScroll, { passive: true }), 900);
    box.querySelector('.go-on').onclick = done;
    box.querySelector('.from-start').onclick = () => { done(); this.scrollToPage(0, 0, false); };
    this.resumeBox = box;
  }
  marks() { return this.allMarks.filter((m) => !m.del); }
  drawAllMarks() { for (const p of this.pages) this.drawMarks(p); }
  drawMarks(p) {
    const layer = p.el.querySelector('.pg-marks');
    layer.querySelectorAll('.mk').forEach((x) => x.remove());
    for (const m of this.marks()) {
      if (m.p !== p.n) continue;
      for (const r of m.rects) {
        const d = el('i', 'mk ' + m.kind);
        d.dataset.id = m.id;
        d.style.left = (r[0] * 100) + '%'; d.style.top = (r[1] * 100) + '%'; d.style.width = (r[2] * 100) + '%'; d.style.height = (r[3] * 100) + '%';
        d.style.setProperty('--c', m.color);
        layer.appendChild(d);
      }
    }
  }
  changed() {
    if (this.walking) { const cur = this.walkList[this.walkI]; this.walkBuild(); if (this.walkList.length) this.walkShow(Math.max(0, this.walkList.findIndex((m) => cur && m.id === cur.id)), false); else this.walkStop(); }
    for (const p of this.pages) this.drawMarks(p);
    if (!this.$('.rd-panel').hidden && this.tab === 'marks') this.showTab('marks');
    this.o.onMarks && this.o.onMarks(this.allMarks.slice());
  }
  addMarks(list) {
    if (!list.length) return;
    this.allMarks.push(...list);
    this.lastMark = list[0].kind;
    this.o.onPrefs && this.o.onPrefs({ hl: this.hlColor, ul: this.ulColor, last: this.lastMark });
    this.changed();
  }
  setMark(id, patch) {
    const m = this.allMarks.find((x) => x.id === id); if (!m) return;
    Object.assign(m, patch, { t: Date.now() });
    this.changed();
  }
  deleteMark(id) {
    const i = this.allMarks.findIndex((x) => x.id === id); if (i < 0) return;
    this.allMarks[i] = { id, del: true, t: Date.now() };
    this.changed();
  }
  setRemoteMarks(list) {   // a newer copy arrived from the server
    this.allMarks = list.slice();
    for (const p of this.pages) this.drawMarks(p);
    if (!this.$('.rd-panel').hidden && this.tab === 'marks') this.showTab('marks');
  }

  // Text range -> one mark per page (boxes merged line by line)
  marksFromRange(range, kind, color) {
    const out = [];
    for (const p of this.pages) {
      if (!p.tl || !range.intersectsNode(p.tl)) continue;
      const sub = document.createRange();
      const lr = document.createRange(); lr.selectNodeContents(p.tl);
      if (range.compareBoundaryPoints(Range.START_TO_START, lr) > 0) sub.setStart(range.startContainer, range.startOffset); else sub.setStart(lr.startContainer, lr.startOffset);
      if (range.compareBoundaryPoints(Range.END_TO_END, lr) < 0) sub.setEnd(range.endContainer, range.endOffset); else sub.setEnd(lr.endContainer, lr.endOffset);
      const rects = this.rectsFor(sub, p);
      const raw = sub.toString();
      const text = this.clean(raw);
      if (!rects.length || !text.trim()) continue;
      out.push({ id: uid(), p: p.n, kind, color, rects, text, t: Date.now() });
    }
    return out;
  }
  clean(s) { try { return this.A.cleanCopy(s); } catch (e) { return String(s).replace(/\s+/g, ' ').trim(); } }
  rectsFor(range, p) {
    const pr = p.el.getBoundingClientRect();
    const boxes = [];
    for (const r of range.getClientRects()) {
      if (r.width < 0.5 || r.height < 0.5) continue;
      const x0 = Math.max(r.left, pr.left), x1 = Math.min(r.right, pr.right), y0 = Math.max(r.top, pr.top), y1 = Math.min(r.bottom, pr.bottom);
      if (x1 - x0 < 0.5 || y1 - y0 < 0.5) continue;
      boxes.push({ x0, x1, y0, y1 });
    }
    // drop boxes wholly inside another (some engines report a span and its text both)
    const kept = boxes.filter((b, i) => !boxes.some((o, j) => j !== i && o.x0 <= b.x0 + 0.5 && o.x1 >= b.x1 - 0.5 && o.y0 <= b.y0 + 0.5 && o.y1 >= b.y1 - 0.5 && (o.x1 - o.x0) * (o.y1 - o.y0) > (b.x1 - b.x0) * (b.y1 - b.y0) + 0.01));
    kept.sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2 || a.x0 - b.x0);
    const lines = [];
    for (const b of kept) {
      const h = b.y1 - b.y0, cy = (b.y0 + b.y1) / 2;
      const line = lines.find((l) => Math.abs(l.cy - cy) < Math.max(3, Math.min(h, l.h) * 0.5) && b.x0 - l.x1 < Math.max(h, l.h) * 3 && l.x0 - b.x1 < Math.max(h, l.h) * 3);
      if (line) { line.x0 = Math.min(line.x0, b.x0); line.x1 = Math.max(line.x1, b.x1); line.y0 = Math.min(line.y0, b.y0); line.y1 = Math.max(line.y1, b.y1); line.h = line.y1 - line.y0; line.cy = (line.y0 + line.y1) / 2; }
      else lines.push({ x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, h, cy });
    }
    const W = pr.width, H = pr.height;
    return lines.map((l) => [(l.x0 - pr.left) / W, (l.y0 - pr.top) / H, (l.x1 - l.x0) / W, (l.y1 - l.y0) / H].map((v) => Math.round(v * 1e5) / 1e5));
  }
  markAt(p, x, y) {   // x, y as fractions of the page
    const ms = this.marks().filter((m) => m.p === p.n);
    for (let i = ms.length - 1; i >= 0; i--) {
      for (const r of ms[i].rects) {
        const padX = 2 / p.cw, padY = 3 / p.ch;
        if (x >= r[0] - padX && x <= r[0] + r[2] + padX && y >= r[1] - padY && y <= r[1] + r[3] + padY) return ms[i];
      }
    }
    return null;
  }

  /* ---------------- tools ---------------- */
  setTool(t) {
    this.tool = t;
    this.root.classList.toggle('marking', t !== 'read');
    this.paintTools();
    this.$('.rd-colors').hidden = true;
    if (t !== 'read') { this.lastMark = t; this.o.onPrefs && this.o.onPrefs({ hl: this.hlColor, ul: this.ulColor, last: t }); }
    this.hidePop();
    window.getSelection().removeAllRanges();
  }
  setColor(c) {
    if (this.tool === 'ul') this.ulColor = c; else this.hlColor = c;
    this.$('.rd-colors').hidden = true;
    this.paintTools();
    this.o.onPrefs && this.o.onPrefs({ hl: this.hlColor, ul: this.ulColor, last: this.lastMark });
  }
  toggleColors() {
    const box = this.$('.rd-colors');
    const list = this.tool === 'ul' ? UL : HL, cur = this.tool === 'ul' ? this.ulColor : this.hlColor;
    const names = this.tool === 'ul' ? UL_NAMES : HL_NAMES;
    box.innerHTML = list.map((c, i) => `<button data-color="${c}" class="${c === cur ? 'on' : ''}" style="--c:${c}" aria-label="${names[i]}"><i></i></button>`).join('');
    box.dataset.kind = this.tool;
    box.hidden = !box.hidden;
  }
  paintTools() {
    for (const b of this.root.querySelectorAll('.rd-tools [data-tool]')) {
      b.classList.toggle('on', b.dataset.tool === this.tool);
      const d = b.querySelector('.dot'); if (d) d.style.background = b.dataset.tool === 'ul' ? this.ulColor : this.hlColor;
    }
  }

  /* ---------------- input ---------------- */
  wire() {
    const s = this.scroller;
    let raf = 0;
    s.addEventListener('scroll', () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; this.update(); });
      clearTimeout(this.posT); this.posT = setTimeout(() => this.o.onPosition && this.o.onPosition(this.current()), 700);
    }, { passive: true });
    this.ro = new ResizeObserver(() => { if (this.tabs && this.tabs.length > 1) { const narrow = this.root.clientWidth < 600; if (narrow !== this.tabsNarrow) { this.tabsNarrow = narrow; this.renderTabs(); } } if (!this.pages.length || this.dead) return; const c = this.current(); const z = this.zoom; this.layout(); for (const p of this.pages) p.cScale = -1; this.zoom = z; this.scrollToPage(c.page, c.y, false); this.update(); });
    this.ro.observe(s);

    // Pencil: no scrolling or system selection with the stylus — it marks
    s.addEventListener('touchstart', (e) => { if (e.target.closest && e.target.closest('.rd-end')) return; if ([...e.changedTouches].some((t) => t.touchType === 'stylus')) e.preventDefault(); }, { passive: false });
    s.addEventListener('touchmove', (e) => { if ([...e.changedTouches].some((t) => t.touchType === 'stylus')) e.preventDefault(); }, { passive: false });

    s.addEventListener('pointerdown', (e) => { const tl = e.target.closest && e.target.closest('.textLayer'); if (tl && this.tool === 'read' && e.pointerType !== 'pen') { this.root.querySelectorAll('.textLayer.selecting').forEach((x) => x.classList.remove('selecting')); tl.classList.add('selecting'); } this.down(e); });
    this.onUpSel = () => setTimeout(() => this.root.querySelectorAll('.textLayer.selecting').forEach((x) => x.classList.remove('selecting')), 0);
    document.addEventListener('pointerup', this.onUpSel, true);
    s.addEventListener('pointermove', (e) => this.move(e));
    s.addEventListener('pointerup', (e) => this.up(e));
    s.addEventListener('pointercancel', () => this.cancelDrag());

    // two fingers: scroll while a marking tool is on; pinch zooms in every mode
    s.addEventListener('touchstart', (e) => this.twoStart(e), { passive: false });
    s.addEventListener('touchstart', (e) => { this.swipe = this.walking && e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null; }, { passive: true });
    s.addEventListener('touchend', (e) => {
      const w = this.swipe; this.swipe = null;
      if (!w || !this.walking || e.changedTouches.length !== 1) return;
      const dx = e.changedTouches[0].clientX - w.x, dy = e.changedTouches[0].clientY - w.y;
      if (Date.now() - w.t < 700 && Math.abs(dx) > 50 && Math.abs(dx) > 1.6 * Math.abs(dy) && s.scrollWidth <= s.clientWidth + 2) this.walkGo(this.walkI + (dx < 0 ? 1 : -1));
    }, { passive: true });
    s.addEventListener('touchmove', (e) => this.twoMove(e), { passive: false });
    s.addEventListener('touchend', (e) => this.twoEnd(e));
    s.addEventListener('touchcancel', (e) => this.twoEnd(e));
    // Safari's own pinch gesture events: stop the page from zooming as a whole
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) s.addEventListener(t, (e) => e.preventDefault());
    // trackpads and ctrl+wheel
    s.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      this.zoomBy(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    }, { passive: false });

    this.onSel = () => { clearTimeout(this.selT); this.selT = setTimeout(() => this.selection(), 180); };
    document.addEventListener('selectionchange', this.onSel);
    this.onKey = (e) => this.key(e);
    document.addEventListener('keydown', this.onKey);
    this.onDocDown = (e) => { if (!e.target.closest('.rd-pop, .rd-note, .rd-colors, .rd-tools')) { if (!this.drag) { this.$('.rd-colors').hidden = true; } } };
    document.addEventListener('pointerdown', this.onDocDown, true);
  }

  // caret position under a point, inside a page's text layer (snapping to the nearest letter when between them)
  caretAt(x, y) {
    let node = null, offset = 0;
    if (document.caretPositionFromPoint) { const c = document.caretPositionFromPoint(x, y); if (c) { node = c.offsetNode; offset = c.offset; } }
    else if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; offset = r.startOffset; } }
    if (node && node.nodeType === 3 && node.parentElement && node.parentElement.closest('.textLayer') && this.root.contains(node)) return { node, offset };
    const pgEl = document.elementsFromPoint(x, y).map((e) => e.closest && e.closest('.pg')).find(Boolean);
    const p = pgEl ? this.pages[Number(pgEl.dataset.n)] : null;
    if (!p || !p.tl) return null;
    let best = null, bd = Infinity;
    for (const sp of p.tl.querySelectorAll('span')) {
      if (!sp.firstChild || sp.firstChild.nodeType !== 3 || !sp.textContent.trim()) continue;
      const r = sp.getBoundingClientRect(); if (!r.width) continue;
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const d = dy * 4 + dx;   // prefer the same line
      if (d < bd) { bd = d; best = { sp, r }; }
    }
    if (!best || bd > 120) return null;
    const t = best.sp.firstChild;
    if (x <= best.r.left) return { node: t, offset: 0 };
    if (x >= best.r.right) return { node: t, offset: t.length };
    let lo = 0, hi = t.length; const rg = document.createRange();
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      rg.setStart(t, mid); rg.setEnd(t, mid + 1);
      const b = rg.getBoundingClientRect();
      if ((b.left + b.right) / 2 < x) lo = mid + 1; else hi = mid;
    }
    return { node: t, offset: lo };
  }
  rangeBetween(a, b) {
    const r = document.createRange();
    const pos = a.node.compareDocumentPosition(b.node);
    const before = a.node === b.node ? a.offset <= b.offset : !!(pos & Node.DOCUMENT_POSITION_FOLLOWING);
    const [s, e] = before ? [a, b] : [b, a];
    r.setStart(s.node, s.offset); r.setEnd(e.node, e.offset);
    return r;
  }

  down(e) {
    if (e.target.closest && e.target.closest('.rd-end')) return;
    this.tapStart = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
    if (e.button && e.button !== 0) return;
    const pen = e.pointerType === 'pen';
    if (this.two) return;
    if (!pen && this.tool === 'read') return;
    if (!e.isPrimary) return;
    const kind = pen && this.tool === 'read' ? this.lastMark : this.tool;
    this.drag = { kind, color: kind === 'ul' ? this.ulColor : this.hlColor, start: this.caretAt(e.clientX, e.clientY), cur: null, moved: false, pid: e.pointerId, x: e.clientX, y: e.clientY, pointerType: e.pointerType };
    try { this.scroller.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (e.pointerType !== 'touch') e.preventDefault();   // no system text selection while marking
    this.hidePop();
  }
  move(e) {
    const d = this.drag; if (!d || e.pointerId !== d.pid) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
    d.moved = true;
    e.preventDefault();
    d.lastX = e.clientX; d.lastY = e.clientY;
    const c = this.caretAt(e.clientX, e.clientY);
    if (!d.start) { d.start = c; return; }
    if (c) d.cur = c;
    this.preview();
    this.autoScroll();
  }
  preview() {
    const d = this.drag; if (!d || !d.start || !d.cur) return;
    this.clearPreview();
    let range; try { range = this.rangeBetween(d.start, d.cur); } catch (e) { return; }
    for (const p of this.pages) {
      if (!p.tl || !range.intersectsNode(p.tl)) continue;
      const tmp = this.marksFromRange(range, d.kind, d.color).filter((m) => m.p === p.n);
      const layer = p.el.querySelector('.pg-marks');
      for (const m of tmp) for (const r of m.rects) {
        const x = el('i', 'mk pre ' + d.kind);
        x.style.left = (r[0] * 100) + '%'; x.style.top = (r[1] * 100) + '%'; x.style.width = (r[2] * 100) + '%'; x.style.height = (r[3] * 100) + '%';
        x.style.setProperty('--c', d.color);
        layer.appendChild(x);
      }
    }
    d.range = range;
  }
  clearPreview() { this.root.querySelectorAll('.mk.pre').forEach((x) => x.remove()); }
  autoScroll() {
    if (this.asRaf) return;
    const step = () => {
      const d = this.drag; if (!d || !d.moved) { this.asRaf = 0; return; }
      const r = this.scroller.getBoundingClientRect(), edge = 56;
      let v = 0;
      if (d.lastY < r.top + edge) v = -(r.top + edge - d.lastY) / 3; else if (d.lastY > r.bottom - edge) v = (d.lastY - (r.bottom - edge)) / 3;
      if (v) { this.scroller.scrollTop += v; const c = this.caretAt(d.lastX, d.lastY); if (c) { d.cur = c; this.preview(); } this.asRaf = requestAnimationFrame(step); }
      else this.asRaf = 0;
    };
    this.asRaf = requestAnimationFrame(step);
  }
  up(e) {
    const d = this.drag;
    const ts = this.tapStart;
    const isTap = ts && e.pointerId === ts.id && Math.hypot(e.clientX - ts.x, e.clientY - ts.y) < 6 && Date.now() - ts.t < 600;
    if (d && e.pointerId === d.pid) {
      this.drag = null;
      try { this.scroller.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (d.moved && d.range) {
        const list = this.marksFromRange(d.range, d.kind, d.color);
        this.clearPreview();
        this.addMarks(list);
        return;
      }
      this.clearPreview();
    }
    if (isTap && !this.two) this.tap(e.clientX, e.clientY);
  }
  cancelDrag() { this.drag = null; this.clearPreview(); }

  tap(x, y) {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const pgEl = document.elementsFromPoint(x, y).map((e) => e.closest && e.closest('.pg')).find(Boolean);
    if (!pgEl) { this.hidePop(); return; }
    const p = this.pages[Number(pgEl.dataset.n)];
    const pr = pgEl.getBoundingClientRect();
    const fx = (x - pr.left) / pr.width, fy = (y - pr.top) / pr.height;
    const m = this.markAt(p, fx, fy);
    if (m) { this.markPop(m, x, y); return; }
    if (p.fn && p.fn.refs) {
      const px = fx * p.w, py = fy * p.h;
      const r = p.fn.refs.find((r) => px >= r.x - 6 && px <= r.x + r.w + 6 && py >= r.y - 6 && py <= r.y + r.h + 6);
      if (r) { this.notePop(p, r.no, x, y); return; }
    }
    this.hidePop();
  }

  twoStart(e) {
    if (e.touches.length !== 2) return;
    this.cancelDrag();
    const [a, b] = e.touches;
    this.two = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), mx: (a.clientX + b.clientX) / 2, my: (a.clientY + b.clientY) / 2, top: this.scroller.scrollTop, left: this.scroller.scrollLeft, k: 1 };
    e.preventDefault();
  }
  twoMove(e) {
    const t = this.two; if (!t || e.touches.length !== 2) return;
    e.preventDefault();
    const [a, b] = e.touches;
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2;
    const k = d / t.d;
    if (Math.abs(k - 1) > 0.06 || t.pinching) {
      t.pinching = true; t.k = clamp(k, 0.5 / this.zoom, 4 / this.zoom);
      const r = this.scroller.getBoundingClientRect();
      this.pagesEl.style.transformOrigin = `${t.mx - r.left + this.scroller.scrollLeft}px ${t.my - r.top + this.scroller.scrollTop}px`;
      this.pagesEl.style.transform = `translate(${mx - t.mx}px, ${my - t.my}px) scale(${t.k})`;
    } else {
      this.scroller.scrollTop = t.top - (my - t.my);
      this.scroller.scrollLeft = t.left - (mx - t.mx);
    }
  }
  twoEnd(e) {
    const t = this.two; if (!t || (e.touches && e.touches.length >= 2)) return;
    this.two = null;
    if (t.pinching) {
      this.pagesEl.style.transform = ''; this.pagesEl.style.transformOrigin = '';
      this.zoomBy(t.k, t.mx, t.my);
    }
  }
  zoomBy(k, cx, cy) { this.setZoom(this.zoom * k, cx, cy); }
  setZoom(z, cx, cy) {
    z = clamp(Math.round(z * 100) / 100, 0.5, 4);
    if (Math.abs(z - this.zoom) < 0.005) return;
    const s = this.scroller, r = s.getBoundingClientRect();
    const px = (cx ?? r.left + r.width / 2) - r.left, py = (cy ?? r.top + r.height / 2) - r.top;
    const docX = (s.scrollLeft + px) / this.scale, docY = (s.scrollTop + py);
    const pi = this.pageAtY(docY), p = this.pages[pi], within = (docY - p.top) / p.ch;
    this.zoom = z;
    this.layout();
    for (const q of this.pages) q.cScale = q.cScale ? -1 : 0;
    s.scrollTop = p.top + within * p.ch - py;
    s.scrollLeft = docX * this.scale - px;
    this.update();
    this.updateInd();
  }

  key(e) {
    if (!this.root.isConnected) return;
    const inField = e.target && e.target.closest && e.target.closest('input, textarea');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); this.action('search'); return; }
    if (inField) return;
    if (this.walking && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); this.walkGo(this.walkI + 1); return; }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); this.walkGo(this.walkI - 1); return; }
      if (e.key === 'Escape') { this.walkStop(); return; }
    }
    if (e.key === 'Escape') { this.hidePop(); this.$('.rd-colors').hidden = true; return; }
    if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); this.zoomBy(1.15); }
    else if ((e.metaKey || e.ctrlKey) && e.key === '-') { e.preventDefault(); this.zoomBy(1 / 1.15); }
    else if ((e.metaKey || e.ctrlKey) && e.key === '0') { e.preventDefault(); this.setZoom(1); }
  }

  /* ---------------- selection (read tool) ---------------- */
  selection() {
    if (this.drag) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { if (this.popKind === 'sel') this.hidePop(); return; }
    const r = sel.getRangeAt(0);
    if (!this.pagesEl.contains(r.commonAncestorContainer)) return;
    const rect = r.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    this.selRange = r.cloneRange();
    const pop = this.$('.rd-pop');
    pop.innerHTML = `<div class="pop-row">${HL.map((c, i) => `<button data-mk="hl" data-c="${c}" style="--c:${c}" aria-label="형광펜 ${HL_NAMES[i]}"><i class="sw"></i></button>`).join('')}</div>
      <div class="pop-row">${UL.map((c, i) => `<button data-mk="ul" data-c="${c}" style="--c:${c}" aria-label="밑줄 ${UL_NAMES[i]}"><i class="uw"></i></button>`).join('')}
      <span class="sep"></span><button data-act="copy">${ICON.copy}<span>복사</span></button></div>`;
    pop.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.mk) {
        const kind = b.dataset.mk, color = b.dataset.c;
        if (kind === 'ul') this.ulColor = color; else this.hlColor = color;
        this.addMarks(this.marksFromRange(this.selRange, kind, color));
        window.getSelection().removeAllRanges(); this.hidePop(); this.paintTools();
      } else if (b.dataset.act === 'copy') {
        this.copy(this.clean(this.selRange.toString()));
        window.getSelection().removeAllRanges(); this.hidePop();
      }
    };
    this.showPop('sel', rect);
  }
  markPop(m, x, y) {
    const pop = this.$('.rd-pop');
    const list = m.kind === 'ul' ? UL : HL;
    const names = m.kind === 'ul' ? UL_NAMES : HL_NAMES;
    pop.innerHTML = `<div class="pop-row">${list.map((c, i) => `<button data-c="${c}" class="${c === m.color ? 'on' : ''}" style="--c:${c}" aria-label="${names[i]}"><i class="${m.kind === 'ul' ? 'uw' : 'sw'}"></i></button>`).join('')}</div>
      <div class="pop-row"><button data-act="swap">${m.kind === 'ul' ? ICON.hl + '<span>형광펜으로</span>' : ICON.ul + '<span>밑줄로</span>'}</button>
      <button data-act="copy">${ICON.copy}<span>복사</span></button><button data-act="del" class="danger">${ICON.trash}<span>지우기</span></button></div>`;
    pop.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.c) this.setMark(m.id, { color: b.dataset.c });
      else if (b.dataset.act === 'swap') this.setMark(m.id, m.kind === 'ul' ? { kind: 'hl', color: this.hlColor } : { kind: 'ul', color: this.ulColor });
      else if (b.dataset.act === 'copy') this.copy(m.text);
      else if (b.dataset.act === 'del') this.deleteMark(m.id);
      this.hidePop();
    };
    this.showPop('mark', { left: x - 1, right: x + 1, top: y - 10, bottom: y + 10, width: 2, height: 20 });
  }
  async notePop(p, no, x, y) {
    const text = await this.noteAt(p, no);
    if (!text) return;
    const n = this.$('.rd-note');
    n.innerHTML = `<div class="note-h"><b>각주 ${no}</b><button class="ib" data-act="copy" aria-label="복사">${ICON.copy}</button><button class="ib" data-act="x" aria-label="닫기">${ICON.close}</button></div><div class="note-t"></div>`;
    n.querySelector('.note-t').textContent = text;
    n.onclick = (e) => { const b = e.target.closest('[data-act]'); if (!b) return; if (b.dataset.act === 'copy') this.copy(text); this.hideNote(); };
    n.hidden = false;
    const W = this.root.clientWidth, w = Math.min(460, W - 24);
    n.style.width = w + 'px';
    n.style.left = clamp(x - w / 2, 12, W - w - 12) + 'px';
    const below = y + 24 + n.offsetHeight < this.root.clientHeight - 70;
    n.style.top = (below ? y + 18 : Math.max(60, y - n.offsetHeight - 18)) + 'px';
  }
  hideNote() { this.$('.rd-note').hidden = true; }
  showPop(kind, rect) {
    const pop = this.$('.rd-pop');
    pop.hidden = false; this.popKind = kind;
    const R = this.root.getBoundingClientRect();
    const W = this.root.clientWidth, w = pop.offsetWidth, h = pop.offsetHeight;
    let left = (rect.left + rect.right) / 2 - R.left - w / 2;
    left = clamp(left, 8, W - w - 8);
    // below the selection (the system's own menu sits above it on iPad and iPhone)
    let top = rect.bottom - R.top + 12;
    if (top + h > this.root.clientHeight - 80) top = rect.top - R.top - h - 12;
    pop.style.left = left + 'px'; pop.style.top = Math.max(56, top) + 'px';
    this.hideNote();
  }
  hidePop() { const pop = this.$('.rd-pop'); if (pop) pop.hidden = true; this.popKind = null; this.hideNote(); }
  copy(text) {
    const done = () => this.o.toast && this.o.toast('복사했습니다');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => this.copyFallback(text, done));
    else this.copyFallback(text, done);
  }
  copyFallback(text, done) {
    const t = el('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
    t.remove();
  }

  /* ---------------- page indicator and jumps ---------------- */
  label(n) { const o = this.labelOff(); return String(n + 1 + (o == null ? 0 : o)); }
  unit() { return this.labels && this.labels.confident ? '면' : '쪽'; }
  updateInd() {
    if (!this.pages.length) return;
    const c = this.current().page;
    const b = this.$('.rd-pg');
    const txt = `${this.label(c)} / ${this.label(this.N - 1)}${this.unit()}`;
    if (b.textContent !== txt) b.textContent = txt;
    if (c !== this.lastPage) { this.lastPage = c; }
  }
  jump() {   // a small sheet: type a page, or slide
    const off = this.labelOff() || 0;
    const unit = this.unit(), cur = this.current().page;
    const box = el('div', 'rd-jump');
    box.innerHTML = `<div class="jump-card"><p>${esc(this.label(0))}–${esc(this.label(this.N - 1))}${unit} 중</p>
      <div class="jump-row"><input type="number" inputmode="numeric" value="${cur + 1 + off}" min="${1 + off}" max="${this.N + off}"><span>${unit}</span><button class="go">이동</button></div>
      <input type="range" min="0" max="${this.N - 1}" value="${cur}"></div>`;
    this.root.appendChild(box);
    const num = box.querySelector('input[type=number]'), rng = box.querySelector('input[type=range]');
    const go = (idx) => { this.scrollToPage(clamp(idx, 0, this.N - 1), 0, false); };
    const close = () => box.remove();
    num.focus(); num.select();
    rng.oninput = () => { num.value = Number(rng.value) + 1 + off; go(Number(rng.value)); };
    box.querySelector('.go').onclick = () => {
      const n = parseInt(num.value, 10);
      if (Number.isFinite(n)) {
        let idx = n - 1 - off;
        if (off && (idx < 0 || idx > this.N - 1) && n >= 1 && n <= this.N) idx = n - 1;   // typed the PDF's own page number (e.g. 6 for "201–220면")
        go(idx);
      }
      close();
    };
    num.onkeydown = (e) => { if (e.key === 'Enter') box.querySelector('.go').click(); if (e.key === 'Escape') close(); };
    box.onclick = (e) => { if (e.target === box) close(); };
  }

  /* ---------------- actions ---------------- */
  action(a, b) {
    if (a === 'search') { const f = this.$('.rd-find'); f.hidden = false; const i = f.querySelector('input'); i.focus(); i.select(); return; }
    if (a === 'closefind') { this.$('.rd-find').hidden = true; this.findQ = ''; this.hits = []; this.$('.rd-find-list').hidden = true; this.$('.rd-find-n').textContent = ''; this.root.querySelectorAll('.hit').forEach((x) => x.remove()); return; }
    if (a === 'next' || a === 'prev') { if (this.hits && this.hits.length) this.gotoHit((this.hitI + (a === 'next' ? 1 : -1) + this.hits.length) % this.hits.length); return; }
    if (a === 'panel') { const pn = this.$('.rd-panel'); pn.hidden = !pn.hidden; this.root.classList.toggle('with-panel', !pn.hidden); if (!pn.hidden) this.showTab(this.tab || 'toc'); return; }
    if (a === 'share') { this.o.onShare && this.o.onShare(b); return; }
    if (a === 'jump') { this.jump(); return; }
    if (a === 'zin') this.zoomBy(1.2);
    if (a === 'zout') this.zoomBy(1 / 1.2);
  }

  async loadOutline() {
    try {
      const ol = await this.doc.getOutline();
      if (ol && ol.length) {
        const flat = [];
        const walk = async (items, level) => {
          for (const it of items) {
            if (flat.length > 300) return;
            let page = null;
            try {
              let dest = it.dest;
              if (typeof dest === 'string') dest = await this.doc.getDestination(dest);
              if (Array.isArray(dest) && dest[0]) page = await this.doc.getPageIndex(dest[0]);
            } catch (e) { /* unresolved */ }
            flat.push({ title: it.title, level, page });
            if (it.items && it.items.length && level < 3) await walk(it.items, level + 1);
          }
        };
        await walk(ol, 1);
        if (flat.some((x) => x.page != null)) this.outline = flat.filter((x) => x.page != null);
      }
    } catch (e) { /* none */ }
    if (!this.outline) this.outline = this.outlineData || [];
    if (!this.$('.rd-panel').hidden && this.tab === 'toc') this.showTab('toc');
  }
  showTab(t) {
    this.tab = t;
    for (const b of this.root.querySelectorAll('.rd-panel .seg button')) b.classList.toggle('on', b.dataset.tab === t);
    const box = this.$('.rd-panel-in');
    if (t === 'toc') {
      const ol = this.outline || [];
      box.innerHTML = ol.length ? '<ol class="toc">' + ol.map((x, i) => `<li class="lv${Math.min(3, x.level || 1)}"><button data-toc="${i}"><span>${esc(x.title)}</span><em>${this.label(x.page)}</em></button></li>`).join('') + '</ol>'
        : '<p class="empty">이 문서에는 목차가 없습니다.</p>';
    } else {
      const ms = this.marks().sort((a, b) => a.p - b.p || a.rects[0][1] - b.rects[0][1]);
      this.$('.rd-panel .seg [data-tab="marks"]').textContent = ms.length ? `밑줄 ${ms.length}` : '밑줄';
      box.innerHTML = ms.length ? '<ul class="mlist">' + ms.map((m) => `<li><button data-mark="${m.id}"><i class="${m.kind === 'ul' ? 'uw' : 'sw'}" style="--c:${m.color}"></i><span>${esc(m.text)}</span><em>${this.label(m.p)}${this.unit()}</em></button></li>`).join('') + '</ul>'
        : '<p class="empty">아직 밑줄이 없습니다.<br>형광펜이나 밑줄을 켜고 글자 위를 드래그하세요.</p>';
      if (ms.length) box.insertAdjacentHTML('beforeend', '<div class="mfoot"><button type="button" class="btn ghost" data-copyall>모두 복사</button><span class="sp"></span><button type="button" class="btn ghost danger" data-clear>밑줄 모두 지우기</button></div>');
    }
  }
  panelClick(e) {
    if (e.target.closest('[data-clear]')) { this.o.onClearAll && this.o.onClearAll(); return; }
    if (e.target.closest('[data-copyall]')) {   // every marked passage, in reading order, with its printed page
      const ms = this.marks().sort((a, b) => a.p - b.p || a.rects[0][1] - b.rects[0][1] || a.rects[0][0] - b.rects[0][0]);
      this.copy([this.o.title || '', '', ...ms.map((m) => `${this.label(m.p)}${this.unit()}  ${m.text}`)].join('\n'));
      return;
    }
    const t = e.target.closest('[data-toc]');
    if (t) { const x = this.outline[Number(t.dataset.toc)]; this.scrollToPage(x.page, x.y && this.pages[x.page] ? x.y / this.pages[x.page].h : 0); if (innerWidth < 900) this.action('panel'); return; }
    const m = e.target.closest('[data-mark]');
    if (m) {
      const mk = this.allMarks.find((x) => x.id === m.dataset.mark);
      if (mk) { this.scrollToPage(mk.p, mk.rects[0][1]); this.flash(mk.id); if (innerWidth < 900) this.action('panel'); }
    }
  }
  flash(id) {
    setTimeout(() => { this.root.querySelectorAll(`.mk[data-id="${id}"]`).forEach((x) => { x.classList.add('flash'); setTimeout(() => x.classList.remove('flash'), 1300); }); }, 350);
  }

  /* ---------------- find in this document ---------------- */
  async pageTexts() {
    if (this.texts) return this.texts;
    const out = [];
    const bar = this.$('.rd-find-n');
    for (let i = 0; i < this.N; i++) {
      const p = this.pages[i];
      if (!p.items) { const r = await pageItems(this.doc, i); p.items = r.page; p.tc = p.tc || r.textContent; }
      try { out.push(this.A.pageText(p.items, this.stats || undefined)); } catch (e) { out.push(p.items.items.map((x) => x.s).join(' ')); }
      if (i % 10 === 9) { bar.textContent = `읽는 중 ${Math.round(100 * (i + 1) / this.N)}%`; await new Promise((r) => setTimeout(r, 0)); }
      if (this.dead) return [];
    }
    this.texts = out;
    return out;
  }
  async find(q, preferPage) {
    q = (q || '').trim();
    this.findQ = q;
    this.root.querySelectorAll('.hit').forEach((x) => x.remove());
    const list = this.$('.rd-find-list'), n = this.$('.rd-find-n');
    if (q.length < 1) { this.hits = []; list.hidden = true; n.textContent = ''; return; }
    const texts = await this.pageTexts();
    if (q !== this.findQ) return;
    const key = q.replace(/\s+/g, '').toLowerCase();
    const hits = [];
    texts.forEach((t, page) => {
      const { flat, map } = squeeze(t);
      let i = flat.indexOf(key);
      while (i >= 0 && hits.length < 999) {
        const a = map[i], b = map[i + key.length - 1] + 1;
        hits.push({ page, snip: t.slice(Math.max(0, a - 28), a), word: t.slice(a, b), after: t.slice(b, b + 40) });
        i = flat.indexOf(key, i + key.length);
      }
    });
    this.hits = hits;
    n.textContent = hits.length ? `${hits.length}곳` : '없음';
    list.innerHTML = hits.slice(0, 200).map((h, i) => `<button data-hit="${i}"><em>${this.label(h.page)}${this.unit()}</em><span>…${esc(h.snip)}<mark>${esc(h.word)}</mark>${esc(h.after)}…</span></button>`).join('');
    list.hidden = !hits.length;
    for (const p of this.pages) if (p.tl) this.paintHits(p);
    if (hits.length) {
      const start = preferPage != null ? Math.max(0, hits.findIndex((h) => h.page >= preferPage)) : Math.max(0, hits.findIndex((h) => h.page >= this.current().page));
      this.gotoHit(start, true);
    }
  }
  gotoHit(i, keepList) {
    const h = this.hits[i]; if (!h) return;
    this.hitI = i;
    this.$('.rd-find-n').textContent = `${i + 1} / ${this.hits.length}`;
    if (!keepList || innerWidth < 900) this.$('.rd-find-list').hidden = true;
    this.scrollToPage(h.page, 0, false);
    setTimeout(() => {
      const p = this.pages[h.page];
      const hs = p.el.querySelectorAll('.hit');
      const nth = this.hits.slice(0, i).filter((x) => x.page === h.page).length;
      const target = hs[nth] || hs[0];
      if (target) { const r = target.getBoundingClientRect(), s = this.scroller.getBoundingClientRect(); this.scroller.scrollTop += (r.top - s.top) - s.height * 0.35; hs.forEach((x) => x.classList.toggle('cur', x === target)); }
    }, 300);
  }
  paintHits(p) {
    p.el.querySelectorAll('.hit').forEach((x) => x.remove());
    if (!this.findQ || !p.tl) return;
    const key = this.findQ.replace(/\s+/g, '').toLowerCase();
    const nodes = []; let flat = ''; const map = [];
    const w = document.createTreeWalker(p.tl, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const t = w.currentNode; nodes.push(t); const s = t.data; for (let i = 0; i < s.length; i++) { if (!/\s/.test(s[i])) { flat += s[i].toLowerCase(); map.push([t, i]); } } }
    const layer = p.el.querySelector('.pg-hits');
    let i = flat.indexOf(key);
    while (i >= 0) {
      const [n0, o0] = map[i], [n1, o1] = map[i + key.length - 1];
      const r = document.createRange(); r.setStart(n0, o0); r.setEnd(n1, o1 + 1);
      for (const b of this.rectsFor(r, p)) {
        const x = el('i', 'hit');
        x.style.left = (b[0] * 100) + '%'; x.style.top = (b[1] * 100) + '%'; x.style.width = (b[2] * 100) + '%'; x.style.height = (b[3] * 100) + '%';
        layer.appendChild(x);
      }
      i = flat.indexOf(key, i + key.length);
    }
  }

  destroy() {
    this.dead = true;
    clearTimeout(this.posT);
    if (this.ro) this.ro.disconnect();
    document.removeEventListener('selectionchange', this.onSel);
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('pointerdown', this.onDocDown, true);
    document.removeEventListener('pointerup', this.onUpSel, true);
    for (const p of this.pages) { this.release(p); try { p.pdfPage && p.pdfPage.cleanup(); } catch (e) { /* ignore */ } }
    this.root.remove();
  }
}

let ocrMeasure = null;

// text without white space, with a map back to positions in the original
function squeeze(t) {
  let flat = ''; const map = [];
  for (let i = 0; i < t.length; i++) if (!/\s/.test(t[i])) { flat += t[i].toLowerCase(); map.push(i); }
  return { flat, map };
}
