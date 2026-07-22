// EVO Market Trends Update — builds a 5-page, print-ready briefing from the same
// /api/dashboard payload the live dashboard uses. Vanilla JS + canvas charts.
"use strict";

const SERIES = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6"];
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// ---------- formatting ----------
const fmtPrice = (v) => v == null ? "—"
  : v >= 1000 ? "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 })
  : v >= 1 ? "$" + v.toLocaleString("en-US", { maximumFractionDigits: 2 })
  : v >= 0.01 ? "$" + v.toFixed(4) : "$" + v.toPrecision(2);
const fmtPct = (v) => v == null || Number.isNaN(v) ? "—" : (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
const fmtBig = (v) => {
  if (v == null) return "—";
  for (const [s, n] of [["T", 1e12], ["B", 1e9], ["M", 1e6], ["K", 1e3]])
    if (Math.abs(v) >= n) return "$" + (v / n).toFixed(1) + s;
  return "$" + v;
};
const cls = (v) => (v >= 0 ? "up" : "down");
const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// hex -> rgba
function hexA(hex, a) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

// ---------- HiDPI canvas ----------
function setup(canvas, h) {
  const dpr = 2;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const hh = h || Math.max(1, Math.floor(rect.height));
  canvas.width = w * dpr; canvas.height = hh * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h: hh };
}

function sparkline(canvas, data, color) {
  const { ctx, w, h } = setup(canvas);
  ctx.clearRect(0, 0, w, h);
  const pts = (data || []).filter((v) => v != null && !Number.isNaN(v));
  if (pts.length < 2) return;
  const min = Math.min(...pts), max = Math.max(...pts), pad = 3, span = max - min || 1;
  const X = (i) => pad + (i / (pts.length - 1)) * (w - pad * 2);
  const Y = (v) => h - pad - ((v - min) / span) * (h - pad * 2);
  ctx.beginPath(); ctx.moveTo(X(0), Y(pts[0]));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(X(i), Y(pts[i]));
  ctx.lineTo(X(pts.length - 1), h - pad); ctx.lineTo(X(0), h - pad); ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, hexA(color, 0.22)); g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.moveTo(X(0), Y(pts[0]));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(X(i), Y(pts[i]));
  ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.lineJoin = "round"; ctx.stroke();
}

function combinedChart(canvas, series) {
  const { ctx, w, h } = setup(canvas);
  ctx.clearRect(0, 0, w, h);
  const padL = 34, padR = 8, padT = 8, padB = 16, plotW = w - padL - padR, plotH = h - padT - padB;
  const active = series.filter((s) => s.norm.length >= 2);
  if (!active.length) return;
  const maxLen = Math.max(...active.map((s) => s.norm.length));
  let lo = Infinity, hi = -Infinity;
  for (const s of active) for (const v of s.norm) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const pd = (hi - lo) * 0.08 || 1; lo -= pd; hi += pd;
  const X = (i) => padL + (i / (maxLen - 1)) * plotW;
  const Y = (v) => padT + (1 - (v - lo) / (hi - lo)) * plotH;
  ctx.font = "9px " + css("--font"); ctx.textBaseline = "middle"; ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const val = lo + ((hi - lo) * i) / 4, y = Y(val);
    ctx.strokeStyle = css("--hair"); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillStyle = css("--muted"); ctx.fillText(val.toFixed(0), padL - 5, y);
  }
  if (100 >= lo && 100 <= hi) {
    ctx.strokeStyle = css("--line"); ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(padL, Y(100)); ctx.lineTo(w - padR, Y(100)); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const s of active) {
    ctx.beginPath();
    s.norm.forEach((v, i) => {
      const px = X(i * (maxLen - 1) / (s.norm.length - 1));
      i === 0 ? ctx.moveTo(px, Y(v)) : ctx.lineTo(px, Y(v));
    });
    ctx.strokeStyle = s.color; ctx.lineWidth = 1.6; ctx.lineJoin = "round"; ctx.stroke();
  }
}

