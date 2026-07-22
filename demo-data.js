// Demo fallback dataset. Used ONLY when every live source is unreachable
// (offline, rate-limited, or blocked by a network policy) so the dashboard
// still renders and is explorable. Always flagged with `demo: true` in the API
// response and surfaced with a banner in the UI — never presented as live.

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
  { symbol: "BTC", name: "Bitcoin", kind: "crypto", price: 71850, change24h: 4.2, sources: ["Reddit", "CoinGecko Trending"], score: 41.5, seed: 7, drift: 0.35 },
  { symbol: "NVDA", name: "NVIDIA", kind: "stock", price: 128.4, change24h: 3.1, sources: ["Reddit", "Stocktwits"], score: 38.2, seed: 13, drift: 0.25 },
  { symbol: "TSLA", name: "Tesla", kind: "stock", price: 246.1, change24h: -2.6, sources: ["Reddit", "Stocktwits"], score: 33.9, seed: 21, drift: -0.22 },
  { symbol: "ETH", name: "Ethereum", kind: "crypto", price: 3820, change24h: 5.8, sources: ["Reddit", "CoinGecko Trending"], score: 29.4, seed: 34, drift: 0.5 },
  { symbol: "SOL", name: "Solana", kind: "crypto", price: 182.7, change24h: 8.4, sources: ["CoinGecko Trending"], score: 24.1, seed: 55, drift: 0.7 },
  { symbol: "GME", name: "GameStop", kind: "stock", price: 24.3, change24h: 11.2, sources: ["Reddit", "Stocktwits"], score: 22.8, seed: 89, drift: 0.95 },
  { symbol: "AMD", name: "Advanced Micro Devices", kind: "stock", price: 158.9, change24h: 1.4, sources: ["Stocktwits"], score: 18.6, seed: 144, drift: 0.12 },
  { symbol: "DOGE", name: "Dogecoin", kind: "crypto", price: 0.162, change24h: -3.7, sources: ["Reddit", "CoinGecko Trending"], score: 16.2, seed: 233, drift: -0.3 },
  { symbol: "AAPL", name: "Apple", kind: "stock", price: 214.6, change24h: 0.9, sources: ["Stocktwits"], score: 12.9, seed: 377, drift: 0.08 },
  { symbol: "PLTR", name: "Palantir", kind: "stock", price: 27.8, change24h: 6.3, sources: ["Reddit", "Stocktwits"], score: 11.4, seed: 610, drift: 0.55 },
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
      change7d: s.kind === "crypto" ? s.change24h * 1.6 : null,
      volume: null,
      marketCap: null,
      image: null,
      spark,
      socialScore: s.score,
      mentions: Math.round(s.score / 3),
      watchers: s.sources.includes("Stocktwits") ? Math.round(s.score * 4000) : 0,
      sources: s.sources,
      titles: [],
      sentiment: s.change24h >= 3 ? "bullish" : s.change24h <= -3 ? "bearish" : "neutral",
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    demo: true,
    universeSize: 0,
    counts: { redditSymbols: 0, stocktwits: 0, cryptoTrending: 0 },
    movers,
  };
}
