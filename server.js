// EVO — Day Trader Trends Dashboard
// Zero-dependency Node server (built-in modules only). Aggregates free, public,
// no-key market + social data server-side (avoiding browser CORS) and serves a
// single-page dashboard of the top social-media-driven movers with charts, plus
// a printable 6-page Market Trends Update at /report.
//
//   npm start           # then open http://localhost:3000
//
// Data sources (all free, no API key):
//   MARKET / PRICE
//   - CoinGecko   /coins/markets      -> crypto prices, 24h/7d change, 7d sparkline
//   - Binance     /ticker/24hr,/klines-> broad crypto price + movement + sparkline backfill
//   - CoinPaprika /tickers            -> crypto price + 24h/7d change + market cap
//   - CoinCap     /assets             -> crypto price + 24h change (breadth)
//   - CoinLore    /tickers            -> crypto price backup
//   - Bitfinex    /tickers            -> major-exchange crypto price + 24h change
//   - Coinbase    /products/stats     -> US-exchange crypto price (per-mover confirm)
//   - Yahoo       /v8/finance/chart   -> stock price, % change, intraday sparkline
//   SOCIAL / ATTENTION / NEWS
//   - CoinGecko   /search/trending    -> crypto search-trend signal
//   - Stocktwits  /trending/symbols   -> trending stock tickers + watchlist popularity
//   - Reddit      8 trading subs /hot -> cashtag/name mentions
//   - Hacker News (Algolia) frontpage -> tech/finance headline mentions
//   - Wikipedia   /metrics/pageviews  -> encyclopedic attention on an asset's page
//   - Google News /rss/search         -> recent news-headline volume per asset
//   SENTIMENT
//   - alternative.me /fng             -> Crypto Fear & Greed market-sentiment index

import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { demoDashboard } from "./demo-data.js";

const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");

