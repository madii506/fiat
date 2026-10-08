// FIAT banknote + money band textures (our own design, no real currency copied).
export const INK = '#1f3a2b', INK2 = '#4a6852', RED = '#8e2b1d', AMB = '#c47a10';
let seed = 11; export const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
export const reseed = v => { let h = 7; for (const ch of String(v)) h = (h * 31 + ch.charCodeAt(0)) % 2147483646; seed = h || 11; };

function noise(x, W, H, amt) {
  const id = x.getImageData(0, 0, W, H), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(id, 0, 0);
}
function ring(x, cx, cy, r, w, col) { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke(); }
// the currency sign, engraved: many fine concentric lines + hatched spokes
export function curSign(x, cx, cy, R, col, fine = true) {
  x.save(); x.strokeStyle = col; x.lineCap = 'butt';
  const th = R * 0.3, n = fine ? Math.round(th / 2.6) : 1;
  if (fine) for (let i = 0; i < n; i++) { x.lineWidth = 1.7; x.beginPath(); x.arc(cx, cy, R - th / 2 + i * th / n, 0, Math.PI * 2); x.stroke(); }
  else ring(x, cx, cy, R, th, col);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux;
    const r0 = R + th * 0.45, r1 = R + th * 0.45 + R * 0.62, w = th * 0.95;
    if (fine) for (let i = -w / 2; i <= w / 2; i += 2.6) { x.lineWidth = 1.7; x.beginPath(); x.moveTo(cx + ux * r0 + px * i, cy + uy * r0 + py * i); x.lineTo(cx + ux * r1 + px * i, cy + uy * r1 + py * i); x.stroke(); }
    else { x.lineWidth = w; x.beginPath(); x.moveTo(cx + ux * r0, cy + uy * r0); x.lineTo(cx + ux * r1, cy + uy * r1); x.stroke(); }
  }
  x.restore();
}
function rosette(x, cx, cy, rx, ry, col, alpha) {
  x.save(); x.strokeStyle = col; x.globalAlpha = alpha; x.lineWidth = 1.3;
  for (let R = 0.18; R <= 1.0; R += 0.055) {
    x.beginPath();
    for (let i = 0; i <= 720; i++) {
      const t = i / 720 * Math.PI * 2, m = 1 + 0.06 * Math.sin(14 * t + R * 9) + 0.025 * Math.sin(31 * t - R * 5);
      const px = cx + Math.cos(t) * rx * R * m, py = cy + Math.sin(t) * ry * R * m;
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.stroke();
  }
  x.restore();
}
function waveBand(x, x0, y0, len, horiz, amp, col, alpha) {
  x.save(); x.strokeStyle = col; x.globalAlpha = alpha; x.lineWidth = 1.4;
  for (let k = 0; k < 7; k++) {
    x.beginPath();
    for (let s = 0; s <= len; s += 4) {
      const o = amp * Math.sin(s / 19 + k * 0.9) * Math.cos(s / 57 - k * 0.4);
      const px = horiz ? x0 + s : x0 + o, py = horiz ? y0 + o : y0 + s;
      s ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.stroke();
  }
  x.restore();
}
function spaced(x, t, cx, y, sp) { // centred text with letter spacing
  const chars = [...t]; const ws = chars.map(c => x.measureText(c).width); const tot = ws.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
  let px = cx - tot / 2; x.textAlign = 'left'; chars.forEach((c, i) => { x.fillText(c, px, y); px += ws[i] + sp; });
}
function circText(x, t, cx, cy, r, size, col) {
  x.save(); x.fillStyle = col; x.font = `700 ${size}px Cinzel`; x.textAlign = 'center'; x.textBaseline = 'middle';
  const n = t.length;
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i / n * Math.PI * 2; x.save(); x.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); x.rotate(a + Math.PI / 2); x.fillText(t[i], 0, 0); x.restore(); }
  x.restore();
}

