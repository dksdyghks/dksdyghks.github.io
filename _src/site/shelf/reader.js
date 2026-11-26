// The reader: pages in one continuous column, pinch or buttons to zoom; text is chosen first, then marked.
//   A finger scrolls; a long press chooses the word under it, and moving on (without lifting) takes in more, letter by letter.
//   The mouse drags over the text to choose it. Either way, two handles then set its ends exactly, and a small bar offers
//   형광펜 and 밑줄 colours and 복사. An Apple Pencil marks at once, in the way the last mark was made.
//   Marks follow the letters (a drag is turned into text ranges, never a free stroke) and are kept as page-relative boxes.
import { lib, pageItems } from './pdfkit.js';
import { HAS_HAN, searchForm, hangulize, soft } from './naming.js';
import { scanCases, linkCases, caseView, judgmentView, wireCase, cite } from './cases.js';
import { scanArticles, articleScope, scanCourtCases, articleQuery, courtQuery, artLabel, paras, lawGoKr, courtCite, pendingArt, pendingParas, dateText } from './laws.js';

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
// after the last page: the paper itself, closed (its first page, small, on two more sheets), and the five pen marks under
// it; a mark chosen there is drawn onto that small cover by the red pen, as on a printed copy and as the shelf shows it
const END_TOP = 46, END_GAP = 24, END_ROW = 48, END_FOOT = 132;   // (the room at the foot is the floating tools')
// the marks as the pen draws them: stroke after stroke, each over its own length (pathLength 1)
const STROKES = { star: ['M12.1 2.9L17.4 19.4L3.3 9.3L20.7 9.1L6.6 19.5L12.6 3.6'], tri: ['M12.3 3.8L20.6 19.2L3.6 19.4L12.8 4.6'], x: ['M5 5.2L19.2 19', 'M18.8 4.8L5.3 19.3'] };
function penDraw(v) {
  let t = 0;
  const svg = (paths, dur) => `<svg viewBox="0 0 24 24" class="pen">${paths.map((d) => { const h = `<path class="ink" pathLength="1" d="${d}" style="--d:${t.toFixed(2)}s;--t:${dur}s"/>`; t += dur + 0.05; return h; }).join('')}</svg>`;
  if (v > 0) { let h = ''; for (let i = 0; i < v; i++) h += svg(STROKES.star, 0.44); return h; }
  if (v === -2) return svg(STROKES.tri, 0.48);
  if (v === -1) return svg(STROKES.x, 0.2);
  return '';
}
const MAX_PIXELS = 12e6;   // per canvas (Safari's hard limit is 16.7M)
const KEEP = 2;            // pages kept rendered beyond the visible ones
const SNAP_W = 520;        // a drawn page is also kept as a small picture this wide: shown at once when the page comes back
const AHEAD = 4;           // while the reader rests, pages this far ahead and behind get that picture ready

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
  top: '<svg viewBox="0 0 24 24"><path d="M6 4.5h12"/><path d="M12 20V9M7.5 13.5L12 9l4.5 4.5"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  erase: '<svg viewBox="0 0 24 24"><path d="M15.6 4.4l4 4a1.5 1.5 0 0 1 0 2.1L11 19H6.5l-3-3a1.5 1.5 0 0 1 0-2.1l10-9.5a1.5 1.5 0 0 1 2.1 0z"/><path d="M10 8.5l5.5 5.5M11 19h9"/></svg>',
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
    this.outlineData = o.analyze && o.analyze.tidyOutline ? o.analyze.tidyOutline((o.index && o.index.outline) || []) : (o.index && o.index.outline) || [];
    this.allMarks = (o.marks || []).slice();   // includes deletions (kept for syncing)
    this.undoStack = [];   // this reading's changes to marks, newest last (되돌리기)
    this.ocr = o.ocr || null;   // a scan's words, page by page (read by ocr.js)
    this.zoom = o.zoom > 0 ? o.zoom : 1;
    this.sel = null;   // the text chosen: { a, b } (two carets), its range and text
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
        <button data-walk aria-label="표시한 곳만 넘겨 보기">${ICON.walk}<span>넘겨 보기</span></button>
        <button data-undo aria-label="되돌리기" title="되돌리기 (⌘Z)" hidden>${ICON.undo}<span>되돌리기</span></button>
        <button data-erase aria-label="밑줄 지우기" title="밑줄 지우기">${ICON.erase}<span>지우기</span></button>
        <button data-top aria-label="맨 위로" title="맨 위로">${ICON.top}<span>맨 위로</span></button>
        <div class="rd-erase" hidden></div>
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
      if (e.target.closest('[data-walk]')) { this.walkStart(); return; }
      if (e.target.closest('[data-undo]')) { this.undo(); return; }
      const er = e.target.closest('[data-er]'); if (er) { this.$('.rd-erase').hidden = true; this.erase(er.dataset.er); return; }
      if (e.target.closest('[data-erase]')) { this.toggleErase(); return; }
      if (e.target.closest('[data-top]')) { this.$('.rd-erase').hidden = true; this.clearSel(); this.scrollToPage(0, 0, false); }
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
    const gb = (n, label, g) => `<button type="button" data-star="${n}" aria-label="${label}" aria-pressed="false">${gradeSVG(g)}</button>`;
    this.endEl.innerHTML = `<div class="end-cover" aria-hidden="true"><i class="es s3"></i><i class="es s2"></i><span class="ec-pg"><img alt="" decoding="async" hidden></span><span class="end-mark"></span></div>
      <div class="rd-grade" role="group" aria-label="표시">${gb(1, '별 1개', 1)}${gb(2, '별 2개', 1)}${gb(3, '별 3개', 1)}<span class="sep"></span>${gb(-2, '세모', -2)}${gb(-1, '엑스', -1)}</div>`;
    this.endEl.onclick = (e) => { const b = e.target.closest('[data-star]'); if (!b) return; const n = Number(b.dataset.star); const v = n === this.stars ? 0 : n; this.setStars(v, true); this.o.onRate && this.o.onRate(v); };   // the same choice again clears it
    // a mouse over a mark shows, faintly, what a click would draw (the stars before it too)
    const row = this.endEl.querySelector('.rd-grade');
    row.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const b = e.target.closest('[data-star]'), n = b ? Number(b.dataset.star) : 0;
      row.querySelectorAll('[data-star]').forEach((x) => { const k = Number(x.dataset.star); x.classList.toggle('pre', !!n && (n > 0 ? k > 0 && k <= n : k === n)); });
    });
    row.addEventListener('pointerleave', () => row.querySelectorAll('.pre').forEach((x) => x.classList.remove('pre')));
    this.pagesEl.appendChild(this.endEl);
    this.watchEnd();
    this.setStars(this.o.stars || 0);
    this.layout();
    this.drawAllMarks();
    const to = this.o.at || {};
    this.scrollToPage(clamp(to.page || 0, 0, this.N - 1), to.y || 0, false);
    this.lastW = this.scroller.clientWidth;
    this.update();
    this.sizeAll();
    if (!matchMedia('(pointer: coarse)').matches) this.scroller.focus({ preventScroll: true });
    this.stats = null;
    this.sampleStats();
    if (to.query) { this.action('search'); this.$('.rd-find input').value = to.query; this.find(to.query, to.page); }
    if (to.mark) { const mk = this.allMarks.find((m) => m.id === to.mark && !m.del && m.rects); if (mk) { this.scrollToPage(mk.p, mk.rects[0][1], false); this.flash(mk.id); } }
    this.loadOutline();
  }

  setIndex(index) {
    if (!index || this.dead) return;
    const had = this.texts;
    this.texts = index.pages || this.texts;
    if (this.texts !== had) {   // the pages before each page are known now: its citations are read again in their sections
      this.scopes = null;
      for (const p of this.pages) if (p.tl && p.casesSrc) this.casesFor(p, p.casesSrc);
    }
    if (index.labels && index.labels.confident) { this.labels = index.labels; this.updateInd(); }
    if (index.outline && index.outline.length && (!this.outline || !this.outline.length || this.outline === this.outlineData)) { this.outlineData = this.A && this.A.tidyOutline ? this.A.tidyOutline(index.outline) : index.outline; this.outline = this.outlineData; if (!this.$('.rd-panel').hidden && this.tab === 'toc') this.showTab('toc'); }
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
    if (this.endEl) {
      // the small cover keeps the first page's shape (a tall page is made narrower, not taller)
      const p0 = this.pages[0];
      let cw = this.scroller.clientWidth > 700 ? 150 : 128, coverH = Math.round(cw * p0.h / p0.w);
      if (coverH > 230) { cw = Math.round(cw * 230 / coverH); coverH = 230; }
      this.endEl.style.setProperty('--cw', cw + 'px'); this.endEl.style.setProperty('--ch', coverH + 'px');
      this.endEl.style.width = Math.min(520, Math.max(...this.pages.map((p) => p.cw))) + 'px';
      y += END_TOP - GAP + coverH + 8 + END_GAP + END_ROW + END_FOOT;
    }
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
    if (Math.abs(vp.width - p.w) > 0.5 || Math.abs(vp.height - p.h) > 0.5) this.keepPlace(() => { p.w = vp.width; p.h = vp.height; this.relayout(); });
  }
  // Every page's own size, asked for as soon as the paper is open (a cover is often larger than the pages after it), so the
  // column is laid out once and does not move under the reader's eyes later.
  async sizeAll() {
    const sizes = [];
    try {
      for (let i = 1; i < this.N; i++) {
        if (this.dead) return;
        const p = this.pages[i];
        if (p.sized) continue;
        p.pdfPage = p.pdfPage || await this.doc.getPage(i + 1);
        const vp = p.pdfPage.getViewport({ scale: 1 });
        sizes.push([p, vp.width, vp.height]);
      }
    } catch (e) { /* the pages are sized as they are reached */ }
    if (this.dead || !sizes.length) return;
    const moved = sizes.filter(([p, w, h]) => !p.sized && (Math.abs(w - p.w) > 0.5 || Math.abs(h - p.h) > 0.5));
    const apply = () => { for (const [p, w, h] of sizes) { if (p.sized) continue; p.w = w; p.h = h; p.sized = true; } };
    if (!moved.length) { apply(); return; }
    this.keepPlace(() => { apply(); this.relayout(); });
    this.update();
  }
  // a change of layout that leaves the reader where they were: the same spot of the same page stays at the top of the screen
  keepPlace(fn) {
    const s = this.scroller;
    if (!this.pages.length) { fn(); return; }
    const i = this.pageAtY(s.scrollTop), p = this.pages[i], rel = (s.scrollTop - p.top) / (p.ch || 1);
    const relX = s.scrollWidth > s.clientWidth ? (s.scrollLeft + s.clientWidth / 2) / (s.scrollWidth || 1) : null;
    fn();
    s.scrollTop = Math.max(0, p.top + rel * p.ch);
    if (relX != null) s.scrollLeft = Math.max(0, relX * s.scrollWidth - s.clientWidth / 2);
  }
  // laid out again; pages already drawn are drawn again only when their size on screen changed (until then the old drawing
  // stays, stretched, so nothing goes blank)
  relayout() {
    const before = this.scale;
    this.layout();
    if (Math.abs(this.scale - before) > 1e-6) for (const q of this.pages) if (q.cScale) q.cScale = -1;
  }

  /* ---------------- rendering ---------------- */
  update() {
    if (this.dead || !this.pages.length) return;
    const [a, b] = this.inView();
    for (let i = 0; i < this.N; i++) if (i < a - KEEP || i > b + KEEP) this.release(this.pages[i]);
    this.pump();
    this.updateInd();
  }
  inView() {
    const s = this.scroller;
    return [this.pageAtY(Math.max(0, s.scrollTop - 10)), this.pageAtY(s.scrollTop + s.clientHeight + 10)];
  }
  // pages are drawn one at a time, the one in the middle of the screen first, then its neighbours (one before, one after):
  // a page scrolled to is never kept waiting behind pages already scrolled past
  nextToRender() {
    const [a, b] = this.inView(), s = this.scroller, mid = s.scrollTop + s.clientHeight / 2;
    let best = null, bd = Infinity;
    for (let i = Math.max(0, a - 1); i <= Math.min(this.N - 1, b + 1); i++) {
      const p = this.pages[i];
      if (p.cScale === this.scale || (p.failed === this.scale && Date.now() - p.failedAt < 4000)) continue;   // a failure is tried again after a pause
      if (p.busy) { if (p.ptask) { try { p.ptask.cancel(); } catch (e) { /* ignore */ } } continue; }   // its small picture is being made: stopped, and the page drawn after
      const d = i >= a && i <= b ? Math.abs(p.top + p.ch / 2 - mid) : 1e7 + Math.abs(p.top + p.ch / 2 - mid);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (let p; !this.dead && (p = this.nextToRender());) await this.render(p);
    } finally { this.pumping = false; }
    if (!this.dead) this.restSoon();
  }
  async render(p) {
    if (p.cScale === this.scale || p.busy) return;
    p.busy = true;
    // a page whose drawing never ends is given up (and tried again later), so it never holds up the pages after it
    let timedOut = false;
    const guard = setTimeout(() => { timedOut = true; if (p.task) { try { p.task.cancel(); } catch (e) { /* ignore */ } } }, 25000);
    const stall = new Promise((resolve, reject) => { p.stall = () => reject(Object.assign(new Error('stalled'), { name: 'Stalled' })); });
    const giveUp = setTimeout(() => p.stall && p.stall(), 26000);
    try {
      await Promise.race([this.draw(p), stall]);
    } catch (e) {
      if (timedOut || (e && e.name === 'Stalled')) { p.failed = this.scale; p.failedAt = Date.now(); }
      else if (!(e && e.name === 'RenderingCancelledException')) { console.warn('render', p.n, e); p.failed = this.scale; p.failedAt = Date.now(); }
    } finally { clearTimeout(guard); clearTimeout(giveUp); p.stall = null; p.busy = false; }
  }
  async draw(p) {
    {
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
      this.snapshot(p, c);
      this.textLayerSoon(p, scale);
    }
  }
  // The words over a page (for selecting, 찾기 and the 판례·조문 marks) are laid once the scrolling pauses: while the pages
  // move, only pictures are drawn, so the scrolling stays smooth.
  textLayerSoon(p, scale) {
    clearTimeout(p.tlT);
    const go = () => {
      if (this.dead || p.cScale !== scale || !p.canvas) return;
      if (Date.now() - (this.lastScroll || 0) < 140) { p.tlT = setTimeout(go, 160); return; }
      this.textLayer(p, scale).catch((e) => console.warn('text layer', p.n, e));
    };
    go();
  }
  // a small picture of a drawn page, kept as the page's background: when its drawing is let go (far from the screen) and the
  // page comes back, the picture is there at once and the sharp drawing replaces it — never a blank page
  snapshot(p, c) {
    if (p.snap || p.snapping || !c.width) return;
    p.snapping = true;
    try {
      const k = Math.min(1, SNAP_W / c.width);
      const t = document.createElement('canvas');
      t.width = Math.max(1, Math.round(c.width * k)); t.height = Math.max(1, Math.round(c.height * k));
      const x = t.getContext('2d', { alpha: false });
      x.imageSmoothingQuality = 'high';
      x.drawImage(c, 0, 0, t.width, t.height);
      t.toBlob((blob) => {
        p.snapping = false; t.width = t.height = 0;
        if (!blob || this.dead || p.snap) return;
        p.snap = URL.createObjectURL(blob);
        p.el.style.backgroundImage = `url("${p.snap}")`;
      }, 'image/jpeg', 0.75);
    } catch (e) { p.snapping = false; }
  }
  // while the reader rests on a page: the pictures of the pages around it are made ahead (small, quick), so turning to them
  // never shows a blank page; any scrolling stops this at once
  restSoon() {
    clearTimeout(this.restT);
    this.restT = setTimeout(() => this.rest(), 450);
  }
  async rest() {
    if (this.dead || this.pumping || this.resting) return;
    if (Date.now() - (this.lastScroll || 0) < 400) { this.restSoon(); return; }
    this.resting = true;
    try {
      const cur = this.current().page;
      const order = [];
      for (let d = 1; d <= AHEAD; d++) { order.push(cur + d); order.push(cur - d); }
      for (const i of order) {
        if (this.dead || this.pumping || Date.now() - (this.lastScroll || 0) < 400) break;
        const p = this.pages[i];
        if (!p || p.snap || p.canvas || p.busy) continue;
        await this.picture(p);
      }
      if (!this.dead && Date.now() - (this.lastScroll || 0) >= 400) this.warmCases();
    } finally { this.resting = false; }
  }
  // the 헌재 decisions cited on the page being read, asked for ahead (three at most, each once): a tap on one opens it at once
  warmCases() {
    if (!this.o.decision) return;
    const p = this.pages[this.current().page];
    if (!p || !p.cases) return;
    this.warm = this.warm || new Set();
    const nos = [...new Set(p.cases.filter((c) => c.kind === 'case').map((c) => c.no))].filter((no) => !this.warm.has(no)).slice(0, 3);
    for (const no of nos) { this.warm.add(no); Promise.resolve().then(() => this.o.decision(no)).catch(() => {}); }
  }
  async picture(p) {   // (a page's small picture, made apart from drawing it; not preview(), the mark being dragged out)
    p.busy = true;
    try {
      p.pdfPage = p.pdfPage || await this.doc.getPage(p.n + 1);
      if (this.dead) return;
      const vp = p.pdfPage.getViewport({ scale: SNAP_W / p.pdfPage.getViewport({ scale: 1 }).width });
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      const ctx = c.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      const pdfjs = await lib();
      p.ptask = p.pdfPage.render({ canvasContext: ctx, viewport: vp, annotationMode: pdfjs.AnnotationMode.ENABLE });
      await p.ptask.promise;
      p.ptask = null;
      if (!this.dead && !p.snap) this.snapshot(p, c);
      setTimeout(() => { c.width = c.height = 0; }, 0);
    } catch (e) { p.ptask = null; } finally { p.busy = false; if (!this.dead && !this.pumping && this.nextToRender()) this.pump(); }
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
    const src = lines && lines.length ? 'ocr' : 'pdf';
    if (p.casesSrc !== src) this.casesFor(p, src);
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
    clearTimeout(p.tlT);
    if (p.task) { try { p.task.cancel(); } catch (e) { /* ignore */ } p.task = null; }
    if (p.canvas) { p.canvas.width = p.canvas.height = 0; p.canvas.remove(); p.canvas = null; }
    if (p.tl) { p.tl.remove(); p.tl = null; p.tlScale = 0; }
    p.cScale = 0; p.el.classList.remove('ready');
    if (p.pdfPage && Math.abs(p.n - this.current().page) > 6) { p.pdfPage.cleanup(); }
  }

  // what this page cites — 헌재 decisions (2004헌마554), courts' judgments (대법원 … 2000두7735 판결) and articles of laws
  // (헌법 제37조 제2항) — found in its text layer, the words as laid on the page, so each can be tapped where it is printed;
  // underlined like a footnote marker
  casesFor(p, src) {
    p.casesSrc = src; p.cases = [];
    const layer = p.el.querySelector('.pg-marks');
    layer.querySelectorAll('.case-ref').forEach((x) => x.remove());
    if (!p.tl) return;
    let flat = ''; const map = [];
    const w = document.createTreeWalker(p.tl, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    while (w.nextNode()) {
      const n = w.currentNode;
      if (n.nodeType === 1) { if (n.tagName === 'BR') { flat += '\n'; map.push(null); } continue; }   // a line ends: nothing runs over it
      for (let i = 0; i < n.data.length; i++) { flat += n.data[i]; map.push([n, i]); }
    }
    const found = [
      ...scanCases(flat).map((c) => ({ ...c, kind: 'case' })),
      ...scanCourtCases(flat).map((c) => ({ ...c, kind: 'court' })),
      ...scanArticles(flat, this.scopeAt(p.n)).map((c) => ({ ...c, kind: 'art' })),
    ].sort((x, y) => x.i - y.i);
    let end = 0;
    for (const c of found) {
      if (c.i < end) continue;
      end = c.i + c.len;
      let a = c.i, b = c.i + c.len - 1;
      while (a <= b && !map[a]) a++;
      while (b >= a && !map[b]) b--;
      if (a > b) continue;
      const r = document.createRange(); r.setStart(map[a][0], map[a][1]); r.setEnd(map[b][0], map[b][1] + 1);
      const rects = this.rectsFor(r, p);
      if (!rects.length) continue;
      p.cases.push({ ...c, rects });
      for (const q of rects) {
        const d = el('i', 'case-ref');
        d.style.left = (q[0] * 100) + '%'; d.style.top = ((q[1] + q[3]) * 100) + '%'; d.style.width = (q[2] * 100) + '%';
        layer.appendChild(d);
      }
    }
  }
  // what the pages before page n leave for its citations — the headings above it, the foreign laws named in its section — read
  // from the document's page texts, page by page, once (null until those texts are here: each page is then read on its own)
  scopeAt(n) {
    if (!this.texts) return null;
    const s = this.scopes || (this.scopes = [null]);
    for (let i = s.length; i <= n; i++) s[i] = articleScope(this.texts[i - 1] || '', s[i - 1]);
    return s[n];
  }
  caseAt(p, x, y) {   // x, y as fractions of the page
    const padX = 4 / p.cw, padY = 4 / p.ch;
    return (p.cases || []).find((c) => c.rects.some((r) => x >= r[0] - padX && x <= r[0] + r[2] + padX && y >= r[1] - padY && y <= r[1] + r[3] + padY)) || null;
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
  // the end comes into view: the closed paper settles in, once; its small cover is made from the first page a little before
  watchEnd() {
    const show = () => { if (this.endEl) this.endEl.classList.add('shown'); };
    if (!('IntersectionObserver' in window)) { show(); this.endCover(); return; }
    this.endNear = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { this.endNear.disconnect(); this.endCover(); } }, { root: this.scroller, rootMargin: '0px 0px 150% 0px' });
    this.endSeen = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { this.endSeen.disconnect(); show(); } }, { root: this.scroller, rootMargin: '0px 0px -9% 0px' });
    this.endNear.observe(this.endEl); this.endSeen.observe(this.endEl);
  }
  async endCover() {
    const p = this.pages[0], img = this.endEl && this.endEl.querySelector('.ec-pg img');
    if (!p || !img) return;
    for (let i = 0; i < 40 && !p.snap && !this.dead; i++) {   // the first page's small picture: kept already, or made now
      if (!p.busy && !p.snapping) { if (p.canvas && p.canvas.width) this.snapshot(p, p.canvas); else await this.picture(p); }
      if (!p.snap) await new Promise((r) => setTimeout(r, 200));
    }
    if (this.dead || !p.snap) return;
    img.onload = () => { img.hidden = false; requestAnimationFrame(() => img.classList.add('in')); };
    img.src = p.snap;
  }
  // the mark on the small cover: drawn stroke by stroke when chosen at the end, put in place otherwise; a star added is drawn
  // beside those there, one taken away lifts off, another kind of mark replaces them once they have gone
  paintEnd(v, draw) {
    const m = this.endEl && this.endEl.querySelector('.end-mark');
    const was = this.endV || 0;
    if (!m || was === v) return;
    this.endV = v;
    const tok = (this.endTok = (this.endTok || 0) + 1);
    const gone = (x) => { x.classList.add('out'); setTimeout(() => x.remove(), 200); };
    const put = (n) => m.insertAdjacentHTML('beforeend', draw ? penDraw(n) : gradeSVG(n));
    const live = [...m.querySelectorAll('svg:not(.out)')];
    if (was > 0 && v > 0) { if (v < was) live.slice(v).forEach(gone); else put(v - was); return; }
    live.forEach(gone);
    if (!v) return;
    if (!live.length || !draw) { put(v); return; }
    setTimeout(() => { if (this.endTok === tok && !this.dead) put(v); }, 190);
  }
  setStars(v, draw = false) {
    this.stars = v;
    if (!this.endEl) return;
    this.endEl.querySelectorAll('[data-star]').forEach((b) => { const n = Number(b.dataset.star); const on = n < 0 ? v === n : v > 0 && n <= v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    this.paintEnd(v, draw);
    // the same mark on the first page, top right, as on the printed cover
    const p0 = this.pages[0];
    if (p0) { let c = p0.el.querySelector('.pg-cover'); if (!c) { c = el('div', 'pg-cover'); p0.el.appendChild(c); } c.innerHTML = gradeSVG(v); c.dataset.g = v; }
  }
  /* ---------------- only the marked passages, one after another ---------------- */
  walkStart() {
    if (!this.marks().length) { this.o.toast && this.o.toast('아직 표시한 곳이 없습니다'); return; }
    this.clearSel(); this.hidePop();
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
    this.$('.rd-walk .wn').innerHTML = `<b>${this.walkI + 1} / ${n}</b><small>${esc(this.pageName(m.p))}</small>`;
    this.$('.rd-walk [data-w="prev"]').disabled = this.walkI === 0;
    this.$('.rd-walk [data-w="next"]').disabled = this.walkI === n - 1;
  }
  walkStop() { this.walking = false; this.root.classList.remove('walking'); this.$('.rd-walk').hidden = true; }

  marks() { return this.allMarks.filter((m) => !m.del); }
  drawAllMarks() { for (const p of this.pages) this.drawMarks(p); }
  drawMarks(p) {
    const layer = p.el.querySelector('.pg-marks');
    layer.querySelectorAll('.mk:not(.sel), .mk-g').forEach((x) => x.remove());   // (what is chosen stays)
    const groups = new Map();   // highlighter boxes of one colour share one translucent layer: strokes over strokes stay one coat
    for (const m of this.marks()) {
      if (m.p !== p.n) continue;
      let host = layer;
      if (m.kind === 'hl') { host = groups.get(m.color); if (!host) { host = el('div', 'mk-g'); groups.set(m.color, host); layer.appendChild(host); } }
      for (const r of m.rects) {
        const d = el('i', 'mk ' + m.kind);
        d.dataset.id = m.id;
        d.style.left = (r[0] * 100) + '%'; d.style.top = (r[1] * 100) + '%'; d.style.width = (r[2] * 100) + '%'; d.style.height = (r[3] * 100) + '%';
        d.style.setProperty('--c', m.color);
        host.appendChild(d);
      }
    }
  }
  changed() {
    if (this.walking) { const cur = this.walkList[this.walkI]; this.walkBuild(); if (this.walkList.length) this.walkShow(Math.max(0, this.walkList.findIndex((m) => cur && m.id === cur.id)), false); else this.walkStop(); }
    for (const p of this.pages) this.drawMarks(p);
    if (!this.$('.rd-panel').hidden && this.tab === 'marks') this.showTab('marks');
    this.o.onMarks && this.o.onMarks(this.allMarks.slice());
  }
  remember(entries) {   // [id, the mark as it was (null: it did not exist)] for one change
    if (!entries.length) return;
    this.undoStack.push(entries);
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.paintUndo();
  }
  paintUndo() { const b = this.$('.rd-tools [data-undo]'); if (b) b.hidden = !this.undoStack.length; }
  undo() {
    const e = this.undoStack.pop(); if (!e) return;
    const now = Date.now();
    for (const [id, prev] of e) {
      const i = this.allMarks.findIndex((x) => x.id === id);
      const v = prev ? { ...prev, t: now } : { id, del: true, t: now };
      if (i >= 0) this.allMarks[i] = v; else if (prev) this.allMarks.push(v);
    }
    this.paintUndo();
    this.changed();
  }
  toggleErase() {
    const box = this.$('.rd-erase');
    if (!box.hidden) { box.hidden = true; return; }
    const page = this.current().page, all = this.marks().length, here = this.marks().filter((m) => m.p === page).length;
    box.innerHTML = `<button type="button" data-er="page" ${here ? '' : 'disabled'}>이 면의 밑줄 지우기<em>${here}</em></button><button type="button" data-er="all" ${all ? '' : 'disabled'}>이 문서의 밑줄 모두 지우기<em>${all}</em></button>`;
    box.hidden = false;
  }
  async erase(scope) {   // 'page': the page in view, 'all': the whole paper (the PDF itself stays as it is)
    const page = this.current().page;
    const list = this.marks().filter((m) => scope === 'all' || m.p === page);
    if (!list.length) { this.o.toast && this.o.toast(scope === 'all' ? '지울 밑줄이 없습니다' : '이 면에는 밑줄이 없습니다'); return; }
    if (scope === 'all' && this.o.confirm && !(await this.o.confirm('밑줄 모두 지우기', `이 문서의 형광펜과 밑줄 ${list.length}개를 모두 지웁니다. PDF 원본은 그대로이고, 바로 되돌릴 수 있습니다.`, '모두 지우기'))) return;
    const now = Date.now();
    this.remember(list.map((m) => [m.id, { ...m }]));
    for (const m of list) { const i = this.allMarks.findIndex((x) => x.id === m.id); if (i >= 0) this.allMarks[i] = { id: m.id, del: true, t: now }; }
    this.changed();
    this.o.toast && this.o.toast(`${scope === 'all' ? '' : '이 면의 '}밑줄 ${list.length}개를 지웠습니다`, 7000, { label: '되돌리기', fn: () => this.undo() });
  }
  addMarks(list) {
    if (!list.length) return;
    const rec = [], keep = [], now = Date.now();
    for (const n of list) {
      const same = this.marks().filter((m) => m.p === n.p && m.kind === n.kind && m.color === n.color);
      const over = same.find((m) => covers(m.rects, n.rects));
      if (over) { this.flash(over.id); continue; }   // already marked just so: nothing new
      for (const m of same) if (covers(n.rects, m.rects)) {   // the new stroke takes in an old one: one mark, not two
        const i = this.allMarks.findIndex((x) => x.id === m.id);
        rec.push([m.id, { ...m }]); this.allMarks[i] = { id: m.id, del: true, t: now };
      }
      keep.push(n); rec.push([n.id, null]);
    }
    this.remember(rec);
    if (!keep.length) { if (rec.length) this.changed(); return; }
    list = keep;
    this.allMarks.push(...list);
    this.lastMark = list[0].kind;
    this.o.onPrefs && this.o.onPrefs({ hl: this.hlColor, ul: this.ulColor, last: this.lastMark });
    this.changed();
  }
  setMark(id, patch) {
    const m = this.allMarks.find((x) => x.id === id); if (!m) return;
    this.remember([[id, { ...m }]]);
    Object.assign(m, patch, { t: Date.now() });
    this.changed();
  }
  deleteMark(id) {
    const i = this.allMarks.findIndex((x) => x.id === id); if (i < 0) return;
    if (!this.allMarks[i].del) this.remember([[id, { ...this.allMarks[i] }]]);
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

  /* ---------------- the text chosen ---------------- */
  // drawn as a light tint with a handle at each end (each handle drags that end, letter by letter)
  drawSel() {
    this.root.querySelectorAll('.mk.sel, .sel-h').forEach((x) => x.remove());
    const s = this.sel; if (!s) return false;
    if (!s.a.node.isConnected || !s.b.node.isConnected) { this.sel = null; return false; }   // its page was put away
    if (this.before(s.b, s.a)) { const t = s.a; s.a = s.b; s.b = t; }
    let range; try { range = this.rangeBetween(s.a, s.b); } catch (e) { return false; }
    s.range = range;
    const list = this.marksFromRange(range, 'hl', '#2F6FEB');
    for (const m of list) {
      const layer = this.pages[m.p].el.querySelector('.pg-marks');
      for (const r of m.rects) {
        const x = el('i', 'mk sel');
        x.style.left = (r[0] * 100) + '%'; x.style.top = (r[1] * 100) + '%'; x.style.width = (r[2] * 100) + '%'; x.style.height = (r[3] * 100) + '%';
        layer.appendChild(x);
      }
    }
    const handle = (m, r, end) => {
      const h = el('b', 'sel-h ' + end);
      h.dataset.h = end;
      h.style.left = ((end === 'a' ? r[0] : r[0] + r[2]) * 100) + '%';
      h.style.top = ((end === 'a' ? r[1] : r[1] + r[3]) * 100) + '%';
      h.style.setProperty('--lh', `${Math.max(12, r[3] * this.pages[m.p].ch)}px`);
      const pg = this.pages[m.p].el;
      let layer = pg.querySelector('.pg-selh');
      if (!layer) { layer = el('div', 'pg-selh'); pg.appendChild(layer); }
      layer.appendChild(h);
    };
    const first = list[0], last = list[list.length - 1];
    if (first) handle(first, first.rects[0], 'a');
    if (last) handle(last, last.rects[last.rects.length - 1], 'b');
    s.text = list.map((m) => m.text).join(' ');
    return list.length > 0;
  }
  clearSel() {
    this.sel = null;
    this.root.querySelectorAll('.mk.sel, .sel-h').forEach((x) => x.remove());
    if (this.popKind === 'sel') this.hidePop();
  }
  // the word a caret stands in (letters and digits, Hangul and Hanja alike); the caret itself when it is not in one
  wordAt(c) {
    const t = c.node.data || '', isW = (ch) => /[\p{L}\p{N}]/u.test(ch || '');
    let i = c.offset, j = c.offset;
    if (!isW(t[i]) && isW(t[i - 1])) i = j = i - 1;
    if (!isW(t[i])) return { a: c, b: { node: c.node, offset: Math.min(t.length, c.offset + 1) } };
    while (i > 0 && isW(t[i - 1])) i--;
    while (j < t.length && isW(t[j])) j++;
    return { a: { node: c.node, offset: i }, b: { node: c.node, offset: j } };
  }
  before(x, y) {   // the caret x comes before y in the text
    if (x.node === y.node) return x.offset < y.offset;
    try { return !!(x.node.compareDocumentPosition(y.node) & Node.DOCUMENT_POSITION_FOLLOWING); } catch (e) { return false; }
  }
  // the bar over what is chosen: 형광펜 and 밑줄 in their colours (the last used first in mind), and 복사
  selPop(colours = false) {
    const s = this.sel; if (!s || !s.range) return;
    const rect = s.range.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    const pop = this.$('.rd-pop');
    const sr = this.scroller.getBoundingClientRect();
    if (rect.bottom < sr.top + 40 || rect.top > sr.bottom - 40) { pop.hidden = true; this.popKind = 'sel'; return; }   // scrolled out of sight: back when it returns
    pop.classList.add('slim');
    pop.innerHTML = colours
      ? `<div class="pop-row pal">${HL.map((c, i) => `<button data-mk="hl" data-c="${c}" class="pd ${c === this.hlColor ? 'on' : ''}" style="--c:${c}" aria-label="형광펜 ${HL_NAMES[i]}" title="형광펜 ${HL_NAMES[i]}"><i></i></button>`).join('')}<span class="sep"></span>${UL.map((c, i) => `<button data-mk="ul" data-c="${c}" class="pl ${c === this.ulColor ? 'on' : ''}" style="--c:${c}" aria-label="밑줄 ${UL_NAMES[i]}" title="밑줄 ${UL_NAMES[i]}"><i></i></button>`).join('')}</div>`
      : `<div class="pop-row acts"><button data-mk="hl" data-c="${this.hlColor}"><i class="sa-dot" style="--c:${this.hlColor}"></i><span>형광펜</span></button><span class="sep"></span><button data-mk="ul" data-c="${this.ulColor}"><i class="sa-line" style="--c:${this.ulColor}"></i><span>밑줄</span></button><span class="sep"></span><button data-act="copy"><span>복사</span></button><span class="sep"></span><button data-act="pal" class="sa-more" aria-label="색 고르기" title="색 고르기"><i class="sa-pal"></i></button></div>`;
    pop.onclick = (e) => {
      const b = e.target.closest('button'); if (!b || !this.sel) return;
      if (b.dataset.act === 'pal') { this.selPop(true); return; }
      if (b.dataset.mk) {
        const kind = b.dataset.mk, color = b.dataset.c;
        if (kind === 'ul') this.ulColor = color; else this.hlColor = color;
        const range = this.sel.range;
        this.clearSel(); this.hidePop();
        this.addMarks(this.marksFromRange(range, kind, color));
      } else if (b.dataset.act === 'copy') {
        this.copy(this.clean(this.sel.range.toString()));
        this.clearSel(); this.hidePop();
      }
    };
    this.showPop('sel', rect, true);
  }

  /* ---------------- input ---------------- */
  wire() {
    const s = this.scroller;
    let raf = 0;
    s.addEventListener('scroll', () => {
      this.lastScroll = Date.now();
      this.root.classList.add('scrolling');
      clearTimeout(this.fadeT); this.fadeT = setTimeout(() => this.root.classList.remove('scrolling'), 650);
      if (this.resting) for (const p of this.pages) if (p.ptask) { try { p.ptask.cancel(); } catch (e) { /* ignore */ } }
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; this.update(); });
      // the bar over what is chosen steps aside while the pages move, and comes back over it when they rest
      if (this.sel && !this.drag && (!this.popKind || this.popKind === 'sel')) {
        if (this.popKind === 'sel') this.$('.rd-pop').hidden = true;
        clearTimeout(this.selPopT);
        this.selPopT = setTimeout(() => { if (this.sel && !this.drag && (!this.popKind || this.popKind === 'sel') && this.drawSel()) this.selPop(); }, 280);
      }
      clearTimeout(this.posT); this.posT = setTimeout(() => this.o.onPosition && this.o.onPosition(this.current()), 700);
    }, { passive: true });
    // A change of the screen's height alone (a phone's address bar or keyboard, a bar opening above the pages) moves nothing
    // and redraws nothing; only a change of width lays the pages out again, keeping the reader's place.
    this.ro = new ResizeObserver(() => {
      if (this.tabs && this.tabs.length > 1) { const narrow = this.root.clientWidth < 600; if (narrow !== this.tabsNarrow) { this.tabsNarrow = narrow; this.renderTabs(); } }
      if (!this.pages.length || this.dead) return;
      const w = s.clientWidth;
      if (w !== this.lastW && w > 0) { this.lastW = w; this.keepPlace(() => this.relayout()); }
      this.update();
    });
    this.ro.observe(s);

    // Pencil: no scrolling or system selection with the stylus — it marks
    s.addEventListener('touchstart', (e) => { if (e.target.closest && e.target.closest('.rd-end')) return; if ([...e.changedTouches].some((t) => t.touchType === 'stylus')) e.preventDefault(); }, { passive: false });
    s.addEventListener('touchmove', (e) => { if ([...e.changedTouches].some((t) => t.touchType === 'stylus')) e.preventDefault(); }, { passive: false });

    s.addEventListener('pointerdown', (e) => this.down(e));
    s.addEventListener('pointermove', (e) => this.move(e));
    s.addEventListener('pointerup', (e) => this.up(e));
    s.addEventListener('pointercancel', () => { this.endPress(); if (this.drag && this.drag.mode !== 'mark') { this.drag = null; if (this.sel) this.selPop(); } else this.cancelDrag(); });
    // once a long press has chosen a word, the finger no longer scrolls: it moves the end of what is chosen
    s.addEventListener('touchmove', (e) => { if (this.drag && (this.drag.mode === 'touchsel' || this.drag.mode === 'handle')) e.preventDefault(); }, { passive: false });
    s.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('.textLayer, .sel-h')) e.preventDefault(); });
    s.addEventListener('dblclick', (e) => {   // the mouse: a double click chooses the word
      const c = this.caretAt(e.clientX, e.clientY); if (!c) return;
      const w = this.wordAt(c); this.sel = { a: w.a, b: w.b };
      if (this.drawSel()) this.selPop(); else this.clearSel();
    });

    // two fingers: pinch zooms (and, without a pinch, they scroll)
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

    this.onKey = (e) => this.key(e);
    document.addEventListener('keydown', this.onKey);
    this.onDocDown = (e) => { if (!e.target.closest('.rd-pop, .rd-note, .rd-tools')) { if (!this.drag) this.$('.rd-erase').hidden = true; } };
    document.addEventListener('pointerdown', this.onDocDown, true);
  }

  // caret position under a point: by the page's own letters, the line nearest the point first (the middle of each line, so a
  // point between two lines goes to the nearer, and a tall box of one line does not reach into the next), then the letter
  caretAt(x, y) {
    const pgEl = document.elementsFromPoint(x, y).map((e) => e.closest && e.closest('.pg')).find(Boolean);
    const p = pgEl ? this.pages[Number(pgEl.dataset.n)] : null;
    if (!p || !p.tl) return null;
    let best = null, bd = Infinity;
    for (const sp of p.tl.querySelectorAll('span')) {
      if (!sp.firstChild || sp.firstChild.nodeType !== 3 || !sp.textContent.trim()) continue;
      const r = sp.getBoundingClientRect(); if (!r.width) continue;
      const h = Math.max(4, r.height), cy = (r.top + r.bottom) / 2;
      const dy = Math.max(0, Math.abs(y - cy) - h * 0.35);
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const d = dy * 4 + dx;   // the same line before a nearer word on another
      if (d < bd) { bd = d; best = { sp, r }; }
    }
    if (!best || bd > 160) return null;
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

  // where a touch, a click or the Pencil goes: a handle of what is chosen, the Pencil marking, the mouse choosing, or a finger
  // that scrolls — unless it rests (a long press), which chooses the word under it
  down(e) {
    if (e.target.closest && e.target.closest('.rd-end')) return;
    this.tapStart = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
    if (e.button && e.button !== 0) return;
    if (this.two || !e.isPrimary) return;
    const capture = () => { try { this.scroller.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } };
    const hd = e.target.closest && e.target.closest('.sel-h');
    if (hd && this.sel) {
      const hr = hd.getBoundingClientRect(), lh = parseFloat(hd.style.getPropertyValue('--lh')) || 16;
      const px = hr.left + hr.width / 2, py = hd.dataset.h === 'a' ? hr.bottom - lh / 2 : hr.top + lh / 2;   // the middle of its line
      this.drag = { mode: 'handle', end: hd.dataset.h, moved: false, pid: e.pointerId, x: e.clientX, y: e.clientY, ox: px - e.clientX, oy: py - e.clientY, pointerType: e.pointerType };
      capture(); e.preventDefault(); this.hidePop();
      return;
    }
    if (e.pointerType === 'pen') {
      const kind = this.lastMark;
      this.clearSel();
      this.drag = { mode: 'mark', kind, color: kind === 'ul' ? this.ulColor : this.hlColor, start: this.caretAt(e.clientX, e.clientY), cur: null, moved: false, pid: e.pointerId, x: e.clientX, y: e.clientY, pointerType: 'pen' };
      capture(); e.preventDefault(); this.hidePop();
      return;
    }
    const onText = !!(e.target.closest && e.target.closest('.textLayer'));
    if (e.pointerType === 'mouse') {
      if (!onText) return;
      this.drag = { mode: 'sel', start: this.caretAt(e.clientX, e.clientY), cur: null, moved: false, pid: e.pointerId, x: e.clientX, y: e.clientY, pointerType: 'mouse' };
      capture(); e.preventDefault();
      return;
    }
    if (!onText) return;
    this.endPress();
    this.press = { x: e.clientX, y: e.clientY, pid: e.pointerId };
    this.pressT = setTimeout(() => this.longPress(), 420);
  }
  endPress() { clearTimeout(this.pressT); this.press = null; }
  longPress() {
    const lp = this.press; this.press = null;
    if (!lp || this.two || this.drag) return;
    const c = this.caretAt(lp.x, lp.y); if (!c) return;
    const w = this.wordAt(c);
    this.sel = { a: w.a, b: w.b, word: w };
    if (!this.drawSel()) { this.clearSel(); return; }
    this.hidePop();
    this.drag = { mode: 'touchsel', moved: false, pid: lp.pid, x: lp.x, y: lp.y, pointerType: 'touch' };
    try { this.scroller.setPointerCapture(lp.pid); } catch (err) { /* ignore */ }
    if (navigator.vibrate) navigator.vibrate(8);
  }
  move(e) {
    if (this.press && e.pointerId === this.press.pid && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 8) this.endPress();   // a scroll
    const d = this.drag; if (!d || e.pointerId !== d.pid) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
    d.moved = true;
    e.preventDefault();
    d.lastX = e.clientX; d.lastY = e.clientY;
    const c = d.mode === 'handle' ? this.caretAt(e.clientX + d.ox, e.clientY + d.oy) : this.caretAt(e.clientX, e.clientY);
    if (d.mode === 'mark') {
      if (!d.start) { d.start = c; return; }
      if (c) d.cur = c;
      this.preview();
    } else if (d.mode === 'sel') {
      if (!d.start) { d.start = c; return; }
      if (c) { this.sel = { a: d.start, b: c }; this.drawSel(); }
    } else if (d.mode === 'touchsel' && c && this.sel) {
      // from the word first chosen to wherever the finger goes, before it or after it
      const w = this.sel.word;
      if (this.before(c, w.a)) { this.sel.a = c; this.sel.b = w.b; } else { this.sel.a = w.a; this.sel.b = this.before(c, w.b) ? w.b : c; }
      this.drawSel();
    } else if (d.mode === 'handle' && c && this.sel) {
      this.sel[d.end] = c;
      if (this.before(this.sel.b, this.sel.a)) { const t = this.sel.a; this.sel.a = this.sel.b; this.sel.b = t; d.end = d.end === 'a' ? 'b' : 'a'; }
      this.drawSel();
    }
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
      if (v) { this.scroller.scrollTop += v; if (d.mode === 'mark') { const c = this.caretAt(d.lastX, d.lastY); if (c) { d.cur = c; this.preview(); } } else this.move({ pointerId: d.pid, clientX: d.lastX, clientY: d.lastY, preventDefault() {} }); this.asRaf = requestAnimationFrame(step); }
      else this.asRaf = 0;
    };
    this.asRaf = requestAnimationFrame(step);
  }
  up(e) {
    if (this.press && e.pointerId === this.press.pid) this.endPress();
    const d = this.drag;
    const ts = this.tapStart;
    const isTap = ts && e.pointerId === ts.id && Math.hypot(e.clientX - ts.x, e.clientY - ts.y) < 6 && Date.now() - ts.t < 600;
    if (d && e.pointerId === d.pid) {
      this.drag = null;
      try { this.scroller.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (d.mode === 'mark') {
        if (d.moved && d.range) {
          const list = this.marksFromRange(d.range, d.kind, d.color);
          this.clearPreview();
          this.addMarks(list);
          return;
        }
        this.clearPreview();
      } else if (d.mode === 'touchsel' || d.mode === 'handle' || (d.mode === 'sel' && d.moved && this.sel)) {
        if (this.sel && this.drawSel()) this.selPop(); else this.clearSel();
        return;
      }
    }
    if (isTap && !this.two) this.tap(e.clientX, e.clientY);
  }
  cancelDrag() { this.drag = null; this.clearPreview(); }

  tap(x, y) {
    if (this.sel) { this.clearSel(); this.hidePop(); return; }   // a tap away from what is chosen lets it go
    const pgEl = document.elementsFromPoint(x, y).map((e) => e.closest && e.closest('.pg')).find(Boolean);
    if (!pgEl) { this.hidePop(); return; }
    const p = this.pages[Number(pgEl.dataset.n)];
    const pr = pgEl.getBoundingClientRect();
    const fx = (x - pr.left) / pr.width, fy = (y - pr.top) / pr.height;
    // the small targets first (a cited case or article), then the marks they may lie in
    const c = this.caseAt(p, fx, fy);
    if (c) { this.refPop(c, x, y); return; }
    const m = this.markAt(p, fx, fy);
    if (m) { this.markPop(m, x, y); return; }
    this.hidePop();
  }

  twoStart(e) {
    if (e.touches.length !== 2) return;
    this.endPress();
    if (this.drag && this.drag.mode !== 'mark') this.drag = null; else this.cancelDrag();
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
    if (this.sel && !this.drag) setTimeout(() => { if (this.sel && !this.drag && this.drawSel()) this.selPop(); }, 60);   // what is chosen, at the new size
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
    if (e.key === 'Escape') { this.clearSel(); this.hidePop(); this.$('.rd-erase').hidden = true; return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && this.sel && this.sel.range) { e.preventDefault(); this.copy(this.clean(this.sel.range.toString())); return; }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); this.undo(); return; }
    if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); this.zoomBy(1.15); }
    else if ((e.metaKey || e.ctrlKey) && e.key === '-') { e.preventDefault(); this.zoomBy(1 / 1.15); }
    else if ((e.metaKey || e.ctrlKey) && e.key === '0') { e.preventDefault(); this.setZoom(1); }
  }

  markPop(m, x, y, colours = false) {
    const pop = this.$('.rd-pop');
    const list = m.kind === 'ul' ? UL : HL;
    const names = m.kind === 'ul' ? UL_NAMES : HL_NAMES;
    pop.classList.add('slim');
    pop.innerHTML = colours
      ? `<div class="pop-row pal">${list.map((c, i) => `<button data-c="${c}" class="${m.kind === 'ul' ? 'pl' : 'pd'} ${c === m.color ? 'on' : ''}" style="--c:${c}" aria-label="${names[i]}" title="${names[i]}"><i></i></button>`).join('')}</div>`
      : `<div class="pop-row acts"><button data-act="pal"><i class="${m.kind === 'ul' ? 'sa-line' : 'sa-dot'}" style="--c:${m.color}"></i><span>색</span></button><span class="sep"></span><button data-act="swap"><span>${m.kind === 'ul' ? '형광펜으로' : '밑줄로'}</span></button><span class="sep"></span><button data-act="copy"><span>복사</span></button><span class="sep"></span><button data-act="del" class="danger"><span>지우기</span></button></div>`;
    pop.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.act === 'pal') { this.markPop(m, x, y, true); return; }
      if (b.dataset.c) this.setMark(m.id, { color: b.dataset.c });
      else if (b.dataset.act === 'swap') this.setMark(m.id, m.kind === 'ul' ? { kind: 'hl', color: this.hlColor } : { kind: 'ul', color: this.ulColor });
      else if (b.dataset.act === 'copy') this.copy(m.text);
      else if (b.dataset.act === 'del') this.deleteMark(m.id);
      this.hidePop();
    };
    this.showPop('mark', { left: x - 1, right: x + 1, top: y - 10, bottom: y + 10, width: 2, height: 20 });
  }
  // the box over the page for a cited 헌재 decision, court judgment or article; a case number in it opens that one, ‹ goes back
  refPop(c, x, y) {
    this.noteTrail = []; this.noteFrom = { x, y }; this.noteSide = null;
    this.noteShow(c.kind === 'art' ? { kind: 'art', ref: { law: c.law, art: c.art, sub: c.sub, para: c.para } } : { kind: c.kind, no: c.no });
  }
  noteShow(v) {
    this.noteView = v;
    const n = this.$('.rd-note');
    n.classList.add('case');
    n.innerHTML = `<div class="note-h">${this.noteTrail.length ? `<button class="ib" data-act="back" aria-label="뒤로">${ICON.back}</button>` : ''}<b></b><button class="ib" data-act="copy" aria-label="복사">${ICON.copy}</button><button class="ib" data-act="x" aria-label="닫기">${ICON.close}</button></div><div class="note-t"></div>`;
    const head = n.querySelector('.note-h b'), body = n.querySelector('.note-t');
    if (v.kind === 'case') { head.textContent = '헌재 ' + v.no; v.copy = '헌재 ' + v.no; body.innerHTML = '<p class="cs-wait">불러오는 중…</p>'; this.caseFill(v, head, body); }
    else if (v.kind === 'court') { head.textContent = v.no; v.copy = v.no; body.innerHTML = '<p class="cs-wait">불러오는 중…</p>'; this.courtFill(v, head, body); }
    else { const t = `${v.ref.law} ${artLabel(v.ref)}${v.ref.para ? ` 제${v.ref.para}항` : ''}`; head.textContent = t; v.copy = t; body.innerHTML = '<p class="cs-wait">불러오는 중…</p>'; this.artFill(v, head, body); }
    n.onclick = (e) => {
      const go = (to) => { this.noteTrail.push(v); this.noteShow(to); };
      const ln = e.target.closest('[data-case]');
      if (ln) { if (!(v.kind === 'case' && v.no === ln.dataset.case)) go({ kind: 'case', no: ln.dataset.case }); return; }
      const lc = e.target.closest('[data-court]');
      if (lc) { if (!(v.kind === 'court' && v.no === lc.dataset.court)) go({ kind: 'court', no: lc.dataset.court }); return; }
      const la = e.target.closest('[data-art]');
      if (la) { const r = articleQuery(la.dataset.art); if (r) go({ kind: 'art', ref: r }); return; }
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'back') { this.noteShow(this.noteTrail.pop()); return; }
      if (b.dataset.act === 'copy') this.copy(v.copy);
      this.hideNote();
    };
    this.notePlace();
  }
  async caseFill(v, head, body) {
    const show = (d) => {
      if (this.noteView !== v) return;
      head.textContent = cite(d); v.copy = cite(d);
      body.innerHTML = caseView(d); wireCase(body, d);
      this.notePlace();
    };
    let d;
    try { d = await (this.o.decision ? this.o.decision(v.no, show) : Promise.reject(Object.assign(new Error('x'), { code: 'unavailable' }))); }
    catch (e) {
      if (this.noteView !== v) return;
      body.innerHTML = `<p class="cs-wait">${e && e.code === 'offline' ? '인터넷에 연결되면 결정 내용을 볼 수 있습니다.' : '지금은 결정을 불러오지 못했습니다. 잠시 뒤 다시 눌러 보세요.'}</p>`;
      this.notePlace(); return;
    }
    if (!d) { if (this.noteView === v) { body.innerHTML = '<p class="cs-wait">헌법재판소 판례정보에서 찾지 못했습니다. 병합된 사건의 뒷번호이거나 아직 실리지 않은 결정일 수 있습니다.</p>'; this.notePlace(); } return; }
    show(d);
  }
  async courtFill(v, head, body) {
    const msg = (html) => { if (this.noteView === v) { body.innerHTML = html; this.notePlace(); } };
    // (a judgment the 법제처 mirror lacks is not at a /판례/ address either: the site's search, said to be one)
    const out = `<a class="btn ghost small" href="${lawGoKr.precSearch((courtQuery(v.no) || { no: v.no }).no)}" target="_blank" rel="noopener">국가법령정보센터에서 검색</a>`;
    let d;
    try { d = await (this.o.courtCase ? this.o.courtCase(v.no) : Promise.reject(Object.assign(new Error('x'), { code: 'unavailable' }))); }
    catch (e) {
      const why = e && e.code === 'offline' ? '인터넷에 연결되면 판결을 볼 수 있습니다.' : '지금은 판결을 불러오지 못했습니다. 잠시 뒤 다시 눌러 보세요.';
      msg(`<p class="cs-wait">${why}</p><p>${out}</p>`); return;
    }
    if (!d) { msg(`<p class="cs-wait">법제처가 공개한 판결 가운데 이 사건이 없습니다. 공개되지 않은 판결이거나 번호가 다를 수 있습니다.</p><p>${out}</p>`); return; }
    if (this.noteView !== v) return;
    head.textContent = courtCite(d); v.copy = courtCite(d);
    body.innerHTML = judgmentView(d); wireCase(body, d);
    this.notePlace();
  }
  async artFill(v, head, body) {
    const r = v.ref;
    // the way out to 국가법령정보센터: an address only for what was found there (the law in force, the article it has);
    // a name the app could not find (a repealed or renamed law, a foreign one) gets the site's search, said to be one
    const outTo = (law, a) => (law ? `<a class="btn ghost small" href="${a ? lawGoKr.article(law.full, a.art, a.sub) : lawGoKr.law(law.full)}" target="_blank" rel="noopener">국가법령정보센터에서 보기</a>`
      : `<a class="btn ghost small" href="${lawGoKr.search(r.law === '헌법' ? '대한민국헌법' : r.law)}" target="_blank" rel="noopener">국가법령정보센터에서 검색</a>`);
    const out = outTo(null);
    const reviewed = r.law === '헌법' ? '' : `<details class="cs-fold" data-reviewed><summary>이 조문을 심판한 헌재 결정</summary><p></p></details>`;
    const wire = () => {
      const f = body.querySelector('[data-reviewed]');
      if (!f || !this.o.reviewed) return;
      f.addEventListener('toggle', async () => {
        const p = f.querySelector('p'); if (!f.open || p.dataset.done) return; p.dataset.done = '1'; p.textContent = '찾는 중…';
        try {
          const got = await this.o.reviewed(r.law, r.art, r.para);
          p.innerHTML = got.rows.length ? got.rows.map((x) => `<button type="button" class="case-ln" data-case="${esc(x.no)}">${esc(x.no)}</button> ${esc(x.result || '')}${x.date ? ' · ' + esc(x.date) : ''}`).join('<br>') + (got.total > got.rows.length ? `<br>외 ${got.total - got.rows.length}건` : '') : '없습니다';
        } catch (e) { p.textContent = '지금은 찾지 못했습니다'; }
      });
    };
    let got;
    try { got = await (this.o.article ? this.o.article(r) : Promise.reject(Object.assign(new Error('x'), { code: 'unavailable' }))); }
    catch (e) {
      if (this.noteView !== v) return;
      const why = e && e.code === 'offline' ? '인터넷에 연결되면 조문을 볼 수 있습니다.'
        : e && e.code === 'nolaw' ? '현행 법령 가운데 이 이름의 법령이 없습니다. 폐지되었거나 이름이 바뀐 법률, 또는 외국 법률일 수 있습니다.'
        : e && e.code === 'repealed' ? `폐지된 법률입니다${e.date ? ` (${esc(dateText(String(e.date).replace(/-/g, '')))} 폐지)` : ''}.`
        : '지금은 조문을 불러오지 못했습니다. 잠시 뒤 다시 눌러 보세요.';
      body.innerHTML = `<p class="cs-wait">${why}</p><p>${out}</p>${reviewed}`; wire(); this.notePlace(); return;
    }
    if (this.noteView !== v) return;
    const { law, a } = got;
    if (r.art === '전문') {   // 헌법 전문: the preamble itself
      head.textContent = '헌법 전문'; v.copy = `대한민국헌법 전문\n${law.preamble || ''}`.trim();
      body.innerHTML = (law.preamble ? `<div class="lc-t"><p>${esc(law.preamble)}</p></div>` : '<p class="cs-wait">전문을 불러오지 못했습니다.</p>') + `<p>${outTo(law)}</p>`;
      this.notePlace(); return;
    }
    if (!a) { body.innerHTML = `<p class="cs-wait">${esc(law.full)}에 그 조문이 없습니다 · 마지막 조문은 ${artLabel(law.arts[law.arts.length - 1] || { art: 0 })}입니다.</p><p>${outTo(law)}</p>${reviewed}`; wire(); this.notePlace(); return; }
    const ps = paras(a), pick = r.para && ps[r.para - 1] ? r.para : 0;
    head.textContent = `${law.full} ${artLabel(a)}${pick ? ` 제${pick}항` : ''}`;
    v.copy = `${law.full} ${artLabel(a)}${pick ? ` 제${pick}항` : ''}\n${pick ? ps[pick - 1] : a.text}`;
    // a coming amendment: the article as it will read (what changes marked), or that it stays; a text not yet in force says so
    const pend = pendingArt(law, a);
    const coming = law.ahead ? `<p class="lc-ahead">${esc(dateText(law.rev))}부터 시행되는 조문입니다. 지금 시행 중인 조문은 국가법령정보센터에서 확인하세요.</p>`
      : !law.next ? '' : !pend ? `<p class="lc-same">${esc(dateText(law.next.rev))} 시행 예정 개정이 있으나 이 조문은 그대로입니다.</p>`
      : !pend.art ? `<p class="lc-ahead">${esc(pend.date)}부터 이 조문은 없어집니다.</p>`
      : `<details class="lc-next" open><summary>${esc(pend.date)}부터 이렇게 바뀝니다</summary><div class="lc-t">${pendingParas(a, pend.art).map((p) => (p.diff ? `<p class="chg">${p.diff.map(([k, t]) => (k === '=' ? esc(t) : k === '+' ? `<ins>${esc(t)}</ins>` : `<del>${esc(t)}</del>`)).join('')}</p>` : `<p>${linkCases(p.text)}</p>`)).join('')}</div></details>`;
    body.innerHTML = `${a.title ? `<div class="cs-name">${artLabel(a)}(${esc(a.title)})</div>` : ''}<div class="cs-meta">${[a.chapter, law.title].filter(Boolean).map(esc).join(' · ')}</div>`
      + `<div class="lc-t">${ps.map((t, k) => `<p class="${pick === k + 1 ? 'on' : ''}">${linkCases(t)}</p>`).join('')}</div>${coming}<p>${outTo(law, a)}</p>${reviewed}`;
    wire();
    this.notePlace();
  }
  // near where it was opened: below that point when there is room, else above. The side is chosen once, for the room the
  // box will want (a decision grows when its text arrives), and the edge by the tapped place stays put — the box grows away
  // from it instead of jumping over it.
  notePlace() {
    const n = this.$('.rd-note'), { x, y } = this.noteFrom || { x: 0, y: 0 };
    n.hidden = false;
    const W = this.root.clientWidth, H = this.root.clientHeight, wide = n.classList.contains('case');
    const w = Math.min(wide ? 560 : 460, W - 24);
    n.style.width = w + 'px';
    n.style.left = clamp(x - w / 2, 12, W - w - 12) + 'px';
    const below = H - 70 - (y + 18), above = y - 18 - 60;
    const max = Math.round(wide ? Math.min(H * 0.72, 720) : H * 0.5);
    if (Math.max(below, above) < 200) { this.noteSide = 'middle'; n.style.bottom = ''; n.style.top = '60px'; n.style.maxHeight = (H - 130) + 'px'; return; }
    if (!this.noteSide || this.noteSide === 'middle') {
      n.style.maxHeight = max + 'px';
      const need = wide ? Math.min(max, 420) : Math.min(max, n.offsetHeight);
      this.noteSide = below >= need || below >= above ? 'below' : 'above';
    }
    if (this.noteSide === 'below') { n.style.bottom = ''; n.style.top = (y + 18) + 'px'; n.style.maxHeight = Math.min(max, below) + 'px'; }
    else { n.style.top = 'auto'; n.style.bottom = (H - (y - 18)) + 'px'; n.style.maxHeight = Math.min(max, above) + 'px'; }
  }
  hideNote() { this.$('.rd-note').hidden = true; }
  showPop(kind, rect, above) {
    const pop = this.$('.rd-pop');
    pop.hidden = false; this.popKind = kind;
    const R = this.root.getBoundingClientRect();
    const W = this.root.clientWidth, w = pop.offsetWidth, h = pop.offsetHeight;
    let left = (rect.left + rect.right) / 2 - R.left - w / 2;
    left = clamp(left, 8, W - w - 8);
    let top = above ? rect.top - R.top - h - 16 : rect.bottom - R.top + 12;
    if (above && top < 56) top = rect.bottom - R.top + 26;   // no room above: below, clear of the handle
    else if (!above && top + h > this.root.clientHeight - 80) top = rect.top - R.top - h - 12;
    const y = clamp(top, 56, Math.max(56, this.root.clientHeight - h - 84));
    pop.style.left = left + 'px'; pop.style.top = y + 'px';
    pop.style.setProperty('--cx', `${clamp((rect.left + rect.right) / 2 - R.left - left, 16, w - 16)}px`);
    pop.classList.toggle('below', y > rect.top - R.top);
    pop.classList.remove('in'); void pop.offsetWidth; pop.classList.add('in');
    this.hideNote();
  }
  hidePop() { const pop = this.$('.rd-pop'); if (pop) { pop.hidden = true; pop.classList.remove('slim', 'in', 'below'); } this.popKind = null; this.hideNote(); }
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
  // (a page before the one printed 1 — a notice or a cover put before the paper — has no number of its own: 표지)
  label(n) { const o = this.labelOff(), v = n + 1 + (o == null ? 0 : o); return v >= 1 ? String(v) : '표지'; }
  unit() { return this.labels && this.labels.confident ? '면' : '쪽'; }
  pageName(n) { const l = this.label(n); return l === '표지' ? l : l + this.unit(); }   // a page by itself, as a mark or a hit names it (표지, not 표지면)
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
        // the PDF's own bookmarks, when they are a real contents list (three or more, on more than one page); a file with one
        // or two (its title, its journal) shows the list made from its headings instead
        const real = flat.filter((x) => x.page != null);
        if (real.length >= 3 && new Set(real.map((x) => x.page)).size >= 2) this.outline = real;
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
      box.innerHTML = ms.length ? '<ul class="mlist">' + ms.map((m) => `<li><button data-mark="${m.id}"><i class="${m.kind === 'ul' ? 'uw' : 'sw'}" style="--c:${m.color}"></i><span>${esc(m.text)}</span><em>${this.pageName(m.p)}</em></button></li>`).join('') + '</ul>'
        : '<p class="empty">아직 밑줄이 없습니다.<br>형광펜이나 밑줄을 켜고 글자 위를 드래그하세요.</p>';
      if (ms.length) box.insertAdjacentHTML('beforeend', '<div class="mfoot"><button type="button" class="btn ghost" data-copyall>모두 복사</button><span class="sp"></span><button type="button" class="btn ghost danger" data-clear>밑줄 모두 지우기</button></div>');
    }
  }
  panelClick(e) {
    if (e.target.closest('[data-clear]')) { this.erase('all'); return; }
    if (e.target.closest('[data-copyall]')) {   // every marked passage, in reading order, with its printed page
      const ms = this.marks().sort((a, b) => a.p - b.p || a.rects[0][1] - b.rects[0][1] || a.rects[0][0] - b.rects[0][0]);
      this.copy([this.o.title || '', '', ...ms.map((m) => `${this.pageName(m.p)}  ${m.text}`)].join('\n'));
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
    const plain = hangulize(q.replace(/\s+/g, '')).toLowerCase(), sk = soft(plain);   // hanja read in Hangul (see naming.searchForm)
    const hits = [];
    texts.forEach((t, page) => {
      const { flat, map, han } = squeeze(t), key = han ? sk : plain;
      let i = flat.indexOf(key);
      while (i >= 0 && hits.length < 999) {
        const a = map[i], b = map[i + key.length - 1] + 1;
        hits.push({ page, snip: t.slice(Math.max(0, a - 28), a), word: t.slice(a, b), after: t.slice(b, b + 40) });
        i = flat.indexOf(key, i + key.length);
      }
    });
    this.hits = hits;
    n.textContent = hits.length ? `${hits.length}곳` : '없음';
    list.innerHTML = hits.slice(0, 200).map((h, i) => `<button data-hit="${i}"><em>${this.pageName(h.page)}</em><span>…${esc(h.snip)}<mark>${esc(h.word)}</mark>${esc(h.after)}…</span></button>`).join('');
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
    const plain = hangulize(this.findQ.replace(/\s+/g, '')).toLowerCase();
    const nodes = []; let flat = ''; const map = []; let han = false;
    const w = document.createTreeWalker(p.tl, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const t = w.currentNode; nodes.push(t); const s = t.data, src = HAS_HAN.test(s) ? (han = true, searchForm(s)) : s; for (let i = 0; i < s.length; i++) { if (!/\s/.test(s[i])) { flat += src[i].toLowerCase(); map.push([t, i]); } } }
    if (han) flat = soft(flat);   // a page with hanja: compared as naming.searchForm does
    const key = han ? soft(plain) : plain;
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
    if (this.endNear) this.endNear.disconnect();
    if (this.endSeen) this.endSeen.disconnect();
    if (this.ro) this.ro.disconnect();
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('pointerdown', this.onDocDown, true);
    clearTimeout(this.restT); this.endPress();
    for (const p of this.pages) {
      this.release(p);
      if (p.ptask) { try { p.ptask.cancel(); } catch (e) { /* ignore */ } }
      if (p.snap) URL.revokeObjectURL(p.snap);
      try { p.pdfPage && p.pdfPage.cleanup(); } catch (e) { /* ignore */ }
    }
    this.root.remove();
  }
}

let ocrMeasure = null;
// every box of B lies within a box of A on the same line (A covers B)
function covers(A, B) {
  const e = 0.004;
  return B.every((r) => A.some((q) => {
    const top = Math.max(q[1], r[1]), bot = Math.min(q[1] + q[3], r[1] + r[3]);
    return bot - top >= 0.6 * Math.min(q[3], r[3]) && q[0] <= r[0] + e && q[0] + q[2] >= r[0] + r[2] - e;
  }));
}

// text without white space, with a map back to positions in the original
function squeeze(t) {   // (hanja read in Hangul, as 찾기 compares them)
  const han = HAS_HAN.test(t), src = han ? searchForm(t) : t;
  let flat = ''; const map = [];
  for (let i = 0; i < t.length; i++) if (!/\s/.test(t[i])) { flat += src[i].toLowerCase(); map.push(i); }
  return { flat, map, han };
}