// Company/asset name -> ticker, to catch plain-name mentions (headlines and
// Reddit titles rarely use $cashtags). Kept to unambiguous multi-letter names.
const NAME_TO_TICKER = {
  // crypto
  BITCOIN: "BTC", ETHEREUM: "ETH", SOLANA: "SOL", DOGECOIN: "DOGE", CARDANO: "ADA",
  RIPPLE: "XRP", "SHIBA INU": "SHIB", CHAINLINK: "LINK", POLKADOT: "DOT", AVALANCHE: "AVAX",
  LITECOIN: "LTC", "BITCOIN CASH": "BCH", POLYGON: "MATIC", TONCOIN: "TON", APTOS: "APT",
  ARBITRUM: "ARB", OPTIMISM: "OP", DOGWIFHAT: "WIF", UNISWAP: "UNI", STELLAR: "XLM",
  COSMOS: "ATOM", INJECTIVE: "INJ", CELESTIA: "TIA", FILECOIN: "FIL", "RENDER": "RNDR",
  // stocks
  TESLA: "TSLA", NVIDIA: "NVDA", APPLE: "AAPL", AMAZON: "AMZN", MICROSOFT: "MSFT",
  GOOGLE: "GOOGL", ALPHABET: "GOOGL", META: "META", FACEBOOK: "META", NETFLIX: "NFLX",
  GAMESTOP: "GME", PALANTIR: "PLTR", "MICRO DEVICES": "AMD", COINBASE: "COIN",
  MICROSTRATEGY: "MSTR", "SUPER MICRO": "SMCI", SUPERMICRO: "SMCI", BROADCOM: "AVGO",
  INTEL: "INTC", MICRON: "MU", QUALCOMM: "QCOM", SALESFORCE: "CRM", ORACLE: "ORCL",
  ADOBE: "ADBE", ROBINHOOD: "HOOD", RIVIAN: "RIVN", LUCID: "LCID", "MARATHON DIGITAL": "MARA",
  DRAFTKINGS: "DKNG", ROBLOX: "RBLX", CARVANA: "CVNA", "SOFI": "SOFI", ALIBABA: "BABA",
  DISNEY: "DIS", BOEING: "BA", SHOPIFY: "SHOP", "TAIWAN SEMICONDUCTOR": "TSM", ARM: "ARM",
};
// Well-known tickers that may appear as a bare UPPERCASE word (no $). Matched
// case-sensitively on word boundaries, minus the stopword set below.
const KNOWN_TICKERS = new Set([
  "AAPL","MSFT","NVDA","TSLA","AMZN","META","GOOGL","GOOG","NFLX","AMD","INTC","MU","QCOM",
  "AVGO","SMCI","ARM","TSM","CRM","ORCL","ADBE","PLTR","GME","AMC","COIN","HOOD","MARA","RIOT",
  "CLSK","MSTR","SOFI","NIO","RIVN","LCID","BABA","DIS","BA","SHOP","DKNG","RBLX","CVNA","SNAP",
  "UBER","ABNB","PYPL","NKE","SBUX","WMT","COST","JPM","BAC","GS","SPY","QQQ","IWM","VOO",
  "BTC","ETH","SOL","DOGE","ADA","XRP","SHIB","LINK","DOT","AVAX","LTC","BCH","MATIC","TRX",
  "TON","NEAR","APT","ARB","OP","PEPE","WIF","BONK","SUI","INJ","RNDR","FET","TIA","SEI","ATOM",
  "UNI","AAVE","XLM","ALGO","VET","FIL","HBAR","ICP","IMX","GALA","SAND","MANA","AXS",
]);
// All-caps words that collide with tickers but are usually plain English/jargon.
const TICKER_STOPWORDS = new Set([
  "THE","FOR","YOU","ARE","NOW","NEW","ALL","AND","BUT","NOT","CEO","CFO","ETF","IPO","USA",
  "USD","EPS","ATH","FUD","WSB","YOLO","DD","PT","EV","AI","US","IT","OR","SO","GO","ON","AN",
  "BE","IF","OF","TO","IN","IS","AS","AT","MY","WE","NO","UP","OUT","BUY","SELL","HOLD","PUMP",
  "CALL","PUTS","LONG","BULL","BEAR","RED","API","SEC","FED","GDP","CPI","Q1","Q2","Q3","Q4",
]);
// Ticker -> English Wikipedia article, for the pageviews attention signal.
const WIKI_ARTICLE = {
  TSLA: "Tesla,_Inc.", NVDA: "Nvidia", AAPL: "Apple_Inc.", AMZN: "Amazon_(company)",
  MSFT: "Microsoft", GOOGL: "Google", META: "Meta_Platforms", NFLX: "Netflix",
  GME: "GameStop", PLTR: "Palantir_Technologies", AMD: "Advanced_Micro_Devices",
  COIN: "Coinbase", MSTR: "MicroStrategy", INTC: "Intel", AVGO: "Broadcom", SMCI: "Supermicro",
  BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana_(blockchain_platform)", DOGE: "Dogecoin",
  XRP: "Ripple_Labs", ADA: "Cardano_(blockchain_platform)", SHIB: "Shiba_Inu_(cryptocurrency)",
  LINK: "Chainlink_(blockchain)", DOT: "Polkadot_(cryptocurrency)", AVAX: "Avalanche_(blockchain_platform)",
};
const STABLE_OR_LEVERAGED = /^(USDT|USDC|BUSD|TUSD|FDUSD|DAI|USDP|EUR|GBP)$|UP$|DOWN$|BULL$|BEAR$/;

// ---------------------------------------------------------------------------
// HTTP helpers (Node 18+ global fetch) with timeout.
// ---------------------------------------------------------------------------
async function request(url, { timeout = 9000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "EVO-DayTrader-Dashboard/1.0 (+https://github.com/sbantog720/evo)",
        Accept: "application/json",
        ...headers,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res;
  } finally {
    clearTimeout(t);
  }
}
const getJSON = async (url, opts) => (await request(url, opts)).json();
const getText = async (url, opts) => (await request(url, opts)).text();

