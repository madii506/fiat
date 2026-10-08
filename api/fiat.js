'use strict';
/*
 * FIAT API. One serverless function behind /api/*.
 *
 * FIAT never holds keys or funds. It reads public exchange rates and the chain, uploads a coin's
 * picture + metadata to pump.fun's IPFS endpoint, builds an unsigned pump.fun create transaction with
 * the official SDK, simulates it, and hands it to the launcher's own wallet to sign.
 *
 * Every FIAT launch carries two extra instructions inside the same transaction:
 *   1. a Memo:  fiat:v1:<CURRENCY>:<TICKER>         (the pairing, readable on any explorer)
 *   2. a 0-lamport self-transfer that lists the FIAT registry address as a read-only account,
 *      so every FIAT launch can be found with getSignaturesForAddress(registry).
 * The registry is a program-derived address with no private key: nobody controls it.
 *
 * Routes
 *   GET  /api/config              public settings, launch switch, registry address
 *   GET  /api/fx                  47 currencies vs USD: rate, 1d/7d/30d/90d/1y change, 30-day + 1-year series
 *   GET  /api/live?codes=A,B      intraday quotes where a live feed answers (else empty, never invented)
 *   GET  /api/coins               every coin launched through FIAT, read from the chain
 *   POST /api/ipfs                {image(dataURL), name, symbol, description, twitter, website, telegram}
 *   POST /api/build               {user, mint, name, symbol, uri, code, sol, slippage} -> unsigned tx (simulated)
 *   POST /api/buy                 {user, mint, sol, slippage} -> first buy as its own tx (only if create+buy can't fit)
 *   POST /api/send                relay a signed transaction
 *   GET  /api/status?sig=         confirmation status
 */
const { Connection, PublicKey, TransactionMessage, VersionedTransaction, ComputeBudgetProgram, SystemProgram, TransactionInstruction } = require('@solana/web3.js');
const BN = require('bn.js');
const bs58m = require('bs58'); const bs58 = bs58m.default || bs58m;
const pump = require('@pump-fun/pump-sdk');
const { PUMP_SDK, OnlinePumpSdk, PUMP_PROGRAM_ID, bondingCurvePda, getBuyTokenAmountFromSolAmount, bondingCurveMarketCap } = pump;
const CURRENCIES = require('../data/currencies.json');
const CODES = new Set(CURRENCIES.map(c => c.code));

/* ---------------- settings ---------------- */
const E = (k, d = '') => String(process.env[k] == null ? d : process.env[k]).trim();
const okKey = s => { try { return s ? new PublicKey(s).toBase58() : ''; } catch (e) { return ''; } };
const MEMO = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const REGISTRY = PublicKey.findProgramAddressSync([Buffer.from('fiat-registry-v1')], MEMO)[0];
const CONFIG = {
  ca: okKey(E('FIAT_CA')),
  x: E('FIAT_X', ''),
  // launches open once $FIAT is out (FIAT_CA set); FIAT_LAUNCHES=open|paused overrides
  launches: (E('FIAT_LAUNCHES') || (okKey(E('FIAT_CA')) ? 'open' : 'paused')).toLowerCase() === 'open' ? 'open' : 'paused',
};
const RPCS = [E('RPC_URL'), 'https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'].filter(Boolean);
const { TOKEN_2022_PROGRAM_ID: TOKEN_2022 } = require('@solana/spl-token');
const CREATE_V2 = Buffer.from([214, 144, 76, 236, 95, 139, 49, 180]);
const CREATE_V1 = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]);
const MAX_FIRST_BUY = 50; // SOL
const ERRORS = {
  6002: 'The price moved too much. Try again or raise slippage.', 6004: 'The price moved too much. Try again or raise slippage.',
  6039: 'Not enough SOL to cover the trade fees.', 6020: 'pump.fun has paused this right now.',
};

