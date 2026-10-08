/* FIAT home: hero, live rates tape, the board (table + heatmap), spotlight + the melt, coins, $FIAT. */
import { $, $$, esc, short, flag, fmtRate, pct, pctTxt, usd, ago, toast, copy, api, loadConfig, loadFx, loadLive, applyLive, spark, bigChart, ui, navSpy, caChip, fontsReady, tilt, flapSet, slamOnView, badge } from './core.js';
import { noteFor, noteCanvas } from './tex.js';
import { fx, onFrame, scramble } from './fx.js';

const S = { cfg: {}, fx: null, rows: [], live: {}, coins: [], q: '', region: '', sort: 'd1', dir: 1, period: 'd1', coinSort: 'new', sel: null, range: 30, view: 'table', heroCode: 'TRY', pick: 'JPY' };
const T0 = performance.now(), YEAR = 365 * 86400;
let fontsOk = false;
const byCode = c => S.rows.find(r => r.code === c);
ui(); navSpy(); fx();

/* ---------- hero: the 3D stack (falls back to a still) ---------- */
(async () => {
  const stage = $('#stage');
  const still = () => { $('#heroImg').hidden = false; };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return still();
  try { const m = await import('./stack.js'); const ok = await m.mount(stage); if (!ok) still(); } catch (e) { console.warn(e); still(); }
})();
// rotating currency in the headline; the floating rate cards follow it
const WORDS = [['lira', 'TRY'], ['peso', 'ARS'], ['naira', 'NGN'], ['yen', 'JPY'], ['rupee', 'INR'], ['won', 'KRW'], ['rand', 'ZAR'], ['krona', 'SEK'], ['cedi', 'GHS'], ['dong', 'VND'], ['pound', 'GBP'], ['euro', 'EUR']];
function heroCards(code) {
  const r = byCode(code); if (!r) return;
  S.heroCode = code;
  $('#hc1Pair').textContent = 'USD/' + code;
  $('#hc1Tag').className = 'tag ' + (r.live ? 'live' : 'daily'); $('#hc1Tag').textContent = r.live ? 'LIVE' : 'DAILY';
  $('#hc1Rate').textContent = fmtRate(r.rate);
  $('#hc1D').innerHTML = `24h ${pct(r.d1)} · 1y ${pct(r.d365, 1)}`;
  $('#hc1Sp').innerHTML = spark(r.s30, 160, 30);
  $('#hc3C').textContent = code;
}
(() => {
  const el = $('#rotWord'), cards = $('#hcards'); let i = 0;
  setInterval(() => {
    if (document.hidden) return;
    i = (i + 1) % WORDS.length; cards.classList.add('swap');
    const to = WORDS[i][0], from = el.textContent, L = Math.max(to.length, from.length), A = 'abcdefghijklmnopqrstuvwxyz', t0 = performance.now();
    const step = t => {
      const k = Math.min(1, (t - t0) / 560);
      el.textContent = Array.from({ length: L }, (_, j) => (k > (j + 1) / (L + 1) ? to[j] || '' : (j < Math.round(from.length + (to.length - from.length) * k) ? A[(Math.random() * 26) | 0] : ''))).join('');
      if (k < 1) requestAnimationFrame(step); else { el.textContent = to; }
    };
    requestAnimationFrame(step);
    setTimeout(() => { heroCards(WORDS[i][1]); cards.classList.remove('swap'); }, 380);
  }, 3200);
})();

