// Demo fallback dataset. Used ONLY when every live source is unreachable
// (offline, rate-limited, or blocked by a network policy) so the dashboard and
// the report still render and are explorable. Always flagged with `demo: true`
// in the API response and surfaced with a banner in the UI — never presented as
// live.

// Deterministic pseudo-random walk so demo sparklines look plausible.
function walk(seed, n, drift) {
  let x = seed % 1000;
  const rnd = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out = [];
  let v = 100;
  for (let i = 0; i < n; i++) {
    v += (rnd() - 0.5) * 4 + drift;
    out.push(Math.max(1, v));
  }
  return out;
}

const SEED = [
  { symbol: "BTC", name: "Bitcoin", kind: "crypto", price: 71850, change24h: 4.2, priceSource: "CoinGecko",
    sources: ["Reddit", "CoinGecko Trending", "Hacker News"], score: 41.5, seed: 7, drift: 0.35, vol: 38e9, cap: 1.42e12,
    titles: ["Bitcoin reclaims $71K as ETF inflows accelerate", "BTC dominance climbs above 54%"] },
  { symbol: "NVDA", name: "NVIDIA", kind: "stock", price: 128.4, change24h: 3.1, priceSource: "Yahoo Finance",
    sources: ["Reddit", "Stocktwits", "Hacker News"], score: 38.2, seed: 13, drift: 0.25, vol: 3.1e8, cap: 3.15e12,
    titles: ["NVDA pops on new datacenter GPU demand", "Analysts raise NVIDIA targets ahead of earnings"] },
  { symbol: "TSLA", name: "Tesla", kind: "stock", price: 246.1, change24h: -2.6, priceSource: "Yahoo Finance",
    sources: ["Reddit", "Stocktwits"], score: 33.9, seed: 21, drift: -0.22, vol: 9.8e7, cap: 7.8e11,
    titles: ["Tesla slips as delivery estimates get trimmed", "TSLA options volume spikes on the pullback"] },
  { symbol: "ETH", name: "Ethereum", kind: "crypto", price: 3820, change24h: 5.8, priceSource: "CoinGecko",
    sources: ["Reddit", "CoinGecko Trending"], score: 29.4, seed: 34, drift: 0.5, vol: 18e9, cap: 4.6e11,
    titles: ["Ethereum leads majors after staking update chatter"] },
  { symbol: "SOL", name: "Solana", kind: "crypto", price: 182.7, change24h: 8.4, priceSource: "Binance",
    sources: ["CoinGecko Trending", "Reddit"], score: 24.1, seed: 55, drift: 0.7, vol: 4.2e9, cap: 8.4e10,
    titles: ["Solana outperforms on renewed DeFi volume"] },
  { symbol: "GME", name: "GameStop", kind: "stock", price: 24.3, change24h: 11.2, priceSource: "Yahoo Finance",
    sources: ["Reddit", "Stocktwits"], score: 22.8, seed: 89, drift: 0.95, vol: 4.4e7, cap: 9.6e9,
    titles: ["GME rips as retail chatter surges again on WSB", "GameStop trends across trading subs"] },
  { symbol: "AMD", name: "Advanced Micro Devices", kind: "stock", price: 158.9, change24h: 1.4, priceSource: "Yahoo Finance",
    sources: ["Stocktwits", "Hacker News"], score: 18.6, seed: 144, drift: 0.12, vol: 5.2e7, cap: 2.57e11,
    titles: ["AMD steady as AI accelerator roadmap leaks"] },
  { symbol: "DOGE", name: "Dogecoin", kind: "crypto", price: 0.162, change24h: -3.7, priceSource: "Binance",
    sources: ["Reddit", "CoinGecko Trending"], score: 16.2, seed: 233, drift: -0.3, vol: 1.1e9, cap: 2.3e10,
    titles: ["Dogecoin cools off after the meme-driven run"] },
  { symbol: "AAPL", name: "Apple", kind: "stock", price: 214.6, change24h: 0.9, priceSource: "Yahoo Finance",
    sources: ["Stocktwits"], score: 12.9, seed: 377, drift: 0.08, vol: 4.6e7, cap: 3.28e12,
    titles: ["Apple drifts higher into product-cycle season"] },
  { symbol: "PLTR", name: "Palantir", kind: "stock", price: 27.8, change24h: 6.3, priceSource: "Yahoo Finance",
    sources: ["Reddit", "Stocktwits"], score: 11.4, seed: 610, drift: 0.55, vol: 6.1e7, cap: 6.1e10,
    titles: ["Palantir jumps on new government contract buzz"] },
];

export function demoDashboard() {
  const movers = SEED.map((s) => {
    const spark = walk(s.seed, s.kind === "crypto" ? 168 : 96, s.drift);
    return {
      symbol: s.symbol,
      name: s.name,
      kind: s.kind,
      price: s.price,
      change24h: s.change24h,
      change7d: s.kind === "crypto" ? Math.round(s.change24h * 1.6 * 10) / 10 : null,
      volume: s.vol,
      marketCap: s.cap,
      image: null,
      spark,
      priceSource: s.priceSource,
      socialScore: s.score,
      mentions: Math.round(s.score / 3),
      watchers: s.sources.includes("Stocktwits") ? Math.round(s.score * 4000) : 0,
      sources: s.sources,
      titles: s.titles || [],
      sentiment: s.change24h >= 3 ? "bullish" : s.change24h <= -3 ? "bearish" : "neutral",
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    demo: true,
    universeSize: 0,
    market: { fearGreed: { value: 72, label: "Greed" } },
    counts: { redditSymbols: 0, hackerNews: 0, stocktwits: 0, cryptoTrending: 0, binance: 0 },
    movers,
  };
}
