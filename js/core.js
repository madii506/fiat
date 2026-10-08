/* FIAT shared code: formatting, data loading, wallet, small UI helpers. */
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const short = a => a ? a.slice(0, 4) + '…' + a.slice(-4) : '';
export const flag = cc => cc === 'EU' ? '🇪🇺' : String(cc || '').toUpperCase().replace(/./g, ch => String.fromCodePoint(127397 + ch.charCodeAt(0)));

// numbers
export function fmtRate(v) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  const d = a >= 10000 ? 0 : a >= 100 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 4 : 6;
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
export function pct(v, dp) {
  if (v == null || !isFinite(v)) return '<span class="mu">—</span>';
  const p = v * 100, a = Math.abs(p), d = dp != null ? dp : a >= 100 ? 0 : a >= 10 ? 1 : 2;
  const s = (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p).toFixed(d) + '%';
  return `<span class="${p > 0.0001 ? 'up' : p < -0.0001 ? 'dn' : 'mu'}">${s}</span>`;
}
export const pctTxt = (v, d = 2) => v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(d) + '%';
export function usd(v) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  if (a >= 1) return '$' + v.toFixed(2);
  return '$' + v.toPrecision(3);
}
export function ago(t) {
  if (!t) return '—'; const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return Math.floor(s) + 's ago'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago';
}

// toast
let tt;
export function toast(msg, ms = 2600) {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), ms);
}
export async function copy(text, label = 'Copied') { try { await navigator.clipboard.writeText(text); toast(label); } catch (e) { toast('Copy failed: ' + text); } }

