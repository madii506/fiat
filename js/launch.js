/* FIAT launch: pick a currency, name a coin, sign one pump.fun transaction with the pairing inside. */
import { $, $$, esc, short, flag, fmtRate, pct, pctTxt, toast, api, loadConfig, loadFx, spark, ui, caChip, W, walletModal, signWith, waitFor, fontsReady, tilt, badge } from './core.js';
import { coinNoteCanvas, noteFor, noteBack } from './tex.js';
import { fx } from './fx.js';

const S = { cfg: {}, fx: null, cur: null, q: '', csort: 'd1', img: null, imgKind: null, imgEl: null, buy: 0, slip: 10, busy: false, fontsOk: false };
ui(); fx();
fontsReady().then(() => { S.fontsOk = true; renderNote(true); });
tilt($('#pHolo'), $('.press-note'));

/* ---------- currencies ---------- */
function renderGrid() {
  const q = S.q.trim().toLowerCase();
  let list = (S.fx ? S.fx.list : []).filter(r => !q || [r.code, r.name, r.country, r.unit].some(x => String(x).toLowerCase().includes(q)));
  if (S.csort === 'code') list.sort((a, b) => a.code.localeCompare(b.code));
  else list.sort((a, b) => (a[S.csort] == null) - (b[S.csort] == null) || (a[S.csort] || 0) - (b[S.csort] || 0));
  $('#cgrid').innerHTML = list.length ? list.map(r => `<button type="button" class="cbtn ${S.cur && S.cur.code === r.code ? 'on' : ''}" data-c="${r.code}">${badge(r)}<span><b>${r.code}</b><small>${pct(S.csort === 'd365' ? r.d365 : r.d1)}</small></span></button>`).join('') : '<div class="empty">No match.</div>';
}
function pick(code) {
  const r = S.fx && S.fx.list.find(x => x.code === code); if (!r) return;
  S.cur = r; renderGrid();
  $('#curSel').innerHTML = `${esc(r.name)}`;
  if (!$('#fName').value) { $('#fName').placeholder = `${cap(r.unit)} Coin`; }
  if (!$('#fSym').value) { $('#fSym').placeholder = r.unit.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10) || r.code; }
  if (S.imgKind === 'note') makeNote();
  const u = new URL(location.href); u.searchParams.set('c', code); history.replaceState(null, '', u);
  preview();
}
const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
$('#cgrid').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) pick(b.dataset.c); });
$('#cq').addEventListener('input', e => { S.q = e.target.value; renderGrid(); });
$('#csort').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.csort = b.dataset.s; $$('#csort button').forEach(x => x.classList.toggle('on', x === b)); renderGrid(); });

/* ---------- coin fields ---------- */
const fName = $('#fName'), fSym = $('#fSym'), fDesc = $('#fDesc');
fName.addEventListener('input', () => { $('#nameN').textContent = fName.value.length + '/32'; preview(); });
fSym.addEventListener('input', () => { const p = fSym.selectionStart; fSym.value = fSym.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); try { fSym.setSelectionRange(p, p); } catch (e) { } $('#symN').textContent = fSym.value.length + '/10'; preview(); });
fDesc.addEventListener('input', preview);
$('#autoDesc').addEventListener('click', () => {
  const r = S.cur; if (!r) return toast('Pick a currency first.');
  const sym = fSym.value || fSym.placeholder;
  fDesc.value = `$${sym} is paired with the ${r.name} (${r.code}) on FIAT. Over the last year the ${r.unit} moved ${pctTxt(r.d365, 1)} against the dollar. The pairing is written on-chain: fiat:v1:${r.code}:${sym}.`;
  preview();
});