export function noteCanvas(k = 1) {
  const W = 2350, H = 1000;
  const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k); const x = c.getContext('2d', { willReadFrequently: true }); x.scale(k, k);
  x.fillStyle = '#cdd9c1'; x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, 'rgba(176,206,178,.55)'); g.addColorStop(0.5, 'rgba(226,224,196,.35)'); g.addColorStop(1, 'rgba(190,212,182,.55)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  // background line work
  x.save(); x.strokeStyle = INK2; x.globalAlpha = 0.09; x.lineWidth = 1.2;
  for (let y = 70; y < H - 60; y += 7) { x.beginPath(); for (let s = 60; s <= W - 60; s += 8) { const py = y + 3.2 * Math.sin(s / 61 + y / 37); s > 60 ? x.lineTo(s, py) : x.moveTo(s, py); } x.stroke(); }
  x.restore();
  // frame + guilloche bands
  x.strokeStyle = INK; x.lineWidth = 7; x.strokeRect(36, 36, W - 72, H - 72); x.lineWidth = 2.5; x.strokeRect(58, 58, W - 116, H - 116); x.strokeRect(118, 118, W - 236, H - 236);
  waveBand(x, 66, 88, W - 132, true, 18, INK, 0.75); waveBand(x, 66, H - 88, W - 132, true, 18, INK, 0.75);
  waveBand(x, 88, 66, H - 132, false, 18, INK, 0.75); waveBand(x, W - 88, 66, H - 132, false, 18, INK, 0.75);
  // medallion with the currency sign
  const mx = 560, my = 500;
  x.save(); x.beginPath(); x.ellipse(mx, my, 300, 318, 0, 0, 7); x.fillStyle = 'rgba(240,243,232,.85)'; x.fill(); x.restore();
  rosette(x, mx, my, 300, 318, INK2, 0.55);
  x.strokeStyle = INK; x.lineWidth = 5; x.beginPath(); x.ellipse(mx, my, 304, 322, 0, 0, 7); x.stroke(); x.lineWidth = 1.5; x.beginPath(); x.ellipse(mx, my, 290, 308, 0, 0, 7); x.stroke();
  x.save(); x.beginPath(); x.arc(mx, my, 205, 0, 7); x.fillStyle = 'rgba(236,240,226,.92)'; x.fill(); x.restore();
  curSign(x, mx, my, 92, INK);
  // title block
  x.fillStyle = INK; x.textBaseline = 'alphabetic';
  x.font = '700 31px Cinzel'; spaced(x, 'LEGAL TENDER UNTIL FURTHER NOTICE', 1330, 205, 5);
  x.font = '800 236px Cinzel'; spaced(x, 'FIAT', 1360, 430, 34);
  x.font = '700 52px Cinzel'; spaced(x, 'ONE HUNDRED TRILLION', 1370, 528, 7);
  // denomination ribbon
  x.save(); x.fillStyle = 'rgba(31,58,43,.92)'; x.beginPath(); x.roundRect(1000, 572, 720, 84, 10); x.fill(); x.restore();
  x.fillStyle = '#e4ead9'; x.font = '500 50px JBM'; x.textAlign = 'center'; x.fillText('100 000 000 000 000', 1360, 630);
  // corner numerals
  x.fillStyle = INK; x.font = '800 116px Cinzel'; x.textAlign = 'right'; x.fillText('100T', W - 160, 250); x.textAlign = 'left'; x.fillText('100T', 1000, 850);
  // seal
  const sx = 1990, sy = 650;
  ring(x, sx, sy, 128, 7, AMB); ring(x, sx, sy, 98, 2.5, AMB); ring(x, sx, sy, 136, 1.5, AMB);
  circText(x, '· BY DECREE · NOT BY GOLD · BY DECREE · NOT BY GOLD ', sx, sy, 113, 17, AMB);
  curSign(x, sx, sy, 40, AMB, false);
  // serials
  x.fillStyle = RED; x.font = '500 46px JBM'; x.textAlign = 'left'; x.fillText('FT 00000001 ¤', 170, 205); x.textAlign = 'right'; x.fillText('FT 00000001 ¤', W - 160, 860);
  // microtext
  x.save(); x.fillStyle = INK2; x.globalAlpha = 0.75; x.font = '500 15px JBM'; x.textAlign = 'left';
  x.beginPath(); x.rect(128, 0, W - 256, H); x.clip(); x.fillText('NOT BACKED BY ANYTHING · '.repeat(14), 130, H - 128); x.fillText('PRINTED ON DEMAND · '.repeat(17), 130, 140); x.restore();
  // paper fibres + grain
  for (let i = 0; i < 420; i++) { x.strokeStyle = rnd() < 0.5 ? 'rgba(170,40,40,.16)' : 'rgba(40,70,170,.16)'; x.lineWidth = 1.1; const px = rnd() * W, py = rnd() * H, a = rnd() * 6.3, l = 6 + rnd() * 14; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a) * l, py + Math.sin(a + 0.6) * l, px + Math.cos(a + 0.3) * l * 1.6, py + Math.sin(a + 0.3) * l * 1.6); x.stroke(); }
  x.setTransform(1, 0, 0, 1, 0, 0); noise(x, c.width, c.height, 14);
  return c;
}

