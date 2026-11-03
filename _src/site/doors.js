/* Two hidden doors on the homepage. Three quick presses on the Taegukgi open 송공; three on the gold sentence open YO아이.
   Each asks its own PIN (stored only as an iterated, salted SHA-256 digest), then the app opens as its own page.
   One or two presses do nothing at all, so a stray click never shows a password box. */
(function () {
  'use strict';
  var DOORS = {
    songgong: { len: 6, salt: 'sg-0128-7f3a9c', n: 4000, h: 'b883ddfa1079c250e8a6485c3fe1295b20a943727b649f01faffca22f75a87e6', path: 'psat/', title: '송공' },
    yoai: { len: 4, salt: 'yo-0128-2b81e4', n: 4000, h: 'aa950d867c05a6cf9d5a21a2f673a843e7e0b6e6e5a4615536e4b134309ed7dd', path: 'yoai/', title: 'YO아이' }
  };
  var ORIGIN = 'https://0128.kr/';
  var onSite = /(^|\.)0128\.kr$|github\.io$|^localhost$|^127\.0\.0\.1$/.test(location.hostname);

  /* SHA-256 (also works on plain http, where crypto.subtle is missing) */
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function sha256hex(str) {
    var bytes = new TextEncoder().encode(str), l = bytes.length, nb = ((l + 9 + 63) >> 6) << 6;
    var m = new Uint8Array(nb); m.set(bytes); m[l] = 0x80;
    var dv = new DataView(m.buffer), bits = l * 8;
    dv.setUint32(nb - 4, bits >>> 0); dv.setUint32(nb - 8, Math.floor(bits / 4294967296));
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], W = new Array(64);
    for (var o = 0; o < nb; o += 64) {
      for (var i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
      for (i = 16; i < 64; i++) {
        var x = W[i - 15], y = W[i - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (v) { return (v >>> 0).toString(16).padStart(8, '0'); }).join('');
  }
  function digest(d, pin) { var h = sha256hex(d.salt + ':' + pin); for (var i = 0; i < d.n; i++) h = sha256hex(h + d.salt); return h; }
  function store(kind) { try { return kind === 'local' ? window.localStorage : window.sessionStorage; } catch (e) { return null; } }
  function isOpen(name) {
    var d = DOORS[name], ss = store('session'), ls = store('local');
    try { if (ss && ss.getItem('door:' + name) === d.h) return true; } catch (e) { /* ignore */ }
    try { var v = ls && ls.getItem('door:' + name); if (v) { var o = JSON.parse(v); if (o && o.h === d.h && o.until > Date.now()) return true; } } catch (e) { /* ignore */ }
    return false;
  }
  function unlock(name, remember) {
    var d = DOORS[name];
    try { store('session').setItem('door:' + name, d.h); } catch (e) { /* ignore */ }
    if (remember) { try { store('local').setItem('door:' + name, JSON.stringify({ h: d.h, until: Date.now() + 30 * 86400000 })); } catch (e) { /* ignore */ } }
  }

  /* ---------- PIN box ---------- */
  var lastFocus = null;
  function askPin(name, from) {
    var d = DOORS[name], pin = '', busy = false, fails = 0;
    lastFocus = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'door-wrap';
    wrap.innerHTML = '<div class="door-card" role="dialog" aria-modal="true" tabindex="-1" aria-label="' + d.title + ' 비밀번호">'
      + '<p class="door-t">' + d.title + '</p><p class="door-s">비밀번호를 입력하세요</p>'
      + '<div class="door-dots" aria-hidden="true">' + new Array(d.len + 1).join('<i></i>') + '</div>'
      + '<div class="door-pad">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button type="button" data-d="' + n + '">' + n + '</button>'; }).join('')
      + '<button type="button" class="fn" data-d="x">닫기</button><button type="button" data-d="0">0</button><button type="button" class="fn" data-d="del" aria-label="지우기">←</button></div>'
      + '<label class="door-rm"><input type="checkbox"> 이 기기에서 30일 동안 묻지 않기</label></div>';
    document.body.appendChild(wrap);
    requestAnimationFrame(function () { wrap.classList.add('in'); });
    var card = wrap.querySelector('.door-card'), msg = wrap.querySelector('.door-s');
    card.focus({ preventScroll: true });
    function draw() { var dots = wrap.querySelectorAll('.door-dots i'); for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i < pin.length); }
    function close() { document.removeEventListener('keydown', onKey, true); wrap.classList.remove('in'); setTimeout(function () { wrap.remove(); }, 180); if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); }
    function check() {
      busy = true;
      setTimeout(function () {
        if (digest(d, pin) === d.h) { unlock(name, wrap.querySelector('.door-rm input').checked); close(); openApp(name, from); return; }
        fails++; pin = ''; draw(); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
        if (fails >= 5) { msg.textContent = '잠시 후 다시 시도하세요'; setTimeout(function () { fails = 0; busy = false; msg.textContent = '비밀번호를 입력하세요'; }, 15000); return; }
        busy = false;
      }, 20);
    }
    function press(k) {
      if (k === 'x') { close(); return; }
      if (busy) return;
      if (k === 'del') pin = pin.slice(0, -1); else if (pin.length < d.len) pin += k;
      draw(); if (pin.length === d.len) check();
    }
    wrap.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) press(b.getAttribute('data-d')); else if (e.target === wrap) close(); });
    function onKey(e) {
      if (/^[0-9]$/.test(e.key)) { press(e.key); e.preventDefault(); }
      else if (e.key === 'Backspace') { press('del'); e.preventDefault(); }
      else if (e.key === 'Escape') { close(); e.preventDefault(); }
    }
    document.addEventListener('keydown', onKey, true);
  }

  /* ---------- the app over the page ---------- */
  function openApp(name) {
    var d = DOORS[name];
    if (!onSite) { window.open(ORIGIN + d.path, '_blank', 'noopener'); return; }   // the claude.ai mirror links to the site
    // each app opens as its own page, so adding it to the home screen (or installing it) gives the app itself, not this page
    location.assign(d.path);
  }

  function door(el, name) {
    var times = [];
    el.addEventListener('mousedown', function (e) { if (e.detail > 1) e.preventDefault(); });   // no text selection on a triple press
    el.addEventListener('click', function () {
      var now = Date.now();
      times = times.filter(function (t) { return now - t < 1200; }); times.push(now);
      if (times.length >= 3) { times = []; if (isOpen(name)) openApp(name, el); else askPin(name, el); }
    });
  }
  function wire() {
    Array.prototype.forEach.call(document.querySelectorAll('svg.flag'), function (el) { door(el, 'songgong'); });
    Array.prototype.forEach.call(document.querySelectorAll('.stmt .s2 strong'), function (el) { door(el, 'yoai'); });
    var h = location.hash.slice(1);
    // an older bookmark or home-screen icon that points at the app on this page (#songgong, #yoai) still leads into the app
    if (DOORS[h]) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ } if (isOpen(h)) openApp(h); else askPin(h, null); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
