(function () {
  var root = document.documentElement;
  var views = { ko: document.getElementById('view-ko'), en: document.getElementById('view-en') };
  var buttons = document.querySelectorAll('.lang-btn');
  var onSite = /(^|\.)0128\.kr$|github\.io$/.test(location.hostname);
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Language: ?lang= in the link, then a section link (#en-…), then the visitor's last choice, then the browser language.
  function initialLang() {
    try {
      var q = new URLSearchParams(location.search).get('lang');
      if (q === 'ko' || q === 'en') return q;
    } catch (e) {}
    if (/^#en-/.test(location.hash)) return 'en';
    if (location.hash && location.hash.length > 1) return 'ko';
    try {
      var saved = localStorage.getItem('lang');
      if (saved === 'ko' || saved === 'en') return saved;
    } catch (e) {}
    var langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'ko']).join(',').toLowerCase();
    return /(^|,)ko/.test(langs) ? 'ko' : 'en';
  }

  function setLang(lang, save) {
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== lang; });
    root.lang = lang;
    if (views[lang].dataset.title) document.title = views[lang].dataset.title;
    if (save) {
      try { localStorage.setItem('lang', lang); } catch (e) {}
      if (onSite && window.history && history.replaceState) {
        try {
          var url = new URL(location.href);
          if (lang === 'en') url.searchParams.set('lang', 'en'); else url.searchParams.delete('lang');
          url.hash = '';
          history.replaceState(null, '', url.toString());
        } catch (e) {}
      }
    }
  }

  // Cards rise in gently the first time they come into view.
  var io = null;
  // (desktop only: on phones content should simply be there as you swipe)
  // (and only with a mouse or trackpad: on iPads, Safari can leave a card's edge behind as a line after the rise)
  if (!calm && 'IntersectionObserver' in window && window.matchMedia && matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)').matches) {
    root.classList.add('reveal');
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
    document.querySelectorAll('.card').forEach(function (c) { io.observe(c); });
  }
  function showNow(el) {
    var card = el && el.closest && el.closest('.card');
    if (io && card && !card.classList.contains('in')) { card.classList.add('in', 'now'); io.unobserve(card); }
  }
  function revealInView(view) {
    if (!io) return;
    view.querySelectorAll('.card:not(.in)').forEach(function (c) {
      if (c.getBoundingClientRect().top < window.innerHeight) { c.classList.add('in'); io.unobserve(c); }
    });
  }

  // Contents: highlight the section in view. A clicked link stays highlighted until the scroll settles.
  var spies = Object.keys(views).map(function (k) {
    var view = views[k];
    var bar = view.querySelector('.nav-links');
    var toc = view.querySelector('.toc');
    var links = Array.prototype.slice.call(view.querySelectorAll('.nav-links a, .toc a'));
    var ids = [];
    links.forEach(function (a) { var id = a.getAttribute('href').slice(1); if (ids.indexOf(id) === -1) ids.push(id); });
    var spy = { view: view, bar: bar, toc: toc, marker: view.querySelector('.toc-mark'), links: links, ids: ids, current: undefined, lockUntil: 0 };
    links.forEach(function (a) {
      a.addEventListener('click', function () {
        var id = a.getAttribute('href').slice(1);
        showNow(document.getElementById(id));  // land exactly on the section, not where it sat before rising in
        spy.lockUntil = Date.now() + 900; mark(spy, id);
      });
    });
    if (bar) bar.addEventListener('scroll', function () { edges(bar); }, { passive: true });
    return spy;
  });

  // Pill bar: fade an edge only while more pills are hidden beyond it.
  function edges(bar) {
    var max = bar.scrollWidth - bar.clientWidth;
    var box = bar.parentNode;
    box.classList.toggle('fade-l', max > 1 && bar.scrollLeft > 2);
    box.classList.toggle('fade-r', max > 1 && bar.scrollLeft < max - 2);
  }

  // Contents rail: the gold marker slides to the current section.
  function placeMarker(spy, instant) {
    if (!spy.marker || spy.view.hidden) return;
    var a = spy.links.filter(function (l) { return spy.toc.contains(l) && l.classList.contains('on'); })[0];
    if (!a || !a.offsetHeight) { spy.marker.style.opacity = '0'; return; }
    if (instant) spy.marker.classList.add('still');
    spy.marker.style.transform = 'translateY(' + a.offsetTop + 'px)';
    spy.marker.style.height = a.offsetHeight + 'px';
    spy.marker.style.opacity = '1';
    if (instant) { void spy.marker.offsetHeight; spy.marker.classList.remove('still'); }
  }

  function mark(spy, id) {
    if (spy.current === id) return;
    var first = spy.current === undefined;
    spy.current = id;
    spy.links.forEach(function (l) {
      var on = l.getAttribute('href').slice(1) === id;
      l.classList.toggle('on', on);
      if (on) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current');
    });
    placeMarker(spy, first);
    var a = spy.bar && spy.links.filter(function (l) { return spy.bar.contains(l) && l.classList.contains('on'); })[0];
    if (spy.bar && spy.bar.scrollWidth > spy.bar.clientWidth && (a || first)) {
      spy.bar.scrollTo({ left: !a ? 0 : Math.max(0, a.offsetLeft - spy.bar.clientWidth / 2 + a.offsetWidth / 2), behavior: first ? 'auto' : 'smooth' });
    }
  }

  function update() {
    spies.forEach(function (spy) { if (spy.bar && !spy.view.hidden) edges(spy.bar); });
    Object.keys(views).forEach(function (k) {
      var v = views[k];
      if (v.hidden) return;
      var hero = v.querySelector('.hero'), fab = v.querySelector('.fabs');
      if (hero && fab) fab.classList.toggle('show', hero.getBoundingClientRect().bottom < 0);
    });
    spies.forEach(function (spy) {
      if (spy.view.hidden || Date.now() < spy.lockUntil) return;
      var nav = spy.view.querySelector('.nav');
      var offset = (nav && nav.offsetHeight) || 0;
      var threshold = offset + window.innerHeight * 0.3;
      var best = null, bestTop = -Infinity;
      spy.ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        var top = el.getBoundingClientRect().top;
        if (top <= threshold && top > bestTop + 1) { best = id; bestTop = top; }
      });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) best = spy.ids[spy.ids.length - 1];
      mark(spy, best);
    });
  }

  // Switching language keeps the reader on the same entry: both views share one structure,
  // so the n-th block in one view is the same entry in the other.
  var BLOCKS = '.hero, .card, .card li';
  function visibleView() { return views.ko.hidden ? views.en : views.ko; }
  function anchor(view) {
    var nav = view.querySelector('.nav'), line = ((nav && nav.offsetHeight) || 0) + 8;
    var els = view.querySelectorAll(BLOCKS), at = { i: 0, top: els.length ? els[0].getBoundingClientRect().top : 0 };
    for (var i = 0; i < els.length; i++) {
      var t = els[i].getBoundingClientRect().top;
      if (t <= line) at = { i: i, top: t };
    }
    return at;
  }

  function switchTo(lang) {
    var at = anchor(visibleView());
    setLang(lang, true);
    spies.forEach(function (s) { s.current = undefined; });
    var view = visibleView();
    // the other language's cards are shown at once (no rise), so the switch never lands on blank space
    if (io) view.querySelectorAll('.card:not(.in)').forEach(function (c) { c.classList.add('in', 'now'); io.unobserve(c); });
    var twin = view.querySelectorAll(BLOCKS)[at.i];
    var prev = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    if (twin) window.scrollTo(0, twin.getBoundingClientRect().top + window.scrollY - at.top);
    root.style.scrollBehavior = prev;
    update();
  }

  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      if (document.startViewTransition && !calm) document.startViewTransition(function () { switchTo(b.dataset.lang); });
      else switchTo(b.dataset.lang);
    });
  });

  // Back to top: the launcher lifts off, then lands back in its circle
  function launch(b) {
    b.classList.remove('back'); b.classList.add('launch');
    setTimeout(function () { b.classList.remove('launch'); b.classList.add('back'); }, 900);
    setTimeout(function () { b.classList.remove('back'); }, 1400);
  }
  document.querySelectorAll('.top-fab').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!calm) launch(b);
      window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' });
      var h = visibleView().querySelector('.name');  // keyboard and screen-reader users land at the top too
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    });
  });

  // Copy (e-mail address, citations) with a short confirmation
  var toast = document.querySelector('.toast'), toastTimer = 0;
  function say(msg) {
    if (!toast) return;
    toast.textContent = msg; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 1800);
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (ok, fail) {
      var t = document.createElement('textarea');
      t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy') ? ok() : fail(); } catch (e) { fail(e); }
      document.body.removeChild(t);
    });
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-copy]');
    if (!b) return;
    copyText(b.dataset.copy).then(function () {
      say(b.dataset.done); b.classList.add('ok');
      setTimeout(function () { b.classList.remove('ok'); }, 1600);
    }, function () { say(root.lang === 'ko' ? '복사하지 못했습니다' : 'Could not copy'); });
  });

  // With a mouse: a soft light follows the pointer over the hero and brightens the preamble around it
  if (!calm && window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    root.classList.add('glow');
    document.querySelectorAll('.hero').forEach(function (h) {
      var near = h.querySelector('.preamble.near'), frame = 0, last = null;
      function paint() {
        frame = 0; if (!last) return;
        var r = h.getBoundingClientRect();
        h.style.setProperty('--mx', (last.x - r.left) + 'px'); h.style.setProperty('--my', (last.y - r.top) + 'px');
        if (near) { var q = near.getBoundingClientRect(); near.style.setProperty('--px', (last.x - q.left) + 'px'); near.style.setProperty('--py', (last.y - q.top) + 'px'); }
      }
      h.addEventListener('pointermove', function (e) {
        last = { x: e.clientX, y: e.clientY }; h.classList.add('lit');
        if (!frame) frame = requestAnimationFrame(paint);
      }, { passive: true });
      h.addEventListener('pointerleave', function () { h.classList.remove('lit'); });
    });
  }

  // While the visitor is on another tab, the cat in the tab icon falls asleep; it wakes when they come back
  (function () {
    var icons = Array.prototype.slice.call(document.querySelectorAll('link[rel="icon"][data-sleep]'));
    if (!icons.length || !('hidden' in document)) return;
    icons.forEach(function (l) { l.setAttribute('data-awake', l.getAttribute('href')); (new Image()).src = l.getAttribute('data-sleep'); });
    function swap(asleep) {
      icons = icons.map(function (l) {  // a fresh <link> makes every browser repaint the tab icon
        var n = l.cloneNode(false);
        n.setAttribute('href', l.getAttribute(asleep ? 'data-sleep' : 'data-awake'));
        l.parentNode.replaceChild(n, l);
        return n;
      });
    }
    document.addEventListener('visibilitychange', function () { swap(document.hidden); });
  })();

  setLang(initialLang(), false);
  if (location.hash.length > 1) {
    var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) { showNow(target); requestAnimationFrame(function () { target.scrollIntoView(); revealInView(visibleView()); }); }
  }

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; update(); });
  }, { passive: true });
  window.addEventListener('resize', function () { update(); spies.forEach(function (s) { placeMarker(s, true); }); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { spies.forEach(function (s) { placeMarker(s, true); }); });
  update();
})();