export function bandCanvas(W = 440, H = 1000) {
  // top face of the strap: x = along the note's length (narrow), y = across the note
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#e9a12e'; x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(0,0,0,.10)'); g.addColorStop(0.5, 'rgba(255,255,255,.07)'); g.addColorStop(1, 'rgba(0,0,0,.10)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(90,50,0,.55)'; x.lineWidth = 4; x.strokeRect(22, 18, W - 44, H - 36);
  x.fillStyle = '#3a2203'; x.textBaseline = 'middle';
  x.save(); x.translate(W / 2, H / 2); x.rotate(-Math.PI / 2);
  x.font = '800 150px Cinzel'; spaced(x, 'FIAT', 0, 8, 22);
  x.font = '500 34px JBM'; x.textAlign = 'center'; x.fillText('\u00a4 100 000 000 000 000', 0, -128);
  x.font = '500 28px JBM'; x.textAlign = 'center'; x.fillText('100 NOTES \u00b7 BY DECREE', 0, 128);
  x.restore();
  noise(x, W, H, 10);
  return c;
}

// the paper edges of a brick of notes, seen from the side: many thin sheets, slightly uneven
export function edgeCanvas(W = 1024, H = 256, sheets = 38) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#b9c7ad'; x.fillRect(0, 0, W, H);
  const h = H / sheets;
  for (let i = 0; i < sheets; i++) {
    const l = 0.62 + rnd() * 0.2, y = i * h;
    x.fillStyle = `hsl(${88 + rnd() * 14}, ${16 + rnd() * 10}%, ${l * 100}%)`; x.fillRect(0, y, W, h * 0.78);
    x.fillStyle = `rgba(30,50,35,${0.18 + rnd() * 0.18})`; x.fillRect(0, y + h * 0.78, W, h * 0.22);
    if (rnd() < 0.35) { x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(rnd() * W * 0.7, y + h * 0.2, 40 + rnd() * 200, h * 0.3); }
  }
  noise(x, W, H, 10);
  return c;
}