/* ---------- data ---------- */
const coinsFor = code => S.coins.filter(c => c.code === code);
const val = (r, k) => (k === 'code' ? r.code : k === 'coins' ? coinsFor(r.code).length : r[k]);
function filtered() {
  const q = S.q.trim().toLowerCase();
  return S.rows.filter(r => (!S.region || r.region === S.region) && (!q || [r.code, r.name, r.country, r.unit].some(x => String(x).toLowerCase().includes(q))));
}
function rowsView() {
  const rows = filtered(), k = S.sort;
  rows.sort((a, b) => {
    const x = val(a, k), y = val(b, k);
    if (k === 'code') return String(x).localeCompare(String(y)) * S.dir;
    if (x == null) return 1; if (y == null) return -1;
    return (x - y) * S.dir;
  });
  return rows;
}
function renderBoard() {
  renderBreadth();
  if (S.view === 'heat') return renderHeat();
  const rows = rowsView();
  $$('#bt th').forEach(th => { th.classList.toggle('on', th.dataset.s === S.sort); const t = th.textContent.replace(/[ ▲▼]+$/, ''); th.innerHTML = esc(t) + (th.dataset.s === S.sort ? `<span class="ar">${S.dir > 0 ? '▲' : '▼'}</span>` : ''); });
  $('#rows').innerHTML = rows.length ? rows.map((r, i) => {
    const n = coinsFor(r.code).length;
    return `<tr data-c="${r.code}" class="${S.sel === r.code ? 'sel' : ''}" style="--i:${Math.min(i, 24)}">
      <td><div class="cur">${badge(r)}<div><b>${r.code} ${r.live ? '<span class="tag live">LIVE</span>' : ''}${n ? ` <span class="tag n">${n} coin${n > 1 ? 's' : ''}</span>` : ''}</b><small>${esc(r.name)}</small></div></div></td>
      <td>${fmtRate(r.rate)}</td><td>${pct(r.d1)}</td><td class="h-7">${pct(r.d7)}</td><td class="h-1y">${pct(r.d365)}</td>
      <td class="h-spark">${spark(r.s30)}</td>
      <td class="h-pair"><a class="pair" href="/launch?c=${r.code}" data-stop>Pair</a></td></tr>`;
  }).join('') : '<tr><td colspan="7" class="empty">No match.</td></tr>';
}
const PER = { d1: ['Today', '24h'], d7: ['This week', '7d'], d30: ['This month', '30d'], d365: ['This year', '1y'] };
function renderBreadth() {
  const k = S.period, rows = S.rows.filter(r => r[k] != null); if (!rows.length) return;
  const fell = rows.filter(r => r[k] < -1e-5), rose = rows.filter(r => r[k] > 1e-5), flat = rows.length - fell.length - rose.length;
  const avg = rows.reduce((a, r) => a + r[k], 0) / rows.length;
  const lo = rows.reduce((a, r) => (r[k] < a[k] ? r : a)), hi = rows.reduce((a, r) => (r[k] > a[k] ? r : a));
  const w = n => (n / rows.length * 100).toFixed(2) + '%';
  $('#brDn').style.width = w(fell.length); $('#brFl').style.width = w(flat); $('#brUp').style.width = w(rose.length);
  $('#brKv').innerHTML = `<span class="hl">${PER[k][0]}: <span class="dn">${fell.length}</span> of ${rows.length} lost value vs the dollar</span>`
    + `<span class="br-r"><span>worst <b>${lo.code}</b> ${pct(lo[k])}</span><span>best <b>${hi.code}</b> ${pct(hi[k])}</span></span>`;
}
const SCALE = { d1: 0.01, d7: 0.02, d30: 0.05, d365: 0.25 };
const REGIONS = ['Americas', 'Europe', 'Middle East', 'Africa', 'Asia', 'Oceania'];
function tileBg(v, k) {
  if (v == null) return 'background:var(--panel)';
  const a = Math.min(1, Math.abs(v) / SCALE[k]), c = v < 0 ? '255,95,87' : '61,220,151';
  return `background:linear-gradient(160deg, rgba(${c},${(0.12 + a * 0.5).toFixed(3)}), rgba(${c},${(0.04 + a * 0.22).toFixed(3)}));border-color:rgba(${c},${(0.18 + a * 0.4).toFixed(3)})`;
}
function renderHeat() {
  const k = S.period, rows = filtered();
  $('#heatView').innerHTML = rows.length ? REGIONS.map(reg => {
    const rs = rows.filter(r => r.region === reg).sort((a, b) => (a[k] == null) - (b[k] == null) || a[k] - b[k]); if (!rs.length) return '';
    const ok = rs.filter(r => r[k] != null), avg = ok.length ? ok.reduce((a, r) => a + r[k], 0) / ok.length : null;
    return `<div class="heat-r"><h4>${reg}<span>${rs.length} · average ${pct(avg)}</span></h4><div class="heat-g">${rs.map(r => `<button class="tile" data-c="${r.code}" style="${tileBg(r[k], k)}"><span class="t1"><span>${r.code}</span>${r.live ? '<span class="tag live">LIVE</span>' : ''}</span><span class="t2">${pctTxt(r[k], Math.abs(r[k] || 0) >= 0.1 ? 1 : 2)}</span><span class="t3">${esc(r.name)}</span></button>`).join('')}</div></div>`;
  }).join('') : '<div class="empty">No currency matches that.</div>';
}
function renderTape() {
  const items = S.rows.slice().sort((a, b) => a.code.localeCompare(b.code)).map(r => `<div class="tape-item"><span class="c">USD/${r.code}</span><span class="r">${fmtRate(r.rate)}</span><span class="p ${r.d1 > 0 ? 'up' : r.d1 < 0 ? 'dn' : ''}">${r.d1 == null ? '' : (r.d1 > 0 ? '▲' : r.d1 < 0 ? '▼' : '') + ' ' + pctTxt(r.d1).replace(/^[+−]/, '')}</span></div>`).join('');
  $('#tape').innerHTML = items + items; // twice for a seamless loop
}


