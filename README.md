# Finance Thoughts

A portable weekly market dashboard with an on-demand quote snapshot.

## Run locally

Serve the repository root with any static server, then open index.html.

Refresh the committed market snapshot manually with Node.js 22 or newer:

    node scripts/fetch-market-data.mjs data/market.json

## Deploy anywhere

The repository has no framework or host lock-in. Point GitHub Pages, Cloudflare Pages, Vercel, Netlify, or any static host at the repository root. index.html is the entry point.

The hosted app's Refresh button requests current data on demand. On a fully static host, the site reads data/market.json; a repository owner can update that snapshot manually from the Actions tab by running the Refresh market data workflow, or by running the Node.js command above. There is no hourly schedule.

Quotes come from Yahoo Finance's public chart endpoint, may be delayed, and are shown for context only. The archived weekly analysis is unchanged and is not investment advice.