// Fear & Greed semicircle gauge
function drawGauge(canvas, value) {
  const { ctx, w, h } = setup(canvas);
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h - 8, r = Math.min(w / 2 - 8, h - 16);
  const stops = ["#d03b3b", "#eb6834", "#eda100", "#7cc24a", "#1baf7a"];
  const segs = stops.length;
  for (let i = 0; i < segs; i++) {
    const a0 = Math.PI + (i / segs) * Math.PI, a1 = Math.PI + ((i + 1) / segs) * Math.PI;
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.lineWidth = 12; ctx.strokeStyle = stops[i]; ctx.stroke();
  }
  const ang = Math.PI + (Math.max(0, Math.min(100, value)) / 100) * Math.PI;
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(ang) * (r - 4), cy + Math.sin(ang) * (r - 4));
  ctx.lineWidth = 2.5; ctx.strokeStyle = css("--ink"); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fillStyle = css("--ink"); ctx.fill();
}

// ---------- helpers ----------
function normalize(spark) {
  const pts = (spark || []).filter((v) => v != null && !Number.isNaN(v));
  if (pts.length < 2) return [];
  const base = pts[0] || 1;
  return pts.map((v) => (v / base) * 100);
}
function srcBadge(s) {
  const short = { "CoinGecko Trending": "CG-Trend", "Hacker News": "HN", Stocktwits: "Stocktwits", Reddit: "Reddit", Binance: "Binance" };
  return `<span class="src-badge">${esc(short[s] || s)}</span>`;
}
const now = () => new Date();
const dateStr = (d) => d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
const timeStr = (d) => d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

const TOTAL_PAGES = 7;
function head(page, total) {
  return `<div class="rhead">
    <span class="logo">EVO</span>
    <div class="htxt"><h1>Market Trends Update</h1><p>Top movers ranked by live social-media momentum</p></div>
    <div class="hmeta">Generated ${esc(dateStr(now()))}<br/>${esc(timeStr(now()))} · Page ${page} of ${total}</div>
  </div>`;
}
function foot() {
  return `<div class="rfoot"><span>EVO · Day Trader Trends</span>
    <span>For research only — not financial advice</span>
    <span>github.com/sbantog720/EVO</span></div>`;
}