/* ---------- the river: two rows of notes that slide as you scroll ---------- */
let riverDone = false;
function buildRiver() {
  if (riverDone || !fontsOk || !S.rows.length) return; riverDone = true;
  const by = S.rows.filter(r => r.d365 != null).sort((a, b) => a.d365 - b.d365);
  const top = by.slice(0, 9), rest = ['EUR', 'JPY', 'GBP', 'CHF', 'BRL', 'ZAR', 'KRW', 'MXN', 'INR', 'CNY'].map(byCode).filter(r => r && !top.includes(r)).slice(0, 9);
  const jobs = [...top.map(r => ['#rv1', r]), ...rest.map(r => ['#rv2', r])];
  const next = () => {
    const j = jobs.shift(); if (!j) return;
    const [row, r] = j, melt = Math.max(0, -(r.d365 || 0));
    const c = noteFor({ w: 560, title: r.unit, sub: r.name, denom: `1 USD = ${fmtRate(r.rate)} ${r.code}`, serial: `FT ${r.code} 0000001`, corner: r.code, seal: r.code, sym: r.sym, melt, pad: 0, seedKey: 'rv' + r.code });
    c.className = 'rn'; $(row).appendChild(c); requestAnimationFrame(() => c.classList.add('in'));
    setTimeout(next, 16);
  };
  next();
}
const river = $('#river'), rv1 = $('#rv1'), rv2 = $('#rv2'), rvw = $('#rvw');
onFrame((y, vh) => {
  const r = river.getBoundingClientRect(); if (r.bottom < -50 || r.top > vh + 50) return;
  const p = (vh - r.top) / (vh + r.height), w = innerWidth;
  rv1.style.transform = `translate3d(${(-p * Math.max(0, rv1.scrollWidth - w) * 0.85).toFixed(1)}px,0,0)`;
  rv2.style.transform = `translate3d(${(-(1 - p) * Math.max(0, rv2.scrollWidth - w) * 0.85).toFixed(1)}px,0,0)`;
  rvw.style.transform = `translate3d(${(-p * 900).toFixed(1)}px,-50%,0)`;
});

/* ---------- notes (cached canvases) ---------- */
const NOTES = new Map();
function curNote(r, w, extra = {}) {
  const melt = Math.max(0, -(r.d365 || 0)), key = `${r.code}:${w}:${melt.toFixed(3)}:${extra.key || ''}`;
  if (NOTES.has(key)) return NOTES.get(key);
  const c = noteFor({ w, title: extra.title || r.unit, sub: extra.sub || r.name, denom: extra.denom || `1 USD = ${fmtRate(r.rate)} ${r.code}`, serial: `FT ${r.code} 0000001`, corner: r.code, seal: r.code, sym: r.sym, melt, pad: extra.key === 'w' && !melt ? 0 : 0.2, seedKey: r.code });
  c.setAttribute('role', 'img'); c.setAttribute('aria-label', `${r.name} note, ${melt > 0 ? Math.round(melt * 100) + '% dissolved: the value it lost in a year' : 'intact: it held its value this year'}`);
  NOTES.set(key, c); return c;
}

