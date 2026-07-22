// EVO — Day Trader Trends Dashboard
// Zero-dependency Node server (built-in modules only). Aggregates free, public,
// no-key market + social data server-side (avoiding browser CORS) and serves a
// single-page dashboard of the top social-media-driven movers with charts, plus
// a printable 5-page Market Trends Update at /report.
//
//   npm start           # then open http://localhost:3000
//
// Data sources (all free, no API key):
//   - CoinGecko  /coins/markets      -> crypto prices, 24h/7d change, 7d sparkline
//   - CoinGecko  /search/trending    -> search-trend signal (social proxy)
//   - Binance    /ticker/24hr        -> broad crypto price + 24h movement universe
//   - Binance    /klines             -> sparkline for crypto not covered by CoinGecko
//   - Stocktwits /trending/symbols   -> trending stock tickers + watchlist popularity
//   - Reddit     8 trading subs /hot -> cashtag mentions (social)
//   - Hacker News (Algolia) frontpage-> tech/finance headline mentions (social/news)
//   - Yahoo      /v8/finance/chart   -> stock price, % change, intraday sparkline
//   - alternative.me /fng            -> Crypto Fear & Greed market-sentiment index

import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { demoDashboard } from "./demo-data.js";

const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");

// Company/asset name -> ticker, used to catch plain-name mentions (Hacker News
// headlines and Reddit titles rarely use $cashtags).
const NAME_TO_TICKER = {
  BITCOIN: "BTC", ETHEREUM: "ETH", SOLANA: "SOL", DOGECOIN: "DOGE", CARDANO: "ADA",
  RIPPLE: "XRP", "SHIBA INU": "SHIB", CHAINLINK: "LINK", POLKADOT: "DOT", AVALANCHE: "AVAX",
  TESLA: "TSLA", NVIDIA: "NVDA", APPLE: "AAPL", AMAZON: "AMZN", MICROSOFT: "MSFT",
  GOOGLE: "GOOGL", ALPHABET: "GOOGL", META: "META", FACEBOOK: "META", NETFLIX: "NFLX",
  GAMESTOP: "GME", PALANTIR: "PLTR", "MICRO DEVICES": "AMD", COINBASE: "COIN",
  MICROSTRATEGY: "MSTR", "SUPER MICRO": "SMCI", BROADCOM: "AVGO", INTEL: "INTC",
};
const STABLE_OR_LEVERAGED = /^(USDT|USDC|BUSD|TUSD|FDUSD|DAI|USDP|EUR|GBP)$|UP$|DOWN$|BULL$|BEAR$/;