// api
export async function api(path, body) {
  const r = await fetch('/api/' + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  let j = null; try { j = await r.json(); } catch (e) { }
  if (!r.ok || !j || j.ok === false) { const e = new Error((j && j.error) || 'Request failed (' + r.status + ')'); e.logs = j && j.logs; e.status = r.status; throw e; }
  return j;
}
export async function loadConfig() {
  try { return await api('config'); } catch (e) { return { ok: false, ca: '', x: '', launches: 'paused', registry: '', offline: true }; }
}

/* ---------- exchange rates ----------
 * /api/fx aggregates 30 days + 1 year of daily rates server-side. If it is unreachable, the browser
 * reads the same open source (fawazahmed0/currency-api on jsDelivr) directly, with fewer points. */
const ymd = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
async function usdFile(tag) {
  const urls = [`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${tag}/v1/currencies/usd.min.json`, `https://${tag}.currency-api.pages.dev/v1/currencies/usd.min.json`];
  for (const u of urls) { try { const r = await fetch(u); if (r.ok) { const j = await r.json(); if (j && j.usd) return j; } } catch (e) { } }
  return null;
}
async function fxDirect() {
  const cur = await (await fetch('/data/currencies.json')).json();
  const latest = await usdFile('latest'); if (!latest) throw new Error('rates offline');
  const d0 = latest.date;
  const days = [-30, -21, -14, -10, -7, -5, -3, -2, -1].map(n => addDays(d0, n)).concat([d0]);
  const extra = [addDays(d0, -90), addDays(d0, -364), addDays(d0, -273), addDays(d0, -182)];
  const files = { [d0]: latest.usd };
  await Promise.all([...days.slice(0, -1), ...extra].map(async t => { const f = await usdFile(t); files[t] = f ? f.usd : null; }));
  const at = (t, k) => (files[t] && files[t][k]) || null, ch = (n, t) => (n && t ? t / n - 1 : null);
  const weeks = [addDays(d0, -364), addDays(d0, -273), addDays(d0, -182), addDays(d0, -90), addDays(d0, -30), d0];
  const list = cur.map(c => {
    const k = c.code.toLowerCase(), r = latest.usd[k]; if (!r) return null;
    return { ...c, rate: r, d1: ch(r, at(addDays(d0, -1), k)), d7: ch(r, at(addDays(d0, -7), k)), d30: ch(r, at(addDays(d0, -30), k)), d90: ch(r, at(addDays(d0, -90), k)), d365: ch(r, at(addDays(d0, -364), k)), s30: days.map(t => at(t, k)), s1y: weeks.map(t => at(t, k)) };
  }).filter(Boolean);
  return { date: d0, source: 'fawazahmed0/currency-api (daily, read directly)', days, weeks, list };
}
export async function loadFx() {
  try { const c = JSON.parse(sessionStorage.getItem('fiat:fx') || 'null'); if (c && Date.now() - c.t < 10 * 60e3 && c.v && c.v.list && c.v.list.length) return c.v; } catch (e) { }
  let v = null;
  try { v = await api('fx'); } catch (e) { v = await fxDirect(); }
  try { sessionStorage.setItem('fiat:fx', JSON.stringify({ t: Date.now(), v })); } catch (e) { }
  return v;
}
export async function loadLive(codes) { try { return (await api('live?codes=' + codes.join(','))).quotes || {}; } catch (e) { return {}; } }
// merge an intraday quote into a currency row (keeps the daily row if no live quote)
export function applyLive(c, q) {
  if (!q || !(q.rate > 0)) return c;
  const d1 = q.prev > 0 ? q.prev / q.rate - 1 : c.d1;
  return { ...c, rate: q.rate, d1, live: true, liveT: q.t, liveSeries: q.series };
}

/* ---------- charts (plain SVG) ---------- */
// series are rates (units per USD); we plot the currency's value (1/rate) so down = weaker
export function spark(rates, w = 120, h = 30) {
  const v = (rates || []).filter(x => x > 0).map(x => 1 / x);
  if (v.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}"><line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="rgba(255,255,255,.12)" stroke-dasharray="3 3"/></svg>`;
  let lo = Math.min(...v), hi = Math.max(...v); if (hi - lo < hi * 1e-6) { lo *= 0.999; hi *= 1.001; }
  const pts = v.map((y, i) => [i / (v.length - 1) * (w - 2) + 1, h - 3 - (y - lo) / (hi - lo) * (h - 6)]);
  const up = v[v.length - 1] >= v[0], col = up ? '#3ddc97' : '#ff5f57';
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  const id = 'g' + Math.random().toString(36).slice(2, 8);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs><path d="${d}L${w - 1} ${h}L1 ${h}Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${col}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
}
export function bigChart(box, rates, labels) {
  const v = (rates || []).map(x => (x > 0 ? 1 / x : null));
  const ok = v.filter(x => x != null);
  if (ok.length < 2) { box.innerHTML = '<div class="empty">Not enough history yet.</div>'; return; }
  const W = 600, H = 220, P = 16;
  let lo = Math.min(...ok), hi = Math.max(...ok); if (hi - lo < hi * 1e-6) { lo *= 0.999; hi *= 1.001; }
  const X = i => P + i / (v.length - 1) * (W - P * 2), Y = y => H - 26 - (y - lo) / (hi - lo) * (H - 56);
  let d = '', first = true; v.forEach((y, i) => { if (y == null) return; d += (first ? 'M' : 'L') + X(i).toFixed(1) + ' ' + Y(y).toFixed(1); first = false; });
  const up = ok[ok.length - 1] >= ok[0], col = up ? '#3ddc97' : '#ff5f57';
  const grid = [0.25, 0.5, 0.75].map(f => `<line x1="0" x2="${W}" y1="${(H - 26 - f * (H - 56)).toFixed(1)}" y2="${(H - 26 - f * (H - 56)).toFixed(1)}" stroke="rgba(255,255,255,.05)"/>`).join('');
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="bg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".25"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>${grid}<path d="${d}L${X(v.length - 1)} ${H}L${X(0)} ${H}Z" fill="url(#bg1)"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/><line class="xh" x1="0" x2="0" y1="0" y2="${H}" stroke="rgba(255,255,255,.25)" stroke-dasharray="3 3" visibility="hidden"/><circle class="pt" r="4" fill="${col}" visibility="hidden"/></svg><div class="tip"></div>`;
  const svg = box.querySelector('svg'), tip = box.querySelector('.tip'), xh = box.querySelector('.xh'), pt = box.querySelector('.pt');
  const show = i => {
    if (v[i] == null) return; xh.setAttribute('x1', X(i)); xh.setAttribute('x2', X(i)); pt.setAttribute('cx', X(i)); pt.setAttribute('cy', Y(v[i]));
    xh.setAttribute('visibility', 'visible'); pt.setAttribute('visibility', 'visible');
    tip.innerHTML = `${esc(labels[i] || '')} · 1 USD = <b style="color:#eef0f3">${fmtRate(rates[i])}</b>`;
  };
  const last = v.length - 1; show(last);
  box.onmousemove = e => { const r = svg.getBoundingClientRect(); const i = Math.max(0, Math.min(last, Math.round(((e.clientX - r.left) / r.width * W - P) / (W - P * 2) * last))); show(i); };
  box.onmouseleave = () => show(last);
}

/* ---------- reveal on scroll + nav ---------- */
export function ui() {
  if ('IntersectionObserver' in window) {
    document.documentElement.classList.add('js-rv'); // content only hides when the reveal can run
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px' });
    $$('.rv').forEach(el => io.observe(el));
  }
  const b = $('.burger'), l = $('.links'); if (b && l) { b.addEventListener('click', () => l.classList.toggle('open')); l.addEventListener('click', e => { if (e.target.closest('a')) l.classList.remove('open'); }); }
}
export function navSpy() {
  const links = $$('.links a[href^="#"]'); if (!links.length) return;
  const on = () => { let cur = null; for (const a of links) { const s = document.querySelector(a.getAttribute('href')); if (s && s.getBoundingClientRect().top < 140) cur = a; } links.forEach(a => a.classList.toggle('on', a === cur)); };
  window.addEventListener('scroll', on, { passive: true }); on();
}
export function caChip(cfg) {
  const el = $('#caChip'); if (!el) return;
  if (cfg.ca) { el.hidden = false; el.innerHTML = `CA <b>${short(cfg.ca)}</b><i>COPY</i>`; el.onclick = () => copy(cfg.ca, 'Contract address copied'); }
}

/* ---------- wallets (Wallet Standard: Phantom, Solflare, Backpack, …) ---------- */
export const W = { list: [], w: null, acct: null, on: new Set() };
function addWallet(w) {
  try {
    if (!w || !w.features || !w.name) return;
    const sol = (w.chains || []).some(c => String(c).startsWith('solana:'));
    const can = w.features['standard:connect'] && (w.features['solana:signTransaction'] || w.features['solana:signAndSendTransaction']);
    if (!sol || !can || W.list.some(x => x.name === w.name)) return;
    W.list.push(w); W.on.forEach(f => f());
  } catch (e) { }
}
const walletApi = Object.freeze({ register: (...ws) => { ws.forEach(addWallet); return () => { }; } });
window.addEventListener('wallet-standard:register-wallet', e => { try { e.detail(walletApi); } catch (_) { } });
try { window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: walletApi })); } catch (_) { }
export function walletModal() {
  return new Promise((resolve, reject) => {
    const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="modal-in" role="dialog" aria-modal="true" aria-label="Connect a wallet"><h3>Connect a wallet</h3><p>Any Solana wallet. FIAT never sees your keys: your wallet signs.</p><div class="wl"></div><button class="btn" style="width:100%;margin-top:14px" data-x>Cancel</button></div>`;
    document.body.appendChild(m);
    const draw = () => {
      const box = m.querySelector('.wl');
      box.innerHTML = W.list.length ? W.list.map((w, i) => `<button class="wopt" data-i="${i}">${w.icon ? `<img src="${esc(w.icon)}" alt="">` : ''}<b>${esc(w.name)}</b></button>`).join('')
        : '<p>No Solana wallet found in this browser.</p><a class="wopt" href="https://phantom.com/download" target="_blank" rel="noopener"><b>Get Phantom</b></a><a class="wopt" href="https://solflare.com/download" target="_blank" rel="noopener"><b>Get Solflare</b></a>';
    };
    draw(); W.on.add(draw);
    const close = err => { W.on.delete(draw); m.remove(); if (err) reject(err); };
    m.addEventListener('click', async e => {
      if (e.target === m || e.target.closest('[data-x]')) return close(new Error('cancelled'));
      const b = e.target.closest('button[data-i]'); if (!b) return;
      const w = W.list[+b.dataset.i];
      try {
        const r = await w.features['standard:connect'].connect();
        const a = (r && r.accounts && r.accounts[0]) || (w.accounts && w.accounts[0]); if (!a) throw new Error('No account shared');
        W.w = w; W.acct = a; close(); resolve(a);
      } catch (err) { toast(err && err.message ? err.message : 'Connection cancelled'); }
    });
  });
}
// sign (and the mint signs after the wallet). Returns base64 of a fully signed tx, or {sig} if the wallet sent it.
export async function signWith(txB64, extraSigner) {
  const L = window.SolanaLite; if (!L) throw new Error('Signing library not loaded');
  const bytes = Uint8Array.from(atob(txB64), c => c.charCodeAt(0));
  const f = W.w.features;
  if (f['solana:signTransaction']) {
    const [res] = await f['solana:signTransaction'].signTransaction({ account: W.acct, transaction: bytes, chain: 'solana:mainnet' });
    const vt = L.VersionedTransaction.deserialize(res.signedTransaction);
    if (extraSigner) vt.sign([extraSigner]);
    const out = vt.serialize(); let s = ''; for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
    return { tx: btoa(s) };
  }
  // wallets that only sign-and-send: the extra signer signs first
  const vt = L.VersionedTransaction.deserialize(bytes); if (extraSigner) vt.sign([extraSigner]);
  const [res] = await f['solana:signAndSendTransaction'].signAndSendTransaction({ account: W.acct, transaction: vt.serialize(), chain: 'solana:mainnet' });
  const sig = res.signature; const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n; for (const x of sig) n = n * 256n + BigInt(x); let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const x of sig) { if (x === 0) s = '1' + s; else break; }
  return { sig: s };
}
export async function waitFor(sig, ms = 75000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const s = await api('status?sig=' + sig); if (s.err) throw Object.assign(new Error('The transaction failed on-chain.'), { onchain: true }); if (s.status === 'confirmed' || s.status === 'finalized') return s.status; }
    catch (e) { if (e.onchain) throw e; }
    await new Promise(r => setTimeout(r, 1800));
  }
  throw new Error('Not confirmed yet. Check the transaction on Solscan.');
}

/* ---------- brand helpers ---------- */
// wait for the engraving fonts before drawing notes on canvas (never blocks for long)
export async function fontsReady() {
  if (!document.fonts) return;
  try { await Promise.race([Promise.all(['800 80px Cinzel', '700 30px Cinzel', '500 30px JBM'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 1800))]); } catch (e) { }
}
// holographic tilt: follows the pointer, sways on its own otherwise
export function tilt(el, host = el.parentElement) {
  if (!el) return;
  const set = (px, py) => {
    el.style.setProperty('--rx', ((0.5 - py) * 12).toFixed(2) + 'deg'); el.style.setProperty('--ry', ((px - 0.5) * 16).toFixed(2) + 'deg');
    el.style.setProperty('--mx', (px * 100).toFixed(1) + '%'); el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
    el.style.setProperty('--hx', (px * 100).toFixed(1) + '%'); el.style.setProperty('--hy', (py * 100).toFixed(1) + '%');
  };
  let hov = false, t0 = performance.now();
  host.addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; hov = true; const r = el.getBoundingClientRect(); set(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))); });
  host.addEventListener('pointerleave', () => { hov = false; t0 = performance.now(); });
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return set(0.5, 0.5);
  const idle = t => { if (!hov && !document.hidden) { const a = (t - t0) / 1000; set(0.5 + Math.sin(a * 0.6) * 0.32, 0.5 + Math.cos(a * 0.45) * 0.22); } requestAnimationFrame(idle); };
  requestAnimationFrame(idle);
}
// split-flap text: only the characters that change flip
export function flapSet(box, str) {
  const chars = [...String(str)];
  if (box.children.length !== chars.length || !box.classList.contains('flap')) { box.className = 'flap'; box.innerHTML = chars.map(c => `<span class="fc${c === ' ' ? ' sp' : ''}">${esc(c)}</span>`).join(''); return; }
  chars.forEach((c, i) => {
    const el = box.children[i]; if (el.textContent === c) return;
    el.classList.toggle('sp', c === ' '); el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip');
    setTimeout(() => { el.textContent = c; }, 150 + i * 18);
  });
}
// slam a stamp once it scrolls into view
export function slamOnView(el) {
  if (!el) return;
  const go = () => { el.classList.remove('slam'); void el.offsetWidth; el.classList.add('on', 'slam'); };
  if (!('IntersectionObserver' in window)) return go();
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { go(); io.disconnect(); } }), { threshold: 0.6 });
  io.observe(el.parentElement || el);
}
