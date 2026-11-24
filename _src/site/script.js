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
    var timer = 0;
    b.addEventListener('pointerdown', function () { b._held = false; timer = setTimeout(function () { b._held = true; catWalk(); }, 650); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (n) { b.addEventListener(n, function () { clearTimeout(timer); }); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    b.addEventListener('click', function () {
      if (b._held) { b._held = false; return; }  // that press called the cat
      if (!calm) launch(b);
      window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' });
      var h = visibleView().querySelector('.name');  // keyboard and screen-reader users land at the top too
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    });
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

  // The cat in the tab icon: from 11 pm to 5 am it wears a night cap; while the visitor is on another tab it falls
  // asleep, and it wakes when they come back
  (function () {
    var icons = Array.prototype.slice.call(document.querySelectorAll('link[rel="icon"][data-sleep]'));
    if (!icons.length) return;
    icons.forEach(function (l) {
      l.setAttribute('data-day', l.getAttribute('href'));
      ['data-sleep', 'data-night', 'data-night-sleep'].forEach(function (a) { if (l.getAttribute(a)) (new Image()).src = l.getAttribute(a); });
    });
    function apply() {
      var h = new Date().getHours(), night = h >= 23 || h < 5, away = document.hidden;
      var key = night ? (away ? 'data-night-sleep' : 'data-night') : (away ? 'data-sleep' : 'data-day');
      icons = icons.map(function (l) {
        var want = l.getAttribute(key) || l.getAttribute('data-day');
        if (l.getAttribute('href') === want) return l;
        var n = l.cloneNode(false);  // a fresh <link> makes every browser repaint the tab icon
        n.setAttribute('href', want);
        l.parentNode.replaceChild(n, l);
        return n;
      });
    }
    document.addEventListener('visibilitychange', apply);
    setInterval(apply, 60000);
    apply();
  })();

  // Gold-foil signature: the light on the name follows the mouse over the hero; on a phone, a finger on the hero,
  // the tilt of the phone (where the browser reports it without asking) or the scroll
  (function () {
    var names = document.querySelectorAll('.view .name');
    if (!names.length || calm) return;
    var frame = 0, want = 30;
    function paint() { frame = 0; names.forEach(function (n) { n.style.setProperty('--sheen', want + '%'); }); }
    function set(p) { want = Math.max(0, Math.min(100, p)); if (!frame) frame = requestAnimationFrame(paint); }
    var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
    document.querySelectorAll('.hero').forEach(function (h) {
      if (fine) h.addEventListener('pointermove', function (e) { var r = h.getBoundingClientRect(); set(100 - (e.clientX - r.left) / r.width * 100); }, { passive: true });
      else h.addEventListener('touchmove', function (e) { var r = h.getBoundingClientRect(), t = e.touches[0]; set(100 - (t.clientX - r.left) / r.width * 100); }, { passive: true });
    });
    if (!fine) {
      window.addEventListener('scroll', function () { set(30 + Math.min(1, window.scrollY / 400) * 60); }, { passive: true });
      window.addEventListener('deviceorientation', function (e) { if (e.gamma != null) set(50 - e.gamma * 1.4); }, { passive: true });
    }
  })();

  // Snow on the photo of the frozen lake: while a mouse rests on it, or for a few seconds after a tap;
  // now and then a glint runs across the ice
  (function () {
    if (calm || !window.requestAnimationFrame) return;
    var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
    document.querySelectorAll('.view .id').forEach(function (box) {
      var img = box.querySelector('.photo'); if (!img) return;
      var cv = document.createElement('canvas'); cv.className = 'photo-snow'; cv.setAttribute('aria-hidden', 'true');
      box.appendChild(cv);
      var ctx = cv.getContext('2d'), flakes = [], running = false, until = 0, last = 0, clock = 0, fade = 1, w = 0, h = 0, dpr = 1;
      function place() {
        if (!img.offsetWidth) return false;
        w = img.offsetWidth; h = img.offsetHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.style.left = img.offsetLeft + 'px'; cv.style.top = img.offsetTop + 'px';
        cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.style.borderRadius = getComputedStyle(img).borderRadius;
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
        return true;
      }
      function flake(fresh) {
        return { x: Math.random() * w, y: fresh ? -Math.random() * h * 0.35 : Math.random() * h, r: 0.6 + Math.random() * 1.4,
                 v: 13 + Math.random() * 19, a: 0.5 + Math.random() * 0.45, p: Math.random() * 6.3 };
      }
      function frame(t) {
        if (!running) return;
        var dt = last ? Math.min(0.05, (t - last) / 1000) : 0, falling = t < until;
        last = t; clock += dt;
        fade = falling ? Math.min(1, fade + dt * 3) : fade - dt * 1.3;  // after the pointer leaves, the snow fades out within a second
        if (fade <= 0) { running = false; flakes = []; fade = 1; ctx.clearRect(0, 0, w, h); return; }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
        var g = (clock % 3.4) / 1.2;  // the glint on the ice (lower part of the photo)
        if (falling && g < 1) {
          var gx = -50 + g * (w + 100), grd = ctx.createLinearGradient(gx - 26, h, gx + 26, h * 0.56);
          grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.2)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = grd; ctx.fillRect(0, h * 0.56, w, h * 0.44);
        }
        flakes = flakes.filter(function (f) {
          f.y += f.v * dt; f.x += Math.sin(clock * 1.3 + f.p) * 7 * dt;
          if (f.y > h + 4) { if (!falling) return false; f.y = -4; f.x = Math.random() * w; }
          ctx.globalAlpha = f.a * fade; ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
          return true;
        });
        ctx.globalAlpha = 1;
        if (!falling && !flakes.length) { running = false; ctx.clearRect(0, 0, w, h); return; }
        requestAnimationFrame(frame);
      }
      function start(ms) {
        if (!place()) return;
        until = performance.now() + ms;
        if (flakes.length < 30) for (var i = flakes.length; i < 34; i++) flakes.push(flake(i % 2 === 1));  // half already in the air
        if (!running) { running = true; last = 0; requestAnimationFrame(frame); }
      }
      if (fine) {
        cv.addEventListener('pointerenter', function () { start(1e9); });
        cv.addEventListener('pointerleave', function () { until = 0; });
      } else cv.addEventListener('click', function () { start(4500); });
      if (window.ResizeObserver) new ResizeObserver(function () { place(); }).observe(img); else window.addEventListener('resize', place);
      place();
    });
  })();

  // The walking cat: type 윤서 (keys D B S T J, whatever the keyboard language), or press and hold the launcher on a phone.
  // It hops in, stops to make a heart with its arms, walks on to the launcher, curls up and sleeps, then fades away;
  // a tap on it meanwhile wakes it for another heart.
  var cat = { busy: false, x: -160, timer: 0 };
  var HEART = '<svg viewBox="-1.1 -1 2.2 1.9"><path fill="currentColor" d="M0 0.78 C-0.22 0.58 -1 0.18 -1 -0.28 C-1 -0.64 -0.76 -0.86 -0.5 -0.86 C-0.25 -0.86 -0.06 -0.7 0 -0.52 C0.06 -0.7 0.25 -0.86 0.5 -0.86 C0.76 -0.86 1 -0.64 1 -0.28 C1 0.18 0.22 0.58 0 0.78 Z"/></svg>';
  function catEl() { return document.querySelector('.catwalk'); }
  function catMove(el, to, done) {
    var from = cat.x, d = Math.abs(to - from);
    if (calm || d < 2) { el.style.transform = 'translateX(' + to + 'px)'; cat.x = to; done(); return; }
    el.classList.add('walking');
    var a = el.animate([{ transform: 'translateX(' + from + 'px)' }, { transform: 'translateX(' + to + 'px)' }],
                       { duration: Math.max(600, d / 0.25), easing: 'linear' });
    a.onfinish = function () { el.style.transform = 'translateX(' + to + 'px)'; cat.x = to; el.classList.remove('walking'); done(); };
  }
  function catHearts(el) {
    if (calm) return;
    for (var i = 0; i < 7; i++) (function (i) {
      setTimeout(function () {
        var h = document.createElement('span');
        h.className = 'cw-heart'; h.innerHTML = HEART;
        h.style.left = (22 + Math.random() * 56) + '%'; h.style.color = i % 3 === 2 ? '#F2C766' : '#E5323B';
        h.style.setProperty('--dx', (Math.random() * 70 - 35) + 'px'); h.style.setProperty('--rot', (Math.random() * 50 - 25) + 'deg');
        el.appendChild(h); setTimeout(function () { if (h.parentNode) h.parentNode.removeChild(h); }, 1600);
      }, i * 110);
    })(i);
  }
  function catPose(el, ms, next) {
    el.querySelector('.cw-bubble').textContent = root.lang === 'en' ? 'Meow!' : '냥!';
    el.classList.remove('asleep'); el.classList.add('pose'); catHearts(el);
    setTimeout(function () { el.classList.remove('pose'); next(); }, ms);
  }
  function catSleep(el) {
    if (!el.querySelector('.cw-z')) for (var i = 0; i < 3; i++) { var z = document.createElement('span'); z.className = 'cw-z'; z.textContent = 'z'; el.appendChild(z); }
    el.classList.add('asleep');
    clearTimeout(cat.timer);
    cat.timer = setTimeout(function () {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700 }).onfinish = function () {
        el.className = 'catwalk'; el.style.opacity = '0'; el.style.transform = ''; cat.x = -160; cat.busy = false;
      };
      el.style.opacity = '0';
    }, 7000);
  }
  function catWalk() {
    var el = catEl(); if (!el || !el.animate) return;
    if (cat.busy) { if (el.classList.contains('asleep')) catPose(el, 1500, function () { catSleep(el); }); return; }
    cat.busy = true;
    var W = el.offsetWidth || 116, f = visibleView().querySelector('.fabs');
    var r = f && f.classList.contains('show') ? f.getBoundingClientRect() : null;
    var end = r ? r.left - W - 4 : window.innerWidth - W - 14;
    var mid = Math.max(12, Math.min(end - 80, window.innerWidth * 0.3));
    cat.x = -W - 30; el.style.transform = 'translateX(' + cat.x + 'px)'; el.className = 'catwalk on'; el.style.opacity = '1';
    catMove(el, calm ? end : mid, function () {
      catPose(el, 1900, function () { catMove(el, end, function () { catSleep(el); }); });
    });
  }
  (function () {
    var el = catEl(); if (!el) return;
    el.addEventListener('click', function () {  // a tap wakes it for another heart
      if (!cat.busy || el.classList.contains('walking') || el.classList.contains('pose')) return;
      catPose(el, 1500, function () { catSleep(el); });
    });
  })();
  (function () {
    var seq = [], word = ['KeyD', 'KeyB', 'KeyS', 'KeyT', 'KeyJ'];  // 윤서 on the Korean (두벌식) layout
    document.addEventListener('keydown', function (e) {
      var t = e.target;
      if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
      seq.push(e.code); if (seq.length > word.length) seq.shift();
      if (seq.join() === word.join()) { seq = []; catWalk(); }
    });
  })();

  setLang(initialLang(), false);
  if (location.hash.length > 1) {
    var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) { showNow(target); requestAnimationFrame(function () { target.scrollIntoView(); revealInView(visibleView()); }); }
  }

  var ticking = false, still = 0;
  window.addEventListener('scroll', function () {
    document.querySelectorAll('.fabs').forEach(function (f) { f.classList.add('moving'); });
    clearTimeout(still);
    still = setTimeout(function () { document.querySelectorAll('.fabs').forEach(function (f) { f.classList.remove('moving'); }); }, 600);
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; update(); });
  }, { passive: true });
  window.addEventListener('resize', function () { update(); spies.forEach(function (s) { placeMarker(s, true); }); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { spies.forEach(function (s) { placeMarker(s, true); }); });
  update();
})();