/* ---------- spotlight ---------- */
function worstBy(k) { return S.rows.filter(r => r[k] != null).sort((a, b) => a[k] - b[k])[0]; }
let worstShown = '';
function renderSpot() {
  const k = S.rows.some(r => r.d1 != null && Math.abs(r.d1) > 1e-9) ? 'd1' : 'd7';
  const w = worstBy(k); if (!w) return;
  $('#worst').innerHTML = `<div class="wn">${esc(w.name)}</div><div class="wd">${pct(w[k])} <span class="mu">${k === 'd1' ? '24h' : '7d'}</span></div>`;
  $('#worstPair').href = '/launch?c=' + w.code; $('#worstOpen').onclick = () => openDrawer(w.code);
  if (fontsOk && worstShown !== w.code + w.rate) {
    worstShown = w.code + w.rate;
    const box = $('#wNote'), stamp = $('#wStamp'); box.querySelectorAll('canvas').forEach(c => c.remove());
    box.prepend(curNote(w, 900, { title: w.unit, sub: w.name, key: 'w' }));
    stamp.textContent = `DEVALUED ${pctTxt(w[k])}`;
  }
  const g = S.rows.filter(r => r.d365 != null).sort((a, b) => a.d365 - b.d365).slice(0, 6);
  const max = Math.max(...g.map(r => Math.abs(r.d365)), 0.01);
  $('#grave').innerHTML = g.map((r, i) => `<li data-c="${r.code}"><span class="i">${i + 1}</span><span class="mn" data-n="${r.code}"></span><span class="gx"><span>${r.code}<small>${esc(r.name)}</small></span><span class="bar"><i style="width:${(Math.abs(r.d365) / max * 100).toFixed(1)}%"></i></span></span><b>${pct(r.d365, 1)}</b></li>`).join('');
  if (fontsOk) $$('#grave .mn').forEach(el => el.appendChild(curNote(byCode(el.dataset.n), 208, { key: 'g' })));
  // hero stats
  scramble($('#hsN'), S.rows.length);
  const hw = worstBy('d1') || w; $('#hsWorst').innerHTML = `${hw.code} <small>${pct(hw.d1 != null ? hw.d1 : hw.d7)}</small>`;
  renderMelt();
}
function setSrc() {
  const liveN = S.rows.filter(r => r.live).length;
  $('#bSrc').textContent = `Daily reference rates · ${S.fx.date} · ${S.fx.source}` + (liveN ? ` · ${liveN} with intraday quotes` : '');
  $('#bN').textContent = S.rows.length;
}

/* ---------- the melt: $100 at each currency's own 1-year pace, since this page opened ---------- */
let meltCodes = [];
function renderMelt() {
  const worst = S.rows.filter(r => r.d365 != null).sort((a, b) => a.d365 - b.d365).slice(0, 3).map(r => r.code);
  if (!byCode(S.pick)) S.pick = (S.rows.find(r => r.d365 != null && !worst.includes(r.code)) || {}).code;
  const codes = [...worst, S.pick].filter(Boolean);
  if (codes.join() === meltCodes.join() && $('#melts').children.length) return;
  meltCodes = codes;
  const opts = S.rows.slice().sort((a, b) => a.code.localeCompare(b.code)).filter(r => r.d365 != null).map(r => `<option value="${r.code}" ${r.code === S.pick ? 'selected' : ''}>${r.code} · ${esc(r.name)}</option>`).join('');
  $('#melts').innerHTML = codes.map((c, i) => {
    const r = byCode(c);
    return `<div class="mcard" data-c="${c}"><div class="mn" data-n="${c}"></div><div class="mh"><span>$100 in ${c}</span><small>${pct(r.d365, 1)} / yr</small></div>
      ${i === 3 ? `<select aria-label="Pick a currency" id="mPick">${opts}</select>` : ''}
      <div class="mv" data-v="${c}">$100.00000000</div></div>`;
  }).join('');
  if (fontsOk) $$('#melts .mn').forEach(el => el.appendChild(curNote(byCode(el.dataset.n), 360, { key: 'm' })));
  const sel = $('#mPick'); if (sel) { sel.addEventListener('click', e => e.stopPropagation()); sel.addEventListener('change', () => { S.pick = sel.value; meltCodes = []; renderMelt(); }); }
}
$('#melts').addEventListener('click', e => { if (e.target.closest('select')) return; const c = e.target.closest('.mcard'); if (c) openDrawer(c.dataset.c); });
function meltLoop() {
  const t = (performance.now() - T0) / 1000;
  const s = Math.floor(t), mm = String(Math.floor(s / 60)).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
  const ck = $('#mClock'); if (ck.textContent !== mm + ':' + ss) ck.textContent = mm + ':' + ss;
  const value = r => 100 * Math.pow(1 + r.d365, t / YEAR);
  $$('#melts .mv').forEach(el => {
    const r = byCode(el.dataset.v); if (!r || r.d365 == null) return;
    const v = value(r), d = v - 100, txt = v.toFixed(8);
    el.innerHTML = `$${txt.slice(0, -4)}<i>${txt.slice(-4)}</i>`; el.className = 'mv ' + (d < 0 ? 'dn' : 'up');
  });
  const hr = byCode(S.heroCode);
  if (hr && hr.d365 != null) { const v = value(hr); $('#hc3V').innerHTML = `<span class="${v < 100 ? 'dn' : 'up'}">$${v.toFixed(8)}</span>`; }
}
const meltBox = $('.melt'), heroBox = $('.hero');
const onScreen = el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };
(function tick() { if (!document.hidden && S.rows.length && (onScreen(meltBox) || onScreen(heroBox))) meltLoop(); setTimeout(() => requestAnimationFrame(tick), 80); })();