// ---------- page builders ----------
function pageCover(d) {
  const m = d.movers;
  const withChg = m.filter((x) => x.change24h != null);
  const avg = withChg.length ? withChg.reduce((a, x) => a + x.change24h, 0) / withChg.length : 0;
  const gainers = withChg.filter((x) => x.change24h >= 0).length;
  const losers = withChg.length - gainers;
  const byMove = [...withChg].sort((a, b) => b.change24h - a.change24h);
  const topGain = byMove[0], topLoss = byMove[byMove.length - 1];
  const top3 = m.slice(0, 3);
  const fg = d.market && d.market.fearGreed;
  const modeTag = d.demo ? `<span class="mode-tag mode-demo">Demo data</span>` : `<span class="mode-tag mode-live">Live data</span>`;

  const names = top3.map((x) => x.symbol).join(", ");
  const summary = `Trading attention is concentrating in <b>${esc(names)}</b>. Across the ten most-discussed assets the average 24-hour move is <b>${fmtPct(avg)}</b> (${gainers} up, ${losers} down). The strongest move belongs to <b>${esc(topGain.symbol)}</b> at ${fmtPct(topGain.change24h)}, while <b>${esc(topLoss.symbol)}</b> lags at ${fmtPct(topLoss.change24h)}.${fg ? ` Market sentiment reads <b>${esc(fg.label)}</b> (${fg.value}/100) on the Crypto Fear &amp; Greed Index.` : ""}`;

  return `<section class="page">
    ${head(1, TOTAL_PAGES)}
    <div class="page-body">
      <div class="cover-hero">
        <div class="kicker">Daily Briefing ${modeTag}</div>
        <h2>Where the market's<br/>attention is today</h2>
        <div class="when">${esc(dateStr(now()))} · ${esc(timeStr(now()))}</div>
      </div>

      <div class="summary"><h3>Executive summary</h3><p>${summary}</p></div>

      <div class="statrow">
        <div class="stat"><div class="l">Tracked movers</div><div class="v">${m.length}</div><div class="s">${gainers} up · ${losers} down</div></div>
        <div class="stat"><div class="l">Avg 24h move</div><div class="v ${cls(avg)}">${fmtPct(avg)}</div><div class="s">across the top 10</div></div>
        <div class="stat"><div class="l">Top by buzz</div><div class="v">${esc(m[0].symbol)}</div><div class="s">score ${m[0].socialScore}</div></div>
        <div class="stat"><div class="l">Biggest move</div><div class="v ${cls(topGain.change24h)}">${fmtPct(topGain.change24h)}</div><div class="s">${esc(topGain.symbol)}</div></div>
      </div>

      ${fg ? `<div class="gauge">
        <canvas class="dial" id="gauge"></canvas>
        <div class="ginfo"><div class="gl">Crypto Fear &amp; Greed Index</div>
          <div class="gv">${fg.value}<span style="font-size:12px;color:var(--muted)"> / 100</span></div>
          <div class="gc">${esc(fg.label)}</div>
          <p>A market-wide sentiment gauge. Extreme greed can signal froth; extreme fear can signal capitulation. Use as context, not a trigger.</p>
        </div></div>` : ""}

      <h3 class="sec">Top 3 to watch</h3>
      <div class="callouts">
        ${top3.map((x, i) => `<div class="callout">
          <span class="rank">${i + 1}</span><span class="co-sym">${esc(x.symbol)}</span>
          <span class="co-text">${esc(x.name)} · buzz score ${x.socialScore} · ${(x.sources || []).length} source${x.sources.length === 1 ? "" : "s"} · ${esc(x.sentiment)}</span>
          <span class="co-chg ${cls(x.change24h)}">${fmtPct(x.change24h)}</span></div>`).join("")}
      </div>
    </div>
    ${foot()}
  </section>`;
}

function pageTable(d) {
  const rows = d.movers.map((x, i) => `<tr>
    <td class="rank">${i + 1}</td>
    <td><div class="sym">${esc(x.symbol)}</div><div class="nm">${esc(x.name)}</div></td>
    <td><span class="kindtag">${x.kind === "crypto" ? "Crypto" : "Stock"}</span></td>
    <td class="num">${fmtPrice(x.price)}</td>
    <td class="num chg ${cls(x.change24h)}">${fmtPct(x.change24h)}</td>
    <td class="num chg ${x.change7d == null ? "" : cls(x.change7d)}">${x.change7d == null ? "—" : fmtPct(x.change7d)}</td>
    <td class="num"><b>${x.socialScore}</b></td>
    <td><div class="src-badges">${(x.sources || []).map(srcBadge).join("")}</div></td>
    <td><span class="sent ${x.sentiment}">${esc(x.sentiment)}</span></td>
  </tr>`).join("");

  return `<section class="page">
    ${head(2, TOTAL_PAGES)}
    <div class="page-body">
      <div class="page-title">Top 10 Social-Trend Movers</div>
      <div class="page-sub">Ranked by weighted social signal, then joined with live price data. 24h and 7d are price changes.</div>
      <table class="movers">
        <thead><tr><th>#</th><th>Asset</th><th>Type</th><th class="num">Price</th><th class="num">24h</th><th class="num">7d</th><th class="num">Buzz</th><th>Sources</th><th>Bias</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <h3 class="sec">Combined movement — indexed to 100 at series start</h3>
      <div class="chartbox">
        <div class="cap">Relative price path of the six strongest movers, rebased so each starts at 100. Diverging lines show who is outperforming.</div>
        <canvas id="combined"></canvas>
        <div class="legend" id="legend"></div>
      </div>
    </div>
    ${foot()}
  </section>`;
}

