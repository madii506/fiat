/* FIAT motion: scroll progress, reveals, parallax, scramble numbers, cursor glow, scroll-linked hooks. */
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const frames = new Set();
export const onFrame = fn => { frames.add(fn); kick(); };

// numbers that roll like a counter before they settle
export function scramble(el, text, ms = 900) {
  if (!el) return;
  const final = String(text);
  if (RM || el.dataset.scrambled === final) { el.textContent = final; return; }
  el.dataset.scrambled = final;
  const t0 = performance.now(), D = '0123456789';
  const step = t => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = [...final].map((c, i) => (/\d/.test(c) && k < 0.35 + 0.65 * (i + 1) / final.length ? D[(Math.random() * 10) | 0] : c)).join('');
    if (k < 1) requestAnimationFrame(step); else el.textContent = final;
  };
  requestAnimationFrame(step);
}

let ticking = false;
function kick() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
const pending = new Set();
function frame() {
  ticking = false;
  const y = scrollY, vh = innerHeight, H = document.documentElement.scrollHeight - vh;
  const bar = document.querySelector('.progress'); if (bar) bar.style.transform = `scaleX(${H > 0 ? Math.min(1, y / H) : 0})`;
  // reveals by position (works even where IntersectionObserver is starved)
  for (const el of pending) {
    const r = el.getBoundingClientRect();
    if (r.top < vh * 0.9 && r.bottom > 0) { pending.delete(el); show(el); }
  }
  frames.forEach(fn => { try { fn(y, vh); } catch (e) { } });
}
function show(el) {
  el.classList.add('shown');
  if (el.classList.contains('board')) { el.classList.add('fresh'); setTimeout(() => el.classList.remove('fresh'), 2600); }
  el.querySelectorAll('[data-roll]').forEach(b => scramble(b, b.dataset.roll, 1100));
}