/* ---------- picture ---------- */
async function setImage(file) {
  if (!file) return;
  if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) return toast('Use a PNG, JPG, GIF or WEBP.');
  if (file.size > 4.2e6) return toast('That picture is over 4 MB.');
  if (file.type === 'image/gif') { S.img = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); }); S.imgKind = 'file'; return showImg(); }
  // re-encode others to a sane size (max 1000 px), keeping PNG transparency
  const bmp = await createImageBitmap(file); const k = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  S.img = file.type === 'image/png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.92);
  if (S.img.length > 5.5e6) S.img = c.toDataURL('image/jpeg', 0.88);
  S.imgKind = 'file'; showImg();
}
async function makeNote() {
  if (!S.cur) return toast('Pick a currency first.');
  try { await Promise.race([Promise.all(['800 80px Cinzel', '700 30px Cinzel', '500 30px JBM'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 1500))]); } catch (e) { }
  const c = coinNoteCanvas(S.cur, 1000);
  S.img = c.toDataURL('image/jpeg', 0.92); S.imgKind = 'note'; showImg();
}
function showImg() {
  $('#pv').innerHTML = S.img ? `<img src="${S.img}" alt="">` : 'no picture'; $('#clrImg').hidden = !S.img;
  S.imgEl = null;
  if (S.img && S.imgKind === 'file') { const im = new Image(); im.onload = () => { S.imgEl = im; renderNote(true); }; im.src = S.img; }
  preview();
}
$('#file').addEventListener('change', e => setImage(e.target.files[0]));
$('#mkNote').addEventListener('click', makeNote);
$('#clrImg').addEventListener('click', () => { S.img = null; S.imgKind = null; $('#file').value = ''; showImg(); });
const drop = $('#drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) setImage(f); });
window.addEventListener('paste', e => { const it = [...(e.clipboardData && e.clipboardData.items || [])].find(i => i.type.startsWith('image/')); if (it) setImage(it.getAsFile()); });

/* ---------- first buy ---------- */
const fBuy = $('#fBuy');
function setBuy(v, fromInput) {
  let n = Number(String(v).replace(',', '.')); if (!isFinite(n) || n < 0) n = 0; n = Math.min(50, n);
  S.buy = n; if (!fromInput) fBuy.value = String(n); $('#slipF').hidden = !(n > 0);
  $$('#buyP button').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === n)); preview();
}
$('#buyP').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setBuy(b.dataset.v); });
fBuy.addEventListener('input', () => setBuy(fBuy.value, true));
$('#slip').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.slip = +b.dataset.v; $$('#slip button').forEach(x => x.classList.toggle('on', x === b)); preview(); });

/* ---------- preview + summary ---------- */
function preview() {
  const r = S.cur, name = fName.value || fName.placeholder || 'Your coin', sym = fSym.value || fSym.placeholder || 'TICKER';
  $('#pName').innerHTML = `${esc(name)}<small>$${esc(sym)}</small>`;
  $('#pImg').innerHTML = S.img ? `<img src="${S.img}" alt="">` : (r ? esc(r.sym) : '?');
  if (r) $('#pChart').innerHTML = `<span>${r.code} · 30d ${pct(r.d30)} · 24h ${pct(r.d1)}</span>` + spark(r.s30, 300, 74).replace('class="spark"', 'class="spark" style="width:100%;height:100%"');
  $('#pTx').innerHTML = `<span class="k">1</span> pump.fun create_v2  <span class="s">${esc(name.slice(0, 18))} · $${esc(sym)}</span>\n${S.buy > 0 ? `<span class="k">2</span> pump.fun buy        <span class="s">${S.buy} SOL · max +${S.slip}%</span>\n` : ''}<span class="k">${S.buy > 0 ? 3 : 2}</span> memo               <span class="s">"fiat:v1:${r ? r.code : '???'}:${esc(sym)}"</span>\n<span class="k">${S.buy > 0 ? 4 : 3}</span> registry tag       <span class="s">${esc(short(S.cfg.registry || ''))}</span>`;
  const ok1 = !!r, ok2 = !!(fName.value.trim() && fSym.value.trim() && S.img);
  $('#ps1').classList.toggle('ok', ok1); $('#ps2').classList.toggle('ok', ok2); $('#ps3').classList.toggle('ok', !!S.launched);
  $$('.lp-grid .box').forEach((b, i) => b.classList.toggle('ok', [ok1, ok2, !!S.launched][i]));
  renderNote();
  summary();
}
function summary() {
  const fees = 0.02 + 0.0025;
  const max = S.buy * (1 + S.slip / 100);
  $('#sum').innerHTML = [
    ['Fees (pump.fun + network)', `≈ ${fees.toFixed(3)} SOL`],
    ['FIAT fee', '0'],
    ['You need', `≈ ${(fees + max + 0.005).toFixed(3)} SOL`],
  ].map(([k, v]) => `<div class="sumrow"><span>${k}</span><b>${v}</b></div>`).join('');
  goState();
}
function goState() {
  const b = $('#goBtn');
  if (S.busy) return;
  if (S.launched) { b.disabled = true; b.textContent = `Launched ✓ $${S.launched}`; return; }
  if (S.cfg.launches !== 'open') { b.disabled = true; b.textContent = 'Launches open when $FIAT is out'; return; }
  b.disabled = false;
  b.textContent = !W.acct ? 'Connect wallet to launch' : `Print & launch ${fSym.value ? '$' + fSym.value : 'coin'}${S.cur ? ' vs ' + S.cur.code : ''}`;
}


