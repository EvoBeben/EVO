# Finance Thoughts

A portable, static weekly market dashboard with an automatically refreshed quote snapshot.

## Run locally

Serve the repository root with any static server, then open index.html.

Refresh the committed market snapshot manually with Node.js 22 or newer:

    node scripts/fetch-market-data.mjs data/market.json

## Deploy anywhere

The repository has no framework or host lock-in. Point GitHub Pages, Cloudflare Pages, Vercel, Netlify, or any static host at the repository root. index.html is the entry point.

The GitHub Actions workflow refreshes data/market.json during US-market hours on weekdays and can also be run manually. Scheduled workflows run from the repository's default branch, so merge the portability branch before relying on the schedule.

Quotes come from Yahoo Finance's public chart endpoint, may be delayed, and are shown for context only. The archived weekly analysis is unchanged and is not investment advice.
EVO Ai
