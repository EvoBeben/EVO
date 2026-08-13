# Weekly stock sheet — settled parameters

Handoff spec for continuing this work in a new session. The deliverable is built
and pushed on `claude/stock-sheet-top-10-ajc6mi`; only the last item is outstanding.

## Deliverable

Two artefacts, same source file:

- `stock-sheet-2026-07-24.html` — responsive web page, published as an Artifact
- `stock-sheet-2026-07-24.pdf` — rendered from the same file via headless Chromium

## Content

- **Week of 27–31 July 2026, complete** — all five sessions traded, the Fed has
  decided and all four megacap prints are in. Compiled Saturday 1 August.
- **59 sources**, numbered and grouped, listed on the sheet itself
- **Reddit and social held strictly separate** — own view, own source group
  (R1–R6), never a source for any price figure
- **The week's movers**, ten up and ten down. Figures mix full-week and
  single-session moves because only Microsoft and Amazon had full-week numbers
  published; every row states its own basis and the board says so
- **How the ten resolved** — the forward board this sheet ran on the Monday,
  marked against what actually happened, plus a 3–7 August look-ahead
- Macro backdrop, status view, crypto top ten, social layer, method, data notes

## Removed

The 7-day / 30-day price trails and their split slope charts were removed at the
user's request and the sheet consolidated. The provenance-marking convention they
introduced (`●` averaged, `◐` single source or derived, `○` not sourced) survives
and is still applied to every soft figure.

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

## Documented limitation — daily price series

No daily close series is reachable from this environment: direct HTTP to Yahoo,
Stooq, Nasdaq, Alpha Vantage, FMP and Twelve Data is refused by the egress policy
(`CONNECT` 403), WebFetch returns 403 on every finance host, and WebSearch yields
roughly one approximate figure per query. Every price on the sheet is therefore a
published figure with its own as-of stamp, and anything unsourced reads `n/a`.

If a future session can reach `query1.finance.yahoo.com` or `stooq.com`, verify
with:

```
curl -sS "https://query1.finance.yahoo.com/v8/finance/chart/TSLA?range=1mo&interval=1d"
```
