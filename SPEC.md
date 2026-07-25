# Weekly stock sheet — settled parameters

Handoff spec for continuing this work in a new session. The deliverable is built
and pushed on `claude/stock-sheet-top-10-ajc6mi`; only the last item is outstanding.

## Deliverable

Two artefacts, same source file:

- `stock-sheet-2026-07-24.html` — responsive web page, published as an Artifact
- `stock-sheet-2026-07-24.pdf` — rendered from the same file via headless Chromium

## Content

- Week ending **Friday 24 July 2026**, US equities, summary format
- **50 sources**, numbered and grouped, listed on the sheet itself
- **Reddit and social held strictly separate** — its own panel, its own source
  group (R1–R8), and never a source for any price figure
- **Top 10 advances and top 10 declines**, ranked, each with ticker, company,
  headline single-session move, magnitude bar, catalyst date and a one-line driver
- Macro backdrop cards, a "same week, both lists" callout, methodology note

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

## Presentation

- **Dark** — dark palette in print, theme-aware on the web (print tokens are
  raised in specificity so they beat the `data-theme` attribute)
- PDF is **one continuous scrollable page**, 120mm wide, height measured from the
  rendered output (no pagination, no trailing dead space)
- Web layout is **phone-first below 700px**: single column, type scales up, no
  horizontal overflow at 390px
- Print CSS states its layout explicitly — the print layout viewport is *not* the
  page box width, so `max-width` media queries do not apply to it

## Outstanding

Replace the two-endpoint slopes with **real per-day lines** — 7 points and 30
points, each day averaged across every available source.

Blocked in the original session: no daily closes were reachable. Direct HTTP to
Yahoo/Stooq/Nasdaq/AlphaVantage/FMP/TwelveData was refused by the egress policy,
WebFetch returned 403 on every finance host tried, and WebSearch yields roughly
one approximate price per query against a 460-point requirement.

Needs `query1.finance.yahoo.com` or `stooq.com` reachable — either gives all
460 closes in about 20 requests. Verify with:

```
curl -sS "https://query1.finance.yahoo.com/v8/finance/chart/TSLA?range=1mo&interval=1d"
```

If that returns JSON, pull 23 trading days (24 Jun – 24 Jul 2026) for all 20
tickers, average across sources where they disagree, and redraw both panels.
Note a 30-point line in a ~90px panel is ~3px per point — daily detail pays off
on the 7 day side; weekly points may read better on the 30 day side.