/* ---------- drawer ---------- */
function openDrawer(code) {
  const r = byCode(code); if (!r) return;
  S.sel = code; if (S.view === 'table') renderBoard();
  $('#dFlag').outerHTML = badge(r).replace('class="flag', 'id="dFlag" class="flag'); $('#dName').textContent = r.name; $('#dSub').textContent = `${r.code} · ${r.country} · ${r.region}`;
  $('#dRate').innerHTML = `${fmtRate(r.rate)}<small>${r.code} per USD</small>`;
  $('#dNote').innerHTML = r.live ? `<span class="tag live">LIVE</span> intraday quote · ${new Date(r.liveT).toLocaleTimeString()}` : `<span class="tag daily">DAILY</span> reference rate · ${esc(S.fx.date)}`;
  drawRange(r);
  const v30 = (r.s30 || []).filter(x => x > 0), hi = v30.length ? Math.min(...v30) : null, lo = v30.length ? Math.max(...v30) : null;
  $('#dKv').innerHTML = [['24h', pct(r.d1)], ['7 days', pct(r.d7)], ['30 days', pct(r.d30)], ['90 days', pct(r.d90)], ['1 year', pct(r.d365)], ['Symbol', esc(r.sym)], ['30d best (1 USD =)', fmtRate(hi)], ['30d worst (1 USD =)', fmtRate(lo)]]
    .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  $('#dCalc').innerHTML = (r.d365 != null ? `$100 in ${r.code} a year ago → <b>$${(100 * (1 + r.d365)).toFixed(2)}</b> today` : 'No 1-year history.')
    + (S.solUsd ? `<br>1 SOL ≈ <b>${fmtRate(S.solUsd * r.rate)} ${r.code}</b>` : '');
  const cs = coinsFor(code);
  $('#dCoins').innerHTML = cs.length ? `<div class="k2" style="margin-top:22px;font:500 11px var(--mono);letter-spacing:.12em;color:var(--dim)">COINS PAIRED WITH ${code}</div>` + cs.slice(0, 6).map(c => `<a class="sumrow" style="text-decoration:none" href="https://pump.fun/coin/${esc(c.mint)}" target="_blank" rel="noopener"><span>${esc(c.name)} <span class="amb">$${esc(c.symbol)}</span></span><b>${usd(c.mcap)}</b></a>`).join('') : '';
  $('#dPair').href = '/launch?c=' + code; $('#dPair').textContent = `Pair a coin with the ${r.unit}`;
  $('#drawer').classList.add('on'); $('#scrim').classList.add('on');
}
function drawRange(r) {
  $$('#dRange button').forEach(b => b.classList.toggle('on', +b.dataset.r === S.range));
  if (S.range === 30) bigChart($('#dChart'), r.s30, S.fx.days || []);
  else bigChart($('#dChart'), r.s1y, S.fx.weeks || []);
}
function closeDrawer() { $('#drawer').classList.remove('on'); $('#scrim').classList.remove('on'); S.sel = null; if (S.view === 'table') renderBoard(); }
$('#dX').onclick = closeDrawer; $('#scrim').onclick = closeDrawer;
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
$('#dRange').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.range = +b.dataset.r; const r = byCode(S.sel); if (r) drawRange(r); });