function pageMomentum(d) {
  const m = d.movers.filter((x) => x.change24h != null);
  const byMove = [...m].sort((a, b) => b.change24h - a.change24h);
  const gainers = byMove.filter((x) => x.change24h >= 0);
  const losers = byMove.filter((x) => x.change24h < 0).reverse();
  const maxAbs = Math.max(1, ...m.map((x) => Math.abs(x.change24h)));

  const bar = (x, color) => {
    const pct = (Math.abs(x.change24h) / maxAbs) * 100;
    return `<div class="row"><span class="bsym">${esc(x.symbol)}</span>
      <span class="track"><span class="fill" style="left:0;width:${pct}%;background:${color}"></span></span>
      <span class="bval ${cls(x.change24h)}">${fmtPct(x.change24h)}</span></div>`;
  };

  // source contribution: how many movers each source touched
  const srcCount = {};
  d.movers.forEach((x) => (x.sources || []).forEach((s) => (srcCount[s] = (srcCount[s] || 0) + 1)));
  const srcRows = Object.entries(srcCount).sort((a, b) => b[1] - a[1]);
  const maxSrc = Math.max(1, ...srcRows.map((r) => r[1]));

  const byBuzz = [...d.movers].sort((a, b) => b.socialScore - a.socialScore).slice(0, 6);
  const maxBuzz = Math.max(1, ...byBuzz.map((x) => x.socialScore));

  return `<section class="page">
    ${head(3, TOTAL_PAGES)}
    <div class="page-body">
      <div class="page-title">Momentum &amp; Social Breakdown</div>
      <div class="page-sub">Who is moving, and where the attention is coming from.</div>

      <div class="split2">
        <div><h3 class="sec">Biggest gainers (24h)</h3><div class="barlist">${gainers.map((x) => bar(x, css("--up"))).join("") || '<div class="mini-note">No gainers.</div>'}</div></div>
        <div><h3 class="sec">Biggest losers (24h)</h3><div class="barlist">${losers.map((x) => bar(x, css("--down"))).join("") || '<div class="mini-note">No losers.</div>'}</div></div>
      </div>

      <div class="split2" style="margin-top:14px">
        <div>
          <h3 class="sec">Most talked about (buzz score)</h3>
          <div class="barlist">${byBuzz.map((x) => `<div class="row"><span class="bsym">${esc(x.symbol)}</span>
            <span class="track"><span class="fill" style="left:0;width:${(x.socialScore / maxBuzz) * 100}%;background:${css("--s1")}"></span></span>
            <span class="bval">${x.socialScore}</span></div>`).join("")}</div>
        </div>
        <div>
          <h3 class="sec">Source contribution</h3>
          <div class="srcbars">${srcRows.map(([s, c]) => `<div class="srow"><span class="sname">${esc(s)}</span>
            <span class="track"><span class="fill" style="width:${(c / maxSrc) * 100}%"></span></span>
            <span class="sct">${c}</span></div>`).join("")}</div>
          <div class="mini-note">Number of top-10 movers each source flagged.</div>
        </div>
      </div>

      <h3 class="sec">Read of the tape</h3>
      <p style="font-size:10px;color:var(--sub);line-height:1.6">
        ${gainers.length >= losers.length
          ? `Breadth is positive — ${gainers.length} of the top ${m.length} movers are green, suggesting risk-on appetite among retail traders today.`
          : `Breadth is negative — ${losers.length} of the top ${m.length} movers are red, suggesting caution or profit-taking among retail traders today.`}
        The most-discussed name, <b>${esc(d.movers[0].symbol)}</b>, is drawing attention from ${(d.movers[0].sources || []).length} of the tracked sources.
      </p>
    </div>
    ${foot()}
  </section>`;
}