// inertial scrolling on desktop (Lenis, vendored)
function smooth() {
  if (RM || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const go = () => {
    if (!window.Lenis) return;
    const lenis = new window.Lenis({ lerp: 0.085, anchors: { offset: -64 }, prevent: n => !!(n.closest && n.closest('.drawer, .cgrid, .console, .modal, [data-lenis-prevent]')) });
    window.__lenis = lenis; lenis.on('scroll', kick);
    const raf = t => { lenis.raf(t); requestAnimationFrame(raf); }; requestAnimationFrame(raf);
  };
  const s = document.createElement('script'); s.src = '/vendor/lenis.min.js'; s.async = true; s.onload = go; document.head.appendChild(s);
}
// nav: hides while you read down, returns when you scroll up; a pill slides to the active link
let lastY = 0, navEl = null, pill = null, pillFor = null;
function navFrame(y) {
  if (!navEl) return;
  const open = document.querySelector('.links.open');
  if (!open && y > 240 && y > lastY + 6) navEl.classList.add('tuck'); else if (y < lastY - 6 || y < 240) navEl.classList.remove('tuck');
  lastY = y;
  const a = navEl.querySelector('.links a.on, .links a:hover');
  if (pill && a !== pillFor) {
    pillFor = a;
    if (!a) { pill.style.opacity = 0; return; }
    const lr = a.parentElement.getBoundingClientRect(), r = a.getBoundingClientRect();
    pill.style.opacity = 1; pill.style.transform = `translateX(${(r.left - lr.left).toFixed(1)}px)`; pill.style.width = r.width.toFixed(1) + 'px';
  }
}
// FAQ: smooth open and close
function faq() {
  document.querySelectorAll('.faq details').forEach(d => {
    const s = d.querySelector('summary'), body = d.querySelector('p'); if (!s || !body || RM) return;
    s.addEventListener('click', e => {
      e.preventDefault();
      if (d.open) { const h = body.offsetHeight; body.animate([{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 280, easing: 'cubic-bezier(.4,0,.2,1)' }).onfinish = () => { d.open = false; }; }
      else { d.open = true; const h = body.offsetHeight; body.animate([{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
    });
  });
}
// big buttons lean toward the cursor
function magnets() {
  if (RM || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  document.querySelectorAll('.btn.lg, .nav .btn.pri').forEach(b => {
    b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1)}px, ${((e.clientY - r.top - r.height / 2) * 0.28).toFixed(1)}px)`; });
    b.addEventListener('pointerleave', () => { b.style.transform = ''; });
  });
}
let mx = 0, my = 0;
export function fx() {
  document.documentElement.classList.add('fx');
  smooth(); faq(); magnets();
  navEl = document.querySelector('.nav');
  const links = document.querySelector('.links');
  if (links) { pill = document.createElement('span'); pill.className = 'pill'; links.prepend(pill); links.addEventListener('pointerover', kick); links.addEventListener('pointerleave', () => { pillFor = undefined; kick(); }); }
  onFrame(navFrame);
  addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; if (scrollY < innerHeight) kick(); }, { passive: true });
  const bar = document.createElement('div'); bar.className = 'progress'; bar.setAttribute('aria-hidden', 'true'); document.body.appendChild(bar);
  document.querySelectorAll('.sec-h, .board, .grave, .nums, .melts, .steps, .coins-wrap, .big-word, .tok, .press-copy, .seal').forEach(el => pending.add(el));
  addEventListener('scroll', kick, { passive: true }); addEventListener('resize', kick);
  let n = 0; const iv = setInterval(() => { kick(); if (++n > 20) clearInterval(iv); }, 300);
  kick();
  // hero parallax
  const hin = document.querySelector('.hero-in'), cards = document.querySelector('.hcards'), stage = document.querySelector('#stage');
  if (hin && !RM) onFrame(y => {
    if (y > innerHeight * 1.2) return;
    hin.style.transform = `translate3d(0, ${(y * 0.32).toFixed(1)}px, 0)`; hin.style.opacity = Math.max(0, 1 - y / (innerHeight * 0.75)).toFixed(3);
    if (cards) cards.style.transform = `translate3d(${(-mx * 22).toFixed(1)}px, ${(-y * 0.18 - my * 16).toFixed(1)}px, 0)`;
    if (stage && innerWidth > 1040) stage.style.transform = `translate3d(0, ${(y * 0.12).toFixed(1)}px, 0)`;
  });
  // the footer word tightens as it arrives
  const big = document.querySelector('.big-word');
  if (big && !RM) onFrame((y, vh) => {
    const r = big.getBoundingClientRect(); if (r.top > vh || r.bottom < 0) return;
    const p = Math.max(0, Math.min(1, (vh - r.top) / (vh * 0.8)));
    big.style.letterSpacing = (0.42 - 0.38 * p).toFixed(3) + 'em'; big.style.opacity = (0.15 + 0.45 * p).toFixed(3);
    big.style.backgroundPosition = `${(p * 240).toFixed(0)}px 0`;
  });
  // a ring that trails the cursor and opens up over anything clickable
  if (!RM && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const ring = document.createElement('div'); ring.className = 'cursor'; ring.setAttribute('aria-hidden', 'true'); document.body.appendChild(ring);
    let tx = -100, ty = -100, x = -100, y = -100, on = false, run = false;
    const loop = () => { x += (tx - x) * 0.2; y += (ty - y) * 0.2; ring.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`; if (Math.abs(tx - x) + Math.abs(ty - y) > 0.3) requestAnimationFrame(loop); else run = false; };
    document.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return; tx = e.clientX; ty = e.clientY;
      const hot = !!(e.target.closest && e.target.closest('a, button, [data-c], summary, label, select, input, textarea'));
      if (hot !== on) { on = hot; ring.classList.toggle('hot', hot); }
      ring.classList.add('show'); if (!run) { run = true; requestAnimationFrame(loop); }
    }, { passive: true });
    document.addEventListener('pointerleave', () => ring.classList.remove('show'));
    document.addEventListener('pointerdown', () => { ring.classList.add('down'); setTimeout(() => ring.classList.remove('down'), 180); });
  }
  // a soft glow that follows the cursor across cards
  if (!RM) document.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    const c = e.target.closest && e.target.closest('.card, .step, .box, .mcard, .coin, .nums > div, .press, .breadth');
    if (!c) return; const r = c.getBoundingClientRect();
    c.style.setProperty('--gx', (e.clientX - r.left).toFixed(0) + 'px'); c.style.setProperty('--gy', (e.clientY - r.top).toFixed(0) + 'px');
  }, { passive: true });
}