// a square coin picture for a launch: a FIAT note made for one currency
export function coinNoteCanvas(cur, S = 1000) {
  const c = document.createElement('canvas'); c.width = S; c.height = S; const x = c.getContext('2d', { willReadFrequently: true });
  const k = S / 1000; x.scale(k, k);
  // dark backdrop with an amber glow, like the brand
  const bg = x.createRadialGradient(500, 470, 40, 500, 500, 720); bg.addColorStop(0, '#2a1e0b'); bg.addColorStop(0.55, '#0d0b08'); bg.addColorStop(1, '#050505');
  x.fillStyle = bg; x.fillRect(0, 0, 1000, 1000);
  x.fillStyle = 'rgba(255,178,36,.06)'; for (let yy = 12; yy < 1000; yy += 26) for (let xx = 12; xx < 1000; xx += 26) x.fillRect(xx, yy, 14, 14);
  // the note, tilted
  x.save(); x.translate(500, 520); x.rotate(-0.12);
  const NW = 820, NH = 470;
  x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 50; x.shadowOffsetY = 24;
  x.fillStyle = '#cdd9c1'; x.fillRect(-NW / 2, -NH / 2, NW, NH); x.shadowColor = 'transparent';
  const g = x.createLinearGradient(-NW / 2, -NH / 2, NW / 2, NH / 2); g.addColorStop(0, 'rgba(176,206,178,.6)'); g.addColorStop(1, 'rgba(226,224,196,.4)'); x.fillStyle = g; x.fillRect(-NW / 2, -NH / 2, NW, NH);
  x.save(); x.strokeStyle = INK2; x.globalAlpha = 0.1; x.lineWidth = 1;
  for (let y = -NH / 2 + 30; y < NH / 2 - 26; y += 6) { x.beginPath(); for (let s = -NW / 2 + 26; s <= NW / 2 - 26; s += 6) { const py = y + 2.4 * Math.sin(s / 31 + y / 19); s > -NW / 2 + 26 ? x.lineTo(s, py) : x.moveTo(s, py); } x.stroke(); }
  x.restore();
  x.strokeStyle = INK; x.lineWidth = 5; x.strokeRect(-NW / 2 + 14, -NH / 2 + 14, NW - 28, NH - 28); x.lineWidth = 1.6; x.strokeRect(-NW / 2 + 26, -NH / 2 + 26, NW - 52, NH - 52);
  waveBand(x, -NW / 2 + 30, -NH / 2 + 44, NW - 60, true, 8, INK, 0.6); waveBand(x, -NW / 2 + 30, NH / 2 - 44, NW - 60, true, 8, INK, 0.6);
  // medallion with the currency's own symbol
  const mx = -NW / 2 + 190, my = 6;
  x.save(); x.beginPath(); x.ellipse(mx, my, 132, 142, 0, 0, 7); x.fillStyle = 'rgba(240,243,232,.9)'; x.fill(); x.restore();
  rosette(x, mx, my, 130, 140, INK2, 0.5);
  x.strokeStyle = INK; x.lineWidth = 3.5; x.beginPath(); x.ellipse(mx, my, 134, 144, 0, 0, 7); x.stroke();
  x.save(); x.beginPath(); x.arc(mx, my, 86, 0, 7); x.fillStyle = 'rgba(236,240,226,.95)'; x.fill(); x.restore();
  x.fillStyle = INK; x.textAlign = 'center'; x.textBaseline = 'middle';
  const sym = String(cur.sym || '¤'); x.font = `800 ${sym.length > 2 ? 54 : sym.length > 1 ? 74 : 104}px Cinzel, Georgia, serif`; x.fillText(sym, mx, my + 6);
  // title + denomination
  const tx = 150;
  x.textBaseline = 'alphabetic';
  x.font = '700 17px Cinzel, Georgia, serif'; spaced(x, 'LEGAL TENDER UNTIL FURTHER NOTICE', tx, -112, 3);
  const unit = String(cur.unit || cur.code).toUpperCase();
  x.font = `800 ${unit.length > 7 ? 64 : unit.length > 5 ? 82 : 104}px Cinzel, Georgia, serif`; spaced(x, unit, tx, -6, 10);
  x.font = '700 26px Cinzel, Georgia, serif'; spaced(x, 'ONE HUNDRED TRILLION', tx, 44, 4);
  x.save(); x.fillStyle = 'rgba(31,58,43,.94)'; x.beginPath(); x.roundRect(tx - 190, 70, 380, 52, 7); x.fill(); x.restore();
  x.fillStyle = '#e4ead9'; x.font = '500 27px JBM, monospace'; x.textAlign = 'center'; x.fillText(cur.code + ' 100 000 000 000 000', tx, 106);
  x.fillStyle = RED; x.font = '500 24px JBM, monospace'; x.textAlign = 'left'; x.fillText('FT ' + cur.code + ' 0000001 ¤', -NW / 2 + 46, -NH / 2 + 80);
  x.fillStyle = INK; x.font = '800 52px Cinzel, Georgia, serif'; x.textAlign = 'right'; x.fillText('100T', NW / 2 - 48, NH / 2 - 62);
  for (let i = 0; i < 160; i++) { x.strokeStyle = rnd() < 0.5 ? 'rgba(170,40,40,.15)' : 'rgba(40,70,170,.15)'; x.lineWidth = 1; const px = (rnd() - 0.5) * NW, py = (rnd() - 0.5) * NH, a = rnd() * 6.3, l = 4 + rnd() * 9; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
  x.restore();
  // pixels breaking off the corner, in amber
  for (let i = 0; i < 70; i++) {
    const t = rnd(), px = 800 + t * 170 + (rnd() - 0.5) * 120 * t, py = 230 - t * 190 + (rnd() - 0.5) * 120 * t, s = 16 - t * 10;
    x.fillStyle = rnd() < 0.55 ? `rgba(255,${150 + rnd() * 60 | 0},40,${0.9 - t * 0.6})` : `rgba(205,217,193,${0.85 - t * 0.6})`; x.fillRect(px, py, s, s);
  }
  // code tag
  x.font = '600 34px JBM, monospace'; x.textAlign = 'left'; x.fillStyle = '#ffb224'; x.fillText('vs ' + cur.code, 56, 952);
  x.textAlign = 'right'; x.fillStyle = 'rgba(255,255,255,.5)'; x.font = '500 26px JBM, monospace'; x.fillText('fiat', 944, 952);
  return c;
}

// a picture turned into a two-tone engraving (ink on note paper), square, cover-cropped
function engrave(img, S) {
  S = Math.max(64, Math.min(420, S | 0));
  const c = document.createElement('canvas'); c.width = S; c.height = Math.round(S * 1.07); const x = c.getContext('2d', { willReadFrequently: true });
  const iw = img.width || 1, ih = img.height || 1, sc = Math.max(c.width / iw, c.height / ih);
  x.drawImage(img, (c.width - iw * sc) / 2, (c.height - ih * sc) / 2, iw * sc, ih * sc);
  const id = x.getImageData(0, 0, c.width, c.height), d = id.data;
  let lo = 255, hi = 0; for (let i = 0; i < d.length; i += 16) { const L = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; if (L < lo) lo = L; if (L > hi) hi = L; }
  const span = Math.max(40, hi - lo), A = [38, 66, 50], B = [236, 240, 226];
  for (let i = 0; i < d.length; i += 4) {
    let t = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2] - lo) / span; t = Math.max(0, Math.min(1, 0.12 + t * 0.9));
    const a = d[i + 3] / 255; t = t * a + (1 - a);
    d[i] = A[0] + (B[0] - A[0]) * t; d[i + 1] = A[1] + (B[1] - A[1]) * t; d[i + 2] = A[2] + (B[2] - A[2]) * t; d[i + 3] = 255;
  }
  x.putImageData(id, 0, 0);
  return c;
}