function pageReddit(d) {
  const r = (d.social && d.social.reddit) || { subs: [], perSub: {}, tickers: [], posts: [], scanned: 0, subsOk: 0 };
  const tickers = r.tickers || [];
  const maxM = Math.max(1, ...tickers.map((t) => t.mentions));
  const perSub = Object.entries(r.perSub || {}).sort((a, b) => b[1] - a[1]);
  const maxSub = Math.max(1, ...perSub.map((s) => s[1]));

  const tickerRows = tickers.length
    ? tickers.map((t, i) => `<div class="rrow">
        <span class="rr-rank">${i + 1}</span>
        <span class="rr-sym">${esc(t.symbol)}</span>
        <span class="rr-track"><span class="rr-fill" style="width:${(t.mentions / maxM) * 100}%"></span></span>
        <span class="rr-m">${t.mentions}</span>
        <span class="rr-subs">${(t.subs || []).slice(0, 3).map((s) => `<span class="rr-chip">r/${esc(s)}</span>`).join("")}</span>
      </div>`).join("")
    : `<div class="short-empty">No tracked tickers were mentioned in the scanned Reddit posts this run.</div>`;

  const subChips = (r.subs || []).map((s) => `<span class="sub-chip">r/${esc(s)}</span>`).join("");

  const posts = (r.posts || []).slice(0, 8).map((p) => `<div class="rpost">
      <div class="rp-top"><span class="rp-sub">r/${esc(p.sub)}</span>
        <span class="rp-meta">▲ ${Number(p.score).toLocaleString()} · ${Number(p.comments).toLocaleString()} comments</span></div>
      <div class="rp-title">${esc(p.title)}</div>
      <div class="rp-tags">${(p.tickers || []).map((t) => `<span class="rp-tag">${esc(t)}</span>`).join("")}</div>
    </div>`).join("");

  const subBars = perSub.slice(0, 12).map(([s, c]) => `<div class="srow">
      <span class="sname">r/${esc(s)}</span>
      <span class="track"><span class="fill" style="width:${(c / maxSub) * 100}%"></span></span>
      <span class="sct">${c}</span></div>`).join("");

  return `<section class="page">
    ${head(4, TOTAL_PAGES)}
    <div class="page-body">
      <div class="page-title">Reddit Radar</div>
      <div class="page-sub">What retail traders are talking about — ${r.subsOk || (r.subs || []).length} subreddits scanned, ${r.scanned || 0} hot posts parsed for tickers.</div>

      <h3 class="sec">Subreddits scanned (${(r.subs || []).length})</h3>
      <div class="sub-chips">${subChips}</div>

      <div class="reddit-split">
        <div>
          <h3 class="sec">Most-mentioned tickers on Reddit</h3>
          <div class="rlist">${tickerRows}</div>
        </div>
        <div>
          <h3 class="sec">Where the chatter is (mentions per sub)</h3>
          <div class="srcbars">${subBars}</div>
        </div>
      </div>

      <h3 class="sec">Hottest posts mentioning a tracked ticker</h3>
      <div class="rposts">${posts || '<div class="short-note">No notable posts this run.</div>'}</div>

      <div class="short-legend" style="margin-top:10px">
        Tickers are matched three ways: <b>$cashtags</b> (e.g. <span style="font-family:var(--mono)">$TSLA</span>),
        <b>bare uppercase tickers</b> from a known-symbol list (minus common-word stopwords like THE/CEO/YOLO), and
        <b>company/asset names</b> (e.g. “Tesla” → TSLA). Stickied/mod posts are skipped.
      </div>
    </div>
    ${foot()}
  </section>`;
}

// Short-setup score: reward downside (24h + 7d), attention on a falling asset
// (crowded = volatile), and cross-source agreement that it's down.
function shortScore(x) {
  let s = 0;
  if (x.change24h != null && x.change24h < 0) s += Math.min(40, -x.change24h * 4);
  if (x.change7d != null && x.change7d < 0) s += Math.min(25, -x.change7d * 2);
  s += Math.min(20, (x.socialScore || 0) * 0.4);           // attention weight
  if (x.priceSourceCount) s += (x.downConfirms / x.priceSourceCount) * 15; // conviction
  return s;
}
function shortReason(x) {
  const bits = [];
  if (x.change7d != null && x.change7d < 0) bits.push(`down ${fmtPct(x.change7d)} over 7d`);
  else if (x.change24h < 0) bits.push("intraday weakness");
  if (x.priceSourceCount > 1) bits.push(`${x.downConfirms}/${x.priceSourceCount} price sources agree`);
  if ((x.socialScore || 0) >= 20) bits.push("heavy chatter on the drop");
  if (x.sentiment === "bearish") bits.push("bearish bias");
  return bits.slice(0, 3).join(" · ") || "mild pullback";
}

