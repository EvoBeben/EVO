# Weekly stock sheet — settled parameters

Handoff spec for continuing this work in a new session. The deliverable is built
and pushed on `claude/stock-sheet-top-10-ajc6mi`; only the last item is outstanding.

## Deliverable

Two artefacts, same source file:

- `stock-sheet-2026-07-24.html` — responsive web page, published as an Artifact
- `stock-sheet-2026-07-24.pdf` — rendered from the same file via headless Chromium

## Content

- **Week of 27–31 July 2026, in progress** — Monday has closed, four sessions have
  not. Compiled after the Monday 27 July close.
- **56 sources**, numbered and grouped, listed on the sheet itself
- **Reddit and social held strictly separate** — its own view, its own source
  group (R1–R6), never a source for any price figure
- **Monday's movers**, ten advances and ten declines, each with price where
  published, single-session percentage, catalyst and date chip. Bars share one
  0–40% scale
- **Ten to watch** — the Fed and the week's reports as a forward-looking board,
  carrying no prices, plus the week day by day
- Macro backdrop, status view, crypto top ten, social layer, method, data notes

## Price trails

- Every mover row carries a **7 day** and **30 day** figure
- Data is **merged from multiple vendor snapshots and averaged** where sources
  reported the same window and disagreed — this was an explicit instruction
- Every cell marked with provenance: `●` averaged across 2+ sources,
  `◐` single source or derived, `○` not sourced (left as `n/a`, never estimated)
- A **source log** before the reference list states the merge/average method and
  its limitations (non-uniform as-of dates, two stale windows)

## Charts

- Trail area **split left/right**: 7 day on the left, 30 day on the right
- Currently **net-change slopes** — flat at period start, ending at the reported
  return, with area fill and emphasised endpoint
- Shared **±40%** vertical scale; four cells exceed it (UTZ both windows, LESL
  both) and carry an arrowhead, with the true figure printed alongside
- Headline mover bars share a separate 0–90% scale
- Colour is never the only encoding — every value keeps its sign and printed number

## Presentation — app shell

- **Lead screen** is a hub: masthead, then ten large buttons in a vertical list,
  one per section. Each button carries an index, name, teaser and a live key
  figure lifted from its section, so the list reads as a summary in itself.
  Each section owns one low-chroma hue, shown as a left rail and hover wash;
  semantic green and red stay reserved for direction.
- **Clicking enters that section** as a full composition: a hero band in the
  section hue with eyebrow, oversized display headline and a lead figure, then
  the existing components unchanged. A bottom bar gives index, prev and next.
- **Routing is hash-based** (`#crypto`), so deep links and browser back both
  work. Views are only hidden once JS adds `html.js`, so with JS off the page
  degrades to the continuous sheet it used to be.
- **Keyboard**: Esc to the hub, arrows between sections; focus moves to the
  section heading on navigate.
- **Dark** in print; theme-aware on screen. Print tokens are raised in
  specificity so they beat the `data-theme` attribute.
- **PDF skips the hub and compiles the sections into pages** — A4 portrait,
  each section starting a fresh page, 12 pages total. Long sections (movers,
  sources) flow onto a second page, which is expected.
- **Fluid type** throughout: `--fs-*` clamp tokens interpolate with viewport
  width so the sheet reflows smoothly rather than jumping at the breakpoint.
  The phone end of the scale is deliberately raised, not lowered.
- Print CSS states its layout explicitly — the print layout viewport is *not*
  the page box width, so `max-width` queries never match there.

## Status

**Complete.** Built from the data reachable in this environment.

## Documented limitation — per-day series

Real per-day lines (7 and 30 points, each day averaged across sources) were
requested and could not be built. No daily closes were reachable:

- Direct HTTP to Yahoo, Stooq, Nasdaq, Alpha Vantage, FMP and Twelve Data was
  refused by the egress policy at the proxy (`CONNECT` 403)
- WebFetch returned 403 on every finance host tried (stockanalysis, macrotrends,
  slickcharts, WSJ, financecharts, stockinvest, nasdaq.com, companiesmarketcap)
- WebSearch returns roughly one approximate figure per query — often intraday
  rather than a settled close — against a 460-point requirement

Interpolating between the two known endpoints was rejected deliberately: evenly
spaced points on a straight line carry no information the slope does not already
carry, while looking like a real price history. The panels therefore draw only
what is known, and the source log says so on the sheet itself.

If a future session can reach `query1.finance.yahoo.com` or `stooq.com`, all 460
closes come down in about 20 requests. Verify first with:

```
curl -sS "https://query1.finance.yahoo.com/v8/finance/chart/TSLA?range=1mo&interval=1d"
```

Then pull 23 trading days (24 Jun – 24 Jul 2026) for all 20 tickers, average
where sources disagree, and redraw both panels. Note a 30-point line in a ~90px
panel is ~3px per point — daily detail pays off on the 7 day side; weekly points
may read better on the 30 day side.