/* ---------- the note: your coin, printed ---------- */
let noteT = 0, noteKey = '';
function renderNote(now) {
  clearTimeout(noteT);
  noteT = setTimeout(() => {
    if (!S.fontsOk) return;
    const r = S.cur, sym = (fSym.value || fSym.placeholder || 'TICKER').toUpperCase(), name = fName.value || fName.placeholder || 'Your coin';
    const o = r ? { title: name, sub: `paired with the ${r.name}`, denom: `fiat:v1:${r.code}:${sym}`, serial: `FT ${r.code} 0000001`, corner: '$' + sym, seal: r.code, sym: r.sym }
      : { title: name, sub: 'pick a currency', denom: 'fiat:v1:???:' + sym, serial: 'FT ??? 0000001', corner: '$' + sym, seal: '¤', sym: '¤' };
    const img = S.imgKind === 'file' ? S.imgEl : null;
    const key = JSON.stringify(o) + (img ? S.img.length : 0);
    if (key === noteKey) return; noteKey = key;
    const c = noteFor({ ...o, img, w: 1000, seedKey: 'press' });
    c.style.cssText = 'width:100%;height:100%;display:block'; c.setAttribute('role', 'img'); c.setAttribute('aria-label', `Preview note for ${name}`);
    const box = $('#pNote'); box.innerHTML = ''; box.appendChild(c); S.note = c; $('#saveNote').disabled = false;
    const back = noteBack({ w: 1000, memo: o.denom, code: r ? r.code : '¤', sym: r ? r.sym : '¤' }); back.style.cssText = 'width:100%;height:100%;display:block';
    const bb = $('#pBack'); bb.innerHTML = ''; bb.appendChild(back);
  }, now ? 0 : 160);
}
$('#saveNote').addEventListener('click', () => {
  if (!S.note) return;
  S.note.toBlob(b => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `fiat-note-${(fSym.value || 'coin').toLowerCase()}.png`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }, 'image/png');
});
function burst() {
  const box = $('#burst'); box.innerHTML = '';
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 220, el = document.createElement('i');
    el.style.cssText = `--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d * 0.7 - 30).toFixed(0)}px;--r:${(Math.random() * 360) | 0}deg;background:${Math.random() < 0.55 ? `rgb(255,${150 + (Math.random() * 70 | 0)},40)` : '#cdd9c1'};animation-delay:${(Math.random() * 0.12).toFixed(2)}s`;
    box.appendChild(el);
  }
  setTimeout(() => { box.innerHTML = ''; }, 1700);
}

const flip = () => $('#pFlip').classList.toggle('on');
$('#flipBtn').addEventListener('click', e => { e.stopPropagation(); flip(); });
$('#pPress').addEventListener('click', e => { if (!e.target.closest('button')) flip(); });

/* ---------- log ---------- */
function log(msg, cls = 'run') { const l = $('#log'); l.hidden = false; const prev = l.querySelector('.l.run'); if (prev && cls !== 'run') { } const d = document.createElement('div'); d.className = 'l ' + cls; d.innerHTML = `<i>${cls === 'ok' ? '✓' : cls === 'err' ? '!' : '›'}</i><span>${msg}</span>`; l.appendChild(d); l.scrollTop = l.scrollHeight; return d; }
const okLine = (d, msg) => { d.className = 'l ok'; d.querySelector('i').textContent = '✓'; if (msg) d.querySelector('span').innerHTML = msg; };