function pageShort(d) {
  // Anything showing downside: 24h negative OR 7d negative.
  const shorts = d.movers
    .filter((x) => (x.change24h != null && x.change24h < 0) || (x.change7d != null && x.change7d < 0))
    .map((x) => ({ ...x, ss: shortScore(x) }))
    .sort((a, b) => b.ss - a.ss);
  const maxSS = Math.max(1, ...shorts.map((x) => x.ss));
  const convLabel = (r) => (r >= 0.72 ? "High" : r >= 0.45 ? "Medium" : "Low");

  const body = shorts.length
    ? `<table class="shorts">
        <thead><tr><th>#</th><th>Asset</th><th class="num">Price</th><th class="num">24h</th><th class="num">7d</th>
          <th class="num">Buzz</th><th>Down-confirm</th><th>Conviction</th><th>Why it screens short</th></tr></thead>
        <tbody>${shorts.map((x, i) => {
          const conv = x.ss / maxSS;
          return `<tr>
            <td class="rank" style="color:var(--muted);font-weight:700">${i + 1}</td>
            <td><span class="sym">${esc(x.symbol)}</span> <span class="nm">${esc(x.name)}</span></td>
            <td class="num">${fmtPrice(x.price)}</td>
            <td class="num chg ${x.change24h == null ? "" : cls(x.change24h)}">${x.change24h == null ? "—" : fmtPct(x.change24h)}</td>
            <td class="num chg ${x.change7d == null ? "" : cls(x.change7d)}">${x.change7d == null ? "—" : fmtPct(x.change7d)}</td>
            <td class="num">${x.socialScore}</td>
            <td>${x.priceSourceCount > 1 ? `<span class="confirm-pill">${x.downConfirms}/${x.priceSourceCount} down</span>` : '<span class="short-note">n/a</span>'}</td>
            <td><span class="conv"><span class="track"><span class="fill" style="width:${Math.round(conv * 100)}%"></span></span><span class="lab">${convLabel(conv)}</span></span></td>
            <td><span class="short-note">${esc(shortReason(x))}</span></td>
          </tr>`;
        }).join("")}</tbody>
      </table>
      <div class="short-legend">
        <b>Down-confirm</b> = how many independent price sources (Binance, CoinPaprika, CoinCap, CoinLore, Bitfinex, Coinbase, CoinGecko) report a 24h decline — higher agreement = a more reliable down-move, not noise.
        <b>Conviction</b> blends downside magnitude (24h + 7d), the amount of social attention on the falling asset, and that cross-source agreement.
        A falling name with <i>high</i> buzz is crowded and volatile — that cuts both ways (squeeze risk).
      </div>`
    : `<div class="short-empty">No assets are screening short right now — every tracked mover is flat-to-up on both the 24h and 7d windows. Breadth is broadly positive today.</div>`;

  return `<section class="page">
    ${head(5, TOTAL_PAGES)}
    <div class="page-body">
      <div class="page-title">Should You Short?</div>
      <div class="page-sub">Every tracked asset that is currently trending down, ranked by how strongly it screens as a short setup.</div>

      <div class="short-caution">
        <b>⚠ Read this first.</b> Short-selling has <b>theoretically unlimited loss</b> and borrow/financing costs, and heavily-discussed
        falling names are exactly the ones prone to violent short squeezes. This screen flags <i>downward momentum + attention</i> — it is
        <b>not</b> a signal to sell short, and nothing here is financial advice.
      </div>

      ${body}
    </div>
    ${foot()}
  </section>`;
}