// Never throws: logs and returns a fallback so one dead source can't take the
// whole dashboard down.
async function safe(label, fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[warn] ${label}: ${err.message}`);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Price sources (crypto). Each returns Map<UPPER symbol, quote>.
// ---------------------------------------------------------------------------
async function fetchCoinGeckoMarkets() {
  const url =
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc" +
    "&per_page=100&page=1&sparkline=true&price_change_percentage=24h,7d";
  const map = new Map();
  for (const c of await getJSON(url)) {
    const sym = String(c.symbol || "").toUpperCase();
    if (!sym) continue;
    map.set(sym, {
      symbol: sym, name: c.name, kind: "crypto", source: "CoinGecko",
      price: c.current_price,
      change24h: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h,
      change7d: c.price_change_percentage_7d_in_currency ?? null,
      marketCap: c.market_cap, volume: c.total_volume, image: c.image,
      spark: (c.sparkline_in_7d && c.sparkline_in_7d.price) || [],
    });
  }
  return map;
}
async function fetchBinanceUniverse() {
  const map = new Map();
  for (const r of await getJSON("https://api.binance.com/api/v3/ticker/24hr")) {
    const sym = String(r.symbol || "");
    if (!sym.endsWith("USDT")) continue;
    const base = sym.slice(0, -4).toUpperCase();
    if (!base || STABLE_OR_LEVERAGED.test(base)) continue;
    map.set(base, {
      symbol: base, name: base, kind: "crypto", source: "Binance",
      price: parseFloat(r.lastPrice), change24h: parseFloat(r.priceChangePercent),
      change7d: null, marketCap: null, volume: parseFloat(r.quoteVolume), image: null, spark: [],
    });
  }
  return map;
}
async function fetchCoinPaprika() {
  const map = new Map();
  for (const c of await getJSON("https://api.coinpaprika.com/v1/tickers?quotes=USD")) {
    const sym = String(c.symbol || "").toUpperCase();
    const q = c.quotes && c.quotes.USD;
    if (!sym || !q || map.has(sym)) continue; // array is rank-ordered; keep top
    map.set(sym, {
      symbol: sym, name: c.name, kind: "crypto", source: "CoinPaprika",
      price: q.price, change24h: q.percent_change_24h, change7d: q.percent_change_7d,
      marketCap: q.market_cap, volume: q.volume_24h, image: null, spark: [],
    });
  }
  return map;
}
async function fetchCoinCap() {
  const map = new Map();
  const data = (await getJSON("https://api.coincap.io/v2/assets?limit=200")).data || [];
  for (const a of data) {
    const sym = String(a.symbol || "").toUpperCase();
    if (!sym || map.has(sym)) continue;
    map.set(sym, {
      symbol: sym, name: a.name, kind: "crypto", source: "CoinCap",
      price: parseFloat(a.priceUsd), change24h: parseFloat(a.changePercent24Hr),
      change7d: null, marketCap: parseFloat(a.marketCapUsd), volume: parseFloat(a.volumeUsd24Hr),
      image: null, spark: [],
    });
  }
  return map;
}
async function fetchCoinLore() {
  const map = new Map();
  const data = (await getJSON("https://api.coinlore.net/api/tickers/?start=0&limit=100")).data || [];
  for (const c of data) {
    const sym = String(c.symbol || "").toUpperCase();
    if (!sym || map.has(sym)) continue;
    map.set(sym, {
      symbol: sym, name: c.name, kind: "crypto", source: "CoinLore",
      price: parseFloat(c.price_usd), change24h: parseFloat(c.percent_change_24h),
      change7d: parseFloat(c.percent_change_7d), marketCap: parseFloat(c.market_cap_usd),
      volume: null, image: null, spark: [],
    });
  }
  return map;
}
async function fetchBitfinex() {
  const map = new Map();
  const rows = await getJSON("https://api-pub.bitfinex.com/v2/tickers?symbols=ALL");
  for (const r of rows) {
    const pair = String(r[0] || "");
    const m = /^t([A-Z0-9]+)USD$/.exec(pair); // trading pairs vs USD, skip funding/others
    if (!m) continue;
    const base = m[1];
    if (STABLE_OR_LEVERAGED.test(base) || map.has(base)) continue;
    map.set(base, {
      symbol: base, name: base, kind: "crypto", source: "Bitfinex",
      price: r[7], change24h: (r[6] != null ? r[6] * 100 : null),
      change7d: null, marketCap: null, volume: r[8], image: null, spark: [],
    });
  }
  return map;
}
// Coinbase per-symbol daily stats -> price + 24h change (used to confirm movers).
async function fetchCoinbaseStat(base) {
  const s = await getJSON(`https://api.exchange.coinbase.com/products/${base}-USD/stats`);
  const open = parseFloat(s.open), last = parseFloat(s.last);
  if (!open || !last) return null;
  return { symbol: base, source: "Coinbase", price: last, change24h: ((last - open) / open) * 100, volume: parseFloat(s.volume) };
}
async function fetchBinanceKlines(base) {
  const rows = await getJSON(`https://api.binance.com/api/v3/klines?symbol=${base}USDT&interval=1h&limit=168`);
  return rows.map((k) => parseFloat(k[4])).filter((v) => !Number.isNaN(v));
}
// Yahoo Finance chart -> stock price, %chg, intraday spark.
async function fetchStockQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=15m`;
  const result = (await getJSON(url))?.chart?.result?.[0];
  if (!result) return null;
  const meta = result.meta || {};
  const closes = (result.indicators?.quote?.[0]?.close || []).filter((v) => v != null);
  const price = meta.regularMarketPrice ?? closes[closes.length - 1];
  const prev = meta.chartPreviousClose ?? meta.previousClose;
  return {
    symbol: symbol.toUpperCase(), name: meta.longName || meta.shortName || symbol.toUpperCase(),
    kind: "stock", source: "Yahoo Finance", price,
    change24h: price != null && prev ? ((price - prev) / prev) * 100 : null,
    change7d: null, marketCap: null, volume: meta.regularMarketVolume || null, image: null,
    spark: closes.slice(-120),
  };
}

// ---------------------------------------------------------------------------
// Social / attention / news sources.
// ---------------------------------------------------------------------------
async function fetchCryptoTrending() {
  const data = await getJSON("https://api.coingecko.com/api/v3/search/trending");
  return ((data && data.coins) || []).map((e, i) => ({
    symbol: String(e.item?.symbol || "").toUpperCase(), name: e.item?.name, rank: i,
  }));
}
async function fetchStocktwitsTrending() {
  const data = await getJSON("https://api.stocktwits.com/api/2/trending/symbols.json");
  return ((data && data.symbols) || []).map((s, i) => ({
    symbol: String(s.symbol || "").toUpperCase(), name: s.title, watchers: s.watchlist_count || 0, rank: i,
  }));
}
// Extract tickers from a piece of text via three passes: $cashtags, known bare
// UPPERCASE tickers (minus stopwords), and known company/asset names.
function extractTickers(text) {
  const found = new Set();
  let m;
  const cashtag = /\$([A-Za-z]{1,6})\b/g;
  while ((m = cashtag.exec(text)) !== null) found.add(m[1].toUpperCase());
  const word = /\b([A-Z]{2,5})\b/g; // bare uppercase tokens
  while ((m = word.exec(text)) !== null) {
    const w = m[1];
    if (KNOWN_TICKERS.has(w) && !TICKER_STOPWORDS.has(w)) found.add(w);
  }
  const up = text.toUpperCase();
  for (const [name, tk] of Object.entries(NAME_TO_TICKER)) if (up.includes(name)) found.add(tk);
  return [...found];
}

// The Reddit subreddits scanned (stocks/options + crypto communities).
const REDDIT_SUBS = [
  "wallstreetbets", "stocks", "StockMarket", "investing", "Daytrading", "swingtrading",
  "options", "thetagang", "pennystocks", "smallstreetbets", "Superstonk",
  "CryptoCurrency", "CryptoMarkets", "SatoshiStreetBets", "ethtrader", "Bitcoin", "altcoin",
];

// Rich Reddit fetch: per-ticker mentions + which subs, plus the hottest posts
// that mention a tracked ticker (for the dedicated Reddit page).
async function fetchReddit() {
  const counts = new Map();  // SYM -> { mentions, subs:Set, titles:[] }
  const perSub = {};         // sub -> mention count
  const posts = [];          // notable posts mentioning >=1 ticker
  let scanned = 0, okSubs = 0;

  const results = await Promise.all(REDDIT_SUBS.map((sub) =>
    safe(`reddit/${sub}`, () => getJSON(`https://www.reddit.com/r/${sub}/hot.json?limit=30`,
      { headers: { "User-Agent": "web:evo-daytrader:1.0 (by /u/evo)" } }), null)
      .then((data) => ({ sub, data }))));

  for (const { sub, data } of results) {
    const children = data?.data?.children || [];
    if (data) okSubs += 1;
    perSub[sub] = 0;
    for (const p of children) {
      const d = p.data || {};
      if (d.stickied) continue;
      scanned += 1;
      const text = `${d.title || ""} ${d.link_flair_text || ""}`;
      const tickers = extractTickers(text);
      if (!tickers.length) continue;
      perSub[sub] += 1;
      for (const sym of tickers) {
        const cur = counts.get(sym) || { mentions: 0, subs: new Set(), titles: [] };
        cur.mentions += 1;
        cur.subs.add(sub);
        if (cur.titles.length < 3) cur.titles.push(d.title || "");
        counts.set(sym, cur);
      }
      if (posts.length < 400) posts.push({
        title: d.title || "", sub, score: d.score || 0,
        comments: d.num_comments || 0, tickers,
        url: d.permalink ? `https://www.reddit.com${d.permalink}` : null,
      });
    }
  }
  posts.sort((a, b) => b.score - a.score);
  return { counts, perSub, posts, scanned, subs: REDDIT_SUBS, okSubs };
}
async function fetchHackerNews() {
  const data = await getJSON("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=50");
  const counts = new Map();
  for (const hit of (data?.hits || [])) {
    const title = hit.title || hit.story_title || "";
    for (const sym of extractTickers(title)) {
      const cur = counts.get(sym) || { mentions: 0, titles: [] };
      cur.mentions += 1;
      if (cur.titles.length < 2) cur.titles.push(title);
      counts.set(sym, cur);
    }
  }
  return counts;
}
// Wikipedia daily pageviews for a ticker's article (attention proxy), summed
// over the last 3 available days.
async function fetchWikiViews(ticker) {
  const article = WIKI_ARTICLE[ticker];
  if (!article) return 0;
  const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const end = new Date(Date.now() - 864e5), start = new Date(Date.now() - 4 * 864e5);
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/` +
    `${encodeURIComponent(article)}/daily/${fmt(start)}/${fmt(end)}`;
  const data = await getJSON(url);
  return (data.items || []).reduce((a, it) => a + (it.views || 0), 0);
}
// Google News RSS: count recent items mentioning an asset (news-volume signal).
async function fetchNewsCount(name) {
  const q = encodeURIComponent(`"${name}"`);
  const xml = await getText(`https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`);
  const items = xml.match(/<item>/g);
  const first = /<item>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/.exec(xml);
  return { count: items ? items.length : 0, title: first ? first[1] : null };
}
async function fetchFearGreed() {
  const d = (await getJSON("https://api.alternative.me/fng/?limit=1"))?.data?.[0];
  return d ? { value: Number(d.value), label: d.value_classification } : null;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------
const classifySentiment = (c) => (c == null ? "neutral" : c >= 3 ? "bullish" : c <= -3 ? "bearish" : "neutral");

// Merge a price Map into the unified crypto universe with field-level fallback,
// and record every source's 24h sign for cross-source confirmation.
function mergeCrypto(target, signals, src) {
  for (const [sym, q] of src) {
    if (q.change24h != null && !Number.isNaN(q.change24h)) {
      const arr = signals.get(sym) || [];
      arr.push({ source: q.source, change24h: q.change24h });
      signals.set(sym, arr);
    }
    const cur = target.get(sym);
    if (!cur) { target.set(sym, { ...q }); continue; }
    // prefer existing non-null fields; fill gaps from this source
    for (const k of ["price", "change24h", "change7d", "marketCap", "volume", "image", "name"]) {
      if ((cur[k] == null || cur[k] === "" || Number.isNaN(cur[k])) && q[k] != null && !Number.isNaN(q[k])) cur[k] = q[k];
    }
    if ((!cur.spark || cur.spark.length < 2) && q.spark && q.spark.length >= 2) cur.spark = q.spark;
  }
}

async function buildDashboard() {
  const [cg, binance, paprika, coincap, coinlore, bitfinex, cgTrending, stTrending, reddit, hn, fearGreed] =
    await Promise.all([
      safe("coingecko/markets", fetchCoinGeckoMarkets, new Map()),
      safe("binance/universe", fetchBinanceUniverse, new Map()),
      safe("coinpaprika/tickers", fetchCoinPaprika, new Map()),
      safe("coincap/assets", fetchCoinCap, new Map()),
      safe("coinlore/tickers", fetchCoinLore, new Map()),
      safe("bitfinex/tickers", fetchBitfinex, new Map()),
      safe("coingecko/trending", fetchCryptoTrending, []),
      safe("stocktwits/trending", fetchStocktwitsTrending, []),
      safe("reddit", fetchReddit, { counts: new Map(), perSub: {}, posts: [], scanned: 0, subs: REDDIT_SUBS, okSubs: 0 }),
      safe("hackernews/frontpage", fetchHackerNews, new Map()),
      safe("alternative.me/fng", fetchFearGreed, null),
    ]);

  // Unified crypto universe (CoinGecko last so its sparkline/cap win) + signals.
  const crypto = new Map();
  const priceSignals = new Map(); // SYM -> [{source, change24h}]
  for (const src of [coinlore, coincap, bitfinex, paprika, binance, cg]) mergeCrypto(crypto, priceSignals, src);

  // ---- Phase 1: initial buzz from batch social sources ----
  const scores = new Map();
  const bump = (sym, pts, source, extra = {}) => {
    if (!sym) return;
    const cur = scores.get(sym) ||
      { symbol: sym, score: 0, sources: new Set(), mentions: 0, watchers: 0, titles: [], newsCount: 0, wikiViews: 0 };
    cur.score += pts;
    if (source) cur.sources.add(source);
    if (extra.mentions) cur.mentions += extra.mentions;
    if (extra.watchers) cur.watchers = Math.max(cur.watchers, extra.watchers);
    if (extra.titles) cur.titles = cur.titles.concat(extra.titles).slice(0, 4);
    scores.set(sym, cur);
  };
  for (const [sym, info] of reddit.counts) bump(sym, info.mentions * 3, "Reddit", { mentions: info.mentions, titles: info.titles });
  for (const [sym, info] of hn) bump(sym, info.mentions * 2.5, "Hacker News", { mentions: info.mentions, titles: info.titles });
  stTrending.forEach((s) => bump(s.symbol, Math.max(0, 6 - s.rank * 0.2) + Math.min(4, (s.watchers || 0) / 50000), "Stocktwits", { watchers: s.watchers }));
  cgTrending.forEach((t) => bump(t.symbol, Math.max(0, 5 - t.rank * 0.3), "CoinGecko Trending"));

  // ---- Phase 2: enrich top candidates with Wikipedia + Google News + Yahoo ----
  const candidates = [...scores.values()].sort((a, b) => b.score - a.score).slice(0, 18);
  await Promise.all(candidates.map(async (c) => {
    const cryptoInfo = crypto.get(c.symbol);
    const name = (cryptoInfo && cryptoInfo.name) || NAMEfor(c.symbol) || c.symbol;
    const [views, news] = await Promise.all([
      safe(`wiki/${c.symbol}`, () => fetchWikiViews(c.symbol), 0),
      safe(`news/${c.symbol}`, () => fetchNewsCount(name), { count: 0, title: null }),
    ]);
    if (views > 0) { c.wikiViews = views; c.score += Math.min(3, views / 20000); c.sources.add("Wikipedia"); }
    if (news.count > 0) {
      c.newsCount = news.count; c.score += Math.min(4, news.count * 0.5); c.sources.add("Google News");
      if (news.title && c.titles.length < 4) c.titles.push(news.title);
    }
  }));

  // Stocks among candidates need a Yahoo price lookup.
  const need = candidates.filter((c) => !crypto.has(c.symbol)).map((c) => c.symbol).slice(0, 14);
  const stockQuotes = new Map();
  (await Promise.all(need.map((sym) => safe(`yahoo/${sym}`, () => fetchStockQuote(sym), null))))
    .forEach((q) => { if (q && q.price != null) stockQuotes.set(q.symbol, q); });

  // ---- Phase 3: rank, join price, build the top 10 ----
  const ranked = [...scores.values()].sort((a, b) => b.score - a.score);
  const movers = [];
  for (const cand of ranked) {
    const market = crypto.get(cand.symbol) || stockQuotes.get(cand.symbol);
    if (!market || market.price == null) continue;
    const signals = priceSignals.get(cand.symbol) || [];
    movers.push({
      symbol: cand.symbol, name: market.name || cand.symbol, kind: market.kind,
      price: market.price, change24h: market.change24h, change7d: market.change7d,
      volume: market.volume, marketCap: market.marketCap, image: market.image,
      spark: market.spark || [], priceSource: market.source,
      socialScore: Math.round(cand.score * 10) / 10,
      mentions: cand.mentions, watchers: cand.watchers, newsCount: cand.newsCount, wikiViews: cand.wikiViews,
      sources: [...cand.sources], titles: cand.titles, sentiment: classifySentiment(market.change24h),
      priceSourceCount: signals.length,
      downConfirms: signals.filter((s) => s.change24h < 0).length,
      upConfirms: signals.filter((s) => s.change24h > 0).length,
    });
    if (movers.length >= 10) break;
  }

  // ---- Phase 4: confirm crypto movers on Coinbase + backfill sparklines ----
  await Promise.all(movers.filter((m) => m.kind === "crypto").map(async (m) => {
    const cb = await safe(`coinbase/${m.symbol}`, () => fetchCoinbaseStat(m.symbol), null);
    if (cb && cb.change24h != null) {
      m.priceSourceCount += 1;
      if (cb.change24h < 0) m.downConfirms += 1; else if (cb.change24h > 0) m.upConfirms += 1;
      if (!m.sources.includes("Coinbase")) { /* price source, not social */ }
    }
    if (!m.spark || m.spark.length < 2) m.spark = await safe(`binance/klines/${m.symbol}`, () => fetchBinanceKlines(m.symbol), []);
  }));

  // Reddit summary for the dedicated Reddit page.
  const redditTickers = [...reddit.counts.entries()]
    .map(([symbol, v]) => ({ symbol, mentions: v.mentions, subs: [...v.subs] }))
    .sort((a, b) => b.mentions - a.mentions).slice(0, 12);
  const social = {
    reddit: {
      subs: reddit.subs, subsOk: reddit.okSubs, scanned: reddit.scanned,
      perSub: reddit.perSub, tickers: redditTickers, posts: reddit.posts.slice(0, 10),
    },
  };

  return {
    generatedAt: new Date().toISOString(),
    universeSize: crypto.size,
    market: { fearGreed },
    social,
    counts: {
      redditSymbols: reddit.counts.size, hackerNews: hn.size, stocktwits: stTrending.length,
      cryptoTrending: cgTrending.length, binance: binance.size, coinpaprika: paprika.size,
      coincap: coincap.size, coinlore: coinlore.size, bitfinex: bitfinex.size,
    },
    movers,
  };
}
function NAMEfor(sym) {
  for (const [name, tk] of Object.entries(NAME_TO_TICKER)) if (tk === sym) return name[0] + name.slice(1).toLowerCase();
  return null;
}

// ---------------------------------------------------------------------------
// Cache: refresh at most once per 60s.
// ---------------------------------------------------------------------------
let cache = { at: 0, data: null, building: null };
async function getDashboard() {
  if (Date.now() - cache.at < 60_000 && cache.data) return cache.data;
  if (cache.building) return cache.building;
  cache.building = buildDashboard()
    .then((data) => {
      if (!data.movers.length) {
        console.warn("[warn] all live sources empty — serving DEMO data");
        data = demoDashboard();
      }
      cache = { at: Date.now(), data, building: null };
      return data;
    })
    .catch((err) => { cache.building = null; throw err; });
  return cache.building;
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};
async function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  if (rel === "/report") rel = "/report.html";
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403).end("Forbidden"); return; }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}
const server = http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/dashboard")) {
    try {
      const data = await getDashboard();
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "aggregation_failed", message: err.message }));
    }
    return;
  }
  serveStatic(req, res);
});
server.listen(PORT, () => {
  console.log(`\n  EVO Day Trader Trends Dashboard`);
  console.log(`  ▸ dashboard: http://localhost:${PORT}`);
  console.log(`  ▸ report:    http://localhost:${PORT}/report\n`);
});