/* ---------- a wide FIAT note for one currency or one coin ----------
 * o: { title, top, sub, denom, serial, corner, seal, sym, img (HTMLImageElement|canvas), w (px), melt (0..1), pad }
 * melt dissolves the note from its right edge into pixels: used for currencies that lost value. */
function fitFont(x, t, weight, maxPx, maxW, fam = 'Cinzel, Georgia, serif', sp = 0) {
  let px = maxPx; for (; px > 12; px -= 2) { x.font = `${weight} ${px}px ${fam}`; if (x.measureText(t).width + sp * (t.length - 1) <= maxW) break; } return px;
}
export function noteFor(o = {}) {
  const NW = 1400, NH = 600, k = (o.w || 700) / NW;
  reseed(o.seedKey || o.title || 'fiat');
  const n = document.createElement('canvas'); n.width = Math.round(NW * k); n.height = Math.round(NH * k);
  const x = n.getContext('2d', { willReadFrequently: true }); x.scale(k, k);
  x.fillStyle = '#cdd9c1'; x.fillRect(0, 0, NW, NH);
  const g = x.createLinearGradient(0, 0, NW, NH); g.addColorStop(0, 'rgba(176,206,178,.6)'); g.addColorStop(0.5, 'rgba(230,226,196,.35)'); g.addColorStop(1, 'rgba(186,210,180,.6)'); x.fillStyle = g; x.fillRect(0, 0, NW, NH);
  x.save(); x.strokeStyle = INK2; x.globalAlpha = 0.09; x.lineWidth = 1.1;
  for (let y = 50; y < NH - 40; y += 7) { x.beginPath(); for (let s = 40; s <= NW - 40; s += 10) { const py = y + 2.8 * Math.sin(s / 47 + y / 29); s > 40 ? x.lineTo(s, py) : x.moveTo(s, py); } x.stroke(); }
  x.restore();
  x.strokeStyle = INK; x.lineWidth = 6; x.strokeRect(20, 20, NW - 40, NH - 40); x.lineWidth = 2; x.strokeRect(36, 36, NW - 72, NH - 72); x.strokeRect(74, 74, NW - 148, NH - 148);
  waveBand(x, 40, 55, NW - 80, true, 11, INK, 0.7); waveBand(x, 40, NH - 55, NW - 80, true, 11, INK, 0.7);
  waveBand(x, 55, 40, NH - 80, false, 11, INK, 0.7); waveBand(x, NW - 55, 40, NH - 80, false, 11, INK, 0.7);
  // medallion
  const mx = 316, my = 318, rx = 170, ry = 182;
  x.save(); x.beginPath(); x.ellipse(mx, my, rx, ry, 0, 0, 7); x.fillStyle = 'rgba(240,243,232,.88)'; x.fill(); x.restore();
  rosette(x, mx, my, rx, ry, INK2, 0.5);
  x.strokeStyle = INK; x.lineWidth = 4; x.beginPath(); x.ellipse(mx, my, rx + 3, ry + 3, 0, 0, 7); x.stroke(); x.lineWidth = 1.2; x.beginPath(); x.ellipse(mx, my, rx - 9, ry - 9, 0, 0, 7); x.stroke();
  const ir = 118;
  x.save(); x.beginPath(); x.ellipse(mx, my, ir, ir * 1.07, 0, 0, 7); x.fillStyle = 'rgba(236,240,226,.96)'; x.fill();
  if (o.img) {
    x.clip(); x.drawImage(engrave(o.img, Math.round(ir * 2 * k * 1.5)), mx - ir, my - ir * 1.07, ir * 2, ir * 2.14);
    x.strokeStyle = 'rgba(31,58,43,.16)'; x.lineWidth = 1;
    for (let yy = my - ir * 1.1; yy < my + ir * 1.1; yy += 4) { x.beginPath(); x.moveTo(mx - ir, yy); x.lineTo(mx + ir, yy); x.stroke(); }
  } else {
    const sym = String(o.sym || '¤'); x.fillStyle = INK; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `800 ${sym.length > 2 ? 70 : sym.length > 1 ? 96 : 150}px Cinzel, Georgia, serif`; x.fillText(sym, mx, my + 8);
  }
  x.restore();
  x.strokeStyle = INK; x.lineWidth = 2.5; x.beginPath(); x.ellipse(mx, my, ir, ir * 1.07, 0, 0, 7); x.stroke();
  // text block
  const tx = 900; x.fillStyle = INK; x.textBaseline = 'alphabetic';
  x.font = '700 17px Cinzel, Georgia, serif'; spaced(x, o.top || 'LEGAL TENDER UNTIL FURTHER NOTICE', tx - 90, 142, 2.5);
  const title = String(o.title || 'FIAT').toUpperCase();
  fitFont(x, title, 800, 132, 680, 'Cinzel, Georgia, serif', 8); spaced(x, title, tx, 286, 8);
  x.font = '700 30px Cinzel, Georgia, serif'; const sub = String(o.sub || 'ONE HUNDRED TRILLION').toUpperCase(); fitFont(x, sub, 700, 30, 540, 'Cinzel, Georgia, serif', 4); spaced(x, sub, tx, 346, 4);
  x.save(); x.fillStyle = 'rgba(31,58,43,.94)'; x.beginPath(); x.roundRect(tx - 270, 376, 540, 62, 8); x.fill(); x.restore();
  x.fillStyle = '#e4ead9'; fitFont(x, o.denom || '100 000 000 000 000', 500, 32, 500, 'JBM, monospace'); x.textAlign = 'center'; x.fillText(o.denom || '100 000 000 000 000', tx, 418);
  // serials
  x.fillStyle = RED; x.font = '500 25px JBM, monospace'; x.textAlign = 'left'; x.fillText(o.serial || 'FT 00000001 ¤', 98, 122);
  x.textAlign = 'right'; x.fillText(o.serial || 'FT 00000001 ¤', NW - 104, NH - 90);
  // corner numeral
  x.fillStyle = INK; fitFont(x, o.corner || '100T', 800, 58, 168); x.textAlign = 'right'; x.fillText(o.corner || '100T', NW - 100, 150);
  // seal
  const sx = NW - 148, sy = 392;
  ring(x, sx, sy, 64, 4.5, AMB); ring(x, sx, sy, 48, 2, AMB); ring(x, sx, sy, 70, 1.2, AMB);
  circText(x, '· BY DECREE · NOT BY GOLD · BY DECREE ', sx, sy, 56, 10, AMB);
  x.fillStyle = AMB; x.textAlign = 'center'; x.textBaseline = 'middle'; fitFont(x, o.seal || '¤', 800, 34, 72); x.fillText(o.seal || '¤', sx, sy + 2);
  x.textBaseline = 'alphabetic';
  // microtext
  x.save(); x.fillStyle = INK2; x.globalAlpha = 0.7; x.font = '500 11px JBM, monospace'; x.textAlign = 'left';
  x.beginPath(); x.rect(80, 0, NW - 160, NH); x.clip(); x.fillText('NOT BACKED BY ANYTHING · '.repeat(14), 82, NH - 82); x.fillText('PRINTED ON DEMAND · '.repeat(16), 82, 92); x.restore();
  for (let i = 0; i < 220; i++) { x.strokeStyle = rnd() < 0.5 ? 'rgba(170,40,40,.15)' : 'rgba(40,70,170,.15)'; x.lineWidth = 1; const px = rnd() * NW, py = rnd() * NH, a = rnd() * 6.3, l = 4 + rnd() * 10; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
  x.setTransform(1, 0, 0, 1, 0, 0); if (n.width * n.height < 900000) noise(x, n.width, n.height, 12);
  const m = Math.max(0, Math.min(1, o.melt || 0));
  if (!m && !o.pad) return n;
  return meltCanvas(n, m, o.pad == null ? 0.18 : o.pad);
}
// dissolve a canvas into pixels from the right edge; m = share of the note that is gone
export function meltCanvas(src, m, pad = 0.18) {
  const W = src.width, H = src.height, PX = Math.round(W * pad), PY = Math.round(H * pad * 1.2);
  const c = document.createElement('canvas'); c.width = W + PX; c.height = H + PY; const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, PY);
  if (m <= 0) return c;
  const cols = 46, cs = W / cols, rows = Math.ceil(H / cs);
  const flyers = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const t = 1 - (i + 0.5) / cols; // 0 at the right edge
    const thr = t * 0.82 + rnd() * 0.18 + (j / rows) * 0.04;
    if (thr < m) { x.clearRect(i * cs - 0.5, PY + j * cs - 0.5, cs + 1, cs + 1); if (rnd() < 0.55) flyers.push([i, j, t]); }
  }
  for (const [i, j, t] of flyers) {
    const f = rnd(), d = (0.15 + f * 0.85) * (1.1 - Math.max(0, t - (1 - m)) * 0.4);
    const px = i * cs + d * PX * (0.6 + rnd() * 0.9), py = PY + j * cs - d * PY * (0.5 + rnd() * 1.1) + (rnd() - 0.5) * cs * 3;
    const s = cs * (1 - d * 0.55);
    x.globalAlpha = Math.max(0.12, 1 - d * 0.8);
    if (rnd() < 0.45) { x.fillStyle = `rgb(255,${150 + (rnd() * 70 | 0)},${30 + (rnd() * 40 | 0)})`; x.fillRect(px, py, s, s); }
    else x.drawImage(src, i * cs, j * cs, cs, cs, px, py, s, s);
  }
  x.globalAlpha = 1;
  return c;
}