/* ---------- board controls ---------- */
$('#rows').addEventListener('click', e => { if (e.target.closest('[data-stop]')) return; const tr = e.target.closest('tr[data-c]'); if (tr) openDrawer(tr.dataset.c); });
$('#heatView').addEventListener('click', e => { const t = e.target.closest('[data-c]'); if (t) openDrawer(t.dataset.c); });
$('#grave').addEventListener('click', e => { const li = e.target.closest('li[data-c]'); if (li) openDrawer(li.dataset.c); });
$('#bt thead').addEventListener('click', e => { const th = e.target.closest('th[data-s]'); if (!th) return; const k = th.dataset.s; if (S.sort === k) S.dir *= -1; else { S.sort = k; S.dir = k === 'code' ? 1 : k === 'coins' ? -1 : 1; } renderBoard(); });
$('#q').addEventListener('input', e => { S.q = e.target.value; renderBoard(); });
$('#regions').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.region = b.dataset.r; $$('#regions button').forEach(x => x.classList.toggle('on', x === b)); renderBoard(); });
$('#period').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.period = S.sort = b.dataset.p; S.dir = 1; $$('#period button').forEach(x => x.classList.toggle('on', x === b)); renderBoard(); });
$('#view').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; S.view = b.dataset.v; $$('#view button').forEach(x => x.classList.toggle('on', x === b));
  $('#tableView').hidden = S.view !== 'table'; $('#heatView').hidden = S.view !== 'heat'; renderBoard();
});

/* ---------- coins ---------- */
function renderCoins() {
  const box = $('#coinBox');
  if (S.coinsOk) scramble($('#hsCoins'), S.coins.length); else $('#hsCoins').textContent = '—';
  if (!S.coinsOk) { box.innerHTML = `<div class="coins-empty"><h3>Coin feed offline</h3><p>The chain couldn't be read right now. It retries every minute.</p></div>`; return; }
  if (!S.coins.length) {
    box.innerHTML = `<div class="coins-empty"><div class="stamp sm amb on" style="position:relative;display:inline-block;margin-bottom:16px">AWAITING FIRST PRINT</div><h3>No coins yet</h3><p>${S.cfg.launches === 'open' ? 'Be the first.' : 'Launches open when $FIAT is out.'}</p>${S.cfg.launches === 'open' ? '<a class="btn pri" href="/launch" style="margin-top:14px">Launch the first one</a>' : ''}</div>`;
    return;
  }
  let list = S.coins.slice();
  if (S.coinSort === 'mcap') list.sort((a, b) => (b.mcap || 0) - (a.mcap || 0));
  else if (S.coinSort === 'beat') list.sort((a, b) => ((b.chg24 || 0) / 100 - ((byCode(b.code) || {}).d1 || 0)) - ((a.chg24 || 0) / 100 - ((byCode(a.code) || {}).d1 || 0)));
  else list.sort((a, b) => b.t - a.t);
  box.innerHTML = '<div class="coins">' + list.map(c => {
    const f = byCode(c.code) || {}, cc = c.chg24 != null ? c.chg24 / 100 : null;
    const beat = cc != null && f.d1 != null ? (cc > f.d1 ? 'up' : 'dn') : '';
    return `<a class="coin rv in" href="https://pump.fun/coin/${esc(c.mint)}" target="_blank" rel="noopener">
      <div class="coin-ser"><span>FT ${esc(c.code)} ${esc(String(c.mint).slice(0, 6).toUpperCase())}</span><span>${ago(c.t)}</span></div>
      <div class="coin-h">${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : badge(f, 'ph')}<div style="min-width:0"><b>${esc(c.name)}</b><small>$${esc(c.symbol)}</small></div><span class="tag n">vs ${c.code}</span></div>
      <div class="vs"><div>$${esc(c.symbol)} 24h<b>${pct(cc)}</b></div><span class="v">vs</span><div>${c.code} 24h<b>${pct(f.d1)}</b></div></div>
      <div class="prog" title="bonding curve"><i style="width:${((c.curve ? c.curve.progress : 1) * 100).toFixed(1)}%"></i></div>
      <div class="coin-f"><span>mcap ${usd(c.mcap)}</span><span class="${beat}">${beat === 'up' ? 'beating its fiat' : beat === 'dn' ? 'losing to its fiat' : c.curve && !c.curve.complete ? 'on the curve' : 'graduated'}</span></div></a>`;
  }).join('') + '</div>';
}
$('#coinSort').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.coinSort = b.dataset.s; $$('#coinSort button').forEach(x => x.classList.toggle('on', x === b)); renderCoins(); });
async function loadCoins() {
  try { const j = await api('coins'); S.coins = j.list || []; S.solUsd = j.solUsd || null; S.coinsOk = true; } catch (e) { S.coinsOk = false; }
  renderCoins(); if (S.rows.length) renderBoard();
}