function pageDetail(d) {
  const top = d.movers.slice(0, 6);
  return `<section class="page">
    ${head(6, TOTAL_PAGES)}
    <div class="page-body">
      <div class="page-title">Per-Asset Detail</div>
      <div class="page-sub">The six most-discussed assets, each with its own price graph and the signals behind its ranking.</div>
      <div class="cards">
        ${top.map((x, i) => `<div class="dcard">
          <div class="dtop"><div><span class="dsym">${esc(x.symbol)}</span> <span class="dname">${esc(x.name)}</span></div>
            <div><span class="dprice">${fmtPrice(x.price)}</span> <span class="chg ${cls(x.change24h)}">${fmtPct(x.change24h)}</span></div></div>
          <canvas data-detail="${i}" data-color="${x.change24h >= 0 ? css("--up") : css("--down")}"></canvas>
          <div class="drow"><span>Buzz score</span><b>${x.socialScore}</b></div>
          <div class="drow"><span>7-day change</span><b class="${x.change7d == null ? "" : cls(x.change7d)}">${x.change7d == null ? "—" : fmtPct(x.change7d)}</b></div>
          <div class="drow"><span>Volume</span><b>${fmtBig(x.volume)}</b></div>
          <div class="drow"><span>Sources</span><b>${(x.sources || []).join(", ")}</b></div>
          <div class="drow"><span>Bias</span><span class="sent ${x.sentiment}">${esc(x.sentiment)}</span></div>
          ${x.titles && x.titles.length ? `<div class="dtitle">“${esc(x.titles[0])}”</div>` : ""}
        </div>`).join("")}
      </div>
    </div>
    ${foot()}
  </section>`;
}