// the back of a note: rosette, a big FIAT, the on-chain memo
export function noteBack(o = {}) {
  const NW = 1400, NH = 600, k = (o.w || 700) / NW;
  reseed('back' + (o.memo || ''));
  const c = document.createElement('canvas'); c.width = Math.round(NW * k); c.height = Math.round(NH * k);
  const x = c.getContext('2d', { willReadFrequently: true }); x.scale(k, k);
  x.fillStyle = '#c9d6bd'; x.fillRect(0, 0, NW, NH);
  const g = x.createRadialGradient(NW / 2, NH / 2, 40, NW / 2, NH / 2, 760); g.addColorStop(0, 'rgba(236,236,210,.6)'); g.addColorStop(1, 'rgba(160,190,160,.5)'); x.fillStyle = g; x.fillRect(0, 0, NW, NH);
  x.save(); x.strokeStyle = INK2; x.globalAlpha = 0.08; x.lineWidth = 1;
  for (let i = 0; i < 90; i++) { x.beginPath(); for (let t = 0; t <= 1; t += 0.01) { const px = t * NW, py = NH / 2 + Math.sin(t * 9 + i * 0.21) * (60 + i * 2.6) * Math.cos(t * 3 - i * 0.05); t ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); }
  x.restore();
  x.strokeStyle = INK; x.lineWidth = 6; x.strokeRect(20, 20, NW - 40, NH - 40); x.lineWidth = 2; x.strokeRect(36, 36, NW - 72, NH - 72);
  waveBand(x, 40, 55, NW - 80, true, 11, INK, 0.7); waveBand(x, 40, NH - 55, NW - 80, true, 11, INK, 0.7);
  rosette(x, NW / 2, NH / 2, 250, 230, INK2, 0.55);
  x.fillStyle = 'rgba(31,58,43,.16)'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '800 300px Cinzel, Georgia, serif'; spaced(x, 'FIAT', NW / 2, NH / 2 + 18, 40);
  x.fillStyle = INK; x.font = '700 22px Cinzel, Georgia, serif'; x.textBaseline = 'alphabetic'; spaced(x, 'BY DECREE · NOT BY GOLD', NW / 2, 128, 6);
  x.save(); x.fillStyle = 'rgba(31,58,43,.94)'; x.beginPath(); x.roundRect(NW / 2 - 300, NH - 150, 600, 60, 8); x.fill(); x.restore();
  x.fillStyle = '#e4ead9'; fitFont(x, o.memo || 'fiat:v1', 500, 30, 540, 'JBM, monospace'); x.textAlign = 'center'; x.fillText(o.memo || 'fiat:v1', NW / 2, NH - 110);
  const sx = 170, sy = NH / 2; ring(x, sx, sy, 70, 5, AMB); ring(x, sx, sy, 52, 2, AMB); circText(x, '· PRINTED ON DEMAND · PRINTED ON DEMAND ', sx, sy, 61, 10, AMB);
  x.fillStyle = AMB; x.textBaseline = 'middle'; fitFont(x, o.code || '¤', 800, 30, 70); x.fillText(o.code || '¤', sx, sy + 2);
  ring(x, NW - sx, sy, 70, 5, AMB); ring(x, NW - sx, sy, 52, 2, AMB); circText(x, '· LEGAL TENDER · UNTIL FURTHER NOTICE ', NW - sx, sy, 61, 10, AMB);
  x.fillStyle = AMB; fitFont(x, o.sym || '¤', 800, 40, 70); x.fillText(o.sym || '¤', NW - sx, sy + 2);
  x.setTransform(1, 0, 0, 1, 0, 0); if (c.width * c.height < 900000) noise(x, c.width, c.height, 12);
  return c;
}