/* ---------- how it works: a pinned printing press, scrubbed by scroll ---------- */
const PP = { cur: ['ARS', 'NGN', 'JPY', 'INR', 'EGP', 'TRY'], ready: false, stamped: false, burst: false, last: '' };
function ppNote(r) {
  const key = 'pp:' + r.code; if (NOTES.has(key)) return NOTES.get(key);
  const c = noteFor({ w: 900, title: r.unit, sub: r.name, denom: `1 USD = ${fmtRate(r.rate)} ${r.code}`, serial: `FT ${r.code} 0000001`, corner: r.code, seal: r.code, sym: r.sym, seedKey: 'pp' + r.code });
  NOTES.set(key, c); return c;
}
function buildPress() {
  if (PP.ready || !fontsOk || !S.rows.length) return;
  const t = byCode('TRY'); if (!t) return;
  PP.ready = true;
  PP.coin = noteFor({ w: 900, title: 'Lira Coin', sub: 'paired with the Turkish lira', denom: 'fiat:v1:TRY:LIRA', serial: 'FT TRY 0000001', corner: '$LIRA', seal: 'TRY', sym: '₺', seedKey: 'ppcoin' });
  $('#ppTop').appendChild(PP.coin);
  pressFrame(scrollY, innerHeight);
}
function pressBurst() {
  const box = $('#ppBurst'); box.innerHTML = '';
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 260, el = document.createElement('i');
    el.style.cssText = `--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d * 0.7).toFixed(0)}px;--r:${(Math.random() * 360) | 0}deg;background:${Math.random() < 0.6 ? `rgb(255,${150 + (Math.random() * 70 | 0)},40)` : '#cdd9c1'};animation-delay:${(Math.random() * 0.1).toFixed(2)}s`;
    box.appendChild(el);
  }
  setTimeout(() => { box.innerHTML = ''; }, 1600);
}
const ppSec = $('#how');
function pressFrame(y, vh) {
  if (!PP.ready) return;
  const r = ppSec.getBoundingClientRect(); if (r.bottom < 0 || r.top > vh) return;
  const p = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height - vh)));
  $('#ppBar').style.transform = `scaleX(${p.toFixed(3)})`;
  const step = p < 0.34 ? 0 : p < 0.67 ? 1 : 2;
  $$('#ppSteps li').forEach((li, i) => { li.classList.toggle('on', i === step); li.classList.toggle('past', i < step); });
  // I: the currency flips until it lands on the lira
  const n = PP.cur.length, ci = Math.min(n - 1, Math.floor(Math.min(1, p / 0.3) * n)), cur = byCode(PP.cur[ci]) || byCode('TRY');
  if (cur && PP.last !== cur.code) { PP.last = cur.code; const b = $('#ppBase'); b.innerHTML = ''; b.appendChild(ppNote(cur)); $('#ppCur').innerHTML = `USD/${cur.code} <b>${fmtRate(cur.rate)}</b> ${pct(cur.d1)}`; }
  // II: the coin note prints over it, left to right
  const q = Math.max(0, Math.min(1, (p - 0.36) / 0.28));
  $('#ppTop').style.clipPath = `inset(0 ${(100 - q * 100).toFixed(2)}% 0 0)`;
  const scan = $('#ppScan'); scan.style.left = (q * 100).toFixed(2) + '%'; scan.style.opacity = q > 0 && q < 1 ? 1 : 0;
  $('#ppCur').style.opacity = p < 0.4 ? 1 : 0;
  // III: signed, stamped, live
  const card = $('#ppCard');
  card.style.transform = `rotateX(${(8 - p * 8).toFixed(2)}deg) rotateY(${(-10 + p * 14).toFixed(2)}deg) rotate(${(-3 + p * 2).toFixed(2)}deg) scale(${(0.94 + p * 0.06).toFixed(3)})`;
  const st = $('#ppStamp'), on = p > 0.74;
  if (on && !PP.stamped) { PP.stamped = true; st.classList.remove('slam'); void st.offsetWidth; st.classList.add('on', 'slam'); }
  if (!on && PP.stamped) { PP.stamped = false; st.classList.remove('on', 'slam'); }
  $('#ppMemo').classList.toggle('on', p > 0.8);
  if (p > 0.84 && !PP.burst) { PP.burst = true; pressBurst(); } if (p < 0.7) PP.burst = false;
}
onFrame(pressFrame);