/* ---------------- http helpers ---------------- */
function send(res, code, body, cache) {
  res.setHeader('Cache-Control', cache || 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.status(code).send(JSON.stringify(body));
}
function http(code, msg) { const e = new Error(msg); e.code = code; return e; }
async function readBody(req, max = 6e6) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return await new Promise((r, j) => { let d = ''; req.on('data', c => { d += c; if (d.length > max) { j(http(413, 'Too large')); req.destroy(); } }); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch (e) { r({}); } }); });
}
function timedFetch(ms) {
  return (url, opt = {}) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return fetch(url, { ...opt, signal: c.signal }).finally(() => clearTimeout(t)); };
}
async function getJson(url, ms = 7000, headers = {}) {
  const r = await timedFetch(ms)(url, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (fiat)', ...headers } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return await r.json();
}
const mem = {};
async function cached(key, ms, fn) {
  const c = mem[key];
  if (c && c.has && Date.now() - c.t < ms) return c.v;
  if (c && c.p) return c.p;
  const p = (async () => {
    try { const v = await fn(); mem[key] = { t: Date.now(), v, has: true }; return v; }
    catch (e) { if (c && c.has) { mem[key] = { t: c.t, v: c.v, has: true }; return c.v; } delete mem[key]; throw e; }
  })();
  mem[key] = Object.assign({}, c || {}, { p });
  return p;
}
const conns = RPCS.map(u => new Connection(u, { commitment: 'confirmed', disableRetryOnRateLimit: true, fetch: timedFetch(9000) }));
async function rpc(fn) {
  let last;
  for (const c of conns) { try { return await fn(c); } catch (e) { last = e; } }
  throw http(502, 'Solana RPC is busy: ' + String(last && last.message || last).slice(0, 140));
}
function pk(s, what = 'address') { try { return new PublicKey(String(s || '').trim()); } catch (e) { throw http(400, 'Invalid ' + what); } }

/* ---------------- exchange rates ----------------
 * Source: the open fawazahmed0 currency-api (daily, ~200 currencies), via jsDelivr with a Cloudflare mirror.
 * Rates are "units of currency per 1 USD". A currency's change is the change in its value vs USD:
 *   value change = rate_then / rate_now - 1      (negative = the currency weakened)
 */
const ymd = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
async function usdFile(tag) {
  const urls = tag === 'latest'
    ? ['https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json', 'https://latest.currency-api.pages.dev/v1/currencies/usd.min.json']
    : [`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${tag}/v1/currencies/usd.min.json`, `https://${tag}.currency-api.pages.dev/v1/currencies/usd.min.json`];
  let last;
  for (const u of urls) { try { const j = await getJson(u, 6500); if (j && j.usd) return j; } catch (e) { last = e; } }
  throw last || new Error('no rates');
}
const day = tag => cached('fx:' + tag, tag === 'latest' ? 20 * 60e3 : 24 * 3600e3, () => usdFile(tag));
async function fx() {
  return cached('fx:all', 15 * 60e3, async () => {
    const latest = await day('latest');
    const d0 = latest.date;
    const daily = Array.from({ length: 31 }, (_, i) => addDays(d0, -30 + i));            // 30 days back -> today
    const weekly = Array.from({ length: 27 }, (_, i) => addDays(d0, -364 + i * 14));     // one year, every 2 weeks
    const tags = [...new Set([...daily.slice(0, -1), ...weekly.slice(0, -1), addDays(d0, -90)])];
    const files = {};
    await Promise.all(tags.map(async t => { try { files[t] = (await day(t)).usd; } catch (e) { files[t] = null; } }));
    files[d0] = latest.usd;
    const ch = (now, then) => (now && then ? then / now - 1 : null);
    const at = (t, k) => (files[t] && files[t][k]) || null;
    const list = CURRENCIES.map(c => {
      const k = c.code.toLowerCase(), r = latest.usd[k];
      if (!r) return null;
      const s30 = daily.map(t => at(t, k)), s1y = weekly.map(t => at(t, k));
      return {
        ...c, rate: r,
        d1: ch(r, at(addDays(d0, -1), k)), d7: ch(r, at(addDays(d0, -7), k)), d30: ch(r, at(addDays(d0, -30), k)),
        d90: ch(r, at(addDays(d0, -90), k)), d365: ch(r, at(weekly[0], k)),
        s30, s1y,
      };
    }).filter(Boolean);
    return { date: d0, source: 'fawazahmed0/currency-api (daily)', days: daily, weeks: weekly, list };
  });
}
// Intraday quotes where a public feed answers. If it doesn't, the board stays on the daily rate and says so.
async function live(codes) {
  const want = codes.filter(c => CODES.has(c)).slice(0, 48);
  const out = {};
  await Promise.all(want.map(async c => {
    try {
      const j = await cached('live:' + c, 60e3, () => getJson(`https://query1.finance.yahoo.com/v8/finance/chart/USD${c}=X?range=1d&interval=15m`, 5000));
      const r = j && j.chart && j.chart.result && j.chart.result[0]; if (!r || !r.meta) return;
      const m = r.meta, price = Number(m.regularMarketPrice), prev = Number(m.chartPreviousClose || m.previousClose);
      if (!(price > 0)) return;
      const closes = ((r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || []).filter(v => v > 0);
      out[c] = { rate: price, prev: prev > 0 ? prev : null, t: Number(m.regularMarketTime) * 1000 || Date.now(), series: closes.slice(-96) };
    } catch (e) { }
  }));
  return out;
}

/* ---------------- coins launched through FIAT ---------------- */
function readStr(buf, o) { const n = buf.readUInt32LE(o); return [buf.slice(o + 4, o + 4 + n).toString('utf8'), o + 4 + n]; }
function parseCreate(data) {
  const b = Buffer.from(data);
  if (b.length < 20) return null;
  const d = b.slice(0, 8);
  if (!d.equals(CREATE_V2) && !d.equals(CREATE_V1)) return null;
  let o = 8, name, symbol, uri;
  [name, o] = readStr(b, o); [symbol, o] = readStr(b, o); [uri, o] = readStr(b, o);
  return { name: name.slice(0, 40), symbol: symbol.slice(0, 16), uri: uri.slice(0, 300) };
}
const MEMO_RE = /Memo \(len \d+\): "fiat:v1:([A-Z]{3}):([^"]{0,24})"/;
async function launches() {
  return cached('launches', 30e3, async () => {
    const sigs = await rpc(c => c.getSignaturesForAddress(REGISTRY, { limit: 150 }));
    const good = sigs.filter(s => !s.err).slice(0, 120);
    const out = [];
    for (let i = 0; i < good.length; i += 25) {
      const part = good.slice(i, i + 25);
      const txs = await rpc(c => c.getTransactions(part.map(s => s.signature), { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }));
      txs.forEach((tx, k) => {
        if (!tx || !tx.meta || tx.meta.err) return;
        const logs = tx.meta.logMessages || [];
        const m = logs.map(l => l.match(MEMO_RE)).find(Boolean); if (!m) return;
        const msg = tx.transaction.message, keys = msg.staticAccountKeys || msg.accountKeys;
        const ixs = msg.compiledInstructions || msg.instructions || [];
        let meta = null;
        for (const ix of ixs) {
          const prog = keys[ix.programIdIndex]; if (!prog || !prog.equals(PUMP_PROGRAM_ID)) continue;
          const data = ix.data instanceof Uint8Array ? ix.data : bs58.decode(ix.data);
          meta = parseCreate(data); if (meta) break;
        }
        if (!meta || msg.header.numRequiredSignatures < 2) return;
        out.push({ sig: part[k].signature, t: (tx.blockTime || part[k].blockTime || 0) * 1000, code: m[1], creator: keys[0].toBase58(), mint: keys[1].toBase58(), ...meta });
      });
    }
    return out;
  });
}
async function solUsd() {
  return cached('solusd', 60e3, async () => {
    try { const j = await getJson('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', 5000); if (j.solana && j.solana.usd) return j.solana.usd; } catch (e) { }
    const j = await getJson('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112', 6000);
    const p = (j.pairs || []).find(x => x.quoteToken && /USD/.test(x.quoteToken.symbol) && x.baseToken.symbol === 'SOL'); return p ? +p.priceUsd : null;
  });
}
async function image(uri) {
  if (!/^https:\/\//.test(uri || '')) return null;
  return cached('img:' + uri, 24 * 3600e3, async () => {
    try { const j = await getJson(uri, 4500); return typeof j.image === 'string' && /^https:\/\//.test(j.image) ? j.image : null; } catch (e) { return null; }
  });
}
async function coins() {
  return cached('coins', 20e3, async () => {
    const list = await launches();
    if (!list.length) return { list: [], solUsd: await solUsd().catch(() => null) };
    const mints = list.map(c => new PublicKey(c.mint));
    const infos = [];
    for (let i = 0; i < mints.length; i += 100) infos.push(...await rpc(c => c.getMultipleAccountsInfo(mints.slice(i, i + 100).map(m => bondingCurvePda(m)))));
    const sp = await solUsd().catch(() => null);
    const dex = {};
    for (let i = 0; i < list.length; i += 30) {
      try {
        const j = await getJson('https://api.dexscreener.com/latest/dex/tokens/' + list.slice(i, i + 30).map(c => c.mint).join(','), 7000);
        for (const p of (j.pairs || [])) { if (p.chainId !== 'solana') continue; const k = p.baseToken.address, prev = dex[k]; if (!prev || ((p.liquidity && p.liquidity.usd) || 0) > ((prev.liquidity && prev.liquidity.usd) || 0)) dex[k] = p; }
      } catch (e) { }
    }
    const imgs = await Promise.all(list.map(c => image(c.uri)));
    const rows = list.map((c, i) => {
      let curve = null;
      try {
        const bc = infos[i] ? PUMP_SDK.decodeBondingCurveNullable(infos[i]) : null;
        if (bc) {
          const vq = bc.virtualQuoteReserves || bc.virtualSolReserves;
          const capL = bondingCurveMarketCap({ mintSupply: bc.tokenTotalSupply, virtualQuoteReserves: vq, virtualTokenReserves: bc.virtualTokenReserves });
          const sold = 793100000000000n - BigInt((bc.realTokenReserves || new BN(0)).toString());
          curve = { complete: !!bc.complete, mcapSol: Number(capL.toString()) / 1e9, progress: bc.complete ? 1 : Math.max(0, Math.min(1, Number(sold) / 793100000000000)) };
        }
      } catch (e) { }
      const p = dex[c.mint];
      const mcap = p && (p.marketCap || p.fdv) ? +(p.marketCap || p.fdv) : curve && sp ? curve.mcapSol * sp : null;
      return {
        ...c, image: imgs[i], curve,
        mcap, priceUsd: p ? +p.priceUsd || null : null, chg24: p && p.priceChange ? +p.priceChange.h24 : null, chg1: p && p.priceChange ? +p.priceChange.h1 : null,
        vol24: p && p.volume ? +p.volume.h24 || 0 : null, dex: p ? p.dexId : null,
      };
    });
    return { list: rows, solUsd: sp };
  });
}

/* ---------------- launch: IPFS upload ---------------- */
async function ipfs(b) {
  const m = String(b.image || '').match(/^data:(image\/(png|jpe?g|gif|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw http(400, 'Add a picture (PNG, JPG, GIF or WEBP).');
  const bytes = Buffer.from(m[3], 'base64');
  if (bytes.length > 4.2e6) throw http(400, 'The picture is too large (max 4 MB).');
  const name = clean(b.name, 32), symbol = clean(b.symbol, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!name || !symbol) throw http(400, 'Name and ticker are required.');
  const fd = new FormData();
  fd.append('file', new Blob([bytes], { type: m[1] }), 'coin.' + (m[2] === 'jpeg' ? 'jpg' : m[2]));
  fd.append('name', name); fd.append('symbol', symbol);
  fd.append('description', clean(b.description, 600));
  for (const k of ['twitter', 'telegram', 'website']) { const v = clean(b[k], 200); if (v && /^https?:\/\//.test(v)) fd.append(k, v); }
  fd.append('showName', 'true');
  const r = await timedFetch(20000)('https://pump.fun/api/ipfs', { method: 'POST', body: fd, headers: { accept: 'application/json', origin: 'https://pump.fun', referer: 'https://pump.fun/create' } });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) { }
  if (!r.ok || !j || !j.metadataUri) throw http(502, 'pump.fun did not accept the upload (' + r.status + '). Try again.');
  return { uri: j.metadataUri, image: j.metadata && j.metadata.image ? j.metadata.image : null };
}
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

/* ---------------- launch: build + simulate ---------------- */
async function priorityFee() {
  try {
    const r = await cached('prio', 20000, () => rpc(c => c.getRecentPrioritizationFees({ lockedWritableAccounts: [new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM')] })));
    const v = r.map(x => x.prioritizationFee).filter(x => x > 0).sort((a, b) => a - b);
    const p = v.length ? v[Math.floor(v.length * 0.75)] : 80000;
    return Math.max(50000, Math.min(2000000, p));
  } catch (e) { return 80000; }
}
function compile(user, ixs, cu, price, blockhash, alts = []) {
  const all = [ComputeBudgetProgram.setComputeUnitLimit({ units: cu }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price }), ...ixs];
  const msg = new TransactionMessage({ payerKey: user, recentBlockhash: blockhash, instructions: all }).compileToV0Message(alts);
  const tx = new VersionedTransaction(msg);
  let bytes; try { bytes = tx.serialize(); } catch (e) { bytes = null; }
  if (!bytes || bytes.length > 1232) throw http(400, 'The transaction is too large. Shorten the name or description.');
  return { tx, bytes };
}
const tryCompile = (...a) => { try { return compile(...a); } catch (e) { return null; } };
/* create + first buy is ~1.36 KB, over Solana's 1232-byte limit, so it needs an address lookup table.
 * Lookup tables are public: we reuse the ones recent pump.fun create/buy transactions already use
 * (or FIAT_ALTS from env), pick those covering the most of our accounts, and verify by simulation. */
async function altPool() {
  return cached('alts', 6 * 3600e3, async () => {
    let keys = E('FIAT_ALTS').split(',').map(s => okKey(s.trim())).filter(Boolean);
    if (!keys.length) {
      const sigs = await rpc(c => c.getSignaturesForAddress(PUMP_PROGRAM_ID, { limit: 100 }));
      const count = {};
      for (let i = 0; i < sigs.length; i += 25) {
        let txs = []; try { txs = await rpc(c => c.getTransactions(sigs.slice(i, i + 25).map(s => s.signature), { maxSupportedTransactionVersion: 0 })); } catch (e) { }
        for (const tx of txs) for (const l of ((tx && tx.transaction.message.addressTableLookups) || [])) { const k = l.accountKey.toBase58(); count[k] = (count[k] || 0) + 1; }
      }
      keys = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => e[0]);
    }
    const out = [];
    for (const k of keys) {
      try { const r = await rpc(c => c.getAddressLookupTable(new PublicKey(k))); if (r && r.value && r.value.isActive()) out.push(r.value); } catch (e) { }
    }
    return out;
  });
}
async function pickAlts(ixs, user, price, blockhash) {
  const pool = await altPool().catch(() => []);
  if (!pool.length) return null;
  const need = new Set(); for (const ix of ixs) { need.add(ix.programId.toBase58()); for (const k of ix.keys) if (!k.isSigner) need.add(k.pubkey.toBase58()); }
  const score = t => t.state.addresses.reduce((n, a) => n + (need.has(a.toBase58()) ? 1 : 0), 0);
  const ranked = pool.map(t => [t, score(t)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  for (let n = 1; n <= Math.min(3, ranked.length); n++) {
    const alts = ranked.slice(0, n);
    if (tryCompile(user, ixs, 1_000_000, price, blockhash, alts)) return alts;
  }
  return null;
}
function explain(sim) {
  const logs = (sim && sim.logs) || [];
  const m = JSON.stringify(sim && sim.err || '').match(/"Custom":(\d+)/);
  if (m && ERRORS[m[1]]) return ERRORS[m[1]];
  const l = logs.join('\n');
  if (/insufficient lamports|insufficient funds|0x1\b/i.test(l)) return 'Not enough SOL in the wallet for this launch (the first buy plus about 0.025 SOL for fees and rent).';
  if (m) return 'pump.fun rejected it (error ' + m[1] + ').';
  return 'The launch would fail: ' + JSON.stringify(sim && sim.err).slice(0, 140);
}
const pairingMemo = (code, symbol) => new TransactionInstruction({ programId: MEMO, keys: [], data: Buffer.from(`fiat:v1:${code}:${symbol}`, 'utf8') });
function registryTag(user) {
  const ix = SystemProgram.transfer({ fromPubkey: user, toPubkey: user, lamports: 0 });
  ix.keys.push({ pubkey: REGISTRY, isSigner: false, isWritable: false });
  return ix;
}
async function pumpState() {
  return cached('pumpstate', 5 * 60e3, async () => {
    const global = await rpc(c => new OnlinePumpSdk(c).fetchGlobal());
    let feeConfig = null; try { feeConfig = await rpc(c => new OnlinePumpSdk(c).fetchFeeConfig()); } catch (e) { }
    return { global, feeConfig };
  });
}
async function build(b) {
  if (CONFIG.launches !== 'open') throw http(403, 'Launches open when the official $FIAT token is out.');
  const user = pk(b.user, 'wallet'), mint = pk(b.mint, 'mint');
  const code = String(b.code || '').toUpperCase();
  if (!CODES.has(code)) throw http(400, 'Pick a currency.');
  const name = clean(b.name, 32), symbol = clean(b.symbol, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!name || !symbol) throw http(400, 'Name and ticker are required.');
  const uri = clean(b.uri, 200);
  if (!/^https:\/\/\S+$/.test(uri)) throw http(400, 'Upload the picture first.');
  const solIn = Math.max(0, Math.min(MAX_FIRST_BUY, Number(b.sol) || 0));
  const slip = Math.max(0.5, Math.min(30, Number(b.slippage) || 10)) / 100;
  const { global, feeConfig } = await pumpState();
  if (global.createV2Enabled === false) throw http(503, 'pump.fun has paused new coins right now.');
  const extra = [pairingMemo(code, symbol), registryTag(user)];
  const createIx = await PUMP_SDK.createV2Instruction({ mint, name, symbol, uri, creator: user, user, mayhemMode: false });
  const { blockhash, lastValidBlockHeight } = await rpc(c => c.getLatestBlockhash('confirmed'));
  const price = await priorityFee();
  let plan = [createIx, ...extra], alts = [], followUp = null;
  if (solIn > 0) {
    const lamports = new BN(Math.round(solIn * 1e9));
    const amount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: lamports });
    const maxSol = lamports.mul(new BN(Math.round((1 + slip) * 10000))).div(new BN(10000));
    const cb = [...await PUMP_SDK.createV2AndBuyInstructions({ global, mint, name, symbol, uri, creator: user, user, amount, solAmount: maxSol, mayhemMode: false }), ...extra];
    if (tryCompile(user, cb, 1_000_000, price, blockhash)) plan = cb;
    else { const found = await pickAlts(cb, user, price, blockhash); if (found) { plan = cb; alts = found; } else followUp = 'buy'; }
  }
  const first = compile(user, plan, 1_000_000, price, blockhash, alts);
  const r = await rpc(c => c.simulateTransaction(first.tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: 'processed' }));
  const sim = r.value;
  if (sim.err) { const e = http(400, explain(sim)); e.logs = (sim.logs || []).slice(-14); throw e; }
  const units = Math.min(1_400_000, Math.ceil((sim.unitsConsumed || 250000) * 1.25) + 30000);
  const fin = compile(user, plan, units, price, blockhash, alts);
  return {
    tx: Buffer.from(fin.bytes).toString('base64'), bytes: fin.bytes.length, units, priority: price, lastValidBlockHeight,
    memo: `fiat:v1:${code}:${symbol}`, registry: REGISTRY.toBase58(), firstBuy: followUp ? 0 : solIn, followUp, alts: alts.map(t => t.key.toBase58()),
  };
}
// the first buy as its own transaction, used only when create + buy can't fit in one
async function buy(b) {
  const user = pk(b.user, 'wallet'), mint = pk(b.mint, 'mint');
  const solIn = Math.max(0.001, Math.min(MAX_FIRST_BUY, Number(b.sol) || 0));
  const slipPct = Math.max(0.5, Math.min(30, Number(b.slippage) || 10));
  const { global, feeConfig } = await pumpState();
  const st = await rpc(c => new OnlinePumpSdk(c).fetchBuyState(mint, user, TOKEN_2022));
  if (st.bondingCurve.complete) throw http(400, 'This coin has already left the bonding curve.');
  const lamports = new BN(Math.round(solIn * 1e9));
  const amount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: st.bondingCurve.tokenTotalSupply, bondingCurve: st.bondingCurve, amount: lamports });
  const ixs = await PUMP_SDK.buyInstructions({ global, bondingCurveAccountInfo: st.bondingCurveAccountInfo, bondingCurve: st.bondingCurve, associatedUserAccountInfo: st.associatedUserAccountInfo, mint, user, amount, solAmount: lamports, slippage: slipPct, tokenProgram: TOKEN_2022 });
  const { blockhash, lastValidBlockHeight } = await rpc(c => c.getLatestBlockhash('confirmed'));
  const price = await priorityFee();
  const first = compile(user, ixs, 1_000_000, price, blockhash);
  const r = await rpc(c => c.simulateTransaction(first.tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: 'processed' }));
  if (r.value.err) { const e = http(400, explain(r.value)); e.logs = (r.value.logs || []).slice(-14); throw e; }
  const units = Math.min(1_400_000, Math.ceil((r.value.unitsConsumed || 150000) * 1.25) + 20000);
  const fin = compile(user, ixs, units, price, blockhash);
  return { tx: Buffer.from(fin.bytes).toString('base64'), units, lastValidBlockHeight };
}
async function relay(b) {
  const raw = Buffer.from(String(b.tx || ''), 'base64');
  if (raw.length < 64 || raw.length > 1232) throw http(400, 'Bad transaction');
  let tx; try { tx = VersionedTransaction.deserialize(raw); } catch (e) { throw http(400, 'Bad transaction'); }
  // only relay FIAT launches: the pairing memo + registry must be inside
  const keys = tx.message.staticAccountKeys;
  const isLaunch = keys.some(k => k.equals(REGISTRY)) && keys.some(k => k.equals(MEMO));
  if (!isLaunch && !keys.some(k => k.equals(PUMP_PROGRAM_ID))) throw http(400, 'Not a FIAT transaction');
  const sig = await rpc(c => c.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 5 }));
  delete mem.launches; delete mem.coins;
  return { sig };
}
async function status(sig) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(sig || '')) throw http(400, 'Bad signature');
  const r = await rpc(c => c.getSignatureStatuses([sig], { searchTransactionHistory: true }));
  const s = r.value[0];
  return { status: s ? s.confirmationStatus : 'unknown', err: s ? s.err : null };
}

/* ---------------- router ---------------- */
module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const path = String(url.searchParams.get('__p') || url.pathname.replace(/^\/api\/?/, '')).replace(/^\/+|\/+$/g, '');
    const q = url.searchParams;
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (path === 'config') return send(res, 200, { ok: true, ca: CONFIG.ca, x: CONFIG.x, launches: CONFIG.launches, registry: REGISTRY.toBase58(), memo: MEMO.toBase58() }, 'public, s-maxage=60');
    if (path === 'fx') return send(res, 200, { ok: true, ...(await fx()) }, 'public, s-maxage=900, stale-while-revalidate=3600');
    if (path === 'live') return send(res, 200, { ok: true, quotes: await live(String(q.get('codes') || '').toUpperCase().split(',').filter(Boolean)) }, 'public, s-maxage=60, stale-while-revalidate=120');
    if (path === 'coins') return send(res, 200, { ok: true, ...(await coins()) }, 'public, s-maxage=20, stale-while-revalidate=60');
    if (path === 'status') return send(res, 200, { ok: true, ...(await status(q.get('sig'))) });
    if (req.method === 'POST') {
      const b = await readBody(req);
      if (path === 'ipfs') { if (CONFIG.launches !== 'open') throw http(403, 'Launches open when the official $FIAT token is out.'); return send(res, 200, { ok: true, ...(await ipfs(b)) }); }
      if (path === 'build') return send(res, 200, { ok: true, ...(await build(b)) });
      if (path === 'buy') return send(res, 200, { ok: true, ...(await buy(b)) });
      if (path === 'send') return send(res, 200, { ok: true, ...(await relay(b)) });
    }
    return send(res, 404, { ok: false, error: 'Not found' });
  } catch (e) {
    const code = e.code && e.code >= 400 && e.code < 600 ? e.code : 500;
    return send(res, code, { ok: false, error: String(e.message || e).slice(0, 300), logs: e.logs });
  }
};
module.exports._test = { parseCreate, MEMO_RE, REGISTRY, pairingMemo, registryTag, compile, tryCompile, CONFIG };
