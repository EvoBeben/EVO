# EVO — Day Trader Trends Dashboard

A single-page dashboard for day traders: it ranks the **top 10 assets by live
social-media momentum** and shows **many price graphs in one view** — a per-row
sparkline, an overlaid combined movement chart, and a per-asset graph grid.

> ⚠️ **For research only — not financial advice.** These trends indicate where
> attention and volatility are concentrating, not what you should buy or sell.
> Do your own research and manage risk.

![dashboard](https://img.shields.io/badge/stack-zero--dependency%20Node-informational)

## What it does

- **Top 10 social-trend movers** — a ranked list combining social signals from
  multiple sources into one *social score* per asset (crypto **and** stocks),
  each with price, 24h % change, source badges, and a mini price chart.
- **Combined movement chart** — the strongest movers overlaid on one axis,
  indexed to 100 at series start so you can compare *relative* moves. Hover for a
  crosshair + tooltip; click legend chips to toggle series.
- **Per-asset graph grid** — every mover's own chart, so multiple website-sourced
  graphs live together in one view.
- **Auto-refresh** every 60s, light/dark themes, fully responsive.

## Data sources (all free, no API key)

| Source | Used for |
|---|---|
| **Market / price** | |
| [CoinGecko](https://www.coingecko.com/en/api) `/coins/markets`, `/search/trending` | crypto prices, 24h/7d change, 7-day sparkline, search-trend signal |
| [Binance](https://binance-docs.github.io/apidocs/spot/en/) `/ticker/24hr`, `/klines` | broad crypto price + movement universe; sparkline backfill |
| [CoinPaprika](https://api.coinpaprika.com) `/tickers` | crypto price + 24h/7d change + market cap (~2,500 assets) |
| [CoinCap](https://docs.coincap.io) `/assets` | crypto price + 24h change breadth / cross-check |
| [CoinLore](https://www.coinlore.com/cryptocurrency-data-api) `/tickers` | crypto price + 24h/7d change backup |
| [Bitfinex](https://docs.bitfinex.com) `/tickers` | major-exchange last price + 24h change |
| [Coinbase](https://docs.cdp.coinbase.com) `/products/{sym}/stats` | US-exchange daily stats (per-mover confirmation) |
| [Yahoo Finance](https://finance.yahoo.com) `/v8/finance/chart` | stock price, % change, intraday sparkline |
| **Social / news / attention** | |
| [Stocktwits](https://stocktwits.com) `/trending/symbols` | trending stock tickers + watchlist popularity |
| [Reddit](https://www.reddit.com) `/hot` × 17 subs | ticker mention counts (see below) |
| [Hacker News](https://hn.algolia.com/api) `/search?tags=front_page` | front-page headline mentions |
| [Wikipedia](https://wikimedia.org/api/rest_v1/) `/metrics/pageviews` | daily pageviews on an asset's article (attention proxy) |
| [Google News](https://news.google.com) `/rss/search` | recent news-headline volume per asset |
| **Sentiment** | |
| [alternative.me](https://alternative.me/crypto/fear-and-greed-index/) `/fng` | Crypto Fear & Greed Index (market-wide gauge) |

Reddit subs scanned (17): **wallstreetbets, stocks, StockMarket, investing,
Daytrading, swingtrading, options, thetagang, pennystocks, smallstreetbets,
Superstonk, CryptoCurrency, CryptoMarkets, SatoshiStreetBets, ethtrader, Bitcoin,
altcoin**.

All sources are fetched **server-side** (so there are no browser CORS issues),
merged, scored, and cached for 60 seconds to respect rate limits. If a source is
temporarily down it's skipped gracefully rather than breaking the dashboard.
Multiple independent price sources also power the **cross-source down-confirmation**
in the report's *Should You Short?* section.

### How the social score works

Each candidate ticker accumulates a weighted score:

- **Reddit** — 3 points per hot-post mention (counted once per post)
- **Hacker News** — 2.5 points per front-page headline mention
- **Stocktwits** — up to ~6 for trending rank + a bonus for watchlist size
- **CoinGecko Trending** — up to ~5 by trending rank
- **Google News** — up to 4 by recent headline volume
- **Wikipedia** — up to 3 by pageview attention

Tickers are matched three ways: **`$cashtags`** (`$TSLA`), **bare uppercase
tickers** from a known-symbol list (minus common-word stopwords like THE/CEO/YOLO),
and **company/asset names** (e.g. "Tesla" → `TSLA`). The top candidates are then
joined with live price data; the 10 highest-scoring assets with usable price data
become the movers.

## Market Trends Update (7-page report)

Open **`/report`** (or click **📄 Report** in the dashboard) for a print-ready,
7-page briefing generated from the same live data:

1. **Cover** — executive summary, headline stats, Crypto Fear & Greed gauge, top-3 to watch
2. **Top 10 movers** — full table (price, 24h/7d, buzz, sources, bias) + combined indexed chart
3. **Momentum & social breakdown** — gainers/losers, most-discussed, source contribution
4. **Reddit Radar** — most-mentioned tickers, mentions per sub, hottest posts, and the matching method
5. **Should You Short?** — every asset trending down, ranked by short-setup conviction with cross-source down-confirmation
6. **Per-asset detail** — a card per top mover with its own graph and signals
7. **Methodology, sources & disclaimer**

Click **⭳ Save as PDF** (or your browser's Print → Save as PDF) to export it — the
CSS lays it out as exactly seven A4 pages.

## Run it

Requires **Node.js 18+** (uses the built-in `fetch` and HTTP server — **no
`npm install` needed**).

```bash
npm start          # or: node server.js
# open http://localhost:3000
```

Change the port with `PORT=8080 npm start`.

### Demo mode

If **every** live source is unreachable (offline, rate-limited, or blocked by a
network policy), the dashboard automatically serves a clearly-labeled **demo
dataset** so the UI is never blank. A banner makes this explicit — it is never
presented as live data. Run on an unrestricted connection for live data.

## Project layout

```
server.js       # zero-dependency Node server: source adapters, scoring, cache, API + static
demo-data.js    # labeled offline fallback dataset
public/
  index.html    # dashboard shell
  styles.css    # theme-aware styling (light/dark)
  app.js        # rendering + hand-drawn canvas charts (sparklines, combined chart, hover)
  report.html   # 5-page Market Trends Update shell
  report.css    # print-first styling (five fixed A4 pages)
  report.js     # builds the report from /api/dashboard (gauge, table, bars, cards)
```

## Notes & limits

- Not financial advice; social buzz is a *volatility/attention* signal, not a
  price prediction. High buzz often means high risk.
- Public endpoints can rate-limit or change; the 60s cache and graceful
  degradation keep the app resilient, but a source may occasionally be missing.
- Cashtag parsing is heuristic — a `$WORD` in a Reddit title is treated as a
  ticker; obvious noise is filtered by requiring live price data to appear.