// ---------------------------------------------------------------------------
// Small HTTP JSON fetch helper (uses Node 18+ global fetch) with timeout.
// ---------------------------------------------------------------------------
async function getJSON(url, { timeout = 9000, headers = {} } = {}) {
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
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// A friendly wrapper: never throws, logs and returns a fallback instead so one
// dead source can't take down the whole dashboard.
async function safe(label, fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[warn] ${label}: ${err.message}`);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Source adapters
// ---------------------------------------------------------------------------

// Crypto universe with price + change + 7d sparkline, keyed by UPPER symbol.
async function fetchCryptoMarkets() {
  const url =
    "https://api.coingecko.com/api/v3/coins/markets" +
    "?vs_currency=usd&order=market_cap_desc&per_page=100&page=1" +
    "&sparkline=true&price_change_percentage=24h,7d";
  const rows = await getJSON(url);
  const map = new Map();
  for (const c of rows) {
    const sym = String(c.symbol || "").toUpperCase();
    if (!sym) continue;
    map.set(sym, {
      symbol: sym,
      name: c.name,
      kind: "crypto",
      price: c.current_price,
      change24h: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h,
      change7d: c.price_change_percentage_7d_in_currency ?? null,
      marketCap: c.market_cap,
      volume: c.total_volume,
      image: c.image,
      spark: (c.sparkline_in_7d && c.sparkline_in_7d.price) || [],
      source: "CoinGecko",
    });
  }
  return map;
}

// Binance 24h tickers — broad crypto price + movement universe (USDT pairs).
async function fetchBinanceUniverse() {
  const rows = await getJSON("https://api.binance.com/api/v3/ticker/24hr");
  const map = new Map();
  for (const r of rows) {
    const sym = String(r.symbol || "");
    if (!sym.endsWith("USDT")) continue;
    const base = sym.slice(0, -4).toUpperCase();
    if (!base || STABLE_OR_LEVERAGED.test(base)) continue;
    map.set(base, {
      symbol: base,
      name: base,
      kind: "crypto",
      price: parseFloat(r.lastPrice),
      change24h: parseFloat(r.priceChangePercent),
      change7d: null,
      marketCap: null,
      volume: parseFloat(r.quoteVolume),
      image: null,
      spark: [],
      source: "Binance",
    });
  }
  return map;
}

// Binance hourly klines -> a 7-day close sparkline for a single base symbol.
async function fetchBinanceKlines(base) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${base}USDT&interval=1h&limit=168`;
  const rows = await getJSON(url);
  return rows.map((k) => parseFloat(k[4])).filter((v) => !Number.isNaN(v));
}

// CoinGecko "trending" search list — a social/search interest proxy for crypto.
async function fetchCryptoTrending() {
  const data = await getJSON("https://api.coingecko.com/api/v3/search/trending");
  const out = [];
  const coins = (data && data.coins) || [];
  coins.forEach((entry, i) => {
    const item = entry.item || {};
    out.push({ symbol: String(item.symbol || "").toUpperCase(), name: item.name, rank: i });
  });
  return out;
}

// Stocktwits trending stock symbols with watchlist popularity.
async function fetchStocktwitsTrending() {
  const data = await getJSON("https://api.stocktwits.com/api/2/trending/symbols.json");
  const out = [];
  const symbols = (data && data.symbols) || [];
  symbols.forEach((s, i) => {
    out.push({
      symbol: String(s.symbol || "").toUpperCase(),
      name: s.title,
      watchers: s.watchlist_count || 0,
      rank: i,
    });
  });
  return out;
}

// Scan a chunk of text for tickers: $cashtags plus known company/asset names.
function extractTickers(text) {
  const found = new Set();
  const up = text.toUpperCase();
  let m;
  const cashtag = /\$([A-Za-z]{1,6})\b/g;
  while ((m = cashtag.exec(text)) !== null) found.add(m[1].toUpperCase());
  for (const [name, tk] of Object.entries(NAME_TO_TICKER)) {
    if (up.includes(name)) found.add(tk);
  }
  return [...found];
}

// Reddit cashtag/name mentions across a broad set of trading subs.
async function fetchRedditMentions() {
  const subs = [
    "wallstreetbets", "CryptoCurrency", "stocks", "StockMarket",
    "Daytrading", "options", "SatoshiStreetBets", "pennystocks",
  ];
  const counts = new Map(); // SYM -> { mentions, titles:[] }
  const results = await Promise.all(
    subs.map((sub) =>
      safe(
        `reddit/${sub}`,
        () =>
          getJSON(`https://www.reddit.com/r/${sub}/hot.json?limit=40`, {
            headers: { "User-Agent": "web:evo-daytrader:1.0 (by /u/evo)" },
          }),
        null
      )
    )
  );
  for (const data of results) {
    const posts = (data && data.data && data.data.children) || [];
    for (const p of posts) {
      const title = (p.data && p.data.title) || "";
      for (const sym of extractTickers(title)) {
        const cur = counts.get(sym) || { mentions: 0, titles: [] };
        cur.mentions += 1;
        if (cur.titles.length < 3) cur.titles.push(title);
        counts.set(sym, cur);
      }
    }
  }
  return counts;
}

// Hacker News (Algolia) front-page stories -> headline mentions (news/social).
async function fetchHackerNews() {
  const data = await getJSON("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=50");
  const counts = new Map();
  for (const hit of (data && data.hits) || []) {
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

// Crypto Fear & Greed Index (market-wide sentiment gauge).
async function fetchFearGreed() {
  const data = await getJSON("https://api.alternative.me/fng/?limit=1");
  const d = (data && data.data && data.data[0]) || null;
  if (!d) return null;
  return { value: Number(d.value), label: d.value_classification };
}

// Yahoo Finance chart for a single stock symbol -> price, %chg, intraday spark.
async function fetchStockQuote(symbol) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=5d&interval=15m`;
  const data = await getJSON(url);
  const result = data && data.chart && data.chart.result && data.chart.result[0];
  if (!result) return null;
  const meta = result.meta || {};
  const closes = ((result.indicators &&
    result.indicators.quote &&
    result.indicators.quote[0] &&
    result.indicators.quote[0].close) || []).filter((v) => v != null);
  const price = meta.regularMarketPrice ?? closes[closes.length - 1];
  const prevClose = meta.chartPreviousClose ?? meta.previousClose;
  const change24h =
    price != null && prevClose ? ((price - prevClose) / prevClose) * 100 : null;
  return {
    symbol: symbol.toUpperCase(),
    name: meta.longName || meta.shortName || symbol.toUpperCase(),
    kind: "stock",
    price,
    change24h,
    change7d: null,
    marketCap: null,
    volume: meta.regularMarketVolume || null,
    image: null,
    spark: closes.slice(-120),
    source: "Yahoo Finance",
  };
}

// ---------------------------------------------------------------------------
// Aggregation: build the top-10 social-trend movers.
// ---------------------------------------------------------------------------
function classifySentiment(change) {
  if (change == null) return "neutral";
  if (change >= 3) return "bullish";
  if (change <= -3) return "bearish";
  return "neutral";
}

async function buildDashboard() {
  const [cgMarkets, binance, cgTrending, stTrending, redditCounts, hnCounts, fearGreed] =
    await Promise.all([
      safe("coingecko/markets", fetchCryptoMarkets, new Map()),
      safe("binance/universe", fetchBinanceUniverse, new Map()),
      safe("coingecko/trending", fetchCryptoTrending, []),
      safe("stocktwits/trending", fetchStocktwitsTrending, []),
      safe("reddit/mentions", fetchRedditMentions, new Map()),
      safe("hackernews/frontpage", fetchHackerNews, new Map()),
      safe("alternative.me/fng", fetchFearGreed, null),
    ]);

  // Unified crypto universe: prefer CoinGecko (has sparkline + market cap),
  // fall back to Binance for breadth.
  const crypto = new Map(binance);
  for (const [sym, info] of cgMarkets) crypto.set(sym, info);

  // Score every candidate symbol by a weighted social signal.
  const scores = new Map();
  const bump = (sym, pts, source, extra = {}) => {
    if (!sym) return;
    const cur =
      scores.get(sym) ||
      { symbol: sym, score: 0, sources: new Set(), mentions: 0, watchers: 0, titles: [] };
    cur.score += pts;
    cur.sources.add(source);
    if (extra.mentions) cur.mentions += extra.mentions;
    if (extra.watchers) cur.watchers = Math.max(cur.watchers, extra.watchers);
    if (extra.titles) cur.titles = cur.titles.concat(extra.titles).slice(0, 4);
    scores.set(sym, cur);
  };

  for (const [sym, info] of redditCounts) {
    bump(sym, info.mentions * 3, "Reddit", { mentions: info.mentions, titles: info.titles });
  }
  for (const [sym, info] of hnCounts) {
    bump(sym, info.mentions * 2.5, "Hacker News", { mentions: info.mentions, titles: info.titles });
  }
  stTrending.forEach((s) => {
    const rankPts = Math.max(0, 6 - s.rank * 0.2);
    const watchPts = Math.min(4, (s.watchers || 0) / 50000);
    bump(s.symbol, rankPts + watchPts, "Stocktwits", { watchers: s.watchers });
  });
  cgTrending.forEach((t) => {
    bump(t.symbol, Math.max(0, 5 - t.rank * 0.3), "CoinGecko Trending");
  });

  const ranked = [...scores.values()].sort((a, b) => b.score - a.score);

  // Which of the top candidates are stocks needing a Yahoo lookup?
  const need = [];
  for (const cand of ranked.slice(0, 26)) {
    if (!crypto.has(cand.symbol)) need.push(cand.symbol);
    if (need.length >= 14) break;
  }
  const stockQuotes = new Map();
  const quotes = await Promise.all(
    need.map((sym) => safe(`yahoo/${sym}`, () => fetchStockQuote(sym), null))
  );
  quotes.forEach((q) => {
    if (q && q.price != null) stockQuotes.set(q.symbol, q);
  });

  // Merge market data onto ranked candidates; keep only those with price data.
  const movers = [];
  for (const cand of ranked) {
    const market = crypto.get(cand.symbol) || stockQuotes.get(cand.symbol);
    if (!market || market.price == null) continue;
    movers.push({
      symbol: cand.symbol,
      name: market.name || cand.symbol,
      kind: market.kind,
      price: market.price,
      change24h: market.change24h,
      change7d: market.change7d,
      volume: market.volume,
      marketCap: market.marketCap,
      image: market.image,
      spark: market.spark || [],
      priceSource: market.source,
      socialScore: Math.round(cand.score * 10) / 10,
      mentions: cand.mentions,
      watchers: cand.watchers,
      sources: [...cand.sources],
      titles: cand.titles,
      sentiment: classifySentiment(market.change24h),
    });
    if (movers.length >= 10) break;
  }

  // Backfill sparklines for crypto movers that came from Binance (no sparkline).
  await Promise.all(
    movers
      .filter((m) => m.kind === "crypto" && (!m.spark || m.spark.length < 2))
      .map(async (m) => {
        m.spark = await safe(`binance/klines/${m.symbol}`, () => fetchBinanceKlines(m.symbol), []);
      })
  );

  return {
    generatedAt: new Date().toISOString(),
    universeSize: crypto.size,
    market: { fearGreed },
    counts: {
      redditSymbols: redditCounts.size,
      hackerNews: hnCounts.size,
      stocktwits: stTrending.length,
      cryptoTrending: cgTrending.length,
      binance: binance.size,
    },
    movers,
  };
}

// ---------------------------------------------------------------------------
// Cache: refresh at most once per 60s (respects source rate limits).
// ---------------------------------------------------------------------------
let cache = { at: 0, data: null, building: null };
async function getDashboard() {
  const fresh = Date.now() - cache.at < 60_000 && cache.data;
  if (fresh) return cache.data;
  if (cache.building) return cache.building; // coalesce concurrent requests
  cache.building = buildDashboard()
    .then((data) => {
      // If every live source was unreachable, fall back to labeled demo data so
      // the dashboard is never blank. Real data always wins when available.
      if (!data.movers.length) {
        console.warn("[warn] all live sources empty — serving DEMO data");
        data = demoDashboard();
      }
      cache = { at: Date.now(), data, building: null };
      return data;
    })
    .catch((err) => {
      cache.building = null;
      throw err;
    });
  return cache.building;
}

// ---------------------------------------------------------------------------
// HTTP server: static files + /api/dashboard
// ---------------------------------------------------------------------------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

async function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  if (rel === "/report") rel = "/report.html";
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
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
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
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