function pageMethod(d) {
  const sources = [
    ["CoinGecko", "Market + trending", "Crypto prices, 24h/7d change, 7-day sparkline, and the trending-search list (a social/search proxy)."],
    ["Binance", "Market (price)", "Broad crypto price + 24h movement universe (USDT pairs); supplies sparklines for coins CoinGecko misses."],
    ["CoinPaprika", "Market (price)", "Crypto price plus 24h and 7d change and market cap across ~2,500 assets."],
    ["CoinCap", "Market (price)", "Crypto price + 24h change breadth; independent cross-check."],
    ["CoinLore", "Market (price)", "Crypto price + 24h/7d change backup for coverage gaps."],
    ["Bitfinex", "Market (price)", "Major-exchange last price + 24h change — an independent exchange read."],
    ["Coinbase", "Market (price)", "US-exchange daily stats used to confirm each crypto mover's move."],
    ["Yahoo Finance", "Market (price)", "Stock price, % change, and intraday sparkline for equities surfaced by social sources."],
    ["Stocktwits", "Social", "Trending stock tickers and watchlist popularity from the Stocktwits community."],
    ["Reddit", "Social", "Ticker mentions across 17 trading/crypto subs (WSB, stocks, StockMarket, investing, Daytrading, swingtrading, options, thetagang, pennystocks, smallstreetbets, Superstonk, CryptoCurrency, CryptoMarkets, SatoshiStreetBets, ethtrader, Bitcoin, altcoin). Matched by cashtag, bare ticker, and company name. See the Reddit Radar page."],
    ["Hacker News", "News / social", "Front-page headlines scanned for tickers and company names (tech & finance attention)."],
    ["Wikipedia", "Attention", "Daily pageviews on an asset's encyclopedia article — a neutral attention gauge."],
    ["Google News", "News", "Recent news-headline volume per asset from Google News search."],
    ["alternative.me", "Sentiment", "Crypto Fear & Greed Index — market-wide sentiment (0 = extreme fear, 100 = extreme greed)."],
  ];
  return `<section class="page">
    ${head(7, TOTAL_PAGES)}
    <div class="page-body">
      <div class="page-title">Methodology, Sources &amp; Disclaimer</div>
      <div class="page-sub">How this report is built and what it can — and can't — tell you.</div>

      <h3 class="sec">How the buzz score works</h3>
      <div class="method">
        <p>Every candidate ticker accumulates a weighted <b>social score</b> from the signal sources. The highest-scoring assets that also have live price data become the ten movers.</p>
        <div class="formula">score = 3.0 × reddit_mentions&nbsp; + 2.5 × hn_mentions&nbsp; + (stocktwits_rank + watchlist_bonus)&nbsp; + coingecko_trending_rank&nbsp; + min(4, 0.5 × news_items)&nbsp; + min(3, wiki_views / 20k)</div>
        <p>Mentions are counted once per post/headline. Price movement (24h/7d) is shown alongside but does <i>not</i> feed the score — buzz measures <b>attention</b>, price measures <b>outcome</b>. All feeds are fetched server-side, merged, scored, and cached for 60 seconds.</p>
      </div>

      <h3 class="sec">Data sources (all free, no API key)</h3>
      <table class="sources">
        <thead><tr><th>Source</th><th>Role</th><th>What it provides</th></tr></thead>
        <tbody>${sources.map(([n, r, w]) => `<tr><td class="snm">${esc(n)}</td><td>${esc(r)}</td><td>${esc(w)}</td></tr>`).join("")}</tbody>
      </table>

      <h3 class="sec">Limitations</h3>
      <ul class="lim">
        <li>Social buzz signals <b>attention and volatility</b>, not direction — high buzz frequently means high risk.</li>
        <li>Cashtag/name parsing is heuristic; obvious noise is filtered by requiring live price data to appear.</li>
        <li>Public endpoints can rate-limit or change; a source may occasionally be missing from a given run.</li>
        <li>Sentiment tags here are derived from price direction, not natural-language analysis of posts.</li>
        ${d.demo ? `<li><b>This report was generated from demo data</b> because live sources were unreachable at run time. Run <span style="font-family:var(--mono)">npm start</span> on an unrestricted connection for live figures.</li>` : ""}
      </ul>

      <div class="disc-box">
        <b>⚠ For research only — not financial advice.</b> Nothing in this document is a recommendation to buy or sell any
        security or digital asset, or a prediction of future prices. Markets are risky and you can lose money. Do your own
        research, consider your risk tolerance, and consult a licensed financial professional before trading.
      </div>
    </div>
    ${foot()}
  </section>`;
}

// ---------- render ----------
function draw(d) {
  const fg = d.market && d.market.fearGreed;
  if (fg) drawGauge(document.getElementById("gauge"), fg.value);

  const series = d.movers
    .map((m, i) => ({ symbol: m.symbol, norm: normalize(m.spark), color: css(SERIES[i % SERIES.length]) }))
    .filter((s) => s.norm.length >= 2).slice(0, 6);
  combinedChart(document.getElementById("combined"), series);
  document.getElementById("legend").innerHTML = series
    .map((s) => `<span class="item"><span class="sw" style="background:${s.color}"></span>${esc(s.symbol)}</span>`).join("");

  d.movers.slice(0, 6).forEach((m, i) => {
    const c = document.querySelector(`canvas[data-detail="${i}"]`);
    if (c) sparkline(c, m.spark, c.dataset.color);
  });
}

async function main() {
  let d;
  try {
    const res = await fetch("/api/dashboard");
    if (!res.ok) throw new Error("HTTP " + res.status);
    d = await res.json();
  } catch (err) {
    document.getElementById("report").innerHTML =
      `<div class="loading">Could not load data: ${esc(err.message)}. Is the server running?</div>`;
    return;
  }
  document.getElementById("tb-mode").textContent = d.demo ? "demo data" : "live data";
  document.getElementById("report").innerHTML =
    pageCover(d) + pageTable(d) + pageMomentum(d) + pageReddit(d) + pageShort(d) + pageDetail(d) + pageMethod(d);
  // canvases need a layout pass before drawing
  requestAnimationFrame(() => requestAnimationFrame(() => draw(d)));
  window.__reportReady = true;
}
main();