/* ---------- $FIAT + config ---------- */
function renderToken() {
  const c = S.cfg;
  if (c.registry) { $('#regLink').textContent = short(c.registry); $('#regLink').href = 'https://solscan.io/account/' + c.registry; }
  const xh = c.x ? (String(c.x).startsWith('http') ? c.x : 'https://x.com/' + String(c.x).replace(/^@/, '')) : '';
  const st = $('#tokStamp');
  if (c.ca) {
    $('#tokCa').textContent = c.ca; $('#tokCopy').disabled = false; $('#tokCopy').onclick = () => copy(c.ca, 'Contract address copied');
    $('#tokLinks').innerHTML = `<a class="btn pri" href="https://pump.fun/coin/${esc(c.ca)}" target="_blank" rel="noopener">Buy on pump.fun</a><a class="btn" href="https://dexscreener.com/solana/${esc(c.ca)}" target="_blank" rel="noopener">Chart</a>${xh ? `<a class="btn" href="${esc(xh)}" target="_blank" rel="noopener">X</a>` : ''}`;
    st.textContent = 'IN CIRCULATION'; st.classList.add('ok');
  } else if (xh) $('#tokLinks').innerHTML = `<a class="btn" href="${esc(xh)}" target="_blank" rel="noopener">Follow on X</a>`;
  caChip(c);
}

/* ---------- boot ---------- */
(async () => {
  fontsReady().then(() => {
    fontsOk = true;
    const n = noteCanvas(0.5); n.style.cssText = 'width:100%;height:100%'; $('#tokNoteIn').appendChild(n);
    tilt($('#tokNote')); slamOnView($('#tokStamp'));
    if (S.rows.length) { worstShown = ''; meltCodes = []; renderSpot(); slamOnView($('#wStamp')); buildRiver(); buildPress(); }
  });
  S.cfg = await loadConfig(); renderToken();
  try {
    S.fx = await loadFx(); S.rows = S.fx.list.slice();
    renderBoard(); renderTape(); renderSpot(); setSrc(); heroCards(S.heroCode);
    if (fontsOk) { slamOnView($('#wStamp')); buildRiver(); buildPress(); }
  } catch (e) {
    $('#rows').innerHTML = '<tr><td colspan="9" class="empty">Exchange rates are unreachable right now. Retrying…</td></tr>'; $('#bSrc').textContent = 'Rates offline';
    setTimeout(() => location.reload(), 30000);
  }
  loadCoins(); setInterval(() => { if (!document.hidden) loadCoins(); }, 60000);
  // intraday quotes, where a live feed answers
  const pollLive = async () => {
    if (!S.fx || document.hidden) return;
    const q = await loadLive(S.fx.list.map(r => r.code)); if (!Object.keys(q).length) return;
    S.rows = S.fx.list.map(r => applyLive(r, q[r.code]));
    renderBoard(); renderTape(); renderSpot(); setSrc(); heroCards(S.heroCode);
  };
  setTimeout(pollLive, 1500); setInterval(pollLive, 60000);
  const deep = new URLSearchParams(location.search).get('c'); if (deep) setTimeout(() => openDrawer(deep.toUpperCase()), 400);
})();
