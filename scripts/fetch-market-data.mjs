import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const WATCHLIST = [
  ["MSFT", "Microsoft"],
  ["AMZN", "Amazon"],
  ["GOOGL", "Alphabet"],
  ["NVDA", "Nvidia"],
  ["META", "Meta"],
  ["AAPL", "Apple"],
  ["QCOM", "Qualcomm"],
  ["MU", "Micron"],
  ["ASML", "ASML"],
  ["BA", "Boeing"],
  ["XOM", "ExxonMobil"],
  ["CVX", "Chevron"],
];

const USER_AGENT =
  "Mozilla/5.0 (compatible; FinanceThoughts/1.0; +https://github.com/EvoBeben/EVO)";

function latestNumber(values = []) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(values[index])) return values[index];
  }
  return null;
}

export async function fetchQuote(symbol, name) {
  const url = new URL(
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
  );
  url.searchParams.set("range", "5d");
  url.searchParams.set("interval", "1d");

  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!response.ok) throw new Error(`${symbol}: HTTP ${response.status}`);

  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  if (!result) throw new Error(`${symbol}: quote unavailable`);

  const meta = result.meta ?? {};
  const closes = (result.indicators?.quote?.[0]?.close ?? []).filter(Number.isFinite);
  const price = Number.isFinite(meta.regularMarketPrice)
    ? meta.regularMarketPrice
    : latestNumber(closes);
  const previousClose = Number.isFinite(meta.chartPreviousClose)
    ? meta.chartPreviousClose
    : closes.length > 1
      ? closes[closes.length - 2]
      : null;
  const change =
    Number.isFinite(price) && Number.isFinite(previousClose)
      ? price - previousClose
      : null;
  const changePercent =
    Number.isFinite(change) && Number.isFinite(previousClose) && previousClose !== 0
      ? (change / previousClose) * 100
      : null;

  return {
    symbol,
    name: meta.longName ?? meta.shortName ?? name,
    currency: meta.currency ?? "USD",
    exchange: meta.fullExchangeName ?? meta.exchangeName ?? null,
    price,
    previousClose,
    change,
    changePercent,
    marketTime: Number.isFinite(meta.regularMarketTime)
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : null,
  };
}

export async function fetchMarketData() {
  const settled = await Promise.allSettled(
    WATCHLIST.map(([symbol, name]) => fetchQuote(symbol, name)),
  );
  const quotes = settled
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const errors = settled
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason?.message ?? String(result.reason));

  if (!quotes.length) throw new Error(`No quotes returned: ${errors.join("; ")}`);

  return {
    asOf: new Date().toISOString(),
    source: "Yahoo Finance chart endpoint",
    delayed: true,
    quotes,
    errors,
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  const outputPath = resolve(process.argv[2] ?? "public/data/market.json");
  const data = await fetchMarketData();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`Wrote ${data.quotes.length} quotes to ${outputPath}`);
}

