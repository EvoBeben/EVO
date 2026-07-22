// EVO — Day Trader Trends Dashboard
// Zero-dependency Node server (built-in modules only). Aggregates free, public,
// no-key market + social data server-side (avoiding browser CORS) and serves a
// single-page dashboard of the top social-media-driven movers with charts.
//
//   npm start           # then open http://localhost:3000
//
// Data sources (all free, no API key):
//   - CoinGecko  /coins/markets           -> crypto prices, 24h/7d change, 7d sparkline
//   - CoinGecko  /search/trending         -> search-trend signal (social proxy)
//   - Stocktwits /trending/symbols        -> trending stock tickers + watchlist popularity
//   - Reddit     r/wallstreetbets, r/CryptoCurrency /hot -> cashtag mentions (social)
//   - Yahoo      /v8/finance/chart/<SYM>  -> stock price, % change, intraday sparkline

import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { demoDashboard } from "./demo-data.js";

const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");

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
    });
  }
  return map;
}

// CoinGecko "trending" search list — a social/search interest proxy for crypto.
async function fetchCryptoTrending() {
  const data = await getJSON("https://api.coingecko.com/api/v3/search/trending");
  const out = [];
  const coins = (data && data.coins) || [];
  coins.forEach((entry, i) => {
    const item = entry.item || {};
    out.push({
      symbol: String(item.symbol || "").toUpperCase(),
      name: item.name,
      rank: i,
      source: "CoinGecko Trending",
    });
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
      source: "Stocktwits",
    });
  });
  return out;
}

// Reddit cashtag mentions across a couple of trading subs.
async function fetchRedditMentions() {
  const subs = ["wallstreetbets", "CryptoCurrency", "stocks"];
  const counts = new Map(); // SYM -> { mentions, titles:[] }
  const cashtag = /\$([A-Za-z]{1,6})\b/g;
  const results = await Promise.all(
    subs.map((sub) =>
      safe(
        `reddit/${sub}`,
        () =>
          getJSON(`https://www.reddit.com/r/${sub}/hot.json?limit=50`, {
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
      const seen = new Set();
      let m;
      cashtag.lastIndex = 0;
      while ((m = cashtag.exec(title)) !== null) {
        const sym = m[1].toUpperCase();
        if (seen.has(sym)) continue; // count each ticker once per post
        seen.add(sym);
        const cur = counts.get(sym) || { mentions: 0, titles: [] };
        cur.mentions += 1;
        if (cur.titles.length < 3) cur.titles.push(title);
        counts.set(sym, cur);
      }
    }
  }
  return counts;
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
  const [crypto, cgTrending, stTrending, redditCounts] = await Promise.all([
    safe("coingecko/markets", fetchCryptoMarkets, new Map()),
    safe("coingecko/trending", fetchCryptoTrending, []),
    safe("stocktwits/trending", fetchStocktwitsTrending, []),
    safe("reddit/mentions", fetchRedditMentions, new Map()),
  ]);

  // Score every candidate symbol by a weighted social signal.
  //   Reddit mention  -> 3 each
  //   Stocktwits rank -> up to ~6 (front of list weighs more) + watcher bonus
  //   CoinGecko trend -> up to ~5 (front of list weighs more)
  const scores = new Map(); // SYM -> { score, sources:Set, mentions, watchers, titles }
  const bump = (sym, pts, source, extra = {}) => {
    if (!sym) return;
    const cur =
      scores.get(sym) ||
      { symbol: sym, score: 0, sources: new Set(), mentions: 0, watchers: 0, titles: [] };
    cur.score += pts;
    cur.sources.add(source);
    if (extra.mentions) cur.mentions += extra.mentions;
    if (extra.watchers) cur.watchers = Math.max(cur.watchers, extra.watchers);
    if (extra.titles) cur.titles = cur.titles.concat(extra.titles).slice(0, 3);
    scores.set(sym, cur);
  };

  for (const [sym, info] of redditCounts) {
    bump(sym, info.mentions * 3, "Reddit", { mentions: info.mentions, titles: info.titles });
  }
  stTrending.forEach((s) => {
    const rankPts = Math.max(0, 6 - s.rank * 0.2);
    const watchPts = Math.min(4, (s.watchers || 0) / 50000);
    bump(s.symbol, rankPts + watchPts, "Stocktwits", { watchers: s.watchers });
  });
  cgTrending.forEach((t) => {
    bump(t.symbol, Math.max(0, 5 - t.rank * 0.3), "CoinGecko Trending");
  });

  // Rank candidates, then attach price/movement data.
  const ranked = [...scores.values()].sort((a, b) => b.score - a.score);

  // Which of the top candidates are stocks needing a Yahoo lookup?
  const need = [];
  for (const cand of ranked.slice(0, 24)) {
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
      socialScore: Math.round(cand.score * 10) / 10,
      mentions: cand.mentions,
      watchers: cand.watchers,
      sources: [...cand.sources],
      titles: cand.titles,
      sentiment: classifySentiment(market.change24h),
    });
    if (movers.length >= 10) break;
  }

  return {
    generatedAt: new Date().toISOString(),
    universeSize: crypto.size,
    counts: {
      redditSymbols: redditCounts.size,
      stocktwits: stTrending.length,
      cryptoTrending: cgTrending.length,
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
  console.log(`  ▸ http://localhost:${PORT}\n`);
});
