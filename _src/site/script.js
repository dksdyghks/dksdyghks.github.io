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
  if (!calm && 'IntersectionObserver' in window && window.matchMedia && matchMedia('(min-width: 1024px)').matches) {
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
    var spy = { view: view, bar: bar, toc: toc, marker: view.querySelector('.toc-mark'), links: links, ids: ids, current: null, lockUntil: 0 };
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
    bar.classList.toggle('fade-l', max > 1 && bar.scrollLeft > 2);
    bar.classList.toggle('fade-r', max > 1 && bar.scrollLeft < max - 2);
  }

  // Contents rail: the gold marker slides to the current section.
  function placeMarker(spy, instant) {
    if (!spy.marker || spy.view.hidden) return;
    var a = spy.links.filter(function (l) { return spy.toc.contains(l) && l.classList.contains('on'); })[0];
    if (!a || !a.offsetHeight) return;
    if (instant) spy.marker.classList.add('still');
    spy.marker.style.transform = 'translateY(' + a.offsetTop + 'px)';
    spy.marker.style.height = a.offsetHeight + 'px';
    spy.marker.style.opacity = '1';
    if (instant) { void spy.marker.offsetHeight; spy.marker.classList.remove('still'); }
  }

  function mark(spy, id) {
    if (spy.current === id) return;
    var first = spy.current === null;
    spy.current = id;
    spy.links.forEach(function (l) {
      var on = l.getAttribute('href').slice(1) === id;
      l.classList.toggle('on', on);
      if (on) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current');
    });
    placeMarker(spy, first);
    var a = spy.bar && spy.links.filter(function (l) { return spy.bar.contains(l) && l.classList.contains('on'); })[0];
    if (a && spy.bar.scrollWidth > spy.bar.clientWidth) {
      spy.bar.scrollTo({ left: Math.max(0, a.offsetLeft - spy.bar.clientWidth / 2 + a.offsetWidth / 2), behavior: first ? 'auto' : 'smooth' });
    }
  }

  function update() {
    spies.forEach(function (spy) { if (spy.bar && !spy.view.hidden) edges(spy.bar); });
    Object.keys(views).forEach(function (k) {
      var v = views[k];
      if (v.hidden) return;
      var hero = v.querySelector('.hero'), fab = v.querySelector('.lang-fab');
      if (hero && fab) fab.classList.toggle('show', hero.getBoundingClientRect().bottom < 0);
    });
    spies.forEach(function (spy) {
      if (spy.view.hidden || Date.now() < spy.lockUntil) return;
      var nav = spy.view.querySelector('.nav');
      var offset = (nav && nav.offsetHeight) || 0;
      var threshold = offset + window.innerHeight * 0.3;
      var best = spy.ids[0], bestTop = -Infinity;
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
    spies.forEach(function (s) { s.current = null; });
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
      root.classList.add('ready');
      if (document.startViewTransition && !calm) document.startViewTransition(function () { switchTo(b.dataset.lang); });
      else switchTo(b.dataset.lang);
    });
  });

  setLang(initialLang(), false);
  if (location.hash.length > 1) {
    var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) { showNow(target); requestAnimationFrame(function () { target.scrollIntoView(); revealInView(visibleView()); }); }
  }

  // The signature-style name is written in once, on first load.
  setTimeout(function () { root.classList.add('ready'); }, 1900);

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