/* ---------- wallet + launch ---------- */
async function connect() {
  try { const a = await walletModal(); $('#wBtn').textContent = short(a.address); log(`Wallet connected: ${esc(W.w.name)} ${esc(short(a.address))}`, 'ok'); goState(); return true; }
  catch (e) { return false; }
}
$('#wBtn').addEventListener('click', connect);
function validate() {
  if (!S.cur) return 'Pick a currency.';
  if (!fName.value.trim()) return 'Give your coin a name.';
  if (!fSym.value.trim()) return 'Give your coin a ticker.';
  if (!S.img) return 'Add a picture, or print a banknote.';
  for (const id of ['fX', 'fWeb', 'fTg']) { const v = $('#' + id).value.trim(); if (v && !/^https?:\/\/\S+$/.test(v)) return 'Links must start with https://'; }
  return null;
}
$('#goBtn').addEventListener('click', async () => {
  if (S.busy || S.launched) return;
  if (S.cfg.launches !== 'open') return toast('Launches open when $FIAT is out.');
  const bad = validate(); if (bad) return toast(bad);
  if (!W.acct && !(await connect())) return;
  if (!window.SolanaLite) return toast('Still loading. Try again in a second.');
  S.busy = true; const b = $('#goBtn'); b.disabled = true; b.textContent = 'Printing…'; $('#done').hidden = true; $('#press').classList.add('busy'); $('#pTxState').textContent = 'BUILDING';
  const user = W.acct.address, code = S.cur.code, sym = fSym.value.trim(), name = fName.value.trim();
  try {
    let d = log('Uploading the picture and metadata to IPFS…');
    const up = await api('ipfs', { image: S.img, name, symbol: sym, description: fDesc.value.trim(), twitter: $('#fX').value.trim(), website: $('#fWeb').value.trim(), telegram: $('#fTg').value.trim() });
    okLine(d, 'Metadata on IPFS');
    const mint = window.SolanaLite.Keypair.generate();
    d = log('Building and simulating the launch…');
    const tx = await api('build', { user, mint: mint.publicKey.toBase58(), name, symbol: sym, uri: up.uri, code, sol: S.buy, slippage: S.slip });
    okLine(d, `Simulated OK · ${tx.units.toLocaleString()} compute units${tx.followUp ? ' · first buy will follow in a second transaction' : ''}`);
    $('#pTxState').textContent = 'SIGNING'; d = log('Sign in your wallet…');
    const signed = await signWith(tx.tx, mint);
    let sig = signed.sig;
    if (!sig) { okLine(d, 'Signed'); d = log('Sending…'); sig = (await api('send', { tx: signed.tx })).sig; }
    okLine(d, `Sent · <a class="amb" href="https://solscan.io/tx/${sig}" target="_blank" rel="noopener">${short(sig)}</a>`);
    $('#pTxState').textContent = 'SENT'; d = log('Waiting for confirmation…'); await waitFor(sig); okLine(d, 'Confirmed on Solana'); $('#pTxState').textContent = 'CONFIRMED';
    let buySig = null;
    if (tx.followUp === 'buy' && S.buy > 0) {
      d = log(`Building your first buy (${S.buy} SOL)…`);
      try {
        const bt = await api('buy', { user, mint: mint.publicKey.toBase58(), sol: S.buy, slippage: S.slip });
        okLine(d, 'First buy simulated'); d = log('Sign the first buy in your wallet…');
        const sb = await signWith(bt.tx, null); buySig = sb.sig || (await api('send', { tx: sb.tx })).sig;
        okLine(d, 'First buy sent'); d = log('Confirming the first buy…'); await waitFor(buySig); okLine(d, 'First buy confirmed');
      } catch (e) { d.className = 'l err'; d.querySelector('span').textContent = 'First buy skipped: ' + e.message + ' You can buy on pump.fun.'; }
    }
    done(mint.publicKey.toBase58(), sig, name, sym, code);
  } catch (e) {
    const msg = /reject|cancel|denied|declined/i.test(e.message) ? 'Cancelled in the wallet. Nothing was sent.' : e.message;
    log(esc(msg), 'err'); if (e.logs && e.logs.length) log('<span class="mu">' + esc(e.logs.slice(-3).join(' · ')).slice(0, 300) + '</span>', 'err');
    toast(msg);
    if (!S.launched) $('#pTxState').textContent = 'NOT SENT';
  } finally { S.busy = false; b.disabled = false; $('#press').classList.remove('busy'); goState(); }
});
function done(mint, sig, name, sym, code) {
  const r = S.cur;
  const text = `I just paired $${sym} with the ${r.unit} (${code}) on fiat. my coin vs. the ${r.unit}.`;
  $('#done').hidden = false;
  $('#done').innerHTML = `<h3>$${esc(sym)} is live · vs ${code}</h3><div class="mu mono" style="font-size:12px;word-break:break-all">${esc(mint)}</div>
    <div class="acts"><a class="btn pri" href="https://pump.fun/coin/${esc(mint)}" target="_blank" rel="noopener">Open on pump.fun</a><a class="btn" href="https://solscan.io/tx/${esc(sig)}" target="_blank" rel="noopener">Transaction</a>
    <a class="btn" href="https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent('https://pump.fun/coin/' + mint)}" target="_blank" rel="noopener">Share on X</a><a class="btn" href="/#coins">See it on the board</a><a class="btn" href="/launch">Launch another</a></div>`;
  S.launched = sym; toast(`$${sym} launched`); preview();
  $('#pFlip').classList.remove('on'); const st = $('#pStamp'); st.textContent = 'PRINTED'; st.classList.remove('slam'); void st.offsetWidth; st.classList.add('on', 'slam'); burst();
}

/* ---------- boot ---------- */
(async () => {
  S.cfg = await loadConfig(); caChip(S.cfg);
  $('#paused').hidden = S.cfg.launches === 'open';
  try { S.fx = await loadFx(); } catch (e) { $('#cgrid').innerHTML = '<div class="empty">Exchange rates are unreachable right now. Reload in a minute.</div>'; }
  renderGrid();
  const want = (new URLSearchParams(location.search).get('c') || '').toUpperCase();
  if (want && S.fx && S.fx.list.some(r => r.code === want)) pick(want);
  setBuy(0); preview();
})();
